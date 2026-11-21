import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFeatureRuns } from '../app/history-feed.js';

const sources = ['hum', 'latency', 'scratch', 'wearmap', 'pregig', 'monitor'];
const stamp = '2026-11-21T00:00:00Z';

test('confirmed empty feature lists are valid while malformed lists are attributed', async () => {
  for (const type of sources) {
    assert.deepEqual(await loadFeatureRuns(async () => [], { only: [type] }), { rows: [], errors: [] });
    for (const value of [null, {}, 'unavailable']) {
      const result = await loadFeatureRuns(async () => value, { only: [type] });
      assert.deepEqual(result.rows, []);
      assert.deepEqual(result.errors, [{ type, message: 'History returned an invalid list.' }]);
    }
  }
});

test('mixed lists retain every valid row once and report only bounded omission counts', async () => {
  const result = await loadFeatureRuns(async cmd => cmd === 'hum_run_list'
    ? [{ id: 'older', createdAt: stamp }, null, { id: 'private-row', note: 'Private fixture note' }, { id: 'newer', createdAt: '2026-11-21T01:00:00Z' }]
    : [], { only: ['hum', 'latency'] });
  assert.deepEqual(result.rows.map(row => row.id), ['hum:newer', 'hum:older']);
  assert.equal(new Set(result.rows.map(row => row.id)).size, result.rows.length);
  assert.deepEqual(result.errors, [{ type: 'hum', message: '2 invalid history records could not be listed.', invalidRows: 2 }]);
  assert.doesNotMatch(JSON.stringify(result.errors), /private-row|Private fixture note/);
});

test('a rejected source does not hide another source and disabled sources are not requested', async () => {
  const calls = [];
  const result = await loadFeatureRuns(async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'hum_run_list') throw new Error('History store unavailable');
    return [{ id: 'ready', createdAt: stamp }];
  }, { only: ['hum', 'latency'], limit: 7 });
  assert.deepEqual(result.rows.map(row => row.id), ['latency:ready']);
  assert.deepEqual(result.errors, [{ type: 'hum', message: 'History store unavailable' }]);
  assert.deepEqual(calls, [['hum_run_list', { filter: { limit: 7 } }], ['latency_run_list', { filter: { limit: 7 } }]]);
  let callsWhenDisabled = 0;
  assert.deepEqual(await loadFeatureRuns(async () => { callsWhenDisabled++; return []; }, { only: [] }), { rows: [], errors: [] });
  assert.equal(callsWhenDisabled, 0);
});
