// FS-20 smoke: create a signed certificate from a mocked full plan (JSON + PDF written), verify it VALID, edit one
// byte and see MODIFIED "content hash mismatch" with the changed section, PDF without data, HTML fallback when the
// PDF fails (same hash), readiness blocking + draft, Esc, browser mode (unsupported create, JS verify), flag off.
import fs from 'node:fs';
import path from 'node:path';
import { watchConsole, tauriMock, a11yAudit } from './core.mjs';

const PROFILE = 'pioneer-plx-crss12';

// Runs in the page after tauriMock: certificate commands backed by the app's own engine with a fake signature
// (the real Ed25519 path is covered by Rust tests and the shared fixture).
function certMock() {
  const before = window.__TAURI__.core.invoke;
  const files = {}, stored = [];
  const state = { files, stored, nextOpen: null, pdfFail: false, seeded: false, signCalls: 0 };
  window.__cert = state;
  const engine = () => import('/certificate.js');
  const b64 = bytes => btoa(String.fromCharCode(...bytes));
  const PK = new Uint8Array(32).fill(7);
  const fakeSig = digest => new Uint8Array([...digest, ...digest]);
  const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const verifier = async (pk, digest, sig) => sameBytes(pk, PK) && sameBytes(sig, fakeSig(digest));
  const fingerprint = async () => (await (await import('/sha256.js')).sha256Hex(PK)).slice(0, 16);
  window.__TAURI__.dialog = { open: async opts => (opts?.directory ? '/home/dj/Certificates' : state.nextOpen), save: async () => null };
  window.__TAURI__.core.invoke = async (cmd, args = {}) => {
    if (cmd === 'device_profiles_sync') {
      const out = await before(cmd, args);
      const p = args.profiles.find(x => x.id === 'pioneer-plx-crss12');
      if (p && !state.seeded) {
        state.seeded = true;
        const db = window.__mockDb;
        const t0 = Date.now() - 3600e3;
        p.tests.forEach((t, i) => db.deviceResults.push({ id: `seed-${i}`, assetId: 'asset-pioneer-plx-crss12', profileId: p.id, testId: t.id, status: 'pass', createdAt: new Date(t0 + i).toISOString(),
          detail: { summary: 'Pass (mock)', measurements: t.id === 'crss12-speed-33' ? [{ metricId: 'measured_pitch_percent', value: 0.012, unit: '%', uncertainty: 0.01 }] : [] } }));
      }
      return out;
    }
    if (cmd === 'signing_get_identity') return { fingerprint: await fingerprint(), createdAt: '2026-10-01T00:00:00Z', publicKeyB64: b64(PK), protection: 'dpapi' };
    if (cmd === 'certificate_sign') {
      state.signCalls++;
      const m = await engine();
      if (!m.validatePayload(args.payload).ok) throw { code: 'schema', message: 'bad payload' };
      const hash = await m.contentHash(args.payload);
      const digest = Uint8Array.from(hash.match(/../g), x => parseInt(x, 16));
      return { contentHash: hash, signatureB64: b64(fakeSig(digest)), publicKeyB64: b64(PK), fingerprint: await fingerprint(), protection: 'dpapi' };
    }
    if (cmd === 'certificate_verify') {
      const m = await engine();
      const fp = await fingerprint();
      const { payload, ...rep } = await m.verifyCertificateText(args.json, { verifySignature: verifier, isLocal: f => f === fp });
      return rep;
    }
    if (cmd === 'certificate_extract_json') {
      if (args.path.endsWith('.pdf')) throw { code: 'pdf_has_no_attachment', message: 'This PDF has no DeckChek data attached.' };
      const text = files[args.path];
      if (text == null) throw { code: 'bad_path', message: 'invalid file path: file not found' };
      return args.path.endsWith('.html') ? (await engine()).extractJsonFromHtml(text) : text;
    }
    if (cmd === 'userfiles_write_folder') { for (const f of args.files) files[`${args.dir}/${f.relPath}`] = f.text; return { written: args.files.length, path: args.dir }; }
    if (cmd === 'pdf_render') { if (state.pdfFail) throw { code: 'webview2_unavailable', message: 'PrintToPdf failed (mock)' }; files[args.destPath] = args.html; return { path: args.destPath, bytes: 1000, pages: 2 }; }
    if (cmd === 'certificate_store') {
      const file = JSON.parse(args.record.fileJson);
      const row = { id: `cert-${stored.length + 1}`, assetId: args.record.assetId, profileId: args.record.profileId, signingKeyId: file.integrity.fingerprint, serialNumber: file.payload.unit.serial, testerName: file.payload.tester, verdict: file.payload.verdict, contentHash: file.integrity.contentHash, issuedAt: file.payload.issuedAt, validUntil: file.payload.validUntil, pdfPath: args.record.pdfPath, jsonPath: args.record.jsonPath, fileJson: args.record.fileJson };
      stored.unshift(row);
      const { fileJson, ...summary } = row;
      return summary;
    }
    if (cmd === 'certificate_list') return stored.filter(r => !args.assetId || r.assetId === args.assetId).map(({ fileJson, ...s }) => s);
    if (cmd === 'certificate_get') return stored.find(r => r.id === args.id) || null;
    if (cmd === 'photo_attach') return { photoId: 'p', sha256: 'x', linkId: 'l' };
    return before(cmd, args);
  };
}

