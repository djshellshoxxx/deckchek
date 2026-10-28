// Gear ledger model and files (FS-33 §4 `buildLedger(state, selection, privacy) -> {json, files}`). Pure apart from
// hashing; the UI collects `state` (catalog, photos, service log, certificates) and writes the files.
//
// state = {
//   assets:   [{id, productId, nickname, serialNumber, purchaseDate, condition, firmware, notes, publicNotes}],
//   products: [{id, manufacturerId, model, category}],  manufacturers: [{id, name}],
//   service:  {[assetId]: [{eventType, eventAt, description}]},
//   photos:   {[assetId]: [{photoId, sha256, altText, caption, bytes: Uint8Array}]},
//   certificates: {[assetId]: [{id, fileJson}]}            (FS-20 rows; fileJson = the signed file, canonical text)
// }
// selection = {items: [assetId, ...]};  privacy = rules from privacy.js (normalised here).
// opts = {revision, generatedAt, mode: 'folder'|'single', reencode?(bytes) -> Promise<Uint8Array>}
//
// Output files (folder mode, under `ledger/`): index.html, ledger.json, assets/<itemId>/pN.jpg and
// certificates/c-<hash12>.deckchek-cert.json. Single-file mode: one HTML with photos as data URIs, only while all
// photos together stay under SINGLE_FILE_MAX_BYTES (spec §10).

import { applyPrivacy, effectiveRules, normalizeRules, privacySummary, scrubText, stripJpegMetadata, PATH_PLACEHOLDER } from './privacy.js';
import { canonicalJson, ledgerItemsSha256, sha256Hex, sha256HexSync, stableJsonText } from './hash.js';
import { renderLedgerHtml, itemTitle } from './template.js';
import { validateJpeg, bytesToBase64 } from '../photo-store.js';

export const LEDGER_FORMAT = 'deckchek-ledger';
export const LEDGER_VERSION = 1;
export const LEDGER_DIR = 'ledger';
export const LEDGER_EXTS = Object.freeze(['html', 'json', 'jpg']);
export const SINGLE_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const LIMITS = Object.freeze({ maxItems: 500, maxPhotosPerItem: 24, maxServicePerItem: 200, maxCertificatesPerItem: 20, maxCertificateChars: 20 * 1024 * 1024 });
export const SERVICE_LABELS = Object.freeze({ clean: 'Cleaned', lubricate: 'Lubricated', calibrate: 'Calibrated', repair: 'Repaired', replace_part: 'Part replaced', inspect: 'Inspected', other: 'Other maintenance' });

export class LedgerError extends Error {
  constructor(code, message) { super(message); this.name = 'LedgerError'; this.code = code; }
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = v => (Array.isArray(v) ? v : []);
const isoOrNull = v => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** Stable, opaque ledger id for an asset (no internal ids in file names or the public JSON). */
export const ledgerItemId = assetId => `a${sha256HexSync(String(assetId)).slice(0, 10)}`;

function productInfo(state, asset) {
  const product = arr(state.products).find(p => p.id === asset.productId) || null;
  const maker = product && arr(state.manufacturers).find(m => m.id === product.manufacturerId);
  return { manufacturer: maker?.name || '', model: product?.model || '', category: product?.category || '' };
}

function serviceEntries(rows, withNotes) {
  return arr(rows).slice(0, 5000).map(r => {
    const at = typeof r?.eventAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.eventAt) ? r.eventAt.slice(0, 10) : null;
    if (!at) return null;
    const e = { at, type: SERVICE_LABELS[r.eventType] || SERVICE_LABELS.other };
    const d = withNotes ? scrubText(r.description, 500) : '';
    if (d) e.description = d;
    return e;
  }).filter(Boolean).sort((a, b) => a.at.localeCompare(b.at) || a.type.localeCompare(b.type) || (a.description || '').localeCompare(b.description || '')).slice(-LIMITS.maxServicePerItem);
}

