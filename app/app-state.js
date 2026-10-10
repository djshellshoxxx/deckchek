// Persistent key/value state (FS-00 §4.5). In the desktop app it calls the Rust
// commands app_state_get/set/delete (table app_state, migration 0003); in browser
// mode it keeps the same API shape in localStorage under `deckchek.appstate.v1`.
// Use it for state Rust must read or that must survive a WebView reset (known
// keys: `wizard`, `backup`, `monitor`); UI preferences stay in `deckchek.ui.v1`.

export const STORAGE_KEY = 'deckchek.appstate.v1';
export const KEY_PATTERN = /^[a-z][a-z0-9_.]{0,63}$/;
export const MAX_VALUE_BYTES = 256 * 1024;

const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;

export function validateKey(key) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new Error(`invalid app_state key '${String(key)}': expected ${KEY_PATTERN.source}`);
  }
  return key;
}

/** Serialize a value as Rust will store it, enforcing the 256 KiB UTF-8 cap. Returns the JSON text. */
export function encodeValue(key, value) {
  let json;
  try { json = JSON.stringify(value); } catch (e) { throw new Error(`app_state '${key}' value is not JSON-serializable: ${e.message}`); }
  if (json === undefined) throw new Error(`app_state '${key}' value is not JSON-serializable`);
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_VALUE_BYTES) throw new Error(`app_state '${key}' value is ${bytes} bytes; the limit is ${MAX_VALUE_BYTES}`);
  return json;
}

function readAll(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function writeAll(storage, all) {
  if (!storage) throw new Error('app_state: no storage available in browser mode');
  storage.setItem(STORAGE_KEY, JSON.stringify(all)); // quota errors propagate to the caller
}

/**
 * Create a store. `invoke` defaults to the Tauri bridge (looked up at call time);
 * pass `invoke: null` to force browser mode. `storage` defaults to localStorage.
 * Methods: get(key) -> {value, updatedAt} | null, set(key, value), delete(key).
 */
export function createAppState({ invoke, storage, now = () => new Date().toISOString() } = {}) {
  const bridge = () => (invoke === undefined ? nativeInvoke() : invoke);
  const store = () => {
    if (storage !== undefined) return storage;
    try { return globalThis.localStorage ?? null; } catch { return null; }
  };
  return {
    get native() { return Boolean(bridge()); },
    async get(key) {
      validateKey(key);
      const call = bridge();
      if (call) return (await call('app_state_get', { key })) ?? null;
      const entry = readAll(store())[key];
      if (!entry || typeof entry !== 'object' || !('value' in entry)) return null;
      return { value: structuredClone(entry.value), updatedAt: String(entry.updatedAt ?? '') };
    },
    async set(key, value) {
      validateKey(key);
      const json = encodeValue(key, value);
      const call = bridge();
      if (call) { await call('app_state_set', { key, value }); return; }
      const s = store();
      const all = readAll(s);
      all[key] = { value: JSON.parse(json), updatedAt: now() };
      writeAll(s, all);
    },
    async delete(key) {
      validateKey(key);
      const call = bridge();
      if (call) { await call('app_state_delete', { key }); return; }
      const s = store();
      const all = readAll(s);
      if (!(key in all)) return;
      delete all[key];
      writeAll(s, all);
    },
  };
}

/** Shared default store (bridge and storage resolved per call). */
export const appState = createAppState();
