// FS-21 bridge. The Rust pack.rs commands own persistence, file reading and the final whitelist check; this module
// only picks files with the native dialogs, keeps the contributor token and builds the preview text. Browser mode has
// no database, so every call that needs one rejects with a clear message and `native` is false.
import { createAppState } from './app-state.js';
import { buildPack, createMetricRegistry } from './pack.js';

export const PACK_EXT = 'deckchek-pack';
export const CONTRIBUTOR_KEY = 'population.contributor';
const tauri = () => globalThis.window?.__TAURI__ ?? globalThis.__TAURI__ ?? null;

const randomToken = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).toLowerCase();

/** The row shape Rust accepts for export: whitelisted fields only (the local `units` count stays here). */
export const exportRow = row => ({ product: row.product, metric: row.metric, method: { key: row.method.key, version: row.method.version }, value: row.value, unit: row.unit });

export function createPackApi({ api = tauri(), appState = createAppState(), fetchJson } = {}) {
  const invoke = api?.core?.invoke;
  const need = () => {
    if (!invoke) throw new Error('Population packs need the desktop app.');
    return invoke;
  };
  const call = async (cmd, args) => need()(cmd, args); // always a promise: browser mode rejects, never throws synchronously
  let tablePromise = null;
  const loadTable = async () => {
    const get = fetchJson ?? (async url => { const r = await fetch(url); if (!r.ok) throw new Error(`Could not load ${url}`); return r.json(); });
    return get('./population-metrics.json');
  };
  const api2 = {
    native: Boolean(invoke),
    /** The metric whitelist (same file the importer uses). Cached; a failed load is retried. */
    metricTable() {
      tablePromise ??= loadTable().catch(error => { tablePromise = null; throw error; });
      return tablePromise;
    },
    /** Random per-install token. Not an identity: "Reset my contributor token" replaces it (spec section 7). */
    async contributor({ reset = false } = {}) {
      if (!reset) {
        const stored = (await appState.get(CONTRIBUTOR_KEY).catch(() => null))?.value;
        if (typeof stored === 'string' && /^[a-z0-9._:-]{8,64}$/.test(stored)) return stored;
      }
      const token = randomToken();
      await appState.set(CONTRIBUTOR_KEY, token);
      return token;
    },
    unitValues: () => call('population_unit_values'),
    list: () => call('pack_list'),
    remove: packId => call('pack_remove', { packId }),
    preview: path => call('pack_preview', { path }),
    import: (path, sourceLabel = null) => call('pack_import', { path, sourceLabel }),
    query: (productId, metricId, methodKey) => call('population_query', { productId, metricId, methodKey }),
    /** Native open dialog -> path | null. */
    async pickPack() {
      const open = api?.dialog?.open;
      if (!open) throw new Error('The open dialog is not available.');
      const picked = await open({ multiple: false, filters: [{ name: 'DeckChek pack', extensions: [PACK_EXT, 'json'] }] });
      return (Array.isArray(picked) ? picked[0] : picked) || null;
    },
    /**
     * The pack exactly as it will be written, for the preview step. Same validation as the importer; throws with the
     * reasons when a row cannot be shared. `appVersion` comes from the app (Rust writes its own crate version).
     */
    async buildPreview(rows, { appVersion = '0.0.0', contributor, packId, createdMonth } = {}) {
      const metricRegistry = createMetricRegistry(await api2.metricTable());
      return buildPack({ rows: rows.map(exportRow), appVersion, contributor: contributor ?? await api2.contributor(), packId, createdMonth }, { metricRegistry });
    },
    /** Save dialog, then Rust re-validates the selection against the whitelist and writes the file. */
    async savePack(rows, { packId, createdMonth, contributor } = {}) {
      const save = api?.dialog?.save;
      if (!save) throw new Error('The save dialog is not available.');
      const path = await save({ defaultPath: `DeckChek-population.${PACK_EXT}`, filters: [{ name: 'DeckChek pack', extensions: [PACK_EXT] }] });
      if (!path) return { cancelled: true };
      const selection = { packId, createdMonth, contributor: contributor ?? await api2.contributor(), rows: rows.map(exportRow) };
      for (const key of Object.keys(selection)) if (selection[key] === undefined) delete selection[key];
      return { cancelled: false, ...(await call('pack_export', { selection, path })) };
    },
  };
  return api2;
}
