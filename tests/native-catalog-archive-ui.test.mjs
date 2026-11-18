import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installNativeCatalogDom, settle, deferred } from './fixtures/native-catalog-archive-dom.mjs';
import { createNativeCatalogArchive, MAX_NATIVE_CATALOG_BYTES } from '../app/native-catalog-archive.js';

const document = installNativeCatalogDom({ after });
window.addEventListener = () => {}; window.removeEventListener = () => {};
const { createDataScreen } = await import('../app/ui/screens/data.js');

function nativeBridge() {
  window.__TAURI__ = { core: { invoke: async command => {
    if (command === 'backup_list') return [];
    if (command === 'backup_settings_get') return { mode: 'off', keep: 7 };
    if (command === 'catalog_archive_setups') return [{ id: 'setup-a', name: 'Saved setup' }];
    throw new Error(`Unexpected native call: ${command}`);
  } } };
}
function mount(t, native = true, options = {}) {
  if (native) nativeBridge(); else delete window.__TAURI__;
  const host = document.createElement('section'); document.body.append(host);
  const screen = createDataScreen(host, options);
  t.after(() => { screen.dispose(); host.remove(); delete window.__TAURI__; });
  return { host, screen, field: suffix => host.querySelector(`#native-catalog-${suffix}`) };
}

test('actual native Data screen retains full backup, restore and workspace entrypoints', async t => {
  const s = mount(t); await settle();
  for (const id of ['data-backup-now', 'data-restore', 'data-import-json', 'data-auto', 'data-list-card']) {
    assert.ok(s.host.querySelector(`#${id}`), `existing ${id} stays available`);
  }
  assert.equal(s.host.querySelector('#data-catalog-archive'), null, 'the browser catalog format stays separate');
  assert.equal(s.host.querySelector('#data-venue-history'), null);
});

test('actual native Data screen exposes selected setup export and explicit native catalog import', async t => {
  const s = mount(t); await settle();
  assert.ok(s.host.querySelector('#data-native-catalog-archive'), 'native users need a selected setup catalog card');
  assert.ok(s.field('setups'), 'saved setup selection is visible');
  assert.ok(s.field('export'), 'selected setups can be exported');
  assert.ok(s.field('file'), 'a native catalog file can be previewed');
  assert.ok(s.field('import'), 'writing requires the explicit import control');
  assert.equal(s.field('import').disabled, true, 'no file is eligible on construction');
  assert.match(s.host.textContent, /settings snapshots/i);
});

test('actual browser Data screen retains its browser catalog and history files', async t => {
  const s = mount(t, false); await settle();
  assert.ok(s.host.querySelector('#data-catalog-archive'));
  assert.ok(s.host.querySelector('#data-venue-history'));
  assert.ok(s.host.querySelector('#data-import-json'));
  assert.equal(s.host.querySelector('#data-native-catalog-archive'), null);
});

const raw = readFileSync(new URL('./contracts/native-setup-catalog.json', import.meta.url), 'utf8');
const tableCounts = { manufacturer: 1, venue: 1, product: 2, booth: 1, deck_position: 1,
  support_configuration: 1, asset: 2, asset_settings_snapshot: 2, setup: 2, setup_component: 3 };
