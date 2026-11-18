import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuidedBenchmark } from '../app/ui/workflows/stylus-benchmark.js';
import { benchmarkSteps, GUIDED_BENCHMARK_VERSION, GUIDED_MEASUREMENT_METHOD } from '../app/stylus-benchmark.js';
import { payloadToAudio } from '../app/ui/audio-io.js';
import { store, workspace } from '../app/ui/state.js';
import { thdUncertaintyPercent, separationUncertaintyDb, levelUncertaintyDb } from '../app/calibration.js';
import { dbfs } from '../app/core.js';
import { guidedCapture, guidedConfig, guidedProfile } from './fixtures/stylus-guided.mjs';
import { installServiceDom } from './fixtures/service-screen-dom.mjs';

function capture(step, { sampleRate = 48000, seconds = step.seconds, frequency = 1000, amplitude = .2, harmonic = 0, harmonicAmplitude = 0, phase = 0, signal = null } = {}) {
  const result = guidedCapture(step.id, { sampleRate }), n = Math.round(sampleRate * seconds);
  const left = new Float32Array(n), right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = 2 * Math.PI * frequency * i / sampleRate + phase;
    const value = signal ? signal(i, n) : amplitude * Math.sin(p) + harmonicAmplitude * Math.sin(p * harmonic);
    left[i] = value * (step.id === 'right' ? .01 : 1); right[i] = value * (step.id === 'left' ? .01 : 1);
  }
  result.audio = payloadToAudio({ left, right, sampleRate, channels: 2, deviceName: result.deviceName, pairs: result.captureInfo.pairs, streamErrors: [] });
  result.quality.framesCaptured = n;
  return result;
}

// Only the input lease and database boundary are injected. Analysis, calibration,
// local History, toPersistRun shaping and explicit benchmark Save are production.
function harness(t, { make = step => capture(step), profile = null } = {}) {
  installServiceDom(t); workspace.runs = [];
  const cfg = guidedConfig(), steps = benchmarkSteps(cfg), history = [], benchmarks = [];
  const saved = t.mock.method(store, 'saveRun', async payload => { history.push(structuredClone(payload)); return { id: payload.id }; });
  let index = 0, time = Date.parse('2026-11-18T01:00:00Z');
  const runner = createGuidedBenchmark({ config: cfg, profileFor: () => profile, now: () => time, clock: () => time,
    timers: { setInterval: () => 1, clearInterval() {} },
    capture: async () => {
      const result = make(steps[index++]);
      return { info: result.captureInfo, stopped: false, elapsed: () => result.audio.durationSec,
        stop: async () => { time += result.audio.durationSec * 1000; return result; }, cancel: async () => {} };
    }, save: async payload => { benchmarks.push(structuredClone(payload)); return { id: 'benchmark-windowing' }; },
  });
  return { runner, history, benchmarks,
    runs: () => history.map(row => workspace.runs.find(run => run.id === row.id)),
    async complete() {
      for (const step of steps) { await runner.record(); assert.equal(runner.snapshot().phase, 'recording', step.id); await runner.finish(); assert.notEqual(runner.snapshot().phase, 'error', runner.snapshot().error); }
      assert.equal(runner.snapshot().phase, 'review'); return runner.snapshot();
    },
    close() { runner.dispose(); saved.mock.restore(); workspace.runs = []; },
  };
}

function assertEvidence(h, state) {
  const payload = JSON.parse(JSON.stringify(state.payload));
  assert.equal(payload.detail.version, GUIDED_BENCHMARK_VERSION);
  for (const [index, run] of h.runs().entries()) {
    const row = payload.detail.steps[index], columns = row.reference.windowColumns;
    for (const channel of row.reference.channels) channel.windows = channel.windows.map(values => {
      assert.equal(values.length, columns.length);
      return Object.fromEntries(columns.map((key, column) => [key, values[column]]));
    });
    delete row.reference.windowColumns;
    assert.deepEqual(row, run.evidence.stylusBenchmark.step, 'every original and tapered observation survives History-linked payload encoding');
    const lengths = new Set();
    for (const channel of row.reference.channels) {
      let cursor = 0;
      for (const window of channel.windows) {
        assert.equal(window.startSample, cursor); assert.ok(window.endSample > cursor && window.endSample - cursor <= run.sampleRate * .5);
        cursor = window.endSample; lengths.add(window.endSample - window.startSample);
      }
      assert.equal(cursor, run.totalSamples);
    }
    const tapers = row.reference.windowing.byLength;
    assert.deepEqual(new Set(tapers.map(taper => taper.samples)), lengths);
    for (const taper of tapers) {
      assert.equal(taper.coherentGain, taper.sumWeights / taper.samples);
      assert.equal(taper.noiseBandwidthBins, taper.samples * taper.sumSquaredWeights / taper.sumWeights ** 2);
      assert.equal(taper.effectiveSamples, taper.sumWeights ** 2 / taper.sumSquaredWeights);
      assert.ok(Math.abs(taper.coherentGain - .5) < 1e-12); assert.ok(Math.abs(taper.noiseBandwidthBins - 1.5) < 1e-12);
    }
    const metrics = row.step === 'tone' ? [['leftThdPercent', 'left_thd_percent'], ['rightThdPercent', 'right_thd_percent']] : [['separationDb', 'channel_separation_db']];
    for (const [key, id] of metrics) {
      const measured = run.measurements.find(value => value.metricId === id), saved = h.history[index].measurements.find(value => value.metricId === id);
      assert.equal(measured.value, row.values[key]);
      assert.equal(Object.hasOwn(measured, 'rawValue') ? measured.rawValue : measured.value, row.measurementBasis.rawValues[key]);
      assert.ok(measured.qualityFlags.includes(GUIDED_MEASUREMENT_METHOD));
      if (measured.value === null) assert.equal(saved, undefined);
      else { assert.equal(saved.value, measured.value); assert.equal(saved.uncertainty, measured.uncertainty.expanded); assert.ok(saved.qualityFlags.includes(GUIDED_MEASUREMENT_METHOD)); }
    }
  }
  return payload;
}

