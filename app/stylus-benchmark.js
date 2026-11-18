// FS-12 guided benchmark contracts. Measurements come from the existing analysis
// engine; this module keeps capture provenance and decides whether a comparison is usable.
import { findFormat } from './timecode.js';
import { dbfs, toneAmplitude, estimateToneFrequency } from './core.js';
import { profileInapplicableReasons, refineToneFrequency } from './calibration.js';
import { welchSpectrum, analyzeSpectrum } from './feedback.js';
import { thdPercent, channelSeparationDb } from './diagnostics.js';

export const GUIDED_BENCHMARK_VERSION = 3;
export const GUIDED_MEASUREMENT_METHOD = 'hann-measured-reference-power-v3';
export const GUIDED_DETAIL_LIMIT = 64 * 1024; // src-tauri/src/stylus.rs MAX_DETAIL_BYTES
export const BENCHMARK_STEPS = Object.freeze([
  { id: 'tone', label: 'Stereo 1 kHz tone', test: 'Channel & cartridge', seconds: 10, instruction: 'Play the 1 kHz reference track in both channels.' },
  { id: 'left', label: 'Left-only 1 kHz track', test: 'Channel separation', seconds: 10, instruction: 'Play the left-only 1 kHz track. Keep the gain and routing unchanged.' },
  { id: 'right', label: 'Right-only 1 kHz track', test: 'Channel separation', seconds: 10, instruction: 'Play the right-only 1 kHz track. Keep the gain and routing unchanged.' },
  { id: 'timecode', label: 'Control vinyl', test: 'DVS signal', seconds: 15, instruction: 'Play the selected control vinyl forward at the recorded speed.' },
].map(Object.freeze));

const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const stereoPair = pair => pair?.mono === false && Number.isSafeInteger(pair.first) && pair.first > 0 && pair.first < 65535 && pair.first % 2 === 1 && pair.second === pair.first + 1;
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

/** An absent profile is an explicit uncalibrated observation; rejected profiles remain evidence. */
export function benchmarkCalibration(profile, { deviceName, sampleRate, state = profile ? 'calibrated' : 'none', reasons = [] } = {}) {
  const issues = [];
  if (profile) {
    if (typeof profile.deviceName !== 'string' || !profile.deviceName.trim()) issues.push('The calibration profile has no verified device identity.');
    issues.push(...profileInapplicableReasons(profile, { deviceName: typeof profile.deviceName === 'string' ? deviceName : undefined, sampleRate }));
  }
  if (state === 'mismatch') issues.push(...(Array.isArray(reasons) && reasons.length ? reasons : ['The stored calibration is not applicable to this input.']));
  else if (!['calibrated', 'none'].includes(state) || (state === 'calibrated' && !profile)) issues.push('Calibration selection is unverified.');
  return { state: issues.length ? 'rejected' : profile ? 'applied' : 'uncalibrated', reportedState: state, reasons: [...new Set(issues)], profile: copy(profile) };
}

