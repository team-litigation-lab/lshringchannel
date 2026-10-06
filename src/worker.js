/**
 * LSH Ring Channel: a training VOIP phone system for Receptionist and Intake mock calls.
 *
 * Cloudflare Worker + one Durable Object (the Switchboard, src/switchboard.js):
 *   /             the app (public/), a softphone for trainees and a console for trainers
 *   /ws           each phone's WebSocket to the Switchboard (presence, ringing, WebRTC signaling)
 *   /api/...      sign-in from the LSH Training Portal, scenarios, call records, recordings, TURN credentials, AI practice and scoring
 *
 * Secrets (wrangler secret put <NAME>):
 *   ADMIN_PASSPHRASE     required: signs sign-in tokens, and the trainers' fallback sign-in if the Portal is down
 *   SESSION_SECRET       optional; signs sign-in tokens instead (changing it signs everyone out)
 *   PORTAL_SSO_SECRET    optional; the LSH Training Portal's ticket secret (without it, tickets are checked by the Portal)
 *   TURN_KEY_ID, TURN_KEY_API_TOKEN
 *                        optional but recommended: Cloudflare Realtime TURN, so calls connect on
 *                        networks that block direct audio (strict home routers, mobile data, offices)
 *   GEMINI_API_KEY5 … GEMINI_API_KEY9 (and GEMINI_API_KEY, _KEY1, _KEY2)
 *                        optional: AI practice callers and AI scoring (the LSH Gemini key pool)
 * Variables: RECORDING_DAYS (default 90), AI_MAX_MINUTES (default 8), PORTAL_URL (default https://cm-training-activity.pages.dev).
 * Recordings are kept in the shared LSH_KV namespace under "voip:" and expire on their own.
 */
import { Switchboard } from './switchboard.js';
import { Grader, GRADE_AUDIO } from './grader.js';
import { makeToken, readToken, readTokenString, safeEqual, traineeId, secretOf } from './auth.js';
import { FIRM, CASES, TRACKS, NOTE_FORMS, LINES, LEVELS, CMS_URL, traineeView, openCall } from './scenarios.js';
import { hasAI, keyNames, generate, liveToken } from './gemini.js';
import { callerPrompt, liveSetup } from './prompts.js';
import { readPortalTicket, portalHome } from './portal.js';

export { Switchboard, Grader };

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
const board = (env) => env.SWITCHBOARD.get(env.SWITCHBOARD.idFromName('main'));
const REC = 'voip:rec:';
const recDays = (env) => Math.min(365, Math.max(1, Number(env.RECORDING_DAYS) || 90));
const aiMinutes = (env) => Math.min(15, Math.max(2, Number(env.AI_MAX_MINUTES) || 8));


