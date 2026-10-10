// FS-14 scratch stress test: velocity, reversal, lock-loss, direction-error and skip detection validated on
// synthetic baby / transform / chirp patterns with known ground truth, plus scoring, protocol/metronome,
// baseline gate, end-to-end analysis and the run-store bridge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quadratureTimecode, addNoise } from './fixtures/signals.mjs';
import { patternVelocity, sequence, truthReversals, meanVelocity } from './fixtures/scratch-patterns.mjs';
import { findFormat, directionSign } from '../app/timecode.js';
import {
  instantVelocity, analyzeMotion, detectReversals, detectLockLoss, detectDirectionErrors, detectSkips, scoreScratch,
  protocolTimeline, metronomeSchedule, clampMetronomeDbfs, createMetronome, baselineCheck, analyzeScratch, skipSafety,
  summarizeScratch, compareScores, toRunRecord, createScratchApi, PROTOCOL_V1, SCRATCH_DEFAULTS, EVENT_KINDS,
} from '../app/scratch.js';

const SR = 48000;
const LEAD = 0.2; // record held before the pattern starts
const FORMATS = ['Serato CV02.5', 'Traktor Scratch MK2', 'Traktor Scratch MK1', 'MixVibes 7"'];

/** One pattern played for `seconds`, preceded and followed by LEAD s of held record. */
function patternCapture(fmtName, pattern, bpm, { seconds = 6, snrDb = 30, seed = 1, peak, dropouts = [], phaseJumps = [], profile } = {}) {
  const fmt = findFormat(fmtName);
  const pv = patternVelocity(pattern, bpm, { seconds, peak });
  const vel = profile || (t => pv.velocity(t - LEAD));
  const sig = quadratureTimecode({ carrierHz: fmt.carrierHz, phaseSign: directionSign(fmt), seconds: seconds + 2 * LEAD, sampleRate: SR, velocityProfile: vel, snrDb, seed, dropouts, phaseJumps });
  return { sig, vel, fmt, peak: pv.peak, from: LEAD, to: LEAD + seconds };
}

function velocityError(trace, vel, from, to) {
  const h = trace.winMs / 2000;
  let se = 0, max = 0, n = 0;
  for (let k = 0; k < trace.t.length; k++) {
    const t = trace.t[k];
    if (t - h < from || t + h > to) continue;
    const e = trace.v[k] - meanVelocity(vel, t - h, t + h);
    se += e * e; max = Math.max(max, Math.abs(e)); n++;
  }
  return { rms: Math.sqrt(se / n), max, n };
}

test('velocity, reversals and clean-signal events on baby/transform/chirp across BPMs and formats (SNR 30 dB)', () => {
  for (const fmtName of FORMATS) for (const pattern of ['baby', 'transform', 'chirp']) for (const bpm of [70, 90, 120, 140]) {
    const c = patternCapture(fmtName, pattern, bpm, { seed: bpm + pattern.length });
    const label = `${fmtName} ${pattern} ${bpm} BPM`;
    const trace = instantVelocity(c.sig, { format: c.fmt });
    const err = velocityError(trace, c.vel, c.from, c.to);
    assert.ok(err.n > 2000, label);
    assert.ok(err.max / c.peak < 0.03, `${label}: max velocity error ${(err.max / c.peak * 100).toFixed(3)} % of peak`);
    assert.ok(err.rms / c.peak < 0.005, `${label}: rms velocity error ${(err.rms / c.peak * 100).toFixed(3)} %`);
    const range = { fromSec: c.from, toSec: c.to + 0.1 };
    const motion = analyzeMotion(trace, range);
    const truth = truthReversals(c.vel, c.from - 0.05, c.to + 0.1);
    assert.equal(motion.reversals.length, truth.length, `${label}: reversal count`);
    motion.reversals.forEach((r, i) => {
      assert.ok(Math.abs(r.tSec - truth[i].tSec) < 0.002, `${label}: reversal ${i} at ${r.tSec} vs ${truth[i].tSec}`);
      assert.ok(Math.abs(r.durationMs - truth[i].durationMs) < 3, `${label}: reversal ${i} duration ${r.durationMs} vs ${truth[i].durationMs}`);
      assert.equal(r.fromSign, truth[i].fromSign);
    });
    assert.ok(Math.abs(Math.abs(motion.peakVelocity) - c.peak) < 0.03 * c.peak, `${label}: peak ${motion.peakVelocity}`);
    assert.equal(motion.directionErrors.length, 0, `${label}: direction errors`);
    assert.deepEqual(detectLockLoss(trace, range), [], `${label}: lock loss`);
    assert.deepEqual(detectSkips(trace, range), [], `${label}: skips`);
  }
});

test('phaseSign: SWITCH_PHASE formats read forward as +1, and the wrong convention reads reverse', () => {
  for (const name of ['Traktor Scratch MK1', 'MixVibes DVS V2', 'Serato CV02.5']) {
    const fmt = findFormat(name);
    for (const v of [1, -1, 2.5, -0.5]) {
      const sig = quadratureTimecode({ carrierHz: fmt.carrierHz, phaseSign: directionSign(fmt), seconds: 0.5, velocityProfile: v, snrDb: 30 });
      const tr = instantVelocity(sig, { format: fmt });
      const med = [...tr.v].sort((a, b) => a - b)[tr.v.length >> 1];
      assert.ok(Math.abs(med - v) < 0.01 * Math.abs(v), `${name} v=${v}: ${med}`);
      const wrong = instantVelocity(sig, { format: { ...fmt, phaseSign: -fmt.phaseSign } });
      assert.ok(Math.abs([...wrong.v].sort((a, b) => a - b)[wrong.v.length >> 1] + v) < 0.01 * Math.abs(v));
    }
  }
});

