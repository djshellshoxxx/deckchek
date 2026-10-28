// FS-20 UI helpers that need no DOM: unit picker options, photo pre-checks, verify-file classification, printable kind.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const { unitOptions, photoProblem, buildPayloadAsMeasured } = await import('../app/ui/screens/certificate.js');
const { classifyFile, findStoredOriginal } = await import('../app/ui/screens/verify.js');
const { composePrintable } = await import('../app/report-pdf.js');
const { registerCertificateKind, CERTIFICATE_KIND } = await import('../app/report-kinds/certificate.js');
const fs = await import('node:fs');

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0, 0, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);

test('unit picker: one option per unit of a profile that has a test plan', () => {
  const profiles = [{ id: 'p1', manufacturer: 'Rane', model: 'Twelve MK2', tests: [{ id: 't' }] }, { id: 'p2', manufacturer: 'X', model: 'Empty', tests: [] }];
  const units = { p1: [{ id: 'a1', nickname: 'Left deck' }, { id: 'a2', nickname: 'Right deck' }], p2: [{ id: 'a3', nickname: 'Other' }] };
  assert.deepEqual(unitOptions(profiles, id => units[id] || []).map(o => [o.value, o.label]), [['p1::a1', 'Left deck — Rane Twelve MK2'], ['p1::a2', 'Right deck — Rane Twelve MK2']]);
});

test('photo pre-checks: PNG/JPEG only, 5 MB each, at most 6 (spec §3)', () => {
  assert.equal(photoProblem(JPEG, 1000, 0), null);
  assert.equal(photoProblem(PNG, 5 * 1024 * 1024, 5), null);
  assert.match(photoProblem(JPEG, 5 * 1024 * 1024 + 1, 0), /limit is 5 MB/);
  assert.match(photoProblem(WEBP, 1000, 0), /PNG or JPEG/);
  assert.match(photoProblem(new TextEncoder().encode('<svg onload=alert(1)>'), 10, 0), /PNG or JPEG/, 'magic bytes, not the file name');
  assert.match(photoProblem(JPEG, 1000, 6), /At most 6/);
});

test('AC-3 verify file classification: size checked before reading, PDFs never parsed', () => {
  assert.deepEqual(classifyFile('Deck-SN1.deckchek-cert.json', 1000), { kind: 'json' });
  assert.deepEqual(classifyFile('cert.HTML', 1000), { kind: 'html' });
  assert.deepEqual(classifyFile('cert.pdf', 10 ** 9), { kind: 'pdf' });
  assert.equal(classifyFile('big.json', 20 * 1024 * 1024 + 1).kind, 'reject');
  assert.equal(classifyFile('big.html', 48 * 1024 * 1024 + 1).kind, 'reject');
  assert.equal(classifyFile('cert.exe', 10).kind, 'reject');
  assert.equal(classifyFile(undefined, 0).kind, 'reject');
});

test('regression: verify diff only matches a stored record by content hash, never by the unverified fingerprint', () => {
  const H = n => String(n).repeat(64).slice(0, 64);
  const rows = [
    { id: 'c1', signingKeyId: 'fp-local', issuedAt: '2026-10-01T10:00:00Z', serialNumber: 'SN1', contentHash: H(1) },
    { id: 'c2', signingKeyId: 'fp-local', issuedAt: '2026-10-02T10:00:00Z', serialNumber: 'SN2', contentHash: H(2) },
  ];
  // MODIFIED file: the payload was edited, the hash written in the file is still that of the signed original
  assert.equal(findStoredOriginal(rows, { status: 'modified', fingerprint: 'fp-local', declaredHash: H(2), contentHash: H(9), issuedAt: 'x', serial: 'edited' })?.id, 'c2');
  // a forged file that copies this install's fingerprint plus a stored issue time / serial must not pick a record
  assert.equal(findStoredOriginal(rows, { status: 'modified', fingerprint: 'fp-local', declaredHash: H(7), contentHash: H(8), issuedAt: '2026-10-01T10:00:00Z', serial: 'SN1' }), null);
  assert.equal(findStoredOriginal(rows, { status: 'modified', fingerprint: 'fp-local', declaredHash: null, issuedAt: '2026-10-01T10:00:00Z', serial: 'SN1' }), null);
  // VALID: matched on its verified hash
  assert.equal(findStoredOriginal(rows, { status: 'valid', fingerprint: 'other', contentHash: H(1), declaredHash: H(1) })?.id, 'c1');
  assert.equal(findStoredOriginal(rows, { status: 'unverifiable', declaredHash: H(1) }), null, 'an unreadable file matches nothing');
  assert.equal(findStoredOriginal(null, { status: 'modified', declaredHash: H(1) }), null);
  assert.equal(findStoredOriginal(rows, { status: 'modified', declaredHash: 'not-hex' }), null);
});

