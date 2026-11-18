import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createVenueIncidentStore, STORAGE_PREFIX } from '../app/venue-incidents.js';
import { createSupportIsolationStore, compareObservations, SUPPORT_STORAGE_PREFIX } from '../app/support-isolation.js';
import { parseWorkspaceJson, serializeWorkspaceJson } from '../app/export.js';
import {
  createVenueHistoryArchive, parseVenueHistoryArchive, serializeVenueHistoryArchive,
  MAX_ARCHIVE_BYTES, MAX_ARCHIVE_RECORDS,
} from '../app/venue-history-archive.js';

const incidentFixture = JSON.parse(fs.readFileSync(new URL('./contracts/venue-incidents.json', import.meta.url)));
const supportFixture = JSON.parse(fs.readFileSync(new URL('./contracts/support-isolation.json', import.meta.url)));
const copy = value => structuredClone(value);
const stamp = '2026-11-18T14:00:00.000Z';
function memory() {
  const map = new Map();
  return { map, reads: 0, writes: [], get length() { return map.size; }, key: index => [...map.keys()][index] ?? null,
    getItem(key) { this.reads++; return map.get(key) ?? null; },
    setItem(key, value) { this.writes.push(key); map.set(key, String(value)); } };
}
const service = storage => createVenueHistoryArchive({ storage, now: () => stamp });
function incident(id = 'incident-1') {
  return { ...copy(incidentFixture.draft), id, origin: 'operator', recordedAt: incidentFixture.recordedAt };
}
function observation(stage, id = `observation-${stage.toLowerCase()}`) {
  return { ...copy(supportFixture[`observation${stage}`]), id, recordedAt: stamp, contextIssues: [] };
}
function comparison(a, b, id = 'comparison-one') {
  const input = { ...supportFixture.comparison, id, observationAId: a.id, observationBId: b.id };
  return { ...input, pairId: a.pairId, venueId: a.venueId, setupId: a.setupId,
    result: compareObservations(a, b, input), recordedAt: stamp };
}
function archive({ incidents = [incident()], observations, comparisons } = {}) {
  observations ??= [observation('A'), observation('B')];
  comparisons ??= [comparison(observations[0], observations[1])];
  return { format: 'deckchek-venue-history', formatVersion: 1, exportedAt: stamp,
    incidents, supportObservations: observations, supportComparisons: comparisons };
}
const empty = () => archive({ incidents: [], observations: [], comparisons: [] });
const bytes = storage => [...storage.map.entries()];

test('full archive export/import/reload retains oldest evidence beyond every history and report limit', async () => {
  const a = observation('A', 'oldest-A-𐐷'), observations = [a], comparisons = [];
  for (let index = 0; index < 101; index++) {
    const b = observation('B', `B-${index}`); observations.push(b); comparisons.push(comparison(a, b, `comparison-${index}`));
  }
  const input = archive({ incidents: Array.from({ length: 302 }, (_, index) => incident(`incident-${index}-é`)), observations, comparisons });
  input.incidents[0].context.venue.name = 'Historical <img src=x> 𐐷';
  const source = memory(), first = service(source).importArchive(input);
  assert.equal(first.status, 'complete'); assert.equal(first.completed, 505); assert.equal(first.remaining, 0);
  const exported = parseVenueHistoryArchive(serializeVenueHistoryArchive(service(source).exportArchive()));
  assert.equal(exported.incidents.length, 302); assert.equal(exported.supportObservations.length, 102); assert.equal(exported.supportComparisons.length, 101);
  assert.ok(exported.supportObservations.some(row => row.id === a.id));
  assert.ok(exported.incidents.some(row => row.id === input.incidents[0].id));
  const destination = memory(), imported = service(destination).importArchive(exported);
  assert.equal(imported.completed, 505); assert.ok(destination.reads < 12 * 505, 'batch restore does not rescan the entire history for each record');
  const reexport = service(destination).exportArchive();
  for (const key of ['incidents', 'supportObservations', 'supportComparisons']) {
    assert.deepEqual(new Map(reexport[key].map(row => [row.id, row])), new Map(input[key].map(row => [row.id, row])));
  }
  const incidentStore = createVenueIncidentStore({ invoke: null, storage: destination });
  const supportStore = createSupportIsolationStore({ invoke: null, storage: destination });
  assert.equal((await incidentStore.page()).total, 302);
  const bounded = await supportStore.list(); assert.equal(bounded.observationTotal, 102); assert.equal(bounded.comparisonTotal, 101); assert.equal(bounded.observations.length, 50);
});