test('velocity estimate is robust to L/R imbalance and reports per-channel SNR', () => {
  for (const snrDb of [40, 30, 20]) {
    const sig = quadratureTimecode({ carrierHz: 2500, seconds: 0.5, velocityProfile: 1.7, snrDb, imbalanceDb: 3 });
    const tr = instantVelocity(sig, { format: 'Traktor Scratch MK2' });
    const s = [...tr.snr].sort((a, b) => a - b), v = [...tr.v].sort((a, b) => a - b);
    assert.ok(Math.abs(v[v.length >> 1] - 1.7) < 0.005, `v ${v[v.length >> 1]}`);
    // the weaker channel sets the noise reference after orthonormalisation; within 2 dB of the nominal
    assert.ok(Math.abs(s[s.length >> 1] - snrDb) < 2.5, `snr ${s[s.length >> 1]} vs ${snrDb}`);
  }
  assert.throws(() => instantVelocity(quadratureTimecode({ seconds: 0.1 }), { format: 'Nope' }), /Unknown timecode format/);
});

test('realistic cartridge (output proportional to speed): reversals exact, no lock loss, errors or skips', () => {
  for (const pattern of ['baby', 'transform', 'chirp']) for (const bpm of [70, 90, 140]) {
    const label = `${pattern} ${bpm}`;
    const pv = patternVelocity(pattern, bpm, { seconds: 6 }), vel = t => pv.velocity(t - LEAD);
    const sig = quadratureTimecode({ carrierHz: 1000, seconds: 6.4, velocityProfile: vel, seed: bpm });
    for (const ch of [sig.left, sig.right]) for (let i = 0; i < ch.length; i++) ch[i] *= Math.abs(vel(i / SR));
    const ref = 10 ** (-6 / 20) / Math.SQRT2; // noise referred to the v = 1 level
    addNoise(sig.left, { snrDb: 30, refRms: ref, seed: 5 }); addNoise(sig.right, { snrDb: 30, refRms: ref, seed: 6 });
    const tr = instantVelocity(sig, { format: 'Serato CV02.5' });
    const range = { fromSec: LEAD, toSec: 6.2, baselineLevelDb: -9 }; // baseline = v=1 level (-6 dBFS peak)
    const m = analyzeMotion(tr, range), truth = truthReversals(vel, 0, 6.4);
    assert.equal(m.reversals.length, truth.length, label);
    if (pattern !== 'chirp') m.reversals.forEach((r, i) => assert.ok(Math.abs(r.tSec - truth[i].tSec) < 0.003, `${label} ${i}`));
    assert.equal(m.directionErrors.length, 0, label);
    assert.deepEqual(detectLockLoss(tr, range), [], label);
    assert.deepEqual(detectSkips(tr, range), [], label);
  }
});

test('injected dropouts are lock losses with duration +-5 ms and fast recovery', () => {
  for (const fmtName of ['Serato CV02.5', 'Traktor Scratch MK2']) for (const bpm of [90, 120]) {
    const beat = 60 / bpm;
    // centred on baby-scratch velocity peaks (|v| = 2), lengths 12, 30, 60 ms
    const spans = [[1, 12], [5, 30], [9, 60]].map(([q, ms]) => { const c = LEAD + (q + 0) * beat / 4 + beat; return [c - ms / 2000, c + ms / 2000, ms]; });
    const c = patternCapture(fmtName, 'baby', bpm, { dropouts: spans.map(([a, b]) => [a, b]), seed: 7 });
    const tr = instantVelocity(c.sig, { format: c.fmt });
    const losses = detectLockLoss(tr, { fromSec: c.from, toSec: c.to });
    assert.equal(losses.length, 3, `${fmtName} ${bpm}: ${JSON.stringify(losses)}`);
    losses.forEach((l, i) => {
      assert.ok(Math.abs(l.durationMs - spans[i][2]) <= 5, `duration ${l.durationMs} vs ${spans[i][2]}`);
      assert.ok(Math.abs(l.startSec - spans[i][0]) <= 0.005);
      assert.equal(l.cause, 'level');
      assert.ok(l.recoveryMs !== null && l.recoveryMs >= 0 && l.recoveryMs <= 10, `recovery ${l.recoveryMs}`);
      assert.ok(Math.abs(Math.abs(l.vBefore) - 2) < 0.2 && Math.abs(Math.abs(l.vAfter) - 2) < 0.2);
    });
    // the reversals are unaffected by the dropouts
    assert.equal(detectReversals(tr, { fromSec: c.from, toSec: c.to + 0.1 }).length, truthReversals(c.vel, 0, c.to + 0.1).length);
  }
});

