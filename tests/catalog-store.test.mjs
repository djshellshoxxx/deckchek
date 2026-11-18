import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('browser mode keeps mediaId / mediaTrackKey on saved device results (FS-06 AC-6)', async () => {
  const store = createCatalogStore({ storage: memStorage() });
  const withMedia = await store.saveDeviceTestResult({ assetId: 'a', profileId: 'p', testId: 't', status: 'pass', mediaId: 'ortofon-test-record', mediaTrackKey: 't5' });
  assert.equal(withMedia.mediaId, 'ortofon-test-record');
  assert.equal(withMedia.mediaTrackKey, 't5');
  const none = await store.saveDeviceTestResult({ assetId: 'a', profileId: 'p', testId: 't2', status: 'pass', mediaId: null, mediaTrackKey: 'orphan' });
  assert.equal(none.mediaId, null);
  assert.equal(none.mediaTrackKey, null, 'a track key without a medium is dropped');
  const listed = await store.listDeviceTestResults('a');
  assert.ok(listed.some(r => r.mediaId === 'ortofon-test-record' && r.mediaTrackKey === 't5'));
});

const supportFixture = JSON.parse(fs.readFileSync(new URL('./contracts/support-configurations.json', import.meta.url), 'utf8'));
function supportStore() {
  const storage = memStorage(), state = emptyState();
  state.catalog.supportConfiguration = [{ ...structuredClone(supportFixture.legacy), legacyExtra: { operator: 'Kept' } }];
  state.catalog.setup = [structuredClone(supportFixture.setup)];
  state.catalog.venue = [{ id: 'venue-a', name: 'Club A' }, { id: 'venue-b', name: 'Club B' }];
  state.catalog.asset = [{ id: 'asset-a', nickname: 'Deck A' }];
  state.otherLegacyData = { retain: ['all', 'values'] };
  storage.setItem('deckchek.catalog.v1', JSON.stringify(state));
  return { storage, store: createCatalogStore({ invoke: null, storage }) };
}

test('support descriptions use existing catalog storage without inventing timestamps and survive reload as deep copies', async () => {
  const { storage, store } = supportStore();
  const saved = await store.upsert('supportConfiguration', structuredClone(supportFixture.input));
  assert.deepEqual(saved, { ...supportFixture.input, deckPositionId: null, structureJson: '[]' });
  assert.equal(Object.hasOwn(saved, 'createdAt'), false); assert.equal(Object.hasOwn(saved, 'updatedAt'), false);
  const again = createCatalogStore({ invoke: null, storage });
  const legacy = (await again.list('supportConfiguration')).find(row => row.id === 'support-legacy');
  legacy.legacyExtra.operator = 'Caller mutation';
  assert.equal((await again.list('supportConfiguration')).find(row => row.id === 'support-legacy').legacyExtra.operator, 'Kept');
  assert.deepEqual(JSON.parse(storage.getItem('deckchek.catalog.v1')).otherLegacyData, { retain: ['all', 'values'] });
});

test('metadata edits preserve exact legacy structure text, position binding and unknown saved keys', async () => {
  const { store } = supportStore();
  const saved = await store.upsert('supportConfiguration', { id: 'support-legacy', name: 'Renamed', description: 'New description', approximateMassKg: 6, coupledState: 'decoupled', notes: null });
  assert.equal(saved.structureJson, supportFixture.legacy.structureJson);
  assert.equal(saved.deckPositionId, 'position-a'); assert.deepEqual(saved.legacyExtra, { operator: 'Kept' });
  await assert.rejects(store.upsert('supportConfiguration', { ...supportFixture.input, deckPositionId: 'position-a' }), /position|read.only/i);
  await assert.rejects(store.upsert('supportConfiguration', { ...supportFixture.input, structureJson: '[{"changed":true}]' }), /structure|read.only/i);
  assert.equal((await store.list('supportConfiguration'))[0].structureJson, supportFixture.legacy.structureJson);
});

