import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  chirpStimulus, measureRoundTrip, summarizeRuns, reportedVsMeasured, evaluateStressStep, idleGapFloorMs, planStressSweep,
  classifyBufferBehaviour, stressRows, recommendBuffer, windowsChecklist, roundTripRunInput, stressRunInput, createLatencyTuner,
  runStressSweep, framesToMs, clampLevelDbfs, LatencyError,
  SCOPE_LABEL, TYPED_LABEL, STRESS_SIZES, SOFTWARE_BUFFER_HINTS, SOFTWARE_IDS, HINTS_VERSION, MIN_STRENGTH, DEFAULT_LEVEL_DBFS,
  OVERHEAD_FLAG_MS, OVERHEAD_TOLERANCE_MS, XRUN_GAP_FACTOR, IDLE_FLOOR_MARGIN_MS, DPC_WARN_PCT, JITTER_WARN_MS, BACKGROUND_CPU_WARN_PCT,
  CONSECUTIVE_FAILS_STOP, OUTCOME_NOTES,
} from '../app/latency.js';
import { rng, gaussian } from './fixtures/signals.mjs';

const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/latency.json', import.meta.url), 'utf8'));
const FS = 48000;

// ---------- synthetic loopback ----------

/** markerSignal (calibration.js) evaluated at a continuous sample position x (0..n-1), unit amplitude. */
function markerAt(x, fs) {
  const n = Math.max(8, Math.floor(0.01 * fs));
  if (x < 0 || x > n - 1) return 0;
  const f0 = 2000, f1 = Math.min(8000, fs * 0.4), t = x / fs, T = n / fs;
  return (0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (n - 1))) * Math.sin(2 * Math.PI * (f0 * t + ((f1 - f0) * t * t) / (2 * T)));
}

/** Capture of `meta`'s markers delayed by `delaySamples` (fractional) after `align` input frames, with gain and noise. */
function loopCapture(meta, { delaySamples, align = 0, gainDb = -20, snrDb = Infinity, seed = 1, fs = meta.sampleRate, extra = 0, drop = [] }) {
  const ratio = fs / meta.sampleRate, n = Math.ceil(align + meta.totalSamples * ratio + extra + fs * 0.1);
  const left = new Float32Array(n), g = 10 ** (gainDb / 20);
  meta.markerStarts.forEach((s, k) => {
    if (drop.includes(k)) return;
    const at = align + s * ratio + delaySamples;
    for (let i = Math.floor(at); i < at + meta.markerLength * ratio + 2 && i < n; i++) if (i >= 0) left[i] += g * markerAt(i - at, fs);
  });
  if (Number.isFinite(snrDb)) {
    const noise = gaussian(seed), sigma = (g / Math.SQRT2) / 10 ** (snrDb / 20);
    for (let i = 0; i < n; i++) left[i] += sigma * noise();
  }
  return { sampleRate: fs, left, right: Float32Array.from(left) };
}

// ---------- stimulus ----------

test('chirpStimulus: 5 unit-peak markers 1 s apart, level applied at playback and clamped to -60..-12 dBFS', () => {
  const s = chirpStimulus(FS);
  assert.deepEqual(s.meta.markerStarts, [24000, 72000, 120000, 168000, 216000]);
  assert.equal(s.meta.markerLength, 480);
  assert.equal(s.left.length, 216000 + 480 + 24000);
  const peak = s.left.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak > 0.99 && peak <= 1);
  assert.equal(s.meta.levelDbfs, DEFAULT_LEVEL_DBFS);
  assert.deepEqual(Array.from(s.right.subarray(24000, 24010)), Array.from(s.left.subarray(24000, 24010)));
  assert.equal(chirpStimulus(FS, { levelDbfs: -6 }).meta.levelDbfs, -12, 'spec allows -6, audio_out caps at -12');
  assert.equal(chirpStimulus(FS, { levelDbfs: -100 }).meta.levelDbfs, -60);
  assert.equal(clampLevelDbfs(NaN), DEFAULT_LEVEL_DBFS);
  assert.throws(() => chirpStimulus(4000), RangeError);
  assert.throws(() => chirpStimulus(FS, { spacingSec: 0.5 }), RangeError);
});

// ---------- round trip (FS-11 §8: 0.5, 3.17, 12.4 ms within 1 sample) ----------

for (const ms of [0.5, 3.17, 12.4]) {
  test(`measureRoundTrip finds a ${ms} ms loop within 1 sample (with duplex alignment and 30 dB SNR)`, () => {
    const { meta } = chirpStimulus(FS);
    const d = (ms * FS) / 1000;
    const cap = loopCapture(meta, { delaySamples: d, align: 1234, snrDb: 30, seed: 7 });
    const r = measureRoundTrip(cap, meta, { alignment: { frames: 1234, minFrames: 1234, maxFrames: 1234 } });
    assert.equal(r.acceptedRuns, 5);
    assert.ok(Math.abs(r.latencySamples - d) < 1, `got ${r.latencySamples} want ${d}`);
    assert.ok(Math.abs(r.latencyMs - ms) < 1000 / FS);
    assert.equal(r.scope, SCOPE_LABEL);
    assert.ok(r.ok && !r.noLoopback);
    assert.ok(r.peakStrength > 0.9);
  });
}

