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

test('ZIP names reject lossy UTF-16 surrogates but retain valid Unicode filenames', () => {
  for (const bad of ['name\\ud800', '\\udc00tail', 'a\\ud800x', 'x\\udc00\\ud800y']) {
    const value = JSON.parse('"' + bad + '"');
    assert.equal(validateEntryName(value), false, bad);
    assert.throws(() => createZip([{ name: value, data: 'x' }]), /Invalid zip entry name/);
  }
  assert.equal(validateEntryName('logs/😀-é.txt'), true);
  assert.equal(validateEntryName(123), false);
  assert.throws(() => createZip([{ name: 123, data: 'x' }]), /Invalid zip entry name/);
  assert.equal(readZip(createZip([{ name: 'logs/😀-é.txt', data: 'ok' }]))[0].name, 'logs/😀-é.txt');
});

test('ZIP entry payloads reject unsupported types instead of silently inserting zero bytes', () => {
  for (const data of [undefined, null, 3, [1, 2], new ArrayBuffer(4), { length: 3 }]) {
    assert.throws(() => createZip([{ name: 'bad.bin', data }]), /Invalid ZIP entry data/);
  }
  const original = new Uint8Array([0, 255, 5]);
  assert.deepEqual(readZip(createZip([{ name: 'ok.bin', data: original }]))[0].data, original);
});

test('invalid ZIP timestamps fail instead of encoding an impossible DOS month/day', () => {
  for (const date of [new Date(NaN), null, '2026-01-01', {}, 0]) {
    assert.throws(
      () => createZip([{ name: 'manifest.json', data: '{}' }], { date }),
      /Invalid ZIP date/,
    );
  }
  const valid = createZip([{ name: 'ok.txt', data: 'ok' }], { date: new Date(1980, 0, 1) });
  const view = new DataView(valid.buffer, valid.byteOffset, valid.byteLength);
  const date = view.getUint16(12, true);
  assert.equal((date >> 5) & 15, 1);
  assert.equal(date & 31, 1);
  assert.equal(readZip(valid)[0].name, 'ok.txt');
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

test('ZIP size cap includes local records, directory and end record', () => {
  const cap = 20 * 1024 * 1024;
  const oneOverhead = 22 + 30 + 1 + 46 + 1; // single ASCII filename
  const atLimit = createZip([{ name: 'a', data: new Uint8Array(cap - oneOverhead) }]);
  assert.equal(atLimit.length, cap);
  assert.equal(readZip(atLimit)[0].data.length, cap - oneOverhead);
  assert.throws(
    () => createZip([{ name: 'a', data: new Uint8Array(cap - oneOverhead + 1) }]),
    /Zip too large/,
  );
  const twoOverhead = 22 + 2 * (30 + 1 + 46 + 1);
  assert.throws(
    () => createZip([
      { name: 'a', data: new Uint8Array(cap - twoOverhead) },
      { name: 'b', data: new Uint8Array(1) },
    ]),
    /Zip too large/,
  );
});

test('DOS year clamping never creates an impossible leap-day date', () => {
  const readPackedDate = input => {
    const bytes = createZip([{ name: 'date.txt', data: 'x' }], { date: input });
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const local = v.getUint16(12, true);
    const centralOffset = v.getUint32(bytes.length - 22 + 16, true);
    const central = v.getUint16(centralOffset + 14, true);
    assert.equal(central, local, 'central and local ZIP dates must agree');
    return {
      year: 1980 + (local >>> 9),
      month: (local >>> 5) & 0x0f,
      day: local & 0x1f,
    };
  };

  // The original year-clamp encoded February 29 in nonleap year 2107.
  assert.deepEqual(readPackedDate(new Date(2400, 1, 29, 12, 4, 6)),
    { year: 2107, month: 2, day: 28 });
  // Preserve legal leap days, including the lower DOS bound.
  assert.deepEqual(readPackedDate(new Date(2104, 1, 29, 12, 4, 6)),
    { year: 2104, month: 2, day: 29 });
  assert.deepEqual(readPackedDate(new Date(1976, 1, 29, 12, 4, 6)),
    { year: 1980, month: 2, day: 29 });
  // Other dates clamped to 2107 retain their existing month and day.
  assert.deepEqual(readPackedDate(new Date(2108, 2, 1, 12, 4, 6)),
    { year: 2107, month: 3, day: 1 });
});
