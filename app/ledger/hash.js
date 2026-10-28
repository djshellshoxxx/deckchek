// Gear ledger hashing (FS-33 §4, §6). Thin re-export of the FS-00 canonical JSON and SHA-256 modules plus the two
// ledger helpers. Hashes here show integrity only (the file was not changed after export), never authenticity.
import { canonicalJson } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';

export { canonicalJson, canonicalSha256, CanonicalJsonError } from '../canonical-json.js';
export { sha256Hex, sha256HexSync, sha256Bytes, toBytes, bytesToHex } from '../sha256.js';

/** `ledgerSha256`: lowercase hex SHA-256 over the canonical JSON of the items array (spec §5). */
export const ledgerItemsSha256 = items => sha256Hex(canonicalJson(items));

/**
 * Pretty, deterministic JSON for `ledger.json` (AC-7: two exports diff line by line). Keys are sorted exactly as in
 * canonical JSON (UTF-16 code units), two-space indent, trailing newline. Throws for anything canonical JSON rejects,
 * so the file always parses back to a value whose canonical form is what was hashed.
 */
export function stableJsonText(value) {
  canonicalJson(value); // validates: integers only, no NaN, no lone surrogates, plain objects
  const pad = n => '  '.repeat(n);
  const write = (v, depth) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === 0 ? 0 : v);
    if (Array.isArray(v)) return v.length ? `[\n${v.map(x => pad(depth + 1) + write(x, depth + 1)).join(',\n')}\n${pad(depth)}]` : '[]';
    const keys = Object.keys(v).sort();
    return keys.length ? `{\n${keys.map(k => `${pad(depth + 1)}${JSON.stringify(k)}: ${write(v[k], depth + 1)}`).join(',\n')}\n${pad(depth)}}` : '{}';
  };
  return `${write(value, 0)}\n`;
}
