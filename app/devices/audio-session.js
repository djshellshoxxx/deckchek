// Orchestrates one output-quality measurement (SPEC-35): start recording, play the stimulus, stop
// recording, analyse. Dependencies are injected so the whole sequence is testable without hardware.
//
// Ownership (FS-00 §4.7/§4.9): a run owns exactly one capture session and at most one playback handle.
// - The capture is a startLiveSession-compatible session (app/ui/audio-io.js): its stop()/cancel() name
//   its own lease, so they can never stop or return another feature's capture.
// - Recording starts first and must be running before anything plays: a capture that cannot start
//   (input busy, no device, permission) rejects before playback, and a preempt or loss of the capture
//   before or during playback ends the run (own voice stopped, nothing analysed or returned).
// - Cancelling (`signal`) stops only this run's voice and cancels only this run's capture. A voice or
//   capture whose start resolves after cancellation is stopped/cancelled as soon as it arrives.
//   out.stopAll() is never called: it would silence other screens' playback.
import { buildStimulus, analyzeAudioQuality, evaluateAudioQuality, issueFindings, profileSpecNotes, safePlayLevel } from '../audio-quality.js';
import { ABS_MAX_DBFS } from '../audio-out.js';
import { profileInapplicableReasons } from '../calibration.js';

export const AQ_LEAD_MS = 300;  // recording runs this long before the stimulus starts
export const AQ_TAIL_MS = 500;  // and this long after it ends (output latency)

export class AudioSessionError extends Error {
  constructor(code, message) { super(message); this.name = 'AudioSessionError'; this.code = code; }
}

const MESSAGES = {
  cancelled: 'The measurement was stopped. Nothing was saved.',
  preempted: 'Another DeckChek feature took over the audio input, so the measurement was stopped. Nothing was saved.',
  'capture-lost': 'The recording stopped before the test signal finished, so the measurement was stopped. Nothing was saved.',
};
const sessionError = code => new AudioSessionError(code, MESSAGES[code] || MESSAGES.cancelled);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const handleOf = info => info?.handle ?? null;
/** When a start resolves after the run ended, release what it started (errors are already moot). */
const releaseLate = (pending, release) => { pending.then(v => Promise.resolve().then(() => release(v)).catch(() => {}), () => {}); };

/** Native continuity evidence is separate from the waveform's numerical threshold results. */
function captureEvidence(cap, audio) {
  const quality = cap?.quality ?? null, streamErrors = cap?.streamErrors ?? null;
  const counters = ['framesCaptured', 'overrunSamples', 'clippedSamplesL', 'clippedSamplesR', 'streamErrors', 'callbackCount'];
  const validCounter = n => Number.isSafeInteger(n) && n >= 0;
  const messages = value => Array.isArray(value) && value.every(v => typeof v === 'string');
  const valid = quality && typeof quality === 'object' && !Array.isArray(quality) &&
    counters.every(k => validCounter(quality[k])) && typeof quality.truncated === 'boolean' &&
    Number.isFinite(quality.maxCallbackGapMs) && quality.maxCallbackGapMs >= 0 &&
    messages(quality.streamErrorMessages) && messages(streamErrors) &&
    quality.framesCaptured === audio.left?.length && quality.callbackCount > 0;
  const reasons = [];
  if (validCounter(quality?.overrunSamples) && quality.overrunSamples > 0) reasons.push('capture buffer overruns');
  if (validCounter(quality?.streamErrors) && quality.streamErrors > 0) reasons.push('audio stream errors');
  if (messages(quality?.streamErrorMessages) && quality.streamErrorMessages.length) reasons.push('reported stream error messages');
  if (messages(streamErrors) && streamErrors.length) reasons.push('reported device errors');
  if (quality?.truncated === true) reasons.push('capture length limit reached');
  return { quality, streamErrors, integrity: { source: 'live', state: reasons.length ? 'incomplete' : valid ? 'observed' : 'unavailable', reasons } };
}

/**
 * Session result for an analysis: {analysis, evaluation, measurements, findings, status, detail, extra}.
 * An invalid analysis has no measurements: there is nothing to save.
 */
