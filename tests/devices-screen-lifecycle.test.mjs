import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevicesScreen } from '../app/ui/screens/devices.js';
import { ensureLibrary, refreshUnits, lib } from '../app/ui/devices/library-state.js';
import { navigateTo, takeHandoff } from '../app/ui/crosslinks.js';
import { emit, settings, store } from '../app/ui/state.js';
import { A, B } from './fixtures/learned-map-profile-identity.mjs';
import { deferred, installServiceDom, settle } from './fixtures/service-screen-dom.mjs';

async function mount(t) {
  installServiceDom(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await ensureLibrary();
  const previousLib = { ...lib }, previousUnits = settings.deviceUnits;
  const profiles = structuredClone([A, B]);
  const products = new Map([[A.id, 'product-a'], [B.id, 'product-b']]);
  const assets = [
    { id: 'unit-a', productId: 'product-a', nickname: 'Unit A' },
    { id: 'unit-b', productId: 'product-b', nickname: 'Unit B' },
  ];
  settings.deviceUnits = {};
  Object.assign(lib, { ready: true, loading: false, profiles, products, assets, results: [], problems: [], warnings: {}, error: null, syncError: null });
  let readAssets = async () => structuredClone(assets), readResults = async () => [];
  const reads = { assets: 0, results: 0 };
  t.mock.method(store, 'list', entity => {
    assert.equal(entity, 'asset'); reads.assets++;
    return readAssets();
  });
  t.mock.method(store, 'listDeviceTestResults', () => { reads.results++; return readResults(); });
  t.mock.method(store, 'getMidiMap', async () => null);
  const section = document.createElement('section');
  document.getElementById('main').append(section);
  const screen = createDevicesScreen(section);
  takeHandoff('devices');
  t.after(() => {
    screen.onHide(); section.hidden = true; section.remove(); takeHandoff('devices');
    Object.assign(lib, previousLib);
    if (previousUnits === undefined) delete settings.deviceUnits; else settings.deviceUnits = previousUnits;
  });
  const hide = () => { screen.onHide(); section.hidden = true; };
  const show = () => { section.hidden = false; return screen.onShow(); };
  return { screen, section, profiles, products, assets, reads, hide, show,
    setAssetRead: fn => { readAssets = fn; }, setResultRead: fn => { readResults = fn; } };
}

function inspector(text) {
  document.getElementById('inspector-title').textContent = text;
  document.getElementById('inspector-body').textContent = `${text} body`;
}

function assertInspector(text) {
  assert.equal(document.getElementById('inspector-title').textContent, text);
  assert.equal(document.getElementById('inspector-body').textContent, `${text} body`);
}

test('a current Devices show refreshes the library and displays its guide', async t => {
  const f = await mount(t);
  const current = f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} updated` }));
  f.setAssetRead(async () => current);
  await f.show();
  assert.deepEqual(f.reads, { assets: 1, results: 1 });
  assert.deepEqual(lib.assets, current);
  assert.match(f.section.textContent, /Unit A updated/);
  assert.equal(document.getElementById('inspector-title').textContent, 'Devices guide');
});

test('leaving Devices while the library loads prevents a second refresh and late inspector updates', async t => {
  const f = await mount(t), loading = deferred();
  t.mock.method(globalThis, 'fetch', () => loading.promise);
  t.mock.method(store, 'syncDeviceProfiles', async () => []);
  const library = ensureLibrary({ force: true });
  const showing = f.show();
  f.hide(); inspector('Current measurement');
  loading.resolve({ ok: true, json: async () => ({ profiles: [] }) });
  await library; await showing;
  assertInspector('Current measurement');
  assert.deepEqual(f.reads, { assets: 1, results: 1 }, 'only the shared library load refreshes; the retired show must not start another read');
});

test('a Devices asset read cannot update the library or inspector after leaving', async t => {
  const f = await mount(t), pending = deferred(), before = structuredClone(lib.assets);
  f.setAssetRead(() => pending.promise);
  const showing = f.show(); await settle();
  assert.equal(f.reads.assets, 1);
  f.hide(); inspector('Current measurement');
  const hiddenText = f.section.textContent;
  pending.resolve([{ id: 'late', productId: 'product-a', nickname: 'Late unit' }]);
  await showing;
  assertInspector('Current measurement');
  assert.equal(f.section.textContent, hiddenText);
  assert.deepEqual(lib.assets, before);
  assert.equal(f.reads.results, 0, 'retired asset read must not start another result read');
});

test('a Devices result read cannot replace a newer show or its current assignment form', async t => {
  const f = await mount(t), old = deferred();
  f.setResultRead(() => old.promise);
  const first = f.show(); await settle();
  assert.equal(f.reads.results, 1);
  f.hide();
  const currentResults = [{ id: 'current', assetId: 'unit-b', profileId: B.id, testId: 'observation', status: 'unknown' }];
  f.setResultRead(async () => currentResults);
  await f.show();
  f.section.querySelector(`[data-device="${B.id}"]`).querySelector('.dev-card-main').dispatch('click');
  f.section.querySelector('#dev-use-unit').dispatch('click');
  const form = f.section.querySelector('#dev-profile-assignment').querySelector('form');
  inspector('Current unit details');
  old.resolve([{ id: 'old', assetId: 'unit-a', profileId: A.id, testId: 'observation', status: 'pass' }]);
  await first;
  assert.deepEqual(lib.results, currentResults);
  assert.equal(form.isConnected, true, 'late show must not re-render and discard the new form');
  assertInspector('Current unit details');
});

test('overlapping Devices shows keep the newest asset snapshot and view when the older read finishes last', async t => {
  const f = await mount(t), old = deferred();
  f.setAssetRead(() => old.promise);
  const first = f.show(); await settle(); f.hide();
  const currentAssets = f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} current` }));
  f.setAssetRead(async () => currentAssets);
  await f.show();
  const grid = f.section.querySelector('#dev-grid');
  inspector('Current unit details');
  old.resolve(f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} old` })));
  await first;
  assert.deepEqual(lib.assets, currentAssets);
  assert.ok(f.section.querySelector('#dev-grid') === grid, 'retired show must preserve the current grid');
  assert.match(f.section.textContent, /Unit A current/);
  assertInspector('Current unit details');
});

test('a handoff survives a retired Devices show and is consumed once by the current show', async t => {
  const f = await mount(t), old = deferred();
  navigateTo('devices', { assetId: 'unit-b' });
  f.setAssetRead(() => old.promise);
  const first = f.show(); await settle(); f.hide();
  inspector('Other screen');
  old.resolve(structuredClone(f.assets)); await first;
  assert.equal(settings.deviceUnits[B.id], undefined, 'retired show must not select the requested unit');
  assertInspector('Other screen');
  f.setAssetRead(async () => structuredClone(f.assets));
  await f.show();
  assert.equal(f.section.querySelector('h1').textContent, B.model);
  assert.equal(settings.deviceUnits[B.id], 'unit-b');
  assert.equal(takeHandoff('devices'), null, 'current show consumes the handoff exactly once');
});

test('a newer Devices handoff wins when shows overlap', async t => {
  const f = await mount(t), old = deferred();
  navigateTo('devices', { assetId: 'unit-a' });
  f.setAssetRead(() => old.promise);
  const first = f.show(); await settle(); f.hide();
  navigateTo('devices', { assetId: 'unit-b' });
  f.setAssetRead(async () => structuredClone(f.assets));
  await f.show();
  const currentHeading = f.section.querySelector('h1');
  old.resolve(structuredClone(f.assets)); await first;
  assert.ok(f.section.querySelector('h1') === currentHeading, 'retired handoff must preserve the current heading');
  assert.equal(currentHeading.textContent, B.model);
  assert.equal(settings.deviceUnits[A.id], undefined);
  assert.equal(settings.deviceUnits[B.id], 'unit-b');
});

for (const field of ['assets', 'results']) {
  test(`a rejected retired ${field} read cannot clear the current Devices cache`, async t => {
    const f = await mount(t), old = deferred();
    if (field === 'assets') f.setAssetRead(() => old.promise);
    else f.setResultRead(() => old.promise);
    const first = f.show(); await settle(); f.hide();
    const currentAssets = f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} current` }));
    const currentResults = [{ id: 'current', assetId: 'unit-b', profileId: B.id, testId: 'observation', status: 'unknown' }];
    f.setAssetRead(async () => currentAssets); f.setResultRead(async () => currentResults);
    await f.show(); inspector('Current unit details');
    old.reject(new Error('Retired read failed')); await first;
    assert.deepEqual(lib.assets, currentAssets);
    assert.deepEqual(lib.results, currentResults);
    assertInspector('Current unit details');
  });
}

