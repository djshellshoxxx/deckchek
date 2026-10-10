// Audio input/output glue: file decoding, live native capture sessions
// (via ../capture.js), the capture lease + streaming capture bridge (FS-00 §4.7),
// WebAudio playback, device listing and error mapping.

import * as capture from '../capture.js';
import { levelBus } from './meters.js';

/**
 * Parse PCM/float WAV directly so the native sample rate is preserved
 * (WebAudio decoding resamples to the context rate). Returns null if unsupported.
 */
export function parseWav(buffer) {
  const v = new DataView(buffer);
  const tag = o => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buffer.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= buffer.byteLength;) {
    const id = tag(o), size = v.getUint32(o + 4, true), body = o + 8;
    if (id === 'fmt ') {
      let format = v.getUint16(body, true);
      if (format === 0xFFFE && size >= 26) format = v.getUint16(body + 24, true);
      fmt = { format, channels: v.getUint16(body + 2, true), sampleRate: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    } else if (id === 'data') data = { offset: body, size: Math.min(size, buffer.byteLength - body) };
    o = body + size + (size & 1);
  }
  if (!fmt || !data || !fmt.channels || !fmt.sampleRate) return null;
  const bytes = fmt.bits / 8, frame = bytes * fmt.channels, n = Math.floor(data.size / frame);
  let read;
  if (fmt.format === 1 && fmt.bits === 16) read = o => v.getInt16(o, true) / 32768;
  else if (fmt.format === 1 && fmt.bits === 24) read = o => { const x = v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16); return x / 8388608; };
  else if (fmt.format === 1 && fmt.bits === 32) read = o => v.getInt32(o, true) / 2147483648;
  else if (fmt.format === 3 && fmt.bits === 32) read = o => v.getFloat32(o, true);
  else if (fmt.format === 3 && fmt.bits === 64) read = o => v.getFloat64(o, true);
  else return null;
  const left = new Float32Array(n), right = new Float32Array(n);
  for (let i = 0, o = data.offset; i < n; i++, o += frame) {
    left[i] = read(o);
    right[i] = fmt.channels > 1 ? read(o + bytes) : left[i];
  }
  return { left, right, sampleRate: fmt.sampleRate, durationSec: n / fmt.sampleRate, channels: fmt.channels };
}

/** Decode an audio file into {left,right,sampleRate,durationSec,channels} (WAV natively, others via WebAudio). */
export async function decodeAudioFile(file) {
  const bytes = await file.arrayBuffer();
  const wav = parseWav(bytes);
  if (wav) {
    if (!wav.left.length) throw new Error(`“${file.name}” contains no audio samples.`);
    return wav;
  }
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) throw new Error('Web Audio is unavailable in this runtime, so audio files cannot be decoded.');
  const ctx = new Context();
  try {
    const audio = await ctx.decodeAudioData(bytes.slice(0));
    const left = new Float32Array(audio.getChannelData(0));
    const right = audio.numberOfChannels > 1 ? new Float32Array(audio.getChannelData(1)) : new Float32Array(left);
    return { left, right, sampleRate: audio.sampleRate, durationSec: audio.duration, channels: audio.numberOfChannels };
  } catch (error) {
    throw new Error(`Could not decode “${file.name}”. Use WAV, AIFF, FLAC or MP3. (${error?.message || error})`);
  } finally {
    ctx.close?.().catch?.(() => {});
  }
}

export function payloadToAudio(payload) {
  const left = Float32Array.from(payload?.left || []);
  const right = payload?.right?.length ? Float32Array.from(payload.right) : Float32Array.from(left);
  const sampleRate = payload?.sampleRate || 48000;
  return { left, right, sampleRate, channels: payload?.channels || 2, durationSec: left.length / sampleRate };
}

export const liveAvailable = () => capture.isNativeAvailable();

/** List inputs: native names in the desktop app, browser labels (file-analysis only) otherwise. */
export async function listInputDevices() {
  if (capture.isNativeAvailable()) {
    const list = await capture.listInputs();
    return { backend: 'native', devices: (list || []).map(d => ({ id: d.name, name: d.name, isDefault: Boolean(d.isDefault) })) };
  }
  return { backend: 'browser', devices: [] };
}

