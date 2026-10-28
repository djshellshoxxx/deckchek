// FS-20 bridge to the Rust certificate/signing commands, plus the export flow (JSON sidecar + PDF, HTML
// fallback on PDF failure, AC-8). Invoke is injectable for tests and smoke mocks. The private key never
// crosses this boundary: `sign` sends the payload and receives {contentHash, signatureB64, publicKeyB64, fingerprint}.

import { certificateBaseName, certificateFileText, renderCertificateHtml } from './certificate.js';

const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? null;

export const PDF_RENDER_TIMEOUT_MS = 25000;

export function createCertificateApi({ invoke = nativeInvoke() } = {}) {
  const call = (cmd, args) => (invoke ? invoke(cmd, args) : Promise.reject(new Error('Certificates need the DeckChek desktop app.')));
  return {
    native: !!invoke,
    identity: () => call('signing_get_identity'),
    newIdentity: () => call('signing_create_identity', { confirm: true }),
    sign: payload => call('certificate_sign', { payload }),
    verify: json => call('certificate_verify', { json }),
    extract: path => call('certificate_extract_json', { path }),
    store: record => call('certificate_store', { record }),
    list: assetId => call('certificate_list', { assetId: assetId ?? null }),
    get: id => call('certificate_get', { id }),
    writeFolder: (dir, files, allowedExts) => call('userfiles_write_folder', { dir, files, allowedExts }),
    renderPdf: (html, destPath) => call('pdf_render', { html, destPath, opts: {} }),
  };
}

/** Joins a dialog-chosen folder and a file name with the folder's own separator. */
export function joinPath(dir, name) {
  const d = String(dir ?? '');
  const sep = d.includes('\\') && !d.includes('/') ? '\\' : '/';
  return `${d.replace(/[\\/]+$/, '')}${sep}${name}`;
}

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(Object.assign(new Error('PDF creation timed out.'), { code: 'timeout' })), ms);
  promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
});

/**
 * Writes `<base>.deckchek-cert.json` and `<base>.pdf` into `dir`. When the PDF fails, writes `<base>.html`
 * (the same signed JSON embedded, so its content hash is identical: AC-8) and reports the PDF error.
 * -> {jsonPath, pdfPath|null, htmlPath|null, pdfError|null}
 */
export async function exportCertificateFiles({ api, dir, file, pdfHtml, timeoutMs = PDF_RENDER_TIMEOUT_MS }) {
  const base = certificateBaseName(file.payload);
  const jsonName = `${base}.deckchek-cert.json`;
  await api.writeFolder(dir, [{ relPath: jsonName, text: certificateFileText(file) }], ['json']);
  const out = { jsonPath: joinPath(dir, jsonName), pdfPath: null, htmlPath: null, pdfError: null };
  try {
    if (!pdfHtml) throw Object.assign(new Error('PDF export is off.'), { code: 'disabled' });
    const r = await withTimeout(Promise.resolve(api.renderPdf(pdfHtml, joinPath(dir, `${base}.pdf`))), timeoutMs);
    out.pdfPath = r?.path ?? joinPath(dir, `${base}.pdf`);
  } catch (error) {
    out.pdfError = { code: error?.code || 'unknown', message: String(error?.message || error || 'PDF export failed.') };
    await api.writeFolder(dir, [{ relPath: `${base}.html`, text: renderCertificateHtml(file) }], ['html']);
    out.htmlPath = joinPath(dir, `${base}.html`);
  }
  return out;
}
