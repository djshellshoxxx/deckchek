// Feature-flag registry (FS-00 §4.14). Flags only hide UI; Rust commands always
// exist. Overrides persist in the `features` object of the `deckchek.ui.v1`
// settings record. A flag whose value equals its default is not stored, so a
// default flipped in a later milestone reaches users who never touched it.
// Pure module: no DOM access, storage is injectable for tests.

const SETTINGS_KEY = 'deckchek.ui.v1';

const flag = (spec, milestone, def, label, description) => Object.freeze({ default: def, milestone, spec, label, description });

export const FEATURES = Object.freeze({
  setupWizard: flag('FS-01', 'M5', true, 'First-run setup wizard', 'Guided first-run setup of input, calibration and device library.'),
  diagnosticsBundle: flag('FS-02', 'M5', false, 'Diagnostics bundle', 'Crash capture and a shareable diagnostics bundle.'),
  pdfExport: flag('FS-03', 'M5', true, 'PDF reports', 'Export reports as PDF.'),
  testMedia: flag('FS-06', 'M5', false, 'Test-media library', 'Catalogue of test records and control media.'),
  backup: flag('FS-08', 'M5', true, 'Backup and restore', 'Back up and restore the local database and files.'),
  pregig: flag('FS-10', 'M6', false, 'Pre-gig check', 'One-pass readiness check before a gig.'),
  latencyTuner: flag('FS-11', 'M6', false, 'DVS latency and buffer tuner', 'Measure round-trip latency and suggest buffer sizes.'),
  stylusWear: flag('FS-12', 'M6', false, 'Stylus wear tracker', 'Track stylus hours and wear.'),
  wearMap: flag('FS-13', 'M6', false, 'Control-vinyl wear map', 'Map wear across a control-vinyl side.'),
  scratchTest: flag('FS-14', 'M6', false, 'Scratch stress test', 'Timecode stress test under scratching.'),
  humHunter: flag('FS-15', 'M6', false, 'Hum hunter', 'Locate mains hum and ground-loop sources.'),
  feedbackStep: flag('FS-15', 'M6', false, 'Booth feedback step', 'Booth feedback detection step in the hum hunter.'),
  certificates: flag('FS-20', 'M7', false, 'Used-gear certificate', 'Test certificates for used gear.'),
  population: flag('FS-21', 'M7', true, 'Unit vs population', 'Compare a unit against population data.'),
  packs: flag('FS-21', 'M7', false, 'Population packs', 'Import and export population packs.'),
  service: flag('FS-22', 'M7', false, 'Service worksheets', 'Service job worksheets.'),
  fleet: flag('FS-23', 'M7', true, 'Venue fleet dashboard', 'Fleet overview across venues.'),
  phoneImport: flag('FS-30', 'M8', false, 'Phone import', 'Import results from the mobile companion.'),
  liveMonitor: flag('FS-31', 'M8', false, 'Live timecode monitor', 'Live timecode doctor beside DJ software.'),
  mapperStudio: flag('FS-32', 'M8', false, 'MIDI mapper studio', 'Create and check MIDI mappings.'),
  gearLedger: flag('FS-33', 'M8', false, 'Gear ledger', 'Static gear ledger export.'),
});

let storageOverride; // undefined -> globalThis.localStorage
let bound = null;    // live settings object shared with ui/state.js
const listeners = new Set();

/** Test hook: inject a Storage-like object (null disables storage). Call with no argument to reset. */
export function configureFeatures({ storage } = {}) { storageOverride = storage; bound = null; }

/** Share the live settings object so its in-memory copy never overwrites flag changes. */
export function bindSettings(settings) { bound = settings && typeof settings === 'object' ? settings : null; }

function getStorage() {
  try { return storageOverride === undefined ? (globalThis.localStorage ?? null) : storageOverride; } catch { return null; }
}
function readRecord() {
  try {
    const raw = getStorage()?.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function overrides() {
  const source = bound ? bound.features : readRecord().features;
  return source && typeof source === 'object' && !Array.isArray(source) ? source : {};
}

export const featureNames = () => Object.keys(FEATURES);

export function isEnabled(name) {
  const meta = FEATURES[name];
  if (!meta) return false;
  const value = overrides()[name];
  return typeof value === 'boolean' ? value : meta.default;
}

export function setEnabled(name, on) {
  const meta = FEATURES[name];
  if (!meta) throw new Error(`Unknown feature flag: ${name}`);
  const next = { ...overrides() };
  if (Boolean(on) === meta.default) delete next[name]; else next[name] = Boolean(on);
  if (bound) bound.features = next;
  try {
    const store = getStorage();
    if (store) store.setItem(SETTINGS_KEY, JSON.stringify({ ...readRecord(), features: next }));
  } catch { /* storage unavailable: the flag still holds for this session when bound */ }
  for (const fn of listeners) { try { fn({ name, enabled: isEnabled(name) }); } catch (error) { console.error('feature listener failed', error); } }
}

export function onFeatureChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
