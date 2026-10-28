// FS-32 smoke: MIDI mapper studio. Flag off = no rail entry. Browser mode: empty state, open the self-authored learned
// map fixture, assign Play, preview contains <key>play</key>, Ctrl+Z undo, a conflicting model blocks Save and marks
// both rows "Conflict" in words, a malformed XML file reports line/column, Traktor/Serato are labelled report-only /
// experimental, Mixxx Save downloads the .midi.xml. Desktop mode (mocked Tauri): load the unit's learned map, learn a
// control from a MIDI message, Esc cancels learning, Save mapping calls mapper_model_save, Save… writes the folder
// through userfiles_write_folder. Accessibility audit, phone width, dark and light screenshots.
import fs from 'node:fs';
import path from 'node:path';
import { watchConsole, tauriMock, a11yAudit, setViewport } from './core.mjs';

const FLAG_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { mapperStudio: true } })); };
const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'tests', 'fixtures', 'mapper');

// Desktop additions on top of tauriMock: dialog plugin, userfiles_write_folder and the mapper_model_* commands.
function mapperMock(learned) {
  const core = window.__TAURI__.core; const base = core.invoke;
  const mp = { rows: [], writes: [], calls: [] };
  window.__mp = mp;
  window.__mockDb.midiMaps['asset-pioneer-dj-ddj-flx4'] = { assetId: 'asset-pioneer-dj-ddj-flx4', profileId: 'pioneer-dj-ddj-flx4', map: learned.map, updatedAt: '2026-10-20T18:00:00.000Z' };
  window.__TAURI__.dialog = { open: async () => '/home/dj/Mixxx/controllers', save: async ({ defaultPath }) => `/home/dj/${defaultPath}` };
  let n = 0;
  core.invoke = async (cmd, args = {}) => {
    if (cmd.startsWith('mapper_model_') || cmd.startsWith('userfiles_')) mp.calls.push(cmd);
    if (cmd === 'userfiles_write_folder') { mp.writes.push(args); return { written: args.files.length, path: args.dir }; }
    if (cmd === 'userfiles_write_text') { mp.writes.push(args); return { path: args.path, bytes: args.content.length }; }
    if (cmd === 'mapper_model_save') {
      const i = args.input; const now = new Date().toISOString();
      const row = { id: i.id || `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, assetId: i.assetId, profileId: i.profileId, name: i.name, model: i.model, createdAt: now, updatedAt: now };
      mp.rows = [row, ...mp.rows.filter(r => r.id !== row.id)]; return row;
    }
    if (cmd === 'mapper_model_list') return mp.rows.map(({ model, ...r }) => ({ ...r, version: model.version, controlCount: model.controls.length }));
    if (cmd === 'mapper_model_get') return mp.rows.find(r => r.id === args.id) || null;
    if (cmd === 'mapper_model_delete') { const before = mp.rows.length; mp.rows = mp.rows.filter(r => r.id !== args.id); return mp.rows.length < before; }
    return base(cmd, args);
  };
}

async function openFiles(page, files) {
  const chooser = page.waitForEvent('filechooser');
  await page.click('#mp-open');
  await (await chooser).setFiles(files);
}

export default async function run({ browser, base, check, SHOTS, tmp }) {
  const errors = [];
  const learnedPath = path.join(FIXTURES, 'learned-map.json');
  const learned = JSON.parse(fs.readFileSync(learnedPath, 'utf8'));
  const dupPath = path.join(tmp, 'conflict.json');
  fs.writeFileSync(dupPath, JSON.stringify({ version: 1, name: 'Conflict test', decks: 2, controls: [
    { label: 'Pad A', midi: { type: 'note', channel: 1, number: 20 }, kind: 'button', layer: 'base', function: { id: 'play', deck: 1 } },
    { label: 'Pad B', midi: { type: 'note', channel: 1, number: 20 }, kind: 'button', layer: 'base', function: { id: 'cue', deck: 1 } }] }));
  const badXml = path.join(tmp, 'broken.midi.xml');
  fs.writeFileSync(badXml, '<MixxxControllerPreset>\n  <controller>\n    <controls>\n  </controller>\n</MixxxControllerPreset>\n');
  const xxe = path.join(FIXTURES, 'xxe.midi.xml');

  // ----- flag off -----
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const po = await off.newPage();
  errors.push(...watchConsole(po, 'mapper-off'));
  await po.goto(base);
  await po.waitForSelector('.rail-item');
  check('mapper: flag off hides the MIDI mapper screen', (await po.locator('.rail-item[data-screen="mapper"]').count()) === 0);
  await off.close();

  // ----- browser mode -----
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark', acceptDownloads: true });
  await ctx.addInitScript(FLAG_ON);
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'mapper-browser'));
  await page.goto(base);
  await page.waitForSelector('.rail-item[data-screen="mapper"]');
  await page.click('.rail-item[data-screen="mapper"]');
  await page.waitForSelector('#mp-open');
  check('mapper: empty state names learning and official profiles', /No MIDI map for this device\. Learn controls or pick an official profile/.test(await page.locator('#mp-empty').innerText()));
  check('mapper: targets carry status chips in words', /Mixxx \(Supported\)/.test(await page.locator('#mp-target').innerText()) && /Traktor \(Report only\)/.test(await page.locator('#mp-target').innerText()) && /Serato \(Experimental\)/.test(await page.locator('#mp-target').innerText()));

  await openFiles(page, [learnedPath]);
  await page.waitForSelector('#mp-rows tr');
  check('mapper: learned map fixture loads its controls (AC-7)', (await page.locator('#mp-rows tr').count()) === 16, String(await page.locator('#mp-rows tr').count()));
  check('mapper: partial state counts unmapped controls', /1 unmapped/.test(await page.locator('#mp-partial').innerText()));
  await page.locator('#mp-rows tr', { hasText: 'Deck 1 Sync' }).first().click();
  await page.click('#mp-clear');
  await page.fill('#mp-fn-search', 'play');
  await page.press('#mp-fn-search', 'Enter');
  await page.waitForFunction(() => /<midino>0x58<\/midino>/.test(document.querySelector('#mp-preview')?.textContent || ''));
  const preview = await page.locator('#mp-preview').innerText();
  check('mapper: assign Play then the Mixxx preview contains <key>play</key> (AC-1)', /<key>play<\/key>\s*<status>0x90<\/status>\s*<midino>0x58<\/midino>/.test(preview));
  check('mapper: the row shows its new function', /Deck 1 play/i.test(await page.locator('#mp-rows tr[aria-selected="true"]').innerText()));
  await page.locator('#mp-rows tr[aria-selected="true"]').focus();
  await page.keyboard.press('Control+z');
  check('mapper: Ctrl+Z undoes the assignment', /Unassigned/.test(await page.locator('#mp-rows tr[aria-selected="true"]').innerText()));
  await page.keyboard.press('ArrowDown');
  check('mapper: arrow keys move through the list', !/Deck 1 Sync/.test(await page.locator('#mp-rows tr[aria-selected="true"]').innerText()));
  await page.keyboard.press('Enter');
  check('mapper: Enter goes to the function search', await page.evaluate(() => document.activeElement?.id === 'mp-fn-search'));
  await page.screenshot({ path: `${SHOTS}/mapper-dark.png` });

  const dl = page.waitForEvent('download');
  await page.keyboard.press('Escape');
  await page.click('#mp-export-save');
  const download = await dl;
  check('mapper: Save… downloads the Mixxx .midi.xml in browser mode', /\.midi\.xml$/.test(download.suggestedFilename()), download.suggestedFilename());
  await page.waitForSelector('#mp-status [data-tone="pass"]');
  check('mapper: success says where to copy the files', /Saved\..*controllers/.test(await page.locator('#mp-status').innerText()));

  await page.selectOption('#mp-target', 'traktor');
  check('mapper: Traktor is labelled Report only with a Markdown report', /Report only/i.test(await page.locator('#mp-target-chip').innerText()) && /Traktor mapping report/.test(await page.locator('#mp-preview').innerText()));
  await page.selectOption('#mp-target', 'serato');
  check('mapper: Serato is labelled Experimental', /Experimental/i.test(await page.locator('#mp-target-chip').innerText()) && /Experimental\/Report/.test(await page.locator('#mp-report-note').innerText()));
  await page.selectOption('#mp-target', 'vdj');
  check('mapper: VirtualDJ preview shows the device definition', /<device name=/.test(await page.locator('#mp-preview').innerText()) && (await page.locator('.mp-tabs button').count()) === 2);
  await page.selectOption('#mp-target', 'mixxx');

  await openFiles(page, [dupPath]);
  await page.waitForSelector('.mp-issue[data-code="DUPLICATE_BINDING"]');
  check('mapper: conflicting bindings block export (AC-4)', await page.locator('#mp-export-save').isDisabled());
  check('mapper: both conflicting rows say "Conflict" in words', (await page.locator('#mp-rows tr .mp-flag-conflict').count()) === 2);
  check('mapper: validation sits in a live region', (await page.locator('#mp-validation[aria-live="polite"]').count()) === 1);

  await openFiles(page, [badXml]);
  await page.waitForSelector('#mp-status [data-tone="fail"]');
  check('mapper: a malformed file reports line and column', /line \d+, column \d+/.test(await page.locator('#mp-status').innerText()));
  await openFiles(page, [xxe]);
  await page.waitForSelector('#mp-status [data-tone="fail"]');
  check('mapper: a DOCTYPE/entity file is refused (XXE)', /DOCTYPE/.test(await page.locator('#mp-status').innerText()));

  await openFiles(page, [learnedPath]);
  await page.waitForSelector('#mp-rows tr');
  const audit = await a11yAudit(page);
  check('mapper: every control is named and big enough', audit.unnamed.length === 0 && audit.small.length === 0, JSON.stringify(audit));
  await setViewport(page, { width: 420, height: 800 });
  check('mapper: no horizontal scroll at phone width', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await ctx.close();

  // ----- light theme screenshot -----
  const lctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'light' });
  await lctx.addInitScript(FLAG_ON);
  const lp = await lctx.newPage();
  errors.push(...watchConsole(lp, 'mapper-light'));
  await lp.goto(base);
  await lp.click('.rail-item[data-screen="mapper"]');
  await openFiles(lp, [learnedPath]);
  await lp.waitForSelector('#mp-rows tr');
  await lp.screenshot({ path: `${SHOTS}/mapper-light.png` });
  await lctx.close();

  // ----- desktop mode -----
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' });
  await dctx.addInitScript(tauriMock);
  await dctx.addInitScript(mapperMock, learned);
  await dctx.addInitScript(FLAG_ON);
  const dp = await dctx.newPage();
  errors.push(...watchConsole(dp, 'mapper-desktop'));
  await dp.goto(base);
  await dp.waitForSelector('.rail-item[data-screen="mapper"]');
  await dp.click('.rail-item[data-screen="mapper"]');
  await dp.waitForFunction(() => document.querySelector('#mp-device option[value="asset-pioneer-dj-ddj-flx4"]'));
  await dp.selectOption('#mp-device', 'asset-pioneer-dj-ddj-flx4');
  await dp.click('#mp-load-device');
  await dp.waitForSelector('#mp-rows tr');
  check('mapper (desktop): the unit\'s learned map loads with suggestions', (await dp.locator('#mp-rows tr').count()) === 16 && /map learned on this unit/.test(await dp.locator('#mp-status').innerText()));
  await dp.selectOption('#mp-device', 'asset-rane-twelve-mk2');
  await dp.click('#mp-load-device');
  await dp.waitForSelector('#mp-empty');
  check('mapper (desktop): a unit with no map shows the empty state', /No MIDI map for this device/.test(await dp.locator('#mp-status').innerText()));
  await dp.waitForFunction(() => !document.querySelector('#mp-learn')?.disabled && document.querySelector('#mp-port option')?.value);
  await dp.click('#mp-learn');
  await dp.waitForSelector('#mp-learn[aria-pressed="true"]');
  await dp.keyboard.press('Escape');
  check('mapper (desktop): Esc cancels learning', (await dp.locator('#mp-learn[aria-pressed="false"]').count()) === 1 && /cancelled/i.test(await dp.locator('#mp-status').innerText()));
  await dp.locator('h1', { hasText: 'MIDI mapper' }).click();
  await dp.keyboard.press('l');
  await dp.waitForSelector('#mp-learn[aria-pressed="true"]');
  await dp.evaluate(() => window.__emitMidi([0x90, 0x0b, 0x7f]));
  await dp.waitForSelector('#mp-rows tr');
  check('mapper (desktop): L learns a control from the next MIDI message', /Note 11 · ch 1/.test(await dp.locator('#mp-rows').innerText()));
  await dp.fill('#mp-fn-search', 'play');
  await dp.press('#mp-fn-search', 'Enter');
  await dp.waitForFunction(() => /<key>play<\/key>/.test(document.querySelector('#mp-preview')?.textContent || ''));
  await dp.fill('#mp-name', 'Rane learned');
  await dp.press('#mp-name', 'Tab');
  await dp.click('#mp-save-model');
  await dp.waitForFunction(() => window.__mp.rows.length === 1);
  const row = await dp.evaluate(() => window.__mp.rows[0]);
  check('mapper (desktop): Save mapping stores the model with its unit', row.name === 'Rane learned' && row.assetId === 'asset-rane-twelve-mk2' && row.model.controls[0].function.id === 'play');
  await dp.keyboard.press('Control+s');
  await dp.waitForFunction(() => window.__mp.writes.length === 1);
  const write = await dp.evaluate(() => window.__mp.writes[0]);
  check('mapper (desktop): Ctrl+S writes the export through userfiles_write_folder', write.dir === '/home/dj/Mixxx/controllers' && write.files.length === 1 && write.files[0].relPath === 'Rane learned.midi.xml' && write.allowedExts.join() === 'xml,js');
  await dp.waitForSelector('#mp-status [data-tone="pass"]');
  check('mapper (desktop): success shows the folder written', /Saved to \/home\/dj\/Mixxx\/controllers/.test(await dp.locator('#mp-status').innerText()));
  await dp.selectOption('#mp-target', 'vdj');
  await dp.click('#mp-export-save');
  await dp.waitForFunction(() => window.__mp.writes.length === 2);
  const vw = await dp.evaluate(() => window.__mp.writes[1]);
  check('mapper (desktop): VirtualDJ writes Devices/ and Mappers/ files', vw.files.map(f => f.relPath).join() === 'Devices/Rane learned.xml,Mappers/Rane learned.xml');
  await dctx.close();
  return errors;
}
