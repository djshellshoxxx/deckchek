// FS-23 smoke: Venue fleet dashboard. Default flag is ON (DEVELOPMENT-PLAN §1.6): a context with no stored flag must show
// the Fleet rail entry; an explicit override of false hides it. Desktop mode runs against an in-memory implementation of
// the fleet commands (window.__fleet exposes state). Covers AC-1/2/3 (grid, never tested, failing items), AC-4/6 (start-up
// banner: copy, cap of five with "and N more", dismiss snoozes without deleting), AC-7 (completing a reminder), AC-8 (CSV
// bytes), AC-9 (one-page booth sheet), the venues editor (empty guide, Move to, delete confirmation), the reminders and
// events tabs, tiles, keyboard (/, E, N, arrows, tabs), browser mode, and no console errors.
import { watchConsole, tauriMock, a11yAudit } from './core.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { registerBoothSheet } from '../../app/ui/booth-sheet.js';
import { composePrintable } from '../../app/report-pdf.js';

function fleetMock(options = {}) {
  const before = window.__TAURI__.core.invoke;
  const old = new Date(Date.now() - 200 * 86400000).toISOString(), now = new Date().toISOString();
  const data = { products: [{ id: 'model', model: 'Test turntable' }], templates: [],
    venues: options.noVenues ? [] : [{ id: 'v', name: 'Club' }], booths: options.noVenues ? [] : [{ id: 'b', venueId: 'v', name: 'Booth' }], positions: options.noVenues ? [] : [{ id: 'p', boothId: 'b', name: 'Left' }, { id: 'p2', boothId: 'b', name: 'Right' }],
    rows: [
      { assetId: 'a', productId: 'model', nickname: 'Deck A', productName: 'Test turntable', serialNumber: 'SN1', category: 'turntable', createdAt: old, installedDate: old, hoursTotal: 510, deckPositionId: options.noVenues ? null : 'p', position: options.noVenues ? null : 'Left', boothId: options.noVenues ? null : 'b', booth: options.noVenues ? null : 'Booth', venueId: options.noVenues ? null : 'v', venue: options.noVenues ? null : 'Club',
        lastResults: [{ testId: 'signal', name: 'Signal path is clean', status: 'fail', createdAt: now }], reminders: [{ id: 'r', assetId: 'a', title: 'Clean faders', basis: 'days', intervalValue: 90, warnBefore: 14, enabled: true, createdAt: old, lastDoneAt: null, hoursAtLastEvent: null }] },
      { assetId: 'other', nickname: 'Untested mixer', productName: 'Test mixer', category: 'mixer', createdAt: old, hoursTotal: 0, lastResults: [], lastSessionAt: now, reminders: [] },
    ] };
  for (let i = 0; i < (options.extraOverdue || 0); i++) {
    data.rows.push({ assetId: `x${i}`, nickname: `Extra ${i}`, createdAt: old, installedDate: old, hoursTotal: 0, lastResults: [], reminders: [{ id: `xr${i}`, assetId: `x${i}`, title: `Task ${i}`, basis: 'days', intervalValue: 30, warnBefore: 14, enabled: true, createdAt: old }] });
  }
  const events = []; window.__fleet = { data, events, csv: null, calls: [] };
  window.__TAURI__.dialog = { save: async () => '/tmp/fleet.csv' };
  window.__TAURI__.core.invoke = async (command, args = {}) => {
    window.__fleet.calls.push(command);
    if (command === 'fleet_snapshot') return structuredClone(data);
    if (command === 'maintenance_list') return events.filter(e => (!args.assetId || e.assetId === args.assetId) && (!args.eventType || e.eventType === args.eventType) && (!args.from || e.eventAt.slice(0, 10) >= args.from) && (!args.to || e.eventAt.slice(0, 10) <= args.to)).map(e => ({ ...e, assetName: data.rows.find(r => r.assetId === e.assetId)?.nickname }));
    if (command === 'reminder_snooze') { for (const row of data.rows) for (const reminder of row.reminders) if (reminder.id === args.id) reminder.snoozedUntil = args.untilIso; return null; }
    if (command === 'reminder_upsert') { const row = data.rows.find(r => r.assetId === args.input.assetId); const id = `r${row.reminders.length + 1}`; row.reminders.push({ ...args.input, id, enabled: true, createdAt: now }); return id; }
    if (command === 'reminder_template_upsert') { const id = args.input.id || `template-${data.templates.length + 1}`; data.templates = data.templates.filter(t => t.id !== id); data.templates.push({ ...args.input, id }); return id; }
    if (command === 'reminder_apply_template') { const row = data.rows.find(r => r.assetId === args.assetId), template = data.templates.find(t => t.id === args.templateId); if (row.productId !== template.productId) throw 'wrong product'; const id = `${template.id}:${row.assetId}`; row.reminders = row.reminders.filter(r => r.id !== id); row.reminders.push({ ...template, id, enabled: true, createdAt: now }); return id; }
    if (command === 'maintenance_log') { const event = { ...args.input, id: `e${events.length + 1}`, hoursAtEvent: 510 }; events.push(event); for (const row of data.rows) for (const reminder of row.reminders) if (reminder.id === event.reminderId) { reminder.lastDoneAt = event.eventAt; reminder.hoursAtLastEvent = 510; } return event.id; }
    if (command === 'fleet_place_asset') {
      const row = data.rows.find(r => r.assetId === args.assetId), position = data.positions.find(p => p.id === args.deckPositionId);
      row.deckPositionId = args.deckPositionId; row.position = position?.name ?? null; row.boothId = position ? 'b' : null; row.booth = position ? 'Booth' : null; row.venueId = position ? 'v' : null; row.venue = position ? 'Club' : null; return null;
    }
    if (command === 'booth_upsert') { const id = args.input.id || `b${data.booths.length + 1}`; data.booths = data.booths.filter(row => row.id !== id); data.booths.push({ id, venueId: args.input.parentId, name: args.input.name }); return id; }
    if (command === 'position_upsert') { const id = `p${data.positions.length + 10}`; data.positions.push({ id, boothId: args.input.parentId, name: args.input.name }); return id; }
    if (command === 'catalog_upsert' && args.entity === 'venue') { const id = args.record.id || `v${data.venues.length + 1}`; data.venues = data.venues.filter(v => v.id !== id); data.venues.push({ id, name: args.record.name }); return { ...args.record, id }; }
    if (command === 'userfiles_write_text' && args.allowedExt === 'csv') { window.__fleet.csv = args.content; return { path: args.path, bytes: args.content.length }; }
    if (command === 'fleet_location_delete') {
      window.__fleet.deletion = structuredClone(args);
      if (args.kind === 'position') {
        const assets = data.rows.filter(row => row.deckPositionId === args.id);
        if (assets.length && !args.moveTo) throw 'occupied location';
        for (const row of assets) { row.deckPositionId = args.moveTo.deckPositionId; row.position = row.boothId = row.booth = row.venueId = row.venue = null; }
        data.positions = data.positions.filter(row => row.id !== args.id);
      }
      data.booths = data.booths.filter(row => row.id !== args.id); return null;
    }
    return before(command, args);
  };
}

