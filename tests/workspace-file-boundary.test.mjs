import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installNativeCatalogDom, settle } from './fixtures/native-catalog-archive-dom.mjs';
import { MAX_WORKSPACE_CHARS, parseWorkspaceJson } from '../app/export.js';

const document = installNativeCatalogDom({ after });
window.addEventListener = () => {}; window.removeEventListener = () => {};
const state = await import('../app/ui/state.js');
const { importWorkspace } = await import('../app/ui/persistence.js');
const { createDataScreen } = await import('../app/ui/screens/data.js');
const encoder = new TextEncoder();
const original = { equipment: [{ id: 'original-asset', name: 'Keep this equipment' }], runs: [] };
const incoming = { version: 1, equipment: [{ id: 'incoming-asset', name: 'Café \ufffd \ud834\udd1e' }], runs: [] };
const incomingText = JSON.stringify(incoming);
let savedWorkspace;

beforeEach(() => {
  delete window.__TAURI__;
  state.workspace.equipment = structuredClone(original.equipment);
  state.workspace.runs = [];
  state.saveWorkspace();
  savedWorkspace = localStorage.getItem('deckchek.workspace.v1');
});

function file(bytes = encoder.encode(incomingText), declaredSize = bytes.length) {
  const reads = { text: 0, bytes: 0 };
  return {
    name: 'workspace.json', size: declaredSize, reads,
    async text() { reads.text++; return new TextDecoder().decode(bytes); },
    async arrayBuffer() { reads.bytes++; return bytes.slice().buffer; },
  };
}
function unchanged() {
  assert.deepEqual(state.workspace, original);
  assert.equal(localStorage.getItem('deckchek.workspace.v1'), savedWorkspace);
}

test('workspace import rejects an oversized selected file before either reader is called', async () => {
  const selected = file(undefined, MAX_WORKSPACE_CHARS + 1);
  await assert.rejects(importWorkspace(selected), /larger than 64 MB/);
  assert.deepEqual(selected.reads, { text: 0, bytes: 0 });
  unchanged();
});

test('workspace import rejects invalid declared sizes without reading or changing saved data', async () => {
  for (const size of [undefined, null, -1, 1.5, NaN, Infinity, '42']) {
    const selected = file(); selected.size = size;
    await assert.rejects(importWorkspace(selected), /size|workspace file/i);
    assert.deepEqual(selected.reads, { text: 0, bytes: 0 });
    unchanged();
  }
});

test('workspace import rejects a changed byte length before parsing or saving', async () => {
  const selected = file(undefined, 1);
  await assert.rejects(importWorkspace(selected), /size|length|changed/i);
  unchanged();
});

test('workspace import refuses malformed UTF-8 instead of silently replacing equipment text', async () => {
  const prefix = encoder.encode('{"version":1,"equipment":[{"id":"unit","name":"');
  const suffix = encoder.encode('"}],"runs":[]}');
  const bytes = new Uint8Array([...prefix, 0xc3, 0x28, ...suffix]);
  await assert.rejects(importWorkspace(file(bytes)), /UTF-8/i);
  unchanged();
});

test('direct workspace text parsing uses the byte cap for multibyte UTF-8', () => {
  const text = JSON.stringify({ version: 1, equipment: [{ id: 'large', notes: '界'.repeat(Math.floor(MAX_WORKSPACE_CHARS / 3)) }], runs: [] });
  assert.ok(text.length < MAX_WORKSPACE_CHARS);
  assert.throws(() => parseWorkspaceJson(text), /larger than 64 MB/);
  unchanged();
});

test('bounded workspace import preserves valid Unicode and reads one byte snapshot', async () => {
  const selected = file();
  const result = await importWorkspace(selected);
  assert.deepEqual(result, incoming);
  assert.deepEqual(selected.reads, { text: 0, bytes: 1 });
  assert.equal(state.workspace.equipment[0].name, incoming.equipment[0].name);
});

test('a real UTF-8 Blob with a byte-order mark retains the existing valid-file behavior', async () => {
  const selected = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), incomingText], { type: 'application/json' });
  assert.deepEqual(await importWorkspace(selected), incoming);
});

test('a workspace reader must return actual bytes, not decoded or missing content', async () => {
  for (const result of [null, undefined, incomingText, encoder.encode(incomingText)]) {
    const selected = file(); selected.arrayBuffer = async () => result;
    await assert.rejects(importWorkspace(selected), /size|read completely/i);
    unchanged();
  }
});

test('workspace file read errors and invalid JSON leave the existing workspace unchanged', async () => {
  const selected = file();
  selected.arrayBuffer = selected.text = async () => { throw Error('File became unreadable'); };
  await assert.rejects(importWorkspace(selected), /unreadable/);
  unchanged();
  await assert.rejects(importWorkspace(file(encoder.encode('{"version":1'))), /JSON/i);
  unchanged();
});

function mount(t) {
  const host = document.createElement('section'); document.body.append(host);
  const screen = createDataScreen(host);
  t.after(() => { screen.dispose(); host.remove(); });
  return { host, screen };
}
async function choose(host, selected) {
  host.querySelector('#data-import-json').dispatch('click'); await settle();
  const chooser = document.body.children.find(node => node.tagName === 'INPUT' && node.type === 'file');
  assert.ok(chooser, 'the real Data screen opens a chooser');
  chooser.files = [selected]; chooser.dispatch('change'); await settle();
}

test('browser Data import consumes one validated file snapshot and preserves normal imports', async t => {
  const { host } = mount(t), selected = file();
  await choose(host, selected);
  assert.match(host.querySelector('#data-status').textContent, /Imported 0 run\(s\) and 1 equipment/);
  assert.deepEqual(selected.reads, { text: 0, bytes: 1 });
  assert.deepEqual(state.workspace.equipment, incoming.equipment);
});

test('browser Data import rejects an oversized file without reading it or replacing existing data', async t => {
  const { host } = mount(t), selected = file(undefined, MAX_WORKSPACE_CHARS + 1);
  await choose(host, selected);
  assert.match(host.querySelector('#data-status').textContent, /larger than 64 MB/);
  assert.deepEqual(selected.reads, { text: 0, bytes: 0 });
  unchanged();
});
