# LSH Ring Channel

A training phone system (VOIP) for the **Receptionist** and **Intake** mock calls in the LSH Foundational Training program.

The trainer rings a trainee's phone in the browser and plays the caller over live audio. The trainee answers and handles the call like a real one:

- greets the caller, verifies them, looks the case up;
- uses **Hold** (the caller hears hold music) and **Transfer** (the trainer decides whether the extension picks up);
- takes the message or intake note, which the trainer sees as it's typed.

The call is recorded (the trainer can play and download it), and it's graded on the program's **Mock Calls Metrics** for its line: Reception, Calendar Management or Intake. The AI **autogrades** the call from the recording; the trainer checks the grade, edits it if needed, and sends it. The trainee reads the scorecard in **My calls**, and **📋 Graded calls** shows every trainee's grades, with a CSV export.

When no trainer is free, trainees can **practice** the same calls with an **AI caller** that talks back out loud. The AI scores those calls with the same rubric.

Everything runs in the browser; there are no phone numbers and no phone bills. It's a Cloudflare Worker with two Durable Objects: the Switchboard and the Grader. The audio goes straight between the two browsers over WebRTC, through a TURN relay when a network blocks direct audio.

## On the LSH Training Portal

Ring Channel opens from the **LSH Training Portal** (`cm-training-activity.pages.dev`, the Training-Portal repo), like the CMS and the Knowledge Base: **☎ LSH Ring Channel** is on the Training Directory, on the home page's Simulators, on **🛠 Simulators**, and in the admin menu. Each opens `/api/launch?tool=ringchannel`.

There's **no sign-in form**: everyone comes in from the Portal, signed in there.

- **Trainees** land on their phone, signed in as their Portal name and batch (the same `name--batch` id as every LSH platform). The Portal sends them with a signed ticket that's good for 5 minutes (`?ticket=…`).
- **Administrators** land on the console, as trainers, under their Portal name. The Portal makes these admin tickets for Ring Channel only; the other platforms still ask admins for their password.
- **Each ticket works once** (the Switchboard keeps the used ones until they expire), and it leaves the address bar at once, so a link from history or another browser is no use.
- **The ticket check:** with `PORTAL_SSO_SECRET` set on this Worker (the same value as the Portal's), Ring Channel checks the ticket itself. Without it, it asks the Portal (`POST /api/verify-ticket`), as the CMS does, so it works with no secret to copy. `PORTAL_URL` changes which Portal it asks (default `https://cm-training-activity.pages.dev`).
- **Opening Ring Channel's own link**, or signing out, shows **🏠 Open Ring Channel from the LSH Training Portal** with a button there. Trainers get a **🏠** button in the top bar back to the Portal's Training Directory.
- **If the Portal is down**, *Trainer: is the Portal down?* (folded away on that page) opens the console with the trainer passphrase (`ADMIN_PASSPHRASE`). Trainees wait for the Portal.

## As an app (its own window)

Ring Channel installs as an app from Chrome or Edge: its own window with no browser bars, its own icon, and an entry in the Start menu, Dock or taskbar. It's still the same site underneath, so updates arrive by themselves.
- **⬇ Install** in the top bar (or on the "Open Ring Channel from the LSH Training Portal" page), or the browser menu (⋮) → **Install LSH Ring Channel** (Edge: **Apps → Install this site as an app**).
- **Opening it** goes straight in while the sign-in lasts (30 days for trainees, 12 hours for trainers). After that, **Go to the LSH Training Portal** opens the Portal in the app window, and opening Ring Channel there comes back signed in.
- The files: `public/manifest.webmanifest`, `public/sw.js` (no offline caching, since calls need the network; just a "you're offline" page) and `public/icons/`.

## 🤖 AI calls: the AI plays the caller

A trainee can take a call where the AI plays the caller, two ways:
- **The trainee starts it:** **🎧 Practice** (see *AI practice callers*).
- **The trainer sends it:** on the dialer, dial the trainee's extension and press **🤖 AI caller**, or **🎭 Choose…** (also **🎭 Send AI callers…** on 🤖 AI calls) for the setup:
  - **🎚 The caller's voice**: the voice the AI speaks with (Kore, Aoede, Leda, Zephyr, Puck, Charon, Fenrir, Orus), or left to suit the caller. The same call, a different person on the line; the AI calls list shows the voice each call used. Trainees get the same 🎚 list on 🎧 Practice.
  - **🎭 The calls the AI may play**: tick one, or a few for it to draw from; with none ticked it plays any call on the line.
  - **👥 Who to ring**: tick any number of trainees who are free (or **Everyone free**), and each gets a call drawn from what you ticked, graded or not.
  - The AI plays the call picked under the dialer, or a random call on the line when none is picked. Live-only calls can't be sent.
  - **The trainee's own phone (My phone) rings** like any call, with the caller ID on the line. They answer and talk out loud (Hold, Transfer, Case lookup and the note all work), and **AI CALLER** shows once they answer. It rings out after 45 seconds.
  - **🤖 AI calls**, its own page in the top bar, lists them: ringing, on the call (with the time), missed or declined, then the AI's score. Trainers can send AI callers to several trainees at once.
  - **👂 Follow** shows what's being said (both sides, as it's transcribed) and the trainee's note, live. **⏹** ends the call.
  - **The AI reviews it** when the trainee submits the note (from the recording), on the line's Mock Calls Metrics. The trainee sees the scorecard straight away; the trainer can review it too (**📋 Review**) and send their own. With **📋 Graded** on, it's in **📋 Graded calls**.
