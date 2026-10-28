// Used-gear test certificate engine (FS-20). Pure: no DOM, no Tauri; the UI injects I/O.
// Mirror of src-tauri/src/certificate.rs (same schema v1, limits and verification order). The shared
// signed fixture tests/fixtures/certificate/valid-v1.deckchek-cert.json is checked by both sides.
//
// Small public API (FS-33 gear ledger builds on it):
//   certificatePlan(profile)                          -> {profileId, profileVersion, model, tests}
//   readiness(profile, results, {now, staleHours})    -> {ready, total, done, missing, stale}
//   buildCertificatePayload({asset, profile, results, measurements, calibration, tester, serial,
//     firmware, notes, photos, validDays, now, deckchekVersion, intervalMonths}) -> payload (validated)
//   certificateVerdict(results, measurements)         -> 'pass'|'pass_uncalibrated'|'review'|'fail'
//   validatePayload(payload)                          -> {ok, errors}
//   assembleCertificateFile(payload, signResult)      -> signed file object (null signResult = draft)
//   verifyCertificateText(text, {now, verifySignature, isLocal}) -> report like Rust certificate_verify
//   parseStrictJson(text), extractJsonFromHtml(html), qrText(hash), renderCertificateHtml(file, {draft})
// Untrusted input (files to verify) never throws out of verifyCertificateText: it returns a status.

import { canonicalJson } from './canonical-json.js';
import { sha256Hex, toBytes } from './sha256.js';
import { METRIC_RULES } from './calibration.js';
import { qrSvg } from './vendor/qr.js';

export const CERT_FORMAT = 'deckchek-certificate';
export const CERT_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const QR_PREFIX = 'deckchek:cert:v1:';
export const HTML_MARKER = '<script type="application/json" id="deckchek-cert">';
export const LIMITS = Object.freeze({
  maxJsonBytes: 20 * 1024 * 1024, maxHtmlBytes: 48 * 1024 * 1024, maxPayloadBytes: 16 * 1024 * 1024, maxDepth: 32,
  maxPhotos: 6, maxPhotoSourceBytes: 5 * 1024 * 1024, maxPhotoB64: 4 * 1024 * 1024,
  maxResults: 500, maxMeasurements: 2000, maxText: 200, maxLongText: 4000,
});
export const VALIDITY_DAYS = Object.freeze([30, 90, 180]);
export const DEFAULT_VALID_DAYS = 90;
export const DEFAULT_STALE_HOURS = 24;
export const DEFAULT_CAL_INTERVAL_MONTHS = 12;
export const RESULT_STATUSES = Object.freeze(['pass', 'fail', 'unknown', 'skipped']);
export const VERDICTS = Object.freeze(['pass', 'pass_uncalibrated', 'review', 'fail']);
export const CAL_STATES = Object.freeze(['calibrated', 'uncalibrated', 'expired', 'not_required']);
export const DECISIONS = Object.freeze(['inside', 'ambiguous', 'outside', 'no_limit']);
export const DISCLAIMER = 'This certificate proves the report was not changed after signing. It does not prove the tester measured honestly or that the unit has not changed since. '
  + 'The signing key is generated and held by the tester and the public key in the file is self-asserted, so there is no identity binding: compare the fingerprint out of band. '
  + 'Dates come from the tester\'s clock. Tests marked skipped or unknown were not certified. This is not a safety or electrical compliance certificate.';
export const VERDICT_LABEL = Object.freeze({ pass: 'Certified pass', pass_uncalibrated: 'Pass (uncalibrated)', review: 'Needs review', fail: 'Fail', draft: 'DRAFT (not signed)' });
export const VERDICT_ICON = Object.freeze({ pass: '✓', pass_uncalibrated: '!', review: '?', fail: '✗', draft: '✎' });
export const CAL_LABEL = Object.freeze({ calibrated: 'Calibrated', uncalibrated: 'Uncalibrated', expired: 'Calibration expired', not_required: 'No calibration needed' });
export const STATUS_LABEL = Object.freeze({ valid: 'VALID', modified: 'MODIFIED', unverifiable: 'UNVERIFIABLE' });

export class CertificateError extends Error {
  constructor(code, message) { super(message); this.name = 'CertificateError'; this.code = code; }
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chars = s => [...String(s)].length;
const clip = (s, max) => { const a = [...String(s ?? '')]; return a.length > max ? a.slice(0, max).join('') : a.join(''); };
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const DAY_MS = 86400000;

// ------------------------------------------------------------------ plan and readiness

/** The certificate plan of a device profile: every profile test is required (spec §1). */
export function certificatePlan(profile) {
  const tests = Array.isArray(profile?.tests) ? profile.tests.filter(t => t && typeof t.id === 'string' && t.id) : [];
  const v = Number(profile?.version ?? profile?.schemaVersion ?? 1);
  return {
    profileId: String(profile?.id ?? ''), profileVersion: Number.isSafeInteger(v) && v >= 0 ? v : 1,
    model: `${profile?.manufacturer ?? ''} ${profile?.model ?? ''}`.trim(), tests,
  };
}

/** Latest result per test id (newest createdAt wins). */
export function latestByTest(results = []) {
  const out = new Map();
  for (const r of Array.isArray(results) ? results : []) {
    if (!r || typeof r.testId !== 'string') continue;
    const prev = out.get(r.testId);
    if (!prev || String(r.createdAt ?? '') > String(prev.createdAt ?? '')) out.set(r.testId, r);
  }
  return out;
}

/** AC-1: X of Y required tests done; missing tests block signing; stale results are flagged "Re-run". */
export function readiness(profile, results = [], { now = Date.now(), staleHours = DEFAULT_STALE_HOURS } = {}) {
  const plan = certificatePlan(profile);
  const latest = latestByTest((results || []).filter(r => !r?.profileId || r.profileId === plan.profileId));
  const missing = [], stale = [];
  for (const t of plan.tests) {
    const r = latest.get(t.id);
    if (!r) { missing.push({ testId: t.id, title: t.title || t.id }); continue; }
    const at = Date.parse(r.createdAt);
    if (Number.isFinite(at) && +now - at > staleHours * 3600000) stale.push({ testId: t.id, title: t.title || t.id, createdAt: r.createdAt });
  }
  const total = plan.tests.length;
  return { plan, total, done: total - missing.length, missing, stale, ready: total > 0 && missing.length === 0 };
}

// ------------------------------------------------------------------ numbers, limits, uncertainty

/** Decimal string with `sig` significant digits and at most 12 decimals; null when not representable. */
export function toDecimal(value, sig = 6) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) >= 1e15) return null;
  if (value === 0) return '0';
  const p = Number(value.toPrecision(sig));
  if (p === 0) return '0';
  const mag = Math.floor(Math.log10(Math.abs(p)));
  let s = p.toFixed(Math.min(12, Math.max(0, sig - 1 - mag)));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (/^-0(\.0*)?$/.test(s)) s = '0';
  return isDecimal(s) ? s : null;
}

