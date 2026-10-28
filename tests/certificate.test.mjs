// FS-20 used-gear certificate engine (app/certificate.js): readiness, verdict/guard band/calibration rules,
// payload schema, strict parsing, verification (shared Rust-signed fixture, adversarial input), HTML/QR/export.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readiness, certificatePlan, buildCertificatePayload, certificateVerdict, guardBandDecision, limitsFromPass, expandedUncertainty,
  calibrationFor, toDecimal, isDecimal, validatePayload, parseStrictJson, extractJsonFromHtml, contentHash, assembleCertificateFile,
  verifyCertificateText, renderCertificateHtml, renderCertificateBody, certificateBaseName, qrText, certificateQrSvg, diffPayload,
  verifyBadge, embedJson, CertificateError, LIMITS, QR_PREFIX, DISCLAIMER, HTML_MARKER,
} from '../app/certificate.js';
import { exportCertificateFiles, joinPath, createCertificateApi } from '../app/certificate-api.js';
import { canonicalJson } from '../app/canonical-json.js';
import { qrMatrix } from '../app/vendor/qr.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = fs.readFileSync(path.join(root, 'tests/fixtures/certificate/valid-v1.deckchek-cert.json'), 'utf8');
const NOW = Date.parse('2026-10-28T12:00:00Z');

const profile = {
  id: 'pioneer-plx-crss12', manufacturer: 'Pioneer DJ', model: 'PLX-CRSS12', version: 3,
  tests: [
    { id: 't-driver', title: 'Driver present', method: 'driver:check', pass: { metricId: 'driver_present', op: 'equals', value: 1 } },
    { id: 't-speed', title: 'Platter speed', method: 'audio:speed', pass: { metricId: 'measured_pitch_percent', op: 'abs<=', value: 0.1, unit: '%' } },
    { id: 't-midi', title: 'MIDI coverage', method: 'midi:coverage', pass: null },
  ],
};
const res = (testId, status, measurements = [], createdAt = '2026-10-28T11:00:00Z') => ({ testId, profileId: profile.id, status, createdAt, detail: { summary: `${status} detail`, measurements } });
const allPass = (speed = 0.02, u = 0.01) => [
  res('t-driver', 'pass', [{ metricId: 'driver_present', value: 1, unit: 'bool' }]),
  res('t-speed', 'pass', [{ metricId: 'measured_pitch_percent', value: speed, unit: '%', uncertainty: u }]),
  res('t-midi', 'pass'),
];
const calProfile = { valid: true, createdAt: '2026-09-01T00:00:00Z', deviceName: 'Focusrite', sampleRate: 48000 };
const build = (over = {}) => buildCertificatePayload({ profile, results: allPass(), calibration: calProfile, tester: 'Alex', serial: 'SN1', now: new Date(NOW), deckchekVersion: '0.0.8', ...over });

// deterministic PRNG for property tests
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test('AC-1 readiness: lists missing tests, enables only when every required test has a result, flags stale results', () => {
  const r0 = readiness(profile, [], { now: NOW });
  assert.equal(r0.ready, false);
  assert.deepEqual(r0.missing.map(m => m.title), ['Driver present', 'Platter speed', 'MIDI coverage']);
  const partial = readiness(profile, allPass().slice(0, 2), { now: NOW });
  assert.equal(partial.done, 2); assert.equal(partial.total, 3); assert.equal(partial.ready, false);
  assert.deepEqual(partial.missing.map(m => m.testId), ['t-midi']);
  const full = readiness(profile, [...allPass(), res('t-midi', 'skipped', [], '2026-10-20T00:00:00Z')], { now: NOW });
  assert.equal(full.ready, true, 'skipped/unknown still count as a result; the verdict handles them');
  assert.deepEqual(full.stale, [], 'the newest result per test is used');
  const stale = readiness(profile, allPass().map(r => ({ ...r, createdAt: '2026-10-26T00:00:00Z' })), { now: NOW });
  assert.equal(stale.stale.length, 3);
  assert.equal(readiness({ id: 'x', tests: [] }, [], {}).ready, false, 'a profile without tests is not certificate-capable');
  const other = readiness(profile, allPass().map(r => ({ ...r, profileId: 'other' })), { now: NOW });
  assert.equal(other.done, 0, 'results of another profile do not count');
});

