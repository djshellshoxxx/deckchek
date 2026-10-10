import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppState, validateKey, encodeValue, STORAGE_KEY, MAX_VALUE_BYTES, KEY_PATTERN } from '../app/app-state.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    raw: m,
  };
}

test('key pattern matches the Rust rule at its boundaries', () => {
  assert.equal(KEY_PATTERN.source, '^[a-z][a-z0-9_.]{0,63}$');
  for (const ok of ['a', 'wizard', 'backup.last_run', 'monitor.v2', 'z9._', 'a' + 'b'.repeat(63)]) assert.equal(validateKey(ok), ok);
  for (const bad of ['', 'Wizard', '9lives', '_x', '.x', 'a-b', 'a b', 'ä', 'wizard\n', 'a' + 'b'.repeat(64), null, undefined, 42]) {
    assert.throws(() => validateKey(bad), /invalid app_state key/, String(bad));
  }
});

test('value cap is 256 KiB of UTF-8 JSON, inclusive', () => {
  assert.equal(MAX_VALUE_BYTES, 262144);
  assert.equal(encodeValue('k', 'x'.repeat(MAX_VALUE_BYTES - 2)).length, MAX_VALUE_BYTES);
  assert.throws(() => encodeValue('k', 'x'.repeat(MAX_VALUE_BYTES - 1)), /limit is 262144/);
  assert.throws(() => encodeValue('k', 'é'.repeat(MAX_VALUE_BYTES / 2)), /limit/); // 2 bytes per char
  assert.throws(() => encodeValue('k', undefined), /not JSON-serializable/);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => encodeValue('k', cyclic), /not JSON-serializable/);
  assert.throws(() => encodeValue('k', 10n), /not JSON-serializable/);
});

test('native mode passes exactly the Rust command names and argument names', async () => {
  const calls = [];
  const replies = { app_state_get: { value: { step: 2 }, updatedAt: '2026-10-10T08:00:00.000Z' } };
  const invoke = async (cmd, args) => { calls.push([cmd, args]); return replies[cmd] ?? null; };
  const s = createAppState({ invoke, storage: null });
  assert.equal(s.native, true);
  assert.deepEqual(await s.get('wizard'), { value: { step: 2 }, updatedAt: '2026-10-10T08:00:00.000Z' });
  await s.set('wizard', { step: 3 });
  await s.delete('wizard');
  assert.deepEqual(calls, [
    ['app_state_get', { key: 'wizard' }],
    ['app_state_set', { key: 'wizard', value: { step: 3 } }],
    ['app_state_delete', { key: 'wizard' }],
  ]);
  // a missing key comes back as null, and invalid input never reaches Rust
  const s2 = createAppState({ invoke: async () => undefined, storage: null });
  assert.equal(await s2.get('backup'), null);
  calls.length = 0;
  await assert.rejects(s.set('Bad', 1), /invalid app_state key/);
  await assert.rejects(s.set('big', 'x'.repeat(MAX_VALUE_BYTES)), /limit/);
  assert.deepEqual(calls, []);
});

test('browser fallback round-trips under deckchek.appstate.v1', async () => {
  const storage = memoryStorage();
  let t = 0;
  const s = createAppState({ invoke: null, storage, now: () => `2026-10-10T00:00:0${t++}.000Z` });
  assert.equal(s.native, false);
  assert.equal(STORAGE_KEY, 'deckchek.appstate.v1');
  assert.equal(await s.get('wizard'), null);
  const v = { step: 3, done: ['input'], deck: { gain: -6 } };
  await s.set('wizard', v);
  const got = await s.get('wizard');
  assert.deepEqual(got, { value: v, updatedAt: '2026-10-10T00:00:00.000Z' });
  got.value.step = 99; // returned copies never alias storage
  assert.equal((await s.get('wizard')).value.step, 3);
  await s.set('wizard', null);
  assert.deepEqual(await s.get('wizard'), { value: null, updatedAt: '2026-10-10T00:00:01.000Z' });
  await s.set('backup.last', '2026-10-10');
  assert.deepEqual(Object.keys(JSON.parse(storage.raw.get(STORAGE_KEY))).sort(), ['backup.last', 'wizard']);
  await s.delete('wizard');
  await s.delete('wizard'); // deleting a missing key is a no-op
  assert.equal(await s.get('wizard'), null);
  assert.equal((await s.get('backup.last')).value, '2026-10-10');
});

test('browser fallback survives corrupt storage and surfaces write failures', async () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{not json');
  const s = createAppState({ invoke: null, storage });
  assert.equal(await s.get('wizard'), null);
  await s.set('wizard', 1);
  assert.equal((await s.get('wizard')).value, 1);
  storage.setItem(STORAGE_KEY, JSON.stringify({ wizard: 'not-an-entry' }));
  assert.equal(await s.get('wizard'), null);

  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  await assert.rejects(createAppState({ invoke: null, storage: full }).set('wizard', 1), /Quota/);
  await assert.rejects(createAppState({ invoke: null, storage: null }).set('wizard', 1), /no storage/);
  assert.equal(await createAppState({ invoke: null, storage: null }).get('wizard'), null);
});

test('default store resolves the Tauri bridge at call time', async () => {
  const { appState } = await import('../app/app-state.js');
  const calls = [];
  globalThis.__TAURI__ = { core: { invoke: async (cmd, args) => { calls.push([cmd, args]); return null; } } };
  try {
    assert.equal(appState.native, true);
    assert.equal(await appState.get('monitor'), null);
    assert.deepEqual(calls, [['app_state_get', { key: 'monitor' }]]);
  } finally {
    delete globalThis.__TAURI__;
  }
  assert.equal(appState.native, false);
});
