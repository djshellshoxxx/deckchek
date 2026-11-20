import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceProfileAssignment } from '../app/ui/workflows/device-profile-assignment.js';
import { installServiceDom, settle } from './fixtures/service-screen-dom.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function mount(t, overrides = {}) {
  installServiceDom(t);
  const host = document.createElement('section'); document.body.append(host);
  const calls = [], completions = [], gate = deferred();
  const options = {
    profile: { id: 'profile', manufacturer: 'Maker', model: '<Exact model>' }, productId: 'target',
    assets: [
      { id: 'unit', nickname: '<Imported unit>', productId: 'source', serialNumber: '123' },
      { id: 'other', nickname: 'Other unit', productId: null },
      { id: 'already', nickname: 'Already assigned', productId: 'target' },
      { id: 'deleted', nickname: 'Deleted unit', isDeleted: true },
    ],
    assign: request => { calls.push(request); return gate.promise; }, onAssigned: (...args) => completions.push(args),
    ...overrides,
  };
  const workflow = createDeviceProfileAssignment(host, options);
  const select = host.querySelector('#profile-unit'), confirm = host.querySelector('#profile-unit-confirm');
  const submit = () => host.querySelector('form').dispatch('submit');
  const choose = (id = 'unit') => { select.value = id; select.dispatch('change'); confirm.checked = true; confirm.dispatch('change'); };
  return { host, options, workflow, calls, completions, gate, select, confirm, choose, submit };
}

test('assignment requires explicit unit selection and model confirmation', async t => {
  const f = mount(t);
  assert.match(f.host.textContent, /<Exact model>/); assert.match(f.host.textContent, /<Imported unit>/);
  assert.doesNotMatch(f.host.textContent, /Already assigned|Deleted unit/);
  f.submit(); assert.equal(f.calls.length, 0);
  f.select.value = 'unit'; f.select.dispatch('change'); f.submit(); assert.equal(f.calls.length, 0);
  f.choose(); f.submit(); f.submit();
  assert.deepEqual(f.calls, [{ assetId: 'unit', profileId: 'profile', productId: 'target', expectedProductId: 'source' }]);
  assert.equal(f.select.disabled, true);
  f.options.assets[0].productId = 'mutated';
  f.gate.resolve({ assetId: 'unit', productId: 'target' }); await settle();
  assert.equal(f.completions.length, 1); assert.equal(f.completions[0][1].productId, 'source');
});

test('choosing another unit clears the previous model confirmation', t => {
  const f = mount(t); f.choose(); f.select.value = 'other'; f.select.dispatch('change');
  f.submit(); assert.equal(f.calls.length, 0);
});

test('a failed write preserves the selected unit and allows an explicit retry', async t => {
  let count = 0; const f = mount(t, { assign: async () => { count++; if (count === 1) throw new Error('Disk full'); return { assetId: 'unit' }; } });
  f.choose(); f.submit(); await settle();
  assert.match(f.host.querySelector('#profile-unit-status').textContent, /Disk full/);
  assert.equal(f.select.value, 'unit'); assert.equal(f.select.disabled, false);
  f.submit(); await settle(); assert.equal(count, 2); assert.equal(f.completions.length, 1);
});

for (const outcome of ['success', 'failure']) {
  test(`retired assignment ignores late ${outcome} and stale handlers`, async t => {
    const f = mount(t); f.choose(); f.submit(); f.workflow.dispose();
    const before = f.host.textContent;
    if (outcome === 'success') f.gate.resolve({ assetId: 'unit' }); else f.gate.reject(new Error('stale failure'));
    await settle(); f.submit();
    assert.equal(f.completions.length, 0); assert.equal(f.calls.length, 1); assert.equal(f.host.textContent, before);
  });
}
