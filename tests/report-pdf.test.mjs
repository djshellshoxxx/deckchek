import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  suggestPdfName, deviceSlug, cssString, formatStamp, defaultPaper, normalizePdfOptions, readPdfSettings,
  niceTicks, decimate, renderChartSvg, severityIcon, addSeverityIcons, registerPrintableKind, printableKinds,
  getPrintableKind, extractReportParts, composePrintable, buildPrintableReport, capRows, exportPdf,
  PdfExportError, normalizePdfError, nativePdfAvailable, resetPdfBackendState, loadPrintCss, MAX_TABLE_ROWS, PDF_TIMEOUT_MS,
} from '../app/report-pdf.js';
import { interpretSystemScan } from '../app/system-check.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = fs.readFileSync(path.join(ROOT, 'app/report-print.css'), 'utf8');
const FIXTURE = path.join(ROOT, 'tests/fixtures/pdf/report-fixture.html');
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/contracts/pdf_render.json'), 'utf8'));
const NOW = new Date(2026, 9, 10, 12, 5); // local time: 2026-10-10 12:05
const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';
const XSS = '<img src=x onerror=alert(1)>';

const run = (o = {}) => ({
  title: 'DeckChek — Speed & wow test', device: 'Technics SL-1200MK4', createdAt: '2026-10-10T10:00:00', score: 92, verdict: 'Pass',
  measurements: Array.from({ length: 160 }, (_, i) => ({ metricId: `speed_${i}`, label: `Speed check #${i + 1}`, value: Math.sin(i * 0.013) * 0.4, unit: '%', origin: 'measured', confidence: 0.9 })),
  findings: [{ title: 'Pitch drift', detail: 'Speed wanders by 0.2 % over 30 s.', severity: 'warning' }],
  notes: 'Calibrated with profile from 2026-10-01.',
  charts: [{ title: 'Speed deviation', xLabel: 'Time (s)', yLabel: '%', series: [{ label: 'Speed', points: Array.from({ length: 50 }, (_, i) => [i * 0.6, Math.sin(i / 5) * 0.3]) }] }],
  ...o,
});

// ---------------------------------------------------------------- names

test('suggestPdfName: pattern, kinds, local timestamp', () => {
  assert.equal(suggestPdfName('run', 'Technics SL-1200MK4', NOW), 'DeckChek_Run_technics-sl-1200mk4_20261010-1205.pdf');
  assert.equal(suggestPdfName('device', 'Rane Twelve MK2', NOW), 'DeckChek_Device_rane-twelve-mk2_20261010-1205.pdf');
  assert.equal(suggestPdfName('systemHealth', 'This computer', NOW), 'DeckChek_SystemHealth_this-computer_20261010-1205.pdf');
  assert.equal(suggestPdfName('certificate', 'x', NOW), 'DeckChek_Certificate_x_20261010-1205.pdf', 'unregistered kind: PascalCase');
  assert.match(suggestPdfName('run', 'x', new Date('invalid')), /^DeckChek_Run_x_\d{8}-\d{4}\.pdf$/);
});

test('deviceSlug: unicode, invalid Windows chars, reserved names, 40-char cap', () => {
  assert.equal(deviceSlug('Pioneer DJM-Ä9 ✨'), 'pioneer-djm-a9');
  assert.equal(deviceSlug('a<b>c:d"e/f\\g|h?i*j'), 'a-b-c-d-e-f-g-h-i-j');
  for (const r of ['CON', 'nul', 'Com1', 'LPT9']) assert.equal(deviceSlug(r), `${r.toLowerCase()}_`);
  assert.equal(deviceSlug('console'), 'console');
  assert.equal(deviceSlug(''), 'unknown');
  assert.equal(deviceSlug('日本語'), 'unknown');
  assert.equal(deviceSlug('x'.repeat(40)), 'x'.repeat(40));
  assert.equal(deviceSlug('x'.repeat(41)), 'x'.repeat(40));
  assert.equal(deviceSlug(`${'a'.repeat(39)} b`), 'a'.repeat(39), 'no trailing dash after the cut');
  assert.ok(suggestPdfName('run', 'y'.repeat(200), NOW).length <= 80, 'fits sanitizeFileStem');
});

