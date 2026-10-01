# LSH Ring Channel

A training phone system (VOIP) for the **Receptionist** and **Intake** mock calls in the LSH Foundational Training program.

The trainer rings a trainee's phone in the browser and plays the caller over live audio. The trainee answers and handles the call like a real one:

- greets the caller, verifies them, looks the case up;
- uses **Hold** (the caller hears hold music) and **Transfer** (the trainer decides whether the extension picks up);
- takes the message or intake note, which the trainer sees as it's typed.

The call is recorded, and the trainer scores it on the program's rubric. The trainee reads the scorecard in **My calls**.

When no trainer is free, trainees can **practice** the same calls with an **AI caller** that talks back out loud. The AI scores those calls with the same rubric.

Everything runs in the browser; there are no phone numbers and no phone bills. It's a Cloudflare Worker with one Durable Object (the Switchboard). The audio goes straight between the two browsers over WebRTC, through a TURN relay when a network blocks direct audio.

## How a live mock call works

**Trainee** (📞 My phone)
1. Signs in with their full name and batch (the same as on the LSH training platform) and their **PIN**. The first sign-in sets the PIN (4 to 8 digits), so nobody else can sign in as them. Five wrong PINs lock the account for 15 minutes; a trainer can **🔑 Reset PIN** in 👥 Trainees. They keep **My phone** open with a headset on. **🎙 Mic check** tests the headset.
2. Sets **● Available** (or **◌ Away**). **✋ Ask for a call** raises a hand on the trainer's switchboard.
3. When the phone rings, it shows the line (Main Line or Intake Line) and the caller ID. The trainee answers within 3 rings.
4. During the call, beside the phone:
   - **📝 Note**: the message slip, the calendar entry or the intake note, by line;
   - **🔎 Case lookup**: the CMS Training Library case files, searched by name, phone, DOB or MC number (nothing shows until you search, like the real front desk);
   - **📇 Directory**: the firm's extensions, with Transfer buttons;
   - **📘 Rules**: the front-desk rules and the line's reminders.
5. The phone keys are **Mute**, **Hold** (hold music plays to the caller), **Transfer** (pick an extension; the caller is held while it rings) and **Hang up**.
6. After the call, the trainee finishes the note and **submits** it. The trainer's review appears in **🗂 My calls**.

**Trainer** (🎛 Console)
1. Signs in with their name and the trainer passphrase.
2. **☎ Switchboard** (left) shows every trainee online, by batch: available, away, on a call, or ✋ asking for a call.
3. Picks a trainee and the call to play (Reception, Calendar or Intake; Beginner to Advanced), then chooses:
   - **Record the call** (on by default);
   - **Withhold the caller ID**.

   Then **📞 Ring the trainee**. The trainer hears the ringback.
4. On the call, the console shows:
   - **🎭 You are the caller**: the opening line, what the caller knows and how they act, the situation, who is out of the office;
   - **✅ Live checklist**: the call's goals, ticked as they happen;
   - **📝 The trainee's note**, live;
   - the call bar: timer, REC, the trainee's hold / mute, connection quality (and whether it's going through the relay).
5. When the trainee transfers, a panel asks what happens: **Picks up** (the call is handed over and ends), **No answer** or **Voicemail**. The scenario says who is out.
6. **⏸ Coaching time-out** pauses the role-play so the trainer can coach as themselves; the trainee's phone shows it. **▶ Resume** goes back to the role-play.
   **📺 Class view** opens a tab to present in Google Meet, so the batch can listen (see *In a Google Meet class*).
