import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMonitorController } from '../app/monitor.js';
import { createIncidentMetricStore } from '../app/incident-metric-evidence.js';
import { quadratureTimecode } from './fixtures/signals.mjs';

const { draft } = JSON.parse(await readFile(new URL('./contracts/venue-incidents.json', import.meta.url)));
const fixture = JSON.parse(await readFile(new URL('./contracts/incident-metric-evidence.json', import.meta.url)));
const signal = quadratureTimecode({ carrierHz: 2500, sampleRate: 48000, seconds: 0.25, snrDb: 30 });
const config = { deviceName: 'Interface', format: 'Traktor Scratch MK2', decks: [{ deck: 'A', pair: '1-2' }] };
async function session(t, extra = {}) {
  let callbacks, wall = Date.parse('2026-11-18T10:00:00.000Z'), mono = 1000;
  const c = createMonitorController({ now: () => wall, monotonicNow: () => mono,
    timers: { setInterval() {}, clearInterval() {}, clearTimeout() {} },
    startStream: async args => { callbacks = args; return { info: { deviceName: 'Interface', sampleRate: 48000 }, stop: async () => {} }; }, ...extra });
  await c.start(config); t.after(() => c.stop());
  return { c, clock(w, m) { wall = w; mono = m; },
    push(pair = signal) { callbacks.onBlock({ sampleRate: 48000, frames: 12000, pairs: [pair] }); },
    snapshot() { return c.metricSnapshot(c.metricSources()[0].source, draft); } };
}

test('snapshot configuration describes the opened stream and applied engine settings even if a public config view is edited', async t => {
  const s = await session(t);
  s.c.config.decks[0].first = 7; s.c.config.format = 'Serato CV02.5'; s.c.config.hopMs = 500;
  s.push(); const snapshot = s.snapshot();
  assert.equal(snapshot.source.firstChannel, 1); assert.equal(snapshot.source.format, 'Traktor Scratch MK2');
  assert.equal(snapshot.configuration.hopMs, 250);
});

test('an unrepresentable observation clock cannot leave an older frame eligible as the latest reading', async t => {
  const s = await session(t); s.push(); const selected = s.c.metricSources()[0].source;
  s.clock(NaN, 1250); s.push(); assert.deepEqual(s.c.metricSources(), []);
  assert.throws(() => s.c.metricSnapshot(selected, draft));
});

test('nonfinite monotonic differences are explicitly unavailable, even when both endpoints are finite', async t => {
  const s = await session(t); s.clock(Date.now(), -Number.MAX_VALUE); s.push();
  s.clock(Date.now(), Number.MAX_VALUE); assert.equal(s.snapshot().timing.ageMs, null);
});

test('empty stereo callbacks do not manufacture a new receipt time or a post-start observation', async t => {
  const s = await session(t); const empty = { left: new Float32Array(), right: new Float32Array() };
  s.push(empty); assert.deepEqual(s.c.metricSources(), []);
  s.push(); const observed = s.snapshot();
  s.clock(Date.parse('2026-11-18T10:00:01.000Z'), 1250); s.push(empty);
  assert.equal(s.snapshot().timing.observedAt, observed.timing.observedAt); assert.equal(s.snapshot().timing.ageMs, 250);
});

test('equivalent JSON object field order does not turn an exact native acknowledgement into a conflict', async () => {
  const e = structuredClone(fixture.evidence);
  e.loss = { logEventsDropped: 2, monitorDroppedBlocks: 4, reportedDroppedBlocks: null };
  const incident = { ...draft, origin: 'operator', recordedAt: fixture.recordedAt };
  const saved = { ...fixture.evidence, origin: 'operator-attached', recordedAt: fixture.recordedAt };
  const store = createIncidentMetricStore({ invoke: async () => ({ incident, evidence: saved }) });
  assert.deepEqual(await store.save(draft, e), { incident, evidence: saved });
});
