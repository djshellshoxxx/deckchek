import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, installNativeCatalogDom, settle } from './fixtures/native-catalog-archive-dom.mjs';
const document = installNativeCatalogDom({ after });
window.addEventListener = () => {}; window.removeEventListener = () => {};
const state = await import('../app/ui/state.js');
const { createDataScreen } = await import('../app/ui/screens/data.js');
const KEY = 'deckchek.workspace.v1';
const data = (id, count = 1) => ({ version: 1, equipment: [{ id: `${id}-unit`, name: id }], runs: Array.from({ length: count }, (_, i) => ({ id: `${id}-${i}`, test: 'quick', createdAt: '2026-11-19T12:00:00Z', measurements: [], findings: [] })) });
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
function file(value, pending) { const contents = bytes(value); return { name: 'workspace.json', size: contents.length, arrayBuffer: () => pending ? pending.promise : Promise.resolve(contents.slice().buffer) }; }
beforeEach(() => {
  delete window.__TAURI__; state.workspace.equipment = [{ id: 'old-unit', name: 'Before import' }]; state.workspace.runs = []; state.saveWorkspace();
  for (const id of ['sr-polite', 'sr-assertive', 'toasts']) document.getElementById(id).replaceChildren();
});
function pickers() { return document.body.children.filter(node => node.tagName === 'INPUT' && node.type === 'file'); }
async function mount(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = document.createElement('section'); document.body.append(host); const screen = createDataScreen(host); await settle();
  t.after(() => { screen.dispose(); host.remove(); for (const input of pickers()) input.dispatch('cancel'); });
  return { host, screen, q: id => host.querySelector(`#${id}`) };
}
function start(f) {
  const button = f.q('data-import-json'), pending = button.listeners.click[0].callback({ target: button, currentTarget: button });
  return { pending, chooser: pickers().at(-1), button };
}
function select(operation, selected) { assert.ok(operation.chooser); operation.chooser.files = [selected]; operation.chooser.dispatch('change'); }
function controls(f, disabled) { for (const id of ['data-import-json', 'data-export-json']) assert.equal(f.q(id).disabled, disabled, `${id} reflects workspace ownership`); }
function reenter(f) { f.screen.onHide(); f.screen.onShow(); }
test('browser workspace success releases its lease and reports committed data', async t => {
  const f = await mount(t), writes = []; t.mock.method(state.store, 'saveRun', async value => { writes.push(value.id); });
  const op = start(f); select(op, file(data('current', 2))); await op.pending; await settle();
  assert.deepEqual(writes, ['current-0', 'current-1']); assert.match(f.q('data-status').textContent, /Imported 2 run\(s\) and 1 equipment/);
  assert.deepEqual(JSON.parse(localStorage.getItem(KEY)).runs.map(r => r.id), writes); controls(f, false);
});
test('browser workspace import exposes busy controls and allows only one chooser', async t => {
  const f = await mount(t), op = start(f); await settle();
  const disabled = ['data-import-json', 'data-export-json'].map(id => f.q(id).disabled);
  const second = op.button.listeners.click[0].callback({ target: op.button }); const count = pickers().length;
  for (const input of pickers()) input.dispatch('cancel'); await Promise.all([op.pending, second]); await settle();
  assert.equal(count, 1, 'repeated handler cannot open another chooser'); assert.deepEqual(disabled, [true, true]); controls(f, false);
});
test('browser workspace mirroring retains ownership and blocks overlapping imports', async t => {
  const f = await mount(t), mirror = deferred(), writes = [];
  t.mock.method(state.store, 'saveRun', value => { writes.push(value.id); return mirror.promise; });
  const first = start(f); select(first, file(data('first'))); await settle();
  const committed = state.workspace.runs[0].id, disabled = f.q('data-import-json').disabled;
  const second = start(f), count = pickers().length; for (const input of pickers()) input.dispatch('cancel');
  mirror.resolve(); await Promise.all([first.pending, second.pending]); await settle();
  assert.equal(count, 0, 'a second import cannot open a chooser before mirroring finishes'); assert.equal(disabled, true);
  assert.equal(committed, 'first-0'); assert.deepEqual(writes, ['first-0']); controls(f, false);
  assert.equal(JSON.parse(localStorage.getItem(KEY)).runs[0].id, 'first-0');
});
for (const outcome of ['resolve', 'reject']) test(`mirror ${outcome} after Data hide/show preserves submitted data without obsolete feedback`, async t => {
  const f = await mount(t), mirror = deferred(), writes = [];
  t.mock.method(state.store, 'saveRun', value => { writes.push(value.id); return mirror.promise; });
  const op = start(f); select(op, file(data('saved'))); await settle(); assert.deepEqual(writes, ['saved-0']); reenter(f); await settle();
  const currentImportButton = f.q('data-import-json'), currentExportButton = f.q('data-export-json');
  const before = f.q('data-status').textContent; document.getElementById('sr-polite').textContent = 'Current screen'; document.getElementById('sr-assertive').textContent = 'Current alert';
  if (outcome === 'resolve') mirror.resolve(); else mirror.reject(new Error('Mirror unavailable'));
  await op.pending; await settle(); t.mock.timers.tick(40);
  assert.equal(f.q('data-status').textContent, before); assert.equal(document.getElementById('sr-polite').textContent, 'Current screen');
  assert.equal(document.getElementById('sr-assertive').textContent, 'Current alert'); assert.equal(state.workspace.runs[0].id, 'saved-0');
  assert.equal(JSON.parse(localStorage.getItem(KEY)).runs[0].id, 'saved-0'); assert.equal(writes.length, 1); controls(f, false);
  assert.equal(f.q('data-import-json') === currentImportButton, true, 'lease release keeps the reopened controls attached');
  assert.equal(f.q('data-export-json') === currentExportButton, true);
});
for (const outcome of ['resolve', 'reject']) test(`old Data file read ${outcome} cannot commit or report after hide/show`, async t => {
  const f = await mount(t), reading = deferred(), before = localStorage.getItem(KEY), writes = [];
  t.mock.method(state.store, 'saveRun', value => { writes.push(value.id); });
  const incoming = data('retired'), op = start(f); select(op, file(incoming, reading)); await settle(); reenter(f); await settle();
  const message = f.q('data-status').textContent; document.getElementById('sr-polite').textContent = 'Current screen'; document.getElementById('sr-assertive').textContent = 'Current alert';
  if (outcome === 'resolve') reading.resolve(bytes(incoming).buffer); else reading.reject(new Error('Retired read failed'));
  await op.pending; await settle(); t.mock.timers.tick(40);
  assert.equal(localStorage.getItem(KEY), before); assert.deepEqual(writes, []); assert.equal(f.q('data-status').textContent, message);
  assert.equal(document.getElementById('sr-polite').textContent, 'Current screen'); assert.equal(document.getElementById('sr-assertive').textContent, 'Current alert'); controls(f, false);
});
for (const retirement of ['hide', 'dispose']) test(`browser workspace chooser retires on ${retirement} and ignores later events`, async t => {
  const f = await mount(t), writes = [], before = localStorage.getItem(KEY), op = start(f);
  t.mock.method(state.store, 'saveRun', value => { writes.push(value.id); });
  if (retirement === 'dispose') f.screen.dispose(); else reenter(f); await settle();
  const connected = op.chooser.isConnected, text = f.host.textContent;
  op.chooser.files = [file(data('retired'))]; op.chooser.dispatch('change'); op.chooser.dispatch('cancel'); await op.pending; await settle();
  assert.equal(connected, false); assert.deepEqual(writes, []); assert.equal(localStorage.getItem(KEY), before); assert.equal(f.host.textContent, text);
  if (retirement === 'hide') controls(f, false);
});
