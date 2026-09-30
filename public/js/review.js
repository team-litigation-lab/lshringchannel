/* =========================================================
   🗂 Calls and reviews, 📚 Scenarios, 👥 Trainees, ⚙️ Setup
   A call's page: what happened (answer time, holds, transfers), the
   recording, the trainee's note, the transcript, and the scorecard.
   Trainers score live calls (optionally from an AI draft of the
   recording) and send the review; trainees read it. Practice calls
   are scored by the AI when the trainee submits the note.
   ========================================================= */
(function () {
  'use strict';
  const { esc } = U;
  const VERDICTS = ['Very strong performance.', 'Good.', 'Good, with Improvements Needed.', 'Satisfactory.', 'Needs Improvement.', 'Needs Significant Improvement.', 'Significant Improvement Required.'];

  App.reloadConfig = async function () {
    App.cfg = await API.post('/api/config');
    App.scen = Object.fromEntries(App.cfg.scenarios.map((s) => [s.id, s]));
  };

  const statusBadge = (c) => {
    if (c.status === 'missed') return '<span class="badge red">Missed</span>';
    if (c.status === 'declined') return '<span class="badge red">Declined</span>';
    if (c.status === 'cancelled') return '<span class="badge">Cancelled</span>';
    if (c.status === 'live' || c.status === 'ringing') return '<span class="badge green">In progress</span>';
    if (c.reviewed) return `<span class="badge green">Reviewed</span>`;
    if (c.mode === 'ai') return c.ai ? '<span class="badge blue">AI scored</span>' : '<span class="badge">Not scored</span>';
    return c.noteSubmitted || c.noteSubmittedAt ? '<span class="badge amber">Needs review</span>' : '<span class="badge amber">Note not submitted</span>';
  };

  /* ---------------- 🗂 the call log ---------------- */
  const F = { traineeId: '', batch: '', mode: '', needsReview: false };
  App.register('calls', {
    async render() {
      const app = U.$('#app');
      const tr = App.trainer();
      app.innerHTML = `<div class="card"><div class="card-head"><h2>${tr ? '🗂 Call log' : '🗂 My calls'}</h2><span class="spacer"></span>
        ${tr ? `<select class="input" id="fBatch" style="width:auto"><option value="">All batches</option></select>
          <select class="input" id="fTrainee" style="width:auto"><option value="">All trainees</option></select>
          <select class="input" id="fMode" style="width:auto"><option value="">Live and practice</option><option value="live" ${F.mode === 'live' ? 'selected' : ''}>Live calls</option><option value="ai" ${F.mode === 'ai' ? 'selected' : ''}>AI practice</option></select>
          <label class="check small"><input type="checkbox" id="fNeeds" ${F.needsReview ? 'checked' : ''}> Needs review</label>` : ''}</div>
        <div class="table-wrap" id="callList"><div class="empty">Loading…</div></div></div>`;
      if (tr) {
        try {
          const ts = (await API.post('/api/trainees')).trainees;
          const batches = [...new Set(ts.map((x) => x.batch).filter(Boolean))].sort();
          U.$('#fBatch').innerHTML = `<option value="">All batches</option>` + batches.map((b) => `<option ${b === F.batch ? 'selected' : ''}>${esc(b)}</option>`).join('');
          U.$('#fTrainee').innerHTML = `<option value="">All trainees</option>` + ts.filter((x) => !F.batch || x.batch === F.batch).map((x) => `<option value="${esc(x.id)}" ${x.id === F.traineeId ? 'selected' : ''}>${esc(x.name)} (${esc(x.batch)})</option>`).join('');
        } catch (e) {}
        app.onchange = (e) => {
          if (e.target.id === 'fBatch') { F.batch = e.target.value; F.traineeId = ''; App.views.calls.render(); }
          if (e.target.id === 'fTrainee') { F.traineeId = e.target.value; load(); }
          if (e.target.id === 'fMode') { F.mode = e.target.value; load(); }
          if (e.target.id === 'fNeeds') { F.needsReview = e.target.checked; load(); }
        };
      }
      load();
      async function load() {
        const el = U.$('#callList');
        try {
          const r = await API.post('/api/calls', tr ? { traineeId: F.traineeId, batch: F.batch, mode: F.mode, needsReview: F.needsReview, limit: 200 } : { limit: 200 });
          if (!tr) { App.unread = r.calls.some((c) => c.reviewed && !c.reviewSeen); App.header(); }
          el.innerHTML = r.calls.length ? `<table class="list"><thead><tr><th>When</th>${tr ? '<th>Trainee</th>' : ''}<th>Call</th><th>Type</th><th>Answered</th><th>Length</th><th>Score</th><th>Status</th></tr></thead><tbody>
            ${r.calls.map((c) => `<tr class="click" data-open="${esc(c.id)}"><td>${U.when(c.createdAt)}</td>${tr ? `<td><b>${esc(c.traineeName)}</b><div class="tiny muted">${esc(c.batch)}</div></td>` : ''}
              <td><b>${esc(c.title)}</b><div>${App.trackBadge(c.track)}</div></td>
              <td>${c.mode === 'ai' ? '<span class="badge">🎧 AI practice</span>' : `<span class="badge orange">📞 Live${c.trainer ? ' · ' + esc(c.trainer) : ''}</span>`}</td>
              <td>${c.ringMs != null ? `${U.rings(c.ringMs)} ring${U.rings(c.ringMs) > 1 ? 's' : ''}` : '–'}</td>
              <td>${c.talkMs ? U.dur(c.talkMs) : '–'}${c.recording ? ' 🎙' : ''}</td>
              <td>${c.score != null ? `<b>${c.score}%</b>` : '–'}</td><td>${statusBadge(c)}${!tr && c.reviewed && !c.reviewSeen ? ' <span class="badge orange">New</span>' : ''}</td></tr>`).join('')}</tbody></table>`
            : `<div class="empty">${tr ? 'No calls match.' : 'No calls yet. Keep <a href="#/phone">📞 My phone</a> open for live calls, or <a href="#/practice">practice with an AI caller</a>.'}</div>`;
          el.onclick = (e) => { const row = e.target.closest('[data-open]'); if (row) location.hash = '#/call/' + row.dataset.open; };
        } catch (e) { el.innerHTML = `<div class="err-box">${esc(e.message)}</div>`; }
      }
    }
  });

  /* ---------------- a call: review and scorecard ---------------- */
  App.register('call', {
    async render(id) {
      const app = U.$('#app');
      app.innerHTML = '<div class="empty">Loading the call…</div>';
      let c;
      try { c = (await API.post('/api/call', { id })).call; } catch (e) { app.innerHTML = `<div class="card err-box">${esc(e.message)}</div>`; return; }
      draw(c);
      if (!App.trainer() && c.review && !c.review.seenAt) API.post('/api/call/update', { id: c.id, seen: true }).then(() => { App.unread = false; App.header(); }).catch(() => {});
    }
  });

  function statsHTML(c) {
    const m = c.metrics || {};
    const out = [];
    if (m.ringMs != null) { const r = U.rings(m.ringMs); out.push(`<div class="stat ${r <= 3 ? 'good' : 'bad'}"><div class="v">${r} ring${r > 1 ? 's' : ''}</div><div class="k">Answered in ${Math.round(m.ringMs / 1000)} s ${r <= 3 ? '✓' : '(over 3)'}</div></div>`); }
    if (m.talkMs != null) out.push(`<div class="stat"><div class="v">${U.dur(m.talkMs)}</div><div class="k">Call length</div></div>`);
    const holds = m.holds || [];
    const longest = holds.reduce((a, h) => Math.max(a, (h.end || h.start) - h.start), 0);
    out.push(`<div class="stat ${longest > 60000 ? 'bad' : ''}"><div class="v">${holds.length}</div><div class="k">Hold${holds.length === 1 ? '' : 's'}${holds.length ? ' · longest ' + U.dur(longest) : ''}</div></div>`);
    const tx = m.transfers || [];
    out.push(`<div class="stat"><div class="v">${tx.length}</div><div class="k">Transfer${tx.length === 1 ? '' : 's'}${tx.length ? ': ' + tx.map((x) => `${esc(x.ext)} ${x.result === 'connected' ? '✓' : x.result === 'voicemail' ? '(voicemail)' : '(no answer)'}`).join(', ') : ''}</div></div>`);
    if (m.endedBy) out.push(`<div class="stat"><div class="v" style="font-size:15px">${m.endReason === 'transferred' ? 'Transferred' : m.endReason === 'disconnected' ? 'Dropped' : esc(m.endedBy === 'trainer' || m.endedBy === 'caller' ? 'Caller' : 'Trainee')}</div><div class="k">Ended the call</div></div>`);
    return `<div class="stats">${out.join('')}</div>`;
  }

  // A WebM from MediaRecorder reports an endless duration: jump to the end once so the player learns it, then play.
  function playable(a) {
    a.addEventListener('loadedmetadata', () => {
      if (a.duration !== Infinity && !isNaN(a.duration)) { a.play().catch(() => {}); return; }
      const back = () => { a.removeEventListener('timeupdate', back); a.currentTime = 0; a.play().catch(() => {}); };
      a.addEventListener('timeupdate', back);
      a.currentTime = 1e101;
    }, { once: true });
  }

  function noteView(c, editable) {
    const form = App.formFor(c.track);
    if (editable) return `<div id="noteEdit">${App.noteFormHTML(c.track, c.note, false)}<button class="btn btn-orange" data-act="submitnote">Submit my note</button></div>`;
    const n = c.note || {};
    return `<div class="live-note">${form.fields.map((f) => `<div class="ln"><b>${esc(f.label)}</b><span ${n[f.k] ? '' : 'class="muted"'}>${n[f.k] ? esc(n[f.k]) : '(blank)'}</span></div>`).join('')}</div>`;
  }

  function scorecardView(g, title, score) {
    if (!g) return '';
    const crit = (g.criteria || []).map((x) => `<div class="crit"><div class="crit-head"><b>${esc(x.name)}</b><span class="dots ro">${[1, 2, 3, 4, 5].map((i) => `<span class="${x.score >= i ? 'on' : ''}"></span>`).join('')}</span><b class="mono">${x.score || '–'}/5</b></div>${x.evaluation ? `<p class="small" style="margin:8px 0 0">${esc(x.evaluation)}</p>` : ''}</div>`).join('');
    const goals = (g.goals || []).map((x) => `<div class="gm"><span class="mk">${x.met === 'yes' ? '✅' : x.met === 'partly' ? '🟡' : x.met === 'n/a' ? '➖' : '❌'}</span><div><div>${esc(x.goal)}</div>${x.evidence ? `<div class="small muted">${esc(x.evidence)}</div>` : ''}</div></div>`).join('');
    return `<div class="card"><div class="card-head"><h3>${title}</h3><span class="spacer"></span>${score != null ? `<span class="score-big" style="font-size:28px">${score}%</span>` : ''}</div>
      ${g.verdict ? `<p class="verdict">${esc(g.verdict)}</p>` : ''}${g.summary ? `<p>${esc(g.summary)}</p>` : ''}
      ${crit}${goals ? `<h4 style="margin-top:14px">The goals</h4>${goals}` : ''}
      ${g.note ? `<h4 style="margin-top:14px">The note</h4><p class="small">${esc(g.note)}</p>` : ''}
      ${(g.tips || []).length ? `<h4 style="margin-top:14px">Next time</h4><ul class="small">${g.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
  }

  function transcriptView(tr) {
    if (!tr || !tr.length) return '';
    return `<div class="card"><div class="card-head"><h3>💬 Transcript</h3></div><div class="transcript" style="max-height:480px">${tr.map((l) => `<div class="tl ${l.who}"><b>${l.who === 'caller' ? 'Caller' : 'Trainee'}</b>${esc(l.text)}</div>`).join('')}</div></div>`;
  }

  function draw(c) {
    const app = U.$('#app');
    const tr = App.trainer();
    const s = c.scenario || {};
    const ended = !['live', 'ringing'].includes(c.status);
    const editableNote = !tr && ended && c.status === 'ended' && !c.noteSubmittedAt;
    const onFile = s.caseId && !(s.hideCases || []).includes(s.caseId) ? App.cfg.cases[s.caseId] : null;
    const ref = s.reference && App.cfg.cases[s.reference];
    app.innerHTML = `
      <div class="row" style="margin-bottom:12px"><a href="#/calls" class="btn btn-sm">← ${tr ? 'Call log' : 'My calls'}</a><span class="spacer"></span>${tr ? `<button class="btn btn-sm" data-act="delete">🗑 Delete call</button>` : ''}</div>
      <div class="card">
        <div class="row">${App.trackBadge(c.track)}${s.level ? App.levelBadge(s.level) : ''}${c.mode === 'ai' ? '<span class="badge">🎧 AI practice</span>' : `<span class="badge orange">📞 Live with ${esc(c.trainer || 'trainer')}</span>`}${statusBadge(c)}</div>
        <h1 style="margin-top:10px">${esc(c.title)}</h1>
        <p class="muted">${esc(c.traineeName)}${c.batch ? ' · ' + esc(c.batch) : ''} · ${U.when(c.createdAt)}${s.caller && s.caller.name ? ` · Caller: ${esc(s.caller.name)}${s.caller.role ? ' (' + esc(s.caller.role) + ')' : ''}` : ''}</p>
        ${c.status === 'ended' ? statsHTML(c) : `<div class="warn-box">This call ${c.status === 'missed' ? 'rang out: nobody answered' : c.status === 'declined' ? 'was declined' : c.status === 'cancelled' ? 'was cancelled before it was answered' : 'is still in progress'}.</div>`}
        ${c.recording ? `<div id="recBox" style="margin-top:12px"><button class="btn btn-sm" data-act="loadrec">▶ Play the recording (${U.dur(c.recording.durMs || 0)})</button> <span class="tiny muted">Kept until ${new Date(c.recording.expires || Date.now()).toLocaleDateString()}</span></div>` : ''}
      </div>
      <div class="grid2" style="margin-top:16px">
        <div>
          <div class="card"><div class="card-head"><h3>📝 ${esc(App.formFor(c.track).title)}</h3><span class="spacer"></span>${c.noteSubmittedAt ? `<span class="badge green">Submitted ${U.when(c.noteSubmittedAt)}</span>` : '<span class="badge amber">Not submitted</span>'}</div>${noteView(c, editableNote)}</div>
          ${transcriptView(c.transcript)}
          ${ended && s.goals && !tr ? '' : ''}
          ${onFile ? `<div class="card"><details><summary style="cursor:pointer"><b>📁 The case file (${esc(onFile.id)})</b></summary><pre class="case">${esc(onFile.text)}</pre></details></div>` : ''}
          ${ref && ended ? `<div class="card"><details><summary style="cursor:pointer"><b>✅ How the finished file looks (${esc(ref.id)})</b></summary><p class="small muted" style="margin-top:8px">What a complete intake captures, for comparing with the note.</p><pre class="case">${esc(ref.text)}</pre><a class="small" target="_blank" rel="noopener" href="${App.cfg.cms}?program=intake&mock=${ref.id}&from=standard">Open ${ref.id} in the CMS ↗</a></details></div>` : ''}
          ${tr ? `<div class="card"><details><summary style="cursor:pointer"><b>🎭 The caller's script</b></summary><div class="opening">${esc(s.opening || '')}</div><div class="persona">${esc(s.hidden || '')}</div><p class="small" style="margin-top:8px">${esc(s.facts || '')}</p></details></div>` : ''}
        </div>
        <div id="scorecol"></div>
      </div>`;
    drawScore(c);
    app.onclick = async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'loadrec') {
        b.disabled = true; b.textContent = 'Loading…';
        try { const blob = await API.getBlob('/api/recording/get', { id: c.id }); U.$('#recBox').innerHTML = `<audio class="rec" controls src="${URL.createObjectURL(blob)}"></audio>`; playable(U.$('#recBox audio')); }
        catch (err) { U.$('#recBox').innerHTML = `<span class="small err-box">${esc(err.message)}</span>`; }
      } else if (act === 'submitnote') {
        const note = App.readNote(U.$('#noteEdit'));
        try { const r = await API.post('/api/call/update', { id: c.id, note, submit: true }); U.toast('Note submitted.', 'ok'); c = r.call; if (c.mode === 'ai') { draw(c); gradeNow(c); } else draw(c); }
        catch (err) { U.toast(err.message, 'error'); }
      } else if (act === 'delete') {
        if (!confirm('Delete this call and its recording? This can\'t be undone.')) return;
        try { await API.post('/api/call/delete', { id: c.id }); U.toast('Deleted.'); location.hash = '#/calls'; } catch (err) { U.toast(err.message, 'error'); }
      } else if (act === 'grade') gradeNow(c);
    };
    async function gradeNow(call) {
      const col = U.$('#scorecol'); col.innerHTML = '<div class="card note-box">⏳ The AI is scoring the call…</div>';
      try { const r = await API.post('/api/ai/grade', { id: call.id }); c = r.call; drawScore(c); } catch (err) { col.innerHTML = `<div class="card err-box">${esc(err.message)} <button class="btn btn-sm" data-act="grade">Try again</button></div>`; }
    }
  }

  function drawScore(c) {
    const col = U.$('#scorecol'); if (!col) return;
    const tr = App.trainer();
    if (c.status !== 'ended') { col.innerHTML = ''; return; }
    if (!tr) {
      let html = '';
      if (c.review) html += scorecardView(c.review, `🎓 Your trainer's review${c.review.by ? ' · ' + esc(c.review.by) : ''}`, c.score);
      if (c.ai) html += scorecardView(c.ai, c.review ? '🤖 The AI\'s scoring' : '🤖 AI scorecard', c.review ? null : c.score);
      if (!html) html = c.mode === 'ai'
        ? (c.noteSubmittedAt ? `<div class="card note-box">Not scored yet. ${App.cfg.features.ai ? '<button class="btn btn-sm" data-act="grade">🤖 Score it now</button>' : ''}</div>` : '<div class="card note-box">Submit your note to get this call scored.</div>')
        : `<div class="card note-box">⏳ Waiting for your trainer's review.${c.noteSubmittedAt ? '' : ' Submit your note first.'}</div>`;
      if (c.scenario && c.scenario.goals && !c.review && !c.ai) html += `<div class="card"><h3>What a good call does</h3><ul class="small">${c.scenario.goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>`;
      col.innerHTML = html;
      return;
    }
    // Trainer: the scorecard editor.
    const t = App.cfg.tracks[c.track] || App.cfg.tracks.reception;
    // The form starts from: the AI draft when asked for, else the unsent draft, the sent review, the AI's draft or scoring.
    const base = (c._useAi && (c.aiDraft || c.ai)) || c.reviewDraft || c.review || c.aiDraft || (c.mode === 'ai' ? c.ai : null) || {};
    c._useAi = false;
    const goals = (c.scenario.goals || []).map((g, i) => {
      const b = (base.goals || []).find((x) => x.goal === g) || (base.goals || [])[i];
      return { goal: g, met: b ? b.met : (c.ticks || []).includes(i) ? 'yes' : 'no', evidence: b ? b.evidence || '' : '' };
    });
    const crit = t.rubric.map((r) => { const b = (base.criteria || []).find((x) => x.name === r.name) || {}; return { name: r.name, desc: r.desc, score: b.score || null, evaluation: b.evaluation || '' }; });
    const S = { verdict: base.verdict || '', summary: base.summary || '', note: base.note || '', tips: (base.tips || []).join('\n'), crit, goals };
    col.innerHTML = `
      ${c.mode === 'ai' && c.ai && c.review ? scorecardView(c.ai, '🤖 The AI\'s scoring', null) : ''}
      <div class="card" id="scoreForm">
        <div class="card-head"><h3>🎓 Your scorecard</h3><span class="spacer"></span>${c.review && c.review.sentAt ? `<span class="badge green">Sent ${U.when(c.review.sentAt)}${c.review.seenAt ? ' · seen' : ''}</span>` : ''}${c.reviewDraft ? `<span class="badge amber">${c.review ? 'Unsent changes' : 'Draft saved'}: the trainee doesn't see ${c.review ? 'them' : 'it'} yet</span>` : ''}</div>
        ${App.cfg.features.ai ? `<div class="row" style="margin-bottom:12px"><button class="btn btn-sm" data-sc="draft">✨ ${c.mode === 'live' ? (c.recording ? 'Draft with AI from the recording' : 'Draft with AI (no recording: from the note)') : 'Score again with AI'}</button>${c.aiDraft && (c.review || c.reviewDraft) ? '<button class="btn btn-sm" data-sc="useai">Use the AI draft</button>' : ''}<span class="small muted" id="draftMsg"></span></div>` : ''}
        ${!c.noteSubmittedAt ? '<div class="warn-box" style="margin-bottom:12px">The trainee hasn\'t submitted the note yet: you\'re seeing what they typed so far.</div>' : ''}
        <div class="field"><label class="f">Verdict</label><select class="input" data-f="verdict"><option value="">Choose…</option>${VERDICTS.map((v) => `<option ${v === S.verdict ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        ${S.crit.map((x, i) => `<div class="crit"><div class="crit-head"><b title="${esc(x.desc)}">${esc(x.name)}</b><span class="dots" data-crit="${i}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" class="${x.score === n ? 'on' : ''}">${n}</button>`).join('')}</span></div>
          <p class="tiny muted" style="margin:6px 0">${esc(x.desc)}</p><textarea class="input" data-ev="${i}" rows="2" placeholder="Evaluation: what they did, with specifics">${esc(x.evaluation)}</textarea></div>`).join('')}
        <h4>The goals</h4>
        ${S.goals.map((g, i) => `<div class="gm"><span class="seg" data-goal="${i}">${[['yes', '✓'], ['partly', '~'], ['no', '✗'], ['n/a', 'n/a']].map(([v, l]) => `<button type="button" data-v="${v}" class="${v === 'n/a' ? 'na' : v} ${g.met === v ? 'on' : ''}">${l}</button>`).join('')}</span><div style="flex:1">${esc(g.goal)}${g.evidence ? `<div class="tiny muted">${esc(g.evidence)}</div>` : ''}</div></div>`).join('')}
        <div class="field" style="margin-top:12px"><label class="f">Summary (the trainee reads this first)</label><textarea class="input" data-f="summary" rows="4">${esc(S.summary)}</textarea></div>
        <div class="field"><label class="f">The note</label><textarea class="input" data-f="note" rows="2">${esc(S.note)}</textarea></div>
        <div class="field"><label class="f">Next time (one per line)</label><textarea class="input" data-f="tips" rows="3">${esc(S.tips)}</textarea></div>
        <div class="row"><button class="btn" data-sc="save">💾 Save draft</button><button class="btn btn-orange" data-sc="send">📨 ${c.review && c.review.sentAt ? 'Update and resend' : 'Send to the trainee'}</button><span class="spacer"></span><span class="score-big" id="scPct" style="font-size:26px"></span></div>
      </div>`;
    const form = U.$('#scoreForm');
    const pct = () => { const sc = S.crit.map((x) => x.score).filter(Boolean); U.$('#scPct').textContent = sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length * 20) + '%' : ''; };
    pct();
    form.onclick = async (e) => {
      const dot = e.target.closest('[data-crit] button');
      if (dot) { const i = Number(dot.parentElement.dataset.crit); S.crit[i].score = Number(dot.dataset.n); U.$$('button', dot.parentElement).forEach((x) => x.classList.toggle('on', x === dot)); pct(); return; }
      const seg = e.target.closest('[data-goal] button');
      if (seg) { const i = Number(seg.parentElement.dataset.goal); S.goals[i].met = seg.dataset.v; U.$$('button', seg.parentElement).forEach((x) => x.classList.toggle('on', x === seg)); return; }
      const b = e.target.closest('[data-sc]'); if (!b) return;
      const act = b.dataset.sc;
      if (act === 'draft') return draftAi(c, b);
      if (act === 'useai') { c._useAi = true; drawScore(c); return; }
      read();
      const review = { verdict: S.verdict, summary: S.summary, note: S.note, tips: S.tips.split('\n').map((x) => x.trim()).filter(Boolean), criteria: S.crit.map((x) => ({ name: x.name, score: x.score, evaluation: x.evaluation })), goals: S.goals, send: act === 'send' };
      if (act === 'send' && S.crit.some((x) => !x.score)) return U.toast('Score every criterion (1 to 5) before sending.', 'error');
      b.disabled = true;
      try { const r = await API.post('/api/call/update', { id: c.id, review }); c = r.call; U.toast(act === 'send' ? 'Review sent to the trainee.' : 'Draft saved.', 'ok'); drawScore(c); }
      catch (err) { U.toast(err.message, 'error'); b.disabled = false; }
    };
    function read() {
      U.$$('[data-f]', form).forEach((el) => { S[el.dataset.f] = el.value; });
      U.$$('[data-ev]', form).forEach((el) => { S.crit[Number(el.dataset.ev)].evaluation = el.value; });
    }
  }

  async function draftAi(c, btn) {
    const msg = U.$('#draftMsg');
    btn.disabled = true;
    try {
      if (c.mode === 'ai') {
        msg.textContent = 'Scoring…';
        const r = await API.post('/api/ai/grade', { id: c.id });
        Object.assign(c, r.call); c._useAi = true;
      } else {
        let wav = new Blob([], { type: 'audio/wav' });
        if (c.recording) {
          msg.textContent = 'Preparing the recording…';
          const blob = await API.getBlob('/api/recording/get', { id: c.id });
          wav = await VoIP.toWav8k(blob);
        }
        msg.textContent = c.recording ? 'The AI is listening to the call (this can take a minute)…' : 'Drafting…';
        const r = await API.postBlob('/api/ai/draft?id=' + encodeURIComponent(c.id), wav, 'audio/wav');
        Object.assign(c, r.call); c._useAi = true;
      }
      U.toast('AI draft ready: check it, edit it, then send.', 'ok');
      const tr = U.$('.grid2 > div:first-child');
      if (c.transcript && c.transcript.length && tr && !tr.querySelector('.transcript')) tr.insertAdjacentHTML('beforeend', transcriptView(c.transcript));
      drawScore(c);
    } catch (e) { msg.textContent = ''; U.toast(e.message, 'error'); btn.disabled = false; }
  }

  /* ---------------- 📚 scenarios ---------------- */
  App.register('scenarios', {
    trainer: true,
    render() {
      const app = U.$('#app');
      const track = App.scenTrack || 'reception';
      const list = App.cfg.scenarios.filter((s) => s.track === track);
      app.innerHTML = `<div class="card"><div class="card-head"><h2>📚 Scenarios</h2><span class="spacer"></span><button class="btn btn-orange" data-act="new">＋ Write a new call</button></div>
        <p class="muted small">The calls you play live (and the AI plays in practice). The built-in calls come from the Foundational call pack on the CMS Training Library cases; copy one to change it, or write your own.</p>
        <div class="pill-tabs" id="stk" style="margin:10px 0 14px">${Object.entries(App.cfg.tracks).map(([k, t]) => `<button data-track="${k}" class="${k === track ? 'on' : ''}">${t.icon} ${esc(t.label)} (${App.cfg.scenarios.filter((s) => s.track === k).length})</button>`).join('')}</div>
        <div class="scen-grid">${list.map((s) => `<div class="scen" style="cursor:default">
          <div class="meta">${App.levelBadge(s.level)}${s.caseId ? `<span class="badge">${esc(s.caseId)}</span>` : ''}${s.custom ? '<span class="badge blue">Yours</span>' : '<span class="badge">Built in</span>'}${s.ai === false ? '<span class="badge">Live only</span>' : ''}</div>
          <h4>${esc(s.title)}</h4><p><b>${esc(s.caller.name)}</b>: ${esc(s.caller.role)}</p><p>${esc(s.facts)}</p>
          <div class="row"><button class="btn btn-sm" data-view="${esc(s.id)}">👁 View</button><button class="btn btn-sm" data-copy="${esc(s.id)}">⧉ Copy</button>${s.custom ? `<button class="btn btn-sm" data-edit="${esc(s.id)}">✏️ Edit</button><button class="btn btn-sm" data-del="${esc(s.id)}">🗑</button>` : ''}</div></div>`).join('') || '<div class="empty">No calls here yet.</div>'}</div></div>`;
      app.onclick = async (e) => {
        const g = (a) => { const b = e.target.closest(`[data-${a}]`); return b ? b.dataset[a] : null; };
        const tk = e.target.closest('[data-track]');
        if (tk) { App.scenTrack = tk.dataset.track; App.views.scenarios.render(); return; }
        if (e.target.closest('[data-act="new"]')) return editor({ track, level: 'Intermediate', caller: { gender: 'f' } });
        if (g('view')) return viewScenario(App.scen[g('view')]);
        if (g('copy')) { const s = JSON.parse(JSON.stringify(App.scen[g('copy')])); delete s.id; s.title += ' (copy)'; return editor(s); }
        if (g('edit')) return editor(JSON.parse(JSON.stringify(App.scen[g('edit')])));
        if (g('del')) {
          if (!confirm('Delete this call? Past call records keep their copy.')) return;
          try { await API.post('/api/scenarios/delete', { id: g('del') }); await App.reloadConfig(); App.views.scenarios.render(); } catch (err) { U.toast(err.message, 'error'); }
        }
      };
    }
  });

  function viewScenario(s) {
    App.modal({ title: esc(s.title), wide: true, body: `<div class="row">${App.trackBadge(s.track)}${App.levelBadge(s.level)}${s.caseId ? `<span class="badge">${esc(s.caseId)}</span>` : ''}<span class="small muted">${esc(s.source || '')}</span></div>
      <p style="margin-top:10px"><b>${esc(s.caller.name)}</b>, ${esc(s.caller.role)} · caller ID <span class="mono">${esc(s.caller.idName)} ${esc(s.caller.number)}</span></p>
      <div class="opening">${esc(s.opening)}</div>
      <div class="grid2"><div><h4>The caller's script</h4><div class="persona">${esc(s.hidden)}</div></div><div><h4>Goals</h4><ul class="small">${(s.goals || []).map((g) => `<li>${esc(g)}</li>`).join('')}</ul><h4>The situation</h4><p class="small">${esc(s.facts)}</p><h4>The trainee's brief (practice)</h4><p class="small">${esc(s.you)}</p></div></div>` });
  }

  function editor(s) {
    const cases = Object.values(App.cfg.cases);
    const dir = App.cfg.firm.directory;
    const m = App.modal({ title: s.id ? '✏️ Edit call' : '＋ New call', wide: true, body: `<form id="scEd">
      <div class="fields-2">
        <div class="field"><label class="f">Title</label><input class="input" name="title" value="${esc(s.title || '')}" required></div>
        <div class="fields-2"><div class="field"><label class="f">Line</label><select class="input" name="track">${Object.entries(App.cfg.tracks).map(([k, t]) => `<option value="${k}" ${k === s.track ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
          <div class="field"><label class="f">Level</label><select class="input" name="level">${App.cfg.levels.map((l) => `<option ${l === s.level ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="field"><label class="f">Caller's name</label><input class="input" name="caller.name" value="${esc((s.caller || {}).name || '')}" required></div>
        <div class="field"><label class="f">Who they are</label><input class="input" name="caller.role" value="${esc((s.caller || {}).role || '')}" placeholder="e.g. Adjuster, Keystone Mutual"></div>
        <div class="field"><label class="f">Caller ID name (what the phone shows)</label><input class="input" name="caller.idName" value="${esc((s.caller || {}).idName || '')}" placeholder="e.g. WIRELESS CALLER"></div>
        <div class="fields-2"><div class="field"><label class="f">Caller ID number</label><input class="input" name="caller.number" value="${esc((s.caller || {}).number || '')}" placeholder="(555) 010-0000"></div>
          <div class="field"><label class="f">AI voice</label><select class="input" name="caller.gender"><option value="f" ${(s.caller || {}).gender !== 'm' ? 'selected' : ''}>Female</option><option value="m" ${(s.caller || {}).gender === 'm' ? 'selected' : ''}>Male</option></select></div></div>
        <div class="field"><label class="f">The case it's about</label><select class="input" name="caseId"><option value="">None</option>${cases.map((c) => `<option value="${c.id}" ${c.id === s.caseId ? 'selected' : ''}>${c.id} · ${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label class="f" style="margin-top:22px"><input type="checkbox" name="newcaller" ${(s.hideCases || []).includes(s.caseId) && s.caseId ? 'checked' : ''}> A first call: the case isn't on file yet (hidden from lookup; shown after as the finished file)</label></div>
      </div>
      <div class="field"><label class="f">Opening line</label><textarea class="input" name="opening" rows="2" required>${esc(s.opening || '')}</textarea></div>
      <div class="field"><label class="f">The caller's script: who they are, what they answer when asked, how they behave, what they push on</label><textarea class="input" name="hidden" rows="6" required>${esc(s.hidden || '')}</textarea></div>
      <div class="field"><label class="f">The situation (day, time, who is in or out)</label><textarea class="input" name="facts" rows="2">${esc(s.facts || '')}</textarea></div>
      <div class="field"><label class="f">Goals: what a good call does (one per line)</label><textarea class="input" name="goals" rows="5">${esc((s.goals || []).join('\n'))}</textarea></div>
      <div class="field"><label class="f">The trainee's brief (shown before a practice call)</label><textarea class="input" name="you" rows="2">${esc(s.you || '')}</textarea></div>
      <div class="field"><label class="f">Out of the office (a transfer to them doesn't go through)</label><div class="row">${dir.map((d) => `<label class="check small"><input type="checkbox" name="un" value="${esc(d.ext)}" ${(s.unavailable || []).includes(d.ext) ? 'checked' : ''}>${esc(d.name)}</label>`).join('')}</div></div>
      <label class="check"><input type="checkbox" name="ai" ${s.ai !== false ? 'checked' : ''}> Trainees can practice this call with the AI caller</label>
    </form>`, foot: `<button class="btn" data-x>Cancel</button><button class="btn btn-orange" id="scSave">Save call</button>` });
    m.el.querySelector('#scSave').onclick = async () => {
      const f = m.el.querySelector('#scEd');
      if (!f.reportValidity()) return;
      const v = (n) => (f.elements[n] ? f.elements[n].value : '');
      const caseId = v('caseId');
      const out = { id: s.custom ? s.id : undefined, title: v('title'), track: v('track'), level: v('level'), caseId,
        caller: { name: v('caller.name'), role: v('caller.role'), idName: v('caller.idName'), number: v('caller.number'), gender: v('caller.gender') },
        hideCases: f.elements.newcaller.checked && caseId ? [caseId] : [], reference: f.elements.newcaller.checked && caseId ? caseId : null,
        opening: v('opening'), hidden: v('hidden'), facts: v('facts'), goals: v('goals'), you: v('you'),
        unavailable: [...f.querySelectorAll('[name=un]:checked')].map((x) => x.value), ai: f.elements.ai.checked };
      try { await API.post('/api/scenarios/save', { scenario: out }); await App.reloadConfig(); m.close(); U.toast('Call saved.', 'ok'); App.scenTrack = out.track; App.views.scenarios.render(); }
      catch (err) { U.toast(err.message, 'error'); }
    };
  }

  /* ---------------- 👥 trainees ---------------- */
  App.register('trainees', {
    trainer: true,
    async render() {
      const app = U.$('#app');
      app.innerHTML = '<div class="card"><div class="empty">Loading…</div></div>';
      let ts;
      try { ts = (await API.post('/api/trainees')).trainees; } catch (e) { app.innerHTML = `<div class="card err-box">${esc(e.message)}</div>`; return; }
      const online = new Set((App.presence.trainees || []).map((x) => x.id));
      const show = App.showArchived;
      const list = ts.filter((x) => !!x.archived === !!show);
      app.innerHTML = `<div class="card"><div class="card-head"><h2>👥 Trainees</h2><span class="spacer"></span><label class="check small"><input type="checkbox" id="arch" ${show ? 'checked' : ''}> Show archived</label></div>
        <p class="small muted">Trainees appear here the first time they sign in with their name, batch and a PIN they choose. Forgot a PIN? <b>Reset PIN</b>: their next sign-in sets a new one. The live average counts reviewed live calls only; practice scores are the AI's.</p>
        <div class="table-wrap"><table class="list"><thead><tr><th>Trainee</th><th>Batch</th><th>Last seen</th><th>Live calls</th><th>Live average</th><th>Practice</th><th></th></tr></thead><tbody>
        ${list.map((x) => `<tr><td><span class="led ${online.has(x.id) ? 'available' : ''}" style="display:inline-block;margin-right:8px"></span><b>${esc(x.name)}</b></td><td>${esc(x.batch)}</td><td>${online.has(x.id) ? '<span class="badge green">Online</span>' : U.when(x.last_seen)}</td>
          <td>${x.calls || 0}</td><td>${x.avg != null ? `<b>${Math.round(x.avg)}%</b>` : '–'}</td><td class="small">${x.practice || 0} call${x.practice === 1 ? '' : 's'}${x.practiceAvg != null ? ' · ' + Math.round(x.practiceAvg) + '%' : ''}</td>
          <td class="row" style="justify-content:flex-end"><button class="btn btn-sm" data-calls="${esc(x.id)}">🗂 Calls</button>${x.hasPin ? `<button class="btn btn-sm" data-pin="${esc(x.id)}" data-name="${esc(x.name)}">🔑 Reset PIN</button>` : '<span class="badge">No PIN yet</span>'}<button class="btn btn-sm" data-arch="${esc(x.id)}" data-v="${x.archived ? 0 : 1}">${x.archived ? 'Restore' : 'Archive'}</button></td></tr>`).join('') || `<tr><td colspan="7" class="empty">${show ? 'No archived trainees.' : 'No trainees yet.'}</td></tr>`}
        </tbody></table></div></div>`;
      U.$('#arch').onchange = (e) => { App.showArchived = e.target.checked; App.views.trainees.render(); };
      app.onclick = async (e) => {
        const c = e.target.closest('[data-calls]'); if (c) { F.traineeId = c.dataset.calls; F.batch = ''; location.hash = '#/calls'; return; }
        const pin = e.target.closest('[data-pin]');
        if (pin) {
          if (!confirm(`Reset ${pin.dataset.name}'s PIN? Their next sign-in sets a new one.`)) return;
          try { await API.post('/api/trainees/reset-pin', { id: pin.dataset.pin }); U.toast('PIN reset. Ask them to sign in again and choose a new PIN.', 'ok'); App.views.trainees.render(); } catch (err) { U.toast(err.message, 'error'); }
          return;
        }
        const a = e.target.closest('[data-arch]');
        if (a) { try { await API.post('/api/trainees/archive', { id: a.dataset.arch, archived: a.dataset.v === '1' }); App.views.trainees.render(); } catch (err) { U.toast(err.message, 'error'); } }
      };
    }
  });

  /* ---------------- ⚙️ setup and diagnostics ---------------- */
  App.register('setup', {
    trainer: true,
    async render() {
      const app = U.$('#app');
      app.innerHTML = '<div class="card"><div class="empty">Checking…</div></div>';
      let r;
      try { r = await API.post('/api/stats'); } catch (e) { app.innerHTML = `<div class="card err-box">${esc(e.message)}</div>`; return; }
      const st = r.stats, su = r.setup;
      const item = (ok, title, text) => `<div class="gm"><span class="mk">${ok ? '✅' : '⚠️'}</span><div><b>${title}</b><div class="small muted">${text}</div></div></div>`;
      app.innerHTML = `<div class="stats" style="margin-top:0">
          <div class="stat"><div class="v">${st.online}</div><div class="k">Trainees online</div></div>
          <div class="stat"><div class="v">${st.liveNow}</div><div class="k">Live calls now</div></div>
          <div class="stat"><div class="v">${st.calls}</div><div class="k">Calls taken</div></div>
          <div class="stat ${st.toReview ? 'bad' : ''}"><div class="v">${st.toReview}</div><div class="k">Live calls to review</div></div>
          <div class="stat"><div class="v">${st.trainees}</div><div class="k">Trainees</div></div></div>
        <div class="grid2" style="margin-top:16px"><div class="card"><h2>⚙️ Setup</h2>
          ${item(true, 'Trainer sign-in', 'ADMIN_PASSPHRASE is set.')}
          ${item(su.turn, 'TURN relay (Cloudflare Realtime)', su.turn ? 'Calls connect even on networks that block direct audio.' : `Not set${su.turnError ? ' (' + esc(su.turnError) + ')' : ''}: most calls still connect, but some trainees on strict home routers, mobile data or office networks won't get audio. Add TURN_KEY_ID and TURN_KEY_API_TOKEN (see the README).`)}
          ${item(su.recordings, 'Recordings', su.recordings ? `Kept ${su.recordingDays} days in LSH_KV, then deleted automatically.` : 'The LSH_KV binding is missing: calls aren\'t recorded.')}
          ${item(su.ai, 'AI practice callers and AI scoring', su.ai ? `${su.aiKeys} Gemini key${su.aiKeys > 1 ? 's' : ''} in the pool.` : 'No GEMINI_API_KEY5 … secrets: live calls work, practice and AI drafts are off.')}
          ${item(true, 'Trainee access code', su.traineeCode ? 'On: trainees need TRAINEE_CODE to sign in.' : 'Off: anyone with the link can sign in as a trainee. Set TRAINEE_CODE to require a code.')}
        </div>
        <div class="card"><h2>🧪 Test this computer</h2>
          <p class="small muted">Checks the microphone, and which ways this network can carry a call: direct (host), through the router (srflx) or through the TURN relay (relay). Trainees can run the mic check from their phone.</p>
          <div class="row"><button class="btn" id="tMic">🎙 Mic check</button><button class="btn" id="tNet">🌐 Network test</button></div><div id="netOut" class="small" style="margin-top:12px"></div></div></div>`;
      U.$('#tMic').onclick = () => App.micCheck();
      U.$('#tNet').onclick = async () => {
        const out = U.$('#netOut'); out.textContent = 'Gathering…';
        const servers = await VoIP.ice();
        const pc = new RTCPeerConnection({ iceServers: servers });
        pc.createDataChannel('t');
        const seen = { host: 0, srflx: 0, relay: 0 };
        pc.onicecandidate = (e) => { if (e.candidate && e.candidate.type) seen[e.candidate.type] = (seen[e.candidate.type] || 0) + 1; };
        await pc.setLocalDescription(await pc.createOffer());
        setTimeout(() => {
          pc.close();
          out.innerHTML = `Direct: ${seen.host ? '✅' : '–'} · Through the router: ${seen.srflx ? '✅' : '⚠️ none'} · TURN relay: ${seen.relay ? '✅' : '⚠️ none'}<br>${seen.relay ? 'Calls from this computer will connect on any network.' : 'Without relay candidates, calls can fail on strict networks. Set up TURN (see the README).'}`;
        }, 4000);
      };
    }
  });
})();
