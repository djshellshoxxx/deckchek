import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installServiceDom, deferred, settle } from './fixtures/service-screen-dom.mjs';

const document = installServiceDom({ after });
window.addEventListener = () => {}; window.removeEventListener = () => {};
const { createVenueIncidentPanel } = await import('../app/ui/workflows/venue-incidents.js');
const fixture = JSON.parse(await readFile(new URL('./contracts/incident-metric-evidence.json', import.meta.url)));
const incidentFixture = JSON.parse(await readFile(new URL('./contracts/venue-incidents.json', import.meta.url)));
const venue = { id: 'venue-1', name: 'Club One' }, other = { id: 'venue-2', name: 'Other' };
const setup = { id: 'setup-1', name: 'Left deck', venueId: venue.id, boothId: 'booth-1', deckPositionId: 'position-1' };
const catalog = { list: async entity => structuredClone({ venue: [venue, other], setup: [setup], asset: [] }[entity]) };
const stamp = incidentFixture.draft.occurredAt;
const saved = draft => ({ ...draft, origin: 'operator', recordedAt: fixture.recordedAt });
function mount(t, options = {}) {
  const host = document.createElement('section'); document.body.append(host);
  const ordinary = [], paired = [], rows = [], downloads = []; let current = structuredClone(fixture.evidence), reads = 0;
  const sources = { list: () => current ? [structuredClone(current)] : [], snapshot(selector, draft) {
    reads++; if (!current || selector.generation !== current.source.generation) throw new Error('Selected live-monitor source is unavailable; choose again or turn off attachment.');
    return { ...structuredClone(current), incidentId: draft.id, pressAt: draft.occurredAt };
  } };
  const store = { native: true, list: async ({ limit }) => ({ items: structuredClone(rows), total: rows.length, limit, hasMore: false }),
    save: async draft => { ordinary.push(structuredClone(draft)); const row = saved(draft); rows.push(row); return row; } };
  const metricStore = { native: true, async save(draft, evidence) {
    paired.push({ draft: structuredClone(draft), evidence: structuredClone(evidence) });
    const pair = { incident: saved(draft), evidence: { ...evidence, origin: 'operator-attached', recordedAt: fixture.recordedAt } };
    rows.push(pair.incident); return pair;
  }, async get(row) { return { incident: row, evidence: { ...fixture.evidence, incidentId: row.id, pressAt: row.occurredAt, origin: 'operator-attached', recordedAt: fixture.recordedAt } }; } };
  const panel = createVenueIncidentPanel(host, { catalog, store, metricStore, monitorSources: sources, now: () => stamp,
    newId: () => 'ui-metric-1', download: (name, text) => downloads.push({ name, text }), ...options });
  t.after(() => { panel.dispose(); host.remove(); });
  const byId = id => host.querySelector(`#${id}`);
  return { host, panel, store, metricStore, ordinary, paired, rows, downloads, byId,
    get reads() { return reads; }, setSource(source) { current = source; },
    choose(id, value) { const node = byId(id); assert.ok(node, id); node.value = value; node.dispatch('change'); },
    async ready() { await settle(); this.choose('incident-venue', venue.id); await settle(); this.choose('incident-setup', setup.id); },
    attach() { const box = byId('incident-metric-attach'); assert.ok(box, 'Native panel must offer the explicit default-off attachment'); box.checked = true; box.dispatch('change');
      const select = byId('incident-metric-source'); assert.ok(select); select.value = select.children.find(option => option.value)?.value; select.dispatch('change'); },
    press() { const button = host.querySelector('[data-incident-kind="hum"]'); if (!button.disabled) button.dispatch('click'); },
  };
}

test('actual panel defaults attachment off and keeps ordinary v1 save unchanged', async t => {
  const s = mount(t); await s.ready();
  assert.ok(s.byId('incident-metric-attach')); assert.equal(Boolean(s.byId('incident-metric-attach').checked), false);
  s.press(); await settle(); assert.equal(s.ordinary.length, 1); assert.equal(s.paired.length, 0); assert.equal(s.reads, 0);
  assert.deepEqual(Object.keys(s.ordinary[0]), Object.keys(incidentFixture.draft));
});

