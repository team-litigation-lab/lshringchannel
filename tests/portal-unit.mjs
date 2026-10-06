// The LSH Training Portal's ticket, checked with the shared secret (src/portal.js verifyLocal): run by tests/run.sh.
import { createHmac } from 'node:crypto';
import { verifyLocal } from '../src/portal.js';

const SECRET = 'shared-secret';
const sign = (body, secret = SECRET) => {
  const p = Buffer.from(JSON.stringify(body)).toString('base64url');
  return p + '.' + createHmac('sha256', 'portal-sso:' + secret).update(p).digest('base64url');
};
const soon = Date.now() + 4 * 60000;
const cases = [
  ['a trainee\'s ticket', sign({ first: 'Ana María', last: 'Lopez', b: 'B100626', exp: soon }), (r) => r.ok && r.first === 'Ana María' && r.last === 'Lopez' && r.batch === 'B100626'],
  ['an administrator\'s ticket', sign({ r: 'a', exp: soon }), (r) => r.ok && r.admin],
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
