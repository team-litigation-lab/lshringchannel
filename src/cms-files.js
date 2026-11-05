/* 🔎 The CMS's Training Library files (CaseManagementTraining/mock-cases.js, mirrored to src/cms/mock-cases.js by
   scripts/sync-cms-calls.mjs) as the case files of Case lookup: one file per MC-xx, said the way the front desk reads
   a file (who the client is, how to verify, who is authorized, who handles it, where it stands, the notes and tasks).

   Left out on purpose: the file's `reception` block (the Training Library's answer key: who calls and how to handle
   them) and its `summary` (the trainer's one-line pitch for the file), so Case lookup shows the file, not the drill. */

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const has = (s) => !!clean(s) && clean(s) !== '—';
const join = (parts, sep = ' · ') => parts.filter(has).map(clean).join(sep);
const ssn4 = (s) => { const m = /(\d{4})\s*$/.exec(String(s || '')); return m ? m[1] : ''; };

/* One Training Library file → { id, name, title, text } (the shape src/scenarios.js keeps in CASES).
   `extOf(name)` gives a staff member's extension from the firm directory, '' when they aren't in it. */
export function cmsFile(mc, extOf = () => '') {
  const cl = mc.client || {};
  const who = (n) => { const e = has(n) ? extOf(clean(n)) : ''; return has(n) ? clean(n) + (e ? ` (${e})` : '') : ''; };
  const rows = [];
  const potential = /intake|potential|lead/i.test(mc.phase || '');
  rows.push(`${potential ? 'Potential client' : 'Client'}: ` + join([cl.name, has(cl.dob) && `DOB ${clean(cl.dob)}`, cl.address,
    ssn4(cl.ssn) && `SSN last 4: ${ssn4(cl.ssn)}`, cl.phone, cl.email]));
  rows.push('Case # ' + join([mc.caseNumber, mc.caseType === 'Other' && mc.caseTypeOther ? mc.caseTypeOther : mc.caseType,
    has(mc.dateOfLoss) && `Date of loss ${clean(mc.dateOfLoss)}`, has(mc.sol) && `SOL ${clean(mc.sol)}`]));
  rows.push(join([has(mc.attorney) && `Attorney: ${who(mc.attorney)}`, has(mc.caseManager) && `Case Manager: ${who(mc.caseManager)}`, has(mc.phase) && `Phase: ${clean(mc.phase)}`]));
  const em = cl.emergency || {};
  if (has(em.name)) rows.push('Emergency contact: ' + join([em.name, em.relationship, em.phone]) + '');
  if (cl.employment && has(cl.employment.status)) rows.push('Employment: ' + join([cl.employment.status, cl.employment.title, cl.employment.employer]));
  [].concat(mc.critical || []).forEach((x) => has(x) && rows.push('⚠ ' + clean(x)));
  if (has(mc.narrative)) rows.push('What happened: ' + clean(mc.narrative));
  const inj = mc.injury || {};
  if (has(inj.primary)) rows.push('Injury: ' + join([inj.primary, inj.parts, inj.surgery && `surgery ${clean(inj.surgery)}`, inj.details], '; '));
  const po = mc.police || {};
  if (has(po.number) || has(po.agency)) rows.push('Police: ' + join([po.agency, po.number, po.officer]));
  const he = mc.health || {};
  if (has(he.carrier)) rows.push('Health insurance: ' + join([he.carrier, has(he.memberId) && `member ${clean(he.memberId)}`]));
  (mc.bi || []).forEach((b) => rows.push('Bodily injury (3P): ' + join([b.carrier, has(b.holder) && `insured ${clean(b.holder)}`, has(b.claim) && `claim ${clean(b.claim)}`,
    has(b.adjuster) && `adjuster ${clean(b.adjuster)}`, b.contact, has(b.limits) && `limits ${clean(b.limits)}`])));
  (mc.pipum || []).forEach((b) => rows.push(`${clean(b.type) || 'PIP / UM'} (1P): ` + join([b.carrier, has(b.claim) && `claim ${clean(b.claim)}`, has(b.adjuster) && `adjuster ${clean(b.adjuster)}`, b.contact, has(b.limits) && `limits ${clean(b.limits)}`])));
  (mc.liens || []).forEach((l) => rows.push('Lien: ' + join([l.type, l.entity, l.amount, l.status])));
  (mc.facilities || []).forEach((f) => rows.push('Treatment: ' + join([f.name, f.specialty, f.phone, f.dates, f.status])));
  (mc.chrono || []).filter((c) => has(c.next)).forEach((c) => rows.push('Next appointment: ' + join([c.facility, c.next])));
  if (has(mc.treatmentNotes)) rows.push('Treatment notes: ' + clean(mc.treatmentNotes));
  const pdc = mc.pd && mc.pd.client;
  if (pdc && has(pdc.make)) rows.push('Vehicle: ' + join([[pdc.year, pdc.make, pdc.model].filter(has).join(' '), has(pdc.plate) && `plate ${clean(pdc.plate)}`]));
  const pc = mc.pdClaim;
  if (pc && has(pc.carrier)) rows.push('Property damage claim: ' + join([pc.carrier, has(pc.claim) && `claim ${clean(pc.claim)}`, has(pc.adjuster) && `adjuster ${clean(pc.adjuster)}`, pc.phone, has(pc.liability) && `liability ${clean(pc.liability)}`, has(pc.rental) && `rental ${clean(pc.rental)}`]));
  const lit = mc.lit;
  if (lit) {
    rows.push('Litigation: ' + join([has(lit.filed) && `filed ${clean(lit.filed)}`, has(lit.cutoff) && `discovery cutoff ${clean(lit.cutoff)}`, has(lit.trial) && `trial ${clean(lit.trial)}`]));
    (lit.rows || []).forEach((r) => rows.push('  ' + join([r.type, r.party, has(r.due) && `due ${clean(r.due)}`, r.status])));
  }
  (mc.counsel || []).forEach((c) => rows.push('Opposing counsel: ' + join([c.name, c.firm, has(c.represents) && `for ${clean(c.represents)}`, c.phone])));
  (mc.docs || []).forEach((d) => has(d.summary) && rows.push(`Documents (${clean(d.cat) || 'file'}): ${clean(d.summary)}`));
  (mc.notes || []).forEach((n) => has(n.text) && rows.push(`Note ${join([n.date, n.staff], ', ')}: ${clean(n.text)}`));
  (mc.tasks || []).forEach((t) => has(t.text) && rows.push(`Task ${join([t.date, t.staff], ', ')}: ${clean(t.text)}`));
  const title = join([mc.caseType === 'Other' && mc.caseTypeOther ? mc.caseTypeOther : mc.caseType, mc.phase, has(mc.dateOfLoss) && `DOL ${clean(mc.dateOfLoss)}`], ', ');
  return { id: mc.id, name: clean(cl.name) || mc.id, title, text: rows.filter(has).join('\n') };
}
