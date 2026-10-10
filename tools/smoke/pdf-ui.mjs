// FS-03 UI smoke (M5-pdf-integration): the Export PDF buttons in History, Devices and System
// Health sit next to the HTML export, follow features.pdfExport, show progress and errors, and
// reach report-pdf.js (print fallback in the browser, pdf_render in the mocked desktop app).
import { tauriMock, watchConsole } from './core.mjs';

const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';

const RUN = {
  id: 'run-pdf-1', test: 'speed', createdAt: '2026-10-10T10:00:00.000Z', device: 'Technics SL-1200MK4', sampleRate: 48000, channels: 1, sourceFile: 'speed.wav',
  score: 88, findings: [{ code: 'drift', title: 'Pitch drift', detail: 'Wanders 0.2 %', severity: 'review' }],
  measurements: [{ metricId: 'speed_mean', label: 'Mean speed', value: 33.33, unit: 'rpm', origin: 'measured', confidence: 0.9 }, { metricId: 'wow', label: 'Wow', value: 0.12, unit: '%', origin: 'measured', confidence: 0.9 }],
};

/** Replaces iframe print() with a recorder so the fallback path can be observed headlessly. */
function installPrintSpy() {
  window.__printed = [];
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get() {
      const w = desc.get.call(this);
      if (w && this.classList.contains('dc-print-frame') && !w.__spied) {
        w.__spied = true;
        w.print = () => { window.__printed.push(w.document.title + ' | ' + w.document.body.innerText.slice(0, 400)); };
      }
      return w;
    },
  });
}

