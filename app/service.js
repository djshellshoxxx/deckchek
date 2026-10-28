// Service worksheets engine (FS-22). Pure: no DOM, no storage, no IPC (the bridge is service-api.js).
//   Status machine     STATUSES, canTransition(from, to, {reopen}), nextStatuses(from), isReadOnly(status)
//   Stepper            stepperState(detail, comparison) -> [{id, label, state, reason}] (Intake > Before > Work > After > Sheet)
//   Work log           effectiveLog(log), jobTotals(log): informational numbers, never an invoice
//   Before/after       compareBeforeAfter(before, after, opts): builds on core.js compareRuns (same metric, same unit)
//                      and adds FS-00 metric-compat checks (method version), RSS uncertainty and k=2 verdicts
//   Job sheet          jobSheetModel(detail, comparison, opts) and renderJobSheetHtml(...) for the FS-03 "jobSheet" kind
// Privacy: customer name, phone and email appear only in renderJobSheetHtml when opts.includeCustomer is true;
// nothing here persists or logs them. listPrefsForSettings() is the only service state allowed into UI settings.

import { compareRuns } from './core.js';
import { methodCompatible, combinedUncertainty, deltaVerdict } from './metric-compat.js';

export const STATUSES = Object.freeze(['intake', 'diagnosing', 'awaiting_parts', 'repairing', 'testing', 'ready', 'collected', 'cancelled']);
export const STATUS_LABELS = Object.freeze({
  intake: 'Intake', diagnosing: 'Diagnosing', awaiting_parts: 'Awaiting parts', repairing: 'Repairing',
  testing: 'Testing', ready: 'Ready', collected: 'Collected', cancelled: 'Cancelled',
});
export const TERMINAL = Object.freeze(['collected', 'cancelled']);
export const COMPLETED = Object.freeze(['ready', 'collected']);
const TRANSITIONS = Object.freeze({
  intake: ['diagnosing', 'cancelled'],
  diagnosing: ['awaiting_parts', 'repairing', 'ready', 'cancelled'],
  awaiting_parts: ['repairing', 'cancelled'],
  repairing: ['testing', 'awaiting_parts'],
  testing: ['ready', 'repairing'],
  ready: ['collected'],
  collected: [],
  cancelled: [],
});
export const PHOTO_LIMIT = 10;
export const PHOTO_STAGES = Object.freeze(['intake', 'before', 'after']);
export const LOG_KINDS = Object.freeze(['part', 'labour', 'note']);
export const SHEET_DISCLAIMER = 'Measurements are indicative bench results, not a warranty.';
export const DEFAULT_SPAN_FRACTION = 0.05;
/** The same input caps as src-tauri/src/service.rs (forms check them before the round trip). */
export const LIMITS = Object.freeze({ name: 120, phone: 40, email: 254, fault: 4000, condition: 2000, resolution: 4000, note: 4000, description: 200, accessories: 20, accessory: 80, nickname: 120, serial: 80, query: 100, statusNote: 500, quantity: 10000, unitCost: 10000000, minutes: 10080 });
export const STEPS = Object.freeze([['intake', 'Intake'], ['before', 'Before'], ['work', 'Work'], ['after', 'After'], ['sheet', 'Sheet']]);

// ------------------------------------------------------------------ status machine

export const isReadOnly = status => TERMINAL.includes(status);
export const statusLabel = status => STATUS_LABELS[status] || String(status ?? '');

/** Allowed targets from `from`; a terminal job can only be reopened (to diagnosing). */
export function nextStatuses(from, { reopen = false } = {}) {
  if (isReadOnly(from)) return reopen ? ['diagnosing'] : [];
  return reopen ? [] : [...(TRANSITIONS[from] || [])];
}

export function canTransition(from, to, { reopen = false } = {}) {
  if (!STATUSES.includes(from) || !STATUSES.includes(to)) return false;
  return nextStatuses(from, { reopen }).includes(to);
}

