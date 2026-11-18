// A browser-only transfer of complete saved evidence. Workspace v1 and native
// database backups keep their existing formats and behavior.
import { createVenueIncidentStore, validateSavedIncident } from './venue-incidents.js';
import {
  createSupportIsolationStore, validateSavedSupportObservation, validateSavedSupportComparison,
} from './support-isolation.js';

export const VENUE_HISTORY_FORMAT = 'deckchek-venue-history';
export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
export const MAX_ARCHIVE_RECORDS = 10_000;
const KEYS = ['format', 'formatVersion', 'exportedAt', 'incidents', 'supportObservations', 'supportComparisons'];
const COLLECTIONS = ['incidents', 'supportObservations', 'supportComparisons'];
const READ_LIMITS = Object.freeze({ maxRecords: MAX_ARCHIVE_RECORDS, maxBytes: MAX_ARCHIVE_BYTES });
const copy = value => structuredClone(value);
const message = error => error?.message || String(error);

export class VenueHistoryArchiveError extends Error {
  constructor(code, text, preview = null) { super(text); this.name = 'VenueHistoryArchiveError'; this.code = code; this.preview = preview; }
}
const invalid = text => { throw new VenueHistoryArchiveError('ARCHIVE_INVALID', text); };

function finiteJson(value) {
  const ancestors = new Set();
  function visit(item, depth = 0) {
    if (depth > 24) invalid('The archive exceeds the supported nesting bound');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') { if (!Number.isFinite(item)) invalid('Archive numbers must be finite; nothing was sanitized'); return; }
    if (!item || typeof item !== 'object' || ancestors.has(item)
        || !Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) invalid('The archive must contain only finite, acyclic JSON values');
    ancestors.add(item);
    if (Array.isArray(item)) {
      if (Object.keys(item).length !== item.length) invalid('Archive arrays must contain every JSON value without extra fields');
      for (let index = 0; index < item.length; index++) visit(item[index], depth + 1);
    } else for (const child of Object.values(item)) visit(child, depth + 1);
    ancestors.delete(item);
  }
  visit(value);
}
function countsOf(value) {
  const counts = Object.fromEntries(COLLECTIONS.map(key => [key, value[key].length]));
  return { ...counts, total: COLLECTIONS.reduce((total, key) => total + counts[key], 0) };
}
function boundedText(value) {
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > MAX_ARCHIVE_BYTES) invalid('The complete archive exceeds 32 MiB; no records were truncated');
  return text;
}
function validateArchive(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== KEYS.length
      || KEYS.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !KEYS.includes(key))) invalid('Unsupported or incomplete venue-history archive envelope');
  if (value.format !== VENUE_HISTORY_FORMAT || value.formatVersion !== 1) invalid('Unsupported venue-history archive format or version');
  const at = value.exportedAt;
  if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at)
      || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) invalid('Archive export time must be a canonical UTC timestamp');
  if (COLLECTIONS.some(key => !Array.isArray(value[key]))) invalid('Archive record collections must be arrays');
  if (countsOf(value).total > MAX_ARCHIVE_RECORDS) invalid('The complete archive exceeds the 10,000-record bound; no records were truncated');
  finiteJson(value); boundedText(value);
  try {
    const incidents = value.incidents.map(validateSavedIncident);
    if (new Set(incidents.map(row => row.id)).size !== incidents.length) invalid('Duplicate incident ID in archive');
    const observations = value.supportObservations.map(validateSavedSupportObservation);
    const byId = new Map(observations.map(row => [row.id, row]));
    const comparisons = value.supportComparisons.map(row => validateSavedSupportComparison(row, byId.get(row?.observationAId), byId.get(row?.observationBId)));
    const supportIds = [...observations, ...comparisons].map(row => row.id);
    if (new Set(supportIds).size !== supportIds.length) invalid('Duplicate or cross-kind support ID in archive');
  } catch (error) {
    if (error instanceof VenueHistoryArchiveError) throw error;
    invalid(`Archive saved evidence is invalid: ${message(error)}`);
  }
  // Validators above are checks, never replacement data or a sanitizing path.
  return copy(value);
}

export function parseVenueHistoryArchive(text) {
  if (typeof text !== 'string' || text.length > MAX_ARCHIVE_BYTES || new TextEncoder().encode(text).length > MAX_ARCHIVE_BYTES) invalid('The archive file is missing or larger than 32 MiB');
  let value;
  try { value = JSON.parse(text); } catch (error) { invalid(`The archive is not valid JSON: ${message(error)}`); }
  return validateArchive(value);
}
export function serializeVenueHistoryArchive(value) { return boundedText(validateArchive(value)); }

export function createVenueHistoryArchive({ storage, now = () => new Date().toISOString() } = {}) {
  const incidents = createVenueIncidentStore({ invoke: null, storage });
  // Archive operations never use editable catalogs. Supplying this explicitly
  // also avoids evaluating a catalog default backed by unrelated global storage.
  const support = createSupportIsolationStore({ invoke: null, storage, catalog: null });
  function prepare(value) {
    const archive = validateArchive(value);
    // Both complete target stores are read before any restore entry can write.
    const entries = [
      ...incidents.prepareArchiveRestore(archive.incidents, READ_LIMITS),
      ...support.prepareArchiveRestore({ observations: archive.supportObservations, comparisons: archive.supportComparisons }, READ_LIMITS),
    ];
    const conflicts = entries.filter(entry => entry.conflict).map(({ kind, id }) => ({ kind, id, reason: 'Different saved evidence, persistence metadata or record kind' }));
    const alreadyPresent = entries.filter(entry => entry.present && !entry.conflict).length;
    const preview = { counts: countsOf(archive), alreadyPresent, toImport: entries.length - alreadyPresent - conflicts.length,
      conflicts, canImport: conflicts.length === 0 };
    return { entries, preview };
  }
  return {
    exportArchive() {
      const incidentRecords = incidents.readArchive(READ_LIMITS), supportRecords = support.readArchive(READ_LIMITS);
      return validateArchive({ format: VENUE_HISTORY_FORMAT, formatVersion: 1, exportedAt: now(),
        incidents: incidentRecords, supportObservations: supportRecords.observations, supportComparisons: supportRecords.comparisons });
    },
    preview(value) { return prepare(value).preview; },
    importArchive(value) {
      const { entries, preview } = prepare(value);
      if (!preview.canImport) throw new VenueHistoryArchiveError('ARCHIVE_CONFLICT', 'Archive conflicts with saved history; no records were written', preview);
      let completed = 0, alreadyPresent = preview.alreadyPresent;
      for (const entry of entries) {
        try {
          const result = entry.restore();
          if (result === 'added') { completed++; if (entry.present) alreadyPresent--; }
          else if (!entry.present) alreadyPresent++;
        } catch (error) {
          if (entry.present) alreadyPresent--;
          return { status: 'partial', counts: preview.counts, completed, alreadyPresent,
            remaining: preview.counts.total - completed - alreadyPresent,
            failure: { kind: entry.kind, id: entry.id, message: message(error) } };
        }
      }
      return { status: 'complete', counts: preview.counts, completed, alreadyPresent, remaining: 0, failure: null };
    },
  };
}
