import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  preparePhoto, createPhotoStore, createMemoryPhotoStore, sniffImageType, fitWithin, inspectJpeg, validateJpeg,
  bytesToBase64, base64ToBytes, photoDataUrl, MAX_SOURCE_BYTES, MAX_STORED_BYTES,
} from '../app/photo-store.js';
import { sha256Hex } from '../app/sha256.js';

const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/photo.json', import.meta.url), 'utf8'));

/** Same synthetic JPEG as the Rust tests: structurally valid, not decodable. */
function tinyJpeg(w, h, extraBeforeSof = [], seed = 1) {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, ...extraBeforeSof,
    0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x12, seed, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0xff, 0xd9,
  ]);
}
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);

test('sniffImageType trusts magic bytes only', () => {
  assert.equal(sniffImageType(tinyJpeg(1, 1)), 'jpeg');
  assert.equal(sniffImageType(PNG), 'png');
  assert.equal(sniffImageType(WEBP), 'webp');
  assert.equal(sniffImageType(Uint8Array.from(Buffer.from('GIF89a......'))), null);
  assert.equal(sniffImageType(Uint8Array.from(Buffer.from('<svg xmlns="x"></svg>'))), null);
  assert.equal(sniffImageType(new Uint8Array(3)), null);
  assert.equal(sniffImageType(null), null);
});

test('fitWithin scales the long edge down to 1600 and never up', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(20000, 1), { width: 1600, height: 1 });
});

test('inspectJpeg / validateJpeg mirror the Rust rules', () => {
  assert.deepEqual(inspectJpeg(tinyJpeg(1200, 800)), { width: 1200, height: 800 });
  const exif = [0xff, 0xe1, 0, 8, 69, 120, 105, 102, 0, 0];
  assert.throws(() => inspectJpeg(tinyJpeg(10, 10, exif)), /APP1/);
  assert.throws(() => inspectJpeg(tinyJpeg(10, 10, [0xff, 0xed, 0, 4, 1, 2])), /APP13/);
  assert.doesNotThrow(() => inspectJpeg(tinyJpeg(10, 10, [0xff, 0xfe, 0, 4, 104, 105])), 'comments are fine');
  const trailing = Uint8Array.from([...tinyJpeg(10, 10), 0xff, 0xe1, 0, 4, 1, 2]);
  assert.throws(() => inspectJpeg(trailing), /after the end/);
  const good = tinyJpeg(50, 50);
  assert.throws(() => inspectJpeg(good.subarray(0, good.length - 2)), /truncated/);
  assert.throws(() => inspectJpeg(PNG), /not a JPEG/);
  assert.throws(() => validateJpeg(tinyJpeg(1601, 10)), /1600/);
  assert.throws(() => validateJpeg(tinyJpeg(0, 10)), /zero/);
  assert.throws(() => validateJpeg(new Uint8Array(MAX_STORED_BYTES + 1)), /limit/);
  validateJpeg(tinyJpeg(1600, 1600));
});

test('base64 helpers round-trip large arrays', () => {
  const big = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 31) & 255);
  assert.deepEqual(base64ToBytes(bytesToBase64(big)), big);
  assert.equal(photoDataUrl('QUJD'), 'data:image/jpeg;base64,QUJD');
});

// ---- preparePhoto with fake browser APIs
function fakeEnv({ srcW = 4000, srcH = 3000, outputs } = {}) {
  const calls = { canvases: [], draws: [], closed: 0, qualities: [] };
  const queue = outputs ? [...outputs] : null;
  return {
    calls,
    createImageBitmap: async (blob, opts) => { calls.decodeOpts = opts; return { width: srcW, height: srcH, close() { calls.closed++; } }; },
    createCanvas: (w, h) => {
      calls.canvases.push([w, h]);
      return {
        getContext: () => ({ fillRect: (...a) => calls.draws.push(['fill', ...a]), drawImage: (_b, ...a) => calls.draws.push(['draw', ...a]), set fillStyle(v) { calls.fill = v; } }),
        toBlob: async q => { calls.qualities.push(q); const bytes = queue ? queue.shift() : tinyJpeg(w, h); return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }; },
      };
    },
  };
}

test('preparePhoto: PNG source -> JPEG within 1600 px with sha256, white flatten, bitmap closed', async () => {
  const env = fakeEnv();
  const out = await preparePhoto(PNG, env);
  assert.deepEqual([out.width, out.height], [1600, 1200]);
  assert.equal(sniffImageType(out.bytes), 'jpeg');
  assert.equal(out.sha256, await sha256Hex(out.bytes));
  assert.deepEqual(env.calls.canvases, [[1600, 1200]]);
  assert.equal(env.calls.qualities[0], 0.82);
  assert.equal(env.calls.fill, '#fff');
  assert.deepEqual(env.calls.draws[1], ['draw', 0, 0, 1600, 1200]);
  assert.equal(env.calls.decodeOpts.imageOrientation, 'from-image');
  assert.equal(env.calls.closed, 1);
  assert.equal(inspectJpeg(out.bytes).width, 1600);
});

