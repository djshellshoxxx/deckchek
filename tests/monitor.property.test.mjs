// FS-31 property tests: seeded random DJ gestures (cueing, hand stops, backspins, scratching, pitch rides) on healthy
// timecode never raise a warning or critical alarm (spec §10 risk "false alarms from cuing/backspins"), while real
// faults injected between the gestures are still caught. Cartridge output follows |velocity| (a moving-magnet
// cartridge at rest gives no signal), so the synthetic signal is scaled by it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quadratureTimecode, rng } from './fixtures/signals.mjs';
import { findFormat, directionSign } from '../app/timecode.js';
import { createMonitor } from '../app/monitor.js';

const SR = 48000;

/** Piecewise gestures after 15 s of steady play; returns {v(t), plays:[[a,b]] steady-play spans}. */
function gestures(seed, seconds) {
  const r = rng(seed), segs = [{ a: 0, b: 15, f: () => 1, play: true }];
  let t = 15;
  while (t < seconds) {
    const kind = Math.floor(r() * 5), d = 0.5 + r() * 3, t0 = t, pitch = 1 + (r() - 0.5) * 0.16;
    if (kind === 0) segs.push({ a: t0, b: t0 + 2 + d, f: () => pitch, play: true });
    else if (kind === 1) { const hold = 0.2 + r() * 1.5; segs.push({ a: t0, b: t0 + 0.5 + hold, f: x => { const u = x - t0; return u < 0.1 ? 1 - u / 0.1 : u < 0.1 + hold ? 0 : Math.min(1, (u - 0.1 - hold) / 0.4); } }); }
    else if (kind === 2) { const sp = 2 + r() * 2; segs.push({ a: t0, b: t0 + d, f: x => -sp * Math.exp(-(x - t0) * 2) }); }
    else if (kind === 3) { const hz = 1 + r() * 3; segs.push({ a: t0, b: t0 + d, f: x => 1.2 * Math.sin(2 * Math.PI * hz * (x - t0)) }); }
    else { const p2 = 1 + (r() - 0.5) * 0.16; segs.push({ a: t0, b: t0 + d, f: x => pitch + (p2 - pitch) * (x - t0) / d }); }
    t = segs.at(-1).b;
  }
  let cur = segs[0];
  const v = x => { if (x >= cur.a && x < cur.b) return cur.f(x); for (const s of segs) if (x >= s.a && x < s.b) { cur = s; return s.f(x); } return 1; };
  return { v, plays: segs.filter(s => s.play).map(s => [s.a, s.b]) };
}

function render(fmtName, seed, seconds, extra = {}) {
  const f = findFormat(fmtName);
  const g = gestures(seed, seconds);
  const sig = quadratureTimecode({ carrierHz: f.carrierHz, phaseSign: directionSign(f), sampleRate: SR, seconds, snrDb: 35, velocityProfile: g.v, seed, ...extra });
  for (let i = 0; i < sig.left.length; i++) { const k = Math.min(1.5, Math.abs(g.v(i / SR))); sig.left[i] *= k; sig.right[i] *= k; }
  return { sig, ...g };
}

function run(sig, fmtName, hop = SR / 4) {
  const m = createMonitor({ format: fmtName });
  const alerts = [];
  for (let o = 0; o < sig.left.length; o += hop) alerts.push(...m.alerts(m.push(sig.left.subarray(o, o + hop), sig.right.subarray(o, o + hop), SR)));
  return { m, alerts };
}

test('property: cueing, hand stops, backspins, scratching and pitch rides never raise a warning or critical alarm', () => {
  for (const fmt of ['Serato CV02.5', 'Traktor Scratch MK2', 'Traktor Scratch MK1', 'MixVibes DVS V2']) {
    for (let seed = 1; seed <= 3; seed++) {
      const { sig } = render(fmt, seed * 7 + fmt.length, 50);
      const { alerts, m } = run(sig, fmt);
      const bad = alerts.filter(a => a.severity !== 'info');
      assert.deepEqual(bad.map(a => `${a.t.toFixed(1)} ${a.message}`), [], `${fmt} seed ${seed}`);
      assert.equal(m.summary().dropouts, 0, `${fmt} seed ${seed}: gestures are not dropouts`);
    }
  }
});

test('property: three real dropouts inside steady play are still caught among the gestures', () => {
  let caught = 0, tried = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const { plays } = gestures(seed, 60);
    // find a steady play span (after the first 15 s) long enough to hold three dropouts within 10 s
    const span = plays.find(([a, b]) => a >= 15 && b - a >= 3.2) || [10, 14];
    const s0 = span[0] + 0.8;
    const drops = [[s0, s0 + 0.06], [s0 + 0.8, s0 + 0.88], [s0 + 1.6, s0 + 1.66]];
    const { sig } = render('Serato CV02.5', seed, 60, { dropouts: drops });
    const { alerts } = run(sig, 'Serato CV02.5');
    tried++;
    if (alerts.some(a => a.kind === 'dropouts' && a.severity === 'critical')) caught++;
  }
  assert.equal(caught, tried, `${caught}/${tried} dropout bursts caught`);
});

test('property: SNR estimate is within +-1.5 dB for random levels, imbalance and noise seeds', () => {
  const r = rng(99);
  for (let k = 0; k < 12; k++) {
    const snr = 14 + r() * 24, amp = -30 + r() * 26, imb = (r() - 0.5) * 3, seed = 1 + Math.floor(r() * 1e6);
    const sig = quadratureTimecode({ carrierHz: 1000, sampleRate: SR, seconds: 3, snrDb: snr, amplitudeDbfs: amp, imbalanceDb: imb, seed });
    const { m } = run(sig, 'Serato CV02.5');
    const last = m.push(new Float32Array(0), new Float32Array(0), SR);
    assert.ok(Math.abs(last.snrDb - snr) <= 1.5, `snr ${snr.toFixed(1)} amp ${amp.toFixed(1)} imb ${imb.toFixed(2)}: ${last.snrDb.toFixed(2)}`);
    assert.ok(Math.abs(last.balanceDb - imb) < 0.5, `balance ${last.balanceDb} vs ${imb}`);
  }
});
