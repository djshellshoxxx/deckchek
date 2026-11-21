import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerApi } from '../app/ledger/api.js';
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

async function mount(t, { read = base => base.listGear() } = {}) {
  const document = installServiceDom(t), stats = { loads: 0, builds: 0, writes: 0, records: 0 };
  let readGear = read, readPhotos = async () => [];
  const catalog = { list: async kind => structuredClone({
    asset: [{ id: 'unit-1', productId: 'product-1', nickname: 'My deck' }],
    product: [{ id: 'product-1', manufacturerId: 'maker-1', model: 'Deck' }],
    manufacturer: [{ id: 'maker-1', name: 'Example' }],
  }[kind]) };
  const invoke = async command => {
    if (['ledger_public_notes', 'ledger_customer_units', 'maintenance_list', 'certificate_list', 'ledger_export_list'].includes(command)) return [];
    if (command === 'ledger_next_revision') return 1;
    throw new Error(`Unexpected command ${command}`);
  };
  window.__TAURI__ = { core: { invoke } };
  const base = createLedgerApi({ invoke, storage: { getItem: () => null }, catalog, photos: { list: (...args) => readPhotos(...args) } });
  const api = {
    ...base,
    listGear: async () => { stats.loads++; return readGear(base, stats.loads); },
    loadState: async (...args) => { stats.builds++; return base.loadState(...args); },
    writeFolder: async () => { stats.writes++; return { cancelled: false, path: '/ledger-fixture', removed: 0 }; },
    saveSingle: async () => { stats.writes++; return { cancelled: false, path: null }; },
    recordExport: async record => { stats.records++; return { ...record, createdAt: '2026-11-21T00:00:00Z' }; },
  };
  const section = document.createElement('section'); document.getElementById('main').append(section);
  const screen = createLedgerScreen(section, { api }), q = selector => section.querySelector(selector);
  t.after(() => {
    cancelPendingAnnouncements();
    for (const close of document.getElementById('toasts').querySelectorAll('.toast-close')) close.dispatch('click');
    section.remove();
  });
  screen.onShow(); await settle();
  return {
    screen, section, q, base, stats,
    setRead: fn => { readGear = fn; }, setPhotos: fn => { readPhotos = fn; },
    select: () => { const box = q('[data-asset="unit-1"]'); assert.ok(box); box.checked = true; box.dispatch('change'); },
    preview: async () => {
      q('#ledger-next-privacy').dispatch('click'); q('#ledger-next-preview').dispatch('click');
      await until(() => q('#ledger-summary'));
    },
  };
}

test('Ledger initial load failure remains visible, blocks export, and recovers through Try again', async t => {
  const f = await mount(t, { read: async () => { throw new Error('Inventory unavailable'); } });
  assert.match(f.q('#ledger-error').textContent, /Inventory unavailable/);
  assert.equal(f.q('#ledger-empty'), null);
  f.screen.onExport(); await settle();
  assert.deepEqual([f.stats.builds, f.stats.writes, f.stats.records], [0, 0, 0]);
  f.setRead(base => base.listGear());
  f.q('#ledger-error').querySelector('button').dispatch('click'); await settle();
  assert.equal(f.q('#ledger-error'), null);
  assert.ok(f.q('[data-asset="unit-1"]'));
  assert.equal(f.stats.loads, 2);
});

test('Ledger cannot use a cached preview while a reload is pending or after it fails', async t => {
  const f = await mount(t);
  f.select(); await f.preview();
  assert.equal(f.stats.builds, 1);
  assert.equal(f.screen.onEscape(), true);
  const pending = deferred(); f.setRead(async () => pending.promise);
  f.screen.onShow(); await settle();
  f.screen.onExport(); await settle();
  assert.match(f.q('#ledger-body').textContent, /Loading your gear/);
  assert.equal(f.stats.builds, 1);
  pending.reject(new Error('Refreshed inventory unavailable')); await settle();
  f.screen.onExport(); await settle();
  assert.match(f.q('#ledger-error').textContent, /Refreshed inventory unavailable/);
  assert.deepEqual([f.stats.builds, f.stats.writes, f.stats.records], [1, 0, 0]);
});

