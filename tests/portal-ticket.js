// Opens Ring Channel the way the LSH Training Portal does (tests only): a signed ticket that mock-gemini.js's stand-in for the
// Portal's /api/verify-ticket accepts. Each ticket works once, so make a new one each time.
const { createHmac } = require('crypto');
const SECRET = 'portal-test-secret';
let n = 0;
function ticket(body, secret = SECRET) {
  const p = Buffer.from(JSON.stringify(body)).toString('base64url');
  return p + '.' + createHmac('sha256', 'portal-sso:' + secret).update(p).digest('base64url');
}
const exp = () => Date.now() + 4 * 60000 - (n++ % 1000);   // a different expiry each time, so no two tickets are the same
// A trainee ("Jamie Cruz", "B093026") or an administrator (opens as a trainer under that name).
const trainee = (B, name, batch) => { const [first, ...rest] = name.split(' '); return `${B}/?ticket=${ticket({ first, last: rest.join(' '), b: batch, exp: exp() })}`; };
const trainer = (B, name) => `${B}/?ticket=${ticket({ r: 'a', n: name, exp: exp() })}`;
module.exports = { ticket, trainee, trainer, exp };

// Local development: `node tests/portal-ticket.js trainee "Jamie Cruz" B093026` or `node tests/portal-ticket.js trainer "Coach Ana"`
// prints a one-time sign-in link for `npx wrangler dev` (with PORTAL_SSO_SECRET=portal-test-secret in .dev.vars). BASE= changes the address.
if (require.main === module) {
  const [kind, name, batch] = process.argv.slice(2);
  const base = process.env.BASE || 'http://localhost:8787';
  if (kind === 'trainee' && name) console.log(trainee(base, name, batch || ''));
  else if (kind === 'trainer' && name) console.log(trainer(base, name));
  else { console.log('Usage: node tests/portal-ticket.js trainee "Full Name" BATCH  |  node tests/portal-ticket.js trainer "Your Name"'); process.exit(1); }
}