const JOB_NUMBER_RE = /^J-(\d{4})-(\d{4,})$/;
export const isJobNumber = s => JOB_NUMBER_RE.test(String(s ?? '').trim());
/** The typed confirmation for deleting a job (AC-7): exact job number, surrounding spaces ignored. */
export const deleteConfirmed = (job, typed) => !!job?.jobNumber && String(typed ?? '').trim() === job.jobNumber;

// ------------------------------------------------------------------ work log

/**
 * Resolves amendments: an entry amended by a later one is superseded (kept for the record, not counted).
 * Returns entries in time order with {superseded, amendment, amendedBy}.
 */
export function effectiveLog(log = []) {
  const list = Array.isArray(log) ? log : [];
  const by = new Map();
  for (const e of list) if (e?.amendsId) by.set(e.amendsId, e.id);
  return list.map(e => ({ ...e, superseded: by.has(e.id), amendedBy: by.get(e.id) ?? null, amendment: !!e.amendsId }));
}

/** Informational totals of the current (non-superseded) entries. Never an invoice. */
export function jobTotals(log = []) {
  let labourMinutes = 0, partsCost = 0, partCount = 0, unpricedParts = 0, labourEntries = 0, notes = 0;
  for (const e of effectiveLog(log)) {
    if (e.superseded) continue;
    if (e.kind === 'labour' && Number.isFinite(e.minutes)) { labourMinutes += e.minutes; labourEntries++; }
    else if (e.kind === 'part') {
      partCount++;
      const q = Number.isFinite(e.quantity) ? e.quantity : 1;
      if (Number.isFinite(e.unitCost)) partsCost += q * e.unitCost; else unpricedParts++;
    } else if (e.kind === 'note') notes++;
  }
  return { labourMinutes, labourHours: labourMinutes / 60, partsCost: Math.round(partsCost * 100) / 100, partCount, unpricedParts, labourEntries, notes };
}

// ------------------------------------------------------------------ before / after comparison

const finite = v => typeof v === 'number' && Number.isFinite(v);

/**
 * Comparison key of a value: (test id, metric key). Tests in one profile share metric ids (every midi:fader test
 * emits midi_fader_jitter_lsb), so a value is only ever paired with the same metric of the same test. Values from a
 * session linked without a test have no test id and pair with other test-less values by metric key.
 */
export function metricScopeKey(testId, metricKey) {
  return `${typeof testId === 'string' ? testId : ''}\u0000${metricKey}`;
}
const scopeOf = v => metricScopeKey(v.testId, v.metricKey);

/** Latest value per key (default: metric key; by `at`, then input order) among values with a finite number. */
export function latestPerMetric(values = [], keyOf = v => v.metricKey) {
  const out = new Map();
  (Array.isArray(values) ? values : []).forEach((v, i) => {
    if (!v || typeof v.metricKey !== 'string' || !finite(v.value)) return;
    const key = keyOf(v);
    const prev = out.get(key);
    const t = Date.parse(v.at) || 0;
    if (!prev || t > prev.t || (t === prev.t && i > prev.i)) out.set(key, { ...v, t, i });
  });
  for (const v of out.values()) { delete v.t; delete v.i; }
  return out;
}

function bandOf(key, metricKey, b, a, bands) {
  const given = bands?.[key] ?? bands?.[metricKey];
  const lo = finite(given?.lo) ? given.lo : finite(b?.referenceLow) ? b.referenceLow : finite(a?.referenceLow) ? a.referenceLow : null;
  const hi = finite(given?.hi) ? given.hi : finite(b?.referenceHigh) ? b.referenceHigh : finite(a?.referenceHigh) ? a.referenceHigh : null;
  return lo == null && hi == null ? null : { lo, hi };
}
const distance = (x, band) => (band.lo != null && x < band.lo ? band.lo - x : band.hi != null && x > band.hi ? x - band.hi : 0);
const inBand = (x, band) => distance(x, band) === 0;
/** Spec span: hi - lo for a two-sided band, |limit| for a one-sided one. */
function spanOf(band) {
  if (!band) return null;
  if (band.lo != null && band.hi != null) return Math.abs(band.hi - band.lo) || null;
  const v = band.hi ?? band.lo;
  return v ? Math.abs(v) : null;
}
function hib(opts, key, metricKey) {
  const h = opts.higherIsBetter;
  if (typeof h === 'function') return h(metricKey);
  if (h && typeof h === 'object') return typeof h[key] === 'boolean' ? h[key] : h[metricKey];
  return typeof h === 'boolean' ? h : undefined;
}

