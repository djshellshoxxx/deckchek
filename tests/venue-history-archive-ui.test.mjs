import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installServiceDom, deferred, settle } from './fixtures/service-screen-dom.mjs';
import { createVenueHistoryArchive, serializeVenueHistoryArchive, parseVenueHistoryArchive, MAX_ARCHIVE_BYTES } from '../app/venue-history-archive.js';
import { compareObservations, createSupportIsolationStore } from '../app/support-isolation.js';
import { createVenueIncidentStore } from '../app/venue-incidents.js';

const document = installServiceDom({ after });
window.addEventListener = () => {}; window.removeEventListener = () => {};
const { createDataScreen } = await import('../app/ui/screens/data.js');
const { createVenueIncidentPanel } = await import('../app/ui/workflows/venue-incidents.js');
const { createSupportIsolationPanel } = await import('../app/ui/workflows/support-isolation.js');
const support = JSON.parse(fs.readFileSync(new URL('./contracts/support-isolation.json', import.meta.url)));
const incident = JSON.parse(fs.readFileSync(new URL('./contracts/venue-incidents.json', import.meta.url)));
const stamp = '2026-11-18T14:00:00.000Z', copy = value => structuredClone(value);
function memory() {
  const map = new Map(); return { map, writes: [], get length() { return map.size; }, key: index => [...map.keys()][index] ?? null,
    getItem: key => map.get(key) ?? null, setItem(key, value) { this.writes.push(key); map.set(key, String(value)); } };
}
function inputArchive() {
  const a = { ...copy(support.observationA), recordedAt: stamp, contextIssues: [] }, b = { ...copy(support.observationB), recordedAt: stamp, contextIssues: [] };
  const c = { ...support.comparison, pairId: a.pairId, venueId: a.venueId, setupId: a.setupId, recordedAt: stamp, result: compareObservations(a, b, support.comparison) };
  const manual = { ...copy(incident.draft), origin: 'operator', recordedAt: incident.recordedAt };
  manual.context.venue.name = 'Historic <img src=x> 𐐷';
  return { format: 'deckchek-venue-history', formatVersion: 1, exportedAt: stamp, incidents: [manual], supportObservations: [a, b], supportComparisons: [c] };
}
const emptyArchive = () => ({ ...inputArchive(), incidents: [], supportObservations: [], supportComparisons: [] });
function file(value, name = 'history.json') {
  const text = typeof value === 'string' ? value : serializeVenueHistoryArchive(value);
  return { name, size: new TextEncoder().encode(text).length, text: async () => text };
}
function mount(t, { storage = memory(), archive, saveFile, ...options } = {}) {
  const host = document.createElement('section'); document.body.append(host); const downloads = [];
  const engine = createVenueHistoryArchive({ storage, now: () => stamp });
  const screen = createDataScreen(host, { archiveOptions: { archive: archive ?? engine,
    saveFile: saveFile ?? ((name, text, type) => downloads.push({ name, text, type })), ...options } });
  t.after(() => { screen.dispose?.(); screen.onHide?.(); host.remove(); });
  const field = id => host.querySelector(`#venue-history-${id}`);
  return { host, screen, field, storage, engine, downloads,
    async choose(selected) { const control = field('file'); assert.ok(control, 'Data exposes the archive file input'); control.files = [selected]; control.dispatch('change'); await settle(); },
    async import() { assert.ok(field('import')); field('import').dispatch('click'); await settle(); },
  };
}

test('actual Data controls export, preview, explicitly import, reload and re-export original history', async t => {
  const source = mount(t); source.engine.importArchive(inputArchive()); await settle();
  assert.ok(source.host.querySelector('#data-venue-history')); source.field('export').dispatch('click'); await settle();
  assert.equal(source.downloads.length, 1); const exported = parseVenueHistoryArchive(source.downloads[0].text);
  assert.equal(exported.incidents[0].context.venue.name, 'Historic <img src=x> 𐐷');
  const destination = mount(t); await destination.choose(file(exported, '<img src=x> archive.json'));
  assert.equal(destination.storage.writes.length, 0, 'preview never imports');
  assert.match(destination.field('preview').textContent, /1 incident/); assert.match(destination.field('preview').textContent, /2 support observations/);
  assert.equal(destination.host.querySelectorAll('img').length, 0); assert.equal(destination.field('import').disabled, false);
  await destination.import(); assert.match(destination.field('status').textContent, /Import complete/); assert.equal(destination.storage.writes.length, 4);
  destination.screen.onHide(); destination.screen.onShow(); await settle();
  destination.field('export').dispatch('click'); await settle();
  const reexported = parseVenueHistoryArchive(destination.downloads[0].text);
  assert.deepEqual(reexported, exported);
  const reloaded = mount(t, { storage: destination.storage }); await reloaded.choose(file(exported)); await reloaded.import();
  assert.match(reloaded.field('status').textContent, /Added 0/); assert.match(reloaded.field('status').textContent, /4.*already present/);
  assert.equal(destination.storage.writes.length, 4);
});

