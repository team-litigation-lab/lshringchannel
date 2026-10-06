// End-to-end: opening Ring Channel from the LSH Training Portal (?ticket=…, ?admin=1). mock-gemini.js stands in for the
// Portal's /api/verify-ticket (PORTAL_URL points at it, and this Worker has no PORTAL_SSO_SECRET), as on the live site.
const { chromium } = require('playwright');
const { createHmac } = require('crypto');
const B = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '.';
let step = 0;
const ok = (msg) => console.log(`✅ ${++step}. ${msg}`);
const sign = (body, secret = 'portal-test-secret') => {
  const p = Buffer.from(JSON.stringify(body)).toString('base64url');
  return p + '.' + createHmac('sha256', 'portal-sso:' + secret).update(p).digest('base64url');
};
const soon = () => Date.now() + 4 * 60000;

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });
  const mk = async () => { const c = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1360, height: 900 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGE ERROR', e.message)); return p; };

  // A trainee opens Ring Channel from the Portal's Training Directory: signed in, no form, the ticket gone from the address
  const te = await mk();
  await te.goto(B + '/?ticket=' + sign({ first: 'Riley', last: 'Santos', b: 'B100626', exp: soon() }));
  await te.waitForSelector('#device .lcd');
  const me = await te.evaluate(() => ({ name: App.me.name, batch: App.me.batch, role: App.me.role, url: location.href }));
  if (me.name !== 'Riley Santos' || me.batch !== 'B100626' || me.role !== 't') throw new Error('Signed in as ' + JSON.stringify(me));
  if (/ticket=/.test(me.url) || !/#\/phone$/.test(me.url)) throw new Error('The address after sign-in: ' + me.url);
  await te.waitForFunction(() => /ext 7\d{3}/.test(document.querySelector('#device .dev-head').textContent));
  ok('A Portal ticket signs the trainee straight in (My phone, with a desk extension); the ticket leaves the address');

  // Their Ring Channel account came from the Portal: no PIN, so nobody can claim it on the sign-in form
  await te.evaluate(() => App.logout());
  await te.waitForSelector('#fTrainee');
  const portalBtn = await te.getAttribute('#tPortal', 'href');
  if (portalBtn !== 'http://127.0.0.1:9911/programs.html') throw new Error('The sign-in page\'s Portal button goes to ' + portalBtn);
  await te.fill('#tn', 'Riley Santos'); await te.fill('#tb', 'B100626'); await te.fill('#tp', '9999');
  await te.click('#fTrainee button');
  await te.waitForFunction(() => /LSH Training Portal/.test(document.querySelector('#tErr').textContent));
  ok('The sign-in page sends trainees to the Portal, and a Portal account can\'t be signed into here with a PIN');

  // Expired and forged tickets are refused, with a reason
  await te.goto(B + '/?ticket=' + sign({ first: 'Riley', last: 'Santos', b: 'B100626', exp: Date.now() - 1000 }));
  await te.waitForSelector('#loginNotice');
  if (!/expired/.test(await te.textContent('#loginNotice'))) throw new Error('Expired: ' + await te.textContent('#loginNotice'));
  await te.goto(B + '/?ticket=' + sign({ first: 'Mallory', last: 'X', b: 'B100626', exp: soon() }, 'not-the-portal'));
  await te.waitForSelector('#loginNotice');
  if (await te.evaluate(() => !!App.me)) throw new Error('A forged ticket signed someone in');
  ok('An expired ticket and a ticket the Portal didn\'t sign are refused, with a reason on the sign-in page');

  // Administrators: no ticket signs them in; they land on the trainer passphrase
  const tr = await mk();
  await tr.goto(B + '/?ticket=' + sign({ r: 'a', exp: soon() }));
  await tr.waitForSelector('#fTrainer.pick');
  await tr.goto(B + '/?admin=1');
  await tr.waitForSelector('#fTrainer.pick');
  if (/admin=/.test(tr.url())) throw new Error('?admin=1 stayed in the address');
  await tr.fill('#an', 'Coach Ana'); await tr.fill('#ap', 'test-pass');
  await tr.click('#fTrainer button');
  await tr.waitForSelector('#roster');
  const home = await tr.getAttribute('#who a.hdr-btn', 'href');
  if (home !== 'http://127.0.0.1:9911/programs.html') throw new Error('The trainer\'s 🏠 goes to ' + home);
  ok('From the Portal, an administrator lands on the trainer passphrase (never signed in by a ticket); the trainer\'s 🏠 goes back to the Portal');

  // Riley is on the switchboard like anyone else, and 👥 Trainees says the account signs in from the Portal
  await te.goto(B + '/?ticket=' + sign({ first: 'Riley', last: 'Santos', b: 'B100626', exp: soon() }));
  await te.waitForSelector('#device .lcd');
  await tr.waitForFunction(() => /Riley Santos/.test(document.querySelector('#roster').textContent));
  await tr.click('a[href="#/trainees"]');
  await tr.waitForFunction(() => /Portal sign-in/.test(document.querySelector('#app').textContent));
  await tr.screenshot({ path: OUT + '/16-trainees-portal.png', fullPage: true });
  ok('The Portal trainee is on the trainer\'s switchboard, and 👥 Trainees marks the account "🏠 Portal sign-in"');

  await browser.close();
  console.log('\nALL PASSED');
})().catch(async (e) => { console.error('❌ FAILED at step', step + 1, e.message); process.exit(1); });
