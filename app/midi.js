// MIDI bridge: Tauri backend when present, Web MIDI fallback in browsers. Same API either way.
const tauri = () => (typeof window !== 'undefined' && window.__TAURI__) || null;
const hasTauri = () => { const t = tauri(); return !!(t && t.core && typeof t.core.invoke === 'function'); };
const hasWebMidi = () => typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';

const listeners = new Set();
let tauriUnlisten = null;
let access = null; // Web MIDI access
const webInputs = new Map(); // name -> MIDIInput
let webDropped = 0;

export function isAvailable() { return hasTauri() || hasWebMidi(); }
export function backend() { return hasTauri() ? 'tauri' : hasWebMidi() ? 'webmidi' : 'none'; }

function emit(msg) { for (const cb of [...listeners]) { try { cb(msg); } catch (e) { console.error(e); } } }

async function webAccess() {
  if (!access) access = await navigator.requestMIDIAccess({ sysex: true });
  return access;
}

async function ensureTauriListener() {
  if (tauriUnlisten || !hasTauri()) return;
  const ev = tauri().event;
  if (!ev?.listen) return;
  tauriUnlisten = await ev.listen('midi-message', (e) => {
    const p = e.payload;
    for (const msg of Array.isArray(p) ? p : [p]) emit(msg); // unbatch
  });
}

export async function listPorts() {
  if (hasTauri()) return tauri().core.invoke('midi_list_ports');
  if (!hasWebMidi()) return { inputs: [], outputs: [] };
  const a = await webAccess();
  const map = (it) => [...it.values()].map((p, index) => ({ index, name: p.name }));
  return { inputs: map(a.inputs), outputs: map(a.outputs) };
}

export async function open(name) {
  if (hasTauri()) { await ensureTauriListener(); return tauri().core.invoke('midi_open_input', { name }); }
  const a = await webAccess();
  const port = [...a.inputs.values()].find((p) => p.name === name);
  if (!port) throw new Error(`MIDI input not found: ${name}`);
  if (webInputs.has(name)) return;
  port.onmidimessage = (e) => emit({ port: name, timestampUs: Math.round(e.timeStamp * 1000), bytes: Array.from(e.data) });
  webInputs.set(name, port);
}

export async function close(name) {
  if (hasTauri()) return tauri().core.invoke('midi_close_input', { name });
  const p = webInputs.get(name);
  if (p) { p.onmidimessage = null; webInputs.delete(name); }
}

export async function send(name, bytes) {
  if (hasTauri()) return tauri().core.invoke('midi_send', { name, bytes: Array.from(bytes) });
  const a = await webAccess();
  const out = [...a.outputs.values()].find((p) => p.name === name);
  if (!out) throw new Error(`MIDI output not found: ${name}`);
  out.send(Array.from(bytes));
}

export async function closeAll() {
  if (hasTauri()) return tauri().core.invoke('midi_close_all');
  for (const n of [...webInputs.keys()]) await close(n);
}

export function onMessage(cb) {
  listeners.add(cb);
  if (hasTauri()) ensureTauriListener().catch(() => {});
  return () => listeners.delete(cb);
}

export async function status() {
  if (hasTauri()) return { backend: 'tauri', ...(await tauri().core.invoke('midi_status')) };
  return { backend: backend(), openInputs: [...webInputs.keys()], openOutputs: [], dropped: webDropped, emitted: 0 };
}
