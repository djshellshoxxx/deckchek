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
  check('rail has 11 nav items', (await page.locator('.rail-item').count()) === 11);
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
  check('shortcuts help lists Ctrl+1…9 and 0', helpHtml.includes('<kbd>9</kbd>') && helpHtml.includes('<kbd>0</kbd>') && /8 Devices/.test(helpHtml));

  // Quick Check with a generated 1 kHz WAV
  await page.click('.rail-item[data-screen="quick"]');
  check('live capture shows desktop-only state in browser', (await page.locator('#screen-quick .source[data-source="live"][aria-disabled="true"]').count()) === 1);
  await page.setInputFiles('#quick-file', wav);
  await page.click('#quick-analyze');
  await page.waitForSelector('#screen-quick .verdict', { timeout: 20000 });
  const chipText = await page.locator('#screen-quick .verdict .chip').first().innerText();
  check('Quick Check renders a verdict', /PASS|REVIEW|WARNING|FAIL/.test(chipText), chipText);
  check('readouts show uncertainty', (await page.locator('#screen-quick .readout-unc').first().innerText()).includes('±'));
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
  await page.fill('#eq-f-nickname', 'Deck 1 — SL-1200MK7');
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
  check('Devices: cards show category, test count and images', (await page.locator('.dev-card .dev-cat').count()) === PROFILE_IDS.length && (await page.locator('.dev-card .dev-thumb img').count()) === PROFILE_IDS.length);
  const imgsOk = await page.evaluate(() => [...document.querySelectorAll('.dev-thumb img')].every(i => i.complete && i.naturalWidth > 0));
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
    check(`Devices: ${id} detail renders plan, specs and docs`, tests > 5 && runnable === tests && specs > 0 && (await page.locator('#dev-docs').innerText()).length > 10, `${tests} tests, ${runnable} runnable, ${specs} specs`);
  }
  await openDevice(page, 'pioneer-ddj-s8');
  check('Devices: DDJ-S8 identity note shown prominently', /could not be found/.test(await page.locator('.dev-identity').innerText()));
  check('Devices: MIDI learn-mode explanation', (await page.locator('#dev-midi .dev-learn-explain').count()) === 1);
  check('Devices: spec table marks unverified specs', (await page.locator('#dev-specs .chip-warn').count()) >= 3);
  const da = await a11yAudit(page);
  check('Devices: a11y names + target sizes (detail)', !da.unnamed.length && !da.small.length, [...da.unnamed, ...da.small].slice(0, 3).join(' | '));
  await page.evaluate(() => { document.getElementById('main').scrollTop = 0; });
  await deviceShot(page, 'device-detail-dark');
  await page.locator('#dev-plan .dev-test[data-test="ddjs8-midi-coverage"] .dev-test-main').click();
  check('Devices: test details open in the inspector', /Pass criterion/.test(await page.locator('#inspector-body').innerText()));
  await shot(page, 'device-test-inspector-dark');
  await openDevice(page, 'technics-sl-1200mk4');
  check('Devices: Technics identity note (SL-1200MK4 assumed)', /SL-1200MK4/.test(await page.locator('.dev-identity').innerText()));
  await openDevice(page, 'allen-heath-xone-23');
  check('Devices: Xone:23C identity confirmed by owner', /Confirmed by the owner/.test(await page.locator('.dev-identity').innerText()));

  // manual:inspection checklist
  await openDevice(page, 'pioneer-ddj-s8');
  await page.click('button[data-run-test="ddjs8-jogs"]');
  await page.waitForSelector('.dev-checklist');
  check('Manual: Save disabled until every item answered', await page.locator('#dev-check-save').isDisabled());
  const items = page.locator('.dev-check-item');
  await items.nth(0).locator('[data-answer="ok"]').click();
  await items.nth(1).locator('[data-answer="problem"]').click();
  await items.nth(2).locator('[data-answer="na"]').click();
  await page.fill('.dev-notes textarea', 'Jog top wobbles slightly');
  await page.click('#dev-check-save');
  await page.waitForSelector('#dev-run-result .banner-result');
  check('Manual: a Problem answer saves FAIL', /FAIL/.test(await page.locator('#dev-run-result').innerText()));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.catalog.v1')).deviceResults);
  check('Manual: device_test_result stored with notes and answers', saved.length === 1 && saved[0].status === 'fail' && saved[0].detail.notes === 'Jog top wobbles slightly' && saved[0].detail.checklist[1].answer === 'problem');
  await deviceShot(page, 'device-manual-result-dark');
  await page.click('#dev-run-done');
  await page.waitForSelector('#dev-plan .dev-test');
  check('Manual: device page shows the FAIL status and progress', /FAIL/.test(await page.locator('.dev-test[data-test="ddjs8-jogs"]').innerText()));

  // driver:check without Tauri: desktop-only state, skip records a skipped result
  await page.click('button[data-run-test="ddjs8-driver"]');
  await page.waitForSelector('#dev-scan-run');
  check('Driver check: browser shows desktop-only state with Run disabled', await page.locator('#dev-scan-run').isDisabled() && /Windows app/.test(await page.locator('#dev-runner').innerText()));
  await page.click('#dev-run-back');

  // quick:Signal health dispatches to the guided workflow, saves a linked result and returns
  await openDevice(page, 'pioneer-ddj-s8');
  await page.click('button[data-run-test="ddjs8-usb-master"]');
  await page.waitForSelector('#screen-quick:not([hidden]) #device-test-banner');
  check('Workflow test: Quick Check opens with the device banner', /Running My DDJ-S8 · Master output signal health/.test(await page.locator('#device-test-banner').innerText()));
  check('Workflow test: profile steps shown in Setup', /Play a test tone in Serato/.test(await page.locator('#screen-quick .card-device').innerText()) && /Master out/.test(await page.locator('#screen-quick .card-device').innerText()));
  await shot(page, 'device-workflow-setup-dark');
  await page.setInputFiles('#quick-file', wav);
  await page.click('#quick-analyze');
  await page.waitForSelector('#screen-quick .step-results:not([hidden]) .verdict', { timeout: 20000 });
  await page.waitForFunction(() => /Saved to the/.test(document.getElementById('device-test-banner')?.innerText || ''), null, { timeout: 5000 }).catch(() => {});
  check('Workflow test: results banner confirms the saved device result', /Saved to the Pioneer DJ DDJ-S8 test plan/.test(await page.locator('#device-test-banner').innerText()));
  const wfRes = await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.catalog.v1')).deviceResults.find(r => r.testId === 'ddjs8-usb-master'));
  check('Workflow test: result linked to the saved run (session id)', !!wfRes?.sessionId && wfRes.detail.runId === wfRes.sessionId && wfRes.detail.measurements.length > 3, JSON.stringify(wfRes?.status));
  await page.click('#device-test-back');
  await page.waitForSelector('#screen-devices:not([hidden]) #dev-plan .dev-test');
  check('Workflow test: returns to the device page with a status', !/NOT RUN/.test(await page.locator('.dev-test[data-test="ddjs8-usb-master"] .dev-test-status').innerText()));
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
  await openDevice(page, 'pioneer-ddj-s8');

  // report export
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+e')]);
  const report = fs.readFileSync(await dl.path(), 'utf8');
  check('Device report: Ctrl+E exports HTML with statuses and the unverified-spec disclaimer', /deckchek-device-ddj-s8/.test(dl.suggestedFilename()) && /Unverified specifications/.test(report) && /FAIL/.test(report) && /Jog wheel inspection/.test(report));

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
  await openDevice(page, 'pioneer-ddj-s8');
  await page.click('button[data-run-test="ddjs8-driver"]');
  await page.click('#dev-scan-run');
  await page.waitForSelector('#dev-run-result .banner-result');
  check('Driver check: scan evaluated (DDJ-S8 not in scan -> Driver not found)', /Driver not found/.test(await page.locator('#dev-runner').innerText()));
  const drv = await page.evaluate(() => window.__mockDb.deviceResults.find(r => r.testId === 'ddjs8-driver'));
  check('Driver check: device_test_result_save stored FAIL with driver_present = 0', drv?.status === 'fail' && drv.detail.measurements.find(m => m.metricId === 'driver_present')?.value === 0);
  await shot(page, 'device-driver-dark');

  // midi:coverage, learn mode with a mocked MIDI port
  await page.click('#dev-run-back');
  await page.waitForSelector('#dev-plan .dev-test');
  await page.click('button[data-run-test="ddjs8-midi-coverage"]');
  await page.waitForSelector('#midi-port');
  check('MIDI: port auto-selected from portNamePatterns', (await page.inputValue('#midi-port')) === 'DDJ-S8 MIDI 1');
  await page.waitForFunction(() => window.__mockMidi.open.includes('DDJ-S8 MIDI 1'));
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
  const cov1 = await page.evaluate(() => window.__mockDb.deviceResults.find(r => r.testId === 'ddjs8-midi-coverage'));
  check('MIDI coverage (learn): result saved as REVIEW with discovered count', cov1?.status === 'unknown' && cov1.detail.discovered === 3);
  // second run uses the learned map
  await page.click('#dev-run-result button:has-text("Run again")');
  await page.waitForSelector('.dev-tile');
  check('MIDI coverage: re-run uses the learned map (tiles)', (await page.locator('.dev-tile').count()) === 2);
  await page.evaluate(() => { const e = window.__emitMidi; e([0x90, 11, 127]); e([0x80, 11, 0]); e([0xB0, 31, 0]); e([0xB0, 31, 127]); });
  await page.waitForFunction(() => document.querySelectorAll('.dev-tile.seen').length === 2);
  await page.click('#midi-finish');
  await page.waitForFunction(() => window.__mockDb.deviceResults.filter(r => r.testId === 'ddjs8-midi-coverage').length === 2);
  const cov2 = await page.evaluate(() => window.__mockDb.deviceResults.find(r => r.testId === 'ddjs8-midi-coverage'));
  check('MIDI coverage (mapped): all controls seen -> PASS', cov2.status === 'pass' && cov2.detail.measurements.find(m => m.metricId === 'midi_controls_seen_percent')?.value === 100, cov2.status);
  await shot(page, 'device-midi-coverage-dark');

  // no MIDI device present -> clear empty state
  await page.evaluate(() => { window.__mockMidi.ports = []; });
  await page.click('#dev-run-back');
  await page.waitForSelector('#dev-plan .dev-test');
  await page.click('button[data-run-test="ddjs8-jog-jog1"]');
  await page.waitForSelector('#midi-empty');
  check('MIDI: clear state when no MIDI port is present', /No MIDI device found/.test(await page.locator('#midi-empty').innerText()));
  const ma = await a11yAudit(page);
  check('MIDI: a11y names + target sizes', !ma.unnamed.length && !ma.small.length, [...ma.unnamed, ...ma.small].slice(0, 3).join(' | '));
  await page.click('#dev-run-back');
  await page.waitForSelector('#dev-plan .dev-test');
  check('Desktop devices: progress reflects saved results', /FAIL/.test(await page.locator('.dev-test[data-test="ddjs8-driver"]').innerText()) && /PASS/.test(await page.locator('.dev-test[data-test="ddjs8-midi-coverage"]').innerText()));
}