const counts = () => ({ tables: { ...tableCounts }, total: 16 });
function summary({ stored = false, ...rest } = {}) {
  return { counts: counts(), toImport: stored ? 0 : 16, alreadyPresent: stored ? 16 : 0, reusedDependencies: 0,
    canImport: true, conflictCount: 0, conflicts: [], dependencyReuses: [], warningCount: 0, warnings: [], ...rest };
}
function engine(overrides = {}) {
  const calls = [], state = { stored: false };
  const invoke = async (command, args) => {
    calls.push({ command, args });
    if (overrides[command]) return overrides[command](args, state);
    if (command === 'catalog_archive_setups') return [{ id: 'setup-a', name: '<img src=x> setup café' }, { id: 'setup-b', name: 'Second setup' }];
    if (command === 'catalog_archive_export') return { text: raw, counts: counts() };
    if (command === 'catalog_archive_preview') return summary(state);
    if (command === 'catalog_archive_import') { const inserted = state.stored ? 0 : 16; state.stored = true; return { inserted, alreadyPresent: 16 - inserted, reusedDependencies: 0, counts: counts() }; }
    throw Error(`Unexpected ${command}`);
  };
  return { api: createNativeCatalogArchive({ invoke }), calls, state };
}
function file(text = raw, name = 'native-catalog.json') {
  const bytes = new TextEncoder().encode(text);
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
}
function nativeMount(t, overrides = {}, options = {}) {
  const e = engine(overrides), downloads = [];
  const s = mount(t, true, { nativeCatalogArchiveOptions: { archive: e.api,
    saveFile: options.saveFile ?? ((name, text, type) => downloads.push({ name, text, type })) } });
  return { ...s, ...e, downloads,
    async choose(value) { s.field('file').files = value ? [value] : []; s.field('file').dispatch('change'); await settle(); },
    async import() { s.field('import').dispatch('click'); await settle(); },
    async select(index = 0, checked = true) { const node = s.field(`setup-${index}`); node.checked = checked; node.dispatch('change'); await settle(); },
  };
}

test('actual setup controls require explicit selection and export exact raw text without JSON number conversion', async t => {
  const s = nativeMount(t); await settle();
  assert.equal(s.field('export').disabled, true); assert.equal(s.host.querySelectorAll('img').length, 0);
  await s.select(); assert.equal(s.field('export').disabled, false);
  s.field('export').dispatch('click'); await settle();
  assert.deepEqual(s.calls.find(c => c.command === 'catalog_archive_export').args, { setupIds: ['setup-a'] });
  assert.deepEqual(s.downloads, [{ name: 'deckchek-native-setup-catalog.json', text: raw, type: 'application/json' }]);
  assert.match(s.downloads[0].text, /9007199254740993/);
  assert.match(s.field('status').textContent, /16 complete selected catalog records/);
});

test('actual file controls preview without writes, escape filenames, explicitly import and retry exact saved data', async t => {
  const s = nativeMount(t); await s.choose(file(raw, 'Catalog <img src=x> 𝄞.json'));
  assert.equal(s.calls.filter(c => c.command === 'catalog_archive_import').length, 0);
  assert.match(s.field('preview').textContent, /New records: 16/); assert.match(s.field('preview').textContent, /<img src=x>/);
  assert.equal(s.host.querySelectorAll('img').length, 0); assert.equal(s.field('import').disabled, false);
  await s.import(); assert.match(s.field('status').textContent, /Added 16 records/);
  assert.equal(s.calls.find(c => c.command === 'catalog_archive_import').args.text, raw);
  await s.choose(file()); await s.import(); assert.match(s.field('status').textContent, /Added 0 records; 16 exact records/);
});

test('preview separates matching dependencies and both local/source timestamp values from exact matches', async t => {
  const s = nativeMount(t, { catalog_archive_preview: () => summary({ toImport: 15, reusedDependencies: 1,
    dependencyReuses: [{ table: 'manufacturer', id: 'm <img src=x>', sourceCreatedAt: 'source-created', sourceUpdatedAt: 'source-updated', destinationCreatedAt: 'local-created', destinationUpdatedAt: 'local-updated' }] }) });
  await s.choose(file());
  assert.match(s.field('preview').textContent, /Exact records already present: 0/);
  assert.match(s.field('preview').textContent, /Matching dependencies keeping local timestamps: 1/);
  for (const text of ['source-created', 'source-updated', 'local-created', 'local-updated']) assert.ok(s.field('preview').textContent.includes(text));
  assert.equal(s.host.querySelectorAll('img').length, 0);
});

