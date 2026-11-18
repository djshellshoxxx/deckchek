import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkConfig, benchmarkSteps, validateBenchmarkCapture, benchmarkStepRecord, guidedBenchmarkPayload, benchmarksSinceReplacement } from '../app/stylus-benchmark.js';
import { createGuidedBenchmark, mountGuidedBenchmark } from '../app/ui/workflows/stylus-benchmark.js';
import { buildRun, persistCaptureFields } from '../app/ui/analysis.js';
import { loadAssetState } from '../app/ui/screens/stylus.js';
import { TIMECODE_FORMATS } from '../app/timecode.js';
import { deferred, installServiceDom, settle } from './fixtures/service-screen-dom.mjs';

const config = (extra = {}) => ({ assetId: 'stylus-a', assetName: 'Cartridge A', hoursAt: 12, record: 'Reference LP', side: 'A', trackingForce: 2.5, vta: 'Height 2', chain: 'Deck > phono stage > Input A, gain 0 dB', setupId: 'setup-a', deviceName: 'Input A', pairs: [1], nominalRpm: 33.333333, timecodeFormat: '', sameConditions: true, ...extra });
function result(seconds = 10) {
  const sampleRate = 8000, n = sampleRate * seconds;
  const left = Float32Array.from({ length: n }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 1000 * i / sampleRate));
  return {
    audio: { left, right: left.map(value => value / 2), channels: 2, sampleRate, durationSec: seconds, pairs: [{ pair: { first: 1, second: 2, mono: false } }] },
    quality: { framesCaptured: n, overrunSamples: 0, streamErrors: 0, clippedSamplesL: 0, clippedSamplesR: 0, callbackCount: 10, maxCallbackGapMs: 10, truncated: false, streamErrorMessages: [] },
    streamErrors: [], deviceName: 'Input A',
  };
}
const metrics = (args, id = 'run-a') => ({
  id, test: args.test, assetId: args.device?.id || 'stylus-a', deviceId: args.device?.id || 'stylus-a', capture: args.capture || { kind: 'live', startedAt: '2026-11-18T01:00:00Z', endedAt: '2026-11-18T01:00:10Z' },
  calibration: { applied: false, reasons: ['no calibration profile'], profileCreatedAt: null, deviceName: 'Input A' },
  measurements: [
    ['left_thd_percent', 0.4], ['right_thd_percent', 0.6], ['channel_separation_db', args.params?.separationActive === 'right' ? 22 : 30],
    ['tc_snr_db', -2], ['tc_phase_error_deg', 3], ['tc_dropouts', 2], ['tc_direction_code', 1], ['clipped_samples', 0],
  ].map(([metricId, value]) => ({ metricId, value })),
});
function records(input = config()) {
  return benchmarkSteps(input).map((step, index) => benchmarkStepRecord(step, result(step.seconds), metrics({ test: step.test, params: { separationActive: step.id } }, `run-${index}`), null));
}
function harness(extra = {}) {
  const sessions = [], savedRuns = [], savedBenchmarks = [], states = [], intervals = new Map();
  let tickId = 0, nowMs = Date.parse('2026-11-18T01:00:00Z'), sequence = 0;
  const io = {
    capture: async options => {
      const item = { options, stopped: false, cancelled: 0, elapsedSec: 0, data: result(options.maxSeconds - 5) };
      const session = { get stopped() { return item.stopped; }, elapsed: () => item.elapsedSec, stop: async () => { item.stopped = true; return item.data; }, cancel: async () => { item.cancelled += 1; item.stopped = true; } };
      item.session = session; sessions.push(item); return session;
    },
    analyze: args => metrics(args, `run-${++sequence}`), profileFor: () => null,
    persist: async run => { savedRuns.push(run); return { ok: true }; },
    save: async payload => { savedBenchmarks.push(payload); return { id: 'benchmark-a' }; },
    now: () => nowMs, clock: () => nowMs,
    timers: { setInterval: fn => { intervals.set(++tickId, fn); return tickId; }, clearInterval: id => intervals.delete(id) },
    onChange: state => states.push(state), ...extra,
  };
  return { io, sessions, savedRuns, savedBenchmarks, states, intervals,
    tick(seconds) { nowMs += seconds * 1000; if (sessions.length) sessions.at(-1).elapsedSec += seconds; for (const fn of [...intervals.values()]) fn(); },
  };
}
async function complete(runner, h) {
  while (runner.snapshot().phase === 'ready') { await runner.record(); h.tick(runner.snapshot().step.seconds); await settle(); }
}

