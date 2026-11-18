// Gear ledger I/O bridge (FS-33). Collects the state build.js needs and writes the export:
//   desktop: catalog + photo store + maintenance log + FS-20 certificates over the Rust commands, ledger history,
//            revisions, public notes and the units used in service jobs (flagged, never dropped) via ledger_*
//            (src-tauri/src/ledger.rs), folder export via ledger_write_folder (staged write, stale ledger files pruned
//            after the new files are in place, refuses to go back in revision);
//   browser: the localStorage catalog and in-memory photo store; history and public notes in localStorage
//            (`deckchek.ledger.v1`, per-viewer convenience only); single-file download, no folder export.
// Invoke, storage and the stores are injectable for tests and smoke mocks.

import { createCatalogStore } from '../catalog-store.js';
import { createPhotoStore, base64ToBytes } from '../photo-store.js';
import { saveTextFile } from '../userfiles.js';
import { LEDGER_EXTS } from './build.js';

export const LOCAL_KEY = 'deckchek.ledger.v1';
const MAX_LOCAL_EXPORTS = 50;
/** maintenance_list returns at most this many rows (src-tauri/src/fleet.rs maintenance_filtered). */
const MAINTENANCE_LIST_CAP = 1000;
const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? null;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// The UI smoke mock (and test doubles) answer commands they do not know with "unknown command <name>". Only that answer
// selects the older code path; every other error (a real database or file error) is passed on.
const isUnknownCommand = e => /^unknown command\b/.test(String(e?.message ?? e));
const tauri = () => globalThis.window?.__TAURI__ ?? null;

function readLocal(storage) {
  try {
    const v = JSON.parse(storage?.getItem(LOCAL_KEY) || '{}');
    return { exports: Array.isArray(v?.exports) ? v.exports.filter(isObj) : [], notes: isObj(v?.notes) ? v.notes : {} };
  } catch { return { exports: [], notes: {} }; }
}
function writeLocal(storage, data) {
  try { storage?.setItem(LOCAL_KEY, JSON.stringify(data)); } catch { /* storage full or blocked: history stays in memory */ }
}

