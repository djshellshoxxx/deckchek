// FS-13 control-vinyl wear map: streaming scanner on synthetic quadrature timecode (dropouts, SNR sweep,
// phase error, needle drop/lift, speed change, stream gaps), bin classes at their boundaries, verdict matrix,
// alignment / diff, spiral geometry and colour ramp, records, store bridge and the streaming driver.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quadratureTimecode, rng, whiteNoise } from './fixtures/signals.mjs';
import { findFormat, TIMECODE_FORMATS, directionSign } from '../app/timecode.js';
import {
  createScanner, scanSide, startWearScan, classifyBin, referenceBaseline, verdict, worstBins, scanCoverage, sideDurationSec,
  alignScans, diffScans, compareScans, regionSummary, positionToRadius, binsToArcs, metricQuality, qualityColor, binLabel, formatTime,
  validateScanRecord, toScanRecord, createWearMapApi,
  WEAR_DEFAULTS, CLASS_THRESHOLDS, VERDICT_THRESHOLDS, FLAGS, QUALITY_COLOR_RAMP, DEFAULT_GEOMETRY, VERDICTS,
} from '../app/wear-map.js';

const SR = 48000;

function tc(fmtName, opts = {}) {
  const f = findFormat(fmtName);
  return quadratureTimecode({ carrierHz: f.carrierHz, phaseSign: directionSign(f), sampleRate: SR, snrDb: 35, ...opts });
}

/** Feed a signal through a scanner in fixed-size chunks (a stream). */
function scan(sig, fmtName, { chunkSec = 1, binSec = 2, options } = {}) {
  const s = createScanner({ format: fmtName, sampleRate: sig.sampleRate ?? SR, binSec, options });
  const step = Math.max(1, Math.round(chunkSec * SR));
  for (let i = 0; i < sig.left.length; i += step) s.push(sig.left.subarray(i, i + step), sig.right.subarray(i, i + step));
  return { scanner: s, result: s.finish() };
}

const bin = (idx, o = {}) => ({ idx, tSec: idx * 2, durSec: 2, snrDb: 32, phaseErrDeg: 2, balanceDb: 0, levelDbfs: -20, dropouts: 0, flags: 0, ...o });
/** n bins with the given counts of bad / degraded / interrupted ones at the start. */
function binsWith(n, { bad = 0, degraded = 0, interrupted = 0 } = {}) {
  return Array.from({ length: n }, (_, i) => i < bad ? bin(i, { snrDb: 10 })
    : i < bad + degraded ? bin(i, { snrDb: 20 })
    : i < bad + degraded + interrupted ? bin(i, { snrDb: 5, dropouts: 9, flags: FLAGS.interrupted })
    : bin(i));
}

// ------------------------------------------------------------------ scanner on synthetic timecode

test('AC-1: dropouts injected into 2.5 kHz timecode land in the right 2 s bins with the right classes', () => {
  const sig = tc('Traktor Scratch MK2', { seconds: 16, dropouts: [[5.3, 5.36], [11.2, 11.25], [11.6, 11.64]], seed: 7 });
  const { result } = scan(sig, 'Traktor Scratch MK2');
  assert.equal(result.bins.length, 8);
  assert.deepEqual(result.bins.map(b => b.tSec), [0, 2, 4, 6, 8, 10, 12, 14]);
  assert.deepEqual(result.bins.map(b => b.dropouts), [0, 0, 1, 0, 0, 2, 0, 0]);
  assert.deepEqual(result.bins.map(b => b.cls), ['good', 'good', 'degraded', 'good', 'good', 'bad', 'good', 'good']);
  for (const b of result.bins) {
    assert.ok(Math.abs(b.snrDb - 35) < 1.5, `bin ${b.idx} SNR ${b.snrDb}`);
    assert.ok(b.phaseErrDeg < 3, `bin ${b.idx} phase error ${b.phaseErrDeg}`);
    assert.ok(Math.abs(b.levelDbfs - -9) < 0.6, `bin ${b.idx} level ${b.levelDbfs}`);
    assert.ok(Math.abs(b.carrierHz - 2500) < 1);
    assert.equal(b.flags, 0);
  }
  assert.equal(result.elapsedSec, 16);
  assert.equal(result.envelope.hz, 1);
  assert.equal(result.envelope.db.length, 16);
});

test('dropouts at seeded random positions are found in their bins for every quadrature format family', () => {
  const r = rng(1313);
  for (const name of ['Serato CV02.5', 'Traktor Scratch MK2', 'Traktor Scratch MK1', 'MixVibes DVS V2']) {
    for (let k = 0; k < 2; k++) {
      // one 40-60 ms dropout well inside one of bins 1..3 (away from bin edges)
      const which = 1 + Math.floor(r() * 3), at = which * 2 + 0.3 + r() * 1.3, len = 0.04 + r() * 0.02;
      const sig = tc(name, { seconds: 8, dropouts: [[at, at + len]], seed: 100 + k });
      const { result } = scan(sig, name, { chunkSec: 0.25 + r() });
      assert.deepEqual(result.bins.map(b => b.dropouts), [0, 1, 2, 3].map(i => i === which ? 1 : 0), `${name} dropout at ${at.toFixed(2)}`);
      assert.ok(result.bins.every(b => b.flags === 0), `${name}: forward play is not flagged reverse (phaseSign ${findFormat(name).phaseSign})`);
    }
  }
});

test('stream chunking does not change the result and memory stays one bin', () => {
  const sig = tc('Serato CV02.5', { seconds: 9, dropouts: [[3.1, 3.15]], seed: 3 });
  const a = scan(sig, 'Serato CV02.5', { chunkSec: 1 }).result;
  const s = createScanner({ format: 'Serato CV02.5', sampleRate: SR });
  const r = rng(9);
  let i = 0, maxHeld = 0;
  while (i < sig.left.length) {
    const n = 1 + Math.floor(r() * 30000);
    s.push(sig.left.subarray(i, i + n), sig.right.subarray(i, i + n));
    maxHeld = Math.max(maxHeld, s.bufferedSamples());
    i += n;
  }
  const b = s.finish();
  assert.deepEqual(b.bins, a.bins);
  assert.ok(maxHeld < 2 * SR, 'never holds more than one 2 s bin of audio');
  assert.equal(s.capacitySamples(), 2 * 2 * SR, 'fixed buffer: one bin, two channels');
  // the last 1 s partial bin is analysed (>= 0.5 s of audio)
  assert.equal(b.bins.length, 5);
  assert.equal(b.bins[4].durSec, 1);
  assert.throws(() => s.push(new Float32Array(10), new Float32Array(10)), /finished/);
});

