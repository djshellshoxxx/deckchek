// Application state: UI settings, the local working set of runs, calibration
// profiles and a tiny pub/sub bus. Everything persists through never-throwing
// storage helpers so the UI keeps working in private windows.

import { createCatalogStore } from '../catalog-store.js';
import { isProfileApplicable, profileInapplicableReasons, deserializeProfile } from '../calibration.js';
import { storageGet, storageSet } from './dom.js';

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
  const map = storageGet(PROFILES_KEY, {}) || {};
  const key = profileKey(deviceName, profile.sampleRate);
  map[key] = JSON.stringify({ ...profile, deviceName });
  storageSet(PROFILES_KEY, map);
  emit('calibration');
  return key;
}
export function deleteProfile(key) {
  const map = storageGet(PROFILES_KEY, {}) || {};
  delete map[key];
  storageSet(PROFILES_KEY, map);
  emit('calibration');
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

// ---------- current-screen hooks for global shortcuts ----------
export const active = { screen: null };
