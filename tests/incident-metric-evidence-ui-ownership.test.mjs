import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { installServiceDom, settle } from './fixtures/service-screen-dom.mjs';

const document = installServiceDom({ after });
const { createVenueIncidentPanel } = await import('../app/ui/workflows/venue-incidents.js');

test('retired history/detail retry buttons cannot replace the current snapshot detail owner', async t => {
  const host = document.createElement('section'); document.body.append(host);
  const venues = [{ id: 'v1', name: 'First venue' }, { id: 'v2', name: 'Second venue' }];
  const rows = venues.map((venue, i) => ({ schemaVersion: 1, id: `event-${i}`, kind: 'other', venueId: venue.id, setupId: null, note: null,
    occurredAt: '2026-11-18T10:00:00.000Z', context: { venue, setup: null }, origin: 'operator', recordedAt: '2026-11-18T10:00:01.000Z' }));
  const calls = [];
  const panel = createVenueIncidentPanel(host, {
    catalog: { list: async entity => entity === 'venue' ? venues : [] },
    store: { native: true, list: async ({ venueId, limit }) => { const items = rows.filter(row => !venueId || row.venueId === venueId); return { items, total: items.length, limit, hasMore: false }; } },
    monitorSources: { list: () => [] }, metricStore: { native: true, get: async row => {
      calls.push(row.id); if (calls.length === 1) throw new Error('First detail unavailable'); return { incident: row, evidence: null };
    } },
  });
  t.after(() => { panel.dispose(); host.remove(); });
  const select = async id => { const element = host.querySelector('#incident-venue'); element.value = id; element.dispatch('change'); await settle(); };
  await settle();
  const retiredRow = host.querySelector('[data-incident-metric-detail="event-0"]');
  await select('v2'); retiredRow.dispatch('click'); await settle();
  assert.deepEqual(calls, [], 'a detached earlier history row cannot start a new detail request');
  host.querySelector('[data-incident-metric-detail="event-1"]').dispatch('click'); await settle();
  const retiredRetry = host.querySelector('#incident-metric-detail').querySelector('button'); assert.ok(retiredRetry);
  await select('v1'); host.querySelector('[data-incident-metric-detail="event-0"]').dispatch('click'); await settle();
  assert.deepEqual(calls, ['event-1', 'event-0']);
  const current = host.querySelector('#incident-metric-detail').textContent;
  retiredRetry.dispatch('click'); await settle();
  assert.deepEqual(calls, ['event-1', 'event-0'], 'a detached failed-detail retry cannot supersede another selected detail');
  assert.equal(host.querySelector('#incident-metric-detail').textContent, current);
});
