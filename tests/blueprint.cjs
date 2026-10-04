// The 🧭 Blueprint (public/js/lsh-blueprint.js with public/js/blueprint-content.js), against the local wrangler dev
// server run.sh starts. jsPDF is served from node_modules in place of cdnjs.
// Checks: a trainee has 🧭 Blueprint in the header and gets the Trainee blueprint only (no Trainer tab, no trainer
// words); a trainer gets both decks as tabs; ◀ ▶ and the keys go through every slide; every slide fits its frame on a
// laptop and on a phone; ⬇ Download PDF saves each deck with a page per slide and the deploy stamp; Esc closes it.
// Numbering: the cover is "Cover" (★), the slides 1 to n on the contents buttons, the counter, the slide's heading and
// footer, and the PDF's page footers; the last slide is "n / n", as its button, and nothing ever says n + 1.
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
    // n slides and the cover (the counter has no total on the cover, so it comes from the deck itself)
    const n = LSHBlueprint.decks()[LSHBlueprint.current().deck].slides.length, total = n + 1, tooBig = new RegExp(`\\b${n + 1}\\b`);
    for (let i = 0; i < total; i++) {
      LSHBlueprint.go(i, true); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const slide = document.getElementById('lbp-slide'), card = slide.firstElementChild, name = i === 0 ? 'the cover' : `slide ${i}`;
      texts.push(slide.innerText);
      // the numbers: Cover, then 1 to n on the counter, the contents buttons, the heading and the footer
      const count = document.getElementById('lbp-count').textContent, on = document.querySelector('#lbp-toc button.on');
      const want = i === 0 ? `Cover · ${n} slides` : `${i} / ${n}`;
      if (count !== want) out.push(`${label} ${name}: the counter says "${count}" (expected "${want}")`);
      if (!on || on.textContent !== (i === 0 ? '★' : String(i))) out.push(`${label} ${name}: the contents buttons mark "${on && on.textContent}"`);
      if (i > 0) {
        const kicker = card.querySelector('.lbp-kicker').textContent, foot = card.querySelector('.lbp-foot span:last-child').textContent;
        if (!kicker.endsWith(`${i} of ${n}`) || foot !== `${i} / ${n}`) out.push(`${label} ${name}: the heading says "${kicker}" and the footer "${foot}" (expected "${i} of ${n}" and "${i} / ${n}")`);
        if (tooBig.test(count) || tooBig.test(foot)) out.push(`${label} ${name}: the counter or the footer says ${n + 1}, but the deck has ${n} slides`);
      }
      if (i === n) {
        const last = document.querySelector('#lbp-toc button:last-child').textContent;
        if (count !== `${n} / ${n}` || last !== String(n)) out.push(`${label} the last slide: the counter says "${count}" and its button "${last}" (expected "${n} / ${n}" and "${n}")`);
      }
      const over = [card, ...card.querySelectorAll('.lbp-main, .lbp-points, .lbp-side, .lbp-contents')].filter(e => e.scrollHeight - e.clientHeight > 2 || e.scrollWidth - e.clientWidth > 2);
      if (over.length) out.push(`${label} ${name}: cut off (${over.map(e => e.className).join(', ')})`);
      const sr = slide.getBoundingClientRect(), stage = document.getElementById('lbp-stage').getBoundingClientRect();
      if (sr.left < stage.left - 1 || sr.right > stage.right + 1 || sr.top < stage.top - 1 || sr.bottom > stage.bottom + 1) out.push(`${label} ${name}: bigger than the screen`);
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
  // the PDF's page footers: "Cover", then 1 / n to n / n (never n + 1 / n + 1)
  const numbered = (pdf, n) => /\bCover\b/.test(pdf.text) && pdf.text.includes(`1 / ${n}`) && pdf.text.includes(`${n} / ${n}`) && !pdf.text.includes(`${n + 1} / ${n + 1}`);
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
  const tn = await te.evaluate(() => LSHBlueprint.decks().trainee.slides.length);
  if ((await te.textContent('#lbp-count')) !== `Cover · ${tn} slides`) fail(`the cover's counter says "${await te.textContent('#lbp-count')}" (expected "Cover · ${tn} slides")`);
  await te.keyboard.press('ArrowRight'); await te.keyboard.press('ArrowRight');
  if ((await te.textContent('#lbp-count')) !== `2 / ${tn}`) fail(`← → didn't move through the slides (the counter says "${await te.textContent('#lbp-count')}", expected "2 / ${tn}")`);
  await te.click('#lbp-toc button:last-child');
  if ((await te.textContent('#lbp-count')) !== `${tn} / ${tn}` || (await te.textContent('#lbp-toc button:last-child')) !== String(tn)) fail(`the last slide's counter says "${await te.textContent('#lbp-count')}" (expected "${tn} / ${tn}", the same as its button)`);
  const tw = await walk(te, 'trainee 1366px'); tw.out.forEach(fail);
  const bad = tw.texts.filter(x => TRAINER_WORDS.test(x)).map(x => x.match(TRAINER_WORDS)[0]); if (bad.length) fail(`the trainee deck names trainer things: ${bad.join(', ')}`);
  let pdf = await pdfOf(te);
  if (pdf.name !== 'LSH_Ring_Channel_Blueprint_Trainee.pdf' || !pdf.pdf || pdf.pages !== tw.total) fail(`the trainee PDF: ${pdf.name}, ${pdf.pages} pages for ${tw.total} slides`);
  if (TRAINER_WORDS.test(pdf.text)) fail('the trainee PDF names trainer things');
  if (!numbered(pdf, tn)) fail(`the trainee PDF's page numbers don't match the slides (expected "Cover", then 1 / ${tn} to ${tn} / ${tn}, never ${tn + 1} / ${tn + 1})`);
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
  const an = aw.total - 1;
  if (!numbered(pdf, an)) fail(`the trainer PDF's page numbers don't match the slides (expected "Cover", then 1 / ${an} to ${an} / ${an}, never ${an + 1} / ${an + 1})`);
  await tr.click('#lbp-tabs button[data-deck="trainee"]');
  if (await tr.evaluate(() => document.getElementById('lbp-slide').dataset.deck) !== 'trainee') fail('the Trainee blueprint tab didn\'t switch the deck');
  await tr.setViewportSize({ width: 390, height: 844 }); await tr.waitForTimeout(300);
  (await walk(tr, 'trainee 390px')).out.forEach(fail);
  await tr.evaluate(() => LSHBlueprint.deck('trainer')); (await walk(tr, 'trainer 390px')).out.forEach(fail);
  await tr.context().close();

  await browser.close();
  if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
  console.log(`✅ Blueprint: trainee deck ${tw.total} slides and its PDF, trainer deck ${aw.total} slides and its PDF; every slide fits on a laptop and a phone; Cover, then 1 to n everywhere (never n + 1).`);
})().catch(e => { console.error(e); process.exit(1); });