test('a conflicting native preview disables import and refuses a synthetic disabled-button event', async t => {
  const s = nativeMount(t, { catalog_archive_preview: () => summary({ toImport: 15, canImport: false, conflictCount: 1,
    conflicts: [{ table: 'setup', id: '<img src=x>', reason: 'extra target component' }] }) });
  await s.choose(file()); assert.equal(s.field('import').disabled, true); await s.import();
  assert.equal(s.calls.filter(c => c.command === 'catalog_archive_import').length, 0);
  assert.match(s.field('preview').textContent, /extra target component/); assert.equal(s.host.querySelectorAll('img').length, 0);
});

test('stale file reads and preview replies cannot replace a later selected file', async t => {
  const gate = deferred(), s = nativeMount(t);
  await s.choose({ name: 'old.json', size: 10, arrayBuffer: () => gate.promise });
  await s.choose(file(raw, 'current.json')); gate.reject(Error('retired read')); await settle();
  assert.match(s.field('preview').textContent, /current.json/); assert.doesNotMatch(s.host.textContent, /retired read/);
  const requests = [], p = nativeMount(t, { catalog_archive_preview: args => { const gate = deferred(); requests.push({ gate, text: args.text }); return gate.promise; } });
  await p.choose(file(raw, 'old-preview.json')); await p.choose(file(raw.replace('setup notes', 'new notes'), 'new-preview.json'));
  requests[1].gate.resolve(summary()); await settle(); requests[0].gate.reject(Error('retired preview')); await settle();
  assert.match(p.field('preview').textContent, /new-preview.json/); assert.doesNotMatch(p.host.textContent, /retired preview/);
});

test('repeated onShow preserves both pending file-read and preview owners', async t => {
  const read = deferred(), s = nativeMount(t); await s.choose({ name: 'pending.json', size: 10, arrayBuffer: () => read.promise });
  s.screen.onShow(); s.screen.onShow(); read.resolve(new TextEncoder().encode(raw).buffer); await settle();
  assert.match(s.field('preview').textContent, /New records: 16/);
  const gate = deferred(), p = nativeMount(t, { catalog_archive_preview: () => gate.promise });
  await p.choose(file()); p.screen.onShow(); p.screen.onShow(); gate.resolve(summary()); await settle();
  assert.equal(p.calls.filter(c => c.command === 'catalog_archive_preview').length, 1);
  assert.equal(p.field('import').disabled, false);
});

test('real hide and disposal retire pending byte reads without late rendering or import eligibility', async t => {
  for (const dispose of [false, true]) {
    const gate = deferred(), s = nativeMount(t);
    await s.choose({ name: 'late.json', size: 10, arrayBuffer: () => gate.promise });
    if (dispose) s.screen.dispose(); else s.screen.onHide();
    const before = s.host.textContent; gate.resolve(new TextEncoder().encode(raw).buffer); await settle();
    assert.equal(s.host.textContent, before); assert.equal(s.calls.filter(c => c.command === 'catalog_archive_preview').length, 0);
    if (!dispose) { s.screen.onShow(); await settle(); assert.equal(s.field('import').disabled, true); }
  }
});

test('a preview resumed after hide is revalidated against the destination and ignores its older result', async t => {
  const requests = [], s = nativeMount(t, { catalog_archive_preview: () => { const gate = deferred(); requests.push(gate); return gate.promise; } });
  await s.choose(file()); s.screen.onHide(); s.screen.onShow(); await settle(); assert.equal(requests.length, 2);
  requests[1].resolve(summary({ stored: true })); await settle(); requests[0].resolve(summary()); await settle();
  assert.match(s.field('preview').textContent, /Exact records already present: 16/);
});

