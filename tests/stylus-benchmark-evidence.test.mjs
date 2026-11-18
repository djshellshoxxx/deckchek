import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkSteps, benchmarkStepRecord, guidedBenchmarkPayload, benchmarkSaveIssue, GUIDED_DETAIL_LIMIT, GUIDED_BENCHMARK_VERSION, GUIDED_MEASUREMENT_METHOD } from '../app/stylus-benchmark.js';
import { createGuidedBenchmark } from '../app/ui/workflows/stylus-benchmark.js';
import { buildRun } from '../app/ui/analysis.js';
import { toPersistRun } from '../app/ui/persistence.js';
import { payloadToAudio } from '../app/ui/audio-io.js';
import { saveProfile, calibrationStatus } from '../app/ui/state.js';
import { thdUncertaintyPercent } from '../app/calibration.js';
import { installServiceDom, deferred, settle } from './fixtures/service-screen-dom.mjs';
import { guidedConfig, guidedProfile, guidedCapture } from './fixtures/stylus-guided.mjs';

function analyze(step, result, extra = {}) {
  return buildRun({ test: step.test, workflowId: 'cartridge', audio: result.audio, guidedBenchmarkStep: step.id === 'timecode' ? null : step.id,
    params: { referenceHz: 1000, separationActive: step.id === 'right' ? 'right' : 'left' },
    source: 'Live capture · Input A', device: { id: 'stylus-a', name: 'Cartridge A' }, quality: result.quality, streamErrors: result.streamErrors, deviceName: result.deviceName, ...extra });
}
function records(config = guidedConfig(), change = () => {}) {
  return benchmarkSteps(config).map(step => { let result = guidedCapture(step.id); result = change(step, result) || result; return benchmarkStepRecord(step, result, analyze(step, result), null); });
}
function sequenceCapture(sampleRate, frequencyAt) {
  const result = guidedCapture('tone', { sampleRate });
  for (let i = 0; i < result.audio.left.length; i++) result.audio.left[i] = result.audio.right[i] = .2 * Math.sin(2 * Math.PI * frequencyAt(i, result.audio.left.length) * i / sampleRate);
  return result;
}
function modulatedCapture(id, { sampleRate = 48000, frequency = () => 1000, amplitude = () => .2, harmonicRatio = () => 0, phaseOffset = () => 0, leakRatio = () => .01 } = {}) {
  const result = guidedCapture(id, { sampleRate }), phases = { left: 0, right: 0 };
  const channels = id === 'tone' ? ['left', 'right'] : [id];
  for (let i = 0; i < result.audio.left.length; i++) {
    const time = i / sampleRate;
    for (const channel of channels) {
      phases[channel] += 2 * Math.PI * frequency(time, channel) / sampleRate;
      const phase = phases[channel] + phaseOffset(time, channel);
      const value = amplitude(time, channel) * (Math.sin(phase) + harmonicRatio(time, channel) * Math.sin(phase * 2));
      result.audio[channel][i] = value;
      if (id !== 'tone') result.audio[channel === 'left' ? 'right' : 'left'][i] = value * leakRatio(time);
    }
  }
  return result;
}
function assertWindowCoverage(reference, samples, sampleRate) {
  assert.equal(reference.windows[0].startSample, 0); assert.equal(reference.windows.at(-1).endSample, samples);
  for (const [index, window] of reference.windows.entries()) {
    if (index) assert.equal(window.startSample, reference.windows[index - 1].endSample, 'contiguous windows omit no samples');
    assert.ok(window.endSample > window.startSample && window.endSample - window.startSample <= sampleRate * .5);
    for (const key of ['broadPeakHz', 'estimatedPeakHz', 'observedPeakHz']) assert.ok(Number.isFinite(window[key]), key);
  }
}
function runnerHarness(extra = {}) {
  let count = 0, now = Date.parse('2026-11-18T01:00:00Z');
  const savedRuns = [], savedBenchmarks = [], sessions = [];
  const cfg = extra.config || guidedConfig();
  const runner = createGuidedBenchmark({ config: cfg, profileFor: () => null, timers: { setInterval: () => 1, clearInterval() {} }, now: () => now,
    capture: async () => {
      const result = guidedCapture(benchmarkSteps(cfg)[count++].id), session = { info: result.captureInfo, stopped: false, elapsed: () => 10, cancel: async () => { session.stopped = true; }, stop: async () => { session.stopped = true; now += result.audio.durationSec * 1000; return result; } };
      sessions.push(session); return session;
    },
    persist: async run => { savedRuns.push(run); return { ok: true }; }, save: async payload => { savedBenchmarks.push(payload); return { id: 'benchmark-a' }; }, ...extra,
  });
  return { runner, savedRuns, savedBenchmarks, sessions, async complete() { for (let i = 0; i < benchmarkSteps(cfg).length; i++) { await runner.record(); await runner.finish(); } } };
}

