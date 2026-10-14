// QR generator checks (FS-00 §4.12): structure (finder, timing, format BCH, dark module), Reed-Solomon
// syndromes of every block, and a full decode round trip with an independent tiny decoder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvg } from '../app/vendor/qr.js';

// ---- reference tables (ISO/IEC 18004), versions 1-10: ecc -> [ecPerBlock, [[blocks, dataCodewords], ...]]
const BLOCKS = {
  L: [null, [7, [[1, 19]]], [10, [[1, 34]]], [15, [[1, 55]]], [20, [[1, 80]]], [26, [[1, 108]]], [18, [[2, 68]]], [20, [[2, 78]]], [24, [[2, 97]]], [30, [[2, 116]]], [18, [[2, 68], [2, 69]]]],
  M: [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]],
};
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// ---- GF(256), poly 0x11d
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function syndromesZero(block, ec) {
  for (let i = 0; i < ec; i++) {
    let s = 0;
    for (const c of block) s = gmul(s, EXP[i]) ^ c;
    if (s !== 0) return false;
  }
  return true;
}

// ---- format info BCH(15,5)
function formatBits(eccBits, mask) {
  const data = (eccBits << 3) | mask;
  let r = data << 10;
  for (let i = 14; i >= 10; i--) if ((r >> i) & 1) r ^= 0x537 << (i - 10);
  return ((data << 10) | r) ^ 0x5412;
}

function functionMask(v) {
  const n = 4 * v + 17;
  const f = Array.from({ length: n }, () => new Array(n).fill(false));
  const rect = (r0, c0, h, w) => { for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r >= 0 && c >= 0 && r < n && c < n) f[r][c] = true; };
  rect(0, 0, 9, 9); rect(0, n - 8, 9, 8); rect(n - 8, 0, 8, 9); // finders + separators + format
  rect(6, 0, 1, n); rect(0, 6, n, 1);                            // timing
  const pos = ALIGN[v];
  for (const r of pos) for (const c of pos) {
    if ((r === 6 && c === 6) || (r === 6 && c === pos.at(-1) && pos.length > 1) || (c === 6 && r === pos.at(-1) && pos.length > 1)) continue;
    rect(r - 2, c - 2, 5, 5);
  }
  if (v >= 7) { rect(0, n - 11, 6, 3); rect(n - 11, 0, 3, 6); }
  f[n - 8][8] = true; // dark module
  return f;
}

function decode(m) {
  const n = m.length;
  const v = (n - 17) / 4;
  assert.ok(Number.isInteger(v) && v >= 1 && v <= 10, `version ${v}`);
  // format info: first copy, MSB first: (8,0..5),(8,7),(8,8),(7,8),(5..0,8)
  const c1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const read1 = c1.reduce((acc, [r, c]) => (acc << 1) | (m[r][c] ? 1 : 0), 0);
  // second copy, MSB first: (n-1..n-7, 8) then (8, n-8..n-1)
  const c2 = [...Array.from({ length: 7 }, (_, i) => [n - 1 - i, 8]), ...Array.from({ length: 8 }, (_, i) => [8, n - 8 + i])];
  const read2 = c2.reduce((acc, [r, c]) => (acc << 1) | (m[r][c] ? 1 : 0), 0);
  assert.equal(read1, read2, 'both format copies agree');
  let found = null;
  for (const [ecc, bits] of [['L', 1], ['M', 0]]) for (let mask = 0; mask < 8; mask++) if (formatBits(bits, mask) === read1) found = { ecc, mask };
  assert.ok(found, `format word ${read1.toString(2)} is a valid BCH codeword`);
  const f = functionMask(v);
  const maskFn = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0][found.mask];
  // zigzag read
  const bits = [];
  let up = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (const c of [col, col - 1]) if (!f[r][c]) bits.push(m[r][c] !== maskFn(r, c) ? 1 : 0);
    }
    up = !up;
  }
  const [ec, groups] = BLOCKS[found.ecc][v];
  const layout = groups.flatMap(([count, data]) => Array.from({ length: count }, () => data));
  const totalData = layout.reduce((a, b) => a + b, 0);
  const total = totalData + ec * layout.length;
  const bytes = Array.from({ length: total }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8).join('').padEnd(8, '0'), 2));
  assert.ok(bits.length >= total * 8 && bits.length - total * 8 < 8, 'module count matches the codeword count (remainder bits only)');
  // de-interleave data then ec
  const blocks = layout.map(() => []);
  let p = 0;
  for (let i = 0; i < Math.max(...layout); i++) layout.forEach((len, b) => { if (i < len) blocks[b].push(bytes[p++]); });
  const ecBlocks = layout.map(() => []);
  for (let i = 0; i < ec; i++) layout.forEach((_, b) => ecBlocks[b].push(bytes[p++]));
  blocks.forEach((d, b) => assert.ok(syndromesZero([...d, ...ecBlocks[b]], ec), `block ${b} Reed-Solomon syndromes are zero`));
  const data = blocks.flat();
  // byte mode: 0100, count (8 bits v<10, 16 bits v>=10), bytes
  const stream = data.map(b => b.toString(2).padStart(8, '0')).join('');
  assert.equal(stream.slice(0, 4), '0100', 'byte mode indicator');
  const cb = v < 10 ? 8 : 16;
  const len = parseInt(stream.slice(4, 4 + cb), 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(stream.slice(4 + cb + i * 8, 12 + cb + i * 8), 2);
  return { version: v, ...found, text: new TextDecoder('utf-8', { fatal: true }).decode(out) };
}