test('pure offset H2/H3/H4/H5 cannot leak into a qualified fundamental through the real History path', async t => {
  for (const sampleRate of [22050, 48000]) for (const harmonic of [2, 3, 4, 5]) for (const frequency of [999, 1000.5, 1001]) {
    const h = harness(t, { make: step => capture(step, step.id === 'tone' ? { sampleRate } : { sampleRate, amplitude: 0, harmonic, harmonicAmplitude: .8, frequency }) });
    try {
      const state = await h.complete(), payload = assertEvidence(h, state);
      assert.equal(payload.valid, false, `${sampleRate} H${harmonic} at ${frequency * harmonic} Hz`); assert.equal(payload.separationDb, null);
      assert.ok(payload.detail.steps.slice(1).every(row => row.values.separationDb === null && row.reference.channels.every(channel => channel.levelDbfs < -70)));
      if (sampleRate === 48000 && harmonic === 2 && frequency === 1000.5) {
        const window = payload.detail.steps[1].reference.channels[0].windows[0];
        const rectangularDbfs = dbfs(window.rectangularFundamentalAmplitude / Math.SQRT2), taperedDbfs = dbfs(window.fundamentalAmplitude / Math.SQRT2);
        assert.ok(rectangularDbfs > -70, 'retain the exact false-presence observation from the reported blocker'); assert.ok(taperedDbfs < -70);
        console.log('FS-12 absent fundamental correction', JSON.stringify({ sampleRate, harmonicHz: harmonic * frequency, rectangularDbfs, taperedDbfs, separationDb: payload.separationDb }));
        await h.runner.save(); assert.equal(h.benchmarks.length, 1); assert.equal(h.benchmarks[0].valid, false, 'only an explicitly excluded benchmark can be saved');
      }
    } finally { h.close(); }
  }
});

test('real strong H2/H3/H4/H5 retain 200 percent THD and proper separation with coupled tapering', async t => {
  for (const sampleRate of [22050, 48000]) for (const harmonic of [2, 3, 4, 5]) {
    const h = harness(t, { make: step => capture(step, { sampleRate, frequency: 1000.5, ...(step.id === 'tone' ? { harmonic, harmonicAmplitude: .4 } : {}) }) });
    try {
      const state = await h.complete(), payload = assertEvidence(h, state);
      assert.equal(payload.valid, true, payload.detail.issues.join('; ')); assert.ok(Math.abs(payload.thdPercent - 200) < .05); assert.ok(Math.abs(payload.separationDb - 40) < .02);
      assert.ok(payload.detail.steps[0].reference.channels.every(channel => channel.dominantHarmonic === harmonic));
    } finally { h.close(); }
  }
});

test('near-floor real fundamentals keep the unchanged presence boundary beneath strong higher harmonics', async t => {
  for (const sampleRate of [22050, 48000]) for (const harmonic of [2, 3, 4, 5]) for (const levelDbfs of [-69.75, -70.25]) {
    const amplitude = Math.SQRT2 * 10 ** (levelDbfs / 20);
    const h = harness(t, { make: step => capture(step, step.id === 'tone' ? { sampleRate } : { sampleRate, frequency: 1000.5, amplitude, harmonic, harmonicAmplitude: .8, phase: .37 }) });
    try {
      const state = await h.complete(), payload = assertEvidence(h, state);
      assert.equal(payload.valid, levelDbfs > -70, `${sampleRate} H${harmonic} fundamental ${levelDbfs} dBFS: ${payload.detail.issues.join('; ')}`);
      for (const row of payload.detail.steps.slice(1)) assert.ok(Math.abs(row.reference.channels[0].levelDbfs - levelDbfs) < .01, 'coherent-gain correction preserves the absolute presence level');
      if (levelDbfs > -70) assert.ok(Math.abs(payload.separationDb - 40) < .02); else assert.equal(payload.separationDb, null);
    } finally { h.close(); }
  }
});

