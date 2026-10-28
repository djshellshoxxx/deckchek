// FS-33 review fixes (regressions) in the desktop bridge app/ledger/api.js: customer units, per-unit service history,
// the revision counter that survives a backup restore, and the staged folder write that prunes stale ledger files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerApi } from '../app/ledger/api.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

function nativeApi(handlers, calls = []) {
  const invoke = async (cmd, args) => {
    calls.push([cmd, args]);
    if (handlers[cmd]) return handlers[cmd](args || {});
    throw new Error(`unexpected ${cmd}`);
  };
  const catalog = {
    list: async kind => ({
      asset: [{ id: 'own-1', productId: 'p1', nickname: 'My deck' }, { id: 'cust-1', productId: 'p1', nickname: 'Bench unit', serialNumber: 'CUST-SN-1' }],
      product: [{ id: 'p1', manufacturerId: 'm1', model: 'SL-1200MK4' }], manufacturer: [{ id: 'm1', name: 'Technics' }],
    }[kind] || []),
  };
  return createLedgerApi({ invoke, storage: mem(), catalog, photos: { list: async () => [] } });
}

test('regression: customer bench units from service jobs are not listed as the owner\'s gear', async () => {
  const api = nativeApi({
    ledger_customer_units: () => ['cust-1'], ledger_public_notes: () => [], maintenance_list: () => [], certificate_list: () => [],
  });
  const gear = await api.listGear();
  assert.deepEqual(gear.rows.map(r => r.asset.id), ['own-1']);
  assert.equal(gear.customerUnits, 1);
  // a failing lookup fails closed: no list that might include customers' units
  const broken = nativeApi({ ledger_customer_units: () => { throw new Error('LEDGER_DB: locked'); }, ledger_public_notes: () => [], maintenance_list: () => [], certificate_list: () => [] });
  await assert.rejects(broken.listGear(), /LEDGER_DB/);
});

test('regression: service history is loaded per selected unit, not cut by the fleet-wide 1000-row list', async () => {
  const fleet = Array.from({ length: 1000 }, (_, i) => ({ assetId: 'other', eventType: 'clean', eventAt: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`, description: '' }));
  const own = Array.from({ length: 30 }, (_, i) => ({ assetId: 'own-1', eventType: 'clean', eventAt: `2020-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`, description: '' }));
  const calls = [];
  const api = nativeApi({
    ledger_customer_units: () => [], ledger_public_notes: () => [], certificate_list: () => [],
    maintenance_list: a => (a.assetId ? own.filter(e => e.assetId === a.assetId) : fleet),
  }, calls);
  const gear = await api.listGear();
  assert.equal(gear.rows.find(r => r.asset.id === 'own-1').service, 30, 'step-1 count is exact even when the fleet list is truncated');
  const state = await api.loadState(gear, ['own-1']);
  assert.equal(state.service['own-1'].length, 30);
  assert.ok(calls.some(([c, a]) => c === 'maintenance_list' && a.assetId === 'own-1'));
  // an unreadable per-unit history is reported as partial, never silently empty
  const failing = nativeApi({ ledger_customer_units: () => [], ledger_public_notes: () => [], certificate_list: () => [], maintenance_list: a => { if (a.assetId) throw new Error('busy'); return []; } });
  const st2 = await failing.loadState(await failing.listGear(), ['own-1']);
  assert.deepEqual(st2.problems, [{ assetId: 'own-1', what: 'service', reason: 'service history unreadable' }]);
});

test('regression: the next revision comes from Rust (which keeps a floor that survives a backup restore)', async () => {
  const api = nativeApi({ ledger_next_revision: () => 6, ledger_export_list: () => [{ revision: 3 }] });
  assert.equal(await api.nextRevision(), 6);
  // the UI smoke mock and older test doubles answer "unknown command": fall back to the history list
  const old = nativeApi({ ledger_next_revision: () => { throw 'unknown command ledger_next_revision'; }, ledger_export_list: () => [{ revision: 3 }] });
  assert.equal(await old.nextRevision(), 4);
  const failing = nativeApi({ ledger_next_revision: () => { throw 'LEDGER_DB: locked'; }, ledger_export_list: () => [{ revision: 3 }] });
  await assert.rejects(failing.nextRevision(), /LEDGER_DB/);
});

test('regression: folder export goes through ledger_write_folder, which prunes stale ledger files and writes atomically', async () => {
  const calls = [];
  const api = nativeApi({}, calls);
  const files = [{ relPath: 'ledger/index.html', text: '<p>x</p>' }, { relPath: 'ledger/ledger.json', text: '{"revision":1}' }];
  const invoke = async (cmd, args) => { calls.push([cmd, args]); if (cmd === 'ledger_write_folder') return { written: 2, removed: 3, path: args.dir }; throw new Error(cmd); };
  const r = await api.writeFolder(files, { api: { dialog: { open: async () => '/home/dj/Ledger' }, core: { invoke } } });
  assert.deepEqual(r, { cancelled: false, path: '/home/dj/Ledger', written: 2, removed: 3 });
  assert.deepEqual(calls.at(-1), ['ledger_write_folder', { dir: '/home/dj/Ledger', files }]);
  assert.ok(!calls.some(c => c[0] === 'userfiles_write_folder'));
  const cancelled = await api.writeFolder(files, { api: { dialog: { open: async () => null }, core: { invoke } } });
  assert.deepEqual(cancelled, { cancelled: true });
  const failing = async cmd => { throw `LEDGER_REVISION: this folder already holds ledger revision 9 (${cmd})`; };
  await assert.rejects(api.writeFolder(files, { api: { dialog: { open: async () => '/x' }, core: { invoke: failing } } }), /LEDGER_REVISION/);
});
