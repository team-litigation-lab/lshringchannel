#!/usr/bin/env node
/* 🔁 Mirror the CMS's Call Simulator calls and Training Library files onto Ring Channel.
   The CMS (CaseManagementTraining) keeps every mock call in call-packs.js (the callers, their scripts, the goals and
   the case files they're about, for Standard Training, Case Management, Property Damage and EA / PA) and every
   Training Library file in mock-cases.js (MC-01 … : the clients the front desk looks up). Ring Channel plays the same
   calls (src/scenarios.js builds its Scenario Picker from them) and shows the same files in 🔎 Case lookup
   (src/cms-files.js), so this copies both files, unchanged, to src/cms/ with a header saying where they came from.

     node scripts/sync-cms-calls.mjs              copy the CMS's files from GitHub (main)
     node scripts/sync-cms-calls.mjs --from <dir> copy them from a checkout of the CMS instead
     node scripts/sync-cms-calls.mjs --check      exit 1 if Ring Channel's copies are behind the CMS's

   The Sync CMS calls workflow (.github/workflows/sync-cms-calls.yml) runs it on a schedule and commits the change. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = 'team-litigation-lab/CaseManagementTraining';
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cms');
// What src/scenarios.js (and src/cms-files.js) read from each file.
const FILES = [
  { name: 'call-packs.js', what: 'turns it into Ring Channel\'s calls', need: ['const CALLS = [', 'const LINES = [', 'const DOCS = {', 'const CASES = {', 'const PROGRAMS = [', 'module.exports = API'] },
  { name: 'mock-cases.js', what: 'shows its files in 🔎 Case lookup (src/cms-files.js)', need: ['const MOCK_CASES = [', 'module.exports = { MOCK_CASES'] }
];

const args = process.argv.slice(2);
let from = args.includes('--from') ? args[args.indexOf('--from') + 1] : '';
const check = args.includes('--check');
// --from used to name call-packs.js itself: take its folder.
if (from && /\.js$/.test(from)) from = path.dirname(from);

async function source(name) {
  if (from) return readFile(path.join(from, name), 'utf8');
  const raw = `https://raw.githubusercontent.com/${REPO}/main/${name}`;
  const res = await fetch(raw, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${raw}`);
  return res.text();
}

let behind = 0;
for (const f of FILES) {
  const text = await source(f.name);
  for (const need of f.need)
    if (!text.includes(need)) throw new Error(`The CMS's ${f.name} no longer has "${need}": update src/scenarios.js / src/cms-files.js before syncing.`);
  const head = `/* ⚠ MIRRORED FROM THE CMS: do not edit here.
   Source: ${REPO}/${f.name}. Change it in the CMS; scripts/sync-cms-calls.mjs (and the
   Sync CMS calls workflow) copies it here, and Ring Channel ${f.what}. */
`;
  const out = path.join(DIR, f.name);
  const next = head + text;
  let now = '';
  try { now = await readFile(out, 'utf8'); } catch (e) { /* first sync */ }
  if (now === next) { console.log(`${f.name}: already matches the CMS.`); continue; }
  behind++;
  if (check) { console.log(`${f.name}: behind the CMS.`); continue; }
  await writeFile(out, next);
  console.log(`Copied the CMS's ${f.name} to ${path.relative(process.cwd(), out)}.`);
}
if (check && behind) { console.log('Run node scripts/sync-cms-calls.mjs'); process.exit(1); }