test('property: random delays and alignments are found within 1 sample (50 seeded cases)', () => {
  const r = rng(11);
  const { meta } = chirpStimulus(FS, { repeats: 2 });
  for (let k = 0; k < 50; k++) {
    const d = 5 + r() * 900, align = Math.floor(r() * 4000);
    const res = measureRoundTrip(loopCapture(meta, { delaySamples: d, align, snrDb: 25, seed: k + 1 }), meta, { alignment: { frames: align, minFrames: align, maxFrames: align } });
    assert.ok(Math.abs(res.latencySamples - d) < 1, `case ${k}: ${res.latencySamples} vs ${d}`);
  }
});

test('measureRoundTrip handles a capture at another rate than the stimulus', () => {
  const { meta } = chirpStimulus(FS, { repeats: 2 });
  const cap = loopCapture(meta, { delaySamples: 200.4, fs: 44100 });
  const r = measureRoundTrip(cap, meta);
  assert.ok(Math.abs(r.latencySamples - 200.4) < 1);
  assert.ok(Math.abs(r.latencyMs - (200.4 / 44100) * 1000) < 1000 / 44100);
});

test('runs below strength 0.3 are rejected; no loopback cable means no round trip (AC-5)', () => {
  const { meta } = chirpStimulus(FS);
  const silent = loopCapture(meta, { delaySamples: 100, gainDb: -200, snrDb: 0, seed: 3 });
  silent.left = silent.left.map(() => 0);
  silent.right = silent.left;
  const none = measureRoundTrip(silent, meta);
  assert.equal(none.acceptedRuns, 0);
  assert.ok(none.noLoopback && !none.ok);
  assert.ok(Number.isNaN(none.latencyMs));
  const two = measureRoundTrip(loopCapture(meta, { delaySamples: 100, drop: [1, 3] }), meta);
  assert.equal(two.acceptedRuns, 3);
  assert.ok(two.ok);
  const weak = measureRoundTrip(loopCapture(meta, { delaySamples: 100, drop: [0, 1, 2] }), meta);
  assert.equal(weak.acceptedRuns, 2);
  assert.equal(weak.ok, false, 'fewer than 3 of 5 runs');
  const strict = measureRoundTrip(loopCapture(meta, { delaySamples: 100, snrDb: 0, seed: 5 }), meta, { minStrength: 0.99 });
  assert.ok(strict.runs.every(r => !r.accepted || r.strength >= 0.99));
  assert.equal(MIN_STRENGTH, 0.3);
});

test('summarizeRuns: mean, std, quantisation and alignment spread combine into U (k=2)', () => {
  const q = 1000 / (FS * Math.sqrt(12));
  const flat = summarizeRuns([10, 10, 10]);
  assert.equal(flat.meanMs, 10);
  assert.equal(flat.stdMs, 0);
  assert.ok(Math.abs(flat.standardMs - q) < 1e-12);
  assert.ok(Math.abs(flat.expandedMs - 2 * q) < 1e-12);
  const s = summarizeRuns([10, 10.1, 9.9, 10, 10], { alignmentSpreadFrames: 48 });
  const std = Math.sqrt((0.01 + 0.01) / 5), align = 1 / Math.sqrt(12);
  assert.ok(Math.abs(s.stdMs - std) < 1e-12);
  assert.ok(Math.abs(s.expandedMs - 2 * Math.sqrt(q * q + std * std + align * align)) < 1e-12);
  assert.equal(summarizeRuns([NaN]).count, 0);
});

// ---------- reported vs measured (AC-2) ----------

test('reported = (Bin + Bout)/fs; overhead flagged above 1 ms + tolerance (+U) or below -U', () => {
  const reported = (256 + 256) / 48;
  const at = reportedVsMeasured({ in: 256, out: 256 }, FS, reported + OVERHEAD_FLAG_MS + OVERHEAD_TOLERANCE_MS);
  assert.ok(Math.abs(at.reportedMs - reported) < 1e-12);
  assert.equal(at.flag, null, 'exactly 2 ms is not flagged');
  assert.equal(reportedVsMeasured({ in: 256, out: 256 }, FS, reported + 2.001).flag, 'high');
  assert.equal(reportedVsMeasured({ in: 256, out: 256 }, FS, reported + 2.05, { expandedMs: 0.1 }).flag, null, 'within U');
  assert.equal(reportedVsMeasured({ in: 256, out: 256 }, FS, reported - 0.01).flag, 'negative');
  assert.equal(reportedVsMeasured({ in: 256, out: 256 }, FS, reported - 0.01, { expandedMs: 0.05 }).flag, null);
  assert.equal(reportedVsMeasured({ in: 480, out: 256 }, FS, 20).reportedMs, 736 / 48, 'in and out stay separate');
  const missing = reportedVsMeasured({ in: null, out: 256 }, FS, 12);
  assert.equal(missing.reportedMs, null);
  assert.equal(missing.flag, null);
  assert.equal(at.overheadLabel, 'driver/USB overhead');
  assert.equal(at.scope, SCOPE_LABEL);
  const typed = reportedVsMeasured({ in: 480, out: 480 }, FS, 25, { typedPanelFrames: 128 });
  assert.deepEqual(typed.typedPanel, { frames: 128, ms: framesToMs(128, FS), label: TYPED_LABEL });
  assert.ok(Math.abs(typed.reportedMs - 20) < 1e-12, 'typed value never replaces the measured path');
});

