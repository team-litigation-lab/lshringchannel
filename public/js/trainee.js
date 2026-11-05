/* =========================================================
   The trainee's phone: ☎ Console

   One phone takes every call. On the main screen it is the phone and
   nothing else; the panes a call needs (🔎 Case lookup, 📝 the note,
   📇 the directory, 📘 the rules) come up beside it while the call is
   on, and ☎ Switchboard folds the board out of the phone's own key.
     • live mock calls: the trainer rings, the trainee answers and handles
       the call over real audio (WebRTC), takes the note, and submits it
       for the trainer to score;
     • the AI calls a trainer sends;
     • the trainee's own practice calls with an AI caller (Gemini Live),
       picked on 🎭 the Scenario Picker and scored by the AI.
   A trainer's own practice call runs on 🎧 Try practice (🛡 Admin).
   App.p is the call on this phone: { mode: 'live' | 'ai', status:
   ringing · connecting · live · ended, caller ID, timings, hold, mute,
   transfer, note … }.
   ========================================================= */
(function () {
  'use strict';
  const { esc } = U;
  const T = window.Trainee = {};
  const remote = () => document.getElementById('remoteAudio');
  const active = (p) => p && ['ringing', 'calling', 'connecting', 'live'].includes(p.status);
  /* A trainee's ☎ Console draws every call they take — live, an AI caller a trainer sent, and their own
     practice calls. A trainer's own practice call is drawn on 🎧 Try practice, where they start it. */
  const onPage = () => (App.trainer() ? App.at('practice') : App.at('phone'));
  // 'ai' while a practice call the person started themselves is on the phone; 'live' is the desk phone.
  const modeOf = () => (App.trainer() || (App.p && App.p.mode === 'ai' && !App.p.assigned) ? 'ai' : 'live');


  /* =========================================================
     Switchboard messages
     ========================================================= */
  T.onUp = function (m) {
    if (T.ext !== App.myExt) { T.ext = App.myExt; if (!(App.p && active(App.p))) renderAll(); }   // the desk extension, on the phone
    App.board.send({ t: 'status', status: App.status });
    if (App.hand) App.board.send({ t: 'hand', up: true });
    const a = m.active, p = App.p;
    if (p && p.out && active(p)) { outEnd({ by: 'system', reason: 'disconnected' }); return; }   // 🤝 a practice call you placed ends with the connection
    if (p && p.mode === 'live' && active(p)) {
      if (a && a.callId === p.callId && a.status === 'live') App.board.send({ t: 'resume', callId: p.callId });
      else if (!a || a.callId !== p.callId) endLive({ by: 'system', reason: 'disconnected' });
      return;
    }
    if (a && a.status === 'ringing' && !(p && active(p))) incoming(a);
    else if (a && a.status === 'live' && !(p && active(p))) {
      // A call is on the line: this tab reloaded during it (reconnect), or another tab has it (move it here).
      const lv = a.live || {};
      App.p = Object.assign(fromBrief(a), { status: 'live', answeredAt: a.answeredAt || Date.now(), needRejoin: true, elsewhere: App.ownCall() !== a.callId, note: a.note || {},
        held: !!lv.held, holdAt: lv.holdAt || 0, coaching: !!lv.coaching, classOn: !!lv.classOn, transfer: lv.transfer ? { to: lv.transfer.to, ext: lv.transfer.ext, state: 'ringing' } : null });
      if (App.route.name !== 'phone') App.nav('#/phone'); else renderAll();
    }
  };

  T.onPresence = function () {
    const el = U.$('#trOnline');
    if (el) el.innerHTML = trainerLine();
    renderSide();
    if (!App.trainersOnline && App.hand) { /* keep the hand up: it shows when a trainer comes on */ }
  };
  const trainerLine = () => App.trainersOnline ? `🎓 ${App.trainersOnline} trainer${App.trainersOnline > 1 ? 's' : ''} online` : 'No trainer online';

  T.onBoard = function (m) {
    const p = App.p;
    if (m.t === 'dialing' && T.cancelNext && !(p && p.out && !p.callId)) { T.cancelNext = false; App.board.send({ t: 'cancel', callId: m.callId }); return; }   // hung up before the call was placed
    if (p && p.out && (m.t === 'dialing' || m.t === 'dial-failed' || (m.callId && m.callId === p.callId))) return onOut(m);
    const mine = p && p.mode === 'live' && p.callId === m.callId;
    switch (m.t) {
      // ↪ 👥 the trainee's own transfers to another trainee (and merges)
      case 'tx-ringing': if (mine && p.transfer && p.transfer.trainee) { p.transfer.legId = m.legId; renderDevice(); } else if (mine && p.merging) { p.merging.legId = m.legId; renderDevice(); } return;
      case 'tx-failed': if (mine) { U.toast(m.reason, 'error'); if (p.transfer && p.transfer.trainee && !p.transfer.legId) p.transfer = null; p.merging = null; renderDevice(); } return;
      case 'tx-answered': if (mine && p.transfer && p.transfer.trainee) { p.transfer.state = 'consult'; speakThrough(p); Sounds.beep(); renderDevice(); } return;
      // You were rung for a warm transfer, and the caller is yours now.
      case 'handed': if (mine) { p.handedFrom = m.from || p.consultFrom || ''; p.consultFrom = ''; p.merged = false; p.conf = null; U.toast(`↪ ${p.handedFrom || 'Your colleague'} handed the caller to you: you're on the line with them now.`, 'ok'); renderDevice(); } return;
      case 'incoming': return incoming(m);
      case 'ai-incoming': return aiIncoming(m);
      case 'ai-stop': if (p && p.mode === 'ai' && p.callId === m.callId && active(p)) { endAi('caller', 'stopped', 'Your trainer ended the call'); U.toast('Your trainer ended the AI call.'); } return;
      case 'taken': if ((mine || (p && p.assigned && p.callId === m.callId)) && p.status === 'ringing') { clearTimeout(p.ringTimer); stopAlerts(); App.p = null; U.toast('Answered on another tab.'); renderAll(); } return;
      case 'moved': if (mine) { stopAlerts(); cleanupLive(p); App.p = null; App.ownCall(null); U.toast('The call moved to your other tab.'); renderAll(); App.onCallBar(); } return;
      case 'transfer-cancel': return;
      case 'gone': if (mine && p.status !== 'ended') { stopAlerts(); cleanupLive(p); App.p = null; U.toast('That call is no longer on the line.'); renderAll(); } return;
      case 'connected':
        if (!mine) return;
        App.ownCall(p.callId);
        p.classOn = !!(m.live && m.live.classOn);
        p.answeredAt = Date.now();
        if (!p.note.when) p.note.when = U.stamp();
        renderAll();
        clearTimeout(p.slowTimer);
        p.slowTimer = setTimeout(() => { if (App.p === p && p.status === 'connecting') { p.slow = true; renderDevice(); } }, 12000);
        return;
      case 'signal': return onSignal(m.data);
      case 'transfer-result':
        if (!mine || !p.transfer) return;
        if (m.result === 'merged') { p.transfer = null; if (p.held) toggleHold(); else renderDevice(); return; }   // 👥 all three on one call now
        p.transfer.state = m.result;
        if (m.result === 'consult') speakThrough(p);          // the extension answered first: speak to them
        else if (m.result !== 'connected') { Sounds.beep(); backOnHold(p); }   // no answer, declined, or they hung up: the caller is still on hold
        renderDevice();
        return;
      case 'timeout': if (mine) { p.coaching = !!m.on; p.coachMsg = m.msg || ''; renderDevice(); } return;
      case 'class': if (mine) { p.classOn = !!m.on; renderDevice(); } return;
      case 'graded': if (p && p.callId === m.callId && p.wake) p.wake(); return;
      case 'peer-lost': if (mine) { p.peerLost = true; renderDevice(); } return;
      case 'peer-back': if (mine) { p.peerLost = false; renderDevice(); } return;
      case 'resumed':
        if (!mine) return;
        if (p.needRejoin) return;   // waits for the trainee's click (browsers need one to play audio)
        return;
      // 👥 Merged into a conference: who else is on the call with you.
      case 'conf-parties': if (mine) { p.conf = m.on ? { names: m.names || [], others: m.others || [], trainer: m.trainer || '' } : null; if (m.on) { p.merging = null; p.consultFrom = ''; } renderDevice(); } return;
      case 'ended': if (mine) endLive(m); return;
    }
  };

  const fromBrief = (m) => ({ mode: 'live', callId: m.callId, line: m.line, lineLabel: m.lineLabel, lineNumber: m.lineNumber, callerId: m.callerId, track: m.track,
    hideCases: m.hideCases || [], rec: !!m.recording, trainer: m.trainer, note: {}, muted: false, held: false, caseId: m.caseId || '',
    // merged: rung into a call the trainer already had on the line. handedFrom: the caller was transferred here.
    merged: !!(m.conf && !m.conf.handover && !m.conf.consult),
    handedFrom: (m.conf && m.conf.handover ? m.conf.from : '') || m.handoverFrom || '',
    // consultFrom: a colleague is warm-transferring a caller to you (you speak to them first). peer: a 🤝 practice call from another trainee.
    consultFrom: m.conf && m.conf.consult ? m.conf.from : '', peer: m.peer || null });

  function incoming(m) {
    T.dial = '';
    if (App.p && active(App.p)) {
      // On a practice call: the trainer is told the trainee is busy, and the trainee sees who tried.
      if (App.p.mode === 'ai') { App.board.send({ t: 'decline', callId: m.callId, busy: true }); U.toast(`Your trainer tried to ring you (${m.lineLabel}). Hang up the practice call to take live calls.`, 'error'); }
      return;
    }
    App.p = Object.assign(fromBrief(m), { status: 'ringing', ringAt: Date.now() });
    App.hand = false;
    Sounds.ring();
    App.notify('📞 Incoming mock call', `${m.lineLabel}: ${m.callerId.name} ${m.callerId.number}`);
    App.flashTitle(true, '📞 Incoming call…');
    if (App.route.name !== 'phone') App.nav('#/phone'); else renderAll();
    App.onCallBar();
  }
  /* 🤖 An AI caller a trainer sent: it rings My phone like any call. On answer, this page runs the conversation (as on
     🎧 Practice: the AI plays the caller), streams the transcript to the trainer, and the AI reviews it when the note is in. */
  function aiIncoming(m) {
    if (App.p && active(App.p)) { App.board.send({ t: 'ai-decline', callId: m.callId, reason: 'busy' }); U.toast(`Your trainer sent an AI caller (${m.lineLabel}). Finish this call to take the next one.`, 'error'); return; }
    const p = App.p = { mode: 'ai', assigned: { trainer: m.trainer }, graded: !!m.graded, status: 'ringing', ringAt: Date.now(), callId: m.callId, scenario: m.scenario, surprise: true,
      line: m.line, lineLabel: m.lineLabel, lineNumber: m.lineNumber, callerId: m.callerId || { name: 'WIRELESS CALLER', number: '' }, track: m.scenario.track, hideCases: m.scenario.hideCases || [],
      note: {}, lines: [], muted: false, held: false, rec: App.cfg.features.recordings, metrics: { holds: [], transfers: [] } };
    App.hand = false;
    Sounds.ring();
    App.notify('📞 Incoming call', `${m.lineLabel}: ${p.callerId.name} ${p.callerId.number}`);
    App.flashTitle(true, '📞 Incoming call…');
    // Rings out like a live call: a missed call after 45 seconds.
    p.ringTimer = setTimeout(() => { if (App.p === p && p.status === 'ringing') { stopAlerts(); App.board.send({ t: 'ai-decline', callId: p.callId, reason: 'no-answer' }); App.p = null; U.toast(`Missed call from ${p.callerId.name}.`); renderAll(); App.onCallBar(); } }, 45000);
    if (App.route.name !== 'phone') App.nav('#/phone'); else renderAll();
    App.onCallBar();
  }
  // The transcript, line by line, to the trainer following an AI call they sent (a few updates a second at most).
  function aiLine(p, who, text, id) {
    if (!p.assigned) return;
    p.outLines = p.outLines || {}; p.outLines[id] = { who, text };
    if (p.lineTimer) return;
    p.lineTimer = setTimeout(() => { p.lineTimer = null; const o = p.outLines; p.outLines = {}; Object.entries(o).forEach(([k, v]) => App.board.send({ t: 'ai-line', callId: p.callId, id: k, who: v.who, text: v.text })); }, 400);
  }
  function stopAlerts() { Sounds.stop(); App.flashTitle(false); App.clearNotify(); }

  /* ---------- live call: answer, audio, controls ---------- */
  function makeRtc(p, stream, iceServers, gen) {
    if (p.rtc) p.rtc.close();
    p.rtc = new VoIP.RtcCall({
      board: App.board, callId: p.callId, offerer: false, iceServers, stream, gen,
      onRemote: (s) => { const a = remote(); a.srcObject = s; a.muted = !!p.held; a.volume = App.volume == null ? 1 : App.volume; a.play().catch(() => {}); },
      onState: (st) => {
        if (App.p !== p) return;
        if (st === 'connected' && p.status === 'connecting') { p.status = 'live'; p.slow = false; clearTimeout(p.slowTimer); if (!p.answeredAt) p.answeredAt = Date.now(); renderAll(); }
        p.netState = st; renderDevice();
      },
      onQuality: (q) => { if (App.p === p) { p.quality = q; renderBadges(); } }
    });
    if (p.held && p.music) p.rtc.setOutgoing(p.music.track);   // a new connection while the caller is on hold keeps the music
  }

  async function answer() {
    const p = App.p;
    if (!p || p.status !== 'ringing') return;
    if (p.mode === 'ai') return answerAi();
    stopAlerts();
    p.status = 'connecting'; renderDevice();
    let stream;
    try { stream = await VoIP.Mic.open(); }
    catch (e) { U.toast(e.message, 'error'); if (App.p === p) { p.status = 'ringing'; Sounds.ring(); renderDevice(); } return; }
    const servers = await VoIP.ice();
    if (App.p !== p || p.status !== 'connecting') return;
    makeRtc(p, stream, servers, 0);
    App.board.send({ t: 'accept', callId: p.callId });
    T.shareSync();
    VoIP.Speaker.apply().catch(() => {});   // the microphone is open: the headset is the output on its device
  }

  // After a reload mid-call: a fresh connection, and the trainer's console sends a new offer.
  async function rejoin() {
    const p = App.p;
    if (!p || !p.needRejoin) return;
    let stream;
    try { stream = await VoIP.Mic.open(); } catch (e) { return U.toast(e.message, 'error'); }
    const servers = await VoIP.ice();
    p.needRejoin = false; p.elsewhere = false;
    App.ownCall(p.callId);
    if (p.held && !p.music) { p.music = Sounds.holdStream(); remote().muted = true; }
    makeRtc(p, stream, servers, -1);
    App.board.send({ t: 'resume', callId: p.callId });
    App.board.send({ t: 'mute', callId: p.callId, on: false });
    App.board.send({ t: 'signal', callId: p.callId, data: { rejoin: true, gen: -1 } });
    renderAll();
  }

  function onSignal(data) {
    const p = App.p;
    if (!p || p.mode !== 'live' || !p.rtc || !data) return;
    if (data.gen != null && data.gen !== p.rtc.gen) {
      // A new connection from the trainer (their page reloaded, or they rejoined us).
      if (data.sdp && data.sdp.type === 'offer') makeRtc(p, VoIP.Mic.stream, (VoIP.iceInfo() || {}).servers || [], data.gen);
      else return;
    }
    p.rtc.handle(data);
  }

  function decline() {
    const p = App.p; if (!p || p.status !== 'ringing') return;
    stopAlerts();
    if (p.mode === 'ai' && p.assigned) { clearTimeout(p.ringTimer); App.board.send({ t: 'ai-decline', callId: p.callId, reason: 'declined' }); App.p = null; renderAll(); App.onCallBar(); return; }
    if (p.mode === 'ai') { endAi('trainee', 'declined'); return; }
    App.board.send({ t: 'decline', callId: p.callId });
    App.p = null; renderAll();
  }

  async function toggleHold() {
    const p = App.p; if (!p || p.status !== 'live') return;
    const on = !p.held;
    p.held = on;
    if (on) p.holdAt = Date.now();
    if (p.mode === 'ai') {
      AiCall.hold(on);
      const hs = p.metrics.holds;
      if (on) hs.push({ start: Date.now() }); else if (hs.length && !hs[hs.length - 1].end) hs[hs.length - 1].end = Date.now();
    } else {
      if (on) { p.music = Sounds.holdStream(); await p.rtc.setOutgoing(p.music.track); remote().muted = true; }
      else { await p.rtc.setOutgoing(VoIP.Mic.track()); if (p.music) p.music.stop(); p.music = null; remote().muted = false; }
      p.merging = null;
      // Taking the caller back while the extension still rings cancels the transfer.
      if (!on && p.transfer && ['ringing', 'consult'].includes(p.transfer.state)) App.board.send({ t: p.transfer.trainee ? 'tx-cancel' : 'transfer-cancel', callId: p.callId });
      App.board.send({ t: 'hold', callId: p.callId, on });
      if (!on && p.transfer) p.transfer = null;
    }
    renderDevice();
  }
  function toggleMute() {
    const p = App.p; if (!p || p.status !== 'live') return;
    p.muted = !p.muted;
    if (p.mode === 'ai') AiCall.mute(p.muted);
    else { const tr = VoIP.Mic.track(); if (tr) tr.enabled = !p.muted; App.board.send({ t: 'mute', callId: p.callId, on: p.muted }); }
    renderDevice();
  }
  // ↪ Transfer with no call on: the trainee looks through the extensions, and the phone says what would happen.
  function previewTransfer(ext) {
    const d = App.dirEntry(ext); if (!d) return;
    U.toast(`↪ On a call this rings ${d.name} (ext ${ext}): tell the caller, Hold, then Transfer. The caller hears hold music while it rings.`);
  }
  async function doTransfer(ext, kind) {
    const p = App.p; if (!p || p.status !== 'live') return;
    const d = App.dirEntry(ext); if (!d) return;
    if (p.transfer && ['ringing', 'consult'].includes(p.transfer.state)) return U.toast('A transfer is already on: finish it or press Resume to take the caller back.', 'error');
    if (p.mode === 'ai') {
      if (!p.held) await toggleHold();
      p.transfer = { to: d.name, ext, state: 'ringing' };
      renderDevice();
      const res = await AiCall.transfer(d.name, !(p.scenario.unavailable || []).includes(ext));
      if (App.p !== p || p.status !== 'live') return;
      p.metrics.transfers.push({ to: d.name, ext, result: res });
      if (res === 'connected') return endAi('trainee', 'transferred', `Transferred to ${d.name} (ext ${ext})`);
      // nobody picked up: back to the caller (the AI hears it)
      const hs = p.metrics.holds; if (hs.length && !hs[hs.length - 1].end) hs[hs.length - 1].end = Date.now();
      p.held = false; p.transfer.state = 'no-answer';
      renderDevice();
      return;
    }
    if (!p.held) await toggleHold();
    p.transfer = { to: d.name, ext, state: 'ringing', kind: kind === 'warm' ? 'warm' : 'cold' };
    App.board.send({ t: 'transfer', callId: p.callId, ext, kind: p.transfer.kind });
    renderDevice();
  }
  /* ↪ 👥 To another trainee's line (their trainer's console is the bridge, so the trainer stays the caller):
     cold sends the caller straight through, warm lets you speak to them first while the caller holds,
     merge rings them into the call so everyone hears everyone. */
  async function txTrainee(peer, kind) {
    const p = App.p; if (!p || p.status !== 'live') return;
    if (p.mode !== 'live') return U.toast('On a practice call with the AI, transfer to a firm extension.', 'error');
    if (p.peer) return U.toast('On a practice call between trainees there is no bridge for a third phone: transfer to a firm extension instead.', 'error');
    if (p.merged) return U.toast('You were merged into this call: the trainee who took it transfers it on.', 'error');
    if (p.transfer && ['ringing', 'consult'].includes(p.transfer.state)) return U.toast('A transfer is already on: finish it or press Resume to take the caller back.', 'error');
    if (kind === 'merge') { p.merging = { to: peer.name, ext: peer.ext }; App.board.send({ t: 'tx-ring', callId: p.callId, traineeId: peer.id, kind }); renderDevice(); return; }
    if (!p.held) await toggleHold();
    p.transfer = { to: peer.name, ext: peer.ext || '', state: 'ringing', kind, trainee: true };
    App.board.send({ t: 'tx-ring', callId: p.callId, traineeId: peer.id, kind });
    renderDevice();
  }
  // A warm transfer was answered: the caller stays on hold (their music keeps playing) while you speak to the other end.
  function speakThrough(p) {
    if (!p.rtc) return;
    p.rtc.setOutgoing(VoIP.Mic.track());
    if (p.music) { p.music.stop(); p.music = null; }
    remote().muted = false;
  }
  // …and when that ends without the hand-over, the caller is back to hold music until you press Resume.
  function backOnHold(p) {
    if (!p.held || p.music || !p.rtc) return;
    p.music = Sounds.holdStream(); p.rtc.setOutgoing(p.music.track); remote().muted = true;
  }
  function txComplete() {
    const p = App.p; if (!p || !p.transfer || p.transfer.state !== 'consult') return;
    App.board.send({ t: p.transfer.trainee ? 'tx-complete' : 'transfer-complete', callId: p.callId });
  }
  function txMerge() {
    const p = App.p; if (!p || !p.transfer || p.transfer.state !== 'consult' || !p.transfer.trainee) return;
    App.board.send({ t: 'tx-merge', callId: p.callId });
  }

  /* ↪ The transfer picker: the other trainees on your switchboard (warm, cold or 👥 merge) and the firm's extensions
     (warm or cold). `only` = 'merge' for the 👥 Merge key. With no call on, it's a look at who's where. */
  function pickTransfer(only) {
    const p = App.p, live = !!(p && p.status === 'live');
    const mates = (App.peers || []).filter((x) => !x.me);
    const peerOk = live && p.mode === 'live' && !p.peer && !p.merged;
    const why = !live ? '' : p.mode !== 'live' ? 'On a practice call with the AI, transfer to a firm extension.' : p.peer ? 'A practice call between trainees can go to a firm extension, not another trainee.' : p.merged ? 'You were merged into this call: the trainee who took it transfers it on.' : '';
    const tBtns = (x) => {
      if (!live) return '';
      const off = !peerOk || x.call ? 'disabled' : '';
      return only === 'merge' ? `<button class="btn btn-sm btn-green" data-tx="merge" data-tid="${esc(x.id)}" ${off}>👥 Merge in</button>`
        : `<button class="btn btn-sm" data-tx="warm" data-tid="${esc(x.id)}" ${off} title="Talk to ${esc(x.name)} first while the caller holds">🗣 Warm</button><button class="btn btn-sm" data-tx="cold" data-tid="${esc(x.id)}" ${off} title="Send the caller straight through to ${esc(x.name)}">↪ Cold</button><button class="btn btn-sm" data-tx="merge" data-tid="${esc(x.id)}" ${off} title="Ring ${esc(x.name)} into the call: everyone hears everyone">👥 Merge</button>`;
    };
    const f = App.cfg.firm;
    const firm = only === 'merge' ? '' : `<h4 style="margin:14px 0 6px">📇 Firm extensions</h4>${f.directory.map((d) => `<div class="dir-row"><span class="ext">${esc(d.ext)}</span><div style="flex:1"><b>${esc(d.name)}</b><div class="small muted">${esc(d.role)}</div></div>${live ? `${p.mode === 'ai' ? '' : `<button class="btn btn-sm" data-tx="warm" data-ext="${esc(d.ext)}" title="Announce the caller to ${esc(d.name)} before you hand them over">🗣 Warm</button>`}<button class="btn btn-sm" data-tx="cold" data-ext="${esc(d.ext)}" title="Send the caller straight through">↪ ${p.mode === 'ai' ? 'Transfer' : 'Cold'}</button>` : `<button class="btn btn-sm" data-tx="look" data-ext="${esc(d.ext)}">↪ Transfer</button>`}</div>`).join('')}`;
    const m = App.modal({ title: only === 'merge' ? '👥 Merge another trainee into the call' : '↪ Transfer the call',
      body: `<p class="small muted">${only === 'merge' ? 'Their phone rings like any call. Once they answer, everyone hears everyone: the caller, you and them.' : '<b>🗣 Warm</b>: the caller holds while you tell the other person who is calling and why, then you hand them over (or 👥 merge all three). <b>↪ Cold</b>: the caller holds while it rings and goes straight through. Tell the caller before you transfer them.'}</p>
        ${why ? `<div class="note-box small">${esc(why)}</div>` : ''}
        <h4 style="margin:10px 0 6px">👥 Trainee lines</h4>${mates.map((x) => `<div class="dir-row"><span class="ext mono">${esc(x.ext || '')}</span><div style="flex:1"><b>${esc(x.name)}</b><div class="small muted">${esc(x.batch || '')} · ${x.call ? 'on a call' : x.status === 'available' ? 'available' : 'away'}</div></div>${tBtns(x)}</div>`).join('') || '<div class="empty small">No other trainee is online right now.</div>'}
        ${firm}` });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tx]'); if (!b || b.disabled) return;
      m.close();
      if (b.dataset.tx === 'look') return previewTransfer(b.dataset.ext);
      if (b.dataset.tid) { const x = mates.find((y) => y.id === b.dataset.tid); if (x) txTrainee(x, b.dataset.tx); }
      else doTransfer(b.dataset.ext, b.dataset.tx);
    });
  }

  /* =========================================================
     🤝 A practice call you place: dial another trainee's extension and play the caller
     ========================================================= */
  function placeCall(ext) {
    if (App.p && active(App.p)) return U.toast('Finish the call you are on first.', 'error');
    const who = (App.peers || []).find((x) => x.ext === ext && !x.me);
    App.p = { mode: 'peer', out: true, status: 'calling', ext, callId: null, to: who ? who.name : 'Ext ' + ext, callerId: { name: who ? who.name : 'Ext ' + ext, number: 'Ext ' + ext },
      lineLabel: 'Trainee line', lineNumber: 'ext ' + ext, note: {}, muted: false, held: false, ringAt: Date.now() };
    T.dial = '';
    Sounds.ringback();
    App.board.send({ t: 'dial', ext, track: T.outTrack || 'reception' });
    renderAll(); App.onCallBar();
  }
  async function onOut(m) {
    const p = App.p;
    switch (m.t) {
      case 'dialing': if (!p.callId) { p.callId = m.callId; if (m.peer) p.to = m.peer.to; p.callerId = { name: p.to, number: 'Ext ' + p.ext }; renderDevice(); } return;
      case 'dial-failed': Sounds.stop(); App.p = null; U.toast(m.reason, 'error'); renderAll(); App.onCallBar(); return;
      case 'accepted': {
        Sounds.stop();
        p.status = 'connecting'; p.answeredAt = Date.now();
        renderAll();
        let stream;
        try { stream = await VoIP.Mic.open(); } catch (e) { U.toast(e.message, 'error'); App.board.send({ t: 'hangup', callId: p.callId }); return outEnd({ by: 'trainer', reason: 'hangup' }); }
        const servers = await VoIP.ice();
        if (App.p !== p || p.status === 'ended') return;
        p.rtc = new VoIP.RtcCall({ board: App.board, callId: p.callId, offerer: true, iceServers: servers, stream, gen: Date.now(),
          onRemote: (st) => { const a = remote(); a.srcObject = st; a.volume = App.volume == null ? 1 : App.volume; a.play().catch(() => {}); },
          onState: (st) => { if (App.p !== p) return; if (st === 'connected' && p.status === 'connecting') { p.status = 'live'; renderAll(); } p.netState = st; },
          onQuality: (q) => { if (App.p === p) { p.quality = q; } } });
        p.rtc.start();
        return;
      }
      case 'signal': if (p.rtc && m.data && !(m.data.gen != null && m.data.gen !== p.rtc.gen)) p.rtc.handle(m.data); return;
      case 'hold': p.held = !!m.on; p.holdAt = m.on ? Date.now() : 0; renderDevice(); return;   // they put you (the caller) on hold: you hear the music
      case 'mute': p.peerMuted = !!m.on; renderDevice(); return;
      case 'note': p.theirNote = m.note || {}; renderWork(); return;
      case 'ended': return outEnd(m);
    }
  }
  function outEnd(m) {
    const p = App.p; if (!p || !p.out || p.status === 'ended') return;
    Sounds.stop();
    if (p.rtc) { p.rtc.close(); p.rtc = null; }
    const a = remote(); a.srcObject = null;
    VoIP.Mic.close();
    if (!p.answeredAt) {
      App.p = null;
      U.toast(m.status === 'declined' || m.reason === 'declined' ? `${p.to} declined the call.` : m.reason === 'no-answer' ? `${p.to} didn't answer.` : m.reason === 'disconnected' ? 'The call dropped.' : 'Call cancelled.');
      renderAll(); App.onCallBar(); return;
    }
    p.status = 'ended'; p.endedAt = Date.now();
    p.endNote = m.reason === 'transferred' ? `${p.to} transferred you to an extension` : m.reason === 'disconnected' ? 'The line dropped' : m.by === 'trainee' ? `${p.to} hung up` : 'You hung up';
    Sounds.endTone();
    renderAll(); App.onCallBar();
  }
  function hangup() {
    const p = App.p; if (!p || !active(p)) return;
    if (p.out) { if (p.callId) App.board.send({ t: p.status === 'calling' ? 'cancel' : 'hangup', callId: p.callId }); else T.cancelNext = true; return outEnd({ by: 'trainer', reason: 'hangup' }); }
    if (p.mode === 'ai') return endAi('trainee', 'hangup');
    App.board.send({ t: 'hangup', callId: p.callId });
    endLive({ by: 'trainee', reason: 'hangup' });
  }

  function cleanupLive(p) {
    clearTimeout(p.slowTimer);
    if (App.ownCall() === p.callId) App.ownCall(null);
    if (p.rtc) { p.rtc.close(); p.rtc = null; }
    if (p.music) { p.music.stop(); p.music = null; }
    const a = remote(); a.srcObject = null; a.muted = false;
    VoIP.Mic.close();
  }
  function endLive(m) {
    T.dial = '';
    const p = App.p;
    if (!p || p.mode !== 'live') return;
    stopAlerts();
    if (p.status === 'ringing' || (p.status === 'connecting' && !p.answeredAt)) {
      cleanupLive(p);
      U.toast(m.reason === 'no-answer' ? `Missed call from ${p.callerId.name}.` : m.reason === 'declined' ? 'Call declined.' : 'The caller hung up before you answered.');
      App.p = null; renderAll(); App.onCallBar();
      return;
    }
    if (p.status === 'ended') return;
    cleanupLive(p);
    p.status = 'ended'; p.endedAt = Date.now();
    if (!p.answeredAt) p.answeredAt = p.endedAt;
    p.endNote = m.reason === 'handover' ? 'Your trainer passed the caller to another desk' : m.reason === 'transferred' ? `Transferred to ${p.transfer ? p.transfer.to : 'the extension'}` : m.reason === 'disconnected' ? 'The line dropped' : m.by === 'trainer' ? 'The caller hung up' : m.by === 'trainee' ? 'You hung up' : '';
    p.held = false; p.muted = false; p.coaching = false;
    Sounds.endTone();
    renderAll(); App.onCallBar();
  }

  /* ---------- the note ---------- */
  const pushNote = U.debounce(() => {
    const p = App.p; if (!p || p.submitted) return;
    if (p.mode === 'live' && active(p)) App.board.send({ t: 'note', callId: p.callId, note: p.note });
    else if (p.callId) API.post('/api/call/update', { id: p.callId, note: p.note }).catch(() => {});
  }, 700);

  async function submitNote() {
    const p = App.p; if (!p || p.status !== 'ended' || p.submitted) return;
    const btn = U.$('#submitNote'); if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    try {
      await API.post('/api/call/update', { id: p.callId, note: p.note, submit: true });
      p.submitted = true;
      U.toast('Note submitted.', 'ok');
      renderWork();
      if (p.mode === 'ai') gradeAi(p);
    } catch (e) { U.toast(e.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Submit my note'; } }
  }

  /* =========================================================
     Practice with an AI caller
     ========================================================= */
  // The line a Call Simulator link asks for: ?track= (reception, calendar, intake), or the line's name
  // from a course's link (?line=Reception Mock Calls) or an older ?flow= (calendaring → calendar).
  function linkTrack(link) {
    const t = String(link.track || '').toLowerCase(), l = String(link.line || '').toLowerCase();
    if (App.cfg.tracks[t]) return t;
    if (t === 'calendaring' || /calendar/.test(l)) return 'calendar';
    if (t === 'intake' || /intake/.test(l)) return 'intake';
    if (t === 'reception' || /reception|front desk/.test(l)) return 'reception';
    return '';
  }

  async function startAi(scenarioId, opts) {
    if (App.p && active(App.p)) return U.toast('Finish the call you are on first.', 'error');
    let r;
    // program and graded: the Call Simulator link the trainee came in on (App.callLink), so the Portal's
    // course counts the call on the right line (src/portal.js reportGradedCall).
    try { r = await API.post('/api/ai/start', { scenarioId, voice: (opts && opts.voice) || '', program: App.callLink.program, graded: !!(opts && opts.graded) }); } catch (e) { return U.toast(e.message, 'error'); }
    const s = r.scenario;
    const line = App.cfg.lines[s.line];
    App.p = { mode: 'ai', status: 'waiting', callId: r.callId, scenario: s, surprise: !!opts.surprise, typed: !!opts.typed, showTranscript: !!opts.transcript,
      line: s.line, lineLabel: line.label, lineNumber: line.number, callerId: s.callerId || { name: 'WIRELESS CALLER', number: '' }, track: s.track, hideCases: s.hideCases || [],
      graded: !!(opts && opts.graded),
      note: {}, lines: [], muted: false, held: false, rec: App.cfg.features.recordings, metrics: { holds: [], transfers: [] } };
    if (App.trainer()) { if (App.at('practice')) App.views.practice.render(); else location.hash = '#/admin/practice'; }
    else if (App.route.name === 'phone') renderAll();
    else location.hash = '#/phone';
    const p = App.p;
    setTimeout(() => {
      if (App.p !== p || p.status !== 'waiting') return;
      p.status = 'ringing'; p.ringAt = Date.now();
      Sounds.ring(); App.flashTitle(true, '📞 Incoming call…');
      renderAll();
    }, 1500 + Math.random() * 2500);
  }

  async function answerAi() {
    const p = App.p;
    stopAlerts();
    if (p.assigned) { clearTimeout(p.ringTimer); App.board.send({ t: 'ai-answer', callId: p.callId }); }
    p.status = 'connecting'; p.answeredAt = Date.now(); p.metrics.ringMs = p.answeredAt - p.ringAt;
    if (!p.note.when) p.note.when = U.stamp();
    renderAll();
    p.voice = await AiCall.start({
      callId: p.callId, forceText: p.typed, readAloud: true,
      onState: (st) => {
        if (App.p !== p) return;
        if (st === 'live' && p.status === 'connecting') { p.status = 'live'; p.answeredAt = Date.now(); renderAll(); }
        if (st === 'ended' && p.status !== 'ended') endAi('caller', 'limit');
      },
      onLine: (who, text, id) => { if (App.p !== p) return; const x = p.lines.find((l) => l.id === id); if (x) x.text = text; else p.lines.push({ id, who, text }); drawLine(who, text, id); aiLine(p, who, text, id); },
      onError: (msg) => U.toast(msg, 'error'),
      onNotice: (msg) => { p.notice = msg; renderDevice(); },
      onBusy: (b) => { const el = U.$('#typeBusy'); if (el) el.classList.toggle('hidden', !b); }
    });
    if (App.p === p && p.voice === 'text') { p.showTranscript = true; renderAll(); }
  }

  async function endAi(by, reason, note) {
    const p = App.p; if (!p || p.mode !== 'ai' || p.status === 'ended') return;
    stopAlerts();
    const wasRinging = p.status === 'ringing' || p.status === 'waiting';
    const res = await AiCall.stop(true);
    VoIP.Mic.close();
    p.status = 'ended'; p.endedAt = Date.now();
    if (!p.answeredAt || wasRinging) p.answeredAt = p.endedAt;
    const hs = p.metrics.holds; if (hs.length && !hs[hs.length - 1].end) hs[hs.length - 1].end = p.endedAt;
    p.held = false; p.muted = false;
    p.endNote = note || (reason === 'declined' ? 'You declined the call' : by === 'caller' ? 'The call reached its time limit' : 'You hung up');
    const transcript = (res && res.transcript) || p.lines.map((l) => ({ who: l.who, text: l.text }));
    p.metrics.talkMs = p.endedAt - p.answeredAt; p.metrics.endedBy = by; p.metrics.endReason = reason; p.metrics.voice = (res && res.mode) || p.voice || 'voice';
    Sounds.endTone();
    renderAll();
    try { await API.post('/api/call/update', { id: p.callId, transcript, metrics: p.metrics, note: p.note, end: true }); } catch (e) { U.toast(e.message, 'error'); }
    // The recording (to play back and download) and its copy for the AI grader (8 kHz WAV, dead air measured).
    if (res && res.recording && res.recording.blob.size > 2000 && App.cfg.features.recordings) {
      p.audioUp = (async () => {
        await API.postBlob(`/api/recording/put?id=${encodeURIComponent(p.callId)}&dur=${p.metrics.talkMs}`, res.recording.blob, res.recording.type);
        await VoIP.uploadForGrading(p.callId, res.recording.blob);
      })().catch(() => {});
    }
  }

  // Submitting the note sends the call to the AI grader (the same Mock Calls Metrics as graded calls); this waits for the scorecard.
  async function gradeAi(p, again) {
    p.grading = true; p.gradeError = null; renderWork();
    try {
      if (again) await API.post('/api/ai/autograde', { id: p.callId });
      if (p.audioUp) await p.audioUp;
      const until = Date.now() + 5 * 60000;
      while (App.p === p && Date.now() < until) {
        const c = (await API.post('/api/call', { id: p.callId })).call;
        if (c.ai) { p.grade = c.ai; p.score = c.score; break; }
        const ag = c.autograde || {};
        if (ag.state === 'failed' || ag.state === 'off') throw new Error(ag.error || 'The AI couldn\'t grade this call.');
        await new Promise((res) => { p.wake = res; setTimeout(res, 3000); });
      }
      if (!p.grade && App.p === p) throw new Error('Grading is taking longer than usual: your scorecard will be in My calls when it\'s ready.');
    } catch (e) { p.gradeError = e.message; }
    p.grading = false;
    if (App.p === p) renderWork();
  }

  function sendTyped() {
    const inp = U.$('#typeIn'); if (!inp) return;
    const v = inp.value.trim(); if (!v || AiCall.busy()) return;
    inp.value = '';
    AiCall.say(v);
  }

  function drawLine(who, text, id) {
    const box = U.$('#trLines'); if (!box) return;
    let el = box.querySelector(`[data-line="${id}"]`);
    if (!el) { el = document.createElement('div'); el.className = 'tl ' + who; el.dataset.line = id; box.appendChild(el); }
    el.innerHTML = `<b>${who === 'caller' ? 'Caller' : 'You'}</b>${esc(text)}`;
    box.scrollTop = box.scrollHeight;
  }

  /* =========================================================
     Rendering
     ========================================================= */
  function renderAll() { if (!onPage()) { App.onCallBar(); return; } renderDevice(); renderSide(); renderWork(); App.onCallBar(); }

  /* ---------- ☎ the switchboard, joined to the phone ----------
     The same board the trainer works from, as much of it as a trainee needs: their own desk line, the
     trainers who are on, and the rest of their batch with their extensions. It is built as the trainer's
     console is — the LSH mark over the board, in the same dark case as the phone and joined to it with
     nothing between them, so the two read as one piece of equipment. It folds away to a thin rail (the
     phone and the workspace take the room back). */
  const FOLD = 'tside';
  function renderSide() {
    const el = U.$('#tside'); if (!el) return;
    const wrap = el.parentElement;
    const folded = App.folded(FOLD);
    if (wrap) wrap.classList.toggle('side-folded', folded);
    if (folded) { el.innerHTML = App.railHTML(FOLD, 'Switchboard', '☎'); fitBoard(); return; }
    const peers = (App.peers || []).slice().sort((a, b) => (a.me ? -1 : b.me ? 1 : 0) || (b.hand - a.hand) || a.name.localeCompare(b.name));
    const desks = App.desks || [];
    const mine = peers.find((x) => x.me);
    const batch = (mine && mine.batch) || (App.me && App.me.batch) || '';
    el.innerHTML = `<div class="side-brand"><img src="lsh-logo-dark.png" alt="Legal Support Help" width="646" height="397">
        <div class="sb-sub">Ring Channel · Switchboard</div></div><div class="card roster" id="troster">
      <div class="card-head"><h3>☎ Switchboard</h3><span class="spacer"></span><span class="badge green">${peers.length || 1} online</span>${App.foldKey(FOLD, 'the switchboard')}</div>
      <div class="my-line">
        <div class="small muted">My line</div>
        <div class="nm">${esc((App.me && App.me.name) || 'Me')}</div>
        <div class="bt">${esc(batch || 'No batch')}${App.myExt ? ` · ext <span class="mono">${esc(App.myExt)}</span>` : ''} · ${App.status === 'away' ? 'away' : 'available'}${App.hand ? ' · ✋ asked for a call' : ''}</div>
      </div>
      <div class="side-h small muted">${desks.length ? 'Trainers on' : 'No trainer online'}</div>
      ${desks.map((d) => `<div class="tr" style="cursor:default"><span class="led ${d.call ? 'ringing' : 'available'}"></span>
        <div style="flex:1;min-width:0"><div class="nm">🎓 ${esc(d.name)}</div><div class="bt">${d.ext ? `ext <span class="mono">${esc(d.ext)}</span> · ` : ''}${d.call ? 'on a call' : 'free'}</div></div></div>`).join('')}
      <div class="side-h small muted">${esc(batch ? batch : 'All batches')}</div>
      ${peers.map((x) => `<div class="tr ${x.me ? 'sel' : ''}" style="cursor:default"><span class="led ${x.call ? 'ringing' : x.status}"></span>
        <div style="flex:1;min-width:0"><div class="nm">${esc(x.name)}${x.me ? ' <span class="badge">you</span>' : ''} ${x.hand ? '<span class="hand-wave" title="Asked for a mock call">✋</span>' : ''}</div>
        <div class="bt">${x.ext ? `ext <span class="mono">${esc(x.ext)}</span> · ` : ''}${x.call ? 'on a call' : x.status === 'available' ? 'available' : 'away'}</div></div></div>`).join('') || '<div class="empty small">Nobody else is online.</div>'}
      <p class="small muted" style="margin:10px 0 0">Your trainer dials your extension to ring this phone. Dial a classmate's extension to practice together.</p></div>`;
    fitBoard();
  }

  /* The board and the phone are one piece, so they end on the same line: whichever is shorter is
     stretched to the other. The trainer's dialer is always the taller of its pair, but a trainee's
     phone is short and the batch can be long, so this has to work both ways. Measured once it would
     go stale the moment anything reflowed either of them, so it follows them. */
  let deckWatch = null, fitting = false;
  /* ---------- ⌨ the keypad: the trainer's dialer, on the trainee's phone ----------
     Built band for band as the trainer's dialer is. Idle, 📞 rings another trainee's extension for a 🤝 practice
     call (you play the caller), and a trainer's extension asks them for a call. On a call, the key hands the
     caller to the number on screen: a firm extension, or a trainee's (warm, cold or 👥 merge). */
  const PAD = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
  T.dial = '';
  // Who the number on screen is: a firm extension (transferable), a trainer's desk, this phone, or nobody.
  function dialEnt() {
    const d = T.dial; if (!d) return null;
    const dir = App.dirEntry(d); if (dir) return { kind: 'dir', dir };
    const desk = (App.desks || []).find((x) => x.ext === d); if (desk) return { kind: 'trainer', desk };
    if (App.myExt && App.myExt === d) return { kind: 'me' };
    const peer = (App.peers || []).find((x) => x.ext === d && !x.me); if (peer) return { kind: 'peer', peer };
    return { kind: 'none' };
  }
  function dialLcd(p) {
    if (!T.dial) return null;
    const live = !!(p && p.status === 'live');
    const d = dialEnt();
    let state = 'Dialing…', cls = '', name = '', sub = '';
    if (d.kind === 'dir') { state = 'Firm extension'; cls = live ? 'ok' : ''; name = d.dir.name; sub = live ? '↪ hands the caller to this extension' : `${d.dir.role} · dial it on a call to transfer`; }
    else if (d.kind === 'trainer') { state = 'Trainer line'; name = d.desk.name; sub = live ? 'Your trainer is the caller on your calls' : '📞 asks them for a mock call (✋ on their switchboard)'; }
    else if (d.kind === 'me') { state = 'Your own phone'; name = App.me ? App.me.name : ''; sub = 'The extension your trainer dials to ring you'; }
    else if (d.kind === 'peer') { state = 'Trainee line'; cls = d.peer.call ? 'bad' : 'ok'; name = d.peer.name; sub = d.peer.call ? 'On a call right now' : live ? '↪ hands the caller to them: warm, cold or 👥 merge' : '📞 rings them for a practice call: you play the caller'; }
    else { const far = T.dial.length >= 4; state = far ? (live ? 'No such extension' : 'Extension') : 'Dialing…'; cls = far && live ? 'bad' : ''; sub = far ? (live ? 'The firm\'s extensions are on 📇 Directory' : '📞 rings it if a trainee has it') : ''; }
    return { num: T.dial, state, cls, name, sub };
  }
  function setDial(v) { T.dial = v; renderDevice(); }
  function press(k) {
    const p = shown(); const st = p ? p.status : 'idle';
    if (['ringing', 'calling', 'connecting', 'ended'].includes(st) || (p && p.out)) return;
    Sounds.dtmf(k);
    if (T.dial.length < 6) setDial(T.dial + k);
    const b = U.$(`#device [data-dk="${k}"]`);
    if (b) { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 130); }
  }
  // The green key. Idle: 📞 places a practice call to a trainee (or asks a trainer for one). On a call: ↪ hands the caller on.
  function dialCall() {
    const p = shown();
    const d = dialEnt();
    if (!p || p.status !== 'live') {
      if (p && active(p)) return;
      if (modeOf() !== 'live') return;
      if (!d) return U.toast('Key in a trainee\'s extension to ring them for a practice call.');
      if (d.kind === 'trainer') { T.dial = ''; if (!App.hand) { App.hand = true; App.board.send({ t: 'hand', up: true }); } U.toast(`✋ ${d.desk.name} can see you asked for a mock call: they ring this phone.`, 'ok'); renderDevice(); return; }
      if (d.kind === 'dir') return U.toast(`${d.dir.name} is a firm extension: callers are transferred there. Dial a trainee's extension (7…) to practice.`);
      if (d.kind === 'me') return U.toast('That\'s your own phone.');
      if (d.kind === 'peer' && d.peer.call) return U.toast(`${d.peer.name} is on a call right now.`, 'error');
      if (T.dial.length < 4) return U.toast('Key in the whole extension.');
      return placeCall(T.dial);
    }
    if (!d || !['dir', 'peer'].includes(d.kind)) { U.toast(T.dial ? 'No such extension: the firm\'s extensions are on 📇 Directory, the trainees on the switchboard.' : 'Key in the extension to transfer the caller to.'); return; }
    T.dial = '';
    if (d.kind === 'peer') { txChoose(d.peer); return; }
    doTransfer(d.dir.ext);
  }
  // A trainee's extension dialed on a call: how to hand the caller to them.
  function txChoose(peer) {
    const m = App.modal({ title: `↪ ${esc(peer.name)} · ext ${esc(peer.ext || '')}`, body: `<p class="small muted">How should the caller reach ${esc(peer.name)}?</p>
      <div class="row"><button class="btn btn-green" data-tx="warm">🗣 Warm: talk to them first</button><button class="btn" data-tx="cold">↪ Cold: send the caller through</button><button class="btn" data-tx="merge">👥 Merge them into the call</button></div>` });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-tx]'); if (!b) return; m.close(); txTrainee(peer, b.dataset.tx); });
  }
  const spkKey = () => `<button type="button" class="key spk ${VoIP.Speaker.on ? 'on' : ''}" data-act="speaker" aria-pressed="${VoIP.Speaker.on}" title="🔊 Speaker: ${VoIP.Speaker.on ? 'on: the call plays on the speakers. Press to go back to the headset' : 'off: the call plays in the headset. Press to put it on the speakers'} (choose them in 🎧 Audio check)"><span class="ic">${VoIP.Speaker.on ? '🔊' : '🔈'}</span>Speaker</button>`;
  // The keypad band: the pad, then 🔈 Speaker · the big key · ⌫ Delete, exactly as the dialer has it.
  function padHTML(p) {
    const st = p ? p.status : 'idle';
    if (['ringing', 'calling', 'connecting', 'ended'].includes(st) || (p && p.out)) return '';
    const live = st === 'live';
    const d = dialEnt();
    const busy = p && p.transfer && ['ringing', 'consult'].includes(p.transfer.state);
    const can = live ? !!(d && ['dir', 'peer'].includes(d.kind) && !busy) : !!(d && modeOf() === 'live' && (['peer', 'trainer'].includes(d.kind) || (d.kind === 'none' && T.dial.length >= 4)));
    return `<div class="dialpad">${PAD.map(([k, l]) => `<button type="button" class="dk" data-dk="${k}" aria-label="${k}"><b>${k}</b><small>${l || '&nbsp;'}</small></button>`).join('')}</div>
      <div class="dial-row">${spkKey()}
        <button type="button" class="dial-call" data-act="dialcall" ${can ? '' : 'disabled'} title="${live ? 'Transfer the caller to the extension on screen (Enter)' : 'Ring the trainee on screen for a practice call (Enter): you play the caller'}" aria-label="${live ? 'Transfer' : 'Call'}">${live ? '↪' : '📞'}</button>
        <button type="button" class="key" data-act="backspace" title="Delete a digit (Esc clears)" ${T.dial ? '' : 'disabled'}><span class="ic">⌫</span>Delete</button></div>`;
  }
  // Typing dials too: digits, * and #; Backspace deletes, Esc clears, Enter transfers.
  document.addEventListener('keydown', (e) => {
    if (!onPage() || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-back')) return;
    const p = shown(); const st = p ? p.status : 'idle';
    if (['ringing', 'calling', 'connecting', 'ended'].includes(st) || (p && p.out)) return;
    const tg = e.target;
    if (tg && tg.closest && tg.closest('textarea, select, [contenteditable], input:not([type=checkbox]):not([type=range])')) return;
    if (/^[0-9*#]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace' && T.dial) { e.preventDefault(); setDial(T.dial.slice(0, -1)); }
    else if (e.key === 'Escape' && T.dial) setDial('');
    else if (e.key === 'Enter' && T.dial && !(tg && tg.closest && tg.closest('button, a'))) { e.preventDefault(); dialCall(); }
  });

  function fitBoard() {
    const card = U.$('#troster'), dev = U.$('#device'), brand = U.$('#tside .side-brand');
    if (!card || !dev || fitting) return;
    fitting = true;
    try {
      card.style.minHeight = ''; dev.style.minHeight = '';
      if (window.innerWidth <= 1060) return;
      const phone = dev.getBoundingClientRect().height;
      /* The board rides along as the page scrolls, so it can only grow as tall as the window. A phone
         with its keypad out can be taller than that: then neither stays put, and the pair scrolls
         together rather than ending on different lines. */
      const grid = dev.parentElement;
      if (grid) grid.classList.toggle('tall-phone', phone > window.innerHeight - 96);
      const brandH = brand ? brand.getBoundingClientRect().height : 0;
      const board = card.getBoundingClientRect().height + brandH;
      if (board > phone + 1) dev.style.minHeight = Math.round(board) + 'px';
      else if (phone > board + 1) card.style.minHeight = Math.round(phone - brandH) + 'px';
    } finally { fitting = false; }
    if (!window.ResizeObserver) return;
    if (deckWatch) deckWatch.disconnect();
    deckWatch = new ResizeObserver(() => { if (!fitting) fitBoard(); });
    deckWatch.observe(dev);
    if (brand) deckWatch.observe(brand);
    deckWatch.observe(card);
  }
  window.addEventListener('resize', () => { if (App.at('phone')) fitBoard(); });

  T.renderAll = renderAll;

  /* The screen's foot, where the trainer's dialer says who it calls as: the lines that ring this
     phone, and on a call the one the caller came in on. */
  function lineCid(p, mode) {
    if (mode !== 'live') return p ? '🎧 <b>AI caller</b> · practice' : '🎧 <b>Practice phone</b> · an AI caller rings it';
    const f = App.cfg.firm;
    if (p && p.lineLabel) return `Came in on <b>${esc(p.lineLabel)}${p.lineNumber ? ' ' + esc(p.lineNumber) : ''}</b>`;
    return `Takes calls on <b>Main ${esc(f.mainLine)}</b> · <b>Intake ${esc(f.intakeLine)}</b>`;
  }

  function idleInfo(mode) {
    if (mode === 'ai') {
      const p = App.p;
      if (p && p.status === 'waiting') return { state: 'Practice', title: 'Waiting for the call…', sub: 'Your phone will ring in a moment.' };
      return { state: 'Practice', title: 'Pick a practice call', sub: 'An AI caller will ring this phone.' };
    }
    return App.status === 'away' ? { state: 'Away', title: 'Away', sub: 'Your trainer sees you as away.' }
      : { state: 'Ready', title: 'Waiting for a call', sub: App.hand ? '✋ Your trainer can see you asked for a mock call.' : `Your trainer will ring this phone${App.myExt ? ` (ext ${esc(App.myExt)})` : ''}.` };
  }

  // A trainee's Console shows every call; 🎧 Try practice shows the trainer's own practice call.
  function shown() {
    const p = App.p; if (!p) return null;
    return App.trainer() ? (p.mode === 'ai' && !p.assigned ? p : null) : p;
  }
  const DEVFOLD = 'tdevice';
  // The phone folded: a rail with the line's light, the timer and the keys a call needs, and ▶ to open it again.
  function devRailHTML(p, status, led) {
    const live = status === 'live', ring = status === 'ringing';
    const state = live ? `<div class="rail-time" data-since="${p.answeredAt}">${U.since(p.answeredAt)}</div>`
      : `<div class="rail-state">${ring ? 'Ringing' : status === 'connecting' || status === 'calling' ? 'Calling' : status === 'ended' ? 'Ended' : 'Ready'}</div>`;
    return `<button type="button" class="rail-open" data-fold="${DEVFOLD}" title="Open the phone and the switchboard" aria-expanded="false"><span class="ro-ic">▶</span><span class="ro-lb">Phone</span></button>
      <span class="led ${led}"></span>${state}
      ${ring && !(p && p.out) ? '<button type="button" class="rk answer pulse" data-act="answer" title="Answer">📞</button>' : ''}
      ${live ? `<button type="button" class="rk ${p.muted ? 'on' : ''}" data-act="mute" title="${p.muted ? 'Unmute' : 'Mute'}">${p.muted ? '🔇' : '🎙'}</button>` : ''}
      ${live && !p.out ? `<button type="button" class="rk ${p.held ? 'on' : ''}" data-act="hold" title="${p.held ? 'Resume' : 'Hold'}">⏸</button>` : ''}
      ${['live', 'connecting', 'calling'].includes(status) ? '<button type="button" class="rk hang" data-act="hangup" title="Hang up">☎</button>' : ''}`;
  }
  function renderDevice() {
    const el = U.$('#device'); if (!el) return;
    const mode = modeOf();
    const p = shown();
    const status = p ? (p.status === 'waiting' ? 'idle' : p.status) : 'idle';
    const led = !App.connected && mode === 'live' ? 'offline' : status === 'ringing' ? 'ringing' : ['connecting', 'live'].includes(status) ? 'live' : mode === 'live' ? App.status : 'available';
    // ◀ Collapse: the phone and the switchboard fold to a slim rail (the timer and the call's keys stay on it).
    const grid = U.$('#phoneGrid');
    const devFold = !!(grid && grid.classList.contains('with-side')) && App.folded(DEVFOLD);
    if (grid) grid.classList.toggle('dev-folded', devFold);
    el.classList.toggle('dev-rail', devFold);
    if (devFold) { el.style.minHeight = ''; el.innerHTML = devRailHTML(p, status, led); return; }
    /* The phone is built as the trainer's dialer is, band for band: the segmented line-key row, the
       keypad, the 🔈 Speaker · key · ⌫ Delete row, then the trio that comes alive on a call with the
       same hint under it — the trainee's own, since they answer calls rather than place them. */
    const lineKeys = mode === 'live'
      ? `<div class="line-keys two" role="group" aria-label="My line"><button class="${App.status === 'available' ? 'on' : ''}" data-act="available" aria-pressed="${App.status === 'available'}" title="Ready for a call: your trainer sees you as available">● Available</button><button class="${App.status === 'away' ? 'on' : ''}" data-act="away" aria-pressed="${App.status === 'away'}" title="Stepped out: your trainer sees you as away">◌ Away</button></div>`
      : '';
    const idleKeys = mode === 'live'
      ? `<div class="dev-keys three idle-keys" role="group" aria-label="This phone">
           <button class="key hand ${App.hand ? 'on' : ''}" data-act="hand" title="Raise your hand on your trainer's switchboard"><span class="ic">✋</span>${App.hand ? 'Asked' : 'Ask for a call'}</button>
           <button class="key" data-act="notify" title="Let the browser alert you when a call rings, even on another tab"><span class="ic">🔔</span>Alert me</button>
           <a class="key" href="#/logs/scenarios" style="text-decoration:none" title="Pick a practice call on 🗂 Call Logs & Scenario Picker; the AI caller rings this phone"><span class="ic">🎭</span>Practice</a>
         </div>
         <div class="dev-keys three idle-keys" role="group" aria-label="On the call">
           <button class="key mute" disabled title="Turn your microphone off while you check something; the caller still hears the line (once a call is connected)"><span class="ic">🎙</span>Mute</button>
           <button class="key" disabled title="Ask the caller first, then put them on hold: they hear hold music until you resume (once a call is connected)"><span class="ic">⏸</span>Hold</button>
           <button class="key" data-act="transfer" title="Where a call can be handed: the other trainees' lines and the firm's extensions. Open the list now, transfer once a call is connected"><span class="ic">↪</span>Transfer</button>
         </div>
         <p class="dev-hint">📞 Dial a trainee's extension to ring them for a practice call. On a call: ask to hold, Hold, then Transfer (🗣 warm or ↪ cold) or 👥 Merge — as at the real front desk.</p>`
      : '';
    let msg = '';
    if (p && p.needRejoin) msg = p.elsewhere ? `<div class="dev-msg lost">You're on this call in another tab or window. <button class="btn btn-sm btn-green" data-act="rejoin" style="margin-top:6px">📞 Move the call here</button></div>`
      : `<div class="dev-msg lost">This page reloaded during your call. <button class="btn btn-sm btn-green" data-act="rejoin" style="margin-top:6px">🔊 Reconnect the call</button></div>`;
    else if (p && p.out) {
      msg = p.status === 'calling' ? `<div class="dev-msg">🤝 Ringing <b>${esc(p.to)}</b> for a practice call… When they answer, you're the caller: they take the call as at the front desk.</div>`
        : p.status === 'ended' ? '' : p.held ? `<div class="dev-msg transfer">⏸ <b>${esc(p.to)}</b> put you on hold: you hear the hold music, as a caller would.</div>`
        : `<div class="dev-msg coach">🎭 <b>You're the caller</b> on a practice call with ${esc(p.to)}. Stay in character; ${esc(p.to)} takes the note. Not graded.</div>`;
    }
    else if (p && p.coaching) msg = `<div class="dev-msg coach">⏸ <b>Coaching time-out.</b> Your trainer paused the role-play to talk with you as your trainer.${p.coachMsg ? ' ' + esc(p.coachMsg) : ''}</div>`;
    else if (p && p.transfer && p.status === 'live') {
      const tx = p.transfer;
      const where = `<b>${esc(tx.to)}</b>${tx.ext ? ` (ext ${esc(tx.ext)})` : ''}`;
      msg = tx.state === 'ringing' ? `<div class="dev-msg transfer">${tx.kind === 'warm' ? '🗣 Warm transfer: ringing' : '↪ Transferring to'} ${where}… The caller hears hold music.${p.mode === 'live' ? ' <b>Resume</b> takes the caller back.' : ''}</div>`
        : tx.state === 'consult' ? `<div class="dev-msg transfer">🗣 <b>${esc(tx.to)} picked up.</b> The caller is on hold and can't hear you: tell ${esc(tx.to)} who is calling and why.
            <div class="row" style="margin-top:8px"><button class="btn btn-sm btn-green" data-act="tx-complete">↪ Complete the transfer</button>${tx.trainee ? '<button class="btn btn-sm" data-act="tx-merge">👥 Merge all three</button>' : ''}<button class="btn btn-sm" data-act="hold">⏸ Back to the caller</button></div></div>`
        : tx.state === 'hung-up' ? `<div class="dev-msg transfer">📵 ${where} hung up before taking the caller. Press <b>Resume</b> to go back to the caller.</div>`
        : tx.state === 'declined' ? `<div class="dev-msg transfer">📵 ${where} declined. Press <b>Resume</b> to go back to the caller: offer to take a message.</div>`
        : tx.state === 'voicemail' ? `<div class="dev-msg transfer">📨 Ext ${esc(tx.ext)} (${esc(tx.to)}) went to voicemail. Press <b>Resume</b> to go back to the caller: offer voicemail or take a message.</div>`
        : `<div class="dev-msg transfer">📵 No answer at ext ${esc(tx.ext)} (${esc(tx.to)}). ${p.mode === 'ai' ? 'You are back with the caller.' : 'Press <b>Resume</b> to go back to the caller.'}</div>`;
    } else if (p && p.peerLost) msg = `<div class="dev-msg lost">The caller's connection dropped. Waiting for them to come back…</div>`;
    else if (p && p.slow && p.status === 'connecting') msg = `<div class="dev-msg lost">Still connecting the audio… If it doesn't connect, your network may be blocking calls: tell your trainer (the TURN relay fixes this).</div>`;
    else if (p && p.merging && p.status === 'live') msg = `<div class="dev-msg coach">👥 Ringing <b>${esc(p.merging.to)}</b> into the call… Once they answer, everyone hears everyone.</div>`;
    else if (p && p.consultFrom && ['ringing', 'live'].includes(p.status)) msg = `<div class="dev-msg transfer">🗣 <b>${esc(p.consultFrom)}</b> ${p.status === 'ringing' ? 'wants' : 'is about'} to transfer a caller to you (a warm transfer). ${p.status === 'ringing' ? 'Pick up: ' : ''}the caller is on hold and can't hear you two — find out who is calling and why, then ${esc(p.consultFrom)} hands them over.</div>`;
    else if (p && p.peer && ['ringing', 'live'].includes(p.status) && !p.held) msg = `<div class="dev-msg">🤝 <b>A practice call from ${esc(p.peer.name)}</b>${p.peer.ext ? ` (ext ${esc(p.peer.ext)})` : ''}: they play the caller. Take it as at the front desk. It isn't graded.</div>`;
    else if (p && p.handedFrom && ['ringing', 'live'].includes(p.status)) msg = `<div class="dev-msg transfer">↪ <b>A call transferred to you</b> from ${esc(p.handedFrom)}. The caller has already spoken to them: pick the call up, find out where they got to, and take it from there.</div>`;
    else if (p && p.conf && p.status === 'live') msg = `<div class="dev-msg coach">👥 <b>Conference call.</b> On the line with you: ${esc(p.conf.others.join(', ') || 'your trainer')}${p.conf.trainer ? ' and ' + esc(p.conf.trainer) + ' (the caller)' : ''}. Everyone hears everyone.</div>`;
    else if (p && p.notice && p.status === 'live') msg = `<div class="dev-msg">${esc(p.notice)}</div>`;
    else if (App.meetShare && p && !p.out && ['ringing', 'connecting', 'live'].includes(p.status)) msg = `<div class="dev-msg coach">📺 <b>You're presenting this phone in Google Meet.</b> The class hears the caller from this tab and you through your Meet mic: keep your Meet mic <b>on</b> and your headset on. ${VoIP.Speaker.on ? '<b>Turn 🔊 Speaker off</b>: your Meet mic would pick the call up from the speakers.' : ''}</div>`;
    else if (p && p.classOn && p.status === 'live') msg = `<div class="dev-msg coach">🎧 <b>Your class is listening in Google Meet.</b> If you're in the Meet too, mute your Meet mic and the Meet tab (right-click the tab → Mute site) until the call ends, so there's no echo.</div>`;
    else if (p && p.rec && p.status === 'ringing') msg = `<div class="dev-msg">● This call will be recorded for your review.</div>`;
    const head = mode === 'live'
      ? `<span class="led ${led}"></span><b>My phone</b>${App.myExt ? ` <span class="mono" title="Your desk extension: your trainer dials it to ring you">ext ${esc(App.myExt)}</span>` : ''}<span class="spacer"></span><span id="trOnline">${trainerLine()}</span>${grid && grid.classList.contains('with-side') ? `<button type="button" class="dev-collapse" data-fold="${DEVFOLD}" title="Collapse the phone and the switchboard to a slim rail: the workspace and the CMS take the screen. The call keeps going." aria-expanded="true"><span>◀</span><span class="dc-lb">Collapse</span></button>` : ''}`
      : `<span class="led ${led}"></span><b>Practice phone</b><span class="spacer"></span><span>AI caller</span>`;
    const shownCall = p && p.status !== 'waiting' ? p : null;
    const pad = padHTML(shownCall);
    el.classList.toggle('pad', !!pad);
    el.innerHTML = `<div class="dev-head">${head}</div>
      ${p && p.out ? outLcd(p) : App.lcdHTML(shownCall, idleInfo(mode), dialLcd(shownCall), lineCid(shownCall, mode))}
      ${msg}
      ${shownCall ? '' : lineKeys}
      ${pad}
      ${p && p.out ? outKeysHTML(p) : App.keysHTML(shownCall, idleKeys)}
      <div class="dev-foot"><span title="Call volume">🔉</span><input type="range" min="0" max="1" step="0.05" value="${App.volume == null ? 1 : App.volume}" data-act="volume" aria-label="Call volume">${!App.connected && mode === 'live' ? '<span>Offline</span>' : `<button type="button" class="dev-link" data-act="miccheck">🎧 Audio check</button><button type="button" class="dev-link ${App.meetShare ? 'on' : ''}" data-act="meetshare" title="Present this phone in Google Meet so your class hears the call">📺 ${App.meetShare ? 'In Meet' : 'Share in Meet'}</button>`}</div>`;
  }
  // 🤝 The screen and keys of a practice call you placed (you are the caller).
  function outLcd(p) {
    const st = p.status;
    const main = st === 'calling' ? `<div class="lcd-state">Calling…</div><div class="lcd-name">${esc(p.to)}</div><div class="lcd-num">Ext ${esc(p.ext)}</div><div class="lcd-sub">Practice call · you play the caller</div>`
      : st === 'connecting' ? `<div class="lcd-state">Connecting…</div><div class="lcd-name">${esc(p.to)}</div><div class="lcd-num">Ext ${esc(p.ext)}</div>`
      : st === 'live' ? `<div class="lcd-state ok">${p.held ? 'On hold' : 'Connected'} · you're the caller</div><div class="lcd-name">${esc(p.to)}</div><div class="lcd-num">Ext ${esc(p.ext)}</div><div class="lcd-timer" data-since="${p.answeredAt}">${U.since(p.answeredAt)}</div>`
      : `<div class="lcd-state">Call ended</div><div class="lcd-name" style="font-size:18px">${esc(p.to)}</div><div class="lcd-timer" style="color:#94a3b8">${U.dur((p.endedAt || Date.now()) - (p.answeredAt || p.endedAt || Date.now()))}</div><div class="lcd-sub">${esc(p.endNote || '')}</div>`;
    const b = [];
    if (st === 'live' && p.held) b.push(`<span class="lb hold">HOLD <span data-since="${p.holdAt}">${U.since(p.holdAt)}</span></span>`);
    if (st === 'live' && p.muted) b.push('<span class="lb mute">MUTED</span>');
    if (['calling', 'connecting', 'live'].includes(st)) b.push('<span class="lb">🤝 PRACTICE</span>');
    if (['calling', 'connecting', 'live'].includes(st) && VoIP.Speaker.on) b.push('<span class="lb spk">🔊 SPEAKER</span>');
    return `<div class="lcd ${st === 'calling' ? 'ringing' : st}"><div class="lcd-top"><span>Trainee line ext ${esc(p.ext)}</span><span data-clock></span></div><div class="lcd-main">${main}</div><div class="lcd-badges">${b.join('')}</div><div class="lcd-cid">Calling from <b>your line${App.myExt ? ' ext ' + esc(App.myExt) : ''}</b></div></div>`;
  }
  function outKeysHTML(p) {
    if (p.status === 'ended') return `<div class="dev-keys"><button class="key wide" data-act="next"><span class="ic">✓</span>Done</button></div>`;
    return `<div class="dev-keys three"><button class="key mute ${p.muted ? 'on' : ''}" data-act="mute" ${p.status === 'live' ? '' : 'disabled'}><span class="ic">${p.muted ? '🔇' : '🎙'}</span>${p.muted ? 'Unmute' : 'Mute'}</button>${spkKey()}<span></span>
      <button class="key hang wide" data-act="hangup"><span class="ic">☎</span>${p.status === 'calling' ? 'Cancel' : 'Hang up'}</button></div>`;
  }

  function renderBadges() {
    const p = App.p, box = U.$('#device .lcd-badges');
    if (!p || !box || p.out) return;
    const tmp = document.createElement('div'); tmp.innerHTML = App.lcdHTML(p, {});
    box.innerHTML = tmp.querySelector('.lcd-badges').innerHTML;
  }

  // What comes up beside the phone: how a live mock call goes while it's idle, and the panes a call needs once one is on.
  function renderWork() {
    const el = U.$('#work'); if (!el) return;
    const grid = U.$('#phoneGrid');
    const mode = modeOf();
    const p = shown();
    /* ☎ The Console is the switchboard and the phone and nothing else, as the trainer's is: the panes
       a call needs come up when a call does, and the trainee's own screens are a tab away. */
    const solo = !p && grid && grid.classList.contains('with-side');
    if (grid) grid.classList.toggle('solo', !!solo);
    if (solo) { el.innerHTML = ''; syncCms(); fitBoard(); return; }
    if (p && p.out) { el.innerHTML = outWorkHTML(p); bindOutWork(el, p); syncCms(); return; }
    if (!p || p.status === 'waiting') {
      syncCms();
      if (mode === 'ai' && p) { el.innerHTML = briefHTML(p); return; }
      el.innerHTML = welcomeHTML();
      loadRecent();
      return;
    }
    const track = p.track;
    const ended = p.status === 'ended';
    const tabs = [['note', '📝 Note'], ['lookup', p.cmsOpen ? '🔎 Case lookup · 🗂 CMS' : '🔎 Case lookup'], ['dir', '📇 Directory'], ['rules', '📘 Rules']];
    if (p.mode === 'ai' && (p.showTranscript || ended)) tabs.splice(1, 0, ['tr', p.voice === 'text' ? '💬 Conversation' : '💬 Transcript']);
    // On a live mock call the case file comes first, as at the real front desk: look the caller up,
    // open the file (in the CMS if you like), then take the note.
    const start = p.mode === 'ai' && p.voice === 'text' && !ended ? 'tr' : p.mode === 'live' && !ended ? 'lookup' : 'note';
    // The pane the trainee last opened stays open: the screen redraws often during a call.
    const first = p.tab && tabs.some(([k]) => k === p.tab) ? p.tab : start;
    let wrap = '';
    if (ended) {
      if (p.mode === 'ai' && p.submitted) wrap = gradeHTML(p);
      else if (p.submitted) wrap = `<div class="ok-box" style="margin-bottom:14px">✅ Note submitted. Your trainer will score this call; you'll find it in <a href="#/call/${esc(p.callId)}">My calls</a>. <button class="btn btn-sm" data-act="next" style="margin-left:6px">Ready for the next call</button></div>`;
      else wrap = `<div class="warn-box" style="margin-bottom:14px"><b>Call ended${p.endNote ? ': ' + esc(p.endNote) : ''}.</b> Finish your note, check it, then submit it. <div class="row" style="margin-top:8px"><button class="btn btn-orange" id="submitNote" data-act="submit">Submit my note</button>${p.mode === 'ai' ? '<span class="small">The AI scores the call when you submit.</span>' : '<span class="small">Your trainer scores the call and the note.</span>'}</div></div>`;
    } else if (p.status === 'ringing') {
      wrap = `<div class="note-box" style="margin-bottom:14px">📞 <b>Answer within 3 rings.</b> Greet with the firm name and your name. ${p.mode === 'ai' && !p.surprise ? `<br><span class="small muted">${esc(p.scenario.facts || '')}</span>` : ''}</div>`;
    }
    const trPane = p.mode === 'ai' ? `<div class="pane" data-pane="tr">
        ${p.voice === 'text' && !ended ? '<p class="small muted">This call is typed: write what you would say, and press Enter.</p>' : '<p class="small muted">What the phone heard (transcribed as you talk; names and numbers may be slightly off).</p>'}
        <div class="transcript" id="trLines">${p.lines.map((l) => `<div class="tl ${l.who}" data-line="${esc(l.id)}"><b>${l.who === 'caller' ? 'Caller' : 'You'}</b>${esc(l.text)}</div>`).join('')}</div>
        ${p.voice === 'text' && !ended ? `<div class="row" style="margin-top:10px"><input class="input" id="typeIn" placeholder="Type what you say…" style="flex:1" autocomplete="off"><button class="btn btn-primary" data-act="send">Send</button><span id="typeBusy" class="small muted hidden">Caller is typing…</span></div>` : ''}
      </div>` : '';
    el.innerHTML = `${wrap}<div class="work-tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === first ? 'on' : ''}"${k === 'lookup' && p.cmsOpen ? ` title="${p.lkOpen ? 'Click to fold the search away' : 'Click to search the case files'}"` : ''}>${l}${k === 'lookup' && p.cmsOpen ? ` <span class="lk-caret">${p.lkOpen ? '▲' : '▼'}</span>` : ''}</button>`).join('')}</div>
      <div class="pane ${first === 'note' ? 'on' : ''}" data-pane="note">${App.noteFormHTML(track, p.note, p.submitted)}</div>
      ${trPane.replace('class="pane"', `class="pane ${first === 'tr' ? 'on' : ''}"`)}
      <div class="pane ${first === 'lookup' ? 'on' : ''} ${p.cmsOpen && !p.lkOpen ? 'lk-folded' : ''}" data-pane="lookup">${p.cmsOpen && !p.lkOpen
        ? ''
        : `${p.cmsOpen ? '' : `<div class="lk-cms"><button type="button" class="btn btn-sm btn-primary" data-act="cmsopen" title="The CMS Training Library beside the call, signed in as you">🗂 Open the CMS</button></div>`}${App.lookupHTML(p)}${p.cmsOpen ? '<div class="row" style="margin-top:8px"><button type="button" class="btn btn-sm" data-act="lkopen">▲ Fold the search</button></div>' : ''}`}</div>
      <div class="pane" data-pane="dir">${App.directoryHTML(p.status === 'live')}</div>
      <div class="pane" data-pane="rules">${App.rulesHTML(track)}</div>`;
    App.bindLookup(el, { hide: p.hideCases, live: !ended && p.status !== 'waiting',
      onPick: (id) => { p.caseId = id; if (p.mode === 'live' || p.assigned) App.board.send({ t: 'case', callId: p.callId, caseId: id }); },
      onOpen: (id) => openCmsSplit(id) });
    const box = U.$('#trLines', el); if (box) box.scrollTop = box.scrollHeight;
    syncCms();
  }

  /* 📺 Share in Meet: the trainee presents this tab in Google Meet themselves, with no trainer Class view.
     Meet's "Also share tab audio" sends what this tab plays: the caller, the ringback and the hold music. The
     trainee's own voice reaches the class through their Meet mic, as in any Meet. The caller (a trainer or a
     classmate in the same Meet) is told, through the board, to mute their Meet mic and the Meet tab, or the class
     would hear them twice. Nothing can tell from inside a tab whether Meet is sharing it, so the trainee says so. */
  App.meetShare = (() => { try { return sessionStorage.getItem('mcv_meetshare') === '1'; } catch (e) { return false; } })();
  function setMeetShare(on) {
    App.meetShare = !!on;
    try { if (on) sessionStorage.setItem('mcv_meetshare', '1'); else sessionStorage.removeItem('mcv_meetshare'); } catch (e) {}
    const p = App.p;
    if (p && p.callId && !p.out && p.mode !== 'ai' && ['ringing', 'connecting', 'live'].includes(p.status)) App.board.send({ t: 'share', callId: p.callId, on: App.meetShare });
    renderDevice();
  }
  T.shareSync = () => { const p = App.p; if (App.meetShare && p && p.callId && !p.out && p.mode !== 'ai') App.board.send({ t: 'share', callId: p.callId, on: true }); };
  function meetShare() {
    const m = App.modal({ title: '📺 Share your phone in Google Meet', body: `<p class="small muted">Your class hears the call from this tab, the way it hears a video someone presents. Use Chrome or Edge.</p>
      <ol class="small">
        <li>Wear your headset (any make). Turn <b>🔊 Speaker off</b>.</li>
        <li>In Meet: <b>Present now → A tab</b>, pick <b>this</b> tab (LSH Ring Channel), turn on <b>Also share tab audio</b>, then <b>Share</b>. Choose "A tab", not "Window" or "Entire screen": only a tab carries the sound.</li>
        <li>Keep your Meet mic <b>on</b>: the class hears you through Meet, and the caller through this tab.</li>
        <li>Your caller mutes their Meet mic and the Meet tab while you're on the call (their console tells them).</li>
        <li>When the call is over, stop presenting in Meet and press <b>Stop sharing</b> here.</li>
      </ol>
      <div class="row" style="margin-top:12px">${App.meetShare ? '<button class="btn btn-orange" data-ms="off">Stop sharing</button>' : '<button class="btn btn-primary" data-ms="on">I\'m presenting this tab</button>'}<button class="btn" data-x="1">Close</button></div>` });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ms]'); if (!b) return;
      setMeetShare(b.dataset.ms === 'on');
      if (App.meetShare && VoIP.Speaker.on) App.toggleSpeaker(renderDevice);
      m.close();
    });
  }

  /* 🗂 The CMS beside the call: the CMS Training Library in a frame under the workspace tabs, signed in as the trainee
     (the same Portal ticket 🔎 Case lookup's "Open in the CMS" uses; the CMS keeps its session in a frame, see its
     functions/_utils.js). The frame is made once and kept: the workspace redraws often during a call, and a frame
     that's redrawn reloads, so it lives beside #work (not in it) and is only shown or hidden. */
  // The CMS shows under 🔎 Case lookup once it's opened there (on the other tabs it's kept, hidden).
  const cmsTabOn = () => { const p = shown(); return !!(p && !p.out && p.status !== 'waiting' && p.cmsOpen && U.$('#work [data-pane="lookup"].on')); };
  function syncCms() {
    const box = U.$('#cmsSplit'); if (!box) return;
    const on = cmsTabOn();
    box.classList.toggle('hidden', !on);
    if (on && !box.dataset.loaded) loadCms((shown() || {}).caseId || '', true);
  }
  // The trainer's console watches the trainee's CMS screen once they open it on a call (a classmate's practice call: no).
  function tellCms() {
    const p = shown();
    if (p && p.callId && !p.out && !p.peer && (p.mode === 'live' || p.assigned) && ['connecting', 'live', 'ended'].includes(p.status)) App.board.send({ t: 'cms', callId: p.callId });
  }
  // Open the CMS under Case lookup (the search folds to one bar), on a case file when one is given.
  function openCmsSplit(caseId) {
    const p = shown(), box = U.$('#cmsSplit'), w = U.$('#work');
    if (!box || !w || !p) { App.openCase(caseId); return; }
    p.cmsOpen = true; p.lkOpen = false; p.tab = 'lookup';
    // 💻 A laptop: the switchboard folds away the first time the CMS opens, so the CMS has the room (« brings it back).
    if (window.innerWidth < 1500 && !T.autoFolded && !App.folded('tside')) { T.autoFolded = true; App.folded('tside', true); renderSide(); }
    const reload = box.dataset.loaded && caseId && box.dataset.case !== caseId;
    renderWork();   // syncCms loads the frame the first time
    if (reload) loadCms(caseId);
    // The workspace tabs stay in sight above the CMS (the lookup's button can sit far down the page).
    if (w.getBoundingClientRect().top < 70) window.scrollBy({ top: w.getBoundingClientRect().top - 84 });
  }
  async function loadCms(caseId, quiet) {
    const box = U.$('#cmsSplit'); if (!box) return;
    box.dataset.loaded = '1'; box.dataset.case = caseId || '';
    box.innerHTML = `<div class="cms-split-head"><b>🗂 CMS Training Library</b>${caseId ? ` <span class="badge">${esc(caseId)}</span>` : ''}<span class="small muted cms-msg" style="flex:1">Opening, signed in as you…</span>${App.zoomHTML()}
        <button class="btn btn-sm" data-cms="tab" title="Open the CMS in its own browser tab instead">↗ New tab</button><button class="btn btn-sm" data-cms="close" title="Close the CMS beside the call">✕ Close</button></div>
      ${App.cmsFrameHTML('LSH CMS Training Library')}`;
    App.grip(box);
    box.onclick = (e) => {
      const b = e.target.closest('[data-cms]'); if (!b) return;
      if (b.dataset.cms === 'tab') { App.openCase(box.dataset.case || '', b); tellCms(); }
      else { box.innerHTML = ''; delete box.dataset.loaded; box.classList.add('hidden'); const q = shown(); if (q) { q.tab = 'lookup'; q.cmsOpen = false; } renderWork(); }
    };
    try {
      const r = await API.post('/api/cms-link', { caseId: caseId || '' });
      const f = U.$('.cms-frame', box), msg = U.$('.cms-msg', box);
      if (!f) return;
      f.src = r.url;
      tellCms();
      if (msg) msg.textContent = r.authed ? 'Signed in as you. Search the client the way you would at the front desk.' : 'The CMS will ask you to come in from the LSH Training Portal (no Portal secret is set on this site).';
    } catch (e) {
      const msg = U.$('.cms-msg', box); if (msg) msg.textContent = 'Couldn\'t open the CMS: ' + e.message;
      if (!quiet) U.toast('Couldn\'t open the CMS: ' + e.message, 'error');
    }
  }

  // 🎭 Beside the phone while you're the caller: who you could be (a client on a case file), and what they've noted.
  function outWorkHTML(p) {
    const cases = Object.values(App.cfg.cases || {});
    const c = p.playCase && App.cfg.cases[p.playCase];
    const n = p.theirNote || {}, form = App.formFor('reception');
    const noted = form.fields.filter((f) => n[f.k]);
    return `<h2>🎭 You're the caller</h2>
      <p class="muted">A practice call between trainees: ${esc(p.to)} answers as the front desk, and you play someone calling the firm. Pick a client from the case files, or be a new caller (an adjuster, a family member, someone with a new injury). Stay in character, and give ${esc(p.to)} the chance to verify you, put you on hold and transfer you.</p>
      <div class="field"><label class="f">Play a client from a case file</label><select class="input" id="outCase"><option value="">A caller of my own</option>${cases.map((x) => `<option value="${esc(x.id)}" ${x.id === p.playCase ? 'selected' : ''}>${esc(x.id)} · ${esc(x.name)}</option>`).join('')}</select></div>
      ${c ? `<pre class="case">${esc(c.text)}</pre>` : ''}
      ${p.status === 'ended' ? `<div class="ok-box" style="margin-top:12px">Call ended${p.endNote ? ': ' + esc(p.endNote) : ''}. ${esc(p.to)} submits their note; trade places and call each other back to practice the other side.</div>` : ''}
      <h3 style="margin-top:14px">📝 ${esc(p.to)}'s note</h3><div class="small">${noted.length ? noted.map((f) => `<div><b>${esc(f.label)}:</b> ${esc(n[f.k])}</div>`).join('') : '<span class="muted">Nothing typed yet.</span>'}</div>`;
  }
  function bindOutWork(el, p) { const sel = U.$('#outCase', el); if (sel) sel.onchange = () => { p.playCase = sel.value; renderWork(); }; }

  function welcomeHTML() {
    return `<h2>Live mock calls</h2>
      <p class="muted">Keep this page open with your headset on. When your trainer rings, your phone rings here: answer it and handle the call like a real one.</p>
      <ol class="small" style="padding-left:18px">
        <li><b>Answer within 3 rings</b> and greet with the firm name and your name.</li>
        <li>Look the caller up in <b>🔎 Case lookup</b>, verify before you share anything, and use <b>Hold</b> and <b>Transfer</b> like on a real phone.</li>
        <li>Fill in the <b>📝 Note</b> while you talk (your trainer sees it live), then submit it when the call ends.</li>
        <li><b>🤝 Practice with a classmate:</b> dial their extension on the keypad and press 📞 — you play the caller, they take the call.</li>
      </ol>
      <div class="row" style="margin:6px 0 18px"><button class="btn" data-act="miccheck">🎙 Check my microphone</button><button class="btn" data-act="notify">🔔 Alert me when a call rings</button><a class="btn" href="#/logs/scenarios">🎧 Practice with an AI caller</a></div>
      <h3>Recent calls</h3><div id="recent" class="small muted">Loading…</div>`;
  }
  async function loadRecent() {
    try {
      const r = await API.post('/api/calls', { limit: 5 });
      const el = U.$('#recent'); if (!el) return;
      el.innerHTML = r.calls.length ? `<table class="list">${r.calls.map((c) => `<tr class="click" onclick="location.hash='#/call/${esc(c.id)}'"><td>${U.when(c.createdAt)}</td><td><b>${esc(c.title)}</b></td><td>${c.mode === 'ai' ? '<span class="badge">🎧 AI</span>' : c.mode === 'peer' ? '<span class="badge">🤝 Practice</span>' : '<span class="badge orange">📞 Live</span>'}</td><td>${c.score != null ? `<b>${c.score}%</b>` : c.conf && c.status === 'ended' ? '<span class="badge">👥 Conference</span>' : c.status === 'ended' ? '<span class="badge amber">Awaiting review</span>' : `<span class="badge">${esc(c.status)}</span>`}</td></tr>`).join('')}</table>` : 'No calls yet.';
    } catch (e) { const el = U.$('#recent'); if (el) el.textContent = ''; }
  }

  function briefHTML(p) {
    const s = p.scenario;
    return `<h2>${p.surprise ? '🎲 A surprise call' : esc(s.title)}</h2>
      <p class="muted">${p.surprise ? `A caller will ring the <b>${esc(p.lineLabel)}</b>. Handle it like a real call.` : esc(s.you)}</p>
      ${!p.surprise && s.facts ? `<div class="note-box">${esc(s.facts)}</div>` : ''}
      <p class="small muted" style="margin-top:12px">Your phone will ring in a moment…</p>`;
  }

  function gradeHTML(p) {
    if (p.grading) return `<div class="note-box" style="margin-bottom:14px">⏳ The AI is grading your call on the ${esc((App.cfg.tracks[p.track] || {}).sheet || 'Mock Calls Metrics')}${p.voice === 'voice' ? ' (it listens to the recording)' : ''}…</div>`;
    if (p.gradeError) return `<div class="err-box" style="margin-bottom:14px">The AI couldn't score this call: ${esc(p.gradeError)} <button class="btn btn-sm" data-act="regrade">Try again</button> <a href="#/call/${esc(p.callId)}">Open the call</a></div>`;
    const g = p.grade; if (!g) return '';
    p.seenGrade = true;
    return `<div class="card" style="margin-bottom:14px;border-color:#fed7aa">
      <div class="row"><div class="score-big">${p.score != null ? p.score + '%' : '–'}</div><div style="flex:1"><div class="verdict">${esc(g.verdict)}${g.avg != null ? ` <span class="badge">Weighted average ${g.avg} / 5</span>` : ''}</div><div class="small">${esc(g.summary)}</div></div></div>
      <div class="row" style="margin-top:12px"><a class="btn btn-primary" href="#/call/${esc(p.callId)}">See the full scorecard →</a><button class="btn" data-act="next">Take another call</button></div></div>`;
  }

  /* ---------- clicks and typing on the phone pages ---------- */
  function bindPage(root) {
    root.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        // 🔎 Case lookup clicked again with the CMS open: the search opens (or folds away) above the CMS.
        if (tab.dataset.tab === 'lookup' && tab.classList.contains('on') && App.p && App.p.cmsOpen) { App.p.lkOpen = !App.p.lkOpen; renderWork(); return; }
        if (App.p) App.p.tab = tab.dataset.tab;
        const w = U.$('#work');
        U.$$('[data-tab]', w).forEach((b) => b.classList.toggle('on', b === tab));
        U.$$('[data-pane]', w).forEach((x) => x.classList.toggle('on', x.dataset.pane === tab.dataset.tab));
        syncCms();
        return;
      }

      const fold = e.target.closest('[data-fold]');
      if (fold) { App.folded(fold.dataset.fold, !App.folded(fold.dataset.fold)); renderDevice(); renderSide(); fitBoard(); return; }
      const dk = e.target.closest('[data-dk]');
      if (dk) { press(dk.dataset.dk); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'dialcall') dialCall();
      else if (act === 'backspace') setDial(T.dial.slice(0, -1));
      else if (act === 'answer') answer();
      else if (act === 'decline') decline();
      else if (act === 'hangup') hangup();
      else if (act === 'mute') toggleMute();
      else if (act === 'speaker') { App.toggleSpeaker(renderDevice); if (App.meetShare && VoIP.Speaker.on) U.toast('You\'re presenting in Meet: with 🔊 Speaker on, your Meet mic picks the call up from the speakers and the class hears it twice. Use your headset.'); }
      else if (act === 'meetshare') meetShare();
      else if (act === 'cmsopen') openCmsSplit((App.p && App.p.caseId) || '');
      else if (act === 'lkopen') { const q = shown(); if (q) { q.lkOpen = !q.lkOpen; renderWork(); } }
      else if (act === 'hold') toggleHold();
      else if (act === 'transfer') pickTransfer();
      else if (act === 'merge') pickTransfer('merge');
      else if (act === 'tx-complete') txComplete();
      else if (act === 'tx-merge') txMerge();
      else if (act === 'transfer-to') doTransfer(b.dataset.ext, b.dataset.kind);
      else if (act === 'miccheck') App.micCheck();
      else if (act === 'rejoin') rejoin();
      else if (act === 'submit') submitNote();
      else if (act === 'regrade') gradeAi(App.p, true);
      else if (act === 'send') sendTyped();
      else if (act === 'next') { App.p = null; renderAll(); if (App.trainer() && App.at('practice')) App.views.practice.render(); }
      else if (act === 'hand') { App.hand = !App.hand; App.board.send({ t: 'hand', up: App.hand }); renderDevice(); if (App.hand) askNotify(); }
      else if (act === 'available' || act === 'away') { App.status = act; App.board.send({ t: 'status', status: act }); renderDevice(); if (act === 'available') askNotify(); }
      else if (act === 'notify') askNotify(true);
    });
    root.addEventListener('input', (e) => {
      if (e.target.dataset && e.target.dataset.act === 'volume') { App.volume = Number(e.target.value); remote().volume = App.volume; return; }
      const k = e.target.dataset && e.target.dataset.k;
      if (k && App.p && !App.p.submitted) { App.p.note[k] = e.target.value; pushNote(); }
    });
    root.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.k; if (k && App.p && !App.p.submitted) { App.p.note[k] = e.target.value; pushNote(); } });
    root.addEventListener('keydown', (e) => { if (e.target.id === 'typeIn' && e.key === 'Enter') { e.preventDefault(); sendTyped(); } });
  }

  function askNotify(tell) {
    try {
      if (!('Notification' in window)) return tell && U.toast('This browser can\'t show call alerts.');
      if (Notification.permission === 'default') Notification.requestPermission().then((r) => tell && U.toast(r === 'granted' ? 'You\'ll get an alert when a call rings.' : 'Alerts are off. The phone still rings on this page.'));
      else if (tell) U.toast(Notification.permission === 'granted' ? 'Alerts are on.' : 'Alerts are blocked in this browser\'s site settings.');
    } catch (e) {}
  }

  /* =========================================================
     Pages
     ========================================================= */
  /* ☎ Console: the trainee's main screen. ☎ The switchboard beside the phone (« minimizes it to a
     rail), the phone itself, and on the right how a live mock call goes — replaced by the panes the
     call needs once one is on the line. */
  App.register('phone', {
    trainee: true,
    render() {
      const app = App.host();
      /* A finished call is cleared once the trainee has seen what came of it, and the phone is ready for
         the next one: an AI call (a trainer's, or their own practice) waits until its score is read. */
      if (App.p && App.p.mode === 'ai' && App.p.status === 'ended' && App.p.submitted && !App.p.grading && App.p.seenGrade) App.p = null;
      if (App.p && App.p.mode === 'live' && App.p.status === 'ended' && App.p.submitted) App.p = null;
      app.innerHTML = `<div class="phone-layout with-side" id="phoneGrid"><div class="tside" id="tside"></div><div class="device" id="device"></div><div class="work-col"><div class="work card" id="work"></div><div class="cms-split card hidden" id="cmsSplit"></div></div></div>`;
      bindPage(app.firstChild);
      renderAll();
    }
  });

  /* 🎭 The Scenario Picker's practice calls (a tab of 🗂 Call Logs & Scenario Picker for a trainee,
     🎧 Try practice under 🛡 Admin for a trainer). A trainee's practice call then runs on ☎ their
     Console, the one phone they take every call on; a trainer's runs here. */
  App.register('practice', {
    render() {
      const app = App.host();
      if (App.p && App.p.assigned && !active(App.p)) App.p = null;   // a finished AI call a trainer sent stays in My calls
      if (App.p && App.p.mode === 'ai' && App.p.status === 'ended' && App.p.submitted && !App.p.grading) App.p = null;   // finished: back to the picker
      if (App.p && (App.p.mode === 'live' || App.p.assigned) && active(App.p)) { U.toast('You are on a call.'); location.hash = '#/' + (App.trainer() ? 'console' : 'phone'); return; }
      // A trainee's practice call runs on ☎ their Console: the picker hands it over and follows it there.
      if (!App.trainer() && App.p && App.p.mode === 'ai' && !App.p.assigned) { location.hash = '#/phone'; return; }
      if (App.p && App.p.mode === 'ai') {
        app.innerHTML = `<div class="phone-layout" id="phoneGrid"><div class="device" id="device"></div><div class="work-col"><div class="work card" id="work"></div><div class="cms-split card hidden" id="cmsSplit"></div></div></div>`;
        bindPage(app.firstChild);
        renderAll();
        return;
      }
      if (App.p && App.p.mode === 'live') App.p = null;
      if (!App.cfg.features.ai) {
        app.innerHTML = `<div class="card"><h2>🎧 Practice with an AI caller</h2><p>AI practice callers aren't set up on this site yet${App.trainer() ? ': add the GEMINI_API_KEY5 … secrets (see ⚙️ Setup)' : '. Ask your trainer'}. Live mock calls with your trainer work without it.</p></div>`;
        return;
      }
      // 📞 The Call Simulator link from the Portal (a course's "Take a graded call", the Simulators page):
      // open on its line, and for a graded call ring one straight away, with a caller the trainee doesn't
      // see first (the same as 🎲 Surprise me). Done once, so it doesn't ring again on every render.
      const link = App.callLink;
      if (link.track || link.line) { const t = linkTrack(link); if (t) { T.track = t; } link.track = link.line = ''; }
      const track = T.track || 'reception';
      // the program: the one the Portal link named (the course they came from), or every program; the calls are the CMS's
      const progs = App.cfg.programs || [];
      const prog = T.program != null ? T.program : progs.some((p) => p.k === App.callLink.program) ? App.callLink.program : '';
      const list = App.cfg.scenarios.filter((s) => s.track === track && s.ai !== false && (!prog || !s.program || s.program === prog));
      if (link.graded) {
        link.graded = false;
        if (list.length && App.cfg.features.ai) { const s = list[Math.floor(Math.random() * list.length)]; startAi(s.id, { surprise: true, graded: true, voice: T.voice }); return; }
      }
      app.innerHTML = `<div class="card">
        <div class="card-head"><h2>🎭 ${App.trainer() ? 'Try a practice call' : 'Practice with an AI caller'}</h2>${App.trainer() ? '<span class="spacer"></span><a class="btn btn-sm" href="#/admin/aicalls">← 🤖 AI calls</a>' : ''}</div>
        <p class="muted">An AI caller rings your practice phone and talks with you out loud, like a real caller (use a headset). Handle the call, take the note, and the AI scores it with the same rubric your trainer uses. Calls last up to ${App.cfg.features.aiMinutes} minutes.</p>
        <div class="row" style="margin:12px 0 16px">
          <div class="pill-tabs" id="tpg">${[{ k: '', icon: '🗂', short: 'Every program' }].concat(progs).map((p) => `<button data-prog="${p.k}" class="${p.k === prog ? 'on' : ''}">${p.icon} ${esc(p.short)}</button>`).join('')}</div>
          <div class="pill-tabs" id="trk">${Object.entries(App.cfg.tracks).map(([k, t]) => `<button data-track="${k}" class="${k === track ? 'on' : ''}">${t.icon} ${esc(t.label)}</button>`).join('')}</div>
          <span class="spacer"></span>
          <label class="check small"><input type="checkbox" id="optTr"> Show the live transcript</label>
          <label class="check small"><input type="checkbox" id="optTyped"> Type instead of talking</label>
          <label class="check small" title="The voice the AI caller speaks with: the same call, a different person on the line">🎚 <select class="input input-sm" id="optVoice">${App.voiceOptions(T.voice)}</select></label>
          <button class="btn btn-orange" id="surprise">🎲 Surprise me</button>
        </div>
        <div class="scen-grid">${list.map((s) => `<div class="scen" data-id="${esc(s.id)}">
            <div class="meta">${App.levelBadge(s.level)}${s.program && !prog ? `<span class="badge">${esc(((progs.find((p) => p.k === s.program)) || {}).icon || '')} ${esc(s.program)}</span>` : ''}${s.dir === 'out' ? '<span class="badge" title="You place this call: when you pick up, you are through to them">📤 You call out</span>' : ''}${s.caseId ? `<span class="badge">${esc(s.caseId)}</span>` : '<span class="badge">New caller</span>'}${s.custom ? '<span class="badge blue">Trainer-written</span>' : ''}</div>
            <h4>${esc(s.title)}</h4><p>${esc(s.facts || '')}</p>
            <div><button class="btn btn-primary btn-sm">📞 Take this call</button></div></div>`).join('') || '<div class="empty">No practice calls on this line yet.</div>'}</div>
      </div>`;
      const opts = () => { T.voice = U.$('#optVoice').value; return { transcript: U.$('#optTr').checked, typed: U.$('#optTyped').checked, voice: T.voice }; };
      U.$('#tpg').onclick = (e) => { const b = e.target.closest('[data-prog]'); if (b) { T.program = b.dataset.prog; App.views.practice.render(); } };
      U.$('#trk').onclick = (e) => { const b = e.target.closest('[data-track]'); if (b) { T.track = b.dataset.track; App.views.practice.render(); } };
      app.querySelector('.scen-grid').onclick = (e) => { const c = e.target.closest('[data-id]'); if (c) startAi(c.dataset.id, opts()); };
      U.$('#surprise').onclick = () => { if (!list.length) return; const s = list[Math.floor(Math.random() * list.length)]; startAi(s.id, Object.assign(opts(), { surprise: true })); };
    }
  });
})();
