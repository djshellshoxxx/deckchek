import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMonitorController, DEFAULT_SETTINGS } from '../app/monitor.js';
import { quadratureTimecode } from './fixtures/signals.mjs';

const url = new URL('../app/incident-metric-evidence.js', import.meta.url);
const api = await import(url.href).catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === url.href) return null;
  throw error;
});
const required = () => { assert.ok(api, 'The selected live-monitor evidence boundary must exist'); return api; };
const fixture = JSON.parse(await readFile(new URL('./contracts/incident-metric-evidence.json', import.meta.url)));
const incidentFixture = JSON.parse(await readFile(new URL('./contracts/venue-incidents.json', import.meta.url)));
const draft = () => structuredClone(incidentFixture.draft);
const evidence = () => structuredClone(fixture.evidence);
const savedPair = () => ({ incident: { ...draft(), origin: 'operator', recordedAt: fixture.recordedAt },
  evidence: { ...evidence(), origin: 'operator-attached', recordedAt: fixture.recordedAt } });
const CFG = { deviceName: 'Audio interface', decks: [{ deck: 'A', pair: '1-2' }], format: 'Traktor Scratch MK2' };

function controller(extra = {}) {
  const streams = [], tasks = [];
  let wall = Date.parse('2026-11-18T10:00:00.000Z'), mono = 1000, generation = 0;
  const timers = { setInterval: () => 1, clearInterval() {}, setTimeout(fn) { tasks.push(fn); return fn; },
    clearTimeout(fn) { const i = tasks.indexOf(fn); if (i >= 0) tasks.splice(i, 1); } };
  const c = createMonitorController({ now: () => wall, monotonicNow: () => mono, newGeneration: () => `open-${++generation}`, timers,
    startStream: async args => {
      const s = { args, stops: 0, info: { deviceName: 'Audio interface', sampleRate: 48000 }, async stop() { s.stops++; } };
      s.push = (signal = quadratureTimecode({ carrierHz: 2500, sampleRate: 48000, seconds: 0.25, snrDb: 30, seed: 3 }), rate = 48000, quality = {}) =>
        args.onBlock({ sampleRate: rate, frames: signal.left.length, pairs: [signal], quality });
      streams.push(s); return s;
    }, ...extra });
  return { c, streams, setClock(w, m) { wall = w; mono = m; }, async retry() { await tasks.shift()(); },
    snap(selector) { return c.metricSnapshot(selector, draft()); } };
}

test('fixed evidence contract preserves negative finite values and explicit hum placeholders without raw audio', () => {
  const { validateMetricEvidence, MAX_METRIC_SUBMISSION_BYTES } = required();
  const result = validateMetricEvidence(evidence(), draft());
  assert.deepEqual(result, evidence()); assert.equal(result.metrics.snrDb, -3.125);
  assert.deepEqual(result.unavailable, ['humDb', 'humFloorDb', 'mainsHz']);
  assert.equal(MAX_METRIC_SUBMISSION_BYTES, 32768);
  result.source.deviceName = 'Changed'; assert.equal(fixture.evidence.source.deviceName, 'Audio interface <left>');
});

test('producer copies only the fixed frame fields, converting nonfinite values at this boundary', () => {
  const { copyMonitorObservation, createMetricEvidence, METRIC_FIELDS } = required();
  const raw = { ...evidence().metrics, t: 12.5, snrDb: -8.0000000123, carrierHz: NaN, phaseDeg: Infinity,
    alerts: [{ private: 'not saved' }], minute: { private: 'not saved' }, left: new Float32Array(1024) };
  const f = evidence();
  const observed = copyMonitorObservation(raw, { source: f.source, observedAt: f.timing.observedAt, configuration: f.configuration, loss: f.loss });
  const result = createMetricEvidence(observed, draft(), 33.625);
  assert.equal(result.metrics.snrDb, -8.0000000123); assert.equal(result.metrics.carrierHz, null); assert.equal(result.metrics.phaseDeg, null);
  assert.deepEqual(result.unavailable, ['carrierHz', 'phaseDeg', 'humDb', 'humFloorDb', 'mainsHz']);
  assert.equal(result.timing.sampleTimeSeconds, 12.5); assert.equal(result.timing.ageMs, 33.625);
  assert.equal(Object.hasOwn(result, 'alerts'), false); assert.ok(!JSON.stringify(result).includes('private'));
  assert.equal(METRIC_FIELDS.find(f => f.key === 'snrDb').unit, 'dB');
  raw.snrDb = 10; raw.left.fill(1); assert.equal(result.metrics.snrDb, -8.0000000123);
});