test('an absent fundamental in the final shorter or unequal window cannot be discarded during pooling', async t => {
  for (const sampleRate of [22050, 48000]) for (const seconds of [10.0001, 10.1]) {
    const h = harness(t, { make: step => capture(step, { sampleRate, seconds, signal: step.id === 'tone' ? null : (i, n) => {
      const count = Math.ceil(n / Math.floor(sampleRate * .5)), lastStart = Math.floor((count - 1) * n / count);
      return i >= lastStart ? .8 * Math.sin(2 * Math.PI * 2001 * i / sampleRate) : .2 * Math.sin(2 * Math.PI * 1000 * i / sampleRate);
    } }) });
    try {
      const state = await h.complete(), payload = assertEvidence(h, state);
      assert.equal(payload.valid, false); assert.equal(payload.separationDb, null);
      for (const row of payload.detail.steps.slice(1)) {
        const windows = row.reference.channels[0].windows, last = windows.at(-1);
        assert.ok(last.endSample - last.startSample < sampleRate * .5); assert.ok(dbfs(last.fundamentalAmplitude / Math.SQRT2) < -70);
        assert.ok(windows.slice(0, -1).every(window => dbfs(window.fundamentalAmplitude / Math.SQRT2) > -70));
      }
    } finally { h.close(); }
  }
});

test('Hann ENBW increases only guided noise uncertainty components before the single calibration pass', async t => {
  for (const sampleRate of [22050, 48000]) for (const calibrated of [false, true]) {
    const profile = calibrated ? guidedProfile({ sampleRate }) : null;
    const h = harness(t, { profile, make: step => capture(step, { sampleRate, frequency: 1001, seconds: 10.1 }) });
    try {
      const state = await h.complete(), payload = assertEvidence(h, state);
      assert.equal(payload.valid, true, payload.detail.issues.join('; '));
      const tone = h.runs()[0], separation = h.runs()[1], basis = tone.evidence.guidedBenchmarkAnalysis.uncertaintyBasis;
      const physical = basis.physicalWindowSamples, effective = basis.effectiveWindowSamples;
      const beforeThd = thdUncertaintyPercent({ windowSamples: physical, chainThdnPercent: profile?.thdnPercent ?? .1 });
      const afterThd = tone.measurements.find(value => value.metricId === 'left_thd_percent');
      assert.deepEqual(afterThd.uncertainty, thdUncertaintyPercent({ windowSamples: effective, chainThdnPercent: profile?.thdnPercent ?? .1 }));
      assert.equal(afterThd.uncertainty.components.chain, beforeThd.components.chain);
      assert.ok(Math.abs(afterThd.uncertainty.components.noiseFloor / beforeThd.components.noiseFloor - Math.sqrt(physical / effective)) < 1e-12);
      assert.ok(afterThd.uncertainty.expanded > beforeThd.expanded);
      const sepBasis = separation.evidence.guidedBenchmarkAnalysis.uncertaintyBasis, gainDb = profile?.uncertainty.gainDb ?? .5;
      const beforeSep = separationUncertaintyDb({ gainDb, leakSnrDb: 20 }), afterSep = separation.measurements.find(value => value.metricId === 'channel_separation_db');
      assert.deepEqual(afterSep.uncertainty, separationUncertaintyDb({ gainDb, leakSnrDb: sepBasis.adjustedLeakSnrDb }));
      assert.equal(afterSep.uncertainty.components.gain, beforeSep.components.gain);
      assert.ok(Math.abs(afterSep.uncertainty.components.leakNoise / beforeSep.components.leakNoise - Math.sqrt(sepBasis.noiseBandwidthBins)) < 1e-12);
      assert.deepEqual(tone.measurements.find(value => value.metricId === 'left_level_dbfs').uncertainty, levelUncertaintyDb({ gainDb, windowSamples: physical }), 'untapered Level-0 context is unchanged');
      for (const measurement of [afterThd, afterSep]) assert.equal(measurement.qualityFlags.filter(flag => flag === (calibrated ? 'calibrated' : 'uncalibrated')).length, 1);
      console.log('FS-12 Hann uncertainty', JSON.stringify({ sampleRate, calibrated, physicalSamples: physical, effectiveSamples: effective, noiseBandwidthBins: basis.noiseBandwidthBins,
        thdBefore: beforeThd.expanded, thdAfter: afterThd.uncertainty.expanded, separationBefore: beforeSep.expanded, separationAfter: afterSep.uncertainty.expanded }));
    } finally { h.close(); }
  }
});

test('all harmonic-only stages preserve unavailable History evidence and cannot save an all-null benchmark', async t => {
  const h = harness(t, { make: step => capture(step, { amplitude: 0, frequency: 1000.5, harmonic: 2, harmonicAmplitude: .8 }) });
  try {
    const state = await h.complete(), payload = assertEvidence(h, state);
    assert.equal(payload.thdPercent, null); assert.equal(payload.separationDb, null); assert.equal(state.saveBlocked, true); assert.equal(h.history.length, 3);
    await h.runner.save(); assert.equal(h.benchmarks.length, 0);
  } finally { h.close(); }
});
