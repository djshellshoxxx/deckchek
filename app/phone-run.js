// DeckChek Mobile result format v1 (FS-30 §5): build, hash, split into QR frames, validate and turn into a
// History run. Pure module, no DOM and no I/O. It is shared on purpose: tools/build-mobile.mjs copies it
// (with core.js, canonical-json.js and sha256.js) into mobile/vendor/, so the phone that writes an export and
// the desktop that reads it run the same code.
//
// Integrity, not authenticity: `sha256` detects accidental damage and casual edits. Anyone can recompute it,
// so a matching hash proves nothing about who made the file.
//
// Hash input. FS-00 canonical JSON only allows integers, but measurements are fractional. The hash is taken over
// canonicalJson(hashView(export without `sha256`)), where hashView() replaces every non-integer number by its
// shortest round-trip decimal string (JavaScript `String(n)`). JSON.parse(String(n)) gives n back, so the phone
// and the desktop derive the same text for the same file.

import { canonicalJson } from './canonical-json.js';
import { sha256HexSync } from './sha256.js';
import { normalizeMeasurement } from './core.js';

export const FORMAT = 'deckchek-mobile';
export const VERSION = 1;
export const FILE_EXTENSION = '.deckchek-mobile.json';
export const MAX_BYTES = 1_000_000;
export const MAX_MEASUREMENTS = 200;
export const MAX_NOTES = 2000;
/** A payload up to this many UTF-8 bytes is one plain-JSON QR; larger ones become numbered frames. */
export const QR_SINGLE_MAX_BYTES = 2000;
export const QR_FRAME_BYTES = 1100;
export const FRAME_PREFIX = 'DCKM1';

const LIMITS = { app: 64, userAgent: 300, nickname: 120, serial: 80, metricId: 64, label: 120, unit: 24, origin: 24, flag: 40 };
const METRIC_ID = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,3})?Z$/;
const HEX64 = /^[0-9a-f]{64}$/;
const MIC_FLAGS = ['echoCancellation', 'noiseSuppression', 'autoGainControl'];
const utf8Length = s => new TextEncoder().encode(s).length;

// ---------------------------------------------------------------------------- hashing

/** Copy of `value` with every non-integer finite number replaced by its decimal string (see file header). */
export function hashView(value) {
  if (typeof value === 'number') return Number.isFinite(value) && !Number.isInteger(value) ? String(value) : value;
  if (Array.isArray(value)) return value.map(hashView);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = hashView(value[key]);
    return out;
  }
  return value;
}

/** Lowercase-hex SHA-256 of an export object, ignoring its own `sha256` field. Throws on values canonical JSON refuses. */
export function exportHash(exportObject) {
  const { sha256: _ignored, ...rest } = exportObject;
  return sha256HexSync(canonicalJson(hashView(rest)));
}

// ---------------------------------------------------------------------------- building

const cleanText = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const finite = v => typeof v === 'number' && Number.isFinite(v);

/**
 * Build a v1 export. `measurements` use the core.js normalizeMeasurement shape. Unknown fields are dropped and
 * limits applied, so what comes out always passes parsePhoneRun.
 */
export function buildExport({ createdAt = new Date().toISOString(), app = 'mobile/0.1.0', device = {}, assetHint = {}, measurements = [], notes = '' } = {}) {
  const micFlags = {};
  for (const k of MIC_FLAGS) if (typeof device.micFlags?.[k] === 'boolean') micFlags[k] = device.micFlags[k];
  const body = {
    format: FORMAT,
    version: VERSION,
    createdAt,
    app: cleanText(app, LIMITS.app),
    device: {
      userAgent: cleanText(device.userAgent, LIMITS.userAgent) || null,
      sampleRate: finite(device.sampleRate) ? device.sampleRate : null,
      micFlags,
    },
    assetHint: { nickname: cleanText(assetHint.nickname, LIMITS.nickname) || null, serial: cleanText(assetHint.serial, LIMITS.serial) || null },
    measurements: measurements.slice(0, MAX_MEASUREMENTS).map(m => {
      const n = normalizeMeasurement({ ...m, origin: m.origin || 'measured' });
      return {
        metricId: n.metricId, label: cleanText(n.label, LIMITS.label), value: n.value, unit: cleanText(n.unit, LIMITS.unit), origin: n.origin,
        confidence: finite(n.confidence) ? n.confidence : 1, uncertainty: finite(n.uncertainty) ? n.uncertainty : null,
        ...(n.qualityFlags?.length ? { qualityFlags: n.qualityFlags.map(f => cleanText(String(f), LIMITS.flag)).filter(Boolean).slice(0, 8) } : {}),
      };
    }),
    notes: cleanText(notes, MAX_NOTES),
  };
  return { ...body, sha256: exportHash(body) };
}

