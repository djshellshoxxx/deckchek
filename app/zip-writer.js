// Minimal ZIP writer for browser mode (FS-02): "stored" entries only (no compression), CRC-32,
// UTF-8 names, no ZIP64 (bundles are capped at 20 MiB). No dependencies, pure and DOM-free.

const enc = new TextEncoder();
const MAX_ZIP_BYTES = 20 * 1024 * 1024; // Total archive, including ZIP record overhead.

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
  if (typeof name !== 'string' || !name || name.length > 255) return false;
  // TextEncoder replaces lone UTF-16 surrogates with U+FFFD. Reject them instead
  // of silently changing filenames or allowing distinct inputs to encode identically.
  for (let i = 0; i < name.length; i++) {
    const unit = name.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = name.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  const s = name;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\:]/.test(s) || s.startsWith('/') || s.endsWith('/')) return false;
  return s.split('/').every(seg => seg !== '' && seg !== '.' && seg !== '..');
}

function dosDateTime(d) {
  // A NaN timestamp otherwise becomes zero-valued DOS month/day fields.
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) throw new Error('Invalid ZIP date.');
  const y = Math.min(2107, Math.max(1980, d.getFullYear()));
  // The upper DOS year bound (2107) is not a leap year. An out-of-range
  // February 29 must not become the impossible date 2107-02-29.
  const day = y === 2107 && d.getMonth() === 1 && d.getDate() === 29
    ? 28 : d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | day;
  return { time: time & 0xffff, date: date & 0xffff };
}

function toBytes(data, maxBytes) {
  if (data instanceof Uint8Array) {
    if (data.length > maxBytes) throw new Error('Zip too large.');
    return data;
  }
  if (typeof data === 'string') {
    // Count UTF-8 bytes before encoding so oversized text cannot allocate a
    // much larger temporary Uint8Array than the archive's remaining budget.
    // TextEncoder maps unpaired UTF-16 surrogates to the three-byte U+FFFD.
    let byteCount = 0;
    for (let i = 0; i < data.length; i++) {
      const unit = data.charCodeAt(i);
      if (unit <= 0x7f) byteCount += 1;
      else if (unit <= 0x7ff) byteCount += 2;
      else if (unit >= 0xd800 && unit <= 0xdbff
          && i + 1 < data.length
          && data.charCodeAt(i + 1) >= 0xdc00
          && data.charCodeAt(i + 1) <= 0xdfff) {
        byteCount += 4;
        i++;
      } else byteCount += 3;
      if (byteCount > maxBytes) throw new Error('Zip too large.');
    }
    return enc.encode(data);
  }
  // Treat unexpected payload types as errors, not counts of zero-filled bytes.
  throw new Error('Invalid ZIP entry data: expected text or Uint8Array.');
}

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
  let archiveBytes = 22; // End-of-central-directory record.
  for (const e of entries) {
    // Read an entry name once. Accessor-backed names must not change after validation.
    const entryName = e?.name;
    if (!validateEntryName(entryName)) throw new Error(`Invalid zip entry name: ${entryName}`);
    if (seen.has(entryName)) throw new Error(`Duplicate zip entry: ${entryName}`);
    seen.add(entryName);
    const name = enc.encode(entryName);
    // Reserve both ZIP records and both copies of the encoded filename.
    const remainingBytes = MAX_ZIP_BYTES - archiveBytes - 30 - 46 - 2 * name.length;
    if (remainingBytes < 0) throw new Error('Zip too large.');
    const data = toBytes(e.data, remainingBytes);
    if (data.length > 0xfffffffe || offset > 0xfffffffe) throw new Error('Zip too large.');
    // Fail before computing a CRC or allocating the combined output. Payload-only
    // checks miss the local headers, central directory and end record.
    archiveBytes += 30 + name.length + data.length + 46 + name.length;
    if (archiveBytes > MAX_ZIP_BYTES) throw new Error('Zip too large.');
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
