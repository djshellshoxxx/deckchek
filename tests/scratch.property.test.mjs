// Property test (plan §2): scratch velocity error < 3 % of peak at SNR 30 dB and exact reversal counts,
// over 200 seeded random cases (format incl. phaseSign -1, pattern, BPM, peak speed, level, L/R imbalance).
import test from 'node:test';
import assert from 'node:assert/strict';
import { quadratureTimecode, rng } from './fixtures/signals.mjs';
import { patternVelocity, truthReversals, meanVelocity } from './fixtures/scratch-patterns.mjs';
import { TIMECODE_FORMATS } from '../app/timecode.js';
import { instantVelocity, analyzeMotion, detectLockLoss, detectSkips } from '../app/scratch.js';

const CASES = 200, SEED = 0x5c1a7c4;
const PEAKS = { baby: [1, 3], transform: [0.8, 2], chirp: [1.5, 4] };

test(`${CASES} random scratch cases: velocity within 3 % of peak, reversal count exact, no false events`, () => {
  const r = rng(SEED), pick = a => a[Math.floor(r() * a.length)], lerp = (a, b) => a + (b - a) * r();
  let worst = 0;
  for (let i = 0; i < CASES; i++) {
    const fmt = pick(TIMECODE_FORMATS), pattern = pick(['baby', 'transform', 'chirp']), bpm = Math.round(lerp(60, 160));
    const peak = lerp(...PEAKS[pattern]), seconds = 1.6, lead = 0.1;
    const pv = patternVelocity(pattern, bpm, { peak, seconds }), vel = t => pv.velocity(t - lead);
    const imbalanceDb = lerp(-2, 2), amplitudeDbfs = lerp(-20, -3), seed = 1 + Math.floor(r() * 1e6);
    const sig = quadratureTimecode({ carrierHz: fmt.carrierHz, phaseSign: fmt.phaseSign, seconds: seconds + 2 * lead, velocityProfile: vel, snrDb: 30, imbalanceDb, amplitudeDbfs, seed });
    const label = `case ${i}: ${fmt.name} ${pattern} ${bpm} BPM peak ${peak.toFixed(2)} imb ${imbalanceDb.toFixed(2)} dB level ${amplitudeDbfs.toFixed(2)} dBFS seed ${seed}`;
    const tr = instantVelocity(sig, { format: fmt });
    const h = tr.winMs / 2000;
    let max = 0;
    for (let k = 0; k < tr.t.length; k++) {
      const t = tr.t[k];
      if (t - h < lead || t + h > lead + seconds) continue;
      max = Math.max(max, Math.abs(tr.v[k] - meanVelocity(vel, t - h, t + h)));
    }
    worst = Math.max(worst, max / peak);
    assert.ok(max / peak < 0.03, `${label}: velocity error ${(max / peak * 100).toFixed(2)} %`);
    const range = { fromSec: lead, toSec: lead + seconds + 0.05 };
    const m = analyzeMotion(tr, range);
    // truth on the window-averaged profile: a stroke cut off at the end may only reach movePeak unsmoothed
    const smooth = t => meanVelocity(vel, t - h, t + h);
    assert.equal(m.reversals.length, truthReversals(smooth, lead - 0.05, lead + seconds + 0.05, { dt: 2.5e-4 }).length, `${label}: reversals`);
    assert.equal(m.directionErrors.length, 0, `${label}: direction errors`);
    // the profile may end mid-stroke (an instant stop); judge events inside the performance only
    const inside = { fromSec: lead, toSec: lead + seconds };
    assert.deepEqual(detectLockLoss(tr, inside), [], `${label}: lock loss`);
    assert.deepEqual(detectSkips(tr, inside), [], `${label}: skips`);
  }
  assert.ok(worst > 0, 'cases ran');
});
