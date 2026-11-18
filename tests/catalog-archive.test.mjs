import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalogStore, emptyState, loadState, syncProfilesLocal } from '../app/catalog-store.js';
import { parseWorkspaceJson } from '../app/export.js';
import { parseVenueHistoryArchive, createVenueHistoryArchive } from '../app/venue-history-archive.js';
import { createVenueIncidentStore } from '../app/venue-incidents.js';
import { gatherVenueReport } from '../app/ui/workflows/m6-reports.js';
import {
  createCatalogArchive, parseCatalogArchive, serializeCatalogArchive,
  MAX_CATALOG_ARCHIVE_BYTES, MAX_CATALOG_ARCHIVE_RECORDS,
} from '../app/catalog-archive.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./contracts/catalog-archive.json', import.meta.url)));
const incidentFixture = JSON.parse(fs.readFileSync(new URL('./contracts/venue-incidents.json', import.meta.url)));
const profile = JSON.parse(fs.readFileSync(new URL('../app/devices/profiles/allen-and-heath-xone-96.json', import.meta.url)));
const copy = value => structuredClone(value), stamp = fixture.exportedAt, key = 'deckchek.catalog.v1';
const value = () => copy(fixture);
function memory(state) {
  const map = new Map(state === undefined ? [] : [[key, typeof state === 'string' ? state : JSON.stringify(state)]]);
  return { map, writes: [], reads: 0, get length() { return map.size; }, key: index => [...map.keys()][index] ?? null,
    getItem(name) { this.reads++; return map.get(name) ?? null; },
    setItem(name, text) { this.writes.push(name); map.set(name, String(text)); } };
}
const service = storage => createCatalogArchive({ storage, now: () => stamp });
const current = storage => JSON.parse(storage.map.get(key));
const empty = () => ({ ...value(), catalog: emptyState().catalog });
const stateWith = catalog => ({ ...emptyState(), catalog });
const row = (catalog, entity, id) => catalog[entity].find(record => record.id === id);

test('complete saved catalog graph exports and restores once, including retired assets and every component', async () => {
  const input = value(), source = memory(stateWith(input.catalog));
  assert.equal((await createCatalogStore({ invoke: null, storage: source }).list('asset')).length, 1);
  const encoded = serializeCatalogArchive(service(source).exportArchive());
  assert.deepEqual(parseCatalogArchive(encoded), input);
  const destination = memory(), preview = service(destination).preview(input);
  assert.deepEqual(preview.counts, { manufacturer: 1, product: 1, asset: 2, setup: 1, venue: 1, supportConfiguration: 1, components: 2, total: 9 });
  assert.equal(preview.toImport, 9); assert.equal(preview.alreadyPresent, 0); assert.equal(preview.canImport, true);
  assert.deepEqual(preview.metadata, { total: 1, toImport: 1, alreadyPresent: 0 });
  assert.equal(destination.writes.length, 0);
  const result = service(destination).importArchive(parseCatalogArchive(encoded));
  assert.equal(result.status, 'complete'); assert.equal(result.completed, 9); assert.equal(result.metadataAdded, 1); assert.equal(result.written, true);
  assert.deepEqual(destination.writes, [key]); assert.ok(destination.reads <= 3, 'preview plus import snapshot and one recheck');
  assert.deepEqual(service(destination).exportArchive(), input);
  assert.equal(current(destination).catalog.asset[1].isDeleted, true);
  assert.equal((await createCatalogStore({ invoke: null, storage: destination }).list('asset')).length, 1, 'restore does not revive the retired unit');
});

test('literal saved values, absent versus null, Unicode, order and unknown metadata remain unchanged', () => {
  const input = value(); delete input.catalog.asset[0].notes; input.catalog.asset[1].notes = null;
  input.catalog.setup[0].components.reverse(); input.catalog.supportConfiguration[0].structureJson = 'not parsed: { legacy \\n 𝄞 }';
  input.catalog.product[0].opaque = { array: [false, null, 0, ''], nested: { 'é': '𝄞' } };
  const storage = memory(); service(storage).importArchive(input);
  assert.deepEqual(service(storage).exportArchive(), input);
  assert.equal(Object.hasOwn(current(storage).catalog.asset[0], 'notes'), false);
  assert.equal(current(storage).catalog.asset[1].notes, null);
  assert.equal(Object.hasOwn(current(storage).catalog.supportConfiguration[0], 'createdAt'), false, 'no invented support timestamps');
});

