// M5 integration smoke: Options/Help support entries, error-toast Details, support dialog styling,
// confirmDialog rapid cancel/reopen, live feature-flag rail entry, History test medium.
import { watchConsole } from './core.mjs';

export default async function run({ browser, base, check }) {
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  errors.push(...watchConsole(page, 'integration'));
  await page.goto(base);
  await page.waitForSelector('.rail-item');

  // ----- Options > Support -----
  await page.click('#cdlOptionsBtn');
  await page.waitForSelector('#cdlOptionsDialog [data-support-entry]');
  await page.click('#cdlOptionsDialog [data-support-id="diagnostics"]');
  await page.waitForSelector('dialog.diag-dialog[open]');
  check('support: Options > Support opens the diagnostics dialog and closes Options', (await page.locator('#cdlOptionsDialog[open]').count()) === 0);
  const inline = await page.evaluate(() => [...document.querySelectorAll('dialog.diag-dialog [style]')].map(e => e.className));
  check('support: dialog uses diagnostics.css, no inline styles', inline.length === 0, inline.join(','));
  const parts = await page.evaluate(() => { const ul = document.querySelector('.diag-parts'); return ul ? getComputedStyle(ul).display + '/' + getComputedStyle(ul).listStyleType : null; });
  check('support: diagnostics.css applies to the parts list', parts === 'grid/none', String(parts));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.diag-dialog'));

  // ----- Help entries (links go through the FS-07 helper) -----
  await page.click('#helpBtn');
  await page.waitForSelector('#helpDialog [data-support-entry]');
  const labels = await page.locator('#helpDialog [data-support-entry] button').allInnerTexts();
  check('help: Support entries list diagnostics, GitHub issues and releases', labels.some(l => /diagnostics/i.test(l)) && labels.some(l => /issue/i.test(l)) && labels.some(l => /Releases/i.test(l)), labels.join(' | '));
  const [popup] = await Promise.all([context.waitForEvent('page', { timeout: 5000 }).catch(() => null), page.click('#helpDialog [data-support-id="releases"]')]);
  const openedUrl = popup ? popup.url() : '';
  if (popup) await popup.close().catch(() => {});
  check('help: Releases link opens the allowlisted GitHub URL without a prompt', /^https:\/\/github\.com\/.+\/releases$/.test(openedUrl) || (popup && /github\.com/.test(openedUrl)), openedUrl);

  // ----- error toast Details -----
  await page.evaluate(async () => { const m = await import('./ui/live.js'); m.toast('Something failed', { type: 'error' }); });
  await page.waitForSelector('.toast-error .toast-details');
  await page.click('.toast-error .toast-details');
  await page.waitForSelector('dialog.diag-dialog[open]');
  check('toast: error toast Details opens the support dialog and dismisses the toast', (await page.locator('.toast-error').count()) === 0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.diag-dialog'));
  await page.evaluate(async () => { const m = await import('./ui/live.js'); m.toast('Fine', { type: 'info' }); });
  check('toast: info toasts have no Details action', (await page.locator('.toast-info .toast-details').count()) === 0);

  // ----- confirmDialog rapid cancel / reopen -----
  const confirmResult = await page.evaluate(async () => {
    const { confirmDialog } = await import('./ui/shell.js');
    const first = confirmDialog({ title: 'First', body: 'a' });
    document.getElementById('confirm-cancel').click();       // close event is queued, not yet dispatched
    const second = confirmDialog({ title: 'Second', body: 'b' });
    await new Promise(r => setTimeout(r, 50));
    const stillOpen = document.getElementById('confirm-dialog').open;
    const firstValue = await first;
    let secondSettled = false;
    second.then(() => { secondSettled = true; });
    await new Promise(r => setTimeout(r, 20));
    const settledEarly = secondSettled;
    document.getElementById('confirm-ok').click();
    return { stillOpen, firstValue, settledEarly, secondValue: await second };
  });
  check('confirm: stale close event does not settle the reopened dialog', confirmResult.stillOpen && confirmResult.firstValue === false && !confirmResult.settledEarly && confirmResult.secondValue === true, JSON.stringify(confirmResult));

  // ----- Options > Experimental features (FS-00 AC-4): toggle every wired flag from the panel -----
  const rail = id => page.locator(`.rail-item[data-screen="${id}"]`).count();
  const openPanel = async () => {
    await page.click('#cdlOptionsBtn');
    await page.waitForSelector('#cdlOptionsDialog [data-support-id="experimental"]');
    await page.click('#cdlOptionsDialog [data-support-id="experimental"]');
    await page.waitForSelector('dialog.experimental-dialog[open]');
  };
  await openPanel();
  const listed = await page.locator('dialog.experimental-dialog [data-feature]').evaluateAll(els => els.map(e => e.dataset.feature));
  check('experimental: panel lists the wired flags only', listed.includes('pregig') && listed.includes('humHunter') && !listed.includes('fleet') && !listed.includes('diagnosticsBundle'), listed.join(','));
  check('experimental: ships-off flags carry the Experimental chip', (await page.locator('dialog.experimental-dialog .experimental-chip').count()) >= 7);
  check('experimental: test media is on by default, M6 screens are hidden', (await rail('media')) === 1 && (await rail('pregig')) === 0 && (await rail('hum')) === 0);
  const M6 = [['pregig', 'pregig'], ['latencyTuner', 'latency'], ['stylusWear', 'stylus'], ['wearMap', 'vinylscan'], ['scratchTest', 'scratch'], ['humHunter', 'hum'], ['testMedia', 'media']];
  for (const [flag, screen] of M6) {
    const box = page.locator(`dialog.experimental-dialog [data-feature="${flag}"]`);
    const was = await rail(screen);
    if (was) await box.uncheck(); else await box.check();
    const flipped = await rail(screen);
    if (!was) { /* leave on; open the screen below */ } else await box.check();
    check(`experimental: toggling ${flag} flips the ${screen} rail entry live`, flipped === (was ? 0 : 1) && (await rail(screen)) === 1, `${was}/${flipped}`);
  }
  await page.click('[data-experimental-close]');
  await page.waitForFunction(() => !document.querySelector('dialog.experimental-dialog'));
  for (const [, screen] of M6) {
    await page.click(`.rail-item[data-screen="${screen}"]`);
    await page.waitForSelector(`#screen-${screen}:not([hidden]) h1`);
    check(`experimental: ${screen} screen renders after enabling`, (await page.locator(`#screen-${screen} h1`).first().innerText()).length > 0);
  }
  await openPanel();
  await page.click('dialog.experimental-dialog [data-feature-reset]');
  check('experimental: Reset to defaults restores the shipped rail', (await rail('pregig')) === 0 && (await rail('hum')) === 0 && (await rail('media')) === 1);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.experimental-dialog'));
  await page.evaluate(async () => { (await import('./features.js')).setEnabled('testMedia', false); });
  check('features: testMedia can be switched off without reload', (await rail('media')) === 0);

  // ----- History shows the test medium (FS-06 AC-6) -----
  await page.evaluate(async () => { (await import('./features.js')).setEnabled('testMedia', true); });
  await page.evaluate(async () => {
    const { store, workspace, saveWorkspace } = await import('./ui/state.js');
    const runRec = { id: 'run-media-1', test: 'Speed', workflowId: 'speed', createdAt: '2026-10-10T10:00:00Z', score: 90, measurements: [], findings: [], device: 'Deck', params: { testMedium: 'ortofon-test-record' }, config: {} };
    workspace.runs.unshift(runRec); saveWorkspace();
    await store.saveRun(runRec);
  });
  await page.click('.rail-item[data-screen="history"]');
  await page.waitForSelector('#hist-rows button, #hist-rows .hist-open, #hist-rows li');
  await page.locator('#hist-rows').getByText('Speed').first().click();
  await page.waitForSelector('[data-test-medium]');
  check('history: run detail names the test medium used', /Ortofon/.test(await page.locator('[data-test-medium]').innerText()));

  await context.close();
  return errors;
}