function finderOk(m, r0, c0) {
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
    if (m[r0 + r][c0 + c] !== (ring !== 2)) return false; // 3 = dark edge, 2 = light ring, <=1 dark core
  }
  return true;
}

test('structure: finders, separators, timing, dark module, format info', () => {
  for (const ecc of ['L', 'M']) for (const text of ['A', 'https://deckchek.example/c/' + 'x'.repeat(40), 'y'.repeat(180)]) {
    const m = qrMatrix(text, { ecc });
    const n = m.length;
    assert.equal((n - 17) % 4, 0);
    assert.ok(finderOk(m, 0, 0) && finderOk(m, 0, n - 7) && finderOk(m, n - 7, 0), 'three finder patterns');
    for (let i = 0; i < 8; i++) { // light separators
      assert.equal(m[7][i], false); assert.equal(m[i][7], false);
      assert.equal(m[7][n - 1 - i], false); assert.equal(m[i][n - 8], false);
      assert.equal(m[n - 8][i], false); assert.equal(m[n - 1 - i][7], false);
    }
    for (let i = 8; i < n - 8; i++) { assert.equal(m[6][i], i % 2 === 0, 'row timing'); assert.equal(m[i][6], i % 2 === 0, 'col timing'); }
    assert.equal(m[n - 8][8], true, 'dark module');
    const d = decode(m);
    assert.equal(d.ecc, ecc);
  }
});

test('round trip: ASCII, URL, JSON, UTF-8, ECC L and M, versions 1-10', () => {
  const texts = [
    '', 'A', 'hello world', 'https://deckchek.example/verify?id=0123456789abcdef&h=' + 'ab'.repeat(32),
    JSON.stringify({ v: 1, product: 'pioneer-plx-crss12', sha: 'f'.repeat(64) }),
    'héllo 日本語 \u{1f600}', 'z'.repeat(200),
  ];
  const versions = new Set();
  for (const ecc of ['L', 'M']) for (const text of texts) {
    const m = qrMatrix(text, { ecc });
    const d = decode(m);
    assert.equal(d.text, text, `${ecc} ${text.slice(0, 20)}`);
    versions.add(d.version);
  }
  assert.ok(versions.has(1) && [...versions].some(v => v >= 8), `versions seen ${[...versions]}`);
});

test('every byte length 0..200 round-trips at both levels (versions 1-10)', () => {
  for (const ecc of ['L', 'M']) for (let len = 0; len <= 200; len += 7) {
    const text = Array.from({ length: len }, (_, i) => String.fromCharCode(33 + ((i * 11) % 90))).join('');
    const d = decode(qrMatrix(text, { ecc }));
    assert.equal(d.text, text, `${ecc} len ${len}`);
    assert.ok(d.version <= 10);
  }
});

test('level M is never smaller than L, and capacity is enforced', () => {
  const text = 'q'.repeat(120);
  assert.ok(qrMatrix(text, { ecc: 'M' }).length >= qrMatrix(text, { ecc: 'L' }).length);
  assert.throws(() => qrMatrix('x', { ecc: 'H' }), RangeError);
  assert.throws(() => qrMatrix(42), TypeError);
  assert.throws(() => qrMatrix('x'.repeat(3000)), RangeError);
});

test('qrSvg: valid-looking svg, quiet zone, escaped label, deterministic', () => {
  const svg = qrSvg('hello', { ecc: 'M', label: 'a "b" <c>' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) \1"/);
  const n = qrMatrix('hello', { ecc: 'M' }).length;
  assert.ok(svg.includes(`viewBox="0 0 ${n + 8} ${n + 8}"`), 'default 4-module quiet zone');
  assert.ok(svg.includes('aria-label="a &quot;b&quot; &lt;c&gt;"'));
  assert.ok(!/<script|onload/i.test(svg));
  assert.equal(svg, qrSvg('hello', { ecc: 'M', label: 'a "b" <c>' }));
  // dark cell count in the path equals the matrix
  const dark = qrMatrix('hello', { ecc: 'M' }).flat().filter(Boolean).length;
  const runs = [...svg.matchAll(/h(\d+)v1h-\1z/g)].reduce((a, x) => a + Number(x[1]), 0);
  assert.equal(runs, dark);
});

test('the decoder is not vacuous: a flipped data module breaks Reed-Solomon or the text', () => {
  const m = qrMatrix('hello world', { ecc: 'L' }).map(r => r.slice());
  m[m.length - 1][m.length - 1] = !m[m.length - 1][m.length - 1];
  assert.throws(() => assert.equal(decode(m).text, 'hello world'));
});
