import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { installCertificateDom, settle } from './fixtures/certificate-screen-dom.mjs';
import { buildExport, serializeExport } from '../app/phone-run.js';
const document = installCertificateDom({ after });
const { announce } = await import('../app/ui/live.js');
const { registerScreens, go } = await import('../app/ui/shell.js');
const { active, store, workspace } = await import('../app/ui/state.js');
const { createVerifyScreen } = await import('../app/ui/screens/verify.js');
const { createPhoneImportScreen } = await import('../app/ui/workflows/import-phone.js');
const polite = document.getElementById('sr-polite'), assertive = document.getElementById('sr-assertive');
const host = document.createElement('section'); host.id = 'screen-announcement-test'; document.getElementById('main').append(host);
const original = serializeExport(buildExport({ createdAt: '2026-11-19T18:00:00Z', device: {}, assetHint: {},
  measurements: [{ metricId: 'speed.rpm', label: 'Speed', value: 33, unit: 'rpm' }] }));
function setup(t, create = node => { node.innerHTML = '<h1>Test</h1>'; return {}; }) {
  t.mock.timers.enable({ apis: ['setTimeout'] }); active.screen = null; host.replaceChildren(); host.hidden = true;
  registerScreens([{ id: 'announcement-test', title: 'Test', icon: 'info', create },
    { id: 'other', title: 'Other', icon: 'info', create: () => ({}) }]);
  go('announcement-test'); t.mock.timers.tick(40); polite.textContent = ''; assertive.textContent = '';
  t.after(() => t.mock.timers.tick(100));
}
test('normal polite and assertive announcements retain independent channels and delay', t => {
  setup(t); announce('Routine update'); announce('Attention needed', { assertive: true });
  t.mock.timers.tick(39); assert.equal(polite.textContent, ''); assert.equal(assertive.textContent, '');
  t.mock.timers.tick(1); assert.equal(polite.textContent, 'Routine update'); assert.equal(assertive.textContent, 'Attention needed');
  announce('Routine update'); assert.equal(polite.textContent, ''); t.mock.timers.tick(40);
  assert.equal(polite.textContent, 'Routine update', 'the same message can be announced again');
});
for (const urgent of [false, true]) test(`newer ${urgent ? 'assertive' : 'polite'} message retires the older timer`, t => {
  setup(t); const target = urgent ? assertive : polite;
  announce('Retired update', { assertive: urgent }); t.mock.timers.tick(20);
  announce('Current update', { assertive: urgent }); t.mock.timers.tick(20);
  assert.equal(target.textContent, '', 'the older message must not briefly appear while the current message is pending');
  t.mock.timers.tick(20); assert.equal(target.textContent, 'Current update');
});
test('an already retired guarded announcement leaves current feedback intact', t => {
  setup(t); polite.textContent = 'Current feedback'; announce('Obsolete feedback', { isCurrent: () => false });
  assert.equal(polite.textContent, 'Current feedback'); t.mock.timers.tick(40); assert.equal(polite.textContent, 'Current feedback');
});
test('announcement ownership is rechecked at delayed delivery', t => {
  setup(t); let current = true; announce('Obsolete feedback', { isCurrent: () => current });
  current = false; polite.textContent = 'Replacement feedback'; t.mock.timers.tick(40); assert.equal(polite.textContent, 'Replacement feedback');
});
for (const revisit of [false, true]) test(`actual shell navigation retires pending assertive feedback${revisit ? ' even on immediate return' : ''}`, t => {
  setup(t); announce('Error from previous screen', { assertive: true }); t.mock.timers.tick(20);
  go('other'); if (revisit) go('announcement-test'); t.mock.timers.tick(20);
  assert.equal(assertive.textContent, '', 'a previous screen error must not appear after navigation');
  t.mock.timers.tick(20); assert.equal(polite.textContent, revisit ? 'Test screen' : 'Other screen');
});
test('reselecting the current screen preserves its pending announcement', t => {
  setup(t); announce('Current view update'); go('announcement-test'); t.mock.timers.tick(40); assert.equal(polite.textContent, 'Current view update');
});
test('Verify Escape retires its queued result announcement', async t => {
  window.__TAURI__ = { core: { invoke: async () => [] } }; t.after(() => { delete window.__TAURI__; }); let screen;
  setup(t, node => (screen = createVerifyScreen(node, { api: { native: true,
    verify: async () => ({ status: 'unverifiable', reasons: ['Test verification unavailable'] }) } })));
  const input = host.querySelector('#verify-file'); input.files = [{ name: 'sample.json', size: 2, arrayBuffer: async () => new TextEncoder().encode('{}').buffer }];
  input.dispatch('change'); await settle(); assert.equal(host.querySelector('#verify-result').hidden, false);
  assert.equal(screen.onEscape(), true); t.mock.timers.tick(40); assert.equal(assertive.textContent, ''); assert.equal(host.querySelector('#verify-result').hidden, true);
});
for (const contents of [original, 'not a result']) test(`phone Clear retires queued ${contents === original ? 'read success' : 'read failure'} feedback`, async t => {
  t.mock.method(store, 'list', async () => []); setup(t, node => createPhoneImportScreen(node)); await settle();
  host.querySelector('#pi-text').value = contents; host.querySelector('#pi-read').dispatch('click'); host.querySelector('#pi-clear').dispatch('click');
  t.mock.timers.tick(40); assert.equal(polite.textContent, ''); assert.equal(host.querySelector('#pi-text').value, '');
});
test('phone Clear retires a queued save message without undoing its completed write', async t => {
  t.mock.method(store, 'list', async () => []); const saved = []; t.mock.method(store, 'saveRun', async run => { saved.push(run.id); });
  const previous = workspace.runs; workspace.runs = []; t.after(() => { workspace.runs = previous; });
  setup(t, node => createPhoneImportScreen(node)); await settle(); host.querySelector('#pi-text').value = original;
  host.querySelector('#pi-read').dispatch('click'); t.mock.timers.tick(40);
  const button = host.querySelector('#pi-import'); await button.listeners.click[0].callback({ target: button, currentTarget: button });
  host.querySelector('#pi-clear').dispatch('click'); t.mock.timers.tick(40);
  assert.equal(polite.textContent, ''); assert.equal(saved.length, 1); assert.equal(workspace.runs[0].id, saved[0]); assert.equal(host.querySelector('#pi-done') === null, true);
});