// This is a readiness observation, not identification of the physical track.
// Welch locates the broad peak so a weak 1 kHz harmonic of a 500 Hz track cannot
// masquerade as a clean reference. Strong H2–H5 remain legitimate THD evidence.
function referenceEvidence(step, audio) {
  if (step.id === 'timecode') return null;
  const hz = 1000, harmonics = 5, tolerancePercent = .3; // existing Speed & pitch review criterion
  const maxWindowSec = .5; // existing Speed & pitch frequency-trace window
  const presenceFloorDbfs = -70; // existing Level-0 reference-presence floor
  const tapers = new Map();
  const tapered = samples => {
    const n = samples.length;
    let taper = tapers.get(n);
    if (!taper) {
      const weights = new Float64Array(n); let sumWeights = 0, sumSquaredWeights = 0;
      // Same periodic Hann definition as the existing Welch/audio-quality paths.
      // Compute actual gain and ENBW for each window length, including boundaries.
      for (let i = 0; i < n; i++) { const weight = .5 - .5 * Math.cos(2 * Math.PI * i / n); weights[i] = weight; sumWeights += weight; sumSquaredWeights += weight * weight; }
      const coherentGain = sumWeights / n;
      taper = { weights, basis: { samples: n, sumWeights, sumSquaredWeights, coherentGain,
        noiseBandwidthBins: n * sumSquaredWeights / (sumWeights * sumWeights), effectiveSamples: sumWeights * sumWeights / sumSquaredWeights } };
      tapers.set(n, taper);
    }
    return Float64Array.from(samples, (sample, index) => sample * taper.weights[index] / taper.basis.coherentGain);
  };
  const family = observedPeakHz => {
    const dominantHarmonic = Math.round(observedPeakHz / hz);
    const familyReferenceHz = dominantHarmonic >= 1 && dominantHarmonic <= harmonics ? observedPeakHz / dominantHarmonic : null;
    return { observedPeakHz, dominantHarmonic, familyReferenceHz, differencePercent: familyReferenceHz === null ? null : (familyReferenceHz / hz - 1) * 100 };
  };
  const channels = (step.id === 'left' ? ['left'] : step.id === 'right' ? ['right'] : ['left', 'right']).map(channel => {
    const samples = audio[channel], sampleRate = audio.sampleRate;
    const observation = { channel, levelDbfs: null, nominalCoherentLevelDbfs: dbfs(toneAmplitude(samples, sampleRate, hz) / Math.SQRT2), spectrumSamples: samples.length,
      broadPeakHz: null, observedPeakHz: null, dominantHarmonic: null, familyReferenceHz: null, differencePercent: null, fftBinHz: null, summaryWindowIndex: null, windows: [] };
    if (sampleRate <= hz * 2 || samples.length < 256) return observation;
    const spectrum = welchSpectrum(samples, sampleRate);
    const upper = Math.min(20000, sampleRate / 2 - spectrum.binHz);
    if (upper <= 20 + spectrum.binHz) return observation;
    const broadPeakHz = analyzeSpectrum(spectrum, { band: [20, upper] }).peakHz;
    // Every sample belongs to one contiguous window. Each local estimator sees
    // that entire window (under its internal two-second cap), so neither an
    // introductory tone nor an outro can overwrite the remainder's evidence.
    const count = Math.ceil(samples.length / Math.floor(sampleRate * maxWindowSec));
    const windows = Array.from({ length: count }, (_, index) => {
      const startSample = Math.floor(index * samples.length / count), endSample = Math.floor((index + 1) * samples.length / count);
      const window = samples.subarray(startSample, endSample);
      // Scale FFT length with the window to keep the search's frequency spacing
      // useful across input rates; Welch and refinement use the same samples.
      const localSpectrum = welchSpectrum(window, sampleRate, { nfft: 2 ** Math.floor(Math.log2(window.length / 2)) });
      const localUpper = Math.min(20000, sampleRate / 2 - localSpectrum.binHz);
      const localPeak = analyzeSpectrum(localSpectrum, { band: [20, localUpper] }).peakHz;
      const estimatedPeakHz = estimateToneFrequency(window, sampleRate, { minHz: Math.max(20, localPeak - localSpectrum.binHz), maxHz: Math.min(localUpper, localPeak + localSpectrum.binHz), coarseStepHz: .5 });
      const observed = family(refineToneFrequency(window, sampleRate, estimatedPeakHz).frequencyHz);
      const fundamentalHz = observed.familyReferenceHz;
      const weighted = tapered(window);
      const observable = finite(fundamentalHz) && fundamentalHz > 0 && fundamentalHz < sampleRate / 2;
      const rectangularFundamentalAmplitude = observable ? toneAmplitude(window, sampleRate, fundamentalHz) : null;
      const fundamentalAmplitude = observable ? toneAmplitude(weighted, sampleRate, fundamentalHz) : null;
      const present = finite(fundamentalAmplitude) && dbfs(fundamentalAmplitude / Math.SQRT2) > presenceFloorDbfs;
      const rectangularPresent = finite(rectangularFundamentalAmplitude) && dbfs(rectangularFundamentalAmplitude / Math.SQRT2) > presenceFloorDbfs;
      const familyReady = finite(observed.differencePercent) && Math.abs(observed.differencePercent) <= tolerancePercent;
      const harmonicsObservable = observable && sampleRate / 2 > hz * harmonics && sampleRate / 2 > fundamentalHz * harmonics;
      // Evaluate the same complete window at its observed fundamental. A nominal
      // whole-capture projection can cancel despite a valid nearby reference.
      // Keep unresolved or unobservable measurements unavailable, never zero.
      const measurement = step.id === 'tone'
        ? { thdPercent: familyReady && present && harmonicsObservable ? thdPercent(weighted, sampleRate, fundamentalHz, { harmonics }) : null,
          rectangularThdPercent: familyReady && rectangularPresent && harmonicsObservable ? thdPercent(window, sampleRate, fundamentalHz, { harmonics }) : null }
        : { leakAmplitude: observable ? toneAmplitude(tapered(audio[channel === 'left' ? 'right' : 'left'].subarray(startSample, endSample)), sampleRate, fundamentalHz) : null,
          rectangularLeakAmplitude: observable ? toneAmplitude(audio[channel === 'left' ? 'right' : 'left'].subarray(startSample, endSample), sampleRate, fundamentalHz) : null };
      // Retain broad/coarse/refined observations separately. Sample bounds and
      // the recorded sample rate give exact relative timing without duplicating
      // rounded timestamps or dropping any window from bounded detail storage.
      return { startSample, endSample, broadPeakHz: localPeak, estimatedPeakHz, observedPeakHz: observed.observedPeakHz,
        dominantHarmonic: observed.dominantHarmonic, differencePercent: observed.differencePercent, fftBinHz: localSpectrum.binHz, fundamentalAmplitude, rectangularFundamentalAmplitude, ...measurement };
    });
    const error = window => finite(window.differencePercent) ? Math.abs(window.differencePercent) : Infinity;
    const summaryWindowIndex = windows.reduce((worst, window, index) => error(window) > error(windows[worst]) ? index : worst, 0);
    // The worst window summarizes eligibility; averaging would conceal opposing
    // errors. The full-capture broad peak remains an independent observation.
    const levelDbfs = windows.every(window => finite(window.fundamentalAmplitude)) ? Math.min(...windows.map(window => dbfs(window.fundamentalAmplitude / Math.SQRT2))) : null;
    return { ...observation, levelDbfs, broadPeakHz, ...family(windows[summaryWindowIndex].observedPeakHz), fftBinHz: spectrum.binHz, summaryWindowIndex, windows };
  });
  return { hz, harmonics, method: 'hann-measured-tone-rms-and-windowed-harmonic-family', presenceFloorDbfs,
    windowing: { name: 'periodic-Hann', normalization: 'coherent-gain', byLength: [...tapers.values()].map(taper => taper.basis) },
    tolerancePercent, maxWindowSec, nyquistHz: audio.sampleRate / 2, requiredUpperHz: hz * harmonics, channels };
}

