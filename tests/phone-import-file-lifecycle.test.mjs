import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, installNativeCatalogDom, settle } from './fixtures/native-catalog-archive-dom.mjs';
import { buildExport, serializeExport, MAX_BYTES } from '../app/phone-run.js';
const document = installNativeCatalogDom({ after });
const { createPhoneImportScreen } = await import('../app/ui/workflows/import-phone.js');
const { store } = await import('../app/ui/state.js');
const encode = value => new TextEncoder().encode(value);
const raw = notes => serializeExport(buildExport({ createdAt: '2026-11-19T18:00:00Z', notes,
  device: { userAgent: 'Test phone', sampleRate: 48000 }, assetHint: { nickname: 'Café deck', serial: 'UNIT-7' },
  measurements: [{ metricId: 'speed.rpm', label: 'Speed', value: 33, unit: 'rpm' }] }));
const original = raw('Original observation'), newer = raw('Newer observation');
async function mount(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] }); t.mock.method(store, 'list', async () => []);
  const host = document.createElement('section'); document.body.append(host);
  const screen = createPhoneImportScreen(host); await settle(); t.after(() => host.remove());
  return { host, screen, q: id => host.querySelector(`#${id}`) };
}
function file(contents = original, operation) {
  const bytes = encode(contents);
  return { name: 'result.deckchek-mobile.json', size: bytes.length, reads: 0,
    arrayBuffer() { this.reads++; return operation ? operation() : Promise.resolve(bytes.slice().buffer); } };
}
function choose(f, selected) {
  const button = f.q('pi-file'), pending = button.listeners.click[0].callback({ target: button, currentTarget: button });
  const picker = document.body.children.find(n => n.tagName === 'INPUT' && n.type === 'file');
  assert.ok(picker); picker.files = selected ? [selected] : []; picker.dispatch('change'); return pending;
}
function read(f, value) { f.q('pi-text').value = value; f.q('pi-read').dispatch('click'); }
function snapshot(f) { return { value: f.q('pi-text').value, status: f.q('pi-status').textContent, preview: f.q('pi-preview').textContent }; }
test('phone reads one Unicode file snapshot and shows its valid hash', async t => {
  const f = await mount(t), selected = file(); await choose(f, selected); await settle();
  assert.equal(selected.reads, 1); assert.equal(f.q('pi-text').value, original);
  assert.match(f.q('pi-preview').textContent, /Café deck/); assert.match(f.q('pi-preview').textContent, /Hash matches/);
});
test('phone read failure is caught and preserves the existing preview', async t => {
  const f = await mount(t); read(f, newer); const before = snapshot(f);
  await assert.doesNotReject(choose(f, file(original, async () => { throw new Error('File access interrupted'); })));
  assert.equal(f.q('pi-text').value, before.value); assert.equal(f.q('pi-preview').textContent, before.preview);
  assert.match(f.q('pi-status').textContent, /File access interrupted/);
});
test('phone cancellation preserves the current result', async t => {
  const f = await mount(t); read(f, newer); const before = snapshot(f); await choose(f, null); assert.deepEqual(snapshot(f), before);
});
test('phone keeps its decimal one-million-byte limit before reading', async t => {
  const f = await mount(t), selected = file(); selected.size = MAX_BYTES + 1;
  assert.equal(MAX_BYTES, 1_000_000); await choose(f, selected); assert.equal(selected.reads, 0);
  assert.match(f.q('pi-status').textContent, /larger than 1 MB/);
});
for (const action of ['clear', 'type', 'read', 'hide']) for (const outcome of ['resolve', 'reject']) {
  test(`pending phone file ${outcome} cannot overwrite later ${action}`, async t => {
    const f = await mount(t), pending = deferred(), operation = choose(f, file(original, () => pending.promise)); await settle();
    if (action === 'clear') f.q('pi-clear').dispatch('click');
    else if (action === 'type') { f.q('pi-text').value = 'Text still being entered'; f.q('pi-text').dispatch('input'); }
    else if (action === 'read') read(f, newer);
    else { f.host.hidden = true; f.screen.onHide(); }
    const before = snapshot(f);
    if (outcome === 'resolve') pending.resolve(encode(original).buffer); else pending.reject(new Error('Older read failed'));
    await operation; await settle(); assert.deepEqual(snapshot(f), before);
  });
}
test('a newer phone selection owns the result when the earlier read finishes last', async t => {
  const f = await mount(t), pending = deferred(), older = choose(f, file(original, () => pending.promise)); await settle();
  await choose(f, file(newer)); pending.resolve(encode(original).buffer); await older; await settle();
  assert.equal(f.q('pi-text').value, newer); assert.match(f.q('pi-preview').textContent, /Newer observation/);
  assert.doesNotMatch(f.q('pi-preview').textContent, /Original observation/);
});
