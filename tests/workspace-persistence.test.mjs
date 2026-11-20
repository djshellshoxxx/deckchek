import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installNativeCatalogDom, settle } from './fixtures/native-catalog-archive-dom.mjs';

const document = installNativeCatalogDom({ after });
window.addEventListener = () => {}; window.removeEventListener = () => {};
const state = await import('../app/ui/state.js');
const { importWorkspace, importParsedWorkspace } = await import('../app/ui/persistence.js');
const { createDataScreen } = await import('../app/ui/screens/data.js');
const target = globalThis.localStorage;
const setItem = target.setItem;
const WORKSPACE_KEY = 'deckchek.workspace.v1';
const CATALOG_KEY = 'deckchek.catalog.v1';
const encoder = new TextEncoder();
const run = id => ({ id, test: 'quick', createdAt: '2026-11-19T12:00:00Z', measurements: [], findings: [], evidence: { source: id } });
const original = { equipment: [{ id: 'old-unit', name: 'Existing equipment' }], runs: [run('old-run')] };
const incoming = count => ({ version: 1, equipment: [{ id: 'new-unit', name: 'Imported equipment' }], runs: Array.from({ length: count }, (_, i) => run(`new-${i}`)) });
let savedWorkspace, savedCatalog;

beforeEach(() => {
  globalThis.localStorage = target; target.setItem = setItem;
  delete window.__TAURI__;
  state.workspace.equipment = structuredClone(original.equipment);
  state.workspace.runs = structuredClone(original.runs);
  state.saveWorkspace();
  setItem(CATALOG_KEY, JSON.stringify({ catalog: {}, runs: [run('catalog-old')], alignments: [] }));
  savedWorkspace = target.getItem(WORKSPACE_KEY);
  savedCatalog = target.getItem(CATALOG_KEY);
});

function file(data) {
  const bytes = encoder.encode(JSON.stringify(data));
  return { name: 'workspace.json', size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer };
}
function unchanged() {
  assert.deepEqual(state.workspace, original, 'the current equipment and full run evidence stay intact');
  assert.equal(target.getItem(WORKSPACE_KEY), savedWorkspace, 'the saved workspace stays intact');
  assert.equal(target.getItem(CATALOG_KEY), savedCatalog, 'failed workspace replacement must not start catalog mirroring');
}
function mount(t) {
  const host = document.createElement('section'); document.body.append(host);
  const screen = createDataScreen(host);
  t.after(() => { screen.dispose(); host.remove(); globalThis.localStorage = target; target.setItem = setItem; });
  return host;
}
async function choose(host, data) {
  const button = host.querySelector('#data-import-json');
  const pending = button.listeners.click[0].callback({ target: button, currentTarget: button });
  const chooser = document.body.children.find(node => node.tagName === 'INPUT' && node.type === 'file');
  assert.ok(chooser, 'the real Data handler opens its file chooser');
  chooser.files = [file(data)]; chooser.dispatch('change');
  await pending; await settle();
}

function failWrites() {
  const attempts = [];
  target.setItem = (key, value) => { attempts.push({ key, value }); throw Object.assign(new Error('Storage quota exceeded'), { name: 'QuotaExceededError' }); };
  return attempts;
}

test('Data reports failed workspace persistence and preserves prior saved and active data', async t => {
  const host = mount(t), attempts = failWrites();
  let runsEvents = 0, historyEvents = 0;
  const offRuns = state.on('runs', () => { runsEvents++; });
  const offHistory = state.on('history', () => { historyEvents++; });
  t.after(() => { offRuns(); offHistory(); });
  await choose(host, incoming(22));
  assert.match(host.querySelector('#data-status').textContent, /Could not import.*(storage|save)/i);
  assert.doesNotMatch(host.querySelector('#data-status').textContent, /Imported 22 run/);
  unchanged();
  assert.deepEqual(attempts.map(a => a.key), [WORKSPACE_KEY, WORKSPACE_KEY]);
  assert.equal(runsEvents, 0, 'failed replacement must not publish a new run set');
  assert.equal(historyEvents, 0, 'failed replacement must not publish imported History');
});

