import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createNativeCatalogArchive, nativeCatalogText, nativeCatalogPreview,
  MAX_NATIVE_CATALOG_BYTES, NATIVE_CATALOG_TABLES,
} from '../app/native-catalog-archive.js';

const raw = readFileSync(new URL('./contracts/native-setup-catalog.json', import.meta.url), 'utf8');
const tableCounts = { manufacturer: 1, venue: 1, product: 2, booth: 1, deck_position: 1,
  support_configuration: 1, asset: 2, asset_settings_snapshot: 2, setup: 2, setup_component: 3 };
const counts = () => ({ tables: { ...tableCounts }, total: 16 });
function preview(overrides = {}) {
  return { counts: counts(), toImport: 16, alreadyPresent: 0, reusedDependencies: 0, canImport: true,
    conflictCount: 0, conflicts: [], dependencyReuses: [], warningCount: 0, warnings: [], ...overrides };
}

test('native archive bridge retains the exact raw text and signed 64-bit fixture values across all calls', async () => {
  const calls = [], api = createNativeCatalogArchive({ invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'catalog_archive_export') return { text: raw, counts: counts() };
    if (command === 'catalog_archive_preview') return preview();
    if (command === 'catalog_archive_import') return { inserted: 16, alreadyPresent: 0, reusedDependencies: 0, counts: counts() };
    if (command === 'catalog_archive_setups') return [{ id: 'setup-a', name: '<img src=x> café' }, { id: 'setup-b', name: 'B' }];
    throw Error('unexpected command');
  } });
  assert.deepEqual(await api.listSetups(), [{ id: 'setup-a', name: '<img src=x> café' }, { id: 'setup-b', name: 'B' }]);
  const ids = ['setup-a', 'setup-b'], exported = await api.exportArchive(ids); ids[0] = 'changed';
  assert.equal(exported.text, raw); assert.match(exported.text, /9007199254740993/);
  assert.equal((await api.preview(raw)).counts.total, 16);
  assert.equal((await api.importArchive(raw)).inserted, 16);
  assert.deepEqual(calls[1], { command: 'catalog_archive_export', args: { setupIds: ['setup-a', 'setup-b'] } });
  assert.equal(calls[2].args.text, raw); assert.equal(calls[3].args.text, raw);
  assert.deepEqual(Object.keys(calls[2].args), ['text']);
});

test('browser and native command failures never fall back to localStorage', async () => {
  let reads = 0, writes = 0;
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { reads++; return { setItem() { writes++; } }; } });
  try {
    const browser = createNativeCatalogArchive({ invoke: null }); assert.equal(browser.supported, false);
    for (const run of [() => browser.listSetups(), () => browser.exportArchive(['setup-a']), () => browser.preview(raw), () => browser.importArchive(raw)]) {
      await assert.rejects(run, error => error.code === 'NATIVE_CATALOG_UNSUPPORTED');
    }
    const native = createNativeCatalogArchive({ invoke: async () => { throw { code: 'NATIVE_CATALOG_STORAGE', message: 'locked database' }; } });
    await assert.rejects(() => native.importArchive(raw), /locked database/);
    assert.equal(reads, 0); assert.equal(writes, 0);
  } finally { if (old) Object.defineProperty(globalThis, 'localStorage', old); else delete globalThis.localStorage; }
});

test('file text bounds measure UTF-8 and retain literal replacement characters and opaque JSON strings', () => {
  assert.equal(nativeCatalogText(raw), raw);
  assert.equal(nativeCatalogText('"\ufffd"'), '"\ufffd"');
  assert.equal(nativeCatalogText(' '.repeat(MAX_NATIVE_CATALOG_BYTES)).length, MAX_NATIVE_CATALOG_BYTES);
  for (const value of [null, {}, 2, '\ud800', '\udc00', '\ud800x', '𝄞'.repeat(MAX_NATIVE_CATALOG_BYTES / 4 + 1)]) {
    assert.throws(() => nativeCatalogText(value), /Unicode|32 MiB/);
  }
  // JavaScript intentionally does not interpret JSON or repair malformed JSON;
  // the strict native parser supplies the authoritative file refusal.
  assert.equal(nativeCatalogText('{"same":1,"same":2}'), '{"same":1,"same":2}');
});

