/* =========================================================
   The Grader: autograding mock calls, one call at a time
   ---------------------------------------------------------
   A second Durable Object with a queue of calls to grade, so a long AI
   request never holds up the Switchboard (ringing, signaling, timers).
   The Switchboard decides when a call is ready (src/switchboard.js,
   scheduleGrade): after the call ends, once its recording for grading
   is in and the trainee has submitted the note, or after a short wait
   for either. The Grader's alarm then grades the call:
     • the recording as 8 kHz WAV (both voices; the console or the
       practice phone uploads it to KV as voip:wav:<call id>), so the AI
       can hear tone, clarity, fillers and dead air;
     • the program's Mock Calls Metrics for the call's line, the call's
       checklist, the case file, the trainee's note and what the phone
       measured (rings, holds, transfers, dead air);
   and hands the scorecard back to the Switchboard (applyAutograde).
   A failed attempt is retried twice (1 and 2 minutes later).
   ========================================================= */
import { DurableObject } from 'cloudflare:workers';
import { generate, parseJson, hasAI } from './gemini.js';
import { gradePrompt, cleanGrade } from './prompts.js';

export const GRADE_AUDIO = 'voip:wav:';
const TRIES = 3;

function b64(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const board = (env) => env.SWITCHBOARD.get(env.SWITCHBOARD.idFromName('main'));

export async function runGrade(env, id) {
  const sb = board(env);
  const r = await sb.getCall(id);
  if (!r || r.status !== 'ended') return;
  if (!hasAI(env)) { await sb.autogradeState(id, { state: 'off', error: 'No AI key is set on this site (GEMINI_API_KEY5 …).' }); return; }
  await sb.autogradeState(id, { state: 'grading' });
  const wav = env.LSH_KV && r.data.gradeAudio ? await env.LSH_KV.get(GRADE_AUDIO + id, { type: 'arrayBuffer' }) : null;
  const useAudio = !!(wav && wav.byteLength > 1000);
  const s = r.data.scenario;
  const call = { metrics: r.data.metrics, note: r.data.note, transcript: r.data.transcript, audioStats: r.data.audioStats, mode: r.mode };
  const p = gradePrompt(s, call, { audio: useAudio });
  const parts = useAudio ? [{ inlineData: { mimeType: 'audio/wav', data: b64(wav) } }, { text: p.prompt }] : [{ text: p.prompt }];
  const g = await generate(env, { system: p.system, parts, json: true, maxTokens: 8000 });
  const grade = cleanGrade(s, parseJson(g.text));
  if (!grade) throw new Error('The AI\'s answer couldn\'t be read.');
  grade.model = g.model;
  grade.fromAudio = useAudio;
  await sb.applyAutograde(id, grade);
}

export class Grader extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, due INTEGER, tries INTEGER DEFAULT 0, state TEXT, error TEXT, updated INTEGER)`);
  }

  // Grade call `id` at `due` (now if it's in the past). Asking again moves the time; a call being
  // graded right now is graded again afterwards.
  async enqueue(id, due) {
    const at = Math.max(Date.now(), Number(due) || 0);
    const cur = this.sql.exec('SELECT * FROM jobs WHERE id = ?', id).toArray()[0];
    if (cur) this.sql.exec(`UPDATE jobs SET due = ?, state = 'queued', tries = 0, error = NULL, updated = ? WHERE id = ?`, at, Date.now(), id);
    else this.sql.exec(`INSERT INTO jobs (id, due, tries, state, updated) VALUES (?, ?, 0, 'queued', ?)`, id, at, Date.now());
    await this.arm();
    return { due: at };
  }

  async arm() {
    const n = this.sql.exec(`SELECT MIN(due) AS due FROM jobs WHERE state = 'queued'`).toArray()[0].due;
    if (!n) return;
    const cur = await this.ctx.storage.getAlarm();
    const at = Math.max(n, Date.now() + 50);
    if (!cur || cur > at) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const job = this.sql.exec(`SELECT * FROM jobs WHERE state = 'queued' AND due <= ? ORDER BY due LIMIT 1`, Date.now() + 100).toArray()[0];
    if (job) {
      this.sql.exec(`UPDATE jobs SET state = 'running', updated = ? WHERE id = ?`, Date.now(), job.id);
      let err = null;
      try { await runGrade(this.env, job.id); } catch (e) { err = String((e && e.message) || e).slice(0, 300); }
      const now = this.sql.exec('SELECT * FROM jobs WHERE id = ?', job.id).toArray()[0];
      if (now && now.state === 'running') {   // not asked for again while it ran
        if (!err) this.sql.exec('DELETE FROM jobs WHERE id = ?', job.id);
        else if (job.tries + 1 < TRIES) {
          this.sql.exec(`UPDATE jobs SET state = 'queued', tries = ?, due = ?, error = ?, updated = ? WHERE id = ?`, job.tries + 1, Date.now() + 60000 * (job.tries + 1), err, Date.now(), job.id);
          try { await board(this.env).autogradeState(job.id, { state: 'queued', error: err, retry: job.tries + 1 }); } catch (e) {}
        } else {
          this.sql.exec(`UPDATE jobs SET state = 'failed', error = ?, updated = ? WHERE id = ?`, err, Date.now(), job.id);
          try { await board(this.env).autogradeState(job.id, { state: 'failed', error: err }); } catch (e) {}
        }
      }
    }
    if (Math.random() < 0.05) this.sql.exec(`DELETE FROM jobs WHERE state = 'failed' AND updated < ?`, Date.now() - 7 * 86400000);
    await this.arm();
  }
}