test('verdict matrix (spec §6): fail > review > pass, with the AC-6 downgrade', () => {
  const m = (decision, state = 'calibrated') => ({ decision, calibration: { state } });
  const P = { status: 'pass' };
  assert.equal(certificateVerdict([P, P], [m('inside')]), 'pass');
  assert.equal(certificateVerdict([P, { status: 'fail' }], [m('inside')]), 'fail');
  assert.equal(certificateVerdict([P], [m('outside')]), 'fail');
  assert.equal(certificateVerdict([P, { status: 'unknown' }], []), 'review');
  assert.equal(certificateVerdict([P, { status: 'skipped' }], []), 'review', 'skipped is never certified as pass');
  assert.equal(certificateVerdict([P], [m('ambiguous')]), 'review');
  assert.equal(certificateVerdict([], []), 'review');
  assert.equal(certificateVerdict([P], [m('inside', 'uncalibrated')]), 'pass_uncalibrated');
  assert.equal(certificateVerdict([P], [m('inside', 'expired')]), 'pass_uncalibrated');
  assert.equal(certificateVerdict([P], [m('no_limit', 'not_required')]), 'pass');
  assert.equal(certificateVerdict([{ status: 'fail' }], [m('inside', 'uncalibrated')]), 'fail', 'downgrade never hides a fail');
  // property: the verdict never reads "pass" when any result is not pass
  const r = rng(7), statuses = ['pass', 'fail', 'unknown', 'skipped'], decisions = ['inside', 'ambiguous', 'outside', 'no_limit'], states = ['calibrated', 'uncalibrated', 'expired', 'not_required'];
  for (let i = 0; i < 2000; i++) {
    const results = Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({ status: statuses[Math.floor(r() * 4)] }));
    const ms = Array.from({ length: Math.floor(r() * 4) }, () => m(decisions[Math.floor(r() * 4)], states[Math.floor(r() * 4)]));
    const v = certificateVerdict(results, ms);
    if (results.some(x => x.status === 'fail') || ms.some(x => x.decision === 'outside')) assert.equal(v, 'fail');
    else if (results.some(x => x.status !== 'pass') || ms.some(x => x.decision === 'ambiguous')) assert.equal(v, 'review');
    if (v === 'pass') assert.ok(ms.every(x => x.calibration.state === 'calibrated' || x.calibration.state === 'not_required'));
  }
});

test('guard band edge cases: |value - limit| <= U is ambiguous; beyond U is outside; no U means inclusive limits', () => {
  assert.equal(guardBandDecision(0.05, -0.1, 0.1, 0.02), 'inside');
  assert.equal(guardBandDecision(0.08, -0.1, 0.1, 0.02), 'ambiguous', 'exactly U from the limit (float-safe)');
  assert.equal(guardBandDecision(0.1, -0.1, 0.1, 0.02), 'ambiguous');
  assert.equal(guardBandDecision(0.12, -0.1, 0.1, 0.02), 'ambiguous', 'outside by exactly U');
  assert.equal(guardBandDecision(0.13, -0.1, 0.1, 0.02), 'outside');
  assert.equal(guardBandDecision(-0.13, -0.1, 0.1, 0.02), 'outside');
  assert.equal(guardBandDecision(0, 0, 0, null), 'inside', 'count == 0 with no uncertainty passes');
  assert.equal(guardBandDecision(1, 0, 0, null), 'outside');
  assert.equal(guardBandDecision(5, null, null, 1), 'no_limit');
  assert.equal(guardBandDecision(100, 100, null, 0), 'inside');
  assert.equal(guardBandDecision(NaN, 0, 1, 0), 'ambiguous');
  assert.deepEqual(limitsFromPass({ op: 'abs<=', value: 0.1 }), { low: -0.1, high: 0.1 });
  assert.deepEqual(limitsFromPass({ op: 'between', value: 5, value2: 1 }), { low: 1, high: 5 });
  assert.deepEqual(limitsFromPass({ op: 'equals', value: 'Serato' }), { low: null, high: null });
  assert.deepEqual(limitsFromPass({ op: 'all-seen' }), { low: 100, high: null });
  assert.deepEqual(limitsFromPass(null), { low: null, high: null });
  assert.equal(expandedUncertainty({ standardUncertainty: 0.01, uncertainty: 0.5 }), 0.02, 'k=2 on the engine standard uncertainty');
  assert.equal(expandedUncertainty({ uncertainty: { standard: 0.03, expanded: 0.06 } }), 0.06);
  assert.equal(expandedUncertainty({ uncertainty: 0.04 }), 0.04, 'stored uncertainty used as-is');
  assert.equal(expandedUncertainty({}), null);
});

