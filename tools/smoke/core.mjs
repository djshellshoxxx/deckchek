// Core UI smoke flows (browser mode + mocked Tauri desktop mode).
// Loaded by tools/ui-smoke.mjs; other flows live in sibling tools/smoke/*.mjs
// and may import the shared helpers exported here (tauriMock, watchConsole, a11yAudit, shot).
// Contract for every smoke module: `export default async function run(ctx)`
// returning an array of console-error strings; ctx = { browser, base, tmp, check, SHOTS, ROOT }.

import fs from 'node:fs';
import path from 'node:path';
import { encodeWav16, generateSine } from '../../app/advanced.js';
import { loopbackStimulus } from '../../app/calibration.js';

let check = () => {};
let ROOT = '';
let SHOTS = '';

function writeToneWav(dir, { hz = 1000, seconds = 4, rate = 48000, amp = .35, name = 'tone-1k.wav' } = {}) {
  const tone = generateSine({ frequencyHz: hz, sampleRate: rate, durationSec: seconds, amplitude: amp });
  const file = path.join(dir, name);
  fs.writeFileSync(file, encodeWav16({ left: tone, right: tone, sampleRate: rate }));
  return file;
}

function writeLoopbackWav(dir) {
  const s = loopbackStimulus({ sampleRate: 48000, durationSec: 2, levelDbfs: -20 });
  const file = path.join(dir, 'loopback.wav');
  fs.writeFileSync(file, encodeWav16({ left: s.left, right: s.right, sampleRate: 48000 }));
  return file;
}

function writeDvsWav(dir) {
  const rate = 48000, n = rate * 4, l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { const ph = 2 * Math.PI * 1000 * i / rate; l[i] = .4 * Math.sin(ph); r[i] = .4 * Math.cos(ph); }
  const file = path.join(dir, 'dvs-quadrature.wav');
  fs.writeFileSync(file, encodeWav16({ left: l, right: r, sampleRate: rate }));
  return file;
}

function writeVinylWav(dir) {
  const rate = 48000, n = rate * 8, x = new Float32Array(n);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - .5;
  for (let i = 0; i < n; i++) x[i] = .02 * rnd() + .1 * Math.sin(2 * Math.PI * 440 * i / rate);
  for (const t of [.9, 1.8, 3.2, 4.4, 6.1, 7.3]) { const s = Math.floor(t * rate); for (let k = 0; k < 40; k++) x[s + k] += (k % 2 ? -.8 : .8) * Math.exp(-k / 8); }
  const file = path.join(dir, 'vinyl-clicks.wav');
  fs.writeFileSync(file, encodeWav16({ left: x, right: x, sampleRate: rate }));
  return file;
}

export function watchConsole(page, label) {
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`${label}: ${msg.text()}`); });
  page.on('pageerror', err => errors.push(`${label}: ${err.message}`));
  return errors;
}

// Visible buttons/inputs without an accessible name, and targets below 24px.
export async function a11yAudit(page) {
  return page.evaluate(() => {
    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const name = el => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent || el.labels?.[0]?.textContent || el.textContent || el.getAttribute('title') || '').trim();
    const ctrls = [...document.querySelectorAll('button, input:not([type=hidden]), select, textarea, [role=tab], [role=radio]')].filter(visible).filter(el => !el.closest('[inert]') && !el.closest('dialog:not([open])'));
    const unnamed = ctrls.filter(el => !name(el) && !(el.type === 'file')).map(el => el.outerHTML.slice(0, 80));
    const small = ctrls.filter(el => el.type !== 'file' && !el.classList.contains('drop-input')).filter(el => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).map(el => el.outerHTML.slice(0, 80));
    return { unnamed, small };
  });
}

const NAV = ['quick', 'speed', 'cartridge', 'dvs', 'vinyl', 'calibration', 'system', 'devices', 'equipment', 'history'];
const DEVICE_SHOTS = process.env.DEVICE_SHOTS_DIR || '';

/**
 * Resize the viewport and wait until the app has reacted. The shell re-lays out (docks/undocks the inspector) from its
 * `resize` listener, which runs in the next rendering frame, not when setViewportSize resolves. Measuring straight
 * away saw the old, wider layout (scrollWidth 469 at a 420 px window) in about half the runs. Two animation frames
 * come after the resize event of that frame, so awaiting them makes the measurement deterministic.
 */
export async function setViewport(page, size) {
  await page.setViewportSize(size);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
export async function shot(page, name) { await page.waitForTimeout(150); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); }

async function browserMode(browser, base, wav, wav3k, extra) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors = watchConsole(page, 'browser');
  await page.goto(base);
  await page.waitForSelector('.rail-item');
  check('rail has 12 nav items (default flags: 11 shipped screens plus Test media)', (await page.locator('.rail-item').count()) === 12);
  check('dark theme by default', (await page.getAttribute('html', 'data-theme')) === 'dark');
  check('help button wired by ui-assistance', (await page.locator('#cdlOptionsBtn').count()) === 1);

  for (const id of NAV) {
    await page.click(`.rail-item[data-screen="${id}"]`);
    await page.waitForSelector(`#screen-${id}:not([hidden]) h1`);
    check(`navigate: ${id}`, await page.locator(`#screen-${id}`).isVisible());
    const audit = await a11yAudit(page);
    check(`a11y names + target sizes: ${id}`, !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
    await shot(page, `${id}-dark`);
  }

  await page.click('.rail-item[data-screen="system"]');
  await page.waitForSelector('#sys-unsupported');
  check('System Health shows unsupported state without Tauri', /Windows desktop app/.test(await page.locator('#sys-unsupported').innerText()));
  check('System Health: Run full scan disabled when unsupported', await page.locator('#sys-run').isDisabled());
  check('Devices nav sits between System and Equipment', await page.evaluate(() => [...document.querySelectorAll('.rail-item')].map(b => b.dataset.screen).join(',').includes('calibration,system,devices,equipment,history')));
  await page.keyboard.press('Control+7');
  check('Ctrl+7 opens System Health', await page.locator('#screen-system').isVisible());
  await page.keyboard.press('Control+8');
  check('Ctrl+8 navigates to Devices', await page.locator('#screen-devices').isVisible());
  await page.keyboard.press('Control+9');
  check('Ctrl+9 navigates to Equipment', await page.locator('#screen-equipment').isVisible());
  await page.keyboard.press('Control+0');
  check('Ctrl+0 navigates to History', await page.locator('#screen-history').isVisible());
  check('Devices rail tooltip shows Ctrl+8', (await page.getAttribute('.rail-item[data-screen="devices"]', 'data-tooltip')) === 'Devices (Ctrl+8)');
  const helpHtml = await page.locator('#helpDialog').innerHTML();
  check('shortcuts help lists Ctrl+1â€¦9 and 0', helpHtml.includes('<kbd>9</kbd>') && helpHtml.includes('<kbd>0</kbd>') && /8 Devices/.test(helpHtml));

  // Quick Check with a generated 1 kHz WAV
  await page.click('.rail-item[data-screen="quick"]');
  check('live capture shows desktop-only state in browser', (await page.locator('#screen-quick .source[data-source="live"][aria-disabled="true"]').count()) === 1);
  await page.setInputFiles('#quick-file', wav);
  await page.click('#quick-analyze');
  await page.waitForSelector('#screen-quick .verdict', { timeout: 20000 });
  const chipText = await page.locator('#screen-quick .verdict .chip').first().innerText();
  check('Quick Check renders a verdict', /PASS|REVIEW|WARNING|FAIL/.test(chipText), chipText);
  check('readouts show uncertainty', (await page.locator('#screen-quick .readout-unc').first().innerText()).includes('Â±'));
  check('uncalibrated badge visible', (await page.locator('#screen-quick .badge-uncal').count()) > 0);
  await shot(page, 'quick-results-dark');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => /baseline/i.test(document.getElementById('toasts').innerText), null, { timeout: 5000 }).catch(() => {});
  check('Ctrl+S confirms save as baseline (toast)', /baseline/i.test(await page.locator('#toasts').innerText()));
  check('Ctrl+S stored baseline flag', await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.workspace.v1') || '{}').runs?.some(r => r.baseline) ?? false));
  check('shortcuts help lists Ctrl+S', (await page.locator('#helpDialog').innerHTML()).includes('<kbd>S</kbd>'));
  const ra = await a11yAudit(page);
  check('a11y names + target sizes: results', !ra.unnamed.length && !ra.small.length, [...ra.unnamed, ...ra.small].slice(0, 3).join(' | '));
  check('results announced via live region', (await page.locator('#sr-polite').innerText()).length > 0);
  await page.locator('#screen-quick .readout').first().click();
  check('readout opens inspector details', (await page.locator('#inspector-body .inspect-value').count()) === 1);
  await shot(page, 'quick-inspector-dark');

  // Speed & pitch
  await page.keyboard.press('Control+2');
  await page.waitForSelector('#screen-speed:not([hidden])');
  check('Ctrl+2 navigates to Speed & Pitch', await page.locator('#screen-speed').isVisible());
  await page.setInputFiles('#speed-file', wav3k);
  await page.fill('#screen-speed [data-param="referenceHz"]', '3150');
  await page.click('#speed-analyze');
  await page.waitForSelector('#screen-speed .verdict', { timeout: 30000 });
  const rpmText = await page.locator('#screen-speed .readout').nth(1).innerText();
  check('Speed result shows RPM readout', /RPM/.test(rpmText), rpmText.replace(/\s+/g, ' ').slice(0, 60));
  await shot(page, 'speed-results-dark');

  // DVS with a quadrature control tone
  await page.click('.rail-item[data-screen="dvs"]');
  await page.setInputFiles('#dvs-file', extra.dvs);
  await page.click('#dvs-analyze');
  await page.waitForSelector('#screen-dvs .verdict', { timeout: 30000 });
  check('DVS result renders timecode scope', (await page.locator('#screen-dvs .scope-wrap svg').count()) === 1);
  await shot(page, 'dvs-results-dark');

  // Vinyl scan twice -> repeat-scan comparison + saveScanAlignment
  await page.click('.rail-item[data-screen="vinyl"]');
  await page.fill('#screen-vinyl [data-param="recordTitle"]', 'Test Pressing');
  for (let i = 0; i < 2; i++) {
    if (i) await page.click('#screen-vinyl .action-bar button:has-text("New test")');
    await page.setInputFiles('#vinyl-file', extra.vinyl);
    await page.click('#vinyl-analyze');
    await page.waitForSelector('#screen-vinyl .step-results:not([hidden]) .verdict', { timeout: 30000 });
  }
  check('repeat scan adds persistent-event readings', (await page.locator('#screen-vinyl [data-metric="repeat_scan_persistent_events"]').count()) >= 1);
  const alignments = await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.catalog.v1') || '{}').alignments?.length || 0);
  check('saveScanAlignment stored an alignment', alignments === 1, `${alignments}`);
  await shot(page, 'vinyl-results-dark');

  // Calibration from an imported (digital) loopback recording
  await page.click('.rail-item[data-screen="calibration"]');
  check('output selector hidden when no output devices are listed', await page.locator('#cal-out-field').isHidden());
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#cal-import')]);
  await chooser.setFiles(extra.loopback);
  await page.waitForSelector('#cal-profile .verdict');
  check('loopback import yields a valid profile', /VALID|USABLE/.test(await page.locator('#cal-profile .verdict .chip').innerText()));
  await page.click('#cal-profile .action-bar .btn-primary');
  await page.waitForFunction(() => document.querySelector('#cal-chip')?.textContent.includes('Calibrated'));
  check('top-bar chip shows Calibrated after saving', true);
  await shot(page, 'calibration-profile-dark');
  await page.click('.rail-item[data-screen="quick"]');
  await page.click('#screen-quick .action-bar button:has-text("New test")');
  await page.setInputFiles('#quick-file', wav);
  await page.click('#quick-analyze');
  await page.waitForSelector('#screen-quick .step-results:not([hidden]) .badge-cal');
  check('results use the calibration profile (CAL badge)', (await page.locator('#screen-quick .verdict .badge-cal').count()) === 1);

  // Equipment CRUD
  await page.click('.rail-item[data-screen="equipment"]');
  await page.click('#eq-add');
  await page.fill('#eq-f-nickname', 'Deck 1 â€” SL-1200MK7');
  await page.fill('#eq-f-serialNumber', 'GE7AB001');
  await page.click('#eq-editor button[type="submit"]');
  await page.waitForSelector('#eq-rows .record-main');
  check('equipment asset created (alongside the device-library units)', (await page.locator('#eq-rows .record-main', { hasText: 'Deck 1' }).count()) === 1);
  const assetCount = await page.locator('#eq-rows .record-main').count();
  await shot(page, 'equipment-edit-dark');
  await page.locator('#eq-rows .btn-danger-ghost').first().click();
  await page.waitForSelector('#confirm-dialog[open]');
  check('delete asks for confirmation (focus on Cancel)', await page.evaluate(() => document.activeElement?.id === 'confirm-cancel'));
  await page.keyboard.press('Escape');
  check('Esc closes confirm without deleting', (await page.locator('#eq-rows .record-main').count()) === assetCount);

  // History
  await page.click('.rail-item[data-screen="history"]');
  await page.waitForSelector('#hist-rows .run-main');
  check('history lists saved runs', (await page.locator('#hist-rows .run-main').count()) >= 4);
  await page.locator('#hist-rows .run-main').first().click();
  await page.waitForSelector('#hist-detail .verdict');
  const checks = page.locator('#hist-rows .run-check');
  await checks.nth(0).check(); await checks.nth(1).check();
  await page.click('#compare-bar .btn-primary');
  await page.waitForSelector('#hist-detail .compare');
  check('A/B compare renders', (await page.locator('#hist-detail .compare table').count()) === 1);
  await shot(page, 'history-compare-dark');

  await devicesBrowser(page, wav, extra);

  // Theme toggle + light screenshots
  await page.click('#theme-toggle');
  check('theme toggles to light', (await page.getAttribute('html', 'data-theme')) === 'light');
  await page.click('.rail-item[data-screen="history"]');
  await shot(page, 'history-light');
  await page.click('.rail-item[data-screen="quick"]');
  await shot(page, 'quick-results-light');
  await page.click('.rail-item[data-screen="equipment"]');
  await shot(page, 'equipment-light');
  await page.reload();
  await page.waitForSelector('.rail-item');
  check('theme persists across reload', (await page.getAttribute('html', 'data-theme')) === 'light');
  await page.click('#theme-toggle');

  // Help dialog + inspector shortcut
  await page.keyboard.press('Shift+Slash');
  check('? opens help dialog', await page.locator('#helpDialog[open]').count() === 1);
  await shot(page, 'help-dark');
  await page.keyboard.press('Escape');

  // Narrow window (min 900px)
  await setViewport(page, { width: 900, height: 700 });
  await page.click('.rail-item[data-screen="quick"]');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal scroll at 900px', overflow <= 0, `overflow ${overflow}px`);
  await shot(page, 'quick-900-dark');
  await page.keyboard.press('i');
  check('I opens inspector as overlay drawer at 900px', await page.locator('#inspector.overlay.open').count() === 1);
  check('drawer moves focus to close button', await page.evaluate(() => document.activeElement?.id === 'inspector-close'));
  await shot(page, 'inspector-drawer-900-dark');
  await page.keyboard.press('Escape');
  check('Esc closes drawer and restores focus', await page.locator('#inspector.open').count() === 0);

  await context.close();
  return errors;
}

