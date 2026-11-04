// End-to-end: the trainee's own phone features. A trainee dials another trainee for a 🤝 practice call (and the one who
// answers holds and transfers it); on a call from the trainer, a trainee 👥 merges a classmate in, 🗣 warm-transfers
// (the two speak privately while the caller holds, then merge all three or hand the caller over), ↪ cold-transfers
// from the keypad, and warm-transfers to a firm extension the trainer answers as.
const { chromium } = require('playwright');
const Portal = require('./portal-ticket');
const B = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;
const ok = (msg) => console.log(`✅ ${++step}. ${msg}`);
const BATCH = 'B110426';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });
  const mk = async () => { const c = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1360, height: 900 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGE ERROR', e.message)); return p; };
  const inb = (p) => p.evaluate(async () => {
    const rtc = App.trainer() ? App.t.rtc : App.p.rtc;
    const st = await rtc.pc.getStats(); let bytes = 0;
    st.forEach((s) => { if (s.type === 'inbound-rtp' && s.kind === 'audio') bytes = s.bytesReceived; });
    return bytes;
  });
  const dev = (p) => p.textContent('#device');
  const key = async (p, digits) => { for (const d of digits) await p.click(`#device [data-dk="${d}"]`); };
  const idle = (p) => p.waitForFunction(() => !App.p || App.p.status === 'ended', null, { timeout: 20000 });
  const reset = async (p) => { await p.goto(B + '/#/phone'); await p.waitForSelector('#device .lcd'); };

  const jamie = await mk(), riley = await mk(), sam = await mk(), tr = await mk();
  await jamie.goto(Portal.trainee(B, 'Jamie Ortiz', BATCH)); await jamie.waitForSelector('#device .lcd');
  await riley.goto(Portal.trainee(B, 'Riley Park', BATCH)); await riley.waitForSelector('#device .lcd');
  await sam.goto(Portal.trainee(B, 'Sam Lee', BATCH)); await sam.waitForSelector('#device .lcd');
  await tr.goto(Portal.trainer(B, 'Coach Dee')); await tr.waitForSelector('#dialer .dialpad');
  const ext = {};
  for (const [n, p] of [['jamie', jamie], ['riley', riley], ['sam', sam]]) { await p.waitForFunction(() => App.myExt); ext[n] = await p.evaluate(() => App.myExt); }
  await jamie.waitForFunction((e) => (App.peers || []).some((x) => x.ext === e), ext.sam);
  ok(`Three trainees on one batch (ext ${ext.jamie}, ${ext.riley}, ${ext.sam}) and a trainer`);

  /* 🤝 A practice call between trainees: Jamie dials Riley on the keypad and plays the caller. */
  await key(jamie, ext.riley);
  await jamie.screenshot({ path: OUT + '/18-trainee-dial.png' });
  const lcd = await jamie.textContent('#device .lcd');
  if (!/Trainee line/.test(lcd) || !/Riley Park/.test(lcd) || !/practice call/.test(lcd)) throw new Error('The keypad should find the trainee: ' + lcd);
  if (await jamie.$eval('#device .dial-call', (b) => b.disabled)) throw new Error('📞 should ring a trainee from an idle phone');
  await jamie.click('#device [data-act="dialcall"]');
  await jamie.waitForFunction(() => App.p && App.p.out && App.p.callId);
  await riley.waitForSelector('.lcd.ringing', { timeout: 20000 });
  if (!/practice call from Jamie Ortiz/i.test(await dev(riley))) throw new Error('Riley should see who the practice call is from: ' + await dev(riley));
  if (!/JAMIE ORTIZ/.test(await riley.textContent('.lcd-name'))) throw new Error('Caller ID should be the trainee who dialed');
  ok('🤝 Jamie dialed Riley\'s extension on the keypad: Riley\'s phone rings with Jamie on the caller ID and "a practice call from Jamie Ortiz"');
  await riley.click('[data-act="answer"]');
  await riley.waitForSelector('.lcd.live', { timeout: 20000 });
  await jamie.waitForFunction(() => App.p && App.p.status === 'live', null, { timeout: 20000 });
  if (!/You're the caller/.test(await jamie.textContent('#work'))) throw new Error('The trainee who dialed should get the caller\'s card');
  await sleep(2500);
  const pa = await inb(jamie), pb = await inb(riley);
  if (!(pa > 2000 && pb > 2000)) throw new Error('No audio on the practice call: ' + JSON.stringify({ pa, pb }));
  ok(`Riley answered: audio both ways (${pa} B and ${pb} B), and Jamie gets the 🎭 caller's card`);
  await riley.click('#device [data-act="hold"]');
  await jamie.waitForFunction(() => /put you on hold/.test(document.querySelector('#device').textContent), null, { timeout: 10000 });
  await riley.click('#device [data-act="hold"]');
  await jamie.waitForFunction(() => !App.p.held);
  ok('Riley put the caller on hold (Jamie is told, and hears the music) and took them back');
  await riley.click('#device [data-act="transfer"]');
  await riley.waitForSelector('.modal [data-tx="cold"][data-ext="201"]');
  if (!(await riley.$eval('.modal [data-tx][data-tid]', (b) => b.disabled))) throw new Error('A practice call between trainees can\'t go to a third trainee');
  await riley.click('.modal [data-tx="cold"][data-ext="201"]');
  await riley.waitForFunction(() => App.p && App.p.status === 'ended', null, { timeout: 15000 });
  await jamie.waitForFunction(() => App.p && App.p.status === 'ended', null, { timeout: 15000 });
  if (!/transferred you/.test(await dev(jamie))) throw new Error('Jamie should be told they were transferred: ' + await dev(jamie));
  const peerCall = await riley.evaluate(async () => (await API.post('/api/calls', { limit: 1 })).calls[0]);
  if (peerCall.mode !== 'peer' || peerCall.graded) throw new Error('The practice call should be kept as an ungraded peer call: ' + JSON.stringify(peerCall));
  ok('↪ Riley transferred the practice call to Atty. Reyes (201): it ends on both phones, and is kept as an ungraded 🤝 practice call');
  await jamie.click('#device [data-act="next"]');
  await reset(riley);

  // The trainer rings Jamie with an open call.
  const ring = async (p, e) => {
    for (const d of e) await tr.click(`#dialer [data-dk="${d}"]`);
    await tr.click('[data-act="ring"]');
    await p.waitForSelector('.lcd.ringing', { timeout: 20000 });
    await p.click('[data-act="answer"]');
    await p.waitForSelector('.lcd.live', { timeout: 20000 });
    await tr.waitForFunction(() => App.t && App.t.status === 'live', null, { timeout: 20000 });
  };
  await ring(jamie, ext.jamie);
  if (!(await jamie.$('#device [data-act="merge"]'))) throw new Error('A live call should have the 👥 Merge key');
  await jamie.screenshot({ path: OUT + '/17-trainee-call-keys.png' });
  ok('The trainer rang Jamie; Jamie\'s phone has Mute, Hold, 👥 Merge and Transfer');

  /* 👥 Merge: Jamie rings Sam into the call from their own phone. */
  await jamie.click('#device [data-act="merge"]');
  await jamie.waitForSelector(`.modal [data-tx="merge"]`);
  await jamie.click(`.modal [data-tx="merge"][data-tid="${await sam.evaluate(() => App.me.id)}"]`);
  await sam.waitForSelector('.lcd.ringing', { timeout: 20000 });
  await sam.click('[data-act="answer"]');
  await sam.waitForSelector('.lcd.live', { timeout: 20000 });
  await jamie.waitForFunction(() => /Conference call/.test(document.querySelector('#device').textContent), null, { timeout: 20000 });
  await tr.waitForFunction(() => App.t.legs.length === 1 && App.t.legs[0].status === 'live' && App.t.mix && !App.t.mix.private, null, { timeout: 20000 });
  await sleep(2500);
  if (!((await inb(sam)) > 2000)) throw new Error('No audio for the merged trainee');
  ok('👥 Jamie merged Sam into the call from their own phone: Sam answered, everyone hears everyone (the trainer\'s console bridges it)');
  await sam.click('[data-act="hangup"]');
  await tr.waitForFunction(() => !App.t.legs.length && !App.t.mix, null, { timeout: 20000 });
  await jamie.waitForFunction(() => !/Conference call/.test(document.querySelector('#device').textContent), null, { timeout: 20000 });
  ok('Sam left the conference: Jamie and the caller carry on, back on the plain microphone');
  await reset(sam);

  /* 🗣 Warm transfer to Riley: the caller holds while the two trainees speak, then all three are merged. */
  const rileyId = await riley.evaluate(() => App.me.id);
  const warm = async () => {
    await jamie.click('#device [data-act="transfer"]');
    await jamie.waitForSelector(`.modal [data-tx="warm"][data-tid="${rileyId}"]`);
    await jamie.click(`.modal [data-tx="warm"][data-tid="${rileyId}"]`);
    await jamie.waitForFunction(() => App.p.held && App.p.transfer && App.p.transfer.state === 'ringing');
    await riley.waitForSelector('.lcd.ringing', { timeout: 20000 });
    if (!/wants to transfer a caller to you/.test(await dev(riley))) throw new Error('Riley should be told it\'s a warm transfer: ' + await dev(riley));
    await riley.click('[data-act="answer"]');
    await riley.waitForSelector('.lcd.live', { timeout: 20000 });
    await jamie.waitForFunction(() => App.p.transfer && App.p.transfer.state === 'consult', null, { timeout: 20000 });
    await tr.waitForFunction(() => App.t.mix && App.t.mix.private && App.t.holdMusic && document.getElementById('remoteAudio').muted, null, { timeout: 20000 });
  };
  await warm();
  await sleep(2500);
  const priv = await tr.evaluate(() => ({ mic: VoIP.Mic.track().id, out: [App.t.rtc.sender.track.id, App.t.legs[0].rtc.sender.track.id] }));
  if (priv.out.includes(priv.mic)) throw new Error('During a warm word the caller\'s microphone should be left out: ' + JSON.stringify(priv));
  const w1 = await inb(riley);
  if (!(w1 > 2000)) throw new Error('No audio between the trainees on the warm transfer');
  if (!/picked up/.test(await dev(jamie)) || !(await jamie.$('[data-act="tx-complete"]')) || !(await jamie.$('[data-act="tx-merge"]'))) throw new Error('Jamie should get Complete / Merge / Back to the caller: ' + await dev(jamie));
  ok(`🗣 Warm transfer: the caller holds (the trainer hears hold music) while Jamie and Riley speak privately (${w1} B), and Jamie gets ↪ Complete, 👥 Merge all three and ⏸ Back to the caller`);
  await jamie.click('[data-act="tx-merge"]');
  await tr.waitForFunction(() => App.t.mix && !App.t.mix.private && !App.t.holdMusic && !document.getElementById('remoteAudio').muted, null, { timeout: 20000 });
  await jamie.waitForFunction(() => !App.p.held && !App.p.transfer, null, { timeout: 10000 });
  await riley.waitForFunction(() => /Conference call/.test(document.querySelector('#device').textContent), null, { timeout: 20000 });
  ok('👥 Merge all three: the caller is back on the line with both trainees, hold over');
  await riley.click('[data-act="hangup"]');
  await tr.waitForFunction(() => !App.t.legs.length, null, { timeout: 20000 });
  await reset(riley);

  /* 🗣 Warm transfer again, this time handed over: Riley gets the caller and Jamie's call ends. */
  const firstCall = await tr.evaluate(() => App.t.callId);
  await warm();
  await jamie.click('[data-act="tx-complete"]');
  await tr.waitForFunction((id) => App.t && App.t.callId !== id && App.t.trainee.name === 'Riley Park' && !App.t.holdMusic, firstCall, { timeout: 25000 });
  await jamie.waitForFunction(() => App.p && App.p.status === 'ended' && /Transferred to Riley Park/.test(App.p.endNote), null, { timeout: 20000 });
  await riley.waitForFunction(() => App.p && App.p.handedFrom === 'Jamie Ortiz' && !App.p.consultFrom, null, { timeout: 20000 });
  await tr.waitForFunction(() => App.t.status === 'live', null, { timeout: 20000 });
  await sleep(2500);
  if (!((await inb(riley)) > 2000)) throw new Error('No audio after the warm transfer was completed');
  const done = await tr.evaluate(async (id) => (await API.post('/api/call', { id })).call, firstCall);
  const tx = (done.metrics.transfers || []).filter((x) => x.trainee);
  if (done.status !== 'ended' || !tx.some((x) => x.kind === 'warm' && x.result === 'merged') || !tx.some((x) => x.kind === 'warm' && x.result === 'connected')) throw new Error('The first call should record both warm transfers: ' + JSON.stringify(done.metrics.transfers));
  ok('↪ Completed the warm transfer: the caller is on the line with Riley, Jamie\'s call ended ("Transferred to Riley Park"), and the call records both warm transfers for the scorecard');
  await jamie.click('#work [data-act="submit"]').catch(() => {});

  /* A warm transfer the other trainee declines: the caller is back on hold music until Riley presses Resume. */
  const samId = await sam.evaluate(() => App.me.id);
  await riley.click('#device [data-act="transfer"]');
  await riley.waitForSelector(`.modal [data-tx="warm"][data-tid="${samId}"]`);
  await riley.click(`.modal [data-tx="warm"][data-tid="${samId}"]`);
  await sam.waitForSelector('.lcd.ringing', { timeout: 20000 });
  await sam.click('[data-act="decline"]');
  await riley.waitForFunction(() => App.p.transfer && App.p.transfer.state === 'declined' && App.p.held && App.p.music, null, { timeout: 20000 });
  if (!/declined/.test(await dev(riley))) throw new Error('Riley should be told Sam declined: ' + await dev(riley));
  await tr.waitForFunction(() => !App.t.legs.length, null, { timeout: 20000 });
  await riley.click('#device [data-act="hold"]');
  await riley.waitForFunction(() => !App.p.held && !App.p.transfer && !App.p.music);
  await reset(sam);
  ok('A warm transfer Sam declined: Riley is told, the caller is back on hold music, and Resume takes them back');

  /* ↪ Cold transfer from the keypad: Riley keys in Sam's extension on the call. */
  await key(riley, ext.sam);
  await riley.click('#device [data-act="dialcall"]');
  await riley.waitForSelector('.modal [data-tx="cold"]');
  await riley.click('.modal [data-tx="cold"]');
  await sam.waitForSelector('.lcd.ringing', { timeout: 20000 });
  if (!/transferred to you/i.test(await dev(sam))) throw new Error('Sam should be told the call was transferred: ' + await dev(sam));
  const secondCall = await tr.evaluate(() => App.t.callId);
  await sam.click('[data-act="answer"]');
  await sam.waitForSelector('.lcd.live', { timeout: 20000 });
  await tr.waitForFunction((id) => App.t && App.t.callId !== id && App.t.trainee.name === 'Sam Lee', secondCall, { timeout: 25000 });
  await riley.waitForFunction(() => App.p && App.p.status === 'ended', null, { timeout: 20000 });
  await tr.waitForFunction(() => App.t.status === 'live', null, { timeout: 20000 });
  ok('↪ Cold transfer from the keypad: Riley keyed in Sam\'s extension, Sam\'s phone said it was transferred, and the caller went straight through');

  /* 🗣 Warm transfer to a firm extension: the trainer answers as the attorney, Sam announces the caller, then completes it. */
  await sam.click('#device [data-act="transfer"]');
  await sam.waitForSelector('.modal [data-tx="warm"][data-ext="202"]');
  await sam.click('.modal [data-tx="warm"][data-ext="202"]');
  await tr.waitForSelector('#xfer [data-xfer="consult"]', { timeout: 20000 });
  if (!/warm-transferring you to Atty. Elena Brooks/.test(await tr.textContent('#xfer'))) throw new Error('The trainer should see it\'s a warm transfer');
  await tr.click('#xfer [data-xfer="consult"]');
  await sam.waitForFunction(() => App.p.transfer && App.p.transfer.state === 'consult' && !App.p.music, null, { timeout: 20000 });
  if (!/You're Atty. Elena Brooks/.test(await tr.textContent('#xfer'))) throw new Error('The trainer should be told they are the attorney now');
  const samCall = await tr.evaluate(() => App.t.callId);
  await sam.click('[data-act="tx-complete"]');
  await sam.waitForFunction(() => App.p && App.p.status === 'ended', null, { timeout: 20000 });
  await tr.waitForFunction(() => !App.t || App.t.status === 'ended', null, { timeout: 20000 });
  const fx = await tr.evaluate(async (id) => (await API.post("/api/call", { id })).call.metrics.transfers, samCall);
  if (!fx.some((x) => x.ext === '202' && x.kind === 'warm' && x.result === 'connected' && x.consultAt)) throw new Error('The warm firm transfer should be recorded: ' + JSON.stringify(fx));
  ok('🗣 Warm transfer to Atty. Brooks (202): the trainer answered as the attorney, Sam announced the caller, then completed the transfer');
  await sam.screenshot({ path: OUT + '/16-trainee-warm-transfer.png' });

  await browser.close();
  console.log('\nALL PASSED');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
