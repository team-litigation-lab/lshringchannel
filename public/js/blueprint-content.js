/* 🧭 The Ring Channel Blueprint\'s slides (lsh-blueprint.js draws them and makes the PDFs; it\'s the same file on
   every LSH platform). TRAINEE: the trainee\'s phone. TRAINER: the trainer\'s console (trainers only).
   A slide is { icon, title, points: [...], where, tip }. Change the wording here; the page and the PDFs are made
   from it each time, stamped with the deployed version. README → 🧭 Blueprint. */
(function () {
  'use strict';
  const TRAINEE = {
    sub: 'How to take mock calls on your training phone',
    slides: [
      { icon: '☎', title: 'What Ring Channel is', points: [
          'A training phone system in your browser for the Receptionist and Intake mock calls.',
          'Your trainer rings your phone and plays the caller over live audio; you handle the call like a real one.',
          'The call is recorded and graded on the program\'s Mock Calls Metrics for its line.',
          'No phone numbers and no phone bills: it all runs in Chrome or Edge.'],
        where: 'The LSH Training Portal → Training Directory → ☎ LSH Ring Channel.',
        tip: 'Wear a headset, and use Chrome or Edge on a computer.' },
      { icon: '🏠', title: 'Opening Ring Channel', points: [
          'There\'s no separate sign-in: sign in on the LSH Training Portal, then open ☎ LSH Ring Channel from the Training Directory.',
          'You arrive signed in, on your phone, as your Portal name and batch.',
          'Opening Ring Channel\'s own link only shows the way to the Portal.',
          '🎧 Audio check tests your microphone, headset and speaker before the first call.'],
        where: 'The LSH Training Portal · 📞 My phone → 🎧 Audio check.',
        tip: 'Keep the Portal open in its own tab: it\'s your way back in.' },
      { icon: '📞', title: 'My phone', points: [
          'Keep 📞 My phone open with your headset on. It shows your desk extension (ext 7001…): the number your trainer dials.',
          'Set ● Available when you\'re ready for a call, or ◌ Away when you step out.',
          '✋ Ask for a call raises your hand on your trainer\'s switchboard.'],
        where: 'Top bar → 📞 My phone.',
        tip: 'Stay on Available during mock-call sessions, even between calls.' },
      { icon: '🔔', title: 'Answering a call', points: [
          'When the phone rings, it shows the line (Main Line or Intake Line) and the caller ID.',
          'Answer within 3 rings: the phone counts them for your scorecard.',
          'Greet the caller the way the line\'s rules say, then find out who they are and why they\'re calling.'],
        where: '📞 My phone, when it rings.',
        tip: 'The caller ID can be withheld: never assume who\'s calling.' },
      { icon: '🗂', title: 'During the call', points: [
          '📝 Note: the message slip, the calendar entry or the intake note, depending on the line.',
          '🔎 Case lookup: the firm\'s case files, searched by name, phone, date of birth or case number.',
          '📇 Directory: the firm\'s extensions, with Transfer buttons.',
          '📘 Rules: the front-desk rules and the line\'s reminders.'],
        where: 'Beside the phone, while you\'re on a call.',
        tip: 'Verify the caller before you share anything from the file.' },
      { icon: '⏸', title: 'The phone\'s keys', points: [
          'Mute: the caller can\'t hear you. 🔊 Speaker: the call plays on your speakers instead of your headset.',
          'Hold: the caller hears hold music. The phone times every hold for your scorecard.',
          'Transfer: pick an extension; the caller is held while it rings, and it may not be answered.',
          'Hang up when the call is done.'],
        where: 'The phone\'s keys.',
        tip: 'Tell the caller before you put them on hold or transfer them.' },
      { icon: '📨', title: 'After the call', points: [
          'Finish your note and submit it.',
          'The AI grades a graded mock call from the recording and your note; your trainer checks the grade and sends it.',
          'Your scorecard appears in 🗂 My calls: each metric\'s score and feedback, the weighted average and tips.',
          'If a connection drops, the phone has 30 seconds to come back; a reload offers 🔊 Reconnect the call.'],
        where: 'Top bar → 🗂 My calls.',
        tip: 'Read every scorecard before your next call.' },
      { icon: '🎧', title: 'Practice with an AI caller', points: [
          'When no trainer is free, 🎧 Practice rings you with an AI caller that talks back out loud.',
          'Pick a call, or 🎲 Surprise me for a random call on a line.',
          'Hold and Transfer work, and the AI grades the call on the same metrics when you submit the note.',
          'Type instead of talking runs the call as text, if your microphone isn\'t available.'],
        where: 'Top bar → 🎧 Practice.',
        tip: 'Practice a line before your live mock call on it.' },
      { icon: '👥', title: 'When the class is listening', points: [
          'Your trainer can share the call in Google Meet so the batch can listen.',
          'Your phone tells you when the class is listening.',
          'Mute your Meet microphone and the Meet tab until the call ends, so there\'s no echo.'],
        where: 'Your phone shows a notice while the class listens.',
        tip: 'Unmute Meet again once the call is over.' }
    ]
  };
  const TRAINER = {
    sub: 'Running live mock calls from the trainer console',
    slides: [
      { icon: '🏠', title: 'Opening the console', points: [
          'Open ☎ LSH Ring Channel from the LSH Training Portal (Training Directory or Master Control): you arrive on the console, under your Portal name.',
          'Your top bar: 🎛 Console, 🗂 Call log, 📋 Graded calls, 📚 Scenarios, 👥 Trainees, 🎧 Try practice and ⚙️ Setup; 🏠 goes back to the Portal.',
          'Trainees open it from the Portal too: no sign-in form, no PINs. The trainer passphrase is only for when the Portal is down.'],
        where: 'The LSH Training Portal · the top bar.',
        tip: 'Open ⚙️ Setup once before your first session to check the relay, recordings and AI keys.' },
      { icon: '☎', title: 'The Switchboard and the dialer', points: [
          'The Switchboard: every trainee online, by batch, with their extension; ✋ shows who asked for a call.',
          'Dial the trainee\'s extension (or click them on the Switchboard), pick the line, and a call to play, or none for an open call.',
          'The soft keys: 📋 Graded, Record and Hide ID. Then 📞 rings the trainee.'],
        where: '🎛 Console → ☎ Switchboard and the dialer.',
        tip: 'Start with trainees who have their hand up.' },
      { icon: '🎭', title: 'On the call', points: [
          '🎭 You are the caller: the opening line, what the caller knows and how they act, the situation, who is out.',
          '✅ Live checklist: the call\'s goals, ticked as they happen.',
          '📝 The trainee\'s note, as they type it.',
          'The dialer: the timer, REC, the trainee\'s hold and mute, the connection; Mute, 🔊 Speaker and End call.',
          '🤖 AI caller (on the dialer) rings the trainee with the AI playing the caller: follow it live from 🤖 AI calls; the AI reviews it.'],
        where: '🎛 Console, during a call.',
        tip: 'Stay in character: the script says what the caller knows and doesn\'t.' },
      { icon: '🔀', title: 'Transfers and coaching time-outs', points: [
          'When the trainee transfers, you choose: Picks up, No answer or Voicemail. The scenario says who is out.',
          '⏸ Coaching time-out pauses the role-play so you can coach as yourself; the trainee\'s phone shows it.',
          '▶ Resume goes back to the role-play.'],
        where: '🎛 Console, during a call.',
        tip: 'Use a time-out for a quick correction, then let them finish the call.' },
      { icon: '📺', title: 'Class view in Google Meet', points: [
          '📺 Class view opens a tab to present in Meet, so the batch can listen to the call.',
          'Click 🔊 Start class audio, then share that tab in Meet with tab audio on.',
          'The class sees who\'s on the call, hold, transfers and the live note, never the caller\'s script or the goals.'],
        where: '🎛 Console → 📺 Class view.',
        tip: 'Keep your Meet mic on and wear a headset: your voice reaches the class through Meet.' },
      { icon: '📋', title: 'Graded calls and autograding', points: [
          'Tick 📋 Graded mock call before you ring (on by default): the call is recorded, and the AI grades it.',
          'The AI listens to the recording and scores each metric of the line\'s Mock Calls Metrics, 1 to 5 with feedback.',
          '📋 Score this call: ✅ Approve the AI grade & send, or change any score or feedback, then 📨 Send.',
          '📋 Graded calls: each trainee\'s Reception, Calendar and Intake grades, with ⬇ Export CSV.'],
        where: 'After the call, on the console · Top bar → 📋 Graded calls.',
        tip: 'Play the recording before you approve a grade.' },
      { icon: '👥', title: 'Call log and Trainees', points: [
          '🗂 Call log: every call, its recording and its scorecard.',
          '👥 Trainees: each trainee\'s live average (reviewed calls) and practice average, kept apart.',
          'Each trainee\'s desk extension (the number you dial), and 🗂 Calls for their calls.'],
        where: 'Top bar → 🗂 Call log · 👥 Trainees.',
        tip: 'Compare live and practice averages before you rank the batch.' },
      { icon: '📚', title: 'Scenarios', points: [
          '📚 Scenarios lists every call, by line and level, on the firm\'s case files.',
          '⧉ Copy a built-in call to change it, or ＋ Write a new call: the caller, the case, the script, the goals.',
          'The calls follow the Training Portal\'s Foundational call pack, plus calls written for live practice.'],
        where: 'Top bar → 📚 Scenarios.',
        tip: 'Write a call for anything the batch keeps getting wrong.' },
      { icon: '⚙️', title: 'Setup, AI practice and this Blueprint', points: [
          '⚙️ Setup: the TURN relay, recordings, AI keys and the access code, a mic check, a network test, and the grading settings.',
          '🎧 Try practice: take a practice call with the AI caller yourself, as a trainee would.',
          '🧭 Blueprint: the Trainee blueprint is the deck to share on day one; ⬇ Download PDF gives either as a handout.'],
        where: 'Top bar → ⚙️ Setup · 🎧 Try practice · 🧭 Blueprint.',
        tip: 'Run the network test on a trainee\'s computer if their calls have no audio.' }
    ]
  };

  // The deployed version: the page\'s ETag (it changes with every deploy), shortened.
  let ver = null;
  function version() {
    if (ver) return ver;
    ver = fetch(location.pathname, { method: 'HEAD', cache: 'no-store' })
      .then(r => { const t = (r.headers.get('etag') || '').replace(/^W\//, '').replace(/[^A-Za-z0-9]/g, ''); return t ? 'deploy ' + t.slice(0, 8) : ''; })
      .catch(() => '');
    return ver;
  }
  window.LSH_BLUEPRINT = {
    product: 'Ring Channel',
    site: 'LSH Ring Channel',
    file: 'LSH_Ring_Channel',
    logo: 'lsh-logo-dark.png',
    trainee: TRAINEE,
    trainer: TRAINER,
    // trainers get both decks; trainees the trainee deck; nobody in the 📺 Class view (the class sees that tab)
    role: () => { const A = window.App; if (!A || !A.me || A.isClassView) return null; return A.trainer() ? 'trainer' : 'trainee'; },
    version,
    // in the header, before the name and Log out
    // a compact 🧭 button (the top bar is full), with its name on hover
    mount: (html) => { const who = document.getElementById('who'); if (who && who.firstChild) who.insertAdjacentHTML('afterbegin', html.replace('<button ', '<button title="Blueprint: how Ring Channel works" aria-label="Blueprint" ').replace('🧭 Blueprint', '🧭')); }
  };
  // the header is drawn again on every page: put the button back at once
  if (window.App && typeof App.header === 'function') {
    const header = App.header;
    App.header = function () { const r = header.apply(this, arguments); if (window.LSHBlueprint) LSHBlueprint.refresh(); return r; };
  }
})();
