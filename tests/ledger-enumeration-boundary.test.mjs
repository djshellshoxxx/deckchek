import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerApi } from '../app/ledger/api.js';

const CATALOG = {
  asset: [{ id: 'unit-1', productId: 'product-1', nickname: 'My deck' }],
  product: [{ id: 'product-1', manufacturerId: 'maker-1', model: 'Deck' }],
  manufacturer: [{ id: 'maker-1', name: 'Example' }],
};

function nativeApi({ overrides = {}, photoList = async () => [], photoRead = async () => '', catalogList = async kind => structuredClone(CATALOG[kind]) } = {}) {
  const calls = [];
  const handlers = {
    ledger_public_notes: () => [], ledger_customer_units: () => [], maintenance_list: () => [], certificate_list: () => [],
    ...overrides,
  };
  const api = createLedgerApi({
    invoke: async (command, args) => { calls.push({ command, args }); assert.ok(handlers[command], command); return handlers[command](args); },
    storage: { getItem: () => null }, catalog: { list: catalogList }, photos: { list: photoList, read: photoRead },
  });
  return { api, calls };
}

test('Ledger confirmed empty inventories remain valid and keep exact zero counts', async () => {
  const { api } = nativeApi();
  const gear = await api.listGear();
  assert.equal(gear.rows.length, 1);
  assert.deepEqual([gear.rows[0].photos, gear.rows[0].certificates, gear.rows[0].service], [0, 0, 0]);
  assert.equal(gear.rows[0].asset.publicNotes, null);
  assert.equal(gear.rows[0].usedInServiceJobs, false);
  const state = await api.loadState(gear, ['unit-1']);
  assert.deepEqual(state.photos, { 'unit-1': [] });
  assert.deepEqual(state.problems, []);
  assert.deepEqual((await nativeApi({ catalogList: async () => [] }).api.listGear()).rows, []);
});

for (const command of ['ledger_public_notes', 'ledger_customer_units', 'maintenance_list', 'certificate_list']) {
  test(`Ledger refuses unavailable or malformed ${command} instead of reporting empty inventory`, async () => {
    const failure = new Error(`${command} unavailable`);
    await assert.rejects(nativeApi({ overrides: { [command]: () => { throw failure; } } }).api.listGear(), error => error === failure);
    for (const response of [null, {}, 'unavailable']) {
      await assert.rejects(nativeApi({ overrides: { [command]: () => response } }).api.listGear(), /invalid list/);
    }
  });
}

test('Ledger refuses malformed catalog containers and unavailable photo enumeration', async () => {
  for (const kind of ['asset', 'product', 'manufacturer']) {
    await assert.rejects(nativeApi({ catalogList: async name => name === kind ? null : structuredClone(CATALOG[name]) }).api.listGear(), /invalid list/);
  }
  await assert.rejects(nativeApi({ photoList: async () => { throw new Error('Photo inventory unavailable'); } }).api.listGear(), /Photo inventory unavailable/);
  for (const response of [null, {}, 'unavailable']) {
    await assert.rejects(nativeApi({ photoList: async () => response }).api.listGear(), /Photos returned an invalid list/);
  }
});

test('Ledger refuses an unavailable per-unit count after the global maintenance list reaches its cap', async () => {
  const full = Array.from({ length: 1000 }, () => ({ assetId: 'other-unit' }));
  for (const response of ['reject', null]) {
    const { api, calls } = nativeApi({ overrides: { maintenance_list: ({ assetId }) => {
      if (assetId === null) return full;
      if (response === 'reject') throw new Error('Unit service unavailable');
      return response;
    } } });
    await assert.rejects(api.listGear(), /Unit service unavailable|invalid list/);
    assert.ok(calls.some(call => call.command === 'maintenance_list' && call.args.assetId === 'unit-1'));
  }
});

test('Ledger blocks building when a photo inventory becomes unavailable after selection', async () => {
  let response = [];
  const { api } = nativeApi({ photoList: async () => {
    if (response instanceof Error) throw response;
    return response;
  } });
  const gear = await api.listGear();
  for (const unavailable of [new Error('Photo inventory unavailable'), null, {}]) {
    response = unavailable;
    await assert.rejects(api.loadState(gear, ['unit-1']), /Photo inventory unavailable|Photos returned an invalid list/);
  }
});

test('Ledger retains attributed partial problems for known item read failures and missing certificate contents', async () => {
  for (const certificate of [null, {}, { fileJson: '' }, { fileJson: 42 }]) {
    const { api } = nativeApi({
      overrides: {
        maintenance_list: ({ assetId }) => { if (assetId) throw new Error('Service unreadable'); return []; },
        certificate_list: () => [{ id: 'cert-1', assetId: 'unit-1', verdict: 'pass' }],
        certificate_get: () => certificate,
      },
      photoList: async () => [{ photoId: 'photo-1' }],
      photoRead: async () => { throw new Error('Photo unreadable'); },
    });
    const state = await api.loadState(await api.listGear(), ['unit-1']);
    assert.deepEqual(state.problems, [
      { assetId: 'unit-1', what: 'service', reason: 'service history unreadable' },
      { assetId: 'unit-1', what: 'photo', reason: 'photo unreadable' },
      { assetId: 'unit-1', what: 'certificate', reason: 'certificate unreadable' },
    ]);
    assert.deepEqual(state.photos['unit-1'], []);
    assert.deepEqual(state.certificates, {});
  }
});
