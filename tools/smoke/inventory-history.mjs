// Actual app UI with modeled native readers. No hardware or native database qualification.
import path from 'node:path';
import { tauriMock, watchConsole } from './core.mjs';

function inventoryMock() {
  if (window.top !== window) return;
  localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { gearLedger: true, humHunter: true }, setupWizardDone: true }));
  const before = window.__TAURI__.core.invoke;
  const state = window.__inventoryHistory = { hum: null, failCommand: 'ledger_public_notes', writes: 0 };
  window.__TAURI__.core.invoke = async (command, args) => {
    if (command === state.failCommand) throw new Error('Inventory temporarily unavailable');
    if (command === 'hum_run_list') return state.hum;
    if (['ledger_public_notes', 'ledger_customer_units', 'maintenance_list', 'certificate_list', 'ledger_export_list', 'photo_list'].includes(command)) return [];
    if (command === 'ledger_next_revision') return 1;
    if (['ledger_write_folder', 'ledger_export_record', 'userfiles_write_folder', 'userfiles_write_text'].includes(command)) {
      state.writes++; throw new Error('Unexpected write during unavailable-inventory checks');
    }
    return before(command, args);
  };
}

export default async function run({ browser, base, check, SHOTS }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(tauriMock); await ctx.addInitScript(inventoryMock);
  const page = await ctx.newPage(), errors = watchConsole(page, 'inventory-history');
  try {
    await page.goto(base);
    await page.click('.rail-item[data-screen="history"]');
    await page.waitForSelector('#hist-load-warning:not([hidden])');
    check('history inventory: unavailable source is persistent and does not claim empty history',
      /Hum hunter could not be loaded/.test(await page.locator('#hist-load-warning').innerText())
      && !/No saved runs yet/.test(await page.locator('#hist-rows').innerText())
      && await page.locator('#hist-count').innerText() === '0 of 0 loaded');
    await page.screenshot({ path: path.join(SHOTS, 'history-incomplete.png') });
    await page.evaluate(() => { window.__inventoryHistory.hum = [{ id: 'valid', createdAt: '2026-11-20T12:00:00Z' }, null]; });
    await page.locator('#hist-load-warning button').click();
    await page.waitForSelector('[data-run-type="hum"]');
    check('history inventory: valid rows survive with visible omission count',
      await page.locator('[data-run-type="hum"]').count() === 1
      && /1 invalid record/.test(await page.locator('#hist-load-warning').innerText())
      && await page.locator('#hist-count').innerText() === '1 of 1 loaded');
    await page.locator('#hist-search').fill('no matching run');
    check('history inventory: filtering preserves the incomplete notice',
      /No loaded runs match/.test(await page.locator('#hist-rows').innerText()) && await page.locator('#hist-load-warning').isVisible());
    await page.evaluate(() => { window.__inventoryHistory.hum = []; });
    await page.locator('#hist-load-warning button').click();
    await page.waitForSelector('#hist-load-warning', { state: 'hidden' });
    check('history inventory: retry distinguishes a confirmed empty list', /No saved runs yet/.test(await page.locator('#hist-rows').innerText()));

    await page.click('.rail-item[data-screen="ledger"]');
    await page.waitForSelector('#ledger-error');
    await page.keyboard.press('Control+e');
    check('ledger inventory: failed enumeration shows retry and blocks export', await page.locator('#ledger-error').isVisible()
      && await page.locator('#ledger-export').count() === 0 && await page.evaluate(() => window.__inventoryHistory.writes) === 0);
    await page.screenshot({ path: path.join(SHOTS, 'ledger-inventory-error.png') });
    await page.evaluate(() => { window.__inventoryHistory.failCommand = null; });
    await page.locator('#ledger-error button').click();
    await page.waitForSelector('#ledger-gear input');
    check('ledger inventory: retry restores the actual gear selection', await page.locator('#ledger-error').count() === 0);
    await page.locator('#ledger-gear input').first().check();
    await page.locator('#ledger-next-privacy').click(); await page.locator('#ledger-next-preview').click();
    await page.waitForSelector('#ledger-summary');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__inventoryHistory.failCommand = 'certificate_list'; });
    await page.click('.rail-item[data-screen="history"]'); await page.click('.rail-item[data-screen="ledger"]');
    await page.waitForSelector('#ledger-error'); await page.keyboard.press('Control+e');
    check('ledger inventory: a failed refresh cannot export the cached preview', await page.locator('#ledger-error').isVisible()
      && await page.locator('#ledger-export').count() === 0 && await page.evaluate(() => window.__inventoryHistory.writes) === 0);
    await page.evaluate(() => { window.__inventoryHistory.failCommand = null; });
    await page.locator('#ledger-error button').click(); await page.waitForSelector('#ledger-gear input');
    await page.locator('#ledger-next-privacy').click(); await page.locator('#ledger-next-preview').click();
    await page.waitForSelector('#ledger-summary');
    await page.evaluate(() => { window.__inventoryHistory.failCommand = 'photo_list'; });
    await page.keyboard.press('Control+e'); await page.waitForSelector('#ledger-export'); await page.keyboard.press('Control+e');
    await page.waitForFunction(() => document.getElementById('ledger-status')?.textContent.includes('Export failed'));
    check('ledger inventory: unknown photo inventory stops the final build before any write',
      /Inventory temporarily unavailable/.test(await page.locator('#ledger-status').innerText())
      && await page.evaluate(() => window.__inventoryHistory.writes) === 0 && await page.locator('#ledger-success').count() === 0);
  } finally { await ctx.close(); }
  return errors;
}
