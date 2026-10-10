// FS-00 §4.7: capture lease errors, stream block decoding and the streaming bridge (fake Tauri).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAPTURE_BUSY, CaptureBusyError, captureHolderLabel, normalizeCaptureError, isCaptureBusy, classifyCaptureError,
  decodeStreamBlock, startStreamSession, captureLeaseStatus, acquireCaptureLease, releaseCaptureLease, preemptCapture,
  startLiveSession, STREAM_HEADER_BYTES,
} from '../app/ui/audio-io.js';
import { captureBusyCopy, runWithCapture } from '../app/ui/capture-busy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/contracts/capture.json'), 'utf8'));
const hexBytes = hex => Uint8Array.from(hex.match(/../g).map(b => parseInt(b, 16)));
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

/** Encode a block the way capture.rs does (used to drive the fake Channel). */
function encodeBlock({ seq, sampleRate = 1000, left, right = left.map(v => -v), dropped = 0, final = false, gap = false, framesCaptured = 0 }) {
  const frames = left.length, buf = new ArrayBuffer(STREAM_HEADER_BYTES + frames * 8), v = new DataView(buf);
  [0x44, 0x43, 0x53, 0x42].forEach((b, i) => v.setUint8(i, b));
  v.setUint16(4, 1, true); v.setUint16(6, (final ? 1 : 0) | (gap ? 2 : 0), true);
  v.setUint32(8, seq, true); v.setUint32(12, sampleRate, true); v.setUint32(16, frames, true);
  v.setUint32(20, dropped, true); v.setUint32(24, 0, true); v.setFloat64(32, 0, true); v.setFloat64(40, framesCaptured, true);
  left.forEach((x, i) => v.setFloat32(STREAM_HEADER_BYTES + i * 4, x, true));
  right.forEach((x, i) => v.setFloat32(STREAM_HEADER_BYTES + frames * 4 + i * 4, x, true));
  return buf;
}

/** Minimal model of the Rust lease + stream commands. */
function fakeTauri({ busyHolder = null } = {}) {
  const calls = [];
  let lease = busyHolder ? { leaseId: 1, holder: busyHolder, deviceName: null, since: 1791633600000, kind: 'stream' } : null;
  let channel = null, nextId = 10, seq = 0, stream = null;
  const busy = () => ({ code: CAPTURE_BUSY, message: `The audio input is busy: "${lease.holder}" is already running.`, ...lease });
  const sendFinal = () => { channel.onmessage(encodeBlock({ seq: seq++, left: [], final: true })); };
  const handlers = {
    capture_lease_status: () => (lease ? { held: true, ...lease } : { held: false, leaseId: null, holder: null, deviceName: null, since: null, kind: null }),
    capture_lease_acquire: ({ holder, deviceName }) => { if (lease) throw busy(); lease = { leaseId: nextId++, holder, deviceName, since: Date.now(), kind: 'external' }; return { ...lease }; },
    capture_lease_release: ({ leaseId }) => { if (lease?.leaseId === leaseId && lease.kind === 'external') { lease = null; return true; } return false; },
    capture_preempt: () => { const stopped = lease; if (stream) { sendFinal(); stream = null; } lease = null; return { stopped }; },
    start_stream_capture: ({ holder, blockMs, channel: ch }) => {
      if (lease) throw busy();
      channel = ch; seq = 0;
      lease = { leaseId: nextId++, holder: holder || 'stream-capture', deviceName: null, since: Date.now(), kind: 'stream' };
      stream = { id: lease.leaseId };
      return { streamId: lease.leaseId, holder: lease.holder, deviceName: 'Synth', sampleRate: 1000, channels: 2, blockMs, blockFrames: 20 };
    },
    stream_capture_ack: () => null,
    stop_stream_capture: () => {
      if (!stream) throw 'No stream capture is running.';
      const lost = stream.lost;
      if (!lost) sendFinal();
      const id = stream.id; stream = null; lease = null;
      return { streamId: id, ended: lost ? 'deviceLost' : 'stopped', blocksSent: seq, lastSeq: seq - 1, droppedBlocks: 0, framesCaptured: 0, overrunSamples: 0, streamErrors: 0, streamErrorMessages: [] };
    },
    start_live_capture: () => { if (lease) throw busy(); lease = { leaseId: nextId++, holder: 'live-capture', deviceName: null, since: Date.now(), kind: 'live' }; return { deviceName: 'Synth', sampleRate: 48000, channels: 2, maxSeconds: 5, leaseId: lease.leaseId }; },
    stop_live_capture: () => { lease = null; return { payload: { deviceName: 'Synth', sampleRate: 48000, channels: 2, left: [0.1], right: [0.2], streamErrors: [] }, quality: {} }; },
    live_capture_status: () => ({ running: !!lease, elapsedSec: 0, quality: {} }),
  };
  class Channel { constructor() { this.onmessage = () => {}; } }
  const tauri = {
    core: { Channel, invoke: async (cmd, args = {}) => { calls.push([cmd, args]); if (!handlers[cmd]) throw `unknown command ${cmd}`; return handlers[cmd](args); } },
    event: { listen: async () => () => {} },
  };
  return { tauri, calls, emit: block => channel.onmessage(encodeBlock(block)), lose: () => { sendFinal(); stream.lost = true; lease = null; }, get lease() { return lease; } };
}

