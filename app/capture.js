// Bridge to the native live-capture commands (Tauri). No DOM access here.

function tauri() {
  return (typeof window !== 'undefined' && window.__TAURI__) || null;
}

function requireTauri() {
  const t = tauri();
  if (!t || !t.core || typeof t.core.invoke !== 'function') {
    throw new Error('Native audio capture is only available in the DeckChek desktop app.');
  }
  return t;
}

export function isNativeAvailable() {
  const t = tauri();
  return Boolean(t && t.core && typeof t.core.invoke === 'function');
}

export async function listInputs() {
  if (!isNativeAvailable()) return null;
  return tauri().core.invoke('list_native_audio_inputs');
}

// ---------------------------------------------------------------- input pairs (FS-00 §4.7)
// Mirrors src-tauri/src/audio.rs: inputs are named stereo pairs "1-2", "3-4", ... (1-based);
// an odd channel count ends with a mono pair named after its last channel ("5"), analysed as L = R.

export const MAX_PAIRS = 32;

/** Every pair a device with `channels` inputs offers: [{label, first, second, mono}]. */
export function inputPairs(channels) {
  const n = Math.max(0, Math.floor(Number(channels) || 0));
  const out = [];
  let first = 1;
  for (; first < n; first += 2) out.push({ label: `${first}-${first + 1}`, first, second: first + 1, mono: false });
  if (first === n) out.push({ label: String(first), first, second: first, mono: true });
  return out;
}

function pairFirst(sel) {
  let first;
  if (typeof sel === 'number') first = sel;
  else if (sel && typeof sel === 'object') first = Number(sel.first);
  else if (typeof sel === 'string') {
    const t = sel.trim();
    const bad = () => new Error(`Input pair "${t}" is not a pair name like 1-2 or 3-4.`);
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(t);
    if (!m) throw bad();
    first = Number(m[1]);
    if (m[2] !== undefined && (first === 0 || Number(m[2]) !== first + 1)) throw bad();
  } else throw new Error('Input pairs are given as 3, "3-4" or {first: 3}.');
  if (!Number.isInteger(first) || first < 1 || first % 2 === 0 || first >= 65535) {
    throw new Error(`Input pairs start on an odd channel (1-2, 3-4, ...); channel ${first} does not start a pair.`);
  }
  return first;
}

/**
 * Validate a pair selection (a single pair or a list; numbers, "3-4" labels or pair objects) and
 * return the first channel of each pair, or null for "default pair" (null/undefined/[]). Throws on
 * malformed or duplicate pairs with the same text as the native side.
 */
export function parsePairSelection(sel) {
  if (sel == null) return null;
  const list = Array.isArray(sel) ? sel : [sel];
  if (!list.length) return null;
  if (list.length > MAX_PAIRS) throw new Error(`At most ${MAX_PAIRS} input pairs can be captured at once.`);
  const out = [];
  for (const s of list) {
    const first = pairFirst(s);
    if (out.includes(first)) throw new Error(`Input pair ${first}-${first + 1} is selected twice.`);
    out.push(first);
  }
  return out;
}

/** Resolve a selection against a channel count (preflight for UIs); throws the native out-of-range text. */
export function resolvePairs(sel, channels, deviceName = 'this input') {
  const firsts = parsePairSelection(sel);
  const available = inputPairs(channels);
  if (!firsts) {
    if (!available.length) throw new Error('Input device reported zero channels.');
    return [available[0]];
  }
  return firsts.map(first => {
    const p = available.find(a => a.first === first);
    if (p) return p;
    const names = available.map(a => a.label).join(', ') || 'none';
    throw new Error(`Input pair ${first}-${first + 1} is not available on ${deviceName}: it has ${channels} input channel${channels === 1 ? '' : 's'} (pairs ${names}).`);
  });
}

/** Command arguments for a pair selection: {} for the default pair (keeps the old argument shape). */
export function pairArgs(sel) {
  const firsts = parsePairSelection(sel);
  return firsts ? { pairs: firsts } : {};
}

// ---------------------------------------------------------------- commands

/** Start a live capture. `pairs` (optional) selects input pairs; default is 1-2. */
export async function startLive({ deviceName = null, maxSeconds = 60, pairs = null } = {}) {
  const args = { deviceName, maxSeconds, ...pairArgs(pairs) };
  return requireTauri().core.invoke('start_live_capture', args);
}

/**
 * Bounded native capture (<= 30 s) under the capture lease: resolves the raw payload
 * {deviceName, sampleRate, channels, left, right, streamErrors, pairs, extraPairs?}.
 */
export async function captureNative({ deviceName = null, durationSec, pairs = null, holder = null } = {}) {
  const args = { deviceName, durationSec, ...pairArgs(pairs), ...(holder ? { holder } : {}) };
  return requireTauri().core.invoke('capture_native_audio', args);
}

export async function stopLive() {
  return requireTauri().core.invoke('stop_live_capture');
}

export async function status() {
  if (!isNativeAvailable()) return null;
  return tauri().core.invoke('live_capture_status');
}

// Subscribes to "capture-levels" events; returns a synchronous unsubscribe function.
export function onLevels(callback) {
  const t = requireTauri();
  if (!t.event || typeof t.event.listen !== 'function') {
    throw new Error('Tauri event API is unavailable.');
  }
  let unlisten = null;
  let cancelled = false;
  t.event
    .listen('capture-levels', (event) => callback(event.payload))
    .then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
  return () => {
    cancelled = true;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };
}
