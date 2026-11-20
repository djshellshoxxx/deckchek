// Exercise the real Devices callbacks through an isolated, persistent browser catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogStore, CATALOG_STORAGE_KEY } from '../app/catalog-store.js';
import { createDevicesScreen } from '../app/ui/screens/devices.js';
import { ensureLibrary, lib } from '../app/ui/devices/library-state.js';
import { settings, store } from '../app/ui/state.js';
import { A, B, STORED_MAP } from './fixtures/learned-map-profile-identity.mjs';
import { deferred, installServiceDom, settle } from './fixtures/service-screen-dom.mjs';

async function mount(t) {
  installServiceDom(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await ensureLibrary();
  const previousLib = { ...lib }, previousUnits = settings.deviceUnits;
  settings.deviceUnits = {};
  const records = new Map();
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, String(value)) };
  const catalog = createCatalogStore({ invoke: null, storage });
  const profiles = structuredClone([A, B]);
  const synced = await catalog.syncDeviceProfiles(profiles, { createAssets: false });
  const products = new Map(synced.map(row => [row.profileId, row.productId]));
  const existing = await catalog.upsert('asset', { id: 'existing-target', productId: products.get(B.id), nickname: 'Existing target unit' });
  const imported = await catalog.upsert('asset', { id: 'imported-unit', productId: products.get(A.id), nickname: 'Imported unit', serialNumber: '123', notes: 'Preserve this note', extra: { preserve: true } });
  await catalog.saveMidiMap(imported.id, A.id, structuredClone(STORED_MAP));
  await catalog.saveDeviceTestResult({ assetId: imported.id, profileId: A.id, testId: 'old-observation', status: 'unknown', detail: { summary: 'Original profile observation' } });
  Object.assign(lib, { ready: true, loading: false, profiles, products, assets: await catalog.list('asset'), results: await catalog.listDeviceTestResults(), problems: [], warnings: {}, error: null, syncError: null });
  t.mock.method(store, 'getMidiMap', id => catalog.getMidiMap(id));
  t.mock.method(store, 'list', (...args) => catalog.list(...args));
  t.mock.method(store, 'listDeviceTestResults', (...args) => catalog.listDeviceTestResults(...args));
  const calls = [];
  let assign = request => catalog.assignDeviceProfile(request);
  t.mock.method(store, 'assignDeviceProfile', request => { calls.push(structuredClone(request)); return assign(request); });
  const section = document.createElement('section');
  document.getElementById('main').append(section);
  const screen = createDevicesScreen(section);
  t.after(() => {
    screen.onHide(); section.hidden = true; section.remove();
    Object.assign(lib, previousLib);
    if (previousUnits === undefined) delete settings.deviceUnits; else settings.deviceUnits = previousUnits;
  });
  section.querySelector(`[data-device="${B.id}"]`).querySelector('.dev-card-main').dispatch('click');
  await settle();
  section.querySelector('#dev-use-unit').dispatch('click');
  const host = section.querySelector('#dev-profile-assignment');
  const select = host.querySelector('#profile-unit'), confirm = host.querySelector('#profile-unit-confirm');
  const choose = () => { select.value = imported.id; select.dispatch('change'); confirm.checked = true; confirm.dispatch('change'); };
  return {
    catalog, storage, products, existing, imported, calls, section, screen, host, select, confirm, choose,
    setAssign: implementation => { assign = implementation; },
    submit: () => host.querySelector('form').dispatch('submit'),
    saved: () => JSON.parse(storage.getItem(CATALOG_STORAGE_KEY)),
  };
}

