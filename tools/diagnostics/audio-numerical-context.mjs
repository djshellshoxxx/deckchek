// Bounded numerical diagnosis only. Unchanged production analyzer, six calls.
// Copied fixture declarations register no tests. Independent arithmetic follows pipeline outputs.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStimulus, analyzeAudioQuality, evaluateAudioQuality, aWeightDb, aWeightedRms, profileSpecNotes, DEFAULT_THRESHOLDS, exportStimulus, safePlayLevel, DEFAULT_PLAY_LEVEL_DBFS, MIN_PLAY_LEVEL_DBFS } from '../../app/audio-quality.js';

const SR = 48000;
const rng = (seed = 1) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = r => () => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
const mv = (r, id) => r.measurements.find(x => x.metricId === id)?.value;
const st = buildStimulus({ sampleRate: SR });

/** Simulated device + recorder: stimulus -> play level -> device -> delay -> capture buffer. */
function simulate({ gainDb = 0, delay = 137, cubic = 0, noiseRms = 0, lowpassHz = 0, xtalkDb = -Infinity, invertR = false, dropout = null, ppm = 0, extraSec = 1, seed = 3 } = {}) {
  const play = 10 ** (st.meta.playLevelDbfs / 20), g = 10 ** (gainDb / 20), n = st.left.length + delay + Math.round(extraSec * SR);
  const stage = src => {
    const y = new Float64Array(n);
    let lp = 0; const a = lowpassHz ? 1 - Math.exp(-2 * Math.PI * lowpassHz / SR) : 1;
    for (let i = 0; i < src.length; i++) { let x = src[i] * play; x = x + cubic * x ** 3; lp += a * (x - lp); y[i + delay] = g * lp; }
    return y;
  };
  let L = stage(st.left), R = stage(st.right);
  const x = 10 ** (xtalkDb / 20);
  if (x > 0) { const l2 = L.map((v, i) => v + x * R[i]), r2 = R.map((v, i) => v + x * L[i]); L = l2; R = r2; }
  if (invertR) R = R.map(v => -v);
  if (dropout) for (const c of [L, R]) c.fill(0, dropout[0], dropout[1]);
  if (ppm) { const warp = c => { const o = new Float64Array(c.length), k = 1 + ppm * 1e-6; for (let i = 2; i < c.length - 3; i++) { const p = i * k, j = Math.floor(p), f = p - j; if (j < 1 || j + 2 >= c.length) continue; const [y0, y1, y2, y3] = [c[j - 1], c[j], c[j + 1], c[j + 2]]; o[i] = y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0))); } return o; }; L = warp(L); R = warp(R); }
  if (noiseRms) { const gn = gauss(rng(seed)); for (const c of [L, R]) for (let i = 0; i < c.length; i++) c[i] += noiseRms * gn(); }
  return { left: Float32Array.from(L), right: Float32Array.from(R), sampleRate: SR };
}

function recording(buffer, levelDbfs, { silent = false } = {}) {
  const amp = silent ? 0 : 10 ** (levelDbfs / 20);
  const mk = s => { const o = new Float32Array(s.length + 211 + 2 * SR); for (let i = 0; i < s.length; i++) o[i + 211] = s[i] * amp; return o; };
  return { left: mk(buffer.left), right: mk(buffer.right), sampleRate: SR };
}

const captureInputs = {
  clean: simulate({ gainDb: 3 }),
  cubic: simulate({ cubic: 20 }),
  runner: recording(st, DEFAULT_PLAY_LEVEL_DBFS),
};
const sequence = ['clean', 'cubic', 'runner', 'clean', 'cubic', 'runner'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytesOf = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const serializable = value => JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'number' && !Number.isFinite(v)
  ? { nonFiniteNumber: String(v) } : v));
const inputIdentity = capture => ({
  left: { length: capture.left.length, sha256: sha(bytesOf(capture.left)) },
  right: { length: capture.right.length, sha256: sha(bytesOf(capture.right)) },
  sampleRate: capture.sampleRate,
  channelsByteEqual: bytesOf(capture.left).equals(bytesOf(capture.right)),
});
const inputBefore = Object.fromEntries(Object.entries(captureInputs).map(([k, v]) => [k, inputIdentity(v)]));
// Record unchanged pipeline outputs before any independent fit/check or console output.
const pipelineOutputs = sequence.map((fixture, index) => {
  const analysis = analyzeAudioQuality(captureInputs[fixture], st.meta);
  const verdict = evaluateAudioQuality(analysis.measurements);
  const snapshot = serializable({ analysis, verdict });
  return { index, fixture, snapshot, snapshotSha256: sha(JSON.stringify(snapshot)) };
});
const inputAfter = Object.fromEntries(Object.entries(captureInputs).map(([k, v]) => [k, inputIdentity(v)]));

