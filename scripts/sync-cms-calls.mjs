#!/usr/bin/env node
/* 🔁 Mirror the CMS's Call Simulator calls onto Ring Channel.
   The CMS (CaseManagementTraining) keeps every mock call in call-packs.js: the callers, their scripts, the goals and
   the case files they're about, for Standard Training, Case Management, Property Damage and EA / PA. Ring Channel plays
   the same calls (src/scenarios.js builds its Scenario Picker from them), so this copies that file, unchanged, to
   src/cms/call-packs.js with a header saying where it came from.

     node scripts/sync-cms-calls.mjs              copy the CMS's file from GitHub (main)
     node scripts/sync-cms-calls.mjs --from <path> copy it from a checkout of the CMS instead
     node scripts/sync-cms-calls.mjs --check      exit 1 if Ring Channel's copy is behind the CMS's

   The Sync CMS calls workflow (.github/workflows/sync-cms-calls.yml) runs it on a schedule and commits the change. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = 'team-litigation-lab/CaseManagementTraining';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/call-packs.js`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cms', 'call-packs.js');
const HEAD = `/* ⚠ MIRRORED FROM THE CMS: do not edit here.
   Source: ${REPO}/call-packs.js. Change a call in the CMS; scripts/sync-cms-calls.mjs (and the
   Sync CMS calls workflow) copies it here, and src/scenarios.js turns it into Ring Channel's calls. */
`;

const args = process.argv.slice(2);
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : '';
const check = args.includes('--check');

async function source() {
  if (from) return readFile(from, 'utf8');
  const res = await fetch(RAW, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${RAW}`);
  return res.text();
}

const text = await source();
// What src/scenarios.js reads from it: the calls, their lines, the case files and the programs.
for (const need of ['const CALLS = [', 'const LINES = [', 'const DOCS = {', 'const CASES = {', 'const PROGRAMS = [', 'module.exports = API'])
  if (!text.includes(need)) throw new Error(`The CMS's call-packs.js no longer has "${need}": update src/scenarios.js (cmsScenario) before syncing.`);
const next = HEAD + text;
let now = '';
try { now = await readFile(OUT, 'utf8'); } catch (e) { /* first sync */ }
if (now === next) { console.log('Ring Channel\'s calls already match the CMS.'); process.exit(0); }
if (check) { console.log('Ring Channel\'s calls are behind the CMS: run node scripts/sync-cms-calls.mjs'); process.exit(1); }
await writeFile(OUT, next);
console.log(`Copied the CMS's calls to ${path.relative(process.cwd(), OUT)}.`);
