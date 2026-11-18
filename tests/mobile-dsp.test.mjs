import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSine } from '../app/advanced.js';
import { measureSpeed, speedStatus, liveEstimate, centralSlice, MIN_SNR_DB } from '../mobile/lib/speed.js';
import { dotsPerRevolution, dotsTable, flickerHz, strobePlan, refreshFromTimestamps, describePlan } from '../mobile/lib/strobe.js';
import { vibrationMetrics, vibrationMeasurements, vibrationBand, estimateRate, detrend, MIN_RATE_HZ } from '../mobile/lib/vibration.js';
import { weightingResponseDb, levelDbfs, calibrationOffset, splMeasurements } from '../mobile/lib/spl.js';

const SR = 48000;
const by = (ms, id) => ms.find(m => m.metricId === id);
const sine = (hz, sec = 4, amplitude = 0.3, rate = SR) => generateSine({ frequencyHz: hz, sampleRate: rate, durationSec: sec, amplitude });
function withNoise(x, level, seed = 7) { // deterministic white noise
  let s = seed; const out = Float32Array.from(x);
  for (let i = 0; i < out.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; out[i] += level * ((s / 2 ** 32) - 0.5) * 2; }
  return out;
}

// ---------------------------------------------------------------- speed
test('speed: a clean 1000 Hz tone is 0 % pitch and 33 1/3 rpm', () => {
  const ms = measureSpeed(sine(1000), SR, { referenceHz: 1000, nominalRpm: 100 / 3 });
  assert.ok(Math.abs(by(ms, 'speed.pitchPercent').value) < 0.02, String(by(ms, 'speed.pitchPercent').value));
  assert.ok(Math.abs(by(ms, 'speed.rpm').value - 33.3333) < 0.01);
  assert.equal(speedStatus(ms), 'ok');
  for (const id of ['speed.measuredHz', 'speed.pitchPercent', 'speed.rpm']) assert.ok(by(ms, id).uncertainty > 0, id);
  assert.ok(by(ms, 'speed.rpm').uncertainty < 0.1);
});

test('speed: 1010 Hz reads +1 % pitch and about 33.67 rpm', () => {
  const ms = measureSpeed(sine(1010), SR);
  assert.ok(Math.abs(by(ms, 'speed.measuredHz').value - 1010) < 0.2);
  assert.ok(Math.abs(by(ms, 'speed.pitchPercent').value - 1.0) < 0.03);
  assert.ok(Math.abs(by(ms, 'speed.rpm').value - (100 / 3) * 1.01) < 0.02);
  assert.ok(Math.abs(by(ms, 'speed.wowFlutterRmsPercent').value) < 0.05);
});

test('speed: 45 rpm and a 3.15 kHz reference scale correctly', () => {
  const ms = measureSpeed(sine(3150 * 0.995), SR, { referenceHz: 3150, nominalRpm: 45 });
  assert.ok(Math.abs(by(ms, 'speed.pitchPercent').value + 0.5) < 0.03);
  assert.ok(Math.abs(by(ms, 'speed.rpm').value - 45 * 0.995) < 0.03);
});

test('speed: weak tone is flagged, silence is "none", short audio throws', () => {
  const weak = withNoise(sine(1000, 4, 0.1), 0.04); // about 10 dB tone-to-noise
  const ms = measureSpeed(weak, SR);
  assert.equal(speedStatus(ms), 'weak');
  assert.ok(by(ms, 'speed.snrDb').value < MIN_SNR_DB);
  assert.ok(by(ms, 'speed.rpm').qualityFlags.includes('weak-tone'));
  assert.ok(by(ms, 'speed.rpm').confidence <= 0.5);
  const noise = withNoise(new Float32Array(SR * 4), 0.1, 3);
  assert.notEqual(speedStatus(measureSpeed(noise, SR)), 'ok');
  assert.throws(() => measureSpeed(sine(1000, 1), SR), /at least 2 seconds/);
});

test('speed: clock term widens the uncertainty and the live estimate tracks the tone', () => {
  const x = sine(1000);
  const tight = by(measureSpeed(x, SR, { clockPpm: 10 }), 'speed.rpm').uncertainty;
  const wide = by(measureSpeed(x, SR, { clockPpm: 500 }), 'speed.rpm').uncertainty;
  assert.ok(wide > tight);
  const live = liveEstimate(sine(1020, 1), SR, {});
  assert.ok(Math.abs(live.hz - 1020) < 1.5);
  assert.equal(liveEstimate(new Float32Array(SR), SR, {}), null, 'silence gives no readout');
  assert.equal(centralSlice(x, SR, 2).length, 2 * SR);
});

