// Photo store, frontend half (FS-00 §4.11; Rust half: src-tauri/src/photo.rs).
//   preparePhoto(file)  decode -> canvas <= 1600 px long edge -> JPEG q0.82 (the re-encode drops
//                       EXIF/GPS) -> { bytes, width, height, sha256 }. Rejects sources > 8 MB and
//                       files whose magic bytes are not png/jpeg/webp.
//   createPhotoStore()  { attach, list, unlink, read } over the Rust commands photo_attach,
//                       photo_list, photo_unlink, photo_read. Without the desktop app it falls back to
//                       an in-memory store with the same API shape and the same rules; nothing is written
//                       to localStorage or IndexedDB (photos are too large for localStorage), so browser-mode
//                       photos last until the page is closed.
import { sha256Hex } from './sha256.js';

export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_STORED_BYTES = 2 * 1024 * 1024;
export const MAX_EDGE_PX = 1600;
export const JPEG_QUALITY = 0.82;
export const OWNER_KINDS = Object.freeze(['asset', 'service_job', 'certificate']);
export const MAX_LINKS_PER_OWNER = 100;
const FALLBACK_QUALITIES = [0.7, 0.55, 0.4];

// ---------------------------------------------------------------- bytes helpers

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const photoDataUrl = b64 => `data:image/jpeg;base64,${b64}`;

/** 'jpeg' | 'png' | 'webp' from magic bytes, else null. File names and MIME types are never trusted. */
export function sniffImageType(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

/** Scale (w, h) down so the long edge is at most `max`; never up. Integers >= 1. */
export function fitWithin(w, h, max = MAX_EDGE_PX) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * Structural JPEG check, the JS twin of photo::inspect_jpeg: SOI, segments, one frame header, a scan,
 * EOI at the very end; rejects APP1 (EXIF/XMP) and APP13 (IPTC) anywhere. Returns {width, height}.
 */
export function inspectJpeg(b) {
  const fail = m => { throw new Error(m); };
  if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) fail('not a JPEG: the file does not start with FF D8 FF');
  let i = 2, dims = null, scans = 0;
  for (;;) {
    if (i >= b.length || b[i] !== 0xff) fail('corrupt JPEG: expected a marker');
    while (i + 1 < b.length && b[i + 1] === 0xff) i++;
    const m = b[i + 1];
    if (m === undefined) fail('truncated JPEG');
    if (m === 0x00 || m === 0xd8) fail('corrupt JPEG: unexpected marker');
    if (m === 0xd9) {
      if (i + 2 !== b.length) fail('JPEG has data after the end-of-image marker');
      if (!dims) fail('JPEG has no frame header');
      if (!scans) fail('JPEG has no image data');
      return dims;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (i + 4 > b.length) fail('truncated JPEG');
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) fail('truncated or corrupt JPEG segment');
    if (m === 0xe1) fail('the JPEG carries an EXIF/XMP (APP1) segment; metadata is not allowed');
    if (m === 0xed) fail('the JPEG carries an IPTC (APP13) segment; metadata is not allowed');
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (dims) fail('JPEG has more than one frame header');
      if (len - 2 < 6) fail('corrupt JPEG frame header');
      dims = { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
    if (m === 0xda) {
      scans++;
      for (;;) {
        while (i < b.length && b[i] !== 0xff) i++;
        if (i + 1 >= b.length) fail('truncated JPEG');
        const n = b[i + 1];
        if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) i += 2;
        else if (n === 0xff) i += 1;
        else break;
      }
    }
  }
}

/** Same rules as photo::validate_jpeg: structure, no metadata, dimensions, size. */
export function validateJpeg(bytes) {
  if (bytes.length > MAX_STORED_BYTES) throw new Error(`the photo is ${bytes.length} bytes; the limit is ${MAX_STORED_BYTES}`);
  const info = inspectJpeg(bytes);
  if (!info.width || !info.height) throw new Error('the JPEG has a zero dimension');
  if (Math.max(info.width, info.height) > MAX_EDGE_PX) throw new Error(`the photo is ${info.width}x${info.height} px; the long edge limit is ${MAX_EDGE_PX}`);
  return info;
}

// ---------------------------------------------------------------- preparePhoto