// ---------- stress verdicts ----------

const dirRep = (requested, actual, mode, extra = {}) => ({
  direction: 'input', opened: mode !== 'unavailable', requestedFrames: requested, mode,
  modeReason: { honoured: 'matched', adjusted: 'differs', hostChosen: requested === null ? 'defaultRequested' : 'fixedRejected', unavailable: 'openFailed' }[mode],
  actualFrames: mode === 'unavailable' ? null : actual, actualPeriodMs: mode === 'unavailable' ? null : actual / 48, sampleRate: FS, ...extra,
});
function result(requested, { inActual = requested, outActual = inActual, inMode, outMode, ended = 'completed', xruns = 0, overruns = 0, maxGapMs, p99GapMs, streamErrors = [] } = {}) {
  const mode = (a) => (requested === null ? 'hostChosen' : a === requested ? 'honoured' : 'adjusted');
  const im = inMode ?? mode(inActual), om = outMode ?? mode(outActual);
  const period = Math.max(inActual ?? 0, outActual ?? 0) / 48;
  const duplex = im !== 'unavailable' && om !== 'unavailable' ? 'full' : im !== 'unavailable' ? 'inputOnly' : om !== 'unavailable' ? 'outputOnly' : 'none';
  return {
    requested, actual: inActual, callbacks: 100, xruns, maxGapMs: maxGapMs ?? period * 1.1, p99GapMs: p99GapMs ?? period, overruns, streamErrors,
    bufferMode: im, duplex, input: dirRep(requested, inActual, im), output: { ...dirRep(requested, outActual, om), direction: 'output' }, ended, hostApi: 'WASAPI',
  };
}

test('evaluateStressStep: max gap must stay below 1.5 x the actual period (boundary)', () => {
  const p = 256 / 48;
  assert.equal(evaluateStressStep(result(256, { maxGapMs: XRUN_GAP_FACTOR * p - 1e-9 }), 0), 'pass');
  assert.equal(evaluateStressStep(result(256, { maxGapMs: XRUN_GAP_FACTOR * p }), 0), 'fail');
  assert.equal(evaluateStressStep(result(256, { maxGapMs: XRUN_GAP_FACTOR * p + 1e-9 }), 50), 'fail');
  // the achieved period is the truth: 128 requested, 480 ran
  assert.equal(evaluateStressStep(result(128, { inActual: 480, maxGapMs: 14.9 }), 0), 'pass');
});

test('evaluateStressStep: any xrun, overrun, stream error or unfinished step fails, at idle too (AC-4)', () => {
  assert.equal(evaluateStressStep(result(256, { xruns: 1 }), 0), 'fail');
  assert.equal(evaluateStressStep(result(256, { overruns: 2 }), 0), 'fail');
  assert.equal(evaluateStressStep(result(256, { streamErrors: ['glitch'] }), 0), 'fail');
  assert.equal(evaluateStressStep(result(256, { ended: 'aborted' }), 0), 'fail');
  assert.equal(evaluateStressStep(result(256, { ended: 'preempted' }), 0), 'fail');
  assert.equal(evaluateStressStep(null, 0), 'fail');
  assert.equal(evaluateStressStep(result(256, { inMode: 'unavailable', outMode: 'unavailable' }), 0), 'fail');
});

test('the idle p99 gap plus margin becomes the floor of the load step (boundary)', () => {
  const idle = result(256, { p99GapMs: 9 });
  assert.equal(idleGapFloorMs(idle), 9 + IDLE_FLOOR_MARGIN_MS);
  assert.equal(idleGapFloorMs({}), null);
  const r = result(256, { maxGapMs: 10.99 });
  assert.equal(evaluateStressStep(r, 50, { floorMs: 11 }), 'pass');
  assert.equal(evaluateStressStep({ ...r, maxGapMs: 11 }, 50, { floorMs: 11 }), 'fail');
  assert.equal(evaluateStressStep({ ...r, maxGapMs: 7.9 }, 50, { floorMs: 1 }), 'pass', 'a floor below 1.5 x period does not tighten');
});