- Both need the Gemini keys (`GEMINI_API_KEY5` … `9`); without them, 🎧 Practice and 🤖 AI caller are off.
- **From the Portal:** the Simulators link **🤖 Take an AI call** opens Ring Channel on 🎧 Practice, and **🎛 Send AI callers** opens the console.

## How a live mock call works

**Trainee** (📞 My phone)
1. Opens **☎ LSH Ring Channel** from the LSH Training Portal and lands on **My phone**, signed in (see *On the LSH Training Portal*). They keep it open with a headset on. **🎧 Audio check** tests the microphone, the headset and the speaker.
   Each trainee gets a **desk extension** (7001, 7002, … in the order they first open Ring Channel), shown on their phone; it's the number the trainer dials.
   **☎ The switchboard** sits beside the phone: their own line (name, batch, extension, available or away), the trainers who are on with their extensions, and the rest of their batch. **«** folds it away to a rail, and the rail brings it back; it stays as they left it on that computer.
2. Sets **● Available** (or **◌ Away**). **✋ Ask for a call** raises a hand on the trainer's switchboard.
3. When the phone rings, it shows the line (Main Line or Intake Line) and the caller ID. The trainee answers within 3 rings.
4. During the call, beside the phone (**🔎 Case lookup** opens first on a live call, as at the real front desk: look the caller up, then take the note):
   - **🔎 Case lookup**: the CMS Training Library case files, searched by name, phone, DOB or MC number (nothing shows until you search, like the real front desk). A hit opens as a **preview** of the file, with **✅ This is the case file** (the trainer sees which file they chose, and the grade says whether it was the right one for the call) and **🗂 Open in the CMS ↗**, which opens that case in the CMS Training Library **signed in as them** (a fresh one-use Portal ticket, as the Portal opens the CMS; it needs `PORTAL_SSO_SECRET` here, otherwise the CMS asks them to come in from the Portal);
   - **📝 Note**: the message slip, the calendar entry or the intake note, by line;
   - **📇 Directory**: the firm's extensions, with Transfer buttons;
   - **📘 Rules**: the front-desk rules and the line's reminders.
5. The phone keys are **Mute**, **🔊 Speaker** (see *The speaker key*), **Hold** (hold music plays to the caller), **Transfer** (pick an extension; the caller is held while it rings) and **Hang up**.
6. After the call, the trainee finishes the note and **submits** it. The trainer's review appears in **🗂 My calls**.

**Trainer** (🎛 Console)
1. Opens **☎ LSH Ring Channel** from the Portal (Training Directory or Master Control) and lands on the console, signed in under their Portal name.
2. The console is one desk: **☎ the switchboard** in the same dark case as the dialer, joined to it on the left with nothing between them (it runs as long as the batch does, never scrolling inside itself), **🎭 the calls to play** beside it on the right (**«** folds it away to a rail, and stays folded on that computer), and under the dialer the call picked, next to **🤖 the AI calls**:
   - **☎ Switchboard** (left, under the LSH mark, part of the dialer and always open): the trainer's own line with **their own extension** (8001, 8002, … one per trainer account, so a batch with two trainers on sees which line each is calling from), the other trainers who are on, and every trainee online by batch with their extension: available, away, on a call, or ✋ asking for a call. It works as the phone's contact list: clicking a trainee puts their extension on the dialer.
   - **🎭 The call to play** (right): the type of call (Reception, Calendar, Intake) and the calls on that line, one per row.
   - The call picked sits **beside the dialer**, ready to play: the opening line, what the caller knows and how they act, what a good call does and the situation.
   - **🤖 AI calls** has a page of its own in the top bar (see *🤖 AI calls*): those calls run on the trainees' phones, not the trainer's line.
