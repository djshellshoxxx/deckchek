// Native capped audio output bridge (FS-00 §4.9, AC-6).
//
// Calls the Rust `audio_out.rs` engine. The output-safety rules live in Rust
// and cannot be bypassed from here: an absolute -12 dBFS cap, a per-call cap,
// linear level ramps >= 10 ms, a 20 ms stop fade, a 60 s inactivity mute for
// tones and looped buffers, and silence on window close, app exit, panics and
// device errors. This module clamps the same way first (defence in depth, and
// so the UI shows the level that will actually play) and converts typed arrays
// for IPC.
//
// Browser mode has no native output: `supported` is false and every play call
// rejects with `code: 'unsupported'` (FS-01 keeps WebAudio `playStereo` with a
// local -12 dBFS clamp; other features show their unsupported state).
// Only one voice plays at a time; starting a new one fades out the previous.

export const ABS_MAX_DBFS = -12;
export const SILENCE_DBFS = -120;
export const MIN_RAMP_MS = 10;
export const MAX_RAMP_MS = 5000;
export const DEFAULT_RAMP_MS = 50;
export const STOP_FADE_MS = 20;
export const INACTIVITY_MUTE_SECS = 60;
export const TONE_TYPES = Object.freeze(['sine', 'pinkband', 'chirp']);
export const SAFETY_COPY = 'Turn monitors and headphones down first. DeckChek never plays louder than -12 dBFS.';

const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;

/** Error with a machine-readable `code` (Rust errors arrive as "CODE: message"). */
export class AudioOutError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AudioOutError';
    this.code = code;
  }
}

/** Splits a Rust error string "AUDIO_OUT_X: text" into an AudioOutError. */
export function toAudioOutError(err) {
  if (err instanceof AudioOutError) return err;
  const text = typeof err === 'string' ? err : String(err?.message ?? err);
  const m = /^(AUDIO_OUT_[A-Z_]+):\s*(.*)$/s.exec(text);
  return m ? new AudioOutError(m[1], m[2]) : new AudioOutError('AUDIO_OUT_ERROR', text);
}

/** The cap a call actually gets: min(cap, -12 dBFS); missing -> -12; NaN -> silence. */
export function effectiveCapDbfs(capDbfs) {
  if (capDbfs === undefined || capDbfs === null) return ABS_MAX_DBFS;
  const c = Number(capDbfs);
  if (Number.isNaN(c)) return SILENCE_DBFS;
  return Math.min(ABS_MAX_DBFS, Math.max(SILENCE_DBFS, c));
}

/** Level clamped to [SILENCE_DBFS, min(cap, -12)]. Non-numeric levels -> silence. */
export function clampLevelDbfs(levelDbfs, capDbfs) {
  const cap = effectiveCapDbfs(capDbfs);
  const l = typeof levelDbfs === 'number' ? levelDbfs : Number(levelDbfs);
  if (Number.isNaN(l)) return SILENCE_DBFS;
  return Math.max(SILENCE_DBFS, Math.min(cap, l));
}

/** Ramp time in ms, never below 10 ms. */
export function clampRampMs(rampMs) {
  const r = Number(rampMs);
  if (rampMs === undefined || rampMs === null || !Number.isFinite(r)) return DEFAULT_RAMP_MS;
  return Math.min(MAX_RAMP_MS, Math.max(MIN_RAMP_MS, r));
}

const finiteOrNull = v => (v === undefined || v === null ? undefined : Number(v));

function toArray(samples, name) {
  if (!samples || typeof samples.length !== 'number') throw new AudioOutError('AUDIO_OUT_INVALID', `${name} must be an array of samples`);
  // JSON cannot carry NaN/Infinity: replace them with 0 (Rust zeroes them too).
  return Array.from(samples, v => (Number.isFinite(v) ? v : 0));
}

