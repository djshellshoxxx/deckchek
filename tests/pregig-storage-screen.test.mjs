// Actual Pre-gig screen and controller with explicit browser storage and DOM seams.
// These cases qualify state, feedback and ownership, not native audio or browser layout.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPregigApi } from '../app/pre-gig.js';
import { Element, installServiceDom, settle, deferred } from './fixtures/service-screen-dom.mjs';

const contract = JSON.parse(readFileSync(new URL('./contracts/pregig.json', import.meta.url), 'utf8'));
const PRESETS = 'deckchek.pregig.presets.v1', RUNS = 'deckchek.pregig.runs.v1', LAST = 'deckchek.pregig.lastPreset.v1';
const builtin = { ...contract.pregig_preset_upsert.request.preset.json, id: 'builtin-test', name: 'Built-in test rig', builtin: true, midi: [] };
const other = { ...builtin, id: 'builtin-other', name: 'Other test rig' };
const savedRun = { ...contract.pregig_save_run.request.run, id: 'saved-run', notes: 'Preset: Retained rig' };
const printCss = readFileSync(new URL('../app/report-print.css', import.meta.url), 'utf8');

// The production live module owns document-lifetime shell hosts. Keep those hosts
// stable while each case replaces only its screen, dialogs and storage seam.
const document = installServiceDom({ after });
document.removeEventListener = (...args) => document.body.removeEventListener(...args);

async function mount(t, { entries = [], builtins = [builtin, other], wrapApi = api => api } = {}) {
  let cleanup = () => {};
  t.after(() => cleanup());
  for (const id of ['toasts', 'sr-polite', 'sr-assertive']) document.getElementById(id).replaceChildren();
  t.mock.method(globalThis, 'setTimeout', () => 0);
  t.mock.method(globalThis, 'setInterval', () => 0);
  const records = new Map(entries), writes = [], deniedReads = new Set(), deniedWrites = new Set();
  const storage = {
    getItem(key) { if (deniedReads.has(key)) throw new Error('private read details'); return records.get(key) ?? null; },
    setItem(key, value) { writes.push([key, value]); if (deniedWrites.has(key)) throw new Error('private write details'); records.set(key, String(value)); },
  };
  globalThis.localStorage = storage;
  globalThis.fetch = async url => ({ ok: true, json: async () => String(url).endsWith('pregig-presets.json') ? { presets: builtins } : { profiles: [] }, text: async () => printCss });
  const [{ createPregigScreen }, { active }, { ensureLibrary }] = await Promise.all([
    import('../app/ui/screens/pregig.js'), import('../app/ui/state.js'), import('../app/ui/devices/library-state.js'),
  ]);
  await ensureLibrary();
  const previous = active.screen;
  active.screen = { def: { id: 'pregig' } };
  const section = document.createElement('section'); document.body.append(section);
  const confirm = document.createElement('dialog'); confirm.id = 'confirm-dialog';
  confirm.innerHTML = '<h2 id="confirm-title"></h2><p id="confirm-body"></p><button id="confirm-cancel">Cancel</button><button id="confirm-ok">Discard</button>';
  document.body.append(confirm);
  let nextId = 0;
  const browserApi = createPregigApi({ invoke: null, storage, newId: () => `screen-${++nextId}`, now: () => '2026-11-21T14:00:00.000Z' });
  const api = wrapApi(browserApi, { records, writes, deniedReads, deniedWrites });
  const screen = createPregigScreen(section, { api, nativeInvoke: null });
  cleanup = () => { screen.dispose(); section.remove(); confirm.remove(); active.screen = previous; };
  await settle();
  return { document, section, screen, records, writes, deniedReads, deniedWrites, api, confirm,
    q: selector => section.querySelector(selector),
    tab: async id => { section.querySelector(`#pg-tab-${id}`).dispatch('click'); await settle(); },
  };
}

const button = (root, text) => [...root.querySelectorAll('button')].find(node => node.textContent === text);
const presetWrites = f => f.writes.filter(([key]) => key === PRESETS);
const runWrites = f => f.writes.filter(([key]) => key === RUNS);
const pregigWrites = f => f.writes.filter(([key]) => [PRESETS, RUNS, LAST].includes(key));