/** `-?(0|[1-9]\d{0,14})(\.\d{1,12})?`, as in certificate.rs. */
export const isDecimal = s => typeof s === 'string' && /^-?(0|[1-9]\d{0,14})(\.\d{1,12})?$/.test(s);

/** Reference limits from a profile pass criterion ({op, value, value2}); nulls when there is none. */
export function limitsFromPass(pass) {
  const t = Number(pass?.value), t2 = Number(pass?.value2);
  const fin = Number.isFinite;
  switch (pass?.op) {
    case '>=': return fin(t) ? { low: t, high: null } : { low: null, high: null };
    case '<=': return fin(t) ? { low: null, high: t } : { low: null, high: null };
    case 'abs<=': return fin(t) ? { low: -Math.abs(t), high: Math.abs(t) } : { low: null, high: null };
    case 'between': return fin(t) && fin(t2) ? { low: Math.min(t, t2), high: Math.max(t, t2) } : { low: null, high: null };
    case 'equals': return typeof pass.value !== 'string' && fin(t) ? { low: t, high: t } : { low: null, high: null };
    case 'all-seen': return { low: fin(t) ? t : 100, high: null };
    default: return { low: null, high: null };
  }
}

/** Expanded uncertainty U: k=2 x the engine's standard uncertainty when supplied, else the stored (expanded) value. */
export function expandedUncertainty(m) {
  const u = m?.uncertainty;
  if (Number.isFinite(m?.standardUncertainty)) return 2 * Math.abs(m.standardUncertainty);
  if (isObj(u)) {
    if (Number.isFinite(u.standard)) return 2 * Math.abs(u.standard);
    if (Number.isFinite(u.expanded)) return Math.abs(u.expanded);
  }
  return Number.isFinite(u) ? Math.abs(u) : null;
}

/**
 * Guard-band decision (spec §6, ILAC-G8 style): 'inside' when value ± U lies inside the limits, 'outside' when it
 * lies beyond a limit by more than U, 'ambiguous' when |value - limit| <= U, 'no_limit' without limits.
 * U <= 0 or missing means no guard band (limits inclusive).
 */
export function guardBandDecision(value, low, high, U) {
  if (low == null && high == null) return 'no_limit';
  if (!Number.isFinite(value)) return 'ambiguous';
  const u = Number.isFinite(U) && U > 0 ? U : 0;
  const tol = 1e-9 * Math.max(1, Math.abs(value), u);
  const within = d => u > 0 && d <= u + tol;
  if (low != null && value < low - tol) return within(low - value) ? 'ambiguous' : 'outside';
  if (high != null && value > high + tol) return within(value - high) ? 'ambiguous' : 'outside';
  if ((low != null && within(Math.abs(value - low))) || (high != null && within(Math.abs(high - value)))) return 'ambiguous';
  return 'inside';
}

function addMonths(ms, months) { const d = new Date(ms); d.setUTCMonth(d.getUTCMonth() + months); return d.getTime(); }

/**
 * Calibration state of one measurement (AC-6). Metrics without a calibration model (MIDI counts, driver checks)
 * need none. `profile` is the instrument calibration profile (app/calibration.js) in force for the run.
 */
export function calibrationFor(measurement, profile, { now = Date.now(), intervalMonths = DEFAULT_CAL_INTERVAL_MONTHS } = {}) {
  if (!METRIC_RULES[measurement?.metricId]) return { state: 'not_required', refId: null, date: null };
  const t = Date.parse(profile?.createdAt);
  if (!profile || profile.valid === false || measurement?.calibrated === false || !Number.isFinite(t)) return { state: 'uncalibrated', refId: null, date: null };
  const ref = clip(`${profile.deviceName || 'default'}|${profile.sampleRate || ''}`, LIMITS.maxText);
  return { state: +now > addMonths(t, intervalMonths) ? 'expired' : 'calibrated', refId: ref, date: new Date(t).toISOString() };
}