test('SNR sweep produces the expected bin class', () => {
  for (const [snr, cls] of [[10, 'bad'], [13, 'bad'], [17, 'degraded'], [22, 'degraded'], [28, 'good'], [40, 'good']]) {
    const { result } = scan(tc('Traktor Scratch MK2', { seconds: 2, snrDb: snr, seed: snr }), 'Traktor Scratch MK2');
    assert.equal(result.bins.length, 1);
    assert.ok(Math.abs(result.bins[0].snrDb - snr) < 0.7, `SNR ${snr}: measured ${result.bins[0].snrDb}`);
    assert.equal(result.bins[0].cls, cls, `SNR ${snr}`);
    assert.equal(result.bins[0].flags, 0, `SNR ${snr} is not mistaken for a speed change`);
  }
});

test('phase error from 90 deg drives the class; 270-deg formats are scored against their own quadrature', () => {
  const quad = (deltaDeg, phaseSign = 1, hz = 1000) => {
    const n = 2 * SR, left = new Float32Array(n), right = new Float32Array(n), q = phaseSign * (90 + deltaDeg) * Math.PI / 180;
    for (let i = 0; i < n; i++) { const p = 2 * Math.PI * hz * i / SR; left[i] = 0.5 * Math.sin(p); right[i] = 0.5 * Math.sin(p + q); }
    return { left, right };
  };
  for (const [delta, cls] of [[0, 'good'], [8, 'good'], [18, 'degraded'], [32, 'bad']]) {
    const r = scanSide([quad(delta)], { format: 'Serato CV02.5', sampleRate: SR });
    assert.ok(Math.abs(r.bins[0].phaseErrDeg - delta) < 0.5, `delta ${delta}: ${r.bins[0].phaseErrDeg}`);
    assert.equal(r.bins[0].cls, cls);
  }
  const mv = scanSide([quad(0, -1, 1300)], { format: 'MixVibes DVS V2', sampleRate: SR });
  assert.equal(mv.bins[0].cls, 'good');
  assert.equal(mv.bins[0].flags, 0, 'MixVibes forward (270 deg, SWITCH_PHASE) is not read as reverse');
  // Traktor MK1 sets SWITCH_PRIMARY and SWITCH_PHASE: the two cancel, so forward is the plain +90 deg relation
  const mk1 = scanSide([quad(0, 1, 2000)], { format: 'Traktor Scratch MK1', sampleRate: SR });
  assert.equal(mk1.bins[0].flags, 0, 'Traktor MK1 forward is not read as reverse');
  const mk1Back = scanSide([quad(0, -1, 2000)], { format: 'Traktor Scratch MK1', sampleRate: SR });
  assert.ok(mk1Back.bins[0].reasons.includes('reverse'), 'Traktor MK1 played backwards reads reverse');
  // the same samples under a +90 format read as playing backwards: interrupted, excluded
  const wrong = scanSide([quad(0, -1, 1000)], { format: 'Serato CV02.5', sampleRate: SR });
  assert.ok(wrong.bins[0].flags & FLAGS.interrupted);
  assert.ok(wrong.bins[0].reasons.includes('reverse'));
});

test('AC-5: a needle lift mid-side flags the affected bins interrupted, including the bin that held the lift', () => {
  // lift at 7.8 s, needle back at 11.0 s: bin 3 ends with 0.2 s silence, bin 4 silent, bin 5 opens with 1 s silence
  const sig = tc('Serato CV02.5', { seconds: 16, dropouts: [[7.8, 11.0]], seed: 4 });
  // a real lift leaves a noise floor, not digital zero
  const floor = whiteNoise(sig.left.length, 10 ** (-75 / 20), 99);
  for (let i = Math.round(7.8 * SR); i < 11 * SR; i++) { sig.left[i] += floor[i]; sig.right[i] += floor[i]; }
  const updates = [];
  const s = createScanner({ format: 'Serato CV02.5', sampleRate: SR, onBin: (b, { updated }) => { if (updated) updates.push(b.idx); } });
  s.push(sig.left, sig.right);
  const r = s.finish();
  assert.deepEqual(r.bins.map(b => Boolean(b.flags & FLAGS.interrupted)), [false, false, false, true, true, true, false, false]);
  assert.ok(r.bins[3].reasons.includes('needle-lift'));
  assert.ok(r.bins[4].reasons.includes('silence'));
  assert.ok(r.bins[5].reasons.includes('silence'));
  assert.deepEqual(updates, [3], 'the earlier bin is re-announced when the lift is recognised');
  const v = verdict(r.bins);
  assert.equal(v.stats.validBins, 5);
  assert.equal(v.stats.interruptedBins, 3);
  assert.equal(v.verdict, 'keep', 'interrupted bins never count against the side');
});

test('AC-5: a speed change (carrier shift) flags the bins from the change on', () => {
  const sig = tc('Traktor Scratch MK2', { seconds: 12, velocityProfile: t => (t < 6.5 ? 1 : 1.04), seed: 5 });
  const { result } = scan(sig, 'Traktor Scratch MK2');
  const flags = result.bins.map(b => b.flags);
  assert.deepEqual(flags.slice(0, 3), [0, 0, 0]);
  for (const b of result.bins.slice(3)) {
    assert.equal(b.flags & (FLAGS.interrupted | FLAGS.speedShift), FLAGS.interrupted | FLAGS.speedShift, `bin ${b.idx}`);
    assert.ok(b.reasons.includes('speed-shift'));
  }
  // a constant small pitch offset from the start is not a speed change
  const steady = scan(tc('Traktor Scratch MK2', { seconds: 6, velocityProfile: 1.006, seed: 6 }), 'Traktor Scratch MK2').result;
  assert.ok(steady.bins.every(b => b.flags === 0));
  assert.ok(Math.abs(steady.bins[0].speedErrPct - 0.6) < 0.05);
});