test('AC-6 calibration: missing or older than its interval downgrades to "Pass (uncalibrated)" and is printed beside the value', () => {
  assert.equal(calibrationFor({ metricId: 'midi_controls_seen_percent' }, null).state, 'not_required');
  assert.equal(calibrationFor({ metricId: 'measured_pitch_percent' }, null).state, 'uncalibrated');
  assert.equal(calibrationFor({ metricId: 'measured_pitch_percent', calibrated: false }, calProfile, { now: NOW }).state, 'uncalibrated');
  assert.equal(calibrationFor({ metricId: 'measured_pitch_percent' }, calProfile, { now: NOW }).state, 'calibrated');
  assert.equal(calibrationFor({ metricId: 'measured_pitch_percent' }, { ...calProfile, createdAt: '2025-09-01T00:00:00Z' }, { now: NOW }).state, 'expired');
  assert.equal(calibrationFor({ metricId: 'measured_pitch_percent' }, { ...calProfile, createdAt: '2025-09-01T00:00:00Z' }, { now: NOW, intervalMonths: 24 }).state, 'calibrated', 'interval tunable');
  const good = build();
  assert.equal(good.verdict, 'pass');
  const uncal = build({ calibration: null });
  assert.equal(uncal.verdict, 'pass_uncalibrated');
  assert.match(renderCertificateBody({ payload: uncal }, { draft: true }), /Uncalibrated/);
  const expired = build({ calibration: { ...calProfile, createdAt: '2025-01-01T00:00:00Z' } });
  assert.equal(expired.verdict, 'pass_uncalibrated');
  assert.match(renderCertificateBody({ payload: expired }, { draft: true }), /Calibration expired/);
  assert.doesNotMatch(renderCertificateBody({ payload: expired }, { draft: true }), /Certified pass/);
});

test('toDecimal: fixed significant digits, no exponent, safe for the canonical form', () => {
  assert.equal(toDecimal(0.123456789), '0.123457');
  assert.equal(toDecimal(1234567.89), '1234570');
  assert.equal(toDecimal(-0), '0');
  assert.equal(toDecimal(1e-20), '0');
  assert.equal(toDecimal(3e-7), '0.0000003');
  assert.equal(toDecimal(33.333333), '33.3333');
  assert.equal(toDecimal(NaN), null);
  assert.equal(toDecimal(1e15), null);
  assert.equal(toDecimal('1'), null);
  const r = rng(11);
  for (let i = 0; i < 3000; i++) {
    const v = (r() - 0.5) * 10 ** Math.floor(r() * 30 - 15);
    const s = toDecimal(v);
    if (s === null) continue;
    assert.ok(isDecimal(s), `${v} -> ${s}`);
    assert.ok(Math.abs(Number(s) - v) <= Math.abs(v) * 1e-5 + 1e-12, `${v} -> ${s}`);
  }
});

