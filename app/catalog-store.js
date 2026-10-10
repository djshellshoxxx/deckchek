// Async bridge to the Rust catalog/run commands, with a localStorage fallback
// exposing the same API for browser-only use.
import { isEnabled } from './features.js';

export const ENTITIES = ['manufacturer', 'product', 'asset', 'setup', 'venue'];
const STORE_KEY = 'deckchek.catalog.v1';
const SEARCH_FIELDS = {
  manufacturer: ['name'], product: ['model', 'variant', 'description'],
  asset: ['nickname', 'serialNumber'], setup: ['name'], venue: ['name', 'city'],
};

export function assertEntity(entity) {
  if (!ENTITIES.includes(entity)) throw new Error(`unknown catalog entity: ${entity}`);
  return entity;
}

export function newId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const h = n => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${h(3)}-${h(12)}`;
}

export function emptyState() {
  return { catalog: Object.fromEntries(ENTITIES.map(e => [e, []])), runs: [], alignments: [], deviceProfiles: {}, productSpecs: [], deviceResults: [], midiMaps: {} };
}

export function loadState(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORE_KEY) || 'null');
    if (parsed && parsed.catalog) {
      const base = emptyState();
      return { ...base, ...parsed, catalog: { ...base.catalog, ...parsed.catalog } };
    }
  } catch { /* fall through */ }
  return emptyState();
}

export function saveState(storage, state) {
  try { storage?.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* quota/private mode */ }
}

export function filterRecords(entity, records, filter) {
  const f = filter && typeof filter === 'object' ? filter : {};
  const fields = SEARCH_FIELDS[entity];
  return records.filter(r => Object.entries(f).every(([k, v]) => {
    if (v == null || v === '') return true;
    if (k === 'search') {
      const q = String(v).toLowerCase();
      return fields.some(field => String(r[field] ?? '').toLowerCase().includes(q));
    }
    return r[k] === v;
  }));
}

export function upsertRecord(state, entity, record, now = new Date().toISOString()) {
  assertEntity(entity);
  if (!record || typeof record !== 'object') throw new Error('record must be an object');
  const list = state.catalog[entity];
  const id = record.id || newId();
  const idx = list.findIndex(r => r.id === id);
  const prev = idx >= 0 ? list[idx] : null;
  const saved = { ...record, id, createdAt: prev?.createdAt || now };
  if (entity !== 'setup') saved.updatedAt = now;
  if (entity === 'setup') saved.components = (record.components || prev?.components || []).map(c => ({ ...c, id: c.id || newId() }));
  if (idx >= 0) list[idx] = saved; else list.push(saved);
  return saved;
}

export function deleteRecord(state, entity, id) {
  assertEntity(entity);
  const list = state.catalog[entity];
  const idx = list.findIndex(r => r.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  return true;
}

export function summarizeRun(run) {
  return {
    id: run.id, sessionType: run.sessionType || run.workflow || 'diagnostic', test: run.test ?? null,
    startedAt: run.createdAt, status: 'completed', score: run.score ?? null,
    measurementCount: (run.measurements || []).length, hypothesisCount: (run.findings || []).length,
  };
}

export function buildAlignmentRecord(input, id = newId()) {
  const c = input?.confidence;
  if (typeof c !== 'number' || c < 0 || c > 1) throw new Error('confidence must be between 0 and 1');
  return { id: input.id || id, scanAId: input.scanA?.id || newId(), scanBId: input.scanB?.id || newId(), ...input };
}

// ---------- device library (fallback parity with src-tauri/src/devices.rs) ----------
export const RESULT_STATUSES = ['pass', 'fail', 'unknown', 'skipped'];
const PRODUCT_CATEGORY = { turntable: 'turntable', controller: 'controller', mixer: 'mixer', 'audio-interface': 'audio_interface', 'timecode-media': 'dvs_media', software: 'software' };
export const productCategory = c => PRODUCT_CATEGORY[c] || 'other';
export const specProvenance = confidence => (confidence === 'confirmed' ? 'manufacturer-doc' : 'research-unverified');
const trimmed = v => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Upsert manufacturer/product/specs/profile rows; first sight of a profile also creates a "My <model>" asset (unless createAssets is false: the setup wizard decides, FS-01 AC-6). */
export function syncProfilesLocal(state, profiles, now = new Date().toISOString(), { createAssets = true } = {}) {
  const out = [];
  for (const p of profiles || []) {
    const id = trimmed(p?.id), manufacturer = trimmed(p?.manufacturer), model = trimmed(p?.model);
    if (!id) throw new Error('profile.id is required');
    if (!manufacturer || !model) throw new Error(`${id}: manufacturer and model are required`);
    const lower = s => s.toLowerCase();
    let m = state.catalog.manufacturer.find(x => lower(x.name || '') === lower(manufacturer));
    if (!m) m = upsertRecord(state, 'manufacturer', { name: manufacturer, website: null, notes: 'Added from the DeckChek device library' }, now);
    const existing = state.deviceProfiles[id];
    let product = existing && state.catalog.product.find(x => x.id === existing.productId);
    product ||= state.catalog.product.find(x => x.manufacturerId === m.id && lower(x.model || '') === lower(model));
    const url = (p.documents || []).map(d => trimmed(d?.url)).find(u => u && u.startsWith('http')) || null;
    product = upsertRecord(state, 'product', { ...(product || {}), manufacturerId: m.id, category: productCategory(p.category), model, description: trimmed(p.summary), sourceUrl: url || product?.sourceUrl || null }, now);
    state.productSpecs = state.productSpecs.filter(s => !(s.productId === product.id && String(s.id).startsWith(`${id}:spec:`)));
    (p.specs || []).forEach((sp, i) => {
      if (!trimmed(sp?.key)) return;
      const src = trimmed(sp.source);
      state.productSpecs.push({ id: `${id}:spec:${i}:${sp.key}`, productId: product.id, key: sp.key, value: sp.value ?? null, unit: sp.unit ?? null, provenanceType: specProvenance(sp.confidence), sourceTitle: src && !src.startsWith('http') ? src : null, sourceUrl: src && src.startsWith('http') ? src : null, retrievedAt: now });
    });
    const json = JSON.stringify(p);
    const created = !existing, changed = !existing || existing.json !== json;
    const version = !existing ? 1 : changed ? existing.version + 1 : existing.version;
    state.deviceProfiles[id] = { id, productId: product.id, json, version, loadedAt: now };
    let assetId = null;
    if (created && createAssets) assetId = upsertRecord(state, 'asset', { productId: product.id, nickname: `My ${model}`, notes: 'Created from the DeckChek device library. Rename it and add the serial number in Equipment.' }, now).id;
    out.push({ profileId: id, manufacturerId: m.id, productId: product.id, version, created, changed, assetId });
  }
  pruneRetiredProfilesLocal(state, out.map(o => o.profileId), now);
  return out;
}

const AUTO_ASSET_NOTE = 'Created from the DeckChek device library.';

/**
 * Remove library entries whose profile no longer ships. The auto-created "My <model>" asset is deleted when nothing
 * refers to it, otherwise soft-deleted (isDeleted + retiredDate). A profile row that saved test results still point at
 * is kept so the history stays valid. An empty shipped set (library failed to load) prunes nothing.
 * Mirrors prune_retired_profiles in src-tauri/src/devices.rs.
 */
export function pruneRetiredProfilesLocal(state, shippedIds, now = new Date().toISOString()) {
  const shipped = new Set(shippedIds || []);
  const summary = { profiles: [], assetsDeleted: [], assetsRetired: [] };
  if (!shipped.size) return summary;
  for (const id of Object.keys(state.deviceProfiles)) {
    if (shipped.has(id)) continue;
    const { productId } = state.deviceProfiles[id];
    let keepProfile = false;
    for (const a of state.catalog.asset.filter(x => x.productId === productId && !x.isDeleted && String(x.notes || '').startsWith(AUTO_ASSET_NOTE))) {
      const used = state.deviceResults.some(r => r.assetId === a.id) || state.midiMaps[a.id]
        || state.catalog.setup.some(su => (su.components || []).some(c => c.assetId === a.id));
      if (used) {
        Object.assign(a, { isDeleted: true, retiredDate: a.retiredDate || now.slice(0, 10), updatedAt: now });
        summary.assetsRetired.push(a.id);
      } else {
        state.catalog.asset.splice(state.catalog.asset.indexOf(a), 1);
        summary.assetsDeleted.push(a.id);
      }
    }
    if (state.deviceResults.some(r => r.profileId === id)) keepProfile = true;
    state.productSpecs = state.productSpecs.filter(sp => !String(sp.id).startsWith(`${id}:spec:`));
    if (!keepProfile) { delete state.deviceProfiles[id]; summary.profiles.push(id); }
  }
  return summary;
}

export function saveDeviceResultLocal(state, input, now = new Date().toISOString()) {
  if (!RESULT_STATUSES.includes(input?.status)) throw new Error(`invalid status '${input?.status}' (expected pass, fail, unknown or skipped)`);
  if (!trimmed(input.testId)) throw new Error('testId is required');
  const sessionKnown = input.sessionId && state.runs.some(r => r.id === input.sessionId);
  const row = { id: input.id || newId(), assetId: input.assetId, profileId: input.profileId, testId: input.testId, sessionId: sessionKnown ? input.sessionId : null, status: input.status, detail: input.detail ?? {}, createdAt: input.createdAt || now };
  state.deviceResults = [row, ...state.deviceResults.filter(r => r.id !== row.id)];
  return { ...row };
}

export function listDeviceResultsLocal(state, assetId = null) {
  return state.deviceResults.filter(r => !assetId || r.assetId === assetId).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(r => ({ ...r }));
}

// ---------- setup wizard gear (FS-01 AC-6; mirrors src-tauri/src/wizard.rs) ----------
export const WIZARD_ASSET_NOTE = 'Added by the DeckChek setup wizard. Rename it and add the serial number in Equipment.';

/** True when an asset is referenced by a test result, MIDI map or setup (so retiring it would orphan history). */
function assetInUseLocal(state, assetId) {
  return state.deviceResults.some(r => r.assetId === assetId) || Boolean(state.midiMaps[assetId])
    || state.catalog.setup.some(su => (su.components || []).some(c => c.assetId === assetId));
}

/**
 * Make sure each profile id in `owned` has a live "My <model>" asset (reviving a soft-deleted one rather than adding a
 * twin) and, when `retire` is set, soft-delete the untouched library-created assets of every other profile.
 * Unknown profile ids reject the whole call before anything changes. Returns {created, existing, removed}.
 */
export function applyGearLocal(state, owned, { retire = false } = {}, now = new Date().toISOString()) {
  const ids = [...new Set((owned || []).map(x => String(x ?? '').trim()))];
  if (ids.length > 500) throw new Error('too many product ids');
  const resolved = ids.map(id => {
    const dp = state.deviceProfiles[id];
    if (!id || id.length > 128 || !dp) throw new Error(`unknown product id '${id}'`);
    let model = '';
    try { model = JSON.parse(dp.json || '{}').model || ''; } catch { /* fall back to the product row */ }
    return { id, productId: dp.productId, model: model || state.catalog.product.find(p => p.id === dp.productId)?.model || '' };
  });
  const out = { created: [], existing: [], removed: [] };
  for (const { id, productId, model } of resolved) {
    const mine = state.catalog.asset.filter(a => a.productId === productId);
    const live = mine.find(a => !a.isDeleted);
    if (live) { out.existing.push({ productId: id, assetId: live.id }); continue; }
    const revived = mine.filter(a => a.isDeleted).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (revived) {
      Object.assign(revived, { isDeleted: false, retiredDate: null, updatedAt: now });
      out.created.push({ productId: id, assetId: revived.id });
    } else {
      const asset = upsertRecord(state, 'asset', { productId, nickname: `My ${model}`, notes: WIZARD_ASSET_NOTE }, now);
      out.created.push({ productId: id, assetId: asset.id });
    }
  }
  if (retire) {
    const keep = new Set(ids);
    for (const [pid, dp] of Object.entries(state.deviceProfiles)) {
      if (keep.has(pid)) continue;
      let model = '';
      try { model = JSON.parse(dp.json || '{}').model || ''; } catch { /* skip */ }
      for (const a of state.catalog.asset) {
        if (a.productId !== dp.productId || a.isDeleted || !String(a.notes || '').startsWith(AUTO_ASSET_NOTE)) continue;
        if (a.updatedAt !== a.createdAt || a.nickname !== `My ${model}` || assetInUseLocal(state, a.id)) continue;
        Object.assign(a, { isDeleted: true, retiredDate: a.retiredDate || now.slice(0, 10), updatedAt: now });
        out.removed.push({ productId: pid, assetId: a.id });
      }
    }
  }
  return out;
}

/**
 * Whether DeckChek's setup wizard owns gear creation. It does when the flag is on, except under browser automation
 * (navigator.webdriver) unless the wizard smoke test opts in with localStorage 'deckchek.wizard.e2e' = '1'. Other UI
 * smoke tests start from fresh storage and must not meet a modal dialog.
 */
export function wizardAutomationBypass() {
  try {
    if (globalThis.navigator?.webdriver !== true) return false;
    return globalThis.localStorage?.getItem('deckchek.wizard.e2e') !== '1';
  } catch { return false; }
}
export function wizardManagesGear() { return isEnabled('setupWizard') && !wizardAutomationBypass(); }

const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;

export function createCatalogStore({ invoke = nativeInvoke(), storage = globalThis.localStorage } = {}) {
  const mutate = fn => { const s = loadState(storage); const out = fn(s); saveState(storage, s); return out; };
  let userData = null; // memoised: the state before the first device-library sync (FS-01 AC-10)
  return {
    native: Boolean(invoke),
    /**
     * True when the database already holds a run or an asset. The first call pins the answer, and
     * syncDeviceProfiles makes that call before its first sync, so assets created by older builds count (v0.04
     * users keep their gear and are not re-prompted) while ones created by this session's own sync do not.
     */
    hasUserData() {
      userData ??= (async () => {
        try {
          if (invoke) return Boolean(await invoke('wizard_has_user_data'));
          const s = loadState(storage);
          return s.runs.length > 0 || s.catalog.asset.length > 0;
        } catch { return false; }
      })();
      return userData;
    },
    async list(entity, filter) {
      assertEntity(entity);
      if (invoke) return invoke('catalog_list', { entity, filter: filter ?? null });
      const rows = filterRecords(entity, loadState(storage).catalog[entity], filter).filter(r => !r.isDeleted);
      return rows.map(r => ({ ...r }));
    },
    async upsert(entity, record) {
      assertEntity(entity);
      if (invoke) return invoke('catalog_upsert', { entity, record });
      return mutate(s => upsertRecord(s, entity, record));
    },
    async remove(entity, id) {
      assertEntity(entity);
      if (invoke) return invoke('catalog_delete', { entity, id });
      return mutate(s => deleteRecord(s, entity, id));
    },
    async listRuns(limit = 50) {
      if (invoke) return invoke('list_runs', { limit });
      return loadState(storage).runs.map(summarizeRun).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, limit);
    },
    async getRun(id) {
      if (invoke) return invoke('get_run', { id });
      const run = loadState(storage).runs.find(r => r.id === id);
      return run ? { ...summarizeRun(run), measurements: run.measurements || [], hypotheses: run.findings || [] } : null;
    },
    async saveRun(run) {
      if (invoke) return invoke('save_diagnostic_run', { run });
      mutate(s => { s.runs = [run, ...s.runs.filter(r => r.id !== run.id)]; });
    },
    /** Sync researched device profiles into the catalog (idempotent). */
    async syncDeviceProfiles(profiles, { createAssets } = {}) {
      await this.hasUserData();
      const create = createAssets ?? !wizardManagesGear();
      if (invoke) return invoke('device_profiles_sync', { profiles, createAssets: create });
      return mutate(s => syncProfilesLocal(s, profiles, undefined, { createAssets: create }));
    },
    /** Wizard finish step: `retire` (first run) also retires untouched library-created assets of unticked gear. */
    async applyGear(profileIds, { retire = false } = {}) {
      const ids = Array.isArray(profileIds) ? profileIds : [];
      if (invoke) return invoke(retire ? 'wizard_apply_gear' : 'wizard_create_assets', { productIds: ids });
      return mutate(s => applyGearLocal(s, ids, { retire }));
    },
    async saveDeviceTestResult(result) {
      if (invoke) return invoke('device_test_result_save', { result });
      return mutate(s => saveDeviceResultLocal(s, result));
    },
    async listDeviceTestResults(assetId = null) {
      if (invoke) return invoke('device_test_results', { assetId });
      return listDeviceResultsLocal(loadState(storage), assetId);
    },
    async saveMidiMap(assetId, profileId, map) {
      if (invoke) return invoke('device_midi_map_save', { assetId, profileId, map });
      if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('map must be an object');
      return mutate(s => { s.midiMaps[assetId] = { assetId, profileId, map, updatedAt: new Date().toISOString() }; return { ...s.midiMaps[assetId] }; });
    },
    async getMidiMap(assetId) {
      if (invoke) return invoke('device_midi_map_get', { assetId });
      return loadState(storage).midiMaps[assetId] || null;
    },
    async saveScanAlignment(alignment) {
      if (invoke) return invoke('save_scan_alignment', { alignment });
      return mutate(s => { const rec = buildAlignmentRecord(alignment); s.alignments.push(rec); return { id: rec.id, scanAId: rec.scanAId, scanBId: rec.scanBId }; });
    },
  };
}