async function finishPreview(f) {
  const manual = f.q('input[data-step="headphones"]');
  assert.ok(manual); manual.checked = false; manual.dispatch('change');
  f.q('#pg-start').dispatch('click'); await settle();
  assert.equal(f.screen.controller.state.phase, 'done');
  return f.screen.controller.state.run;
}

async function openDraft(f, name = 'Unsaved rig') {
  await f.tab('presets'); f.q('#pg-new').dispatch('click');
  const dialog = f.document.querySelector('.pg-dialog');
  const nameInput = dialog.querySelector('#pg-f-name'), deviceInput = dialog.querySelector('#pg-f-device');
  nameInput.value = name; deviceInput.value = 'Draft interface';
  return { dialog, nameInput, deviceInput, save: dialog.querySelector('[data-action="save"]') };
}

test('Pre-gig screen keeps unavailable preset storage visible across tabs and retries without silently choosing a rig', async t => {
  const raw = '{private damaged registry';
  const f = await mount(t, { entries: [[PRESETS, raw], [LAST, JSON.stringify('unread-saved-rig')]] });
  assert.match(f.q('#pg-presets-unavailable').textContent, /saved presets are unavailable/);
  assert.doesNotMatch(f.section.textContent, /private damaged|Create your first rig/);
  assert.equal(f.q('#pg-preset').value, ''); assert.equal(f.q('#pg-start'), null);
  await f.tab('presets'); assert.ok(f.q('#pg-presets-unavailable'));
  await f.tab('history'); assert.ok(f.q('#pg-presets-unavailable'));
  await f.tab('check'); assert.ok(f.q('#pg-presets-unavailable'));
  assert.equal(f.records.get(PRESETS), raw); assert.equal(pregigWrites(f).length, 0);
  f.records.set(PRESETS, '[]'); f.q('#pg-retry-presets').dispatch('click'); await settle();
  assert.equal(f.q('#pg-presets-unavailable'), null); assert.ok(f.q('#pg-start'));
  assert.equal(f.q('#pg-preset').value, builtin.id); assert.equal(pregigWrites(f).length, 0);
});

test('Pre-gig screen distinguishes unavailable History from confirmed empty History and recovers on Retry', async t => {
  const raw = '{private broken History';
  const f = await mount(t, { entries: [[RUNS, raw]] });
  await f.tab('history');
  assert.ok(f.q('#pg-history-unavailable')); assert.equal(f.q('#pg-history-empty'), null);
  assert.doesNotMatch(f.section.textContent, /No checks yet|private broken/);
  await f.tab('check'); await f.tab('history'); assert.ok(f.q('#pg-history-unavailable'));
  assert.equal(f.records.get(RUNS), raw); assert.equal(runWrites(f).length, 0);
  f.records.set(RUNS, '[]'); f.q('#pg-retry-history').dispatch('click'); await settle();
  assert.equal(f.q('#pg-history-unavailable'), null);
  assert.match(f.q('#pg-history-empty').textContent, /saved successfully/);
  assert.equal(runWrites(f).length, 0);
});

test('Pre-gig screen retains previously loaded History with a persistent unavailable message after a failed refresh', async t => {
  const raw = JSON.stringify([savedRun]);
  const f = await mount(t, { entries: [[RUNS, raw]] });
  await f.tab('history'); assert.match(f.q('#pg-history').textContent, /Retained rig/);
  f.deniedReads.add(RUNS); await f.tab('check'); await f.tab('history');
  assert.match(f.q('#pg-history-unavailable').textContent, /may be out of date/);
  assert.match(f.q('#pg-history').textContent, /Retained rig/); assert.equal(f.q('#pg-history-empty'), null);
  assert.equal(f.records.get(RUNS), raw); assert.equal(runWrites(f).length, 0);
  f.deniedReads.delete(RUNS); f.q('#pg-retry-history').dispatch('click'); await settle();
  assert.equal(f.q('#pg-history-unavailable'), null); assert.match(f.q('#pg-history').textContent, /Retained rig/);
});