test('preparePhoto: small image keeps its size; webp and jpeg sources are accepted; Blob input works', async () => {
  assert.deepEqual((await preparePhoto(WEBP, fakeEnv({ srcW: 640, srcH: 480 }))).width, 640);
  assert.equal((await preparePhoto(new Blob([tinyJpeg(5, 5)]), fakeEnv({ srcW: 5, srcH: 5 }))).height, 5);
});

test('preparePhoto rejects > 8 MB, wrong magic bytes and undecodable input', async () => {
  const big = new Uint8Array(MAX_SOURCE_BYTES + 1); big.set(PNG);
  await assert.rejects(preparePhoto(big, fakeEnv()), /8 MB/);
  await assert.rejects(preparePhoto({ size: MAX_SOURCE_BYTES + 1, arrayBuffer: async () => { throw new Error('should not read'); } }, fakeEnv()), /8 MB/);
  const exact = new Uint8Array(MAX_SOURCE_BYTES); exact.set(PNG);
  await preparePhoto(exact, fakeEnv());
  await assert.rejects(preparePhoto(Uint8Array.from(Buffer.from('GIF89a..........')), fakeEnv()), /not a PNG, JPEG or WebP/);
  await assert.rejects(preparePhoto('a string', fakeEnv()), TypeError);
  await assert.rejects(preparePhoto(PNG, { createImageBitmap: async () => { throw new Error('decode failed'); } }), /decode failed/);
});

test('preparePhoto retries at lower quality, then smaller size, when the JPEG is over 2 MB', async () => {
  const huge = new Uint8Array(MAX_STORED_BYTES + 10); huge.set(tinyJpeg(10, 10));
  const env = fakeEnv({ outputs: [huge, huge, tinyJpeg(1600, 1200)] });
  const out = await preparePhoto(PNG, env);
  assert.deepEqual(env.calls.qualities, [0.82, 0.7, 0.55]);
  assert.equal(out.bytes.length < MAX_STORED_BYTES, true);
  // all qualities too big -> second attempt at 80 % size
  const env2 = fakeEnv({ outputs: [huge, huge, huge, huge, tinyJpeg(1280, 960)] });
  const out2 = await preparePhoto(PNG, env2);
  assert.deepEqual(env2.calls.canvases, [[1600, 1200], [1280, 960]]);
  assert.deepEqual([out2.width, out2.height], [1280, 960]);
  // an encoder that returns a non-JPEG is an error
  await assert.rejects(preparePhoto(PNG, fakeEnv({ outputs: [PNG] })), /encode JPEG/);
});

// ---- memory store (browser mode) behaves like photo.rs
const input = (bytes, ownerKind, ownerId, extra = {}) => ({ ownerKind, ownerId, bytesB64: bytesToBase64(bytes), ...extra });

test('memory store: attach, dedupe, links, primary, unlink and read mirror Rust semantics', async () => {
  const s = createMemoryPhotoStore({ now: () => '2026-10-14T10:00:00.000Z' });
  const jpg = tinyJpeg(640, 480, [], 2);
  const a = await s.attach(input(jpg, 'asset', 'a', { caption: ' Front ', stage: 'before', isPrimary: true }));
  assert.equal(a.sha256, await sha256Hex(jpg));
  assert.deepEqual([a.width, a.height, a.bytes, a.deduplicated], [640, 480, jpg.length, false]);
  const b = await s.attach(input(jpg, 'service_job', 'job-9'));
  assert.equal(b.photoId, a.photoId); assert.equal(b.deduplicated, true); assert.notEqual(b.linkId, a.linkId);
  const again = await s.attach(input(jpg, 'asset', 'a', { caption: 'updated' }));
  assert.equal(again.linkId, a.linkId);
  const l = await s.list('asset', 'a');
  assert.equal(l.length, 1);
  assert.deepEqual([l[0].caption, l[0].stage, l[0].isPrimary, l[0].sort], ['updated', 'before', true, 0]);
  assert.equal(await s.read(a.photoId), bytesToBase64(jpg));
  assert.deepEqual(await s.unlink(a.linkId), { unlinked: true, fileDeleted: false });
  assert.deepEqual(await s.unlink(b.linkId), { unlinked: true, fileDeleted: true });
  assert.deepEqual(await s.unlink(b.linkId), { unlinked: false, fileDeleted: false });
  await assert.rejects(s.read(a.photoId), /unknown photo/);
});

