// Input-pair picker (GAP-02, FS-00 §4.7): "Input pair 1-2 / 3-4 / ..." for the audio input a capture reads, defaulting to the
// device's first named pair and remembered per device (app/input-pairs.js). One shared choice per device, so every screen that
// sets up a capture (Quick Check, DVS, wear map, scratch, hum, latency, calibration) shows the same pair; pre-gig uses a
// separate slot per deck. Desktop app only: the browser preview captures nothing live.

import { h, isNative } from './dom.js';
import { listInputDevices } from './audio-io.js';
import { chosenPair, pairsArg, rememberPair, findDevice, pairsOf } from '../input-pairs.js';
import { settings, emit, on } from './state.js';

let cache = null;
let inflight = null;

function storage() { try { const s = globalThis.localStorage; s?.getItem('x'); return s; } catch { return null; } }

/** Seed the device list (the shell does this after listing inputs, so pickers need no second round trip). */
export function setInputDevices(devices) { cache = Array.isArray(devices) ? devices : null; emit('inputPair'); }

/** The cached device list (may be empty before the first listing). */
export const cachedInputDevices = () => cache || [];

/** Input devices with their pairs; cached, listed once. [] in the browser preview or when listing fails. */
export function inputDevices({ refresh = false } = {}) {
  if (cache && !refresh) return Promise.resolve(cache);
  if (!isNative()) return Promise.resolve([]);
  inflight ??= listInputDevices().then(r => { cache = r.devices; return cache; }).catch(() => cache || []).finally(() => { inflight = null; });
  return inflight;
}

/** The selected pair for the chosen input as a capture argument: null (default pair 1-2) or [firstChannel]. Sync, from the cache. */
export function currentPairs(deviceName = settings.deviceName, opts) {
  return pairsArg(storage(), cache || [], deviceName, opts);
}
/** {first, label, ...} for the chosen input. */
export function currentPair(deviceName = settings.deviceName, opts) {
  return chosenPair(storage(), cache || [], deviceName, opts);
}

/**
 * A labelled select for the input pair. Options:
 *   id, label           element id and visible label
 *   deviceName()        which input the pairs belong to (default: the chosen input in the top bar)
 *   slot, fallback      separate remembered choice per use, and its default first channel (pre-gig decks)
 *   anyDevice           true when the named device may not be listed (pre-gig presets): offer pairs up to 7-8 then
 *   onChange(first)     called after the user picks a pair
 * Returns {el, refresh(), value()}; `el` is null in the browser preview. The select is disabled when the input has one pair.
 */
export function createPairPicker({ id, label = 'Input pair', deviceName = () => settings.deviceName, slot = null, fallback = null, anyDevice = false, onChange = null } = {}) {
  if (!isNative()) return { el: null, refresh() {}, value: () => 1 };
  const select = h('select', { id, 'aria-label': label });
  const hint = h('span', { class: 'hint pair-hint' });
  const el = h('div', { class: 'field pair-picker', 'data-slot': slot || 'default' }, h('label', { class: 'field-label', for: id, text: label }), select, hint);
  let devices = cache || [];
  const opts = { slot, fallback, anyPair: anyDevice };
  // A named device that is not in the list (pre-gig rig unplugged) still lets the user pick a pair for a later run.
  const available = () => pairsOf(findDevice(devices, deviceName()), { anyPair: anyDevice });
  function draw() {
    const pairs = available();
    const sel = chosenPair(storage(), devices, deviceName(), opts);
    const list = pairs.some(p => p.first === sel.first) ? pairs : [...pairs, { label: sel.label, first: sel.first }];
    select.replaceChildren(...list.map(p => h('option', { value: String(p.first), text: p.mono ? `${p.label} (mono)` : p.label, selected: p.first === sel.first })));
    select.disabled = list.length < 2;
    hint.textContent = sel.offered === false ? `This input does not list inputs ${sel.label}.` : list.length < 2 ? 'This input has one stereo pair.' : `Capture reads inputs ${sel.label}${sel.mono ? ' as mono' : ''}.`;
  }
  async function refresh() { devices = await inputDevices(); draw(); }
  select.addEventListener('change', () => {
    const first = Number(select.value);
    rememberPair(storage(), findDevice(devices, deviceName())?.name ?? deviceName(), first, opts);
    draw();
    emit('inputPair', { slot });
    onChange?.(first);
  });
  draw();
  refresh();
  const off = [on('settings', ({ key } = {}) => { if (key === 'deviceName') draw(); }), on('inputPair', () => { if (el.isConnected) draw(); })];
  el.addEventListener('pair-picker-dispose', () => off.forEach(f => f()), { once: true });
  return { el, refresh, value: () => chosenPair(storage(), devices, deviceName(), opts).first };
}
