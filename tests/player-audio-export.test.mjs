import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { preparePlayerAudioExport, PLAYER_AUDIO_EXPORT_SCHEMA, PLAYER_AUDIO_EXPORT_MAX_PCM_BYTES } from '../app/player/audio-export.js';
import { runCdjAcquisition } from '../app/player/acquisition.js';
import { inspectPlayerReferenceFile } from '../app/player/reference-file.js';
import { payloadToAudio } from '../app/ui/audio-io.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(new TextDecoder().decode(bytes));

// Read ZIP central/local records independently of the application's writer.
function readArchive(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 20, true), 0);
  const count = view.getUint16(end + 10, true), files = new Map();
  let offset = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(offset, true), 0x02014b50);
    assert.equal(view.getUint16(offset + 10, true), 0, 'entries are stored');
    const size = view.getUint32(offset + 24, true), local = view.getUint32(offset + 42, true);
    const nameLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    assert.equal(files.has(name), false);
    assert.equal(view.getUint32(local, true), 0x04034b50);
    assert.equal(view.getUint32(local + 22, true), size);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    assert.ok(start + size <= offset);
    files.set(name, bytes.slice(start, start + size));
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  assert.equal(offset, end);
  return files;
}

async function capture({ payload = {}, quality = {}, operator = {} } = {}) {
  const native = { deviceName: 'Fixture input', sampleRate: 48000, channels: 2,
    pairs: [{ first: 1, second: 2, mono: false, label: '1-2' }],
    left: [-0, 0.125, -0.75], right: [1, -0.5, 0.25], streamErrors: [], ...payload };
  const audio = payloadToAudio(native);
  let id = 0, tick = 0;
  return runCdjAcquisition({ durationSeconds: 1, deviceName: 'Fixture input', pairs: [1], operator,
    createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    now: () => new Date(Date.UTC(2026, 10, 21, 11) + 100 * tick++).toISOString(), wait: async () => {},
    startCapture: async () => ({ info: { leaseId: 9, maxSeconds: 6 }, async cancel() {},
      async stop() { return { audio, quality: { framesCaptured: audio.left.length, overrunSamples: 0,
        clippedSamplesL: 0, clippedSamplesR: 0, streamErrors: 0, streamErrorMessages: [],
        truncated: false, callbackCount: 1, maxCallbackGapMs: 1,
        pairs: [{ first: 1, clippedSamplesL: 0, clippedSamplesR: 0 }], ...quality } }; } }) });
}

test('actual acquisition exports exact interleaved float32 bytes, independent hashes and provisional provenance', async () => {
  const source = await capture(), original = JSON.stringify({ acquisition: source.acquisition, record: source.record });
  const result = await preparePlayerAudioExport(source), files = readArchive(result.bytes);
  assert.deepEqual([...files.keys()], ['manifest.json', 'capture.json', 'audio/primary.f32le', 'README.txt']);
  assert.match(result.fileName, /^deckchek-player-audio-[a-f\d-]{36}\.zip$/);
  assert.equal(result.frames, 3); assert.equal(result.rawByteLength, 24);
  assert.equal(Buffer.from(files.get('audio/primary.f32le')).toString('hex'), '000000800000803f0000003e000000bf000040bf0000803e');
  const manifest = json(files.get('manifest.json')), details = json(files.get('capture.json'));
  assert.equal(manifest.schemaVersion, PLAYER_AUDIO_EXPORT_SCHEMA);
  assert.equal(manifest.runId, source.acquisition.runId);
  assert.equal(manifest.captureId, source.acquisition.captureId);
  assert.equal(manifest.audio.encoding, 'float32_le_interleaved');
  assert.equal(manifest.audio.frames, 3); assert.equal(manifest.audio.byteLength, 24);
  assert.deepEqual(manifest.audio.channelOrder, ['left', 'right']);
  assert.deepEqual(manifest.audio.sourcePair, { first: 1, second: 2, mono: false, label: '1-2' });
  assert.equal(manifest.audio.nominalSampleRateHz, 48000);
  assert.equal(manifest.audio.measuredSampleRateHz, null);
  assert.equal(manifest.audio.sourceHardwareFormat, null);
  assert.equal(manifest.audio.sampleBasis, 'normalized_capture_adapter_values');
  assert.equal(manifest.referenceBytesIncluded, false);
  assert.deepEqual(manifest.qualification, { status: 'unverified', eligibleForReport: false, pitchMeasured: false });
  assert.equal(manifest.files.length, 3);
  for (const entry of manifest.files) {
    assert.equal(entry.byteLength, files.get(entry.path).length);
    assert.equal(entry.sha256, sha(files.get(entry.path)));
  }
  assert.deepEqual(details.acquisition.rawEvidenceRefs, ['audio/primary.f32le']);
  assert.deepEqual(details.record.capture.rawEvidenceRefs, ['audio/primary.f32le']);
  assert.equal(details.acquisition.retention, 'export_archive_payload');
  assert.equal(details.record.qualification.eligibleForReport, false);
  assert.equal(details.record.qualification.measurement, null);
  assert.equal(details.selectedReference, null);
  assert.equal(JSON.stringify({ acquisition: source.acquisition, record: source.record }), original, 'input metadata is untouched');
  assert.match(new TextDecoder().decode(files.get('README.txt')), /not original ADC\/device bytes/);
});