test('memory store: primary is exclusive, sort grows, validation matches Rust', async () => {
  const s = createMemoryPhotoStore();
  for (let n = 0; n < 3; n++) await s.attach(input(tinyJpeg(30, 30, [], 20 + n), 'asset', 'a', { isPrimary: n === 0 || n === 2 }));
  const l = await s.list('asset', 'a');
  assert.deepEqual(l.map(x => x.sort), [0, 1, 2]);
  assert.deepEqual(l.map(x => x.isPrimary), [false, false, true]);
  const jpg = tinyJpeg(20, 20);
  await assert.rejects(s.attach(input(jpg, 'venue', 'a')), /ownerKind/);
  await assert.rejects(s.attach(input(jpg, 'asset', '  ')), /ownerId/);
  await assert.rejects(s.attach(input(jpg, 'asset', 'a', { caption: 'c'.repeat(501) })), /caption/);
  await assert.rejects(s.attach(input(PNG, 'asset', 'a')), /not a JPEG/);
  await assert.rejects(s.attach(input(tinyJpeg(10, 10, [0xff, 0xe1, 0, 4, 1, 2]), 'asset', 'a')), /APP1/);
  await assert.rejects(s.list('bogus', 'a'), /ownerKind/);
});

test('memory store: at most 100 photos per owner and no orphan left by the rejected 101st', async () => {
  const s = createMemoryPhotoStore();
  const variant = n => { const b = tinyJpeg(8, 8, [], 0); b[44] = n; return b; }; // distinct entropy byte -> distinct hash
  for (let n = 0; n < 100; n++) await s.attach(input(variant(n), 'asset', 'a'));
  await assert.rejects(s.attach(input(tinyJpeg(9, 9, [], 7), 'asset', 'a')), /at most 100/);
  assert.equal((await s.list('asset', 'a')).length, 100);
});

test('contract: the memory store accepts the shared attach example and reproduces its response shape', async () => {
  const s = createMemoryPhotoStore();
  const r = await s.attach(CONTRACT.photo_attach.request.input);
  const want = CONTRACT.photo_attach.response;
  assert.deepEqual(Object.keys(r).sort(), Object.keys(want).sort());
  assert.deepEqual({ ...r, photoId: want.photoId, linkId: want.linkId }, want);
  const rows = await s.list(CONTRACT.photo_list.request.ownerKind, CONTRACT.photo_list.request.ownerId);
  assert.deepEqual(Object.keys(rows[0]).sort(), Object.keys(CONTRACT.photo_list.response[0]).sort());
});

test('bridge passes exactly the contract field names to the native commands', async () => {
  const calls = [];
  const invoke = async (cmd, args) => { calls.push([cmd, args]); return { photoId: 'p' }; };
  const api = createPhotoStore({ invoke });
  assert.equal(api.native, true);
  const req = CONTRACT.photo_attach.request.input;
  const bytes = base64ToBytes(req.bytesB64);
  await api.attach({ ownerKind: req.ownerKind, ownerId: req.ownerId, bytes, caption: req.caption, altText: req.altText, stage: req.stage, isPrimary: req.isPrimary });
  await api.list(CONTRACT.photo_list.request.ownerKind, CONTRACT.photo_list.request.ownerId);
  await api.unlink(CONTRACT.photo_unlink.request.linkId);
  await api.read(CONTRACT.photo_read.request.photoId);
  assert.deepEqual(calls[0], ['photo_attach', CONTRACT.photo_attach.request]);
  assert.deepEqual(calls[1], ['photo_list', CONTRACT.photo_list.request]);
  assert.deepEqual(calls[2], ['photo_unlink', CONTRACT.photo_unlink.request]);
  assert.deepEqual(calls[3], ['photo_read', CONTRACT.photo_read.request]);
});

test('attach() prepares a file first and falls back to memory without the desktop app', async () => {
  const prepared = [];
  const api = createPhotoStore({ invoke: null, prepare: async f => { prepared.push(f); return { bytes: tinyJpeg(70, 50) }; } });
  assert.equal(api.native, false);
  const r = await api.attach({ ownerKind: 'certificate', ownerId: 'c1', file: PNG });
  assert.equal(prepared[0], PNG);
  assert.equal(r.width, 70);
  assert.equal((await api.list('certificate', 'c1')).length, 1);
  await assert.rejects(api.attach({ ownerKind: 'asset', ownerId: 'x' }), /file or JPEG bytes/);
  await assert.rejects(api.attach({ ownerKind: 'nope', ownerId: 'x', file: PNG }), /ownerKind/);
  assert.equal(await api.read(r.photoId), bytesToBase64(tinyJpeg(70, 50)));
});