let PROFILE_IDS = [];
async function deviceShot(page, name) { await page.evaluate(() => { document.activeElement?.blur(); document.getElementById('toasts')?.replaceChildren(); }); await shot(page, name); if (DEVICE_SHOTS) { fs.mkdirSync(DEVICE_SHOTS, { recursive: true }); fs.copyFileSync(path.join(SHOTS, `${name}.png`), path.join(DEVICE_SHOTS, `${name}.png`)); } }
const openDevice = async (page, id) => {
  await page.click('.rail-item[data-screen="devices"]');
  if (await page.locator('#dev-back').count()) await page.click('#dev-back');
  if (await page.locator('#dev-run-back').count()) { await page.click('#dev-run-back'); await page.click('#dev-back'); }
  await page.click(`.dev-card[data-device="${id}"] .dev-card-main`);
  await page.waitForSelector('#dev-plan .dev-test');
};

// Device library in browser mode (localStorage store): grid, every device page, checklist + guided workflow tests.
async function devicesBrowser(page, wav, extra) {
  await page.click('.rail-item[data-screen="devices"]');
  await page.waitForSelector('.dev-card');
  check('Devices: one card per profile', (await page.locator('.dev-card').count()) === PROFILE_IDS.length, `${await page.locator('.dev-card').count()}`);
  check('Devices: unverified-spec badges shown', (await page.locator('.dev-card .badge-unverified').count()) >= 8);
  check('Devices: cards show category, test count and images', (await page.locator('.dev-card .dev-cat').count()) === PROFILE_IDS.length && (await page.locator('.dev-card .dev-count').count()) === PROFILE_IDS.length && (await page.locator('.dev-card .dev-thumb img, .dev-card .dev-thumb > svg').count()) === PROFILE_IDS.length);
  await page.locator('.dev-thumb img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
  const devImagesLoaded = () => [...document.querySelectorAll('.dev-thumb img')].every(i => i.complete && i.naturalWidth > 0);
  await page.waitForFunction(devImagesLoaded, null, { timeout: 10000 }).catch(() => {}); // images decode asynchronously
  const imgsOk = await page.evaluate(devImagesLoaded);
  check('Devices: card images load under CSP', imgsOk);
  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.catalog.v1') || '{}'));
  check('Devices: first run synced profiles and created one "My <model>" asset each', Object.keys(store.deviceProfiles || {}).length === PROFILE_IDS.length && (store.catalog?.asset || []).filter(a => /^My /.test(a.nickname)).length === PROFILE_IDS.length);
  check('Devices: product specs carry provenance', (store.productSpecs || []).some(x => x.provenanceType === 'research-unverified') && (store.productSpecs || []).some(x => x.provenanceType === 'manufacturer-doc'));
  await page.fill('#dev-search', 'technics');
  check('Devices: search filters the grid', (await page.locator('.dev-card').count()) === 1);
  await page.fill('#dev-search', '');
  const audit = await a11yAudit(page);
  check('Devices: a11y names + target sizes (grid)', !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
  await deviceShot(page, 'devices-library-dark');

  for (const id of PROFILE_IDS) {
    await openDevice(page, id);
    const tests = await page.locator('#dev-plan .dev-test').count();
    const runnable = await page.locator('#dev-plan button[data-run-test]:not([disabled])').count();
    const specs = await page.locator('#dev-specs tr[data-spec]').count();
    check(`Devices: ${id} detail renders plan, specs and docs`, tests > 0 && runnable === tests && specs > 0 && (await page.locator('#dev-docs').innerText()).length > 10, `${tests} tests, ${runnable} runnable, ${specs} specs`);
  }
  await openDevice(page, 'pioneer-djm-a9');
  check('Devices: DJM-A9 identity note shown prominently', /No ambiguity on the model/.test(await page.locator('.dev-identity').innerText()));
  check('Devices: MIDI learn-mode explanation', (await page.locator('#dev-midi .dev-learn-explain').count()) === 1);
  check('Devices: spec table marks unverified specs', (await page.locator('#dev-specs .chip-warn').count()) >= 3);
  const da = await a11yAudit(page);
  check('Devices: a11y names + target sizes (detail)', !da.unnamed.length && !da.small.length, [...da.unnamed, ...da.small].slice(0, 3).join(' | '));
  await page.evaluate(() => { document.getElementById('main').scrollTop = 0; });
  await deviceShot(page, 'device-detail-dark');
  await page.locator('#dev-plan .dev-test[data-test="djma9-midi-coverage"] .dev-test-main').click();
  check('Devices: test details open in the inspector', /Pass criterion/.test(await page.locator('#inspector-body').innerText()));
  await shot(page, 'device-test-inspector-dark');
  await openDevice(page, 'technics-sl-1200mk4');
  check('Devices: Technics identity note (SL-1200MK4 assumed)', /SL-1200MK4/.test(await page.locator('.dev-identity').innerText()));
  await openDevice(page, 'allen-heath-xone-23');
  check('Devices: Xone:23C identity confirmed by owner', /Confirmed by the owner/.test(await page.locator('.dev-identity').innerText()));

  // manual:inspection checklist
  await openDevice(page, 'pioneer-djm-a9');
  await page.click('button[data-run-test="djma9-knobs"]');
  await page.waitForSelector('.dev-checklist');
  check('Manual: Save disabled until every item answered', await page.locator('#dev-check-save').isDisabled());
  const items = page.locator('.dev-check-item');
  await items.nth(0).locator('[data-answer="ok"]').click();
  await items.nth(1).locator('[data-answer="problem"]').click();
  await items.nth(2).locator('[data-answer="na"]').click();
  await page.fill('.dev-notes textarea', 'Channel fader feels uneven');
  await page.click('#dev-check-save');
  await page.waitForSelector('#dev-run-result .banner-result');
  check('Manual: a Problem answer saves FAIL', /FAIL/.test(await page.locator('#dev-run-result').innerText()));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.catalog.v1')).deviceResults);
  check('Manual: device_test_result stored with notes and answers', saved.length === 1 && saved[0].status === 'fail' && saved[0].detail.notes === 'Channel fader feels uneven' && saved[0].detail.checklist[1].answer === 'problem');
  await deviceShot(page, 'device-manual-result-dark');
  await page.click('#dev-run-done');
  await page.waitForSelector('#dev-plan .dev-test');
  check('Manual: device page shows the FAIL status and progress', /FAIL/.test(await page.locator('.dev-test[data-test="djma9-knobs"]').innerText()));

  // driver:check without Tauri: desktop-only state, skip records a skipped result
  await page.click('button[data-run-test="djma9-driver"]');
  await page.waitForSelector('#dev-scan-run');
  check('Driver check: browser shows desktop-only state with Run disabled', await page.locator('#dev-scan-run').isDisabled() && /Windows app/.test(await page.locator('#dev-runner').innerText()));
  await page.click('#dev-run-back');

  // quick:Signal health dispatches to the guided workflow, saves a linked result and returns
  await openDevice(page, 'pioneer-djm-a9');
  await page.click('button[data-run-test="djma9-master-out"]');
  await page.waitForSelector('#screen-quick:not([hidden]) #device-test-banner');
  check('Workflow test: Quick Check opens with the device banner', /Running My DJM-A9 Â· Master output signal health/.test(await page.locator('#device-test-banner').innerText()));
  check('Workflow test: profile steps shown in Setup', /Play a test tone in Serato/.test(await page.locator('#screen-quick .card-device').innerText()) && /Master out/.test(await page.locator('#screen-quick .card-device').innerText()));
  await shot(page, 'device-workflow-setup-dark');
  await page.setInputFiles('#quick-file', wav);
  await page.click('#quick-analyze');
  await page.waitForSelector('#screen-quick .step-results:not([hidden]) .verdict', { timeout: 20000 });
  await page.waitForFunction(() => /Saved to the/.test(document.getElementById('device-test-banner')?.innerText || ''), null, { timeout: 5000 }).catch(() => {});
  check('Workflow test: results banner confirms the saved device result', /Saved to the Pioneer DJ DJM-A9 test plan/.test(await page.locator('#device-test-banner').innerText()));
  const wfRes = await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.catalog.v1')).deviceResults.find(r => r.testId === 'djma9-master-out'));
  check('Workflow test: result linked to the saved run (session id)', !!wfRes?.sessionId && wfRes.detail.runId === wfRes.sessionId && wfRes.detail.measurements.length > 3, JSON.stringify(wfRes?.status));
  await page.click('#device-test-back');
  await page.waitForSelector('#screen-devices:not([hidden]) #dev-plan .dev-test');
  check('Workflow test: returns to the device page with a status', !/NOT RUN/.test(await page.locator('.dev-test[data-test="djma9-master-out"] .dev-test-status').innerText()));
  check('Workflow test: banner cleared on the workflow screen', await page.evaluate(() => !document.querySelector('#screen-quick #device-test-banner')));

  // timecode:format-check from a recorded quadrature file (1 kHz = Serato CV02.5 at 33 1/3)
  await openDevice(page, 'serato-control-vinyl-cv025');
  await page.click('button[data-run-test="cv-quadrature"]');
  await page.waitForSelector('#tc-format');
  check('Timecode: format and speed prefilled from params', (await page.inputValue('#tc-format')) === 'Serato CV02.5' && (await page.inputValue('#tc-rpm')) === '33.333333');
  await page.setInputFiles('#tc-file', extra.dvs);
  await page.click('#tc-analyze');
  await page.waitForSelector('#dev-run-result .banner-result', { timeout: 20000 });
  const tcText = await page.locator('#dev-runner').innerText();
  check('Timecode: readouts, scope and plain-English findings', /Carrier frequency/.test(tcText) && /L\/R phase difference/.test(tcText) && (await page.locator('#dev-runner .scope-wrap svg').count()) === 1 && /healthy|What this means/.test(tcText));
  const tcRes = await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.catalog.v1')).deviceResults.find(r => r.testId === 'cv-quadrature'));
  check('Timecode: clean quadrature saves PASS with ~1000 Hz carrier', tcRes?.status === 'pass' && Math.abs(tcRes.detail.measurements.find(m => m.metricId === 'tc_carrier_hz').value - 1000) < 2, `${tcRes?.status}`);
  await shot(page, 'device-timecode-dark');
  await page.click('#dev-run-done');
  await openDevice(page, 'pioneer-djm-a9');

  // report export
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+e')]);
  const report = fs.readFileSync(await dl.path(), 'utf8');
  check('Device report: Ctrl+E exports HTML with statuses and the unverified-spec disclaimer', /deckchek-device-pioneer-dj-djm-a9/.test(dl.suggestedFilename()) && /Unverified specifications/.test(report) && /FAIL/.test(report) && /Knobs, jog dial, buttons/.test(report));

  // light theme screenshots
  await page.click('#theme-toggle');
  await page.evaluate(() => { document.getElementById('main').scrollTop = 0; });
  await shot(page, 'device-detail-light');
  await page.click('#dev-back');
  await page.waitForSelector('.dev-card');
  await shot(page, 'devices-library-light');
  await page.click('#theme-toggle');
}

// Device library in desktop mode (mocked Tauri: device commands, driver scan, MIDI bridge).
async function devicesDesktop(page) {
  await page.click('.rail-item[data-screen="devices"]');
  await page.waitForSelector('.dev-card');
  const db = await page.evaluate(() => ({ profiles: Object.keys(window.__mockDb.deviceProfiles).length, assets: window.__mockDb.catalog.asset.length }));
  check('Desktop devices: device_profiles_sync stored every profile and created assets', db.profiles === PROFILE_IDS.length && db.assets === PROFILE_IDS.length, JSON.stringify(db));

  // driver:check with the mocked system scan
  await openDevice(page, 'pioneer-djm-a9');
  await page.click('button[data-run-test="djma9-driver"]');
  await page.click('#dev-scan-run');
  await page.waitForSelector('#dev-run-result .banner-result');
  check('Driver check: scan evaluated (DJM-A9 not in scan -> Driver not found)', /Driver not found/.test(await page.locator('#dev-runner').innerText()));
  const drv = await page.evaluate(() => window.__mockDb.deviceResults.find(r => r.testId === 'djma9-driver'));
  check('Driver check: device_test_result_save stored FAIL with driver_present = 0', drv?.status === 'fail' && drv.detail.measurements.find(m => m.metricId === 'driver_present')?.value === 0);
  await shot(page, 'device-driver-dark');

  // midi:coverage, learn mode with a mocked MIDI port
  await page.click('#dev-run-back');
  await page.waitForSelector('#dev-plan .dev-test');
  await page.click('button[data-run-test="djma9-midi-coverage"]');
  await page.waitForSelector('#midi-port');
  check('MIDI: port auto-selected from portNamePatterns', (await page.inputValue('#midi-port')) === 'DJM-A9 MIDI 1');
  await page.waitForFunction(() => window.__mockMidi.open.includes('DJM-A9 MIDI 1'));
  check('MIDI: port opened', true);
  await page.evaluate(() => { const e = window.__emitMidi; e([0x90, 11, 127]); e([0x80, 11, 0]); for (let v = 0; v <= 127; v += 8) e([0xB0, 31, v]); e([0x90, 12, 127]); e([0x80, 12, 0]); });
  await page.waitForFunction(() => document.querySelectorAll('.dev-learn-row').length === 3);
  check('MIDI learn: discovered controls listed', (await page.locator('.dev-learn-row').count()) === 3);
  await page.fill('#learn-name-1', 'Play deck 1');
  await page.selectOption('#learn-ctl-2', 'crossfader');
  await page.check('#learn-led-1');
  await page.click('#midi-save-map');
  await page.waitForFunction(() => window.__mockDb.midiMaps && Object.keys(window.__mockDb.midiMaps).length === 1);
  const map = await page.evaluate(() => Object.values(window.__mockDb.midiMaps)[0].map);
  check('MIDI learn: learned map saved to the asset', map.controls.length === 2 && map.controls.some(c => c.id === 'crossfader' && c.message.number === 31) && map.controls.some(c => c.label === 'Play deck 1' && c.led));
  await shot(page, 'device-midi-learn-dark');
  await page.click('#midi-finish');
  await page.waitForSelector('#dev-run-result .banner-result');
  const cov1 = await page.evaluate(() => window.__mockDb.deviceResults.find(r => r.testId === 'djma9-midi-coverage'));
  check('MIDI coverage (learn): result saved as REVIEW with discovered count', cov1?.status === 'unknown' && cov1.detail.discovered === 3);
  // second run uses the learned map
  await page.click('#dev-run-result button:has-text("Run again")');
  await page.waitForSelector('.dev-tile');
  check('MIDI coverage: re-run uses the learned map (tiles)', (await page.locator('.dev-tile').count()) === 2);
  await page.evaluate(() => { const e = window.__emitMidi; e([0x90, 11, 127]); e([0x80, 11, 0]); e([0xB0, 31, 0]); e([0xB0, 31, 127]); });
  await page.waitForFunction(() => document.querySelectorAll('.dev-tile.seen').length === 2);
  await page.click('#midi-finish');
  await page.waitForFunction(() => window.__mockDb.deviceResults.filter(r => r.testId === 'djma9-midi-coverage').length === 2);
  const cov2 = await page.evaluate(() => window.__mockDb.deviceResults.find(r => r.testId === 'djma9-midi-coverage'));
  check('MIDI coverage (mapped): all controls seen -> PASS', cov2.status === 'pass' && cov2.detail.measurements.find(m => m.metricId === 'midi_controls_seen_percent')?.value === 100, cov2.status);
  await shot(page, 'device-midi-coverage-dark');

  // no MIDI device present -> clear empty state
  await page.evaluate(() => { window.__mockMidi.ports = []; });
  await page.click('#dev-run-back');
  await page.waitForSelector('#dev-plan .dev-test');
  await page.click('button[data-run-test="djma9-fader-crossfader"]');
  await page.waitForSelector('#midi-empty');
  check('MIDI: clear state when no MIDI port is present', /No MIDI device found/.test(await page.locator('#midi-empty').innerText()));
  const ma = await a11yAudit(page);
  check('MIDI: a11y names + target sizes', !ma.unnamed.length && !ma.small.length, [...ma.unnamed, ...ma.small].slice(0, 3).join(' | '));
  await page.click('#dev-run-back');
  await page.waitForSelector('#dev-plan .dev-test');
  check('Desktop devices: progress reflects saved results', /FAIL/.test(await page.locator('.dev-test[data-test="djma9-driver"]').innerText()) && /PASS/.test(await page.locator('.dev-test[data-test="djma9-midi-coverage"]').innerText()));
}

// Minimal Tauri mock: catalog/run commands in memory, synthetic live capture.
export function tauriMock() {
  const listeners = {};
  const db = { catalog: { manufacturer: [], product: [], asset: [], setup: [], venue: [] }, runs: [], deviceProfiles: {}, deviceResults: [], midiMaps: {} };
  const midiState = { ports: ['Focusrite USB MIDI', 'DJM-A9 MIDI 1'], open: [], sent: [] };
  let running = false, started = 0, timer = null;
  const sr = 48000;
  const emit = (name, payload) => (listeners[name] || []).forEach(cb => cb({ payload }));
  const tone = n => Array.from({ length: n }, (_, i) => .3 * Math.sin(2 * Math.PI * 1000 * i / sr));
  const handlers = {
    initialize_database: () => '/mock/deckchek.sqlite3',
    list_native_audio_inputs: () => [{ name: 'Focusrite USB (In 1/2)', isDefault: true }, { name: 'Rane SEVENTY-TWO MKII', isDefault: false }],
    start_live_capture: () => {
      if (running) throw 'Capture is already running.';
      running = true; started = Date.now();
      timer = setInterval(() => {
        const t = (Date.now() - started) / 1000, wob = .5 + .5 * Math.sin(t * 3);
        emit('capture-levels', { peakL: .25 + .45 * wob, peakR: .22 + .4 * wob, rmsL: .18 + .2 * wob, rmsR: .16 + .18 * wob, clipL: false, clipR: t > 1 && t < 1.1, elapsedSec: t, overrunSamples: 0 });
      }, 33);
      return { deviceName: 'Focusrite USB (In 1/2)', sampleRate: sr, channels: 2, maxSeconds: 60 };
    },
    stop_live_capture: () => {
      running = false; clearInterval(timer);
      const n = Math.max(sr, Math.floor((Date.now() - started) / 1000 * sr));
      const s = tone(n);
      return { payload: { deviceName: 'Focusrite USB (In 1/2)', sampleRate: sr, channels: 2, left: s, right: s, }ûã~­¢G§²ÚîÆ­yÖ–æF÷w2Ö6÷&Rãc"ã""À¢'v–æF÷w2×fW'6–öâ"À¢'ƒÖFÂ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FòÖÖ7&÷2 §fW'6–öâÒ#ããB §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#VcvVV#fC““SSSCVFcSs“S“CVcf3–3s†FV#&Vc&SsFCsscv&CSƒC’ ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â"ãã’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'F&vWBÖÆW†–6öâ §fW'6–öâÒ#ã"ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#c3Cc#vFCfCS#v##f#Cƒ–F#s“ƒCC3Cs†6Vccfcc3“fF#cv&VFS6#  ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’ §fW'6–öâÒ#"ã"ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&VC“–VS“c“F&FV#ssfC“6SC†3sCFFf3ƒ–V6S&c–#SCC†3ƒ†c&6S’ ¦FWVæFVæ6–W2Ò°¢&ç–†÷r"À¢&'—FW2"À¢&6öö¶–R"À¢&F—'2"À¢&GVæ6R"À¢&VÖ&VE÷Æ—7B"À¢&vWG&æFöÒã2ãB"À¢&vÆö""À¢&wF²"À¢&†V6²ãRã"À¢&‡GG"À¢&–ÖvR"À¢&¦æ’"À¢&Æ–&2"À¢&Æör"À¢&Ö–ÖR"À¢&×VF"À¢&ö&¦3""À¢&ö&¦3"ÖÖ¶—B"À¢&ö&¦3"Öf÷VæFF–öâ"À¢&ö&¦3"×V’Ö¶—B"À¢&ö&¦3"×vV"Ö¶—B"À¢'W&6VçBÖVæ6öF–ær"À¢'Æ—7B"À¢'&r×v–æF÷rÖ†æFÆR"À¢'&WvW7B"À¢'6W&FR"À¢'6W&FUö§6öâ"À¢'6W&FU÷&W""À¢'6W&–Æ—¦R×FòÖ¦f67&—B"À¢'7v–gB×'2"À¢'FW&’Ö'V–ÆB"À¢'FW&’ÖÖ7&÷2"À¢'FW&’×'VçF–ÖR"À¢'FW&’×'VçF–ÖR×w'’"À¢'FW&’×WF–Ç2"À¢'F†—6W'&÷""ãã#"À¢'Fö¶–ò"À¢'G&’Ö–6öâ"À¢'W&Â"À¢'vV&¶—C&wF²"À¢'vV'f–Ws"Ö6öÒ"À¢'v–æF÷r×f–'&æ7’"À¢'v–æF÷w2ãc"ã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’Ö'V–ÆB §fW'6–öâÒ#"ãrã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#S“Sc66V#33fC“vc#vVS“cs&V3†C3fC36&#63–S&3–ccsScƒs#ScS&SCR ¦FWVæFVæ6–W2Ò°¢&ç–†÷r"À¢&6&võ÷FöÖÂ"À¢&F—'2"À¢&vÆö""À¢&†V6²ãRã"À¢&§6öâ×F6‚"À¢'66†VÖ'2ã‚ã#""À¢'6V×fW""À¢'6W&FR"À¢'6W&FUö§6öâ"À¢'FW&’×WF–Ç2"À¢'FW&’×v–ç&W2"À¢'vÆ¶F—""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’Ö6öFVvVâ §fW'6–öâÒ#"ãrã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&SS#6SCc3ƒfV63#ƒ6CvS–cS3363fC3FCCSsC#SSƒ†&S#fF&cCƒ ¦FWVæFVæ6–W2Ò°¢&&6ScBã#"ã"À¢&'&÷FÆ’"À¢&–6ò"À¢&§6öâ×F6‚"À¢'Æ—7B"À¢'ærã‚ã"À¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'6V×fW""À¢'6W&FR"À¢'6W&FUö§6öâ"À¢'6†""À¢'7–â"ãã’"À¢'FW&’×WF–Ç2"À¢'F†—6W'&÷""ãã#"À¢'F–ÖR"À¢'W&Â"À¢'WV–B"À¢'vÆ¶F—""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’ÖÖ7&÷2 §fW'6–öâÒ#"ãrã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#ƒ#–f#C6&#fSCf#s6C33V6Cs&&V#v6C#ƒƒ“–3S“F##3&3ƒVF&&fC“–2 ¦FWVæFVæ6–W2Ò°¢&†V6²ãRã"À¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â"ãã’"À¢'FW&’Ö6öFVvVâ"À¢'FW&’×WF–Ç2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’×ÇVv–â §fW'6–öâÒ#"ãrã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#C6c3F6#6#ƒ3f36F6#vcƒƒ3CV633S3F6&CC3VF3V3fFcV" ¦FWVæFVæ6–W2Ò°¢&ç–†÷r"À¢&vÆö""À¢'Æ—7B"À¢'66†VÖ'2ã‚ã#""À¢'6W&FR"À¢'6W&FUö§6öâ"À¢'FW&’×WF–Ç2"À¢'vÆ¶F—""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’×ÇVv–âÖF–Æör §fW'6–öâÒ#"ã‚ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&Fc–V3“&S3–&FCƒFc#&cf&S“#3S3–C3FSC3CVcsffScS†F6Fcs#v6b ¦FWVæFVæ6–W2Ò°¢&Æör"À¢'&r×v–æF÷rÖ†æFÆR"À¢'&fB"À¢'6W&FR"À¢'6W&FUö§6öâ"À¢'FW&’"À¢'FW&’×ÇVv–â"À¢'FW&’×ÇVv–âÖg2"À¢'F†—6W'&÷""ãã#"À¢'W&Â"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’×ÇVv–âÖg2 §fW'6–öâÒ#"ãbã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#CcfV#3#CcffSS##cs#†#cƒc&c–fcF–cvScƒ“CscSFS6“fCv3S&" ¦FWVæFVæ6–W2Ò°¢&ç–†÷r"À¢&GVæ6R"À¢&vÆö""À¢&Æör"À¢&ö&¦3"Öf÷VæFF–öâ"À¢'W&6VçBÖVæ6öF–ær"À¢'66†VÖ'2ã‚ã#""À¢'6W&FR"À¢'6W&FUö§6öâ"À¢'6W&FU÷&W""À¢'FW&’"À¢'FW&’×ÇVv–â"À¢'FW&’×WF–Ç2"À¢'F†—6W'&÷""ãã#"À¢'FöÖÂããb·7V2Óãã"À¢'W&Â"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’×ÇVv–âÖæ÷F–f–6F–öâ §fW'6–öâÒ#"ãbã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#†6c666S6VC“&#6†vcC3FSVFCVC3F3C#&F#C6fcc6&Sƒ“VSsv&B ¦FWVæFVæ6–W2Ò°¢&Æör"À¢&æ÷F–g’×'W7B"À¢'&æB"À¢'6W&FR"À¢'6W&FUö§6öâ"À¢'6W&FU÷&W""À¢'FW&’"À¢'FW&’×ÇVv–â"À¢'F†—6W'&÷""ãã#"À¢'F–ÖR"À¢'W&Â"À¢'¦'W2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’×ÇVv–âÖ÷VæW" §fW'6–öâÒ#"ãrã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&C3“CF##Ss#“#vSC6VC3v6##c3vcsS†C#&Ss–3“fVSfVcCC&#fF#33CR ¦FWVæFVæ6–W2Ò°¢&GVæ6R"À¢&vÆö""À¢&ö&¦3"ÖÖ¶—B"À¢&ö&¦3"Öf÷VæFF–öâ"À¢&÷Vâ"À¢'66†VÖ'2ã‚ã#""À¢'6W&FR"À¢'6W&FUö§6öâ"À¢'FW&’"À¢'FW&’×ÇVv–â"À¢'F†—6W'&÷""ãã#"À¢'W&Â"À¢'v–æF÷w2ãc"ã""À¢'¦'W2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’×'VçF–ÖR §fW'6–öâÒ#"ã"ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&3&Sv&–#†3†#vf3C3V#SfSƒ†FVCvc–c#CFf36FFfVS3ƒc3&VSC2 ¦FWVæFVæ6–W2Ò°¢&6öö¶–R"À¢&G’"À¢&wF²"À¢&‡GG"À¢&¦æ’"À¢&ö&¦3""À¢&ö&¦3"×V’Ö¶—B"À¢&ö&¦3"×vV"Ö¶—B"À¢'&r×v–æF÷rÖ†æFÆR"À¢'6W&FR"À¢'6W&FUö§6öâ"À¢'FW&’×WF–Ç2"À¢'F†—6W'&÷""ãã#"À¢'W&Â"À¢'vV&¶—C&wF²"À¢'vV'f–Ws"Ö6öÒ"À¢'v–æF÷w2ãc"ã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’×'VçF–ÖR×w'’ §fW'6–öâÒ#"ã"ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#vc–SvS3–cƒS3ss66f&#fFcFF3“#CS†f##&3“#3s#c“ccƒCc3F#SvC#" ¦FWVæFVæ6–W2Ò°¢&wF²"À¢&‡GG"À¢&¦æ’"À¢&Æör"À¢&ö&¦3""À¢&ö&¦3"ÖÖ¶—B"À¢&öæ6Uö6VÆÂ"À¢'W&6VçBÖVæ6öF–ær"À¢'&r×v–æF÷rÖ†æFÆR"À¢'6ögF'VffW""À¢'Fò"À¢'FW&’×'VçF–ÖR"À¢'FW&’×WF–Ç2"À¢'W&Â"À¢'vV&¶—C&wF²"À¢'vV'f–Ws"Ö6öÒ"À¢'v–æF÷w2ãc"ã""À¢'w'’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’×WF–Ç2 §fW'6–öâÒ#"ãã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#&fcSVcCƒC6#–6cc#Fcc3v3“FFc#cssV#†CcfScFv3–Sƒc#VR ¦FWVæFVæ6–W2Ò°¢&ç–†÷r"À¢&'&÷FÆ’"À¢&6&võöÖWFFF"À¢&7F÷""À¢&FöÕ÷VW'’"À¢&GVæ6R"À¢&vÆö""À¢&‡GG"À¢&–æfW""À¢&§6öâ×F6‚"À¢&Æör"À¢&ÖVÖ6‡""À¢'†b"À¢'Æ—7B"À¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'&VvW‚"À¢'66†VÖ'2ã‚ã#""À¢'6V×fW""À¢'6W&FR"À¢'6W&FR×VçFvvVB"À¢'6W&FUö§6öâ"À¢'6W&FU÷v—F‚"À¢'7v–gB×'2"À¢'F†—6W'&÷""ãã#"À¢'FöÖÂããb·7V2Óãã"À¢'W&Â"À¢'W&ÇGFW&â"À¢'WV–B"À¢'vÆ¶F—""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’×v–ç&W2 §fW'6–öâÒ#ã2ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&63cVCCV3cƒƒS†&fSC#FC#–Sƒ3F#VCVF&V6c†v†f6cFCS3&3v#cc–CF#b ¦FWVæFVæ6–W2Ò°¢&GVæ6R"À¢&VÖ&VB×&W6÷W&6R"À¢'FöÖÂããb·7V2Óãã"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FW&’×v–ç'BÖæ÷F–f–6F–öâ §fW'6–öâÒ#ã‚ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&c3vf33SFfC#†f3–S3#&VC–&CCvS3“S“SsfFC#†3–CS†V6cƒƒ†66S3v66#3b ¦FWVæFVæ6–W2Ò°¢'F†—6W'&÷""ãã#"À¢'v–æF÷w2ãc"ã""À¢'v–æF÷w2×fW'6–öâ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FV×f–ÆR §fW'6–öâÒ#2ã#rã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#3#C“vS–F3v#3ƒS3&Vf6FV&VVcƒs“sv–cs“C#“fFc#CFcfcc–S–&3ƒSsF&B ¦FWVæFVæ6–W2Ò°¢&f7G&æB"À¢&vWG&æFöÒãBã2"À¢&öæ6Uö6VÆÂ"À¢''W7F—‚"À¢'v–æF÷w2×7—2ãcã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FVæG&–Â §fW'6–öâÒ#ãRã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#VfVCSCs–3V#6S6C–&#36VFcV6VfCSss&FF6#3ƒ&SCSf3ƒv#‚ ¦FWVæFVæ6–W2Ò°¢&æWuöFV'Vu÷Vç&V6†&ÆR"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'F†—6W'&÷" §fW'6–öâÒ#ããc’ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&#fcS33–#Ss†VƒV#SSƒfV##S6S†S†6f6Ffc–Cc3–V3#“F&3“#6cS" ¦FWVæFVæ6–W2Ò°¢'F†—6W'&÷"Ö–×Âããc’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'F†—6W'&÷" §fW'6–öâÒ#"ãã# §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#–SS&6#ƒf3f6VFSV6#&cƒ“ƒƒ3v#6SF3fSVSS–fSvfCƒV3#6f#Sc#Cƒ–R ¦FWVæFVæ6–W2Ò°¢'F†—6W'&÷"Ö–×Â"ãã#"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'F†—6W'&÷"Ö–×Â §fW'6–öâÒ#ããc’ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#FfVSf3FVf3“S–ScƒSfCC&3c†cscSƒ†36CsF6#ƒ6##C&&#f3sSF3 ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â"ãã’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'F†—6W'&÷"Ö–×Â §fW'6–öâÒ#"ãã# §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&fSS“s“#3#ƒvF##Sƒ#Vc&3ƒV3c&cvc&3ƒ“&FS“v#†33Sfc–Vf#F##ƒS#B ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â2ããb"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'F–ÖR §fW'6–öâÒ#ã2ãSR §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&6F#ƒv#“VV3SFFfCCƒfC##vv#&66&FF“c63fs#vfFf3C33FcvC3B ¦FWVæFVæ6–W2Ò°¢&FW&ævVB"À¢&çVÒÖ6öçb"À¢'÷vW&f×B"À¢'6W&FUö6÷&R"À¢'F–ÖRÖ6÷&R"À¢'F–ÖRÖÖ7&÷2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'F–ÖRÖ6÷&R §fW'6–öâÒ#ãã’ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#–S3“csc–C“–3ƒ†VSFSs#ƒcVFVcƒ&c†S3S†fc3#36#v3vC3VSƒ’  ¥µ·6¶vUÕÐ¦æÖRÒ'F–ÖRÖÖ7&÷2 §fW'6–öâÒ#ã"ã3" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#vScƒ“3C&C†C&V“#v3ƒvVS6&cƒS“CƒSF&c“CS“3#ƒƒC†CcƒCcc†VCƒR ¦FWVæFVæ6–W2Ò°¢&çVÒÖ6öçb"À¢'F–ÖRÖ6÷&R"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'F–ç—7G" §fW'6–öâÒ#ã‚ãB §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&#S#v3“CS“#–3#“ƒfc6F6cc6VsFC3cƒsSF6S3sCFcS–63“scvccC2 ¦FWVæFVæ6–W2Ò°¢&F—7Æ–Fö2"À¢'¦W&÷fV2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'F–ç—fV2 §fW'6–öâÒ#ã2ã2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&fC663Fcc“&VfCf3ƒc†cƒC†cS6fSCCCc3FƒCVc“f3#†#“vC3Vcfcs–cVR  ¥µ·6¶vUÕÐ¦æÖRÒ'Fö¶–ò §fW'6–öâÒ#ãS2ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&S“Vc“f63vc#S†#3cf#63sfS“ƒ3†S&f#FCƒ†#sSc&3#†cSCCCB ¦FWVæFVæ6–W2Ò°¢&'—FW2"À¢&Æ–&2"À¢&Ö–ò"À¢'–â×&ö¦V7BÖÆ—FR"À¢'6ö6¶WC""À¢'v–æF÷w2×7—2ãcã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'Fö¶–ò×WF–Â §fW'6–öâÒ#ãrã’ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#C“CƒVC–&cS&#SSCƒcS“ƒSƒ#3†c63–fcc3ƒ3c3“sS“fFs3“Sc3c&3S" ¦FWVæFVæ6–W2Ò°¢&'—FW2"À¢&gWGW&W2Ö6÷&R"À¢&gWGW&W2×6–æ²"À¢'–â×&ö¦V7BÖÆ—FR"À¢'Fö¶–ò"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FöÖÂ §fW'6–öâÒ#ã‚ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#ƒVC†#Ff&#3V6c3“–c3CFCƒCƒC#–3ƒ†csVc†ccƒ#3FSVCC†C“VCC6S6B ¦FWVæFVæ6–W2Ò°¢'6W&FR"À¢'6W&FU÷7ææVBãbã’"À¢'FöÖÅöFFWF–ÖRãbã2"À¢'FöÖÅöVF—Bã#ã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FöÖÂ §fW'6–öâÒ#ããb·7V2Óãã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#“#c#SC6c“#sF&3SCS“sFSF3“fC&&cV6#F#sSccvc3vCf ¦FWVæFVæ6–W2Ò°¢&–æFW†Ö"ãBã""À¢'6W&FUö6÷&R"À¢'6W&FU÷7ææVBãã"À¢'FöÖÅöFFWF–ÖRãã·7V2Óãã"À¢'FöÖÅ÷'6W""À¢'FöÖÅ÷w&—FW""À¢'v–ææ÷rããB"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FöÖÅöFFWF–ÖR §fW'6–öâÒ#ãbã2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#v6Fs6S&c3“v##c&CfFfF6Vc†fSFCFSssC†Cccƒ#&C6&fVV#fC6SVSF" ¦FWVæFVæ6–W2Ò°¢'6W&FR"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FöÖÅöFFWF–ÖR §fW'6–öâÒ#ãã·7V2Óãã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#3cVccVcc&S#†SV#&V&FC3vV#fc6#cCƒSVc–Cc3fC66CC3scsS–Cr ¦FWVæFVæ6–W2Ò°¢'6W&FUö6÷&R"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FöÖÅöVF—B §fW'6–öâÒ#ã’ãR §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##V&#ssF3SV6&fFS3V&Cv#–#†&3F#†Vcƒ“SC†vfV#V3–SsfS6SsC# ¦FWVæFVæ6–W2Ò°¢&–æFW†Ö"ãBã""À¢'FöÖÅöFFWF–ÖRãbã2"À¢'v–ææ÷rãRãC"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FöÖÅöVF—B §fW'6–öâÒ#ã#ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#3“fSFCC†&&#&#sSSF3“CF&FSc3#VSCCf6fcfV3F#C##sC#†cVV#s&Vc33‚ ¦FWVæFVæ6–W2Ò°¢&–æFW†Ö"ãBã""À¢'6W&FR"À¢'6W&FU÷7ææVBãbã’"À¢'FöÖÅöFFWF–ÖRãbã2"À¢'v–ææ÷rãRãC"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FöÖÅöVF—B §fW'6–öâÒ#ã#RãR·7V2Óãã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#3CV“FSƒSc333C“&3“cF#&3ss†#“FC&3ƒS3ss†C“c–FV&F6FfV6cB ¦FWVæFVæ6–W2Ò°¢&–æFW†Ö"ãBã""À¢'FöÖÅöFFWF–ÖRãã·7V2Óãã"À¢'FöÖÅ÷'6W""À¢'v–ææ÷rããB"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FöÖÅ÷'6W" §fW'6–öâÒ#ãã2·7V2Óãã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#C3†36c–#“Vf6S3##“f36VFSfF3#sc#v3–C–3&s#sFFCfC“cF3FCSb ¦FWVæFVæ6–W2Ò°¢'v–ææ÷rããB"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'FöÖÅ÷w&—FW" §fW'6–öâÒ#ãã"·7V2Óãã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#vCSc3S6&ccVCcCC#ƒsƒ#sCf3†33#Sc#cvCƒƒ6“–6&ScfC"  ¥µ·6¶vUÕÐ¦æÖRÒ'F÷vW" §fW'6–öâÒ#ãRã2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&V&SVVcc3SS“Vc3CFS&CV6fc3fC“s3#“&F3VV3cCCVfS–cƒS#CB ¦FWVæFVæ6–W2Ò°¢&gWGW&W2Ö6÷&R"À¢&gWGW&W2×WF–Â"À¢'–â×&ö¦V7BÖÆ—FR"À¢'7–æ5÷w&W""À¢'Fö¶–ò"À¢'F÷vW"ÖÆ–W""À¢'F÷vW"×6W'f–6R"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'F÷vW"Ö‡GG §fW'6–öâÒ#ãbã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#F6f6cvS#sCSff3fCFCcƒ†#FVccSCf&#“FFcCs3SC63“f36–fSCƒC ¦FWVæFVæ6–W2Ò°¢&&—FfÆw2"ã2ã""À¢&'—FW2"À¢&gWGW&W2×WF–Â"À¢&‡GG"À¢&‡GGÖ&öG’"À¢'–â×&ö¦V7BÖÆ—FR"À¢'F÷vW""À¢'F÷vW"ÖÆ–W""À¢'F÷vW"×6W'f–6R"À¢'W&Â"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'F÷vW"ÖÆ–W" §fW'6–öâÒ#ã2ã2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##3&f6FCc“ƒ&#f6CcCvffcf6C6f3s–6FS#ƒƒsƒ#ƒ3fcfFc–3CƒsƒR  ¥µ·6¶vUÕÐ¦æÖRÒ'F÷vW"×6W'f–6R §fW'6–öâÒ#ã2ã2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#†Fc–#fS6c&C3&3“#–&Cs–3C“Sƒƒ3v&3vFV3CsFC“C“S#s“†63†Sc–VVV32  ¥µ·6¶vUÕÐ¦æÖRÒ'G&6–ær §fW'6–öâÒ#ããCB §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#c6Sscc&fF#&&36#fcSsc3vV#“V&#cƒS3“vc66Cƒsf6VC&c#ffC ¦FWVæFVæ6–W2Ò°¢'–â×&ö¦V7BÖÆ—FR"À¢'G&6–ærÖGG&–'WFW2"À¢'G&6–ærÖ6÷&R"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'G&6–ærÖGG&–'WFW2 §fW'6–öâÒ#ãã3 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#sC“6fVV3“c3sCcScƒsCcS3csƒcs3–3VV#Sv3S†SSvc6&†6cc–S†F ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â"ãã’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'G&6–ærÖ6÷&R §fW'6–öâÒ#ãã3b §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&F#“v6c–C“ff&FSSSVFCc&f“VFF&–VV6fCF6#3ƒ†SFcC“cfCsF6CVf#s– ¦FWVæFVæ6–W2Ò°¢&öæ6Uö6VÆÂ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'G&’Ö–6öâ §fW'6–öâÒ#ã#Rã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&#&#–3S#ƒS–“CSSCƒ666CF#F#“†csCC†V&3s6#“csfCsƒ6c3C“#&fc–Cs" ¦FWVæFVæ6–W2Ò°¢&7&÷76&VÒÖ6†ææVÂ"À¢&F—'2"À¢&Æ–&–æF–6F÷""À¢&×VF"À¢&ö&¦3""À¢&ö&¦3"ÖÖ¶—B"À¢&ö&¦3"Ö6÷&RÖf÷VæFF–öâ"À¢&ö&¦3"Ö6÷&RÖw&†–72"À¢&ö&¦3"Öf÷VæFF–öâ"À¢&öæ6Uö6VÆÂ"À¢'ærã‚ã"À¢'6W&FR"À¢'F†—6W'&÷""ãã#"À¢'v–æF÷w2×7—2ãcã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'G'’ÖÆö6² §fW'6–öâÒ#ã"ãR §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&SC#&FCCC##S#sSSFVFCcScc“#3C†#vcSSff&3–3fSƒf&s3“cF"  ¥µ·6¶vUÕÐ¦æÖRÒ'G—V–B §fW'6–öâÒ#ãã2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&&3vCc#3#Sƒc#3#CV3SVC&3##s“6#SvFfcV3vVf3#sVvCSV6SCVcSCs2  ¥µ·6¶vUÕÐ¦æÖRÒ'G—VçVÒ §fW'6–öâÒ#ã#ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&#fcVSƒs&Sf36#3s#svfSVS&f#ƒS–fC“cF#CCF3#vFSC3ƒC63FFF#  ¥µ·6¶vUÕÐ¦æÖRÒ'VG5÷v–æF÷w2 §fW'6–öâÒ#ã"ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&c&cff##ƒCvccsC&6Csfcsƒ6&&3C–S“3sVC3v&Vcfcs6C–Ss3†3s&CfR ¦FWVæFVæ6–W2Ò°¢&ÖVÖöfg6WB"À¢'FV×f–ÆR"À¢'v–æF÷w2×7—2ãcã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'Væ–6öFRÖ–FVçB §fW'6–öâÒ#ãã#b §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&C#CVcCsƒSsvcƒ–ƒSS“FC#36#cCf#C3vS&#33ƒccsS66fc“3sƒc3“c“SB  ¥µ·6¶vUÕÐ¦æÖRÒ'Væ–6öFR×6VvÖVçFF–öâ §fW'6–öâÒ#ã2ã2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&3fcVC636#&c“#vƒ†f&3“cf3C“vCcS“Sc#SCc3cc†F3ƒ#fƒv‚  ¥µ·6¶vUÕÐ¦æÖRÒ'W&Â §fW'6–öâÒ#"ãRã‚ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&fccv†C3“s3s636Vcccƒ&6#3#cƒ###3S#ƒcƒV3C#Vc3†&6CVVB ¦FWVæFVæ6–W2Ò°¢&f÷&Õ÷W&ÆVæ6öFVB"À¢&–Fæ"À¢'W&6VçBÖVæ6öF–ær"À¢'6W&FR"À¢'6W&FUöFW&—fR"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'W&ÇGFW&â §fW'6–öâÒ#ãbã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&FcfcSVcF63CS#ƒs–3ƒcv&sSssf##VFfVSƒ#CF6#cS†&C–Ss“F" ¦FWVæFVæ6–W2Ò°¢&–7U÷&÷W'F–W2"À¢'&VvW‚"À¢'6W&FR"À¢'W&Â"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'WFc…ö—FW" §fW'6–öâÒ#ããB §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&#f3Cc#Svff&##&3&FVSS–6fScƒFS–#Vff3#vƒƒS–VcCC“F#VCS&#f&R  ¥µ·6¶vUÕÐ¦æÖRÒ'WV–B §fW'6–öâÒ#ã#rã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#“s#svC3f#–366S6SS†ffSsS6c†#&&&c3&†FC“3#CCsc–S#“cƒS– ¦FWVæFVæ6–W2Ò°¢&vWG&æFöÒãBã2"À¢&§2×7—2"À¢'6W&FUö6÷&R"À¢'v6ÒÖ&–æFvVâ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'f7¶r §fW'6–öâÒ#ã"ãR §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&66CFVc&cv&#vƒ&fS#3cff#“SvCC†VccsvcfVV#ƒ#Vc3s&cS&SC†&#3#C#b  ¥µ·6¶vUÕÐ¦æÖRÒ'fW'6–öâÖ6ö×&R §fW'6–öâÒ#ã"ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#63#ƒScƒ3vVcs†cSs3ƒ&cf#&#ƒSc6&cS&csƒVCs3#c†fC“sf6#6#†VFcR  ¥µ·6¶vUÕÐ¦æÖRÒ'fW'6–öåö6†V6² §fW'6–öâÒ#ã’ãR §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##“#†c36C“sVf3fC–cƒf3†c#ƒ3ƒS6C#f&FCV##vcSC&&fVS##ƒ“V  ¥µ·6¶vUÕÐ¦æÖRÒ'g7v†öÒ §fW'6–öâÒ#ãã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&&S“s–#vcsSsSs“–SƒSC#6#Csfcv3s†c3–S33S†cƒ6#VfVSsCc†" ¦FWVæFVæ6–W2Ò°¢&Æ–&2"À¢'g7v†öÒ×7—2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'g7v†öÒ×7—2 §fW'6–öâÒ#ãã2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&f#cvSF6&CfccvCFcCf3““F#VFSS“†VfC#ƒ&&3“V3VCVSVc#V3#3S ¦FWVæFVæ6–W2Ò°¢&62"À¢&Æ–&2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'vÆ¶F—" §fW'6–öâÒ#"ãRã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##“s““CcCFc“C–3VCfc“ƒsFVfFFVF3f3VVfS“CSCvCcƒc3†S6VSF" ¦FWVæFVæ6–W2Ò°¢'6ÖRÖf–ÆR"À¢'v–æ’×WF–Â"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'vçB §fW'6–öâÒ#ã2ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&V3F6FCFC“fSƒc†#vVcCss##vC†CS3†#Cf#3sS3fVS†–c&6#&VC" ¦FWVæFVæ6–W2Ò°¢'G'’ÖÆö6²"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v6’ §fW'6–öâÒ#ãã·v6’×6æ6†÷B×&Wf–Ws §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&66c6V3cSƒCvV#FSs666CVV#vC“–cƒCƒVFSC6Vf#&c3s6CcSFcFVCF"  ¥µ·6¶vUÕÐ¦æÖRÒ'v6—" §fW'6–öâÒ#ããB·v6’Óã"ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&#cvVf#3vSfSSV6Ss#&SCf#Vc–3vcƒ6SVf3s–f3&&FV#&6336C“Cƒr ¦FWVæFVæ6–W2Ò°¢'v—BÖ&–æFvVâ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v6ÒÖ&–æFvVâ §fW'6–öâÒ#ã"ã#’ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#–&#SFc3663c†fCCSCSs†C“ƒ##&FS6Cvv&#v#cS“SƒfC#ƒƒfCC’ ¦FWVæFVæ6–W2Ò°¢&6frÖ–b"À¢&öæ6Uö6VÆÂ"À¢''W7GfW'6–öâ"À¢'v6ÒÖ&–æFvVâÖÖ7&ò"À¢'v6ÒÖ&–æFvVâ×6†&VB"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v6ÒÖ&–æFvVâÖgWGW&W2 §fW'6–öâÒ#ãBãs’ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#66&#3FFS&C“ƒ&S–#C†S†C#fCF3FfccCcffc–ff#c“““ƒcS“VS3cR ¦FWVæFVæ6–W2Ò°¢&§2×7—2"À¢'Fö¶–ò"À¢'v6ÒÖ&–æFvVâ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v6ÒÖ&–æFvVâÖÖ7&ò §fW'6–öâÒ#ã"ã#’ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#&S#–C33V#fS##FvVV#V6C&C#VS6S“c†f&CcScCv#CFC6#sƒ–CVSƒS3R ¦FWVæFVæ6–W2Ò°¢'V÷FR"À¢'v6ÒÖ&–æFvVâÖÖ7&ò×7W÷'B"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v6ÒÖ&–æFvVâÖÖ7&ò×7W÷'B §fW'6–öâÒ#ã"ã#’ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#fcS†&33s–F&ƒfVc†SCs#ƒƒs–3ƒ&VsC–V#3363V#“SCS&f#r ¦FWVæFVæ6–W2Ò°¢&'V×Æò"À¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â2ããb"À¢'v6ÒÖ&–æFvVâ×6†&VB"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v6ÒÖ&–æFvVâ×6†&VB §fW'6–öâÒ#ã"ã#’ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##6c3–3S&v6CvCsssc–F6fS&–F##33cCƒ–CC“&6SCS6CV#““V3b ¦FWVæFVæ6–W2Ò°¢'Væ–6öFRÖ–FVçB"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v6Ò×7G&V×2 §fW'6–öâÒ#ãRã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#–CV3FccSv3–SSc3S##&#cVC“3#s“C&S#†VFCF&6F#36SCccs&&" ¦FWVæFVæ6–W2Ò°¢&gWGW&W2×WF–Â"À¢&§2×7—2"À¢'v6ÒÖ&–æFvVâ"À¢'v6ÒÖ&–æFvVâÖgWGW&W2"À¢'vV"×7—2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'vV"×7—2 §fW'6–öâÒ#ã2ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#ƒƒ#c#–FV66VSScS“F33Cc3Cc&3CcS†CCƒS“†fSsCsss#fc†&B ¦FWVæFVæ6–W2Ò°¢&§2×7—2"À¢'v6ÒÖ&–æFvVâ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'vV"×F–ÖR §fW'6–öâÒ#ãã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#VcSƒc3†#fC“#scƒƒvcV3FSv&3svS&3†SƒFS–#FCF#&f&" ¦FWVæFVæ6–W2Ò°¢&§2×7—2"À¢'v6ÒÖ&–æFvVâ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'vV%öFö×2 §fW'6–öâÒ#ã"ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&&†#ƒV3#S“6F3&cs†FCcFf3†fF#&FSS3“†f#c3s3ƒ“6S–3336f#2 ¦FWVæFVæ6–W2Ò°¢'†b"À¢'†eö6öFVvVâ"À¢'7G&–æuö66†R"À¢'7G&–æuö66†Uö6öFVvVâ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'vV&¶—C&wF² §fW'6–öâÒ#"ãã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&#sS3S3f#&VcƒcC†FcƒƒCcSCƒVCV3SC3ƒ“sVScCfc&f3Cs“2 ¦FWVæFVæ6–W2Ò°¢&&—FfÆw2ã2ã""À¢&6—&ò×'2"À¢&vF²"À¢&vF²×7—2"À¢&v–ò"À¢&v–ò×7—2"À¢&vÆ–""À¢&vÆ–"×7—2"À¢&vö&¦V7B×7—2"À¢&wF²"À¢&wF²×7—2"À¢&¦f67&—F6÷&R×'2"À¢&Æ–&2"À¢&öæ6Uö6VÆÂ"À¢'6÷W2"À¢'vV&¶—C&wF²×7—2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'vV&¶—C&wF²×7—2 §fW'6–öâÒ#"ãã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#“fVccV3&VcFfS&ffcc“S“c&V36CCScS3S–fF&#&S““C63“sFSf3s3FVR ¦FWVæFVæ6–W2Ò°¢&&—FfÆw2ã2ã""À¢&6—&ò×7—2×'2"À¢&vF²×7—2"À¢&v–ò×7—2"À¢&vÆ–"×7—2"À¢&vö&¦V7B×7—2"À¢&wF²×7—2"À¢&¦f67&—F6÷&R×'2×7—2"À¢&Æ–&2"À¢'¶rÖ6öæf–r"À¢'6÷W2×7—2"À¢'7—7FVÒÖFW2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'vV'f–Ws"Ö6öÒ §fW'6–öâÒ#ã3’ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#6cƒ–f6vsF6VSF6#3cSF3F&#ƒ“CCsƒ33&c“s3S†csV&V33vvCvSb ¦FWVæFVæ6–W2Ò°¢'vV'f–Ws"Ö6öÒÖÖ7&÷2"À¢'vV'f–Ws"Ö6öÒ×7—2"À¢'v–æF÷w2ãc"ã""À¢'v–æF÷w2Ö6÷&Rãc"ã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'vV'f–Ws"Ö6öÒÖÖ7&÷2 §fW'6–öâÒ#ã‚ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#cv“#3#c“F33cv#&#ƒ#66CF6FSfc“f&VV3svC3“3–3ƒ“–&#3sv6c–#–#SB ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â"ãã’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'vV'f–Ws"Ö6öÒ×7—2 §fW'6–öâÒ#ã3’ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&#6s3#ssSvCccSƒS6C–CsƒSv#†3“S##†FSCs#–Cf&6S&3vVFV&VFf" ¦FWVæFVæ6–W2Ò°¢'F†—6W'&÷""ãã#"À¢'v–æF÷w2ãc"ã""À¢'v–æF÷w2Ö6÷&Rãc"ã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æ’ §fW'6–öâÒ#ã2ã’ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#V3ƒ3–csFf6Cv“ƒ“S&SS“3#C&VC&S“3““#sCcscS3ƒcCCVC#†#cC’ ¦FWVæFVæ6–W2Ò°¢'v–æ’Ö“cƒb×2×v–æF÷w2ÖvçR"À¢'v–æ’×ƒƒeócB×2×v–æF÷w2ÖvçR"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æ’Ö“cƒb×2×v–æF÷w2ÖvçR §fW'6–öâÒ#ãBã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&36#ƒv3c3c#C#fFC–#““SV6S3#–VfcSCV&66&&#3Fc6&S–fcff#f#S#v#b  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æ’×WF–Â §fW'6–öâÒ#ãã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&3&v#363ƒsc#&C6c3#Sf3636VSV3Sƒ3–s3–fcsS6V&C#" ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2×7—2ãcã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æ’×ƒƒeócB×2×v–æF÷w2ÖvçR §fW'6–öâÒ#ãBã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#s&S##sƒCCSv3VS6C&f##&fvSVSCcS†SC†f&6s–V3C&6f3“3ƒ6b  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷r×f–'&æ7’ §fW'6–öâÒ#ã‚ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#SS66CC&6fC–&#3“cc#†3FCƒCƒƒVVFSc6FfCsf&S–c3C&#SSƒ ¦FWVæFVæ6–W2Ò°¢&ö&¦3""À¢&ö&¦3"ÖÖ¶—B"À¢&ö&¦3"Ö6÷&RÖf÷VæFF–öâ"À¢&ö&¦3"Öf÷VæFF–öâ"À¢&ö&¦3"×V'G¢Ö6÷&R"À¢'&r×v–æF÷rÖ†æFÆR"À¢'v–æF÷w2×7—2ãcã""À¢'v–æF÷w2×fW'6–öâ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2 §fW'6–öâÒ#ãSBã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#“#S&SSs#VF&VCƒ#ƒcVcSFcSS†SsSFSF63&33ƒƒ3S–V#sCcVc3Cf#C’ ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2Ö6÷&RãSBã"À¢'v–æF÷w2×F&vWG2ãS"ãb"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2 §fW'6–öâÒ#ãSbã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#FSc–Fc&FcVC&cF3ƒ“VF3sv3“3SVffccV#&c6F#C#–3C6c–6&cVS3" ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2Ö6÷&RãSbã"À¢'v–æF÷w2×F&vWG2ãS"ãb"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2 §fW'6–öâÒ#ãc"ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#S#vfFVS6S3S“3–fVCV&CfVV3f6C&S6F&CcC†#–c†SCCv3cSƒ36CƒSƒ ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2Ö6öÆÆV7F–öç2"À¢'v–æF÷w2Ö6÷&Rãc"ã""À¢'v–æF÷w2ÖgWGW&R"À¢'v–æF÷w2ÖçVÖW&–72"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2Ö6öÆÆV7F–öç2 §fW'6–öâÒ#ã2ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##6#&C“Vc†F63s3cvSVCFf3–3#S#fSs“SS#CSFCs#Sƒ63“v63cc ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2Ö6÷&Rãc"ã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2Ö6÷&R §fW'6–öâÒ#ãSBã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##cc#–3ƒ“3SCcƒFS†cC66SVcc†S##C6#–f#ƒCcƒsƒc3C#–ccCcR ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2×&W7VÇBãã""À¢'v–æF÷w2×F&vWG2ãS"ãb"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2Ö6÷&R §fW'6–öâÒ#ãSbã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#Cc“†SS&VC&C†cƒcS†#33“S&v3VSVfS#cƒ†3cVc†3FccsSCs#–c&b ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2Ö–×ÆVÖVçBãSbã"À¢'v–æF÷w2Ö–çFW&f6RãSbã"À¢'v–æF÷w2×&W7VÇBãã""À¢'v–æF÷w2×F&vWG2ãS"ãb"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2Ö6÷&R §fW'6–öâÒ#ãc"ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&#†Sƒ6FC3FCc#6#SF6S“Sƒ““3&##ƒc3“fFFSsscc6F3&&S–FV" ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2Ö–×ÆVÖVçBãcã""À¢'v–æF÷w2Ö–çFW&f6RãS’ã2"À¢'v–æF÷w2ÖÆ–æ²"À¢'v–æF÷w2×&W7VÇBãBã"À¢'v–æF÷w2×7G&–æw2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2ÖgWGW&R §fW'6–öâÒ#ã2ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&SCfc“#SfS†#s“s3–Ssƒ#V&CfFF3S&vS#&c“#s66F3cvFFSƒF3cV6" ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2Ö6÷&Rãc"ã""À¢'v–æF÷w2ÖÆ–æ²"À¢'v–æF÷w2×F‡&VF–ær"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2Ö–×ÆVÖVçB §fW'6–öâÒ#ãSbã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&cff33VcS†V6C“V–#s3Fc#3#–#“fSf&V3cf#6c&SfFCƒf&C&S“–S&c–" ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â"ãã’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2Ö–×ÆVÖVçB §fW'6–öâÒ#ãcã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#S6S&SC#Sv#–F3“S#s&3#cCƒcF#vV#6##&3CV#FSF36#FccsƒSVFFb ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â"ãã’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2Ö–çFW&f6R §fW'6–öâÒ#ãSbã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#ƒ““SCf&cFVFVc†cC3fc3#fS3#ƒcVc#s3ƒs†3SƒvF3#&3#cV&&6#Sv62 ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â"ãã’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2Ö–çFW&f6R §fW'6–öâÒ#ãS’ã2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#6c3f3F#Ss&#f&&V3s##3&3C“–C†3†&3“VVf66F3Scƒƒsƒc#33cvS3S‚ ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â"ãã’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2ÖÆ–æ² §fW'6–öâÒ#ã"ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&cƒS##&SSvcsS#Cfc&S3ff“c6&3ƒ“6CC#&c“sFVfS“vCcFSsCFfSR  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2ÖçVÖW&–72 §fW'6–öâÒ#ã2ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#fS&SCƒCF3C66F#CFVCS3v&&cs#vFS–#CFSvc##3“#svCV#c#b ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2Ö6÷&Rãc"ã""À¢'v–æF÷w2ÖÆ–æ²"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2×&W7VÇB §fW'6–öâÒ#ãã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#VS3ƒ33&S†V3ƒSS#C#SCcƒScC6FSƒcVC“vV3s#F3#ff#3#cCvc‚ ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2×F&vWG2ãS"ãb"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2×&W7VÇB §fW'6–öâÒ#ãBã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#ssƒfƒ–VccƒS36C&Fvc†SS#C&VVs†C3C–&c#“&#Vs3ƒS6V#R ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2ÖÆ–æ²"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2×7G&–æw2 §fW'6–öâÒ#ãRã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#sƒ3vC†cc–3sv6cf#scƒ“SCCS3†Sv3&f6cSvS3F#F3fcS†Sf3&6C6#3s“ ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2ÖÆ–æ²"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2×7—2 §fW'6–öâÒ#ãCRã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#sS#ƒ6&SVVf##ƒ3C3vVC#3cVc–3&V3#66C#–6V&V6&3“6CS#3V#cfC ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2×F&vWG2ãC"ã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2×7—2 §fW'6–öâÒ#ãcã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&c&cSSFC#ƒ#3Fcs#C““V3–C3–S6f#“Sc–c#&C6F&ƒCf33Sƒƒ#c&&6" ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2×F&vWG2ãS2ãR"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2×7—2 §fW'6–öâÒ#ãcã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&S3s##–&6&Cf6Fccv#ƒ3FccsccCSsvFFcC“Cfs#†#&6#3“#fc6f2 ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2ÖÆ–æ²"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2×F&vWG2 §fW'6–öâÒ#ãC"ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#†SSƒ36CCF3–#3ƒ†F#3c“3#“c6C“3cVFVCƒ3#SsVCCs#sSf#FCs ¦FWVæFVæ6–W2Ò°¢'v–æF÷w5ö&6ƒcEövçVÆÇfÒãC"ã""À¢'v–æF÷w5ö&6ƒcEö×7f2ãC"ã""À¢'v–æF÷w5ö“cƒeövçRãC"ã""À¢'v–æF÷w5ö“cƒeö×7f2ãC"ã""À¢'v–æF÷w5÷ƒƒeócEövçRãC"ã""À¢'v–æF÷w5÷ƒƒeócEövçVÆÇfÒãC"ã""À¢'v–æF÷w5÷ƒƒeócEö×7f2ãC"ã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2×F&vWG2 §fW'6–öâÒ#ãS"ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#–#s#Fcs#s“fS3f#“3#CCsƒCFC6CcC†6S–SC“Sf#“†Ss#V#ƒFS“““s2 ¦FWVæFVæ6–W2Ò°¢'v–æF÷w5ö&6ƒcEövçVÆÇfÒãS"ãb"À¢'v–æF÷w5ö&6ƒcEö×7f2ãS"ãb"À¢'v–æF÷w5ö“cƒeövçRãS"ãb"À¢'v–æF÷w5ö“cƒeövçVÆÇfÒãS"ãb"À¢'v–æF÷w5ö“cƒeö×7f2ãS"ãb"À¢'v–æF÷w5÷ƒƒeócEövçRãS"ãb"À¢'v–æF÷w5÷ƒƒeócEövçVÆÇfÒãS"ãb"À¢'v–æF÷w5÷ƒƒeócEö×7f2ãS"ãb"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2×F&vWG2 §fW'6–öâÒ#ãS2ãR §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#C“CVc–cSS#ƒ†SCcVc6F#&3#V336#†6VFC–SCc6VFc“F6C#–c“c–c2 ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2ÖÆ–æ²"À¢'v–æF÷w5ö&6ƒcEövçVÆÇfÒãS2ã"À¢'v–æF÷w5ö&6ƒcEö×7f2ãS2ã"À¢'v–æF÷w5ö“cƒeövçRãS2ã"À¢'v–æF÷w5ö“cƒeövçVÆÇfÒãS2ã"À¢'v–æF÷w5ö“cƒeö×7f2ãS2ã"À¢'v–æF÷w5÷ƒƒeócEövçRãS2ã"À¢'v–æF÷w5÷ƒƒeócEövçVÆÇfÒãS2ã"À¢'v–æF÷w5÷ƒƒeócEö×7f2ãS2ã"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2×F‡&VF–ær §fW'6–öâÒ#ã"ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#3“C–&CV#“–6fFc3v6ƒf#C66ScC#†FfS#vCcc“S†c#Cs“Ccs6CƒfCsV#3r ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2ÖÆ–æ²"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w2×fW'6–öâ §fW'6–öâÒ#ããr §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&SCcF–#–C3#f#s#c&3†S&3ƒFFccv63F&3–S366cC–S663&V#c3c3 ¦FWVæFVæ6–W2Ò°¢'v–æF÷w2ÖÆ–æ²"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö&6ƒcEövçVÆÇfÒ §fW'6–öâÒ#ãC"ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#S“vSƒSs#c†&3†C†CS“#S33&3SFc&–C–FVVFVVcV#“–#&&&#c“†c‚  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö&6ƒcEövçVÆÇfÒ §fW'6–öâÒ#ãS"ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#3&Cc##ƒSvV3CF&#SSSCF3ƒ&3–fC–V3#c&V3CvVFCS“ƒ–66C3&6C2  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö&6ƒcEövçVÆÇfÒ §fW'6–öâÒ#ãS2ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&–CƒCff†#C&cV3“CvcƒCƒ&3C6SvCƒ–Ss6s66VCSfCCFcfScFfC#S2  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö&6ƒcEö×7f2 §fW'6–öâÒ#ãC"ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&S†SƒƒcFccfVcCfcF&C#FF#†#f#6&SSssfV6CCscCS“C&SS†3FCC2  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö&6ƒcEö×7f2 §fW'6–öâÒ#ãS"ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#–V3&v&#S&S##S&#S6fsƒ3Ssƒs“SC†&3s–33–Fcsc#v6&&CVCCc’  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö&6ƒcEö×7f2 §fW'6–öâÒ#ãS2ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&#–Csƒ&SƒF3&cc3&S3“Ss†S“–“C#sS“V#“##CcSSCsCFS–##Sb  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö“cƒeövçR §fW'6–öâÒ#ãC"ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&3cC“#vC†FCF“fƒc#“Cƒ“3S6Scƒs3“s3vC6&V6C3CV3†fV3–3ƒFb  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö“cƒeövçR §fW'6–öâÒ#ãS"ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#†S–#VCV#ƒ&S“vV#†S#“V3cs#SS–VSF3#C6cc–Csƒ3“CFV&fS†&&f"  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö“cƒeövçR §fW'6–öâÒ#ãS2ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#“cSfFc–CƒS–&V6#6SvcS##FFfcffc&Cfcf##66c3s&ScS“62  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö“cƒeövçVÆÇfÒ §fW'6–öâÒ#ãS"ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#VVSS&C3†3“#66sf3Sc6#ƒf36F&CsVcƒ“#ƒv3–CSƒfCs33FS†VCcb  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö“cƒeövçVÆÇfÒ §fW'6–öâÒ#ãS2ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&fs3S–CC†cc†#†#–fs36F66f#S–#SS–VCcC††c“SCc–3#sSsƒ2  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö“cƒeö×7f2 §fW'6–öâÒ#ãC"ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#CFCƒC#fV3cC–cCƒC3†Cƒc–3cS†#“&Cƒ“3CVFC“C#v&fSf3CCFCc  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö“cƒeö×7f2 §fW'6–öâÒ#ãS"ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##C“C†&3V3VSv3fF&&#†&cƒ–Cƒ–ff6S6S33##ƒ–Ss6FVVfSFcfV3Sf3cb  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5ö“cƒeö×7f2 §fW'6–öâÒ#ãS2ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#Sv3sSs–cƒ#3&fS–3#ƒSc3ScVSvVc†C63ƒ“#SF3cƒV#SvCƒ63†C3#f3"  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5÷ƒƒeócEövçR §fW'6–öâÒ#ãC"ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#†FS“&#†#†fV#SV3cCƒcv6cCvFF“vc“&CSVfCV#C“Ff#“†cf&&#s6#3b  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5÷ƒƒeócEövçR §fW'6–öâÒ#ãS"ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#CvV3ƒ&f&c3vC“6#Sƒ“VCFS3Vc#“vV##f&&##–6“F3V#†#s‚  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5÷ƒƒeócEövçR §fW'6–öâÒ#ãS2ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#–33ƒC&6FCsFƒcVƒcf#3–3†vCs63ss†6c#“3s#VfCf#F#–vFcFC“’  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5÷ƒƒeócEövçVÆÇfÒ §fW'6–öâÒ#ãC"ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##fCC#Cf3fCCS3sC†VFVcCƒfCV3vƒVF##&SSffc3CcC3“ƒFVƒSSFS“F2  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5÷ƒƒeócEövçVÆÇfÒ §fW'6–öâÒ#ãS"ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##FCV##6F3CsC#cs“cƒ3“fc&#C–c6FS†3Cs6FV#Sf&C3CCƒs&VfcSVCB  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5÷ƒƒeócEövçVÆÇfÒ §fW'6–öâÒ#ãS2ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#ffs–S&CvVVS†C†cSsC“3C3cScf3v6333S3f33s–fFc†cCvcf&#vS  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5÷ƒƒeócEö×7f2 §fW'6–öâÒ#ãC"ã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#–V3VF33S#CS†3fCF3#SCC–3#“SVfFScC#6#&cVVcf#–c  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5÷ƒƒeócEö×7f2 §fW'6–öâÒ#ãS"ãb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#Sƒ–cfFƒF3cCc#CsCvC#s&SccVcfVC66VC#c3CSCffFf#SS“S–c–V2  ¥µ·6¶vUÕÐ¦æÖRÒ'v–æF÷w5÷ƒƒeócEö×7f2 §fW'6–öâÒ#ãS2ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&Cf&&fcVcFC#vSVfFVcc“ƒSƒƒ&c#cSSfc3CV3–SFC3fCV&VCcS  ¥µ·6¶vUÕÐ¦æÖRÒ'v–ææ÷r §fW'6–öâÒ#ãRãC §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&cS“6“S3“ƒs3vVVCS6SCƒ–3sƒVFc6c3c†SCF&6Ccs†3fFF&c3“Vcƒsb ¦FWVæFVæ6–W2Ò°¢&ÖVÖ6‡""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–ææ÷r §fW'6–öâÒ#ããB §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##6#“s3–cv#ƒ3C6Fc&63“ƒ“3†SV36V#C3ccCS#F3†C&#FS3C63fVV6Fcƒ ¦FWVæFVæ6–W2Ò°¢&ÖVÖ6‡""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v–ç&Vr §fW'6–öâÒ#ãSbã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#vCfc3&fcF–cfc#3V##S–63ƒSCs“33s3“336SSS†6Fc6#fc&66 ¦FWVæFVæ6–W2Ò°¢&6frÖ–b"À¢'v–æF÷w2×7—2ãcã""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'v—BÖ&–æFvVâ §fW'6–öâÒ#ãSrã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#V&c“CFSƒvv3#S3#36CcscfSƒ&S66CsF#VC3ƒ&63#F33†cSC“cCS3fR  ¥µ·6¶vUÕÐ¦æÖRÒ'w&—FV&ÆR §fW'6–öâÒ#ãbãB §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#6Cƒ&C&366F3“csFF3sCcScs&c#sS“cc†f6F&Scs“–C–SfF#†3Sƒ“#cs–F2  ¥µ·6¶vUÕÐ¦æÖRÒ'w'’ §fW'6–öâÒ#ãSrã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&ƒ““Sv#3–cƒVSc3†3†C#C&csfF&3ƒvC3F6cv&fCCCs&S#fc ¦FWVæFVæ6–W2Ò°¢&&6ScBã#"ã"À¢&&Æö6³""À¢&6öö¶–R"À¢&7&÷76&VÒÖ6†ææVÂ"À¢&F—'2"À¢&FöÕ÷VW'’"À¢&G’"À¢&GVæ6R"À¢&vF·ƒ"À¢&wF²"À¢&‡GG"À¢&¦f67&—F6÷&R×'2"À¢&¦æ’"À¢&Æ–&2"À¢&æF²"À¢&ö&¦3""À¢&ö&¦3"ÖÖ¶—B"À¢&ö&¦3"Ö6÷&RÖf÷VæFF–öâ"À¢&ö&¦3"Öf÷VæFF–öâ"À¢&ö&¦3"×V’Ö¶—B"À¢&ö&¦3"×vV"Ö¶—B"À¢&öæ6Uö6VÆÂ"À¢'W&6VçBÖVæ6öF–ær"À¢'&r×v–æF÷rÖ†æFÆR"À¢'6†""À¢'6÷W2"À¢'FòÖÖ7&÷2"À¢'F†—6W'&÷""ãã#"À¢'W&Â"À¢'vV&¶—C&wF²"À¢'vV&¶—C&wF²×7—2"À¢'vV'f–Ws"Ö6öÒ"À¢'v–æF÷w2ãc"ã""À¢'v–æF÷w2Ö6÷&Rãc"ã""À¢'v–æF÷w2×fW'6–öâ"À¢'ƒÖFÂ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'ƒ §fW'6–öâÒ#"ã#ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#S&FSCcF66CCccv#3C3V6#““#ƒ#&3&3F&FSss3“ƒƒCƒC3&F#&R ¦FWVæFVæ6–W2Ò°¢&Æ–&2"À¢'¶rÖ6öæf–r"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'ƒÖFÂ §fW'6–öâÒ#"ã#ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#3ƒs3S“#FfVFCS3FfSSCƒs“#“FVC†3fFScc3c#ƒV6#–fV3FCV#F#ƒV3Sfb ¦FWVæFVæ6–W2Ò°¢&Æ–&2"À¢&öæ6Uö6VÆÂ"À¢'¶rÖ6öæf–r"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'–ö¶R §fW'6–öâÒ#ã‚ã2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#s–fS#6C#F#fC3VCƒ#S&#&C6fFf#ƒ33CƒvCVf“CVCC#sc&“ƒ“fVcR ¦FWVæFVæ6–W2Ò°¢'7F&ÆUöFW&Ve÷G&—B"À¢'–ö¶RÖFW&—fR"À¢'¦W&ög&öÒ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'–ö¶RÖFW&—fR §fW'6–öâÒ#ã‚ãB §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&V3†V&FS&F#3cƒS†3““ƒ63#sƒ##3ScƒsS#c“FFf“Cs6Ss3–V#FF&FSfCs ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â2ããb"À¢'7–ç7G'V7GW&R"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦'W2 §fW'6–öâÒ#Rã’ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#VF#F&Sv3sV6#C#SF#vVScCSSCcC#3–&C#C6&v33SsScFfc6sF#SSS“r ¦FWVæFVæ6–W2Ò°¢&7–æ2Ö'&öF67B"À¢&7–æ2ÖW†V7WF÷""À¢&7–æ2Ö–ò"À¢&7–æ2ÖÆö6²"À¢&7–æ2×&ö6W72"À¢&7–æ2×&V7W'6–öâ"À¢&7–æ2×F6²"À¢&7–æ2×G&—B"À¢&&Æö6¶–ær"À¢&VçVÖfÆw3""À¢&WfVçBÖÆ—7FVæW""À¢&gWGW&W2Ö6÷&R"À¢&gWGW&W2ÖÆ—FR"À¢&†W‚"À¢&Æ–&2"À¢&÷&FW&VB×7G&VÒ"À¢''W7F—‚"À¢'6W&FR"À¢'6W&FU÷&W""À¢'G&6–ær"À¢'VG5÷v–æF÷w2"À¢'WV–B"À¢'v–æF÷w2×7—2ãcã""À¢'v–ææ÷rããB"À¢'¦'W5öÖ7&÷2"À¢'¦'W5öæÖW2"À¢'§f&–çB"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦'W5öÖ7&÷2 §fW'6–öâÒ#Rã’ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##““c3VC–FSfFcƒc†cs&c†63c–ƒsf““ƒS†&C63C#&SC6c†F3ƒ†cC ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&òÖ7&FR2ãRã"À¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â2ããb"À¢'¦'W5öæÖW2"À¢'§f&–çB"À¢'§f&–çE÷WF–Ç2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦'W5öæÖW2 §fW'6–öâÒ#Bã2ãB §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&C†&cƒ†#F6fcS6Sƒƒ3SSV##“v–CS633#–3VFC&&fFCƒS6S3C#ƒc#FR ¦FWVæFVæ6–W2Ò°¢'6W&FR"À¢'v–ææ÷rããB"À¢'§f&–çB"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦6†V7G" §fW'6–öâÒ#ãã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&CfV3ScCScSƒ6V#V3SF3#V##ƒc#CFSCCccvcsfS6S†&#†3C““Cs2 ¦FWVæFVæ6–W2Ò°¢'6W&FR"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦W&ö6÷’ §fW'6–öâÒ#ã‚ãc §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#cCf3F&#sC#fcff36f#sScc#&&#ƒc#&S3#&&C&33cC#f“&VCCƒ–#F&R ¦FWVæFVæ6–W2Ò°¢'¦W&ö6÷’ÖFW&—fR"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦W&ö6÷’ÖFW&—fR §fW'6–öâÒ#ã‚ãc §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#“–3#v63sS#V&CFFcS–CVSs63CV#&3&ƒ#Vf#Sƒƒ#3F63#6SCvV3c–3FF" ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â"ãã’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦W&ög&öÒ §fW'6–öâÒ#ãã‚ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#V3Vƒ6VƒfcfCsSC–6Cƒ#FFF&vFfSs#†VCVcc†Sf3S#s" ¦FWVæFVæ6–W2Ò°¢'¦W&ög&öÒÖFW&—fR"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦W&ög&öÒÖFW&—fR §fW'6–öâÒ#ãã‚ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&csV#Ccƒ6cf3vcCS#C†CFCcCSf#C#“†3c#ƒS““33SfCvC#F“c&VcCF ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â2ããb"À¢'7–ç7G'V7GW&R"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦W&ö—¦R §fW'6–öâÒ#ã’ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&S3ƒC3“&3VSF&33s“6S#“3VVVVVC#C“VsS3Sf#ƒƒ3ƒ3VS†s†ccƒs’  ¥µ·6¶vUÕÐ¦æÖRÒ'¦W&÷G&–R §fW'6–öâÒ#ã"ãR §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#FV#c–36&C3&c3&33#“v&S“&&fcCcC–&#f3scFSc#vS“–s“V6b ¦FWVæFVæ6–W2Ò°¢&F—7Æ–Fö2"À¢'–ö¶R"À¢'¦W&ög&öÒ"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦W&÷fV2 §fW'6–öâÒ#ãã‚ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&&#CcFSsƒf3C“sfCV6&#“3“–3vc†SSfS#s–S&&C“6cc3#6#Vf6cvFC‚ ¦FWVæFVæ6–W2Ò°¢'–ö¶R"À¢'¦W&ög&öÒ"À¢'¦W&÷fV2ÖFW&—fR"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦W&÷fV2ÖFW&—fR §fW'6–öâÒ#ããb §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#3FFcff33–F&C#fFF3–3Sf#“ƒCCsfS666S#&ScFSCCƒsc3fVcC“C3c“##VF ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â2ããb"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦— §fW'6–öâÒ#"ãBã" §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&f&Sc3#FS“†cƒV3S#c66Sv#f#c†F6#vV#fF&3ƒ6&CCƒC63–&36V&S ¦FWVæFVæ6–W2Ò°¢&&&—G&'’"À¢&7&33&f7B"À¢&7&÷76&VÒ×WF–Ç2"À¢&F—7Æ–Fö2"À¢&fÆFS""À¢&–æFW†Ö"ãBã""À¢&ÖVÖ6‡""À¢'F†—6W'&÷""ãã#"À¢'¦÷fÆ’"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'¦Æ–"×'2 §fW'6–öâÒ#ãbã‚ §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&##c†SS†Sv3c“6Cv3#sc“6ff3F&6#3ƒC#SSC#33ƒV&cc6vc“C&C"  ¥µ·6¶vUÕÐ¦æÖRÒ'¦Ö–¢ §fW'6–öâÒ#ãã#2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ##“ccfC&&fCS6F3FF6ccCCs3FC66###V&&&F3ƒ33“3CV##CF66f3"  ¥µ·6¶vUÕÐ¦æÖRÒ'¦÷fÆ’ §fW'6–öâÒ#ã‚ã2 §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&cV6Cƒs“vCc3ƒcSC#Vfcƒ–#V3FCƒƒFc3V&6S†C#Sƒ#vCcvC&#S#C’ ¦FWVæFVæ6–W2Ò°¢&'V×Æò"À¢&7&33&f7B"À¢&Æör"À¢'6–ÖBÖFÆW#3""À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'§f&–çB §fW'6–öâÒ#RãRã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&3C3F3#v63f6FCcCSƒC#sS–FCf#ƒc&cv#vS6cv#–##3SVCCFF“ƒc“Cr ¦FWVæFVæ6–W2Ò°¢&VæF’"À¢&VçVÖfÆw3""À¢'6W&FR"À¢'v–ææ÷rããB"À¢'¦6†V7G""À¢'§f&–çEöFW&—fR"À¢'§f&–çE÷WF–Ç2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'§f&–çEöFW&—fR §fW'6–öâÒ#RãRã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ#ƒcCSVSc–#C3S&F#3vc3sC“v&cCVCS3†CscS–3†#6F&c“s“Vc3cs6c†3C“r ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&òÖ7&FR2ãRã"À¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'7–â2ããb"À¢'§f&–çE÷WF–Ç2"À¥Ð ¥µ·6¶vUÕÐ¦æÖRÒ'§f&–çE÷WF–Ç2 §fW'6–öâÒ#Bã"ã §6÷W&6RÒ'&Vv—7G'’¶‡GG3¢òöv—F‡V"æ6öÒ÷'W7BÖÆærö7&FW2æ–òÖ–æFW‚ ¦6†V6·7VÒÒ&&C#“C3c3##c“F3#ƒCcF3s6FCSf33cScV6#f&ff3CCCCc#†2 ¦FWVæFVæ6–W2Ò°¢'&ö2ÖÖ7&ó""À¢'V÷FR"À¢'6W&FR"À¢'7–â2ããb"À¢'v–ææ÷rããB"À¥Ð