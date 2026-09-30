/**
 * LSH Mock Call Line: a training VOIP phone system for Receptionist and Intake mock calls.
 *
 * Cloudflare Worker + one Durable Object (the Switchboard, src/switchboard.js):
 *   /             the app (public/), a softphone for trainees and a console for trainers
 *   /ws           each phone's WebSocket to the Switchboard (presence, ringing, WebRTC signaling)
 *   /api/...      sign-in, scenarios, call records, recordings, TURN credentials, AI practice and scoring
 *
 * Secrets (wrangler secret put <NAME>):
 *   ADMIN_PASSPHRASE     trainer sign-in (required: without it nobody can sign in)
 *   SESSION_SECRET       optional; signs sign-in tokens (defaults to ADMIN_PASSPHRASE)
 *   TRAINEE_CODE         optional; trainees must enter it to sign in
 *   TURN_KEY_ID, TURN_KEY_API_TOKEN
 *                        optional but recommended: Cloudflare Realtime TURN, so calls connect on
 *                        networks that block direct audio (strict home routers, mobile data, offices)
 *   GEMINI_API_KEY5 … GEMINI_API_KEY9 (and GEMINI_API_KEY, _KEY1, _KEY2)
 *                        optional: AI practice callers and AI scoring (the LSH Gemini key pool)
 * Variables: RECORDING_DAYS (default 90), AI_MAX_MINUTES (default 8).
 * Recordings are kept in the shared LSH_KV namespace under "voip:" and expire on their own.
 */
import { Switchboard } from './switchboard.js';
import { makeToken, readToken, readTokenString, safeEqual, traineeId } from './auth.js';
import { FIRM, CASES, TRACKS, NOTE_FORMS, LINES, LEVELS, CMS_URL, traineeView } from './scenarios.js';
import { hasAI, keyNames, generate, parseJson, liveToken } from './gemini.js';
import { callerPrompt, liveSetup, gradePrompt, cleanGrade } from './prompts.js';

export { Switchboard };

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
const board = (env) => env.SWITCHBOARD.get(env.SWITCHBOARD.idFromName('main'));
const REC = 'voip:rec:';
const recDays = (env) => Math.min(365, Math.max(1, Number(env.RECORDING_DAYS) || 90));
const aiMinutes = (env) => Math.min(15, Math.max(2, Number(env.AI_MAX_MINUTES) || 8));

