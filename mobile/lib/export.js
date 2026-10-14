// Export (FS-30 §5): turns a stored result into the v1 text that a file, the share sheet and the QR codes carry.
// The format, hash and QR framing are the desktop's own code (vendor/phone-run.js), so what is written here is
// exactly what DeckChek reads.
import { buildExport, serializeExport, toQrFrames as frames, FILE_EXTENSION, QR_SINGLE_MAX_BYTES } from '../vendor/phone-run.js';

export const APP_ID = 'mobile/0.1.0';
export { FILE_EXTENSION, QR_SINGLE_MAX_BYTES };

/** The device block of an export. `redactUserAgent` drops the user-agent string (it can identify the phone model). */
export function deviceInfo({ userAgent = '', sampleRate = null, micFlags = {} } = {}, { redactUserAgent = false } = {}) {
  return { userAgent: redactUserAgent ? null : userAgent, sampleRate, micFlags };
}

/**
 * `run` is a stored result: {createdAt, measurements, device, assetHint, notes}. Returns the JSON text of the export
 * (string), hashed. Throws if the measurements hold something the format refuses.
 */
export function exportRun(run, { redactUserAgent = false } = {}) {
  return serializeExport(buildExport({
    createdAt: run.createdAt, app: APP_ID, device: deviceInfo(run.device, { redactUserAgent }),
    assetHint: run.assetHint || {}, measurements: run.measurements || [], notes: run.notes || '',
  }));
}

/** QR payloads for the export text: one plain-JSON frame when it fits, else numbered frames. */
export const toQrFrames = json => frames(json);

export function fileName(run) {
  const stamp = String(run.createdAt || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
  return `deckchek-${run.kind || 'result'}-${stamp}${FILE_EXTENSION}`;
}
