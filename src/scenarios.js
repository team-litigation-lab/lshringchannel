/* =========================================================
   LSH Mock Call Line: the scenario library
   ---------------------------------------------------------
   The firm, its directory and front-desk rules, the case files a
   trainee can look up during a call, the note forms, the rubrics,
   and the mock calls themselves.

   Source: the Training Portal's Foundational call pack
   (Training-Portal/simulators/call-pack-ft.js: 7 reception, 4
   calendar and 3 intake calls) on the training CMS's Training
   Library cases (CaseManagementTraining/mock-cases.js), plus
   reception and intake calls written here on MC-12, MC-16, MC-19,
   MC-24, MC-28 and MC-36. Case facts are the CMS's own: if a case
   changes there, update its CASES entry and its calls here.

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

export const CMS_URL = 'https://lshcasemanagementtraining-trainingcrm.pages.dev/';

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
    { k: 'event', label: 'Event', type: 'text' },
    { k: 'eventWhen', label: 'Day, date and time (time zone)', type: 'text' },
    { k: 'where', label: 'Location / dial-in / number to call', type: 'text' },
    { k: 'who', label: 'Who attends', type: 'text' },
    { k: 'confirmed', label: 'Confirmed with (name / number)', type: 'text' },
    { k: 'reminder', label: 'Reminder / follow-up', type: 'text' },
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

// How each kind of call is scored (1 to 5 each) and the reminders shown to the trainee.
export const TRACKS = {
  reception: {
    label: 'Reception', lineLabel: 'Main Line', icon: '☎', note: 'message',
    rubric: [
      { name: 'Greeting & Control', desc: 'Greets with the firm name and their own name, calm and warm, controls the call and closes it properly.' },
      { name: 'Verification & Confidentiality', desc: 'Verifies with name, DOB and one more identifier before sharing anything; shares only with the client or an authorized person; never confirms representation to others; no legal advice or values.' },
      { name: 'Accuracy from the case file', desc: 'Anything they tell an authorized caller matches the CMS file exactly (dates, times, names, extensions).' },
      { name: 'Routing & Message', desc: 'Routes to the right person and extension with the right urgency; the note is complete (date/time, caller and role, callback number, best time, case, what they need, urgency, initials).' }
    ],
    tips: ['Firm name, your name, "how may I help you?"', 'Verify before you share: name, DOB, plus address or SSN last 4.', 'Not authorized? "I can take a message," and nothing more.', 'Read the callback number back.', 'Log a Note and route it to the person on the file.']
  },
  calendar: {
    label: 'Calendar', lineLabel: 'Main Line', icon: '🗓', note: 'calendar',
    rubric: [
      { name: 'Greeting & Verification', desc: 'Professional greeting; verifies the caller and that they are authorized before discussing any date.' },
      { name: 'Calendar accuracy', desc: 'Reads the right event from the file and states the date, day, time, time zone and location exactly; never invents availability.' },
      { name: 'Scheduling boundaries', desc: 'Doesn\'t agree to move court dates or depositions; offers only real options; confirms and reads back what was booked.' },
      { name: 'Documentation & follow-up', desc: 'The calendar entry and note are complete (event, date/time/time zone, location, attendees, who confirmed, reminder, routing).' }
    ],
    tips: ['Always say the day, date, time and time zone.', 'Read the booking back to the caller.', 'Court dates and depositions are never agreed at the front desk.', 'Log the calendar entry and a Note.']
  },
  intake: {
    label: 'Intake', lineLabel: 'Intake Line', icon: '📋', note: 'intake',
    rubric: [
      { name: 'Rapport & Control', desc: 'Warm, patient, guides the caller one question at a time and keeps the call on track.' },
      { name: 'Complete intake', desc: 'Collects contact details, DOB, date and place of the incident, what happened, injuries and treatment, other parties (for the conflict check), insurance contacts and evidence.' },
      { name: 'Boundaries', desc: 'No legal advice, no case value, no deadline or SOL answers; doesn\'t promise the firm will take the case.' },
      { name: 'Urgency & next step', desc: 'Spots deadlines and other urgent issues and routes them now; sets a clear next step; the intake note is complete and accurate.' }
    ],
    tips: ['One question at a time; let them tell the story.', 'Get the other parties\' names for the conflict check.', 'Never answer "Do I have a case?" or "Is it too late?"', 'Anything with a deadline is urgent: route it now.']
  }
};

const you = (role, id) => `You are the ${role} at LSH Training Law Group (fictional). The call is about ${CASES[id].name}: look the case up in 🔎 Case lookup (or open it in the CMS Training Library) while you handle it.`;
const youIntake = 'You are the intake specialist at LSH Training Law Group (fictional). This is a FIRST call to the firm: nothing is on file yet. Take the intake and fill in the Intake note as you go.';

const RC = { track: 'reception' }, CAL = { track: 'calendar' }, IN = { track: 'intake' };
const S = (base, o) => Object.assign({ source: 'LSH Training Portal · Foundational call pack' }, base, o);
const N = (base, o) => Object.assign({ source: 'LSH Mock Call Line' }, base, o);

export const SCENARIOS = [
  /* ---------- Reception (the Foundational call pack) ---------- */
  S(RC, {
    id: 'ft_rc_appt', caseId: 'MC-01', level: 'Beginner', title: 'A Client Lost Her Appointment Card',
    caller: { name: 'Maria Santos', role: 'Client (MC-01)', gender: 'f', idName: 'SANTOS MARIA', number: '(555) 010-4417' },
    you: you('receptionist answering the main line', 'MC-01'),
    facts: 'Tuesday morning, 09/22/2026. The main line rings.',
    goals: ['Greets with the firm name and their own name', 'Verifies her (name, DOB, and her address or SSN last 4) before giving any appointment', 'Gives the right visit: City Spine & Rehab, Tuesday 09/29/2026 at 10:30 AM (the 10/01 4:00 PM visit is physical therapy)', 'Suggests she confirm with the clinic at (555) 010-3345', 'If she asks about gas money: promises nothing, reminds her to keep her mileage log, offers a message for Priya Natarajan (ext 311)', 'Logs a Note on the case'],
    hidden: 'You are Maria Santos, a friendly dental hygienist. You lost your appointment card and want to know when your next chiropractor visit is. When asked, you give your name, date of birth (March 22, 1988) and your address (1187 Willow Bend Drive); you only give your SSN last 4 (4821) if they ask for it instead. If they tell you a time without verifying you first, you are fine with it (you don\'t notice). After you get the answer, ask: "Oh, and will you pay me back for gas to all these appointments?" Accept a message for your case manager. Your number is (555) 010-4417, best after 3 PM.',
    opening: 'Hi, this is Maria Santos. I\'m a client there. I lost my appointment card. When is my next chiropractor visit?'
  }),
  S(RC, {
    id: 'ft_rc_cousin', caseId: 'MC-01', level: 'Beginner', title: 'A "Cousin" Asks About the Settlement',
    caller: { name: 'Rosa', role: 'Says she is the client\'s cousin', gender: 'f', idName: 'WIRELESS CALLER', number: '(555) 010-7721' },
    you: you('receptionist answering the main line', 'MC-01'),
    facts: 'Wednesday afternoon, 09/23/2026. The main line rings.',
    goals: ['Greets professionally', 'Does not confirm or deny that the firm represents Maria Santos', 'Shares nothing about the case, settlement or amounts (only the client is authorized)', 'Stays polite under pressure: "I\'m not able to share any information, but I can take a message."', 'Takes her name and number and notes the call for Priya Natarajan (ext 311)'],
    hidden: 'You are Rosa, Maria Santos\'s cousin. You are warm but nosy. You want to know if Maria\'s case has settled and how much she\'s getting, "because the family is worried". Try three angles: "I\'m family, it\'s fine"; "Maria told me to call"; "Just tell me if it settled, yes or no". You are NOT on any authorization, and you don\'t know Maria\'s date of birth or address if asked. If the receptionist holds the line kindly and offers a message, you leave your number, (555) 010-7721, and hang up.',
    opening: 'Hi! I\'m calling about my cousin Maria Santos\'s case. Has it settled yet? How much is she getting?'
  }),
  S(RC, {
    id: 'ft_rc_check', caseId: 'MC-06', level: 'Intermediate', title: 'Is My Settlement Check Ready?',
    caller: { name: 'James Wilson', role: 'Client (MC-06)', gender: 'm', idName: 'WILSON JAMES', number: '(555) 010-4962' },
    you: you('receptionist answering the main line', 'MC-06'),
    facts: 'Monday morning, 09/28/2026. The main line rings.',
    goals: ['Verifies him before discussing anything', 'Opens the right James Wilson file (the settled truck crash, not his garage fall)', 'Explains the status accurately: waiting on one provider\'s written lien reduction; then he signs the final settlement statement; the check is ready about 3 business days after that', 'Promises no date', 'Says checks go only to the client with photo ID unless the attorney approves a signed written authorization (so Troy can\'t just pick it up)', 'Routes: message for Priya Natarajan (311), and Accounting (500) about the pickup question'],
    hidden: 'You are James Wilson. You need money for a car repair and want your settlement check this week. Give your name, DOB (September 17, 1983) and address (17 Birchwood Lane) when asked. If asked which case, it\'s the truck crash that settled. Push once: "Can\'t you just give me a date?" Then ask: "Can my buddy Troy pick up the check for me? I\'m working all week." Accept the answer if it\'s explained clearly. Your number is (555) 010-4962, best at lunchtime.',
    opening: 'Hey, it\'s James Wilson. My case settled last month. Is my check ready? I really need it this week.'
  }),
  S(RC, {
    id: 'ft_rc_mother', caseId: 'MC-10', level: 'Advanced', title: 'A Parent Who Isn\'t on the File',
    caller: { name: 'Angela Ruiz', role: 'The client\'s mother (not authorized)', gender: 'f', idName: 'RUIZ ANGELA', number: '(555) 010-5390' },
    you: you('receptionist answering the main line', 'MC-10'),
    facts: 'Thursday morning, 09/24/2026. The main line rings.',
    goals: ['Stays calm and respectful; doesn\'t argue about custody', 'Shares nothing, per the file: not even whether the firm represents Sofia', 'Doesn\'t confirm or deny any detail she mentions', 'Offers a message for Atty. Marcus Reyes (ext 201)', 'Logs the call on the case'],
    hidden: 'You are Angela Ruiz, Sofia Morales\'s mother. You and Frank are separated; he has primary custody. You heard from a neighbor that Frank hired lawyers after the dog bite and you are hurt nobody told you. You say "I\'m her mother, I have a right to know." You get emotional, then angry if the receptionist sounds robotic, and you calm down if they are kind and clear about what they can do. You give your number, (555) 010-5390, for a message to the attorney.',
    opening: 'Hi, I\'m Angela Ruiz. Sofia Morales is my daughter. I know you\'re handling her case, and I have a right to know what\'s happening.'
  }),
  S(RC, {
    id: 'ft_rc_offer', caseId: 'MC-04', level: 'Advanced', title: 'An Offer With a Deadline',
    caller: { name: 'Greg Hollis', role: 'Adjuster, Liberty Crest Insurance', gender: 'm', idName: 'LIBERTY CREST INS', number: '(555) 010-7788' },
    you: you('receptionist answering the main line', 'MC-04'),
    facts: 'Wednesday 09/30/2026, 3:40 PM. Atty. Reyes is in a deposition; Grace Kim is on another call.',
    unavailable: ['201', '313'],
    goals: ['Recognizes it as URGENT (an offer with a time limit)', 'Tries Atty. Reyes (201) or Grace Kim (313) live before taking a message', 'Takes a priority message with the exact amount ($65,000), the deadline (Friday at 5:00 PM), the claim number LC-25-99812 and his direct number', 'Doesn\'t react to the offer, accept it, or say it will go to the client', 'Reads the details back and logs a Note'],
    hidden: 'You are Greg Hollis, an experienced, brisk adjuster at Liberty Crest Insurance. Your offer on Robert Chen\'s claim (LC-25-99812) is $65,000, open until this Friday at 5:00 PM. Your direct line is (555) 010-7788. Try: "Just tell Bobby, he\'ll want it." and "Can you tell me if they\'ll take it?" If the receptionist handles it well, you give everything clearly and say you\'ll also email it.',
    opening: 'Greg Hollis, Liberty Crest. I have an offer on Chen: sixty-five thousand, and it\'s only open until Friday at five.'
  }),
  S(RC, {
    id: 'ft_rc_reporter', caseId: 'MC-14', level: 'Intermediate', title: 'A Reporter Wants Confirmation',
    caller: { name: 'Dana Pierce', role: 'Reporter, Channel 8 News', gender: 'f', idName: 'CHANNEL 8 NEWS', number: '(555) 010-8800' },
    you: you('receptionist answering the main line', 'MC-14'),
    facts: 'Friday, 09/25/2026. The main line rings.',
    goals: ['Says "We have no comment" and offers to take her name and number for the attorney', 'Confirms nothing: not the representation, the trial date or any detail', 'Stays friendly and doesn\'t get drawn into "off the record" talk', 'Takes a complete message for Atty. Elena Brooks (ext 202) and logs it'],
    hidden: 'You are Dana Pierce, a reporter at Channel 8 News, following up on the Redline Freight truck crash on I-75. You\'re friendly and persistent: ask if the firm represents Carlos Mendoza, when the trial is, and whether he\'s "doing OK". Try "just off the record" once. If they hold firm, give your number, (555) 010-8800, and your deadline (6 PM today).',
    opening: 'Hi, Dana Pierce, Channel 8 News. We\'re following up on the Redline Freight crash. Can you confirm your firm represents Carlos Mendoza, and when\'s the trial?'
  }),
  S(RC, {
    id: 'ft_rc_spanish', caseId: 'MC-08', level: 'Beginner', title: 'A Caller Who Speaks Spanish',
    caller: { name: 'Tomás Rivera', role: 'Client (MC-08), speaks Spanish', gender: 'm', idName: 'RIVERA TOMAS', number: '(555) 010-5188' },
    you: you('receptionist answering the main line', 'MC-08'),
    facts: 'Monday, 09/28/2026. Luis Ortega is in a client meeting until 2:00 PM.',
    unavailable: ['314'],
    goals: ['Stays patient and doesn\'t guess through the language barrier', 'Recognizes the client\'s name and tries to transfer to Luis Ortega (bilingual CM, ext 314)', 'With Luis unavailable: uses the interpreter line or takes a message with a callback number', 'Confirms the callback number clearly (repeating digits slowly)', 'Logs a Note for Luis'],
    hidden: 'You are Tomás Rivera. You speak Spanish and only a few words of English ("Luis", "my case", "yes", "number"). Speak Spanish, short and simple. You want to talk to Luis about your surgery date. If they say "Luis" and "call back", give your number slowly in Spanish and in digits: 555 010 5188. Say "gracias" and hang up when they confirm.',
    opening: 'Hola, buenos días. Llamo por mi caso… Tomás Rivera. ¿Está Luis?'
  }),
  /* ---------- Reception (new calls on the CMS cases) ---------- */
  N(RC, {
    id: 'ft_rc_threewilsons', caseId: 'MC-24', level: 'Advanced', title: 'Three James Wilson Files',
    caller: { name: 'Kevin Wilson', role: 'Son of the client (authorized on MC-24)', gender: 'm', idName: 'WILSON KEVIN', number: '(555) 010-6521' },
    you: you('receptionist answering the main line', 'MC-24'),
    facts: 'Monday, 09/28/2026. The main line rings.',
    goals: ['Asks who is calling and their relationship before sharing anything', 'Notices there are three James Wilson files and uses the DOB (04/02/1956) and the incident (hotel pool fall, 08/08/2026) to open the right one (MC-24)', 'Confirms Kevin is authorized on that file, and verifies with his dad\'s identifiers', 'Gives the right appointment: Motion Physical Therapy, Thursday 10/01/2026 at 11:00 AM', 'Logs a Note'],
    hidden: 'You are Kevin Wilson, calling for your dad, James Wilson. You are on his communication authorization. When asked, give your name, your dad\'s DOB (April 2, 1956) and his address (5 Quarry Road); you don\'t know his SSN. If asked about the accident: he fell at the Grandview Hotel pool on 08/08. You want to know when his next physical therapy is so you can drive him. If they give a wrong appointment (a chiropractor or an injection), you say: "That doesn\'t sound right, he only does physical therapy." Your number is (555) 010-6521.',
    opening: 'Hi, this is Kevin Wilson. I\'m calling for my dad, James Wilson. When is his next physical therapy?'
  }),
  N(RC, {
    id: 'ft_rc_newfirm', caseId: 'MC-16', level: 'Advanced', title: 'Another Firm Wants the File',
    caller: { name: 'Megan Cho', role: 'Paralegal, office of Atty. Sarah Klein (another firm)', gender: 'f', idName: 'KLEIN LAW', number: '(555) 010-8230' },
    you: you('receptionist answering the main line', 'MC-16'),
    facts: 'Monday, 09/28/2026, 10:05 AM. Atty. Reyes is in a meeting until 11:30 AM.',
    unavailable: ['201'],
    goals: ['Polite and neutral; doesn\'t argue, defend the firm or discuss the client', 'Confirms nothing about the client or the case and releases nothing on a phone call', 'Asks for the request in writing (the signed client authorization / substitution of counsel)', 'Routes to Atty. Reyes (ext 201) per the 09/24 file note: tries him live, then a priority message', 'Takes a complete message (name, firm, number, email, what they need) and logs a Note'],
    hidden: 'You are Megan Cho, a paralegal in the office of Atty. Sarah Klein, another personal-injury firm. You\'re calling to say your firm now represents Hannah Pierce and you need her complete file sent today. You\'re confident and a bit pushy: "It\'s a simple request, can you just email it over?" and "Can you at least confirm she\'s your client?" If asked, you can email the signed substitution of counsel; you\'d rather they just send the file. Your number is (555) 010-8230, email mcho@kleinlaw.example.',
    opening: 'Hi, this is Megan with Attorney Sarah Klein\'s office. We now represent Hannah Pierce, and we need her complete file sent over today.'
  }),
  N(RC, {
    id: 'ft_rc_bodyshop', caseId: 'MC-12', level: 'Beginner', title: 'The Body Shop Wants Its Storage Paid',
    caller: { name: 'Rick Dawson', role: 'Office manager, Parkway Collision', gender: 'm', idName: 'PARKWAY COLLISION', number: '(555) 010-6610' },
    you: you('receptionist answering the main line', 'MC-12'),
    facts: 'Monday, 09/28/2026. The main line rings.',
    goals: ['Greets professionally and gets the caller\'s name, business and number', 'Treats it as a business caller: shares nothing about the client', 'Doesn\'t promise who will pay the storage or when the car will be moved', 'Recognizes the urgency (storage adds up daily) and routes to Kevin Lam, Property Damage (ext 351), live or as a priority message', 'Logs a Note on the case with the amount and start date'],
    hidden: 'You are Rick Dawson, the office manager at Parkway Collision, a body shop. Mr. William Harris\'s 2017 Buick LaCrosse has been in your lot since 09/14. Storage is $45 a day starting 09/21 and it\'s already over $300. You want to know who is paying and when the car is getting picked up. You are gruff but not rude: "I\'m not running a parking lot here." If they route you to the right person with a clear next step, you calm down. Your number is (555) 010-6610.',
    opening: 'Yeah, this is Rick at Parkway Collision. I\'ve got a Buick here for a William Harris, been sitting a week at forty-five bucks a day. Who\'s paying for this?'
  }),
  N(RC, {
    id: 'ft_rc_hr', caseId: 'MC-36', level: 'Beginner', title: 'The Client\'s Employer Calls',
    caller: { name: 'Janet Sloane', role: 'HR manager, Riverton Medical Supply (not authorized)', gender: 'f', idName: 'RIVERTON MED SUPPLY', number: '(555) 010-7310' },
    you: you('receptionist answering the main line', 'MC-36'),
    facts: 'Tuesday, 09/29/2026. The main line rings.',
    goals: ['Greets professionally', 'Doesn\'t confirm that Walter Grant is a client (his employer isn\'t authorized on the file)', 'Answers no questions about his injuries, his return to work or whether it was work-related', 'Suggests they speak with Walter directly and offers to take a message', 'Logs a Note on the case'],
    hidden: 'You are Janet Sloane, HR manager at Riverton Medical Supply. Walter Grant, a sales rep, was hit by a van a week ago and hasn\'t been at work. His wife mentioned he "got a lawyer". You need to know when he can come back and whether the accident happened while he was working, for your paperwork. You\'re friendly and matter-of-fact: "I\'m just trying to help him with his leave." Try: "Can you at least tell me if you represent him?" Your number is (555) 010-7310.',
    opening: 'Hi, this is Janet in HR at Riverton Medical Supply. I\'m calling about our employee Walter Grant. Can you tell me when he\'ll be able to come back to work?'
  }),
  N(RC, {
    id: 'ft_rc_city', caseId: 'MC-19', level: 'Intermediate', title: 'The City Wants a Recorded Statement',
    caller: { name: 'Deborah Kline', role: 'Adjuster, City of Riverton Risk Management', gender: 'f', idName: 'CITY OF RIVERTON', number: '(555) 010-7999' },
    you: you('receptionist answering the main line', 'MC-19'),
    facts: 'Wednesday, 09/30/2026. The main line rings.',
    goals: ['Professional greeting; handles her as a business caller', 'Agrees to nothing: no recorded statement, no scheduling, no facts confirmed', 'Routes to Atty. Marcus Reyes (ext 201) per the 08/14 file note', 'Takes a complete message with her claim number (RM-26-0415), direct number and what she wants', 'Logs a Note'],
    hidden: 'You are Deborah Kline, claims adjuster at City of Riverton Risk Management. You received the notice of claim for Samuel Boateng (your claim RM-26-0415). You want his recorded statement next week, and you\'d like to "just set up a time" with whoever answers. You\'re courteous and bureaucratic. Try: "It\'s standard procedure, it\'ll only take twenty minutes. Can we put him down for Tuesday at ten?" and "Can you confirm he was in the crosswalk?" Your direct line is (555) 010-7999.',
    opening: 'Good morning, Deborah Kline with City of Riverton Risk Management. I\'m calling about the notice of claim for Samuel Boateng. I\'d like to schedule his recorded statement for next week.'
  }),
  /* ---------- Calendar (the Foundational call pack) ---------- */
  S(CAL, {
    id: 'ft_cal_depo', caseId: 'MC-05', level: 'Intermediate', title: 'Defense Counsel Wants to Move a Deposition',
    caller: { name: 'Karen Holt', role: 'Assistant to Richard Voss, Voss & Tate LLP (defense counsel)', gender: 'f', idName: 'VOSS & TATE LLP', number: '(555) 010-7991' },
    you: you('front desk and calendar assistant', 'MC-05'),
    facts: 'Friday, 09/25/2026, 11:15 AM. Janelle Price and Atty. Brooks are both in a mediation until 1:00 PM.',
    unavailable: ['221', '202'],
    goals: ['Doesn\'t agree to, or say they\'ll accept, a new deposition date', 'Knows the deposition is Tuesday 10/06/2026 at 10:00 AM, less than two weeks away, so it\'s a priority', 'Tries to transfer to Janelle Price (221) or Atty. Brooks (202); then takes a priority message', 'Gets the proposed date (10/13), the reason, and her direct number and email', 'Logs a Note and flags the calendar item for the paralegal'],
    hidden: 'You are Karen Holt, legal assistant to Richard Voss at Voss & Tate LLP, defense counsel in Garcia v. Pine Ridge Property Management. Mr. Voss has a trial that got moved and can\'t do Ms. Garcia\'s deposition on the 6th. You want to move it to Tuesday 10/13 at 10:00 AM. You push: "It\'s just a scheduling thing, can you pencil it in?" You accept a callback today. Your direct line is (555) 010-7991, email kholt@vosstate.example.',
    opening: 'Hi, this is Karen from Richard Voss\'s office at Voss & Tate. We need to move Ms. Garcia\'s deposition on the 6th. Can we do the 13th instead?'
  }),
  S(CAL, {
    id: 'ft_cal_prep', caseId: 'MC-05', level: 'Beginner', title: 'What Time Is My Mom\'s Prep Meeting?',
    caller: { name: 'Marco Garcia', role: 'Client\'s son (authorized)', gender: 'm', idName: 'GARCIA MARCO', number: '(555) 010-4858' },
    you: you('front desk and calendar assistant', 'MC-05'),
    facts: 'Monday, 09/28/2026. The main line rings.',
    goals: ['Verifies that he is Marco and that he is authorized (and checks the client\'s identifiers)', 'Gives the prep meeting correctly: Friday 10/02/2026 at 2:00 PM with Atty. Brooks at the firm\'s office', 'Distinguishes it from the deposition itself: Tuesday 10/06/2026 at 10:00 AM at defense counsel\'s office', 'Reads both back with day, date, time and place', 'Logs a Note'],
    hidden: 'You are Marco Garcia, Linda Garcia\'s son. You drive your mom to appointments. You are on the communication authorization. When asked to verify, give your name, your mom\'s name and DOB (May 9, 1961) and her address (2200 Pine Ridge Blvd, Unit 14). Ask what time you need to bring her in "on the 2nd", then ask "and the actual deposition is where again?" Confirm and thank them.',
    opening: 'Hi, this is Marco Garcia, Linda Garcia\'s son. What time do I need to bring my mom in on the 2nd?'
  }),
  S(CAL, {
    id: 'ft_cal_surgery', caseId: 'MC-08', level: 'Intermediate', title: 'Surgery Day, and a Call With the Case Manager',
    caller: { name: 'Daniela Rivera', role: 'Client\'s daughter (authorized)', gender: 'f', idName: 'RIVERA DANIELA', number: '(555) 010-5189' },
    you: you('front desk and calendar assistant', 'MC-08'),
    facts: 'Tuesday, 09/29/2026. Luis Ortega\'s open times on Thursday 10/15/2026 (Eastern): 10:00 AM, 1:30 PM, 4:00 PM (each 20 minutes).',
    goals: ['Verifies Daniela and that she is authorized', 'Gives the surgery correctly: Wednesday 10/14/2026, Northside Surgery Center, arrive 7:00 AM; pre-op labs 10/07; suggests confirming with the surgeon\'s office', 'Books the post-surgery call with Luis Ortega from his real open times on Thursday 10/15 (no invented times)', 'Confirms the time zone, the number to call, and that the call will be in Spanish', 'Reads the booking back and logs the calendar entry and a Note for Luis'],
    hidden: 'You are Daniela Rivera, Tomás Rivera\'s daughter. You are authorized on his file. Verify with your name, your dad\'s DOB (April 18, 1964) and address (905 Mission Road). Ask when his surgery is and what time to be there. Then say Luis wanted to call your dad after the surgery: you\'d like the afternoon of the 15th, but not before 1 PM because of the hospital. Your dad will be home; call his number, (555) 010-5188, and the call should be in Spanish. Confirm what they offer.',
    opening: 'Hi, I\'m Daniela Rivera, Tomás Rivera\'s daughter. When is my dad\'s surgery, and what time do we need to be there?'
  }),
  S(CAL, {
    id: 'ft_cal_checkin', caseId: 'MC-01', level: 'Intermediate', title: 'Reschedule My Check-in Call',
    caller: { name: 'Maria Santos', role: 'Client (MC-01)', gender: 'f', idName: 'SANTOS MARIA', number: '(555) 010-4417' },
    you: you('front desk and calendar assistant', 'MC-01'),
    facts: 'Thursday, 10/15/2026. Priya Natarajan\'s check-in slots (Eastern, 15 minutes): Tuesday 10/20 at 9:00 AM (currently Maria\'s) · Tuesday 10/20 at 1:30 PM · Wednesday 10/21 at 11:00 AM · Thursday 10/22 at 3:00 PM.',
    goals: ['Verifies her before touching the appointment', 'Finds her current check-in (Tuesday 10/20 with Priya)', 'Offers only Priya\'s real open slots and checks them against her physical therapy (Thursdays at 4:00 PM)', 'Confirms the new day, date, time, time zone and the number Priya will call', 'Reads it back, updates the calendar and logs a Note for Priya (311)'],
    hidden: 'You are Maria Santos. You started a new work schedule and can\'t take calls on Tuesday mornings any more. You want to move your 10/20 check-in call with Priya. Verify with your name, DOB (March 22, 1988) and address (1187 Willow Bend Drive). You prefer late morning or early afternoon; Wednesday 11 AM is perfect. Priya should call your cell, (555) 010-4417. If they offer Thursday at 3 PM, say you have PT at 4 and would rather not.',
    opening: 'Hi, it\'s Maria Santos. I have a check-in call with Priya next Tuesday morning, but I can\'t do mornings anymore. Can we move it?'
  }),
  /* ---------- Intake (the Foundational call pack) ---------- */
  S(IN, {
    id: 'ft_in_derek', caseId: 'MC-02', hideCases: ['MC-02'], reference: 'MC-02', level: 'Intermediate', title: 'New Intake: A Grocery-Store Fall',
    caller: { name: 'Derek Thompson', role: 'Potential client (first call)', gender: 'm', idName: 'WIRELESS CALLER', number: '(555) 010-4520' },
    you: youIntake,
    facts: 'Friday, 09/18/2026. A new caller on the intake line. Intake Attorney: Atty. David Okafor (ext 203).',
    goals: ['Warm opening; lets him tell it, then guides one question at a time', 'Collects his full name, DOB, phone, email and address', 'Captures the incident: 09/12/2026, about 6:15 PM, FreshWay Market (Route 9), aisle 7, spilled detergent, no warning cone', 'Captures injuries and treatment (right wrist fracture in a cast, hip bruising; St. Mary\'s, Riverton Orthopedic)', 'Gets the other parties for the conflict check (FreshWay, manager Alan Pruitt) and the evidence (incident report, his photos, two witnesses)', 'Gives no advice or value; sets the next step (attorney review, retainer by e-sign)'],
    hidden: 'You are Derek Thompson (DOB November 5, 1975), a warehouse supervisor. Phone (555) 010-4520, email d.thompson@example.com, address 52 Harbor View Rd, Apt 3B, Riverton. On Saturday 09/12 at about 6:15 PM you slipped on spilled liquid detergent in aisle 7 at the FreshWay Market on Route 9. There was no warning cone. You broke your right wrist (in a cast) and bruised your hip. You went to St. Mary\'s Hospital that night and now see Riverton Orthopedic. The store manager, Alan Pruitt, wrote an incident report. You took photos of the spill. Two other shoppers gave their names to the store. You\'re worried about missing work. Ask twice: "So do I have a case?" and "What\'s something like this worth?" Share details only when asked.',
    opening: 'Hi, um, I slipped and fell at the grocery store last weekend and broke my wrist. A friend said I should call a lawyer. Is this the right place?'
  }),
  S(IN, {
    id: 'ft_in_nicole', caseId: 'MC-13', hideCases: ['MC-13'], reference: 'MC-13', level: 'Advanced', title: 'New Intake With a Deadline Close',
    caller: { name: 'Nicole Adams', role: 'Potential client (first call)', gender: 'f', idName: 'ADAMS NICOLE', number: '(555) 010-5634' },
    you: youIntake,
    facts: 'Thursday, 09/24/2026. A new caller on the intake line. Intake Attorney: Atty. David Okafor (ext 203); Intake Team ext 100.',
    goals: ['Collects her contact details and DOB', 'Captures the incident: 10/20/2024 at HomeMax (Route 12), boxed patio heaters fell from a top shelf onto her shoulder and head', 'Captures injuries and treatment (rotator cuff strain, concussion symptoms; Riverton Orthopedic) and the insurer contact (National Claims Services, Pam Ortiz)', 'Spots that the incident is almost 2 years ago and treats it as URGENT, without answering "is it too late?"', 'Routes now: transfer to Atty. Okafor (203) or Intake (100), or a priority message with her best number', 'Gives no advice; doesn\'t repeat the adjuster\'s "plenty of time"'],
    hidden: 'You are Nicole Adams (DOB March 3, 1984), a bank teller. Phone (555) 010-5634, email nicole.adams@example.com, address 1520 Lakeshore Blvd, Riverton. On October 20, 2024, boxed patio heaters fell from a top shelf at the HomeMax on Route 12 onto your shoulder and head. You have a rotator cuff strain and had concussion symptoms; you saw Riverton Orthopedic. For a year you dealt with the store\'s insurer yourself, National Claims Services (adjuster Pam Ortiz), and it stalled. Pam told you "there\'s plenty of time". Ask: "Is it too late for me to sue?" and "The adjuster says I have plenty of time, right?" Share details only when asked. You\'re available by phone all day.',
    opening: 'Hi. I got hurt at a HomeMax a while ago, and I\'ve been dealing with their insurance myself, but it\'s going nowhere. Is it too late for me to do something about it?'
  }),
  S(IN, {
    id: 'ft_in_retainer', caseId: 'MC-02', level: 'Intermediate', title: 'Did You Take My Case? (and the Store Called)',
    caller: { name: 'Derek Thompson', role: 'Potential client (MC-02), retainer unsigned', gender: 'm', idName: 'WIRELESS CALLER', number: '(555) 010-4520' },
    you: 'You are the intake specialist at LSH Training Law Group (fictional). Derek Thompson (MC-02) is calling back: look his case up in 🔎 Case lookup (or open it in the CMS Training Library).',
    facts: 'Friday, 09/25/2026, 10:20 AM. Atty. Okafor is at his desk.',
    goals: ['Verifies him first', 'Explains accurately: the attorney accepted the case pending his signature; the retainer sent by e-sign on 09/21 is still unsigned; offers to resend the link', 'Doesn\'t say he "has a case" or what it\'s worth', 'Treats "the store manager wants me to come in and sign something" as URGENT: transfers to Atty. Okafor (203) now', 'May repeat the file note (the attorney asked him not to talk to the store or its insurer), with no other advice', 'Logs the call in the intake note'],
    hidden: 'You are Derek Thompson (DOB November 5, 1975, 52 Harbor View Rd, Apt 3B). You haven\'t signed anything because the email went to spam. Ask: "Did you guys take my case? Who\'s my lawyer?" Then mention: "Oh, and the store manager, Alan, called me yesterday. He wants me to come in and sign something so they can \'take care of my bills\'. Should I go?" You\'ll wait to be transferred if asked.',
    opening: 'Hey, it\'s Derek Thompson. I called last week about my fall at FreshWay. Did you guys take my case? Who\'s my lawyer?'
  }),
  /* ---------- Intake (new first calls on the CMS cases) ---------- */
  N(IN, {
    id: 'ft_in_william', caseId: 'MC-12', hideCases: ['MC-12'], reference: 'MC-12', level: 'Beginner', title: 'New Intake: Hit While Loading Groceries',
    caller: { name: 'William Harris', role: 'Potential client (first call), retired', gender: 'm', idName: 'HARRIS WILLIAM', number: '(555) 010-5520' },
    you: youIntake,
    facts: 'Tuesday, 09/15/2026. A new caller on the intake line. Intake Attorney: Atty. David Okafor (ext 203); Property Damage: Kevin Lam (ext 351).',
    goals: ['Patient and clear with an older caller; repeats and confirms details', 'Collects contact details and DOB', 'Captures the incident: 09/14/2026, parked at Colonial Plaza loading groceries; a driver backing out (Stacy Owens) hit his car and clipped him; police report pending', 'Captures injuries and treatment: hip and hand bruising; QuickCare Urgent Care 09/15', 'Gets the other driver\'s insurance (Keystone Mutual, policy KM-5520881) and his health plan (Medicare Advantage, Humana Gold Plus)', 'Captures the property damage (2017 Buick LaCrosse towed to Parkway Collision; storage from 09/21) as time-sensitive; promises no rental car', 'Gives no advice; sets the next step (attorney review; property damage to Kevin Lam)'],
    hidden: 'You are William Harris (DOB August 8, 1958), a retired postal carrier. Phone (555) 010-5520, email will.harris@example.com, address 3 Colonial Drive, Riverton. Yesterday, Monday 09/14, about 11 AM, you were loading groceries into your parked car at the Colonial Plaza lot when a woman backing out of the next space, Stacy Owens, hit your car and clipped you. You bruised your hip and your hand. You went to QuickCare Urgent Care this morning. The police came; the officer said the report would take a few days. The other driver\'s insurance is Keystone Mutual; you have a paper with her policy number, KM-5520881. Your car, a 2017 Buick LaCrosse, was towed to Parkway Collision, and they told you storage costs $45 a day starting 09/21. Your health insurance is Medicare Advantage, Humana Gold Plus. You are polite and a bit hard of hearing: ask them to repeat something once or twice. Ask: "When do I get a rental car? I can\'t get to my appointments." Share details only when asked.',
    opening: 'Hello? Yes, good morning. A lady backed into my car yesterday while I was putting my groceries in, and she clipped me too. My daughter said to call a lawyer.'
  }),
  N(IN, {
    id: 'ft_in_walter', caseId: 'MC-36', hideCases: ['MC-36'], reference: 'MC-36', level: 'Beginner', title: 'New Intake: Hit in a Crosswalk',
    caller: { name: 'Walter Grant', role: 'Potential client (first call)', gender: 'm', idName: 'GRANT WALTER', number: '(555) 010-6740' },
    you: youIntake,
    facts: 'Friday, 09/25/2026. A new caller on the intake line. Intake Attorney: Atty. David Okafor (ext 203).',
    goals: ['Warm, patient opening; acknowledges he just got out of the hospital', 'Collects full name, DOB, phone, email and address', 'Captures the incident: 09/22/2026, Harbor Street crosswalk with the walk signal, FreshCart delivery van turning right; driver Leon Fry cited; police report RPD-26-092219', 'Captures injuries and treatment: broken left leg (tibia), head laceration with 8 stitches; St. Mary\'s 09/22–09/24; orthopedic visit Thursday 10/01 at 10:00 AM', 'Gets the other parties for the conflict check (FreshCart Delivery, Leon Fry) and his health plan (Blue Horizon PPO)', 'Gives no advice about work or lost wages, and doesn\'t agree to talk to his employer', 'Sets the next step (attorney review, retainer by e-sign, intake packet)'],
    hidden: 'You are Walter Grant (DOB June 30, 1968), a sales rep at Riverton Medical Supply. Phone (555) 010-6740, email walter.grant@example.com, address 504 Riverbend Parkway, Riverton. On Tuesday 09/22 around 8:15 AM you were crossing Harbor Street in the crosswalk with the walk signal when a FreshCart grocery delivery van turned right and hit you. The police came (Officer Hale); the van driver, Leon Fry, got a ticket. You have the report number on a card: RPD-26-092219. You broke your left leg (tibia) and needed 8 stitches in your head. You were at St. Mary\'s Hospital until yesterday (09/24). You see an orthopedic surgeon at Riverton Orthopedic on Thursday 10/01 at 10 AM to decide about surgery. Your health insurance is Blue Horizon PPO through work. You\'re tired and a little groggy from pain medicine, so now and then you lose your train of thought. Ask: "Will they pay my salary while I\'m out?" and "My boss wants to know when I\'m coming back. Can you guys talk to him?" Share details only when asked.',
    opening: 'Hi… yeah, I got hit by a delivery van in a crosswalk on Tuesday. I just got home from the hospital. My wife said I should call you.'
  }),
  N(IN, {
    id: 'ft_in_marcus', caseId: 'MC-28', hideCases: ['MC-28'], reference: 'MC-28', level: 'Intermediate', title: 'New Intake: The Scooter\'s Brakes Failed',
    caller: { name: 'Marcus Lee', role: 'Potential client (first call)', gender: 'm', idName: 'WIRELESS CALLER', number: '(555) 010-6660' },
    you: youIntake,
    facts: 'Tuesday, 09/08/2026. A new caller on the intake line. Intake Attorney: Atty. David Okafor (ext 203).',
    goals: ['Warm opening; keeps a talkative caller on track, one question at a time', 'Collects contact details and DOB', 'Captures the incident: 09/05/2026, rented ZipRide e-scooter, front brake failed going down the Market Street hill, crash at Market and 3rd; police report RPD-26-090517', 'Captures injuries and treatment (broken collarbone, road rash; St. Mary\'s ER 09/05) and that he has no health insurance', 'Captures the evidence (ride receipt ZR-8841-2207, his photos of the brake lever, the crash video) and flags that ZipRide has the scooter, which is evidence', 'Gives no advice about posting the video or answering ZipRide; routes the evidence concern to the attorney and sets the next step'],
    hidden: 'You are Marcus Lee (DOB May 19, 2000), a barista at Riverton Coffee Roasters. Phone (555) 010-6660, email marcus.lee@example.com, address 77 Canal Street, Apt 5C, Riverton. On Saturday 09/05 you rented a ZipRide e-scooter downtown. Going down the Market Street hill the front brake lever went slack and you crashed at Market and 3rd. Police came: report RPD-26-090517. You broke your right collarbone and have road rash on your arm and hip; you went to St. Mary\'s ER that day and got a sling. You have NO health insurance and you\'re worried about the bill. You kept the ride receipt (ride ID ZR-8841-2207), took photos of the brake lever, and a friend filmed the crash. ZipRide picked the scooter up from the scene. You\'re chatty and energetic and go off on tangents. Ask: "Can I post my crash video on TikTok? People need to know these things are dangerous." and "ZipRide emailed me asking what happened. Should I answer them?" Share details only when asked.',
    opening: 'Hey! So, I crashed one of those rental scooters on Saturday because the brakes just, like, stopped working, and I broke my collarbone. Can you guys help with that?'
  }),
  N(IN, {
    id: 'ft_in_samuel', caseId: 'MC-19', hideCases: ['MC-19'], reference: 'MC-19', level: 'Advanced', title: 'New Intake: Hit by a City Bus',
    caller: { name: 'Samuel Boateng', role: 'Potential client (first call)', gender: 'm', idName: 'BOATENG SAMUEL', number: '(555) 010-6295' },
    you: youIntake,
    facts: 'Thursday, 07/09/2026. A new caller on the intake line. Intake Attorney: Atty. David Okafor (ext 203); Intake Team ext 100.',
    goals: ['Collects contact details and DOB', 'Captures the incident: 06/30/2026, marked crosswalk at Station Road and 5th, Riverton Transit bus (Route 4) turning right; police report RPD-26-063077', 'Captures injuries and treatment: fractured pelvis; St. Mary\'s 06/30–07/06; walker and home PT', 'Identifies the other party as a government entity (City of Riverton / Riverton Transit) and flags the claim as time-sensitive for the attorney, without answering "how long do I have?"', 'Treats the City\'s request for a recorded statement on Monday as URGENT: gives no advice on it and routes to the attorney now (transfer or priority message)', 'Notes for the attorney that he works for a city utility (Riverton Water Utility, City Employees Health)', 'Sets a clear next step (attorney review; retainer)'],
    hidden: 'You are Samuel Boateng (DOB February 14, 1970), a meter technician for Riverton Water Utility. Phone (555) 010-6295, email sam.boateng@example.com, address 301 Station Road, Riverton. On June 30 you were walking in the marked crosswalk at Station Road and 5th when a Riverton Transit city bus, Route 4, turned right and hit you. Police report RPD-26-063077 (Officer Fisher). You fractured your pelvis and were at St. Mary\'s Hospital from 06/30 to 07/06. Now you use a walker and have home physical therapy. Your health insurance is City Employees Health, since the water utility is part of the city, and that worries you: "I work for the city too, is that a problem?" Yesterday a woman named Deborah Kline from the City\'s Risk Management office called and wants your recorded statement on Monday. Ask: "Should I give her the statement?" and "My neighbor said you only have a few months to file against the city. How long do I have?" You are calm, polite and precise. Share details only when asked.',
    opening: 'Good morning. I was hit by a city bus about a week ago, and now someone from the city wants me to give a statement. I think I need a lawyer.'
  }),
  N(IN, {
    id: 'ft_in_kevin', caseId: 'MC-24', hideCases: ['MC-24'], reference: 'MC-24', level: 'Advanced', title: 'New Intake: A Son Calls for His Father',
    caller: { name: 'Kevin Wilson', role: 'Son of the injured person (first call)', gender: 'm', idName: 'WILSON KEVIN', number: '(555) 010-6521' },
    you: youIntake,
    facts: 'Friday, 08/14/2026. A new caller on the intake line. Intake Attorney: Atty. David Okafor (ext 203).',
    goals: ['Learns early that he is calling for someone else and notes his name, relationship and number', 'Collects the injured person\'s details: James Wilson, DOB 04/02/1956, 5 Quarry Road, home phone', 'Captures the incident: 08/08/2026, about 4:40 PM, algae-slick tiles at the edge of the pool, Grandview Hotel (Lakeshore Blvd); the night manager\'s incident report', 'Captures injuries and treatment: fractured right hip, partial hip replacement 08/09 at St. Mary\'s, now inpatient rehab at Riverton Rehabilitation Center; Medicare', 'Gets the other parties and evidence (Grandview Hotel, Kevin\'s photos of the tiles, the insurer that called: Allied Retail Casualty)', 'Explains that his father (or a legal representative) must sign the retainer himself and sets the next step for signing at the rehab center; promises nothing about the case'],
    hidden: 'You are Kevin Wilson, calling about your father, James Wilson (DOB April 2, 1956), a retired bus mechanic. Your number is (555) 010-6521; your dad\'s home number is (555) 010-6520 and he has no email. His address is 5 Quarry Road, Riverton. On Saturday 08/08, around 4:40 PM, your dad slipped on slimy, algae-covered tiles at the edge of the pool at the Grandview Hotel on Lakeshore Blvd while visiting his grandkids. He broke his right hip and had a partial hip replacement at St. Mary\'s Hospital the next day. He\'s now in inpatient rehab at Riverton Rehabilitation Center. You took photos of the tiles that same day. The night manager, Alicia Grant, wrote an incident report. The hotel says the deck was cleaned that morning. Your dad is on Medicare. A man from the hotel\'s insurance, Allied Retail Casualty, called your dad at the rehab center. You don\'t have power of attorney; your dad is sharp and can sign things, but he can\'t come to the office. Ask: "Can I just sign the paperwork for him?" and "Is this going to be worth it? He\'s going to need a lot of help." You\'re protective and a bit anxious. Share details only when asked.',
    opening: 'Hi, I\'m calling for my dad. He broke his hip falling at a hotel pool last weekend and he\'s in rehab now. I want to find out if you can help him.'
  })
];

