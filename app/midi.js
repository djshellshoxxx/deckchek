// MIDI bridge: Tauri backend when present, Web MIDI fallback in browsers.
// Strings select an exact unique name; { id } selects an opaque logical endpoint.
// open/close are input-only, send is output-only, and closeAll releases both directions.
const tauri = () => (typeof window !== 'undefined' && window.__TAURI__) || null;
const hasTauri = () => { const t = tauri(); return !!(t && t.core && typeof t.core.invoke === 'function'); };
const hasWebMidi = () => typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';

const listeners = new Set();
let tauriUnlisten = null, tauriListening = null, access = null, accessPending = null;
const inputs = new Map(), outputs = new Map(); // direction-scoped canonical key -> captured connection
const inputAliases = new Map(), outputAliases = new Map(); // captured legacy name -> canonical key
let knownInputs = [], closeGeneration = 0, closeSerial = 0, closingAll = null;
const closedInputs = new Map(), closedLegacyInputs = new Map(), closingInputs = new Map();

export function isAvailable() { return hasTauri() || hasWebMidi(); }
export function backend() { return hasTauri() ? 'tauri' : hasWebMidi() ? 'webmidi' : 'none'; }
const validId = id => typeof id === 'string' && id.length > 0;
const routeKey = (direction, kind, value) => JSON.stringify([backend(), direction, kind, value]);
function selector(value) {
  if (typeof value === 'string') return { name: value };
  if (!value || typeof value !== 'object' || Array.isArray(value) || !validId(value.id)) throw new Error('MIDI logical ID must be a non-empty string.');
  if (value.backend != null && value.backend !== backend()) throw new Error('MIDI selector belongs to a different backend.');
  return { id: value.id };
}
const argsFor = selection => selection.id != null ? { id: selection.id } : { name: selection.name };
const selectKey = (selection, direction) => routeKey(direction, selection.id != null ? 'id' : 'name', selection.id ?? selection.name);
const available = ports => [...ports].filter(p => p.state !== 'disconnected');

/** UI choices retain names as labels and keep opaque IDs out of pairing decisions. */
export function portChoices(ports = []) {
  const scoped = Array.isArray(ports) ? ports : [];
  const hasIds = scoped.some(p => p?.id != null);
  return scoped.map(p => {
    const readable = typeof p?.name === 'string' && p.nameAvailable !== false, name = typeof p?.name === 'string' ? p.name : '';
    const id = validId(p?.id) ? p.id : null;
    const idMissing = p?.id == null;
    const uniqueName = readable && scoped.filter(other => other?.name === name && other?.nameAvailable !== false).length === 1;
    const uniqueId = id != null && scoped.filter(other => other?.id === id).length === 1;
    const usable = readable && p?.state !== 'disconnected' && (idMissing ? uniqueName : uniqueId);
    const key = id != null ? `id:${encodeURIComponent(id)}` : hasIds ? `name:${encodeURIComponent(name)}` : name;
    const label = `${name || '(unnamed MIDI port)'}${id != null && !uniqueName ? ` — ID ${id}` : ''}${usable ? '' : ' (unavailable or ambiguous)'}`;
    return { key, name, id, selector: id != null ? { id } : name, available: usable, label, description: id != null ? `Logical MIDI endpoint ${id}` : 'Legacy name selection; name must be unique' };
  });
}

// The device runner and Mapper share this input ownership boundary. A late open from
// either screen may finish after the other has claimed the same endpoint.
const inputOwners = new WeakMap();
export function claimInput(transport, port, { owned = true } = {}) {
  let ports = inputOwners.get(transport);
  if (!ports) { ports = new Map(); inputOwners.set(transport, ports); }
  const key = JSON.stringify([transport.backend?.() || 'unknown', 'input', port.id != null ? 'id' : 'name', port.id ?? port.name]);
  let entry = ports.get(key);
  if (!entry) { entry = { owner: null, owned, opened: false, pending: 0, closing: null }; ports.set(key, entry); }
  const claim = { port, key, entry, ports }; entry.owner = claim; return claim;
}
export function pruneInputClaim({ key, entry, ports }) {
  if (!entry.owner && (!entry.opened || !entry.owned) && !entry.pending && !entry.closing && ports.get(key) === entry) ports.delete(key);
}
export function releaseInput(transport, claim) {
  if (!claim) return Promise.resolve();
  const { port, entry } = claim;
  if (entry.owner === claim) entry.owner = null;
  if (entry.owner || !entry.opened || !entry.owned) { pruneInputClaim(claim); return entry.closing || Promise.resolve(); }
  entry.opened = false;
  const closing = (entry.closing || Promise.resolve()).then(() => transport.close(port.selector)).catch(() => {});
  entry.closing = closing;
  closing.finally(() => { if (entry.closing === closing) entry.closing = null; pruneInputClaim(claim); });
  return closing;
}

