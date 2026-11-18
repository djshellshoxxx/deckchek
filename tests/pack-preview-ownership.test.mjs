import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installNativeCatalogDom, deferred, settle } from './fixtures/native-catalog-archive-dom.mjs';

// Drive the production screen and its real event callbacks. Only the asynchronous
// pack API boundary is controlled; the pack builder and metric whitelist are real.
const document = installNativeCatalogDom({ after });
window.addEventListener = () => {};
window.removeEventListener = () => {};
const { createCompareScreen } = await import('../app/ui/screens/compare.js');
const { configureFeatures, bindSettings } = await import('../app/features.js');
const { buildPack, createMetricRegistry } = await import('../app/pack.js');
const { exportRow } = await import('../app/pack-api.js');
const table = JSON.parse(readFileSync(new URL('../app/population-metrics.json', import.meta.url), 'utf8'));
const registry = createMetricRegistry(table);
const EXPORTED_KEY = 'deckchek.packs.exported.v1';

async function mount(t, { version, saveResult } = {}) {
  window.__TAURI__ = { core: { invoke: async () => [] }, app: { getVersion: () => version?.promise ?? Promise.resolve('0.1.0') } };
  configureFeatures({ storage: localStorage });
  bindSettings({ features: { packs: true, population: true } });
  localStorage.setItem(EXPORTED_KEY, 'false');
  const pending = [], saves = [], writes = [];
  const rows = [
    { assetId: 'private-a', nickname: 'Private unit', productKey: 'profile-a', metric: 'dropout_count', methodKey: 'dropout_count', methodVersion: 1, value: 2, unit: table.metrics.dropout_count.unit, at: '2026-11-01T00:00:00Z' },
    { assetId: 'private-a', nickname: 'Private unit', productKey: 'profile-a', metric: 'wow_flutter_rms_percent', methodKey: 'wow_flutter_rms_percent', methodVersion: 1, value: 0.12, unit: '%', at: '2026-11-01T00:00:00Z' },
  ];
  const api = {
    native: true,
    metricTable: async () => table,
    unitValues: async () => ({ rows, skippedUnit: 0, skippedUnattributed: 0, truncated: false }),
    list: async () => [],
    contributor: async () => 'replacement-token',
    buildPreview(selected, options) {
      const gate = deferred();
      pending.push({ rows: structuredClone(selected), options: structuredClone(options), gate, settled: false });
      return gate.promise;
    },
    async savePack(selected, options) {
      saves.push({ rows: structuredClone(selected.map(exportRow)), options: structuredClone(options) });
      const gate = deferred();
      if (saveResult) { writes.push(gate); return gate.promise; }
      return { cancelled: true };
    },
  };
  const section = document.createElement('section'); document.body.append(section);
  const screen = createCompareScreen(section, { api });
  await screen.reload();
  assert.ok(section.querySelector('#cmp-export'), 'real native Compare export entrypoint');

  async function complete(index, error = null, value) {
    const request = pending[index]; assert.ok(request, `preview request ${index}`);
    const pack = value === undefined ? buildPack({ rows: request.rows, appVersion: request.options.appVersion,
      packId: request.options.packId ?? `preview-${index}`, createdMonth: request.options.createdMonth ?? '2026-11', contributor: `token-${index}` }, { metricRegistry: registry }) : value;
    request.settled = true;
    if (error) request.gate.reject(error); else request.gate.resolve(pack);
    await settle(); return pack;
  }
  const dialogs = () => document.querySelectorAll('dialog').filter(node => node.open && node.isConnected);
  async function open() {
    section.querySelector('#cmp-export').click(); await settle();
    const dialog = dialogs().at(-1); assert.ok(dialog, 'real export dialog opened');
    return {
      dialog, save: dialog.querySelector('#cmp-exp-save'), preview: dialog.querySelector('#cmp-json'), error: dialog.querySelector('#cmp-exp-error'),
      choose(index, checked) { const box = dialog.querySelector(`#cmp-cell-${index}`); assert.ok(box); box.checked = checked; box.dispatch('change'); return box; },
      cancel() { dialog.querySelector('[data-initial]').click(); },
    };
  }
  t.after(async () => {
    for (let i = 0; i < pending.length; i++) if (!pending[i].settled) await complete(i);
    for (const gate of writes) gate.resolve({ cancelled: true });
    screen.destroy();
    for (const dialog of dialogs()) dialog.close();
    await settle(); section.remove(); configureFeatures();
  });
  return { section, screen, pending, saves, writes, open, complete, dialogs };
}

