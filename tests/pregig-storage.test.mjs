import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPregigApi } from '../app/pre-gig.js';

const contract = JSON.parse(readFileSync(new URL('./contracts/pregig.json', import.meta.url), 'utf8'));
const run = contract.pregig_save_run.request.run;
const preset = contract.pregig_preset_upsert.request.preset;
const savedRun = { ...run, id: 'kept-run' };
const savedPreset = contract.pregig_preset_upsert.response;
const RUNS = 'deckchek.pregig.runs.v1', PRESETS = 'deckchek.pregig.presets.v1';

function fixture(entries = []) {
  const records = new Map(entries), writes = [];
  let denyRead = false, denyWrite = false, nextId = 0;
  const storage = {
    getItem(key) { if (denyRead) throw new Error('private read details'); return records.get(key) ?? null; },
    setItem(key, value) { writes.push([key, value]); if (denyWrite) throw new Error('private write details'); records.set(key, value); },
  };
  const api = createPregigApi({ invoke: null, storage, now: () => '2026-11-21T13:00:00.000Z', newId: () => `new-${++nextId}` });
  return { api, records, writes, denyRead: value => { denyRead = value; }, denyWrite: value => { denyWrite = value; } };
}

const collections = [
  { name: 'runs', key: RUNS, row: savedRun, list: api => api.listRuns(), write: api => api.saveRun(run), invalid: { ...savedRun, steps: [null] } },
  { name: 'presets', key: PRESETS, row: savedPreset, list: api => api.listPresets(), write: api => api.upsertPreset({ ...preset, id: undefined }), invalid: { ...savedPreset, json: '{broken private draft' } },
];

test('browser Pre-gig treats only a confirmed absent key as an empty collection', async () => {
  const f = fixture();
  assert.deepEqual(await f.api.listRuns(), []); assert.deepEqual(await f.api.listPresets(), []);
  assert.equal(await f.api.getRun('missing'), null); assert.equal(await f.api.deletePreset('missing'), false);
  assert.equal(f.writes.length, 0);
});

for (const c of collections) {
  for (const [label, makeRaw] of [
    ['malformed JSON', () => '{private broken text'],
    ['empty text', () => ''],
    ['non-array JSON', () => '{"private":"object"}'],
    ['partly invalid rows', row => JSON.stringify([row, null])],
    ['duplicate ids', row => JSON.stringify([row, row])],
    ['invalid nested data', () => JSON.stringify([c.invalid])],
    ['unrepresentable JSON numbers', row => JSON.stringify([{ ...row, extra: 1 }]).replace('"extra":1', '"extra":1e999')],
  ]) test(`browser Pre-gig ${c.name} preserves ${label} through reads and attempted writes`, async () => {
    const raw = makeRaw(c.row), f = fixture([[c.key, raw]]);
    await assert.rejects(c.list(f.api), { code: 'PREGIG_STORAGE_INVALID' });
    await assert.rejects(c.write(f.api), error => error.code === 'PREGIG_STORAGE_INVALID' && !error.message.includes('private'));
    if (c.key === RUNS) await assert.rejects(f.api.getRun('missing'), { code: 'PREGIG_STORAGE_INVALID' });
    else await assert.rejects(f.api.deletePreset('missing'), { code: 'PREGIG_STORAGE_INVALID' });
    assert.equal(f.records.get(c.key), raw); assert.equal(f.writes.length, 0);
  });
}

test('browser Pre-gig read denial refuses every dependent mutation and recovers without replacing data', async () => {
  const entries = [[RUNS, JSON.stringify([savedRun])], [PRESETS, JSON.stringify([savedPreset])]], f = fixture(entries);
  f.denyRead(true);
  for (const act of [() => f.api.listRuns(), () => f.api.getRun(savedRun.id), () => f.api.saveRun(run), () => f.api.listPresets(), () => f.api.upsertPreset(preset), () => f.api.deletePreset(savedPreset.id)]) {
    await assert.rejects(act(), error => error.code === 'PREGIG_STORAGE_UNAVAILABLE' && !error.message.includes('private'));
  }
  assert.deepEqual([...f.records], entries); assert.equal(f.writes.length, 0);
  f.denyRead(false);
  assert.equal((await f.api.listRuns())[0].id, savedRun.id);
  assert.deepEqual(await f.api.listPresets(), [savedPreset]); assert.deepEqual([...f.records], entries);
});

