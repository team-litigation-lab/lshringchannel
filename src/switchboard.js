/* =========================================================
   The Switchboard: one Durable Object that is the phone system.
   ---------------------------------------------------------
   • Every open phone (a trainee's softphone, a trainer's console)
     holds a WebSocket here (hibernation API, so an idle class costs
     nothing). Its attachment says who it is and what it's doing.
   • Live calls: the trainer rings a trainee, every tab the trainee
     has open rings, the first to answer takes the call, and the two
     browsers exchange WebRTC offers, answers and ICE candidates
     through here. The audio itself goes browser to browser (or
     through the TURN relay), never through this object.
   • Hold, mute, transfer, the trainee's note and the trainer's
     checklist travel as small messages, and the call record keeps
     the timings the scorecard uses (rings, holds, transfers).
   • A dropped connection gets a grace period to come back before
     the call is ended; an unanswered call rings out as "missed".
   • Call records, trainees and trainer-written scenarios are kept in
     this object's SQLite storage (strongly consistent, so a trainer
     sees the trainee's submitted note the moment it is sent).
   ========================================================= */
import { DurableObject } from 'cloudflare:workers';
import { SCENARIOS, cleanScenario, lineOf, LINES, NOTE_FORMS, TRACKS, FIRM, weightedScore, DEFAULT_SETTINGS } from './scenarios.js';
import { hashPin, checkPin } from './auth.js';

const RING_MS = 45000;     // an unanswered call rings out after 45 seconds
const GRACE_MS = 30000;    // a dropped phone has 30 seconds to reconnect before its call ends
const MAX_CALL_MS = 2 * 3600 * 1000;
const PIN_TRIES = 5;       // wrong PINs allowed per trainee in 15 minutes
const AUDIO_WAIT = 3 * 60000;   // autograding waits this long after a call for its recording …
const NOTE_WAIT = 10 * 60000;   // … and this long for the trainee to submit the note
const OPEN = 1;

const now = () => Date.now();
const newId = () => new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 8);

function cleanNote(track, note) {
  const form = NOTE_FORMS[(TRACKS[track] || TRACKS.reception).note];
  const out = {};
  form.fields.forEach((f) => { const v = note && note[f.k]; if (v != null && v !== '') out[f.k] = String(v).slice(0, f.type === 'textarea' ? 4000 : 400); });
  return out;
}

