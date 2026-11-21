import test from 'node:test';
import assert from 'node:assert/strict';
import { addUnit, lib, refreshUnits, saveResult } from '../app/ui/devices/library-state.js';
import { store } from '../app/ui/state.js';
import { deferred, settle } from './fixtures/service-screen-dom.mjs';

const profile = { id: 'profile-a', model: 'Model A' };
const observation = { id: 'observation' };

function fixture(t) {
  const previous = { assets: lib.assets, results: lib.results, products: lib.products };
  const assets = [{ id: 'unit-a', productId: 'product-a', nickname: 'Unit A' }];
  const results = [];
  Object.assign(lib, { assets: structuredClone(assets), results: [], products: new Map([[profile.id, 'product-a']]) });
  t.after(() => Object.assign(lib, previous));
  t.mock.method(store, 'list', async entity => {
    assert.equal(entity, 'asset'); return structuredClone(assets);
  });
  t.mock.method(store, 'listDeviceTestResults', async () => structuredClone(results));
  t.mock.method(store, 'saveDeviceTestResult', async input => {
    const row = { id: `saved-${results.length + 1}`, ...structuredClone(input) };
    results.unshift(row); return structuredClone(row);
  });
  t.mock.method(store, 'upsert', async (entity, input) => {
    assert.equal(entity, 'asset');
    const row = { id: 'new-unit', ...structuredClone(input) };
    assets.push(row); return structuredClone(row);
  });
  const save = () => saveResult({ profile, test: observation, assetId: 'unit-a', status: 'pass', detail: {} });
  return { assets, results, save };
}

test('an older result-list response preserves an acknowledged device result in the shared cache', async t => {
  const f = fixture(t), pending = deferred();
  t.mock.method(store, 'listDeviceTestResults', () => pending.promise);
  const reading = refreshUnits(); await settle();
  const saved = await f.save();
  assert.deepEqual(lib.results, [saved]);
  pending.resolve([]); await reading;
  assert.deepEqual(lib.results, f.results, 'the acknowledged row remains visible after the older read');
  assert.equal(f.results.length, 1, 'the result was persisted once');
});

for (const stage of ['assets', 'results']) {
  test(`an older ${stage} response preserves an acknowledged new unit in the shared cache`, async t => {
    const f = fixture(t), pending = deferred(), before = structuredClone(f.assets);
    if (stage === 'assets') t.mock.method(store, 'list', () => pending.promise);
    else t.mock.method(store, 'listDeviceTestResults', () => pending.promise);
    const reading = refreshUnits(); await settle();
    const added = await addUnit(profile);
    assert.ok(lib.assets.some(row => row.id === added.id));
    pending.resolve(stage === 'assets' ? before : []); await reading;
    assert.deepEqual(lib.assets, f.assets, 'the new unit survives the older complete read');
    assert.equal(f.assets.filter(row => row.id === added.id).length, 1, 'the unit was persisted once');
  });
}

for (const kind of ['result', 'unit']) {
  test(`a failed ${kind} write does not retire a still-current library refresh`, async t => {
    const f = fixture(t), pending = deferred();
    t.mock.method(store, 'listDeviceTestResults', () => pending.promise);
    const reading = refreshUnits(); await settle();
    const method = kind === 'result' ? 'saveDeviceTestResult' : 'upsert';
    t.mock.method(store, method, async () => { throw new Error('Storage unavailable'); });
    await assert.rejects(kind === 'result' ? f.save() : addUnit(profile), /Storage unavailable/);
    const existing = [{ id: 'previously-stored', assetId: 'unit-a', profileId: profile.id, testId: observation.id, status: 'unknown' }];
    pending.resolve(existing); await reading;
    assert.deepEqual(lib.results, existing, 'a rejected write published no newer cache state');
    assert.deepEqual(lib.assets, f.assets);
  });
}

test('a fresh read after acknowledged cache writes accepts the complete authoritative snapshot', async t => {
  const f = fixture(t);
  await f.save(); await addUnit(profile);
  f.assets[0].nickname = 'Renamed in Equipment';
  await refreshUnits();
  assert.deepEqual(lib.assets, f.assets);
  assert.deepEqual(lib.results, f.results);
  assert.equal(lib.assets[0].nickname, 'Renamed in Equipment');
});
