// End-to-end: a trainer rings a trainee, live WebRTC audio, hold, transfer, coaching, note, hang-up, recording, scoring, reload mid-call.
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
  const mk = async () => { const c = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1360, height: 900 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGE ERROR', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); }); return p; };
  const tr = await mk(), te = await mk();

  // Both open Ring Channel from the LSH Training Portal: no sign-in form
  await te.goto(Portal.trainee(B, 'Jamie Cruz', 'B093026'));
  await te.waitForSelector('#device .lcd');
  ok('Trainee opened Ring Channel from the Portal: signed in, phone is showing');

  // Ring Channel's own link has no sign-in form for anyone to guess at
  const other = await mk();
  await other.goto(B + '/');
  await other.waitForSelector('#toPortal');
  if (await other.$('#fTrainee, #tn, #tp')) throw new Error('A trainee sign-in form is still there');
  const live = await other.evaluate(async () => (await fetch('/api/auth/trainee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Jamie Cruz', batch: 'B093026', pin: '0000' }) })).status);
  if (live !== 401 && live !== 404) throw new Error('The old trainee sign-in still answers: ' + live);
  await other.close();
  ok('Ring Channel\'s own link shows the way to the Portal, with no trainee sign-in form (and the old sign-in is gone)');
  await tr.goto(Portal.trainer(B, 'Coach Ana'));
  await tr.waitForSelector('#roster .tr[data-tid]');
  const ext = (await tr.textContent('#roster .tr[data-tid] .bt')).match(/ext (\d+)/);
  if (!ext || ext[1] !== '7001') throw new Error('The trainee should have desk extension 7001: ' + (await tr.textContent('#roster .tr[data-tid] .bt')));
  if (!/ext 7001/.test(await te.textContent('#device .dev-head'))) throw new Error('The trainee\'s phone should show its extension');
  if ((await tr.evaluate(() => App.me.name)) !== 'Coach Ana') throw new Error('The trainer should be signed in under their Portal name');
  ok('Trainer opened Ring Channel from the Portal (on the console, as Coach Ana); trainee appears on the switchboard with desk extension 7001 (also on their phone)');

  // Trainee raises a hand
  await te.click('[data-act="hand"]');
  await tr.waitForSelector('#roster .hand-wave');
  ok('Trainee "Ask for a call" shows ✋ on the trainer switchboard');
  await te.screenshot({ path: OUT + '/01-trainee-idle.png' });

  // Trainer dials the trainee's extension on the dialer's keypad, picks the call to play, and rings
  for (const d of '7001') await tr.click(`#dialer [data-dk="${d}"]`);
  await tr.waitForFunction(() => /Ready to call/.test(document.querySelector('#dialer .lcd').textContent) && /Jamie Cruz/.test(document.querySelector('#dialer .lcd').textContent));
  if ((await tr.textContent('#dlNum')).trim() !== '7001') throw new Error('The dialer shows ' + await tr.textContent('#dlNum'));
  await tr.click('#pkList .scen[data-sid="ft_rc_offer"]');
  if (!/LIBERTY CREST INS/.test(await tr.textContent('#dialer .lcd-cid'))) throw new Error('The dialer should show the caller ID the trainee will see');
  if (!(await tr.isChecked('#pkGraded'))) throw new Error('New live calls should start as graded mock calls');
  ok('Dialer: 7001 on the keypad finds Jamie Cruz ("Ready to call"), with the caller ID the trainee will see');
  // 🔊 Speaker on the dialer: lights up, shows on the screen, sends the call audio to the speaker output
  await tr.click('#dialer [data-act="speaker"]');
  await tr.waitForSelector('#dialer .key.spk.on');
  if (!/SPEAKER/.test(await tr.textContent('#dialer .lcd-badges'))) throw new Error('The dialer screen should show SPEAKER');
  if (!(await tr.evaluate(() => VoIP.Speaker.on && JSON.parse(localStorage.getItem('mcv_speaker')).on))) throw new Error('Speaker state not kept');
  await tr.screenshot({ path: OUT + '/02-trainer-picker.png', fullPage: true });
  await tr.click('#dialer [data-act="speaker"]');
  await tr.waitForSelector('#dialer .key.spk:not(.on)');
  ok('🔊 Speaker key turns on (lit, SPEAKER on the screen, kept on this computer) and back off');
  await tr.click('#dialer [data-act="miccheck"]');
  await tr.waitForSelector('.modal [data-out="speaker"]', { timeout: 10000 });
  const outs = await tr.$$eval('.modal [data-out="speaker"] option', (o) => o.length);
  await tr.click('.modal [data-out="test-speaker"]');
  await tr.click('.modal [data-x]');
  ok(`🎧 Audio check lists the outputs for the headset and the speaker (${outs} choices) and plays a test tone`);
  await tr.click('[data-act="ring"]');
  await te.waitForSelector('.lcd.ringing');
  const cid = await te.textContent('.lcd-name');
  ok(`Trainee phone rings with caller ID "${cid}"`);
  await te.screenshot({ path: OUT + '/03-trainee-ringing.png' });
  await sleep(1500);
  await te.click('[data-act="answer"]');
  await te.waitForSelector('.lcd.live', { timeout: 20000 });
  await tr.waitForSelector('#dialer .lcd-timer', { timeout: 20000 });
  ok('Answered: both sides connected over WebRTC');
  if (!/GRADED/.test(await tr.textContent('#dialer'))) throw new Error('The dialer should show GRADED');
  if (!/Ext 7001/.test(await tr.textContent('#dialer .lcd'))) throw new Error('The dialer should show who is on the line');

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

  // 🔊 Speaker on a call: the trainee's phone and the trainer's dialer, and the call keeps playing
  await te.click('#device [data-act="speaker"]');
  await te.waitForFunction(() => /SPEAKER/.test(document.querySelector('#device .lcd-badges').textContent) && document.querySelector('#device .key.spk.on'));
  await tr.click('#dialer [data-act="speaker"]');
  await tr.waitForFunction(() => /SPEAKER/.test(document.querySelector('#dialer .lcd-badges').textContent));
  await sleep(1200);
  const playing = await Promise.all([te, tr].map((p) => p.evaluate(() => { const a = document.getElementById('remoteAudio'); return !!a.srcObject && !a.paused; })));
  if (!playing.every(Boolean)) throw new Error('The call stopped playing when the speaker came on: ' + playing);
  await te.click('#device [data-act="speaker"]');
  await tr.click('#dialer [data-act="speaker"]');
  await te.waitForFunction(() => !/SPEAKER/.test(document.querySelector('#device .lcd-badges').textContent));
  await tr.waitForFunction(() => !/SPEAKER/.test(document.querySelector('#dialer .lcd-badges').textContent));
  ok('🔊 Speaker on the call (trainee phone and trainer dialer): shown on both screens, the call keeps playing, and back to the headset');

  // Live note
  await te.fill('[data-k="caller"]', 'Greg Hollis, adjuster at Liberty Crest');
  await te.fill('[data-k="callback"]', '(555) 010-7788');
  await tr.waitForFunction(() => /Greg Hollis/.test(document.querySelector('#liveNote').textContent) && /010-7788/.test(document.querySelector('#liveNote').textContent));
  ok('Trainer sees the trainee\'s note as it is typed');

  // 📺 Class view for Google Meet: plays the trainee's side of the call, shows the note, never the script
  const [cv] = await Promise.all([tr.context().waitForEvent('page'), tr.click('#dialer [data-act="classview"]')]);
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
  await tr.waitForFunction(() => /ON HOLD/.test(document.querySelector('#dialer').textContent));
  await cv.waitForFunction(() => /Caller on hold/.test(document.querySelector('#cvBody').textContent), null, { timeout: 5000 });
  await sleep(1500);
  const heldLevel = await inb(tr, 't');
  ok(`Hold: trainer sees "on hold" (hold music level ${heldLevel.level.toFixed(3)})`);
  await te.click('[data-act="hold"]');
  await tr.waitForFunction(() => !/ON HOLD/.test(document.querySelector('#dialer').textContent));
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
  const liveBar = await tr.$('#dialer .lcd-timer');
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
  await tr.waitForSelector('#dialer .lcd-timer', { timeout: 20000 });
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

  // The AI grades the call by itself (recording + note), on the Reception Mock Calls Metrics
  await tr.waitForFunction(() => /Autograded/.test((document.querySelector('#endedInfo') || {}).textContent || ''), null, { timeout: 30000 });
  ok('Nobody clicked anything: the call was autograded once the note was in (the console says so)');
  await tr.click('a[href^="#/call/"]');
  await tr.waitForSelector('#scoreForm');
  await tr.waitForFunction(() => /Autograded from the recording/.test(document.querySelector('#scoreForm').textContent), null, { timeout: 20000 });
  const rows = await tr.$$eval('#scoreForm table.sheet tbody tr', (x) => x.length);
  if (rows !== 15) throw new Error('Expected 14 Reception metrics + the weighted average, got ' + rows);
  const avgText = await tr.textContent('#scAvg');
  ok(`The scorecard has the 14 Reception metrics filled in by the AI from the recording, weighted average ${avgText}`);
  await tr.waitForSelector('#trCard');
  ok('The AI transcribed the recording (transcript on the review page)');
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
  ok(`The call's checklist carries ${goalsYes} goals marked met`);
  await tr.click('[data-sc="approve"]');
  await tr.waitForFunction(() => /Sent/.test(document.querySelector('#scoreForm').textContent));
  ok('Trainer approved the AI grade and sent it with one click');
  const hdr = await tr.textContent('#callStatus');
  if (!/Sent/.test(hdr)) throw new Error('The header still says: ' + hdr);
  const naTop = await tr.evaluate(() => { const d = document.querySelector('[data-crit="0"]'); const b = d.querySelectorAll('button'); return b[b.length - 1].offsetTop - b[0].offsetTop; });
  if (naTop > 4) throw new Error('The n/a button wraps under the 1 to 5 scores');
  ok('The header shows "Sent" after approving, and each metric\'s scores fit on one line');
  await tr.screenshot({ path: OUT + '/07-trainer-scorecard.png', fullPage: true });
  // Editing after sending: "Save draft" keeps the changes from the trainee until they're sent
  await tr.fill('[data-f="summary"]', 'DRAFT CHANGES NOT SENT');
  await tr.click('[data-sc="save"]');
  await tr.waitForFunction(() => /Unsent changes/.test(document.querySelector('#scoreForm').textContent));
  ok('"Save draft" after sending keeps the edits as unsent changes');

  // 📋 Graded calls: the report and its CSV
  await tr.click('a[href="#/graded"]');
  await tr.waitForSelector('table.graded td.gcell');
  const gRow = await tr.textContent('table.graded tbody tr');
  if (!/Jamie Cruz/.test(gRow) || !/\d+%/.test(gRow)) throw new Error('Graded report row: ' + gRow);
  const [csv] = await Promise.all([tr.waitForEvent('download'), tr.click('#gCsv')]);
  const csvText = require('fs').readFileSync(await csv.path(), 'utf8');
  if (!/Introduction of Law Firm and Name \(score\)/.test(csvText) || !/Jamie Cruz/.test(csvText) || !/Tone of Voice \(feedback\)/.test(csvText)) throw new Error('CSV: ' + csvText.slice(0, 300));
  ok(`Graded calls report shows Jamie's Reception grade, and the CSV export has every metric's score and feedback (${csv.suggestedFilename()})`);
  await tr.screenshot({ path: OUT + '/10-graded-report.png', fullPage: true });

  // Trainee reads it
  await te.goto(B + '/#/calls');
  await te.waitForSelector('[data-open]');
  const row = await te.textContent('[data-open]');
  if (!/%/.test(row)) throw new Error('No score in My calls: ' + row);
  ok(`Trainee's My calls shows the score (${row.match(/\d+%/)[0]})`);
  await te.click('[data-open]');
  await te.waitForFunction(() => /Your trainer's review/.test(document.body.textContent));
  await te.waitForFunction(() => /WEIGHTED AVERAGE/.test(document.body.textContent) && /Introduction of Law Firm and Name/.test(document.body.textContent));
  ok('The trainee sees the graded scorecard: every metric with its score and feedback, and the weighted average');
  await te.screenshot({ path: OUT + '/08-trainee-review.png', fullPage: true });
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
  // An open call: no script picked. The line key picks the line (Intake), and the trainer improvises the caller.
  const top = await tr.evaluate(() => [document.querySelector('#dialer').getBoundingClientRect().top, document.querySelector('#pkList').getBoundingClientRect().top]);
  if (!(top[1] > top[0] + 400)) throw new Error('The call list should sit under the dialer: ' + top);
  await tr.click('#pkList .scen.open');
  await tr.click('#dialer [data-line="intake"]');
  await tr.waitForFunction(() => /Open call: no script/.test(document.querySelector('#dialer .lcd-cid').textContent) && /Intake Line/.test(document.querySelector('#dialer .lcd-cid').textContent));
  for (const d of '7001') await tr.click(`#dialer [data-dk="${d}"]`);
  await tr.click('[data-act="ring"]');
  await te.waitForSelector('.lcd.ringing');
  const oc = await te.textContent('#device .lcd');
  if (!/WIRELESS CALLER/.test(oc) || !/Intake Line/.test(oc)) throw new Error('Open call on the trainee phone: ' + oc);
  await te.click('[data-act="answer"]');
  await tr.waitForSelector('#dialer .lcd-timer', { timeout: 20000 });
  const ocStage = await tr.textContent('#dialSide');
  if (!/Open call: no script/.test(ocStage) || !/No checklist on an open call/.test(ocStage)) throw new Error('Open call stage: ' + ocStage.slice(0, 200));
  await tr.selectOption('#ocCase', 'MC-02');
  await tr.waitForFunction(() => !document.querySelector('#ocCaseText').classList.contains('hidden'));
  if (!/Intake note/i.test(await te.textContent('#work'))) throw new Error('The trainee should get the Intake note on an Intake open call');
  await tr.screenshot({ path: OUT + '/15-open-call.png', fullPage: true });
  await tr.click('[data-act="hangup"]');
  await tr.waitForSelector('#dialer [data-act="newcall"]');
  await tr.click('#dialer [data-act="newcall"]');
  ok('Open call with no script: the Intake line key rings WIRELESS CALLER on the Intake Line; the trainer gets an open-call card (case files to play from) and the trainee the Intake note');
  await te.goto(B + '/#/phone');
  await te.waitForSelector('#device .lcd');
  // Typing on the keyboard dials too; a firm extension isn't a trainee; Esc clears; Enter rings
  await tr.click('#pkTrack [data-track="reception"]');
  await tr.click('#pkList .scen[data-sid="ft_rc_appt"]');
  if (!(await tr.$('#dialer [data-line="reception"].on'))) throw new Error('Picking a Reception call should put the dialer on the Reception line');
  await tr.keyboard.type('201');
  await tr.waitForFunction(() => /Firm extension/.test(document.querySelector('#dialer .lcd').textContent) && /Marcus Reyes/.test(document.querySelector('#dialer .lcd').textContent));
  await tr.keyboard.press('Escape');
  await tr.waitForFunction(() => document.querySelector('#dlNum').textContent.trim() === '');
  await tr.keyboard.type('7001');
  await tr.waitForFunction(() => /Ready to call/.test(document.querySelector('#dialer .lcd').textContent));
  await tr.keyboard.press('Enter');
  await te.waitForSelector('.lcd.ringing');
  ok('Keyboard dialing: 201 shows the firm\'s Atty. Reyes (not a trainee), Esc clears, 7001 + Enter rings');
  await te.click('[data-act="decline"]');
  await tr.waitForSelector('#dialer .dialpad');
  ok('Declined call: the trainer is told and the dialer is ready for the next call');
  for (const w of [1024, 390]) {
    await tr.setViewportSize({ width: w, height: 844 });
    await sleep(300);
    const over = await tr.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 1) {
      const wide = await tr.evaluate(() => [...document.querySelectorAll('#app *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .filter((e) => ![...e.children].some((c) => c.getBoundingClientRect().right > innerWidth + 1)).slice(0, 6).map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${[...e.classList].join('.')} (${Math.round(e.getBoundingClientRect().right)}px)`));
      throw new Error(`The console is ${over}px too wide at ${w}px: ${wide.join(', ')}`);
    }
    await tr.screenshot({ path: `${OUT}/14-dialer-${w}.png`, fullPage: true });
  }
  ok('The console and its dialer fit a tablet (1024 px) and a phone (390 px) without sideways scrolling');

  await browser.close();
  console.log('\nALL PASSED');
})().catch(async (e) => { console.error('❌ FAILED at step', step + 1, e.message); process.exit(1); });
