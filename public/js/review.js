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
    const ag = typeof c.autograde === 'string' ? c.autograde : (c.autograde && c.autograde.state) || '';
    if (c.reviewed) return `<span class="badge green">${App.trainer() ? 'Sent' : 'Graded'}</span>`;
    if (ag === 'queued' || ag === 'grading') return '<span class="badge blue">🤖 Grading…</span>';
    if (c.mode === 'ai') return c.ai ? '<span class="badge blue">🤖 AI graded</span>' : '<span class="badge">Not graded</span>';
    if (App.trainer() && (c.aiScore != null || c.aiDraft)) return '<span class="badge amber">🤖 AI graded: approve</span>';
    if (ag === 'failed') return '<span class="badge red">AI couldn\'t grade</span>';
    return c.noteSubmitted || c.noteSubmittedAt ? '<span class="badge amber">Needs review</span>' : '<span class="badge amber">Note not submitted</span>';
  };
  const gradedBadge = (c) => (c.graded ? '<span class="badge" style="background:#ffedd5;color:#9a3412">📋 Graded</span>' : '');
  const passBadge = (pct) => {
    const pm = App.cfg.settings && App.cfg.settings.passMark;
    if (pm == null || pct == null) return '';
    return pct >= pm ? `<span class="badge green">Pass (≥ ${pm}%)</span>` : `<span class="badge red">Below ${pm}%</span>`;
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
              <td>${c.mode === 'ai' ? '<span class="badge">🎧 AI practice</span>' : `<span class="badge orange">📞 Live${c.trainer ? ' · ' + esc(c.trainer) : ''}</span>`} ${gradedBadge(c)}</td>
              <td>${c.ringMs != null ? `${U.rings(c.ringMs)} ring${U.rings(c.ringMs) > 1 ? 's' : ''}` : '–'}</td>
              <td>${c.talkMs ? U.dur(c.talkMs) : '–'}${c.recording ? ' 🎙' : ''}</td>
              <td>${c.score != null ? `<b>${c.score}%</b>` : tr && c.aiScore != null ? `<span class="muted" title="The AI's grade, not sent yet">🤖 ${c.aiScore}%</span>` : '–'}</td><td>${statusBadge(c)}${!tr && c.reviewed && !c.reviewSeen ? ' <span class="badge orange">New</span>' : ''}</td></tr>`).join('')}</tbody></table>`
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
    out.push(`<div class="stat"><div class="v">${tx.length}</div><div class="k">Transfer${tx.length === 1 ? '' : 's'}${tx.length ? ': ' + tx.map((x) => `${esc(x.ext)} ${x.result === 'connected' ? '✓' : x.result === 'voicemail' ? '(voicemail)' : x.result === 'cancelled' ? '(taken back)' : '(no answer)'}`).join(', ') : ''}</div></div>`);
    const d = c.audioStats && c.audioStats.deadAir;
    if (d) out.push(`<div class="stat ${d.count ? 'bad' : 'good'}" title="Both sides silent for 4 seconds or more (holds excluded), measured in the recording"><div class="v">${d.count}</div><div class="k">Dead air ${d.count ? `· ${d.total} s, longest ${d.longest} s` : '(none over 4 s)'}</div></div>`);
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

  // The scorecard as the program's sheet: each metric's score and feedback, then the weighted average.
  function scorecardView(g, title, track) {
    if (!g) return '';
    const t = App.cfg.tracks[track] || {};
    const sc = App.weighted(track, g.criteria);
    const goals = (g.goals || []).map((x) => `<div class="gm"><span class="mk">${x.met === 'yes' ? '✅' : x.met === 'partly' ? '🟡' : x.met === 'n/a' ? '➖' : '❌'}</span><div><div>${esc(x.goal)}</div>${x.evidence ? `<div class="small muted">${esc(x.evidence)}</div>` : ''}</div></div>`).join('');
    return `<div class="card"><div class="card-head"><h3>${title}</h3><span class="spacer"></span>${sc ? `<span class="score-big" style="font-size:28px">${sc.pct}%</span>` : ''}</div>
      <div class="row" style="margin-bottom:8px">${g.verdict ? `<span class="verdict">${esc(g.verdict)}</span>` : ''}<span class="spacer"></span>${passBadge(sc && sc.pct)}${g.ai ? `<span class="badge blue" title="${g.fromAudio ? 'Graded from the call recording' : 'Graded from the transcript and the note'}">🤖 AI${g.fromAudio ? ' · from the recording' : ''}</span>` : ''}</div>
      ${g.summary ? `<p>${esc(g.summary)}</p>` : ''}
      <table class="list sheet"><thead><tr><th>${esc(t.sheet || 'Metric')}</th><th style="width:70px">Score</th><th>Feedback</th></tr></thead><tbody>
        ${(g.criteria || []).map((x) => `<tr><td><b>${esc(x.name)}</b></td><td class="mono"><b>${x.score || 'n/a'}</b>${x.score ? '<span class="muted">/5</span>' : ''}</td><td class="small">${esc(x.evaluation || '')}</td></tr>`).join('')}
        <tr class="avg"><td><b>WEIGHTED AVERAGE</b></td><td class="mono"><b>${sc ? sc.avg : '–'}</b></td><td class="small">${sc ? `${sc.pct}%` : ''}</td></tr>
      </tbody></table>
      ${goals ? `<h4 style="margin-top:14px">The call's checklist</h4>${goals}` : ''}
      ${g.note ? `<h4 style="margin-top:14px">The note</h4><p class="small">${esc(g.note)}</p>` : ''}
      ${(g.tips || []).length ? `<h4 style="margin-top:14px">Next time</h4><ul class="small">${g.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
  }

  function transcriptView(tr) {
    if (!tr || !tr.length) return '';
    return `<div class="card" id="trCard"><div class="card-head"><h3>💬 Transcript</h3></div><div class="transcript" style="max-height:480px">${tr.map((l) => `<div class="tl ${l.who}"><b>${l.who === 'caller' ? 'Caller' : 'Trainee'}</b>${esc(l.text)}</div>`).join('')}</div></div>`;
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
      <div class="row" style="margin-bottom:12px"><a href="#/calls" class="btn btn-sm">← ${tr ? 'Call log' : 'My calls'}</a>${tr && c.graded ? '<a href="#/graded" class="btn btn-sm">📋 Graded calls</a>' : ''}<span class="spacer"></span>${tr ? `<button class="btn btn-sm" data-act="delete">🗑 Delete call</button>` : ''}</div>
      <div class="card">
        <div class="row">${App.trackBadge(c.track)}${s.level ? App.levelBadge(s.level) : ''}${c.mode === 'ai' ? '<span class="badge">🎧 AI practice</span>' : `<span class="badge orange">📞 Live with ${esc(c.trainer || 'trainer')}</span>`}${gradedBadge(c)}<span id="callStatus">${statusBadge(c)}</span></div>
        <h1 style="margin-top:10px">${esc(c.title)}</h1>
        <p class="muted">${esc(c.traineeName)}${c.batch ? ' · ' + esc(c.batch) : ''} · ${U.when(c.createdAt)}${s.caller && s.caller.name ? ` · Caller: ${esc(s.caller.name)}${s.caller.role ? ' (' + esc(s.caller.role) + ')' : ''}` : ''}</p>
        ${c.status === 'ended' ? statsHTML(c) : `<div class="warn-box">This call ${c.status === 'missed' ? 'rang out: nobody answered' : c.status === 'declined' ? 'was declined' : c.status === 'cancelled' ? 'was cancelled before it was answered' : 'is still in progress'}.</div>`}
        ${c.recording ? `<div id="recBox" style="margin-top:12px"><button class="btn btn-sm" data-act="loadrec">▶ Play / ⬇ download the recording (${U.dur(c.recording.durMs || 0)})</button> <span class="tiny muted">Kept until ${new Date(c.recording.expires || Date.now()).toLocaleDateString()}</span></div>` : ''}
      </div>
      <div class="grid2" style="margin-top:16px">
        <div id="leftcol">
          <div class="card"><div class="card-head"><h3>📝 ${esc(App.formFor(c.track).title)}</h3><span class="spacer"></span>${c.noteSubmittedAt ? `<span class="badge green">Submitted ${U.when(c.noteSubmittedAt)}</span>` : '<span class="badge amber">Not submitted</span>'}</div>${noteView(c, editableNote)}</div>
          ${transcriptView(c.transcript)}
          ${onFile ? `<div class="card"><details><summary style="cursor:pointer"><b>📁 The case file (${esc(onFile.id)})</b></summary><pre class="case">${esc(onFile.text)}</pre></details></div>` : ''}
          ${ref && ended ? `<div class="card"><details><summary style="cursor:pointer"><b>✅ How the finished file looks (${esc(ref.id)})</b></summary><p class="small muted" style="margin-top:8px">What a complete intake captures, for comparing with the note.</p><pre class="case">${esc(ref.text)}</pre><a class="small" target="_blank" rel="noopener" href="${App.cfg.cms}?program=intake&mock=${ref.id}&from=standard">Open ${ref.id} in the CMS ↗</a></details></div>` : ''}
          ${tr ? `<div class="card"><details><summary style="cursor:pointer"><b>🎭 The caller's script</b></summary><div class="opening">${esc(s.opening || '')}</div><div class="persona">${esc(s.hidden || '')}</div><p class="small" style="margin-top:8px">${esc(s.facts || '')}</p></details></div>` : ''}
        </div>
        <div id="scorecol"></div>
      </div>`;
    // Keeps the page current while the AI grades (the Switchboard also says when a grade lands).
    let poll = null, alive = true, wantAi = false;   // wantAi: the trainer asked to grade again, so the new grade loads when it lands
    const refresh = async () => {
      try {
        const fresh = (await API.post('/api/call', { id: c.id })).call; if (!alive) return;
        const hadAi = !!(c.aiDraft || c.ai);
        c = fresh;
        const cs = U.$('#callStatus'); if (cs) cs.innerHTML = statusBadge(c);
        if (wantAi && c.autograde && c.autograde.state === 'done' && (c.aiDraft || c.ai)) { c._useAi = true; wantAi = false; }
        const trc = U.$('#trCard'); if (c.transcript && c.transcript.length && !trc) U.$('#leftcol').insertAdjacentHTML('beforeend', transcriptView(c.transcript));
        const form = U.$('#scoreForm');
        if (form && form.dataset.dirty === '1' && !c._useAi) {
          // The trainer is editing: never wipe their work; offer the AI grade instead.
          const box = U.$('#agBox'); if (box) box.innerHTML = autogradeHTML(c) + (!hadAi && (c.aiDraft || c.ai) ? '<div class="ok-box" style="margin-bottom:12px">🤖 The AI grade is ready. <button class="btn btn-sm" data-act="loadai">Load it into the scorecard</button> <span class="small muted">(replaces what you typed)</span></div>' : '');
        } else drawScore(c, refresh);
        watch();
      } catch (e) {}
    };
    const grading = () => { const ag = c.autograde && (c.autograde.state || c.autograde); return ag === 'queued' || ag === 'grading'; };
    const watch = () => { clearTimeout(poll); if (alive && grading()) poll = setTimeout(refresh, 4000); };
    App.gradedHook = (m) => { if (m.callId === c.id) refresh(); };
    App.leave = () => { alive = false; clearTimeout(poll); App.gradedHook = null; };
    drawScore(c, refresh);
    watch();
    app.onclick = async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'loadrec') {
        b.disabled = true; b.textContent = 'Loading…';
        try {
          const blob = await API.getBlob('/api/recording/get', { id: c.id });
          const url = URL.createObjectURL(blob);
          // e.g. "Mock call - Jamie Cruz - An Offer With a Deadline - 2026-09-30.webm"
          const ext = /ogg/.test(blob.type) ? 'ogg' : /mp4/.test(blob.type) ? 'm4a' : /wav/.test(blob.type) ? 'wav' : 'webm';
          const name = `Mock call - ${c.traineeName} - ${c.title} - ${new Date(c.createdAt).toISOString().slice(0, 10)}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.' + ext;
          U.$('#recBox').innerHTML = `<audio class="rec" controls src="${url}"></audio><div class="row" style="margin-top:6px"><a class="btn btn-sm" id="recDl" href="${url}" download="${esc(name)}">⬇ Download the recording</a><span class="tiny muted">${esc(name)}</span></div>`;
          playable(U.$('#recBox audio'));
        }
        catch (err) { U.$('#recBox').innerHTML = `<span class="small err-box">${esc(err.message)}</span>`; }
      } else if (act === 'submitnote') {
        const note = App.readNote(U.$('#noteEdit'));
        try { const r = await API.post('/api/call/update', { id: c.id, note, submit: true }); U.toast('Note submitted.', 'ok'); c = r.call; draw(c); }
        catch (err) { U.toast(err.message, 'error'); }
      } else if (act === 'delete') {
        if (!confirm('Delete this call and its recording? This can\'t be undone.')) return;
        try { await API.post('/api/call/delete', { id: c.id }); U.toast('Deleted.'); location.hash = '#/calls'; } catch (err) { U.toast(err.message, 'error'); }
      } else if (act === 'loadai') { c._useAi = true; drawScore(c, refresh);
      } else if (act === 'grade') {
        b.disabled = true;
        try { await API.post('/api/ai/autograde', { id: c.id }); wantAi = true; U.toast('Sent to the AI grader.', 'ok'); await refresh(); } catch (err) { U.toast(err.message, 'error'); b.disabled = false; }
      }
    };
  }

  // Where autograding is: shown above the scorecard.
  function autogradeHTML(c) {
    if (!App.cfg.features.ai || c.status !== 'ended') return '';
    const ag = c.autograde || {};
    const st = ag.state || '';
    if (st === 'queued') {
      const waits = [];
      if (c.mode === 'live' && c.recording && !c.gradeAudio) waits.push('the recording');
      if (!c.noteSubmittedAt) waits.push('the trainee\'s note');
      return `<div class="note-box" style="margin-bottom:12px">🤖 ${waits.length ? `Waiting for ${waits.join(' and ')}, then the AI grades the call` : 'In line for the AI grader'}${ag.due && ag.due > Date.now() + 5000 ? ` (by ${new Date(ag.due).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} at the latest)` : ''}…${ag.error ? ` <span class="muted">(retrying: ${esc(ag.error)})</span>` : ''}</div>`;
    }
    if (st === 'grading') return '<div class="note-box" style="margin-bottom:12px">🤖 The AI is grading the call now (it listens to the recording)…</div>';
    if (st === 'failed') return `<div class="err-box" style="margin-bottom:12px">The AI couldn't grade this call: ${esc(ag.error || '')} <button class="btn btn-sm" data-act="grade">✨ Grade again</button></div>`;
    if (st === 'off') return `<div class="warn-box" style="margin-bottom:12px">${esc(ag.error || 'AI grading is off.')}</div>`;
    return '';
  }

  function drawScore(c, refresh) {
    const col = U.$('#scorecol'); if (!col) return;
    const cs = U.$('#callStatus'); if (cs) cs.innerHTML = statusBadge(c);   // the header badge follows the grade
    const tr = App.trainer();
    if (c.status !== 'ended') { col.innerHTML = ''; return; }
    if (!tr) {
      let html = autogradeHTML(c).replace(/<button[^>]*data-act="grade"[^>]*>.*?<\/button>/, c.mode === 'ai' ? '$&' : '');
      if (c.review) html += scorecardView(c.review, c.review.ai ? '🤖 Your graded scorecard' : `🎓 Your trainer's review${c.review.by ? ' · ' + esc(c.review.by) : ''}`, c.track);
      if (c.ai && (c.mode === 'ai' || !c.review)) html += scorecardView(c.ai, c.review ? '🤖 The AI\'s grading' : '🤖 AI scorecard', c.track);
      if (!c.review && !c.ai) html += c.mode === 'ai'
        ? (c.noteSubmittedAt ? (c.autograde && ['queued', 'grading'].includes(c.autograde.state) ? '' : `<div class="card note-box">Not graded yet. ${App.cfg.features.ai ? '<button class="btn btn-sm" data-act="grade">🤖 Grade it now</button>' : ''}</div>`) : '<div class="card note-box">Submit your note to get this call graded.</div>')
        : `<div class="card note-box">⏳ ${c.graded ? 'Graded mock call: ' : ''}waiting for your trainer's review.${c.noteSubmittedAt ? '' : ' Submit your note first.'}</div>`;
      if (c.scenario && c.scenario.goals && !c.review && !c.ai) html += `<div class="card"><h3>What a good call does</h3><ul class="small">${c.scenario.goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>`;
      col.innerHTML = html;
      return;
    }
    // A live call recorded before the grading copy existed (or whose console closed too soon): make it now.
    if (c.mode === 'live' && c.recording && !c.gradeAudio && App.cfg.features.ai && !c._prepping && !(c.autograde && ['grading', 'done'].includes(c.autograde.state))) {
      c._prepping = true;
      API.getBlob('/api/recording/get', { id: c.id }).then((blob) => VoIP.uploadForGrading(c.id, blob)).then(() => refresh && refresh()).catch(() => {});
    }
    // Trainer: the scorecard editor, on the program's metrics.
    const t = App.cfg.tracks[c.track] || App.cfg.tracks.reception;
    // The form starts from: the AI draft when asked for, else the unsent draft, the sent review, the AI's draft or grading.
    const base = (c._useAi && (c.aiDraft || c.ai)) || c.reviewDraft || c.review || c.aiDraft || (c.mode === 'ai' ? c.ai : null) || {};
    const fromAi = !!base.ai;   // the form holds the AI's grade (not a trainer's edits)
    c._useAi = false;
    const goals = (c.scenario.goals || []).map((g, i) => {
      const b = (base.goals || []).find((x) => x.goal === g) || (base.goals || [])[i];
      return { goal: g, met: b ? b.met : (c.ticks || []).includes(i) ? 'yes' : 'no', evidence: b ? b.evidence || '' : '' };
    });
    const crit = t.rubric.map((r) => { const b = (base.criteria || []).find((x) => x.name === r.name) || {}; return { name: r.name, desc: r.desc, score: b.score || null, evaluation: b.evaluation || '' }; });
    const S = { verdict: base.verdict || '', summary: base.summary || '', note: base.note || '', tips: (base.tips || []).join('\n'), crit, goals };
    const sentAi = c.review && c.review.ai;
    col.innerHTML = `<div id="agBox">${autogradeHTML(c)}</div>
      ${c.mode === 'ai' && c.ai && c.review ? scorecardView(c.ai, '🤖 The AI\'s grading', c.track) : ''}
      <div class="card" id="scoreForm">
        <div class="card-head"><h3>🎓 Scorecard · ${esc(t.sheet)}</h3><span class="spacer"></span>${c.review && c.review.sentAt ? `<span class="badge green">${sentAi ? '🤖 AI grade released' : 'Sent'} ${U.when(c.review.sentAt)}${c.review.seenAt ? ' · seen' : ''}</span>` : ''}${c.reviewDraft ? `<span class="badge amber">${c.review ? 'Unsent changes' : 'Draft saved'}: the trainee doesn't see ${c.review ? 'them' : 'it'} yet</span>` : ''}</div>
        ${fromAi ? `<div class="ok-box" style="margin-bottom:12px">🤖 <b>Autograded${base.fromAudio ? ' from the recording' : ''}.</b> Check it, change any score or feedback, then send it. ${c.mode === 'live' && !(c.review && c.review.sentAt) ? '<button class="btn btn-sm btn-green" data-sc="approve" style="margin-left:6px">✅ Approve the AI grade &amp; send</button>' : ''}</div>` : ''}
        ${App.cfg.features.ai ? `<div class="row" style="margin-bottom:12px"><button class="btn btn-sm" data-act="grade">✨ Grade again with AI</button>${c.aiDraft && (c.review || c.reviewDraft) && !fromAi ? '<button class="btn btn-sm" data-sc="useai">Use the AI grade</button>' : ''}</div>` : ''}
        ${!c.noteSubmittedAt ? '<div class="warn-box" style="margin-bottom:12px">The trainee hasn\'t submitted the note yet: you\'re seeing what they typed so far.</div>' : ''}
        <div class="field"><label class="f">Verdict</label><select class="input" data-f="verdict"><option value="">Choose…</option>${VERDICTS.map((v) => `<option ${v === S.verdict ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <table class="list sheet edit"><thead><tr><th>Metric</th><th class="scorecol">Score</th></tr></thead><tbody>
        ${S.crit.map((x, i) => `<tr><td><b title="${esc(x.desc)}">${esc(x.name)}</b><div class="tiny muted">${esc(x.desc)}</div><textarea class="input fb" data-ev="${i}" rows="1" placeholder="Feedback">${esc(x.evaluation)}</textarea></td>
          <td><span class="dots" data-crit="${i}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" class="${x.score === n ? 'on' : ''}">${n}</button>`).join('')}<button type="button" data-n="0" class="na ${!x.score ? 'on' : ''}" title="Not applicable: doesn't count">n/a</button></span></td></tr>`).join('')}
        <tr class="avg"><td><b>WEIGHTED AVERAGE</b> <span class="tiny muted">(weights in ⚙️ Setup)</span></td><td><b class="mono" id="scAvg"></b> <span id="scPass"></span></td></tr>
        </tbody></table>
        <h4 style="margin-top:14px">The call's checklist</h4>
        ${S.goals.map((g, i) => `<div class="gm"><span class="seg" data-goal="${i}">${[['yes', '✓'], ['partly', '~'], ['no', '✗'], ['n/a', 'n/a']].map(([v, l]) => `<button type="button" data-v="${v}" class="${v === 'n/a' ? 'na' : v} ${g.met === v ? 'on' : ''}">${l}</button>`).join('')}</span><div style="flex:1">${esc(g.goal)}${g.evidence ? `<div class="tiny muted">${esc(g.evidence)}</div>` : ''}</div></div>`).join('')}
        <div class="field" style="margin-top:12px"><label class="f">Summary (the trainee reads this first)</label><textarea class="input" data-f="summary" rows="4">${esc(S.summary)}</textarea></div>
        <div class="field"><label class="f">The note</label><textarea class="input" data-f="note" rows="2">${esc(S.note)}</textarea></div>
        <div class="field"><label class="f">Next time (one per line)</label><textarea class="input" data-f="tips" rows="3">${esc(S.tips)}</textarea></div>
        <div class="row"><button class="btn" data-sc="save">💾 Save draft</button><button class="btn btn-orange" data-sc="send">📨 ${c.review && c.review.sentAt ? 'Update and resend' : 'Send to the trainee'}</button><span class="spacer"></span><span class="score-big" id="scPct" style="font-size:26px"></span></div>
      </div>`;
    const form = U.$('#scoreForm');
    const avg = () => {
      const sc = App.weighted(c.track, S.crit);
      U.$('#scAvg').textContent = sc ? `${sc.avg} / 5` : '–';
      U.$('#scPct').textContent = sc ? sc.pct + '%' : '';
      U.$('#scPass').innerHTML = passBadge(sc && sc.pct);
    };
    avg();
    const dirty = () => { form.dataset.dirty = '1'; };
    form.addEventListener('input', dirty);
    form.onclick = async (e) => {
      if (e.target.closest('[data-crit] button, [data-goal] button')) dirty();
      const dot = e.target.closest('[data-crit] button');
      if (dot) { const i = Number(dot.parentElement.dataset.crit); S.crit[i].score = Number(dot.dataset.n) || null; U.$$('button', dot.parentElement).forEach((x) => x.classList.toggle('on', x === dot)); avg(); return; }
      const seg = e.target.closest('[data-goal] button');
      if (seg) { const i = Number(seg.parentElement.dataset.goal); S.goals[i].met = seg.dataset.v; U.$$('button', seg.parentElement).forEach((x) => x.classList.toggle('on', x === seg)); return; }
      const b = e.target.closest('[data-sc]'); if (!b) return;
      const act = b.dataset.sc;
      if (act === 'useai') { c._useAi = true; drawScore(c, refresh); return; }
      read();
      const review = { verdict: S.verdict, summary: S.summary, note: S.note, tips: S.tips.split('\n').map((x) => x.trim()).filter(Boolean), criteria: S.crit.map((x) => ({ name: x.name, score: x.score, evaluation: x.evaluation })), goals: S.goals, send: act !== 'save' };
      if (act !== 'save' && !S.crit.some((x) => x.score)) return U.toast('Score the metrics (1 to 5, or n/a) before sending.', 'error');
      b.disabled = true;
      try { const r = await API.post('/api/call/update', { id: c.id, review }); c = r.call; U.toast(act === 'save' ? 'Draft saved.' : act === 'approve' ? 'AI grade approved and sent to the trainee.' : 'Review sent to the trainee.', 'ok'); drawScore(c, refresh); }
      catch (err) { U.toast(err.message, 'error'); b.disabled = false; }
    };
    U.$$('textarea.fb', form).forEach((ta) => { const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 200) + 'px'; }; ta.addEventListener('input', fit); setTimeout(fit, 0); });
    function read() {
      U.$$('[data-f]', form).forEach((el) => { S[el.dataset.f] = el.value; });
      U.$$('[data-ev]', form).forEach((el) => { S.crit[Number(el.dataset.ev)].evaluation = el.value; });
    }
  }

  /* ---------------- 📋 graded mock calls: the report and its CSV ---------------- */
  const G = { batch: '' };
  App.register('graded', {
    trainer: true,
    async render() {
      const app = U.$('#app');
      app.innerHTML = '<div class="card"><div class="empty">Loading the graded mock calls…</div></div>';
      let calls, ts;
      try { [calls, ts] = await Promise.all([API.post('/api/graded', { batch: G.batch }).then((r) => r.calls), API.post('/api/trainees').then((r) => r.trainees)]); }
      catch (e) { app.innerHTML = `<div class="card err-box">${esc(e.message)}</div>`; return; }
      const batches = [...new Set(ts.map((x) => x.batch).filter(Boolean))].sort();
      const tracks = Object.entries(App.cfg.tracks);
      const people = new Map();
      calls.slice().reverse().forEach((c) => {   // oldest first, so the last one kept per line is the latest
        const p = people.get(c.traineeId) || { name: c.traineeName, batch: c.batch, lines: {} };
        const l = p.lines[c.track] = p.lines[c.track] || { attempts: 0, latest: null };
        l.attempts++; l.latest = c;
        people.set(c.traineeId, p);
      });
      const pm = App.cfg.settings && App.cfg.settings.passMark;
      const cell = (l) => {
        if (!l) return '<td class="muted">–</td>';
        const c = l.latest;
        const icon = c.status === 'reviewed' ? '✅' : c.status === 'released' ? '🤖✅' : c.status === 'ai' ? '🤖' : '⏳';
        const cls = c.score != null && pm != null ? (c.score >= pm ? 'pass' : 'fail') : '';
        return `<td class="gcell ${cls}" data-open="${esc(c.id)}"><b>${c.score != null ? c.score + '%' : '–'}</b> <span title="${c.status === 'reviewed' ? 'Reviewed and sent' : c.status === 'released' ? 'AI grade released' : c.status === 'ai' ? 'AI grade, not approved yet' : 'Not graded yet'}">${icon}</span>${l.attempts > 1 ? `<div class="tiny muted">${l.attempts} attempts</div>` : ''}</td>`;
      };
      app.innerHTML = `<div class="card"><div class="card-head"><h2>📋 Graded mock calls</h2><span class="spacer"></span>
          <select class="input" id="gBatch" style="width:auto"><option value="">All batches</option>${batches.map((b) => `<option ${b === G.batch ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
          <button class="btn btn-orange" id="gCsv" ${calls.length ? '' : 'disabled'}>⬇ Export CSV</button></div>
        <p class="small muted">Each trainee's latest graded Reception, Calendar and Intake mock call, graded on the program's Mock Calls Metrics (the weighted average as a percentage). ✅ reviewed and sent · 🤖 the AI's grade, waiting for your approval · 🤖✅ AI grade released · ⏳ not graded yet.${pm != null ? ` Pass mark: ${pm}%.` : ' Set a pass mark in ⚙️ Setup to see pass / below.'} Click a score to open the call.</p>
        <div class="table-wrap"><table class="list graded"><thead><tr><th>Trainee</th><th>Batch</th>${tracks.map(([, t]) => `<th>${t.icon} ${esc(t.label)}</th>`).join('')}<th>Average</th></tr></thead><tbody>
          ${[...people.values()].sort((a, b) => a.batch.localeCompare(b.batch) || a.name.localeCompare(b.name)).map((p) => {
            const sc = tracks.map(([k]) => p.lines[k] && p.lines[k].latest.score).filter((x) => x != null);
            return `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.batch)}</td>${tracks.map(([k]) => cell(p.lines[k])).join('')}<td><b>${sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) + '%' : '–'}</b></td></tr>`;
          }).join('') || `<tr><td colspan="${tracks.length + 3}" class="empty">No graded mock calls yet. On the 🎛 Console, tick <b>📋 Graded mock call</b> before you ring.</td></tr>`}
        </tbody></table></div></div>
        ${calls.length ? `<div class="card"><h3>Every graded call</h3><div class="table-wrap"><table class="list"><thead><tr><th>When</th><th>Trainee</th><th>Line</th><th>Call</th><th>Weighted average</th><th>Status</th></tr></thead><tbody>
          ${calls.map((c) => `<tr class="click" data-open="${esc(c.id)}"><td>${U.when(c.createdAt)}</td><td><b>${esc(c.traineeName)}</b> <span class="tiny muted">${esc(c.batch)}</span></td><td>${App.trackBadge(c.track)}</td><td>${esc(c.title)}</td>
            <td>${c.avg != null ? `<b class="mono">${c.avg}</b> / 5 · ${c.score}%` : '–'}</td><td>${c.status === 'reviewed' ? '<span class="badge green">Reviewed</span>' : c.status === 'released' ? '<span class="badge green">AI grade released</span>' : c.status === 'ai' ? '<span class="badge amber">🤖 AI graded: approve</span>' : c.status === 'failed' ? '<span class="badge red">AI couldn\'t grade</span>' : '<span class="badge blue">Grading…</span>'}</td></tr>`).join('')}
        </tbody></table></div></div>` : ''}`;
      app.onclick = (e) => { const o = e.target.closest('[data-open]'); if (o) location.hash = '#/call/' + o.dataset.open; };
      app.onchange = (e) => { if (e.target.id === 'gBatch') { G.batch = e.target.value; App.views.graded.render(); } };
      U.$('#gCsv').onclick = () => downloadCsv(calls);
    }
  });

  // One row per graded call, with every metric's score and feedback (a sheet for the ranking reports).
  function downloadCsv(calls) {
    const names = [];
    ['reception', 'intake', 'calendar'].forEach((k) => (App.cfg.tracks[k].rubric || []).forEach((m) => { if (!names.includes(m.name)) names.push(m.name); }));
    const pm = App.cfg.settings && App.cfg.settings.passMark;
    const head = ['Date', 'Trainee', 'Batch', 'Line', 'Mock call', 'Trainer', 'Status', 'Weighted average (of 5)', 'Score %', ...(pm != null ? [`Pass (≥ ${pm}%)`] : []), 'Verdict', 'Summary'];
    names.forEach((n) => head.push(n + ' (score)', n + ' (feedback)'));
    const rows = calls.map((c) => {
      const by = Object.fromEntries((c.criteria || []).map((x) => [x.name, x]));
      const r = [new Date(c.createdAt).toISOString().slice(0, 16).replace('T', ' '), c.traineeName, c.batch, App.cfg.tracks[c.track].label, c.title, c.trainer,
        { reviewed: 'Reviewed', released: 'AI grade released', ai: 'AI grade (not approved)' }[c.status] || 'Not graded', c.avg != null ? c.avg : '', c.score != null ? c.score : '',
        ...(pm != null ? [c.score != null ? (c.score >= pm ? 'Pass' : 'Below') : ''] : []), c.verdict || '', c.summary || ''];
      names.forEach((n) => { const x = by[n]; r.push(x ? (x.score || 'n/a') : '', x ? x.evaluation || '' : ''); });
      return r;
    });
    const csv = [head, ...rows].map((r) => r.map((v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `Graded mock calls${G.batch ? ' - ' + G.batch : ''} - ${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
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

  /* ---------------- ⚙️ graded mock call settings ---------------- */
  function drawGradeSettings() {
    const el = U.$('#gradeSet'); if (!el) return;
    const st = App.cfg.settings || {};
    const w = st.weights || {};
    el.innerHTML = `<h2>📋 Graded mock calls and autograding</h2>
      <p class="small muted">Live calls are graded on the program's Mock Calls Metrics (Reception, Calendar Management, Intake), each 1 to 5 with feedback, and the grade is their weighted average. The AI grades from the call recording once the trainee submits the note (or 10 minutes after the call).</p>
      <div class="row" style="gap:18px;margin:8px 0 12px">
        <label class="check"><input type="checkbox" id="sAuto" ${st.autograde !== false ? 'checked' : ''} ${App.cfg.features.ai ? '' : 'disabled'}> Autograde every live call${App.cfg.features.ai ? '' : ' (needs the Gemini keys)'}</label>
        <label class="check"><input type="checkbox" id="sRelease" ${st.autoRelease ? 'checked' : ''}> Send AI grades to trainees without my approval</label>
        <label class="check"><input type="checkbox" id="sGraded" ${st.defaultGraded !== false ? 'checked' : ''}> New live calls start as 📋 graded</label>
        <label class="check">Pass mark <input class="input" id="sPass" type="number" min="1" max="100" style="width:80px" value="${st.passMark == null ? '' : st.passMark}" placeholder="none">%</label>
      </div>
      <details><summary class="small" style="cursor:pointer"><b>Metric weights</b> (1 = normal, 2 = counts double, 0 = left out)</summary>
        <div class="grid3" style="margin-top:10px">${Object.entries(App.cfg.tracks).map(([k, t]) => `<div><h4>${t.icon} ${esc(t.sheet)}</h4>${t.rubric.map((m) => `<div class="wrow"><span>${esc(m.name)}</span><input class="input" type="number" min="0" max="10" step="0.5" data-w="${k}" data-m="${esc(m.name)}" value="${(w[k] && w[k][m.name]) != null ? w[k][m.name] : 1}"></div>`).join('')}</div>`).join('')}</div>
      </details>
      <div class="row" style="margin-top:12px"><button class="btn btn-orange" id="sSave">Save</button><span class="small muted" id="sMsg"></span></div>`;
    U.$('#sSave').onclick = async () => {
      const weights = { reception: {}, calendar: {}, intake: {} };
      U.$$('[data-w]', el).forEach((i) => { weights[i.dataset.w][i.dataset.m] = Number(i.value); });
      const pass = U.$('#sPass').value.trim();
      try {
        await API.post('/api/settings/save', { settings: { autograde: U.$('#sAuto').checked, autoRelease: U.$('#sRelease').checked, defaultGraded: U.$('#sGraded').checked, passMark: pass === '' ? null : Number(pass), weights } });
        await App.reloadConfig();
        U.toast('Saved.', 'ok');
        drawGradeSettings();
      } catch (e) { U.toast(e.message, 'error'); }
    };
  }

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
        <div class="card" id="gradeSet" style="grid-column:1 / -1"></div>
        <div class="card"><h2>🧪 Test this computer</h2>
          <p class="small muted">Checks the microphone, and which ways this network can carry a call: direct (host), through the router (srflx) or through the TURN relay (relay). Trainees can run the mic check from their phone.</p>
          <div class="row"><button class="btn" id="tMic">🎙 Mic check</button><button class="btn" id="tNet">🌐 Network test</button></div><div id="netOut" class="small" style="margin-top:12px"></div></div></div>`;
      drawGradeSettings();
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
