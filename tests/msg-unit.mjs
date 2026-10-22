// 💬 The texting simulators (src/messaging.js): the Client Messaging threads a client starts and the
// Automated Messaging ones the firm's automation starts, their libraries, the automation's own
// schedule, the scorecard they keep, and the graded thread they send to the Portal's course as a
// messaging conversation (kind: 'message'). Run by tests/run.sh.
import { THREADS, CLIENT_THREADS, threadById, threadFromLink, traineeThread, traineeThreads, dueBeats, nextBeatAt, msgScore, cleanMsgGrade, msgGradePrompt, contactPrompt, msgProgramOk, msgRoleOk, roleProgram, lineOfThread, MSG_RUBRIC, MESSAGE_LINE, CLIENT_LINE, MESSAGE_ROLES } from '../src/messaging.js';
import { reportGradedCall } from '../src/portal.js';
import { CASES } from '../src/scenarios.js';

let bad = 0;
const fail = (what) => { bad++; console.log(`❌ ${what}`); };

/* ---------- the thread library ---------- */
if (THREADS.length < 3) fail(`the library should hold several threads, not ${THREADS.length}`);
const ids = new Set();
for (const t of THREADS) {
  if (ids.has(t.id)) fail(`two threads share the id ${t.id}`);
  ids.add(t.id);
  if (!t.title || !t.you || !t.facts || !t.hidden) fail(`${t.id} is missing part of its brief`);
  if (!(t.beats || []).length) fail(`${t.id} opens with nothing`);
  if (!(t.goals || []).length) fail(`${t.id} has no checklist`);
  if (t.kind === 'client') {
    // A Client Messaging thread is the client's own: no automation in it, and a program tab to sit on.
    if (t.beats.some((b) => b.from === 'auto')) fail(`${t.id} is a client thread with the automation in it`);
    if (!msgRoleOk(t.role)) fail(`${t.id} sits on no program tab: ${t.role}`);
    if (roleProgram(t.role) !== t.program) fail(`${t.id}'s tab and course program disagree: ${t.role} / ${t.program}`);
    if (lineOfThread(t) !== CLIENT_LINE) fail(`${t.id} should count on the Client Messaging line`);
  } else {
    if (!t.beats.some((b) => b.from === 'auto')) fail(`${t.id} has nothing from the automation`);
    if (lineOfThread(t) !== MESSAGE_LINE) fail(`${t.id} should count on the Automated Messaging line`);
  }
  // The beats are in order, so a later message never lands before an earlier one.
  let last = -1;
  for (const b of t.beats) { if (Number(b.after) < last) fail(`${t.id}'s automation is out of order`); last = Number(b.after); }
  // A thread about a case file has to name one the firm actually has.
  if (t.caseId && !CASES[t.caseId]) fail(`${t.id} names a case that isn't on file: ${t.caseId}`);
  if (!msgProgramOk(t.program)) fail(`${t.id} counts in no course program: ${t.program}`);
}

/* ---------- what a trainee may see ---------- */
const hidden = THREADS.find((t) => (t.hideCases || []).includes(t.caseId));
for (const t of THREADS) {
  const v = traineeThread(t);
  const json = JSON.stringify(v);
  if (json.includes(t.hidden.slice(0, 40))) fail(`${t.id} shows the contact's persona to the trainee`);
  if ((t.goals || []).some((g) => json.includes(g.slice(0, 30)))) fail(`${t.id} shows its checklist to the trainee`);
}
if (hidden && traineeThread(hidden).caseId) fail('a thread that hides its case file still names it to the trainee');
if (traineeThreads().length !== THREADS.length) fail('the picker does not list every thread');

/* ---------- a Portal link ---------- */
if (!threadFromLink(THREADS[0].id)) fail('a link to a real thread should open it');
if (threadFromLink('AM_REMINDER') !== threadById('am_reminder')) fail('a link should not care about letter case');
if (threadFromLink('../etc/passwd') || threadFromLink('') || threadFromLink(null)) fail('a link should open nothing but a thread in the library');

