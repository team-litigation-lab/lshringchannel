// The 📊 server request meter (README → Server request meter):
// - /api/request-budget answers trainers only (no sign-in is 401, a trainee 403); before the Request budget
//   workflow has run it answers usage: null; after, the month's numbers as the workflow saved them to LSH_KV
//   ("_request-usage"), without the workflow's own working data;
// - a trainee's pages have no meter and never ask for it; the trainer's console shows it after one request
//   and keeps it from page to page; the Class view (which the class sees in Meet) has none.
// The meter itself (every level, the note, the details): request-meter-widget.cjs.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const B = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '.';
const PERSIST = process.env.PERSIST;   // wrangler dev's --persist-to folder (run.sh sets it)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;
const ok = (msg) => console.log(`✅ ${++step}. ${msg}`);

const DAY = 86400000;
const start = Math.floor(Date.now() / DAY) * DAY - 5 * DAY;
const SNAPSHOT = {
  v: 1, at: new Date(Date.now() - 10 * 60000).toISOString(),
  month: { start: new Date(start).toISOString().slice(0, 10), end: new Date(start + 30 * DAY).toISOString().slice(0, 10) },
  total: 2497500, limit: 9990000, included: 10000000, projected: 13600000, paused: false, pausedAt: null,
  sites: [{ kind: 'worker', name: 'ea-pa-training', requests: 2000000 }, { kind: 'worker', name: 'lshringchannel', requests: 497500 }], days: {}, notes: [],
  cache: { through: new Date(start).toISOString(), scripts: [], days: {} }
};

// Saves the numbers to the local KV the way the workflow saves them to the real one.
function saveUsage(value) {
  if (!PERSIST) throw new Error('Set PERSIST to wrangler dev\'s --persist-to folder (run.sh does).');
  const file = path.join(path.dirname(PERSIST), 'request-usage.json');
  fs.writeFileSync(file, JSON.stringify(value));
  execFileSync('npx', ['wrangler', 'kv', 'key', 'put', '--binding', 'LSH_KV', '--local', '--persist-to', PERSIST, '_request-usage', '--path', file], { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
}
async function post(p, body, token) {
  const res = await fetch(B + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify(body || {}) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  // The endpoint
  const trainee = (await post('/api/auth/trainee', { name: 'Morgan Reyes', batch: 'B093026', pin: '1357' })).body.token;
  const trainer = (await post('/api/auth/admin', { name: 'Coach Ana', passphrase: 'test-pass' })).body.token;
  const anon = await post('/api/request-budget', {});
  const asTrainee = await post('/api/request-budget', {}, trainee);
  if (anon.status !== 401 || asTrainee.status !== 403 || 'usage' in (asTrainee.body || {})) throw new Error(`refusals: no sign-in ${anon.status}, trainee ${asTrainee.status} ${JSON.stringify(asTrainee.body)}`);
  ok('/api/request-budget refuses a visitor who isn\'t signed in (401) and a trainee (403)');
  const none = await post('/api/request-budget', {}, trainer);
  if (none.status !== 200 || JSON.stringify(none.body) !== '{"ok":true,"usage":null}') throw new Error('before the workflow has run: ' + JSON.stringify(none));
  ok('Before the Request budget workflow has run, a trainer gets { ok: true, usage: null }');
  saveUsage(SNAPSHOT);
  const some = await post('/api/request-budget', {}, trainer);
  const u = some.body && some.body.usage;
  if (!some.body || !some.body.ok || !u || u.total !== 2497500 || u.month.start !== SNAPSHOT.month.start || u.sites.length !== 2 || 'cache' in u) throw new Error('the month\'s numbers: ' + JSON.stringify(some.body));
  ok('After it has run, a trainer gets the month\'s numbers, without the workflow\'s working data');

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });
  const mk = async (ctx) => {
    const c = ctx || await browser.newContext({ permissions: ['microphone'], viewport: { width: 1360, height: 900 } });
    const p = await c.newPage(); p.asked = 0;
    p.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    p.on('request', (r) => { if (new URL(r.url()).pathname === '/api/request-budget') p.asked++; });
    return p;
  };

  // A trainee: no meter, and it never asks for it
  const te = await mk();
  await te.goto(B + '/');
  await te.fill('#tn', 'Morgan Reyes'); await te.fill('#tb', 'B093026'); await te.fill('#tp', '1357');
  await te.click('#fTrainee button');
  await te.waitForSelector('#device .lcd');
  await sleep(2500);
  await te.click('a[href="#/calls"]'); await sleep(2500);
  if (await te.$('#rqb-chip') || te.asked) throw new Error(`a trainee's page shows the meter or asks for it (${te.asked} requests)`);
  ok('A trainee\'s pages show no meter and never ask for it');

  // A trainer: the meter after one request, on every page
  const tr = await mk();
  await tr.goto(B + '/');
  await tr.fill('#an', 'Coach Ana'); await tr.fill('#ap', 'test-pass');
  await tr.click('#fTrainer button');
  await tr.waitForSelector('#rqb-chip', { timeout: 10000 });
  await sleep(800);
  const chip = await tr.evaluate(() => { const c = document.getElementById('rqb-chip'); return c.textContent.replace(/\s+/g, ' ').trim() + ' | ' + c.className; });
  if (!/Requests 25%/.test(chip) || !/rqb-warn/.test(chip)) throw new Error(`the trainer's meter: "${chip}" (expected 25%, amber: this pace runs out before the month ends)`);
  if (tr.asked !== 1) throw new Error(`the console asked for the meter ${tr.asked} times on opening (expected 1)`);
  ok(`The trainer's console shows the meter after one request: "${chip.split(' | ')[0]}"`);
  await tr.screenshot({ path: OUT + '/20-trainer-request-meter.png' });
  for (const page of ['calls', 'scenarios', 'trainees', 'setup', 'console']) {
    await tr.click(`#nav a[href="#/${page}"]`); await sleep(600);
    if (!await tr.$('#rqb-chip')) throw new Error(`the meter is gone on ${page}`);
  }
  if (tr.asked !== 1) throw new Error(`moving between pages asked for the meter again (${tr.asked} requests)`);
  ok('It stays on every trainer page without asking again');
  await tr.click('#rqb-chip');
  const panel = await tr.evaluate(() => { const el = document.getElementById('rqb-panel'); return { text: el.textContent, me: (el.querySelector('tr.rqb-me') || {}).textContent || '' }; });
  if (!/2,497,500/.test(panel.text) || !/Ring Channel/.test(panel.me)) throw new Error('the details: ' + panel.text.slice(0, 300));
  ok('Its details show the month\'s total, with Ring Channel highlighted in the list of sites');
  await tr.keyboard.press('Escape');

  // The Class view (shared with the class in Meet): no meter
  const cv = await mk(tr.context());
  await cv.goto(B + '/#/class');
  await cv.waitForSelector('.cv');
  await sleep(2500);
  if (await cv.$('#rqb-chip') || cv.asked) throw new Error(`the Class view shows the meter or asks for it (${cv.asked} requests)`);
  ok('The Class view shows no meter');

  await browser.close();
  console.log('\nALL PASSED');
})().catch((e) => { console.error('❌ FAILED at step', step + 1, e.message); process.exit(1); });
