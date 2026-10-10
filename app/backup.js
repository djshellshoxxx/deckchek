// Backup and restore helpers (FS-08). Pure functions for the Data panel plus a thin
// bridge to the Rust commands in src-tauri/src/backup.rs. Browser mode has no
// backup files (only the existing JSON workspace export/import), so the bridge
// reports `supported: false` there and every call rejects with code `unsupported`.

import { toPersistRun } from './ui/persistence.js';

export const BACKUP_EXT = 'deckchek-backup';
export const FORMAT = 'deckchek-backup';
export const FORMAT_VERSION = 1;
export const DEFAULT_KEEP = 7;
export const MAX_KEEP = 365;
export const SCHEDULE_MODES = Object.freeze(['off', 'daily', 'weekly', 'onExit']);
export const BACKUP_KINDS = Object.freeze(['manual', 'auto', 'pre_restore']);
export const PROGRESS_EVENT = 'backup://progress';
/** Fixed entry names inside a backup (FS-08 §5). */
export const ENTRY = Object.freeze({
  manifest: 'manifest.json',
  db: 'db/deckchek.sqlite3',
  ui: 'settings/ui.json',
  calibration: 'settings/calibration.json',
  midiMaps: 'data/midi-maps.json',
});

const pad = n => String(n).padStart(2, '0');
const isInt = n => Number.isSafeInteger(n);
const isCount = n => isInt(n) && n >= 0;

/** `DeckChek-backup-YYYYMMDD-HHmm.deckchek-backup` in local time. */
export function suggestBackupName(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) throw new Error('suggestBackupName: invalid date');
  return `DeckChek-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${BACKUP_EXT}`;
}

/**
 * Structural check of a manifest as returned by `backup_inspect` (Rust has already
 * verified checksums; this guards the UI against odd shapes). Returns {ok, errors}.
 */
export function validateManifestShape(m) {
  const errors = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, errors: ['manifest is not an object'] };
  if (m.format !== FORMAT) errors.push('format is not deckchek-backup');
  if (!isInt(m.formatVersion) || m.formatVersion < 1) errors.push('formatVersion must be a positive integer');
  else if (m.formatVersion > FORMAT_VERSION) errors.push(`formatVersion ${m.formatVersion} is newer than this app supports`);
  if (typeof m.createdAt !== 'string' || Number.isNaN(Date.parse(m.createdAt))) errors.push('createdAt must be an ISO date');
  if (!BACKUP_KINDS.includes(m.kind)) errors.push('kind must be manual, auto or pre_restore');
  if (typeof m.appVersion !== 'string' || !m.appVersion) errors.push('appVersion is missing');
  if (!isInt(m.schemaVersion) || m.schemaVersion < 1) errors.push('schemaVersion must be a positive integer');
  const c = m.counts;
  if (c !== undefined && (typeof c !== 'object' || c === null || Array.isArray(c))) errors.push('counts must be an object');
  else for (const k of ['runs', 'assets', 'profiles', 'midiMaps']) if (c && c[k] !== undefined && !isCount(c[k])) errors.push(`counts.${k} must be a non-negative integer`);
  if (!Array.isArray(m.files)) errors.push('files must be an array');
  else {
    const names = new Set();
    m.files.forEach((f, i) => {
      if (!f || typeof f.name !== 'string' || !f.name) { errors.push(`files[${i}].name is missing`); return; }
      if (names.has(f.name)) errors.push(`files[${i}] duplicates ${f.name}`);
      names.add(f.name);
      if (!isCount(f.bytes)) errors.push(`files[${i}].bytes must be a non-negative integer`);
      if (typeof f.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(f.sha256)) errors.push(`files[${i}].sha256 must be 64 hex characters`);
    });
    if (!names.has(ENTRY.db)) errors.push('files does not list the database');
  }
  return { ok: errors.length === 0, errors };
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024, u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)} ${units[u]}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Preview text for an inspect result (FS-08 AC-3): {canRestore, title, lines, error}.
 * Plain strings: callers must still insert them with textContent / esc().
 */
export function describeBackup(inspect) {
  if (!inspect || typeof inspect !== 'object') return { canRestore: false, title: 'Not a backup', lines: [], error: 'No backup information.' };
  if (!inspect.valid || !inspect.manifest) {
    const error = (inspect.errors && inspect.errors[0]) || 'This file is not a valid DeckChek backup.';
    return { canRestore: false, title: inspect.tooNew ? 'Backup from a newer DeckChek' : 'Cannot restore this file', lines: [], error };
  }
  const m = inspect.manifest;
  const c = { runs: 0, assets: 0, profiles: 0, midiMaps: 0, ...(m.counts || {}) };
  const lines = [
    `Created ${formatDate(m.createdAt)} by DeckChek ${m.appVersion}`,
    `${plural(c.runs, 'run')}, ${plural(c.assets, 'asset')}, ${plural(c.profiles, 'calibration profile')}, ${plural(c.midiMaps, 'MIDI map')}`,
  ];
  if (inspect.needsMigration) lines.push(`Will be upgraded from schema v${m.schemaVersion} to v${inspect.currentSchemaVersion}.`);
  if (m.kind === 'pre_restore') lines.push('This is the safety backup taken automatically before a restore.');
  return { canRestore: true, title: m.kind === 'manual' ? 'Backup' : 'Automatic backup', lines, error: null };
}