test('real analysis rejects a dominant 500 Hz track whose weak 1 kHz harmonic looked clean', () => {
  const cfg = guidedConfig();
  const rows = records(cfg, step => step.id === 'tone' ? guidedCapture('tone', { frequency: 500, harmonics: { 2: .0005 } }) : undefined);
  const payload = guidedBenchmarkPayload(cfg, rows);
  assert.equal(rows[0].values.leftThdPercent, null, 'an unresolved reference family has no guided THD value');
  assert.equal(payload.valid, false); assert.match(payload.detail.issues.join(' '), /dominant signal/);
  assert.ok(Math.abs(rows[0].reference.channels[0].observedPeakHz - 500) < .1);
  assert.ok(rows[0].reference.channels[0].nominalCoherentLevelDbfs > -70, 'nominal reference presence alone cannot reject it');
  const changed = records(cfg, step => {
    if (step.id !== 'tone') return;
    const result = guidedCapture('tone', { frequency: 500 });
    for (let i = 0; i < 32768; i++) result.audio.left[i] = result.audio.right[i] = .2 * Math.sin(2 * Math.PI * 1000 * i / result.audio.sampleRate);
    return result;
  });
  const changedPayload = guidedBenchmarkPayload(cfg, changed);
  assert.equal(changedPayload.valid, false, 'a correct short introduction cannot qualify a different signal over the rest of the capture');
  assert.match(changedPayload.detail.issues.join(' '), /dominant signal/);
  assert.equal(changed[0].reference.channels[0].spectrumSamples, 220500);
});

test('strong second and third harmonics retain real adverse THD rather than invalidating the reference', () => {
  for (const sampleRate of [22050, 48000]) for (const order of [2, 3]) for (const frequency of [1000, 1001]) {
    const cfg = guidedConfig(), rows = records(cfg, step => guidedCapture(step.id, { sampleRate, frequency, ...(step.id === 'tone' ? { harmonics: { [order]: .4 } } : {}) }));
    const payload = guidedBenchmarkPayload(cfg, rows);
    assert.equal(payload.valid, true, payload.detail.issues.join('; '));
    assert.ok(Math.abs(payload.thdPercent - 200) < .05);
    assert.equal(rows[0].reference.channels[0].dominantHarmonic, order);
    assert.ok(Math.abs(rows[0].reference.channels[0].familyReferenceHz - frequency) < .1);
    assert.ok(rows[0].reference.channels[0].windows.every(window => window.dominantHarmonic === order));
  }
});

test('coherent integer offsets produce the same usable measurements in History and benchmark evidence', () => {
  const cfg = guidedConfig();
  for (const frequency of [999, 1000, 1001, 1002]) {
    const rows = benchmarkSteps(cfg).map(step => {
      const result = guidedCapture(step.id, { sampleRate: 48000, frequency }), run = analyze(step, result);
      const row = benchmarkStepRecord(step, result, run, null), saved = toPersistRun(run);
      assert.equal(run.params.referenceHz, 1000, 'nominal declaration is unchanged');
      assert.ok(saved.findings.some(finding => finding.code === 'GUIDED_REFERENCE_MEASUREMENT' && finding.detail.includes(GUIDED_MEASUREMENT_METHOD)));
      const metrics = step.id === 'tone' ? [['leftThdPercent', 'left_thd_percent'], ['rightThdPercent', 'right_thd_percent']] : [['separationDb', 'channel_separation_db']];
      for (const [key, id] of metrics) {
        const stored = saved.measurements.find(measurement => measurement.metricId === id), original = run.measurements.find(measurement => measurement.metricId === id);
        assert.equal(stored.value, row.values[key]); assert.equal(stored.value, row.measurementBasis.rawValues[key]);
        assert.ok(stored.qualityFlags.includes(GUIDED_MEASUREMENT_METHOD));
        assert.equal(stored.uncertainty, original.uncertainty.expanded);
        if (step.id === 'tone') assert.ok(stored.value < stored.uncertainty, `${frequency} Hz pure-tone THD ${stored.value} exceeds its existing estimator uncertainty ${stored.uncertainty}`);
        else assert.ok(Math.abs(stored.value - 40) < .02, `${frequency} Hz isolation`);
      }
      for (const channel of row.reference.channels) {
        assertWindowCoverage(channel, result.audio.left.length, result.audio.sampleRate);
        assert.ok(channel.levelDbfs > -70);
        if (frequency !== 1000) assert.ok(channel.nominalCoherentLevelDbfs <= -70, 'the original nominal projection cancels for this exact offset');
        assert.ok(channel.windows.every(window => Math.abs(window.observedPeakHz / window.dominantHarmonic - frequency) < .01));
      }
      return row;
    });
    const payload = guidedBenchmarkPayload(cfg, rows);
    assert.equal(payload.valid, true, `${frequency} Hz: ${payload.detail.issues.join('; ')}`);
    assert.ok(payload.thdPercent < .12); assert.ok(Math.abs(payload.separationDb - 40) < .02);
    console.log('FS-12 coherent reference', JSON.stringify({ frequencyHz: frequency, thdPercent: payload.thdPercent, separationDb: payload.separationDb, valid: payload.valid }));
  }
});

