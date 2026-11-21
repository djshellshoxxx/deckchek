import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectPlayerReferenceFile, CDJ_MAX_REFERENCE_BYTES, CDJ_REFERENCE_FILE_SCHEMA } from '../app/player/reference-file.js';

const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const bytes = text => new TextEncoder().encode(text).buffer;

test('a real selected File produces the exact known SHA-256 and only immutable metadata', async () => {
  const file = new File(['abc'], 'Reference tone.wav', { type: 'audio/wav' });
  const result = await inspectPlayerReferenceFile(file);
  assert.deepEqual(result, { schemaVersion: CDJ_REFERENCE_FILE_SCHEMA, fileName: 'Reference tone.wav', byteLength: 3,
    digestAlgorithm: 'SHA-256', sha256: ABC, hashBasis: 'selected_file_bytes', playbackIdentity: 'unverified', bytesRetained: false });
  assert.equal(Object.isFrozen(result), true);
  assert.throws(() => { result.sha256 = 'changed'; }, TypeError);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.ok(Object.values(result).every(value => value === null || typeof value !== 'object'), 'no File or byte buffer is retained');
});

test('byte content determines identity while filename and MIME do not validate audio or playback', async () => {
  const first = await inspectPlayerReferenceFile(new File(['abc'], 'one.wav', { type: 'audio/wav' }));
  const renamed = await inspectPlayerReferenceFile(new File(['abc'], 'two.txt', { type: 'text/plain' }));
  const changed = await inspectPlayerReferenceFile(new File(['abd'], 'one.wav', { type: 'audio/wav' }));
  assert.equal(first.sha256, renamed.sha256);
  assert.notEqual(first.sha256, changed.sha256);
  assert.equal(changed.sha256, createHash('sha256').update('abd').digest('hex'));
  assert.equal(renamed.playbackIdentity, 'unverified');
  assert.equal(Object.hasOwn(renamed, 'sampleRateHz'), false);
  assert.equal(Object.hasOwn(renamed, 'referenceFrequencyHz'), false);
});

test('invalid size and filename metadata is refused before any byte read', async () => {
  let reads = 0;
  const file = { size: 3, name: 'tone.wav', async arrayBuffer() { reads++; return bytes('abc'); } };
  for (const size of [0, -1, 1.5, NaN, Infinity, CDJ_MAX_REFERENCE_BYTES + 1, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(inspectPlayerReferenceFile({ ...file, size }), /nonempty reference file no larger than 32 MiB/);
  }
  for (const name of ['', '   ', 'x'.repeat(241), 'bad\nname.wav', null]) {
    await assert.rejects(inspectPlayerReferenceFile({ ...file, name }), /reference file needs a name/);
  }
  assert.equal(reads, 0);
  await assert.rejects(inspectPlayerReferenceFile({ size: 3, name: 'tone.wav' }), /cannot be read as bytes/);
});

test('the exact 32 MiB bound is accepted and identified without retaining file bytes', async () => {
  const content = new Uint8Array(CDJ_MAX_REFERENCE_BYTES);
  content[0] = 1; content[content.length - 1] = 2;
  const expected = createHash('sha256').update(content).digest('hex');
  const result = await inspectPlayerReferenceFile(new File([content], 'bounded-reference.wav'));
  assert.equal(result.byteLength, CDJ_MAX_REFERENCE_BYTES);
  assert.equal(result.sha256, expected);
  assert.equal(result.bytesRetained, false);
});

test('actual read length and ArrayBuffer shape must match the selected file metadata', async () => {
  for (const value of [bytes('ab'), bytes('abcd'), new Uint8Array([1, 2, 3]), null]) {
    await assert.rejects(inspectPlayerReferenceFile({ size: 3, name: 'tone.wav', async arrayBuffer() { return value; } }), /did not match its declared byte length/);
  }
});

test('read failures remain failures and no descriptor is manufactured', async () => {
  const error = new Error('Selected file became unavailable');
  let reads = 0;
  await assert.rejects(inspectPlayerReferenceFile({ size: 3, name: 'tone.wav', async arrayBuffer() { reads++; throw error; } }), value => value === error);
  assert.equal(reads, 1);
});

test('already cancelled selection performs no file read', async () => {
  const controller = new AbortController(); controller.abort();
  let reads = 0;
  await assert.rejects(inspectPlayerReferenceFile({ size: 3, name: 'tone.wav', async arrayBuffer() { reads++; return bytes('abc'); } },
    { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(reads, 0);
});

test('cancellation during a pending read suppresses its eventual descriptor without claiming to abort the read', async () => {
  const read = deferred(), controller = new AbortController();
  let finished = false;
  const pending = inspectPlayerReferenceFile({ size: 3, name: 'tone.wav', async arrayBuffer() { await read.promise; finished = true; return bytes('abc'); } },
    { signal: controller.signal });
  controller.abort();
  assert.equal(finished, false);
  read.resolve();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(finished, true);
});

test('cancellation while the digest is pending suppresses the completed hash', async t => {
  const digest = deferred(), entered = deferred(), controller = new AbortController();
  t.mock.method(globalThis.crypto.subtle, 'digest', async (algorithm, input) => {
    assert.equal(algorithm, 'SHA-256');
    assert.deepEqual([...input], [97, 98, 99]);
    entered.resolve(); await digest.promise;
    return Uint8Array.from(Buffer.from(ABC, 'hex')).buffer;
  });
  const pending = inspectPlayerReferenceFile(new File(['abc'], 'tone.wav'), { signal: controller.signal });
  await entered.promise; controller.abort(); digest.resolve();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('file name and byte length are snapshotted before the asynchronous read', async () => {
  const read = deferred();
  const file = { size: 3, name: 'Original tone.wav', async arrayBuffer() { await read.promise; return bytes('abc'); } };
  const pending = inspectPlayerReferenceFile(file);
  file.size = 99; file.name = 'Changed.wav'; read.resolve();
  const result = await pending;
  assert.equal(result.fileName, 'Original tone.wav');
  assert.equal(result.byteLength, 3);
  assert.equal(result.sha256, ABC);
});