test('full saved metadata, Unicode, zero power, rejected context and literal JSON text survive without sanitizing', () => {
  const a = observation('A'), b = observation('B');
  a.context.support.legacy = { zero: 0, unicode: '𝄞 Ελληνικά', nested: { enabled: false } };
  a.context.support.structureJson = ' [ { "unknown": "é\\n", "zero": 0 } ]\n';
  a.contextIssues = ['catalog_context_changed'];
  a.calibration = { state: 'rejected', sourceKey: 'historical|4096', profile: '{broken profile', reasons: ['Original rejection <tag>'], applied: false };
  for (const key of ['psdL', 'psdR', 'segmentPowersL', 'segmentPowersR']) a.analysis[key].fill(0);
  for (const key of ['powerL', 'powerR', 'pairPower']) a.analysis[key] = 0;
  for (const key of ['levelDbfsL', 'levelDbfsR', 'levelDbfsPair']) a.analysis[key] = null;
  const input = archive({ observations: [a, b] }), storage = memory();
  service(storage).importArchive(input);
  assert.deepEqual(service(storage).exportArchive(), input);
  assert.ok(input.supportComparisons[0].result.reasons.includes('zero_band_power'));
});

test('exact reimport ignores object-key order and makes zero rewrites including persistence metadata', () => {
  const storage = memory(), input = archive(); service(storage).importArchive(input); const before = bytes(storage), writes = storage.writes.length;
  const reverse = value => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverse(child)])) : value;
  const preview = service(storage).preview(reverse(input)); assert.equal(preview.alreadyPresent, 4); assert.equal(preview.toImport, 0); assert.equal(preview.canImport, true);
  const result = service(storage).importArchive(reverse(input));
  assert.equal(result.completed, 0); assert.equal(result.alreadyPresent, 4); assert.equal(result.remaining, 0); assert.equal(storage.writes.length, writes); assert.deepEqual(bytes(storage), before);
});

test('changed saved times, contextIssues and valid-but-different result values conflict without writes', () => {
  const cases = [
    input => { input.incidents[0].recordedAt = '2026-11-18T15:00:00.000Z'; },
    input => { input.supportObservations[0].recordedAt = '2026-11-18T15:00:00.000Z'; },
    input => { input.supportObservations[0].contextIssues = ['catalog_context_changed']; input.supportComparisons = []; },
    input => { input.supportComparisons[0].result.deltaDb.pair += 1e-10; },
  ];
  for (const change of cases) {
    const storage = memory(), original = archive(); service(storage).importArchive(original); const before = bytes(storage), writes = storage.writes.length;
    const changed = copy(original); change(changed); const preview = service(storage).preview(changed);
    assert.equal(preview.canImport, false); assert.ok(preview.conflicts.length > 0);
    assert.throws(() => service(storage).importArchive(changed), /conflict/i); assert.equal(storage.writes.length, writes); assert.deepEqual(bytes(storage), before);
  }
});

test('incident namespace is independent while support cross-kind IDs conflict', () => {
  const storage = memory(), input = archive(); input.incidents[0].id = input.supportObservations[0].id;
  assert.equal(service(storage).importArchive(input).completed, 4);
  const colliding = empty(); colliding.supportObservations = [observation('A', input.supportComparisons[0].id)];
  const before = bytes(storage); assert.equal(service(storage).preview(colliding).conflicts.length, 1);
  assert.throws(() => service(storage).importArchive(colliding), /conflict/i); assert.deepEqual(bytes(storage), before);
});

test('archive restore neither reads current catalogs nor changes frozen names, associations or times', async () => {
  const storage = memory(), input = archive(); storage.map.set('deckchek.catalog.v1', '{unreadable unrelated current catalog');
  const originalCatalog = storage.map.get('deckchek.catalog.v1'); service(storage).importArchive(input);
  const unavailable = { list: async () => { throw new Error('Catalog was moved or deleted'); } };
  const incidents = createVenueIncidentStore({ invoke: null, storage, catalog: unavailable });
  const support = createSupportIsolationStore({ invoke: null, storage, catalog: unavailable });
  assert.deepEqual((await incidents.list()).items[0], input.incidents[0]);
  assert.deepEqual(await support.getObservation(input.supportObservations[0].id), input.supportObservations[0]);
  assert.equal(storage.map.get('deckchek.catalog.v1'), originalCatalog);
});

test('malformed graph, forged analysis/result, duplicate IDs and unsupported envelope fields fail before writes', () => {
  const mutations = [
    value => { value.supportObservations.shift(); },
    value => { value.supportComparisons[0].result.deltaDb.pair = 99; },
    value => { value.supportObservations[0].analysis.method = 'broadband'; },
    value => { value.supportObservations[0].analysis.psdL[0] = 1; },
    value => { value.supportObservations[1].id = value.supportObservations[0].id; },
    value => { value.supportComparisons[0].id = value.supportObservations[0].id; },
    value => { value.incidents.push(copy(value.incidents[0])); },
    value => { value.origin = 'sensor'; },
    value => { value.formatVersion = 2; },
    value => { value.exportedAt = '2026-02-30T00:00:00.000Z'; },
    value => { value.supportObservations[0].context.support.legacy = Infinity; },
  ];
  for (const change of mutations) {
    const value = archive(), storage = memory(); change(value);
    assert.throws(() => service(storage).importArchive(value)); assert.equal(storage.writes.length, 0); assert.equal(storage.length, 0);
  }
});