/** Guided-only measurements and readiness share the same complete windows.
 * Pool powers with sample-count weights; coherent phases and percentage means
 * would mismeasure references whose frequency, level or phase changes over time.
 * Calibration is applied once by buildRun, after this uncalibrated aggregation.
 */
export function measureGuidedBenchmarkStep(stepId, audio) {
  const step = BENCHMARK_STEPS.find(value => value.id === stepId && value.id !== 'timecode');
  if (!step) throw new Error('Choose a guided tone or isolated-channel analysis step.');
  validateBenchmarkCapture({ audio }, step);
  const reference = referenceEvidence(step, audio), issues = [];
  const values = {};
  for (const channel of reference.channels) {
    const available = channel.windows.length > 0 && finite(channel.levelDbfs) && channel.levelDbfs > reference.presenceFloorDbfs
      && channel.windows.every(window => finite(window.differencePercent) && Math.abs(window.differencePercent) <= reference.tolerancePercent && finite(step.id === 'tone' ? window.thdPercent : window.leakAmplitude));
    let value = null;
    if (available) {
      let fundamentalEnergy = 0, otherEnergy = 0, samples = 0;
      for (const window of channel.windows) {
        const n = window.endSample - window.startSample, power = window.fundamentalAmplitude ** 2;
        fundamentalEnergy += n * power;
        otherEnergy += n * (step.id === 'tone' ? power * (window.thdPercent / 100) ** 2 : window.leakAmplitude ** 2);
        samples += n;
      }
      const pooled = step.id === 'tone' ? 100 * Math.sqrt(otherEnergy / fundamentalEnergy)
        : channelSeparationDb(Math.sqrt(fundamentalEnergy / samples), Math.sqrt(otherEnergy / samples));
      if (finite(pooled)) value = pooled;
    }
    values[step.id === 'tone' ? channel.channel + 'ThdPercent' : 'separationDb'] = value;
  }
  if (reference.channels.some(channel => !finite(channel.levelDbfs) || channel.levelDbfs <= reference.presenceFloorDbfs)) issues.push('The observed 1 kHz reference family is not measurable above the existing signal-presence floor in every capture window. Verify the track, speed and gain, then repeat.');
  if (reference.channels.some(channel => !finite(channel.differencePercent) || Math.abs(channel.differencePercent) > reference.tolerancePercent)) issues.push('The observed dominant signal is not consistent with the declared 1 kHz reference or its measured harmonics in every capture window within the existing speed-review criterion. Reference readiness is uncertain; verify the track and speed.');
  if (step.id === 'tone' && (audio.sampleRate / 2 <= reference.requiredUpperHz || reference.channels.some(channel => channel.windows.some(window => window.dominantHarmonic >= 1 && window.dominantHarmonic <= reference.harmonics && window.observedPeakHz / window.dominantHarmonic * reference.harmonics >= audio.sampleRate / 2)))) issues.push('The sample rate cannot observe all five harmonics required for this THD benchmark.');
  if (Object.values(values).some(value => !finite(value))) issues.push('A guided measurement is unavailable because one or more complete windows lack a measurable reference or the required harmonic coverage. No missing window was discarded.');
  return { version: GUIDED_BENCHMARK_VERSION, method: GUIDED_MEASUREMENT_METHOD, step: step.id, test: step.test,
    sampleRate: audio.sampleRate, totalSamples: audio.left.length, reference, values, issues };
}

