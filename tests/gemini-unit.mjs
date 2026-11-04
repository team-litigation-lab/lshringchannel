// 🔑 The Portal's keys as the fallback (src/gemini.js): with AI_GATEWAY_SECRET set, a request every key here has failed
// — or every request, when this Worker has no key — goes to the Portal's /api/ai-gateway. Fetch is mocked. Run by tests/run.sh.
import { generate, liveToken, hasAI } from '../src/gemini.js';

const seen = [];
let google = 'ok', portal = 'ok';
globalThis.fetch = async (url, init) => {
  const u = String(url), body = JSON.parse(init.body || '{}');
  seen.push(u.includes('/api/ai-gateway') ? 'portal:' + (body.action || 'text') : 'google');
  if (u.includes('/api/ai-gateway')) {
    if (init.headers['X-Gateway-Key'] !== 'gw') return new Response(JSON.stringify({ success: false, error: 'Not allowed.' }), { status: 401 });
    if (portal !== 'ok') return new Response(JSON.stringify({ success: false, error: 'The shared AI budget for today is used up.' }), { status: 429 });
    if (body.action === 'live-token') return new Response(JSON.stringify({ success: true, token: 'auth_tokens/portal', module: body.module }), { status: 200 });
    if (body.module !== 'ringchannel' || !body.messages.length) return new Response(JSON.stringify({ success: false, error: 'bad request' }), { status: 400 });
    return new Response(JSON.stringify({ success: true, text: 'from the portal: ' + body.messages.map((m) => m.text).join(' | '), model: 'gemini-x' }), { status: 200 });
  }
  if (google === 'credits') return new Response(JSON.stringify({ error: { message: 'Your prepayment credits are depleted.' } }), { status: 429 });
  if (u.includes('auth_tokens')) return new Response(JSON.stringify({ name: 'auth_tokens/here' }), { status: 200 });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'from here' }] } }] }), { status: 200 });
};

let bad = 0;
const check = (ok, what) => { if (!ok) { bad++; console.log('❌ ' + what); } };
const own = { GEMINI_API_KEY5: 'k5', AI_GATEWAY_SECRET: 'gw', PORTAL_URL: 'http://portal.test' };
const ask = (env, extra) => generate(env, Object.assign({ system: 's', parts: [{ text: 'hello' }] }, extra));

let r = await ask(own);
check(r.text === 'from here' && !seen.includes('portal:text'), 'with working keys here, the Portal is not asked: ' + JSON.stringify(r));
google = 'credits'; seen.length = 0;
r = await ask(own);
check(r.via === 'portal' && /from the portal: hello/.test(r.text), 'every key here out of credits: the Portal\'s keys answer: ' + JSON.stringify(r));
r = await generate({ AI_GATEWAY_SECRET: 'gw', PORTAL_URL: 'http://portal.test' }, { contents: [{ role: 'user', parts: [{ text: 'a' }] }, { role: 'model', parts: [{ text: 'b' }] }] });
check(r.via === 'portal' && /a \| b/.test(r.text), 'no key here at all: the typed conversation goes to the Portal: ' + JSON.stringify(r));
check(hasAI({ AI_GATEWAY_SECRET: 'gw' }) && !hasAI({}), 'AI is on with only the gateway secret, off with neither');
let err = null, before = seen.filter((x) => x.startsWith('portal')).length;
try { await ask(own, { parts: [{ inlineData: { mimeType: 'audio/wav', data: 'AAAA' } }, { text: 'grade' }] }); } catch (e) { err = e; }
check(err && seen.filter((x) => x.startsWith('portal')).length === before, 'a recording to score is never sent to the text-only gateway');
portal = 'limit'; err = null;
try { await ask(own); } catch (e) { err = e; }
check(err && /prepayment credits|resting/.test(err.message), 'both failing: the reason from the keys here is the answer: ' + (err && err.message));
portal = 'ok';
const t = await liveToken(own, (model) => ({ model: 'models/' + model }), 8, [], 'jamie--b1');
check(t.ok && t.token === 'auth_tokens/portal' && /^portal\|/.test(t.pair), 'live voice: keys here out of credits, the Portal mints the token: ' + JSON.stringify(t));
const t2 = await liveToken(own, (model) => ({ model }), 8, [t.pair], 'jamie--b1');
check(t2.ok && t2.pair !== t.pair, 'a Portal model that didn\'t open is skipped next time: ' + JSON.stringify(t2));
google = 'ok';
const t3 = await liveToken({ GEMINI_API_KEY6: 'k6', AI_GATEWAY_SECRET: 'gw' }, (model) => ({ model }), 8, [], 'x');
check(t3.ok && t3.token === 'auth_tokens/here', 'live voice with working keys stays here');
err = null;
try { await ask({ AI_GATEWAY_SECRET: 'wrong', PORTAL_URL: 'http://portal.test' }); } catch (e) { err = e; }
check(err && /Not allowed/.test(err.message), 'a wrong gateway secret says so');

if (bad) process.exit(1);
console.log('✅ The Portal\'s Gemini keys are the fallback: out of credits here → the Portal answers (text and live voice); recordings stay here; a wrong secret or a spent budget says why');