test('piecewise and drifting references use their complete local windows and each channel frequency', () => {
  const cfg = guidedConfig();
  for (const [name, frequency] of [
    ['different stereo frequencies', (time, channel) => channel === 'left' ? 999 : 1002],
    ['piecewise frequency', time => time < 3.25 ? 999 : time < 7.1 ? 1002 : 1000],
    ['continuous drift', time => 997.1 + .58 * time],
  ]) {
    const rows = records(cfg, step => modulatedCapture(step.id, { frequency, phaseOffset: (time, channel) => channel === 'left' ? .31 : .73 }));
    const payload = guidedBenchmarkPayload(cfg, rows);
    assert.equal(payload.valid, true, `${name}: ${payload.detail.issues.join('; ')}`);
    assert.ok(Math.abs(payload.separationDb - 40) < .02, name);
    for (const row of rows) for (const channel of row.reference.channels) assertWindowCoverage(channel, 480000, 48000);
    for (const id of ['left_thd_percent', 'right_thd_percent']) {
      const measurement = rows[0].measurements.find(value => value.metricId === id);
      assert.ok(measurement.value < measurement.uncertainty.expanded, `${name}: ${id} ${measurement.value}`);
    }
    if (name === 'different stereo frequencies') assert.ok(rows[0].reference.channels[1].familyReferenceHz - rows[0].reference.channels[0].familyReferenceHz > 2.9);
  }
});

test('power pooling preserves changing amplitude, harmonic ratio and phase instead of averaging percentages', () => {
  const cfg = guidedConfig();
  const rows = records(cfg, step => modulatedCapture(step.id, {
    frequency: () => 1001, amplitude: time => time < 5 ? .2 : .05, phaseOffset: time => time < 5 ? 0 : Math.PI,
    harmonicRatio: time => step.id === 'tone' ? time < 5 ? .02 : .1 : 0,
    leakRatio: time => time < 5 ? .01 : .1,
  }));
  const payload = guidedBenchmarkPayload(cfg, rows), expectedThd = 100 * Math.sqrt(41 / 42500), expectedSeparation = 10 * Math.log10(.0425 / .000029);
  assert.equal(payload.valid, true, payload.detail.issues.join('; '));
  assert.ok(Math.abs(payload.thdPercent - expectedThd) < .02, `${payload.thdPercent} versus ${expectedThd}`);
  assert.ok(Math.abs(payload.separationDb - expectedSeparation) < .02, `${payload.separationDb} versus ${expectedSeparation}`);
  assert.ok(rows[0].reference.channels.every(channel => channel.windows.every(window => window.fundamentalAmplitude > 0 && Number.isFinite(window.thdPercent))));
});

test('unresolved families and unmeasurable fundamentals stay unavailable through structured History and save preflight', async () => {
  const cfg = guidedConfig();
  for (const frequency of [500, 2000]) {
    const rows = benchmarkSteps(cfg).map(step => {
      const result = guidedCapture(step.id, { frequency }), run = analyze(step, result), row = benchmarkStepRecord(step, result, run, null);
      assert.ok(Object.values(row.values).every(value => value === null));
      const saved = toPersistRun(run);
      assert.ok(saved.measurements.length > 0, 'observed capture and level measurements still persist');
      assert.ok(!saved.measurements.some(measurement => ['left_thd_percent', 'right_thd_percent', 'channel_separation_db'].includes(measurement.metricId)));
      assert.ok(saved.findings.some(finding => finding.code === 'GUIDED_REFERENCE_READINESS'));
      return row;
    });
    const payload = guidedBenchmarkPayload(cfg, rows);
    assert.equal(payload.valid, false); assert.equal(payload.thdPercent, null); assert.equal(payload.separationDb, null);
    assert.match(benchmarkSaveIssue(payload), /No benchmark metric/);
    assert.equal(payload.detail.steps.flatMap(row => row.reference.channels).reduce((count, channel) => count + channel.windows.length, 0), 80);
  }
  let index = 0, time = Date.parse('2026-11-18T01:00:00Z');
  const h = runnerHarness({ now: () => time, capture: async () => {
    const result = guidedCapture(['tone', 'left', 'right'][index++], { frequency: 2000 });
    return { info: result.captureInfo, elapsed: () => 10, stop: async () => { time += 10000; return result; }, cancel: async () => {} };
  } });
  await h.complete(); const state = h.runner.snapshot();
  assert.equal(state.phase, 'review'); assert.equal(state.saveBlocked, true); assert.match(state.error, /No benchmark metric/);
  assert.equal(h.savedRuns.length, 3, 'source evidence still reaches History');
  await h.runner.save(); assert.equal(h.savedBenchmarks.length, 0, 'an all-unavailable review cannot dispatch a benchmark write'); h.runner.dispose();
});

