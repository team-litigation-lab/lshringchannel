/* =========================================================
   The trainee's phone
   📞 My phone   live mock calls: the trainer rings, the trainee answers
                 and handles the call over real audio (WebRTC), takes the
                 note, and submits it for the trainer to score.
   🎧 Practice   the same phone with an AI caller (Gemini Live), scored
                 by the AI; open any time.
   App.p is the call on this phone: { mode: 'live' | 'ai', status:
   ringing · connecting · live · ended, caller ID, timings, hold, mute,
   transfer, note … }.
   ========================================================= */
(function () {
  'use strict';
  const { esc } = U;
  const T = window.Trainee = {};
  const remote = () => document.getElementById('remoteAudio');
  const active = (p) => p && ['ringing', 'connecting', 'live'].includes(p.status);
  // My phone draws live calls and the AI calls a trainer sent; 🎧 Practice draws the trainee's own practice calls.
  const onPage = () => (App.route.name === 'phone' && (!App.p || App.p.mode === 'live' || !!App.p.assigned)) || (App.route.name === 'practice' && App.p && App.p.mode === 'ai' && !App.p.assigned);

  /* =========================================================
     Switchboard messages
     ========================================================= */
  T.onUp = function (m) {
    if (T.ext !== App.myExt) { T.ext = App.myExt; if (!(App.p && active(App.p))) renderAll(); }   // the desk extension, on the phone
    App.board.send({ t: 'status', status: App.status });
    if (App.hand) App.board.send({ t: 'hand', up: true });
    const a = m.active, p = App.p;
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
    if (!App.trainersOnline && App.hand) { /* keep the hand up: it shows when a trainer comes on */ }
  };
  const trainerLine = () => App.trainersOnline ? `🎓 ${App.trainersOnline} trainer${App.trainersOnline > 1 ? 's' : ''} online` : 'No trainer online';

  T.onBoard = function (m) {
    const p = App.p;
    const mine = p && p.mode === 'live' && p.callId === m.callId;
    switch (m.t) {
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
        p.transfer.state = m.result;
        if (m.result !== 'connected') Sounds.beep();
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
      case 'ended': if (mine) endLive(m); return;
    }
  };

  const fromBrief = (m) => ({ mode: 'live', callId: m.callId, line: m.line, lineLabel: m.lineLabel, lineNumber: m.lineNumber, callerId: m.callerId, track: m.track,
    hideCases: m.hideCases || [], rec: !!m.recording, trainer: m.trainer, note: {}, muted: false, held: false });

  function incoming(m) {
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
      // Taking the caller back while the extension still rings cancels the transfer.
      if (!on && p.transfer && p.transfer.state === 'ringing') App.board.send({ t: 'transfer-cancel', callId: p.callId });
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
  async function doTransfer(ext) {
    const p = App.p; if (!p || p.status !== 'live') return;
    const d = App.dirEntry(ext); if (!d) return;
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
    p.transfer = { to: d.name, ext, state: 'ringing' };
    App.board.send({ t: 'transfer', callId: p.callId, ext });
    renderDevice();
  }
  function hangup() {
    const p = App.p; if (!p || !active(p)) return;
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
    p.endNote = m.reason === 'transferred' ? `Transferred to ${p.transfer ? p.transfer.to : 'the extension'}` : m.reason === 'disconnected' ? 'The line dropped' : m.by === 'trainer' ? 'The caller hung up' : m.by === 'trainee' ? 'You hung up' : '';
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
  async function startAi(scenarioId, opts) {
    if (App.p && active(App.p)) return U.toast('Finish the call you are on first.', 'error');
    let r;
    try { r = await API.post('/api/ai/start', { scenarioId }); } catch (e) { return U.toast(e.message, 'error'); }
    const s = r.scenario;
    const line = App.cfg.lines[s.line];
    App.p = { mode: 'ai', status: 'waiting', callId: r.callId, scenario: s, surprise: !!opts.surprise, typed: !!opts.typed, showTranscript: !!opts.transcript,
      line: s.line, lineLabel: line.label, lineNumber: line.number, callerId: s.callerId || { name: 'WIRELESS CALLER', number: '' }, track: s.track, hideCases: s.hideCases || [],
      note: {}, lines: [], muted: false, held: false, rec: App.cfg.features.recordings, metrics: { holds: [], transfers: [] } };
    if (App.route.name === 'practice') App.views.practice.render(); else location.hash = '#/practice';
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
  function renderAll() { if (!onPage()) { App.onCallBar(); return; } renderDevice(); renderWork(); App.onCallBar(); }
  T.renderAll = renderAll;

  function idleInfo(mode) {
    if (mode === 'ai') {
      const p = App.p;
      if (p && p.status === 'waiting') return { state: 'Practice', title: 'Waiting for the call…', sub: 'Your phone will ring in a moment.' };
      return { state: 'Practice', title: 'Pick a practice call', sub: 'An AI caller will ring this phone.' };
    }
    return App.status === 'away' ? { state: 'Away', title: 'Away', sub: 'Your trainer sees you as away.' }
      : { state: 'Ready', title: 'Waiting for a call', sub: App.hand ? '✋ Your trainer can see you asked for a mock call.' : `Your trainer will ring this phone${App.myExt ? ` (ext ${esc(App.myExt)})` : ''}.` };
  }

  // My phone shows live calls and the AI calls a trainer sent; 🎧 Practice shows the trainee's own practice calls.
  function shown() {
    const p = App.p; if (!p) return null;
    return App.route.name === 'practice' ? (p.mode === 'ai' && !p.assigned ? p : null) : (p.mode === 'live' || p.assigned ? p : null);
  }
  function renderDevice() {
    const el = U.$('#device'); if (!el) return;
    const mode = App.route.name === 'practice' ? 'ai' : 'live';
    const p = shown();
    const status = p ? (p.status === 'waiting' ? 'idle' : p.status) : 'idle';
    const led = !App.connected && mode === 'live' ? 'offline' : status === 'ringing' ? 'ringing' : ['connecting', 'live'].includes(status) ? 'live' : mode === 'live' ? App.status : 'available';
    const idleKeys = mode === 'live'
      ? `<div class="dev-keys"><button class="key hand ${App.hand ? 'on' : ''}" data-act="hand"><span class="ic">✋</span>${App.hand ? 'Asked' : 'Ask for a call'}</button>
         <button class="key" data-act="miccheck"><span class="ic">🎧</span>Audio check</button><a class="key" href="#/practice" style="text-decoration:none"><span class="ic">🎧</span>Practice</a></div>
         <div class="dev-status"><button class="${App.status === 'available' ? 'on' : ''}" data-act="available">● Available</button><button class="${App.status === 'away' ? 'on away' : ''}" data-act="away">◌ Away</button></div>`
      : `<div class="dev-keys"><button class="key" data-act="miccheck"><span class="ic">🎧</span>Audio check</button></div>`;
    let msg = '';
    if (p && p.needRejoin) msg = p.elsewhere ? `<div class="dev-msg lost">You're on this call in another tab or window. <button class="btn btn-sm btn-green" data-act="rejoin" style="margin-top:6px">📞 Move the call here</button></div>`
      : `<div class="dev-msg lost">This page reloaded during your call. <button class="btn btn-sm btn-green" data-act="rejoin" style="margin-top:6px">🔊 Reconnect the call</button></div>`;
    else if (p && p.coaching) msg = `<div class="dev-msg coach">⏸ <b>Coaching time-out.</b> Your trainer paused the role-play to talk with you as your trainer.${p.coachMsg ? ' ' + esc(p.coachMsg) : ''}</div>`;
    else if (p && p.transfer && p.status === 'live') {
      const tx = p.transfer;
      msg = tx.state === 'ringing' ? `<div class="dev-msg transfer">↪ Transferring to <b>${esc(tx.to)}</b> (ext ${esc(tx.ext)})… The caller hears hold music.${p.mode === 'live' ? ' <b>Resume</b> takes the caller back.' : ''}</div>`
        : tx.state === 'voicemail' ? `<div class="dev-msg transfer">📨 Ext ${esc(tx.ext)} (${esc(tx.to)}) went to voicemail. Press <b>Resume</b> to go back to the caller: offer voicemail or take a message.</div>`
        : `<div class="dev-msg transfer">📵 No answer at ext ${esc(tx.ext)} (${esc(tx.to)}). ${p.mode === 'ai' ? 'You are back with the caller.' : 'Press <b>Resume</b> to go back to the caller.'}</div>`;
    } else if (p && p.peerLost) msg = `<div class="dev-msg lost">The caller's connection dropped. Waiting for them to come back…</div>`;
    else if (p && p.slow && p.status === 'connecting') msg = `<div class="dev-msg lost">Still connecting the audio… If it doesn't connect, your network may be blocking calls: tell your trainer (the TURN relay fixes this).</div>`;
    else if (p && p.notice && p.status === 'live') msg = `<div class="dev-msg">${esc(p.notice)}</div>`;
    else if (p && p.classOn && p.status === 'live') msg = `<div class="dev-msg coach">🎧 <b>Your class is listening in Google Meet.</b> If you're in the Meet too, mute your Meet mic and the Meet tab (right-click the tab → Mute site) until the call ends, so there's no echo.</div>`;
    else if (p && p.rec && p.status === 'ringing') msg = `<div class="dev-msg">● This call will be recorded for your review.</div>`;
    const head = mode === 'live'
      ? `<span class="led ${led}"></span><b>My phone</b>${App.myExt ? ` <span class="mono" title="Your desk extension: your trainer dials it to ring you">ext ${esc(App.myExt)}</span>` : ''}<span class="spacer"></span><span id="trOnline">${trainerLine()}</span>`
      : `<span class="led ${led}"></span><b>Practice phone</b><span class="spacer"></span><span>AI caller</span>`;
    el.innerHTML = `<div class="dev-head">${head}</div>
      ${App.lcdHTML(p && p.status !== 'waiting' ? p : null, idleInfo(mode))}
      ${msg}
      ${App.keysHTML(p && p.status !== 'waiting' ? p : null, idleKeys)}
      <div class="dev-foot"><span>🔊</span><input type="range" min="0" max="1" step="0.05" value="${App.volume == null ? 1 : App.volume}" data-act="volume" aria-label="Call volume"><span>${!App.connected && mode === 'live' ? 'Offline' : ''}</span></div>`;
  }
  function renderBadges() {
    const p = App.p, box = U.$('#device .lcd-badges');
    if (!p || !box) return;
    const tmp = document.createElement('div'); tmp.innerHTML = App.lcdHTML(p, {});
    box.innerHTML = tmp.querySelector('.lcd-badges').innerHTML;
  }

  function renderWork() {
    const el = U.$('#work'); if (!el) return;
    const mode = App.route.name === 'practice' ? 'ai' : 'live';
    const p = shown();
    if (!p || p.status === 'waiting') {
      if (mode === 'ai' && p) { el.innerHTML = briefHTML(p); return; }
      el.innerHTML = mode === 'live' ? welcomeHTML() : '';
      if (mode === 'live') loadRecent();
      return;
    }
    const track = p.track;
    const ended = p.status === 'ended';
    const tabs = [['note', '📝 Note'], ['lookup', '🔎 Case lookup'], ['dir', '📇 Directory'], ['rules', '📘 Rules']];
    if (p.mode === 'ai' && (p.showTranscript || ended)) tabs.splice(1, 0, ['tr', p.voice === 'text' ? '💬 Conversation' : '💬 Transcript']);
    const first = p.mode === 'ai' && p.voice === 'text' && !ended ? 'tr' : 'note';
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
    el.innerHTML = `${wrap}<div class="work-tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === first ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="pane ${first === 'note' ? 'on' : ''}" data-pane="note">${App.noteFormHTML(track, p.note, p.submitted)}</div>
      ${trPane.replace('class="pane"', `class="pane ${first === 'tr' ? 'on' : ''}"`)}
      <div class="pane" data-pane="lookup">${App.lookupHTML()}</div>
      <div class="pane" data-pane="dir">${App.directoryHTML(p.status === 'live')}</div>
      <div class="pane" data-pane="rules">${App.rulesHTML(track)}</div>`;
    App.bindLookup(el, p.hideCases);
    const box = U.$('#trLines', el); if (box) box.scrollTop = box.scrollHeight;
  }

  function welcomeHTML() {
    return `<h2>Live mock calls</h2>
      <p class="muted">Keep this page open with your headset on. When your trainer rings, your phone rings here: answer it and handle the call like a real one.</p>
      <ol class="small" style="padding-left:18px">
        <li><b>Answer within 3 rings</b> and greet with the firm name and your name.</li>
        <li>Look the caller up in <b>🔎 Case lookup</b>, verify before you share anything, and use <b>Hold</b> and <b>Transfer</b> like on a real phone.</li>
        <li>Fill in the <b>📝 Note</b> while you talk (your trainer sees it live), then submit it when the call ends.</li>
      </ol>
      <div class="row" style="margin:6px 0 18px"><button class="btn" data-act="miccheck">🎙 Check my microphone</button><button class="btn" data-act="notify">🔔 Alert me when a call rings</button><a class="btn" href="#/practice">🎧 Practice with an AI caller</a></div>
      <h3>Recent calls</h3><div id="recent" class="small muted">Loading…</div>`;
  }
  async function loadRecent() {
    try {
      const r = await API.post('/api/calls', { limit: 5 });
      const el = U.$('#recent'); if (!el) return;
      el.innerHTML = r.calls.length ? `<table class="list">${r.calls.map((c) => `<tr class="click" onclick="location.hash='#/call/${esc(c.id)}'"><td>${U.when(c.createdAt)}</td><td><b>${esc(c.title)}</b></td><td>${c.mode === 'ai' ? '<span class="badge">🎧 AI</span>' : '<span class="badge orange">📞 Live</span>'}</td><td>${c.score != null ? `<b>${c.score}%</b>` : c.status === 'ended' ? '<span class="badge amber">Awaiting review</span>' : `<span class="badge">${esc(c.status)}</span>`}</td></tr>`).join('')}</table>` : 'No calls yet.';
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
        const w = U.$('#work');
        U.$$('[data-tab]', w).forEach((b) => b.classList.toggle('on', b === tab));
        U.$$('[data-pane]', w).forEach((x) => x.classList.toggle('on', x.dataset.pane === tab.dataset.tab));
        return;
      }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'answer') answer();
      else if (act === 'decline') decline();
      else if (act === 'hangup') hangup();
      else if (act === 'mute') toggleMute();
      else if (act === 'speaker') App.toggleSpeaker(renderDevice);
      else if (act === 'hold') toggleHold();
      else if (act === 'transfer') App.pickTransfer(doTransfer);
      else if (act === 'transfer-to') doTransfer(b.dataset.ext);
      else if (act === 'miccheck') App.micCheck();
      else if (act === 'rejoin') rejoin();
      else if (act === 'submit') submitNote();
      else if (act === 'regrade') gradeAi(App.p, true);
      else if (act === 'send') sendTyped();
      else if (act === 'next') { App.p = null; renderAll(); if (App.route.name === 'practice') App.views.practice.render(); }
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
  App.register('phone', {
    trainee: true,
    render() {
      const app = U.$('#app');
      if (App.p && App.p.mode === 'ai' && !App.p.assigned && active(App.p)) { location.hash = '#/practice'; return; }
      if (App.p && App.p.mode === 'ai' && !App.p.assigned) App.p = null;
      if (App.p && App.p.assigned && App.p.status === 'ended' && App.p.submitted && !App.p.grading && App.p.seenGrade) App.p = null;
      if (App.p && App.p.status === 'ended' && App.p.submitted) App.p = null;   // finished and submitted: ready for the next call
      app.innerHTML = `<div class="phone-layout"><div class="device" id="device"></div><div class="work card" id="work"></div></div>`;
      bindPage(app.firstChild);
      renderAll();
    }
  });

  App.register('practice', {
    render() {
      const app = U.$('#app');
      if (App.p && (App.p.mode === 'live' || App.p.assigned) && active(App.p)) { U.toast('You are on a call.'); location.hash = '#/' + (App.trainer() ? 'console' : 'phone'); return; }
      if (App.p && App.p.assigned && !active(App.p)) App.p = null;   // a finished AI call a trainer sent stays in My calls
      if (App.p && App.p.mode === 'ai' && App.p.status === 'ended' && App.p.submitted && !App.p.grading) App.p = null;   // finished: back to the picker
      if (App.p && App.p.mode === 'ai') {
        app.innerHTML = `<div class="phone-layout"><div class="device" id="device"></div><div class="work card" id="work"></div></div>`;
        bindPage(app.firstChild);
        renderAll();
        return;
      }
      if (App.p && App.p.mode === 'live') App.p = null;
      if (!App.cfg.features.ai) {
        app.innerHTML = `<div class="card"><h2>🎧 Practice with an AI caller</h2><p>AI practice callers aren't set up on this site yet${App.trainer() ? ': add the GEMINI_API_KEY5 … secrets (see ⚙️ Setup)' : '. Ask your trainer'}. Live mock calls with your trainer work without it.</p></div>`;
        return;
      }
      const track = T.track || 'reception';
      const list = App.cfg.scenarios.filter((s) => s.track === track && s.ai !== false);
      app.innerHTML = `<div class="card">
        <div class="card-head"><h2>🎧 Practice with an AI caller</h2></div>
        <p class="muted">An AI caller rings your practice phone and talks with you out loud, like a real caller (use a headset). Handle the call, take the note, and the AI scores it with the same rubric your trainer uses. Calls last up to ${App.cfg.features.aiMinutes} minutes.</p>
        <div class="row" style="margin:12px 0 16px">
          <div class="pill-tabs" id="trk">${Object.entries(App.cfg.tracks).map(([k, t]) => `<button data-track="${k}" class="${k === track ? 'on' : ''}">${t.icon} ${esc(t.label)}</button>`).join('')}</div>
          <span class="spacer"></span>
          <label class="check small"><input type="checkbox" id="optTr"> Show the live transcript</label>
          <label class="check small"><input type="checkbox" id="optTyped"> Type instead of talking</label>
          <button class="btn btn-orange" id="surprise">🎲 Surprise me</button>
        </div>
        <div class="scen-grid">${list.map((s) => `<div class="scen" data-id="${esc(s.id)}">
            <div class="meta">${App.levelBadge(s.level)}${s.caseId ? `<span class="badge">${esc(s.caseId)}</span>` : '<span class="badge">New caller</span>'}${s.custom ? '<span class="badge blue">Trainer-written</span>' : ''}</div>
            <h4>${esc(s.title)}</h4><p>${esc(s.facts || '')}</p>
            <div><button class="btn btn-primary btn-sm">📞 Take this call</button></div></div>`).join('') || '<div class="empty">No practice calls on this line yet.</div>'}</div>
      </div>`;
      const opts = () => ({ transcript: U.$('#optTr').checked, typed: U.$('#optTyped').checked });
      U.$('#trk').onclick = (e) => { const b = e.target.closest('[data-track]'); if (b) { T.track = b.dataset.track; App.views.practice.render(); } };
      app.querySelector('.scen-grid').onclick = (e) => { const c = e.target.closest('[data-id]'); if (c) startAi(c.dataset.id, opts()); };
      U.$('#surprise').onclick = () => { if (!list.length) return; const s = list[Math.floor(Math.random() * list.length)]; startAi(s.id, Object.assign(opts(), { surprise: true })); };
    }
  });
})();