// ---------------------------------------------------------------- capture lease (FS-00 §4.7)

export const CAPTURE_BUSY = 'CAPTURE_BUSY';

const HOLDER_LABELS = {
  'live-capture': 'A live capture',
  'stream-capture': 'An audio stream',
  'live-monitor': 'Live monitor',
  'wear-map': 'Wear map',
  'scratch-stress': 'Scratch stress test',
  'latency-tuner': 'Latency tuner',
  'pre-gig': 'Pre-gig check',
  'hum-hunter': 'Hum hunter',
  'setup-wizard': 'Setup wizard',
};

/** Sentence-start label for a lease holder id ("live-monitor" -> "Live monitor"). */
export function captureHolderLabel(holder) {
  const id = String(holder ?? '').trim();
  if (!id) return 'Another capture';
  if (HOLDER_LABELS[id]) return HOLDER_LABELS[id];
  const words = id.replace(/^fs\d+:/i, '').replace(/[-_.:]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Another capture';
}

/** Error thrown when the capture lease is held by another feature. */
export class CaptureBusyError extends Error {
  constructor(info = {}) {
    super(info.message || `The audio input is busy: "${info.holder || 'another capture'}" is already running.`);
    this.name = 'CaptureBusyError';
    this.code = CAPTURE_BUSY;
    this.holder = info.holder ?? null;
    this.since = Number.isFinite(info.since) ? info.since : null;
    this.kind = info.kind ?? null;
    this.deviceName = info.deviceName ?? null;
    this.leaseId = info.leaseId ?? null;
  }
}

export const isCaptureBusy = error => error?.code === CAPTURE_BUSY;

/** Turn a structured CAPTURE_BUSY rejection into a CaptureBusyError; anything else is returned unchanged. */
export function normalizeCaptureError(error) {
  if (error instanceof CaptureBusyError) return error;
  if (error && typeof error === 'object' && error.code === CAPTURE_BUSY) return new CaptureBusyError(error);
  return error;
}

function tauriApi(tauri) {
  const t = tauri === undefined ? (typeof window !== 'undefined' ? window.__TAURI__ : null) : tauri;
  return t?.core && typeof t.core.invoke === 'function' ? t : null;
}

function requireTauriApi(tauri) {
  const t = tauriApi(tauri);
  if (!t) throw new Error('Native audio capture is only available in the DeckChek desktop app.');
  return t;
}

// Sessions started from this page, by lease id, so "Stop and continue" can end them cleanly.
const activeCaptures = new Map();

/** Lease status: {held, leaseId, holder, deviceName, since, kind} ({held:false, supported:false} in browser mode). */
export async function captureLeaseStatus({ tauri } = {}) {
  const t = tauriApi(tauri);
  if (!t) return { held: false, supported: false, leaseId: null, holder: null, deviceName: null, since: null, kind: null };
  return { supported: true, ...(await t.core.invoke('capture_lease_status')) };
}

/** Hold the input for a capture path that is not a live/stream session. Rejects with CaptureBusyError. */
export async function acquireCaptureLease(holder, { deviceName = null, tauri } = {}) {
  const t = requireTauriApi(tauri);
  try { return await t.core.invoke('capture_lease_acquire', { holder, deviceName }); } catch (error) { throw normalizeCaptureError(error); }
}

export async function releaseCaptureLease(leaseId, { tauri } = {}) {
  const t = tauriApi(tauri);
  if (!t || leaseId == null) return false;
  return t.core.invoke('capture_lease_release', { leaseId });
}

/**
 * Stop whatever holds the input ("Stop <holder> and continue"). Sessions started from this page are
 * stopped through their own controller (their owners get onPreempted); anything else, e.g. a session
 * left over from before a reload, is stopped natively. Resolves the stopped holder's status, or null.
 */
export async function preemptCapture({ tauri } = {}) {
  const t = tauriApi(tauri);
  if (!t) return null;
  const status = await t.core.invoke('capture_lease_status');
  if (!status?.held) return null;
  const local = activeCaptures.get(status.leaseId);
  if (local) {
    try { await local.preempt(); } catch { /* fall through to the native stop */ }
  }
  const after = await t.core.invoke('capture_lease_status');
  if (after?.held && after.leaseId === status.leaseId) await t.core.invoke('capture_preempt');
  return status;
}

// ---------------------------------------------------------------- stream blocks

export const STREAM_HEADER_BYTES = 48;
const STREAM_MAGIC = 0x42534344; // "DCSB" little endian
const FLAG_FINAL = 1, FLAG_DISCONTINUITY = 2;
const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function toArrayBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  if (Array.isArray(data)) return new Uint8Array(data).buffer;
  throw new Error('Stream block is not binary data.');
}

