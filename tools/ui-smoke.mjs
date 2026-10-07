// DeckChek UI smoke test (Playwright, not part of CI).
// Run: NODE_PATH=$(npm root -g) node tools/ui-smoke.mjs
// Serves app/ over HTTP, drives the UI in Chromium (browser mode and a mocked
// Tauri desktop mode), asserts key behaviour and saves screenshots to
// /tmp/deckchek-shots (override with SHOTS_DIR).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodeWav16, generateSine } from '../app/advanced.js';
import { loopbackStimulus } from '../app/calibration.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const SHOTS = process.env.SHOTS_DIR || '/tmp/deckchek-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'";

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = path.join(ROOT, path.normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

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

function watchConsole(page, label) {
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`${label}: ${msg.text()}`); });
  page.on('pageerror', err => errors.push(`${label}: ${err.message}`));
  return errors;
}

// Visible buttons/inputs without an accessible name, and targets below 24px.
async function a11yAudit(page) {
  return page.evaluate(() => {
    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const name = el => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent || el.labels?.[0]?.textContent || el.textContent || el.getAttribute('title') || '').trim();
    const ctrls = [...document.querySelectorAll('button, input:not([type=hidden]), select, textarea, [role=tab], [role=radio]')].filter(visible).filter(el => !el.closest('[inert]') && !el.closest('dialog:not([open])'));
    const unnamed = ctrls.filter(el => !name(el) && !(el.type === 'file')).map(el => el.outerHTML.slice(0, 80));
    const small = ctrls.filter(el => el.type !== 'file' && !el.classList.contains('drop-input')).filter(el => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).map(el => el.outerHTML.slice(0, 80));
    return { unnamed, small };
  });
}

const NAV = ['quick', 'speed', 'cartridge', 'dvs', 'vinyl', 'calibration', 'system', 'equipment', 'history'];

async function shot(page, name) { await page.waitForTimeout(150); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); }

async function browserMode(browser, base, wav, wav3k, extra) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors = watchConsole(page, 'browser');
  await page.goto(base);
  await page.waitForSelector('.rail-item');
  check('rail has 9 nav items', (await page.locator('.rail-item').count()) === 9);
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
  check('System nav sits between Calibration and Equipment', await page.evaluate(() => [...document.querySelectorAll('.rail-item')].map(b => b.dataset.screen).join(',').includes('calibration,system,equipment')));
  await page.keyboard.press('Control+7');
  check('Ctrl+7 opens System Health, Ctrl+8 Equipment', await page.locator('#screen-system').isVisible());
  await page.keyboard.press('Control+8');
  check('Ctrl+8 navigates to Equipment', await page.locator('#screen-equipment').isVisible());
  check('shortcuts help lists Ctrl+1…9', (await page.locator('#helpDialog').innerHTML()).includes('<kbd>9</kbd>'));

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
  check('equipment asset created', (await page.locator('#eq-rows .record-main').first().innerText()).includes('Deck 1'));
  await shot(page, 'equipment-edit-dark');
  await page.locator('#eq-rows .btn-danger-ghost').first().click();
  await page.waitForSelector('#confirm-dialog[open]');
  check('delete asks for confirmation (focus on Cancel)', await page.evaluate(() => document.activeElement?.id === 'confirm-cancel'));
  await page.keyboard.press('Escape');
  check('Esc closes confirm without deleting', (await page.locator('#eq-rows .record-main').count()) === 1);

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
  await page.setViewportSize({ width: 900, height: 700 });
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

// Minimal Tauri mock: catalog/run commands in memory, synthetic live capture.
function tauriMock() {
  const listeners = {};
  const db = { catalog: { manufacturer: [], product: [], asset: [], setup: [], venue: [] }, runs: [] };
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
  };
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => { if (!handlers[cmd]) throw `unknown command ${cmd}`; return handlers[cmd](args || {}); } },
    event: { listen: async (name, cb) => { (listeners[name] ||= []).push(cb); return () => { listeners[name] = listeners[name].filter(x => x !== cb); }; } },
  };
  window.__mockDb = db;
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
  await page.setViewportSize({ width: 1440, height: 2400 });
  await page.screenshot({ path: path.join(SHOTS, 'system-health-tall-dark.png') });
  await page.click('#theme-toggle');
  await page.evaluate(() => { document.getElementById('main').scrollTop = 0; });
  await shot(page, 'system-health-tall-light');
  await page.setViewportSize({ width: 1440, height: 900 });
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
  await page.click('.rail-item[data-screen="history"]');
  await page.waitForSelector('#hist-rows .run-main');
  await page.locator('#hist-rows .run-main').first().click();
  await page.waitForSelector('#hist-detail .verdict');
  check('history detail via native get_run', true);
  await context.close();
  return errors;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deckchek-smoke-'));
  const wav = writeToneWav(tmp, {});
  const wav3k = writeToneWav(tmp, { hz: 3150, seconds: 6, name: 'tone-3150.wav' });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  let errors = [];
  try {
    errors = [...await browserMode(browser, base, wav, wav3k, { dvs: writeDvsWav(tmp), vinyl: writeVinylWav(tmp), loopback: writeLoopbackWav(tmp) }), ...await desktopMode(browser, base)];
  } catch (error) {
    check('smoke run completed without exceptions', false, error.message.split('\n')[0]);
  } finally {
    await browser.close();
    server.close();
  }
  check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${SHOTS}`);
  process.exit(failed.length ? 1 : 0);
}

main();
