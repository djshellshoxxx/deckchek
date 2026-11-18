import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { installServiceDom, deferred, settle } from './fixtures/service-screen-dom.mjs';
import { createVenueIncidentStore } from '../app/venue-incidents.js';

const document = installServiceDom({ after });
window.addEventListener = () => {};
window.removeEventListener = () => {};
const { createVenueIncidentPanel } = await import('../app/ui/workflows/venue-incidents.js');
const { createHumScreen } = await import('../app/ui/workflows/hum.js');
const { gatherVenueReport, venuePrintable } = await import('../app/ui/workflows/m6-reports.js');
const { esc } = await import('../app/ui/dom.js');
const time = '2026-11-18T10:00:00.123Z';
const venues = [{ id: 'v1', name: 'Club One' }, { id: 'v2', name: 'Club Two' }];
const setups = [{ id: 's1', venueId: 'v1', name: 'Left deck' }, { id: 's2', venueId: 'v2', name: 'Other deck' }];
const catalog = { list: async entity => structuredClone({ venue: venues, setup: setups, asset: [] }[entity]) };
let next = 0;
function memory() {
  const map = new Map();
  return { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}
function mount(t, options = {}) {
  const host = document.createElement('section'); document.body.append(host);
  const store = options.store ?? createVenueIncidentStore({ invoke: null, storage: memory(), catalog, now: () => '2026-11-18T10:00:01.000Z' });
  const panel = createVenueIncidentPanel(host, { catalog, store, now: () => time, newId: () => `ui-${++next}`, ...options });
  t.after(() => { panel.dispose(); host.remove(); });
  const byId = id => host.querySelector(`#${id}`);
  return { host, panel, store, byId,
    choose(id, value) { const input = byId(id); input.value = value; input.dispatch('change'); },
    press(kind) { const button = host.querySelector(`[data-incident-kind="${kind}"]`); if (!button.disabled) button.dispatch('click'); },
  };
}

test('production panel records an operator press and the real venue report includes its immutable context', async t => {
  const s = mount(t); await settle();
  s.choose('incident-venue', 'v1'); await settle(); s.choose('incident-setup', 's1');
  s.byId('incident-note').value = '<img src=x onerror=alert(1)>';
  s.press('booth_shock'); await settle();
  const saved = (await s.store.list()).items[0];
  assert.equal(saved.kind, 'booth_shock'); assert.equal(saved.occurredAt, time);
  assert.equal(saved.origin, 'operator'); assert.equal(saved.context.setup.name, 'Left deck');
  assert.match(s.byId('incident-save-status').textContent, /Saved.*Club One/);
  assert.match(s.byId('incident-history').textContent, /Booth shock/);
  assert.equal(s.host.querySelectorAll('img').length, 0, 'note is text, never markup');
  const data = await gatherVenueReport({ catalog, humStore: { list: async () => [] }, incidentStore: s.store, venueId: 'v1' });
  const html = venuePrintable.build(data, { esc });
  assert.match(html, /Booth shock/); assert.match(html, /&lt;img/); assert.ok(!html.includes('<img src=x'));
});

test('catalog errors are explicit and retryable, not an empty venue list', async t => {
  let fail = true;
  const s = mount(t, { catalog: { list: async entity => { if (fail) throw new Error('Catalog unavailable'); return catalog.list(entity); } } });
  await settle(); assert.match(s.host.textContent, /Catalog unavailable/);
  assert.ok(!/Create a venue/.test(s.host.textContent));
  assert.match(s.byId('incident-history').textContent, /No incidents recorded/, 'saved history loads independently of the current catalog');
  fail = false; s.byId('incident-catalog-retry').dispatch('click'); await settle();
  assert.ok(s.byId('incident-venue')); assert.ok(s.byId('incident-venue').children.some(option => option.value === 'v1'));
});

test('a stale history success or error cannot overwrite the newer venue selection', async t => {
  for (const outcome of ['success', 'failure']) {
    const first = deferred();
    const store = { native: false, save: async () => {}, list: async ({ venueId, limit }) => venueId === 'v1' ? first.promise : { items: [], total: 0, limit, hasMore: false } };
    const s = mount(t, { store }); await settle(); s.choose('incident-venue', 'v1'); await settle();
    s.choose('incident-venue', 'v2'); await settle();
    if (outcome === 'success') first.resolve({ items: [], total: 99, limit: 100, hasMore: true }); else first.reject(new Error('Old venue failed'));
    await settle(); assert.equal(s.byId('incident-venue').value, 'v2');
    assert.match(s.byId('incident-history').textContent, /No incidents recorded/);
    assert.ok(!s.host.textContent.includes('99')); assert.ok(!s.host.textContent.includes('Old venue failed'));
  }
});

test('a failed or lost-response save retries the original event and cannot duplicate it', async t => {
  const durable = createVenueIncidentStore({ invoke: null, storage: memory(), catalog, now: () => '2026-11-18T10:00:01.000Z' });
  const calls = []; let fail = true;
  const store = { native: false, list: filter => durable.list(filter), save: async input => {
    calls.push(structuredClone(input)); const record = await durable.save(input);
    if (fail) { fail = false; throw new Error('Response lost'); } return record;
  } };
  const s = mount(t, { store }); await settle(); s.choose('incident-venue', 'v1'); await settle();
  s.byId('incident-note').value = 'Original'; s.press('feedback'); await settle();
  assert.match(s.byId('incident-save-status').textContent, /Response lost/);
  assert.ok(s.byId('incident-save-retry')); s.byId('incident-note').value = 'Later notes';
  s.byId('incident-save-retry').dispatch('click'); await settle();
  assert.deepEqual(calls[0], calls[1]); assert.equal((await durable.list()).total, 1);
  assert.equal((await durable.list()).items[0].note, 'Original');
});

test('pending save keeps its original context when the venue changes and does not inject a row into the new venue', async t => {
  const gate = deferred(), calls = [];
  const store = { native: false, list: async ({ limit }) => ({ items: [], total: 0, limit, hasMore: false }),
    save: async input => { calls.push(structuredClone(input)); await gate.promise; return { ...input, origin: 'operator', recordedAt: '2026-11-18T10:00:01.000Z' }; } };
  const s = mount(t, { store }); await settle(); s.choose('incident-venue', 'v1'); await settle();
  s.press('hum'); s.press('hum'); assert.equal(calls.length, 1);
  s.choose('incident-venue', 'v2'); await settle(); gate.resolve(); await settle();
  assert.equal(calls[0].venueId, 'v1'); assert.equal(calls[0].context.venue.name, 'Club One');
  assert.equal(s.byId('incident-venue').value, 'v2'); assert.match(s.byId('incident-history').textContent, /No incidents recorded/);
  assert.match(s.byId('incident-save-status').textContent, /Saved.*Club One/);
});

test('hiding and showing the cached panel preserves a failed pending draft; disposal prevents late rendering', async t => {
  const gate = deferred(); const store = { native: false, list: async ({ limit }) => ({ items: [], total: 0, limit, hasMore: false }), save: async () => gate.promise };
  const s = mount(t, { store }); await settle(); s.choose('incident-venue', 'v1'); await settle(); s.press('skip');
  s.panel.setActive(false); const hidden = s.host.textContent; gate.reject(new Error('Write failed while hidden')); await settle();
  assert.equal(s.host.textContent, hidden); s.panel.setActive(true); await settle();
  assert.match(s.byId('incident-save-status').textContent, /Write failed while hidden/); assert.ok(s.byId('incident-save-retry'));
  const load = deferred(); const other = mount(t, { catalog: { list: () => load.promise } });
  other.panel.dispose(); const stopped = other.host.textContent; load.resolve([]); await settle();
  assert.equal(other.host.textContent, stopped);
});

test('history errors and row limits are disclosed and browser workspace portability is explicit', async t => {
  let fail = true;
  const store = { native: false, save: async () => {}, list: async ({ limit }) => {
    if (fail) throw new Error('History unreadable'); return { items: [], total: 301, limit, hasMore: true };
  } };
  const s = mount(t, { store }); await settle(); s.choose('incident-venue', 'v1'); await settle();
  assert.match(s.byId('incident-history').textContent, /History unreadable/);
  assert.ok(!/No incidents recorded/.test(s.byId('incident-history').textContent));
  fail = false; s.byId('incident-history-retry').dispatch('click'); await settle();
  assert.match(s.byId('incident-history').textContent, /Showing 0 of 301/); assert.match(s.host.textContent, /older records remain stored/);
  assert.match(s.host.textContent, /workspace JSON does not include incidents/i);
});

test('the actual Hum screen exposes the incident panel and retains its selected venue across tab navigation', async t => {
  const section = document.createElement('section'); document.body.append(section);
  const store = createVenueIncidentStore({ invoke: null, storage: memory(), catalog, now: () => '2026-11-18T10:00:01.000Z' });
  const api = createHumScreen(section, { incidentOptions: { catalog, store, now: () => time, newId: () => `shell-${++next}` } });
  t.after(() => { api.onHide(); section.remove(); });
  section.querySelector('#hum-tab-incidents').dispatch('click'); await settle();
  const venue = section.querySelector('#incident-venue'); venue.value = 'v1'; venue.dispatch('change'); await settle();
  section.querySelector('[data-incident-kind="other"]').dispatch('click'); await settle();
  assert.equal((await store.list()).total, 1);
  section.querySelector('#hum-tab-hum').dispatch('click'); section.querySelector('#hum-tab-incidents').dispatch('click'); await settle();
  assert.equal(section.querySelector('#incident-venue').value, 'v1');
  assert.match(section.querySelector('#incident-history').textContent, /Other/);
});