test('buildCertificatePayload: schema-valid, decimal strings only, canonical, plan order, limits and photo caps', async () => {
  const p = build();
  assert.deepEqual(validatePayload(p), { ok: true, errors: [] });
  assert.equal(p.plan.profileVersion, 3);
  assert.deepEqual(p.plan.testIds, ['t-driver', 't-speed', 't-midi']);
  const speed = p.measurements.find(m => m.metricId === 'measured_pitch_percent');
  assert.deepEqual({ value: speed.value, uncertainty: speed.uncertainty, low: speed.referenceLow, high: speed.referenceHigh, decision: speed.decision }, { value: '0.02', uncertainty: '0.01', low: '-0.1', high: '0.1', decision: 'inside' });
  assert.equal(p.validUntil, '2027-01-26T12:00:00.000Z', 'default validity 90 days');
  assert.equal(build({ validDays: 30 }).validUntil.slice(0, 10), '2026-11-27');
  assert.equal(build({ validDays: 7 }).validUntil, p.validUntil, 'only 30/90/180 are offered');
  assert.equal(p.disclaimer, DISCLAIMER);
  canonicalJson(p); // no floats anywhere
  assert.match(await contentHash(p), /^[0-9a-f]{64}$/);
  assert.throws(() => build({ serial: '  ' }), e => e instanceof CertificateError && e.code === 'schema' && /serial/.test(e.message));
  assert.throws(() => build({ tester: '' }), CertificateError);
  const photo = { name: 'front.jpg', sha256: 'a'.repeat(64), dataB64: '/9j/4AAQ' };
  assert.equal(build({ photos: Array(6).fill(photo) }).unit.photos.length, 6);
  assert.throws(() => build({ photos: Array(7).fill(photo) }), /at most 6|more than 6/);
  assert.throws(() => build({ photos: [{ ...photo, dataB64: 'not base64!' }] }), CertificateError);
  assert.throws(() => build({ photos: [{ ...photo, sha256: 'xyz' }] }), CertificateError);
  const failing = build({ results: [res('t-driver', 'pass'), res('t-speed', 'pass', [{ metricId: 'measured_pitch_percent', value: 0.5, uncertainty: 0.01 }]), res('t-midi', 'pass')] });
  assert.equal(failing.verdict, 'fail', 'a value beyond the limit by more than U fails even if the test said pass');
  const draftish = build({ results: allPass().slice(0, 2) });
  assert.equal(draftish.results[2].status, 'unknown'); assert.equal(draftish.results[2].detail, 'Not tested.'); assert.equal(draftish.verdict, 'review');
});

test('validatePayload rejects wrong types, unknown fields, floats and drafts (same rules as certificate.rs)', () => {
  const base = build();
  const bad = [
    p => { p.extra = 1; }, p => { p.verdict = 'draft'; }, p => { p.schemaVersion = 2; }, p => { p.measurements[0].value = 0.5; },
    p => { p.measurements[0].value = '1e5'; }, p => { p.unit.serial = 5; }, p => { p.issuedAt = '2026-10-28'; }, p => { p.validUntil = p.issuedAt; },
    p => { p.results[0].status = 'great'; }, p => { p.plan.testIds = 'x'; }, p => { delete p.tester; }, p => { p.measurements[0].calibration.state = 'ok'; },
    p => { p.unit.model = 'x'.repeat(201); }, p => { p.plan.profileVersion = 1.5; },
  ];
  for (const [i, mutate] of bad.entries()) {
    const p = structuredClone(base); mutate(p);
    assert.equal(validatePayload(p).ok, false, `case ${i}`);
  }
  assert.equal(validatePayload(null).ok, false);
});

