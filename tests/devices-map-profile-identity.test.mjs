// The actual Devices card/detail callbacks must display only an automatically accepted map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from './fixtures/learned-map-profile-identity.mjs';
import { installServiceDom, settle } from './fixtures/service-screen-dom.mjs';
import { createDevicesScreen } from '../app/ui/screens/devices.js';
import { ensureLibrary, lib } from '../app/ui/devices/library-state.js';
import { store } from '../app/ui/state.js';

for (const identity of ['different', 'same', 'null', 'missing']) {
  test(`Devices map display preserves ${identity} profile identity and stored data`, async t => {
    installServiceDom(t);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    await ensureLibrary();
    const previous = { ...lib };
    t.after(() => Object.assign(lib, previous));
    const f = await seed({ identity });
    const reads = [];
    t.mock.method(store, 'getMidiMap', assetId => {
      reads.push(assetId);
      return f.catalog.getMidiMap(assetId);
    });
    Object.assign(lib, {
      ready: true, profiles: f.profiles, products: f.products,
      assets: await f.catalog.list('asset'), results: [], problems: [], error: null, syncError: null,
    });
    const section = document.createElement('section');
    document.getElementById('main').append(section);
    createDevicesScreen(section);
    t.after(() => { section.hidden = true; section.remove(); });
    const card = section.querySelector(`[data-device="${f.profile.id}"]`);
    assert.ok(card, 'current profile must be shown in the actual device grid');
    card.querySelector('.dev-card-main').dispatch('click');
    await settle();
    assert.deepEqual(reads, [f.asset.id], 'opening the profile reads the reassigned unit map');
    const map = section.querySelector('#dev-midi').textContent;
    const source = section.querySelector('#dev-midi-sub').textContent;
    assert.match(map, /Current level/);
    if (identity === 'different') {
      assert.match(map, /Current Play/);
      assert.doesNotMatch(map, /Old Play|Old-only control/);
      assert.doesNotMatch(source, /Learned on/);
    } else {
      assert.match(map, /Old Play/);
      assert.match(map, /Old-only control/);
      assert.match(source, /Learned on/);
    }
    f.assertPreserved();
  });
}