test('lock-loss boundaries: minimum duration, merging and SNR-caused loss', () => {
  const c = patternCapture('Serato CV02.5', 'baby', 90, { dropouts: [[1.0, 1.006]], seed: 2 });
  assert.deepEqual(detectLockLoss(instantVelocity(c.sig, { format: c.fmt }), { fromSec: c.from, toSec: c.to }), [], '6 ms is below minLossMs');
  // two 15 ms drops 4 ms apart merge into one loss
  const m = patternCapture('Serato CV02.5', 'baby', 90, { dropouts: [[1.0, 1.015], [1.019, 1.034]], seed: 2 });
  const lm = detectLockLoss(instantVelocity(m.sig, { format: m.fmt }), { fromSec: m.from, toSec: m.to });
  assert.equal(lm.length, 1);
  assert.ok(Math.abs(lm[0].durationMs - 34) <= 5);
  // carrier buried in noise for 40 ms: SNR-caused loss (level stays up)
  const s = patternCapture('Serato CV02.5', 'baby', 90, { seed: 4 });
  const noisy = { ...s.sig, left: Float32Array.from(s.sig.left), right: Float32Array.from(s.sig.right) };
  const a = Math.round(1.6 * SR), b = Math.round(1.64 * SR);
  for (const ch of [noisy.left, noisy.right]) { const seg = ch.subarray(a, b); seg.fill(0); addNoise(seg, { snrDb: 0, refRms: 0.35, seed: ch === noisy.left ? 11 : 12 }); }
  const ls = detectLockLoss(instantVelocity(noisy, { format: 'Serato CV02.5' }), { fromSec: s.from, toSec: s.to, baselineLevelDb: -9 });
  assert.equal(ls.length, 1, JSON.stringify(ls));
  assert.equal(ls[0].cause, 'snr');
  assert.ok(Math.abs(ls[0].durationMs - 40) <= 7.5, `${ls[0].durationMs}`);
  // a record held still (no carrier on a real cartridge) is a near-stop, not lost lock
  const held = quadratureTimecode({ carrierHz: 1000, seconds: 2, velocityProfile: t => (t > 0.8 && t < 1.2 ? 0 : t < 0.8 ? 0.3 : -0.3), snrDb: 30 });
  for (const ch of [held.left, held.right]) ch.fill(0, Math.round(0.8 * SR), Math.round(1.2 * SR));
  assert.deepEqual(detectLockLoss(instantVelocity(held, { format: 'Serato CV02.5' }), { baselineLevelDb: -9 }), []);
});

test('an unrecovered loss reports recoveryMs null', () => {
  const c = patternCapture('Serato CV02.5', 'baby', 90, { seconds: 2, dropouts: [[1.5, 3]], seed: 3 });
  const l = detectLockLoss(instantVelocity(c.sig, { format: c.fmt }), {});
  assert.equal(l.length, 1);
  assert.equal(l[0].recoveryMs, null);
  assert.equal(l[0].vAfter, null);
});

test('direction errors: a short impossible flip during fast motion is one error, not two reversals', () => {
  for (const fmtName of ['Serato CV02.5', 'Traktor Scratch MK2', 'Traktor Scratch MK1']) for (const off of [0, 0.0007, 0.0013, 0.0019]) {
    const g0 = 0.6 + off, prof = t => (t >= g0 && t < g0 + 0.006 ? -2.2 : 2.2);
    const fmt = findFormat(fmtName);
    const sig = quadratureTimecode({ carrierHz: fmt.carrierHz, phaseSign: directionSign(fmt), seconds: 1.2, velocityProfile: prof, snrDb: 30, seed: 9 });
    const tr = instantVelocity(sig, { format: fmt });
    const m = analyzeMotion(tr);
    assert.equal(m.directionErrors.length, 1, `${fmtName} +${off}: ${JSON.stringify(m.directionErrors)}`);
    assert.equal(m.reversals.length, 0);
    const e = m.directionErrors[0];
    assert.ok(Math.abs(e.tSec - g0) < 0.006 && e.sustained === false && e.value < -0.5 && e.durationMs <= 10, JSON.stringify(e));
  }
  // a sustained impossible flip (+2 to -2 in 1 ms) is one sustained error
  const sig = quadratureTimecode({ carrierHz: 1000, seconds: 1, velocityProfile: t => (t < 0.5 ? 2 : t < 0.501 ? 2 - 4 * (t - 0.5) / 0.001 : -2), snrDb: 30 });
  const d = detectDirectionErrors(instantVelocity(sig, { format: 'Serato CV02.5' }));
  assert.equal(d.length, 1);
  assert.equal(d[0].sustained, true);
  assert.equal(d[0].durationMs, null);
  // the same reversal over 60 ms is a reversal, not an error
  const ok = quadratureTimecode({ carrierHz: 1000, seconds: 1, velocityProfile: t => (t < 0.47 ? 2 : t < 0.53 ? -2 * Math.sin(Math.PI * (t - 0.5) / 0.06) : -2), snrDb: 30 });
  const mo = analyzeMotion(instantVelocity(ok, { format: 'Serato CV02.5' }));
  assert.equal(mo.directionErrors.length, 0);
  assert.equal(mo.reversals.length, 1);
  assert.ok(Math.abs(mo.reversals[0].tSec - 0.5) < 0.001);
});

