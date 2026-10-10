// FS-08 smoke: Data & backup screen. Browser mode shows only the JSON workspace actions; desktop mode (mocked
// invoke + dialogs) covers back up, the restore confirmation, the capture_running error and workspace import.
import { watchConsole, tauriMock } from './core.mjs';

function backupMock() {
  const calls = []; let captureBlocked = true; const entries = [];
  const core = window.__TAURI__.core; const base = core.invoke;
  const manifest = { format: 'deckchek-backup', formatVersion: 1, createdAt: '2026-03-04T10:20:00Z', kind: 'manual', appVersion: '0.0.5', schemaVersion: 3, counts: { runs: 12, assets: 4, profiles: 2, midiMaps: 1 }, files: [] };
  core.invoke = async (cmd, args) => {
    if (!cmd.startsWith('backup_')) return base(cmd, args);
    calls.push({ cmd, args });
    if (cmd === 'backup_list') return entries.slice();
    if (cmd === 'backup_settings_get') return { mode: 'off', keep: 7, lastAutoAt: null, lastAutoMs: null };
    if (cmd === 'backup_settings_set') return { ...args.settings, lastAutoAt: null, lastAutoMs: null };
    if (cmd === 'backup_create') { const e = { name: 'x.deckchek-backup', path: args.destPath, kind: 'manual', createdAt: '2026-03-04T10:20:00Z', bytes: 3200000 }; entries.unshift(e); return { path: args.destPath, bytes: 3200000, createdAt: e.createdAt, kind: 'manual', counts: { runs: 12, assets: 4, profiles: 2, midiMaps: 1 }, schemaVersion: 3 }; }
    if (cmd === 'backup_inspect') return { valid: true, errors: [], errorCode: null, manifest, counts: manifest.counts, needsMigration: false, tooNew: false, currentSchemaVersion: 3 };
    if (cmd === 'backup_restore') {
      if (!args.confirm) throw { code: 'not_confirmed', message: 'no' };
      if (captureBlocked) { captureBlocked = false; throw { code: 'capture_running', message: 'Stop the capture before restoring.' }; }
      return { restoredFrom: args.path, upgradedFrom: null, schemaVersion: 3, safetyBackup: '/mock/backups/auto-pre-restore.deckchek-backup', settings: { theme: 'light' }, calibrationProfiles: null, warnings: [] };
    }
    if (cmd === 'backup_import_workspace') return { runsImported: args.json.runs.length, runsSkipped: 0, runsInvalid: 0, equipmentImported: args.json.equipment.length };
    throw `unknown command ${cmd}`;
  };
  window.__TAURI__.dialog = { save: async () => '/mock/out/DeckChek-backup-test.deckchek-backup', open: async () => '/mock/in/old.deckchek-backup' };
  window.__backupCalls = calls;
}

