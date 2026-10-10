// FS-13 §7 needle-skip detection: a skip (the stylus jumping grooves) is a step in the carrier phase common to
// both channels. Synthetic skips come from tests/fixtures/signals.mjs `phaseJumps`; every format family, phase
// sign, noise level, wow, imbalance and dropout case is checked for hits in the right bin and for no false alarms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quadratureTimecode, rng } from './fixtures/signals.mjs';
import { findFormat, directionSign } from '../app/timecode.js';
import { createScanner, detectSkips, verdict, toScanRecord, scanCoverage, WEAR_DEFAULTS, FLAGS } from '../app/wear-map.js';

const SR = 48000;
const tc = (name, o = {}) => { const f = findFormat(name); return quadratureTimecode({ carrierHz: f.carrierHz, phaseSign: directionSign(f), sampleRate: SR, snrDb: 35, ...o }); };
function scan(sig, name, { chunkSec = 1, binSec = 2 } = {}) {
  const s = createScanner({ format: name, sampleRate: SR, binSec });
  const step = Math.round(chunkSec * SR);
  for (let i = 0; i < sig.left.length; i += step) s.push(sig.left.subarray(i, i + step), sig.right.subarray(i, i + step));
  return s.finish();
}
const skipBins = r => r.bins.filter(b => b.reasons.includes('skip')).map(b => b.idx);

test('detectSkips finds a phase step with its time and size, and nothing on a clean carrier', () => {
  const f = findFormat('Serato CV02.5');
  const sig = tc('Serato CV02.5', { seconds: 2, phaseJumps: [{ atSec: 0.8, deg: 120 }], seed: 3 });
  const hits = detectSkips(sig.left, sig.right, SR, { carrierHz: f.carrierHz, phaseSign: directionSign(f) });
  assert.equal(hits.length, 1);
  assert.ok(Math.abs(hits[0].sec - 0.8) < 0.003, String(hits[0].sec));
  assert.ok(Math.abs(hits[0].deg - 120) < 8, String(hits[0].deg));
  const clean = tc('Serato CV02.5', { seconds: 2, seed: 4 });
  assert.deepEqual(detectSkips(clean.left, clean.right, SR, { carrierHz: f.carrierHz, phaseSign: directionSign(f) }), []);
  // backwards jumps are found with their sign
  const back = tc('Serato CV02.5', { seconds: 2, phaseJumps: [{ atSec: 1.2, deg: -90 }], seed: 5 });
  const b = detectSkips(back.left, back.right, SR, { carrierHz: 1000, phaseSign: 1 });
  assert.equal(b.length, 1);
  assert.ok(Math.abs(b[0].deg + 90) < 8, String(b[0].deg));
});

test('AC-5: a needle skip flags its bin interrupted with reason "skip" and the skip time', () => {
  const sig = tc('Serato CV02.5', { seconds: 16, phaseJumps: [{ atSec: 3.1, deg: 120 }, { atSec: 9.7, deg: -75 }], seed: 7 });
  const r = scan(sig, 'Serato CV02.5');
  assert.deepEqual(skipBins(r), [1, 4]);
  for (const b of r.bins) {
    const hit = b.idx === 1 || b.idx === 4;
    assert.equal(Boolean(b.flags & FLAGS.interrupted), hit, `bin ${b.idx}`);
    assert.equal(b.skips?.length ?? 0, hit ? 1 : 0, `bin ${b.idx}`);
  }
  assert.ok(Math.abs(r.bins[1].skips[0].tSec - 3.1) < 0.005);
  assert.ok(Math.abs(r.bins[4].skips[0].tSec - 9.7) < 0.005);
  assert.ok(Math.abs(r.bins[4].skips[0].deg + 75) < 8);
  assert.deepEqual(r.skips.map(s => Math.round(s.tSec * 10) / 10), [3.1, 9.7]);
  // excluded from the verdict like any interruption
  const v = verdict(r.bins);
  assert.equal(v.stats.interruptedBins, 2);
  assert.equal(v.verdict, 'keep');
  // carried into the saved summary for the result screen
  const rec = toScanRecord(r, v, { recordSideId: 'side-a', coverage: scanCoverage(r).coverage });
  assert.deepEqual(rec.summary.skips.map(s => Math.round(s.tSec * 10) / 10), [3.1, 9.7]);
});

test('skips at seeded random positions are found in their bins for every quadrature format family', () => {
  const formats = ['Serato CV02.5', 'Traktor Scratch MK1', 'Traktor Scratch MK2', 'MixVibes DVS V2', 'rekordbox RB-VS1'];
  for (const [k, name] of formats.entries()) {
    for (const seed of [11, 12, 13]) {
      const r = rng(seed * 31 + k);
      // one skip per 2 s bin in bins 1, 3 and 5, away from the bin edges, 40..180 deg either way
      const jumps = [1, 3, 5].map(b => ({ atSec: b * 2 + 0.1 + r() * 1.8, deg: (r() < 0.5 ? -1 : 1) * (40 + r() * 140) }));
      const res = scan(tc(name, { seconds: 14, snrDb: 25, phaseJumps: jumps, seed }), name);
      assert.deepEqual(skipBins(res), [1, 3, 5], `${name} seed ${seed}: ${JSON.stringify(jumps)}`);
      for (const j of jumps) {
        const s = res.skips.find(x => Math.abs(x.tSec - j.atSec) < 0.005);
        assert.ok(s, `${name} seed ${seed}: skip at ${j.atSec}`);
        const err = Math.abs(((s.deg - j.deg + 540) % 360) - 180);
        assert.ok(err < 12, `${name}: ${s.deg} vs ${j.deg}`);
      }
    }
  }
});

test('no false skips: noise down to 15 dB SNR, wow, channel imbalance, dropouts, speed change and a sub-threshold step', () => {
  const cases = [
    ['Serato CV02.5', { snrDb: 15, seed: 21 }],
    ['Traktor Scratch MK2', { snrDb: 20, velocityProfile: t => 1 + 0.003 * Math.sin(2 * Math.PI * 0.55 * t), seed: 22 }],
    ['Traktor Scratch MK1', { imbalanceDb: 3, snrDb: 25, seed: 23 }],
    ['Serato CV02.5', { dropouts: [[2.5, 2.56], [7.1, 7.2], [9.0, 9.03]], seed: 24 }],
    ['MixVibes DVS V2', { velocityProfile: t => (t < 5 ? 1 : 1.03), seed: 25 }],
    ['Serato CV02.5', { phaseJumps: [{ atSec: 4.4, deg: WEAR_DEFAULTS.skipMinDeg / 2 }], seed: 26 }],
  ];
  for (const [name, o] of cases) {
    const res = scan(tc(name, { seconds: 10, ...o }), name);
    assert.deepEqual(skipBins(res), [], `${name} ${JSON.stringify(o, (k, v) => (typeof v === 'function' ? 'fn' : v))}`);
    assert.deepEqual(res.skips, []);
  }
});

test('skip detection stays within the per-bin time budget', () => {
  const sig = tc('Traktor Scratch MK2', { seconds: 2, seed: 40 });
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) detectSkips(sig.left, sig.right, SR, { carrierHz: 2500, phaseSign: 1 });
  const per = (performance.now() - t0) / 5;
  assert.ok(per < 200, `${per.toFixed(1)} ms per 2 s bin`);
});

test('skip defaults are documented tunables', () => {
  assert.equal(WEAR_DEFAULTS.skipMinDeg, 30);
  assert.equal(WEAR_DEFAULTS.skipWinSec, 0.002);
  assert.ok(WEAR_DEFAULTS.skipSigma >= 5);
});