test('planStressSweep skips sizes outside the reported range and keeps all when the range is unknown', () => {
  const info = { input: { minFrames: 128, maxFrames: 1024, known: true }, output: { minFrames: 64, maxFrames: 512, known: true } };
  const plan = planStressSweep(info);
  assert.deepEqual(plan.map(p => [p.requested, p.status]), [[1024, 'skipped'], [512, 'planned'], [256, 'planned'], [128, 'planned'], [64, 'skipped']]);
  assert.equal(plan[0].reason, 'Not supported by driver (skipped)');
  assert.ok(planStressSweep({ input: { known: false }, output: null }).every(p => p.status === 'planned'));
  assert.deepEqual(planStressSweep(null, { sizes: [64, 1024] }).map(p => p.requested), [1024, 64]);
  assert.deepEqual(STRESS_SIZES, [1024, 512, 256, 128, 64]);
});

// ---------- decision tree A-D ----------

test('A: every size honoured', () => {
  const c = classifyBufferBehaviour(STRESS_SIZES.map(n => result(n)));
  assert.equal(c.outcome, 'honoured');
  assert.ok(c.claimsSweep);
  assert.equal(c.note, OUTCOME_NOTES.honoured);
});

test('B: floor clamps small sizes; rows folded, clamped rows host-chosen and ineligible (AC-3)', () => {
  const steps = [1024, 512, 256, 128].map(n => result(n, { inActual: Math.max(n, 480) }));
  const c = classifyBufferBehaviour(steps);
  assert.equal(c.outcome, 'partial');
  assert.equal(c.floorFrames, 480);
  assert.equal(c.granularityFrames, null);
  const rows = stressRows(steps.map(s => ({ requested: s.requested, idle: s, verdicts: { 0: 'pass', 50: 'pass' } })), c);
  assert.deepEqual(rows.map(r => [r.requested, r.effectiveFrames, r.hostChosen, r.eligible]), [
    [1024, 1024, false, true], [512, 512, false, true], [256, 480, true, false], [128, 480, true, false],
  ]);
  assert.equal(rows[3].duplicateOf, 256);
  assert.equal(rows[2].label, 'host-chosen period');
  // one request below the floor is still a clamp
  const one = [1024, 256].map(n => result(n, { inActual: Math.max(n, 480) }));
  const oneRows = stressRows(one.map(s => ({ requested: s.requested, idle: s, verdicts: {} })), classifyBufferBehaviour(one));
  assert.equal(oneRows[1].hostChosen, true);
});

test('B: rounding to a granularity keeps the achieved size as the truth', () => {
  const steps = [1024, 512, 256, 128, 100].map(n => result(n, { inActual: Math.ceil(n / 96) * 96 }));
  const c = classifyBufferBehaviour(steps);
  assert.equal(c.outcome, 'partial');
  assert.equal(c.granularityFrames, 96);
  const rows = stressRows(steps.map(s => ({ requested: s.requested, idle: s, verdicts: { 50: 'pass' } })), c);
  const r1024 = rows.find(r => r.requested === 1024);
  assert.equal(r1024.effectiveFrames, 1056);
  assert.ok(r1024.eligible);
  assert.equal(r1024.label, '1056 frames (requested 1024)');
  assert.equal(rows.find(r => r.requested === 100).duplicateOf, 128, '100 and 128 both ran 192');
});

test('C: the same host period for every request, or Fixed refused, or Default requested', () => {
  const same = classifyBufferBehaviour([1024, 512, 256].map(n => result(n, { inActual: 480 })));
  assert.deepEqual([same.outcome, same.input.reason, same.hostPeriodFrames, same.claimsSweep], ['ignored', 'samePeriod', 480, false]);
  const rejected = classifyBufferBehaviour([result(256, { inActual: 480, inMode: 'hostChosen', outMode: 'hostChosen' })]);
  assert.deepEqual([rejected.outcome, rejected.input.reason], ['ignored', 'fixedRejected']);
  const def = classifyBufferBehaviour([result(null, { inActual: 480 })]);
  assert.deepEqual([def.outcome, def.input.reason], ['ignored', 'defaultRequested']);
  assert.equal(same.note, OUTCOME_NOTES.ignored);
});

test('one adjusted size cannot tell B from C yet', () => {
  const c = classifyBufferBehaviour([result(1024, { inActual: 480 })]);
  assert.equal(c.outcome, 'unknown');
  assert.equal(c.claimsSweep, false);
});

test('D: duplex unavailable when either direction never opens; in/out sizes stay separate', () => {
  const none = classifyBufferBehaviour([result(256, { inMode: 'unavailable', outMode: 'unavailable' })]);
  assert.equal(none.outcome, 'unavailable');
  const half = classifyBufferBehaviour([result(256, { inMode: 'unavailable' })]);
  assert.deepEqual([half.outcome, half.input.outcome, half.output.outcome], ['unavailable', 'unavailable', 'honoured']);
  assert.equal(half.note, OUTCOME_NOTES.unavailable);
  const differ = classifyBufferBehaviour([result(256, { inActual: 256, outActual: 480 })]);
  assert.ok(differ.inOutDiffer);
  assert.equal(classifyBufferBehaviour([]).outcome, 'unknown');
});

// ---------- recommendation (AC-4) ----------