async function readBytes(file) {
  if (file instanceof Uint8Array) return file;
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  if (file && typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  throw new TypeError('preparePhoto: expected a File, Blob or bytes');
}

function defaultCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    return { getContext: () => canvas.getContext('2d'), toBlob: q => canvas.convertToBlob({ type: 'image/jpeg', quality: q }) };
  }
  const canvas = globalThis.document?.createElement('canvas');
  if (!canvas) throw new Error('This environment cannot process photos (no canvas).');
  canvas.width = width; canvas.height = height;
  return { getContext: () => canvas.getContext('2d'), toBlob: q => new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('JPEG encoding failed'))), 'image/jpeg', q)) };
}

/**
 * Turn a user-chosen image into a storable JPEG. `env` is for tests: { createImageBitmap, createCanvas(w, h) }
 * where createCanvas returns { getContext(), toBlob(quality) -> Blob-like with arrayBuffer() }.
 * -> { bytes: Uint8Array (JPEG), width, height, sha256 }
 */
export async function preparePhoto(file, env = {}) {
  const size = file?.size ?? file?.byteLength ?? file?.length;
  if (typeof size === 'number' && size > MAX_SOURCE_BYTES) throw new Error(`That photo is ${(size / 1048576).toFixed(1)} MB; the limit is 8 MB.`);
  const source = await readBytes(file);
  if (source.length > MAX_SOURCE_BYTES) throw new Error('That photo is larger than 8 MB.');
  if (!sniffImageType(source)) throw new Error('That file is not a PNG, JPEG or WebP image.');
  const decode = env.createImageBitmap ?? globalThis.createImageBitmap;
  if (typeof decode !== 'function') throw new Error('This environment cannot decode images.');
  const blob = file instanceof Blob ? file : new Blob([source]);
  const bitmap = await decode(blob, { imageOrientation: 'from-image' });
  try {
    let { width, height } = fitWithin(bitmap.width, bitmap.height);
    for (let attempt = 0; attempt < 8; attempt++) {
      const makeCanvas = env.createCanvas ?? defaultCanvas;
      const canvas = makeCanvas(width, height);
      const ctx = canvas.getContext();
      ctx.fillStyle = '#fff';           // JPEG has no alpha: flatten transparent PNG/WebP onto white
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const q of [JPEG_QUALITY, ...FALLBACK_QUALITIES]) {
        const out = await canvas.toBlob(q);
        const bytes = new Uint8Array(await out.arrayBuffer());
        if (sniffImageType(bytes) !== 'jpeg') throw new Error('This environment could not encode JPEG.');
        if (bytes.length <= MAX_STORED_BYTES) {
          validateJpeg(bytes);
          return { bytes, width, height, sha256: await sha256Hex(bytes) };
        }
      }
      width = Math.max(1, Math.round(width * 0.8)); height = Math.max(1, Math.round(height * 0.8));
    }
    throw new Error('Could not shrink that photo under 2 MB.');
  } finally {
    bitmap.close?.();
  }
}

// ---------------------------------------------------------------- stores

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

function checkOwner(kind, id) {
  if (!OWNER_KINDS.includes(kind)) throw new Error(`ownerKind must be one of ${OWNER_KINDS.join(', ')}`);
  const owner = String(id ?? '').trim();
  if (!owner || owner.length > 128) throw new Error('ownerId must be 1-128 characters');
  return owner;
}
function cleanText(label, v, max) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  if ([...s].length > max) throw new Error(`${label} is longer than ${max} characters`);
  return s;
}

