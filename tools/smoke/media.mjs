// FS-06 smoke: Test media library screen, "Test medium" picker in the Speed form with prefill + unverified warning,
// custom media add/import/delete, flag off = hidden, and the desktop (invoke) path.
import { watchConsole, tauriMock } from './core.mjs';

const FLAG_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { testMedia: true } })); };

// Desktop mode: tauriMock plus an in-memory implementation of the media commands.
function mediaInvokeMock() {
  const rows = new Map(); const calls = [];
  const wrap = () => {
    const core = window.__TAURI__.core; const base = core.invoke;
    core.invoke = async (cmd, args) => {
      if (!cmd.startsWith('media_')) return base(cmd, args);
      calls.push(cmd);
      if (cmd === 'media_profiles_sync') { for (const p of args.profiles) { const { timecodeFacts, ...profile } = p; rows.set(p.id, { id: p.id, source: 'builtin', kind: p.kind, name: p.name, version: p.version, owned: false, retired: false, profile }); } return { inserted: args.profiles.length, updated: 0, unchanged: 0, retired: 0 }; }
      if (cmd === 'media_list') return [...rows.values()];
      if (cmd === 'media_custom_save') { const id = args.profile.id || crypto.randomUUID(); rows.set(id, { id, source: 'custom', kind: args.profile.kind, name: args.profile.name, version: 1, owned: false, retired: false, profile: { ...args.profile, id } }); return { id }; }
      if (cmd === 'media_custom_delete') { rows.delete(args.id); return null; }
      if (cmd === 'media_owned_set') { const r = rows.get(args.mediaId); if (r) r.owned = args.owned; return null; }
      throw `unknown command ${cmd}`;
    };
  };
  window.__mediaCalls = calls; wrap();
}

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const shot = async (page, name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const ctxOff = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const off = await ctxOff.newPage();
  errors.push(...watchConsole(off, 'media-off'));
  await off.goto(base);
  await off.waitForSelector('.rail-item');
  check('media: flag off hides the Test media screen', (await off.locator('.rail-item[data-screen="media"]').count()) === 0);
  await off.click('.rail-item[data-screen="speed"]');
  await off.waitForSelector('#screen-speed:not([hidden]) [data-param="referenceHz"]');
  check('media: flag off hides the Test medium field', (await off.locator('[data-param="testMedium"]').count()) === 0);
  await ctxOff.close();

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(FLAG_ON);
  const page = await context.newPage();
  errors.push(...watchConsole(page, 'media'));
  await page.goto(base);
  await page.waitForSelector('.rail-item');
  await page.click('.rail-item[data-screen="media"]');
  await page.waitForSelector('#screen-media:not([hidden]) .media-row');
  const names = await page.locator('.media-row-name').allInnerTexts();
  check('media: library lists built-in media', names.length >= 15 && names.includes('Ortofon Stereo Test Record'), `${names.length}`);
  check('media: confidence is shown as text', (await page.locator('.media-row .badge').first().innerText()).trim().length > 0);

  // filters and search
  await page.click('[data-filter="timecode"]');
  const tcNames = await page.locator('.media-row-name').allInnerTexts();
  check('media: Timecode filter shows only timecode media', tcNames.length > 0 && tcNames.every(n => !/test record|test lp/i.test(n)) && tcNames.some(n => /Serato/.test(n)), tcNames.join(', '));
  await page.click('[data-filter="custom"]');
  check('media: empty custom state copy', /No custom media yet\. Add the discs you own\./.test(await page.locator('#media-rows').innerText()));
  await page.click('[data-filter="all"]');
  await page.keyboard.press('/');
  check('media: / focuses search', await page.evaluate(() => document.activeElement?.id === 'media-search'));
  await page.fill('#media-search', 'ortofon');
  check('media: search filters', (await page.locator('.media-row').count()) === 1);

  // detail drawer
  await page.click('.media-row-main');
  await page.waitForSelector('.media-tracks');
  const detail = await page.locator('#media-detail').innerText();
  check('media: detail shows tracks and the unverified warning', /Unverified — confirm on your disc/.test(detail) && (await page.locator('.media-tracks tbody tr').count()) >= 10);
  check('media: built-in has no edit/delete, only duplicate', (await page.locator('#media-edit, #media-delete').count()) === 0 && (await page.locator('#media-duplicate').count()) === 1);
  check('media: track table has headers', (await page.locator('.media-tracks thead th[scope="col"]').count()) >= 6);
  await shot(page, 'media-detail');
  await page.keyboard.press('Escape');
  check('media: Esc closes the drawer', /Select a medium/.test(await page.locator('#media-detail').innerText()));
  await page.fill('#media-search', '');

  // owned
  await page.locator('.media-row', { hasText: 'Ortofon' }).locator('input[type="checkbox"]').check();
  await page.waitForTimeout(100);
  check('media: owned media floats to the top', (await page.locator('.media-row-name').first().innerText()) === 'Ortofon Stereo Test Record');

  // Use in test -> Speed form prefilled (AC-1, AC-2)
  await page.click('.media-row-main >> nth=0');
  await page.waitForSelector('.media-tracks');
  await page.locator('.media-tracks tbody tr', { hasText: '1000 Hz' }).first().locator('[data-use]').click();
  await page.waitForSelector('#screen-speed:not([hidden]) select[data-param="testMedium"][data-media-ready]');
  await page.waitForFunction(() => document.querySelector('#screen-speed [data-param="referenceHz"]')?.dataset.fromMedium);
  const ref = await page.inputValue('#screen-speed [data-param="referenceHz"]');
  const chipText = await page.locator('#screen-speed .media-chip').innerText();
  check('media: Use in test prefills the reference tone (1000 Hz)', ref === '1000', ref);
  check('media: prefill chip names the medium, track and level', /From Ortofon Stereo Test Record · track \d+ · 1000 Hz/.test(chipText), chipText);
  check('media: unverified warning shown in the chip and next to the prefilled field', /Unverified — confirm on your disc/.test(chipText) && /Unverified — confirm on your disc/.test(await page.locator('#screen-speed .media-prefill-note').first().innerText()));
  check('media: prefilled field is described by its note', await page.evaluate(() => { const i = document.querySelector('#screen-speed [data-param="referenceHz"]'); return !!document.getElementById(i.getAttribute('aria-describedby')); }));
  await shot(page, 'media-speed-prefill');

  // user override clears the note
  await page.fill('#screen-speed [data-param="referenceHz"]', '3000');
  check('media: manual edit overrides the prefill', (await page.locator('#screen-speed .media-prefill-note').count()) === 0);

  // Auto resets; choosing a confirmed timecode medium shows no warning
  await page.selectOption('#screen-speed select[data-param="testMedium"]', { label: 'Serato CV02.5 / CV02 control vinyl' }).catch(async () => {
    const opts = await page.locator('#screen-speed select[data-param="testMedium"] option').allInnerTexts();
    const label = opts.find(o => /Serato/.test(o) && !/CD/.test(o));
    await page.selectOption('#screen-speed select[data-param="testMedium"]', { label });
  });
  await page.waitForTimeout(100);
  const tcRef = await page.inputValue('#screen-speed [data-param="referenceHz"]');
  const tcChip = await page.locator('#screen-speed .media-chip').innerText();
  check('media: confirmed timecode medium prefills its carrier without a warning', tcRef === '1000' && /carrier/.test(tcChip) && !/Unverified/.test(tcChip), `${tcRef} ${tcChip}`);

  // Custom… option opens the library
  await page.selectOption('#screen-speed select[data-param="testMedium"]', '__custom');
  await page.waitForSelector('#screen-media:not([hidden])');
  check('media: "Custom…" opens the Test media screen', true);

  // add custom medium (AC-4) with live validation
  await page.click('#media-add');
  await page.waitForSelector('#media-form');
  await page.fill('#media-name', 'My 3.15 kHz disc');
  await page.click('#media-add-track');
  await page.locator('[data-field="tracks[0].frequencyHz"]').fill('-5');
  check('media: live validation flags a bad frequency via aria-describedby', await page.evaluate(() => { const i = document.querySelector('[data-field="tracks[0].frequencyHz"]'); const d = document.getElementById(i.getAttribute('aria-describedby') || ''); return i.getAttribute('aria-invalid') === 'true' && /frequencyHz/.test(d?.textContent || ''); }));
  await page.click('#media-save');
  check('media: invalid draft is not saved', (await page.locator('#media-form').count()) === 1);
  await page.locator('[data-field="tracks[0].frequencyHz"]').fill('3150');
  await page.locator('[data-field="tracks[0].level.value"]').fill('0');
  await page.click('#media-save');
  await page.waitForSelector('#media-edit');
  check('media: custom medium saved and selectable', /My 3.15 kHz disc/.test(await page.locator('#media-detail').innerText()) && (await page.locator('#media-delete, #media-export').count()) === 2);
  await page.click('#screen-media [data-filter="custom"]');
  check('media: Custom filter lists it', (await page.locator('.media-row-name').allInnerTexts()).includes('My 3.15 kHz disc'));

  // it appears in the Speed picker and prefills 3150
  await page.click('.rail-item[data-screen="speed"]');
  await page.waitForSelector('#screen-speed:not([hidden]) select[data-param="testMedium"][data-media-ready]');
  const optLabels = await page.locator('#screen-speed select[data-param="testMedium"] option').allInnerTexts();
  check('media: custom medium appears in the picker', optLabels.some(o => /3150 Hz/.test(o)));
  const value = await page.evaluate(() => [...document.querySelectorAll('#screen-speed select[data-param="testMedium"] optgroup')].find(g => /My 3.15/.test(g.label)).querySelector('option').value);
  await page.selectOption('#screen-speed select[data-param="testMedium"]', value);
  await page.waitForTimeout(100);
  check('media: custom medium prefills 3150 Hz with the unverified warning', (await page.inputValue('#screen-speed [data-param="referenceHz"]')) === '3150' && /Unverified — confirm on your disc/.test(await page.locator('#screen-speed .media-chip').innerText()));

  // Cartridge form has the picker, DVS form too; the DVS list only has timecode media
  await page.click('.rail-item[data-screen="dvs"]');
  await page.waitForSelector('#screen-dvs:not([hidden]) select[data-param="testMedium"][data-media-ready]');
  const dvsOpts = await page.locator('#screen-dvs select[data-param="testMedium"] optgroup').evaluateAll(gs => gs.map(g => g.label));
  check('media: DVS picker offers only timecode media', dvsOpts.length > 0 && dvsOpts.every(l => !/Ortofon|My 3.15/.test(l)) && dvsOpts.some(l => /Serato/.test(l)), dvsOpts.join(', '));

  // import: invalid schema lists field errors and stores nothing (AC-5)
  await page.click('.rail-item[data-screen="media"]');
  await page.waitForSelector('#media-import-file', { state: 'attached' });
  const before = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('deckchek.media.v1') || '{"custom":{}}').custom).length);
  await page.setInputFiles('#media-import-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'nope', name: '', confidence: 'maybe', version: 1, tracks: [{ key: 'a b', purpose: 'x' }] })) });
  await page.waitForSelector('#media-import-errors .banner-fail');
  const errText = await page.locator('#media-import-errors').innerText();
  const after = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('deckchek.media.v1') || '{"custom":{}}').custom).length);
  check('media: invalid import lists field errors and stores nothing', /Nothing was stored/.test(errText) && /kind/.test(errText) && /name/.test(errText) && before === after, errText.replace(/\s+/g, ' ').slice(0, 160));
  const good = { schemaVersion: 1, version: 1, kind: 'test_record', name: 'Imported disc', confidence: 'unverified', playbackRpm: 33.333, tracks: [{ key: 't1', purpose: 'speed_tone', frequencyHz: 3000 }] };
  await page.setInputFiles('#media-import-file', { name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(good)) });
  await page.waitForFunction(() => /Imported disc/.test(document.querySelector('#media-detail')?.innerText || ''));
  check('media: valid import is stored as a custom medium', (await page.locator('#media-edit').count()) === 1);

  // delete with confirmation
  await page.click('#media-delete');
  await page.waitForSelector('#confirm-dialog[open]');
  await page.click('#confirm-ok');
  await page.waitForFunction(() => !(document.querySelector('#media-rows')?.innerText || '').includes('Imported disc'));
  check('media: delete removes the custom medium', true);
  await shot(page, 'media-library');
  await context.close();

  // ----- desktop mode: media_* commands over invoke -----
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await dctx.addInitScript(tauriMock);
  await dctx.addInitScript(FLAG_ON);
  await dctx.addInitScript(mediaInvokeMock);
  const dp = await dctx.newPage();
  errors.push(...watchConsole(dp, 'media-desktop'));
  await dp.goto(base);
  await dp.waitForSelector('.rail-item');
  await dp.click('.rail-item[data-screen="media"]');
  await dp.waitForSelector('#screen-media:not([hidden]) .media-row');
  const calls = await dp.evaluate(() => window.__mediaCalls);
  check('media: desktop mode syncs built-ins and lists through the media commands', calls.includes('media_profiles_sync') && calls.includes('media_list'), calls.join(','));
  await dp.locator('.media-row', { hasText: 'Ortofon' }).locator('input[type="checkbox"]').check();
  await dp.waitForTimeout(100);
  check('media: desktop owned toggle calls media_owned_set', (await dp.evaluate(() => window.__mediaCalls)).includes('media_owned_set'));
  await dctx.close();
  return errors;
}