test('exact reimport ignores object-key order and never rewrites any value', () => {
  const storage = memory(), input = value(); service(storage).importArchive(input);
  const before = storage.map.get(key), writes = storage.writes.length;
  const reversed = item => Array.isArray(item) ? item.map(reversed) : item && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).reverse().map(([name, child]) => [name, reversed(child)])) : item;
  const result = service(storage).importArchive(reversed(input));
  assert.equal(result.completed, 0); assert.equal(result.alreadyPresent, 9); assert.equal(result.metadataAdded, 0);
  assert.equal(result.metadataAlreadyPresent, 1); assert.equal(result.written, false);
  assert.equal(storage.map.get(key), before); assert.equal(storage.writes.length, writes);
});

test('all same-ID changes block the whole proposed import before any new records are written', () => {
  for (const change of [
    input => { input.catalog.product[0].updatedAt = 'later'; },
    input => { input.catalog.asset[1].isDeleted = false; },
    input => { input.catalog.setup[0].components.reverse(); },
    input => { input.catalog.setup[0].components[0].settingsSnapshotId = 'other-settings'; },
    input => { input.catalog.supportConfiguration[0].structureJson += ' '; },
    input => { input.catalog.manufacturer[0].legacy.zero = 1; },
    input => { input.catalog.asset[0].notes = 'changed'; },
    input => { input.catalog.legacyArchiveBucket.revision = 1; },
  ]) {
    const storage = memory(); service(storage).importArchive(value()); const before = storage.map.get(key), writes = storage.writes.length;
    const input = value(); input.catalog.venue.unshift({ id: 'new-first', name: 'Must not be written' }); change(input);
    const preview = service(storage).preview(input); assert.equal(preview.canImport, false); assert.ok(preview.conflicts.length >= 1);
    assert.throws(() => service(storage).importArchive(input), error => error.code === 'CATALOG_CONFLICT');
    assert.equal(storage.map.get(key), before); assert.equal(storage.writes.length, writes);
  }
});

test('known relationships are self-contained and invalid parents or duplicate identities reject with zero writes', () => {
  const cases = [
    ['manufacturer', input => { input.catalog.manufacturer = []; }],
    ['product', input => { input.catalog.product = []; }],
    ['venue', input => { input.catalog.venue = []; }],
    ['support', input => { input.catalog.supportConfiguration = []; }],
    ['asset', input => { input.catalog.asset = []; }],
    ['Duplicate', input => { input.catalog.asset.push(copy(input.catalog.asset[0])); }],
    ['component', input => { input.catalog.setup[0].components[1].id = input.catalog.setup[0].components[0].id; }],
    ['component', input => { input.catalog.setup.push({ ...copy(input.catalog.setup[0]), id: 'second-setup' }); }],
    ['nickname', input => { input.catalog.asset[0].nickname = 12; }],
    ['releaseYear', input => { input.catalog.product[0].releaseYear = 1978.5; }],
    ['approximateMassKg', input => { input.catalog.supportConfiguration[0].approximateMassKg = -1; }],
    ['components', input => { input.catalog.setup[0].components = null; }],
  ];
  for (const [message, mutate] of cases) {
    const input = value(); mutate(input); const storage = memory(stateWith(value().catalog)), before = storage.map.get(key);
    assert.throws(() => service(storage).importArchive(input), error => error.message.toLowerCase().includes(message.toLowerCase()));
    assert.equal(storage.writes.length, 0); assert.equal(storage.map.get(key), before);
  }
});