test('guided configuration snapshots explicit metadata and rejects missing/nonfinite context', () => {
  const input = config(), normalized = benchmarkConfig(input); input.pairs[0] = 5;
  assert.deepEqual(normalized.pairs, [1]);
  for (const bad of [{ hoursAt: NaN }, { trackingForce: Infinity }, { record: '' }, { vta: '' }, { chain: '' }, { pairs: [1, 3] }, { timecodeFormat: 'invented format' }]) assert.throws(() => benchmarkConfig(config(bad)));
  assert.equal(benchmarkSteps(normalized).length, 3);
  assert.equal(benchmarkSteps(config({ timecodeFormat: TIMECODE_FORMATS[0].name })).length, 4);
});

test('guided payload preserves both channels, poorer separation, all run IDs and setup', () => {
  const cfg = config(), rows = records(cfg), payload = guidedBenchmarkPayload(cfg, rows);
  assert.equal(payload.thdPercent, 0.5); assert.equal(payload.separationDb, 22);
  assert.equal(payload.valid, true); assert.equal(payload.sessionId, 'run-0'); assert.equal(payload.setupId, 'setup-a');
  assert.deepEqual(payload.detail.runs, ['run-0', 'run-1', 'run-2']);
  assert.equal(payload.detail.steps[1].values.separationDb, 30);
  assert.equal(payload.tcSnrDb, undefined);
  rows[0].quality.overrunSamples = 99;
  assert.equal(payload.detail.steps[0].quality.overrunSamples, 0, 'saved provenance is an independent snapshot');
});

test('optional control vinyl retains negative SNR, phase and actual dropout count from its own run', () => {
  const cfg = config({ timecodeFormat: TIMECODE_FORMATS[0].name }), payload = guidedBenchmarkPayload(cfg, records(cfg));
  assert.equal(payload.tcSnrDb, -2); assert.equal(payload.tcPhaseErrorDeg, 3); assert.equal(payload.tcDropouts, 2);
  assert.equal(payload.detail.steps.at(-1).runId, 'run-3');
});

test('incomplete, duplicate, wrong-asset and nonfinite evidence cannot make a benchmark', () => {
  const cfg = config(), rows = records();
  assert.throws(() => guidedBenchmarkPayload(cfg, rows.slice(0, 2)), /Complete each/);
  rows[1].runId = rows[0].runId; assert.throws(() => guidedBenchmarkPayload(cfg, rows), /own saved run/);
  rows[1].runId = 'run-1'; rows[2].assetId = 'other'; assert.throws(() => guidedBenchmarkPayload(cfg, rows), /different cartridge/);
  const step = benchmarkSteps(cfg)[0], run = metrics({ test: step.test }); run.measurements[0].value = NaN;
  assert.throws(() => benchmarkStepRecord(step, result(), run, null), /finite left_thd_percent/);
});

test('missing counters, capture faults, clipping and pair ambiguity remain excluded evidence', () => {
  const cfg = config(), steps = benchmarkSteps(cfg);
  for (const alter of [r => { r.quality = null; }, r => { delete r.quality.callbackCount; }, r => { r.quality.overrunSamples = 1; }, r => { r.quality.streamErrors = 1; }, r => { r.quality.maxCallbackGapMs = 101; }, r => { r.quality.truncated = true; }, r => { r.quality.clippedSamplesR = 1; }, r => { r.quality.framesCaptured++; }, r => { r.quality.framesCaptured--; }, r => { delete r.quality.streamErrorMessages; }, r => { r.quality.streamErrorMessages = {}; }, r => { r.streamErrors = ['driver reset']; }, r => { delete r.streamErrors; }, r => { delete r.audio.pairs; }, r => { r.audio.pairs[0].pair = { first: 0, second: 1 }; }]) {
    const r = result(); alter(r); const rows = records(); rows[0] = benchmarkStepRecord(steps[0], r, metrics({ test: steps[0].test }, 'run-0'), null);
    assert.equal(guidedBenchmarkPayload(cfg, rows).valid, false);
  }
});

test('changed input, rate, pair and calibration exclude the whole comparison', () => {
  for (const alter of [r => { r.context.deviceName = 'Input B'; }, r => { r.context.sampleRate = 48000; }, r => { r.context.pair = { first: 3, second: 4, mono: false }; }, r => { r.context.calibrationProfile = { createdAt: 'new' }; }]) {
    const rows = records(); alter(rows[2]); const p = guidedBenchmarkPayload(config(), rows);
    assert.equal(p.valid, false); assert.ok(p.detail.issues.some(s => s.includes('changed between steps')));
  }
  assert.equal(guidedBenchmarkPayload(config({ sameConditions: false }), records()).valid, false);
});

