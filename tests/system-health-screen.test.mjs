// Real screen and reports with DOM/native seams; no Windows scan or native PDF renderer runs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Element, installServiceDom, settle, deferred } from './fixtures/service-screen-dom.mjs';

const document = installServiceDom({ after });
document.createDocumentFragment = () => document.createElement('fragment');
const NOW = '2026-11-21T14:00:00.000Z';
const payload = extra => ({ supported: true, scannedAt: NOW, errors: [], ...extra });
const clean = () => ({ drivers: payload({ drivers: [], asioDrivers: [] }), events: payload({ days: 14, events: [] }), djLogs: payload({ apps: [] }) });
const COMMAND = { system_scan_drivers: 'drivers', system_scan_events: 'events', system_scan_dj_logs: 'djLogs' };
const printCss = readFileSync(new URL('../app/report-print.css', import.meta.url), 'utf8');
const button = (root, label) => [...root.querySelectorAll('button')].find(el => el.textContent.trim() === label);

async function mount(t, { scans = clean(), native = true } = {}) {
  for (const id of ['toasts', 'sr-polite', 'sr-assertive']) document.getElementById(id).replaceChildren();
  t.mock.method(globalThis, 'setTimeout', () => 0);
  t.mock.method(globalThis, 'setInterval', () => 0);
  const oldClick = Element.prototype.click, oldBridge = window.__TAURI__;
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const globalBridge = Object.getOwnPropertyDescriptor(globalThis, '__TAURI__');
  delete globalThis.__TAURI__;
  const calls = [], downloads = [], rendered = [], destinations = [], blobs = new Map();
  t.mock.method(URL, 'createObjectURL', blob => { const url = `blob:system-test-${blobs.size}`; blobs.set(url, blob); return url; });
  Element.prototype.click = function () { if (this.tagName === 'A') downloads.push({ name: this.download, blob: blobs.get(this.href) }); else this.dispatch('click'); };
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Windows test seam', language: 'en-US' }, configurable: true });
  globalThis.fetch = async () => ({ ok: true, text: async () => printCss, json: async () => ({ profiles: [] }) });
  const { resetPdfBackendState } = await import('../app/report-pdf.js'); resetPdfBackendState();
  if (native) window.__TAURI__ = {
    app: { getVersion: async () => 'test' },
    dialog: { save: async options => { destinations.push(options.defaultPath); return '/tmp/system-health-test.pdf'; } },
    core: { invoke: async (command, args) => {
      if (command === 'pdf_render') { rendered.push(args.html); return { path: args.destPath, pages: 1 }; }
      const area = COMMAND[command]; assert.ok(area, `unexpected command ${command}`); calls.push({ area, args });
      const result = scans[area]; if (result instanceof Error) throw result;
      return typeof result === 'function' ? result(args) : result;
    } },
  }; else delete window.__TAURI__;
  const section = document.createElement('section'); document.body.append(section);
  const { createSystemScreen } = await import('../app/ui/screens/system.js');
  const screen = createSystemScreen(section);
  t.after(() => {
    screen.dispose(); section.remove(); resetPdfBackendState();
    if (oldClick) Element.prototype.click = oldClick; else delete Element.prototype.click;
    if (oldBridge) window.__TAURI__ = oldBridge; else delete window.__TAURI__;
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
    if (globalBridge) Object.defineProperty(globalThis, '__TAURI__', globalBridge); else delete globalThis.__TAURI__;
  });
  screen.onShow(); await settle();
  return { section, screen, scans, calls, downloads, rendered, destinations, q: selector => section.querySelector(selector) };
}

test('System Health screen calls all three scans and shows HEALTHY only after complete clean coverage', async t => {
  const f = await mount(t);
  assert.deepEqual(f.calls.map(x => x.area), ['drivers', 'events', 'djLogs']);
  assert.match(f.q('#sys-verdict').textContent, /HEALTHY/);
  assert.equal(f.q('#sys-coverage').textContent, '3 of 3 scan areas complete.');
  assert.equal(f.q('#sys-export').disabled, false);
});

