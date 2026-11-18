import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installServiceDom, deferred, settle } from './fixtures/service-screen-dom.mjs';
import { createCatalogArchive, serializeCatalogArchive, parseCatalogArchive, MAX_CATALOG_ARCHIVE_BYTES } from '../app/catalog-archive.js';
import { createCatalogStore, emptyState } from '../app/catalog-store.js';

const document = installServiceDom({ after });
window.addEventListener = () => {}; window.removeEventListener = () => {};
const { createDataScreen } = await import('../app/ui/screens/data.js');
const { createEquipmentScreen } = await import('../app/ui/screens/equipment.js');
const fixture = JSON.parse(fs.readFileSync(new URL('./contracts/catalog-archive.json', import.meta.url)));
const copy = value => structuredClone(value), stamp = fixture.exportedAt, key = 'deckchek.catalog.v1';
const input = () => copy(fixture), empty = () => ({ ...input(), catalog: emptyState().catalog });
function memory() {
  const map = new Map(); return { map, writes: [], getItem: name => map.get(name) ?? null,
    setItem(name, text) { this.writes.push(name); map.set(name, String(text)); } };
}
function file(value, name = 'catalog.json') {
  const text = typeof value === 'string' ? value : serializeCatalogArchive(value);
  return { name, size: new TextEncoder().encode(text).length, text: async () => text };
}
function mount(t, { storage = memory(), archive, saveFile } = {}) {
  const host = document.createElement('section'); document.body.append(host); const downloads = [];
  const engine = createCatalogArchive({ storage, now: () => stamp });
  const screen = createDataScreen(host, { catalogArchiveOptions: { archive: archive ?? engine,
    saveFile: saveFile ?? ((name, text, type) => downloads.push({ name, text, type })) } });
  t.after(() => { screen.dispose(); host.remove(); });
  const field = id => host.querySelector(`#catalog-archive-${id}`);
  return { host, screen, engine, storage, downloads, field,
    async choose(selected) { field('file').files = [selected]; field('file').dispatch('change'); await settle(); },
    async import() { field('import').dispatch('click'); await settle(); },
  };
}

test('actual Data screen exposes a separate Equipment catalog file and explicit import control', async t => {
  const host = document.createElement('section'); document.body.append(host);
  const screen = createDataScreen(host);
  t.after(() => { screen.dispose(); host.remove(); });
  assert.ok(host.querySelector('#data-catalog-archive'), 'Data needs a separate Equipment catalog card');
  assert.ok(host.querySelector('#catalog-archive-export'));
  assert.ok(host.querySelector('#catalog-archive-file'));
  assert.ok(host.querySelector('#catalog-archive-import'));
  assert.ok(host.querySelector('#data-venue-history'), 'existing history archive stays available');
  assert.ok(host.querySelector('#data-import-json'), 'workspace v1 retains its existing entrypoint');
});

test('actual Data controls export, preview without writes, explicitly import and re-export after screen recreation', async t => {
  const source = mount(t); source.engine.importArchive(input()); source.field('export').dispatch('click'); await settle();
  assert.equal(source.downloads.length, 1); assert.equal(source.downloads[0].name, 'deckchek-catalog.json');
  const exported = parseCatalogArchive(source.downloads[0].text); assert.deepEqual(exported, input());
  const target = mount(t); await target.choose(file(exported, 'Catalog <img src=x> 𝄞.json'));
  assert.equal(target.storage.writes.length, 0); assert.match(target.field('preview').textContent, /9 records/);
  assert.match(target.field('preview').textContent, /New records: 9/); assert.match(target.field('preview').textContent, /<img src=x>/);
  assert.equal(target.host.querySelectorAll('img').length, 0); assert.equal(target.field('import').disabled, false);
  await target.import(); assert.match(target.field('status').textContent, /Added 9 records/); assert.deepEqual(target.storage.writes, [key]);
  const reloaded = mount(t, { storage: target.storage }); reloaded.field('export').dispatch('click'); await settle();
  assert.deepEqual(parseCatalogArchive(reloaded.downloads[0].text), exported);
  await reloaded.choose(file(exported)); await reloaded.import();
  assert.match(reloaded.field('status').textContent, /Added 0 records; 9 exact records/); assert.deepEqual(target.storage.writes, [key]);
});

