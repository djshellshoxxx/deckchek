import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExport, serializeExport, parsePhoneRun, validatePhoneRun, exportHash, hashView, toQrFrames, joinQrFrames, looksLikeFrames,
  phoneRunToHistoryRun, describeDevice, MAX_BYTES, QR_SINGLE_MAX_BYTES, FRAME_PREFIX,
} from '../app/phone-run.js';
import { qrSvg } from '../app/vendor/qr.js';

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';
const meas = (over = {}) => ({ metricId: 'speed.pitchPercent', label: 'Pitch', value: 0.12, unit: '%', origin: 'measured', confidence: 0.8, uncertainty: 0.3, ...over });
const make = (over = {}) => buildExport({ createdAt: '2026-10-14T09:30:00Z', device: { userAgent: UA, sampleRate: 48000, micFlags: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }, assetHint: { nickname: 'SL-1200MK4 #1', serial: null }, measurements: [meas(), meas({ metricId: 'speed.rpm', label: 'Speed', value: 33.373, unit: 'rpm', uncertainty: 0.02 })], notes: 'on the plinth', ...over });
const many = Array.from({ length: 40 }, (_, i) => meas({ metricId: `speed.m${i}`, label: `Metric number ${i} with a long label`, value: i + 0.123456789 }));

test('export round-trip: parse returns the same measurements and a matching hash', () => {
  const exp = make();
  const text = serializeExport(exp);
  const parsed = parsePhoneRun(text);
  assert.equal(parsed.ok, true, parsed.errors.join('; '));
  assert.equal(parsed.hashOk, true);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.run.measurements.length, 2);
  assert.equal(parsed.run.measurements[1].value, 33.373);
  assert.equal(parsed.run.device.micFlags.autoGainControl, false);
  assert.equal(parsed.run.assetHint.nickname, 'SL-1200MK4 #1');
  assert.equal(exp.sha256, exportHash(JSON.parse(text)));
});

test('hash is stable under key order and fractional numbers are hashed as decimal strings', () => {
  assert.deepEqual(hashView({ a: 0.5, b: [1, 2.25], c: 'x' }), { a: '0.5', b: [1, '2.25'], c: 'x' });
  const exp = make();
  const shuffled = Object.fromEntries(Object.entries(exp).reverse());
  assert.equal(exportHash(shuffled), exp.sha256);
});

test('tampering changes the hash: a warning, not a block', () => {
  const exp = make();
  const edited = JSON.parse(serializeExport(exp));
  edited.measurements[0].value = 0.9;
  const parsed = parsePhoneRun(JSON.stringify(edited));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.hashOk, false);
  assert.match(parsed.warnings[0], /hash does not match/);
  const noHash = JSON.parse(serializeExport(exp));
  delete noHash.sha256;
  const p2 = parsePhoneRun(JSON.stringify(noHash));
  assert.equal(p2.ok, true);
  assert.equal(p2.hashOk, null);
  assert.match(p2.warnings[0], /no hash/);
});

test('validator rejects unknown versions, wrong format, NaN/Infinity and oversize input', () => {
  const base = JSON.parse(serializeExport(make()));
  const newer = parsePhoneRun(JSON.stringify({ ...base, version: 2 }));
  assert.equal(newer.ok, false);
  assert.match(newer.errors[0], /newer DeckChek Mobile/);
  assert.equal(parsePhoneRun(JSON.stringify({ ...base, version: 0 })).ok, false);
  assert.equal(parsePhoneRun(JSON.stringify({ ...base, format: 'other' })).ok, false);
  for (const bad of [null, 'x', Infinity, NaN]) {
    const m = { ...base, measurements: [{ ...base.measurements[0], value: bad }] };
    assert.equal(validatePhoneRun(m).ok, false, String(bad));
  }
  // JSON text cannot carry NaN; a 1e999 literal parses to Infinity
  assert.equal(parsePhoneRun(serializeExport(make()).replace('"value":0.12', '"value":1e999')).ok, false);
  assert.equal(validatePhoneRun({ ...base, measurements: [] }).ok, false);
  assert.equal(validatePhoneRun({ ...base, measurements: [{ ...base.measurements[0], confidence: 2 }] }).ok, false);
  assert.equal(validatePhoneRun({ ...base, measurements: [{ ...base.measurements[0], metricId: '<script>' }] }).ok, false);
  assert.equal(validatePhoneRun({ ...base, notes: 'x'.repeat(2001) }).ok, false);
  assert.equal(validatePhoneRun({ ...base, createdAt: 'yesterday' }).ok, false);
  const big = parsePhoneRun(' '.repeat(MAX_BYTES + 10) + serializeExport(make()) + ' ');
  assert.equal(big.ok, false);
  assert.match(big.errors[0], /larger than 1 MB/);
  assert.equal(parsePhoneRun('{not json').ok, false);
  assert.equal(parsePhoneRun('').ok, false);
  assert.equal(parsePhoneRun(null).ok, false);
});