test('dispatched import owns its copied text through duplicate presses, hide, replacement attempts and lost acknowledgement', async t => {
  const gate = deferred(); let calls = 0;
  const s = nativeMount(t, { catalog_archive_import: async (args, state) => {
    assert.equal(args.text, raw); calls++; state.stored = true;
    if (calls === 1) await gate.promise;
    return { inserted: 0, alreadyPresent: 16, reusedDependencies: 0, counts: counts() };
  } });
  await s.choose(file(raw, 'original.json')); await s.import(); s.field('import').dispatch('click');
  assert.equal(s.host.querySelector('#data-restore').disabled, true);
  s.screen.onHide(); await s.choose(file(raw.replace('setup notes', 'replacement'), 'replacement.json'));
  gate.reject(Error('Lost acknowledgement')); await settle(); s.screen.onShow(); await settle();
  assert.match(s.field('status').textContent, /Could not confirm/); assert.match(s.field('preview').textContent, /original.json/);
  s.field('retry').dispatch('click'); await settle(); assert.equal(calls, 2);
  assert.match(s.field('status').textContent, /Added 0 records; 16 exact records/);
  assert.equal(s.host.querySelector('#data-restore').disabled, false);
});

test('a retired retry button cannot import a later or replaced file', async t => {
  const s = nativeMount(t, { catalog_archive_import: () => { throw Error('lost confirmation'); } });
  await s.choose(file()); await s.import(); const oldRetry = s.field('retry'); assert.ok(oldRetry);
  await s.choose(file(raw, 'replacement.json')); oldRetry.dispatch('click'); await settle();
  assert.equal(s.calls.filter(c => c.command === 'catalog_archive_import').length, 1);
});

test('a retained preview retry button cannot launch duplicate previews or replace a successful import', async t => {
  const gate = deferred(); let previews = 0;
  const s = nativeMount(t, { catalog_archive_preview: () => { if (++previews === 1) throw Error('temporary preview failure'); return gate.promise; } });
  await s.choose(file()); const retry = s.field('retry'); assert.ok(retry);
  retry.dispatch('click'); retry.dispatch('click'); await settle(); assert.equal(previews, 2);
  gate.resolve(summary()); await settle(); await s.import(); retry.dispatch('click'); await settle();
  assert.equal(previews, 2); assert.match(s.field('status').textContent, /Import complete/);
});

test('hidden import completion is shown on return and disposed completion cannot render', async t => {
  for (const dispose of [false, true]) {
    const gate = deferred(), s = nativeMount(t, { catalog_archive_import: () => gate.promise });
    await s.choose(file()); await s.import(); if (dispose) s.screen.dispose(); else s.screen.onHide();
    const before = s.host.textContent; gate.resolve({ inserted: 16, alreadyPresent: 0, reusedDependencies: 0, counts: counts() }); await settle();
    assert.equal(s.host.textContent, before);
    if (!dispose) { s.screen.onShow(); await settle(); assert.match(s.field('status').textContent, /Import complete/); assert.equal(s.host.querySelector('#data-backup-now').disabled, false); }
  }
});

test('delayed exports remain bound to their selection and do not download after hide or disposal', async t => {
  for (const dispose of [false, true]) {
    const gate = deferred(), s = nativeMount(t, { catalog_archive_export: () => gate.promise });
    await settle(); await s.select(); s.field('export').dispatch('click'); await settle();
    if (dispose) s.screen.dispose(); else { s.screen.onHide(); s.screen.onShow(); }
    const before = s.host.textContent; gate.resolve({ text: raw, counts: counts() }); await settle();
    assert.equal(s.downloads.length, 0);
    if (dispose) assert.equal(s.host.textContent, before); else assert.equal(s.host.querySelector('#data-restore').disabled, false);
  }
});

test('selected-setup export cannot interrupt an unfinished file byte read', async t => {
  const gate = deferred(), s = nativeMount(t); await settle(); await s.select();
  await s.choose({ name: 'reading.json', size: raw.length, arrayBuffer: () => gate.promise });
  s.field('export').dispatch('click'); await settle();
  assert.equal(s.calls.filter(call => call.command === 'catalog_archive_export').length, 0);
  assert.equal(s.field('export').disabled, true);
  gate.resolve(new TextEncoder().encode(raw).buffer); await settle();
  assert.equal(s.field('import').disabled, false); assert.equal(s.field('export').disabled, false);
});

