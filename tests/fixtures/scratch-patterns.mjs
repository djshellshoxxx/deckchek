// Synthetic scratch-pattern velocity profiles with exact ground truth (FS-14 §8). Each pattern is a
// smooth hand-motion model v(t) in units of nominal platter speed (+1 = normal forward); feed it to
// signals.mjs quadratureTimecode({velocityProfile}) to get the timecode a cartridge would see. Truth
// (reversal times, durations) is derived from the analytic profile, independently of app/scratch.js.
//
//  baby      1 forward + 1 back per beat: v = peak * sin(2 pi t / beat).
//  transform long strokes, one direction per beat: plateau at +-peak with raised-cosine turns
//            (the crossfader gates the sound, not the timecode, so only the record motion matters).
//  chirp     per half-note: a fast forward stab and a fast back stab (sin^2 pulses, 1/4 beat each),
//            then the record rests (v = 0) until the next half-note: reversals pass through a stop.

const TAU = 2 * Math.PI;

/** Motion model for one pattern at a BPM. Returns { velocity(t), beatSec, peak }. v is 0 outside [0, seconds). */
export function patternVelocity(pattern, bpm, { peak, seconds = Infinity } = {}) {
  const beat = 60 / bpm;
  let f;
  if (pattern === 'baby') {
    const p = peak ?? 2;
    f = t => p * Math.sin(TAU * t / beat);
  } else if (pattern === 'transform') {
    const p = peak ?? 1.4, turn = 0.3 * beat; // raised-cosine turn centred on each beat boundary
    f = t => {
      const k = Math.floor(t / beat + 0.5), d = t - k * beat; // distance from the nearest beat boundary
      const sideAfter = k % 2 === 0 ? 1 : -1; // direction of the stroke that starts at boundary k
      if (Math.abs(d) >= turn / 2) return (Math.floor(t / beat) % 2 === 0 ? 1 : -1) * p;
      if (k === 0) return d < 0 ? 0 : p * Math.sin(Math.PI * d / turn); // start from rest
      return sideAfter * p * Math.sin(Math.PI * d / turn);
    };
  } else if (pattern === 'chirp') {
    const p = peak ?? 3, cycle = 2 * beat, stab = beat / 4;
    f = t => {
      const u = t - Math.floor(t / cycle) * cycle;
      if (u < stab) return p * Math.sin(Math.PI * u / stab) ** 2;
      if (u < 2 * stab) return -p * Math.sin(Math.PI * (u - stab) / stab) ** 2;
      return 0;
    };
  } else throw new Error(`unknown pattern ${pattern}`);
  return { velocity: t => (t < 0 || t >= seconds ? 0 : f(t)), beatSec: beat, peak: peak ?? { baby: 2, transform: 1.4, chirp: 3 }[pattern] };
}

/** Concatenate profiles: [{fn, from, to}] with times in seconds; outside every span v = 0 (record held). */
export function sequence(parts) {
  return t => {
    for (const p of parts) if (t >= p.from && t < p.to) return p.fn(t - p.from);
    return 0;
  };
}

/**
 * Ground-truth reversals of a velocity function over [t0, t1], by the FS-14 §6 definition: a direction
 * change between two moving stretches (|v| > movePeak) of opposite sign. Time = midpoint of the
 * near-zero stretch (|v| < v0) between them (the zero crossing for a symmetric reversal); duration =
 * time between the movePeak crossings. Sampled every `dt` seconds.
 */
export function truthReversals(v, t0, t1, { v0 = 0.1, movePeak = 0.3, dt = 1e-4 } = {}) {
  const out = [];
  let lastSign = 0, lastMoveEnd = null, deadStart = null, deadEnd = null;
  for (let t = t0 + dt; t <= t1; t += dt) {
    const x = v(t);
    if (Math.abs(x) > movePeak) {
      const s = Math.sign(x);
      if (lastSign && s !== lastSign) out.push({ tSec: deadStart != null ? (deadStart + deadEnd) / 2 : t, durationMs: (t - lastMoveEnd) * 1000, fromSign: lastSign });
      lastSign = s; lastMoveEnd = t; deadStart = null; deadEnd = null;
    } else if (Math.abs(x) < v0) {
      if (deadStart == null) deadStart = t;
      deadEnd = t;
    }
  }
  return out;
}

/** Mean of v over [a, b] (Simpson, 32 panels): what a window-averaging estimator should report. */
export function meanVelocity(v, a, b) {
  const n = 32, h = (b - a) / n;
  let s = v(a) + v(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * v(a + i * h);
  return s * h / 3 / (b - a);
}