export function qualityResult(analysis, { profile = null, extra = {} } = {}) {
  const evidence = { ...extra, analysisVersion: analysis?.version ?? null };
  if (!analysis?.valid) {
    const issues = analysis?.issues || [];
    return { analysis, evaluation: null, measurements: [], findings: issueFindings(issues), status: 'unknown', detail: issues[0]?.message || 'The recording could not be analysed.', extra: { issues, ...evidence } };
  }
  const evaluation = evaluateAudioQuality(analysis.measurements);
  return {
    analysis, evaluation, measurements: analysis.measurements, findings: [...evaluation.findings, ...issueFindings(analysis.issues), ...(profile ? profileSpecNotes(profile) : [])], status: evaluation.status, detail: evaluation.detail,
    extra: { response: analysis.response, separation: analysis.separation, thresholds: evaluation.results.map(r => ({ id: r.threshold.id, status: r.status, detail: r.detail })), ...evidence },
  };
}

/**
 * deps: out = audio-out bridge {supported, playBuffer, stop}; startCapture = startLiveSession-compatible
 * ({deviceName, maxSeconds, pairs, onPreempted, onStatus, signal}) => Promise<{stop(): Promise<{audio}>, cancel()}>.
 * `signal` (AbortSignal) cancels the run; it then rejects with AudioSessionError code 'cancelled'
 * ('preempted' / 'capture-lost' when the capture ended it). Returns qualityResult(...).
 */
