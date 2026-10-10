// M6 cross-links smoke: Quick Check -> Pre-gig / Latency / stylus health card; DVS -> Scratch test / Wear map;
// Calibration -> Latency; Equipment cartridge -> Stylus / Wear map (with the cartridge handed over); Pre-gig fix actions
// -> Hum hunter / Stylus / Latency and the Windows Settings opener (fixed allowlist, copy fallback); History lists hum,
// latency, scratch, wear-map and pre-gig runs beside diagnostic runs with a type filter; Pre-gig PDF export.
// Flag off = no links at all. Desktop mode uses the mocked Tauri commands of the stylus and pre-gig smokes.
import { watchConsole, tauriMock } from './core.mjs';
import { pregigMock } from './pregig.mjs';
import { stylusMock } from './stylus.mjs';

const FLAGS = { pregig: true, latencyTuner: true, stylusWear: true, wearMap: true, scratchTest: true, humHunter: true };
const FLAGS_ON = flags => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: flags })); };

/** Outermost mock layer: history feature lists, a second cartridge, the diagnostic run and the Settings opener. */
function crosslinkLayer() {
  const core = window.__TAURI__.core; const inner = core.invoke;
  const iso = d => new Date(Date.now() - d * 864e5).toISOString();
  const xl = { opened: [], openResult: { opened: true, host: 'ms-settings', allowlisted: true }, calls: [], feature: true, dvs: false };
  window.__xl = xl;
  core.invoke = async (cmd, args = {}) => {
    if (cmd === 'open_external_url') { xl.opened.push(args.url); return xl.openResult; }
    if (cmd === 'catalog_list' && (args.entity === 'asset' || args.entity === 'product')) {
      const rows = await inner(cmd, args);
      const extra = args.entity === 'product' ? [{ id: 'p-nag', model: 'Nagaoka MP-110', category: 'cartridge', manufacturerId: 'm-ort' }] : [{ id: 'a-nag', nickname: 'Deck 2 Nagaoka MP-110', productId: 'p-nag' }];
      return [...rows, ...extra];
    }
    if (!xl.feature) return inner(cmd, args);
    xl.calls.push(cmd);
    if (cmd === 'list_capture_sessions') return [{ id: 'cs1', kind: 'live', assetId: 'a-conc', startedAt: iso(0.5), endedAt: new Date(Date.now() - 0.5 * 864e5 + 40 * 60e3).toISOString() }];
    if (cmd === 'get_run' && args.id === 'dvs1') return { id: 'dvs1', test: 'DVS signal', startedAt: iso(0.1), score: 90, measurements: [
      { metricId: 'tc_snr_db', value: 31.2, unit: 'dB' }, { metricId: 'tc_phase_error_deg', value: 4.1, unit: 'deg' }, { metricId: 'tc_dropouts', value: 2, unit: '' }], hypotheses: [] };
    if (cmd === 'list_runs' && xl.dvs) return [{ id: 'dvs1', sessionType: 'dvs', test: 'DVS signal', startedAt: iso(0.1), status: 'completed', score: 90, measurementCount: 3, hypothesisCount: 0 }];
    if (cmd === 'list_runs') return [{ id: 'd1', sessionType: 'speed', test: 'Speed & pitch', startedAt: iso(0.2), status: 'completed', score: 91, measurementCount: 6, hypothesisCount: 0 }];
    if (cmd === 'hum_run_list') return [{ id: 'h1', kind: 'hum', mainsHz: 50, verdict: 'Hum dropped 18 dB', createdAt: iso(1), stepCount: 5, onset: false }];
    if (cmd === 'latency_run_list') return [
      { id: 'l1', deviceName: 'Traktor Audio 8 DJ', kind: 'roundtrip', sampleRateHz: 48000, bufferFrames: 128, measuredMs: 9.4, xruns: null, verdict: null, createdAt: iso(2) },
      { id: 'l2', deviceName: 'Traktor Audio 8 DJ', kind: 'stress', sampleRateHz: 48000, bufferFrames: 64, xruns: 0, verdict: 'pass', createdAt: iso(2.5) }];
    if (cmd === 'scratch_list') return [{ id: 's1', format: 'Serato CV02', bpm: 100, completed: true, score: 82, lockLosses: 2, createdAt: iso(3) }];
    if (cmd === 'wearmap_list') return [{ id: 'w1', recordSideId: 'rs1', format: 'Serato CV02', verdict: 'watch', coverage: 0.97, score: 71, binCount: 240, createdAt: iso(4) }];
    if (cmd === 'pregig_list_runs') return [{ id: 'p1', presetId: null, startedAt: iso(0.5), verdict: 'red', durationMs: 61000, notes: 'Preset: Club booth', stepCount: 9, failCount: 2, warnCount: 1 }];
    return inner(cmd, args);
  };
}