test('default refresh callers retain successful reads and empty-cache failure behavior', async t => {
  const f = await mount(t);
  const results = [{ id: 'current', assetId: 'unit-a', profileId: A.id, testId: 'observation', status: 'unknown' }];
  f.setResultRead(async () => results);
  await refreshUnits();
  assert.deepEqual(lib.assets, f.assets); assert.deepEqual(lib.results, results);
  f.setAssetRead(async () => { throw new Error('Current asset read failed'); });
  f.setResultRead(async () => { throw new Error('Current result read failed'); });
  await refreshUnits();
  assert.deepEqual(lib.assets, []); assert.deepEqual(lib.results, []);
});

for (const field of ['assets', 'results']) {
  for (const reject of [false, true]) {
    test(`an older default ${field} ${reject ? 'failure' : 'response'} cannot replace a newer complete library snapshot`, async t => {
      const f = await mount(t), old = deferred();
      if (field === 'assets') f.setAssetRead(() => old.promise);
      else f.setResultRead(() => old.promise);
      const first = refreshUnits(); await settle();
      const assets = f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} current` }));
      const results = [{ id: 'current', assetId: 'unit-b', profileId: B.id, testId: 'observation', status: 'unknown' }];
      f.setAssetRead(async () => assets); f.setResultRead(async () => results);
      await refreshUnits();
      if (reject) old.reject(new Error('Older read failed'));
      else old.resolve(field === 'assets' ? f.assets : []);
      await first;
      assert.deepEqual(lib.assets, assets, 'a newer complete asset snapshot stays current');
      assert.deepEqual(lib.results, results, 'results remain paired with that asset snapshot');
    });
  }
}

test('a retired newer view read does not discard a still-current default refresh', async t => {
  const f = await mount(t), old = deferred();
  const assets = f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} refreshed` }));
  f.setAssetRead(() => old.promise);
  const first = refreshUnits(); await settle();
  f.setAssetRead(async () => []);
  await refreshUnits({ isCurrent: () => false });
  old.resolve(assets); await first;
  assert.deepEqual(lib.assets, assets, 'the retired view never published a newer snapshot');
});