test('preview discloses opaque references, retained legacy mismatches and actual Devices association limits', async t => {
  const s = mount(t), value = input(); value.catalog.setup[0].deckPositionId = 'old <img src=x> position';
  await s.choose(file(value));
  assert.match(s.field('preview').textContent, /4 distinct saved reference IDs/); assert.match(s.field('preview').textContent, /1 saved support-position mismatches/);
  assert.match(s.field('preview').textContent, /old <img src=x> position/); assert.equal(s.host.querySelectorAll('img').length, 0);
  assert.match(s.host.textContent, /Imported assets can appear in Equipment before they are associated with a Devices profile/);
  assert.match(s.host.textContent, /synchronization can update matching product descriptions when the app starts/);
  assert.match(s.host.textContent, /does not transfer device-library profile bindings, saved test results, learned MIDI maps, calibration or photos/);
  await s.import(); assert.equal(s.engine.exportArchive().catalog.setup[0].deckPositionId, 'old <img src=x> position');
});

test('conflicting saved metadata is escaped and blocks the entire import', async t => {
  const s = mount(t), value = input(); value.catalog.venue[0].id = '<img src=x>'; value.catalog.setup[0].venueId = '<img src=x>';
  s.engine.importArchive(value); const before = s.storage.map.get(key); value.catalog.venue[0].name = 'Changed';
  await s.choose(file(value)); assert.match(s.field('preview').textContent, /Conflicts: 1/); assert.match(s.field('preview').textContent, /<img src=x>/);
  assert.equal(s.field('import').disabled, true); assert.equal(s.host.querySelectorAll('img').length, 0);
  await s.import(); assert.equal(s.storage.map.get(key), before); assert.equal(s.storage.writes.length, 1);
});

test('stale file reads and preview responses cannot replace newer selected catalog state', async t => {
  const slow = deferred(), s = mount(t); await s.choose({ name: 'old.json', size: 100, text: () => slow.promise });
  await s.choose(file(empty(), 'current.json')); slow.reject(new Error('Retired file failure')); await settle();
  assert.match(s.field('preview').textContent, /current.json/); assert.doesNotMatch(s.host.textContent, /Retired file failure/);
  const engine = createCatalogArchive({ storage: memory(), now: () => stamp }), requests = [];
  const other = mount(t, { archive: { ...engine, preview: value => { const gate = deferred(); requests.push({ gate, value }); return gate.promise; } } });
  await other.choose(file(input(), 'old-preview.json')); await other.choose(file(empty(), 'current-preview.json'));
  requests[1].gate.resolve(engine.preview(requests[1].value)); await settle(); requests[0].gate.reject(new Error('Retired preview failure')); await settle();
  assert.match(other.field('preview').textContent, /current-preview.json/); assert.doesNotMatch(other.host.textContent, /Retired preview failure/);
});

test('same-screen onShow preserves ownership of a pending file read', async t => {
  const gate = deferred(), s = mount(t);
  await s.choose({ name: 'still-selected.json', size: 100, text: () => gate.promise });
  s.screen.onShow(); s.screen.onShow(); gate.resolve(serializeCatalogArchive(input())); await settle();
  assert.match(s.field('preview').textContent, /New records: 9/); assert.equal(s.field('import').disabled, false);
  assert.doesNotMatch(s.field('status').textContent, /Reading the selected/); assert.equal(s.storage.writes.length, 0);
});

test('same-screen onShow preserves ownership of a pending preview', async t => {
  const gate = deferred(), storage = memory(), engine = createCatalogArchive({ storage, now: () => stamp }); let calls = 0;
  const s = mount(t, { storage, archive: { ...engine, preview: value => { calls++; return gate.promise.then(() => engine.preview(value)); } } });
  await s.choose(file(input(), 'still-previewing.json')); s.screen.onShow(); s.screen.onShow(); gate.resolve(); await settle();
  assert.equal(calls, 1); assert.match(s.field('preview').textContent, /New records: 9/); assert.equal(s.field('import').disabled, false);
  assert.doesNotMatch(s.field('status').textContent, /Validating the complete/); assert.equal(storage.writes.length, 0);
});

