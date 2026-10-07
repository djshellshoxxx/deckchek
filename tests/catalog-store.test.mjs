import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogStore, assertEntity, filterRecords, upsertRecord, deleteRecord, emptyState, loadState } from '../app/catalog-store.js';

const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('assertEntity rejects unknown entities', () => {
  assert.equal(assertEntity('venue'), 'venue');
  assert.throws(() => assertEntity('session'));
});

test('pure upsert/filter/delete helpers', () => {
  const s = emptyState();
  const a = upsertRecord(s, 'asset', { nickname: 'Deck L', productId: 'p1' }, 't1');
  upsertRecord(s, 'asset', { nickname: 'Deck R', productId: 'p2' }, 't1');
  assert.ok(a.id);
  const b = upsertRecord(s, 'asset', { id: a.id, nickname: 'Deck X' }, 't2');
  assert.equal(b.createdAt, 't1');
  assert.equal(b.updatedAt, 't2');
  assert.equal(s.catalog.asset.length, 2);
  assert.equal(filterRecords('asset', s.catalog.asset, { search: 'deck r' }).length, 1);
  assert.equal(filterRecords('asset', s.catalog.asset, { productId: 'p2' }).length, 1);
  assert.equal(deleteRecord(s, 'asset', a.id), true);
  assert.equal(deleteRecord(s, 'asset', a.id), false);
});

test('fallback store CRUD round trip persists via storage', async () => {
  const storage = memStorage();
  const store = createCatalogStore({ invoke: null, storage });
  assert.equal(store.native, false);
  const m = await store.upsert('manufacturer', { name: 'Acme' });
  const setup = await store.upsert('setup', { name: 'Home', components: [{ role: 'turntable', assetId: 'a1' }] });
  assert.ok(setup.components[0].id);
  const again = createCatalogStore({ invoke: null, storage });
  assert.equal((await again.list('manufacturer', { search: 'acm' })).length, 1);
  assert.equal(await again.remove('manufacturer', m.id), true);
  assert.equal((await again.list('manufacturer')).length, 0);
  await assert.rejects(() => again.list('nope'));
});

test('fallback runs and alignment', async () => {
  const store = createCatalogStore({ invoke: null, storage: memStorage() });
  await store.saveRun({ id: 'r1', test: 'T', createdAt: '2026-01-01', measurements: [{}], findings: [{}, {}] });
  await store.saveRun({ id: 'r2', test: 'T', createdAt: '2026-01-02', measurements: [], findings: [] });
  const runs = await store.listRuns(1);
  assert.equal(runs[0].id, 'r2');
  assert.equal((await store.getRun('r1')).measurements.length, 1);
  assert.equal(await store.getRun('zz'), null);
  const saved = await store.saveScanAlignment({ scanA: {}, scanB: {}, offsetSamples: 3, confidence: 0.9 });
  assert.ok(saved.id);
  await assert.rejects(() => store.saveScanAlignment({ confidence: 2 }));
});

test('native path forwards to invoke with command names', async () => {
  const calls = [];
  const store = createCatalogStore({ invoke: async (c, a) => { calls.push([c, a]); return []; }, storage: memStorage() });
  await store.list('venue', { search: 'x' });
  await store.upsert('venue', { name: 'v' });
  await store.remove('venue', 'id1');
  await store.listRuns(5);
  await store.getRun('r');
  await store.saveScanAlignment({ confidence: 1 });
  assert.deepEqual(calls.map(c => c[0]), ['catalog_list', 'catalog_upsert', 'catalog_delete', 'list_runs', 'get_run', 'save_scan_alignment']);
  assert.deepEqual(calls[2][1], { entity: 'venue', id: 'id1' });
});

test('corrupt storage falls back to empty state', () => {
  const st = { getItem: () => '{bad', setItem() {} };
  assert.deepEqual(loadState(st), emptyState());
});
