// Real Devices UI and browser storage; native mode exercises the IPC contract
// with a deterministic bridge. SQLite behavior is covered by the Rust tests.
import { watchConsole, tauriMock, setViewport } from './core.mjs';
import path from 'node:path';

export default async function run({ browser, base, SHOTS, check }) {
  const errors = [];
  for (const native of [false, true]) {
    const label = native ? 'native' : 'browser';
    const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    if (native) {
      await context.addInitScript(tauriMock);
      await context.addInitScript(() => {
        const original = window.__TAURI__.core.invoke;
        window.__profileAssignmentCalls = [];
        window.__TAURI__.core.invoke = async (command, args) => {
          if (command !== 'device_profile_assign') return original(command, args);
          const input = args.request, asset = window.__mockDb.catalog.asset.find(row => row.id === input.assetId);
          window.__profileAssignmentCalls.push(structuredClone(input));
          if (!asset || asset.productId !== input.expectedProductId) throw new Error('Stale unit');
          asset.productId = input.productId; asset.updatedAt = '2026-11-19T12:00:00.000Z';
          return { assetId: asset.id, profileId: input.profileId, productId: asset.productId, changed: true, updatedAt: asset.updatedAt };
        };
      });
    }
    const page = await context.newPage(), caught = watchConsole(page, `profile-${label}`);
    try {
      await page.goto(base);
      const seeded = await page.evaluate(async () => {
        const { store } = await import('/ui/state.js');
        const { ensureLibrary, lib } = await import('/ui/devices/library-state.js');
        await ensureLibrary();
        const profile = lib.profiles.find(row => row.id === 'pioneer-dj-ddj-flx4');
        const original = await store.upsert('product', { id: 'imported-product', category: 'controller', model: 'Imported catalog product' });
        const asset = await store.upsert('asset', { id: 'imported-unit', productId: original.id, nickname: 'Imported <img id="profile-injection" src=x>', serialNumber: 'Existing serial' });
        await store.saveMidiMap(asset.id, 'pioneer-plx-crss12', { controls: [{ id: 'old-control', label: 'Original map' }] });
        return { id: profile.id, productId: lib.products.get(profile.id), oldMap: await store.getMidiMap(asset.id) };
      });
      await page.click('.rail-item[data-screen="devices"]');
      await page.locator(`[data-device="${seeded.id}"] .dev-card-main`).click();
      await page.click('#dev-use-unit');
      check(`${label} profile assignment: no implicit choice or confirmation`,
        await page.locator('#profile-unit').inputValue() === '' && await page.locator('#dev-profile-assignment button[type="submit"]').isDisabled());
      await page.selectOption('#profile-unit', 'imported-unit');
      check(`${label} profile assignment: selecting a unit still needs model confirmation`,
        await page.locator('#dev-profile-assignment button[type="submit"]').isDisabled());
      await page.check('#profile-unit-confirm');
      await page.click('#dev-profile-assignment button[type="submit"]');
      await page.waitForFunction(() => document.querySelector('#dev-unit')?.value === 'imported-unit');
      const saved = await page.evaluate(async () => {
        const { store } = await import('/ui/state.js');
        return { asset: (await store.list('asset')).find(row => row.id === 'imported-unit'), map: await store.getMidiMap('imported-unit'), products: await store.list('product'), calls: window.__profileAssignmentCalls };
      });
      check(`${label} profile assignment: unit ID, serial, original product and map history are preserved`,
        saved.asset.id === 'imported-unit' && saved.asset.productId === seeded.productId && saved.asset.serialNumber === 'Existing serial'
        && saved.products.some(row => row.id === 'imported-product') && JSON.stringify(saved.map) === JSON.stringify(seeded.oldMap));
      check(`${label} profile assignment: unit name is text, not markup`, await page.locator('#profile-injection').count() === 0);
      if (native) check('native profile assignment: IPC captures the reviewed source and target products', saved.calls.length === 1
        && saved.calls[0].expectedProductId === 'imported-product' && saved.calls[0].productId === seeded.productId && saved.calls[0].profileId === seeded.id);
      else {
        await page.reload();
        await page.waitForSelector('.rail-item[data-screen="devices"]');
        await page.click('.rail-item[data-screen="devices"]');
        await page.locator(`[data-device="${seeded.id}"] .dev-card-main`).click();
        await page.waitForSelector('#dev-unit');
        check('browser profile assignment: reload retains the same selected unit', await page.locator('#dev-unit').inputValue() === 'imported-unit');
      }
      await setViewport(page, { width: 900, height: 900 });
      check(`${label} profile assignment: unit controls fit the supported narrow desktop`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(SHOTS, `profile-assignment-${label}.png`) });
    } finally { await context.close(); }
    errors.push(...caught);
  }
  return errors;
}
