/* =========================================================
   💬 Client Messaging and 💬 Automated Messaging: the texting simulators
   ---------------------------------------------------------
   The Portal's 💬 messaging simulator, on the training phone. The firm's
   automation texts a client (an appointment reminder, the intake
   auto-responder, a records chaser, a settlement-check notice), the
   client texts back, and the trainee answers the thread. The automation
   keeps sending on its own schedule whether or not the trainee has
   replied, so a thread is already moving when they pick it up: the page
   asks the Worker for what has landed every few seconds (/api/msg/poll),
   and the client's own replies come from the AI (/api/msg/send).
   Ending the thread scores it on the Client Messaging Metrics, and a
   graded thread counts in the trainee's course on the Portal exactly as
   the CMS's Client Messaging conversations do (src/messaging.js).

   Two simulators, one engine and one page. 💬 Client Messaging is the
   thread a client (or someone saying they are one) starts on the firm's
   number, answered from the file in the trainee's program's role —
   the Portal's 💬 Client Messaging card opens it (?messages=1&program=
   <reception|intake|cm|md|pd|ea>), and a graded thread counts on the
   course's Client Messaging line. 💬 Automated Messaging is the one the
   firm's automation starts, on its own line. KIND says which is open.

   Two pages, one view (App.views.clientmessaging and App.views.messaging,
   the two messaging tabs of 🗂 Call Logs & Scenario Picker):
     the picker     the threads to take, and the trainee's own recent ones
     the thread     the conversation, 🔎 Case lookup, 📘 Policy, the scorecard
   A trainer sees every trainee's threads instead, and can open one.
   ========================================================= */
