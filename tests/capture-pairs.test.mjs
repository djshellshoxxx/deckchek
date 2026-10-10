// FS-00 §4.7 input pairs: pair naming/selection, multi-pair stream blocks, and the live, stream,
// bounded-capture and device-list bridges with pair selection (fake Tauri).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inputPairs, parsePairSelection, resolvePairs, pairArgs, startLive, captureNative, MAX_PAIRS } from '../app/capture.js';
import {
  decodeStreamBlock, startStreamSession, startLiveSession, captureClip, listInputDevices, payloadToAudio,
  classifyCaptureError, CaptureBusyError, CAPTURE_BUSY, STREAM_HEADER_BYTES,
} from '../app/ui/audio-io.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/contracts/capture.json'), 'utf8'));
const hexBytes = hex => Uint8Array.from(hex.match(/../g).map(b => parseInt(b, 16)));
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

/** Synthetic 8-channel interleaved buffer: channel c (0-based), frame f -> c * 10 + f / 100. */
const interleaved = (channels, frames) => Array.from({ length: frames * channels }, (_, i) => Math.floor(i % channels) * 10 + Math.floor(i / channels) / 100);

/** Split interleaved data into the selected pairs the way capture.rs does (reference model). */
function splitPairs(data, channels, pairs) {
  const frames = Math.floor(data.length / channels);
  return pairs.map(p => {
    const l = [], r = [];
    for (let f = 0; f < frames; f++) { l.push(data[f * channels + p.first - 1]); r.push(data[f * channels + p.second - 1]); }
    return { left: l, right: r };
  });
}

/** Encode a block like capture.rs: version 1 for one pair, version 2 (pair count at 28) for several. */
function encodePairs({ seq, pairs, sampleRate = 1000, final = false, framesCaptured = 0, version = null }) {
  const frames = Math.min(...pairs.map(p => Math.min(p.left.length, p.right.length)));
  const multi = pairs.length > 1;
  const buf = new ArrayBuffer(STREAM_HEADER_BYTES + frames * 8 * pairs.length), v = new DataView(buf);
  [0x44, 0x43, 0x53, 0x42].forEach((b, i) => v.setUint8(i, b));
  v.setUint16(4, version ?? (multi ? 2 : 1), true); v.setUint16(6, final ? 1 : 0, true);
  v.setUint32(8, seq, true); v.setUint32(12, sampleRate, true); v.setUint32(16, frames, true);
  v.setUint32(28, multi ? pairs.length : 0, true); v.setFloat64(40, framesCaptured, true);
  let o = STREAM_HEADER_BYTES;
  for (const p of pairs) {
    for (let i = 0; i < frames; i++, o += 4) v.setFloat32(o, p.left[i], true);
    for (let i = 0; i < frames; i++, o += 4) v.setFloat32(o, p.right[i], true);
  }
  return buf;
}

// ---------------------------------------------------------------- naming and selection

test('device pairs are named 1-2, 3-4, ... with a final mono pair on odd channel counts (contract)', () => {
  const dev = CONTRACT.inputPairs.listNativeAudioInputs[0];
  assert.deepEqual(inputPairs(dev.maxChannels), dev.pairs);
  assert.deepEqual(inputPairs(CONTRACT.inputPairs.oddChannels.channels).map(p => p.label), CONTRACT.inputPairs.oddChannels.labels);
  assert.deepEqual(inputPairs(5)[2], { label: '5', first: 5, second: 5, mono: true });
  assert.deepEqual(inputPairs(1), [{ label: '1', first: 1, second: 1, mono: true }]);
  assert.deepEqual(inputPairs(0), []);
  assert.deepEqual(inputPairs(undefined), []);
});

test('selections accept a single pair or lists of numbers, labels and pair objects', () => {
  assert.equal(parsePairSelection(null), null);
  assert.equal(parsePairSelection([]), null, 'empty = default pair');
  assert.deepEqual(parsePairSelection(3), [3]);
  assert.deepEqual(parsePairSelection('3-4'), [3]);
  assert.deepEqual(parsePairSelection([3, '5-6', ' 7 ', { first: 1, label: '1-2' }]), [3, 5, 7, 1]);
  assert.deepEqual(parsePairSelection(inputPairs(8).slice(2)), [5, 7], 'pairs from the device list round-trip');
  assert.deepEqual(pairArgs(null), {});
  assert.deepEqual(pairArgs(['1-2', '3-4']), { pairs: [1, 3] });
});

test('malformed selections throw the same text as the native side', () => {
  for (const [bad, re] of [[2, /odd channel/], [0, /odd channel/], ['4-5', /odd channel/], ['3-5', /not a pair name/], ['left', /not a pair name/], [[3, '3-4'], /selected twice/], [true, /are given as/]]) {
    assert.throws(() => parsePairSelection(bad), re, String(bad));
  }
  assert.throws(() => parsePairSelection(Array.from({ length: MAX_PAIRS + 1 }, (_, i) => i * 2 + 1)), /At most 32/);
});

