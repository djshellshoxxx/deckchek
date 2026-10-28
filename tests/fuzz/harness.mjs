// Dependency-free mutation fuzzer for DeckChek's JavaScript parsers (DeckChek original work).
//
// Node has no built-in coverage-guided fuzzer, so this is a seeded, structure-aware mutator:
// byte/char mutations for raw text and a JSON-tree mutator that swaps in hostile values
// (huge/negative/non-integer numbers, wrong types, prototype keys, deep nesting, long strings).
// Deterministic: a failure reproduces from the target name, seed and iteration printed.
// Used by tests/fuzz-smoke.test.mjs (short, every push) and tools/fuzz-js.mjs (long, nightly).

export function rng(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: n => Math.floor(next() * n), pick: arr => arr[Math.floor(next() * arr.length)] };
}

const HOSTILE_VALUES = [
  null, true, false, 0, -0, -1, 1e308, -1e308, 2 ** 53, 2 ** 53 + 2, 1e-320, 0.1, 255, 65536, 4294967296,
  '', ' ', 'NaN', 'Infinity', '-1', '1e999', '__proto__', 'constructor', '<script>alert(1)</script>', '=HYPERLINK("x")',
  '../../etc/passwd', 'C:\\Windows\\system32', '\u0000', '\ud800', '\u202e', 'é'.repeat(3), 'x'.repeat(5000),
  [], {}, [null], [[[]]],
];
const HOSTILE_KEYS = ['__proto__', 'constructor', 'prototype', 'toString', '', 'id', 'version', 'schemaVersion', 'runs', 'value'];

function deep(depth) { let v = 1; for (let i = 0; i < depth; i++) v = [v]; return v; }

/** Mutates a parsed JSON value in place-free fashion; returns a new value. */
export function mutateJson(r, value, budget = 4) {
  const nodes = [];
  (function walk(v, path) {
    nodes.push(path);
    if (nodes.length > 2000) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i]));
    else if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k], [...path, k]));
  })(value, []);
  let out = structuredClone(value);
  for (let n = 0; n < 1 + r.int(budget); n++) {
    const path = r.pick(nodes);
    const op = r.int(8);
    const parentPath = path.slice(0, -1), key = path[path.length - 1];
    const get = p => p.reduce((o, k) => (o == null ? undefined : o[k]), out);
    const parent = parentPath.length ? get(parentPath) : undefined;
    let replacement;
    if (op === 0) replacement = structuredClone(r.pick(HOSTILE_VALUES)); // never share the constants
    else if (op === 1) replacement = deep(50 + r.int(250));
    else if (op === 2) {
      // Replicate an array element, bounded so repeated mutations cannot compound into an OOM.
      const cur = get(path);
      const unit = Array.isArray(cur) ? (JSON.stringify(cur[0] ?? null) || '').length + 1 : 0;
      const count = unit ? Math.min(1 + r.int(300), Math.floor(200_000 / unit)) : 0;
      replacement = count > 0 ? Array.from({ length: count }, () => structuredClone(cur[0] ?? null)) : cur;
    }
    else if (op === 3) { const cur = get(path); replacement = typeof cur === 'number' ? -cur * (r.int(2) ? 1e6 : 1) + (r.int(2) ? 0.5 : 0) : typeof cur === 'string' ? cur.repeat(1 + r.int(50)) : cur; }
    else if (op === 4 && parent && typeof parent === 'object' && !Array.isArray(parent)) { delete parent[key]; continue; }
    else if (op === 5 && parent && typeof parent === 'object' && !Array.isArray(parent)) { Object.defineProperty(parent, r.pick(HOSTILE_KEYS), { value: structuredClone(r.pick(HOSTILE_VALUES)), enumerable: true, configurable: true, writable: true }); continue; }
    else if (op === 6) { const cur = get(path); replacement = typeof cur === 'number' ? String(cur) : typeof cur === 'string' ? Number(cur) || 0 : cur; }
    else replacement = structuredClone(get(r.pick(nodes)) ?? null);
    // Every replacement is size-checked so stacked mutations stay bounded (<= ~1 MB each).
    let size = 0;
    try { size = JSON.stringify(replacement ?? null)?.length ?? 0; } catch { continue; }
    if (size > 1_000_000) continue;
    if (!path.length) out = replacement;
    else if (parent && typeof parent === 'object') parent[key] = replacement;
  }
  return out;
}

const TOKENS = ['{', '}', '[', ']', '"', ',', ':', '\\', '\\u0000', '\ufeff', '\r\n', 'null', '-0', '1e999', 'DCM1|1/2|', '<!DOCTYPE x [<!ENTITY a "b">]>', '&a;', ']]>'];

/** Character-level mutations of text (keeps it a JS string, may break JSON). */
export function mutateText(r, text, maxLen = 1 << 20) {
  let s = text;
  for (let n = 0; n < 1 + r.int(6); n++) {
    const i = r.int(s.length + 1);
    switch (r.int(6)) {
      case 0: s = s.slice(0, i) + String.fromCharCode(r.int(0x10000)) + s.slice(i + 1); break;
      case 1: s = s.slice(0, i) + r.pick(TOKENS) + s.slice(i); break;
      case 2: s = s.slice(0, i) + s.slice(i + 1 + r.int(16)); break;
      case 3: s = s.slice(0, i); break;
      case 4: { const a = r.int(s.length + 1), b = Math.min(s.length, a + r.int(64)); s = s.slice(0, i) + s.slice(a, b) + s.slice(i); break; }
      default: s = s.slice(0, i) + String.fromCharCode(r.int(128)) + s.slice(i);
    }
  }
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/** Produces one input from a seed text: JSON-tree mutation when the seed parses, else text mutation. */
export function mutate(r, seed) {
  if (r.int(3) && seed.length < 2_000_000) {
    try {
      const out = JSON.stringify(mutateJson(r, JSON.parse(seed)));
      if (out.length <= 4_000_000) return out;
    } catch { /* not JSON, or unserialisable */ }
  }
  return mutateText(r, seed);
}

/**
 * A crash is any exception a target does not declare. Targets that return `{ok:false}` must never
 * throw; targets that throw on bad input may only throw plain `Error`/`SyntaxError` (an engine
 * TypeError/RangeError means validation missed a shape). Each call must finish under `slowMs`.
 */
export function runTarget(target, { seeds, iterations = 1000, seed = 1, timeBudgetMs = Infinity, slowMs = 2000 }) {
  const r = rng(seed ^ hash(target.name));
  const started = Date.now();
  let i = 0;
  const call = input => {
    const t0 = Date.now();
    try { target.run(input); }
    catch (e) {
      const allowed = target.throws && (e?.constructor === Error || e?.constructor === SyntaxError || (target.allowedErrors || []).some(C => e instanceof C));
      if (!allowed) return { input, error: e };
    }
    const ms = Date.now() - t0;
    if (ms > slowMs) return { input, error: new Error(`slow input: ${ms} ms`) };
    return null;
  };
  for (const s of seeds) { const f = call(s); if (f) return { ...f, iteration: -1, executions: i }; }
  for (; i < iterations && Date.now() - started < timeBudgetMs; i++) {
    const input = mutate(r, r.pick(seeds));
    const f = call(input);
    if (f) return { ...f, iteration: i, executions: i + 1 };
  }
  return { executions: i };
}

function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
