// Workflow analysis orchestration. Calls the pure measurement modules
// (core/advanced/diagnostics/calibration) and assembles a run record.
// No DOM access: every user parameter arrives through `params`.

import { analyzeVinylSide, lowBandEnergyDb, normalizeMeasurement, quickDiagnostic, scopeMetrics, speedFromReferenceTone, toneAmplitude } from '../core.js';
import { dropoutMetrics, frequencyTrace, speedStabilityMetrics } from '../advanced.js';
import { channelSeparationDb, compareEventMaps, dvsIntegrityScore, dvsIntegrityTimeline, ellipseMetrics, normalizedEventMap, normalizedLevelTrace, pitchMapMetrics, reasonFromEvidence, repeatabilityMetrics, subsonicPeak, thdPercent, traceModulationPercent, transitionMetrics, trendMetrics } from '../diagnostics.js';
import { applyCalibration, isProfileApplicable, profileInapplicableReasons } from '../calibration.js';
import { uid } from './dom.js';

const SEVERITY_PENALTY = { critical: 35, warning: 18, review: 8 };
export function scoreFromFindings(findings = []) {
  let score = 100;
  for (const f of findings) score -= SEVERITY_PENALTY[f.severity] ?? 2;
  return Math.max(0, Math.round(score));
}

const M = (metricId, label, value, unit, extra = {}) => normalizeMeasurement({ metricId, label, value, unit, ...extra });
const find = (measurements, id) => measurements.find(m => m.metricId === id)?.value;

function speedParams(params) {
  return { referenceHz: Number(params.referenceHz) || 1000, nominalRpm: Number(params.nominalRpm) || 33.333333 };
}

/** Downsample an array to at most n items (evenly spaced). */
function thin(arr, n = 400) {
  if (!arr || arr.length <= n) return arr || [];
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}