/** A stored FS-20 certificate -> ledger entry with the signed file embedded unchanged, or {skip: reason}. */
export async function certificateEntry(row) {
  const text = typeof row?.fileJson === 'string' ? row.fileJson : null;
  if (!text) return { skip: 'the stored certificate has no file' };
  if (text.length > LIMITS.maxCertificateChars) return { skip: 'the certificate is larger than 20 MB' };
  let file;
  try { file = JSON.parse(text); } catch { return { skip: 'the stored certificate is not valid JSON' }; }
  if (!isObj(file) || file.format !== 'deckchek-certificate' || file.version !== 1) return { skip: 'not a version 1 DeckChek certificate' };
  const i = file.integrity;
  if (!isObj(i) || !/^[0-9a-f]{64}$/.test(i.contentHash || '')) return { skip: 'unsigned drafts are not included' };
  let hash;
  try { hash = await sha256Hex(canonicalJson(file.payload)); } catch { return { skip: 'the certificate payload cannot be hashed' }; }
  if (hash !== i.contentHash) return { skip: 'the stored certificate no longer matches its content hash' };
  const p = isObj(file.payload) ? file.payload : {};
  const entry = {
    id: `c-${i.contentHash.slice(0, 12)}`, kind: 'deckchek-certificate', issuedAt: String(p.issuedAt ?? ''), validUntil: String(p.validUntil ?? ''),
    verdict: String(p.verdict ?? ''), sha256: i.contentHash, fingerprint: String(i.fingerprint ?? ''), toolVersion: String(p.deckchekVersion ?? ''),
    signed: file,
  };
  return { entry };
}

/** Stored photo bytes -> ledger JPEG (metadata stripped, <= 1600 px, <= 2 MB) or {skip}. `reencode` handles old photos. */
export async function ledgerPhoto(bytes, { reencode } = {}) {
  if (!(bytes instanceof Uint8Array) || !bytes.length) return { skip: 'the photo could not be read' };
  const attempt = b => { const out = stripJpegMetadata(b); const info = validateJpeg(out); return { bytes: out, ...info }; };
  try { return attempt(bytes); } catch (first) {
    if (typeof reencode !== 'function') return { skip: `the photo is not usable (${first.message})` };
    try { return attempt(await reencode(bytes)); } catch (e) { return { skip: `the photo could not be converted (${e.message})` }; }
  }
}

/**
 * Builds the ledger. -> {ledger, jsonText, html, files, summary, skipped:[{item, what, reason}], photoBytes, singleFileOk}
 * Throws LedgerError('empty') with nothing selected, ('single_file_too_large') in single-file mode over the limit.
 */
