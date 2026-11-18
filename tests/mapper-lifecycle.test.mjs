import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../app/mapper/model.js';
import { deferred, mountMapper, nativeMappings, settle } from './fixtures/mapper-lifecycle-dom.mjs';

test('a save finishing after New empty cannot make the new mapping overwrite the old mapping', async t => {
  const pending = deferred();
  const native = nativeMappings({ beforeSave: (_, call) => call === 1 ? pending.promise : undefined });
  const screen = await mountMapper(t, native);
  screen.click('mp-new'); screen.rename('First mapping'); screen.click('mp-save-model');
  assert.equal(native.saves.length, 1);
  screen.click('mp-new'); screen.rename('Second mapping');
  const status = screen.status();
  pending.resolve(); await settle();
  assert.equal(screen.status(), status, 'the previous save must not claim that the new mapping is saved');
  screen.click('mp-save-model'); await settle();
  assert.equal(native.saves[1].id, null, 'the new mapping must be inserted, not assigned the earlier save id');
  assert.deepEqual([...native.saved.values()].map(row => row.name).sort(), ['First mapping', 'Second mapping']);
});

test('a save finishing after Open keeps the opened mapping as the next save target', async t => {
  const existing = { id: '00000000-0000-4000-8000-000000000001', name: 'Existing mapping', assetId: null, profileId: null, model: createModel({ name: 'Existing mapping' }) };
  const pending = deferred();
  const native = nativeMappings({ rows: [existing], beforeSave: (_, call) => call === 1 ? pending.promise : undefined });
  const screen = await mountMapper(t, native);
  screen.click('mp-new'); screen.rename('First mapping'); screen.click('mp-save-model');
  screen.byId('mp-saved').value = existing.id; screen.click('mp-open-saved'); await settle();
  assert.equal(screen.byId('mp-name').value, existing.name);
  pending.resolve(); await settle();
  screen.rename('Existing mapping edited'); screen.click('mp-save-model'); await settle();
  assert.equal(native.saves[1].id, existing.id, 'the first save must not redirect a subsequent save of the opened mapping');
  assert.equal(native.saved.get(existing.id).name, 'Existing mapping edited');
  assert.ok([...native.saved.values()].some(row => row.name === 'First mapping'));
});

test('editing the current mapping during its first save keeps its returned id for later saves', async t => {
  const pending = deferred();
  const native = nativeMappings({ beforeSave: (_, call) => call === 1 ? pending.promise : undefined });
  const screen = await mountMapper(t, native);
  screen.click('mp-new'); screen.rename('Original name'); screen.click('mp-save-model');
  screen.rename('Edited while saving');
  pending.resolve(); await settle();
  screen.click('mp-save-model'); await settle();
  assert.equal(native.saved.size, 1, 'ordinary edits belong to the same mapping and must not cause duplicate inserts');
  assert.equal(native.saves[1].id, [...native.saved.keys()][0]);
  assert.equal([...native.saved.values()][0].name, 'Edited while saving');
});

test('a hidden cached mapper retains a completed save id when the same mapping is shown again', async t => {
  const pending = deferred();
  const native = nativeMappings({ beforeSave: (_, call) => call === 1 ? pending.promise : undefined });
  const screen = await mountMapper(t, native);
  screen.click('mp-new'); screen.rename('Cached mapping'); screen.click('mp-save-model');
  screen.navigate('other'); assert.equal(screen.section.hidden, true);
  pending.resolve(); await settle();
  screen.navigate('mapper'); await settle();
  assert.equal(screen.section.hidden, false);
  screen.rename('Cached mapping edited'); screen.click('mp-save-model'); await settle();
  assert.equal(native.saved.size, 1);
  assert.equal(native.saves[1].id, [...native.saved.keys()][0]);
});

test('a failed save for a replaced mapping does not replace the current mapping status', async t => {
  const pending = deferred();
  const native = nativeMappings({ beforeSave: () => pending.promise });
  const screen = await mountMapper(t, native);
  screen.click('mp-new'); screen.rename('First mapping'); screen.click('mp-save-model');
  screen.click('mp-new'); screen.rename('Second mapping');
  const status = screen.status();
  pending.reject(new Error('Previous mapping write failed')); await settle();
  assert.equal(screen.status(), status);
  assert.equal(screen.byId('mp-save-model').getAttribute('aria-disabled'), null);
  assert.equal(native.saved.size, 0);
});