/** Same layer but only the Settings opener (the pre-gig screen has its own mock for everything else). */
function openerLayer() {
  const core = window.__TAURI__.core; const inner = core.invoke;
  const xl = { opened: [], openResult: { opened: true, host: 'ms-settings', allowlisted: true } };
  window.__xl = xl;
  core.invoke = async (cmd, args = {}) => (cmd === 'open_external_url' ? (xl.opened.push(args.url), xl.openResult) : inner(cmd, args));
}

function installPrintSpy() {
  window.__printed = [];
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get() {
      const w = desc.get.call(this);
      if (w && this.classList.contains('dc-print-frame') && !w.__spied) {
        w.__spied = true;
        w.print = () => { window.__printed.push(w.document.title + ' | ' + w.document.body.innerText); };
      }
      return w;
    },
  });
}

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const shot = async (page, name) => { await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const current = page => page.evaluate(() => document.querySelector('.rail-item[aria-current="page"]')?.dataset.screen);
  const goScreen = async (page, id) => { await page.click(`.rail-item[data-screen="${id}"]`); await page.waitForFunction(i => document.querySelector('.rail-item[aria-current="page"]')?.dataset.screen === i, id); };

  // ----- flags off: no cross-links anywhere -----
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const po = await off.newPage();
  errors.push(...watchConsole(po, 'crosslinks-off'));
  await po.goto(base);
  await po.waitForSelector('.rail-item');
  await goScreen(po, 'quick');
  check('crosslinks: flags off leave Quick Check without next-step or stylus cards', (await po.locator('#screen-quick [data-xlink-card]').count()) === 0);
  await goScreen(po, 'dvs');
  check('crosslinks: flags off leave DVS without links', (await po.locator('#screen-dvs [data-xlink-card]').count()) === 0);
  await goScreen(po, 'history');
  check('crosslinks: flags off hide the History type filter', await po.locator('#hist-type').isHidden());
  await off.close();

  // ----- browser mode, flags on -----
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await bctx.addInitScript(FLAGS_ON, FLAGS);
  const pb = await bctx.newPage();
  errors.push(...watchConsole(pb, 'crosslinks-browser'));
  await pb.goto(base);
  await pb.waitForSelector('.rail-item[data-screen="quick"]');
  await goScreen(pb, 'quick');
  await pb.waitForSelector('#screen-quick [data-xlink-card="quick"]');
  check('crosslinks: Quick Check offers Pre-gig, Latency and Hum hunter', (await pb.locator('#screen-quick [data-xlink-card="quick"] [data-xlink]').evaluateAll(b => b.map(x => x.dataset.xlink))).join() === 'pregig,latency,hum');
  check('crosslinks: browser stylus health card says it is a desktop feature', /desktop app/i.test(await pb.locator('#screen-quick [data-health]').first().innerText()));
  await pb.click('#screen-quick [data-xlink-card="quick"] [data-xlink="pregig"]');
  check('crosslinks: Quick Check -> Pre-gig navigates', (await current(pb)) === 'pregig');
  await goScreen(pb, 'quick');
  await pb.click('#screen-quick [data-xlink-card="quick"] [data-xlink="latency"]');
  check('crosslinks: Quick Check -> Latency navigates', (await current(pb)) === 'latency');
  await goScreen(pb, 'dvs');
  check('crosslinks: DVS offers Scratch test and Wear map', (await pb.locator('#screen-dvs [data-xlink-card="dvs"] [data-xlink]').evaluateAll(b => b.map(x => x.dataset.xlink))).join() === 'scratch,vinylscan');
  await pb.click('#screen-dvs [data-xlink="scratch"]');
  check('crosslinks: DVS -> Scratch test navigates', (await current(pb)) === 'scratch');
  await goScreen(pb, 'dvs');
  await pb.click('#screen-dvs [data-xlink="vinylscan"]');
  check('crosslinks: DVS -> Wear map navigates', (await current(pb)) === 'vinylscan');
  await goScreen(pb, 'calibration');
  await pb.waitForSelector('#cal-xlinks [data-xlink="latency"]');
  await pb.click('#cal-xlinks [data-xlink="latency"]');
  check('crosslinks: Calibration -> Latency navigates', (await current(pb)) === 'latency');
  // live flag change: turning a feature off removes its link without a reload
  await pb.evaluate(async () => { (await import('./features.js')).setEnabled('latencyTuner', false); });
  await goScreen(pb, 'quick');
  check('crosslinks: a feature turned off drops its link', (await pb.locator('#screen-quick [data-xlink-card="quick"] [data-xlink]').evaluateAll(b => b.map(x => x.dataset.xlink))).join() === 'pregig,hum');
  await bctx.close();

  // ----- desktop: stylus health, equipment links, history feed -----
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await dctx.addInitScript(tauriMock); await dctx.addInitScript(stylusMock); await dctx.addInitScript(crosslinkLayer); await dctx.addInitScript(FLAGS_ON, FLAGS);
  await dctx.addInitScript(() => { window.__sty.rated = 500; for (let i = 0; i < 20; i++) window.__sty.usage.push({ id: `u${i}`, assetId: 'a-conc', kind: 'play', startedAt: new Date(Date.now() - (i + 1) * 864e5).toISOString(), hours: 20.5, confirmed: true, source: 'manual', createdAt: new Date().toISOString() }); });
  const page = await dctx.newPage();
  errors.push(...watchConsole(page, 'crosslinks-desktop'));
  await page.goto(base);
  await page.waitForSelector('.rail-item[data-screen="quick"]');
  await goScreen(page, 'quick');
  await page.waitForSelector('#screen-quick [data-health="hours"]');
  const hours = await page.locator('#screen-quick [data-xlink-card="stylus-health"] [data-health="hours"]').first().innerText();
  const next = await page.locator('#screen-quick [data-xlink-card="stylus-health"] [data-health="next"]').first().innerText();
  const head = await page.locator('#screen-quick [data-xlink-card="stylus-health"] .xlink-health-head').first().innerText();
  check('crosslinks: stylus health card shows the active cartridge wear %', /82 % worn/i.test(head) && /Concorde/.test(head), head);
  check('crosslinks: stylus health card shows hours of rated life', /410 of 500 h/.test(hours), hours);
  check('crosslinks: stylus health card shows the next alert', /^Next: 82 % of rated life used/.test(next), next);
  await shot(page, 'crosslinks-quick-health');
  await page.locator('#screen-quick [data-xlink-card="stylus-health"] [data-xlink="stylus"]').first().click();
  await page.waitForSelector('#sty-summary');
  check('crosslinks: health card opens the Stylus screen on that cartridge', (await current(page)) === 'stylus' && /Concorde/.test(await page.locator('#sty-summary').innerText()));

  // equipment asset -> stylus (second cartridge handed over) and wear map
  await goScreen(page, 'equipment');
  await page.waitForSelector('#eq-rows .record-main');
  await page.locator('#eq-rows .record-main', { hasText: 'Nagaoka' }).click();
  await page.waitForSelector('[data-xlink-card="equipment"]');
  check('crosslinks: Equipment cartridge offers stylus wear and wear map', (await page.locator('[data-xlink-card="equipment"] [data-xlink]').evaluateAll(b => b.map(x => x.dataset.xlink))).join() === 'stylus,vinylscan');
  await page.click('[data-xlink-card="equipment"] [data-xlink="stylus"]');
  await page.waitForSelector('#sty-asset');
  await page.waitForFunction(() => document.querySelector('#sty-asset')?.value === 'a-nag');
  check('crosslinks: Equipment -> Stylus opens that cartridge', (await current(page)) === 'stylus' && (await page.locator('#sty-asset').inputValue()) === 'a-nag');
  await goScreen(page, 'equipment');
  await page.locator('#eq-rows .record-main', { hasText: 'Nagaoka' }).click();
  await page.click('[data-xlink-card="equipment"] [data-xlink="vinylscan"]');
  check('crosslinks: Equipment -> Wear map navigates', (await current(page)) === 'vinylscan');
  await goScreen(page, 'equipment');
  await page.click('#eq-tab-product');
  await page.locator('#eq-rows .record-main').first().click();
  check('crosslinks: only assets carry the link row', (await page.locator('[data-xlink-card="equipment"]').count()) === 0);

  // history feed
  await goScreen(page, 'history');
  await page.waitForSelector('#hist-rows .run');
  const types = await page.locator('#hist-rows .run').evaluateAll(rs => rs.map(r => r.dataset.runType || 'diagnostic'));
  check('crosslinks: History lists diagnostic, hum, latency, scratch, wear-map and pre-gig runs together', ['diagnostic', 'hum', 'latency', 'scratch', 'wearmap', 'pregig'].every(t => types.includes(t)), types.join());
  check('crosslinks: History counts every run', (await page.locator('#hist-count').innerText()) === '7 of 7', await page.locator('#hist-count').innerText());
  const opts = await page.locator('#hist-type option').allInnerTexts();
  check('crosslinks: type filter lists each type with a count', opts.length === 7 && /^All runs \(7\)$/.test(opts[0]) && opts.some(o => o === 'Latency (2)'), opts.join(' | '));
  await page.selectOption('#hist-type', 'latency');
  check('crosslinks: filtering by Latency shows only latency runs', (await page.locator('#hist-rows .run').count()) === 2 && (await page.locator('#hist-rows .run[data-run-type="latency"]').count()) === 2);
  check('crosslinks: latency rows show device, buffer and verdict', /Traktor Audio 8 DJ/.test(await page.locator('#hist-rows').innerText()) && /128 frames/.test(await page.locator('#hist-rows').innerText()) && /pass/.test(await page.locator('#hist-rows').innerText()));
  await page.selectOption('#hist-type', 'diagnostic');
  check('crosslinks: filtering by Diagnostics hides feature runs', (await page.locator('#hist-rows .run').count()) === 1 && (await page.locator('#hist-rows .run-feature').count()) === 0);
  await page.selectOption('#hist-type', 'pregig');
  check('crosslinks: pre-gig run shows verdict and failures', /Club booth/.test(await page.locator('#hist-rows').innerText()) && /2 failed/.test(await page.locator('#hist-rows').innerText()));
  await page.selectOption('#hist-type', 'all');
  await page.fill('#hist-search', 'hum');
  check('crosslinks: text filter spans feature runs', (await page.locator('#hist-rows .run').count()) === 1);
  await page.fill('#hist-search', '');
  await page.selectOption('#hist-type', 'hum');
  await page.locator('#hist-rows .run-main').first().click();
  await page.waitForSelector('#hist-detail [data-feature-run="hum"]');
  check('crosslinks: a hum run opens a summary with the verdict', /Hum dropped 18 dB/.test(await page.locator('#hist-detail').innerText()));
  await shot(page, 'crosslinks-history');
  await page.click('#hist-detail [data-open-feature]');
  check('crosslinks: the summary opens the Hum hunter', (await current(page)) === 'hum');
  // flag off hides that type's rows (flags only hide UI)
  await page.evaluate(async () => { (await import('./features.js')).setEnabled('humHunter', false); });
  await goScreen(page, 'history');
  await page.waitForSelector('#hist-rows .run');
  check('crosslinks: a feature turned off hides its runs and filter option', (await page.locator('#hist-rows .run[data-run-type="hum"]').count()) === 0 && !(await page.locator('#hist-type option').allInnerTexts()).some(o => /Hum hunter/.test(o)));
  // narrow window: the filter stays usable
  await page.setViewportSize({ width: 390, height: 800 });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  check('crosslinks: History has no horizontal scroll at phone width', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  // stylus: AC-2 proposals from DeckChek's own live captures, and timecode benchmark auto-fill
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { window.__xl.dvs = true; });
  await goScreen(page, 'stylus');
  await page.waitForSelector('#sty-summary');
  await page.selectOption('#sty-asset', 'a-conc');
  await page.waitForFunction(() => /Concorde/.test(document.querySelector('#sty-summary')?.innerText || ''));
  await page.click('#sty-tab-hours');
  await page.click('#sty-find');
  await page.waitForSelector('#sty-proposals .sty-proposal');
  check('crosslinks: a 40 min live capture is proposed as 0.67 h of stylus use', (await page.locator('#sty-proposals .sty-prop-hours').first().inputValue()) === '0.67' && /DeckChek capture/.test(await page.locator('#sty-proposals').innerText()), await page.locator('#sty-proposals').innerText());
  await page.click('#sty-tab-benchmark');
  await page.click('#sty-fill');
  await page.waitForFunction(() => document.querySelector('#sty-b-snr')?.value !== '');
  check('crosslinks: benchmark fill takes timecode SNR, phase error and dropouts from the DVS run', (await page.locator('#sty-b-snr').inputValue()) === '31.2' && (await page.locator('#sty-b-phase').inputValue()) === '4.1' && (await page.locator('#sty-b-drop').inputValue()) === '2');
  await dctx.close();

  // ----- desktop: pre-gig fix actions, Settings opener, PDF -----
  const pctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await pctx.addInitScript(tauriMock); await pctx.addInitScript(pregigMock); await pctx.addInitScript(openerLayer); await pctx.addInitScript(FLAGS_ON, FLAGS);
  const pg = await pctx.newPage();
  errors.push(...watchConsole(pg, 'crosslinks-pregig'));
  await pg.goto(base);
  await pg.waitForSelector('.rail-item[data-screen="pregig"]');
  await pg.evaluate(installPrintSpy);
  await goScreen(pg, 'pregig');
  await pg.waitForSelector('#pg-start');
  await pg.evaluate(() => { window.__pg.rightMuted = true; });
  await pg.click('#pg-start');
  await pg.waitForSelector('.pg-prompt', { timeout: 20000 });
  await pg.click('.pg-prompt [data-answer="skip"]');
  await pg.waitForSelector('#pg-fixfirst', { timeout: 20000 });
  const fixText = await pg.locator('#pg-fixfirst').innerText();
  check('crosslinks: pre-gig fixes offer the Hum hunter for a signal problem', /Hunt the hum/.test(fixText), fixText.replace(/\s+/g, ' ').slice(0, 200));
  const navTexts = await pg.locator('#pg-fixfirst button[data-fix="navigate"]').allInnerTexts();
  check('crosslinks: pre-gig timecode problem offers Stylus and Latency', navTexts.some(t => /Check the stylus/.test(t)) && navTexts.some(t => /latency and buffer/i.test(t)), navTexts.join(' | '));
  await shot(pg, 'crosslinks-pregig-fixes');
  await pg.locator('#pg-fixfirst button[data-fix="navigate"]', { hasText: 'Check the stylus' }).first().click();
  check('crosslinks: pre-gig -> Stylus navigates', (await current(pg)) === 'stylus');
  await goScreen(pg, 'pregig');
  await pg.locator('#pg-fixfirst button[data-fix="navigate"]', { hasText: /latency and buffer/i }).first().click();
  check('crosslinks: pre-gig -> Latency navigates', (await current(pg)) === 'latency');
  await goScreen(pg, 'pregig');
  await pg.locator('#pg-fixfirst button[data-fix="navigate"]', { hasText: 'Hunt the hum' }).first().click();
  check('crosslinks: pre-gig -> Hum hunter navigates', (await current(pg)) === 'hum');
  await goScreen(pg, 'pregig');

  // Windows Settings opener
  const power = pg.locator('#pg-fixfirst button[data-fix="settings"]', { hasText: 'power settings' }).first();
  check('crosslinks: pre-gig offers the Windows power settings', (await power.count()) === 1);
  check('crosslinks: the Settings button no longer says "copy shortcut"', !/copy shortcut/i.test(await power.innerText()));
  await power.click();
  await pg.waitForFunction(() => window.__xl.opened.length === 1);
  check('crosslinks: the button opens exactly ms-settings:powersleep through open_external_url', (await pg.evaluate(() => window.__xl.opened.join())) === 'ms-settings:powersleep');
  await pg.evaluate(() => { window.__xl.openResult = { opened: false, reason: 'unsupported', host: 'ms-settings', allowlisted: true }; });
  await power.click();
  await pg.waitForFunction(() => window.__xl.opened.length === 2);
  await pg.waitForSelector('#toasts .toast');
  check('crosslinks: a refused open falls back to the copy-for-Win+R hint', /Win\+R/.test(await pg.locator('#toasts').innerText()), await pg.locator('#toasts').innerText());
  const settingsResults = await pg.evaluate(async () => {
    const m = await import('./ui/crosslinks.js');
    const calls = [];
    const invoke = async (c, a) => { calls.push([c, a.url]); return { opened: true }; };
    const out = [];
    for (const t of ['ms-settings:sound', 'ms-settings:privacy-microphone', 'ms-settings:network', 'https://example.org', 'ms-settings:sound?x=1', 'calc.exe']) out.push([t, await m.openWindowsSettings(t, { invoke, clipboard: { writeText: async () => {} } })]);
    return { out, calls };
  });
  check('crosslinks: only the three allowed settings pages ever reach the command', JSON.stringify(settingsResults.calls) === JSON.stringify([['open_external_url', 'ms-settings:sound'], ['open_external_url', 'ms-settings:privacy-microphone']]), JSON.stringify(settingsResults.calls));
  check('crosslinks: other targets are shown, never opened', settingsResults.out.filter(([, r]) => r === 'shown').length === 4, JSON.stringify(settingsResults.out));

  // PDF export of the result
  const pdfBtn = pg.locator('#pg-export-pdf');
  check('crosslinks: finished pre-gig check has Export PDF beside Save result', (await pg.locator('#pg-export + #pg-export-pdf').count()) === 1 && (await pdfBtn.isEnabled()));
  await pdfBtn.click();
  await pg.waitForFunction(() => window.__printed.length === 1, null, { timeout: 15000 });
  const printed = await pg.evaluate(() => window.__printed[0]);
  check('crosslinks: pre-gig PDF has the verdict, the fix-first list and the check table', /Pre-gig check/.test(printed) && /Not ready/.test(printed) && /Fix these/.test(printed) && /All checks/.test(printed) && /Fail/.test(printed), printed.slice(0, 160));
  check('crosslinks: pre-gig PDF prints statuses as words', /Pass/.test(printed) && /Fail/.test(printed));
  await pg.evaluate(async () => { (await import('./features.js')).setEnabled('pdfExport', false); });
  await goScreen(pg, 'history'); await goScreen(pg, 'pregig');
  check('crosslinks: features.pdfExport=false removes the pre-gig PDF button', (await pg.locator('#pg-export-pdf').count()) === 0);
  await pctx.close();
  return errors;
}

