import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as results from '../app/ui/results.js';
import * as history from '../app/ui/screens/history.js';

const table = JSON.parse(fs.readFileSync(new URL('../app/population-metrics.json', import.meta.url), 'utf8'));
const run = { assetId: 'a-2', deviceId: 'a-1', device: 'Deck 2' };
const measurement = { metricId: 'wow_flutter_rms_percent', value: .18, unit: '%', origin: 'measured', qualityFlags: [] };
const rows = [{ assetId: 'a-2', metric: measurement.metricId, value: .18, unit: '%' }];
const params = (r = run, m = measurement, values = rows) => results.resultCompareParams(r, m, table, values);

test('FS-21 result entry point uses the actual asset and a registered, available metric', () => {
  assert.deepEqual(params(), { assetId: 'a-2', metric: 'wow_flutter_rms_percent' });
  assert.deepEqual(params({ deviceId: 'a-2' }), { assetId: 'a-2', metric: 'wow_flutter_rms_percent' });
});

test('FS-21 result entry point excludes unknown attribution, incompatible units and unqualified readings', () => {
  for (const bad of [{ device: 'Deck 2' }, { assetId: 'a-missing' }, { assetId: '<asset>' }]) assert.equal(params(bad), null);
  for (const bad of [{ metricId: 'unregistered' }, { value: NaN }, { value: '0.18' }, { unit: 'dB' }, { origin: 'estimated' }, { qualityFlags: ['uncalibrated'] }]) {
    assert.equal(params(run, { ...measurement, ...bad }), null, JSON.stringify(bad));
  }
  assert.equal(params(run, measurement, []), null);
});

test('FS-21 native History normalization retains explicit asset identity without using a display name', () => {
  const raw = { id: 'native-history', measurements: [], config: { assetId: 'a-2', deviceId: 'a-1' }, device: 'Deck 2' };
  assert.equal(history.normalizeRun(raw).assetId, 'a-2');
  assert.equal(history.normalizeRun({ ...raw, config: { deviceId: 'a-1' } }).assetId, 'a-1');
  assert.equal(history.normalizeRun({ ...raw, config: null }).assetId, null);
  assert.equal(history.normalizeRun({ ...raw, config: { assetId: { id: 'a-2' } } }).assetId, null);
});