const row = (frames, verdicts, extra = {}) => ({ requested: frames, effectiveFrames: frames, eligible: true, hostChosen: false, duplicateOf: null, verdicts, ...extra });

test('recommendBuffer: smallest passing size plus one step, per software copy', () => {
  const rows = [row(1024, { 50: 'pass' }), row(512, { 50: 'pass' }), row(256, { 50: 'pass' }), row(128, { 50: 'pass', 80: 'pass' }), row(64, { 50: 'pass' })];
  const r = recommendBuffer(rows, FS, 'serato');
  assert.deepEqual([r.frames, r.smallestPassingFrames, r.headroomFrames, r.basis, r.claimsSmallestSafe], [128, 64, 64, 'measured', true]);
  assert.ok(r.verySafe, '80 % load passed at the recommended size');
  assert.ok(r.settingText.startsWith('Lowest safe setting: 128 samples (about 2.7 ms at 48 kHz). Set Serato DJ Pro USB Buffer Size to the ASIO panel value of 128'));
  assert.match(r.settingText, /verify in your software for 10 minutes/);
  assert.equal(r.label, `${SCOPE_LABEL} stress test`);
  assert.equal(r.hintsVersion, HINTS_VERSION);
});

test('recommendBuffer: only 256 and above pass -> 512; flaky smaller pass ignored; none pass -> increase buffer', () => {
  const rows = [row(1024, { 50: 'pass' }), row(512, { 50: 'pass' }), row(256, { 50: 'pass' }), row(128, { 50: 'fail' }), row(64, { 50: 'pass' })];
  assert.equal(recommendBuffer(rows, FS, 'traktor').frames, 512);
  const only = [row(256, { 50: 'pass' }), row(512, { 50: 'pass' }, { eligible: false, hostChosen: true })];
  const o = recommendBuffer(only, FS, 'rekordbox');
  assert.deepEqual([o.frames, o.headroomFrames, o.verySafe], [256, 0, false]);
  const none = recommendBuffer([row(1024, { 50: 'fail' }), row(512, { 50: 'pass' })], FS, 'serato');
  assert.equal(none.frames, null);
  assert.match(none.settingText, /Increase the buffer/);
  assert.equal(recommendBuffer([row(256, { 0: 'pass', 50: 'fail' })], FS, 'serato', { loadPct: 0 }).frames, 256, 'judged at the chosen load');
  assert.throws(() => recommendBuffer(rows, FS, 'asio'), RangeError);
});

test('recommendBuffer under C/D never claims a smallest safe buffer and uses the typed ASIO value', () => {
  const rows = [row(480, { 50: 'pass' }, { eligible: false, hostChosen: true })];
  for (const outcome of ['ignored', 'unavailable', 'unknown']) {
    const need = recommendBuffer(rows, FS, 'serato', { outcome });
    assert.deepEqual([need.frames, need.claimsSmallestSafe, need.needsTypedBuffer, need.basis], [null, false, true, 'none']);
    const typed = recommendBuffer(rows, FS, 'serato', { outcome, typedPanelFrames: 128 });
    assert.deepEqual([typed.frames, typed.label, typed.basis, typed.claimsSmallestSafe], [128, TYPED_LABEL, 'typed', false]);
    assert.match(typed.settingText, /could not test buffer sizes/);
    assert.doesNotMatch(typed.settingText, /Lowest safe/);
  }
});

test('scope honesty: no output presents an ASIO value as measured', () => {
  const texts = [];
  const rows = [row(256, { 50: 'pass' }), row(128, { 50: 'pass' })];
  for (const sw of SOFTWARE_IDS) for (const outcome of ['honoured', 'partial', 'ignored', 'unavailable']) {
    const r = recommendBuffer(rows, FS, sw, { outcome, typedPanelFrames: 64 });
    texts.push(r.settingText, r.label ?? '');
  }
  const cmp = reportedVsMeasured({ in: 256, out: 256 }, FS, 13, { typedPanelFrames: 64 });
  texts.push(cmp.scope, cmp.note ?? '', cmp.typedPanel.label);
  for (const t of texts) assert.doesNotMatch(t, /ASIO (latency|round trip)|measured ASIO|ASIO measurement/i, t);
  assert.match(TYPED_LABEL, /typed, not measured/);
  assert.equal(SCOPE_LABEL, 'WASAPI round trip');
});

test('software hints are versioned and name each program\'s setting', () => {
  assert.deepEqual(SOFTWARE_IDS, ['serato', 'traktor', 'rekordbox']);
  for (const id of SOFTWARE_IDS) {
    const h = SOFTWARE_BUFFER_HINTS[id];
    assert.ok(h.name && h.setting && h.path && h.source.startsWith('https://'));
    assert.ok(['snippet', 'unverified', 'verified'].includes(h.confidence));
  }
  assert.ok(Object.isFrozen(SOFTWARE_BUFFER_HINTS) && Object.isFrozen(SOFTWARE_BUFFER_HINTS.serato));
});

// ---------- Windows checklist (AC-6) ----------

const scan = CONTRACT.commands.windows_tuning_scan.response;

