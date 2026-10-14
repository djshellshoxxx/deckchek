// Mains strobe helper (FS-30 §6). Pure functions; the screen only draws.
//
// A lamp on mains flickers at 2 x the mains frequency. A strobe disc looks stationary when the dots passing per
// second equal the flicker rate, so dots = flickerHz * 60 / rpm. The phone screen cannot sync to room lighting,
// so the on-screen mode pulses at its own clock and reports the systematic error of the nearest achievable rate.

export const MAINS = [50, 60];
export const RPMS = [{ id: '33', label: '33 1/3', rpm: 100 / 3 }, { id: '45', label: '45', rpm: 45 }];

export const flickerHz = mains => mains * 2;
export const dotsPerRevolution = (mains, rpm) => flickerHz(mains) * 60 / rpm;

/** The four rows of a typical strobe disc, in printed order: [{mains, rpmId, rpmLabel, dots, exact}]. */
export function dotsTable() {
  const rows = [];
  for (const rpm of RPMS) {
    for (const mains of [60, 50]) {
      const dots = dotsPerRevolution(mains, rpm.rpm);
      rows.push({ mains, rpmId: rpm.id, rpmLabel: rpm.label, dots: Number(dots.toFixed(1)), exact: Math.abs(dots - Math.round(dots)) < 0.05 });
    }
  }
  return rows;
}

/**
 * Nearest achievable pulse pattern on a display refreshing at `refreshHz`: one bright frame in every `n` (n >= 2) gives
 * pulseHz = refreshHz / n, and the disc looks still when its dot rate is k x pulseHz (k a whole number, a harmonic).
 * Returns {n, k, pulseHz, effectiveHz, errorPct}; errorPct is (effective / wanted - 1) * 100.
 */
export function strobePlan(wantedHz, refreshHz, { maxN = 24 } = {}) {
  if (!(wantedHz > 0) || !(refreshHz > 0)) throw new RangeError('strobePlan needs positive rates');
  let best = null;
  for (let n = 2; n <= maxN; n++) { // n >= 2: a pulse needs at least one dark frame after it
    const pulseHz = refreshHz / n;
    const k = Math.max(1, Math.round(wantedHz / pulseHz));
    const effectiveHz = k * pulseHz;
    const errorPct = (effectiveHz / wantedHz - 1) * 100;
    if (!best || Math.abs(errorPct) < Math.abs(best.errorPct) - 1e-9) best = { n, k, pulseHz, effectiveHz, errorPct };
  }
  return best;
}

/** Display refresh in Hz from requestAnimationFrame timestamps (ms): the median frame gap. */
export function refreshFromTimestamps(stamps) {
  const gaps = [];
  for (let i = 1; i < stamps.length; i++) { const g = stamps[i] - stamps[i - 1]; if (g > 2 && g < 100) gaps.push(g); }
  if (gaps.length < 5) return null;
  gaps.sort((a, b) => a - b);
  return 1000 / gaps[Math.floor(gaps.length / 2)];
}

/** Plain-language line for a plan, including the systematic error (AC-3, §6). */
export function describePlan(plan, wantedHz) {
  const err = plan.errorPct;
  const quality = Math.abs(err) < 0.2 ? 'on target' : `about ${Math.abs(err).toFixed(1)} % ${err > 0 ? 'fast' : 'slow'}, so a still disc reads that much off`;
  return `Wanted ${wantedHz} flashes a second; the screen gives ${plan.effectiveHz.toFixed(2)} (a flash every ${plan.n} frame${plan.n > 1 ? 's' : ''}${plan.k > 1 ? `, disc still at every ${plan.k}th dot` : ''}): ${quality}.`;
}
