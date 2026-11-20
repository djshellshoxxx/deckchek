import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerApi, LOCAL_KEY } from '../app/ledger/api.js';

// Isolated FS-33 browser durability regressions. No application DOM or hardware required.
const makeApi = (storage, invoke = null) => createLedgerApi({
  invoke, storage,
  catalog: { list: async () => [] },
  photos: { list: async () => [] },
});
const record = {
  revision: 1,
  selection: { items: ['asset-1'], mode: 'single' },
  privacy: { preset: 'public' },
  ledgerSha256: 'a'.repeat(64),
};

test('browser public-note write rejects a full or blocked store instead of claiming persistence', async () => {
  let attempts = 0;
  const storage = {
    getItem: () => null,
    setItem: () => { attempts++; throw new Error('QuotaExceededError'); },
  };
  const api = makeApi(storage);
  await assert.rejects(api.setPublicNote('asset-1', 'Do not lose this note'), /could not save Gear Ledger changes/);
  assert.equal(attempts, 1);
  assert.deepEqual(await api.publicNotes(), {}, 'the failed note was never persisted');
});

test('browser export history does not advance revision when storage refuses the record', async () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('storage access denied'); },
  };
  const api = makeApi(storage);
  assert.equal(await api.nextRevision(), 1);
  await assert.rejects(api.recordExport(record), /could not save Gear Ledger changes/);
  assert.deepEqual(await api.listExports(), []);
  assert.equal(await api.nextRevision(), 1, 'a rejected record cannot become a false completed revision');
});

test('missing browser storage rejects both public-note and export-history writes', async () => {
  const api = makeApi(null);
  await assert.rejects(api.setPublicNote('asset-1', 'unsaved'), /storage is unavailable.*not saved/i);
  await assert.rejects(api.recordExport(record), /storage is unavailable.*not saved/i);
});

test('native persistence continues through Rust even when browser storage is unavailable', async () => {
  const seen = [];
  const api = makeApi(null, async (cmd, args) => {
    seen.push([cmd, args]);
    if (cmd === 'ledger_public_note_set') return { assetId: args.assetId, publicNotes: args.text };
    if (cmd === 'ledger_export_record') return { ...args.record, id: 'native', revision: 1 };
    throw new Error('Unexpected native command: ' + cmd);
  });
  assert.deepEqual(await api.setPublicNote('asset-1', 'Native note'), { assetId: 'asset-1', publicNotes: 'Native note' });
  assert.equal((await api.recordExport(record)).revision, 1);
  assert.deepEqual(seen.map(x => x[0]), ['ledger_public_note_set', 'ledger_export_record']);
});

test('a throwing localStorage getter cannot prevent the Ledger API from reporting a failed write', async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  assert.ok(!prior || prior.configurable, 'the property must be restorable after the test');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('SecurityError: blocked'); },
  });
  try {
    const api = createLedgerApi({
      invoke: null,
      catalog: { list: async () => [] },
      photos: { list: async () => [] },
    });
    await assert.rejects(api.setPublicNote('asset-1', 'draft'), /storage is unavailable.*not saved/i);
  } finally {
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
    else delete globalThis.localStorage;
  }
});

test('an unreadable existing browser Ledger cannot be silently overwritten', async () => {
  let writes = 0;
  const api = makeApi({
    getItem() { throw new Error('SecurityError: cannot read'); },
    setItem() { writes++; },
  });
  await assert.rejects(api.setPublicNote('asset-1', 'draft'), /data is unreadable.*not saved/i);
  await assert.rejects(api.recordExport(record), /data is unreadable.*not saved/i);
  assert.equal(writes, 0, 'never erase unreadable prior ledger data');
});

test('malformed or structurally invalid browser Ledger data blocks mutations', async () => {
  for (const raw of ['', '{broken', 'null', '{"exports":{}}', '{"exports":[false]}', '{"notes":[]}']) {
    let writes = 0;
    const api = makeApi({ getItem: () => raw, setItem: () => { writes++; } });
    await assert.rejects(api.setPublicNote('asset-1', 'draft'), /data is unreadable.*not saved/i);
    await assert.rejects(api.recordExport(record), /data is unreadable.*not saved/i);
    assert.equal(writes, 0, 'should not overwrite prior storage: ' + raw);
  }
});

test('browser notes belong only to explicitly saved asset IDs, including ordinary object-property names', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const catalog = { list: async kind => kind === 'asset' ? [{ id: 'constructor' }, { id: 'toString' }] : [] };
  const options = { invoke: null, storage, catalog, photos: { list: async () => [] } };
  const api = createLedgerApi(options);
  const noteValues = async instance => (await instance.listGear()).rows.map(row => row.asset.publicNotes);
  assert.deepEqual(await noteValues(api), [null, null], 'inherited object members are not saved notes');
  await api.setPublicNote('constructor', 'Serviced in March');
  await api.setPublicNote('toString', 'Original platter');
  assert.deepEqual(JSON.parse(storage.getItem(LOCAL_KEY)).notes, { constructor: 'Serviced in March', toString: 'Original platter' });
  assert.deepEqual(await noteValues(createLedgerApi(options)), ['Serviced in March', 'Original platter'], 'valid saved identifiers survive reload unchanged');
  await api.setPublicNote('constructor', '');
  assert.deepEqual(await noteValues(api), [null, 'Original platter'], 'clearing a note restores an empty value for that exact asset');
  assert.equal(Object.hasOwn(JSON.parse(storage.getItem(LOCAL_KEY)).notes, 'constructor'), false);
});