test('selected-setup export cannot interrupt a pending native preview', async t => {
  const gate = deferred(), s = nativeMount(t, { catalog_archive_preview: () => gate.promise });
  await settle(); await s.select(); await s.choose(file()); s.field('export').dispatch('click'); await settle();
  assert.equal(s.calls.filter(call => call.command === 'catalog_archive_export').length, 0);
  assert.equal(s.field('export').disabled, true);
  gate.resolve(summary()); await settle(); assert.equal(s.field('import').disabled, false); assert.equal(s.field('export').disabled, false);
});

test('a preview paused by hide resumes when a retired export finishes after show', async t => {
  const gate = deferred(), s = nativeMount(t, { catalog_archive_export: () => gate.promise });
  await s.choose(file()); await s.select(); s.field('export').dispatch('click'); await settle();
  s.screen.onHide(); s.screen.onShow(); await settle(); assert.equal(s.field('import').disabled, true);
  gate.resolve({ text: raw, counts: counts() }); await settle();
  assert.equal(s.downloads.length, 0); assert.equal(s.calls.filter(call => call.command === 'catalog_archive_preview').length, 2);
  assert.equal(s.field('import').disabled, false);
});

test('file reads enforce both declared and actual size, reject invalid UTF-8 and retain a legitimate replacement character', async t => {
  const s = nativeMount(t); let read = false;
  await s.choose({ name: 'oversized', size: MAX_NATIVE_CATALOG_BYTES + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } });
  assert.equal(read, false); assert.match(s.field('status').textContent, /32 MiB/);
  await s.choose({ name: 'lied-size', size: 1, arrayBuffer: async () => new ArrayBuffer(MAX_NATIVE_CATALOG_BYTES + 1) });
  assert.match(s.field('status').textContent, /32 MiB/);
  await s.choose({ name: 'bad-utf8', size: 2, arrayBuffer: async () => new Uint8Array([0xc0, 0xaf]).buffer });
  assert.match(s.field('status').textContent, /Could not read/);
  assert.equal(s.calls.filter(c => c.command === 'catalog_archive_preview').length, 0);
  const valid = raw.replace('café', 'caf\ufffd'); await s.choose(file(valid));
  assert.equal(s.calls.find(c => c.command === 'catalog_archive_preview').args.text, valid);
});

test('an import-time conflict replaces the preview and cannot be presented as successful or blindly retried', async t => {
  const conflict = summary({ toImport: 15, canImport: false, conflictCount: 1, conflicts: [{ table: 'setup', id: 'setup-a', reason: 'changed since preview' }] });
  const s = nativeMount(t, { catalog_archive_import: () => { throw { code: 'NATIVE_CATALOG_CONFLICT', message: 'conflict', preview: conflict }; } });
  await s.choose(file()); await s.import();
  assert.match(s.field('status').textContent, /Import blocked by conflicts/); assert.equal(s.field('import').disabled, true);
  assert.equal(s.field('retry'), null); assert.doesNotMatch(s.field('status').textContent, /Import complete/);
});

test('native import owns the Data busy state and stale backup, restore, workspace and schedule buttons cannot dispatch', async t => {
  const gate = deferred(), s = nativeMount(t, { catalog_archive_import: () => gate.promise }); await s.choose(file());
  const buttons = ['data-backup-now', 'data-restore', 'data-import-json', 'data-save-schedule'].map(id => s.host.querySelector(`#${id}`));
  let dialogs = 0; window.__TAURI__.dialog = { save: async () => { dialogs++; return null; }, open: async () => { dialogs++; return null; } };
  await s.import(); for (const button of buttons) button.dispatch('click'); await settle();
  assert.equal(dialogs, 0); assert.equal(s.host.querySelector('#data-save-schedule').disabled, true);
  gate.resolve({ inserted: 16, alreadyPresent: 0, reusedDependencies: 0, counts: counts() }); await settle();
  assert.equal(s.host.querySelector('#data-save-schedule').disabled, false);
});