test('strict input validation rejects unsupported, malformed, nonfinite, inconsistent and unbounded evidence', () => {
  const { validateMetricEvidence } = required();
  const changes = [
    e => e.metrics.snrDb = NaN, e => e.metrics.snrDb = Infinity, e => e.metrics.levelDb = '1',
    e => e.source.pcm = [1], e => e.metrics.alerts = [], e => e.source.generation = '',
    e => e.source.generation = 'x'.repeat(129), e => e.source.deviceName = 'x'.repeat(201),
    e => e.incidentId = 'different', e => e.pressAt = '2026-11-18T10:00:01.000Z',
    e => e.source.secondChannel = 4, e => e.source.firstChannel = 2, e => e.source.deck = 'E',
    e => e.timing.ageMs = -1, e => e.timing.observedAt = '2026-02-30T10:00:00.000Z',
    e => e.metrics.dropouts = 1.5, e => e.loss.monitorDroppedBlocks = Number.MAX_SAFE_INTEGER + 1,
    e => e.unavailable = [], e => e.unavailable.push('snrDb'), e => e.metrics.mainsHz = 55,
    e => delete e.metrics.mainsHz, e => e.configuration.thresholds.extra = 1,
    e => e.configuration.sampleRateHz = 1, e => e.configuration.hopMs = 1001,
    e => e.configuration.analysisWindowSeconds = 10, e => e.schemaVersion = 2,
    e => e.source.format = 'unknown format', e => e.source.deviceName = '🙂'.repeat(32769),
  ];
  for (const change of changes) { const e = evidence(); change(e); assert.throws(() => validateMetricEvidence(e, draft()), undefined, String(change)); }
});

test('all unavailable numeric fields remain explicit and unavailable age is null, never fabricated zero', () => {
  const { copyMonitorObservation, createMetricEvidence, METRIC_FIELDS } = required();
  const f = evidence(), raw = { ...f.metrics, t: NaN };
  for (const { key } of METRIC_FIELDS) raw[key] = NaN;
  const result = createMetricEvidence(copyMonitorObservation(raw, { source: f.source, observedAt: f.timing.observedAt,
    configuration: f.configuration, loss: f.loss }), draft(), null);
  assert.deepEqual(result.unavailable, METRIC_FIELDS.map(f => f.key));
  assert.equal(result.timing.ageMs, null); assert.equal(result.timing.sampleTimeSeconds, null);
});

test('actual controller requires a post-start frame and copies receipt age independently of wall time', async t => {
  const s = controller(); t.after(() => s.c.stop());
  assert.equal(typeof s.c.metricSources, 'function', 'Controller must expose passive current sources');
  assert.deepEqual(s.c.metricSources(), []); await s.c.start(CFG); assert.deepEqual(s.c.metricSources(), []);
  s.streams[0].push(); const selector = s.c.metricSources()[0];
  assert.equal(selector.source.firstChannel, 1); assert.equal(selector.source.secondChannel, 2);
  assert.equal(selector.configuration.sampleRateHz, 48000); assert.equal(selector.timing.ageMs, 0);
  const before = structuredClone(s.c.deck('A').frame);
  s.setClock(Date.parse('2026-11-17T00:00:00.000Z'), 1123.125);
  const result = s.snap(selector.source);
  assert.equal(result.timing.ageMs, 123.125); assert.equal(result.timing.observedAt, '2026-11-18T10:00:00.000Z');
  assert.equal(result.metrics.snrDb, before.snrDb); assert.equal(result.configuration.hopMs, 250);
  assert.ok(result.unavailable.includes('humDb'), 'finite startup floor is unavailable until mains exists');
  assert.equal(s.streams.length, 1); assert.equal(s.streams[0].stops, 0, 'reading evidence never changes capture');
  s.c.deck('A').frame.snrDb = 999; assert.equal(s.snap(selector.source).metrics.snrDb, before.snrDb, 'public frame mutation cannot change private observation');
});

test('actual controller retires outage generations, rejects same-name stale choices and ignores retired callbacks', async t => {
  const s = controller(); t.after(() => s.c.stop());
  assert.equal(typeof s.c.metricSources, 'function'); await s.c.start(CFG); s.streams[0].push();
  const old = s.c.metricSources()[0].source;
  s.streams[0].args.onEnd({ reason: 'deviceLost' }); assert.deepEqual(s.c.metricSources(), []); assert.throws(() => s.snap(old));
  await s.retry(); assert.equal(s.c.state, 'running'); assert.deepEqual(s.c.metricSources(), []);
  s.streams[0].push(); assert.deepEqual(s.c.metricSources(), [], 'old callback cannot become a reopened observation');
  s.streams[1].push(); const fresh = s.c.metricSources()[0].source;
  assert.notEqual(fresh.generation, old.generation); assert.throws(() => s.snap(old));
  const frozen = s.snap(fresh); s.streams[0].args.onEnd({ reason: 'deviceLost' });
  assert.equal(s.c.state, 'running'); assert.deepEqual(s.snap(fresh), frozen);
  await s.c.stop(); assert.deepEqual(s.c.metricSources(), []); assert.throws(() => s.snap(fresh));
});