3. The **☎ dialer** is a desk phone on screen:
   - **Dial the trainee's extension** on the keypad (or type it; Backspace deletes, Esc clears). The screen says who it reaches: *Ready to call* with the trainee's name, *Not signed in*, a firm extension (201 is Atty. Reyes), or *No such extension*.
   - The **line keys** under the screen pick the line: Reception, Calendar (both ring the Main Line) or Intake (the Intake Line). The line decides the note the trainee takes and the metrics the call is graded on.
   - **🎭 The call to play** is optional, in the list beside the dialer (Beginner to Advanced, by line). Pick one to play its script and it's previewed under the dialer — the opening line, what the caller knows and what a good call does — or leave **🎙 Open call: no script** selected and play any caller you like. The dialer's screen shows the caller ID the trainee will see (WIRELESS CALLER on an open call), the line, and the call.
   - **How the next call is placed**, at the foot of the switchboard: **📋 Graded** (on by default; see *Graded mock calls and autograding*; a graded call is always recorded), **Record** (on by default), **🙈 Hide ID** (the trainee sees PRIVATE CALLER), **🤖 AI caller** and **🎭 Choose…** (see *🤖 AI calls*), and **📺 Class view**. The dialer keeps the keypad and the keys for the call on the line, so the board and the phone end at the same line.
   - Under the keypad, the keys for the call on the line — **⏸ Coaching time-out**, **👥 Merge call**, **↪ Transfer on** — sit greyed until a call connects.
   - **📞** (or Enter) rings the trainee. The trainer hears the ringback. After a call the screen clears; 📞 on an empty screen brings back the last number (redial).
4. On the call, the dialer shows who's on the line, the timer, 📋 GRADED, REC, the trainee's hold / mute, the connection quality (and whether it's going through the relay), and 🔊 SPEAKER. Its keys are **Mute**, **🔊 Speaker**, **⏸ Coaching time-out**, **👥 Merge call**, **↪ Transfer on** (see *↪ Transfer the caller on*) and **End call**. Beside it:
   - **🎭 You are the caller**: the opening line, what the caller knows and how they act, the situation, who is out of the office (on an open call: any case file to play a client from);
   - **✅ Live checklist**: the call's goals, ticked as they happen;
   - **📝 The trainee's note**, live;
   - **📁 the case file the trainee opened** in 🔎 Case lookup, and whether it's the one this call is about.
5. When the trainee transfers, a panel asks what happens: **Picks up** (the call is handed over and ends), **No answer** or **Voicemail**. The scenario says who is out.
6. **⏸ Coaching time-out** pauses the role-play so the trainer can coach as themselves; the trainee's phone shows it. **▶ Resume** goes back to the role-play.
   **📺 Class view** opens a tab to present in Google Meet, so the batch can listen (see *In a Google Meet class*).
7. After the call, the recording uploads and the AI grades the call on its own. **📋 Score this call** opens the scorecard:
   - each metric of the line's Mock Calls Metrics, 1 to 5 (or n/a) with feedback, and the weighted average;
   - each goal ✓ / ~ / ✗ / n/a (the live ticks are already filled in);
   - a verdict, a summary and "next time" tips.

   When the AI's grade is in, the scorecard holds it: **✅ Approve the AI grade & send**, or change any score or feedback and **📨 Send to the trainee**. **✨ Grade again with AI** re-grades the call.

## ↪ Transfer the caller on, 👥 or merge the call

Two keys on the dialer, both for seeing how a trainee hands a call over:

**↪ Transfer on** passes the caller to another trainee, the way a switchboard does. Their phone rings like any call; when they answer, **the first trainee's call ends** and the trainer carries on as the same caller with the new one.
- The first trainee's call is **scored as it stands**, so how they handed the call over counts in their grade; the new trainee's call is a graded, recorded call of their own.
- The new trainee's phone says who the caller was transferred from, so they know to pick up where the last person left off.
- The trainee's own **Transfer** (on their phone, to a firm extension) still works as before: the trainer answers it with **Picks up**, **No answer** or **Voicemail**.

## 👥 Merge calls (a conference)

**👥 Merge call** on the dialer rings a second trainee into the call that's already on the line, and up to two can be merged in. Their phone rings like any call and they answer it the same way; once they're in, **everyone hears everyone**: the trainer's browser mixes the voices and sends each person the trainer's microphone plus the others, never their own voice back.

- The console lists who is on the line under **👥 Conference**, with **⏏ Drop** to take one off; the dialer's screen shows **👥 CONFERENCE**. Each merged trainee's phone says who else is on the call.
- The conference is **one call**: it's recorded and graded as the first trainee's call (every voice is in the recording), and a merged leg isn't graded of its own. On a conference there's no extension to ring, so a merged trainee's **Transfer** comes back as no answer.
- In the call log, a merged trainee's call reads **👥 Conference** (it's graded with the call they joined), and it never waits in the trainer's *Needs review* queue.
- Ending the call, or dropping the last one merged in, puts the first call back on the plain microphone. A conference ends if the console's page reloads (the trainer is told); the first call carries on.

## Sound

- **Live calls** use Opus in full band at 64 kbps with loss recovery and without DTX (which clips word starts and makes a voice sound muffled and far away).
- **The AI caller's voice** goes through a gentle compressor and is lifted, so it sounds close and clear.
- The microphone keeps echo cancellation and noise suppression on (needed on a speaker). A headset still sounds best.