export class Switchboard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS trainees (id TEXT PRIMARY KEY, name TEXT, batch TEXT, created_at INTEGER, last_seen INTEGER, archived INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, mode TEXT, track TEXT, scenario_id TEXT, title TEXT, trainee_id TEXT, trainee_name TEXT, batch TEXT, trainer TEXT,
      status TEXT, created_at INTEGER, answered_at INTEGER, ended_at INTEGER, reviewed INTEGER DEFAULT 0, score REAL, data TEXT)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS calls_by_trainee ON calls (trainee_id, created_at)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS calls_by_time ON calls (created_at)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS scenarios (id TEXT PRIMARY KEY, data TEXT, updated_at INTEGER, deleted INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY AUTOINCREMENT, who TEXT, kind TEXT, at INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`);
    // Each trainee's PIN (a salted hash), set at their first sign-in.
    if (!this.sql.exec(`SELECT name FROM pragma_table_info('trainees') WHERE name = 'pin'`).toArray().length) this.sql.exec('ALTER TABLE trainees ADD COLUMN pin TEXT');
    // Phones ping every 20 seconds; this answers without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /* ---------------- storage helpers ---------------- */
  row(id) {
    const r = this.sql.exec('SELECT * FROM calls WHERE id = ?', id).toArray()[0];
    if (!r) return null;
    r.data = JSON.parse(r.data || '{}');
    return r;
  }
  save(r) {
    this.sql.exec(`INSERT OR REPLACE INTO calls (id, mode, track, scenario_id, title, trainee_id, trainee_name, batch, trainer, status, created_at, answered_at, ended_at, reviewed, score, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.id, r.mode, r.track, r.scenario_id, r.title, r.trainee_id, r.trainee_name, r.batch, r.trainer, r.status,
    r.created_at, r.answered_at || null, r.ended_at || null, r.reviewed ? 1 : 0, r.score == null ? null : r.score, JSON.stringify(r.data || {}));
  }
  trainee(id) { return this.sql.exec('SELECT * FROM trainees WHERE id = ?', id).toArray()[0] || null; }
  scenario(id) {
    const c = this.sql.exec('SELECT data FROM scenarios WHERE id = ? AND deleted = 0', id).toArray()[0];
    if (c) return JSON.parse(c.data);
    return SCENARIOS.find((s) => s.id === id) || null;
  }

  /* ---------------- sockets ---------------- */
  open(tag) { return this.ctx.getWebSockets(tag).filter((w) => w.readyState === OPEN); }
  byCid(cid) { return cid ? this.open('c:' + cid)[0] || null : null; }
  send(ws, msg) { if (!ws) return; try { ws.send(JSON.stringify(msg)); } catch (e) { /* closing */ } }
  att(ws) { return ws.deserializeAttachment() || {}; }
  setAtt(ws, patch) { const a = Object.assign(this.att(ws), patch); ws.serializeAttachment(a); return a; }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    let who; try { who = JSON.parse(request.headers.get('X-Who') || ''); } catch (e) { who = null; }
    if (!who || !who.role || !who.id) return new Response('Unauthorized', { status: 401 });
    const prof = who.role === 't' ? this.trainee(who.id) : null;
    if (who.role === 't' && (!prof || prof.archived)) return new Response('Unknown trainee', { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const cid = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    this.ctx.acceptWebSocket(server, ['c:' + cid, 'u:' + who.id, 'r:' + who.role]);
    const me = { cid, role: who.role, id: who.id, name: prof ? prof.name : who.id, batch: prof ? prof.batch : '', status: who.role === 't' ? 'available' : 'online', hand: false, handAt: 0, call: null, at: now() };
    server.serializeAttachment(me);
    if (prof) this.sql.exec('UPDATE trainees SET last_seen = ? WHERE id = ?', now(), who.id);
    // A phone that reconnects mid-call is told about it, so it can resume.
    const active = this.sql.exec(`SELECT id FROM calls WHERE status IN ('ringing', 'live') AND ${who.role === 't' ? 'trainee_id' : 'trainer'} = ? AND mode = 'live' ORDER BY created_at DESC LIMIT 1`, who.id).toArray()[0];
    this.send(server, { t: 'hello', cid, me, active: active ? this.brief(this.row(active.id), who.role) : null, firm: FIRM.name });
    this.presence();
    // The phone sends its token as a WebSocket subprotocol ("mcv", <token>), so it stays out of URLs and logs.
    const proto = /(^|,\s*)mcv(\s*,|$)/.test(request.headers.get('Sec-WebSocket-Protocol') || '') ? { 'Sec-WebSocket-Protocol': 'mcv' } : {};
    return new Response(null, { status: 101, webSocket: client, headers: proto });
  }

  // What each side is told about a call.
  brief(r, role) {
    const s = r.data.scenario;
    const line = lineOf(s.track);
    const b = { callId: r.id, status: r.status, line, lineLabel: LINES[line].label, lineNumber: LINES[line].number, track: s.track,
      callerId: r.data.withheld ? { name: 'PRIVATE CALLER', number: 'Unknown' } : { name: s.caller.idName, number: s.caller.number },
      createdAt: r.created_at, answeredAt: r.answered_at || null, recording: !!r.data.record, trainer: r.trainer, live: r.data.live || {} };
    if (role === 'a') Object.assign(b, { scenario: s, graded: !!r.data.graded, trainee: { id: r.trainee_id, name: r.trainee_name, batch: r.batch }, note: r.data.note || {}, ticks: r.data.ticks || [], metrics: r.data.metrics || {}, traineeCid: r.data.traineeCid || null });
    else Object.assign(b, { trainerCid: r.data.trainerCid || null, note: r.data.note || {}, hideCases: s.hideCases || [], caseId: null });
    return b;
  }

  // Trainers see every phone that is open; trainees see whether a trainer is on.
  presence(exclude) {
    const all = this.ctx.getWebSockets().filter((w) => w !== exclude && w.readyState === OPEN).map((w) => [w, this.att(w)]);
    const byId = new Map();
    for (const [, a] of all) {
      if (a.role !== 't') continue;
      const cur = byId.get(a.id) || { id: a.id, name: a.name, batch: a.batch, status: 'away', hand: false, handAt: 0, call: null, tabs: 0 };
      cur.tabs++;
      if (a.status === 'available') cur.status = 'available';
      if (a.hand) { cur.hand = true; cur.handAt = Math.max(cur.handAt, a.handAt || 0); }
      if (a.call) cur.call = a.call;
      byId.set(a.id, cur);
    }
    const trainers = all.filter(([, a]) => a.role === 'a').map(([, a]) => ({ name: a.name, call: a.call }));
    const trainees = [...byId.values()];
    const names = [...new Set(trainers.map((x) => x.name))];
    for (const [w, a] of all) {
      if (a.role === 'a') this.send(w, { t: 'presence', trainees, trainers });
      else this.send(w, { t: 'presence', trainers: names.length });
    }
  }

  // The other party's phone on a call.
  peerOf(r, role) { return this.byCid(role === 'a' ? r.data.traineeCid : r.data.trainerCid); }
  clearCallOn(id) {
    for (const w of this.ctx.getWebSockets()) { const a = this.att(w); if (a.call === id) this.setAtt(w, { call: null }); }
  }

  endCall(r, by, reason) {
    if (!r || !['ringing', 'live'].includes(r.status)) return;
    const t = now();
    const m = r.data.metrics = r.data.metrics || {};
    if (r.status === 'ringing') { r.status = reason === 'declined' ? 'declined' : reason === 'no-answer' ? 'missed' : 'cancelled'; }
    else {
      r.status = 'ended';
      m.talkMs = t - (r.answered_at || t);
      const h = (m.holds || [])[m.holds ? m.holds.length - 1 : 0];
      if (h && !h.end) h.end = t;
    }
    r.ended_at = t; m.endedBy = by; m.endReason = reason || '';
    delete r.data.lost; delete r.data.live;
    (r.data.events = r.data.events || []).push({ t: 'end', by, reason, at: t });
    this.save(r);
    // Every phone of both people hears it (a tab that reloaded mid-call isn't tied to the call yet).
    const msg = { t: 'ended', callId: r.id, by, reason, status: r.status };
    for (const w of this.ctx.getWebSockets()) {
      const a = this.att(w);
      if (a.call === r.id || (a.role === 't' && a.id === r.trainee_id) || (a.role === 'a' && (a.cid === r.data.trainerCid || a.id === r.trainer))) this.send(w, msg);
    }
    this.clearCallOn(r.id);
    this.presence();
    if (r.status === 'ended') this.scheduleGrade(r.id).catch(() => {});
  }

  // What's happening on the line now (so a phone that reloads can show it again).
  setLive(r, patch) { r.data.live = Object.assign({}, r.data.live || {}, patch); }

  async armAlarm(at) {
    const cur = await this.ctx.storage.getAlarm();
    if (!cur || cur > at) await this.ctx.storage.setAlarm(at);
  }

  // Rings out unanswered calls, ends calls whose phone didn't come back, and ends calls that ran too long
  // (live calls after 2 hours; practice calls a little after their time limit, even if the tab was closed).
  async alarm() {
    const t = now();
    const aiMs = (Math.min(15, Math.max(2, Number(this.env.AI_MAX_MINUTES) || 8)) + 2) * 60000;
    let next = 0;
    const want = (at) => { next = next ? Math.min(next, at) : at; };
    for (const x of this.sql.exec(`SELECT id FROM calls WHERE status IN ('ringing', 'live')`).toArray()) {
      const r = this.row(x.id);
      if (r.mode === 'ai') {
        if (t - r.created_at >= aiMs) { r.status = 'ended'; r.ended_at = t; r.data.metrics = Object.assign({ endedBy: 'caller', endReason: 'time-limit' }, r.data.metrics || {}); this.save(r); }
        else want(r.created_at + aiMs);
        continue;
      }
      if (r.status === 'ringing') {
        if (t - r.created_at >= RING_MS) this.endCall(r, 'system', 'no-answer'); else want(r.created_at + RING_MS);
        continue;
      }
      const lost = r.data.lost || {};
      const gone = ['a', 't'].find((role) => lost[role] && t - lost[role] >= GRACE_MS);
      if (gone) { this.endCall(r, gone === 'a' ? 'trainer' : 'trainee', 'disconnected'); continue; }
      ['a', 't'].forEach((role) => { if (lost[role]) want(lost[role] + GRACE_MS); });
      const end = (r.answered_at || r.created_at) + MAX_CALL_MS;
      if (t >= end) this.endCall(r, 'system', 'time-limit'); else want(end);
    }
    if (next) await this.ctx.storage.setAlarm(next + 250);
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 100000) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const me = this.att(ws);
    const t = now();
    const err = (msg) => this.send(ws, { t: 'error', msg });
    const r = m.callId ? this.row(String(m.callId)) : null;
    const party = r && ((me.role === 'a' && r.data.trainerCid === me.cid) || (me.role === 't' && r.trainee_id === me.id));

    switch (m.t) {
      case 'status':
        if (me.role === 't') { this.setAtt(ws, { status: m.status === 'away' ? 'away' : 'available' }); this.presence(); }
        return;
      case 'hand':
        if (me.role === 't') { this.setAtt(ws, { hand: !!m.up, handAt: m.up ? t : 0 }); this.presence(); }
        return;

      /* ----- the trainer rings a trainee ----- */
      case 'ring': {
        if (me.role !== 'a') return;
        if (me.call) { const cur = this.row(me.call); if (cur && ['ringing', 'live'].includes(cur.status)) return err('You are already on a call. Hang up first.'); this.setAtt(ws, { call: null }); }
        const s = this.scenario(String(m.scenarioId || ''));
        const tr = this.trainee(String(m.traineeId || ''));
        if (!s || !tr) return err('Pick a trainee and a scenario.');
        const phones = this.open('u:' + tr.id).filter((w) => this.att(w).role === 't');
        if (!phones.length) return this.send(ws, { t: 'ring-failed', reason: `${tr.name} isn't online.` });
        if (phones.some((w) => { const a = this.att(w); if (!a.call) return false; const c = this.row(a.call); return c && ['ringing', 'live'].includes(c.status); })) return this.send(ws, { t: 'ring-failed', reason: `${tr.name} is on another call.` });
        const r2 = { id: newId(), mode: 'live', track: s.track, scenario_id: s.id, title: s.title, trainee_id: tr.id, trainee_name: tr.name, batch: tr.batch, trainer: me.name,
          status: 'ringing', created_at: t, data: { scenario: s, trainerCid: me.cid, graded: !!m.graded, record: m.record !== false || !!m.graded, withheld: !!m.withhold, metrics: {}, note: {}, ticks: [], events: [{ t: 'ring', at: t }] } };
        this.save(r2);
        this.setAtt(ws, { call: r2.id });
        phones.forEach((w) => { this.setAtt(w, { call: r2.id, hand: false, handAt: 0 }); this.send(w, Object.assign({ t: 'incoming' }, this.brief(r2, 't'))); });
        this.send(ws, Object.assign({ t: 'ringing' }, this.brief(r2, 'a')));
        await this.armAlarm(t + RING_MS);
        this.presence();
        return;
      }
      case 'cancel':
        // A cancel that crosses the trainee's answer still ends the call.
        if (party && me.role === 'a') this.endCall(r, 'trainer', r.status === 'live' ? 'hangup' : m.reason === 'no-answer' ? 'no-answer' : 'cancelled');
        return;

      /* ----- the trainee answers or declines ----- */
      case 'accept': {
        if (!party || me.role !== 't') return;
        if (r.status !== 'ringing') return this.send(ws, { t: 'gone', callId: r.id, status: r.status });
        r.status = 'live'; r.answered_at = t;
        r.data.traineeCid = me.cid;
        r.data.metrics.ringMs = t - r.created_at;
        r.data.events.push({ t: 'answer', at: t });
        this.save(r);
        for (const w of this.open('u:' + me.id)) if (w !== ws) { this.setAtt(w, { call: null }); this.send(w, { t: 'taken', callId: r.id }); }
        this.setAtt(ws, { call: r.id });
        const trainer = this.byCid(r.data.trainerCid);
        this.send(trainer, { t: 'accepted', callId: r.id, traineeCid: me.cid, ringMs: r.data.metrics.ringMs });
        this.send(ws, Object.assign({ t: 'connected' }, this.brief(r, 't')));
        if (!trainer) { r.data.lost = { a: t }; this.save(r); await this.armAlarm(t + GRACE_MS); }
        await this.armAlarm(t + MAX_CALL_MS);
        this.presence();
        return;
      }
      case 'decline':   // busy: the trainee is on a practice call
        if (party && me.role === 't' && r.status === 'ringing') this.endCall(r, 'trainee', m.busy ? 'busy' : 'declined');
        return;

      /* ----- WebRTC signaling: passed straight to the other phone ----- */
      case 'signal': {
        if (!party || r.status !== 'live') return;
        this.send(this.peerOf(r, me.role), { t: 'signal', callId: r.id, data: m.data });
        return;
      }

      /* ----- what happens on the call ----- */
      case 'hold': {
        if (!party || r.status !== 'live' || me.role !== 't') return;
        const holds = r.data.metrics.holds = r.data.metrics.holds || [];
        const last = holds[holds.length - 1];
        if (m.on && !(last && !last.end)) holds.push({ start: t });
        if (!m.on && last && !last.end) last.end = t;
        const open = holds[holds.length - 1];
        this.setLive(r, { held: !!(open && !open.end), holdAt: open && !open.end ? open.start : 0 });
        this.save(r);
        this.send(this.peerOf(r, 't'), { t: 'hold', callId: r.id, on: !!m.on, at: t });
        return;
      }
      case 'mute':
        if (!party || r.status !== 'live') return;
        this.setLive(r, me.role === 't' ? { traineeMuted: !!m.on } : { trainerMuted: !!m.on }); this.save(r);
        this.send(this.peerOf(r, me.role), { t: 'mute', callId: r.id, on: !!m.on });
        return;
      case 'transfer': {
        if (!party || r.status !== 'live' || me.role !== 't') return;
        const d = FIRM.directory.find((x) => x.ext === String(m.ext));
        if (!d) return;
        const txs = r.data.metrics.transfers = r.data.metrics.transfers || [];
        const pending = txs[txs.length - 1];
        if (pending && !pending.result) pending.result = 'cancelled';
        const x = { to: d.name, ext: d.ext, role: d.role, unavailable: (r.data.scenario.unavailable || []).includes(d.ext) };
        txs.push({ to: d.name, ext: d.ext, at: t, result: null });
        this.setLive(r, { transfer: x });
        this.save(r);
        this.send(this.peerOf(r, 't'), Object.assign({ t: 'transfer', callId: r.id }, x));
        return;
      }
      case 'transfer-cancel': {   // the trainee took the caller back before the extension answered
        if (!party || r.status !== 'live' || me.role !== 't') return;
        const tx = (r.data.metrics.transfers || []).slice(-1)[0];
        if (!tx || tx.result) return;
        tx.result = 'cancelled'; tx.done = t;
        this.setLive(r, { transfer: null });
        this.save(r);
        this.send(this.peerOf(r, 't'), { t: 'transfer-cancel', callId: r.id });
        return;
      }
      case 'transfer-result': {
        if (!party || r.status !== 'live' || me.role !== 'a') return;
        const tx = (r.data.metrics.transfers || []).slice(-1)[0];
        if (!tx || tx.result) return;
        const result = ['connected', 'no-answer', 'voicemail'].includes(m.result) ? m.result : 'no-answer';
        tx.result = result; tx.done = t;
        this.setLive(r, { transfer: null, lastTransfer: { to: tx.to, ext: tx.ext, result } });
        this.save(r);
        this.send(this.peerOf(r, 'a'), { t: 'transfer-result', callId: r.id, result, to: tx.to, ext: tx.ext });
        if (result === 'connected') this.endCall(r, 'trainee', 'transferred');
        return;
      }
      case 'timeout':   // the trainer pauses the role-play to coach, then resumes it
        if (!party || r.status !== 'live' || me.role !== 'a') return;
        r.data.events.push({ t: m.on ? 'coach' : 'resume', at: t });
        this.setLive(r, { coaching: !!m.on });
        this.save(r);
        this.send(this.peerOf(r, 'a'), { t: 'timeout', callId: r.id, on: !!m.on, msg: String(m.msg || '').slice(0, 300) });
        return;
      case 'class':   // the trainer's Class view is playing this call into a Google Meet
        if (!party || me.role !== 'a' || r.status !== 'live') return;
        this.setLive(r, { classOn: !!m.on }); this.save(r);
        this.send(this.peerOf(r, 'a'), { t: 'class', callId: r.id, on: !!m.on });
        return;
      case 'note': {
        if (!party || me.role !== 't' || !['live', 'ended'].includes(r.status)) return;
        if (r.data.noteSubmittedAt) return;
        r.data.note = cleanNote(r.track, m.note);
        this.save(r);
        this.send(this.byCid(r.data.trainerCid), { t: 'note', callId: r.id, note: r.data.note });
        return;
      }
      case 'ticks':   // the trainer's live checklist
        if (!party || me.role !== 'a') return;
        r.data.ticks = (Array.isArray(m.ticks) ? m.ticks : []).map(Number).filter((x) => x >= 0 && x < 30);
        this.save(r);
        return;
      case 'hangup':
        if (party) this.endCall(r, me.role === 'a' ? 'trainer' : 'trainee', String(m.reason || 'hangup').slice(0, 40));
        return;

      /* ----- a phone that reconnected mid-call picks the call back up ----- */
      case 'resume': {
        if (!r || r.status !== 'live' || !((me.role === 'a' && r.trainer === me.name) || (me.role === 't' && r.trainee_id === me.id))) return this.send(ws, { t: 'gone', callId: m.callId, status: r ? r.status : 'unknown' });
        // The call moves to this phone; a tab that still held it is told, so it stops.
        const oldCid = me.role === 'a' ? r.data.trainerCid : r.data.traineeCid;
        const old = oldCid && oldCid !== me.cid ? this.byCid(oldCid) : null;
        if (old) { this.setAtt(old, { call: null }); this.send(old, { t: 'moved', callId: r.id }); }
        if (me.role === 'a') r.data.trainerCid = me.cid; else r.data.traineeCid = me.cid;
        if (r.data.lost) { delete r.data.lost[me.role]; if (!Object.keys(r.data.lost).length) delete r.data.lost; }
        this.save(r);
        this.setAtt(ws, { call: r.id });
        this.send(ws, Object.assign({ t: 'resumed' }, this.brief(r, me.role)));
        this.send(this.peerOf(r, me.role), { t: 'peer-back', callId: r.id, cid: me.cid });
        this.presence();
        return;
      }
    }
  }

  async webSocketClose(ws, code) { await this.gone(ws); try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch (e) {} }
  async webSocketError(ws) { await this.gone(ws); }

  async gone(ws) {
    const me = this.att(ws);
    if (me.call) {
      const r = this.row(me.call);
      if (r && r.status === 'ringing') {
        if (me.role === 'a' && r.data.trainerCid === me.cid) this.endCall(r, 'trainer', 'cancelled');
      } else if (r && r.status === 'live') {
        const mine = me.role === 'a' ? r.data.trainerCid === me.cid : r.data.traineeCid === me.cid;
        if (mine) {
          r.data.lost = Object.assign({}, r.data.lost, { [me.role]: now() });
          this.save(r);
          this.send(this.peerOf(r, me.role), { t: 'peer-lost', callId: r.id });
          await this.armAlarm(now() + GRACE_MS);
        }
      }
    }
    this.presence(ws);
  }

  /* =========================================================
     Called by the Worker (RPC). Identity is already checked there.
     ========================================================= */
  /* A trainee signs in with their name, batch and PIN. The first sign-in sets the PIN; a trainer can
     reset it (the next sign-in sets a new one). Five wrong PINs in 15 minutes lock the account for a while. */
  async traineeSignIn(id, name, batch, pin) {
    const cur = this.trainee(id);
    if (cur && cur.archived) return { error: 'This account is archived. Ask your trainer to restore it.', status: 403 };
    if (!/^\d{4,8}$/.test(String(pin || ''))) return { error: cur && cur.pin ? 'Enter your PIN (4 to 8 digits).' : 'Choose a PIN of 4 to 8 digits. You\'ll use it every time you sign in.', status: 400, needPin: true, firstTime: !(cur && cur.pin) };
    if (cur && cur.pin) {
      if (this.countUsage(id, 'pinfail', 15 * 60000) >= PIN_TRIES) return { error: 'Too many wrong PINs. Wait 15 minutes, or ask your trainer to reset your PIN.', status: 429 };
      if (!(await checkPin(pin, cur.pin))) { this.logUsage(id, 'pinfail'); return { error: 'That PIN isn\'t right. Forgot it? Ask your trainer to reset it.', status: 401, needPin: true }; }
      this.sql.exec('UPDATE trainees SET last_seen = ? WHERE id = ?', now(), id);
    } else if (cur) {
      this.sql.exec('UPDATE trainees SET pin = ?, last_seen = ? WHERE id = ?', await hashPin(pin), now(), id);
    } else {
      this.sql.exec('INSERT INTO trainees (id, name, batch, created_at, last_seen, pin) VALUES (?, ?, ?, ?, ?, ?)', id, name, batch, now(), now(), await hashPin(pin));
    }
    const t = this.trainee(id);
    return { trainee: { id: t.id, name: t.name, batch: t.batch } };
  }
  resetPin(id) { this.sql.exec('UPDATE trainees SET pin = NULL WHERE id = ?', id); return true; }
  getTrainee(id) { const t = this.trainee(id); if (t) delete t.pin; return t; }
  listTrainees() {
    return this.sql.exec(`SELECT t.id, t.name, t.batch, t.created_at, t.last_seen, t.archived, (t.pin IS NOT NULL) AS hasPin,
      (SELECT COUNT(*) FROM calls c WHERE c.trainee_id = t.id AND c.status = 'ended' AND c.mode = 'live') AS calls,
      (SELECT COUNT(*) FROM calls c WHERE c.trainee_id = t.id AND c.status = 'ended' AND c.mode = 'ai') AS practice,
      (SELECT AVG(score) FROM calls c WHERE c.trainee_id = t.id AND c.mode = 'live' AND c.reviewed = 1 AND c.score IS NOT NULL) AS avg,
      (SELECT AVG(score) FROM calls c WHERE c.trainee_id = t.id AND c.mode = 'ai' AND c.score IS NOT NULL) AS practiceAvg
      FROM trainees t ORDER BY batch, name`).toArray();
  }
  setArchived(id, archived) { this.sql.exec('UPDATE trainees SET archived = ? WHERE id = ?', archived ? 1 : 0, id); return this.getTrainee(id); }

  listScenarios() {
    const custom = this.sql.exec('SELECT data FROM scenarios WHERE deleted = 0 ORDER BY updated_at').toArray().map((x) => JSON.parse(x.data));
    return [...SCENARIOS, ...custom.filter((c) => !SCENARIOS.some((s) => s.id === c.id))];
  }
  saveScenario(o) {
    const s = cleanScenario(o);
    if (SCENARIOS.some((x) => x.id === s.id)) s.id = 'cu_' + crypto.randomUUID().slice(0, 8);
    this.sql.exec('INSERT OR REPLACE INTO scenarios (id, data, updated_at, deleted) VALUES (?, ?, ?, 0)', s.id, JSON.stringify(s), now());
    return s;
  }
  deleteScenario(id) { this.sql.exec('UPDATE scenarios SET deleted = 1, updated_at = ? WHERE id = ?', now(), id); return true; }

  listCalls(f) {
    f = f || {};
    const where = [], args = [];
    if (f.traineeId) { where.push('trainee_id = ?'); args.push(f.traineeId); }
    if (f.batch) { where.push('batch = ?'); args.push(f.batch); }
    if (f.mode) { where.push('mode = ?'); args.push(f.mode); }
    if (f.before) { where.push('created_at < ?'); args.push(Number(f.before)); }
    if (f.done) where.push(`status = 'ended'`);
    if (f.needsReview) where.push(`status = 'ended' AND reviewed = 0`);
    const rows = this.sql.exec(`SELECT * FROM calls ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`, ...args, Math.max(1, Math.min(Math.floor(Number(f.limit)) || 50, 200))).toArray();
    return rows.map((r) => {
      const d = JSON.parse(r.data || '{}');
      return { id: r.id, mode: r.mode, track: r.track, scenarioId: r.scenario_id, title: r.title, traineeId: r.trainee_id, traineeName: r.trainee_name, batch: r.batch, trainer: r.trainer,
        status: r.status, createdAt: r.created_at, answeredAt: r.answered_at, endedAt: r.ended_at, reviewed: !!r.reviewed, score: r.score, draft: !!d.reviewDraft,
        talkMs: d.metrics && d.metrics.talkMs, ringMs: d.metrics && d.metrics.ringMs, recording: !!d.recording, ai: !!d.ai, noteSubmitted: !!d.noteSubmittedAt, reviewSeen: !!(d.review && d.review.seenAt),
        graded: !!d.graded, aiScore: d.aiScore != null ? d.aiScore : null, autograde: (d.autograde && d.autograde.state) || '' };
    });
  }
  getCall(id) { return this.row(id); }
  deleteCall(id) { this.sql.exec('DELETE FROM calls WHERE id = ?', id); return true; }

  // A practice call with the AI caller (the trainee's browser runs the call).
  async startAiCall(who, scenarioId) {
    const s = this.scenario(scenarioId);
    if (!s) return { error: 'No such scenario', status: 404 };
    if (s.ai === false && who.role !== 'a') return { error: 'This call is for live practice with a trainer only.', status: 403 };
    const t = now();
    const r = { id: newId(), mode: 'ai', track: s.track, scenario_id: s.id, title: s.title, trainee_id: who.id, trainee_name: who.name, batch: who.batch || '', trainer: '',
      status: 'live', created_at: t, answered_at: t, data: { scenario: s, metrics: {}, note: {}, transcript: [], events: [] } };
    this.save(r);
    await this.armAlarm(t + (Math.min(15, Math.max(2, Number(this.env.AI_MAX_MINUTES) || 8)) + 2) * 60000);
    return { id: r.id, scenario: s };
  }

  // Typed practice calls: the conversation is kept here, so the caller's lines are the AI's, not the page's.
  appendTyped(id, who, lines) {
    const r = this.row(id);
    if (!r || r.mode !== 'ai' || r.trainee_id !== who.id || r.status !== 'live') return null;
    r.data.typed = true;
    r.data.transcript = (r.data.transcript || []).concat(lines).slice(-400);
    this.save(r);
    return r.data.transcript;
  }

  /* What a phone may change on a call record once it's placed.
     Trainees: their own note (until they submit it); on AI calls also the transcript, timings and end.
     Trainers: the review. */
  updateCall(id, who, p) {
    const r = this.row(id);
    if (!r) return { error: 'No such call' };
    const mine = who.role === 't' && r.trainee_id === who.id;
    if (who.role !== 'a' && !mine) return { error: 'Not allowed' };
    const d = r.data;
    if (mine) {
      if (p.note && !d.noteSubmittedAt) d.note = cleanNote(r.track, p.note);
      if (p.submit && !d.noteSubmittedAt && r.status !== 'live') { d.noteSubmittedAt = now(); r._grade = 'note'; }
      if (p.seen && d.review && !d.review.seenAt) d.review.seenAt = now();
      if (r.mode === 'ai' && r.status === 'live') {
        if (Array.isArray(p.transcript) && !d.typed) d.transcript = p.transcript.slice(0, 400).map((x) => ({ who: x && x.who === 'caller' ? 'caller' : 'trainee', text: String((x && x.text) || '').slice(0, 1500) })).filter((x) => x.text);
        if (p.metrics && typeof p.metrics === 'object') {
          const m = p.metrics, n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : undefined);
          d.metrics = { ringMs: n(m.ringMs), talkMs: n(m.talkMs), endedBy: m.endedBy === 'caller' ? 'caller' : 'trainee', endReason: String(m.endReason || '').slice(0, 40),
            holds: (Array.isArray(m.holds) ? m.holds : []).slice(0, 30).map((h) => ({ start: n(h.start), end: n(h.end) })),
            transfers: (Array.isArray(m.transfers) ? m.transfers : []).slice(0, 10).map((x) => ({ to: String(x.to || '').slice(0, 80), ext: String(x.ext || '').slice(0, 8), result: String(x.result || '').slice(0, 20) })),
            voice: m.voice === 'text' ? 'text' : 'voice' };
        }
        if (p.end) { r.status = 'ended'; r.ended_at = now(); r._grade = 'end'; }
      }
    }
    // The trainee only ever sees the review that was sent; a saved draft stays with the trainer until sent.
    if (who.role === 'a' && p.review) {
      const v = p.review, str = (x, n) => String(x == null ? '' : x).slice(0, n);
      const score5 = (x) => { const n = Math.round(Number(x)); return n >= 1 && n <= 5 ? n : null; };
      const criteria = (Array.isArray(v.criteria) ? v.criteria : []).slice(0, 24).map((c) => ({ name: str(c.name, 80), score: score5(c.score), evaluation: str(c.evaluation, 1500) }));
      const sc = weightedScore(r.track, criteria, this.getSettings().weights);
      const rev = { verdict: str(v.verdict, 80), summary: str(v.summary, 3000), criteria,
        goals: (Array.isArray(v.goals) ? v.goals : []).slice(0, 20).map((g) => ({ goal: str(g.goal, 300), met: ['yes', 'partly', 'no', 'n/a'].includes(g.met) ? g.met : 'no', evidence: str(g.evidence, 500) })),
        note: str(v.note, 1500), tips: (Array.isArray(v.tips) ? v.tips : []).slice(0, 5).map((x) => str(x, 300)).filter(Boolean),
        by: who.id, savedAt: now(), avg: sc ? sc.avg : null, pct: sc ? sc.pct : null };
      if (v.send) {
        d.review = Object.assign(rev, { sentAt: now(), seenAt: null });
        delete d.reviewDraft;
        r.reviewed = 1;
        r.score = sc ? sc.pct : null;
      } else d.reviewDraft = rev;
    }
    const why = r._grade; delete r._grade;
    this.save(r);
    // The note is in (or a practice call ended): the call may be ready to grade. A note submitted after
    // the AI already graded without it is graded again, unless a trainer has started on the review.
    if (why) this.scheduleGrade(r.id, { again: why === 'note' && !d.review && !d.reviewDraft }).catch(() => {});
    return { ok: true, call: r };
  }

  /* ---------------- autograding ----------------
     A call is graded once it has ended, its recording for grading is in (if it was recorded) and the
     trainee has submitted the note; or after AUDIO_WAIT / NOTE_WAIT if either never comes. The Grader
     (src/grader.js) does the grading and calls applyAutograde. `force` grades now (a trainer's
     "grade again", or a practice call the trainee submitted). */
  async scheduleGrade(id, opts) {
    opts = opts || {};
    const r = this.row(id);
    if (!r || r.status !== 'ended' || !this.env.GRADER) return null;
    const d = r.data, st = this.getSettings();
    if (!opts.force && r.mode === 'live' && !st.autograde) return null;
    const ag = d.autograde || {};
    if (!opts.force && !opts.again && (ag.state === 'done' || ag.state === 'grading')) return ag;
    const t = now(), end = r.ended_at || t;
    let due = t;
    if (!opts.force) {
      const recorded = r.mode === 'live' ? !!d.record : !!(d.metrics && d.metrics.voice === 'voice');
      if (recorded && this.env.LSH_KV && !d.gradeAudio) due = Math.max(due, end + AUDIO_WAIT);
      if (!d.noteSubmittedAt) due = Math.max(due, end + NOTE_WAIT);
    }
    d.autograde = { state: 'queued', due, at: t };
    this.save(r);
    await this.env.GRADER.get(this.env.GRADER.idFromName('grader')).enqueue(id, due);
    this.tellGraded(r);
    return d.autograde;
  }
  // The recording for grading (8 kHz WAV in KV) and what the phone measured in it (dead air).
  async markGradeAudio(id, stats) {
    const r = this.row(id);
    if (!r) return null;
    r.data.gradeAudio = true;
    if (stats) r.data.audioStats = stats;
    this.save(r);
    await this.scheduleGrade(id, { again: !!(r.data.autograde && r.data.autograde.state === 'done' && !r.data.autograde.fromAudio && !r.data.review && !r.data.reviewDraft) });
    return true;
  }
  autogradeState(id, patch) {
    const r = this.row(id);
    if (!r) return null;
    r.data.autograde = Object.assign({}, r.data.autograde || {}, patch, { at: now() });
    this.save(r);
    this.tellGraded(r);
    return r.data.autograde;
  }
  // The AI's scorecard: on a practice call it's the trainee's result; on a live call it's a draft for the
  // trainer, or the trainee's review straight away when ⚙️ Setup releases AI grades automatically.
  applyAutograde(id, grade) {
    const r = this.row(id);
    if (!r) return null;
    const d = r.data, st = this.getSettings();
    const sc = weightedScore(r.track, grade.criteria, st.weights);
    grade.at = now(); grade.ai = true;
    grade.avg = sc ? sc.avg : null; grade.pct = sc ? sc.pct : null;
    if (grade.transcript && !(d.transcript && d.transcript.length)) d.transcript = grade.transcript;
    delete grade.transcript;
    d.autograde = { state: 'done', at: now(), fromAudio: !!grade.fromAudio, model: grade.model || '' };
    if (r.mode === 'ai') { d.ai = grade; if (!r.reviewed) r.score = grade.pct; }
    else {
      d.aiDraft = grade;
      d.aiScore = grade.pct;
      if (st.autoRelease && !(d.review && !d.review.ai) && !d.reviewDraft) {
        d.review = Object.assign({}, grade, { by: 'AI grader', sentAt: now(), seenAt: null });
        r.reviewed = 1; r.score = grade.pct;
      }
    }
    this.save(r);
    this.tellGraded(r);
    return r;
  }
  // Open pages of the trainer and the trainee update when a call's grade changes.
  tellGraded(r) {
    const msg = { t: 'graded', callId: r.id, state: (r.data.autograde || {}).state || '' };
    for (const w of this.ctx.getWebSockets()) {
      if (w.readyState !== OPEN) continue;
      const a = this.att(w);
      if ((a.role === 'a') || (a.role === 't' && a.id === r.trainee_id)) this.send(w, msg);
    }
  }

  /* ---------------- ⚙️ settings (graded mock calls) ---------------- */
  getSettings() {
    const row = this.sql.exec(`SELECT v FROM settings WHERE k = 'grading'`).toArray()[0];
    const v = row ? JSON.parse(row.v) : {};
    const out = Object.assign({}, DEFAULT_SETTINGS, v);
    out.weights = Object.assign({ reception: {}, calendar: {}, intake: {} }, v.weights || {});
    return out;
  }
  saveSettings(o) {
    o = o || {};
    const cur = this.getSettings();
    const weights = {};
    for (const [track, t] of Object.entries(TRACKS)) {
      weights[track] = {};
      const w = (o.weights && o.weights[track]) || cur.weights[track] || {};
      t.rubric.forEach((m) => { const k = Number(w[m.name]); if (Number.isFinite(k) && k >= 0 && k <= 10 && k !== 1) weights[track][m.name] = Math.round(k * 100) / 100; });
    }
    const pm = Number(o.passMark);
    const v = {
      autograde: o.autograde === undefined ? cur.autograde : !!o.autograde,
      autoRelease: o.autoRelease === undefined ? cur.autoRelease : !!o.autoRelease,
      defaultGraded: o.defaultGraded === undefined ? cur.defaultGraded : !!o.defaultGraded,
      passMark: o.passMark === null || o.passMark === '' ? null : Number.isFinite(pm) && pm > 0 && pm <= 100 ? Math.round(pm) : cur.passMark,
      weights
    };
    this.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('grading', ?)`, JSON.stringify(v));
    return this.getSettings();
  }

  // 📋 Graded mock calls: every graded live call with its scorecard (the sent review, else the AI's draft).
  gradedCalls(f) {
    f = f || {};
    const args = [];
    let where = `mode = 'live' AND status = 'ended'`;
    if (f.batch) { where += ' AND batch = ?'; args.push(f.batch); }
    const rows = this.sql.exec(`SELECT * FROM calls WHERE ${where} ORDER BY created_at DESC LIMIT 2000`, ...args).toArray();
    const out = [];
    for (const r of rows) {
      const d = JSON.parse(r.data || '{}');
      if (!d.graded) continue;
      const card = (d.review && d.review.sentAt ? d.review : null) || d.aiDraft || null;
      out.push({ id: r.id, createdAt: r.created_at, traineeId: r.trainee_id, traineeName: r.trainee_name, batch: r.batch, track: r.track, title: r.title, trainer: r.trainer,
        status: d.review && d.review.sentAt ? (d.review.ai ? 'released' : 'reviewed') : d.aiDraft ? 'ai' : (d.autograde && d.autograde.state) || 'pending',
        score: r.reviewed ? r.score : d.aiScore != null ? d.aiScore : null, avg: card ? card.avg : null,
        criteria: card ? card.criteria : [], verdict: card ? card.verdict : '', summary: card ? card.summary : '',
        talkMs: d.metrics && d.metrics.talkMs, recording: !!d.recording, noteSubmitted: !!d.noteSubmittedAt });
    }
    return out;
  }

  setRecording(id, meta) {
    const r = this.row(id);
    if (!r) return null;
    r.data.recording = meta;
    this.save(r);
    return true;
  }

  logUsage(who, kind) { this.sql.exec('INSERT INTO usage (who, kind, at) VALUES (?, ?, ?)', who, kind, now()); if (Math.random() < 0.02) this.sql.exec('DELETE FROM usage WHERE at < ?', now() - 7 * 86400000); }
  countUsage(who, kind, sinceMs) { return this.sql.exec('SELECT COUNT(*) AS n FROM usage WHERE who = ? AND kind = ? AND at > ?', who, kind, now() - sinceMs).toArray()[0].n; }

  stats() {
    const q = (s, ...a) => this.sql.exec(s, ...a).toArray()[0];
    return {
      trainees: q('SELECT COUNT(*) AS n FROM trainees WHERE archived = 0').n,
      online: new Set(this.ctx.getWebSockets('r:t').filter((w) => w.readyState === OPEN).map((w) => this.att(w).id)).size,
      liveNow: q(`SELECT COUNT(*) AS n FROM calls WHERE status = 'live' AND mode = 'live'`).n,
      calls: q(`SELECT COUNT(*) AS n FROM calls WHERE status = 'ended'`).n,
      toReview: q(`SELECT COUNT(*) AS n FROM calls WHERE status = 'ended' AND reviewed = 0 AND mode = 'live'`).n
    };
  }
}