test('needle skips: phase jumps are flagged, smooth fast reversals and plain dropouts are not', () => {
  for (const fmtName of ['Serato CV02.5', 'Traktor Scratch MK2', 'Traktor Scratch MK1']) for (const bpm of [90, 140]) {
    const beat = 60 / bpm;
    const tA = LEAD + beat + beat / 4, tB = LEAD + 3 * beat + beat / 4; // velocity peaks
    // (a) jump in continuous signal; (b) 8 ms lift with a jump across it
    const c = patternCapture(fmtName, 'baby', bpm, { phaseJumps: [{ atSec: tA, deg: 135 }, { atSec: tB, deg: -150 }], dropouts: [[tB - 0.004, tB + 0.004]], seed: 5 });
    const tr = instantVelocity(c.sig, { format: c.fmt });
    const skips = detectSkips(tr, { fromSec: c.from, toSec: c.to }, c.sig);
    assert.equal(skips.length, 2, `${fmtName} ${bpm}: ${JSON.stringify(skips)}`);
    assert.ok(Math.abs(skips[0].tSec - tA) < 0.002 && Math.abs(skips[0].phaseJumpDeg - 135) < 15 && !skips[0].levelDrop, JSON.stringify(skips[0]));
    assert.ok(Math.abs(skips[1].tSec - tB) < 0.005 && Math.abs(skips[1].phaseJumpDeg + 150) < 20 && skips[1].levelDrop, JSON.stringify(skips[1]));
    assert.ok(skips[1].confidence > skips[0].confidence);
    // plain 8 ms dropout at the same place: no skip; fast chirp reversals at peak 4: no skip
    const d = patternCapture(fmtName, 'baby', bpm, { dropouts: [[tB - 0.004, tB + 0.004]], seed: 5 });
    assert.deepEqual(detectSkips(instantVelocity(d.sig, { format: d.fmt }), { fromSec: d.from, toSec: d.to }), []);
    const f = patternCapture(fmtName, 'chirp', bpm, { peak: 4, seed: 6 });
    assert.deepEqual(detectSkips(instantVelocity(f.sig, { format: f.fmt }), { fromSec: f.from, toSec: f.to }), []);
  }
  // a jump below the threshold is not a skip
  const small = patternCapture('Serato CV02.5', 'baby', 90, { phaseJumps: [{ atSec: 1.0, deg: 60 }], seed: 8 });
  assert.deepEqual(detectSkips(instantVelocity(small.sig, { format: small.fmt }), {}), []);
});

test('needle skip followed by an 8-20 Hz ringing burst is flagged with ringing and higher confidence', () => {
  // steady motion: the LF test looks at the audio, where a reversal's own low-frequency carrier would confound it
  const tA = 1.0, sig = quadratureTimecode({ carrierHz: 1000, seconds: 2, velocityProfile: 1.5, snrDb: 30, phaseJumps: [{ atSec: tA, deg: 135 }], seed: 12 });
  const plain = detectSkips(instantVelocity(sig, { format: 'Serato CV02.5' }), {}, sig);
  assert.equal(plain.length, 1);
  assert.equal(plain[0].ringing, false);
  assert.equal(detectSkips(instantVelocity(sig, { format: 'Serato CV02.5' }), {})[0].ringing, null, 'no capture, no ringing test');
  for (const ch of [sig.left, sig.right]) for (let i = Math.round(tA * SR); i < Math.round((tA + 0.25) * SR); i++) {
    const t = i / SR - tA; ch[i] += 0.05 * Math.exp(-t / 0.08) * Math.sin(2 * Math.PI * 12 * t);
  }
  const rung = detectSkips(instantVelocity(sig, { format: 'Serato CV02.5' }), {}, sig);
  assert.equal(rung.length, 1);
  assert.equal(rung[0].ringing, true);
  assert.ok(rung[0].confidence > plain[0].confidence);
});

test('skip safety: any skip warns, three skips stop the test', () => {
  assert.equal(skipSafety(0).level, 'ok');
  assert.equal(skipSafety(1).stop, false);
  assert.equal(skipSafety(2).level, 'warn');
  assert.equal(skipSafety(3).stop, true);
  assert.match(skipSafety(3).message, /tracking force/);
});

const PERFECT = { activeSec: 60, lossSec: 0, recoveryMs: [], reversals: 100, directionErrors: 0, medianSnrDb: 30, skips: 0 };

test('score: perfect run is 100, component boundaries and the skip cap', () => {
  const s = scoreScratch(PERFECT);
  assert.equal(s.score, 100);
  assert.deepEqual(Object.keys(s.components), ['continuity', 'recovery', 'direction', 'stability', 'skips']);
  assert.equal(Object.values(s.components).reduce((a, c) => a + c.max, 0), 100);
  const pts = (m, k) => scoreScratch({ ...PERFECT, ...m }).components[k].points;
  assert.equal(pts({ recoveryMs: [20] }, 'recovery'), 20);
  assert.ok(pts({ recoveryMs: [21] }, 'recovery') < 20);
  assert.ok(Math.abs(pts({ recoveryMs: [110] }, 'recovery') - 10) < 1e-9);
  assert.ok(pts({ recoveryMs: [199] }, 'recovery') > 0);
  assert.equal(pts({ recoveryMs: [200] }, 'recovery'), 0);
  assert.equal(pts({ recoveryMs: [null] }, 'recovery'), 0, 'unrecovered counts as worst');
  assert.equal(pts({ medianSnrDb: 25 }, 'stability'), 15);
  assert.ok(pts({ medianSnrDb: 24.9 }, 'stability') < 15);
  assert.equal(pts({ medianSnrDb: 15 }, 'stability'), 0);
  assert.equal(pts({ medianSnrDb: 15.1 }, 'stability') > 0, true);
  assert.equal(pts({ directionErrors: 25 }, 'direction'), 0);
  assert.ok(Math.abs(pts({ directionErrors: 10 }, 'direction') - 15) < 1e-9);
  assert.equal(pts({ directionErrors: 1, reversals: 0 }, 'direction'), 0);
  assert.equal(pts({ lossSec: 6 }, 'continuity'), 27);
  const sk = scoreScratch({ ...PERFECT, skips: 1 });
  assert.equal(sk.score, 60);
  assert.equal(sk.capped, true);
  assert.equal(scoreScratch({ ...PERFECT, skips: 1, lossSec: 60, recoveryMs: [500], medianSnrDb: 10, directionErrors: 50 }).score, 0);
  assert.equal(scoreScratch({}).score, 55, 'empty run: no active time (continuity 0), no SNR (stability 0)');
});

