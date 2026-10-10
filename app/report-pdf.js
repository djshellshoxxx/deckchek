// FS-03 PDF reports. Builds a print-optimised HTML document for any registered report kind
// and exports it: WebView2 PrintToPdf through the Rust `pdf_render` command when the desktop
// backend supports it, otherwise (browser mode, non-Windows, old WebView2 runtime, backend
// failure) the AC-6 fallback — a hidden same-origin `<iframe srcdoc>` and its `print()`.
// The choice is made at runtime per call; `unsupported` is remembered for the session.
// DOM-free except for printViaIframe/exportPdf, so the builders are unit-testable in Node.

import { buildHtmlReport } from './core.js';
import { buildSystemReportHtml, summarizeFindings } from './system-check.js';
import { buildDeviceReportHtml } from './devices/dispatch.js';

/** FS-03 AC-7: the desktop render is cancelled after this long (Rust enforces the same 20 s). */
export const PDF_TIMEOUT_MS = 20000;
/** Grace on top of the Rust deadline so its own `timeout` error normally arrives first. */
const CLIENT_GRACE_MS = 1500;
/** Row caps keep reports far below the 200-page limit of FS-03 §7. */
export const MAX_TABLE_ROWS = 2000;
export const MAX_CHART_POINTS = 2000;
export const PRINT_CSS_URL = 'report-print.css';
/** report-print.css text once loadPrintCss() fetched it; inlined by default from then on. */
let printCss = null;

/** Regions that use US Letter by default; everything else gets A4. */
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'CR', 'GT', 'PA', 'SV', 'DO', 'PR', 'NI', 'BZ']);
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
/** Rust `pdf_render` error codes after which the print-dialog fallback is used automatically. */
const FALLBACK_CODES = new Set(['unsupported', 'webview', 'print_host', 'invalid_output']);
/** Errors worth a Retry (AC-7); path/option errors are not. */
const RETRYABLE_CODES = new Set(['timeout', 'io', 'busy']);