for (const [name, act, verify] of [
  ['save run', api => api.saveRun(run), (f, result) => { assert.equal(JSON.parse(f.records.get(RUNS))[0].id, result.id); }],
  ['create preset', api => api.upsertPreset({ ...preset, id: undefined }), (f, result) => { assert.equal(JSON.parse(f.records.get(PRESETS)).length, 2); assert.ok(result.id); }],
  ['edit preset', api => api.upsertPreset({ ...preset, name: 'Edited rig' }), (f, result) => { assert.equal(JSON.parse(f.records.get(PRESETS))[0].name, 'Edited rig'); assert.equal(result.createdAt, savedPreset.createdAt); }],
  ['delete preset', api => api.deletePreset(savedPreset.id), (f, result) => { assert.equal(result, true); assert.deepEqual(JSON.parse(f.records.get(PRESETS)), []); }],
]) test(`browser Pre-gig ${name} reports a denied write and succeeds only after storage accepts retry`, async () => {
  const entries = [[RUNS, JSON.stringify([savedRun])], [PRESETS, JSON.stringify([savedPreset])]], f = fixture(entries);
  f.denyWrite(true);
  await assert.rejects(act(f.api), error => error.code === 'PREGIG_STORAGE_WRITE_FAILED' && !error.message.includes('private'));
  assert.deepEqual([...f.records], entries); assert.equal(f.writes.length, 1);
  f.denyWrite(false);
  const result = await act(f.api); verify(f, result);
  assert.equal(f.writes.length, 2);
});

test('browser Pre-gig refuses missing providers and missing writer methods', async () => {
  for (const storage of [null, {}]) {
    const api = createPregigApi({ invoke: null, storage });
    await assert.rejects(api.listRuns(), { code: 'PREGIG_STORAGE_UNAVAILABLE' });
    await assert.rejects(api.listPresets(), { code: 'PREGIG_STORAGE_UNAVAILABLE' });
    await assert.rejects(api.saveRun(run), { code: 'PREGIG_STORAGE_UNAVAILABLE' });
  }
  const api = createPregigApi({ invoke: null, storage: { getItem: key => JSON.stringify(key === RUNS ? [savedRun] : [savedPreset]) } });
  await assert.rejects(api.saveRun(run), { code: 'PREGIG_STORAGE_WRITE_FAILED' });
  await assert.rejects(api.upsertPreset(preset), { code: 'PREGIG_STORAGE_WRITE_FAILED' });
  await assert.rejects(api.deletePreset(savedPreset.id), { code: 'PREGIG_STORAGE_WRITE_FAILED' });
  assert.equal(await api.deletePreset('missing'), false);
});

test('browser Pre-gig does not treat a non-string undefined storage read as confirmed absence', async () => {
  const api = createPregigApi({ invoke: null, storage: { getItem: () => undefined, setItem: () => assert.fail('must not write') } });
  await assert.rejects(api.listRuns(), { code: 'PREGIG_STORAGE_INVALID' });
  await assert.rejects(api.upsertPreset(preset), { code: 'PREGIG_STORAGE_INVALID' });
});

test('native Pre-gig bypasses a throwing browser storage getter while browser errors remain typed', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let reads = 0, calls = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { reads++; throw new Error('private getter details'); } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
  const native = createPregigApi({ invoke: async () => { calls++; return { id: 'native-result' }; } });
  await native.saveRun(run); await native.listPresets();
  assert.equal(reads, 0); assert.equal(calls, 2);
  const browser = createPregigApi({ invoke: null });
  assert.equal(reads, 0, 'construction leaves the storage getter alone');
  await assert.rejects(browser.listRuns(), error => error.code === 'PREGIG_STORAGE_UNAVAILABLE' && !error.message.includes('private'));
  assert.equal(reads, 1);
});

test('browser Pre-gig preserves the newest-one-hundred retention rule and complete result details', async () => {
  const f = fixture();
  for (let i = 1; i <= 105; i++) await f.api.saveRun({ ...run, notes: `result-${i}` });
  const list = await f.api.listRuns();
  assert.equal(list.length, 100); assert.equal(list[0].id, 'new-105'); assert.equal(list.at(-1).id, 'new-6');
  const detail = await f.api.getRun(list[0].id);
  assert.equal(detail.run.notes, 'result-105'); assert.equal(detail.run.stepCount, run.steps.length);
  assert.deepEqual(detail.steps.map(({ id, runId, ...step }) => step), run.steps);
  assert.equal(await f.api.getRun('new-1'), null);
});

test('browser Pre-gig retains future preset versions and existing string-JSON records without writes', async () => {
  const future = { ...savedPreset, id: 'future', json: { v: 7, name: 'Future rig', futureField: { untouched: true } } };
  const stringRow = { ...savedPreset, id: 'string-json', json: JSON.stringify(savedPreset.json) };
  const raw = JSON.stringify([future, stringRow], null, 2), f = fixture([[PRESETS, raw]]);
  const list = await f.api.listPresets();
  assert.deepEqual(list.find(row => row.id === 'future'), future);
  assert.deepEqual(list.find(row => row.id === 'string-json'), stringRow);
  assert.equal(f.records.get(PRESETS), raw); assert.equal(f.writes.length, 0);
});

test('browser Pre-gig refuses unserializable or non-finite new data before replacing prior bytes', async () => {
  const entries = [[RUNS, JSON.stringify([savedRun])], [PRESETS, JSON.stringify([savedPreset])]], f = fixture(entries);
  const cyclic = { ...run }; cyclic.extra = cyclic;
  for (const value of [cyclic, { ...run, evidence: 1n }, { ...run, extra: Infinity }]) {
    await assert.rejects(f.api.saveRun(value), { code: 'PREGIG_DATA_INVALID' });
    assert.deepEqual([...f.records], entries);
  }
  assert.equal(f.writes.length, 0);
});
