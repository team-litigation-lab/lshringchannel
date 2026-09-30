// AI practice: voice call over (mock) Gemini Live, hold, hang up, note, AI scorecard; typed call; trainer AI draft from a recording.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;
const ok = (msg) => console.log(`✅ ${++step}. ${msg}`);

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });
  const mk = async () => { const c = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1360, height: 900 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGE ERROR', e.message)); return p; };
  const te = await mk();
  await te.goto(B + '/');
  await te.fill('#tn', 'Riley Santos'); await te.fill('#tb', 'B093026');
  await te.click('#fTrainee button');
  await te.waitForSelector('#device .lcd');

  // Voice practice call
  await te.click('a[href="#/practice"]');
  await te.waitForSelector('.scen[data-id="ft_rc_appt"]');
  await te.check('#optTr');
  await te.screenshot({ path: OUT + '/10-practice-picker.png', fullPage: true });
  await te.click('.scen[data-id="ft_rc_appt"] button');
  await te.waitForSelector('.lcd.ringing', { timeout: 10000 });
  ok('Practice call rings the practice phone');
  await te.click('[data-act="answer"]');
  await te.waitForSelector('.lcd.live', { timeout: 15000 });
  ok('Answered: connected to the AI caller over Gemini Live (stand-in)');
  await te.waitForFunction(() => document.querySelectorAll('#trLines .tl').length >= 2, null, { timeout: 15000 });
  const lines = await te.$$eval('#trLines .tl', (x) => x.map((e) => e.textContent));
  ok('Microphone audio streams up; the caller answers; both sides are transcribed: ' + JSON.stringify(lines.slice(0, 2)));
  await te.fill('[data-k="caller"]', 'Maria Santos, client');
  await te.click('[data-act="hold"]'); await sleep(800); await te.click('[data-act="hold"]');
  ok('Hold and resume on a practice call');
  await te.screenshot({ path: OUT + '/11-practice-live.png' });
  await sleep(4500);
  await te.click('[data-act="hangup"]');
  await te.waitForSelector('#submitNote');
  await te.fill('[data-k="callback"]', '(555) 010-4417');
  await sleep(300);
  await te.click('#submitNote');
  await te.waitForFunction(() => /Good, with Improvements Needed/.test(document.querySelector('#work').textContent), null, { timeout: 20000 });
  const score = await te.textContent('#work .score-big');
  ok(`Note submitted and the AI scored the call (${score})`);
  await te.screenshot({ path: OUT + '/12-practice-scored.png' });
  await te.click('a.btn-primary[href^="#/call/"]');
  await te.waitForFunction(() => /AI scorecard/.test(document.body.textContent));
  const rec = await te.$('[data-act="loadrec"]');
  ok(`Full scorecard opens${rec ? ', with the practice recording' : ''}`);

  // Typed practice call
  await te.click('a[href="#/practice"]');
  await te.waitForSelector('#optTyped');
  await te.check('#optTyped');
  await te.click('.scen[data-id="ft_rc_appt"] button');
  await te.waitForSelector('.lcd.ringing', { timeout: 10000 });
  await te.click('[data-act="answer"]');
  await te.waitForSelector('#typeIn', { timeout: 10000 });
  await te.fill('#typeIn', 'Thank you for calling LSH Training Law Group, this is Riley. How may I help you?');
  await te.press('#typeIn', 'Enter');
  await te.waitForFunction(() => /chiropractor/.test(document.querySelector('#trLines').textContent), null, { timeout: 10000 });
  ok('Typed practice call: the caller answers in text');
  await te.click('[data-act="hangup"]');
  await te.waitForSelector('#submitNote');

  // Trainer drafts a scorecard with AI from a live call's recording (the call from the live test)
  const tr = await mk();
  await tr.goto(B + '/');
  await tr.fill('#an', 'Coach Ana'); await tr.fill('#ap', 'test-pass');
  await tr.click('#fTrainer button');
  await tr.waitForSelector('#roster');
  await tr.click('a[href="#/calls"]');
  await tr.selectOption('#fMode', 'live');
  await tr.waitForSelector('[data-open]');
  // open a live call that has a recording
  const id = await tr.evaluate(async () => (await API.post('/api/calls', { mode: 'live' })).calls.find((c) => c.recording).id);
  await tr.goto(B + '/#/call/' + id);
  await tr.waitForSelector('[data-sc="draft"]');
  await tr.click('[data-sc="draft"]');
  await tr.waitForFunction(() => /Specific evaluation/.test(document.querySelector('#scoreForm').innerHTML), null, { timeout: 30000 });
  const hasTr = await tr.$('.transcript');
  ok(`Trainer "Draft with AI" from the recording fills the scorecard${hasTr ? ' and adds a transcript' : ''}`);
  await tr.screenshot({ path: OUT + '/13-trainer-ai-draft.png', fullPage: true });
  await browser.close();
  console.log('\nALL PASSED');
})().catch((e) => { console.error('❌ FAILED at step', step + 1, e.message); process.exit(1); });