test('separate entity namespaces permit reused IDs but components cannot move between setup owners', () => {
  const input = value(); input.catalog.venue[0].id = 'maker-a'; input.catalog.setup[0].venueId = 'maker-a';
  const storage = memory(); assert.equal(service(storage).importArchive(input).completed, 9);
  const incoming = copy(input); incoming.catalog.setup[0].id = 'another-setup';
  const preview = service(storage).preview(incoming);
  assert.equal(preview.canImport, false); assert.ok(preview.conflicts.some(conflict => conflict.kind === 'setupComponent' && conflict.id === 'component-a'));
  const before = storage.map.get(key); assert.throws(() => service(storage).importArchive(incoming), /conflict/i); assert.equal(storage.map.get(key), before);
});

test('opaque reference IDs and legacy support-position mismatches are disclosed without manufacturing authority', async () => {
  const input = value(); input.catalog.setup[0].deckPositionId = 'legacy-other-position';
  const storage = memory(), preview = service(storage).preview(input);
  assert.deepEqual(preview.references.counts, { booth: 1, deckPosition: 2, settingsSnapshot: 1, total: 4 });
  assert.equal(preview.references.occurrences.length, 5); assert.equal(preview.legacyBindings.length, 1);
  assert.equal(preview.canImport, true); service(storage).importArchive(input);
  assert.deepEqual(service(storage).exportArchive(), input);
  const state = current(storage); assert.equal(Object.hasOwn(state.catalog, 'booth'), false); assert.equal(Object.hasOwn(state.catalog, 'settingsSnapshot'), false);
  const store = createCatalogStore({ invoke: null, storage });
  const renamed = await store.upsert('setup', { ...copy(input.catalog.setup[0]), name: 'Renamed' });
  assert.equal(renamed.deckPositionId, 'legacy-other-position'); assert.equal(renamed.components[0].settingsSnapshotId, 'settings-a');
  await assert.rejects(store.upsert('setup', { ...renamed, venueId: null }), /venue/);
  const replacement = copy(renamed); replacement.components[0].assetId = 'asset-retired';
  await assert.rejects(store.upsert('setup', replacement), /clearing.*settings/i);
});

function longSetupArchive() {
  const input = value(); input.catalog.setup[0].id = 'long-setup-' + 's'.repeat(8192);
  input.catalog.setup[0].components = Array.from({ length: 100 }, (_, i) => ({
    id: `component-${i}`, role: 'turntable', assetId: 'asset-a', settingsSnapshotId: 'settings-a',
  }));
  return input;
}

test('reference diagnostics do not multiply a long saved setup ID across component paths', () => {
  const input = longSetupArchive(), storage = memory(), preview = service(storage).preview(input);
  const sourceBytes = new TextEncoder().encode(JSON.stringify(input)).length;
  const previewBytes = new TextEncoder().encode(JSON.stringify(preview)).length;
  assert.ok(previewBytes < sourceBytes * 4, `preview ${previewBytes} bytes amplified source ${sourceBytes} bytes`);
  assert.equal(preview.references.occurrences.filter(item => item.kind === 'settingsSnapshot').length, 100);
  assert.ok(preview.references.occurrences.every(item => item.path.startsWith('catalog.')));
  service(storage).importArchive(input); assert.deepEqual(service(storage).exportArchive(), input, 'long original identity remains exact');
});

test('component-owner conflicts use bounded target locations instead of repeating a long owner ID', () => {
  const saved = longSetupArchive(), storage = memory(); service(storage).importArchive(saved);
  const incoming = copy(saved); incoming.catalog.setup[0].id = 'new-setup';
  const preview = service(storage).preview(incoming);
  const sourceBytes = new TextEncoder().encode(JSON.stringify(incoming)).length;
  const previewBytes = new TextEncoder().encode(JSON.stringify(preview)).length;
  assert.equal(preview.conflicts.length, 100); assert.equal(preview.canImport, false);
  assert.ok(previewBytes < sourceBytes * 4, `conflict preview ${previewBytes} bytes amplified source ${sourceBytes} bytes`);
  const before = storage.map.get(key); assert.throws(() => service(storage).importArchive(incoming), /conflict/i);
  assert.equal(storage.map.get(key), before); assert.equal(storage.writes.length, 1);
});

