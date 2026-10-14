import test from 'node:test';
import assert from 'node:assert/strict';
import { exportRun, toQrFrames, fileName, deviceInfo, APP_ID, FILE_EXTENSION } from '../mobile/lib/export.js';
import { qrImages, svgToDataUri } from '../mobile/lib/qr.js';
import { parsePhoneRun, phoneRunToHistoryRun } from '../app/phone-run.js';
import * as vendorRun from '../mobile/vendor/phone-run.js';
import { measureSpeed } from '../mobile/lib/speed.js';
import { generateSine } from '../app/advanced.js';

const stored = (over = {}) => ({
  kind: 'speed', createdAt: '2026-10-14T09:30:00.000Z', notes: 'test',
  device: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0', sampleRate: 48000, micFlags: { echoCancellation: false, noiseSuppression: false, autoGainControl: null } },
  assetHint: { nickname: 'SL-1200MK4 #1', serial: null },
  measurements: measureSpeed(generateSine({ frequencyHz: 1005, sampleRate: 48000, durationSec: 3, amplitude: 0.3 }), 48000),
  ...over,
});

test('the phone and the desktop run the same format code', () => {
  assert.equal(typeof vendorRun.parsePhoneRun, 'function');
  assert.equal(vendorRun.FORMAT, 'deckchek-mobile');
});

test('export round-trip from a real speed measurement: desktop parse, matching hash, same numbers (AC-5, AC-6)', () => {
  const run = stored();
  const text = exportRun(run);
  const parsed = parsePhoneRun(text);
  assert.equal(parsed.ok, true, parsed.errors.join('; '));
  assert.equal(parsed.hashOk, true);
  assert.equal(parsed.run.app, APP_ID);
  assert.equal(parsed.run.measurements.length, run.measurements.length);
  for (const [i, m] of run.measurements.entries()) {
    assert.equal(parsed.run.measurements[i].metricId, m.metricId);
    assert.equal(parsed.run.measurements[i].value, m.value);
    assert.equal(parsed.run.measurements[i].uncertainty, m.uncertainty);
  }
  assert.deepEqual(parsed.run.device.micFlags, { echoCancellation: false, noiseSuppression: false });
  const history = phoneRunToHistoryRun(parsed, { assetId: 'a1' });
  assert.equal(history.origin, 'phone');
  assert.equal(history.assetId, 'a1');
});

test('export hash tamper is detected by the desktop parser', () => {
  const text = exportRun(stored());
  const edited = JSON.parse(text);
  edited.measurements[2].value += 1;
  const parsed = parsePhoneRun(JSON.stringify(edited));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.hashOk, false);
});

test('user agent can be redacted and never reaches the export', () => {
  const text = exportRun(stored(), { redactUserAgent: true });
  assert.equal(text.includes('Pixel'), false);
  assert.equal(parsePhoneRun(text).run.device.userAgent, null);
  assert.deepEqual(deviceInfo({ userAgent: 'x', sampleRate: 1 }, { redactUserAgent: true }).userAgent, null);
});

test('QR: a normal result is one QR; a large one is several, and each renders as a data-URI image', () => {
  const text = exportRun(stored());
  const one = toQrFrames(text);
  assert.equal(one.length, 1);
  const imgs = qrImages(one);
  assert.match(imgs[0].uri, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.match(decodeURIComponent(imgs[0].uri), /<svg [^>]*role="img"/);
  const big = exportRun(stored({ measurements: Array.from({ length: 60 }, (_, i) => ({ metricId: `speed.m${i}`, label: `A longer label for metric number ${i}`, value: i / 7, unit: 'Hz', uncertainty: 0.01 })) }));
  const frames = toQrFrames(big);
  assert.ok(frames.length > 1);
  const manyImgs = qrImages(frames);
  assert.equal(manyImgs.length, frames.length);
  assert.equal(manyImgs[1].label, `QR 2 of ${frames.length}`);
  assert.equal(parsePhoneRun(frames.join('\n')).hashOk, true);
  assert.match(svgToDataUri('<svg/>'), /%3Csvg%2F%3E$/);
});

test('file name carries the kind, a compact UTC stamp and the .deckchek-mobile.json extension', () => {
  assert.equal(fileName(stored()), `deckchek-speed-20261014-093000Z${FILE_EXTENSION}`);
  assert.ok(fileName({}).endsWith('.deckchek-mobile.json'));
});

test('an export that holds a value the format refuses throws instead of writing a bad file', () => {
  assert.throws(() => exportRun(stored({ measurements: [{ metricId: 'speed.rpm', label: 'x', value: 2 ** 60, unit: 'rpm' }] })));
});
