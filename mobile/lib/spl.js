// Indicative SPL (FS-30 §6): RMS of the mic stream with AGC off, in dBFS plus a user offset. Phone microphones
// and OS gain are uncalibrated, so the result is "indicative, +/- 10 dB" and the screen says so permanently.
// A and C weighting are the IEC 61672 analog responses turned into first-order digital sections (bilinear
// transform with the corner frequencies prewarped); the phone's own mic response is NOT corrected.
import { rms, dbfs, normalizeMeasurement } from '../vendor/core.js';

export const ASSUMED_OFFSET_DB = 100; // typical full-scale-to-SPL guess, UNKNOWN per device: hence the +/- 10 dB banner
export const UNCERTAINTY_DB = 10;
export const WEIGHTINGS = ['A', 'C', 'Z'];

const F1 = 20.598997, F2 = 107.65265, F3 = 737.86223, F4 = 12194.217;

function section(kind, hz, fs) {
  const c = 2 * fs;
  const w = c * Math.tan(Math.PI * hz / fs); // prewarped analog corner
  const d = c + w;
  const a1 = (w - c) / d;
  return kind === 'hp' ? { b0: c / d, b1: -c / d, a1 } : { b0: w / d, b1: w / d, a1 };
}

function chain(kind, fs) {
  if (kind === 'Z') return [];
  const hp = kind === 'A' ? [F1, F1, F2, F3] : [F1, F1];
  return [...hp.map(f => section('hp', f, fs)), section('lp', F4, fs), section('lp', F4, fs)];
}

function run(sections, x) {
  let y = Float64Array.from(x);
  for (const s of sections) {
    const out = new Float64Array(y.length);
    let xp = 0, yp = 0;
    for (let i = 0; i < y.length; i++) { const v = s.b0 * y[i] + s.b1 * xp - s.a1 * yp; xp = y[i]; yp = v; out[i] = v; }
    y = out;
  }
  return y;
}

function rawGainDb(kind, hz, fs) {
  const w = 2 * Math.PI * hz / fs, cos = Math.cos(w), sin = Math.sin(w);
  let g = 1;
  for (const s of chain(kind, fs)) g *= Math.hypot(s.b0 + s.b1 * cos, -s.b1 * sin) / Math.hypot(1 + s.a1 * cos, -s.a1 * sin);
  return 20 * Math.log10(g);
}

/** Magnitude response (dB) of the weighting at `hz`, relative to 1 kHz. */
export const weightingResponseDb = (kind, hz, fs) => rawGainDb(kind, hz, fs) - rawGainDb(kind, 1000, fs);

/** Apply A/C/Z weighting (gain-normalised to 0 dB at 1 kHz) to a buffer. */
export function applyWeighting(samples, sampleRate, kind = 'A') {
  if (kind === 'Z') return Float64Array.from(samples);
  const y = run(chain(kind, sampleRate), samples);
  const norm = 10 ** (rawGainDb(kind, 1000, sampleRate) / 20);
  for (let i = 0; i < y.length; i++) y[i] /= norm;
  return y;
}

/** Weighted level in dBFS (RMS, full-scale sine = -3 dBFS). */
export function levelDbfs(samples, sampleRate, weighting = 'A') {
  const x = weighting === 'Z' ? samples : Float32Array.from(applyWeighting(samples, sampleRate, weighting));
  return dbfs(rms(x));
}

/** Offset that makes this device read `referenceDb` when it measured `measuredDbfs` (single-point calibration). */
export const calibrationOffset = (referenceDb, measuredDbfs) => referenceDb - measuredDbfs;

/**
 * Indicative SPL measurement. `calibrated` is true only after a single-point calibration; the uncertainty stays
 * +/- 10 dB uncalibrated and +/- 3 dB after (one reference point, unknown mic response).
 */
export function splMeasurements(samples, sampleRate, { weighting = 'A', offsetDb = ASSUMED_OFFSET_DB, calibrated = false } = {}) {
  const dbf = levelDbfs(samples, sampleRate, weighting);
  const peak = dbfs(samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0));
  const flags = [calibrated ? 'single-point-calibration' : 'uncalibrated', 'phone-mic'];
  const r = v => Number(v.toFixed(2));
  return [
    normalizeMeasurement({ metricId: `spl.level${weighting}Db`, label: `Sound level (${weighting}, indicative)`, value: r(dbf + offsetDb), unit: `dB${weighting === 'Z' ? '' : weighting}`, confidence: calibrated ? 0.6 : 0.3, uncertainty: calibrated ? 3 : UNCERTAINTY_DB, qualityFlags: flags }),
    normalizeMeasurement({ metricId: 'spl.levelDbfs', label: 'Level at the microphone', value: r(dbf), unit: 'dBFS', confidence: 0.8, qualityFlags: flags }),
    normalizeMeasurement({ metricId: 'spl.peakDbfs', label: 'Peak', value: r(peak), unit: 'dBFS', confidence: 0.8, qualityFlags: flags }),
  ];
}