test('wrong format or speed is lock loss: verdict incomplete with the format hint', () => {
  // Traktor MK2 vinyl (2.5 kHz) scanned as Traktor MK1 (2 kHz): carrier 25 % off the format
  const r = scan(tc('Traktor Scratch MK2', { seconds: 6, seed: 8 }), 'Traktor Scratch MK1').result;
  assert.ok(r.bins.every(b => b.reasons.includes('wrong-speed') && (b.flags & FLAGS.interrupted)));
  const v = verdict(r.bins);
  assert.equal(v.verdict, 'incomplete');
  assert.ok(v.lockError);
  assert.match(v.message, /Check format selection and phono\/line/);
  // 1 kHz vinyl scanned as a 2.5 kHz format: nothing inside the search span -> no lock
  const n = scan(tc('Serato CV02.5', { seconds: 4, seed: 9 }), 'Traktor Scratch MK2').result;
  assert.ok(n.bins.every(b => b.reasons.includes('no-lock') || b.reasons.includes('wrong-speed')), JSON.stringify(n.bins.map(b => b.reasons)));
  assert.equal(verdict(n.bins).verdict, 'incomplete');
});

test('needle drop: leading silence is interrupted and recorded as the drop time', () => {
  const sig = tc('Serato CV02.5', { seconds: 8, dropouts: [[0, 1.3]], seed: 10 });
  const { result } = scan(sig, 'Serato CV02.5');
  assert.ok(result.bins[0].flags & FLAGS.interrupted);
  assert.deepEqual(result.bins.slice(1).map(b => b.flags), [0, 0, 0]);
  assert.ok(Math.abs(result.needleDropSec - 1.3) <= 0.021, String(result.needleDropSec));
  assert.equal(result.fromNeedleDrop, true);
  // short lead-in (0.2 s) inside the first bin: that bin is still interrupted (needle-drop), not a dropout
  const short = scan(tc('Serato CV02.5', { seconds: 4, dropouts: [[0, 0.2]], seed: 11 }), 'Serato CV02.5').result;
  assert.ok(short.bins[0].reasons.includes('needle-drop'));
  assert.equal(short.bins[1].flags, 0);
  // capture started mid-play: no needle drop seen
  const mid = scan(tc('Serato CV02.5', { seconds: 4, seed: 12 }), 'Serato CV02.5').result;
  assert.equal(mid.fromNeedleDrop, false);
  assert.equal(mid.needleDropSec, 0);
});

test('stream blocks: sequence gaps and overruns advance time as interrupted bins; discontinuity flags the bin', () => {
  const sig = tc('Serato CV02.5', { seconds: 10, seed: 13 });
  const s = createScanner({ format: 'Serato CV02.5', sampleRate: SR });
  const blk = (seq, k, quality = {}) => ({ seq, sampleRate: SR, frames: SR, left: sig.left.subarray(k * SR, (k + 1) * SR), right: sig.right.subarray(k * SR, (k + 1) * SR), quality: { droppedBlocks: 0, overrunSamples: 0, discontinuity: false, final: false, ...quality } });
  s.pushBlock(blk(0, 0)); s.pushBlock(blk(1, 1));          // bin 0 clean
  s.pushBlock(blk(2, 2)); s.pushBlock(blk(5, 3, { droppedBlocks: 2, discontinuity: true })); // seq 3,4 lost (2 s)
  s.pushBlock(blk(6, 4)); s.pushBlock(blk(7, 5));
  s.pushBlock(blk(8, 6, { overrunSamples: 4800 })); s.pushBlock(blk(9, 7, { overrunSamples: 4800 }));
  s.pushBlock({ seq: 10, frames: 0, quality: { final: true } });
  const r = s.finish();
  // timeline: 0-3 s audio, 3-5 s lost (seq 3, 4), 5-8 s audio, 8.0-8.1 s overrun, 8.1-10.1 s audio
  assert.equal(r.elapsedSec, 10.1);
  assert.deepEqual(r.bins.map(b => b.tSec), [0, 2, 4, 6, 8], 'the last 0.1 s is too short to analyse');
  assert.deepEqual(r.bins.map(b => Boolean(b.flags & FLAGS.interrupted)), [false, true, true, false, true]);
  assert.ok(r.bins[1].reasons.includes('stream-gap'));
  assert.equal(r.envelope.db.length, 11);
  assert.deepEqual(r.envelope.db.slice(2, 6).map(x => x === null), [false, true, true, false], 'lost seconds have no envelope value');
  assert.throws(() => s.pushBlock({ ...blk(11, 0), sampleRate: 44100 }), /finished|sample rate/);
  const s2 = createScanner({ format: 'Serato CV02.5', sampleRate: SR });
  assert.throws(() => s2.pushBlock({ ...blk(0, 0), sampleRate: 44100 }), /sample rate changed/);
});

test('clipping is flagged but does not interrupt', () => {
  const sig = tc('Serato CV02.5', { seconds: 2, amplitudeDbfs: 0, snrDb: Infinity });
  const { result } = scan(sig, 'Serato CV02.5');
  assert.equal(result.bins[0].flags, FLAGS.clip);
  assert.equal(result.bins[0].cls, 'good');
});

test('scanner arguments are validated', () => {
  assert.throws(() => createScanner({ format: 'Nope', sampleRate: SR }), /Unknown timecode format/);
  assert.throws(() => createScanner({ format: 'Serato CV02.5', sampleRate: 1000 }), /sampleRate/);
  for (const b of [0.99, 5.01, NaN]) assert.throws(() => createScanner({ format: 'Serato CV02.5', sampleRate: SR, binSec: b }), /binSec/);
  for (const b of [1, 5]) assert.doesNotThrow(() => createScanner({ format: 'Serato CV02.5', sampleRate: SR, binSec: b }));
  const r = createScanner({ format: 'Serato CV02.5', sampleRate: SR, binSec: 1 });
  r.push(new Float32Array(SR * 3), new Float32Array(SR * 3));
  assert.equal(r.finish().bins.length, 3, '1 s bins');
});