test('ordinary fixed-reference runs remain unchanged and cannot be silently promoted to measured-reference benchmarks', () => {
  const cfg = guidedConfig(), step = benchmarkSteps(cfg)[0], result = guidedCapture('tone', { sampleRate: 48000, frequency: 1001 });
  const ordinary = analyze(step, result, { guidedBenchmarkStep: null }), original = structuredClone(ordinary);
  assert.equal(ordinary.evidence.guidedBenchmarkAnalysis, undefined);
  assert.ok(ordinary.measurements.find(value => value.metricId === 'left_thd_percent').value > 5, 'the ordinary fixed-reference algorithm is deliberately unchanged');
  const row = benchmarkStepRecord(step, result, ordinary, null);
  assert.match(row.issues.join('; '), /lacks matching guided/); assert.deepEqual(ordinary, original);
  const guided = analyze(step, result), measurement = guided.measurements.find(value => value.metricId === 'left_thd_percent');
  measurement.value += 1;
  assert.match(benchmarkStepRecord(step, result, guided, null).issues.join('; '), /does not match its retained guided analysis/);
});

test('short correct prefixes and suffixes cannot overwrite the rest of the capture at either input rate', () => {
  const cfg = guidedConfig(), step = benchmarkSteps(cfg)[0];
  for (const sampleRate of [22050, 48000]) for (const location of ['prefix', 'suffix']) {
    const result = sequenceCapture(sampleRate, (index, samples) => (location === 'prefix' ? index < 32768 : index >= samples - 32768) ? 1000 : 1005);
    const row = benchmarkStepRecord(step, result, analyze(step, result), null);
    assert.match(row.issues.join('; '), /dominant signal/, `${sampleRate} ${location}`);
    for (const channel of row.reference.channels) {
      assertWindowCoverage(channel, result.audio.left.length, sampleRate);
      assert.ok(channel.windows.some(window => Math.abs(window.observedPeakHz - 1000) < .1), 'retain the correct region');
      assert.ok(channel.windows.some(window => Math.abs(window.observedPeakHz - 1005) < .1), 'retain the mismatched region');
      assert.ok(Math.abs(channel.broadPeakHz - 1005) < .3, 'full-capture broad evidence is not overwritten');
      assert.ok(Math.abs(channel.differencePercent) > .3, 'summary reflects a disqualifying window');
    }
  }
});

test('wrong prefix, suffix and opposing middle regions stay excluded even with a valid overall peak', () => {
  const cfg = guidedConfig(), step = benchmarkSteps(cfg)[0];
  for (const sampleRate of [22050, 48000]) for (const location of ['prefix', 'suffix', 'middle']) {
    const result = sequenceCapture(sampleRate, (index, samples) => {
      if (location === 'prefix') return index < 32768 ? 1005 : 1000;
      if (location === 'suffix') return index >= samples - 32768 ? 1005 : 1000;
      const time = index / sampleRate;
      return time >= 3 && time < 5 ? 1005 : time >= 5 && time < 7 ? 995 : 1000;
    });
    const row = benchmarkStepRecord(step, result, analyze(step, result), null);
    assert.match(row.issues.join('; '), /dominant signal/, `${sampleRate} ${location}`);
    for (const channel of row.reference.channels) {
      assertWindowCoverage(channel, result.audio.left.length, sampleRate);
      assert.ok(Math.abs(channel.broadPeakHz - 1000) < .3, 'the broad overall peak alone appears eligible');
      assert.ok(channel.windows.some(window => Math.abs(window.differencePercent) > .3));
      if (location === 'middle') {
        assert.ok(channel.windows.some(window => window.startSample >= sampleRate * 3 && window.endSample <= sampleRate * 5 && window.differencePercent > .3));
        assert.ok(channel.windows.some(window => window.startSample >= sampleRate * 5 && window.endSample <= sampleRate * 7 && window.differencePercent < -.3));
      }
    }
  }
});

