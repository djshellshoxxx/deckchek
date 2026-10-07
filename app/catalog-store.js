// Async bridge to the Rust catalog/run commands, with a localStorage fallback
// exposing the same API for browser-only use.
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
  return { catalog: Object.fromEntries(ENTITIES.map(e => [e, []])), runs: [], alignments: [] };
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

const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;

export function createCatalogStore({ invoke = nativeInvoke(), storage = globalThis.localStorage } = {}) {
  const mutate = fn => { const s = loadState(storage); const out = fn(s); saveState(storage, s); return out; };
  return {
    native: Boolean(invoke),
    async list(entity, filter) {
      assertEntity(entity);
      if (invoke) return invoke('catalog_list', { entity, filter: filter ?? null });
      const rows = filterRecords(entity, loadState(storage).catalog[entity], filter);
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
    async saveScanAlignment(alignment) {
      if (invoke) return invoke('save_scan_alignment', { alignment });
      return mutate(s => { const rec = buildAlignmentRecord(alignment); s.alignments.push(rec); return { id: rec.id, scanAId: rec.scanAId, scanBId: rec.scanBId }; });
    },
  };
}
