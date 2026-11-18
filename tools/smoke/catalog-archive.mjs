// Actual browser catalog portability, after production device-library startup.
// Native persistence and physical device behavior are outside this smoke.
import { watchConsole, setViewport } from './core.mjs';

export async function seedCatalogArchive({ fixture, profileId }) {
  const { createCatalogArchive } = await import('./catalog-archive.js');
  const { CATALOG_STORAGE_KEY } = await import('./catalog-store.js');
  const state = JSON.parse(localStorage.getItem(CATALOG_STORAGE_KEY));
  const productId = state.deviceProfiles?.[profileId]?.productId;
  const product = state.catalog.product.find(row => row.id === productId);
  const manufacturer = state.catalog.manufacturer.find(row => row.id === product?.manufacturerId);
  if (!product || !manufacturer) throw new Error('Production profile initialization is required before seeding');
  const value = structuredClone(fixture);
  value.catalog.manufacturer.push(structuredClone(manufacturer));
  value.catalog.product.push(structuredClone(product));
  value.catalog.asset.push({ id: 'catalog-imported-profile-asset', productId,
    nickname: 'Imported profile unit <img id="catalog-asset-injection" src=x>',
    createdAt: '2024-01-01', updatedAt: '2026-01-01', notes: 'Keep its original product association.' });
  value.catalog.venue[0].name = 'Current venue <img id="catalog-venue-injection" src=x> café';
  value.catalog.setup[0].deckPositionId = 'retained-other-position';
  const archive = createCatalogArchive();
  const result = archive.importArchive(value);
  if (result.status !== 'complete' || result.completed !== 10 || result.alreadyPresent !== 2
    || !result.written) throw new Error('Could not seed the complete catalog graph');
  return { productId, profileId, counts: archive.preview(archive.exportArchive()).counts };
}

export function catalogWriteSpy() {
  const original = Storage.prototype.setItem;
  window.__catalogArchiveWrites = 0;
  Storage.prototype.setItem = function (key, value) {
    if (this === localStorage && key === 'deckchek.catalog.v1') window.__catalogArchiveWrites++;
    return original.call(this, key, value);
  };
}

const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const entities = ['manufacturer', 'product', 'asset', 'setup', 'venue', 'supportConfiguration'];
export const containsSavedCatalog = (saved, original) => Object.entries(original).every(([kind, value]) => entities.includes(kind)
  ? value.every(row => canonical(saved[kind].find(item => item.id === row.id)) === canonical(row))
  : canonical(saved[kind]) === canonical(value));
const siblings = state => canonical(Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'catalog')));