/** Compact JSON text of an export (what the file and the QR carry). */
export const serializeExport = exportObject => JSON.stringify(exportObject);

// ---------------------------------------------------------------------------- QR frames

/** Split `json` into QR payloads: one plain-JSON string when it fits, else numbered `DCKM1/i/n/id/chunk` frames. */
export function toQrFrames(json, { frameBytes = QR_FRAME_BYTES } = {}) {
  if (typeof json !== 'string') throw new TypeError('toQrFrames: json must be a string');
  if (utf8Length(json) <= QR_SINGLE_MAX_BYTES) return [json];
  const id = sha256HexSync(json).slice(0, 8);
  const chunks = [];
  let cur = '', size = 0;
  for (const ch of json) { // by code point, so a character is never split
    const b = utf8Length(ch);
    if (size + b > frameBytes) { chunks.push(cur); cur = ''; size = 0; }
    cur += ch; size += b;
  }
  if (cur) chunks.push(cur);
  return chunks.map((c, i) => `${FRAME_PREFIX}/${i + 1}/${chunks.length}/${id}/${c}`);
}

const FRAME = new RegExp(`^${FRAME_PREFIX}/(\\d{1,3})/(\\d{1,3})/([0-9a-f]{8})/(.*)$`, 's');

/** True when `text` looks like QR frames rather than a JSON document. */
export const looksLikeFrames = text => typeof text === 'string' && text.trimStart().startsWith(`${FRAME_PREFIX}/`);

/**
 * Reassemble frames given as an array or as pasted text (one frame per line, any order, repeats ignored).
 * Returns {ok, json?, error?, missing?}.
 */
export function joinQrFrames(input) {
  const lines = (Array.isArray(input) ? input : String(input ?? '').split(/\r?\n/)).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, error: 'No QR text to read.' };
  const parts = new Map();
  let total = null, id = null;
  for (const line of lines) {
    const m = FRAME.exec(line);
    if (!m) return { ok: false, error: 'A line is not a DeckChek Mobile QR frame. Paste one frame per line.' };
    const i = Number(m[1]), n = Number(m[2]);
    if (n < 2 || i < 1 || i > n) return { ok: false, error: `Frame ${i} of ${n} is not valid.` };
    if (total != null && (n !== total || m[3] !== id)) return { ok: false, error: 'These frames come from different exports. Paste frames of one export only.' };
    total = n; id = m[3];
    if (parts.has(i) && parts.get(i) !== m[4]) return { ok: false, error: `Frame ${i} appears twice with different content.` };
    parts.set(i, m[4]);
  }
  const missing = [];
  for (let i = 1; i <= total; i++) if (!parts.has(i)) missing.push(i);
  if (missing.length) return { ok: false, error: `Missing frame${missing.length > 1 ? 's' : ''} ${missing.join(', ')} of ${total}.`, missing };
  const json = Array.from({ length: total }, (_, k) => parts.get(k + 1)).join('');
  if (sha256HexSync(json).slice(0, 8) !== id) return { ok: false, error: 'The frames do not add up to the export they claim to be (a frame is damaged).' };
  return { ok: true, json };
}

// ---------------------------------------------------------------------------- validation

function str(errors, path, v, max, { required = false, nullable = true } = {}) {
  if (v == null) { if (required) errors.push(`${path} is required`); return nullable ? null : ''; }
  if (typeof v !== 'string') { errors.push(`${path} must be text`); return null; }
  if (v.length > max) { errors.push(`${path} is longer than ${max} characters`); return null; }
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ');
}