/** Normalised payload measurement (decimal strings, limits, decision, calibration) or null when not representable. */
export function payloadMeasurement(m, test, { calibration = null, now, intervalMonths } = {}) {
  const value = toDecimal(m?.value);
  if (!m?.metricId || value == null) return null;
  const pass = test?.pass && test.pass.metricId === m.metricId ? test.pass : null;
  const { low, high } = limitsFromPass(pass);
  const U = expandedUncertainty(m);
  const [uS, lowS, highS] = [U, low, high].map(v => (v == null ? null : toDecimal(v)));
  const decision = guardBandDecision(Number(value), lowS == null ? null : Number(lowS), highS == null ? null : Number(highS), uS == null ? null : Number(uS));
  return {
    testId: clip(test?.id || m.testId || 'unknown', LIMITS.maxText), metricId: clip(m.metricId, LIMITS.maxText), label: clip(m.label || m.metricId, LIMITS.maxText),
    value, unit: clip(m.unit || pass?.unit || '', 40), uncertainty: uS, referenceLow: lowS, referenceHigh: highS,
    methodKey: clip(test?.method || m.methodKey || '', LIMITS.maxText), methodVersion: Number.isSafeInteger(m.methodVersion) && m.methodVersion >= 0 ? m.methodVersion : 1,
    decision, calibration: calibrationFor(m, calibration, { now, intervalMonths }),
  };
}

/** Verdict (spec §6): fail > review > pass, then the AC-6 downgrade to pass_uncalibrated. */
export function certificateVerdict(results = [], measurements = []) {
  if (results.some(r => r.status === 'fail') || measurements.some(m => m.decision === 'outside')) return 'fail';
  if (!results.length || results.some(r => r.status !== 'pass') || measurements.some(m => m.decision === 'ambiguous')) return 'review';
  if (measurements.some(m => m.calibration?.state === 'uncalibrated' || m.calibration?.state === 'expired')) return 'pass_uncalibrated';
  return 'pass';
}

// ------------------------------------------------------------------ payload

/** Builds and validates the signed payload. Throws CertificateError('schema') for invalid input (e.g. no serial). */
export function buildCertificatePayload({
  asset = null, profile, results = [], measurements = null, calibration = null, tester, serial, firmware, notes = '',
  photos = [], validDays = DEFAULT_VALID_DAYS, now = new Date(), deckchekVersion = '', intervalMonths = DEFAULT_CAL_INTERVAL_MONTHS,
} = {}) {
  const plan = certificatePlan(profile);
  const nowDate = now instanceof Date ? now : new Date(now);
  const latest = latestByTest((results || []).filter(r => !r?.profileId || r.profileId === plan.profileId));
  const testById = new Map(plan.tests.map(t => [t.id, t]));
  const payloadResults = plan.tests.slice(0, LIMITS.maxResults).map(t => {
    const r = latest.get(t.id);
    const status = RESULT_STATUSES.includes(r?.status) ? r.status : 'unknown';
    const detail = r ? (typeof r.detail === 'string' ? r.detail : r.detail?.summary || '') : 'Not tested.';
    return { testId: clip(t.id, LIMITS.maxText), title: clip(t.title || t.id, LIMITS.maxText), status, detail: clip(detail, LIMITS.maxLongText) };
  });
  const source = Array.isArray(measurements) ? measurements
    : plan.tests.flatMap(t => (latest.get(t.id)?.detail?.measurements || []).map(m => ({ ...m, testId: t.id })));
  const payloadMeasurements = source
    .map(m => payloadMeasurement(m, testById.get(m?.testId) || null, { calibration, now: nowDate.getTime(), intervalMonths }))
    .filter(Boolean).slice(0, LIMITS.maxMeasurements);
  const days = VALIDITY_DAYS.includes(Number(validDays)) ? Number(validDays) : DEFAULT_VALID_DAYS;
  const payload = {
    unit: {
      model: clip(plan.model || profile?.model || '', LIMITS.maxText), productId: plan.profileId,
      serial: clip(String(serial ?? asset?.serialNumber ?? '').trim(), LIMITS.maxText), firmware: clip(String(firmware ?? asset?.firmware ?? '').trim(), LIMITS.maxText),
      notes: clip(String(notes ?? '').trim(), LIMITS.maxLongText),
      photos: (photos || []).map(p => ({ name: clip(p.name || 'photo.jpg', LIMITS.maxText), sha256: p.sha256, mime: 'image/jpeg', dataB64: p.dataB64 })),
    },
    plan: { profileId: plan.profileId, profileVersion: plan.profileVersion, testIds: payloadResults.map(r => r.testId) },
    results: payloadResults,
    measurements: payloadMeasurements,
    tester: clip(String(tester ?? '').trim(), LIMITS.maxText),
    deckchekVersion: clip(deckchekVersion, 40),
    schemaVersion: SCHEMA_VERSION,
    issuedAt: nowDate.toISOString(),
    validUntil: new Date(nowDate.getTime() + days * DAY_MS).toISOString(),
    verdict: certificateVerdict(payloadResults, payloadMeasurements),
    disclaimer: DISCLAIMER,
  };
  const v = validatePayload(payload);
  if (!v.ok) throw new CertificateError('schema', v.errors[0]);
  return payload;
}

// ------------------------------------------------------------------ schema v1 (mirror of certificate.rs)

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?Z$/;
export function isIsoUtc(s) {
  const m = typeof s === 'string' && ISO_RE.exec(s);
  return !!m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 && +m[4] <= 23 && +m[5] <= 59 && +m[6] <= 60;
}
const isoKey = s => `${String(s).slice(0, 19)}.${String(s).slice(20, -1).padEnd(3, '0')}`;
const isHex = (s, n) => typeof s === 'string' && s.length === n && /^[0-9a-f]+$/.test(s);