// ---------------------------------------------------------------- errors and labels

test('holder labels: known ids, readable fallback, empty', () => {
  assert.equal(captureHolderLabel('live-monitor'), 'Live monitor');
  assert.equal(captureHolderLabel('live-capture'), 'A live capture');
  assert.equal(captureHolderLabel('fs31:night_watch'), 'Night watch');
  assert.equal(captureHolderLabel(''), 'Another capture');
  assert.equal(captureHolderLabel(null), 'Another capture');
});

test('CAPTURE_BUSY rejections become CaptureBusyError with holder and since; others pass through', () => {
  const e = normalizeCaptureError(CONTRACT.errors.busy);
  assert.ok(e instanceof CaptureBusyError && e instanceof Error);
  assert.equal(e.code, CAPTURE_BUSY);
  assert.equal(e.holder, 'live-monitor');
  assert.equal(e.since, 1791633600000);
  assert.equal(e.leaseId, 4);
  assert.match(e.message, /busy/);
  assert.ok(isCaptureBusy(e) && !isCaptureBusy(new Error('x')) && !isCaptureBusy(null));
  assert.equal(normalizeCaptureError(CONTRACT.errors.plain), CONTRACT.errors.plain, 'plain string errors stay strings');
  assert.equal(normalizeCaptureError(e), e);
});

test('classifyCaptureError: busy lease names the holder; legacy text still maps', () => {
  const c = classifyCaptureError(normalizeCaptureError(CONTRACT.errors.busy));
  assert.equal(c.kind, 'busy');
  assert.equal(c.holder, 'live-monitor');
  assert.match(c.message, /^Live monitor is using the audio input/);
  assert.equal(classifyCaptureError(CONTRACT.errors.busy).kind, 'busy', 'raw object too');
  assert.equal(classifyCaptureError('A live capture is already running.').kind, 'busy');
  assert.equal(classifyCaptureError('Audio input not found: X').kind, 'no-device');
});

// ---------------------------------------------------------------- block decoding

test('decodeStreamBlock matches the Rust contract bytes', () => {
  const d = decodeStreamBlock(hexBytes(CONTRACT.block.hex).buffer);
  const want = CONTRACT.block.decoded;
  assert.equal(d.seq, want.seq);
  assert.equal(d.sampleRate, want.sampleRate);
  assert.equal(d.frames, want.frames);
  assert.deepEqual([...d.left], want.left);
  assert.deepEqual([...d.right], want.right);
  assert.deepEqual(d.quality, want.quality);
  assert.ok(d.left instanceof Float32Array);
});

test('decodeStreamBlock accepts typed arrays and byte arrays, rejects bad input', () => {
  const bytes = hexBytes(CONTRACT.block.hex);
  const padded = new Uint8Array(bytes.length + 3); padded.set(bytes, 3);
  assert.equal(decodeStreamBlock(padded.subarray(3)).seq, 7, 'unaligned view');
  assert.equal(decodeStreamBlock([...bytes]).frames, 3, 'small raw payloads may arrive as arrays');
  assert.throws(() => decodeStreamBlock(bytes.slice(0, 40)), /truncated/);
  assert.throws(() => decodeStreamBlock(bytes.slice(0, 60)), /length/);
  const bad = bytes.slice(); bad[0] = 0;
  assert.throws(() => decodeStreamBlock(bad), /Not a DeckChek/);
  const v2 = bytes.slice(); v2[4] = 2;
  assert.throws(() => decodeStreamBlock(v2), /version 2/);
  assert.throws(() => decodeStreamBlock('nope'), /binary/);
  const empty = decodeStreamBlock(encodeBlock({ seq: 3, left: [], final: true }));
  assert.equal(empty.frames, 0);
  assert.ok(empty.quality.final);
});