test('saved-form validation rejects normalization losses rather than inventing nullable keys or changing notes', () => {
  for (const change of [value => { value.incidents[0].note = ''; }, value => { delete value.incidents[0].context.setup.boothId; }, value => { delete value.supportObservations[0].calibration.profile; }]) {
    const input = archive(), storage = memory(); change(input); const before = copy(input);
    assert.throws(() => service(storage).importArchive(input)); assert.deepEqual(input, before); assert.equal(storage.writes.length, 0);
  }
});

test('corrupt source or target aborts the complete operation and retains exact storage bytes', () => {
  for (const key of [STORAGE_PREFIX + 'broken', SUPPORT_STORAGE_PREFIX + 'observation.broken']) {
    const storage = memory(); service(storage).importArchive(archive()); storage.map.set(key, '{broken'); const before = bytes(storage), writes = storage.writes.length;
    assert.throws(() => service(storage).exportArchive(), /read|storage|invalid|JSON/i);
    assert.throws(() => service(storage).preview(empty()), /read|storage|invalid|JSON/i);
    assert.throws(() => service(storage).importArchive(empty()), /read|storage|invalid|JSON/i);
    assert.deepEqual(bytes(storage), before); assert.equal(storage.writes.length, writes);
  }
});

test('missing, throwing or changing storage enumeration/read cannot claim empty history', () => {
  const targets = [null,
    { key: () => null, getItem: () => null, setItem() {} },
    { length: 1, key: () => null, getItem: () => null, setItem() {} },
    { length: '0', key: () => null, getItem: () => null, setItem() {} },
    { get length() { throw new Error('Length unavailable'); }, key() {}, getItem() {}, setItem() {} },
    { length: 1, key: () => STORAGE_PREFIX + 'broken', getItem() { throw new Error('Read blocked'); }, setItem() {} },
  ];
  for (const storage of targets) { assert.throws(() => service(storage).exportArchive()); assert.throws(() => service(storage).importArchive(empty())); }
});

test('first, middle and last write failures report progress and reload/retry resumes without rewriting successes', () => {
  for (const failAt of [1, 3, 4]) {
    const storage = memory(), input = archive(), originalSet = storage.setItem; let attempt = 0;
    storage.setItem = function(key, value) { if (++attempt === failAt) throw new Error('Quota full'); return originalSet.call(this, key, value); };
    const result = service(storage).importArchive(input);
    assert.equal(result.status, 'partial'); assert.equal(result.completed, failAt - 1); assert.equal(result.alreadyPresent, 0); assert.equal(result.remaining, 5 - failAt);
    assert.match(result.failure.message, /Quota/); const committed = bytes(storage);
    storage.setItem = originalSet; const resumed = service(storage).importArchive(copy(input));
    assert.equal(resumed.status, 'complete'); assert.equal(resumed.completed, 5 - failAt); assert.equal(resumed.alreadyPresent, failAt - 1); assert.equal(resumed.remaining, 0);
    for (const [key, value] of committed) assert.equal(storage.map.get(key), value);
    assert.equal(storage.writes.length, 4);
  }
});

test('comparisons are restored only after their exact original observations and never before graph validation', () => {
  const storage = memory(), originalSet = storage.setItem;
  storage.setItem = function(key, value) {
    if (key.startsWith(SUPPORT_STORAGE_PREFIX + 'comparison.')) {
      const row = JSON.parse(value);
      for (const id of [row.observationAId, row.observationBId]) assert.ok(this.map.has(SUPPORT_STORAGE_PREFIX + 'observation.' + id));
    }
    originalSet.call(this, key, value);
  };
  service(storage).importArchive(archive());
  assert.ok(storage.writes.at(-1).startsWith(SUPPORT_STORAGE_PREFIX + 'comparison.'));
});

test('fresh import preflight detects target changes after preview and makes zero writes', () => {
  const storage = memory(), input = archive(); const preview = service(storage).preview(input); assert.equal(preview.toImport, 4);
  const other = empty(); other.incidents = [incident()]; other.incidents[0].recordedAt = '2026-11-18T16:00:00.000Z'; service(storage).importArchive(other);
  const before = bytes(storage), writes = storage.writes.length; assert.throws(() => service(storage).importArchive(input), /conflict/i);
  assert.deepEqual(bytes(storage), before); assert.equal(storage.writes.length, writes);
});

