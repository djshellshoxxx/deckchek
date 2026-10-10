// Stylus wear tracker model (FS-12). Pure functions; no DOM, no storage.
// Hours maths (mergeIntervals / totalHours / proposeFromSessions) is NOT duplicated:
// it comes from the shared ledger helpers in usage-hours.js. This file adds the
// stylus-specific pieces: rated-life lookup, life status, benchmark regression and
// degradation verdicts, replacement projection, snoozes, and a thin bridge to the
// stylus_* Rust commands.

import { totalHours, proposeFromSessions, HOUR_MS, DEFAULT_CAP_HOURS } from './usage-hours.js';
import { trendMetrics } from './diagnostics.js';

export const GENERIC_RATED_HOURS = 500;
export const DEFAULT_THRESHOLDS = Object.freeze({ amberPct: 80, redPct: 100 });
export const SNOOZE_DAYS = 30;
export const MIN_TREND_POINTS = 3;
export const RATE_WINDOW_DAYS = 30;
/** Tunable degradation limits (FS-12 §6; no authoritative source). */
export const DEGRADATION = Object.freeze({
  thdPointsOverBaseline: 1, thdRatio: 2, separationDropDb: 3, snrDropDb: 6, phaseRiseDeg: 8, slopeP: 0.1,
});
/** metric key -> { worse: direction of degradation, label, unit } */
export const METRICS = Object.freeze({
  thdPercent: { worse: 'up', label: 'THD', unit: '%' },
  separationDb: { worse: 'down', label: 'Channel separation', unit: 'dB' },
  tcSnrDb: { worse: 'down', label: 'Timecode SNR', unit: 'dB' },
  tcPhaseErrorDeg: { worse: 'up', label: 'Timecode phase error', unit: 'deg' },
});
const DAY_MS = 86400000;

const pick = (o, camel, snake) => (o[camel] !== undefined ? o[camel] : o[snake]);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const toMs = v => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN);

// ------------------------------------------------------------------ rated life catalogue

/** Validate and normalise a stylus-life.json document (version 1). Throws on a bad shape. */
export function migrateLife(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('stylus-life: not an object');
  const version = doc.version ?? 1;
  if (version !== 1) throw new Error(`stylus-life: unsupported version ${version}`);
  if (!Array.isArray(doc.entries)) throw new Error('stylus-life: entries must be an array');
  const entries = doc.entries.map((e, i) => {
    if (!e || typeof e.model !== 'string' || !e.model) throw new Error(`stylus-life: entry ${i} needs a model`);
    const ratedHours = e.ratedHours === null || e.ratedHours === undefined ? null : e.ratedHours;
    if (ratedHours !== null && !(finite(ratedHours) && ratedHours > 0 && ratedHours <= 100000)) throw new Error(`stylus-life: entry ${i} has bad ratedHours`);
    // Provenance rule: a number must say where it came from or be marked unverified.
    if (ratedHours !== null && !e.source && e.verified !== false && !e.notes) throw new Error(`stylus-life: entry ${i} has hours but no source and is not marked unverified`);
    return {
      model: e.model,
      match: (Array.isArray(e.match) && e.match.length ? e.match : [e.model]).map(s => String(s).toLowerCase()),
      ratedHours,
      range: Array.isArray(e.range) && e.range.length === 2 ? e.range : null,
      confidence: e.confidence || 'unknown',
      verified: e.verified === true,
      source: e.source || null,
      notes: e.notes || '',
    };
  });
  return { version: 1, fallbackHours: finite(doc.fallbackHours) && doc.fallbackHours > 0 ? doc.fallbackHours : GENERIC_RATED_HOURS, entries };
}

/** First catalogue entry whose match strings occur in the model/nickname text (longest match wins). */
export function findLifeEntry(catalogue, text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  let best = null, bestLen = 0;
  for (const e of catalogue?.entries ?? []) {
    for (const m of e.match ?? [e.model.toLowerCase()]) if (t.includes(m) && m.length > bestLen) { best = e; bestLen = m.length; }
  }
  return best;
}

/**
 * ratedHours = asset.rated_life_hours ?? catalogue ?? 500 (FS-12 §6). `source` says which,
 * and `generic` is true when no model-specific figure exists (UI shows the partial state).
 */