function validateMeasurement(m, i, errors) {
  const p = `measurements[${i}]`;
  if (!m || typeof m !== 'object' || Array.isArray(m)) { errors.push(`${p} must be an object`); return null; }
  if (typeof m.metricId !== 'string' || !METRIC_ID.test(m.metricId)) errors.push(`${p}.metricId is missing or malformed`);
  if (!finite(m.value)) errors.push(`${p}.value must be a finite number`);
  const label = str(errors, `${p}.label`, m.label, LIMITS.label) ?? '';
  const unit = str(errors, `${p}.unit`, m.unit, LIMITS.unit) ?? '';
  const origin = str(errors, `${p}.origin`, m.origin, LIMITS.origin) || 'measured';
  let confidence = 1;
  if (m.confidence != null) { if (!finite(m.confidence) || m.confidence < 0 || m.confidence > 1) errors.push(`${p}.confidence must be between 0 and 1`); else confidence = m.confidence; }
  let uncertainty = null;
  if (m.uncertainty != null) { if (!finite(m.uncertainty) || m.uncertainty < 0) errors.push(`${p}.uncertainty must be a finite number >= 0`); else uncertainty = m.uncertainty; }
  let qualityFlags = [];
  if (m.qualityFlags != null) {
    if (!Array.isArray(m.qualityFlags) || m.qualityFlags.length > 8 || m.qualityFlags.some(f => typeof f !== 'string' || f.length > LIMITS.flag)) errors.push(`${p}.qualityFlags must be at most 8 short texts`);
    else qualityFlags = m.qualityFlags.slice();
  }
  return normalizeMeasurement({ metricId: m.metricId, label, value: m.value, unit, origin, confidence, uncertainty, qualityFlags });
}

/**
 * Validate an already parsed export. Returns {ok, run, errors, warnings, hashOk}; `run` is a fresh normalized copy
 * (unknown fields dropped), present only when ok. A missing or mismatching hash is a warning, never a block.
 */
export function validatePhoneRun(data) {
  const errors = [], warnings = [];
  const fail = () => ({ ok: false, run: null, errors, warnings, hashOk: null });
  if (!data || typeof data !== 'object' || Array.isArray(data)) { errors.push('This is not a DeckChek Mobile export.'); return fail(); }
  if (data.format !== FORMAT) { errors.push('This is not a DeckChek Mobile export (format is not "deckchek-mobile").'); return fail(); }
  if (!Number.isInteger(data.version) || data.version < 1) { errors.push('The export has no valid version number.'); return fail(); }
  if (data.version > VERSION) { errors.push('Export is from a newer DeckChek Mobile. Update DeckChek to read it.'); return fail(); }
  if (typeof data.createdAt !== 'string' || !ISO.test(data.createdAt) || Number.isNaN(Date.parse(data.createdAt))) errors.push('createdAt must be a UTC ISO timestamp like 2026-10-14T09:30:00Z');
  const app = str(errors, 'app', data.app, LIMITS.app) ?? '';
  const dev = data.device == null ? {} : data.device;
  if (typeof dev !== 'object' || Array.isArray(dev)) errors.push('device must be an object');
  const userAgent = typeof dev === 'object' ? str(errors, 'device.userAgent', dev.userAgent, LIMITS.userAgent) : null;
  let sampleRate = null;
  if (dev && dev.sampleRate != null) { if (!finite(dev.sampleRate) || dev.sampleRate < 8000 || dev.sampleRate > 384000) errors.push('device.sampleRate must be between 8000 and 384000'); else sampleRate = dev.sampleRate; }
  const micFlags = {};
  if (dev && dev.micFlags != null) {
    if (typeof dev.micFlags !== 'object' || Array.isArray(dev.micFlags)) errors.push('device.micFlags must be an object');
    else for (const k of MIC_FLAGS) if (dev.micFlags[k] != null) { if (typeof dev.micFlags[k] !== 'boolean') errors.push(`device.micFlags.${k} must be true or false`); else micFlags[k] = dev.micFlags[k]; }
  }
  const hint = data.assetHint == null ? {} : data.assetHint;
  if (typeof hint !== 'object' || Array.isArray(hint)) errors.push('assetHint must be an object');
  const assetHint = { nickname: typeof hint === 'object' ? str(errors, 'assetHint.nickname', hint.nickname, LIMITS.nickname) : null, serial: typeof hint === 'object' ? str(errors, 'assetHint.serial', hint.serial, LIMITS.serial) : null };
  let measurements = [];
  if (!Array.isArray(data.measurements) || !data.measurements.length) errors.push('measurements must be a list with at least one entry');
  else if (data.measurements.length > MAX_MEASUREMENTS) errors.push(`measurements has more than ${MAX_MEASUREMENTS} entries`);
  else measurements = data.measurements.map((m, i) => validateMeasurement(m, i, errors));
  const notes = str(errors, 'notes', data.notes, MAX_NOTES) ?? '';
  if (data.sha256 != null && (typeof data.sha256 !== 'string' || !HEX64.test(data.sha256))) errors.push('sha256 must be 64 lowercase hex characters');
  if (errors.length) return fail();

  let hashOk = null;
  if (data.sha256 == null) warnings.push('This export has no hash, so damage cannot be detected.');
  else {
    try {
      hashOk = exportHash(data) === data.sha256;
      if (!hashOk) warnings.push('The hash does not match: the file was changed or damaged after it was exported. Check the numbers before you import.');
    } catch {
      warnings.push('The hash could not be checked (the file holds a number outside the safe range).');
    }
  }
  const run = { format: FORMAT, version: data.version, createdAt: data.createdAt, app, device: { userAgent, sampleRate, micFlags }, assetHint, measurements, notes, sha256: data.sha256 ?? null };
  return { ok: true, run, errors, warnings, hashOk };
}