// ---------------------------------------------------------------- strobe
test('strobe: dots per revolution table matches 2 x mains x 60 / rpm', () => {
  assert.equal(flickerHz(50), 100);
  assert.equal(flickerHz(60), 120);
  assert.ok(Math.abs(dotsPerRevolution(60, 100 / 3) - 216) < 1e-9);
  assert.ok(Math.abs(dotsPerRevolution(60, 45) - 160) < 1e-9);
  assert.ok(Math.abs(dotsPerRevolution(50, 100 / 3) - 180) < 1e-9);
  assert.ok(Math.abs(dotsPerRevolution(50, 45) - 133.3333) < 1e-3);
  const rows = dotsTable();
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => r.dots), [216, 180, 160, 133.3]);
  assert.equal(rows.find(r => r.mains === 50 && r.rpmId === '45').exact, false);
  assert.equal(rows.filter(r => r.exact).length, 3);
});

test('strobe: plan picks the nearest achievable rate and reports its systematic error', () => {
  const p120 = strobePlan(120, 120); // bright, dark, bright, dark: 60 flashes a second, the disc stands still at its 2nd harmonic
  assert.deepEqual([p120.n, p120.k, p120.errorPct], [2, 2, 0]);
  const p60 = strobePlan(120, 60); // a 60 Hz screen flashes 30 times a second and reaches 120 through the 4th harmonic
  assert.deepEqual([p60.n, p60.k, p60.effectiveHz], [2, 4, 120]);
  const p100on60 = strobePlan(100, 60);
  assert.ok(Math.abs(p100on60.effectiveHz - 100) < 1e-9, 'every 3rd frame, 5th harmonic');
  assert.equal(p100on60.n, 3);
  for (const r of [50, 60, 90, 120, 144]) assert.ok(strobePlan(120, r).n >= 2, 'never a continuously lit screen');
  const p100on120 = strobePlan(100, 120);
  assert.ok(Math.abs(p100on120.errorPct) < 1e-9);
  const rough = strobePlan(100, 90, { maxN: 2 });
  assert.ok(Math.abs(rough.errorPct) > 1, 'a poor divisor shows its error');
  assert.match(describePlan(rough, 100), /fast|slow/);
  assert.match(describePlan(p120, 120), /on target/);
  assert.throws(() => strobePlan(0, 60), RangeError);
});

test('strobe: refresh rate from frame timestamps uses the median gap', () => {
  const stamps = Array.from({ length: 30 }, (_, i) => i * (1000 / 120) + (i === 10 ? 20 : 0)); // one long frame
  assert.ok(Math.abs(refreshFromTimestamps(stamps) - 120) < 1);
  assert.equal(refreshFromTimestamps([0, 16, 32]), null);
});

// ---------------------------------------------------------------- vibration
function accel({ hz = 10, amp = 0.5, rate = 60, sec = 20, gravity = 9.81, jitter = 0 }) {
  const out = [];
  let s = 11;
  for (let i = 0; i < rate * sec; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const t = i / rate + jitter * ((s / 2 ** 32) - 0.5) / rate;
    out.push({ t, x: amp * Math.sin(2 * Math.PI * hz * t), y: 0.01 * Math.sin(2 * Math.PI * 3 * t), z: gravity });
  }
  return out;
}

test('vibration: 10 Hz at 60 Hz sampling gives RMS amp/sqrt(2) and a 10 Hz peak, gravity removed', () => {
  const m = vibrationMetrics(accel({ amp: 0.5 }));
  assert.equal(m.status, 'ok');
  assert.ok(Math.abs(m.rateHz - 60) < 0.5);
  assert.ok(Math.abs(m.rmsMs2 - 0.5 / Math.SQRT2) < 0.01, String(m.rmsMs2));
  assert.ok(Math.abs(m.dominantHz - 10) <= 0.25, String(m.dominantHz));
  assert.ok(Math.abs(m.dominantAmp - 0.5) < 0.05, String(m.dominantAmp));
  assert.equal(m.nyquistHz, m.rateHz / 2);
  assert.ok(m.spectrum[0].hz === 0.5 && m.spectrum.at(-1).hz <= 30);
});

