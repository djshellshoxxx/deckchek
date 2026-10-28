// Plinth vibration (FS-30 §6): detrended RMS and dominant 0.5-30 Hz peak of a phone accelerometer record.
// Relative A/B only (before/after isolation feet). Chromium caps sensors at 60 Hz, so Nyquist is 30 Hz: audible
// rumble (20-100 Hz) is out of reach and the desktop cartridge path remains the rumble measurement.
import { toneAmplitude, lowBandEnergyDb, normalizeMeasurement } from '../vendor/core.js';

export const MIN_RATE_HZ = 20;   // below this the sensor is "too slow"
export const MIN_SECONDS = 5;
export const BAND_HZ = [0.5, 30];

/** Median sampling rate (Hz) of [{t}] with t in seconds, or null. */
export function estimateRate(samples) {
  const gaps = [];
  for (let i = 1; i < samples.length; i++) { const g = samples[i].t - samples[i - 1].t; if (g > 0 && g < 1) gaps.push(g); }
  if (gaps.length < 8) return null;
  gaps.sort((a, b) => a - b);
  return 1 / gaps[Math.floor(gaps.length / 2)];
}

/** Linear resample of irregular [{t,x,y,z}] onto a uniform grid at rateHz. */
export function resample(samples, rateHz) {
  const t0 = samples[0].t, t1 = samples.at(-1).t;
  const n = Math.max(0, Math.floor((t1 - t0) * rateHz));
  const out = { x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n) };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / rateHz;
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j], b = samples[j + 1];
    const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    out.x[i] = a.x + (b.x - a.x) * f;
    out.y[i] = a.y + (b.y - a.y) * f;
    out.z[i] = a.z + (b.z - a.z) * f;
  }
  return out;
}

/** Remove mean and linear trend (gravity and slow tilt) in place. */
export function detrend(x) {
  const n = x.length;
  if (n < 2) return x;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i]; }
  const slope = (n * sxy - sx * sy) / Math.max(1e-12, n * sxx - sx * sx);
  const icpt = (sy - slope * sx) / n;
  for (let i = 0; i < n; i++) x[i] -= icpt + slope * i;
  return x;
}

function hann(x) {
  const n = x.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  return out;
}

/**
 * Metrics from [{t (s), x, y, z (m/s^2)}]. `rateHz` overrides the estimated rate.
 * Returns {status: 'ok'|'too-short'|'too-slow'|'no-data', rateHz, durationSec, nyquistHz, rmsMs2, dominantHz, dominantAmp, lowBandDb, spectrum}.
 */
export function vibrationMetrics(samples, { rateHz = null } = {}) {
  if (!samples || samples.length < 8) return { status: 'no-data' };
  const rate = rateHz ?? estimateRate(samples);
  if (!rate) return { status: 'no-data' };
  const durationSec = samples.at(-1).t - samples[0].t;
  const base = { rateHz: rate, durationSec, nyquistHz: rate / 2 };
  if (rate < MIN_RATE_HZ) return { status: 'too-slow', ...base };
  if (durationSec < MIN_SECONDS) return { status: 'too-short', ...base };
  const u = resample(samples, rate);
  const axes = [detrend(u.x), detrend(u.y), detrend(u.z)];
  const n = axes[0].length;
  let sumSq = 0;
  for (const a of axes) for (let i = 0; i < n; i++) sumSq += a[i] * a[i];
  const rmsMs2 = Math.sqrt(sumSq / n);
  const windowed = axes.map(hann);
  const top = Math.min(BAND_HZ[1], rate * 0.45);
  const step = 0.25;
  const spectrum = [];
  let dominantHz = null, dominantAmp = 0;
  for (let f = BAND_HZ[0]; f <= top + 1e-9; f += step) {
    // Hann window coherent gain is 0.5, so double the Goertzel amplitude (peak units, m/s^2).
    const amp = 2 * Math.sqrt(windowed.reduce((s, a) => { const g = toneAmplitude(a, rate, f); return s + g * g; }, 0));
    spectrum.push({ hz: Number(f.toFixed(2)), amp });
    if (amp > dominantAmp) { dominantAmp = amp; dominantHz = f; }
  }
  const mag = new Float32Array(n);
  for (let i = 0; i < n; i++) mag[i] = Math.hypot(axes[0][i], axes[1][i], axes[2][i]);
  return { status: 'ok', ...base, rmsMs2, dominantHz, dominantAmp, lowBandDb: lowBandEnergyDb(mag, rate, Math.floor(top / 5) * 5 || 5), spectrum };
}

/** Relative band for a verdict word (thresholds are indicative and UNVERIFIED; compare before/after, not against a limit). */
export function vibrationBand(rmsMs2) {
  if (!Number.isFinite(rmsMs2)) return 'unknown';
  return rmsMs2 < 0.01 ? 'low' : rmsMs2 < 0.05 ? 'moderate' : 'high';
}

export function vibrationMeasurements(m) {
  if (m.status !== 'ok') return [];
  const r = (v, d) => Number(v.toFixed(d));
  const flags = ['phone-sensor', `rate-${Math.round(m.rateHz)}hz`];
  return [
    normalizeMeasurement({ metricId: 'vibration.rmsMs2', label: 'Vibration RMS (detrended)', value: r(m.rmsMs2, 5), unit: 'm/s2', confidence: 0.6, qualityFlags: flags }),
    ...(Number.isFinite(m.dominantHz) ? [normalizeMeasurement({ metricId: 'vibration.dominantHz', label: 'Dominant frequency', value: r(m.dominantHz, 2), unit: 'Hz', confidence: 0.6, uncertainty: 0.25, qualityFlags: flags })] : []),
    normalizeMeasurement({ metricId: 'vibration.lowBandDb', label: 'Low-band energy (relative)', value: r(m.lowBandDb, 2), unit: 'dB re 1 m/s2', confidence: 0.5, qualityFlags: flags }),
  ];
}