// What a trainee sees of a call record: never the caller's script or the trainer's unsent draft, and
// nothing about a live call's scenario until they took the call and it ended (a missed call may be rung again).
const LIVE_TITLE = { ringing: 'Live mock call (ringing)', live: 'Live mock call (in progress)', missed: 'Missed live call', declined: 'Declined live call', cancelled: 'Cancelled live call' };
function traineeTitle(mode, status, title) { return mode === 'live' && status !== 'ended' ? LIVE_TITLE[status] || 'Live mock call' : title; }
function forTrainee(r) {
  const d = r.data || {}, s = d.scenario || {};
  const done = r.status === 'ended';
  const hideAll = r.mode === 'live' && !done;
  const scen = hideAll ? { track: s.track, line: traineeView(s).line } : traineeView(s);
  if (done) Object.assign(scen, { goals: s.goals || [], caller: { name: s.caller && s.caller.name, role: s.caller && s.caller.role }, reference: s.reference || null, caseId: s.caseId || null });
  return {
    id: r.id, mode: r.mode, track: r.track, title: traineeTitle(r.mode, r.status, r.title), status: r.status, createdAt: r.created_at, answeredAt: r.answered_at, endedAt: r.ended_at,
    traineeId: r.trainee_id, traineeName: r.trainee_name, batch: r.batch, trainer: r.trainer, reviewed: !!r.reviewed, score: r.score,
    scenario: scen, metrics: d.metrics || {}, note: d.note || {}, noteSubmittedAt: d.noteSubmittedAt || null, transcript: done ? d.transcript || [] : [],
    recording: d.recording || null, ai: d.ai || null, review: d.review && d.review.sentAt ? d.review : null,
    graded: !!d.graded, audioStats: done ? d.audioStats || null : null,
    autograde: r.mode === 'ai' && d.autograde ? { state: d.autograde.state, error: d.autograde.error || '' } : null
  };
}
function forTrainer(r) {
  const d = r.data || {};
  return {
    id: r.id, mode: r.mode, track: r.track, title: r.title, status: r.status, createdAt: r.created_at, answeredAt: r.answered_at, endedAt: r.ended_at,
    traineeId: r.trainee_id, traineeName: r.trainee_name, batch: r.batch, trainer: r.trainer, reviewed: !!r.reviewed, score: r.score,
    scenario: d.scenario, metrics: d.metrics || {}, note: d.note || {}, noteSubmittedAt: d.noteSubmittedAt || null, transcript: d.transcript || [],
    recording: d.recording || null, ai: d.ai || null, aiDraft: d.aiDraft || null, review: d.review || null, reviewDraft: d.reviewDraft || null, ticks: d.ticks || [], events: d.events || [],
    graded: !!d.graded, aiScore: d.aiScore != null ? d.aiScore : null, autograde: d.autograde || null, gradeAudio: !!d.gradeAudio, audioStats: d.audioStats || null
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
        const protos = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map((x) => x.trim());
        const tok = await readTokenString(env, protos[0] === 'mcv' && protos[1] ? protos[1] : url.searchParams.get('token'));
        if (!tok) return new Response('Sign-in required', { status: 401 });
        const headers = new Headers(request.headers);
        headers.set('X-Who', JSON.stringify(tok));
        return board(env).fetch(new Request(request.url, { headers }));
      }

      // The app's files are served from public/ before the Worker runs (their headers are in public/_headers).
      if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

      /* ---------- sign-in ---------- */
      if (path === '/api/auth/status') {
        return json({ configured: !!secretOf(env), ai: hasAI(env), turn: !!(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN), recordings: !!env.LSH_KV, firm: FIRM.name, portal: portalHome(env) });
      }
      if (path === '/api/auth/admin') {
        if (!env.ADMIN_PASSPHRASE) return json({ error: 'Trainer sign-in isn\'t set up yet: add the ADMIN_PASSPHRASE secret in Cloudflare.' }, 501);
        const { passphrase, name } = await request.json().catch(() => ({}));
        await new Promise((r) => setTimeout(r, 400));   // slows down guessing
        if (!safeEqual(String(passphrase || ''), env.ADMIN_PASSPHRASE)) return json({ error: 'Incorrect passphrase' }, 401);
        const who = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40) || 'Trainer';
        return json({ token: await makeToken(env, 'a', who, 12), role: 'a', id: who, name: who });
      }
      // 🏠 Ring Channel opens from the LSH Training Portal: its short-lived ticket signs a trainee in as a trainee and
      // an administrator in as a trainer (src/portal.js). There's no sign-in form; /api/auth/admin is only the fallback.
      if (path === '/api/auth/portal') {
        if (!secretOf(env)) return json({ error: 'Ring Channel isn\'t set up yet: add the ADMIN_PASSPHRASE (or SESSION_SECRET) secret in Cloudflare.', code: 'not-configured' }, 501);
        const { ticket } = await request.json().catch(() => ({}));
        const v = await readPortalTicket(env, ticket);
        if (!v.ok) {
          const why = { expired: 'This link from the LSH Training Portal has expired. Open Ring Channel from the Portal again.',
            unreachable: 'Couldn\'t reach the LSH Training Portal to check your sign-in. Try again in a moment.',
            signature: 'The LSH Training Portal\'s sign-in couldn\'t be verified here (PORTAL_SSO_SECRET differs from the Portal\'s). Please tell your administrator.' }[v.code];
          return json({ error: why || 'The LSH Training Portal didn\'t confirm this sign-in. Open Ring Channel from the Portal again.', code: v.code }, 401);
        }
        if (v.system) return json({ error: 'That ticket isn\'t for a person.', code: 'system' }, 403);
        if (!(await board(env).claimTicket(v.sig, v.exp))) return json({ error: 'This link from the LSH Training Portal was already used. Open Ring Channel from the Portal again.', code: 'used' }, 401);
        if (v.admin) { const who = v.name || 'Trainer'; return json({ token: await makeToken(env, 'a', who, 12), role: 'a', id: who, name: who, portal: true }); }
        const n = `${v.first} ${v.last}`.replace(/\s+/g, ' ').slice(0, 60), b = v.batch.replace(/\s+/g, ' ').slice(0, 30);
        const id = traineeId(n, b);
        const res = await board(env).traineePortalSignIn(id, n, b);
        if (res.error) return json({ error: res.error }, res.status || 400);
        return json({ token: await makeToken(env, 't', id, 24 * 30), role: 't', id, name: res.trainee.name, batch: res.trainee.batch, portal: true });
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
      const body = path === '/api/recording/put' ? null : await request.json().catch(() => ({}));

      if (path === '/api/me') return json(me);

      if (path === '/api/config') {
        const all = await sb.listScenarios();
        const st = await sb.getSettings();
        return json({
          me, firm: FIRM, cases: CASES, tracks: TRACKS, forms: NOTE_FORMS, lines: LINES, levels: LEVELS, cms: CMS_URL, portal: portalHome(env), openCaller: openCall('reception').caller,
          scenarios: admin ? all : all.map(traineeView),
          features: { ai: hasAI(env), recordings: !!env.LSH_KV, aiMinutes: aiMinutes(env) },
          settings: admin ? st : { weights: st.weights, passMark: st.passMark }
        });
      }
      if (path === '/api/ice') {
        if ((await sb.countUsage(me.id, 'ice', 3600000)) >= 120) return json({ error: 'Too many requests.' }, 429);
        await sb.logUsage(me.id, 'ice');
        return json(await iceServers(env));
      }

      /* ---------- trainers: scenarios, trainees, the board ---------- */
      if (path === '/api/scenarios/save') { if (!admin) return json({ error: 'Not allowed' }, 403); return json({ scenario: await sb.saveScenario(body.scenario || {}) }); }
      if (path === '/api/scenarios/delete') { if (!admin) return json({ error: 'Not allowed' }, 403); await sb.deleteScenario(String(body.id || '')); return json({ ok: true }); }
      if (path === '/api/trainees') { if (!admin) return json({ error: 'Not allowed' }, 403); return json({ trainees: await sb.listTrainees() }); }
      if (path === '/api/trainees/archive') { if (!admin) return json({ error: 'Not allowed' }, 403); return json({ trainee: await sb.setArchived(String(body.id || ''), !!body.archived) }); }
      if (path === '/api/stats') {
        if (!admin) return json({ error: 'Not allowed' }, 403);
        const ice = await iceServers(env);
        return json({ stats: await sb.stats(), setup: { ai: hasAI(env), aiKeys: keyNames(env).length, turn: ice.turn, turnError: ice.error || '', recordings: !!env.LSH_KV, recordingDays: recDays(env), portal: portalHome(env), portalSecret: !!String(env.PORTAL_SSO_SECRET || '').trim() } });
      }
      // 📊 How much of the Cloudflare account's monthly request allowance (shared by every LSH site) is used.

      /* ---------- 📋 graded mock calls: settings and the report ---------- */
      if (path === '/api/settings/save') { if (!admin) return json({ error: 'Not allowed' }, 403); return json({ settings: await sb.saveSettings(body.settings || {}) }); }
      if (path === '/api/graded') { if (!admin) return json({ error: 'Not allowed' }, 403); return json({ calls: await sb.gradedCalls(body || {}) }); }

      /* ---------- call records ---------- */
      if (path === '/api/calls') {
        const f = Object.assign({}, body || {});
        if (!admin) f.traineeId = me.id;
        const calls = await sb.listCalls(f);
        if (!admin) calls.forEach((c) => { c.title = traineeTitle(c.mode, c.status, c.title); c.scenarioId = c.mode === 'live' && c.status !== 'ended' ? '' : c.scenarioId; delete c.draft; });
        return json({ calls });
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
        if (env.LSH_KV) { await env.LSH_KV.delete(REC + String(body.id || '')); await env.LSH_KV.delete(GRADE_AUDIO + String(body.id || '')); }
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
        if (url.searchParams.get('kind') === 'grade') {
          // The copy the AI grades from (8 kHz WAV, both voices, up to 15 minutes), kept 14 days.
          if (type !== 'audio/wav' || buf.byteLength > 15 * 1024 * 1024) return json({ error: 'The grading copy must be a WAV of 15 minutes at most.' }, 413);
          let stats = null;
          try {
            const x = JSON.parse(request.headers.get('X-Audio-Stats') || 'null');
            const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v) * 10) / 10) : 0);
            if (x && x.deadAir) stats = { durationSec: n(x.durationSec), deadAir: { count: n(x.deadAir.count), total: n(x.deadAir.total), longest: n(x.deadAir.longest), gaps: (Array.isArray(x.deadAir.gaps) ? x.deadAir.gaps : []).slice(0, 20).map((g) => [n(g[0]), n(g[1])]) } };
          } catch (e) { stats = null; }
          await env.LSH_KV.put(GRADE_AUDIO + id, buf, { expirationTtl: 14 * 86400 });
          await sb.markGradeAudio(id, stats);
          return json({ ok: true });
        }
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
        if (res.error) return json({ error: res.error }, res.status || 400);
        await sb.logUsage(me.id, 'aicall');
        return json({ callId: res.id, scenario: traineeView(res.scenario), maxSeconds: aiMinutes(env) * 60 });
      }
      if (path === '/api/ai/live' || path === '/api/ai/text') {
        const r = await sb.getCall(String(body.callId || ''));
        if (!r || r.mode !== 'ai' || r.trainee_id !== me.id || r.status !== 'live') return json({ error: 'This practice call is over.' }, 404);
        const s = r.data.scenario;
        if (Date.now() - r.created_at > (aiMinutes(env) + 1) * 60000) return json({ error: 'This practice call reached its time limit.' }, 409);
        if (path === '/api/ai/live') {
          // A call gets a few tries (busy keys, models); every token is one Gemini Live session.
          if ((await sb.countUsage(me.id, 'live:' + r.id, 3600000)) >= 8 || (await sb.countUsage(me.id, 'live', 3600000)) >= 60) return json({ error: 'Too many voice connections; this call runs as text.', code: 'RATE_LIMIT' }, 429);
          await sb.logUsage(me.id, 'live:' + r.id); await sb.logUsage(me.id, 'live');
          const t = await liveToken(env, (model) => liveSetup(s, model), aiMinutes(env), Array.isArray(body.skip) ? body.skip.map(String) : []);
          return t.ok ? json({ token: t.token, model: t.model, url: t.url, pair: t.pair, maxSeconds: aiMinutes(env) * 60 }) : json({ error: t.error, code: t.code }, t.code === 'BUSY' ? 429 : 502);
        }
        // Text mode: the same caller, one turn at a time (no microphone, or live voice unavailable).
        if ((await sb.countUsage(me.id, 'aitext', 3600000)) >= 400) return json({ error: 'Too many messages this hour.' }, 429);
        await sb.logUsage(me.id, 'aitext');
        const said = String(body.text || '').trim().slice(0, 1500);
        const turns = (await sb.appendTyped(r.id, me, said ? [{ who: 'trainee', text: said }] : [])) || [];
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
          const g = await generate(env, { system: callerPrompt(s) + '\n\nThis call is typed: reply with only what you say out loud, one or two short sentences.', contents: contents.slice(-60), maxTokens: 200, temperature: 0.8 });
          const text = g.text.replace(/^\s*(caller|[A-Z][a-z]+ [A-Z][a-z]+)\s*:\s*/i, '').trim();
          if (text) await sb.appendTyped(r.id, me, [{ who: 'caller', text }]);
          return json({ text });
        } catch (e) { return json({ error: String(e.message || e) }, 502); }
      }

      /* ---------- AI grading (the Grader queue, src/grader.js) ---------- */
      // Grade (again) now: a trainer on any call, a trainee on their own practice call.
      if (path === '/api/ai/autograde' || path === '/api/ai/grade') {
        if (!hasAI(env)) return json({ error: 'AI grading isn\'t set up on this site yet.' }, 501);
        const r = await sb.getCall(String(body.id || ''));
        if (!r || (!admin && r.trainee_id !== me.id)) return json({ error: 'No such call' }, 404);
        if (r.status !== 'ended') return json({ error: 'Finish the call first.' }, 409);
        if (r.mode !== 'ai' && !admin) return json({ error: 'Your trainer grades live calls.' }, 403);
        if (!admin && (await sb.countUsage(me.id, 'grade', 3600000)) >= 40) return json({ error: 'Too many gradings this hour.' }, 429);
        await sb.logUsage(me.id, 'grade');
        return json({ autograde: await sb.scheduleGrade(r.id, { force: true }) });
      }

      return json({ error: 'Unknown endpoint' }, 404);
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return json({ error: 'Something went wrong on the server.' }, 500);
    }
  }
};