test('Pre-gig preset Save keeps the same draft and inline error after denied persistence, then confirms one successful retry', async t => {
  const f = await mount(t, { entries: [[PRESETS, '[]']] });
  f.deniedWrites.add(PRESETS);
  const draft = await openDraft(f);
  draft.save.dispatch('click'); await settle();
  assert.equal(draft.dialog.open, true); assert.equal(draft.dialog.querySelector('#pg-f-name'), draft.nameInput);
  assert.equal(draft.nameInput.value, 'Unsaved rig'); assert.equal(draft.deviceInput.value, 'Draft interface');
  assert.match(draft.dialog.querySelector('.pg-form-errors').textContent, /Could not save the preset/);
  assert.doesNotMatch(draft.dialog.textContent, /private write details/);
  assert.equal(f.records.get(PRESETS), '[]'); assert.equal(presetWrites(f).length, 1);
  assert.doesNotMatch(f.document.querySelector('#toasts').textContent, /Saved/);
  f.deniedWrites.delete(PRESETS); draft.save.dispatch('click'); draft.save.dispatch('click'); await settle();
  assert.equal(draft.dialog.isConnected, false); assert.equal(presetWrites(f).length, 2);
  const rows = JSON.parse(f.records.get(PRESETS)); assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Unsaved rig'); assert.equal(rows[0].json.audioDevice, 'Draft interface');
  assert.match(f.document.querySelector('#toasts').textContent, /Saved "Unsaved rig"/);
});

test('Pre-gig preset Save coalesces repeated clicks and keeps the dialog open while persistence is pending', async t => {
  const pending = deferred(); let calls = 0;
  const f = await mount(t, { wrapApi: api => ({ ...api, async upsertPreset(value) { calls++; await pending.promise; return api.upsertPreset(value); } }) });
  const draft = await openDraft(f);
  draft.save.dispatch('click'); draft.save.dispatch('click');
  button(draft.dialog, 'Cancel').dispatch('click'); draft.dialog.dispatch('cancel');
  assert.equal(calls, 1); assert.equal(draft.dialog.open, true); assert.equal(draft.save.disabled, true);
  for (const control of draft.dialog.querySelector('form').querySelectorAll('input,select,textarea,button')) assert.equal(control.disabled, true, 'a pending acknowledged snapshot cannot accept more draft edits');
  pending.resolve(); await settle();
  assert.equal(draft.dialog.isConnected, false); assert.equal(presetWrites(f).length, 1);
});

test('Pre-gig a failed pending preset save restores draft editing and preserves every entered value for retry', async t => {
  const pending = deferred(); let calls = 0;
  const f = await mount(t, { wrapApi: api => ({ ...api, upsertPreset(value) { return ++calls === 1 ? pending.promise : api.upsertPreset(value); } }) });
  const draft = await openDraft(f, 'Retained pending draft');
  const software = draft.dialog.querySelector('#pg-f-software'), midi = draft.dialog.querySelector('#pg-f-midi');
  software.value = 'My software'; midi.value = 'Controller A\nController B';
  draft.save.dispatch('click');
  const controls = [...draft.dialog.querySelector('form').querySelectorAll('input,select,textarea,button')];
  assert.ok(controls.length > 5); assert.ok(controls.every(control => control.disabled));
  pending.reject(new Error('Storage did not accept the preset')); await settle();
  assert.equal(draft.dialog.open, true); assert.ok(controls.every(control => !control.disabled));
  assert.equal(draft.nameInput.value, 'Retained pending draft'); assert.equal(draft.deviceInput.value, 'Draft interface');
  assert.equal(software.value, 'My software'); assert.equal(midi.value, 'Controller A\nController B');
  assert.match(draft.dialog.querySelector('.pg-form-errors').textContent, /did not accept/);
  draft.save.dispatch('click'); await settle();
  const saved = JSON.parse(f.records.get(PRESETS))[0];
  assert.equal(saved.json.software, 'My software'); assert.deepEqual(saved.json.midi, ['Controller A', 'Controller B']);
  assert.equal(calls, 2); assert.equal(draft.dialog.isConnected, false);
});

