import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyedWriteQueue } from '../app/ledger/write-queue.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

test('same asset note writes execute in submission order even when first is slow', async () => {
  const queue = createKeyedWriteQueue(), hold = deferred(), calls = [];
  const first = queue('asset', async () => { calls.push('begin A'); await hold.promise; calls.push('end A'); return 'A'; });
  const second = queue('asset', async () => { calls.push('begin B'); return 'B'; });
  await tick();
  assert.deepEqual(calls, ['begin A'], 'the second write must not overtake the first');
  hold.resolve();
  assert.deepEqual(await Promise.all([first, second]), ['A', 'B']);
  assert.deepEqual(calls, ['begin A', 'end A', 'begin B']);
});

test('one asset does not block independent asset note writes', async () => {
  const queue = createKeyedWriteQueue(), hold = deferred(), calls = [];
  const first = queue('asset-1', async () => { calls.push('asset-1'); await hold.promise; });
  const second = queue('asset-2', async () => { calls.push('asset-2'); });
  await second;
  assert.deepEqual(calls, ['asset-1', 'asset-2']);
  hold.resolve();
  await first;
});

test('a failed write does not suppress its error or cancel a later write for the same asset', async () => {
  const queue = createKeyedWriteQueue(), hold = deferred(), calls = [];
  const first = queue('asset', async () => { await hold.promise; throw new Error('storage rejected A'); });
  const second = queue('asset', async () => { calls.push('saved B'); return 'B'; });
  hold.resolve();
  await assert.rejects(first, /storage rejected A/);
  assert.equal(await second, 'B');
  assert.deepEqual(calls, ['saved B']);
  assert.equal(await queue('asset', async () => 'C'), 'C', 'queue remains reusable after failure');
});

test('retiring an earlier completion never drops a queued third write', async () => {
  const queue = createKeyedWriteQueue(), hold = deferred(), order = [];
  const a = queue('asset', async () => { order.push('A'); await hold.promise; });
  const b = queue('asset', async () => { order.push('B'); });
  const c = queue('asset', async () => { order.push('C'); });
  await tick();
  assert.deepEqual(order, ['A']);
  hold.resolve();
  await Promise.all([a, b, c]);
  assert.deepEqual(order, ['A', 'B', 'C']);
});