test('parseStrictJson: caps size and depth, rejects duplicate keys, lone surrogates, overflow and trailing data', () => {
  assert.deepEqual(parseStrictJson('{"a":[1,2,{"b":null}],"c":"\\u00e9"}'), { a: [1, 2, { b: null }], c: 'é' });
  const throwsCode = (text, code) => assert.throws(() => parseStrictJson(text), e => e instanceof CertificateError && e.code === code, `${text.slice(0, 40)} -> ${code}`);
  throwsCode('{"a":1,"a":2}', 'duplicate_key');
  throwsCode(`${'['.repeat(33)}${']'.repeat(33)}`, 'too_deep');
  assert.ok(parseStrictJson(`${'['.repeat(32)}${']'.repeat(32)}`));
  throwsCode('['.repeat(100000), 'too_deep');
  throwsCode('"\\ud800"', 'invalid_json');
  throwsCode('1e400', 'invalid_json');
  throwsCode('{} {}', 'invalid_json');
  throwsCode('{"a":1,}', 'invalid_json');
  throwsCode('"a\u0001"', 'invalid_json');
  throwsCode(' '.repeat(LIMITS.maxJsonBytes + 1), 'too_large');
  const proto = parseStrictJson('{"__proto__":{"polluted":1}}');
  assert.equal(Object.getPrototypeOf(proto), Object.prototype, '__proto__ is an own key, never the prototype');
  assert.equal(({}).polluted, undefined);
  assert.deepEqual(Object.keys(proto), ['__proto__']);
});

test('AC-3 cross-language: the Rust-signed fixture verifies VALID in JS (WebCrypto Ed25519) with the same hash', async () => {
  const r = await verifyCertificateText(FIXTURE, { now: NOW });
  assert.equal(r.status, 'valid', r.reasons.join('; '));
  assert.equal(r.contentHash, JSON.parse(FIXTURE).integrity.contentHash);
  assert.equal(r.fingerprint, '3097e2dee2cb4a34');
  assert.equal(r.expired, false);
  assert.equal(r.serial, 'SN <001> & "x"');
  assert.deepEqual(verifyBadge(r), { status: 'valid', icon: '✓', label: 'VALID', expired: false });
  const local = await verifyCertificateText(FIXTURE, { now: NOW, isLocal: fp => fp === '3097e2dee2cb4a34' });
  assert.equal(local.issuedByThisInstall, true);
});

test('AC-4 property: every one-byte edit inside the payload is never VALID; parseable value edits are MODIFIED "content hash mismatch"', async () => {
  const text = FIXTURE;
  const start = text.indexOf('"payload"') + 12, end = text.lastIndexOf('"version"');
  let modified = 0;
  const r = rng(42);
  for (let n = 0; n < 400; n++) {
    const i = start + Math.floor(r() * (end - start));
    const c = text[i];
    if (!/[A-Za-z0-9]/.test(c)) continue;
    const swapped = /[0-9]/.test(c) ? String((Number(c) + 1) % 10) : c === 'x' ? 'y' : 'x';
    const t = text.slice(0, i) + swapped + text.slice(i + 1);
    const rep = await verifyCertificateText(t, { now: NOW });
    assert.notEqual(rep.status, 'valid', `offset ${i}`);
    if (rep.status === 'modified') { assert.equal(rep.reasons[0], 'content hash mismatch'); modified++; }
  }
  assert.ok(modified > 150, `${modified} modified`);
  const edited = await verifyCertificateText(FIXTURE.replace('"0.05"', '"0.06"'), { now: NOW });
  assert.deepEqual([edited.status, edited.reasons[0]], ['modified', 'content hash mismatch']);
  assert.notEqual(edited.contentHash, edited.declaredHash);
});

test('AC-5: past validUntil the certificate stays VALID with a separate EXPIRED flag', async () => {
  const r = await verifyCertificateText(FIXTURE, { now: Date.parse('2100-01-01T00:00:00Z') });
  assert.equal(r.status, 'valid');
  assert.equal(r.expired, true);
  assert.deepEqual(verifyBadge(r), { status: 'valid', icon: '✓', label: 'VALID', expired: true });
});

