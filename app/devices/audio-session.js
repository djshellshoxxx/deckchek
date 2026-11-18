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

/**
 * Session result for an analysis: {analysis, evaluation, measurements, findings, status, detail, extra}.
 * An invalid analysis has no measurements: there is nothing to save.
 */
export function qualityResult(analysis, { profile = null, extra = {} } = {}) {
  if (!analysis?.valid) {
    const issues = analysis?.issues || [];
    return { analysis, evaluation: null, measurements: [], findings: issueFindings(issues), status: 'unknown', detail: issues[0]?.message || 'The recording could not be analysed.', extra: { issues, ...extra } };
  }
  const evaluation = evaluateAudioQuality(analysis.measurements);
  return {
    analysis, evaluation, measurements: analysis.measurements, findings: [...evaluation.findings, ...issueFindings(analysis.issues), ...(profile ? profileSpecNotes(profile) : [])], status: evaluation.status, detail: evaluation.detail,
    extra: { response: analysis.response, separation: analysis.separation, thresholds: evaluation.results.map(r => ({ id: r.threshold.id, status: r.status, detail: r.detail })), ...extra },
  };
}

/**
 * deps: out = audio-out bridge {supported, playBuffer, stop}; startCapture = startLiveSession-compatible
 * ({deviceName, maxSeconds, pairs, onPreempted, onStatus, signal}) => Promise<{stop(): Promise<{audio}>, cancel()}>.
 * `signal` (AbortSignal) cancels the run; it then rejects with AudioSessionError code 'cancelled'
 * ('preempted' / 'capture-lost' when the capture ended it). Returns qualityResult(...).
 */
export async function runQualitySession({ out, startCapture, outputDevice = null, inputDevice = null, pairs = null, playLevelDbfs = ABS_MAX_DBFS, sampleRate = 48000, chainFloor = null, calibrated = false, profile = null, onPhase = () => {}, leadMs = AQ_LEAD_MS, tailMs = AQ_TAIL_MS, wait = sleep, signal = null } = {}) {
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
    const rate = audio.sampleRate || sampleRate;
    let meta = stim.meta;
    if (rate !== sampleRate) { try { meta = buildStimulus({ sampleRate: rate, playLevelDbfs: level }).meta; } catch { /* unsupported rate: analysis reports BAD_INPUT */ } }
    const analysis = analyzeAudioQuality({ left: audio.left, right: audio.right, sampleRate: rate }, meta, { chainFloor, calibrated });
    if (reason) throw sessionError(reason);
    return qualityResult(analysis, { profile, extra: { outputDevice, inputDevice, playLevelDbfs: level, sampleRate: rate, calibrated } });
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
    const voice = handle, own = session; handle = null; session = null;
    await stopVoice(voice);
    if (own) await Promise.resolve().then(() => own.cancel?.()).catch(() => {});
  }
}
