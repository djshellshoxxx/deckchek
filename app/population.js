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