function choose(ports, selection, direction) {
  const current = available(ports);
  const byId = selection.id != null;
  const matches = current.filter(p => byId ? p.id === selection.id : typeof p.name === 'string' && p.nameAvailable !== false && p.name === selection.name);
  const label = byId ? selection.id : selection.name;
  if (!matches.length) throw new Error(`MIDI ${direction} not found: ${label}`);
  if (matches.length !== 1) throw new Error(`MIDI ${direction} ${byId ? 'ID' : 'name'} is ambiguous: ${label}`);
  const port = matches[0];
  if (typeof port.name !== 'string' || port.nameAvailable === false) throw new Error(`MIDI ${direction} name is unavailable: ${label}`);
  if (port.id != null && (!validId(port.id) || current.filter(p => p.id === port.id).length !== 1)) throw new Error(`MIDI ${direction} ID is unavailable or ambiguous: ${label}`);
  if (byId && !validId(port.id)) throw new Error(`MIDI ${direction} ID is unavailable: ${label}`);
  const id = validId(port.id) ? port.id : null;
  return { port, id, name: port.name, key: routeKey(direction, id != null ? 'id' : 'name', id ?? port.name), uniqueName: current.filter(p => p.name === port.name && p.nameAvailable !== false).length === 1 };
}
function bindAlias(aliases, selection, route) {
  const previous = aliases.get(route.name);
  if (selection.id == null && previous && previous !== route.key) throw new Error(`MIDI input changed: ${route.name}. Close it before opening the replacement.`);
  if (route.uniqueName && !previous) aliases.set(route.name, route.key);
}
const presentWebPort = (ports, port) => port.state !== 'disconnected' && [...ports.values()].includes(port);
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
    for (const msg of Array.isArray(p) ? p : [p]) emit(msg);
  })).then(unlisten => { tauriUnlisten = unlisten; }).finally(() => { tauriListening = null; });
  await tauriListening;
}
function requireCurrent(request, route = null) {
  const keys = [selectKey(request.selection, 'input')];
  if (route) {
    keys.push(route.key);
    // An unresolved name cannot identify one of several independently selected IDs.
    if (route.uniqueName) keys.push(routeKey('input', 'name', route.name));
  }
  const legacyCancelled = request.selection.id == null && (closedLegacyInputs.get(selectKey(request.selection, 'input')) || 0) > request.serial;
  if (legacyCancelled || request.backend !== backend() || request.generation !== closeGeneration || keys.some(key => (closedInputs.get(key) || 0) > request.serial)) throw new Error('MIDI operation was cancelled because its connection was closed or backend changed.');
}
async function finishCloses(pending) {
  const results = await Promise.allSettled(pending);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}
export async function listPorts() {
  if (hasTauri()) {
    const listed = await tauri().core.invoke('midi_list_ports');
    knownInputs = listed?.inputs || [];
    return listed;
  }
  if (!hasWebMidi()) return { inputs: [], outputs: [] };
  const a = await webAccess();
  const map = it => [...it.values()].map((p, index) => ({ index, name: p.name, id: p.id, ...(p.state === 'disconnected' ? { state: p.state } : {}) }));
  knownInputs = [...a.inputs.values()];
  return { inputs: map(a.inputs), outputs: map(a.outputs) };
}

export async function open(value) {
  const selection = selector(value), native = hasTauri();
  const request = { selection, backend: backend(), generation: closeGeneration, serial: closeSerial };
  await closingAll; requireCurrent(request);
  let listed;
  if (native) listed = (await listPorts())?.inputs || [];
  else { const a = await webAccess(); listed = [...a.inputs.values()]; knownInputs = listed; }
  requireCurrent(request);
  const route = choose(listed, selection, 'input');
  await Promise.all([closingInputs.get(route.key), route.uniqueName ? closingInputs.get(routeKey('input', 'name', route.name)) : null]); requireCurrent(request, route);
  if (native) { await ensureTauriListener(); requireCurrent(request, route); }
  bindAlias(inputAliases, selection, route);
  const existing = inputs.get(route.key);
  if (existing && !native) {
    if (existing.port !== route.port) throw new Error(`MIDI input changed: ${route.name}. Close it before opening the replacement.`);
    return;
  }
  if (native) {
    const captured = existing || { ...route, pending: 0, nativeOpened: false }; inputs.set(route.key, captured);
    captured.pending++;
    try {
      // A legacy name is rechecked alongside the ID; it cannot acquire a duplicate-name bypass.
      await tauri().core.invoke('midi_open_input', route.id != null ? { id: route.id, ...(selection.id == null ? { name: selection.name } : {}) } : { name: route.name });
      captured.nativeOpened = true;
      requireCurrent(request, route);
    } finally {
      captured.pending--;
      if (!captured.nativeOpened && !captured.pending && inputs.get(route.key) === captured) {
        inputs.delete(route.key);
        for (const [name, key] of inputAliases) if (key === route.key) inputAliases.delete(name);
      }
    }
    return;
  }
  const onMessage = e => {
    if (inputs.get(route.key) !== route || route.port.onmidimessage !== onMessage) return;
    emit({ port: route.name, ...(route.id != null ? { portId: route.id } : {}), timestampUs: Math.round(e.timeStamp * 1000), bytes: Array.from(e.data) });
  };
  route.port.onmidimessage = onMessage; inputs.set(route.key, route);
}

