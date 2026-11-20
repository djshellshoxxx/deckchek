import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, installNativeCatalogDom, settle } from './fixtures/native-catalog-archive-dom.mjs';
import { buildExport, serializeExport } from '../app/phone-run.js';
const document = installNativeCatalogDom({ after });
const { createPhoneImportScreen } = await import('../app/ui/workflows/import-phone.js');
const { store, workspace } = await import('../app/ui/state.js');
const raw = notes => serializeExport(buildExport({ createdAt: '2026-11-19T18:00:00Z', notes,
  device: { userAgent: 'Test phone', sampleRate: 48000 }, assetHint: {},
  measurements: [{ metricId: 'speed.rpm', label: 'Speed', value: 33, unit: 'rpm' }] }));
const original = raw('Original observation'), newer = raw('Newer observation');
async function mount(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(store, 'list', async () => [{ id: 'asset-a', nickname: 'Deck A' }, { id: 'asset-b', nickname: 'Deck B' }]);
  const pending = deferred(), submitted = [];
  t.mock.method(store, 'saveRun', run => { submitted.push(structuredClone(run)); return pending.promise; });
  const beforeRuns = workspace.runs; workspace.runs = [];
  const host = document.createElement('section'); document.body.append(host);
  const screen = createPhoneImportScreen(host); await settle();
  const q = id => host.querySelector(`#${id}`);
  const read = value => { q('pi-text').value = value; q('pi-read').dispatch('click'); t.mock.timers.tick(50); };
  t.after(() => { host.remove(); workspace.runs = beforeRuns; });
  read(original); q('pi-asset').value = 'asset-a'; q('pi-asset').dispatch('change');
  return { host, screen, q, read, pending, submitted,
    save() { const button = q('pi-import'); return button.listeners.click[0].callback({ target: button, currentTarget: button }); } };
}
function markOtherFeedback() {
  document.getElementById('toasts').textContent = 'Other view toast';
  document.getElementById('sr-polite').textContent = 'Other view announcement';
}
function assertOtherFeedback() {
  assert.equal(document.getElementById('toasts').textContent, 'Other view toast');
  assert.equal(document.getElementById('sr-polite').textContent, 'Other view announcement');
}
for (const action of ['clear', 'read']) for (const outcome of ['resolve', 'reject']) {
  test(`older phone save ${outcome} preserves a later ${action} and the submitted run`, async t => {
    const f = await mount(t), operation = f.save();
    assert.equal(f.submitted.length, 1); assert.equal(f.submitted[0].assetId, 'asset-a');
    if (action === 'clear') f.q('pi-clear').dispatch('click'); else f.read(newer);
    const select = f.q('pi-asset');
    if (select) { select.value = 'asset-b'; select.dispatch('change'); select.focus(); }
    const focused = document.activeElement; markOtherFeedback();
    if (outcome === 'resolve') f.pending.resolve(); else f.pending.reject(new Error('Original database save failed'));
    await operation; await settle(); t.mock.timers.tick(50);
    assert.equal(f.q('pi-done') === null, true, 'the replacement result has no older completion panel'); assertOtherFeedback();
    assert.equal(f.q('pi-text').value, action === 'read' ? newer : '');
    assert.ok(f.q('pi-asset') === select, 'releasing the old save must preserve the replacement form');
    assert.ok(document.activeElement === focused, 'the newer focus stays on its original element');
    if (select) { assert.equal(select.value, 'asset-b'); assert.equal(f.q('pi-import').disabled, false); }
    assert.equal(workspace.runs.length, 1); assert.equal(workspace.runs[0].id, f.submitted[0].id);
    assert.equal(f.submitted.length, 1, 'the actual persistence operation remains exactly once');
  });
}
for (const outcome of ['resolve', 'reject']) {
  test(`hidden current phone save ${outcome} keeps its private completion without global feedback`, async t => {
    const f = await mount(t), operation = f.save(); f.host.hidden = true; f.screen.onHide(); markOtherFeedback();
    if (outcome === 'resolve') f.pending.resolve(); else f.pending.reject(new Error('Database unavailable'));
    await operation; await settle(); t.mock.timers.tick(50); assertOtherFeedback();
    assert.match(f.q('pi-done').textContent, outcome === 'resolve' ? /Added to History/ : /Kept in this window/);
    f.host.hidden = false; f.screen.onShow(); await settle();
    assert.match(f.q('pi-done').textContent, outcome === 'resolve' ? /Added to History/ : /Kept in this window/);
    assert.equal(f.q('pi-import').disabled, false); assert.equal(f.submitted.length, 1);
  });
}
for (const outcome of ['resolve', 'reject']) {
  test(`current phone save ${outcome} reports its actual persistence outcome`, async t => {
    const f = await mount(t), operation = f.save(); document.getElementById('toasts').replaceChildren();
    if (outcome === 'resolve') f.pending.resolve(); else f.pending.reject(new Error('Database unavailable'));
    await operation; await settle(); t.mock.timers.tick(50);
    assert.match(f.q('pi-done').textContent, outcome === 'resolve' ? /Added to History/ : /Kept in this window/);
    assert.match(document.getElementById('toasts').textContent, outcome === 'resolve' ? /added to History/ : /database save failed/);
    assert.match(document.getElementById('sr-polite').textContent, outcome === 'resolve' ? /added to History/ : /kept in this window/i);
    assert.equal(f.q('pi-import').disabled, false); assert.equal(f.submitted.length, 1);
  });
}