const tauri = () => globalThis.window?.__TAURI__ ?? globalThis.__TAURI__ ?? null;

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** A CSS string literal safe inside a `<style>` element: anything but plain text is hex-escaped. */
const CSS_SAFE = /^[A-Za-z0-9 .,:;_+()#@&!?=-]$/;
export function cssString(v, max = 120) {
  const chars = Array.from(String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ')).slice(0, max);
  return `"${chars.map(c => {
    const cp = c.codePointAt(0);
    return CSS_SAFE.test(c) || (cp >= 0xa0 && !(cp >= 0xd800 && cp <= 0xdfff)) ? c : `\\${cp.toString(16)} `;
  }).join('')}"`;
}

const pad = n => String(n).padStart(2, '0');
const validDate = d => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date());
/** Local `YYYY-MM-DD HH:mm`. */
export function formatStamp(date) {
  const d = validDate(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------- options / settings

export function defaultPaper(locale = globalThis.navigator?.language) {
  let region = '';
  try {
    const l = new Intl.Locale(String(locale || 'en-GB'));
    region = l.region || l.maximize().region || '';
  } catch {
    region = (/[-_]([A-Za-z]{2})\b/.exec(String(locale || '')) || [])[1] || '';
  }
  return LETTER_REGIONS.has(region.toUpperCase()) ? 'Letter' : 'A4';
}

/** Normalises user options; unknown values fall back to safe defaults. */
export function normalizePdfOptions(o = {}, locale) {
  const p = String(o.paper ?? '').toLowerCase();
  const scale = Number(o.scale);
  return {
    paper: p === 'a4' ? 'A4' : p === 'letter' ? 'Letter' : defaultPaper(locale),
    landscape: o.landscape === true || o.orientation === 'landscape',
    scale: Number.isFinite(scale) && scale >= 0.1 && scale <= 2 ? scale : 1,
    includeRaw: o.includeRaw === true,
    redactSerials: o.redactSerials === true,
  };
}

/** FS-03 §5 settings (`pdf.paper`, `pdf.includeRaw`, `pdf.redactSerials` in deckchek.ui.v1). */
export const PDF_SETTING_DEFAULTS = Object.freeze({ paper: null, includeRaw: false, redactSerials: false });
export function readPdfSettings(settings = {}, locale) {
  const nested = settings && typeof settings.pdf === 'object' && settings.pdf ? settings.pdf : {};
  const get = k => nested[k] ?? settings?.[`pdf.${k}`];
  return normalizePdfOptions({ paper: get('paper'), includeRaw: get('includeRaw'), redactSerials: get('redactSerials') }, locale);
}

// ---------------------------------------------------------------- file names

/** Device slug for file names: ASCII lowercase, non-alphanumerics -> '-', <= 40 chars (FS-03 §5). */
export function deviceSlug(device) {
  let s = String(device ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  if (!s) s = 'unknown';
  if (RESERVED.test(s)) s += '_';
  return s;
}

const pascal = k => String(k).replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, __, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '') || 'Report';

/** `DeckChek_<Kind>_<Device>_<YYYYMMDD-HHmm>.pdf`. `kind` is a registered kind or a file kind. */
export function suggestPdfName(kind, device, date = new Date()) {
  const def = KINDS.get(kind);
  const fileKind = def ? def.fileKind : pascal(kind);
  const d = validDate(date);
  return `DeckChek_${fileKind}_${deviceSlug(device)}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.pdf`;
}

// ---------------------------------------------------------------- charts (vector SVG, AC-3)

/** "Nice" axis ticks covering [min, max] with about `count` steps. */
export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('non-finite axis range');
  if (min > max) [min, max] = [max, min];
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
  const raw = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo, i = 0; v <= hi + step * 1e-9 && i < 1000; v = lo + (++i) * step) ticks.push(Number(v.toPrecision(12)));
  return { min: lo, max: hi, step, ticks };
}

/** Keeps first/last points and evenly samples the rest down to `max` points. */
export function decimate(points, max = MAX_CHART_POINTS) {
  if (points.length <= max) return points;
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * (points.length - 1) / (max - 1))]);
  return out;
}

const DASHES = ['', '6 3', '2 2', '8 3 2 3'];
const STROKES = ['#1d4ed8', '#b45309', '#047857', '#7c3aed'];
const fmtTick = v => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(1) : String(Number(v.toPrecision(6))));

/**
 * Line chart as inline SVG with real `<text>` (selectable in the PDF). Series are told apart by
 * dash pattern as well as colour (greyscale-safe). Throws on charts with no finite points.
 * chart = {title, xLabel, yLabel, series:[{label, points:[[x,y],…]}]}
 */