// close is deliberately input-only, even when an output has the same raw ID.
export async function close(value) {
  const selection = selector(value), native = hasTauri();
  let key = selectKey(selection, 'input'), route = null;
  if (selection.id != null) route = inputs.get(key) || null;
  else {
    const alias = inputAliases.get(selection.name);
    if (alias) { key = alias; route = inputs.get(key) || null; }
    else {
      const captured = [...inputs.values()].filter(p => p.name === selection.name);
      if (captured.length > 1) throw new Error(`MIDI input name is ambiguous: ${selection.name}`);
      route = captured[0] || null;
      if (route) key = route.key;
      else if (knownInputs.some(p => p.name === selection.name && p.nameAvailable !== false)) { route = choose(knownInputs, selection, 'input'); key = route.key; }
    }
  }
  closedInputs.set(key, ++closeSerial);
  // Cancel the original name request even if its pending enumeration returns a replacement ID.
  // This intent mark is distinct from canonical cancellation and never applies to an ID selector.
  if (selection.id == null) closedLegacyInputs.set(selectKey(selection, 'input'), closeSerial);
  const captured = inputs.get(key), prior = [closingAll, closingInputs.get(key)];
  if (captured?.port && !native) captured.port.onmidimessage = null;
  inputs.delete(key);
  for (const [name, alias] of inputAliases) if (alias === key) inputAliases.delete(name);
  const closing = Promise.allSettled(prior).then(() => native
    ? tauri().core.invoke('midi_close_input', route?.id != null ? { id: route.id } : argsFor(selection))
    : captured?.port?.close?.());
  closingInputs.set(key, closing);
  try { return await closing; } finally { if (closingInputs.get(key) === closing) closingInputs.delete(key); }
}

export async function send(value, bytes) {
  const selection = selector(value), selectedBackend = backend(), generation = closeGeneration;
  await closingAll;
  if (generation !== closeGeneration || selectedBackend !== backend()) throw new Error('MIDI operation was cancelled because its connection was closed or backend changed.');
  if (hasTauri()) return tauri().core.invoke('midi_send', { ...argsFor(selection), bytes: Array.from(bytes) });
  const a = await webAccess();
  if (generation !== closeGeneration || selectedBackend !== backend()) throw new Error('MIDI operation was cancelled because its connection was closed or backend changed.');
  const key = selection.id != null ? selectKey(selection, 'output') : outputAliases.get(selection.name);
  let route = key ? outputs.get(key) : null;
  if (route && (route.failed || !presentWebPort(a.outputs, route.port))) throw new Error(`MIDI output disconnected or replaced: ${route.name}. Close MIDI connections before selecting a replacement.`);
  if (!route) {
    route = choose(a.outputs.values(), selection, 'output');
    const captured = outputs.get(route.key);
    if (captured) {
      if (captured.failed || captured.port !== route.port || !presentWebPort(a.outputs, captured.port)) throw new Error(`MIDI output disconnected or replaced: ${route.name}. Close MIDI connections before selecting a replacement.`);
      route = captured;
    }
    bindAlias(outputAliases, selection, route); outputs.set(route.key, route);
  }
  try { route.port.send(Array.from(bytes)); } catch (error) { route.failed = true; throw error; }
}
export async function closeAll() {
  ++closeGeneration;
  const native = hasTauri(), prior = [closingAll, ...closingInputs.values()];
  const ports = new Set([...inputs.values(), ...outputs.values()].map(route => route.port));
  if (!native) for (const route of inputs.values()) route.port.onmidimessage = null;
  inputs.clear(); outputs.clear(); inputAliases.clear(); outputAliases.clear(); knownInputs = [];
  const closing = Promise.allSettled(prior).then(() => native ? tauri().core.invoke('midi_close_all') : finishCloses([...ports].map(p => Promise.resolve().then(() => p?.close?.()))));
  closingAll = closing;
  try { return await closing; } finally { if (closingAll === closing) closingAll = null; }
}
export function onMessage(cb) {
  listeners.add(cb);
  if (hasTauri()) ensureTauriListener().catch(() => {});
  return () => listeners.delete(cb);
}
export async function status() {
  if (hasTauri()) return { backend: 'tauri', ...(await tauri().core.invoke('midi_status')) };
  const currentInputs = [...inputs.values()].filter(p => access && presentWebPort(access.inputs, p.port));
  const currentOutputs = [...outputs.values()].filter(p => !p.failed && access && presentWebPort(access.outputs, p.port));
  return { backend: backend(), openInputs: currentInputs.map(p => p.name), openOutputs: currentOutputs.map(p => p.name), openInputIds: currentInputs.filter(p => p.id != null).map(p => p.id), openOutputIds: currentOutputs.filter(p => p.id != null).map(p => p.id), dropped: 0, emitted: 0 };
}