/** In-memory twin of photo.rs (same rules, same result shapes). `now` is injectable for tests. */
export function createMemoryPhotoStore({ now = () => new Date().toISOString() } = {}) {
  const photos = new Map(); // id -> {id, sha256, width, height, bytes, data}
  const links = new Map();  // id -> link row
  const bySha = sha => [...photos.values()].find(p => p.sha256 === sha);
  const dropIfOrphan = photoId => {
    if ([...links.values()].some(l => l.photoId === photoId)) return false;
    return photos.delete(photoId);
  };
  return {
    native: false,
    async attach(input) {
      const ownerId = checkOwner(input?.ownerKind, input?.ownerId);
      const caption = cleanText('caption', input.caption, 500), altText = cleanText('altText', input.altText, 500), stage = cleanText('stage', input.stage, 64);
      const data = input.bytesB64 ? base64ToBytes(input.bytesB64) : input.bytes;
      if (!(data instanceof Uint8Array)) throw new Error('attach needs JPEG bytes');
      const info = validateJpeg(data);
      const sha256 = await sha256Hex(data);
      let photo = bySha(sha256);
      const deduplicated = !!photo;
      if (!photo) { photo = { id: newId(), sha256, width: info.width, height: info.height, bytes: data.length, data: data.slice() }; photos.set(photo.id, photo); }
      let link = [...links.values()].find(l => l.photoId === photo.id && l.ownerKind === input.ownerKind && l.ownerId === ownerId);
      if (link) {
        link.caption = caption ?? link.caption; link.altText = altText ?? link.altText; link.stage = stage ?? link.stage;
      } else {
        const mine = [...links.values()].filter(l => l.ownerKind === input.ownerKind && l.ownerId === ownerId);
        if (mine.length >= MAX_LINKS_PER_OWNER) { dropIfOrphan(photo.id); throw new Error(`an owner can have at most ${MAX_LINKS_PER_OWNER} photos`); }
        link = { linkId: newId(), photoId: photo.id, ownerKind: input.ownerKind, ownerId, caption, altText, stage, isPrimary: false, sort: mine.length ? Math.max(...mine.map(l => l.sort)) + 1 : 0, createdAt: now() };
        links.set(link.linkId, link);
      }
      if (input.isPrimary) for (const l of links.values()) if (l.ownerKind === input.ownerKind && l.ownerId === ownerId) l.isPrimary = l === link;
      return { photoId: photo.id, sha256, linkId: link.linkId, width: info.width, height: info.height, bytes: data.length, deduplicated };
    },
    async list(ownerKind, ownerId) {
      const owner = checkOwner(ownerKind, ownerId);
      return [...links.values()].filter(l => l.ownerKind === ownerKind && l.ownerId === owner).sort((a, b) => a.sort - b.sort || a.createdAt.localeCompare(b.createdAt) || a.linkId.localeCompare(b.linkId))
        .map(l => { const p = photos.get(l.photoId); return { linkId: l.linkId, photoId: l.photoId, sha256: p.sha256, width: p.width, height: p.height, bytes: p.bytes, caption: l.caption, altText: l.altText, stage: l.stage, isPrimary: l.isPrimary, sort: l.sort, createdAt: l.createdAt }; });
    },
    async unlink(linkId) {
      const link = links.get(linkId);
      if (!link) return { unlinked: false, fileDeleted: false };
      links.delete(linkId);
      return { unlinked: true, fileDeleted: dropIfOrphan(link.photoId) };
    },
    async read(photoId) {
      const p = photos.get(photoId);
      if (!p) throw new Error('unknown photo');
      return bytesToBase64(p.data);
    },
  };
}

const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;

/**
 * Photo API. With the desktop app every call goes to the Rust command; otherwise the in-memory store answers.
 * attach({ownerKind, ownerId, file | bytes (prepared JPEG) | bytesB64, caption?, altText?, stage?, isPrimary?}) -> {photoId, sha256, linkId, width, height, bytes, deduplicated}
 */
export function createPhotoStore({ invoke = nativeInvoke(), memory = createMemoryPhotoStore(), prepare = preparePhoto } = {}) {
  return {
    native: !!invoke,
    async attach({ file, bytes, bytesB64, ...rest } = {}) {
      checkOwner(rest.ownerKind, rest.ownerId);
      if (file !== undefined) ({ bytes } = await prepare(file));
      if (!bytesB64) {
        if (!(bytes instanceof Uint8Array)) throw new Error('attach needs a file or JPEG bytes');
        bytesB64 = bytesToBase64(bytes);
      }
      const input = { ...rest, bytesB64 };
      if (!invoke) return memory.attach(input);
      return invoke('photo_attach', { input });
    },
    async list(ownerKind, ownerId) { return invoke ? invoke('photo_list', { ownerKind, ownerId }) : memory.list(ownerKind, ownerId); },
    async unlink(linkId) { return invoke ? invoke('photo_unlink', { linkId }) : memory.unlink(linkId); },
    /** -> base64 of the stored JPEG (use photoDataUrl for an <img src>). */
    async read(photoId) { return invoke ? invoke('photo_read', { photoId }) : memory.read(photoId); },
  };
}