/**
 * Pairs the latest before and after value of each (test, metric) and judges the change.
 * before/after: [{metricKey, testId?, label?, value, unit, uncertainty?, methodKey?, methodVersion?, referenceLow?, referenceHigh?, at}]
 * opts: {higherIsBetter: bool | {key: bool} | (metricKey) => bool, bands: {key: {lo, hi}}, registry (analysis_method rows), k = 2,
 *        spanFraction = 0.05, testTitles: {testId: title}}. Object keys are a metricScopeKey (one test) or a bare metric key.
 * Rows carry `key` (the metricScopeKey), `testId` and `metricKey`; when one metric key appears under several tests
 * the row label is prefixed with the test title so the rows can be told apart.
 * Row status: 'improved' | 'worse' | 'unchanged' (|delta| <= k*u) | 'changed' (no direction known) | 'notComparable'
 * (different unit or method version) | 'missingAfter' | 'missingBefore'. Rows whose pass state flips (fail -> pass,
 * pass -> fail) come first.
 */
export function compareBeforeAfter(before = [], after = [], opts = {}) {
  const k = finite(opts.k) ? opts.k : 2;
  const spanFraction = finite(opts.spanFraction) ? opts.spanFraction : DEFAULT_SPAN_FRACTION;
  const B = latestPerMetric(before, scopeOf), A = latestPerMetric(after, scopeOf);
  const toRun = map => ({ measurements: [...map].map(([key, v]) => ({ metricId: key, label: v.label, value: v.value, unit: v.unit ?? '' })) });
  const paired = new Map(compareRuns(toRun(B), toRun(A)).map(p => [p.metricId, p]));
  const keys = [...new Set([...B.keys(), ...A.keys()])];
  const scopesPerMetric = new Map();
  for (const key of keys) {
    const m = (B.get(key) ?? A.get(key)).metricKey;
    scopesPerMetric.set(m, (scopesPerMetric.get(m) || 0) + 1);
  }
  const titles = opts.testTitles && typeof opts.testTitles === 'object' ? opts.testTitles : {};
  const rows = keys.map(key => {
    const b = B.get(key), a = A.get(key);
    const metricKey = (b ?? a).metricKey;
    const testId = typeof (b ?? a).testId === 'string' ? (b ?? a).testId : null;
    const metricLabel = b?.label || a?.label || metricKey;
    const testLabel = testId ? (typeof titles[testId] === 'string' && titles[testId]) || testId : 'Saved run';
    const label = scopesPerMetric.get(metricKey) > 1 ? `${testLabel} · ${metricLabel}` : metricLabel;
    const base = { key, metricKey, testId, label, unit: (b ?? a)?.unit ?? '', before: b?.value ?? null, after: a?.value ?? null, delta: null, uncertainty: null, assumed: false, status: null, passChange: null, reason: '' };
    if (!a) return { ...base, status: 'missingAfter', reason: 'No after value yet.' };
    if (!b) return { ...base, status: 'missingBefore', reason: 'No before value.' };
    const pair = paired.get(key);
    if (!pair) return { ...base, status: 'notComparable', reason: `Units differ (${b.unit || 'none'} before, ${a.unit || 'none'} after).` };
    const mb = { key: b.methodKey ?? metricKey, version: b.methodVersion ?? 1, unit: b.unit ?? null }, ma = { key: a.methodKey ?? metricKey, version: a.methodVersion ?? 1, unit: a.unit ?? null };
    if (!methodCompatible(mb, ma, opts.registry)) return { ...base, status: 'notComparable', reason: `Measured with different method versions (v${mb.version} before, v${ma.version} after).` };
    const band = bandOf(key, metricKey, b, a, opts.bands);
    let ub = finite(b.uncertainty) && b.uncertainty >= 0 ? b.uncertainty : null;
    let ua = finite(a.uncertainty) && a.uncertainty >= 0 ? a.uncertainty : null;
    let assumed = false;
    if (ub == null || ua == null) {
      const span = spanOf(band);
      const fallback = span != null ? spanFraction * span : spanFraction * Math.max(Math.abs(b.value), Math.abs(a.value));
      if (ub == null) ub = fallback;
      if (ua == null) ua = fallback;
      assumed = true;
    }
    const u = combinedUncertainty(ub, ua);
    const delta = pair.delta;
    const direction = hib(opts, key, metricKey);
    let status;
    const v = deltaVerdict(delta, u, { k, higherIsBetter: typeof direction === 'boolean' ? direction : undefined });
    if (v.verdict === 'unchanged') status = 'unchanged';
    else if (v.verdict === 'better') status = 'improved';
    else if (v.verdict === 'worse') status = 'worse';
    else if (v.verdict === 'changed' && band) {
      const db = distance(b.value, band), da = distance(a.value, band);
      status = da < db ? 'improved' : da > db ? 'worse' : 'changed';
    } else status = 'changed';
    let passChange = null;
    if (band) {
      const pb = inBand(b.value, band), pa = inBand(a.value, band);
      if (!pb && pa) passChange = 'fixed'; else if (pb && !pa) passChange = 'regressed';
    }
    return { ...base, delta, uncertainty: u, threshold: v.threshold, assumed, status, passChange, band };
  });
  const order = r => (r.passChange === 'fixed' ? 0 : r.passChange === 'regressed' ? 1 : 2);
  rows.sort((x, y) => order(x) - order(y) || x.label.localeCompare(y.label));
  return rows;
}