test('per-bin analysis stays well inside real time (budget: < 50 % of the bin)', () => {
  const sig = tc('Traktor Scratch MK2', { seconds: 12, snrDb: 20, seed: 14 });
  const s = createScanner({ format: 'Traktor Scratch MK2', sampleRate: SR });
  const t0 = performance.now();
  s.push(sig.left, sig.right);
  const per = (performance.now() - t0) / s.finish().bins.length;
  // strict budget is 1000 ms per 2 s bin; CI machines vary, so this lenient check only catches regressions by 2x
  assert.ok(per < 1000, `per-bin ${per.toFixed(0)} ms`);
});

// ------------------------------------------------------------------ classes, baseline, coverage

test('bin class thresholds at, just below and just above each boundary', () => {
  const c = o => classifyBin(bin(0, o));
  assert.deepEqual([c({ snrDb: 25 }), c({ snrDb: 24.99 }), c({ snrDb: 15 }), c({ snrDb: 14.99 })], ['good', 'degraded', 'degraded', 'bad']);
  assert.deepEqual([c({ phaseErrDeg: 10 }), c({ phaseErrDeg: 10.01 }), c({ phaseErrDeg: 25 }), c({ phaseErrDeg: 25.01 })], ['good', 'degraded', 'degraded', 'bad']);
  assert.deepEqual([c({ dropouts: 0 }), c({ dropouts: 1 }), c({ dropouts: 2 })], ['good', 'degraded', 'bad']);
  assert.equal(c({ snrDb: null }), 'bad', 'no SNR at all is bad');
  assert.equal(c({ flags: FLAGS.interrupted }), 'interrupted');
  assert.equal(c({ flags: FLAGS.clip }), 'good');
  assert.equal(classifyBin(bin(0, { snrDb: 22 }), { thresholds: { goodSnrDb: 20 } }), 'good', 'thresholds are tunable');
  assert.deepEqual(CLASS_THRESHOLDS, { goodSnrDb: 25, badSnrDb: 15, goodPhaseErrDeg: 10, badPhaseErrDeg: 25, badDropouts: 2 });
});

test('per-radius baseline from a reference scan compensates inner-groove SNR loss', () => {
  // reference: SNR falls 30 -> 21 dB from outer to inner edge
  const ref = Array.from({ length: 100 }, (_, i) => bin(i, { snrDb: 30 - 9 * i / 99 }));
  const base = referenceBaseline(ref);
  assert.ok(Math.abs(base.slopeDbPerSec - -9 / 198) < 1e-9);
  assert.ok(Math.abs(base.snr0 - (30 - 9 * 2 / 99)) < 1e-9, 'median of the first 5 % (5 bins)');
  const inner = bin(95, { snrDb: 21.5 });
  assert.equal(classifyBin(inner), 'degraded');
  assert.equal(classifyBin(inner, { baseline: base }), 'good');
  // a rising reference never penalises
  const up = referenceBaseline(Array.from({ length: 10 }, (_, i) => bin(i, { snrDb: 20 + i })));
  assert.equal(classifyBin(bin(9, { snrDb: 26 }), { baseline: up }), 'good');
  assert.equal(referenceBaseline([bin(0)]), null);
});

test('AC-6: partial scans report coverage of the side from the format side table', () => {
  assert.equal(sideDurationSec('Serato CV02.5', 'A'), 712);
  assert.equal(sideDurationSec('Serato CV02.5', 'b'), 922);
  assert.equal(sideDurationSec('Traktor Scratch MK2', 'B'), 2590000 / 2500);
  assert.equal(sideDurationSec('MixVibes 7"', 'A'), 312000 / 1300, 'single-sided formats use their only side');
  assert.equal(sideDurationSec('Final Scratch', 'A'), null);
  assert.equal(sideDurationSec('Serato CV02.5', 'C'), null);
  const result = { elapsedSec: 22, bins: [...binsWith(10), bin(10, { flags: FLAGS.interrupted })] };
  assert.deepEqual(scanCoverage(result, { sideDurationSec: 20 / 0.62 }), { coverage: 0.62, basis: 'side', validSec: 20 });
  assert.deepEqual(scanCoverage(result), { coverage: round(20 / 22), basis: 'elapsed', validSec: 20 });
  const v = verdict(binsWith(10), { coverage: 0.62, sideLabel: 'A' });
  assert.equal(v.verdict, 'keep');
  assert.ok(v.partial);
  assert.match(v.message, /Scanned 62 % of the side\./);
  assert.ok(!verdict(binsWith(10), { coverage: 1 }).message.includes('Scanned'));
  assert.equal(verdict(binsWith(10), { coverage: 0.04 }).verdict, 'incomplete');
});
const round = x => Math.round(x * 1e6) / 1e6;

// ------------------------------------------------------------------ verdict