function readF32(buffer, offset, frames) {
  if (littleEndian) return new Float32Array(buffer.slice(offset, offset + frames * 4));
  const v = new DataView(buffer), out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = v.getFloat32(offset + i * 4, true);
  return out;
}

/** Decode one binary stream block (format in src-tauri/src/capture.rs) into {seq, sampleRate, frames, left, right, quality}. */
export function decodeStreamBlock(data) {
  const buffer = toArrayBuffer(data);
  if (buffer.byteLength < STREAM_HEADER_BYTES) throw new Error('Stream block is truncated.');
  const v = new DataView(buffer);
  if (v.getUint32(0, true) !== STREAM_MAGIC) throw new Error('Not a DeckChek stream block.');
  if (v.getUint16(4, true) !== 1) throw new Error(`Unsupported stream block version ${v.getUint16(4, true)}.`);
  const flags = v.getUint16(6, true), frames = v.getUint32(16, true);
  if (buffer.byteLength !== STREAM_HEADER_BYTES + frames * 8) throw new Error('Stream block length does not match its frame count.');
  return {
    seq: v.getUint32(8, true),
    sampleRate: v.getUint32(12, true),
    frames,
    left: readF32(buffer, STREAM_HEADER_BYTES, frames),
    right: readF32(buffer, STREAM_HEADER_BYTES + frames * 4, frames),
    quality: {
      droppedBlocks: v.getUint32(20, true),
      streamErrors: v.getUint32(24, true),
      overrunSamples: v.getFloat64(32, true),
      framesCaptured: v.getFloat64(40, true),
      discontinuity: Boolean(flags & FLAG_DISCONTINUITY),
      final: Boolean(flags & FLAG_FINAL),
    },
  };
}

const FINAL_BLOCK_WAIT_MS = 2000;

/**
 * Start a streaming capture (FS-13, FS-31): stereo f32 blocks of `blockMs` arrive in order through
 * onBlock(block) (may be async; the next block waits for it, and the block is acknowledged after it
 * resolves, which is what Rust's lag window measures). Rejects with CaptureBusyError when another
 * feature holds the input. Returns {info, stop() -> summary, stats(), ended}. onEnd({reason, summary})
 * fires once: reason 'stopped' (stop()), 'preempted' (Stop and continue), 'deviceLost' or 'sinkClosed'.
 */
