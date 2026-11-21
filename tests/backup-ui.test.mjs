import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const state = await import('../app/ui/state.js');
const features = await import('../app/features.js');
const { friendlyBackupError, replacementLines } = await import('../app/ui/screens/data.js');
const UI_KEY = 'deckchek.ui.v1', CAL_KEY = 'deckchek.calibration.v1';
beforeEach(() => {
  const records = new Map();
  globalThis.localStorage = { getItem: key => records.get(key) ?? null, setItem: (key, text) => records.set(key, String(text)), removeItem: key => records.delete(key) };
  features.configureFeatures(); features.bindSettings(state.settings);
  state.importSettingsBlob({ settings: {}, calibrationProfiles: {} });
});
const storageOriginals = new WeakMap();
function substituteStorage(t, value) {
  if (!storageOriginals.has(t)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); storageOriginals.set(t, old);
    t.after(() => Object.defineProperty(globalThis, 'localStorage', old));
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value });
}

const profile = JSON.stringify({ version: 1, deviceName: 'Rig', sampleRate: 48000, createdAt: new Date().toISOString(), valid: false, issues: ['x'], gainDb: {}, uncertainty: {} });

test('capture_running gets a friendly message that says nothing changed', () => {
  const m = friendlyBackupError({ code: 'capture_running', message: 'raw rust text' });
  assert.match(m, /capture is running/i);
  assert.match(m, /Stop the capture/);
  assert.match(m, /Nothing was changed/);
  assert.doesNotMatch(m, /raw rust text/);
});

test('other errors pass the Rust message through; odd values fall back', () => {
  assert.equal(friendlyBackupError({ code: 'disk_full', message: 'Not enough disk space to write the backup.' }), 'Not enough disk space to write the backup.');
  assert.equal(friendlyBackupError('boom'), 'boom');
  assert.match(friendlyBackupError(null), /Nothing was changed/);
  assert.match(friendlyBackupError({ code: 'not_confirmed' }), /Tick the box/);
});

test('replacement lines name what is replaced and the backup counts', () => {
  const lines = replacementLines({ manifest: { counts: { runs: 1, assets: 2, profiles: 0, midiMaps: 3 } } });
  assert.equal(lines.length, 3);
  assert.match(lines[0], /database/);
  assert.match(lines[1], /Calibration profiles/);
  assert.match(lines[2], /1 run, 2 assets, 0 calibration profiles, 3 MIDI maps/);
});

test('sanitizeUiSettings accepts objects, strips prototype keys, rejects the rest', () => {
  assert.equal(state.sanitizeUiSettings(null), null);
  assert.equal(state.sanitizeUiSettings([1]), null);
  assert.equal(state.sanitizeUiSettings('x'), null);
  assert.equal(state.sanitizeUiSettings({ big: 'x'.repeat(300 * 1024) }), null);
  const clean = state.sanitizeUiSettings(JSON.parse('{"theme":"light","__proto__":{"evil":1},"features":{"constructor":1,"a":true}}'));
  assert.equal(clean.theme, 'light');
  assert.deepEqual(Object.keys(clean).sort(), ['features', 'theme']);
  assert.deepEqual(clean.features, { a: true });
  assert.equal({}.evil, undefined);
});

test('sanitizeCalibrationMap keeps valid profiles and counts the rest as skipped', () => {
  const r = state.sanitizeCalibrationMap({ 'rig|48000': profile, bad: '{"nope":1}', notString: { a: 1 }, ['k'.repeat(201)]: profile });
  assert.equal(r.accepted, 1);
  assert.equal(r.skipped, 3);
  assert.deepEqual(Object.keys(r.map), ['rig|48000']);
  assert.deepEqual(state.sanitizeCalibrationMap(null), { map: {}, accepted: 0, skipped: 0 });
});