/* ---------- the automation's schedule ---------- */
const t0 = THREADS[0], opened = 1000000;
if (dueBeats(t0, opened, 0, opened).length !== 1) fail('the first automated message should land as the thread opens');
if (dueBeats(t0, opened, 0, opened + 1000).length !== 1) fail('a beat should wait for its own time');
const all = dueBeats(t0, opened, 0, opened + 10 * 60000);
if (all.length !== t0.beats.length) fail(`every beat should have landed after ten minutes, not ${all.length}`);
if (all.some((b) => !['auto', 'contact'].includes(b.who))) fail('a beat landed from nobody');
if (dueBeats(t0, opened, t0.beats.length, opened + 10 * 60000).length) fail('a beat should never land twice');
if (nextBeatAt(t0, opened, 0) !== opened) fail('the next beat is the first one');
if (nextBeatAt(t0, opened, t0.beats.length) !== 0) fail('a finished sequence has no next beat');
// The automation keeps sending whether or not the trainee replied: that is what makes it automated.
const late = dueBeats(t0, opened, 1, opened + 10 * 60000);
if (!late.length) fail('the automation should go on sending after its first message');

/* ---------- the scorecard ---------- */
if (msgScore([]) !== null) fail('a thread with nothing scored has no percentage');
if (msgScore([{ score: 5 }, { score: 4 }, { score: null }]).pct !== 90) fail('a null metric should not count against the score');
if (msgScore([{ score: 3 }, { score: 3 }]).pct !== 60) fail('three out of five is 60%');

const model = {
  verdict: 'Good, with Improvements Needed.', summary: 'A summary.',
  criteria: MSG_RUBRIC.map((r, i) => ({ name: r.name, score: i === 0 ? null : 4, evaluation: 'Specific feedback.' })),
  goals: t0.goals.map(() => ({ met: 'yes', evidence: 'Quoted.' })),
  tips: ['Ask for the date of birth first.']
};
const clean = cleanMsgGrade(t0, model);
if (!clean || clean.criteria.length !== MSG_RUBRIC.length) fail('the scorecard should hold every metric of the sheet');
if (clean.criteria[0].score !== null || clean.criteria[1].score !== 4) fail('the scorecard should keep the model\'s own scores');
if (clean.goals.length !== t0.goals.length || clean.goals[0].goal !== t0.goals[0]) fail('the checklist should come back as it was written');
if (cleanMsgGrade(t0, { criteria: [] })) fail('an answer with no score at all should be refused');
if (cleanMsgGrade(t0, null) || cleanMsgGrade(t0, 'nope')) fail('an unreadable answer should be refused');
// A model that renames or reorders the metrics is still read onto the sheet.
const shuffled = cleanMsgGrade(t0, Object.assign({}, model, { criteria: model.criteria.slice().reverse().map((c) => Object.assign({}, c, { name: c.name.toUpperCase() })) }));
if (!shuffled || shuffled.criteria[0].name !== MSG_RUBRIC[0].name) fail('the sheet should keep its own order and names');
// A made-up checklist item can't get onto the scorecard.
const invented = cleanMsgGrade(t0, Object.assign({}, model, { goals: [{ goal: 'Something nobody asked for', met: 'yes' }] }));
if (invented.goals.some((g) => g.goal === 'Something nobody asked for')) fail('the model should not be able to invent a checklist item');

/* ---------- what the AI is told ---------- */
const cp = contactPrompt(t0);
if (!cp.includes(t0.hidden)) fail('the contact should be told who they are');
if (!/never say you are an AI/i.test(cp)) fail('the contact should be told to stay in character');
const gp = msgGradePrompt(t0, { openedAt: 0, turns: [{ who: 'auto', text: 'Reminder.', at: 0 }, { who: 'trainee', text: 'Hello.', at: 30000 }], sent: 1, secs: 120, firstReplySec: 30 });
if (!gp.prompt.includes('AUTOMATION: Reminder.') || !gp.prompt.includes('TRAINEE: Hello.')) fail('the scorer should be given the thread itself');
if (!gp.prompt.includes('[+30s]')) fail('the scorer should be told how long the trainee took');
if (!MSG_RUBRIC.every((r) => gp.prompt.includes(r.name))) fail('the scorer should be given every metric');
if (!gp.prompt.includes(t0.goals[0])) fail('the scorer should be given the thread\'s checklist');

