// Metric metadata for readouts and the inspector: plain-language meaning,
// DeckChek guide bands (heuristic, not standards) and the run verdict.

const band = (pass, review, warn) => v => {
  const a = Math.abs(v);
  return a <= pass ? 'pass' : a <= review ? 'review' : a <= warn ? 'warn' : 'fail';
};
const atLeast = (pass, review, warn) => v => v >= pass ? 'pass' : v >= review ? 'review' : v >= warn ? 'warn' : 'fail';
const atMost = (pass, review, warn) => v => v <= pass ? 'pass' : v <= review ? 'review' : v <= warn ? 'warn' : 'fail';

const speedError = { rule: band(.1, .3, 1), target: '0 ± 0.1 %', why: 'Mean platter speed error versus the reference tone. Large errors shift musical pitch and break beat-matching.', fix: 'Check the pitch fader zero/quartz position, confirm the test-record frequency and let the deck warm up.' };
const level = { rule: v => v > -1 ? 'fail' : v >= -24 && v <= -3 ? 'pass' : v < -40 ? 'warn' : 'review', target: '−18 to −3 dBFS peak', why: 'RMS level of the channel. Too low raises the noise floor; too high risks clipping.', fix: 'Adjust interface input gain so peaks sit between −18 and −3 dBFS.' };
const hum = { rule: atMost(-70, -60, -50), target: '≤ −70 dBFS', why: 'Energy at the mains frequency (50/60 Hz). Usually ground loops or unshielded cables.', fix: 'Check the turntable ground wire, try a different outlet and separate audio and power cables.' };
const thd = { rule: atMost(1, 3, 5), target: '≤ 1 %', why: 'Harmonic distortion of the reference tone. High values suggest mistracking, a worn stylus or overload.', fix: 'Reduce gain, clean the stylus and verify tracking force and anti-skate.' };

export const METRIC_INFO = {
  left_level_dbfs: level, right_level_dbfs: level,
  channel_balance_db: { rule: band(.5, 1.5, 3), target: '0 ± 0.5 dB', why: 'Level difference between left and right. Imbalance points to cartridge, cable, mixer or interface channel faults.', fix: 'Swap left/right downstream to see whether the imbalance follows the source or the path.' },
  correlation: { target: 'context dependent', why: 'Similarity of left and right. Near +1 is mono-like, near −1 suggests polarity inversion.', fix: 'Compare with a known stereo source; check wiring polarity if strongly negative.' },
  clipped_samples: { rule: v => v === 0 ? 'pass' : 'fail', target: '0 samples', why: 'Samples at full scale. Clipping corrupts every downstream measurement.', fix: 'Lower input gain and recapture.' },
  dropout_count: { rule: atMost(0, 2, 5), target: '0 regions', why: 'Regions where the level fell far below the surrounding signal.', fix: 'Inspect cables and contacts; repeat capture to see whether the dropouts move.' },
  left_hum_dbfs: hum, right_hum_dbfs: hum,
  low_frequency_energy_dbfs: { rule: atMost(-45, -35, -25), target: '≤ −45 dBFS', why: 'Low-band energy proxy for vibration, feedback and rumble.', fix: 'Mute monitors, add isolation and compare against a quiet baseline.' },
  rpm: { why: 'Estimated platter speed from the reference tone.', target: 'nominal RPM' },
  pitch_percent: speedError, quartz_speed_error_percent: speedError, warmup_speed_error_percent: speedError,
  wow_flutter_rms_percent: { rule: atMost(.1, .25, .6), target: '≤ 0.1 % RMS', why: 'Short-term speed variation proxy (not a weighted DIN/IEC wow & flutter figure).', fix: 'Inspect belt/drive, platter bearing and record centring; repeat with a verified test record.' },
  speed_drift_percent: { rule: band(.05, .15, .5), target: '0 ± 0.05 %', why: 'Speed change from the start to the end of the capture.', fix: 'Repeat after warm-up; check motor control and supply.' },
  peak_speed_deviation_percent: { rule: atMost(.2, .5, 1), target: '≤ 0.2 %', why: 'Largest short-term deviation from the mean speed.' },
  speed_modulation_1x_percent: { why: 'Speed modulation at once per revolution — typically record eccentricity or platter run-out.' },
  measured_pitch_percent: { why: 'Measured speed change at this pitch-control position.' },
  pitch_map_max_error: { rule: atMost(.25, .5, 1.5), target: '≤ 0.25 %', why: 'Worst difference between pitch control position and measured speed across the map.' },
  pitch_map_hysteresis: { rule: atMost(.1, .25, .5), target: '≤ 0.1 %', why: 'Difference between up and down passes at the same position.' },
  left_thd_percent: thd, right_thd_percent: thd,
  channel_separation_db: { rule: atLeast(25, 20, 15), target: '≥ 25 dB', why: 'Leakage of the isolated test-track channel into the other channel.', fix: 'Check cartridge azimuth and alignment; measure interface crosstalk with a loopback first.' },
  dvs_integrity_score: { rule: atLeast(85, 65, 50), target: '≥ 85 / 100', why: 'Generic timecode signal health from presence, balance, scope shape, gaps, clipping and hum.', fix: 'Clean the stylus and control vinyl, check both channels and set the correct input level.' },
  dvs_scope_circularity: { rule: atLeast(.7, .45, .3), target: '≥ 0.7', why: 'How round the L/R scope looks. A flat or tilted ellipse decodes poorly.' },
  dvs_missing_windows: { rule: atMost(0, 3, 10), target: '0 windows', why: '100 ms windows where the control signal was missing.' },
  vinyl_condition_score: { rule: atLeast(85, 65, 50), target: '≥ 85 / 100', why: 'Composite of transient density, hum, rumble, recurrence and clipping.', fix: 'Clean the record and repeat the scan to separate dust from damage.' },
  vinyl_transients_per_min: { rule: atMost(5, 20, 60), target: '≤ 5 / min', why: 'Click/pop candidates per minute. Musical attacks also count, so treat as evidence.' },
  vinyl_rumble_dbfs: { rule: atMost(-55, -45, -35), target: '≤ −55 dBFS', why: 'Sub-30 Hz energy: warps, motor rumble or feedback.' },
  startup_envelope_90_sec: { rule: v => v < 0 ? 'review' : v <= 1 ? 'pass' : v <= 2 ? 'review' : 'warn', target: '≤ 1 s', why: 'Time for the signal envelope to reach 90% — a proxy for start-up torque.' },
  brake_envelope_10_sec: { rule: v => v < 0 ? 'review' : v <= 1 ? 'pass' : v <= 2 ? 'review' : 'warn', target: '≤ 1 s', why: 'Time for the envelope to fall to 10% after the brake marker.' },
  capture_overrun_samples: { rule: v => v === 0 ? 'pass' : 'warn', target: '0 samples', why: 'Samples dropped by the capture buffer.' },
};