## The speaker key

**🔊 Speaker**, on the trainer's dialer and on the trainee's phone, works like a desk phone's speaker key: the call moves from the headset to the computer's speakers (so a training room can listen), and back when pressed again.
- Everything on the phone follows it: the call, the ringing and ringback, the keypad tones, and the AI practice caller. The screen shows 🔊 SPEAKER while it's on.
- The phone finds the speakers by their name ("Speakers", "Built-in", "Realtek"…). **🎧 Audio check** lists the outputs: choose the headset and the speaker there, and play a test tone on each.
- The setting is kept on that computer.
- It needs Chrome or Edge (they can choose where sound plays) and the microphone allowed, so the phone can see the outputs' names. If the computer has only one output, the screen says the call already plays there.
- On speaker, the microphone hears the room: Chrome's echo cancellation removes the call's own sound, but a headset is still best for graded calls.

## In a Google Meet class

To let the batch listen to a mock call in your Google Meet (and record it with Meet), present the **📺 Class view**:

1. On the console, click **📺 Class view**. A window opens; allow pop-ups for the site if the browser asks.
2. In that window, click **🔊 Start class audio**. The Class view now plays the call, and your console goes quiet so you don't hear the trainee twice.
3. In Meet, go to **Present now → A tab**, pick the Class view tab, turn on **Also share tab audio**, and click **Share**.
4. Keep your **Meet mic on** and wear a headset.
   - Your voice (the caller) reaches the class through Meet.
   - The trainee's voice, hold music and the ringback reach the class from the Class view tab.
5. The trainee on the call **mutes their Meet mic and the Meet tab** (right-click the tab → *Mute site*) until the call ends, so they don't hear an echo. Their phone reminds them while the class is listening.
6. **Record** in Meet captures both voices and the Class view. Meet recording needs a Google Workspace plan that includes it.

**What the class sees:**
- who is taking the call, the line and the caller ID, the timer;
- hold, transfers and coaching time-outs;
- the trainee's note as it's typed.

They never see the caller's script or the goals, and the call's title only shows once the call is over. The Class view follows your console from call to call, so keep it open for the whole session. Present it from Chrome or Edge, where Meet can share a tab's audio.

This is separate from the platform's own recording: every live call is still recorded on the console and kept with its scorecard.

**Timings the phone measures for the scorecard:** rings before the answer (the standard is 3), call length, each hold and its length, and each transfer and how it ended.

**If a connection drops:** a phone that loses its connection has 30 seconds to come back before the call ends, and the call audio usually keeps going meanwhile.

- **Reloading either page during a call reconnects it.** The trainee clicks **🔊 Reconnect the call**; the trainer's console picks the call back up on its own. Hold (with its music), a transfer waiting for an answer, mute and a coaching time-out come back as they were.
- **A call belongs to the browser tab that took it.** Another tab (or a second window) shows "You're on a call in another tab" and only takes the call if you click **Take the call here** / **Move the call here**.
- **An unanswered call** rings out after 45 seconds and shows as *Missed*.
- **A trainee on a practice call** can't take a live call. Their trainer is told they're busy, and the trainee sees that the trainer rang.

## Graded mock calls and autograding

Trainer-facilitated mock calls are graded on the program's **Mock Calls Metrics** (Foundational Training, Days 4, 6 and 9), each metric scored 1 to 5 with feedback:

| Line | Sheet | Metrics |
|---|---|---|
| Reception | Reception Mock Calls Metrics | 14: Introduction of Law Firm and Name · Authentication (Name, DOL, DOB, Claim No, Case No.) · Customer Service · Assertiveness · Listening Skills · Comprehension · Attention to Details · Resolution · Transfer Procedure · Closing Spiel · Time Management · Dead Air/Fillers · Clarity of Speech · Tone of Voice |
| Calendar | Calendar Management Mock Calls Metrics | 7: Professional Introduction & Call Control · Client Comprehension & Flow Control · Information Verification & Accuracy · Slot Identification & Scheduling Rule Compliance · Alternative Time Offering · Calendar Creation & Attorney Reminder Setup · Notes, Recap & Call Closing (graded against the Day 6 scheduling rules) |
| Intake | Intake Mock Calls Metrics | 16: the Reception metrics plus Setting Proper Expectations · Explaining the Process · Answering Client's Inquiries · Commitment |

An **open call** (no script) is graded the same way, on the line's metrics; there's no checklist, and the AI works out from the recording who called and what they needed.