test('actual panel freezes the selected pair before await and retains it across context, source and visibility changes', async t => {
  const gate = deferred(), calls = []; let attempt = 0;
  const metricStore = { native: true, get: async () => {}, save: async (draft, evidence) => {
    calls.push(structuredClone({ draft, evidence })); if (++attempt === 1) return gate.promise;
    return { incident: saved(draft), evidence: { ...evidence, origin: 'operator-attached', recordedAt: fixture.recordedAt } };
  } };
  const s = mount(t, { metricStore }); await s.ready(); s.attach();
  s.byId('incident-note').value = 'Original'; s.press(); s.press();
  assert.equal(calls.length, 1); assert.equal(s.reads, 1); assert.equal(calls[0].draft.note, 'Original');
  assert.equal(calls[0].evidence.metrics.snrDb, -3.125); assert.equal(calls[0].evidence.incidentId, calls[0].draft.id);
  s.choose('incident-venue', other.id); s.setSource(null); s.panel.setActive(false);
  const hidden = s.host.textContent; gate.reject(new Error('Lost acknowledgement')); await settle(); assert.equal(s.host.textContent, hidden);
  s.panel.setActive(true); await settle(); assert.match(s.byId('incident-save-status').textContent, /Lost acknowledgement/);
  s.byId('incident-save-retry').dispatch('click'); await settle();
  assert.deepEqual(calls[0], calls[1]); assert.equal(s.reads, 1, 'retry never observes a later frame');
  assert.equal(s.ordinary.length, 0); assert.equal(s.byId('incident-venue').value, other.id);
  assert.match(s.byId('incident-save-status').textContent, /snapshot|reading/i);
});

test('a retired explicitly selected source requires an explicit decision, with no silent incident-only save', async t => {
  const s = mount(t); await s.ready(); s.attach(); s.setSource(null); s.press(); await settle();
  assert.match(s.byId('incident-save-status').textContent, /unavailable/); assert.equal(s.ordinary.length, 0); assert.equal(s.paired.length, 0);
  const box = s.byId('incident-metric-attach'); box.checked = false; box.dispatch('change'); s.press(); await settle();
  assert.equal(s.ordinary.length, 1); assert.equal(s.paired.length, 0);
});

test('snapshot source labels expose timing and association as text; detail and JSON retain the saved pair', async t => {
  const s = mount(t); await s.ready(); s.attach();
  assert.match(s.host.textContent, /operator|selected input/i); assert.match(s.host.textContent, /generation-1/);
  assert.match(s.host.textContent, /123\.125/); assert.match(s.host.textContent, /1.?2/);
  s.press(); await settle();
  const detail = s.host.querySelector('[data-incident-metric-detail]'); assert.ok(detail); detail.dispatch('click'); await settle();
  assert.match(s.byId('incident-metric-detail').textContent, /-3\.125 dB/);
  assert.match(s.byId('incident-metric-detail').textContent, /unavailable/i);
  assert.match(s.byId('incident-metric-detail').textContent, /host-callback-observation/);
  assert.equal(s.host.querySelectorAll('left').length, 0, 'device text is escaped');
  s.byId('incident-metric-download').dispatch('click'); assert.equal(s.downloads.length, 1);
  const pair = JSON.parse(s.downloads[0].text); assert.equal(pair.incident.id, 'ui-metric-1'); assert.equal(pair.evidence.metrics.snrDb, -3.125);
  assert.deepEqual(pair.evidence.unavailable, fixture.evidence.unavailable);
});

test('detail errors and stale disposed responses never claim absence or render a newer panel', async t => {
  const load = deferred(); const s = mount(t, { metricStore: { native: true, save: async () => {}, get: async () => load.promise } });
  await s.ready(); s.press(); await settle();
  const button = s.host.querySelector('[data-incident-metric-detail]'); assert.ok(button); button.dispatch('click');
  s.panel.dispose(); const disposed = s.host.textContent; load.reject(new Error('Read failure')); await settle(); assert.equal(s.host.textContent, disposed);
  const bad = mount(t, { metricStore: { native: true, save: async () => {}, get: async () => { throw new Error('Read failure'); } } });
  await bad.ready(); bad.press(); await settle(); bad.host.querySelector('[data-incident-metric-detail]').dispatch('click'); await settle();
  assert.match(bad.byId('incident-metric-detail').textContent, /Read failure/);
  assert.ok(!/No saved snapshot/.test(bad.byId('incident-metric-detail').textContent));
});

test('browser panel has no native attachment or detail actions', async t => {
  const s = mount(t, { store: { native: false, list: async ({ limit }) => ({ items: [], total: 0, limit, hasMore: false }), save: async draft => saved(draft) } });
  await s.ready(); assert.equal(s.byId('incident-metric-attach'), null); assert.equal(s.host.querySelector('[data-incident-metric-detail]'), null);
});
