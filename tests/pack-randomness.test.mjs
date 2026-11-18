import test from 'node:test';
import assert from 'node:assert/strict';
import { createPackApi, CONTRIBUTOR_KEY } from '../app/pack-api.js';
import { buildPack } from '../app/pack.js';

function withCrypto(t, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor); else delete globalThis.crypto; });
}

function state() {
  const values = new Map();
  return { values, get: async key => ({ value: values.get(key) }), set: async (key, value) => { values.set(key, value); } };
}

test('population contributor uses cryptographic bytes when randomUUID is unavailable', async t => {
  let calls = 0;
  withCrypto(t, { getRandomValues(bytes) { calls++; bytes.fill(0xab); return bytes; } });
  const appState = state(), api = createPackApi({ appState });
  const token = await api.contributor();
  assert.equal(calls, 1, 'a timestamp or Math.random fallback must not replace secure bytes');
  assert.equal(token, 'abababababababababababababababab');
  assert.equal(appState.values.get(CONTRIBUTOR_KEY), token);
});

test('population contributor fails closed without secure randomness and preserves an existing token', async t => {
  withCrypto(t, undefined);
  const appState = state(), api = createPackApi({ appState });
  await assert.rejects(() => api.contributor(), /Secure randomness is unavailable/);
  assert.equal(appState.values.has(CONTRIBUTOR_KEY), false);
  appState.values.set(CONTRIBUTOR_KEY, 'previous-random-token');
  assert.equal(await api.contributor(), 'previous-random-token');
  await assert.rejects(() => api.contributor({ reset: true }), /Secure randomness is unavailable/);
  assert.equal(appState.values.get(CONTRIBUTOR_KEY), 'previous-random-token');
});

test('pack creation uses the same secure identifier policy for every generated identifier', t => {
  let counter = 0;
  withCrypto(t, { getRandomValues(bytes) { bytes.fill(++counter); return bytes; } });
  const pack = buildPack({ rows: [], appVersion: '0.0.8', createdMonth: '2026-11' });
  assert.equal(pack.packId, '01'.repeat(16));
  assert.equal(pack.contributor, '02'.repeat(16));
});