// Minimal Tauri mock: catalog/run commands in memory, synthetic live capture.
export function tauriMock() {
  const listeners = {};
  const db = { catalog: { manufacturer: [], product: [], asset: [], setup: [], venue: [] }, runs: [], deviceProfiles: {}, deviceResults: [], midiMaps: {} };
  const midiState = { ports: ['Focusrite USB MIDI', 'DDJ-S8 MIDI 1'], open: [], sent: [] };
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
      return { payload: { deviceName: 'Focusrite USB (In 1/2)', sampleRate: sr, channels: 2, left: s, right: s, streamErrors: [] }, quality: { framesCaptured: n, overrunSamples: 0, clippedSamplesL: 0, clippedSamplesR: 3, streamErrors: 0, streamErrorMessages: [], truncated: false, callbackCount: Math.round(n / 480), maxCallbackGapMs: 11.2 } };
    },
    live_capture_status: () => ({ running, elapsedSec: (Date.now() - started) / 1000, quality: {} }),
    catalog_list: ({ entity }) => db.catalog[entity].slice(),
    catalog_upsert: ({ entity, record }) => { const r = { ...record, id: record.id || `id-${Math.random().toString(36).slice(2)}` }; db.catalog[entity] = [...db.catalog[entity].filter(x => x.id !== r.id), r]; return r; },
    catalog_delete: ({ entity, id }) => { db.catalog[entity] = db.catalog[entity].filter(x => x.id !== id); return true; },
    save_diagnostic_run: ({ run }) => {
      if (run.measurements.some(m => typeof m.uncertainty === 'object' && m.uncertainty !== null)) throw 'uncertainty must be numeric';
      db.runs.unshift(run); return null;
    },
    list_runs: () => db.runs.map(r => ({ id: r.id, sessionType: r.sessionType, test: r.test, startedAt: r.createdAt, status: 'completed', score: r.score, measurementCount: r.measurements.length, hypothesisCount: r.findings.length })),
    get_run: ({ id }) => { const r = db.runs.find(x => x.id === id); return r && { id: r.id, test: r.test, startedAt: r.createdAt, score: r.score, measurements: r.measurements, hypotheses: r.findings.map(f => ({ key: f.code, summary: `${f.title}: ${f.detail}`, severity: f.severity, confidence: f.confidence, alternatives: f.alternatives, isolationTests: f.isolationTests, support: [{ measurementIds: (f.supportedBy || []).map(m => `${r.id}:${m}`) }], contradictions: [] })) }; },
    system_scan_drivers: () => ({ supported: true, scannedAt: new Date().toISOString(), errors: [], drivers: [
      { deviceName: 'Pioneer DDJ-FLX4', deviceClass: 'MEDIA', manufacturer: 'Pioneer DJ', driverProvider: 'AlphaTheta', driverVersion: '1.2.3.0', driverDate: '2025-02-11T00:00:00Z', infName: 'oem12.inf', hardwareId: 'USB\\VID_2B73&PID_0003', isSigned: true, signer: 'AlphaTheta Corp', status: 'Error', problemCode: 43, present: true },
      { deviceName: 'Budget USB Audio Codec', deviceClass: 'MEDIA', manufacturer: 'Generic Audio Ltd', driverProvider: 'Generic Audio Ltd', driverVersion: '0.9.1.0', driverDate: '2018-05-02T00:00:00Z', infName: 'oem7.inf', hardwareId: 'USB\\VID_1234&PID_0001', isSigned: false, signer: null, status: 'OK', problemCode: 0, present: true },
      { deviceName: 'Focusrite USB Audio', deviceClass: 'MEDIA', manufacturer: 'Focusrite', driverProvider: 'Focusrite', driverVersion: '4.143.0.0', driverDate: '2025-08-20T00:00:00Z', infName: 'oem3.inf', hardwareId: 'USB\\VID_1235&PID_8211', isSigned: true, signer: 'Focusrite Audio Engineering', status: 'OK', problemCode: 0, present: true },
      { deviceName: 'Speakers (Realtek Audio)', deviceClass: 'AudioEndpoint', manufacturer: 'Microsoft', driverProvider: 'Microsoft', driverVersion: '10.0.22631.1', driverDate: '2024-06-21T00:00:00Z', infName: 'audioendpoint.inf', hardwareId: 'SWD\\MMDEVAPI', isSigned: true, signer: 'Microsoft Windows', status: 'OK', problemCode: 0, present: true }],
      asioDrivers: [
        { name: 'Focusrite USB ASIO', clsid: '{9C5E8E3B-0000-4A5F-9F3A-000000000001}', dllPath: 'C:\\Program Files\\Focusrite\\FocusriteUSBASIO64.dll', dllExists: true, signatureStatus: 'Valid', signer: 'Focusrite Audio Engineering' },
        { name: 'Old Interface ASIO', clsid: '{9C5E8E3B-0000-4A5F-9F3A-000000000002}', dllPath: 'C:\\Program Files\\OldInterface\\oldasio.dll', dllExists: false, signatureStatus: null, signer: null }] }),
    system_scan_events: ({ days }) => { const now = Date.now(); return { supported: true, scannedAt: new Date().toISOString(), days, errors: [], events: [
      ...[1, 5, 26].map(h => ({ log: 'System', provider: 'Service Control Manager', eventId: 7034, level: 'Error', timeCreated: new Date(now - h * 3600e3).toISOString(), message: 'The Windows Audio service terminated unexpectedly. It has done this 1 time(s).', category: 'audio', appName: null, faultingModule: null, exceptionCode: null })),
      { log: 'Application', provider: 'Application Error', eventId: 1000, level: 'Error', timeCreated: new Date(now - 30 * 3600e3).toISOString(), message: 'Faulting application name: Serato DJ Pro.exe, Faulting module name: FocusriteUSBASIO64.dll, Exception code: 0xc0000005', category: 'djApp', appName: 'Serato DJ Pro.exe', faultingModule: 'FocusriteUSBASIO64.dll', exceptionCode: '0xc0000005' }] }; },
    system_scan_dj_logs: () => { const now = Date.now(); return { supported: true, scannedAt: new Date().toISOString(), errors: [], apps: [
      { app: 'Serato DJ Pro', exeNames: ['Serato DJ Pro.exe'], installed: true, locations: [{ path: 'C:\\Users\\dj\\AppData\\Local\\CrashDumps', exists: true }], files: [
        { path: 'C:\\Users\\dj\\AppData\\Local\\CrashDumps\\Serato DJ Pro.exe.4120.dmp', kind: 'crashDump', modified: new Date(now - 30 * 3600e3).toISOString(), sizeBytes: 48234496, matches: [], tail: [] }] },
      { app: 'Traktor Pro', exeNames: ['Traktor.exe'], installed: true, locations: [{ path: 'C:\\Users\\dj\\Documents\\Native Instruments\\Traktor 3.11\\Logs', exists: true }], files: [
        { path: 'C:\\Users\\dj\\Documents\\Native Instruments\\Traktor 3.11\\Logs\\Traktor.log', kind: 'log', modified: new Date(now - 2 * 3600e3).toISOString(), sizeBytes: 182000,
          matches: Array.from({ length: 14 }, (_, i) => ({ lineNo: 100 + i * 7, line: `2026-10-06 21:0${i % 10}:11 [Audio] buffer underrun on ASIO device, ${i + 3} frames late`, severity: 'warning' })), tail: ['21:09:58 [Audio] stream restarted', '21:10:11 [Audio] buffer underrun on ASIO device'] }] },
      { app: 'rekordbox', exeNames: ['rekordbox.exe'], installed: true, locations: [], files: [] },
      { app: 'VirtualDJ', exeNames: ['VirtualDJ.exe'], installed: false, locations: [], files: [] }] }; },
    save_scan_alignment: ({ alignment }) => ({ id: 'al-1', scanAId: 'a', scanBId: 'b' }),
    device_profiles_sync: ({ profiles }) => profiles.map(p => {
      const known = db.deviceProfiles[p.id];
      const productId = `prod-${p.id}`;
      if (!db.catalog.product.some(x => x.id === productId)) db.catalog.product.push({ id: productId, model: p.model, category: p.category });
      let assetId = null;
      if (!known) { assetId = `asset-${p.id}`; db.catalog.asset.push({ id: assetId, productId, nickname: `My ${p.model}` }); }
      db.deviceProfiles[p.id] = { productId, version: 1 };
      return { profileId: p.id, manufacturerId: 'm', productId, version: 1, created: !known, changed: !known, assetId };
    }),
    device_test_result_save: ({ result }) => {
      if (!['pass', 'fail', 'unknown', 'skipped'].includes(result.status)) throw `invalid status ${result.status}`;
      const row = { ...result, id: result.id || `res-${db.deviceResults.length + 1}`, sessionId: db.runs.some(r => r.id === result.sessionId) ? result.sessionId : null, createdAt: new Date(Date.now() + db.deviceResults.length).toISOString() };
      db.deviceResults.unshift(row); return row;
    },
    device_test_results: ({ assetId }) => db.deviceResults.filter(r => !assetId || r.assetId === assetId),
    device_midi_map_save: ({ assetId, profileId, map }) => (db.midiMaps[assetId] = { assetId, profileId, map, updatedAt: new Date().toISOString() }),
    device_midi_map_get: ({ assetId }) => db.midiMaps[assetId] || null,
    midi_list_ports: () => ({ inputs: midiState.ports.map((name, index) => ({ index, name })), outputs: midiState.ports.map((name, index) => ({ index, name })) }),
    midi_open_input: ({ name }) => { if (!midiState.ports.includes(name)) throw `MIDI input not found: ${name}`; midiState.open.push(name); return null; },
    midi_close_input: ({ name }) => { midiState.open = midiState.open.filter(n => n !== name); return null; },
    midi_close_all: () => { midiState.open = []; return null; },
    midi_send: ({ name, bytes }) => { midiState.sent.push({ name, bytes }); return null; },
    midi_status: () => ({ openInputs: midiState.open, openOutputs: [], dropped: 0, emitted: 0 }),
  };
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => { if (!handlers[cmd]) throw `unknown command ${cmd}`; return handlers[cmd](args || {}); } },
    event: { listen: async (name, cb) => { (listeners[name] ||= []).push(cb); return () => { listeners[name] = listeners[name].filter(x => x !== cb); }; } },
  };
  window.__mockDb = db;
  window.__mockMidi = midiState;
  let midiT = 1000;
  window.__emitMidi = bytes => { midiT += 2500; emit('midi-message', [{ port: midiState.open.at(-1) || 'DDJ-S8 MIDI 1', timestampUs: midiT, bytes }]); };
  try {
    if (!('setSinkId' in AudioContext.prototype)) AudioContext.prototype.setSinkId = async () => {};
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: 'audiooutput', deviceId: 'default', label: 'Default' }, { kind: 'audiooutput', deviceId: 'o1', label: 'Speakers' },
      { kind: 'audiooutput', deviceId: 'o2', label: 'USB Interface' }, { kind: 'audioinput', deviceId: 'i1', label: 'Mic' }];
  } catch { /* leave real devices */ }
}

