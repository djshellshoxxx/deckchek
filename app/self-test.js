// Packaged-app self-test (`deckchek --self-test=<report.json>`, used by the release smoke jobs).
// Runs the shipping measurement code on a synthetic tone with known answers inside the real
// WebView and reports the checks to Rust, which adds native checks, writes the report and exits.
// Pure helpers are exported for unit tests; nothing here runs unless Rust says self-test is active.
import { quickDiagnostic, speedFromReferenceTone } from './core.js';

export const SELF_TEST_SIGNAL = Object.freeze({ sampleRate: 48000, seconds: 3, toneHz: 1003, referenceHz: 1000, leftDbfs: -12, rightDbfs: -12.5 });

/** Stereo sine: right channel 0.5 dB lower, 0.3 % fast against a 1 kHz reference. */
export function selfTestSignal(s = SELF_TEST_SIGNAL) {
  const n = s.sampleRate * s.seconds, left = new Float32Array(n), right = new Float32Array(n);
  const al = 10 ** (s.leftDbfs / 20) * Math.SQRT2, ar = 10 ** (s.rightDbfs / 20) * Math.SQRT2;
  for (let i = 0; i < n; i++) { const v = Math.sin(2 * Math.PI * s.toneHz * i / s.sampleRate); left[i] = al * v; right[i] = ar * v; }
  return { left, right, sampleRate: s.sampleRate };
}

const near = (value, expected, tol) => Number.isFinite(value) && Math.abs(value - expected) <= tol;

/** Runs the analysis and returns `{ok, checks:[{name, ok, value, expected}]}`. */
export function evaluateSelfTest(signal = selfTestSignal(), s = SELF_TEST_SIGNAL) {
  const speed = speedFromReferenceTone(signal.left, signal.sampleRate, { referenceHz: s.referenceHz });
  const quick = quickDiagnostic(signal);
  const metric = id => quick.measurements?.find(m => m.metricId === id)?.value;
  const expectedPitch = (s.toneHz / s.referenceHz - 1) * 100;
  const checks = [
    { name: 'tone frequency (Hz)', value: speed.measuredHz, expected: s.toneHz, ok: near(speed.measuredHz, s.toneHz, 0.05) },
    { name: 'speed error (%)', value: speed.speedErrorPercent, expected: expectedPitch, ok: near(speed.speedErrorPercent, expectedPitch, 0.01) },
    { name: 'left level (dBFS)', value: metric('left_level_dbfs'), expected: s.leftDbfs, ok: near(metric('left_level_dbfs'), s.leftDbfs, 0.05) },
    { name: 'channel balance (dB)', value: Math.abs(metric('channel_balance_db')), expected: s.leftDbfs - s.rightDbfs, ok: near(Math.abs(metric('channel_balance_db')), s.leftDbfs - s.rightDbfs, 0.05) },
    { name: 'no clipped samples', value: metric('clipped_samples'), expected: 0, ok: metric('clipped_samples') === 0 },
  ];
  return { ok: checks.every(c => c.ok), checks };
}

/** UI checks: the shell rendered with its navigation. */
export function uiChecks(doc = globalThis.document) {
  const rail = doc?.querySelectorAll?.('#rail-list .rail-item')?.length ?? 0;
  return [{ name: 'navigation rendered', value: rail, expected: '>= 5', ok: rail >= 5 }];
}

/** Desktop only: asks Rust whether `--self-test` is active and, if so, runs and reports. */
export async function runSelfTestIfRequested(invoke) {
  let active = false;
  try { active = await invoke('self_test_mode'); } catch { return false; }
  if (!active) return false;
  let report;
  try {
    const analysis = evaluateSelfTest();
    const ui = uiChecks();
    report = { ok: analysis.ok && ui.every(c => c.ok), checks: [...analysis.checks, ...ui], userAgent: globalThis.navigator?.userAgent?.slice(0, 200) || '' };
  } catch (error) {
    report = { ok: false, checks: [], error: String(error?.message || error).slice(0, 500) };
  }
  await invoke('self_test_report', { report });
  return true;
}
