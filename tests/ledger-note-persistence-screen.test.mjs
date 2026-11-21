import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerApi, LOCAL_KEY } from '../app/ledger/api.js';
import { createLedgerScreen } from '../app/ui/screens/ledger.js';
import { cancelPendingAnnouncements } from '../app/ui/live.js';
import { installServiceDom, deferred, settle } from './fixtures/service-screen-dom.mjs';

async function until(check) {
  for (let n = 0; n < 100; n++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(check(), 'the screen operation reached its visible completion');
}

// Exercise the real screen's synchronous DOM handlers and real browser persistence.
// Deferred API acknowledgements stand in for slow storage; no browser or native backend is launched.
async function mount(t, { beforeNote = async () => {}, storage: suppliedStorage } = {}) {
  const document = installServiceDom(t), values = new Map();
  const storage = suppliedStorage ?? {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  const catalog = {
    list: async kind => structuredClone({
      asset: [{ id: 'a1', productId: 'p1', nickname: 'Left deck' }, { id: 'a2', productId: 'p1', nickname: 'Right deck' }],
      product: [{ id: 'p1', manufacturerId: 'm1', model: 'Deck' }],
      manufacturer: [{ id: 'm1', name: 'Example' }],
    }[kind] || []),
  };
  const base = createLedgerApi({ invoke: null, storage, catalog, photos: { list: async () => [] } });
  const calls = [], downloads = [];
  const api = {
    ...base,
    setPublicNote: async (assetId, text) => {
      calls.push({ assetId, text });
      await beforeNote({ assetId, text }, calls.length);
      return base.setPublicNote(assetId, text);
    },
    saveSingle: async html => { downloads.push(html); return { cancelled: false, path: null }; },
  };
  const section = document.createElement('section');
  document.getElementById('main').append(section);
  const screen = createLedgerScreen(section, { api });
  screen.onShow(); await settle();
  const q = selector => section.querySelector(selector);
  for (const id of ['a1', 'a2']) {
    const box = q(`[data-asset="${id}"]`); box.checked = true; box.dispatch('change');
  }
  q('#ledger-next-privacy').dispatch('click');
  t.after(() => {
    cancelPendingAnnouncements();
    for (const close of document.getElementById('toasts').querySelectorAll('.toast-close')) close.dispatch('click');
    section.remove();
  });
  return {
    section, screen, api, base, storage, calls, downloads, q,
    edit: (text, assetId = 'a1') => {
      const field = q(`textarea[data-note="${assetId}"]`);
      assert.ok(field, 'the real privacy step contains the note field');
      field.value = text; field.dispatch('input'); field.dispatch('change');
    },
    preview: () => q('#ledger-next-preview').dispatch('click'),
    stored: () => JSON.parse(storage.getItem(LOCAL_KEY) || '{}'),
  };
}

test('Ledger screen serializes same-unit note writes while other units remain independent', async t => {
  const first = deferred();
  const f = await mount(t, { beforeNote: (_, n) => n === 1 ? first.promise : undefined });
  f.edit('First'); f.edit('Latest'); f.edit('Other unit', 'a2');
  await settle();
  assert.deepEqual(f.calls, [{ assetId: 'a1', text: 'First' }, { assetId: 'a2', text: 'Other unit' }]);
  assert.deepEqual(await f.base.publicNotes(), { a2: 'Other unit' });
  first.resolve(); await settle();
  assert.deepEqual(f.calls, [{ assetId: 'a1', text: 'First' }, { assetId: 'a2', text: 'Other unit' }, { assetId: 'a1', text: 'Latest' }]);
  assert.deepEqual(await f.base.publicNotes(), { a1: 'Latest', a2: 'Other unit' });
  f.preview(); await until(() => f.q('#ledger-preview') || f.q('#ledger-build-error'));
  assert.ok(f.q('#ledger-preview'), 'a build can proceed after the queued notes are acknowledged');
});

test('an earlier same-text acknowledgement cannot discard a later failed Ledger draft', async t => {
  const gates = [deferred(), deferred(), deferred()];
  const f = await mount(t, { beforeNote: (_, n) => gates[n - 1]?.promise });
  f.edit('Keep this'); f.edit('Intermediate'); f.edit('Keep this');
  f.preview(); await settle();
  assert.equal(f.calls.length, 1);
  gates[0].resolve(); await settle();
  assert.equal(f.calls.length, 2);
  gates[1].resolve(); await settle();
  assert.equal(f.calls.length, 3);
  gates[2].reject(new Error('Storage rejected the latest note')); await settle();
  await until(() => f.q('#ledger-preview') || f.q('#ledger-build-error'));
  assert.equal((await f.base.publicNotes()).a1, 'Intermediate', 'the failed final write did not persist');
  assert.match(f.q('#ledger-build-error')?.textContent ?? '', /Could not save the public note.*Storage rejected the latest note/);
  assert.equal(f.q('#ledger-preview'), null, 'an unsaved latest draft must block the build');
  const back = f.q('#ledger-body').querySelectorAll('button').find(b => b.textContent === 'Back');
  back.dispatch('click');
  assert.equal(f.q('textarea[data-note="a1"]').value, 'Keep this', 'the latest draft is still editable after its failed save');
  await settle();
  assert.equal((await f.base.publicNotes()).a1, 'Keep this', 'returning to the draft can retry the intended latest value');
});

test('a later queued Ledger save can recover after the earlier save fails', async t => {
  const first = deferred(), second = deferred();
  const f = await mount(t, { beforeNote: (_, n) => n === 1 ? first.promise : second.promise });
  f.edit('Earlier'); f.edit('Latest'); f.preview(); await settle();
  first.reject(new Error('Earlier write refused')); await settle();
  assert.equal(f.calls.length, 2, 'the rejected write does not cancel its successor');
  assert.equal(f.q('#ledger-preview'), null, 'preview waits for the latest save');
  second.resolve(); await until(() => f.q('#ledger-preview') || f.q('#ledger-build-error'));
  assert.ok(f.q('#ledger-preview'));
  assert.equal((await f.base.publicNotes()).a1, 'Latest');
  assert.doesNotMatch(f.q('#ledger-status').textContent, /Earlier write refused/);
});

test('reopening the Ledger selection while a note is saving retains its acknowledged value', async t => {
  const saved = deferred();
  const f = await mount(t, { beforeNote: () => saved.promise });
  f.edit('Saved while returning'); await settle();
  assert.equal(f.screen.onEscape(), true);
  f.screen.onShow(); await settle();
  saved.resolve(); await settle();
  assert.equal((await f.base.publicNotes()).a1, 'Saved while returning');
  await until(() => f.q('#ledger-next-privacy'));
  f.q('#ledger-next-privacy').dispatch('click');
  assert.equal(f.q('textarea[data-note="a1"]').value, 'Saved while returning');
});

test('browser storage rejection keeps the actual Ledger draft and blocks preview until retry succeeds', async t => {
  const values = new Map(); let blocked = true;
  const f = await mount(t, { storage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new Error('Storage quota reached'); values.set(key, value); },
  } });
  f.edit('Keep my unsaved note'); await settle();
  assert.match(f.q('#ledger-status').textContent, /could not save Gear Ledger changes/);
  f.preview(); await until(() => f.q('#ledger-build-error'));
  assert.match(f.q('#ledger-build-error').textContent, /could not save Gear Ledger changes/);
  assert.equal(values.has(LOCAL_KEY), false);
  assert.equal(f.downloads.length, 0);
  blocked = false;
  f.q('#ledger-body').querySelectorAll('button').find(b => b.textContent === 'Back').dispatch('click');
  assert.equal(f.q('textarea[data-note="a1"]').value, 'Keep my unsaved note');
  await settle();
  assert.equal((await f.base.publicNotes()).a1, 'Keep my unsaved note');
  f.preview(); await until(() => f.q('#ledger-preview'));
});

