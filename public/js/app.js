/* =========================================================
   LSH Ring Channel: the app shell
   Sign-in, routes, the Switchboard connection, and the parts both
   the trainee's phone and the trainer's console use: the phone's
   screen, the note form, case lookup, the firm directory, dialogs.
   Pages: trainee.js (📞 Phone, 🎧 Practice), console.js (🎛 Console),
   review.js (🗂 Calls, a call's review, 📚 Scenarios, 👥 Trainees, ⚙️ Setup).
   ========================================================= */
(function () {
  'use strict';
  const { esc } = U;

  const App = window.App = {
    cfg: null, me: null, board: null, views: {}, route: { name: '', arg: '' }, leave: null,
    p: null,          // the trainee's call (live or practice)
    t: null,          // the trainer's live call
    presence: { trainees: [], trainers: [] }, trainersOnline: 0,
    status: 'available', hand: false, tickers: []
  };
  App.trainer = () => !!(App.me && App.me.role === 'a');

  App.register = (name, view) => { App.views[name] = view; };
  // The live call this tab is on, kept per tab: after a reload the tab picks its own call back up,
  // while a second tab only offers to move the call to itself.
  App.ownCall = (id) => { try { if (id === undefined) return sessionStorage.getItem('mcv_call'); if (id) sessionStorage.setItem('mcv_call', id); else sessionStorage.removeItem('mcv_call'); } catch (e) { return null; } };

  // 🏠 Ring Channel opens from the LSH Training Portal: ?ticket=… signs a trainee in on their phone and an administrator in
  // on the console (the Worker checks it, src/portal.js). ?admin=1 (an older Portal) opens the trainers' fallback sign-in.
  // Both leave the address at once.
  function fromPortal() {
    let ticket = '', admin = false;
    try {
      const u = new URL(location.href);
      ticket = u.searchParams.get('ticket') || ''; admin = u.searchParams.get('admin') === '1';
      if (ticket || u.searchParams.has('admin')) { u.searchParams.delete('ticket'); u.searchParams.delete('admin'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); }
    } catch (e) { /* an odd address: nothing to take */ }
    return { ticket, admin };
  }

  /* ⬇ Install: Ring Channel as its own app (Chrome and Edge): its own window, icon, and Start menu / Dock / taskbar
     entry, no browser bars. The browser offers it once the page qualifies (manifest.webmanifest, sw.js). */
  App.installed = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  App.installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); App.installPrompt = e; App.header(); const g = document.getElementById('gateInstall'); if (g) g.classList.remove('hidden'); });
  window.addEventListener('appinstalled', () => { App.installPrompt = null; App.header(); U.toast('Installed: open LSH Ring Channel from your Start menu, Dock or taskbar.', 'ok'); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  App.install = async function () {
    const e = App.installPrompt;
    if (!e) return U.toast('In Chrome or Edge, open the browser menu (⋮) → "Install LSH Ring Channel" (or "Apps → Install this site as an app").');
    e.prompt();
    try { await e.userChoice; } catch (err) { /* closed */ }
    App.installPrompt = null; App.header();
  };

  App.boot = async function () {
    window.addEventListener('hashchange', () => App.go());
    const portal = fromPortal();
    if (portal.ticket) {
      try {
        const res = await API.post('/api/auth/portal', { ticket: portal.ticket });
        API.signIn(res);   // the page opens on that role's home (App.go): the console for a trainer, the phone for a trainee
      } catch (e) {
        return App.showLogin({ notice: e.message, error: true });
      }
    } else if (portal.admin && !(API.me && API.me.role === 'a')) return App.showLogin({ trainer: true });
    if (!API.token) return App.showLogin();
    try { App.cfg = await API.post('/api/config'); }
    catch (e) {
      if (e.status === 401) return App.showLogin();
      document.getElementById('app').innerHTML = `<div class="card err-box">Couldn't load the phone system: ${esc(e.message)} <button class="btn btn-sm" onclick="location.reload()">Try again</button></div>`;
      return;
    }
    App.me = App.cfg.me;
    App.scen = Object.fromEntries(App.cfg.scenarios.map((s) => [s.id, s]));
    // The Class view window only mirrors the console that opened it: it has no phone line of its own.
    App.isClassView = /^#\/class\b/.test(location.hash) && App.trainer();
    if (App.isClassView) document.body.classList.add('classview'); else App.connect();
    setInterval(App.tick, 500);
    App.go();
  };

  App.navItems = function () {
    return App.trainer()
      ? [['console', '🎛 Console'], ['aicalls', '🤖 AI calls'], ['calls', '🗂 Call log'], ['graded', '📋 Graded calls'], ['scenarios', '📚 Scenarios'], ['trainees', '👥 Trainees'], ['practice', '🎧 Try practice'], ['setup', '⚙️ Setup']]
      : [['phone', '📞 My phone'], ['practice', '🎧 Practice'], ['calls', '🗂 My calls']];
  };

  App.header = function () {
    const nav = document.getElementById('nav'), who = document.getElementById('who');
    if (!App.me) { nav.innerHTML = ''; who.innerHTML = ''; return; }
    nav.innerHTML = App.navItems().map(([k, l]) => `<a href="#/${k}" class="${App.route.name === k ? 'on' : ''}">${l}${k === 'calls' && App.unread ? '<span class="dot"></span>' : ''}</a>`).join('');
    const install = App.installPrompt && !App.installed() ? '<button type="button" class="hdr-install" onclick="App.install()" title="Install Ring Channel as an app: its own window and icon">⬇ Install</button>' : '';
    who.innerHTML = `${install}${App.trainer() && App.cfg && App.cfg.portal ? `<a class="hdr-btn" href="${esc(App.cfg.portal)}" title="LSH Training Portal (Training Directory)" aria-label="LSH Training Portal">🏠</a>` : ''}<span class="chip">${App.trainer() ? '🎓 Trainer' : '🎧 Trainee'} · ${esc(App.me.name)}${App.me.batch ? ' · ' + esc(App.me.batch) : ''}</span><button type="button" title="Signed in as ${esc(App.me.name)}" onclick="App.logout()">Log out</button>`;
  };

  App.go = function () {
    if (!App.me) return App.showLogin();
    const def = App.trainer() ? 'console' : 'phone';
    const h = location.hash.replace(/^#\/?/, '');
    let [name, arg] = h.split('/');
    if (App.isClassView) name = 'class';
    if (!App.views[name] || (App.views[name].trainer && !App.trainer()) || (App.views[name].trainee && App.trainer())) { name = def; if (location.hash !== '#/' + def) { history.replaceState(null, '', '#/' + def); } }
    if (App.leave) { try { App.leave(); } catch (e) {} App.leave = null; }
    App.route = { name, arg: arg ? decodeURIComponent(arg) : '' };
    App.header();
    App.onCallBar();
    const main = document.getElementById('app');
    main.onclick = main.onchange = main.oninput = null;
    window.scrollTo(0, 0);
    App.views[name].render(App.route.arg);
  };
  App.nav = (hash) => { if (location.hash === hash) App.go(); else location.hash = hash; };

  App.logout = function () {
    if ((App.p && ['ringing', 'connecting', 'live'].includes(App.p.status)) || (App.t && ['ringing', 'connecting', 'live'].includes(App.t.status))) {
      if (!confirm('You are on a call. Log out and end it?')) return;
    }
    try { if (App.board) App.board.close(); } catch (e) {}
    API.signOut(); location.hash = '#/'; location.reload();
  };

  /* ---------- sign-in ---------- */
  // Not signed in: Ring Channel has no sign-in form. It opens from the LSH Training Portal (signed in there), so this
  // shows the way to the Portal, with the trainers' passphrase folded away for when the Portal is down.
  App.showLogin = async function (opts) {
    opts = opts || {};
    App.me = null; App.header();
    const app = document.getElementById('app');
    let st = {};
    try { st = await API.post('/api/auth/status'); } catch (e) { st = {}; }
    const portal = st.portal || 'https://cm-training-activity.pages.dev/programs.html';
    app.innerHTML = `<div class="login gate">
      <div class="login-hero"><div class="big">☎</div><h1>LSH Ring Channel</h1>
        <p>The training phone for Reception, Calendar and Intake mock calls: your trainer rings, you answer, handle the call and take the note, and the call is recorded and graded.</p></div>
      ${opts.notice ? `<div class="${opts.error ? 'err-box' : 'note-box'}" id="loginNotice" style="margin-bottom:16px">${esc(opts.notice)}</div>` : ''}
      ${st.configured === false ? '<div class="warn-box" style="margin-bottom:16px">Ring Channel isn\'t set up yet: add the <b>ADMIN_PASSPHRASE</b> secret in Cloudflare (see the README).</div>' : ''}
      <div class="card gate-card">
        <h2>🏠 Open Ring Channel from the LSH Training Portal</h2>
        <p>There's no separate sign-in. Sign in on the Portal, then open <b>☎ LSH Ring Channel</b> from the Training Directory (trainers: also from Master Control). You arrive signed in: trainees on their phone, trainers on the console.</p>
        <a class="btn btn-orange btn-lg" id="toPortal" href="${esc(portal)}">Go to the LSH Training Portal →</a>
        <p class="small ${App.installPrompt && !App.installed() ? '' : 'hidden'}" id="gateInstall" style="margin:14px auto 0"><button type="button" class="btn btn-sm" onclick="App.install()">⬇ Install Ring Channel as an app</button> its own window and icon, like a desktop phone app.</p>
        <details class="gate-fallback" ${opts.trainer ? 'open' : ''}><summary>Trainer: is the Portal down?</summary>
          <form id="fTrainer" style="margin-top:10px">
            <div class="field"><label class="f" for="an">Your name (trainees see it)</label><input class="input" id="an" autocomplete="name" placeholder="e.g. Coach Ana" required></div>
            <div class="field"><label class="f" for="ap">Trainer passphrase</label><input class="input" id="ap" type="password" autocomplete="current-password" required></div>
            <button class="btn btn-primary" style="width:100%">Open the console</button>
            <div class="err-box hidden" id="aErr" style="margin-top:10px"></div>
          </form>
        </details>
      </div>
      <p class="muted small" style="text-align:center;margin-top:18px">Use Chrome or Edge on a computer with a headset. The caller, the firm and every case are fictional.</p>
    </div>`;
    const fail = (id, e) => { const el = document.getElementById(id); el.textContent = e.message; el.classList.remove('hidden'); };
    if (opts.trainer) { const f = U.$('#an'); if (f) f.focus(); }
    document.getElementById('fTrainer').onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        const res = await API.post('/api/auth/admin', { name: U.$('#an').value, passphrase: U.$('#ap').value });
        API.signIn(res); location.hash = '#/console'; location.reload();
      } catch (e) { fail('aErr', e); }
    };
  };

  /* ---------- the Switchboard connection ---------- */
  App.connect = function () {
    const b = App.board = new VoIP.Board();
    const net = document.getElementById('netbar');
    b.on('up', (m) => { net.classList.add('hidden'); App.connected = true; App.myExt = (m.me && m.me.ext) || ''; (App.trainer() ? Console : Trainee).onUp(m); });
    b.on('down', () => { App.connected = false; setTimeout(() => { if (!App.connected) net.classList.remove('hidden'); }, 2500); });
    b.on('presence', (m) => {
      App.desks = m.desks || [];   // the trainers who are on, each with their own extension
      if (App.trainer()) { App.presence = { trainees: m.trainees || [], trainers: m.trainers || [] }; Console.onPresence(); }
      else { App.trainersOnline = m.trainers || 0; App.peers = m.peers || []; Trainee.onPresence(); }
    });
    b.on('error', (m) => U.toast(m.msg, 'error'));
    b.on('trouble', () => { API.post('/api/me').catch(() => {}); });
    b.on('*', (m) => { if (!['hello', 'presence', 'error'].includes(m.t)) (App.trainer() ? Console : Trainee).onBoard(m); });
    b.on('graded', (m) => { if (App.gradedHook) App.gradedHook(m); });
    b.connect();
  };

  App.tick = function () {
    const n = Date.now();
    U.$$('[data-since]').forEach((el) => { const s = Number(el.dataset.since); if (s) el.textContent = U.dur(n - s); });
    U.$$('[data-rings]').forEach((el) => { const s = Number(el.dataset.rings); if (s) el.textContent = 'Ring ' + U.rings(n - s); });
    U.$$('[data-clock]').forEach((el) => { el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); });
    App.tickers.forEach((f) => { try { f(n); } catch (e) {} });
  };

  // A banner while you're on a call on another page.
  App.onCallBar = function () {
    const bar = document.getElementById('oncall');
    const c = App.trainer() ? App.t : App.p;
    const active = c && ['ringing', 'connecting', 'live'].includes(c.status);
    const home = App.trainer() ? 'console' : c && c.mode === 'ai' && !c.assigned ? 'practice' : 'phone';
    if (!active || App.route.name === home) { bar.classList.add('hidden'); return; }
    const who = App.trainer() ? (c.trainee && c.trainee.name) : (c.callerId && c.callerId.name);
    bar.innerHTML = `<span>📞 ${c.status === 'ringing' ? 'Ringing' : 'On a call'}${who ? ' · ' + esc(who) : ''}</span><span data-since="${c.answeredAt || c.ringAt || ''}">${U.since(c.answeredAt || c.ringAt)}</span><a href="#/${home}">Go back to the call →</a>`;
    bar.classList.remove('hidden');
  };

  /* ---------- panels the person can minimize ----------
     The console's two sidebars and the trainee's switchboard fold away to a thin rail, and stay
     that way on this computer. */
  App.folded = function (key, set) {
    try {
      if (set === undefined) return localStorage.getItem('mcv_fold_' + key) === '1';
      localStorage.setItem('mcv_fold_' + key, set ? '1' : '0');
    } catch (e) {}
    return !!set;
  };
  App.foldKey = (key, label, title) => `<button type="button" class="fold-btn" data-fold="${esc(key)}" title="${esc(title ? 'Minimize ' + title : 'Minimize ' + label)}" aria-label="${esc('Minimize ' + (title || label))}" aria-expanded="true"><span class="fb-ic">«</span> Minimize</button>`;
  // The thin rail a folded panel leaves behind: click it to bring the panel back.
  App.railHTML = (key, label, icon) => `<button type="button" class="rail" data-fold="${esc(key)}" title="Maximize ${esc(label)}" aria-label="Maximize ${esc(label)}" aria-expanded="false"><span class="rail-ic">${icon}</span><span class="rail-label">${esc(label)}</span><span class="rail-max">» Maximize</span></button>`;

  /* ---------- dialogs ---------- */
  App.modal = function ({ title, body, foot, wide, onClose }) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="${wide ? 'width:min(900px,100%)' : ''}"><div class="modal-head"><h3>${title}</h3><button class="btn btn-ghost btn-sm" data-x aria-label="Close">✕</button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', key); onClose && onClose(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-x]')) close(); });
    return { el: back, close };
  };

  // 🎧 Audio check: the microphone's level, and where the call plays (headset, or the speaker key's speakers), each with a test tone.
  App.micCheck = async function () {
    const Sp = VoIP.Speaker;
    const m = App.modal({ title: '🎧 Audio check', body: `<p class="small muted">Say a few words: the bar should move. Then test the headset and the speaker.</p>
      <div class="meter"><i id="mcLevel"></i></div><p class="small" id="mcMsg" style="margin-top:10px">Opening the microphone…</p>
      <div id="mcOut"></div>`, onClose: () => { stopMeter && stopMeter(); if (!busy()) VoIP.Mic.close(); } });
    const busy = () => (App.p && ['connecting', 'live'].includes(App.p.status)) || (App.t && ['ringing', 'connecting', 'live'].includes(App.t.status));
    let stopMeter = null;
    try {
      const s = await VoIP.Mic.open();
      const label = (s.getAudioTracks()[0] || {}).label || 'microphone';
      m.el.querySelector('#mcMsg').innerHTML = `✅ Microphone: <b>${esc(label)}</b>.`;
      stopMeter = VoIP.meter(s, (lv) => { const el = m.el.querySelector('#mcLevel'); if (el) el.style.width = Math.round(lv * 100) + '%'; });
    } catch (e) { m.el.querySelector('#mcMsg').innerHTML = `<span class="err-box" style="display:block">${esc(e.message)}</span>`; }
    // The outputs (their names show once the microphone is allowed).
    const box = m.el.querySelector('#mcOut');
    const draw = async () => {
      const r = await Sp.route();
      const opts = (sel, auto) => (auto ? `<option value="">Automatic (${esc(auto)})</option>` : '') + r.list.filter((d) => d.deviceId !== 'communications').map((d) => `<option value="${esc(d.deviceId)}" ${d.deviceId === sel ? 'selected' : ''}>${esc(d.deviceId === 'default' ? 'The computer\'s default output' + (d.label ? ` (${d.label.replace(/^Default - /, '')})` : '') : d.label || 'Audio output')}</option>`).join('');
      box.innerHTML = !Sp.supported() ? '<p class="small warn-box" style="margin-top:12px">This browser plays every sound on the computer\'s default output, so the 🔊 Speaker key can\'t switch it: use Chrome or Edge. <button class="btn btn-sm" data-out="test-default">🔊 Play a test tone</button></p>'
        : `<div class="out-row"><label class="f">🎧 Headset <span class="muted">(speaker off)</span></label><select class="input" data-out="headset">${opts(Sp.headset || 'default')}</select><button class="btn btn-sm" data-out="test-headset">▶ Test</button></div>
           <div class="out-row"><label class="f">🔊 Speaker <span class="muted">(speaker on)</span></label><select class="input" data-out="speaker">${opts(Sp.speaker, r.speakerName)}</select><button class="btn btn-sm" data-out="test-speaker">▶ Test</button></div>
           <p class="small muted">${r.separate ? `The 🔊 Speaker key moves the call from <b>${esc(r.headsetName)}</b> to <b>${esc(r.speakerName)}</b>.` : 'The headset and the speaker are the same output here: plug in a headset, or choose the speaker above.'} Speaker is <b>${Sp.on ? 'on' : 'off'}</b>.</p>`;
    };
    const test = async (id) => {
      try {
        const c = new (window.AudioContext || window.webkitAudioContext)();
        if (id && c.setSinkId) await c.setSinkId(id === 'default' ? '' : id);
        const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 660; g.gain.value = 0.06;
        o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.5);
        setTimeout(() => c.close().catch(() => {}), 900);
      } catch (e) { U.toast('Couldn\'t play on that output: ' + e.message, 'error'); }
    };
    box.addEventListener('change', async (e) => {
      const k = e.target.dataset.out; if (k !== 'headset' && k !== 'speaker') return;
      Sp[k] = e.target.value === 'default' && k === 'headset' ? '' : e.target.value; Sp.store(); await Sp.apply(); draw();
    });
    box.addEventListener('click', async (e) => {
      const k = e.target.closest('[data-out]') && e.target.closest('[data-out]').dataset.out; if (!k || !k.startsWith('test-')) return;
      const r = await Sp.route();
      test(k === 'test-speaker' ? r.speaker : k === 'test-headset' ? r.headset : '');
    });
    draw();
  };

  // 🔊 The speaker key (both phones): the call moves between the headset and the speakers.
  App.toggleSpeaker = async function (redraw) {
    const r = await VoIP.Speaker.toggle();
    if (r.note) U.toast(r.note, r.on ? '' : 'error');
    if (redraw) redraw();
  };

  /* ---------- the phone's screen (trainee side, live and practice) ---------- */
  App.lcdHTML = function (p, idle) {
    const status = p ? p.status : 'idle';
    const lineLabel = p && p.lineLabel ? p.lineLabel : 'LSH Training Law Group';
    const lineNo = p && p.lineNumber ? p.lineNumber : App.cfg.firm.mainLine;
    let main = '';
    if (!p || status === 'idle') main = `<div class="lcd-state">${idle.state}</div><div class="lcd-name" style="font-size:18px">${idle.title}</div><div class="lcd-sub">${idle.sub || ''}</div>`;
    else if (status === 'ringing') main = `<div class="lcd-state">Incoming call · ${esc(p.lineLabel)}</div><div class="lcd-name">${esc(p.callerId.name)}</div><div class="lcd-num">${esc(p.callerId.number)}</div><div class="lcd-sub" data-rings="${p.ringAt}">${U.ringText(p.ringAt)}</div>`;
    else if (status === 'connecting') main = `<div class="lcd-state">Connecting…</div><div class="lcd-name">${esc(p.callerId.name)}</div><div class="lcd-num">${esc(p.callerId.number)}</div>`;
    else if (status === 'live') main = `<div class="lcd-state">${p.held ? 'Caller on hold' : 'Connected'}</div><div class="lcd-name">${esc(p.callerId.name)}</div><div class="lcd-num">${esc(p.callerId.number)}</div><div class="lcd-timer" data-since="${p.answeredAt}">${U.since(p.answeredAt)}</div>`;
    else main = `<div class="lcd-state">Call ended</div><div class="lcd-name" style="font-size:18px">${esc(p.callerId ? p.callerId.name : '')}</div><div class="lcd-timer" style="color:#94a3b8">${U.dur((p.endedAt || Date.now()) - (p.answeredAt || p.endedAt || Date.now()))}</div><div class="lcd-sub">${esc(p.endNote || '')}</div>`;
    const badges = [];
    if (p && status === 'live') {
      if (p.rec) badges.push('<span class="lb rec">REC</span>');
      if (p.held) badges.push(`<span class="lb hold">HOLD <span data-since="${p.holdAt}">${U.since(p.holdAt)}</span></span>`);
      if (p.muted) badges.push('<span class="lb mute">MUTED</span>');
      if (p.coaching) badges.push('<span class="lb coach">⏸ COACHING</span>');
      if (p.peerLost) badges.push('<span class="lb warn">CALLER RECONNECTING</span>');
      if (p.quality) badges.push(`<span class="lb" title="${p.quality.rtt != null ? p.quality.rtt + ' ms' : ''}${p.quality.relay ? ' · via relay' : ''}"><span class="bars q${p.quality.bars}"><i></i><i></i><i></i><i></i></span></span>`);
      if (p.mode === 'ai') badges.push(`<span class="lb">${p.voice === 'text' ? 'TYPED' : 'AI CALLER'}</span>`);
    }
    if (p && ['ringing', 'connecting', 'live'].includes(status) && VoIP.Speaker.on) badges.push('<span class="lb spk">🔊 SPEAKER</span>');
    return `<div class="lcd ${status}"><div class="lcd-top"><span>${esc(lineLabel)} ${esc(lineNo)}</span><span data-clock></span></div><div class="lcd-main">${main}</div><div class="lcd-badges">${badges.join('')}</div></div>`;
  };

  // The keys under the screen: Answer / Decline while it rings; Mute, 🔊 Speaker, Hold, Transfer and Hang up on a call.
  App.keysHTML = function (p, idleKeys) {
    const status = p ? p.status : 'idle';
    if (status === 'ringing') return `<div class="dev-keys"><button class="key answer pulse wide" data-act="answer"><span class="ic">📞</span>Answer</button><button class="key hang wide" data-act="decline"><span class="ic">✖</span>Decline</button></div>`;
    if (status === 'connecting' || status === 'live') {
      const dis = status !== 'live' ? 'disabled' : '';
      const xfer = p.transfer && p.transfer.state === 'ringing' && p.mode === 'ai';
      return `<div class="dev-keys four">
        <button class="key mute ${p.muted ? 'on' : ''}" data-act="mute" ${dis}><span class="ic">${p.muted ? '🔇' : '🎙'}</span>${p.muted ? 'Unmute' : 'Mute'}</button>
        <button class="key spk ${VoIP.Speaker.on ? 'on' : ''}" data-act="speaker" aria-pressed="${VoIP.Speaker.on}" title="🔊 Speaker: ${VoIP.Speaker.on ? 'on: the call plays on the speakers' : 'off: the call plays in your headset'}"><span class="ic">${VoIP.Speaker.on ? '🔊' : '🔈'}</span>Speaker</button>
        <button class="key ${p.held ? 'on' : ''}" data-act="hold" ${dis || (xfer ? 'disabled' : '')}><span class="ic">⏸</span>${p.held ? 'Resume' : 'Hold'}</button>
        <button class="key" data-act="transfer" ${dis || (xfer || (p.transfer && p.transfer.state === 'ringing') ? 'disabled' : '')}><span class="ic">↪</span>Transfer</button>
        <button class="key hang wide" data-act="hangup"><span class="ic">☎</span>Hang up</button></div>`;
    }
    return idleKeys || '';
  };

  /* ---------- the workspace: note, case lookup, directory, rules ---------- */
  App.formFor = (track) => App.cfg.forms[(App.cfg.tracks[track] || App.cfg.tracks.reception).note];

  App.noteFormHTML = function (track, note, locked) {
    const form = App.formFor(track);
    note = note || {};
    const f = (x) => {
      const v = note[x.k] || '';
      const dis = locked ? 'disabled' : '';
      let input;
      if (x.type === 'textarea') input = `<textarea class="input" data-k="${x.k}" rows="2" ${dis}>${esc(v)}</textarea>`;
      else if (x.type === 'select') input = `<select class="input" data-k="${x.k}" ${dis}>${x.options.map((o) => `<option ${o === v ? 'selected' : ''} value="${esc(o)}">${esc(o || 'Choose…')}</option>`).join('')}</select>`;
      else input = `<input class="input" data-k="${x.k}" value="${esc(v)}" ${dis}>`;
      return `<div class="field" ${x.short ? 'style="max-width:260px"' : ''}><label class="f">${esc(x.label)}</label>${input}</div>`;
    };
    return `<div class="note-form"><h3 style="margin-bottom:10px">📝 ${esc(form.title)}</h3>${form.fields.map(f).join('')}</div>`;
  };
  App.readNote = (root) => { const o = {}; U.$$('[data-k]', root).forEach((el) => { if (el.value.trim()) o[el.dataset.k] = el.value; }); return o; };

  /* 🔎 Case lookup: the front desk's search of the firm's case files. On a live call it's the first
     thing on screen: the trainee searches, previews the file, marks the one the call is about (their
     trainer sees which file they picked, and the grade says whether it was the right one) and can open
     it in the CMS Training Library signed in as themselves. */
  App.lookupHTML = function (p) {
    const picked = p && p.caseId ? App.cfg.cases[p.caseId] : null;
    return `<p class="small muted">Search the firm's case files the way the front desk does: by the caller's name, a phone number, a date of birth or a case number (MC-xx). Nothing shows until you search.</p>
      <input class="input" id="lkQ" placeholder="🔎 Name, phone, DOB or MC number…" autocomplete="off">
      <div id="lkPicked">${picked ? pickedHTML(picked) : ''}</div><div id="lkHits"></div>`;
  };
  const pickedHTML = (c) => `<div class="ok-box small" style="margin:10px 0">📁 Working from <b>${esc(c.id)} · ${esc(c.name)}</b> — your trainer can see the file you chose. <button class="btn btn-sm" data-case-clear="1">Choose another</button></div>`;

  // Opens a case file in the CMS Training Library, signed in (a fresh Portal ticket; see src/portal.js).
  App.openCase = async function (caseId, btn) {
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Opening the CMS…'; }
    // The tab is opened first, so the browser doesn't treat it as a pop-up once the link comes back.
    const tab = window.open('', '_blank');
    try {
      const r = await API.post('/api/cms-link', { caseId });
      if (tab) tab.location = r.url; else window.open(r.url, '_blank', 'noopener');
      if (!r.authed) U.toast('The CMS will ask you to come in from the LSH Training Portal (no Portal secret is set on this site).');
    } catch (e) {
      if (tab) tab.close();
      U.toast('Couldn\'t open the case file in the CMS: ' + e.message, 'error');
    }
    if (btn) { btn.disabled = false; btn.textContent = label; }
  };

  App.bindLookup = function (root, opts) {
    const o = Array.isArray(opts) ? { hide: opts } : (opts || {});
    const hide = o.hide || [], live = !!o.live, onPick = o.onPick;
    const q = U.$('#lkQ', root), out = U.$('#lkHits', root), picked = U.$('#lkPicked', root);
    if (!q) return;
    const cases = Object.values(App.cfg.cases).filter((c) => !hide.includes(c.id));
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    q.oninput = () => {
      const v = q.value.trim(), n = norm(v);
      if (n.length < 2) { out.innerHTML = ''; return; }
      const hits = cases.filter((c) => norm(c.id + c.name + c.text).includes(n) || c.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(v.toLowerCase())));
      out.innerHTML = hits.length ? hits.map((c) => `<div class="lookup-hit" data-case="${c.id}"><b>${esc(c.id)} · ${esc(c.name)}</b> <span class="muted small">${esc(c.title)}</span></div>`).join('')
        : `<div class="empty small">No case on file matches “${esc(v)}”.</div>`;
    };
    const setPicked = (id) => {
      if (onPick) onPick(id);
      if (picked) picked.innerHTML = id && App.cfg.cases[id] ? pickedHTML(App.cfg.cases[id]) : '';
      U.$$('[data-case]', out).forEach((x) => x.classList.toggle('mine', x.dataset.case === id));
    };
    if (picked) picked.onclick = (e) => { if (e.target.closest('[data-case-clear]')) setPicked(''); };
    out.onclick = (e) => {
      const cms = e.target.closest('[data-case-open]');
      if (cms) { App.openCase(cms.dataset.caseOpen, cms); return; }
      const use = e.target.closest('[data-case-use]');
      if (use) { setPicked(use.dataset.caseUse); return; }
      const hit = e.target.closest('[data-case]'); if (!hit || hit.classList.contains('open')) return;
      const c = App.cfg.cases[hit.dataset.case];
      U.$$('.lookup-hit.open', out).forEach((x) => { x.classList.remove('open'); const pre = x.querySelector('.case-body'); if (pre) pre.remove(); });
      hit.classList.add('open');
      hit.insertAdjacentHTML('beforeend', `<div class="case-body"><div class="case-head small muted">📁 Preview · case file ${esc(c.id)}</div><pre class="case">${esc(c.text)}</pre>
        <div class="row">${live ? `<button class="btn btn-sm btn-green" data-case-use="${esc(c.id)}">✅ This is the case file</button>` : ''}
        <button class="btn btn-sm" data-case-open="${esc(c.id)}" title="Opens ${esc(c.id)} in the CMS Training Library, signed in as you">🗂 Open ${esc(c.id)} in the CMS ↗</button></div></div>`);
    };
  };

  App.directoryHTML = function (canTransfer) {
    const f = App.cfg.firm;
    return `<p class="small muted">${esc(f.name)} (fictional) · Main ${esc(f.mainLine)} · Intake ${esc(f.intakeLine)} · ${esc(f.hours)}</p>
      ${f.directory.map((d) => `<div class="dir-row"><span class="ext">${esc(d.ext)}</span><div style="flex:1"><b>${esc(d.name)}</b><div class="small muted">${esc(d.role)}</div></div>${canTransfer ? `<button class="btn btn-sm" data-act="transfer-to" data-ext="${esc(d.ext)}">↪ Transfer</button>` : ''}</div>`).join('')}`;
  };
  App.rulesHTML = function (track) {
    const t = App.cfg.tracks[track || 'reception'];
    return `<h4>Front-desk rules</h4><ol class="rules small">${App.cfg.firm.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
      ${t ? `<h4>${esc(t.label)} call reminders</h4><ul class="small">${t.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
  };

  // Pick where to transfer the caller.
  App.pickTransfer = function (cb) {
    const m = App.modal({ title: '↪ Transfer the call', body: `<p class="small muted">The caller hears hold music while the extension rings. Tell the caller before you transfer them.</p>${App.directoryHTML(true)}` });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-act="transfer-to"]'); if (!b) return; m.close(); cb(b.dataset.ext); });
  };
  App.dirEntry = (ext) => App.cfg.firm.directory.find((d) => d.ext === ext);

  // Desktop notification when a call rings and the tab isn't in front.
  App.notify = function (title, body) {
    try {
      if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
      const n = new Notification(title, { body, tag: 'mcv-call', requireInteraction: true });
      n.onclick = () => { window.focus(); n.close(); };
      App._note = n;
    } catch (e) {}
  };
  App.clearNotify = () => { try { if (App._note) App._note.close(); } catch (e) {} App._note = null; };
  let titleFlash = null;
  App.flashTitle = function (on, text) {
    clearInterval(titleFlash);
    if (!on) { document.title = 'LSH Ring Channel'; return; }
    let f = false;
    titleFlash = setInterval(() => { document.title = (f = !f) ? text : 'LSH Ring Channel'; }, 900);
  };

  // The grade: the weighted average of the scored metrics (1 to 5) and as a percentage (as src/scenarios.js weightedScore).
  App.weighted = function (track, criteria) {
    const w = ((App.cfg.settings && App.cfg.settings.weights) || {})[track] || {};
    let sum = 0, wsum = 0;
    (criteria || []).forEach((c) => {
      if (!c || !(c.score >= 1 && c.score <= 5)) return;
      const k = Number(w[c.name]); const wt = Number.isFinite(k) && k >= 0 ? k : 1;
      sum += c.score * wt; wsum += wt;
    });
    if (!wsum) return null;
    const avg = sum / wsum;
    return { avg: Math.round(avg * 100) / 100, pct: Math.round(avg * 20) };
  };

  // 🎚 The voice an AI caller speaks with: "to suit the caller" picks one from the caller's gender.
  App.voiceOptions = function (picked) {
    return `<option value="">🎚 Voice: to suit the caller</option>${(App.cfg.voices || []).map((v) => `<option value="${esc(v.id)}" ${v.id === picked ? 'selected' : ''}>🎚 ${esc(v.label)} · ${esc(v.desc)} (${v.gender === 'm' ? 'male' : 'female'})</option>`).join('')}`;
  };

  App.levelBadge = (l) => `<span class="badge lvl-${esc(l)}">${esc(l)}</span>`;
  App.trackBadge = (t) => { const x = App.cfg.tracks[t]; return x ? `<span class="badge ${t === 'intake' ? 'violet' : t === 'calendar' ? 'blue' : 'orange'}">${x.icon} ${esc(x.label)}</span>` : ''; };
})();