/** Latest status per test and phase; fail -> pass is "fixed", pass -> fail "regressed" (the sheet headline). */
export function testStatusChanges(tests = []) {
  const latest = { before: new Map(), after: new Map() };
  for (const t of Array.isArray(tests) ? tests : []) {
    if (!t || !latest[t.phase] || !t.testId) continue;
    const prev = latest[t.phase].get(t.testId);
    if (!prev || (Date.parse(t.at) || 0) >= (Date.parse(prev.at) || 0)) latest[t.phase].set(t.testId, t);
  }
  const out = [];
  for (const [id, a] of latest.after) {
    const b = latest.before.get(id);
    if (!b) continue;
    const change = b.status === 'fail' && a.status === 'pass' ? 'fixed' : b.status === 'pass' && a.status === 'fail' ? 'regressed' : null;
    out.push({ testId: id, title: a.title || b.title || id, before: b.status, after: a.status, change });
  }
  const order = r => (r.change === 'fixed' ? 0 : r.change === 'regressed' ? 1 : 2);
  return out.sort((x, y) => order(x) - order(y) || x.title.localeCompare(y.title));
}

/** "Compare is incomplete, 3 of 8 metrics have no after value" (n of m metrics with a before value). */
export function comparisonCompleteness(rows = []) {
  const withBefore = rows.filter(r => r.status !== 'missingBefore');
  const missing = withBefore.filter(r => r.status === 'missingAfter').length;
  const total = withBefore.length;
  const state = !rows.length ? 'empty' : missing ? 'partial' : 'complete';
  const message = state === 'partial' ? `Compare is incomplete, ${missing} of ${total} metric${total === 1 ? '' : 's'} ${missing === 1 ? 'has' : 'have'} no after value` : state === 'empty' ? 'No before or after values yet.' : `All ${total} metric${total === 1 ? '' : 's'} have before and after values.`;
  return { state, missing, total, message };
}