test('windowsChecklist: pass / review / unknown with the inspect command and manual path', () => {
  const items = windowsChecklist(scan);
  const by = Object.fromEntries(items.map(i => [i.id, i]));
  assert.deepEqual(Object.keys(by), ['powerPlan', 'usbSelectiveSuspend', 'minProcessorState', 'coreParking', 'wifi', 'bluetooth', 'power', 'dpc', 'timerJitter', 'backgroundApps']);
  assert.equal(by.powerPlan.status, 'review', 'Balanced');
  assert.equal(by.usbSelectiveSuspend.status, 'review');
  assert.equal(by.minProcessorState.status, 'review');
  assert.equal(by.coreParking.status, 'unknown');
  assert.equal(by.wifi.status, 'review');
  assert.equal(by.bluetooth.status, 'pass');
  assert.equal(by.power.status, 'pass');
  assert.equal(by.dpc.status, 'pass');
  assert.equal(by.timerJitter.status, 'pass');
  assert.equal(by.backgroundApps.status, 'review');
  for (const i of items) {
    assert.ok(['pass', 'review', 'unknown'].includes(i.status));
    assert.ok(i.inspect && i.change && i.label && i.detail, i.id);
  }
  assert.match(by.usbSelectiveSuspend.inspect, /^powercfg \/query SCHEME_CURRENT 2a737441/);
  assert.deepEqual(windowsChecklist({ supported: false }), [], 'non-Windows: hidden');
  const good = windowsChecklist({ ...scan, activePlan: { name: 'Höchstleistung', guid: '8c5e7fda-e8bf-4a96-9a85-cd73a8a2b7a0' }, usbSelectiveSuspend: { ac: 0, dc: 0 }, minProcessorState: { ac: 100, dc: 5 }, minCores: { ac: 100, dc: 10 }, wifi: [], onBattery: true, backgroundApps: [] });
  const g = Object.fromEntries(good.map(i => [i.id, i.status]));
  assert.deepEqual([g.powerPlan, g.usbSelectiveSuspend, g.minProcessorState, g.coreParking, g.wifi, g.power, g.backgroundApps], ['pass', 'pass', 'pass', 'pass', 'pass', 'review', 'pass']);
  const blank = Object.fromEntries(windowsChecklist({ supported: true }).map(i => [i.id, i.status]));
  assert.deepEqual([blank.powerPlan, blank.usbSelectiveSuspend, blank.dpc, blank.timerJitter, blank.power, blank.backgroundApps], ['unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown']);
});

test('windowsChecklist thresholds: DPC 5 %, jitter 2 ms, background 10 % (boundaries)', () => {
  const st = (patch, id) => windowsChecklist({ ...scan, ...patch }).find(i => i.id === id).status;
  assert.equal(st({ dpcProxy: { dpcPct: DPC_WARN_PCT, interruptPct: 1, samples: 10 } }, 'dpc'), 'pass');
  assert.equal(st({ dpcProxy: { dpcPct: DPC_WARN_PCT + 0.01, interruptPct: 1, samples: 10 } }, 'dpc'), 'review');
  assert.equal(st({ timerJitter: { p99Ms: JITTER_WARN_MS } }, 'timerJitter'), 'pass');
  assert.equal(st({ timerJitter: { p99Ms: JITTER_WARN_MS + 0.01 } }, 'timerJitter'), 'review');
  assert.equal(st({ backgroundApps: [{ exe: 'a.exe', cpuPct: BACKGROUND_CPU_WARN_PCT }] }, 'backgroundApps'), 'pass');
  assert.equal(st({ backgroundApps: [{ exe: 'a.exe', cpuPct: BACKGROUND_CPU_WARN_PCT + 0.1 }] }, 'backgroundApps'), 'review');
});

// ---------- persistence ----------

test('run inputs carry exactly the latency_run_save fields', () => {
  const keys = Object.keys(CONTRACT.commands.latency_run_save.request.input).sort();
  const { meta } = chirpStimulus(FS);
  const analysis = measureRoundTrip(loopCapture(meta, { delaySamples: 600 }), meta);
  const comparison = reportedVsMeasured({ in: 256, out: 256 }, FS, analysis.latencyMs, { expandedMs: analysis.uncertaintyMs });
  const rt = roundTripRunInput({ deviceName: 'Audio 8 DJ', hostApi: 'WASAPI', sampleRate: FS, bufferFrames: 256, analysis, comparison, classification: { outcome: 'honoured' } });
  assert.deepEqual(Object.keys(rt).sort(), keys);
  assert.equal(rt.kind, 'roundtrip');
  assert.equal(rt.detail.scope, SCOPE_LABEL);
  assert.ok(Math.abs(rt.measuredMs - 12.5) < 0.03);
  const st = stressRunInput({ deviceName: 'Audio 8 DJ', sampleRate: FS, result: result(128, { inActual: 480 }), loadPct: 50, verdict: 'pass', classification: { outcome: 'partial' } });
  assert.deepEqual(Object.keys(st).sort(), keys);
  assert.deepEqual([st.kind, st.bufferFrames, st.cpuLoadPct, st.detail.actual, st.detail.input.mode], ['stress', 128, 50, 480, 'adjusted']);
  const none = roundTripRunInput({ deviceName: 'x', sampleRate: FS, analysis: measureRoundTrip({ sampleRate: FS, left: new Float32Array(FS * 6), right: new Float32Array(FS * 6) }, meta) });
  assert.equal(none.measuredMs, null);
  assert.equal(none.verdict, 'No loopback signal detected');
});

