// Metric comparability helpers shared by FS-21 (unit vs population) and FS-22
// (service before/after). FS-00 §4.13. Pure functions, no DOM.

/** Parse `parameters_json` (string or object) from an analysis_method row; {} when unusable. */
function parametersOf(row) {
  const raw = row?.parameters_json ?? row?.parametersJson ?? row?.parameters;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string') { try { const p = JSON.parse(raw); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
  return {};
}

/** Find the registry row for {key, version}. Registry: array of rows, a Map, or an object keyed by `key:version` / `method:key:version`. */
function lookup(registry, key, version) {
  if (!registry) return null;
  if (Array.isArray(registry)) return registry.find(r => r && r.key === key && Number(r.version) === Number(version)) ?? null;
  if (registry instanceof Map) return registry.get(`${key}:${version}`) ?? registry.get(`method:${key}:${version}`) ?? null;
  if (typeof registry === 'object') return registry[`${key}:${version}`] ?? registry[`method:${key}:${version}`] ?? null;
  return null;
}

/** Entries of `compat` as normalised "key:version" strings (bare numbers mean the same key). */
function compatSet(row, key) {
  const list = parametersOf(row).compat;
  const out = new Set();
  if (!Array.isArray(list)) return out;
  for (const entry of list) {
    if (typeof entry === 'number' && Number.isFinite(entry)) out.add(`${key}:${entry}`);
    else if (typeof entry === 'string') out.add(/^method:/.test(entry) ? entry.slice(7) : /^\d+$/.test(entry) ? `${key}:${entry}` : entry);
  }
  return out;
}

/**
 * Two measurements are comparable when their methods have the same key and unit and either the
 * same version or each method's `parameters_json.compat` lists the other (mutual, so a version
 * cannot unilaterally claim equivalence). Units come from `a.unit`/`b.unit`, falling back to the
 * registry row's `parameters_json.unit`; known units must match, one known and one unknown does not.
 */
export function methodCompatible(a, b, registry) {
  if (!a || !b || typeof a.key !== 'string' || a.key !== b.key) return false;
  const rowA = lookup(registry, a.key, a.version);
  const rowB = lookup(registry, b.key, b.version);
  const unitA = a.unit ?? parametersOf(rowA).unit ?? null;
  const unitB = b.unit ?? parametersOf(rowB).unit ?? null;
  if (unitA !== unitB) return false;
  if (Number(a.version) === Number(b.version)) return Number.isFinite(Number(a.version));
  if (!rowA || !rowB) return false;
  return compatSet(rowA, a.key).has(`${b.key}:${Number(b.version)}`) && compatSet(rowB, b.key).has(`${a.key}:${Number(a.version)}`);
}

/** Root-sum-square of two independent standard uncertainties; NaN for negative or non-finite input. */
export function combinedUncertainty(uA, uB) {
  if (![uA, uB].every(u => typeof u === 'number' && Number.isFinite(u) && u >= 0)) return NaN;
  return Math.hypot(uA, uB);
}

/**
 * Verdict for a difference `delta` (later minus earlier) with combined uncertainty `u`:
 * significant only when |delta| > k*u (k = 2 by default). `higherIsBetter` (true|false) turns the
 * direction into 'better'/'worse'; omit it for a neutral 'changed'.
 * -> {verdict:'unchanged'|'better'|'worse'|'changed'|'unknown', significant, direction:'up'|'down'|'none', delta, threshold}
 */
export function deltaVerdict(delta, u, { k = 2, higherIsBetter } = {}) {
  if (![delta, u, k].every(Number.isFinite) || u < 0 || k < 0) return { verdict: 'unknown', significant: false, direction: 'none', delta, threshold: NaN };
  const threshold = k * u;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'none';
  if (Math.abs(delta) <= threshold) return { verdict: 'unchanged', significant: false, direction, delta, threshold };
  if (typeof higherIsBetter !== 'boolean') return { verdict: 'changed', significant: true, direction, delta, threshold };
  const good = higherIsBetter ? delta > 0 : delta < 0;
  return { verdict: good ? 'better' : 'worse', significant: true, direction, delta, threshold };
}