test('out-of-range pairs give the contract error naming the device and its pairs', () => {
  const o = CONTRACT.inputPairs.outOfRange;
  assert.throws(() => resolvePairs(o.pairs, o.channels, o.deviceName), { message: o.error });
  assert.throws(() => resolvePairs([3], 1, 'Mic'), /1 input channel \(pairs 1\)/);
  assert.throws(() => resolvePairs([1], 0, 'Ghost'), /\(pairs none\)/);
  assert.deepEqual(resolvePairs([5, 3], 5, 'Odd').map(p => p.label), ['5', '3-4']);
  assert.deepEqual(resolvePairs(null, 8).map(p => p.label), ['1-2']);
  assert.deepEqual(resolvePairs(null, 1).map(p => p.label), ['1']);
});

test('reference split of 8 interleaved channels picks the requested pairs, mono duplicates', () => {
  const data = interleaved(8, 3);
  const [a, b] = splitPairs(data, 8, resolvePairs([7, 3], 8));
  assert.deepEqual(a, { left: [60, 60.01, 60.02], right: [70, 70.01, 70.02] });
  assert.deepEqual(b, { left: [20, 20.01, 20.02], right: [30, 30.01, 30.02] });
  const [m] = splitPairs(interleaved(5, 2), 5, resolvePairs([5], 5));
  assert.deepEqual(m.left, m.right);
});

// ---------------------------------------------------------------- multi-pair blocks

test('decodeStreamBlock reads the contract multi-pair block (version 2)', () => {
  const d = decodeStreamBlock(hexBytes(CONTRACT.blockPairs.hex));
  const want = CONTRACT.blockPairs.decoded;
  assert.equal(d.seq, want.seq);
  assert.equal(d.frames, want.frames);
  assert.deepEqual(d.pairs.map(p => ({ left: [...p.left], right: [...p.right] })), want.pairs);
  assert.equal(d.left, d.pairs[0].left, 'left/right are the first pair');
  assert.deepEqual(d.quality, want.quality);
});

test('decodeStreamBlock: 8-channel data in 4 pairs, version 1 has one pair, bad pair counts fail', () => {
  const pairs = splitPairs(interleaved(8, 5), 8, inputPairs(8)).map(p => ({ left: p.left.map(Math.fround), right: p.right.map(Math.fround) }));
  const d = decodeStreamBlock(encodePairs({ seq: 4, pairs }));
  assert.equal(d.pairs.length, 4);
  d.pairs.forEach((p, i) => { assert.deepEqual([...p.left], pairs[i].left); assert.deepEqual([...p.right], pairs[i].right); });
  const one = decodeStreamBlock(encodePairs({ seq: 1, pairs: [pairs[0]] }));
  assert.equal(one.pairs.length, 1);
  assert.equal(one.right, one.pairs[0].right);
  const bytes = new Uint8Array(encodePairs({ seq: 4, pairs }));
  assert.throws(() => decodeStreamBlock(bytes.slice(0, bytes.length - 4)), /length/);
  const zero = bytes.slice(); zero.fill(0, 28, 32);
  assert.throws(() => decodeStreamBlock(zero), /no input pairs/);
  const wrongCount = bytes.slice(); wrongCount[28] = 3;
  assert.throws(() => decodeStreamBlock(wrongCount), /length/);
  assert.throws(() => decodeStreamBlock(encodePairs({ seq: 1, pairs: [pairs[0]], version: 3 })), /version 3/);
});

// ---------------------------------------------------------------- bridges (fake Tauri)