test('Ledger rebuilds after a successful reload even if selection, privacy and notes are unchanged', async t => {
  const f = await mount(t);
  f.select(); await f.preview();
  assert.equal(f.stats.builds, 1);
  f.screen.onEscape(); f.screen.onShow(); await settle();
  await f.preview();
  assert.equal(f.stats.loads, 2);
  assert.equal(f.stats.builds, 2, 'a new inventory read invalidates the previous build cache');
  assert.equal(f.stats.writes, 0);
});

test('Ledger ignores an older failure after the newest inventory load succeeds', async t => {
  const old = deferred();
  const f = await mount(t, { read: async (base, count) => count === 1 ? old.promise : base.listGear() });
  f.screen.onShow(); await settle();
  assert.ok(f.q('[data-asset="unit-1"]'));
  old.reject(new Error('Retired inventory failed')); await settle();
  assert.equal(f.q('#ledger-error'), null);
  assert.ok(f.q('[data-asset="unit-1"]'));
  assert.equal(f.stats.loads, 2);
});

test('Ledger removes vanished units from the selection after a successful inventory reload', async t => {
  const f = await mount(t);
  f.select();
  f.setRead(async base => {
    const gear = await base.listGear();
    return { ...gear, rows: gear.rows.map(row => ({ ...row, asset: { ...row.asset, id: 'unit-2' } })) };
  });
  f.screen.onShow(); await settle();
  assert.equal(f.q('#ledger-count').textContent, '0 of 1 selected');
  assert.equal(f.q('[data-asset="unit-2"]').checked, false);
  f.screen.onExport(); await settle();
  assert.match(f.q('#ledger-status').textContent, /Pick at least one unit/);
  assert.deepEqual([f.stats.builds, f.stats.writes, f.stats.records], [0, 0, 0]);
});

test('Ledger ignores an older success after the newest inventory load fails', async t => {
  const old = deferred();
  const f = await mount(t, { read: async () => old.promise });
  f.setRead(async () => { throw new Error('Current inventory unavailable'); });
  f.screen.onShow(); await settle();
  old.resolve(await f.base.listGear()); await settle();
  assert.match(f.q('#ledger-error').textContent, /Current inventory unavailable/);
  assert.equal(f.q('[data-asset="unit-1"]'), null);
  f.screen.onExport(); await settle();
  assert.deepEqual([f.stats.builds, f.stats.writes, f.stats.records], [0, 0, 0]);
});

test('Ledger final build stops before writing if photo enumeration fails after the preview', async t => {
  const f = await mount(t);
  f.select(); await f.preview();
  f.screen.onExport(); await settle();
  f.setPhotos(async () => { throw new Error('Photo inventory unavailable'); });
  f.screen.onExport();
  await until(() => /Export failed/.test(f.q('#ledger-status').textContent));
  assert.match(f.q('#ledger-status').textContent, /Photo inventory unavailable/);
  assert.deepEqual([f.stats.builds, f.stats.writes, f.stats.records], [2, 0, 0]);
  assert.equal(f.q('#ledger-success'), null);
});

for (const reason of [new Error(''), '']) {
  test(`Ledger blocks stale export after an empty ${typeof reason} reload rejection`, async t => {
    const f = await mount(t);
    f.select(); await f.preview();
    f.screen.onEscape();
    f.setRead(async () => { throw reason; });
    f.screen.onShow(); await settle();
    assert.match(f.q('#ledger-error').textContent, /Something went wrong/);
    f.screen.onExport(); await settle();
    assert.deepEqual([f.stats.builds, f.stats.writes, f.stats.records], [1, 0, 0]);
    assert.equal(f.q('#ledger-export'), null);
  });
}