test('adversarial files never verify and never throw (same statuses as certificate.rs)', async () => {
  const good = JSON.parse(FIXTURE), text = JSON.stringify(good);
  const edit = f => { const v = structuredClone(good); f(v); return JSON.stringify(v); };
  const otherKey = 'iojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1w='; // RFC 8032 test 2 public key
  const cases = [
    ['truncated', text.slice(0, text.length / 2), 'unverifiable'],
    ['empty', '', 'unverifiable'],
    ['not json', 'hello', 'unverifiable'],
    ['array root', '[1,2]', 'unverifiable'],
    ['not a string', 42, 'unverifiable'],
    ['trailing data', `${text} {}`, 'unverifiable'],
    ['wrong format', text.replace('deckchek-certificate', 'other-format'), 'unverifiable'],
    ['future version', text.replace('"version":1', '"version":2'), 'unverifiable'],
    ['version as string', text.replace('"version":1', '"version":"1"'), 'unverifiable'],
    ['huge number', text.replace('"schemaVersion":1', '"schemaVersion":1e400'), 'unverifiable'],
    ['unsafe integer', text.replace('"schemaVersion":1', '"schemaVersion":99999999999999999999'), 'modified'],
    ['float in payload', text.replace('"profileVersion":3', '"profileVersion":3.5'), 'modified'],
    ['wrong type in payload', text.replace('"tester":"Alex Tester"', '"tester":["Alex"]'), 'modified'],
    ['payload not object', edit(v => { v.payload = 'x'; }), 'modified'],
    ['missing signature', edit(v => { delete v.integrity.signature; }), 'unverifiable'],
    ['empty signature', edit(v => { v.integrity.signature = ''; }), 'unverifiable'],
    ['no integrity (draft)', edit(v => { delete v.integrity; }), 'unverifiable'],
    ['no payload', edit(v => { delete v.payload; }), 'unverifiable'],
    ['integrity wrong type', edit(v => { v.integrity = [1]; }), 'unverifiable'],
    ['unknown alg', edit(v => { v.integrity.alg = 'rsa'; }), 'unverifiable'],
    ['hash wrong length', edit(v => { v.integrity.contentHash = 'abc'; }), 'unverifiable'],
    ['unknown top-level key', edit(v => { v.extra = 1; }), 'unverifiable'],
    ['duplicate key', text.replace('{"format"', '{"format":"x","format"'), 'unverifiable'],
    ['too deep', `${'['.repeat(40)}${']'.repeat(40)}`, 'unverifiable'],
    ['garbage signature', edit(v => { v.integrity.signature = '!!!'; }), 'modified'],
    ['bad public key', edit(v => { v.integrity.publicKey = 'AAAA'; }), 'modified'],
    ['fingerprint mismatch', edit(v => { v.integrity.fingerprint = '0123456789abcdef'; }), 'modified'],
    ['lone surrogate', text.replace('Alex Tester', '\\ud800'), 'unverifiable'],
  ];
  for (const [name, t, want] of cases) {
    const r = await verifyCertificateText(t, { now: NOW });
    assert.equal(r.status, want, `${name}: ${r.reasons}`);
    assert.ok(r.reasons.length > 0, name);
  }
  // wrong key with a consistent fingerprint: only the signature check can catch it
  const { sha256Hex } = await import('../app/sha256.js');
  const pk = Uint8Array.from(atob(otherKey), c => c.charCodeAt(0));
  const wrong = edit(v => { v.integrity.publicKey = otherKey; });
  const fp = (await sha256Hex(pk)).slice(0, 16);
  const r = await verifyCertificateText(wrong.replace(good.integrity.fingerprint, fp), { now: NOW });
  assert.equal(r.status, 'modified');
  assert.match(r.reasons[0], /signature does not match/);
});

test('signature cannot be checked here -> UNVERIFIABLE (hash still compared); re-signed garbage is UNVERIFIABLE', async () => {
  const r = await verifyCertificateText(FIXTURE, { now: NOW, verifySignature: async () => null });
  assert.equal(r.status, 'unverifiable');
  assert.match(r.reasons[0], /content hash matches/);
  const mismatch = await verifyCertificateText(FIXTURE.replace('"0.05"', '"0.06"'), { verifySignature: async () => null });
  assert.equal(mismatch.status, 'modified', 'tampering is still detected without Ed25519');
  // a payload that breaks schema v1 but carries a "valid" signature
  const v = JSON.parse(FIXTURE); v.payload.verdict = 'excellent'; v.integrity.contentHash = await contentHash(v.payload);
  const g = await verifyCertificateText(JSON.stringify(v), { verifySignature: async () => true });
  assert.equal(g.status, 'unverifiable');
  assert.match(g.reasons[0], /schema v1/);
  const thrown = await verifyCertificateText(FIXTURE, { verifySignature: async () => { throw new Error('boom'); } });
  assert.equal(thrown.status, 'unverifiable', 'never throws');
});

