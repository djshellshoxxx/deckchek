// Audio input/output glue: file decoding, live native capture sessions
// (via ../capture.js), WebAudio playback, device listing and error mapping.

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

/** Map backend error text to a user-facing failure with cause, consequence and next step. */
export function classifyCaptureError(error) {
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
 */
export async function startLiveSession({ deviceName = null, maxSeconds = 60, onLevels = null, onStatus = null } = {}) {
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
    throw error;
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
    try {
      const result = await capture.stopLive();
      const audio = payloadToAudio(result?.payload);
      return { audio, quality: result?.quality || null, streamErrors: result?.payload?.streamErrors || [], deviceName: result?.payload?.deviceName || info?.deviceName || deviceName || 'input' };
    } finally { unlisten(); }
  }
  return {
    info,
    stop,
    async cancel() { if (!stopped) { try { await stop(); } catch { /* discard */ } } levelBus.reset(); },
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
