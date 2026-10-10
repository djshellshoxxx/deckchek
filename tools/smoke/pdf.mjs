// FS-03 smoke: report-pdf.js export paths chosen at runtime, the AC-6 print fallback (hidden
// sandboxed iframe, window.print spy), theme-independent output, Chromium pagination of the
// printable layout, the print host (stylesheet wait, sanitising) and the mocked WebView2 path.
// The Export PDF buttons themselves arrive with M5-pdf-integration.
import { tauriMock, watchConsole } from './core.mjs';

const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';

// Runs in the page: a long run report with a chart and hostile user strings.
const REPORT = {
  title: 'DeckChek — Speed test', device: 'Technics SL-1200MK4', createdAt: '2026-10-10T10:00:00', score: 91, verdict: 'Pass',
  notes: '<img src=x onerror="window.__xss=1">',
  measurements: Array.from({ length: 150 }, (_, i) => ({ metricId: `m${i}`, label: `Speed check #${i + 1}`, value: i / 100, unit: '%', origin: 'measured', confidence: 0.9 })),
  findings: [{ title: 'Pitch drift <b>', detail: 'Wanders 0.2 %', severity: 'warning' }],
  charts: [{ title: 'Speed', series: [{ label: 'Speed', points: Array.from({ length: 40 }, (_, i) => [i, Math.sin(i / 4)]) }] }],
};

/** Records iframe print() calls (and what the frame showed) instead of opening a dialog. */
function installPrintSpy() {
  window.__printed = [];
  window.__opened = 0;
  window.open = () => { window.__opened++; return null; };
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get() {
      const w = desc.get.call(this);
      if (w && this.classList.contains('dc-print-frame') && !w.__spied) {
        w.__spied = true;
        const frame = this;
        w.print = () => {
          const d = w.document;
          window.__printed.push({
            sandbox: frame.getAttribute('sandbox'), ariaHidden: frame.getAttribute('aria-hidden'), srcdoc: frame.hasAttribute('srcdoc'),
            bg: w.getComputedStyle(d.body).backgroundColor, color: w.getComputedStyle(d.body).color,
            theme: d.documentElement.getAttribute('data-theme'), inlineCss: !!d.querySelector('style[data-dc="print"]'),
            svg: d.querySelectorAll('svg').length, imgs: d.querySelectorAll('img').length, scripts: d.querySelectorAll('script').length,
            text: d.body.innerText,
          });
        };
      }
      return w;
    },
  });
}

