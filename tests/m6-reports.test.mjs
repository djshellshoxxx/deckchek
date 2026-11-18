// FS-03 DoD: every M6 result (and the venue report) has a printable PDF kind that renders real content, escapes
// user text, and registers under a valid name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPrintableKind, composePrintable, printableKinds } from '../app/report-pdf.js';
import { createHumRunStore, HumRunError } from '../app/hum-tree.js';
import {
  M6_KINDS, latencyPrintData, stylusPrintData, wearMapPrintData, scratchPrintData, humPrintData, venuePrintData, gatherVenueReport,
} from '../app/ui/workflows/m6-reports.js';

for (const [kind, def] of Object.entries(M6_KINDS)) if (!printableKinds().includes(kind)) registerPrintableKind(kind, def);
const NOW = new Date('2026-10-10T12:00:00Z');
const compose = (kind, data) => composePrintable(kind, data, { now: NOW, css: '', appVersion: '0.0.7' });
const EVIL = '<img src=x onerror=alert(1)>';

test('every M6 kind is registered with a valid file name', () => {
  for (const kind of ['latency', 'stylus', 'wearMap', 'scratch', 'hum', 'venue']) assert.ok(printableKinds().includes(kind), kind);
});

test('latency report prints the round trip, buffer rows and recommendations', () => {
  const payload = {
    scope: 'WASAPI scope', note: 'Not ASIO.', device: { input: 'Focusrite In', output: `Out ${EVIL}`, sampleRate: 48000 },
    roundTrip: { latencyMs: 7.0123, stdMs: 0.05, expandedUncertaintyMs: 0.1, acceptedRuns: 5, reportedMs: 6.5, overheadMs: 0.5 },
    bufferTest: { branch: 'honoured', loadPct: 80, rows: [{ requested: 128, effectiveFrames: 128, verdicts: ['pass'], xruns: 0, maxGapMs: 1.2 }] },
    recommendations: [{ software: 'serato', frames: 256, ms: 5.3, basis: 'measured', text: 'Set 256.' }],
    windowsChecklist: [{ id: 'power-plan', status: 'ok', detail: 'High performance' }],
  };
  assert.equal(latencyPrintData({}), null);
  const { html, fileName, warnings } = compose('latency', latencyPrintData(payload));
  assert.match(html, /7\.01 ms/); assert.match(html, /Recommended buffer per DJ program/); assert.match(html, /Windows tuning checklist/); assert.match(html, /High performance/);
  assert.ok(!html.includes(EVIL), 'user text escaped'); assert.match(fileName, /^DeckChek_Latency_.*\.pdf$/); assert.deepEqual(warnings, []);
});

test('stylus report has life, alerts, benchmark table and trend charts', () => {
  const d = { asset: { name: `Ortofon ${EVIL}` }, hours: 120.5, life: { ratedHours: 500, pct: 24.1, label: 'Good' }, rated: { generic: true }, alerts: [{ severity: 'amber', message: 'SNR fell 3 dB.' }],
    rows: [1, 2, 3].map(i => ({ valid: true, createdAt: `2026-0${i}-01T00:00:00Z`, hoursAt: i * 40, tcSnrDb: 30 - i, thdPercent: 1 + i / 10, separationDb: 25, tcPhaseErrorDeg: 2, tcDropouts: 0 })) };
  assert.equal(stylusPrintData(null), null);
  const { html } = compose('stylus', stylusPrintData(d, { projectionText: '2027-03' }));
  assert.match(html, /Inspect<\/strong>: SNR fell 3 dB/); assert.match(html, /<svg/); assert.match(html, /generic estimate/); assert.match(html, /2027-03/); assert.ok(!html.includes(EVIL));
});

test('wear map report prints verdict, worst stretches and an SNR chart', () => {
  const view = { sideLabel: 'A', format: 'Serato CV02.5', createdAt: '2026-10-09T10:00:00Z', verdict: 'watch', label: 'Watch', headline: 'Watch this side.', message: 'Side A has 2 dropouts.', coverage: 1, binSec: 2,
    stats: { goodPct: 80, degradedPct: 15, badPct: 5, dropouts: 2 }, worst: [{ time: '1:02', class: 'bad', snrDb: 8, phaseErrDeg: 20, dropouts: 1 }], bins: [0, 1, 2, 3].map(i => ({ tSec: i * 2, snrDb: 30 - i })) };
  const { html } = compose('wearMap', wearMapPrintData(view, { copyTitle: 'Booth copy' }));
  assert.match(html, /Booth copy/); assert.match(html, /Worst stretches/); assert.match(html, /1:02/); assert.match(html, /<svg/);
});

