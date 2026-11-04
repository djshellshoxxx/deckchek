// R2-02: real seeded audio, including noise louder than an already tracked carrier.
// The fallback is evidence of a recent coherent forward carrier, not a universal noise/cue classifier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quadratureTimecode, whiteNoise } from './fixtures/signals.mjs';
import { findFormat, directionSign } from '../app/timecode.js';
import { createMonitor, DEFAULT_THRESHOLDS, trayStateFor } from '../app/monitor.js';

const SR = 48000;
const FORMATS = ['Serato CV02.5', 'Traktor Scratch MK2', 'Traktor Scratch MK1', 'MixVibes DVS V2'];
const signal = (name, options = {}) => {
  const f = findFormat(name);
  return quadratureTimecode({ carrierHz: f.carrierHz, phaseSign: directionSign(f), sampleRate: SR, seconds: 8, snrDb: 30, amplitudeDbfs: -30, ...options });
};
function feed(monitor, sig) {
  const frames = [], hop = sig.sampleRate / 4;
  for (let o = 0; o < sig.left.length; o += hop) frames.push(monitor.push(sig.left.subarray(o, o + hop), sig.right.subarray(o, o + hop), sig.sampleRate));
  return { frames, alerts: frames.flatMap(f => monitor.alerts(f)) };
}
function verifyFixture(noisy, clean, snr) {
  let carrier = 0, noise = 0, peak = 0;
  for (const channel of ['left', 'right']) for (let i = 0; i < noisy[channel].length; i++) {
    carrier += clean[channel][i] ** 2;
    noise += (noisy[channel][i] - clean[channel][i]) ** 2;
    peak = Math.max(peak, Math.abs(noisy[channel][i]));
  }
  assert.ok(peak < 1, `fixture is below clipping: ${peak}`);
  assert.ok(Math.abs(10 * Math.log10(carrier / noise) - snr) < .1, 'actual sample powers match the requested SNR');
}

for (const name of FORMATS) test(`R2-02: ${name} retains the 12 dB floor after negative-SNR collapse`, () => {
  for (const snr of [-3, -6, -12]) for (const seed of [8, 31]) {
    const monitor = createMonitor({ format: name });
    feed(monitor, signal(name, { seconds: 15, seed: 1 }));
    const bad = signal(name, { snrDb: snr, seed });
    verifyFixture(bad, signal(name, { snrDb: Infinity }), snr);
    const { frames, alerts } = feed(monitor, bad);
    const floor = alerts.find(a => a.kind === 'snrFloor');
    assert.ok(floor, `${name}, ${snr} dB, seed ${seed}: critical floor event`);
    assert.equal(floor.severity, 'critical');
    assert.equal(floor.baseline, 12);
    assert.ok(floor.t >= 17 && floor.t <= 18, `2 s floor hysteresis after the analysis window: ${floor.t}`);
    assert.ok(Math.abs(floor.value - snr) < 1.5, `event reports measured carrier SNR: ${floor.value} vs ${snr}`);
    assert.match(floor.message, new RegExp(`SNR is ${Math.round(floor.value)} dB, below the 12 dB floor`));
    assert.equal(frames.at(-1).state, 'fault');
    assert.equal(trayStateFor([frames.at(-1).state]), 'fault');
  }
});

test('R2-02: negative-SNR floor follows a previously healthy pitched carrier', () => {
  for (const name of ['Serato CV02.5', 'Traktor Scratch MK2']) for (const velocityProfile of [.92, 1.08]) {
    const m = createMonitor({ format: name });
    feed(m, signal(name, { seconds: 15, velocityProfile }));
    const { frames, alerts } = feed(m, signal(name, { velocityProfile, snrDb: -6, seed: 31 }));
    assert.ok(alerts.some(a => a.kind === 'snrFloor'), `${name} at ${velocityProfile}`);
    assert.equal(frames.at(-1).state, 'fault');
  }
});