test('Pre-gig keeps an acknowledged preset and truthful success when the subsequent list refresh is unavailable', async t => {
  const f = await mount(t, { wrapApi: (api, env) => ({ ...api, async upsertPreset(value) {
    const row = await api.upsertPreset(value); env.deniedReads.add(PRESETS); return row;
  } }) });
  const draft = await openDraft(f, 'Acknowledged rig'); draft.save.dispatch('click'); await settle();
  assert.equal(draft.dialog.isConnected, false); assert.equal(presetWrites(f).length, 1);
  assert.match(f.q('.pg-preset-list').textContent, /Acknowledged rig/);
  assert.ok(f.q('#pg-presets-unavailable')); assert.match(f.document.querySelector('#toasts').textContent, /Saved "Acknowledged rig"/);
  f.deniedReads.delete(PRESETS); f.q('#pg-retry-presets').dispatch('click'); await settle();
  assert.equal(f.q('#pg-presets-unavailable'), null); assert.match(f.q('.pg-preset-list').textContent, /Acknowledged rig/);
});

test('Pre-gig an acknowledged preset save finishes while an optional refresh is still pending', async t => {
  const refresh = deferred(); let lists = 0;
  const f = await mount(t, { wrapApi: api => ({ ...api, listPresets() { return ++lists === 1 ? api.listPresets() : refresh.promise; } }) });
  const draft = await openDraft(f, 'Saved before refresh'); draft.save.dispatch('click'); await settle();
  assert.equal(lists, 2); assert.equal(draft.dialog.isConnected, false);
  assert.equal(presetWrites(f).length, 1); assert.match(f.q('.pg-preset-list').textContent, /Saved before refresh/);
  assert.match(document.getElementById('toasts').textContent, /Saved "Saved before refresh"/);
  refresh.resolve(JSON.parse(f.records.get(PRESETS))); await settle();
  assert.equal(f.q('#pg-presets-unavailable'), null); assert.match(f.q('.pg-preset-list').textContent, /Saved before refresh/);
});

test('Pre-gig actual Retry and shell Save retain the completed result and never claim persistence before it succeeds', async t => {
  const f = await mount(t); f.deniedWrites.add(RUNS);
  let started = 0, previousPhase = 'idle';
  f.screen.controller.subscribe(state => { if (state.phase === 'running' && previousPhase !== 'running') started++; previousPhase = state.phase; });
  const result = await finishPreview(f), snapshot = structuredClone(result);
  assert.match(f.q('#pg-verdict').textContent, /Not saved to History/);
  assert.equal(runWrites(f).length, 1); assert.equal(f.screen.controller.state.saved, null);
  f.q('#pg-retry-save').dispatch('click'); await settle();
  assert.equal(runWrites(f).length, 2); assert.equal(f.screen.controller.state.run, result);
  await f.screen.onSave(); assert.equal(runWrites(f).length, 3);
  assert.doesNotMatch(f.document.querySelector('#toasts').textContent, /automatically|saved to History/i);
  await f.tab('history'); await f.tab('check'); assert.match(f.q('#pg-verdict').textContent, /Not saved to History/);
  f.deniedWrites.delete(RUNS); const retry = f.q('#pg-retry-save'); retry.dispatch('click'); retry.dispatch('click'); await settle();
  assert.equal(runWrites(f).length, 4); assert.equal(started, 1);
  assert.equal(f.screen.controller.state.run, result); assert.deepEqual(result, snapshot);
  assert.match(f.q('#pg-verdict').textContent, /Saved to History/); assert.equal(f.q('#pg-retry-save'), null);
  await f.screen.onSave(); assert.equal(runWrites(f).length, 4);
  assert.equal(JSON.parse(f.records.get(RUNS)).length, 1);
});

test('Pre-gig saving a different preset keeps an unsaved check attached to the rig it actually tested', async t => {
  const f = await mount(t); f.deniedWrites.add(RUNS); const result = await finishPreview(f);
  const draft = await openDraft(f, 'Newly saved rig'); draft.save.dispatch('click'); await settle();
  assert.equal(draft.dialog.isConnected, false); assert.equal(presetWrites(f).length, 1);
  await f.tab('check');
  assert.equal(f.screen.controller.state.run, result); assert.equal(f.screen.controller.state.preset.id, builtin.id);
  assert.equal(f.q('#pg-preset').value, builtin.id); assert.match(f.q('#pg-verdict').textContent, /Not saved to History/);
  assert.equal(runWrites(f).length, 1);
});

