// Minimal ZIP writer for browser mode (FS-02): "stored" entries only (no compression), CRC-32,
// UTF-8 names, no ZIP64 (bundles are capped at 20 MiB). No dependencies, pure and DOM-free.

const enc = new TextEncoder();

let table = null;
function crcTable() {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

/** CRC-32 (IEEE 802.3) of a Uint8Array, as an unsigned 32-bit integer. */
export function crc32(bytes, seed = 0) {
  const t = crcTable();
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Entry names are fixed constants in DeckChek, but are still validated (no zip-slip). */
export function validateEntryName(name) {
  const s = String(name ?? '');
  if (!s || s.length > 255) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\:]/.test(s) || s.startsWith('/') || s.endsWith('/')) return false;
  return s.split('/').every(seg => seg !== '' && seg !== '.' && seg !== '..');
}

function dosDateTime(d) {
  const y = Math.min(2107, Math.max(1980, d.getFullYear()));
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time & 0xffff, date: date & 0xffff };
}

const toBytes = data => (data instanceof Uint8Array ? data : typeof data === 'string' ? enc.encode(data) : new Uint8Array(data ?? 0));

/**
 * @param {{name:string, data:Uint8Array|string}[]} entries written in the given order
 * @param {{date?:Date}} opts fixed `date` makes the output deterministic
 * @returns {Uint8Array}
 */
export function createZip(entries, { date = new Date() } = {}) {
  if (!Array.isArray(entries) || entries.length > 0xffff) throw new Error('Invalid zip entry list.');
  const { time, date: dosDate } = dosDateTime(date);
  const chunks = [];
  const central = [];
  const seen = new Set();
  let offset = 0;
  for (const e of entries) {
    if (!validateEntryName(e?.name)) throw new Error(`Invalid zip entry name: ${e?.name}`);
    if (seen.has(e.name)) throw new Error(`Duplicate zip entry: ${e.name}`);
    seen.add(e.name);
    const name = enc.encode(e.name);
    const data = toBytes(e.data);
    if (data.length > 0xfffffffe || offset > 0xfffffffe) throw new Error('Zip too large.');
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // flags: UTF-8 names
    local.setUint16(8, 0, true); // method: stored
    local.setUint16(10, time, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, data);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true); // version made by
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, dosDate, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, x) => n + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, x) => n + x.length, 0));
  let p = 0;
  for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}
