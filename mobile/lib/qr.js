// QR rendering for the export (FS-30 §4): the one shared generator (vendor/qr.js, MIT) draws an SVG; the page shows
// it as an <img> with a data: URI, which the CSP allows (img-src 'self' data: blob:) and which never runs script.
import { qrSvg } from '../vendor/qr.js';

export const svgToDataUri = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** [{uri, label}] one per frame, labelled "QR 2 of 5" so the person can scan them in order. */
export function qrImages(frames) {
  return frames.map((text, i) => ({
    uri: svgToDataUri(qrSvg(text, { ecc: 'L', label: frames.length > 1 ? `QR code ${i + 1} of ${frames.length}` : 'QR code of the result' })),
    label: frames.length > 1 ? `QR ${i + 1} of ${frames.length}` : 'QR',
    text,
  }));
}