const LABEL_OVERRIDES = {
  left_level_dbfs: 'Left level', right_level_dbfs: 'Right level', channel_balance_db: 'Channel balance L-R',
  correlation: 'Stereo correlation', rpm: 'Platter speed', left_thd_percent: 'Left THD', right_thd_percent: 'Right THD',
  left_hum_dbfs: 'Left hum', right_hum_dbfs: 'Right hum', wow_flutter_rms_percent: 'Wow & flutter (RMS)',
};
/** Human label for a metric id when no stored label exists. */
export function metricLabel(id) {
  if (LABEL_OVERRIDES[id]) return LABEL_OVERRIDES[id];
  const words = String(id ?? '').replace(/_(dbfs|db|percent|sec|hz)$/i, '').split('_').filter(Boolean);
  const text = words.join(' ');
  return text ? text[0].toUpperCase() + text.slice(1) : String(id ?? '');
}

export function metricStatus(m) {
  const info = METRIC_INFO[m?.metricId];
  if (!info?.rule || typeof m.value !== 'number' || !Number.isFinite(m.value)) return null;
  return info.rule(m.value);
}

const SEV_RANK = { critical: 4, warning: 3, review: 2, informational: 1, info: 1 };
export const SEV_STATUS = { critical: 'fail', warning: 'warn', review: 'review', informational: 'info', info: 'info' };

export function worstSeverity(findings = []) {
  return findings.reduce((w, f) => (SEV_RANK[f.severity] || 0) > (SEV_RANK[w] || 0) ? f.severity : w, null);
}

/** Verdict: status + headline sentence + recommended action, from score and findings. */
export function verdictFor(run) {
  const findings = [...(run.findings || [])].sort((a, b) => (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0) || (b.confidence || 0) - (a.confidence || 0));
  const worst = worstSeverity(findings), score = typeof run.score === 'number' ? run.score : null;
  let status = 'pass';
  if (worst === 'critical' || (score != null && score < 50)) status = 'fail';
  else if (worst === 'warning' || (score != null && score < 70)) status = 'warn';
  else if (worst === 'review' || (score != null && score < 85)) status = 'review';
  const top = findings.find(f => f.severity !== 'informational') || null;
  const headline = {
    pass: `${run.test}: no issues needed attention.`,
    review: `${run.test}: ${top ? top.title.toLowerCase() : 'some readings are marginal'} — worth a second look.`,
    warn: `${run.test}: ${top ? top.title.toLowerCase() : 'readings are outside the ideal range'}.`,
    fail: `${run.test}: ${top ? top.title.toLowerCase() : 'readings are out of spec'}.`,
  }[status];
  const action = top?.isolationTests?.[0] ? capitalize(top.isolationTests[0]) + '.' : status === 'pass' ? 'Save this run as a baseline and compare after changes.' : 'Repeat the capture to confirm the result.';
  return { status, headline, action, top, findings };
}

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