test('score is monotonic in every degradation', () => {
  const steps = {
    lossSec: [0, 0.5, 1, 5, 20, 60, 90],
    recoveryMs: [[], [5], [20], [30], [100], [199], [250], [null]],
    directionErrors: [0, 1, 3, 10, 25, 40],
    medianSnrDb: [40, 30, 25, 22, 18, 15, 5],
    skips: [0, 1, 3],
  };
  for (const [k, list] of Object.entries(steps)) {
    let prev = Infinity;
    for (const x of list) {
      const s = scoreScratch({ ...PERFECT, recoveryMs: k === 'lossSec' ? [] : PERFECT.recoveryMs, [k]: x }).score;
      assert.ok(s <= prev + 1e-9, `${k}=${JSON.stringify(x)}: ${s} > ${prev}`);
      prev = s;
    }
  }
  // combined: worsening any one metric of a random run never raises the score
  for (let i = 0; i < 50; i++) {
    const base = { activeSec: 60, lossSec: (i * 7) % 20, recoveryMs: [(i * 13) % 250], reversals: 80, directionErrors: i % 9, medianSnrDb: 14 + (i % 15), skips: 0 };
    const s0 = scoreScratch(base).score;
    for (const worse of [{ lossSec: base.lossSec + 1 }, { recoveryMs: [base.recoveryMs[0] + 10] }, { directionErrors: base.directionErrors + 1 }, { medianSnrDb: base.medianSnrDb - 1 }, { skips: 1 }]) {
      assert.ok(scoreScratch({ ...base, ...worse }).score <= s0, JSON.stringify({ base, worse }));
    }
  }
});

test('protocol timeline and metronome schedule are exact at 90 and 120 BPM', () => {
  for (const bpm of [90, 120]) {
    const beat = 60 / bpm, tl = protocolTimeline(bpm);
    assert.equal(tl.patterns.length, 3);
    assert.deepEqual(tl.patterns.map(p => p.id), ['baby', 'transform', 'chirp']);
    tl.patterns.forEach((p, i) => {
      const start = i * (4 * beat + 25);
      assert.ok(Math.abs(p.countInStart - start) < 1e-9 && Math.abs(p.performStart - (start + 4 * beat)) < 1e-9);
      assert.ok(Math.abs(p.performEnd - p.performStart - 20) < 1e-9 && Math.abs(p.restEnd - p.performEnd - 5) < 1e-9);
    });
    const clicks = metronomeSchedule(bpm);
    const per = Math.ceil(20 / beat - 1e-9);
    assert.equal(clicks.length, 3 * (4 + per));
    for (const p of tl.patterns) {
      const cs = clicks.filter(c => c.pattern === p.id);
      const ci = cs.filter(c => c.countIn), pb = cs.filter(c => !c.countIn);
      assert.deepEqual(ci.map(c => c.beat), [-4, -3, -2, -1]);
      ci.forEach((c, i) => assert.ok(Math.abs(c.tSec - (p.countInStart + i * beat)) < 1e-12));
      pb.forEach((c, i) => {
        assert.ok(Math.abs(c.tSec - (p.performStart + i * beat)) < 1e-12, `${bpm} ${p.id} beat ${i}`);
        assert.equal(c.beat, i);
        assert.equal(c.accent, i % 4 === 0);
      });
      assert.ok(pb.every(c => c.tSec < p.performEnd), 'no clicks in the rest');
    }
    // successive click spacing is exactly one beat inside each pattern
    const baby = metronomeSchedule(bpm, 'baby');
    assert.equal(baby[0].tSec, 0);
    for (let i = 1; i < baby.length; i++) assert.ok(Math.abs(baby[i].tSec - baby[i - 1].tSec - beat) < 1e-9);
  }
  assert.equal(metronomeSchedule(90).length, 3 * (4 + 30));
  assert.equal(metronomeSchedule(120).length, 3 * (4 + 40));
  assert.throws(() => metronomeSchedule(90, 'flare'), /Unknown pattern/);
  assert.throws(() => protocolTimeline(10), /BPM/);
  assert.equal(PROTOCOL_V1.v, 1);
  assert.equal(PROTOCOL_V1.bpm, 90);
});

function fakeAudio() {
  const log = [];
  const param = (name) => ({ value: 1, events: [], name,
    setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; },
    linearRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); this.value = v; },
    exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); },
    cancelScheduledValues(t) { this.events.push(['cancel', t]); } });
  const ctx = {
    currentTime: 0, destination: { name: 'dest' }, oscillators: [],
    createGain() { return { gain: param('gain'), connect() {}, disconnect() {} }; },
    createOscillator() { const o = { frequency: { value: 0 }, startAt: null, stopAt: [], connect() {}, start(t) { this.startAt = t; }, stop(t) { this.stopAt.push(t); } }; ctx.oscillators.push(o); return o; },
  };
  let fn = null;
  const timers = { setInterval(f) { fn = f; return 1; }, clearInterval() { fn = null; }, tick() { fn?.(); }, get active() { return !!fn; } };
  return { ctx, timers, log };
}