// ---------- bridge ----------

function fakeInvoke(handlers) {
  const calls = [];
  const fn = async (cmd, args) => {
    calls.push({ cmd, args });
    const h = handlers[cmd];
    if (!h) throw new Error(`unexpected ${cmd}`);
    return h(args);
  };
  fn.calls = calls;
  return fn;
}

test('bridge passes exactly the contract argument names', async () => {
  const inv = fakeInvoke(Object.fromEntries(Object.keys(CONTRACT.commands).map(c => [c, () => CONTRACT.commands[c].response ?? null])));
  const t = createLatencyTuner({ invoke: inv });
  assert.equal(t.supported, true);
  await t.bufferInfo({ deviceName: 'Audio 8 DJ' });
  await t.stress({ deviceName: 'Audio 8 DJ', bufferFrames: 128, seconds: 30, cpuLoadPct: 50, gapFloorMs: 14.5, step: 3 });
  await t.abort();
  await t.scan({ dpcSeconds: 10 });
  await t.saveRun(CONTRACT.commands.latency_run_save.request.input);
  await t.listRuns(CONTRACT.commands.latency_run_list.request.filter);
  await t.deleteRun('x');
  await t.saveRecommendation(CONTRACT.commands.buffer_recommendation_save.request.input);
  await t.latestRecommendations('Audio 8 DJ');
  const want = c => Object.keys(CONTRACT.commands[c].request).sort();
  for (const { cmd, args } of inv.calls) assert.deepEqual(Object.keys(args).sort(), want(cmd), cmd);
  assert.deepEqual(inv.calls.find(c => c.cmd === 'stress_run').args, CONTRACT.commands.stress_run.request);
});

test('bridge: browser mode is unsupported; errors keep their codes', async () => {
  const off = createLatencyTuner({ invoke: null });
  assert.equal(off.supported, false);
  await assert.rejects(off.stress({ bufferFrames: 256 }), e => e instanceof LatencyError && e.code === 'unsupported');
  await off.abort();
  const busy = createLatencyTuner({ invoke: async () => { throw { code: 'CAPTURE_BUSY', message: 'The audio input is busy: "live-monitor" is already running.', holder: 'live-monitor' }; } });
  await assert.rejects(busy.stress({}), e => e.code === 'CAPTURE_BUSY' && e.detail.holder === 'live-monitor');
  const coded = createLatencyTuner({ invoke: async () => { throw 'LATENCY_BUSY: a latency or stress run is already in progress'; } });
  await assert.rejects(coded.stress({}), e => e.code === 'LATENCY_BUSY' && /already in progress/.test(e.message));
  const plain = createLatencyTuner({ invoke: async () => { throw new Error('boom'); } });
  await assert.rejects(plain.scan(), e => e.code === 'LATENCY_ERROR');
});

test('measure(): plays the capped stimulus and turns the duplex capture into a WASAPI round trip', async () => {
  const D = 37 + 256 + 256, ALIGN = 2048;
  const inv = fakeInvoke({
    latency_play_and_capture: ({ stimulus, levelDbfs, bufferFrames }) => {
      assert.equal(levelDbfs, -20);
      assert.equal(bufferFrames, 256);
      const left = new Float32Array(ALIGN + stimulus.left.length + 4000);
      const g = 10 ** (levelDbfs / 20);
      stimulus.left.forEach((v, i) => { left[ALIGN + i + D] = g * v; });
      return { captured: { sampleRate: FS, left, right: left }, reportedBufferFrames: { in: 256, out: 256 }, alignment: { frames: ALIGN, minFrames: ALIGN, maxFrames: ALIGN, pairs: 100 }, ended: 'completed', duplex: 'full' };
    },
  });
  const { analysis, comparison } = await createLatencyTuner({ invoke: inv }).measure({ bufferFrames: 256, typedPanelFrames: 128 });
  assert.ok(Math.abs(analysis.latencySamples - D) < 1);
  assert.equal(analysis.acceptedRuns, 5);
  assert.ok(Math.abs(comparison.reportedMs - 512 / 48) < 1e-9);
  assert.ok(Math.abs(comparison.overheadMs - 37 / 48) < 0.03);
  assert.equal(comparison.flag, null);
  assert.equal(comparison.typedPanel.label, TYPED_LABEL);
  const noDuplex = fakeInvoke({ latency_play_and_capture: () => ({ captured: null, ended: 'noStreams', duplex: 'inputOnly' }) });
  const r = await createLatencyTuner({ invoke: noDuplex }).measure({});
  assert.deepEqual([r.analysis, r.result.duplex], [null, 'inputOnly']);
});

