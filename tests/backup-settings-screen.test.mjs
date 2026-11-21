import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, installNativeCatalogDom, settle } from './fixtures/native-catalog-archive-dom.mjs';

let document = installNativeCatalogDom({ after });
window.addEventListener = () => {}; window.removeEventListener = () => {};
const state = await import('../app/ui/state.js');
const { createDataScreen } = await import('../app/ui/screens/data.js');
const features = await import('../app/features.js');
const { registerScreens, go } = await import('../app/ui/shell.js');
const { restoreReloadRequired } = await import('../app/restore-session.js');
const UI_KEY = 'deckchek.ui.v1', CAL_KEY = 'deckchek.calibration.v1';
const profile = JSON.stringify({ version: 1, deviceName: 'Original rig', sampleRate: 48000, valid: false, issues: [], gainDb: {}, uncertainty: {} });
const inspect = { valid: true, errors: [], manifest: { format: 'deckchek-backup', formatVersion: 1, createdAt: '2026-11-20T00:00:00Z', kind: 'manual', appVersion: '0.1.0', counts: { runs: 2, assets: 1, profiles: 0, midiMaps: 0 } } };
const restored = () => ({ settings: { theme: 'light', deviceName: 'Restored rig' }, calibrationProfiles: {}, safetyBackup: 'memory-safety', upgradedFrom: null, schemaVersion: 5, warnings: [] });

beforeEach(t => {
  // A completed restore has no in-session unlock. Each test starts a distinct
  // document/storage lifetime, as an actual reload does, without a reset hook.
  document = installNativeCatalogDom(t);
  window.addEventListener = () => {}; window.removeEventListener = () => {};
  delete window.__TAURI__;
  assert.equal(restoreReloadRequired(), false);
  state.active.screen = null;
  features.configureFeatures(); features.bindSettings(state.settings);
  state.importSettingsBlob({ settings: { theme: 'dark', deviceName: 'Original rig' }, calibrationProfiles: { original: profile } });
  for (const id of ['toasts', 'sr-polite', 'sr-assertive']) document.getElementById(id).replaceChildren();
});

async function mount(t, overrides = {}, { withShell = false } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const reloads = [], oldLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { reload: () => reloads.push('reload') } });
  t.after(() => { if (oldLocation) Object.defineProperty(globalThis, 'location', oldLocation); else delete globalThis.location; });
  const calls = [];
  window.__TAURI__ = {
    core: { invoke: async (command, args) => {
      calls.push({ command, args });
      if (overrides[command]) return overrides[command](args);
      if (command === 'backup_list' || command === 'catalog_archive_setups') return [];
      if (command === 'backup_settings_get') return { mode: 'off', keep: 7 };
      if (command === 'backup_inspect') return inspect;
      if (command === 'backup_restore') return restored();
      if (command === 'backup_create') return { bytes: 120, counts: { runs: 2 }, warnings: [] };
      throw Error(`Unexpected native call: ${command}`);
    } },
    dialog: { open: async () => '/tmp/fixture.deckchek-backup', save: async () => '/tmp/fixture-save.deckchek-backup' },
  };
  const host = document.createElement('section'); host.id = 'screen-data';
  document.getElementById('main').append(host);
  let screen;
  if (withShell) {
    registerScreens([
      { id: 'other', title: 'Other', icon: 'info', create: () => ({}) },
      { id: 'data', title: 'Data & backup', icon: 'download', feature: 'backup', create: node => { screen = createDataScreen(node); return screen; } },
    ]);
    go('data');
  } else screen = createDataScreen(host);
  await settle();
  t.after(() => { screen.dispose(); host.remove(); document.getElementById('data-restore-outcome')?.remove(); delete window.__TAURI__; });
  return { host, screen, calls, reloads, q: id => host.querySelector(`#${id}`), outcome: id => document.getElementById(id) };
}
function click(node) { assert.ok(node, 'the real control exists'); return node.listeners.click[0].callback({ target: node, currentTarget: node }); }
async function confirmRestore(f) {
  const pending = click(f.q('data-restore')); await settle();
  const ack = document.getElementById('restore-ack'); assert.ok(ack);
  ack.checked = true; ack.dispatch('change');
  const confirming = click(document.getElementById('restore-confirm')); await settle();
  return { pending, confirming };
}
function nativeCalls(f, command) { return f.calls.filter(call => call.command === command); }
function blocked(f) {
  for (const id of ['data-backup-now', 'data-restore', 'data-import-json', 'data-save-schedule']) assert.equal(f.q(id).disabled, true, id);
  assert.equal(f.q('native-catalog-file').disabled, true);
  assert.equal(restoreReloadRequired(), true);
  assert.equal(f.outcome('data-restore-outcome').open, true);
}