for (const area of ['drivers', 'events', 'djLogs']) {
  test(`System Health screen retains failed ${area} coverage and repairs it through the actual Retry control`, async t => {
    const scans = clean(); scans[area] = new Error('This scan could not finish.');
    const f = await mount(t, { scans });
    assert.match(f.q('#sys-verdict').textContent, /INCOMPLETE/);
    assert.doesNotMatch(f.q('#sys-verdict').textContent, /HEALTHY|No problems found/);
    assert.match(f.q('#sys-coverage').textContent, /2 of 3 scan areas complete; 1 failed/);
    assert.equal(f.q('#sys-export').disabled, false);
    scans[area] = clean()[area]; button(f.q(`#sys-area-${area}`), 'Retry').dispatch('click'); await settle();
    assert.match(f.q('#sys-verdict').textContent, /HEALTHY/);
    assert.equal(f.q('#sys-coverage').textContent, '3 of 3 scan areas complete.');
    assert.equal(f.calls.filter(call => call.area === area).length, 2);
  });
}

for (const area of ['drivers', 'events', 'djLogs']) {
  test(`System Health screen keeps partial ${area} collection visible without an all-clear finding`, async t => {
    const scans = clean(); scans[area].errors.push('Some requested data could not be collected.');
    const f = await mount(t, { scans });
    assert.match(f.q('#sys-verdict').textContent, /INCOMPLETE/);
    assert.match(f.q('#sys-coverage').textContent, /2 of 3 scan areas complete; 1 incomplete/);
    assert.match(f.q(`#sys-area-${area}`).textContent, /Some requested data could not be collected/);
    assert.equal(f.q(`#sys-area-${area}`).querySelector('[data-severity="ok"]'), null);
    f.screen.onExport(); assert.equal(f.downloads.length, 1);
    assert.match(await f.downloads[0].blob.text(), /2 of 3 scan areas complete; 1 incomplete/);
  });
}

test('System Health screen shows mixed unsupported coverage while retaining successful areas', async t => {
  const scans = clean(); scans.events.supported = false;
  const f = await mount(t, { scans });
  assert.match(f.q('#sys-verdict').textContent, /INCOMPLETE/);
  assert.match(f.q('#sys-coverage').textContent, /2 of 3 scan areas complete; 1 unavailable here/);
  assert.match(f.q('#sys-area-events').textContent, /unavailable here/);
  assert.equal(f.q('#sys-area-events').querySelector('[data-severity="ok"]'), null);
});

test('System Health screen reports all unsupported scans as unavailable instead of healthy', async t => {
  const scans = clean(); for (const scan of Object.values(scans)) scan.supported = false;
  const f = await mount(t, { scans });
  assert.ok(f.q('#sys-unsupported')); assert.equal(f.q('#sys-verdict'), null);
  assert.match(f.section.textContent, /nothing was scanned/); assert.equal(f.q('#sys-export').disabled, true);
  f.screen.onExport(); assert.equal(f.downloads.length, 0);
});

test('System Health browser preview performs no scan and remains informational', async t => {
  const f = await mount(t, { native: false });
  assert.ok(f.q('#sys-unsupported')); assert.equal(f.q('#sys-run').disabled, true);
  assert.equal(f.calls.length, 0); assert.equal(f.q('#sys-verdict'), null);
});

test('System Health screen keeps a real driver problem above incomplete collection coverage', async t => {
  const scans = clean(); scans.events = new Error('Event collection failed.');
  scans.drivers.drivers.push({ deviceName: 'Test interface', problemCode: 43, present: true, status: 'Error' });
  const f = await mount(t, { scans });
  assert.match(f.q('#sys-verdict').textContent, /PROBLEMS/);
  assert.match(f.q('#sys-headline').textContent, /1 problem/);
  assert.match(f.q('#sys-coverage').textContent, /2 of 3 scan areas complete; 1 failed/);
  assert.match(f.q('#sys-area-drivers').textContent, /code 43/);
});