test('near-boundary valid references stay eligible and every window retains its measured frequency', () => {
  const cfg = guidedConfig();
  for (const sampleRate of [22050, 48000]) for (const frequency of [997.05, 1002.95]) {
    const rows = records(cfg, step => guidedCapture(step.id, { sampleRate, frequency })), payload = guidedBenchmarkPayload(cfg, rows);
    assert.equal(payload.valid, true, `${sampleRate} ${frequency}: ${payload.detail.issues.join('; ')}`);
    for (const row of rows) for (const channel of row.reference.channels) {
      assertWindowCoverage(channel, sampleRate * 10, sampleRate);
      assert.ok(channel.windows.every(window => Math.abs(window.differencePercent) < .3));
      assert.ok(channel.windows.every(window => Math.abs(window.observedPeakHz - frequency) < .01));
    }
  }
});

test('one bounded 192 kHz capture retains full coverage and the middle-region disagreement', () => {
  const sampleRate = 192000, step = benchmarkSteps(guidedConfig())[0];
  const result = sequenceCapture(sampleRate, index => index >= sampleRate * 3 && index < sampleRate * 7 ? 1005 : 1000);
  const started = performance.now(), run = analyze(step, result), analysed = performance.now(), row = benchmarkStepRecord(step, result, run, null), finished = performance.now();
  assert.match(row.issues.join('; '), /dominant signal/);
  for (const channel of row.reference.channels) {
    assertWindowCoverage(channel, result.audio.left.length, sampleRate);
    assert.ok(channel.windows.some(window => window.startSample >= sampleRate * 3 && window.endSample <= sampleRate * 7 && window.differencePercent > .3));
  }
  console.log('FS-12 bounded high-rate observation', JSON.stringify({ sampleRate, durationSec: result.audio.durationSec, channels: 2, windowsPerChannel: row.reference.channels[0].windows.length,
    analysisWithReadinessMs: Math.round(analysed - started), recordMs: Math.round(finished - analysed), totalMs: Math.round(finished - started) }));
});

test('existing speed-readiness criterion accepts nearby controls and excludes a mismatched observed family', () => {
  const cfg = guidedConfig();
  for (const [frequency, accepted] of [[997.5, true], [1000, true], [1002.5, true], [996.5, false], [1003.5, false]]) {
    const step = benchmarkSteps(cfg)[0], result = guidedCapture('tone', { frequency }), row = benchmarkStepRecord(step, result, analyze(step, result), null);
    assert.equal(row.issues.some(issue => issue.includes('dominant signal')), !accepted, String(frequency));
  }
});

test('zero and negative measured separation remain adverse observations, not an invented quality gate', () => {
  for (const [leftScale, rightScale, expected] of [[1, 1, 0], [.01, 1, -40]]) {
    const cfg = guidedConfig(), rows = records(cfg, step => step.id === 'left' ? guidedCapture('left', { leftScale, rightScale }) : undefined);
    const payload = guidedBenchmarkPayload(cfg, rows);
    assert.equal(payload.valid, true, payload.detail.issues.join('; ')); assert.ok(Math.abs(payload.separationDb - expected) < .01);
  }
});

test('THD requires observable H2 through H5 and retains evidence when the rate is insufficient', () => {
  const cfg = guidedConfig(), step = benchmarkSteps(cfg)[0];
  for (const rate of [2500, 8000, 10000, 11025, 22050, 48000]) {
    const result = guidedCapture('tone', { sampleRate: rate }), row = benchmarkStepRecord(step, result, analyze(step, result), null);
    assert.equal(row.issues.some(issue => issue.includes('five harmonics')), rate <= 10000, String(rate));
    assert.equal(row.reference.requiredUpperHz, 5000); assert.equal(row.context.sampleRate, rate);
    assertWindowCoverage(row.reference.channels[0], result.audio.left.length, rate);
    if (rate <= 10000) assert.equal(row.values.leftThdPercent, null, 'unobservable harmonics cannot manufacture a zero THD result');
  }
});

