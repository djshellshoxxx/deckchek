// Saved mapping models (FS-32 §5, table mapper_model from 0020_mapper_models.sql). Desktop: Rust commands
// mapper_model_save / _list / _get / _delete (src-tauri/src/mapper.rs re-validates everything). Browser mode: the same
// API over localStorage (`deckchek.mapper.v1`, capped), so the studio works without the desktop app.
// Rows: {id, assetId, profileId, name, model, createdAt, updatedAt}; list rows carry controlCount/version, no model.

import { LIMITS, sanitizeModel, cleanText } from './model.js';

export const LOCAL_KEY = 'deckchek.mapper.v1';
const MAX_LOCAL_MODELS = 50;
const tauri = () => globalThis.window?.__TAURI__ ?? null;

function summary(row) {
  const { model, ...rest } = row;
  return { ...rest, version: Number(model?.version) || null, controlCount: Array.isArray(model?.controls) ? model.controls.length : 0 };
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

export function createMapperStore({ api = tauri(), storage = globalThis.localStorage ?? null } = {}) {
  const invoke = api?.core?.invoke;
  const load = () => {
    try { const v = JSON.parse(storage?.getItem(LOCAL_KEY) || '[]'); return Array.isArray(v) ? v.filter(r => r && typeof r.id === 'string') : []; } catch { return []; }
  };
  const persist = rows => {
    try { storage?.setItem(LOCAL_KEY, JSON.stringify(rows)); } catch { throw new Error('The browser did not let DeckChek store the mapping (storage full or blocked).'); }
  };
  return {
    native: Boolean(invoke),
    async save({ id = null, assetId = null, profileId = null, name, model }) {
      const { name: n } = checkSavable({ name, model });
      if (invoke) return invoke('mapper_model_save', { input: { id, assetId, profileId, name: n, model } });
      const rows = load();
      const now = new Date().toISOString();
      const prev = id ? rows.find(r => r.id === id) : null;
      const row = { id: prev?.id || newId(), assetId, profileId, name: n, model, createdAt: prev?.createdAt || now, updatedAt: now };
      const next = [row, ...rows.filter(r => r.id !== row.id)].slice(0, MAX_LOCAL_MODELS);
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