The grade is the **weighted average** of the scored metrics (n/a doesn't count), shown out of 5 and as a percentage (average × 20).

**How a graded call goes:**
1. The trainer leaves **📋 Graded** on, on the dialer (it's on by default), and rings. The dialer shows 📋 GRADED, and the call is recorded.
2. When the call ends, the console uploads the recording (to play and download) and a phone-quality copy for grading (8 kHz WAV, both voices, up to 15 minutes, with the dead air the phone measured).
3. The **Grader** grades the call once the grading copy is in and the trainee has submitted the note. If either never comes, it grades anyway: 3 minutes after the call without the recording, 10 minutes after without the note. The AI listens to the recording and reads:
   - the line's metrics (and, for Calendar, the scheduling rules);
   - the call's goals and the case file;
   - the trainee's note;
   - what the phone measured: rings before the answer, holds, transfers, dead air.

   It scores every metric with feedback in the LSH facilitator's voice, checks the goals, and writes a transcript.
4. The call's page shows each step (waiting for the recording or the note, grading, autograded). The trainer can:
   - **✅ Approve the AI grade & send** as it is;
   - change any score or feedback, then **📨 Send to the trainee**;
   - **💾 Save draft** to keep editing later (the trainee sees nothing until it's sent);
   - **✨ Grade again with AI**.

   A grade that lands while the trainer is typing never overwrites their edits; they get a button to load it instead. A failed grading is retried twice, then shows **Grade again**.
5. The trainee sees "waiting for your trainer's review" until the grade is sent, then the full scorecard in **🗂 My calls**: each metric's score and feedback, and the weighted average.

**📋 Graded calls** (trainer):
- a table of trainees by batch, with each trainee's latest graded Reception, Calendar and Intake call: the score, the number of attempts, and whether it's ✅ sent, 🤖 waiting for approval or ⏳ not graded yet;
- every graded call in a list below the table;
- click a score to open the call;
- **⬇ Export CSV**: one row per graded call, with each metric's score and feedback (opens in Excel or Google Sheets).

**⚙️ Setup → 📋 Graded mock calls and autograding:**
- **Autograde every live call** (on by default; needs the Gemini keys);
- **Send AI grades to trainees without my approval** (off by default). When on, the AI's grade goes to the trainee as soon as it's ready, signed "AI grader"; the trainer can still change it and resend;
- **New live calls start as 📋 graded**;
- **Pass mark** (optional), for Pass / Below badges in the scorecard and the report;
- **Metric weights**: per line, 1 = normal, 2 = counts double, 0 = left out.

**Downloads:**
- **⬇ Download the recording** on the call's page (see *Recordings* below);
- **⬇ Export CSV** in 📋 Graded calls.

**Without Gemini keys:** graded calls work the same, but the trainer scores every metric by hand.

**Costs:** each grading is one Gemini request with the call's audio (about 32 tokens a second of audio, so a 6-minute call is about 12,000 tokens) and runs on the same key pool as the rest of the AI.

## The calls

24 calls. Case files are the training CMS's Training Library (`CaseManagementTraining/mock-cases.js`, MC-01 … MC-36). **Case lookup** shows the same facts, with a link to open the case in the CMS.

- **Reception** (the Main Line; note: message slip)
  - From the Training Portal's Foundational call pack: a client lost her appointment card (MC-01) · a "cousin" asks about the settlement (MC-01) · is my settlement check ready? (MC-06) · a parent who isn't on the file (MC-10) · an offer with a deadline (MC-04) · a reporter wants confirmation (MC-14) · a caller who speaks Spanish (MC-08)
  - New here: three James Wilson files (MC-24, with MC-06 and MC-23 in lookup) · another firm wants the file (MC-16) · the body shop wants its storage paid (MC-12) · the client's employer calls (MC-36) · the City wants a recorded statement (MC-19)
- **Calendar** (the Main Line; note: calendar entry)
  - From the call pack: defense counsel wants to move a deposition (MC-05) · what time is my mom's prep meeting? (MC-05) · surgery day and a call with the case manager (MC-08) · reschedule my check-in call (MC-01)
- **Intake** (the Intake Line; note: intake note)
  - From the call pack: a grocery-store fall (MC-02) · a deadline close (MC-13) · did you take my case? (MC-02)
  - New here, all first calls: hit while loading groceries (MC-12) · hit in a crosswalk (MC-36) · the scooter's brakes failed (MC-28) · hit by a city bus (MC-19) · a son calls for his father (MC-24)

On a first intake call nothing is on file, so the case is hidden from **Case lookup**. After the call, the review shows the finished case file to compare with the note.

**📚 Scenarios** (trainer) lists every call. **⧉ Copy** a built-in call to change it, or **＋ Write a new call**: the caller and caller ID, the case, the opening line, the caller's script, the situation, the goals, who is out of the office, and whether trainees can practice it with the AI. Written calls are saved in the Switchboard and appear in the console and in Practice.

The built-in calls live in `src/scenarios.js`. If a case changes in the CMS, update its `CASES` entry and its calls there.

## AI practice callers and AI scoring (optional)

- **🎧 Practice** (trainees; **Try practice** for trainers):
  - pick a call, or **🎲 Surprise me** for a random call on a line (the trainee doesn't see which call it is until after);
  - the practice phone rings, and the caller talks back out loud in a natural voice (Gemini Live), following the same script the trainer plays;
  - Hold and Transfer work: the AI is told it's on hold, and a transfer to someone who is out doesn't go through;
  - both sides are transcribed and recorded.

  **Show the live transcript** is optional. **Type instead of talking** runs the call as text, for when there's no microphone or live voice isn't available.
- When the trainee submits the note, the AI grades the practice call on the same Mock Calls Metrics and the goals, in the LSH facilitator's voice (the same feedback DNA as the Foundational platform), from the recording of a voice call. Trainers can override it with their own review.
- Live calls are autograded from their recording (see *Graded mock calls and autograding*).
- **Keys:** the same Gemini key pool as the Foundational Worker, `GEMINI_API_KEY5` … `GEMINI_API_KEY9`, then `GEMINI_API_KEY`, `_KEY1` and `_KEY2`.
  - Each request starts on the next key; a key at its limit rests while the others take over.
  - Keys from different Google Cloud projects add capacity; keys from the same project share one allowance.
  - The key never reaches the browser: live voice uses a single-use token with the caller's script locked in.
  - Without keys, live calls work as normal; Practice and autograding are off.
- **Limits (enforced by the server):**
  - each practice call runs at most `AI_MAX_MINUTES` (default 8); the Switchboard closes it even if the tab was closed;
  - each trainee gets 30 practice calls, 60 live-voice connections and 40 scorings an hour.
- **Practice scores are self-practice.** The trainee's browser runs the call, so **👥 Trainees** shows the practice average apart from the live average (reviewed live calls only). A typed practice call's conversation is kept on the server.


## 🧭 Blueprint (how Ring Channel works, for trainees and for trainers)

**🧭** in the header (next to the name and Log out; its name shows on hover) opens the Blueprint, a full-screen slide deck.
- **Trainee blueprint** (a cover and 9 slides), for trainees: what Ring Channel is, opening it from the Portal, My phone, answering a call, the tools during a call, the phone's keys (Mute, Speaker, Hold, Transfer, Hang up), after the call, practice with an AI caller, and when the class is listening.
- **Trainer blueprint** (trainers only; a cover and 9 slides): opening the console from the Portal, the Switchboard and the dialer, on the call, transfers and coaching time-outs, Class view in Meet, graded calls and autograding, the Call log and Trainees, Scenarios, and Setup and AI practice.
- Trainers get both decks as tabs; trainees only ever get the Trainee blueprint. Neither shows in the 📺 Class view.
- **Moving around:** ◀ ▶, the ← → keys or the contents strip. Esc closes it.
- **Numbering:** the cover is ★ Cover (the counter says "Cover · 9 slides"); the slides are 1 to 9 everywhere: the contents strip, the counter ("9 / 9" on the last), the slide's heading and footer, and the PDF's page footers.
- **⬇ Download PDF:** the deck that's showing, as a landscape PDF with one page per slide. It's made from the deployed site each time, stamped with the deploy (the page's ETag) and the date.
- **Files:** the slides are in `public/js/blueprint-content.js`. `public/js/lsh-blueprint.js` (the page and the PDFs) is the same file on every LSH platform: change it in one, copy it to all. Test: `tests/blueprint.cjs`.

## Deploy (Cloudflare)

1. **Create the Worker from this repo:** in Cloudflare, go to **Workers & Pages → Create → Import a repository**, pick `team-litigation-lab/lshringchannel`, and keep the defaults: `npx wrangler deploy` deploys `wrangler.json`. From a computer instead: `npm install`, then `npx wrangler deploy`.
   - The **Durable Objects** are created on deploy: the Switchboard (migration `v1`) and the Grader (migration `v2`). They're SQLite-backed, which the Workers Free plan supports.
   - **Recordings** go in the shared **`LSH_KV`** namespace (the same one as the other LSH courses), under `voip:`. They delete themselves after `RECORDING_DAYS` (default 90). The grading copies (`voip:wav:`) delete themselves after 14 days.
2. **Add the secrets:** in the Worker, go to **Settings → Variables and Secrets** (or `npx wrangler secret put <NAME>`):

   | Secret | What it does |
   |---|---|
   | `ADMIN_PASSPHRASE` | **Required.** Signs the sign-in tokens, and opens the console when the Portal is down (the trainers' fallback). |
   | `SESSION_SECRET` | Optional. Signs the sign-in tokens instead of `ADMIN_PASSPHRASE` (changing it signs everyone out). |
   | `PORTAL_SSO_SECRET` | Optional. The LSH Training Portal's sign-in secret: Ring Channel then checks the Portal's tickets itself instead of asking the Portal (see *On the LSH Training Portal*). |
   | `TURN_KEY_ID`, `TURN_KEY_API_TOKEN` | **Recommended.** Cloudflare's TURN relay (step 3). |
   | `GEMINI_API_KEY5` … `GEMINI_API_KEY9` | Optional. AI practice callers and autograding. |

3. **Set up the TURN relay:** in Cloudflare, go to **Realtime → TURN Server → Create**, then copy the **Turn Token ID** into `TURN_KEY_ID` and the **API Token** into `TURN_KEY_API_TOKEN`.
   - Without it, most calls still connect directly. Trainees on strict home routers, mobile data or office networks may get no audio: their phone says "Still connecting the audio…".
   - The relay is paid by traffic, with a free monthly allowance; a voice call uses well under 1 MB a minute.
   - **⚙️ Setup → 🌐 Network test** shows whether a computer gets relay candidates.
4. **Check the setup:** open Ring Channel from the Portal as an administrator and go to **⚙️ Setup**. It shows the TURN relay, recordings, AI keys and the Portal sign-in, plus an audio check and a network test.

**Browsers:** Chrome or Edge on a computer, with a headset (that's what the tests run on). Other current browsers with WebRTC should work but aren't tested. Pages must be served over https, which Cloudflare does; browsers only allow the microphone on https.

**Workers limits:** Cloudflare doesn't generate preview URLs for Workers with Durable Objects, so there are no PR previews for this repo; test locally with `wrangler dev`. Each open phone pings the Switchboard every 20 seconds and idle phones hibernate, so a training class should stay well inside the free plan's Durable Object allowance.

## Local development and tests

```
npm install
cp .dev.vars.example .dev.vars      # ADMIN_PASSPHRASE, and PORTAL_SSO_SECRET=portal-test-secret for local sign-in links
npx wrangler dev                    # http://localhost:8787
node tests/portal-ticket.js trainee "Jamie Cruz" B093026   # prints a one-time sign-in link, as the Portal makes
node tests/portal-ticket.js trainer "Coach Ana"
```

Open the two links in two browser windows (or one normal and one private window), and ring the trainee. `localhost` counts as secure, so the microphone works.

**Tests** (`tests/`): two headless Chrome windows with fake microphones run through a local `wrangler dev` with a stand-in for Google's Gemini API (`tests/mock-gemini.js`).

```
npm test        # or: cd tests && npm install && npx playwright install chromium && bash run.sh
```

`SHOTS=<folder>` keeps the screenshots the tests take; `LIVE_ONLY=1` runs only the live-call test; `ONLY=<test file>` runs just that one (e.g. `ONLY=e2e-portal.js`); `PORT=<port>` if 8799 is taken. Google Meet itself can't be driven in a test: the tests check that the Class view plays the call's audio, which is what Meet's "share tab audio" sends.

- `e2e-live.js`: the trainer dials the trainee's extension (7001) on the dialer's keypad and rings, the trainee answers, and audio flows both ways. Then it runs:
  - 🔊 Speaker on the dialer and on the trainee's phone (the call keeps playing), and the audio check's output choices;
  - the ✋ request, the live note, hold with hold music, a transfer answered "no answer", a coaching time-out;
  - the 📺 Class view: it plays the call (the console goes quiet), the trainee is told the class is listening, it shows the live note and hold but never the script, and closing it brings the audio back to the console;
  - both open Ring Channel from the Portal (tickets); its own link has no sign-in form;
  - a second trainer tab opened mid-call leaves the call alone;
  - a reload of the trainee's page and of the trainer's console mid-call (both reconnect);
  - a 📋 graded call: hang up, the recording and its grading copy uploaded, the note submitted, then the call autograded from the recording with no clicks (all 14 Reception metrics, the transcript);
  - the recording played and downloaded, the AI grade approved and sent with one click;
  - "Save draft" after sending keeps the edits from the trainee;
  - 📋 Graded calls and its CSV (every metric's score and feedback);
  - the trainee reads the scorecard and the weighted average (the caller's script and unsent drafts never reach the trainee);
  - an open call with no script on the Intake line (WIRELESS CALLER on the Intake Line, the open-call card with the case files, the Intake note);
  - dialing on the keyboard (201 is a firm extension, Esc clears, 7001 + Enter rings) and a declined call.
- `blueprint.cjs`: the 🧭 Blueprint. A trainee gets the trainee deck only and a trainer both; every slide fits on a laptop and on a phone; both PDFs have a page per slide; the numbers match everywhere (Cover, then 1 to n, never n + 1).
- `e2e-portal.js`: opening Ring Channel from the LSH Training Portal (`mock-gemini.js` stands in for the Portal's `/api/verify-ticket`). It checks that:
  - a trainee's ticket lands them on their phone, and the ticket leaves the address;
  - a used ticket signs nobody in, and expired and forged tickets are refused;
  - signed out, the page shows the way to the Portal, with no sign-in form;
  - an administrator's ticket lands them on the console under their Portal name, and 🏠 goes back to the Portal;
  - the trainees are on the switchboard and in 👥 Trainees;
  - the trainers' passphrase fallback still opens the console.
- `portal-unit.mjs`: the Portal's ticket checked with the shared secret (a trainee, an administrator, the wrong secret, expired, too long, tampered).
- `e2e-ai.js`: the trainer's **🤖 AI caller** (it rings the trainee's own phone; they answer and talk with the AI; the trainer follows the transcript and the note live; the AI's review reaches both, and 📋 Graded calls); a voice practice call over the Gemini Live stand-in (microphone audio up, the caller's audio and transcripts back), hold, hang up, autograding, a typed practice call, the trainer's **Grade again with AI**, and a live-only call that can't be practiced.

**Checks on GitHub** (`.github/workflows/checks.yml`): every pull request and every push to `main` builds the Worker without deploying (`npm run check`) and runs all of the tests above (`tests/run.sh`). A red **Checks** status means something broke; the log says which step.

## Files

| Path | What it is |
|---|---|
| `src/worker.js` | The Worker: sign-in, the API, recordings (KV), TURN credentials, AI practice and scoring. |
| `src/switchboard.js` | The Switchboard Durable Object: every phone's WebSocket (presence, ringing, WebRTC signaling, hold, transfer, notes, coaching), the reconnect grace period and ring timeout (alarms), the call records, trainees, written scenarios and grading settings (SQLite), and when a call is ready to grade. |
| `src/grader.js` | The Grader Durable Object: the queue of calls to autograde, one at a time, with retries. |
| `src/scenarios.js` | The firm (directory, rules), the case files, the note forms, the Mock Calls Metrics, and the 24 calls. |
| `src/prompts.js` | The AI caller's instructions and the grader's (the metrics, the facilitator's voice). |
| `src/gemini.js` | The Gemini key pool, text and audio scoring, and Gemini Live tokens. |
| `src/portal.js` | The LSH Training Portal's sign-in: checks its ticket (with the shared secret, or by asking the Portal). |
| `src/auth.js` | Sign-in tokens and trainee ids (the same shapes as the other LSH platforms). |
| `public/index.html`, `public/css/app.css` | The app shell and its look (LSH navy and orange, IBM Plex). |
| `public/_headers` | Response headers for the app's files (microphone allowed on this site only, no caching of the page). |
| `public/js/phone.js` | The VOIP engine: the Switchboard connection, the WebRTC call (with ICE restart and a clear Opus voice), the call recorder, the mic, and the 🔊 speaker key (which audio output the call plays on). |
| `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` | Ring Channel as an installable app (its own window and icon). |
| `public/js/sounds.js` | Ringing, ringback, the keypad tones, the hang-up tone and hold music, all synthesized. |
| `public/js/ai-call.js` | The AI practice caller (Gemini Live voice, or typed). |
| `public/js/app.js` | Sign-in, pages, the phone screen, the note form, case lookup, the directory. |
| `public/js/trainee.js` | 📞 My phone and 🎧 Practice. |
| `public/js/console.js` | 🎛 The trainer's console: the switchboard, ☎ the dialer, and the call (script, checklist, live note). |
| `public/js/review.js` | 🗂 Calls, a call's review and scorecard (recording playback and download, approving the AI's grade), 📋 Graded calls (and the CSV), 📚 Scenarios, 👥 Trainees, ⚙️ Setup. |
| `public/js/classview.js` | 📺 The Class view: a tab to present in Google Meet (plays the call, shows the live note, never the script). |
| `public/js/blueprint-content.js` | 🧭 The Blueprint's slides: the trainee deck and the trainer deck. |
| `public/js/lsh-blueprint.js` | 🧭 The Blueprint page and its PDFs (the same file on every LSH platform). |
| `tests/` | The end-to-end tests. |
| `.github/workflows/checks.yml` | The checks GitHub runs on every pull request and push to `main`. |

**Data:**
- Durable Object SQLite: trainees (with their desk extensions), the Portal tickets already used, calls (timings, the note, the transcript, the AI's grade and the reviews), written scenarios, grading settings, usage counts for the AI and sign-in limits, and the Grader's queue.
- KV (`LSH_KV`, prefix `voip:`): recordings, and their grading copies.

Trainee ids match the other LSH platforms (`name--batch`). Trainers can archive trainees in **👥 Trainees**.

**Recordings:**
- Live calls are recorded on the trainer's console, both voices in one file; the trainee sees ● REC.
- If the trainer's page reloads mid-call, the recording restarts from that point.
- Practice calls are recorded on the trainee's phone.
- Trainees can play their own recordings; trainers can play and delete any.
- **⬇ Download the recording** saves it as, for example, `Mock call - Jamie Cruz - An Offer With a Deadline - 2026-09-30.webm` (plays in Chrome, Edge and VLC; upload it to the trainee's folder next to the Meet recording).
