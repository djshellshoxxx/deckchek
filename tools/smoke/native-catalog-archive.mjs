// Production native Data controls with deterministic IPC responses. This exercises
// browser file selection/downloads and lifecycle; SQLite is covered by native tests.
import { watchConsole, tauriMock, setViewport } from './core.mjs';
import fs from 'node:fs';
import path from 'node:path';

export default async function run({ browser, base, tmp, SHOTS, check }) {
  const raw = fs.readFileSync(new URL('../../tests/contracts/native-setup-catalog.json', import.meta.url), 'utf8');
  const tables = { manufacturer: 1, venue: 1, product: 2, booth: 1, deck_position: 1,
    support_configuration: 1, asset: 2, asset_settings_snapshot: 2, setup: 2, setup_component: 3 };
  const counts = { tables, total: 16 }, calls = [];
  let stored = false, commits = 0, releaseImport;
  const importGate = new Promise(resolve => { releaseImport = resolve; });
  const preview = conflict => ({ counts, toImport: conflict ? 15 : stored ? 0 : 16, alreadyPresent: !conflict && stored ? 16 : 0,
    reusedDependencies: 0, canImport: !conflict, conflictCount: conflict ? 1 : 0,
    conflicts: conflict ? [{ table: 'setup', id: 'setup-a', reason: 'saved component values differ' }] : [],
    dependencyReuses: [], warningCount: 0, warnings: [] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.exposeBinding('__nativeCatalogSmokeCommand', async (_source, command, args) => {
    calls.push({ command, args });
    if (command === 'catalog_archive_setups') return [{ id: 'setup-a', name: 'Setup <img id="native-setup-injection" src=x> café' }, { id: 'setup-b', name: 'Second setup' }];
    if (command === 'catalog_archive_export') return { text: raw, counts };
    if (command === 'catalog_archive_preview') return preview(args.text.includes('native-smoke-conflict'));
    if (command === 'catalog_archive_import') {
      if (args.text !== raw) throw Error('Raw file text changed before native IPC');
      const inserted = stored ? 0 : 16;
      if (!stored) { stored = true; commits++; await importGate; }
      return { inserted, alreadyPresent: 16 - inserted, reusedDependencies: 0, counts };
    }
    throw Error('Unexpected native catalog command');
  });
  await context.addInitScript(tauriMock);
  await context.addInitScript(() => {
    const original = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (command, args) => {
      if (command.startsWith('catalog_archive_')) return window.__nativeCatalogSmokeCommand(command, args);
      if (command === 'backup_list') return Promise.resolve([]);
      if (command === 'backup_settings_get') return Promise.resolve({ mode: 'off', keep: 7 });
      return original(command, args);
    };
  });
  const page = await context.newPage(), errors = watchConsole(page, 'native-catalog');
  const openData = async () => {
    await page.click('.rail-item[data-screen="data"]');
    await page.waitForSelector('#data-native-catalog-archive #native-catalog-setup-1');
  };
  try {
    await page.goto(base); await page.waitForSelector('.rail-item[data-screen="data"]'); await openData();
    const browserCatalogBefore = await page.evaluate(() => localStorage.getItem('deckchek.catalog.v1'));
    check('native catalog: native-only card retains full-backup controls and requires selected setups',
      await page.locator('#data-backup-now, #data-restore').count() === 2
      && await page.locator('#data-catalog-archive').count() === 0 && await page.locator('#native-catalog-export').isDisabled());
    await page.check('#native-catalog-setup-0'); await page.check('#native-catalog-setup-1');
    const waiting = page.waitForEvent('download'); await page.click('#native-catalog-export');
    const download = await waiting, file = path.join(tmp, 'native-setup-catalog.json'); await download.saveAs(file);
    check('native catalog: actual download keeps every raw byte including large SQLite integers',
      fs.readFileSync(file, 'utf8') === raw && raw.includes('9007199254740993')
      && JSON.stringify(calls.find(call => call.command === 'catalog_archive_export').args.setupIds) === JSON.stringify(['setup-a', 'setup-b']));
    await page.locator('#native-catalog-file').setInputFiles({ name: 'Native <img id="native-file-injection" src=x>.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
    await page.waitForFunction(() => /New records: 16/.test(document.querySelector('#native-catalog-preview')?.textContent || ''));
    check('native catalog: preview is explicit, escaped and performs no import',
      commits === 0 && await page.locator('#native-catalog-import').isEnabled()
      && await page.locator('#native-file-injection, #native-setup-injection').count() === 0);
    await page.click('#native-catalog-import');
    await page.waitForFunction(() => document.querySelector('#data-restore')?.disabled === true);
    check('native catalog: dispatched import excludes concurrent Data writes',
      await page.locator('#data-backup-now').isDisabled() && await page.locator('#data-import-json').isDisabled()
      && await page.locator('#native-catalog-file').isDisabled());
    releaseImport(); await page.waitForFunction(() => /Added 16 records/.test(document.querySelector('#native-catalog-status')?.textContent || ''));
    check('native catalog: success preserves raw IPC text and browser catalog bytes',
      commits === 1 && calls.find(call => call.command === 'catalog_archive_import').args.text === raw
      && await page.evaluate(() => localStorage.getItem('deckchek.catalog.v1')) === browserCatalogBefore);
    await page.reload(); await page.waitForSelector('.rail-item[data-screen="data"]'); await openData();
    await page.locator('#native-catalog-file').setInputFiles(file);
    await page.waitForFunction(() => /Exact records already present: 16/.test(document.querySelector('#native-catalog-preview')?.textContent || ''));
    await page.click('#native-catalog-import'); await page.waitForFunction(() => /Added 0 records/.test(document.querySelector('#native-catalog-status')?.textContent || ''));
    check('native catalog: unchanged retry after page reload adds no records', commits === 1);
    await page.locator('#native-catalog-file').setInputFiles({ name: 'conflicting.json', mimeType: 'application/json', buffer: Buffer.from(raw.replace('setup notes', 'native-smoke-conflict')) });
    await page.waitForFunction(() => /Conflicts: 1/.test(document.querySelector('#native-catalog-preview')?.textContent || ''));
    check('native catalog: conflicts disable the entire import', await page.locator('#native-catalog-import').isDisabled() && commits === 1);
    const previousPreviews = calls.filter(call => call.command === 'catalog_archive_preview').length;
    await page.locator('#native-catalog-file').setInputFiles({ name: 'invalid-utf8.json', mimeType: 'application/json', buffer: Buffer.from([0xc0, 0xaf]) });
    await page.waitForFunction(() => /Could not read/.test(document.querySelector('#native-catalog-status')?.textContent || ''));
    check('native catalog: invalid UTF-8 is refused before native preview', calls.filter(call => call.command === 'catalog_archive_preview').length === previousPreviews);
    await setViewport(page, { width: 420, height: 900 });
    check('native catalog: controls fit the phone-width fallback', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(SHOTS, 'native-catalog-archive.png'), fullPage: false });
  } finally { releaseImport(); await context.close(); }
  return errors;
}
