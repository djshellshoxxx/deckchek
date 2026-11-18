// Exact additive transfer of the current browser Equipment catalog. Historical
// evidence, workspace v1 and native database backups retain their own formats.
import { ENTITIES, emptyState, readCatalogArchiveSnapshot } from './catalog-store.js';

export const CATALOG_ARCHIVE_FORMAT = 'deckchek-catalog';
export const MAX_CATALOG_ARCHIVE_BYTES = 32 * 1024 * 1024;
export const MAX_CATALOG_ARCHIVE_RECORDS = 10_000;
const ENVELOPE = ['format', 'formatVersion', 'exportedAt', 'catalog'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);
const message = error => error?.message || String(error);

export class CatalogArchiveError extends Error {
  constructor(code, text, preview = null) { super(text); this.name = 'CatalogArchiveError'; this.code = code; this.preview = preview; }
}
const invalid = text => { throw new CatalogArchiveError('CATALOG_INVALID', text); };

// JSON round trips must not discard values or silently turn -0 into +0.
// Accessors, symbols and hidden properties cannot occur in a parsed JSON file.
function finiteJson(value) {
  const ancestors = new Set();
  function visit(item, depth = 0) {
    if (depth > 24) invalid('The catalog exceeds the supported nesting bound.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || Object.is(item, -0)) invalid('Catalog numbers must survive JSON unchanged; nothing was normalized.');
      return;
    }
    const array = Array.isArray(item);
    if (!item || typeof item !== 'object' || ancestors.has(item)
        || !(array ? Object.getPrototypeOf(item) === Array.prototype : [Object.prototype, null].includes(Object.getPrototypeOf(item)))) invalid('The catalog must contain only finite, acyclic plain JSON values.');
    const keys = Reflect.ownKeys(item).filter(key => !(array && key === 'length'));
    if (array && keys.length !== item.length) invalid('Catalog arrays must contain every value without extra fields.');
    ancestors.add(item);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid('Catalog metadata must contain only saved JSON properties.');
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) invalid('Catalog arrays cannot contain additional metadata.');
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
  }
  visit(value);
}

function boundedText(value, context = 'catalog archive') {
  const text = JSON.stringify(value);
  if (text.length > MAX_CATALOG_ARCHIVE_BYTES || new TextEncoder().encode(text).length > MAX_CATALOG_ARCHIVE_BYTES) invalid(`The complete ${context} exceeds 32 MiB; no data was omitted.`);
  return text;
}
function boundedInput(text, context) {
  if (typeof text !== 'string' || text.length > MAX_CATALOG_ARCHIVE_BYTES || new TextEncoder().encode(text).length > MAX_CATALOG_ARCHIVE_BYTES) invalid(`The ${context} is missing or larger than 32 MiB.`);
  try { return JSON.parse(text); } catch (error) { invalid(`The ${context} is not valid JSON: ${message(error)}`); }
}
function equal(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a), other = Object.keys(b);
  return keys.length === other.length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

const SCHEMAS = {
  manufacturer: { required: ['name'], text: ['website', 'notes'] },
  product: { required: ['category', 'model'], text: ['variant', 'revision', 'region', 'description', 'sourceUrl'], refs: ['manufacturerId'], integer: ['releaseYear', 'discontinuedYear'] },
  asset: { required: ['nickname'], text: ['serialNumber', 'purchaseDate', 'installedDate', 'retiredDate', 'firmware', 'condition', 'notes'], refs: ['productId', 'deckPositionId'] },
  setup: { required: ['name'], text: ['profile', 'notes'], refs: ['venueId', 'boothId', 'deckPositionId', 'supportConfigurationId'] },
  venue: { required: ['name'], text: ['venueType', 'city', 'region', 'country', 'notes'] },
  supportConfiguration: { required: ['name'], text: ['description', 'coupledState', 'notes'], refs: ['deckPositionId'] },
  setupComponent: { required: ['role'], text: ['position'], refs: ['assetId', 'settingsSnapshotId'] },
};
function validateRecord(record, kind, path) {
  if (!object(record) || typeof record.id !== 'string' || record.id.length === 0) invalid(`${path} requires a non-empty saved ID.`);
  const schema = SCHEMAS[kind];
  for (const field of schema.required) if (typeof record[field] !== 'string' || record[field].length === 0) invalid(`${path} ${field} must be non-empty text.`);
  for (const field of schema.text || []) if (record[field] != null && typeof record[field] !== 'string') invalid(`${path} ${field} must be text or null.`);
  for (const field of schema.refs || []) if (record[field] != null && (typeof record[field] !== 'string' || record[field].length === 0)) invalid(`${path} ${field} must be a saved ID or null.`);
  for (const field of schema.integer || []) if (record[field] != null && !Number.isSafeInteger(record[field])) invalid(`${path} ${field} must be an integer or null.`);
  for (const field of ['createdAt', 'updatedAt']) if (Object.hasOwn(record, field) && typeof record[field] !== 'string') invalid(`${path} ${field} must retain its saved timestamp text.`);
  if (kind === 'asset' && Object.hasOwn(record, 'isDeleted') && ![true, false, 0, 1].includes(record.isDeleted)) invalid(`${path} isDeleted must be a saved boolean or 0/1.`);
  if (kind === 'supportConfiguration') {
    if (typeof record.structureJson !== 'string') invalid(`${path} structureJson must retain its literal saved text.`);
    if (record.approximateMassKg != null && (typeof record.approximateMassKg !== 'number' || !Number.isFinite(record.approximateMassKg) || record.approximateMassKg < 0)) invalid(`${path} approximateMassKg must be a finite nonnegative number or null.`);
  }
  if (kind === 'setupComponent' && (typeof record.assetId !== 'string' || !record.assetId)) invalid(`${path} assetId is required.`);
}

