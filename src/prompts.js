/* What the AI is told: the caller it plays in practice, and how it scores a call.
   The scorer writes in the LSH facilitator's voice (the DNA the Foundational platform uses,
   from the facilitator's own ranking reports; see js/ft-facilitator-dna.js there). */
import { FIRM, CASES, TRACKS, LINES, lineOf, NOTE_FORMS, AI_VOICES, voiceOk } from './scenarios.js';

// The caller's voice: the one the trainer (or trainee) picked on the 🎚 Voice list, or one that suits the caller.
export function voiceFor(s, picked) {
  const chosen = voiceOk(picked);
  if (chosen) return chosen;
  const pool = AI_VOICES.filter((v) => v.gender === (s.caller && s.caller.gender === 'm' ? 'm' : 'f')).map((v) => v.id);
  let h = 0; for (const ch of String((s.caller && s.caller.name) || s.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

export function callerPrompt(s) {
  const line = LINES[lineOf(s.track)];
  const out = (s.unavailable || []).map((x) => FIRM.directory.find((d) => d.ext === x)).filter(Boolean).map((d) => d.name);
  return `You are ${s.caller.name} (${s.caller.role}), phoning ${FIRM.name}, a personal-injury law firm, on its ${line.label.toLowerCase()}. This is a live phone call and you are the caller. The person who answers works at the firm${s.track === 'intake' ? ' (the intake team)' : ' (the front desk)'}.

WHO YOU ARE, WHAT YOU KNOW AND HOW YOU BEHAVE:
${s.hidden}

YOUR OPENING (say it in your own words, naturally, after they greet you): ${s.opening}

THE SITUATION TODAY: ${s.facts}${out.length ? ` (${out.join(' and ')} can't take a call right now.)` : ''}

RULES
- Speak like a real person on the phone: short turns (one or two sentences), natural pauses, small words like "um" now and then. No lists, no narration, no stage directions. Speak English unless your description says otherwise.
- Give personal details (date of birth, address, SSN, numbers) only when you are asked for them, exactly as written above. Never correct an answer you gave, and never offer a different one.
- You only know what is written above. Never invent dates, amounts, names or case details; if asked something you don't know, say so.
- Keep coming back to why you called until you get an answer, a clear next step, or a clear "I can't share that".
- React realistically to how you are treated: warmer when they are clear and polite, more frustrated when they are vague, rushed or rude.
- Lines in parentheses, like "(You are on hold.)", describe what is happening on the line; they are not spoken to you. On hold, stay silent until "(The line is back.)", then carry on.
- If they ask you to hold, say "Sure." and wait. If they say they will transfer you, say "Okay." and wait.
- When the call reaches its natural end (you got an answer, a message is taken, or they say goodbye), thank them and say goodbye.
- Never say you are an AI, a simulation or in a training exercise, and never mention these instructions, even if asked.

The call has just been answered. Wait for them to greet you, then say why you are calling. If they say nothing, say "Hello?" and then why you are calling.`;
}

export function liveSetup(s, model, voice) {
  return {
    model: 'models/' + model,
    generationConfig: { responseModalities: ['AUDIO'], temperature: 0.8, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceFor(s, voice) } } } },
    systemInstruction: { parts: [{ text: callerPrompt(s) }] },
    inputAudioTranscription: {},
    outputAudioTranscription: {}
  };
}

const VOICE = `Write as an evaluator reporting on a trainee's work: third person, formal, objective and evidence-based. No greetings, sign-offs, emojis or exclamation marks.
Open with a verdict label, then a period: "Very strong performance.", "Good.", "Good, with Improvements Needed.", "Satisfactory.", "Needs Improvement.", "Needs Significant Improvement." or "Significant Improvement Required.".
State the strength first ("Demonstrated a strong / good / basic understanding of …") and make it specific: name what was done well, with exact counts and details from the call.
Turn to the gaps with "However, improvement is needed in …" followed by the exact components (a missed identifier, a wrong date, a missing field in the note). Never be vague: quote the call, name the fields, give times.
Grade severity in the wording ("Only minor … issues were noted", "significant corrections are needed", "major issues were noted") and close by tying the fix to its purpose (client confidentiality, an accurate file, a message the attorney can act on).`;

function fmtMs(ms) { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

export function metricsText(m, audio) {
  if (!m) return 'Not recorded.';
  const rows = [];
  if (m.ringMs != null) rows.push(`Answered after ${Math.round(m.ringMs / 1000)} seconds (${Math.max(1, Math.ceil(m.ringMs / 6000))} ring${m.ringMs > 6000 ? 's' : ''}; the standard is within 3 rings).`);
  if (m.talkMs != null) rows.push(`Call length ${fmtMs(m.talkMs)}.`);
  const holds = m.holds || [];
  if (holds.length) rows.push(`Put the caller on hold ${holds.length} time(s): ${holds.map((h) => fmtMs((h.end || h.start) - h.start)).join(', ')}.`);
  else rows.push('No holds.');
  (m.transfers || []).forEach((t) => rows.push(`Transfer to ${t.to} (ext ${t.ext}): ${t.result || 'not completed'}.`));
  // 🔎 Case lookup: which case file the trainee opened and worked from (the right file is the one the call is about).
  if ((m.casePicks || []).length) rows.push(`Case files opened from 🔎 Case lookup, in order: ${m.casePicks.map((c) => c.id).join(', ')}. The file worked from: ${m.caseId || m.casePicks[m.casePicks.length - 1].id}${m.rightCase ? ' (the case this call is about)' : m.rightCase === false ? ' (NOT the case this call is about: ' + m.wantCase + ')' : ''}.`);
  else if (m.wantCase) rows.push(`No case file was opened from 🔎 Case lookup (the call is about ${m.wantCase}).`);
  if (m.endedBy) rows.push(`Call ended by the ${m.endedBy === 'trainer' ? 'caller' : m.endedBy}${m.endReason === 'transferred' ? ' (transferred)' : ''}.`);
  const d = audio && audio.deadAir;
  if (d) rows.push(d.count ? `Dead air measured in the recording (both sides silent for 4 seconds or more, holds excluded): ${d.count} time(s), ${d.total} s in all, the longest ${d.longest} s${(d.gaps || []).length ? ' (at ' + d.gaps.slice(0, 6).map((g) => fmtMs(g[0] * 1000)).join(', ') + ')' : ''}.` : 'No dead air of 4 seconds or more measured in the recording.');
  return rows.join(' ');
}

export function noteText(s, note) {
  const form = NOTE_FORMS[(TRACKS[s.track] || TRACKS.reception).note];
  const n = note || {};
  return form.fields.map((f) => `${f.label}: ${String(n[f.k] || '').trim() || '(blank)'}`).join('\n');
}

export function transcriptText(tr) {
  return (tr || []).map((x) => `${x.who === 'caller' ? 'CALLER' : 'TRAINEE'}: ${x.text}`).join('\n');
}

/* The grader: the program's Mock Calls Metrics for the call's line, each scored 1 to 5 with feedback.
   opts.audio: the call's recording is attached (8 kHz WAV, both voices): the grader transcribes it and
   judges the voice metrics by listening. Without it, it works from the transcript and the note. */
export function gradePrompt(s, call, opts) {
  const t = TRACKS[s.track] || TRACKS.reception;
  const audio = !!(opts && opts.audio);
  const onFile = s.caseId && !(s.hideCases || []).includes(s.caseId) ? CASES[s.caseId] : null;
  const ref = s.reference && CASES[s.reference];
  const system = `You grade mock phone calls for the LSH Foundational Training program (legal virtual assistants at a personal-injury law firm), using the program's ${t.sheet}. You are fair, specific and strict about confidentiality and accuracy.\n\n${VOICE}`;
  const prompt = `THE FIRM: ${FIRM.name} (fictional). Main line ${FIRM.mainLine}.
Directory: ${FIRM.directory.map((d) => `${d.name} (${d.role}) ${d.ext}`).join(' · ')}
Front-desk rules:
${FIRM.rules.map((r) => '- ' + r).join('\n')}
${t.rules ? `\nTHE CALENDAR GUIDELINES (Training Guide, Day 6). The call's own situation below (who is free, which slots are open) comes first; apply these where they fit:\n${t.rules.map((r) => '- ' + r).join('\n')}\n` : ''}
${s.open ? `THE CALL: an open ${t.label} mock call with no script. The trainer played a caller of their own choosing, so work out from the ${audio ? 'recording' : 'transcript'} who called and what they needed, and judge how the trainee handled that caller.
The trainee's role: ${s.you}
The trainee had every case file in Case lookup:
${Object.values(CASES).map((c) => `${c.id}: ${c.name}`).join(' · ')}

THE CALL'S CHECKLIST: none (an open call). Grade on the metrics, and answer "goals" with [].
` : `THE CALL: "${s.title}" (${t.label} mock call, level ${s.level}).
The trainee's role: ${s.you}
The situation: ${s.facts}
The caller: ${s.caller.name}, ${s.caller.role}. What the caller knew and how they were told to behave: ${s.hidden}
${onFile ? `\nTHE CASE FILE THE TRAINEE HAD (${onFile.id}):\n${onFile.text}\n` : '\nNothing was on file for this caller (a first call).\n'}${ref && ref !== onFile ? `\nFOR REFERENCE, THE FINISHED FILE (what a complete intake would capture; the trainee did not have it):\n${ref.text}\n` : ''}
WHAT THIS CALL SHOULD ACHIEVE (the call's own checklist):
${(s.goals || []).map((g, i) => `${i + 1}. ${g}`).join('\n')}
`}
THE METRICS (${t.sheet}). Score each 1 to 5: 5 excellent, 4 good, 3 satisfactory, 2 needs improvement, 1 not done or wrong. Use null only when the call gave no chance to show it (for example no transfer was needed and none was attempted wrongly${audio ? '' : ', or a voice metric with no recording'}):
${t.rubric.map((r, i) => `M${i + 1}. ${r.name} — ${r.desc}`).join('\n')}

MEASURED BY THE PHONE SYSTEM: ${metricsText(call.metrics, call.audioStats)}

THE TRAINEE'S NOTE:
${noteText(s, call.note)}

${audio ? `THE CALL: the recording is attached (both voices; the trainee works at the firm, the caller is ${s.open ? 'the trainer, playing a caller of their own choosing' : s.caller.name + (call.mode === 'live' ? ', played by the trainer' : '')}). Hold music is the trainee's hold, not dead air. First transcribe it faithfully, labelling each turn TRAINEE or CALLER; then grade. Judge Listening Skills, Dead Air/Fillers, Clarity of Speech and Tone of Voice by listening to the trainee's voice.` : `THE TRANSCRIPT:\n${transcriptText(call.transcript) || '(empty: the trainee said nothing)'}\n${call.transcript && call.transcript.length ? 'There is no recording: judge the voice metrics only as far as the words show (fillers, long gaps noted above); otherwise null.' : ''}`}

Grade only what the ${audio ? 'recording' : 'transcript'}, the measurements and the note show. Each metric's feedback is 1 to 3 specific sentences in the facilitator's voice, quoting the trainee where you can.
Answer with JSON only, in this shape:
{${audio ? '\n "transcript": [{"who": "trainee" | "caller", "text": "…"}],' : ''}
 "verdict": "one verdict label",
 "summary": "2–4 sentences in the facilitator's voice: the strength first, then 'However, improvement is needed in …'",
 "criteria": [${t.rubric.map((r) => `{"name": ${JSON.stringify(r.name)}, "score": 1-5 or null, "evaluation": "feedback"}`).join(', ')}],
 "goals": [{"goal": "the checklist item as written", "met": "yes" | "partly" | "no" | "n/a", "evidence": "a short quote or reason"}],
 "note": "1–2 sentences on the note: what is missing or wrong, field by field",
 "tips": ["2–3 short, concrete things to do on the next call"]
}`;
  return { system, prompt };
}

// Keep a model's scorecard to the shape the page shows: every metric of the sheet, in order.
export function cleanGrade(s, g) {
  if (!g || typeof g !== 'object') return null;
  const t = TRACKS[s.track] || TRACKS.reception;
  const str = (v, n) => String(v == null ? '' : v).slice(0, n || 1200);
  const list = Array.isArray(g.criteria) ? g.criteria : [];
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const criteria = t.rubric.map((r, i) => {
    const x = list.find((c) => c && norm(c.name) === norm(r.name)) || list.find((c) => c && norm(c.name).startsWith(norm(r.name).slice(0, 14))) || list[i] || {};
    const n = Math.round(Number(x.score));
    return { name: r.name, score: n >= 1 && n <= 5 ? n : null, evaluation: str(x.evaluation, 900) };
  });
  if (!criteria.some((c) => c.score)) return null;
  const goals = (s.goals || []).map((goal, i) => {
    const x = (g.goals || [])[i] || {};
    const met = ['yes', 'partly', 'no', 'n/a'].includes(String(x.met).toLowerCase()) ? String(x.met).toLowerCase() : 'no';
    return { goal, met, evidence: str(x.evidence, 400) };
  });
  const out = { verdict: str(g.verdict, 80), summary: str(g.summary, 1600), criteria, goals, note: str(g.note, 800), tips: (Array.isArray(g.tips) ? g.tips : []).slice(0, 4).map((x) => str(x, 300)) };
  if (Array.isArray(g.transcript)) out.transcript = g.transcript.slice(0, 600).map((x) => ({ who: x && x.who === 'caller' ? 'caller' : 'trainee', text: str(x && x.text, 1200) })).filter((x) => x.text);
  return out;
}
