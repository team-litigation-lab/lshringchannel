// The LSH Training Portal's ticket, checked with the shared secret (src/portal.js verifyLocal), and the graded calls
// Ring Channel sends back to the Portal's course (reportGradedCall, the Call Simulator integration): run by tests/run.sh.
import { createHmac } from 'node:crypto';
import { verifyLocal, reportGradedCall, splitName } from '../src/portal.js';
import { courseCall, trackFromLink, programOk } from '../src/scenarios.js';

const SECRET = 'shared-secret';
const sign = (body, secret = SECRET) => {
  const p = Buffer.from(JSON.stringify(body)).toString('base64url');
  return p + '.' + createHmac('sha256', 'portal-sso:' + secret).update(p).digest('base64url');
};
const soon = Date.now() + 4 * 60000;
const cases = [
  ['a trainee\'s ticket', sign({ first: 'Ana María', last: 'Lopez', b: 'B100626', exp: soon }), (r) => r.ok && r.first === 'Ana María' && r.last === 'Lopez' && r.batch === 'B100626'],
  ['an administrator\'s ticket', sign({ r: 'a', n: 'Coach Ana', exp: soon }), (r) => r.ok && r.admin && r.name === 'Coach Ana' && r.sig && r.exp === soon],
  ['another secret', sign({ first: 'A', last: 'B', b: 'B1', exp: soon }, 'other'), (r) => !r.ok && r.code === 'signature'],
  ['an expired ticket', sign({ first: 'A', last: 'B', b: 'B1', exp: Date.now() - 1000 }), (r) => !r.ok && r.code === 'expired'],
  ['a ticket good for too long', sign({ first: 'A', last: 'B', b: 'B1', exp: Date.now() + 3600000 }), (r) => !r.ok && r.code === 'expired'],
  ['a tampered ticket', sign({ first: 'A', last: 'B', b: 'B1', exp: soon }).replace(/^./, 'x'), (r) => !r.ok],
  ['no ticket', '', (r) => !r.ok && r.code === 'format']
];
let bad = 0;
for (const [what, t, okay] of cases) {
  const r = await verifyLocal(SECRET, t);
  if (!okay(r)) { bad++; console.log(`❌ ${what}: ${JSON.stringify(r)}`); }
}
if (bad) process.exit(1);
console.log(`✅ Portal tickets with the shared secret: ${cases.length} cases (trainee, admin, wrong secret, expired, too long, tampered, none)`);

/* 📞 The Call Simulator is Ring Channel's: a graded call counts in the trainee's course, so it goes to the Portal's
   /api/call-results with the program, the line and (Standard Training) the lesson the course counts it in. */
const line = (t, l) => trackFromLink(t, l);
const lineCases = [
  ['?track=calendar', line('calendar', ''), 'calendar'],
  ['a course\'s ?line=', line('', 'Calendar Management Mock Calls'), 'calendar'],
  ['an older ?flow=calendaring', line('calendaring', ''), 'calendar'],
  ['the intake line', line('', 'Intake Mock Calls'), 'intake'],
  ['the reception line', line('reception', ''), 'reception'],
  ['nothing to go on', line('', ''), '']
];
for (const [what, got, want] of lineCases) if (got !== want) { bad++; console.log(`❌ the line a Call Simulator link asks for (${what}): ${got || '(none)'} (expected ${want || 'none'})`); }
const course = [
  ['Standard Training counts a call by its lesson', courseCall('calendar', 'FT'), { program: 'FT', line: 'Calendar Management Mock Calls', lesson: 5 }],
  ['Reception is lesson 4', courseCall('reception', 'FT'), { program: 'FT', line: 'Reception Mock Calls', lesson: 4 }],
  ['Intake is lesson 6', courseCall('intake', 'ft'), { program: 'FT', line: 'Intake Mock Calls', lesson: 6 }],
  ['another program counts it by its line', courseCall('intake', 'EA'), { program: 'EA', line: 'Intake Mock Calls', lesson: null }],
  ['no program named: Standard Training', courseCall('reception', 'nonsense'), { program: 'FT', line: 'Reception Mock Calls', lesson: 4 }]
];
for (const [what, got, want] of course) if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`❌ ${what}: ${JSON.stringify(got)}`); }
if (programOk('pd') !== 'PD' || programOk('XX') !== '') { bad++; console.log(`❌ the programs a call can count in: ${programOk('pd')} / ${programOk('XX')}`); }
if (splitName('Jamie Cruz').last !== 'Cruz' || splitName('Jamie') !== null) { bad++; console.log('❌ the trainee\'s name as the Portal wants it'); }

// The call itself: the Portal's shared gateway secret, its address, and nothing sent without the secret.
const realFetch = globalThis.fetch;
let sent = null;
globalThis.fetch = async (url, opts) => { sent = { url: String(url), opts }; return new Response(JSON.stringify({ success: true, course: { key: 'ft:callsim:jamie-cruz--b100526' } }), { headers: { 'Content-Type': 'application/json' } }); };
const call = Object.assign({ id: '260401-abcd1234', title: 'A Client Lost Her Appointment Card', score: 84, verdict: 'Met the line', secs: 212, voice: 'voice', at: new Date().toISOString() }, courseCall('reception', 'FT'));
const env = { PORTAL_URL: 'https://portal.example', AI_GATEWAY_SECRET: 'gateway-secret' };
const ok = await reportGradedCall(env, { first: 'Jamie', last: 'Cruz', batch: 'B100526', username: 'jamie-cruz--b100526', call });
if (!ok.ok || !ok.course) { bad++; console.log(`❌ a graded call to the Portal: ${JSON.stringify(ok)}`); }
if (!sent || sent.url !== 'https://portal.example/api/call-results' || sent.opts.headers['X-Gateway-Key'] !== 'gateway-secret') { bad++; console.log(`❌ where the graded call went: ${sent && sent.url}`); }
else { const b = JSON.parse(sent.opts.body); if (b.call.program !== 'FT' || b.call.lesson !== 4 || b.call.line !== 'Reception Mock Calls' || b.call.score !== 84 || b.first !== 'Jamie') { bad++; console.log(`❌ what the Portal was told: ${sent.opts.body}`); } }
sent = null;
const noSecret = await reportGradedCall({ PORTAL_URL: 'https://portal.example' }, { first: 'Jamie', last: 'Cruz', call });
if (noSecret.ok || noSecret.code !== 'no-secret' || sent) { bad++; console.log(`❌ with no AI_GATEWAY_SECRET the call should stay here: ${JSON.stringify(noSecret)}`); }
const incomplete = await reportGradedCall(env, { first: 'Jamie', last: '', call });
if (incomplete.ok || incomplete.code !== 'incomplete') { bad++; console.log(`❌ an incomplete call should not be sent: ${JSON.stringify(incomplete)}`); }
globalThis.fetch = realFetch;

if (bad) process.exit(1);
console.log(`✅ Graded calls to the Portal's course: ${lineCases.length} link lines, ${course.length} course slots, the gateway call, and nothing sent without the secret`);