/**
 * Parse pasted or loaded text: a JSON export, or QR frames (one per line). Returns the validatePhoneRun shape;
 * `errors` is never empty when `ok` is false.
 */
export function parsePhoneRun(text) {
  const bad = message => ({ ok: false, run: null, errors: [message], warnings: [], hashOk: null });
  if (typeof text !== 'string') return bad('Nothing to read.');
  if (text.length > MAX_BYTES || utf8Length(text) > MAX_BYTES) return bad('The export is larger than 1 MB, so DeckChek will not read it.');
  let t = text.replace(/^\uFEFF/, '').trim();
  if (!t) return bad('Paste the export text or choose a .deckchek-mobile.json file.');
  if (looksLikeFrames(t)) {
    const joined = joinQrFrames(t);
    if (!joined.ok) return bad(joined.error);
    t = joined.json;
  }
  let data;
  try { data = JSON.parse(t); } catch { return bad('The text is not valid JSON. Copy the whole export, from the first { to the last }.'); }
  return validatePhoneRun(data);
}

// ---------------------------------------------------------------------------- History run

/** Short label for the capturing phone, from the user agent (never the full string). */
export function describeDevice(run) {
  const ua = run?.device?.userAgent || '';
  const model = /\(([^)]*)\)/.exec(ua)?.[1]?.split(';').map(s => s.trim()).filter(s => s && !/^(U|Linux|wv|Mobile)$/i.test(s)).slice(-1)[0];
  const browser = /(CriOS|Chrome|Firefox|FxiOS|EdgA|Safari)\/[\d.]+/.exec(ua)?.[1];
  const parts = [model, browser, run?.device?.sampleRate ? `${Math.round(run.device.sampleRate)} Hz` : null].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Phone';
}

/**
 * The History run for a validated export: origin "phone", every measurement tagged `phone` and flagged so it is
 * never mixed with a desktop calibration profile (no calibration is applied to it).
 */
export function phoneRunToHistoryRun(parsed, { assetId = null, id, now = new Date().toISOString() } = {}) {
  if (!parsed?.ok || !parsed.run) throw new Error('phoneRunToHistoryRun needs a successful parse');
  const r = parsed.run;
  const runId = id || `phone-${(r.sha256 || exportHash(r)).slice(0, 12)}`;
  return {
    id: runId,
    test: 'Phone results',
    sessionType: 'phone',
    workflow: 'phone',
    origin: 'phone',
    sourceDevice: describeDevice(r),
    assetId: assetId || null,
    createdAt: r.createdAt,
    importedAt: now,
    sampleRate: r.device.sampleRate,
    channels: 1,
    measurements: r.measurements.map(m => ({ ...m, origin: 'phone', qualityFlags: [...new Set([...(m.qualityFlags || []), 'phone-mic', 'uncalibrated'])] })),
    findings: [],
    score: null,
    notes: r.notes,
    phone: { app: r.app, version: r.version, sha256: r.sha256, hashOk: parsed.hashOk, assetHint: r.assetHint, micFlags: r.device.micFlags },
  };
}