test('missing loss fields never persist as measured zero while observed zero and raw faults survive', () => {
  const step = benchmarkSteps(guidedConfig())[0];
  for (const alter of [result => { delete result.quality.overrunSamples; delete result.quality.streamErrors; delete result.quality.maxCallbackGapMs; }, result => { result.quality.streamErrorMessages = {}; }]) {
    const result = guidedCapture('tone'); alter(result); const run = analyze(step, result), row = benchmarkStepRecord(step, result, run, null);
    assert.ok(row.issues.length); assert.deepEqual(row.quality, result.quality);
    for (const [key, metricId] of [['overrunSamples', 'capture_overrun_samples'], ['streamErrors', 'capture_stream_errors'], ['maxCallbackGapMs', 'capture_max_callback_gap_ms']]) {
      const value = toPersistRun(run).measurements.find(m => m.metricId === metricId);
      if (result.quality[key] === undefined) assert.equal(value, undefined); else assert.equal(value.value, result.quality[key]);
    }
  }
});

test('native acquisition observations must exist and agree with the final device, rate and pair', async () => {
  for (const alteration of [info => null, info => ({ ...info, deviceName: 'Input B' }), info => ({ ...info, sampleRate: 48000 }), info => ({ ...info, pairs: [{ first: 3, second: 4, mono: false }] })]) {
    let index = 0;
    const h = runnerHarness({ capture: async () => { const result = guidedCapture(['tone', 'left', 'right'][index++]); return { info: alteration(result.captureInfo), stopped: false, elapsed: () => 10, stop: async () => result, cancel: async () => {} }; } });
    await h.complete();
    const payload = h.runner.snapshot().payload;
    assert.equal(payload.valid, false); assert.match(payload.detail.issues.join(' '), /capture-start/);
    assert.deepEqual(h.savedRuns[0].evidence.stylusBenchmark.step.captureInfo, payload.detail.steps[0].captureInfo);
    h.runner.dispose();
  }
});

test('the real native adapter retains fallback audio without promoting missing right/rate/pair fields to observations', () => {
  const step = benchmarkSteps(guidedConfig())[0];
  for (const missing of [null, 'right', 'sampleRate', 'channels', 'pairs', 'deviceName', 'streamErrors']) {
    const result = guidedCapture('tone', { sampleRate: 48000 });
    const payload = { left: result.audio.left, right: result.audio.right, sampleRate: 48000, channels: 2, pairs: result.captureInfo.pairs, deviceName: result.deviceName, streamErrors: [] };
    if (missing) delete payload[missing];
    result.audio = payloadToAudio(payload);
    assert.equal(result.audio.left.length, 480000); assert.equal(result.audio.right.length, 480000); assert.equal(result.audio.sampleRate, 48000); assert.equal(result.audio.pairs[0].pair.first, 1);
    if (missing === 'right') assert.deepEqual(result.audio.left, result.audio.right, 'other callers retain the legacy duplicate-channel fallback');
    const record = benchmarkStepRecord(step, result, analyze(step, result), null);
    assert.equal(record.issues.some(issue => issue.includes('compatibility defaults')), Boolean(missing), String(missing));
    if (missing) { assert.equal(record.nativeFields[missing].present, false); assert.equal(record.nativeFields[missing].valid, false); }
    else assert.equal(record.issues.length, 0, 'explicit native stereo control remains eligible');
  }
});

test('uncalibrated captures are repeatable while anonymous, rejected and mismatched profiles stay unapplied', async () => {
  const none = runnerHarness(); await none.complete(); assert.equal(none.runner.snapshot().payload.valid, true);
  assert.equal(none.runner.snapshot().payload.detail.steps[0].context.calibrationObservation.state, 'uncalibrated'); none.runner.dispose();
  for (const profile of [guidedProfile({ deviceName: undefined }), guidedProfile({ deviceName: 'Input B' }), guidedProfile({ sampleRate: 48000 }), guidedProfile({ valid: false, issues: ['failed'] })]) {
    const h = runnerHarness({ profileFor: () => profile }); await h.complete();
    const payload = h.runner.snapshot().payload; assert.equal(payload.valid, false); assert.match(payload.detail.issues.join(' '), /Calibration/);
    assert.ok(h.savedRuns.every(run => !run.calibration.applied));
    assert.deepEqual(payload.detail.steps[0].context.calibrationProfile, JSON.parse(JSON.stringify(profile)));
    h.runner.dispose();
  }
  const good = runnerHarness({ profileFor: () => guidedProfile() }); await good.complete();
  assert.equal(good.runner.snapshot().payload.valid, true); assert.ok(good.savedRuns.every(run => run.calibration.applied));
  assert.ok(good.savedRuns[0].measurements.find(m => m.metricId === 'left_thd_percent').uncertainty); good.runner.dispose();
});