test('contract tests/contracts/certificate.json: the JS bridge sends exactly the documented request fields', async () => {
  const { createCertificateApi } = await import('../app/certificate-api.js');
  const contract = JSON.parse(fs.readFileSync(new URL('./contracts/certificate.json', import.meta.url), 'utf8'));
  const sent = {};
  const api = createCertificateApi({ invoke: async (cmd, args) => { sent[cmd] = args ?? {}; return contract[cmd]?.response ?? null; } });
  const r = name => contract[name].request;
  await api.identity(); await api.newIdentity(); await api.sign(r('certificate_sign').payload); await api.verify(r('certificate_verify').json);
  await api.extract(r('certificate_extract_json').path); await api.store(r('certificate_store').record); await api.list(r('certificate_list').assetId); await api.get(r('certificate_get').id);
  for (const name of Object.keys(contract).filter(k => !k.startsWith('_'))) assert.deepEqual(sent[contract[name].command], r(name), name);
  const verifyKeys = Object.keys(contract.certificate_verify.response).sort();
  const { verifyCertificateText } = await import('../app/certificate.js');
  const js = await verifyCertificateText(fs.readFileSync(new URL('./fixtures/certificate/valid-v1.deckchek-cert.json', import.meta.url), 'utf8'), { now: Date.parse(contract.certificate_verify.now), isLocal: () => true });
  const { payload, ...rest } = js;
  assert.deepEqual(rest, contract.certificate_verify.response, 'the JS verifier returns the same report as Rust');
  assert.deepEqual(Object.keys(rest).sort(), verifyKeys);
});

test('printable kind "certificate": PDF carries hash, fingerprint, QR, disclaimer and no embedded script', () => {
  registerCertificateKind(); registerCertificateKind(); // idempotent
  const file = JSON.parse(fs.readFileSync(new URL('./fixtures/certificate/valid-v1.deckchek-cert.json', import.meta.url), 'utf8'));
  const out = composePrintable(CERTIFICATE_KIND, { file }, { css: '', now: new Date('2026-10-28T12:00:00Z') });
  assert.match(out.fileName, /Certificate/);
  for (const needle of [file.integrity.contentHash, '3097 e2de e2cb 4a34', 'role="img"', 'This certificate proves the report was not changed after signing', 'SN &lt;001&gt;']) assert.ok(out.html.includes(needle), needle);
  assert.ok(!/<script/i.test(out.html), 'scripts are stripped from the PDF');
  assert.match(out.html, /Certified pass/);
  const draft = composePrintable(CERTIFICATE_KIND, { file: { payload: file.payload }, draft: true }, { css: '' });
  assert.match(draft.html, /DRAFT/);
  assert.ok(!draft.html.includes(file.integrity.contentHash));
});

test('regression: AC-6 a stored device result keeps the run\'s calibrated flag through to the certificate', async () => {
  const { buildResultDetail } = await import('../app/devices/dispatch.js');
  const profile = { id: 'p1', manufacturer: 'X', model: 'Deck', version: 1, tests: [{ id: 't-speed', title: 'Speed', method: 'audio:speed', pass: { metricId: 'measured_pitch_percent', op: 'abs<=', value: 0.1, unit: '%' } }] };
  const current = { valid: true, createdAt: '2026-09-01T00:00:00Z', deviceName: 'Rig', sampleRate: 48000 };
  const result = flag => ({ testId: 't-speed', profileId: 'p1', status: 'pass', createdAt: '2026-10-20T10:00:00Z',
    detail: buildResultDetail({ test: profile.tests[0], outcome: { status: 'pass', detail: 'ok' }, measurements: [{ metricId: 'measured_pitch_percent', value: 0.01, unit: '%', calibrated: flag, uncertainty: { standard: 0.005, expanded: 0.01, k: 2 } }] }) });
  const args = r => ({ profile, results: [r], tester: 'A', serial: 'S', now: new Date('2026-10-28T12:00:00Z') });
  const cal = buildPayloadAsMeasured(args(result(true)), { current });
  assert.equal(cal.measurements[0].calibration.state, 'calibrated', 'measured calibrated with the profile active since before the run');
  assert.equal(cal.measurements[0].uncertainty, '0.01');
  assert.equal(cal.verdict, 'pass');
  assert.equal(buildPayloadAsMeasured(args(result(false)), { current }).measurements[0].calibration.state, 'uncalibrated');
});
