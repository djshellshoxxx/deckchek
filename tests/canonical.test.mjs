import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalJson, canonicalBytes, canonicalSha256, isCanonical, CanonicalJsonError, MAX_DEPTH } from '../app/canonical-json.js';
import { sha256Hex, sha256HexSync, sha256Bytes } from '../app/sha256.js';

const V = JSON.parse(readFileSync(new URL('./fixtures/canonical-vectors.json', import.meta.url), 'utf8'));
const nodeSha = x => createHash('sha256').update(x).digest('hex');

test('AC-7 shared vectors: canonical text and sha256 match byte for byte', async () => {
  assert.ok(V.vectors.length >= 25);
  for (const v of V.vectors) {
    const out = canonicalJson(JSON.parse(v.inputJson));
    assert.equal(out, v.canonical, v.name);
    assert.equal(await sha256Hex(out), v.sha256, `${v.name} sha256`);
    assert.equal(await canonicalSha256(JSON.parse(v.inputJson)), v.sha256, `${v.name} canonicalSha256`);
    assert.ok(isCanonical(v.canonical), `${v.name} is its own canonical form`);
    assert.deepEqual([...canonicalBytes(JSON.parse(v.inputJson))], [...Buffer.from(v.canonical, 'utf8')]);
  }
});

test('AC-7 rejection vectors: non-integers, unsafe integers, lone surrogates, too deep', () => {
  assert.equal(V.maxDepth, MAX_DEPTH);
  for (const r of V.rejectJson) {
    assert.throws(() => canonicalJson(JSON.parse(r.json)), CanonicalJsonError, r.name);
  }
});

test('NaN and the infinities are rejected', () => {
  for (const name of V.rejectNumbers) {
    const n = { NaN: NaN, Infinity: Infinity, '-Infinity': -Infinity }[name];
    assert.throws(() => canonicalJson(n), CanonicalJsonError, name);
    assert.throws(() => canonicalJson({ a: [n] }), CanonicalJsonError, `${name} nested`);
  }
});

test('non-canonical texts (unsorted keys, whitespace, escapes) are detected', () => {
  for (const t of V.nonCanonical) {
    assert.ok(!isCanonical(t.text), t.name);
    // but canonicalising them produces a canonical text
    if (!/^\s*$/.test(t.text)) assert.ok(isCanonical(canonicalJson(JSON.parse(t.text))), `${t.name} re-canonicalised`);
  }
  assert.equal(isCanonical('not json'), false);
  assert.equal(isCanonical(undefined), false);
});

test('values JSON cannot carry are rejected, never dropped', () => {
  const bad = [undefined, () => 1, Symbol('x'), 10n, new Date(0), new Map(), new Set(), /x/, new Uint8Array(1), { a: undefined }, [undefined], [, 1], { f() {} }];
  for (const b of bad) assert.throws(() => canonicalJson(b), CanonicalJsonError);
  const cyc = {}; cyc.self = cyc;
  assert.throws(() => canonicalJson(cyc), /circular/);
  const shared = { a: 1 };
  assert.equal(canonicalJson([shared, shared]), '[{"a":1},{"a":1}]', 'shared (non-circular) references are fine');
  assert.throws(() => canonicalJson('\ud800'), /surrogate/);
  assert.throws(() => canonicalJson({ ['\udc00']: 1 }), /surrogate/);
  assert.equal(canonicalJson(Object.create(null)), '{}');
  assert.equal(canonicalJson(-0), '0');
  assert.equal(canonicalJson(Number.MAX_SAFE_INTEGER), '9007199254740991');
  assert.throws(() => canonicalJson(Number.MAX_SAFE_INTEGER + 1), CanonicalJsonError);
  assert.throws(() => canonicalJson(0.5), /decimal strings/);
});

test('error paths point at the offending value', () => {
  try { canonicalJson({ a: [1, { b: 1.5 }] }); assert.fail('should throw'); } catch (e) { assert.equal(e.path, '$.a[1].b'); }
});

test('sha256 vectors: empty, abc, two-block, million a, bytes and strings', async () => {
  assert.equal(sha256HexSync(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256HexSync('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256HexSync('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  assert.equal(sha256HexSync('a'.repeat(1_000_000)), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  assert.equal(await sha256Hex(new Uint8Array([0xff, 0, 1])), nodeSha(Buffer.from([0xff, 0, 1])));
  assert.equal(sha256Bytes('abc').length, 32);
  // padding boundaries 55, 56, 63, 64, 65 bytes against node:crypto
  for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) & 255);
    assert.equal(sha256HexSync(bytes), nodeSha(bytes), `len ${n}`);
  }
  assert.equal(sha256HexSync('héllo \u{1f600}'), nodeSha('héllo \u{1f600}'), 'strings hash as UTF-8');
  // sub-views hash only their own bytes
  const big = new Uint8Array([9, 9, 1, 2, 3, 9]);
  assert.equal(sha256HexSync(big.subarray(2, 5)), nodeSha(Buffer.from([1, 2, 3])));
  assert.throws(() => sha256HexSync(42), TypeError);
});

test('sha256Hex falls back to pure JS when crypto.subtle is unavailable or throws', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { value: { subtle: { digest: async () => { throw new Error('insecure context'); } } }, configurable: true });
    assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'crypto', saved); else delete globalThis.crypto;
  }
});

test('regression: a 1 MB key over 100k items canonicalises in linear time (FS-20 review, mirror of canonical.rs)', () => {
  const key = 'k'.repeat(1_000_000);
  const t0 = Date.now();
  const out = canonicalJson({ [key]: new Array(100_000).fill(0) });
  assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0} ms`);
  assert.equal(out.length, '{"":[]}'.length + key.length + 100_000 * 2 - 1);
  assert.throws(() => canonicalJson({ [key]: [0, 0.5] }), e => e instanceof CanonicalJsonError && e.path === `$.${key}[1]`);
});