test('an unreadable stored Ledger remains unchanged after an actual-screen note save', async t => {
  const previous = '{incomplete saved data'; let writes = 0;
  const f = await mount(t, { storage: { getItem: () => previous, setItem: () => { writes++; } } });
  f.edit('Keep this draft'); await settle();
  f.preview(); await until(() => f.q('#ledger-build-error'));
  assert.match(f.q('#ledger-build-error').textContent, /data is unreadable.*not saved/i);
  assert.equal(writes, 0);
  assert.equal(f.storage.getItem(LOCAL_KEY), previous);
  assert.equal(f.downloads.length, 0);
});

test('a failed note does not block a Ledger reload or erase its recoverable draft', async t => {
  const values = new Map(); let blocked = true;
  const f = await mount(t, { storage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new Error('Temporarily unavailable'); values.set(key, value); },
  } });
  f.edit('Retry after reloading'); await settle();
  f.screen.onEscape(); f.screen.onShow();
  await until(() => f.q('#ledger-next-privacy'));
  assert.match(f.q('#ledger-status').textContent, /could not save Gear Ledger changes/);
  blocked = false;
  f.q('#ledger-next-privacy').dispatch('click');
  assert.equal(f.q('textarea[data-note="a1"]').value, 'Retry after reloading');
  await settle();
  assert.equal((await f.base.publicNotes()).a1, 'Retry after reloading');
});

test('a browser history failure after file saving is visible and does not record a false Ledger revision', async t => {
  const values = new Map(); let blocked = true;
  const f = await mount(t, { storage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new Error('History storage unavailable'); values.set(key, value); },
  } });
  f.screen.onExport(); await until(() => f.q('#ledger-export'));
  f.q('#ledger-export').dispatch('click'); await until(() => f.q('#ledger-export-error'));
  assert.equal(f.downloads.length, 1, 'the file save already occurred before its history could be recorded');
  assert.match(f.q('#ledger-export-error').textContent, /could not save Gear Ledger changes/);
  assert.equal(f.q('#ledger-success'), null);
  assert.deepEqual(await f.base.listExports(), []);
  assert.equal(await f.base.nextRevision(), 1);
  blocked = false;
  f.q('#ledger-export').dispatch('click'); await until(() => f.q('#ledger-success'));
  assert.equal(f.downloads.length, 2, 'explicit retry saves the file and records the same still-available revision');
  assert.deepEqual((await f.base.listExports()).map(row => row.revision), [1]);
  assert.equal(await f.base.nextRevision(), 2);
});
