import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installNativeCatalogDom, settle } from './fixtures/native-catalog-archive-dom.mjs';

const document = installNativeCatalogDom({ after });
window.addEventListener = () => {}; window.removeEventListener = () => {};
const state = await import('../app/ui/state.js');
const { createCalibrationScreen } = await import('../app/ui/screens/calibration.js');
const KEY = 'deckchek.calibration.v1';
const profile = { version: 1, deviceName: 'Rig', sampleRate: 48000, createdAt: '2026-11-20T00:00:00Z', valid: true, issues: [], gainDb: { left: 0, right: 0 }, mismatchDb: 0, clockPpm: 0, latencyMs: 1, uncertainty: {} };
const dialog = document.createElement('dialog'); dialog.id = 'confirm-dialog';
dialog.innerHTML = '<h2 id="confirm-title"></h2><p id="confirm-body"></p><button id="confirm-ok"></button><button id="confirm-cancel"></button>';
document.body.append(dialog);

beforeEach(() => {
  delete window.__TAURI__;
  state.importSettingsBlob({ settings: { deviceName: 'Rig' }, calibrationProfiles: { 'rig|48000': JSON.stringify(profile) } });
  for (const id of ['toasts', 'sr-polite', 'sr-assertive']) document.getElementById(id).replaceChildren();
});
async function mount(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = document.createElement('section'); document.body.append(host);
  const screen = createCalibrationScreen(host); await settle();
  t.after(async () => { await screen.dispose(); host.remove(); });
  return { host, q: id => host.querySelector(`#${id}`) };
}
function click(node) { assert.ok(node); return node.listeners.click[0].callback({ target: node, currentTarget: node }); }
async function confirmDelete(button) {
  const pending = click(button); await settle(); assert.equal(dialog.open, true);
  // The fixture supplies the browser dialog's successful form-close result.
  dialog.returnValue = 'confirm'; dialog.close(); await pending; await settle();
}

test('actual calibration Save reports a storage failure and permits a later successful save', async t => {
  const f = await mount(t), before = localStorage.getItem(KEY), events = [];
  t.after(state.on('calibration', () => events.push('saved')));
  const view = f.q('cal-list').querySelectorAll('button').find(button => button.textContent === 'View'); click(view);
  const save = f.q('cal-profile').querySelectorAll('button').find(button => button.textContent.startsWith('Save for'));
  assert.equal(save.disabled, false);
  const write = localStorage.setItem; let deny = true;
  t.mock.method(localStorage, 'setItem', (key, text) => { if (key === KEY && deny) throw Error('/private/storage details'); write(key, text); });
  click(save);
  assert.equal(localStorage.getItem(KEY), before); assert.deepEqual(events, []);
  assert.match(document.getElementById('toasts').textContent, /could not be saved/);
  assert.doesNotMatch(document.getElementById('toasts').textContent, /profile saved|\/private\//);
  assert.equal(save.disabled, false);
  deny = false; document.getElementById('toasts').replaceChildren(); click(save);
  assert.deepEqual(events, ['saved']); assert.match(document.getElementById('toasts').textContent, /Calibration profile saved/);
  assert.deepEqual(JSON.parse(localStorage.getItem(KEY)), { 'rig|48000': JSON.stringify(profile) });
});

test('actual calibration Delete keeps the profile and reports failure until storage accepts the deletion', async t => {
  const f = await mount(t), before = localStorage.getItem(KEY), events = [];
  t.after(state.on('calibration', () => events.push(localStorage.getItem(KEY))));
  const button = f.q('cal-list').querySelectorAll('button').find(node => node.getAttribute('aria-label')?.startsWith('Delete profile'));
  const write = localStorage.setItem; let deny = true;
  t.mock.method(localStorage, 'setItem', (key, text) => { if (key === KEY && deny) throw Error('quota'); write(key, text); });
  await confirmDelete(button);
  assert.equal(localStorage.getItem(KEY), before); assert.deepEqual(events, []);
  assert.match(f.q('cal-list').textContent, /Rig/); assert.match(document.getElementById('toasts').textContent, /could not be deleted/);
  assert.doesNotMatch(document.getElementById('toasts').textContent, /Profile deleted\./);
  deny = false; document.getElementById('toasts').replaceChildren(); await confirmDelete(button);
  assert.equal(localStorage.getItem(KEY), '{}'); assert.deepEqual(events, ['{}']);
  assert.match(f.q('cal-list').textContent, /No profiles yet/); assert.match(document.getElementById('toasts').textContent, /Profile deleted\./);
});