test('legacy binding diagnostics do not repeat a shared long support-position value for every setup', () => {
  const input = value(), original = copy(input.catalog.setup[0]);
  const position = 'long-position-' + 'p'.repeat(8192); input.catalog.supportConfiguration[0].deckPositionId = position;
  input.catalog.setup = Array.from({ length: 100 }, (_, i) => ({ ...copy(original), id: `setup-${i}`, deckPositionId: null, components: [] }));
  const storage = memory(), preview = service(storage).preview(input);
  const sourceBytes = new TextEncoder().encode(JSON.stringify(input)).length;
  const previewBytes = new TextEncoder().encode(JSON.stringify(preview)).length;
  assert.equal(preview.legacyBindings.length, 100);
  assert.ok(previewBytes < sourceBytes * 4, `binding preview ${previewBytes} bytes amplified source ${sourceBytes} bytes`);
  assert.ok(preview.references.occurrences.some(item => item.kind === 'deckPosition' && item.id === position), 'the full original shared position is retained once in reference details');
  service(storage).importArchive(input); assert.deepEqual(service(storage).exportArchive(), input);
});

test('non-catalog siblings and every unrelated storage key are preserved by the one-key merge', () => {
  const state = emptyState(); state.runs = [{ id: 'old-run', detail: { exact: true } }]; state.alignments = [{ id: 'alignment' }];
  state.deviceProfiles = { known: { productId: 'existing-binding', json: '{legacy profile}' } };
  state.productSpecs = [{ source: 'legacy' }]; state.deviceResults = [{ value: 0 }]; state.midiMaps = { learned: '{ exact map }' };
  state.unknownSibling = { zero: 0, text: '𝄞' };
  const storage = memory(state);
  for (const name of ['deckchek.workspace.v1', 'deckchek.calibration.v1', 'deckchek.ui.v1', 'deckchek.venue-incidents.v1.old', 'deckchek.support-isolation.v1.old']) storage.map.set(name, 'Keep exact unrelated bytes');
  const before = [...storage.map.entries()].filter(([name]) => name !== key);
  service(storage).importArchive(value());
  const after = current(storage); delete after.catalog; const expected = copy(state); delete expected.catalog;
  assert.deepEqual(after, expected); assert.deepEqual([...storage.map.entries()].filter(([name]) => name !== key), before);
  assert.deepEqual(storage.writes, [key]);
  const archive = service(storage).exportArchive(); assert.deepEqual(Object.keys(archive).sort(), ['catalog', 'exportedAt', 'format', 'formatVersion']);
});

test('unknown catalog metadata is opaque, additive and safe for prototype-shaped keys', () => {
  const input = JSON.parse(JSON.stringify(value()).replace('"legacyArchiveBucket":', '"__proto__":'));
  input.catalog.constructor = { opaque: true }; input.catalog.booth = [{ id: 'untrusted-authority', venueId: 'not-resolved' }];
  const state = emptyState(); state.catalog.retainedUnknown = { text: 'old' };
  const storage = memory(state); service(storage).importArchive(input);
  const exported = service(storage).exportArchive();
  assert.deepEqual(exported.catalog.__proto__, input.catalog.__proto__); assert.deepEqual(exported.catalog.constructor, { opaque: true });
  assert.deepEqual(exported.catalog.retainedUnknown, { text: 'old' });
  assert.equal({}.unknownRecords, undefined); assert.equal({}.opaque, undefined);
  assert.equal(service(storage).preview(input).references.counts.booth, 1, 'opaque bucket does not become a booth authority');
});

test('missing legacy collections mean empty collections without dropping unknown catalog or sibling values', () => {
  const state = { catalog: { venue: [{ id: 'legacy-venue', name: 'Legacy' }], future: { value: 0 } }, sibling: ['legacy'] };
  const storage = memory(state), exported = service(storage).exportArchive();
  assert.equal(exported.catalog.asset.length, 0); assert.deepEqual(exported.catalog.future, { value: 0 });
  const input = empty(); input.catalog.manufacturer.push({ id: 'added', name: 'New' }); service(storage).importArchive(input);
  assert.deepEqual(current(storage).sibling, ['legacy']); assert.deepEqual(current(storage).catalog.venue, state.catalog.venue);
});