/** Full comparison from the job_comparison payload: rows, test headline, completeness. */
export function buildComparison(data = {}, opts = {}) {
  const values = Array.isArray(data?.values) ? data.values : [];
  const registry = (Array.isArray(data?.methods) ? data.methods : []).map(m => ({ key: m.key, version: m.version, parameters_json: m.parametersJson ?? m.parameters_json ?? '{}' }));
  const testTitles = {};
  for (const t of Array.isArray(data?.tests) ? data.tests : []) if (t && typeof t.testId === 'string' && typeof t.title === 'string' && t.title) testTitles[t.testId] ??= t.title;
  const rows = compareBeforeAfter(values.filter(v => v.phase === 'before'), values.filter(v => v.phase === 'after'), { registry, testTitles, ...opts });
  const tests = testStatusChanges(data?.tests);
  const headline = [...tests.filter(t => t.change).map(t => ({ kind: 'test', ...t })), ...rows.filter(r => r.passChange).map(r => ({ kind: 'metric', title: r.label, change: r.passChange }))]
    .sort((x, y) => (x.change === 'fixed' ? 0 : 1) - (y.change === 'fixed' ? 0 : 1));
  return { rows, tests, headline, completeness: comparisonCompleteness(rows) };
}

/**
 * Direction hints from a device profile's pass criteria: `<=` lower is better, `>=` higher, `abs<=`/`between` a band.
 * Each hint is stored under the bare metric id and, for a test with an id, under its metricScopeKey (that test only).
 */
export function directionHints(profile) {
  const higherIsBetter = {}, bands = {};
  for (const t of profile?.tests || []) {
    const p = t?.pass;
    if (!p || typeof p.metricId !== 'string' || !finite(p.value)) continue;
    const keys = typeof t.id === 'string' && t.id ? [p.metricId, metricScopeKey(t.id, p.metricId)] : [p.metricId];
    for (const k of keys) {
      if (p.op === '<=') { higherIsBetter[k] = false; bands[k] = { lo: null, hi: p.value }; }
      else if (p.op === '>=') { higherIsBetter[k] = true; bands[k] = { lo: p.value, hi: null }; }
      else if (p.op === 'abs<=') bands[k] = { lo: -Math.abs(p.value), hi: Math.abs(p.value) };
      else if (p.op === 'between' && finite(p.value2)) bands[k] = { lo: Math.min(p.value, p.value2), hi: Math.max(p.value, p.value2) };
    }
  }
  return { higherIsBetter, bands };
}

// ------------------------------------------------------------------ stepper

/**
 * Stepper for the job detail: Intake > Before > Work > After > Sheet. state: 'done' | 'blocked' | 'todo'.
 * `current` marks the first step that is not done (or the Sheet when all are).
 */
export function stepperState(detail, comparison = null) {
  const job = detail?.job || {};
  const results = Array.isArray(detail?.results) ? detail.results : [];
  const log = effectiveLog(detail?.log).filter(e => !e.superseded);
  const has = phase => results.some(r => r.phase === phase);
  const readOnly = isReadOnly(job.status);
  const steps = STEPS.map(([id, label]) => ({ id, label, state: 'todo', reason: '' }));
  const set = (id, state, reason = '') => Object.assign(steps.find(s => s.id === id), { state, reason });
  set('intake', job.id && job.reportedFault ? 'done' : 'todo');
  if (has('before')) set('before', 'done', 'Pre-repair results linked.');
  else if (readOnly) set('before', 'blocked', `The job is ${statusLabel(job.status).toLowerCase()} (read-only).`);
  else set('before', 'todo', 'Run pre-repair tests.');
  if (log.length) set('work', 'done', `${log.length} work-log entr${log.length === 1 ? 'y' : 'ies'}.`);
  else if (readOnly) set('work', 'blocked', 'The job is read-only.');
  else set('work', 'todo', 'Add parts, labour or notes.');
  if (has('after')) set('after', comparison?.completeness?.state === 'partial' ? 'todo' : 'done', comparison?.completeness?.state === 'partial' ? comparison.completeness.message : 'Post-repair results linked.');
  else if (!has('before')) set('after', 'blocked', 'Run the pre-repair tests first.');
  else if (readOnly) set('after', 'blocked', 'The job is read-only.');
  else set('after', 'todo', 'Run post-repair tests.');
  set('sheet', COMPLETED.includes(job.status) ? 'done' : 'todo', COMPLETED.includes(job.status) ? 'Job completed: the sheet is final.' : 'Preview available; the sheet is final once the job is Ready.');
  const current = steps.find(s => s.state !== 'done' && s.state !== 'blocked') ?? steps.at(-1);
  return steps.map(s => ({ ...s, current: s === current }));
}