export function validateBenchmarkCapture(result, step) {
  if (result?.preempted) throw new Error('Another feature took over this capture. Repeat this step.');
  const a = result?.audio;
  const samples = value => value instanceof Float32Array || value instanceof Float64Array;
  if (!a || !finite(a.sampleRate) || a.sampleRate <= 0 || !Number.isInteger(a.channels) || a.channels < 2 || !samples(a.left) || !samples(a.right) || !a.left.length || a.left.length !== a.right.length) throw new Error('This benchmark needs a complete stereo capture.');
  if (a.left.length / a.sampleRate < step.seconds) throw new Error(`The ${step.label} capture is incomplete. Record at least ${step.seconds} seconds.`);
  if (a.left.length / a.sampleRate > step.seconds + 5) throw new Error('The capture exceeds its bounded native recording window. Repeat this step.');
  for (const samples of [a.left, a.right]) if (!samples.every(finite)) throw new Error('The capture contains invalid samples.');
  const required = step.id === 'left' ? [a.left] : step.id === 'right' ? [a.right] : [a.left, a.right];
  if (required.some(samples => !samples.some(value => value !== 0))) throw new Error('The expected reference channel contains no signal.');
  return a;
}

const measured = (run, id, allowUnavailable = false) => {
  const value = run.measurements?.find(m => m.metricId === id)?.value;
  if (allowUnavailable && value === null) return null;
  if (!finite(value)) throw new Error(`The capture did not produce a finite ${id} measurement. Repeat this step.`);
  return value;
};

