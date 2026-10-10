import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const state = await import('../app/ui/state.js');
const { friendlyBackupError, replacementLines } = await import('../app/ui/screens/data.js');

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
  assert.deepEqual(none, { settings: false, profiles: 0, skipped: 0 });
  const r = state.importSettingsBlob({ settings: { theme: 'light', screen: 'history' }, calibrationProfiles: { 'rig|48000': profile } });
  assert.deepEqual(r, { settings: true, profiles: 1, skipped: 0 });
  assert.equal(JSON.parse(globalThis.localStorage.getItem('deckchek.ui.v1')).theme, 'light');
  assert.equal(Object.keys(JSON.parse(globalThis.localStorage.getItem('deckchek.calibration.v1'))).length, 1);
  const blob = state.exportSettingsBlob();
  assert.equal(typeof blob.ui, 'object');
  assert.equal(Object.keys(blob.calibration).length, 1);
  // malformed parts do not clobber what is stored
  const again = state.importSettingsBlob({ settings: 'junk', calibrationProfiles: [1] });
  assert.deepEqual(again, { settings: false, profiles: 0, skipped: 0 });
  assert.equal(Object.keys(JSON.parse(globalThis.localStorage.getItem('deckchek.calibration.v1'))).length, 1);
});