export default async function run({ browser, base, check }) {
  const errors = [];

  // ----- browser mode (dark theme): AC-6 fallback -----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'pdf-browser'));
  await page.goto(base);
  await page.waitForSelector('.rail-item');
  await page.evaluate(installPrintSpy);
  const r1 = await page.evaluate(async (report) => {
    const m = await import('./report-pdf.js');
    const btn = document.querySelector('.rail-item');
    btn.focus();
    const res = await m.exportPdf('run', report, { paper: 'a4' });
    await new Promise(r => setTimeout(r, 50));
    return { res, focusBack: document.activeElement === btn, frames: document.querySelectorAll('.dc-print-frame').length, xss: window.__xss || 0 };
  }, REPORT);
  const p1 = (await page.evaluate(() => window.__printed))[0];
  check('pdf: browser mode falls back to the print dialog (AC-6)', r1.res.fallback === true && r1.res.reason === 'unsupported' && r1.res.method === 'print', JSON.stringify(r1.res).slice(0, 120));
  check('pdf: fallback prints a hidden sandboxed srcdoc iframe, no window.open', !!p1 && p1.srcdoc && p1.ariaHidden === 'true' && p1.sandbox === 'allow-same-origin allow-modals' && (await page.evaluate(() => window.__opened)) === 0);
  check('pdf: print frame removed and focus returned', r1.frames === 0 && r1.focusBack);
  check('pdf: output stays light in dark theme (AC-4)', p1 && p1.bg === 'rgb(255, 255, 255)' && p1.theme === 'light' && p1.color === 'rgb(20, 23, 28)', p1 && `${p1.bg} ${p1.color}`);
  check('pdf: print CSS inlined, charts are SVG, no script/img from user strings', p1 && p1.inlineCss && p1.svg >= 1 && p1.scripts === 0 && p1.imgs === 0 && r1.xss === 0 && /onerror/.test(p1.text));
  check('pdf: summary header shows title, device and verdict', p1 && /DeckChek — Speed test/.test(p1.text) && /Technics SL-1200MK4/.test(p1.text) && /Verdict\s*Pass/.test(p1.text));

  // Real print() in the sandboxed frame (headless: returns at once) must not be blocked.
  const real = await page.evaluate(async () => {
    const m = await import('./report-pdf.js');
    return m.printViaIframe('<!doctype html><title>x</title><p>print me</p>');
  });
  check('pdf: real iframe print() allowed by the sandbox', real.fallback === true);

  // Chromium pagination of the printable layout (WebView2 is Chromium; Windows CI checks text).
  const html = await page.evaluate(async (report) => {
    const m = await import('./report-pdf.js');
    await m.loadPrintCss();
    return m.buildPrintableReport('run', report, { paper: 'a4', appVersion: '0.0.5' });
  }, REPORT);
  const pp = await ctx.newPage();
  await pp.setContent(html);
  const pdf = await pp.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-z])/g) || []).length;
  check('pdf: printable report paginates in Chromium (>= 2 pages, > 5 KB)', pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 5120 && pages >= 2, `${pages} pages, ${pdf.length} bytes`);
  await pp.close();

  // Print host: link-stylesheet fallback is awaited, active content stripped, state machine.
  const host = await ctx.newPage();
  errors.push(...watchConsole(host, 'pdf-print-host'));
  await host.goto(`${base}print-host.html`);
  await host.waitForFunction(() => window.__dcPrintHost);
  const hostRes = await host.evaluate(async (report) => {
    const m = await import('./report-pdf.js');
    const doc = m.buildPrintableReport('run', report, { paper: 'a4', css: null }) // <link> fallback
      .replace('</body>', '<script>window.__ran=1</script><a href="javascript:alert(1)" id="js">x</a><iframe src="https://example.com"></iframe></body>');
    const first = window.__dcPrintHost.render(doc);
    const t0 = performance.now();
    while (window.__dcPrintHost.state === 'loading' && performance.now() - t0 < 6000) await new Promise(r => setTimeout(r, 20));
    return {
      first, state: window.__dcPrintHost.state, version: window.__dcPrintHost.version, title: document.title,
      fontSize: getComputedStyle(document.body).fontSize, linkLoaded: !!document.querySelector('link[data-print-content]')?.sheet,
      ran: window.__ran || 0, jsHref: document.getElementById('js')?.getAttribute('href') ?? null, iframes: document.querySelectorAll('iframe').length,
      empty: window.__dcPrintHost.render(''),
    };
  }, REPORT);
  check('pdf: print host waits for the report stylesheet before ready', hostRes.first === 'loading' && hostRes.state === 'ready' && hostRes.linkLoaded && hostRes.fontSize === '13.3333px' && hostRes.version === 2, JSON.stringify(hostRes));
  check('pdf: print host strips script, javascript: links and iframes', hostRes.ran === 0 && hostRes.jsHref === null && hostRes.iframes === 0 && hostRes.title === 'DeckChek — Speed test');
  check('pdf: print host reports an error for an empty report', hostRes.empty === 'error');
  await ctx.close();

  // ----- desktop mode (mocked Tauri, Windows WebView2 UA): runtime backend choice -----
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: WIN_UA });
  await dctx.addInitScript(tauriMock);
  await dctx.addInitScript(() => {
    if (window.top !== window || !window.__TAURI__) return;
    window.__pdf = { mode: 'ok', saves: [], renders: [] };
    const base = window.__TAURI__.core.invoke;
    window.__TAURI__.dialog = { save: async (o) => { window.__pdf.saves.push(o); return window.__pdf.mode === 'cancel' ? null : `C:\\Users\\dj\\Documents\\${o.defaultPath}`; } };
    window.__TAURI__.app = { getVersion: async () => '0.0.5' };
    window.__TAURI__.core.invoke = async (cmd, args) => {
      if (cmd !== 'pdf_render') return base(cmd, args);
      window.__pdf.renders.push({ keys: Object.keys(args).sort(), opts: args.opts, size: args.html.length });
      const m = window.__pdf.mode;
      if (m === 'unsupported') throw { code: 'unsupported', message: 'PDF export is not supported on this platform; use the print dialog instead', unsupported: true };
      if (m === 'webview') throw { code: 'webview', message: 'webview error: PrintToPdf', unsupported: false };
      if (m === 'hang') return new Promise(() => {});
      return { path: args.destPath, bytes: 23456, pages: 4 };
    };
  });
  const dp = await dctx.newPage();
  errors.push(...watchConsole(dp, 'pdf-desktop'));
  await dp.goto(base);
  await dp.waitForSelector('.rail-item');
  await dp.evaluate(installPrintSpy);
  const exp = (mode, deps = {}) => dp.evaluate(async ([report, mode, deps]) => {
    window.__pdf.mode = mode;
    const m = await import('./report-pdf.js');
    try { return { ok: true, value: await m.exportPdf('run', report, { paper: 'letter' }, deps) }; } catch (e) { return { ok: false, code: e.code, retryable: e.retryable, hasHtml: typeof e.html === 'string' }; }
  }, [REPORT, mode, deps]);

  const ok = await exp('ok');
  const st = await dp.evaluate(() => ({ ...window.__pdf, printed: window.__printed.length }));
  check('pdf: desktop uses WebView2 pdf_render when it succeeds (AC-1)', ok.value?.ok === true && ok.value.method === 'webview2' && ok.value.pages === 4 && st.printed === 0, JSON.stringify(ok.value).slice(0, 140));
  check('pdf: save dialog suggests DeckChek_Run_<device>_<stamp>.pdf', /^DeckChek_Run_technics-sl-1200mk4_\d{8}-\d{4}\.pdf$/.test(st.saves[0]?.defaultPath || '') && st.saves[0].filters[0].extensions[0] === 'pdf', st.saves[0]?.defaultPath);
  check('pdf: pdf_render gets html/destPath/opts (contract)', st.renders[0]?.keys.join() === 'destPath,html,opts' && st.renders[0].opts.paper === 'Letter' && st.renders[0].size > 5000);

  const cancel = await exp('cancel');
  check('pdf: cancelled save dialog does nothing', cancel.value?.cancelled === true && (await dp.evaluate(() => window.__pdf.renders.length)) === 1);

  const wv = await exp('webview');
  check('pdf: WebView2 failure falls back to the print dialog', wv.value?.fallback === true && wv.value.reason === 'error' && wv.value.error.code === 'webview' && (await dp.evaluate(() => window.__printed.length)) === 1);

  const hang = await exp('hang', { timeoutMs: 300 });
  check('pdf: slow render is cancelled with a retryable timeout (AC-7)', hang.ok === false && hang.code === 'timeout' && hang.retryable === true && hang.hasHtml);

  const un = await exp('unsupported');
  const un2 = await exp('ok');
  const st2 = await dp.evaluate(() => ({ saves: window.__pdf.saves.length, printed: window.__printed.length }));
  check('pdf: "unsupported" backend falls back and is remembered for the session', un.value?.fallback === true && un.value.reason === 'unsupported' && un2.value?.fallback === true && st2.printed === 3 && st2.saves === 5, JSON.stringify(st2));
  await dctx.close();
  return errors;
}
