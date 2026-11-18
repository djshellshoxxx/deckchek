// Browser history portability through the actual Data screen. The fixture uses
// production validation and comparison derivation; no native/hardware claim.
import { watchConsole, setViewport } from './core.mjs';

export async function seedVenueHistoryArchive({ incidentFixture, supportFixture }) {
  const [incidentModel, supportModel, archiveModel] = await Promise.all([
    import('./venue-incidents.js'), import('./support-isolation.js'), import('./venue-history-archive.js'),
  ]);
  const recordedAt = '2026-11-18T12:30:00.000Z';
  const historicalVenue = 'Historical venue <img id="venue-history-injection" src=x> & café 🎛';
  const incidents = Array.from({ length: 302 }, (_, index) => {
    const input = structuredClone(incidentFixture.draft);
    input.id = `archive-incident-${String(index).padStart(3, '0')}`;
    input.occurredAt = new Date(Date.UTC(2026, 10, 18, 10, 0, 0, index)).toISOString();
    input.note = `Original note ${index} · 𝄞`;
    input.context.venue.name = historicalVenue;
    return { ...incidentModel.normalizeIncidentDraft(input), origin: 'operator', recordedAt };
  });
  const original = (template, id) => {
    const input = structuredClone(template);
    input.id = id;
    input.context.venue.name = historicalVenue;
    input.context.support.name = 'Original support <img id="support-history-injection" src=x>';
    return { ...supportModel.normalizeObservation(input), recordedAt, contextIssues: [] };
  };
  const a = original(supportFixture.observationA, 'archive-observation-a');
  const supportObservations = [a], supportComparisons = [];
  for (let index = 0; index < 101; index++) {
    const suffix = String(index).padStart(3, '0');
    const b = original(supportFixture.observationB, `archive-observation-b-${suffix}`);
    supportObservations.push(b);
    const input = supportModel.normalizeComparison({ ...supportFixture.comparison,
      id: `archive-comparison-${suffix}`, observationAId: a.id, observationBId: b.id });
    supportComparisons.push({ ...input, pairId: a.pairId, venueId: a.venueId, setupId: a.setupId,
      result: supportModel.compareObservations(a, b, input), recordedAt });
  }
  const archive = { format: archiveModel.VENUE_HISTORY_FORMAT, formatVersion: 1, exportedAt: recordedAt,
    incidents, supportObservations, supportComparisons };
  const result = archiveModel.createVenueHistoryArchive().importArchive(archive);
  if (result.status !== 'complete' || result.completed !== 505 || result.remaining !== 0) throw new Error('Could not seed the complete archive fixture');
  return { counts: result.counts, historicalVenue };
}

export function historyWriteSpy() {
  const setItem = Storage.prototype.setItem;
  window.__venueHistoryWrites = 0;
  Storage.prototype.setItem = function (key, value) {
    if (this === localStorage && /^(deckchek\.venue-incidents\.v1\.|deckchek\.support-isolation\.v1\.)/.test(key)) window.__venueHistoryWrites++;
    return setItem.call(this, key, value);
  };
}

const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const savedEvidence = archive => canonical(Object.fromEntries(['incidents', 'supportObservations', 'supportComparisons']
  .map(key => [key, [...archive[key]].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)])));