test('AC-4: verdict matrix (keep / watch / other side / replace / incomplete)', () => {
  const v = (bins, ctx) => verdict(bins, ctx).verdict;
  assert.equal(v(binsWith(100, { degraded: 4 })), 'keep');
  assert.equal(v(binsWith(100, { degraded: 5 })), 'watch', 'degraded 5 % is not < 5 %');
  assert.equal(v(binsWith(100, { bad: 1 })), 'watch', 'bad 1 % is not < 1 %');
  assert.equal(v(binsWith(100, { bad: 2, degraded: 20 })), 'watch', 'bad < 3 %');
  assert.equal(v(binsWith(100, { bad: 5, degraded: 10 })), 'watch', 'degraded < 15 %');
  assert.equal(v(binsWith(100, { bad: 5, degraded: 15 })), 'replace', 'neither watch rule holds');
  assert.equal(v(binsWith(100, { bad: 3 }), { otherSide: 0.5 }), 'other_side');
  assert.equal(v(binsWith(100, { bad: 3 }), { otherSide: { badPct: 1 } }), 'watch', 'other side must have bad < 1 %');
  assert.equal(v(binsWith(100, { bad: 3 }), { otherSide: { badPct: 3 } }), 'replace', 'both sides fail');
  assert.equal(v(binsWith(100, { bad: 2 }), { otherSide: { badPct: 9 } }), 'watch', 'this side below 3 % does not fail');
  assert.equal(v(binsWith(100, { bad: 10 })), 'replace');
  assert.equal(v(binsWith(100, { bad: 9 }), { otherSide: { summary: { badPct: 0 } } }), 'other_side');
  assert.equal(v(binsWith(100, { bad: 1 }), { history: [0] }), 'watch', 'two points are not a trend');
  assert.equal(v(binsWith(100, { bad: 8 }), { history: [0, 2] }), 'replace', 'bad share up 4 points per scan');
  assert.equal(v(binsWith(100, { bad: 6 }), { history: [0, 3] }), 'watch', 'exactly 3 points per scan is not > 3');
  assert.equal(v(binsWith(100, { bad: 2 }), { history: [50, 0, 1] }), 'watch', 'only the last three scans count');
  assert.equal(v([]), 'incomplete');
  assert.equal(v(binsWith(10, { interrupted: 10 })), 'incomplete');
  assert.deepEqual(VERDICTS, ['keep', 'watch', 'other_side', 'replace', 'incomplete']);
  assert.equal(VERDICT_THRESHOLDS.replaceBadPct, 10);
});

test('verdict ignores interrupted bins and downgrades Replace to Watch when the stylus benchmark is red', () => {
  assert.equal(verdict(binsWith(100, { interrupted: 40 })).verdict, 'keep');
  const red = verdict(binsWith(100, { bad: 12 }), { stylusRed: true });
  assert.equal(red.verdict, 'watch');
  assert.ok(red.reasons.includes('stylus-downgrade'));
  assert.match(red.message, /Stylus may be the cause/);
  const keepRed = verdict(binsWith(100), { stylusRed: true });
  assert.equal(keepRed.verdict, 'keep');
  assert.match(keepRed.stylusNote, /Stylus may be the cause/);
});

test('verdict message and the three worst bins with timestamps', () => {
  // 700 bins of 2 s: 63 bins at SNR 12 (18:40 onwards), 14 dropouts from 18:40 to 21:10, other side clean
  const bins = Array.from({ length: 700 }, (_, i) => bin(i));
  for (let i = 560; i < 623; i++) bins[i].snrDb = 12;
  for (const i of [560, 570, 580, 590, 600, 610, 634]) bins[i].dropouts = 2;
  bins[575].snrDb = 9;
  bins[575].dropouts = 0;
  const v = verdict(bins, { otherSide: { badPct: 0.4 }, sideLabel: 'A', coverage: 1 });
  assert.equal(v.verdict, 'other_side');
  assert.equal(v.message, 'Use the other side. Side A has 14 dropouts between 18:40 and 21:10 and SNR below 20 dB over 9 % of the side.');
  assert.deepEqual(v.worst.map(w => [w.idx, w.time, w.class]), [[575, '19:10', 'bad'], [560, '18:40', 'bad'], [570, '19:00', 'bad']]);
  assert.equal(v.label, 'Use other side');
  const clean = verdict(binsWith(20), { sideLabel: 'B' });
  assert.equal(clean.message, 'Keep using this side. Side B shows no dropouts and SNR stays at or above 20 dB.');
  assert.equal(clean.score, 100);
  assert.equal(verdict(binsWith(4, { degraded: 2 })).score, 75);
  assert.deepEqual(worstBins(binsWith(5, { interrupted: 5 })), []);
});

// ------------------------------------------------------------------ alignment and diff

function envScan(env, extra = {}) { return { binSec: 2, bins: [], envelope: { hz: 1, db: env }, fromNeedleDrop: false, needleDropSec: null, ...extra }; }

test('AC-3: alignment recovers a 7 s offset from the level envelopes', () => {
  const r = rng(77), full = [];
  let x = -20;
  for (let i = 0; i < 400; i++) { x += (r() - 0.5) * 2; x = Math.max(-30, Math.min(-12, x)); full.push(x); }
  const a = envScan(full.slice(0, 300));
  const b = envScan(full.slice(7, 307).map(v => v + 0.2 * (r() - 0.5))); // b started 7 s later into the side
  const al = alignScans(a, b);
  assert.equal(al.method, 'envelope');
  assert.ok(al.aligned && al.confidence >= 0.6);
  assert.ok(Math.abs(al.offsetSec - 7) < 0.3, String(al.offsetSec));
  const back = alignScans(b, a);
  assert.ok(Math.abs(back.offsetSec + 7) < 0.3);
  // unrelated envelopes: no alignment, region comparison
  const u = envScan(Array.from({ length: 300 }, () => -20 + 6 * (r() - 0.5)));
  const nope = alignScans(a, u);
  assert.equal(nope.aligned, false);
  assert.equal(nope.offsetSec, null);
  assert.equal(nope.method, 'region');
  // both from the needle drop: offset from the drop times
  const nd = alignScans(envScan([], { fromNeedleDrop: true, needleDropSec: 1.3 }), envScan([], { fromNeedleDrop: true, needleDropSec: 0.4 }));
  assert.deepEqual(nd, { offsetSec: 0.9, confidence: 1, method: 'needle-drop', aligned: true });
});

