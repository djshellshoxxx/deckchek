// Optional local export of the primary pair returned by the capture adapter.
// This retains normalized samples; it does not verify hardware or a reference.
import { createZip } from '../zip-writer.js';
import { sha256Hex } from '../sha256.js';
import { CDJ_ACQUISITION_SCHEMA } from './acquisition.js';
import { CDJ_EVIDENCE_SCHEMA, createCdjEvidenceRecord } from './evidence-record.js';
import { CDJ_REFERENCE_FILE_SCHEMA, CDJ_MAX_REFERENCE_BYTES } from './reference-file.js';

export const PLAYER_AUDIO_EXPORT_SCHEMA = 'deckchek.player-audio-export.v1';
export const PLAYER_AUDIO_EXPORT_MAX_PCM_BYTES = 18 * 1024 * 1024;
const AUDIO_PATH = 'audio/primary.f32le';
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const encoder = new TextEncoder();
const own = (value, key) => {
  const field = value && typeof value === 'object' && Object.getOwnPropertyDescriptor(value, key);
  if (!field || !('value' in field)) throw new TypeError('Capture export requires own data fields.');
  return field.value;
};
const cancelled = signal => {
  if (signal?.aborted) {
    const error = new Error('Audio export preparation was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
};

// Bound metadata before JSON encoding and never evaluate accessors/toJSON.
function snapshot(value, budget = { text: 0, fields: 0 }, depth = 0) {
  if (depth > 12 || ++budget.fields > 2048) throw new RangeError('Capture export metadata is too large.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    budget.text += value.length;
    if (value.length > 2048 || budget.text > 65536) throw new RangeError('Capture export metadata is too large.');
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') throw new TypeError('Capture export metadata must be JSON data.');
  if (Array.isArray(value)) {
    if (value.length > 64) throw new RangeError('Capture export metadata has too many entries.');
    return Array.from({ length: value.length }, (_, index) => snapshot(own(value, String(index)), budget, depth + 1));
  }
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Capture export metadata must be plain data.');
  const result = Object.create(null);
  for (const key of Object.keys(value)) {
    budget.text += key.length;
    if (budget.text > 65536) throw new RangeError('Capture export metadata is too large.');
    result[key] = snapshot(own(value, key), budget, depth + 1);
  }
  return result;
}

function referenceDescriptor(value, record) {
  if (value == null) return null;
  const r = snapshot(value);
  if (r.schemaVersion !== CDJ_REFERENCE_FILE_SCHEMA || typeof r.fileName !== 'string' ||
      !r.fileName.trim() || r.fileName.length > 240 || /[\u0000-\u001f\u007f]/u.test(r.fileName) ||
      !Number.isSafeInteger(r.byteLength) || r.byteLength < 1 || r.byteLength > CDJ_MAX_REFERENCE_BYTES ||
      r.digestAlgorithm !== 'SHA-256' || !/^[a-f\d]{64}$/u.test(r.sha256) ||
      r.hashBasis !== 'selected_file_bytes' || r.playbackIdentity !== 'unverified' || r.bytesRetained !== false ||
      record.source.referenceHashSha256 !== r.sha256) {
    throw new TypeError('The selected reference descriptor does not match this capture.');
  }
  return { schemaVersion: r.schemaVersion, fileName: r.fileName, byteLength: r.byteLength,
    digestAlgorithm: 'SHA-256', sha256: r.sha256, hashBasis: 'selected_file_bytes',
    playbackIdentity: 'unverified', bytesRetained: false };
}

/**
 * Build one bounded, stored ZIP from a completed runCdjAcquisition result.
 * Copy samples/metadata before the first await. Only Float32 adapter channels
 * with matching observed counts/rate/pair are eligible for this transport.
 * Incomplete counters stay incomplete; export never grants report eligibility.
 */
export async function preparePlayerAudioExport(captured, { selectedReference = null, signal = null } = {}) {
  cancelled(signal);
  const acquisition = snapshot(own(captured, 'acquisition'));
  const recordInput = snapshot(own(captured, 'record'));
  if (acquisition.schemaVersion !== CDJ_ACQUISITION_SCHEMA || recordInput.schemaVersion !== CDJ_EVIDENCE_SCHEMA ||
      !UUID.test(acquisition.runId) || !UUID.test(acquisition.captureId) || acquisition.runId === acquisition.captureId ||
      recordInput.runId !== acquisition.runId) throw new TypeError('The audio and capture identities do not match.');
  const record = createCdjEvidenceRecord(recordInput);
  const observed = acquisition.observed;
  const audio = own(captured, 'audio'), left = own(audio, 'left'), right = own(audio, 'right');
  if (!(left instanceof Float32Array) || !(right instanceof Float32Array) ||
      !(left.buffer instanceof ArrayBuffer) || !(right.buffer instanceof ArrayBuffer) ||
      !left.length || left.length !== right.length) throw new TypeError('The capture has no matching normalized audio channels to export.');
  const frames = left.length, rawByteLength = frames * 8;
  if (!Number.isSafeInteger(rawByteLength) || rawByteLength > PLAYER_AUDIO_EXPORT_MAX_PCM_BYTES) {
    throw new RangeError('Audio export is limited to 18 MiB of samples. Choose a shorter capture.');
  }
  const rate = observed?.nominalSampleRateHz;
  const pair = observed?.selectedPairs?.[0];
  const audioPair = own(own(own(audio, 'pairs'), '0'), 'pair');
  if (!Number.isSafeInteger(rate) || rate < 1 || rate > 0xffffffff || own(audio, 'sampleRate') !== rate ||
      record.capture.sampleRateHz !== rate || !record.observedAt || acquisition.hostTimes?.completedAt !== record.observedAt ||
      observed.sampleScope !== 'first_selected_pair_only' || !['mono', 'stereo'].includes(observed.primaryPairMode) ||
      observed.selectedPairs?.length !== 1 || !pair ||
      own(audioPair, 'first') !== pair.first || own(audioPair, 'second') !== pair.second || own(audioPair, 'mono') !== pair.mono ||
      observed.primaryPairMode !== (pair.mono ? 'mono' : 'stereo') ||
      record.capture.selectedPairs.length !== 1 || record.capture.selectedPairs[0] !== pair.label ||
      observed.primarySamples?.left?.usable !== true ||
      observed.primarySamples?.right?.usable !== true ||
      [observed.primarySamples.left.observedCount, observed.primarySamples.left.returnedCount,
        observed.primarySamples.right.observedCount, observed.primarySamples.right.returnedCount].some(n => n !== frames) ||
      observed.sampleDurationSeconds !== frames / rate) {
    throw new TypeError('The capture observations do not match the audio available for export.');
  }
  const reference = referenceDescriptor(selectedReference, record);
  const pcm = new Uint8Array(rawByteLength), view = new DataView(pcm.buffer);
  for (let frame = 0; frame < frames; frame++) {
    const l = left[frame], r = right[frame];
    if (!Number.isFinite(l) || !Number.isFinite(r)) throw new TypeError('The capture contains non-finite samples.');
    view.setFloat32(frame * 8, l, true);
    view.setFloat32(frame * 8 + 4, r, true);
  }
  // Original acquisition metadata remains untouched. These references name the
  // bytes in this archive, not a filesystem path or a verified capture method.
  acquisition.rawEvidenceRefs = [AUDIO_PATH];
  acquisition.retention = 'export_archive_payload';
  record.capture.rawEvidenceRefs = [AUDIO_PATH];
  const captureBytes = encoder.encode(JSON.stringify({ acquisition, record, selectedReference: reference }, null, 2) + '\n');
  if (captureBytes.byteLength > 128 * 1024) throw new RangeError('Capture export metadata is too large.');
  const readme = encoder.encode('DeckChek provisional player capture\n\n' +
    'audio/primary.f32le contains headerless, interleaved left/right IEEE-754 float32 samples in little-endian order: L0,R0,L1,R1,... . ' +
    'The manifest gives frame count, nominal sample rate, source pair mode and SHA-256. Both returned channels are retained even for a mono source pair.\n' +
    'These are the normalized capture-adapter values, not original ADC/device bytes. There is no resampling, scaling or clipping during export. ' +
    'capture.json retains reported counters, faults, unknowns and operator assertions. Hashes check archive contents; they do not authenticate hardware, continuity, calibration or playback.\n' +
    'Reference-file bytes are not included. Pitch is not measured and the record remains unverified and ineligible for diagnostic reports. ' +
    'This archive is created locally and nothing is uploaded.\n');
  const files = [{ name: 'capture.json', data: captureBytes }, { name: AUDIO_PATH, data: pcm }, { name: 'README.txt', data: readme }];
  cancelled(signal);
  const digests = await Promise.all(files.map(file => sha256Hex(file.data)));
  cancelled(signal);
  const manifest = {
    schemaVersion: PLAYER_AUDIO_EXPORT_SCHEMA, runId: acquisition.runId, captureId: acquisition.captureId,
    capturedAt: record.observedAt,
    audio: { path: AUDIO_PATH, encoding: 'float32_le_interleaved', channelOrder: ['left', 'right'],
      encodedChannels: 2, frames, byteLength: rawByteLength, nominalSampleRateHz: rate,
      measuredSampleRateHz: null, sourcePairMode: observed.primaryPairMode, sourcePair: pair,
      sampleBasis: 'normalized_capture_adapter_values', sourceHardwareFormat: null },
    referenceBytesIncluded: false,
    qualification: { status: 'unverified', eligibleForReport: false, pitchMeasured: false },
    files: files.map((file, index) => ({ path: file.name, byteLength: file.data.byteLength, sha256: digests[index] })),
  };
  const zip = createZip([{ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) + '\n' }, ...files], { date: new Date(record.observedAt) });
  cancelled(signal);
  return Object.freeze({ bytes: zip, fileName: `deckchek-player-audio-${acquisition.runId}.zip`, frames, rawByteLength });
}
