// FS-12 guided benchmark contracts. Measurements come from the existing analysis
// engine; this module keeps capture provenance and decides whether a comparison is usable.
import { findFormat } from './timecode.js';
import { dbfs, toneAmplitude } from './core.js';

export const GUIDED_BENCHMARK_VERSION = 1;
export const BENCHMARK_STEPS = Object.freeze([
  { id: 'tone', label: 'Stereo 1 kHz tone', test: 'Channel & cartridge', seconds: 10, instruction: 'Play the 1 kHz reference track in both channels.' },
  { id: 'left', label: 'Left-only 1 kHz track', test: 'Channel separation', seconds: 10, instruction: 'Play the left-only 1 kHz track. Keep the gain and routing unchanged.' },
  { id: 'right', label: 'Right-only 1 kHz track', test: 'Channel separation', seconds: 10, instruction: 'Play the right-only 1 kHz track. Keep the gain and routing unchanged.' },
  { id: 'timecode', label: 'Control vinyl', test: 'DVS signal', seconds: 15, instruction: 'Play the selected control vinyl forward at the recorded speed.' },
].map(Object.freeze));

const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = (value, name, required = true) => {
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > 200) throw new Error(`${name} must be ${required ? 'recorded and ' : ''}at most 200 characters.`);
  return value.trim();
};

export function benchmarkConfig(input) {
  if (!finite(input.hoursAt) || input.hoursAt < 0 || input.hoursAt > 1_000_000) throw new Error('Hours at benchmark must be between 0 and 1000000.');
  if (!finite(input.trackingForce) || input.trackingForce <= 0) throw new Error('Record the tracking force in grams.');
  if (![33.333333, 45].includes(input.nominalRpm)) throw new Error('Choose 33⅓ or 45 RPM.');
  if (input.pairs != null && (!Array.isArray(input.pairs) || input.pairs.length !== 1 || !Number.isSafeInteger(input.pairs[0]) || input.pairs[0] < 1)) throw new Error('Choose one stereo input pair.');
  if (input.timecodeFormat && !findFormat(input.timecodeFormat)) throw new Error('Choose a known control vinyl format.');
  return {
    assetId: text(input.assetId, 'Cartridge'), assetName: text(input.assetName || input.assetId, 'Cartridge name'), hoursAt: input.hoursAt,
    record: text(input.record, 'Test record'), side: text(input.side, 'Record side'), trackingForce: input.trackingForce,
    vta: text(input.vta, 'VTA / tonearm setting'), chain: text(input.chain, 'Signal chain'),
    setupId: input.setupId ? text(input.setupId, 'Saved setup') : null,
    deviceName: text(input.deviceName || '', 'Input', false), pairs: copy(input.pairs),
    nominalRpm: input.nominalRpm, timecodeFormat: text(input.timecodeFormat || '', 'Control vinyl format', false),
    sameConditions: input.sameConditions === true,
  };
}

/** A replacement starts new trends without deleting any historical benchmarks. */
export function benchmarksSinceReplacement(history, baseline) {
  const rows = Array.isArray(history) ? history : [];
  if (!baseline) return rows.slice();
  const time = Date.parse(baseline);
  if (!Number.isFinite(time)) return [];
  return rows.filter(row => {
    if (row.detail?.source === 'guided-capture') {
      const captures = row.detail.steps, expected = benchmarkSteps(row.detail.conditions || {});
      return Array.isArray(captures) && captures.length === expected.length && captures.every((record, index) => {
        const start = Date.parse(record.capture?.startedAt), end = Date.parse(record.capture?.endedAt);
        return record.step === expected[index].id && Number.isFinite(start) && Number.isFinite(end) && start >= time && end >= start;
      });
    }
    const at = Date.parse(row.createdAt ?? row.created_at);
    return Number.isFinite(at) && at >= time;
  });
}

export const benchmarkSteps = config => BENCHMARK_STEPS.filter(step => step.id !== 'timecode' || config.timecodeFormat);