test('corrupt sources, corrupt targets and inaccessible storage cannot claim an empty successful archive', () => {
  for (const raw of ['{broken', 'null', '[]', '{}', '{"catalog":[]}', '{"catalog":{"asset":{}}}', JSON.stringify({ catalog: { asset: [{ id: 'broken', nickname: 'Missing product', productId: 'missing' }] } })]) {
    const storage = memory(raw);
    assert.throws(() => service(storage).exportArchive()); assert.throws(() => service(storage).preview(value())); assert.throws(() => service(storage).importArchive(value()));
    assert.equal(storage.map.get(key), raw); assert.equal(storage.writes.length, 0);
  }
  for (const storage of [null, {}, { getItem() { throw new Error('read blocked'); } }, { getItem: () => undefined }, { getItem: () => 42 }]) {
    assert.throws(() => service(storage).exportArchive()); assert.throws(() => service(storage).importArchive(value()));
  }
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('global blocked'); } });
  try {
    assert.doesNotThrow(() => createCatalogArchive());
    assert.throws(() => createCatalogArchive().exportArchive(), /global blocked/);
    assert.equal(service(memory()).preview(value()).canImport, true, 'injected storage does not touch unrelated global storage');
  } finally { if (old) Object.defineProperty(globalThis, 'localStorage', old); else delete globalThis.localStorage; }
});

test('read-only export is available but a write failure retains the original complete value and supports retry', () => {
  const source = memory(stateWith(value().catalog)); assert.deepEqual(service({ getItem: source.getItem.bind(source) }).exportArchive(), value());
  const storage = memory(emptyState()), before = storage.map.get(key), set = storage.setItem;
  storage.setItem = () => { throw new Error('Quota full'); };
  assert.throws(() => service(storage).importArchive(value()), /Quota/); assert.equal(storage.map.get(key), before);
  storage.setItem = set; assert.equal(service(storage).importArchive(value()).completed, 9); assert.deepEqual(storage.writes, [key]);
  const saved = storage.map.get(key), result = service(storage).importArchive(value());
  assert.equal(result.completed, 0); assert.equal(storage.map.get(key), saved); assert.deepEqual(storage.writes, [key]);
});

test('raw target is rechecked immediately before the one write and an intervening writer is preserved', () => {
  const storage = memory(emptyState()), get = storage.getItem; let reads = 0;
  const newer = { ...emptyState(), externalWriter: { keep: 'exact' } };
  storage.getItem = function(name) { if (++reads === 2) this.map.set(key, JSON.stringify(newer)); return get.call(this, name); };
  assert.throws(() => service(storage).importArchive(value()), error => error.code === 'CATALOG_CHANGED');
  assert.deepEqual(current(storage), newer); assert.equal(storage.writes.length, 0);
  storage.getItem = get; assert.equal(service(storage).importArchive(value()).completed, 9); assert.deepEqual(current(storage).externalWriter, newer.externalWriter);
});

test('empty archive and exact catalog metadata do not materialize or rewrite storage', () => {
  const storage = memory(); assert.deepEqual(service(storage).exportArchive(), empty());
  assert.equal(service(storage).importArchive(empty()).written, false); assert.equal(storage.map.has(key), false);
  const input = empty(); input.catalog.opaque = { empty: null };
  assert.equal(service(storage).importArchive(input).metadataAdded, 1); assert.equal(storage.writes.length, 1);
  const before = storage.map.get(key); assert.equal(service(storage).importArchive(input).written, false); assert.equal(storage.map.get(key), before);
});