export default async function run({ browser, base, check, SHOTS, tmp }) {
  const fs = await import('node:fs'), path = await import('node:path');
  const fixture = JSON.parse(fs.readFileSync(new URL('../../tests/contracts/catalog-archive.json', import.meta.url), 'utf8'));
  const incidentFixture = JSON.parse(fs.readFileSync(new URL('../../tests/contracts/venue-incidents.json', import.meta.url), 'utf8'));
  const profileId = 'allen-and-heath-xone-92', contexts = [], errors = [];
  const awaitLibrary = async page => page.evaluate(async () => {
    const library = await import('./ui/devices/library-state.js');
    const state = await library.ensureLibrary();
    if (!state.ready || state.error || state.syncError || !state.profiles.length) throw new Error('Device library initialization failed');
    return state.profiles.length;
  });
  const newPage = async label => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contexts.push(context); await context.addInitScript(catalogWriteSpy);
    const page = await context.newPage(); errors.push(watchConsole(page, label));
    await page.goto(base); await page.waitForSelector('.rail-item[data-screen="data"]');
    await awaitLibrary(page);
    return page;
  };
  const openData = async page => {
    await page.click('.rail-item[data-screen="data"]');
    await page.waitForSelector('#data-catalog-archive #catalog-archive-export');
  };
  const exportFile = async (page, name) => {
    const waiting = page.waitForEvent('download'); await page.click('#catalog-archive-export');
    const download = await waiting, file = path.join(tmp, name); await download.saveAs(file);
    return { file, archive: JSON.parse(fs.readFileSync(file, 'utf8')) };
  };
  const rawCatalog = page => page.evaluate(() => localStorage.getItem('deckchek.catalog.v1'));
  const historyBytes = page => page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage)
    .filter(key => key.startsWith('deckchek.venue-incidents.v1.')).sort().map(key => [key, localStorage.getItem(key)]))));
  try {
    const source = await newPage('catalog-source');
    const seeded = await source.evaluate(seedCatalogArchive, { fixture, profileId });
    await openData(source);
    const exported = await exportFile(source, 'catalog-source.json');
    check('catalog archive: Data exports complete original records, retired assets, components and opaque metadata',
      exported.archive.format === 'deckchek-catalog' && exported.archive.formatVersion === 1
      && exported.archive.catalog.asset.some(row => row.id === 'asset-retired' && row.isDeleted === true)
      && exported.archive.catalog.setup.find(row => row.id === 'setup-a').components.length === 2
      && exported.archive.catalog.supportConfiguration.find(row => row.id === 'support-a').structureJson === fixture.catalog.supportConfiguration[0].structureJson
      && canonical(exported.archive.catalog.legacyArchiveBucket) === canonical(fixture.catalog.legacyArchiveBucket));

    const target = await newPage('catalog-target');
    const targetProductId = await target.evaluate(async ({ incidentFixture, profileId }) => {
      const state = JSON.parse(localStorage.getItem('deckchek.catalog.v1'));
      const productId = state.deviceProfiles[profileId].productId;
      state.archivePreservationProbe = { original: 'destination sibling', zero: 0 };
      localStorage.setItem('deckchek.catalog.v1', JSON.stringify(state));
      localStorage.setItem('catalog-unrelated-probe', 'original unrelated bytes');
      const { createVenueHistoryArchive } = await import('./venue-history-archive.js');
      const incident = { ...structuredClone(incidentFixture.draft), origin: 'operator', recordedAt: incidentFixture.recordedAt };
      incident.venueId = 'venue-a'; incident.context.venue.id = 'venue-a'; incident.context.venue.name = 'Original historic venue';
      createVenueHistoryArchive().importArchive({ format: 'deckchek-venue-history', formatVersion: 1,
        exportedAt: '2026-11-18T14:00:00.000Z', incidents: [incident], supportObservations: [], supportComparisons: [] });
      window.__catalogArchiveWrites = 0;
      return productId;
    }, { incidentFixture, profileId });
    const before = JSON.parse(await rawCatalog(target)), originalHistory = await historyBytes(target);
    check('catalog archive: destination has its own established Devices binding',
      targetProductId !== seeded.productId && Boolean(before.deviceProfiles[profileId]));
    await openData(target);
    await target.locator('#catalog-archive-file').setInputFiles({ name: 'Catalog <img id="catalog-file-injection" src=x>.json',
      mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported.archive)) });
    await target.waitForFunction(() => /New records: \d+\. Conflicts: 0/.test(document.querySelector('#catalog-archive-preview')?.textContent || ''));
    const previewText = await target.locator('#catalog-archive-preview').innerText();
    check('catalog archive: preview discloses opaque references and legacy mismatches without writing',
      previewText.includes(`New records: ${seeded.counts.total}. Conflicts: 0`)
      && /4 distinct saved reference IDs/.test(previewText) && /1 saved support-position mismatches/.test(previewText)
      && /<img id="catalog-file-injection"/.test(previewText)
      && await target.locator('#catalog-file-injection').count() === 0
      && await target.locator('#catalog-archive-import').isEnabled()
      && await target.evaluate(() => window.__catalogArchiveWrites === 0));
    await target.click('#catalog-archive-import');
    await target.waitForFunction(() => /Import complete\./.test(document.querySelector('#catalog-archive-status')?.textContent || ''));
    const saved = JSON.parse(await rawCatalog(target));
    check('catalog archive: explicit import writes once and preserves destination siblings and every original record',
      containsSavedCatalog(saved.catalog, exported.archive.catalog) && containsSavedCatalog(saved.catalog, before.catalog)
      && siblings(saved) === siblings(before) && await target.evaluate(() => window.__catalogArchiveWrites === 1
        && localStorage.getItem('catalog-unrelated-probe') === 'original unrelated bytes'));
    check('catalog archive: current venue restoration keeps immutable incident bytes and original context',
      originalHistory === await historyBytes(target) && await target.evaluate(async () => {
        const { gatherVenueReport } = await import('./ui/workflows/m6-reports.js');
        const { createCatalogStore } = await import('./catalog-store.js');
        const { createVenueIncidentStore } = await import('./venue-incidents.js');
        const report = await gatherVenueReport({ venueId: 'venue-a', catalog: createCatalogStore({ invoke: null }),
          humStore: { list: async () => [] }, incidentStore: createVenueIncidentStore({ invoke: null }) });
        return report !== null && JSON.stringify(report).includes('Original historic venue')
          && JSON.stringify(report).includes('Current venue <img');
      }));

    await target.click('.rail-item[data-screen="equipment"]');
    await target.waitForFunction(() => document.querySelector('#eq-rows')?.textContent.includes('Imported profile unit <img'));
    check('catalog archive: Equipment displays escaped imported assets and explains the Devices boundary',
      await target.locator('#catalog-asset-injection').count() === 0
      && /existing device-library bindings stay in place/.test(await target.locator('#eq-catalog-portability').innerText())
      && await target.evaluate(async ({ profileId, targetProductId }) => {
        const library = await import('./ui/devices/library-state.js'); await library.refreshUnits();
        return library.lib.products.get(profileId) === targetProductId
          && !library.unitsFor(profileId).some(row => row.id === 'catalog-imported-profile-asset');
      }, { profileId, targetProductId }));

    await target.reload(); await target.waitForSelector('.rail-item[data-screen="data"]'); await awaitLibrary(target); await openData(target);
    await target.evaluate(() => { window.__catalogArchiveWrites = 0; });
    const reexported = await exportFile(target, 'catalog-after-reload.json');
    check('catalog archive: production startup preserves the imported graph and its separate product association',
      containsSavedCatalog(reexported.archive.catalog, exported.archive.catalog)
      && originalHistory === await historyBytes(target)
      && await target.evaluate(({ profileId, targetProductId }) => JSON.parse(localStorage.getItem('deckchek.catalog.v1')).deviceProfiles[profileId].productId === targetProductId,
        { profileId, targetProductId }));
    const beforeRetry = await rawCatalog(target);
    await target.locator('#catalog-archive-file').setInputFiles(exported.file);
    await target.waitForFunction(() => /New records: 0\. Conflicts: 0/.test(document.querySelector('#catalog-archive-preview')?.textContent || ''));
    await target.click('#catalog-archive-import');
    await target.waitForFunction(() => /Import complete\. Added 0 records/.test(document.querySelector('#catalog-archive-status')?.textContent || ''));
    check('catalog archive: exact unchanged-file retry performs no catalog write',
      beforeRetry === await rawCatalog(target) && await target.evaluate(() => window.__catalogArchiveWrites === 0));

    const conflict = structuredClone(exported.archive);
    conflict.catalog.asset.find(row => row.id === 'asset-retired').updatedAt = '2026-11-18';
    conflict.catalog.venue.unshift({ id: 'must-not-append-before-conflict', name: 'Uncommitted venue' });
    await target.locator('#catalog-archive-file').setInputFiles({ name: 'conflicting-catalog.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(conflict)) });
    await target.waitForFunction(() => /Conflicts: 1/.test(document.querySelector('#catalog-archive-preview')?.textContent || ''));
    check('catalog archive: a retired-record metadata conflict blocks the complete proposed import',
      await target.locator('#catalog-archive-import').isDisabled() && beforeRetry === await rawCatalog(target)
      && await target.evaluate(() => window.__catalogArchiveWrites === 0));
    await setViewport(target, { width: 390, height: 800 });
    check('catalog archive: controls and conflict diagnostics fit a phone viewport',
      await target.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await target.screenshot({ path: `${SHOTS}/catalog-archive-phone.png` });
    await setViewport(target, { width: 1280, height: 900 });

    const workspaceBefore = await target.evaluate(async () => JSON.stringify((await import('./ui/state.js')).workspace));
    const chooser = target.waitForEvent('filechooser'); await target.click('#data-import-json'); await (await chooser).setFiles(exported.file);
    await target.waitForFunction(() => /Could not import the workspace/.test(document.querySelector('#data-status')?.textContent || ''));
    check('catalog archive: the existing workspace importer rejects this separate format without persistence changes',
      beforeRetry === await rawCatalog(target) && originalHistory === await historyBytes(target)
      && workspaceBefore === await target.evaluate(async () => JSON.stringify((await import('./ui/state.js')).workspace)));
  } finally {
    for (const context of contexts) await context.close();
  }
  return errors.flat();
}