/** Builds the exact `audio_play_tone` spec Rust receives. */
export function toneSpec({ type = 'sine', freqHz, endHz, durationSec, levelDbfs, capDbfs, rampMs } = {}) {
  if (!TONE_TYPES.includes(type)) throw new AudioOutError('AUDIO_OUT_INVALID', `unknown tone type '${type}'`);
  if (levelDbfs === undefined || levelDbfs === null) throw new AudioOutError('AUDIO_OUT_INVALID', 'levelDbfs is required');
  const cap = effectiveCapDbfs(capDbfs);
  const spec = { type, levelDbfs: clampLevelDbfs(levelDbfs, cap), capDbfs: cap, rampMs: clampRampMs(rampMs) };
  for (const [k, v] of [['freqHz', freqHz], ['endHz', endHz], ['durationSec', durationSec]]) {
    const n = finiteOrNull(v);
    if (n !== undefined) {
      if (!Number.isFinite(n)) throw new AudioOutError('AUDIO_OUT_INVALID', `${k} must be a finite number`);
      spec[k] = n;
    }
  }
  return spec;
}

/** Builds the exact `audio_play_buffer` arguments Rust receives. */
export function bufferArgs({ sampleRate, left, right } = {}, { levelDbfs, capDbfs, loop = false, rampMs } = {}) {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new AudioOutError('AUDIO_OUT_INVALID', 'sampleRate must be a positive integer');
  if (levelDbfs === undefined || levelDbfs === null) throw new AudioOutError('AUDIO_OUT_INVALID', 'levelDbfs is required');
  const cap = effectiveCapDbfs(capDbfs);
  const l = toArray(left, 'left');
  const r = right === undefined || right === null ? [] : toArray(right, 'right');
  if (r.length && r.length !== l.length) throw new AudioOutError('AUDIO_OUT_INVALID', 'left and right must have the same length');
  return {
    buffer: { sampleRate, left: l, right: r },
    opts: { levelDbfs: clampLevelDbfs(levelDbfs, cap), capDbfs: cap, loop: Boolean(loop), rampMs: clampRampMs(rampMs) },
  };
}

const unsupported = () => new AudioOutError('unsupported', 'Native audio output is only available in the DeckChek desktop app.');

/**
 * Create a bridge. `invoke` defaults to the Tauri bridge (looked up per call);
 * pass `invoke: null` to force browser mode.
 * Methods: listOutputs(), playTone(spec, {device}), playBuffer(buffer, opts, {device}),
 * setLevel(handle, levelDbfs, {capDbfs}), stop(handle), stopAll(), status().
 */
export function createAudioOut({ invoke } = {}) {
  const bridge = () => (invoke === undefined ? nativeInvoke() : invoke);
  const call = async (cmd, args) => {
    const fn = bridge();
    if (!fn) throw unsupported();
    try { return await fn(cmd, args); } catch (e) { throw toAudioOutError(e); }
  };
  return {
    get supported() { return Boolean(bridge()); },
    async listOutputs() {
      if (!bridge()) return [];
      return (await call('list_native_audio_outputs', {})) ?? [];
    },
    async playTone(spec, { device = null } = {}) {
      return call('audio_play_tone', { device: device || null, spec: toneSpec(spec) });
    },
    async playBuffer(buffer, opts, { device = null } = {}) {
      const { buffer: b, opts: o } = bufferArgs(buffer, opts);
      return call('audio_play_buffer', { device: device || null, buffer: b, opts: o });
    },
    /** Rust clamps to the voice's own cap; pass `capDbfs` to pre-clamp for display. */
    async setLevel(handle, levelDbfs, { capDbfs } = {}) {
      if (Number.isNaN(Number(levelDbfs))) throw new AudioOutError('AUDIO_OUT_INVALID', 'levelDbfs must be a number');
      return call('audio_set_level', { handle, levelDbfs: clampLevelDbfs(levelDbfs, capDbfs) });
    },
    /** Idempotent; never throws in browser mode (nothing can be playing). */
    async stop(handle) {
      if (!bridge() || handle === undefined || handle === null) return;
      await call('audio_stop', { handle });
    },
    async stopAll() {
      if (!bridge()) return 0;
      return (await call('audio_stop_all', {})) ?? 0;
    },
    async status() {
      if (!bridge()) return { absMaxDbfs: ABS_MAX_DBFS, disabled: false, active: null, recent: [], supported: false };
      return { ...(await call('audio_out_status', {})), supported: true };
    },
  };
}

/** Shared default bridge (Tauri invoke resolved per call). */
export const audioOut = createAudioOut();