test('samples and plain metadata are snapshotted before asynchronous hashing', async () => {
  const source = await capture({ operator: { asset: { model: 'Original player' } } });
  const acquisition = structuredClone(source.acquisition), record = structuredClone(source.record);
  const pending = preparePlayerAudioExport({ acquisition, record, audio: source.audio });
  source.audio.left.fill(0.5); source.audio.right.fill(0.5);
  acquisition.observed.deviceName = 'Later device'; record.asset.model = 'Later player';
  const files = readArchive((await pending).bytes), details = json(files.get('capture.json'));
  assert.equal(Buffer.from(files.get('audio/primary.f32le')).toString('hex'), '000000800000803f0000003e000000bf000040bf0000803e');
  assert.equal(details.acquisition.observed.deviceName, 'Fixture input');
  assert.equal(details.record.asset.model, 'Original player');
});

test('selected reference identity is retained without its bytes or a playback claim', async () => {
  const reference = await inspectPlayerReferenceFile(new File(['abc'], 'Reference tone.wav'));
  const source = await capture({ operator: { source: { referenceHashSha256: reference.sha256, referenceId: reference.fileName } } });
  const files = readArchive((await preparePlayerAudioExport(source, { selectedReference: reference })).bytes);
  const details = json(files.get('capture.json'));
  assert.deepEqual(details.selectedReference, reference);
  assert.equal(details.selectedReference.bytesRetained, false);
  assert.equal(details.selectedReference.playbackIdentity, 'unverified');
  assert.equal(details.record.source.referenceFrequencyHz, null);
  assert.equal(files.size, 4, 'no reference-file payload is added');
  await assert.rejects(preparePlayerAudioExport(source, { selectedReference: { ...reference, sha256: '0'.repeat(64) } }), /does not match/);
});

test('incomplete capture counters remain in the archive and cannot grant eligibility', async () => {
  const source = await capture({ quality: { overrunSamples: 4, streamErrors: 1, streamErrorMessages: ['Driver stopped'], clippedSamplesL: 2 },
    payload: { streamErrors: ['Driver stopped'] } });
  const record = structuredClone(source.record);
  record.qualification = { status: 'verified', eligibleForReport: true, measurement: { percent: 99 } };
  const files = readArchive((await preparePlayerAudioExport({ ...source, record })).bytes), details = json(files.get('capture.json'));
  assert.equal(details.acquisition.continuity.state, 'incomplete');
  assert.equal(details.acquisition.quality.overrunSamples, 4);
  assert.equal(details.acquisition.quality.clippedSamplesL, 2);
  assert.deepEqual(details.acquisition.quality.streamErrorMessages.messages, ['Driver stopped']);
  assert.equal(details.record.qualification.status, 'unverified');
  assert.equal(details.record.qualification.eligibleForReport, false);
  assert.equal(details.record.qualification.measurement, null);
});