for (const reject of [false, true]) {
  test(`a catalog refresh ${reject ? 'failure' : 'response'} from an earlier Devices visit preserves the current assignment form`, async t => {
    const f = await mount(t); await f.show();
    const old = deferred();
    f.setAssetRead(() => old.promise);
    emit('catalog'); await settle(); f.hide();
    const assets = f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} current` }));
    const results = [{ id: 'current', assetId: 'unit-b', profileId: B.id, testId: 'observation', status: 'unknown' }];
    f.setAssetRead(async () => assets); f.setResultRead(async () => results);
    await f.show();
    f.section.querySelector(`[data-device="${B.id}"]`).querySelector('.dev-card-main').dispatch('click');
    f.section.querySelector('#dev-use-unit').dispatch('click');
    const form = f.section.querySelector('#dev-profile-assignment').querySelector('form');
    const input = form.querySelector('select'); input.focus();
    inspector('Current assignment');
    if (reject) old.reject(new Error('Earlier catalog read failed'));
    else old.resolve(f.assets);
    await settle();
    assert.deepEqual(lib.assets, assets);
    assert.deepEqual(lib.results, results);
    assert.equal(form.isConnected, true, 'the old catalog completion does not rebuild the current view');
    assert.equal(document.activeElement, input);
    assertInspector('Current assignment');
  });
}

test('a catalog refresh started before opening an assignment updates the cache without discarding that form', async t => {
  const f = await mount(t); await f.show();
  f.section.querySelector(`[data-device="${B.id}"]`).querySelector('.dev-card-main').dispatch('click');
  const pending = deferred();
  f.setAssetRead(() => pending.promise);
  emit('catalog'); await settle();
  f.section.querySelector('#dev-use-unit').dispatch('click');
  const form = f.section.querySelector('#dev-profile-assignment').querySelector('form');
  const input = form.querySelector('select'); input.focus();
  const assets = f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} refreshed` }));
  pending.resolve(assets); await settle();
  assert.deepEqual(lib.assets, assets, 'the shared cache still receives the completed catalog read');
  assert.equal(form.isConnected, true, 'a later interaction owns the current form');
  assert.equal(document.activeElement, input);
});

