import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hashStatus, previewRows, suggestAsset, parsePhoneRun } from '../app/ui/workflows/import-phone.js';
import { toPersistRun } from '../app/ui/persistence.js';
import { buildExport, serializeExport, phoneRunToHistoryRun } from '../app/phone-run.js';
import { FEATURES } from '../app/features.js';

const exp = buildExport({
  createdAt: '2026-10-14T09:30:00Z', device: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0', sampleRate: 48000 },
  assetHint: { nickname: 'SL-1200MK4 #1', serial: 'AB123' },
  measurements: [{ metricId: 'speed.pitchPercent', label: 'Pitch', value: 0.12, unit: '%', uncertainty: 0.3, confidence: 0.8 }, { metricId: 'speed.rpm', label: 'Speed', value: 33, unit: 'rpm' }],
});

test('flag phoneImport is wired and still off by default', () => {
  assert.equal(FEATURES.phoneImport.wired, true);
  assert.equal(FEATURES.phoneImport.default, false);
  assert.equal(FEATURES.phoneImport.spec, 'FS-30');
});

test('hash status is a word plus tone for matching, differing and missing hashes', () => {
  assert.deepEqual([hashStatus(parsePhoneRun(serializeExport(exp)))].map(s => [s.tone, s.word]), [['pass', 'Hash matches']]);
  const tampered = JSON.parse(serializeExport(exp));
  tampered.measurements[0].value = 5;
  assert.equal(hashStatus(parsePhoneRun(JSON.stringify(tampered))).word, 'Hash differs');
  delete tampered.sha256;
  assert.equal(hashStatus(parsePhoneRun(JSON.stringify(tampered))).word, 'No hash');
  assert.equal(hashStatus(parsePhoneRun('nope')), null);
});

test('preview rows show value with unit, uncertainty and confidence', () => {
  const rows = previewRows(parsePhoneRun(serializeExport(exp)).run);
  assert.deepEqual(rows[0], ['Pitch', '0.12 %', '± 0.3', '80 %']);
  assert.deepEqual(rows[1], ['Speed', '33 rpm', '—', '100 %']);
});

test('asset suggestion prefers a serial match, then the exact nickname, else nothing', () => {
  const assets = [{ id: 'a', nickname: 'Deck 2' }, { id: 'b', nickname: 'sl-1200mk4 #1' }, { id: 'c', nickname: 'Other', serialNumber: 'ab123' }];
  assert.equal(suggestAsset(assets, { nickname: 'SL-1200MK4 #1', serial: 'AB123' }), 'c');
  assert.equal(suggestAsset(assets, { nickname: 'SL-1200MK4 #1', serial: null }), 'b');
  assert.equal(suggestAsset(assets, { nickname: 'nope', serial: null }), null);
  assert.equal(suggestAsset([], {}), null);
});

test('a phone run reaches save_diagnostic_run with origin, source device and asset (AC-6)', () => {
  const run = phoneRunToHistoryRun(parsePhoneRun(serializeExport(exp)), { assetId: 'asset-9' });
  const persisted = toPersistRun(run);
  assert.equal(persisted.origin, 'phone');
  assert.equal(persisted.sourceDevice, 'Pixel 8 / Chrome / 48000 Hz');
  assert.equal(persisted.assetId, 'asset-9');
  assert.equal(persisted.sessionType, 'phone');
  assert.ok(persisted.measurements.every(m => m.origin === 'phone' && Number.isFinite(m.value)));
  assert.equal(persisted.startedAt, undefined, 'no capture span, so it never counts as stylus hours');
  assert.equal('origin' in toPersistRun({ id: 'x', test: 't', createdAt: 'c', measurements: [], findings: [] }), false);
});

test('the screen only ever shows imported text through textContent', () => {
  const src = fs.readFileSync(new URL('../app/ui/workflows/import-phone.js', import.meta.url), 'utf8');
  assert.equal(/innerHTML\s*=/.test(src), false);
  // html: is used only with trusted icon/chip markup
  for (const m of src.matchAll(/html:\s*([^,}]+)/g)) assert.match(m[1], /icon\(|chip\(/);
});
