// FS-20 printable kind for the FS-03 PDF engine: the certificate body (identity, results, measurements with
// calibration state, photos, full content hash, fingerprint in large type, QR `deckchek:cert:v1:<sha256-hex>`)
// and the disclaimer. The signed JSON is not embedded in the PDF (WebView2 PrintToPdf cannot attach files):
// it travels as the `.deckchek-cert.json` sidecar. data = {file, draft?}.

import { registerPrintableKind, getPrintableKind } from '../report-pdf.js';
import { renderCertificateBody, CERT_CSS, VERDICT_LABEL } from '../certificate.js';

export const CERTIFICATE_KIND = 'certificate';

const title = d => `${d?.draft ? 'DRAFT ' : ''}Used-gear certificate — ${d?.file?.payload?.unit?.model || 'unit'}`;

/** Registers the kind once (idempotent; safe from several screens). */
export function registerCertificateKind() {
  if (getPrintableKind(CERTIFICATE_KIND)) return;
  registerPrintableKind(CERTIFICATE_KIND, {
    fileKind: 'Certificate',
    title,
    device: d => `${d?.file?.payload?.unit?.model || ''} ${d?.file?.payload?.unit?.serial || ''}`.trim(),
    summary: d => [
      ['Verdict', d?.draft ? VERDICT_LABEL.draft : VERDICT_LABEL[d?.file?.payload?.verdict] || null],
      ['Valid until', String(d?.file?.payload?.validUntil || '').slice(0, 10) || null],
      ['Content hash', d?.draft ? null : d?.file?.integrity?.contentHash || null],
    ],
    build: (d = {}) => `<!doctype html><html><head><style>${CERT_CSS}</style></head><body>${renderCertificateBody(d.file, { draft: !!d.draft })}</body></html>`,
  });
}

registerCertificateKind();
