// Gear ledger privacy (FS-33 §2 AC-2, §6, §7). Pure: no DOM, no I/O.
//   FIELDS / PRESETS / NEVER_INCLUDED   the toggle matrix and its three presets (Public, Insurance, Private)
//   normalizeRules(raw)                 untrusted rules (UI, storage) -> known keys and booleans only
//   effectiveRules(rules, assetId)      global toggles + the per-item overrides for one item
//   applyPrivacy(item, rules)           whitelist serialiser: only the fields ticked for that item are copied
//   maskSerial(serial, mode)            'hidden' -> null, 'masked' -> '****1234', 'full' -> as typed
//   scrubText(text, max)                drops control characters and anything that looks like a file path
//   stripJpegMetadata(bytes)            rebuilds a JPEG without APPn (EXIF/GPS/XMP/ICC/IPTC/JFIF) and COM segments
//   privacySummary(ledger, rules)       the "What will be public" list shown before export
// Rule of thumb: a value reaches the ledger only through applyPrivacy; nothing is copied by spreading a record.

export const SERIAL_MODES = Object.freeze(['hidden', 'masked', 'full']);

/** Field toggles in matrix order. `serial` is a mode (SERIAL_MODES), every other field is a boolean. */
export const FIELDS = Object.freeze([
  { key: 'nickname', label: 'Nickname', hint: 'Your own name for the unit. It can contain a person\'s name.' },
  { key: 'purchaseDate', label: 'Purchase month', hint: 'Month only (YYYY-MM).' },
  { key: 'condition', label: 'Condition' },
  { key: 'firmware', label: 'Firmware' },
  { key: 'publicNotes', label: 'Public note', hint: 'The note you write for this ledger.' },
  { key: 'photos', label: 'Photos', hint: 'Re-encoded JPEG, at most 1600 px, all metadata (EXIF, GPS) removed.' },
  { key: 'service', label: 'Service history', hint: 'Dates and types of maintenance.' },
  { key: 'serviceNotes', label: 'Service descriptions', hint: 'Free text from the maintenance log.' },
  { key: 'certificates', label: 'Signed test certificates', hint: 'Embedded unchanged so they stay verifiable: they include the full serial number, the tester name, the certificate notes, the test photos with their original file names and the names of the measurement devices. A certificate with photos is left out for units whose Photos are off.' },
  { key: 'notes', label: 'Private notes', hint: 'The notes field from Equipment. Excluded unless you tick it.' },
]);
export const FIELD_KEYS = Object.freeze(FIELDS.map(f => f.key));

/** Never exported, whatever is ticked (spec §7). DeckChek stores no purchase price; venue and booth data stay local. */
export const NEVER_INCLUDED = Object.freeze([
  { key: 'price', label: 'Purchase price', why: 'DeckChek does not store prices.' },
  { key: 'location', label: 'Location and venue', why: 'Venue, booth and position data are never exported.' },
  { key: 'paths', label: 'File paths and user names', why: 'Removed from every exported text.' },
  { key: 'exif', label: 'Photo metadata (EXIF, GPS)', why: 'Always stripped.' },
]);

const preset = (serialMode, on) => Object.freeze({ serialMode, fields: Object.freeze(Object.fromEntries(FIELD_KEYS.map(k => [k, on.includes(k)]))) });
export const PRESETS = Object.freeze({
  public: preset('hidden', ['condition', 'firmware', 'publicNotes', 'photos', 'service']),
  insurance: preset('masked', ['nickname', 'purchaseDate', 'condition', 'firmware', 'publicNotes', 'photos', 'service']),
  private: preset('full', ['nickname', 'purchaseDate', 'condition', 'firmware', 'publicNotes', 'photos', 'service', 'serviceNotes', 'certificates']),
});
export const PRESET_LABELS = Object.freeze({ public: 'Public', insurance: 'Insurance', private: 'Private', custom: 'Custom' });
export const DEFAULT_PRESET = 'public';
export const MAX_OWNER_CHARS = 80;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Rules for a preset: {preset, serialMode, fields, items:{}, ownerName:''}. Unknown names fall back to Public. */
export function makeRules(name = DEFAULT_PRESET) {
  const p = PRESETS[name] ? name : DEFAULT_PRESET;
  return { preset: p, serialMode: PRESETS[p].serialMode, fields: { ...PRESETS[p].fields }, items: {}, ownerName: '' };
}

