import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExport, serializeExport, parsePhoneRun, validatePhoneRun, exportHash, hashView, toQrFrames, joinQrFrames, looksLikeFrames,
  phoneRunToHistoryRun, describeDevice, MAX_BYTES, QR_SINGLE_MAX_BYTES, QR_FRAME_BYTES, QR_FRAME_MAX_BYTES, QR_MAX_FRAMES, FRAME_PREFIX,
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

test('QR framing preserves significant spaces at both sides of a frame boundary', () => {
  // First chunk ends in spaces and the next starts with spaces. Trimming either chunk corrupts the export.
  const json = JSON.stringify({ memo: 'x'.repeat(1084) + ' '.repeat(40) + 'y'.repeat(1000) });
  const frames = toQrFrames(json);
  assert.equal(frames.length, 2);
  assert.match(frames[0], / +$/);
  assert.match(frames[1].split('/').slice(4).join('/'), /^ +/);
  const joined = joinQrFrames([...frames].reverse().join('\n'));
  assert.equal(joined.ok, true, joined.error);
  assert.equal(joined.json, json);
  // Optional whitespace before a pasted prefix and Windows CRLF must remain accepted.
  assert.equal(joinQrFrames([' \t' + frames[0], frames[1]].join('\r\n')).json, json);
});

test('desktop import preserves a significant-space-ended frame pasted last', () => {
  const empty = serializeExport(make({ notes: '' }));
  const noteStart = empty.indexOf('"notes":"') + '"notes":"'.length;
  const prefixBytes = new TextEncoder().encode(empty.slice(0, noteStart)).length;
  const notes = 'x'.repeat(QR_FRAME_BYTES - prefixBytes - 2) + ' '.repeat(12) + 'y'.repeat(1300);
  const json = serializeExport(make({ notes }));
  const frames = toQrFrames(json);
  assert.ok(frames.length > 1);
  assert.match(frames[0], / {2}$/);
  const reversed = [...frames].reverse();
  assert.equal(joinQrFrames(reversed).json, json, 'the frame helper preserves the source payload');
  for (const pasted of [reversed.join('\n'), ' \t' + reversed.join('\r\n')]) {
    const parsed = parsePhoneRun(pasted);
    assert.equal(parsed.ok, true, parsed.errors.join('; '));
    assert.equal(parsed.hashOk, true);
    assert.equal(parsed.run.notes, notes);
  }
});

test('QR options are bounded before even a single plain-JSON result is returned', () => {
  assert.equal(QR_FRAME_BYTES, 1100);
  assert.equal(QR_FRAME_MAX_BYTES, 1977, 'the existing 2,000-byte QR policy reserves its maximum 23-byte header');
  for (const frameBytes of [0, -1, 1.5, NaN, Infinity, 1e30, QR_FRAME_MAX_BYTES + 1, '1100', null]) {
    assert.throws(() => toQrFrames('{}', { frameBytes }), RangeError);
  }
  assert.deepEqual(toQrFrames('{}', { frameBytes: 1 }), ['{}']);
  const json = JSON.stringify({ memo: '測'.repeat(900) });
  const frames = toQrFrames(json, { frameBytes: QR_FRAME_MAX_BYTES });
  assert.equal(joinQrFrames(frames).json, json);
  assert.ok(frames.every(frame => new TextEncoder().encode(frame).length <= QR_SINGLE_MAX_BYTES));
  assert.doesNotThrow(() => qrSvg(frames[0]));
});

test('framing preserves code points and refuses counts that the v1 headers cannot represent', () => {
  const json = JSON.stringify('x'.repeat(3 * QR_MAX_FRAMES - 2));
  const frames = toQrFrames(json, { frameBytes: 3 });
  assert.equal(frames.length, QR_MAX_FRAMES);
  assert.equal(joinQrFrames([...frames].reverse()).json, json);
  assert.throws(() => toQrFrames(JSON.stringify('x'.repeat(3 * QR_MAX_FRAMES - 1)), { frameBytes: 3 }), /more than 999/);
  // Four-byte code points cannot fit a three-byte chunk. Packing whole three-byte characters
  // into four-byte chunks also needs more frames than a byte-length quotient alone predicts.
  assert.throws(() => toQrFrames(JSON.stringify('🎛'.repeat(600)), { frameBytes: 3 }), /character exceeds/);
  assert.throws(() => toQrFrames(JSON.stringify('測'.repeat(1000)), { frameBytes: 4 }), /more than 999/);
  const unicode = JSON.stringify('🎛'.repeat(600));
  assert.equal(joinQrFrames(toQrFrames(unicode, { frameBytes: 4 })).json, unicode);
});