/** Index of the step after/before `id` (clamped), for Alt+Right / Alt+Left. */
export function stepIndex(id, delta = 0) {
  const i = STEPS.findIndex(([s]) => s === id);
  return Math.max(0, Math.min(STEPS.length - 1, (i < 0 ? 0 : i) + delta));
}

// ------------------------------------------------------------------ units and privacy helpers

/** Default nickname for a unit created at intake: model and serial, never the customer. */
export function newUnitNickname(model, serial) {
  const m = String(model || 'Service unit').trim().slice(0, 90);
  const s = String(serial || '').trim().slice(0, 24);
  return s ? `${m} · ${s}` : m;
}
/** Mirrors the Rust guard: unit names travel into exports, so they must not contain the customer's name. */
export function nicknameMentionsCustomer(nickname, customerName) {
  const c = String(customerName || '').trim().toLowerCase();
  return c.length >= 3 && String(nickname || '').toLowerCase().includes(c);
}
/** The only service state that may be stored in UI settings (which the diagnostics bundle includes). */
export function listPrefsForSettings(prefs = {}) {
  const status = STATUSES.includes(prefs.status) || prefs.status === 'open' ? prefs.status : 'all';
  return { status };
}

// ------------------------------------------------------------------ job sheet

const pad = n => String(n).padStart(2, '0');
export function when(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtNum(v, digits = null) {
  if (!finite(v)) return '—';
  const abs = Math.abs(v);
  const d = digits ?? (abs >= 100 ? 1 : abs >= 10 ? 2 : 3);
  return Number(v.toFixed(d)).toString().replace('-', '−');
}
/** Part quantity: fractions are valid (0.25 m of wire), so show up to 3 decimals with trailing zeros trimmed. */
export function fmtQty(v) { return fmtNum(v, 3); }
export function fmtSigned(v) { return finite(v) ? `${v > 0 ? '+' : ''}${fmtNum(v)}` : '—'; }
export function fmtMoney(v, currency = '') { return finite(v) ? `${currency}${v.toFixed(2)}` : '—'; }
export const ROW_STATUS_TEXT = Object.freeze({
  improved: 'Improved', worse: 'Worse', unchanged: 'Unchanged within uncertainty', changed: 'Changed (direction unknown)',
  notComparable: 'Not comparable', missingAfter: 'No after value', missingBefore: 'No before value',
});
export const CHANGE_TEXT = Object.freeze({ fixed: 'Fail → Pass', regressed: 'Pass → Fail' });

/** Everything the sheet shows, already decided (privacy and costs applied). */
export function jobSheetModel(detail, comparison, opts = {}) {
  const includeCosts = !!opts.includeCosts, includeCustomer = !!opts.includeCustomer;
  const job = detail?.job || {};
  const log = effectiveLog(detail?.log);
  const totals = jobTotals(detail?.log);
  return {
    jobNumber: job.jobNumber || '', status: job.status, statusLabel: statusLabel(job.status), final: COMPLETED.includes(job.status),
    openedAt: job.openedAt, closedAt: job.closedAt, updatedAt: job.updatedAt,
    customer: includeCustomer && detail?.customer ? { name: detail.customer.name, phone: detail.customer.phone || '', email: detail.customer.email || '' } : null,
    unit: detail?.asset ? { name: detail.asset.nickname, serial: detail.asset.serialNumber || '' } : null,
    fault: job.reportedFault || '', accessories: job.accessories || [], condition: job.arrivalCondition || '', resolution: job.resolution || '',
    parts: log.filter(e => e.kind === 'part').map(e => ({ ...e, lineTotal: includeCosts && finite(e.unitCost) ? (finite(e.quantity) ? e.quantity : 1) * e.unitCost : null, unitCost: includeCosts ? e.unitCost : null })),
    labour: log.filter(e => e.kind === 'labour'),
    notes: log.filter(e => e.kind === 'note'),
    totals: { labourHours: totals.labourHours, labourMinutes: totals.labourMinutes, partsCost: includeCosts ? totals.partsCost : null, unpricedParts: totals.unpricedParts },
    comparison: comparison || { rows: [], tests: [], headline: [], completeness: comparisonCompleteness([]) },
    includeCosts, includeCustomer, currency: String(opts.currency ?? '').slice(0, 4),
    photos: (detail?.photos || []).map(p => ({ caption: p.caption || '', stage: p.stage || '' })),
  };
}

/**
 * HTML fragment for the FS-03 printable kind "jobSheet". `esc` must HTML-escape (report-pdf passes ctx.esc).
 * Every free-text value goes through esc; statuses are words, never colour alone.
 */
export function renderJobSheetHtml(detail, comparison, opts = {}, esc = defaultEsc) {
  const m = jobSheetModel(detail, comparison, opts);
  const multiline = s => esc(s).replace(/\r?\n/g, '<br>');
  const amended = e => (e.superseded ? ' <em>(amended, see later entry)</em>' : e.amendment ? ' <em>(amended)</em>' : '');
  const out = [];
  out.push(`<h2>Job ${esc(m.jobNumber)}</h2>`);
  if (!m.final) out.push(`<p class="dc-note"><strong>Draft:</strong> this job is ${esc(m.statusLabel)}; the sheet is final once the job is Ready.</p>`);
  const facts = [['Status', m.statusLabel], ['Opened', when(m.openedAt)], ['Closed', m.closedAt ? when(m.closedAt) : ''], ['Unit', m.unit?.name], ['Serial number', m.unit?.serial]];
  if (m.customer) facts.push(['Customer', m.customer.name], ['Phone', m.customer.phone], ['Email', m.customer.email]);
  out.push(`<table class="dc-kv"><caption>Job details</caption><tbody>${facts.filter(([, v]) => v).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`);
  out.push(`<h2>Reported fault</h2><p>${multiline(m.fault)}</p>`);
  if (m.accessories.length) out.push(`<h3>Accessories received</h3><ul>${m.accessories.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`);
  if (m.condition) out.push(`<h3>Condition on arrival</h3><p>${multiline(m.condition)}</p>`);

  const cmp = m.comparison;
  out.push('<h2>Before and after</h2>');
  if (cmp.headline?.length) out.push(`<ul class="dc-headline">${cmp.headline.map(h => `<li><strong>${esc(CHANGE_TEXT[h.change] || h.change)}:</strong> ${esc(h.title)}</li>`).join('')}</ul>`);
  if (cmp.completeness?.state === 'partial') out.push(`<p class="dc-note">${esc(cmp.completeness.message)}.</p>`);
  if (cmp.rows?.length) {
    out.push(`<table><caption>Measured values before and after the repair (change judged at k = 2)</caption><thead><tr><th scope="col">Metric</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Change</th><th scope="col">Result</th></tr></thead><tbody>${cmp.rows.map(r => `<tr><th scope="row">${esc(r.label)}${r.unit ? ` (${esc(r.unit)})` : ''}</th><td class="dc-num">${esc(fmtNum(r.before))}</td><td class="dc-num">${esc(fmtNum(r.after))}</td><td class="dc-num">${esc(fmtSigned(r.delta))}${finite(r.uncertainty) ? ` ± ${esc(fmtNum(2 * r.uncertainty))}${r.assumed ? '*' : ''}` : ''}</td><td>${esc(ROW_STATUS_TEXT[r.status] || r.status)}${r.passChange ? ` · ${esc(CHANGE_TEXT[r.passChange])}` : ''}${r.status === 'notComparable' && r.reason ? ` (${esc(r.reason)})` : ''}</td></tr>`).join('')}</tbody></table>`);
    if (cmp.rows.some(r => r.assumed)) out.push('<p class="dc-note">* Uncertainty not recorded: assumed 5 % of the specification span (or of the reading when no span is known).</p>');
  } else out.push('<p>No measured values are linked to this job yet.</p>');
  if (cmp.tests?.length) out.push(`<table><caption>Test results before and after</caption><thead><tr><th scope="col">Test</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>${cmp.tests.map(t => `<tr><th scope="row">${esc(t.title)}</th><td>${esc(String(t.before).toUpperCase())}</td><td>${esc(String(t.after).toUpperCase())}</td></tr>`).join('')}</tbody></table>`);

  out.push('<h2>Work log</h2>');
  if (m.parts.length) out.push(`<table><caption>Parts</caption><thead><tr><th scope="col">Part</th><th scope="col">Qty</th>${m.includeCosts ? '<th scope="col">Unit cost</th><th scope="col">Line total</th>' : ''}<th scope="col">Added</th></tr></thead><tbody>${m.parts.map(e => `<tr><td>${esc(e.description)}${amended(e)}</td><td class="dc-num">${esc(fmtQty(finite(e.quantity) ? e.quantity : 1))}</td>${m.includeCosts ? `<td class="dc-num">${esc(fmtMoney(e.unitCost, m.currency))}</td><td class="dc-num">${esc(fmtMoney(e.lineTotal, m.currency))}</td>` : ''}<td>${esc(when(e.at))}</td></tr>`).join('')}</tbody></table>`);
  if (m.labour.length) out.push(`<table><caption>Labour</caption><thead><tr><th scope="col">Work</th><th scope="col">Minutes</th><th scope="col">Added</th></tr></thead><tbody>${m.labour.map(e => `<tr><td>${esc(e.description)}${amended(e)}</td><td class="dc-num">${esc(fmtNum(e.minutes, 0))}</td><td>${esc(when(e.at))}</td></tr>`).join('')}</tbody></table>`);
  if (m.notes.length) out.push(`<h3>Notes</h3><ul class="dc-notes">${m.notes.map(e => `<li><span>${esc(when(e.at))}</span> ${multiline(e.description)}${amended(e)}</li>`).join('')}</ul>`);
  if (!m.parts.length && !m.labour.length && !m.notes.length) out.push('<p>No work recorded.</p>');
  out.push(`<p><strong>Totals (informational, not an invoice):</strong> labour ${esc(fmtNum(m.totals.labourHours, 2))} h${m.includeCosts ? `; parts ${esc(fmtMoney(m.totals.partsCost, m.currency))}${m.totals.unpricedParts ? ` (${m.totals.unpricedParts} part${m.totals.unpricedParts === 1 ? '' : 's'} without a price)` : ''}` : ''}.</p>`);
  if (m.resolution) out.push(`<h2>Resolution</h2><p>${multiline(m.resolution)}</p>`);
  if (m.photos.length) out.push(`<p>${m.photos.length} photo${m.photos.length === 1 ? '' : 's'} on file${m.photos.some(p => p.caption) ? `: ${m.photos.filter(p => p.caption).map(p => esc(p.caption)).join('; ')}` : ''}.</p>`);
  out.push('<div class="dc-signatures"><p>Technician signature: ______________________________ Date: ______________</p><p>Received by: ______________________________ Date: ______________</p></div>');
  out.push(`<p class="dc-disclaimer"><strong>${esc(SHEET_DISCLAIMER)}</strong></p>`);
  return out.join('\n');
}

function defaultEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Data object for exportPdf('jobSheet', data). */
export function jobSheetPrintData(detail, comparison, opts = {}) {
  return { detail, comparison, options: { includeCosts: !!opts.includeCosts, includeCustomer: !!opts.includeCustomer, currency: opts.currency ?? '' } };
}
