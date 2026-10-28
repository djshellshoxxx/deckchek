// FS-33 smoke: gear ledger wizard on a mocked desktop (asset with a photo that carries EXIF/GPS, serial, private notes,
// service log and a signed certificate): select -> privacy (Public) -> preview excludes serial/price/notes -> folder
// export file list -> re-export as revision 2 with the certificate. The exported folder is then opened from file://
// offline (no requests leave the page), images load, the certificate verifies, a tampered paste shows a mismatch, a
// newer format is refused, plus an accessibility audit of the generated page (structure, names, alt, contrast in light
// and dark). Also: Esc cancel, Ctrl+E, write error, empty state, browser mode single-file download, flag off.
import fs from 'node:fs';
import path from 'node:path';
import { watchConsole, tauriMock, a11yAudit } from './core.mjs';

const ASSET = 'asset-pioneer-plx-crss12';
const SERIAL = 'SN-SMOKE-55554444';
const NOTES = 'Paid 1450 EUR to Jane Customerson';
// Init scripts also run in the sandboxed preview iframe, where localStorage throws: only touch it in the top window.
const FLAG_ON = () => { if (window.top !== window) return; if (!localStorage.getItem('deckchek.ui.v1')) localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { gearLedger: true }, setupWizardDone: true })); };

// Runs in the page after tauriMock. Backs the photo store, maintenance log, FS-20 certificates, ledger history and
// the folder write with in-memory state on window.__ledger.
function ledgerMock(certJson) {
  const before = window.__TAURI__.core.invoke;
  const st = { files: null, writes: 0, exports: [], notes: {}, failWrite: false, empty: false, seeded: false, jpeg: null };
  window.__ledger = st;
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  async function photo() {
    if (st.jpeg) return st.jpeg;
    const c = new OffscreenCanvas(96, 64), g = c.getContext('2d');
    g.fillStyle = '#2d6cdf'; g.fillRect(0, 0, 96, 64); g.fillStyle = '#ffd166'; g.fillRect(20, 16, 40, 30);
    const jpg = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: .8 })).arrayBuffer());
    const exif = new TextEncoder().encode('Exif\0\0GPSLatitude 51.5 N user dj-home C:\\Users\\dj\\IMG_0001.jpg');
    const seg = new Uint8Array([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif]);
    const out = new Uint8Array(jpg.length + seg.length);
    out.set(jpg.subarray(0, 2)); out.set(seg, 2); out.set(jpg.subarray(2), 2 + seg.length);
    st.jpeg = b64(out);
    return st.jpeg;
  }
  // st.gate (set from the test) holds photo reads open, so a build stays in progress while the test changes things.
  st.hold = () => { let release; const promise = new Promise(r => { release = r; }); st.gate = { promise, release: () => { st.gate = null; release(); } }; };
  window.__TAURI__.dialog = { open: async opts => (opts?.directory ? '/home/dj/Ledger' : null), save: async () => '/home/dj/Ledger/single.html' };
  window.__TAURI__.core.invoke = async (cmd, args = {}) => {
    if (cmd === 'device_profiles_sync') {
      const out = await before(cmd, args);
      const a = window.__mockDb.catalog.asset.find(x => x.id === 'asset-pioneer-plx-crss12');
      if (a && !st.seeded) { st.seeded = true; Object.assign(a, { nickname: 'Sheldons CRSS12', serialNumber: 'SN-SMOKE-55554444', notes: 'Paid 1450 EUR to Jane Customerson', condition: 'good', purchaseDate: '2024-03-02' }); }
      return out;
    }
    if (cmd === 'catalog_list' && st.empty && args.entity === 'asset') return [];
    if (cmd === 'photo_list') return args.ownerId === 'asset-pioneer-plx-crss12' ? [{ linkId: 'l1', photoId: 'ph1', sha256: 'x', width: 96, height: 64, bytes: 1, caption: 'C:\\Users\\dj\\Pictures\\front.jpg', altText: 'Front of the turntable', isPrimary: true, sort: 0, createdAt: '2026-10-01T00:00:00Z' }] : [];
    if (cmd === 'photo_read') { if (st.gate) await st.gate.promise; return photo(); }
    if (cmd === 'maintenance_list') return [{ id: 'e1', eventType: 'replace_part', eventAt: '2025-02-01T10:00:00Z', description: 'For customer Jane Customerson', assetId: 'asset-pioneer-plx-crss12', assetName: 'x' }];
    if (cmd === 'certificate_list') return [{ id: 'cert-1', assetId: 'asset-pioneer-plx-crss12', verdict: 'pass', contentHash: JSON.parse(certJson).integrity.contentHash, issuedAt: '2026-10-01T09:30:00.000Z', jsonPath: '/home/dj/secret/cert.json' }];
    if (cmd === 'certificate_get') return { id: 'cert-1', fileJson: certJson };
    if (cmd === 'ledger_public_notes') return Object.entries(st.notes).map(([assetId, publicNotes]) => ({ assetId, publicNotes }));
    if (cmd === 'ledger_public_note_set') { st.notes[args.assetId] = args.text; return { assetId: args.assetId, publicNotes: args.text }; }
    if (cmd === 'ledger_export_list') return st.exports.slice().reverse().slice(0, args.limit);
    if (cmd === 'ledger_export_record') {
      const next = st.exports.length + 1;
      if (args.record.revision !== next) throw `LEDGER_REVISION: the next revision is ${next}`;
      const row = { id: `x${next}`, revision: next, createdAt: '2026-10-28T10:00:00.000Z', ...args.record };
      st.exports.push(row); return row;
    }
    if (cmd === 'userfiles_write_folder') {
      if (st.failWrite) throw { code: 'io', message: 'write failed: PermissionDenied' };
      if (args.allowedExts.join() !== 'html,json,jpg') throw { code: 'bad_extension', message: 'unexpected extension list' };
      st.files = args.files; st.writes++; return { written: args.files.length, path: args.dir };
    }
    return before(cmd, args);
  };
}