/** Min/max envelope of a channel for the overview plot. */
export function envelope(samples, bins = 360) {
  const out = [], size = Math.max(1, Math.floor(samples.length / bins));
  for (let b = 0; b < bins && b * size < samples.length; b++) {
    let lo = 0, hi = 0;
    for (let i = b * size, end = Math.min(samples.length, (b + 1) * size); i < end; i++) { const v = samples[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    out.push([lo, hi]);
  }
  return out;
}

function lissajous(left, right, n = 1500) {
  const start = Math.floor(left.length / 2), end = Math.min(left.length, start + Math.max(n, 1));
  const pts = [];
  for (let i = start; i < end; i++) pts.push([left[i], right[i]]);
  return thin(pts, n);
}

/** Per-test analysis. Returns measurements, findings, score, eventMap and plot evidence. */
export function analyzeForTest(test, audio, params = {}) {
  let resultEventMap = [];
  const evidence = { envelope: { left: envelope(audio.left), right: envelope(audio.right), durationSec: audio.durationSec } };
  const q = quickDiagnostic(audio);
  let measurements = [...q.measurements], findings = [...q.findings], score = scoreFromFindings(q.findings);
  if (test === 'Speed & pitch') {
    const { referenceHz, nominalRpm } = speedParams(params);
    const s = speedFromReferenceTone(audio.left, audio.sampleRate, { referenceHz, nominalRpm });
    const trace = frequencyTrace(audio.left, audio.sampleRate, { referenceHz, windowSec: .5, hopSec: .25, spanHz: Math.max(25, referenceHz * .08) });
    const stability = speedStabilityMetrics(trace, { referenceHz, nominalRpm });
    evidence.speedTrace = thin(trace.map(p => ({ t: p.timeSec, v: (p.frequencyHz / referenceHz - 1) * 100 })));
    measurements.push(
      M('measured_frequency_hz', 'Measured reference frequency', s.measuredHz, 'Hz', { confidence: .9 }),
      M('rpm', 'Estimated platter speed', stability.meanRpm, 'RPM', { confidence: .85 }),
      M('pitch_percent', 'Mean speed/pitch error', stability.meanPitchPercent, '%', { confidence: .85 }),
      M('wow_flutter_rms_percent', 'Short-term speed variation proxy', stability.wowFlutterRmsPercent, '%', { confidence: .7 }),
      M('speed_drift_percent', 'Start-to-end speed drift', stability.driftPercent, '%', { confidence: .75 }),
      M('peak_speed_deviation_percent', 'Peak short-term deviation', stability.peakDeviationPercent, '%', { confidence: .7 }),
      M('speed_modulation_1x_percent', '1× revolution modulation amplitude', traceModulationPercent(trace, { referenceHz, frequencyHz: nominalRpm / 60 }), '% peak', { confidence: .65 }),
      M('speed_modulation_2x_percent', '2× revolution modulation amplitude', traceModulationPercent(trace, { referenceHz, frequencyHz: 2 * nominalRpm / 60 }), '% peak', { confidence: .6 }),
      M('speed_modulation_3x_percent', '3× revolution modulation amplitude', traceModulationPercent(trace, { referenceHz, frequencyHz: 3 * nominalRpm / 60 }), '% peak', { confidence: .55 }),
    );
    if (Math.abs(stability.meanPitchPercent) > .3) findings.push({ code: 'SPEED_ERROR', title: 'Speed differs from reference', detail: `Estimated mean speed error ${stability.meanPitchPercent.toFixed(3)}%.`, severity: Math.abs(stability.meanPitchPercent) > 1 ? 'warning' : 'review', confidence: .85, possibleCauses: ['pitch calibration', 'reference-tone mismatch', 'platter speed error'], isolationTests: ['confirm test-record reference frequency', 'repeat after warm-up', 'compare quartz-lock position'] });
    if (stability.wowFlutterRmsPercent > .25) findings.push({ code: 'SPEED_INSTABILITY', title: 'Short-term speed variation is elevated', detail: `Measured proxy ${stability.wowFlutterRmsPercent.toFixed(3)}% RMS across analysis windows.`, severity: stability.wowFlutterRmsPercent > .6 ? 'warning' : 'review', confidence: .7, possibleCauses: ['platter/belt/drive instability', 'record eccentricity', 'reference source instability'], isolationTests: ['repeat with verified test record', 'compare 33⅓ and 45 RPM', 'inspect mechanical drive and platter'] });
    score = scoreFromFindings(findings);
  } else if (test === 'Quartz lock') {
    const { referenceHz, nominalRpm } = speedParams(params);
    const mode = params.quartzMode || 'locked';
    const s = speedFromReferenceTone(audio.left, audio.sampleRate, { referenceHz, nominalRpm });
    measurements.push(
      M('quartz_speed_error_percent', `${mode === 'locked' ? 'Quartz/reset' : 'Free center'} speed error`, s.pitchPercent, '%', { confidence: .85 }),
      M('quartz_mode_code', 'Quartz test state', mode === 'locked' ? 1 : 0, 'code', { origin: 'user_entered', confidence: 1 }),
      M('quartz_rpm', 'Measured platter speed', s.rpm, 'RPM', { confidence: .85 }),
    );
    score = scoreFromFindings(findings);
  } else if (test === 'Warm-up speed') {
    const { referenceHz, nominalRpm } = speedParams(params);
    const elapsed = Number(params.warmupElapsed) || 0;
    const s = speedFromReferenceTone(audio.left, audio.sampleRate, { referenceHz, nominalRpm });
    measurements.push(
      M('warmup_elapsed_min', 'Elapsed warm-up time', elapsed, 'min', { origin: 'user_entered', confidence: 1 }),
      M('warmup_speed_error_percent', 'Warm-up speed error', s.pitchPercent, '%', { confidence: .85 }),
      M('warmup_rpm', 'Warm-up measured RPM', s.rpm, 'RPM', { confidence: .85 }),
    );
    score = scoreFromFindings(findings);
  } else if (test === 'Pitch map') {
    const { referenceHz, nominalRpm } = speedParams(params);
    const s = speedFromReferenceTone(audio.left, audio.sampleRate, { referenceHz, nominalRpm });
    const position = Number(params.pitchPosition) || 0;
    const direction = params.pitchDirection || 'unknown';
    measurements.push(
      M('pitch_position', 'Pitch control position', position, '%', { origin: 'user_entered', confidence: 1 }),
      M('measured_pitch_percent', 'Measured pitch/speed change', s.pitchPercent, '%', { confidence: .85 }),
      M('pitch_direction_code', 'Pitch-map pass direction', direction === 'up' ? 1 : direction === 'down' ? -1 : 0, 'code', { origin: 'user_entered', confidence: 1 }),
    );
    if (Math.abs(s.pitchPercent - position) > .5) findings.push({ code: 'PITCH_TRACKING_ERROR', title: 'Pitch control differs from measured speed', detail: `Control position ${position.toFixed(2)}%; measured speed change ${s.pitchPercent.toFixed(3)}%.`, severity: Math.abs(s.pitchPercent - position) > 1.5 ? 'warning' : 'review', confidence: .8, possibleCauses: ['pitch calibration', 'fader nonlinearity', 'dead zone', 'reference-tone mismatch'], isolationTests: ['repeat at the same position', 'map both travel directions', 'verify zero/quartz position'] });
    score = scoreFromFindings(findings);
  } else if (test === 'DVS signal') {
    const s = scopeMetrics(audio.left, audio.right);
    const timeline = dvsIntegrityTimeline(audio.left, audio.right, audio.sampleRate, { windowSec: .1 });
    const missing = timeline.filter(x => !x.signalPresent).length;
    const ellipse = ellipseMetrics(audio.left, audio.right);
    const clipped = find(measurements, 'clipped_samples') || 0;
    const hum = Math.max(find(measurements, 'left_hum_dbfs') ?? -100, find(measurements, 'right_hum_dbfs') ?? -100);
    const integrity = dvsIntegrityScore({ leftPresent: s.leftDb > -70, rightPresent: s.rightDb > -70, balanceDb: s.balanceDb, circularity: s.circularity, clippedSamples: clipped, missingWindowRatio: missing / Math.max(1, timeline.length), humDb: hum });
    evidence.lissajous = lissajous(audio.left, audio.right);
    measurements.push(
      M('dvs_scope_circularity', 'Generic scope circularity', s.circularity, 'ratio', { confidence: .9 }),
      M('dvs_scope_correlation', 'Generic scope correlation', s.correlation, 'ratio', { confidence: .9 }),
      M('dvs_missing_windows', 'DVS missing-signal windows', missing, 'windows', { confidence: .85 }),
      M('dvs_ellipse_axis_ratio', 'DVS ellipse axis ratio', ellipse.axisRatio, 'ratio', { confidence: .85 }),
      M('dvs_ellipse_eccentricity', 'DVS ellipse eccentricity', ellipse.eccentricity, 'ratio', { confidence: .85 }),
      M('dvs_ellipse_rotation_deg', 'DVS ellipse rotation', ellipse.rotationRad * 180 / Math.PI, 'deg', { confidence: .8 }),
      M('dvs_integrity_score', 'DeckChek generic signal integrity', integrity.score, '/100', { confidence: .7 }),
    );
    if (s.circularity < .45) findings.push({ code: 'DVS_SCOPE_DEFORMED', title: 'Generic DVS scope is strongly asymmetric', detail: `Circularity metric ${s.circularity.toFixed(3)}.`, severity: 'review', confidence: .75, possibleCauses: ['channel imbalance', 'phase relationship', 'tracking or wear', 'unsupported control signal'], isolationTests: ['verify both channels', 'repeat with known-good control media', 'use vendor decoder when implemented'] });
    if (missing > 0) findings.push({ code: 'DVS_SIGNAL_GAP', title: 'DVS signal gaps detected', detail: `${missing} analysis window(s) fell below the generic presence threshold.`, severity: 'review', confidence: .8, possibleCauses: ['control-media wear', 'tracking loss', 'signal-path dropout', 'intentional silence or unsupported format'], isolationTests: ['repeat same region', 'compare known-good control media', 'inspect cartridge and signal path'] });
    score = Math.min(scoreFromFindings(findings), integrity.score);
  } else if (test === 'Startup & brake') {
    const trace = normalizedLevelTrace(audio.left, audio.sampleRate, { windowMs: 20 });
    const stopSec = Number.isFinite(Number(params.stopSec)) && params.stopSec !== '' ? Number(params.stopSec) : Math.max(0, audio.durationSec / 2);
    let stopIndex = 0, best = Infinity;
    for (let i = 0; i < trace.length; i++) { const diff = Math.abs(trace[i].timeSec - stopSec); if (diff < best) { best = diff; stopIndex = i; } }
    const tm = transitionMetrics(trace, { startIndex: 0, stopIndex, readyThreshold: .9, stoppedThreshold: .1 });
    evidence.levelTrace = { points: thin(trace.map(p => ({ t: p.timeSec, v: p.level ?? p.value ?? p.normalized ?? 0 }))), markerSec: stopSec };
    measurements.push(
      M('startup_envelope_90_sec', 'Signal-envelope rise to 90%', tm.startupSec ?? -1, 's', { confidence: .55 }),
      M('brake_envelope_10_sec', 'Signal-envelope fall to 10%', tm.brakeSec ?? -1, 's', { confidence: .55 }),
      M('transition_stop_marker_sec', 'User stop/brake marker', stopSec, 's', { origin: 'user_entered', confidence: 1 }),
    );
    if (tm.startupSec == null || tm.brakeSec == null) findings.push({ code: 'TRANSITION_INCOMPLETE', title: 'Transition threshold not reached', detail: 'The selected recording did not cross one or more envelope thresholds.', severity: 'review', confidence: .8, possibleCauses: ['incorrect stop marker', 'recording does not contain full transition', 'signal level too low'], isolationTests: ['repeat from stationary start', 'capture through complete stop', 'adjust stop marker'] });
    score = scoreFromFindings(findings);
  } else if (test === 'Channel separation') {
    const active = params.separationActive || 'left';
    const { referenceHz } = speedParams(params);
    const activeLevel = toneAmplitude(active === 'left' ? audio.left : audio.right, audio.sampleRate, referenceHz);
    const leakLevel = toneAmplitude(active === 'left' ? audio.right : audio.left, audio.sampleRate, referenceHz);
    const separation = channelSeparationDb(activeLevel, leakLevel);
    measurements.push(
      M('channel_separation_db', `${active === 'left' ? 'Left' : 'Right'}-track tone separation`, separation, 'dB', { confidence: .85 }),
      M('separation_reference_channel', 'Isolated reference channel', active === 'left' ? 0 : 1, 'code', { origin: 'user_entered', confidence: 1 }),
      M('separation_reference_hz', 'Separation reference tone', referenceHz, 'Hz', { origin: 'user_entered', confidence: 1 }),
    );
    findings.push({ code: 'SEPARATION_CONTEXT', title: 'Channel-separation result requires reference context', detail: `Measured broadband separation is ${separation.toFixed(2)} dB for the declared isolated-${active} track. Compare against the documented test record and calibrated interface baseline before attributing loss to the cartridge.`, severity: 'informational', confidence: .9, possibleCauses: ['cartridge crosstalk', 'azimuth/alignment', 'test-record leakage', 'interface or mixer crosstalk'], isolationTests: ['measure interface loopback isolation', 'repeat opposite-channel track', 'compare known-good cartridge'] });
    score = scoreFromFindings(findings);
  } else if (test === 'Channel & cartridge') {
    const { referenceHz } = speedParams(params);
    const leftThd = thdPercent(audio.left, audio.sampleRate, referenceHz);
    const rightThd = thdPercent(audio.right, audio.sampleRate, referenceHz);
    measurements.push(
      M('left_thd_percent', 'Left THD estimate', leftThd, '%', { confidence: .65 }),
      M('right_thd_percent', 'Right THD estimate', rightThd, '%', { confidence: .65 }),
    );
    if (Math.max(leftThd, rightThd) > 5) findings.push({ code: 'ELEVATED_DISTORTION', title: 'Elevated harmonic distortion estimate', detail: `Estimated THD L ${leftThd.toFixed(2)}%, R ${rightThd.toFixed(2)}% at the selected reference frequency.`, severity: 'review', confidence: .65, possibleCauses: ['mistracking', 'test-record distortion', 'input overload', 'stylus/cartridge condition'], isolationTests: ['verify clean reference track', 'reduce gain and repeat', 'compare cartridge/channel swap'] });
    score = scoreFromFindings(findings);
  } else if (test === 'Vibration check') {
    const low = lowBandEnergyDb(audio.left, audio.sampleRate, 80);
    measurements.push(M('low_frequency_energy_dbfs', 'Low-frequency energy proxy', low, 'dBFS', { confidence: .7 }));
    if (low > -35) findings.push({ code: 'LOW_FREQUENCY_ENERGY', title: 'Elevated low-frequency energy', detail: `Low-band proxy measured ${low.toFixed(1)} dBFS.`, severity: 'review', confidence: .65, possibleCauses: ['booth vibration', 'acoustic feedback', 'record warp', 'handling/footfall'], isolationTests: ['capture quiet baseline', 'repeat with monitors muted', 'compare isolation treatment'] });
    score = scoreFromFindings(findings);
  } else if (test === 'Vinyl side scan') {
    const v = analyzeVinylSide(audio);
    const mapped = normalizedEventMap(v.events, v.durationSec);
    const monoN = Math.min(audio.left.length, audio.right.length), mono = new Float32Array(monoN);
    for (let i = 0; i < monoN; i++) mono[i] = (audio.left[i] + audio.right[i]) * .5;
    const sub = subsonicPeak(mono, audio.sampleRate, { minHz: .2, maxHz: 5, stepHz: .1 });
    resultEventMap = mapped;
    evidence.vinyl = { liveReadiness: v.liveReadiness, recurrence: v.recurrence };
    measurements.push(
      M('vinyl_transients_per_min', 'Transient events per minute', v.transientDensityPerMin, 'events/min', { confidence: .72 }),
      M('vinyl_rumble_dbfs', 'Subsonic/rumble proxy', v.rumbleDb, 'dBFS', { confidence: .65 }),
      M('vinyl_condition_score', 'Condition score', v.conditionScore, '/100', { confidence: .6 }),
      M('vinyl_event_count', 'Mapped transient candidates', mapped.length, 'events', { confidence: .7 }),
      M('vinyl_subsonic_peak_hz', 'Strongest subsonic periodic component', sub.frequencyHz, 'Hz', { confidence: .55 }),
      M('vinyl_subsonic_peak_dbfs', 'Subsonic periodic component level', sub.levelDb, 'dBFS', { confidence: .55 }),
    );
    if (v.events.length) findings.push({ code: 'VINYL_TRANSIENTS', title: `${v.events.length} transient candidates detected`, detail: 'Transient candidates are evidence only; clicks, dust, scratches, cueing and musical attacks require confirmation.', severity: v.conditionScore < 65 ? 'warning' : 'review', confidence: .65, possibleCauses: ['surface contamination', 'scratch or groove damage', 'musical transient', 'static discharge'], isolationTests: ['repeat scan', 'clean record and compare', 'check recurrence at platter period'] });
    if (v.recurrence.confidence > .7) findings.push({ code: 'REPEATING_EVENT', title: 'Repeating event pattern detected', detail: `Candidate recurrence period ${v.recurrence.periodSec?.toFixed(3)} s.`, severity: 'review', confidence: v.recurrence.confidence, possibleCauses: ['repeating scratch', 'locked/repeating groove', 'periodic mechanical event'], isolationTests: ['repeat scan from same side', 'compare event position by revolution'] });
    score = v.conditionScore;
  }
  const drop = dropoutMetrics(audio.left, audio.sampleRate, { windowMs: 20, dropDb: 30 });
  measurements.push(M('dropout_count', 'Capture/signal dropout regions', drop.dropoutCount, 'regions', { confidence: .8 }));
  if (drop.dropoutCount > 0) findings.push({ code: 'SIGNAL_DROPOUT', title: 'Signal dropout regions detected', detail: `${drop.dropoutCount} low-level region(s), totaling ${drop.dropoutDurationSec.toFixed(3)} s, fell well below the surrounding signal.`, severity: 'review', confidence: .75, possibleCauses: ['source dropout', 'intermittent contact', 'capture discontinuity', 'intentional silence'], isolationTests: ['repeat capture', 'inspect contacts/cables', 'compare source waveform'] });
  const balance = find(measurements, 'channel_balance_db') ?? 0;
  const hum = Math.max(find(measurements, 'left_hum_dbfs') ?? -120, find(measurements, 'right_hum_dbfs') ?? -120);
  const corr = find(measurements, 'correlation') ?? 0;
  for (const hypothesis of reasonFromEvidence({ channelBalanceDb: balance, humDb: hum, correlation: corr, dropoutCount: drop.dropoutCount })) {
    if (findings.some(f => f.code === hypothesis.code)) continue;
    findings.push({ code: hypothesis.code, title: 'Diagnostic hypothesis', detail: hypothesis.summary, severity: 'review', confidence: hypothesis.confidence, possibleCauses: hypothesis.alternatives, isolationTests: hypothesis.isolationTests });
  }
  return { measurements, findings, score: Math.min(score, scoreFromFindings(findings)), eventMap: resultEventMap, evidence };
}

// ---------- evidence links (finding -> metric ids) ----------
const SUPPORT = {
  NO_SIGNAL: ['left_level_dbfs', 'right_level_dbfs'], MISSING_CHANNEL: ['left_level_dbfs', 'right_level_dbfs', 'channel_balance_db'],
  CHANNEL_IMBALANCE: ['channel_balance_db'], CHANNEL_PATH_IMBALANCE: ['channel_balance_db'],
  CLIPPING: ['clipped_samples'], DC_OFFSET: ['left_dc_offset', 'right_dc_offset'],
  DUAL_MONO_SUSPECTED: ['correlation'], POLARITY_INVERSION: ['correlation'], POLARITY_PATH: ['correlation'],
  MAINS_HUM: ['left_hum_dbfs', 'right_hum_dbfs'], HUM_PATH: ['left_hum_dbfs', 'right_hum_dbfs'],
  INTERMITTENT_PATH: ['dropout_count'], SIGNAL_DROPOUT: ['dropout_count'],
  SPEED_ERROR: ['pitch_percent', 'rpm', 'measured_frequency_hz'],
  SPEED_INSTABILITY: ['wow_flutter_rms_percent', 'peak_speed_deviation_percent', 'speed_modulation_1x_percent'],
  PITCH_TRACKING_ERROR: ['measured_pitch_percent', 'pitch_position'],
  DVS_SCOPE_DEFORMED: ['dvs_scope_circularity', 'dvs_ellipse_axis_ratio'], DVS_SIGNAL_GAP: ['dvs_missing_windows'],
  TRANSITION_INCOMPLETE: ['startup_envelope_90_sec', 'brake_envelope_10_sec'],
  SEPARATION_CONTEXT: ['channel_separation_db'], AZIMUTH_EVIDENCE: ['azimuth_separation_asymmetry_db'],
  ELEVATED_DISTORTION: ['left_thd_percent', 'right_thd_percent'], LOW_FREQUENCY_ENERGY: ['low_frequency_energy_dbfs'],
  VINYL_TRANSIENTS: ['vinyl_transients_per_min', 'vinyl_event_count', 'repeat_scan_persistent_events'],
  REPEATING_EVENT: ['vinyl_event_count'],
  CAPTURE_OVERRUN: ['capture_overrun_samples'], CAPTURE_STREAM_ERROR: ['capture_stream_errors'], CAPTURE_GAP: ['capture_max_callback_gap_ms'],
};
// Measurements whose value argues against the finding (metricId -> predicate on value).
const CONTRADICT = {
  ELEVATED_DISTORTION: { clipped_samples: v => v === 0 },
  SIGNAL_DROPOUT: { dvs_missing_windows: v => v === 0, capture_overrun_samples: v => v === 0 },
  VINYL_TRANSIENTS: { repeat_scan_resolved_events: v => v > 0 },
  SPEED_INSTABILITY: { speed_drift_percent: v => Math.abs(v) < .05 },
  MAINS_HUM: { channel_balance_db: v => Math.abs(v) < .5 },
  CHANNEL_IMBALANCE: { correlation: v => v > .95 },
  LOW_FREQUENCY_ENERGY: { vinyl_rumble_dbfs: v => v < -60 },
};

/** Attach supportedBy / contradictedBy metric-id lists derived from the run's measurements. */
export function linkEvidence(findings, measurements) {
  const byId = new Map(measurements.map(m => [m.metricId, m]));
  return findings.map(f => {
    const supportedBy = (SUPPORT[f.code] || []).filter(id => byId.has(id));
    const contradictedBy = Object.entries(CONTRADICT[f.code] || {})
      .filter(([id, test]) => byId.has(id) && Number.isFinite(byId.get(id).value) && test(byId.get(id).value)).map(([id]) => id);
    return { ...f, supportedBy, contradictedBy, alternatives: f.alternatives || f.possibleCauses || [] };
  });
}

// ---------- capture quality ----------
export function captureQualityMeasurements(quality) {
  if (!quality) return [];
  return [
    M('capture_overrun_samples', 'Capture buffer overrun samples', quality.overrunSamples ?? 0, 'samples', { confidence: 1 }),
    M('capture_stream_errors', 'Capture stream errors', quality.streamErrors ?? 0, 'errors', { confidence: 1 }),
    M('capture_max_callback_gap_ms', 'Longest capture callback gap', quality.maxCallbackGapMs ?? 0, 'ms', { confidence: .9 }),
  ];
}
export function captureQualityFindings(quality, streamErrorText = []) {
  if (!quality) return [];
  const out = [];
  const messages = [...(quality.streamErrorMessages || []), ...streamErrorText];
  if (quality.streamErrors > 0 || messages.length) out.push({ code: 'CAPTURE_STREAM_ERROR', title: 'Audio stream reported errors', detail: messages.join('; ') || `${quality.streamErrors} stream error(s).`, severity: 'review', confidence: 1, possibleCauses: ['device/driver interruption', 'buffer scheduling issue'], isolationTests: ['repeat capture', 'check device connection and driver'] });
  if (quality.overrunSamples > 0) out.push({ code: 'CAPTURE_OVERRUN', title: 'Capture buffer overruns', detail: `${quality.overrunSamples} samples were dropped because the capture buffer overflowed. Timing-based metrics may be affected.`, severity: 'warning', confidence: 1, possibleCauses: ['system load', 'driver buffer too small', 'USB bandwidth'], isolationTests: ['close other audio apps', 'increase driver buffer size', 'repeat capture'] });
  if (quality.maxCallbackGapMs > 100) out.push({ code: 'CAPTURE_GAP', title: 'Long gap between audio callbacks', detail: `Longest gap ${quality.maxCallbackGapMs.toFixed(1)} ms.`, severity: 'review', confidence: .8, possibleCauses: ['system load', 'power management'], isolationTests: ['repeat capture', 'disable USB power saving'] });
  if (quality.truncated) out.push({ code: 'CAPTURE_TRUNCATED', title: 'Capture reached its maximum length', detail: 'Recording stopped at the configured limit; later audio was not captured.', severity: 'informational', confidence: 1, possibleCauses: ['capture limit'], isolationTests: ['increase capture length'] });
  return out;
}

// ---------- calibration ----------
export function calibrateMeasurements(measurements, profile, ctx) {
  const reasons = profile ? profileInapplicableReasons(profile, { deviceName: ctx.deviceName, sampleRate: ctx.sampleRate }) : ['no calibration profile'];
  const applied = Boolean(profile) && isProfileApplicable(profile, { deviceName: ctx.deviceName, sampleRate: ctx.sampleRate });
  return { measurements: measurements.map(m => applyCalibration(m, applied ? profile : null, ctx)), applied, reasons };
}

// ---------- multi-run aggregation ----------
function aggregate(run, prior, test) {
  const same = prior.filter(r => r.test === test && r.deviceId === run.deviceId);
  const get = (r, id) => r.measurements.find(m => m.metricId === id)?.value;
  if (test === 'Channel separation') {
    const currentSep = get(run, 'channel_separation_db'), currentSide = get(run, 'separation_reference_channel');
    const opposite = same.find(r => get(r, 'separation_reference_channel') !== currentSide);
    const oppositeSep = opposite && get(opposite, 'channel_separation_db');
    if (Number.isFinite(currentSep) && Number.isFinite(oppositeSep)) {
      const asym = currentSide === 0 ? currentSep - oppositeSep : oppositeSep - currentSep;
      run.measurements.push(M('azimuth_separation_asymmetry_db', 'L/R separation asymmetry', asym, 'dB', { confidence: .7 }));
      run.findings.push({ code: 'AZIMUTH_EVIDENCE', title: 'Azimuth/alignment evidence available', detail: `Opposite isolated-channel captures differ by ${Math.abs(asym).toFixed(2)} dB in separation. This is evidence only and includes record/interface/path asymmetry.`, severity: 'informational', confidence: .65, possibleCauses: ['azimuth/alignment difference', 'cartridge channel asymmetry', 'test-record asymmetry', 'interface/path crosstalk'], isolationTests: ['repeat both isolated-channel tracks', 'measure interface loopback crosstalk', 'rotate/realign only after confirming repeatability'] });
    }
  }
  if (test === 'Vinyl side scan' && run.eventMap.length) {
    const previous = same.find(r => Array.isArray(r.eventMap) && r.eventMap.length);
    if (previous) {
      const cmp = compareEventMaps(previous.eventMap, run.eventMap, { tolerance: .01 });
      run.measurements.push(
        M('repeat_scan_persistent_events', 'Repeat-scan persistent candidates', cmp.persistent.length, 'events', { confidence: .7 }),
        M('repeat_scan_resolved_events', 'Previous candidates not repeated', cmp.resolved.length, 'events', { confidence: .65 }),
        M('repeat_scan_new_events', 'New candidates in repeat scan', cmp.newEvents.length, 'events', { confidence: .65 }),
      );
      run.repeatScan = { previousId: previous.id, previousSamples: previous.totalSamples ?? null, previousScore: get(previous, 'vinyl_condition_score'), persistent: cmp.persistent.length, resolved: cmp.resolved.length, newEvents: cmp.newEvents.length, beforeCount: previous.eventMap.length, afterCount: run.eventMap.length };
    }
  }
  if (test === 'Quartz lock') {
    const row = r => ({ mode: (get(r, 'quartz_mode_code') ?? 1) === 1 ? 'locked' : 'free', error: get(r, 'quartz_speed_error_percent') });
    const all = [...same.map(row), row(run)];
    const locked = repeatabilityMetrics(all.filter(x => x.mode === 'locked').map(x => x.error));
    const free = repeatabilityMetrics(all.filter(x => x.mode === 'free').map(x => x.error));
    if (locked.count) run.measurements.push(M('quartz_lock_mean_error_percent', 'Quartz/reset mean error', locked.mean, '%', { confidence: Math.min(1, locked.count / 10) }), M('quartz_lock_repeat_std_percent', 'Quartz/reset repeatability σ', locked.stdDev, '%', { confidence: Math.min(1, locked.count / 10) }));
    if (locked.count && free.count) run.measurements.push(M('center_to_lock_delta_percent', 'Free-center to quartz/reset delta', locked.mean - free.mean, '%', { confidence: Math.min(1, Math.min(locked.count, free.count) / 3) }));
  }
  if (test === 'Warm-up speed') {
    const point = r => ({ timeMin: get(r, 'warmup_elapsed_min'), value: get(r, 'warmup_speed_error_percent') });
    const points = [...same.map(point), point(run)];
    const trend = trendMetrics(points);
    run.evidence.trendPoints = points.filter(p => Number.isFinite(p.timeMin) && Number.isFinite(p.value)).map(p => ({ t: p.timeMin, v: p.value }));
    if (Number.isFinite(trend.slopePerMin)) run.measurements.push(M('warmup_drift_percent_per_min', 'Warm-up drift trend', trend.slopePerMin, '%/min', { confidence: Math.min(1, trend.count / 5) }), M('warmup_trend_r2', 'Warm-up trend fit R²', trend.rSquared, 'ratio', { confidence: Math.min(1, trend.count / 5) }));
  }
  if (test === 'Pitch map') {
    const pointFromRun = r => {
      const pos = get(r, 'pitch_position'), measured = get(r, 'measured_pitch_percent'), dir = get(r, 'pitch_direction_code');
      return Number.isFinite(pos) && Number.isFinite(measured) ? { position: pos, measuredPercent: measured, direction: dir === 1 ? 'up' : dir === -1 ? 'down' : 'unknown' } : null;
    };
    const points = [...same.map(pointFromRun).filter(Boolean)];
    const current = pointFromRun(run); if (current) points.push(current);
    const map = pitchMapMetrics(points);
    const conf = d => Math.min(1, points.length / d);
    run.evidence.pitchPoints = points;
    if (Number.isFinite(map.slope)) run.measurements.push(M('pitch_map_slope', 'Pitch map slope', map.slope, 'measured/input', { confidence: conf(6) }));
    run.measurements.push(
      M('pitch_map_nonlinearity', 'Pitch-map maximum nonlinearity', map.maxNonlinearityPercent, '%', { confidence: conf(6) }),
      M('pitch_map_hysteresis', 'Pitch-map hysteresis', map.hysteresisPercent, '%', { confidence: conf(8) }),
      M('pitch_map_dead_spots', 'Pitch-map dead-spot candidates', map.deadSpotCount, 'segments', { confidence: conf(8) }),
      M('pitch_map_max_error', 'Pitch-map maximum absolute error', map.maxMappingErrorPercent, '%', { confidence: conf(6) }),
      M('pitch_map_rms_error', 'Pitch-map RMS error', map.rmsMappingErrorPercent, '%', { confidence: conf(6) }),
      M('pitch_map_monotonicity_failures', 'Pitch-map monotonicity failures', map.monotonicityFailures, 'segments', { confidence: conf(8) }),
      M('pitch_map_zero_offset', 'Pitch zero-point offset', map.zeroOffsetPercent, '%', { confidence: conf(6) }),
      M('pitch_map_positive_gain', 'Positive-side pitch gain', map.positiveGain, 'ratio', { confidence: conf(6) }),
      M('pitch_map_negative_gain', 'Negative-side pitch gain', map.negativeGain, 'ratio', { confidence: conf(6) }),
    );
  }
}

/**
 * Full pipeline: analyze, add capture quality, calibrate, aggregate with prior runs,
 * link evidence and score. Returns a run record ready to persist.
 */
export function buildRun({ test, workflowId, audio, params = {}, source, device = null, prior = [], quality = null, streamErrors = [], profile = null, deviceName = '' }) {
  const result = analyzeForTest(test, audio, params);
  result.measurements.push(...captureQualityMeasurements(quality));
  result.findings.push(...captureQualityFindings(quality, streamErrors));
  const ctx = { deviceName, sampleRate: audio.sampleRate, referenceHz: Number(params.referenceHz) || 1000, nominalRpm: Number(params.nominalRpm) || 33.333333, windowSec: .5, windowSamples: Math.floor(audio.sampleRate * .5) };
  const cal = calibrateMeasurements(result.measurements, profile, ctx);
  const run = {
    id: uid('run'), workflow: workflowId, sessionType: workflowId, deviceId: device?.id || null, device: device?.name || 'Unassigned', test,
    createdAt: new Date().toISOString(), sourceFile: source, durationSec: audio.durationSec, sampleRate: audio.sampleRate, channels: audio.channels,
    totalSamples: audio.left.length, params: { ...params }, measurements: cal.measurements, findings: result.findings, score: result.score,
    eventMap: result.eventMap || [], evidence: result.evidence, quality: quality || null,
    calibration: { applied: cal.applied, reasons: cal.reasons, profileCreatedAt: cal.applied ? profile.createdAt : null, deviceName },
  };
  aggregate(run, prior, test);
  run.findings = linkEvidence(run.findings, run.measurements);
  run.score = Math.min(run.score, scoreFromFindings(run.findings));
  return run;
}