test('an existing backup dialog owns Data and retires eligible native previews until it finishes', async t => {
  const gate = deferred(), s = nativeMount(t); await s.choose(file());
  const oldImport = s.field('import'); window.__TAURI__.dialog = { save: () => gate.promise };
  s.host.querySelector('#data-backup-now').dispatch('click'); await settle();
  assert.equal(s.field('file').disabled, true); oldImport.dispatch('click'); await settle();
  assert.equal(s.calls.filter(c => c.command === 'catalog_archive_import').length, 0);
  gate.resolve(null); await settle(); assert.equal(s.field('import').disabled, false);
  assert.equal(s.calls.filter(c => c.command === 'catalog_archive_preview').length, 2, 'preview is refreshed after another Data operation');
});

test('pending backup execution retains Data ownership through hide/show and releases after failure', async t => {
  const gate = deferred(), s = nativeMount(t); await settle();
  const base = window.__TAURI__.core.invoke;
  window.__TAURI__.core.invoke = (command, args) => command === 'backup_create' ? gate.promise : base(command, args);
  window.__TAURI__.dialog = { save: async () => '/tmp/native-catalog-test.deckchek-backup' };
  s.host.querySelector('#data-backup-now').dispatch('click'); await settle();
  s.screen.onHide(); s.screen.onShow(); await settle(); assert.equal(s.field('file').disabled, true);
  gate.reject(Error('backup write failed')); await settle(); assert.equal(s.field('file').disabled, false);
  assert.match(s.host.querySelector('#data-status').textContent, /backup write failed/);
});

test('old backup and restore file choosers cannot dispatch after a real hide/show', async t => {
  for (const action of ['backup', 'restore']) {
    const gate = deferred(), s = nativeMount(t); await s.choose(file());
    const base = window.__TAURI__.core.invoke, dispatched = [];
    window.__TAURI__.core.invoke = (command, args) => { if (['backup_create', 'backup_inspect'].includes(command)) dispatched.push(command); return base(command, args); };
    window.__TAURI__.dialog = { save: () => gate.promise, open: () => gate.promise };
    s.host.querySelector(action === 'backup' ? '#data-backup-now' : '#data-restore').dispatch('click'); await settle();
    s.screen.onHide(); s.screen.onShow(); await settle(); assert.equal(s.field('file').disabled, true);
    gate.resolve('/tmp/old-choice.deckchek-backup'); await settle();
    assert.deepEqual(dispatched, []); assert.equal(s.field('file').disabled, false); assert.equal(s.field('import').disabled, false);
    s.screen.dispose(); s.host.remove();
  }
});

test('an old workspace byte read cannot open confirmation or import after hide/show', async t => {
  const gate = deferred(), s = nativeMount(t); await s.choose(file());
  const base = window.__TAURI__.core.invoke, dispatched = [];
  window.__TAURI__.core.invoke = (command, args) => { if (command === 'backup_import_workspace') dispatched.push(command); return base(command, args); };
  s.host.querySelector('#data-import-json').dispatch('click'); await settle();
  const chooser = document.body.children.find(node => node.tagName === 'INPUT' && node.type === 'file');
  assert.ok(chooser); chooser.files = [{ text: () => gate.promise }]; chooser.dispatch('change'); await settle();
  s.screen.onHide(); s.screen.onShow(); await settle(); assert.equal(s.field('file').disabled, true);
  gate.resolve('{}'); await settle();
  assert.deepEqual(dispatched, []); assert.equal(document.getElementById('ws-title'), null); assert.equal(s.field('file').disabled, false);
});

function restoreInspector() {
  return { valid: true, errors: [], manifest: { format: 'deckchek-backup', formatVersion: 1,
    createdAt: '2026-11-18T00:00:00Z', kind: 'manual', appVersion: '0.1.0', counts: { runs: 0, assets: 0, profiles: 0, midiMaps: 0 } } };
}
test('an old restore inspection cannot reopen its confirmation after hide/show', async t => {
  const gate = deferred(), s = nativeMount(t); await s.choose(file()); const base = window.__TAURI__.core.invoke;
  window.__TAURI__.core.invoke = (command, args) => command === 'backup_inspect' ? gate.promise : base(command, args);
  window.__TAURI__.dialog = { open: async () => '/tmp/old-inspection.deckchek-backup' };
  s.host.querySelector('#data-restore').dispatch('click'); await settle();
  s.screen.onHide(); s.screen.onShow(); await settle(); gate.resolve(restoreInspector()); await settle();
  assert.equal(document.getElementById('restore-confirm'), null); assert.equal(s.field('file').disabled, false);
});

