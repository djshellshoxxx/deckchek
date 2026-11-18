// Microphone capture (FS-30 §4). The browser may ignore the "raw" constraints (AGC especially), so startMic reports
// which flags it did not honour and the export records them. AudioWorklet first, ScriptProcessor as the fallback.

export class MicError extends Error {
  constructor(kind, message) { super(message); this.name = 'MicError'; this.kind = kind; }
}

/** Plain-language text for each failure kind (AC states "error" and "unsupported" in §3). */
export const MIC_MESSAGES = {
  denied: 'Microphone blocked. Enable it in browser settings, then reload.',
  unsupported: 'This browser cannot record audio.',
  notfound: 'No microphone was found on this device.',
  failed: 'The microphone could not be started. Close other apps that use it, then try again.',
};

export function classifyMicError(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new MicError('denied', MIC_MESSAGES.denied);
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new MicError('notfound', MIC_MESSAGES.notfound);
  return new MicError('failed', MIC_MESSAGES.failed);
}

export const micSupported = () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia) && Boolean(globalThis.AudioContext || globalThis.webkitAudioContext);

const RAW = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
let current = null;

/** Which of the three processing flags the browser left on (`ignored`) or would not say (`unknown`). */
export function flagReport(settings = {}) {
  const ignored = [], unknown = [];
  for (const k of Object.keys(RAW)) { if (settings[k] === true) ignored.push(k); else if (settings[k] === undefined) unknown.push(k); }
  return { requested: { ...RAW }, applied: Object.fromEntries(Object.keys(RAW).map(k => [k, typeof settings[k] === 'boolean' ? settings[k] : null])), ignored, unknown };
}

const abortError = () => Object.assign(new Error('Capture stopped'), { name: 'AbortError' });

// Permission and worklet setup cannot themselves be cancelled. Reject promptly, and dispose any resource that
// arrives after cancellation rather than letting an older request take ownership of a newer session.
function abortable(promise, signal, disposeLate) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', onAbort); fn(value);
    };
    const onAbort = () => finish(reject, abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(value => {
      if (settled) { disposeLate?.(value); return; }
      finish(resolve, value);
    }, error => finish(reject, error));
    if (signal.aborted) onAbort();
  });
}

const stopTracks = stream => { try { stream?.getTracks().forEach(t => t.stop()); } catch { /* already stopped */ } };

/** Open the mic with processing off. `signal` also stops pending/active acquisition. Must be called from a user gesture. */
export async function startMic({ sampleRate, signal } = {}) {
  if (!micSupported()) throw new MicError('unsupported', MIC_MESSAGES.unsupported);
  if (current) current.stop();
  const abort = new AbortController();
  let stream, ctx, stopped = false;
  const onAbort = () => mic.stop();
  const mic = {
    signal: abort.signal,
    stop() {
      if (stopped) return;
      stopped = true; abort.abort(); signal?.removeEventListener('abort', onAbort);
      stopTracks(stream);
      try { ctx?.close()?.catch(() => {}); } catch { /* already closed */ }
      if (current === mic) current = null;
    },
  };
  current = mic;
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal?.aborted) { mic.stop(); throw abortError(); }
    stream = await abortable(navigator.mediaDevices.getUserMedia({ audio: { ...RAW, channelCount: 1, ...(sampleRate ? { sampleRate } : {}) } }), abort.signal, stopTracks);
    if (abort.signal.aborted) { stopTracks(stream); throw abortError(); }
    const track = stream.getAudioTracks()[0];
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    try { ctx = new Ctx(sampleRate ? { sampleRate } : undefined); } catch { ctx = new Ctx(); }
    try { await abortable(ctx.resume(), abort.signal); } catch (error) { if (abort.signal.aborted) throw error; /* resume may require a gesture */ }
    if (abort.signal.aborted) throw abortError();
    Object.assign(mic, { stream, ctx, source: ctx.createMediaStreamSource(stream), sampleRate: ctx.sampleRate, flags: flagReport(track?.getSettings?.() || {}) });
    return mic;
  } catch (error) {
    mic.stop();
    throw error?.name === 'AbortError' ? error : classifyMicError(error);
  }
}

async function viaWorklet(mic, onBlock, signal) {
  await mic.ctx.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url).href);
  if (signal?.aborted) throw abortError();
  const node = new AudioWorkletNode(mic.ctx, 'deckchek-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
  node.port.onmessage = e => onBlock(e.data);
  const mute = mic.ctx.createGain();
  mute.gain.value = 0;
  mic.source.connect(node);
  node.connect(mute).connect(mic.ctx.destination); // pulled by the graph, silent
  return () => { node.port.onmessage = null; try { mic.source.disconnect(node); node.disconnect(); mute.disconnect(); } catch { /* gone */ } };
}

function viaScriptProcessor(mic, onBlock) {
  const node = mic.ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = e => onBlock(Float32Array.from(e.inputBuffer.getChannelData(0)));
  const mute = mic.ctx.createGain();
  mute.gain.value = 0;
  mic.source.connect(node);
  node.connect(mute).connect(mic.ctx.destination);
  return () => { node.onaudioprocess = null; try { mic.source.disconnect(node); node.disconnect(); mute.disconnect(); } catch { /* gone */ } };
}

/**
 * Record `sec` seconds from the open mic. `onChunk(Float32Array, totalSamples)` fires for every block (live level
 * and readout); `signal` (AbortSignal) ends early and rejects with AbortError. Resolves the samples as Float32Array.
 */
export async function captureSeconds(sec, { onChunk, signal, mic = current } = {}) {
  if (!mic) throw new MicError('failed', MIC_MESSAGES.failed);
  const stopped = new AbortController();
  const signals = [signal, mic.signal].filter(Boolean);
  const onAbort = () => stopped.abort();
  for (const source of signals) { source.addEventListener('abort', onAbort, { once: true }); if (source.aborted) onAbort(); }
  signal = stopped.signal;
  try {
    if (signal.aborted) throw abortError();
    const want = Math.ceil(sec * mic.sampleRate);
    const blocks = [];
    let total = 0, finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const onBlock = block => {
      if (signal.aborted || total >= want) return;
      blocks.push(block);
      total += block.length;
      try { onChunk?.(block, total); } catch { /* a display error must not stop the take */ }
      if (total >= want) finish();
    };
    let release;
    try { release = await abortable(viaWorklet(mic, onBlock, signal), signal, lateRelease => lateRelease()); }
    catch { if (signal.aborted) throw abortError(); release = viaScriptProcessor(mic, onBlock); }
    try { await abortable(finished, signal); } finally { release(); }
    const out = new Float32Array(want);
    let at = 0;
    for (const b of blocks) { const n = Math.min(b.length, want - at); out.set(b.subarray(0, n), at); at += n; if (at >= want) break; }
    return out;
  } finally { for (const source of signals) source.removeEventListener('abort', onAbort); }
}

export const stopMic = () => current?.stop();