test('System Health pending Retry coalesces clicks and blocks exports and event-period replacement', async t => {
  const scans = clean(); scans.events = new Error('Event collection failed.');
  const f = await mount(t, { scans }), pending = deferred();
  scans.events = () => pending.promise;
  const retry = button(f.q('#sys-area-events'), 'Retry'); retry.dispatch('click'); retry.dispatch('click');
  assert.equal(f.calls.filter(call => call.area === 'events').length, 2);
  assert.match(f.q('#sys-verdict').textContent, /SCANNING/);
  assert.equal(f.q('#sys-days').disabled, true); assert.equal(f.q('#sys-export').disabled, true);
  f.screen.onExport(); assert.equal(f.downloads.length, 0);
  pending.resolve(clean().events); await settle();
  assert.equal(f.q('#sys-days').disabled, false); assert.match(f.q('#sys-verdict').textContent, /HEALTHY/);
});

test('System Health three failed scans retain an exportable incomplete result', async t => {
  const scans = Object.fromEntries(['drivers', 'events', 'djLogs'].map(area => [area, new Error('Collection failed.')]));
  const f = await mount(t, { scans });
  assert.match(f.q('#sys-verdict').textContent, /INCOMPLETE/);
  assert.match(f.q('#sys-coverage').textContent, /0 of 3 scan areas complete; 3 failed/);
  assert.equal(f.q('#sys-export').disabled, false);
  f.screen.onExport(); assert.equal(f.downloads.length, 1);
  const html = await f.downloads[0].blob.text();
  assert.match(html, /System Health scan is incomplete/); assert.match(html, /0 of 3 scan areas complete; 3 failed/);
  assert.equal((html.match(/<td>Failed<\/td>/g) || []).length, 3);
});

test('System Health actual HTML and PDF actions retain the same failed-area coverage', async t => {
  const scans = clean(); scans.events = new Error('Event collection failed.');
  const f = await mount(t, { scans });
  f.q('#sys-export').dispatch('click'); f.q('#sys-export-pdf').dispatch('click'); await settle();
  assert.equal(f.downloads.length, 1); assert.equal(f.rendered.length, 1); assert.equal(f.destinations.length, 1);
  for (const html of [await f.downloads[0].blob.text(), f.rendered[0]]) {
    assert.match(html, /System Health scan is incomplete/);
    assert.match(html, /2 of 3 scan areas complete; 1 failed/);
    assert.match(html, /Windows event logs<\/th><td>Failed<\/td>/);
  }
  assert.match(document.getElementById('toasts').textContent, /saved as PDF/);
  assert.equal(f.q('#sys-export-pdf').disabled, false);
});

test('System Health disposal retires a pending scan and export callbacks', async t => {
  const pending = deferred(), scans = clean(); scans.events = () => pending.promise;
  const f = await mount(t, { scans });
  assert.match(f.q('#sys-verdict').textContent, /SCANNING/);
  const before = f.q('#sys-body').firstElementChild;
  f.screen.dispose(); pending.resolve(clean().events); await settle(); f.screen.onExport();
  assert.equal(f.q('#sys-body').firstElementChild, before);
  assert.match(f.q('#sys-verdict').textContent, /SCANNING/);
  assert.equal(f.downloads.length, 0); assert.equal(f.rendered.length, 0);
  assert.equal(document.getElementById('toasts').textContent, '');
});