export function renderChartSvg(chart) {
  const series = (Array.isArray(chart?.series) ? chart.series : []).slice(0, DASHES.length).map(s => ({
    label: String(s?.label ?? ''),
    points: decimate((Array.isArray(s?.points) ? s.points : []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))),
  })).filter(s => s.points.length);
  if (!series.length) throw new Error('no data');
  const all = series.flatMap(s => s.points);
  const xs = niceTicks(Math.min(...all.map(p => p[0])), Math.max(...all.map(p => p[0])), 6);
  const ys = niceTicks(Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[1])), 4);
  const W = 600, H = 220, L = 56, R = 12, T = 12, B = 36;
  const sx = x => L + (x - xs.min) / (xs.max - xs.min) * (W - L - R);
  const sy = y => H - B - (y - ys.min) / (ys.max - ys.min) * (H - T - B);
  const n = v => v.toFixed(1);
  const grid = ys.ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${n(sy(v))}" y2="${n(sy(v))}" stroke="#c4cad2" stroke-width="0.9"/><text x="${L - 4}" y="${n(sy(v) + 3.5)}" text-anchor="end" font-size="10">${esc(fmtTick(v))}</text>`).join('')
    + xs.ticks.map(v => `<text x="${n(sx(v))}" y="${H - B + 14}" text-anchor="middle" font-size="10">${esc(fmtTick(v))}</text>`).join('');
  const lines = series.map((s, i) => `<polyline fill="none" stroke="${STROKES[i]}" stroke-width="1.6"${DASHES[i] ? ` stroke-dasharray="${DASHES[i]}"` : ''} points="${s.points.map(p => `${n(sx(p[0]))},${n(sy(p[1]))}`).join(' ')}"/>`).join('');
  const legend = series.length > 1 ? series.map((s, i) => `<g transform="translate(${L + 8 + i * 140},${T + 4})"><line x1="0" x2="18" y1="0" y2="0" stroke="${STROKES[i]}" stroke-width="1.6"${DASHES[i] ? ` stroke-dasharray="${DASHES[i]}"` : ''}/><text x="22" y="3.5" font-size="10">${esc(s.label)}</text></g>`).join('') : '';
  const axes = `<line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="#14171c" stroke-width="1"/><line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#14171c" stroke-width="1"/>`;
  const labels = `${chart.xLabel ? `<text x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle" font-size="10">${esc(chart.xLabel)}</text>` : ''}${chart.yLabel ? `<text x="12" y="${(T + H - B) / 2}" text-anchor="middle" font-size="10" transform="rotate(-90 12 ${(T + H - B) / 2})">${esc(chart.yLabel)}</text>` : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(chart.title || 'Chart')}" font-family="Segoe UI, system-ui, sans-serif" fill="#14171c">${grid}${axes}${lines}${legend}${labels}</svg>`;
}

function chartsHtml(charts, warnings) {
  if (!Array.isArray(charts) || !charts.length) return '';
  const figs = charts.map(c => {
    const title = esc(c?.title || 'Chart');
    try {
      return `<figure class="dc-chart"><figcaption>${title}</figcaption>${renderChartSvg(c)}</figure>`;
    } catch {
      warnings.push({ code: 'chart', message: `Chart unavailable: ${String(c?.title || 'Chart')}` });
      return `<div class="dc-chart-missing" role="img" aria-label="Chart unavailable">Chart unavailable: ${title}</div>`;
    }
  }).join('');
  return `<section class="dc-charts"><h2>Charts</h2>${figs}</section>`;
}

// ---------------------------------------------------------------- severity icons (AC-5)

const SEV_ICON = {
  ERROR: '<circle cx="5" cy="5" r="4.2" fill="#B3261E"/><path d="M3.2 3.2l3.6 3.6M6.8 3.2L3.2 6.8" stroke="#fff" stroke-width="1.2"/>',
  WARNING: '<path d="M5 .8L9.4 9H.6z" fill="#8A5A00"/><path d="M5 3.6v2.6" stroke="#fff" stroke-width="1.1"/><circle cx="5" cy="7.6" r=".6" fill="#fff"/>',
  INFO: '<rect x=".8" y=".8" width="8.4" height="8.4" rx="1.5" fill="#0B5FCC"/><path d="M5 4.4v3.4" stroke="#fff" stroke-width="1.2"/><circle cx="5" cy="2.9" r=".7" fill="#fff"/>',
  OK: '<circle cx="5" cy="5" r="4.2" fill="#0B7A55"/><path d="M2.9 5.1l1.5 1.5 2.8-3" fill="none" stroke="#fff" stroke-width="1.2"/>',
};
/** Inline SVG severity icon (distinct shape per level, so colour is never the only signal). */
export function severityIcon(label) {
  const key = String(label || '').toUpperCase();
  return SEV_ICON[key] ? `<svg class="dc-sev-icon" viewBox="0 0 10 10" aria-hidden="true">${SEV_ICON[key]}</svg>` : '';
}
/** Adds an icon before every `<span class="sev">LEVEL</span>` emitted by buildSystemReportHtml. */
export function addSeverityIcons(html) {
  return String(html).replace(/(<span class="sev"[^>]*>)(ERROR|WARNING|INFO|OK)(<\/span>)/g, (_, open, lvl, close) => `${severityIcon(lvl)}${open}${lvl}${close}`);
}

// ---------------------------------------------------------------- registry

const KINDS = new Map();

/**
 * Registers a printable report kind (FS-03 §4). Later features add theirs from their own files:
 *   registerPrintableKind('certificate', { title: d => `Certificate ${d.id}`, fileKind: 'Certificate',
 *     device: d => d.model, build: (data, ctx) => '<h2>…</h2>' })
 * def.title: string | (data) => string; def.build(data, ctx) -> HTML document or fragment (every user
 * string escaped with ctx.esc); optional def.device(data), def.summary(data, ctx) -> [[label, value]],
 * def.charts(data) -> chart[]; def.fileKind defaults to PascalCase(kind). Returns an unregister function.
 */
export function registerPrintableKind(kind, def, { replace = false } = {}) {
  if (typeof kind !== 'string' || !/^[a-z][A-Za-z0-9]{0,31}$/.test(kind)) throw new Error(`Invalid printable kind "${kind}".`);
  if (!def || typeof def.build !== 'function') throw new Error(`Printable kind "${kind}" needs a build(data, ctx) function.`);
  if (typeof def.title !== 'string' && typeof def.title !== 'function') throw new Error(`Printable kind "${kind}" needs a title.`);
  const fileKind = def.fileKind ?? pascal(kind);
  if (!/^[A-Z][A-Za-z0-9]{0,23}$/.test(fileKind)) throw new Error(`Invalid file kind "${fileKind}".`);
  if (KINDS.has(kind) && !replace) throw new Error(`Printable kind "${kind}" is already registered.`);
  const entry = Object.freeze({ ...def, kind, fileKind });
  KINDS.set(kind, entry);
  return () => { if (KINDS.get(kind) === entry) KINDS.delete(kind); };
}
export const printableKinds = () => [...KINDS.keys()];
export const getPrintableKind = kind => KINDS.get(kind) ?? null;

// ---------------------------------------------------------------- composition

/** Splits a builder's output into its head `<style>` blocks and body markup; drops scripts. */
export function extractReportParts(html) {
  const src = String(html ?? '');
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)(?:<\/body>|$)/i.exec(src);
  const head = bodyMatch ? src.slice(0, bodyMatch.index) : '';
  const styles = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
  let body = bodyMatch ? bodyMatch[1] : src.replace(/<!doctype[^>]*>|<\/?html\b[^>]*>|<head\b[^>]*>[\s\S]*?<\/head>/gi, '');
  body = body.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*>/gi, '');
  return { styles, body: body.trim() };
}

function pageCss({ paper, landscape }, header, device, footer) {
  return `@page { size: ${paper === 'Letter' ? 'letter' : 'A4'} ${landscape ? 'landscape' : 'portrait'}; margin: 18mm 15mm 20mm;
  @top-left { content: ${cssString(header)}; font: 8pt "Segoe UI", system-ui, sans-serif; color: #4a5260; }
  @top-right { content: ${cssString(device)}; font: 8pt "Segoe UI", system-ui, sans-serif; color: #4a5260; }
  @bottom-left { content: ${cssString(footer)}; font: 8pt "Segoe UI", system-ui, sans-serif; color: #4a5260; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt "Segoe UI", system-ui, sans-serif; color: #4a5260; } }`;
}

/** Bounded table rows: keeps `max` rows and reports how many were dropped. */
export function capRows(rows, max = MAX_TABLE_ROWS) {
  const list = Array.isArray(rows) ? rows : [];
  return { rows: list.slice(0, max), omitted: Math.max(0, list.length - max) };
}

/**
 * Builds the printable document and reports partial problems.
 * @returns {{html:string, title:string, device:string, fileName:string, warnings:{code,message}[], options:object}}
 */
export function composePrintable(kind, data = {}, opts = {}) {
  const def = KINDS.get(kind);
  if (!def) throw new Error(`Unknown printable kind "${kind}".`);
  const options = normalizePdfOptions(opts, opts.locale);
  const now = validDate(opts.now instanceof Date ? opts.now : opts.now ? new Date(opts.now) : new Date());
  const appVersion = String(opts.appVersion ?? '').slice(0, 40);
  const warnings = [];
  const ctx = { options, esc, renderChartSvg, capRows, now, appVersion, warnings };
  const title = String((typeof def.title === 'function' ? def.title(data, ctx) : def.title) || 'DeckChek report');
  const device = String((def.device ? def.device(data, ctx) : data?.device) ?? '');
  const { styles, body } = extractReportParts(def.build(data, ctx));
  const stamp = formatStamp(now);
  const summary = [['Device', device || '—'], ['Generated', stamp], ...(def.summary ? def.summary(data, ctx) || [] : [])]
    .filter(r => Array.isArray(r) && r[1] != null && r[1] !== '')
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  const charts = chartsHtml(def.charts ? def.charts(data, ctx) : data?.charts, warnings);
  const version = appVersion ? `DeckChek ${appVersion}` : 'DeckChek';
  // opts.css: string = inline it; null = force the <link>; undefined = the cached copy if loaded.
  const rawCss = opts.css !== undefined ? opts.css : printCss;
  const css = rawCss == null ? null : String(rawCss).replace(/<\/style/gi, '<\\/style');
  const html = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="color-scheme" content="light">
<meta name="generator" content="${esc(version)}"><title>${esc(title)}</title>
${styles.map(s => `<style data-dc="report">${s}</style>`).join('\n')}
${css != null ? `<style data-dc="print">${css}</style>` : `<link rel="stylesheet" href="${PRINT_CSS_URL}" data-dc="print">`}
<style data-dc="page">${pageCss(options, `${version} · ${title}`, device, `${version} · Generated ${stamp}`)}</style>
</head><body class="dc-print dc-kind-${esc(kind)}">
<header class="dc-summary"><h1>${esc(title)}</h1><dl>${summary}</dl></header>
${charts}
<main class="dc-report">${body.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>/i, '')}</main>
<footer class="dc-end">Created by ${esc(version)} on ${esc(stamp)}. DeckChek measurements are evidence records; confirm findings with repeatable tests.</footer>
</body></html>`;
  return { html, title, device, fileName: suggestPdfName(kind, device, now), warnings, options };
}

/** FS-03 §4 API: the printable HTML string for `kind`. */
export function buildPrintableReport(kind, data, opts) {
  return composePrintable(kind, data, opts).html;
}

// ---------------------------------------------------------------- built-in kinds

const redact = v => (v ? '[redacted]' : v);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? String(v) : v == null ? '' : String(v));

function rawTable(measurements) {
  const { rows, omitted } = capRows(measurements);
  if (!rows.length) return '';
  return `<h2>Raw measurements</h2><table><thead><tr><th>Metric ID</th><th>Value</th><th>Unit</th><th>Uncertainty (k=2)</th><th>Origin</th></tr></thead><tbody>${rows.map(m => `<tr><td>${esc(m.metricId)}</td><td class="dc-num">${esc(num(m.value))}</td><td>${esc(m.unit)}</td><td class="dc-num">${esc(num(m.uncertainty))}</td><td>${esc(m.origin || 'measured')}</td></tr>`).join('')}</tbody></table>${omitted ? `<p class="dc-note">${omitted} more rows not shown.</p>` : ''}`;
}

/** Run report: the same arguments as core.js buildHtmlReport, plus optional score/verdict/charts. */
registerPrintableKind('run', {
  fileKind: 'Run',
  title: d => d?.title || 'DeckChek run report',
  device: d => d?.device || '',
  summary: d => [
    ['Created', d?.createdAt ? formatStamp(new Date(d.createdAt)) : null],
    ['Score', Number.isFinite(d?.score) ? `${Math.round(d.score)}${d.uncertainty != null ? ` ± ${d.uncertainty}` : ''}` : null],
    ['Verdict', d?.verdict || null],
    ['Setup', d?.setup || null],
  ],
  build: (d = {}, ctx) => {
    const { rows, omitted } = capRows(d.measurements);
    const html = buildHtmlReport({ ...d, measurements: rows });
    const extra = `${omitted ? `<p class="dc-note">${omitted} more measurements not shown.</p>` : ''}${ctx.options.includeRaw ? rawTable(d.measurements) : ''}`;
    return extra ? html.replace(/<\/body>/i, `${extra}</body>`) : html;
  },
});

/** Device report: the same arguments as devices/dispatch.js buildDeviceReportHtml. */
registerPrintableKind('device', {
  fileKind: 'Device',
  title: d => `Device report — ${`${d?.profile?.manufacturer || ''} ${d?.profile?.model || ''}`.trim() || 'unknown device'}`,
  device: d => d?.asset?.nickname || `${d?.profile?.manufacturer || ''} ${d?.profile?.model || ''}`.trim(),
  build: (d = {}, ctx) => {
    const asset = d.asset && ctx.options.redactSerials ? { ...d.asset, serialNumber: redact(d.asset.serialNumber) } : d.asset;
    return buildDeviceReportHtml({ ...d, asset, appVersion: d.appVersion ?? ctx.appVersion, results: capRows(d.results).rows });
  },
});

/** System Health report: the same arguments as system-check.js buildSystemReportHtml. */
registerPrintableKind('systemHealth', {
  fileKind: 'SystemHealth',
  title: 'DeckChek System Health report',
  device: d => d?.computerName || 'This computer',
  summary: d => {
    const s = d?.summary || summarizeFindings(d?.findings || []);
    return [['Verdict', s.headline], ['Findings', `${s.counts.error} error, ${s.counts.warning} warning, ${s.counts.info} info, ${s.counts.ok} OK`]];
  },
  build: (d = {}) => {
    const drivers = d.drivers && Array.isArray(d.drivers.drivers) ? { ...d.drivers, drivers: capRows(d.drivers.drivers).rows } : d.drivers;
    return addSeverityIcons(buildSystemReportHtml({ ...d, drivers }));
  },
});

// ---------------------------------------------------------------- export

/** Fetches report-print.css once so it can be inlined (falls back to a `<link>` when unavailable). */
export async function loadPrintCss({ fetchImpl = globalThis.fetch } = {}) {
  if (printCss != null) return printCss;
  try {
    const res = await fetchImpl(new URL(`./${PRINT_CSS_URL}`, import.meta.url));
    if (res.ok) printCss = await res.text();
  } catch { /* link fallback */ }
  return printCss;
}

export class PdfExportError extends Error {
  constructor({ code = 'unknown', message = 'PDF export failed.' } = {}, extra = {}) {
    super(message);
    this.name = 'PdfExportError';
    this.code = code;
    this.retryable = RETRYABLE_CODES.has(code);
    Object.assign(this, extra);
  }
}

/** Normalises whatever `invoke` rejected with into {code, message, unsupported}. */
export function normalizePdfError(e) {
  if (e && typeof e === 'object' && typeof e.code === 'string') return { code: e.code, message: String(e.message || e.code), unsupported: e.unsupported === true || e.code === 'unsupported' };
  return { code: 'unknown', message: String(e?.message ?? e ?? 'PDF export failed.'), unsupported: false };
}

let nativeUnsupported = false;
let inFlight = false;
/** Test hook: forget the session's "backend unsupported" memory. */
export function resetPdfBackendState() { nativeUnsupported = false; inFlight = false; }

/** Desktop PrintToPdf is only attempted on Windows with the dialog + invoke APIs present. */
export function nativePdfAvailable(api = tauri(), userAgent = globalThis.navigator?.userAgent ?? '') {
  return !nativeUnsupported && typeof api?.core?.invoke === 'function' && typeof api?.dialog?.save === 'function' && /Windows/i.test(userAgent);
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject({ code: 'timeout', message: `Creating the PDF took longer than ${Math.round(ms / 1000)} s.` }), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * AC-6 fallback: prints `html` from a hidden sandboxed same-origin `<iframe srcdoc>` (no
 * window.open). Resolves after `print()` returns; the frame is removed and focus restored.
 */
export function printViaIframe(html, { doc = globalThis.document, loadTimeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const prevFocus = doc.activeElement;
    const frame = doc.createElement('iframe');
    // No allow-scripts: nothing in the report can run. allow-modals is required for print().
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.title = 'DeckChek print preview';
    frame.className = 'dc-print-frame';
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;opacity:0;pointer-events:none';
    const cleanup = () => {
      clearTimeout(timer);
      setTimeout(() => frame.remove(), 0);
      if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus(); } catch { /* ignore */ } }
    };
    const timer = setTimeout(() => { cleanup(); reject(new PdfExportError({ code: 'print_fallback', message: 'The print preview did not load.' })); }, loadTimeoutMs);
    frame.addEventListener('load', () => {
      try {
        const w = frame.contentWindow;
        if (!w) throw new Error('no print window');
        w.focus();
        w.print();
        cleanup();
        resolve({ fallback: true });
      } catch (e) {
        cleanup();
        reject(new PdfExportError({ code: 'print_fallback', message: `Couldn't open the print dialog: ${e?.message || e}` }));
      }
    }, { once: true });
    frame.srcdoc = html;
    doc.body.appendChild(frame);
  });
}

