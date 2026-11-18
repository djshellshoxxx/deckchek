// Native v1 files remain raw text across IPC. Parsing their SQLite integers in
// JavaScript would lose exact values above 2^53; Rust owns the archive contract.
export const MAX_NATIVE_CATALOG_BYTES = 32 * 1024 * 1024;
export const MAX_NATIVE_CATALOG_ROWS = 10_000;
export const NATIVE_CATALOG_TABLES = Object.freeze([
  'manufacturer', 'venue', 'product', 'booth', 'deck_position',
  'support_configuration', 'asset', 'asset_settings_snapshot', 'setup', 'setup_component',
]);
const encoder = new TextEncoder();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value, max = MAX_NATIVE_CATALOG_ROWS) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const fail = message => { throw new Error(message); };
const message = error => String(error?.message ?? error ?? 'Native catalog operation failed.').slice(0, 500);
const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;

function validUnicode(text) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
export function nativeCatalogText(text) {
  if (typeof text !== 'string' || !validUnicode(text)) fail('The native catalog must be valid Unicode JSON text.');
  if (text.length > MAX_NATIVE_CATALOG_BYTES || encoder.encode(text).length > MAX_NATIVE_CATALOG_BYTES) fail('Choose a native catalog file no larger than 32 MiB.');
  return text;
}
function counts(value) {
  if (!object(value) || !object(value.tables) || !count(value.total) || Object.keys(value.tables).length !== NATIVE_CATALOG_TABLES.length) fail('Invalid native catalog counts.');
  let total = 0; const tables = {};
  for (const table of NATIVE_CATALOG_TABLES) {
    if (!count(value.tables[table])) fail('Invalid native catalog table count.');
    tables[table] = value.tables[table]; total += value.tables[table];
  }
  if (total !== value.total) fail('Inconsistent native catalog counts.');
  return { tables, total };
}
function diagnostics(values) {
  if (!Array.isArray(values) || values.length > 100) fail('Invalid native catalog diagnostics.');
  return values.map(value => {
    if (!object(value) || !NATIVE_CATALOG_TABLES.includes(value.table) ||
      typeof value.id !== 'string' || value.id.length > 500 || typeof value.reason !== 'string' || value.reason.length > 500) fail('Invalid native catalog diagnostic.');
    return { table: value.table, id: value.id, reason: value.reason };
  });
}
export function nativeCatalogPreview(value) {
  if (!object(value) || typeof value.canImport !== 'boolean' ||
    !['toImport', 'alreadyPresent', 'reusedDependencies'].every(key => count(value[key])) ||
    !count(value.conflictCount, 100_000) || !count(value.warningCount, 100_000)) fail('Invalid native catalog preview.');
  const summary = counts(value.counts), conflicts = diagnostics(value.conflicts), warnings = diagnostics(value.warnings);
  const classified = value.toImport + value.alreadyPresent + value.reusedDependencies;
  if (classified > summary.total || value.canImport !== (value.conflictCount === 0) ||
    (value.canImport && classified !== summary.total) || conflicts.length !== Math.min(value.conflictCount, 100) || warnings.length !== Math.min(value.warningCount, 100)) fail('Inconsistent native catalog preview.');
  if (!Array.isArray(value.dependencyReuses) || value.dependencyReuses.length !== Math.min(value.reusedDependencies, 100)) fail('Invalid dependency timestamp summary.');
  const dependencyReuses = value.dependencyReuses.map(item => {
    const keys = ['id', 'sourceCreatedAt', 'sourceUpdatedAt', 'destinationCreatedAt', 'destinationUpdatedAt'];
    if (!object(item) || !['manufacturer', 'product'].includes(item.table) || keys.some(key => typeof item[key] !== 'string' || item[key].length > 500)) fail('Invalid dependency timestamp detail.');
    return Object.fromEntries(['table', ...keys].map(key => [key, item[key]]));
  });
  return { counts: summary, toImport: value.toImport, alreadyPresent: value.alreadyPresent,
    reusedDependencies: value.reusedDependencies, canImport: value.canImport, conflictCount: value.conflictCount,
    conflicts, dependencyReuses, warningCount: value.warningCount, warnings };
}
function imported(value) {
  if (!object(value) || !['inserted', 'alreadyPresent', 'reusedDependencies'].every(key => count(value[key]))) fail('Invalid native catalog import result.');
  const summary = counts(value.counts);
  if (value.inserted + value.alreadyPresent + value.reusedDependencies !== summary.total) fail('Inconsistent native catalog import result.');
  return { inserted: value.inserted, alreadyPresent: value.alreadyPresent, reusedDependencies: value.reusedDependencies, counts: summary };
}
function setupIds(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_NATIVE_CATALOG_ROWS || ids.some(id => typeof id !== 'string' || !id || !validUnicode(id)) || new Set(ids).size !== ids.length) fail('Select one or more distinct saved setups.');
  if (ids.reduce((bytes, id) => bytes + encoder.encode(id).length, 0) > MAX_NATIVE_CATALOG_BYTES) fail('Selected setup IDs exceed 32 MiB.');
  return [...ids];
}
export function createNativeCatalogArchive({ invoke } = {}) {
  const bridge = () => invoke === undefined ? nativeInvoke() : invoke;
  async function call(command, args) {
    const fn = bridge();
    if (typeof fn !== 'function') { const error = new Error('Native setup catalog files require the DeckChek desktop app.'); error.code = 'NATIVE_CATALOG_UNSUPPORTED'; throw error; }
    try { return await fn(command, args); }
    catch (caught) {
      const error = new Error(message(caught));
      if (typeof caught?.code === 'string') error.code = caught.code;
      if (caught?.code === 'NATIVE_CATALOG_CONFLICT' && caught.preview) error.preview = nativeCatalogPreview(caught.preview);
      throw error;
    }
  }
  return {
    get supported() { return typeof bridge() === 'function'; },
    async listSetups() {
      const value = await call('catalog_archive_setups', {});
      if (!Array.isArray(value) || value.length > MAX_NATIVE_CATALOG_ROWS) fail('Invalid native setup list.');
      let bytes = 0; const seen = new Set();
      return value.map(row => {
        if (!object(row) || typeof row.id !== 'string' || !row.id || !validUnicode(row.id) || typeof row.name !== 'string' || !validUnicode(row.name) || seen.has(row.id)) fail('Invalid or duplicate native setup identity.');
        bytes += encoder.encode(row.id).length + encoder.encode(row.name).length;
        if (bytes > MAX_NATIVE_CATALOG_BYTES) fail('Native setup list exceeds 32 MiB.');
        seen.add(row.id); return { id: row.id, name: row.name };
      });
    },
    async exportArchive(ids) {
      const value = await call('catalog_archive_export', { setupIds: setupIds(ids) });
      if (!object(value)) fail('Invalid native catalog export response.');
      return { text: nativeCatalogText(value.text), counts: counts(value.counts) };
    },
    async preview(text) { return nativeCatalogPreview(await call('catalog_archive_preview', { text: nativeCatalogText(text) })); },
    async importArchive(text) { return imported(await call('catalog_archive_import', { text: nativeCatalogText(text) })); },
  };
}
