// FS-30 smoke: Import phone results. Flag off = no rail entry. Browser mode: empty state, bad text and a newer
// version are refused with a plain message, a good export shows its measurements with "Hash matches", a tampered
// one shows "Hash differs" (a warning, still importable), a multi-frame QR paste reassembles, Add to History puts a
// run in History. Desktop mode (mocked Tauri): the run reaches save_diagnostic_run with origin "phone", the source
// device and the chosen asset. Screenshots in dark and light.
import { watchConsole, tauriMock, a11yAudit, setViewport } from './core.mjs';
import { buildExport, serializeExport, toQrFrames } from '../../app/phone-run.js';

const FLAG_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { phoneImport: true } })); };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';
const meas = (over = {}) => ({ metricId: 'speed.pitchPercent', label: 'Pitch', value: 0.12, unit: '%', confidence: 0.8, uncertainty: 0.3, ...over });
const make = (over = {}) => buildExport({ createdAt: '2026-10-14T09:30:00Z', device: { userAgent: UA, sampleRate: 48000, micFlags: { autoGainControl: false } }, assetHint: { nickname: 'Deck 1', serial: null },
  measurements: [meas(), meas({ metricId: 'speed.rpm', label: 'Speed', value: 33.373, unit: 'rpm', uncertainty: 0.02 })], notes: 'plinth', ...over });

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const good = serializeExport(make());
  const tampered = JSON.stringify({ ...JSON.parse(good), measurements: [meas({ value: 4.2 })] });
  const newer = JSON.stringify({ ...JSON.parse(good), version: 2 });
  const many = Array.from({ length: 40 }, (_, i) => meas({ metricId: `speed.m${i}`, label: `Metric ${i} with a long label`, value: i + 0.5 }));
  const frames = toQrFrames(serializeExport(make({ measurements: many })));

  // ----- flag off -----
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const po = await off.newPage();
  errors.push(...watchConsole(po, 'phone-off'));
  await po.goto(base);
  await po.waitForSelector('.rail-item');
  check('phone import: flag off hides the screen', (await po.locator('.rail-item[data-screen="phoneimport"]').count()) === 0);
  await off.close();

  // ----- browser mode -----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await ctx.addInitScript(FLAG_ON);
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'phone-browser'));
  await page.goto(base);
  await page.waitForSelector('.rail-item[data-screen="phoneimport"]');
  await page.click('.rail-item[data-screen="phoneimport"]');
  await page.waitForSelector('#pi-text');
  check('phone import: empty state explains where the text comes from', /Nothing read yet/.test(await page.locator('#pi-preview').innerText()));
  await page.fill('#pi-text', '{oops');
  await page.click('#pi-read');
  check('phone import: invalid JSON gets a plain message', /not valid JSON/.test(await page.locator('#pi-status').innerText()));
  await page.fill('#pi-text', newer);
  await page.click('#pi-read');
  check('phone import: a newer export is refused by name', /newer DeckChek Mobile/.test(await page.locator('#pi-status').innerText()));
  await page.fill('#pi-text', good);
  await page.click('#pi-read');
  await page.waitForSelector('.pi-table');
  check('phone import: good export lists its measurements', (await page.locator('.pi-table tbody tr').count()) === 2 && /33\.373 rpm/.test(await page.locator('.pi-table').innerText()));
  check('phone import: hash matches shows a word, not just a colour', /hash matches/i.test(await page.locator('.pi-hash').innerText()));
  check('phone import: phone and notes are shown as text', /Pixel 8/.test(await page.locator('.pi-facts').innerText()) && /plinth/.test(await page.locator('.pi-facts').innerText()));
  await page.screenshot({ path: `${SHOTS}/phone-import-dark.png` });
  await page.fill('#pi-text', tampered);
  await page.click('#pi-read');
  await page.waitForSelector('.pi-hash');
  check('phone import: tampered export warns but can still be imported', /hash differs/i.test(await page.locator('.pi-hash').innerText()) && await page.locator('#pi-import').isEnabled());
  await page.fill('#pi-text', frames.join('\n'));
  await page.click('#pi-read');
  await page.waitForSelector('.pi-table');
  check('phone import: pasted QR frames reassemble', (await page.locator('.pi-table tbody tr').count()) === 40 && /hash matches/i.test(await page.locator('.pi-hash').innerText()));
  await page.fill('#pi-text', frames.slice(1).join('\n'));
  await page.click('#pi-read');
  check('phone import: a missing frame is named', /Missing frame 1 of/.test(await page.locator('#pi-status').innerText()));
  await page.fill('#pi-text', good);
  await page.click('#pi-read');
  await page.waitForSelector('#pi-import');
  const audit = await a11yAudit(page);
  check('phone import: every control is named and big enough', audit.unnamed.length === 0 && audit.small.length === 0, JSON.stringify(audit));
  await page.click('#pi-import');
  await page.waitForSelector('#pi-done');
  check('phone import: Add to History confirms', /Added to History/.test(await page.locator('#pi-done').innerText()));
  await page.click('#pi-done button');
  await page.waitForSelector('#screen-history:not([hidden])');
  check('phone import: the run is in History', /Phone results/.test(await page.locator('#screen-history').innerText()));
  await setViewport(page, { width: 420, height: 800 });
  await page.click('.rail-item[data-screen="phoneimport"]');
  check('phone import: no horizontal scroll at phone width', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await ctx.close();

  // ----- light theme screenshot -----
  const lctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  await lctx.addInitScript(FLAG_ON);
  const lp = await lctx.newPage();
  errors.push(...watchConsole(lp, 'phone-light'));
  await lp.goto(base);
  await lp.click('.rail-item[data-screen="phoneimport"]');
  await lp.fill('#pi-text', good);
  await lp.click('#pi-read');
  await lp.waitForSelector('.pi-table');
  await lp.screenshot({ path: `${SHOTS}/phone-import-light.png` });
  await lctx.close();

  // ----- desktop mode -----
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await dctx.addInitScript(tauriMock);
  await dctx.addInitScript(FLAG_ON);
  const dp = await dctx.newPage();
  errors.push(...watchConsole(dp, 'phone-desktop'));
  await dp.goto(base);
  await dp.waitForSelector('.rail-item[data-screen="phoneimport"]');
  await dp.evaluate(() => window.__TAURI__.core.invoke('catalog_upsert', { entity: 'asset', record: { id: 'asset-deck1', nickname: 'Deck 1', productId: null } }).catch(() => {}));
  await dp.click('.rail-item[data-screen="phoneimport"]');
  await dp.fill('#pi-text', good);
  await dp.click('#pi-read');
  await dp.waitForSelector('#pi-asset');
  const hasDeck = await dp.locator('#pi-asset option[value="asset-deck1"]').count();
  if (hasDeck) await dp.selectOption('#pi-asset', 'asset-deck1');
  await dp.click('#pi-import');
  await dp.waitForSelector('#pi-done');
  const saved = await dp.evaluate(() => window.__mockDb.runs[0]);
  check('phone import (desktop): save_diagnostic_run receives origin "phone"', saved?.origin === 'phone' && saved?.sessionType === 'phone');
  check('phone import (desktop): source device is the phone, not the user agent', saved?.sourceDevice === 'Pixel 8 / Chrome / 48000 Hz');
  check('phone import (desktop): measurements are tagged phone with numeric uncertainty', saved?.measurements.length === 2 && saved.measurements.every(m => m.origin === 'phone' && typeof m.uncertainty === 'number'));
  if (hasDeck) check('phone import (desktop): the chosen asset is saved with the run', saved?.assetId === 'asset-deck1');
  await dctx.close();
  return errors;
}
