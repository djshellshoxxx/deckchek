// Canonical JSON (FS-00 §6.1): RFC 8785-inspired and deliberately stricter.
//   - object keys sorted by UTF-16 code units; arrays keep their order
//   - strings escaped per RFC 8785 (only `"`, `\` and control characters; \b \f \n \r \t
//     short forms, other controls as lowercase \u00xx); everything else raw UTF-8
//   - numbers: ONLY safe integers (|n| <= 2^53-1). Any other number is an error, so
//     producers emit measured values as decimal strings ("0.123")
//   - no whitespace; lone surrogates, undefined, functions, bigint, Date, Map ... are errors
// Mirror of src-tauri/src/canonical.rs; both consume tests/fixtures/canonical-vectors.json.
import { sha256Hex, toBytes } from './sha256.js';

export const MAX_DEPTH = 64;

export class CanonicalJsonError extends Error {
  constructor(message, path = '$') { super(`${message} at ${path}`); this.name = 'CanonicalJsonError'; this.path = path; }
}

const hasLoneSurrogate = s => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const n = s.charCodeAt(i + 1); if (n >= 0xdc00 && n <= 0xdfff) { i++; continue; } return true; }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
};

function str(s, path) {
  if (hasLoneSurrogate(s)) throw new CanonicalJsonError('lone surrogate in string', path);
  return JSON.stringify(s); // well-formed JSON.stringify == RFC 8785 string form for surrogate-free input
}

function write(value, path, depth, seen) {
  if (depth > MAX_DEPTH) throw new CanonicalJsonError(`nesting deeper than ${MAX_DEPTH}`, path);
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean': return value ? 'true' : 'false';
    case 'string': return str(value, path);
    case 'number':
      if (!Number.isFinite(value)) throw new CanonicalJsonError(`${value} is not allowed`, path);
      if (!Number.isInteger(value)) throw new CanonicalJsonError(`non-integer number ${value} (emit measured values as decimal strings)`, path);
      if (!Number.isSafeInteger(value)) throw new CanonicalJsonError(`integer ${value} outside the safe range`, path);
      return String(value === 0 ? 0 : value); // -0 -> "0"
    case 'object': break;
    default: throw new CanonicalJsonError(`${typeof value} is not JSON`, path);
  }
  if (seen.has(value)) throw new CanonicalJsonError('circular reference', path);
  seen.add(value);
  let out;
  if (Array.isArray(value)) {
    const parts = [];
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) throw new CanonicalJsonError('sparse array', `${path}[${i}]`);
      parts.push(write(value[i], `${path}[${i}]`, depth + 1, seen));
    }
    out = `[${parts.join(',')}]`;
  } else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new CanonicalJsonError('only plain objects are allowed', path);
    const keys = Object.keys(value).sort(); // default sort compares UTF-16 code units
    out = `{${keys.map(k => `${str(k, `${path}.${k}`)}:${write(value[k], `${path}.${k}`, depth + 1, seen)}`).join(',')}}`;
  }
  seen.delete(value);
  return out;
}

/** Canonical JSON text of `value`; throws CanonicalJsonError for anything outside the rules. */
export function canonicalJson(value) { return write(value, '$', 0, new Set()); }

/** UTF-8 bytes of the canonical form. */
export const canonicalBytes = value => toBytes(canonicalJson(value));

/** Lowercase-hex SHA-256 of the canonical UTF-8 bytes. */
export const canonicalSha256 = value => sha256Hex(canonicalJson(value));

/** True when `text` parses as JSON and is already byte-for-byte its own canonical form. */
export function isCanonical(text) {
  if (typeof text !== 'string') return false;
  try { return canonicalJson(JSON.parse(text)) === text; } catch { return false; }
}
