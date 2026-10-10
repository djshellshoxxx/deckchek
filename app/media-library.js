// Test-media library (FS-06): schema validation, built-in loading, expected values per test, timecode-format
// resolution and a browser-mode store. Pure logic, no DOM. See docs/MEDIA-PROFILE-SCHEMA.md.
// Timecode facts (carrier, phase convention, side lengths) are NOT stored in media profiles: they resolve through
// TIMECODE_FORMATS in app/timecode.js (single source of truth, confirmed against xwax timecoder.c).
import { TIMECODE_FORMATS, mergeFormats } from './timecode.js';

export const SCHEMA_VERSION = 1;
export const KINDS = ['test_record', 'timecode', 'tone_file'];
export const PURPOSES = ['reference_tone', 'speed_tone', 'sweep', 'tracking', 'anti_skate', 'wow_flutter', 'vta', 'balance', 'square_wave', 'noise', 'silence', 'other'];
export const LEVEL_UNITS = ['cm/s_rms', 'um_peak', 'db', 'dbfs'];
export const CONFIDENCE = ['confirmed', 'unverified'];
export const CHANNELS = ['L', 'R', 'both'];
export const LIMITS = { maxJsonBytes: 256 * 1024, maxTracks: 100, maxString: 500, maxSources: 20 };
/** Built-in nominal speed-tone list (3000 Hz and 3150 Hz records both exist; wrong nominal = ~5% error). */
export const DEFAULT_NOMINALS = [1000, 3000, 3150];
export const NEAR_NOMINAL_TOLERANCE = 0.01;
export const STORE_KEY = 'deckchek.media.v1';
export const UNVERIFIED_WARNING = 'Unverified — confirm on your disc';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACK_KEY = /^[A-Za-z0-9_-]{1,32}$/;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string';
const posNum = v => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Which media kinds each test (workflow id) can use. */
export const TEST_KINDS = { speed: ['test_record', 'tone_file', 'timecode'], cartridge: ['test_record', 'tone_file'], dvs: ['timecode'], timecode: ['timecode'] };