test('recorded baseline detects changed physical setup and analysis provenance without altering values', () => {
  const cfg = config(), rows = records(), prior = { ...guidedBenchmarkPayload(cfg, rows), createdAt: '2026-11-17T01:00:00Z' };
  assert.equal(guidedBenchmarkPayload(cfg, rows, [prior]).valid, true);
  for (const change of [{ trackingForce: 3 }, { record: 'Another record' }, { setupId: 'setup-b' }, { vta: 'Height 3' }]) {
    const p = guidedBenchmarkPayload(config(change), rows, [prior]); assert.equal(p.valid, false); assert.equal(p.thdPercent, 0.5);
  }
});

test('an undated guided baseline cannot silently choose comparison context by list order', () => {
  const cfg = config(), rows = records(), unknown = { ...guidedBenchmarkPayload(cfg, rows), createdAt: 'unknown' };
  const dated = { ...guidedBenchmarkPayload(config({ trackingForce: 3 }), rows), createdAt: '2026-11-17T01:00:00Z' };
  for (const history of [[unknown, dated], [dated, unknown], [unknown]]) {
    const payload = guidedBenchmarkPayload(cfg, rows, history);
    assert.equal(payload.valid, false); assert.ok(payload.detail.issues.some(issue => issue.includes('unverified date')));
  }
});

test('capture validation rejects incomplete, preempted, mono, silent and nonfinite input', () => {
  const step = benchmarkSteps(config())[0];
  for (const r of [result(9), { ...result(), preempted: true }, { ...result(), audio: { ...result().audio, channels: 1 } }]) assert.throws(() => validateBenchmarkCapture(r, step));
  const silence = result(); silence.audio.right.fill(0); assert.throws(() => validateBenchmarkCapture(silence, step), /no signal/);
  const invalid = result(); invalid.audio.left[40] = NaN; assert.throws(() => validateBenchmarkCapture(invalid, step), /invalid samples/);
});

test('replacement resets trend inputs while retaining original records including unknown dates', async () => {
  const old = { id: 'old', createdAt: '2026-01-01T00:00:00Z', hoursAt: 400, thdPercent: 8 }, fresh = { id: 'new', createdAt: '2026-02-01T00:00:00Z', hoursAt: 0, thdPercent: 0.2 }, unknown = { id: 'bad', createdAt: 'unknown', hoursAt: 600, thdPercent: 10 };
  const all = [old, fresh, unknown], baseline = '2026-02-01T00:00:00Z';
  assert.deepEqual(benchmarksSinceReplacement(all, baseline), [fresh]); assert.equal(all.length, 3);
  assert.deepEqual(benchmarksSinceReplacement(all, 'invalid'), []);
  const api = { baseline: async () => baseline, benchmarkList: async () => all, alertList: async () => [], ratedLifeGet: async () => 500 };
  const d = await loadAssetState({ id: 'a', name: 'A' }, { api, usage: { list: async () => [] }, catalogue: { entries: [] } });
  assert.deepEqual(d.benchmarks, [fresh]); assert.equal(d.allBenchmarks.length, 3); assert.equal(d.allRows.length, 3);
  assert.equal(d.verdict.alerts.length, 0);
});

test('replacement eligibility follows guided acquisition spans, including a delayed save', () => {
  const baseline = '2026-11-18T00:00:00Z', row = { ...guidedBenchmarkPayload(config(), records()), createdAt: '2026-11-19T00:00:00Z' };
  assert.deepEqual(benchmarksSinceReplacement([row], baseline), [row]);
  for (const change of [
    value => { for (const step of value.detail.steps) step.capture = { startedAt: '2026-11-17T01:00:00Z', endedAt: '2026-11-17T01:00:10Z' }; },
    value => { value.detail.steps[0].capture = { startedAt: '2026-11-17T23:59:55Z', endedAt: '2026-11-18T00:00:05Z' }; },
    value => { delete value.detail.steps[1].capture.startedAt; },
    value => { value.detail.steps[2].capture.endedAt = '2026-11-17T00:00:00Z'; },
    value => { value.detail.steps.pop(); },
  ]) {
    const invalid = structuredClone(row); change(invalid);
    assert.deepEqual(benchmarksSinceReplacement([invalid], baseline), []);
    assert.equal(invalid.createdAt, '2026-11-19T00:00:00Z', 'the original later save timestamp remains preserved');
  }
});