export default async function run({ browser, base, check }) {
  const errors = [];

  // ----- browser mode: print-dialog fallback -----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(run => { if (window.top === window) { try { localStorage.setItem('deckchek.workspace.v1', JSON.stringify({ version: 1, equipment: [], runs: [run] })); } catch { /* ignore */ } } }, RUN);
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'pdf-ui-browser'));
  await page.goto(base);
  await page.waitForSelector('.rail-item');
  await page.evaluate(installPrintSpy);

  await page.click('.rail-item[data-screen="history"]');
  await page.waitForSelector('#hist-rows .run-main');
  await page.locator('#hist-rows .run-main').first().click();
  await page.waitForSelector('#hist-detail .verdict');
  const labels = await page.locator('#hist-detail .btn').allInnerTexts();
  const iHtml = labels.findIndex(t => /Export report/.test(t)), iPdf = labels.findIndex(t => /Export PDF/.test(t));
  check('pdf-ui: History run detail has Export PDF right after the HTML export', iHtml >= 0 && iPdf === iHtml + 1, labels.join(','));
  await page.locator('#hist-detail .btn', { hasText: 'Export PDF' }).click();
  await page.waitForFunction(() => window.__printed.length === 1);
  const printed = await page.evaluate(() => window.__printed[0]);
  check('pdf-ui: History Export PDF prints the run report via the browser fallback', /Technics SL-1200MK4/.test(printed) && /Mean speed|DeckChek/.test(printed), printed.slice(0, 80));
  check('pdf-ui: fallback tells the user to choose Save as PDF; progress toast is gone', /Save as PDF/.test(await page.locator('#toasts').innerText()) && !/Creating PDF/.test(await page.locator('#toasts').innerText()));

  await page.click('.rail-item[data-screen="devices"]');
  await page.waitForSelector('.dev-card');
  await page.locator('.dev-card').first().click();
  await page.waitForSelector('#dev-export-pdf');
  check('pdf-ui: Devices report has Export PDF beside Export report', await page.locator('#dev-export + #dev-export-pdf').count() === 1 && await page.locator('#dev-export-pdf').isEnabled());
  await page.click('#dev-export-pdf');
  await page.waitForFunction(() => window.__printed.length === 2);
  check('pdf-ui: Devices Export PDF prints the device report', /Device report/.test(await page.evaluate(() => window.__printed[1])));

  await page.click('.rail-item[data-screen="system"]');
  check('pdf-ui: System Export PDF present but disabled before a scan', await page.locator('#sys-export-pdf').isVisible() && await page.locator('#sys-export-pdf').isDisabled());

  // Flag off hides every PDF entry point (live, no reload).
  await page.evaluate(async () => { (await import('./features.js')).setEnabled('pdfExport', false); });
  check('pdf-ui: features.pdfExport=false hides System and Devices buttons', await page.locator('#sys-export-pdf').isHidden());
  await page.click('.rail-item[data-screen="devices"]');
  check('pdf-ui: flag off hides the device button', await page.locator('#dev-export-pdf').isHidden());
  await page.click('.rail-item[data-screen="history"]');
  await page.locator('#hist-rows .run-main').first().click();
  await page.waitForSelector('#hist-detail .verdict');
  check('pdf-ui: flag off removes History Export PDF but keeps the HTML export', await page.locator('#hist-detail .btn', { hasText: 'Export PDF' }).count() === 0 && await page.locator('#hist-detail .btn', { hasText: 'Export report' }).count() === 1);
  await ctx.close();

  // ----- desktop mode (mocked Tauri, WebView2 UA): System Health through pdf_render -----
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: WIN_UA });
  await dctx.addInitScript(tauriMock);
  await dctx.addInitScript(() => {
    if (window.top !== window || !window.__TAURI__) return;
    window.__pdf = { mode: 'ok', saves: [], renders: [], paths: [] };
    const base = window.__TAURI__.core.invoke;
    window.__TAURI__.dialog = { save: async o => { window.__pdf.saves.push(o); return `C:\\Users\\dj\\Documents\\${o.defaultPath}`; } };
    window.__TAURI__.app = { getVersion: async () => '0.0.5' };
    window.__TAURI__.core.invoke = async (cmd, args) => {
      if (cmd === 'open_path' || cmd === 'reveal_path') { window.__pdf.paths.push([cmd, args.path]); return { opened: true }; }
      if (cmd !== 'pdf_render') return base(cmd, args);
      window.__pdf.renders.push({ html: args.html });
      if (window.__pdf.mode === 'timeout') throw { code: 'timeout', message: 'The PDF took longer than 20 s.', unsupported: false };
      if (window.__pdf.mode === 'io') throw { code: 'io', message: 'disk full', unsupported: false };
      await new Promise(r => setTimeout(r, 250));
      return { path: args.destPath, bytes: 20000, pages: 3 };
    };
  });
  const dp = await dctx.newPage();
  errors.push(...watchConsole(dp, 'pdf-ui-desktop'));
  await dp.goto(base);
  await dp.waitForSelector('.rail-item');
  await dp.click('.rail-item[data-screen="system"]');
  await dp.waitForSelector('#sys-headline', { timeout: 10000 });
  check('pdf-ui: System Export PDF enabled after a scan', await dp.locator('#sys-export-pdf').isEnabled());
  await dp.click('#sys-export-pdf');
  await dp.waitForFunction(() => /Creating PDF/.test(document.querySelector('#toasts')?.innerText || ''));
  check('pdf-ui: progress shown and the button is busy while the PDF is created', await dp.locator('#sys-export-pdf').isDisabled() && await dp.locator('#sys-export-pdf').getAttribute('aria-busy') === 'true');
  await dp.waitForFunction(() => /saved as PDF/.test(document.querySelector('#toasts')?.innerText || ''));
  const st = await dp.evaluate(() => window.__pdf);
  check('pdf-ui: System Health PDF goes through pdf_render with a DeckChek_SystemHealth name', st.renders.length === 1 && /^DeckChek_SystemHealth_.*\.pdf$/.test(st.saves[0].defaultPath) && /Serato DJ Pro crashed/.test(st.renders[0].html), st.saves[0]?.defaultPath);
  check('pdf-ui: button re-enabled and toast shows page count', await dp.locator('#sys-export-pdf').isEnabled() && /3 pages/.test(await dp.locator('#toasts').innerText()));

  // GAP-16: saved toast offers Open / Show in folder for the written file
  await dp.locator('#toasts .toast-success button', { hasText: 'Show in folder' }).click();
  await dp.locator('#toasts').getByRole('button', { name: 'Open' }).click().catch(() => {});
  const opened = await dp.evaluate(() => window.__pdf.paths);
  check('pdf-ui: saved toast has Show in folder (and Open) for the written PDF', opened.some(([c, p]) => c === 'reveal_path' && /DeckChek_SystemHealth_.*\.pdf$/.test(p)), JSON.stringify(opened));
  // GAP-09: a timeout offers Retry, which exports again
  await dp.evaluate(() => { window.__pdf.mode = 'timeout'; document.getElementById('toasts').replaceChildren(); });
  await dp.click('#sys-export-pdf');
  await dp.locator('#toasts .toast-error button', { hasText: 'Retry' }).waitFor();
  check('pdf-ui: a PDF timeout offers Retry beside Export HTML instead', await dp.locator('#toasts .toast-error button', { hasText: 'Export HTML instead' }).count() === 1);
  await dp.evaluate(() => { window.__pdf.mode = 'ok'; });
  const before = await dp.evaluate(() => window.__pdf.renders.length);
  await dp.locator('#toasts .toast-error button', { hasText: 'Retry' }).click();
  await dp.waitForFunction(n => window.__pdf.renders.length > n, before);
  await dp.waitForFunction(() => /saved as PDF/.test(document.querySelector('#toasts')?.innerText || ''));
  check('pdf-ui: Retry runs the export again and succeeds', true);

  await dp.evaluate(() => { window.__pdf.mode = 'io'; });
  const [dl] = await Promise.all([dp.waitForEvent('download'), (async () => {
    await dp.click('#sys-export-pdf');
    await dp.locator('#toasts .toast-error button', { hasText: 'Export HTML instead' }).click();
  })()]);
  check('pdf-ui: a failed PDF reports the error and offers Export HTML instead', /system-health.*\.html$/.test(dl.suggestedFilename()));
  await dctx.close();
  return errors;
}
