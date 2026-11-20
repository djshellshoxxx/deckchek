import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { installServiceDom, settle, deferred } from './fixtures/service-screen-dom.mjs';

const document = installServiceDom({ after });
const { renderIntakeForm } = await import('../app/ui/workflows/service-job.js');
const { ensureLibrary, lib } = await import('../app/ui/devices/library-state.js');
const { store } = await import('../app/ui/state.js');
await ensureLibrary();

async function mount(t, { customers = async () => [], assetsRead, preset = {} } = {}) {
  const previous = { ...lib };
  const assets = [{ id: 'left', nickname: 'Left deck', productId: 'product-a' }, { id: 'right', nickname: 'Right deck', productId: 'product-b' }];
  const profiles = [{ id: 'model-a', manufacturer: 'Maker', model: 'Model A' }, { id: 'model-b', manufacturer: 'Maker', model: 'Model B' }];
  Object.assign(lib, { assets: structuredClone(assets), profiles, products: new Map([['model-a', 'product-a'], ['model-b', 'product-b']]) });
  t.after(() => Object.assign(lib, previous));
  t.mock.method(store, 'list', async () => assetsRead ? assetsRead() : structuredClone(assets));
  t.mock.method(store, 'listDeviceTestResults', async () => []);
  const host = document.createElement('section'); document.body.append(host);
  t.after(() => host.remove());
  let current = true;
  const submitted = [];
  const controller = renderIntakeForm(host, {
    api: { customers, create: async payload => { submitted.push(payload); return { id: 'created', jobNumber: 'J-new' }; } },
    preset, isCurrent: () => current, onCreated() {},
  });
  return { host, controller, submitted, retire: () => { current = false; }, query: selector => host.querySelector(selector) };
}

test('customer searches retain the latest result and ignore an older reply', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = [deferred(), deferred()]; let calls = 0;
  const f = await mount(t, { customers: () => pending[calls++].promise });
  f.query('#svc-cust-mode-old').dispatch('change');
  f.query('#svc-cust-search').value = 'Beta'; f.query('#svc-cust-search').dispatch('input');
  t.mock.timers.tick(200); await settle();
  pending[1].resolve([{ id: 'beta', name: 'Beta customer' }]); await settle();
  f.query('#svc-cust-existing').value = 'beta';
  pending[0].resolve([{ id: 'alpha', name: 'Alpha customer' }]); await settle();
  assert.deepEqual(f.query('#svc-cust-existing').options.map(row => row.value), ['', 'beta']);
  assert.equal(f.query('#svc-cust-existing').value, 'beta');
  assert.equal(f.query('#svc-cust-existing').disabled, false);
});

test('typing a new customer query invalidates the old request before the debounce starts', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred();
  const f = await mount(t, { customers: () => pending.promise });
  f.query('#svc-cust-mode-old').dispatch('change');
  f.query('#svc-cust-search').value = 'New query'; f.query('#svc-cust-search').dispatch('input');
  pending.resolve([{ id: 'obsolete', name: 'Obsolete customer' }]); await settle();
  assert.equal(f.query('#svc-cust-existing').options.some(row => row.value === 'obsolete'), false);
  assert.equal(f.query('#svc-cust-existing').disabled, true, 'an unqualified result cannot be selected while the current query waits');
  f.retire(); t.mock.timers.tick(200); await settle();
});

for (const retire of ['new-customer-mode', 'replacement-form']) {
  test(`late customer errors do not update feedback after ${retire}`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const pending = deferred();
    const f = await mount(t, { customers: () => pending.promise });
    f.query('#svc-cust-mode-old').dispatch('change');
    if (retire === 'new-customer-mode') f.query('#svc-cust-mode-new').dispatch('change'); else f.retire();
    const before = f.query('#svc-new-error').textContent;
    pending.reject(new Error('Old customer search failed')); await settle();
    assert.equal(f.query('#svc-new-error').textContent, before);
  });
}

for (const choice of ['existing', 'new']) {
  test(`deferred unit refresh preserves a chosen ${choice} unit and unsaved fields`, async t => {
    const pending = deferred();
    const f = await mount(t, { assetsRead: () => pending.promise, preset: { assetId: 'left' } });
    f.query('#svc-unit').value = choice === 'existing' ? 'right' : '__new'; f.query('#svc-unit').dispatch('change');
    if (choice === 'new') {
      f.query('#svc-unit-profile').value = 'model-b'; f.query('#svc-unit-profile').dispatch('change');
      f.query('#svc-unit-nickname').value = 'Typed unit name'; f.query('#svc-unit-nickname').dispatch('input');
      f.query('#svc-unit-serial').value = 'Typed serial';
    }
    f.query('#svc-fault').value = 'Unsaved fault';
    pending.resolve([{ id: 'left', nickname: 'Left deck' }, { id: 'right', nickname: 'Right deck' }]); await settle();
    assert.equal(f.query('#svc-unit').value, choice === 'existing' ? 'right' : '__new');
    assert.equal(f.query('#svc-fault').value, 'Unsaved fault');
    if (choice === 'new') {
      assert.equal(f.query('#svc-unit-profile').value, 'model-b');
      assert.equal(f.query('#svc-unit-nickname').value, 'Typed unit name');
      assert.equal(f.query('#svc-unit-serial').value, 'Typed serial');
    }
  });
}