7. After the call, **📋 Score this call** opens the scorecard:
   - rate each rubric criterion 1 to 5 with an evaluation;
   - mark each goal ✓ / ~ / ✗ / n/a (the live ticks are already filled in);
   - write a verdict, a summary and "next time" tips.

   **✨ Draft with AI** listens to the recording and fills in a draft to check and edit, with a transcript. **📨 Send to the trainee** publishes it.

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
- When the trainee submits the note, the AI scores the call on the rubric and the goals, in the LSH facilitator's voice (the same feedback DNA as the Foundational platform). Trainers can override it with their own review.
- **✨ Draft with AI** on a live call sends the recording (as 8 kHz audio, up to 15 minutes) for a transcript and a draft scorecard.
- **Keys:** the same Gemini key pool as the Foundational Worker, `GEMINI_API_KEY5` … `GEMINI_API_KEY9`, then `GEMINI_API_KEY`, `_KEY1` and `_KEY2`.
  - Each request starts on the next key; a key at its limit rests while the others take over.
  - Keys from different Google Cloud projects add capacity; keys from the same project share one allowance.
  - The key never reaches the browser: live voice uses a single-use token with the caller's script locked in.
  - Without keys, live calls work as normal; Practice and AI drafts are off.
- **Limits (enforced by the server):**
  - each practice call runs at most `AI_MAX_MINUTES` (default 8); the Switchboard closes it even if the tab was closed;
  - each trainee gets 30 practice calls, 60 live-voice connections and 40 scorings an hour.
- **Practice scores are self-practice.** The trainee's browser runs the call, so **👥 Trainees** shows the practice average apart from the live average (reviewed live calls only). A typed practice call's conversation is kept on the server.

## 📊 Server request meter (trainers)

All LSH sites share one Cloudflare account and one monthly allowance of server requests. Trainers see how much of it is used: a small chip in the bottom-left corner of every trainer page.

