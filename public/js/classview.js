/* =========================================================
   📺 The Class view: a tab to present in Google Meet
   ---------------------------------------------------------
   Opened from the trainer's console (📺 Class view). In Meet: Present
   now → A tab → this tab, with "Also share tab audio" on. The class then
   hears the trainee's side of the call (hold music and the ringback
   included) from this tab, and the trainer's voice (the caller) through
   the trainer's own Meet microphone. Meet's recording captures both.
   The class sees who is taking the call, the caller ID, the timer, hold
   and transfers, and the trainee's note as it's typed; never the
   caller's script or the goals (the call's title shows once it's over).
   It reads everything from the console that opened it (window.opener,
   Console.classState() and Console.remoteStream()): it has no phone
   line of its own.
   The call plays through this window's own AudioContext, not an <audio>
   element: Chrome plays a WebRTC stream from every <audio> element of a
   browser process through the first window that played it (the console),
   so an element here would sound from the console's tab and Meet's "share
   tab audio" would send silence. The class would then hear the trainee
   only through the trainee's own Meet mic, and not at all once they mute
   it. A muted <audio> element still holds the stream, which Chrome needs
   before Web Audio gets a remote stream's sound.
   ========================================================= */
(function () {
  'use strict';
  const { esc } = U;
  let timer = null, last = '', audioOn = false, ringing = false, raf = null;
  // The class audio: stream → src → out (gain) → this tab's speakers, with an analyser for the level meter.
  const cvOut = { ctx: null, out: null, an: null, src: null, stream: null, via: '' };
  window.ClassAudio = cvOut;   // the tests read what this tab plays from it

  const opener = () => { try { return window.opener && !window.opener.closed && window.opener.Console ? window.opener : null; } catch (e) { return null; } };

  App.register('class', {
    trainer: true,
    render() {
      document.body.classList.add('classview');
      document.title = '📺 Class view · LSH Ring Channel';
      const app = U.$('#app');
      if (!opener()) {
        app.innerHTML = `<div class="cv"><div class="cv-idle"><div class="cv-big">📺</div><h1>Class view</h1><p>Open it from the trainer console with <b>📺 Class view</b>, so it can play the call.</p></div></div>`;
        return;
      }
      app.innerHTML = `<div class="cv">
        <div class="cv-top"><span class="logo">☎</span><b>LSH Ring Channel</b><span class="cv-sub">Live mock call</span><span class="spacer"></span>
          <span class="cv-audio" id="cvAudioState">🔇 Class audio off</span><span class="cv-meter"><i id="cvLevel"></i></span></div>
        <div class="cv-setup" id="cvSetup">
          <button class="btn btn-orange btn-lg" id="cvStart">🔊 Start class audio</button>
          <ol>
            <li>Click <b>Start class audio</b>. This tab now plays the call; your console goes quiet so you don't hear it twice.</li>
            <li>In Google Meet: <b>Present now → A tab</b>, pick this tab, and turn on <b>Also share tab audio</b>.</li>
            <li>Keep your Meet mic <b>on</b> (your caller voice goes through Meet) and wear a headset.</li>
            <li>The trainee on the call mutes their Meet mic and the Meet tab; their phone reminds them. <b>Record</b> in Meet captures both voices.</li>
          </ol>
          <button class="btn btn-sm btn-ghost" id="cvHide">Hide these steps</button>
        </div>
        <div id="cvBody"></div>
        <audio id="cvAudio" playsinline></audio>
      </div>`;
      U.$('#cvStart').onclick = start;
      U.$('#cvHide').onclick = () => U.$('#cvSetup').classList.add('hidden');
      clearInterval(timer);
      timer = setInterval(tick, 300);
      tick();
    }
  });

  function start() {
    const op = opener(); if (!op) return;
    audioOn = true;
    try { Sounds.unlock(); } catch (e) {}
    outCtx();   // made on the click, so the browser lets it play
    const a = U.$('#cvAudio'); a.play().catch(() => {});
    op.Console.classAudio = true; op.Console.syncAudio();
    U.$('#cvStart').textContent = '🔊 Class audio on';
    U.$('#cvStart').disabled = true;
    last = '';
    tick();
  }
  function stopAudio() {
    audioOn = false;
    if (ringing) { Sounds.stop(); ringing = false; }
    const a = U.$('#cvAudio'); if (a) { a.pause(); a.srcObject = null; }
    playStream(null);
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (cvOut.ctx) { try { cvOut.ctx.close(); } catch (e) {} cvOut.ctx = cvOut.out = cvOut.an = null; }
  }

  // This window's AudioContext: what it plays is this tab's sound, the sound Meet shares.
  function outCtx() {
    if (!cvOut.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const c = cvOut.ctx = new Ctx();
      cvOut.out = c.createGain();
      cvOut.an = c.createAnalyser(); cvOut.an.fftSize = 512;
      cvOut.out.connect(cvOut.an); cvOut.out.connect(c.destination);
      const lvl = U.$('#cvLevel'), d = new Uint8Array(cvOut.an.fftSize);
      const draw = () => {
        if (!cvOut.an) return;
        cvOut.an.getByteTimeDomainData(d); let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i] - 128));
        if (lvl) lvl.style.width = (cvOut.src ? Math.round(Math.min(1, peak / 64) * 100) : 0) + '%';
        raf = requestAnimationFrame(draw);
      };
      draw();
    }
    if (cvOut.ctx.state === 'suspended') cvOut.ctx.resume().catch(() => {});
    return cvOut.ctx;
  }
  // Play the call's stream (or nothing) through this window's AudioContext.
  function playStream(stream) {
    const a = U.$('#cvAudio');
    if (cvOut.stream === stream) return;
    if (cvOut.src) { try { cvOut.src.disconnect(); } catch (e) {} cvOut.src = null; }
    cvOut.stream = stream; cvOut.via = '';
    if (a && a.srcObject !== stream) { a.srcObject = stream; if (stream) a.play().catch(() => {}); }
    if (!stream) return;
    try {
      // The tracks belong to the console's window: wrap them in a stream of this window's own.
      cvOut.src = outCtx().createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      cvOut.src.connect(cvOut.out);
      cvOut.via = 'webaudio';
      if (a) a.muted = true;    // holds the stream for Chrome; the sound comes from the AudioContext
    } catch (e) {
      console.warn('class audio', e && e.message);
      cvOut.via = 'element';
      if (a) a.muted = false;   // the old way, better than nothing
    }
  }
  window.addEventListener('pagehide', () => {
    const op = opener();
    if (op && App.isClassView) { op.Console.classAudio = false; try { op.Console.syncAudio(); } catch (e) {} }
  });

  function tick() {
    const op = opener();
    if (!op) {
      clearInterval(timer); stopAudio();
      const b = U.$('#cvBody'); if (b) b.innerHTML = `<div class="cv-idle"><h1>The console was closed</h1><p>Open the Class view again from the console.</p></div>`;
      return;
    }
    let s;
    try { s = op.Console.classState(); } catch (e) { return; }
    // The call's audio: this tab plays it (the class hears what Meet shares from this tab).
    const stream = audioOn ? op.Console.remoteStream() : null;
    playStream(stream);
    if (audioOn && cvOut.ctx && cvOut.ctx.state === 'suspended') cvOut.ctx.resume().catch(() => {});
    const want = audioOn && s.status === 'ringing';
    if (want && !ringing) { Sounds.ringback(); ringing = true; } else if (!want && ringing) { Sounds.stop(); ringing = false; }
    const st = U.$('#cvAudioState');
    if (st) st.textContent = audioOn ? (stream ? '🔊 Playing the call' : '🔊 Class audio on') : '🔇 Class audio off';
    const key = JSON.stringify(s);
    if (key === last) return;
    last = key;
    draw(s);
  }

  function draw(s) {
    const b = U.$('#cvBody'); if (!b) return;
    if (s.status === 'idle') { b.innerHTML = `<div class="cv-idle"><div class="cv-big">☎</div><h1>Waiting for the next mock call…</h1><p>The trainer's next call shows here.</p></div>`; return; }
    const first = String(s.trainee.name || '').split(/\s+/)[0];
    const chips = [];
    if (s.status === 'ringing') chips.push(`<span class="cv-chip ring">📞 Ringing <span data-rings="${s.ringAt}">${U.ringText(s.ringAt)}</span></span>`);
    if (s.status === 'connecting') chips.push('<span class="cv-chip">Connecting…</span>');
    if (s.status === 'live') {
      if (s.record) chips.push('<span class="cv-chip rec">● REC</span>');
      if (s.held) chips.push(`<span class="cv-chip hold">⏸ Caller on hold <span data-since="${s.holdAt}">${U.since(s.holdAt)}</span></span>`);
      if (s.transfer && !s.transfer.result) chips.push(`<span class="cv-chip hold">↪ Transferring to ${esc(s.transfer.to)} (${esc(s.transfer.ext)})</span>`);
      if (s.transfer && s.transfer.result) chips.push(`<span class="cv-chip">↪ ${esc(s.transfer.to)}: ${s.transfer.result === 'no-answer' ? 'no answer' : esc(s.transfer.result)}</span>`);
      if (s.coaching) chips.push('<span class="cv-chip coach">⏸ Coaching time-out</span>');
      if (s.reconnecting) chips.push('<span class="cv-chip warn">Trainee reconnecting…</span>');
    }
    const ended = s.status === 'ended';
    const clock = ended ? U.dur((s.endedAt || Date.now()) - (s.answeredAt || s.endedAt || Date.now()))
      : s.status === 'live' && s.answeredAt ? `<span data-since="${s.answeredAt}">${U.since(s.answeredAt)}</span>` : '0:00';
    b.innerHTML = `<div class="cv-grid">
      <div class="cv-phone">
        <div class="cv-k">Taking the call</div><div class="cv-name">${esc(s.trainee.name)}</div><div class="cv-batch">${esc(s.trainee.batch)} · ${esc(s.trackLabel)}</div>
        <div class="cv-lcd">
          <div class="cv-k">${esc(s.lineLabel)} · caller ID</div>
          <div class="cv-caller">${esc(s.callerId.name)}</div><div class="cv-num">${esc(s.callerId.number)}</div>
          <div class="cv-clock ${ended ? 'done' : ''}">${clock}</div>
          ${ended ? `<div class="cv-ended">Call ended${s.endNote ? ' · ' + esc(s.endNote) : ''}</div>` : ''}
        </div>
        <div class="cv-chips">${chips.join('')}</div>
        ${ended && s.title ? `<div class="cv-reveal"><div class="cv-k">The call was</div><b>${esc(s.title)}</b>${s.caller ? `<div>Caller: ${esc(s.caller.name)}${s.caller.role ? ', ' + esc(s.caller.role) : ''}</div>` : ''}</div>` : ''}
      </div>
      <div class="cv-note"><div class="cv-k">📝 ${esc(s.noteTitle)} · typed live by ${esc(first)}</div>
        ${s.note.length ? s.note.map((x) => `<div class="cv-row"><b>${esc(x.label)}</b><span>${esc(x.value)}</span></div>`).join('') : `<div class="cv-empty-note">${s.status === 'live' ? 'Nothing typed yet.' : 'The note appears here as it’s typed.'}</div>`}
      </div></div>`;
  }
})();
