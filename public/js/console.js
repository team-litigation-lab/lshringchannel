/* =========================================================
   🎛 The trainer's console
   The switchboard (who is online, available, asking for a call),
   the scenario to play, and the call itself: the trainer rings the
   trainee, plays the caller over live audio with the script and a
   checklist in front of them, sees the trainee's note as it's typed,
   answers the trainee's transfers ("picks up" / "no answer" /
   "voicemail"), can pause the role-play to coach, and records the call.
   App.t is the call: { status: ringing · connecting · live · ended, … }.
   ========================================================= */
(function () {
  'use strict';
  const { esc } = U;
  const C = window.Console = {};
  const remote = () => document.getElementById('remoteAudio');
  const active = (t) => t && ['ringing', 'connecting', 'live'].includes(t.status);
  const pick = C.pick = { traineeId: '', scenarioId: '', track: 'reception', record: true, withhold: false, batch: '' };

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
  C.onPresence = function () { if (App.route.name === 'console') { renderRoster(); if (!active(App.t) && !(App.t && App.t.status === 'ended')) renderPickerTrainee(); } };

  const fromBrief = (m) => ({ callId: m.callId, scenario: m.scenario, trainee: m.trainee, line: m.line, lineLabel: m.lineLabel, callerId: m.callerId, record: !!m.recording,
    ringAt: m.createdAt || Date.now(), note: m.note || {}, ticks: m.ticks || [], metrics: m.metrics || {}, traineeHeld: false, traineeMuted: false, muted: false, transfer: null, coaching: false });

  C.onBoard = function (m) {
    const t = App.t;
    const mine = t && t.callId === m.callId;
    switch (m.t) {
      case 'ringing':
        App.t = Object.assign(fromBrief(m), { status: 'ringing' });
        Sounds.ringback();
        render(); App.onCallBar();
        return;
      case 'ring-failed': U.toast(m.reason, 'error'); VoIP.Mic.close(); render(); return;
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
        renderCallbar();
        return;
      case 'mute': if (mine) { t.traineeMuted = !!m.on; renderCallbar(); } return;
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
      case 'peer-lost': if (mine) { t.peerLost = true; renderCallbar(); } return;
      case 'peer-back': if (mine) { t.peerLost = false; renderCallbar(); } return;
      case 'ended':
        if (!mine) return;
        if (t.status === 'elsewhere') { App.t = null; render(); return; }
        endCall(m);
        return;
      case 'gone': if (mine) endCall({ by: 'system', reason: 'gone', status: m.status }); return;
    }
  };

  /* ---------- the call ---------- */
  async function ring() {
    if (active(App.t)) return U.toast('Hang up the current call first.', 'error');
    if (!pick.traineeId) return U.toast('Pick a trainee on the left.', 'error');
    if (!pick.scenarioId) return U.toast('Pick the call to play.', 'error');
    try { await VoIP.Mic.open(); } catch (e) { return U.toast(e.message, 'error'); }
    VoIP.ice();   // warm up the TURN credentials
    App.t = null;
    App.board.send({ t: 'ring', traineeId: pick.traineeId, scenarioId: pick.scenarioId, record: pick.record && App.cfg.features.recordings, withhold: pick.withhold });
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
        if (t.record) { if (!t.rec) { try { t.rec = new VoIP.Recorder([stream, s]); } catch (e) { console.warn(e); } } else t.rec.add(s); }
      },
      onState: (st) => {
        if (App.t !== t) return;
        t.net = st;
        if (st === 'connected' && t.status === 'connecting') { t.status = 'live'; render(); }
        renderCallbar();
      },
      onQuality: (q) => { if (App.t === t) { t.quality = q; renderCallbar(); } }
    });
    t.rtc.start();
    clearTimeout(t.slowTimer);
    t.slowTimer = setTimeout(() => { if (App.t === t && t.status === 'connecting') { t.slow = true; renderCallbar(); } }, 12000);
  }

  function hangup() {
    const t = App.t; if (!t) return;
    if (t.status === 'ringing') App.board.send({ t: 'cancel', callId: t.callId });
    else App.board.send({ t: 'hangup', callId: t.callId });
    endCall({ by: 'trainer', reason: t.status === 'ringing' ? 'cancelled' : 'hangup', status: t.status === 'ringing' ? 'cancelled' : 'ended' });
  }

  async function endCall(m) {
    const t = App.t; if (!t || t.status === 'ended') return;
    Sounds.stop();
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
    renderCallbar();
  }
  function toggleCoach() {
    const t = App.t; if (!t || t.status !== 'live') return;
    t.coaching = !t.coaching;
    App.board.send({ t: 'timeout', callId: t.callId, on: t.coaching });
    renderCallbar();
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

  function renderRoster() {
    const el = U.$('#roster'); if (!el) return;
    const all = (App.presence.trainees || []).slice();
    const batches = [...new Set([...all.map((x) => x.batch), ...(C.roster || []).map((x) => x.batch)].filter(Boolean))].sort();
    const shown = all.filter((x) => !pick.batch || x.batch === pick.batch).sort((a, b) => (b.hand - a.hand) || (a.handAt - b.handAt) || (a.status === 'available' ? -1 : 1) - (b.status === 'available' ? -1 : 1) || a.name.localeCompare(b.name));
    const online = new Set(all.map((x) => x.id));
    const offline = (C.roster || []).filter((x) => !online.has(x.id) && !x.archived && (!pick.batch || x.batch === pick.batch));
    const hands = all.filter((x) => x.hand).length;
    el.innerHTML = `<div class="card-head"><h3>☎ Switchboard</h3><span class="spacer"></span><span class="badge green">${all.length} online</span>${hands ? `<span class="badge orange">✋ ${hands}</span>` : ''}</div>
      <select class="input" id="batchSel" style="margin-bottom:10px"><option value="">All batches</option>${batches.map((b) => `<option ${b === pick.batch ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
      ${shown.map((x) => `<div class="tr ${x.id === pick.traineeId ? 'sel' : ''}" data-tid="${esc(x.id)}">
          <span class="led ${x.call ? 'ringing' : x.status}"></span>
          <div style="flex:1;min-width:0"><div class="nm">${esc(x.name)} ${x.hand ? '<span class="hand-wave" title="Asked for a mock call">✋</span>' : ''}</div><div class="bt">${esc(x.batch)} · ${x.call ? 'on a call' : x.status === 'available' ? 'available' : 'away'}${x.tabs > 1 ? ` · ${x.tabs} tabs` : ''}</div></div>
          <button class="btn btn-sm ${x.call ? '' : 'btn-green'}" data-ring="${esc(x.id)}" ${x.call || active(App.t) ? 'disabled' : ''}>📞</button></div>`).join('') || '<div class="empty small">Nobody is online. Trainees open <b>📞 My phone</b> to take calls.</div>'}
      ${offline.length ? `<details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">${offline.length} offline</summary>${offline.map((x) => `<div class="tr" style="cursor:default"><span class="led"></span><div><div class="nm" style="font-weight:500">${esc(x.name)}</div><div class="bt">${esc(x.batch)}${x.last_seen ? ' · seen ' + U.when(x.last_seen) : ''}</div></div></div>`).join('')}</details>` : ''}`;
  }

  function renderStage() {
    const el = U.$('#stage'); if (!el) return;
    const t = App.t;
    if (!t) return renderPicker(el);
    if (t.status === 'ended') return renderEndedStage(el);
    if (t.status === 'elsewhere') {
      el.innerHTML = `<div class="card warn-box"><h3>📞 You're on a call in another tab</h3><p>With <b>${esc(t.trainee.name)}</b>: ${esc(t.scenario.title)}. Keep using that tab, or move the call here.</p>
        <button class="btn btn-green" data-act="takehere">📞 Take the call here</button></div>`;
      return;
    }
    const s = t.scenario;
    el.innerHTML = `<div class="callbar" id="callbar"></div>
      <div id="xfer"></div>
      <div class="stage-live">
        <div>
          <div class="card script-card">
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
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-head"><h3>✅ Live checklist</h3><span class="spacer"></span><span class="small muted">Tick as it happens</span></div>
            <div id="goals">${(s.goals || []).map((g, i) => `<label class="goal ${(t.ticks || []).includes(i) ? 'done' : ''}"><input type="checkbox" data-goal="${i}" ${(t.ticks || []).includes(i) ? 'checked' : ''}><span>${esc(g)}</span></label>`).join('')}</div>
          </div>
          <div class="card">
            <div class="card-head"><h3>📝 The trainee's note</h3><span class="spacer"></span><span class="small muted">Live</span></div>
            <div class="live-note" id="liveNote"></div>
          </div>
        </div>
      </div>`;
    renderCallbar(); renderTransfer(); renderLiveNote();
  }

  function renderCallbar() {
    const el = U.$('#callbar'); const t = App.t; if (!el || !t || t.status === 'ended') return;
    const st = t.status === 'ringing' ? `<span class="badge orange">Ringing <span data-rings="${t.ringAt}">${U.ringText(t.ringAt)}</span></span>`
      : t.status === 'connecting' ? `<span class="badge amber">${t.slow ? 'Still connecting the audio…' : 'Connecting…'}</span>` : '';
    const flags = [];
    if (t.status === 'live') {
      if (t.record) flags.push('<span class="lb rec">REC</span>');
      if (t.traineeHeld) flags.push(`<span class="lb hold">YOU'RE ON HOLD <span data-since="${t.holdAt}">${U.since(t.holdAt)}</span></span>`);
      if (t.traineeMuted) flags.push('<span class="lb mute">TRAINEE MUTED</span>');
      if (t.coaching) flags.push('<span class="lb coach">⏸ COACHING</span>');
      if (t.peerLost) flags.push('<span class="lb warn">TRAINEE RECONNECTING</span>');
      if (t.quality) flags.push(`<span class="lb" title="${t.quality.rtt != null ? t.quality.rtt + ' ms round trip' : ''}${t.quality.loss ? ' · ' + t.quality.loss + '% loss' : ''}${t.quality.relay ? ' · via TURN relay' : ''}"><span class="bars q${t.quality.bars}"><i></i><i></i><i></i><i></i></span>${t.quality.relay ? ' RELAY' : ''}</span>`);
    }
    el.innerHTML = `<div><div class="who2">📞 ${esc(t.trainee.name)} <span class="small" style="color:#94a3b8">${esc(t.trainee.batch || '')}</span></div><div class="small" style="color:#94a3b8">${esc(t.scenario.title)}</div></div>
      ${t.status === 'live' ? `<span class="t" data-since="${t.answeredAt}">${U.since(t.answeredAt)}</span>` : st}
      <div class="row">${flags.join('')}</div><span class="spacer"></span>
      ${t.status === 'live' ? `<button class="btn btn-sm ${t.muted ? 'on' : ''}" data-act="mute">${t.muted ? '🔇 Unmute' : '🎙 Mute'}</button>
      <button class="btn btn-sm ${t.coaching ? 'coach-on' : ''}" data-act="coach" title="Pause the role-play to coach the trainee, then resume">${t.coaching ? '▶ Resume role-play' : '⏸ Coaching time-out'}</button>` : ''}
      <button class="btn btn-sm btn-red" data-act="hangup">${t.status === 'ringing' ? 'Cancel call' : '☎ End call'}</button>`;
  }

  function renderTransfer() {
    const el = U.$('#xfer'); const t = App.t; if (!el) return;
    if (!t || !t.transfer || t.transfer.result) { el.innerHTML = t && t.transfer && t.transfer.result ? `<div class="note-box" style="margin-bottom:16px">↪ You answered the transfer to ${esc(t.transfer.to)}: <b>${t.transfer.result === 'no-answer' ? 'no answer' : t.transfer.result}</b>. The trainee is back with you when they press Resume.</div>` : ''; return; }
    const x = t.transfer;
    el.innerHTML = `<div class="xfer-panel"><div class="row"><b style="font-size:16px">↪ The trainee is transferring you to ${esc(x.to)} (ext ${esc(x.ext)})</b><span class="spacer"></span><span class="small">${esc(x.role || '')}</span></div>
      <p class="small" style="margin:6px 0 10px">${x.unavailable ? '🚫 The scenario says <b>' + esc(x.to) + ' is not available</b>.' : 'The scenario doesn\'t say this person is out.'} You decide what happens:</p>
      <div class="row"><button class="btn btn-green" data-xfer="connected">✅ Picks up (the call is handed over and ends)</button><button class="btn" data-xfer="no-answer">📵 No answer</button><button class="btn" data-xfer="voicemail">📨 Voicemail</button></div></div>`;
  }

  function renderLiveNote(before) {
    const el = U.$('#liveNote'); const t = App.t; if (!el || !t) return;
    const form = App.formFor(t.scenario.track);
    const n = t.note || {};
    const rows = form.fields.filter((f) => n[f.k]);
    el.innerHTML = rows.length ? rows.map((f) => `<div class="ln ${before && before[f.k] !== n[f.k] ? 'fresh' : ''}"><b>${esc(f.label)}</b><span>${esc(n[f.k])}</span></div>`).join('') : '<div class="empty small">Nothing typed yet.</div>';
    setTimeout(() => U.$$('.ln.fresh', el).forEach((x) => x.classList.remove('fresh')), 1600);
  }

  function renderEndedStage(el) {
    const t = App.t;
    el.innerHTML = `<div class="card"><div class="card-head"><h2>Call ended</h2><span class="spacer"></span><span class="badge">${U.dur(t.endedAt - t.answeredAt)}</span></div>
      <p><b>${esc(t.trainee.name)}</b> · ${esc(t.scenario.title)}${t.endNote ? ' · ' + esc(t.endNote) : ''}</p>
      <div id="endedInfo"></div>
      <div class="row" style="margin-top:12px"><a class="btn btn-orange" id="scoreBtn" href="#/call/${esc(t.callId)}">📋 Score this call →</a><button class="btn" data-act="newcall">📞 Place another call</button></div>
      <p class="small muted" style="margin-top:12px">The trainee is finishing and submitting their note; you'll see it on the scorecard.</p></div>`;
    renderEnded();
  }
  function renderEnded() {
    const el = U.$('#endedInfo'); const t = App.t; if (!el || !t) return;
    const sb = U.$('#scoreBtn');
    if (sb) { const wait = t.upload === 'saving'; sb.style.pointerEvents = wait ? 'none' : ''; sb.style.opacity = wait ? '.5' : ''; }
    el.innerHTML = !t.record ? '<p class="small muted">This call wasn\'t recorded.</p>'
      : t.upload === 'saving' ? '<p class="small">⏳ Saving the recording…</p>'
      : t.upload === 'done' ? '<p class="small">✅ Recording saved.</p>'
      : t.upload === 'failed' ? `<p class="small err-box">The recording couldn't be saved: ${esc(t.uploadError || '')}</p>` : '';
  }

  // Before a call: who to ring and what to play.
  function renderPicker(el) {
    const list = App.cfg.scenarios.filter((s) => s.track === pick.track);
    const s = App.scen[pick.scenarioId];
    el.innerHTML = `<div class="card">
      <div class="card-head"><h2>📞 Place a live mock call</h2></div>
      <div id="pickTrainee"></div>
      <div class="row" style="margin:14px 0 10px"><div class="pill-tabs" id="pkTrack">${Object.entries(App.cfg.tracks).map(([k, t]) => `<button data-track="${k}" class="${k === pick.track ? 'on' : ''}">${t.icon} ${esc(t.label)}</button>`).join('')}</div>
        <span class="spacer"></span><a class="small" href="#/scenarios">📚 Write your own call</a></div>
      <div class="scen-grid" id="pkList">${list.map((x) => `<div class="scen ${x.id === pick.scenarioId ? 'sel' : ''}" data-sid="${esc(x.id)}">
          <div class="meta">${App.levelBadge(x.level)}${x.caseId ? `<span class="badge">${esc(x.caseId)}</span>` : ''}${x.custom ? '<span class="badge blue">Yours</span>' : ''}</div>
          <h4>${esc(x.title)}</h4><p><b>${esc(x.caller.name)}</b>: ${esc(x.caller.role)}</p></div>`).join('')}</div>
      <div class="row" style="margin-top:16px">
        <label class="check"><input type="checkbox" id="pkRec" ${pick.record && App.cfg.features.recordings ? 'checked' : ''} ${App.cfg.features.recordings ? '' : 'disabled'}> Record the call${App.cfg.features.recordings ? '' : ' (recordings aren\'t set up)'}</label>
        <label class="check"><input type="checkbox" id="pkHide" ${pick.withhold ? 'checked' : ''}> Withhold the caller ID</label>
        <span class="spacer"></span>
        <button class="btn" data-act="miccheck">🎙 Mic check</button>
        <button class="btn btn-green btn-lg" data-act="ring">📞 Ring the trainee</button>
      </div></div>
      ${s ? `<div class="card script-card"><div class="card-head"><h3>🎭 Preview: ${esc(s.title)}</h3><span class="spacer"></span>${App.levelBadge(s.level)}</div>
        <p class="small"><b>${esc(s.caller.name)}</b>, ${esc(s.caller.role)} · caller ID <span class="mono">${esc(s.caller.idName)} ${esc(s.caller.number)}</span></p>
        <div class="opening">${esc(s.opening)}</div>
        <div class="grid2"><div><h4>What you know and how you act</h4><div class="persona">${esc(s.hidden)}</div></div>
        <div><h4>What a good call does</h4><ul class="small">${(s.goals || []).map((g) => `<li>${esc(g)}</li>`).join('')}</ul><h4>The situation</h4><p class="small">${esc(s.facts)}</p></div></div></div>` : ''}`;
    renderPickerTrainee();
  }
  function renderPickerTrainee() {
    const el = U.$('#pickTrainee'); if (!el) return;
    const x = (App.presence.trainees || []).find((y) => y.id === pick.traineeId);
    el.innerHTML = x ? `<div class="note-box">Calling <b>${esc(x.name)}</b> (${esc(x.batch)}) · ${x.call ? '<span class="badge red">on a call</span>' : x.status === 'available' ? '<span class="badge green">available</span>' : '<span class="badge amber">away: they can still answer</span>'}${x.hand ? ' · ✋ asked for a call' : ''}</div>`
      : `<div class="note-box">👈 Pick a trainee on the switchboard${pick.traineeId ? ' (the one you picked went offline)' : ''}.</div>`;
  }

  /* ---------- page ---------- */
  App.register('console', {
    trainer: true,
    async render() {
      const app = U.$('#app');
      app.innerHTML = `<div class="console"><div class="card roster" id="roster"></div><div id="stage"></div></div>`;
      App.leave = () => { if (App.t && App.t.status === 'ended' && App.t.upload !== 'saving') App.t = null; };
      app.firstChild.addEventListener('click', onClick);
      app.firstChild.addEventListener('change', onChange);
      render();
      try { C.roster = (await API.post('/api/trainees')).trainees; renderRoster(); } catch (e) {}
    }
  });

  function onClick(e) {
    const ringBtn = e.target.closest('[data-ring]');
    if (ringBtn) { pick.traineeId = ringBtn.dataset.ring; if (!pick.scenarioId) { renderRoster(); renderPickerTrainee(); U.toast('Now pick the call to play, then ring.'); return; } renderRoster(); ring(); return; }
    const tr = e.target.closest('[data-tid]');
    if (tr) { pick.traineeId = tr.dataset.tid; renderRoster(); renderPickerTrainee(); return; }
    const trk = e.target.closest('[data-track]');
    if (trk && U.$('#pkTrack') && U.$('#pkTrack').contains(trk)) { pick.track = trk.dataset.track; renderStage(); return; }
    const sc = e.target.closest('[data-sid]');
    if (sc) { pick.scenarioId = sc.dataset.sid; renderStage(); return; }
    const xf = e.target.closest('[data-xfer]');
    if (xf) { transferResult(xf.dataset.xfer); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'ring') ring();
    else if (act === 'hangup') hangup();
    else if (act === 'mute') toggleMute();
    else if (act === 'coach') toggleCoach();
    else if (act === 'miccheck') App.micCheck();
    else if (act === 'newcall') { App.t = null; render(); }
    else if (act === 'takehere') takeHere();
  }
  function onChange(e) {
    if (e.target.id === 'batchSel') { pick.batch = e.target.value; renderRoster(); }
    else if (e.target.id === 'pkRec') pick.record = e.target.checked;
    else if (e.target.id === 'pkHide') pick.withhold = e.target.checked;
    else if (e.target.dataset.goal != null) { tick(Number(e.target.dataset.goal), e.target.checked); e.target.closest('.goal').classList.toggle('done', e.target.checked); }
  }
})();