test('AC-3: end to end, two captures of the same worn side align by envelope', () => {
  // the side's level wanders (wear, pressing); scan B starts 7 s later in the side and runs at the same speed
  const f = findFormat('Serato CV02.5'), total = 46, r = rng(5);
  const knots = Array.from({ length: total + 2 }, () => -4 + 8 * r());
  const gain = t => { const k = Math.floor(t), u = t - k; return 10 ** ((knots[k] * (1 - u) + knots[k + 1] * u) / 20); };
  const sig = quadratureTimecode({ carrierHz: f.carrierHz, seconds: total, sampleRate: SR, snrDb: 35, seed: 21 });
  for (let i = 0; i < sig.left.length; i++) { const g = gain(i / SR); sig.left[i] *= g; sig.right[i] *= g; }
  const cut = (from, to) => ({ left: sig.left.subarray(from * SR, to * SR), right: sig.right.subarray(from * SR, to * SR) });
  const a = scanSide([cut(0, 38)], { format: f.name, sampleRate: SR });
  const b = scanSide([cut(7, 45)], { format: f.name, sampleRate: SR });
  const al = alignScans(a, b);
  assert.ok(al.aligned, JSON.stringify(al));
  assert.ok(Math.abs(al.offsetSec - 7) < 0.5, String(al.offsetSec));
  const cmp = compareScans(a, b);
  assert.equal(cmp.mode, 'bin');
  assert.ok(cmp.summary.compared >= 14);
  assert.equal(cmp.summary.newBad, 0);
  assert.ok(cmp.summary.withinNoise, 'same side, same condition: changes are within noise');
});

test('diffScans flags new bad bins, new dropouts and changes within noise, aligned by offset', () => {
  const a = { binSec: 2, bins: [bin(0), bin(1), bin(2), bin(3), bin(4, { flags: FLAGS.interrupted })] };
  const b = { binSec: 2, bins: [bin(0, { snrDb: 31 }), bin(1, { snrDb: 10, dropouts: 3 }), bin(2, { snrDb: 26 }), bin(3), bin(4)] };
  const d = diffScans(a, b);
  assert.deepEqual(d.map(x => x.newBad), [false, true, false, false, false]);
  assert.deepEqual(d.map(x => x.withinNoise), [true, false, false, true, null]);
  assert.deepEqual(d.map(x => x.newDropouts), [0, 3, 0, 0, 0]);
  assert.equal(d[1].snrDelta, -22);
  assert.equal(d[4].excluded, true, 'interrupted in the earlier scan');
  // b started 2 s (one bin) later: b bin k compares with a bin k+1
  const shifted = diffScans(a, { binSec: 2, bins: [bin(0, { snrDb: 10 })] }, { offsetSec: 2 });
  assert.equal(shifted[0].prevIdx, 1);
  const none = diffScans(a, { binSec: 2, bins: [bin(9)] });
  assert.equal(none[0].excluded, true);
  assert.equal(none[0].prevIdx, null);
});

test('scans that cannot be aligned are compared by region', () => {
  const r = rng(3);
  const a = { binSec: 2, bins: binsWith(50), envelope: { hz: 1, db: Array.from({ length: 100 }, () => -20 + 4 * r()) } };
  const b = { binSec: 2, bins: binsWith(50, { bad: 5 }), envelope: { hz: 1, db: Array.from({ length: 100 }, () => -20 + 4 * r()) } };
  const cmp = compareScans(a, b);
  assert.equal(cmp.mode, 'region');
  assert.equal(cmp.regions.length, 10);
  assert.equal(cmp.regions[0].badPct, 100);
  assert.equal(cmp.regions[0].badPctDelta, 100);
  assert.equal(cmp.regions[9].badPctDelta, 0);
  assert.equal(regionSummary({ bins: [] }).length, 0);
});

// ------------------------------------------------------------------ geometry, colour, labels

test('AC-2: radius mapping is monotonic from the outer edge to the run-out', () => {
  const g = { durationSec: 712 };
  assert.equal(positionToRadius(0, g), DEFAULT_GEOMETRY.outerMm);
  assert.equal(positionToRadius(712, g), DEFAULT_GEOMETRY.innerMm);
  assert.equal(positionToRadius(356, g), (146 + 58) / 2);
  assert.equal(positionToRadius(-5, g), 146);
  assert.equal(positionToRadius(9999, g), 58);
  let prev = Infinity;
  for (let t = 0; t <= 712; t += 7) { const r = positionToRadius(t, g); assert.ok(r < prev); prev = r; }
  assert.throws(() => positionToRadius(1, {}), /durationSec/);
});

test('AC-2: bins become spiral arcs coloured by the chosen metric, with hatching and neutral interrupted bins', () => {
  const bins = [bin(0), bin(1, { snrDb: 10 }), bin(2, { flags: FLAGS.interrupted }), bin(3, { phaseErrDeg: 30 }), bin(4, { dropouts: 1 })];
  const arcs = binsToArcs(bins, { durationSec: 10, turns: 2 }, 'snr');
  assert.equal(arcs.length, 5);
  assert.equal(arcs[0].a0, 0);
  assert.ok(Math.abs(arcs[4].a1 - 4 * Math.PI) < 1e-12, 'two visual turns over the side');
  for (let i = 1; i < arcs.length; i++) {
    assert.ok(arcs[i].a0 >= arcs[i - 1].a1 - 1e-12 && arcs[i].r0 < arcs[i - 1].r0, 'spiral runs inward');
  }
  assert.equal(arcs[0].r0, 146);
  assert.equal(arcs[4].r1, 58);
  assert.equal(arcs[0].width, 44);
  assert.deepEqual(arcs.map(a => a.cls), ['good', 'bad', 'interrupted', 'bad', 'degraded']);
  assert.deepEqual(arcs.map(a => a.hatch), [false, true, false, true, false]);
  assert.equal(arcs[2].color, null);
  assert.equal(arcs[0].color, QUALITY_COLOR_RAMP[4].color, 'SNR 32 dB is top of the ramp');
  assert.equal(arcs[1].color, QUALITY_COLOR_RAMP[0].color, 'SNR 10 dB is bottom of the ramp');
  const phase = binsToArcs(bins, { durationSec: 10 }, 'phase');
  assert.equal(phase[3].value, 30);
  assert.ok(phase[3].q < phase[0].q);
  const drops = binsToArcs(bins, {}, 'dropouts');
  assert.deepEqual(drops.map(a => a.value), [0, 0, 0, 0, 1]);
  assert.equal(drops[4].r1, 58, 'duration defaults to the end of the last bin');
  assert.throws(() => binsToArcs(bins, {}, 'level'), /Unknown metric/);
  assert.deepEqual(binsToArcs([], {}), []);
  assert.equal(metricQuality(bin(0, { dropouts: 5 }), 'dropouts').q, 0);
});

