import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogStore, emptyState, CATALOG_STORAGE_KEY } from '../app/catalog-store.js';
import { profileAssignmentRequest } from '../app/device-profile-assignment.js';

const request = { assetId: 'unit', profileId: 'chosen-profile', productId: 'chosen-product', expectedProductId: 'imported-product' };
function fixture() {
  const state = emptyState();
  state.catalog.product.push({ id: 'imported-product', category: 'controller', model: 'Original record' }, { id: 'chosen-product', category: 'controller', model: 'Chosen model' });
  state.catalog.asset.push({ id: 'unit', productId: 'imported-product', nickname: 'Existing <unit>', serialNumber: '123', createdAt: 'created', updatedAt: 'updated', unknownLegacy: { keep: true } });
  state.catalog.setup.push({ id: 'setup', name: 'Imported setup', components: [{ id: 'component', assetId: 'unit', role: 'controller' }] });
  state.deviceProfiles['chosen-profile'] = { productId: 'chosen-product', json: '{}' };
  state.deviceResults.push({ id: 'past', assetId: 'unit', profileId: 'original-profile', status: 'unknown' });
  state.midiMaps.unit = { assetId: 'unit', profileId: 'original-profile', map: { prior: true } };
  state.runs.push({ id: 'run', assetId: 'unit' });
  state.unrelatedLegacy = { preserve: ['all'] };
  let raw = JSON.stringify(state), writes = 0;
  const storage = { getItem: key => key === CATALOG_STORAGE_KEY ? raw : null, setItem: (key, value) => { assert.equal(key, CATALOG_STORAGE_KEY); writes++; raw = value; } };
  return { state, storage, store: createCatalogStore({ invoke: null, storage }), raw: () => raw, writes: () => writes };
}

test('explicit association changes only product and update time and survives reload', async () => {
  const f = fixture();
  const result = await f.store.assignDeviceProfile(request);
  assert.equal(result.changed, true);
  assert.equal(f.writes(), 1);
  const saved = JSON.parse(f.raw()), asset = saved.catalog.asset[0];
  assert.equal(asset.productId, 'chosen-product');
  assert.equal(asset.updatedAt, result.updatedAt);
  const expected = structuredClone(f.state);
  expected.catalog.asset[0].productId = 'chosen-product';
  expected.catalog.asset[0].updatedAt = result.updatedAt;
  assert.deepEqual(saved, expected, 'all IDs, setup components, history and map provenance remain exact');
  const again = createCatalogStore({ invoke: null, storage: f.storage });
  assert.equal((await again.list('asset'))[0].productId, 'chosen-product');
});

test('retry after a lost acknowledgement makes no additional writes', async () => {
  const f = fixture();
  const first = await f.store.assignDeviceProfile(request), saved = f.raw();
  const again = await f.store.assignDeviceProfile(request);
  assert.deepEqual(again, { ...first, changed: false });
  assert.equal(f.writes(), 1);
  assert.equal(f.raw(), saved);
});

test('stale, missing, retired or changed identities fail without modifying saved data', async () => {
  const mutations = [
    s => { s.catalog.asset[0].productId = 'another-product'; },
    s => { s.catalog.asset[0].isDeleted = true; },
    s => { s.catalog.asset = []; },
    s => { s.deviceProfiles['chosen-profile'].productId = 'another-product'; },
    s => { delete s.deviceProfiles['chosen-profile']; },
    s => { s.catalog.product.pop(); },
    s => { s.deviceProfiles = []; },
  ];
  for (const mutate of mutations) {
    const f = fixture(), state = JSON.parse(f.raw()); mutate(state);
    f.storage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(state));
    const before = f.raw(), writes = f.writes();
    await assert.rejects(f.store.assignDeviceProfile(request));
    assert.equal(f.raw(), before); assert.equal(f.writes(), writes);
  }
});

test('unassigned units require the explicit null previous product', async () => {
  const f = fixture(), state = JSON.parse(f.raw()); state.catalog.asset[0].productId = null;
  f.storage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(state));
  await assert.rejects(f.store.assignDeviceProfile(request), /product changed/);
  assert.equal((await f.store.assignDeviceProfile({ ...request, expectedProductId: null })).changed, true);
});

test('malformed requests never invoke native code', async () => {
  const calls = [];
  const store = createCatalogStore({ invoke: (...args) => { calls.push(args); } });
  for (const input of [null, [], {}, { ...request, assetId: '' }, { ...request, profileId: 'é'.repeat(2049) }, { ...request, expectedProductId: 1 }, { ...request, extra: true }]) {
    await assert.rejects(store.assignDeviceProfile(input));
  }
  const missing = { ...request }; delete missing.expectedProductId;
  assert.throws(() => profileAssignmentRequest(missing));
  assert.equal(calls.length, 0);
});

test('native dispatch owns the original reviewed request when the caller changes its draft', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const calls = [];
  const store = createCatalogStore({ invoke: async (...args) => { calls.push(args); await pending; return { assetId: 'unit', productId: 'chosen-product', changed: true }; } });
  const draft = { ...request }; const promise = store.assignDeviceProfile(draft);
  draft.productId = 'later'; draft.assetId = 'later';
  assert.deepEqual(calls, [['device_profile_assign', { request }]]);
  release(); assert.equal((await promise).productId, 'chosen-product');
});

test('storage corruption and quota failure are reported without losing the original state', async () => {
  for (const raw of ['{bad', 'null', '{"catalog":{"asset":false}}']) {
    let writes = 0;
    const store = createCatalogStore({ invoke: null, storage: { getItem: () => raw, setItem: () => { writes++; } } });
    await assert.rejects(store.assignDeviceProfile(request)); assert.equal(writes, 0);
  }
  const f = fixture(), before = f.raw();
  f.storage.setItem = () => { throw new Error('Quota exceeded'); };
  await assert.rejects(f.store.assignDeviceProfile(request), /Quota exceeded/); assert.equal(f.raw(), before);
});