test('non-JSON or lossy programmatic values reject rather than normalize their metadata', () => {
  const changes = [
    input => { input.catalog.product[0].unknown = -0; },
    input => { input.catalog.product[0].unknown = NaN; },
    input => { input.catalog.product[0].unknown = Infinity; },
    input => { input.catalog.product[0].unknown = undefined; },
    input => { input.catalog.product[0].unknown = new Date(); },
    input => { input.catalog.product[0].unknown = [1, , 3]; },
    input => { input.catalog.product[0].unknown = [1]; input.catalog.product[0].unknown.extra = 'lost'; },
    input => { Object.defineProperty(input.catalog.product[0], 'hidden', { value: 'lost', enumerable: false }); },
    input => { input.catalog.product[0][Symbol('lost')] = 'symbol'; },
    input => { input.catalog.product[0].unknown = input; },
    input => { let nested = input.catalog.product[0]; for (let i = 0; i < 25; i++) nested = nested.child = {}; },
  ];
  for (const change of changes) {
    const input = value(); change(input); const storage = memory();
    assert.throws(() => serializeCatalogArchive(input)); assert.throws(() => service(storage).importArchive(input)); assert.equal(storage.writes.length, 0);
  }
});

test('record caps include setup components and reject rather than silently truncating', () => {
  const input = empty(); input.catalog.venue = Array.from({ length: MAX_CATALOG_ARCHIVE_RECORDS + 1 }, (_, i) => ({ id: `v${i}`, name: 'Venue' }));
  assert.throws(() => serializeCatalogArchive(input), /10,000/);
  const components = value(); components.catalog.setup[0].components = Array.from({ length: MAX_CATALOG_ARCHIVE_RECORDS }, (_, i) => ({ id: `c${i}`, role: 'turntable', assetId: 'asset-a' }));
  const storage = memory(); assert.throws(() => service(storage).importArchive(components), /10,000/); assert.equal(storage.writes.length, 0);
  const full = empty(); full.catalog.venue = Array.from({ length: MAX_CATALOG_ARCHIVE_RECORDS }, (_, i) => ({ id: `v${i}`, name: 'Venue' }));
  const destination = memory(stateWith(full.catalog)), before = destination.map.get(key), addition = empty();
  addition.catalog.venue = [{ id: 'one-more', name: 'Extra venue' }];
  assert.throws(() => service(destination).importArchive(addition), /10,000/);
  assert.equal(destination.map.get(key), before); assert.equal(destination.writes.length, 0);
});

test('programmatic archive accessors are rejected without evaluation', () => {
  const accessor = value(); let read = false;
  Object.defineProperty(accessor, 'format', { enumerable: true, get() { read = true; return 'deckchek-catalog'; } });
  assert.throws(() => service(memory()).importArchive(accessor)); assert.equal(read, false, 'validation must not invoke a supplied accessor');
});

test('non-array objects inheriting Array.prototype are rejected as non-plain JSON', () => {
  const exotic = value(); exotic.catalog.product[0].unknown = Object.assign(Object.create(Array.prototype), { saved: 'value' });
  assert.throws(() => service(memory()).importArchive(exotic));
});

test('UTF-8 file, raw storage and merged storage bounds reject complete operations before writes', () => {
  assert.throws(() => parseCatalogArchive('é'.repeat(MAX_CATALOG_ARCHIVE_BYTES / 2 + 1)), /32 MiB/);
  const tooLarge = memory(' '.repeat(MAX_CATALOG_ARCHIVE_BYTES + 1));
  assert.throws(() => service(tooLarge).exportArchive(), /32 MiB/); assert.throws(() => service(tooLarge).importArchive(empty()), /32 MiB/);
  const half = 'x'.repeat(MAX_CATALOG_ARCHIVE_BYTES / 2 + 1000), state = { ...emptyState(), retainedSibling: half };
  const storage = memory(state), before = storage.map.get(key), input = empty(); input.catalog.opaque = half;
  assert.throws(() => service(storage).importArchive(input), /32 MiB/); assert.equal(storage.map.get(key), before); assert.equal(storage.writes.length, 0);
});

test('the three browser file formats reject one another and unsupported envelopes', () => {
  const text = serializeCatalogArchive(value()); assert.throws(() => parseWorkspaceJson(text)); assert.throws(() => parseVenueHistoryArchive(text));
  for (const change of [input => { input.format = 'deckchek-workspace'; }, input => { input.formatVersion = 2; }, input => { input.exportedAt = '2026-02-30T00:00:00.000Z'; }, input => { input.extra = true; }, input => { delete input.catalog.venue; }]) {
    const input = value(); change(input); assert.throws(() => parseCatalogArchive(JSON.stringify(input)));
  }
});