/* ---------- a graded thread in the trainee's course ----------
   It goes to the same /api/call-results the Call Simulator posts to, with kind: 'message', so the
   Portal files it as its 💬 Client Messaging simulator on the Automated Messaging line. */
const realFetch = globalThis.fetch;
let sent = null;
globalThis.fetch = async (url, opts) => { sent = { url: String(url), opts }; return { ok: true, status: 200, json: async () => ({ success: true, course: 'EA' }) }; };
const env = { PORTAL_URL: 'https://portal.example', AI_GATEWAY_SECRET: 'gateway-secret' };
const thread = { id: 'T1', program: 'EA', line: MESSAGE_LINE, lesson: null, title: t0.title, score: 88, verdict: 'Good.', secs: 300, voice: '', at: new Date().toISOString() };
const res = await reportGradedCall(env, { first: 'Jamie', last: 'Cruz', batch: 'B100626', username: 'jamie-cruz--b100626', kind: 'message', call: thread });
if (!res.ok) fail(`a graded thread should reach the Portal: ${JSON.stringify(res)}`);
if (!sent || sent.url !== 'https://portal.example/api/call-results') fail(`a graded thread should go to the Portal's call results: ${sent && sent.url}`);
else {
  const b = JSON.parse(sent.opts.body);
  if (b.kind !== 'message') fail(`the Portal should be told this is a messaging conversation, not a call: ${b.kind}`);
  if (b.via !== 'ringchannel' || b.call.line !== MESSAGE_LINE || b.call.program !== 'EA' || b.call.score !== 88) fail(`what the Portal was told: ${sent.opts.body}`);
}
// A call still goes as a call, however it is asked for.
sent = null;
await reportGradedCall(env, { first: 'Jamie', last: 'Cruz', kind: 'something-else', call: Object.assign({}, thread, { line: 'Reception Mock Calls' }) });
if (!sent || JSON.parse(sent.opts.body).kind !== 'call') fail('anything but a messaging conversation should go to the Portal as a call');
globalThis.fetch = realFetch;

if (bad) process.exit(1);
console.log(`✅ The texting simulators: ${THREADS.length} threads (${CLIENT_THREADS.length} of them Client Messaging), the automation's schedule, ${MSG_RUBRIC.length} metrics, the scorecard, and a graded thread in the Portal's course`);

/* ---------- 💬 Client Messaging: the threads a client starts ---------- */
if (CLIENT_THREADS.length < 6) fail(`the Client Messaging library should cover its program tabs, not ${CLIENT_THREADS.length} threads`);
for (const r of MESSAGE_ROLES) if (!CLIENT_THREADS.some((t) => t.role === r)) fail(`no Client Messaging thread for the ${r} tab`);
if (CLIENT_THREADS.some((t) => t.kind !== 'client')) fail('a Client Messaging thread is not marked as one');
if (!CLIENT_THREADS.every((t) => THREADS.includes(t))) fail('the library does not hold every Client Messaging thread');
if (msgRoleOk('RECEPTION') !== 'reception') fail('a tab name should not care about letter case');
if (msgRoleOk('../x') || msgRoleOk('') || msgRoleOk(null)) fail('an unknown tab should be dropped');
if (roleProgram('md') !== 'MD' || roleProgram('reception') !== 'FT' || roleProgram('nope')) fail('a tab counts in the wrong course');
// The client texts first, and the AI is never told an automation opened the thread.
const ct = CLIENT_THREADS[0];
if (ct.beats[0].from !== 'contact') fail('a Client Messaging thread should open with the client\'s own text');
const cPrompt = contactPrompt(ct);
if (/automated messaging system texted you first/.test(cPrompt)) fail('the AI client is told an automation opened a thread it started itself');
if (!/You texted the firm yourself/.test(cPrompt)) fail('the AI client is not told it texted the firm');
if (/AUTOMATION is the firm/.test(msgGradePrompt(ct, { turns: [], sent: 0, secs: 60 }).prompt)) fail('the scorer is told about an automation that was never on the thread');
if (!/client messaging/.test(msgGradePrompt(ct, { turns: [], sent: 0, secs: 60 }).prompt)) fail('the scorer is not told which simulator it is grading');
if (traineeThread(ct).kind !== 'client' || traineeThread(ct).role !== ct.role) fail('the picker cannot tell the two simulators apart');