test('support assignment validates the selected support and new position binding, while preserving unchanged legacy assignments', async () => {
  const { store, storage } = supportStore();
  await store.upsert('supportConfiguration', structuredClone(supportFixture.input));
  const a = structuredClone(supportFixture.setup);
  await store.upsert('setup', { ...a, supportConfigurationId: 'support-new' });
  await store.upsert('setup', { ...a, id: 'setup-b', venueId: 'venue-b', deckPositionId: 'position-b', supportConfigurationId: 'support-new' });
  await assert.rejects(store.upsert('setup', { ...a, id: 'setup-c', supportConfigurationId: 'missing' }), /support.*(exist|found)|unknown support/i);
  await assert.rejects(store.upsert('setup', { ...a, id: 'setup-c', deckPositionId: 'position-b' }), /position/i);
  const state = JSON.parse(storage.getItem('deckchek.catalog.v1'));
  state.catalog.setup[0] = { ...a, deckPositionId: 'old-inconsistent-position' };
  storage.setItem('deckchek.catalog.v1', JSON.stringify(state));
  const unchanged = await store.upsert('setup', { ...state.catalog.setup[0], name: 'Metadata edit' });
  assert.equal(unchanged.supportConfigurationId, 'support-legacy');
  assert.equal(unchanged.components[0].settingsSnapshotId, 'settings-a');
  await assert.rejects(store.remove('supportConfiguration', 'support-legacy'), /used|referenced|assigned/i);
  assert.ok((await store.list('supportConfiguration')).some(row => row.id === 'support-legacy'));
});

test('support catalog storage corruption, absence and quota errors preserve bytes and do not claim success', async () => {
  const { store, storage } = supportStore();
  const valid = storage.getItem('deckchek.catalog.v1');
  for (const invalid of ['{broken', 'null', '{"catalog":{"setup":false}}']) {
    storage.setItem('deckchek.catalog.v1', invalid);
    await assert.rejects(store.list('supportConfiguration'), /storage|catalog|read|invalid/i);
    await assert.rejects(store.upsert('supportConfiguration', supportFixture.input), /storage|catalog|read|invalid/i);
    await assert.rejects(store.upsert('setup', supportFixture.setup), /storage|catalog|read|invalid/i);
    assert.equal(storage.getItem('deckchek.catalog.v1'), invalid);
  }
  storage.setItem('deckchek.catalog.v1', valid);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  await assert.rejects(store.upsert('supportConfiguration', supportFixture.input), /Quota exceeded/);
  await assert.rejects(store.upsert('setup', supportFixture.setup), /Quota exceeded/);
  assert.equal(storage.getItem('deckchek.catalog.v1'), valid);
  const absent = createCatalogStore({ invoke: null, storage: null });
  await assert.rejects(absent.list('supportConfiguration'), /storage|unavailable/i);
  await assert.rejects(absent.upsert('supportConfiguration', supportFixture.input), /storage|unavailable/i);
});

test('descriptive validation rejects unsupported data without changing stored supports', async () => {
  const { store, storage } = supportStore(); const before = storage.getItem('deckchek.catalog.v1');
  for (const patch of [{ name: ' ' }, { approximateMassKg: -1 }, { approximateMassKg: Infinity }, { notes: { text: 'wrong type' } }, { description: 'x'.repeat(5001) }]) {
    await assert.rejects(store.upsert('supportConfiguration', { ...supportFixture.input, ...patch }));
  }
  assert.equal(storage.getItem('deckchek.catalog.v1'), before);
});

test('native support and support-bearing setup submissions are copied before invoke can suspend', async () => {
  for (const [entity, source] of [['setup', supportFixture.setup], ['supportConfiguration', supportFixture.input]]) {
    const calls = []; let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const store = createCatalogStore({ invoke: async (command, args) => { calls.push([command, args]); await pending; return args.record; } });
    const draft = structuredClone(source), original = structuredClone(draft);
    const request = store.upsert(entity, draft); draft.name = 'Mutated'; if (draft.components) draft.components[0].settingsSnapshotId = 'Mutated';
    assert.deepEqual(calls[0], ['catalog_upsert', { entity, record: original }]);
    finish(); const saved = await request; assert.deepEqual(saved, original); saved.name = 'Changed response';
    assert.deepEqual(calls[0][1].record, original, 'the returned record is also a copy');
  }
});

test('malformed support rows and failing storage reads cannot be erased by support or assignment writes', async () => {
  const { storage, store } = supportStore(); const good = JSON.parse(storage.getItem('deckchek.catalog.v1'));
  for (const rows of [[false], [{ ...supportFixture.legacy, structureJson: {} }], [supportFixture.legacy, supportFixture.legacy]]) {
    const bad = JSON.stringify({ ...good, catalog: { ...good.catalog, supportConfiguration: rows } });
    storage.setItem('deckchek.catalog.v1', bad);
    await assert.rejects(store.list('supportConfiguration'), /invalid/i);
    await assert.rejects(store.upsert('supportConfiguration', supportFixture.input), /invalid/i);
    await assert.rejects(store.upsert('setup', supportFixture.setup), /invalid/i);
    await assert.rejects(store.remove('supportConfiguration', 'support-legacy'), /invalid/i);
    assert.equal(storage.getItem('deckchek.catalog.v1'), bad);
  }
  storage.getItem = () => { throw new Error('Storage permission denied'); };
  await assert.rejects(store.list('supportConfiguration'), /Storage permission denied/);
  await assert.rejects(store.upsert('setup', supportFixture.setup), /Storage permission denied/);
});