test('restore confirmation and an already dispatched restore retain busy ownership after the dialog is retired', async t => {
  const gate = deferred(), s = nativeMount(t); await s.choose(file()); const base = window.__TAURI__.core.invoke;
  window.__TAURI__.core.invoke = (command, args) => command === 'backup_inspect' ? Promise.resolve(restoreInspector()) : command === 'backup_restore' ? gate.promise : base(command, args);
  window.__TAURI__.dialog = { open: async () => '/tmp/source.deckchek-backup' };
  s.host.querySelector('#data-restore').dispatch('click'); await settle();
  assert.equal(s.field('file').disabled, true);
  const ack = document.getElementById('restore-ack'); ack.checked = true; ack.dispatch('change');
  document.getElementById('restore-confirm').dispatch('click'); await settle();
  document.getElementById('restore-cancel').dispatch('click'); ack.dispatch('change'); await settle();
  assert.equal(s.field('file').disabled, true); assert.equal(document.getElementById('restore-confirm').disabled, true);
  s.screen.onHide(); s.screen.onShow(); await settle(); assert.equal(s.field('file').disabled, true);
  gate.reject(Error('restore refused')); await settle(); assert.equal(s.field('file').disabled, false);
  assert.equal(document.getElementById('restore-confirm'), null);
});

test('stale setup-list responses cannot restore a removed selection or overwrite a newer list', async t => {
  const requests = [], s = nativeMount(t, { catalog_archive_setups: () => { const gate = deferred(); requests.push(gate); return gate.promise; } });
  s.screen.onHide(); s.screen.onShow(); await settle();
  requests[1].resolve([{ id: 'setup-current', name: 'Current' }]); await settle(); requests[0].resolve([{ id: 'setup-old', name: 'Old' }]); await settle();
  assert.match(s.field('setups').textContent, /Current/); assert.doesNotMatch(s.field('setups').textContent, /Old/);
  await s.select(); s.field('refresh').dispatch('click'); await settle(); requests[2].resolve([]); await settle();
  assert.match(s.field('setups').textContent, /Unavailable saved setup/); assert.equal(s.field('export').disabled, true);
});

test('export failures produce no partial download and disposed setup lists never render', async t => {
  const s = nativeMount(t, { catalog_archive_export: () => { throw Error('incomplete source graph'); } }); await settle(); await s.select();
  s.field('export').dispatch('click'); await settle(); assert.equal(s.downloads.length, 0); assert.match(s.field('status').textContent, /incomplete source graph/);
  const gate = deferred(), p = nativeMount(t, { catalog_archive_setups: () => gate.promise }); p.screen.dispose();
  const before = p.host.textContent; gate.resolve([{ id: 'late', name: 'Late' }]); await settle(); assert.equal(p.host.textContent, before);
});

const emptyWorkspace = '{"version":1,"equipment":[],"runs":[]}';
function workspaceControls(s, disabled) {
  for (const id of ['data-backup-now', 'data-restore', 'data-import-json', 'data-save-schedule']) {
    assert.equal(s.host.querySelector(`#${id}`).disabled, disabled, `${id} busy ownership`);
  }
  assert.equal(s.field('file').disabled, disabled, 'native catalog file ownership');
}
async function workspaceChooser(t, s) {
  s.host.querySelector('#data-import-json').dispatch('click'); await settle();
  const chooser = document.body.children.find(node => node.tagName === 'INPUT' && node.type === 'file');
  assert.ok(chooser, 'the actual Data handler creates the file chooser');
  t.after(() => chooser.remove());
  return chooser;
}
function observeWorkspaceImports(implementation = async () => ({ runsImported: 0, equipmentImported: 0, runsSkipped: 0, runsInvalid: 0 })) {
  const original = window.__TAURI__.core.invoke, calls = [];
  window.__TAURI__.core.invoke = (command, args) => {
    if (command === 'backup_import_workspace') { calls.push(args); return implementation(args); }
    return original(command, args);
  };
  return calls;
}