/** Keep evidence even when integrity is uncertain; uncertain rows never enter a trend. */
export function benchmarkStepRecord(step, result, run, profile, { captureInfo = result?.captureInfo, calibrationObservation = null } = {}) {
  const a = validateBenchmarkCapture(result, step), issues = [];
  if (!run?.id || run.test !== step.test) throw new Error('The saved analysis does not belong to this benchmark step.');
  const analysis = run.evidence?.guidedBenchmarkAnalysis;
  const guided = analysis?.version === GUIDED_BENCHMARK_VERSION && analysis.method === GUIDED_MEASUREMENT_METHOD && analysis.step === step.id
    && analysis.test === step.test && analysis.sampleRate === a.sampleRate && analysis.totalSamples === a.left.length
    && run.sampleRate === a.sampleRate && run.totalSamples === a.left.length && run.params?.referenceHz === 1000
    && analysis.values && Array.isArray(analysis.issues) && Array.isArray(analysis.reference?.channels);
  if (step.id !== 'timecode') {
    if (!guided) issues.push('The source run lacks matching guided measured-reference analysis. Its original measurements are retained but cannot qualify this benchmark.');
    else {
      issues.push(...analysis.issues);
      const ids = step.id === 'tone' ? [['leftThdPercent', 'left_thd_percent'], ['rightThdPercent', 'right_thd_percent']] : [['separationDb', 'channel_separation_db']];
      for (const [key, id] of ids) {
        const measurement = run.measurements?.find(value => value.metricId === id);
        const rawValue = measurement && Object.hasOwn(measurement, 'rawValue') ? measurement.rawValue : measurement?.value;
        if (rawValue !== analysis.values[key] || !measurement?.qualityFlags?.includes(GUIDED_MEASUREMENT_METHOD)) issues.push('The source measurement does not match its retained guided analysis basis.');
      }
    }
  }
  const values = step.id === 'tone'
    ? { leftThdPercent: measured(run, 'left_thd_percent', guided), rightThdPercent: measured(run, 'right_thd_percent', guided) }
    : step.id === 'timecode'
      ? { tcSnrDb: measured(run, 'tc_snr_db'), tcPhaseErrorDeg: measured(run, 'tc_phase_error_deg'), tcDropouts: measured(run, 'tc_dropouts') }
      : { separationDb: measured(run, 'channel_separation_db', guided) };
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
  const calibration = calibrationObservation || benchmarkCalibration(profile, { deviceName: result.deviceName, sampleRate: a.sampleRate });
  if (calibration.state === 'rejected') issues.push(...calibration.reasons.map(reason => `Calibration rejected: ${reason}`));
  const pair = a.pairs?.[0]?.pair;
  if (a.pairs?.length !== 1 || !stereoPair(pair)) issues.push('The recorded stereo input pair is unverified.');
  if (typeof result.deviceName !== 'string' || !result.deviceName.trim()) issues.push('The actual input device is unverified.');
  const nativeFields = a.nativeFields;
  if (!nativeFields || ['left', 'right', 'sampleRate', 'channels', 'deviceName', 'pairs', 'streamErrors'].some(key => nativeFields[key]?.present !== true || nativeFields[key]?.valid !== true)) {
    issues.push('Native payload observations are missing or invalid; compatibility defaults are not benchmark evidence.');
  } else if (nativeFields.left.samples !== a.left.length || nativeFields.right.samples !== a.right.length || nativeFields.sampleRate.value !== a.sampleRate || nativeFields.channels.value !== a.channels || nativeFields.deviceName.value !== result.deviceName || nativeFields.pairs.value?.[0]?.first !== pair?.first || nativeFields.pairs.value?.[0]?.second !== pair?.second || nativeFields.pairs.value?.[0]?.mono !== pair?.mono) {
    issues.push('The converted audio disagrees with the original native payload observations.');
  }
  const openPair = captureInfo?.pairs?.[0];
  if (!captureInfo || typeof captureInfo.deviceName !== 'string' || !captureInfo.deviceName.trim() || !Number.isSafeInteger(captureInfo.sampleRate) || captureInfo.sampleRate <= 0 || !Number.isInteger(captureInfo.channels) || captureInfo.channels < 2 || captureInfo.pairs?.length !== 1 || !stereoPair(openPair)) {
    issues.push('Native capture-start input, rate or stereo pair evidence is unavailable.');
  } else if (captureInfo.deviceName !== result.deviceName || captureInfo.sampleRate !== a.sampleRate || captureInfo.channels !== a.channels || openPair.first !== pair?.first || openPair.second !== pair?.second || openPair.mono !== pair?.mono) {
    issues.push('Native capture-start and recorded input, sample rate or pair disagree.');
  }
  // Readiness and measured values were derived together before calibration and
  // persistence. Never repair a benchmark from different, already-saved metrics.
  const reference = step.id === 'timecode' ? null : copy(analysis?.reference);
  if (step.id === 'timecode' && run.measurements?.find(m => m.metricId === 'tc_direction_code')?.value !== 1) issues.push('Forward control-vinyl play is unverified or reversed. Check the format, routing and direction, then repeat.');
  return {
    step: step.id, runId: run.id, assetId: run.assetId ?? run.deviceId ?? null, values,
    context: {
      deviceName: result.deviceName || null, sampleRate: a.sampleRate,
      pair: pair ? { first: pair.first, second: pair.second, mono: typeof pair.mono === 'boolean' ? pair.mono : null } : null,
      calibration: copy(run.calibration), calibrationProfile: copy(profile),
      calibrationObservation: { state: calibration.state, reportedState: calibration.reportedState, reasons: copy(calibration.reasons) },
    },
    capture: copy(run.capture), captureInfo: copy(captureInfo), nativeFields: copy(nativeFields), quality: copy(quality), streamErrors: copy(result.streamErrors), reference,
    measurementBasis: step.id === 'timecode' ? null : { version: analysis?.version ?? null, method: analysis?.method ?? null,
      step: analysis?.step ?? null, sampleRate: analysis?.sampleRate ?? null, totalSamples: analysis?.totalSamples ?? null, rawValues: copy(analysis?.values), uncertainty: copy(analysis?.uncertaintyBasis) },
    measurements: copy(run.measurements), issues,
  };
}

