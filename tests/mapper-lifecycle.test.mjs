import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../app/mapper/model.js';
import { runMidi } from '../app/ui/devices/midi-runner.js';
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

test('Mapper Learn selects a duplicate-name input by ID and ignores its namesake', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ports = [{ id: 'first', name: 'USB MIDI' }, { id: 'second', name: 'USB MIDI' }];
  const native = nativeMappings({ ports });
  const screen = await mountMapper(t, native); screen.click('mp-new');
  const select = screen.byId('mp-port');
  assert.notEqual(select.children[0].value, select.children[1].value);
  assert.match(select.children[1].textContent, /USB MIDI.*second/);
  select.value = select.children[1].value; select.dispatch('change');
  screen.click('mp-learn'); await settle();
  assert.equal(native.midiOpens.at(-1).id, 'second');
  native.emitMidi({ port: 'USB MIDI', portId: 'first', bytes: [0xb0, 1, 7] }); await settle();
  assert.match(screen.status(), /Listening/); assert.deepEqual(native.midiCloses, []);
  native.emitMidi({ port: 'USB MIDI', portId: 'second', bytes: [0xb0, 2, 7] }); await settle();
  assert.match(screen.status(), /Learned/);
  assert.deepEqual(native.midiCloses.map(args => args.id), ['second']);
});

test('Mapper Learn preserves an existing same-ID connection and refuses a vanished selected ID', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ports = [{ id: 'first', name: 'USB MIDI' }, { id: 'second', name: 'USB MIDI' }];
  const native = nativeMappings({ ports, openPorts: [ports[1]] });
  const screen = await mountMapper(t, native); screen.click('mp-new');
  const select = screen.byId('mp-port'); select.value = select.children[1].value; select.dispatch('change');
  screen.click('mp-learn'); await settle();
  native.emitMidi({ port: 'USB MIDI', portId: 'second', bytes: [0xb0, 2, 7] }); await settle();
  assert.deepEqual(native.midiCloses, [], 'Learn does not own an input already open by the same ID');
  ports.splice(1, 1); const before = native.midiOpens.length;
  screen.click('mp-learn'); await settle();
  assert.equal(native.midiOpens.length, before, 'the same-name replacement is not opened');
  assert.match(screen.status(), /unavailable|select/i);
});

test('a cancelled pending Mapper Learn cannot close its newer same-ID owner', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = deferred(); let calls = 0;
  const native = nativeMappings({ ports: [{ id: 'one', name: 'USB MIDI' }], beforeMidiOpen: () => ++calls === 1 ? first.promise : undefined });
  const screen = await mountMapper(t, native); screen.click('mp-new');
  screen.click('mp-learn'); await settle(); assert.equal(native.midiOpens.length, 1);
  screen.navigate('other'); screen.navigate('mapper'); await settle();
  screen.click('mp-learn'); await settle(); assert.equal(native.midiOpens.length, 2);
  first.resolve(); await settle();
  assert.deepEqual(native.midiCloses, [], 'the stale successful open cannot release the replacement Learn claim');
  native.emitMidi({ port: 'USB MIDI', portId: 'one', bytes: [0xb0, 3, 7] }); await settle();
  assert.match(screen.status(), /Learned/);
  assert.deepEqual(native.midiCloses.map(args => args.id), ['one']);
});

function mountSharedRunner(t) {
  const host = document.createElement('div'); document.body.append(host);
  const runner = runMidi(host, { kind: 'button', profile: { model: 'Test unit', midi: { mapSource: 'published', controls: [] } }, test: { method: 'midi:button', steps: [] }, finish() {} });
  t.after(() => runner.dispose());
  return runner;
}

test('a late cancelled Mapper open cannot close the device runner successor on the same ID', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred(); let calls = 0;
  const native = nativeMappings({ ports: [{ id: 'one', name: 'USB MIDI' }], beforeMidiOpen: () => ++calls === 1 ? pending.promise : undefined });
  const screen = await mountMapper(t, native); screen.click('mp-new'); screen.click('mp-learn'); await settle();
  screen.navigate('other'); const runner = mountSharedRunner(t); await settle();
  assert.equal(native.midiOpens.length, 2); pending.resolve(); await settle();
  assert.deepEqual(native.midiCloses, [], 'Mapper cleanup cannot close the runner claim');
  assert.ok(native.opened.has('one'));
  runner.dispose(); await settle(); assert.deepEqual(native.midiCloses.map(args => args.id), ['one']);
});

test('a late disposed runner open cannot close its Mapper Learn successor on the same ID', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred(); let calls = 0;
  const native = nativeMappings({ ports: [{ id: 'one', name: 'USB MIDI' }], beforeMidiOpen: () => ++calls === 1 ? pending.promise : undefined });
  const screen = await mountMapper(t, native); screen.click('mp-new'); screen.navigate('other');
  const runner = mountSharedRunner(t); await settle(); runner.dispose();
  screen.navigate('mapper'); await settle(); screen.click('mp-learn'); await settle();
  assert.equal(native.midiOpens.length, 2); pending.resolve(); await settle();
  assert.deepEqual(native.midiCloses, [], 'runner cleanup cannot close the Mapper claim');
  native.emitMidi({ port: 'USB MIDI', portId: 'one', bytes: [0xb0, 3, 7] }); await settle();
  assert.match(screen.status(), /Learned/); assert.deepEqual(native.midiCloses.map(args => args.id), ['one']);
});

test('Mapper does not infer ID ownership from a matching display-name status', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const native = nativeMappings({ ports: [{ id: 'chosen', name: 'USB MIDI' }] });
  const original = native.invoke;
  native.invoke = (command, args) => command === 'midi_status' ? Promise.resolve({ openInputs: ['USB MIDI'] }) : original(command, args);
  const screen = await mountMapper(t, native); screen.click('mp-new'); screen.click('mp-learn'); await settle();
  assert.deepEqual(native.midiOpens, []); assert.deepEqual(native.midiCloses, []);
  assert.match(screen.status(), /ownership could not be checked/);
});