export default async function run({ browser, base, check, ROOT, SHOTS }) {
  const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
  const errors = [];
  // ---------------------------------------------------------------- desktop (mocked Tauri)
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(tauriMock);
  await context.addInitScript(certMock);
  await context.addInitScript(() => { if (!localStorage.getItem('deckchek.ui.v1')) localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { certificates: true }, setupWizardDone: true })); });
  const page = await context.newPage();
  errors.push(watchConsole(page, 'certificate'));
  await page.goto(base);
  await page.waitForSelector('.rail-item[data-screen="certificate"]');
  check('cert: rail shows Certificates and Verify certificate while the flag is on', (await page.locator('.rail-item[data-screen="verify"]').count()) === 1);
  await page.click('.rail-item[data-screen="certificate"]');
  await page.waitForSelector('#cert-readiness', { timeout: 15000 });
  await page.selectOption('#cert-unit', `${PROFILE}::asset-${PROFILE}`);
  await page.waitForFunction(() => /32 of 32 required tests done/.test(document.getElementById('cert-count')?.textContent || ''));
  check('cert AC-1: full plan -> "Sign and export" enabled', await page.locator('#cert-sign').isEnabled());
  await page.waitForFunction(() => /[0-9a-f]{4} [0-9a-f]{4}/.test(document.getElementById('cert-fp')?.textContent || ''));
  check('cert: signing fingerprint shown in large type', (await page.locator('#cert-fp').count()) === 1);

  // readiness blocking on a unit without results
  const other = await page.locator('#cert-unit option').evaluateAll(os => os.map(o => o.value).find(v => !v.startsWith('pioneer-plx-crss12::')));
  await page.selectOption('#cert-unit', other);
  await page.waitForSelector('#cert-missing');
  check('cert AC-1: missing tests are listed and signing is blocked', !(await page.locator('#cert-sign').isEnabled()) && (await page.locator('#cert-missing li').count()) > 0);
  check('cert: partial state offers an unsigned DRAFT export', await page.locator('#cert-draft').isVisible());
  await page.fill('#cert-serial', 'DRAFT-1'); await page.fill('#cert-tester', 'Alex');
  await page.click('#cert-preview');
  await page.waitForSelector('#cert-preview-card:not([hidden]) .dc-cert-draft');
  check('cert: preview shows the DRAFT watermark when unsigned', /DRAFT/.test(await page.locator('#cert-preview-card').innerText()));
  await page.keyboard.press('Escape');
  check('cert: Esc closes the preview', await page.locator('#cert-preview-card').isHidden());

  // sign and export
  await page.selectOption('#cert-unit', `${PROFILE}::asset-${PROFILE}`);
  await page.waitForSelector('#cert-sign:not([disabled])');
  await page.fill('#cert-serial', '');
  await page.fill('#cert-tester', 'Alex <Tester>');
  await page.click('#cert-sign');
  check('cert: serial is required', /serial number/i.test(await page.locator('#cert-form-error').innerText()));
  await page.fill('#cert-serial', 'CRSS12 #0042');
  const t0 = Date.now();
  await page.click('#cert-sign');
  await page.waitForFunction(() => window.__cert.stored.length === 1, null, { timeout: 15000 });
  const ms = Date.now() - t0;
  const files = await page.evaluate(() => Object.keys(window.__cert.files));
  const jsonPath = files.find(f => f.endsWith('.deckchek-cert.json'));
  check('cert AC-2: PDF, .deckchek-cert.json and a stored record within 5 s', !!jsonPath && files.some(f => f.endsWith('.pdf')) && ms < 5000, `${ms} ms; ${files.join(', ')}`);
  check('cert: file names are <model>-<serial>-<date> with unsafe characters replaced', /\/Pioneer_DJ_PLX-CRSS12-CRSS12__0042-\d{4}-\d{2}-\d{2}\.deckchek-cert\.json$/.test(jsonPath), jsonPath);
  const pdfHtml = await page.evaluate(() => Object.entries(window.__cert.files).find(([k]) => k.endsWith('.pdf'))[1]);
  const stored = await page.evaluate(() => window.__cert.stored[0]);
  check('cert: PDF carries content hash, QR and disclaimer; tester name escaped', pdfHtml.includes(stored.contentHash) && /role="img" aria-label="QR code/.test(pdfHtml) && /does not prove the tester measured honestly/.test(pdfHtml) && pdfHtml.includes('Alex &lt;Tester&gt;'));
  check('cert AC-6: no calibration profile -> "Pass (uncalibrated)", printed beside the value', stored.verdict === 'pass_uncalibrated' && /Uncalibrated/.test(pdfHtml));
  await page.waitForFunction(() => /Certificate signed/.test(document.getElementById('cert-status')?.textContent || ''));
  check('cert: success announced and history lists the certificate', (await page.locator('#cert-history .cert-history-row').count()) === 1);
  await shot(page, 'certificate-signed');

  // verify VALID
  await page.click('.rail-item[data-screen="verify"]');
  await page.waitForSelector('#verify-drop');
  await page.evaluate(p => { window.__cert.nextOpen = p; }, jsonPath);
  await page.focus('#verify-drop');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#verify-badge');
  check('cert AC-3: exported JSON verifies VALID with the signer fingerprint (keyboard-operated drop zone)', (await page.locator('#verify-badge').innerText()).includes('VALID') && (await page.locator('#verify-fp').count()) === 1);
  check('cert: badge has icon + text and a live result', (await page.locator('#verify-badge .cert-badge-icon').count()) === 1 && /VALID/.test(await page.locator('#verify-status').innerText()));

  // mutate one byte -> MODIFIED
  await page.evaluate(p => { window.__cert.files[p] = window.__cert.files[p].replace('CRSS12 #0042', 'CRSS12 #0043'); }, jsonPath);
  await page.click('#verify-drop');
  await page.waitForFunction(() => /MODIFIED/.test(document.getElementById('verify-badge')?.textContent || ''));
  check('cert AC-4: one-byte edit -> MODIFIED naming "content hash mismatch"', /content hash mismatch/.test(await page.locator('#verify-reasons').innerText()));
  check('cert: MODIFIED shows the changed section against the stored original', /payload\.unit\.serial/.test(await page.locator('#verify-diff').innerText()));
  await shot(page, 'certificate-modified');

  // PDF without data
  await page.evaluate(() => { window.__cert.nextOpen = '/home/dj/Certificates/x.pdf'; });
  await page.click('#verify-drop');
  await page.waitForFunction(() => /no DeckChek data attached/.test(document.getElementById('verify-message')?.textContent || ''));
  check('cert AC-3: a PDF explains it carries only the printed hash and asks for the JSON', /\.deckchek-cert\.json/.test(await page.locator('#verify-message').innerText()));
  await page.keyboard.press('Escape');
  check('cert: Esc clears the verify result', await page.locator('#verify-result').isHidden());
  const audit = await a11yAudit(page);
  check('cert: verify screen controls are named', !audit.unnamed.length, audit.unnamed.slice(0, 3).join(' | '));

  // PDF failure -> HTML with identical hash
  await page.evaluate(() => { window.__cert.pdfFail = true; });
  await page.click('.rail-item[data-screen="certificate"]');
  await page.waitForSelector('#cert-sign:not([disabled])');
  await page.fill('#cert-serial', 'CRSS12-0042');
  await page.click('#cert-sign');
  await page.waitForFunction(() => window.__cert.stored.length === 2, null, { timeout: 15000 });
  const htmlPath = await page.evaluate(() => Object.keys(window.__cert.files).find(f => f.endsWith('.html')));
  check('cert AC-8: PDF failure writes an HTML certificate instead', !!htmlPath);
  await page.click('.rail-item[data-screen="verify"]');
  await page.evaluate(p => { window.__cert.nextOpen = p; }, htmlPath);
  await page.click('#verify-drop');
  await page.waitForFunction(() => /VALID/.test(document.getElementById('verify-badge')?.textContent || ''));
  const htmlHash = await page.locator('#verify-result dd').allInnerTexts();
  const hash2 = await page.evaluate(() => window.__cert.stored[0].contentHash);
  check('cert AC-8: the HTML file verifies with the identical content hash', htmlHash.includes(hash2));

  // flag off hides the UI
  await page.evaluate(async () => { const m = await import('/features.js'); m.setEnabled('certificates', false); });
  await page.waitForFunction(() => !document.querySelector('.rail-item[data-screen="verify"]'));
  check('cert: flag off hides both rail entries', (await page.locator('.rail-item[data-screen="certificate"]').count()) === 0);
  await context.close();

  // ---------------------------------------------------------------- browser mode
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await bctx.addInitScript(() => localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { certificates: true }, setupWizardDone: true })));
  const bpage = await bctx.newPage();
  errors.push(watchConsole(bpage, 'certificate-browser'));
  await bpage.goto(base);
  await bpage.click('.rail-item[data-screen="certificate"]');
  await bpage.waitForSelector('#cert-unsupported');
  check('cert browser mode: creation shows an explicit unsupported state', /desktop app/.test(await bpage.locator('#cert-unsupported').innerText()));
  await bpage.click('#cert-unsupported button');
  await bpage.waitForSelector('#verify-drop');
  const fixture = fs.readFileSync(path.join(ROOT, '..', 'tests/fixtures/certificate/valid-v1.deckchek-cert.json'));
  await bpage.setInputFiles('#verify-file', { name: 'unit.deckchek-cert.json', mimeType: 'application/json', buffer: fixture });
  await bpage.waitForSelector('#verify-badge');
  const badge = await bpage.locator('#verify-badge').innerText();
  check('cert browser mode: the Rust-signed fixture verifies (WebCrypto Ed25519, or hash-only UNVERIFIABLE if unsupported)', /VALID/.test(badge) && !/UNVERIFIABLE/.test(badge) || /content hash matches/.test(await bpage.locator('#verify-reasons').innerText()), badge);
  const tampered = Buffer.from(fixture.toString('utf8').replace('"0.05"', '"0.06"'));
  await bpage.setInputFiles('#verify-file', { name: 'unit.deckchek-cert.json', mimeType: 'application/json', buffer: tampered });
  await bpage.waitForFunction(() => /MODIFIED/.test(document.getElementById('verify-badge')?.textContent || ''));
  check('cert browser mode: a one-byte value edit is MODIFIED', /content hash mismatch/.test(await bpage.locator('#verify-reasons').innerText()));
  await bpage.setInputFiles('#verify-file', { name: 'broken.deckchek-cert.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"deckchek-certificate",') });
  await bpage.waitForFunction(() => /UNVERIFIABLE/.test(document.getElementById('verify-badge')?.textContent || ''));
  check('cert browser mode: a truncated file is UNVERIFIABLE, not an error', true);
  await bpage.setInputFiles('#verify-file', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') });
  await bpage.waitForFunction(() => /no DeckChek data attached/.test(document.getElementById('verify-message')?.textContent || ''));
  check('cert browser mode: PDF -> unsupported explanation', true);
  await shot(bpage, 'certificate-verify-browser');
  await bctx.close();
  return errors.flat();
}
