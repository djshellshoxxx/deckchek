// FS-02 smoke: diagnostics dialog in browser mode (zip download) and mocked desktop mode
// (crash prompt, preview, save, create, report link).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tauriMock, watchConsole } from './core.mjs';

export default async function run({ browser, base, tmp, check }) {
  const errors = [];

  // ----- browser mode -----
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await context.newPage();
  errors.push(...watchConsole(page, 'diag-browser'));
  await page.goto(base);
  await page.waitForSelector('.rail-item');
  await page.keyboard.press('Control+Shift+D');
  await page.waitForSelector('dialog.diag-dialog[open]');
  await page.waitForSelector('.diag-parts li');
  const txt = await page.locator('dialog.diag-dialog').innerText();
  check('diag: Ctrl+Shift+D opens the dialog with a parts preview', /manifest\.json/.test(txt) && /settings\.json/.test(txt) && /no audio/.test(txt));
  check('diag: redact is on by default', await page.isChecked('#diag-redact'));
  check('diag: browser mode says logs are desktop-only', /Logs are kept by the desktop app/.test(txt));
  await page.click('dialog.diag-dialog summary');
  check('diag: summary text is viewable', /DeckChek diagnostics summary/.test(await page.locator('dialog.diag-dialog pre').innerText()));
  await page.uncheck('#diag-redact');
  await page.waitForTimeout(200);
  await page.check('#diag-redact');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  check('diag: Enter creates; file is named deckchek-diagnostics-YYYYMMDD-HHmm.zip', /^deckchek-diagnostics-\d{8}-\d{4}\.zip$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const zipPath = path.join(tmp, 'diag-browser.zip');
  await dl.saveAs(zipPath);
  const py = spawnSync('python3', ['-I', '-c', 'import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(json.dumps(z.namelist()))', zipPath], { encoding: 'utf8' });
  if (py.error) check('diag: downloaded zip is valid (python3 unavailable, skipped)', fs.statSync(zipPath).size > 100);
  else {
    const names = py.status === 0 ? JSON.parse(py.stdout) : [];
    check('diag: downloaded zip is valid, manifest first, no logs or audio', names[0] === 'manifest.json' && names.includes('settings.json') && !names.some(n => /^logs\/|\.(wav|f32)$/.test(n)), py.stderr || py.stdout);
  }
  await page.waitForSelector('#diag-report', { state: 'visible' });
  check('diag: success state offers Report on GitHub', /Downloaded deckchek-diagnostics/.test(await page.locator('dialog.diag-dialog').innerText()));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.diag-dialog'));
  await context.close();

  // ----- desktop mode (mocked invoke) -----
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await dctx.addInitScript(tauriMock);
  await dctx.addInitScript(() => {
    const real = window.__TAURI__.core.invoke;
    window.__diag = { calls: [], crashed: true, opened: [], saveCancel: false };
    const parts = [{ name: 'manifest.json', sizeBytes: 300, status: 'ok' }, { name: 'summary.txt', sizeBytes: 500, status: 'ok' }, { name: 'system-health.json', sizeBytes: 0, status: 'skipped', note: 'System Health scan unsupported or not run' }];
    window.__TAURI__.core.invoke = async (cmd, args) => {
      if (cmd === 'open_external_url') { window.__diag.opened.push(args.url); return { opened: true, host: 'github.com', allowlisted: true }; }
      if (!/^(diagnostics_|log_client_error)/.test(cmd)) return real(cmd, args);
      window.__diag.calls.push([cmd, args]);
      if (cmd === 'diagnostics_status') return { crashedLastRun: window.__diag.crashed, markerAt: '2026-10-10T10:00:00Z', logDir: '/mock/logs', logFiles: [] };
      if (cmd === 'diagnostics_ack_crash') { window.__diag.crashed = false; return null; }
      if (cmd === 'diagnostics_preview') return { summaryText: 'DeckChek diagnostics summary\nApp version: 0.0.5\n', parts };
      if (cmd === 'diagnostics_create_bundle') return { path: args.destPath, sizeBytes: 4096, parts };
      return null;
    };
    window.__TAURI__.dialog = { save: async o => { window.__diag.saveOpts = o; return window.__diag.saveCancel ? null : 'C:\\Users\\x\\Desktop\\' + o.defaultPath; } };
  });
  const d = await dctx.newPage();
  errors.push(...watchConsole(d, 'diag-desktop'));
  await d.goto(base);
  await d.waitForSelector('dialog.diag-crash[open]');
  check('diag: crash marker shows "DeckChek closed unexpectedly"', /closed unexpectedly/.test(await d.locator('dialog.diag-crash').innerText()) && /nothing is sent automatically/.test(await d.locator('dialog.diag-crash').innerText()));
  await d.click('#diag-crash-create');
  await d.waitForSelector('dialog.diag-dialog[open] .diag-parts li');
  const acked = await d.evaluate(() => window.__diag.calls.some(c => c[0] === 'diagnostics_ack_crash'));
  check('diag: marker is acknowledged when choosing Create', acked);
  const pv = await d.evaluate(() => window.__diag.calls.filter(c => c[0] === 'diagnostics_preview').at(-1)[1]);
  check('diag: preview passes opts.context {system, settings}', pv.opts.redact === true && pv.opts.context && typeof pv.opts.context.system === 'object' && typeof pv.opts.context.settings === 'object', JSON.stringify(Object.keys(pv.opts.context || {})));
  check('diag: partial state lists what is not included', /Not included: system-health\.json/.test(await d.locator('dialog.diag-dialog').innerText()));

  await d.evaluate(() => { window.__diag.saveCancel = true; });
  await d.click('#diag-create');
  await d.waitForTimeout(250);
  check('diag: cancelling the save dialog is silent', await d.locator('#diag-create').isVisible() && !(await d.evaluate(() => window.__diag.calls.some(c => c[0] === 'diagnostics_create_bundle'))) && !(await d.locator('.diag-error').count()));

  await d.evaluate(() => { window.__diag.saveCancel = false; });
  await d.uncheck('#diag-redact');
  await d.check('#diag-runs');
  await d.waitForTimeout(250);
  await d.click('#diag-create');
  await d.waitForSelector('.diag-saved');
  const cb = await d.evaluate(() => window.__diag.calls.filter(c => c[0] === 'diagnostics_create_bundle').at(-1)[1]);
  const so = await d.evaluate(() => window.__diag.saveOpts);
  check('diag: save dialog proposes the timestamped .zip name', /^deckchek-diagnostics-\d{8}-\d{4}\.zip$/.test(so.defaultPath) && so.filters[0].extensions[0] === 'zip', so.defaultPath);
  check('diag: create_bundle gets destPath, redact=false, runCount=10 and context', /\.zip$/.test(cb.destPath) && cb.opts.redact === false && cb.opts.runCount === 10 && !!cb.opts.context.settings);
  check('diag: success shows path, Show in folder and Copy path', /Saved to C:/.test(await d.locator('.diag-saved').innerText()) && await d.getByRole('button', { name: 'Show in folder' }).isVisible() && await d.getByRole('button', { name: 'Copy path' }).isVisible());

  await d.click('#diag-report');
  await d.waitForTimeout(300);
  const url = await d.evaluate(() => window.__diag.opened.at(-1));
  const u = new URL(url || 'about:blank');
  check('diag: Report on GitHub opens github.com issues/new via the link module', u.hostname === 'github.com' && u.pathname === '/djshellshoxxx/deckchek/issues/new', url);
  const body = u.searchParams.get('body') || '';
  check('diag: issue body is the summary text only, under 6000 chars, no log lines', body.length < 6000 && /DeckChek diagnostics summary/.test(body) && !/ERROR js|deckchek\.log/.test(body));
  await d.keyboard.press('Escape');
  await d.waitForFunction(() => !document.querySelector('dialog.diag-dialog'));
  await dctx.close();

  return errors;
}