function fakeTauri({ channels = 8, busy = false } = {}) {
  const calls = [];
  let channel = null, streaming = false;
  const busyErr = { code: CAPTURE_BUSY, message: 'The audio input is busy: "live-monitor" is already running.', holder: 'live-monitor', since: 1, kind: 'stream', deviceName: null, leaseId: 1 };
  const pairsFor = args => { if (busy) throw busyErr; return resolvePairs(args.pairs ?? null, channels, 'Traktor Audio 8 DJ'); };
  const handlers = {
    list_native_audio_inputs: () => [
      { name: 'Traktor Audio 8 DJ', isDefault: false, maxChannels: 8, defaultChannels: 8, pairs: inputPairs(8) },
      { name: 'Old backend', isDefault: true },
    ],
    start_stream_capture: args => {
      const pairs = pairsFor(args);
      channel = args.channel; streaming = true;
      return { streamId: 10, holder: args.holder, deviceName: 'Traktor Audio 8 DJ', sampleRate: 1000, channels, blockMs: args.blockMs, blockFrames: 20, pairs };
    },
    stream_capture_ack: () => null,
    stop_stream_capture: () => {
      if (!streaming) throw 'No stream capture is running.';
      streaming = false;
      channel.onmessage(encodePairs({ seq: 9, pairs: [{ left: [], right: [] }], final: true }));
      return { streamId: 10, ended: 'stopped', blocksSent: 1, lastSeq: 9, droppedBlocks: 0, framesCaptured: 0, overrunSamples: 0, streamErrors: 0, streamErrorMessages: [] };
    },
    start_live_capture: args => ({ deviceName: 'Traktor Audio 8 DJ', sampleRate: 48000, channels, maxSeconds: args.maxSeconds, leaseId: 5, pairs: pairsFor(args) }),
    live_capture_status: () => ({ running: true, elapsedSec: 0, quality: {} }),
    stop_live_capture: () => ({
      payload: { deviceName: 'Traktor Audio 8 DJ', sampleRate: 48000, channels, left: [0.1], right: [0.2], streamErrors: [], pairs: resolvePairs([3, 7], channels), extraPairs: [{ ...resolvePairs([7], channels)[0], left: [0.7], right: [0.8] }] },
      quality: {},
    }),
    capture_native_audio: args => {
      const pairs = pairsFor(args);
      const [first, ...rest] = splitPairs(interleaved(channels, 4), channels, pairs);
      return { deviceName: 'Traktor Audio 8 DJ', sampleRate: 48000, channels, left: first.left, right: first.right, streamErrors: [], pairs, extraPairs: rest.map((x, i) => ({ ...pairs[i + 1], ...x })) };
    },
  };
  class Channel { constructor() { this.onmessage = () => {}; } }
  const levelHandlers = [];
  const tauri = {
    core: { Channel, invoke: async (cmd, args = {}) => { calls.push([cmd, args]); if (!handlers[cmd]) throw `unknown command ${cmd}`; return handlers[cmd](args); } },
    event: { listen: async (_name, fn) => { levelHandlers.push(fn); return () => {}; } },
  };
  return { tauri, calls, emit: (seq, pairs) => channel.onmessage(encodePairs({ seq, pairs })), levels: payload => levelHandlers.forEach(fn => fn({ payload })) };
}

async function withWindow(tauri, fn) {
  globalThis.window = { __TAURI__: tauri };
  try { return await fn(); } finally { delete globalThis.window; }
}

test('stream bridge sends the selected pairs and labels each block pair', async () => {
  const f = fakeTauri();
  const got = [];
  const s = await startStreamSession({ holder: 'pre-gig', sampleRate: 48000, pairs: ['1-2', '3-4'], tauri: f.tauri, onBlock: b => got.push(b) });
  const [, args] = f.calls.find(c => c[0] === 'start_stream_capture');
  assert.deepEqual(Object.keys(args).sort(), Object.keys(CONTRACT.inputPairs.startStreamRequest).sort());
  assert.deepEqual(args.pairs, [1, 3]);
  assert.deepEqual(s.info.pairs.map(p => p.label), ['1-2', '3-4']);
  const [deckA, deckB] = splitPairs(interleaved(8, 20), 8, s.info.pairs).map(p => ({ left: p.left.map(Math.fround), right: p.right.map(Math.fround) }));
  f.emit(0, [deckA, deckB]);
  await tick(10);
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].pairs.map(p => p.pair.label), ['1-2', '3-4']);
  assert.deepEqual([...got[0].pairs[1].left], deckB.left, 'deck B = channels 3-4');
  assert.deepEqual([...got[0].left], deckA.left);
  await s.stop();
});

test('stream bridge keeps the old arguments without a selection and rejects bad selections before starting', async () => {
  const f = fakeTauri();
  const s = await startStreamSession({ holder: 'wear-map', tauri: f.tauri });
  const [, args] = f.calls.find(c => c[0] === 'start_stream_capture');
  assert.deepEqual(Object.keys(args).sort(), Object.keys(CONTRACT.commands.start_stream_capture.request).sort());
  await s.stop();
  const g = fakeTauri();
  await assert.rejects(startStreamSession({ holder: 'x', pairs: 4, tauri: g.tauri }), /odd channel/);
  assert.equal(g.calls.length, 0);
  const h = fakeTauri({ channels: 2 });
  await assert.rejects(startStreamSession({ holder: 'x', pairs: [3], tauri: h.tauri }), /3-4 is not available/);
});

