// Shared hours ledger helpers (FS-00 §4.8, §6.4) over the `asset_usage` table
// (migration 0006). Pure functions plus a thin bridge to the Rust commands
// usage_add / usage_list / usage_delete / usage_confirm.
//
// Entries accept camelCase or snake_case keys: { id, startedAt|started_at, hours,
// source, kind?, confirmed?, sessionId|session_id? }. Time is handled in integer
// milliseconds so sums of many small entries do not drift.

export const HOUR_MS = 3600000;
/** Higher wins an overlap: manual > djlog > deckchek > import. */
export const SOURCE_PRIORITY = Object.freeze({ manual: 4, djlog: 3, deckchek: 2, import: 1 });
export const KINDS = Object.freeze(['play', 'bench']);
export const MAX_ENTRY_HOURS = 24;
export const DEFAULT_CAP_HOURS = 12;
const MIN_PROPOSAL_MS = 60000; // sessions shorter than a minute are not worth a proposal

const pick = (o, camel, snake) => (o[camel] !== undefined ? o[camel] : o[snake]);

function toMs(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && v.trim()) return Date.parse(v);
  return NaN;
}

/** Normalise one ledger row; returns null when it cannot be counted. */
function normalize(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const startMs = toMs(pick(raw, 'startedAt', 'started_at'));
  const hours = typeof raw.hours === 'number' ? raw.hours : NaN;
  const pri = SOURCE_PRIORITY[raw.source];
  if (!Number.isFinite(startMs) || !Number.isFinite(hours) || hours <= 0 || hours > MAX_ENTRY_HOURS || !pri) return null;
  const durMs = Math.round(hours * HOUR_MS);
  if (durMs <= 0) return null;
  return {
    id: raw.id ?? `#${index}`,
    index,
    startMs,
    endMs: startMs + durMs,
    pri,
    source: raw.source,
    kind: raw.kind ?? 'play',
    confirmed: raw.confirmed === undefined || raw.confirmed === null ? true : raw.confirmed !== 0 && raw.confirmed !== false,
  };
}

/**
 * Resolve overlaps (FS-00 §6.4). Returns non-overlapping spans sorted by start:
 * { id, source, kind, startMs, endMs, hours }. Where entries overlap, the span of the
 * higher-priority source wins and lower-priority time is trimmed away; equal
 * priority overlaps are unioned (the earlier start owns the shared time).
 * Unconfirmed proposals are ignored unless `includeUnconfirmed`; `kind` filters first.
 */
export function mergeIntervals(entries, { includeUnconfirmed = false, kind = null } = {}) {
  const items = [];
  (Array.isArray(entries) ? entries : []).forEach((raw, i) => {
    const n = normalize(raw, i);
    if (!n) return;
    if (!includeUnconfirmed && !n.confirmed) return;
    if (kind && n.kind !== kind) return;
    items.push(n);
  });
  // Equal priority: earlier start first, then id, then input position -> deterministic.
  const better = (a, b) => a.pri !== b.pri ? a.pri > b.pri
    : a.startMs !== b.startMs ? a.startMs < b.startMs
      : String(a.id) !== String(b.id) ? String(a.id) < String(b.id) : a.index < b.index;

  const bounds = [...new Set(items.flatMap(it => [it.startMs, it.endMs]))].sort((a, b) => a - b);
  const byStart = [...items].sort((a, b) => a.startMs - b.startMs);
  const out = [];
  let active = [];
  let next = 0;
  for (let i = 0; i + 1 < bounds.length; i++) {
    const lo = bounds[i];
    const hi = bounds[i + 1];
    while (next < byStart.length && byStart[next].startMs <= lo) active.push(byStart[next++]);
    active = active.filter(it => it.endMs > lo);
    if (!active.length) continue;
    let best = active[0];
    for (const it of active) if (better(it, best)) best = it;
    const last = out[out.length - 1];
    if (last && last.item === best && last.endMs === lo) last.endMs = hi;
    else out.push({ item: best, startMs: lo, endMs: hi });
  }
  return out.map(({ item, startMs, endMs }) => ({
    id: item.id, source: item.source, kind: item.kind, startMs, endMs, hours: (endMs - startMs) / HOUR_MS,
  }));
}