// ---------- adaptive sweep, one fake host per spike outcome ----------

function fakeTuner(policy, { failBelow = 0, abortAt = null } = {}) {
  const calls = [];
  return {
    calls,
    async stress(args) {
      calls.push(args);
      const n = args.bufferFrames;
      const p = policy(n);
      if (abortAt !== null && calls.length >= abortAt) return result(n, { ...p, ended: 'aborted' });
      const failing = n !== null && n < failBelow;
      return result(n, { ...p, xruns: failing ? 3 : 0 });
    },
  };
}

test('sweep A: idle then load per size, idle floor passed on, two consecutive fails stop the descent', async () => {
  const t = fakeTuner(() => ({}), { failBelow: 256 });
  const seen = [];
  const s = await runStressSweep({ tuner: t, seconds: 30, loadPct: 50, onStep: st => seen.push(st.requested) });
  assert.deepEqual(seen, [1024, 512, 256, 128, 64]);
  assert.equal(s.stopReason, 'consecutiveFails');
  assert.deepEqual(t.calls.slice(0, 2).map(c => [c.bufferFrames, c.cpuLoadPct, c.seconds]), [[1024, 0, 30], [1024, 50, 30]]);
  assert.equal(t.calls[1].gapFloorMs, 1024 / 48 + IDLE_FLOOR_MARGIN_MS);
  assert.equal(s.classification.outcome, 'honoured');
  const rec = recommendBuffer(s.rows, FS, 'serato', { outcome: s.classification.outcome });
  assert.deepEqual([rec.frames, rec.smallestPassingFrames], [512, 256]);
  assert.equal(CONSECUTIVE_FAILS_STOP, 2);
});

test('sweep B: clamped sizes stay in the table as host-chosen and out of the recommendation', async () => {
  const t = fakeTuner(n => ({ inActual: Math.max(n, 480) }));
  const s = await runStressSweep({ tuner: t, loadPct: 50 });
  assert.equal(s.classification.outcome, 'partial');
  assert.equal(s.classification.floorFrames, 480);
  assert.deepEqual(s.rows.map(r => r.eligible), [true, true, false, false, false]);
  assert.equal(recommendBuffer(s.rows, FS, 'serato', { outcome: 'partial' }).frames, 1024, '512 smallest passing, one step up');
});

test('sweep C: an ignored request ends the sweep and runs one host-chosen row', async () => {
  const t = fakeTuner(() => ({ inActual: 480 }));
  const s = await runStressSweep({ tuner: t, loadPct: 50 });
  assert.equal(s.stopReason, 'hostChosenPeriod');
  assert.equal(s.classification.outcome, 'ignored');
  assert.equal(s.classification.hostPeriodFrames, 480);
  assert.deepEqual(s.steps.map(x => x.requested), [null]);
  assert.deepEqual(t.calls.map(c => c.bufferFrames), [1024, 1024, 512, 512, null, null]);
  assert.deepEqual(s.rows.map(r => [r.label, r.eligible]), [['host-chosen period', false]]);
  assert.equal(recommendBuffer(s.rows, FS, 'traktor', { outcome: s.classification.outcome }).needsTypedBuffer, true);
});

test('sweep C: Fixed refused on the first size is detected at once', async () => {
  const t = fakeTuner(n => ({ inActual: 480, inMode: n === null ? undefined : 'hostChosen', outMode: n === null ? undefined : 'hostChosen' }));
  const s = await runStressSweep({ tuner: t, loadPct: 0 });
  assert.deepEqual(t.calls.map(c => c.bufferFrames), [1024, null]);
  assert.equal(s.classification.outcome, 'ignored');
  assert.equal(s.classification.input.reason, 'fixedRejected');
});

test('sweep D: duplex unavailable stops after the first step', async () => {
  const t = fakeTuner(() => ({ outMode: 'unavailable' }));
  const s = await runStressSweep({ tuner: t, loadPct: 50 });
  assert.equal(s.stopReason, 'duplexUnavailable');
  assert.equal(s.classification.outcome, 'unavailable');
  assert.equal(s.classification.note, OUTCOME_NOTES.unavailable);
  assert.equal(recommendBuffer(s.rows, FS, 'serato', { outcome: 'unavailable', typedPanelFrames: 256 }).label, TYPED_LABEL);
});

test('sweep: Esc (an aborted step or the abort flag) stops at once', async () => {
  const t = fakeTuner(() => ({}), { abortAt: 3 });
  const s = await runStressSweep({ tuner: t, loadPct: 50 });
  assert.equal(s.aborted, true);
  assert.equal(t.calls.length, 3, 'an aborted idle half skips its load half and ends the sweep');
  let n = 0;
  const flag = await runStressSweep({ tuner: fakeTuner(() => ({})), isAborted: () => ++n > 1 });
  assert.equal(flag.aborted, true);
  assert.equal(flag.steps.length, 1);
});
