import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryScreen } from '../app/ui/screens/history.js';
import { store } from '../app/ui/state.js';
import { configureFeatures } from '../app/features.js';
import { cancelPendingAnnouncements } from '../app/ui/live.js';
import { installServiceDom, deferred, settle } from './fixtures/service-screen-dom.mjs';

async function mount(t, { reply = async () => [], diagnostics = async () => [], features = { humHunter: true } } = {}) {
  const document = installServiceDom(t), calls = [];
  localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features }));
  configureFeatures({ storage: localStorage });
  t.mock.method(store, 'listRuns', diagnostics);
  window.__TAURI__ = { core: { invoke: async (command, args) => { calls.push({ command, args }); return reply(command, args, calls.length); } } };
  const section = document.createElement('section');
  document.getElementById('main').append(section);
  const screen = createHistoryScreen(section);
  t.after(() => {
    section.hidden = true; cancelPendingAnnouncements();
    for (const close of document.getElementById('toasts').querySelectorAll('.toast-close')) close.dispatch('click');
    section.remove(); configureFeatures();
  });
  screen.onShow(); await settle();
  return { section, screen, calls, q: selector => section.querySelector(selector) };
}

test('History keeps a persistent incomplete state until a retry confirms an empty feature list', async t => {
  let response = null;
  const f = await mount(t, { reply: async () => response });
  assert.equal(f.q('#hist-load-warning').hidden, false);
  assert.match(f.q('#hist-load-warning').textContent, /Hum hunter could not be loaded/);
  assert.match(f.q('#hist-rows').textContent, /Saved history could not be fully loaded/);
  assert.doesNotMatch(f.q('#hist-rows').textContent, /No saved runs yet/);
  assert.equal(f.q('#hist-count').textContent, '0 of 0 loaded');
  assert.deepEqual(f.calls.map(c => c.command), ['hum_run_list']);
  response = [];
  f.q('#hist-load-warning').querySelector('button').dispatch('click'); await settle();
  assert.equal(f.q('#hist-load-warning').hidden, true);
  assert.match(f.q('#hist-rows').textContent, /No saved runs yet/);
  assert.equal(f.q('#hist-count').textContent, '0 of 0');
  assert.equal(f.calls.length, 2);
});

test('History preserves valid neighbouring rows and labels filtered partial counts as loaded', async t => {
  const f = await mount(t, { reply: async () => [
    { id: 'valid', createdAt: '2026-11-20T12:00:00Z', verdict: 'Quiet' },
    { id: 'private-invalid-record', detail: 'private row detail' },
  ] });
  assert.equal(f.section.querySelectorAll('[data-run-type="hum"]').length, 1);
  assert.equal(f.q('#hist-count').textContent, '1 of 1 loaded');
  assert.match(f.q('#hist-load-warning').textContent, /1 invalid record could not be listed/);
  assert.doesNotMatch(f.q('#hist-load-warning').textContent, /private-invalid-record|private row detail/);
  assert.match(f.q('#hist-type').textContent, /All loaded runs \(1\)/);
  const search = f.q('#hist-search'); search.value = 'no matching run'; search.dispatch('input');
  assert.equal(f.q('#hist-count').textContent, '0 of 1 loaded');
  assert.match(f.q('#hist-rows').textContent, /No loaded runs match this filter/);
  assert.equal(f.q('#hist-load-warning').hidden, false);
});

test('History does not request disabled feature lists', async t => {
  const f = await mount(t, { features: {}, reply: async () => { throw new Error('Disabled source must not run'); } });
  assert.equal(f.calls.length, 0);
  assert.equal(f.q('#hist-load-warning').hidden, true);
  assert.match(f.q('#hist-rows').textContent, /No saved runs yet/);
});

test('History ignores an older failed load after the latest load succeeds', async t => {
  const old = deferred();
  const f = await mount(t, { reply: async (_command, _args, count) => count === 1 ? old.promise : [] });
  f.screen.onShow(); await settle();
  assert.match(f.q('#hist-rows').textContent, /No saved runs yet/);
  old.reject(new Error('Retired load failed')); await settle();
  assert.equal(f.calls.length, 2);
  assert.equal(f.q('#hist-load-warning').hidden, true);
  assert.match(f.q('#hist-rows').textContent, /No saved runs yet/);
  assert.equal(f.q('#hist-count').textContent, '0 of 0');
});

test('History checks feature visibility again before publishing a pending result', async t => {
  const pending = deferred();
  const f = await mount(t, { reply: async () => pending.promise });
  localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: {} }));
  pending.resolve([{ id: 'hidden-run', createdAt: '2026-11-20T12:00:00Z' }, null]); await settle();
  assert.equal(f.calls.length, 1);
  assert.equal(f.section.querySelectorAll('[data-run-type="hum"]').length, 0);
  assert.equal(f.q('#hist-load-warning').hidden, true);
  assert.equal(f.q('#hist-count').textContent, '0 of 0');
});

test('History distinguishes a failed diagnostic list from confirmed empty history', async t => {
  const f = await mount(t, { features: {}, diagnostics: async () => { throw new Error('Storage unavailable'); } });
  assert.equal(f.calls.length, 0);
  assert.match(f.q('#hist-load-warning').textContent, /Diagnostics could not be loaded/);
  assert.doesNotMatch(f.q('#hist-rows').textContent, /No saved runs yet/);
  assert.equal(f.q('#hist-count').textContent, '0 of 0 loaded');
});

for (const reason of [new Error(''), '']) {
  test(`History keeps an empty ${typeof reason} rejection distinct from confirmed empty history`, async t => {
    const f = await mount(t, { features: {}, diagnostics: async () => { throw reason; } });
    assert.equal(f.q('#hist-load-warning').hidden, false);
    assert.match(f.q('#hist-load-warning').textContent, /Diagnostics could not be loaded/);
    assert.doesNotMatch(f.q('#hist-rows').textContent, /No saved runs yet/);
    assert.equal(f.q('#hist-count').textContent, '0 of 0 loaded');
  });
}
