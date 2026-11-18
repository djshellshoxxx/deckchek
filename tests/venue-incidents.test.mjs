import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  INCIDENT_TYPES, STORAGE_PREFIX, createIncidentDraft, createVenueIncidentStore,
} from '../app/venue-incidents.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./contracts/venue-incidents.json', import.meta.url), 'utf8'));
const draft = () => structuredClone(fixture.draft);
function memory() {
  const data = new Map();
  return { data, get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}
function catalog() {
  const rows = { venue: [{ id: 'venue-1', name: 'Club One' }, { id: 'venue-2', name: 'Other' }],
    setup: [{ id: 'setup-1', name: 'Left deck', venueId: 'venue-1', boothId: 'booth-1', deckPositionId: 'position-1' }] };
  return { rows, async list(entity) { return structuredClone(rows[entity]); } };
}
function make(options = {}) {
  const storage = options.storage ?? memory(), cat = options.catalog ?? catalog();
  return { storage, catalog: cat, store: createVenueIncidentStore({ invoke: null, storage, catalog: cat, now: () => fixture.recordedAt, ...options }) };
}
const code = wanted => error => error.code === wanted;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('the seven operator incident types round-trip independently with original occurrence and context', async () => {
  const { store } = make();
  assert.deepEqual(INCIDENT_TYPES.map(x => x.id), ['skip', 'feedback', 'hum', 'needle_jump', 'dropout', 'booth_shock', 'other']);
  for (const [index, type] of INCIDENT_TYPES.entries()) {
    const input = { ...draft(), id: `event-${index}`, kind: type.id };
    const saved = await store.save(input);
    assert.deepEqual(saved, { ...input, origin: 'operator', recordedAt: fixture.recordedAt });
    saved.context.venue.name = 'Caller mutation';
  }
  const history = await store.list({ venueId: 'venue-1' });
  assert.equal(history.total, 7); assert.equal(history.hasMore, false);
  assert.ok(history.items.every(x => x.context.venue.name === 'Club One'));
  history.items[0].context.venue.name = 'List mutation';
  assert.equal((await store.list()).items[0].context.venue.name, 'Club One');
});

test('draft creation freezes selected catalog data before caller mutation', () => {
  const venue = { id: 'venue-1', name: 'Club One' }, setup = { id: 'setup-1', name: 'Left deck', venueId: 'venue-1', boothId: 'booth-1', deckPositionId: 'position-1' };
  const input = createIncidentDraft({ kind: 'booth_shock', venue, setup, note: 'Walking beside the left deck' }, { now: () => fixture.draft.occurredAt, newId: () => 'incident-1' });
  assert.deepEqual(input, draft()); venue.name = 'Renamed'; setup.name = 'Moved';
  assert.equal(input.context.venue.name, 'Club One'); assert.equal(input.context.setup.name, 'Left deck');
});

test('exact retry survives renamed, moved and deleted catalog data without refreshing saved context', async () => {
  const { store, catalog: cat, storage } = make();
  const saved = await store.save(draft());
  cat.rows.venue[0].name = 'Renamed'; cat.rows.setup[0].venueId = 'venue-2';
  assert.deepEqual(await store.save(draft()), saved);
  cat.rows.venue = []; cat.rows.setup = [];
  cat.list = async () => { throw new Error('Catalog unavailable after successful save'); };
  assert.deepEqual(await store.save(draft()), saved);
  assert.equal(storage.length, 1);
  await assert.rejects(store.save({ ...draft(), note: 'Changed event' }), code('INCIDENT_CONFLICT'));
});

test('new events require an existing venue and a setup belonging to it; rejection preserves history', async () => {
  const { store, catalog: cat, storage } = make();
  cat.rows.setup[0].venueId = 'venue-2';
  await assert.rejects(store.save(draft()), code('INCIDENT_CONTEXT'));
  cat.rows.setup = [];
  await assert.rejects(store.save(draft()), code('INCIDENT_CONTEXT'));
  cat.rows.venue = [];
  const noSetup = { ...draft(), setupId: null, context: { ...draft().context, setup: null } };
  await assert.rejects(store.save(noSetup), code('INCIDENT_CONTEXT'));
  assert.equal(storage.length, 0);
});

test('unassigned setup remains null and selected-context names are retained verbatim', async () => {
  const { store } = make();
  const input = createIncidentDraft({ venue: { id: 'venue-1', name: '<img src=x onerror=alert(1)>' }, kind: 'hum' }, { now: () => fixture.draft.occurredAt, newId: () => 'event-plain' });
  const row = await store.save(input);
  assert.equal(row.setupId, null); assert.equal(row.context.setup, null);
  assert.equal(row.context.venue.name, '<img src=x onerror=alert(1)>');
});

test('strict draft validation rejects unsupported origin/measurements, invalid dates, oversized Unicode and context disagreement', async () => {
  const { store, storage } = make();
  const invalid = [
    { ...draft(), origin: 'detected' }, { ...draft(), source: 'detected' }, { ...draft(), metrics: { spl: 105 } }, { ...draft(), schemaVersion: 2 },
    { ...draft(), kind: 'automatic_feedback' }, { ...draft(), occurredAt: '2026-02-31T10:00:00.000Z' },
    { ...draft(), occurredAt: '2026-11-18T10:00:00Z' }, { ...draft(), occurredAt: Infinity },
    { ...draft(), note: '🙂'.repeat(501) }, { ...draft(), note: { text: 'wrong type' } },
    { ...draft(), context: { ...draft().context, venue: { id: 'venue-2', name: 'Other' } } },
    { ...draft(), context: { ...draft().context, setup: null } },
    { ...draft(), context: { ...draft().context, setup: { ...draft().context.setup, sensor: 'accelerometer' } } },
  ];
  for (const input of invalid) await assert.rejects(store.save(input), code('INCIDENT_INVALID'));
  assert.equal(storage.length, 0);
  const boundary = { ...draft(), note: '🙂'.repeat(500) };
  assert.equal((await store.save(boundary)).note, boundary.note);
});

test('browser corruption, invalid saved provenance and quota failure never erase or replace history', async () => {
  const { store, storage } = make();
  const key = `${STORAGE_PREFIX}broken`;
  storage.setItem(key, '{broken');
  const before = [...storage.data];
  await assert.rejects(store.list(), code('INCIDENT_STORAGE'));
  await assert.rejects(store.save(draft()), code('INCIDENT_STORAGE'));
  assert.deepEqual([...storage.data], before);
  storage.data.clear();
  await store.save(draft());
  const firstKey = storage.key(0), bad = JSON.parse(storage.getItem(firstKey)); bad.origin = 'sensor';
  storage.setItem(firstKey, JSON.stringify(bad));
  await assert.rejects(store.list(), code('INCIDENT_STORAGE'));
  storage.data.clear();
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  await assert.rejects(store.save(draft()), code('INCIDENT_STORAGE'));
  assert.equal(storage.length, 0);
});

test('two pending same-ID submissions share one stored event and preserve the first submission across awaits', async () => {
  const gate = deferred(), cat = catalog();
  const originalList = cat.list; cat.list = async entity => { await gate.promise; return originalList(entity); };
  const { store, storage } = make({ catalog: cat });
  const input = draft(), first = store.save(input), second = store.save(draft());
  input.note = 'Mutated'; input.context.venue.name = 'Mutated'; gate.resolve();
  assert.deepEqual(await first, await second); assert.equal(storage.length, 1);
  assert.equal((await store.list()).items[0].note, fixture.draft.note);
});

test('overlapping distinct saves retain every event; list filters, deterministic order and limits are explicit', async () => {
  const { store, storage } = make();
  await Promise.all(['a', 'c', 'b'].map(id => store.save({ ...draft(), id })));
  assert.equal(storage.length, 3);
  const latest = await store.list({ venueId: 'venue-1', setupId: 'setup-1', limit: 2 });
  assert.deepEqual(latest.items.map(x => x.id), ['c', 'b']);
  assert.equal(latest.total, 3); assert.equal(latest.limit, 2); assert.equal(latest.hasMore, true);
  assert.equal((await store.list({ venueId: 'venue-2' })).total, 0);
  await assert.rejects(store.list({ limit: 0 }), code('INCIDENT_INVALID'));
  await assert.rejects(store.list({ limit: 501 }), code('INCIDENT_INVALID'));
});

test('independent stores reject overlapping conflicting IDs and use the same scalar tie order as SQLite', async () => {
  const { store, storage, catalog: cat } = make();
  const other = make({ storage, catalog: cat }).store;
  const results = await Promise.allSettled([store.save(draft()), other.save({ ...draft(), note: 'Conflicting submission' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'INCIDENT_CONFLICT');
  assert.equal(storage.length, 1);
  const ordered = make();
  for (const id of ['Z', 'a', '\uE000', '🙂']) await ordered.store.save({ ...draft(), id });
  assert.deepEqual((await ordered.store.list()).items.map(row => row.id), ['🙂', '\uE000', 'a', 'Z']);
});

test('native bridge submits an immutable strict draft and verifies returned operator records', async () => {
  const gate = deferred(), calls = [];
  const expected = { ...draft(), origin: 'operator', recordedAt: fixture.recordedAt };
  const store = createVenueIncidentStore({ invoke: async (cmd, args) => {
    calls.push([cmd, args]); await gate.promise;
    return cmd === 'venue_incident_save' ? structuredClone(expected) : { items: [structuredClone(expected)], total: 1, limit: 100, hasMore: false };
  } });
  const input = draft(), pending = store.save(input); input.context.venue.name = 'Changed';
  assert.deepEqual(calls[0], ['venue_incident_save', { input: draft() }]);
  gate.resolve(); assert.deepEqual(await pending, expected);
  assert.equal((await store.list()).items[0].origin, 'operator');
  const bad = createVenueIncidentStore({ invoke: async () => ({ ...expected, origin: 'detected' }) });
  await assert.rejects(bad.save(draft()), code('INCIDENT_STORAGE'));
  for (const result of [null, { items: [], total: 1, limit: 100, hasMore: true }, { items: [expected], total: 1, limit: 100, hasMore: false, sensor: true }]) {
    await assert.rejects(createVenueIncidentStore({ invoke: async () => result }).list(), code('INCIDENT_STORAGE'));
  }
});