// In the exported page: structure, names and WCAG contrast of every text node against its effective background.
async function pageAudit(p) {
  return p.evaluate(() => {
    const rgb = s => { const m = s.match(/[\d.]+/g) || []; return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; };
    const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
    const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.a > 0.5) return c; } return rgb(getComputedStyle(document.documentElement).backgroundColor); };
    const low = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden]') || el.closest('.skip')) continue;
      const fg = lum(rgb(cs.color)), bg = lum(bgOf(el));
      const ratio = (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
      const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
      if (ratio < (large ? 3 : 4.5)) low.push(`${el.tagName.toLowerCase()} ${ratio.toFixed(2)} "${el.textContent.trim().slice(0, 30)}"`);
    }
    const imgs = [...document.querySelectorAll('img')];
    return {
      lang: document.documentElement.lang, h1: document.querySelectorAll('h1').length, h2: document.querySelectorAll('article h2').length, articles: document.querySelectorAll('article').length,
      main: document.querySelectorAll('main').length, imgsNoAlt: imgs.filter(i => !i.alt.trim()).length, imgsBroken: imgs.filter(i => !i.complete || !i.naturalWidth).length, imgs: imgs.length,
      unnamed: [...document.querySelectorAll('button, textarea, input')].filter(e => !e.hidden && !(e.textContent.trim() || e.labels?.[0]?.textContent.trim() || e.getAttribute('aria-label'))).length,
      lowContrast: low,
    };
  });
}