test('the real calibration resolver retains a known mismatch instead of claiming no profile', async t => {
  installServiceDom(t); const rejected = guidedProfile({ valid: false, issues: ['calibration failed'] }); saveProfile(rejected);
  assert.equal(calibrationStatus('Input A', 22050).state, 'mismatch');
  const h = runnerHarness({ profileFor: null }); await h.complete();
  const payload = h.runner.snapshot().payload; assert.equal(payload.valid, false);
  assert.equal(payload.detail.steps[0].context.calibrationObservation.reportedState, 'mismatch');
  assert.deepEqual(payload.detail.steps[0].context.calibrationProfile, rejected);
  assert.ok(h.savedRuns[0].calibration.reasons.includes('profile verdict is invalid')); h.runner.dispose();
});

test('late asynchronous calibration lookup cannot persist or advance a cancelled capture', async () => {
  const pending = deferred(), h = runnerHarness({ profileFor: () => pending.promise });
  await h.runner.record(); const ending = h.runner.finish(); await settle(); h.runner.cancel(); pending.resolve(guidedProfile()); await ending;
  assert.equal(h.runner.snapshot().phase, 'cancelled'); assert.equal(h.savedRuns.length, 0); assert.equal(h.savedBenchmarks.length, 0); h.runner.dispose();
});

test('out-of-schema values remain exact in excluded evidence, with null trend values and no clamping', async () => {
  const capture = id => {
    const result = guidedCapture(id);
    if (id === 'tone') for (let i = 0; i < result.audio.left.length; i++) {
      const phase = 2 * Math.PI * 1000 * i / result.audio.sampleRate;
      result.audio.left[i] = result.audio.right[i] = .001 * Math.sin(phase) + .2 * Math.sin(phase * 2);
    }
    return result;
  };
  let index = 0;
  const h = runnerHarness({ capture: async () => { const result = capture(['tone', 'left', 'right'][index++]); return { info: result.captureInfo, elapsed: () => 10, stop: async () => result, cancel: async () => {} }; } });
  await h.complete(); const payload = h.runner.snapshot().payload;
  assert.equal(payload.valid, false); assert.equal(payload.thdPercent, null); assert.ok(payload.detail.steps[0].values.leftThdPercent > 1000);
  assert.equal(benchmarkSaveIssue(payload), null); await h.runner.save(); assert.equal(h.savedBenchmarks.length, 1); h.runner.dispose();
  const rows = records(guidedConfig(), step => step.id === 'tone' ? capture('tone') : guidedCapture(step.id, step.id === 'left' ? { rightScale: 0 } : { leftScale: 0 }));
  const empty = guidedBenchmarkPayload(guidedConfig(), rows);
  assert.equal(empty.thdPercent, null); assert.equal(empty.separationDb, null); assert.match(benchmarkSaveIssue(empty), /No benchmark metric/);
});

test('oversize UTF-8 evidence blocks the benchmark write without pruning the profile or changing its asset', async () => {
  const profile = guidedProfile({ note: 'é'.repeat(14000) }), h = runnerHarness({ profileFor: () => profile }); await h.complete();
  const state = h.runner.snapshot(); assert.equal(state.phase, 'review'); assert.equal(state.saveBlocked, true); assert.match(state.error, /No evidence was trimmed/);
  assert.ok(new TextEncoder().encode(JSON.stringify(state.payload.detail)).byteLength > GUIDED_DETAIL_LIMIT);
  assert.equal(state.payload.detail.steps[0].context.calibrationProfile.note, profile.note);
  assert.ok(h.savedRuns.every(run => run.assetId === 'stylus-a' && run.setupId === 'setup-a' && run.evidence.stylusBenchmark.step.context.calibrationProfile.note === profile.note));
  assert.equal(toPersistRun(h.savedRuns[0]).evidence, undefined, 'native structured History does not promise the full local metadata');
  await h.runner.save(); assert.equal(h.savedBenchmarks.length, 0); h.runner.dispose();
});