/** Success message after `backup_restore` (FS-08 AC-4/AC-5). */
export function describeRestoreResult(r) {
  const parts = ['Restore complete.'];
  if (Number.isInteger(r?.upgradedFrom)) parts.push(`Upgraded from schema v${r.upgradedFrom} to v${r.schemaVersion}.`);
  if (r?.safetyBackup) parts.push('Your previous data was saved as a safety backup first.');
  for (const w of r?.warnings || []) parts.push(w);
  parts.push('DeckChek will reload now.');
  return parts.join(' ');
}

/** Percent (0–100, integer) from a `backup://progress` payload. */
export function progressPercent(p) {
  const done = Number(p?.pages_done), total = Number(p?.pages_total);
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((done / total) * 100)));
}

/**
 * Maps a parsed browser workspace (`parseWorkspaceJson` output) to the payload of
 * `backup_import_workspace`: runs shaped by `toPersistRun`, runs without an id dropped,
 * duplicate ids kept once (the first wins; Rust also skips ids already in the DB).
 */
export function workspaceToImportPayload(parsed) {
  if (parsed?.version !== 1 || !Array.isArray(parsed.runs) || !Array.isArray(parsed.equipment)) {
    throw new Error('Unsupported or invalid DeckChek workspace file.');
  }
  const seen = new Set();
  const runs = [];
  for (const run of parsed.runs) {
    if (!run || typeof run.id !== 'string' || !run.id.trim() || seen.has(run.id)) continue;
    seen.add(run.id);
    runs.push(toPersistRun(run));
  }
  const equipment = parsed.equipment.filter(e => e && typeof e === 'object' && !Array.isArray(e));
  return { version: 1, runs, equipment };
}

/**
 * Mirrors the Rust retention rule for display: among `auto`/`pre_restore` entries
 * whose name starts with `auto-`, keep the newest `keep` by createdAt; manual
 * backups are never removed. Returns {keep, remove} (lists of entries).
 */
export function planRetention(entries, keep = DEFAULT_KEEP) {
  const n = Math.max(1, Math.min(MAX_KEEP, Math.floor(Number(keep)) || 1));
  const autos = (entries || [])
    .filter(e => e && String(e.name || '').startsWith('auto-') && (e.kind === 'auto' || e.kind === 'pre_restore'))
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.name).localeCompare(String(a.name)));
  const remove = autos.slice(n);
  const removed = new Set(remove);
  return { keep: (entries || []).filter(e => !removed.has(e)), remove };
}

export function validateSchedule({ mode, keep } = {}) {
  if (!SCHEDULE_MODES.includes(mode)) throw new Error(`mode must be one of ${SCHEDULE_MODES.join(', ')}`);
  if (!Number.isInteger(keep) || keep < 1 || keep > MAX_KEEP) throw new Error(`keep must be an integer from 1 to ${MAX_KEEP}`);
  return { mode, keep };
}

const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;

function unsupported() {
  const e = new Error('Backup files need the DeckChek desktop app. In the browser, use the JSON workspace export instead.');
  e.code = 'unsupported';
  return e;
}

/**
 * Bridge to the FS-08 commands. `invoke` defaults to the Tauri bridge (looked up per
 * call); pass `invoke: null` to force browser mode. Argument names match the Rust
 * command parameters exactly (Tauri maps camelCase to snake_case).
 */
export function createBackupApi({ invoke } = {}) {
  const bridge = () => (invoke === undefined ? nativeInvoke() : invoke);
  const call = (cmd, args) => {
    const fn = bridge();
    return fn ? fn(cmd, args) : Promise.reject(unsupported());
  };
  return {
    get supported() { return Boolean(bridge()); },
    create({ destPath = null, kind = 'manual', settings = null } = {}) {
      if (kind !== 'manual' && kind !== 'auto') return Promise.reject(new Error('kind must be manual or auto'));
      return call('backup_create', { destPath, kind, settings });
    },
    inspect(path) { return call('backup_inspect', { path }); },
    restore(path, { confirm = false, settings = null } = {}) { return call('backup_restore', { path, confirm: confirm === true, settings }); },
    list() { return call('backup_list', {}); },
    getSettings() { return call('backup_settings_get', {}); },
    setSettings(s) {
      try { return call('backup_settings_set', { settings: validateSchedule(s) }); } catch (e) { return Promise.reject(e); }
    },
    importWorkspace(payload) { return call('backup_import_workspace', { json: payload }); },
  };
}

export const backupApi = createBackupApi();