test('hide and disposal retire file reads and stale previews without reviving their ownership', async t => {
  for (const dispose of [false, true]) {
    const gate = deferred(), s = mount(t); await s.choose({ name: 'slow.json', size: 100, text: () => gate.promise });
    if (dispose) s.screen.dispose(); else s.screen.onHide();
    const before = s.host.textContent; gate.resolve(serializeCatalogArchive(input())); await settle();
    assert.equal(s.host.textContent, before); assert.equal(s.storage.writes.length, 0);
    if (!dispose) { s.screen.onShow(); await settle(); assert.equal(s.field('import').disabled, true); }
  }
  const storage = memory(), engine = createCatalogArchive({ storage, now: () => stamp }), requests = [];
  const s = mount(t, { storage, archive: { ...engine, preview: value => { const gate = deferred(); requests.push({ gate, result: engine.preview(value) }); return gate.promise; } } });
  await s.choose(file(input())); s.screen.onHide(); engine.importArchive(input()); s.screen.onShow(); await settle();
  assert.equal(requests.length, 2); requests[1].gate.resolve(requests[1].result); await settle();
  assert.match(s.field('preview').textContent, /already present: 9/);
  requests[0].gate.resolve(requests[0].result); await settle(); assert.match(s.field('preview').textContent, /already present: 9/);
});

test('dispatched import retains its original copied file across hide, duplicate presses and lost acknowledgment', async t => {
  const storage = memory(), engine = createCatalogArchive({ storage, now: () => stamp }), gate = deferred(); let calls = 0;
  const s = mount(t, { storage, archive: { ...engine, importArchive: async value => { calls++; const result = engine.importArchive(value); if (calls === 1) await gate.promise; return result; } } });
  await s.choose(file(input(), 'original.json')); await s.import(); s.field('import').dispatch('click'); s.screen.onHide();
  s.field('file').files = [file(empty(), 'replacement.json')]; s.field('file').dispatch('change');
  gate.reject(new Error('Lost acknowledgement')); await settle(); s.screen.onShow(); await settle();
  assert.match(s.field('status').textContent, /Could not confirm/); assert.ok(s.field('retry'));
  s.field('retry').dispatch('click'); await settle();
  assert.equal(calls, 2); assert.equal(storage.writes.length, 1); assert.deepEqual(engine.exportArchive(), input());
  assert.match(s.field('status').textContent, /Added 0 records; 9 exact records/);
});

test('hidden completion is rendered when shown again while disposed panels ignore late acknowledgment', async t => {
  for (const dispose of [false, true]) {
    const storage = memory(), engine = createCatalogArchive({ storage, now: () => stamp }), gate = deferred(); let result;
    const s = mount(t, { storage, archive: { ...engine, importArchive: value => { result = engine.importArchive(value); return gate.promise; } } });
    await s.choose(file(input())); await s.import(); if (dispose) s.screen.dispose(); else s.screen.onHide();
    const before = s.host.textContent; gate.resolve(result); await settle(); assert.equal(s.host.textContent, before); assert.equal(storage.writes.length, 1);
    if (!dispose) { s.screen.onShow(); await settle(); assert.match(s.field('status').textContent, /Import complete/); }
  }
});

test('quota failure retains the full previous catalog and an explicit retry imports once', async t => {
  const storage = memory(); storage.map.set(key, JSON.stringify(emptyState())); const before = storage.map.get(key), set = storage.setItem;
  storage.setItem = () => { throw new Error('Quota full'); };
  const s = mount(t, { storage }); await s.choose(file(input())); await s.import();
  assert.match(s.field('status').textContent, /Quota full/); assert.equal(storage.map.get(key), before); assert.equal(storage.writes.length, 0);
  storage.setItem = set; s.field('retry').dispatch('click'); await settle();
  assert.match(s.field('status').textContent, /Added 9 records/); assert.deepEqual(storage.writes, [key]);
});

