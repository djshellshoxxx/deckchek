// FS-23 smoke: Venue fleet dashboard. The flag defaults OFF pending owner qualification: no stored override hides
// the Fleet rail entry and banner; manual opt-in enables the workflow, and explicit false hides it. Desktop mode runs against an in-memory implementation of
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
    venues: options.noVenues ? [] : [{ id: 'v', name: 'Club', venueType: 'club', city: 'Leeds', region: 'Yorkshire', country: 'GB', notes: 'Load-in at the back' }], booths: options.noVenues ? [] : [{ id: 'b', venueId: 'v', name: 'Booth' }], positions: options.noVenues ? [] : [{ id: 'p', boothId: 'b', name: 'Left' }, { id: 'p2', boothId: 'b', name: 'Right' }],
    rows: [
      { assetId: 'a', productId: 'model', nickname: 'Deck A', productName: 'Test turntable', serialNumber: 'SN1', category: 'turntable', createdAt: old, installedDate: old, hoursTotal: 510, deckPositionId: options.noVenues ? null : 'p', position: options.noVenues ? null : 'Left', boothId: options.noVenues ? null : 'b', booth: options.noVenues ? null : 'Booth', venueId: options.noVenues ? null : 'v', venue: options.noVenues ? null : 'Club',
        lastResults: [{ testId: 'signal', name: 'Signal path is clean', status: 'fail', createdAt: now }], reminders: [{ id: 'r', assetId: 'a', title: 'Clean faders', basis: 'days', intervalValue: 90, warnBefore: 14, enabled: true, createdAt: old, lastDoneAt: null, hoursAtLastEvent: null }] },
      { assetId: 'other', nickname: 'Untested mixer', productName: 'Test mixer', category: 'mixer', createdAt: old, hoursTotal: 0, lastResults: [], lastSessionAt: now, reminders: [] },
    ] };
  for (let i = 0; i < (options.extraOverdue || 0); i++) {
    const placed = options.placeExtra ? { deckPositionId: 'p2', position: 'Right', boothId: 'b', booth: 'Booth', venueId: 'v', venue: 'Club' } : {};
    data.rows.push({ assetId: `x${i}`, nickname: `Extra ${i}`, createdAt: old, installedDate: old, hoursTotal: 0, lastResults: [], ...placed, reminders: [{ id: `xr${i}`, assetId: `x${i}`, title: `Task ${i}`, basis: 'days', intervalValue: 30, warnBefore: 14, enabled: true, createdAt: old }] });
  }
  if (options.longName) {
    const name = 'TechnicsSL1200MK7_left_deck_with_a_very_long_unbroken_nickname_imported_from_a_backup_file_0123456789_ABCDEFGHIJKLMNOP';
    data.rows.push({ assetId: 'long', nickname: name, productName: 'Turntable', createdAt: old, installedDate: old, hoursTotal: 0, lastResults: [{ testId: 'x', name: 'Unbroken_test_title_'.repeat(5), status: 'fail', createdAt: now }], reminders: [{ id: 'lr', assetId: 'long', title: 'Clean_the_tonearm_pivot_bearing_'.repeat(3), basis: 'days', intervalValue: 30, warnBefore: 14, enabled: true, createdAt: old }] });
  }
  const events = []; window.__fleet = { data, events, csv: null, calls: [] };
  window.__TAURI__.dialog = { save: async () => '/tmp/fleet.csv' };
  window.__TAURI__.core.invoke = async (command, args = {}) => {
    window.__fleet.calls.push(command);
    if (options.slow && ['reminder_upsert', 'maintenance_log', 'fleet_place_asset', 'catalog_upsert', 'booth_upsert'].includes(command)) await new Promise(resolve => setTimeout(resolve, options.slow));
    if (command === 'fleet_snapshot') return structuredClone(data);
    if (command === 'maintenance_list') return events.filter(e => (!args.assetId || e.assetId === args.assetId) && (!args.eventType || e.eventType === args.eventType) && (!args.from || e.eventAt.slice(0, 10) >= args.from) && (!args.to || e.eventAt.slice(0, 10) <= args.to)).map(e => ({ ...e, assetName: data.rows.find(r => r.assetId === e.assetId)?.nickname }));
    if (command === 'reminder_snooze') { for (const row of data.rows) for (const reminder of row.reminders) if (reminder.id === args.id) reminder.snoozedUntil = args.untilIso; return null; }
    if (command === 'reminder_upsert') { const row = data.rows.find(r => r.assetId === args.input.assetId); const id = `r${row.reminders.length + 1}`; row.reminders.push({ ...args.input, id, enabled: true, createdAt: now }); return id; }
    if (command === 'reminder_template_upsert') { const id = args.input.id || `template-${data.templates.length + 1}`; data.templates = data.templates.filter(t => t.id !== id); data.templates.push({ ...args.input, id }); return id; }
    if (command === 'reminder_apply_template') { const row = data.rows.find(r => r.assetId === args.assetId), template = data.templates.find(t => t.id === args.templateId); if (row.productId !== template.productId) throw 'wrong product'; const id = `${template.id}:${row.assetId}`; row.reminders = row.reminders.filter(r => r.id !== id); row.reminders.push({ ...template, id, enabled: true, createdAt: now }); return id; }
    if (command === 'reminder_delete') {
      const count = () => data.templates.length + data.rows.reduce((n, r) => n + r.reminders.length, 0), before = count();
      data.templates = data.templates.filter(t => t.id !== args.id);
      for (const row of data.rows) row.reminders = row.reminders.filter(r => r.id !== args.id);
      if (count() === before) throw 'reminder not found';
      return null;
    }
    if (command === 'maintenance_log') { const event = { ...args.input, id: `e${events.length + 1}`, hoursAtEvent: 510 }; events.push(event); for (const row of data.rows) for (const reminder of row.reminders) if (reminder.id === event.reminderId) { reminder.lastDoneAt = event.eventAt; reminder.hoursAtLastEvent = 510; } return event.id; }
    if (command === 'fleet_place_asset') {
      const row = data.rows.find(r => r.assetId === args.assetId), position = data.positions.find(p => p.id === args.deckPositionId);
      row.deckPositionId = args.deckPositionId; row.position = position?.name ?? null; row.boothId = position ? 'b' : null; row.booth = position ? 'Booth' : null; row.venueId = position ? 'v' : null; row.venue = position ? 'Club' : null; return null;
    }
    if (command === 'booth_upsert') { const id = args.input.id || `b${data.booths.length + 1}`; data.booths = data.booths.filter(row => row.id !== id); data.booths.push({ id, venueId: args.input.parentId, name: args.input.name }); return id; }
    if (command === 'position_upsert') { const id = `p${data.positions.length + 10}`; data.positions.push({ id, boothId: args.input.parentId, name: args.input.name }); return id; }
    // Like catalog::upsert: the record replaces every venue column, so a missing key is stored as null.
    if (command === 'catalog_upsert' && args.entity === 'venue') { const id = args.record.id || `v${data.venues.length + 1}`; const saved = { id, ...Object.fromEntries(['name', 'venueType', 'city', 'region', 'country', 'notes'].map(k => [k, args.record[k] ?? null])) }; data.venues = data.venues.filter(v => v.id !== id); data.venues.push(saved); return saved; }
    if (command === 'catalog_list' && args.entity === 'venue') return structuredClone(data.venues);
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

const FLAG_ON = () => localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { fleet: true } }));
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

  // ----- flag: default off, manual UI opt-in, explicit false hides -----
  {
    const { context, page } = await open({ label: 'default' }, tauriMock);
    await page.goto(base); await page.waitForSelector('.rail-item');
    await page.waitForTimeout(400);
    check('fleet: flag defaults OFF with no stored override (rail entry and banner hidden)',
      await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.ui.v1') || '{}').features?.fleet === undefined)
      && (await page.locator('.rail-item[data-screen="fleet"]').count()) === 0
      && (await page.locator('#fleet-reminder-banner').count()) === 0);
    await page.click('#cdlOptionsBtn');
    await page.waitForSelector('#cdlOptionsDialog [data-support-id="experimental"]');
    await page.click('#cdlOptionsDialog [data-support-id="experimental"]');
    await page.waitForSelector('dialog.experimental-dialog[open]');
    const fleetSwitch = page.locator('dialog.experimental-dialog [data-feature="fleet"]');
    check('fleet: Experimental features lists fleet unchecked for manual opt-in', (await fleetSwitch.count()) === 1 && !(await fleetSwitch.isChecked()));
    await fleetSwitch.check();
    await page.waitForSelector('.rail-item[data-screen="fleet"]');
    await page.waitForSelector('#fleet-reminder-banner');
    check('fleet: manual opt-in persists true and reveals the rail and reminder banner live',
      await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.ui.v1') || '{}').features?.fleet === true)
      && (await page.locator('.rail-item[data-screen="fleet"]').count()) === 1
      && (await page.locator('#fleet-reminder-banner').count()) === 1);
    await page.click('[data-experimental-close]');
    await page.waitForFunction(() => !document.querySelector('dialog.experimental-dialog'));
    await page.click('.rail-item[data-screen="fleet"]');
    await page.waitForSelector('#fleet-grid');
    check('fleet: manually opted-in Fleet screen renders the seeded assets', await page.locator('#screen-fleet').isVisible() && /Deck A/.test(await page.locator('#fleet-grid').innerText()));
    await context.close();
    const off = await open({ label: 'off' }, tauriMock, FLAG_OFF);
    await off.page.goto(base); await off.page.waitForSelector('.rail-item');
    await off.page.waitForTimeout(400);
    check('fleet: flag off hides the screen and the start-up banner', (await off.page.locator('.rail-item[data-screen="fleet"]').count()) === 0 && (await off.page.locator('#fleet-reminder-banner').count()) === 0);
    await off.context.close();
  }

  // ----- start-up banner: cap of five + "and N more", dismiss snoozes -----
  {
    const { context, page } = await open({ label: 'many', mock: { extraOverdue: 6 } }, tauriMock, FLAG_ON);
    await page.goto(base); await page.waitForSelector('#fleet-reminder-banner');
    const text = await page.locator('#fleet-reminder-banner').innerText();
    check('fleet: AC-6 banner copy counts overdue items and offers Review', /7 maintenance items need attention: 7 overdue, 0 due soon\./.test(text) && (await page.locator('#fleet-banner-review').count()) === 1, text);
    check('fleet: AC-6 banner lists five items then "and 2 more"', (await page.locator('#fleet-reminder-banner li').count()) === 5 && /and 2 more/.test(text));
    check('fleet: banner is a non-blocking status region and the rail shows a count badge', (await page.locator('#fleet-reminder-banner').getAttribute('role')) === 'status' && (await page.locator('[data-fleet-badge]').innerText()) === '7');
    check('fleet: banner does not take focus', await page.evaluate(() => !document.getElementById('fleet-reminder-banner').contains(document.activeElement)));
    await page.locator('#fleet-banner-dismiss').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('fleet-reminder-banner'));
    await page.waitForFunction(() => /snoozed/i.test(document.getElementById('sr-polite')?.textContent ?? ''), null, { timeout: 2000 }).catch(() => {});
    check('fleet: regression: dismissing the banner keeps focus in the app and announces the snooze', await page.evaluate(() => document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected && /snoozed/i.test(document.getElementById('sr-polite')?.textContent ?? '')),
      await page.evaluate(() => `${document.activeElement?.tagName} | ${document.getElementById('sr-polite')?.textContent}`));
    check('fleet: AC-6 dismiss snoozes every listed reminder for a day and deletes none', await page.evaluate(() => {
      const all = window.__fleet.data.rows.flatMap(r => r.reminders);
      return all.length === 7 && all.every(r => Date.parse(r.snoozedUntil) > Date.now() + 23 * 3600e3);
    }));
    check('fleet: no badge once everything is snoozed', (await page.locator('[data-fleet-badge]').count()) === 0);
    await context.close();
  }

  // ----- desktop: one overdue reminder, full flow -----
  const { context, page } = await open({ label: 'main' }, tauriMock, FLAG_ON);
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
  check("fleet: regression: the maintenance date cannot be set past tomorrow's local date", await page.evaluate(() => {
    const t = new Date(); t.setDate(t.getDate() + 1);
    const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    return document.querySelector('#fleet-event-form input[name="date"]')?.max === tomorrow;
  }), await page.locator('#fleet-event-form input[name="date"]').getAttribute('max'));

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

  // deleting an applied reminder and a template: confirm dialog, Cancel keeps it, focus comes back
  const delReminder = page.locator('#fleet-asset-reminders [data-delete-reminder="template-1:a"]');
  check('fleet: regression: each reminder of the selected asset has a named Delete button', (await delReminder.count()) === 1 && /Delete reminder Quarterly inspection from Deck A/.test(await delReminder.getAttribute('aria-label')));
  await delReminder.focus(); await page.keyboard.press('Enter');
  await page.waitForSelector('#confirm-dialog[open]');
  check('fleet: regression: deleting a reminder asks for confirmation first', /Delete reminder/.test(await page.locator('#confirm-title').innerText()) && await page.evaluate(() => !window.__fleet.calls.includes('reminder_delete')));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('confirm-dialog').open);
  check('fleet: regression: cancelling the delete keeps the reminder and returns focus to its Delete button', await page.evaluate(() => window.__fleet.data.rows[0].reminders.some(r => r.id === 'template-1:a') && document.activeElement?.getAttribute('data-delete-reminder') === 'template-1:a'));
  await page.keyboard.press('Enter');
  await page.waitForSelector('#confirm-dialog[open]');
  await page.click('#confirm-ok');
  await page.waitForFunction(() => !window.__fleet.data.rows[0].reminders.some(r => r.id === 'template-1:a'));
  await page.waitForFunction(() => document.activeElement?.closest('#fleet-templates'), null, { timeout: 2000 }).catch(() => {});
  check('fleet: regression: a confirmed reminder delete calls reminder_delete and keeps focus in the templates panel', await page.evaluate(() => window.__fleet.calls.includes('reminder_delete') && Boolean(document.activeElement?.closest('#fleet-templates'))),
    await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 120)));
  const delTemplate = page.locator('#fleet-templates [data-delete-reminder="template-1"]');
  check('fleet: regression: each template has a named Delete button', (await delTemplate.count()) === 1 && /Delete template Quarterly inspection/.test(await delTemplate.getAttribute('aria-label')));
  await delTemplate.click();
  await page.waitForSelector('#confirm-dialog[open]');
  await page.click('#confirm-ok');
  await page.waitForFunction(() => window.__fleet.data.templates.length === 0);
  await page.waitForFunction(() => document.activeElement?.matches('#fleet-template-form select[name="existing"]'), null, { timeout: 2000 }).catch(() => {});
  check('fleet: regression: deleting the last template removes it and moves focus to the template editor', !(await page.locator('#fleet-templates').innerText()).includes('Quarterly inspection') && await page.evaluate(() => document.activeElement?.matches('#fleet-template-form select[name="existing"]')),
    await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 120)));

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
  await page.locator('#fleet-unplaced select[data-move-asset="a"]').focus();
  await page.locator('#fleet-unplaced select[data-move-asset="a"]').selectOption('p');
  await page.click('#fleet-unplaced [data-move-go="a"]');
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

  // ----- regressions (FS-23 review): data safety, keyboard and screen-reader behaviour -----
  {
    const { context: rc, page: rp } = await open({ label: 'reg', mock: { slow: 150 } }, tauriMock, FLAG_ON);
    const polite = () => rp.evaluate(() => document.getElementById('sr-polite')?.textContent ?? '');
    const waitPolite = async re => rp.waitForFunction(source => new RegExp(source, 'i').test(document.getElementById('sr-polite')?.textContent ?? ''), re.source, { timeout: 3000 }).then(() => true, () => false);
    const active = () => rp.evaluate(() => { const el = document.activeElement; return !el || el === document.body ? 'BODY' : el.id ? `#${el.id}` : el.outerHTML.slice(0, 80); });
    const placeCalls = () => rp.evaluate(() => window.__fleet.calls.filter(c => c === 'fleet_place_asset').length);
    await rp.goto(base); await rp.waitForSelector('#fleet-reminder-banner');

    // overlapping banner refreshes leave exactly one banner
    await rp.evaluate(() => { for (let i = 0; i < 3; i++) globalThis.dispatchEvent(new Event('deckchek:fleet-changed')); });
    await rp.waitForTimeout(500);
    check('fleet: regression: overlapping banner refreshes keep a single banner', (await rp.locator('[id="fleet-reminder-banner"]').count()) === 1, `${await rp.locator('[id="fleet-reminder-banner"]').count()} banners`);

    await rp.click('.rail-item[data-screen="fleet"]'); await rp.waitForSelector('#fleet-grid');

    // filter select: arrow keys keep focus on the select and announce the result count
    await rp.locator('[data-fleet-filter="status"]').focus();
    await rp.keyboard.press('ArrowDown');
    await rp.waitForTimeout(100);
    check('fleet: regression: changing a filter select keeps focus on it', await rp.evaluate(() => document.activeElement?.dataset?.fleetFilter === 'status'), await active());
    check('fleet: regression: a filter change announces the result count', await waitPolite(/\d+ assets?\b/), await polite());
    await rp.locator('[data-fleet-filter="status"]').selectOption('');
    // tile: focus stays on the pressed tile, count announced
    await rp.locator('[data-tile="attention"]').focus(); await rp.keyboard.press('Enter');
    check('fleet: regression: pressing a tile keeps focus on it and announces the count', await rp.evaluate(() => document.activeElement?.dataset?.tile === 'attention' && document.activeElement.getAttribute('aria-pressed') === 'true') && await waitPolite(/^1 asset/), `${await active()} | ${await polite()}`);
    await rp.keyboard.press('Enter');
    // sort header keeps focus
    await rp.locator('[data-sort="health"]').focus(); await rp.keyboard.press('Enter');
    check('fleet: regression: activating a sort header keeps focus on it and announces the order', await rp.evaluate(() => document.activeElement?.dataset?.sort === 'health') && await waitPolite(/sorted by health/), `${await active()} | ${await polite()}`);
    // tab click with Enter keeps focus on the tab
    await rp.locator('#fleet-tab-reminders').focus(); await rp.keyboard.press('Enter');
    check('fleet: regression: activating a tab with Enter keeps focus on that tab', await rp.evaluate(() => document.activeElement?.id === 'fleet-tab-reminders'), await active());
    await rp.locator('#fleet-tab-overview').focus(); await rp.keyboard.press('Enter');
    await rp.waitForSelector('#fleet-grid');

    // asset panel: unchanged "Move asset" does not log a fake move
    await rp.locator('[data-fleet-asset="a"] .fleet-asset-name').click();
    await rp.waitForSelector('#fleet-reminder-form');
    await rp.click('#fleet-move'); await rp.waitForTimeout(400);
    check('fleet: regression: "Move asset" with the placement unchanged does not call place', (await placeCalls()) === 0 && /already/i.test(await polite()), `${await placeCalls()} calls | ${await polite()}`);
    check('fleet: regression: the per-asset maintenance history is not an aria-live region', (await rp.locator('#fleet-events[aria-live]').count()) === 0);

    // double submit: the reminder form writes once, focus returns to the submit button, success is announced
    await rp.locator('#fleet-reminder-form input[name="title"]').fill('Replace belt');
    await rp.locator('#fleet-reminder-form [type="submit"]').focus();
    await rp.evaluate(() => { const form = document.getElementById('fleet-reminder-form'); form.requestSubmit(); form.requestSubmit(); });
    await rp.waitForFunction(() => window.__fleet.calls.filter(c => c === 'reminder_upsert').length >= 1);
    check('fleet: regression: a reminder save is announced and focus returns to its button', await waitPolite(/reminder saved/) && await rp.evaluate(() => document.activeElement?.closest('#fleet-reminder-form') !== null), `${await active()} | ${await polite()}`);
    await rp.waitForTimeout(400);
    check('fleet: regression: double-submitting the reminder form saves one reminder', await rp.evaluate(() => window.__fleet.data.rows[0].reminders.filter(r => r.title === 'Replace belt').length === 1), await rp.evaluate(() => window.__fleet.data.rows[0].reminders.map(r => r.title).join(',')));
    await rp.locator('#fleet-event-form [type="submit"]').dblclick();
    await rp.waitForTimeout(700);
    check('fleet: regression: double-clicking "Log event" logs one event', await rp.evaluate(() => window.__fleet.events.length === 1), await rp.evaluate(() => String(window.__fleet.events.length)));
    await rp.selectOption('#fleet-placement', 'p2');
    await rp.locator('#fleet-move').dblclick();
    await rp.waitForTimeout(700);
    check('fleet: regression: double-clicking "Move asset" moves once', (await placeCalls()) === 1, `${await placeCalls()} calls`);
    check('fleet: regression: after a move, focus stays on "Move asset" and the move is announced', await rp.evaluate(() => document.activeElement?.id === 'fleet-move') && /moved/i.test(await polite()), `${await active()} | ${await polite()}`);
    // detail-panel history filter announces a short summary instead of reading the list
    await rp.locator('#fleet-event-filters select').selectOption('repair');
    check('fleet: regression: filtering the asset history announces a short summary', await waitPolite(/no maintenance matches|\d+ maintenance events?/), await polite());

    // events tab: the list is not a live region and filters announce a count
    await rp.click('#fleet-tab-events'); await rp.waitForSelector('#fleet-event-log li');
    check('fleet: regression: the events log list is not an aria-live region', (await rp.locator('#fleet-event-log[aria-live]').count()) === 0);
    await rp.locator('#fleet-event-log-filters select[name="eventType"]').selectOption('inspect');
    check('fleet: regression: filtering the events log announces a count', await waitPolite(/no maintenance matches|\d+ maintenance events?/), await polite());

    // venues: keyboard "Move to…" does not move on arrow keys; drop on own position is a no-op
    await rp.click('#fleet-tab-venues'); await rp.waitForSelector('#fleet-tree');
    const before = await placeCalls();
    const moveSelect = rp.locator('select[data-move-asset="a"]');
    await moveSelect.focus(); await rp.keyboard.press('ArrowDown'); await rp.keyboard.press('ArrowDown'); await rp.waitForTimeout(400);
    check('fleet: regression: arrow keys on the tree "Move to…" select do not move the asset', (await placeCalls()) === before && await rp.evaluate(() => document.activeElement?.dataset?.moveAsset === 'a'), `${(await placeCalls()) - before} moves | ${await active()}`);
    await moveSelect.selectOption('p');
    await rp.locator('[data-move-go="a"]').focus(); await rp.keyboard.press('Enter');
    await rp.waitForFunction(() => window.__fleet.data.rows[0].deckPositionId === 'p');
    check('fleet: regression: the tree Move button moves once, keeps focus on the asset controls and announces it', (await placeCalls()) === before + 1 && await waitPolite(/moved/) && await rp.evaluate(() => Boolean(document.activeElement?.closest('.fleet-asset'))), `${await active()} | ${await polite()}`);
    await rp.evaluate(() => { const zone = document.querySelector('[data-drop-position="p"]'); const dt = new DataTransfer(); dt.setData('text/plain', 'a'); zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); });
    await rp.waitForTimeout(400);
    check('fleet: regression: dropping an asset on its own position does not log a move', (await placeCalls()) === before + 1, `${(await placeCalls()) - before} moves`);
    check('fleet: regression: tree "Move to…" selects carry no per-position options until focused', await rp.evaluate(() => [...document.querySelectorAll('select[data-move-asset]')].filter(s => s !== document.activeElement).every(s => s.options.length <= 2)));

    // venue rename keeps every other column; delete copy is accurate
    await rp.locator('#fleet-location-form select[name="kind"]').selectOption('venue');
    await rp.locator('#fleet-location-form select[name="existing"]').selectOption('v');
    const impact = await rp.locator('#fleet-delete-impact').innerText();
    check('fleet: regression: venue delete copy says pre-gig and hum runs are unlinked, not that they block', !/diagnostic references block/i.test(impact) && /pre-gig/i.test(impact) && /hum/i.test(impact), impact);
    await rp.locator('#fleet-location-form input[name="name"]').fill('Club Nova');
    await rp.locator('#fleet-location-form [type="submit"]').focus(); await rp.keyboard.press('Enter');
    await rp.waitForFunction(() => window.__fleet.data.venues.some(v => v.name === 'Club Nova'));
    check('fleet: regression: renaming a venue keeps its type, city, region, country and notes', await rp.evaluate(() => { const v = window.__fleet.data.venues.find(x => x.id === 'v'); return v.name === 'Club Nova' && v.venueType === 'club' && v.city === 'Leeds' && v.region === 'Yorkshire' && v.country === 'GB' && v.notes === 'Load-in at the back'; }),
      await rp.evaluate(() => JSON.stringify(window.__fleet.data.venues)));
    check('fleet: regression: saving a location announces it and keeps focus on Save location', await waitPolite(/location saved/) && await rp.evaluate(() => document.activeElement?.closest('#fleet-location-form') !== null), `${await active()} | ${await polite()}`);
    await rc.close();
  }

  // ----- regressions: large fleets (reminder cap note, venue tree cap) and long names -----
  {
    const { context: nc, page: np } = await open({ label: 'long', mock: { longName: true } }, tauriMock, FLAG_ON);
    await np.setViewportSize({ width: 900, height: 900 });
    await np.goto(base); await np.waitForSelector('#fleet-reminder-banner');
    // No sideways scroll of <main>, every listed element fits its own box, and the box stays inside its card.
    const spill = selector => np.evaluate(sel => {
      const main = document.getElementById('main');
      const bad = [...document.querySelectorAll(sel)].filter(el => {
        const card = el.closest('.card'), r = el.getBoundingClientRect(), c = card?.getBoundingClientRect();
        return el.scrollWidth > el.clientWidth + 1 || (c && r.right > c.right + 1);
      }).map(el => `${el.tagName}.${el.className}`);
      if (main.scrollWidth > main.clientWidth + 1) bad.unshift(`main ${main.scrollWidth} > ${main.clientWidth}`);
      return bad.slice(0, 3).join(', ');
    }, selector);
    const bannerSpill = await spill('#fleet-reminder-banner, #fleet-reminder-banner li, #fleet-reminder-banner p');
    check('fleet: regression: a long unbroken asset name does not overflow the banner', !bannerSpill, bannerSpill);
    await np.click('.rail-item[data-screen="fleet"]'); await np.waitForSelector('#fleet-grid');
    const gridSpill = await spill('#fleet-grid, #fleet-grid td, #fleet-grid .fleet-asset-name, #fleet-grid .fleet-failing');
    check('fleet: regression: long unbroken names do not overflow the fleet grid', !gridSpill, gridSpill);
    await nc.close();
    const { context: lc, page: lp } = await open({ label: 'large', mock: { extraOverdue: 505, placeExtra: true } }, tauriMock, FLAG_ON);
    await lp.goto(base); await lp.waitForSelector('.rail-item[data-screen="fleet"]');
    await lp.click('.rail-item[data-screen="fleet"]'); await lp.waitForSelector('#fleet-grid');
    await lp.click('#fleet-tab-reminders'); await lp.waitForSelector('#fleet-reminder-table');
    check('fleet: regression: the reminders table says when it shows only the first 500', /first 500 of 506/.test(await lp.locator('#fleet-reminder-cap').innerText({ timeout: 1000 }).catch(() => '')) && (await lp.locator('#fleet-reminder-table tbody tr').count()) === 500);
    await lp.click('#fleet-tab-venues'); await lp.waitForSelector('#fleet-tree');
    const treeRows = await lp.locator('[data-drop-position="p2"] li').count();
    check('fleet: regression: the venues tree caps each position list and says how many more', treeRows === 200 && /and 305 more/.test(await lp.locator('[data-drop-position="p2"]').innerText()), `${treeRows} rows`);
    check('fleet: regression: the venues tree builds no per-asset option lists up front', (await lp.locator('#fleet-tree option').count()) <= 2 * 300, `${await lp.locator('#fleet-tree option').count()} options`);
    await lc.close();
  }

  // ----- regressions: booth sheet print with FS-03 PDF export switched off -----
  {
    const PDF_OFF = () => localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { fleet: true, pdfExport: false } }));
    const { context: pc, page: pp } = await open({ label: 'nopdf' }, tauriMock, PDF_OFF);
    await pp.goto(base); await pp.waitForSelector('.rail-item[data-screen="fleet"]');
    await pp.click('.rail-item[data-screen="fleet"]'); await pp.waitForSelector('#fleet-grid');
    await pp.click('#fleet-tab-venues'); await pp.waitForSelector('[data-print-booth="b"]');
    await pp.evaluate(() => { window.__printFrames = 0; new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.classList?.contains('dc-print-frame')) window.__printFrames++; }).observe(document.body, { childList: true }); });
    await pp.click('[data-print-booth="b"]');
    const printed = await pp.waitForFunction(() => window.__printFrames > 0, null, { timeout: 4000 }).then(() => true, () => false);
    check('fleet: regression: "Print booth sheet" opens the browser print layout when PDF export is off', printed);
    await pc.close();
  }

  // ----- empty state -----
  {
    const empty = await open({ label: 'empty', mock: { noVenues: true } }, tauriMock, FLAG_ON);
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
    const { context: ec, page: ep } = await open({ label: 'error' }, tauriMock, FLAG_ON);
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
    await browserContext.addInitScript(FLAG_ON);
    const browserPage = await browserContext.newPage(); errors.push(watchConsole(browserPage, 'fleet-browser'));
    await browserPage.goto(base); await browserPage.click('.rail-item[data-screen="fleet"]');
    await browserPage.waitForSelector('#fleet-unsupported');
    check('fleet: browser mode states native persistence is unavailable (no banner)', /requires the desktop app/.test(await browserPage.locator('#fleet-content').innerText()) && (await browserPage.locator('#fleet-reminder-banner').count()) === 0);
    let downloads = 0; browserPage.on('download', () => { downloads++; });
    await browserPage.locator('#screen-fleet h1').focus(); await browserPage.keyboard.press('e'); await browserPage.keyboard.press('Control+e');
    await browserPage.waitForTimeout(500);
    check('fleet: regression: the export shortcut writes no CSV in browser mode and says why', downloads === 0 && /desktop app/i.test(await browserPage.locator('#toasts').innerText()), `${downloads} downloads`);
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