test('pack export control: a completed current preview owns the saved rows and metadata', async t => {
  const s = await mount(t), d = await s.open(); d.choose(0, true);
  const shown = await s.complete(0);
  assert.deepEqual(JSON.parse(d.preview.textContent), shown);
  assert.equal(d.save.disabled, false); d.save.click(); await settle();
  assert.deepEqual(s.saves, [{ rows: shown.rows, options: { packId: shown.packId, createdMonth: shown.createdMonth, contributor: shown.contributor } }]);
});

test('an empty selection cannot export even through a retained disabled-button handler', async t => {
  const s = await mount(t), d = await s.open();
  assert.equal(d.save.disabled, true); d.save.dispatch('click'); await settle();
  assert.equal(s.saves.length, 0); assert.equal(s.pending.length, 0);
});

test('a pending current preview keeps Save ineligible and clears the preceding preview', async t => {
  const s = await mount(t), d = await s.open(); d.choose(0, true);
  const old = await s.complete(0); d.choose(1, true);
  d.save.click(); d.save.dispatch('click'); await settle();
  assert.equal(s.saves.length, 0, 'pending selected data was not previewed');
  assert.equal(d.save.disabled, true);
  assert.notEqual(d.preview.textContent, JSON.stringify(old, null, 2), 'the older selection must not look current');
});

test('reverse preview completion preserves the newest selection, displayed pack and save metadata', async t => {
  const s = await mount(t), d = await s.open(); d.choose(0, true); d.choose(0, false); d.choose(1, true);
  const current = await s.complete(1); await s.complete(0);
  assert.deepEqual(JSON.parse(d.preview.textContent), current);
  d.save.click(); await settle();
  assert.deepEqual(s.saves, [{ rows: current.rows, options: { packId: current.packId, createdMonth: current.createdMonth, contributor: current.contributor } }]);
});

test('an older preview error cannot replace a newer successful preview or disable its Save', async t => {
  const s = await mount(t), d = await s.open(); d.choose(0, true); d.choose(1, true);
  const current = await s.complete(1); await s.complete(0, Error('retired preview failure'));
  assert.equal(d.preview.textContent, JSON.stringify(current, null, 2));
  assert.equal(d.error.textContent, ''); assert.equal(d.save.disabled, false);
});

test('clearing all selected rows retires an outstanding preview and its save eligibility', async t => {
  const s = await mount(t), d = await s.open(); d.choose(0, true); d.choose(0, false);
  const emptyText = d.preview.textContent; await s.complete(0);
  assert.equal(d.preview.textContent, emptyText); assert.equal(d.save.disabled, true);
  d.save.dispatch('click'); await settle(); assert.equal(s.saves.length, 0);
});

test('failed or null current previews cannot dispatch a save through a synthetic event', async t => {
  const s = await mount(t);
  for (const nullReply of [false, true]) {
    const d = await s.open(); const index = s.pending.length; d.choose(0, true);
    await s.complete(index, nullReply ? null : Error('current preview failure'), nullReply ? null : undefined);
    assert.equal(d.save.disabled, true); d.save.dispatch('click'); await settle();
    assert.equal(s.saves.length, 0); d.cancel(); await settle();
  }
});

test('closed export dialogs retire pending replies and retained Save handlers', async t => {
  const s = await mount(t), old = await s.open(); old.choose(0, true); old.cancel(); await settle();
  const before = old.preview.textContent;
  const current = await s.open(); current.choose(1, true); const shown = await s.complete(1);
  await s.complete(0); old.save.dispatch('click'); await settle();
  assert.equal(old.preview.textContent, before, 'retired detached nodes stay retired');
  assert.equal(s.saves.length, 0); assert.deepEqual(JSON.parse(current.preview.textContent), shown);
});

test('hiding during export preparation cannot open a delayed dialog after the screen returns', async t => {
  const version = deferred(), s = await mount(t, { version });
  s.section.querySelector('#cmp-export').click(); await settle();
  s.screen.onHide(); s.screen.onShow(); await settle();
  version.resolve('0.1.0'); await settle();
  assert.equal(s.dialogs().length, 0, 'the retired preparation cannot open a modal');
  assert.equal(s.saves.length, 0);
});

