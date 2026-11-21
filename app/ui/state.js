// Application state: UI settings, the local working set of runs, calibration
// profiles and a tiny pub/sub bus. Background saves use never-throwing storage
// helpers; explicit workspace replacement requires a successful saved snapshot.

import { createCatalogStore } from '../catalog-store.js';
import { isProfileApplicable, profileInapplicableReasons, deserializeProfile } from '../calibration.js';
import { storageGet, storageSet } from './dom.js';
import { restoreReloadRequired } from '../restore-session.js';

const SETTINGS_KEY = 'deckchek.ui.v1';
const WORKSPACE_KEY = 'deckchek.workspace.v1';
const PROFILES_KEY = 'deckchek.calibration.v1';
const MAX_LOCAL_RUNS = 250;

const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}
export function emit(event, payload) {
  for (const fn of listeners.get(event) || []) {
    try { fn(payload); } catch (error) { console.error(`listener for ${event} failed`, error); }
  }
}

// ---------- settings ----------
const defaults = { theme: 'dark', inspector: true, deviceName: '', sampleRate: 48000, screen: 'quick' };
export const settings = { ...defaults, ...(storageGet(SETTINGS_KEY, {}) || {}) };
export function setSetting(key, value) {
  if (restoreReloadRequired()) return false;
  settings[key] = value;
  storageSet(SETTINGS_KEY, settings);
  emit('settings', { key, value });
  if (key === 'deviceName' || key === 'sampleRate') emit('calibration');
}

// ---------- catalog / run persistence bridge ----------
export const store = createCatalogStore({ storage: safeStorage() });
function safeStorage() {
  try { const s = globalThis.localStorage; s?.getItem('x'); return s; } catch { return null; }
}

// ---------- local working set (full runs incl. evidence) ----------
const ws = storageGet(WORKSPACE_KEY, null);
export const workspace = {
  equipment: Array.isArray(ws?.equipment) ? ws.equipment : [],
  runs: Array.isArray(ws?.runs) ? ws.runs : [],
};
export function saveWorkspace() {
  workspace.runs = workspace.runs.slice(0, MAX_LOCAL_RUNS);
  if (!storageSet(WORKSPACE_KEY, { version: 1, equipment: workspace.equipment, runs: workspace.runs })) {
    // Quota: drop heavy evidence from older runs and retry once.
    workspace.runs.slice(20).forEach(r => { delete r.evidence; });
    storageSet(WORKSPACE_KEY, { version: 1, equipment: workspace.equipment, runs: workspace.runs });
  }
  emit('runs');
}

/** Browser import: persist a staged snapshot before replacing the current working set. */
export function replaceWorkspace({ equipment, runs }) {
  const failed = () => new Error('The imported workspace could not be saved to browser storage. The existing workspace was not changed.');
  let target;
  try { target = globalThis.localStorage; } catch { throw failed(); }
  if (typeof target?.setItem !== 'function') throw failed();
  const write = snapshot => {
    try { target.setItem(WORKSPACE_KEY, JSON.stringify(snapshot)); return true; } catch { return false; }
  };
  let snapshot = { version: 1, equipment, runs: runs.slice(0, MAX_LOCAL_RUNS) };
  if (!write(snapshot)) {
    // Preserve autosave's existing one-retry retention policy without changing
    // either the imported snapshot or the active workspace on a failed write.
    snapshot = { ...snapshot, runs: snapshot.runs.map((run, index) => {
      if (index < 20) return run;
      const reduced = { ...run }; delete reduced.evidence; return reduced;
    }) };
    if (!write(snapshot)) throw failed();
  }
  workspace.equipment = snapshot.equipment;
  workspace.runs = snapshot.runs;
  emit('runs');
  return snapshot;
}
export function localRun(id) { return workspace.runs.find(r => r.id === id) || null; }