/**
 * FS-03 §4 `exportPdf(kind, data, opts)`.
 * Resolves to one of:
 *   {ok:true, method:'webview2', path, bytes, pages, fileName, warnings}
 *   {fallback:true, method:'print', reason:'unsupported'|'error', error?, warnings}  (print dialog shown)
 *   {cancelled:true}
 * Rejects with PdfExportError for timeouts (AC-7, `retryable`), invalid paths/options and a busy
 * exporter; the error carries `html` so the UI can offer "Export HTML instead" or the print dialog.
 */
export async function exportPdf(kind, data, opts = {}, deps = {}) {
  const api = 'api' in deps ? deps.api : tauri();
  const doc = deps.doc ?? globalThis.document;
  const timeoutMs = deps.timeoutMs ?? PDF_TIMEOUT_MS + CLIENT_GRACE_MS;
  if (inFlight) throw new PdfExportError({ code: 'busy', message: 'A PDF is already being created.' });
  inFlight = true;
  try {
    let appVersion = opts.appVersion;
    if (appVersion == null) { try { appVersion = (await api?.app?.getVersion?.()) ?? ''; } catch { appVersion = ''; } }
    const css = 'css' in opts ? opts.css : await loadPrintCss(deps);
    const built = composePrintable(kind, data, { ...opts, appVersion, css, now: opts.now ?? deps.now?.() });
    const fallback = async (reason, error) => {
      await (deps.printFallback ?? printViaIframe)(built.html, { doc });
      return { fallback: true, method: 'print', reason, ...(error ? { error } : {}), fileName: built.fileName, warnings: built.warnings };
    };
    if (!nativePdfAvailable(api, deps.userAgent ?? globalThis.navigator?.userAgent ?? '')) return await fallback('unsupported');
    const path = await api.dialog.save({ defaultPath: built.fileName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!path) return { cancelled: true };
    const { paper, landscape, scale } = built.options;
    try {
      const r = await withTimeout(Promise.resolve(api.core.invoke('pdf_render', { html: built.html, destPath: path, opts: { paper, landscape, scale } })), timeoutMs);
      return { ok: true, method: 'webview2', path: r?.path ?? path, bytes: r?.bytes ?? null, pages: r?.pages ?? null, fileName: built.fileName, warnings: built.warnings };
    } catch (e) {
      const err = normalizePdfError(e);
      if (err.unsupported) { nativeUnsupported = true; return await fallback('unsupported'); }
      if (FALLBACK_CODES.has(err.code)) return await fallback('error', err);
      throw new PdfExportError(err, { html: built.html, fileName: built.fileName });
    }
  } finally {
    inFlight = false;
  }
}