test('hide and destruction retire open preview ownership without allowing a retained save', async t => {
  for (const destroy of [false, true]) {
    const s = await mount(t), d = await s.open(); d.choose(0, true);
    if (destroy) s.screen.destroy(); else s.screen.onHide();
    await settle(); assert.equal(d.dialog.isConnected, false);
    await s.complete(0); d.save.dispatch('click'); await settle();
    assert.equal(s.saves.length, 0);
  }
});

test('a dispatched save retains its completed snapshot and rejects duplicate or selection-change handlers', async t => {
  const s = await mount(t, { saveResult: true }), d = await s.open(); d.choose(0, true);
  const shown = await s.complete(0); d.save.click(); await settle();
  d.save.dispatch('click'); const box = d.choose(1, true); await settle();
  assert.equal(s.saves.length, 1); assert.equal(s.pending.length, 1);
  assert.equal(d.save.disabled, true); assert.equal(box.disabled, true);
  assert.deepEqual(s.saves[0], { rows: shown.rows, options: { packId: shown.packId, createdMonth: shown.createdMonth, contributor: shown.contributor } });
  s.writes[0].resolve({ cancelled: true }); await settle();
});

test('closing a dispatched save preserves the write but its completion cannot close or update a newer dialog', async t => {
  const s = await mount(t, { saveResult: true }), old = await s.open(); old.choose(0, true); await s.complete(0);
  old.save.click(); await settle(); old.cancel(); await settle();
  const current = await s.open(); current.choose(1, true); const shown = await s.complete(1);
  const status = s.section.querySelector('#cmp-status').textContent;
  s.writes[0].resolve({ cancelled: false, rows: 1, bytes: 321, sha256: 'a'.repeat(64) }); await settle();
  assert.equal(s.saves.length, 1, 'closing the dialog does not cancel or redispatch its API operation');
  assert.equal(current.dialog.open, true); assert.deepEqual(JSON.parse(current.preview.textContent), shown);
  assert.equal(s.section.querySelector('#cmp-status').textContent, status);
});

test('save failure permits a retry of the same completed preview without rebuilding or replacing it', async t => {
  const s = await mount(t, { saveResult: true }), d = await s.open(); d.choose(0, true);
  const shown = await s.complete(0); d.save.click(); await settle();
  s.writes[0].reject(Error('save failed')); await settle();
  assert.equal(d.save.disabled, false); assert.match(d.error.textContent, /save failed/);
  assert.deepEqual(JSON.parse(d.preview.textContent), shown);
  d.save.click(); await settle(); assert.equal(s.saves.length, 2); assert.deepEqual(s.saves[0], s.saves[1]); assert.equal(s.pending.length, 1);
  s.writes[1].resolve({ cancelled: true }); await settle();
});

test('a completed preview snapshot does not share mutable response objects with later save data', async t => {
  const s = await mount(t), d = await s.open(); d.choose(0, true);
  const returned = await s.complete(0), shown = JSON.parse(d.preview.textContent);
  returned.rows[0].value = 9; returned.packId = 'mutated-id'; returned.contributor = 'mutated-token';
  d.save.click(); await settle();
  assert.deepEqual(s.saves, [{ rows: shown.rows, options: { packId: shown.packId, createdMonth: shown.createdMonth, contributor: shown.contributor } }]);
});

test('sharing copy discloses creation-month metadata without claiming measurement dates are exported', async t => {
  const s = await mount(t), text = s.section.querySelector('#cmp-sharing').textContent;
  assert.match(text, /creation month/i);
  assert.doesNotMatch(text, /No serial numbers, names, dates or locations\./);
});

test('resetting the contributor token does not promise that remaining pack content is unlinkable', async t => {
  const s = await mount(t); s.section.querySelector('#cmp-reset-token').click(); await settle();
  const text = s.section.querySelector('#cmp-status').textContent;
  assert.match(text, /token reset/i);
  assert.doesNotMatch(text, /cannot be linked/i);
  assert.match(text, /contents? .*may still.*link|models?.*values?.*link/i);
});