test('conflicts are previewed as text and cannot dispatch an import', async t => {
  const s = mount(t), value = inputArchive(); value.incidents[0].id = '<img src=x>';
  s.engine.importArchive(value); value.incidents[0].recordedAt = '2026-11-18T15:00:00.000Z';
  await s.choose(file(value)); assert.match(s.field('preview').textContent, /Conflicts: 1/); assert.match(s.field('preview').textContent, /<img src=x>/);
  assert.equal(s.field('import').disabled, true); assert.equal(s.host.querySelectorAll('img').length, 0); const before = s.storage.writes.length;
  await s.import(); assert.equal(s.storage.writes.length, before);
});

test('stale file text and preview responses or errors cannot replace a newer file selection', async t => {
  const oldText = deferred(), s = mount(t);
  await s.choose({ name: 'retired.json', size: 100, text: () => oldText.promise });
  await s.choose(file(emptyArchive(), 'new.json')); oldText.reject(new Error('Retired file read')); await settle();
  assert.match(s.field('preview').textContent, /new.json/); assert.doesNotMatch(s.host.textContent, /Retired file read/);
  const gates = [], engine = createVenueHistoryArchive({ storage: memory(), now: () => stamp });
  const other = mount(t, { archive: { ...engine, preview: value => { const gate = deferred(); gates.push({ gate, value }); return gate.promise; } } });
  await other.choose(file(inputArchive(), 'old-preview.json')); await other.choose(file(emptyArchive(), 'current-preview.json'));
  gates[1].gate.resolve(engine.preview(gates[1].value)); await settle(); gates[0].gate.reject(new Error('Retired preview')); await settle();
  assert.match(other.field('preview').textContent, /current-preview.json/); assert.doesNotMatch(other.host.textContent, /Retired preview/);
});

test('hidden or disposed file reads never render a retired preview', async t => {
  for (const dispose of [false, true]) {
    const gate = deferred(), s = mount(t); await s.choose({ name: 'slow.json', size: 100, text: () => gate.promise });
    if (dispose) s.screen.dispose(); else s.screen.onHide();
    const before = s.host.textContent; gate.resolve(serializeVenueHistoryArchive(inputArchive())); await settle();
    assert.equal(s.host.textContent, before); assert.equal(s.storage.writes.length, 0);
    if (!dispose) { s.screen.onShow(); await settle(); assert.equal(s.field('import').disabled, true); }
  }
});

test('an already dispatched import retains the original file through hide, duplicate presses and a lost response', async t => {
  const storage = memory(), engine = createVenueHistoryArchive({ storage, now: () => stamp }), gate = deferred(); let calls = 0;
  const s = mount(t, { storage, archive: { ...engine, importArchive: async value => { calls++; const result = engine.importArchive(value); if (calls === 1) await gate.promise; return result; } } });
  await s.choose(file(inputArchive(), 'original.json')); await s.import(); s.field('import').dispatch('click');
  s.screen.onHide(); s.field('file').files = [file(emptyArchive(), 'replacement.json')]; s.field('file').dispatch('change');
  gate.reject(new Error('Response lost after persistence')); await settle(); s.screen.onShow(); await settle();
  assert.match(s.field('status').textContent, /Could not confirm/); assert.ok(s.field('retry'));
  s.field('retry').dispatch('click'); await settle(); assert.equal(calls, 2); assert.equal(storage.writes.length, 4);
  assert.equal(engine.exportArchive().incidents[0].context.venue.name, 'Historic <img src=x> 𐐷');
  assert.match(s.field('status').textContent, /Added 0/); assert.match(s.field('status').textContent, /4.*already present/);
});

test('confirmed hidden import completion returns owned counts, while disposed controllers never render the acknowledgment', async t => {
  for (const dispose of [false, true]) {
    const storage = memory(), engine = createVenueHistoryArchive({ storage, now: () => stamp }), gate = deferred(); let result;
    const s = mount(t, { storage, archive: { ...engine, importArchive: value => { result = engine.importArchive(value); return gate.promise; } } });
    await s.choose(file(inputArchive())); await s.import(); if (dispose) s.screen.dispose(); else s.screen.onHide();
    const before = s.host.textContent; gate.resolve(result); await settle(); assert.equal(s.host.textContent, before); assert.equal(storage.writes.length, 4);
    if (!dispose) { s.screen.onShow(); await settle(); assert.match(s.field('status').textContent, /Import complete/); }
  }
});

