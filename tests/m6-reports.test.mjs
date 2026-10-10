// FS-03 DoD: every M6 result (and the venue report) has a printable PDF kind that renders real content, escapes
// user text, and registers under a valid name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPrintableKind, composePrintable, printableKinds } from '../app/report-pdf.js';
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
  const humStore = { list: async ({ venueId }) => { assert.equal(venueId, 'v1'); return [{ id: 'r1' }, { id: 'gone' }]; }, get: async id => { if (id === 'gone') throw new Error('x'); return run; } };
  const data = await gatherVenueReport({ catalog, humStore, venueId: 'v1' });
  assert.equal(data.setups.length, 1); assert.equal(data.humRuns.length, 1); assert.equal(await gatherVenueReport({ catalog, humStore, venueId: 'nope' }), null);
  ({ html } = compose('venue', data));
  assert.match(html, /Venue report — Club X/); assert.match(html, /Booth A/); assert.match(html, /turntable \(left\): Deck 1/); assert.match(html, /Hum and feedback history/); assert.match(html, /Unplug laptop/);
  ({ html } = compose('venue', venuePrintData({ venue: { id: 'v9', name: 'Empty' } })));
  assert.match(html, /No hum or feedback runs are saved for this venue/);
});
