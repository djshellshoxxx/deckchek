import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel, MODEL_VERSION } from '../app/mapper/model.js';
import { createMapperStore, MapperStorageError, LOCAL_KEY } from '../app/mapper/store.js';

const model = () => createModel({ name: 'Current mapping' });
const row = (id = 'saved-a') => ({ id, name: id, assetId: null, profileId: null, model: model(), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
function memory(raw = null) {
  let value = raw;
  const writes = [];
  return {
    storage: {
      getItem(key) { assert.equal(key, LOCAL_KEY); return value; },
      setItem(key, next) { assert.equal(key, LOCAL_KEY); writes.push(next); value = String(next); },
    },
    writes, bytes: () => value, replace: next => { value = next; },
  };
}
const readError = error => error instanceof MapperStorageError && error.code === 'MAPPER_STORAGE_READ';
async function refusesAll(store) {
  await assert.rejects(store.list(), readError);
  await assert.rejects(store.get('saved-a'), readError);
  await assert.rejects(store.save({ name: 'Current mapping', model: model() }), readError);
  await assert.rejects(store.remove('saved-a'), readError);
}

test('an absent Mapper key is empty and supports the first durable save', async () => {
  const m = memory(), store = createMapperStore({ api: null, storage: m.storage });
  assert.deepEqual(await store.list(), []);
  assert.equal(await store.get('missing'), null);
  assert.equal(m.writes.length, 0);
  const saved = await store.save({ name: 'First mapping', model: model() });
  assert.equal(m.writes.length, 1);
  assert.equal(JSON.parse(m.bytes())[0].id, saved.id);
  assert.equal((await store.get(saved.id)).name, 'First mapping');
  assert.equal((await store.list())[0].id, saved.id);
  assert.equal(await store.remove(saved.id), true);
  assert.deepEqual(await store.list(), []);
});

test('malformed or non-array Mapper data rejects reads and mutations without changing a byte', async () => {
  for (const raw of ['', '  ', '{corrupt', 'null', '{}', '"saved"', '42', 'false']) {
    const m = memory(raw), store = createMapperStore({ api: null, storage: m.storage });
    await refusesAll(store);
    assert.equal(m.writes.length, 0, raw);
    assert.equal(m.bytes(), raw);
  }
});

test('partially invalid or ambiguous Mapper rows cannot be silently filtered during a write', async () => {
  const valid = row();
  const other = row('invalid-b');
  const invalid = [null, false, 3, [], {}, { ...valid, id: '' }, { ...valid, id: 7 },
    { ...other, name: null }, { ...other, model: null }, { ...other, model: [] },
    { ...other, model: { version: '1' } }];
  for (const rows of [...invalid.map(value => [valid, value]), [valid, { ...valid, name: 'Duplicate identity' }]]) {
    const raw = JSON.stringify(rows, null, 2), m = memory(raw);
    await refusesAll(createMapperStore({ api: null, storage: m.storage }));
    assert.equal(m.writes.length, 0);
    assert.equal(m.bytes(), raw);
  }
});

test('an unreadable or missing browser store cannot be reported as empty or successfully saved', async () => {
  let writes = 0;
  const storage = { getItem() { throw new Error('Private browser failure detail'); }, setItem() { writes++; } };
  await refusesAll(createMapperStore({ api: null, storage }));
  assert.equal(writes, 0);
  for (const unavailable of [null, {}, { getItem: () => undefined }]) {
    await refusesAll(createMapperStore({ api: null, storage: unavailable }));
  }
  assert.ok(!new MapperStorageError().message.includes('Private browser failure detail'));
});

test('a throwing default storage getter is a read failure and is never consulted by native operations', async t => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let reads = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { reads++; throw new Error('Blocked'); } });
  t.after(() => { if (prior) Object.defineProperty(globalThis, 'localStorage', prior); else delete globalThis.localStorage; });
  await refusesAll(createMapperStore({ api: null }));
  const beforeNative = reads, calls = [], saved = row();
  const api = { core: { invoke: async (command, args) => {
    calls.push([command, args]);
    return command === 'mapper_model_list' ? [] : command === 'mapper_model_delete' ? true : saved;
  } } };
  const native = createMapperStore({ api });
  await native.save({ name: saved.name, model: saved.model });
  await native.list(); await native.get(saved.id); await native.remove(saved.id);
  assert.deepEqual(calls.map(call => call[0]), ['mapper_model_save', 'mapper_model_list', 'mapper_model_get', 'mapper_model_delete']);
  assert.equal(reads, beforeNative);
});

test('valid rows retain order, metadata and newer model fields when another mapping changes', async () => {
  const older = { ...row('older'), unknownMetadata: { note: 'preserve' } };
  const future = { ...row('future'), updatedAt: '2026-02-01T00:00:00.000Z', model: { ...model(), version: MODEL_VERSION + 1, futureField: { keep: true } } };
  const m = memory(JSON.stringify([older, future])), store = createMapperStore({ api: null, storage: m.storage });
  assert.deepEqual((await store.list()).map(item => item.id), ['future', 'older']);
  assert.equal((await store.get(future.id)).readOnly, true);
  const original = m.bytes();
  await assert.rejects(store.save({ id: future.id, name: 'Downgrade', model: model() }), { code: 'MAPPER_NEWER_VERSION' });
  assert.equal(m.bytes(), original);
  assert.equal(m.writes.length, 0);
  await store.save({ name: 'A new mapping', model: model() });
  const saved = JSON.parse(m.bytes());
  assert.deepEqual(saved.find(item => item.id === older.id), older);
  assert.deepEqual(saved.find(item => item.id === future.id), future);
  await store.remove(older.id);
  assert.deepEqual(JSON.parse(m.bytes()).find(item => item.id === future.id), future);
});

test('every mutation rereads storage instead of relying on an earlier valid list', async () => {
  const m = memory(JSON.stringify([row()])), store = createMapperStore({ api: null, storage: m.storage });
  assert.equal((await store.list()).length, 1);
  const damaged = '{preserve this exact original';
  m.replace(damaged);
  await assert.rejects(store.save({ id: 'saved-a', name: 'Edit', model: model() }), readError);
  await assert.rejects(store.remove('saved-a'), readError);
  assert.equal(m.writes.length, 0);
  assert.equal(m.bytes(), damaged);
  m.replace(JSON.stringify([row()]));
  assert.equal((await store.list()).length, 1, 'restored data can be read without recreating the store');
});

test('blocked or missing setItem rejects a save/delete without claiming persistence', async () => {
  const raw = JSON.stringify([row()]);
  let writes = 0;
  const storage = { getItem: () => raw, setItem() { writes++; throw new Error('Quota exceeded'); } };
  const store = createMapperStore({ api: null, storage });
  await assert.rejects(store.save({ name: 'Not saved', model: model() }), /did not let DeckChek store/);
  await assert.rejects(store.remove('saved-a'), /did not let DeckChek store/);
  assert.equal(writes, 2);
  assert.equal(storage.getItem(), raw);
  const unavailable = createMapperStore({ api: null, storage: { getItem: () => raw } });
  await assert.rejects(unavailable.save({ name: 'Not saved', model: model() }), /did not let DeckChek store/);
  await assert.rejects(unavailable.remove('saved-a'), /did not let DeckChek store/);
});