test('actual controller changes selection generation on observed rate and settings changes, preserving effective settings', async t => {
  const s = controller(); t.after(() => s.c.stop()); assert.equal(typeof s.c.metricSources, 'function');
  await s.c.start(CFG); s.streams[0].push(); const first = s.c.metricSources()[0].source;
  s.streams[0].push(quadratureTimecode({ carrierHz: 2500, sampleRate: 44100, seconds: 0.25, snrDb: 30 }), 44100);
  const changed = s.c.metricSources()[0]; assert.notEqual(changed.source.generation, first.generation);
  assert.equal(changed.configuration.sampleRateHz, 44100); assert.throws(() => s.snap(first));
  s.c.setSettings({ ...DEFAULT_SETTINGS, thresholds: { ...DEFAULT_SETTINGS.thresholds, snrFloorDb: 17 } });
  assert.deepEqual(s.c.metricSources(), []); assert.throws(() => s.snap(changed.source));
  s.streams[0].push(); const current = s.c.metricSources()[0];
  assert.equal(current.configuration.thresholds.snrFloorDb, DEFAULT_SETTINGS.thresholds.snrFloorDb, 'existing engine retains the settings applied at start');
  s.setClock(Date.now(), NaN); assert.equal(s.snap(current.source).timing.ageMs, null);
  s.setClock(Date.now(), 999); assert.equal(s.snap(current.source).timing.ageMs, null, 'backward monotonic input is unavailable');
});

test('passive provider registration never constructs or starts a monitor', () => {
  const { registerMetricMonitor, liveMonitorMetricSources } = required();
  assert.deepEqual(liveMonitorMetricSources.list(), []); assert.throws(() => liveMonitorMetricSources.snapshot({}, draft()));
  let reads = 0; const existing = { metricSources() { reads++; return []; }, metricSnapshot() { throw new Error('no frame'); } };
  const unregister = registerMetricMonitor(existing); assert.deepEqual(liveMonitorMetricSources.list(), []); assert.equal(reads, 1);
  unregister(); assert.deepEqual(liveMonitorMetricSources.list(), []);
});

test('native bridge freezes before await, retries exact pairs and rejects changed acknowledgement without browser fallback', async () => {
  const { createIncidentMetricStore } = required();
  const calls = []; let fail = true;
  const store = createIncidentMetricStore({ invoke: async (command, args) => {
    calls.push({ command, args: structuredClone(args) }); if (fail) throw new Error('Response lost'); return savedPair();
  } });
  const i = draft(), e = evidence(); const rejected = store.save(i, e); i.note = 'Later'; e.metrics.snrDb = 90;
  await assert.rejects(rejected, /Response lost/); fail = false;
  assert.deepEqual(await store.save(draft(), evidence()), savedPair()); assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].command, 'venue_incident_save_with_metric_evidence');
  const wrong = createIncidentMetricStore({ invoke: async () => ({ ...savedPair(), evidence: { ...savedPair().evidence, metrics: { ...evidence().metrics, snrDb: 9 } } }) });
  await assert.rejects(wrong.save(draft(), evidence()), /match|different/i);
  const browser = createIncidentMetricStore({ invoke: null }); assert.equal(browser.native, false);
  await assert.rejects(browser.save(draft(), evidence()), /desktop|native/i);
});

test('separate bounded reads bind the exact parent, distinguish absence and reject mismatches or silent errors', async () => {
  const { createIncidentMetricStore, metricEvidenceSummary } = required();
  const pair = savedPair(), commands = [];
  const store = createIncidentMetricStore({ invoke: async (command, args) => {
    commands.push([command, args]);
    if (command === 'venue_incident_metric_evidence_get') return pair;
    return [{ incident: pair.incident, evidence: metricEvidenceSummary(pair.evidence) }];
  } });
  assert.deepEqual(await store.get(pair.incident), pair);
  const rows = await store.summaries([pair.incident]); assert.equal(rows[0].evidence.source.deck, 'A');
  assert.equal(Object.hasOwn(rows[0].evidence, 'configuration'), false, 'summary is bounded and omits full settings');
  assert.deepEqual(commands[1][1], { incidentIds: ['incident-1'] });
  await assert.rejects(store.summaries(Array.from({ length: 301 }, () => pair.incident)), /300|limit/i);
  const restored = { ...pair.incident, note: 'Different restored parent' };
  await assert.rejects(store.get(restored), /match|changed/i); await assert.rejects(store.summaries([restored]), /match|changed/i);
  const absent = createIncidentMetricStore({ invoke: async () => ({ incident: pair.incident, evidence: null }) });
  assert.equal((await absent.get(pair.incident)).evidence, null);
  const fail = createIncidentMetricStore({ invoke: async () => { throw new Error('Read failed'); } });
  await assert.rejects(fail.get(pair.incident), /Read failed/); await assert.rejects(fail.summaries([pair.incident]), /Read failed/);
  const truncated = createIncidentMetricStore({ invoke: async () => [] });
  await assert.rejects(truncated.summaries([pair.incident]), /missing|count|match/i);
});