export function resolveRatedHours({ assetRatedHours = null, catalogue = null, modelText = '' } = {}) {
  if (finite(assetRatedHours) && assetRatedHours > 0) return { hours: assetRatedHours, source: 'asset', generic: false, entry: null };
  const entry = findLifeEntry(catalogue, modelText);
  if (entry && entry.ratedHours) return { hours: entry.ratedHours, source: 'catalogue', generic: false, entry };
  return { hours: catalogue?.fallbackHours ?? GENERIC_RATED_HOURS, source: 'fallback', generic: true, entry: entry || null };
}

// ------------------------------------------------------------------ hours and status

/** Latest `stylus_replaced` maintenance event time (ISO) or null. Events: { eventType|event_type, eventAt|event_at }. */
export function replacementBaseline(events) {
  let best = null, bestMs = -Infinity;
  for (const ev of Array.isArray(events) ? events : []) {
    if (!ev || pick(ev, 'eventType', 'event_type') !== 'stylus_replaced') continue;
    const at = pick(ev, 'eventAt', 'event_at');
    const ms = toMs(at);
    if (Number.isFinite(ms) && ms > bestMs) { best = at; bestMs = ms; }
  }
  return best;
}

/** Confirmed hours since the last replacement (all sources merged by priority, overlaps not double counted). */
export function hoursSinceInstall(entries, events = []) {
  return totalHours(entries, { since: replacementBaseline(events) });
}

/** Percent of rated life used; status `ok` < amber% <= `amber` < red% <= `red`. Exact at the boundaries. */
export function lifeStatus(hours, ratedHours, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const rated = finite(ratedHours) && ratedHours > 0 ? ratedHours : GENERIC_RATED_HOURS;
  const h = finite(hours) && hours > 0 ? hours : 0;
  const pct = (h / rated) * 100;
  // compare hours*100 with rated*pct to stay exact for round numbers
  const status = h * 100 >= rated * t.redPct ? 'red' : h * 100 >= rated * t.amberPct ? 'amber' : 'ok';
  const label = status === 'red' ? 'Replace or inspect' : status === 'amber' ? 'Nearing rated life' : 'Within rated life';
  return { hours: h, ratedHours: rated, pct, pctRounded: Math.round(pct), remaining: Math.max(0, rated - h), status, label };
}

/** Trailing usage rate in hours/day over the last `windowDays` (confirmed, merged, clipped to the window and the baseline). */
export function usageRatePerDay(entries, { now = Date.now(), windowDays = RATE_WINDOW_DAYS, since = null } = {}) {
  const nowMs = toMs(now);
  let from = nowMs - windowDays * DAY_MS;
  const base = since ? toMs(since) : NaN;
  if (Number.isFinite(base) && base > from) from = base;
  const span = (nowMs - from) / DAY_MS;
  if (!(span > 0)) return 0;
  return totalHours(entries, { since: from, until: nowMs }) / span;
}

/** Date the rated life runs out at the trailing rate. `date` is null when it cannot be projected. */
export function projectReplaceDate(entries, ratedHours, { now = Date.now(), events = [], windowDays = RATE_WINDOW_DAYS } = {}) {
  const nowMs = toMs(now);
  const used = hoursSinceInstall(entries, events);
  const remaining = ratedHours - used;
  if (remaining <= 0) return { date: new Date(nowMs).toISOString(), reason: 'due', ratePerDay: 0, remaining: 0 };
  const rate = usageRatePerDay(entries, { now: nowMs, windowDays, since: replacementBaseline(events) });
  if (!(rate > 0)) return { date: null, reason: 'no-recent-use', ratePerDay: 0, remaining };
  return { date: new Date(nowMs + (remaining / rate) * DAY_MS).toISOString(), reason: 'projected', ratePerDay: rate, remaining };
}

// ------------------------------------------------------------------ proposals

/** DVS capture sessions -> unconfirmed `deckchek` proposals (AC-2; 40 min -> 0.6667 h). */
export function proposeFromDvsSessions(sessions, assetId, opts = {}) {
  return proposeFromSessions((sessions || []).map(s => ({ ...s, source: 'deckchek' })), assetId, opts);
}