test('System Health a replacement scan retires pending PDF preparation and keeps exports disabled', async t => {
  const f = await mount(t), pending = deferred();
  f.scans.events = () => pending.promise;
  f.q('#sys-export-pdf').dispatch('click'); f.q('#sys-rescan-events').dispatch('click'); await settle();
  assert.equal(f.destinations.length, 0); assert.equal(f.rendered.length, 0);
  assert.equal(f.q('#sys-export').disabled, true); assert.equal(f.q('#sys-export-pdf').disabled, true);
  assert.doesNotMatch(document.getElementById('toasts').textContent, /saved as PDF/);
  pending.resolve(clean().events); await settle();
  assert.match(f.q('#sys-verdict').textContent, /HEALTHY/);
  assert.equal(f.q('#sys-export-pdf').disabled, false);
});

test('System Health an invalid native response remains a failed area with an actual Retry action', async t => {
  const scans = clean(); scans.events = null;
  const f = await mount(t, { scans });
  assert.match(f.q('#sys-verdict').textContent, /INCOMPLETE/);
  assert.match(f.q('#sys-coverage').textContent, /2 of 3 scan areas complete; 1 failed/);
  assert.match(f.q('#sys-area-events').textContent, /invalid response/);
  scans.events = clean().events; button(f.q('#sys-area-events'), 'Retry').dispatch('click'); await settle();
  assert.match(f.q('#sys-verdict').textContent, /HEALTHY/);
});

test('diagnostics actual health collection retains failed coverage in the native context', async t => {
  const scans = clean(); scans.events = new Error('Event collection failed.');
  await mount(t, { scans });
  const invoke = window.__TAURI__.core.invoke, previews = [];
  window.__TAURI__.core.invoke = async (command, args) => {
    if (command === 'diagnostics_preview') { previews.push(args.opts.context); return { parts: [], summaryText: '' }; }
    return invoke(command, args);
  };
  const { openDiagnosticsDialog } = await import('../app/ui/screens/support-dialog.js');
  const done = openDiagnosticsDialog(), dialog = document.querySelector('dialog');
  t.after(() => dialog.close()); await settle();
  const include = dialog.querySelector('#diag-health'); include.checked = true; include.dispatch('change'); await settle();
  const health = previews.at(-1).systemHealth;
  assert.ok(health); assert.equal(health.summary.status, 'warn');
  assert.equal(health.coverage.counts.failed, 1); assert.equal(health.coverage.completed, 2);
  assert.equal(health.coverage.areas.find(area => area.area === 'events').state, 'failed');
  assert.ok(health.findings.every(finding => finding.area && finding.scanState === 'complete'));
  button(dialog, 'Cancel').dispatch('click'); await done;
});

test('System Health toast PDF Retry retains busy ownership and restores controls for an intervening scan', async t => {
  const f = await mount(t), pdf = deferred(), scan = deferred();
  const invoke = window.__TAURI__.core.invoke; let attempts = 0;
  window.__TAURI__.core.invoke = async (command, args) => {
    if (command !== 'pdf_render') return invoke(command, args);
    attempts++;
    if (attempts === 1) throw { code: 'timeout', message: 'The renderer did not finish.' };
    assert.equal(attempts, 2); return pdf.promise;
  };
  f.q('#sys-export-pdf').dispatch('click'); await settle();
  const retry = button(document.getElementById('toasts'), 'Retry'); assert.ok(retry);
  retry.dispatch('click'); await settle();
  assert.equal(attempts, 2); assert.equal(f.q('#sys-export-pdf').disabled, true);
  f.screen.onShow(); assert.equal(f.q('#sys-export-pdf').disabled, true);
  f.scans.events = () => scan.promise; f.q('#sys-rescan-events').dispatch('click');
  pdf.resolve({ path: '/tmp/system-health-test.pdf', pages: 1 }); await settle();
  assert.equal(f.q('#sys-export').disabled, true); assert.equal(f.q('#sys-export-pdf').disabled, true);
  assert.doesNotMatch(document.getElementById('toasts').textContent, /saved as PDF/);
  scan.resolve(clean().events); await settle();
  assert.equal(f.q('#sys-export-pdf').disabled, false);
});