// ---------- calibration profiles ----------
export function profileKey(deviceName, sampleRate) {
  return `${String(deviceName || 'default').trim().toLowerCase()}|${Number(sampleRate) || 0}`;
}
export function listProfiles() {
  const map = storageGet(PROFILES_KEY, {}) || {};
  return Object.entries(map).flatMap(([key, text]) => {
    try { return [{ key, profile: deserializeProfile(text) }]; } catch { return []; }
  });
}
export function saveProfile(profile, deviceName = profile.deviceName) {
  if (restoreReloadRequired()) throw settingsError('restore_reload_required', 'Reload DeckChek before changing calibration profiles.');
  const map = readCalibrationRegistry();
  const key = profileKey(deviceName, profile.sampleRate);
  let text;
  try {
    if (key.length > 200) throw new Error();
    text = snapshotJson({ ...profile, deviceName }, MAX_PROFILE_JSON).text;
    deserializeProfile(text);
  } catch { throw settingsError('calibration_profile_invalid', 'The calibration profile is invalid or too large to save.'); }
  map[key] = text;
  writeCalibrationRegistry(map);
  emit('calibration');
  return key;
}
export function deleteProfile(key) {
  if (restoreReloadRequired()) throw settingsError('restore_reload_required', 'Reload DeckChek before changing calibration profiles.');
  const map = readCalibrationRegistry();
  if (!Object.hasOwn(map, key)) return false;
  delete map[key];
  writeCalibrationRegistry(map);
  emit('calibration');
  return true;
}
/** Best profile for a device/sample rate: exact key first, else any applicable one. */
export function findProfile(deviceName = settings.deviceName, sampleRate = settings.sampleRate) {
  const all = listProfiles();
  const exact = all.find(p => p.key === profileKey(deviceName, sampleRate));
  if (exact && isProfileApplicable(exact.profile, { deviceName: exact.profile.deviceName, sampleRate })) return exact.profile;
  return all.map(p => p.profile).find(p => isProfileApplicable(p, { deviceName, sampleRate })) || null;
}
/** {state:'calibrated'|'mismatch'|'none', profile, reasons} for the top-bar chip. */
export function calibrationStatus(deviceName = settings.deviceName, sampleRate = settings.sampleRate) {
  const profile = findProfile(deviceName, sampleRate);
  if (profile) return { state: 'calibrated', profile, reasons: [] };
  const sameDevice = listProfiles().find(p => p.key.startsWith(`${String(deviceName || 'default').trim().toLowerCase()}|`));
  if (sameDevice) return { state: 'mismatch', profile: sameDevice.profile, reasons: profileInapplicableReasons(sameDevice.profile, { deviceName, sampleRate }) };
  return { state: 'none', profile: null, reasons: ['no calibration profile'] };
}

/** Strict, read-only snapshot for support observations. Existing calibration
 * consumers retain their lookup behavior. Absence means this exact key only;
 * unreadable/invalid data is never presented as an absent profile. */
export function readSupportCalibration(deviceName, sampleRate, { storage } = {}) {
  const sourceKey = profileKey(deviceName, sampleRate);
  const observation = (state, profile, reasons = []) => ({ state, sourceKey, profile, reasons, applied: false });
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.getItem !== 'function') throw new Error('Calibration storage is unavailable');
    const raw = target.getItem(PROFILES_KEY);
    if (raw === null) return observation('none', null);
    const map = JSON.parse(raw);
    if (!isPlainObject(map)) throw new Error('Calibration registry is not an object');
    if (!Object.hasOwn(map, sourceKey)) return observation('none', null);
    const entry = map[sourceKey];
    if (typeof entry !== 'string') return observation('rejected', null, ['The selected calibration entry is not serialized profile JSON']);
    let profile;
    try { profile = deserializeProfile(JSON.parse(entry, (_, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Calibration contains a non-finite number');
      return value;
    })); }
    catch (error) { return observation('rejected', entry, [String(error.message || error)]); }
    // Validate against the actual native endpoint, not against the profile's
    // own claimed device. No age rule or uncertainty default is introduced.
    const reasons = typeof profile.deviceName !== 'string' || !profile.deviceName.trim()
      ? ['Profile device identity is unavailable'] : profileInapplicableReasons(profile, { deviceName, sampleRate });
    return observation(reasons.length ? 'rejected' : 'available', JSON.parse(entry), reasons);
  } catch (error) {
    return observation('unavailable', null, [String(error.message || error)]);
  }
}

