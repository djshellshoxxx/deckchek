// FS-32 smoke: MIDI mapper studio. Flag off = no rail entry. Browser mode: empty state, open the self-authored learned
// map fixture, assign Play, preview contains <key>play</key>, Ctrl+Z undo, a conflicting model blocks Save and marks
// both rows "Conflict" in words, a malformed XML file reports line/column, Traktor/Serato are labelled report-only /
// experimental, Mixxx Save downloads the .midi.xml. Desktop mode (mocked Tauri): load the unit's learned map, learn a
// control from a MIDI message, Esc cancels learning, Save mapping calls mapper_model_save, Save… writes the folder
// through userfiles_write_folder. Accessibility audit, phone width, dark and light screenshots.
// Regressions (FS-32 review): hostile .json reports an error, import warnings are summarised outside the live region
// and controls capped, selection does not rebuild the table/export, a typed name survives a direct function click,
// long names keep download names intact, focus stays put after Learn/cancel/Save…/tabs/force/Clear/Remove, the
// Learn MIDI input is closed (cancel, learned, screen hidden), a read-only newer mapping cannot be saved, and a
// double-clicked Save mapping stores one row.
import fs from 'node:fs';
import path from 'node:path';
import { watchConsole, tauriMock, a11yAudit, setViewport } from './core.mjs';

const FLAG_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { mapperStudio: true } })); };
const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'tests', 'fixtures', 'mapper');

