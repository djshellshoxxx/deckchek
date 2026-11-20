import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerApi } from '../app/ledger/api.js';

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
