import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gatherVenueReport, venuePrintable, venuePrintData } from '../app/ui/workflows/m6-reports.js';
import { esc } from '../app/ui/dom.js';

const fixture = JSON.parse(await readFile(new URL('./contracts/incident-metric-evidence.json', import.meta.url)));
const incidentFixture = JSON.parse(await readFile(new URL('./contracts/venue-incidents.json', import.meta.url)));
const incident = { ...incidentFixture.draft, origin: 'operator', recordedAt: fixture.recordedAt };
const { configuration, ...summary } = { ...fixture.evidence, origin: 'operator-attached', recordedAt: fixture.recordedAt };
const catalog = { list: async entity => ({ venue: [{ id: 'venue-1', name: 'Club One' }], setup: [], asset: [], supportConfiguration: [] })[entity] };
const base = { catalog, humStore: { list: async () => [] }, incidentStore: { list: async ({ limit }) => ({ items: [incident], total: 1, limit, hasMore: false }) }, venueId: 'venue-1' };
const html = data => venuePrintable.build(data, { esc });

test('actual venue report includes compact saved snapshot summaries with original timing, availability and escaped source', async () => {
  const seen = [];
  const data = await gatherVenueReport({ ...base, metricStore: { native: true, async summaries(rows) { seen.push(structuredClone(rows)); return [{ incident, evidence: summary }]; } } });
  assert.deepEqual(seen, [[incident]]); assert.equal(data.metricEvidence.status, 'loaded');
  const rendered = html(data); assert.match(rendered, /123\.125 ms/); assert.match(rendered, /-3\.125 dB/);
  assert.match(rendered, /generation-1/); assert.match(rendered, /Audio interface &lt;left&gt;/);
  assert.match(rendered, /unavailable/); assert.match(rendered, /host-callback-observation/);
  assert.ok(!rendered.includes('Audio interface <left>')); assert.ok(!rendered.includes('-240 dBFS'), 'unavailable hum placeholders are not displayed as measurements');
});

test('report keeps the 300-incident bound and never requests unrelated full snapshots', async () => {
  const rows = Array.from({ length: 301 }, (_, i) => ({ ...incident, id: `incident-${i}` }));
  let requested;
  const data = await gatherVenueReport({ ...base,
    incidentStore: { list: async filter => { assert.equal(filter.limit, 300); return { items: rows, total: 301, limit: 300, hasMore: true }; } },
    metricStore: { native: true, async summaries(selected) { requested = selected; return selected.map(incident => ({ incident, evidence: null })); }, get() { assert.fail('Reports must use bounded compact summaries'); } },
  });
  assert.equal(requested.length, 300); assert.equal(requested.at(-1).id, 'incident-299');
  assert.equal(data.metricEvidence.items.length, 300); assert.match(html(data), /300.*no saved snapshot/i);
});

test('report distinguishes unsupported, legacy unloaded and checked absence', async () => {
  assert.match(html(await gatherVenueReport(base)), /snapshot.*not loaded/i);
  const browser = await gatherVenueReport({ ...base, metricStore: { native: false, summaries() { assert.fail('Browser has no native read'); } } });
  assert.equal(browser.metricEvidence.status, 'unsupported'); assert.match(html(browser), /snapshot.*desktop/i);
  const absent = await gatherVenueReport({ ...base, metricStore: { native: true, summaries: async rows => rows.map(incident => ({ incident, evidence: null })) } });
  assert.match(html(absent), /1.*no saved snapshot/i);
  assert.match(html(venuePrintData({ venue: { name: 'Legacy' } })), /snapshot.*not loaded/i);
});

test('snapshot summary errors and missing rows abort report preparation instead of claiming no evidence', async () => {
  await assert.rejects(gatherVenueReport({ ...base, metricStore: { native: true, summaries: async () => { throw new Error('Snapshot read failed'); } } }), /Snapshot read failed/);
  await assert.rejects(gatherVenueReport({ ...base, metricStore: { native: true, summaries: async () => [] } }), /snapshot|summar/i);
});