/**
 * Total hours after priority resolution, optionally clipped to [since, until].
 * Clipping happens after resolution, so a baseline (e.g. the last stylus_replaced
 * event) can never resurrect time that a higher-priority entry trimmed.
 */
export function totalHours(entries, { since = null, until = null, includeUnconfirmed = false, kind = null } = {}) {
  const lo = since === null || since === undefined ? -Infinity : toMs(since);
  const hi = until === null || until === undefined ? Infinity : toMs(until);
  const from = Number.isNaN(lo) ? -Infinity : lo;
  const to = Number.isNaN(hi) ? Infinity : hi;
  let ms = 0;
  for (const s of mergeIntervals(entries, { includeUnconfirmed, kind })) {
    const a = Math.max(s.startMs, from);
    const b = Math.min(s.endMs, to);
    if (b > a) ms += b - a;
  }
  return ms / HOUR_MS;
}

/**
 * Turn recorded sessions into unconfirmed `asset_usage` proposals for one asset.
 * A session is { id, startedAt|started_at, endedAt|ended_at, assetIds?, source? }.
 * Sessions without an end, with a non-positive or sub-minute length, or already
 * represented in `existing` (by sessionId) are skipped. Hours are capped at `capHours`.
 */
export function proposeFromSessions(sessions, assetId, { capHours = DEFAULT_CAP_HOURS, existing = [] } = {}) {
  const cap = Number.isFinite(capHours) && capHours > 0 ? Math.min(capHours, MAX_ENTRY_HOURS) : DEFAULT_CAP_HOURS;
  const seen = new Set((Array.isArray(existing) ? existing : [])
    .map(x => (x && pick(x, 'sessionId', 'session_id')) || null).filter(Boolean));
  const out = [];
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || typeof s !== 'object') continue;
    const ids = s.assetIds ?? s.asset_ids;
    if (Array.isArray(ids) && !ids.includes(assetId)) continue;
    if (s.id !== undefined && s.id !== null && seen.has(s.id)) continue;
    const a = toMs(pick(s, 'startedAt', 'started_at'));
    const b = toMs(pick(s, 'endedAt', 'ended_at'));
    if (!Number.isFinite(a) || !Number.isFinite(b) || b - a < MIN_PROPOSAL_MS) continue;
    const raw = (b - a) / HOUR_MS;
    const capped = raw > cap;
    out.push({
      assetId,
      kind: 'play',
      startedAt: new Date(a).toISOString(),
      hours: Math.round(Math.min(raw, cap) * 10000) / 10000,
      source: SOURCE_PRIORITY[s.source] ? s.source : 'deckchek',
      sessionId: s.id ?? null,
      capped,
      confirmed: 0,
    });
  }
  return out.sort((x, y) => Date.parse(x.startedAt) - Date.parse(y.startedAt));
}

function validateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('usage entry must be an object');
  if (typeof input.assetId !== 'string' || !input.assetId) throw new Error('usage entry needs an assetId');
  if (!Number.isFinite(toMs(input.startedAt))) throw new Error('usage startedAt must be an ISO timestamp');
  if (typeof input.hours !== 'number' || !Number.isFinite(input.hours) || input.hours < 0 || input.hours > MAX_ENTRY_HOURS) {
    throw new Error(`usage hours must be between 0 and ${MAX_ENTRY_HOURS}`);
  }
  if (!SOURCE_PRIORITY[input.source]) throw new Error(`usage source must be one of ${Object.keys(SOURCE_PRIORITY).join(', ')}`);
  if (input.kind !== undefined && !KINDS.includes(input.kind)) throw new Error(`usage kind must be one of ${KINDS.join(', ')}`);
  return input;
}

const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;

/** Bridge to the Rust commands. Browser mode has no ledger: calls reject with a clear message. */
export function createUsageApi({ invoke = nativeInvoke() } = {}) {
  const need = () => {
    if (!invoke) throw new Error('The hours ledger needs the desktop app.');
    return invoke;
  };
  return {
    native: !!invoke,
    add: async input => need()('usage_add', { input: validateInput(input) }),
    list: async (assetId, { since = null } = {}) => need()('usage_list', { assetId, since }),
    delete: async id => need()('usage_delete', { id }),
    confirm: async id => need()('usage_confirm', { id }),
  };
}