test('actual device-library sync keeps a custom imported graph and existing noncatalog profile bindings separate', async () => {
  const storage = memory(); service(storage).importArchive(value());
  await createCatalogStore({ invoke: null, storage }).syncDeviceProfiles([profile], { createAssets: false });
  const exported = service(storage).exportArchive();
  for (const entity of ['manufacturer', 'product', 'asset', 'setup', 'venue', 'supportConfiguration']) {
    for (const original of fixture.catalog[entity]) assert.deepEqual(row(exported.catalog, entity, original.id), original);
  }
  assert.deepEqual(exported.catalog.legacyArchiveBucket, fixture.catalog.legacyArchiveBucket);
  assert.equal(current(storage).deviceProfiles[profile.id].productId === 'product-a', false);
});

test('already-seeded same-model destination never remaps imported asset IDs or its existing Devices binding', async () => {
  const storage = memory(), store = createCatalogStore({ invoke: null, storage });
  const [seeded] = await store.syncDeviceProfiles([profile], { createAssets: false }); const before = current(storage);
  const input = value(); input.catalog.manufacturer[0].name = profile.manufacturer; input.catalog.product[0].model = profile.model;
  service(storage).importArchive(input); const after = current(storage);
  assert.equal(after.catalog.asset.find(asset => asset.id === 'asset-a').productId, 'product-a');
  for (const name of ['deviceProfiles', 'productSpecs', 'deviceResults', 'midiMaps']) assert.deepEqual(after[name], before[name]);
  assert.equal(after.deviceProfiles[profile.id].productId, seeded.productId); assert.notEqual(seeded.productId, 'product-a');
  assert.equal((await store.list('asset', { productId: seeded.productId })).length, 0, 'existing Devices binding does not claim imported assets');
  assert.equal((await store.list('asset')).some(asset => asset.id === 'asset-a'), true, 'Equipment still sees the imported unit');
});

test('subsequent profile synchronization is an existing writer and causes an honest same-ID archive conflict', () => {
  const input = value(); input.catalog.manufacturer[0].name = profile.manufacturer; input.catalog.product[0].model = profile.model;
  const storage = memory(); service(storage).importArchive(input); const synced = loadState(storage);
  syncProfilesLocal(synced, [profile], '2026-11-19T00:00:00.000Z', { createAssets: false }); storage.map.set(key, JSON.stringify(synced));
  const before = storage.map.get(key); assert.equal(service(storage).preview(input).canImport, false);
  assert.throws(() => service(storage).importArchive(input), /conflict/i); assert.equal(storage.map.get(key), before);
});

test('importing a matching current venue enables report lookup without rewriting historical incident context', async () => {
  const storage = memory(), original = { ...copy(incidentFixture.draft), origin: 'operator', recordedAt: incidentFixture.recordedAt };
  original.venueId = 'venue-a'; original.context.venue.id = 'venue-a'; original.context.venue.name = 'Historical venue name';
  const history = { format: 'deckchek-venue-history', formatVersion: 1, exportedAt: stamp, incidents: [original], supportObservations: [], supportComparisons: [] };
  createVenueHistoryArchive({ storage, now: () => stamp }).importArchive(history);
  const historyBytes = [...storage.map.entries()], catalog = createCatalogStore({ invoke: null, storage });
  const options = { catalog, humStore: { list: async () => [] }, incidentStore: createVenueIncidentStore({ invoke: null, storage }), venueId: 'venue-a' };
  assert.equal(await gatherVenueReport(options), null); service(storage).importArchive(value());
  const report = await gatherVenueReport(options); assert.ok(report);
  assert.match(JSON.stringify(report), /Historical venue name/); assert.match(JSON.stringify(report), /Current <img src=x> venue/);
  for (const [name, bytes] of historyBytes) assert.equal(storage.map.get(name), bytes);
});
