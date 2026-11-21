// Saved mapping models (FS-32 §5, table mapper_model from 0020_mapper_models.sql). Desktop: Rust commands
// mapper_model_save / _list / _get / _delete (src-tauri/src/mapper.rs re-validates everything). Browser mode: the same
// API over localStorage (`deckchek.mapper.v1`, capped), so the studio works without the desktop app.
// Rows: {id, assetId, profileId, name, model, createdAt, updatedAt}; list rows carry controlCount/version, no model.

import { LIMITS, sanitizeModel, cleanText, MODEL_VERSION } from './model.js';

export const LOCAL_KEY = 'deckchek.mapper.v1';
const MAX_LOCAL_MODELS = 50;
const tauri = () => globalThis.window?.__TAURI__ ?? null;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function summary(row) {
  const { model, ...rest } = row;
  return { ...rest, version: Number(model?.version) || null, controlCount: Array.isArray(model?.controls) ? model.controls.length : 0 };
}

/** Typed refusal to overwrite a row saved by a newer DeckChek (Rust: `MAPPER_NEWER_VERSION: …`). */
export class MapperVersionError extends Error {
  constructor(version) {
    super(`This mapping was saved by a newer DeckChek (model version ${version}) and is not overwritten.`);
    this.name = 'MapperVersionError';
    this.code = 'MAPPER_NEWER_VERSION';
    this.version = version;
  }
}

/** A failed read is not an empty store and must never be used as the basis of a write. */
export class MapperStorageError extends Error {
  constructor() {
    super('Saved mappings could not be read. The stored data has not been changed. Restore browser storage access or recover the saved data before saving or deleting mappings. You can still export your current mapping to a file.');
    this.name = 'MapperStorageError';
    this.code = 'MAPPER_STORAGE_READ';
  }
}

/** The stored model's version when `incoming` must not overwrite it, else null (mirrors mapper.rs save). */
export function newerStoredVersion(stored, incoming) {
  const v = Number.isInteger(stored?.version) ? stored.version : null;
  const inc = Number.isInteger(incoming?.version) ? incoming.version : 0;
  return v != null && (v > inc || v > MODEL_VERSION) ? v : null;
}

function newId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Check a model before saving: same limits as Rust (name, size, version). Throws an Error with a plain message. */
export function checkSavable({ name, model }) {
  const n = cleanText(name);
  if (!n) throw new Error('Give the mapping a name before saving.');
  if (!model || typeof model !== 'object' || !Number.isInteger(model.version)) throw new Error('There is no mapping to save.');
  const json = JSON.stringify(model);
  if (json.length > LIMITS.maxModelBytes) throw new Error('This mapping is too large to save (over 2 MB).');
  return { name: n, json };
}

export function createMapperStore({ api = tauri(), storage } = {}) {
  const invoke = api?.core?.invoke;
  // Resolve lazily so a blocked localStorage getter cannot prevent native operations.
  const browserStorage = () => storage === undefined ? globalThis.localStorage : storage;
  const load = () => {
    try {
      const target = browserStorage();
      if (typeof target?.getItem !== 'function') throw new MapperStorageError();
      const raw = target.getItem(LOCAL_KEY);
      if (raw === null) return []; // Only an absent key is a legitimate empty store.
      if (typeof raw !== 'string') throw new MapperStorageError();
      const rows = JSON.parse(raw), ids = new Set();
      if (!Array.isArray(rows)) throw new MapperStorageError();
      for (const row of rows) {
        // Preserve unknown fields and future model versions. Refuse the whole collection
        // when a row cannot be identified/read, rather than silently dropping part of it.
        if (!isRecord(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id)
          || typeof row.name !== 'string' || !isRecord(row.model) || !Number.isInteger(row.model.version)) {
          throw new MapperStorageError();
        }
        ids.add(row.id);
      }
      return rows;
    } catch { throw new MapperStorageError(); }
  };
  const persist = rows => {
    try {
      const target = browserStorage();
      if (typeof target?.setItem !== 'function') throw new Error('Storage unavailable');
      target.setItem(LOCAL_KEY, JSON.stringify(rows));
    } catch { throw new Error('The browser did not let DeckChek store the mapping (storage full or blocked).'); }
  };
  return {
    native: Boolean(invoke),
    async save({ id = null, assetId = null, profileId = null, name, model }) {
      const { name: n } = checkSavable({ name, model });
      if (invoke) {
        return invoke('mapper_model_save', { input: { id, assetId, profileId, name: n, model } }).catch(e => {
          const m = /^MAPPER_NEWER_VERSION: .*?model version (\d+)/.exec(typeof e === 'string' ? e : '');
          throw m ? new MapperVersionError(Number(m[1])) : e;
        });
      }
      const rows = load();
      const now = new Date().toISOString();
      const prev = id ? rows.find(r => r.id === id) : null;
      const newer = newerStoredVersion(prev?.model, model);
      if (newer != null) throw new MapperVersionError(newer);
      // The browser store is capped; a new mapping past the cap is refused, never made room for by deleting one.
      if (!prev && rows.length >= MAX_LOCAL_MODELS) throw new Error(`This browser holds at most ${MAX_LOCAL_MODELS} saved mappings. Delete a saved mapping first, or export this one to a file.`);
      const row = { id: prev?.id || newId(), assetId, profileId, name: n, model, createdAt: prev?.createdAt || now, updatedAt: now };
      const next = [row, ...rows.filter(r => r.id !== row.id)];
      persist(next);
      return row;
    },
    async list({ assetId = null } = {}) {
      if (invoke) return invoke('mapper_model_list', { assetId });
      return load().filter(r => !assetId || r.assetId === assetId).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(summary);
    },
    async get(id) {
      const row = invoke ? await invoke('mapper_model_get', { id }) : load().find(r => r.id === id) || null;
      if (!row) return null;
      const { model, warnings, readOnly } = sanitizeModel(row.model);
      return { ...row, model, warnings, readOnly };
    },
    async remove(id) {
      if (invoke) return invoke('mapper_model_delete', { id });
      const rows = load();
      const next = rows.filter(r => r.id !== id);
      persist(next);
      return next.length !== rows.length;
    },
  };
}
