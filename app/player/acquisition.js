// CDJ-04 acquisition controller. Uses the existing lease-scoped live-capture
// contract through an explicit dependency; no UI, playback, persistence or verdict.
import { MAX_PAIRS, parsePairSelection } from '../capture.js';
import { createCdjEvidenceRecord } from './evidence-record.js';

export const CDJ_ACQUISITION_SCHEMA = 'deckchek.cdj04.acquisition.v1';
export const CDJ_MAX_CAPTURE_SECONDS = 30;
const MAX_MESSAGES = 20; // native capture.rs MAX_ERROR_MESSAGES
const MAX_MESSAGE_CHARS = 1000;
// overrunSamples is the native dropped-sample count, not frames or dropped buffers.
const COUNTERS = ['framesCaptured', 'overrunSamples', 'clippedSamplesL', 'clippedSamplesR', 'streamErrors', 'callbackCount'];
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

export class CdjAcquisitionError extends Error {
  constructor(code, message) { super(message); this.name = 'CdjAcquisitionError'; this.code = code; }
}
const failure = code => new CdjAcquisitionError(code, {
  cancelled: 'The player recording was cancelled. No result was saved.',
  preempted: 'Another feature took over the input. No player result was saved.',
  'capture-lost': 'The input stopped before the player recording finished. No result was saved.',
}[code] || 'The player recording could not finish.');
const own = (value, key) => {
  if (!value || typeof value !== 'object') return undefined;
  const d = Object.getOwnPropertyDescriptor(value, key);
  return d && 'value' in d ? d.value : undefined;
};
const count = n => Number.isSafeInteger(n) && n >= 0;
const finitePositive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const shortText = value => typeof value === 'string' && value.trim() && value.length <= 240 && !/[\u0000-\u001f\u007f]/u.test(value);
const samples = value => Array.isArray(value) || value instanceof Float32Array || value instanceof Float64Array;
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const utc = now => {
  const value = createCdjEvidenceRecord({ observedAt: now() }).observedAt;
  if (!value) throw new TypeError('The acquisition clock must return a UTC timestamp.');
  return value;
};
const id = createId => {
  const value = createId();
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError('The acquisition ID provider must return a UUID.');
  return value.toLowerCase();
};

function delay(ms, { signal }) {
  return new Promise((resolve, reject) => {
    let timer;
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(failure('cancelled')); };
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
  });
}

// Bounded diagnostic text only; neither waveform samples nor arbitrary objects
// are copied into the serializable descriptor. Truncation is always explicit.
function messages(value) {
  if (!Array.isArray(value)) return { available: false, messages: [], receivedCount: null, omittedCount: null, shortenedCount: 0 };
  const result = { available: true, messages: [], receivedCount: value.length, omittedCount: Math.max(0, value.length - MAX_MESSAGES), shortenedCount: 0 };
  for (let i = 0; i < Math.min(value.length, MAX_MESSAGES); i++) {
    const s = own(value, String(i));
    if (typeof s !== 'string') { result.available = false; result.omittedCount++; continue; }
    result.messages.push(s.slice(0, MAX_MESSAGE_CHARS));
    if (s.length > MAX_MESSAGE_CHARS) result.shortenedCount++;
  }
  return result;
}