const FLAG_OFF = () => localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { fleet: false } }));

export default async function run({ browser, base, check, ROOT, SHOTS }) {
  const errors = [];
  const open = async (init, ...scripts) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    for (const s of scripts) await context.addInitScript(s);
    if (init) await context.addInitScript(fleetMock, init.mock ?? {});
    const page = await context.newPage();
    errors.push(watchConsole(page, `fleet-${init?.label ?? 'x'}`));
    return { context, page };
  };

  // ----- flag: default on, explicit false hides -----
  {
    const { context, page } = await open(null, tauriMock);
    await page.goto(base); await page.waitForSelector('.rail-item');
    check('fleet: flag defaults ON (rail entry present with no stored override)', (await page.locator('.rail-item[data-screen="fleet"]').count()) === 1);
    await context.close();
    const off = await open({ label: 'off' }, tauriMock, FLAG_OFF);
    await off.page.goto(base); await off.page.waitForSelector('.rail-item');
    await off.page.waitForTimeout(400);
    check('fleet: flag off hides the screen and the start-up banner', (await off.page.locator('.rail-item[data-screen="fleet"]').count()) === 0 && (await off.page.locator('#fleet-reminder-banner').count()) === 0);
    await off.context.close();
  }

  // ----- start-up banner: cap of five + "and N more", dismiss snoozes -----
  {
    const { context, page } = await open({ label: 'many', mock: { extraOverdue: 6 } }, tauriMock);
    await page.goto(base); await page.waitForSelector('#fleet-reminder-banner');
    const text = await page.locator('#fleet-reminder-banner').innerText();
    check('fleet: AC-6 banner copy counts overdue items and offers Review', /7 maintenance items need attention: 7 overdue, 0 due soon\./.test(text) && (await page.locator('#fleet-banner-review').count()) === 1, text);
    check('fleet: AC-6 banner lists five items then "and 2 more"', (await page.locator('#fleet-reminder-banner li').count()) === 5 && /and 2 more/.test(text));
    check('fleet: banner is a non-blocking status region and the rail shows a count badge', (await page.locator('#fleet-reminder-banner').getAttribute('role')) === 'status' && (await page.locator('[data-fleet-badge]').innerText()) === '7');
    check('fleet: banner does not take focus', await page.evaluate(() => !document.getElementById('fleet-reminder-banner').contains(document.activeElement)));
    await page.click('#fleet-banner-dismiss');
    await page.waitForFunction(() => !document.getElementById('fleet-reminder-banner'));
    check('fleet: AC-6 dismiss snoozes every listed reminder for a day and deletes none', await page.evaluate(() => {
      const all = window.__fleet.data.rows.flatMap(r => r.reminders);
      return all.length === 7 && all.every(r => Date.parse(r.snoozedUntil) > Date.now() + 23 * 3600e3);
    }));
    check('fleet: no badge once everything is snoozed', (await page.locator('[data-fleet-badge]').count()) === 0);
    await context.close();
  }

  // ----- desktop: one overdue reminder, full flow -----
  const { context, page } = await open({ label: 'main' }, tauriMock);
  await page.goto(base); await page.waitForSelector('#fleet-reminder-banner');
  check('fleet: banner for one overdue item uses singular copy', /1 maintenance item needs attention: 1 overdue, 0 due soon\./.test(await page.locator('#fleet-reminder-banner').innerText()));
  await page.click('#fleet-banner-review');
  await page.waitForSelector('#fleet-grid');
  check('fleet: Review opens the Fleet screen', await page.locator('#screen-fleet').isVisible());
  const grid = await page.locator('#fleet-grid').innerText();
  check('fleet: AC-1 grid lists asset, location, last tested, health, failing items and next due', /Deck A/.test(grid) && /Club \/ Booth \/ Left/.test(grid) && /Attention/i.test(grid) && /Signal path is clean/.test(grid) && /Clean faders/.test(grid) && /Overdue/i.test(grid), grid.replace(/\s+/g, ' '));
  check('fleet: AC-2 untested asset is "Never tested" and an unplaced asset says so (health never shown as Healthy)', /Untested mixer/.test(grid) && /Never tested/i.test(grid) && /Unplaced/.test(grid) && !/Healthy/i.test(grid));
  check('fleet: AC-3 failing items use readable test names, health has an icon and a word', /Signal path is clean/.test(grid) && (await page.locator('#fleet-grid .fleet-health svg').count()) >= 2);
  const tiles = await page.locator('#fleet-tiles').innerText();
  check('fleet: summary tiles show Attention, Overdue, Due soon, Never tested counts', /1\s*Attention/i.test(tiles) && /1\s*Overdue/i.test(tiles) && /0\s*Due soon/i.test(tiles) && /1\s*Never tested/i.test(tiles), tiles.replace(/\s+/g, ' '));
  await page.click('[data-tile="attention"]');
  check('fleet: a tile filters the grid and reports it as pressed', (await page.locator('#fleet-grid tbody tr').count()) === 1 && (await page.locator('[data-tile="attention"]').getAttribute('aria-pressed')) === 'true');
  await page.click('[data-tile="attention"]');
  check('fleet: pressing the tile again clears the filter', (await page.locator('#fleet-grid tbody tr').count()) === 2);
  await page.click('[data-sort="health"]');
  check('fleet: sortable header sets aria-sort and orders by severity', (await page.locator('th[aria-sort="ascending"]').count()) === 1 && /Deck A/.test(await page.locator('#fleet-grid tbody tr').first().innerText()));
  const audit = await a11yAudit(page);
  check('fleet: a11y names + target sizes on Overview', !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
  await page.screenshot({ path: path.join(SHOTS, 'fleet-overview-dark.png') });

  // keyboard: / focuses the filter, arrows rove through rows, E exports
  await page.locator('#screen-fleet h1').focus();
  await page.keyboard.press('/');
  check('fleet: "/" focuses the filter', await page.evaluate(() => document.activeElement?.id === 'fleet-search'));
  await page.keyboard.type('turntable');
  check('fleet: search filters the actual grid', (await page.locator('#fleet-grid tbody tr').count()) === 1);
  await page.click('#fleet-export'); await page.waitForFunction(() => Boolean(window.__fleet.csv));
  check('fleet: AC-8 CSV is UTF-8 with BOM, CRLF, and holds only the filtered rows', await page.evaluate(() => { const c = window.__fleet.csv; return c.startsWith('﻿') && c.includes('Deck A') && !c.includes('Untested mixer') && c.includes('\r\n') && c.includes('Signal path is clean'); }));
  await page.fill('#fleet-search', '');
  await page.locator('#fleet-grid tbody tr').first().focus();
  await page.keyboard.press('ArrowDown');
  check('fleet: arrow keys move through grid rows (roving tabindex)', await page.evaluate(() => document.activeElement?.matches('#fleet-grid tbody tr') && document.activeElement.tabIndex === 0 && document.querySelectorAll('#fleet-grid tbody tr[tabindex="0"]').length === 1));
  await page.locator('#fleet-grid tbody tr').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('#fleet-event-form');
  check('fleet: Enter on a row opens the side panel with the tracked-hours estimate', /510.0 tracked hours \(estimate\)/.test(await page.locator('#fleet-detail').innerText()));

  // reminders, maintenance, completion (AC-7)
  await page.locator('#fleet-reminder-form input[name="title"]').fill('Inspect stylus');
  await page.locator('#fleet-reminder-form').getByRole('button', { name: 'Save reminder' }).click();
  await page.waitForFunction(() => window.__fleet.data.rows.find(r => r.assetId === 'a').reminders.length === 2);
  check('fleet: a new reminder is saved through the native bridge and listed', (await page.locator('#fleet-detail').innerText()).includes('Inspect stylus'));
  await page.locator('#fleet-event-form select[name="completes"]').selectOption('r');
  await page.locator('#fleet-event-form textarea').fill('Faders cleaned');
  await page.locator('#fleet-event-form').getByRole('button', { name: 'Log event' }).click();
  await page.waitForFunction(() => window.__fleet.events.length === 1);
  await page.waitForFunction(() => document.getElementById('fleet-events')?.textContent.includes('Faders cleaned'));
  check('fleet: AC-7 completing a reminder records the event and resets it to OK', /Clean faders/.test(await page.locator('.fleet-reminders').innerText()) && (await page.locator('.fleet-reminders li').first().innerText()).includes('OK'));
  await page.locator('#fleet-event-filters select').selectOption('repair');
  await page.waitForFunction(() => document.getElementById('fleet-events')?.textContent.includes('No maintenance matches'));
  await page.locator('#fleet-event-filters select').selectOption('');
  await page.locator('#fleet-event-filters input[name="from"]').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await page.waitForFunction(() => document.getElementById('fleet-events')?.textContent.includes('No maintenance matches'));
  check('fleet: per-asset maintenance history filters by type and UTC date', true);
  await page.locator('#fleet-event-filters input[name="from"]').fill('');

  // placement
  await page.selectOption('#fleet-placement', 'p2'); await page.click('#fleet-move');
  await page.waitForFunction(() => window.__fleet.data.rows[0].deckPositionId === 'p2');
  check('fleet: "Move to position" places the asset (keyboard path)', (await page.locator('#fleet-grid tbody').innerText()).includes('Right'));
  await page.selectOption('#fleet-placement', ''); await page.click('#fleet-move');
  await page.waitForFunction(() => window.__fleet.data.rows[0].deckPositionId === null);
  check('fleet: unplacing keeps the asset in the fleet', (await page.locator('#fleet-grid tbody').innerText()).includes('Deck A'));

  // reminders tab + templates
  await page.click('#fleet-tab-reminders');
  await page.waitForSelector('#fleet-templates');
  check('fleet: Reminders tab lists every reminder with its state word', /Inspect stylus/.test(await page.locator('#fleet-reminder-table').innerText()) && /Clean faders/.test(await page.locator('#fleet-reminder-table').innerText()));
  await page.locator('#fleet-templates input[name="title"]').fill('Quarterly inspection');
  await page.locator('#fleet-templates').getByRole('button', { name: 'Save template' }).click();
  await page.waitForFunction(() => window.__fleet.data.templates.length === 1);
  check('fleet: a product reminder template persists', (await page.locator('#fleet-templates').innerText()).includes('Quarterly inspection'));
  await page.getByRole('button', { name: 'Apply to selected asset', exact: true }).click();
  await page.waitForFunction(() => window.__fleet.data.rows[0].reminders.length === 3);
  await page.getByRole('button', { name: 'Apply to selected asset', exact: true }).click();
  check('fleet: applying a template twice does not duplicate reminders', await page.evaluate(() => window.__fleet.data.rows[0].reminders.length === 3));

  // events tab
  await page.click('#fleet-tab-events');
  await page.waitForSelector('#fleet-event-log li');
  check('fleet: Events log shows events across the fleet with asset names', /Deck A/.test(await page.locator('#fleet-event-log').innerText()) && /Faders cleaned/.test(await page.locator('#fleet-event-log').innerText()));
  await page.locator('#fleet-log-form select[name="asset"]').selectOption('other');
  await page.locator('#fleet-log-form select[name="eventType"]').selectOption('inspect');
  await page.locator('#fleet-log-form').getByRole('button', { name: 'Log event' }).click();
  await page.waitForFunction(() => window.__fleet.events.length >= 2);
  check('fleet: the Events tab can log an event for any asset', await page.evaluate(() => window.__fleet.events.some(e => e.assetId === 'other' && e.eventType === 'inspect')));

  // venues tab
  await page.click('#fleet-tab-venues');
  await page.waitForSelector('#fleet-tree');
  check('fleet: venues tree shows venue > booth > position and the unplaced group', /Club/.test(await page.locator('#fleet-tree').innerText()) && /Left/.test(await page.locator('#fleet-tree').innerText()) && (await page.locator('#fleet-unplaced').count()) === 1);
  await page.locator('#fleet-unplaced select[data-move-asset="a"]').selectOption('p');
  await page.waitForFunction(() => window.__fleet.data.rows[0].deckPositionId === 'p');
  check('fleet: "Move to…" in the tree places the asset in a position', (await page.locator('[data-drop-position="p"]').innerText()).includes('Deck A'));
  await page.locator('#fleet-location-form input[name="name"]').fill('Second booth');
  await page.locator('#fleet-location-form').getByRole('button', { name: 'Save location' }).click();
  await page.waitForFunction(() => window.__fleet.data.booths.length === 2);
  await page.locator('#fleet-location-form select[name="existing"]').selectOption('b2');
  await page.locator('#fleet-location-form input[name="name"]').fill('Renamed booth');
  await page.locator('#fleet-location-form').getByRole('button', { name: 'Save location' }).click();
  await page.waitForFunction(() => window.__fleet.data.booths.some(row => row.name === 'Renamed booth'));
  check('fleet: a booth can be added then renamed without changing its identity', await page.evaluate(() => window.__fleet.data.booths.find(row => row.name === 'Renamed booth').id === 'b2'));
  await page.locator('#fleet-location-form select[name="existing"]').selectOption('b2');
  check('fleet: deletion requires typing the exact existing name', await page.getByRole('button', { name: 'Delete empty location', exact: true }).isDisabled());
  await page.locator('#fleet-location-form input[name="confirmation"]').fill('Renamed booth');
  await page.getByRole('button', { name: 'Delete empty location', exact: true }).click();
  await page.waitForFunction(() => window.__fleet.data.booths.length === 1);
  await page.locator('#fleet-location-form select[name="kind"]').selectOption('position');
  await page.locator('#fleet-location-form select[name="existing"]').selectOption('p');
  check('fleet: deletion previews affected counts and excludes its own subtree as a destination', (await page.locator('#fleet-delete-impact').innerText()).includes('1 assets') && (await page.locator('#fleet-location-form select[name="deleteDestination"] option[value="position:p"]').count()) === 0);
  await page.locator('#fleet-location-form select[name="deleteDestination"]').selectOption('unplaced');
  await page.locator('#fleet-location-form input[name="confirmation"]').fill('Left');
  await page.getByRole('button', { name: 'Move assets and delete location', exact: true }).click();
  await page.waitForFunction(() => !window.__fleet.data.positions.some(p => p.id === 'p'));
  check('fleet: occupied deletion needs an explicit destination and keeps the assets', await page.evaluate(() => window.__fleet.deletion.moveTo.deckPositionId === null && window.__fleet.data.rows.length === 2 && window.__fleet.data.rows[0].deckPositionId === null));
  const audit2 = await a11yAudit(page);
  check('fleet: a11y names + target sizes on Venues', !audit2.unnamed.length && !audit2.small.length, [...audit2.unnamed, ...audit2.small].slice(0, 3).join(' | '));
  await page.screenshot({ path: path.join(SHOTS, 'fleet-venues-dark.png') });

  // tab keyboard + N shortcut
  await page.locator('#fleet-tab-venues').focus();
  await page.keyboard.press('ArrowRight');
  check('fleet: arrow keys switch tabs', (await page.locator('#fleet-tab-reminders').getAttribute('aria-selected')) === 'true');
  await page.locator('#fleet-tab-reminders').blur();
  await page.locator('#screen-fleet h1').focus();
  await page.keyboard.press('n');
  check('fleet: "N" jumps to the new-event form', await page.evaluate(() => document.activeElement?.closest('#fleet-log-form') !== null));
  await context.close();

  // ----- empty state -----
  {
    const empty = await open({ label: 'empty', mock: { noVenues: true } }, tauriMock);
    await empty.page.goto(base); await empty.page.waitForSelector('.rail-item[data-screen="fleet"]');
    await empty.page.click('.rail-item[data-screen="fleet"]'); await empty.page.click('#fleet-tab-venues');
    await empty.page.waitForSelector('#fleet-empty');
    const text = await empty.page.locator('#fleet-empty').innerText();
    check('fleet: empty state says "Add your first venue" with a three-step guide', /Add your first venue/.test(text) && (await empty.page.locator('#fleet-empty li').count()) === 3);
    check('fleet: with no venues the location form starts on "Venue"', (await empty.page.locator('#fleet-location-form select[name="kind"]').inputValue()) === 'venue');
    await empty.page.locator('#fleet-location-form input[name="name"]').fill('Home');
    await empty.page.locator('#fleet-location-form').getByRole('button', { name: 'Save location' }).click();
    await empty.page.waitForSelector('#fleet-tree');
    check('fleet: adding the first venue replaces the guide with the tree', /Home/.test(await empty.page.locator('#fleet-tree').innerText()));
    await empty.context.close();
  }

  // ----- error state -----
  {
    const { context: ec, page: ep } = await open({ label: 'error' }, tauriMock);
    await ep.addInitScript(() => { window.__failSnapshot = true; });
    await ep.goto(base); await ep.waitForSelector('.rail-item[data-screen="fleet"]');
    await ep.evaluate(() => { const real = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = async (c, a) => { if (c === 'fleet_snapshot' && window.__failSnapshot) throw 'database is locked'; return real(c, a); }; });
    await ep.click('.rail-item[data-screen="fleet"]'); await ep.waitForSelector('#fleet-retry');
    check('fleet: a load failure shows the reason and a Retry button', /database is locked/.test(await ep.locator('#fleet-status').innerText()));
    await ep.evaluate(() => { window.__failSnapshot = false; });
    await ep.click('#fleet-retry'); await ep.waitForSelector('#fleet-grid');
    check('fleet: Retry recovers', (await ep.locator('#fleet-grid tbody tr').count()) === 2);
    await ec.close();
  }

  // ----- browser mode -----
  {
    const browserContext = await browser.newContext();
    const browserPage = await browserContext.newPage(); errors.push(watchConsole(browserPage, 'fleet-browser'));
    await browserPage.goto(base); await browserPage.click('.rail-item[data-screen="fleet"]');
    await browserPage.waitForSelector('#fleet-unsupported');
    check('fleet: browser mode states native persistence is unavailable (no banner)', /requires the desktop app/.test(await browserPage.locator('#fleet-content').innerText()) && (await browserPage.locator('#fleet-reminder-banner').count()) === 0);
    await browserContext.close();
  }

  // ----- booth sheet: one printed page, escaped -----
  registerBoothSheet();
  const printableRows = Array.from({ length: 8 }, (_, index) => ({ position: `Position ${index + 1}`, deckPositionId: `p${index}`, nickname: `Deck ${index + 1}`, productName: 'Reference deck', serialNumber: `SERIAL-${index + 1}`, lastTestedAt: '2026-10-22', health: 'healthy', reminders: [{ title: 'Clean', state: 'ok', dueAt: '2027-01-01' }] }));
  const { html } = composePrintable('boothSheet', { booth: { name: 'Club booth <b>' }, rows: printableRows, positions: [] }, { css: fs.readFileSync(path.join(ROOT, 'report-print.css'), 'utf8'), paper: 'A4' });
  const printContext = await browser.newContext(), printPage = await printContext.newPage();
  errors.push(watchConsole(printPage, 'fleet-print'));
  await printPage.setContent(html);
  const pdf = await printPage.pdf({ preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  check('fleet: AC-9 an eight-position booth sheet renders as one PDF page', pages === 1, `${pages} pages`);
  check('fleet: AC-9 booth sheet escapes the booth name and has a notes box', !html.includes('Club booth <b>') && html.includes('booth-notes'));
  await printContext.close();
  return errors.flat();
}
