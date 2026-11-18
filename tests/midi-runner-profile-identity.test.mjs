// Actual runner callbacks: stored map identity, control evaluation and deliberate learning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, B } from './fixtures/learned-map-profile-identity.mjs';
import { runMidi } from '../app/ui/devices/midi-runner.js';
import { Element, installServiceDom, settle } from './fixtures/service-screen-dom.mjs';
import { bridge } from './fixtures/midi-runner-dom.mjs';

// Generic browser surface absent from the service-screen fixture; no app logic is mocked.
Object.defineProperties(Element.prototype, {
  tBodies: { configurable: true, get() { return this.children.filter(child => child.tagName === 'TBODY'); } },
  classList: { configurable: true, get() {
    const change = (name, present) => { const classes = new Set(this.className.split(' ').filter(Boolean)); present ? classes.add(name) : classes.delete(name); this.className = [...classes].join(' '); return present; };
    return { add: (...names) => names.forEach(name => change(name, true)), remove: (...names) => names.forEach(name => change(name, false)), toggle: (name, force) => change(name, force ?? !this.className.split(' ').includes(name)) };
  } },
});

async function mount(t, f, kind = 'button') {
  installServiceDom(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = document.createElement('div'); document.body.append(host);
  const midi = bridge(), finished = [], saves = [];
  const ctx = {
    profile: f.profile, asset: f.asset, learned: f.row, kind, midi,
    test: { id: `probe-${kind}`, title: `Profile B ${kind}`, method: `midi:${kind}`, steps: [],
      ...(kind === 'button' ? { params: { controlIds: ['play'] }, pass: { metricId: 'midi_button_stuck', op: 'equals', value: 0 } } : {}) },
    finish: result => finished.push(result),
    saveLearned: async map => { saves.push(structuredClone(map)); return f.catalog.saveMidiMap(f.asset.id, f.profile.id, map); },
  };
  const runner = runMidi(host, ctx);
  t.after(() => runner.dispose());
  await settle();
  const byId = id => host.querySelector(`#${id}`);
  const click = async id => { const node = byId(id); assert.ok(node, `missing runner control ${id}`); node.dispatch('click'); await settle(); };
  return { host, midi, finished, saves, ctx, byId, click };
}

for (const [name, identity, number, expected] of [
  ['different profile cannot make an old button count as the current profile button', 'different', 11, 'unknown'],
  ['different profile cannot override the current published button binding', 'different', 42, 'pass'],
  ['same-profile learned override remains usable', 'same', 11, 'pass'],
  ['null-profile legacy learned override remains usable', 'null', 11, 'pass'],
  ['missing-profile legacy learned override remains usable', 'missing', 11, 'pass'],
]) test(name, async t => {
  const f = await seed({ identity });
  const m = await mount(t, f);
  m.midi.emit([0x90, number, 127], 100000);
  m.midi.emit([0x80, number, 0], 200000);
  t.mock.timers.tick(1000);
  await m.click('midi-finish');
  f.assertPreserved();
  assert.deepEqual(m.saves, [], 'running and finishing a test must not rewrite the learned map');
  assert.equal(m.finished.length, 1, 'the real Finish handler must produce exactly one result');
  t.diagnostic(JSON.stringify({ identity, number, observed: m.finished[0].status, expected, savedMapPreserved: true }));
  assert.equal(m.finished[0].status, expected);
});

test('coverage ignores a conflicting stored map and a deliberate new save does not carry its old controls', async t => {
  const profile = { ...structuredClone(B), midi: { mapSource: 'learn', complete: false, controls: [] } };
  const f = await seed({ identity: 'different', profile });
  const m = await mount(t, f, 'coverage');
  f.assertPreserved();
  t.diagnostic(JSON.stringify({ identity: 'different', coverageTitle: m.byId('cov-title')?.textContent, savedMapPreserved: true }));
  assert.match(m.byId('cov-title')?.textContent || '', /Learn this unit/, 'the old profile map must not suppress learning for the current profile');
  m.midi.emit([0xb0, 51, 64], 100000); t.mock.timers.tick(1000);
  const name = m.byId('learn-name-1'); assert.ok(name, 'a fresh MIDI control must appear');
  name.value = 'New knob'; name.dispatch('input');
  f.assertPreserved();
  assert.equal(m.byId('midi-save-map').disabled, false);
  await m.click('midi-save-map');
  assert.equal(m.saves.length, 1);
  assert.deepEqual(m.saves[0].controls.map(control => control.message.number), [51], 'fresh learning must not carry controls 11 or 13 across conflicting profile identity');
  const saved = await f.catalog.getMidiMap(f.asset.id);
  assert.equal(saved.profileId, f.profile.id);
  assert.deepEqual(saved.map, m.saves[0]);
  assert.equal(JSON.stringify(f.row), f.beforeRow, 'the input historical record remains untouched even when the user deliberately replaces its stored map');
});

for (const [name, profileId, identity, number, expected, omitCurrentId] of [
  ['literal zero profile ID remains a known matching identity', '0', 'same', 11, 'pass', false],
  ['profile ID case is not coerced during automatic use', 'PROFILE-A', 'different', 11, 'unknown', false],
  ['profile ID whitespace is not trimmed during automatic use', 'profile-a ', 'different', 11, 'unknown', false],
  ['missing current profile identity retains the legacy learned-map behavior', 'profile-b', 'different', 11, 'pass', true],
]) test(name, async t => {
  const profile = { ...structuredClone(B), id: profileId };
  const f = await seed({ identity, profile });
  if (omitCurrentId) delete f.profile.id;
  const m = await mount(t, f);
  m.midi.emit([0x90, number, 127], 100000);
  m.midi.emit([0x80, number, 0], 200000);
  t.mock.timers.tick(1000);
  await m.click('midi-finish');
  assert.equal(m.finished.length, 1);
  assert.equal(m.finished[0].status, expected);
  assert.deepEqual(m.saves, []);
  f.assertPreserved();
});