function observe(cap, requested) {
  const audio = own(cap, 'audio');
  if (!audio || typeof audio !== 'object') throw new CdjAcquisitionError('capture-result', 'The capture returned no audio object.');
  const native = own(audio, 'nativeFields');
  const field = key => own(native, key);
  const value = (key, valid) => {
    const f = field(key), v = own(f, 'value');
    return own(f, 'present') === true && own(f, 'valid') === true && valid(v) ? v : null;
  };
  const rate = value('sampleRate', n => Number.isSafeInteger(n) && n > 0 && n <= 0xffffffff && n === own(audio, 'sampleRate'));
  const channels = value('channels', n => Number.isSafeInteger(n) && n > 0 && n <= 65535 && n === own(audio, 'channels'));
  const device = value('deviceName', shortText);
  const rawPairs = value('pairs', p => Array.isArray(p) && p.length > 0 && p.length <= MAX_PAIRS);
  let pairs = null;
  if (rawPairs && channels != null) {
    const copied = [], seen = new Set();
    for (let i = 0; i < rawPairs.length; i++) {
      const p = own(rawPairs, String(i));
      const first = own(p, 'first'), second = own(p, 'second'), mono = own(p, 'mono');
      if (!Number.isSafeInteger(first) || first < 1 || first % 2 !== 1 || seen.has(first) ||
          typeof mono !== 'boolean' || second !== first + (mono ? 0 : 1) || second > channels || (mono && first !== channels)) break;
      seen.add(first); copied.push({ first, second, mono, label: mono ? String(first) : `${first}-${second}` });
    }
    if (copied.length === rawPairs.length) pairs = copied;
  }
  const channel = key => {
    const f = field(key), a = own(audio, key), n = own(f, 'samples');
    const present = own(f, 'present') === true;
    const observedCount = present && count(n) ? n : null;
    const returnedCount = samples(a) ? a.length : null;
    return { observedCount, returnedCount, usable: present && own(f, 'valid') === true && observedCount > 0 && returnedCount === observedCount };
  };
  const left = channel('left'), right = channel('right');
  const adapterPair = own(own(own(audio, 'pairs'), '0'), 'pair');
  const primaryPairMatches = Boolean(pairs && ['first', 'second', 'mono'].every(k => own(adapterPair, k) === pairs[0][k]));
  const reasons = [];
  if (!device) reasons.push('device_observation_unavailable');
  if (device && requested.deviceName && device !== requested.deviceName) reasons.push('requested_device_differs');
  if (!rate) reasons.push('nominal_rate_observation_unavailable');
  if (!channels) reasons.push('channel_count_observation_unavailable');
  if (!pairs) reasons.push('pair_observation_unavailable');
  if (pairs && pairs.length !== 1) reasons.push('unexpected_multiple_pairs');
  if (pairs && !primaryPairMatches) reasons.push('primary_pair_descriptor_mismatch');
  if (pairs && requested.pairs && pairs[0].first !== requested.pairs[0]) reasons.push('requested_pair_differs');
  if (!left.usable || !right.usable) reasons.push('primary_sample_observation_unavailable');
  if (left.observedCount !== right.observedCount) reasons.push('primary_channel_lengths_differ');
  const duration = rate && left.usable && right.usable && left.observedCount === right.observedCount && primaryPairMatches
    ? left.observedCount / rate : null;

  const q = own(cap, 'quality');
  const quality = Object.fromEntries(COUNTERS.map(k => [k, count(own(q, k)) ? own(q, k) : null]));
  quality.truncated = typeof own(q, 'truncated') === 'boolean' ? own(q, 'truncated') : null;
  const gap = own(q, 'maxCallbackGapMs');
  quality.maxCallbackGapMs = typeof gap === 'number' && Number.isFinite(gap) && gap >= 0 ? gap : null;
  quality.streamErrorMessages = messages(own(q, 'streamErrorMessages'));
  const nativeErrors = value('streamErrors', Array.isArray);
  const streamErrors = messages(nativeErrors);
  const pairCounts = own(q, 'pairs');
  quality.pairs = null;
  if (Array.isArray(pairCounts) && pairCounts.length <= MAX_PAIRS) {
    quality.pairs = [];
    for (let i = 0; i < pairCounts.length; i++) {
      const p = own(pairCounts, String(i)), first = own(p, 'first');
      quality.pairs.push({
        first: Number.isSafeInteger(first) && first > 0 && first % 2 === 1 && first < 65535 ? first : null,
        clippedSamplesL: count(own(p, 'clippedSamplesL')) ? own(p, 'clippedSamplesL') : null,
        clippedSamplesR: count(own(p, 'clippedSamplesR')) ? own(p, 'clippedSamplesR') : null,
      });
    }
  }
  quality.errorMessagesOmittedByNative = quality.streamErrors != null && quality.streamErrorMessages.receivedCount != null
    ? Math.max(0, quality.streamErrors - quality.streamErrorMessages.receivedCount) : null;

  const faults = [];
  if (quality.overrunSamples > 0) faults.push('buffer_overruns_reported');
  if (quality.streamErrors > 0 || streamErrors.receivedCount > 0 || quality.streamErrorMessages.receivedCount > 0) faults.push('stream_errors_reported');
  if (quality.truncated === true) faults.push('capture_capacity_reached');
  if (quality.clippedSamplesL > 0 || quality.clippedSamplesR > 0) faults.push('clipping_reported');
  if (quality.framesCaptured != null && left.observedCount != null && quality.framesCaptured !== left.observedCount) faults.push('captured_frame_count_mismatch');
  const completeCounters = COUNTERS.every(k => quality[k] != null) && quality.callbackCount > 0 &&
    quality.truncated != null && quality.maxCallbackGapMs != null && quality.streamErrorMessages.available && streamErrors.available;
  if (!completeCounters) reasons.push('capture_counters_unavailable');
  return { audio, observed: {
    deviceName: device, nominalSampleRateHz: rate, measuredSampleRateHz: null,
    sampleRateBasis: rate ? 'native_nominal_configuration' : 'unavailable', channelCount: channels,
    selectedPairs: pairs, sampleScope: 'first_selected_pair_only', primarySamples: { left, right },
    primaryPairMode: pairs?.length === 1 && primaryPairMatches ? (pairs[0].mono ? 'mono' : 'stereo') : null,
    sampleDurationSeconds: duration, durationBasis: duration == null ? 'unavailable' : 'primary_frames_over_nominal_rate',
    backend: null, osDeviceId: null, sampleFormat: null, bitDepth: null, gainDb: null,
    routing: null, firstSampleAt: null, timebaseCalibration: null,
    droppedBufferCount: null, discontinuityCount: null,
    sourceType: null, gainStagingNotes: null, phonoLineStatus: null, externalRiaa: null,
  }, quality, streamErrors, continuity: {
    state: faults.length ? 'incomplete' : reasons.length ? 'unavailable' : 'observed',
    basis: 'native_counter_observation_not_proven_hardware_continuity',
    reasons: [...faults, ...reasons],
  } };
}

