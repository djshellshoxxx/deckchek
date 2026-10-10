// FS-12 smoke: Stylus wear screen. Flag off = hidden; browser mode = "needs the desktop app"; desktop mode with an
// in-memory implementation of the usage_* / stylus_* commands covers the empty state, adding hours (AC-1), the gauge,
// amber/red alerts and snooze (AC-5, AC-8), replacement reset (AC-7), DJ-log proposals (AC-3), benchmarks and the
// "Need 3 benchmarks" -> trend flow (AC-4, AC-6), the data-table toggle, the A / B / Esc keys, and both themes.
import { watchConsole, tauriMock } from './core.mjs';

const FLAG_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { stylusWear: true } })); };

// Desktop mode: tauriMock plus fixtures and the stylus/usage commands. `window.__sty` exposes state for the test.
function stylusMock() {
  const core = window.__TAURI__.core; const base = core.invoke;
  const sty = { cartridges: true, usage: [], bench: [], snoozes: [], baseline: null, rated: null, calls: [], spans: [] };
  window.__sty = sty;
  let n = 0; const id = p => `${p}-${++n}`;
  core.invoke = async (cmd, args = {}) => {
    if (cmd === 'catalog_list' && (args.entity === 'asset' || args.entity === 'product')) {
      const rows = await base(cmd, args);
      if (!sty.cartridges) return rows.filter(r => r.__sty);
      const fixtures = args.entity === 'product'
        ? [{ id: 'p-conc', __sty: true, model: 'Concorde Pro S', category: 'cartridge', manufacturerId: 'm-ort' }]
        : [{ id: 'a-conc', __sty: true, nickname: 'Deck 1 Ortofon Concorde Pro S', productId: 'p-conc' }];
      return [...rows.filter(r => !String(r.productId || r.id).startsWith('prod-') ? true : false).filter(r => r.__sty), ...fixtures];
    }
    if (cmd.startsWith('usage_')) {
      sty.calls.push(cmd);
      if (cmd === 'usage_list') return sty.usage.filter(u => u.assetId === args.assetId);
      if (cmd === 'usage_add') { if (args.input.hours > 24) throw 'hours must be 0-24'; const row = { id: id('u'), createdAt: new Date().toISOString(), confirmed: true, kind: 'play', ...args.input }; sty.usage.push(row); return { id: row.id }; }
      if (cmd === 'usage_delete') { sty.usage = sty.usage.filter(u => u.id !== args.id); return null; }
      if (cmd === 'usage_confirm') return null;
    }
    if (cmd.startsWith('stylus_') || cmd === 'dj_session_spans') {
      sty.calls.push(cmd);
      if (cmd === 'stylus_baseline') return sty.baseline;
      if (cmd === 'stylus_replace') { sty.baseline = args.at; return { id: id('m') }; }
      if (cmd === 'stylus_rated_life_get') return sty.rated;
      if (cmd === 'stylus_rated_life_set') { sty.rated = args.hours; return null; }
      if (cmd === 'stylus_benchmark_list') return sty.bench.filter(b => b.assetId === args.assetId);
      if (cmd === 'stylus_benchmark_save') { const r = args.result; const row = { id: id('b'), createdAt: new Date(Date.now() - (6 - sty.bench.length) * 7 * 864e5).toISOString(), valid: r.valid !== false, sessionId: null, setupId: null, detail: r.detail || {}, ...r }; sty.bench.push(row); return { id: row.id }; }
      if (cmd === 'stylus_alert_list') return sty.snoozes.filter(s => s.assetId === args.assetId);
      if (cmd === 'stylus_alert_snooze') { sty.snoozes.push({ id: id('s'), assetId: args.assetId, kind: args.kind, severity: 'amber', snoozedUntil: args.until, createdAt: new Date().toISOString() }); return { id: id('s') }; }
      if (cmd === 'dj_session_spans') return sty.spans;
    }
    return base(cmd, args);
  };
}

