// AI practice: voice call over (mock) Gemini Live, hold, hang up, note, AI scorecard; typed call; trainer AI draft from a recording.
const { chromium } = require('playwright');
const Portal = require('./portal-ticket');
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
  await te.goto(Portal.trainee(B, 'Riley Santos', 'B093026'));
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
  await tr.goto(Portal.trainer(B, 'Coach Ana'));
  await tr.waitForSelector('#roster');
  await tr.click('a[href="#/calls"]');
  await tr.selectOption('#fMode', 'live');
  await tr.waitForSelector('[data-open]');
  // open a live call that has a recording
  const id = await tr.evaluate(async () => (await API.post('/api/calls', { mode: 'live' })).calls.find((c) => c.recording).id);
  await tr.goto(B + '/#/call/' + id);
  await tr.waitForSelector('[data-act="grade"]');
  await tr.click('#scoreForm [data-act="grade"]');
  await tr.waitForFunction(() => /Autograded/.test(document.querySelector('#scoreForm').textContent) && /Specific feedback/.test(document.querySelector('#scoreForm').innerHTML), null, { timeout: 30000 });
  const hasTr = await tr.$('.transcript');
  ok(`Trainer "✨ Grade again with AI" regrades the live call from its recording${hasTr ? ' (transcript on the page)' : ''}`);
  await tr.screenshot({ path: OUT + '/13-trainer-ai-draft.png', fullPage: true });

  // A call the trainer marks "live only" can't be practiced, and leaves no call record behind
  const sid = await tr.evaluate(async () => (await API.post('/api/scenarios/save', { scenario: { title: 'Live-only test call', track: 'reception', caller: { name: 'Test Caller', role: 'Tester' }, opening: 'Hi there.', hidden: 'Secret script.', goals: ['A goal'], ai: false } })).scenario.id);
  const count = () => te.evaluate(async () => (await API.post('/api/calls', {})).calls.length);
  const before = await count();
  const st = await te.evaluate(async (sid) => { try { await API.post('/api/ai/start', { scenarioId: sid }); return 200; } catch (e) { return e.status; } }, sid);
  const after = await count();
  if (st !== 403 || after !== before) throw new Error(`live-only practice: status ${st}, calls ${before} → ${after}`);
  ok('A live-only call can\'t be practiced and leaves no call record');

  // 🤖 The trainer sends an AI caller: the trainee's real phone (My phone) rings, the AI plays the caller, the trainer follows it live
  await te.evaluate(() => { location.hash = '#/phone'; });
  await te.waitForSelector('#device .lcd');
  const ext = await te.evaluate(() => App.myExt);
  await tr.click('a[href="#/console"]');
  await tr.waitForSelector('#dialer .dialpad');
  for (const d of ext) await tr.click(`#dialer [data-dk="${d}"]`);
  await tr.click('#pkList .scen[data-sid="ft_rc_appt"]');
  await tr.click('#roster [data-act="airing"]');
  await te.waitForSelector('#device .lcd.ringing', { timeout: 10000 });
  if (!/SANTOS MARIA/.test(await te.textContent('#device .lcd'))) throw new Error('The AI call should show the caller ID: ' + await te.textContent('#device .lcd'));
  await tr.waitForFunction(() => /Ringing/.test(document.querySelector('#aiCalls').textContent));
  ok(`🤖 AI caller from the dialer: the trainee's own phone rings (ext ${ext}, SANTOS MARIA), and the console lists the call`);
  // 🎭 AI caller setup: the trainer picks the calls to draw from, the voice and who to ring
  await te.click('[data-act="decline"]');
  await tr.waitForFunction(() => /Declined/.test(document.querySelector('#aiCalls').textContent));
  await tr.click('[data-act="aisetup"]');
  await tr.waitForSelector('.modal #asScens [data-asid]');
  await tr.selectOption('.modal #asVoice', 'Charon');
  await tr.click('.modal [data-asid="ft_rc_appt"]');
  await tr.click('.modal [data-aswhoall]');
  await tr.click('.modal [data-assend]');
  await te.waitForSelector('#device .lcd.ringing', { timeout: 10000 });
  await tr.waitForFunction(() => /Ringing/.test(document.querySelector('#aiCalls').textContent) && /🎚 Charon/.test(document.querySelector('#aiCalls').textContent));
  ok('🎭 AI caller setup: the chosen call, the chosen voice (Charon) and everyone free — the console lists the call with its voice');
  await te.click('[data-act="answer"]');
  await te.waitForSelector('#device .lcd.live', { timeout: 15000 });
  await tr.waitForFunction(() => /On the call/.test(document.querySelector('#aiCalls').textContent) && /on a call/.test(document.querySelector('#roster').textContent));
  await tr.click('[data-aifollow]');
  await tr.waitForFunction(() => /chiropractor/.test(document.querySelector('#aiFollow').textContent), null, { timeout: 20000 });
  await te.fill('[data-k="caller"]', 'Maria Santos, client');
  await tr.waitForFunction(() => /Maria Santos, client/.test(document.querySelector('#aiFollow').textContent), null, { timeout: 10000 });
  await tr.screenshot({ path: OUT + '/14-ai-call-follow.png' });
  ok('The trainee answers and talks with the AI caller; the trainer follows the transcript and the note live (👂 Follow)');
  await tr.click('.modal [data-x]');
  await sleep(3500);
  await te.click('[data-act="hangup"]');
  await te.waitForSelector('#submitNote');
  await te.fill('[data-k="callback"]', '(555) 010-4417');
  await sleep(300);
  await te.click('#submitNote');
  await te.waitForFunction(() => /Good, with Improvements Needed/.test(document.querySelector('#work').textContent), null, { timeout: 25000 });
  await tr.waitForFunction(() => /🤖 \d+%/.test(document.querySelector('#aiCalls').textContent), null, { timeout: 25000 });
  const graded = await tr.evaluate(async () => (await API.post('/api/graded', {})).calls.some((c) => c.ai && c.score != null));
  if (!graded) throw new Error('The graded AI call should be in 📋 Graded calls');
  ok('After the call, the AI reviews it: the trainee sees the scorecard, the console shows the score, and it\'s in 📋 Graded calls');
  await browser.close();
  console.log('\nALL PASSED');
})().catch((e) => { console.error('❌ FAILED at step', step + 1, e.message); process.exit(1); });