test('parse drops unknown fields and never returns the input objects', () => {
  const base = JSON.parse(serializeExport(make()));
  base.evil = JSON.parse('{"__proto__":{"polluted":true}}');
  base.measurements[0].extra = 'x';
  const p = parsePhoneRun(JSON.stringify(base));
  assert.equal(p.ok, true);
  assert.equal(p.run.evil, undefined);
  assert.equal(p.run.measurements[0].extra, undefined);
  assert.equal({}.polluted, undefined);
});

test('small exports are one plain-JSON QR; large ones split into frames that reassemble in any order', () => {
  const small = serializeExport(make());
  assert.ok(small.length < QR_SINGLE_MAX_BYTES);
  assert.deepEqual(toQrFrames(small), [small]);
  const big = serializeExport(make({ measurements: many, notes: 'é'.repeat(300) }));
  assert.ok(new TextEncoder().encode(big).length > QR_SINGLE_MAX_BYTES);
  const frames = toQrFrames(big);
  assert.ok(frames.length >= 2);
  assert.ok(frames.every(f => f.startsWith(`${FRAME_PREFIX}/`)));
  for (const f of frames) {
    assert.ok(new TextEncoder().encode(f).length < 1300);
    assert.doesNotThrow(() => qrSvg(f)); // each frame fits one QR
  }
  const shuffled = [...frames].reverse();
  assert.equal(joinQrFrames(shuffled).json, big);
  const parsed = parsePhoneRun(`${shuffled.join('\r\n')}\n${frames[0]}`); // pasted reversed, one repeated
  assert.equal(parsed.ok, true, parsed.errors.join('; '));
  assert.equal(parsed.hashOk, true);
  assert.equal(parsed.run.measurements.length, 40);
  assert.ok(looksLikeFrames(frames.join('\n')));
});

test('frame errors are specific: missing frame, mixed exports, damaged frame', () => {
  const a = toQrFrames(serializeExport(make({ measurements: many })));
  const b = toQrFrames(serializeExport(make({ measurements: many, notes: 'other' })));
  assert.match(joinQrFrames(a.slice(1)).error, /Missing frame 1 of/);
  assert.match(joinQrFrames([a[0], b[1]]).error, /different exports/);
  const damaged = [...a];
  damaged[1] = damaged[1].replace(/.$/, c => (c === 'x' ? 'y' : 'x'));
  assert.match(joinQrFrames(damaged).error, /damaged/);
  assert.match(joinQrFrames('hello').error, /not a DeckChek Mobile QR frame/);
  assert.equal(joinQrFrames('').ok, false);
});

test('history run: origin phone, tagged measurements, asset link, device label, no calibration', () => {
  const parsed = parsePhoneRun(serializeExport(make()));
  const run = phoneRunToHistoryRun(parsed, { assetId: 'asset-1', now: '2026-10-14T10:00:00Z' });
  assert.equal(run.origin, 'phone');
  assert.equal(run.sessionType, 'phone');
  assert.equal(run.assetId, 'asset-1');
  assert.equal(run.sourceDevice, 'Pixel 8 / Chrome / 48000 Hz');
  assert.ok(run.id.startsWith('phone-'));
  assert.ok(run.measurements.every(m => m.origin === 'phone' && m.qualityFlags.includes('uncalibrated')));
  assert.equal(run.phone.hashOk, true);
  assert.equal(run.calibration, undefined);
  assert.throws(() => phoneRunToHistoryRun({ ok: false }), /successful parse/);
  assert.equal(describeDevice({ device: {} }), 'Phone');
});

test('buildExport applies limits and drops unknown fields', () => {
  const exp = buildExport({ measurements: [{ ...meas(), junk: 1, label: 'x'.repeat(500) }], notes: 'n'.repeat(5000), device: { userAgent: 'u'.repeat(1000), extra: 1 } });
  assert.equal(exp.measurements[0].junk, undefined);
  assert.ok(exp.measurements[0].label.length <= 120);
  assert.ok(exp.notes.length <= 2000);
  assert.ok(exp.device.userAgent.length <= 300);
  assert.equal(parsePhoneRun(serializeExport(exp)).ok, true);
});