test('setupId reaches ordinary diagnostic persistence without changing legacy payloads', () => {
  const run = { assetId: 'a', setupId: 's', capture: { kind: 'live', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:10Z', durationSec: 10 } };
  assert.equal(persistCaptureFields(run).setupId, 's');
  delete run.setupId; assert.equal(Object.hasOwn(persistCaptureFields(run), 'setupId'), false);
});

test('runner records steps in order, freezes original asset/setup, and saves only after explicit review', async () => {
  const input = config(), h = harness(), runner = createGuidedBenchmark({ config: input, ...h.io });
  input.assetId = 'other'; input.setupId = 'other';
  await complete(runner, h);
  assert.equal(runner.snapshot().phase, 'review'); assert.equal(h.savedBenchmarks.length, 0);
  assert.equal(h.savedRuns.length, 3);
  assert.ok(h.savedRuns.every(run => run.assetId === 'stylus-a' && run.setupId === 'setup-a'));
  assert.deepEqual(h.savedRuns.map(run => run.test), ['Channel & cartridge', 'Channel separation', 'Channel separation']);
  await runner.save(); await runner.save();
  assert.equal(h.savedBenchmarks.length, 1); assert.equal(runner.snapshot().phase, 'saved'); assert.equal(h.intervals.size, 0);
});

test('cancelled pending capture disposes its late session without analysing or saving', async () => {
  const pending = deferred(), h = harness({ capture: () => pending.promise });
  const runner = createGuidedBenchmark({ config: config(), ...h.io }); const opening = runner.record(); runner.cancel();
  let cancelled = 0; pending.resolve({ cancel: async () => { cancelled++; } }); await opening;
  assert.equal(cancelled, 1); assert.equal(runner.snapshot().phase, 'cancelled'); assert.equal(h.savedRuns.length, 0); assert.equal(h.savedBenchmarks.length, 0);
});

test('late stop, analysis and persistence completions cannot advance a cancelled benchmark', async () => {
  for (const boundary of ['stop', 'analyze', 'persist']) {
    const pending = deferred(), h = harness(), runner = createGuidedBenchmark({ config: config(), ...h.io, ...(boundary === 'analyze' ? { analyze: () => pending.promise } : boundary === 'persist' ? { persist: () => pending.promise } : {}) });
    await runner.record(); if (boundary === 'stop') h.sessions[0].session.stop = () => pending.promise;
    const finishing = runner.finish(); await settle(); runner.cancel();
    pending.resolve(boundary === 'stop' ? result() : boundary === 'analyze' ? metrics({ test: 'Channel & cartridge' }) : { ok: true }); await finishing;
    assert.equal(runner.snapshot().phase, 'cancelled'); assert.equal(runner.snapshot().completed, 0); assert.equal(h.savedBenchmarks.length, 0);
  }
});

test('capture preemption and early loss are retryable and never accepted as a finished step', async () => {
  for (const event of ['onPreempted', 'onStatus']) {
    const h = harness(), runner = createGuidedBenchmark({ config: config(), ...h.io }); await runner.record();
    h.sessions[0].options[event]({ running: false }); await settle();
    assert.equal(runner.snapshot().phase, 'error'); assert.equal(h.sessions[0].cancelled, 1); assert.equal(h.savedRuns.length, 0);
    await runner.record(); assert.equal(runner.snapshot().index, 0); runner.dispose();
  }
});

test('ordinary stop status cannot invalidate a capture already finishing', async () => {
  const h = harness(), runner = createGuidedBenchmark({ config: config(), ...h.io }); await runner.record();
  const original = h.sessions[0].session.stop;
  h.sessions[0].session.stop = async () => { h.sessions[0].options.onStatus({ running: false }); return original(); };
  await runner.finish(); assert.equal(runner.snapshot().phase, 'ready'); assert.equal(runner.snapshot().completed, 1);
});

test('History failure cannot produce a benchmark; save failure retains original review for retry', async () => {
  const h = harness({ persist: async () => ({ ok: false, error: 'disk full' }) }), runner = createGuidedBenchmark({ config: config(), ...h.io });
  await runner.record(); await runner.finish(); assert.equal(runner.snapshot().phase, 'error'); assert.match(runner.snapshot().error, /disk full/); assert.equal(runner.snapshot().completed, 0);
  let writes = 0; const ok = harness(), retry = createGuidedBenchmark({ config: config(), ...ok.io, save: async () => { if (++writes === 1) throw new Error('locked'); return { id: 'b' }; } });
  await complete(retry, ok); await retry.save(); assert.equal(retry.snapshot().phase, 'review'); assert.match(retry.snapshot().error, /locked/);
  await retry.save(); assert.equal(retry.snapshot().phase, 'saved'); assert.equal(writes, 2);
});

test('a dispatched save cannot be cancelled; disposal suppresses callbacks without claiming rollback', async () => {
  for (const leave of [false, true]) {
    const pending = deferred(), h = harness(); let writes = 0;
    const runner = createGuidedBenchmark({ config: config(), ...h.io, save: async payload => { writes++; await pending.promise; h.savedBenchmarks.push(payload); return { id: 'saved' }; } });
    await complete(runner, h); const saving = runner.save();
    assert.equal(runner.snapshot().phase, 'saving'); assert.equal(runner.cancel(), false);
    await runner.save(); assert.equal(writes, 1); assert.equal(runner.snapshot().phase, 'saving');
    const count = h.states.length; if (leave) runner.dispose();
    pending.resolve(); await saving;
    assert.equal(h.savedBenchmarks.length, 1); assert.equal(h.savedBenchmarks[0].assetId, 'stylus-a');
    if (leave) assert.equal(h.states.length, count, 'a late completed write does not mutate a disposed panel');
    else assert.equal(runner.snapshot().phase, 'saved');
    assert.ok(!h.states.some(state => state.phase === 'cancelled'));
  }
});

test('production analysis on DC, absent reference, and sub-floor tones remains excluded', () => {
  const cfg = config(), step = benchmarkSteps(cfg)[0];
  for (const frequency of [0, 200, 2000, 1000]) {
    const r = result(), amplitude = frequency === 1000 ? 0.00001 : 0.2;
    r.audio.left = Float32Array.from(r.audio.left, (_, i) => frequency === 0 ? amplitude : amplitude * Math.sin(2 * Math.PI * frequency * i / r.audio.sampleRate));
    r.audio.right = r.audio.left.slice();
    const run = buildRun({ test: step.test, audio: r.audio, params: { referenceHz: 1000 }, device: { id: cfg.assetId }, quality: r.quality, streamErrors: [], deviceName: r.deviceName });
    const row = benchmarkStepRecord(step, r, run, null);
    assert.ok(row.issues.some(issue => issue.includes('reference tone is not measurable')));
    if (frequency === 0) assert.ok(row.values.leftThdPercent < 0.01, 'the production analyzer alone can produce a benign-looking DC result');
    const rows = records(); rows[0] = row; const payload = guidedBenchmarkPayload(cfg, rows);
    assert.equal(payload.valid, false); assert.equal(payload.detail.steps[0].reference.hz, 1000);
  }
});

test('production analysis supplies real THD and isolated-channel metrics to guided records', () => {
  const rate = 8000, n = rate * 10, cfg = config(), steps = benchmarkSteps(cfg);
  for (const step of steps) {
    const r = result(); r.audio.sampleRate = rate; r.audio.left = new Float32Array(n); r.audio.right = new Float32Array(n); r.quality.framesCaptured = n;
    for (let i = 0; i < n; i++) { const tone = 0.2 * Math.sin(2 * Math.PI * 1000 * i / rate), harmonic = 0.002 * Math.sin(2 * Math.PI * 2000 * i / rate); r.audio.left[i] = step.id === 'right' ? tone / 100 : tone + harmonic; r.audio.right[i] = step.id === 'left' ? tone / 100 : tone + harmonic; }
    const run = buildRun({ test: step.test, workflowId: 'cartridge', audio: r.audio, params: { referenceHz: 1000, separationActive: step.id === 'right' ? 'right' : 'left' }, source: 'Live capture', device: { id: cfg.assetId }, quality: r.quality, streamErrors: [], deviceName: r.deviceName });
    const record = benchmarkStepRecord(step, r, run, null);
    assert.equal(record.issues.length, 0);
    if (step.id === 'tone') assert.ok(Math.abs(record.values.leftThdPercent - 1) < 0.02);
    else assert.ok(Math.abs(record.values.separationDb - 40) < 0.02);
  }
});

test('production control-vinyl analysis preserves reverse evidence and requires verified forward play', () => {
  const cfg = config({ timecodeFormat: 'Serato CV02.5' }), step = benchmarkSteps(cfg).at(-1);
  for (const direction of [1, -1]) {
    const r = result(15), rate = r.audio.sampleRate;
    r.audio.right = Float32Array.from(r.audio.right, (_, i) => 0.2 * Math.sin(2 * Math.PI * 1000 * i / rate + direction * Math.PI / 2));
    const run = buildRun({ test: step.test, workflowId: 'dvs', audio: r.audio, params: { nominalRpm: cfg.nominalRpm, timecodeFormat: cfg.timecodeFormat }, source: 'Live capture', device: { id: cfg.assetId }, quality: r.quality, streamErrors: [], deviceName: r.deviceName });
    const row = benchmarkStepRecord(step, r, run, null);
    assert.equal(row.measurements.find(m => m.metricId === 'tc_direction_code').value, direction);
    assert.equal(row.issues.some(issue => issue.includes('Forward control-vinyl')), direction !== 1);
    const rows = records(cfg); rows[3] = row; assert.equal(guidedBenchmarkPayload(cfg, rows).valid, direction === 1);
    run.measurements = run.measurements.filter(m => m.metricId !== 'tc_direction_code');
    assert.ok(benchmarkStepRecord(step, r, run, null).issues.some(issue => issue.includes('Forward control-vinyl')));
  }
});

test('guided panel exercises preparation, capture progress, explicit save and keyboard cancellation', async t => {
  const doc = installServiceDom(t), host = doc.createElement('div'); doc.body.append(host);
  const saving = deferred(), h = harness({ save: () => saving.promise }); let onSaved = 0;
  const panel = mountGuidedBenchmark(host, { asset: { id: 'stylus-a', name: 'A' }, hoursAt: 12, api: { benchmarkSave: async () => ({ id: 'saved' }) }, onSaved: () => onSaved++, io: { ...h.io, liveAvailable: () => true, createPairPicker: () => ({ el: null }), currentPairs: () => [1], deviceName: () => 'Input A', listSetups: async () => [] } });
  const q = id => host.querySelector(`#${id}`);
  for (const [id, value] of [['record', 'Reference LP'], ['side', 'A'], ['force', '2.5'], ['vta', 'Height 2'], ['chain', 'Deck > Input A']]) q(`sty-guided-${id}`).value = value;
  q('sty-guided-config').dispatch('submit'); assert.equal(doc.activeElement.id, 'sty-guided-record-step');
  for (let index = 0; index < 3; index++) { q('sty-guided-record-step').dispatch('click'); await settle(); assert.equal(doc.activeElement.id, 'sty-guided-cancel'); h.tick(10); await settle(); }
  assert.equal(doc.activeElement.id, 'sty-guided-save'); assert.equal(onSaved, 0);
  q('sty-guided-save').dispatch('click'); await settle();
  assert.equal(q('sty-guided-cancel'), null); assert.equal(q('sty-guided-save').disabled, true);
  assert.match(q('sty-guided-status').textContent, /storage write will continue/);
  host.dispatch('keydown', { key: 'Escape', stopPropagation() {} }); await settle();
  assert.match(q('sty-guided-status').textContent, /Saving/); assert.equal(onSaved, 0);
  saving.resolve({ id: 'saved' }); await settle(); assert.equal(onSaved, 1);
  panel.dispose();

  const other = doc.createElement('div'); doc.body.append(other); const h2 = harness();
  const p2 = mountGuidedBenchmark(other, { asset: { id: 'stylus-a', name: 'A' }, hoursAt: 12, api: {}, io: { ...h2.io, liveAvailable: () => true, createPairPicker: () => ({ el: null }), currentPairs: () => [1], deviceName: () => 'Input A', listSetups: async () => [] } });
  for (const [id, value] of [['record', 'LP'], ['force', '2'], ['vta', '0'], ['chain', 'unchanged']]) other.querySelector(`#sty-guided-${id}`).value = value;
  other.querySelector('#sty-guided-config').dispatch('submit'); other.querySelector('#sty-guided-record-step').dispatch('click'); await settle();
  other.dispatch('keydown', { key: 'Escape', stopPropagation() {} }); await settle();
  assert.equal(h2.sessions[0].cancelled, 1); assert.match(other.querySelector('#sty-guided-status').textContent, /cancelled/); assert.equal(h2.savedRuns.length, 0); p2.dispose();
});