export default async function run({ browser, base, check, tmp, ROOT, SHOTS }) {
  const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
  const errors = [];
  const certJson = fs.readFileSync(path.join(ROOT, '..', 'tests/fixtures/certificate/valid-v1.deckchek-cert.json'), 'utf8');

  // ---------------------------------------------------------------- desktop (mocked Tauri)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await ctx.addInitScript(tauriMock);
  await ctx.addInitScript(ledgerMock, certJson);
  await ctx.addInitScript(FLAG_ON);
  const page = await ctx.newPage();
  errors.push(watchConsole(page, 'ledger'));
  await page.goto(base);
  await page.waitForSelector('.rail-item[data-screen="ledger"]');
  await page.waitForFunction(() => window.__ledger?.seeded);
  check('ledger: rail shows Gear ledger while the flag is on', true);
  await page.click('.rail-item[data-screen="ledger"]');
  await page.waitForSelector('#ledger-gear');
  check('ledger AC-1: step 1 lists owned gear with status words (photos, certificates, service)', /1 photo · 1 certificate · 1 service entry/.test(await page.locator('#ledger-gear').innerText()));
  await page.click('#ledger-next-privacy');
  check('ledger: Next without a selection explains what to do', /Pick at least one unit/.test(await page.locator('#ledger-select-error').innerText()));
  // entry from Equipment: the asset's "Gear ledger…" button opens the wizard with that unit ticked
  await page.click('.rail-item[data-screen="equipment"]');
  await page.click('#eq-tab-asset');
  await page.locator('#eq-rows .record-main', { hasText: 'Sheldons CRSS12' }).click();
  await page.click('[data-xlink="ledger"]');
  await page.waitForSelector(`#lg-${ASSET}`);
  check('ledger: Equipment > "Gear ledger…" opens the wizard with that unit selected', await page.locator(`#lg-${ASSET}`).isChecked() && (await page.locator('#ledger-gear input:checked').count()) === 1);
  await page.click('#ledger-next-privacy');
  await page.waitForSelector('#ledger-matrix');
  check('ledger AC-2: Public preset is the default, serial hidden, private notes unticked', await page.locator('#ledger-preset-public').isChecked()
    && (await page.locator('#ledger-serial').inputValue()) === 'hidden' && !(await page.locator('#ledger-matrix thead input[data-field="notes"]').isChecked())
    && !(await page.locator('#ledger-matrix thead input[data-field="certificates"]').isChecked()));
  const audit = await a11yAudit(page);
  check('ledger: privacy matrix controls are named and at least 24 px', !audit.unnamed.length && !audit.small.length, JSON.stringify(audit).slice(0, 300));
  // Esc cancels back to step 1
  await page.keyboard.press('Escape');
  await page.waitForSelector('#ledger-gear');
  check('ledger: Esc cancels the wizard back to step 1 and says so', /cancelled/.test(await page.locator('#ledger-status').innerText()) && await page.locator(`#lg-${ASSET}`).isChecked());
  // Ctrl+E jumps to export
  await page.locator('#ledger-h-select').focus();
  await page.keyboard.press('Control+e');
  await page.waitForSelector('#ledger-export', { timeout: 15000 });
  check('ledger: Ctrl+E opens the export step', /4\. Export/.test(await page.locator('#ledger-h-export').innerText()));
  await page.click('[data-step="preview"]');
  await page.waitForSelector('#ledger-preview', { timeout: 15000 });
  const preview = await page.frameLocator('#ledger-preview').locator('body').innerText();
  check('ledger AC-1/AC-2: preview excludes serial, price, private notes, nickname and customer names', !preview.includes(SERIAL) && !preview.includes('1450') && !preview.includes('Customerson') && !preview.includes('Sheldons') && /PLX-CRSS12/.test(preview), preview.slice(0, 200));
  check('ledger: preview shows the photo and service history', (await page.frameLocator('#ledger-preview').locator('img').count()) === 1 && /Part replaced/.test(preview));
  check('ledger: "What will be public" lists fields and counts', /1 unit, 1 photo, 0 certificates/.test(await page.locator('#ledger-summary').innerText()) && /Never included: purchase price/.test(await page.locator('#ledger-summary').innerText()));
  check('ledger: preview frame runs no scripts (sandboxed)', (await page.locator('#ledger-preview').getAttribute('sandbox')) === '');
  await page.click('[data-theme-choice="dark"]');
  await page.waitForFunction(() => /theme-dark/.test(document.getElementById('ledger-preview')?.srcdoc || ''));
  check('ledger: preview switches to dark', (await page.locator('[data-theme-choice="dark"]').getAttribute('aria-pressed')) === 'true');
  await shot(page, 'ledger-preview');
  await page.click('#ledger-next-export');
  await page.waitForSelector('#ledger-publish');
  check('ledger AC-6: numbered GitHub Pages guide, "never uploads", no credential fields', (await page.locator('#ledger-publish-steps li').count()) === 4 && /never uploads for you/.test(await page.locator('#ledger-publish').innerText())
    && (await page.locator('#screen-ledger input[type="password"]').count()) === 0 && /does not remove copies you already published/.test(await page.locator('#ledger-publish').innerText()));
  // write error
  await page.evaluate(() => { window.__ledger.failWrite = true; });
  await page.click('#ledger-export');
  await page.waitForSelector('#ledger-export-error');
  check('ledger: disk write error is shown in words', /Export failed: write failed/.test(await page.locator('#ledger-export-error').innerText()));
  await page.evaluate(() => { window.__ledger.failWrite = false; });
  await page.click('#ledger-export');
  await page.waitForSelector('#ledger-success');
  const files1 = await page.evaluate(() => window.__ledger.files);
  const paths1 = files1.map(f => f.relPath);
  check('ledger AC-1: folder export writes ledger/index.html, ledger.json and assets/*.jpg', paths1[0] === 'ledger/index.html' && paths1.includes('ledger/ledger.json') && paths1.filter(p => /^ledger\/assets\/a[0-9a-f]{10}\/p1\.jpg$/.test(p)).length === 1, paths1.join(', '));
  check('ledger: success names the folder and the revision', /Saved to \/home\/dj\/Ledger\/ledger/.test(await page.locator('#ledger-success').innerText()) && /Revision 1 recorded/.test(await page.locator('#ledger-outcome').innerText()));
  const all1 = files1.map(f => (f.text != null ? f.text : Buffer.from(f.base64, 'base64').toString('latin1'))).join('\n');
  check('ledger leak-grep (export 1): no serial, notes, customer, EXIF/GPS, paths or user names in any file', ![SERIAL, '1450', 'Customerson', 'Exif', 'GPSLatitude', 'dj-home', 'C:\\Users', '/home/dj', 'Sheldons'].some(s => all1.includes(s)));

  // revision 2 with the certificate ticked (Private preset)
  await page.click('[data-step="privacy"]');
  await page.check('#ledger-preset-private');
  await page.waitForFunction(() => document.querySelector('#ledger-matrix thead input[data-field="certificates"]')?.checked);
  await page.click('#ledger-next-preview');
  await page.waitForSelector('#ledger-preview', { timeout: 15000 });
  check('ledger: certificate warning in the summary when certificates are included', /full serial number, the tester name/.test(await page.locator('#ledger-warnings').innerText()));
  await page.click('#ledger-next-export');
  await page.waitForSelector('#ledger-revision');
  check('ledger AC-7: the export step announces revision 2 and the change', /revision 2 \(last: 1\)\. The content changed/.test(await page.locator('#ledger-revision').innerText()));
  await page.click('#ledger-export');
  await page.waitForFunction(() => window.__ledger.writes === 2);
  await page.waitForSelector('#ledger-success');
  const files2 = await page.evaluate(() => window.__ledger.files);
  const json2 = JSON.parse(files2.find(f => f.relPath === 'ledger/ledger.json').text);
  check('ledger AC-7: re-export increments the revision counter', json2.revision === 2 && (await page.evaluate(() => window.__ledger.exports.length)) === 2);
  check('ledger AC-4: signed certificate embedded unchanged plus its own .deckchek-cert.json file', JSON.stringify(json2.items[0].certificates[0].signed) === JSON.stringify(JSON.parse(certJson)) && files2.some(f => /^ledger\/certificates\/c-[0-9a-f]{12}\.deckchek-cert\.json$/.test(f.relPath)));
  await shot(page, 'ledger-exported');

  // ---------------------------------------------------------------- the exported folder, offline from file://
  const out = path.join(tmp, 'ledger-export');
  for (const f of files2) {
    const dest = path.join(out, ...f.relPath.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.text != null ? f.text : Buffer.from(f.base64, 'base64'));
  }
  const index = path.join(out, 'ledger', 'index.html');
  for (const scheme of ['light', 'dark']) {
    const fctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, colorScheme: scheme, offline: true });
    const fp = await fctx.newPage();
    const ferr = watchConsole(fp, `ledger-file-${scheme}`);
    const outside = [];
    fp.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) outside.push(r.url()); });
    await fp.goto(`file://${index}`);
    await fp.waitForFunction(() => /matches this hash/.test(document.getElementById('ledger-check')?.textContent || ''));
    const a = await pageAudit(fp);
    if (scheme === 'light') {
      check('ledger AC-3: opened from file:// offline it renders fully with no external requests', outside.length === 0 && a.imgs === 1 && a.imgsBroken === 0, outside.join(', '));
      check('ledger: ledger data hash re-checks on open (integrity, worded)', /✓ The ledger data on this page matches this hash/.test(await fp.locator('#ledger-check').innerText()));
      await fp.click('button[data-verify="0:0"]');
      await fp.waitForFunction(() => /Match|Mismatch|Cannot/.test(document.getElementById('vr-0-0')?.textContent || ''));
      const vr = await fp.locator('#vr-0-0').innerText();
      check('ledger AC-4: "Verify certificate" recomputes SHA-256 and shows a match (signature checked or "not checked by this browser")', /^✓ Match/.test(vr) && (/signature checks out/.test(vr) || /signature not checked by this browser/.test(vr)), vr);
      const tampered = certJson.replace('"verdict": "pass"', '"verdict": "fail"');
      await fp.fill('#paste-input', tampered);
      await fp.click('#paste-check');
      await fp.waitForFunction(() => /Match|Mismatch|Cannot/.test(document.getElementById('paste-result')?.textContent || ''));
      check('ledger AC-4: a pasted tampered certificate shows a mismatch', /^✗ Mismatch/.test(await fp.locator('#paste-result').innerText()));
      await fp.fill('#paste-input', certJson);
      await fp.click('#paste-check');
      await fp.waitForFunction(() => /Match/.test(document.getElementById('paste-result')?.textContent || '') && !/Mismatch/.test(document.getElementById('paste-result')?.textContent || ''));
      check('ledger AC-4: the untouched certificate pasted back matches and is found in this ledger', /listed in this ledger/.test(await fp.locator('#paste-result').innerText()) && !/not listed/.test(await fp.locator('#paste-result').innerText()));
      await fp.emulateMedia({ media: 'print' });
      check('ledger: print stylesheet hides buttons and the paste box', await fp.locator('#paste-section').isHidden());
      await fp.emulateMedia({ media: 'screen' });
      await shot(fp, 'ledger-page-light');
    } else await shot(fp, 'ledger-page-dark');
    check(`ledger a11y (${scheme}): lang, one h1, one h2 per item, main landmark, alt text, named controls`, a.lang === 'en' && a.h1 === 1 && a.h2 === a.articles && a.main === 1 && a.imgsNoAlt === 0 && a.unnamed === 0, JSON.stringify(a).slice(0, 300));
    check(`ledger a11y (${scheme}): text contrast meets WCAG AA`, a.lowContrast.length === 0, a.lowContrast.slice(0, 4).join(' | '));
    errors.push(ferr);
    await fctx.close();
  }
  // a newer ledger format is refused by name
  const html = fs.readFileSync(index, 'utf8').replace('{"format":"deckchek-ledger","version":1,', '{"format":"deckchek-ledger","version":2,');
  fs.writeFileSync(path.join(out, 'ledger', 'newer.html'), html);
  const nctx = await browser.newContext({ offline: true });
  const np = await nctx.newPage();
  errors.push(watchConsole(np, 'ledger-newer'));
  await np.goto(`file://${path.join(out, 'ledger', 'newer.html')}`);
  await np.waitForSelector('#version-warning:not([hidden])');
  check('ledger: a newer ledger version shows "generated by a newer DeckChek" and switches checks off', /newer DeckChek/.test(await np.locator('#version-warning').innerText()) && (await np.locator('button[data-verify]:visible').count()) === 0);
  await nctx.close();

  // empty state (fresh page, no assets)
  const ep = await ctx.newPage();
  errors.push(watchConsole(ep, 'ledger-empty'));
  await ep.addInitScript(() => { const t = setInterval(() => { if (window.__ledger) { window.__ledger.empty = true; clearInterval(t); } }, 0); });
  await ep.goto(base);
  await ep.click('.rail-item[data-screen="ledger"]');
  await ep.waitForSelector('#ledger-empty');
  check('ledger: empty state says "Add equipment first" with a way there', /Add equipment first/.test(await ep.locator('#ledger-empty').innerText()));
  await ep.close();

  // flag off hides the UI
  await page.evaluate(async () => { const m = await import('/features.js'); m.setEnabled('gearLedger', false); });
  await page.waitForFunction(() => !document.querySelector('.rail-item[data-screen="ledger"]'));
  check('ledger: flag off hides the rail entry', (await page.locator('.rail-item[data-screen="ledger"]').count()) === 0);
  await ctx.close();

  // ---------------------------------------------------------------- review regressions (FS-33 UI findings)
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await rctx.addInitScript(tauriMock);
  await rctx.addInitScript(ledgerMock, certJson);
  await rctx.addInitScript(FLAG_ON);
  const rp = await rctx.newPage();
  errors.push(watchConsole(rp, 'ledger-regressions'));
  const active = () => rp.evaluate(() => document.activeElement?.id || document.activeElement?.tagName.toLowerCase());
  const lastFiles = () => rp.evaluate(() => window.__ledger.files);
  const fileText = (files, rel) => files.find(f => f.relPath === rel)?.text || '';
  await rp.goto(base);
  await rp.waitForFunction(() => window.__ledger?.seeded);
  await rp.click('.rail-item[data-screen="ledger"]');
  await rp.waitForSelector(`#lg-${ASSET}`);
  const other = await rp.locator(`#ledger-gear input:not([data-asset="${ASSET}"])`).first().getAttribute('data-asset');
  await rp.check(`#lg-${ASSET}`);
  await rp.click('#ledger-next-privacy');
  await rp.waitForSelector('#ledger-matrix');

  // focus: Enter on "Next: preview" keeps focus on the step heading while building and after the build
  await rp.evaluate(() => window.__ledger.hold());
  await rp.locator('#ledger-next-preview').focus();
  await rp.keyboard.press('Enter');
  await rp.waitForSelector('#ledger-progress');
  await rp.waitForTimeout(100);
  const busyFocus = await active();
  // cache key: while that build is held open, go back and add a unit, then return to the preview
  await rp.click('[data-step="select"]');
  await rp.check(`#ledger-gear input[data-asset="${other}"]`);
  await rp.click('#ledger-next-privacy');
  await rp.click('#ledger-next-preview');
  await rp.evaluate(() => window.__ledger.gate.release());
  await rp.waitForSelector('#ledger-summary', { timeout: 15000 });
  check('ledger regression: focus stays on the preview heading while the ledger builds and after', busyFocus === 'ledger-h-preview' && (await active()) === 'ledger-h-preview', `busy=${busyFocus} after=${await active()}`);
  check('ledger regression: a build that finishes after the selection changed is not shown as the current preview', /^2 units,/m.test(await rp.locator('#ledger-summary').innerText()), (await rp.locator('#ledger-summary').innerText()).slice(0, 80));

  // per-unit overrides switch the preset to Custom at once; clicking the preset again resets them
  await rp.click('[data-step="privacy"]');
  await rp.selectOption(`[data-serial="${ASSET}"]`, 'full');
  check('ledger regression: a per-unit serial override unchecks the preset and shows Custom, focus stays on the control',
    !(await rp.locator('#ledger-preset-public').isChecked()) && (await rp.locator('#ledger-custom').count()) === 1 && (await rp.evaluate(() => document.activeElement?.dataset.serial || '')) === ASSET);
  await rp.click('#ledger-preset-public');
  check('ledger regression: choosing Public again resets the per-unit override', await rp.locator('#ledger-preset-public').isChecked() && (await rp.locator('#ledger-custom').count()) === 0
    && (await rp.locator(`[data-serial="${ASSET}"]`).inputValue()) === 'hidden');
  await rp.uncheck(`[data-item-field="${ASSET}|photos"]`);
  check('ledger regression: a per-unit field override shows Custom and keeps focus on the checkbox', (await rp.locator('#ledger-custom').count()) === 1 && !(await rp.locator('#ledger-preset-public').isChecked())
    && (await rp.evaluate(() => document.activeElement?.dataset.itemField || '')) === `${ASSET}|photos`);
  await rp.click('#ledger-preset-public');

  // Ctrl+E with the cursor still in the owner field / a public note exports what is typed there
  await rp.fill('#ledger-owner', 'Jo Smith');
  await rp.keyboard.press('Tab');
  await rp.click('#ledger-next-preview');
  await rp.click('#ledger-next-export', { timeout: 15000 });
  await rp.click('#ledger-export');
  await rp.waitForSelector('#ledger-success');
  check('ledger regression: the post-export note says leftover certificate files and photos stay in the folder', /certificate/i.test(await rp.locator('#ledger-outcome').innerText()) && /delete them/i.test(await rp.locator('#ledger-outcome').innerText()), await rp.locator('#ledger-outcome').innerText());
  const ownerBefore = fileText(await lastFiles(), 'ledger/index.html').includes('Jo Smith');
  await rp.click('[data-step="privacy"]');
  await rp.locator('#ledger-owner').focus();
  await rp.fill('#ledger-owner', '');
  await rp.keyboard.press('Control+e');
  await rp.waitForSelector('#ledger-export', { timeout: 15000 });
  await rp.waitForTimeout(100);
  const exportFocus = await active();
  await rp.keyboard.press('Control+e');
  await rp.waitForFunction(() => window.__ledger.writes === 2, null, { timeout: 15000 });
  const files2r = await lastFiles();
  check('ledger regression: Ctrl+E right after clearing the owner name exports without it', ownerBefore && !fileText(files2r, 'ledger/index.html').includes('Jo Smith') && !fileText(files2r, 'ledger/ledger.json').includes('Jo Smith'));
  check('ledger regression: Ctrl+E from the privacy step leaves focus on the export heading', exportFocus === 'ledger-h-export', exportFocus);
  await rp.waitForSelector('#ledger-success');
  await rp.click('[data-step="privacy"]');
  await rp.click('.ledger-notes summary');
  const noteSel = `textarea[data-note="${ASSET}"]`;
  await rp.fill(noteSel, 'Fresh note XYZ');
  await rp.keyboard.press('Control+e');
  await rp.waitForSelector('#ledger-export', { timeout: 15000 });
  await rp.keyboard.press('Control+e');
  await rp.waitForFunction(() => window.__ledger.writes === 3, null, { timeout: 15000 });
  check('ledger regression: Ctrl+E while typing a public note exports the typed note', fileText(await lastFiles(), 'ledger/ledger.json').includes('Fresh note XYZ'));

  // the publish guide follows the format radio; single-file mode names the file and the index.html rename
  await rp.waitForSelector('#ledger-success');
  const folderSteps = await rp.locator('#ledger-publish-steps').innerText();
  await rp.check('#ledger-mode-single');
  const singleSteps = await rp.locator('#ledger-publish-steps').innerText();
  check('ledger regression: single-file mode shows its own publish steps (rename to index.html, no folder)', /"ledger" folder/.test(folderSteps)
    && /deckchek-gear-ledger\.html/.test(singleSteps) && /index\.html/.test(singleSteps) && !/folder \(index\.html, ledger\.json/.test(singleSteps) && (await active()) === 'ledger-mode-single', singleSteps.slice(0, 200));
  await rp.check('#ledger-mode-folder');
  check('ledger regression: switching back to Folder restores the folder steps', /"ledger" folder/.test(await rp.locator('#ledger-publish-steps').innerText()));
  await rctx.close();

  // ---------------------------------------------------------------- browser mode: single-file download
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await bctx.addInitScript(FLAG_ON);
  const bp = await bctx.newPage();
  errors.push(watchConsole(bp, 'ledger-browser'));
  await bp.goto(base);
  await bp.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('deckchek.catalog.v1') || 'null')?.catalog?.asset?.length > 0; } catch { return false; } }, null, { timeout: 15000 }).catch(() => {});
  await bp.click('.rail-item[data-screen="ledger"]');
  await bp.waitForSelector('#ledger-gear, #ledger-empty');
  if (await bp.locator('#ledger-gear').count()) {
    await bp.locator('#ledger-gear input').first().check();
    await bp.click('#ledger-next-privacy');
    await bp.click('#ledger-next-preview');
    await bp.click('#ledger-next-export', { timeout: 15000 });
    await bp.waitForSelector('#ledger-export');
    check('ledger browser mode: folder export is unavailable with a reason, single file is chosen', await bp.locator('#ledger-mode-folder').isDisabled() && await bp.locator('#ledger-mode-single').isChecked() && /needs the DeckChek desktop app/.test(await bp.locator('.ledger-modes').innerText()));
    const bSteps = await bp.locator('#ledger-publish-steps').innerText();
    check('ledger regression: browser mode publish steps describe the single file and the index.html rename', /index\.html/.test(bSteps) && !/folder \(index\.html, ledger\.json/.test(bSteps), bSteps.slice(0, 200));
    const [dl] = await Promise.all([bp.waitForEvent('download'), bp.click('#ledger-export')]);
    const body = fs.readFileSync(await dl.path(), 'utf8');
    check('ledger browser mode: single-file HTML downloads with inline CSS/JS and the ledger data', /deckchek-gear-ledger\.html$/.test(dl.suggestedFilename()) && /id="ledger-data"/.test(body) && /Content-Security-Policy/.test(body));
    await bp.waitForSelector('#ledger-success');
    check('ledger browser mode: revision 1 recorded locally', /Revision 1 recorded/.test(await bp.locator('#ledger-outcome').innerText()));
  } else check('ledger browser mode: device library assets present', false, 'no assets in browser mode');
  await bctx.close();
  return errors.flat();
}