test('resource bounds reject complete files/exports and workspace v1 stays separate', () => {
  assert.throws(() => parseVenueHistoryArchive(' '.repeat(MAX_ARCHIVE_BYTES + 1)), /32|large|limit|bound/i);
  const tooMany = empty(); tooMany.incidents = Array(MAX_ARCHIVE_RECORDS + 1).fill(incident());
  assert.throws(() => serializeVenueHistoryArchive(tooMany), /10.?000|limit|bound/i);
  assert.throws(() => parseWorkspaceJson(serializeVenueHistoryArchive(empty())), /workspace/i);
  const workspace = serializeWorkspaceJson({ equipment: [{ id: 'asset-a' }], runs: [{ id: 'run-a' }] });
  assert.deepEqual(parseWorkspaceJson(workspace), { version: 1, equipment: [{ id: 'asset-a' }], runs: [{ id: 'run-a' }] });
  assert.throws(() => parseVenueHistoryArchive(workspace), /archive|format|unsupported/i);
});

test('a late unencodable incident ID fails preflight before any earlier record is appended', () => {
  const input = empty(); input.incidents = [incident('valid-first'), incident('bad\ud800')];
  for (const action of ['preview', 'importArchive']) {
    const storage = memory(); storage.map.set('unrelated', 'preserve me'); const before = bytes(storage);
    assert.throws(() => service(storage)[action](input), /incident|ID|character|encod/i);
    assert.equal(storage.writes.length, 0); assert.deepEqual(bytes(storage), before);
  }
});

test('a preflight-present row that fails its immediate recheck is counted as remaining rather than an exact match', () => {
  const input = archive(), storage = memory(), existing = empty(); existing.supportObservations = [input.supportObservations[0]];
  service(storage).importArchive(existing); storage.writes.length = 0;
  const originalSet = storage.setItem;
  storage.setItem = function(key, value) {
    originalSet.call(this, key, value);
    if (key.startsWith(STORAGE_PREFIX)) {
      const changed = copy(input.supportObservations[0]); changed.recordedAt = '2026-11-18T16:00:00.000Z';
      this.map.set(SUPPORT_STORAGE_PREFIX + 'observation.' + changed.id, JSON.stringify(changed));
    }
  };
  const result = service(storage).importArchive(input);
  assert.equal(result.status, 'partial'); assert.equal(result.completed, 1); assert.equal(result.alreadyPresent, 0); assert.equal(result.remaining, 3);
  assert.equal(storage.writes.length, 1); assert.match(result.failure.message, /different/);
});

test('archive readers stop at explicit record and raw-byte bounds without returning a truncated history', () => {
  const storage = memory(); service(storage).importArchive(archive());
  const incidents = createVenueIncidentStore({ invoke: null, storage });
  const support = createSupportIsolationStore({ invoke: null, storage });
  assert.throws(() => incidents.readArchive({ maxRecords: 0, maxBytes: MAX_ARCHIVE_BYTES }), /bound|limit/i);
  assert.throws(() => incidents.readArchive({ maxRecords: 10, maxBytes: 1 }), /bound|limit/i);
  assert.throws(() => support.readArchive({ maxRecords: 1, maxBytes: MAX_ARCHIVE_BYTES }), /bound|limit/i);
  assert.throws(() => support.readArchive({ maxRecords: 10, maxBytes: 1 }), /bound|limit/i);
});

test('explicit archive storage is independent of an unavailable global catalog or storage getter', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Global storage blocked'); } });
  try {
    const storage = memory(), engine = service(storage); engine.importArchive(archive()); assert.equal(engine.exportArchive().incidents.length, 1);
    const unavailable = createVenueHistoryArchive(); assert.throws(() => unavailable.exportArchive(), /blocked|storage/i);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage;
  }
});

test('noncanonical negative zero cannot silently change during saved-form export or import', () => {
  const input = archive(); input.supportObservations[0].context.support.legacyZero = -0;
  assert.throws(() => serializeVenueHistoryArchive(input), /saved form|canonical|invalid/i);
  const target = memory(); assert.throws(() => service(target).importArchive(input)); assert.equal(target.writes.length, 0);
  const source = memory(); service(source).importArchive(archive());
  const key = SUPPORT_STORAGE_PREFIX + 'observation.observation-a';
  const row = JSON.parse(source.map.get(key)); row.context.support.legacyZero = 314159;
  source.map.set(key, JSON.stringify(row).replace('"legacyZero":314159', '"legacyZero":-0'));
  const before = bytes(source); assert.throws(() => service(source).exportArchive(), /saved form|canonical|invalid/i); assert.deepEqual(bytes(source), before);
});

test('sparse programmatic record arrays are not serialized as invented null records', () => {
  const input = empty(); input.incidents = new Array(1);
  assert.throws(() => serializeVenueHistoryArchive(input), /JSON|invalid|record/i);
});
