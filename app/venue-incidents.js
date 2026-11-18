// SPEC-05 §20: immutable operator reports, with the catalog context selected at
// the button press. These records are not sensor detections or diagnostic scores.
import { createCatalogStore } from './catalog-store.js';

export const INCIDENT_TYPES = Object.freeze([
  ['skip', 'Skip'], ['feedback', 'Feedback'], ['hum', 'Hum'], ['needle_jump', 'Needle jump'],
  ['dropout', 'Dropout'], ['booth_shock', 'Booth shock'], ['other', 'Other'],
].map(([id, label]) => Object.freeze({ id, label })));
export const STORAGE_PREFIX = 'deckchek.venue-incidents.v1.';
export const INCIDENT_LIST_LIMIT = 100;
export const INCIDENT_MAX_LIMIT = 500;
export const INCIDENT_NOTE_LIMIT = 500;
const DRAFT_KEYS = ['schemaVersion', 'id', 'venueId', 'setupId', 'kind', 'occurredAt', 'note', 'context'];
const RECORD_KEYS = [...DRAFT_KEYS, 'origin', 'recordedAt'];
const typeIds = new Set(INCIDENT_TYPES.map(type => type.id));
const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;
const clone = value => JSON.parse(JSON.stringify(value));

export class IncidentError extends Error {
  constructor(code, message) { super(message); this.name = 'IncidentError'; this.code = code; }
}
const invalid = message => { throw new IncidentError('INCIDENT_INVALID', message); };
function object(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${name} must be an object`);
  if (Object.keys(value).some(key => !keys.includes(key))) invalid(`${name} has unsupported fields`);
}
function text(value, name, max, { nullable = false } = {}) {
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || !value.trim() || [...value].length > max || value.includes('\0')) invalid(`${name} must contain 1–${max} characters`);
  return value;
}
function identifier(value, name, nullable = false) {
  if (nullable && value == null) return null;
  const result = text(value, name, 128);
  if (result.trim() !== result || /[\u0000-\u001f\u007f]/.test(result)) invalid(`${name} contains invalid characters`);
  return result;
}
function timestamp(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid(`${name} must be a valid UTC timestamp with milliseconds`);
  return value;
}

/** Validate and copy before awaiting a bridge, catalog lookup or storage write. */
export function normalizeIncidentDraft(input) {
  object(input, DRAFT_KEYS, 'Incident');
  if (input.schemaVersion !== 1) invalid('Unsupported incident schema version');
  const id = identifier(input.id, 'Incident ID'), venueId = identifier(input.venueId, 'Venue ID');
  const setupId = identifier(input.setupId, 'Setup ID', true);
  if (!typeIds.has(input.kind)) invalid('Unknown incident type');
  const occurredAt = timestamp(input.occurredAt, 'Occurrence time');
  let note = input.note ?? null;
  if (note === '') note = null;
  if (note !== null) note = text(note, 'Note', INCIDENT_NOTE_LIMIT);
  object(input.context, ['venue', 'setup'], 'Selected context');
  object(input.context.venue, ['id', 'name'], 'Selected venue');
  const venue = { id: identifier(input.context.venue.id, 'Context venue ID'), name: text(input.context.venue.name, 'Venue name', 500) };
  if (venue.id !== venueId) invalid('Selected venue does not match the incident');
  let setup = null;
  if (input.context.setup != null) {
    const source = input.context.setup;
    object(source, ['id', 'name', 'boothId', 'deckPositionId', 'supportConfigurationId'], 'Selected setup');
    setup = { id: identifier(source.id, 'Context setup ID'), name: text(source.name, 'Setup name', 500),
      boothId: identifier(source.boothId, 'Booth ID', true), deckPositionId: identifier(source.deckPositionId, 'Position ID', true),
      supportConfigurationId: identifier(source.supportConfigurationId, 'Support ID', true) };
  }
  if ((setup?.id ?? null) !== setupId) invalid('Selected setup does not match the incident');
  return { schemaVersion: 1, id, venueId, setupId, kind: input.kind, occurredAt, note, context: { venue, setup } };
}

/** Capture the already displayed catalog selection synchronously at the press. */
export function createIncidentDraft({ kind, venue, setup = null, note = null }, {
  now = () => new Date().toISOString(), newId = () => globalThis.crypto.randomUUID(),
} = {}) {
  if (setup && setup.venueId !== venue?.id) invalid('Choose a setup belonging to the selected venue');
  return normalizeIncidentDraft({ schemaVersion: 1, id: newId(), venueId: venue?.id, setupId: setup?.id ?? null, kind, occurredAt: now(), note,
    context: { venue: { id: venue?.id, name: venue?.name }, setup: setup ? { id: setup.id, name: setup.name,
      boothId: setup.boothId ?? null, deckPositionId: setup.deckPositionId ?? null, supportConfigurationId: setup.supportConfigurationId ?? null } : null } });
}

function savedRecord(value) {
  try {
    object(value, RECORD_KEYS, 'Saved incident');
    if (value.origin !== 'operator') invalid('Incident origin must be operator');
    const draft = normalizeIncidentDraft(Object.fromEntries(DRAFT_KEYS.map(key => [key, value[key]])));
    return { ...draft, origin: 'operator', recordedAt: timestamp(value.recordedAt, 'Recorded time') };
  } catch (error) { throw new IncidentError('INCIDENT_STORAGE', `Saved incident is invalid: ${error.message}`); }
}
const submission = record => Object.fromEntries(DRAFT_KEYS.map(key => [key, record[key]]));
function retry(existing, draft) {
  if (JSON.stringify(submission(existing)) !== JSON.stringify(draft)) throw new IncidentError('INCIDENT_CONFLICT', 'This incident ID already belongs to a different report');
  return clone(existing);
}
function filterInput(input = {}) {
  object(input, ['venueId', 'setupId', 'limit'], 'Incident filter');
  const venueId = identifier(input.venueId, 'Venue ID', true), setupId = identifier(input.setupId, 'Setup ID', true);
  const limit = input.limit ?? INCIDENT_LIST_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > INCIDENT_MAX_LIMIT) invalid(`Incident limit must be 1–${INCIDENT_MAX_LIMIT}`);
  return { venueId, setupId, limit };
}
function listResult(value, filter) {
  try { object(value, ['items', 'total', 'limit', 'hasMore'], 'Incident history'); }
  catch (error) { throw new IncidentError('INCIDENT_STORAGE', error.message); }
  if (!Array.isArray(value.items) || value.items.length > filter.limit || value.limit !== filter.limit
      || !Number.isSafeInteger(value.total) || value.items.length !== Math.min(value.total, filter.limit) || value.hasMore !== (value.total > value.items.length)) {
    throw new IncidentError('INCIDENT_STORAGE', 'Incident history has invalid counts or limits');
  }
  const items = value.items.map(savedRecord);
  if (new Set(items.map(item => item.id)).size !== items.length || items.some(item => (filter.venueId && item.venueId !== filter.venueId) || (filter.setupId && item.setupId !== filter.setupId))) {
    throw new IncidentError('INCIDENT_STORAGE', 'Incident history does not match the requested context');
  }
  return { items, total: value.total, limit: filter.limit, hasMore: value.hasMore };
}
// Unicode scalar ordering matches SQLite's UTF-8 BINARY collation, without a locale-dependent tie-break.
function descendingText(a, b) {
  const left = Array.from(a, c => c.codePointAt(0)), right = Array.from(b, c => c.codePointAt(0));
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return right[i] - left[i];
  return right.length - left.length;
}
function errorOf(error) {
  if (error instanceof IncidentError) return error;
  const message = typeof error === 'string' ? error : error?.message || String(error);
  const match = /^(INCIDENT_[A-Z_]+):\s*([\s\S]*)$/.exec(message);
  return new IncidentError(match?.[1] || 'INCIDENT_ERROR', match?.[2] || message);
}

/** Append/list only. Each browser record has its own key; unrelated saves never rewrite one another. */
export function createVenueIncidentStore({ invoke, storage, catalog, now = () => new Date().toISOString() } = {}) {
  const bridge = () => invoke === undefined ? nativeInvoke() : invoke;
  const localStorage = () => {
    try {
      const value = storage === undefined ? globalThis.localStorage : storage;
      if (!value || typeof value.key !== 'function') throw new Error('Browser storage is unavailable');
      return value;
    } catch (error) { throw new IncidentError('INCIDENT_STORAGE', error.message); }
  };
  const keyFor = id => STORAGE_PREFIX + encodeURIComponent(id);
  const readAll = () => {
    try {
      const target = localStorage(), keys = Array.from({ length: target.length }, (_, index) => target.key(index)).filter(key => typeof key === 'string' && key.startsWith(STORAGE_PREFIX));
      return keys.map(key => {
        const row = savedRecord(JSON.parse(target.getItem(key)));
        if (key !== keyFor(row.id)) throw new Error('Incident key does not match its record');
        return row;
      });
    } catch (error) { throw new IncidentError('INCIDENT_STORAGE', `Incident history could not be read: ${error.message}`); }
  };
  const call = async (fn, command, args) => {
    try { return await fn(command, args); } catch (error) { throw errorOf(error); }
  };
  return {
    get native() { return Boolean(bridge()); },
    async save(input) {
      const draft = normalizeIncidentDraft(input), fn = bridge();
      if (fn) return retry(savedRecord(await call(fn, 'venue_incident_save', { input: draft })), draft);
      const previous = readAll().find(row => row.id === draft.id);
      if (previous) return retry(previous, draft);
      const selected = catalog ?? createCatalogStore({ invoke: null, storage: localStorage() });
      let venues, setups;
      try { [venues, setups] = await Promise.all([selected.list('venue'), draft.setupId ? selected.list('setup') : Promise.resolve([])]); }
      catch (error) { throw new IncidentError('INCIDENT_CONTEXT', `Could not read the selected context: ${error.message || error}`); }
      if (!Array.isArray(venues) || !venues.some(venue => venue.id === draft.venueId)
          || (draft.setupId && (!Array.isArray(setups) || !setups.some(setup => setup.id === draft.setupId && setup.venueId === draft.venueId)))) {
        throw new IncidentError('INCIDENT_CONTEXT', 'Choose an existing venue and a setup belonging to that venue');
      }
      // Another pending request may have committed while the catalog was loading.
      const current = readAll().find(row => row.id === draft.id);
      if (current) return retry(current, draft);
      const record = savedRecord({ ...draft, origin: 'operator', recordedAt: now() });
      try { localStorage().setItem(keyFor(draft.id), JSON.stringify(record)); }
      catch (error) { throw new IncidentError('INCIDENT_STORAGE', `Incident was not saved: ${error.message}`); }
      return clone(record);
    },
    async list(input = {}) {
      const filter = filterInput(input), fn = bridge();
      if (fn) return listResult(await call(fn, 'venue_incident_list', { filter }), filter);
      const rows = readAll().filter(row => (!filter.venueId || row.venueId === filter.venueId) && (!filter.setupId || row.setupId === filter.setupId))
        .sort((a, b) => descendingText(a.occurredAt, b.occurredAt) || descendingText(a.id, b.id));
      return { items: rows.slice(0, filter.limit), total: rows.length, limit: filter.limit, hasMore: rows.length > filter.limit };
    },
  };
}