// Desktop additions on top of tauriMock: dialog plugin, userfiles_write_folder and the mapper_model_* commands.
function mapperMock(learned) {
  const core = window.__TAURI__.core; const base = core.invoke;
  const mp = { rows: [], writes: [], calls: [], midi: [] };
  window.__mp = mp;
  window.__mockDb.midiMaps['asset-pioneer-dj-ddj-flx4'] = { assetId: 'asset-pioneer-dj-ddj-flx4', profileId: 'pioneer-dj-ddj-flx4', map: learned.map, updatedAt: '2026-10-20T18:00:00.000Z' };
  window.__TAURI__.dialog = { open: async () => '/home/dj/Mixxx/controllers', save: async ({ defaultPath }) => `/home/dj/${defaultPath}` };
  let n = 0;
  core.invoke = async (cmd, args = {}) => {
    if (cmd.startsWith('mapper_model_') || cmd.startsWith('userfiles_')) mp.calls.push(cmd);
    if (cmd === 'midi_open_input' || cmd === 'midi_close_input' || cmd === 'midi_close_all') mp.midi.push(cmd);
    if (cmd === 'midi_open_input' && mp.slowOpen) await new Promise(r => setTimeout(r, mp.slowOpen)); // a slow driver
    if (cmd === 'userfiles_write_folder') { mp.writes.push(args); return { written: args.files.length, path: args.dir }; }
    if (cmd === 'userfiles_write_text') { mp.writes.push(args); return { path: args.path, bytes: args.content.length }; }
    if (cmd === 'mapper_model_save') {
      await new Promise(r => setTimeout(r, 150)); // a real IPC + SQLite round trip, so a double click can race it
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

const soft = p => p.then(() => true, () => false);
const activeId = page => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || '');
const statusMatches = (page, re, timeout = 5000) => soft(page.waitForFunction(src => new RegExp(src).test(document.querySelector('#mp-status')?.textContent || ''), re.source, { timeout }));

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
  // The export is regenerated once edits pause (debounced), so wait for the new entry rather than any 0x58 entry.
  await soft(page.waitForFunction(() => /<key>play<\/key>\s*<status>0x90<\/status>\s*<midino>0x58<\/midino>/.test(document.querySelector('#mp-preview')?.textContent || ''), null, { timeout: 5000 }));
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

  // regression: hostile JSON values (objects without a usable toString) must not leave the status on "Reading…".
  const hostileModel = path.join(tmp, 'hostile.json');
  fs.writeFileSync(hostileModel, '{"version":1,"name":{"toString":null,"valueOf":null},"controls":[]}');
  await openFiles(page, [hostileModel]);
  check('mapper: regression: a hostile .json mapping says "Could not open the mapping." (not stuck on Reading…)', await statusMatches(page, /Could not open the mapping/, 3000), await page.locator('#mp-status').innerText());
  const hostileLearned = path.join(tmp, 'hostile-learned.json');
  fs.writeFileSync(hostileLearned, '{"map":{"controls":[{"label":{"toString":null},"message":{"kind":"cc","channel":1,"number":3}}]}}');
  await page.evaluate(() => document.querySelector('#mp-status').replaceChildren());
  await openFiles(page, [hostileLearned]);
  check('mapper: regression: a hostile learned map says "Could not open the mapping."', await statusMatches(page, /Could not open the mapping/, 3000), await page.locator('#mp-status').innerText());

  // regression: thousands of per-line warnings are summarised (not dumped into the live region) and controls are capped.
  const many = path.join(tmp, 'many.midi.xml');
  const ctl = (status, no) => `<control><group>[Channel1]</group><key>play</key><status>0x${status.toString(16).toUpperCase()}</status><midino>0x${no.toString(16).toUpperCase()}</midino><options><normal/></options></control>`;
  let body = '';
  for (let i = 0; i < 2100; i++) body += ctl((i < 2048 ? 0x90 : 0xb0) | (Math.floor(i / 128) % 16), i % 128);
  for (let i = 0; i < 300; i++) body += ctl(0xa0, i % 128);
  fs.writeFileSync(many, `<MixxxControllerPreset mixxxVersion="2.4+"><info><name>Many</name></info><controller id="Many"><controls>${body}</controls></controller></MixxxControllerPreset>`);
  await openFiles(page, [many]);
  await statusMatches(page, /Mixxx mapping opened/, 20000);
  const statusText = await page.locator('#mp-status').innerText();
  const lineCount = (statusText.match(/Line \d+/g) || []).length;
  check('mapper: regression: import warnings in the live status are capped with "and N more"', statusText.length < 1500 && lineCount <= 5 && /\d+ more/.test(statusText), `${statusText.length} chars, ${lineCount} line warnings`);
  const fullList = await page.locator('#mp-warnings li').count();
  check('mapper: regression: the full warning list sits in a collapsed <details> outside the live region', fullList >= 300 && (await page.locator('#mp-warnings').evaluate(d => d.tagName === 'DETAILS' && !d.open && !d.closest('[aria-live]'))), String(fullList));
  check('mapper: regression: imported controls are capped at 2048', (await page.locator('#mp-rows tr').count()) === 2048, String(await page.locator('#mp-rows tr').count()));

  // regression: a crafted file whose script-file list makes a megabyte warning keeps the live status short.
  const huge = path.join(tmp, 'huge-note.midi.xml');
  const scriptDecls = Array.from({ length: 4000 }, (_, i) => `<file filename="${String(i).padStart(4, '0')}${'n'.repeat(250)}.js" functionprefix="P${i}"/>`).join('');
  fs.writeFileSync(huge, `<MixxxControllerPreset><info><name>Huge</name></info><controller id="Huge"><scriptfiles>${scriptDecls}</scriptfiles><controls>${ctl(0x90, 1)}</controls></controller></MixxxControllerPreset>`);
  await openFiles(page, [huge]);
  await statusMatches(page, /Mixxx mapping opened/, 20000);
  const hugeStatus = await page.locator('#mp-status').innerText();
  check('mapper: regression: a megabyte import note is cut short in the live status', hugeStatus.length < 1000 && /script files 0000n+/.test(hugeStatus) && /…/.test(hugeStatus), `${hugeStatus.length} chars`);

  await openFiles(page, [learnedPath]);
  await statusMatches(page, /Learned map opened/);
  await page.waitForSelector('#mp-rows tr');
  check('mapper: regression: a clean import clears the old warning list', (await page.locator('#mp-warnings').count()) === 0 || (await page.locator('#mp-warnings').isHidden()));

  // regression: a selection change does not rebuild the table or regenerate the export.
  await page.locator('#mp-rows tr').first().click();
  await page.evaluate(() => { window.__keep = { table: document.querySelector('#mp-table'), preview: document.querySelector('#mp-preview') }; });
  await page.keyboard.press('ArrowDown');
  const keptNodes = await page.evaluate(() => window.__keep.table.isConnected && window.__keep.preview.isConnected);
  const movedSel = await page.evaluate(() => document.querySelectorAll('#mp-rows tr[aria-selected="true"]').length === 1 && document.activeElement === document.querySelectorAll('#mp-rows tr')[1] && document.activeElement.getAttribute('tabindex') === '0' && document.querySelectorAll('#mp-rows tr[tabindex="0"]').length === 1);
  check('mapper: regression: arrowing through the list keeps the table and export (no full rebuild)', keptNodes && movedSel, `kept=${keptNodes} moved=${movedSel}`);
  await page.locator('#mp-rows tr').first().click();
  check('mapper: regression: clicking a row selects it without rebuilding the table', await page.evaluate(() => window.__keep.table.isConnected && document.querySelector('#mp-rows tr[aria-selected="true"]') === document.querySelectorAll('#mp-rows tr')[0]));

  // regression: an edit patches only the changed row, and a burst of edits regenerates the export once.
  const burst = await page.evaluate(async () => {
    const other = document.querySelectorAll('#mp-rows tr')[5];
    let previews = 0;
    const mo = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.id === 'mp-preview' || n.querySelector?.('#mp-preview')) previews++; });
    mo.observe(document.querySelector('.mp-right'), { childList: true, subtree: true });
    for (const fn of ['play', 'cue', 'sync']) document.querySelector(`#mp-fn-list [data-fn="${fn}"]`).click();
    const rowNow = document.querySelector('#mp-rows tr[aria-selected="true"]').innerText;
    await new Promise(r => setTimeout(r, 700));
    mo.disconnect();
    return { table: window.__keep.table.isConnected, other: other.isConnected, rowNow, previews, preview: /sync_enabled/.test(document.querySelector('#mp-preview')?.textContent || '') };
  });
  check('mapper: regression: an edit keeps the table and unchanged rows, the edited row updates at once', burst.table && burst.other && /sync/i.test(burst.rowNow), JSON.stringify(burst));
  check('mapper: regression: three quick edits regenerate the export preview once (debounced)', burst.previews === 1 && burst.preview, JSON.stringify(burst));
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');

  // regression: typing a control name then clicking a function button directly keeps both.
  await page.locator('#mp-rows tr', { hasText: 'Deck 1 Sync' }).first().click();
  await page.fill('#mp-label', 'Renamed pad');
  await page.click('#mp-fn-list [data-fn="cue"]');
  const renamed = await page.locator('#mp-rows tr[aria-selected="true"]').innerText();
  check('mapper: regression: a typed name survives a direct click on a function, and the click assigns it', /Renamed pad/.test(renamed) && /cue/i.test(renamed), renamed.replace(/\s+/g, ' '));

  // regression: focus stays on the control that was used (keyboard path).
  await page.locator('#mp-clear').focus();
  await page.keyboard.press('Enter');
  check('mapper: regression: Clear function moves focus to the function search, not <body>', (await activeId(page)) === 'mp-fn-search', await activeId(page));
  await page.selectOption('#mp-target', 'vdj');
  await page.locator('#mp-force').focus();
  await page.keyboard.press('Space');
  check('mapper: regression: the VirtualDJ force checkbox keeps focus', (await activeId(page)) === 'mp-force' && (await page.locator('#mp-force').isChecked()), await activeId(page));
  await page.locator('.mp-tabs button').nth(1).focus();
  await page.keyboard.press('Enter');
  check('mapper: regression: an export file tab keeps focus', await page.evaluate(() => Boolean(document.activeElement?.closest('.mp-tabs')) && document.activeElement.getAttribute('aria-pressed') === 'true'), await activeId(page));
  await page.locator('#mp-force').uncheck();
  await page.selectOption('#mp-target', 'mixxx');

  // regression: long names keep the download names intact in browser mode (.midi.xml, script name, VirtualDJ pair).
  await page.fill('#mp-name', 'L'.repeat(100));
  await page.press('#mp-name', 'Tab');
  const downloads = [];
  page.on('download', d => downloads.push(d.suggestedFilename()));
  const mxFiles = await page.evaluate(() => Math.max(1, document.querySelectorAll('.mp-tabs button').length));
  await page.evaluate(() => document.querySelector('#mp-status').replaceChildren());
  await page.locator('#mp-export-save').focus();
  await page.keyboard.press('Enter');
  await statusMatches(page, /^Saved\./);
  await page.waitForTimeout(300);
  check('mapper: regression: Save… keeps focus on the Save button', (await activeId(page)) === 'mp-export-save', await activeId(page));
  const xmlName = downloads.find(n => /\.xml$/.test(n)) || '';
  const jsName = downloads.find(n => /\.js$/.test(n)) || null;
  const xmlText = await page.evaluate(() => document.querySelector('#mp-preview')?.textContent || '');
  check('mapper: regression: a 100-character name still downloads as <stem>.midi.xml', /\.midi\.xml$/.test(xmlName) && downloads.length === mxFiles, downloads.join(' | '));
  check('mapper: regression: the downloaded script name matches the file the XML references', !jsName || xmlText.includes(`filename="${jsName}"`), String(jsName));
  downloads.length = 0;
  await page.selectOption('#mp-target', 'vdj');
  await page.locator('#mp-force').check();
  await page.evaluate(() => document.querySelector('#mp-status').replaceChildren());
  await page.click('#mp-export-save');
  await statusMatches(page, /^Saved\./);
  await page.waitForTimeout(300);
  check('mapper: regression: VirtualDJ downloads keep distinct " - Devices" / " - Mappers" names', downloads.length === 2 && downloads.some(n => /^force-L+ - Devices\.xml$/.test(n)) && downloads.some(n => /^L+ - Mappers\.xml$/.test(n)), downloads.join(' | '));
  await page.locator('#mp-force').uncheck();
  await page.selectOption('#mp-target', 'mixxx');

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
  await soft(dp.waitForFunction(() => window.__mp.midi.filter(c => c === 'midi_close_input').length === 1, null, { timeout: 2000 }));
  check('mapper (desktop): regression: cancelling Learn closes the MIDI input it opened', (await dp.evaluate(() => window.__mp.midi.join())) === 'midi_open_input,midi_close_input', await dp.evaluate(() => window.__mp.midi.join()));
  await dp.locator('#mp-learn').focus();
  await dp.keyboard.press('Enter');
  await dp.waitForSelector('#mp-learn[aria-pressed="true"]');
  check('mapper (desktop): regression: Learn keeps keyboard focus on the Learn button', (await activeId(dp)) === 'mp-learn', await activeId(dp));
  await dp.keyboard.press('Enter');
  await dp.waitForSelector('#mp-learn[aria-pressed="false"]');
  check('mapper (desktop): regression: cancelling Learn keeps keyboard focus on the Learn button', (await activeId(dp)) === 'mp-learn', await activeId(dp));
  await dp.locator('h1', { hasText: 'MIDI mapper' }).click();
  await dp.keyboard.press('l');
  await dp.waitForSelector('#mp-learn[aria-pressed="true"]');
  await dp.evaluate(() => window.__emitMidi([0x90, 0x0b, 0x7f]));
  await dp.waitForSelector('#mp-rows tr');
  check('mapper (desktop): L learns a control from the next MIDI message', /Note 11 · ch 1/.test(await dp.locator('#mp-rows').innerText()));
  await soft(dp.waitForFunction(() => window.__mp.midi.filter(c => c === 'midi_close_input').length === 3, null, { timeout: 2000 }));
  const midiLog = await dp.evaluate(() => window.__mp.midi);
  check('mapper (desktop): regression: the Learn input is closed once a control is learned (opens = closes)', midiLog.filter(c => c === 'midi_open_input').length === 3 && midiLog.filter(c => c === 'midi_close_input').length === 3, midiLog.join());
  await dp.fill('#mp-fn-search', 'play');
  await dp.press('#mp-fn-search', 'Enter');
  await dp.waitForFunction(() => /<key>play<\/key>/.test(document.querySelector('#mp-preview')?.textContent || ''));
  await dp.fill('#mp-name', 'Rane learned');
  await dp.press('#mp-name', 'Tab');
  await dp.dblclick('#mp-save-model');
  await dp.waitForFunction(() => window.__mp.rows.length >= 1);
  await dp.waitForTimeout(500);
  check('mapper (desktop): regression: double-clicking Save mapping stores one row', (await dp.evaluate(() => window.__mp.rows.length)) === 1 && (await dp.evaluate(() => window.__mp.calls.filter(c => c === 'mapper_model_save').length)) === 1, String(await dp.evaluate(() => window.__mp.rows.length)));
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
  await dp.selectOption('#mp-target', 'mixxx');

  // regression: removing the last control does not drop focus to <body>.
  await dp.locator('#mp-rows tr').first().click();
  await dp.locator('#mp-remove').focus();
  await dp.keyboard.press('Enter');
  await dp.waitForSelector('#mp-empty');
  check('mapper (desktop): regression: removing the last control keeps focus inside the mapper', await dp.evaluate(() => document.activeElement !== document.body && Boolean(document.activeElement?.closest('#screen-mapper'))), await activeId(dp));

  // regression: leaving the screen while learning closes the MIDI input.
  await dp.click('#mp-learn');
  await dp.waitForSelector('#mp-learn[aria-pressed="true"]');
  await dp.locator('.rail-item:not([data-screen="mapper"])').first().click();
  await soft(dp.waitForFunction(() => window.__mp.midi.filter(c => c === 'midi_close_input').length === 4, null, { timeout: 2000 }));
  const midiEnd = await dp.evaluate(() => window.__mp.midi);
  check('mapper (desktop): regression: hiding the screen while learning closes the MIDI input', midiEnd.filter(c => c === 'midi_open_input').length === 4 && midiEnd.filter(c => c === 'midi_close_input').length === 4, midiEnd.join());

  // regression: a mapping saved by a newer DeckChek opens read-only and cannot be saved over.
  await dp.evaluate(() => {
    const model = { version: 2, name: 'From the future', decks: 2, futureField: 'keep me', controls: [{ label: 'Pad', midi: { type: 'note', channel: 1, number: 5 }, kind: 'button', layer: 'base', function: { id: 'play', deck: 1 } }] };
    window.__mp.rows.push({ id: '00000000-0000-4000-8000-999999999999', assetId: null, profileId: null, name: 'From the future', model, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
  });
  await dp.click('.rail-item[data-screen="mapper"]');
  await dp.waitForFunction(() => document.querySelector('#mp-saved option[value="00000000-0000-4000-8000-999999999999"]'));
  await dp.selectOption('#mp-saved', '00000000-0000-4000-8000-999999999999');
  await dp.click('#mp-open-saved');
  await dp.waitForSelector('#mp-status [data-tone="warn"]');
  const savesBefore = await dp.evaluate(() => window.__mp.calls.filter(c => c === 'mapper_model_save').length);
  check('mapper (desktop): regression: a read-only (newer) mapping disables Save mapping, name and decks', (await dp.locator('#mp-save-model').isDisabled()) && (await dp.locator('#mp-name').isDisabled()) && (await dp.locator('#mp-decks').isDisabled()));
  await dp.evaluate(() => { const b = document.querySelector('#mp-save-model'); b.disabled = false; b.click(); });
  await dp.waitForTimeout(400);
  const future = await dp.evaluate(() => window.__mp.rows.find(r => r.id === '00000000-0000-4000-8000-999999999999'));
  check('mapper (desktop): regression: Save mapping never overwrites a newer-version row', (await dp.evaluate(() => window.__mp.calls.filter(c => c === 'mapper_model_save').length)) === savesBefore && future.model.version === 2 && future.model.futureField === 'keep me', JSON.stringify(future.model).slice(0, 80));
  await dctx.close();

  // ----- desktop: Learn races (slow MIDI input open, pending name edit) -----
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' });
  await rctx.addInitScript(tauriMock);
  await rctx.addInitScript(mapperMock, learned);
  await rctx.addInitScript(FLAG_ON);
  const rp = await rctx.newPage();
  errors.push(...watchConsole(rp, 'mapper-learn-races'));
  await rp.goto(base);
  await rp.waitForSelector('.rail-item[data-screen="mapper"]');
  await rp.click('.rail-item[data-screen="mapper"]');
  await rp.waitForFunction(() => document.querySelector('#mp-device option[value="asset-pioneer-dj-ddj-flx4"]'));
  await rp.selectOption('#mp-device', 'asset-pioneer-dj-ddj-flx4');
  await rp.click('#mp-load-device');
  await rp.waitForSelector('#mp-rows tr');
  await rp.waitForFunction(() => !document.querySelector('#mp-learn')?.disabled && document.querySelector('#mp-port option')?.value);
  await rp.evaluate(() => { window.__mp.slowOpen = 400; });
  await rp.click('#mp-learn');
  await rp.waitForFunction(() => window.__mp.midi.includes('midi_open_input'));
  await rp.keyboard.press('Escape');
  await rp.waitForTimeout(900);
  const race = await rp.evaluate(() => ({ pressed: document.querySelector('#mp-learn').getAttribute('aria-pressed'), status: document.querySelector('#mp-status').textContent, midi: window.__mp.midi.join() }));
  check('mapper (desktop): regression: Esc while Learn is still opening the input cancels it and closes the input', race.pressed === 'false' && /cancelled/i.test(race.status) && !/Listening/.test(race.status) && race.midi === 'midi_open_input,midi_close_input', JSON.stringify(race));
  await rp.evaluate(() => { window.__mp.slowOpen = 0; });
  await rp.locator('#mp-rows tr').first().click();
  await rp.click('#mp-learn');
  await rp.waitForSelector('#mp-learn[aria-pressed="true"]');
  await rp.fill('#mp-label', 'Typed before learn');
  await rp.evaluate(() => window.__emitMidi([0x9f, 0x7e, 0x7f]));
  await soft(rp.waitForFunction(() => document.querySelectorAll('#mp-rows tr').length === 17, null, { timeout: 3000 }));
  const learnedRows = await rp.evaluate(() => [...document.querySelectorAll('#mp-rows tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')));
  check('mapper (desktop): regression: a name typed just before a control is learned is kept', learnedRows.length === 17 && /Typed before learn/.test(learnedRows[0]) && learnedRows.some(t => /Note 126 · ch 16/.test(t)), learnedRows.slice(0, 2).join(' | '));
  await rctx.close();
  return errors;
}
