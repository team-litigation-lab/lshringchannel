// End-to-end: a trainer rings a trainee, live WebRTC audio, hold, transfer, coaching, note, hang-up, recording, scoring, reload mid-call.
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
  const mk = async () => { const c = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1360, height: 900 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGE ERROR', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); }); return p; };
  const tr = await mk(), te = await mk();

  // Sign in
  await te.goto(B + '/');
  await te.fill('#tn', 'Jamie Cruz'); await te.fill('#tb', 'B093026'); await te.fill('#tp', '4321');
  await te.click('#fTrainee button');
  await te.waitForSelector('#device .lcd');
  ok('Trainee signed in (first time: chose a PIN), phone is showing');

  // Someone else can't sign in as Jamie without the PIN
  const other = await mk();
  await other.goto(B + '/');
  await other.fill('#tn', 'Jamie Cruz'); await other.fill('#tb', 'B093026'); await other.fill('#tp', '0000');
  await other.click('#fTrainee button');
  await other.waitForSelector('#tErr:not(.hidden)');
  const why = await other.textContent('#tErr');
  if (!/PIN isn't right/.test(why)) throw new Error('Wrong PIN not refused: ' + why);
  const live = await other.evaluate(async () => { const r = await fetch('/api/auth/trainee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Jamie Cruz', batch: 'B093026' }) }); return r.status; });
  if (live !== 400) throw new Error('Sign-in without a PIN not refused: ' + live);
  await other.close();
  ok('Signing in as another trainee with a wrong PIN (or none) is refused');
  await tr.goto(B + '/');
  await tr.fill('#an', 'Coach Ana'); await tr.fill('#ap', 'test-pass');
  await tr.click('#fTrainer button');
  await tr.waitForSelector('#roster .tr[data-tid]');
  ok('Trainer signed in; trainee appears on the switchboard');

  // Trainee raises a hand
  await te.click('[data-act="hand"]');
  await tr.waitForSelector('#roster .hand-wave');
  ok('Trainee "Ask for a call" shows ✋ on the trainer switchboard');
  await te.screenshot({ path: OUT + '/01-trainee-idle.png' });

  // Trainer picks the trainee + a scenario and rings
  await tr.click('#roster .tr[data-tid]');
  await tr.click('#pkList .scen[data-sid="ft_rc_offer"]');
  await tr.screenshot({ path: OUT + '/02-trainer-picker.png', fullPage: true });
  await tr.click('[data-act="ring"]');
  await te.waitForSelector('.lcd.ringing');
  const cid = await te.textContent('.lcd-name');
  ok(`Trainee phone rings with caller ID "${cid}"`);
  await te.screenshot({ path: OUT + '/03-trainee-ringing.png' });
  await sleep(1500);
  await te.click('[data-act="answer"]');
  await te.waitForSelector('.lcd.live', { timeout: 20000 });
  await tr.waitForSelector('#callbar .t', { timeout: 20000 });
  ok('Answered: both sides connected over WebRTC');

  // Audio flows both ways
  await sleep(3000);
  const inb = async (p, path) => p.evaluate(async (path) => {
    const pc = path === 'p' ? App.p.rtc.pc : App.t.rtc.pc;
    const st = await pc.getStats(); let bytes = 0, level = 0, pair = '';
    st.forEach((s) => { if (s.type === 'inbound-rtp' && s.kind === 'audio') { bytes = s.bytesReceived; level = s.audioLevel || 0; } if (s.type === 'candidate-pair' && s.nominated) pair = s.state; });
    return { bytes, level, pair };
  }, path);
  const a1 = await inb(te, 'p'), a2 = await inb(tr, 't');
  if (!(a1.bytes > 2000 && a2.bytes > 2000)) throw new Error('No audio: ' + JSON.stringify({ a1, a2 }));
  ok(`Audio both ways: trainee received ${a1.bytes} B (level ${a1.level.toFixed(3)}), trainer received ${a2.bytes} B (level ${a2.level.toFixed(3)})`);

  // Live note
  await te.fill('[data-k="caller"]', 'Greg Hollis, adjuster at Liberty Crest');
  await te.fill('[data-k="callback"]', '(555) 010-7788');
  await tr.waitForFunction(() => /Greg Hollis/.test(document.querySelector('#liveNote').textContent) && /010-7788/.test(document.querySelector('#liveNote').textContent));
  ok('Trainer sees the trainee\'s note as it is typed');

  // 📺 Class view for Google Meet: plays the trainee's side of the call, shows the note, never the script
  const [cv] = await Promise.all([tr.context().waitForEvent('page'), tr.click('#callbar [data-act="classview"]')]);
  cv.on('pageerror', (e) => console.log('CLASS VIEW ERROR', e.message));
  await cv.waitForSelector('#cvStart');
  await cv.click('#cvStart');
  await cv.waitForFunction(() => /Playing the call/.test(document.querySelector('#cvAudioState').textContent), null, { timeout: 10000 });
  await sleep(1500);
  const cvAudio = await cv.evaluate(async () => {
    const a = document.querySelector('#cvAudio'), s = a.srcObject;
    const ctx = new AudioContext(), an = ctx.createAnalyser(); ctx.createMediaStreamSource(s).connect(an);
    // The fake microphone beeps with silence between, so listen for 2 seconds and keep the loudest moment.
    const d = new Uint8Array(an.fftSize); let peak = 0;
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 50)); an.getByteTimeDomainData(d); d.forEach((v) => (peak = Math.max(peak, Math.abs(v - 128)))); }
    return { playing: !a.paused, live: s.getAudioTracks()[0].readyState, peak };
  });
  if (!(cvAudio.playing && cvAudio.live === 'live' && cvAudio.peak > 0)) throw new Error('Class view audio: ' + JSON.stringify(cvAudio));
  await tr.waitForFunction(() => document.getElementById('remoteAudio').muted === true, null, { timeout: 5000 });
  ok(`Class view plays the call (level ${cvAudio.peak}) and the console goes quiet so the trainer doesn't hear it twice`);
  await te.waitForFunction(() => /class is listening/.test(document.querySelector('#device').textContent), null, { timeout: 5000 });
  ok('The trainee\'s phone reminds them the class is listening in Meet (mute the Meet tab)');
  const cvText = await cv.textContent('#cvBody');
  if (!/Jamie Cruz/.test(cvText) || !/Greg Hollis, adjuster at Liberty Crest/.test(cvText) || !/LIBERTY CREST INS/.test(cvText)) throw new Error('Class view content: ' + cvText.slice(0, 300));
  if (/Your offer on Robert Chen|What you know|An Offer With a Deadline/.test(await cv.textContent('body'))) throw new Error('Class view shows the script or the title during the call');
  ok('Class view shows the trainee, caller ID and live note, and never the script');

  // Hold with hold music
  await te.click('[data-act="hold"]');
  await tr.waitForFunction(() => /ON HOLD/.test(document.querySelector('#callbar').textContent));
  await cv.waitForFunction(() => /Caller on hold/.test(document.querySelector('#cvBody').textContent), null, { timeout: 5000 });
  await sleep(1500);
  const heldLevel = await inb(tr, 't');
  ok(`Hold: trainer sees "on hold" (hold music level ${heldLevel.level.toFixed(3)})`);
  await te.click('[data-act="hold"]');
  await tr.waitForFunction(() => !/ON HOLD/.test(document.querySelector('#callbar').textContent));
  ok('Resume: hold cleared on the trainer console');

  // Transfer → trainer answers "no answer"
  await te.click('[data-act="transfer"]');
  await te.click('.modal [data-act="transfer-to"][data-ext="201"]');
  await tr.waitForSelector('.xfer-panel');
  const scenSays = await tr.textContent('.xfer-panel');
  ok(`Transfer to 201 reaches the trainer (${/not available/.test(scenSays) ? 'panel says Reyes is not available' : 'no availability note'})`);
  await tr.screenshot({ path: OUT + '/04-trainer-live.png', fullPage: true });
  await tr.click('[data-xfer="no-answer"]');
  await te.waitForFunction(() => /No answer at ext 201/.test(document.querySelector('#device').textContent));
  ok('Trainee is told "No answer at ext 201"');
  await te.screenshot({ path: OUT + '/05-trainee-transfer-noanswer.png' });
  await te.click('[data-act="hold"]');   // resume back to the caller

  // Coaching time-out
  await tr.click('[data-act="coach"]');
  await te.waitForFunction(() => /Coaching time-out/.test(document.querySelector('#device').textContent));
  await tr.click('[data-act="coach"]');
  await te.waitForFunction(() => !/Coaching time-out/.test(document.querySelector('#device').textContent));
  ok('Coaching time-out shows on the trainee phone and clears');
  await cv.screenshot({ path: OUT + '/09-class-view.png' });
  await cv.close();
  await tr.waitForFunction(() => document.getElementById('remoteAudio').muted === false, null, { timeout: 5000 });
  ok('Closing the Class view brings the call audio back to the console');

  // Checklist tick
  await tr.click('#goals input[data-goal="0"]');
  await tr.click('#goals input[data-goal="2"]');

  // A second trainer tab doesn't take the call over by itself
  const tr2 = await tr.context().newPage();
  await tr2.goto(B + '/#/console');
  await tr2.waitForSelector('[data-act="takehere"]', { timeout: 15000 });
  await sleep(2500);
  const still = await inb(te, 'p');
  if (!(still.bytes > a1.bytes)) throw new Error('Audio stopped when a second tab opened');
  const liveBar = await tr.$('#callbar .t');
  if (!liveBar) throw new Error('The first tab lost the call');
  await tr2.close();
  ok('A second trainer tab shows "on a call in another tab" and leaves the call alone');

  // Reload the trainee's page mid-call → reconnect
  await te.reload();
  await te.waitForSelector('[data-act="rejoin"]', { timeout: 15000 });
  await te.click('[data-act="rejoin"]');
  await te.waitForSelector('.lcd.live', { timeout: 20000 });
  await sleep(3000);
  const a3 = await inb(te, 'p');
  if (!(a3.bytes > 1000)) throw new Error('No audio after rejoin: ' + JSON.stringify(a3));
  ok(`Trainee page reloaded mid-call and reconnected (audio ${a3.bytes} B)`);

  // Reload the trainer's console mid-call → it resumes
  await tr.reload();
  await tr.waitForSelector('#callbar .t', { timeout: 20000 });
  await sleep(4000);
  const a4 = await inb(tr, 't');
  if (!(a4.bytes > 1000)) throw new Error('No audio after trainer reload: ' + JSON.stringify(a4));
  ok(`Trainer console reloaded mid-call and resumed (audio ${a4.bytes} B)`);

  // Trainee keeps typing, then trainer ends the call
  await te.fill('[data-k="need"]', 'Offer of $65,000 on claim LC-25-99812 (Robert Chen), open until Friday 5:00 PM. Wants to know if the client will accept.');
  await te.selectOption('[data-k="urgency"]', 'Urgent');
  await te.fill('[data-k="routed"]', 'Tried Atty. Reyes (201), no answer. Priority message to Atty. Reyes and Grace Kim (313).');
  await te.fill('[data-k="initials"]', 'JC');
  await sleep(1200);
  await tr.click('[data-act="hangup"]');
  await te.waitForSelector('#submitNote');
  ok('Trainer ended the call; trainee sees the wrap-up');
  await tr.waitForFunction(() => /Recording saved|couldn't be saved|wasn't recorded/.test(document.querySelector('#stage').textContent), null, { timeout: 20000 });
  const recMsg = await tr.textContent('#endedInfo');
  if (!/Recording saved/.test(recMsg)) throw new Error('Recording: ' + recMsg);
  ok('Trainer console saved the call recording');
  await te.click('#submitNote');
  await te.waitForFunction(() => /Note submitted/.test(document.querySelector('#work').textContent));
  ok('Trainee submitted the note');
  await te.screenshot({ path: OUT + '/06-trainee-submitted.png' });

  // Trainer scores the call
  await tr.click('a[href^="#/call/"]');
  await tr.waitForSelector('#scoreForm');
  const hasRec = await tr.$('[data-act="loadrec"]');
  if (!hasRec) throw new Error('No recording on the review page');
  await tr.click('[data-act="loadrec"]');
  await tr.waitForSelector('audio.rec');
  const dur = await tr.evaluate(() => new Promise((r) => { const a = document.querySelector('audio.rec'); const f = () => r(a.duration); if (a.readyState >= 1) f(); else a.onloadedmetadata = f; setTimeout(() => r(a.duration), 4000); }));
  ok(`Review page plays the recording (${isFinite(dur) ? dur.toFixed(1) + ' s' : 'webm, duration streamed'})`);
  const [dl] = await Promise.all([tr.waitForEvent('download'), tr.click('#recDl')]);
  const dlName = dl.suggestedFilename();
  if (!/^Mock call - Jamie Cruz - An Offer With a Deadline - \d{4}-\d{2}-\d{2}\.webm$/.test(dlName)) throw new Error('Download name: ' + dlName);
  ok(`The recording downloads as "${dlName}"`);
  const goalsYes = await tr.$$eval('.seg button.yes.on', (x) => x.length);
  ok(`Scorecard pre-ticks the ${goalsYes} goals checked live`);
  await tr.selectOption('[data-f="verdict"]', 'Good, with Improvements Needed.');
  for (let i = 0; i < 4; i++) await tr.click(`[data-crit="${i}"] button[data-n="${4 + (i % 2)}"]`);
  await tr.fill('[data-f="summary"]', 'Good, with Improvements Needed. Demonstrated a good understanding of urgent routing: tried Atty. Reyes (201) live before taking a priority message with the amount, deadline and claim number. However, improvement is needed in reading the details back to the caller.');
  await tr.click('[data-sc="send"]');
  await tr.waitForFunction(() => /Sent/.test(document.querySelector('#scoreForm').textContent));
  ok('Trainer sent the review');
  // Editing after sending: "Save draft" keeps the changes from the trainee until they're sent
  await tr.fill('[data-f="summary"]', 'DRAFT CHANGES NOT SENT');
  await tr.click('[data-sc="save"]');
  await tr.waitForFunction(() => /Unsent changes/.test(document.querySelector('#scoreForm').textContent));
  ok('"Save draft" after sending keeps the edits as unsent changes');
  await tr.screenshot({ path: OUT + '/07-trainer-scorecard.png', fullPage: true });

  // Trainee reads it
  await te.goto(B + '/#/calls');
  await te.waitForSelector('[data-open]');
  const row = await te.textContent('[data-open]');
  if (!/%/.test(row)) throw new Error('No score in My calls: ' + row);
  ok(`Trainee's My calls shows the score (${row.match(/\d+%/)[0]})`);
  await te.click('[data-open]');
  await te.waitForFunction(() => /Your trainer's review/.test(document.body.textContent));
  const hidden = await te.evaluate(() => /Your offer on Robert Chen/.test(document.body.textContent));
  if (hidden) throw new Error('Trainee can see the caller script!');
  if (await te.evaluate(() => /DRAFT CHANGES NOT SENT/.test(document.body.textContent))) throw new Error('The trainee sees an unsent draft');
  ok('Trainee reads the trainer\'s review; the caller\'s script stays hidden');
  await te.screenshot({ path: OUT + '/08-trainee-review.png', fullPage: true });

  // Missed call: trainer rings, nobody answers → cancel
  await te.goto(B + '/#/phone');
  await te.waitForSelector('#device .lcd');
  await tr.goto(B + '/#/console');
  await tr.waitForSelector('#roster .tr[data-tid]');
  await tr.click('#roster .tr[data-tid]');
  await tr.click('#pkList .scen[data-sid="ft_rc_appt"]');
  await tr.click('[data-act="ring"]');
  await te.waitForSelector('.lcd.ringing');
  await te.click('[data-act="decline"]');
  await tr.waitForFunction(() => !document.querySelector('#callbar'));
  ok('Declined call: the trainer is told and the console resets');

  await browser.close();
  console.log('\nALL PASSED');
})().catch(async (e) => { console.error('❌ FAILED at step', step + 1, e.message); process.exit(1); });