test('partial quota failure shows accurate progress and the same file retry skips committed records', async t => {
  const storage = memory(), original = storage.setItem; let calls = 0;
  storage.setItem = function(key, value) { if (++calls === 3) throw new Error('Quota full'); original.call(this, key, value); };
  const s = mount(t, { storage }); await s.choose(file(inputArchive())); await s.import();
  assert.match(s.field('status').textContent, /Import stopped/); assert.match(s.field('status').textContent, /Added 2/); assert.match(s.field('status').textContent, /2.*remain/i);
  storage.setItem = original; s.field('retry').dispatch('click'); await settle();
  assert.equal(storage.writes.length, 4); assert.match(s.field('status').textContent, /Import complete/); assert.match(s.field('status').textContent, /2.*already present/);
});

test('detached retry buttons and stale export results cannot act after a new selection or hide', async t => {
  const storage = memory(), engine = createVenueHistoryArchive({ storage, now: () => stamp }); let attempts = 0;
  const s = mount(t, { storage, archive: { ...engine, importArchive: () => { attempts++; throw new Error('Write unavailable'); } } });
  await s.choose(file(inputArchive())); await s.import(); const retired = s.field('retry'); assert.ok(retired);
  await s.choose(file(emptyArchive(), 'new.json')); retired.dispatch('click'); await settle(); assert.equal(attempts, 1);
  const gate = deferred(), other = mount(t, { archive: { ...engine, exportArchive: () => gate.promise } });
  other.field('export').dispatch('click'); await settle(); other.screen.onHide(); gate.resolve(emptyArchive()); await settle(); assert.equal(other.downloads.length, 0);
});

test('file/resource, source and target errors stay visible without claiming export or import success', async t => {
  const s = mount(t); let read = false;
  await s.choose({ name: 'too-large.json', size: MAX_ARCHIVE_BYTES + 1, text: async () => { read = true; return '{}'; } });
  assert.equal(read, false); assert.match(s.field('status').textContent, /32/); assert.equal(s.storage.writes.length, 0);
  await s.choose(file('{broken')); assert.match(s.field('status').textContent, /JSON/); assert.equal(s.field('import').disabled, true);
  s.storage.map.set('deckchek.venue-incidents.v1.broken', '{broken'); s.field('export').dispatch('click'); await settle();
  assert.match(s.field('status').textContent, /Could not export/); assert.equal(s.downloads.length, 0);
  await s.choose(file(inputArchive())); assert.match(s.field('status').textContent, /Could not preview/); assert.equal(s.storage.writes.length, 0);
});

test('imported history is visible in the existing all-venue panels without manufacturing a current catalog', async t => {
  const storage = memory(), engine = createVenueHistoryArchive({ storage, now: () => stamp }); engine.importArchive(inputArchive());
  const catalog = { list: async () => [] }, incidentHost = document.createElement('section'), supportHost = document.createElement('section');
  document.body.append(incidentHost, supportHost);
  const incidents = createVenueIncidentPanel(incidentHost, { catalog, store: createVenueIncidentStore({ invoke: null, storage, catalog }) });
  const isolation = createSupportIsolationPanel(supportHost, { catalog, store: createSupportIsolationStore({ invoke: null, storage, catalog }), available: () => false, inputs: async () => ({ devices: [] }) });
  t.after(() => { incidents.dispose(); isolation.dispose(); incidentHost.remove(); supportHost.remove(); }); await settle();
  assert.match(incidentHost.textContent, /Historic <img src=x> 𐐷/); assert.match(supportHost.textContent, /Shelf/); assert.equal(incidentHost.querySelectorAll('img').length, 0);
  assert.equal([...storage.map.keys()].some(key => key.includes('catalog')), false);
});

test('a retired preview cannot revive when the same selected file is shown again', async t => {
  const storage = memory(), engine = createVenueHistoryArchive({ storage, now: () => stamp }), requests = [];
  const s = mount(t, { storage, archive: { ...engine, preview: value => {
    const gate = deferred(); requests.push({ gate, preview: engine.preview(value) }); return gate.promise;
  } } });
  await s.choose(file(inputArchive())); s.screen.onHide(); engine.importArchive(inputArchive()); s.screen.onShow(); await settle();
  assert.equal(requests.length, 2); requests[1].gate.resolve(requests[1].preview); await settle();
  assert.match(s.field('preview').textContent, /already present: 4/);
  requests[0].gate.resolve(requests[0].preview); await settle(); assert.match(s.field('preview').textContent, /already present: 4/);
});

test('the default Data screen renders with blocked browser storage and reports an explicit export failure', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), host = document.createElement('section'); document.body.append(host);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Browser storage blocked'); } });
  let screen;
  try {
    assert.doesNotThrow(() => { screen = createDataScreen(host); });
    host.querySelector('#venue-history-export').dispatch('click'); await settle();
    assert.match(host.querySelector('#venue-history-status').textContent, /Could not export.*blocked/);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', descriptor); screen?.dispose(); host.remove();
  }
});