export async function startStreamSession({ holder, deviceName = null, sampleRate = null, blockMs = 1000, onBlock = null, onEnd = null, onPreempted = null, tauri } = {}) {
  const t = requireTauriApi(tauri);
  const ChannelClass = t.core.Channel;
  if (typeof ChannelClass !== 'function') throw new Error('Streaming capture needs the Tauri Channel API.');
  const channel = new ChannelClass();
  const stats = { blocks: 0, frames: 0, droppedBlocks: 0, discontinuities: 0, lastSeq: null, decodeErrors: 0 };
  let info = null, ended = false, summary = null, endReason = null, stopping = null;
  let finalSeen = false, resolveFinal;
  const finalBlock = new Promise(resolve => { resolveFinal = resolve; });
  let chain = Promise.resolve();
  const early = [];

  const finish = (reason, sum) => {
    if (ended) return;
    ended = true; endReason = reason; summary = sum ?? summary;
    if (info) activeCaptures.delete(info.streamId);
    try { onEnd?.({ reason, summary }); } catch { /* owner callback */ }
  };

  const handle = async data => {
    let block;
    try { block = decodeStreamBlock(data); } catch { stats.decodeErrors++; return; }
    stats.blocks++; stats.frames += block.frames; stats.lastSeq = block.seq;
    stats.droppedBlocks = block.quality.droppedBlocks;
    if (block.quality.discontinuity) stats.discontinuities++;
    try { if (block.frames || !block.quality.final) await onBlock?.(block); } catch { /* owner callback; keep streaming */ }
    if (!block.quality.final) t.core.invoke('stream_capture_ack', { streamId: info.streamId, seq: block.seq }).catch(() => {});
    else {
      finalSeen = true; resolveFinal();
      if (!stopping) {
        // Ended by itself (device lost, preempted natively): collect the summary and release the slot.
        let sum = null;
        try { sum = await t.core.invoke('stop_stream_capture'); } catch { /* already reaped */ }
        // No summary (or a plain stop by someone else) means it was stopped natively: a preempt.
        finish(!sum || sum.ended === 'stopped' ? 'preempted' : sum.ended, sum);
      }
    }
  };
  channel.onmessage = data => {
    if (!info) { early.push(data); return; }
    chain = chain.then(() => handle(data));
  };

  try {
    info = await t.core.invoke('start_stream_capture', { deviceName, sampleRate, blockMs, holder: holder || null, channel });
  } catch (error) {
    throw normalizeCaptureError(error);
  }
  early.splice(0).forEach(d => { chain = chain.then(() => handle(d)); });

  async function stop(reason = 'stopped') {
    if (ended) return summary;
    if (!stopping) {
      stopping = (async () => {
        let sum = null;
        try { sum = await t.core.invoke('stop_stream_capture'); } catch (error) { if (!finalSeen) throw error; }
        if (!finalSeen) await Promise.race([finalBlock, new Promise(r => setTimeout(r, FINAL_BLOCK_WAIT_MS))]);
        await chain;
        finish(reason, sum);
        return summary;
      })();
    }
    return stopping;
  }

  activeCaptures.set(info.streamId, {
    kind: 'stream', holder: info.holder,
    async preempt() { await stop('preempted'); try { onPreempted?.(); } catch { /* owner callback */ } },
  });

  return {
    info,
    stop: () => stop('stopped'),
    stats: () => ({ ...stats }),
    get ended() { return ended; },
    get endReason() { return endReason; },
  };
}

/** Map backend error text to a user-facing failure with cause, consequence and next step. */
export function classifyCaptureError(error) {
  if (isCaptureBusy(error)) {
    const who = captureHolderLabel(error.holder);
    return { kind: 'busy', title: 'Input is busy', message: `${who} is using the audio input. Stop it, then retry.`, holder: error.holder ?? null, since: error.since ?? null, raw: String(error.message || CAPTURE_BUSY) };
  }
  const text = String(error?.message || error || 'Unknown error');
  const t = text.toLowerCase();
  if (/only available in the deckchek desktop app|tauri/.test(t)) return { kind: 'unavailable', title: 'Live capture needs the desktop app', message: 'This browser preview cannot open audio inputs. Load a recorded file instead, or run the DeckChek desktop app.', raw: text };
  if (/permission|denied|not allowed|access/.test(t)) return { kind: 'permission', title: 'Microphone access was denied', message: 'Windows blocked DeckChek from the input. Open Settings › Privacy › Microphone, allow desktop apps, then retry.', raw: text };
  if (/no (default )?input|not found|no device|no such device|unavailable device/.test(t)) return { kind: 'no-device', title: 'No input device found', message: 'The selected input is not connected or was unplugged. Reconnect the interface, choose an input in the top bar, then retry.', raw: text };
  if (/already running|in use|busy|exclusive/.test(t)) return { kind: 'busy', title: 'Input is busy', message: 'Another capture or application is holding the input. Stop it (or close the other app) and retry.', raw: text };
  if (/format|sample rate|unsupported/.test(t)) return { kind: 'format', title: 'Unsupported input format', message: 'The device rejected the requested format. Pick a different sample rate in the interface control panel and retry.', raw: text };
  return { kind: 'stream', title: 'Capture failed', message: 'The audio stream reported an error. Check the device connection and driver, then retry.', raw: text };
}