test('a reported mono source retains both returned channels and its explicit source mode', async () => {
  const source = await capture({ payload: { channels: 1, pairs: [{ first: 1, second: 1, mono: true, label: '1' }] } });
  const files = readArchive((await preparePlayerAudioExport(source)).bytes), manifest = json(files.get('manifest.json'));
  assert.equal(manifest.audio.sourcePairMode, 'mono');
  assert.equal(manifest.audio.encodedChannels, 2);
  assert.equal(files.get('audio/primary.f32le').length, 24);
  assert.equal(Buffer.from(files.get('audio/primary.f32le')).toString('hex'), '000000800000803f0000003e000000bf000040bf0000803e');
});

test('compatibility defaults, unequal channels, changed rates and pair mismatches refuse audio export', async () => {
  for (const payload of [{ sampleRate: undefined }, { right: undefined }, { pairs: undefined }, { right: [0.5] }, { left: [NaN, 0, 1] }]) {
    await assert.rejects(preparePlayerAudioExport(await capture({ payload })), /no matching|do not match/);
  }
  const source = await capture();
  for (const audio of [{ ...source.audio, sampleRate: 44100 },
    { ...source.audio, pairs: [{ pair: { first: 3, second: 4, mono: false } }] },
    { ...source.audio, left: new Float64Array(3) }]) {
    await assert.rejects(preparePlayerAudioExport({ ...source, audio }), /no matching|do not match/);
  }
  const acquisition = structuredClone(source.acquisition); acquisition.captureId = acquisition.runId;
  await assert.rejects(preparePlayerAudioExport({ ...source, acquisition }), /identities do not match/);
});

test('audio export enforces its byte bound and rejects oversized or accessor-backed metadata', async () => {
  const source = await capture(), overLimit = new Float32Array(PLAYER_AUDIO_EXPORT_MAX_PCM_BYTES / 8 + 1);
  await assert.rejects(preparePlayerAudioExport({ ...source, audio: { ...source.audio, left: overLimit, right: overLimit } }), /limited to 18 MiB/);
  const acquisition = structuredClone(source.acquisition); acquisition.extra = 'x'.repeat(2049);
  await assert.rejects(preparePlayerAudioExport({ ...source, acquisition }), /metadata is too large/);
  let reads = 0;
  const record = { ...source.record, get extra() { reads++; return 'must not be read'; } };
  await assert.rejects(preparePlayerAudioExport({ ...source, record }), /own data fields/);
  assert.equal(reads, 0);
});

test('the exact 18 MiB sample bound fits the unchanged 20 MiB ZIP cap', async () => {
  const samples = new Float32Array(PLAYER_AUDIO_EXPORT_MAX_PCM_BYTES / 8);
  samples[0] = -0.5; samples[samples.length - 1] = 0.25;
  const source = await capture({ payload: { left: samples, right: samples } });
  const result = await preparePlayerAudioExport(source), files = readArchive(result.bytes), manifest = json(files.get('manifest.json'));
  assert.equal(result.rawByteLength, 18 * 1024 * 1024);
  assert.ok(result.bytes.length < 20 * 1024 * 1024);
  assert.equal(files.get('audio/primary.f32le').length, result.rawByteLength);
  assert.equal(manifest.files.find(file => file.path === 'audio/primary.f32le').sha256, sha(files.get('audio/primary.f32le')));
});

test('cancellation before preparation or while hashing prevents archive publication', async () => {
  const source = await capture(), before = new AbortController(); before.abort();
  await assert.rejects(preparePlayerAudioExport(source, { signal: before.signal }), { name: 'AbortError' });
  const during = new AbortController(), pending = preparePlayerAudioExport(source, { signal: during.signal });
  during.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
