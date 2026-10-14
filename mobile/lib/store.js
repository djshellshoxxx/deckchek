// Results and preferences kept on this phone only (localStorage; every access wrapped, memory fallback).
// Nothing here is ever sent anywhere.
const KEY = 'deckchek.mobile.v1';
export const MAX_RESULTS = 50;

const memory = { value: null };
const empty = () => ({ results: [], settings: { assetNickname: '', assetSerial: '', redactUserAgent: false, splOffsetDb: null, splWeighting: 'A', strobeAck: false } });

function read() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) { const v = JSON.parse(raw); if (v && Array.isArray(v.results)) return { ...empty(), ...v, settings: { ...empty().settings, ...(v.settings || {}) } }; }
  } catch { /* storage blocked or corrupt */ }
  return memory.value ? structuredClone(memory.value) : empty();
}
function write(state) {
  memory.value = structuredClone(state);
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export const newId = () => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const listResults = () => read().results;
export const getResult = id => read().results.find(r => r.id === id) || null;
export function addResult(result) {
  const s = read();
  const run = { id: newId(), createdAt: new Date().toISOString(), ...result };
  s.results = [run, ...s.results].slice(0, MAX_RESULTS);
  write(s);
  return run;
}
export function deleteResult(id) { const s = read(); s.results = s.results.filter(r => r.id !== id); write(s); }
export const getSettings = () => read().settings;
export function setSettings(patch) { const s = read(); s.settings = { ...s.settings, ...patch }; write(s); return s.settings; }