test('workspace import rejects unavailable browser storage before replacing active data', async t => {
  globalThis.localStorage = undefined;
  t.after(() => { globalThis.localStorage = target; });
  await assert.rejects(importWorkspace(file(incoming(1))), /storage|save/i);
  unchanged();
});

test('a failed direct parsed import keeps the submitted snapshot and prior workspace unchanged', async t => {
  t.after(() => { target.setItem = setItem; });
  const data = incoming(22), before = structuredClone(data);
  failWrites();
  await assert.rejects(importParsedWorkspace(data), /storage|save/i);
  assert.deepEqual(data, before);
  unchanged();
});

test('successful workspace replacement persists before announcing the new run set', async t => {
  const host = mount(t), data = incoming(2), observed = [];
  const off = state.on('runs', () => { observed.push(JSON.parse(target.getItem(WORKSPACE_KEY))); });
  t.after(off);
  await choose(host, data);
  assert.match(host.querySelector('#data-status').textContent, /Imported 2 run\(s\) and 1 equipment/);
  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0], JSON.parse(JSON.stringify({ version: 1, ...state.workspace })));
  assert.deepEqual(JSON.parse(target.getItem(WORKSPACE_KEY)), JSON.parse(JSON.stringify({ version: 1, ...state.workspace })));
  assert.equal(state.workspace.runs[0].id, data.runs[0].id);
  assert.deepEqual(state.workspace.runs[0].evidence, data.runs[0].evidence);
});

test('workspace replacement retains its existing single reduced-evidence quota retry', async t => {
  t.after(() => { target.setItem = setItem; });
  const data = incoming(22), before = structuredClone(data), attempts = [];
  target.setItem = (key, value) => {
    if (key === WORKSPACE_KEY) {
      attempts.push(JSON.parse(value));
      if (attempts.length === 1) throw Object.assign(new Error('Storage quota exceeded'), { name: 'QuotaExceededError' });
    }
    return setItem(key, value);
  };
  const imported = await importParsedWorkspace(data);
  assert.equal(attempts.length, 2);
  assert.deepEqual(data, before, 'retention retry must not alter the submitted file snapshot');
  assert.ok(attempts[0].runs.every(r => r.evidence));
  assert.ok(attempts[1].runs.slice(0, 20).every(r => r.evidence));
  assert.ok(attempts[1].runs.slice(20).every(r => !Object.hasOwn(r, 'evidence')));
  assert.deepEqual(JSON.parse(target.getItem(WORKSPACE_KEY)), JSON.parse(JSON.stringify({ version: 1, ...state.workspace })));
  assert.equal(imported.runs.length, 22);
});

test('Data reports only the retained 250 imported runs and preserves the input snapshot', async t => {
  const host = mount(t), data = incoming(251), before = structuredClone(data), attempts = [];
  target.setItem = (key, value) => { if (key === WORKSPACE_KEY) attempts.push(JSON.parse(value)); return setItem(key, value); };
  await choose(host, data);
  assert.match(host.querySelector('#data-status').textContent, /Imported 250 run\(s\) and 1 equipment/);
  assert.deepEqual(data, before);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].runs.length, 250);
  assert.equal(state.workspace.runs.length, 250);
  assert.equal(state.workspace.runs.at(-1).id, 'new-249');
  assert.equal(state.workspace.runs.some(r => r.id === 'new-250'), false);
  const savedRuns = JSON.parse(target.getItem(CATALOG_KEY)).runs;
  assert.equal(savedRuns.filter(r => r.id.startsWith('new-')).length, 250);
  assert.equal(savedRuns.some(r => r.id === 'catalog-old'), true, 'catalog history merge retains earlier saved records');
});