// ---------- backup bridge (FS-08) ----------
// `deckchek.ui.v1` and `deckchek.calibration.v1` live in WebView localStorage, so the Data screen hands
// them to Rust when backing up and writes the restored copies back (validated) before the reload.
const MAX_SETTINGS_JSON = 256 * 1024;
const MAX_PROFILE_JSON = 1024 * 1024;
const MAX_CALIBRATION_JSON = 64 * 1024 * 1024; // existing native optional-entry limit
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isPlainObject = v => v !== null && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const jsonBytes = text => new TextEncoder().encode(text).byteLength;

function settingsError(code, message) { return Object.assign(new Error(message), { code }); }

/** Detach JSON without invoking accessors/toJSON or silently dropping values.
 * The running byte budget bounds traversal as well as the final UTF-8 encoding. */
function snapshotJson(value, limit, { stripUnsafe = false } = {}) {
  let remaining = limit;
  const fail = () => { throw new Error('Settings must contain bounded JSON values.'); };
  const spend = size => { remaining -= size; if (remaining < 0) fail(); };
  function copy(input, depth = 0) {
    if (depth > 8) fail();
    if (input === null || typeof input === 'boolean' || (typeof input === 'number' && Number.isFinite(input))) {
      spend(JSON.stringify(input).length); return input;
    }
    if (typeof input === 'string') {
      if (input.length > remaining) fail();
      spend(jsonBytes(JSON.stringify(input))); return input;
    }
    const array = Array.isArray(input);
    if (!array && !isPlainObject(input)) fail();
    if (array && input.length > remaining) fail();
    const keys = Reflect.ownKeys(input).filter(key => !(array && key === 'length'));
    if (keys.some(key => typeof key !== 'string') || (array && keys.length !== input.length)) fail();
    spend(2); // braces or brackets
    const out = array ? [] : {};
    let count = 0;
    for (const key of keys) {
      if (stripUnsafe && UNSAFE_KEYS.has(key)) continue;
      if (UNSAFE_KEYS.has(key) || (array && key !== String(count))) fail();
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
      if (count++) spend(1);
      if (!array) { if (key.length > remaining) fail(); spend(jsonBytes(JSON.stringify(key)) + 1); }
      out[key] = copy(descriptor.value, depth + 1);
    }
    return out;
  }
  const detached = copy(value), text = JSON.stringify(detached);
  if (jsonBytes(text) > limit) fail();
  return { value: detached, text };
}

function writeLocalJson(key, text) {
  try {
    const target = globalThis.localStorage;
    if (typeof target?.setItem !== 'function') return false;
    target.setItem(key, text); return true;
  } catch { return false; }
}

function readCalibrationRegistry() {
  let raw;
  try {
    const target = globalThis.localStorage;
    if (typeof target?.getItem !== 'function') throw new Error();
    raw = target.getItem(PROFILES_KEY);
  } catch { throw settingsError('calibration_storage_unavailable', 'Calibration profiles could not be read from browser storage.'); }
  if (raw === null) return {}; // observed absence, distinct from a failed read
  try {
    if (typeof raw !== 'string' || raw.length > MAX_CALIBRATION_JSON || jsonBytes(raw) > MAX_CALIBRATION_JSON) throw new Error();
    const value = JSON.parse(raw);
    if (!isPlainObject(value)) throw new Error();
    const { map, skipped } = sanitizeCalibrationMap(value);
    if (skipped) throw new Error();
    return map;
  } catch { throw settingsError('calibration_registry_invalid', 'Stored calibration profiles are invalid or too large. They were not changed.'); }
}

function writeCalibrationRegistry(map) {
  let text;
  try { text = snapshotJson(map, MAX_CALIBRATION_JSON).text; }
  catch { throw settingsError('calibration_registry_invalid', 'Calibration profiles are too large or invalid to save.'); }
  if (!writeLocalJson(PROFILES_KEY, text)) {
    throw settingsError('calibration_storage_write_failed', 'Calibration profiles could not be saved to browser storage. They were not changed.');
  }
}