test('calibrated optional timecode retains every observation at normal and overshooting capture durations', async () => {
  for (const [sampleRate, seconds] of [[22050, 10], [48000, 10.1], [48000, 10.5]]) {
    const cfg = guidedConfig({ timecodeFormat: 'Serato CV02.5' }); let index = 0, time = Date.parse('2026-11-18T01:00:00Z');
    const h = runnerHarness({ config: cfg, now: () => time, profileFor: () => guidedProfile({ sampleRate }), capture: async () => {
      const step = benchmarkSteps(cfg)[index++], result = guidedCapture(step.id, { sampleRate });
      if (step.id !== 'timecode') {
        const n = Math.round(sampleRate * seconds), left = new Float32Array(n), right = new Float32Array(n);
        for (let i = 0; i < n; i++) { const value = .2 * Math.sin(2 * Math.PI * 1001 * i / sampleRate); left[i] = value * (step.id === 'right' ? .01 : 1); right[i] = value * (step.id === 'left' ? .01 : 1); }
        result.audio = payloadToAudio({ left, right, sampleRate, channels: 2, pairs: result.captureInfo.pairs, deviceName: result.deviceName, streamErrors: [] });
        result.quality.framesCaptured = n;
      }
      return { info: result.captureInfo, elapsed: () => result.audio.durationSec, stop: async () => { time += result.audio.durationSec * 1000; return result; }, cancel: async () => {} };
    } });
    await h.complete(); const state = h.runner.snapshot();
    assert.equal(state.phase, 'review'); assert.equal(state.payload.valid, true, state.payload.detail.issues.join('; '));
    assert.equal(state.saveBlocked, false, state.error); assert.equal(benchmarkSaveIssue(state.payload), null);
    assert.ok(Number.isFinite(state.payload.tcSnrDb)); assert.ok(Math.abs(state.payload.separationDb - 40) < .02);
    let windows = 0;
    for (const [stepIndex, record] of state.payload.detail.steps.slice(0, 3).entries()) {
      const run = h.savedRuns[stepIndex], source = run.evidence.guidedBenchmarkAnalysis, saved = toPersistRun(run);
      for (const [channelIndex, channel] of record.reference.channels.entries()) {
        const restored = channel.windows.map(window => Object.fromEntries(record.reference.windowColumns.map((key, index) => [key, window[index]])));
        assert.deepEqual(restored, source.reference.channels[channelIndex].windows, 'versioned columns retain every exact window field and value');
        assertWindowCoverage({ windows: restored }, Math.round(sampleRate * seconds), sampleRate); windows += restored.length;
      }
      const keys = record.step === 'tone' ? [['leftThdPercent', 'left_thd_percent'], ['rightThdPercent', 'right_thd_percent']] : [['separationDb', 'channel_separation_db']];
      for (const [key, id] of keys) {
        const measurement = run.measurements.find(value => value.metricId === id), stored = saved.measurements.find(value => value.metricId === id);
        assert.equal(stored.value, record.values[key]); assert.equal(measurement.rawValue, record.measurementBasis.rawValues[key]);
        assert.ok(stored.qualityFlags.includes(GUIDED_MEASUREMENT_METHOD)); assert.equal(stored.qualityFlags.filter(flag => flag === 'calibrated').length, 1);
        if (record.step === 'tone') {
          const windowSamples = source.uncertaintyBasis.effectiveWindowSamples;
          assert.deepEqual(measurement.uncertainty, thdUncertaintyPercent({ windowSamples, chainThdnPercent: .05 }), 'include taper ENBW without reducing uncertainty by window count');
          assert.ok(windowSamples < source.uncertaintyBasis.physicalWindowSamples);
        }
      }
    }
    assert.equal(windows, 4 * Math.ceil(seconds / .5));
    console.log('FS-12 complete bounded detail', JSON.stringify({ sampleRate, seconds, windows, bytes: new TextEncoder().encode(JSON.stringify(state.payload.detail)).byteLength }));
    await h.runner.save(); assert.equal(h.savedBenchmarks.length, 1); h.runner.dispose();
  }
});

test('the measured-reference analysis version distinguishes old guided baselines without rewriting them', () => {
  const cfg = guidedConfig(), rows = records(cfg), old = { ...guidedBenchmarkPayload(cfg, rows), createdAt: '2026-11-01T00:00:00Z' };
  old.detail.version = GUIDED_BENCHMARK_VERSION - 1; const original = structuredClone(old);
  const payload = guidedBenchmarkPayload(cfg, rows, [old]);
  assert.equal(payload.detail.version, GUIDED_BENCHMARK_VERSION); assert.equal(payload.valid, false); assert.match(payload.detail.issues.join('; '), /analysis version differs/);
  assert.deepEqual(old, original);
});

test('operator-confirmed legacy comparison keeps its basis and never fabricates historical observations', () => {
  const history = [{ id: 'old', assetId: 'stylus-a', hoursAt: 0, thdPercent: .2, separationDb: 40, valid: true, detail: {}, createdAt: '2026-11-01T00:00:00Z' }], original = structuredClone(history);
  const cfg = guidedConfig(), payload = guidedBenchmarkPayload(cfg, records(cfg), history);
  assert.equal(payload.valid, true); assert.equal(payload.detail.conditionEvidence, 'operator-confirmed-legacy-baseline'); assert.deepEqual(history, original);
  const declined = guidedBenchmarkPayload(guidedConfig({ sameConditions: false }), records(), history); assert.equal(declined.valid, false);
});