test('framed wire accounting includes CRLF and a final line ending without raising the 1 MB cap', () => {
  assert.equal(MAX_BYTES, 1_000_000);
  // With the unchanged 1,100-byte chunks, this fixture uses 889 headers and fills the wire budget exactly.
  const json = JSON.stringify('x'.repeat(977_881));
  const frames = toQrFrames(json);
  assert.equal(frames.length, 889);
  const wire = frames.join('\r\n') + '\r\n';
  assert.equal(new TextEncoder().encode(wire).length, MAX_BYTES);
  assert.equal(joinQrFrames(wire).json, json);
  assert.throws(() => toQrFrames(JSON.stringify('x'.repeat(977_882))), /QR transfer is larger than 1 MB/);
  assert.throws(() => toQrFrames('x'.repeat(MAX_BYTES + 1)), /export is larger than 1 MB/);
  assert.throws(() => toQrFrames('測'.repeat(Math.floor(MAX_BYTES / 3) + 1)), /export is larger than 1 MB/);
});

test('framed output must stay one frame per line while small plain JSON remains unchanged', () => {
  const small = '{\n  "memo": "small"\n}';
  assert.deepEqual(toQrFrames(small), [small]);
  const large = JSON.stringify({ memo: 'x'.repeat(2500) }, null, 2);
  assert.throws(() => toQrFrames(large), /compact JSON/);
  assert.throws(() => toQrFrames(large.replaceAll('\n', '\r\n')), /compact JSON/);
});

test('direct frame joining keeps result-style type errors and the complete raw input budget', () => {
  for (const input of [null, undefined, 7, {}, [null], ['text', 7]]) {
    const result = joinQrFrames(input);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
  }
  for (const input of [
    'x'.repeat(MAX_BYTES + 1),
    '測'.repeat(Math.floor(MAX_BYTES / 3) + 1),
    ['x'.repeat(MAX_BYTES / 2), 'x'.repeat(MAX_BYTES / 2)],
  ]) {
    assert.match(joinQrFrames(input).error, /larger than 1 MB/);
  }
  const json = serializeExport(make({ measurements: many }));
  const frames = toQrFrames(json);
  assert.equal(joinQrFrames([...frames].reverse().concat(frames[0])).json, json);
});

test('a production export populated to its field limits remains inside the default QR budget', () => {
  const exportObject = make({
    app: '測'.repeat(64),
    device: { userAgent: '測'.repeat(300), sampleRate: 384000,
      micFlags: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } },
    assetHint: { nickname: '測'.repeat(120), serial: '測'.repeat(80) },
    notes: '測'.repeat(2000),
    measurements: Array.from({ length: 200 }, (_, i) => meas({
      metricId: 'm'.repeat(61) + String(i).padStart(3, '0'), label: '測'.repeat(120), unit: '測'.repeat(24),
      origin: '測'.repeat(24), value: -0.12345678901234567, uncertainty: 0.12345678901234567,
      qualityFlags: Array.from({ length: 8 }, (_, j) => '測'.repeat(39) + j),
    })),
  });
  const json = serializeExport(exportObject);
  assert.equal(parsePhoneRun(json).ok, true);
  const frames = toQrFrames(json);
  assert.ok(frames.length > 1 && frames.length <= QR_MAX_FRAMES);
  assert.ok(frames.every(frame => new TextEncoder().encode(frame).length <= QR_SINGLE_MAX_BYTES));
  const wire = frames.join('\r\n') + '\r\n';
  assert.ok(new TextEncoder().encode(wire).length < MAX_BYTES);
  const parsed = parsePhoneRun(wire);
  assert.equal(parsed.ok, true, parsed.errors.join('; '));
  assert.equal(parsed.hashOk, true);
  assert.deepEqual(parsed.run.measurements.map(m => m.value), exportObject.measurements.map(m => m.value));
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