/**
 * list_capture_sessions rows -> unconfirmed `deckchek` proposals (AC-2). Only `live` captures count: a `file` run is
 * an analysed recording, not time the stylus played now, and rows without a kind predate capture timing. Rows already
 * in the ledger (same sessionId in `existing`) are skipped by the shared proposer.
 */
export function proposeFromCaptureSessions(rows, assetId, { existing = [], capHours = DEFAULT_CAP_HOURS } = {}) {
  const sessions = (Array.isArray(rows) ? rows : [])
    .filter(r => r && r.kind === 'live' && (r.assetId == null || r.assetId === assetId || r.setupId))
    .map(r => ({ id: r.id, startedAt: pick(r, 'startedAt', 'started_at'), endedAt: pick(r, 'endedAt', 'ended_at') }));
  return proposeFromDvsSessions(sessions, assetId, { existing, capHours });
}

/**
 * dj_session_spans() -> unconfirmed `djlog` proposals (AC-3, best effort). Spans already
 * represented by a ledger row with the same start are skipped. Overlap with manual or other
 * entries is resolved later by the ledger's priority merge, so nothing is double counted.
 * Proposals carry no sessionId: a log span is not a database session.
 */
export function proposeFromLogs(spans, assetId, { existing = [], capHours = DEFAULT_CAP_HOURS } = {}) {
  const known = new Set((existing || []).filter(x => x && x.source === 'djlog').map(x => toMs(pick(x, 'startedAt', 'started_at'))));
  const sessions = (Array.isArray(spans) ? spans : [])
    .filter(s => s && toMs(s.start) > 0 && !known.has(toMs(s.start)))
    .map(s => ({ id: `djlog:${s.app}:${s.start}`, startedAt: s.start, endedAt: s.end, source: 'djlog', app: s.app }));
  return proposeFromSessions(sessions, assetId, { capHours }).map(p => ({ ...p, sessionId: null, note: sessions.find(s => s.id === p.sessionId)?.app ?? null }));
}

// ------------------------------------------------------------------ benchmark auto-fill

const runValue = (run, id) => {
  const m = (run?.measurements || []).find(x => x && x.metricId === id && finite(x.value));
  return m ? m.value : undefined;
};

/**
 * Timecode benchmark values from saved runs (newest first, as list_runs returns them): the first run carrying
 * tc_snr_db fills tcSnrDb, tcPhaseErrorDeg and tcDropouts from that same run, so the three describe one capture.
 * Returns {} when no run has timecode measurements; `tcRun` names the source run.
 */
export function timecodeBenchmarkFromRuns(runs) {
  for (const run of Array.isArray(runs) ? runs : []) {
    const snr = runValue(run, 'tc_snr_db');
    if (snr === undefined) continue;
    const out = { tcSnrDb: snr, tcRun: run.id ?? null };
    const phase = runValue(run, 'tc_phase_error_deg');
    if (phase !== undefined) out.tcPhaseErrorDeg = phase;
    const drops = runValue(run, 'tc_dropouts');
    if (drops !== undefined) out.tcDropouts = Math.max(0, Math.round(drops));
    return out;
  }
  return {};
}

// ------------------------------------------------------------------ regression

function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5;
  t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015;
  for (const k of c) s += k / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
