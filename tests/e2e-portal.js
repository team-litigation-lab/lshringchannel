// End-to-end: Ring Channel opens from the LSH Training Portal, with no sign-in form (?ticket=…). mock-gemini.js stands in for
// the Portal's /api/verify-ticket (PORTAL_URL points at it, and this Worker has no PORTAL_SSO_SECRET), as on the live site.
const { chromium } = require('playwright');
const Portal = require('./portal-ticket');
const B = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '.';
const PORTAL_HOME = 'http://127.0.0.1:9911/programs.html';
let step = 0;
const ok = (msg) => console.log(`✅ ${++step}. ${msg}`);

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });
  const mk = async () => { const c = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1360, height: 900 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGE ERROR', e.message)); return p; };

  // A trainee opens Ring Channel from the Portal's Training Directory: straight onto their phone, the ticket gone from the address
  const te = await mk();
  const link = Portal.trainee(B, 'Riley Santos', 'B100626');
  await te.goto(link);
  await te.waitForSelector('#device .lcd');
  const me = await te.evaluate(() => ({ name: App.me.name, batch: App.me.batch, role: App.me.role, url: location.href }));
  if (me.name !== 'Riley Santos' || me.batch !== 'B100626' || me.role !== 't') throw new Error('Signed in as ' + JSON.stringify(me));
  if (/ticket=/.test(me.url) || !/#\/phone$/.test(me.url)) throw new Error('The address after sign-in: ' + me.url);
  await te.waitForFunction(() => /ext 7\d{3}/.test(document.querySelector('#device .dev-head').textContent));
  ok('From the Portal, a trainee lands on their phone (with a desk extension), signed in as their Portal name and batch; the ticket leaves the address');

  // Each ticket works once: the same link from history or another browser is no use
  const copy = await mk();
  await copy.goto(link);
  await copy.waitForSelector('#loginNotice');
  if (!/already used/.test(await copy.textContent('#loginNotice')) || await copy.evaluate(() => !!App.me)) throw new Error('A used ticket: ' + await copy.textContent('#loginNotice'));
  ok('A ticket that was already used signs nobody in');

  // Not signed in: no sign-in form, just the way to the Portal
  await te.evaluate(() => App.logout());
  await te.waitForSelector('#toPortal');
  if ((await te.getAttribute('#toPortal', 'href')) !== PORTAL_HOME) throw new Error('The Portal button goes to ' + await te.getAttribute('#toPortal', 'href'));
  if (await te.$('#fTrainee, #tn, #tp')) throw new Error('There is still a trainee sign-in form');
  if (await te.isVisible('#fTrainer')) throw new Error('The trainers\' fallback should stay folded away');
  await te.screenshot({ path: OUT + '/17-open-from-portal.png' });
  ok('Signed out, Ring Channel shows the way to the Portal: no sign-in form (the trainers\' fallback is folded away)');

  // Expired and forged tickets are refused, with a reason
  await te.goto(`${B}/?ticket=${Portal.ticket({ first: 'Riley', last: 'Santos', b: 'B100626', exp: Date.now() - 1000 })}`);
  await te.waitForSelector('#loginNotice');
  if (!/expired/.test(await te.textContent('#loginNotice'))) throw new Error('Expired: ' + await te.textContent('#loginNotice'));
  await te.goto(`${B}/?ticket=${Portal.ticket({ r: 'a', n: 'Mallory', exp: Portal.exp() }, 'not-the-portal')}`);
  await te.waitForSelector('#loginNotice');
  if (await te.evaluate(() => !!App.me)) throw new Error('A forged ticket signed someone in');
  ok('An expired ticket and a ticket the Portal didn\'t sign are refused, with a reason');

  // An administrator from the Portal lands on the console, under their Portal name: no passphrase
  const tr = await mk();
  await tr.goto(Portal.trainer(B, 'Coach Ana'));
  await tr.waitForSelector('#roster');
  const t = await tr.evaluate(() => ({ role: App.me.role, name: App.me.name, hash: location.hash }));
  if (t.role !== 'a' || t.name !== 'Coach Ana' || t.hash !== '#/console') throw new Error('The trainer from the Portal: ' + JSON.stringify(t));
  if ((await tr.getAttribute('#who a.hdr-btn', 'href')) !== PORTAL_HOME) throw new Error('The trainer\'s 🏠 goes to ' + await tr.getAttribute('#who a.hdr-btn', 'href'));
  ok('From the Portal, an administrator lands on the console as Coach Ana (no passphrase); 🏠 goes back to the Portal');

  // The trainee is on the switchboard, with their extension, and in 👥 Trainees
  await te.goto(Portal.trainee(B, 'Riley Santos', 'B100626'));
  await te.waitForSelector('#device .lcd');
  await tr.waitForFunction(() => /Riley Santos/.test(document.querySelector('#roster').textContent) && /ext 7\d{3}/.test(document.querySelector('#roster').textContent));
  await tr.click('a[href="#/trainees"]');
  await tr.waitForFunction(() => /Riley Santos/.test(document.querySelector('#app').textContent) && /Portal/.test(document.querySelector('#app').textContent) && !/PIN/.test(document.querySelector('#app').textContent));
  ok('The trainee is on the trainer\'s switchboard with their extension, and in 👥 Trainees (no PINs anywhere)');

  // The Portal being down: the trainers' passphrase still opens the console (?admin=1 from an older Portal opens it too)
  const fb = await mk();
  await fb.goto(B + '/?admin=1');
  await fb.waitForSelector('#fTrainer', { state: 'visible' });
  if (/admin=/.test(fb.url())) throw new Error('?admin=1 stayed in the address');
  await fb.fill('#an', 'Coach Ben'); await fb.fill('#ap', 'test-pass');
  await fb.click('#fTrainer button');
  await fb.waitForSelector('#roster');
  ok('The trainers\' fallback (the Portal is down): the passphrase still opens the console');

  // Separate trainer accounts get their own desk extensions (8001 and up), and see each other's
  const ext = async (p) => p.evaluate(() => App.myExt);
  await fb.waitForFunction(() => !!App.myExt);
  const [e1, e2] = [await ext(tr), await ext(fb)];
  if (!/^80\d\d$/.test(e1) || !/^80\d\d$/.test(e2) || e1 === e2) throw new Error('Each trainer account needs its own extension: ' + JSON.stringify([e1, e2]));
  await tr.click('a[href="#/console"]');
  await tr.waitForSelector('#dialer .dev-head');
  if (!new RegExp('ext ' + e1).test(await tr.textContent('#dialer .dev-head'))) throw new Error('The console should show the trainer\'s own extension');
  await tr.waitForFunction((n) => /Coach Ben/.test(document.querySelector('#roster').textContent) && new RegExp('ext ' + n).test(document.querySelector('#roster').textContent), e2);
  ok(`Separate trainer accounts have their own trainer lines (Coach Ana ext ${e1}, Coach Ben ext ${e2}) and see each other on the switchboard`);

  await browser.close();
  console.log('\nALL PASSED');
})().catch(async (e) => { console.error('❌ FAILED at step', step + 1, e.message); process.exit(1); });