export function createLedgerApi({ invoke = nativeInvoke(), storage = globalThis.localStorage, catalog, photos, now = () => new Date().toISOString() } = {}) {
  const cat = catalog ?? createCatalogStore({ invoke, storage });
  const pho = photos ?? createPhotoStore({ invoke });
  const native = Boolean(invoke);
  const local = { data: readLocal(storage) };

  async function publicNotes() {
    if (native) return Object.fromEntries((await invoke('ledger_public_notes')).map(n => [n.assetId, n.publicNotes]));
    return { ...readLocal(storage).notes };
  }

  /**
   * Asset ids used in FS-21/FS-22 service jobs (ledger_customer_units). Such a unit may be a customer's bench unit or
   * the owner's own gear serviced in-house (every job has a customer, and a job may target an owned unit), so it is
   * only flagged, never dropped. Fails closed: a lookup error is passed on rather than listing units unflagged.
   */
  async function serviceJobUnitIds() {
    if (!native) return new Set();
    try { return new Set(await invoke('ledger_customer_units')); } catch (e) { if (isUnknownCommand(e)) return new Set(); throw e; }
  }

  const maintenanceFor = assetId => invoke('maintenance_list', { assetId, from: null, to: null, eventType: null });

  /**
   * Step 1 list: every asset that is not deleted, with its product, photo/certificate/service counts and
   * `usedInServiceJobs` (the wizard shows those unticked with a note, and the user decides).
   */
  async function listGear() {
    const [assets, products, manufacturers, notes, jobUnits] = await Promise.all([cat.list('asset'), cat.list('product'), cat.list('manufacturer'), publicNotes().catch(() => ({})), serviceJobUnitIds()]);
    const service = native ? await maintenanceFor(null).catch(() => []) : [];
    // The fleet-wide list stops at the newest 1000 events: count per unit when it is full.
    const truncated = service.length >= MAINTENANCE_LIST_CAP;
    const certs = native ? await invoke('certificate_list', { assetId: null }).catch(() => []) : [];
    const rows = [];
    for (const a of assets.filter(x => !x.isDeleted)) {
      const product = products.find(p => p.id === a.productId);
      const maker = product && manufacturers.find(m => m.id === product.manufacturerId);
      const photoList = await pho.list('asset', a.id).catch(() => []);
      rows.push({
        asset: { ...a, publicNotes: notes[a.id] ?? null }, manufacturer: maker?.name || '', model: product?.model || '', category: product?.category || '',
        photos: photoList.length, certificates: certs.filter(c => c.assetId === a.id && c.verdict !== 'draft').length,
        service: truncated ? (await maintenanceFor(a.id).catch(() => [])).length : service.filter(e => e.assetId === a.id).length,
        usedInServiceJobs: jobUnits.has(a.id),
      });
    }
    return { rows, products, manufacturers, service, certs, serviceJobUnits: rows.filter(r => r.usedInServiceJobs).length };
  }

  /** Full state for build.js, for the chosen assets only (photo bytes and certificate files are loaded here). */
  async function loadState(gear, assetIds, { onProgress } = {}) {
    const ids = new Set(assetIds);
    const state = { assets: gear.rows.filter(r => ids.has(r.asset.id)).map(r => r.asset), products: gear.products, manufacturers: gear.manufacturers, service: {}, photos: {}, certificates: {}, problems: [] };
    const pushService = e => (state.service[e.assetId] ??= []).push({ eventType: e.eventType, eventAt: e.eventAt, description: e.description });
    if (!native) for (const e of gear.service) if (ids.has(e.assetId)) pushService(e);
    let done = 0;
    for (const a of state.assets) {
      onProgress?.({ done: done++, total: state.assets.length, title: a.nickname });
      // Per unit: the fleet-wide list in `gear` is cut at the newest 1000 events across every unit.
      if (native) {
        try { for (const e of await maintenanceFor(a.id)) if (e?.assetId === a.id) pushService(e); }
        catch { state.problems.push({ assetId: a.id, what: 'service', reason: 'service history unreadable' }); }
      }
      const list = await pho.list('asset', a.id).catch(() => []);
      state.photos[a.id] = [];
      for (const p of list) {
        try { state.photos[a.id].push({ photoId: p.photoId, sha256: p.sha256, altText: p.altText, caption: p.caption, bytes: base64ToBytes(await pho.read(p.photoId)) }); }
        catch { state.problems.push({ assetId: a.id, what: 'photo', reason: 'photo unreadable' }); }
      }
      for (const c of gear.certs.filter(x => x.assetId === a.id && x.verdict !== 'draft')) {
        try { const rec = await invoke('certificate_get', { id: c.id }); if (rec?.fileJson) (state.certificates[a.id] ??= []).push({ id: c.id, fileJson: rec.fileJson }); }
        catch { state.problems.push({ assetId: a.id, what: 'certificate', reason: 'certificate unreadable' }); }
      }
    }
    onProgress?.({ done, total: state.assets.length });
    return state;
  }

  async function setPublicNote(assetId, text) {
    if (native) return invoke('ledger_public_note_set', { assetId, text: text ?? null });
    const data = readLocal(storage);
    const t = typeof text === 'string' ? text.trim().slice(0, 2000) : '';
    if (t) data.notes[assetId] = t; else delete data.notes[assetId];
    writeLocal(storage, data);
    return { assetId, publicNotes: t || null };
  }

  async function listExports(limit = 20) {
    if (native) return invoke('ledger_export_list', { limit });
    return readLocal(storage).exports.slice().sort((a, b) => b.revision - a.revision).slice(0, limit);
  }

  async function recordExport(record) {
    if (native) return invoke('ledger_export_record', { record });
    const data = readLocal(storage);
    const next = Math.max(0, ...data.exports.map(e => Number(e.revision) || 0)) + 1;
    if (record.revision !== next) throw Object.assign(new Error(`LEDGER_REVISION: the next revision is ${next}, not ${record.revision}`), { code: 'revision' });
    const row = { id: `l-${Date.now().toString(36)}`, revision: next, createdAt: now(), selection: record.selection, privacy: record.privacy, ledgerSha256: record.ledgerSha256 };
    data.exports = [row, ...data.exports].slice(0, MAX_LOCAL_EXPORTS);
    writeLocal(storage, data);
    return row;
  }

  /**
   * The next revision. Desktop: Rust takes the larger of the export history and a counter kept outside the database,
   * so restoring an older backup never hands out a revision that was already published.
   */
  async function nextRevision() {
    if (native) {
      try { return await invoke('ledger_next_revision'); } catch (e) { if (!isUnknownCommand(e)) throw e; }
    }
    return ((await listExports(1))[0]?.revision ?? 0) + 1;
  }

  /**
   * Folder export (desktop): the user picks a folder; files land under ledger/. ledger_write_folder writes everything
   * into a staging folder first, moves the new files in (index.html last), and only then removes ledger photos and
   * certificate files from earlier exports that this export no longer contains (`removed`). It refuses a folder that
   * already holds the same or a later revision.
   */
  async function writeFolder(files, { api = tauri() } = {}) {
    const list = Array.isArray(files) ? files : [];
    if (!list.length) throw new Error('There are no files to write.');
    const open = api?.dialog?.open, call = api?.core?.invoke;
    if (!open || !call) throw new Error('Saving a folder is only available in the DeckChek desktop app.');
    const dir = await open({ directory: true, multiple: false, title: 'Choose where to save the ledger folder' });
    const chosen = Array.isArray(dir) ? dir[0] : dir;
    if (!chosen) return { cancelled: true };
    let r;
    try { r = await call('ledger_write_folder', { dir: chosen, files: list }); } catch (e) {
      if (!isUnknownCommand(e)) throw e;
      r = await call('userfiles_write_folder', { dir: chosen, files: list, allowedExts: [...LEDGER_EXTS] });
    }
    return { cancelled: false, path: r.path, written: r.written, ...(r.removed !== undefined ? { removed: r.removed } : {}) };
  }

  return {
    native, listGear, loadState, publicNotes, setPublicNote, listExports, recordExport, nextRevision, writeFolder,
    /** Single-file export: save dialog on desktop, a download in the browser. */
    saveSingle: (html, { api } = {}) => saveTextFile({ suggestedName: 'deckchek-gear-ledger', content: html, ext: 'html', ...(api ? { api } : {}) }),
  };
}
