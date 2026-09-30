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
import { SCENARIOS, cleanScenario, lineOf, LINES, NOTE_FORMS, TRACKS, FIRM } from './scenarios.js';

const RING_MS = 45000;     // an unanswered call rings out after 45 seconds
const GRACE_MS = 30000;    // a dropped phone has 30 seconds to reconnect before its call ends
const MAX_CALL_MS = 2 * 3600 * 1000;
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
    return new Response(null, { status: 101, webSocket: client });
  }

  // What each side is told about a call.
  brief(r, role) {
    const s = r.data.scenario;
    const line = lineOf(s.track);
    const b = { callId: r.id, status: r.status, line, lineLabel: LINES[line].label, lineNumber: LINES[line].number, track: s.track,
      callerId: r.data.withheld ? { name: 'PRIVATE CALLER', number: 'Unknown' } : { name: s.caller.idName, number: s.caller.number },
      createdAt: r.created_at, answeredAt: r.answered_at || null, recording: !!r.data.record, trainer: r.trainer };
    if (role === 'a') Object.assign(b, { scenario: s, trainee: { id: r.trainee_id, name: r.trainee_name, batch: r.batch }, note: r.data.note || {}, ticks: r.data.ticks || [], metrics: r.data.metrics || {}, traineeCid: r.data.traineeCid || null });
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
    delete r.data.lost;
    (r.data.events = r.data.events || []).push({ t: 'end', by, reason, at: t });
    this.save(r);
    const msg = { t: 'ended', callId: r.id, by, reason, status: r.status };
    for (const w of this.ctx.getWebSockets()) { const a = this.att(w); if (a.call === r.id || (a.role === 't' && a.id === r.trainee_id && r.status !== 'ended') || (a.role === 'a' && a.cid === r.data.trainerCid)) this.send(w, msg); }
    this.clearCallOn(r.id);
    this.presence();
  }

  async armAlarm(at) {
    const cur = await this.ctx.storage.getAlarm();
    if (!cur || cur > at) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const t = now();
    let next = 0;
    for (const x of this.sql.exec(`SELECT id FROM calls WHERE status IN ('ringing', 'live') AND mode = 'live'`).toArray()) {
      const r = this.row(x.id);
      if (r.status === 'ringing') {
        if (t - r.created_at >= RING_MS) this.endCall(r, 'system', 'no-answer');
        else next = next ? Math.min(next, r.created_at + RING_MS) : r.created_at + RING_MS;
      } else if (r.data.lost) {
        if (t - r.data.lost.at >= GRACE_MS) this.endCall(r, r.data.lost.role === 'a' ? 'trainer' : 'trainee', 'disconnected');
        else next = next ? Math.min(next, r.data.lost.at + GRACE_MS) : r.data.lost.at + GRACE_MS;
      } else if (t - (r.answered_at || r.created_at) > MAX_CALL_MS) this.endCall(r, 'system', 'time-limit');
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
          status: 'ringing', created_at: t, data: { scenario: s, trainerCid: me.cid, record: m.record !== false, withheld: !!m.withhold, metrics: {}, note: {}, ticks: [], events: [{ t: 'ring', at: t }] } };
        this.save(r2);
        this.setAtt(ws, { call: r2.id });
        phones.forEach((w) => { this.setAtt(w, { call: r2.id, hand: false, handAt: 0 }); this.send(w, Object.assign({ t: 'incoming' }, this.brief(r2, 't'))); });
        this.send(ws, Object.assign({ t: 'ringing' }, this.brief(r2, 'a')));
        await this.armAlarm(t + RING_MS);
        this.presence();
        return;
      }
      case 'cancel':
        if (party && me.role === 'a' && r.status === 'ringing') this.endCall(r, 'trainer', m.reason === 'no-answer' ? 'no-answer' : 'cancelled');
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
        if (!trainer) { r.data.lost = { role: 'a', at: t }; this.save(r); await this.armAlarm(t + GRACE_MS); }
        this.presence();
        return;
      }
      case 'decline':
        if (party && me.role === 't' && r.status === 'ringing') this.endCall(r, 'trainee', 'declined');
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
        this.save(r);
        this.send(this.peerOf(r, 't'), { t: 'hold', callId: r.id, on: !!m.on, at: t });
        return;
      }
      case 'mute':
        if (party && r.status === 'live') this.send(this.peerOf(r, me.role), { t: 'mute', callId: r.id, on: !!m.on });
        return;
      case 'transfer': {
        if (!party || r.status !== 'live' || me.role !== 't') return;
        const d = FIRM.directory.find((x) => x.ext === String(m.ext));
        if (!d) return;
        (r.data.metrics.transfers = r.data.metrics.transfers || []).push({ to: d.name, ext: d.ext, at: t, result: null });
        this.save(r);
        this.send(this.peerOf(r, 't'), { t: 'transfer', callId: r.id, to: d.name, ext: d.ext, role: d.role, unavailable: (r.data.scenario.unavailable || []).includes(d.ext) });
        return;
      }
      case 'transfer-result': {
        if (!party || r.status !== 'live' || me.role !== 'a') return;
        const tx = (r.data.metrics.transfers || []).slice(-1)[0];
        if (!tx || tx.result) return;
        const result = ['connected', 'no-answer', 'voicemail'].includes(m.result) ? m.result : 'no-answer';
        tx.result = result; tx.done = t;
        this.save(r);
        this.send(this.peerOf(r, 'a'), { t: 'transfer-result', callId: r.id, result, to: tx.to, ext: tx.ext });
        if (result === 'connected') this.endCall(r, 'trainee', 'transferred');
        return;
      }
      case 'timeout':   // the trainer pauses the role-play to coach, then resumes it
        if (!party || r.status !== 'live' || me.role !== 'a') return;
        r.data.events.push({ t: m.on ? 'coach' : 'resume', at: t }); this.save(r);
        this.send(this.peerOf(r, 'a'), { t: 'timeout', callId: r.id, on: !!m.on, msg: String(m.msg || '').slice(0, 300) });
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
        if (me.role === 'a') r.data.trainerCid = me.cid; else r.data.traineeCid = me.cid;
        if (r.data.lost && r.data.lost.role === me.role) delete r.data.lost;
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
          r.data.lost = { role: me.role, at: now() };
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
  upsertTrainee(id, name, batch) {
    const cur = this.trainee(id);
    if (cur) this.sql.exec('UPDATE trainees SET name = ?, batch = ?, last_seen = ? WHERE id = ?', name, batch, now(), id);
    else this.sql.exec('INSERT INTO trainees (id, name, batch, created_at, last_seen) VALUES (?, ?, ?, ?, ?)', id, name, batch, now(), now());
    return this.trainee(id);
  }
  getTrainee(id) { return this.trainee(id); }
  listTrainees() {
    return this.sql.exec(`SELECT t.*, (SELECT COUNT(*) FROM calls c WHERE c.trainee_id = t.id AND c.status = 'ended') AS calls,
      (SELECT AVG(score) FROM calls c WHERE c.trainee_id = t.id AND c.score IS NOT NULL) AS avg FROM trainees t ORDER BY batch, name`).toArray();
  }
  setArchived(id, archived) { this.sql.exec('UPDATE trainees SET archived = ? WHERE id = ?', archived ? 1 : 0, id); return this.trainee(id); }

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
    const rows = this.sql.exec(`SELECT * FROM calls ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`, ...args, Math.min(Number(f.limit) || 50, 200)).toArray();
    return rows.map((r) => {
      const d = JSON.parse(r.data || '{}');
      return { id: r.id, mode: r.mode, track: r.track, scenarioId: r.scenario_id, title: r.title, traineeId: r.trainee_id, traineeName: r.trainee_name, batch: r.batch, trainer: r.trainer,
        status: r.status, createdAt: r.created_at, answeredAt: r.answered_at, endedAt: r.ended_at, reviewed: !!r.reviewed, score: r.score,
        talkMs: d.metrics && d.metrics.talkMs, ringMs: d.metrics && d.metrics.ringMs, recording: !!d.recording, ai: !!d.ai, noteSubmitted: !!d.noteSubmittedAt, reviewSeen: !!(d.review && d.review.seenAt) };
    });
  }
  getCall(id) { return this.row(id); }
  deleteCall(id) { this.sql.exec('DELETE FROM calls WHERE id = ?', id); return true; }

  // A practice call with the AI caller (the trainee's browser runs the call).
  startAiCall(who, scenarioId) {
    const s = this.scenario(scenarioId);
    if (!s) return null;
    const t = now();
    const r = { id: newId(), mode: 'ai', track: s.track, scenario_id: s.id, title: s.title, trainee_id: who.id, trainee_name: who.name, batch: who.batch || '', trainer: '',
      status: 'live', created_at: t, answered_at: t, data: { scenario: s, metrics: {}, note: {}, transcript: [], events: [] } };
    this.save(r);
    return { id: r.id, scenario: s };
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
      if (p.submit && !d.noteSubmittedAt && r.status !== 'live') d.noteSubmittedAt = now();
      if (p.seen && d.review && d.review.sentAt && !d.review.seenAt) d.review.seenAt = now();
      if (r.mode === 'ai' && r.status === 'live') {
        if (Array.isArray(p.transcript)) d.transcript = p.transcript.slice(0, 400).map((x) => ({ who: x && x.who === 'caller' ? 'caller' : 'trainee', text: String((x && x.text) || '').slice(0, 1500) })).filter((x) => x.text);
        if (p.metrics && typeof p.metrics === 'object') {
          const m = p.metrics, n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : undefined);
          d.metrics = { ringMs: n(m.ringMs), talkMs: n(m.talkMs), endedBy: m.endedBy === 'caller' ? 'caller' : 'trainee', endReason: String(m.endReason || '').slice(0, 40),
            holds: (Array.isArray(m.holds) ? m.holds : []).slice(0, 30).map((h) => ({ start: n(h.start), end: n(h.end) })),
            transfers: (Array.isArray(m.transfers) ? m.transfers : []).slice(0, 10).map((x) => ({ to: String(x.to || '').slice(0, 80), ext: String(x.ext || '').slice(0, 8), result: String(x.result || '').slice(0, 20) })),
            voice: m.voice === 'text' ? 'text' : 'voice' };
        }
        if (p.end) { r.status = 'ended'; r.ended_at = now(); }
      }
    }
    if (who.role === 'a' && p.review) {
      const v = p.review, str = (x, n) => String(x == null ? '' : x).slice(0, n);
      const criteria = (Array.isArray(v.criteria) ? v.criteria : []).slice(0, 8).map((c) => ({ name: str(c.name, 80), score: Math.max(1, Math.min(5, Math.round(Number(c.score) || 0))) || null, evaluation: str(c.evaluation, 1500) }));
      const scores = criteria.map((c) => c.score).filter(Boolean);
      d.review = { verdict: str(v.verdict, 80), summary: str(v.summary, 3000), criteria,
        goals: (Array.isArray(v.goals) ? v.goals : []).slice(0, 20).map((g) => ({ goal: str(g.goal, 300), met: ['yes', 'partly', 'no', 'n/a'].includes(g.met) ? g.met : 'no', evidence: str(g.evidence, 500) })),
        note: str(v.note, 1500), tips: (Array.isArray(v.tips) ? v.tips : []).slice(0, 5).map((x) => str(x, 300)).filter(Boolean),
        by: who.id, savedAt: now(), sentAt: v.send ? now() : (d.review && d.review.sentAt) || null, seenAt: v.send ? null : (d.review && d.review.seenAt) || null };
      if (v.send) { r.reviewed = 1; r.score = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 20) : null; }
    }
    this.save(r);
    return { ok: true, call: r };
  }

  // The AI's scorecard: shown to the trainee on practice calls; a draft for the trainer on live calls.
  setGrade(id, grade, draft) {
    const r = this.row(id);
    if (!r) return null;
    grade.at = now();
    if (grade.transcript && !(r.data.transcript && r.data.transcript.length)) r.data.transcript = grade.transcript;
    delete grade.transcript;
    if (draft) r.data.aiDraft = grade;
    else {
      r.data.ai = grade;
      const scores = grade.criteria.map((c) => c.score).filter(Boolean);
      if (!r.reviewed && scores.length) r.score = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 20);
    }
    this.save(r);
    return r;
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