test('colour ramp is sequential: lightness rises monotonically from worst to best', () => {
  const lum = hex => { const [r, g, b] = [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  let prev = -1;
  for (let q = 0; q <= 1.0001; q += 0.05) { const L = lum(qualityColor(q)); assert.ok(L > prev, `q ${q.toFixed(2)}`); prev = L; }
  assert.equal(qualityColor(0), '#00224e');
  assert.equal(qualityColor(1), '#fee838');
  assert.equal(qualityColor(-3), '#00224e');
  assert.equal(qualityColor(null), null);
});

test('keyboard focus announcement and time formatting', () => {
  assert.equal(binLabel(bin(412, { tSec: 860, snrDb: 27.4 })), 'Bin 412, 14:20, SNR 27 dB');
  assert.equal(binLabel(bin(3, { tSec: 6, phaseErrDeg: 12.6 }), 'phase'), 'Bin 3, 0:06, phase error 13 deg');
  assert.equal(binLabel(bin(3, { dropouts: 1 }), 'dropouts'), 'Bin 3, 0:06, 1 dropout');
  assert.equal(binLabel(bin(3, { flags: FLAGS.interrupted })), 'Bin 3, 0:06, interrupted');
  assert.equal(formatTime(3725), '1:02:05');
  assert.equal(formatTime(NaN), '--:--');
});

// ------------------------------------------------------------------ records, store, streaming driver

const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/wearmap.json', import.meta.url), 'utf8'));

test('toScanRecord builds a valid wearmap_save record from a scan', () => {
  const sig = tc('Serato CV02.5', { seconds: 6, dropouts: [[0, 0.3], [3.2, 3.3]], seed: 30 });
  const result = scan(sig, 'Serato CV02.5').result;
  const v = verdict(result.bins, { sideLabel: 'A', coverage: scanCoverage(result, { sideDurationSec: 712 }).coverage });
  const rec = toScanRecord(result, v, { recordSideId: 'side-a', sideLabel: 'A', sideDurationSec: 712, stylusAssetId: 'stylus-1' });
  assert.deepEqual(Object.keys(rec).sort(), Object.keys(CONTRACT.wearmap_save.request.scan).sort());
  assert.deepEqual(Object.keys(rec.bins[0]).sort(), Object.keys(CONTRACT.wearmap_save.request.scan.bins[0]).sort());
  assert.equal(rec.coverage, round(4 / 712));
  assert.equal(rec.summary.fromNeedleDrop, true);
  assert.equal(rec.summary.envelope.db.length, 6);
  assert.equal(rec.summary.message, v.message);
  assert.deepEqual(rec.geometry, DEFAULT_GEOMETRY);
  assert.equal(rec.bins[1].dropouts, 1);
  // saved scans compare like fresh ones (summary carries the envelope and needle drop)
  assert.equal(alignScans(rec, rec).offsetSec, 0);
});

test('validateScanRecord mirrors the Rust rules', () => {
  const ok = CONTRACT.wearmap_save.request.scan;
  assert.equal(validateScanRecord(ok), ok);
  const bad = patch => () => validateScanRecord({ ...ok, ...patch });
  assert.throws(bad({ format: ' ' }), /format/);
  assert.throws(bad({ recordSideId: '' }), /record side/);
  assert.throws(bad({ binSec: 0.5 }), /binSec/);
  assert.throws(bad({ coverage: 1.01 }), /coverage/);
  assert.throws(bad({ verdict: 'fine' }), /verdict/);
  assert.throws(bad({ score: 101 }), /score/);
  assert.throws(bad({ summary: [] }), /summary/);
  assert.throws(bad({ bins: [bin(0), bin(0)] }), /twice/);
  assert.throws(bad({ bins: [bin(0, { phaseErrDeg: 181 })] }), /phaseErrDeg/);
  assert.throws(bad({ bins: [bin(0, { tSec: 7201 })] }), /tSec/);
  assert.throws(bad({ bins: [bin(0, { flags: 8 })] }), /flags/);
  assert.throws(bad({ bins: [bin(0, { dropouts: 1.5 })] }), /dropouts/);
  assert.throws(bad({ bins: Array.from({ length: 5001 }, (_, i) => bin(i, { tSec: i })) }), /at most 5000/);
  assert.doesNotThrow(bad({ bins: [bin(0, { snrDb: null, phaseErrDeg: null, balanceDb: null, levelDbfs: null })] }));
});

test('bridge sends the contract argument names', async () => {
  const calls = [];
  const replies = Object.fromEntries(['wearmap_save', 'wearmap_list', 'wearmap_get', 'wearmap_delete'].map(k => [k, CONTRACT[k].response]));
  const api = createWearMapApi({ invoke: async (cmd, args) => { calls.push([cmd, args]); return replies[cmd]; } });
  assert.equal(api.native, true);
  assert.deepEqual(await api.save(CONTRACT.wearmap_save.request.scan), CONTRACT.wearmap_save.response);
  await api.list(CONTRACT.wearmap_list.request);
  assert.deepEqual(await api.get(CONTRACT.wearmap_get.request.id), CONTRACT.wearmap_get.response);
  await api.delete(CONTRACT.wearmap_delete.request.id);
  assert.deepEqual(calls, [
    ['wearmap_save', CONTRACT.wearmap_save.request], ['wearmap_list', CONTRACT.wearmap_list.request],
    ['wearmap_get', CONTRACT.wearmap_get.request], ['wearmap_delete', CONTRACT.wearmap_delete.request],
  ]);
  await api.list();
  assert.deepEqual(calls.at(-1), ['wearmap_list', { recordSideId: null, limit: null }]);
  await assert.rejects(api.save({ ...CONTRACT.wearmap_save.request.scan, verdict: 'great' }), /verdict/);
  assert.equal(calls.length, 5, 'invalid scans never reach Rust');
});

test('browser-mode store keeps scans in localStorage with the same shapes', async () => {
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  let n = 0;
  const api = createWearMapApi({ invoke: null, storage, now: () => '2026-10-10T20:00:00.000Z', newId: () => `id-${++n}` });
  assert.equal(api.native, false);
  const scanRec = CONTRACT.wearmap_save.request.scan;
  const saved = await api.save(scanRec);
  const { id: _i, createdAt: _c, ...want } = CONTRACT.wearmap_save.response;
  const { id, createdAt, ...got } = saved;
  assert.equal(id, 'id-1');
  assert.equal(createdAt, '2026-10-10T20:00:00.000Z');
  assert.deepEqual(got, want);
  await api.save({ ...scanRec, recordSideId: 'side-b' });
  assert.equal((await api.list()).length, 2);
  assert.deepEqual((await api.list({ recordSideId: 'side-a' })).map(s => s.id), ['id-1']);
  const detail = await api.get('id-1');
  assert.deepEqual(detail.bins, scanRec.bins);
  assert.equal(detail.binCount, 3);
  assert.equal(await api.delete('id-1'), true);
  assert.equal(await api.delete('id-1'), false);
  assert.equal(await api.get('id-1'), null);
  mem.set('deckchek.wearmap.v1', '{not json');
  assert.deepEqual(await api.list(), []);
  assert.deepEqual(await createWearMapApi({ invoke: null, storage: null }).list(), []);
});

test('startWearScan drives the scanner from the stream channel with autosave', async () => {
  const sig = tc('Serato CV02.5', { seconds: 35, dropouts: [[13.2, 13.25]], seed: 31 });
  let opts = null;
  const fakeStart = async o => {
    opts = o;
    return {
      info: { streamId: 1 },
      async stop() { o.onEnd?.({ reason: 'stopped', summary: { blocksSent: 35 } }); return { blocksSent: 35 }; },
    };
  };
  const saves = [], progress = [], ends = [];
  let binsSeen = 0;
  const run = await startWearScan({ startStreamSession: fakeStart, format: 'Serato CV02.5', deviceName: 'Audio 8', onBin: () => binsSeen++, onProgress: p => progress.push(p), onAutosave: s => saves.push(s), onEnd: e => ends.push(e.reason) });
  assert.equal(opts.holder, 'wear-map');
  assert.equal(opts.deviceName, 'Audio 8');
  assert.equal(opts.blockMs, 1000);
  assert.equal(run.snapshot(), null);
  for (let k = 0; k < 35; k++) {
    await opts.onBlock({ seq: k, sampleRate: SR, frames: SR, left: sig.left.subarray(k * SR, (k + 1) * SR), right: sig.right.subarray(k * SR, (k + 1) * SR), quality: { droppedBlocks: 0, overrunSamples: 0, discontinuity: false, final: false } });
  }
  assert.equal(run.elapsedSec(), 35);
  assert.equal(saves.length, 1, 'one autosave after 30 s of capture');
  assert.equal(saves[0].bins.length, 15);
  assert.equal(saves[0].finished, false);
  assert.equal(progress.at(-1).elapsedSec, 35);
  const result = await run.stop();
  assert.deepEqual(ends, ['stopped']);
  assert.equal(result.bins.length, 18);
  assert.equal(binsSeen, 18);
  assert.equal(result.bins[6].dropouts, 1);
  assert.equal(run.error, null);
  await assert.rejects(startWearScan({ format: 'Serato CV02.5' }), /startStreamSession/);
  await assert.rejects(startWearScan({ startStreamSession: fakeStart, format: 'Nope' }), /Unknown timecode format/);
});

test('defaults match the spec values', () => {
  const d = WEAR_DEFAULTS;
  assert.deepEqual([d.binSec, d.minBinSec, d.maxBinSec, d.windowSec, d.dropoutDb, d.lockLostErrorPct], [2, 1, 5, 0.1, 12, 20]);
  const t = VERDICT_THRESHOLDS;
  assert.deepEqual([t.keepBadPct, t.keepDegradedPct, t.watchBadPct, t.watchDegradedPct, t.otherSideBadPct, t.otherSideCleanBadPct, t.replaceBadPct, t.trendPointsPerScan, t.trendScans],
    [1, 5, 3, 15, 3, 1, 10, 3, 3]);
  assert.deepEqual(FLAGS, { interrupted: 1, speedShift: 2, clip: 4 });
  assert.ok(TIMECODE_FORMATS.length > 0);
});

test('FS-13 AC-7: bins carry a compact scope snippet, old snippets are dropped, drafts never store them', async () => {
  const { scopeEnvelope, createScanner, SCOPE_COLS, SCOPE_KEEP_BINS } = await import('../app/wear-map.js');
  const { saveDraft } = await import('../app/ui/workflows/wearmap.js');
  const l = Float32Array.from({ length: 1200 }, (_, i) => Math.sin(i / 20) * 0.5), r = Float32Array.from({ length: 1200 }, () => 0.25);
  const env = scopeEnvelope(l, r, 1200);
  assert.equal(env.cols, SCOPE_COLS); assert.equal(env.l.length, SCOPE_COLS * 2); assert.equal(env.r.length, SCOPE_COLS * 2);
  assert.ok(env.l.every(v => v >= -127 && v <= 127)); assert.ok(Math.max(...env.l) >= 60);
  assert.deepEqual(new Set(env.r), new Set([32]));
  assert.equal(scopeEnvelope(l, r, 50), null, 'too short for a picture');
  const sr = 8000, sc = createScanner({ format: 'Serato CV02.5', sampleRate: sr, binSec: 1 });
  const tone = Float32Array.from({ length: sr }, (_, i) => Math.sin(2 * Math.PI * 1000 * i / sr) * 0.4);
  for (let k = 0; k < 3; k++) sc.push(tone, tone);
  assert.ok(sc.bins.every(b => b.scope && b.scope.cols === SCOPE_COLS));
  assert.ok(SCOPE_KEEP_BINS >= 600, 'a 20 minute side at 2 s bins keeps every snippet');
  const mem = new Map(); const storage = { setItem: (k, v) => mem.set(k, v), getItem: k => mem.get(k) };
  assert.ok(saveDraft(storage, { recordSideId: 's', format: 'f', result: { bins: sc.bins } }));
  assert.ok(![...mem.values()][0].includes('"scope"'));
});