test('invalid setup selection refuses before IPC and copies the caller selection', async () => {
  let calls = 0; const api = createNativeCatalogArchive({ invoke: async () => { calls++; return { text: raw, counts: counts() }; } });
  for (const ids of [[], [''], ['a', 'a'], ['\ud800'], [7], null, Array.from({ length: 10_001 }, (_, i) => String(i))]) {
    await assert.rejects(() => api.exportArchive(ids), /Select/);
  }
  assert.equal(calls, 0);
});

test('bounded summary validation rejects inconsistent counts, false success and oversized diagnostics', () => {
  assert.deepEqual(nativeCatalogPreview(preview()), preview());
  const bad = [
    { counts: { tables: { ...tableCounts }, total: 15 } },
    { counts: { tables: { ...tableCounts, invented: 0 }, total: 16 } },
    { counts: { tables: { ...tableCounts, asset: -1 }, total: 13 } },
    { toImport: 15 }, { toImport: 17 }, { toImport: 16.5 },
    { conflictCount: 1 }, { canImport: false }, { warningCount: 1 },
    { warnings: [{ table: 'asset', id: 'a', reason: 'x'.repeat(501) }], warningCount: 1 },
    { conflicts: Array(101).fill({ table: 'asset', id: 'a', reason: 'conflict' }), conflictCount: 101, canImport: false },
    { reusedDependencies: 1, toImport: 15 },
  ];
  for (const delta of bad) assert.throws(() => nativeCatalogPreview(preview(delta)), /Invalid|Inconsistent/);
  assert.deepEqual(NATIVE_CATALOG_TABLES.slice().sort(), Object.keys(tableCounts).sort());
});

test('timestamp-only dependency reuse is distinct from exact matches and survives native conflict errors', async () => {
  const reuse = { table: 'manufacturer', id: 'm', sourceCreatedAt: 'source c', sourceUpdatedAt: 'source u', destinationCreatedAt: 'local c', destinationUpdatedAt: 'local u' };
  const p = preview({ toImport: 15, reusedDependencies: 1, dependencyReuses: [reuse] });
  assert.deepEqual(nativeCatalogPreview(p), p);
  const conflict = preview({ toImport: 15, canImport: false, conflictCount: 1,
    conflicts: [{ table: 'asset', id: '<img src=x>', reason: 'saved values differ' }] });
  const api = createNativeCatalogArchive({ invoke: async () => { throw { code: 'NATIVE_CATALOG_CONFLICT', message: 'conflict', preview: conflict }; } });
  await assert.rejects(() => api.importArchive(raw), error => error.code === 'NATIVE_CATALOG_CONFLICT' && error.preview.conflicts[0].id === '<img src=x>');
  assert.throws(() => nativeCatalogPreview({ ...p, dependencyReuses: [{ ...reuse, table: 'asset' }] }), /dependency timestamp/);
});

test('malformed native setup lists and result summaries cannot become a successful import or export', async () => {
  for (const response of [null, {}, [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }], [{ id: '', name: 'A' }], [{ id: 'a', name: 2 }]]) {
    await assert.rejects(() => createNativeCatalogArchive({ invoke: async () => response }).listSetups(), /Invalid/);
  }
  await assert.rejects(() => createNativeCatalogArchive({ invoke: async () => ({ inserted: 15, alreadyPresent: 0, reusedDependencies: 0, counts: counts() }) }).importArchive(raw), /Inconsistent/);
  await assert.rejects(() => createNativeCatalogArchive({ invoke: async () => ({ text: {}, counts: counts() }) }).exportArchive(['a']), /Unicode/);
});