const comparisonKey = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const same = (a, b) => comparisonKey(a) === comparisonKey(b);
const conditionKeys = ['record', 'side', 'trackingForce', 'vta', 'chain', 'setupId', 'nominalRpm', 'timecodeFormat'];
const comparisonContext = context => context && ({ deviceName: context.deviceName, sampleRate: context.sampleRate, pair: context.pair, calibration: context.calibration, calibrationProfile: context.calibrationProfile });
// Storage bounds from stylus.rs validate_benchmark, not diagnostic/wear limits.
const metricRanges = { thdPercent: [0, 1000], separationDb: [-60, 140], tcSnrDb: [-60, 140], tcPhaseErrorDeg: [0, 360], tcDropouts: [0, 1_000_000] };

/** Do not dispatch a write that the native evidence/metric contract cannot retain. */
export function benchmarkSaveIssue(payload) {
  if (!Object.keys(metricRanges).some(key => finite(payload?.[key]))) return 'No benchmark metric fits the storage contract. The exact values remain in this review and the source analyses; repeat the reference captures before saving a benchmark.';
  const bytes = new TextEncoder().encode(JSON.stringify(payload.detail)).byteLength;
  if (bytes > GUIDED_DETAIL_LIMIT) return `The complete benchmark evidence is ${bytes} bytes; storage permits ${GUIDED_DETAIL_LIMIT}. No evidence was trimmed and no benchmark was saved. Source analyses were saved to structured History, with fuller metadata in the local working set; History does not archive every metadata field or raw sample audio. Export the local working set if needed, then prepare another benchmark with smaller metadata.`;
  return null;
}

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
    if (!same(comparisonContext(prior.detail.steps?.[0]?.context), comparisonContext(first.context))) issues.push('The input, sample rate, pair or calibration differs from the guided baseline.');
  }
  const tone = records[0].values, left = records[1].values, right = records[2].values;
  const metrics = { thdPercent: finite(tone.leftThdPercent) && finite(tone.rightThdPercent) ? (tone.leftThdPercent + tone.rightThdPercent) / 2 : null,
    separationDb: finite(left.separationDb) && finite(right.separationDb) ? Math.min(left.separationDb, right.separationDb) : null, ...(records[3]?.values || {}) };
  for (const [key, value] of Object.entries(metrics)) {
    const [lo, hi] = metricRanges[key];
    if (!finite(value) || value < lo || value > hi || (key === 'tcDropouts' && !Number.isSafeInteger(value))) {
      issues.push(`${key} (${value}) is outside the benchmark storage contract. Its trend value is unavailable; the exact source measurements remain in the evidence.`);
      metrics[key] = null;
    }
  }
  const detailSteps = copy(records);
  for (const record of detailSteps) {
    const reference = record.reference;
    if (!reference || reference.windowColumns || !Array.isArray(reference.channels) || !reference.channels.every(channel => Array.isArray(channel.windows) && channel.windows.every(window => window && typeof window === 'object' && !Array.isArray(window)))) continue;
    // Guided versions 2+ store complete window observations as named columns, avoiding
    // repeated property names without rounding values or omitting evidence.
    // Local source runs keep the original objects; this is the explicit payload
    // representation checked against the unchanged native byte limit.
    reference.windowColumns = [...new Set(reference.channels.flatMap(channel => channel.windows.flatMap(window => Object.keys(window))))];
    for (const channel of reference.channels) channel.windows = channel.windows.map(window => reference.windowColumns.map(key => window[key]));
  }
  return {
    assetId: config.assetId, setupId: config.setupId, sessionId: first.runId, hoursAt: config.hoursAt,
    ...metrics, valid: issues.length === 0,
    detail: {
      source: 'guided-capture', version: GUIDED_BENCHMARK_VERSION,
      conditions: copy(config), runs: records.map(record => record.runId), steps: detailSteps,
      separationMethod: 'poorer-isolated-channel', issues: [...new Set(issues)],
      conditionEvidence: prior ? 'recorded-baseline-and-operator' : history.length ? 'operator-confirmed-legacy-baseline' : 'new-guided-baseline',
    },
  };
}
