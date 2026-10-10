// Per-device input-pair choice (GAP-02, FS-00 §4.7). Pure logic, no DOM: which stereo pair of a multichannel
// interface a capture reads, defaulting to the device's first named pair (1-2) and remembered per device.
// Pair shape comes from listInputDevices(): [{label:'3-4', first:3, second:4, mono:false}].
import { inputPairs, parsePairSelection } from './capture.js';

export const PAIR_STORE_KEY = 'deckchek.inputPairs.v1';
const DEFAULT_KEY = '(default input)';

const keyOf = (name, slot = null) => (String(name || '').trim().toLowerCase() || DEFAULT_KEY) + (slot ? `#${slot}` : '');

/** The device record for a chosen input name ('' = the system default input), or null when it is not listed. */
export function findDevice(devices, deviceName) {
  const list = Array.isArray(devices) ? devices : [];
  if (deviceName) return list.find(d => d.name === deviceName) || null;
  return list.find(d => d.isDefault) || list[0] || null;
}

/** The pairs a device offers; a device with no channel info offers the stereo pair it always captured. */
export function pairsOf(device, { anyPair = false } = {}) {
  if (Array.isArray(device?.pairs) && device.pairs.length) return device.pairs;
  if (!device && anyPair) return inputPairs(8); // a named rig whose interface is not listed (yet): offer the usual pairs
  return inputPairs(Number.isFinite(device?.maxChannels) ? device.maxChannels : 2);
}

export function readMemory(storage) {
  try {
    const v = JSON.parse(storage?.getItem(PAIR_STORE_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

/**
 * Remember `first` (1-based first channel of the pair) for a device. `slot` keeps a separate choice per use on the same
 * device (pre-gig deck A / deck B); `fallback` is the slot's default, which is stored as "no override".
 * Returns false when storage is unavailable.
 */
export function rememberPair(storage, deviceName, first, { slot = null, fallback = 1 } = {}) {
  try {
    const mem = readMemory(storage);
    if (first == null || first === fallback) delete mem[keyOf(deviceName, slot)]; else mem[keyOf(deviceName, slot)] = Number(first);
    storage.setItem(PAIR_STORE_KEY, JSON.stringify(mem));
    return true;
  } catch { return false; }
}

/**
 * The pair to use for a device: the remembered one if the device still offers it, otherwise `fallback`
 * (default: its first pair, 1-2). Returns {first, label, mono, available:[pairs], remembered}.
 */
export function chosenPair(storage, devices, deviceName, { slot = null, fallback = null, anyPair = false } = {}) {
  const device = findDevice(devices, deviceName);
  const available = pairsOf(device, { anyPair });
  const want = readMemory(storage)[keyOf(device?.name ?? deviceName, slot)];
  const hit = available.find(p => p.first === want);
  let pair = hit || available.find(p => p.first === fallback);
  // A use that names its own default (pre-gig deck B = 3-4) keeps it even when the interface does not list it, so the
  // check says "this interface has no inputs 3-4" instead of silently measuring deck B on 1-2.
  if (!pair && slot && fallback) pair = { label: `${fallback}-${fallback + 1}`, first: fallback, second: fallback + 1, mono: false, unlisted: true };
  pair ??= available[0] || { label: '1-2', first: 1, second: 2, mono: false };
  return { first: pair.first, label: pair.label, mono: Boolean(pair.mono), available, remembered: Boolean(hit), offered: !pair.unlisted };
}

/** Capture argument for the chosen pair: null for the default pair 1-2 (keeps the old command shape), else [first]. */
export function pairsArg(storage, devices, deviceName, opts) {
  const c = chosenPair(storage, devices, deviceName, opts);
  return c.first === 1 ? null : parsePairSelection(c.first);
}

/** Human text: "inputs 3-4". */
export const pairWords = pair => `inputs ${pair.label}`;