test('scratch report prints score, components, patterns and events; unscored runs say so', () => {
  const view = { score: 82.4, completed: true, summary: 'Solid tracking.', format: 'Serato CV02.5', bpm: 90, stats: { lockLosses: 1, skips: 0 }, safety: { level: 'ok', message: '' },
    components: { lock: { points: 30, max: 40, value: 1, unit: 'losses' } }, patterns: [{ label: 'Baby', present: true, lockLosses: 1, longestLossMs: 120, directionErrors: 0, skips: 0, score: 80 }], events: [{ kind: 'lock_loss', pattern: 'baby', tMs: 4200, durationMs: 120 }] };
  let { html } = compose('scratch', scratchPrintData(view, { meta: 'Deck 1', createdAt: '2026-10-10T10:00:00Z' }));
  assert.match(html, /82 \/ 100/); assert.match(html, /lock_loss/); assert.match(html, /Score components/);
  ({ html } = compose('scratch', scratchPrintData({ ...view, score: null, completed: false }, {})));
  assert.match(html, /Not scored/); assert.match(html, /Partial/);
});

test('hum report and venue report (FS-15 AC-7) list the isolation steps per venue', async () => {
  const run = { id: 'r1', kind: 'hum', verdict: `Hum drops at the mixer ${EVIL}`, createdAt: '2026-10-09T20:00:00Z', mainsHz: 50, venueId: 'v1',
    causes: [{ label: 'Ground loop', confidence: 0.8 }], steps: [{ label: 'Everything connected', totalDbfs: -50, deltaDb: 0 }, { label: 'Unplug laptop', totalDbfs: -62, deltaDb: -12, onset: false }, { label: 'Skipped step', skipped: true }] };
  assert.equal(humPrintData(null), null);
  let { html } = compose('hum', humPrintData(run, { venueName: 'Club X' }));
  assert.match(html, /Ground loop/); assert.match(html, /Unplug laptop/); assert.match(html, /Skipped/); assert.ok(!html.includes(EVIL));

  const catalog = { list: async e => ({ venue: [{ id: 'v1', name: 'Club X', city: 'Berlin' }], setup: [{ id: 's1', venueId: 'v1', name: 'Booth A', components: [{ role: 'turntable', assetId: 'a1', position: 'left' }] }, { id: 's2', venueId: 'v2', name: 'Other' }], asset: [{ id: 'a1', nickname: 'Deck 1' }] }[e]) };
  const humStore = { list: async ({ venueId }) => { assert.equal(venueId, 'v1'); return [{ id: 'r1' }]; }, get: async () => run };
  const data = await gatherVenueReport({ catalog, humStore, venueId: 'v1' });
  assert.equal(data.setups.length, 1); assert.equal(data.humRuns.length, 1); assert.equal(await gatherVenueReport({ catalog, humStore, venueId: 'nope' }), null);
  ({ html } = compose('venue', data));
  assert.match(html, /Venue report — Club X/); assert.match(html, /Booth A/); assert.match(html, /turntable \(left\): Deck 1/); assert.match(html, /Hum and feedback history/); assert.match(html, /Unplug laptop/);
  ({ html } = compose('venue', venuePrintData({ venue: { id: 'v9', name: 'Empty' } })));
  assert.match(html, /No hum or feedback runs are saved for this venue/);
});

test('venue reports distinguish unavailable incident history from loaded-empty and escape operator reports with limits', async () => {
  const venue = { id: 'v1', name: 'Club X' };
  let { html } = compose('venue', venuePrintData({ venue }));
  assert.match(html, /Incident history was not loaded/);
  ({ html } = compose('venue', venuePrintData({ venue, incidents: { items: [], total: 0, limit: 300, hasMore: false } })));
  assert.match(html, /No incidents recorded/);
  const row = { id: 'incident-1', origin: 'operator', kind: 'booth_shock', occurredAt: '2026-11-18T10:00:00.123Z', recordedAt: '2026-11-18T10:00:01.000Z', note: EVIL,
    context: { venue, setup: { id: 's1', name: `Left ${EVIL}` } } };
  ({ html } = compose('venue', venuePrintData({ venue, incidents: { items: [row], total: 301, limit: 300, hasMore: true } })));
  assert.match(html, /Operator-reported incidents/); assert.match(html, /Booth shock/);
  assert.match(html, /Showing 1 of 301 recorded incidents/); assert.match(html, /older records remain stored/);
  assert.ok(!html.includes(EVIL)); assert.match(html, /&lt;img/);
  assert.match(html, /selected context/);
});

test('venue report collection propagates incident storage failure and includes the selected venue history', async () => {
  const catalog = { list: async entity => entity === 'venue' ? [{ id: 'v1', name: 'Club X' }] : [] };
  const humStore = { list: async () => [], get: async () => null };
  const incidentStore = { list: async filter => { assert.equal(filter.venueId, 'v1'); assert.equal(filter.limit, 300); throw new Error('Incident store unreadable'); } };
  await assert.rejects(gatherVenueReport({ catalog, humStore, incidentStore, venueId: 'v1' }), /Incident store unreadable/);
  incidentStore.list = async () => ({ items: [], total: 0, limit: 300, hasMore: false });
  assert.equal((await gatherVenueReport({ catalog, humStore, incidentStore, venueId: 'v1' })).incidents.total, 0);
});