for (const [name, action, afterDiscard] of [
  ['Done', f => f.q('#pg-back').dispatch('click'), f => assert.equal(f.screen.controller.state.phase, 'idle')],
  ['choosing another preset', f => { const picker = f.q('#pg-preset'); picker.value = other.id; picker.dispatch('change'); }, f => { assert.equal(f.screen.controller.state.phase, 'idle'); assert.equal(f.q('#pg-preset').value, other.id); }],
  ['running everything again', f => f.q('#pg-run-again').dispatch('click'), f => assert.equal(runWrites(f).length, 2)],
]) test(`Pre-gig ${name} preserves an unsaved result until the user confirms discarding it`, async t => {
  const f = await mount(t); f.deniedWrites.add(RUNS); const result = await finishPreview(f);
  action(f); await settle(); assert.equal(f.confirm.open, true); assert.match(f.confirm.textContent, /has not been saved/);
  assert.equal(f.screen.controller.state.run, result); assert.equal(runWrites(f).length, 1);
  f.confirm.close('cancel'); await settle();
  assert.equal(f.screen.controller.state.run, result); assert.match(f.q('#pg-verdict').textContent, /Not saved to History/);
  assert.equal(f.q('#pg-preset').value, builtin.id); assert.equal(runWrites(f).length, 1);
  action(f); await settle(); f.confirm.close('confirm'); await settle(); afterDiscard(f);
});

test('Pre-gig a late failed History request cannot replace a newer successful read', async t => {
  const older = deferred(); let calls = 0;
  const f = await mount(t, { wrapApi: api => ({ ...api, listRuns(...args) { return ++calls === 1 ? older.promise : api.listRuns(...args); } }) });
  await f.tab('history'); assert.match(f.section.textContent, /Loading history/);
  await f.tab('check'); await f.tab('history'); assert.ok(f.q('#pg-history-empty'));
  older.reject(new Error('private old failure')); await settle();
  assert.ok(f.q('#pg-history-empty')); assert.equal(f.q('#pg-history-unavailable'), null);
  assert.doesNotMatch(f.section.textContent, /private old/); assert.equal(runWrites(f).length, 0);
});

test('Pre-gig disposal retires a pending History presentation and the Save callback', async t => {
  const pending = deferred();
  const f = await mount(t, { wrapApi: api => ({ ...api, listRuns: () => pending.promise }) });
  await f.tab('history'); const before = f.section.textContent;
  f.screen.dispose(); pending.reject(new Error('private late failure')); await settle(); await f.screen.onSave();
  assert.equal(f.section.textContent, before); assert.equal(f.document.querySelector('#toasts').textContent, '');
  assert.equal(pregigWrites(f).length, 0);
});

test('Pre-gig import retains the parsed draft after a failed save and retries without picking the file again', async t => {
  const f = await mount(t); f.deniedWrites.add(PRESETS);
  const imported = { ...builtin, name: 'Imported draft' }; delete imported.id; delete imported.builtin;
  const file = new Blob([JSON.stringify(imported)], { type: 'application/json' });
  let picks = 0; const oldClick = Element.prototype.click;
  Element.prototype.click = function () { if (this.tagName === 'INPUT' && this.type === 'file') { picks++; this.files = [file]; this.dispatch('change'); } };
  t.after(() => { if (oldClick) Element.prototype.click = oldClick; else delete Element.prototype.click; });
  await f.tab('presets'); f.q('#pg-import').dispatch('click'); await settle();
  const dialog = f.document.querySelector('.pg-dialog');
  assert.ok(dialog?.open); assert.match(dialog.textContent, /Imported draft/); assert.match(dialog.textContent, /not saved/);
  assert.equal(picks, 1); assert.equal(presetWrites(f).length, 1);
  f.deniedWrites.delete(PRESETS); const retry = dialog.querySelector('#pg-retry-import'); retry.dispatch('click'); retry.dispatch('click'); await settle();
  assert.equal(dialog.isConnected, false); assert.equal(picks, 1); assert.equal(presetWrites(f).length, 2);
  const rows = JSON.parse(f.records.get(PRESETS)); assert.equal(rows.length, 1); assert.equal(rows[0].name, 'Imported draft');
  assert.match(f.q('#pg-notice').textContent, /Imported "Imported draft"/);
});