test('metronome: level clamp, look-ahead scheduling and Esc silence within 100 ms', () => {
  assert.equal(clampMetronomeDbfs(undefined), -24);
  assert.equal(clampMetronomeDbfs(0), -6);
  assert.equal(clampMetronomeDbfs(-6.01), -6.01);
  assert.equal(clampMetronomeDbfs(-200), -60);
  const { ctx, timers } = fakeAudio();
  const m = createMetronome({ audioContext: ctx, levelDbfs: 3, timers });
  const t0 = m.start(metronomeSchedule(120, 'baby'));
  assert.ok(m.running && timers.active);
  const scheduledEarly = ctx.oscillators.length;
  assert.ok(scheduledEarly >= 1 && scheduledEarly <= 1, 'only the clicks inside the 100 ms look-ahead are scheduled');
  for (let k = 1; k <= 40; k++) { ctx.currentTime = k * 0.025; timers.tick(); }
  assert.equal(ctx.oscillators.length, 3, 'clicks at 0, 0.5, 1.0 (+ lead) scheduled by t=1.0');
  assert.ok(Math.abs(ctx.oscillators[2].startAt - (t0 + 1.0)) < 1e-12);
  assert.ok(Math.abs(ctx.oscillators[1].startAt - (t0 + 0.5)) < 1e-12);
  ctx.currentTime = 1.03;
  m.stop();
  assert.ok(!m.running && !timers.active);
  for (const o of ctx.oscillators) assert.ok(o.stopAt.every(t => t <= 1.03 + 0.1), 'every click ends within 100 ms of Esc');
  assert.ok(ctx.oscillators.at(-1).stopAt.some(t => t <= 1.03 + 0.012));
  ctx.currentTime = 2; timers.tick();
  assert.equal(ctx.oscillators.length, 3, 'nothing scheduled after stop');
  // the master gain started at the clamped -6 dBFS and ramps to 0 within 10 ms
  const { ctx: c2, timers: t2 } = fakeAudio();
  const m2 = createMetronome({ audioContext: c2, levelDbfs: 3, timers: t2 });
  m2.start(metronomeSchedule(90));
  c2.currentTime = 0.5;
  m2.stop();
  // inspect via a new instance's master: re-create to capture the gain node
  const gains = [];
  const c3 = { ...c2, createGain() { const g = c2.createGain(); gains.push(g); return g; } };
  const m3 = createMetronome({ audioContext: c3, levelDbfs: -24, timers: fakeAudio().timers });
  const master = gains[0].gain;
  assert.ok(Math.abs(master.value - 10 ** (-24 / 20)) < 1e-12);
  m3.start([{ tSec: 0, accent: true }]);
  c3.currentTime = 0.75;
  m3.setMuted(true);
  assert.ok(m3.muted);
  assert.deepEqual(master.events.at(-1), ['ramp', 0, 0.76]);
  m3.stop();
  assert.deepEqual(master.events.at(-1), ['ramp', 0, 0.76]);
  assert.throws(() => createMetronome({}), /AudioContext/);
});

test('baseline gate refuses below 25 dB, with no signal, or with the platter not playing', () => {
  const ok = quadratureTimecode({ carrierHz: 1000, seconds: 3, snrDb: 30 });
  const g = baselineCheck(ok, { format: 'Serato CV02.5' });
  assert.equal(g.ok, true, JSON.stringify(g.reasons));
  assert.ok(Math.abs(g.snrDb - 30) < 2);
  assert.ok(g.levelDb < -8 && g.levelDb > -10);
  const low = baselineCheck(quadratureTimecode({ carrierHz: 1000, seconds: 3, snrDb: 20 }), { format: 'Serato CV02.5' });
  assert.equal(low.ok, false);
  assert.deepEqual(low.reasons.map(r => r.id), ['low-snr']);
  assert.match(low.reasons[0].action, /stylus/);
  const edge = baselineCheck(quadratureTimecode({ carrierHz: 2500, seconds: 3, snrDb: 27 }), { format: 'Traktor Scratch MK2' });
  assert.equal(edge.ok, true, `27 dB passes (${edge.snrDb})`);
  const silent = baselineCheck({ left: new Float32Array(SR * 3), right: new Float32Array(SR * 3), sampleRate: SR }, { format: 'Serato CV02.5' });
  assert.equal(silent.ok, false);
  assert.ok(silent.reasons.some(r => r.id === 'no-signal' || r.id === 'low-snr'));
  const rev = baselineCheck(quadratureTimecode({ carrierHz: 1000, seconds: 3, snrDb: 30, velocityProfile: -1 }), { format: 'Serato CV02.5' });
  assert.deepEqual(rev.reasons.map(r => r.id), ['not-playing']);
  const mv = baselineCheck(quadratureTimecode({ carrierHz: 1300, phaseSign: -1, seconds: 3, snrDb: 30 }), { format: 'MixVibes DVS V2' });
  assert.equal(mv.ok, true, 'phaseSign -1 forward passes');
});

/** Full protocol capture: each pattern performed in its window, count-in and rests held still. */
function protocolCapture({ bpm = 120, fmtName = 'Serato CV02.5', startSec = 1, upToSec = null, dropouts = [], phaseJumps = [] } = {}) {
  const fmt = findFormat(fmtName), tl = protocolTimeline(bpm, { startSec });
  const parts = tl.patterns.map(p => ({ fn: patternVelocity(p.id, bpm, { seconds: 20 }).velocity, from: p.performStart, to: p.performEnd }));
  const vel = sequence(parts);
  const seconds = upToSec ?? startSec + tl.totalSec;
  const sig = quadratureTimecode({ carrierHz: fmt.carrierHz, phaseSign: directionSign(fmt), seconds, velocityProfile: vel, snrDb: 30, seed: 21, dropouts, phaseJumps });
  return { sig, vel, tl, fmt };
}

