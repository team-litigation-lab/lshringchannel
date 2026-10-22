// 💬 Automated Messaging: the Portal's messaging link opens a thread, the firm's automation keeps texting while the
// trainee answers, the client replies through the (mock) Gemini API, and closing the thread scores it on the
// Client Messaging Metrics. The trainer then finds the thread on their own list. Run by tests/run.sh.
const { chromium } = require('playwright');
const Portal = require('./portal-ticket');
const B = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '.';
let step = 0;
const ok = (msg) => console.log(`✅ ${++step}. ${msg}`);
const lines = (pg) => pg.$$eval('#msgLines .tl', (x) => x.map((e) => e.textContent));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const mk = async () => { const c = await browser.newContext({ viewport: { width: 1360, height: 900 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGE ERROR', e.message)); return p; };

  /* A Portal messaging link: ?messaging=1&thread=…&mode=graded opens that thread straight away, the way a
     Call Simulator link rings a graded call at once. */
  const te = await mk();
  const ticket = Portal.trainee(B, 'Riley Santos', 'B093026');
  await te.goto(ticket + '&messaging=1&thread=am_reminder&program=FT&mode=graded');
  await te.waitForSelector('#msgLines .tl', { timeout: 20000 });
  if (!/#\/messages$/.test(await te.evaluate(() => location.hash))) throw new Error('A messaging link should land on 💬 Messaging: ' + await te.evaluate(() => location.hash));
  if (await te.evaluate(() => location.search)) throw new Error('The link\'s parameters should leave the address: ' + await te.evaluate(() => location.search));
  const first = await lines(te);
  if (!/Automated message/.test(first[0]) || !/reminder of your appointment/i.test(first[0])) throw new Error('The automation should text first: ' + JSON.stringify(first));
  ok('A Portal messaging link opens the graded thread, and the firm\'s automation has already texted');

  // The client's own first texts arrive on the automation's schedule, whether or not anyone has replied.
  await te.waitForFunction(() => document.querySelectorAll('#msgLines .tl').length >= 3, null, { timeout: 40000 });
  const landed = await lines(te);
  if (!landed.some((l) => /^Client/.test(l.trim()))) throw new Error('The client should have texted back: ' + JSON.stringify(landed));
  ok(`The automation keeps sending while the trainee reads: ${landed.length} messages on the thread`);
  await te.screenshot({ path: OUT + '/20-messaging-thread.png', fullPage: true });

  // The trainee answers; the client's reply comes from the AI (the stand-in Gemini).
  const before = (await lines(te)).length;
  await te.fill('#msgIn', 'Hello, this is Riley at LSH Training Law Group. Before I can discuss the appointment, may I have your full name and date of birth?');
  await te.click('[data-act="send"]');
  await te.waitForFunction((n) => document.querySelectorAll('#msgLines .tl').length >= n + 2, before, { timeout: 25000 });
  const said = await lines(te);
  if (!said.some((l) => /^You/.test(l.trim()) && /may I have your full name/.test(l))) throw new Error('The trainee\'s own text should be on the thread: ' + JSON.stringify(said));
  ok('The trainee\'s reply is sent and the client answers it');

  // 🔎 Case lookup and 📘 Policy are on the thread, as they are on a call.
  await te.click('.work-tabs [data-tab="policy"]');
  await te.waitForSelector('.pane[data-pane="policy"].on .rules li');
  const metrics = await te.$$eval('.pane[data-pane="policy"].on ul li b', (x) => x.map((e) => e.textContent));
  if (metrics.length < 5) throw new Error('The policy pane should name the metrics the thread is scored on: ' + JSON.stringify(metrics));
  await te.click('.work-tabs [data-tab="lookup"]');
  await te.fill('#lkQ', 'Harris');
  await te.waitForSelector('.lookup-hit');
  ok(`📘 Policy lists the ${metrics.length} metrics, and 🔎 Case lookup works on the thread`);

  // Closing the thread scores it on the Client Messaging Metrics.
  await te.click('.work-tabs [data-tab="chat"]');
  await te.click('[data-act="end"]');
  await te.waitForSelector('.score-big', { timeout: 30000 });
  const score = (await te.textContent('.score-big')).trim();
  if (!/^\d+%$/.test(score)) throw new Error('A closed thread should have a percentage: ' + score);
  const rows = await te.$$eval('.pane[data-pane="grade"] table.list tr', (x) => x.length);
  if (rows < 5) throw new Error('The scorecard should hold every metric: ' + rows);
  ok(`Closing the thread scores it: ${score} on ${rows} metrics, with the thread's own checklist`);
  await te.screenshot({ path: OUT + '/21-messaging-scorecard.png', fullPage: true });

  // The trainee's own list, and the picker they take the next thread from.
  await te.click('[data-act="another"]');
  await te.waitForSelector('.scen-grid .scen');
  const threads = await te.$$eval('.scen-grid .scen h4', (x) => x.map((e) => e.textContent));
  if (threads.length < 3) throw new Error('The picker should list the threads: ' + JSON.stringify(threads));
  await te.waitForFunction(() => /\d+%/.test(document.querySelector('#msgMine').textContent), null, { timeout: 15000 });
  ok(`The picker lists ${threads.length} threads, and the scored thread is on "My recent threads"`);

  // A trainer sees every trainee's threads on 💬 Messaging; the old tab's address still opens it.
  const tr = await mk();
  await tr.goto(Portal.trainer(B, 'Coach Ana'));
  await tr.waitForSelector('#dialer .dialpad');
  await tr.goto(B + '/#/logs/messaging');
  await tr.waitForSelector('table.list tr');
  if (await tr.evaluate(() => location.hash) !== '#/messages') throw new Error('The old Automated Messaging tab should open 💬 Messaging: ' + await tr.evaluate(() => location.hash));
  if (!(await tr.$('#nav a.on[href="#/messages"]'))) throw new Error('💬 Messaging should be lit on the top bar');
  const row = await tr.textContent('table.list tr:nth-child(2)');
  if (!/Riley Santos/.test(row)) throw new Error('The trainer should see the trainee\'s thread: ' + row);
  if (!/Graded/.test(row)) throw new Error('The thread should show as graded: ' + row);
  ok('A trainer sees the trainee\'s graded thread on 💬 Messaging, lit on the top bar');

  /* 💬 Client Messaging: the Portal's other messaging link (?messages=1&program=<tab>) opens the tab
     where a client texts the firm first — no automation on the thread at all. */
  const cm = await mk();
  await cm.goto(Portal.trainee(B, 'Jordan Blake', 'B093026') + '&messages=1&program=cm&thread=cm_danger&mode=graded');
  await cm.waitForSelector('#msgLines .tl', { timeout: 20000 });
  if (!/#\/messages$/.test(await cm.evaluate(() => location.hash))) throw new Error('A Client Messaging link should land on 💬 Messaging: ' + await cm.evaluate(() => location.hash));
  const opened = await lines(cm);
  if (!/^Client/.test(opened[0].trim())) throw new Error('The client should text first on a Client Messaging thread: ' + JSON.stringify(opened));
  if (opened.some((l) => /Automated message/.test(l))) throw new Error('No automation belongs on a Client Messaging thread: ' + JSON.stringify(opened));
  ok('A Portal Client Messaging link opens the graded thread, with the client\'s own text first');

  // 💬 Messaging is both simulators on one page: the one the link asked for first, its program tab first.
  cm.on('dialog', (d) => d.accept());   // closing a thread nobody answered asks first
  await cm.click('[data-act="end"]');
  await cm.waitForSelector('.score-big', { timeout: 30000 });
  await cm.click('[data-act="another"]');
  await cm.waitForSelector('.msg-sim .scen');
  const heads = await cm.$$eval('.msg-sim h2', (x) => x.map((e) => e.textContent));
  if (heads.length !== 2 || !/Client Messaging/.test(heads[0]) || !/Automated Messaging/.test(heads[1])) throw new Error('💬 Messaging should hold Client Messaging, then Automated Messaging: ' + JSON.stringify(heads));
  const picks = await cm.$$eval('.msg-sim[data-kind="client"] .scen h4', (x) => x.map((e) => e.textContent));
  if (picks.length < 6) throw new Error('The Client Messaging section should list its threads: ' + JSON.stringify(picks));
  if (picks.some((x) => /Appointment reminder the client answers late/.test(x))) throw new Error('An Automated Messaging thread is in the Client Messaging section: ' + JSON.stringify(picks));
  const autos = await cm.$$eval('.msg-sim[data-kind="auto"] .scen h4', (x) => x.map((e) => e.textContent));
  if (!autos.some((x) => /Appointment reminder the client answers late/.test(x))) throw new Error('The Automated Messaging section should list its threads: ' + JSON.stringify(autos));
  ok(`💬 Messaging lists both simulators: ${picks.length} Client Messaging threads (the link's program tab first), then ${autos.length} Automated Messaging threads`);
  await cm.screenshot({ path: OUT + '/22-client-messaging.png', fullPage: true });

  await browser.close();
  console.log('✅ The texting simulators end to end: both Portal links, the automation, the AI client, the scorecard, and the trainer\'s list');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