function b64(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// What a trainee sees of a call record: never the caller's script or the trainer's unsent draft.
function forTrainee(r) {
  const d = r.data || {}, s = d.scenario || {};
  const done = !['ringing', 'live'].includes(r.status);
  const scen = traineeView(s);
  if (done) Object.assign(scen, { goals: s.goals || [], caller: { name: s.caller && s.caller.name, role: s.caller && s.caller.role }, reference: s.reference || null, caseId: s.caseId || null });
  return {
    id: r.id, mode: r.mode, track: r.track, title: r.title, status: r.status, createdAt: r.created_at, answeredAt: r.answered_at, endedAt: r.ended_at,
    traineeId: r.trainee_id, traineeName: r.trainee_name, batch: r.batch, trainer: r.trainer, reviewed: !!r.reviewed, score: r.score,
    scenario: scen, metrics: d.metrics || {}, note: d.note || {}, noteSubmittedAt: d.noteSubmittedAt || null, transcript: done ? d.transcript || [] : [],
    recording: d.recording || null, ai: d.ai || null, review: d.review && d.review.sentAt ? d.review : null
  };
}
function forTrainer(r) {
  const d = r.data || {};
  return {
    id: r.id, mode: r.mode, track: r.track, title: r.title, status: r.status, createdAt: r.created_at, answeredAt: r.answered_at, endedAt: r.ended_at,
    traineeId: r.trainee_id, traineeName: r.trainee_name, batch: r.batch, trainer: r.trainer, reviewed: !!r.reviewed, score: r.score,
    scenario: d.scenario, metrics: d.metrics || {}, note: d.note || {}, noteSubmittedAt: d.noteSubmittedAt || null, transcript: d.transcript || [],
    recording: d.recording || null, ai: d.ai || null, aiDraft: d.aiDraft || null, review: d.review || null, ticks: d.ticks || [], events: d.events || []
  };
}

async function iceServers(env) {
  const fallback = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return { iceServers: fallback, turn: false };
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 86400 })
    });
    const d = await r.json();
    let list = d.iceServers;
    if (list && !Array.isArray(list)) list = [list];
    if (!r.ok || !list || !list.length) throw new Error('TURN ' + r.status);
    // Port 53 is blocked by browsers and only slows the connection down.
    list = list.map((s) => Object.assign({}, s, { urls: [].concat(s.urls).filter((u) => !/:53\b/.test(u)) })).filter((s) => s.urls.length);
    return { iceServers: list, turn: true };
  } catch (e) {
    return { iceServers: fallback, turn: false, error: String(e.message || e) };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      /* ---------- a phone's WebSocket to the Switchboard ---------- */
      if (path === '/ws') {
        if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
        const tok = await readTokenString(env, url.searchParams.get('token'));
        if (!tok) return new Response('Sign-in required', { status: 401 });
        const headers = new Headers(request.headers);
        headers.set('X-Who', JSON.stringify(tok));
        return board(env).fetch(new Request(request.url, { headers }));
      }

      if (!path.startsWith('/api/')) {
        const res = await env.ASSETS.fetch(request);
        const type = res.headers.get('Content-Type') || '';
        if (!type.includes('text/html')) return res;
        const h = new Headers(res.headers);
        h.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        h.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
        h.set('X-Content-Type-Options', 'nosniff');
        h.set('Referrer-Policy', 'same-origin');
        return new Response(res.body, { status: res.status, headers: h });
      }
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

      /* ---------- sign-in ---------- */
      if (path === '/api/auth/status') {
        return json({ configured: !!env.ADMIN_PASSPHRASE, traineeCode: !!env.TRAINEE_CODE, ai: hasAI(env), turn: !!(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN), recordings: !!env.LSH_KV, firm: FIRM.name });
      }
      if (path === '/api/auth/admin') {
        if (!env.ADMIN_PASSPHRASE) return json({ error: 'Trainer sign-in isn\'t set up yet: add the ADMIN_PASSPHRASE secret in Cloudflare.' }, 501);
        const { passphrase, name } = await request.json().catch(() => ({}));
        await new Promise((r) => setTimeout(r, 400));   // slows down guessing
        if (!safeEqual(String(passphrase || ''), env.ADMIN_PASSPHRASE)) return json({ error: 'Incorrect passphrase' }, 401);
        const who = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40) || 'Trainer';
        return json({ token: await makeToken(env, 'a', who, 12), role: 'a', id: who, name: who });
      }
      if (path === '/api/auth/trainee') {
        if (!env.ADMIN_PASSPHRASE) return json({ error: 'Sign-in isn\'t set up yet: the trainer needs to add the ADMIN_PASSPHRASE secret in Cloudflare.' }, 501);
        const { name, batch, code } = await request.json().catch(() => ({}));
        const n = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60), b = String(batch || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        if (!n || !b) return json({ error: 'Enter your full name and your batch.' }, 400);
        if (env.TRAINEE_CODE) {
          await new Promise((r) => setTimeout(r, 300));
          if (!safeEqual(String(code || '').trim(), String(env.TRAINEE_CODE).trim())) return json({ error: 'That access code isn\'t right. Ask your trainer for it.' }, 401);
        }
        const id = traineeId(n, b);
        const cur = await board(env).getTrainee(id);
        if (cur && cur.archived) return json({ error: 'This account is archived. Ask your trainer to restore it.' }, 403);
        const rec = await board(env).upsertTrainee(id, cur ? cur.name : n, cur ? cur.batch : b);
        return json({ token: await makeToken(env, 't', id, 24 * 30), role: 't', id, name: rec.name, batch: rec.batch });
      }

      const tok = await readToken(env, request);
      if (!tok) return json({ error: 'Sign-in required' }, 401);
      const admin = tok.role === 'a';
      const sb = board(env);
      let me = { role: tok.role, id: tok.id, name: tok.id, batch: '' };
      if (!admin) {
        const t = await sb.getTrainee(tok.id);
        if (!t || t.archived) return json({ error: 'Sign-in required' }, 401);
        me = { role: 't', id: t.id, name: t.name, batch: t.batch };
      }
      const body = path === '/api/recording/put' || path === '/api/ai/draft' ? null : await request.json().catch(() => ({}));

      if (path === '/api/me') return json(me);

      if (path === '/api/config') {
        const all = await sb.listScenarios();
        return json({
          me, firm: FIRM, cases: CASES, tracks: TRACKS, forms: NOTE_FORMS, lines: LINES, levels: LEVELS, cms: CMS_URL,
          scenarios: admin ? all : all.map(traineeView),
          features: { ai: hasAI(env), recordings: !!env.LSH_KV, aiMinutes: aiMinutes(env) }
        });
      }
      if (path === '/api/ice') return json(await iceServers(env));

      /* ---------- trainers: scenarios, trainees, the board ---------- */
      if (path === '/api/scenarios/save') { if (!admin) return json({ error: 'Not allowed' }, 403); return json({ scenario: await sb.saveScenario(body.scenario || {}) }); }
      if (path === '/api/scenarios/delete') { if (!admin) return json({ error: 'Not allowed' }, 403); await sb.deleteScenario(String(body.id || '')); return json({ ok: true }); }
      if (path === '/api/trainees') { if (!admin) return json({ error: 'Not allowed' }, 403); return json({ trainees: await sb.listTrainees() }); }
      if (path === '/api/trainees/archive') { if (!admin) return json({ error: 'Not allowed' }, 403); return json({ trainee: await sb.setArchived(String(body.id || ''), !!body.archived) }); }
      if (path === '/api/stats') {
        if (!admin) return json({ error: 'Not allowed' }, 403);
        const ice = await iceServers(env);
        return json({ stats: await sb.stats(), setup: { ai: hasAI(env), aiKeys: keyNames(env).length, turn: ice.turn, turnError: ice.error || '', recordings: !!env.LSH_KV, recordingDays: recDays(env), traineeCode: !!env.TRAINEE_CODE } });
      }

      /* ---------- call records ---------- */
      if (path === '/api/calls') {
        const f = Object.assign({}, body || {});
        if (!admin) f.traineeId = me.id;
        return json({ calls: await sb.listCalls(f) });
      }
      if (path === '/api/call') {
        const r = await sb.getCall(String(body.id || ''));
        if (!r || (!admin && r.trainee_id !== me.id)) return json({ error: 'No such call' }, 404);
        return json({ call: admin ? forTrainer(r) : forTrainee(r) });
      }
      if (path === '/api/call/update') {
        const res = await sb.updateCall(String(body.id || ''), me, body);
        if (res.error) return json({ error: res.error }, 403);
        return json({ call: admin ? forTrainer(res.call) : forTrainee(res.call) });
      }
      if (path === '/api/call/delete') {
        if (!admin) return json({ error: 'Not allowed' }, 403);
        await sb.deleteCall(String(body.id || ''));
        if (env.LSH_KV) await env.LSH_KV.delete(REC + String(body.id || ''));
        return json({ ok: true });
      }

      /* ---------- recordings ---------- */
      if (path === '/api/recording/put') {
        if (!env.LSH_KV) return json({ error: 'Recordings need the LSH_KV binding.' }, 501);
        const id = url.searchParams.get('id') || '';
        const r = await sb.getCall(id);
        if (!r) return json({ error: 'No such call' }, 404);
        // Live calls are recorded on the trainer's console; practice calls on the trainee's phone.
        if (r.mode === 'live' ? !admin : r.trainee_id !== me.id) return json({ error: 'Not allowed' }, 403);
        const type = (request.headers.get('Content-Type') || 'audio/webm').split(';')[0];
        if (!/^audio\/(webm|ogg|mp4|mpeg|wav)$/.test(type)) return json({ error: 'Unsupported audio type' }, 415);
        const buf = await request.arrayBuffer();
        if (buf.byteLength < 200) return json({ error: 'Empty recording' }, 400);
        if (buf.byteLength > 24 * 1024 * 1024) return json({ error: 'The recording is too large to keep (over 24 MB).' }, 413);
        const meta = { type, size: buf.byteLength, at: Date.now(), durMs: Number(url.searchParams.get('dur')) || null, expires: Date.now() + recDays(env) * 86400000 };
        await env.LSH_KV.put(REC + id, buf, { expirationTtl: recDays(env) * 86400, metadata: meta });
        await sb.setRecording(id, meta);
        return json({ ok: true, recording: meta });
      }
      if (path === '/api/recording/get') {
        if (!env.LSH_KV) return json({ error: 'No recordings on this site.' }, 404);
        const id = String(body.id || '');
        const r = await sb.getCall(id);
        if (!r || (!admin && r.trainee_id !== me.id)) return json({ error: 'No such call' }, 404);
        const got = await env.LSH_KV.getWithMetadata(REC + id, { type: 'arrayBuffer' });
        if (!got || !got.value) return json({ error: 'This recording has expired or was never saved.' }, 404);
        return new Response(got.value, { headers: { 'Content-Type': (got.metadata && got.metadata.type) || 'audio/webm', 'Cache-Control': 'private, no-store' } });
      }

      /* ---------- AI practice callers ---------- */
      if (path === '/api/ai/start') {
        if (!hasAI(env)) return json({ error: 'AI practice callers aren\'t set up on this site yet.' }, 501);
        if (!admin && (await sb.countUsage(me.id, 'aicall', 3600000)) >= 30) return json({ error: 'That\'s a lot of practice calls this hour. Take a short break and try again.' }, 429);
        const res = await sb.startAiCall(me, String(body.scenarioId || ''));
        if (!res) return json({ error: 'No such scenario' }, 404);
        if (res.scenario.ai === false) return json({ error: 'This call is for live practice with a trainer only.' }, 403);
        await sb.logUsage(me.id, 'aicall');
        return json({ callId: res.id, scenario: traineeView(res.scenario), maxSeconds: aiMinutes(env) * 60 });
      }
      if (path === '/api/ai/live' || path === '/api/ai/text') {
        const r = await sb.getCall(String(body.callId || ''));
        if (!r || r.mode !== 'ai' || r.trainee_id !== me.id || r.status !== 'live') return json({ error: 'This practice call is over.' }, 404);
        const s = r.data.scenario;
        if (path === '/api/ai/live') {
          const t = await liveToken(env, (model) => liveSetup(s, model), aiMinutes(env), Array.isArray(body.skip) ? body.skip.map(String) : []);
          return t.ok ? json({ token: t.token, model: t.model, url: t.url, pair: t.pair, maxSeconds: aiMinutes(env) * 60 }) : json({ error: t.error, code: t.code }, t.code === 'BUSY' ? 429 : 502);
        }
        // Text mode: the same caller, one turn at a time (no microphone, or live voice unavailable).
        if ((await sb.countUsage(me.id, 'aitext', 3600000)) >= 400) return json({ error: 'Too many messages this hour.' }, 429);
        await sb.logUsage(me.id, 'aitext');
        const turns = (Array.isArray(body.turns) ? body.turns : []).slice(-60);
        const contents = [];
        for (const x of turns) {
          const role = x && x.who === 'caller' ? 'model' : 'user';
          const text = String((x && x.text) || '').slice(0, 1500);
          if (!text) continue;
          if (contents.length && contents[contents.length - 1].role === role) contents[contents.length - 1].parts[0].text += '\n' + text;
          else contents.push({ role, parts: [{ text }] });
        }
        if (!contents.length || contents[0].role !== 'user') contents.unshift({ role: 'user', parts: [{ text: '(The call is answered.)' }] });
        if (contents[contents.length - 1].role !== 'user') contents.push({ role: 'user', parts: [{ text: '(The line is quiet.)' }] });
        try {
          const g = await generate(env, { system: callerPrompt(s) + '\n\nThis call is typed: reply with only what you say out loud, one or two short sentences.', contents, maxTokens: 200, temperature: 0.8 });
          return json({ text: g.text.replace(/^\s*(caller|[A-Z][a-z]+ [A-Z][a-z]+)\s*:\s*/i, '').trim() });
        } catch (e) { return json({ error: String(e.message || e) }, 502); }
      }

      /* ---------- AI scoring ---------- */
      if (path === '/api/ai/grade') {
        if (!hasAI(env)) return json({ error: 'AI scoring isn\'t set up on this site yet.' }, 501);
        const r = await sb.getCall(String(body.id || ''));
        if (!r || (!admin && r.trainee_id !== me.id)) return json({ error: 'No such call' }, 404);
        if (r.status !== 'ended') return json({ error: 'Finish the call first.' }, 409);
        if (r.mode !== 'ai' && !admin) return json({ error: 'Your trainer scores live calls.' }, 403);
        if (!admin && (await sb.countUsage(me.id, 'grade', 3600000)) >= 40) return json({ error: 'Too many scorings this hour.' }, 429);
        await sb.logUsage(me.id, 'grade');
        const s = r.data.scenario;
        const call = { metrics: r.data.metrics, note: r.data.note, transcript: r.data.transcript };
        const p = gradePrompt(s, call, {});
        try {
          const g = await generate(env, { system: p.system, parts: [{ text: p.prompt }], json: true, maxTokens: 2500 });
          const grade = cleanGrade(s, parseJson(g.text));
          if (!grade) return json({ error: 'The AI\'s answer couldn\'t be read. Try again.' }, 502);
          const saved = await sb.setGrade(r.id, grade, r.mode === 'live');
          return json({ call: admin ? forTrainer(saved) : forTrainee(saved) });
        } catch (e) { return json({ error: String(e.message || e) }, 502); }
      }
      // Live calls: the trainer's console sends the recording (as 8 kHz WAV) for a transcript and a draft scorecard.
      if (path === '/api/ai/draft') {
        if (!admin) return json({ error: 'Not allowed' }, 403);
        if (!hasAI(env)) return json({ error: 'AI scoring isn\'t set up on this site yet.' }, 501);
        const r = await sb.getCall(url.searchParams.get('id') || '');
        if (!r || r.status !== 'ended') return json({ error: 'No finished call with that id.' }, 404);
        const buf = await request.arrayBuffer();
        if (buf.byteLength > 14 * 1024 * 1024) return json({ error: 'The recording is too long to score (about 15 minutes at most).' }, 413);
        const s = r.data.scenario;
        const call = { metrics: r.data.metrics, note: r.data.note, transcript: r.data.transcript };
        const p = gradePrompt(s, call, { audio: buf.byteLength > 1000 });
        const parts = buf.byteLength > 1000 ? [{ inlineData: { mimeType: 'audio/wav', data: b64(buf) } }, { text: p.prompt }] : [{ text: p.prompt }];
        try {
          const g = await generate(env, { system: p.system, parts, json: true, maxTokens: 6000 });
          const grade = cleanGrade(s, parseJson(g.text));
          if (!grade) return json({ error: 'The AI\'s answer couldn\'t be read. Try again.' }, 502);
          const saved = await sb.setGrade(r.id, grade, true);
          return json({ call: forTrainer(saved) });
        } catch (e) { return json({ error: String(e.message || e) }, 502); }
      }

      return json({ error: 'Unknown endpoint' }, 404);
    } catch (e) {
      return json({ error: 'Something went wrong on the server.', detail: String((e && e.stack) || e).slice(0, 600) }, 500);
    }
  }
};