test('changes after preview are revalidated and surfaced as conflicts before any import write', async t => {
  const s = mount(t); await s.choose(file(input())); const changed = input(); changed.catalog.asset[0].nickname = 'Changed elsewhere';
  s.engine.importArchive(changed); const before = s.storage.map.get(key); await s.import();
  assert.match(s.field('status').textContent, /Import blocked by conflicts/); assert.equal(s.field('import').disabled, true);
  assert.equal(s.storage.map.get(key), before); assert.equal(s.storage.writes.length, 1); assert.equal(s.field('retry'), null);
});

test('retired retry buttons and stale export promises cannot act on a later selection or hidden screen', async t => {
  let attempts = 0; const engine = createCatalogArchive({ storage: memory(), now: () => stamp });
  const s = mount(t, { archive: { ...engine, importArchive: () => { attempts++; throw new Error('Write blocked'); } } });
  await s.choose(file(input())); await s.import(); const retired = s.field('retry'); assert.ok(retired);
  await s.choose(file(empty())); retired.dispatch('click'); await settle(); assert.equal(attempts, 1);
  const gate = deferred(), other = mount(t, { archive: { ...engine, exportArchive: () => gate.promise } });
  other.field('export').dispatch('click'); await settle(); other.screen.onHide(); gate.resolve(empty()); await settle(); assert.equal(other.downloads.length, 0);
});

test('file bounds, corrupt source and corrupt target remain visible without a false success', async t => {
  const s = mount(t); let read = false;
  await s.choose({ name: 'large.json', size: MAX_CATALOG_ARCHIVE_BYTES + 1, text: async () => { read = true; return '{}'; } });
  assert.equal(read, false); assert.match(s.field('status').textContent, /32 MiB/);
  await s.choose(file('{broken')); assert.match(s.field('status').textContent, /JSON/); assert.equal(s.field('import').disabled, true);
  s.storage.map.set(key, '{broken'); s.field('export').dispatch('click'); await settle();
  assert.match(s.field('status').textContent, /Could not export/); assert.equal(s.downloads.length, 0);
  await s.choose(file(input())); assert.match(s.field('status').textContent, /Could not preview/); assert.equal(s.storage.writes.length, 0);
});

test('default Data screen handles a blocked global storage getter without failing construction', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), host = document.createElement('section'); document.body.append(host);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Catalog storage blocked'); } }); let screen;
  try {
    assert.doesNotThrow(() => { screen = createDataScreen(host); });
    host.querySelector('#catalog-archive-export').dispatch('click'); await settle();
    assert.match(host.querySelector('#catalog-archive-status').textContent, /Could not export.*blocked/);
  } finally { Object.defineProperty(globalThis, 'localStorage', descriptor); screen?.dispose(); host.remove(); }
});

test('actual Equipment list sees imported assets and explains catalog versus Devices portability', async t => {
  const storage = memory(); createCatalogArchive({ storage, now: () => stamp }).importArchive(input());
  const host = document.createElement('section'); document.body.append(host);
  const screen = createEquipmentScreen(host, { store: createCatalogStore({ invoke: null, storage }) });
  t.after(() => { screen.onHide(); host.remove(); }); await settle();
  // This small DOM fixture retains HTML entities instead of decoding them;
  // assert the production escaped markup and absence of an injected element.
  assert.match(host.querySelector('#eq-rows').textContent, /Deck &lt;img src=x&gt; café/); assert.equal(host.querySelectorAll('img').length, 0);
  assert.match(host.querySelector('#eq-catalog-portability').textContent, /separate Equipment catalog file/);
  host.querySelector('#eq-tab-supportConfiguration').dispatch('click'); await settle();
  assert.match(host.querySelector('#eq-support-status').textContent, /Workspace JSON export does not include catalog supports or setups/);
  assert.match(host.querySelector('#eq-support-status').textContent, /separate Equipment catalog file/);
});
