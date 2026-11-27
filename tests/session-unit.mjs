// Run by tests/run.sh. How long a sign-in lasts (src/auth.js): until 8 hours with no activity. Each signed-in request is
// answered with a fresh 8-hour token, so 7 hours idle is still signed in and 9 hours idle is signed out; Log out and an
// archived trainee are handled elsewhere (public/js/api.js, src/worker.js) and keep working as before.
import { makeToken, readTokenString, renewToken, SESSION_IDLE_HOURS } from '../src/auth.js';

const env = { SESSION_SECRET: 'unit-secret' };
const H = 3600 * 1000;
const realNow = Date.now;
const at = async (offsetMs, fn) => { Date.now = () => realNow() + offsetMs; try { return await fn(); } finally { Date.now = realNow; } };
const fail = (m) => { console.error('❌ ' + m); process.exit(1); };

if (SESSION_IDLE_HOURS !== 8) fail(`the idle limit is ${SESSION_IDLE_HOURS} hours, not 8`);
for (const role of ['t', 'a']) {
  const who = role === 't' ? 'riley-santos--b100626' : 'Coach Ana';
  const tok = await makeToken(env, role, who);
  const r = await readTokenString(env, tok);
  if (!r || r.role !== role || r.id !== who) fail(`a ${role} token didn't read back: ${JSON.stringify(r)}`);
  if (Math.abs(r.exp - (realNow() + 8 * H)) > 5000) fail(`a new ${role} sign-in lasts ${((r.exp - realNow()) / H).toFixed(2)} h, not 8`);
  if (!(await at(7 * H, () => readTokenString(env, tok)))) fail(`a ${role} sign-in idle for 7 hours was signed out`);
  if (await at(9 * H, () => readTokenString(env, tok))) fail(`a ${role} sign-in idle for 9 hours was still signed in`);
  // in use: a request 7 hours in renews it, so it is good 8 hours after that (15 h after signing in) and ends 8 hours after the last use
  const fresh = await at(7 * H, async () => renewToken(env, await readTokenString(env, tok)));
  if (!fresh) fail(`a ${role} sign-in used 7 hours in wasn't renewed`);
  if (!(await at(14 * H, () => readTokenString(env, fresh)))) fail(`a ${role} sign-in used 7 hours in ended before 8 more hours`);
  if (await at(16 * H, () => readTokenString(env, fresh))) fail(`a ${role} sign-in last used 9 hours ago was still signed in`);
  if (await renewToken(env, r)) fail(`a ${role} token that already runs 8 hours was signed again`);
}
// a token from before the rule (a trainee's 30 days, a trainer's 12 hours) is replaced by an 8-hour one on its next request
const old = await readTokenString(env, await makeToken(env, 't', 'old--b1', 24 * 30));
const swapped = await readTokenString(env, await renewToken(env, old));
if (!swapped || Math.abs(swapped.exp - (realNow() + 8 * H)) > 5000) fail('an old 30-day token wasn\'t replaced by an 8-hour one');
if (await readTokenString(env, (await makeToken(env, 't', 'x', 8)).replace(/.$/, 'A'))) fail('an altered token was accepted');
console.log('✅ Sign-in lifetime: 8 hours with no activity (7 h idle signed in, 9 h idle signed out, renewed with use; trainee and trainer; old long tokens shortened)');