export default async function run({ browser, base, check, SHOTS, tmp }) {
  const fs = await import('node:fs'), path = await import('node:path');
  const incidentFixture = JSON.parse(fs.readFileSync(new URL('../../tests/contracts/venue-incidents.json', import.meta.url), 'utf8'));
  const supportFixture = JSON.parse(fs.readFileSync(new URL('../../tests/contracts/support-isolation.json', import.meta.url), 'utf8'));
  const contexts = [], errors = [];
  const newPage = async (label, spy = false) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contexts.push(context);
    await context.addInitScript(() => localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { humHunter: true } })));
    if (spy) await context.addInitScript(historyWriteSpy);
    const page = await context.newPage(); errors.push(watchConsole(page, label));
    await page.goto(base); await page.waitForSelector('.rail-item[data-screen="data"]');
    return page;
  };
  const openData = async page => {
    await page.click('.rail-item[data-screen="data"]');
    await page.waitForSelector('#data-venue-history #venue-history-export');
  };
  const exportFile = async (page, name) => {
    const waiting = page.waitForEvent('download');
    await page.click('#venue-history-export');
    const download = await waiting, file = path.join(tmp, name);
    await download.saveAs(file);
    return { file, archive: JSON.parse(fs.readFileSync(file, 'utf8')) };
  };
  const historyBytes = page => page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage)
    .filter(key => /^(deckchek\.venue-incidents\.v1\.|deckchek\.support-isolation\.v1\.)/.test(key)).sort()
    .map(key => [key, localStorage.getItem(key)]))));
  try {
    const source = await newPage('venue-history-source');
    await source.evaluate(seedVenueHistoryArchive, { incidentFixture, supportFixture });
    await openData(source);
    const exported = await exportFile(source, 'venue-history-source.json');
    check('venue history: Data exports every record beyond incident/report and support view limits',
      exported.archive.incidents.length === 302 && exported.archive.supportObservations.length === 102
      && exported.archive.supportComparisons.length === 101
      && exported.archive.incidents.some(row => row.id === 'archive-incident-000')
      && exported.archive.supportObservations.some(row => row.id === 'archive-observation-a')
      && exported.archive.supportComparisons.every(row => !Object.hasOwn(row, 'observationA') && !Object.hasOwn(row, 'observationB')));

    const target = await newPage('venue-history-target', true);
    await openData(target);
    await target.locator('#venue-history-file').setInputFiles({ name: 'History <img id="archive-file-injection" src=x>.json',
      mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported.archive)) });
    await target.waitForFunction(() => /302 incidents, 102 support observations and 101 comparisons/.test(document.querySelector('#venue-history-preview')?.textContent || ''));
    check('venue history: preview is explicit, escaped and has no persistence side effects',
      await target.locator('#venue-history-import').isEnabled()
      && /New records: 505\. Conflicts: 0/.test(await target.locator('#venue-history-preview').innerText())
      && /<img id="archive-file-injection"/.test(await target.locator('#venue-history-preview').innerText())
      && await target.locator('#archive-file-injection').count() === 0
      && await target.evaluate(() => window.__venueHistoryWrites === 0));
    await target.click('#venue-history-import');
    await target.waitForFunction(() => /Import complete\. Added 505 records; 0 exact records/.test(document.querySelector('#venue-history-status')?.textContent || ''));
    check('venue history: confirmation imports original records without creating current catalogs', await target.evaluate(async () => {
      const catalog = (await import('./catalog-store.js')).createCatalogStore({ invoke: null });
      return window.__venueHistoryWrites === 505 && (await catalog.list('venue')).length === 0
        && (await catalog.list('setup')).length === 0 && (await catalog.list('supportConfiguration')).length === 0;
    }));
    await target.reload(); await target.waitForSelector('.rail-item[data-screen="data"]'); await openData(target);
    const reexported = await exportFile(target, 'venue-history-after-reload.json');
    check('venue history: reload and re-export preserve all original metadata and numerical evidence',
      savedEvidence(reexported.archive) === savedEvidence(exported.archive));

    const beforeRetry = await historyBytes(target);
    await target.locator('#venue-history-file').setInputFiles(exported.file);
    await target.waitForFunction(() => /Exact records already present: 505\. New records: 0\. Conflicts: 0/.test(document.querySelector('#venue-history-preview')?.textContent || ''));
    await target.click('#venue-history-import');
    await target.waitForFunction(() => /Import complete\. Added 0 records; 505 exact records/.test(document.querySelector('#venue-history-status')?.textContent || ''));
    check('venue history: unchanged-file reimport performs no record writes',
      beforeRetry === await historyBytes(target) && await target.evaluate(() => window.__venueHistoryWrites === 0));

    const conflict = structuredClone(exported.archive);
    conflict.incidents[0].recordedAt = '2026-11-18T12:30:00.001Z';
    conflict.incidents.unshift({ ...structuredClone(conflict.incidents[1]), id: 'would-be-new-before-conflict' });
    await target.locator('#venue-history-file').setInputFiles({ name: 'conflicting-history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(conflict)) });
    await target.waitForFunction(() => /Conflicts: 1/.test(document.querySelector('#venue-history-preview')?.textContent || ''));
    check('venue history: changed persistence metadata blocks the entire proposed import',
      await target.locator('#venue-history-import').isDisabled() && beforeRetry === await historyBytes(target)
      && await target.evaluate(() => window.__venueHistoryWrites === 0));
    await setViewport(target, { width: 390, height: 800 });
    check('venue history: archive controls and conflict preview fit a phone viewport',
      await target.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await target.screenshot({ path: `${SHOTS}/venue-history-archive-phone.png` });
    await setViewport(target, { width: 1280, height: 900 });

    const workspaceBefore = await target.evaluate(async () => JSON.stringify((await import('./ui/state.js')).workspace));
    const chooser = target.waitForEvent('filechooser');
    await target.click('#data-import-json'); await (await chooser).setFiles(exported.file);
    await target.waitForFunction(() => /Could not import the workspace/.test(document.querySelector('#data-status')?.textContent || ''));
    check('venue history: the existing workspace importer rejects the distinct archive format',
      beforeRetry === await historyBytes(target)
      && workspaceBefore === await target.evaluate(async () => JSON.stringify((await import('./ui/state.js')).workspace)));

    await target.click('.rail-item[data-screen="hum"]'); await target.click('#hum-tab-incidents');
    await target.waitForFunction(() => /302/.test(document.querySelector('#incident-history')?.textContent || ''));
    check('venue history: imported incidents remain visible with no current venue and retain escaped original names',
      await target.locator('#incident-history tbody tr').count() === 100
      && /Historical venue <img/.test(await target.locator('#incident-history').innerText())
      && await target.locator('#venue-history-injection').count() === 0);
    await target.click('#hum-tab-support');
    await target.waitForFunction(() => /50 of 102 observations and 50 of 101 comparisons/.test(document.querySelector('#support-ab-history')?.textContent || ''));
    check('venue history: support history discloses retained totals and escapes original support names',
      /Original support <img/.test(await target.locator('#support-ab-history').innerText())
      && await target.locator('#support-history-injection').count() === 0);
    await target.screenshot({ path: `${SHOTS}/venue-history-retained-support.png` });
  } finally {
    for (const context of contexts) await context.close();
  }
  return errors.flat();
}