// ---------------------------------------------------------------- stream bridge

test('stream bridge passes the contract argument names and acks each block after onBlock', async () => {
  const f = fakeTauri();
  const got = [];
  const s = await startStreamSession({ holder: 'wear-map', blockMs: 20, tauri: f.tauri, onBlock: async b => { await tick(2); got.push(b.seq); } });
  const [, args] = f.calls.find(c => c[0] === 'start_stream_capture');
  assert.deepEqual(Object.keys(args).sort(), Object.keys(CONTRACT.commands.start_stream_capture.request).sort());
  assert.equal(s.info.streamId, 10);
  for (let seq = 0; seq < 3; seq++) f.emit({ seq, left: [seq, seq + 0.5] });
  await tick(30);
  assert.deepEqual(got, [0, 1, 2], 'blocks in order, one at a time');
  const acks = f.calls.filter(c => c[0] === 'stream_capture_ack').map(c => c[1]);
  assert.deepEqual(acks, [0, 1, 2].map(seq => ({ streamId: 10, seq })));
  assert.deepEqual(Object.keys(acks[0]).sort(), Object.keys(CONTRACT.commands.stream_capture_ack.request).sort());
  const sum = await s.stop();
  assert.equal(sum.ended, 'stopped');
  assert.ok(s.ended && s.endReason === 'stopped');
  assert.equal(s.stats().blocks, 4, 'final block counted');
  assert.equal(await s.stop(), sum, 'stop is idempotent');
  assert.equal(f.lease, null);
});

test('stream bridge counts drops and discontinuities from block quality', async () => {
  const f = fakeTauri();
  const s = await startStreamSession({ holder: 'live-monitor', tauri: f.tauri });
  f.emit({ seq: 0, left: [0] });
  f.emit({ seq: 4, left: [0], dropped: 3, gap: true });
  await tick(5);
  assert.deepEqual({ ...s.stats(), decodeErrors: undefined }, { blocks: 2, frames: 2, droppedBlocks: 3, discontinuities: 1, lastSeq: 4, decodeErrors: undefined });
  await s.stop();
});

test('device loss ends the session by itself and reports the reason', async () => {
  const f = fakeTauri();
  let ended = null;
  const s = await startStreamSession({ holder: 'live-monitor', tauri: f.tauri, onEnd: e => { ended = e; } });
  f.emit({ seq: 0, left: [0.1] });
  f.lose();
  await tick(5);
  assert.ok(s.ended);
  assert.equal(ended.reason, 'deviceLost');
  assert.equal(ended.summary.ended, 'deviceLost');
  assert.equal(f.calls.filter(c => c[0] === 'stop_stream_capture').length, 1, 'the ended session is reaped');
  assert.equal(await s.stop(), ended.summary);
});

test('a busy input rejects startStreamSession with CaptureBusyError', async () => {
  const f = fakeTauri({ busyHolder: 'live-monitor' });
  await assert.rejects(startStreamSession({ holder: 'wear-map', tauri: f.tauri }), e => e instanceof CaptureBusyError && e.holder === 'live-monitor');
});

test('browser mode: explicit unsupported state, starting rejects with the desktop-app message', async () => {
  assert.deepEqual(await captureLeaseStatus({ tauri: null }), { held: false, supported: false, leaseId: null, holder: null, deviceName: null, since: null, kind: null });
  assert.equal(await preemptCapture({ tauri: null }), null);
  assert.equal(await releaseCaptureLease(1, { tauri: null }), false);
  await assert.rejects(startStreamSession({ tauri: null }), /desktop app/);
  assert.equal(classifyCaptureError(await startStreamSession({ tauri: null }).catch(e => e)).kind, 'unavailable');
});

// ---------------------------------------------------------------- lease + preempt

test('explicit lease: acquire, busy for others, release', async () => {
  const f = fakeTauri();
  const g = await acquireCaptureLease('latency-tuner', { tauri: f.tauri });
  assert.equal(g.kind, 'external');
  assert.deepEqual(Object.keys(f.calls.at(-1)[1]).sort(), Object.keys(CONTRACT.commands.capture_lease_acquire.request).sort());
  await assert.rejects(acquireCaptureLease('hum-hunter', { tauri: f.tauri }), e => isCaptureBusy(e) && e.holder === 'latency-tuner');
  assert.equal((await captureLeaseStatus({ tauri: f.tauri })).holder, 'latency-tuner');
  assert.equal(await releaseCaptureLease(g.leaseId, { tauri: f.tauri }), true);
  assert.deepEqual(Object.keys(f.calls.at(-1)[1]), Object.keys(CONTRACT.commands.capture_lease_release.request));
});

