import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogStore } from '../app/catalog-store.js';
import { validateProfile } from '../app/devices/library.js';
import { createDevicesScreen } from '../app/ui/screens/devices.js';
import { ensureLibrary, lib } from '../app/ui/devices/library-state.js';
import { settings, store } from '../app/ui/state.js';
import { takeHandoff } from '../app/ui/crosslinks.js';
import { installServiceDom, settle } from './fixtures/service-screen-dom.mjs';

// Real Devices/default bridge/evaluator/saveResult/browser-catalog path. The
// DOM, native response and storage are modeled; this is not a hardware session
// or a claim that a bundled driver check currently lacks a pass criterion.
async function mount(t, { scan, classCompliant = false } = {}) {
  installServiceDom(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await ensureLibrary();
  const previousLib = { ...lib }, previousUnits = settings.deviceUnits;
  const profile = {
    schemaVersion: 1, id: 'outcome-profile', manufacturer: 'Fixture', model: 'Outcome unit', category: 'controller',
    summary: 'Modeled driver-check configuration without a pass criterion or driver definition.', documents: [],
    connectivity: { usb: { classCompliant } }, drivers: [], specs: [],
    tests: [{ id: 'driver-scan', title: 'Check driver', method: 'driver:check', category: 'driver', steps: ['Run the driver scan.'], equipment: [], pass: null }],
  };
  assert.deepEqual(validateProfile(profile), { ok: true, errors: [], warnings: [] });
  const records = new Map();
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, String(value)) };
  const catalog = createCatalogStore({ invoke: null, storage });
  const synced = await catalog.syncDeviceProfiles([profile], { createAssets: false });
  const products = new Map(synced.map(row => [row.profileId, row.productId]));
  const asset = await catalog.upsert('asset', { productId: products.get(profile.id), nickname: 'Saved unit' });
  const historical = await catalog.saveDeviceTestResult({ assetId: asset.id, profileId: profile.id, testId: 'driver-scan', status: 'pass', detail: { summary: 'Historical result stays unchanged.' } });
  const historicalJson = JSON.stringify(historical), writes = [], nativeCalls = [];
  Object.assign(lib, { ready: true, loading: false, profiles: [profile], products, assets: [asset], results: [historical], problems: [], warnings: {}, error: null, syncError: null });
  settings.deviceUnits = { [profile.id]: asset.id };
  t.mock.method(store, 'list', (...args) => catalog.list(...args));
  t.mock.method(store, 'listDeviceTestResults', (...args) => catalog.listDeviceTestResults(...args));
  t.mock.method(store, 'saveDeviceTestResult', async input => {
    writes.push(structuredClone(input));
    return catalog.saveDeviceTestResult(input);
  });
  window.__TAURI__ = { core: { invoke: async command => {
    nativeCalls.push(command);
    assert.equal(command, 'system_scan_drivers');
    return scan;
  } } };
  const section = document.createElement('section');
  document.getElementById('main').append(section);
  const screen = createDevicesScreen(section);
  takeHandoff('devices');
  t.after(() => {
    screen.onHide(); section.remove(); takeHandoff('devices');
    Object.assign(lib, previousLib);
    if (previousUnits === undefined) delete settings.deviceUnits; else settings.deviceUnits = previousUnits;
  });
  await screen.onShow();
  section.querySelector(`[data-device="${profile.id}"]`).querySelector('.dev-card-main').dispatch('click');
  section.querySelector('[data-run-test="driver-scan"]').dispatch('click');
  const button = section.querySelector('#dev-scan-run');
  assert.ok(button);
  assert.equal(button.disabled, false);
  return { section, writes, nativeCalls, asset, profile, historical, historicalJson, catalog,
    async scan() { button.dispatch('click'); await settle(); },
    async assertHistoryPreserved() {
      const rows = await catalog.listDeviceTestResults(asset.id);
      assert.equal(JSON.stringify(rows.find(row => row.id === historical.id)), historicalJson);
      return rows;
    } };
}

test('a supported scan without a driver definition saves UNKNOWN through the actual Devices screen', async t => {
  const f = await mount(t, { scan: { supported: true, scannedAt: '2026-11-20T12:00:00Z', drivers: [], asioDrivers: [], errors: [] } });
  await f.scan();
  assert.deepEqual(f.nativeCalls, ['system_scan_drivers']);
  assert.equal(f.writes.length, 1);
  const rows = await f.assertHistoryPreserved();
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.id !== f.historical.id).status, 'unknown', 'persisted browser-catalog status');
  assert.equal(f.writes[0].status, 'unknown', 'status supplied by the Devices finish handler');
  assert.equal(f.writes[0].detail.criterion, 'evidence');
  assert.equal(f.writes[0].detail.measurements.length, 4);
  assert.ok(f.writes[0].detail.measurements.every(reading => reading.value === null));
  assert.equal(f.writes[0].detail.findings[0].id, 'driver-no-profile');
  assert.match(f.section.querySelector('#dev-run-result').textContent, /Saved: REVIEW/);
});

test('an explicit class-compliant OK finding still saves PASS through the actual Devices screen', async t => {
  const f = await mount(t, { classCompliant: true, scan: { supported: true, drivers: [], asioDrivers: [] } });
  await f.scan();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].status, 'pass');
  assert.equal(f.writes[0].detail.findings[0].severity, 'ok');
  assert.equal((await f.assertHistoryPreserved()).length, 2);
  assert.match(f.section.querySelector('#dev-run-result').textContent, /Saved: PASS/);
});

for (const [label, scan] of [['null', null], ['undefined', undefined], ['unsupported', { supported: false }]]) {
  test(`the default bridge and screen do not save an unavailable ${label} native scan`, async t => {
    const f = await mount(t, { scan });
    await f.scan();
    assert.deepEqual(f.nativeCalls, ['system_scan_drivers']);
    assert.equal(f.writes.length, 0);
    assert.equal((await f.assertHistoryPreserved()).length, 1);
    assert.equal(f.section.querySelector('#dev-run-result').textContent, '');
    assert.equal(f.section.querySelector('#dev-scan-run').disabled, false);
  });
}