export function newCustomId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const h = n => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${h(3)}-${h(12)}`;
}

/** https only; media sources are shown, and opened only via the allowlisted opener (FS-07). */
const httpsUrl = u => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };

/**
 * Validate a media profile. mode 'builtin' (shipped file) or 'custom' (user data / import).
 * Returns {ok, errors:[{field, code, message}]}; code is stable for UI/tests.
 */
export function validateMediaProfile(p, { mode = 'custom', builtinIds = [] } = {}) {
  const errors = [];
  const err = (field, code, message) => errors.push({ field, code, message });
  if (!isObj(p)) { err('', 'type', 'profile must be an object'); return { ok: false, errors }; }
  if (p.schemaVersion !== SCHEMA_VERSION) err('schemaVersion', 'schema-version', `schemaVersion must be ${SCHEMA_VERSION}`);
  if (mode === 'builtin') {
    if (!isStr(p.id) || !KEBAB.test(p.id) || p.id.length > 64) err('id', 'id', 'id must be kebab-case, up to 64 characters');
  } else if (p.id != null) {
    if (!isStr(p.id) || !UUID.test(p.id)) err('id', 'id', 'custom ids are generated UUIDs');
  }
  if (mode === 'custom' && isStr(p.id) && builtinIds.includes(p.id)) err('id', 'id-collision', 'id collides with a built-in medium');
  if (!Number.isInteger(p.version) || p.version < 1) err('version', 'version', 'version must be an integer >= 1');
  if (!KINDS.includes(p.kind)) err('kind', 'enum', `kind must be one of ${KINDS.join(', ')}`);
  if (!isStr(p.name) || !p.name.trim()) err('name', 'required', 'name is required');
  if (p.manufacturer != null && !isStr(p.manufacturer)) err('manufacturer', 'type', 'manufacturer must be text');
  if (p.playbackRpm != null && (!posNum(p.playbackRpm) || p.playbackRpm > 100)) err('playbackRpm', 'range', 'playbackRpm must be > 0 and <= 100');
  if (!CONFIDENCE.includes(p.confidence)) err('confidence', 'enum', `confidence must be ${CONFIDENCE.join(' or ')}`);
  // string length cap on every text field we know about
  for (const k of ['name', 'manufacturer', 'rias', 'notes', 'productProfileId']) if (isStr(p[k]) && p[k].length > LIMITS.maxString) err(k, 'too-long', `${k} is longer than ${LIMITS.maxString} characters`);

  const tracks = p.tracks;
  if (!Array.isArray(tracks)) err('tracks', 'type', 'tracks must be an array');
  else {
    if (tracks.length > LIMITS.maxTracks) err('tracks', 'too-many', `at most ${LIMITS.maxTracks} tracks`);
    const seen = new Set();
    tracks.slice(0, LIMITS.maxTracks).forEach((t, i) => {
      const f = k => `tracks[${i}].${k}`;
      if (!isObj(t)) { err(`tracks[${i}]`, 'type', 'track must be an object'); return; }
      if (!isStr(t.key) || !TRACK_KEY.test(t.key)) err(f('key'), 'key', 'key must be 1-32 letters, digits, - or _');
      else if (seen.has(t.key)) err(f('key'), 'duplicate', `duplicate track key "${t.key}"`);
      else seen.add(t.key);
      if (!PURPOSES.includes(t.purpose)) err(f('purpose'), 'enum', `purpose must be one of ${PURPOSES.join(', ')}`);
      if (t.side != null && (!isStr(t.side) || t.side.length > 8)) err(f('side'), 'type', 'side must be short text');
      if (t.trackNo != null && (!Number.isInteger(t.trackNo) || t.trackNo < 1)) err(f('trackNo'), 'range', 'trackNo must be an integer >= 1');
      if (t.frequencyHz != null && (!posNum(t.frequencyHz) || t.frequencyHz > 192000)) err(f('frequencyHz'), 'range', 'frequencyHz must be > 0 and <= 192000');
      if (t.level != null) {
        if (!isObj(t.level) || typeof t.level.value !== 'number' || !Number.isFinite(t.level.value)) err(f('level.value'), 'type', 'level.value must be a number');
        if (!isObj(t.level) || !LEVEL_UNITS.includes(t.level.unit)) err(f('level.unit'), 'enum', `level.unit must be one of ${LEVEL_UNITS.join(', ')}`);
      }
      if (t.durationS != null && (typeof t.durationS !== 'number' || !Number.isFinite(t.durationS) || t.durationS < 0)) err(f('durationS'), 'range', 'durationS must be >= 0');
      if (t.channel != null && !CHANNELS.includes(t.channel)) err(f('channel'), 'enum', `channel must be one of ${CHANNELS.join(', ')}`);
      if (t.confidence != null && !CONFIDENCE.includes(t.confidence)) err(f('confidence'), 'enum', `confidence must be ${CONFIDENCE.join(' or ')}`);
      if (t.source != null && (!isStr(t.source) || !httpsUrl(t.source))) err(f('source'), 'url', 'source must be an https URL');
      if (mode === 'builtin' && t.confidence === 'confirmed' && !t.source) err(f('source'), 'provenance', 'a confirmed built-in track needs a source URL');
      for (const k of ['label', 'notes', 'source']) if (isStr(t[k]) && t[k].length > LIMITS.maxString) err(f(k), 'too-long', `${k} is longer than ${LIMITS.maxString} characters`);
    });
  }

  const tc = p.timecode;
  if (p.kind === 'timecode') {
    if (!isObj(tc) || !isStr(tc.formatName) || !tc.formatName.trim()) err('timecode.formatName', 'required', 'timecode media need timecode.formatName');
    else {
      if (tc.formatName.length > LIMITS.maxString) err('timecode.formatName', 'too-long', 'formatName is too long');
      if (tc.carrierHz != null && (!posNum(tc.carrierHz) || tc.carrierHz > 192000)) err('timecode.carrierHz', 'range', 'carrierHz must be > 0');
      if (tc.atRpm != null && (!posNum(tc.atRpm) || tc.atRpm > 100)) err('timecode.atRpm', 'range', 'atRpm must be > 0');
      if (mode === 'builtin' && (tc.carrierHz != null || tc.sides != null || tc.phaseSign != null)) err('timecode', 'duplicated-format-fact', 'built-in media must not duplicate carrier/phase/side facts; they resolve through TIMECODE_FORMATS');
      if (mode === 'builtin' && !TIMECODE_FORMATS.some(f => f.name === tc.formatName)) err('timecode.formatName', 'unknown-format', `"${tc.formatName}" is not in TIMECODE_FORMATS`);
    }
  } else if (tc != null) err('timecode', 'not-timecode', 'timecode is only allowed on kind "timecode"');

  if (p.sources != null) {
    if (!Array.isArray(p.sources) || p.sources.length > LIMITS.maxSources) err('sources', 'type', `sources must be an array of up to ${LIMITS.maxSources}`);
    else p.sources.forEach((s, i) => {
      if (!isObj(s) || !isStr(s.title) || !s.title.trim()) err(`sources[${i}].title`, 'required', 'source title is required');
      else if (s.title.length > LIMITS.maxString) err(`sources[${i}].title`, 'too-long', 'source title is too long');
      if (isObj(s) && (!isStr(s.url) || !httpsUrl(s.url))) err(`sources[${i}].url`, 'url', 'source url must be https');
    });
  }
  if (mode === 'builtin' && p.confidence === 'confirmed' && !(Array.isArray(p.sources) && p.sources.some(s => s?.verified === true))) err('sources', 'provenance', 'a confirmed built-in medium needs at least one verified source');
  return { ok: errors.length === 0, errors };
}

export const MIGRATIONS = {}; // fromVersion -> (profile) => profile at fromVersion+1

/** Bring a stored/imported profile up to the current schema. Never mutates the input. */
export function migrateProfile(profile, { target = SCHEMA_VERSION, migrations = MIGRATIONS } = {}) {
  if (!isObj(profile)) return { ok: false, error: 'profile must be an object' };
  let p = { ...profile };
  let v = Number.isInteger(p.schemaVersion) ? p.schemaVersion : 1;
  if (v > target) return { ok: false, error: `profile schemaVersion ${v} is newer than this app supports (${target})` };
  while (v < target) {
    const step = migrations[v];
    if (!step) return { ok: false, error: `no migration from schemaVersion ${v}` };
    p = { ...step(p), schemaVersion: v + 1 };
    v += 1;
  }
  return { ok: true, profile: p };
}

/** Parse + validate imported JSON text. Custom ids are always regenerated unless they are an existing custom id being edited. */
export function prepareImport(text, { builtinIds = [], existingCustomIds = [], makeId = newCustomId } = {}) {
  const fail = (field, code, message) => ({ ok: false, errors: [{ field, code, message }] });
  if (!isStr(text)) return fail('', 'type', 'import must be JSON text');
  if (new TextEncoder().encode(text).length > LIMITS.maxJsonBytes) return fail('', 'too-large', `import is larger than ${LIMITS.maxJsonBytes / 1024} KB`);
  let raw;
  try { raw = JSON.parse(text); } catch (e) { return fail('', 'json', `not valid JSON: ${e.message}`); }
  const m = migrateProfile(raw);
  if (!m.ok) return fail('schemaVersion', 'schema-version', m.error);
  const v = validateMediaProfile({ ...m.profile, id: undefined }, { mode: 'custom', builtinIds });
  const collide = isStr(m.profile.id) && builtinIds.includes(m.profile.id);
  const errors = [...(collide ? [{ field: 'id', code: 'id-collision', message: 'id collides with a built-in medium' }] : []), ...v.errors];
  if (errors.length) return { ok: false, errors };
  const id = existingCustomIds.includes(m.profile.id) ? m.profile.id : makeId();
  return { ok: true, profile: { ...m.profile, id } };
}

const entryOf = (profile, source, extra = {}) => ({ id: profile.id, source, kind: profile.kind, name: profile.name, version: profile.version, owned: false, retired: false, profile, ...extra });

/** Load built-ins from index.json + profiles/*.json (same pattern as loadProfiles). Bad files are reported, never thrown. */
export async function loadBuiltInMedia(fetchJson = defaultFetchJson, { base = './media/' } = {}) {
  const fetcher = typeof fetchJson === 'function' ? fetchJson : fetchJson?.fetchJson || defaultFetchJson;
  const index = await fetcher(`${base}index.json`);
  const ids = Array.isArray(index?.profiles) ? index.profiles : [];
  const ok = [], problems = [];
  await Promise.all(ids.map(async (id, order) => {
    try {
      const p = await fetcher(`${base}profiles/${id}.json`);
      const v = validateMediaProfile(p, { mode: 'builtin' });
      const errors = v.errors.map(e => `${e.field}: ${e.message}`);
      if (p?.id !== id) errors.push(`file ${id}.json declares id "${p?.id}"`);
      if (errors.length) problems.push({ id, errors }); else ok.push({ order, p });
    } catch (e) { problems.push({ id, errors: [`could not load: ${e?.message || e}`] }); }
  }));
  ok.sort((a, b) => a.order - b.order);
  return { media: ok.map(x => entryOf(x.p, 'builtin')), problems };
}
async function defaultFetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** Built-ins plus custom entries; a custom entry whose id collides with a built-in is dropped (built-ins win). */
export function mergeCustom(builtin = [], custom = []) {
  const ids = new Set(builtin.map(m => m.id));
  return [...builtin, ...custom.filter(c => c && !ids.has(c.id))];
}

/** Filter + sort a merged list. Owned media float to the top, then by name. kind: one of KINDS, 'custom', or 'all'. */
export function listMedia(entries = [], { kind = 'all', owned = false, query = '', includeRetired = false } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const out = entries.filter(m => {
    if (m.retired && !includeRetired) return false;
    if (kind === 'custom' ? m.source !== 'custom' : kind !== 'all' && kind && m.kind !== kind) return false;
    if (owned && !m.owned) return false;
    if (!q) return true;
    const p = m.profile || {};
    return [m.name, p.manufacturer, p.timecode?.formatName, ...(p.tracks || []).map(t => t.label)].some(s => String(s ?? '').toLowerCase().includes(q));
  });
  return out.sort((a, b) => (b.owned ? 1 : 0) - (a.owned ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
}

/** Resolve the TIMECODE_FORMATS-compatible format object for a timecode medium (null if unknown). */
export function toTimecodeFormat(media, { formats } = {}) {
  const p = media?.profile || media;
  if (p?.kind !== 'timecode' || !p.timecode?.formatName) return null;
  const tc = p.timecode;
  // Custom media may supply their own carrier; built-ins never do (validated).
  const extra = Number.isFinite(tc.carrierHz) ? [{ name: tc.formatName, carrierHz: tc.carrierHz, ...(tc.atRpm ? { atRpm: tc.atRpm } : {}), vendor: p.manufacturer ?? null }] : [];
  const all = formats ? [...formats] : mergeFormats(extra);
  const n = tc.formatName.toLowerCase();
  const hit = all.find(f => f.name.toLowerCase() === n);
  return hit ? { ...hit } : null;
}

const worst = (...c) => (c.some(x => x !== 'confirmed') ? 'unverified' : 'confirmed');
const fmtNum = n => String(Number(n.toFixed(3)));
function levelText(l) {
  if (!l) return null;
  return l.unit === 'cm/s_rms' ? `${fmtNum(l.value)} cm/s` : l.unit === 'um_peak' ? `${fmtNum(l.value)} µm peak` : `${fmtNum(l.value)} ${l.unit === 'dbfs' ? 'dBFS' : 'dB'}`;
}

/**
 * Expected values a medium (+ track) supplies for a test (workflow id). Returns null when the medium does not apply
 * to the test. Otherwise {referenceHz?, levelCmPerS?, carrierHz?, nominalRpm?, formatName?, trackNo?, confidence,
 * unverified, warning, label}. Unknown values stay undefined; nothing is invented.
 */
export function expectedValuesFor(media, trackId, testId) {
  const p = media?.profile || media;
  if (!p || !KINDS.includes(p.kind)) return null;
  if (testId && TEST_KINDS[testId] && !TEST_KINDS[testId].includes(p.kind)) return null;
  const out = {};
  let confidence = p.confidence === 'confirmed' ? 'confirmed' : 'unverified';
  const parts = [`From ${p.name}`];
  if (p.kind === 'timecode') {
    const fmt = toTimecodeFormat(p);
    if (fmt) {
      out.formatName = fmt.name; out.carrierHz = fmt.carrierHz; out.nominalRpm = fmt.atRpm;
      if (testId === 'speed') out.referenceHz = fmt.carrierHz;
      confidence = worst(confidence, fmt.confidence);
      parts.push(`${fmt.carrierHz} Hz carrier`);
    } else { out.formatName = p.timecode?.formatName; confidence = 'unverified'; }
  } else {
    const t = trackId != null ? (p.tracks || []).find(x => x.key === trackId) : null;
    if (trackId != null && !t) return null;
    if (p.playbackRpm) out.nominalRpm = p.playbackRpm;
    if (t) {
      confidence = worst(confidence, t.confidence ?? p.confidence);
      parts.push(t.trackNo ? `track ${t.trackNo}` : (t.label || t.key));
      if (Number.isFinite(t.frequencyHz)) { out.referenceHz = t.frequencyHz; parts.push(`${fmtNum(t.frequencyHz)} Hz`); }
      if (t.level) { if (t.level.unit === 'cm/s_rms') out.levelCmPerS = t.level.value; const lt = levelText(t.level); if (lt) parts.push(lt); }
      if (t.trackNo) out.trackNo = t.trackNo;
    }
  }
  out.confidence = confidence;
  out.unverified = confidence !== 'confirmed';
  out.warning = out.unverified ? (p.kind === 'timecode' ? 'Unverified — confirm with your control media' : UNVERIFIED_WARNING) : null;
  out.label = parts.join(' · ');
  return out;
}

/** Prefill precedence (6b): user override > medium track > device profile referenceHz > global default. */
export function prefillReferenceHz({ override, expected, deviceReferenceHz, globalDefault = 1000 } = {}) {
  const ok = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (ok(override)) return { hz: override, source: 'user' };
  if (ok(expected?.referenceHz)) return { hz: expected.referenceHz, source: 'medium' };
  if (ok(deviceReferenceHz)) return { hz: deviceReferenceHz, source: 'device' };
  return { hz: globalDefault, source: 'default' };
}

/** "Looks like a 3150 Hz record" when the measurement is within tolerance of a different nominal than the selected one. */
export function suggestNominal(measuredHz, { currentHz, candidates = DEFAULT_NOMINALS, tolerance = NEAR_NOMINAL_TOLERANCE } = {}) {
  if (!posNum(measuredHz)) return null;
  const near = (a, b) => Math.abs(a / b - 1) <= tolerance;
  if (posNum(currentHz) && near(measuredHz, currentHz)) return null;
  const hit = candidates.filter(c => c !== currentHz && near(measuredHz, c)).sort((a, b) => Math.abs(measuredHz / a - 1) - Math.abs(measuredHz / b - 1))[0];
  return hit ? { hz: hit, message: `Looks like a ${hit} Hz record — switch?` } : null;
}

/** Level conversion: cm/s RMS to dB re 5 cm/s. */
export const cmPerSToDb = v => 20 * Math.log10(v / 5);

/** Payload for media_profiles_sync: the profile plus resolved timecode facts (Rust cannot read timecode.js). */
export function profilesForSync(entries = []) {
  return entries.map(e => {
    const p = e.profile || e;
    const fmt = p.kind === 'timecode' ? toTimecodeFormat(p) : null;
    if (!fmt) return { ...p };
    return { ...p, timecodeFacts: { formatName: fmt.name, vendor: fmt.vendor ?? null, carrierHz: fmt.carrierHz, atRpm: fmt.atRpm, confidence: fmt.confidence, sides: (fmt.sides || []).map(s => ({ label: s.label, durationSec: s.durationSec })) } };
  });
}

// ---------- browser-mode store (parity with src-tauri/src/media.rs) ----------
export function emptyMediaState() { return { builtin: {}, custom: {}, owned: {} }; }
export function loadMediaState(storage) {
  try {
    const s = JSON.parse(storage?.getItem(STORE_KEY) || 'null');
    if (s && isObj(s)) return { ...emptyMediaState(), ...s };
  } catch { /* fall through */ }
  return emptyMediaState();
}
export function saveMediaState(storage, state) { try { storage?.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* quota/private mode */ } }

/** Upsert built-ins, retire the ones no longer shipped (an empty list retires nothing). Custom rows are never touched. */
export function syncBuiltInsLocal(state, profiles) {
  const res = { inserted: 0, updated: 0, unchanged: 0, retired: 0 };
  const shipped = new Set();
  for (const raw of profiles || []) {
    const { timecodeFacts, ...p } = raw;
    shipped.add(p.id);
    const prev = state.builtin[p.id];
    const json = JSON.stringify(p);
    if (!prev) res.inserted++; else if (prev.json !== json || prev.retired) res.updated++; else res.unchanged++;
    state.builtin[p.id] = { json, retired: false };
  }
  if (shipped.size) for (const [id, row] of Object.entries(state.builtin)) if (!shipped.has(id) && !row.retired) { row.retired = true; res.retired++; }
  return res;
}

export function listLocal(state, { includeRetired = false } = {}) {
  const builtin = Object.entries(state.builtin).filter(([, r]) => includeRetired || !r.retired).map(([id, r]) => entryOf(JSON.parse(r.json), 'builtin', { owned: !!state.owned[id], retired: !!r.retired }));
  const custom = Object.values(state.custom).map(p => entryOf(p, 'custom', { owned: !!state.owned[p.id] }));
  return mergeCustom(builtin, custom);
}

/**
 * Async facade used by the UI. Native mode calls the Rust commands through `invoke`; otherwise a localStorage state
 * (key deckchek.media.v1) gives the same API.
 */
export function createMediaStore({ invoke = null, storage = null, now = () => new Date().toISOString() } = {}) {
  const native = typeof invoke === 'function';
  let state = native ? null : loadMediaState(storage);
  const persist = () => { if (!native) saveMediaState(storage, state); };
  let builtinIds = [];
  return {
    native,
    async syncBuiltIns(entries) {
      builtinIds = entries.map(e => e.id);
      const profiles = profilesForSync(entries);
      if (native) return invoke('media_profiles_sync', { profiles });
      const r = syncBuiltInsLocal(state, profiles); persist(); return r;
    },
    async list(opts = {}) {
      if (native) { const rows = await invoke('media_list', { includeRetired: !!opts.includeRetired }); return rows.map(r => ({ ...r, profile: r.profile })); }
      return listLocal(state, opts);
    },
    async saveCustom(profile) {
      const existing = native ? (await invoke('media_list', { includeRetired: false })).filter(r => r.source === 'custom').map(r => r.id) : Object.keys(state.custom);
      const v = validateMediaProfile({ ...profile, id: existing.includes(profile?.id) ? profile.id : undefined }, { mode: 'custom', builtinIds });
      if (isStr(profile?.id) && builtinIds.includes(profile.id)) v.errors.unshift({ field: 'id', code: 'id-collision', message: 'id collides with a built-in medium' });
      if (v.errors.length) return { ok: false, errors: v.errors };
      if (native) return { ok: true, ...(await invoke('media_custom_save', { profile })) };
      const id = existing.includes(profile.id) ? profile.id : newCustomId();
      state.custom[id] = { ...profile, id, updatedAt: now() }; persist();
      return { ok: true, id };
    },
    async deleteCustom(id) {
      if (native) return invoke('media_custom_delete', { id });
      delete state.custom[id]; delete state.owned[id]; persist();
    },
    async setOwned(mediaId, owned) {
      if (native) return invoke('media_owned_set', { mediaId, owned: !!owned });
      if (owned) state.owned[mediaId] = true; else delete state.owned[mediaId];
      persist();
    },
    exportCustom(profile) { const { updatedAt, ...p } = profile; return `${JSON.stringify(p, null, 2)}\n`; },
  };
}