export async function buildLedger(state, selection, privacy, { revision = 1, generatedAt = new Date().toISOString(), mode = 'folder', reencode } = {}) {
  const rules = normalizeRules(privacy);
  const ids = [...new Set(arr(selection?.items).filter(id => typeof id === 'string'))];
  const assets = ids.map(id => arr(state?.assets).find(a => a?.id === id)).filter(Boolean).filter(a => rules.items[a.id]?.include !== false);
  if (!assets.length) throw new LedgerError('empty', 'Pick at least one item for the ledger.');
  if (assets.length > LIMITS.maxItems) throw new LedgerError('too_many', `A ledger holds at most ${LIMITS.maxItems} items.`);
  const skipped = [];
  const photoFiles = new Map(); // itemId -> [{path, bytes}]
  const items = [];
  for (const asset of assets) {
    const id = ledgerItemId(asset.id);
    const { fields } = effectiveRules(rules, asset.id);
    const base = applyPrivacy({ ...productInfo(state, asset), assetId: asset.id, nickname: asset.nickname, serialNumber: asset.serialNumber, purchaseDate: asset.purchaseDate,
      condition: asset.condition, firmware: asset.firmware, notes: asset.notes, publicNotes: asset.publicNotes }, rules);
    const item = { id, ...base, photos: [], service: [], certificates: [] };
    const title = itemTitle(item);
    if (fields.photos) {
      const list = arr(state?.photos?.[asset.id]).slice(0, LIMITS.maxPhotosPerItem);
      const files = [];
      for (const ph of list) {
        const p = await ledgerPhoto(ph?.bytes, { reencode });
        if (p.skip) { skipped.push({ item: title, what: 'photo', reason: p.skip }); continue; }
        const n = files.length + 1;
        const altOf = t => scrubText(t, 200).split(PATH_PLACEHOLDER).join(' ').replace(/\s+/g, ' ').trim();
        const alt = altOf(ph?.altText) || altOf(ph?.caption);
        const path = `assets/${id}/p${n}.jpg`;
        item.photos.push({ path, alt: alt || `${title}, photo ${n}`, altGenerated: !alt, sha256: await sha256Hex(p.bytes), width: p.width, height: p.height });
        files.push({ path, bytes: p.bytes });
      }
      if (files.length) photoFiles.set(id, files);
    }
    if (fields.service) item.service = serviceEntries(state?.service?.[asset.id], fields.serviceNotes);
    if (fields.certificates) {
      for (const row of arr(state?.certificates?.[asset.id]).slice(0, LIMITS.maxCertificatesPerItem)) {
        const c = await certificateEntry(row);
        if (c.skip) skipped.push({ item: title, what: 'certificate', reason: c.skip });
        else if (!item.certificates.some(x => x.id === c.entry.id)) item.certificates.push(c.entry);
      }
      item.certificates.sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id));
    }
    for (const k of ['photos', 'service', 'certificates']) if (!item[k].length) delete item[k];
    items.push(item);
  }
  // Stable order for diffable re-exports (AC-7): manufacturer, model, then the opaque id.
  items.sort((a, b) => (a.manufacturer || '').localeCompare(b.manufacturer || '') || (a.model || '').localeCompare(b.model || '') || a.id.localeCompare(b.id));
  // altGenerated is UI-only information: keep it out of the published data.
  const altWarnings = items.flatMap(it => (it.photos || []).filter(p => p.altGenerated).map(() => itemTitle(it)));
  for (const it of items) for (const p of it.photos || []) delete p.altGenerated;

  const included = Object.entries(rules.fields).filter(([, on]) => on).map(([k]) => k).sort();
  const ledger = {
    format: LEDGER_FORMAT, version: LEDGER_VERSION, revision: Math.max(1, Math.trunc(Number(revision)) || 1),
    generatedAt: isoOrNull(generatedAt) || new Date(0).toISOString(),
    items,
    privacy: { preset: rules.preset, serialMode: rules.serialMode, included, excluded: ['price', 'location', 'venue', ...Object.entries(rules.fields).filter(([, on]) => !on).map(([k]) => k).sort()] },
    ledgerSha256: await ledgerItemsSha256(items),
  };
  if (rules.ownerName) ledger.owner = { displayName: rules.ownerName };
  const jsonText = stableJsonText(ledger);
  const photoBytes = [...photoFiles.values()].flat().reduce((n, f) => n + f.bytes.length, 0);
  const singleFileOk = Math.ceil(photoBytes / 3) * 4 <= SINGLE_FILE_MAX_BYTES;
  const summary = { ...privacySummary(ledger, rules), altGenerated: altWarnings.length, skipped: skipped.length };
  let html, files;
  if (mode === 'single') {
    if (!singleFileOk) throw new LedgerError('single_file_too_large', `The photos add up to ${(photoBytes / 1048576).toFixed(1)} MB; a single-file ledger embeds at most ${SINGLE_FILE_MAX_BYTES / 1048576} MB. Export a folder instead, or include fewer photos.`);
    const uris = new Map([...photoFiles.values()].flat().map(f => [f.path, `data:image/jpeg;base64,${bytesToBase64(f.bytes)}`]));
    html = renderLedgerHtml(ledger, { photoSrc: p => uris.get(p.path) });
    files = [{ relPath: 'index.html', text: html }];
  } else {
    html = renderLedgerHtml(ledger, { certLinks: true });
    files = [{ relPath: `${LEDGER_DIR}/index.html`, text: html }, { relPath: `${LEDGER_DIR}/ledger.json`, text: jsonText }];
    for (const list of photoFiles.values()) for (const f of list) files.push({ relPath: `${LEDGER_DIR}/${f.path}`, base64: bytesToBase64(f.bytes) });
    for (const it of items) for (const c of it.certificates || []) files.push({ relPath: `${LEDGER_DIR}/certificates/${c.id}.deckchek-cert.json`, text: `${JSON.stringify(c.signed, null, 2)}\n` });
  }
  return { ledger, jsonText, html, files, summary, skipped, photoBytes, singleFileOk, photoFiles };
}

/** In-app preview HTML: photos inline as data URIs, light or dark forced (spec §3 step 3). */
export function previewHtml(result, theme = 'light') {
  const uris = new Map([...result.photoFiles.values()].flat().map(f => [f.path, `data:image/jpeg;base64,${bytesToBase64(f.bytes)}`]));
  return renderLedgerHtml(result.ledger, { photoSrc: p => uris.get(p.path), theme });
}

/**
 * AC-7 helper: what changed between the previous export (ledger_export row) and this build. Field-level detail needs
 * the previous ledger.json, which DeckChek does not keep; the files themselves diff line by line (stableJsonText).
 */
export function compareWithPrevious(previous, ledger, selectionItems) {
  if (!previous) return { first: true, revision: ledger.revision, changed: true, added: selectionItems.length, removed: 0 };
  const before = new Set(arr(previous.selection?.items)), now = new Set(selectionItems);
  return {
    first: false, previousRevision: previous.revision, revision: ledger.revision, changed: previous.ledgerSha256 !== ledger.ledgerSha256,
    added: [...now].filter(id => !before.has(id)).length, removed: [...before].filter(id => !now.has(id)).length,
  };
}