test('end-to-end protocol analysis at 120 BPM: per-pattern events, score, summary and run record', () => {
  const beat = 0.5, base = protocolTimeline(120, { startSec: 1 });
  const chirp = base.patterns[2], baby = base.patterns[0];
  const drop = baby.performStart + 4 * beat + beat / 4; // baby velocity peak
  const skipAt = chirp.performStart + 2 * beat + beat / 8; // middle of a forward stab
  const { sig, vel, tl } = protocolCapture({ dropouts: [[drop - 0.015, drop + 0.015]], phaseJumps: [{ atSec: skipAt, deg: 140 }] });
  const r = analyzeScratch(sig, { format: 'Serato CV02.5', bpm: 120, startSec: 1, baseline: { levelDb: -9 } });
  assert.equal(r.completed, true);
  assert.equal(r.patterns.length, 3);
  for (const p of r.patterns) {
    const seg = tl.patterns.find(x => x.id === p.id);
    const truth = truthReversals(vel, seg.performStart - 0.01, seg.performEnd);
    assert.equal(p.reversals.length, truth.length, `${p.id} reversals`);
    assert.equal(p.directionErrors.length, 0);
  }
  assert.equal(r.lockLosses, 1);
  assert.ok(Math.abs(r.longestLossMs - 30) <= 5);
  assert.equal(r.patterns[0].lockLosses.length, 1);
  assert.equal(r.skips, 1);
  assert.equal(r.patterns[2].skips.length, 1);
  assert.equal(r.capped, true);
  assert.ok(r.score <= 60 && r.score > 50, `score ${r.score}`);
  assert.equal(r.safety.level, 'warn');
  assert.equal(r.reversals, r.patterns.reduce((s, p) => s + p.reversals.length, 0));
  assert.ok(Math.abs(Math.abs(r.peakVelocity) - 3) < 0.15); // the skip window reads slightly fast
  assert.match(r.summary, /^Lock lost once \(longest \d+ ms\)\. Recovery \d+ ms median\. Needle skipped once at \d:\d\d - check tracking force\.$/);
  const kinds = new Set(r.events.map(e => e.kind));
  for (const k of ['reversal', 'lock_loss', 'recovery', 'skip']) assert.ok(kinds.has(k), k);
  assert.ok(r.events.every(e => EVENT_KINDS.includes(e.kind) && Number.isFinite(e.tMs)));
  const rec = toRunRecord(r, { cartridgeAssetId: 'cart-1', trackingForceG: 3 });
  assert.equal(rec.events.length, r.events.length);
  assert.equal(rec.cartridgeAssetId, 'cart-1');
  assert.equal(rec.completed, true);
  assert.equal(rec.protocolVersion, 1);
  assert.deepEqual(Object.keys(rec.components), ['continuity', 'recovery', 'direction', 'stability', 'skips']);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(rec)));
});

test('aborted run is partial and scored from completed patterns only', () => {
  const tl = protocolTimeline(120, { startSec: 1 });
  const { sig } = protocolCapture({ upToSec: tl.patterns[1].performStart + 5 });
  const r = analyzeScratch(sig, { format: 'Serato CV02.5', bpm: 120, startSec: 1 });
  assert.equal(r.completed, false);
  assert.deepEqual(r.patterns.map(p => p.id), ['baby']);
  assert.equal(r.score, 100);
  assert.match(r.summary, /aborted/);
  const none = analyzeScratch({ left: sig.left.subarray(0, SR * 3), right: sig.right.subarray(0, SR * 3), sampleRate: SR }, { format: 'Serato CV02.5', bpm: 120, startSec: 1 });
  assert.equal(none.score, null);
  assert.equal(none.patterns.length, 0);
});

test('summary copy and repeat-run comparison', () => {
  const r = { lockLosses: 3, longestLossMs: 42.2, medianRecoveryMs: 18.4, directionErrors: 0, skips: 1, completed: true, patterns: [{ skips: [{ tSec: 72.3 }] }] };
  assert.equal(summarizeScratch(r), 'Lock lost 3 times (longest 42 ms). Recovery 18 ms median. Needle skipped once at 1:12 - check tracking force.');
  assert.equal(summarizeScratch({ lockLosses: 0, directionErrors: 2, skips: 0, completed: true, patterns: [] }), 'Lock held throughout. 2 direction errors.');
  const same = compareScores([80, 82, 81], [81, 83, 80]);
  assert.equal(same.withinNoise, true);
  assert.match(same.note, /within run-to-run noise/);
  const diff = compareScores([60, 61, 60], [80, 81, 80]);
  assert.equal(diff.withinNoise, false);
  assert.ok(Math.abs(diff.delta - 20) < 1e-9);
  assert.equal(compareScores([80], [90]).withinNoise, null);
});

test('defaults match the spec values', () => {
  const d = SCRATCH_DEFAULTS;
  assert.deepEqual([d.winMs, d.hopMs, d.v0, d.movePeak, d.errorSpeed, d.errorHops], [5, 2.5, 0.1, 0.3, 0.5, 2]);
  assert.deepEqual([d.lostSnrDb, d.dropDb, d.minLossMs, d.recoverSnrDb, d.stableMs], [10, 12, 10, 20, 20]);
  assert.deepEqual([d.skipDropDb, d.skipMinDropMs, d.skipMaxDropMs, d.baselineMinSnrDb, d.skipStopCount], [20, 2, 50, 25, 3]);
  assert.deepEqual([d.metronomeDbfs, d.metronomeMaxDbfs], [-24, -6]);
});

