/* =========================================================
   🎛 The trainer's console
   The switchboard (who is online, available, asking for a call),
   the scenario to play, and the call itself: the trainer rings the
   trainee, plays the caller over live audio with the script and a
   checklist in front of them, sees the trainee's note as it's typed,
   answers the trainee's transfers ("picks up" / "no answer" /
   "voicemail"), can pause the role-play to coach, and records the call.
   It's laid out as a desk phone: ☎ the dialer (dial the trainee's
   extension, or pick them on the switchboard; 📞 rings them), with
   🔊 Speaker, Mute and the coaching time-out on its keys.
   App.t is the call: { status: ringing · connecting · live · ended, … }.
   ========================================================= */
(function () {
  'use strict';
  const { esc } = U;
  const C = window.Console = {};
  const remote = () => document.getElementById('remoteAudio');
  const active = (t) => t && ['ringing', 'connecting', 'live'].includes(t.status);
  const pick = C.pick = { dial: '', traineeId: '', scenarioId: '', track: 'reception', record: true, withhold: false, batch: '', graded: null, voice: '', aiPool: [] };
  // The two sidebars beside the dialer, each of which the trainer can minimize to a rail.
  const FOLD_R = 'conR';
  // 📋 Graded mock call: starts as ⚙️ Setup says, then as the trainer last left it (on this computer).
  const gradedPick = () => {
    if (pick.graded === null) { let v = null; try { v = localStorage.getItem('mcv_graded'); } catch (e) {} pick.graded = v === null ? !!(App.cfg.settings && App.cfg.settings.defaultGraded) : v === '1'; }
    return pick.graded;
  };

  /* ---------- Switchboard messages ---------- */
  C.onUp = function (m) {
    const t = App.t, a = m.active;
    if (t && active(t)) {
      if (a && a.callId === t.callId && a.status === 'live') App.board.send({ t: 'resume', callId: t.callId });
      else if (!a || a.callId !== t.callId) endCall({ by: 'system', reason: 'disconnected', status: t.status === 'ringing' ? 'cancelled' : 'ended' });
      return;
    }
    // A call is on the line: this tab reloaded during it (pick it back up), or another tab has it (offer to move it here).
    if (a && a.status === 'live') {
      App.t = Object.assign(fromBrief(a), { answeredAt: a.answeredAt || Date.now() }, liveState(a.live));
      if (App.ownCall() === a.callId) takeHere(); else { App.t.status = 'elsewhere'; render(); }
    }
  };
  function takeHere() {
    const t = App.t; if (!t) return;
    t.status = 'connecting'; t.resuming = true;
    App.ownCall(t.callId);
    App.board.send({ t: 'resume', callId: t.callId });
    render();
  }
  // What was happening on the line (hold, mute, coaching, a transfer waiting for an answer).
  const liveState = (lv) => {
    lv = lv || {};
    return { traineeHeld: !!lv.held, holdAt: lv.holdAt || 0, traineeMuted: !!lv.traineeMuted, coaching: !!lv.coaching,
      transfer: lv.transfer ? Object.assign({ at: Date.now() }, lv.transfer) : null };
  };
  C.onPresence = function () { if (App.route.name === 'console') { renderRoster(); if (!App.t) { syncDial(); renderDialer(); } } };

  const fromBrief = (m) => ({ callId: m.callId, scenario: m.scenario, trainee: m.trainee, line: m.line, lineLabel: m.lineLabel, callerId: m.callerId, record: !!m.recording, graded: !!m.graded,
    ringAt: m.createdAt || Date.now(), note: m.note || {}, ticks: m.ticks || [], metrics: m.metrics || {}, traineeHeld: false, traineeMuted: false, muted: false, transfer: null, coaching: false });

  C.onBoard = function (m) {
    const t = App.t;
    const mine = t && t.callId === m.callId;
    // 👥 Merge calls: the trainees merged into the call on the line each have their own leg.
    switch (m.t) {
      case 'conf-ringing':
        if (!t || m.parent !== t.callId) return;
        t.legs = (t.legs || []).filter((l) => l.callId !== m.callId);
        t.legs.push({ callId: m.callId, trainee: m.trainee, status: 'ringing', handover: !!m.handover, ringAt: m.createdAt || Date.now() });
        Sounds.beep();
        renderConf(); renderDialer();
        return;
      case 'conf-failed':
        U.toast(m.reason, 'error');
        return;
      case 'conf-parties': return;   // the trainees' own phones show who else is on the call
      case 'handover': return;        // the line already moved when the next trainee answered
      case 'conf-state': {
        if (!t || m.callId !== t.callId) return;
        const keep = new Set((m.legs || []).map((x) => x.callId));
        (t.legs || []).filter((l) => !keep.has(l.callId)).forEach((l) => legEnd(l));
        renderConf(); renderDialer();
        return;
      }
    }
    const leg = t && (t.legs || []).find((l) => l.callId === m.callId);
    if (leg) return onLeg(leg, m);
    switch (m.t) {
      case 'ai-call': aiUpsert(m.call); return;
      case 'ai-failed': U.toast(m.reason, 'error'); return;
      case 'ai-line': {
        const c = C.ai.get(m.callId); if (!c) return;
        const x = c.lines.find((l) => l.id === m.id); if (x) x.text = m.text; else c.lines.push({ id: m.id, who: m.who, text: m.text });
        if (C.follow === m.callId) renderFollow();
        return;
      }
      case 'ringing':
        C.ringSent = 0;
        App.t = Object.assign(fromBrief(m), { status: 'ringing' });
        Sounds.ringback();
        render(); App.onCallBar();
        return;
      case 'ring-failed': C.ringSent = 0; U.toast(m.reason, 'error'); VoIP.Mic.close(); render(); return;
      case 'accepted':
        // Answered just as this console cancelled: end it on the line too.
        if (!mine) { App.board.send({ t: 'hangup', callId: m.callId }); return; }
        App.ownCall(t.callId);
        Sounds.stop();
        t.status = 'connecting'; t.answeredAt = Date.now(); t.ringMs = m.ringMs;
        connect(t, Date.now());
        render();
        return;
      case 'moved':
        if (!mine) return;
        Sounds.stop();
        if (t.rtc) { t.rtc.close(); t.rtc = null; }
        if (t.rec) { t.rec.stop(); t.rec = null; }   // the tab that has the call now records the rest of it
        remote().srcObject = null; VoIP.Mic.close();
        App.t = null; App.ownCall(null);
        U.toast('The call moved to your other tab.');
        render(); App.onCallBar();
        return;
      case 'transfer-cancel':
        if (mine && t.transfer) { t.transfer = null; renderTransfer(); U.toast('The trainee took the caller back.'); }
        return;
      case 'resumed':
        if (!mine) return;
        Object.assign(t, { scenario: m.scenario, trainee: m.trainee, note: m.note || t.note, ticks: m.ticks || t.ticks, metrics: m.metrics || t.metrics }, liveState(m.live));
        if (t.resuming || !t.rtc) { t.resuming = false; connect(t, Date.now()); }
        render();
        return;
      case 'signal': {
        if (!mine || !t.rtc || !m.data) return;
        if (m.data.rejoin) { connect(t, Date.now()); return; }   // the trainee's page reloaded: start a new connection
        if (m.data.gen != null && m.data.gen !== t.rtc.gen) return;
        t.rtc.handle(m.data);
        return;
      }
      case 'hold':
        if (!mine) return;
        t.traineeHeld = !!m.on; t.holdAt = m.on ? Date.now() : 0;
        if (!m.on && t.transfer && t.transfer.result) t.transfer = null;
        renderDialer();
        return;
      case 'mute': if (mine) { t.traineeMuted = !!m.on; renderDialer(); } return;
      case 'transfer':
        if (!mine) return;
        t.transfer = { to: m.to, ext: m.ext, role: m.role, unavailable: !!m.unavailable, at: Date.now() };
        Sounds.beep();
        renderTransfer();
        return;
      case 'note':
        if (!mine) return;
        { const before = t.note || {}; t.note = m.note || {}; renderLiveNote(before); }
        return;
      // 🔎 The case file the trainee opened and is working from.
      case 'case':
        if (!mine) return;
        t.caseOpen = m.caseId ? m : null;
        renderCase();
        return;
      case 'peer-lost': if (mine) { t.peerLost = true; renderDialer(); } return;
      case 'peer-back': if (mine) { t.peerLost = false; renderDialer(); } return;
      case 'ended':
        if (!mine) return;
        if (t.status === 'elsewhere') { App.t = null; render(); return; }
        endCall(m);
        return;
      case 'gone': if (mine) endCall({ by: 'system', reason: 'gone', status: m.status }); return;
      case 'graded':
        if (C.ai.has(m.callId)) { if (m.state === 'done') C.loadAi(); else aiUpsert({ callId: m.callId, grade: m.state }); }
        if (mine && t.status === 'ended') { t.grade = m.state; renderEnded(); }
        return;
    }
  };

  /* ---------- 👥 Merge calls (a conference) ----------
     The trainer is already on a call and rings another trainee into it. The extra trainee answers the
     ordinary way; this browser then mixes the voices (VoIP.Mixer) and sends each person the trainer's
     microphone plus everyone else, so all three (or four) hear one another. The conference is recorded
     as one call on the trainer's side; the merged legs aren't graded of their own. */
  /* ↪ Transfer: the trainer hands the caller to another trainee, the way a switchboard passes a call
     on. Their phone rings; when they answer, the first trainee's call ends (graded on its own, so how
     they handed the call over is part of their score) and the caller carries on with the new one. */
  function confPick(over) {
    const t = App.t;
    if (!t || t.status !== 'live') return U.toast(`${over ? 'Transfer' : 'Merge'} works once a call is connected.`, 'error');
    const on = (t.legs || []).map((l) => l.trainee.id);
    if (over && on.length) return U.toast('Drop the merged trainees before you transfer the caller on.', 'error');
    const list = (App.presence.trainees || []).filter((x) => !x.call && x.id !== t.trainee.id && !on.includes(x.id));
    const m = App.modal({ title: over ? '↪ Transfer the caller to another trainee' : '👥 Merge another trainee into this call',
      body: `<p class="small muted">${over
        ? `Their phone rings like any call. When they answer, <b>${esc(t.trainee.name)}</b>'s call ends and you carry on with them, still as the same caller — so you can see whether the call was handed over properly. ${esc(t.trainee.name)}'s call is scored as it stands.`
        : `Their phone rings like any call. Once they answer, everyone on the call hears everyone: you (the caller), ${esc(t.trainee.name)}${(t.legs || []).length ? ', ' + (t.legs || []).map((l) => esc(l.trainee.name)).join(', ') : ''} and them. Up to two more trainees.`}</p>
        ${list.map((x) => `<div class="dir-row"><span class="ext mono">${esc(x.ext || '')}</span><div style="flex:1"><b>${esc(x.name)}</b><div class="small muted">${esc(x.batch)} · ${x.status === 'available' ? 'available' : 'away'}${x.hand ? ' · ✋ asked for a call' : ''}</div></div>
          <button class="btn btn-sm btn-green" data-merge="${esc(x.id)}">${over ? '↪ Transfer to them' : '👥 Merge in'}</button></div>`).join('') || '<div class="empty small">No other trainee is free right now.</div>'}` });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-merge]'); if (!b) return;
      App.board.send({ t: 'conf-ring', callId: t.callId, traineeId: b.dataset.merge, handover: !!over });
      m.close();
    });
  }

  // The next trainee answered a transfer: the first call ends, and the line carries on with them.
  async function handover(l) {
    const old = App.t; if (!old) return;
    old.legs = (old.legs || []).filter((x) => x !== l);
    const base = { scenario: old.scenario, line: old.line, lineLabel: old.lineLabel, callerId: old.callerId, record: old.record, graded: old.graded };
    endCall({ by: 'trainer', reason: 'handover' });
    App.t = Object.assign({}, base, { callId: l.callId, status: 'connecting', trainee: l.trainee, handoverFrom: old.trainee.name,
      ringAt: l.ringAt || Date.now(), answeredAt: Date.now(), note: {}, ticks: [], metrics: {},
      traineeHeld: false, traineeMuted: false, muted: false, transfer: null, coaching: false, legs: [] });
    App.ownCall(App.t.callId);
    U.toast(`↪ ${old.trainee.name}'s call is scored as it stands; you're on the line with ${l.trainee.name} now.`, 'ok');
    connect(App.t, Date.now());
    render(); App.onCallBar();
  }

  function onLeg(l, m) {
    const t = App.t; if (!t) return;
    switch (m.t) {
      case 'accepted':
        l.status = 'connecting'; l.answeredAt = Date.now();
        if (l.handover) { handover(l); return; }
        legConnect(l, Date.now());
        renderConf(); renderDialer();
        return;
      case 'signal':
        if (!l.rtc || !m.data) return;
        if (m.data.rejoin) { legConnect(l, Date.now()); return; }
        if (m.data.gen != null && m.data.gen !== l.rtc.gen) return;
        l.rtc.handle(m.data);
        return;
      case 'hold': l.held = !!m.on; renderConf(); return;
      case 'mute': l.muted = !!m.on; renderConf(); return;
      case 'peer-lost': l.lost = true; renderConf(); return;
      case 'peer-back': l.lost = false; renderConf(); return;
      // A merged trainee pressing Transfer: on a conference there's no extension to ring, so it comes
      // back as no answer and they carry on with everyone on the line.
      case 'transfer':
        App.board.send({ t: 'transfer-result', callId: l.callId, result: 'no-answer' });
        U.toast(`${l.trainee.name} tried to transfer the caller to ${m.to}: on a conference that comes back as no answer.`);
        return;
      case 'ended': case 'gone':
        U.toast(`${l.trainee.name} left the conference.`);
        legEnd(l);
        return;
      default: return;
    }
  }

  // The trainer's own ears: each merged trainee plays in their own element (so the mix stays for the line).
  function legAudio(l) {
    if (!l.audio) {
      const a = document.createElement('audio');
      a.autoplay = true; a.setAttribute('data-leg', l.callId);
      document.body.appendChild(a);
      VoIP.Speaker.register(a);
      l.audio = a;
    }
    return l.audio;
  }

  async function legConnect(l, gen) {
    const t = App.t; if (!t) return;
    let stream;
    try { stream = await VoIP.Mic.open(); } catch (e) { return U.toast(e.message, 'error'); }
    const servers = await VoIP.ice();
    if (App.t !== t || !(t.legs || []).includes(l)) return;
    if (l.rtc) l.rtc.close();
    l.rtc = new VoIP.RtcCall({
      board: App.board, callId: l.callId, offerer: true, iceServers: servers, stream, gen,
      onRemote: (s) => {
        l.remote = s;
        const a = legAudio(l);
        a.srcObject = s; a.volume = App.volume == null ? 1 : App.volume; a.muted = C.classOn();
        a.play().catch(() => {});
        if (t.rec) t.rec.add(s);
        l.status = 'live';
        confSync(); renderConf(); renderDialer();
      },
      onState: (st) => { l.net = st; if (st === 'connected' && l.status === 'connecting') { l.status = 'live'; renderConf(); renderDialer(); } }
    });
    l.rtc.start();
  }

  // Who hears whom. Everyone gets the trainer's microphone and every other voice, never their own.
  function confSync() {
    const t = App.t; if (!t) return;
    const live = (t.legs || []).filter((l) => l.rtc && l.remote);
    if (!live.length) {
      if (t.mix) { if (t.rtc) t.rtc.setOutgoing(VoIP.Mic.track()); t.mix.close(); t.mix = null; }
      return;
    }
    if (!t.mix) {
      const mic = VoIP.Mic.stream; if (!mic) return;
      t.mix = new VoIP.Mixer(mic);
    }
    t.mix.resume();
    const parties = [{ id: t.callId, stream: (t.rtc && t.rtc.remote) || null, rtc: t.rtc }, ...live.map((l) => ({ id: l.callId, stream: l.remote, rtc: l.rtc }))];
    [...t.mix.legs.keys()].forEach((id) => { if (!parties.some((p) => p.id === id)) t.mix.remove(id); });
    parties.forEach((p) => { const track = t.mix.set(p.id, p.stream); if (p.rtc && track) p.rtc.setOutgoing(track); });
  }

  function legEnd(l) {
    const t = App.t;
    if (l.rtc) { l.rtc.close(); l.rtc = null; }
    if (l.audio) { VoIP.Speaker.unregister(l.audio); l.audio.srcObject = null; l.audio.remove(); l.audio = null; }
    l.remote = null;
    if (t) {
      t.legs = (t.legs || []).filter((x) => x !== l);
      if (t.mix) t.mix.remove(l.callId);
      confSync(); renderConf(); renderDialer();
    }
  }
  function legsClose() {
    const t = App.t; if (!t) return;
    (t.legs || []).slice().forEach((l) => {
      if (['ringing', 'connecting', 'live'].includes(l.status)) App.board.send({ t: l.status === 'ringing' ? 'cancel' : 'hangup', callId: l.callId });
      legEnd(l);
    });
    if (t.mix) { t.mix.close(); t.mix = null; }
  }
  const confCount = () => (App.t && (App.t.legs || []).filter((l) => l.status === 'live').length) || 0;

  // 👥 Who is on the call, beside the dialer: each merged trainee, and ⏏ to drop them.
  function renderConf() {
    const el = U.$('#confBox'); const t = App.t; if (!el) return;
    const legs = (t && t.legs) || [];
    if (!legs.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="card conf-card"><div class="card-head"><h3>👥 Conference</h3><span class="spacer"></span><span class="badge green">${legs.filter((l) => l.status === 'live').length + 1} trainees on the line</span></div>
      <div class="conf-row"><span class="led live"></span><div style="flex:1"><b>${esc(t.trainee.name)}</b><div class="small muted">${esc(t.trainee.batch || '')}${t.trainee.ext ? ' · ext ' + esc(t.trainee.ext) : ''} · took the call</div></div></div>
      ${legs.map((l) => `<div class="conf-row"><span class="led ${l.status === 'live' ? 'live' : 'ringing'}"></span>
        <div style="flex:1"><b>${esc(l.trainee.name)}</b><div class="small muted">${esc(l.trainee.batch || '')}${l.trainee.ext ? ' · ext ' + esc(l.trainee.ext) : ''} · ${l.handover ? '↪ transferring the caller to them…' : l.status === 'ringing' ? 'ringing…' : l.status === 'connecting' ? 'connecting…' : 'merged in'}${l.held ? ' · on hold' : ''}${l.muted ? ' · muted' : ''}${l.lost ? ' · reconnecting' : ''}</div></div>
        <button class="btn btn-sm" data-drop="${esc(l.callId)}" title="Take them off the call">⏏ Drop</button></div>`).join('')}
      <p class="small muted" style="margin:8px 0 0">Everyone hears everyone: your voice goes to all of them, and their voices to each other. The recording has every voice in it.</p></div>`;
  }

  /* ---------- the call ---------- */
  // The trainee on the dialer, or why there's nobody to ring.
  function dialTarget() {
    if (pick.dial) syncDial();
    if (pick.traineeId) return null;
    const d = dialed();
    return !d ? 'Dial the trainee\'s extension, or pick them on the switchboard.'
      : d.kind === 'offline' ? `${d.t.name}'s phone isn't open: they open ☎ LSH Ring Channel from the Portal to take calls.`
        : d.kind === 'trainer' ? `Ext ${pick.dial} is ${d.desk.name}'s trainer line. Trainers ring trainees, not each other.`
          : d.kind === 'dir' ? `Ext ${pick.dial} is ${d.dir.name}, in the firm's directory. Trainees' desks are 7001 and up.`
            : `No trainee answers at ext ${pick.dial}.`;
  }

  /* ---------- 🤖 AI calls: the AI plays the caller ----------
     The trainee's phone rings like any call; the AI plays the call picked under the dialer (or a random one on the
     line); the trainee's browser runs the conversation. Several can run at once: each shows in 🤖 AI calls, where the
     trainer follows the transcript and note live, can end it, and opens the AI's review afterwards. */
  C.ai = new Map();
  function aiRing() {
    if (!App.cfg.features.ai) return U.toast('AI callers need the Gemini keys (see ⚙️ Setup).', 'error');
    const why = dialTarget(); if (why) return U.toast(why, 'error');
    const s = App.scen[pick.scenarioId];
    if (s && s.ai === false) return U.toast(`"${s.title}" is live-only: the AI can't play it. Pick another call, or ring it yourself.`, 'error');
    App.board.send({ t: 'ai-ring', traineeId: pick.traineeId, scenarioId: pick.scenarioId || '', track: pick.track, graded: gradedPick(), voice: pick.voice || '' });
    U.toast(`🤖 Ringing ${(dialed() || {}).t ? dialed().t.name : 'the trainee'} with an AI caller${s ? ': ' + s.title : ' (a random ' + App.cfg.tracks[pick.track].label + ' call)'}.`, 'ok');
    pick.dial = ''; syncDial(); renderDialer(); renderRoster();
  }

  /* 🎭 AI caller setup: the trainer chooses which calls the AI may play (one, a few for it to draw
     from, or any call on the line), the voice it speaks with, whether the calls are graded, and which
     trainees to ring — several at once, each getting a call drawn from the chosen set. */
  function aiSetup() {
    if (!App.cfg.features.ai) return U.toast('AI callers need the Gemini keys (see ⚙️ Setup).', 'error');
    const online = (App.presence.trainees || []).filter((x) => !x.call);
    const chosen = new Set(pick.aiPool);
    const who = new Set(pick.traineeId ? [pick.traineeId] : []);
    let track = pick.track;
    const body = () => {
      const list = App.cfg.scenarios.filter((x) => x.track === track && x.ai !== false);
      return `<div class="ai-setup">
        <h4>🎚 The caller's voice</h4>
        <select class="input" id="asVoice">${App.voiceOptions(pick.voice)}</select>
        <h4>🎭 The calls the AI may play</h4>
        <div class="pill-tabs" id="asTrack">${Object.entries(App.cfg.tracks).map(([k, x]) => `<button data-astrack="${k}" class="${k === track ? 'on' : ''}">${x.icon} ${esc(x.label)}</button>`).join('')}</div>
        <p class="small muted">Tick the calls to draw from. With none ticked, the AI plays any call on the ${esc(lineOf(track).label)}. Each trainee gets one call drawn from what you tick.</p>
        <div class="pick-list" id="asScens">${list.map((x) => `<label class="pick ${chosen.has(x.id) ? 'on' : ''}"><input type="checkbox" data-asid="${esc(x.id)}" ${chosen.has(x.id) ? 'checked' : ''}>
          <span><b>${esc(x.title)}</b><br><span class="small muted">${esc(x.caller.name)} · ${esc(x.level)}${x.caseId ? ' · ' + esc(x.caseId) : ''}</span></span></label>`).join('') || '<div class="empty small">No call on this line can be played by the AI.</div>'}</div>
        <div class="row" style="margin:8px 0"><button class="btn btn-sm" data-asall="1">Tick all ${list.length}</button><button class="btn btn-sm" data-asnone="1">Clear</button></div>
        <h4>👥 Who to ring</h4>
        <div class="pick-list" id="asWho">${online.map((x) => `<label class="pick ${who.has(x.id) ? 'on' : ''}"><input type="checkbox" data-aswho="${esc(x.id)}" ${who.has(x.id) ? 'checked' : ''}>
          <span><b>${esc(x.name)}</b><br><span class="small muted">${esc(x.batch)}${x.ext ? ' · ext ' + esc(x.ext) : ''} · ${x.status === 'available' ? 'available' : 'away'}${x.hand ? ' · ✋ asked for a call' : ''}</span></span></label>`).join('') || '<div class="empty small">Nobody is free: trainees open 📞 My phone to take calls.</div>'}</div>
        <div class="row" style="margin:8px 0"><button class="btn btn-sm" data-aswhoall="1">Everyone free</button>
          <span class="spacer"></span><label class="check small"><input type="checkbox" id="asGraded" ${gradedPick() ? 'checked' : ''}> 📋 Graded mock calls</label></div>
      </div>`;
    };
    const m = App.modal({ title: '🎭 Send AI callers', wide: true, body: body(),
      foot: '<button class="btn btn-primary" data-assend="1">🤖 Ring them</button><button class="btn" data-x>Cancel</button>' });
    const redraw = () => { U.$('.modal-body', m.el).innerHTML = body(); };
    m.el.addEventListener('change', (e) => {
      const s = e.target.dataset.asid, w = e.target.dataset.aswho;
      if (s) { if (e.target.checked) chosen.add(s); else chosen.delete(s); e.target.closest('.pick').classList.toggle('on', e.target.checked); }
      if (w) { if (e.target.checked) who.add(w); else who.delete(w); e.target.closest('.pick').classList.toggle('on', e.target.checked); }
      if (e.target.id === 'asVoice') pick.voice = e.target.value;
    });
    m.el.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-astrack]');
      if (tb) { track = tb.dataset.astrack; redraw(); return; }
      if (e.target.closest('[data-asall]')) { App.cfg.scenarios.filter((x) => x.track === track && x.ai !== false).forEach((x) => chosen.add(x.id)); redraw(); return; }
      if (e.target.closest('[data-asnone]')) { chosen.clear(); redraw(); return; }
      if (e.target.closest('[data-aswhoall]')) { online.forEach((x) => who.add(x.id)); redraw(); return; }
      if (!e.target.closest('[data-assend]')) return;
      if (!who.size) return U.toast('Tick at least one trainee to ring.', 'error');
      const graded = !!U.$('#asGraded', m.el).checked;
      pick.graded = graded; try { localStorage.setItem('mcv_graded', graded ? '1' : '0'); } catch (err) {}
      pick.aiPool = [...chosen]; pick.voice = U.$('#asVoice', m.el).value;
      const ids = [...chosen];
      [...who].forEach((traineeId) => App.board.send({ t: 'ai-ring', traineeId, scenarioIds: ids, track, graded, voice: pick.voice }));
      U.toast(`🤖 Ringing ${who.size} trainee${who.size > 1 ? 's' : ''} with an AI caller${ids.length === 1 ? ': ' + App.scen[ids[0]].title : ids.length ? ' from ' + ids.length + ' calls' : ' (any ' + App.cfg.tracks[track].label + ' call)'}.`, 'ok');
      m.close();
      renderDialer();
    });
  }
  function aiUpsert(c) {
    const cur = C.ai.get(c.callId) || { lines: [] };
    C.ai.set(c.callId, Object.assign(cur, c));
    renderAiCalls(); if (C.follow === c.callId) renderFollow();
  }
  const aiLabel = (c) => c.status === 'ringing' ? `<span class="badge orange">Ringing</span>`
    : c.status === 'live' ? `<span class="badge green">On the call <span data-since="${c.answeredAt}">${U.since(c.answeredAt)}</span></span>`
      : c.status === 'missed' ? '<span class="badge red">Missed</span>' : c.status === 'declined' ? '<span class="badge red">Declined</span>' : c.status === 'cancelled' ? '<span class="badge">Busy</span>'
        : c.score != null ? `<span class="badge blue">🤖 ${c.score}%</span>` : c.grade === 'failed' ? '<span class="badge red">AI couldn\'t review</span>' : '<span class="badge amber">Ended · AI reviewing</span>';
  // 🤖 The AI calls on the line, the ones that ended and their scores: beside the call to play.
  function renderAiCalls() {
    const box = U.$('#aiBox'); if (!box) return;
    if (!U.$('#aiCalls', box)) box.innerHTML = '<div class="card" id="aiCalls"></div>';
    const el = U.$('#aiCalls', box); if (!el) return;
    const list = [...C.ai.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    el.innerHTML = `${list.length ? '' : `<div class="empty">${App.cfg.features.ai ? 'No AI calls yet. <b>🎭 Send AI callers…</b> rings one or several trainees with an AI caller.' : 'AI callers need the Gemini keys (see ⚙️ Setup).'}</div>`}
      ${list.map((c) => `<div class="aic"><div class="aic-who"><div class="nm">${esc(c.traineeName)} ${aiLabel(c)}</div><div class="bt">${esc(c.title)}${c.voice ? ' · 🎚 ' + esc(c.voice) : ''}${c.graded ? ' · 📋 graded' : ''}</div></div>
        ${['ringing', 'live'].includes(c.status) ? `<button class="btn btn-sm" data-aifollow="${esc(c.callId)}">👂 Follow</button><button class="btn btn-sm" data-aistop="${esc(c.callId)}" title="End this AI call">⏹</button>`
          : c.status === 'ended' ? `<a class="btn btn-sm" href="#/call/${esc(c.callId)}">📋 Review</a>` : ''}</div>`).join('')}`;
  }
  // 👂 Follow: the call's transcript and the trainee's note, live.
  function renderFollow() {
    const c = C.ai.get(C.follow), box = U.$('#aiFollow'); if (!c || !box) return;
    const form = App.formFor(c.track), n = c.note || {};
    box.innerHTML = `<p class="small">${aiLabel(c)} · ${esc(c.title)}</p>
      <div class="grid2"><div><h4>💬 What's being said</h4><div class="transcript" style="max-height:340px">${c.lines.map((l) => `<div class="tl ${l.who}"><b>${l.who === 'caller' ? 'AI caller' : esc(c.traineeName)}</b>${esc(l.text)}</div>`).join('') || '<div class="empty small">Nothing yet.</div>'}</div></div>
      <div><h4>📝 ${esc(form.title)}</h4><div class="live-note">${form.fields.filter((f) => n[f.k]).map((f) => `<div class="ln"><b>${esc(f.label)}</b><span>${esc(n[f.k])}</span></div>`).join('') || '<div class="empty small">Nothing typed yet.</div>'}</div></div></div>
      ${c.status === 'ended' ? `<p style="margin-top:10px"><a class="btn btn-primary" href="#/call/${esc(c.callId)}">📋 Open the call and the AI's review</a></p>` : ''}`;
    const t = U.$('.transcript', box); if (t) t.scrollTop = t.scrollHeight;
  }
  function aiFollow(id) {
    C.follow = id;
    const m = App.modal({ title: '👂 Following an AI call', wide: true, body: '<div id="aiFollow"></div>', onClose: () => { C.follow = null; } });
    m.el.addEventListener('click', (e) => { if (e.target.closest('a[href^="#/call/"]')) m.close(); });
    renderFollow();
  }
  C.loadAi = async function () {
    try { (await API.post('/api/ai/assigned')).calls.forEach((c) => aiUpsert(c)); } catch (e) { /* the list fills as calls come in */ }
  };

  async function ring() {
    if (active(App.t)) return U.toast('Hang up the current call first.', 'error');
    if (C.ringSent && Date.now() - C.ringSent < 5000) return;   // already ringing out
    if (!pick.dial && !pick.traineeId && C.lastDial) { setDial(C.lastDial); return; }   // 📞 on an empty screen: the last number (redial)
    const why = dialTarget(); if (why) return U.toast(why, 'error');
    // No call picked: an open call (no script) on the line chosen on the dialer.
    if (pick.scenarioId && !App.scen[pick.scenarioId]) pick.scenarioId = '';
    C.ringSent = Date.now();
    if (pick.dial) C.lastDial = pick.dial;
    try { await VoIP.Mic.open(); } catch (e) { C.ringSent = 0; return U.toast(e.message, 'error'); }
    VoIP.ice();   // warm up the TURN credentials
    App.t = null;
    const graded = gradedPick();
    App.board.send({ t: 'ring', traineeId: pick.traineeId, scenarioId: pick.scenarioId || '', track: pick.track, graded, record: (pick.record || graded) && App.cfg.features.recordings, withhold: pick.withhold });
  }

  async function connect(t, gen) {
    let stream;
    try { stream = await VoIP.Mic.open(); } catch (e) { U.toast(e.message, 'error'); return; }
    const servers = await VoIP.ice();
    if (App.t !== t) return;
    if (t.rtc) t.rtc.close();
    t.rtc = new VoIP.RtcCall({
      board: App.board, callId: t.callId, offerer: true, iceServers: servers, stream, gen,
      onRemote: (s) => {
        const a = remote(); a.srcObject = s; a.volume = App.volume == null ? 1 : App.volume; a.play().catch(() => {});
        C.syncAudio();
        if (t.record) { if (!t.rec) { try { t.rec = new VoIP.Recorder([stream, s]); } catch (e) { console.warn(e); } } else t.rec.add(s); }
        confSync();
      },
      onState: (st) => {
        if (App.t !== t) return;
        t.net = st;
        if (st === 'connected' && t.status === 'connecting') { t.status = 'live'; render(); }
        renderDialer();
      },
      onQuality: (q) => { if (App.t === t) { t.quality = q; renderDialBadges(); } }
    });
    t.rtc.start();
    clearTimeout(t.slowTimer);
    t.slowTimer = setTimeout(() => { if (App.t === t && t.status === 'connecting') { t.slow = true; renderDialer(); } }, 12000);
  }

  function hangup() {
    const t = App.t; if (!t) return;
    legsClose();
    if (t.status === 'ringing') App.board.send({ t: 'cancel', callId: t.callId });
    else App.board.send({ t: 'hangup', callId: t.callId });
    endCall({ by: 'trainer', reason: t.status === 'ringing' ? 'cancelled' : 'hangup', status: t.status === 'ringing' ? 'cancelled' : 'ended' });
  }

  async function endCall(m) {
    const t = App.t; if (!t || t.status === 'ended') return;
    Sounds.stop();
    legsClose();
    clearTimeout(t.slowTimer);
    if (App.ownCall() === t.callId) App.ownCall(null);
    const answered = t.status !== 'ringing' && t.answeredAt;
    if (t.rtc) { t.rtc.close(); t.rtc = null; }
    remote().srcObject = null;
    VoIP.Mic.close();
    if (!answered) {
      U.toast(m.reason === 'busy' ? `${t.trainee.name} is on a practice call with the AI caller; they were told you rang.` : m.status === 'declined' || m.reason === 'declined' ? `${t.trainee.name} declined the call.` : m.reason === 'no-answer' ? `${t.trainee.name} didn't answer (missed call).` : 'Call cancelled.', m.reason === 'cancelled' ? '' : 'error');
      App.t = null; render(); App.onCallBar();
      return;
    }
    t.status = 'ended'; t.endedAt = Date.now();
    t.endNote = m.reason === 'transferred' ? `The trainee transferred the call to ${t.transfer ? t.transfer.to : 'an extension'}` : m.reason === 'disconnected' ? 'The line dropped' : m.by === 'trainee' ? 'The trainee hung up' : m.by === 'trainer' ? 'You hung up' : '';
    Sounds.endTone();
    render(); App.onCallBar();
    if (t.rec) {
      t.upload = 'saving'; renderEnded();
      try {
        const { blob, type, durMs } = await t.rec.stop();
        t.rec = null;
        if (blob.size < 2000) throw new Error('The recording was empty.');
        await API.postBlob(`/api/recording/put?id=${encodeURIComponent(t.callId)}&dur=${durMs}`, blob, type);
        // The copy the AI grades from (8 kHz WAV) and the dead air measured in it.
        t.upload = 'prep'; if (App.t === t) renderEnded();
        try { t.deadAir = (await VoIP.uploadForGrading(t.callId, blob)).deadAir; } catch (e) { t.gradeCopyError = e.message; }
        t.upload = 'done';
      } catch (e) { t.upload = 'failed'; t.uploadError = e.message; }
      if (App.t === t) renderEnded();
    }
  }

  function toggleMute() {
    const t = App.t; if (!t || t.status !== 'live') return;
    t.muted = !t.muted;
    const tr = VoIP.Mic.track(); if (tr) tr.enabled = !t.muted;
    App.board.send({ t: 'mute', callId: t.callId, on: t.muted });
    renderDialer();
  }
  function toggleCoach() {
    const t = App.t; if (!t || t.status !== 'live') return;
    t.coaching = !t.coaching;
    App.board.send({ t: 'timeout', callId: t.callId, on: t.coaching });
    renderDialer();
  }
  function transferResult(result) {
    const t = App.t; if (!t || !t.transfer) return;
    t.transfer.result = result;
    App.board.send({ t: 'transfer-result', callId: t.callId, result });
    renderTransfer();
  }
  function tick(i, on) {
    const t = App.t; if (!t) return;
    const s = new Set(t.ticks || []);
    if (on) s.add(i); else s.delete(i);
    t.ticks = [...s].sort((a, b) => a - b);
    App.board.send({ t: 'ticks', callId: t.callId, ticks: t.ticks });
  }

  /* ---------- rendering ---------- */
  function render() {
    if (App.route.name !== 'console') { App.onCallBar(); return; }
    renderRoster();
    renderStage();
  }
  C.render = render;

  // The left sidebar: the LSH mark, then ☎ the switchboard (every phone that's open, by batch).
  function renderRoster() {
    const side = U.$('#sideL'); if (!side) return;
    if (!U.$('#roster', side)) {
      side.innerHTML = `<div class="side-brand"><img src="lsh-logo-dark.png" alt="Legal Support Help" width="150" height="40">
        <div class="sb-sub">Ring Channel · Switchboard</div></div><div class="card roster" id="roster"></div>`;
    }
    const el = U.$('#roster', side); if (!el) return;
    const all = (App.presence.trainees || []).slice();
    const batches = [...new Set([...all.map((x) => x.batch), ...(C.roster || []).map((x) => x.batch)].filter(Boolean))].sort();
    const shown = all.filter((x) => !pick.batch || x.batch === pick.batch).sort((a, b) => (b.hand - a.hand) || (a.handAt - b.handAt) || (a.status === 'available' ? -1 : 1) - (b.status === 'available' ? -1 : 1) || a.name.localeCompare(b.name));
    const online = new Set(all.map((x) => x.id));
    const offline = (C.roster || []).filter((x) => !online.has(x.id) && !x.archived && (!pick.batch || x.batch === pick.batch));
    const hands = all.filter((x) => x.hand).length;
    const desks = (App.desks || []).filter((d) => d.name !== App.me.name);
    el.innerHTML = `<div class="card-head"><h3>☎ Switchboard</h3><span class="spacer"></span><span class="badge green">${all.length} online</span>${hands ? `<span class="badge orange">✋ ${hands}</span>` : ''}</div>
      <div class="my-line"><div class="small muted">My trainer line</div><div class="nm">🎓 ${esc(App.me.name)}</div>
        <div class="bt">${App.myExt ? `ext <span class="mono">${esc(App.myExt)}</span> · ` : ''}${active(App.t) ? 'on a call' : 'free'}</div></div>
      ${desks.length ? `<div class="side-h small muted">Other trainers on</div>${desks.map((d) => `<div class="tr" style="cursor:default"><span class="led ${d.call ? 'ringing' : 'available'}"></span>
        <div style="flex:1;min-width:0"><div class="nm">🎓 ${esc(d.name)}</div><div class="bt">${d.ext ? `ext <span class="mono">${esc(d.ext)}</span> · ` : ''}${d.call ? 'on a call' : 'free'}</div></div></div>`).join('')}` : ''}
      <div class="side-h small muted">Trainees</div>
      <select class="input" id="batchSel" style="margin-bottom:10px"><option value="">All batches</option>${batches.map((b) => `<option ${b === pick.batch ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
      ${shown.map((x) => `<div class="tr ${x.id === pick.traineeId ? 'sel' : ''}" data-tid="${esc(x.id)}">
          <span class="led ${x.call ? 'ringing' : x.status}"></span>
          <div style="flex:1;min-width:0"><div class="nm">${esc(x.name)} ${x.hand ? '<span class="hand-wave" title="Asked for a mock call">✋</span>' : ''}</div><div class="bt">${esc(x.batch)}${x.ext ? ` · ext <span class="mono">${esc(x.ext)}</span>` : ''} · ${x.call ? 'on a call' : x.status === 'available' ? 'available' : 'away'}${x.tabs > 1 ? ` · ${x.tabs} tabs` : ''}</div></div>
          <button class="btn btn-sm ${x.call ? '' : 'btn-green'}" data-ring="${esc(x.id)}" ${x.call || active(App.t) ? 'disabled' : ''}>📞</button></div>`).join('') || '<div class="empty small">Nobody is online. Trainees open <b>📞 My phone</b> to take calls.</div>'}
      ${offline.length ? `<details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">${offline.length} offline</summary>${offline.map((x) => `<div class="tr" style="cursor:default"><span class="led"></span><div><div class="nm" style="font-weight:500">${esc(x.name)}</div><div class="bt">${esc(x.batch)}${x.ext ? ` · ext <span class="mono">${esc(x.ext)}</span>` : ''}${x.last_seen ? ' · seen ' + U.when(x.last_seen) : ''}</div></div></div>`).join('')}</details>` : ''}
      ${optionsHTML()}`;
    matchHeights();
  }

  /* How the next call is placed, on the switchboard beside the dialer: graded, recorded, caller ID
     withheld, the AI callers, and the Class view. The dialer itself keeps the keypad and the keys for
     the call on the line (⏸ Coaching time-out, 👥 Merge call, ↪ Transfer on). */
  function optionsHTML() {
    const onCall = active(App.t);
    const graded = gradedPick(), recOk = App.cfg.features.recordings, rec = (pick.record || graded) && recOk;
    return `<div class="board-opts">
      <div class="side-h small muted">How the next call is placed</div>
      <div class="soft-keys">
        <label class="soft ${graded ? 'on' : ''} ${onCall ? 'dis' : ''}" title="Graded mock calls are recorded, autograded on the program's Mock Calls Metrics, and listed in 📋 Graded calls"><input type="checkbox" id="pkGraded" ${graded ? 'checked' : ''} ${onCall ? 'disabled' : ''}><i class="dot"></i>📋 Graded</label>
        <label class="soft ${rec ? 'on' : ''} ${recOk && !graded && !onCall ? '' : 'dis'}" title="${recOk ? (graded ? 'Graded calls are always recorded' : 'Record the call (both voices) for the review') : 'Recordings aren\'t set up on this site'}"><input type="checkbox" id="pkRec" ${rec ? 'checked' : ''} ${recOk && !graded && !onCall ? '' : 'disabled'}><i class="dot"></i>Record</label>
        <label class="soft ${pick.withhold ? 'on' : ''} ${onCall ? 'dis' : ''}" title="The trainee's phone shows PRIVATE CALLER instead of the caller ID"><input type="checkbox" id="pkHide" ${pick.withhold ? 'checked' : ''} ${onCall ? 'disabled' : ''}><i class="dot"></i>🙈 Hide ID</label>
      </div>
      <div class="dev-btns">
        <button type="button" class="dev-btn ai" data-act="airing" title="Ring the trainee on the dialer with an AI caller: the AI plays the call picked, you follow it live, and the AI reviews it" ${App.cfg.features.ai ? '' : 'disabled'}>🤖 AI caller</button>
        <button type="button" class="dev-btn" data-act="aisetup" title="Choose the calls the AI may play, the voice it speaks with, and the trainees to ring (several at once)" ${App.cfg.features.ai ? '' : 'disabled'}>🎭 Choose…</button>
        <button type="button" class="dev-btn wide ${C.classOn() ? 'on' : ''}" data-act="classview" title="A tab to present in Google Meet: the trainee's side of the call and their note, no script">📺 ${C.classOn() ? 'Class view on' : 'Class view'}</button>
      </div></div>`;
  }

  /* The switchboard and the dialer are one piece: the board's case reaches down to the foot of the
     phone however short the batch is, and simply grows past it when the batch is long — it never
     scrolls inside itself. The call-to-play card on the right follows the same rule: it's capped to
     the dialer's own height, so the whole console reads as one screen, and its own list of calls
     scrolls inside the card instead of stretching the page past the dialer. */
  let deckWatch = null;
  // Measured once, the board goes stale the moment anything reflows the phone (a web font arriving
  // and rewrapping its text, the window resizing, a key appearing), so it follows the dialer instead.
  function fitBoard() {
    const card = U.$('#sideL .roster'), dialer = U.$('#dialer'), brand = U.$('#sideL .side-brand');
    if (!card || !dialer) return;
    if (window.innerWidth <= 1140) { card.style.minHeight = ''; return; }
    const want = dialer.getBoundingClientRect().height - (brand ? brand.getBoundingClientRect().height : 0);
    const h = Math.max(Math.round(want), 420) + 'px';
    if (card.style.minHeight !== h) card.style.minHeight = h;
  }
  function fitRight() {
    const card = U.$('#pkCard'), dialer = U.$('#dialer');
    if (!card || !dialer) return;
    if (window.innerWidth <= 1140) { card.style.height = ''; return; }
    const h = Math.max(Math.round(dialer.getBoundingClientRect().height), 420) + 'px';
    if (card.style.height !== h) card.style.height = h;
  }
  function matchHeights() {
    requestAnimationFrame(() => {
      fitBoard(); fitRight();
      const dialer = U.$('#dialer'), brand = U.$('#sideL .side-brand');
      if (!dialer || !window.ResizeObserver) return;
      if (deckWatch) deckWatch.disconnect();
      deckWatch = new ResizeObserver(() => { fitBoard(); fitRight(); });
      deckWatch.observe(dialer);
      if (brand) deckWatch.observe(brand);
    });
  }
  window.addEventListener('resize', () => { if (App.route.name === 'console') fitBoard(); });
  try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (App.route.name === 'console') fitBoard(); }); } catch (e) {}

  // The stage. Before a call: ☎ the dialer, and the call to play (optional) under it. During a call: the
  // dialer beside the script, checklist and live note. After it: the dialer beside the scorecard link.
  function renderStage() {
    const el = U.$('#stage'); if (!el) return;
    const t = App.t;
    if (t && t.status === 'elsewhere') {
      el.innerHTML = `<div class="card warn-box"><h3>📞 You're on a call in another tab</h3><p>With <b>${esc(t.trainee.name)}</b>: ${esc(t.scenario.title)}. Keep using that tab, or move the call here.</p>
        <button class="btn btn-green" data-act="takehere">📞 Take the call here</button></div>`;
      return;
    }
    if (!t) {
      el.innerHTML = `<div class="dial-stage"><div class="device dialer" id="dialer"></div><div class="dial-side" id="scenPreview"></div></div>`;
      renderDialer(); renderPicker(); renderPreview();
      return;
    }
    el.innerHTML = `<div class="dial-stage"><div class="device dialer" id="dialer"></div><div class="dial-side" id="dialSide"></div></div>`;
    const side = U.$('#dialSide');
    renderPicker();
    if (t.status === 'ended') { renderEndedSide(side); renderDialer(); return; }
    const s = t.scenario;
    const scriptCard = s.open ? `<div class="card script-card">
        <div class="card-head"><h3>🎙 Open call: no script</h3><span class="spacer"></span>${App.trackBadge(s.track)}</div>
        <p>Play any caller you like. The trainee sees <b class="mono">${esc(t.callerId.name)} ${esc(t.callerId.number)}</b> on the ${esc(t.lineLabel)} and takes the ${esc(App.formFor(s.track).title.toLowerCase())}.</p>
        <p class="small muted">${esc(s.hidden)}</p>
        <div class="field" style="margin-top:10px"><label class="f">📁 Play a client on file: open a case file</label><select class="input" id="ocCase"><option value="">Choose a case…</option>${Object.values(App.cfg.cases).map((x) => `<option value="${esc(x.id)}">${esc(x.id)} · ${esc(x.name)}</option>`).join('')}</select></div>
        <pre class="case hidden" id="ocCaseText"></pre>
        <p class="small muted">The AI grades an open call on the line's Mock Calls Metrics (there's no checklist).</p>
      </div>` : null;
    side.innerHTML = `<div id="xfer"></div><div id="caseBox"></div><div id="confBox"></div>
      ${scriptCard || `<div class="card script-card">
        <div class="card-head"><h3>🎭 You are the caller</h3><span class="spacer"></span>${App.trackBadge(s.track)}${App.levelBadge(s.level)}</div>
        <h2 style="margin-bottom:2px">${esc(s.caller.name)}</h2>
        <div class="muted small">${esc(s.caller.role)} · caller ID the trainee sees: <b class="mono">${esc(t.callerId.name)} ${esc(t.callerId.number)}</b> on the ${esc(t.lineLabel)}</div>
        <div class="small muted" style="margin-top:10px">Open with:</div>
        <div class="opening">${esc(s.opening)}</div>
        <h4>What you know and how you act</h4>
        <div class="persona">${esc(s.hidden)}</div>
        <h4 style="margin-top:12px">The situation</h4>
        <p class="small">${esc(s.facts)}</p>
        ${(s.unavailable || []).length ? `<p class="small">🚫 Not available for transfers: ${s.unavailable.map((x) => { const d = App.dirEntry(x); return d ? `<b>${esc(d.name)}</b> (${esc(x)})` : esc(x); }).join(', ')}</p>` : ''}
        ${s.caseId ? `<details><summary class="small" style="cursor:pointer">📁 Case file ${esc(s.caseId)}${(s.hideCases || []).includes(s.caseId) ? ' (not on file for the trainee: a first call)' : ''}</summary><pre class="case">${esc((App.cfg.cases[s.caseId] || {}).text || '')}</pre></details>` : ''}
      </div>`}
      <div class="live-cols">
        <div class="card">
          <div class="card-head"><h3>✅ Live checklist</h3><span class="spacer"></span><span class="small muted">Tick as it happens</span></div>
          <div id="goals">${(s.goals || []).length ? '' : '<div class="empty small">No checklist on an open call.</div>'}${(s.goals || []).map((g, i) => `<label class="goal ${(t.ticks || []).includes(i) ? 'done' : ''}"><input type="checkbox" data-goal="${i}" ${(t.ticks || []).includes(i) ? 'checked' : ''}><span>${esc(g)}</span></label>`).join('')}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>📝 The trainee's note</h3><span class="spacer"></span><span class="small muted">Live</span></div>
          <div class="live-note" id="liveNote"></div>
        </div>
      </div>`;
    renderDialer(); renderTransfer(); renderCase(); renderConf(); renderLiveNote();
  }

  /* ---------- ☎ the dialer: the trainer's desk phone ---------- */
  const PAD = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
  // Who the number on the screen reaches: a trainee whose phone is open, one whose isn't, a firm extension, or nobody.
  function dialed() {
    const d = pick.dial; if (!d) return null;
    const on = (App.presence.trainees || []).find((x) => x.ext === d);
    if (on) return { kind: 'online', t: on };
    const off = (C.roster || []).find((x) => x.ext === d && !x.archived);
    if (off) return { kind: 'offline', t: off };
    const desk = (App.desks || []).find((x) => x.ext === d);
    if (desk) return { kind: 'trainer', desk };
    const dir = App.dirEntry(d);
    if (dir) return { kind: 'dir', dir };
    return { kind: 'none' };
  }
  function syncDial() { const d = dialed(); pick.traineeId = d && d.kind === 'online' ? d.t.id : ''; }
  function setDial(v) { pick.dial = v; syncDial(); renderDialer(); renderRoster(); }
  function press(k) {
    if (App.t) return;
    Sounds.dtmf(k);
    if (pick.dial.length < 6) setDial(pick.dial + k);
    const b = U.$(`#dialer [data-dk="${k}"]`);
    if (b) { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 130); }
  }
  const lineOf = (track) => App.cfg.lines[track === 'intake' ? 'intake' : 'main'];
  const spkTitle = () => `🔊 Speaker: ${VoIP.Speaker.on ? 'on: the call plays on the speakers. Press to go back to the headset' : 'off: the call plays in the headset. Press to put it on the speakers'} (choose them in 🎧 Audio check)`;
  const spkKey = () => `<button type="button" class="key spk ${VoIP.Speaker.on ? 'on' : ''}" data-act="speaker" title="${esc(spkTitle())}" aria-pressed="${VoIP.Speaker.on}"><span class="ic">${VoIP.Speaker.on ? '🔊' : '🔈'}</span>Speaker</button>`;

  function dialBadges(t) {
    const f = [];
    if (t) {
      if (t.graded) f.push('<span class="lb grd">📋 GRADED</span>');
      if (t.record && t.status === 'live') f.push('<span class="lb rec">REC</span>');
      if (t.status === 'live') {
        if (t.traineeHeld) f.push(`<span class="lb hold">YOU'RE ON HOLD <span data-since="${t.holdAt}">${U.since(t.holdAt)}</span></span>`);
        if (t.traineeMuted) f.push('<span class="lb mute">TRAINEE MUTED</span>');
        if (t.muted) f.push('<span class="lb mute">YOU\'RE MUTED</span>');
        if (t.coaching) f.push('<span class="lb coach">⏸ COACHING</span>');
        if (confCount()) f.push(`<span class="lb conf">👥 CONFERENCE · ${confCount() + 1}</span>`);
        if (t.peerLost) f.push('<span class="lb warn">TRAINEE RECONNECTING</span>');
        if (t.quality) f.push(`<span class="lb" title="${t.quality.rtt != null ? t.quality.rtt + ' ms round trip' : ''}${t.quality.loss ? ' · ' + t.quality.loss + '% loss' : ''}${t.quality.relay ? ' · via TURN relay' : ''}"><span class="bars q${t.quality.bars}"><i></i><i></i><i></i><i></i></span>${t.quality.relay ? ' RELAY' : ''}</span>`);
      }
    }
    if (VoIP.Speaker.on && (!t || t.status !== 'ended')) f.push('<span class="lb spk">🔊 SPEAKER</span>');
    return f.join('');
  }
  function renderDialBadges() { const b = U.$('#dialer .lcd-badges'); if (b) b.innerHTML = dialBadges(App.t); }

  function renderDialer() {
    const el = U.$('#dialer'); if (!el) return;
    const t = App.t && App.t.status !== 'elsewhere' ? App.t : null;
    const status = t ? t.status : 'idle';
    const led = !App.connected ? 'offline' : status === 'ringing' ? 'ringing' : ['connecting', 'live'].includes(status) ? 'live' : 'available';
    let main, cid, keys;
    if (!t) {
      const d = dialed();
      const s = App.scen[pick.scenarioId];
      let st = 'Enter an extension', cls = '', nm = '', sub = C.lastDial ? `or pick a trainee on the switchboard · 📞 redials ${esc(C.lastDial)}` : 'or pick a trainee on the switchboard';
      if (d && d.kind === 'online') { st = d.t.call ? 'Busy: on a call' : 'Ready to call'; cls = d.t.call ? 'bad' : 'ok'; nm = d.t.name; sub = `${esc(d.t.batch)} · ${d.t.call ? 'on a call' : d.t.status === 'available' ? 'available' : 'away: they can still answer'}${d.t.hand ? ' · ✋ asked for a call' : ''}`; }
      else if (d && d.kind === 'offline') { st = 'Not signed in'; cls = 'bad'; nm = d.t.name; sub = `${esc(d.t.batch)} · their phone isn't open`; }
      else if (d && d.kind === 'trainer') { st = 'Trainer line'; nm = d.desk.name; sub = 'Another trainer\'s own desk: trainers ring trainees'; }
      else if (d && d.kind === 'dir') { st = 'Firm extension'; nm = d.dir.name; sub = 'Trainees\' desks are 7001 and up'; }
      else if (d) { st = pick.dial.length >= 4 ? 'No such extension' : 'Dialing…'; cls = pick.dial.length >= 4 ? 'bad' : ''; sub = ''; }
      main = `<div class="lcd-state ${cls}">${st}</div><div class="lcd-dial" id="dlNum">${esc(pick.dial)}<span class="caret"></span></div><div class="lcd-name sm">${esc(nm)}</div><div class="lcd-sub">${sub}</div>`;
      const oc = App.cfg.openCaller || { idName: 'WIRELESS CALLER', number: '' };
      const vName = (App.cfg.voices || []).find((v) => v.id === pick.voice);
      cid = `Calls as <b>${esc(pick.withhold ? 'PRIVATE CALLER' : s ? s.caller.idName + ' ' + s.caller.number : oc.idName + ' ' + oc.number)}</b> · ${esc(lineOf(pick.track).label)}<br>${s ? `🎭 ${esc(s.title)}` : '🎙 Open call: no script'}${vName ? ` · 🎚 ${esc(vName.label)}` : ''}`;
      keys = `<div class="line-keys" role="group" aria-label="Line">${Object.entries(App.cfg.tracks).map(([k, x]) => `<button type="button" class="${k === pick.track ? 'on' : ''}" data-line="${k}" aria-pressed="${k === pick.track}" title="${esc(x.label)} call on the ${esc(lineOf(k).label)}">${x.icon} ${esc(x.label)}</button>`).join('')}</div>
        <div class="dialpad">${PAD.map(([k, l]) => `<button type="button" class="dk" data-dk="${k}" aria-label="${k}"><b>${k}</b><small>${l || '&nbsp;'}</small></button>`).join('')}</div>
        <div class="dial-row">${spkKey()}<button type="button" class="dial-call" data-act="ring" title="Ring the trainee (Enter)" aria-label="Call">📞</button>
          <button type="button" class="key" data-act="backspace" title="Delete a digit (Esc clears)" ${pick.dial ? '' : 'disabled'}><span class="ic">⌫</span>Delete</button></div>
        <div class="dev-keys three idle-keys" role="group" aria-label="On the call">
          <button type="button" class="key" data-act="coach" disabled title="Pause the role-play to coach the trainee, then resume (once the call is connected)"><span class="ic">⏸</span>Coaching time-out</button>
          <button type="button" class="key conf" data-act="merge" disabled title="Merge another trainee into the call: their phone rings, and once they answer everyone hears everyone (once the call is connected)"><span class="ic">👥</span>Merge call</button>
          <button type="button" class="key" data-act="handover" disabled title="Hand the caller to another trainee: their phone rings, and when they answer this trainee's call ends and you carry on with the new one (once the call is connected)"><span class="ic">↪</span>Transfer on</button>
        </div>
        <p class="dev-hint">These come alive once the call is connected — and when the trainee transfers, you answer it here.</p>`;
    } else if (status === 'ended') {
      main = `<div class="lcd-state">Call ended</div><div class="lcd-name">${esc(t.trainee.name)}</div><div class="lcd-timer" style="color:#94a3b8">${U.dur(t.endedAt - t.answeredAt)}</div><div class="lcd-sub">${esc(t.endNote || '')}</div>`;
      cid = `Played <b>${esc(t.scenario.title)}</b>`;
      keys = `<div class="dev-keys"><button type="button" class="key answer wide" data-act="newcall"><span class="ic">📞</span>New call</button></div>`;
    } else {
      const live = status === 'live';
      const st = status === 'ringing' ? `Calling · <span data-rings="${t.ringAt}">${U.ringText(t.ringAt)}</span>`
        : status === 'connecting' ? (t.slow ? 'Still connecting the audio…' : 'Connecting…') : t.coaching ? 'Coaching time-out' : t.traineeHeld ? 'You\'re on hold' : 'Connected';
      main = `<div class="lcd-state ${live ? 'ok' : ''}">${st}</div><div class="lcd-name">${t.handoverFrom ? '↪ ' : ''}${esc(t.trainee.name)}</div><div class="lcd-num">${t.trainee.ext ? 'Ext ' + esc(t.trainee.ext) + ' · ' : ''}${esc(t.trainee.batch || '')}</div>${live ? `<div class="lcd-timer t" data-since="${t.answeredAt}">${U.since(t.answeredAt)}</div>` : ''}`;
      cid = `As <b>${esc(t.callerId.name)} ${esc(t.callerId.number)}</b> · ${esc(t.lineLabel)}`;
      keys = `<div class="dev-keys two">
          <button type="button" class="key mute ${t.muted ? 'on' : ''}" data-act="mute" ${live ? '' : 'disabled'}><span class="ic">${t.muted ? '🔇' : '🎙'}</span>${t.muted ? 'Unmute' : 'Mute'}</button>
          ${spkKey()}
          <button type="button" class="key coach ${t.coaching ? 'on' : ''}" data-act="coach" ${live ? '' : 'disabled'} title="Pause the role-play to coach the trainee, then resume"><span class="ic">${t.coaching ? '▶' : '⏸'}</span>${t.coaching ? 'Resume role-play' : 'Coaching time-out'}</button>
          <button type="button" class="key conf ${confCount() ? 'on' : ''}" data-act="merge" ${live ? '' : 'disabled'} title="Merge another trainee into this call: their phone rings, and once they answer everyone hears everyone"><span class="ic">👥</span>${confCount() ? 'Merge another' : 'Merge call'}</button>
          <button type="button" class="key wide" data-act="handover" ${live && !confCount() ? '' : 'disabled'} title="Hand the caller to another trainee: their phone rings, and when they answer this trainee's call ends and you carry on with the new one"><span class="ic">↪</span>Transfer on</button>
          <button type="button" class="key hang wide" data-act="hangup"><span class="ic">☎</span>${status === 'ringing' ? 'Cancel call' : 'End call'}</button></div>`;
    }
    matchHeights();
    el.innerHTML = `<div class="dev-head"><span class="led ${led}"></span><b>Trainer line</b>${App.myExt ? ` <span class="mono" title="Your own trainer extension on this switchboard">ext ${esc(App.myExt)}</span>` : ''}<span class="spacer"></span><span>${esc(App.me.name)}</span></div>
      <div class="lcd ${status === 'idle' ? 'idle' : status}"><div class="lcd-top"><span>${esc(App.cfg.firm.name || 'LSH Training Law Group')}</span><span data-clock></span></div>
        <div class="lcd-main">${main}</div><div class="lcd-badges">${dialBadges(t)}</div><div class="lcd-cid">${cid}</div></div>
      ${keys}
      <div class="dev-foot"><span title="Call volume">🔉</span><input type="range" min="0" max="1" step="0.05" value="${App.volume == null ? 1 : App.volume}" data-act="volume" aria-label="Call volume"><button type="button" class="dev-link" data-act="miccheck">🎧 Audio check</button></div>`;
    App.tick();
  }

  function renderTransfer() {
    const el = U.$('#xfer'); const t = App.t; if (!el) return;
    if (!t || !t.transfer || t.transfer.result) { el.innerHTML = t && t.transfer && t.transfer.result ? `<div class="note-box" style="margin-bottom:16px">↪ You answered the transfer to ${esc(t.transfer.to)}: <b>${t.transfer.result === 'no-answer' ? 'no answer' : t.transfer.result}</b>. The trainee is back with you when they press Resume.</div>` : ''; return; }
    const x = t.transfer;
    el.innerHTML = `<div class="xfer-panel"><div class="row"><b style="font-size:16px">↪ The trainee is transferring you to ${esc(x.to)} (ext ${esc(x.ext)})</b><span class="spacer"></span><span class="small">${esc(x.role || '')}</span></div>
      <p class="small" style="margin:6px 0 10px">${x.unavailable ? '🚫 The scenario says <b>' + esc(x.to) + ' is not available</b>.' : 'The scenario doesn\'t say this person is out.'} You decide what happens:</p>
      <div class="row"><button class="btn btn-green" data-xfer="connected">✅ Picks up (the call is handed over and ends)</button><button class="btn" data-xfer="no-answer">📵 No answer</button><button class="btn" data-xfer="voicemail">📨 Voicemail</button></div></div>`;
  }

  // 🔎 The case file the trainee chose in Case lookup: the right one, or not the one this call is about.
  function renderCase() {
    const el = U.$('#caseBox'); const t = App.t; if (!el) return;
    const c = t && t.caseOpen;
    if (!c) { el.innerHTML = ''; return; }
    const cls = c.right === false ? 'err-box' : c.right ? 'ok-box' : 'note-box';
    el.innerHTML = `<div class="${cls}" style="margin-bottom:16px">📁 The trainee is working from <b>${esc(c.caseId)}${c.name ? ' · ' + esc(c.name) : ''}</b>${c.right === false ? ` — this call is about <b>${esc(c.want)}</b>.` : c.right ? ' — the right case file.' : '.'}</div>`;
  }

  function renderLiveNote(before) {
    const el = U.$('#liveNote'); const t = App.t; if (!el || !t) return;
    const form = App.formFor(t.scenario.track);
    const n = t.note || {};
    const rows = form.fields.filter((f) => n[f.k]);
    el.innerHTML = rows.length ? rows.map((f) => `<div class="ln ${before && before[f.k] !== n[f.k] ? 'fresh' : ''}"><b>${esc(f.label)}</b><span>${esc(n[f.k])}</span></div>`).join('') : '<div class="empty small">Nothing typed yet.</div>';
    setTimeout(() => U.$$('.ln.fresh', el).forEach((x) => x.classList.remove('fresh')), 1600);
  }

  function renderEndedSide(el) {
    const t = App.t;
    el.innerHTML = `<div class="card"><div class="card-head"><h2>Call ended</h2><span class="spacer"></span><span class="badge">${U.dur(t.endedAt - t.answeredAt)}</span></div>
      <p><b>${esc(t.trainee.name)}</b> · ${esc(t.scenario.title)}${t.endNote ? ' · ' + esc(t.endNote) : ''}</p>
      <div id="endedInfo"></div>
      <div class="row" style="margin-top:12px"><a class="btn btn-orange" id="scoreBtn" href="#/call/${esc(t.callId)}">📋 Score this call →</a></div>
      <p class="small muted" style="margin-top:12px">The trainee is finishing and submitting their note; you'll see it on the scorecard. <b>📞 New call</b> on the dialer places the next one.</p></div>`;
    if (!t.grade && t.graded) t.grade = 'waiting';
    renderEnded();
  }
  function renderEnded() {
    const el = U.$('#endedInfo'); const t = App.t; if (!el || !t) return;
    const sb = U.$('#scoreBtn');
    if (sb) { const wait = t.upload === 'saving' || t.upload === 'prep'; sb.style.pointerEvents = wait ? 'none' : ''; sb.style.opacity = wait ? '.5' : ''; }
    const rec = !t.record ? '<p class="small muted">This call wasn\'t recorded.</p>'
      : t.upload === 'saving' ? '<p class="small">⏳ Saving the recording…</p>'
      : t.upload === 'prep' ? '<p class="small">✅ Recording saved. ⏳ Preparing it for grading…</p>'
      : t.upload === 'done' ? `<p class="small">✅ Recording saved${t.deadAir ? ` · dead air: ${t.deadAir.count ? `${t.deadAir.count} × 4 s or more (longest ${t.deadAir.longest} s)` : 'none over 4 s'}` : ''}.</p>`
      : t.upload === 'failed' ? `<p class="small err-box">The recording couldn't be saved: ${esc(t.uploadError || '')}</p>` : '';
    const ai = !App.cfg.features.ai || (App.cfg.settings && App.cfg.settings.autograde === false) ? ''
      : t.grade === 'done' ? `<p class="small">🤖 <b>Autograded.</b> <a href="#/call/${esc(t.callId)}">Open the scorecard</a> to check it and send it.</p>`
      : t.grade === 'grading' ? '<p class="small">🤖 The AI is grading the call now (it listens to the recording)…</p>'
      : t.grade === 'failed' ? '<p class="small err-box">The AI couldn\'t grade this call. Grade it on the scorecard, or try ✨ Grade again there.</p>'
      : '<p class="small">🤖 The AI grades the call as soon as the trainee submits the note (or in 10 minutes), from the recording.</p>';
    el.innerHTML = rec + ai;
  }

  /* ---------- 🎭 the calls to play (the right sidebar) ----------
     The type of call (Reception, Calendar, Intake) and the calls on that line, beside the dialer.
     Picking one is optional: with none picked the trainer rings an open call and plays any caller.
     The one picked is previewed under the dialer, next to 🤖 the AI calls. */
  function renderPicker() {
    const side = U.$('#sideR'); if (!side) return;
    const grid = U.$('#consoleGrid');
    const folded = App.folded(FOLD_R);
    if (grid) grid.classList.toggle('r-folded', folded);
    if (folded) { side.innerHTML = App.railHTML(FOLD_R, 'Calls to play', '🎭'); return; }
    const list = App.cfg.scenarios.filter((x) => x.track === pick.track);
    const s = App.scen[pick.scenarioId];
    const line = lineOf(pick.track).label;
    side.innerHTML = `<div class="card picker" id="pkCard">
      <div class="card-head"><h3>🎭 The call to play</h3><span class="spacer"></span>${App.foldKey(FOLD_R, 'the calls to play')}</div>
      <div class="pill-tabs" id="pkTrack">${Object.entries(App.cfg.tracks).map(([k, t]) => `<button data-track="${k}" class="${k === pick.track ? 'on' : ''}" title="${esc(t.label)} calls, on the ${esc(lineOf(k).label)}">${t.icon} ${esc(t.label)}</button>`).join('')}</div>
      <div class="callers compact" id="pkList">
        <div class="scen open ${s ? '' : 'sel'}" data-sid="" tabindex="0"><div class="cav">🎙</div>
          <div class="cbody"><h4>Open call: no script</h4><p>Any caller you like, on the ${esc(line)}</p></div></div>
        ${list.map((x) => `<div class="scen ${x.id === pick.scenarioId ? 'sel' : ''}" data-sid="${esc(x.id)}" tabindex="0" title="${esc(x.caller.name)}: ${esc(x.caller.role)}">
          <div class="cav">${esc((x.caller.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</div>
          <div class="cbody"><h4>${esc(x.title)}</h4><p>${App.levelBadge(x.level)}${x.caseId ? `<span class="badge">${esc(x.caseId)}</span>` : ''}${x.custom ? '<span class="badge blue">Yours</span>' : ''}</p></div></div>`).join('')}</div>
      <p class="small muted" style="margin:10px 0 0">Optional: the call the trainer plays. <a href="#/scenarios">📚 Write your own call</a></p></div>`;
    matchHeights();
  }

  // Under the dialer: the call picked on the right, ready to play.
  function renderPreview() {
    const el = U.$('#scenPreview'); if (!el) return;
    const s = App.scen[pick.scenarioId];
    if (!s) {
      const oc = App.cfg.openCaller || { idName: 'WIRELESS CALLER', number: '' };
      el.innerHTML = `<div class="card script-card"><div class="card-head"><h3>🎙 Open call: no script</h3><span class="spacer"></span>${App.trackBadge(pick.track)}</div>
        <p class="small">Play any caller you like. The trainee sees <b class="mono">${esc(oc.idName)} ${esc(oc.number)}</b> on the ${esc(lineOf(pick.track).label)} and takes the ${esc(App.formFor(pick.track).title.toLowerCase())}.</p>
        <p class="small muted">Pick a call on the right to play its script instead, with the caller's words, what they know and a checklist.</p></div>`;
      return;
    }
    el.innerHTML = `<div class="card script-card"><div class="card-head"><h3>🎭 Preview: ${esc(s.title)}</h3><span class="spacer"></span>${App.levelBadge(s.level)}</div>
      <p class="small"><b>${esc(s.caller.name)}</b>, ${esc(s.caller.role)} · caller ID <span class="mono">${esc(s.caller.idName)} ${esc(s.caller.number)}</span> on the ${esc(lineOf(s.track).label)}</p>
      <div class="opening">${esc(s.opening)}</div>
      <div class="grid2"><div><h4>What you know and how you act</h4><div class="persona">${esc(s.hidden)}</div></div>
      <div><h4>What a good call does</h4><ul class="small">${(s.goals || []).map((g) => `<li>${esc(g)}</li>`).join('')}</ul><h4>The situation</h4><p class="small">${esc(s.facts)}</p></div></div></div>`;
  }

  /* ---------- 📺 the Class view (a tab to present in Google Meet) ----------
     The Class view window (#/class, js/classview.js) is opened from here. It reads C.classState() and
     plays C.remoteStream(): the trainee's side of the call, hold music included. The trainer's own
     voice reaches Meet through their Meet microphone. While the Class view plays the call, this console
     stops playing it (so the trainer doesn't hear the trainee twice), and the trainee's phone is told the
     class is listening (so they mute the Meet tab and don't hear an echo). */
  C.classWin = null; C.classAudio = false;
  C.classOn = () => !!(C.classAudio && C.classWin && !C.classWin.closed);
  function openClassView() {
    if (C.classWin && !C.classWin.closed) { C.classWin.focus(); return; }
    C.classWin = window.open(location.pathname + '#/class', 'lshclassview', 'width=1200,height=760');
    if (!C.classWin) U.toast('The browser blocked the Class view window: allow pop-ups for this site, then try again.', 'error');
  }
  C.syncAudio = function () {
    if (!App.trainer() || App.isClassView) return;
    const on = C.classOn();
    remote().muted = on;
    ((App.t && App.t.legs) || []).forEach((l) => { if (l.audio) l.audio.muted = on; });
    const t = App.t;
    if (t && t.status === 'live' && t.classSent !== on) { t.classSent = on; App.board.send({ t: 'class', callId: t.callId, on }); }
    if (C._shown !== on) { C._shown = on; renderDialer(); renderRoster(); }
  };
  setInterval(() => { if (C.classWin && C.classWin.closed) { C.classWin = null; C.classAudio = false; } C.syncAudio(); }, 1000);
  // What the class may see: never the caller's script or the goals; the call's title only once it's over.
  C.classState = function () {
    const t = App.t;
    if (!t || t.status === 'elsewhere' || !t.scenario) return { status: 'idle' };
    const form = App.formFor(t.scenario.track);
    const ended = t.status === 'ended';
    return {
      status: t.status, callId: t.callId, trainee: { name: t.trainee.name, batch: t.trainee.batch || '' },
      lineLabel: t.lineLabel, callerId: t.callerId, trackLabel: (App.cfg.tracks[t.scenario.track] || {}).label || '',
      ringAt: t.ringAt || null, answeredAt: t.answeredAt || null, endedAt: t.endedAt || null, endNote: ended ? t.endNote || '' : '',
      held: !!t.traineeHeld, holdAt: t.holdAt || 0, coaching: !!t.coaching, record: !!t.record, reconnecting: !!t.peerLost,
      transfer: t.transfer ? { to: t.transfer.to, ext: t.transfer.ext, result: t.transfer.result || null } : null,
      noteTitle: form.title, note: form.fields.filter((f) => t.note && t.note[f.k]).map((f) => ({ label: f.label, value: String(t.note[f.k]) })),
      title: ended ? t.scenario.title : null, caller: ended ? { name: t.scenario.caller.name, role: t.scenario.caller.role } : null
    };
  };
  // On a conference the class hears every trainee on the line (the trainer's own voice goes through Meet).
  C.remoteStream = () => (App.t && App.t.mix ? App.t.mix.voices() : (App.t && App.t.rtc && App.t.rtc.remote) || null);

  /* ---------- 🤖 AI calls: its own page ----------
     The calls where the AI plays the caller: the ones ringing or on the line, the ones that ended and
     their scores, 👂 Follow for the transcript and the note live, and 🎭 Send AI callers… to start more.
     They run beside the trainer's own line, so they have the page to themselves. */
  App.register('aicalls', {
    trainer: true,
    render() {
      const app = U.$('#app');
      app.innerHTML = `<div class="ai-page">
        <div class="card-head"><h2>🤖 AI calls</h2><span class="spacer"></span>
          <button class="btn btn-primary" data-act="aisetup" ${App.cfg.features.ai ? '' : 'disabled'} title="Choose the calls, the voice and who to ring">🎭 Send AI callers…</button></div>
        <p class="muted">Calls where the AI plays the caller and the trainee takes it on their own phone. Send them to one trainee or to a whole batch; follow a call as it happens, and read the AI's review when it's over. The trainer's own line is free the whole time.</p>
        <div id="aiBox"></div></div>`;
      app.firstChild.addEventListener('click', onClick);
      renderAiCalls();
      C.loadAi();
    }
  });

  /* ---------- page ---------- */
  App.register('console', {
    trainer: true,
    async render() {
      const app = U.$('#app');
      app.innerHTML = `<div class="console ${App.folded(FOLD_R) ? 'r-folded' : ''}" id="consoleGrid">
        <aside class="console-side" id="sideL"></aside><div id="stage"></div><aside class="console-side right" id="sideR"></aside></div>`;
      App.leave = () => { document.removeEventListener('keydown', onKey); if (App.t && App.t.status === 'ended' && App.t.upload !== 'saving') App.t = null; };
      app.firstChild.addEventListener('click', onClick);
      app.firstChild.addEventListener('change', onChange);
      app.firstChild.addEventListener('input', onInput);
      document.addEventListener('keydown', onKey);
      render();
      renderPicker();
      try { C.roster = (await API.post('/api/trainees')).trainees; renderRoster(); if (!App.t) { syncDial(); renderDialer(); } } catch (e) {}
    }
  });

  function onClick(e) {
    const fold = e.target.closest('[data-fold]');
    if (fold) { App.folded(fold.dataset.fold, !App.folded(fold.dataset.fold)); renderPicker(); return; }
    // The switchboard is the phone's contact list: a trainee's row puts their extension on the dialer; 📞 also rings.
    const ringBtn = e.target.closest('[data-ring]');
    if (ringBtn) { if (App.t) return; pickTrainee(ringBtn.dataset.ring); ring(); return; }
    const tr = e.target.closest('[data-tid]');
    if (tr) { if (!App.t) pickTrainee(tr.dataset.tid); return; }
    const dk = e.target.closest('[data-dk]');
    if (dk) { press(dk.dataset.dk); return; }
    const trk = e.target.closest('[data-track]');
    if (trk && U.$('#pkTrack') && U.$('#pkTrack').contains(trk)) { setTrack(trk.dataset.track); return; }
    const ln = e.target.closest('[data-line]');
    if (ln) { setTrack(ln.dataset.line); return; }
    const sc = e.target.closest('[data-sid]');
    if (sc) { pickCall(sc.dataset.sid); return; }
    const af = e.target.closest('[data-aifollow]'); if (af) { aiFollow(af.dataset.aifollow); return; }
    const as = e.target.closest('[data-aistop]'); if (as) { if (confirm('End this AI call? The trainee\'s phone hangs up and the call is reviewed as it is.')) App.board.send({ t: 'ai-stop', callId: as.dataset.aistop }); return; }
    const drop = e.target.closest('[data-drop]');
    if (drop) { const l = (App.t && (App.t.legs || []).find((x) => x.callId === drop.dataset.drop)); if (l) { App.board.send({ t: l.status === 'ringing' ? 'cancel' : 'hangup', callId: l.callId }); legEnd(l); } return; }
    const xf = e.target.closest('[data-xfer]');
    if (xf) { transferResult(xf.dataset.xfer); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'ring') ring();
    else if (act === 'backspace') setDial(pick.dial.slice(0, -1));
    else if (act === 'airing') aiRing();
    else if (act === 'aisetup') aiSetup();
    else if (act === 'speaker') App.toggleSpeaker(renderDialer);
    else if (act === 'hangup') hangup();
    else if (act === 'mute') toggleMute();
    else if (act === 'coach') toggleCoach();
    else if (act === 'merge') confPick(false);
    else if (act === 'handover') confPick(true);
    else if (act === 'miccheck') App.micCheck();
    else if (act === 'newcall') { App.t = null; pick.dial = ''; syncDial(); render(); }   // the screen clears for the next call
    else if (act === 'takehere') takeHere();
    else if (act === 'classview') openClassView();
  }
  function pickTrainee(id) {
    const x = (App.presence.trainees || []).find((y) => y.id === id) || (C.roster || []).find((y) => y.id === id);
    if (x && x.ext) setDial(x.ext);
    else { pick.dial = ''; pick.traineeId = id; renderDialer(); renderRoster(); }
  }
  // The call to play: a scripted call from the library, or '' for an open call (no script).
  function pickCall(id) {
    pick.scenarioId = id && App.scen[id] ? id : '';
    if (pick.scenarioId) pick.track = App.scen[pick.scenarioId].track;
    renderPicker(); renderPreview(); renderDialer();
  }
  // The line (Reception, Calendar, Intake): which calls are listed, and where an open call rings.
  function setTrack(k) {
    if (!App.cfg.tracks[k]) return;
    pick.track = k;
    const s = App.scen[pick.scenarioId]; if (s && s.track !== k) pick.scenarioId = '';
    renderPicker(); renderPreview(); renderDialer();
  }
  // Typing on the keyboard dials too: digits, * and #; Backspace deletes, Esc clears, Enter rings.
  function onKey(e) {
    if (App.route.name !== 'console' || App.t || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-back')) return;
    const tg = e.target;
    if (tg && tg.closest && tg.closest('textarea, select, [contenteditable], input:not([type=checkbox]):not([type=range])')) return;
    if (/^[0-9*#]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace' && pick.dial) { e.preventDefault(); setDial(pick.dial.slice(0, -1)); }
    else if (e.key === 'Escape' && pick.dial) setDial('');
    else if (e.key === 'Enter' && (pick.dial || C.lastDial) && !(tg && tg.closest && tg.closest('button, a, [data-sid]'))) { e.preventDefault(); ring(); }
    else if (e.key === 'Enter' && tg && tg.dataset && tg.dataset.sid != null) { e.preventDefault(); pickCall(tg.dataset.sid); }
  }
  function onInput(e) {
    if (e.target.dataset && e.target.dataset.act === 'volume') {
      App.volume = Number(e.target.value);
      remote().volume = App.volume;
      ((App.t && App.t.legs) || []).forEach((l) => { if (l.audio) l.audio.volume = App.volume; });
    }
  }
  function onChange(e) {
    if (e.target.id === 'batchSel') { pick.batch = e.target.value; renderRoster(); }
    else if (e.target.id === 'pkRec') { pick.record = e.target.checked; renderDialer(); }
    else if (e.target.id === 'pkGraded') { pick.graded = e.target.checked; try { localStorage.setItem('mcv_graded', pick.graded ? '1' : '0'); } catch (err) {} renderDialer(); }
    else if (e.target.id === 'pkHide') { pick.withhold = e.target.checked; renderDialer(); }
    else if (e.target.id === 'ocCase') { const x = App.cfg.cases[e.target.value], pre = U.$('#ocCaseText'); if (pre) { pre.textContent = x ? x.text : ''; pre.classList.toggle('hidden', !x); } }
    else if (e.target.dataset.goal != null) { tick(Number(e.target.dataset.goal), e.target.checked); e.target.closest('.goal').classList.toggle('done', e.target.checked); }
  }
})();