function betacf(a, b, x) {
  const FPMIN = 1e-300;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return h;
}
function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
/** Two-sided p-value of Student's t with `df` degrees of freedom. */
export function tTwoSidedP(t, df) {
  if (!Number.isFinite(t)) return t === 0 ? 1 : 0;
  return betai(df / 2, 0.5, df / (df + t * t));
}
/** Two-sided critical t for confidence `conf` (default 95 %), by bisection. */
export function tCritical(df, conf = 0.95) {
  const alpha = 1 - conf;
  let lo = 0, hi = 1000;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tTwoSidedP(mid, df) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * OLS of y on x (hours). points: [{x, y}] (alias {hours, value}). Wraps trendMetrics from
 * diagnostics.js for slope / intercept / R^2, and adds the slope's standard error, 95 % CI and p.
 * Fewer than 3 usable points -> { enough:false, message }.
 */
export function regress(points) {
  const pts = (Array.isArray(points) ? points : [])
    .map(p => ({ x: p.x ?? p.hours, y: p.y ?? p.value }))
    .filter(p => finite(p.x) && finite(p.y));
  const n = pts.length;
  if (n < MIN_TREND_POINTS) return { enough: false, n, message: `Need ${MIN_TREND_POINTS} benchmarks for a trend` };
  const fit = trendMetrics(pts.map(p => ({ timeMin: p.x, value: p.y })));
  if (!finite(fit.slopePerMin)) return { enough: false, n, message: 'Benchmarks need different hour values for a trend' };
  const slope = fit.slopePerMin, intercept = fit.intercept;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const ssRes = pts.reduce((a, p) => a + (p.y - (intercept + slope * p.x)) ** 2, 0);
  const df = n - 2;
  const se = Math.sqrt(ssRes / df / sxx);
  const tc = tCritical(df);
  const p = se < 1e-12 ? (Math.abs(slope) < 1e-12 ? 1 : 0) : tTwoSidedP(slope / se, df);
  const half = se * tc;
  return {
    enough: true, n, slope, intercept, r2: fit.rSquared, se, p,
    slopePer100h: slope * 100,
    ci95Per100h: [(slope - half) * 100, (slope + half) * 100],
  };
}

// ------------------------------------------------------------------ benchmark verdicts

const num = (b, camel, snake) => { const v = pick(b, camel, snake); return finite(v) ? v : null; };
/** Normalise a benchmark row (camel or snake keys) to { id, hoursAt, valid, createdAt, thdPercent, ... }. */
export function normalizeBenchmark(b) {
  return {
    id: b.id ?? null,
    hoursAt: num(b, 'hoursAt', 'hours_at'),
    valid: !(b.valid === 0 || b.valid === false),
    createdAt: pick(b, 'createdAt', 'created_at') ?? null,
    thdPercent: num(b, 'thdPercent', 'thd_percent'),
    separationDb: num(b, 'separationDb', 'separation_db'),
    tcSnrDb: num(b, 'tcSnrDb', 'tc_snr_db'),
    tcPhaseErrorDeg: num(b, 'tcPhaseErrorDeg', 'tc_phase_error_deg'),
    tcDropouts: num(b, 'tcDropouts', 'tc_dropouts'),
  };
}
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Valid benchmarks, oldest first (by hoursAt, then createdAt). Invalid ones never enter regression or verdicts. */
export function validBenchmarks(history) {
  return (Array.isArray(history) ? history : []).map(normalizeBenchmark).filter(b => b.valid && b.hoursAt !== null)
    .sort((a, b) => a.hoursAt - b.hoursAt || String(a.createdAt).localeCompare(String(b.createdAt)));
}

/** Median of the first two valid benchmarks, per metric (the baseline for degradation). */
export function benchmarkBaseline(history) {
  const first = validBenchmarks(history).slice(0, 2);
  const out = {};
  for (const k of Object.keys(METRICS)) {
    const vals = first.map(b => b[k]).filter(v => v !== null);
    out[k] = vals.length ? median(vals) : null;
  }
  const d = first.map(b => b.tcDropouts).filter(v => v !== null);
  out.tcDropouts = d.length ? Math.max(...d) : null;
  return out;
}

/** Does value `v` cross the degradation limit versus baseline `base`? Strictly beyond the limit. */
export function crossesLimit(metric, v, base, limits = DEGRADATION) {
  if (v === null || v === undefined || base === null || base === undefined) return false;
  switch (metric) {
    case 'thdPercent': return v - base > limits.thdPointsOverBaseline || v > limits.thdRatio * base;
    case 'separationDb': return base - v > limits.separationDropDb;
    case 'tcSnrDb': return base - v > limits.snrDropDb;
    case 'tcPhaseErrorDeg': return v - base > limits.phaseRiseDeg;
    default: return false;
  }
}
const crossesDropouts = (v, base) => v !== null && base !== null && base === 0 && v > 0;

/** The direction-of-degradation limit as a metric value (used to project when the fitted line meets it). */
export function limitValue(metric, base, limits = DEGRADATION) {
  switch (metric) {
    case 'thdPercent': return base + Math.min(limits.thdPointsOverBaseline, base * (limits.thdRatio - 1) || limits.thdPointsOverBaseline);
    case 'separationDb': return base - limits.separationDropDb;
    case 'tcSnrDb': return base - limits.snrDropDb;
    case 'tcPhaseErrorDeg': return base + limits.phaseRiseDeg;
    default: return NaN;
  }
}

/**
 * Degradation verdict over the benchmark history (FS-12 §6, AC-6). A metric alerts when the
 * last two valid benchmarks (both after the two-benchmark baseline) both cross the limit, or when
 * >= 3 valid points have a regression slope in the worsening direction with p < 0.1 AND the latest
 * point has crossed. `replacementSuspected` is set when the newest benchmark improved by more than
 * the same limits versus the previous one ("did you replace the stylus?").
 */
export function benchmarkVerdict(history, limits = DEGRADATION) {
  const valid = validBenchmarks(history);
  const base = benchmarkBaseline(history);
  const alerts = [];
  const fits = {};
  for (const [metric, info] of Object.entries(METRICS)) {
    const series = valid.filter(b => b[metric] !== null);
    if (series.length < 2 || base[metric] === null) continue;
    const fit = regress(series.map(b => ({ x: b.hoursAt, y: b[metric] })));
    fits[metric] = fit;
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    const idxLast = valid.indexOf(last), idxPrev = valid.indexOf(prev);
    const consecutive = idxPrev >= 2 && crossesLimit(metric, last[metric], base[metric], limits) && crossesLimit(metric, prev[metric], base[metric], limits);
    const worsening = fit.enough && fit.p < limits.slopeP && (info.worse === 'up' ? fit.slope > 0 : fit.slope < 0);
    const trend = worsening && idxLast >= 2 && crossesLimit(metric, last[metric], base[metric], limits);
    if (consecutive || trend) {
      alerts.push({
        kind: `bench:${metric}`, metric, severity: 'amber', reason: consecutive ? 'consecutive' : 'trend',
        baseline: base[metric], latest: last[metric], delta: last[metric] - base[metric], unit: info.unit,
        message: `${info.label} ${info.worse === 'up' ? 'rose' : 'fell'} ${Math.abs(last[metric] - base[metric]).toFixed(2)} ${info.unit} since install. Inspect the stylus.`,
      });
    }
  }
  const dropSeries = valid.filter(b => b.tcDropouts !== null);
  if (dropSeries.length >= 4 && base.tcDropouts === 0) {
    const [prev, last] = dropSeries.slice(-2);
    if (valid.indexOf(prev) >= 2 && crossesDropouts(last.tcDropouts, 0) && crossesDropouts(prev.tcDropouts, 0)) {
      alerts.push({ kind: 'bench:tcDropouts', metric: 'tcDropouts', severity: 'amber', reason: 'consecutive', baseline: 0, latest: last.tcDropouts, delta: last.tcDropouts, unit: '', message: 'Timecode dropouts appeared on a side that was clean at install. Inspect the stylus.' });
    }
  }
  let replacementSuspected = false;
  if (valid.length >= 2) {
    const last = valid[valid.length - 1], prev = valid[valid.length - 2];
    const better = (m, a, b) => a !== null && b !== null && crossesLimit(m, b, a, limits); // last improved if prev (as v) is worse than last (as base) by more than a limit
    for (const m of Object.keys(METRICS)) {
      if (better(m, last[m], prev[m])) replacementSuspected = true;
    }
  }
  return { alerts, fits, baseline: base, validCount: valid.length, replacementSuspected };
}

/** Hours at which a fitted metric line meets the degradation limit, and the date at the trailing usage rate. */
export function projectThresholdDate(fit, metric, baselineValue, { hoursNow, ratePerDay, now = Date.now() }) {
  if (!fit?.enough || baselineValue === null || !(ratePerDay > 0)) return { date: null, hoursAtLimit: null };
  const target = limitValue(metric, baselineValue);
  if (!finite(target) || Math.abs(fit.slope) < 1e-12) return { date: null, hoursAtLimit: null };
  const hoursAtLimit = (target - fit.intercept) / fit.slope;
  const toward = METRICS[metric].worse === 'up' ? fit.slope > 0 : fit.slope < 0;
  if (!toward) return { date: null, hoursAtLimit: null };
  const remaining = Math.max(0, hoursAtLimit - hoursNow);
  return { date: new Date(toMs(now) + (remaining / ratePerDay) * DAY_MS).toISOString(), hoursAtLimit };
}

// ------------------------------------------------------------------ alerts and snooze

export function snoozeUntil(now = Date.now(), days = SNOOZE_DAYS) {
  return new Date(toMs(now) + days * DAY_MS).toISOString();
}
export function isSnoozed(alertRow, now = Date.now()) {
  const until = toMs(pick(alertRow || {}, 'snoozedUntil', 'snoozed_until'));
  return Number.isFinite(until) && until > toMs(now);
}

/**
 * All active alerts for an asset: life (amber/red) plus benchmark degradation, each marked
 * `snoozed` using the stored snooze rows ({ kind, snoozedUntil }). Red outranks amber.
 */
export function stylusAlerts({ hours, ratedHours, history = [], snoozes = [], thresholds = {}, now = Date.now() }) {
  const life = lifeStatus(hours, ratedHours, thresholds);
  const verdict = benchmarkVerdict(history);
  const out = [];
  if (life.status !== 'ok') out.push({ kind: 'life', severity: life.status, message: life.status === 'red' ? 'Replace or inspect' : `${life.pctRounded} % of rated life used` });
  for (const a of verdict.alerts) out.push({ kind: a.kind, severity: a.severity, message: a.message });
  if (verdict.replacementSuspected) out.push({ kind: 'bench:jump', severity: 'info', message: 'Benchmark jumped upward - did you replace the stylus?' });
  const rows = new Map();
  for (const s of snoozes || []) if (s && (!rows.has(s.kind) || toMs(pick(s, 'snoozedUntil', 'snoozed_until')) > toMs(pick(rows.get(s.kind), 'snoozedUntil', 'snoozed_until')))) rows.set(s.kind, s);
  return out.map(a => ({ ...a, snoozed: rows.has(a.kind) && isSnoozed(rows.get(a.kind), now) }));
}

// ------------------------------------------------------------------ bridge

const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;

function validateBenchmark(r) {
  if (!r || typeof r !== 'object') throw new Error('benchmark must be an object');
  if (typeof r.assetId !== 'string' || !r.assetId) throw new Error('benchmark needs an assetId');
  if (!finite(r.hoursAt) || r.hoursAt < 0) throw new Error('benchmark hoursAt must be >= 0');
  return r;
}

/** Bridge to the stylus_* commands. Browser mode: calls reject with a clear message. */
export function createStylusApi({ invoke = nativeInvoke() } = {}) {
  const need = () => {
    if (!invoke) throw new Error('Stylus wear tracking needs the desktop app.');
    return invoke;
  };
  return {
    native: !!invoke,
    benchmarkSave: async result => need()('stylus_benchmark_save', { result: validateBenchmark(result) }),
    benchmarkList: async assetId => need()('stylus_benchmark_list', { assetId }),
    alertSnooze: async (assetId, kind, until = snoozeUntil()) => need()('stylus_alert_snooze', { assetId, kind, until }),
    alertList: async assetId => need()('stylus_alert_list', { assetId }),
    baseline: async assetId => need()('stylus_baseline', { assetId }),
    replace: async (assetId, at, note = null) => need()('stylus_replace', { assetId, at, note }),
    ratedLifeSet: async (assetId, hours) => need()('stylus_rated_life_set', { assetId, hours }),
    ratedLifeGet: async assetId => need()('stylus_rated_life_get', { assetId }),
    djSessionSpans: async () => need()('dj_session_spans'),
    /** Runs with a real capture span for this asset since `since` (list_capture_sessions). */
    captureSessions: async (assetId, since = null) => need()('list_capture_sessions', { since, assetId, limit: 500 }),
    /** AC-2: live capture sessions -> unconfirmed `deckchek` hour proposals (since the replacement baseline). */
    captureProposals: async (assetId, { since = null, existing = [], capHours } = {}) =>
      proposeFromCaptureSessions(await need()('list_capture_sessions', { since, assetId, limit: 500 }), assetId, { existing, ...(capHours ? { capHours } : {}) }),
  };
}

export { HOUR_MS };