async function systemHealth(page) {
  await page.click('.rail-item[data-screen="system"]');
  await page.waitForSelector('#sys-headline', { timeout: 10000 });
  const text = sel => page.locator(sel).first().innerText();
  const all = await page.locator('#screen-system').innerText();
  check('System: verdict summary renders (problems)', /problem/i.test(await text('#sys-headline')) && await page.locator('#sys-verdict .chip').first().innerText().then(t => /PROBLEMS/.test(t)));
  check('System: verdict card comes before the sections', await page.evaluate(() => document.getElementById('sys-verdict').compareDocumentPosition(document.getElementById('sys-area-drivers')) & Node.DOCUMENT_POSITION_FOLLOWING));
  check('System: code-43 device finding', await page.locator('.sys-finding[data-id*="code-43"]').count() === 1 && /USB port/.test(await text('.sys-finding[data-id*="code-43"]')));
  check('System: unsigned driver finding', await page.locator('.sys-finding[data-id$="-unsigned"]').count() === 1);
  check('System: missing ASIO DLL finding', /missing file/i.test(all) && await page.locator('.sys-finding[data-id$="asio-old-interface-asio-missing"]').count() === 1);
  check('System: driver table lists devices with signed + status chips', await page.locator('#sys-driver-table tbody tr').count() === 4 && /Unsigned/i.test(await text('#sys-driver-table')) && /code 43/i.test(await text('#sys-driver-table')));
  check('System: ASIO table shows missing DLL', /Missing/i.test(await text('#sys-asio-table')));
  check('System: Audiosrv failure grouped (3 events -> 1 finding)', await page.locator('.sys-finding[data-id*="service-control-manager-7034"] .finding-head h3').first().innerText().then(t => /3×/.test(t)));
  await page.locator('.sys-finding[data-id*="service-control-manager-7034"] summary:has-text("Raw events")').click();
  check('System: raw events expander shows rows', await page.locator('.sys-finding[data-id*="service-control-manager-7034"] .sys-details[open] tbody tr').count() === 3);
  check('System: Serato crash dump finding', await page.locator('.sys-app[data-app="Serato DJ Pro"] .sys-finding[data-id$="-crash"]').count() === 1 && /crashed on/.test(await text('.sys-app[data-app="Serato DJ Pro"]')));
  check('System: Traktor underruns -> dropout guidance', /buffer size/.test(await text('.sys-app[data-app="Traktor Pro"] .sys-finding[data-id$="dropouts"]')));
  check('System: rekordbox ok card, VirtualDJ not detected', await page.locator('.sys-app[data-app="rekordbox"] .sys-finding[data-severity="ok"]').count() === 1 && /Not detected: VirtualDJ/.test(all));
  await page.locator('.sys-app[data-app="Traktor Pro"] > .sys-details > summary').focus();
  await page.keyboard.press('Enter');
  check('System: details expander works from keyboard', await page.locator('.sys-app[data-app="Traktor Pro"] details[open] .sys-tail').count() === 1);
  check('System: every finding has meaning + action headings', await page.evaluate(() => [...document.querySelectorAll('.sys-finding')].every(f => /what this means/i.test(f.innerText) && /what to do/i.test(f.innerText))));
  const audit = await a11yAudit(page);
  check('System: a11y names + target sizes', !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
  check('System: scan status line present', /Last scan/.test(await text('#sys-status')));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+e')]);
  const reportPath = await dl.path();
  const report = fs.readFileSync(reportPath, 'utf8');
  check('System: Ctrl+E exports HTML report', /system-health.*\.html$/.test(dl.suggestedFilename()) && /What to do/.test(report) && /Serato DJ Pro crashed/.test(report));
  await page.locator('#sys-rescan-events').click();
  await page.waitForSelector('#sys-rescan-events:not([disabled])');
  check('System: per-area rescan works', await page.locator('.sys-finding[data-id*="service-control-manager-7034"]').count() === 1);
  await page.evaluate(() => { document.getElementById('main').scrollTop = 0; });
  await shot(page, 'system-health-dark');
  await page.screenshot({ path: path.join(SHOTS, 'system-health-full-dark.png'), fullPage: false });
  await setViewport(page, { width: 1440, height: 2400 });
  await page.screenshot({ path: path.join(SHOTS, 'system-health-tall-dark.png') });
  await page.click('#theme-toggle');
  await page.evaluate(() => { document.getElementById('main').scrollTop = 0; });
  await shot(page, 'system-health-tall-light');
  await setViewport(page, { width: 1440, height: 900 });
  await page.evaluate(() => { document.getElementById('main').scrollTop = 0; });
  await shot(page, 'system-health-light');
  await page.click('#theme-toggle');
}

async function desktopMode(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await context.addInitScript(tauriMock);
  const page = await context.newPage();
  const errors = watchConsole(page, 'desktop');
  await page.goto(base);
  await page.waitForSelector('.rail-item');
  await page.waitForFunction(() => document.querySelectorAll('#device-select option').length >= 3);
  check('native device list populated', true);
  await page.click('.rail-item[data-screen="quick"]');
  check('live source selected by default in desktop', (await page.getAttribute('#screen-quick .source[data-source="live"]', 'aria-checked')) === 'true');
  await shot(page, 'quick-setup-desktop-dark');
  await page.click('#quick-to-capture');
  await page.waitForSelector('#screen-quick .step-capture:not([hidden])');
  await page.locator('#screen-quick .btn-record').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(1600);
  check('clip indicator latches', (await page.locator('#screen-quick .clip-lamp.latched').count()) >= 1);
  await shot(page, 'quick-capture-live-dark');
  await page.keyboard.press('Space');
  await page.waitForSelector('#screen-quick .after-capture:not([hidden]) .quality-grid');
  check('capture quality counters shown after stop', true);
  await shot(page, 'quick-capture-quality-dark');
  await page.click('#screen-quick .after-capture .btn-primary');
  await page.waitForSelector('#screen-quick .verdict', { timeout: 20000 });
  check('live capture produces a verdict', true);
  const saved = await page.evaluate(() => window.__mockDb.runs.length);
  check('run saved through save_diagnostic_run with numeric uncertainty', saved === 1);
  const linked = await page.evaluate(() => window.__mockDb.runs[0].findings.some(f => (f.supportedBy || []).length));
  check('findings carry supportedBy metric ids', linked);
  await shot(page, 'quick-results-desktop-dark');
  await page.click('.rail-item[data-screen="calibration"]');
  await page.waitForFunction(() => !document.querySelector('#cal-out-field').hidden, null, { timeout: 5000 }).catch(() => {});
  check('output selector shown when outputs are available', await page.locator('#cal-out-field').isVisible());
  check('output selector lists devices', (await page.locator('#cal-output option').count()) === 3);
  check('calibration Run loopback enabled in desktop', !(await page.locator('#cal-start').isDisabled()));
  await systemHealth(page);
  await devicesDesktop(page);
  await page.click('.rail-item[data-screen="history"]');
  await page.waitForSelector('#hist-rows .run-main');
  await page.locator('#hist-rows .run-main').first().click();
  await page.waitForSelector('#hist-detail .verdict');
  check('history detail via native get_run', true);
  await context.close();
  return errors;
}

export default async function run(ctx) {
  ({ check, ROOT, SHOTS } = ctx);
  PROFILE_IDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'devices', 'index.json'), 'utf8')).profiles;
  const { browser, base, tmp } = ctx;
  const wav = writeToneWav(tmp, {});
  const wav3k = writeToneWav(tmp, { hz: 3150, seconds: 6, name: 'tone-3150.wav' });
  return [
    ...await browserMode(browser, base, wav, wav3k, { dvs: writeDvsWav(tmp), vinyl: writeVinylWav(tmp), loopback: writeLoopbackWav(tmp) }),
    ...await desktopMode(browser, base),
  ];
}