test('Devices assigns the explicitly selected saved unit, persists it and uses its new profile without rewriting history', async t => {
  const f = await mount(t), before = f.saved();
  f.submit(); assert.equal(f.calls.length, 0);
  f.choose(); f.submit(); f.submit(); await settle();
  assert.deepEqual(f.calls, [{ assetId: f.imported.id, profileId: B.id, productId: f.products.get(B.id), expectedProductId: f.products.get(A.id) }]);
  const saved = f.saved(), asset = saved.catalog.asset.find(row => row.id === f.imported.id);
  const expected = structuredClone(before), updated = expected.catalog.asset.find(row => row.id === f.imported.id);
  updated.productId = f.products.get(B.id); updated.updatedAt = asset.updatedAt;
  assert.deepEqual(saved, expected, 'only the selected asset product association and update time may change');
  assert.deepEqual(lib.assets, await f.catalog.list('asset'), 'the displayed library cache reflects the acknowledged catalog change');
  assert.equal(settings.deviceUnits[B.id], f.imported.id);
  assert.equal(f.section.querySelector('#dev-unit').value, f.imported.id, 'the chosen unit is selected even when another unit was already first');
  assert.equal(f.section.querySelector('h1').textContent, B.model);
  assert.equal(f.section.querySelector('#dev-profile-assignment').hidden, true);
  const map = f.section.querySelector('#dev-midi').textContent;
  assert.match(map, /Current Play/);
  assert.doesNotMatch(map, /Old Play|Old-only control/, 'the saved map from the old profile is retained but is not automatically applied');
  assert.equal(f.host.isConnected, false, 'successful assignment retires the submitted form');
});

test('Devices preserves the form and catalog after a failed assignment, then selects the unit after an explicit retry', async t => {
  const f = await mount(t), before = f.saved(), assets = structuredClone(lib.assets);
  f.setAssign(async () => { throw new Error('Simulated storage write failure'); });
  f.choose(); f.submit(); await settle();
  assert.deepEqual(f.saved(), before); assert.deepEqual(lib.assets, assets);
  assert.equal(settings.deviceUnits[B.id], undefined);
  assert.equal(f.host.isConnected, true);
  assert.equal(f.select.value, f.imported.id); assert.equal(f.select.disabled, false);
  assert.match(f.host.querySelector('#profile-unit-status').textContent, /Simulated storage write failure/);
  f.setAssign(request => f.catalog.assignDeviceProfile(request));
  f.submit(); await settle();
  assert.equal(f.calls.length, 2);
  assert.equal(settings.deviceUnits[B.id], f.imported.id);
  assert.equal(f.section.querySelector('#dev-unit').value, f.imported.id);
});

test('Devices ignores a completion after leaving the screen and reloads the saved association on return', async t => {
  const f = await mount(t), gate = deferred(), assets = structuredClone(lib.assets);
  f.setAssign(async request => { await gate.promise; return f.catalog.assignDeviceProfile(request); });
  f.choose(); f.submit();
  f.screen.onHide(); f.section.hidden = true;
  const hiddenText = f.section.textContent, toasts = document.getElementById('toasts').textContent;
  gate.resolve(); await settle();
  assert.equal((await f.catalog.list('asset')).find(row => row.id === f.imported.id).productId, f.products.get(B.id), 'the already submitted catalog write may finish');
  assert.equal(f.section.textContent, hiddenText);
  assert.equal(document.getElementById('toasts').textContent, toasts);
  assert.equal(settings.deviceUnits[B.id], undefined, 'a retired callback cannot change the current selection');
  assert.deepEqual(lib.assets, assets, 'late completion does not update retired view state');
  f.submit(); assert.equal(f.calls.length, 1, 'retired form handlers cannot submit another request');
  f.section.hidden = false; await f.screen.onShow(); await settle();
  assert.deepEqual(lib.assets, await f.catalog.list('asset'));
  const unit = f.section.querySelector('#dev-unit');
  assert.ok(unit.options.some(option => option.value === f.imported.id), 'reopening Devices reloads the persisted association');
  assert.equal(unit.value, f.existing.id, 'the late assignment does not silently change the chosen unit');
  assert.equal(f.section.querySelector('#dev-profile-assignment').hidden, true);
});
