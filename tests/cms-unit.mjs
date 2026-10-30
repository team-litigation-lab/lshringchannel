/* 🔁 Ring Channel's calls are the CMS's (src/cms/call-packs.js, mirrored by scripts/sync-cms-calls.mjs):
   every CMS call is on the Scenario Picker with the same caller, script, goals and case file, and nothing else is. */
import CMS from '../src/cms/call-packs.js';
import { SCENARIOS, CASES, TRACKS, LINES, lineOf, trackOfLine, traineeView, courseCall, cleanScenario, PROGRAM_TABS } from '../src/scenarios.js';
import { callerPrompt, gradePrompt } from '../src/prompts.js';

const fails = [];
const fail = (m) => fails.push(m);
const byId = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

if (SCENARIOS.length !== CMS.CALLS.length) fail(`${SCENARIOS.length} calls on Ring Channel, ${CMS.CALLS.length} in the CMS`);
for (const c of CMS.CALLS) {
  const s = byId[c.id];
  if (!s) { fail(`the CMS's call ${c.id} (${c.title}) isn't on Ring Channel`); continue; }
  if (s.title !== c.title || s.level !== c.level || s.opening !== c.opening || s.facts !== c.facts) fail(`${c.id}: its title, level, opening or situation isn't the CMS's`);
  if (JSON.stringify(s.goals) !== JSON.stringify(c.goals)) fail(`${c.id}: its goals aren't the CMS's`);
  if (!s.hidden.startsWith(c.hidden)) fail(`${c.id}: the caller's script isn't the CMS's`);
  if (s.caller.name !== c.name || s.caller.role !== c.role) fail(`${c.id}: the caller isn't the CMS's`);
  if (s.program !== c.program || s.cmsLine !== c.line) fail(`${c.id}: not on the CMS's program and line`);
  if (!TRACKS[s.track] || s.track !== trackOfLine(c.line)) fail(`${c.id}: graded on no Mock Calls Metrics`);
  if (!LINES[lineOf(s.track)]) fail(`${c.id}: rings on no line`);
  // the case file: the Training Library file (FT) or the program's case summary, with the CMS's text
  if (c.doc && (!CASES[c.doc] || CASES[c.doc].text !== CMS.DOCS[c.doc].text || s.caseId !== c.doc)) fail(`${c.id}: its case file ${c.doc} isn't the CMS's`);
  if (c.case && (!s.caseId || CASES[s.caseId].text !== CMS.CASES[c.case].text)) fail(`${c.id}: its ${c.case} case summary isn't the CMS's`);
  if (/your brief|below it/.test(s.you)) fail(`${c.id}: the trainee's brief still points at the CMS's page: ${s.you}`);
  if (!s.caller.idName || !/^\(555\) 010-\d{4}$/.test(s.caller.number)) fail(`${c.id}: no caller ID`);
  for (const k of [...s.hideCases, s.reference].filter(Boolean)) if (!CASES[k]) fail(`${c.id}: no case file ${k}`);
  const t = traineeView(s);
  if (t.program !== c.program || t.line !== lineOf(s.track) || 'hidden' in t || 'goals' in t) fail(`${c.id}: the trainee's view is wrong`);
}
// the AI caller: an outbound call (the trainee places it in the CMS) answers the phone; the others ring the firm
const out = SCENARIOS.find((s) => s.dir === 'out'), inb = byId.ft_rc_appt;
if (!out) fail('no outbound call (the CMS has calls the trainee places)');
else if (!/picked up/.test(callerPrompt(out)) || /phoning LSH Training Law Group/.test(callerPrompt(out))) fail('an outbound call\'s AI caller doesn\'t answer the phone');
if (!/phoning LSH Training Law Group/.test(callerPrompt(inb))) fail('a Standard Training caller doesn\'t phone the firm');
// the grader: another program's line brings what the CMS weighs on it
const cm = SCENARIOS.find((s) => s.program === 'CM' && s.focus.length);
if (!cm || !gradePrompt(cm, { metrics: {}, note: {} }, {}).prompt.includes('WHAT THE CMS WEIGHS ON THIS LINE')) fail('another program\'s call isn\'t graded with its CMS line');
if (gradePrompt(inb, { metrics: {}, note: {} }, {}).prompt.includes('WHAT THE CMS WEIGHS')) fail('a Standard Training call has a CMS line focus');
// a graded call counts where the CMS counts it: Standard Training by its lesson, the others by their CMS line
const sc = JSON.stringify(courseCall('reception', 'CM', 'Adjusters & Carriers'));
if (sc !== JSON.stringify({ program: 'CM', line: 'Adjusters & Carriers', lesson: null })) fail(`a CM call counts as ${sc}`);
if (courseCall('calendar', 'FT', 'Calendar Management Mock Calls').lesson !== 5) fail('a Standard Training call lost its lesson');
// a trainer's copy keeps the call's program, CMS line and direction
const copy = cleanScenario(Object.assign({}, out, { id: undefined }));
if (copy.program !== out.program || copy.cmsLine !== out.cmsLine || copy.dir !== 'out') fail('a copy of a CMS call lost its program');
if (PROGRAM_TABS.map((p) => p.k).join() !== 'FT,CM,PD,EA' || PROGRAM_TABS.some((p) => !p.icon || !p.short)) fail(`the program tabs: ${JSON.stringify(PROGRAM_TABS)}`);

if (fails.length) { console.error('CMS calls test FAILED:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log(`CMS calls test passed (${SCENARIOS.length} calls, the CMS's: ${PROGRAM_TABS.map((p) => `${p.k} ${SCENARIOS.filter((s) => s.program === p.k).length}`).join(' · ')}; the same callers, scripts, goals and case files; outbound calls answered; graded and counted on the CMS's lines).`);