| Chip | When |
|---|---|
| 🟢 **Requests 23%** | on track |
| 🟠 **Getting close** / **On pace to run out Oct 24** | from 75%, or (after the month's first 3 days) when this month's pace reaches the limit before the allowance resets |
| 🔴 **Nearly used up** | from 90% |
| 🟥 **Paused until …** | the limit was reached: the sites' server parts are paused until the next billing month |
| ⚪ **Not set up** / **Last checked 5 h ago** | no numbers yet, or none saved for over 3 hours |

When it's amber or red, a note appears above the chip (Dismiss hides it until it gets closer, or until next month). Click the chip for the details: the total and the limit, the projection for the month, each day, each site, and what happens at the limit.

How it works:
- The Request budget workflow in **EA-PA-TRAINING** reads the month's requests and saves them to the shared `LSH_KV` namespace (key `_request-usage`) about once an hour, and every 10 minutes from 75% on. Its README (*Monthly request budget*) explains the limit, the pause and how to set it up.
- This site's Worker answers trainers with those numbers: `POST /api/request-budget` (`src/worker.js`; trainees get 403). It only reads that one key.
- The meter is `public/js/request-budget.js`: **the same file in every LSH platform** (change it in one, copy it to all). It asks once when a trainer opens the site, then every 15 minutes while the tab is in view, so it costs next to nothing.
- Trainees never see it, and neither does the 📺 Class view (the class sees that tab in Meet).

## Deploy (Cloudflare)

1. **Create the Worker from this repo:** in Cloudflare, go to **Workers & Pages → Create → Import a repository**, pick `team-litigation-lab/lshringchannel`, and keep the defaults: `npx wrangler deploy` deploys `wrangler.json`. From a computer instead: `npm install`, then `npx wrangler deploy`.
   - The **Durable Object** (the Switchboard) is created on the first deploy (migration `v1`). It's SQLite-backed, which the Workers Free plan supports.
   - **Recordings** go in the shared **`LSH_KV`** namespace (the same one as the other LSH courses), under `voip:`. They delete themselves after `RECORDING_DAYS` (default 90).
2. **Add the secrets:** in the Worker, go to **Settings → Variables and Secrets** (or `npx wrangler secret put <NAME>`):

   | Secret | What it does |
   |---|---|
   | `ADMIN_PASSPHRASE` | **Required.** The trainer sign-in. Nobody can sign in until it's set. |
   | `SESSION_SECRET` | Optional. Signs sign-in tokens (defaults to `ADMIN_PASSPHRASE`; changing it signs everyone out). |
   | `TRAINEE_CODE` | Optional. A code trainees must enter to sign in. Without it, anyone with the link can create a trainee account (their own PIN still protects everyone else's). |
   | `TURN_KEY_ID`, `TURN_KEY_API_TOKEN` | **Recommended.** Cloudflare's TURN relay (step 3). |
   | `GEMINI_API_KEY5` … `GEMINI_API_KEY9` | Optional. AI practice callers and AI scoring. |

3. **Set up the TURN relay:** in Cloudflare, go to **Realtime → TURN Server → Create**, then copy the **Turn Token ID** into `TURN_KEY_ID` and the **API Token** into `TURN_KEY_API_TOKEN`.
   - Without it, most calls still connect directly. Trainees on strict home routers, mobile data or office networks may get no audio: their phone says "Still connecting the audio…".
   - The relay is paid by traffic, with a free monthly allowance; a voice call uses well under 1 MB a minute.
   - **⚙️ Setup → 🌐 Network test** shows whether a computer gets relay candidates.
4. **Check the setup:** sign in as a trainer and open **⚙️ Setup**. It shows the TURN relay, recordings, AI keys and the access code, plus a mic check and a network test.

**Browsers:** Chrome or Edge on a computer, with a headset (that's what the tests run on). Other current browsers with WebRTC should work but aren't tested. Pages must be served over https, which Cloudflare does; browsers only allow the microphone on https.

**Workers limits:** Cloudflare doesn't generate preview URLs for Workers with Durable Objects, so there are no PR previews for this repo; test locally with `wrangler dev`. Each open phone pings the Switchboard every 20 seconds and idle phones hibernate, so a training class should stay well inside the free plan's Durable Object allowance.

## Local development and tests

```
npm install
cp .dev.vars.example .dev.vars      # ADMIN_PASSPHRASE for local sign-in
npx wrangler dev                    # http://localhost:8787
```

Open it in two browser windows (or one normal and one private window): sign in as a trainee in one and as a trainer in the other, and ring the trainee. `localhost` counts as secure, so the microphone works.

**Tests** (`tests/`): two headless Chrome windows with fake microphones run through a local `wrangler dev` with a stand-in for Google's Gemini API (`tests/mock-gemini.js`).

```
npm test        # or: cd tests && npm install && npx playwright install chromium && bash run.sh
```

`SHOTS=<folder>` keeps the screenshots the tests take; `LIVE_ONLY=1` runs only the live-call test; `PORT=<port>` if 8799 is taken. Google Meet itself can't be driven in a test: the tests check that the Class view plays the call's audio, which is what Meet's "share tab audio" sends.

- `e2e-live.js`: the trainer rings, the trainee answers, and audio flows both ways. Then it runs:
  - the ✋ request, the live note, hold with hold music, a transfer answered "no answer", a coaching time-out;
  - the 📺 Class view: it plays the call (the console goes quiet), the trainee is told the class is listening, it shows the live note and hold but never the script, and closing it brings the audio back to the console;
  - signing in as another trainee with a wrong PIN, or none, is refused;
  - a second trainer tab opened mid-call leaves the call alone;
  - a reload of the trainee's page and of the trainer's console mid-call (both reconnect);
  - hang up, the recording saved, played and downloaded, the note submitted, the scorecard sent;
  - "Save draft" after sending keeps the edits from the trainee;
  - the trainee reads the scorecard (the caller's script and unsent drafts never reach the trainee);
  - a declined call.
- `e2e-ai.js`: a voice practice call over the Gemini Live stand-in (microphone audio up, the caller's audio and transcripts back), hold, hang up, AI scoring, a typed practice call, the trainer's AI draft from a live recording, and a live-only call that can't be practiced.
- `e2e-meter.js`: the 📊 server request meter. `/api/request-budget` refuses a visitor who isn't signed in and a trainee, and gives a trainer `usage: null` before the Request budget workflow has run and the month's numbers after (saved to the local KV with `wrangler kv key put --local`). A trainee's pages show no meter and never ask for it; the trainer's console shows it after one request and keeps it on every trainer page; the Class view has none.
- `request-meter-widget.cjs`: the meter itself, in a blank page (the same test in every LSH platform): each level, the note above the chip, the details, how often it asks, signing out, a phone screen.

**Checks on GitHub** (`.github/workflows/checks.yml`): every pull request and every push to `main` builds the Worker without deploying (`npm run check`) and runs all of the tests above (`tests/run.sh`). A red **Checks** status means something broke; the log says which step.

## Files

| Path | What it is |
|---|---|
| `src/worker.js` | The Worker: sign-in, the API, recordings (KV), TURN credentials, AI practice and scoring. |
| `src/switchboard.js` | The Switchboard Durable Object: every phone's WebSocket (presence, ringing, WebRTC signaling, hold, transfer, notes, coaching), the reconnect grace period and ring timeout (alarms), and the call records, trainees and written scenarios (SQLite). |
| `src/scenarios.js` | The firm (directory, rules), the case files, the note forms, the rubrics, and the 24 calls. |
| `src/prompts.js` | The AI caller's instructions and the scorer's (the facilitator's voice). |
| `src/gemini.js` | The Gemini key pool, text and audio scoring, and Gemini Live tokens. |
| `src/auth.js` | Sign-in tokens, trainee ids (the same shapes as the other LSH platforms) and PIN hashing. |
| `public/index.html`, `public/css/app.css` | The app shell and its look (LSH navy and orange, IBM Plex). |
| `public/_headers` | Response headers for the app's files (microphone allowed on this site only, no caching of the page). |
| `public/js/phone.js` | The VOIP engine: the Switchboard connection, the WebRTC call (with ICE restart), the call recorder, the mic. |
| `public/js/sounds.js` | Ringing, ringback, the hang-up tone and hold music, all synthesized. |
| `public/js/ai-call.js` | The AI practice caller (Gemini Live voice, or typed). |
| `public/js/app.js` | Sign-in, pages, the phone screen, the note form, case lookup, the directory. |
| `public/js/trainee.js` | 📞 My phone and 🎧 Practice. |
| `public/js/console.js` | 🎛 The trainer's console. |
| `public/js/review.js` | 🗂 Calls, a call's review and scorecard (recording playback and download), 📚 Scenarios, 👥 Trainees, ⚙️ Setup. |
| `public/js/classview.js` | 📺 The Class view: a tab to present in Google Meet (plays the call, shows the live note, never the script). |
| `public/js/request-budget.js` | 📊 The server request meter for trainers (the same file in every LSH platform). |
| `tests/` | The end-to-end tests. |
| `.github/workflows/checks.yml` | The checks GitHub runs on every pull request and push to `main`. |

**Data:**
- Durable Object SQLite: trainees (with a salted hash of each PIN), calls (timings, the note, the transcript, the reviews), written scenarios, and usage counts for the AI and sign-in limits.
- KV (`LSH_KV`, prefix `voip:`): recordings. The request meter also reads `_request-usage` there (saved by EA-PA-TRAINING's Request budget workflow); this site never writes it.

Trainee ids match the other LSH platforms (`name--batch`). Trainers can archive trainees in **👥 Trainees**.

**Recordings:**
- Live calls are recorded on the trainer's console, both voices in one file; the trainee sees ● REC.
- If the trainer's page reloads mid-call, the recording restarts from that point.
- Practice calls are recorded on the trainee's phone.
- Trainees can play their own recordings; trainers can play and delete any.
- **⬇ Download the recording** saves it as, for example, `Mock call - Jamie Cruz - An Offer With a Deadline - 2026-09-30.webm` (plays in Chrome, Edge and VLC; upload it to the trainee's folder next to the Meet recording).