test('importSettingsBlob round-trips with exportSettingsBlob and leaves absent parts alone', () => {
  const none = state.importSettingsBlob({});
  assert.deepEqual(none, { settings: false, profiles: 0, skipped: 0, settingsStatus: 'absent', calibrationStatus: 'absent', complete: true });
  const r = state.importSettingsBlob({ settings: { theme: 'light', screen: 'history' }, calibrationProfiles: { 'rig|48000': profile } });
  assert.deepEqual(r, { settings: true, profiles: 1, skipped: 0, settingsStatus: 'applied', calibrationStatus: 'applied', complete: true });
  assert.equal(JSON.parse(globalThis.localStorage.getItem('deckchek.ui.v1')).theme, 'light');
  assert.equal(Object.keys(JSON.parse(globalThis.localStorage.getItem('deckchek.calibration.v1'))).length, 1);
  const blob = state.exportSettingsBlob();
  assert.equal(blob.ui.theme, 'light'); assert.equal(blob.ui.screen, 'history');
  assert.equal(Object.keys(blob.calibration).length, 1);
  // malformed parts do not clobber what is stored
  const again = state.importSettingsBlob({ settings: 'junk', calibrationProfiles: [1] });
  assert.deepEqual(again, { settings: false, profiles: 0, skipped: 0, settingsStatus: 'invalid', calibrationStatus: 'invalid', complete: false });
  assert.equal(Object.keys(JSON.parse(globalThis.localStorage.getItem('deckchek.calibration.v1'))).length, 1);
});

test('backup snapshots detach nested device settings and bound feature changes', () => {
  const units = { rig: { channels: [1, 2] } };
  state.setSetting('deviceUnits', units); features.setEnabled('humHunter', true);
  localStorage.setItem(CAL_KEY, JSON.stringify({ 'rig|48000': profile }));
  const captured = state.exportSettingsBlob();
  units.rig.channels[0] = 3; features.setEnabled('humHunter', false);
  localStorage.setItem(CAL_KEY, '{}');
  assert.deepEqual(captured.ui.deviceUnits, { rig: { channels: [1, 2] } });
  assert.equal(captured.ui.features.humHunter, true); assert.equal(captured.calibration['rig|48000'], profile);
  captured.ui.deviceUnits.rig.channels[1] = 4;
  assert.deepEqual(state.settings.deviceUnits.rig.channels, [3, 2]);
});

test('backup capture distinguishes observed empty calibration from unavailable storage', t => {
  localStorage.removeItem(CAL_KEY); assert.deepEqual(state.exportSettingsBlob().calibration, {});
  localStorage.setItem(CAL_KEY, '{}'); assert.deepEqual(state.exportSettingsBlob().calibration, {});
  for (const source of [null, {}, { getItem() { throw Error('/private/profile must not be exposed'); } }]) {
    substituteStorage(t, source);
    assert.throws(() => state.exportSettingsBlob(), error => error.code === 'calibration_storage_unavailable' && !error.message.includes('/private/'));
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('provider failed'); } });
  assert.throws(() => state.exportSettingsBlob(), { code: 'calibration_storage_unavailable' });
});

test('invalid calibration storage is rejected without replacing it with an empty snapshot', () => {
  const nonfinite = profile.replace('48000', '1e400');
  for (const raw of ['{', 'null', '[]', JSON.stringify({ bad: 7 }), JSON.stringify({ bad: '{}' }), JSON.stringify({ bad: nonfinite })]) {
    localStorage.setItem(CAL_KEY, raw);
    assert.throws(() => state.exportSettingsBlob(), { code: 'calibration_registry_invalid' });
    assert.equal(localStorage.getItem(CAL_KEY), raw);
  }
});

test('UI snapshots reject values JSON would silently lose and do not call accessors', () => {
  const cyclic = {}; cyclic.self = cyclic;
  for (const value of [undefined, NaN, Infinity, 1n, new Date(), cyclic, [, 1]]) {
    state.settings.extra = value;
    assert.throws(() => state.exportSettingsBlob(), { code: 'settings_snapshot_invalid' });
  }
  delete state.settings.extra;
  let reads = 0;
  Object.defineProperty(state.settings, 'extra', { configurable: true, enumerable: true, get() { reads++; return 'hidden'; } });
  assert.throws(() => state.exportSettingsBlob(), { code: 'settings_snapshot_invalid' });
  delete state.settings.extra; assert.equal(reads, 0);
  state.settings.extra = { toJSON() { reads++; return {}; } };
  assert.throws(() => state.exportSettingsBlob(), { code: 'settings_snapshot_invalid' });
  delete state.settings.extra; assert.equal(reads, 0);
});