test('R2-02: floor still raises after N frames, clears after 2N healthy frames and respects 60 s cooldown', () => {
  assert.equal(DEFAULT_THRESHOLDS.snrFloorDb, 12);
  assert.equal(DEFAULT_THRESHOLDS.snrFloorSec, 2);
  const name = 'Traktor Scratch MK2', m = createMonitor({ format: name });
  feed(m, signal(name, { seconds: 15 }));
  // Each short episode is interrupted by a healthy window; it never lasts N qualifying frames.
  for (let i = 0; i < 3; i++) {
    assert.ok(!feed(m, signal(name, { seconds: 1.5, snrDb: -6, seed: 8 + i })).alerts.some(a => a.kind === 'snrFloor'));
    assert.ok(!feed(m, signal(name, { seconds: 1, seed: 20 + i })).alerts.some(a => a.kind === 'snrFloor'));
  }
  const first = feed(m, signal(name, { seconds: 5, snrDb: -6, seed: 31 })).alerts.find(a => a.kind === 'snrFloor');
  assert.ok(first);
  assert.equal(feed(m, signal(name, { seconds: 2 })).frames.at(-1).state, 'fault', 'fewer than 2N healthy frames cannot clear');
  assert.equal(feed(m, signal(name, { seconds: 3 })).frames.at(-1).state, 'ok');
  assert.ok(!feed(m, signal(name, { seconds: 5, snrDb: -6, seed: 31 })).alerts.some(a => a.kind === 'snrFloor'), 'second episode is inside cooldown');
  feed(m, signal(name, { seconds: 60 }));
  const later = feed(m, signal(name, { seconds: 5, snrDb: -6, seed: 31 })).alerts.find(a => a.kind === 'snrFloor');
  assert.ok(later && later.t - first.t >= 60);
});

test('R2-02: stale carrier does not turn noise, reverse/channel swap, hand stops or scratches into floor alarms', () => {
  for (const name of FORMATS) {
    const warm = () => { const m = createMonitor({ format: name }); feed(m, signal(name, { seconds: 15 })); return m; };
    const noise = { sampleRate: SR, left: whiteNoise(8 * SR, .03, 1), right: whiteNoise(8 * SR, .03, 2) };
    const reverse = signal(name, { velocityProfile: -1 });
    const swapped = signal(name); [swapped.left, swapped.right] = [swapped.right, swapped.left];
    const stop = signal(name, { velocityProfile: t => t < .2 ? 1 - t / .2 : t < 5 ? 0 : Math.min(1, t - 5) });
    for (let i = 0; i < stop.left.length; i++) { const gain = Math.abs(stop.truth.velocity(i / SR)); stop.left[i] *= gain; stop.right[i] *= gain; }
    for (const sig of [noise, reverse, swapped, stop]) {
      const { alerts } = feed(warm(), sig);
      assert.deepEqual(alerts.filter(a => a.kind === 'snrFloor'), [], name);
    }
    for (const hz of [.4, .7, 1, 2, 3]) {
      const sig = signal(name, { seconds: 12, velocityProfile: t => 1.2 * Math.sin(2 * Math.PI * hz * t) });
      for (let i = 0; i < sig.left.length; i++) { const gain = Math.min(1.5, Math.abs(sig.truth.velocity(i / SR))); sig.left[i] *= gain; sig.right[i] *= gain; }
      assert.deepEqual(feed(warm(), sig).alerts.filter(a => a.kind === 'snrFloor'), [], `${name} scratch ${hz} Hz`);
    }
  }
});

test('R2-02: reset, resume, rate change and lost coherence discard the old carrier reference', () => {
  const name = 'Traktor Scratch MK2';
  for (const transition of ['reset', 'resume', 'rate', 'noise', 'reverse', 'idle']) {
    const m = createMonitor({ format: name });
    feed(m, signal(name, { seconds: 15 }));
    let rate = SR;
    if (transition === 'reset') m.reset();
    if (transition === 'resume') m.resume(30);
    if (transition === 'rate') rate = 44100;
    if (transition === 'noise') feed(m, { sampleRate: SR, left: whiteNoise(3 * SR, .03, 1), right: whiteNoise(3 * SR, .03, 2) });
    if (transition === 'reverse') feed(m, signal(name, { seconds: 3, velocityProfile: -1 }));
    if (transition === 'idle') feed(m, { sampleRate: SR, left: new Float32Array(3 * SR), right: new Float32Array(3 * SR) });
    const { alerts } = feed(m, signal(name, { sampleRate: rate, seconds: 5, snrDb: -12, seed: 8 }));
    assert.deepEqual(alerts.filter(a => a.kind === 'snrFloor'), [], `${transition}: no inference from a stale reference`);
    feed(m, signal(name, { sampleRate: rate, seconds: 4 }));
    assert.ok(feed(m, signal(name, { sampleRate: rate, seconds: 5, snrDb: -12, seed: 8 })).alerts.some(a => a.kind === 'snrFloor'), `${transition}: healthy play can establish a fresh reference`);
  }
});