export async function runQualitySession({ out, startCapture, outputDevice = null, inputDevice = null, pairs = null, playLevelDbfs = ABS_MAX_DBFS, sampleRate = 48000, calibrationProfile = null, profile = null, onPhase = () => {}, leadMs = AQ_LEAD_MS, tailMs = AQ_TAIL_MS, wait = sleep, signal = null } = {}) {
  if (!out?.supported) throw new AudioSessionError('unsupported', 'The output-quality test needs the DeckChek desktop app.');
  if (typeof startCapture !== 'function') throw new AudioSessionError('unsupported', 'Recording the output needs the DeckChek desktop app.');
  const level = Math.min(ABS_MAX_DBFS, safePlayLevel(playLevelDbfs));
  const stim = buildStimulus({ sampleRate, playLevelDbfs: level });
  const playMs = Math.round(stim.meta.durationSec * 1000);

  // One cancellation for the whole run: the caller's signal, a preempt, or the capture ending early.
  const ended = new AbortController();
  let reason = null;
  const end = code => { if (reason) return; reason = code; ended.abort(); };
  const onAbort = () => end('cancelled');
  if (signal?.aborted) end('cancelled'); else signal?.addEventListener?.('abort', onAbort, { once: true });
  const stopped = new Promise((_, reject) => {
    const fail = () => reject(sessionError(reason));
    if (ended.signal.aborted) fail(); else ended.signal.addEventListener('abort', fail, { once: true });
  });
  stopped.catch(() => {});
  const guard = p => Promise.race([p, stopped]); // every await of the run goes through this
  const stopVoice = h => (h == null ? Promise.resolve() : Promise.resolve().then(() => out.stop(h)).catch(() => {}));

  let session = null, handle = null;
  try {
    if (reason) throw sessionError(reason); // cancelled before it started: nothing is opened
    onPhase('recording');
    const starting = Promise.resolve().then(() => startCapture({
      deviceName: inputDevice, maxSeconds: Math.ceil((leadMs + playMs + tailMs) / 1000) + 5, pairs, signal: ended.signal,
      onPreempted: () => end('preempted'),
      onStatus: s => { if (s && s.running === false) end('capture-lost'); },
    }));
    try { session = await guard(starting); } catch (error) { releaseLate(starting, s => s?.cancel?.()); throw error; }
    await guard(wait(leadMs));

    onPhase('playing');
    const playing = Promise.resolve().then(() => out.playBuffer({ sampleRate, left: stim.left, right: stim.right }, { levelDbfs: level, capDbfs: ABS_MAX_DBFS, loop: false }, { device: outputDevice }));
    let info;
    try { info = await guard(playing); } catch (error) { releaseLate(playing, i => stopVoice(handleOf(i))); throw error; }
    // A result without a handle cannot be stopped individually; it is a one-shot buffer that ends on its own.
    handle = handleOf(info);
    await guard(wait(playMs + tailMs));
    const voice = handle; handle = null;
    await guard(stopVoice(voice)); // idempotent: the buffer has ended by now

    onPhase('analysing');
    const own = session; session = null;
    const cap = await guard(Promise.resolve().then(() => own.stop()));
    if (cap?.preempted) throw sessionError('preempted');
    const audio = cap?.audio || cap || {};
    const rate = audio.sampleRate;
    let meta = stim.meta;
    if (rate !== sampleRate) { try { meta = buildStimulus({ sampleRate: rate, playLevelDbfs: level }).meta; } catch { /* unsupported rate: analysis reports BAD_INPUT */ } }
    const capturedDevice = [cap?.deviceName, own.info?.deviceName].find(name => typeof name === 'string' && name.trim()) || null;
    const identifiedProfile = typeof calibrationProfile?.deviceName === 'string' && calibrationProfile.deviceName.trim().length > 0;
    const calibrationReasons = calibrationProfile
      ? [...profileInapplicableReasons(calibrationProfile, { deviceName: identifiedProfile ? capturedDevice : null, sampleRate: rate }), ...(identifiedProfile ? [] : ['profile device identity is unavailable']), ...(capturedDevice ? [] : ['captured device is unavailable'])]
      : [];
    const calibrated = Boolean(calibrationProfile && !calibrationReasons.length);
    const chainFloor = calibrated && Number.isFinite(calibrationProfile.thdnPercent) && calibrationProfile.thdnPercent > 0
      ? { thdnPercent: calibrationProfile.thdnPercent } : null;
    const calibration = {
      state: !calibrationProfile ? 'none' : calibrated ? 'applied' : 'inapplicable', reasons: calibrationReasons,
      profileId: calibrationProfile?.id ?? null, profileCreatedAt: calibrationProfile?.createdAt ?? null,
      profileDevice: calibrationProfile?.deviceName ?? null, profileSampleRate: calibrationProfile?.sampleRate ?? null,
      capturedDevice, capturedSampleRate: rate,
    };
    const analysis = analyzeAudioQuality({ left: audio.left, right: audio.right, sampleRate: rate }, meta, { chainFloor, calibrated });
    if (reason) throw sessionError(reason);
    const evidence = captureEvidence(cap, audio);
    const result = qualityResult(analysis, { profile, extra: {
      outputDevice, inputDevice, playLevelDbfs: level, sampleRate: rate, calibrated, calibration,
      captureQuality: evidence.quality, streamErrors: evidence.streamErrors, captureIntegrity: evidence.integrity,
    } });
    if (calibrationReasons.length) result.findings.push({ id: 'aq-calibration-inapplicable', severity: 'info', title: 'The selected calibration was not applied', meaning: `The recorded device or format does not match the calibration: ${calibrationReasons.join('; ')}. Values include the recording chain.`, action: 'Calibrate this input at its actual sample rate, then repeat the test.' });
    if (evidence.integrity.state !== 'observed') {
      const incomplete = evidence.integrity.state === 'incomplete';
      const flag = incomplete ? 'capture-incomplete' : 'capture-unverified';
      result.measurements = result.measurements.map(m => ({ ...m, qualityFlags: [...(m.qualityFlags || []), flag] }));
      result.findings.unshift({ id: incomplete ? 'aq-capture-incomplete' : 'aq-capture-unverified', severity: 'review', title: incomplete ? 'The recording has capture faults' : 'Capture continuity could not be verified', meaning: incomplete ? `The capture reports ${evidence.integrity.reasons.join('; ')}. The recorded values remain available, but they cannot establish the device's output quality.` : 'Complete valid native capture counters were unavailable. Missing evidence is not a measured zero-loss recording.', action: 'Check the input connection and audio driver, then repeat the measurement.' });
      if (result.measurements.length) {
        result.status = 'unknown';
        result.detail = incomplete ? 'Review the recording: capture faults prevent a device verdict.' : 'Review the recording: capture continuity could not be verified.';
      }
    }
    return result;
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
    const voice = handle, own = session; handle = null; session = null;
    await stopVoice(voice);
    if (own) await Promise.resolve().then(() => own.cancel?.()).catch(() => {});
  }
}