test('live session passes pairs, publishes per-pair levels and returns every pair', async () => {
  const f = fakeTauri();
  await withWindow(f.tauri, async () => {
    const seen = [];
    const live = await startLiveSession({ maxSeconds: 5, pairs: [3, 7], onLevels: l => seen.push(l) });
    const [, args] = f.calls.find(c => c[0] === 'start_live_capture');
    assert.deepEqual(args, { deviceName: null, maxSeconds: 5, pairs: [3, 7] });
    assert.deepEqual(live.info.pairs.map(p => p.label), ['3-4', '7-8']);
    f.levels({ peakL: 0.5, pairs: [{ label: '3-4', first: 3, peakL: 0.5 }, { label: '7-8', first: 7, peakL: 0.2 }] });
    assert.equal(seen[0].pairs[1].label, '7-8');
    const { audio } = await live.stop();
    assert.deepEqual(audio.pairs.map(p => p.pair.label), ['3-4', '7-8']);
    assert.equal(audio.pairs[0].left, audio.left);
    assert.deepEqual([...audio.pairs[1].right], [Math.fround(0.8)]);
    await assert.rejects(startLiveSession({ pairs: ['2-3'] }), /odd channel/);
  });
});

test('startLive bridge keeps the old argument shape without pairs', async () => {
  const f = fakeTauri();
  await withWindow(f.tauri, async () => {
    await startLive({ maxSeconds: 60 });
    assert.deepEqual(f.calls.at(-1)[1], CONTRACT.commands.start_live_capture.request);
  });
});

test('bounded capture: contract arguments, per-pair audio, busy errors', async () => {
  const f = fakeTauri();
  await withWindow(f.tauri, async () => {
    const want = CONTRACT.inputPairs.captureNativeRequest;
    await captureNative({ deviceName: want.deviceName, durationSec: want.durationSec, pairs: '3-4', holder: want.holder });
    assert.deepEqual(f.calls.at(-1), ['capture_native_audio', want]);
    await captureNative({ durationSec: 2 });
    assert.deepEqual(f.calls.at(-1)[1], { deviceName: null, durationSec: 2 }, 'old argument shape without pairs/holder');
    const r = await captureClip({ deviceName: 'Traktor Audio 8 DJ', durationSec: 1, pairs: [1, 5], holder: 'pre-gig' });
    assert.deepEqual(r.audio.pairs.map(p => p.pair.label), ['1-2', '5-6']);
    assert.deepEqual([...r.audio.pairs[1].left], [40, 40.01, 40.02, 40.03].map(Math.fround));
    assert.deepEqual([...r.audio.right], [10, 10.01, 10.02, 10.03].map(Math.fround));
    assert.equal(r.deviceName, 'Traktor Audio 8 DJ');
  });
  const b = fakeTauri({ busy: true });
  await withWindow(b.tauri, async () => {
    await assert.rejects(captureClip({ durationSec: 1 }), e => e instanceof CaptureBusyError && e.holder === 'live-monitor');
  });
});

test('device list reports channel counts and pairs; older backends fall back to 1-2', async () => {
  const f = fakeTauri();
  await withWindow(f.tauri, async () => {
    const { backend, devices } = await listInputDevices();
    assert.equal(backend, 'native');
    assert.equal(devices[0].maxChannels, 8);
    assert.deepEqual(devices[0].pairs.map(p => p.label), ['1-2', '3-4', '5-6', '7-8']);
    assert.equal(devices[1].maxChannels, null);
    assert.deepEqual(devices[1].pairs.map(p => p.label), ['1-2']);
  });
});

test('payloadToAudio: legacy payloads become a single 1-2 (or mono 1) pair', () => {
  const a = payloadToAudio({ left: [0.1, 0.2], right: [0.3, 0.4], sampleRate: 48000, channels: 2 });
  assert.equal(a.pairs.length, 1);
  assert.equal(a.pairs[0].pair.label, '1-2');
  assert.equal(a.pairs[0].right, a.right);
  assert.equal(payloadToAudio({ left: [0.1], channels: 1 }).pairs[0].pair.label, '1');
  const m = payloadToAudio({ left: [0.1], right: [0.1], channels: 5, pairs: inputPairs(5).slice(2), extraPairs: [] });
  assert.ok(m.pairs[0].pair.mono);
});

test('pair and preempt errors are classified for the UI', () => {
  const c = classifyCaptureError(new Error(CONTRACT.inputPairs.outOfRange.error));
  assert.equal(c.kind, 'pair');
  assert.match(c.message, /9-10 is not available/);
  assert.equal(classifyCaptureError('Input pairs start on an odd channel (1-2, 3-4, ...); channel 4 does not start a pair.').kind, 'pair');
  assert.equal(classifyCaptureError('The capture was stopped because another DeckChek feature needed the audio input.').kind, 'preempted');
  assert.equal(classifyCaptureError('Audio input not found: X').kind, 'no-device', 'unchanged');
});
