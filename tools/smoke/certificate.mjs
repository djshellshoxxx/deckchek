// FS-20 smoke: create a signed certificate from a mocked full plan (JSON + PDF written), verify it VALID, edit one
// byte and see MODIFIED "content hash mismatch" with the changed section, PDF without data, HTML fallback when the
// PDF fails (same hash), readiness blocking + draft, Esc, browser mode (unsupported create, JS verify), flag off.
// Regression checks (review fixes): AC-6 calibration as recorded at measurement time, focus kept on the unit picker,
// after removing a photo and after "Create new identity", typed form values surviving onShow, the verify token race,
// and the "issued by this install" note only on a VALID result.
import fs from 'node:fs';
import path from 'node:path';
import { watchConsole, tauriMock, a11yAudit } from './core.mjs';

const PROFILE = 'pioneer-plx-crss12';

// Runs in the page after tauriMock: certificate commands backed by the app's own engine with a fake signature
// (the real Ed25519 path is covered by Rust tests and the shared fixture).
function certMock() {
  const before = window.__TAURI__.core.invoke;
  const files = {}, stored = [];
  const state = { files, stored, nextOpen: null, pdfFail: false, seeded: false, signCalls: 0, identityFail: false, newIdentityFail: false, extractDelay: {} };
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
        // AC-6: speed-33 was measured with no calibration recorded; crss12-driver comes from a persisted run (get_run) whose
        // measurement is flagged 'calibrated'; crss12-driver-signed from a workspace run that recorded its profile date.
        const meas = t => (t.id === 'crss12-speed-33' ? [{ metricId: 'measured_pitch_percent', value: 0.012, unit: '%', uncertainty: 0.01 }]
          : t.id === 'crss12-driver' ? [{ metricId: 'rpm', value: 33.34, unit: 'rpm' }]
            : t.id === 'crss12-driver-signed' ? [{ metricId: 'quartz_rpm', value: 33.33, unit: 'rpm' }] : []);
        const runId = t => ({ 'crss12-driver': 'run-cal-db', 'crss12-driver-signed': 'run-cal-ws' })[t.id];
        p.tests.forEach((t, i) => db.deviceResults.push({ id: `seed-${i}`, assetId: 'asset-pioneer-plx-crss12', profileId: p.id, testId: t.id, status: 'pass', createdAt: new Date(t0 + i).toISOString(),
          detail: { summary: 'Pass (mock)', measurements: meas(t), ...(runId(t) ? { runId: runId(t) } : {}) } }));
        db.runs = db.runs.filter(r => r.id !== 'run-cal-db');
        db.runs.push({ id: 'run-cal-db', test: 'Speed', createdAt: new Date(t0).toISOString(), score: 90, findings: [], measurements: [{ metricId: 'rpm', value: 33.34, unit: 'rpm', qualityFlags: ['calibrated'] }] });
      }
      return out;
    }
    if (cmd === 'signing_get_identity' && state.identityFail) throw { code: 'key_corrupt', message: 'The signing key is corrupt (mock)' };
    if (cmd === 'signing_create_identity') {
      if (state.newIdentityFail) throw { code: 'io', message: 'Disk full (mock)' };
      state.identityFail = false;
      return { fingerprint: await fingerprint(), createdAt: '2026-10-01T00:00:00Z', publicKeyB64: b64(PK), protection: 'dpapi' };
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
      if (state.extractDelay[args.path]) await new Promise(r => setTimeout(r, state.extractDelay[args.path]));
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
  // AC-6 regression state: a calibration profile that is active now (created 2 h ago, before the seeded results) and a
  // workspace run that recorded the (older) profile its measurements were calibrated with.
  await context.addInitScript(() => {
    if (localStorage.getItem('deckchek.calibration.v1')) return;
    const DAY = 864e5;
    const profile = { version: 1, sampleRate: 48000, valid: true, issues: [], gainDb: { left: 0, right: 0 }, mismatchDb: 0, clockPpm: 0, latencyMs: 0, uncertainty: {}, deviceName: '', createdAt: new Date(Date.now() - 2 * 3600e3).toISOString() };
    localStorage.setItem('deckchek.calibration.v1', JSON.stringify({ 'default|48000': JSON.stringify(profile) }));
    const recordedAt = new Date(Date.now() - 30 * DAY).toISOString();
    const run = { id: 'run-cal-ws', workflow: 'turntable', sessionType: 'turntable', test: 'Speed', createdAt: new Date(Date.now() - 3600e3).toISOString(), sampleRate: 48000, channels: 2, score: 90, findings: [], evidence: [],
      measurements: [{ metricId: 'quartz_rpm', label: 'Quartz rpm', value: 33.33, unit: 'rpm', calibrated: true, qualityFlags: ['calibrated'] }],
      calibration: { applied: true, reasons: [], profileCreatedAt: recordedAt, deviceName: 'Loopback rig' } };
    localStorage.setItem('deckchek.workspace.v1', JSON.stringify({ version: 1, equipment: [], runs: [run] }));
    localStorage.setItem('deckchek.cal-recorded-at', recordedAt);
  });
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
  await page.focus('#cert-unit');
  await page.selectOption('#cert-unit', other);
  await page.waitForSelector('#cert-missing');
  check('regression: changing the Unit select keeps keyboard focus on the picker', await page.evaluate(() => document.activeElement?.id === 'cert-unit'));
  check('cert AC-1: missing tests are listed and signing is blocked', !(await page.locator('#cert-sign').isEnabled()) && (await page.locator('#cert-missing li').count()) > 0);
  check('cert: partial state offers an unsigned DRAFT export', await page.locator('#cert-draft').isVisible());
  await page.fill('#cert-serial', 'DRAFT-1'); await page.fill('#cert-tester', 'Alex');
  await page.click('#cert-preview');
  await page.waitForSelector('#cert-preview-card:not([hidden]) .dc-cert-draft');
  check('cert: preview shows the DRAFT watermark when unsigned', /DRAFT/.test(await page.locator('#cert-preview-card').innerText()));
  await page.keyboard.press('Escape');
  check('cert: Esc closes the preview', await page.locator('#cert-preview-card').isHidden());

  // typed values survive leaving and re-showing the screen
  await page.fill('#cert-firmware', 'FW 1.2.3'); await page.fill('#cert-notes', 'Light wear on the platter.');
  await page.click('#cert-go-verify');
  await page.waitForSelector('#verify-drop');
  await page.click('.rail-item[data-screen="certificate"]');
  await page.waitForSelector('#cert-form');
  const kept = await page.evaluate(() => ['serial', 'firmware', 'tester', 'notes'].map(k => document.getElementById(`cert-${k}`)?.value));
  check('regression: onShow keeps the typed serial, firmware, tester and notes', JSON.stringify(kept) === JSON.stringify(['DRAFT-1', 'FW 1.2.3', 'Alex', 'Light wear on the platter.']), JSON.stringify(kept));

  // removing a photo keeps keyboard focus in the list (then on "Add photos") and announces it
  await page.evaluate(async () => {
    const mk = async n => { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.fillStyle = n ? '#f00' : '#00f'; g.fillRect(0, 0, 8, 8); const b = await new Promise(r => c.toBlob(r, 'image/png')); return new File([b], `photo${n}.png`, { type: 'image/png' }); };
    const dt = new DataTransfer(); dt.items.add(await mk(0)); dt.items.add(await mk(1));
    const inp = document.getElementById('cert-photo-input'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
  });
  const twoPhotos = await page.waitForFunction(() => document.querySelectorAll('#cert-photo-list li').length === 2, null, { timeout: 10000 }).then(() => true, () => false);
  check('cert: two photos attached', twoPhotos);
  if (twoPhotos) {
    await page.focus('#cert-photo-list li:first-child button');
    await page.keyboard.press('Enter');
    const afterFirst = await page.evaluate(() => ({ label: document.activeElement?.getAttribute('aria-label') || document.activeElement?.id || document.activeElement?.tagName, status: document.getElementById('cert-status')?.textContent || '', left: document.querySelectorAll('#cert-photo-list li').length }));
    check('regression: removing a photo moves focus to the next Remove button and announces it', afterFirst.left === 1 && /^Remove photo/.test(afterFirst.label) && /Photo removed\. 1 attached/.test(afterFirst.status), JSON.stringify(afterFirst));
    await page.keyboard.press('Enter');
    const afterLast = await page.evaluate(() => ({ id: document.activeElement?.id, left: document.querySelectorAll('#cert-photo-list li').length }));
    check('regression: removing the last photo moves focus to "Add photos"', afterLast.left === 0 && afterLast.id === 'cert-add-photo', JSON.stringify(afterLast));
  }

  // "Create new identity": focus is not lost; a failure is announced
  await page.evaluate(() => { window.__cert.identityFail = true; window.__cert.newIdentityFail = true; });
  await page.click('.rail-item[data-screen="verify"]');
  await page.click('.rail-item[data-screen="certificate"]');
  await page.waitForSelector('#cert-new-identity');
  await page.focus('#cert-new-identity');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#confirm-dialog[open]');
  await page.click('#confirm-ok');
  await page.waitForFunction(() => /Disk full/.test(document.querySelector('#cert-identity')?.textContent || ''));
  const failState = await page.evaluate(() => ({ id: document.activeElement?.id, status: document.getElementById('cert-status')?.textContent || '' }));
  check('regression: a failed "Create new identity" keeps focus on the button and announces the error', failState.id === 'cert-new-identity' && /Disk full/.test(failState.status), JSON.stringify(failState));
  await page.evaluate(() => { window.__cert.newIdentityFail = false; });
  await page.focus('#cert-new-identity');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#confirm-dialog[open]');
  await page.click('#confirm-ok');
  await page.waitForSelector('#cert-fp');
  check('regression: after "Create new identity" focus moves to the new identity card', await page.evaluate(() => document.activeElement?.id === 'cert-identity'));

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
  const calOf = await page.evaluate(() => Object.fromEntries(JSON.parse(window.__cert.stored[0].fileJson).payload.measurements.map(m => [m.metricId, m.calibration])));
  const recordedAt = await page.evaluate(() => localStorage.getItem('deckchek.cal-recorded-at'));
  const activeNow = await page.evaluate(async () => (await import('/ui/state.js')).calibrationStatus().state);
  check('regression: AC-6 a calibration profile active only at certificate time does not make an unrecorded measurement Calibrated', activeNow === 'calibrated' && calOf.measured_pitch_percent?.state === 'uncalibrated', `${activeNow} ${JSON.stringify(calOf.measured_pitch_percent)}`);
  check('regression: AC-6 calibration date and reference come from the run that took the measurement', calOf.quartz_rpm?.state === 'calibrated' && calOf.quartz_rpm?.date === recordedAt && /^Loopback rig\|48000$/.test(calOf.quartz_rpm?.refId || ''), JSON.stringify(calOf.quartz_rpm));
  check('cert AC-6: a persisted run flagged calibrated (no recorded date) uses the earlier active profile', calOf.rpm?.state === 'calibrated', JSON.stringify(calOf.rpm));
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
  check('cert: a VALID certificate from this install says so', /issued by this DeckChek install/.test(await page.locator('#verify-result').innerText()));

  // mutate one byte -> MODIFIED
  await page.evaluate(p => { window.__cert.files[p] = window.__cert.files[p].replace('CRSS12 #0042', 'CRSS12 #0043'); }, jsonPath);
  await page.click('#verify-drop');
  await page.waitForFunction(() => /MODIFIED/.test(document.getElementById('verify-badge')?.textContent || ''));
  check('cert AC-4: one-byte edit -> MODIFIED naming "content hash mismatch"', /content hash mismatch/.test(await page.locator('#verify-reasons').innerText()));
  check('cert: MODIFIED shows the changed section against the stored original', /payload\.unit\.serial/.test(await page.locator('#verify-diff').innerText()));
  check('regression: a MODIFIED file does not claim it was issued by this install', !/issued by this DeckChek install/.test(await page.locator('#verify-result').innerText()));
  await shot(page, 'certificate-modified');

  // PDF without data
  await page.evaluate(() => { window.__cert.nextOpen = '/home/dj/Certificates/x.pdf'; });
  await page.click('#verify-drop');
  await page.waitForFunction(() => /no DeckChek data attached/.test(document.getElementById('verify-message')?.textContent || ''));
  check('cert AC-3: a PDF explains it carries only the printed hash and asks for the JSON', /\.deckchek-cert\.json/.test(await page.locator('#verify-message').innerText()));
  // an earlier, slower file must not replace the result of the file picked after it
  await page.evaluate(p => { window.__cert.extractDelay[p] = 700; window.__cert.nextOpen = p; }, jsonPath);
  await page.click('#verify-drop');
  await page.evaluate(() => { window.__cert.nextOpen = '/home/dj/Certificates/later.pdf'; });
  await page.click('#verify-drop');
  await page.waitForFunction(() => /no DeckChek data attached/.test(document.getElementById('verify-message')?.textContent || ''));
  await page.waitForTimeout(1200);
  check('regression: a slower earlier file does not overwrite the latest verify result', (await page.locator('#verify-message').count()) === 1 && (await page.locator('#verify-badge').count()) === 0);
  await page.evaluate(p => { delete window.__cert.extractDelay[p]; }, jsonPath);
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