function checker() {
  const fail = msg => { throw new CertificateError('schema', msg); };
  const obj = (v, path) => (isObj(v) ? v : fail(`${path} must be an object`));
  const keys = (o, path, required, optional = []) => {
    for (const k of required) if (!has(o, k)) fail(`${path}.${k} is missing`);
    for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) fail(`${path} has an unknown field "${clip(k, 40)}"`);
  };
  const text = (o, k, path, min, max) => { const s = o[k]; if (typeof s !== 'string') fail(`${path}.${k} must be a string`); const n = chars(s); if (n < min || n > max) fail(`${path}.${k} must be ${min}–${max} characters`); return s; };
  const optText = (o, k, path, max) => (o[k] == null ? null : text(o, k, path, 0, max));
  const oneOf = (o, k, path, allowed) => { if (typeof o[k] !== 'string') fail(`${path}.${k} must be a string`); if (!allowed.includes(o[k])) fail(`${path}.${k} has an unknown value`); };
  const int = (o, k, path, min, max) => { const n = o[k]; if (!Number.isSafeInteger(n) || n < min || n > max) fail(`${path}.${k} must be an integer ${min}–${max}`); return n; };
  const dec = (o, k, path, nullable) => { const v = o[k]; if (!((nullable && v === null) || isDecimal(v))) fail(`${path}.${k} must be a decimal string${nullable ? ' or null' : ''}`); };
  const iso = (o, k, path) => { if (!isIsoUtc(o[k])) fail(`${path}.${k} must be an ISO UTC timestamp`); };
  const arr = (o, k, path, max) => { const a = o[k]; if (!Array.isArray(a)) fail(`${path}.${k} must be an array`); if (a.length > max) fail(`${path}.${k} has more than ${max} entries`); return a; };
  return { fail, obj, keys, text, optText, oneOf, int, dec, iso, arr };
}

/** Strict schema v1 of `payload` (mirrors certificate.rs validate_payload). -> {ok, errors:[first]} */
export function validatePayload(payload) {
  const c = checker();
  try {
    const p = c.obj(payload, 'payload');
    c.keys(p, 'payload', ['unit', 'plan', 'results', 'measurements', 'tester', 'deckchekVersion', 'schemaVersion', 'issuedAt', 'validUntil', 'verdict', 'disclaimer']);
    const unit = c.obj(p.unit, 'payload.unit');
    c.keys(unit, 'payload.unit', ['model', 'productId', 'serial', 'firmware', 'notes', 'photos']);
    c.text(unit, 'model', 'payload.unit', 1, LIMITS.maxText);
    c.text(unit, 'productId', 'payload.unit', 1, LIMITS.maxText);
    c.text(unit, 'serial', 'payload.unit', 1, LIMITS.maxText);
    c.text(unit, 'firmware', 'payload.unit', 0, LIMITS.maxText);
    c.text(unit, 'notes', 'payload.unit', 0, LIMITS.maxLongText);
    c.arr(unit, 'photos', 'payload.unit', LIMITS.maxPhotos).forEach((ph, i) => {
      const path = `payload.unit.photos[${i}]`;
      c.obj(ph, path); c.keys(ph, path, ['name', 'sha256', 'mime', 'dataB64']);
      c.text(ph, 'name', path, 1, LIMITS.maxText);
      if (!isHex(ph.sha256, 64)) c.fail(`${path}.sha256 must be 64 lowercase hex characters`);
      c.oneOf(ph, 'mime', path, ['image/jpeg']);
      const d = ph.dataB64;
      if (typeof d !== 'string') c.fail(`${path}.dataB64 must be a string`);
      if (!d.length || d.length > LIMITS.maxPhotoB64 || d.length % 4 !== 0 || !/^[A-Za-z0-9+/=]+$/.test(d)) c.fail(`${path}.dataB64 must be base64 of at most ${LIMITS.maxPhotoB64} characters`);
    });
    const plan = c.obj(p.plan, 'payload.plan');
    c.keys(plan, 'payload.plan', ['profileId', 'profileVersion', 'testIds']);
    c.text(plan, 'profileId', 'payload.plan', 1, LIMITS.maxText);
    c.int(plan, 'profileVersion', 'payload.plan', 0, 1000000);
    c.arr(plan, 'testIds', 'payload.plan', LIMITS.maxResults).forEach((t, i) => { if (typeof t !== 'string' || !t || chars(t) > LIMITS.maxText) c.fail(`payload.plan.testIds[${i}] must be a non-empty string`); });
    c.arr(p, 'results', 'payload', LIMITS.maxResults).forEach((r, i) => {
      const path = `payload.results[${i}]`;
      c.obj(r, path); c.keys(r, path, ['testId', 'title', 'status', 'detail']);
      c.text(r, 'testId', path, 1, LIMITS.maxText); c.text(r, 'title', path, 0, LIMITS.maxText);
      c.oneOf(r, 'status', path, RESULT_STATUSES); c.text(r, 'detail', path, 0, LIMITS.maxLongText);
    });
    c.arr(p, 'measurements', 'payload', LIMITS.maxMeasurements).forEach((m, i) => {
      const path = `payload.measurements[${i}]`;
      c.obj(m, path);
      c.keys(m, path, ['testId', 'metricId', 'label', 'value', 'unit', 'uncertainty', 'referenceLow', 'referenceHigh', 'methodKey', 'methodVersion', 'decision', 'calibration']);
      c.text(m, 'testId', path, 1, LIMITS.maxText); c.text(m, 'metricId', path, 1, LIMITS.maxText); c.text(m, 'label', path, 0, LIMITS.maxText);
      c.dec(m, 'value', path, false); c.text(m, 'unit', path, 0, 40);
      c.dec(m, 'uncertainty', path, true); c.dec(m, 'referenceLow', path, true); c.dec(m, 'referenceHigh', path, true);
      c.text(m, 'methodKey', path, 0, LIMITS.maxText); c.int(m, 'methodVersion', path, 0, 1000000);
      c.oneOf(m, 'decision', path, DECISIONS);
      const cp = `${path}.calibration`, cal = c.obj(m.calibration, cp);
      c.keys(cal, cp, ['state', 'refId', 'date']);
      c.oneOf(cal, 'state', cp, CAL_STATES); c.optText(cal, 'refId', cp, LIMITS.maxText);
      if (cal.date !== null) c.iso(cal, 'date', cp);
    });
    c.text(p, 'tester', 'payload', 1, LIMITS.maxText);
    c.text(p, 'deckchekVersion', 'payload', 0, 40);
    c.int(p, 'schemaVersion', 'payload', SCHEMA_VERSION, SCHEMA_VERSION);
    c.iso(p, 'issuedAt', 'payload'); c.iso(p, 'validUntil', 'payload');
    if (isoKey(p.validUntil) <= isoKey(p.issuedAt)) c.fail('payload.validUntil must be after issuedAt');
    c.oneOf(p, 'verdict', 'payload', VERDICTS);
    c.text(p, 'disclaimer', 'payload', 1, LIMITS.maxLongText);
    return { ok: true, errors: [] };
  } catch (e) {
    if (e instanceof CertificateError) return { ok: false, errors: [e.message] };
    return { ok: false, errors: [String(e?.message || e)] };
  }
}

