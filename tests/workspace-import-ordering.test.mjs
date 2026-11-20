import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, installNativeCatalogDom, settle } from './fixtures/native-catalog-archive-dom.mjs';

installNativeCatalogDom({ after });
const state = await import('../app/ui/state.js');
const { importParsedWorkspace } = await import('../app/ui/persistence.js');
const storage = globalThis.localStorage;
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const setItem = storage.setItem;
const KEY = 'deckchek.workspace.v1';
const run = id => ({ id, test: 'quick', createdAt: '2026-11-19T12:00:00Z', measurements: [], findings: [], evidence: { source: id } });
const incoming = count => ({ version: 1, equipment: [{ id: 'new-unit', name: 'Imported equipment' }], runs: Array.from({ length: count }, (_, i) => run(`new-${i}`)) });
const jsonValue = value => JSON.parse(JSON.stringify(value));

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
  storage.setItem = setItem;
  delete window.__TAURI__;
  state.workspace.equipment = [{ id: 'old-unit' }];
  state.workspace.runs = [run('old-run')];
  state.saveWorkspace();
});

test('a denied browser-storage getter leaves prior saved/live state and notifications untouched', async t => {
  const saved = storage.getItem(KEY), before = structuredClone(state.workspace), events = [];
  const offRuns = state.on('runs', () => events.push('runs'));
  const offHistory = state.on('history', () => events.push('history'));
  let mirrorCalls = 0;
  t.mock.method(state.store, 'saveRun', async () => { mirrorCalls++; });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Browser storage access denied'); } });
  t.after(() => { Object.defineProperty(globalThis, 'localStorage', storageDescriptor); offRuns(); offHistory(); });
  await assert.rejects(importParsedWorkspace(incoming(1)), /could not be saved to browser storage/);
  assert.deepEqual(state.workspace, before);
  assert.equal(storage.getItem(KEY), saved);
  assert.deepEqual(events, []);
  assert.equal(mirrorCalls, 0);
});

test('durable workspace commit precedes a pending catalog mirror and survives its rejection', async t => {
  const firstMirror = deferred(), phases = [], snapshots = [];
  const offRuns = state.on('runs', () => {
    phases.push('runs');
    snapshots.push({ saved: JSON.parse(storage.getItem(KEY)), live: jsonValue(state.workspace) });
  });
  const offHistory = state.on('history', () => phases.push('history'));
  t.after(() => { offRuns(); offHistory(); });
  const mirrored = [];
  t.mock.method(state.store, 'saveRun', async saved => {
    mirrored.push(saved.id); phases.push(`mirror:${saved.id}`);
    if (mirrored.length === 1) return firstMirror.promise;
  });
  const source = incoming(2), before = structuredClone(source);
  let finished = false;
  const importing = importParsedWorkspace(source).then(result => { finished = true; return result; });
  await settle();
  assert.equal(finished, false);
  assert.deepEqual(phases, ['runs', 'mirror:new-0']);
  assert.deepEqual(snapshots[0].saved, { version: 1, ...snapshots[0].live });
  assert.deepEqual(snapshots[0].live.runs.map(value => value.id), ['new-0', 'new-1']);
  firstMirror.reject(new Error('Catalog mirror unavailable'));
  const result = await importing;
  assert.deepEqual(phases, ['runs', 'mirror:new-0', 'mirror:new-1', 'history']);
  assert.deepEqual(result.runs.map(value => value.id), ['new-0', 'new-1']);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), { version: 1, ...jsonValue(state.workspace) });
  assert.deepEqual(source, before);
});

test('the import retry preserves frozen source evidence at the twenty-run retention boundary', async t => {
  t.mock.method(state.store, 'saveRun', async () => {});
  t.after(() => { storage.setItem = setItem; });
  for (const count of [19, 20, 21]) {
    const source = incoming(count), before = jsonValue(source), attempts = [];
    for (const value of source.runs) { Object.freeze(value.evidence); Object.freeze(value); }
    Object.freeze(source.runs); Object.freeze(source.equipment); Object.freeze(source);
    storage.setItem = (key, value) => {
      assert.equal(key, KEY); attempts.push(JSON.parse(value));
      if (attempts.length === 1) throw new Error('First workspace write could not fit');
      setItem(key, value);
    };
    const result = await importParsedWorkspace(source);
    assert.equal(attempts.length, 2);
    assert.equal(result.runs.length, count);
    assert.equal(result.runs.filter(value => Object.hasOwn(value, 'evidence')).length, Math.min(count, 20));
    assert.ok(attempts[0].runs.every(value => value.evidence));
    assert.deepEqual(jsonValue(source), before);
    assert.deepEqual(JSON.parse(storage.getItem(KEY)), { version: 1, ...jsonValue(state.workspace) });
  }
});