test('Pre-gig displays future-version presets read-only without running or rewriting their contents', async t => {
  const row = { ...contract.pregig_preset_upsert.response, id: 'future', name: 'Future rig', json: { v: 7, name: 'Future rig', future: { retained: true } } };
  const raw = JSON.stringify([row], null, 2), f = await mount(t, { entries: [[PRESETS, raw]], builtins: [] });
  assert.equal(f.q('#pg-start'), null); assert.match(f.section.textContent, /needs a newer DeckChek/);
  await f.tab('presets'); const card = f.q('[data-preset="future"]');
  assert.equal(card.querySelector('[data-act="edit"]').disabled, true);
  assert.equal(card.querySelector('[data-act="duplicate"]').disabled, true);
  card.querySelector('[data-act="edit"]').dispatch('click'); card.querySelector('[data-act="duplicate"]').dispatch('click'); await settle();
  assert.equal(f.document.querySelector('.pg-dialog'), null); assert.equal(f.screen.controller.state.phase, 'idle');
  assert.equal(f.records.get(PRESETS), raw); assert.equal(presetWrites(f).length, 0);
});

async function capturePdfBridge(t) {
  const { resetPdfBackendState } = await import('../app/report-pdf.js');
  const { ensurePregigPrintable } = await import('../app/ui/workflows/pregig-report.js');
  await ensurePregigPrintable(); resetPdfBackendState();
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), previous = window.__TAURI__;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Windows PDF test seam', language: 'en-US' }, configurable: true });
  const rendered = [], destinations = [];
  window.__TAURI__ = {
    app: { getVersion: async () => 'test' },
    dialog: { save: async options => { destinations.push(options.defaultPath); return '/tmp/pregig-test.pdf'; } },
    core: { invoke: async (command, args) => { assert.equal(command, 'pdf_render'); rendered.push(args.html); return { path: args.destPath, pages: 1 }; } },
  };
  t.after(() => {
    resetPdfBackendState();
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
    if (previous) window.__TAURI__ = previous; else delete window.__TAURI__;
  });
  return { rendered, destinations };
}

test('Pre-gig PDF keeps the tested interface after the same saved preset is edited', async t => {
  const body = { ...builtin, name: 'Owned rig', audioDevice: 'Original interface' }; delete body.id; delete body.builtin;
  const row = { ...contract.pregig_preset_upsert.response, id: 'owned-rig', name: 'Owned rig', json: body };
  const f = await mount(t, { entries: [[PRESETS, JSON.stringify([row])], [LAST, JSON.stringify(row.id)]] });
  const result = await finishPreview(f); assert.ok(f.screen.controller.state.saved);
  await f.tab('presets'); f.q('[data-preset="owned-rig"]').querySelector('[data-act="edit"]').dispatch('click');
  const draft = document.querySelector('.pg-dialog'); draft.querySelector('#pg-f-device').value = 'Replacement interface';
  draft.querySelector('[data-action="save"]').dispatch('click'); await settle();
  assert.equal(JSON.parse(f.records.get(PRESETS))[0].json.audioDevice, 'Replacement interface');
  await f.tab('check'); assert.equal(f.screen.controller.state.run, result);
  const pdf = await capturePdfBridge(t); f.q('#pg-export-pdf').dispatch('click'); await settle();
  assert.equal(pdf.rendered.length, 1); assert.match(pdf.rendered[0], /Original interface/);
  assert.doesNotMatch(pdf.rendered[0], /Replacement interface/);
  assert.match(pdf.destinations[0], /original-interface/);
});

test('Pre-gig PDF preparation cannot export or announce a result retired before its handoff', async t => {
  const f = await mount(t); await finishPreview(f); const pdf = await capturePdfBridge(t);
  f.q('#pg-export-pdf').dispatch('click'); f.screen.controller.reset(); await settle();
  assert.equal(pdf.destinations.length, 0); assert.equal(pdf.rendered.length, 0);
  assert.ok(f.q('#pg-start')); assert.doesNotMatch(document.getElementById('toasts').textContent, /Creating PDF|saved as PDF/);
});