// ------------------------------------------------------------------ strict parsing of untrusted text

/**
 * Parses untrusted JSON: size cap, nesting <= maxDepth, duplicate keys and lone surrogates rejected,
 * out-of-range numbers rejected (as serde_json does). Throws CertificateError with a code.
 */
export function parseStrictJson(text, { maxBytes = LIMITS.maxJsonBytes, maxDepth = LIMITS.maxDepth } = {}) {
  if (typeof text !== 'string') throw new CertificateError('invalid_json', 'the file is not text');
  if (text.length > maxBytes || (text.length * 3 > maxBytes && toBytes(text).length > maxBytes)) throw new CertificateError('too_large', 'the file is larger than a DeckChek certificate can be');
  let i = 0;
  const bad = what => { throw new CertificateError('invalid_json', `the file is not valid JSON (${what} at offset ${i})`); };
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const str = () => {
    const start = i++;
    while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; else if (text.charCodeAt(i) < 0x20) bad('control character in string'); i++; }
    if (i >= text.length) bad('unterminated string');
    i++;
    let s;
    try { s = JSON.parse(text.slice(start, i)); } catch { bad('bad escape'); }
    for (let k = 0; k < s.length; k++) {
      const c = s.charCodeAt(k);
      if (c >= 0xd800 && c <= 0xdbff) { const n = s.charCodeAt(k + 1); if (n >= 0xdc00 && n <= 0xdfff) { k++; continue; } bad('lone surrogate'); }
      if (c >= 0xdc00 && c <= 0xdfff) bad('lone surrogate');
    }
    return s;
  };
  const value = depth => {
    ws();
    const ch = text[i];
    if (ch === '{' || ch === '[') {
      if (depth + 1 > maxDepth) throw new CertificateError('too_deep', `the JSON is nested deeper than ${maxDepth} levels`);
      i++; ws();
      if (ch === '[') {
        const out = [];
        if (text[i] === ']') { i++; return out; }
        for (;;) { out.push(value(depth + 1)); ws(); if (text[i] === ',') { i++; continue; } if (text[i] === ']') { i++; return out; } bad('expected , or ]'); }
      }
      const out = {};
      if (text[i] === '}') { i++; return out; }
      for (;;) {
        ws(); if (text[i] !== '"') bad('expected a key');
        const k = str();
        if (has(out, k)) throw new CertificateError('duplicate_key', 'the JSON repeats a key inside one object');
        ws(); if (text[i] !== ':') bad('expected :'); i++;
        Object.defineProperty(out, k, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
        ws(); if (text[i] === ',') { i++; continue; } if (text[i] === '}') { i++; return out; } bad('expected , or }');
      }
    }
    if (ch === '"') return str();
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i, i + 400));
    if (m && m[0]) { i += m[0].length; const n = Number(m[0]); if (!Number.isFinite(n)) bad('number out of range'); return n; }
    for (const [lit, v] of [['true', true], ['false', false], ['null', null]]) if (text.startsWith(lit, i)) { i += lit.length; return v; }
    return bad('unexpected character');
  };
  const out = value(0);
  ws();
  if (i !== text.length) bad('trailing data');
  return out;
}

/** The embedded certificate JSON of a DeckChek HTML certificate (same rule as certificate.rs). */
export function extractJsonFromHtml(html) {
  const s = String(html ?? '');
  const start = s.indexOf(HTML_MARKER);
  if (start < 0) throw new CertificateError('no_certificate_data', 'this HTML file has no DeckChek certificate data');
  const from = start + HTML_MARKER.length, end = s.indexOf('</script>', from);
  if (end < 0) throw new CertificateError('no_certificate_data', 'this HTML file has no DeckChek certificate data');
  const json = s.slice(from, end).trim();
  if (json.length > LIMITS.maxJsonBytes) throw new CertificateError('too_large', 'the embedded certificate is too large');
  return json;
}

// ------------------------------------------------------------------ hashing, file, QR

/** Lowercase hex SHA-256 of the canonical payload; throws CertificateError for non-canonical or oversized payloads. */
export async function contentHash(payload) {
  let text;
  try { text = canonicalJson(payload); } catch (e) { throw new CertificateError('not_canonical', `the payload cannot be canonicalised: ${e.message}`); }
  if (text.length > LIMITS.maxPayloadBytes || toBytes(text).length > LIMITS.maxPayloadBytes) throw new CertificateError('too_large', 'the payload is larger than 16 MB');
  return sha256Hex(text);
}