test('cssString: quotes, backslashes and markup cannot break out of the <style> block', () => {
  assert.equal(cssString('SL-1200 MK4'), '"SL-1200 MK4"');
  const s = cssString('a"b\\c</style><script>\n');
  assert.ok(!/["\\]/.test(s.slice(1, -1).replace(/\\[0-9a-f]+ /g, '')), s);
  assert.ok(!s.includes('<') && !s.includes('>'), s);
  assert.equal(cssString('Ä ✨ 😀'), '"Ä ✨ 😀"', 'non-ASCII kept (surrogate pairs intact)');
  assert.equal(Array.from(cssString('z'.repeat(500)).slice(1, -1)).length, 120);
});

test('formatStamp is local YYYY-MM-DD HH:mm', () => {
  assert.equal(formatStamp(NOW), '2026-10-10 12:05');
  assert.equal(formatStamp(new Date(2026, 0, 2, 3, 4)), '2026-01-02 03:04');
});

// ---------------------------------------------------------------- options

test('defaultPaper: Letter for US-style regions, A4 elsewhere', () => {
  for (const l of ['en-US', 'en-CA', 'fr-CA', 'es-MX', 'en-PH', 'en']) assert.equal(defaultPaper(l), 'Letter', l);
  for (const l of ['en-GB', 'de-DE', 'fr', 'ja-JP', 'en-AU', 'garbage!!']) assert.equal(defaultPaper(l), 'A4', l);
});

test('normalizePdfOptions / readPdfSettings', () => {
  assert.deepEqual(normalizePdfOptions({ paper: 'letter', orientation: 'landscape', scale: 0.5, includeRaw: true }, 'de-DE'),
    { paper: 'Letter', landscape: true, scale: 0.5, includeRaw: true, redactSerials: false });
  assert.deepEqual(normalizePdfOptions({ paper: 'A3', scale: 7, includeRaw: 'yes' }, 'de-DE'),
    { paper: 'A4', landscape: false, scale: 1, includeRaw: false, redactSerials: false });
  for (const s of [0.1, 2]) assert.equal(normalizePdfOptions({ scale: s }).scale, s);
  for (const s of [0.09, 2.01, NaN]) assert.equal(normalizePdfOptions({ scale: s }).scale, 1);
  assert.equal(readPdfSettings({ pdf: { paper: 'a4', redactSerials: true } }, 'en-US').paper, 'A4');
  assert.equal(readPdfSettings({ pdf: { paper: 'a4', redactSerials: true } }, 'en-US').redactSerials, true);
  assert.equal(readPdfSettings({ 'pdf.paper': 'letter', 'pdf.includeRaw': true }, 'de-DE').paper, 'Letter');
  assert.equal(readPdfSettings({}, 'en-US').paper, 'Letter', 'default by locale');
});

// ---------------------------------------------------------------- charts (numeric: written first)

test('niceTicks: covers the range with 1/2/2.5/5 x 10^n steps', () => {
  assert.deepEqual(niceTicks(0, 1, 5), { min: 0, max: 1, step: 0.2, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] });
  const t = niceTicks(0.03, 0.97, 4);
  assert.equal(t.step, 0.25);
  assert.ok(t.min <= 0.03 && t.max >= 0.97);
  assert.deepEqual(niceTicks(-3, 7, 5).ticks, [-4, -2, 0, 2, 4, 6, 8]);
  assert.deepEqual(niceTicks(10, 0, 5), niceTicks(0, 10, 5), 'reversed range');
  const flat = niceTicks(5, 5);
  assert.ok(flat.min < 5 && flat.max > 5, 'degenerate range widened');
  const zero = niceTicks(0, 0);
  assert.ok(zero.min < 0 && zero.max > 0);
  assert.throws(() => niceTicks(0, Infinity), /non-finite/);
  for (const [a, b] of [[0.0001, 0.0009], [1e6, 3e6], [-0.5, -0.1]]) {
    const r = niceTicks(a, b, 5);
    assert.ok(r.min <= a && r.max >= b && r.ticks.length >= 2 && r.ticks.length <= 12, `${a}..${b}`);
  }
});

test('decimate keeps endpoints and caps the count', () => {
  const pts = Array.from({ length: 10001 }, (_, i) => [i, i]);
  const d = decimate(pts, 100);
  assert.equal(d.length, 100);
  assert.deepEqual(d[0], [0, 0]);
  assert.deepEqual(d.at(-1), [10000, 10000]);
  assert.equal(decimate(pts.slice(0, 5), 100).length, 5);
});

test('renderChartSvg: vector SVG, selectable text, escaped labels, strokes >= 0.75 pt on A4', () => {
  const svg = renderChartSvg({ title: XSS, xLabel: 'Time <s>', yLabel: 'dB', series: [{ label: 'L', points: [[0, 0], [1, 2], [2, 1]] }, { label: 'R', points: [[0, 1], [2, 2]] }] });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 600 220"/);
  assert.ok(svg.includes('<text') && svg.includes('Time &lt;s&gt;'));
  assert.ok(!svg.includes('<img') && svg.includes('aria-label="&lt;img'));
  assert.equal((svg.match(/<polyline/g) || []).length, 2);
  assert.ok(svg.includes('stroke-dasharray'), 'second series differs by dash, not colour alone');
  // 600 viewBox units span the A4 portrait content width (210 - 30 mm); 1 mm = 2.835 pt.
  const ptPerUnit = (180 / 600) * 72 / 25.4;
  for (const [, w] of svg.matchAll(/stroke-width="([\d.]+)"/g)) assert.ok(Number(w) * ptPerUnit >= 0.75, `stroke ${w}`);
  // First point (x min, y min) sits on the axis origin (56, 184).
  assert.match(svg, /points="56\.0,184\.0 /);
  assert.throws(() => renderChartSvg({ series: [{ points: [[NaN, 1]] }] }), /no data/);
  assert.throws(() => renderChartSvg({}), /no data/);
});

test('severity icons differ by shape and keep the text label (AC-5)', () => {
  const shapes = ['ERROR', 'WARNING', 'INFO', 'OK'].map(s => severityIcon(s));
  assert.equal(new Set(shapes).size, 4);
  for (const s of shapes) assert.match(s, /^<svg class="dc-sev-icon"[^>]*aria-hidden="true"/);
  assert.equal(severityIcon('bogus'), '');
  assert.equal(addSeverityIcons('<span class="sev" style="color:red">ERROR</span> x'), `${shapes[0]}<span class="sev" style="color:red">ERROR</span> x`);
});

// ---------------------------------------------------------------- composition

test('extractReportParts: styles from head, body only, scripts dropped', () => {
  const p = extractReportParts('<!doctype html><html><head><style>a{b:c}</style><script>x()</script></head><body class="z"><h1>T</h1><script src="e.js"></script><p>ok</p></body></html>');
  assert.deepEqual(p.styles, ['a{b:c}']);
  assert.equal(p.body, '<h1>T</h1><p>ok</p>');
  assert.equal(extractReportParts('<p>frag</p><script>bad()</script>').body, '<p>frag</p>');
});

test('buildPrintableReport(run): @page header/footer, counter, no script, escaped user strings, SVG charts', () => {
  const html = buildPrintableReport('run', run({ notes: XSS, device: `SL "1200" ${XSS}` }), { now: NOW, appVersion: '0.0.4', css: CSS, locale: 'de-DE' });
  assert.ok(html.includes('@page') && html.includes('counter(page)') && html.includes('counter(pages)'));
  assert.ok(html.includes('"Page " counter(page) " of " counter(pages)'));
  assert.ok(html.includes('@top-left') && html.includes('@top-right') && html.includes('@bottom-left'));
  assert.ok(html.includes('DeckChek 0.0.4 · Generated 2026-10-10 12:05'), 'footer: version + generated time');
  assert.ok(!/<script/i.test(html));
  assert.ok(!html.includes('<img'), 'user markup is escaped');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(/<svg[^>]*viewBox/.test(html) && html.includes('class="dc-chart"'));
  assert.ok(html.indexOf('class="dc-summary"') < html.indexOf('class="dc-charts"') && html.indexOf('class="dc-charts"') < html.indexOf('class="dc-report"'), 'summary first');
  assert.equal((html.match(/<h1\b/g) || []).length, 1, 'builder h1 replaced by the summary h1');
  assert.ok(html.includes('<dt>Score</dt><dd>92</dd>') && html.includes('<dt>Verdict</dt><dd>Pass</dd>'));
  assert.ok(html.includes('size: A4 portrait'));
  assert.ok(buildPrintableReport('run', run(), { now: NOW, paper: 'letter', landscape: true, css: CSS }).includes('size: letter landscape'));
});

test('print CSS: theme-independent light palette, rows unsplit, thead repeats (AC-2, AC-4)', () => {
  assert.ok(!/prefers-color-scheme|data-theme/.test(CSS), 'no theme hooks');
  assert.match(CSS, /color-scheme:\s*light/);
  assert.match(CSS, /background:\s*#ffffff/);
  assert.match(CSS, /thead\s*{\s*display:\s*table-header-group/);
  assert.match(CSS, /tr,[^{]*{[^}]*break-inside:\s*avoid/);
  assert.match(CSS, /max-height:\s*70mm/);
  assert.ok(!/url\(|@import/.test(CSS), 'no external assets');
  const html = buildPrintableReport('run', run(), { now: NOW, css: CSS });
  assert.ok(html.includes('data-theme="light"') && html.includes('<meta name="color-scheme" content="light">'));
  assert.ok(buildPrintableReport('run', run(), { now: NOW, css: null }).includes('<link rel="stylesheet" href="report-print.css"'), 'link fallback without inlined CSS');
  assert.ok(!buildPrintableReport('run', run(), { now: NOW, css: 'x{}</style><script>' }).includes('</style><script>'), 'inlined CSS cannot close its element');
});

test('partial: a failing chart becomes a placeholder and a warning', () => {
  const r = composePrintable('run', run({ charts: [{ title: 'Good', series: [{ points: [[0, 1], [1, 2]] }] }, { title: 'Broken <b>', series: [] }] }), { now: NOW, css: CSS });
  assert.ok(r.html.includes('Chart unavailable: Broken &lt;b&gt;'));
  assert.deepEqual(r.warnings, [{ code: 'chart', message: 'Chart unavailable: Broken <b>' }]);
  assert.equal(composePrintable('run', run(), { now: NOW }).warnings.length, 0);
});

test('run: raw measurement table only when asked; row caps', () => {
  assert.ok(!buildPrintableReport('run', run(), { now: NOW }).includes('Raw measurements'));
  const raw = buildPrintableReport('run', run({ measurements: [{ metricId: 'wow', value: 0.0312345, unit: '%', uncertainty: 0.002 }] }), { now: NOW, includeRaw: true });
  assert.ok(raw.includes('Raw measurements') && raw.includes('0.0312345') && raw.includes('0.002'));
  const big = run({ measurements: Array.from({ length: MAX_TABLE_ROWS + 5 }, (_, i) => ({ metricId: `m${i}`, value: i, unit: '' })) });
  const html = buildPrintableReport('run', big, { now: NOW });
  assert.ok(html.includes('5 more measurements not shown.'));
  assert.equal(capRows([1, 2, 3], 2).omitted, 1);
  assert.deepEqual(capRows(null), { rows: [], omitted: 0 });
});

test('device: serial redaction option, title and file name', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/devices/profiles/pioneer-djm-a9.json'), 'utf8'));
  const data = { profile, asset: { id: 'a1', nickname: `Booth ${XSS}`, serialNumber: 'SN-ABC-12345' }, results: [] };
  const plain = composePrintable('device', data, { now: NOW });
  assert.ok(plain.html.includes('SN-ABC-12345'));
  assert.ok(!plain.html.includes('<img'));
  assert.equal(plain.title, `Device report — ${profile.manufacturer} ${profile.model}`);
  assert.match(plain.fileName, /^DeckChek_Device_booth-img-src-x-onerror-alert-1_20261010-1205\.pdf$/);
  const red = composePrintable('device', data, { now: NOW, redactSerials: true });
  assert.ok(!red.html.includes('SN-ABC-12345') && red.html.includes('[redacted]'));
});

test('systemHealth: every finding has icon + severity text + evidence (AC-5)', () => {
  const findings = interpretSystemScan({
    drivers: { supported: true, scannedAt: '2026-10-07T12:00:00Z', errors: [], drivers: [
      { deviceName: `Pioneer ${XSS}`, deviceClass: 'MEDIA', manufacturer: 'P', driverProvider: 'P', driverVersion: '1.0', driverDate: '2025-02-11T00:00:00Z', infName: 'oem1.inf', hardwareId: 'USB\\VID_1', isSigned: true, signer: 'P', status: 'Error', problemCode: 43, present: true },
      { deviceName: 'Budget USB', deviceClass: 'MEDIA', manufacturer: 'G', driverProvider: 'G', driverVersion: '0.9', driverDate: '2018-05-02T00:00:00Z', infName: 'oem7.inf', hardwareId: 'USB\\VID_2', isSigned: false, signer: null, status: 'OK', problemCode: 0, present: true }] },
  }, { now: Date.parse('2026-10-07T12:00:00Z') });
  assert.ok(findings.length >= 2);
  const r = composePrintable('systemHealth', { findings, generatedAt: '2026-10-07T12:00:00Z' }, { now: NOW });
  const articles = r.html.match(/<article[\s\S]*?<\/article>/g) || [];
  assert.equal(articles.length, findings.length);
  for (const a of articles) {
    assert.match(a, /<svg class="dc-sev-icon"[\s\S]*?<\/svg><span class="sev"[^>]*>(ERROR|WARNING|INFO|OK)<\/span>/);
  }
  const withEvidence = findings.filter(f => (f.evidence || []).length);
  assert.ok(withEvidence.length > 0);
  for (const f of withEvidence) assert.ok(r.html.includes(f.evidence[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')), `evidence of ${f.id}`);
  assert.ok(!r.html.includes('<img'));
  assert.ok(r.html.includes('<dt>Verdict</dt>'));
  assert.equal(r.fileName, 'DeckChek_SystemHealth_this-computer_20261010-1205.pdf');
});

// ---------------------------------------------------------------- registry

test('registerPrintableKind: later features add kinds without editing report-pdf.js', () => {
  assert.deepEqual(printableKinds().slice(0, 3), ['run', 'device', 'systemHealth']);
  assert.throws(() => registerPrintableKind('run', { title: 'x', build: () => '' }), /already registered/);
  assert.throws(() => registerPrintableKind('Bad-Kind', { title: 'x', build: () => '' }), /Invalid printable kind/);
  assert.throws(() => registerPrintableKind('nobuild', { title: 'x' }), /build/);
  assert.throws(() => registerPrintableKind('notitle', { build: () => '' }), /title/);
  assert.throws(() => registerPrintableKind('badfile', { title: 'x', fileKind: 'lower', build: () => '' }), /file kind/);
  const off = registerPrintableKind('certificate', {
    title: d => `Certificate ${d.id}`, device: d => d.model,
    summary: d => [['Grade', d.grade]],
    build: (d, ctx) => `<h2>Certificate</h2><p>${ctx.esc(d.note)}</p><table><tr><td>${ctx.options.paper}</td></tr></table>`,
  });
  try {
    assert.equal(getPrintableKind('certificate').fileKind, 'Certificate');
    const r = composePrintable('certificate', { id: 'C-1', model: 'PLX-CRSS12', grade: 'A', note: XSS }, { now: NOW, paper: 'letter' });
    assert.equal(r.title, 'Certificate C-1');
    assert.equal(r.fileName, 'DeckChek_Certificate_plx-crss12_20261010-1205.pdf');
    assert.ok(r.html.includes('<dt>Grade</dt><dd>A</dd>') && r.html.includes('<td>Letter</td>') && !r.html.includes('<img'));
    const again = registerPrintableKind('certificate', { title: 'v2', build: () => '<p>v2</p>' }, { replace: true });
    assert.equal(composePrintable('certificate', {}, { now: NOW }).title, 'v2');
    again();
  } finally {
    off();
  }
  assert.equal(getPrintableKind('certificate'), null);
  assert.throws(() => composePrintable('certificate', {}), /Unknown printable kind/);
});

// ---------------------------------------------------------------- export (runtime backend choice)

function fakeApi({ save = 'C:\\Users\\dj\\Documents\\r.pdf', invoke } = {}) {
  const calls = { save: [], invoke: [] };
  const api = {
    dialog: { save: async (o) => { calls.save.push(o); return save; } },
    core: { invoke: async (cmd, args) => { calls.invoke.push([cmd, args]); return invoke ? invoke(cmd, args) : { path: args.destPath, bytes: 12345, pages: 3 }; } },
    app: { getVersion: async () => '0.0.4' },
  };
  return { api, calls };
}
function fakeFallback() {
  const printed = [];
  return { printed, printFallback: async (html) => { printed.push(html); return { fallback: true }; } };
}
const deps = (o) => ({ userAgent: WIN_UA, now: () => NOW, ...o });

test('exportPdf: WebView2 path when pdf_render succeeds (AC-1), exact contract arguments', async () => {
  resetPdfBackendState();
  const { api, calls } = fakeApi();
  const fb = fakeFallback();
  const r = await exportPdf('run', run(), { css: CSS, paper: 'a4' }, deps({ api, ...fb }));
  assert.deepEqual(r, { ok: true, method: 'webview2', path: 'C:\\Users\\dj\\Documents\\r.pdf', bytes: 12345, pages: 3, fileName: 'DeckChek_Run_technics-sl-1200mk4_20261010-1205.pdf', warnings: [] });
  assert.equal(fb.printed.length, 0, 'no print dialog');
  assert.deepEqual(calls.save, [{ defaultPath: 'DeckChek_Run_technics-sl-1200mk4_20261010-1205.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }]);
  const [cmd, args] = calls.invoke[0];
  assert.equal(cmd, CONTRACT.command);
  assert.deepEqual(Object.keys(args).sort(), Object.keys(CONTRACT.request).sort());
  assert.deepEqual(Object.keys(args.opts).sort(), Object.keys(CONTRACT.request.opts).sort());
  assert.deepEqual(args.opts, { paper: 'A4', landscape: false, scale: 1 });
  assert.ok(args.html.includes('DeckChek 0.0.4 · Generated'), 'app version from the Tauri app API');
});

test('exportPdf: browser mode / non-Windows go straight to the print fallback (AC-6)', async () => {
  resetPdfBackendState();
  const fb = fakeFallback();
  const r = await exportPdf('run', run(), { css: CSS }, deps({ api: null, ...fb }));
  assert.equal(r.fallback, true);
  assert.equal(r.reason, 'unsupported');
  assert.equal(fb.printed.length, 1);
  assert.ok(fb.printed[0].includes('counter(pages)'));
  const { api, calls } = fakeApi();
  const r2 = await exportPdf('run', run(), { css: CSS }, deps({ api, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', ...fb }));
  assert.equal(r2.reason, 'unsupported');
  assert.equal(calls.save.length, 0, 'no save dialog when the backend cannot be used');
  assert.equal(nativePdfAvailable(null, WIN_UA), false);
  assert.equal(nativePdfAvailable(api, WIN_UA), true);
});

test('exportPdf: pdf_render "unsupported" falls back and is remembered for the session', async () => {
  resetPdfBackendState();
  const { api, calls } = fakeApi({ invoke: () => { throw CONTRACT.errors[0]; } });
  const fb = fakeFallback();
  const r = await exportPdf('run', run(), { css: CSS }, deps({ api, ...fb }));
  assert.deepEqual([r.fallback, r.method, r.reason], [true, 'print', 'unsupported']);
  assert.equal(fb.printed.length, 1);
  await exportPdf('run', run(), { css: CSS }, deps({ api, ...fb }));
  assert.equal(calls.save.length, 1, 'second export skips the save dialog');
  assert.equal(fb.printed.length, 2);
  resetPdfBackendState();
});

test('exportPdf: backend errors fall back to the print dialog and report the error', async () => {
  for (const code of ['webview', 'print_host', 'invalid_output']) {
    resetPdfBackendState();
    const { api } = fakeApi({ invoke: () => Promise.reject({ code, message: `boom ${code}`, unsupported: false }) });
    const fb = fakeFallback();
    const r = await exportPdf('run', run(), { css: CSS }, deps({ api, ...fb }));
    assert.equal(r.reason, 'error', code);
    assert.equal(r.error.code, code);
    assert.equal(fb.printed.length, 1);
    assert.equal(nativePdfAvailable(api, WIN_UA), true, 'not remembered: Retry tries WebView2 again');
  }
});

test('exportPdf: timeout rejects with a retryable error (AC-7)', async () => {
  resetPdfBackendState();
  const { api } = fakeApi({ invoke: () => new Promise(() => {}) });
  const fb = fakeFallback();
  const started = Date.now();
  await assert.rejects(exportPdf('run', run(), { css: CSS }, deps({ api, timeoutMs: 40, ...fb })), (e) => {
    assert.ok(e instanceof PdfExportError);
    assert.equal(e.code, 'timeout');
    assert.equal(e.retryable, true);
    assert.ok(e.html.includes('counter(pages)'), 'HTML kept for "Export HTML instead"');
    return true;
  });
  assert.ok(Date.now() - started < 2000);
  assert.equal(fb.printed.length, 0);
  // Rust's own timeout error is handled the same way.
  const { api: api2 } = fakeApi({ invoke: () => Promise.reject(CONTRACT.errors[1]) });
  await assert.rejects(exportPdf('run', run(), { css: CSS }, deps({ api: api2, ...fb })), { code: 'timeout', retryable: true });
  assert.ok(PDF_TIMEOUT_MS === 20000);
});

test('exportPdf: path errors are not retried or printed; cancel is quiet; one export at a time', async () => {
  resetPdfBackendState();
  const { api } = fakeApi({ invoke: () => Promise.reject({ code: 'bad_extension', message: 'File must end in .pdf', unsupported: false }) });
  const fb = fakeFallback();
  await assert.rejects(exportPdf('run', run(), { css: CSS }, deps({ api, ...fb })), { code: 'bad_extension', retryable: false });
  assert.equal(fb.printed.length, 0);
  const { api: cancel, calls } = fakeApi({ save: null });
  assert.deepEqual(await exportPdf('run', run(), { css: CSS }, deps({ api: cancel, ...fb })), { cancelled: true });
  assert.equal(calls.invoke.length, 0);
  let release;
  const { api: slow } = fakeApi({ invoke: () => new Promise(r => { release = r; }) });
  const first = exportPdf('run', run(), { css: CSS }, deps({ api: slow, ...fb }));
  await assert.rejects(exportPdf('run', run(), { css: CSS }, deps({ api: slow, ...fb })), { code: 'busy' });
  await new Promise(r => setTimeout(r, 0));
  release({ path: 'C:\\x.pdf', bytes: 1, pages: null });
  assert.equal((await first).ok, true);
  assert.equal((await exportPdf('run', run(), { css: CSS }, deps({ api: fakeApi().api, ...fb }))).ok, true, 'free again');
});

test('normalizePdfError handles strings and objects', () => {
  assert.deepEqual(normalizePdfError('nope'), { code: 'unknown', message: 'nope', unsupported: false });
  assert.deepEqual(normalizePdfError({ code: 'unsupported' }), { code: 'unsupported', message: 'unsupported', unsupported: true });
  assert.equal(new PdfExportError({ code: 'io', message: 'x' }).retryable, true);
});

test('loadPrintCss fetches once and tolerates failure', async () => {
  let n = 0;
  const failing = await loadPrintCss({ fetchImpl: async () => { n++; throw new Error('offline'); } });
  assert.equal(failing, null);
  const css = await loadPrintCss({ fetchImpl: async (u) => { n++; assert.match(String(u), /report-print\.css$/); return { ok: true, text: async () => CSS }; } });
  assert.equal(css, CSS);
  assert.equal(await loadPrintCss({ fetchImpl: async () => { throw new Error('not called'); } }), CSS);
  assert.equal(n, 2);
});

// ---------------------------------------------------------------- Windows CI fixture (pdf.rs AC-2 test)

test('report fixture for the Windows PrintToPdf test is up to date', () => {
  const html = buildPrintableReport('run', run(), { now: NOW, appVersion: '0.0.4', css: CSS, paper: 'a4' }) + '\n';
  if (process.env.UPDATE_FIXTURES) fs.writeFileSync(FIXTURE, html);
  assert.equal(fs.readFileSync(FIXTURE, 'utf8'), html, 'run UPDATE_FIXTURES=1 node --test tests/report-pdf.test.mjs');
  assert.ok(!html.includes('<link') && !/<script/i.test(html));
});