export const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

// The line a call rings on: intake calls ring the intake line, everything else the main line.
export const lineOf = (track) => (track === 'intake' ? 'intake' : 'main');
export const LINES = {
  main: { label: 'Main Line', number: FIRM.mainLine, icon: '☎' },
  intake: { label: 'Intake Line', number: FIRM.intakeLine, icon: '📋' }
};

// What a trainee may see of a scenario before and during a call (no persona, no goals).
export function traineeView(s) {
  return {
    id: s.id, track: s.track, level: s.level, title: s.title, facts: s.facts, you: s.you,
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
    custom: true, source: 'Written by a trainer', track, level: LEVELS.includes(o.level) ? o.level : 'Intermediate',
    title: str(o.title, 120) || 'Untitled call', caseId: caseId || null,
    hideCases: list(o.hideCases, 10).filter((x) => CASES[x]), reference: CASES[o.reference] ? o.reference : null,
    caller: { name: str(c.name, 80) || 'Caller', role: str(c.role, 120), gender: c.gender === 'm' ? 'm' : 'f', idName: str(c.idName, 24).toUpperCase() || 'WIRELESS CALLER', number: str(c.number, 30) || '(555) 010-0000' },
    you: str(o.you, 600) || (track === 'intake' ? youIntake : 'You are the receptionist answering the main line at LSH Training Law Group (fictional).'),
    facts: str(o.facts, 600), goals: list(o.goals, 300), hidden: str(o.hidden, 4000), opening: str(o.opening, 600),
    unavailable: list(o.unavailable, 10).filter((x) => FIRM.directory.some((d) => d.ext === x)),
    ai: o.ai !== false
  };
}