export const MAX_ITEM_OVERRIDES = 500;
const MAX_ITEM_SCAN = 10000;

/**
 * Normalises untrusted rules: unknown keys dropped, non-boolean toggles fall back to the preset, at most 500 item
 * overrides with ids up to 128 characters. Empty override objects (the matrix creates one per row it shows) are
 * dropped before the cap, so they never push a real override out. Missing input -> Public defaults (the safest preset).
 */
export function normalizeRules(raw) {
  const r = isObj(raw) ? raw : {};
  const base = makeRules(r.preset === 'custom' ? DEFAULT_PRESET : r.preset);
  const out = { ...base, preset: PRESETS[r.preset] || r.preset === 'custom' ? r.preset : base.preset };
  if (SERIAL_MODES.includes(r.serialMode)) out.serialMode = r.serialMode;
  if (isObj(r.fields)) for (const k of FIELD_KEYS) if (typeof r.fields[k] === 'boolean') out.fields[k] = r.fields[k];
  out.items = {};
  if (isObj(r.items)) {
    let scanned = 0;
    for (const [id, o] of Object.entries(r.items)) {
      if (++scanned > MAX_ITEM_SCAN || Object.keys(out.items).length >= MAX_ITEM_OVERRIDES) break;
      if (!id || id.length > 128 || !isObj(o) || id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
      const item = {};
      if (typeof o.include === 'boolean') item.include = o.include;
      if (SERIAL_MODES.includes(o.serialMode)) item.serialMode = o.serialMode;
      if (isObj(o.fields)) {
        const f = {};
        for (const k of FIELD_KEYS) if (typeof o.fields[k] === 'boolean') f[k] = o.fields[k];
        if (Object.keys(f).length) item.fields = f;
      }
      if (Object.keys(item).length) out.items[id] = item;
    }
  }
  out.ownerName = typeof r.ownerName === 'string' ? scrubText(r.ownerName, MAX_OWNER_CHARS).replace(/\s+/g, ' ') : '';
  return out;
}

/** True when the rules equal their preset (no field, serial or per-item change). */
export function matchesPreset(rules) {
  const p = PRESETS[rules?.preset];
  if (!p) return false;
  return rules.serialMode === p.serialMode && FIELD_KEYS.every(k => rules.fields[k] === p.fields[k])
    && Object.values(rules.items || {}).every(o => o.serialMode === undefined && !(o.fields && Object.keys(o.fields).length));
}

/** {serialMode, fields} for one item: per-item overrides win over the global toggles. */
export function effectiveRules(rules, assetId) {
  const r = rules?.fields ? rules : normalizeRules(rules);
  const o = (assetId != null && isObj(r.items) && own(r.items, assetId)) ? r.items[assetId] : {};
  const fields = { ...r.fields };
  if (isObj(o.fields)) for (const k of FIELD_KEYS) if (typeof o.fields[k] === 'boolean') fields[k] = o.fields[k];
  return { serialMode: SERIAL_MODES.includes(o.serialMode) ? o.serialMode : r.serialMode, fields };
}

/** Spec §6: keep the last 4 characters in "masked" (fewer for short serials, so a mask never shows the whole value). */
export function maskSerial(serial, mode) {
  const s = scrubText(serial, 64);
  if (!s || mode === 'hidden' || !SERIAL_MODES.includes(mode)) return null;
  if (mode === 'full') return s;
  const chars = [...s];
  const keep = chars.length >= 8 ? 4 : Math.floor(chars.length / 2);
  return `****${chars.slice(chars.length - keep).join('')}`;
}

// Non-web scheme URLs (file://, smb://, sftp://, afp://, nfs://, ...), Windows drive paths, UNC paths, home-relative
// paths, absolute POSIX paths with two or more segments, and paths under a known root (/Users, /home, /root, /mnt,
// /media, /Volumes). A path continues across spaces while the next word still holds a separator
// ("C:\Users\Jo Smith\x.jpg" is one path).
// A generic POSIX or home path must start the text or follow a space, a quote, a bracket or one of = : , ; | > so a
// '/' inside ordinary words ("50%/60%/70%", "Café/Bar/x", "A&B/C/D") is never read as a path. A path under a known
// root may follow any character except a letter or digit in any script (Unicode classes), so "50%/home/jo/x" is
// caught while "Café/Users" is not. A drive letter must not follow a letter or digit, so the "s:/" in "https://" or the
// "h:/" in "path:/home" is never read as a drive. Web URLs are handled first (see scrubText).
const SEG = String.raw`[^\s"'\x60<>|()[\]{}]`;
const MORE = String.raw`(?:[ \t]+${SEG}*[\\/]${SEG}*)*`;
const LEAD = String.raw`(^|[\s"'\x60([{<>=:,;|])`;
const PATH_RES = [
  /\b(?!(?:https?|ftps?):\/\/)[a-z][a-z0-9+.-]{0,31}:\/\/[^\s"'<>|()]*(?:[ \t]+[^\s"'<>|()]*[\\/][^\s"'<>|()]*)*/gi,
  /(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s"'<>|()]*(?:[ \t]+[^\s"'<>|()]*[\\/][^\s"'<>|()]*)*/g,
  /\\\\[^\s"'<>|()]+(?:[ \t]+[^\s"'<>|()]*[\\/][^\s"'<>|()]*)*/g,
  new RegExp(String.raw`(^|[^\p{L}\p{N}\p{M}_/.~\\-])\/(?:Users|home|root|mnt|media|Volumes)\/${SEG}+${MORE}`, 'giu'),
  new RegExp(String.raw`${LEAD}~[\\/]${SEG}*${MORE}`, 'g'),
  new RegExp(String.raw`${LEAD}\/(?:[^\s/"'<>|()[\]{}]+\/)+${SEG}*${MORE}`, 'g'),
];
export const PATH_PLACEHOLDER = '[path removed]';
// http(s)/ftp(s) URLs stay as typed (manual links) unless they carry a home folder ("/Users/<name>", "/home/<name>");
// then the whole URL is removed, including a user name with a space in it.
const URL_RE = /\b(?:https?|ftps?):\/\/[^\s"'<>]*[^\s"'<>.,;:!?)\]}]/gi;
const URL_USER_PATH = /\/(?:Users|home)\/[^/\s?#]+/i;
const URL_PATH_MORE = /^(?:[ \t]+[^\s"'<>|()]*[\\/][^\s"'<>|()]*)*/;

function scrubPaths(s) {
  // For the patterns with a leading-context group, args[0] is that group; otherwise it is the match offset (a number).
  for (const re of PATH_RES) s = s.replace(re, (m, ...args) => `${typeof args[0] === 'string' ? args[0] : ''}${PATH_PLACEHOLDER}`);
  return s;
}

/**
 * Text that may be exported: NFC, control characters removed (line breaks kept), anything that looks like a file path
 * replaced by "[path removed]" (paths carry user names), trimmed, at most `max` characters. Non-strings -> ''.
 * Web URLs (http, https, ftp, ftps) are kept intact; a URL of any other scheme (file, smb, sftp, afp, ...) or a URL
 * with a home folder in it counts as a path.
 */
export function scrubText(text, max = 2000) {
  if (typeof text !== 'string') return '';
  let s = text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, c => (c === '\t' ? ' ' : ''));
  let out = '', last = 0;
  for (const m of s.matchAll(URL_RE)) {
    if (m.index < last) continue; // inside the user-path tail already removed below
    out += scrubPaths(s.slice(last, m.index));
    last = m.index + m[0].length;
    if (URL_USER_PATH.test(m[0])) { out += PATH_PLACEHOLDER; last += URL_PATH_MORE.exec(s.slice(last))[0].length; } else out += m[0];
  }
  s = (out + scrubPaths(s.slice(last))).replace(/[ \t]+\n/g, '\n').trim();
  const chars = [...s];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : s;
}

/** 'YYYY-MM' from an ISO-ish date, else null (spec §5 example "2023-05"). */
export function purchaseMonth(v) {
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})/.exec(v.trim()) : null;
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}` : null;
}

/**
 * Whitelist serialiser for one item (spec §4 `applyPrivacy(item, rules)`). `item` is the collected, untrusted record
 * {assetId, nickname, serialNumber, purchaseDate, condition, firmware, notes, publicNotes, manufacturer, model, category};
 * photos, service and certificates are added by build.js under the same field toggles. Returns only ticked fields.
 */
export function applyPrivacy(item, rules) {
  const { serialMode, fields } = effectiveRules(rules, item?.assetId);
  const out = { serialMode };
  const put = (key, value) => { if (value) out[key] = value; };
  put('manufacturer', scrubText(item?.manufacturer, 120));
  put('model', scrubText(item?.model, 120));
  put('category', scrubText(item?.category, 60));
  if (fields.nickname) put('nickname', scrubText(item?.nickname, 120));
  const serial = maskSerial(item?.serialNumber, serialMode);
  if (serial) out.serial = serial; else out.serialMode = 'hidden';
  if (fields.purchaseDate) put('purchaseDate', purchaseMonth(item?.purchaseDate));
  if (fields.condition) put('condition', scrubText(item?.condition, 120));
  if (fields.firmware) put('firmware', scrubText(item?.firmware, 60));
  if (fields.publicNotes) put('publicNotes', scrubText(item?.publicNotes, 2000));
  if (fields.notes) put('notes', scrubText(item?.notes, 2000));
  return out;
}

// ---------------------------------------------------------------- JPEG metadata

/**
 * Rebuilds a JPEG keeping only what the decoder needs (SOI, DQT, SOF, DHT, DRI, DNL, scans, EOI). Every APP0-APP15
 * segment (JFIF thumbnail, EXIF and GPS, XMP, ICC, IPTC, Adobe) and every COM comment is dropped, as is anything after
 * EOI. Throws on a structurally broken file. Returns a new Uint8Array.
 */
export function stripJpegMetadata(b) {
  const fail = m => { throw new Error(`photo: ${m}`); };
  if (!(b instanceof Uint8Array) || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) fail('not a JPEG');
  const parts = [b.subarray(0, 2)];
  let i = 2, scans = 0;
  for (;;) {
    if (i >= b.length || b[i] !== 0xff) fail('corrupt JPEG (expected a marker)');
    while (i + 1 < b.length && b[i + 1] === 0xff) i++;
    const m = b[i + 1];
    if (m === undefined) fail('truncated JPEG');
    if (m === 0xd9) { parts.push(Uint8Array.of(0xff, 0xd9)); break; }
    if (m === 0x00 || m === 0xd8) fail('corrupt JPEG (unexpected marker)');
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { parts.push(b.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > b.length) fail('truncated JPEG');
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) fail('truncated or corrupt JPEG segment');
    const end = i + 2 + len;
    const drop = (m >= 0xe0 && m <= 0xef) || m === 0xfe;
    if (m === 0xda) {
      scans++;
      let j = end;
      for (;;) {
        while (j < b.length && b[j] !== 0xff) j++;
        if (j + 1 >= b.length) fail('truncated JPEG scan');
        const n = b[j + 1];
        if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) j += 2;
        else if (n === 0xff) j += 1;
        else break;
      }
      parts.push(b.subarray(i, j));
      i = j;
      continue;
    }
    if (!drop) parts.push(b.subarray(i, end));
    i = end;
  }
  if (!scans) fail('JPEG has no image data');
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---------------------------------------------------------------- summary

/**
 * The pre-export "What will be public" summary (spec §7): every field with the number of items that include it,
 * serial handling, photo and certificate counts, the never-included list and warnings. Pure, from the built ledger.
 */
export function privacySummary(ledger, rules) {
  const items = Array.isArray(ledger?.items) ? ledger.items : [];
  const count = pred => items.filter(pred).length;
  const has = k => it => it[k] !== undefined && !(Array.isArray(it[k]) && !it[k].length);
  const fields = [
    { key: 'title', label: 'Manufacturer and model', items: count(it => it.manufacturer || it.model) },
    { key: 'serial', label: 'Serial number', items: count(it => it.serial), detail: serialDetail(items) },
    ...FIELDS.filter(f => !['photos', 'service', 'serviceNotes', 'certificates'].includes(f.key)).map(f => ({ key: f.key, label: f.label, items: count(has(f.key)) })),
    { key: 'service', label: 'Service history', items: count(has('service')) },
    { key: 'serviceNotes', label: 'Service descriptions', items: count(it => (it.service || []).some(s => s.description)) },
  ];
  const itemPhotos = items.reduce((n, it) => n + (it.photos?.length || 0), 0);
  const certs = items.flatMap(it => (Array.isArray(it.certificates) ? it.certificates : []));
  const certificates = certs.length;
  const certPhotos = certs.flatMap(c => (Array.isArray(c?.signed?.payload?.unit?.photos) ? c.signed.payload.unit.photos.filter(isObj) : []));
  const photos = itemPhotos + certPhotos.length;
  const warnings = [];
  if (certificates) {
    const devices = [...new Set(certs.flatMap(c => (Array.isArray(c?.signed?.payload?.measurements) ? c.signed.payload.measurements : [])
      .map(m => (typeof m?.calibration?.refId === 'string' ? m.calibration.refId.split('|')[0].trim() : '')).filter(d => d && d !== 'default')))];
    const names = [...new Set(certPhotos.map(p => (typeof p.name === 'string' ? p.name : '')).filter(Boolean))];
    warnings.push(`${certificates} signed certificate${certificates === 1 ? '' : 's'} included: each shows the full serial number, the tester name and the certificate notes, because changing them would break verification.${
      certPhotos.length ? ` They also carry ${certPhotos.length} photo${certPhotos.length === 1 ? '' : 's'} under their original file names (${listed(names)}).` : ''}${
      devices.length ? ` Measurement device names shown: ${listed(devices)}.` : ''}`);
  }
  if (count(it => it.notes)) warnings.push('Private notes are included for some items.');
  if (count(it => it.serialMode === 'full')) warnings.push('Full serial numbers are included for some items.');
  if (ledger?.owner?.displayName) warnings.push(`Owner name shown: "${ledger.owner.displayName}".`);
  return {
    preset: rules?.preset || 'custom', items: items.length, fields, photos, itemPhotos, certificatePhotos: certPhotos.length, certificates,
    owner: ledger?.owner?.displayName || null, never: NEVER_INCLUDED.map(n => ({ ...n })), warnings,
  };
}

/** '"a", "b" and 3 more' (at most 8 names, each quoted and capped at 80 characters). */
function listed(names) {
  const shown = names.slice(0, 8).map(n => `"${[...n].slice(0, 80).join('')}"`).join(', ');
  return names.length > 8 ? `${shown} and ${names.length - 8} more` : shown;
}

function serialDetail(items) {
  const n = { hidden: 0, masked: 0, full: 0 };
  for (const it of items) n[it.serialMode] = (n[it.serialMode] || 0) + 1;
  return `${n.full} full, ${n.masked} masked, ${n.hidden} hidden`;
}
