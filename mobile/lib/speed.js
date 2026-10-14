// Speed by reference tone (FS-30 §6): wraps the desktop engines in vendor/ (copied unchanged from app/).
import { speedFromReferenceTone, estimateToneFrequency, toneAmplitude, rms, normalizeMeasurement } from '../vendor/core.js';
import { frequencyTrace, speedStabilityMetrics } from '../vendor/advanced.js';
import { rpmUncertainty, speedPitchUncertainty } from '../vendor/calibration.js';

export const MIN_SNR_DB = 15;      // tunable: below this the tone is reported as weak
export const MIN_SECONDS = 2;
export const DEFAULT_CLOCK_PPM = 100; // desktop default; phone ADC clock error is UNKNOWN (tens of ppm typical), so keep the wide floor
export const FORMATS = [
  { id: '33', label: '33 1/3 rpm', rpm: 100 / 3 },
  { id: '45', label: '45 rpm', rpm: 45 },
];
export const REFERENCES = [
  { hz: 1000, label: '1 kHz' },
  { hz: 3000, label: '3 kHz' },
  { hz: 3150, label: '3.15 kHz' },
];

const round = (v, d) => Number(v.toFixed(d));

/** The middle `sec` seconds of `samples` (skips the start-up of the mic and any AGC settling at the end). */
export function centralSlice(samples, sampleRate, sec = 2) {
  const n = Math.min(samples.length, Math.floor(sec * sampleRate));
  const start = Math.floor((samples.length - n) / 2);
  return samples.subarray(start, start + n);
}

/** Tone-to-everything-else ratio in dB at `hz` (both as power). */
export function toneSnrDb(samples, sampleRate, hz) {
  const amp = toneAmplitude(samples, sampleRate, hz);
  const total = rms(samples) ** 2;
  const tone = amp * amp / 2;
  const noise = Math.max(total - tone, total * 1e-6, 1e-18);
  return 10 * Math.log10(Math.max(tone, 1e-18) / noise);
}

/**
 * Measure platter speed from a recorded reference tone. Returns normalizeMeasurement-shaped entries:
 * speed.measuredHz, speed.pitchPercent, speed.rpm (each with an expanded k=2 uncertainty from the desktop budget),
 * speed.wowFlutterRmsPercent, speed.driftPercent and speed.snrDb. A tone below MIN_SNR_DB is flagged `weak-tone`.
 */
export function measureSpeed(samples, sampleRate, { referenceHz = 1000, nominalRpm = 100 / 3, clockPpm = DEFAULT_CLOCK_PPM } = {}) {
  if (!samples || samples.length < MIN_SECONDS * sampleRate) throw new RangeError(`Need at least ${MIN_SECONDS} seconds of audio.`);
  const slice = centralSlice(samples, sampleRate, 2);
  const sp = speedFromReferenceTone(slice, sampleRate, { referenceHz, nominalRpm });
  const snrDb = toneSnrDb(slice, sampleRate, sp.measuredHz);
  const weak = !(snrDb >= MIN_SNR_DB);
  const flags = weak ? ['weak-tone'] : [];
  const trace = frequencyTrace(samples, sampleRate, { referenceHz, windowSec: 0.5, hopSec: 0.5, spanHz: Math.max(25, referenceHz * 0.1) });
  const stab = speedStabilityMetrics(trace, { referenceHz, nominalRpm });
  const snrForBudget = Math.max(0, Math.min(60, snrDb));
  const common = { referenceHz, windowSec: slice.length / sampleRate, snrDb: snrForBudget, sampleRate, clockPpmU: clockPpm };
  const pU = speedPitchUncertainty(common).expanded;
  const rU = rpmUncertainty({ nominalRpm, pitchPercent: sp.pitchPercent, ...common }).expanded;
  const confidence = weak ? 0.4 : Math.min(0.95, 0.6 + (snrDb - MIN_SNR_DB) / 60);
  const m = (metricId, label, value, unit, uncertainty = null, c = confidence) => normalizeMeasurement({ metricId, label, value: round(value, 4), unit, origin: 'measured', confidence: c, uncertainty: uncertainty == null ? null : round(uncertainty, 4), qualityFlags: flags });
  const out = [
    m('speed.measuredHz', 'Measured tone', sp.measuredHz, 'Hz', pU * referenceHz / 100),
    m('speed.pitchPercent', 'Pitch', sp.pitchPercent, '%', pU),
    m('speed.rpm', 'Speed', sp.rpm, 'rpm', rU),
  ];
  if (Number.isFinite(stab.wowFlutterRmsPercent)) {
    out.push(m('speed.wowFlutterRmsPercent', 'Speed variation (RMS)', stab.wowFlutterRmsPercent, '%'));
    out.push(m('speed.driftPercent', 'Drift over the take', stab.driftPercent, '%'));
  }
  out.push(m('speed.snrDb', 'Tone to noise', snrDb, 'dB', null, 1));
  return out;
}

/** What to tell the person: ok / weak (tone found but SNR low) / none (no tone found at all). */
export function speedStatus(measurements) {
  const snr = measurements.find(x => x.metricId === 'speed.snrDb')?.value;
  if (!Number.isFinite(snr) || snr < 0) return 'none';
  return snr >= MIN_SNR_DB ? 'ok' : 'weak';
}

/** Cheap live readout for the last ~0.5 s of audio: {hz, pitchPercent, rpm} or null. Display only, never exported. */
export function liveEstimate(samples, sampleRate, { referenceHz = 1000, nominalRpm = 100 / 3 } = {}) {
  const n = Math.floor(sampleRate * 0.5);
  if (!samples || samples.length < n) return null;
  const tail = samples.subarray(samples.length - n);
  if (rms(tail) < 1e-4) return null;
  const span = referenceHz * 0.05 + 5;
  const hz = estimateToneFrequency(tail, sampleRate, { minHz: referenceHz - span, maxHz: referenceHz + span, coarseStepHz: 1 });
  const ratio = hz / referenceHz;
  return { hz, pitchPercent: (ratio - 1) * 100, rpm: nominalRpm * ratio };
}