/**
 * Start a live session. Levels go to levelBus (and onLevels). Returns a controller:
 * { info, stop() -> {audio, quality, streamErrors, deviceName}, cancel(), elapsed() }.
 * Rejects with CaptureBusyError when another feature holds the input (see ./capture-busy.js);
 * onPreempted fires after "Stop and continue" ended this session for another feature.
 */
export async function startLiveSession({ deviceName = null, maxSeconds = 60, onLevels = null, onStatus = null, onPreempted = null } = {}) {
  levelBus.reset();
  let lastEvent = performance.now(), elapsedSec = 0, overruns = 0;
  const unlisten = capture.onLevels(levels => {
    lastEvent = performance.now();
    if (Number.isFinite(levels?.elapsedSec)) elapsedSec = levels.elapsedSec;
    if (Number.isFinite(levels?.overrunSamples)) overruns = levels.overrunSamples;
    levelBus.publish(levels);
    onLevels?.(levels);
  });
  let info;
  try {
    info = await capture.startLive({ deviceName: deviceName || null, maxSeconds });
  } catch (error) {
    unlisten();
    throw normalizeCaptureError(error);
  }
  const started = performance.now();
  let stopped = false;
  const poll = setInterval(async () => {
    try {
      const st = await capture.status();
      if (st && !stopped) onStatus?.({ running: st.running, elapsedSec: st.elapsedSec, quality: st.quality, sinceLastLevelsMs: performance.now() - lastEvent });
    } catch { /* status is advisory */ }
  }, 1000);
  async function stop() {
    if (stopped) throw new Error('Capture already stopped.');
    stopped = true;
    clearInterval(poll);
    if (leaseId != null) activeCaptures.delete(leaseId);
    try {
      const result = await capture.stopLive();
      const audio = payloadToAudio(result?.payload);
      return { audio, quality: result?.quality || null, streamErrors: result?.payload?.streamErrors || [], deviceName: result?.payload?.deviceName || info?.deviceName || deviceName || 'input' };
    } finally { unlisten(); }
  }
  async function cancel() { if (!stopped) { try { await stop(); } catch { /* discard */ } } levelBus.reset(); }
  const leaseId = info?.leaseId ?? null;
  if (leaseId != null) activeCaptures.set(leaseId, { kind: 'live', holder: 'live-capture', async preempt() { await cancel(); try { onPreempted?.(); } catch { /* owner callback */ } } });
  return {
    info,
    stop,
    cancel,
    elapsed: () => elapsedSec || (performance.now() - started) / 1000,
    overruns: () => overruns,
    get stopped() { return stopped; },
  };
}

/** True when output-device routing (AudioContext.setSinkId) is available. */
export function outputSelectionSupported() {
  const C = globalThis.AudioContext;
  return Boolean(C?.prototype && 'setSinkId' in C.prototype && globalThis.navigator?.mediaDevices?.enumerateDevices);
}

/** List audio output devices ([] when unsupported or enumeration fails). */
export async function listOutputDevices() {
  if (!outputSelectionSupported()) return [];
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'audiooutput').map((d, i) => ({ id: d.deviceId, label: d.label || (d.deviceId === 'default' ? 'System default' : `Output ${i + 1}`) }));
  } catch { return []; }
}

/** Play a stereo buffer via WebAudio on the default output, or on sinkId when given. Returns {done, stop}. */
export async function playStereo({ left, right, sampleRate }, { sinkId = '' } = {}) {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) throw new Error('Web Audio playback is unavailable.');
  let ctx;
  try { ctx = new Context({ sampleRate }); } catch { ctx = new Context(); }
  if (sinkId && typeof ctx.setSinkId === 'function') { try { await ctx.setSinkId(sinkId); } catch { /* fall back to default output */ } }
  await ctx.resume?.();
  const buffer = ctx.createBuffer(2, left.length, sampleRate);
  buffer.copyToChannel(left, 0); buffer.copyToChannel(right || left, 1);
  const src = ctx.createBufferSource();
  src.buffer = buffer; src.connect(ctx.destination);
  const done = new Promise(resolve => { src.onended = () => { ctx.close().catch(() => {}); resolve(); }; });
  src.start();
  return { done, stop: () => { try { src.stop(); } catch { /* already stopped */ } }, outputRate: ctx.sampleRate };
}