test('venue reports identify CURRENT support descriptions, escape text and disclose missing support records', async () => {
  const venue = { id: 'v-support', name: 'Club' }, setup = { id: 's-support', venueId: venue.id, name: 'Left', supportConfigurationId: 'support-a', components: [] };
  const support = { id: 'support-a', name: `Paver ${EVIL}`, description: `Feet ${EVIL}`, approximateMassKg: 6, coupledState: 'Decoupled', notes: EVIL };
  const { html } = compose('venue', venuePrintData({ venue, setups: [setup], supports: [support] }));
  assert.match(html, /Current support description/); assert.match(html, /does not establish the support used for historical measurements/);
  assert.match(html, /6 kg/); assert.match(html, /&lt;img/); assert.ok(!html.includes(EVIL));
  assert.match(compose('venue', venuePrintData({ venue, setups: [setup], supports: [] })).html, /support record.*unavailable/i);
  assert.match(compose('venue', venuePrintData({ venue, setups: [setup] })).html, /support descriptions.*not loaded/i);
});

test('venue report collection loads supports and propagates their read failure', async () => {
  const humStore = { list: async () => [] }, calls = [];
  const catalog = { list: async entity => { calls.push(entity); if (entity === 'supportConfiguration') throw new Error('Support catalog unreadable'); return entity === 'venue' ? [{ id: 'v1', name: 'Club' }] : []; } };
  await assert.rejects(gatherVenueReport({ catalog, humStore, venueId: 'v1' }), /Support catalog unreadable/);
  assert.ok(calls.includes('supportConfiguration'));
});

for (const failure of ['failed', 'missing']) test(`venue measured history rejects ${failure} details instead of reporting an empty saved history`, async () => {
  const catalog = { list: async entity => entity === 'venue' ? [{ id: 'v1', name: 'Club' }] : [] };
  const humStore = { list: async () => [{ id: 'run-a' }], get: async () => { if (failure === 'failed') throw new Error('Measurement read failed'); return null; } };
  await assert.rejects(gatherVenueReport({ catalog, humStore, venueId: 'v1' }), failure === 'failed' ? /Measurement read failed/ : /run-a.*unavailable|missing.*run-a/i);
});

test('venue measured history explicitly discloses its 50-run bound without deleting older records', async () => {
  const catalog = { list: async entity => entity === 'venue' ? [{ id: 'v1', name: 'Club' }] : [] };
  const rows = Array.from({ length: 51 }, (_, i) => ({ id: `r${i}`, kind: 'hum', venueId: 'v1', createdAt: '2026-11-18T10:00:00.000Z', steps: [] }));
  const humStore = { list: async ({ limit }) => { assert.equal(limit, 50); return rows.slice(0, limit); }, get: async id => rows.find(row => row.id === id) };
  const data = await gatherVenueReport({ catalog, humStore, venueId: 'v1' });
  assert.equal(data.humRuns.length, 50); assert.equal(rows.length, 51);
  assert.match(compose('venue', data).html, /up to 50.*hum.*feedback|hum.*feedback.*up to 50/i);
  assert.match(compose('venue', data).html, /older.*remain stored/i);
});

for (const [label, storage] of [
  ['malformed JSON', { getItem: () => '{bad' }],
  ['non-array data', { getItem: () => '{}' }],
  ['literal null', { getItem: () => 'null' }],
  ['unavailable storage', null],
  ['throwing read', { getItem() { throw new Error('History read denied'); } }],
]) test(`actual browser hum store: ${label} aborts venue report preparation`, async () => {
  const catalog = { list: async entity => entity === 'venue' ? [{ id: 'v1', name: 'Club' }] : [] };
  const humStore = createHumRunStore({ invoke: null, storage });
  await assert.rejects(gatherVenueReport({ catalog, humStore, venueId: 'v1' }), error => error instanceof HumRunError && error.code === 'HUMRUN_DB');
});

test('actual browser hum store: a missing key is empty, while a failed detail reread is an error', async () => {
  const catalog = { list: async entity => entity === 'venue' ? [{ id: 'v1', name: 'Club' }] : [] };
  const empty = createHumRunStore({ invoke: null, storage: { getItem: () => null } });
  const data = await gatherVenueReport({ catalog, humStore: empty, venueId: 'v1' });
  assert.equal(data.humRuns.length, 0); assert.match(compose('venue', data).html, /No hum or feedback runs are saved/);
  let reads = 0;
  const storage = { getItem() { return ++reads === 1 ? JSON.stringify([{ id: 'r1', kind: 'hum', venueId: 'v1', createdAt: '2026-11-18T10:00:00.000Z', steps: [] }]) : '{broken after list'; } };
  await assert.rejects(gatherVenueReport({ catalog, humStore: createHumRunStore({ invoke: null, storage }), venueId: 'v1' }), error => error instanceof HumRunError && error.code === 'HUMRUN_DB');
});