test('a catalog refresh updates an unchanged current Devices view', async t => {
  const f = await mount(t); await f.show();
  const assets = f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} catalog` }));
  f.setAssetRead(async () => assets);
  emit('catalog'); await settle();
  assert.deepEqual(lib.assets, assets);
  assert.match(f.section.textContent, /Unit A catalog/);
});

test('the latest overlapping catalog event redraws after an earlier refresh completes first', async t => {
  const f = await mount(t); await f.show();
  const first = deferred(), latest = deferred();
  f.setAssetRead(() => first.promise);
  emit('catalog'); await settle();
  f.setAssetRead(() => latest.promise);
  emit('catalog'); await settle();
  first.resolve(f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} earlier` })));
  await settle();
  const assets = f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} latest` }));
  latest.resolve(assets); await settle();
  assert.deepEqual(lib.assets, assets);
  assert.match(f.section.textContent, /Unit A latest/);
  assert.doesNotMatch(f.section.textContent, /Unit A earlier/);
});

test('a removed Devices screen does not start a catalog refresh', async t => {
  const f = await mount(t);
  f.hide(); f.section.remove();
  emit('catalog'); await settle();
  assert.deepEqual(f.reads, { assets: 0, results: 0 });
});

test('a connected hidden Devices screen refreshes shared catalog data without changing the active view', async t => {
  const f = await mount(t); await f.show(); f.hide();
  const content = f.section.firstElementChild, hiddenText = f.section.textContent;
  const otherControl = document.createElement('button');
  document.getElementById('main').append(otherControl); otherControl.focus();
  inspector('Current workflow');
  const assets = f.assets.map(asset => ({ ...asset, nickname: `${asset.nickname} hidden refresh` }));
  const results = [{ id: 'hidden-result', assetId: 'unit-a', profileId: A.id, testId: 'observation', status: 'unknown' }];
  f.setAssetRead(async () => assets); f.setResultRead(async () => results);
  emit('catalog'); await settle();
  assert.deepEqual(lib.assets, assets, 'other consumers receive the hidden screen\'s completed catalog read');
  assert.deepEqual(lib.results, results);
  assert.equal(f.section.firstElementChild, content, 'the hidden view is not rebuilt');
  assert.equal(f.section.textContent, hiddenText);
  assert.equal(document.activeElement, otherControl);
  assertInspector('Current workflow');
  await f.show();
  assert.match(f.section.textContent, /Unit A hidden refresh/);
});