/**
 * Own one 1..30 s, single-pair capture through a startLiveSession-compatible
 * dependency. Operator input supplies asset/source/processing/pitch assertions
 * only; it cannot supply identity, capture observations, analysis or quality.
 * Returns frozen {acquisition, record} metadata plus separately mutable,
 * ephemeral `audio`. No samples are retained on disk and rawEvidenceRefs is [].
 */
export async function runCdjAcquisition({
  startCapture, durationSeconds = 5, deviceName = null, pairs = null, operator = {},
  signal = null, wait = delay, now = () => new Date().toISOString(),
  createId = () => globalThis.crypto?.randomUUID?.(), onPhase = () => {},
} = {}) {
  if (typeof startCapture !== 'function') throw new CdjAcquisitionError('unsupported', 'Player acquisition needs a live-capture provider.');
  if (!finitePositive(durationSeconds) || durationSeconds < 1 || durationSeconds > CDJ_MAX_CAPTURE_SECONDS) throw new RangeError('Player capture duration must be 1 through 30 seconds.');
  if (deviceName != null && !shortText(deviceName)) throw new TypeError('The requested input must be a device name or null.');
  if (![wait, now, createId, onPhase].every(f => typeof f === 'function')) throw new TypeError('Acquisition providers must be functions.');
  if (signal && (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) throw new TypeError('signal must support AbortSignal events.');
  const selected = parsePairSelection(pairs);
  if (selected && selected.length > 1) throw new RangeError('This player acquisition supports one input pair.');
  const declared = createCdjEvidenceRecord(operator); // snapshot assertions before any await
  const requested = freeze({ deviceName, pairs: selected, durationSeconds });
  if (signal?.aborted) throw failure('cancelled');
  const runId = id(createId), captureId = id(createId);
  if (captureId === runId) throw new TypeError('Run and capture UUIDs must be distinct.');
  const requestedAt = utc(now);
  const ended = new AbortController();
  let reason = null, finished = false, stopping = false, session = null;
  const end = code => { if (!finished && !reason) { reason = code; ended.abort(); } };
  const onAbort = () => end('cancelled');
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) end('cancelled');
  let rejectStopped;
  const stopped = new Promise((_, reject) => { rejectStopped = () => reject(failure(reason || 'cancelled')); });
  ended.signal.addEventListener('abort', rejectStopped, { once: true });
  if (ended.signal.aborted) rejectStopped();
  stopped.catch(() => {});
  const guard = pending => Promise.race([pending, stopped]);
  const release = async ownSession => {
    try {
      if (typeof ownSession?.cancel === 'function') await ownSession.cancel();
      else if (typeof ownSession?.stop === 'function') await ownSession.stop();
    } catch { /* lease-scoped cleanup must not replace the original failure */ }
  };
  try {
    if (reason) throw failure(reason);
    onPhase('starting');
    const starting = Promise.resolve().then(() => {
      if (reason) throw failure(reason);
      return startCapture({ deviceName, pairs: selected ? [...selected] : null, maxSeconds: Math.ceil(durationSeconds) + 5,
        onPreempted: () => end('preempted'), onStatus: s => { if (!stopping && s?.running === false) end('capture-lost'); },
      });
    });
    try { session = await guard(starting); }
    catch (error) { starting.then(release, () => {}); throw error; }
    if (!session || typeof session.stop !== 'function' || typeof session.cancel !== 'function') throw new CdjAcquisitionError('capture-session', 'The capture provider did not return a stoppable session.');
    if (reason) throw failure(reason);
    const readyAt = utc(now);
    const capacity = own(own(session, 'info'), 'maxSeconds');
    if (finitePositive(capacity) && capacity < durationSeconds) throw new CdjAcquisitionError('capture-capacity', 'The input cannot hold the requested duration. Select a shorter player recording.');
    const lease = own(own(session, 'info'), 'leaseId');
    const nativeLeaseId = count(lease) && lease > 0 ? lease : null;
    onPhase('recording');
    await guard(Promise.resolve().then(() => wait(durationSeconds * 1000, { signal: ended.signal })));
    if (reason) throw failure(reason);
    stopping = true;
    onPhase('stopping');
    if (reason) throw failure(reason);
    const ownSession = session;
    const cap = await guard(Promise.resolve().then(() => ownSession.stop()));
    session = null;
    if (reason) throw failure(reason);
    if (own(cap, 'preempted') === true) throw failure('preempted');
    const completedAt = utc(now), evidence = observe(cap, requested);
    const record = createCdjEvidenceRecord({ runId, observedAt: completedAt,
      asset: declared.asset, source: declared.source, processing: declared.processing, pitch: declared.pitch,
      capture: { deviceName: evidence.observed.deviceName, sampleRateHz: evidence.observed.nominalSampleRateHz,
        selectedPairs: evidence.observed.selectedPairs?.map(p => p.label) || [],
        elapsedSeconds: evidence.observed.sampleDurationSeconds, rawEvidenceRefs: [] },
    });
    const hostElapsed = (Date.parse(completedAt) - Date.parse(requestedAt)) / 1000;
    const acquisition = freeze({ schemaVersion: CDJ_ACQUISITION_SCHEMA, runId, captureId, nativeLeaseId,
      requested, hostTimes: { requestedAt, readyAt, completedAt, elapsedSeconds: hostElapsed >= 0 ? hostElapsed : null,
        basis: 'host_observation_not_first_sample_time' },
      operatorFields: ['asset', 'source', 'processing', 'pitch'], observed: evidence.observed,
      quality: evidence.quality, streamErrors: evidence.streamErrors, continuity: evidence.continuity,
      rawEvidenceRefs: [], retention: 'ephemeral_audio_only',
    });
    freeze(record);
    onPhase('complete');
    if (reason) throw failure(reason);
    return Object.freeze({ acquisition, record, audio: evidence.audio });
  } finally {
    finished = true;
    signal?.removeEventListener('abort', onAbort);
    ended.signal.removeEventListener('abort', rejectStopped);
    ended.abort(); // clears the default duration timer on every exit
    if (session) await release(session);
  }
}
