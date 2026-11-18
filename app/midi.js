// MIDI bridge: Tauri backend when present, Web MIDI fallback in browsers. Same API either way.
const tauri = () => (typeof window !== 'undefined' && window.__TAURI__) || null;
const hasTauri = () => { const t = tauri(); return !!(t && t.core && typeof t.core.invoke === 'function'); };
const hasWebMidi = () => typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';

const listeners = new Set();
let tauriUnlisten = null;
let tauriListening = null;
let access = null; // Web MIDI access
let accessPending = null;
const webInputs = new Map(); // name -> MIDIInput
const webOutputs = new Map(); // name -> captured MIDIOutput; cleanup must not follow a replacement name
let webDropped = 0;

export function isAvailable() { return hasTauri() || hasWebMidi(); }
export function backend() { return hasTauri() ? 'tauri' : hasWebMidi() ? 'webmidi' : 'none'; }

function emit(msg) { for (const cb of [...listeners]) { try { cb(msg); } catch (e) { console.error(e); } } }

async function webAccess() {
  if (access) return access;
  if (!accessPending) accessPending = Promise.resolve().then(() => navigator.requestMIDIAccess({ sysex: true }))
    .then(value => { access = value; return value; }).finally(() => { accessPending = null; });
  return accessPending;
}

async function ensureTauriListener() {
  if (tauriUnlisten || !hasTauri()) return;
  const ev = tauri().event;
  if (!ev?.listen) return;
  if (!tauriListening) tauriListening = Promise.resolve().then(() => ev.listen('midi-message', e => {
    const p = e.payload;
    for (const msg of Array.isArray(p) ? p : [p]) emit(msg); // unbatch
  })).then(unlisten => { tauriUnlisten = unlisten; }).finally(() => { tauriListening = null; });
  await tauriListening;
}

function selectWebPort(ports, name, direction) {
  const matches = [...ports.values()].filter(p => typeof p.name === 'string' && p.name === name && p.state !== 'disconnected');
  if (!matches.length) throw new Error(`MIDI ${direction} not found: ${name}`);
  if (matches.length !== 1) throw new Error(`MIDI ${direction} name is ambiguous: ${name}`);
  return matches[0];
}
const presentWebPort = (ports, port) => port.state !== 'disconnected' && [...ports.values()].includes(port);

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
  const port = selectWebPort(a.inputs, name, 'input');
  const existing = webInputs.get(name);
  if (existing) {
    if (existing !== port) throw new Error(`MIDI input changed: ${name}. Close it before opening the replacement.`);
    return;
  }
  port.onmidimessage = (e) => emit({ port: name, timestampUs: Math.round(e.timeStamp * 1000), bytes: Array.from(e.data) });
  webInputs.set(name, port);
}

export async function close(name) {
  if (hasTauri()) return tauri().core.invoke('midi_close_input', { name });
  const p = webInputs.get(name);
  if (p) { p.onmidimessage = null; webInputs.delete(name); await p.close?.(); }
}

export async function send(name, bytes) {
  if (hasTauri()) return tauri().core.invoke('midi_send', { name, bytes: Array.from(bytes) });
  const a = await webAccess();
  let out = webOutputs.get(name);
  if (out && !presentWebPort(a.outputs, out)) throw new Error(`MIDI output disconnected or replaced: ${name}. Close MIDI connections before selecting a replacement.`);
  if (!out) { out = selectWebPort(a.outputs, name, 'output'); webOutputs.set(name, out); }
  out.send(Array.from(bytes));
}

export async function closeAll() {
  if (hasTauri()) return tauri().core.invoke('midi_close_all');
  const ports = new Set([...webInputs.values(), ...webOutputs.values()]);
  for (const p of webInputs.values()) p.onmidimessage = null;
  webInputs.clear(); webOutputs.clear();
  await Promise.all([...ports].map(p => p.close?.()));
}

export function onMessage(cb) {
  listeners.add(cb);
  if (hasTauri()) ensureTauriListener().catch(() => {});
  return () => listeners.delete(cb);
}

export async function status() {
  if (hasTauri()) return { backend: 'tauri', ...(await tauri().core.invoke('midi_status')) };
  return { backend: backend(), openInputs: [...webInputs].filter(([, p]) => access && presentWebPort(access.inputs, p)).map(([name]) => name), openOutputs: [...webOutputs].filter(([, p]) => access && presentWebPort(access.outputs, p)).map(([name]) => name), dropped: webDropped, emitted: 0 };
}