test('non-canonical but equal JSON (pretty, reordered, 1.0) still verifies', async () => {
  const v = JSON.parse(FIXTURE);
  const reordered = { integrity: v.integrity, version: v.version, payload: Object.fromEntries(Object.entries(v.payload).reverse()), format: v.format };
  const text = JSON.stringify(reordered, null, 4).replace('"schemaVersion": 1', '"schemaVersion": 1.0');
  assert.equal((await verifyCertificateText(text, { now: NOW })).status, 'valid');
});

test('AC-8: HTML fallback embeds the identical signed JSON (same content hash) and escapes everything', async () => {
  const file = JSON.parse(FIXTURE);
  const html = renderCertificateHtml(file);
  const fromHtml = extractJsonFromHtml(html);
  const a = await verifyCertificateText(fromHtml, { now: NOW }), b = await verifyCertificateText(FIXTURE, { now: NOW });
  assert.equal(a.status, 'valid');
  assert.equal(a.contentHash, b.contentHash);
  assert.ok(!html.includes('SN <001>'), 'serial escaped in markup');
  assert.ok(html.includes('SN &lt;001&gt; &amp; &quot;x&quot;'));
  assert.equal(html.split('</script>').length, 2, 'the embedded JSON cannot close its script block');
  const hostile = structuredClone(file); hostile.payload.unit.notes = '</script><script>alert(1)</script>\u2028';
  const embedded = embedJson(hostile);
  assert.ok(!embedded.includes('<') && !embedded.includes('\u2028'));
  assert.deepEqual(JSON.parse(embedded), hostile);
  assert.ok(html.includes(file.integrity.contentHash) && html.includes(DISCLAIMER.slice(0, 40)));
  assert.match(html, /alt="Photo 1 of the unit: front\.jpg"/);
  assert.throws(() => extractJsonFromHtml('<html>no data</html>'), e => e.code === 'no_certificate_data');
  assert.equal(extractJsonFromHtml(`${HTML_MARKER}  {"a":1}  </script>`), '{"a":1}');
  const draft = renderCertificateHtml(assembleCertificateFile(build()), { draft: true });
  assert.match(draft, /DRAFT/);
  assert.equal((await verifyCertificateText(extractJsonFromHtml(draft))).status, 'unverifiable', 'drafts are unsigned');
});

test('AC-8 export flow: PDF failure writes an HTML file with the identical hash; success writes PDF + JSON', async () => {
  const file = JSON.parse(FIXTURE), written = [];
  const api = { writeFolder: async (dir, files, exts) => { written.push(...files.map(f => ({ dir, ...f, exts }))); return { written: files.length }; }, renderPdf: async () => { throw { code: 'unsupported', message: 'WebView2 PrintToPdf unavailable' }; } };
  const out = await exportCertificateFiles({ api, dir: 'C:\\Users\\Ann\\Certs', file, pdfHtml: '<html></html>' });
  assert.equal(out.pdfPath, null);
  assert.equal(out.pdfError.code, 'unsupported');
  assert.match(out.jsonPath, /^C:\\Users\\Ann\\Certs\\Pioneer_DJ_PLX-CRSS12-SN__001_____x_-2026-10-01\.deckchek-cert\.json$/);
  assert.match(out.htmlPath, /\.html$/);
  const html = written.find(f => f.relPath.endsWith('.html'));
  assert.deepEqual(html.exts, ['html']);
  const json = written.find(f => f.relPath.endsWith('.json'));
  const [h1, h2] = await Promise.all([verifyCertificateText(extractJsonFromHtml(html.text), { now: NOW }), verifyCertificateText(json.text, { now: NOW })]);
  assert.equal(h1.status, 'valid'); assert.equal(h1.contentHash, h2.contentHash);
  const ok = await exportCertificateFiles({ api: { writeFolder: async () => ({}), renderPdf: async (_h, p) => ({ path: p }) }, dir: '/home/ann/certs/', file, pdfHtml: '<html></html>' });
  assert.equal(ok.pdfPath, '/home/ann/certs/Pioneer_DJ_PLX-CRSS12-SN__001_____x_-2026-10-01.pdf');
  assert.equal(ok.htmlPath, null);
  assert.equal(joinPath('/a/b', 'c.json'), '/a/b/c.json');
});

