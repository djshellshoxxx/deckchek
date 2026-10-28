// FS-21 smoke: Compare screen. Flag off = hidden; browser mode = "needs the desktop app"; desktop mode with an in-memory
// implementation of the unit/pack commands covers the Spec tab (AC-1), sibling ranking and history (AC-2, AC-3), the
// Population tab empty state, "Not enough data (5 of 20)" (AC-6), a percentile once 41 contributors exist, pack preview and
// import (AC-5), removal (AC-9), the anonymous export preview (AC-4), a typed import error, Esc/cancel, the tab keys, phone
// width and both themes.
import { watchConsole, tauriMock, setViewport, a11yAudit } from './core.mjs';

const setFlags = flags => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: flags })); };

// Desktop mode: tauriMock plus the unit/pack commands. `window.__cmp` exposes state for the test.
export function compareMock() {
  const core = window.__TAURI__.core; const base = core.invoke;
  const key = 'pioneer-plx-crss12';
  const row = (assetId, nickname, metric, value, unit, at) => ({ assetId, nickname, productKey: key, metric, methodKey: metric, methodVersion: 1, unit, value, at });
  const cmp = {
    calls: [], packs: [], rows: [], contributors: 41, state: {}, fail: null,
    units: [
      row('a-1', 'Deck 1', 'wow_flutter_rms_percent', 0.2, '%', '2026-10-01T10:00:00Z'), row('a-1', 'Deck 1', 'wow_flutter_rms_percent', 0.16, '%', '2026-10-08T10:00:00Z'),
      row('a-1', 'Deck 1', 'wow_flutter_rms_percent', 0.12, '%', '2026-10-15T10:00:00Z'), row('a-2', 'Deck 2', 'wow_flutter_rms_percent', 0.18, '%', '2026-10-10T10:00:00Z'),
      row('a-1', 'Deck 1', 'channel_separation_db', 31.5, 'dB', '2026-10-15T10:00:00Z'),
    ],
  };
  window.__cmp = cmp;
  const fixtureRows = n => Array.from({ length: n }, (_, i) => ({ contributor: `c${i}`, product: key, metric: 'wow_flutter_rms_percent', method: { key: 'wow_flutter_rms_percent', version: 1 }, value: 0.08 + (i % 41) * 0.005, unit: '%' }));
  core.invoke = async (cmd, args = {}) => {
    if (cmd === 'app_state_get') return cmp.state[args.key] ? { value: cmp.state[args.key], updatedAt: 't' } : null;
    if (cmd === 'app_state_set') { cmp.state[args.key] = args.value; return null; }
    if (['population_unit_values', 'pack_list', 'pack_preview', 'pack_import', 'pack_remove', 'pack_export', 'population_query'].includes(cmd)) {
      cmp.calls.push({ cmd, args });
      if (cmp.fail === cmd) throw cmp.failWith;
      if (cmd === 'population_unit_values') return { rows: cmp.units, skippedUnit: 0, skippedUnattributed: 0 };
      if (cmd === 'pack_list') return cmp.packs;
      if (cmd === 'pack_preview') return { packId: 'pack-fixture', createdMonth: '2026-10', appVersion: '0.0.8', rows: cmp.contributors, counts: [{ product: key, metric: 'wow_flutter_rms_percent', rows: cmp.contributors }], sha256: 'a'.repeat(64), alreadyImported: cmp.packs.some(p => p.id === 'pack-fixture') };
      if (cmd === 'pack_import') {
        if (cmp.packs.some(p => p.id === 'pack-fixture')) return { packId: 'pack-fixture', accepted: 0, rejected: [], duplicate: true };
        cmp.packs.push({ id: 'pack-fixture', sourceLabel: args.sourceLabel, importedAt: '2026-10-20T10:00:00Z', rowCount: cmp.contributors, sha256: 'a'.repeat(64) });
        cmp.rows = fixtureRows(cmp.contributors);
        return { packId: 'pack-fixture', accepted: cmp.contributors, rejected: [], duplicate: false };
      }
      if (cmd === 'pack_remove') { cmp.packs = cmp.packs.filter(p => p.id !== args.packId); cmp.rows = []; return { removed: true, samplesDeleted: 0 }; }
      if (cmd === 'pack_export') return { packId: args.selection.packId, rows: args.selection.rows.length, bytes: 321, sha256: 'b'.repeat(64), path: args.path };
      if (cmd === 'population_query') { const rows = cmp.rows.filter(r => r.product === args.productId && r.metric === args.metricId); return { rows, contributors: new Set(rows.map(r => r.contributor)).size, truncated: false }; }
    }
    return base(cmd, args);
  };
  window.__TAURI__.dialog = { open: async () => '/mock/in.deckchek-pack', save: async () => '/mock/out.deckchek-pack' };
}

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const shot = async (page, name) => { await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const text = (page, sel) => page.locator(sel).innerText();
  const desktop = async flags => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(tauriMock); await ctx.addInitScript(compareMock); await ctx.addInitScript(setFlags, flags);
    const page = await ctx.newPage();
    errors.push(watchConsole(page, 'compare'));
    await page.goto(base);
    await page.waitForSelector('.rail-item[data-screen="compare"]');
    return { ctx, page };
  };

  // ----- flag off -----
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const po = await off.newPage();
  errors.push(watchConsole(po, 'compare-off'));
  await po.goto(base);
  await po.waitForSelector('.rail-item');
  check('compare: flag off hides the Compare screen', (await po.locator('.rail-item[data-screen="compare"]').count()) === 0);
  await off.close();

  // ----- browser mode -----
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await bctx.addInitScript(setFlags, { population: true, packs: true });
  const pb = await bctx.newPage();
  errors.push(watchConsole(pb, 'compare-browser'));
  await pb.goto(base);
  await pb.waitForSelector('.rail-item[data-screen="compare"]');
  await pb.click('.rail-item[data-screen="compare"]');
  await pb.waitForSelector('#cmp-unsupported');
  check('compare: browser mode says it needs the desktop app', /needs the desktop app/i.test(await text(pb, '#cmp-unsupported')));
  check('compare: browser mode offers no sharing controls', (await pb.locator('#cmp-sharing').count()) === 0);
  await bctx.close();

  // ----- desktop, phase 1 only (packs off) -----
  const one = await desktop({ population: true });
  const p1 = one.page;
  await p1.click('.rail-item[data-screen="compare"]');
  await p1.waitForSelector('#cmp-spec');
  check('compare: packs off hides the Population tab and Data sharing', (await p1.locator('#cmp-tab-population').count()) === 0 && (await p1.locator('#cmp-sharing').count()) === 0);
  check('compare: metric without a published spec says so', /No published spec for this metric/.test(await text(p1, '#cmp-spec-text')), await text(p1, '#cmp-spec-text'));
  await p1.selectOption('#cmp-metric', 'wow_flutter_rms_percent');
  await p1.waitForFunction(() => /against a published maximum/.test(document.querySelector('#cmp-spec-text')?.textContent || ''));
  check('compare: AC-1 spec bar shows value, limit and margin in text', /0\.12 % against a published maximum of 0\.15 %\. Inside the limit with 0\.03 % to spare/.test(await text(p1, '#cmp-spec-text')), await text(p1, '#cmp-spec-text'));
  check('compare: AC-1 the bar has a text label and the verdict is not colour only', /spec limit 0\.15/.test(await p1.locator('.cmp-bar').getAttribute('aria-label')) && /INSIDE SPEC/.test(await text(p1, '.cmp-verdict')));
  await shot(p1, 'compare-spec-dark');
  await p1.click('#cmp-tab-units');
  await p1.waitForSelector('#cmp-sib-text');
  check('compare: AC-2 sibling units are ranked', /Deck 1 ranks 1st of 2 of your units/.test(await text(p1, '#cmp-sib-text')), await text(p1, '#cmp-sib-text'));
  check('compare: AC-2 the table marks this unit in text', /Deck 1 \(this unit\)/.test(await text(p1, '#cmp-sib-table')));
  check('compare: AC-3 delta against the median of earlier runs', /0\.06 % below your median of 2 earlier runs \(0\.18\), which is better/.test(await text(p1, '#cmp-hist-text')), await text(p1, '#cmp-hist-text'));
  check('compare: AC-3 sparkline has a text equivalent', /Values over 3 runs/.test(await p1.locator('.cmp-spark svg').getAttribute('aria-label')));
  // tab keyboard
  await p1.focus('#cmp-tab-units');
  await p1.keyboard.press('ArrowLeft');
  check('compare: arrow keys move between tabs', await p1.evaluate(() => document.activeElement?.id === 'cmp-tab-spec' && document.querySelector('#cmp-tab-spec').getAttribute('aria-selected') === 'true'));
  await one.ctx.close();

  // ----- desktop, packs on -----
  const two = await desktop({ population: true, packs: true });
  const p = two.page;
  await p.click('.rail-item[data-screen="compare"]');
  await p.waitForSelector('#cmp-sharing');
  await p.selectOption('#cmp-metric', 'wow_flutter_rms_percent');
  await p.click('#cmp-tab-population');
  await p.waitForSelector('#cmp-pop-empty');
  check('compare: empty population invites an import', /Import a pack to see how your unit compares/.test(await text(p, '#cmp-pop-empty')));
  check('compare: privacy copy is shown', /No serial numbers, names, dates or locations/.test(await text(p, '#cmp-sharing')));

  // import with only 5 contributors -> not enough data
  await p.evaluate(() => { window.__cmp.contributors = 5; });
  await p.click('#cmp-import');
  await p.waitForSelector('#cmp-imp-confirm');
  check('compare: AC-5 import preview shows counts per model and metric', /pioneer-plx-crss12/.test(await text(p, '#cmp-imp-table')) && /Wow and flutter/.test(await text(p, '#cmp-imp-table')) && /5 results/.test(await text(p, '#cmp-imp-title + p')));
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.querySelector('dialog[open]'));
  check('compare: Esc cancels the import and nothing is added', (await p.evaluate(() => window.__cmp.packs.length)) === 0 && /Import cancelled/.test(await text(p, '#cmp-status')));
  check('compare: focus returns to the Import button after the dialog', await p.evaluate(() => document.activeElement?.id === 'cmp-import'));
  await p.click('#cmp-import');
  await p.fill('#cmp-imp-label', 'Shop A');
  await p.click('#cmp-imp-confirm');
  await p.waitForSelector('#cmp-packs');
  await p.waitForFunction(() => /Not enough data/.test(document.querySelector('#cmp-pop-text')?.textContent || ''));
  check('compare: AC-6 fewer than 20 contributors shows "Not enough data (5 of 20)"', /Not enough data \(5 of 20\)/.test(await text(p, '#cmp-pop-text')), await text(p, '#cmp-pop-text'));
  check('compare: AC-6 no percentile is claimed below the minimum', !/percentile/.test(await text(p, '#cmp-pop-text')));
  check('compare: imported pack is listed with its label', /Shop A/.test(await text(p, '#cmp-packs')));
  check('compare: selection-bias caveat is shown', /self-selected/.test(await text(p, '#cmp-population')));

  // AC-8 importing the same pack again changes nothing
  await p.click('#cmp-import');
  await p.waitForSelector('#cmp-imp-confirm');
  check('compare: AC-8 an already imported pack is flagged in the preview', /already imported/.test(await text(p, '#cmp-imp-title + p')));
  await p.click('#cmp-imp-confirm');
  await p.waitForFunction(() => /already imported/.test(document.querySelector('#cmp-status')?.textContent || ''));
  check('compare: AC-8 importing twice adds no second pack', (await p.evaluate(() => window.__cmp.packs.length)) === 1);

  // AC-9 remove, then a larger pack gives a percentile
  await p.click('[aria-label="Remove pack Shop A"]');
  await p.waitForSelector('#cmp-no-packs');
  check('compare: AC-9 removing a pack deletes it and recomputes', /Percentiles were recomputed/.test(await text(p, '#cmp-status')) && /Import a pack/.test(await text(p, '#cmp-pop-empty')));
  await p.evaluate(() => { window.__cmp.contributors = 41; });
  await p.click('#cmp-import');
  await p.click('#cmp-imp-confirm');
  await p.waitForFunction(() => /percentile of 41 contributors/.test(document.querySelector('#cmp-pop-text')?.textContent || ''));
  check('compare: percentile text names rank, contributors and direction', /Your value 0\.12 % is at the \d+(st|nd|rd|th) percentile of 41 contributors \(41 units\)(, about \d+(st|nd|rd|th) to \d+(st|nd|rd|th))?\. Higher percentile is better\./.test(await text(p, '#cmp-pop-text')), await text(p, '#cmp-pop-text'));
  check('compare: strip plot has the same text equivalent', /percentile of 41 contributors/.test(await p.locator('#cmp-strip').getAttribute('aria-label')) && (await p.locator('#cmp-strip .cmp-dot').count()) > 0);
  await p.click('.cmp-details summary');
  check('compare: data table lists one value per contributor', (await p.locator('#cmp-pop-table tbody tr').count()) === 41);
  await shot(p, 'compare-population-dark');

  // a typed import error
  await p.evaluate(() => { window.__cmp.fail = 'pack_preview'; window.__cmp.failWith = { code: 'unsupported_version', message: 'Pack version 3 needs a different version of DeckChek', rows: [] }; });
  await p.click('#cmp-import');
  await p.waitForFunction(() => /Pack version 3 needs a different version/.test(document.querySelector('#cmp-status')?.textContent || ''));
  check('compare: unsupported pack version shows a typed, friendly error', (await p.locator('#cmp-status [role="alert"]').count()) === 1);
  await p.evaluate(() => { window.__cmp.failWith = { code: 'invalid_rows', message: '2 row(s) are not valid, so the pack was not imported', rows: [{ row: 3, reason: 'value is outside the plausible range' }] }; });
  await p.click('#cmp-import');
  await p.waitForFunction(() => /Row 3: value is outside the plausible range/.test(document.querySelector('#cmp-status')?.textContent || ''));
  check('compare: rejected rows are listed with reasons', /Row 3: value is outside the plausible range/.test(await text(p, '#cmp-status')));
  await p.evaluate(() => { window.__cmp.fail = null; });

  // export (AC-4)
  await p.click('#cmp-export');
  await p.waitForSelector('#cmp-exp-save');
  check('compare: first-time export starts with nothing ticked and Save disabled', (await p.locator('.cmp-cell input:checked').count()) === 0 && await p.isDisabled('#cmp-exp-save'));
  await p.check('#cmp-cell-1');
  await p.waitForFunction(() => /deckchek-pack/.test(document.querySelector('#cmp-json')?.textContent || ''));
  const json = await text(p, '#cmp-json');
  const parsed = JSON.parse(json);
  check('compare: AC-4 preview holds only whitelisted fields', JSON.stringify(Object.keys(parsed).sort()) === JSON.stringify(['appVersion', 'contributor', 'createdMonth', 'format', 'packId', 'rows', 'version'])
    && parsed.rows.every(r => JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['method', 'metric', 'product', 'unit', 'value'])), json.slice(0, 200));
  check('compare: AC-4 preview leaks no nickname, serial, unit id or path', !/Deck|serial|nickname|path|\ba-[12]\b|SN-/i.test(JSON.stringify(parsed.rows)), json);
  check('compare: AC-4 values are rounded to three significant figures', parsed.rows.every(r => Number(r.value.toPrecision(3)) === r.value));
  await p.click('#cmp-exp-save');
  await p.waitForFunction(() => window.__cmp.calls.some(c => c.cmd === 'pack_export'));
  const sent = await p.evaluate(() => window.__cmp.calls.find(c => c.cmd === 'pack_export').args);
  check('compare: AC-4 the native export receives whitelisted rows only', sent.selection.rows.every(r => JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['method', 'metric', 'product', 'unit', 'value'])) && !('units' in sent.selection.rows[0]) && sent.path.endsWith('.deckchek-pack'));
  check('compare: AC-4 the saved file is the previewed pack', sent.selection.packId === parsed.packId && sent.selection.contributor === parsed.contributor && sent.selection.createdMonth === parsed.createdMonth);
  await p.waitForFunction(() => /Saved 1 result/.test(document.querySelector('#cmp-status')?.textContent || ''));
  const token = await p.evaluate(() => window.__cmp.state['population.contributor']);
  check('compare: the export stored a contributor token matching the pack', typeof token === 'string' && token === sent.selection.contributor);
  await p.click('#cmp-reset-token');
  await p.waitForFunction(() => /token reset/i.test(document.querySelector('#cmp-status')?.textContent || ''));
  check('compare: resetting the contributor token stores a new one', (await p.evaluate(() => window.__cmp.state['population.contributor'])) !== token);

  // themes, a11y, phone width
  const audit = await a11yAudit(p);
  check('compare: a11y names + target sizes', !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
  await p.click('#theme-toggle');
  await shot(p, 'compare-population-light');
  await setViewport(p, { width: 390, height: 844 });
  for (const tab of ['spec', 'units', 'population']) {
    await p.click(`#cmp-tab-${tab}`);
    await p.waitForTimeout(150);
    const over = await p.evaluate(() => [...document.querySelectorAll('#screen-compare *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.table-wrap')).slice(0, 3).map(e => `${e.tagName}.${e.className?.baseVal ?? e.className}`).join(', '));
    check(`compare: no horizontal overflow at phone width (${tab})`, over === '', over);
  }
  await shot(p, 'compare-phone');
  await two.ctx.close();
  return errors.flat();
}
