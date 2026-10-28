// FS-22 job sheet as an FS-03 printable kind ("jobSheet", file kind "JobSheet"). No DOM: report-pdf.js turns the
// HTML into a PDF through WebView2 or the print dialog. The body comes from service.js renderJobSheetHtml, which escapes
// every free-text value with ctx.esc and prints customer details only when "Include customer details" was ticked.

import { renderJobSheetHtml, statusLabel } from '../service.js';

export const JOB_SHEET_KIND = 'jobSheet';
const SHEET_CSS = '.dc-kv th{width:30%}.dc-headline{padding-left:18px}.dc-signatures{margin-top:28px;break-inside:avoid}.dc-signatures p{margin:22px 0}.dc-disclaimer{margin-top:12px}';

export const jobSheetPrintable = Object.freeze({
  fileKind: 'JobSheet',
  title: d => `Job sheet ${d?.detail?.job?.jobNumber || ''}`.trim(),
  // The unit name only (never the customer): it is also used for the suggested file name.
  device: d => d?.detail?.asset?.nickname || '',
  summary: d => [['Job', d?.detail?.job?.jobNumber || null], ['Status', d?.detail?.job ? statusLabel(d.detail.job.status) : null]],
  build: (d = {}, ctx) => `<!doctype html><html><head><style>${SHEET_CSS}</style></head><body>${renderJobSheetHtml(d.detail, d.comparison, d.options || {}, ctx.esc)}</body></html>`,
});

/** Registers the kind once (idempotent). Resolves to the report-pdf module. */
export async function ensureJobSheetKind() {
  const mod = await import('../report-pdf.js');
  if (!mod.getPrintableKind(JOB_SHEET_KIND)) mod.registerPrintableKind(JOB_SHEET_KIND, jobSheetPrintable);
  return mod;
}
