/* =========================================================
   LSH Ring Channel: the scenario library
   ---------------------------------------------------------
   The firm, its directory and front-desk rules, the case files a
   trainee can look up during a call, the note forms, the rubrics,
   and the mock calls themselves.

   Source: the CMS. The calls are the CMS's Call Simulator calls
   (CaseManagementTraining/call-packs.js, mirrored to src/cms/ by
   scripts/sync-cms-calls.mjs; SCENARIOS below), for every program.
   The case files are the CMS's Training Library cases
   (CaseManagementTraining/mock-cases.js, MC-xx), with the text of
   the ones the calls are about taken from the CMS's own copy, and
   the Case Management, Property Damage and EA / PA case summaries
   the CMS's calls are played on.

   A scenario is what the trainer plays on a live call (and what
   the AI caller plays in practice):
     caller      who rings, and the caller ID the trainee sees
     opening     the caller's first line
     hidden      who the caller is, what they answer when asked,
                 how they behave (trainer-only)
     goals       what a good call does (trainer-only until the call
                 ends; the scorecard ticks them)
     facts       the day and who is in or out (the trainee sees it
                 in practice mode; the trainer always)
     caseId      the case the call is about (opens in the CMS)
     hideCases   cases the lookup must not show during the call
                 (a first-time caller isn't on file yet)
     reference   the finished case file shown after the call
     unavailable extensions that don't pick up a transfer
   ========================================================= */
import CMS from './cms/call-packs.js';

export const CMS_URL = 'https://lshcasemanagementtraining-trainingcrm.pages.dev/';

/* 🎚 The voices an AI caller can speak with (Gemini Live's prebuilt voices).
   A call picks one by the caller's gender unless the trainer (or the trainee, on 🎧 Practice)
   changes it on the 🎚 Voice list: the same caller, a different person on the line. */