/** Restored UI settings -> a safe plain object, or null when absent / wrong shape / too large. */
export function sanitizeUiSettings(value) {
  if (!isPlainObject(value)) return null;
  try { return snapshotJson(value, MAX_SETTINGS_JSON, { stripUnsafe: true }).value; } catch { return null; }
}

/** Restored calibration map ({key: profileJson}) -> {map, accepted, skipped}; invalid entries are dropped. */
export function sanitizeCalibrationMap(value) {
  const map = Object.create(null);
  let accepted = 0, skipped = 0;
  if (!isPlainObject(value)) return { map: {}, accepted, skipped };
  for (const [key, text] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key) || key.length > 200 || typeof text !== 'string' || text.length > MAX_PROFILE_JSON || jsonBytes(text) > MAX_PROFILE_JSON) { skipped += 1; continue; }
    try {
      deserializeProfile(JSON.parse(text, (_, v) => {
        if (typeof v === 'number' && !Number.isFinite(v)) throw new Error();
        return v;
      }));
      map[key] = text; accepted += 1;
    } catch { skipped += 1; }
  }
  return { map: { ...map }, accepted, skipped };
}

/** Detached current UI plus a strictly observed calibration registry. This does
 * not claim that UI autosave succeeded or that a native cache is current. */
export function exportSettingsBlob() {
  let ui;
  try { ui = snapshotJson(settings, MAX_SETTINGS_JSON).value; }
  catch { throw settingsError('settings_snapshot_invalid', 'Current app settings are invalid or too large to back up.'); }
  return { ui, calibration: readCalibrationRegistry() };
}

/**
 * Writes restored settings back. Pass the `settings` and `calibrationProfiles` fields of the restore
 * result. Missing/invalid parts are left untouched. Statuses distinguish applied,
 * absent, invalid and unavailable parts; a partly accepted profile map is partial.
 * This is not a transaction across the two storage keys or the already-restored DB.
 */
export function importSettingsBlob({ settings: ui = null, calibrationProfiles = null } = {}) {
  const result = { settings: false, profiles: 0, skipped: 0, settingsStatus: ui == null ? 'absent' : 'invalid', calibrationStatus: calibrationProfiles == null ? 'absent' : 'invalid', complete: false };
  const cleanUi = sanitizeUiSettings(ui);
  let restoredUi = null;
  if (cleanUi) {
    try { restoredUi = snapshotJson({ ...defaults, ...cleanUi }, MAX_SETTINGS_JSON); }
    catch { /* the effective live settings, including defaults, must fit too */ }
  }
  const changedKeys = new Set();
  if (restoredUi) {
    if (writeLocalJson(SETTINGS_KEY, restoredUi.text)) {
      for (const key of Object.keys(settings)) { changedKeys.add(key); delete settings[key]; }
      // Preserve the object shared with features.bindSettings; match a fresh load.
      Object.assign(settings, restoredUi.value);
      for (const key of Object.keys(settings)) changedKeys.add(key);
      result.settings = true; result.settingsStatus = 'applied';
    } else result.settingsStatus = 'unavailable';
  }
  if (isPlainObject(calibrationProfiles)) {
    const { map, accepted, skipped } = sanitizeCalibrationMap(calibrationProfiles);
    result.skipped = skipped;
    // A wholly invalid registry is not an intentional empty-registry restore.
    if (accepted || !skipped) {
      let text;
      try { text = snapshotJson(map, MAX_CALIBRATION_JSON).text; } catch { /* invalid whole-map size */ }
      if (text !== undefined) {
        if (writeLocalJson(PROFILES_KEY, text)) {
          result.profiles = accepted; result.calibrationStatus = skipped ? 'partial' : 'applied';
        } else result.calibrationStatus = 'unavailable';
      }
    }
  }
  result.complete = ['applied', 'absent'].includes(result.settingsStatus) && ['applied', 'absent'].includes(result.calibrationStatus);
  // Notify only after both attempts and the authoritative live replacement.
  for (const key of changedKeys) emit('settings', { key, value: settings[key], source: 'restore' });
  if (result.settings || ['applied', 'partial'].includes(result.calibrationStatus)) emit('calibration', { source: 'restore' });
  return result;
}

// ---------- current-screen hooks for global shortcuts ----------
export const active = { screen: null };