test('actual Data backup refuses an unavailable calibration snapshot before native dispatch', async t => {
  const f = await mount(t), read = localStorage.getItem;
  t.mock.method(localStorage, 'getItem', key => { if (key === CAL_KEY) throw Error('/private/storage details'); return read(key); });
  await click(f.q('data-backup-now')); await settle();
  assert.equal(nativeCalls(f, 'backup_create').length, 0);
  assert.match(f.q('data-status').textContent, /Backup failed: Calibration profiles could not be read/);
  assert.doesNotMatch(f.q('data-status').textContent, /\/private\//); assert.equal(f.q('data-backup-now').disabled, false);
});

test('actual restore confirmation refuses an unavailable safety snapshot without dispatching the database restore', async t => {
  const f = await mount(t), read = localStorage.getItem;
  t.mock.method(localStorage, 'getItem', key => { if (key === CAL_KEY) throw Error('read refused'); return read(key); });
  const operation = await confirmRestore(f); await operation.confirming;
  assert.equal(nativeCalls(f, 'backup_restore').length, 0);
  assert.match(document.getElementById('restore-error').textContent, /Calibration profiles could not be read/);
  assert.equal(document.getElementById('restore-confirm').disabled, false);
  click(document.getElementById('restore-cancel')); await operation.pending;
  assert.equal(f.q('data-restore').disabled, false); assert.deepEqual(f.reloads, []);
});

test('successful actual Data restore updates live settings and empty calibration before delayed reload', async t => {
  const f = await mount(t), original = state.settings;
  const operation = await confirmRestore(f); await Promise.all([operation.pending, operation.confirming]);
  assert.equal(nativeCalls(f, 'backup_restore').length, 1);
  assert.equal(nativeCalls(f, 'backup_restore')[0].args.settings.ui.deviceName, 'Original rig');
  assert.equal(state.settings, original); assert.equal(state.settings.deviceName, 'Restored rig');
  assert.equal(localStorage.getItem(CAL_KEY), '{}'); assert.deepEqual(state.exportSettingsBlob().calibration, {});
  const saved = localStorage.getItem(UI_KEY);
  assert.equal(state.setSetting('screen', 'data'), false); assert.equal(localStorage.getItem(UI_KEY), saved);
  assert.match(f.q('data-status').textContent, /^Restore complete\./); blocked(f);
  t.mock.timers.tick(1799); assert.deepEqual(f.reloads, []); t.mock.timers.tick(1); assert.deepEqual(f.reloads, ['reload']);
});

test('failed local UI application stays visible and Retry does not repeat the committed native restore', async t => {
  const gate = deferred(), f = await mount(t, { backup_restore: () => gate.promise });
  const operation = await confirmRestore(f), write = localStorage.setItem;
  let deny = true, uiWrites = 0;
  t.mock.method(localStorage, 'setItem', (key, text) => { if (key === UI_KEY) { uiWrites++; if (deny) throw Error('/private/quota'); } write(key, text); });
  gate.resolve(restored()); await Promise.all([operation.pending, operation.confirming]); await settle();
  assert.equal(state.settings.theme, 'dark'); assert.equal(localStorage.getItem(CAL_KEY), '{}');
  assert.match(f.q('data-status').textContent, /Database restored\..*App settings could not be saved/);
  assert.doesNotMatch(f.q('data-status').textContent, /Restore complete|Nothing was changed|\/private\//);
  assert.doesNotMatch(document.getElementById('toasts').textContent, /Restore complete/); blocked(f);
  t.mock.timers.tick(10000); assert.deepEqual(f.reloads, []);
  const retry = f.outcome('data-restore-retry'); deny = false; await click(retry); await settle();
  assert.equal(nativeCalls(f, 'backup_restore').length, 1); assert.equal(state.settings.theme, 'light');
  assert.match(f.q('data-status').textContent, /^Restore complete\./); assert.equal(f.outcome('data-restore-retry'), null);
  const writes = uiWrites;
  assert.equal(state.setSetting('theme', 'dark'), false); await click(retry);
  assert.equal(state.settings.theme, 'light'); assert.equal(uiWrites, writes, 'a retired retry cannot reapply the old outcome');
  t.mock.timers.tick(1800); assert.deepEqual(f.reloads, ['reload']);
});

test('failed calibration application preserves successful UI and requires explicit reload', async t => {
  const gate = deferred(), f = await mount(t, { backup_restore: () => gate.promise });
  const operation = await confirmRestore(f), before = localStorage.getItem(CAL_KEY), write = localStorage.setItem;
  t.mock.method(localStorage, 'setItem', (key, text) => { if (key === CAL_KEY) throw Error('quota'); write(key, text); });
  gate.resolve(restored()); await Promise.all([operation.pending, operation.confirming]);
  assert.equal(state.settings.deviceName, 'Restored rig'); assert.equal(localStorage.getItem(CAL_KEY), before);
  assert.match(f.q('data-status').textContent, /Calibration profiles could not be saved/); blocked(f);
  t.mock.timers.tick(10000); assert.deepEqual(f.reloads, []);
  click(f.outcome('data-restore-reload')); assert.deepEqual(f.reloads, ['reload']); assert.equal(nativeCalls(f, 'backup_restore').length, 1);
});

for (const retired of ['hidden', 'disposed']) {
  test(`a committed partial restore keeps global recovery when Data is ${retired} and its restored feature is disabled`, async t => {
    const gate = deferred(), f = await mount(t, { backup_restore: () => gate.promise }, { withShell: true });
    const operation = await confirmRestore(f), before = localStorage.getItem(CAL_KEY);
    go('other');
    if (retired === 'disposed') { f.screen.dispose(); f.host.remove(); }
    gate.resolve({ ...restored(), settings: { ...restored().settings, features: { backup: false } }, calibrationProfiles: { bad: '{}' } });
    await Promise.all([operation.pending, operation.confirming]); await settle();
    assert.equal(state.settings.deviceName, 'Restored rig'); assert.equal(localStorage.getItem(CAL_KEY), before);
    assert.equal(features.isEnabled('backup'), false); assert.equal(restoreReloadRequired(), true);
    const dialog = f.outcome('data-restore-outcome');
    assert.ok(dialog.isConnected); assert.equal(dialog.open, true); assert.equal(f.host.contains(dialog), false);
    assert.match(dialog.textContent, /Database restored\..*Calibration profiles in the backup could not be applied/);
    assert.match(dialog.textContent, /Reload DeckChek before continuing/);
    assert.equal(f.outcome('data-restore-retry'), null);
    go('data'); assert.equal(state.active.screen.def.id, 'other', 'the actual shell cannot resume a stale screen');
    assert.equal(dialog.dispatch('cancel').defaultPrevented, true, 'Escape must not dismiss recovery');
    dialog.close(); await settle(); assert.equal(dialog.open, true, 'an unexpected close cannot unlock the session');
    t.mock.timers.tick(10000); assert.deepEqual(f.reloads, []);
    click(f.outcome('data-restore-reload')); click(f.outcome('data-restore-reload'));
    assert.deepEqual(f.reloads, ['reload']); assert.equal(nativeCalls(f, 'backup_restore').length, 1);
  });
}

test('global local-settings retry survives hidden Data and the restored disabled backup flag', async t => {
  const gate = deferred(), f = await mount(t, { backup_restore: () => gate.promise }, { withShell: true });
  const operation = await confirmRestore(f), write = localStorage.setItem;
  let denied = true;
  t.mock.method(localStorage, 'setItem', (key, text) => { if (key === CAL_KEY && denied) throw Error('quota'); write(key, text); });
  go('other');
  gate.resolve({ ...restored(), settings: { ...restored().settings, features: { backup: false } } });
  await Promise.all([operation.pending, operation.confirming]); await settle();
  assert.equal(features.isEnabled('backup'), false);
  assert.match(f.outcome('data-restore-outcome-message').textContent, /Calibration profiles could not be saved/);
  const retry = f.outcome('data-restore-retry'); assert.ok(retry.isConnected);
  denied = false; await click(retry); await settle();
  assert.equal(features.isEnabled('backup'), false); assert.equal(localStorage.getItem(CAL_KEY), '{}');
  assert.match(f.outcome('data-restore-outcome-message').textContent, /^Restore complete\./);
  assert.equal(state.active.screen.def.id, 'other'); assert.equal(nativeCalls(f, 'backup_restore').length, 1);
  click(f.outcome('data-restore-reload')); t.mock.timers.tick(1800);
  assert.deepEqual(f.reloads, ['reload']);
});

test('a partly accepted calibration map is visibly partial and does not auto-reload', async t => {
  const f = await mount(t, { backup_restore: () => ({ ...restored(), calibrationProfiles: { retained: profile, skipped: '{}' } }) });
  const operation = await confirmRestore(f); await Promise.all([operation.pending, operation.confirming]);
  assert.deepEqual(JSON.parse(localStorage.getItem(CAL_KEY)), { retained: profile });
  assert.match(f.q('data-status').textContent, /1 calibration profile\(s\) could not be restored/);
  assert.doesNotMatch(f.q('data-status').textContent, /Restore complete/);
  t.mock.timers.tick(10000); assert.deepEqual(f.reloads, []); assert.ok(f.outcome('data-restore-reload'));
});

test('database-only restore leaves absent local parts unchanged and retains normal completion', async t => {
  const before = state.exportSettingsBlob();
  const f = await mount(t, { backup_restore: () => ({ ...restored(), settings: null, calibrationProfiles: null }) });
  const operation = await confirmRestore(f); await Promise.all([operation.pending, operation.confirming]);
  assert.deepEqual(state.exportSettingsBlob(), before); assert.match(f.q('data-status').textContent, /^Restore complete\./);
  t.mock.timers.tick(1800); assert.deepEqual(f.reloads, ['reload']);
});

test('the actual restore confirmation distinguishes database failure and leaves the original session usable', async t => {
  const f = await mount(t, { backup_restore: async () => { throw new Error('Database restore unavailable'); } });
  const pending = click(f.q('data-restore')); await settle();
  const safety = document.getElementById('restore-safety').textContent;
  assert.match(safety, /A failed database restore leaves that database unchanged/);
  assert.match(safety, /If any local settings cannot be applied, you must review the result and reload before continuing/);
  assert.doesNotMatch(safety, /If the restore fails, your current data is left untouched/);
  assert.match(document.getElementById('restore-replaces').textContent, /Parts not included keep their current values/);
  const ack = document.getElementById('restore-ack'); ack.checked = true; ack.dispatch('change');
  await click(document.getElementById('restore-confirm')); await settle();
  assert.equal(restoreReloadRequired(), false); assert.equal(f.outcome('data-restore-outcome'), null);
  assert.match(document.getElementById('restore-error').textContent, /Database restore unavailable/);
  click(document.getElementById('restore-cancel')); await pending;
  state.setSetting('deviceName', 'Still usable'); assert.equal(state.settings.deviceName, 'Still usable');
  assert.equal(f.q('data-restore').disabled, false); assert.deepEqual(f.reloads, []);
});

test('the real cached Devices unit selector cannot overwrite restored preferences before reload', async t => {
  const { createDevicesScreen } = await import('../app/ui/screens/devices.js');
  const { ensureLibrary, lib } = await import('../app/ui/devices/library-state.js');
  const { A, B } = await import('./fixtures/learned-map-profile-identity.mjs');
  await ensureLibrary();
  const previous = { ...lib };
  t.after(() => Object.assign(lib, previous));
  state.setSetting('deviceUnits', { [A.id]: 'old-a', [B.id]: 'old-b' });
  const restoredUnits = { [A.id]: 'new-a', [B.id]: 'new-b' };
  const f = await mount(t, { backup_restore: () => ({ ...restored(), settings: { ...restored().settings, features: { backup: false }, deviceUnits: restoredUnits }, calibrationProfiles: { bad: '{}' } }) });
  const assets = ['old-a', 'new-a', 'old-b', 'new-b'].map(id => ({ id, productId: id.endsWith('a') ? 'product-a' : 'product-b', nickname: id }));
  Object.assign(lib, { ready: true, loading: false, profiles: structuredClone([A, B]), products: new Map([[A.id, 'product-a'], [B.id, 'product-b']]), assets, results: [], problems: [], warnings: {}, error: null, syncError: null });
  t.mock.method(state.store, 'list', async () => assets);
  t.mock.method(state.store, 'listDeviceTestResults', async () => []);
  t.mock.method(state.store, 'getMidiMap', async () => null);
  const section = document.createElement('section'); document.getElementById('main').append(section);
  const devices = createDevicesScreen(section);
  t.after(() => { devices.onHide(); section.hidden = true; section.remove(); });
  section.querySelector(`[data-device="${A.id}"]`).querySelector('.dev-card-main').dispatch('click'); await settle();
  const selector = section.querySelector('#dev-unit'); assert.equal(selector.value, 'old-a');
  const operation = await confirmRestore(f); await Promise.all([operation.pending, operation.confirming]);
  assert.deepEqual(state.settings.deviceUnits, restoredUnits);
  const savedUi = localStorage.getItem(UI_KEY), savedCalibration = localStorage.getItem(CAL_KEY);
  // Dispatch the retained real callback directly: modal input blocking is a real
  // browser behavior, while the writer guard also protects this stale caller.
  selector.value = 'old-a'; selector.dispatch('change'); await settle();
  assert.deepEqual(state.settings.deviceUnits, restoredUnits); assert.equal(localStorage.getItem(UI_KEY), savedUi);
  assert.equal(features.setEnabled('backup', true), false); assert.equal(features.resetFeatures(), false);
  assert.equal(features.isEnabled('backup'), false); assert.equal(localStorage.getItem(UI_KEY), savedUi);
  assert.throws(() => state.saveProfile(JSON.parse(profile)), error => error.code === 'restore_reload_required');
  assert.throws(() => state.deleteProfile('original'), error => error.code === 'restore_reload_required');
  assert.equal(localStorage.getItem(CAL_KEY), savedCalibration); assert.equal(nativeCalls(f, 'backup_restore').length, 1);
});

test('failed reload remains recoverable and a later manual reload owns the pending automatic attempt', async t => {
  const f = await mount(t);
  const operation = await confirmRestore(f); await Promise.all([operation.pending, operation.confirming]);
  let refused = true;
  t.mock.method(globalThis.location, 'reload', () => { if (refused) throw Error('/private/reload'); f.reloads.push('reload'); });
  click(f.outcome('data-restore-reload'));
  assert.match(f.outcome('data-restore-reload-error').textContent, /could not reload/);
  assert.doesNotMatch(f.outcome('data-restore-reload-error').textContent, /\/private\//);
  assert.equal(restoreReloadRequired(), true); assert.equal(f.outcome('data-restore-outcome').open, true);
  refused = false; click(f.outcome('data-restore-reload')); t.mock.timers.tick(1800);
  assert.deepEqual(f.reloads, ['reload']); assert.equal(nativeCalls(f, 'backup_restore').length, 1);
});