test('UI and profile limits count UTF-8 bytes and accept the exact boundary', () => {
  const limit = 256 * 1024, overhead = Buffer.byteLength(JSON.stringify({ title: '' }));
  const title = 'é'.repeat(Math.floor((limit - overhead) / 2)) + 'x'.repeat((limit - overhead) % 2);
  assert.equal(Buffer.byteLength(JSON.stringify({ title })), limit);
  assert.equal(state.sanitizeUiSettings({ title }).title, title);
  assert.equal(state.sanitizeUiSettings({ title: title + 'x' }), null);
  const before = localStorage.getItem(UI_KEY), applied = state.importSettingsBlob({ settings: { title } });
  assert.equal(applied.settingsStatus, 'invalid', 'effective restored settings must also fit after defaults are included');
  assert.equal(applied.complete, false); assert.equal(localStorage.getItem(UI_KEY), before);
  const p = { ...JSON.parse(profile), notes: '' }, base = Buffer.byteLength(JSON.stringify(p)), cap = 1024 * 1024;
  p.notes = 'é'.repeat(Math.floor((cap - base) / 2)) + 'x'.repeat((cap - base) % 2);
  const text = JSON.stringify(p); assert.equal(Buffer.byteLength(text), cap);
  assert.equal(state.sanitizeCalibrationMap({ rig: text }).accepted, 1);
  p.notes += 'x'; assert.equal(state.sanitizeCalibrationMap({ rig: JSON.stringify(p) }).skipped, 1);
});

test('restore replaces the bound live object before any observer and later UI writes preserve it', t => {
  const original = state.settings;
  state.setSetting('oldOverride', 'remove me'); features.setEnabled('service', true);
  const observed = [];
  for (const event of ['settings', 'calibration']) t.after(state.on(event, () => observed.push(state.exportSettingsBlob())));
  const restored = { theme: 'light', deviceName: 'Restored rig', features: { humHunter: true }, deviceUnits: { rig: 2 } };
  const result = state.importSettingsBlob({ settings: restored, calibrationProfiles: { 'rig|48000': profile } });
  assert.equal(result.complete, true); assert.equal(state.settings, original);
  assert.equal(state.settings.sampleRate, 48000); assert.equal(state.settings.oldOverride, undefined);
  assert.equal(features.isEnabled('service'), false); assert.equal(features.isEnabled('humHunter'), true);
  assert.ok(observed.length > 1);
  for (const value of observed) {
    assert.equal(value.ui.deviceName, 'Restored rig'); assert.equal(value.ui.oldOverride, undefined);
    assert.deepEqual(value.calibration, { 'rig|48000': profile });
  }
  restored.deviceUnits.rig = 99;
  state.setSetting('screen', 'data');
  const saved = JSON.parse(localStorage.getItem(UI_KEY));
  assert.equal(saved.deviceName, 'Restored rig'); assert.deepEqual(saved.deviceUnits, { rig: 2 }); assert.equal(saved.oldOverride, undefined);
});

test('empty calibration restore notifies once while absent and wholly invalid parts stay untouched', t => {
  localStorage.setItem(CAL_KEY, JSON.stringify({ rig: profile }));
  const observed = []; t.after(state.on('calibration', () => observed.push(localStorage.getItem(CAL_KEY))));
  const absent = state.importSettingsBlob({}); assert.equal(absent.complete, true); assert.deepEqual(observed, []);
  const invalid = state.importSettingsBlob({ calibrationProfiles: { bad: '{}' } });
  assert.equal(invalid.calibrationStatus, 'invalid'); assert.equal(invalid.complete, false); assert.deepEqual(observed, []);
  assert.deepEqual(JSON.parse(localStorage.getItem(CAL_KEY)), { rig: profile });
  const empty = state.importSettingsBlob({ calibrationProfiles: {} });
  assert.equal(empty.profiles, 0); assert.equal(empty.calibrationStatus, 'applied'); assert.equal(empty.complete, true);
  assert.deepEqual(observed, ['{}']);
});

