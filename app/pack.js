// FS-21 offline pack boundary. Whitelist serialization and strict import validation.
// The memory store mirrors pack ownership, including overlapping observations.
import { sha256HexSync } from './sha256.js';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 100000;
const ID = /^[a-z0-9._:-]{1,64}$/;
const ROOT_KEYS = ['format', 'version', 'packId', 'createdMonth', 'appVersion', 'contributor', 'rows'];
const ROW_KEYS = ['product', 'metric', 'method', 'value', 'unit'];
const ownObject = value => value && typeof value === 'object' && !Array.isArray(value);
const sameKeys = (object, keys) => ownObject(object) && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
const hash = value => sha256HexSync(JSON.stringify(value));

function definition(registry, product, metric) {
  const key = `${product}:${metric}`;
  return registry instanceof Map ? registry.get(key) : registry?.[key];
}

function normalizedRow(row) {
  return { product: row.product, metric: row.metric, method: { key: row.method.key, version: row.method.version }, value: row.value, unit: row.unit };
}

function depthOkay(value) {
  const pending = [[value, 0]];
  while (pending.length) {
    const [item, depth] = pending.pop();
    if (!item || typeof item !== 'object') continue;
    if (depth > 8) return false;
    for (const child of Object.values(item)) pending.push([child, depth + 1]);
  }
  return true;
}

/** Reject unknown fields, non-finite values and metrics without a plausible range. */
export function validatePack(json, { metricRegistry } = {}) {
  const errors = [], normalizedRows = [], counts = new Map();
  let pack;
  try {
    const text = typeof json === 'string' ? json : JSON.stringify(json);
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('Pack exceeds 5 MB');
    pack = typeof json === 'string' ? JSON.parse(text) : json;
    if (!depthOkay(pack)) throw new Error('Pack nesting exceeds eight levels');
  } catch (error) { return { ok: false, errors: [error.message], normalizedRows, counts: [] }; }
  if (!sameKeys(pack, ROOT_KEYS)) errors.push('This is not a DeckChek pack: missing or unknown fields');
  if (pack?.format !== 'deckchek-pack') errors.push('This is not a DeckChek pack');
  if (pack?.version !== 1) errors.push(`Pack version ${pack?.version} needs a compatible DeckChek`);
  if (![pack?.packId, pack?.contributor].every(value => typeof value === 'string' && ID.test(value))) errors.push('Pack and contributor IDs must be safe identifiers');
  if (typeof pack?.createdMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(pack.createdMonth)) errors.push('createdMonth must contain only year and month');
  if (typeof pack?.appVersion !== 'string' || !/^[0-9][a-z0-9.+-]{0,63}$/.test(pack.appVersion)) errors.push('Invalid app version');
  if (!Array.isArray(pack?.rows) || pack.rows.length > MAX_ROWS) errors.push('Pack must contain at most 100000 rows');
  // Reject the entire document if its envelope is invalid. No partial imports.
  if (errors.length) return { ok: false, errors, normalizedRows, counts: [] };
  const seen = new Set();
  for (let index = 0; index < pack.rows.length; index++) {
    const row = pack.rows[index];
    let reason = null;
    if (!sameKeys(row, ROW_KEYS) || !sameKeys(row?.method, ['key', 'version'])) reason = 'missing or unknown row fields';
    else if (![row.product, row.metric, row.method.key].every(value => typeof value === 'string' && ID.test(value))) reason = 'invalid identifier';
    else if (!Number.isSafeInteger(row.method.version) || row.method.version < 1) reason = 'invalid method version';
    else if (typeof row.value !== 'number' || !Number.isFinite(row.value)) reason = 'value must be finite';
    else {
      const spec = definition(metricRegistry, row.product, row.metric);
      if (!spec || !Array.isArray(spec.plausible) || spec.plausible.length !== 2 || !spec.plausible.every(Number.isFinite) || spec.plausible[0] > spec.plausible[1]) reason = 'metric has no known plausible range';
      else if (typeof row.unit !== 'string' || row.unit.length > 64 || row.unit !== spec.unit) reason = 'unit differs from the metric definition';
      else if (row.value < spec.plausible[0] || row.value > spec.plausible[1]) reason = 'value is outside the plausible range';
    }
    if (reason) { errors.push(`Row ${index + 1}: ${reason}`); continue; }
    const normalized = normalizedRow(row);
    const key = JSON.stringify(normalized);
    if (seen.has(key)) { errors.push(`Row ${index + 1}: duplicate observation`); continue; }
    seen.add(key);
    normalizedRows.push(normalized);
    const group = JSON.stringify([row.product, row.metric]);
    if (!counts.has(group)) counts.set(group, { product: row.product, metric: row.metric, rows: 0 });
    counts.get(group).rows++;
  }
  return { ok: errors.length === 0, errors, normalizedRows, counts: [...counts.values()] };
}

/** No identity or free-text source fields are ever copied into a pack. */
export function buildPack({ rows, appVersion, packId, contributor, createdMonth }, { metricRegistry } = {}) {
  if (!Array.isArray(rows)) throw new TypeError('Rows must be an array');
  const pack = {
    format: 'deckchek-pack', version: 1,
    packId: packId ?? globalThis.crypto.randomUUID(),
    createdMonth: createdMonth ?? new Date().toISOString().slice(0, 7),
    appVersion, contributor: contributor ?? globalThis.crypto.randomUUID(),
    rows: rows.map(row => ({ ...normalizedRow(row), value: Number(Number(row.value).toPrecision(3)) })),
  };
  const checked = validatePack(pack, { metricRegistry });
  if (!checked.ok) throw new Error(checked.errors.join('; '));
  return pack;
}

/** In-memory adapter for browser mode and deterministic pack import tests. */
export function createPackStore({ metricRegistry } = {}) {
  const packs = new Map();
  const samples = new Map();
  return {
    import(json) {
      const preview = validatePack(json, { metricRegistry });
      if (!preview.ok) throw new Error(preview.errors.join('; '));
      const source = typeof json === 'string' ? JSON.parse(json) : json;
      const pack = Object.fromEntries(ROOT_KEYS.map(key => [key, key === 'rows' ? preview.normalizedRows : source[key]]));
      const digest = hash(pack);
      const previous = packs.get(pack.packId);
      if (previous) {
        if (previous.digest !== digest) throw new Error('Pack ID already exists with different content');
        return { packId: pack.packId, accepted: 0, duplicate: true };
      }
      let accepted = 0;
      const hashes = [];
      for (const row of preview.normalizedRows) {
        const rowHash = hash([pack.contributor, row]);
        if (!samples.has(rowHash)) { samples.set(rowHash, { row: { ...row, contributor: pack.contributor }, owners: new Set() }); accepted++; }
        samples.get(rowHash).owners.add(pack.packId);
        hashes.push(rowHash);
      }
      packs.set(pack.packId, { digest, hashes });
      return { packId: pack.packId, accepted, duplicate: false };
    },
    remove(packId) {
      const pack = packs.get(packId);
      if (!pack) return;
      for (const key of pack.hashes) {
        const sample = samples.get(key);
        sample.owners.delete(packId);
        if (!sample.owners.size) samples.delete(key);
      }
      packs.delete(packId);
    },
    query({ product, metric, methodKey }) {
      const rows = [...samples.values()].map(sample => sample.row)
        .filter(row => row.product === product && row.metric === metric && row.method.key === methodKey)
        .map(row => ({ ...row, method: { ...row.method } }));
      return { rows, contributors: new Set(rows.map(row => row.contributor)).size };
    },
  };
}
