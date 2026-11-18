// Actual Mapper Load/Open/Save callbacks with a real isolated browser catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from './fixtures/learned-map-profile-identity.mjs';
import { mountMapper, nativeMappings, settle } from './fixtures/mapper-lifecycle-dom.mjs';
import { store } from '../app/ui/state.js';
import { lib } from '../app/ui/devices/library-state.js';

async function mount(t, f) {
  const previous = { profiles: lib.profiles, products: lib.products, assets: lib.assets };
  t.after(() => Object.assign(lib, previous));
  const reads = [], writes = [];
  t.mock.method(store, 'getMidiMap', assetId => { reads.push(assetId); return f.catalog.getMidiMap(assetId); });
  t.mock.method(store, 'saveMidiMap', (...args) => { writes.push(structuredClone(args)); return f.catalog.saveMidiMap(...args); });
  const native = nativeMappings();
  const screen = await mountMapper(t, native);
  // Mount's empty library fetch has settled. Supply the real store's current assets/profile-product mapping.
  Object.assign(lib, { profiles: f.profiles, products: f.products, assets: await f.catalog.list('asset') });
  screen.navigate('other'); screen.navigate('mapper'); await settle();
  const select = screen.byId('mp-device');
  assert.ok(select.children.some(option => option.value === f.asset.id), 'reassigned asset must appear in the actual unit selector');
  select.value = f.asset.id;
  screen.click('mp-load-device'); await settle();
  assert.deepEqual(reads, [f.asset.id], 'the actual load handler must read the saved row by asset');
  return { screen, native, reads, writes };
}
const bindings = model => model.controls.map(control => `${control.midi.type}:${control.midi.number}`).sort();

for (const [name, identity, expected] of [
  ['automatic unit loading ignores a known conflicting profile map', 'different', ['cc:7', 'note:42']],
  ['automatic unit loading retains the same-profile learned map', 'same', ['cc:13', 'cc:7', 'note:11']],
  ['automatic unit loading retains null-profile legacy maps', 'null', ['cc:13', 'cc:7', 'note:11']],
  ['automatic unit loading retains missing-profile legacy maps', 'missing', ['cc:13', 'cc:7', 'note:11']],
]) test(name, async t => {
  const f = await seed({ identity });
  const m = await mount(t, f);
  f.assertPreserved();
  m.screen.click('mp-save-model'); await settle();
  assert.equal(m.native.saves.length, 1, 'the real Save mapping handler must capture the loaded model');
  const saved = m.native.saves[0];
  assert.equal(saved.assetId, f.asset.id);
  assert.equal(saved.profileId, f.profile.id);
  f.assertPreserved(); assert.deepEqual(m.writes, [], 'opening and saving a mapper model must not edit the original learned map');
  t.diagnostic(JSON.stringify({ identity, currentProfile: saved.profileId, bindings: bindings(saved.model), expected, savedMapPreserved: true }));
  assert.deepEqual(bindings(saved.model), expected);
});

test('intentional Open file still imports the chosen conflicting-profile learned-map file', async t => {
  const f = await seed({ identity: 'different' });
  const m = await mount(t, f);
  m.screen.click('mp-open');
  const input = document.getElementById('mp-file-input'); assert.ok(input);
  const text = JSON.stringify(f.row);
  input.files = [{ name: 'chosen-learned-map.json', size: text.length, text: async () => text }];
  input.dispatch('change'); await settle();
  assert.match(m.screen.status(), /Learned map opened/);
  m.screen.click('mp-save-model'); await settle();
  assert.equal(m.native.saves.length, 1);
  assert.deepEqual(bindings(m.native.saves[0].model), ['cc:13', 'cc:7', 'note:11'], 'explicit file import preserves the controls the user chose to import');
  f.assertPreserved(); assert.deepEqual(m.writes, []);
});
