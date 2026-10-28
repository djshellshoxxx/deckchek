// FS-21 statistics. Pure, offline functions; raw observations are never modified.
// Persistence, pack validation and presentation belong to separate adapters.
import { methodCompatible } from './metric-compat.js';
export { methodCompatible } from './metric-compat.js';

function numbers(values) {
  if (!Array.isArray(values) || !Array.from(values).every(value => typeof value === 'number' && Number.isFinite(value))) {
    throw new TypeError('Population values must be finite numbers');
  }
  return values;
}

// Hyndman-Fan type 7: interpolation at (n - 1) * p.
function quantile(sorted, p) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position), fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[Math.min(lower + 1, sorted.length - 1)] * fraction;
}

export function robustSummary(values) {
  const sorted = numbers(values).slice().sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const p25 = quantile(sorted, 0.25), p75 = quantile(sorted, 0.75);
  return {
    n: sorted.length, median,
    mad: median === null ? null : quantile(sorted.map(value => Math.abs(value - median)).sort((a, b) => a - b), 0.5),
    p10: quantile(sorted, 0.1), p25, p75, p90: quantile(sorted, 0.9),
    iqr: p25 === null ? null : p75 - p25,
  };
}

function outlierBounds(values, k) {
  if (!Number.isFinite(k) || k <= 0) throw new RangeError('Outlier threshold must be positive');
  const summary = robustSummary(values);
  // MAD / 0.67449 estimates sigma; IQR / 1.34898 is its degenerate fallback.
  const scale = summary.mad / 0.6744897501960817 || summary.iqr / 1.3489795003921634;
  if (!values.length || !scale) return [-Infinity, Infinity];
  return [summary.median - k * scale, summary.median + k * scale];
}

export function winsorize(values, k = 3.5) {
  numbers(values);
  const [lo, hi] = outlierBounds(values, k);
  return values.map(value => Math.min(hi, Math.max(lo, value)));
}

function rank(values, x, higherIsBetter) {
  let below = 0, tied = 0;
  for (const value of values) { if (value < x) below++; else if (value === x) tied++; }
  const ascending = 100 * (below + tied / 2) / values.length;
  return higherIsBetter ? ascending : 100 - ascending;
}