(function () {
  'use strict';
  const { esc } = U;

  // The thread the trainee is on, kept here the way the phone keeps its call (App.p).
  let M = null;
  let timer = null;
  // Which simulator the page is open on: 'client' (a client texts in) or 'auto' (the automation does).
  let KIND = 'client';
  const CLIENT = () => KIND === 'client';
  const SIM = () => CLIENT()
    ? { icon: '💬', name: 'Client Messaging', line: cfg().clientLine || 'Client Messaging' }
    : { icon: '🤖', name: 'Automated Messaging', line: cfg().line || 'Automated Messaging' };

  const cfg = () => (App.cfg && App.cfg.messaging) || { threads: [], rubric: [], rules: [], sheet: 'Client Messaging Metrics' };
  const threadOf = (id) => cfg().threads.find((t) => t.id === id) || null;
  const kindOf = (t) => (t && t.kind === 'client' ? 'client' : 'auto');
  // The threads this tab shows: its own simulator's, and a link's program tab first where it names one.
  function threads() {
    const list = cfg().threads.filter((t) => kindOf(t) === KIND);
    const role = CLIENT() ? ((App.msgLink || {}).role || '') : '';
    if (!role) return list;
    const mine = list.filter((t) => t.role === role);
    return mine.length ? mine.concat(list.filter((t) => t.role !== role)) : list;
  }
  const WHO = { auto: '🤖 Automated message', contact: 'Client', trainee: 'You' };

  function stopPolling() { if (timer) { clearInterval(timer); timer = null; } }
  // While a thread is live the page keeps asking what the automation has sent since it last looked.
  function startPolling() {
    stopPolling();
    timer = setInterval(async () => {
      if (!M || M.status !== 'live' || M.busy) return;
      try { const r = await API.post('/api/msg/poll', { id: M.id }); take(r.msg); } catch (e) { /* the next tick tries again */ }
    }, 4000);
  }

  /* What came back from the Worker becomes the thread this page is showing. The page is redrawn only
     when something on it changed — a message landed, the thread closed, the scorecard arrived — so a
     reply being typed isn't interrupted every few seconds. */
  const sig = (m) => m ? [(m.turns || []).length, m.status, m.score, (m.grading || {}).state, m.grade ? 1 : 0].join('|') : '';
  function take(msg) {
    if (!msg || (M && msg.id !== M.id)) return;
    const was = sig(M);
    M = Object.assign({}, M || {}, msg);
    // The scorecard is what the trainee came back for: it opens on it when it arrives.
    if (M.grade && M.tab === 'chat') M.tab = 'grade';
    if (sig(M) !== was) render();
    else paint();
    if (M.status !== 'live') stopPolling();
  }

  /* ---------- the picker ---------- */
  function pickerHTML(mine) {
    const t = threads();
    const labels = cfg().roleLabels || {};
    const prog = (x) => {
      const tag = CLIENT() ? labels[x.role] || '' : x.program || '';
      return tag ? `<span class="badge">${esc(tag)}</span>` : '';
    };
    const intro = CLIENT()
      ? 'A client texts the firm on their own file and you answer it in your program\'s role. Verify before you share, follow the firm\'s texting policy, keep advice and figures off text, and leave the client with a clear next step — then say what goes on the file as a Case Note.'
      : 'The firm\'s automation texts a client and the client texts back. Answer the thread the way the firm\'s texting policy says to: verify before you share, keep advice and figures off text, and leave the client with a clear next step. The automation keeps sending while you work, so read what has already landed.';
    return `<h2>${SIM().icon} ${esc(SIM().name)}</h2>
      <p class="muted">${esc(intro)}</p>
      ${App.cfg.features && App.cfg.features.ai ? '' : '<div class="warn-box">The AI isn\'t set up on this site yet, so a thread can\'t be answered or scored here. Ask your administrator to add a Gemini key.</div>'}
      <div class="scen-grid">${t.map((x) => `<div class="scen" style="cursor:default">
        <h4>${esc(x.title)}</h4>
        <div class="meta"><span class="badge lvl-${esc(x.level === 'Core' ? 'Intermediate' : x.level)}">${esc(x.level)}</span>${prog(x)}</div>
        <p>${esc(x.you)}</p>
        <div class="small">${esc(x.facts)}</div>
        <div class="row" style="margin-top:4px">
          <button class="btn btn-primary btn-sm" data-start="${esc(x.id)}">Practice this thread</button>
          <button class="btn btn-orange btn-sm" data-start="${esc(x.id)}" data-graded="1" title="Scored on the ${esc(cfg().sheet)}; it counts in your course on the Portal">Take it graded</button>
        </div></div>`).join('') || `<div class="empty">No ${esc(SIM().name)} threads on this site yet.</div>`}</div>
      <h3 style="margin-top:22px">My recent threads</h3>
      <div id="msgMine">${mine ? mineHTML(mine) : '<div class="small muted">Loading…</div>'}</div>`;
  }
  function mineHTML(list) {
    if (!list.length) return '<div class="small muted">No threads yet.</div>';
    return `<table class="list">${list.map((m) => `<tr class="click" data-open="${esc(m.id)}">
      <td>${U.when(m.createdAt)}</td><td><b>${esc(m.title)}</b></td>
      <td>${m.graded ? '<span class="badge orange">Graded</span>' : '<span class="badge">Practice</span>'}</td>
      <td>${m.status === 'live' ? '<span class="badge amber">Open</span>' : m.score != null ? `<b>${m.score}%</b>` : m.grading && m.grading.state === 'grading' ? '<span class="badge">Scoring…</span>' : '<span class="badge">Ended</span>'}</td></tr>`).join('')}</table>`;
  }

  /* ---------- a trainer's list ---------- */
  function trainerHTML(list) {
    return `<h2>${SIM().icon} ${esc(SIM().name)} threads</h2>
      <p class="muted">Every trainee's threads on this texting simulator, newest first. A graded thread is scored on the ${esc(cfg().sheet)} when it ends and counts in the trainee's course on the Portal, on the ${esc(SIM().line)} line.</p>
      ${list.length ? `<table class="list"><tr><th>When</th><th>Trainee</th><th>Thread</th><th></th><th>Score</th></tr>
        ${list.map((m) => `<tr class="click" data-open="${esc(m.id)}"><td>${U.when(m.createdAt)}</td><td><b>${esc(m.traineeName)}</b>${m.batch ? `<div class="small muted">${esc(m.batch)}</div>` : ''}</td>
          <td>${esc(m.title)}</td><td>${m.graded ? '<span class="badge orange">Graded</span>' : '<span class="badge">Practice</span>'}</td>
          <td>${m.score != null ? `<b>${m.score}%</b>` : m.status === 'live' ? '<span class="badge amber">Open</span>' : '<span class="badge">—</span>'}</td></tr>`).join('')}</table>`
        : `<div class="empty">No threads yet. Trainees take them on ${SIM().icon} ${esc(SIM().name)}.</div>`}`;
  }

  /* ---------- the thread ---------- */
  function bubblesHTML(m) {
    const turns = m.turns || [];
    if (!turns.length) return `<div class="empty small">${CLIENT() ? 'Waiting for the client\u2019s first message…' : 'Waiting for the automation…'}</div>`;
    return turns.map((x) => `<div class="tl ${x.who === 'trainee' ? 'trainee' : 'caller'}${x.who === 'auto' ? ' auto' : ''}">
      <b>${esc(WHO[x.who] || 'Client')}${x.at ? ' · ' + U.when(x.at) : ''}</b>${esc(x.text)}</div>`).join('');
  }

  function headHTML(m) {
    const t = m.thread || {};
    const ended = m.status !== 'live';
    if (!ended) {
      return `<div class="note-box" style="margin-bottom:14px">${SIM().icon} <b>${esc(t.title || m.title)}</b>${m.graded ? ' <span class="badge orange">Graded</span>' : ''}
        <div class="small" style="margin-top:4px">${esc(t.you || '')}</div>
        ${t.facts ? `<div class="small muted" style="margin-top:4px">${esc(t.facts)}</div>` : ''}</div>`;
    }
    if (m.grading && m.grading.state === 'grading') return `<div class="note-box" style="margin-bottom:14px">⏳ The AI is scoring this thread on the ${esc(cfg().sheet)}…</div>`;
    if (m.grading && (m.grading.state === 'failed' || m.grading.state === 'off')) {
      return `<div class="err-box" style="margin-bottom:14px">The AI couldn't score this thread: ${esc(m.grading.error || 'it didn\'t answer')} <button class="btn btn-sm" data-act="regrade">Try again</button></div>`;
    }
    const g = m.grade;
    if (!g) return `<div class="warn-box" style="margin-bottom:14px">This thread is closed.</div>`;
    return `<div class="card" style="margin-bottom:14px;border-color:#fed7aa">
      <div class="row"><div class="score-big">${m.score != null ? m.score + '%' : '–'}</div>
        <div style="flex:1"><div class="verdict">${esc(g.verdict)}${g.avg != null ? ` <span class="badge">Average ${g.avg} / 5</span>` : ''}</div>
        <div class="small">${esc(g.summary)}</div></div></div>
      ${m.graded && m.reported && !m.reported.ok ? `<div class="small muted" style="margin-top:8px">This score is kept here; it hasn't reached the Portal yet${m.reported.error ? ` (${esc(m.reported.error)})` : ''}.</div>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn" data-act="another">Take another thread</button></div></div>`;
  }

  function gradePaneHTML(m) {
    const g = m.grade;
    if (!g) return '<p class="small muted">The scorecard appears here once the thread has been scored.</p>';
    const met = { yes: '✅', partly: '◐', no: '✖', 'n/a': '—' };
    return `<h4>${esc(cfg().sheet)}</h4>
      <table class="list">${(g.criteria || []).map((c) => `<tr><td style="width:34%"><b>${esc(c.name)}</b></td>
        <td style="width:46px">${c.score ? `<b>${c.score}/5</b>` : '<span class="muted">—</span>'}</td>
        <td class="small">${esc(c.evaluation)}</td></tr>`).join('')}</table>
      ${(g.goals || []).length ? `<h4 style="margin-top:14px">What this thread should have achieved</h4>
        <ul class="small" style="padding-left:18px">${g.goals.map((x) => `<li>${met[x.met] || '—'} ${esc(x.goal)}${x.evidence ? ` <span class="muted">— ${esc(x.evidence)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${(g.tips || []).length ? `<h4 style="margin-top:14px">Next time</h4><ul class="small" style="padding-left:18px">${g.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
  }

  function policyHTML() {
    return `<h4>The firm's texting policy</h4><ol class="rules small">${(cfg().rules || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
      <h4 style="margin-top:14px">How this thread is scored (${esc(cfg().sheet)})</h4>
      <ul class="small" style="padding-left:18px">${(cfg().rubric || []).map((r) => `<li><b>${esc(r.name)}</b> — ${esc(r.desc)}</li>`).join('')}</ul>`;
  }

  function render() {
    const el = App.host();
    if (!el) return;
    if (!M) return;
    const m = M, ended = m.status !== 'live';
    const tabs = [['chat', '💬 Thread'], ['lookup', '🔎 Case lookup'], ['dir', '📇 Directory'], ['policy', '📘 Policy']];
    if (ended) tabs.splice(1, 0, ['grade', '📋 Scorecard']);
    const first = m.tab && tabs.some(([k]) => k === m.tab) ? m.tab : ended ? 'grade' : 'chat';
    const t = m.thread || {};
    const pane = (k) => `pane${k === first ? ' on' : ''}`;
    el.innerHTML = `${headHTML(m)}
      <div class="work-tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === first ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="${pane('chat')}" data-pane="chat">
        <p class="small muted">${esc(t.contact ? `${t.contact.name}${t.contact.role ? ' · ' + t.contact.role : ''} · ${t.contact.number}` : 'The client')}${CLIENT() ? '' : ' — 🤖 messages are the firm\'s automation, not the client.'}</p>
        <div class="transcript" id="msgLines">${bubblesHTML(m)}</div>
        ${ended ? '' : `<div class="row" style="margin-top:10px">
          <input class="input" id="msgIn" placeholder="Type your reply…" style="flex:1" autocomplete="off">
          <button class="btn btn-primary" data-act="send">Send</button>
          <button class="btn" data-act="end" title="Close the thread and have it scored">Close &amp; score</button>
        </div><div class="small muted" id="msgBusy" style="margin-top:6px"></div>`}
      </div>
      ${ended ? `<div class="${pane('grade')}" data-pane="grade">${gradePaneHTML(m)}</div>` : ''}
      <div class="${pane('lookup')}" data-pane="lookup">${App.lookupHTML({ caseId: m.caseId || '' })}</div>
      <div class="${pane('dir')}" data-pane="dir">${App.directoryHTML(false)}</div>
      <div class="${pane('policy')}" data-pane="policy">${policyHTML()}</div>`;
    App.bindLookup(el, { hide: [], live: !ended, onPick: (id) => { M.caseId = id; } });
    const box = U.$('#msgLines', el); if (box) box.scrollTop = box.scrollHeight;
    const input = U.$('#msgIn', el); if (input && !ended) input.focus();
    paint();
  }
  // The parts that change without redrawing the page: whether the client is typing.
  function paint() {
    const b = U.$('#msgBusy');
    if (b) b.textContent = M && M.busy ? 'The client is typing…' : '';
  }

  /* ---------- what the page does ---------- */
  async function startThread(threadId, graded) {
    try {
      const link = App.msgLink || {};
      const program = CLIENT() ? link.role || (threadOf(threadId) || {}).role || '' : link.program || '';
      const r = await API.post('/api/msg/start', { threadId, program, graded: !!graded });
      M = r.msg; M.tab = 'chat';
      location.hash = CLIENT() ? '#/logs/clientmessaging' : '#/logs/messaging';
      render(); startPolling();
    } catch (e) { U.toast(e.message, 'error'); }
  }
  async function openThread(id) {
    try { const r = await API.post('/api/msg/get', { id }); M = r.msg; render(); if (M.status === 'live') startPolling(); }
    catch (e) { U.toast(e.message, 'error'); }
  }
  async function send() {
    const input = U.$('#msgIn');
    const text = input ? input.value.trim() : '';
    if (!M || M.status !== 'live' || !text || M.busy) return;
    if (input) input.value = '';
    M.busy = true; paint();
    try {
      const r = await API.post('/api/msg/send', { id: M.id, text });
      M.busy = false; take(r.msg);
    } catch (e) {
      M.busy = false; paint();
      U.toast(e.message, 'error');
      try { const r = await API.post('/api/msg/poll', { id: M.id }); take(r.msg); } catch (x) { /* shown already */ }
    }
  }
  async function end() {
    if (!M || M.status !== 'live') return;
    const sent = (M.turns || []).filter((x) => x.who === 'trainee').length;
    if (!sent && !confirm('Close this thread without replying to the client? It will be scored as it stands.')) return;
    stopPolling();
    M.status = 'ended'; M.grading = { state: 'grading' }; render();
    try { const r = await API.post('/api/msg/end', { id: M.id }); take(r.msg); }
    catch (e) { M.grading = { state: 'failed', error: e.message }; render(); }
  }
  async function regrade() {
    if (!M) return;
    M.grading = { state: 'grading' }; render();
    try { const r = await API.post('/api/msg/grade', { id: M.id }); take(r.msg); }
    catch (e) { M.grading = { state: 'failed', error: e.message }; render(); }
  }

  async function picker() {
    const el = App.host();
    if (App.trainer()) {
      el.innerHTML = '<div class="empty">Loading…</div>';
      try { const r = await API.post('/api/msg/list', { limit: 60 }); el.innerHTML = trainerHTML(r.threads); }
      catch (e) { el.innerHTML = `<div class="err-box">${esc(e.message)}</div>`; }
      return;
    }
    el.innerHTML = pickerHTML(null);
    try { const r = await API.post('/api/msg/list', { limit: 10 }); const box = U.$('#msgMine'); if (box) box.innerHTML = mineHTML(r.threads); }
    catch (e) { const box = U.$('#msgMine'); if (box) box.innerHTML = `<div class="small muted">${esc(e.message)}</div>`; }
  }

  async function open(kind) {
    // The page is one simulator at a time: switching tabs leaves the other one's thread on the server.
    if (kind !== KIND) { stopPolling(); M = null; KIND = kind; }
    /* A Portal link may ask for one thread (?messages=1&thread=…&mode=graded, or ?messaging=1 for the
       automation's): it opens straight away, once, the way a Call Simulator link rings a graded call
       at once (app.js). */
    const link = App.msgLink || {};
    if (link.thread && !link.used) {
      const t = threadOf(link.thread);
      if (t && kindOf(t) === KIND && !App.trainer()) { link.used = true; return startThread(t.id, link.graded); }
    }
    /* Leaving the page stops the asking; the thread stays open on the server and the tab picks it
       back up (App.leave is the router's own cleanup hook). */
    App.leave = stopPolling;
    if (M && M.status === 'live') { render(); startPolling(); return; }
    stopPolling();
    M = null;
    return picker();
  }
  App.register('clientmessaging', { render: () => open('client') });
  App.register('messaging', { render: () => open('auto') });

  document.addEventListener('click', (e) => {
    if (!App.at('messaging') && !App.at('clientmessaging')) return;
    const start = e.target.closest('[data-start]');
    if (start) return startThread(start.dataset.start, start.dataset.graded === '1');
    const open = e.target.closest('[data-open]');
    if (open) return openThread(open.dataset.open);
    const tab = e.target.closest('.work-tabs [data-tab]');
    if (tab && M) { M.tab = tab.dataset.tab; return render(); }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'send') return send();
    if (act.dataset.act === 'end') return end();
    if (act.dataset.act === 'regrade') return regrade();
    if (act.dataset.act === 'another') { M = null; return picker(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || (!App.at('messaging') && !App.at('clientmessaging'))) return;
    if (e.target && e.target.id === 'msgIn') { e.preventDefault(); send(); }
  });
})();
