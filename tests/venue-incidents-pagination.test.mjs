import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogStore } from '../app/catalog-store.js';
import { createIncidentDraft, createVenueIncidentStore, STORAGE_PREFIX } from '../app/venue-incidents.js';

const occurredAt = '2026-11-18T10:00:00.000Z';
const recordedAt = '2026-11-18T10:00:01.000Z';
const code = wanted => error => error.code === wanted;
const key = row => ({ occurredAt: row.occurredAt, id: row.id });
async function fixture() {
  const data = new Map();
  const storage = { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
    getItem: id => data.get(id) ?? null, setItem: (id, value) => data.set(id, String(value)) };
  const catalog = createCatalogStore({ invoke: null, storage });
  const venues = [await catalog.upsert('venue', { id: 'v1', name: 'Original venue' }), await catalog.upsert('venue', { id: 'v2', name: 'Other venue' })];
  await catalog.upsert('supportConfiguration', { id: 'original-support', name: 'Original support' });
  await catalog.upsert('supportConfiguration', { id: 'different-support', name: 'Replacement support' });
  const setups = [await catalog.upsert('setup', { id: 's1', name: 'Original setup', venueId: 'v1', supportConfigurationId: 'original-support' }),
    await catalog.upsert('setup', { id: 's2', name: 'Second setup', venueId: 'v1' })];
  const store = createVenueIncidentStore({ invoke: null, storage, catalog, now: () => recordedAt });
  const save = (id, options = {}) => store.save(createIncidentDraft({ kind: 'other', venue: venues[options.venue ?? 0],
    setup: options.setup === null ? null : setups[options.setup ?? 0], note: id }, { newId: () => id, now: () => options.time ?? occurredAt }));
  return { data, storage, catalog, store, save, venues, setups };
}
const bytes = f => [...f.data].filter(([id]) => id.startsWith(STORAGE_PREFIX));

test('305 actual saved incidents traverse scalar-ordered pages without loss while a newer event appends', async () => {
  const f = await fixture();
  const numbered = Array.from({ length: 301 }, (_, i) => `event-${String(i).padStart(3, '0')}`);
  for (const id of [...numbered, 'Z', 'a', '\uE000', '🙂']) await f.save(id);
  const expected = ['🙂', '\uE000', ...numbered.toReversed(), 'a', 'Z'];
  const originalBytes = bytes(f);
  let page = await f.store.page({ venueId: 'v1', limit: 100 });
  assert.equal(page.total, 305);
  assert.deepEqual(page.items.map(row => row.id), expected.slice(0, 100));
  assert.deepEqual(page.nextCursor, key(page.items.at(-1)));
  const visited = page.items.map(row => row.id);
  await f.save('newest-append', { time: '2026-11-18T10:00:02.000Z' });
  const afterAppend = bytes(f);
  let pages = 1;
  while (page.nextCursor) {
    const before = structuredClone(page.nextCursor);
    page = await f.store.page({ venueId: 'v1', limit: 100, before });
    assert.equal(page.total, 306, 'total includes rows newer than the cursor');
    assert.equal(page.limit, 100);
    assert.ok(page.items.length <= 100);
    assert.equal(page.hasMore, page.nextCursor !== null);
    visited.push(...page.items.map(row => row.id));
    assert.ok(++pages <= 4, 'each page advances');
  }
  assert.equal(pages, 4);
  assert.deepEqual(visited, expected);
  assert.equal(new Set(visited).size, 305);
  assert.deepEqual(bytes(f), afterAppend, 'page reads do not change retained bytes');
  for (const [id, value] of originalBytes) assert.equal(f.data.get(id), value);

  const exhausted = await f.store.page({ venueId: 'v1', limit: 100, before: key(page.items.at(-1)) });
  assert.deepEqual(exhausted, { items: [], total: 306, limit: 100, hasMore: false, nextCursor: null });
  const newest = await f.store.page({ venueId: 'v1', limit: 100 });
  assert.equal(newest.items[0].id, 'newest-append');
});

test('page context filters, empty selections and recorded support context survive catalog edits and deletion', async () => {
  const f = await fixture();
  await f.save('a'); await f.save('b', { setup: 1 }); await f.save('c', { setup: null });
  await f.save('d', { venue: 1, setup: null });
  const savedBytes = bytes(f);
  const filtered = await f.store.page({ venueId: 'v1', setupId: 's1', limit: 1 });
  assert.equal(filtered.total, 1); assert.equal(filtered.hasMore, false); assert.equal(filtered.nextCursor, null);
  assert.deepEqual(filtered.items.map(row => row.id), ['a']);
  assert.deepEqual(await f.store.page({ venueId: 'v2', setupId: 's1' }), { items: [], total: 0, limit: 100, hasMore: false, nextCursor: null });
  await f.catalog.upsert('setup', { ...f.setups[0], name: 'Renamed', supportConfigurationId: 'different-support' });
  await f.catalog.remove('setup', 's1'); await f.catalog.remove('venue', 'v1');
  const retained = await f.store.page({ setupId: 's1' });
  assert.equal(retained.items[0].context.venue.name, 'Original venue');
  assert.equal(retained.items[0].context.setup.name, 'Original setup');
  assert.equal(retained.items[0].context.setup.supportConfigurationId, 'original-support');
  assert.deepEqual(bytes(f), savedBytes);
});

test('first-page list retains its exact keys, counts and 300/500 limits after the page API is added', async () => {
  const f = await fixture();
  for (const id of ['a', 'b', 'c']) await f.save(id);
  for (const limit of [1, 2, 300, 500]) {
    const listed = await f.store.list({ venueId: 'v1', limit });
    const { nextCursor, ...page } = await f.store.page({ venueId: 'v1', limit });
    assert.deepEqual(Object.keys(listed), ['items', 'total', 'limit', 'hasMore']);
    assert.equal(JSON.stringify(listed), JSON.stringify(page));
    assert.deepEqual(nextCursor, listed.hasMore ? key(listed.items.at(-1)) : null);
  }
  await assert.rejects(f.store.list({ before: { occurredAt, id: 'b' } }), code('INCIDENT_INVALID'));
});

test('page corruption errors preserve stored bytes instead of producing an empty or partial page', async () => {
  const f = await fixture(); await f.save('a'); await f.save('b');
  const badKey = `${STORAGE_PREFIX}a`;
  for (const raw of ['{broken', JSON.stringify({ ...JSON.parse(f.data.get(badKey)), origin: 'sensor' })]) {
    f.data.set(badKey, raw); const before = bytes(f);
    await assert.rejects(f.store.page({ before: { occurredAt, id: 'b' } }), code('INCIDENT_STORAGE'));
    assert.deepEqual(bytes(f), before);
  }
});
