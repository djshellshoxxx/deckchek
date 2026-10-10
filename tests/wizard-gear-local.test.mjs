import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogStore, applyGearLocal, syncProfilesLocal, emptyState, upsertRecord, WIZARD_ASSET_NOTE, wizardManagesGear } from '../app/catalog-store.js';

const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const prof = (id, model) => ({ schemaVersion: 1, id, manufacturer: 'Acme', model, category: 'turntable', summary: 's', specs: [], tests: [] });
const A = prof('acme-a', 'A-1'), B = prof('acme-b', 'B-2'), C = prof('acme-c', 'C-3');
const NOW = '2026-10-10T10:00:00.000Z';

function seeded({ createAssets }) {
  const s = emptyState();
  syncProfilesLocal(s, [A, B, C], '2026-10-01T00:00:00.000Z', { createAssets });
  return s;
}

test('sync with createAssets:false adds profiles but no assets', () => {
  const s = seeded({ createAssets: false });
  assert.equal(Object.keys(s.deviceProfiles).length, 3);
  assert.equal(s.catalog.asset.length, 0);
  assert.equal(seeded({ createAssets: true }).catalog.asset.length, 3);
});

test('applyGearLocal creates assets once per ticked product and is idempotent', () => {
  const s = seeded({ createAssets: false });
  const first = applyGearLocal(s, ['acme-a', 'acme-b'], {}, NOW);
  assert.equal(first.created.length, 2);
  assert.deepEqual(s.catalog.asset.map(a => a.nickname).sort(), ['My A-1', 'My B-2']);
  assert.ok(s.catalog.asset.every(a => a.notes === WIZARD_ASSET_NOTE));
  const again = applyGearLocal(s, ['acme-a', 'acme-b', 'acme-a'], {}, NOW);
  assert.equal(again.created.length, 0);
  assert.equal(again.existing.length, 2);
  assert.equal(s.catalog.asset.length, 2);
});

test('applyGearLocal rejects an unknown id without changing anything', () => {
  const s = seeded({ createAssets: false });
  assert.throws(() => applyGearLocal(s, ['acme-a', 'nope'], {}, NOW), /unknown product id 'nope'/);
  assert.equal(s.catalog.asset.length, 0);
});

test('applyGearLocal revives a soft-deleted unit instead of making a twin', () => {
  const s = seeded({ createAssets: false });
  const { created } = applyGearLocal(s, ['acme-a'], {}, NOW);
  Object.assign(s.catalog.asset[0], { isDeleted: true, retiredDate: '2026-10-02' });
  const back = applyGearLocal(s, ['acme-a'], {}, '2026-10-11T00:00:00.000Z');
  assert.equal(back.created[0].assetId, created[0].assetId);
  assert.equal(s.catalog.asset.length, 1);
  assert.equal(s.catalog.asset[0].isDeleted, false);
});

test('retire only removes untouched library-created assets of unticked gear', () => {
  const s = seeded({ createAssets: true });
  const byProfile = id => s.catalog.asset.find(x => x.productId === s.deviceProfiles[id].productId);
  const a = byProfile('acme-a'), b = byProfile('acme-b'), c = byProfile('acme-c');
  s.deviceResults.push({ id: 'r1', assetId: c.id, profileId: 'acme-c', testId: 't', status: 'pass' });
  const custom = upsertRecord(s, 'asset', { productId: s.deviceProfiles['acme-a'].productId, nickname: 'Booth deck', notes: 'mine' }, NOW);
  const out = applyGearLocal(s, [], { retire: true }, NOW);
  assert.deepEqual(out.removed.map(r => r.assetId).sort(), [a.id, b.id].sort());
  assert.ok(s.catalog.asset.find(x => x.id === a.id).isDeleted);
  assert.ok(!s.catalog.asset.find(x => x.id === c.id).isDeleted, 'asset with a test result is kept');
  assert.ok(!s.catalog.asset.find(x => x.id === custom.id).isDeleted, 'a unit the user added is never touched');
  const edited = seeded({ createAssets: true });
  edited.catalog.asset[1].nickname = 'Renamed'; edited.catalog.asset[1].updatedAt = NOW;
  const r2 = applyGearLocal(edited, ['acme-a'], { retire: true }, NOW);
  assert.equal(r2.removed.length, 1, 'edited asset is kept; only the untouched C is retired');
  assert.ok(!edited.catalog.asset[0].isDeleted);
});

test('store: hasUserData is pinned before the first sync and the wizard owns gear creation', async () => {
  const store = createCatalogStore({ invoke: null, storage: memStorage() });
  assert.equal(wizardManagesGear(), true);
  assert.equal(await store.hasUserData(), false);
  const synced = await store.syncDeviceProfiles([A, B]);
  assert.ok(synced.every(r => r.created && !r.assetId));
  assert.equal((await store.list('asset')).length, 0);
  assert.equal(await store.hasUserData(), false, 'memoised: this session\'s own sync does not count');
  const res = await store.applyGear(['acme-a']);
  assert.equal(res.created.length, 1);
  assert.equal((await store.list('asset')).length, 1);
});

test('store: an upgrade install with assets reports user data and keeps them', async () => {
  const storage = memStorage();
  const old = createCatalogStore({ invoke: null, storage });
  await old.syncDeviceProfiles([A, B], { createAssets: true });
  const upgraded = createCatalogStore({ invoke: null, storage });
  assert.equal(await upgraded.hasUserData(), true);
  await upgraded.syncDeviceProfiles([A, B, C]);
  assert.equal((await upgraded.list('asset')).length, 2, 'existing gear kept, new profile adds none');
});

test('store native: hasUserData and gear commands', async () => {
  const calls = [];
  const store = createCatalogStore({ invoke: async (cmd, args) => { calls.push([cmd, args]); return cmd === 'wizard_has_user_data' ? true : { created: [], existing: [], removed: [] }; }, storage: memStorage() });
  assert.equal(await store.hasUserData(), true);
  await store.applyGear(['x'], { retire: true });
  await store.applyGear(['x']);
  assert.deepEqual(calls.map(c => c[0]), ['wizard_has_user_data', 'wizard_apply_gear', 'wizard_create_assets']);
  assert.deepEqual(calls[1][1], { productIds: ['x'] });
});