export function validateBenchmarkCapture(result, step) {
  if (result?.preempted) throw new Error('Another feature took over this capture. Repeat this step.');
  const a = result?.audio;
  if (!a || !finite(a.sampleRate) || a.sampleRate <= 0 || !Number.isInteger(a.channels) || a.channels < 2 || !a.left?.length || a.left.length !== a.right?.length) throw new Error('This benchmark needs a complete stereo capture.');
  if (a.left.length / a.sampleRate < step.seconds) throw new Error(`The ${step.label} capture is incomplete. Record at least ${step.seconds} seconds.`);
  for (const samples of [a.left, a.right]) if (!samples.every(finite)) throw new Error('The capture contains invalid samples.');
  const required = step.id === 'left' ? [a.left] : step.id === 'right' ? [a.right] : [a.left, a.right];
  if (required.some(samples => !samples.some(value => value !== 0))) throw new Error('The expected reference channel contains no signal.');
  return a;
}

const measured = (run, id) => {
  const value = run.measurements?.find(m => m.metricId === id)?.value;
  if (!finite(value)) throw new Error(`The capture did not produce a finite ${id} measurement. Repeat this step.`);
  return value;
};

/** Keep evidence even when integrity is uncertain; uncertain rows never enter a trend. */
export function benchmarkStepRecord(step, result, run, profile) {
  const a = validateBenchmarkCapture(result, step), issues = [];
  if (!run?.id || run.test !== step.test) throw new Error('The saved analysis does not belong to this benchmark step.');
  const values = step.id === 'tone'
    ? { leftThdPercent: measured(run, 'left_thd_percent'), rightThdPercent: measured(run, 'right_thd_percent') }
    : step.id === 'timecode'
      ? { tcSnrDb: measured(run, 'tc_snr_db'), tcPhaseErrorDeg: measured(run, 'tc_phase_error_deg'), tcDropouts: measured(run, 'tc_dropouts') }
      : { separationDb: measured(run, 'channel_separation_db') };
  const quality = result.quality;
  const counts = ['framesCaptured', 'overrunSamples', 'streamErrors', 'clippedSamplesL', 'clippedSamplesR', 'callbackCount'];
  if (!quality || counts.some(key => !Number.isSafeInteger(quality[key]) || quality[key] < 0) || !finite(quality.maxCallbackGapMs) || quality.maxCallbackGapMs < 0 || typeof quality.truncated !== 'boolean') {
    issues.push('Capture integrity counters are unavailable or invalid.');
  } else {
    if (quality.framesCaptured !== a.left.length || quality.callbackCount === 0) issues.push('Capture counters do not match the recorded samples.');
    if (quality.overrunSamples > 0 || quality.streamErrors > 0 || quality.maxCallbackGapMs > 100 || quality.truncated) issues.push('The capture reports a gap, dropped samples, stream errors or truncation.');
    if (quality.clippedSamplesL > 0 || quality.clippedSamplesR > 0) issues.push('The capture clipped; repeat with the input gain corrected.');
  }
  if (!Array.isArray(result.streamErrors) || result.streamErrors.length || !Array.isArray(quality?.streamErrorMessages) || quality.streamErrorMessages.length) issues.push('Stream error evidence is missing or reports an error.');
  if (run.measurements?.some(m => m.metricId === 'clipped_samples' && m.value > 0)) issues.push('Analysis detected clipped input samples.');
  if (!run.calibration || typeof run.calibration.applied !== 'boolean' || (profile && !run.calibration.applied) || (!profile && run.calibration?.applied)) issues.push('Calibration applicability is unverified or mismatched.');
  const pair = a.pairs?.[0]?.pair;
  if (!pair || pair.mono || !Number.isSafeInteger(pair.first) || pair.first < 1 || pair.second !== pair.first + 1) issues.push('The recorded stereo input pair is unverified.');
  if (typeof result.deviceName !== 'string' || !result.deviceName.trim()) issues.push('The actual input device is unverified.');
  // The existing tone analyzer requires measurable energy at its declared
  // reference frequency. Reuse the Level-0 presence floor from core.js; DC or a
  // wrong track must not turn the analyzer's finite fallback into a clean trend.
  const reference = step.id === 'timecode' ? null : {
    hz: 1000, method: 'reference-tone-rms', presenceFloorDbfs: -70,
    channels: (step.id === 'left' ? ['left'] : step.id === 'right' ? ['right'] : ['left', 'right'])
      .map(channel => ({ channel, levelDbfs: dbfs(toneAmplitude(a[channel], a.sampleRate, 1000) / Math.SQRT2) })),
  };
  if (reference && (a.sampleRate <= 2000 || reference.channels.some(channel => !finite(channel.levelDbfs) || channel.levelDbfs <= reference.presenceFloorDbfs))) issues.push('The 1 kHz reference tone is not measurable above the existing signal-presence floor. Verify the track, speed and gain, then repeat.');
  if (step.id === 'timecode' && run.measurements?.find(m => m.metricId === 'tc_direction_code')?.value !== 1) issues.push('Forward control-vinyl play is unverified or reversed. Check the format, routing and direction, then repeat.');
  return {
    step: step.id, runId: run.id, assetId: run.assetId ?? run.deviceId ?? null, values,
    context: {
      deviceName: result.deviceName || null, sampleRate: a.sampleRate,
      pair: pair ? { first: pair.first, second: pair.second, mono: pair.mono === true } : null,
      calibration: copy(run.calibration), calibrationProfile: copy(profile),
    },
    capture: copy(run.capture), quality: copy(quality), streamErrors: copy(result.streamErrors), reference,
    measurements: copy(run.measurements), issues,
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const conditionKeys = ['record', 'side', 'trackingForce', 'vta', 'chain', 'setupId', 'nominalRpm', 'timecodeFormat'];

export function guidedBenchmarkPayload(config, records, history = []) {
  const steps = benchmarkSteps(config);
  if (records.length !== steps.length || steps.some((step, index) => records[index]?.step !== step.id)) throw new Error('Complete each required benchmark step before saving.');
  if (new Set(records.map(record => record.runId)).size !== records.length) throw new Error('Each benchmark step needs its own saved run.');
  const first = records[0], issues = records.flatMap(record => record.issues.map(issue => `${record.step}: ${issue}`));
  for (const record of records) {
    if (record.assetId !== config.assetId) throw new Error('A capture belongs to a different cartridge. Repeat the benchmark.');
    if (!same(record.context, first.context)) issues.push(`${record.step}: input, sample rate, pair or calibration changed between steps.`);
    if (config.deviceName && record.context.deviceName !== config.deviceName) issues.push(`${record.step}: the actual input differs from the selected input.`);
    if (config.pairs && record.context.pair?.first !== config.pairs[0]) issues.push(`${record.step}: the actual pair differs from the selected pair.`);
  }
  if (!config.sameConditions) issues.push('The operator marked the conditions as different from the baseline.');
  const candidates = history.filter(row => row.valid !== false && row.valid !== 0 && row.detail?.source === 'guided-capture');
  if (candidates.some(row => !Number.isFinite(Date.parse(row.createdAt ?? row.created_at)))) issues.push('A guided baseline has an unverified date; comparison order cannot be established.');
  const prior = candidates.filter(row => Number.isFinite(Date.parse(row.createdAt ?? row.created_at)))
    .sort((a, b) => Date.parse(a.createdAt ?? a.created_at) - Date.parse(b.createdAt ?? b.created_at) || String(a.id ?? a.sessionId).localeCompare(String(b.id ?? b.sessionId)))[0];
  if (prior) {
    if (prior.detail.version !== GUIDED_BENCHMARK_VERSION) issues.push('The guided benchmark analysis version differs from the baseline.');
    const baseline = prior.detail.conditions;
    if (!baseline || conditionKeys.some(key => !same(baseline[key], config[key]))) issues.push('The recorded test conditions differ from the guided baseline.');
    if (!same(prior.detail.steps?.[0]?.context, first.context)) issues.push('The input, sample rate, pair or calibration differs from the guided baseline.');
  }
  const tone = records[0].values, left = records[1].values, right = records[2].values;
  return {
    assetId: config.assetId, setupId: config.setupId, sessionId: first.runId, hoursAt: config.hoursAt,
    thdPercent: (tone.leftThdPercent + tone.rightThdPercent) / 2,
    separationDb: Math.min(left.separationDb, right.separationDb),
    ...(records[3]?.values || {}), valid: issues.length === 0,
    detail: {
      source: 'guided-capture', version: GUIDED_BENCHMARK_VERSION,
      conditions: copy(config), runs: records.map(record => record.runId), steps: copy(records),
      separationMethod: 'poorer-isolated-channel', issues: [...new Set(issues)],
      conditionEvidence: prior ? 'recorded-baseline-and-operator' : history.length ? 'operator-confirmed-legacy-baseline' : 'new-guided-baseline',
    },
  };
}