export default async function run({ browser, base, check, SHOTS, tmp }) {
  const errors = [];
  const fs = await import('node:fs'); const path = await import('node:path');
  const shot = async (page, name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

  // ----- browser mode -----
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const b = await bctx.newPage();
  errors.push(...watchConsole(b, 'backup-browser'));
  await b.goto(base);
  await b.waitForSelector('.rail-item');
  await b.click('.rail-item[data-screen="data"]');
  await b.waitForSelector('#screen-data:not([hidden]) #data-export-json');
  check('backup: browser mode explains backup files need the desktop app', /desktop app/.test(await b.locator('#data-unsupported').innerText()));
  check('backup: browser mode shows only the JSON actions', (await b.locator('#data-backup-now, #data-restore').count()) === 0 && (await b.locator('#data-import-json').count()) === 1);
  await shot(b, 'backup-browser');
  await bctx.close();

  // ----- desktop mode -----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(tauriMock);
  await ctx.addInitScript(backupMock);
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'backup'));
  await page.goto(base);
  await page.waitForSelector('.rail-item');
  await page.click('.rail-item[data-screen="data"]');
  await page.waitForSelector('#screen-data:not([hidden]) #data-backup-now');
  check('backup: empty state tells the user to back up', /No backups yet/.test(await page.locator('#data-last').innerText()));
  check('backup: Backup now, Restore and Import are present', (await page.locator('#data-backup-now, #data-restore, #data-import-json').count()) === 3);

  await page.click('#data-backup-now');
  await page.waitForFunction(() => /Backup saved/.test(document.querySelector('#data-status')?.innerText || ''));
  check('backup: success message shows size and run count', /3\.1 MB, 12 run/.test(await page.locator('#data-status').innerText()), await page.locator('#data-status').innerText());
  const create = await page.evaluate(() => window.__backupCalls.find(c => c.cmd === 'backup_create'));
  check('backup: create passes the chosen path, manual kind and settings blob', create.args.destPath.endsWith('.deckchek-backup') && create.args.kind === 'manual' && create.args.settings && 'ui' in create.args.settings && 'calibration' in create.args.settings);
  check('backup: list shows the new backup', (await page.locator('#data-backups li').count()) === 1);

  // restore confirmation
  await page.click('#data-restore');
  await page.waitForSelector('dialog.data-dialog[open] #restore-confirm');
  const body = await page.locator('#restore-body').innerText();
  check('restore: preview shows counts and app version', /12 runs/.test(body) && /0\.0\.5/.test(body), body.slice(0, 120));
  check('restore: lists what is replaced', /current database/.test(await page.locator('#restore-replaces').innerText()));
  check('restore: says a safety backup is taken first', /safety backup/i.test(await page.locator('#restore-safety').innerText()));
  check('restore: confirm is disabled until the box is ticked', await page.locator('#restore-confirm').isDisabled());
  check('restore: Cancel has focus', await page.evaluate(() => document.activeElement?.id === 'restore-cancel'));
  await shot(page, 'backup-restore-dialog');
  await page.check('#restore-ack');
  check('restore: ticking enables the destructive button with a text label', !(await page.locator('#restore-confirm').isDisabled()) && /Replace current data/.test(await page.locator('#restore-confirm').innerText()));
  await page.click('#restore-confirm');
  await page.waitForFunction(() => /capture is running/i.test(document.querySelector('#restore-error')?.innerText || ''));
  check('restore: capture_running shows a friendly message and keeps the dialog open', (await page.locator('dialog.data-dialog[open]').count()) === 1 && /Stop the capture/.test(await page.locator('#restore-error').innerText()));
  await shot(page, 'backup-capture-running');
  await page.click('#restore-confirm');
  await page.waitForFunction(() => /Restore complete/.test(document.querySelector('#data-status')?.innerText || ''), null, { timeout: 4000 }).catch(() => {});
  const restore = await page.evaluate(() => window.__backupCalls.filter(c => c.cmd === 'backup_restore').map(c => c.args));
  check('restore: only calls Rust with confirm:true', restore.length === 2 && restore.every(a => a.confirm === true));
  await page.waitForLoadState('load');
  check('restore: restored UI settings were written before reload', await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.ui.v1') || '{}').theme === 'light'));
  await ctx.close();

  // ----- workspace import (desktop) -----
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.addInitScript(tauriMock);
  await ctx2.addInitScript(backupMock);
  const p2 = await ctx2.newPage();
  errors.push(...watchConsole(p2, 'backup-ws'));
  await p2.goto(base);
  await p2.waitForSelector('.rail-item');
  await p2.click('.rail-item[data-screen="data"]');
  await p2.waitForSelector('#data-import-json');
  const wsFile = path.join(tmp, 'deckchek-workspace.json');
  fs.writeFileSync(wsFile, JSON.stringify({ version: 1, equipment: [{ id: 'e1', name: 'Deck' }], runs: [{ id: 'r1', test: 'speed', createdAt: '2026-01-01T00:00:00Z', measurements: [], findings: [] }, { id: 'r1' }] }));
  const chooser = p2.waitForEvent('filechooser');
  await p2.click('#data-import-json');
  await (await chooser).setFiles(wsFile);
  await p2.waitForSelector('dialog.data-dialog[open] h2');
  check('workspace: preview counts runs (duplicates dropped) and equipment', /1 run\(s\) and 1 equipment/.test(await p2.locator('dialog.data-dialog').innerText()));
  await p2.click('dialog.data-dialog .btn-primary');
  await p2.waitForFunction(() => /Imported 1 run/.test(document.querySelector('#data-status')?.innerText || ''));
  check('workspace: import calls Rust once with the mapped payload', await p2.evaluate(() => window.__backupCalls.filter(c => c.cmd === 'backup_import_workspace').length === 1));
  await ctx2.close();
  return errors;
}