const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/scratch.json', import.meta.url), 'utf8'));

test('bridge sends the contract argument names', async () => {
  const calls = [];
  const replies = { scratch_save: CONTRACT.scratch_save.response, scratch_list: CONTRACT.scratch_list.response, scratch_get: CONTRACT.scratch_get.response, scratch_delete: CONTRACT.scratch_delete.response };
  const api = createScratchApi({ invoke: async (cmd, args) => { calls.push([cmd, args]); return replies[cmd]; } });
  assert.equal(api.native, true);
  assert.deepEqual(await api.save(CONTRACT.scratch_save.request.run), CONTRACT.scratch_save.response);
  await api.list(CONTRACT.scratch_list.request.filter);
  await api.get(CONTRACT.scratch_get.request.id);
  await api.delete(CONTRACT.scratch_delete.request.id);
  assert.deepEqual(calls, [
    ['scratch_save', CONTRACT.scratch_save.request], ['scratch_list', CONTRACT.scratch_list.request],
    ['scratch_get', CONTRACT.scratch_get.request], ['scratch_delete', CONTRACT.scratch_delete.request],
  ]);
  await assert.rejects(api.save({ ...CONTRACT.scratch_save.request.run, bpm: 5 }), /BPM/);
  await assert.rejects(api.save({ ...CONTRACT.scratch_save.request.run, events: [{ kind: 'scratch' }] }), /event kind/);
  await assert.rejects(api.save({ ...CONTRACT.scratch_save.request.run, score: 101 }), /score/);
});

test('browser-mode store keeps runs in localStorage with the same shapes', async () => {
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  let n = 0;
  const api = createScratchApi({ invoke: null, storage, now: () => '2026-10-10T20:00:00.000Z', newId: () => `id-${++n}` });
  assert.equal(api.native, false);
  const run = CONTRACT.scratch_save.request.run;
  const saved = await api.save(run);
  assert.equal(saved.id, 'id-1');
  assert.equal(saved.eventCount, run.events.length);
  await api.save({ ...run, cartridgeAssetId: 'other' });
  assert.equal((await api.list()).length, 2);
  assert.deepEqual((await api.list({ cartridgeAssetId: run.cartridgeAssetId })).map(r => r.id), ['id-1']);
  const got = await api.get('id-1');
  assert.equal(got.run.score, run.score);
  assert.equal(got.events.length, run.events.length);
  assert.equal(got.events[0].runId, 'id-1');
  assert.equal(await api.delete('id-1'), true);
  assert.equal(await api.delete('id-1'), false);
  assert.equal(await api.get('id-1'), null);
  mem.set('deckchek.scratch.v1', '{not json');
  assert.deepEqual(await api.list(), []);
  const noStore = createScratchApi({ invoke: null, storage: null });
  assert.deepEqual(await noStore.list(), []);
});

test('direction uses the primary channel as well as the phase switch (Traktor MK1 reads forward as +1, not backwards)', () => {
  const mk1 = findFormat('Traktor Scratch MK1');
  assert.equal(mk1.primary, 'left'); assert.equal(mk1.phaseSign, -1); assert.equal(directionSign(mk1), 1);
  const median = tr => [...tr.v].sort((a, b) => a - b)[tr.v.length >> 1];
  // forward play on MK1: right leads left, the same relation as a plain format
  const fwd = quadratureTimecode({ carrierHz: mk1.carrierHz, phaseSign: 1, seconds: 0.5, velocityProfile: 1, snrDb: 30 });
  assert.ok(Math.abs(median(instantVelocity(fwd, { format: mk1 })) - 1) < 0.01);
  assert.equal(instantVelocity(fwd, { format: mk1 }).phaseSign, 1);
  // the old phaseSign-only reading would have called the same signal backwards
  assert.ok(Math.abs(median(instantVelocity(fwd, { format: { ...mk1, primary: 'right' } })) + 1) < 0.01);
  // a left-primary format with a plain phase switch is inverted the other way
  const leftPrimary = { ...mk1, phaseSign: 1 };
  assert.equal(directionSign(leftPrimary), -1);
  assert.ok(Math.abs(median(instantVelocity(fwd, { format: leftPrimary })) + 1) < 0.01);
});

test('groupScratchRuns separates cartridge, setup and control-vinyl side (FS-14 AC-6)', async () => {
  const { groupScratchRuns, toRunRecord } = await import('../app/scratch.js');
  const run = (o) => ({ completed: true, score: 80, format: 'Serato CV02.5', bpm: 90, cartridgeAssetId: 'c1', setupId: null, recordSideId: null, ...o });
  const runs = [run({}), run({ score: 82 }), run({ recordSideId: 's1' }), run({ recordSideId: 's2' }), run({ setupId: 'u1' }), run({ completed: false }), run({ score: null })];
  const groups = groupScratchRuns(runs, { cartridge: () => 'Ortofon', setup: id => `Setup ${id}`, side: id => `Side ${id}` });
  assert.equal(groups.length, 4);
  assert.deepEqual(groups[0].scores, [80, 82]);
  assert.match(groups[1].label, /Side s1/);
  assert.match(groups[3].label, /Setup u1/);
  assert.notEqual(groups[1].key, groups[2].key);
  const rec = toRunRecord({ format: 'Serato CV02.5', bpm: 90, protocolVersion: 1, completed: true, score: 80, events: [] }, { setupId: 'u1', recordSideId: 's1', cartridgeAssetId: 'c1' });
  assert.equal(rec.setupId, 'u1'); assert.equal(rec.recordSideId, 's1');
});