// Independent accumulation, not production fitTone/solve3/refineToneFrequency.
// Cofactor arithmetic is for these well-conditioned synthetic fixtures only.
function consistency(samples, sr, frequencyHz, fit) {
  const n = samples.length, omega = 2 * Math.PI * frequencyHz / sr;
  let ss = 0, sc = 0, s1 = 0, cc = 0, c1 = 0, xs = 0, xc = 0, x1 = 0;
  for (let i = 0; i < n; i++) {
    const sine = Math.sin(omega * i), cosine = Math.cos(omega * i), value = samples[i];
    ss += sine * sine; sc += sine * cosine; s1 += sine;
    cc += cosine * cosine; c1 += cosine;
    xs += value * sine; xc += value * cosine; x1 += value;
  }
  const gram = [[ss, sc, s1], [sc, cc, c1], [s1, c1, n]], rhs = [xs, xc, x1];
  const beta = [fit.amplitude * Math.cos(fit.phase), fit.amplitude * Math.sin(fit.phase), fit.dc];
  const normalResidual = gram.map((row, i) => row.reduce((sum, value, j) => sum + value * beta[j], 0) - rhs[i]);
  const A = cc * n - c1 * c1, B = s1 * c1 - sc * n, C = sc * c1 - s1 * cc;
  const D = ss * n - s1 * s1, E = sc * s1 - ss * c1, F = ss * cc - sc * sc;
  const determinant = ss * A + sc * B + s1 * C;
  const independentBeta = [(A * xs + B * xc + C * x1) / determinant,
    (B * xs + D * xc + E * x1) / determinant, (C * xs + E * xc + F * x1) / determinant];
  let returnedResidualSq = 0, independentResidualSq = 0;
  const residualCorrelations = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const sine = Math.sin(omega * i), cosine = Math.cos(omega * i);
    const residual = samples[i] - beta[0] * sine - beta[1] * cosine - beta[2];
    const other = samples[i] - independentBeta[0] * sine - independentBeta[1] * cosine - independentBeta[2];
    returnedResidualSq += residual * residual; independentResidualSq += other * other;
    residualCorrelations[0] += residual * sine;
    residualCorrelations[1] += residual * cosine;
    residualCorrelations[2] += residual;
  }
  return { sampleCount: n, sampleSha256: sha(bytesOf(samples)), frequencyHz, gram, rhs,
    returnedCoefficients: beta, normalResidual, residualCorrelations,
    independentlyComputedReturnedResidualRms: Math.sqrt(returnedResidualSq / n),
    determinant, independentCoefficients: independentBeta,
    independentAmplitude: Math.hypot(independentBeta[0], independentBeta[1]),
    independentPhase: Math.atan2(independentBeta[1], independentBeta[0]),
    independentResidualRms: Math.sqrt(independentResidualSq / n) };
}

const expected = {
  clean: { lagSamples: 137, clockPpm: 0, fundamentalAmplitude: 0.1 * 10 ** (3 / 20), thdPercent: 0, balanceDb: 0, polarityInverted: 0, verdict: 'pass' },
  cubic: { lagSamples: 137, clockPpm: 0, fundamentalAmplitude: 0.115, thirdHarmonicAmplitude: 0.005, thdPercent: 0.005 / 0.115 * 100, balanceDb: 0, polarityInverted: 0, verdict: 'fail (known cubic distortion)' },
  runner: { lagSamples: 211, clockPpm: 0, fundamentalAmplitude: 0.1, thdPercent: 0, balanceDb: 0, polarityInverted: 0, verdict: 'pass' },
};
const tone = st.meta.segments.find(s => s.name === 'tone');
const comparisons = pipelineOutputs.map(({ index, fixture, snapshot }) => {
  const analysis = snapshot.analysis, capture = captureInputs[fixture];
  if (!Number.isFinite(analysis.lagSamples) || !Number.isFinite(analysis.clockPpm)) return { index, fixture, unavailable: 'No finite returned lag/clock' };
  const shift = Math.round(analysis.lagSamples + st.meta.markerStart) - st.meta.markerStart;
  const first = tone.start + shift + Math.round(0.05 * SR), end = tone.end + shift - Math.round(0.05 * SR);
  const frequencyHz = 1000 * (1 + analysis.clockPpm * 1e-6);
  const leftSlice = capture.left.subarray(first, end), rightSlice = capture.right.subarray(first, end);
  return { index, fixture, expected: expected[fixture], shift,
    slice: { first, end, channelsByteEqual: bytesOf(leftSlice).equals(bytesOf(rightSlice)) },
    left: consistency(leftSlice, SR, frequencyHz, analysis.channels.L.fit),
    right: consistency(rightSlice, SR, frequencyHz, analysis.channels.R.fit) };
});
const sourceNames = ['app/audio-quality.js', 'app/calibration.js', 'tests/audio-quality.test.mjs', 'tests/audio-runner-lifecycle.test.mjs'];
const sourceHashes = Object.fromEntries(sourceNames.map(name => [name, sha(readFileSync(new URL(`../../${name}`, import.meta.url)))]));
const result = serializable({ schema: 'deckchek.audio.numerical-diagnostic.v1',
  runtime: { execPath: process.execPath, version: process.version, versions: process.versions, execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS ?? null },
  toolPath: fileURLToPath(import.meta.url), sourceHashes,
  fixtureScope: 'Exact source fixture declarations; runner case models its recording numerically, not its DOM/capture lifecycle.',
  analyzerCalls: sequence.length, sequence, inputBefore, inputAfter,
  inputUnchanged: JSON.stringify(inputBefore) === JSON.stringify(inputAfter),
  pipelineOutputs, comparisons,
  limitation: 'Diagnostic observations only. Six calls and independent fixture arithmetic do not qualify physical DSP or establish a runtime/compiler cause.' });
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