test('a refreshed list never substitutes the preset for a selected unit that disappeared', async t => {
  const pending = deferred();
  const f = await mount(t, { assetsRead: () => pending.promise, preset: { assetId: 'left' } });
  f.query('#svc-unit').value = 'right'; f.query('#svc-unit').dispatch('change');
  pending.resolve([{ id: 'left', nickname: 'Left deck' }]); await settle();
  assert.equal(f.query('#svc-unit').value, '', 'the operator must choose another available unit');
});

test('a current customer-search failure remains explicit and a later search can recover', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempt = 0;
  const f = await mount(t, { customers: async () => {
    if (++attempt === 1) throw new Error('Database unavailable');
    return [{ id: 'latest', name: 'Recovered customer' }];
  } });
  f.query('#svc-cust-mode-old').dispatch('change'); await settle();
  assert.match(f.query('#svc-new-error').textContent, /Database unavailable/);
  assert.equal(f.query('#svc-cust-existing').value, '');
  assert.equal(f.query('#svc-cust-existing').disabled, true);
  f.query('#svc-cust-search').value = 'Recovered'; f.query('#svc-cust-search').dispatch('input');
  t.mock.timers.tick(200); await settle();
  assert.equal(f.query('#svc-new-error').textContent, '');
  assert.deepEqual(f.query('#svc-cust-existing').options.map(row => row.value), ['', 'latest']);
  assert.equal(f.query('#svc-cust-existing').disabled, false);
});

test('the untouched unit preset remains selected after the initial refresh', async t => {
  const pending = deferred();
  const f = await mount(t, { assetsRead: () => pending.promise, preset: { assetId: 'right' } });
  assert.equal(f.query('#svc-unit').value, 'right');
  pending.resolve([{ id: 'left', nickname: 'Left deck' }, { id: 'right', nickname: 'Right deck' }]); await settle();
  assert.equal(f.query('#svc-unit').value, 'right');
});

test('an explicitly cleared unit choice is not reset to the preset', async t => {
  const pending = deferred();
  const f = await mount(t, { assetsRead: () => pending.promise, preset: { assetId: 'left' } });
  f.query('#svc-unit').value = ''; f.query('#svc-unit').dispatch('change');
  pending.resolve([{ id: 'left', nickname: 'Left deck' }]); await settle();
  assert.equal(f.query('#svc-unit').value, '');
  f.query('#svc-cust-name').value = 'Client'; f.query('#svc-fault').value = 'Fault';
  await f.controller.submit();
  assert.equal(f.submitted.length, 0);
  assert.match(f.query('#svc-new-error').textContent, /Choose the unit/);
});

test('the preserved new-unit model reaches the actual create payload', async t => {
  const pending = deferred();
  const f = await mount(t, { assetsRead: () => pending.promise, preset: { assetId: 'left' } });
  f.query('#svc-cust-name').value = 'Client';
  f.query('#svc-unit').value = '__new'; f.query('#svc-unit').dispatch('change');
  f.query('#svc-unit-profile').value = 'model-b'; f.query('#svc-unit-profile').dispatch('change');
  f.query('#svc-unit-nickname').value = 'Unit with an exact profile'; f.query('#svc-unit-nickname').dispatch('input');
  f.query('#svc-fault').value = 'Fault';
  pending.resolve([{ id: 'left', nickname: 'Left deck' }]); await settle();
  await f.controller.submit(); await settle();
  assert.equal(f.submitted.length, 1);
  assert.equal(f.submitted[0].assetId, undefined);
  assert.equal(f.submitted[0].newUnit.productId, 'product-b');
  assert.equal(f.submitted[0].newUnit.nickname, 'Unit with an exact profile');
});

test('a retired form cannot dispatch a new customer lookup or job creation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reads = 0;
  const f = await mount(t, { customers: async () => { reads++; return []; } });
  f.query('#svc-cust-name').value = 'Client'; f.query('#svc-unit').value = 'right'; f.query('#svc-fault').value = 'Fault';
  f.retire();
  await f.controller.submit();
  f.query('#svc-cust-mode-old').dispatch('change');
  f.query('#svc-cust-search').dispatch('input'); t.mock.timers.tick(200); await settle();
  assert.equal(f.submitted.length, 0); assert.equal(reads, 0);
});