function inspectCatalog(catalog) {
  if (!object(catalog)) invalid('The saved catalog must be an object.');
  for (const entity of ENTITIES) if (!Object.hasOwn(catalog, entity) || !Array.isArray(catalog[entity])) invalid(`The catalog requires an array of ${entity} records.`);
  const counts = Object.fromEntries(ENTITIES.map(entity => [entity, catalog[entity].length]));
  counts.components = catalog.setup.reduce((sum, setup) => sum + (Array.isArray(setup?.components) ? setup.components.length : 0), 0);
  counts.total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (counts.total > MAX_CATALOG_ARCHIVE_RECORDS) invalid('The complete catalog exceeds 10,000 records including setup components; no records were omitted.');
  const indices = new Map(), locations = new Map(), components = new Map(), occurrences = [], legacyBindings = [];
  const reference = (kind, id, path) => { if (id != null) occurrences.push({ kind, id, path }); };
  for (const entity of ENTITIES) {
    const index = new Map(), recordLocations = new Map(); indices.set(entity, index); locations.set(entity, recordLocations);
    for (const [recordIndex, record] of catalog[entity].entries()) {
      const path = `${entity} ${record?.id ?? '(missing ID)'}`;
      const location = `catalog.${entity}[${recordIndex}]`;
      validateRecord(record, entity, path);
      if (index.has(record.id)) invalid(`Duplicate ${entity} ID ${record.id}.`);
      index.set(record.id, record);
      recordLocations.set(record.id, location);
      if (entity === 'setup') {
        if (Object.hasOwn(record, 'components') && !Array.isArray(record.components)) invalid(`${path} components must be an array.`);
        for (const [componentIndex, component] of (record.components || []).entries()) {
          const componentPath = `${path}, component ${component?.id ?? '(missing ID)'}`;
          validateRecord(component, 'setupComponent', componentPath);
          if (components.has(component.id)) invalid(`Duplicate setup component ID ${component.id}.`);
          components.set(component.id, { setupId: record.id, location, component });
          reference('settingsSnapshot', component.settingsSnapshotId, `${location}.components[${componentIndex}].settingsSnapshotId`);
        }
        reference('booth', record.boothId, `${location}.boothId`);
      }
      if (['asset', 'setup', 'supportConfiguration'].includes(entity)) reference('deckPosition', record.deckPositionId, `${location}.deckPositionId`);
    }
  }
  const requireParent = (id, entity, path) => { if (id != null && !indices.get(entity).has(id)) invalid(`${path} refers to missing ${entity} ${id}.`); };
  for (const product of catalog.product) requireParent(product.manufacturerId, 'manufacturer', `product ${product.id}`);
  for (const asset of catalog.asset) requireParent(asset.productId, 'product', `asset ${asset.id}`);
  for (const setup of catalog.setup) {
    requireParent(setup.venueId, 'venue', `setup ${setup.id}`);
    requireParent(setup.supportConfigurationId, 'supportConfiguration', `setup ${setup.id}`);
    for (const component of setup.components || []) requireParent(component.assetId, 'asset', `setup ${setup.id}, component ${component.id}`);
    const support = indices.get('supportConfiguration').get(setup.supportConfigurationId);
    if (support?.deckPositionId != null && support.deckPositionId !== (setup.deckPositionId ?? null)) legacyBindings.push({
      setupId: setup.id, supportId: support.id, setupDeckPositionId: setup.deckPositionId ?? null,
      supportDeckPositionPath: `${locations.get('supportConfiguration').get(support.id)}.deckPositionId`,
    });
  }
  const referenceCounts = Object.fromEntries(['booth', 'deckPosition', 'settingsSnapshot'].map(kind => [kind, new Set(occurrences.filter(item => item.kind === kind).map(item => item.id)).size]));
  referenceCounts.total = Object.values(referenceCounts).reduce((sum, count) => sum + count, 0);
  return { counts, indices, components, references: { counts: referenceCounts, occurrences }, legacyBindings };
}

