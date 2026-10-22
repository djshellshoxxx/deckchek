import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPack, validatePack, createPackStore } from '../app/pack.js';

const metricRegistry = { 'player:noise': { unit: 'dBFS', plausible: [-160, 0] } };
const row = { product: 'player', metric: 'noise', method: { key: 'rms', version: 1 }, value: -62.12345, unit: 'dBFS' };
const input = () => ({ rows: [row], appVersion: '0.0.8', packId: 'pack-one', contributor: 'random-token', createdMonth: '2026-10' });

test('pack builder whitelists fields, rounds to three significant digits and preserves input', () => {
  const secret = { ...row, serial: 'SECRET-SERIAL', assetId: 'SECRET-ASSET', nickname: 'SECRET-NAME', session: 'SECRET-SESSION', path: 'SECRET-PATH', venue: 'SECRET-VENUE', method: { ...row.method, note: 'SECRET-NOTE' } };
  const pack = buildPack({ ...input(), rows: [secret] }, { metricRegistry });
  assert.deepEqual(Object.keys(pack.rows[0]), ['product', 'metric', 'method', 'value', 'unit']);
  assert.deepEqual(Object.keys(pack.rows[0].method), ['key', 'version']);
  assert.equal(pack.rows[0].value, -62.1);
  assert.equal(JSON.stringify(pack).includes('SECRET'), false);
  assert.equal(secret.value, -62.12345);
});

test('pack validation rejects unknown fields, unknown metrics, poison values and duplicates', () => {
  const valid = buildPack(input(), { metricRegistry });
  assert.equal(validatePack(valid, { metricRegistry }).ok, true);
  for (const changed of [
    { ...valid, serial: 'private' },
    { ...valid, version: 3 },
    { ...valid, createdMonth: '2026-13' },
    { ...valid, packId: 123 },
    { ...valid, contributor: 123 },
    { ...valid, rows: [{ ...valid.rows[0], value: Infinity }] },
    { ...valid, rows: [{ ...valid.rows[0], value: -161 }] },
    { ...valid, rows: [{ ...valid.rows[0], product: 'unknown' }] },
    { ...valid, rows: [{ ...valid.rows[0], unit: 'dB' }] },
    { ...valid, rows: [{ ...valid.rows[0], method: { key: 'rms', version: 0 } }] },
    { ...valid, rows: [{ ...valid.rows[0], nickname: 'private' }] },
    { ...valid, rows: [valid.rows[0], valid.rows[0]] },
  ]) assert.equal(validatePack(changed, { metricRegistry }).ok, false, JSON.stringify(changed));
  assert.equal(validatePack(valid).ok, false, 'unknown plausible range cannot be imported');
});

test('pack limits apply to UTF-8 bytes, row counts and invalid JSON without throwing', () => {
  for (const value of ['{', 'x'.repeat(5 * 1024 * 1024 + 1), null, [], { ...input(), rows: Array(100001).fill(row) }]) {
    assert.equal(validatePack(value, { metricRegistry }).ok, false);
  }
});

test('memory imports are atomic, idempotent and removable; same id cannot replace data', () => {
  const store = createPackStore({ metricRegistry });
  const pack = buildPack(input(), { metricRegistry });
  assert.deepEqual(store.import(pack), { packId: 'pack-one', accepted: 1, duplicate: false });
  assert.deepEqual(store.import(pack), { packId: 'pack-one', accepted: 0, duplicate: true });
  assert.equal(store.query({ product: 'player', metric: 'noise', methodKey: 'rms' }).rows.length, 1);
  assert.throws(() => store.import({ ...pack, rows: [{ ...pack.rows[0], value: -80 }] }), /different content/);
  const another = buildPack({ ...input(), packId: 'pack-two' }, { metricRegistry });
  assert.equal(store.import(another).accepted, 0, 'same contributor and observation is not a second sample');
  store.remove('pack-one');
  assert.equal(store.query({ product: 'player', metric: 'noise', methodKey: 'rms' }).rows.length, 1, 'remaining pack still owns its observation');
  store.remove('pack-two');
  assert.equal(store.query({ product: 'player', metric: 'noise', methodKey: 'rms' }).rows.length, 0);
});

test('pack preview groups counts by product and metric and query cannot mutate saved data', () => {
  const pack = buildPack(input(), { metricRegistry });
  const preview = validatePack(pack, { metricRegistry });
  assert.deepEqual(preview.counts, [{ product: 'player', metric: 'noise', rows: 1 }]);
  const store = createPackStore({ metricRegistry });
  store.import(pack);
  const result = store.query({ product: 'player', metric: 'noise', methodKey: 'rms' });
  result.rows[0].method.version = 9;
  assert.equal(store.query({ product: 'player', metric: 'noise', methodKey: 'rms' }).rows[0].method.version, 1);
  assert.equal(result.contributors, 1);
});
