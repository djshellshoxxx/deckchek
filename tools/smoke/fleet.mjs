import { watchConsole, tauriMock } from './core.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { registerBoothSheet } from '../../app/ui/booth-sheet.js';
import { composePrintable } from '../../app/report-pdf.js';

function fleetMock() {
  const before = window.__TAURI__.core.invoke;
  const old = new Date(Date.now() - 200 * 86400000).toISOString(), now = new Date().toISOString();
  const data = { products: [{ id: 'model', model: 'Test turntable' }], templates: [], venues: [{ id: 'v', name: 'Club' }], booths: [{ id: 'b', venueId: 'v', name: 'Booth' }], positions: [{ id: 'p', boothId: 'b', name: 'Left' }], rows: [
    { assetId: 'a', productId: 'model', nickname: 'Deck A', productName: 'Test turntable', serialNumber: 'SN1', category: 'turntable', createdAt: old, installedDate: old, hoursTotal: 510, deckPositionId: 'p', position: 'Left', boothId: 'b', booth: 'Booth', venueId: 'v', venue: 'Club', lastResults: [{ testId: 'signal', status: 'fail', createdAt: now }], reminders: [{ id: 'r', assetId: 'a', title: 'Clean faders', basis: 'days', intervalValue: 90, warnBefore: 14, enabled: true, createdAt: old, lastDoneAt: null, hoursAtLastEvent: null }] },
    { assetId: 'other', nickname: 'Untested mixer', productName: 'Test mixer', category: 'mixer', createdAt: old, hoursTotal: 0, lastResults: [], reminders: [] },
  ] };
  const events = []; window.__fleet = { data, events, csv: null };
  window.__TAURI__.dialog = { save: async () => '/tmp/fleet.csv' };
  window.__TAURI__.core.invoke = async (command, args = {}) => {
    if (command === 'fleet_snapshot') return structuredClone(data);
    if (command === 'maintenance_list') return events.filter(e => e.assetId === args.assetId && (!args.eventType || e.eventType === args.eventType) && (!args.from || e.eventAt.slice(0, 10) >= args.from) && (!args.to || e.eventAt.slice(0, 10) <= args.to));
    if (command === 'reminder_snooze') { for (const row of data.rows) for (const reminder of row.reminders) if (reminder.id === args.id) reminder.snoozedUntil = args.untilIso; return null; }
    if (command === 'reminder_upsert') { const row = data.rows.find(r => r.assetId === args.input.assetId); const id = `r${row.reminders.length + 1}`; row.reminders.push({ ...args.input, id, enabled: true, createdAt: now }); return id; }
    if (command === 'reminder_template_upsert') { const id = args.input.id || `template-${data.templates.length + 1}`; data.templates = data.templates.filter(t => t.id !== id); data.templates.push({ ...args.input, id }); return id; }
    if (command === 'reminder_apply_template') { const row = data.rows.find(r => r.assetId === args.assetId), template = data.templates.find(t => t.id === args.templateId); if (row.productId !== template.productId) throw 'wrong product'; const id = `${template.id}:${row.assetId}`; row.reminders = row.reminders.filter(r => r.id !== id); row.reminders.push({ ...template, id, enabled: true, createdAt: now }); return id; }
    if (command === 'maintenance_log') { const event = { ...args.input, id: `e${events.length + 1}`, hoursAtEvent: 510 }; events.push(event); for (const row of data.rows) for (const reminder of row.reminders) if (reminder.id === event.reminderId) { reminder.lastDoneAt = event.eventAt; reminder.hoursAtLastEvent = 510; } return event.id; }
    if (command === 'fleet_place_asset') { const row = data.rows.find(r => r.assetId === args.assetId); row.deckPositionId = args.deckPositionId; row.position = args.deckPositionId ? 'Left' : null; row.boothId = args.deckPositionId ? 'b' : null; row.booth = args.deckPositionId ? 'Booth' : null; row.venueId = args.deckPositionId ? 'v' : null; row.venue = args.deckPositionId ? 'Club' : null; return null; }
    if (command === 'booth_upsert') { const id = args.input.id || `b${data.booths.length + 1}`; data.booths = data.booths.filter(row => row.id !== id); data.booths.push({ id, venueId: args.input.parentId, name: args.input.name }); return id; }
    if (command === 'position_upsert') { const id = `p${data.positions.length + 1}`; data.positions.push({ id, boothId: args.input.parentId, name: args.input.name }); return id; }
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

export default async function run({ browser, base, check, ROOT }) {
  const errors = [], context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(tauriMock); await context.addInitScript(fleetMock);
  await context.addInitScript(() => localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { fleet: true } })));
  const page = await context.newPage(); errors.push(watchConsole(page, 'fleet'));
  await page.goto(base); await page.waitForSelector('#fleet-reminder-banner');
  check('fleet: startup summary shows due maintenance with a text badge', /1 overdue/.test(await page.locator('#fleet-reminder-banner').innerText()) && (await page.locator('[data-fleet-badge]').innerText()) === '1');
  await page.getByRole('button', { name: 'Dismiss for 1 day', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('fleet-reminder-banner'));
  check('fleet: dismiss snoozes for one day without deleting reminder', await page.evaluate(() => Boolean(window.__fleet.data.rows[0].reminders[0].snoozedUntil) && window.__fleet.data.rows[0].reminders.length === 1));
  await page.click('.rail-item[data-screen="fleet"]');
  await page.waitForFunction(() => Boolean(document.getElementById('fleet-grid')) || Boolean(document.getElementById('fleet-status')?.textContent && document.getElementById('fleet-status').textContent !== 'Loading fleet…'));
  check('fleet: overview loads without an error', (await page.locator('#fleet-grid').count()) === 1, await page.locator('#fleet-status').innerText());
  await page.waitForSelector('#fleet-grid');
  check('fleet: overview shows failures and untested assets without a false healthy state', (await page.locator('#fleet-grid').innerText()).includes('Attention') && (await page.locator('#fleet-grid').innerText()).includes('Never tested'));
  await page.fill('#fleet-search', 'turntable');
  check('fleet: search filters the actual grid', (await page.locator('#fleet-grid tbody tr').count()) === 1);
  await page.click('#fleet-export'); await page.waitForFunction(() => Boolean(window.__fleet.csv));
  check('fleet: CSV has BOM and only filtered rows', await page.evaluate(() => window.__fleet.csv.startsWith('\ufeff') && window.__fleet.csv.includes('Deck A') && !window.__fleet.csv.includes('Untested mixer')));
  await page.fill('#fleet-search', ''); await page.getByRole('button', { name: 'Deck A · Test turntable', exact: true }).click();
  await page.waitForSelector('#fleet-event-form');
  check('fleet: detail explains tracked-hour estimate', /510.0 tracked hours \(estimate\)/.test(await page.locator('#fleet-detail').innerText()));
  await page.locator('#fleet-reminder-form input[name="title"]').fill('Inspect stylus'); await page.locator('#fleet-reminder-form').getByRole('button', { name: 'Save reminder' }).click();
  await page.waitForFunction(() => window.__fleet.data.rows[0].reminders.length === 2);
  check('fleet: reminder survives refresh through the native bridge', (await page.locator('#fleet-detail').innerText()).includes('Inspect stylus'));
  const completes = page.locator('#fleet-event-form select').nth(1); await completes.selectOption('r');
  await page.locator('#fleet-event-form textarea').fill('Faders cleaned'); await page.locator('#fleet-event-form').getByRole('button', { name: 'Log event' }).click();
  await page.waitForFunction(() => window.__fleet.events.length === 1); await page.waitForFunction(() => document.getElementById('fleet-events')?.textContent.includes('Faders cleaned'));
  check('fleet: completing a reminder resets the due state and records maintenance', /Clean faders: ok/.test(await page.locator('#fleet-detail').innerText()));
  await page.locator('#fleet-event-filters select').selectOption('repair');
  await page.waitForFunction(() => document.getElementById('fleet-events')?.textContent.includes('No maintenance matches'));
  check('fleet: maintenance timeline filters by event type', true);
  await page.locator('#fleet-event-filters select').selectOption('');
  await page.waitForFunction(() => document.getElementById('fleet-events')?.textContent.includes('Faders cleaned'));
  await page.locator('#fleet-event-filters input[name="from"]').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await page.waitForFunction(() => document.getElementById('fleet-events')?.textContent.includes('No maintenance matches'));
  check('fleet: maintenance timeline filters by UTC date', true);
  await page.locator('#fleet-templates input[name="title"]').fill('Quarterly inspection');
  await page.locator('#fleet-templates').getByRole('button', { name: 'Save template' }).click();
  await page.waitForFunction(() => window.__fleet.data.templates.length === 1);
  check('fleet: a product reminder template persists', (await page.locator('#fleet-templates').innerText()).includes('Quarterly inspection'));
  await page.getByRole('button', { name: 'Apply to selected asset', exact: true }).click();
  await page.waitForFunction(() => window.__fleet.data.rows[0].reminders.length === 3);
  await page.getByRole('button', { name: 'Apply to selected asset', exact: true }).click();
  check('fleet: applying a product template repeatedly does not duplicate reminders', await page.evaluate(() => window.__fleet.data.rows[0].reminders.length === 3));
  await page.selectOption('#fleet-placement', ''); await page.getByRole('button', { name: 'Move asset', exact: true }).click();
  await page.waitForFunction(() => window.__fleet.data.rows[0].deckPositionId === null);
  check('fleet: keyboard placement can unplace a unit without deleting it', (await page.locator('#fleet-grid tbody').innerText()).includes('Unplaced'));
  await page.locator('#fleet-location-form input[name="name"]').fill('Second booth'); await page.locator('#fleet-location-form').getByRole('button', { name: 'Save location' }).click();
  await page.waitForFunction(() => window.__fleet.data.booths.length === 2);
  check('fleet: adding a booth updates available locations', true);
  await page.locator('#fleet-location-form select[name="existing"]').selectOption('b2');
  await page.locator('#fleet-location-form input[name="name"]').fill('Renamed booth');
  await page.locator('#fleet-location-form').getByRole('button', { name: 'Save location' }).click();
  await page.waitForFunction(() => window.__fleet.data.booths.some(row => row.name === 'Renamed booth'));
  check('fleet: existing booth can be renamed without replacing its identity', await page.evaluate(() => window.__fleet.data.booths.find(row => row.name === 'Renamed booth').id === 'b2'));
  await page.locator('#fleet-location-form select[name="existing"]').selectOption('b2');
  check('fleet: deletion requires typing the exact existing name', await page.getByRole('button', { name: 'Delete empty location', exact: true }).isDisabled());
  await page.locator('#fleet-location-form input[name="confirmation"]').fill('Renamed booth');
  await page.getByRole('button', { name: 'Delete empty location', exact: true }).click();
  await page.waitForFunction(() => window.__fleet.data.booths.length === 1);
  check('fleet: empty-location deletion preserves fleet assets', await page.evaluate(() => window.__fleet.data.rows.length === 2));
  await page.evaluate(() => { const row = window.__fleet.data.rows[0]; row.deckPositionId = 'p'; row.position = 'Left'; row.boothId = 'b'; row.venueId = 'v'; });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.locator('#fleet-location-form select[name="kind"]').selectOption('position');
  await page.locator('#fleet-location-form select[name="existing"]').selectOption('p');
  check('fleet: deletion previews asset count and excludes its own destination', (await page.locator('#fleet-delete-impact').innerText()).includes('1 assets') && (await page.locator('#fleet-location-form select[name="deleteDestination"] option[value="position:p"]').count()) === 0);
  await page.locator('#fleet-location-form select[name="deleteDestination"]').selectOption('unplaced');
  await page.locator('#fleet-location-form input[name="confirmation"]').fill('Left');
  await page.getByRole('button', { name: 'Move assets and delete location', exact: true }).click();
  await page.waitForFunction(() => window.__fleet.data.positions.length === 0);
  check('fleet: occupied deletion explicitly unplaces and preserves assets', await page.evaluate(() => window.__fleet.deletion.moveTo.deckPositionId === null && window.__fleet.data.rows.length === 2 && window.__fleet.data.rows[0].deckPositionId === null));
  await context.close();
  const browserContext = await browser.newContext(); await browserContext.addInitScript(() => localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { fleet: true } })));
  const browserPage = await browserContext.newPage(); errors.push(watchConsole(browserPage, 'fleet-browser')); await browserPage.goto(base); await browserPage.click('.rail-item[data-screen="fleet"]');
  await browserPage.waitForSelector('#fleet-content .empty');
  check('fleet: browser mode states native persistence is unavailable', /requires the desktop app/.test(await browserPage.locator('#fleet-content').innerText()));
  await browserContext.close();
  registerBoothSheet();
  const printableRows = Array.from({ length: 8 }, (_, index) => ({ position: `Position ${index + 1}`, nickname: `Deck ${index + 1}`, productName: 'Reference deck', serialNumber: `SERIAL-${index + 1}`, lastTestedAt: '2026-10-22', health: 'healthy', reminders: [{ dueAt: '2027-01-01' }] }));
  const { html } = composePrintable('boothSheet', { booth: { name: 'Club booth' }, rows: printableRows }, { css: fs.readFileSync(path.join(ROOT, 'report-print.css'), 'utf8'), paper: 'A4' });
  const printContext = await browser.newContext(), printPage = await printContext.newPage();
  const printErrors = watchConsole(printPage, 'fleet-print'); errors.push(printErrors);
  await printPage.setContent(html);
  const pdf = await printPage.pdf({ preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  check('fleet: an eight-position booth sheet renders as one PDF page', pages === 1, `${pages} pages`);
  await printContext.close();
  return errors.flat();
}