function validateArchive(value) {
  finiteJson(value);
  if (!object(value) || Object.keys(value).length !== ENVELOPE.length || ENVELOPE.some(key => !Object.hasOwn(value, key))
      || value.format !== CATALOG_ARCHIVE_FORMAT || value.formatVersion !== 1) invalid('Unsupported or incomplete Equipment catalog archive envelope.');
  const at = value.exportedAt;
  if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at)
      || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) invalid('Catalog export time must be a canonical UTC timestamp.');
  boundedText(value); inspectCatalog(value.catalog);
  return copy(value);
}

export function parseCatalogArchive(text) { return validateArchive(boundedInput(text, 'catalog archive file')); }
export function serializeCatalogArchive(value) { return boundedText(validateArchive(value)); }

function readState(storage) {
  const snapshot = readCatalogArchiveSnapshot(storage);
  const state = snapshot.raw === null ? emptyState() : boundedInput(snapshot.raw, 'saved catalog storage');
  finiteJson(state);
  if (!object(state) || !object(state.catalog)) invalid('Catalog storage has an invalid catalog; existing data was kept.');
  // Older browser states may predate a collection. Only missing collections are
  // treated as empty; an existing malformed value is never replaced.
  const catalog = { ...emptyState().catalog, ...state.catalog };
  const details = inspectCatalog(catalog);
  return { snapshot, state, catalog, details };
}

export function createCatalogArchive({ storage, now = () => new Date().toISOString() } = {}) {
  function prepare(value) {
    const incoming = validateArchive(value), input = inspectCatalog(incoming.catalog);
    const target = readState(storage), conflicts = [], additions = [];
    let toImport = 0, alreadyPresent = 0;
    const weight = (entity, record) => 1 + (entity === 'setup' ? (record.components || []).length : 0);
    const collections = ENTITIES.map(entity => {
      const records = [...target.catalog[entity]], index = target.details.indices.get(entity);
      for (const record of incoming.catalog[entity]) {
        if (!index.has(record.id)) { records.push(record); toImport += weight(entity, record); }
        else if (equal(record, index.get(record.id))) alreadyPresent += weight(entity, record);
        else conflicts.push({ kind: entity, id: record.id, reason: 'Different saved fields, timestamps, component order or metadata' });
      }
      return [entity, records];
    });
    for (const [id, owner] of input.components) {
      const previous = target.details.components.get(id);
      if (previous && previous.setupId !== owner.setupId) conflicts.push({ kind: 'setupComponent', id, reason: `Already belongs to ${previous.location} in the current catalog` });
    }
    const metadata = { total: 0, toImport: 0, alreadyPresent: 0 };
    for (const [name, content] of Object.entries(incoming.catalog)) {
      if (ENTITIES.includes(name)) continue;
      metadata.total++;
      if (!Object.hasOwn(target.catalog, name)) { additions.push([name, content]); metadata.toImport++; }
      else if (equal(content, target.catalog[name])) metadata.alreadyPresent++;
      else conflicts.push({ kind: 'catalogMetadata', id: name, reason: 'Different opaque catalog metadata' });
    }
    const preview = { counts: input.counts, alreadyPresent, toImport, metadata, conflicts, canImport: conflicts.length === 0,
      references: input.references, legacyBindings: input.legacyBindings };
    let text = null;
    if (preview.canImport && (toImport || metadata.toImport)) {
      const catalog = Object.fromEntries([...Object.entries(target.catalog), ...collections, ...additions]);
      inspectCatalog(catalog);
      const merged = { ...target.state, catalog };
      finiteJson(merged); text = boundedText(merged, 'merged catalog storage');
    }
    return { target, preview, text };
  }
  return {
    exportArchive() {
      const { catalog } = readState(storage);
      return validateArchive({ format: CATALOG_ARCHIVE_FORMAT, formatVersion: 1, exportedAt: now(), catalog });
    },
    preview(value) { return prepare(value).preview; },
    importArchive(value) {
      const { target, preview, text } = prepare(value);
      if (!preview.canImport) throw new CatalogArchiveError('CATALOG_CONFLICT', 'Archive conflicts with the current Equipment catalog; no records were written.', preview);
      if (text !== null) target.snapshot.commit(text);
      return { status: 'complete', counts: preview.counts, completed: preview.toImport, alreadyPresent: preview.alreadyPresent,
        metadataAdded: preview.metadata.toImport, metadataAlreadyPresent: preview.metadata.alreadyPresent, written: text !== null };
    },
  };
}
