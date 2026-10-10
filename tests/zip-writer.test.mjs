import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { crc32, createZip, validateEntryName } from '../app/zip-writer.js';

const enc = s => new TextEncoder().encode(s);

// Independent reader: walks the central directory.
function readZip(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = buf.length - 22;
  assert.equal(v.getUint32(eocd, true), 0x06054b50);
  const n = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < n; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50);
    const crc = v.getUint32(p + 16, true), size = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), off = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl));
    assert.equal(v.getUint32(off, true), 0x04034b50);
    const lnl = v.getUint16(off + 26, true), lel = v.getUint16(off + 28, true);
    const data = buf.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + size);
    out.push({ name, crc, data });
    p += 46 + nl;
  }
  return out;
}

test('crc32 known vectors', () => {
  assert.equal(crc32(enc('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
  assert.equal(crc32(enc('The quick brown fox jumps over the lazy dog')), 0x414fa339);
  assert.equal(crc32(enc('6789'), crc32(enc('12345'))), 0xcbf43926); // incremental
});

test('round trip through an independent reader keeps order, names and bytes', () => {
  const zip = createZip([{ name: 'manifest.json', data: '{"a":1}' }, { name: 'logs/ü-é.txt', data: enc('héllo') }, { name: 'empty.txt', data: '' }], { date: new Date(2026, 9, 10, 12, 34, 56) });
  const files = readZip(zip);
  assert.deepEqual(files.map(f => f.name), ['manifest.json', 'logs/ü-é.txt', 'empty.txt']);
  assert.equal(new TextDecoder().decode(files[1].data), 'héllo');
  for (const f of files) assert.equal(crc32(f.data), f.crc);
});

test('output is deterministic for a fixed date', () => {
  const d = new Date(2026, 0, 2, 3, 4, 6);
  const a = createZip([{ name: 'a.txt', data: 'x' }], { date: d });
  const b = createZip([{ name: 'a.txt', data: 'x' }], { date: d });
  assert.deepEqual(a, b);
});

test('entry names: zip-slip, absolute, backslash and duplicates are rejected', () => {
  for (const bad of ['../x', 'a/../x', '/abs', 'a\\b', 'C:x', '', 'a//b', 'dir/', './x', 'a\u0000b']) {
    assert.equal(validateEntryName(bad), false, bad);
    assert.throws(() => createZip([{ name: bad, data: '' }]));
  }
  assert.equal(validateEntryName('logs/deckchek.1.log'), true);
  assert.throws(() => createZip([{ name: 'a', data: '' }, { name: 'a', data: '' }]));
});

test('system unzip / python zipfile accept the archive (when available)', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zipw-'));
  const file = path.join(dir, 't.zip');
  const big = new Uint8Array(200000).map((_, i) => (i * 31) & 255);
  fs.writeFileSync(file, createZip([{ name: 'manifest.json', data: '{}' }, { name: 'logs/big.bin', data: big }]));
  const py = spawnSync('python3', ['-I', '-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(",".join(z.namelist()))', file], { encoding: 'utf8' });
  if (py.error) { t.skip('python3 not available'); return; }
  assert.equal(py.status, 0, py.stderr);
  assert.equal(py.stdout.trim(), 'manifest.json,logs/big.bin');
});