export const qrText = hash => `${QR_PREFIX}${hash}`;
export const certificateQrSvg = hash => qrSvg(qrText(hash), { ecc: 'L', label: 'QR code with the certificate content hash' });

/** Signed file object from a payload and the Rust certificate_sign result; `sign` null builds an unsigned draft. */
export function assembleCertificateFile(payload, sign = null) {
  const file = { format: CERT_FORMAT, version: CERT_VERSION, payload };
  if (sign) file.integrity = { alg: 'ed25519', hashAlg: 'sha256', contentHash: sign.contentHash, signature: sign.signatureB64, publicKey: sign.publicKeyB64, fingerprint: sign.fingerprint };
  return file;
}
export const certificateFileText = file => `${JSON.stringify(file, null, 2)}\n`;

/** `<model>-<serial>-<date>` with every character outside [A-Za-z0-9._-] replaced by `_` (spec §7). */
export function certificateBaseName(payload) {
  const safe = s => String(s ?? '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._]+/, '').slice(0, 60) || 'unit';
  return `${safe(payload?.unit?.model)}-${safe(payload?.unit?.serial)}-${String(payload?.issuedAt ?? '').slice(0, 10) || 'undated'}`;
}

// ------------------------------------------------------------------ verification

function b64Bytes(s, n) {
  if (typeof s !== 'string' || s.length !== Math.ceil(n / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  try { const bin = atob(s); if (bin.length !== n) return null; return Uint8Array.from(bin, c => c.charCodeAt(0)); } catch { return null; }
}
const hexBytes = h => Uint8Array.from(h.match(/../g), b => parseInt(b, 16));

/** WebCrypto Ed25519 verifier for browser mode; resolves null when the platform cannot check Ed25519. */
export async function webCryptoVerify(publicKey, digest, signature, subtle = globalThis.crypto?.subtle) {
  if (!subtle?.importKey) return null;
  let key;
  try { key = await subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']); } catch (e) { return e?.name === 'NotSupportedError' || /not supported|unrecognized/i.test(e?.message || '') ? null : false; }
  try { return await subtle.verify({ name: 'Ed25519' }, key, signature, digest); } catch { return false; }
}

const report = (status, reasons, extra = {}) => ({ status, reasons, fingerprint: null, expired: false, contentHash: null, declaredHash: null, issuedAt: null, validUntil: null, tester: null, model: null, serial: null, verdict: null, issuedByThisInstall: false, payload: null, ...extra });
const shortText = v => (typeof v === 'string' ? clip(v, LIMITS.maxText) : null);

/**
 * Verifies certificate JSON text. Same order and wording as certificate.rs verify_text. `verifySignature(pk, digest, sig)`
 * resolves true/false, or null when Ed25519 cannot be checked here (status then 'unverifiable', hash result still shown).
 * `isLocal(fingerprint)` marks keys of this install. `now` is ms or a Date. Never throws.
 */
export async function verifyCertificateText(text, { now = Date.now(), verifySignature = webCryptoVerify, isLocal = () => false } = {}) {
  try {
    let root;
    try { root = parseStrictJson(text); } catch (e) { return report('unverifiable', [e.message]); }
    if (!isObj(root) || root.format !== CERT_FORMAT) return report('unverifiable', [isObj(root) ? 'not a DeckChek certificate (unknown format)' : 'not a DeckChek certificate']);
    if (root.version !== CERT_VERSION) return report('unverifiable', [Number.isSafeInteger(root.version) ? `unsupported certificate version ${root.version}; update DeckChek to check it` : 'unsupported certificate version']);
    const c = checker();
    try { c.keys(root, 'certificate', ['format', 'version', 'payload'], ['integrity']); } catch (e) { return report('unverifiable', [e.message]); }
    if (!has(root, 'integrity')) return report('unverifiable', ['missing signature (unsigned draft or stripped integrity block)']);
    const i = root.integrity;
    try {
      c.obj(i, 'integrity');
      c.keys(i, 'integrity', ['alg', 'hashAlg', 'contentHash', 'signature', 'publicKey', 'fingerprint']);
      c.oneOf(i, 'alg', 'integrity', ['ed25519']); c.oneOf(i, 'hashAlg', 'integrity', ['sha256']);
      if (!isHex(i.contentHash, 64)) c.fail('integrity.contentHash must be 64 lowercase hex characters');
      if (!isHex(i.fingerprint, 16)) c.fail('integrity.fingerprint must be 16 lowercase hex characters');
      if (typeof i.signature !== 'string' || !i.signature) c.fail('missing signature');
      if (typeof i.publicKey !== 'string' || i.publicKey.length > 64) c.fail('integrity.publicKey must be a base64 string');
    } catch (e) { return report('unverifiable', [e.message]); }
    const p = isObj(root.payload) ? root.payload : null;
    const r = report('modified', [], {
      fingerprint: i.fingerprint, declaredHash: i.contentHash, issuedAt: shortText(p?.issuedAt), validUntil: shortText(p?.validUntil), tester: shortText(p?.tester),
      verdict: shortText(p?.verdict), model: shortText(p?.unit?.model), serial: shortText(p?.unit?.serial), issuedByThisInstall: !!(await isLocal(i.fingerprint)),
    });
    try { r.contentHash = await contentHash(root.payload); } catch (e) { r.reasons.push('content hash mismatch', e.message); return r; }
    if (r.contentHash !== i.contentHash) { r.reasons.push('content hash mismatch'); return r; }
    const pk = b64Bytes(i.publicKey, 32);
    if (!pk) { r.reasons.push('the embedded public key is not a valid Ed25519 key'); return r; }
    if ((await sha256Hex(pk)).slice(0, 16) !== i.fingerprint) { r.reasons.push('fingerprint does not match the embedded public key'); return r; }
    const sig = b64Bytes(i.signature, 64);
    if (!sig) { r.reasons.push('the signature is not 64 bytes of base64'); return r; }
    const ok = await verifySignature(pk, hexBytes(r.contentHash), sig);
    if (ok === null || ok === undefined) { r.status = 'unverifiable'; r.reasons.push('content hash matches, but the Ed25519 signature cannot be checked here: open the file in the DeckChek desktop app'); return r; }
    if (!ok) { r.reasons.push('signature does not match the embedded public key'); return r; }
    const v = validatePayload(root.payload);
    if (!v.ok) { r.status = 'unverifiable'; r.reasons.push(`signed, but the payload does not follow schema v1: ${v.errors[0]}`); return r; }
    r.status = 'valid';
    r.payload = root.payload;
    const nowIso = new Date(now instanceof Date ? now.getTime() : now).toISOString();
    r.expired = isoKey(nowIso) > isoKey(r.validUntil);
    if (r.expired) r.reasons.push('validity period has ended (EXPIRED)');
    return r;
  } catch (e) {
    return report('unverifiable', [`could not check the file: ${String(e?.message || e).slice(0, 200)}`]);
  }
}

/** Paths whose values differ between two payloads (MODIFIED per-section diff against a stored original), max 50. */
export function diffPayload(a, b, path = 'payload', out = []) {
  if (out.length >= 50) return out;
  if (isObj(a) && isObj(b)) {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) diffPayload(a[k], b[k], `${path}.${k}`, out);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    for (let k = 0; k < Math.max(a.length, b.length); k++) diffPayload(a[k], b[k], `${path}[${k}]`, out);
  } else if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) {
    out.push(path);
  }
  return out;
}

// ------------------------------------------------------------------ HTML

/** Certificate styles shared by the standalone HTML file and the PDF (FS-03 printable kind). Light, theme-independent. */
export const CERT_CSS = `.dc-cert{font:10pt/1.45 "Segoe UI",system-ui,sans-serif;color:#14171c;background:#fff;max-width:190mm;margin:0 auto;position:relative}
.dc-cert h1{font-size:18pt;margin:0 0 4pt}.dc-cert h2{font-size:12.5pt;margin:12pt 0 4pt;border-bottom:1pt solid #9aa3ae}
.dc-cert table{width:100%;border-collapse:collapse;font-size:9pt}.dc-cert th,.dc-cert td{border-bottom:.75pt solid #9aa3ae;padding:2pt 5pt;text-align:left;vertical-align:top}
.dc-cert th{background:#eef1f4}.dc-cert .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.dc-cert-badge{display:inline-block;border:2pt solid #14171c;border-radius:4pt;padding:3pt 10pt;font-weight:700;font-size:13pt}
.dc-cert-badge[data-verdict="fail"]{border-color:#a1101b;color:#a1101b}.dc-cert-badge[data-verdict="pass"]{border-color:#1b6e2a;color:#1b6e2a}
.dc-cert-meta{display:grid;grid-template-columns:max-content 1fr;gap:1pt 10pt;margin:6pt 0}.dc-cert-meta dt{font-weight:600}.dc-cert-meta dd{margin:0;overflow-wrap:anywhere}
.dc-cert-integrity{display:grid;grid-template-columns:1fr 38mm;gap:8pt;align-items:start;break-inside:avoid}.dc-cert-integrity svg{width:38mm;height:38mm}
.dc-cert-hash{font:9pt Consolas,ui-monospace,monospace;overflow-wrap:anywhere}.dc-cert-fp{font:700 16pt Consolas,ui-monospace,monospace;letter-spacing:.06em}
.dc-cert-photos{display:flex;flex-wrap:wrap;gap:6pt}.dc-cert-photos figure{margin:0;width:56mm;break-inside:avoid}.dc-cert-photos img{width:100%;height:auto;border:.75pt solid #9aa3ae}
.dc-cert-photos figcaption{font-size:8pt;color:#4a5260}.dc-cert-note{font-size:8.5pt;color:#2b313a}.dc-cert-cal{font-weight:600;white-space:nowrap}
.dc-cert-draft{position:absolute;inset:30% 0 auto;text-align:center;font:700 72pt system-ui,sans-serif;color:rgba(161,16,27,.18);transform:rotate(-24deg);pointer-events:none}`;

const RESULT_TEXT = { pass: '✓ PASS', fail: '✗ FAIL', unknown: '? UNKNOWN', skipped: '– SKIPPED' };
const DECISION_TEXT = { inside: 'Within limits', ambiguous: 'Within uncertainty of a limit', outside: 'Outside limits', no_limit: 'No limit' };

function limitText(m) {
  if (m.referenceLow != null && m.referenceHigh != null) return m.referenceLow === m.referenceHigh ? `= ${m.referenceLow}` : `${m.referenceLow} … ${m.referenceHigh}`;
  if (m.referenceLow != null) return `≥ ${m.referenceLow}`;
  if (m.referenceHigh != null) return `≤ ${m.referenceHigh}`;
  return '—';
}

/** Certificate body markup (every user string escaped). `draft` adds the DRAFT watermark and omits the signature block. */
export function renderCertificateBody(file, { draft = false } = {}) {
  const p = file?.payload ?? {}, unit = p.unit ?? {}, i = draft ? null : file?.integrity;
  const verdict = draft ? 'draft' : p.verdict;
  const results = (p.results ?? []).map(r => `<tr><td>${esc(r.title || r.testId)}</td><td>${esc(RESULT_TEXT[r.status] || r.status)}</td><td>${esc(r.detail)}</td></tr>`).join('');
  const meas = (p.measurements ?? []).map(m => `<tr><td>${esc(m.label || m.metricId)}</td><td class="num">${esc(m.value)}${m.uncertainty != null ? ` ± ${esc(m.uncertainty)}` : ''} ${esc(m.unit)}</td><td class="num">${esc(limitText(m))}</td><td>${esc(DECISION_TEXT[m.decision] || m.decision)}</td><td class="dc-cert-cal">${m.calibration?.state === 'not_required' ? '—' : esc(CAL_LABEL[m.calibration?.state] || m.calibration?.state)}${m.calibration?.date ? ` <small>(${esc(String(m.calibration.date).slice(0, 10))})</small>` : ''}</td></tr>`).join('');
  const photos = (unit.photos ?? []).map((ph, k) => `<figure><img src="data:image/jpeg;base64,${esc(ph.dataB64)}" alt="${esc(`Photo ${k + 1} of the unit: ${ph.name}`)}"><figcaption>${esc(ph.name)} · SHA-256 ${esc(String(ph.sha256).slice(0, 16))}…</figcaption></figure>`).join('');
  let integrity;
  if (i) {
    let qr = '';
    try { qr = certificateQrSvg(i.contentHash); } catch { qr = ''; }
    integrity = `<section class="dc-cert-integrity" aria-label="Integrity"><div><h2>Integrity</h2><p>Signer key fingerprint (compare out of band):</p><p class="dc-cert-fp">${esc(String(i.fingerprint).replace(/(.{4})(?=.)/g, '$1 '))}</p>
<p>Content hash (SHA-256 of the canonical payload):</p><p class="dc-cert-hash">${esc(i.contentHash)}</p><p class="dc-cert-note">Ed25519 signature over the hash; the signed data travels in the <b>.deckchek-cert.json</b> file. Check it in DeckChek: Verify certificate.</p></div><div>${qr}<p class="dc-cert-note">QR: ${esc(qrText(i.contentHash))}</p></div></section>`;
  } else {
    integrity = '<section aria-label="Integrity"><h2>Integrity</h2><p><b>DRAFT — not signed.</b> Not all required tests have results. A draft cannot be verified.</p></section>';
  }
  return `<div class="dc-cert">${draft ? '<div class="dc-cert-draft" aria-hidden="true">DRAFT</div>' : ''}
<h1>Used-gear test certificate</h1>
<p><span class="dc-cert-badge" data-verdict="${esc(verdict)}">${esc(VERDICT_ICON[verdict] || '')} ${esc(VERDICT_LABEL[verdict] || verdict)}</span></p>
<dl class="dc-cert-meta"><dt>Model</dt><dd>${esc(unit.model)}</dd><dt>Serial</dt><dd>${esc(unit.serial)}</dd><dt>Firmware</dt><dd>${esc(unit.firmware || '—')}</dd>
<dt>Tester</dt><dd>${esc(p.tester)}</dd><dt>Issued</dt><dd>${esc(String(p.issuedAt ?? '').replace('T', ' ').slice(0, 16))} UTC</dd><dt>Valid until</dt><dd>${esc(String(p.validUntil ?? '').slice(0, 10))}</dd>
<dt>Test plan</dt><dd>${esc(p.plan?.profileId)} v${esc(p.plan?.profileVersion)} · ${esc((p.results ?? []).length)} tests</dd><dt>DeckChek</dt><dd>${esc(p.deckchekVersion || '—')}</dd></dl>
${unit.notes ? `<p><b>Notes:</b> ${esc(unit.notes)}</p>` : ''}
<h2>Test results</h2><table><thead><tr><th>Test</th><th>Result</th><th>Detail</th></tr></thead><tbody>${results || '<tr><td colspan="3">No tests.</td></tr>'}</tbody></table>
<h2>Measurements</h2>${meas ? `<table><thead><tr><th>Metric</th><th class="num">Value ± U (k=2)</th><th class="num">Limit</th><th>Decision</th><th>Calibration</th></tr></thead><tbody>${meas}</tbody></table>` : '<p>No numeric measurements in this plan.</p>'}
${photos ? `<h2>Photos</h2><div class="dc-cert-photos">${photos}</div>` : ''}
${integrity}
<h2>Limits of this certificate</h2><p class="dc-cert-note">${esc(p.disclaimer || DISCLAIMER)}</p></div>`;
}

/** Embeds certificate JSON in HTML safely: `<` (and U+2028/9) escaped so the data block cannot close early. */
export const embedJson = file => JSON.stringify(file).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Standalone HTML certificate (AC-8 fallback): same content and the identical signed JSON embedded. */
export function renderCertificateHtml(file, { draft = false } = {}) {
  const unit = file?.payload?.unit ?? {};
  const title = `${draft ? 'DRAFT ' : ''}Certificate — ${unit.model ?? ''} ${unit.serial ?? ''}`.trim();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title><style>body{margin:12mm;background:#fff}${CERT_CSS}</style></head><body>${renderCertificateBody(file, { draft })}
${HTML_MARKER}${embedJson(file)}</script></body></html>`;
}

/** Badge model for a verification report: icon + text (never colour alone). */
export function verifyBadge(rep) {
  const status = rep?.status || 'unverifiable';
  const icon = { valid: '✓', modified: '✗', unverifiable: '?' }[status] || '?';
  return { status, icon, label: STATUS_LABEL[status] || 'UNVERIFIABLE', expired: !!rep?.expired };
}
