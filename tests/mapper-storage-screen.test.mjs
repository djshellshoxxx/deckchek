import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../app/mapper/model.js';
import { LOCAL_KEY } from '../app/mapper/store.js';
import { deferred, mountMapper, nativeMappings, settle } from './fixtures/mapper-lifecycle-dom.mjs';

const savedRow = () => ({ id: 'saved-a', name: 'Recovered mapping', model: createModel({ name: 'Recovered mapping' }), createdAt: '2026-01-01', updatedAt: '2026-01-01' });
function memory(raw = null) {
  const values = new Map(raw === null ? [] : [[LOCAL_KEY, raw]]), writes = [];
  return { values, writes, storage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (key === LOCAL_KEY) writes.push(value); values.set(key, String(value)); },
  } };
}

test('Mapper displays a storage failure, retains the current draft and recovers only after a successful retry', async t => {
  const original = '{keep original bytes', m = memory(original);
  const screen = await mountMapper(t, null, { storage: m.storage });
  assert.equal(screen.byId('mp-saved').textContent, 'Saved mappings unavailable');
  assert.equal(screen.byId('mp-saved').disabled, true);
  assert.equal(screen.byId('mp-open-saved').disabled, true);
  assert.equal(screen.byId('mp-delete-saved').disabled, true);
  assert.match(screen.byId('mp-saved-status').textContent, /stored data has not been changed/);
  assert.equal(screen.byId('mp-saved-status').parentNode.hidden, false);
  screen.click('mp-new'); screen.rename('Keep this draft'); screen.click('mp-save-model'); await settle();
  assert.match(screen.status(), /Not saved/);
  assert.equal(screen.byId('mp-name').value, 'Keep this draft');
  assert.equal(m.values.get(LOCAL_KEY), original);
  assert.equal(m.writes.length, 0);
  screen.click('mp-retry-saved'); await settle();
  assert.equal(screen.byId('mp-saved-status').parentNode.hidden, false, 'failed retry must retain the error');
  m.values.set(LOCAL_KEY, JSON.stringify([savedRow()]));
  screen.click('mp-retry-saved'); await settle();
  assert.equal(screen.byId('mp-name').value, 'Keep this draft', 'refreshing the list does not replace the editor');
  assert.equal(screen.byId('mp-saved-status').parentNode.hidden, true);
  assert.equal(screen.byId('mp-open-saved').disabled, false);
  assert.equal(screen.byId('mp-delete-saved').disabled, false);
  assert.match(screen.byId('mp-saved').textContent, /Recovered mapping/);
  screen.byId('mp-saved').value = 'saved-a'; screen.click('mp-open-saved'); await settle();
  assert.equal(screen.byId('mp-name').value, 'Recovered mapping');
  assert.equal(m.writes.length, 0, 'recovery reads never rewrite the stored collection');
});

test('an absent Mapper key shows a genuine empty list and the first save becomes visible', async t => {
  const m = memory(), screen = await mountMapper(t, null, { storage: m.storage });
  assert.equal(screen.byId('mp-saved').textContent, 'No saved mappings');
  assert.equal(screen.byId('mp-saved-status').parentNode.hidden, true);
  screen.click('mp-new'); screen.rename('First saved mapping'); screen.click('mp-save-model'); await settle();
  assert.equal(m.writes.length, 1);
  assert.equal(JSON.parse(m.values.get(LOCAL_KEY))[0].name, 'First saved mapping');
  assert.match(screen.byId('mp-saved').textContent, /First saved mapping/);
  assert.match(screen.status(), /saved in this browser/);
  assert.equal(screen.byId('mp-open-saved').disabled, false);
});

test('an older failed native list cannot replace a newer successful saved-mapping refresh', async t => {
  const native = nativeMappings({ rows: [savedRow()] }), invoke = native.invoke;
  const old = deferred(); let delay = false, lists = 0;
  native.invoke = (command, args) => command === 'mapper_model_list' && delay && ++lists === 1 ? old.promise : invoke(command, args);
  const screen = await mountMapper(t, native);
  delay = true;
  screen.navigate('other'); screen.navigate('mapper');
  assert.equal(screen.byId('mp-open-saved').disabled, true);
  screen.navigate('other'); screen.navigate('mapper'); await settle();
  assert.match(screen.byId('mp-saved').textContent, /Recovered mapping/);
  old.reject(new Error('Earlier list failed')); await settle();
  assert.match(screen.byId('mp-saved').textContent, /Recovered mapping/);
  assert.equal(screen.byId('mp-saved-status').parentNode.hidden, true);
  assert.equal(screen.byId('mp-open-saved').disabled, false);
});