test('AC-7: QR text is deckchek:cert:v1:<sha256-hex> with nothing personal, and encodes as a QR symbol', async () => {
  const file = JSON.parse(FIXTURE);
  const text = qrText(file.integrity.contentHash);
  assert.match(text, /^deckchek:cert:v1:[0-9a-f]{64}$/);
  assert.equal(text.length, QR_PREFIX.length + 64);
  for (const personal of [file.payload.unit.serial, file.payload.tester, file.payload.unit.model]) assert.ok(!text.includes(personal));
  const m = qrMatrix(text, { ecc: 'L' });
  assert.equal(m.length, 37, 'version 5-L (81 bytes) — the spec\'s 71 chars / 4-L miscounts the 17-char prefix');
  const svg = certificateQrSvg(file.integrity.contentHash);
  assert.match(svg, /^<svg[^>]+role="img"/);
  assert.ok(renderCertificateHtml(file).includes(svg), 'the printed certificate carries the QR');
});

test('file name: model-serial-date with unsafe characters replaced (spec §7)', () => {
  assert.equal(certificateBaseName({ unit: { model: 'Pioneer DJ PLX/CRSS12', serial: '..\\..\\evil' }, issuedAt: '2026-10-01T00:00:00Z' }), 'Pioneer_DJ_PLX_CRSS12-evil-2026-10-01');
  assert.equal(certificateBaseName({}), 'unit-unit-undated');
});

test('diffPayload names the changed sections for a MODIFIED file', () => {
  const a = build(), b = structuredClone(a);
  b.unit.serial = 'SN2'; b.measurements[1].value = '0.03';
  assert.deepEqual(diffPayload(a, b), ['payload.measurements[1].value', 'payload.unit.serial']);
  assert.deepEqual(diffPayload(a, structuredClone(a)), []);
});

test('certificate api bridge passes exactly the Rust argument names; browser mode rejects clearly', async () => {
  const calls = [];
  const api = createCertificateApi({ invoke: async (cmd, args) => { calls.push([cmd, args]); return null; } });
  await api.identity(); await api.newIdentity(); await api.sign({ a: 1 }); await api.verify('{}'); await api.extract('/x.json');
  await api.store({ assetId: 'a', profileId: 'p', fileJson: '{}' }); await api.list(); await api.get('id');
  assert.deepEqual(calls, [
    ['signing_get_identity', undefined], ['signing_create_identity', { confirm: true }], ['certificate_sign', { payload: { a: 1 } }],
    ['certificate_verify', { json: '{}' }], ['certificate_extract_json', { path: '/x.json' }],
    ['certificate_store', { record: { assetId: 'a', profileId: 'p', fileJson: '{}' } }], ['certificate_list', { assetId: null }], ['certificate_get', { id: 'id' }],
  ]);
  const browser = createCertificateApi({ invoke: null });
  assert.equal(browser.native, false);
  await assert.rejects(browser.sign({}), /desktop app/);
});

test('certificate plan uses every profile test; certificatePlan tolerates junk', () => {
  assert.deepEqual(certificatePlan(profile).tests.map(t => t.id), ['t-driver', 't-speed', 't-midi']);
  assert.deepEqual(certificatePlan(null), { profileId: '', profileVersion: 1, model: '', tests: [] });
  assert.equal(certificatePlan({ id: 'x', tests: [null, { id: '' }, { id: 'ok' }] }).tests.length, 1);
});