test('older catalogs acquire the support bucket without disturbing existing data or unrelated fallback behavior', async () => {
  const { storage } = supportStore(); const state = JSON.parse(storage.getItem('deckchek.catalog.v1'));
  delete state.catalog.supportConfiguration; state.catalog.setup = []; state.catalog.legacyCatalog = { untouched: true };
  storage.setItem('deckchek.catalog.v1', JSON.stringify(state));
  const store = createCatalogStore({ invoke: null, storage });
  assert.deepEqual(await store.list('supportConfiguration'), []);
  await store.upsert('supportConfiguration', supportFixture.input);
  const after = JSON.parse(storage.getItem('deckchek.catalog.v1'));
  assert.deepEqual(after.catalog.legacyCatalog, state.catalog.legacyCatalog); assert.deepEqual(after.otherLegacyData, state.otherLegacyData);
  await store.remove('supportConfiguration', 'support-new'); assert.deepEqual(await store.list('supportConfiguration'), []);
  storage.setItem('deckchek.catalog.v1', '{bad');
  assert.deepEqual(await store.list('venue'), [], 'unrelated catalog reads keep their prior fallback semantics');
});

test('support correction: browser rejects a changed asset carrying its old settings snapshot and allows deliberate unlinking', async () => {
  const { store, storage } = supportStore(); const before = storage.getItem('deckchek.catalog.v1');
  const replacement = structuredClone(supportFixture.setup); replacement.components[0].assetId = 'asset-b';
  await assert.rejects(store.upsert('setup', replacement), /settings.*snapshot|snapshot.*asset/i);
  assert.equal(storage.getItem('deckchek.catalog.v1'), before);
  replacement.components[0].settingsSnapshotId = null;
  const saved = await store.upsert('setup', replacement);
  assert.equal(saved.components[0].assetId, 'asset-b'); assert.equal(saved.components[0].settingsSnapshotId, null);
  assert.equal(saved.boothId, 'booth-a'); assert.equal(saved.supportConfigurationId, 'support-legacy');
});

test('support correction: browser rejects bound venue transitions but preserves unchanged metadata and unbound moves', async () => {
  const { store, storage } = supportStore(); const original = structuredClone(supportFixture.setup);
  const before = storage.getItem('deckchek.catalog.v1');
  for (const venueId of ['venue-b', null]) {
    await assert.rejects(store.upsert('setup', { ...original, venueId }), /venue.*(booth|position|bound)/i);
    await assert.rejects(store.upsert('setup', { ...original, venueId, boothId: null, deckPositionId: null, supportConfigurationId: null }), /venue.*(booth|position|bound)/i);
    assert.equal(storage.getItem('deckchek.catalog.v1'), before);
  }
  const renamed = await store.upsert('setup', { ...original, name: 'Metadata only' });
  assert.equal(renamed.venueId, 'venue-a'); assert.equal(renamed.boothId, 'booth-a');
  const state = JSON.parse(storage.getItem('deckchek.catalog.v1'));
  Object.assign(state.catalog.setup[0], { boothId: null, deckPositionId: null });
  storage.setItem('deckchek.catalog.v1', JSON.stringify(state));
  await assert.rejects(store.upsert('setup', { ...state.catalog.setup[0], venueId: 'venue-b' }), /venue.*(booth|position|bound)/i, 'a legacy position-bound support still binds context');
  await store.upsert('supportConfiguration', supportFixture.input);
  state.catalog.setup[0].supportConfigurationId = 'support-new';
  const updated = JSON.parse(storage.getItem('deckchek.catalog.v1')); updated.catalog.setup[0] = state.catalog.setup[0];
  storage.setItem('deckchek.catalog.v1', JSON.stringify(updated));
  const moved = await store.upsert('setup', { ...state.catalog.setup[0], venueId: 'venue-b' });
  assert.equal(moved.venueId, 'venue-b'); assert.equal(moved.supportConfigurationId, 'support-new');
  assert.equal(moved.components[0].settingsSnapshotId, 'settings-a');
});