test('vibration: jittery timestamps still work and a quiet plinth is a lower band', () => {
  const loud = vibrationMetrics(accel({ amp: 0.5, jitter: 0.3 }));
  const quiet = vibrationMetrics(accel({ amp: 0.004, jitter: 0.3 }));
  assert.equal(loud.status, 'ok');
  assert.ok(Math.abs(loud.dominantHz - 10) <= 0.5);
  assert.ok(quiet.rmsMs2 < loud.rmsMs2 / 10);
  assert.equal(vibrationBand(quiet.rmsMs2), 'low');
  assert.equal(vibrationBand(loud.rmsMs2), 'high');
  assert.equal(vibrationBand(NaN), 'unknown');
});

test('vibration: slow sensors, short takes and empty input are reported, not guessed', () => {
  const slow = vibrationMetrics(accel({ rate: 10, sec: 20 }));
  assert.equal(slow.status, 'too-slow');
  assert.ok(slow.rateHz < MIN_RATE_HZ);
  assert.equal(vibrationMetrics(accel({ sec: 3 })).status, 'too-short');
  assert.equal(vibrationMetrics([]).status, 'no-data');
  assert.equal(vibrationMetrics(null).status, 'no-data');
  assert.deepEqual(vibrationMeasurements({ status: 'too-slow' }), []);
  assert.ok(estimateRate(accel({ rate: 50, sec: 2 })) > 49);
  const ms = vibrationMeasurements(vibrationMetrics(accel({})));
  assert.deepEqual(ms.map(m => m.metricId), ['vibration.rmsMs2', 'vibration.dominantHz', 'vibration.lowBandDb']);
  assert.ok(ms.every(m => m.qualityFlags.includes('phone-sensor')));
});

test('vibration: detrend removes offset and slope', () => {
  const x = Float64Array.from({ length: 200 }, (_, i) => 5 + 0.01 * i);
  detrend(x);
  assert.ok(Math.max(...x.map(Math.abs)) < 1e-9);
});

// ---------------------------------------------------------------- SPL
test('spl: A and C weighting follow the IEC curves', () => {
  const A = hz => weightingResponseDb('A', hz, 48000), C = hz => weightingResponseDb('C', hz, 48000);
  assert.ok(Math.abs(A(1000)) < 1e-9);
  assert.ok(Math.abs(A(100) + 19.1) < 0.4, String(A(100)));
  assert.ok(Math.abs(A(50) + 30.2) < 0.6, String(A(50)));
  assert.ok(Math.abs(A(10000) + 2.5) < 1.2, String(A(10000)));
  assert.ok(Math.abs(C(100) + 0.3) < 0.3, String(C(100)));
  assert.ok(Math.abs(C(50) + 1.3) < 0.4, String(C(50)));
  assert.equal(weightingResponseDb('Z', 100, 48000), 0);
});

test('spl: level of a known sine, weighting changes low tones, calibration offset', () => {
  const x = sine(1000, 2, 0.1);
  const z = levelDbfs(x, SR, 'Z'), a = levelDbfs(x, SR, 'A');
  assert.ok(Math.abs(z - (20 * Math.log10(0.1 / Math.SQRT2))) < 0.05, String(z));
  assert.ok(Math.abs(a - z) < 0.2, 'A weighting is 0 dB at 1 kHz');
  const low = sine(100, 2, 0.1);
  assert.ok(levelDbfs(low, SR, 'A') < levelDbfs(low, SR, 'Z') - 15);
  const off = calibrationOffset(94, -30);
  assert.equal(off, 124);
  const ms = splMeasurements(x, SR, { weighting: 'A', offsetDb: off, calibrated: true });
  assert.ok(Math.abs(ms[0].value - (a + off)) < 0.01);
  assert.equal(ms[0].uncertainty, 3);
  const raw = splMeasurements(x, SR, {});
  assert.equal(raw[0].uncertainty, 10);
  assert.ok(raw[0].qualityFlags.includes('uncalibrated'));
  assert.equal(raw[0].unit, 'dBA');
});


test('vibration: stationary samples preserve zero RMS without inventing a frequency', () => {
  const m = vibrationMetrics(Array.from({ length: 1200 }, (_, i) => ({ t: i / 60, x: 0, y: 0, z: 0 })));
  assert.equal(m.status, 'ok');
  assert.equal(m.dominantHz, null);
  const rows = vibrationMeasurements(m);
  assert.equal(rows.find(row => row.metricId === 'vibration.rmsMs2').value, 0);
  assert.equal(rows.some(row => row.metricId === 'vibration.dominantHz'), false);
  assert.ok(rows.every(row => Number.isFinite(row.value)));
});
