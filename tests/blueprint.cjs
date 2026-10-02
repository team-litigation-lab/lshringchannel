// The 🧭 Blueprint (public/js/lsh-blueprint.js with public/js/blueprint-content.js), against the local wrangler dev
// server run.sh starts. jsPDF is served from node_modules in place of cdnjs.
// Checks: a trainee has 🧭 Blueprint in the header and gets the Trainee blueprint only (no Trainer tab, no trainer
// words); a trainer gets both decks as tabs; ◀ ▶ and the keys go through every slide; every slide fits its frame on a
// laptop and on a phone; ⬇ Download PDF saves each deck with a page per slide and the deploy stamp; Esc closes it.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const B = process.env.BASE || 'http://127.0.0.1:8787';
const JSPDF = fs.readFileSync(path.join(path.dirname(require.resolve('jspdf')), 'jspdf.umd.min.js'));
const failures = []; const fail = (m) => failures.push(m);
function inspect(buf) {
  let raw = buf.toString('latin1'), at = 0; const parts = [raw];
  while ((at = raw.indexOf('stream', at)) >= 0) {
    const start = raw.indexOf('\n', at) + 1, end = raw.indexOf('endstream', start);
    if (start <= 0 || end < 0) break;
    try { parts.push(zlib.inflateSync(buf.subarray(start, end)).toString('latin1')); } catch (e) { /* not a Flate stream */ }
    at = end + 9;
  }
  raw = parts.join('\n');
  const text = (raw.match(/\((?:\\.|[^\\)])*\)\s*Tj/g) || []).map(s => s.replace(/\)\s*Tj$/, '').slice(1).replace(/\\(.)/g, '$1')).join('\n');
  return { pdf: parts[0].startsWith('%PDF'), pages: (raw.match(/\/Type \/Page\b(?!s)/g) || []).length, text };
}
const TRAINER_WORDS = /passphrase|you are the caller|score this call|write a new call|try practice|chartswap|casepeer/i;
async function walk(page, label) {
  return page.evaluate(async (label) => {
    const out = [], texts = [];
    const total = Number(document.getElementById('lbp-count').textContent.split('/')[1]);
    for (let i = 0; i < total; i++) {
      LSHBlueprint.go(i, true); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const slide = document.getElementById('lbp-slide'), card = slide.firstElementChild;
      texts.push(slide.innerText);
      const over = [card, ...card.querySelectorAll('.lbp-main, .lbp-points, .lbp-side, .lbp-contents')].filter(e => e.scrollHeight - e.clientHeight > 2 || e.scrollWidth - e.clientWidth > 2);
      if (over.length) out.push(`${label} slide ${i + 1}: cut off (${over.map(e => e.className).join(', ')})`);
      const sr = slide.getBoundingClientRect(), stage = document.getElementById('lbp-stage').getBoundingClientRect();
      if (sr.left < stage.left - 1 || sr.right > stage.right + 1 || sr.top < stage.top - 1 || sr.bottom > stage.bottom + 1) out.push(`${label} slide ${i + 1}: bigger than the screen`);
    }
    return { out, total, texts };
  }, label);
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.CHROMIUM_PATH || undefined });
  const mk = async (viewport) => {
    const c = await browser.newContext({ viewport, acceptDownloads: true }); const p = await c.newPage();
    p.on('pageerror', (e) => fail(`${viewport.width}px page error: ${e.message}`));
    await p.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/4\.2\.1\/jspdf\.umd\.min\.js/, r => r.fulfill({ contentType: 'text/javascript', body: JSPDF }));
    return p;
  };
  const pdfOf = async (page) => { const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#lbp-pdf-btn')]); return { name: dl.suggestedFilename(), ...inspect(fs.readFileSync(await dl.path())) }; };

  // ---- a trainee ----
  let te = await mk({ width: 1366, height: 768 });
  await te.goto(B + '/');
  await te.fill('#tn', 'Blue Print'); await te.fill('#tb', 'B093026'); await te.fill('#tp', '1357');
  await te.click('#fTrainee button'); await te.waitForSelector('#device .lcd');
  await te.waitForSelector('#lbp-open-btn', { timeout: 5000 }).catch(() => fail('a trainee has no 🧭 Blueprint button'));
  await te.click('#lbp-open-btn'); await te.waitForTimeout(300);
  const t = await te.evaluate(() => ({ deck: document.getElementById('lbp-slide').dataset.deck, tabs: !!document.getElementById('lbp-tabs').offsetParent }));
  if (t.deck !== 'trainee' || t.tabs) fail(`a trainee should get the trainee deck only: ${JSON.stringify(t)}`);
  if (await te.evaluate(() => { LSHBlueprint.deck('trainer'); return document.getElementById('lbp-slide').dataset.deck; }) !== 'trainee') fail('a trainee could switch to the Trainer blueprint');
  await te.keyboard.press('ArrowRight'); await te.keyboard.press('ArrowRight');
  if (!(await te.textContent('#lbp-count')).startsWith('3 /')) fail('← → didn\'t move through the slides');
  const tw = await walk(te, 'trainee 1366px'); tw.out.forEach(fail);
  const bad = tw.texts.filter(x => TRAINER_WORDS.test(x)).map(x => x.match(TRAINER_WORDS)[0]); if (bad.length) fail(`the trainee deck names trainer things: ${bad.join(', ')}`);
  let pdf = await pdfOf(te);
  if (pdf.name !== 'LSH_Ring_Channel_Blueprint_Trainee.pdf' || !pdf.pdf || pdf.pages !== tw.total) fail(`the trainee PDF: ${pdf.name}, ${pdf.pages} pages for ${tw.total} slides`);
  if (TRAINER_WORDS.test(pdf.text)) fail('the trainee PDF names trainer things');
  await te.keyboard.press('Escape');
  if (await te.evaluate(() => LSHBlueprint.isOpen())) fail('Esc didn\'t close the Blueprint');
  // the header is drawn again on another page: the button is still there
  await te.click('a[href="#/calls"]'); await te.waitForTimeout(200);
  if (!(await te.isVisible('#lbp-open-btn'))) fail('the 🧭 Blueprint button went missing on another page');
  await te.context().close();

  // ---- a trainer, on a laptop and on a phone ----
  let tr = await mk({ width: 1366, height: 768 });
  await tr.goto(B + '/');
  await tr.fill('#an', 'Coach Print'); await tr.fill('#ap', 'test-pass');
  await tr.click('#fTrainer button'); await tr.waitForSelector('#roster');
  await tr.click('#lbp-open-btn'); await tr.waitForTimeout(300);
  const a = await tr.evaluate(() => ({ deck: document.getElementById('lbp-slide').dataset.deck, tabs: [...document.querySelectorAll('#lbp-tabs button')].filter(b => b.offsetParent).map(b => b.textContent.trim()) }));
  if (a.deck !== 'trainer' || a.tabs.join() !== 'Trainer blueprint,Trainee blueprint') fail(`a trainer should get both decks: ${JSON.stringify(a)}`);
  const aw = await walk(tr, 'trainer 1366px'); aw.out.forEach(fail);
  pdf = await pdfOf(tr);
  if (pdf.name !== 'LSH_Ring_Channel_Blueprint_Trainer.pdf' || pdf.pages !== aw.total || !/Switchboard/.test(pdf.text)) fail(`the trainer PDF: ${pdf.name}, ${pdf.pages} pages`);
  if (!/deploy \w+|made /.test(pdf.text)) fail('the trainer PDF isn\'t stamped with the deploy and the date');
  await tr.click('#lbp-tabs button[data-deck="trainee"]');
  if (await tr.evaluate(() => document.getElementById('lbp-slide').dataset.deck) !== 'trainee') fail('the Trainee blueprint tab didn\'t switch the deck');
  await tr.setViewportSize({ width: 390, height: 844 }); await tr.waitForTimeout(300);
  (await walk(tr, 'trainee 390px')).out.forEach(fail);
  await tr.evaluate(() => LSHBlueprint.deck('trainer')); (await walk(tr, 'trainer 390px')).out.forEach(fail);
  await tr.context().close();

  await browser.close();
  if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
  console.log(`✅ Blueprint: trainee deck ${tw.total} slides and its PDF, trainer deck ${aw.total} slides and its PDF; every slide fits on a laptop and a phone.`);
})().catch(e => { console.error(e); process.exit(1); });
