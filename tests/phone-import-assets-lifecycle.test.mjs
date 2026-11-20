import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, installNativeCatalogDom, settle } from './fixtures/native-catalog-archive-dom.mjs';
import { buildExport, serializeExport } from '../app/phone-run.js';
const document = installNativeCatalogDom({ after });
const { createPhoneImportScreen } = await import('../app/ui/workflows/import-phone.js');
const { store } = await import('../app/ui/state.js');
const raw = serializeExport(buildExport({ createdAt: '2026-11-19T18:00:00Z', device: {}, assetHint: {},
  measurements: [{ metricId: 'speed.rpm', label: 'Speed', value: 33, unit: 'rpm' }] }));
for (const outcome of ['resolve', 'reject']) test(`an older phone asset refresh ${outcome} preserves the newer list and selected control`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const old = deferred(), current = deferred(); let calls = 0;
  t.mock.method(store, 'list', () => (++calls === 1 ? old.promise : current.promise));
  const host = document.createElement('section'); document.body.append(host); t.after(() => host.remove());
  const screen = createPhoneImportScreen(host); screen.onShow();
  host.querySelector('#pi-text').value = raw; host.querySelector('#pi-read').dispatch('click');
  current.resolve([{ id: 'new-a', nickname: 'Current deck A' }, { id: 'new-b', nickname: 'Current deck B' }]);
  await settle(); const selected = host.querySelector('#pi-asset');
  selected.value = 'new-b'; selected.dispatch('change'); selected.focus();
  if (outcome === 'resolve') old.resolve([{ id: 'old', nickname: 'Retired catalog snapshot' }]);
  else old.reject(new Error('Earlier catalog load failed'));
  await settle();
  assert.equal(host.querySelector('#pi-asset') === selected, true, 'a superseded response must not recreate the selected form control');
  assert.equal(document.activeElement === selected, true);
  assert.equal(selected.value, 'new-b');
  assert.deepEqual(selected.options.map(option => option.value), ['', 'new-a', 'new-b']);
});

for (const outcome of ['resolve', 'reject']) test(`hidden phone asset refresh ${outcome} stays retired and return loads a fresh list`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const base = [{ id: 'deck-a', nickname: 'Deck A' }, { id: 'deck-b', nickname: 'Deck B' }];
  const hidden = deferred(), returned = deferred(); let calls = 0;
  t.mock.method(store, 'list', () => {
    calls++;
    return calls === 1 ? Promise.resolve(base) : calls === 2 ? hidden.promise : returned.promise;
  });
  const host = document.createElement('section'); document.body.append(host);
  const other = document.createElement('button'); document.body.append(other);
  t.after(() => { t.mock.timers.tick(100); host.remove(); other.remove(); });
  const screen = createPhoneImportScreen(host); await settle();
  host.querySelector('#pi-text').value = raw; host.querySelector('#pi-read').dispatch('click');
  const selected = host.querySelector('#pi-asset'); selected.value = 'deck-b'; selected.dispatch('change'); selected.focus();
  screen.onShow(); assert.equal(calls, 2);
  host.hidden = true; screen.onHide(); other.focus();
  if (outcome === 'resolve') hidden.resolve([{ id: 'retired', nickname: 'Retired response' }]);
  else hidden.reject(new Error('Read completed after hiding'));
  await settle();
  assert.equal(host.querySelector('#pi-asset') === selected, true, 'a hidden read must not recreate the cached selector');
  assert.equal(document.activeElement === other, true, 'the active screen keeps its focus');
  assert.equal(selected.value, 'deck-b');
  assert.deepEqual(selected.options.map(option => option.value), ['', 'deck-a', 'deck-b']);
  host.hidden = false; screen.onShow(); assert.equal(calls, 3, 'returning starts a new catalog read');
  returned.resolve([...base, { id: 'deck-c', nickname: 'Deck C' }]); await settle();
  const current = host.querySelector('#pi-asset');
  assert.equal(current.value, 'deck-b', 'the current refresh retains the explicit asset choice');
  assert.deepEqual(current.options.map(option => option.value), ['', 'deck-a', 'deck-b', 'deck-c']);
});