test('mixed calibration restore explicitly reports partial application', t => {
  const observed = []; t.after(state.on('calibration', () => observed.push(state.exportSettingsBlob().calibration)));
  const result = state.importSettingsBlob({ calibrationProfiles: { rig: profile, invalid: '{}' } });
  assert.equal(result.complete, false); assert.equal(result.calibrationStatus, 'partial');
  assert.equal(result.profiles, 1); assert.equal(result.skipped, 1); assert.deepEqual(observed, [{ rig: profile }]);
});

test('restore distinguishes each failed storage write from absence and keeps failed live UI unchanged', t => {
  const storage = localStorage, original = state.settings;
  state.setSetting('theme', 'dark'); localStorage.setItem(CAL_KEY, JSON.stringify({ old: profile }));
  substituteStorage(t, { getItem: storage.getItem, setItem(key, text) { if (key === UI_KEY) throw Error('quota'); storage.setItem(key, text); } });
  let result = state.importSettingsBlob({ settings: { theme: 'light' }, calibrationProfiles: {} });
  assert.equal(result.settingsStatus, 'unavailable'); assert.equal(result.calibrationStatus, 'applied'); assert.equal(result.complete, false);
  assert.equal(state.settings, original); assert.equal(state.settings.theme, 'dark'); assert.equal(storage.getItem(CAL_KEY), '{}');
  substituteStorage(t, { getItem: storage.getItem, setItem(key, text) { if (key === CAL_KEY) throw Error('quota'); storage.setItem(key, text); } });
  result = state.importSettingsBlob({ settings: { theme: 'light' }, calibrationProfiles: { rig: profile } });
  assert.equal(result.settingsStatus, 'applied'); assert.equal(result.calibrationStatus, 'unavailable'); assert.equal(result.complete, false);
  assert.equal(state.settings.theme, 'light'); assert.equal(storage.getItem(CAL_KEY), '{}');
  substituteStorage(t, null);
  result = state.importSettingsBlob({ settings: { theme: 'dark' }, calibrationProfiles: {} });
  assert.equal(result.settings, false); assert.equal(result.settingsStatus, 'unavailable'); assert.equal(result.calibrationStatus, 'unavailable');
  assert.equal(result.complete, false); assert.equal(state.settings.theme, 'light');
});

test('profile writes commit before notification and report an intentional empty registry after deletion', t => {
  const observed = []; t.after(state.on('calibration', () => observed.push(state.exportSettingsBlob().calibration)));
  const key = state.saveProfile(JSON.parse(profile));
  assert.equal(key, 'rig|48000'); assert.deepEqual(observed, [{ [key]: profile }]);
  assert.equal(state.deleteProfile(key), true); assert.deepEqual(observed, [{ [key]: profile }, {}]);
  assert.equal(state.deleteProfile(key), false); assert.equal(observed.length, 2);
});

test('profile save and delete never overwrite unavailable or invalid storage and emit no success', t => {
  const storage = localStorage, before = JSON.stringify({ 'rig|48000': profile }), events = [];
  storage.setItem(CAL_KEY, before); t.after(state.on('calibration', () => events.push('changed')));
  substituteStorage(t, { getItem: storage.getItem, setItem() { throw Error('/private/quota details'); } });
  for (const action of [() => state.saveProfile(JSON.parse(profile)), () => state.deleteProfile('rig|48000')]) {
    assert.throws(action, error => error.code === 'calibration_storage_write_failed' && !error.message.includes('/private/'));
    assert.equal(storage.getItem(CAL_KEY), before);
  }
  substituteStorage(t, { getItem() { throw Error('read failed'); }, setItem() { assert.fail('must not write after failed read'); } });
  assert.throws(() => state.saveProfile(JSON.parse(profile)), { code: 'calibration_storage_unavailable' });
  assert.throws(() => state.deleteProfile('rig|48000'), { code: 'calibration_storage_unavailable' });
  substituteStorage(t, storage); storage.setItem(CAL_KEY, '{invalid');
  assert.throws(() => state.saveProfile(JSON.parse(profile)), { code: 'calibration_registry_invalid' });
  assert.throws(() => state.deleteProfile('rig|48000'), { code: 'calibration_registry_invalid' });
  assert.equal(storage.getItem(CAL_KEY), '{invalid'); assert.deepEqual(events, []);
});