test('preempt stops a local stream through its controller (owner hears onPreempted)', async () => {
  const f = fakeTauri();
  let preempted = 0, reason = null;
  const s = await startStreamSession({ holder: 'live-monitor', tauri: f.tauri, onPreempted: () => preempted++, onEnd: e => { reason = e.reason; } });
  const stopped = await preemptCapture({ tauri: f.tauri });
  assert.equal(stopped.holder, 'live-monitor');
  assert.equal(preempted, 1);
  assert.equal(reason, 'preempted');
  assert.ok(s.ended);
  assert.ok(!f.calls.some(c => c[0] === 'capture_preempt'), 'local controller was enough');
  assert.equal(await preemptCapture({ tauri: f.tauri }), null, 'nothing left to stop');
});

test('preempt falls back to the native command for holders this page does not know', async () => {
  const f = fakeTauri({ busyHolder: 'live-monitor' });
  const stopped = await preemptCapture({ tauri: f.tauri });
  assert.equal(stopped.holder, 'live-monitor');
  assert.ok(f.calls.some(c => c[0] === 'capture_preempt'));
  assert.equal(f.lease, null);
});

test('live sessions register for preempt and normalise busy errors (backward-compatible start args)', async () => {
  const f = fakeTauri();
  globalThis.window = { __TAURI__: f.tauri };
  try {
    let preempted = false;
    const live = await startLiveSession({ maxSeconds: 5, onPreempted: () => { preempted = true; } });
    const [, args] = f.calls.find(c => c[0] === 'start_live_capture');
    assert.deepEqual(Object.keys(args).sort(), ['deviceName', 'maxSeconds'], 'live start arguments unchanged');
    await assert.rejects(startLiveSession({ maxSeconds: 5 }), e => e instanceof CaptureBusyError && e.holder === 'live-capture');
    await preemptCapture({ tauri: f.tauri });
    assert.ok(preempted && live.stopped);
    assert.equal(f.lease, null);
  } finally {
    delete globalThis.window;
  }
});

// ---------------------------------------------------------------- capture-busy flow

test('capture-busy copy follows FS-00 §3', () => {
  const now = 1791633600000 + 5 * 60_000;
  const c = captureBusyCopy({ holder: 'live-monitor', since: 1791633600000 }, { now });
  assert.equal(c.body, 'Live monitor is using the audio input. Stop it and run this check?');
  assert.equal(c.confirmLabel, 'Stop and continue');
  assert.equal(c.cancelLabel, 'Cancel');
  assert.equal(c.detail, 'It has been running for 5 min.');
  assert.equal(captureBusyCopy({ holder: 'wear-map', since: now - 1000 }, { action: 'start the wear map', now }).body, 'Wear map is using the audio input. Stop it and start the wear map?');
  assert.equal(captureBusyCopy({ holder: 'x', since: null }).detail, '');
});

test('runWithCapture: confirm -> preempt -> retry once; cancel rejects with cancelled', async () => {
  const busy = () => { throw { ...CONTRACT.errors.busy }; };
  let attempts = 0, preempts = 0, asked = null;
  const ok = await runWithCapture(async () => { if (attempts++ === 0) busy(); return 'started'; }, {
    action: 'start the wear map',
    confirm: async (e, o) => { asked = [e.holder, o.action]; return true; },
    preempt: async () => { preempts++; },
  });
  assert.equal(ok, 'started');
  assert.deepEqual(asked, ['live-monitor', 'start the wear map']);
  assert.equal(preempts, 1);

  await assert.rejects(runWithCapture(async () => busy(), { confirm: async () => false, preempt: async () => assert.fail('must not preempt') }), e => e.cancelled === true && e.holder === 'live-monitor');
  await assert.rejects(runWithCapture(async () => busy(), { confirm: async () => true, preempt: async () => {} }), e => isCaptureBusy(e) && !e.cancelled, 'retries once only');
  await assert.rejects(runWithCapture(async () => { throw 'Audio input not found: X'; }, { confirm: async () => assert.fail('not busy') }), e => e === 'Audio input not found: X');
});