function seededRandom(seed) {
  // FNV-1a seed hashing and Mulberry32 PRNG; not used for security or identity.
  let state = 2166136261;
  for (const c of String(seed)) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mid-rank and deterministic 90% bootstrap interval (1,000 resamples). */
export function percentileRank(values, x, { higherIsBetter, seed = 'deckchek-population-v1' } = {}) {
  numbers(values);
  if (!Number.isFinite(x)) throw new TypeError('Comparison value must be finite');
  if (!values.length || typeof higherIsBetter !== 'boolean') return { rank0to100: null, lo: null, hi: null };
  const random = seededRandom(seed), bootstraps = [];
  for (let iteration = 0; iteration < 1000; iteration++) {
    let below = 0, tied = 0;
    for (let i = 0; i < values.length; i++) {
      const value = values[Math.floor(random() * values.length)];
      if (value < x) below++; else if (value === x) tied++;
    }
    const ascending = 100 * (below + tied / 2) / values.length;
    bootstraps.push(higherIsBetter ? ascending : 100 - ascending);
  }
  bootstraps.sort((a, b) => a - b);
  return { rank0to100: rank(values, x, higherIsBetter), lo: quantile(bootstraps, 0.05), hi: quantile(bootstraps, 0.95) };
}

/**
 * Reduce compatible rows to one median per contributor before statistical use.
 * The caller validates packs and supplies rows for the selected product only.
 * Below eight contributors only raw dots are available; below twenty, no rank.
 */
export function populationComparison(rows, measurement, { higherIsBetter, registry, seed, minimum = 20 } = {}) {
  if (!Array.isArray(rows)) throw new TypeError('Population rows must be an array');
  if (!measurement || !Number.isFinite(measurement.value)) throw new TypeError('Comparison value must be finite');
  const validMethod = method => method && typeof method.key === 'string' && method.key.length > 0 && Number.isSafeInteger(method.version) && method.version > 0;
  if (typeof measurement.metric !== 'string' || !measurement.metric || typeof measurement.unit !== 'string' || !validMethod(measurement.method)) throw new TypeError('Comparison requires a metric, unit and versioned method');
  if (!Number.isInteger(minimum) || minimum < 20) throw new RangeError('Minimum contributors must be at least twenty');
  const groups = new Map();
  let excluded = 0, units = 0;
  for (const row of rows) {
    if (!row || typeof row.contributor !== 'string' || !row.contributor || !Number.isFinite(row.value) || !validMethod(row.method)
      || row.metric !== measurement.metric || row.unit !== measurement.unit
      || !methodCompatible({ ...row.method, unit: row.unit }, { ...measurement.method, unit: measurement.unit }, registry)) {
      excluded++; continue;
    }
    if (!groups.has(row.contributor)) groups.set(row.contributor, []);
    groups.get(row.contributor).push(row.value);
    units++;
  }
  const values = [...groups.values()].map(group => robustSummary(group).median);
  const [lo, hi] = outlierBounds(values, 3.5);
  const dots = values.map(value => ({ value, outlier: value < lo || value > hi }));
  const summaryValues = dots.filter(dot => !dot.outlier).map(dot => dot.value);
  const contributors = values.length;
  const supported = typeof higherIsBetter === 'boolean';
  const status = contributors < minimum ? 'insufficient' : supported ? 'percentile' : 'unsupported';
  return {
    contributors, units, excluded, dots, status,
    summary: contributors >= 8 ? robustSummary(summaryValues) : null,
    rank: status === 'percentile' ? percentileRank(values, measurement.value, { higherIsBetter, seed }) : null,
    message: contributors < minimum ? `Not enough data (${contributors} of ${minimum})` : supported ? null : 'This metric has no ranking direction',
    caveat: 'Contributors are self-selected and may not represent the wider population.',
  };
}

// ---------------------------------------------------------------- phase 1: spec, sibling units and own history (FS-21 AC-1..AC-3)

/** Contributors needed for a percentile, and for showing a median at all (spec section 6). */
export const N_MIN_PERCENTILE = 20;
export const N_MIN_MEDIAN = 8;

const unitWord = unit => String(unit ?? '').trim().split(/[\s(]/)[0].toLowerCase();

/**
 * AC-1: value against a published spec limit, no population needed.
 * `spec` is a device-profile spec entry ({value, unit, tolerance, confidence, source}); `limit` says whether the
 * spec is a ceiling ('max', lower is better) or a floor ('min'). Never converts units: "dBu" is not "dBFS".
 * -> {status:'ok', limit, specValue, unit, value, margin, within, confidence, source}
 *  | {status:'no-measurement'|'no-spec'|'no-limit'|'not-numeric'|'unit-mismatch', reason}
 */
export function compareToSpec(measurement, spec, { limit } = {}) {
  if (!measurement || !Number.isFinite(measurement.value)) return { status: 'no-measurement', reason: 'There is no measured value to compare.' };
  if (!spec || typeof spec !== 'object') return { status: 'no-spec', reason: 'No published spec for this metric.' };
  if (limit !== 'max' && limit !== 'min') return { status: 'no-limit', reason: 'This metric has no spec direction, so a margin cannot be shown.' };
  if (typeof spec.value !== 'number' || !Number.isFinite(spec.value)) return { status: 'not-numeric', reason: 'The published spec is not a single number.' };
  const a = unitWord(measurement.unit), b = unitWord(spec.unit);
  if (!a || !b || a !== b) return { status: 'unit-mismatch', reason: `The spec is in ${spec.unit || 'no unit'} but the measurement is in ${measurement.unit || 'no unit'}; DeckChek does not convert.` };
  const margin = limit === 'max' ? spec.value - measurement.value : measurement.value - spec.value;
  return { status: 'ok', limit, specValue: spec.value, unit: measurement.unit, value: measurement.value, margin, within: margin >= 0, confidence: spec.confidence ?? null, source: spec.source ?? null, tolerance: spec.tolerance ?? null };
}

/** Latest value per asset from rows [{assetId, value, at, ...}] (ties on `at` keep the later row). */
export function latestPerAsset(rows) {
  const best = new Map();
  for (const row of rows ?? []) {
    if (!row || typeof row.assetId !== 'string' || !Number.isFinite(row.value)) continue;
    const old = best.get(row.assetId);
    if (!old || String(row.at ?? '') >= String(old.at ?? '')) best.set(row.assetId, row);
  }
  return [...best.values()].sort((a, b) => a.assetId.localeCompare(b.assetId));
}

/**
 * AC-2: where this unit sits among the user's other units of the same product. `units` = one {assetId, nickname, value}
 * per asset (use latestPerAsset). Best first when the direction is known, otherwise by value; ties by assetId so the
 * order is deterministic. Rank is a competition rank (1 = best; equal values share a rank).
 */
export function compareToSiblings(units, assetId, { higherIsBetter } = {}) {
  const list = (units ?? []).filter(u => u && Number.isFinite(u.value));
  const me = list.find(u => u.assetId === assetId);
  if (!me) return { status: 'none', rows: [], rank: null, of: 0 };
  const sign = higherIsBetter === true ? -1 : 1;
  const rows = list.slice().sort((a, b) => (a.value - b.value) * sign || String(a.assetId).localeCompare(String(b.assetId)));
  const known = typeof higherIsBetter === 'boolean';
  const status = list.length < 2 ? 'single' : known ? 'ranked' : 'unranked';
  const rank = known ? 1 + rows.filter(u => (higherIsBetter ? u.value > me.value : u.value < me.value)).length : null;
  return { status, rows: rows.map(u => ({ ...u, self: u.assetId === assetId })), rank, of: list.length };
}

/**
 * AC-3: latest run against the unit's own earlier runs. `history` oldest first [{value, at}].
 * -> {status:'insufficient', n} | {status:'ok', n, latest, median, delta, verdict:'better'|'worse'|'same'|'changed'}
 */
export function historyDelta(history, { higherIsBetter } = {}) {
  const values = (history ?? []).filter(h => h && Number.isFinite(h.value));
  if (values.length < 2) return { status: 'insufficient', n: values.length };
  const latest = values.at(-1).value;
  const median = robustSummary(values.slice(0, -1).map(h => h.value)).median;
  const delta = latest - median;
  const verdict = delta === 0 ? 'same' : typeof higherIsBetter !== 'boolean' ? 'changed' : (delta > 0) === higherIsBetter ? 'better' : 'worse';
  return { status: 'ok', n: values.length, latest, median, delta, verdict };
}

export function ordinal(n) {
  const k = Math.round(n), mod100 = k % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[k % 10] ?? 'th');
  return `${k}${suffix}`;
}

const trim = (v, d = 3) => String(Number(Number(v).toPrecision(d)));

/** Text equivalent of the strip plot (spec section 3). Rank is always "higher = better", whatever the metric's direction. */
export function describeComparison(comparison, measurement) {
  const unit = measurement.unit ? ` ${measurement.unit}` : '';
  const value = `${trim(measurement.value)}${unit}`;
  if (!comparison || comparison.status === 'insufficient') return `${comparison?.message ?? 'Not enough data'}. Your value is ${value}.`;
  const who = `${comparison.contributors} contributors (${comparison.units} units)`;
  if (comparison.status === 'unsupported') return `Your value is ${value}. The population has ${who}; this metric has no ranking direction, so only the distribution is shown.`;
  const r = comparison.rank;
  const band = comparison.contributors < 100 && Number.isFinite(r.lo) ? `, about ${ordinal(r.lo)} to ${ordinal(r.hi)}` : '';
  return `Your value ${value} is at the ${ordinal(r.rank0to100)} percentile of ${who}${band}. Higher percentile is better.`;
}

/**
 * Geometry for the strip plot (spec section 3): x positions in 0..width for each dot, the P10/P50/P90 band and the
 * user's marker. Pure, so the layout is testable. Nothing is dropped: the axis grows to include every dot and the marker.
 */
export function stripPlot(comparison, value, { width = 560 } = {}) {
  const dots = comparison?.dots ?? [];
  const all = dots.map(d => d.value).concat(Number.isFinite(value) ? [value] : []);
  if (!all.length) return null;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
  const pad = (hi - lo) * 0.06;
  lo -= pad; hi += pad;
  const x = v => Math.round(((v - lo) / (hi - lo)) * width * 100) / 100;
  const s = comparison?.summary;
  return {
    lo, hi,
    dots: dots.map(d => ({ x: x(d.value), value: d.value, outlier: d.outlier })),
    band: s ? { p10: x(s.p10), p50: x(s.median), p90: x(s.p90) } : null,
    marker: Number.isFinite(value) ? x(value) : null,
  };
}