for (const hideAndShow of [false, true]) {
  test(`workspace chooser cancellation releases only its Data owner${hideAndShow ? ' before hide/show' : ''}`, async t => {
    const s = nativeMount(t); await s.choose(file()); const calls = observeWorkspaceImports();
    const chooser = await workspaceChooser(t, s); workspaceControls(s, true);
    chooser.dispatch('cancel'); await settle();
    if (hideAndShow) { s.screen.onHide(); s.screen.onShow(); await settle(); }
    workspaceControls(s, false); assert.equal(s.field('import').disabled, false);
    assert.equal(chooser.isConnected, false); assert.deepEqual(calls, []);
  });
}

test('hiding an undispatched workspace chooser retires it and stale events cannot release a later import owner', async t => {
  const gate = deferred(), s = nativeMount(t, { catalog_archive_import: () => gate.promise });
  await s.choose(file()); const calls = observeWorkspaceImports(); const chooser = await workspaceChooser(t, s);
  s.screen.onHide(); s.screen.onShow(); await settle();
  workspaceControls(s, false); assert.equal(chooser.isConnected, false);
  await s.import(); workspaceControls(s, true);
  chooser.files = [{ text: async () => emptyWorkspace }]; chooser.dispatch('change'); chooser.dispatch('cancel'); await settle();
  workspaceControls(s, true); assert.deepEqual(calls, []); assert.equal(document.getElementById('ws-title'), null);
  gate.resolve({ inserted: 16, alreadyPresent: 0, reusedDependencies: 0, counts: counts() }); await settle();
  workspaceControls(s, false);
});

test('disposing an undispatched workspace chooser removes it and late selection cannot import or render', async t => {
  const s = nativeMount(t); await settle(); const calls = observeWorkspaceImports(); const chooser = await workspaceChooser(t, s);
  s.screen.dispose(); await settle(); const before = s.host.textContent;
  assert.equal(chooser.isConnected, false);
  chooser.files = [{ text: async () => emptyWorkspace }]; chooser.dispatch('change'); chooser.dispatch('cancel'); await settle();
  assert.deepEqual(calls, []); assert.equal(s.host.textContent, before); assert.equal(document.getElementById('ws-title'), null);
});

for (const fails of [false, true]) {
  test(`a dispatched workspace import keeps Data ownership through hide/show until ${fails ? 'failure' : 'success'}`, async t => {
    const gate = deferred(), s = nativeMount(t); await s.choose(file()); const calls = observeWorkspaceImports(() => gate.promise);
    const chooser = await workspaceChooser(t, s);
    chooser.files = [{ text: async () => emptyWorkspace }]; chooser.dispatch('change'); await settle();
    const dialog = document.querySelector('dialog'); assert.ok(dialog); assert.ok(document.getElementById('ws-title'));
    const confirm = dialog.querySelectorAll('button').find(node => node.textContent === 'Import'); assert.ok(confirm);
    confirm.dispatch('click'); await settle(); assert.equal(calls.length, 1); workspaceControls(s, true);
    s.screen.onHide(); s.screen.onShow(); await settle();
    chooser.dispatch('cancel'); chooser.dispatch('change'); await settle(); workspaceControls(s, true);
    assert.equal(calls.length, 1); assert.equal(document.getElementById('ws-title'), null);
    if (fails) gate.reject(Error('workspace import refused'));
    else gate.resolve({ runsImported: 0, equipmentImported: 0, runsSkipped: 0, runsInvalid: 0 });
    await settle(); workspaceControls(s, false); assert.equal(calls.length, 1);
  });
}