export const AI_VOICES = [
  { id: 'Kore', label: 'Kore', desc: 'Firm and clear', gender: 'f' },
  { id: 'Aoede', label: 'Aoede', desc: 'Bright and warm', gender: 'f' },
  { id: 'Leda', label: 'Leda', desc: 'Young and light', gender: 'f' },
  { id: 'Zephyr', label: 'Zephyr', desc: 'Easy and breezy', gender: 'f' },
  { id: 'Puck', label: 'Puck', desc: 'Upbeat and quick', gender: 'm' },
  { id: 'Charon', label: 'Charon', desc: 'Deep and measured', gender: 'm' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Gruff and forceful', gender: 'm' },
  { id: 'Orus', label: 'Orus', desc: 'Steady and business-like', gender: 'm' }
];
export const voiceOk = (v) => AI_VOICES.some((x) => x.id === v) ? String(v) : '';

export const FIRM = {
  name: 'LSH Training Law Group',
  fictional: true,
  mainLine: '(555) 010-2000',
  intakeLine: '(555) 010-2100',
  fax: '(555) 010-2099',
  hours: 'Monday–Friday, 8:30 AM – 5:30 PM (Eastern). After hours: voicemail is checked at 8:30 AM.',
  address: '400 Commerce Street, Suite 1200, Riverton',
  directory: [
    { name: 'Atty. Marcus Reyes', role: 'Lead Attorney (Pre-Litigation)', ext: '201' },
    { name: 'Atty. Elena Brooks', role: 'Lead Attorney (Litigation)', ext: '202' },
    { name: 'Atty. David Okafor', role: 'Associate Attorney / Intake Attorney', ext: '203' },
    { name: 'Janelle Price', role: 'Litigation Paralegal', ext: '221' },
    { name: 'Priya Natarajan', role: 'Case Manager', ext: '311' },
    { name: 'Tom Alvarez', role: 'Case Manager', ext: '312' },
    { name: 'Grace Kim', role: 'Case Manager', ext: '313' },
    { name: 'Luis Ortega', role: 'Case Manager (bilingual English/Spanish)', ext: '314' },
    { name: 'Sam Whitaker', role: 'Demand Specialist', ext: '331' },
    { name: 'Rosa Delgado', role: 'Lien Negotiator', ext: '341' },
    { name: 'Kevin Lam', role: 'Property Damage Specialist', ext: '351' },
    { name: 'Intake Team', role: 'New cases and potential clients', ext: '100' },
    { name: 'Records Team', role: 'Medical records and bills', ext: '400' },
    { name: 'Accounting / Disbursements', role: 'Settlement checks and trust account', ext: '500' },
    { name: 'Interpreter line', role: 'Phone interpreter (three-way call)', ext: 'INT' }
  ],
  rules: [
    'Verify every caller who asks about a case: full name, date of birth, and one more identifier on file (home address, or the last 4 of the SSN). Never read an identifier out to the caller; ask them to give it to you.',
    'Only the client, or a person the file lists as authorized (a guardian, a power of attorney, or someone on a signed communication authorization), gets case information. Everyone else gets "I can take a message" and nothing more, not even whether the firm represents that person.',
    'The front desk never gives legal advice, case values, settlement opinions or deadlines to act on. Take a complete message and route it.',
    'Insurance adjusters and opposing counsel go to the attorney or case manager on the file. Never agree to a recorded statement, confirm facts, or accept a settlement offer.',
    'Media calls: "We have no comment. I can take your name and number for the attorney." Nothing else.',
    'A complete message: date and time, caller name and role, callback number, best time to call, case name, what they need, how urgent, and your initials. Log it as a Note on the case and route it to the person on the file.',
    'Urgent (route now, not by message): a client in danger or in crisis, a deadline or court date in the next 7 days, a settlement offer with a time limit, a statute of limitations close, a subpoena or a process server, or anyone threatening legal action against the firm.'
  ]
};

// The case files a trainee can look up during a call (what the CMS shows).
const C = (id, name, title, text) => ({ id, name, title, text });
export const CASES = {
  'MC-01': C('MC-01', 'Maria Santos', 'MVA, in treatment', `Client: Maria Santos · DOB 03/22/1988 · 1187 Willow Bend Dr, Riverton, GA 30301 · SSN last 4: 4821 · (555) 010-4417
Authorized: ONLY the client (no communication authorization for anyone else).
Attorney: Atty. Marcus Reyes (201) · Case Manager: Priya Natarajan (311) · Phase: Treatment
Date of loss 06/09/2026 · rear-end collision; liability clear.
Treatment: City Spine & Rehab, chiropractor, next visit Tuesday 09/29/2026 at 10:30 AM; physical therapy Thursday 10/01/2026 at 4:00 PM. Clinic phone (555) 010-3345.
Tasks: next client check-in with Priya 10/20/2026. Records Specialist to request updated City Spine & Rehab records after 10/31/2026.
File note: the client keeps a mileage log for her appointments.`),
  'MC-02': C('MC-02', 'Derek Thompson', 'Slip and fall, intake', `Potential client: Derek Thompson · DOB 11/05/1975 · 52 Harbor View Rd, Apt 3B, Riverton, GA 30303 · SSN last 4: 1934 · (555) 010-4520 · d.thompson@example.com
Attorney: Atty. David Okafor (203) · Case Manager: not assigned yet · Phase: Intake
Incident 09/12/2026, about 6:15 PM: slipped on spilled liquid detergent in aisle 7 of FreshWay Market (Route 9 store). No warning cone. Right wrist fracture (cast), hip bruising. Store manager Alan Pruitt took an incident report; client photographed the spill; two witnesses gave their names to the store.
Treatment: St. Mary's Hospital (discharged), Riverton Orthopedic Associates (ongoing).
Store's insurer: Allied Retail Casualty, adjuster Brent Kowalski, claim ARC-26-44091.
Intake completed 09/18/2026. Retainer and HIPAA sent by e-sign 09/21/2026: NOT yet signed. Task: Intake to follow up on the unsigned retainer by 09/28/2026.
File note: the attorney asked him not to talk to the store or its insurer.`),
  'MC-04': C('MC-04', 'Robert "Bobby" Chen', 'MVA, policy-limits demand out', `Client: Robert "Bobby" Chen · DOB 01/30/1969 · 88 Lantern Hill Rd, Riverton, GA 30307 · SSN last 4: 2208 · (555) 010-4741
Authorized: only the client. Wife Susan Chen is the emergency contact ONLY, not authorized.
Attorney: Atty. Marcus Reyes (201) · Case Manager: Grace Kim (313) · Phase: BI Demand
Policy-limits demand ($100,000) sent 09/08/2026 with a 30-day time limit: response due 10/08/2026.
At-fault carrier: Liberty Crest Insurance, adjuster Greg Hollis, claim LC-25-99812.`),
  'MC-05': C('MC-05', 'Linda Garcia', 'Premises liability, in litigation', `Client: Linda Garcia · DOB 05/09/1961 · 2200 Pine Ridge Blvd, Unit 14, Riverton, GA 30309 · SSN last 4: 7702 · (555) 010-4850
Authorized: son Marco Garcia (signed communication authorization 05/2026).
Attorney: Atty. Elena Brooks (202) · Paralegal: Janelle Price (221) · Case Manager: Tom Alvarez (312) · Phase: Litigation
Garcia v. Pine Ridge Property Management LLC, Riverton County State Court, No. 26-CV-01877. Defense counsel: Richard Voss, Voss & Tate LLP, (555) 010-7990.
Calendar: deposition prep with Atty. Brooks Friday 10/02/2026 at 2:00 PM at our office. Client's deposition Tuesday 10/06/2026 at 10:00 AM at defense counsel's office.
Rule: court dates and depositions are never agreed at the front desk.`),
  'MC-06': C('MC-06', 'James Wilson', 'MVA (truck crash, DOL 01/12/2025), settled, disbursement', `Client: James Wilson · DOB 09/17/1983 · 17 Birchwood Lane, Riverton, GA 30311 · SSN last 4: 3390 · (555) 010-4962
Authorized: only the client.
Attorney: Atty. Marcus Reyes (201) · Case Manager: Priya Natarajan (311) · Lien Negotiator: Rosa Delgado (341) · Phase: Disbursement
Settled 08/28/2026 for $42,000; check deposited to trust. One provider's written lien reduction (Align Chiropractic) is still pending. After it arrives, the client signs the final settlement statement; the check is ready about 3 business days later.
Office procedure: settlement checks are released only to the client with photo ID, unless the attorney approves a signed written authorization. Accounting / Disbursements: 500.`),
  'MC-08': C('MC-08', 'Tomás Rivera', 'Motorcycle crash, in treatment', `Client: Tomás Rivera · DOB 04/18/1964 · 905 Mission Road, Riverton, GA 30314 · SSN last 4: 8043 · (555) 010-5188
Speaks Spanish; prefers Spanish. Authorized: daughter Daniela Rivera (communication authorization 07/24/2026).
Attorney: Atty. Marcus Reyes (201) · Case Manager: Luis Ortega (314, bilingual English/Spanish) · Phase: Treatment
Right tibia fracture. Knee surgery Wednesday 10/14/2026 at Northside Surgery Center, arrive 7:00 AM. Pre-op labs 10/07/2026.
Task: Luis Ortega to call the client after surgery (10/15/2026).
Rule: don't guess through a language barrier. Transfer Spanish-speaking callers to Luis; if he's unavailable, use the firm's interpreter line or take a message with a callback number.`),
  'MC-10': C('MC-10', 'Sofia Morales (minor)', 'Dog bite, in treatment', `Client: Sofia Morales (age 8, DOB 06/02/2018), by her father Frank Morales (primary custody; signed the retainer) · 14 Orchard Lane, Riverton, GA 30318 · (555) 010-5305
Verify with Sofia's name and DOB plus Frank's address. Authorized: Frank only. The file says: do NOT share information with the mother, Angela Ruiz, unless Frank authorizes it in writing. Anyone else (school, relatives) is not authorized.
Attorney: Atty. Marcus Reyes (201) · Case Manager: Priya Natarajan (311) · Phase: Treatment
Next appointment: Lakeside Plastic Surgery, 11/10/2026 at 3:30 PM.`),
  'MC-12': C('MC-12', 'William Harris', 'MVA, early investigation', `Client: William Harris · DOB 08/08/1958 · 3 Colonial Drive, Riverton, GA 30322 · SSN last 4: 9136 · (555) 010-5520 · will.harris@example.com
Authorized: only the client. Wife Beverly Harris is the emergency contact.
Attorney: Atty. David Okafor (203) · Case Manager: Grace Kim (313) · Property Damage: Kevin Lam (351) · Phase: Investigation
Date of loss 09/14/2026: his parked car was hit, and he was clipped while loading groceries, by a driver backing out (Stacy Owens). Hip and hand bruising. QuickCare Urgent Care 09/15/2026.
Police: Riverton PD RPD-26-091488 (report pending). At-fault carrier: Keystone Mutual Insurance, policy KM-5520881, claim KM-26-133002, adjuster not yet assigned. Health: Medicare Advantage (Humana Gold Plus).
Property damage: 2017 Buick LaCrosse towed to Parkway Collision, (555) 010-6610; storage $45/day from 09/21/2026.
Notes 09/16: PD claim opened, waiting on a PD adjuster; Kevin Lam is handling the car. Client asked about a rental car: Kevin Lam will follow up once the PD adjuster accepts liability.`),
  'MC-13': C('MC-13', 'Nicole Adams', 'Premises liability, potential client', `Potential client: Nicole Adams · DOB 03/03/1984 · 1520 Lakeshore Blvd, Riverton, GA 30324 · SSN last 4: 4470 · (555) 010-5634 · nicole.adams@example.com
Attorney: Atty. David Okafor (203) · Intake Team (100) · Phase: Intake (not a client yet; retainer not signed)
Incident 10/20/2024 at HomeMax (Route 12): boxed patio heaters fell from a top shelf onto her shoulder and head. Rotator cuff strain, concussion symptoms. Treated at Riverton Orthopedic Associates.
She dealt with the store's insurer herself for a year: National Claims Services (TPA), adjuster Pam Ortiz.
STATUTE OF LIMITATIONS 10/20/2026: urgent for attorney review. Task: attorney to accept or decline by 09/30/2026.
Rule: never answer deadline or SOL questions; route urgently to Atty. Okafor or Intake.`),
  'MC-14': C('MC-14', 'Carlos Mendoza', 'Truck crash, in litigation', `Client: Carlos Mendoza · DOB 12/19/1977 · 250 Ironwood Street, Riverton, GA 30326 · (555) 010-5745
Attorney: Atty. Elena Brooks (202) · Case Manager: Luis Ortega (314) · Phase: Litigation
Mendoza v. Redline Freight LLC and Toller, Riverton County Superior Court, No. 26-CV-00412. Local news covered the crash.
File note 09/10: media calls get "no comment"; take the name and number for Atty. Brooks. Confirm nothing, not even representation or dates.`),
  'MC-16': C('MC-16', 'Hannah Pierce', 'MVA, demand review; client unhappy', `Client: Hannah Pierce · DOB 06/25/1987 · 77 Cedar Hollow Rd, Riverton, GA 30330 · SSN last 4: 8820 · (555) 010-5961 · hannah.pierce@example.com
Authorized: only the client.
Attorney: Atty. Marcus Reyes (201) · Case Manager: Tom Alvarez (312) · Phase: Demand Review
Date of loss 12/09/2025: rear-end collision on Highway 20. Treatment finished 08/2026; demand in preparation.
Notes: 09/23 client emailed, unhappy with communication, said she "might go elsewhere"; escalated to Atty. Reyes. 09/24 Atty. Reyes spoke with her; she is thinking about it. ANY substitution or file request: route to Atty. Reyes directly.
Rule: a file is never released on a phone call.`),
  'MC-19': C('MC-19', 'Samuel Boateng', 'Pedestrian hit by a city bus, investigation', `Client: Samuel Boateng · DOB 02/14/1970 · 301 Station Road, Riverton, GA 30336 · SSN last 4: 0921 · (555) 010-6295 · sam.boateng@example.com
Authorized: only the client.
Attorney: Atty. Marcus Reyes (201) · Case Manager: Luis Ortega (314) · Phase: Investigation
Date of loss 06/30/2026: in a marked crosswalk when a Riverton Transit bus (Route 4) turned right and struck him. Fractured pelvis. St. Mary's Hospital 06/30–07/06/2026. Police: RPD-26-063077.
Claim against a government entity: City of Riverton Risk Management (self-insured), claim RM-26-0415, adjuster Deborah Kline, (555) 010-7999. Ante litem notice served on the City 08/14/2026.
Note 08/14: ALL contact from the City goes to Atty. Reyes.`),
  'MC-23': C('MC-23', 'James Wilson', 'Garage handrail fall (DOL 05/16/2026), in treatment', `Client: James Wilson · DOB 09/17/1983 · 17 Birchwood Lane, Riverton, GA 30311 · SSN last 4: 3390 · (555) 010-4962
SAME client as MC-06 (his truck crash). Always confirm the date of the accident to open the right file. Authorized: only the client.
Attorney: Atty. Marcus Reyes (201) · Case Manager: Tom Alvarez (312) · Phase: Treatment
Date of loss 05/16/2026: a loose stairwell handrail at the Riverton Plaza garage gave way; he fell about six steps. Lower back and right wrist.
Treatment: Align Chiropractic, next visit Wednesday 09/30/2026 at 5:30 PM. Riverton Pain Institute: first lumbar injection Wednesday 10/07/2026 at 1:15 PM.
Carrier: Keystone Commercial, claim KC-26-71540, adjuster Paul Dreyer.`),
  'MC-24': C('MC-24', 'James Wilson', 'Hotel pool fall (DOL 08/08/2026), investigation', `Client: James Wilson · DOB 04/02/1956 · 5 Quarry Road, Riverton, GA 30325 · SSN last 4: 7718 · (555) 010-6520 (home; no email)
A DIFFERENT James Wilson from MC-06 / MC-23 (DOB 09/17/1983). Authorized: the client and his son Kevin Wilson (communication authorization 08/18/2026), (555) 010-6521.
Attorney: Atty. David Okafor (203) · Case Manager: Priya Natarajan (311) · Phase: Investigation
Date of loss 08/08/2026, about 4:40 PM: slipped on algae-slick tiles at the edge of the pool, Grandview Hotel (Lakeshore Blvd). Fractured right hip; partial hip replacement 08/09/2026 at St. Mary's; inpatient rehab 08/13–09/03/2026.
Treatment: Motion Physical Therapy, 2x/week, next session Thursday 10/01/2026 at 11:00 AM. Medicare is primary.
Hotel's insurer: Allied Retail Casualty, adjuster Brent Kowalski, claim ARC-26-51177.`),
  'MC-28': C('MC-28', 'Marcus Lee', 'Rental e-scooter crash, investigation', `Client: Marcus Lee · DOB 05/19/2000 · 77 Canal Street, Apt 5C, Riverton, GA 30305 · SSN last 4: 6619 · (555) 010-6660 · marcus.lee@example.com
Authorized: only the client.
Attorney: Atty. David Okafor (203) · Case Manager: Tom Alvarez (312) · Phase: Investigation
Date of loss 09/05/2026: rented ZipRide e-scooter; the front brake lever went slack going down the Market Street hill; crashed at Market and 3rd. Broken collarbone, road rash. Police: RPD-26-090517. Ride receipt ZR-8841-2207; client's photos of the brake lever.
No health insurance: Riverton Orthopedic is treating under a letter of protection; next visit Friday 10/02/2026 at 1:30 PM.
Carrier: Continental Product Liability Group (for ZipRide Mobility Inc.), claim CPLG-26-9044, adjuster Martin Blake.
Note 09/09: client told not to post about the crash or the case on social media, and not to talk to ZipRide or its insurer.`),
  'MC-36': C('MC-36', 'Walter Grant', 'Pedestrian hit by a delivery van, brand-new file', `Client: Walter Grant · DOB 06/30/1968 · 504 Riverbend Parkway, Riverton, GA 30317 · SSN last 4: 3371 · (555) 010-6740 · walter.grant@example.com
Authorized: ONLY the client. His employer (Riverton Medical Supply) is NOT authorized.
Attorney: Atty. David Okafor (203) · Case Manager: not assigned yet · Phase: Intake
Date of loss 09/22/2026: in the Harbor Street crosswalk with the walk signal; a FreshCart Delivery van (driver Leon Fry, cited) turned right and hit him. Broken left leg (tibia), head laceration (8 stitches). St. Mary's 09/22–09/24. First orthopedic visit Thursday 10/01/2026 at 10:00 AM.
Police: RPD-26-092219. Van's insurer: TransAmerica Freight Insurance, claim TFI-26-51770. Health: Blue Horizon PPO.
Retainer signed by e-sign 09/27/2026. Intake packet (HIPAA forms, insurance card, photos) not returned yet; a case manager is being assigned this week.`)
};
// The CMS's copy of a Training Library file a call is about wins: it's the file the trainee has in the CMS on that call.
for (const [id, d] of Object.entries(CMS.DOCS)) {
  if (CASES[id]) CASES[id].text = d.text;
  else { const m = /^\S+ · (.+?) \((.+)\)$/.exec(d.title) || []; CASES[id] = C(id, m[1] || id, m[2] || '', d.text); }
}
// The other programs' case summaries (the CMS's CASES: cm, pd, ea), as case files in 🔎 Case lookup.
const CMS_CASE_NAMES = { cm: ['CMS-CM', 'John Doe', 'MVA v. Apex Delivery Services (Case Management)'], pd: ['CMS-PD', 'Angela Carter', 'Property damage claim, 2022 RAV4 (Property Damage)'], ea: ['CMS-EA', 'Elias Thorne', 'Client profile (EA / PA)'] };
const CMS_CASE_IDS = {};
for (const [k, c] of Object.entries(CMS.CASES)) {
  const [id, name, title] = CMS_CASE_NAMES[k] || ['CMS-' + k.toUpperCase(), c.label, c.label];
  CMS_CASE_IDS[k] = id; CASES[id] = C(id, name, title, c.text);
}

// The trainee's note for each kind of call.
export const NOTE_FORMS = {
  message: { title: 'Message slip / case note', fields: [
    { k: 'when', label: 'Date / time', type: 'text', auto: 'now' },
    { k: 'caller', label: 'Caller name and role', type: 'text' },
    { k: 'verified', label: 'Verified?', type: 'select', options: ['', 'Verified: client', 'Verified: authorized person', 'Could not verify', 'Not authorized: message only', 'Business / outside caller', 'New caller: nothing on file'] },
    { k: 'how', label: 'How verified (identifiers the caller gave)', type: 'text' },
    { k: 'callback', label: 'Callback number', type: 'text' },
    { k: 'best', label: 'Best time to call back', type: 'text' },
    { k: 'case', label: 'Case (MC # / client)', type: 'text' },
    { k: 'need', label: 'What they need', type: 'textarea' },
    { k: 'urgency', label: 'Urgency', type: 'select', options: ['', 'Routine', 'Today', 'Urgent'] },
    { k: 'why', label: 'Why that urgency', type: 'text' },
    { k: 'routed', label: 'Routed to (name / ext) and action taken', type: 'textarea' },
    { k: 'initials', label: 'Your initials', type: 'text', short: true }
  ] },
  calendar: { title: 'Calendar entry and case note', fields: [
    { k: 'when', label: 'Date / time of call', type: 'text', auto: 'now' },
    { k: 'caller', label: 'Caller name and role', type: 'text' },
    { k: 'verified', label: 'Verified?', type: 'select', options: ['', 'Verified: client', 'Verified: authorized person', 'Could not verify', 'Not authorized: message only', 'Business / outside caller'] },
    { k: 'event', label: 'Calendar title (meeting type – client name)', type: 'text' },
    { k: 'eventWhen', label: 'Day, date and time (EST) and length', type: 'text' },
    { k: 'format', label: 'Format', type: 'select', options: ['', 'Phone', 'Video (Zoom)', 'In person'] },
    { k: 'where', label: 'Location / dial-in / number to call', type: 'text' },
    { k: 'who', label: 'Who attends', type: 'text' },
    { k: 'confirmed', label: 'Confirmed with (name / number)', type: 'text' },
    { k: 'reminder', label: 'Reminder (email a day before) / follow-up', type: 'text' },
    { k: 'routed', label: 'Routed to / action taken', type: 'textarea' },
    { k: 'note', label: 'Case note (what was said, by whom)', type: 'textarea' },
    { k: 'initials', label: 'Your initials', type: 'text', short: true }
  ] },
  intake: { title: 'Intake note', fields: [
    { k: 'when', label: 'Date / time of call', type: 'text', auto: 'now' },
    { k: 'caller', label: 'Caller (name, and relationship if calling for someone)', type: 'text' },
    { k: 'name', label: 'Potential client: full name', type: 'text' },
    { k: 'dob', label: 'Date of birth', type: 'text', short: true },
    { k: 'phone', label: 'Phone', type: 'text', short: true },
    { k: 'email', label: 'Email', type: 'text' },
    { k: 'address', label: 'Address', type: 'text' },
    { k: 'incidentWhen', label: 'Date and time of incident', type: 'text' },
    { k: 'incidentWhere', label: 'Place of incident', type: 'text' },
    { k: 'what', label: 'What happened', type: 'textarea' },
    { k: 'injuries', label: 'Injuries / treatment so far', type: 'textarea' },
    { k: 'parties', label: 'Other parties (for the conflict check)', type: 'textarea' },
    { k: 'insurance', label: 'Insurance / adjuster contacts (theirs and the other side\'s)', type: 'textarea' },
    { k: 'evidence', label: 'Evidence (photos, reports, witnesses, report numbers)', type: 'textarea' },
    { k: 'urgency', label: 'Deadlines / urgency', type: 'textarea' },
    { k: 'next', label: 'Next step / routed to', type: 'textarea' },
    { k: 'initials', label: 'Your initials', type: 'text', short: true }
  ] }
};

// How each kind of call is scored: the program's own Mock Calls Metrics (Training Guide, Day 4 Reception
// Mock Calls Metrics, Day 6 Calendar Management Mock Calls Metrics, Day 9 Intake Mock Calls Metrics).
// Each metric is scored 1 to 5 with feedback; the call's grade is their WEIGHTED AVERAGE (weights in
// ⚙️ Setup, 1 each by default). The descriptions are what the trainer and the AI grader score against.
const M = (name, desc, voice) => ({ name, desc, voice: !!voice });
const INTRO = M('Introduction of Law Firm and Name', 'Opens with the firm\'s name and their own name and offers help ("Thank you for calling LSH Training Law Group, this is Jamie. How may I help you?").');
const COMMON_SOFT = [
  M('Customer Service', 'Courteous, patient and helpful; acknowledges the caller\'s concern and keeps them informed of what is happening.'),
  M('Assertiveness', 'Holds firm, politely, on confidentiality and firm policy; doesn\'t give in to pressure; redirects the caller to what the firm can do.'),
  M('Listening Skills', 'Lets the caller finish, doesn\'t talk over them, catches the key details the first time and doesn\'t make the caller repeat themselves.', true),
  M('Comprehension', 'Understands what the caller actually needs and answers that need; asks clarifying questions when something is unclear.'),
  M('Attention to Details', 'Captures names, numbers, dates and amounts exactly; reads back the callback number and key details; the note matches the call and the file.')
];
const CLOSE_AND_VOICE = [
  M('Closing Spiel', 'Recaps the next step, asks if there is anything else, thanks the caller and closes professionally with the firm name.'),
  M('Time Management', 'Handles the call efficiently without rushing the caller: no unnecessary holds, long checks or detours; the call length fits the request.'),
  M('Dead Air/Fillers', 'No long silences (dead air) and few fillers ("um", "uh", "like", "okay so"); explains any pause ("let me check the file for you").', true),
  M('Clarity of Speech (Articulation, Volume, Enunciation)', 'Speaks clearly, at a good volume and pace; words are easy to understand over the phone.', true),
  M('Tone of Voice', 'Warm, calm, confident and professional; matches the caller\'s emotion appropriately (reassuring with an upset caller, brisk with a busy one).', true)
];
export const TRACKS = {
  reception: {
    label: 'Reception', lineLabel: 'Main Line', icon: '☎', note: 'message', sheet: 'Reception Mock Calls Metrics',
    rubric: [
      INTRO,
      M('Authentication (Name, DOL, DOB, Claim No, Case No.)', 'Verifies the caller before sharing anything: asks for the identifiers the file needs (full name, date of birth, date of loss, and the claim or case number or another identifier on file), compares them with the file and never reads them out; shares only with the client or an authorized person. A business caller is identified (name, company, claim number) and gets nothing about the client.'),
      ...COMMON_SOFT,
      M('Resolution', 'Gives an accurate answer from the file, or takes a complete message (date and time, caller and role, callback number, best time, case, what they need, urgency, initials) and routes it to the right person with the right urgency; the caller leaves with a clear next step.'),
      M('Transfer Procedure', 'Asks before placing the caller on hold or transferring, says who they are transferring to and why, checks back on a caller on hold, and handles an unanswered transfer by returning to the caller with options (a message or voicemail). If no transfer was needed, judges correctly that a message was the right route.'),
      ...CLOSE_AND_VOICE
    ],
    tips: ['Firm name, your name, "how may I help you?"', 'Verify before you share: name, DOB, date of loss, plus a claim or case number or another identifier on file.', 'Not authorized? "I can take a message," and nothing more.', 'Ask before you hold or transfer; say who you\'re transferring to.', 'Read the callback number back, recap, and close with the firm name.']
  },
  calendar: {
    label: 'Calendar', lineLabel: 'Main Line', icon: '🗓', note: 'calendar', sheet: 'Calendar Management Mock Calls Metrics',
    rubric: [
      M('Professional Introduction & Call Control', 'Greets with the firm name and their own name, guides the call and keeps it on track.'),
      M('Client Comprehension & Flow Control', 'Understands the request (the meeting type, its purpose, who attends) and follows a logical call flow; adapts to the caller\'s tone (easy, anxious, irritated, impatient or emotional).'),
      M('Information Verification & Accuracy', 'Collects and verifies the minimum information (name, callback number, date of birth, date of loss) and checks the caller is authorized before discussing any date; every detail given is accurate.'),
      M('Slot Identification & Scheduling Rule Compliance', 'Offers only real available slots and follows the scheduling rules: time zone, meeting durations, buffers, consult days and hours, same-day approval, and court dates or depositions never agreed at the front desk.'),
      M('Alternative Time Offering', 'When the requested time isn\'t available, offers 2 to 3 alternative times instead of a dead end.'),
      M('Calendar Creation & Attorney Reminder Setup', 'The calendar entry is complete and correct: a title with the meeting type and client name, the date and time in EST, the format (phone, video or in person), who attends, the callback number and notes; an email reminder is set for the day before.'),
      M('Notes, Recap & Call Closing', 'Reads the booking back (day, date, time, time zone, format), records notes that reflect the case context and the caller\'s demeanor, and closes professionally.')
    ],
    // The Training Guide's Day 6 Calendar Management Mock Call guidelines (what the trainee and the grader go by).
    rules: [
      'Minimum information to collect from the caller: name, callback number, date of birth (DOB) and date of loss (DOL).',
      'Identify available slots only; avoid lunch, buffer time and blocked events.',
      'Offer 2 to 3 alternative times when a requested slot is unavailable.',
      'Clarify the meeting type (phone, video or in person).',
      'Plot the appointment in the attorney\'s calendar, in the EST time zone, and set an email reminder a day before the event.',
      'The attorney does not take new client consults after 5:00 PM; new client consults are only on Tuesdays and Thursdays, at most 3 a day.',
      'Phone consults, status updates, follow-up calls, reviews, regular and urgent meetings, and signing meetings are 30 minutes at most.',
      'Follow-ups are not scheduled in the morning.',
      'All consultation meetings are phone consults, only between 9:30 AM and 3:00 PM; the attorney calls the client, so confirm the callback number.',
      'Preparation, strategy and settlement meetings are 45 minutes at most; conference meetings are 1 hour at most.',
      'The attorney needs a 15-minute buffer before and after every meeting. Same-day bookings require the attorney\'s approval.',
      'Court dates and depositions are never agreed at the front desk.'
    ],
    tips: ['Get the minimum: name, callback number, DOB and DOL.', 'Offer only open slots; give 2–3 alternatives when the time asked for is taken.', 'Say the day, date, time and time zone (EST), and the format.', 'Read the booking back, set the reminder for the day before, and close.']
  },
  intake: {
    label: 'Intake', lineLabel: 'Intake Line', icon: '📋', note: 'intake', sheet: 'Intake Mock Calls Metrics',
    rubric: [
      INTRO,
      M('Authentication (Name, DOL, DOB, Claim No, Case No.)', 'Collects and confirms the caller\'s identifying details (full name, date of birth, date of loss, and any claim or case number) and checks whether they are already on file; a returning caller is verified before anything about their file is shared; someone calling for another person is identified with their relationship.'),
      ...COMMON_SOFT,
      M('Setting Proper Expectations', 'Explains what happens next and when (conflict check, attorney review, a callback), without promising the firm will take the case or any outcome.'),
      M('Explaining the Process', 'Explains the intake process in plain words: the questions, the attorney\'s review, the retainer and HIPAA forms by e-sign, the intake packet.'),
      M('Answering Client\'s Inquiries', 'Answers the caller\'s questions accurately within the intake role; never gives legal advice, a case value, or a deadline or statute of limitations answer: those go to the attorney, urgently when time matters.'),
      M('Commitment', 'Commits to a specific next step and who owns it (who will call, by when) and confirms the best callback number and time.'),
      ...CLOSE_AND_VOICE
    ],
    tips: ['Firm name, your name; then let them tell the story.', 'One question at a time: contact details, DOB, date and place of the incident, injuries, treatment, other parties, insurance, evidence.', 'Never answer "Do I have a case?" or "Is it too late?"; route deadlines now.', 'Set expectations, explain the process, commit to a next step, and close.']
  }
};

// The grade: the weighted average of the scored metrics (1 to 5), and the same as a percentage.
// A metric left unscored (n/a) doesn't count. Weights come from ⚙️ Setup (settings.weights[track][metric]).
export function weightedScore(track, criteria, weights) {
  const w = (weights && weights[track]) || {};
  let sum = 0, wsum = 0;
  (criteria || []).forEach((c) => {
    if (!c || !(c.score >= 1 && c.score <= 5)) return;
    const k = Number(w[c.name]);
    const wt = Number.isFinite(k) && k >= 0 ? k : 1;
    sum += c.score * wt; wsum += wt;
  });
  if (!wsum) return null;
  const avg = sum / wsum;
  return { avg: Math.round(avg * 100) / 100, pct: Math.round(avg * 20) };
}

// ⚙️ Setup's graded mock call settings, as stored by the Switchboard.
export const DEFAULT_SETTINGS = {
  autograde: true,        // the AI grades every live call on its own once the call is over
  autoRelease: false,     // AI grades go to trainees without a trainer's approval
  defaultGraded: true,    // new live calls start as graded mock calls
  passMark: null,         // a percentage; null = no pass/fail shown
  weights: { reception: {}, calendar: {}, intake: {} }
};

const youIntake = 'You are the intake specialist at LSH Training Law Group (fictional). This is a FIRST call to the firm: nothing is on file yet. Take the intake and fill in the Intake note as you go.';

export const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

/* ---------- The calls: the CMS's own, mirrored ----------
   Every call on Ring Channel is a call of the CMS's Call Simulator (CaseManagementTraining/call-packs.js, copied to
   src/cms/call-packs.js by scripts/sync-cms-calls.mjs): the same callers, scripts, goals and case files, for the four
   programs (📘 Standard Training, 🗂 Case Management, 🚗 Property Damage, 🧑‍💼 EA / PA), so a trainer's manual mock call
   on the Console and a trainee's call in the CMS are the same call. Change a call in the CMS, not here.
   A CMS call becomes a scenario here with:
     track     the Mock Calls Metrics it's graded on: a line about calendaring → calendar, about intake → intake,
               everything else → reception (the phone skills every line shares)
     program   FT, CM, PD or EA, and cmsLine, the CMS line it's on (where a graded call counts on the Portal)
     caseId    the Training Library file (FT: MC-xx) or the program's case summary (CASES below: CMS-CM …)
     dir       'out' when the trainee places the call in the CMS: on Ring Channel the trainer rings them and plays the
               person they phoned
   What only a phone has (the caller ID, who doesn't pick up a transfer, a first caller hidden from Case lookup) is
   RING below, by the call's id; a call without it shows WIRELESS CALLER (a call the trainee places: the name they phoned). */
const PROGRAM_NAMES = Object.fromEntries(CMS.PROGRAMS.map((p) => [p.k, p]));
const caller = (idName, number) => ({ idName, number });
const RING = {
  ft_rc_appt: { caller: caller('SANTOS MARIA', '(555) 010-4417') },
  ft_rc_cousin: { caller: caller('WIRELESS CALLER', '(555) 010-7721') },
  ft_rc_check: { caller: caller('WILSON JAMES', '(555) 010-4962') },
  ft_rc_mother: { caller: caller('RUIZ ANGELA', '(555) 010-5390') },
  ft_rc_offer: { caller: caller('LIBERTY CREST INS', '(555) 010-7788'), unavailable: ['201', '313'] },
  ft_rc_reporter: { caller: caller('CHANNEL 8 NEWS', '(555) 010-8800') },
  ft_rc_spanish: { caller: caller('RIVERA TOMAS', '(555) 010-5188'), unavailable: ['314'] },
  ft_cal_depo: { caller: caller('VOSS & TATE LLP', '(555) 010-7991'), unavailable: ['221', '202'] },
  ft_cal_prep: { caller: caller('GARCIA MARCO', '(555) 010-4858') },
  ft_cal_surgery: { caller: caller('RIVERA DANIELA', '(555) 010-5189') },
  ft_cal_checkin: { caller: caller('SANTOS MARIA', '(555) 010-4417') },
  ft_in_derek: { caller: caller('WIRELESS CALLER', '(555) 010-4520'), hideCases: ['MC-02'], reference: 'MC-02' },
  ft_in_nicole: { caller: caller('ADAMS NICOLE', '(555) 010-5634'), hideCases: ['MC-13'], reference: 'MC-13' },
  ft_in_retainer: { caller: caller('WIRELESS CALLER', '(555) 010-4520') }
};
export const trackOfLine = (line) => (/calendar/i.test(line) ? 'calendar' : /intake/i.test(line) ? 'intake' : 'reception');
// A caller ID for a call RING has none for: the same number every time for the same call.
function anyNumber(id) { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `(555) 010-${String(7000 + (h % 2999)).padStart(4, '0')}`; }
// The trainee's brief, said the phone's way: the CMS's "link in your brief" is 🔎 Case lookup here, and a call they
// place in the CMS comes to their phone (picking up puts them through to the person they phoned).
function ringBrief(c, caseId) {
  const name = caseId && CASES[caseId] ? CASES[caseId].name : '';
  let t = String(c.you || '')
    .replace(/open (the|his|her) case in the CMS Training Library \(link in your brief\) or read the case file below it/g, 'look $1 case up in 🔎 Case lookup (or open it in the CMS Training Library)')
    .replace(/\(open the case summary in your brief\)/g, name ? `(its case summary is in 🔎 Case lookup: search ${name})` : '(its case summary is in 🔎 Case lookup)')
    .replace(/\bis in your brief\b/g, name ? `is in 🔎 Case lookup (search ${name})` : 'is in 🔎 Case lookup');
  if (c.dir === 'out') t += ' On Ring Channel the call comes to your phone: when you pick up, you are through to the person you phoned, so open the call as the one calling.';
  return t;
}
function cmsScenario(c) {
  const r = RING[c.id] || {}, p = PROGRAM_NAMES[c.program] || { label: c.program };
  const caseId = c.doc && CASES[c.doc] ? c.doc : c.case && CASES[CMS_CASE_IDS[c.case]] ? CMS_CASE_IDS[c.case] : null;
  return {
    id: c.id, source: `The CMS's Call Simulator · ${p.label} · ${c.line}`, program: c.program, cmsLine: c.line, dir: c.dir === 'out' ? 'out' : 'in',
    track: trackOfLine(c.line), level: LEVELS.includes(c.level) ? c.level : 'Intermediate', title: c.title, caseId,
    hideCases: r.hideCases || [], reference: r.reference || null, unavailable: r.unavailable || [],
    caller: Object.assign({ name: c.name, role: c.role, gender: c.gender === 'm' ? 'm' : 'f' }, r.caller || caller(c.dir === 'out' ? String(c.name).toUpperCase().slice(0, 24) : 'WIRELESS CALLER', anyNumber(c.id))),
    you: ringBrief(c, caseId), facts: c.facts, goals: c.goals || [], hidden: CMS.scriptOf(c), opening: c.opening,
    // what the CMS's grader weighs on this line, beside the Mock Calls Metrics (src/prompts.js gradePrompt)
    focus: c.program === 'FT' ? [] : CMS.rubricOf(c) || [],
    ai: true
  };
}
export const SCENARIOS = CMS.CALLS.map(cmsScenario);

// The line a call rings on: intake calls ring the intake line, everything else the main line.
export const lineOf = (track) => (track === 'intake' ? 'intake' : 'main');
export const LINES = {
  main: { label: 'Main Line', number: FIRM.mainLine, icon: '☎' },
  intake: { label: 'Intake Line', number: FIRM.intakeLine, icon: '📋' }
};

/* 📊 Where a graded call counts in the LSH Training Portal's courses.
   The Call Simulator is Ring Channel's: every graded call taken here is sent to the Portal
   (POST /api/call-results, src/portal.js reportGradedCall), which keeps it on the trainee's Portal
   account and in the course's own store, so the course shows it on their progress. Standard Training
   counts a call by its lesson (Reception 4, Calendar Management 5, Intake 6); the other programs count
   it by its line. The line names are the ones the courses and the Portal already use. */
export const COURSE_LINES = {
  reception: { line: 'Reception Mock Calls', lesson: 4 },
  calendar: { line: 'Calendar Management Mock Calls', lesson: 5 },
  intake: { line: 'Intake Mock Calls', lesson: 6 }
};
export const PROGRAMS = ['FT', 'CM', 'PD', 'EA'];
// The programs as the CMS names them (its call-packs.js PROGRAMS), for the pickers' 📘 🗂 🚗 🧑‍💼 tabs.
export const PROGRAM_TABS = PROGRAMS.map((k) => Object.assign({ k, label: k, short: k, icon: '📞' }, PROGRAM_NAMES[k] || {}));
export const programOk = (p) => { const x = String(p == null ? '' : p).trim().toUpperCase(); return PROGRAMS.includes(x) ? x : ''; };

/* The line a Call Simulator link asks for: the Portal sends ?track=, and a course's older link ?flow=
   (standard, cms, reception, intake, calendaring, ea-pa, pd) or ?line= (the line's name). */
export function trackFromLink(track, line) {
  const t = String(track == null ? '' : track).trim().toLowerCase(), l = String(line == null ? '' : line).trim().toLowerCase();
  if (TRACKS[t]) return t;
  if (t === 'calendaring' || /calendar/.test(l)) return 'calendar';
  if (t === 'intake' || /intake/.test(l)) return 'intake';
  if (t === 'reception' || /reception|front desk/.test(l)) return 'reception';
  return '';
}

// What the Portal is told about a graded call: the program it counts in, its line, and its lesson (Standard Training).
// cmsLine: the CMS line of the call played (a scenario's line), which is the line the other programs count it on, as the
// CMS's own Call Simulator does (call-packs.js courseOf).
export function courseCall(track, program, cmsLine) {
  const t = COURSE_LINES[track] ? track : 'reception';
  const p = programOk(program) || 'FT';
  return { program: p, line: p !== 'FT' && cmsLine ? String(cmsLine).slice(0, 80) : COURSE_LINES[t].line, lesson: p === 'FT' ? COURSE_LINES[t].lesson : null };
}

/* An open call: the trainer rings without picking a script and plays any caller they like. The line
   follows the track (Reception and Calendar ring the Main Line, Intake the Intake Line); it's graded on
   the line's metrics alone (no checklist), with every case file in 🔎 Case lookup as usual. */
export function openCall(track) {
  const t = TRACKS[track] ? track : 'reception';
  return {
    id: 'open_' + t, open: true, track: t, level: 'Open', title: `Open ${TRACKS[t].label} call (no script)`, source: 'LSH Ring Channel',
    caller: { name: 'The caller', role: 'Played by the trainer, no script', gender: '', idName: 'WIRELESS CALLER', number: '(555) 010-0100' },
    you: t === 'intake' ? youIntake : 'You are the receptionist answering the main line at LSH Training Law Group (fictional). Find out who is calling and why; if they say they\'re a client, look them up in 🔎 Case lookup.',
    facts: 'An open call: no script. The trainer plays a caller of their own choosing.',
    opening: '', hidden: 'Decide who you are (a client on one of the case files, a family member, an adjuster, a new caller…) and what you need, and stay in character.',
    goals: [], caseId: '', hideCases: [], unavailable: [], ai: false, live: true
  };
}

// What a trainee may see of a scenario before and during a call (no persona, no goals).
export function traineeView(s) {
  return {
    id: s.id, track: s.track, program: s.program || '', cmsLine: s.cmsLine || '', dir: s.dir || 'in', level: s.level, title: s.title, facts: s.facts, you: s.you,
    caseId: s.hideCases && s.hideCases.includes(s.caseId) ? null : s.caseId,
    hideCases: s.hideCases || [], unavailable: s.unavailable || [], custom: !!s.custom, ai: s.ai !== false,
    line: lineOf(s.track), callerId: { name: (s.caller && s.caller.idName) || 'WIRELESS CALLER', number: (s.caller && s.caller.number) || '' }
  };
}

// A scenario as trainers edit it (custom scenarios are validated the same way).
export function cleanScenario(o) {
  const str = (v, n) => String(v == null ? '' : v).slice(0, n || 400).trim();
  const list = (v, n) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => str(x, n || 400)).filter(Boolean).slice(0, 20);
  const track = TRACKS[o.track] ? o.track : 'reception';
  const caseId = CASES[o.caseId] ? o.caseId : '';
  const c = o.caller || {};
  return {
    id: /^[a-z0-9_-]{3,40}$/.test(o.id || '') ? o.id : 'cu_' + crypto.randomUUID().slice(0, 8),
    custom: true, source: 'Written by a trainer', track,
    // a copy of a CMS call keeps its program, CMS line and direction (a call written from scratch shows under every program)
    program: programOk(o.program), cmsLine: str(o.cmsLine, 80), dir: o.dir === 'out' ? 'out' : 'in', focus: list(o.focus, 300), level: LEVELS.includes(o.level) ? o.level : 'Intermediate',
    title: str(o.title, 120) || 'Untitled call', caseId: caseId || null,
    hideCases: list(o.hideCases, 10).filter((x) => CASES[x]), reference: CASES[o.reference] ? o.reference : null,
    caller: { name: str(c.name, 80) || 'Caller', role: str(c.role, 120), gender: c.gender === 'm' ? 'm' : 'f', idName: str(c.idName, 24).toUpperCase() || 'WIRELESS CALLER', number: str(c.number, 30) || '(555) 010-0000' },
    you: str(o.you, 600) || (track === 'intake' ? youIntake : 'You are the receptionist answering the main line at LSH Training Law Group (fictional).'),
    facts: str(o.facts, 600), goals: list(o.goals, 300), hidden: str(o.hidden, 4000), opening: str(o.opening, 600),
    unavailable: list(o.unavailable, 10).filter((x) => FIRM.directory.some((d) => d.ext === x)),
    ai: o.ai !== false
  };
}