const iso = (daysAgo, h = 20) => { const d = new Date(Date.now() - daysAgo * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const shot = async (page, name) => { await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

  // ----- flag off -----
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const po = await off.newPage();
  errors.push(...watchConsole(po, 'stylus-off'));
  await po.goto(base);
  await po.waitForSelector('.rail-item');
  check('stylus: flag off hides the Stylus wear screen', (await po.locator('.rail-item[data-screen="stylus"]').count()) === 0);
  await off.close();

  // ----- browser mode -----
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await bctx.addInitScript(FLAG_ON);
  const pb = await bctx.newPage();
  errors.push(...watchConsole(pb, 'stylus-browser'));
  await pb.goto(base);
  await pb.waitForSelector('.rail-item[data-screen="stylus"]');
  await pb.click('.rail-item[data-screen="stylus"]');
  await pb.waitForSelector('#sty-unsupported');
  check('stylus: browser mode says it needs the desktop app', /needs the desktop app/i.test(await pb.locator('#sty-unsupported').innerText()));
  await bctx.close();

  // ----- desktop: empty state -----
  const ectx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ectx.addInitScript(tauriMock); await ectx.addInitScript(stylusMock); await ectx.addInitScript(FLAG_ON);
  await ectx.addInitScript(() => { window.__sty.cartridges = false; });
  const pe = await ectx.newPage();
  errors.push(...watchConsole(pe, 'stylus-empty'));
  await pe.goto(base);
  await pe.waitForSelector('.rail-item[data-screen="stylus"]');
  await pe.click('.rail-item[data-screen="stylus"]');
  await pe.waitForSelector('#sty-go-equipment');
  check('stylus: empty state invites adding a cartridge', /Add your cartridge to start tracking/.test(await pe.locator('#sty-panel').innerText()));
  await ectx.close();

  // ----- desktop: full flow -----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(tauriMock); await ctx.addInitScript(stylusMock); await ctx.addInitScript(FLAG_ON);
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'stylus'));
  await page.goto(base);
  await page.waitForSelector('.rail-item[data-screen="stylus"]');
  await page.click('.rail-item[data-screen="stylus"]');
  await page.waitForSelector('#sty-summary');
  const text = sel => page.locator(sel).innerText();
  check('stylus: zero hours state shows 0 of the catalogue rated life', /about 0 of 500 h \(0 %\)/.test(await text('#sty-summary')), await text('#sty-summary'));
  check('stylus: no alerts at zero hours', (await page.locator('#sty-no-alerts').count()) === 1);
  check('stylus: gauge has a text equivalent', /0 of 500 hours/.test(await page.locator('.sty-gauge').getAttribute('aria-label')));

  // AC-1 add hours (keyboard A)
  await page.locator('#main').focus().catch(() => {});
  await page.keyboard.press('a');
  await page.waitForSelector('#sty-hours-form');
  check('stylus: A opens the hours form with the hours field focused', await page.evaluate(() => document.activeElement?.id === 'sty-hours'));
  await page.fill('#sty-hours', '30');
  await page.click('#sty-hours-add');
  check('stylus: hours above 24 are rejected inline', /at most 24/.test(await text('#sty-hours-error')));
  await page.fill('#sty-hours', '2.5');
  await page.fill('#sty-note', 'Friday set');
  await page.click('#sty-hours-add');
  await page.waitForSelector('#sty-ledger tbody tr');
  check('stylus: AC-1 manual entry appears in the ledger as Manual', /Manual/.test(await text('#sty-ledger tbody tr')) && /2\.5/.test(await text('#sty-ledger tbody tr')));
  check('stylus: AC-1 total hours rise by 2.5', /2\.5 h confirmed in total/.test(await text('#screen-stylus .card-head .muted').catch(() => '') + await text('#sty-panel')));

  // AC-3 DJ log proposals
  await page.evaluate(() => { window.__sty.spans = [{ app: 'Serato DJ Pro', start: new Date(Date.now() - 2 * 864e5).toISOString(), end: new Date(Date.now() - 2 * 864e5 + 3 * 3600e3).toISOString(), source: 'log' }]; });
  await page.click('#sty-find');
  await page.waitForSelector('#sty-proposals .sty-proposal');
  check('stylus: AC-3 DJ-log session is proposed, not counted yet', /Serato DJ Pro/.test(await text('#sty-proposals')) && (await page.locator('#sty-ledger tbody tr').count()) === 1);
  await shot(page, 'stylus-hours');
  await page.fill('.sty-prop-hours', '2.5');
  await page.click('[data-confirm="0"]');
  await page.waitForFunction(() => document.querySelectorAll('#sty-ledger tbody tr').length === 2);
  check('stylus: confirming a proposal adds a djlog entry', /DJ log/.test(await text('#sty-ledger')));

  // overview + AC-5 amber / red
  await page.click('#sty-tab-overview');
  await page.waitForSelector('#sty-hours-total');
  check('stylus: overview total is 5 h', /^5 h$/.test((await text('#sty-hours-total')).trim()), await text('#sty-hours-total'));
  // seed history in the mock ledger: 34 x 12 h imports (408 h) on top of the 5 h entered above
  await page.evaluate(() => { for (let i = 0; i < 34; i++) window.__sty.usage.push({ id: `u-${i}`, assetId: 'a-conc', kind: 'play', startedAt: new Date(Date.now() - (60 + i) * 864e5).toISOString(), hours: 12, source: 'import', confirmed: true }); });
  await page.click('.rail-item[data-screen="history"]');
  await page.click('.rail-item[data-screen="stylus"]');
  await page.waitForSelector('.sty-alert');
  check('stylus: AC-5 at >= 80 % an amber alert appears', (await page.locator('.sty-alert[data-kind="life"]').count()) === 1 && /83 % of rated life used/.test(await text('.sty-alert[data-kind="life"]')) && /nearing rated life/i.test(await text(".sty-gauge-side")), await text('#sty-summary'));
  await shot(page, 'stylus-overview-amber');
  await page.click('[data-snooze="life"]');
  await page.waitForSelector('.sty-alert-snoozed');
  check('stylus: AC-8 snooze is recorded and shown with a date', /Snoozed until/.test(await text('.sty-alert-snoozed')) && (await page.evaluate(() => window.__sty.snoozes.length)) === 1);
  await page.evaluate(() => { for (let i = 0; i < 10; i++) window.__sty.usage.push({ id: `v-${i}`, assetId: 'a-conc', kind: 'play', startedAt: new Date(Date.now() - (100 + i) * 864e5).toISOString(), hours: 12, source: 'import', confirmed: true }); window.__sty.snoozes = []; });
  await page.click('.rail-item[data-screen="history"]'); await page.click('.rail-item[data-screen="stylus"]');
  await page.waitForSelector('.sty-alert');
  check('stylus: AC-5 at >= 100 % a red "Replace or inspect" alert', /Replace or inspect/.test(await text('.sty-alert[data-kind="life"]')) && /Replace or inspect/.test(await text('.sty-gauge-side')));
  // adding an hour re-evaluates the alerts and refreshes the rail badge
  await page.click('#sty-tab-hours'); await page.fill('#sty-hours', '1'); await page.click('#sty-hours-add');
  await page.waitForSelector('.rail-item[data-screen="stylus"] .rail-badge-red');
  check('stylus: rail badge flags the red alert with a "!" and a label', (await text('.rail-item[data-screen="stylus"] .rail-badge')).trim() === '!' && /replace or inspect/i.test(await page.locator('.rail-badge').getAttribute('aria-label')));
  await page.click('#sty-tab-overview');
  await shot(page, 'stylus-overview-red');

  // AC-7 replacement resets
  await page.click('#sty-replaced');
  await page.waitForSelector('#confirm-dialog[open]');
  await page.click('#confirm-ok');
  await page.waitForFunction(() => /Marked as replaced/.test(document.querySelector('#sty-status')?.textContent || ''));
  // only the 2.5 h entry that started "now" runs past the replacement time, so the 500+ h before it no longer count
  check('stylus: AC-7 hours restart after replacement', parseFloat(await text('#sty-hours-total')) <= 2.5, await text('#sty-hours-total'));
  check('stylus: AC-7 marking replaced resets hours but keeps the ledger', (await page.evaluate(() => window.__sty.usage.length)) > 30);

  // Benchmarks: AC-4 needs 3
  await page.keyboard.press('Escape');
  await page.locator('#main').focus().catch(() => {});
  await page.keyboard.press('b');
  await page.waitForSelector('#sty-bench-form');
  check('stylus: B opens the benchmark form', await page.evaluate(() => document.activeElement?.id === 'sty-b-thd'));
  const bench = async (hours, thd, sep, valid = true) => {
    await page.fill('#sty-b-hours', String(hours)); await page.fill('#sty-b-thd', String(thd)); await page.fill('#sty-b-sep', String(sep));
    if (!valid) await page.uncheck('#sty-bench-valid'); else if (!(await page.isChecked('#sty-bench-valid'))) await page.check('#sty-bench-valid');
    const before = await page.evaluate(() => window.__sty.bench.length);
    await page.click('#sty-bench-save');
    await page.waitForFunction(n => window.__sty.bench.length === n, before + 1);
    await page.waitForSelector('#sty-bench-form');
  };
  await page.click('#sty-bench-save');
  check('stylus: benchmark with no values is rejected', /at least one measured value/.test(await text('#sty-bench-error')));
  await bench(0, 0.4, 28);
  await bench(20, 0.45, 27.5);
  await page.click('#sty-tab-trends');
  await page.waitForSelector('#sty-need-trend');
  check('stylus: AC-4 fewer than 3 benchmarks says "Need 3 benchmarks for a trend"', /Need 3 benchmarks for a trend/.test(await text('#sty-need-trend')));
  await page.click('#sty-tab-benchmark');
  await bench(45, 0.6, 26);
  await bench(60, 0.9, 20, false);
  await bench(80, 1.8, 23);
  await bench(90, 2.2, 21);
  await page.click('#sty-tab-trends');
  await page.waitForSelector('.sty-fig[data-metric="thdPercent"] .sty-chart');
  check('stylus: AC-4 THD and separation trend charts render with slope per 100 h and R²', /per 100 h/.test(await text('.sty-fig[data-metric="thdPercent"] .sty-fit-text')) && /R²/.test(await text('.sty-fig[data-metric="separationDb"] .sty-fit-text')));
  check('stylus: charts draw regression line, limit band and one hollow excluded point', (await page.locator('.sty-fig[data-metric="thdPercent"] .sty-fit').count()) === 1 && (await page.locator('.sty-fig[data-metric="thdPercent"] .sty-band').count()) === 1 && (await page.locator('.sty-fig[data-metric="thdPercent"] .sty-dot-x').count()) === 1);
  check('stylus: timecode metrics without data are listed as not shown', /Timecode metrics need a DVS interface/.test(await text('#sty-hidden-metrics')));
  await shot(page, 'stylus-trends-dark');
  await page.click('.sty-fig[data-metric="thdPercent"] [data-point]:last-of-type');
  await page.waitForFunction(() => /Benchmark on/.test(document.querySelector('#sty-point-detail')?.textContent || ''));
  check('stylus: selecting a point shows its benchmark', /THD 2\.2 %/.test(await text('#sty-point-detail')));
  await page.keyboard.press('Escape');
  check('stylus: Esc clears the point selection', /Select a point/.test(await text('#sty-point-detail')));
  await page.click('[data-table-toggle="thdPercent"]');
  check('stylus: data table toggle lists points as text', (await page.locator('.sty-fig[data-metric="thdPercent"] .sty-data-table tbody tr').count()) === 6);
  // AC-6 alert regardless of hours
  await page.click('#sty-tab-overview');
  await page.waitForSelector('.sty-alert');
  check('stylus: AC-6 a benchmark degradation alert appears', (await page.locator('.sty-alert[data-kind^="bench:"]').count()) >= 1, await text('#sty-panel'));
  await shot(page, 'stylus-overview-bench-alert');

  // settings
  await page.click('#sty-tab-settings');
  await page.fill('#sty-rated', '600');
  await page.click('#sty-life-form button[type="submit"]');
  await page.waitForFunction(() => window.__sty.rated === 600);
  await page.click('#sty-tab-settings');
  check('stylus: rated life override is saved and used', /Using your figure: 600 h/.test(await text('#sty-rated-source')));
  await page.fill('#sty-amber', '90'); await page.fill('#sty-red', '80');
  await page.click('#sty-thr-form button[type="submit"]');
  check('stylus: invalid thresholds are rejected', /Amber must be/.test(await text('#sty-thr-error')));
  await shot(page, 'stylus-settings');

  // light theme
  await page.click('#sty-tab-trends');
  await page.click('#theme-toggle');
  await page.waitForSelector('.sty-fig[data-metric="thdPercent"] .sty-chart');
  await shot(page, 'stylus-trends-light');
  await page.click('#sty-tab-overview');
  await shot(page, 'stylus-overview-light');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ['overview', 'hours', 'benchmark', 'trends', 'settings']) {
    await page.click(`#sty-tab-${tab}`);
    const over = await page.evaluate(() => (document.documentElement.scrollWidth > window.innerWidth + 1 || document.getElementById('main').scrollWidth > document.getElementById('main').clientWidth + 1)
      ? [...document.querySelectorAll('#sty-panel *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.table-wrap')).slice(0, 3).map(e => `${e.tagName}.${e.className?.baseVal ?? e.className}`).join(' | ') || 'shell' : '');
    check(`stylus: no horizontal page scroll at phone width (${tab})`, over === '', over);
  }
  await shot(page, 'stylus-phone');
  await ctx.close();
  return errors;
}
