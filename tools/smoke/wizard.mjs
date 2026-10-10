// FS-01 smoke: first-run setup wizard, browser mode and mocked Windows desktop mode.
// Screenshots every step in dark and light (wizard-<step>-<theme>.png in SHOTS) and proves the test tone and the
// level-check capture always stop (Back, Skip step, Esc, dialog close, tab hide, start error, finishing).
import path from 'node:path';
import { tauriMock, watchConsole, a11yAudit } from './core.mjs';
import { loopbackStimulus, analyzeLoopback } from '../../app/calibration.js';

const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Runs in the page before app code: opt this profile into the wizard (other suites are bypassed under automation)
// and record every AudioContext so a test can prove it was closed.
function wizardPageSetup() {
  try { localStorage.setItem('deckchek.wizard.e2e', '1'); } catch { /* storage blocked */ }
  const Orig = window.AudioContext;
  window.__ctxs = [];
  window.AudioContext = class extends Orig { constructor(...a) { super(...a); window.__ctxs.push(this); } };
}

// Runs after tauriMock: wizard commands, a device_profiles_sync that honours createAssets, capture failure switch.
function wizardNativeMock() {
  const inv = window.__TAURI__.core.invoke;
  const w = window.__wiz = { saved: null, calls: [], hasUserData: false, failCapture: false };
  const db = window.__mockDb;
  const gear = ids => {
    const out = { created: [], existing: [], removed: [] };
    for (const id of ids) {
      const dp = db.deviceProfiles[id];
      if (!dp) throw `unknown product id '${id}'`;
      const live = db.catalog.asset.find(a => a.productId === dp.productId);
      if (live) out.existing.push({ productId: id, assetId: live.id });
      else { const assetId = `asset-${id}`; db.catalog.asset.push({ id: assetId, productId: dp.productId, nickname: `My ${id}`, notes: 'wizard' }); out.created.push({ productId: id, assetId }); }
    }
    return out;
  };
  window.__TAURI__.core.invoke = async (cmd, args) => {
    w.calls.push([cmd, JSON.parse(JSON.stringify(args || {}))]);
    switch (cmd) {
      case 'wizard_state_get': return w.saved ? { ...w.saved, version: 1 } : { status: 'none', step: 1, answers: {}, updatedAt: null, completedAt: null, version: 1 };
      case 'wizard_state_save': w.saved = { ...args.state, updatedAt: new Date().toISOString(), completedAt: args.state.status === 'completed' ? new Date().toISOString() : null }; return null;
      case 'wizard_has_user_data': return w.hasUserData;
      case 'wizard_create_assets': case 'wizard_apply_gear': return gear(args.productIds);
      case 'start_live_capture': if (w.failCapture) throw 'No default input device found'; break;
      case 'device_profiles_sync':
        return args.profiles.map(p => {
          const known = db.deviceProfiles[p.id], productId = `prod-${p.id}`;
          if (!db.catalog.product.some(x => x.id === productId)) db.catalog.product.push({ id: productId, model: p.model, category: p.category });
          let assetId = null;
          if (!known && args.createAssets !== false) { assetId = `asset-${p.id}`; db.catalog.asset.push({ id: assetId, productId, nickname: `My ${p.model}` }); }
          db.deviceProfiles[p.id] = { productId, version: 1 };
          return { profileId: p.id, manufacturerId: 'm', productId, version: 1, created: !known, changed: !known, assetId };
        });
      default:
    }
    return inv(cmd, args);
  };
}

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const dlg = 'dialog.wizard[open]';
  const title = page => page.locator(`${dlg} #wiz-step-title`).innerText();
  const open = page => page.locator(dlg).count();
  const activeCtx = page => page.evaluate(() => (window.__ctxs || []).filter(c => c.state !== 'closed').length);
  const toneStops = async page => { try { await page.waitForFunction(() => (window.__ctxs || []).every(c => c.state === 'closed'), null, { timeout: 2500 }); return true; } catch { return false; } };
  const next = page => page.click(`${dlg} #wiz-next`);
  const stepTitle = (page, re) => page.waitForFunction(r => new RegExp(r, 'i').test(document.querySelector('dialog.wizard[open] #wiz-step-title')?.textContent || ''), re.source, { timeout: 8000 });

  async function setTheme(page, theme) {
    await page.evaluate(async t => { document.documentElement.dataset.theme = t; (await import('./ui/meters.js')).refreshMeterThemes(); }, theme);
    await page.waitForTimeout(120);
  }
  async function snap(page, name) {
    await page.waitForTimeout(250);
    for (const theme of ['dark', 'light']) {
      await setTheme(page, theme);
      await page.screenshot({ path: path.join(SHOTS, `wizard-${name}-${theme}.png`) });
    }
    await setTheme(page, 'dark');
  }
  async function fresh(browserCtxOptions = {}, { native = false, before = null } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write'], ...browserCtxOptions });
    await context.addInitScript(wizardPageSetup);
    if (native) { await context.addInitScript(tauriMock); await context.addInitScript(wizardNativeMock); }
    if (Array.isArray(before)) await context.addInitScript(before[0], before[1]);
    else if (before) await context.addInitScript(before);
    const page = await context.newPage();
    return { context, page };
  }

  // =========================================================== browser mode
  {
    const { context, page } = await fresh();
    errors.push(...watchConsole(page, 'wizard-browser'));
    await page.goto(base);
    await page.waitForSelector(dlg);
    check('wizard AC-1: fresh install opens the wizard modally before Quick', await open(page) === 1 && await page.evaluate(() => document.querySelector('dialog.wizard').matches(':modal')));
    check('wizard: dialog is named and the stepper is a list', await page.evaluate(() => { const d = document.querySelector('dialog.wizard'); return !!document.getElementById(d.getAttribute('aria-labelledby')) && d.querySelector('ol[role="list"]') && d.querySelector('[aria-current="step"]'); }));
    check('wizard: stepper shows 6 steps in browser (no System Health)', (await page.locator(`${dlg} #wiz-stepper li`).count()) === 6 && /Step 1 of 6/.test(await page.locator(`${dlg} #wiz-count`).innerText()));
    check('wizard: no assets are auto-created while the wizard owns gear', await page.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('deckchek.catalog.v1') || '{}'); return Object.keys(s.deviceProfiles || {}).length >= 8 && (s.catalog?.asset || []).length === 0; }, null, { timeout: 8000 }).then(() => true, () => false));
    check('wizard: focus moves to the step heading', await page.evaluate(() => document.activeElement?.id === 'wiz-step-title'));
    let audit = await a11yAudit(page);
    check('wizard: welcome a11y names + target sizes', !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
    await snap(page, '1-welcome');

    await next(page);
    await stepTitle(page, /choose your interface/);
    await page.waitForSelector(`${dlg} #wiz-rate`);
    check('wizard: browser step 2 explains file-only mode and offers the rate select', /browser preview/i.test(await page.locator(`${dlg} .wiz-body`).innerText()) && await page.locator(`${dlg} #wiz-input`).isDisabled());
    await page.selectOption(`${dlg} #wiz-rate`, '96000');
    check('wizard AC-3: calibration status is shown for the chosen rate', /Uncalibrated/i.test(await page.locator(`${dlg} #wiz-cal-status`).innerText()));
    audit = await a11yAudit(page);
    check('wizard: interface a11y names + target sizes', !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
    await snap(page, '2-interface');
    await next(page);
    check('wizard AC-3: Next saves the sample rate through setSetting and the top bar follows', await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.ui.v1')).sampleRate === 96000 && document.getElementById('rate-select').value === '96000'));

    // ---- levels + tone: the tone must stop everywhere
    await stepTitle(page, /test tone and levels/);
    check('wizard: levels step warns to lower monitors', /lower your monitors/i.test(await page.locator(`${dlg} .wiz-body`).innerText()));
    audit = await a11yAudit(page);
    check('wizard: levels a11y names + target sizes', !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
    await page.click(`${dlg} #wiz-tone`);
    await page.waitForFunction(() => window.__ctxs.some(c => c.state === 'running'));
    check('tone: Play starts one audio context and the button reads Stop', await activeCtx(page) === 1 && (await page.getAttribute(`${dlg} #wiz-tone`, 'aria-pressed')) === 'true' && /Stop test tone/.test(await page.locator(`${dlg} #wiz-tone`).innerText()));
    await snap(page, '3-levels-tone');
    await page.click(`${dlg} #wiz-tone`);
    check('tone: pressing Stop closes the context', await toneStops(page) && (await page.getAttribute(`${dlg} #wiz-tone`, 'aria-pressed')) === 'false');
    await page.click(`${dlg} #wiz-tone`);
    await page.waitForFunction(() => window.__ctxs.some(c => c.state === 'running'));
    await page.click(`${dlg} #wiz-back`);
    await stepTitle(page, /choose your interface/);
    check('tone: stops on Back', await toneStops(page));
    await next(page); await stepTitle(page, /test tone and levels/);
    await page.click(`${dlg} #wiz-tone`);
    await page.waitForFunction(() => window.__ctxs.some(c => c.state === 'running'));
    await page.click(`${dlg} #wiz-skip-step`);
    await stepTitle(page, /loopback calibration/);
    check('tone: stops on Skip step', await toneStops(page));
    await page.click(`${dlg} #wiz-back`); await stepTitle(page, /test tone and levels/);
    await page.click(`${dlg} #wiz-tone`);
    await page.waitForFunction(() => window.__ctxs.some(c => c.state === 'running'));
    await page.click(`${dlg} #wiz-next`);
    await stepTitle(page, /loopback calibration/);
    check('tone: stops on Next', await toneStops(page));
    await page.click(`${dlg} #wiz-back`); await stepTitle(page, /test tone and levels/);
    await page.click(`${dlg} #wiz-tone`);
    await page.waitForFunction(() => window.__ctxs.some(c => c.state === 'running'));
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    check('tone: stops when the tab is hidden', await toneStops(page));
    await page.evaluate(() => { delete document.hidden; });
    await page.click(`${dlg} #wiz-tone`);
    await page.waitForFunction(() => window.__ctxs.some(c => c.state === 'running'));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#confirm-dialog[open]');
    check('tone: Esc past step 2 asks before skipping (and the tone keeps the user informed)', /Skip setup\?/.test(await page.locator('#confirm-title').innerText()));
    await page.click('#confirm-cancel');
    await page.waitForTimeout(150); // let the shared confirm dialog's close event settle before reopening it
    check('wizard: cancelling the confirm keeps the wizard open', await open(page) === 1);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#confirm-dialog[open]');
    await page.click('#confirm-ok');
    await page.waitForFunction(() => !document.querySelector('dialog.wizard'));
    check('tone: stops on Esc -> Skip setup (dialog closed)', await toneStops(page));
    check('wizard AC-1: skipping lands on the Quick screen with status=skipped', await page.locator('#screen-quick').isVisible() && await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.wizard.v1')).status === 'skipped'));
    await page.reload();
    await page.waitForSelector('.rail-item');
    await page.waitForTimeout(600);
    check('wizard: reload after skipping shows no wizard and no banner', await open(page) === 0 && (await page.locator('.wiz-banner').count()) === 0);

    // ---- Options > Run setup again (AC-8), prefilled
    await page.click('#cdlOptionsBtn');
    await page.waitForSelector('#cdlOptionsDialog [data-wizard-entry]');
    await page.click('#cdlOptionsDialog [data-wizard-entry] button');
    await page.waitForSelector(dlg);
    check('wizard AC-8: Options > Run setup again opens at step 1', /Step 1 of 6/.test(await page.locator(`${dlg} #wiz-count`).innerText()) && !(await page.locator('#cdlOptionsDialog[open]').count()));
    await next(page); await stepTitle(page, /choose your interface/);
    await page.waitForSelector(`${dlg} #wiz-rate`);
    check('wizard AC-8: current values are prefilled', (await page.inputValue(`${dlg} #wiz-rate`)) === '96000');

    // ---- stepper navigation, calibration mount, gear, summary
    await next(page); await stepTitle(page, /test tone and levels/);
    await next(page); await stepTitle(page, /loopback calibration/);
    await page.click(`${dlg} #wiz-cal-run`);
    await page.waitForSelector(`${dlg} .cal-embedded #cal-start`);
    check('wizard AC-4 embedded: calibration mounts in the dialog without header or side panel', await page.evaluate(() => { const s = document.querySelector('dialog.wizard .cal-embedded'); return s.querySelector('.screen-head').hidden && s.querySelector('.cal-side').hidden && !!s.querySelector('#cal-start') && !!s.querySelector('#cal-import'); }));
    check('wizard: embedded calibration has no h1', (await page.locator(`${dlg} .cal-embedded h1`).evaluateAll(els => els.filter(e => e.offsetParent).length)) === 0);
    await snap(page, '4-calibration');
    await next(page);
    await stepTitle(page, /your gear/);
    await page.waitForSelector(`${dlg} .wiz-gear`);
    const products = await page.locator(`${dlg} .wiz-gear`).count();
    check('wizard: gear grid lists every library product by category', products >= 8 && (await page.locator(`${dlg} .wiz-gear-group`).count()) >= 4, `${products} products`);
    check('wizard: product images load under CSP', await page.evaluate(() => [...document.querySelectorAll('dialog.wizard .wiz-gear-thumb img')].every(i => i.complete && i.naturalWidth > 0)));
    await page.fill(`${dlg} #wiz-gear-search`, 'technics');
    check('wizard: gear search filters the grid', (await page.locator(`${dlg} .wiz-gear:not([hidden])`).count()) === 1);
    await page.fill(`${dlg} #wiz-gear-search`, '');
    await page.check(`${dlg} .wiz-gear input[data-id="technics-sl-1200mk4"]`);
    await page.check(`${dlg} .wiz-gear input[data-id="pioneer-djm-a9"]`);
    check('wizard: gear count updates', /2 selected/.test(await page.locator(`${dlg} #wiz-gear-count`).innerText()));
    audit = await a11yAudit(page);
    check('wizard: gear a11y names + target sizes', !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
    await page.evaluate(() => document.querySelector('dialog.wizard .wiz-body').scrollTo(0, 0));
    await snap(page, '5-gear');
    await next(page);
    await stepTitle(page, /all set/);
    check('wizard AC-7: browser build has no System Health step', !/System Health/i.test(await page.locator(`${dlg} #wiz-stepper`).innerText()));
    const summaryText = await page.locator(`${dlg} .wiz-summary`).innerText();
    check('wizard: summary lists rate, gear count and calibration', /96 kHz/.test(summaryText) && /2 products/.test(summaryText) && /Not calibrated/.test(summaryText));
    await snap(page, '6-summary');
    await page.click(`${dlg} #wiz-copy`);
    check('wizard: Copy summary puts the table on the clipboard', /DeckChek setup summary/.test(await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')));
    await page.click(`${dlg} #wiz-next`);
    await page.waitForFunction(() => !document.querySelector('dialog.wizard'));
    const store = await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.catalog.v1')));
    const mine = (store.catalog.asset || []).filter(a => !a.isDeleted);
    check('wizard AC-6: exactly the ticked gear got a "My <model>" unit', mine.length === 2 && mine.some(a => /SL-1200MK4/.test(a.nickname)) && mine.some(a => /DJM-A9/.test(a.nickname)), mine.map(a => a.nickname).join(', '));
    check('wizard: Finish lands on Quick and saves status=completed', await page.locator('#screen-quick').isVisible() && await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.wizard.v1')).status === 'completed'));

    // re-run: gear preticked from existing assets, no deletions (AC-8)
    await page.click('#cdlOptionsBtn');
    await page.waitForSelector('#cdlOptionsDialog [data-wizard-entry]');
    await page.click('#cdlOptionsDialog [data-wizard-entry] button');
    await page.waitForSelector(dlg);
    await page.click(`${dlg} .step-done`).catch(() => {});
    for (let i = 0; i < 4; i++) { await next(page); await page.waitForTimeout(100); }
    await stepTitle(page, /your gear/);
    await page.waitForSelector(`${dlg} .wiz-gear`);
    check('wizard AC-8: re-run preticks the owned gear', (await page.locator(`${dlg} .wiz-gear input:checked`).count()) === 2);
    await page.uncheck(`${dlg} .wiz-gear input[data-id="pioneer-djm-a9"]`);
    await next(page); await stepTitle(page, /all set/);
    await page.click(`${dlg} #wiz-next`);
    await page.waitForFunction(() => !document.querySelector('dialog.wizard'));
    check('wizard AC-8: re-run never deletes units', (await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.catalog.v1')).catalog.asset.filter(a => !a.isDeleted).length)) === 2);
    await context.close();
  }

  // ---- resume banner (AC-2) and Esc at step 1
  {
    const { context, page } = await fresh();
    errors.push(...watchConsole(page, 'wizard-resume'));
    await page.goto(base);
    await page.waitForSelector(dlg);
    await next(page); await stepTitle(page, /choose your interface/);
    await next(page); await stepTitle(page, /test tone and levels/);
    await page.reload();
    await page.waitForSelector('.wiz-banner');
    check('wizard AC-2: reopening shows "Resume setup (step 3 of 6)"', /Resume setup \(step 3 of 6\)/.test(await page.locator('.wiz-banner').innerText()) && await open(page) === 0);
    await page.click('.wiz-banner button:has-text("Resume")');
    await page.waitForSelector(dlg);
    await stepTitle(page, /test tone and levels/);
    check('wizard AC-2: Resume restores the step', /Step 3 of 6/.test(await page.locator(`${dlg} #wiz-count`).innerText()));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#confirm-dialog[open]');
    await page.click('#confirm-ok');
    await page.waitForFunction(() => !document.querySelector('dialog.wizard'));
    await page.reload();
    await page.waitForSelector('.rail-item');
    await page.waitForTimeout(500);
    check('wizard: skipped state shows neither wizard nor banner after reload', await open(page) === 0 && (await page.locator('.wiz-banner').count()) === 0);
    await context.close();
  }
  {
    const { context, page } = await fresh();
    errors.push(...watchConsole(page, 'wizard-dismiss'));
    await page.goto(base);
    await page.waitForSelector(dlg);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.wizard'));
    check('wizard AC-1: Esc on step 1 skips without confirmation', await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.wizard.v1')).status === 'skipped'));
    await context.close();
  }
  {
    const { context, page } = await fresh();
    errors.push(...watchConsole(page, 'wizard-banner-dismiss'));
    await page.goto(base);
    await page.waitForSelector(dlg);
    await next(page);
    await page.reload();
    await page.waitForSelector('.wiz-banner');
    await page.click('.wiz-banner button:has-text("Dismiss")');
    await page.reload();
    await page.waitForSelector('.rail-item');
    await page.waitForTimeout(400);
    check('wizard AC-2: Dismiss marks the setup skipped', await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.wizard.v1')).status === 'skipped') && (await page.locator('.wiz-banner').count()) === 0);
    await context.close();
  }

  // ---- AC-10: upgrade install with data never auto-opens
  {
    const seed = () => {
      if (localStorage.getItem('deckchek.catalog.v1')) return;
      localStorage.setItem('deckchek.catalog.v1', JSON.stringify({ catalog: { manufacturer: [], product: [], asset: [{ id: 'a1', nickname: 'My old deck', productId: 'p1', createdAt: 't', updatedAt: 't' }], setup: [], venue: [] }, runs: [], alignments: [], deviceProfiles: {}, productSpecs: [], deviceResults: [], midiMaps: {} }));
    };
    const { context, page } = await fresh({}, { before: seed });
    errors.push(...watchConsole(page, 'wizard-upgrade'));
    await page.goto(base);
    await page.waitForSelector('.rail-item');
    await page.waitForFunction(() => localStorage.getItem('deckchek.wizard.v1'), null, { timeout: 8000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.wizard.v1')));
    check('wizard AC-10: an install that already has an asset auto-completes without opening', await open(page) === 0 && saved.status === 'completed' && saved.answers.autoCompleted === true);
    const assets = await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.catalog.v1')).catalog.asset.filter(a => !a.isDeleted).length);
    check('wizard AC-10: existing gear is kept and no new units are created', assets === 1);
    await context.close();
  }

  // =========================================================== mocked Windows desktop mode
  {
    const { context, page } = await fresh({ userAgent: WIN_UA }, { native: true });
    errors.push(...watchConsole(page, 'wizard-desktop'));
    await page.goto(base);
    await page.waitForSelector(dlg);
    check('wizard desktop: 7 steps including System Health', (await page.locator(`${dlg} #wiz-stepper li`).count()) === 7 && /Step 1 of 7/.test(await page.locator(`${dlg} #wiz-count`).innerText()));
    check('wizard desktop: hasUserData is read before the first sync and the sync creates no assets', await page.waitForFunction(() => {
      const c = window.__wiz.calls.map(x => x[0]);
      const sync = window.__wiz.calls.find(x => x[0] === 'device_profiles_sync');
      return sync && c.indexOf('wizard_has_user_data') >= 0 && c.indexOf('wizard_has_user_data') < c.indexOf('device_profiles_sync') && sync[1].createAssets === false && window.__mockDb.catalog.asset.length === 0;
    }, null, { timeout: 8000 }).then(() => true, () => false));
    await next(page);
    await stepTitle(page, /choose your interface/);
    await page.waitForSelector(`${dlg} #wiz-input option[value="Rane SEVENTY-TWO MKII"]`, { state: 'attached' });
    check('wizard desktop: input and output selects are populated', (await page.locator(`${dlg} #wiz-input option`).count()) === 3 && (await page.locator(`${dlg} #wiz-output option`).count()) === 3 && !(await page.locator(`${dlg} #wiz-output`).isDisabled()));
    await page.selectOption(`${dlg} #wiz-input`, 'Rane SEVENTY-TWO MKII');
    await page.selectOption(`${dlg} #wiz-output`, 'o2');
    await snap(page, '2-interface-desktop');
    await next(page);
    check('wizard AC-3: Next saves deviceName via setSetting and syncs the top bar', await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.ui.v1')).deviceName === 'Rane SEVENTY-TWO MKII' && document.getElementById('device-select').value === 'Rane SEVENTY-TWO MKII'));

    await stepTitle(page, /test tone and levels/);
    await page.waitForSelector(`${dlg} .meter`);
    await page.click(`${dlg} #wiz-tone`);
    await page.waitForFunction(() => window.__ctxs.some(c => c.state === 'running'));
    await page.click(`${dlg} #wiz-check`);
    await page.waitForFunction(() => /Measuring/.test(document.querySelector('dialog.wizard #wiz-listen')?.textContent || ''));
    check('wizard AC-4: the input session opened on the chosen device', await page.evaluate(() => window.__wiz.calls.some(c => c[0] === 'start_live_capture' && c[1].deviceName === 'Rane SEVENTY-TWO MKII')));
    await page.waitForSelector(`${dlg} #wiz-verdict .verdict`, { timeout: 8000 });
    const verdict = await page.locator(`${dlg} #wiz-verdict`).innerText();
    check('wizard AC-4: verdict states the peak in dBFS with a chip', /OK/.test(verdict) && /Input peaks at −\d+\.\d dBFS/.test(verdict), verdict.replace(/\n/g, ' '));
    check('wizard: level check is stored in the answers', await page.evaluate(() => window.__wiz.saved?.answers?.levelCheck?.verdict === 'ok'));
    await snap(page, '3-levels-live');
    {
      const a = await a11yAudit(page);
      check('wizard: live levels a11y names + target sizes', !a.unnamed.length && !a.small.length, [...a.unnamed, ...a.small].slice(0, 3).join(' | '));
    }
    await page.click(`${dlg} #wiz-next`);
    await stepTitle(page, /loopback calibration/);
    check('tone: stops when leaving the levels step', await toneStops(page));
    check('capture: the level-check input is released when leaving the step', await page.waitForFunction(async () => (await window.__TAURI__.core.invoke('live_capture_status')).running === false, null, { timeout: 5000 }).then(() => true, () => false));

    // calibration step in native mode, then gear
    check('wizard: calibration step shows Uncalibrated for the chosen device', /Uncalibrated/i.test(await page.locator(`${dlg} #wiz-cal-state`).innerText()));
    await page.click(`${dlg} #wiz-cal-run`);
    await page.waitForSelector(`${dlg} .cal-embedded #cal-start:not([disabled])`);
    check('wizard desktop: embedded Run loopback is enabled and the chosen output is preselected', (await page.inputValue(`${dlg} .cal-embedded #cal-output`)) === 'o2');
    await snap(page, '4-calibration-desktop');
    await next(page);
    await stepTitle(page, /your gear/);
    await page.waitForSelector(`${dlg} .wiz-gear`);
    await page.check(`${dlg} .wiz-gear input[data-id="pioneer-plx-crss12"]`);
    await page.check(`${dlg} .wiz-gear input[data-id="traktor-audio-8-dj"]`);
    await page.evaluate(() => document.querySelector('dialog.wizard .wiz-body').scrollTo(0, 0));
    await snap(page, '5-gear-desktop');
    await next(page);

    await stepTitle(page, /system health quick scan/);
    await page.waitForSelector(`${dlg} #wiz-health .verdict`);
    const health = await page.locator(`${dlg} #wiz-health`).innerText();
    check('wizard: health step shows counts and the top findings from system_scan_drivers only', /error/.test(health) && (await page.locator(`${dlg} .wiz-findings li`).count()) >= 1 && await page.evaluate(() => window.__wiz.calls.some(c => c[0] === 'system_scan_drivers') && !window.__wiz.calls.some(c => c[0] === 'system_scan_events')));
    await snap(page, '6-health');
    await next(page);
    await stepTitle(page, /all set/);
    const sum = await page.locator(`${dlg} .wiz-summary`).innerText();
    check('wizard: summary has input, output, gear and health rows', /Rane SEVENTY-TWO MKII/.test(sum) && /USB Interface/.test(sum) && /2 products/.test(sum) && /System Health/.test(sum));
    await snap(page, '7-summary');
    await page.click(`${dlg} #wiz-next`);
    await page.waitForFunction(() => !document.querySelector('dialog.wizard'));
    const calls = await page.evaluate(() => window.__wiz.calls.filter(c => c[0] === 'wizard_apply_gear' || c[0] === 'wizard_create_assets'));
    check('wizard AC-6: first run applies exactly the ticked gear (with retire)', calls.length === 1 && calls[0][0] === 'wizard_apply_gear' && calls[0][1].productIds.sort().join() === 'pioneer-plx-crss12,traktor-audio-8-dj');
    check('wizard: finish saves status=completed through wizard_state_save', await page.evaluate(() => window.__wiz.saved.status === 'completed' && window.__wiz.saved.step === 7));
    check('wizard: Finish leaves no sound or capture running', await toneStops(page) && await page.evaluate(async () => (await window.__TAURI__.core.invoke('live_capture_status')).running === false));
    await context.close();
  }

  // ---- desktop: capture failure stops the tone and shows a recoverable error; dialog close stops everything
  {
    const { context, page } = await fresh({ userAgent: WIN_UA }, { native: true });
    errors.push(...watchConsole(page, 'wizard-desktop-errors'));
    await page.goto(base);
    await page.waitForSelector(dlg);
    await next(page); await stepTitle(page, /choose your interface/);
    await page.waitForSelector(`${dlg} #wiz-input option[value="Rane SEVENTY-TWO MKII"]`, { state: 'attached' });
    await next(page); await stepTitle(page, /test tone and levels/);
    await page.evaluate(() => { window.__wiz.failCapture = true; });
    await page.click(`${dlg} #wiz-tone`);
    await page.waitForFunction(() => window.__ctxs.some(c => c.state === 'running'));
    await page.click(`${dlg} #wiz-check`);
    await page.waitForSelector(`${dlg} #wiz-level-error .banner-fail`);
    check('wizard: input error shows a recoverable alert with Retry', /No input device found/.test(await page.locator(`${dlg} #wiz-level-error`).innerText()) && (await page.locator(`${dlg} #wiz-retry`).count()) === 1);
    check('tone: stops when the input fails to open', await toneStops(page));
    await snap(page, '3-levels-error');
    await page.evaluate(() => { window.__wiz.failCapture = false; });
    await page.click(`${dlg} #wiz-retry`);
    await page.waitForFunction(() => /Measuring|Listening/.test(document.querySelector('dialog.wizard #wiz-listen')?.textContent || ''));
    await page.click(`${dlg} #wiz-tone`);
    await page.waitForFunction(() => window.__ctxs.some(c => c.state === 'running'));
    await page.evaluate(() => document.querySelector('dialog.wizard').close());
    check('tone: stops when the dialog is closed from outside', await toneStops(page));
    check('capture: closing the dialog releases the input', await page.waitForFunction(async () => (await window.__TAURI__.core.invoke('live_capture_status')).running === false, null, { timeout: 5000 }).then(() => true, () => false));
    check('wizard: an unexpected close is treated as Skip setup', await page.evaluate(() => window.__wiz.saved.status === 'skipped'));
    await context.close();
  }

  // ---- desktop: no input devices -> recoverable panel (AC-9); already calibrated -> defaults to skip (AC-5)
  {
    const stim = loopbackStimulus({ sampleRate: 48000, durationSec: 2, levelDbfs: -20 });
    const profile = analyzeLoopback({ left: stim.left, right: stim.right, sampleRate: 48000 }, stim.meta, { deviceName: 'Focusrite USB (In 1/2)' });
    const seed = JSON.stringify({ ...profile, sampleRate: 48000 });
    const calSeed = text => {
      localStorage.setItem('deckchek.ui.v1', JSON.stringify({ deviceName: 'Focusrite USB (In 1/2)', sampleRate: 48000 }));
      localStorage.setItem('deckchek.calibration.v1', JSON.stringify({ 'focusrite usb (in 1/2)|48000': text }));
    };
    const { context, page } = await fresh({ userAgent: WIN_UA }, { native: true, before: [calSeed, seed] });
    errors.push(...watchConsole(page, 'wizard-desktop-ac5'));
    await page.goto(base);
    await page.waitForSelector(dlg);
    await next(page); await stepTitle(page, /choose your interface/);
    await page.waitForSelector(`${dlg} #wiz-cal-status .chip`);
    check('wizard AC-3/5: calibration status chip shows Calibrated for the selected device and rate', /Calibrated/i.test(await page.locator(`${dlg} #wiz-cal-status`).innerText()));
    await next(page); await stepTitle(page, /test tone and levels/);
    await next(page); await stepTitle(page, /loopback calibration/);
    check('wizard AC-5: an applicable profile shows "Already calibrated" and the step can be skipped', /Already calibrated/i.test(await page.locator(`${dlg} #wiz-cal-state`).innerText()) && await page.evaluate(() => window.__wiz.saved.answers.calibration === 'existing'));
    await snap(page, '4-calibration-existing');
    await context.close();
  }
  {
    const noInputs = () => { const t = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = async (c, a) => (c === 'list_native_audio_inputs' ? [] : t(c, a)); };
    const { context, page } = await fresh({ userAgent: WIN_UA }, { native: true, before: noInputs });
    errors.push(...watchConsole(page, 'wizard-desktop-noinputs'));
    await page.goto(base);
    await page.waitForSelector(dlg);
    await next(page); await stepTitle(page, /choose your interface/);
    await page.waitForSelector(`${dlg} .banner-fail`);
    check('wizard AC-9: no inputs -> error panel with Refresh and Continue without audio', /No audio inputs found/.test(await page.locator(`${dlg} .banner-fail`).innerText()) && (await page.locator(`${dlg} #wiz-refresh`).count()) === 1 && (await page.locator(`${dlg} #wiz-nosound`).count()) === 1);
    await snap(page, '2-interface-empty');
    await page.click(`${dlg} #wiz-nosound`);
    await stepTitle(page, /your gear/);
    check('wizard AC-9: Continue without audio skips levels and calibration', await page.evaluate(() => { const s = window.__wiz.saved.answers.skippedSteps; return s.includes('interface') && s.includes('levels') && s.includes('calibration'); }));
    await context.close();
  }

  // ---- AC-10 native: existing v0.04 data -> no wizard, gear kept
  {
    const { context, page } = await fresh({ userAgent: WIN_UA }, { native: true, before: () => { window.__wiz.hasUserData = true; } });
    errors.push(...watchConsole(page, 'wizard-desktop-upgrade'));
    await page.goto(base);
    await page.waitForSelector('.rail-item');
    await page.waitForFunction(() => window.__wiz.saved, null, { timeout: 8000 });
    check('wizard AC-10 (desktop): existing data -> auto-completed, no dialog, createAssets:false on sync', await open(page) === 0 && await page.evaluate(() => window.__wiz.saved.status === 'completed' && window.__wiz.saved.answers.autoCompleted === true && window.__wiz.calls.find(c => c[0] === 'device_profiles_sync')?.[1].createAssets === false));
    await context.close();
  }

  return errors;
}
