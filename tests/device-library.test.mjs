import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, serializeIndex } from '../tools/build-device-index.mjs';
import { validateProfile, loadProfiles, groupTestsByCategory, specSummary, progressFor, latestResults, parseMethod, documentLinks, imageUrl } from '../app/devices/library.js';
import { dispatchFor, workflowPrefill, evaluateOutcome, evaluateChecklist, effectiveMidiMap, learnedControls, learnKey, inferControlType, pickMidiPort, buildDeviceReportHtml, buildResultDetail, methodLabel, midiFindings } from '../app/devices/dispatch.js';
import { createCatalogStore } from '../app/catalog-store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = path.join(ROOT, 'app', 'devices');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const PROFILES = readJson(path.join(DEV, 'index.json')).profiles.map(id => readJson(path.join(DEV, 'profiles', `${id}.json`)));
const byId = id => PROFILES.find(p => p.id === id);
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('index.json matches the profile files (run tools/build-device-index.mjs)', () => {
  const onDisk = fs.readFileSync(path.join(DEV, 'index.json'), 'utf8');
  assert.equal(onDisk, serializeIndex(buildIndex(DEV)));
  assert.equal(PROFILES.length, fs.readdirSync(path.join(DEV, 'profiles')).filter(f => f.endsWith('.json')).length);
});

test('every profile validates and every image exists', () => {
  for (const p of PROFILES) {
    const v = validateProfile(p);
    assert.deepEqual(v.errors, [], `${p.id}: ${v.errors.join('; ')}`);
    if (p.image) assert.ok(fs.existsSync(path.join(DEV, 'images', p.image.file)), `${p.id} image missing`);
    assert.equal(imageUrl(p), p.image ? `./devices/images/${p.image.file}` : null);
  }
});

test('validateProfile reports structural errors', () => {
  const bad = { schemaVersion: 1, id: 'Bad Id', manufacturer: 'x', model: 'y', summary: 's', category: 'toaster', specs: [], tests: [{ id: 'a', title: 'A', method: 'midi:dance' }, { id: 'a', title: 'B', method: 'nope:x', pass: { op: '~=', metricId: 'm' } }] };
  const v = validateProfile(bad);
  assert.equal(v.ok, false);
  for (const needle of ['kebab-case', 'unknown category', 'unknown MIDI test', 'duplicate test id', 'unknown method', 'unknown pass op']) assert.ok(v.errors.some(e => e.includes(needle)), needle);
  assert.equal(validateProfile(null).ok, false);
});

test('loadProfiles fetches the index and reports bad files without throwing', async () => {
  const files = { './devices/index.json': { profiles: ['pioneer-ddj-s8', 'broken', 'missing'] }, './devices/profiles/pioneer-ddj-s8.json': byId('pioneer-ddj-s8'), './devices/profiles/broken.json': { id: 'broken' } };
  const res = await loadProfiles({ fetchJson: async url => { if (!(url in files)) throw new Error('404'); return files[url]; } });
  assert.deepEqual(res.profiles.map(p => p.id), ['pioneer-ddj-s8']);
  assert.deepEqual(res.problems.map(p => p.id).sort(), ['broken', 'missing']);
});

test('every test in every profile dispatches to a runner', () => {
  const runners = new Set();
  for (const p of PROFILES) for (const t of p.tests) {
    const d = dispatchFor(t);
    assert.notEqual(d.runner, 'unsupported', `${p.id}/${t.id}: ${d.reason}`);
    runners.add(d.runner);
    assert.ok(methodLabel(t).length > 3);
  }
  assert.deepEqual([...runners].sort(), ['driver', 'manual', 'midi', 'software', 'timecode', 'workflow']);
});

test('dispatchFor maps methods onto workflow modes and engines', () => {
  assert.deepEqual(dispatchFor({ method: 'quick:Signal health' }).mode, 'Stereo balance');
  assert.equal(dispatchFor({ method: 'quick:Ground & hum' }).mode, 'Ground & hum isolation');
  assert.equal(dispatchFor({ method: 'speed:Pitch map' }).workflowId, 'speed');
  assert.equal(dispatchFor({ method: 'cartridge:Channel separation' }).mode, 'Channel separation');
  assert.equal(dispatchFor({ method: 'vinyl:Vinyl side scan' }).workflowId, 'vinyl');
  assert.deepEqual(dispatchFor({ method: 'midi:jog' }), { runner: 'midi', kind: 'jog' });
  assert.equal(dispatchFor({ method: 'timecode:format-check' }).runner, 'timecode');
  assert.equal(dispatchFor({ method: 'speed:Moonwalk' }).runner, 'unsupported');
  assert.deepEqual(parseMethod('quick:Signal health'), { engine: 'quick', mode: 'Signal health' });
});

test('workflowPrefill maps params onto setup fields and keeps the rest as notes', () => {
  const crss = byId('pioneer-plx-crss12');
  const map = crss.tests.find(t => t.id === 'crss12-pitch-map-8');
  const pf = workflowPrefill(map, 'Pitch map');
  assert.equal(pf.values.nominalRpm, '33.333333');
  assert.equal(pf.values.pitchPosition, '-8');
  assert.ok(pf.notes.some(([k, v]) => /Pitch positions/.test(k) && v.includes('-8, -4, 0, 4, 8')));
  const s45 = workflowPrefill({ params: { nominalRpm: 45, referenceHz: 1000, inputs: ['line', 'phono'] } }, 'Speed & pitch');
  assert.deepEqual(s45.values, { nominalRpm: '45', referenceHz: '1000' });
  assert.deepEqual(s45.notes, [['Inputs', 'line, phono']]);
});

test('evaluateOutcome: pass criteria, verdicts and findings', () => {
  const pass = { metricId: 'driver_present', op: 'equals', value: 1, unit: 'bool' };
  assert.equal(evaluateOutcome({ pass }, { measurements: [{ metricId: 'driver_present', value: 1 }] }).status, 'pass');
  assert.equal(evaluateOutcome({ pass }, { measurements: [{ metricId: 'driver_present', value: 0 }] }).status, 'fail');
  assert.equal(evaluateOutcome({ pass }, { measurements: [] }).status, 'unknown');
  assert.equal(evaluateOutcome({ pass: null }, { verdictStatus: 'pass' }).status, 'pass');
  assert.equal(evaluateOutcome({ pass: null }, { verdictStatus: 'warn' }).status, 'unknown');
  assert.equal(evaluateOutcome({ pass: null }, { verdictStatus: 'fail' }).status, 'fail');
  assert.equal(evaluateOutcome({}, { findings: [{ severity: 'error' }] }).status, 'fail');
  assert.equal(evaluateOutcome({}, { findings: [{ severity: 'warning' }] }).status, 'unknown');
  assert.equal(evaluateOutcome({}, { findings: [{ severity: 'ok' }] }).status, 'pass');
  const d = buildResultDetail({ test: { method: 'driver:check', title: 'T', pass }, outcome: { status: 'pass', detail: 'ok' }, measurements: [{ metricId: 'driver_present', label: 'Driver present', value: 1, unit: 'bool' }], findings: [{ id: 'driver-ok', severity: 'ok', title: 'fine', meaning: 'm', action: 'a' }] });
  assert.equal(d.measurements[0].value, 1);
  assert.equal(d.findings[0].id, 'driver-ok');
});

test('evaluateChecklist: problem fails, all N/A skips, unanswered blocks', () => {
  const steps = ['a', 'b', 'c'];
  assert.equal(evaluateChecklist(steps, ['ok', 'ok']).status, null);
  assert.equal(evaluateChecklist(steps, ['ok', 'na', 'ok']).status, 'pass');
  const f = evaluateChecklist(steps, ['ok', 'problem', 'ok']);
  assert.equal(f.status, 'fail');
  assert.match(f.detail, /b/);
  assert.equal(evaluateChecklist(steps, ['na', 'na', 'na']).status, 'skipped');
});

test('groupTestsByCategory, specSummary and progressFor', () => {
  const p = byId('pioneer-ddj-s8');
  const groups = groupTestsByCategory(p);
  assert.equal(groups.reduce((n, g) => n + g.tests.length, 0), p.tests.length);
  assert.equal(groups[0].category, 'driver');
  const s = specSummary(p);
  assert.equal(s.unverified, 3);
  assert.equal(s.hasUnverified, true);
  assert.equal(s.midiLearn, true);
  assert.equal(specSummary(byId('allen-heath-xone-23')).hasUnverified, false);
  const results = [
    { profileId: p.id, testId: 'ddjs8-driver', status: 'fail', createdAt: '2026-01-01' },
    { profileId: p.id, testId: 'ddjs8-driver', status: 'pass', createdAt: '2026-01-02' },
    { profileId: p.id, testId: 'ddjs8-led', status: 'skipped', createdAt: '2026-01-02' },
    { profileId: 'other', testId: 'ddjs8-jogs', status: 'fail', createdAt: '2026-01-02' },
  ];
  assert.equal(latestResults(results).get('ddjs8-driver').status, 'pass');
  const prog = progressFor(p, results);
  assert.deepEqual({ ...prog }, { total: p.tests.length, passed: 1, failed: 0, unknown: 0, skipped: 1, untested: p.tests.length - 2, done: 2 });
  const docs = documentLinks(p);
  assert.ok(docs.links.every(d => d.url.startsWith('http')));
  assert.equal(docs.missing.length, 2);
});

test('MIDI map helpers: learn, merge, port matching, findings', () => {
  const rane = byId('rane-twelve-mk2');
  const plain = effectiveMidiMap(rane.midi, null);
  assert.equal(plain.mapSource, 'learn');
  assert.equal(plain.controls.length, 0);
  assert.ok(plain.placeholders.length > 5);
  const discovered = [
    { kind: 'note', channel: 1, number: 11, count: 4, min: 0, max: 127 },
    { kind: 'cc', channel: 1, number: 33, count: 40, min: 0, max: 127, distinct: 90 },
    { kind: 'cc', channel: 1, number: 34, count: 40, min: 1, max: 127, distinct: 6 },
    { kind: 'cc', channel: 2, number: 7, count: 2, min: 0, max: 0 },
  ];
  assert.equal(inferControlType(discovered[0]), 'button');
  assert.equal(inferControlType(discovered[1]), 'knob');
  assert.equal(inferControlType(discovered[2]), 'jog');
  const labels = { [learnKey(discovered[0])]: { label: 'Play/Pause', controlId: 'play', led: true }, [learnKey(discovered[1])]: { label: 'Pitch fader', controlId: 'pitch_fader', type: 'fader' }, [learnKey(discovered[2])]: { label: 'Platter' } };
  const learned = learnedControls(discovered, labels);
  assert.deepEqual(learned.map(c => c.id), ['play', 'pitch_fader', 'platter']);
  assert.deepEqual(learned[0].message, { kind: 'note', channel: 1, number: 11, msbNumber: null, lsbNumber: null });
  assert.equal(learned[0].led, true);
  const eff = effectiveMidiMap(rane.midi, { controls: learned, updatedAt: 'x' });
  assert.equal(eff.mapSource, 'learned');
  assert.equal(eff.controls.length, 3);
  assert.equal(eff.controls.find(c => c.id === 'play').group, 'Transport', 'keeps profile metadata for known ids');
  assert.ok(!eff.placeholders.some(c => c.id === 'play'));
  assert.equal(pickMidiPort([{ name: 'Focusrite MIDI' }, { name: 'TWELVE MKII MIDI 1' }], rane), 'TWELVE MKII MIDI 1');
  assert.equal(pickMidiPort(['Other'], rane), null);
  assert.equal(midiFindings('button', { stuck: ['a'], bounces: 0 })[0].severity, 'error');
  assert.equal(midiFindings('coverage', { mode: 'map', controls: [{ id: 'a', seen: false }], unexpected: [] })[0].id, 'midi-unseen');
});

test('device report lists every test, statuses and the unverified-spec disclaimer', () => {
  const p = byId('technics-sl-1200mk4');
  const html = buildDeviceReportHtml({ profile: p, asset: { nickname: 'My SL-1200MK4', serialNumber: 'GE0001' }, results: [{ profileId: p.id, testId: p.tests[0].id, status: 'fail', createdAt: '2026-10-01T10:00:00Z', detail: { summary: 'Fail: 0.4<=0.1', measurements: [{ label: 'Pitch', value: 0.4, unit: '%' }], findings: [{ title: 'Speed off <b>', severity: 'warning' }] } }] });
  for (const t of p.tests) assert.ok(html.includes(t.title.replace(/&/g, '&amp;')), t.title);
  assert.match(html, /Unverified specifications/);
  assert.match(html, /S\/N GE0001/);
  assert.match(html, /FAIL/);
  assert.match(html, /Speed off &lt;b&gt;/);
  assert.ok(!/<script/i.test(html));
});

test('catalog-store fallback: profile sync is idempotent and creates one asset per device', async () => {
  const storage = memStorage();
  const store = createCatalogStore({ invoke: null, storage });
  const first = await store.syncDeviceProfiles(PROFILES, { createAssets: true });
  assert.equal(first.length, PROFILES.length);
  assert.ok(first.every(r => r.created && r.assetId && r.version === 1));
  const assets = await store.list('asset');
  assert.equal(assets.length, PROFILES.length);
  assert.ok(assets.some(a => a.nickname === 'My SL-1200MK4'));
  const mfrs = await store.list('manufacturer');
  assert.equal(mfrs.filter(m => m.name.toLowerCase() === 'pioneer dj').length, 1, 'manufacturer shared by Pioneer profiles');
  const second = await store.syncDeviceProfiles(PROFILES);
  assert.ok(second.every(r => !r.created && !r.changed && !r.assetId));
  assert.equal((await store.list('asset')).length, PROFILES.length);
  assert.equal((await store.list('product')).length, PROFILES.length);
  const changed = await store.syncDeviceProfiles([{ ...PROFILES[0], summary: 'changed' }, ...PROFILES.slice(1)]);
  assert.equal(changed[0].version, 2);
  const state = JSON.parse(storage.getItem('deckchek.catalog.v1'));
  assert.ok(state.productSpecs.some(s => s.provenanceType === 'manufacturer-doc'));
  assert.ok(state.productSpecs.some(s => s.provenanceType === 'research-unverified'));
});

test('catalog-store fallback: profile sync prunes retired profiles and their auto assets', async () => {
  const storage = memStorage();
  const store = createCatalogStore({ invoke: null, storage });
  const [a, b, c] = PROFILES.slice(0, 3);
  const first = await store.syncDeviceProfiles([a, b, c], { createAssets: true });
  await store.saveDeviceTestResult({ assetId: first[2].assetId, profileId: c.id, testId: 't1', status: 'pass' });
  assert.deepEqual((await store.syncDeviceProfiles([])), [], 'empty shipped set prunes nothing');
  assert.equal((await store.list('asset')).length, 3);
  await store.syncDeviceProfiles([a]);
  const assets = await store.list('asset');
  assert.deepEqual(assets.map(x => x.id), [first[0].assetId], 'unused and used-but-retired assets are hidden');
  const state = JSON.parse(storage.getItem('deckchek.catalog.v1'));
  assert.ok(!state.deviceProfiles[b.id], 'profile without results removed');
  assert.ok(state.deviceProfiles[c.id], 'profile with saved results kept for history');
  assert.ok(!state.catalog.asset.some(x => x.id === first[1].assetId), 'unused auto asset deleted');
  const retired = state.catalog.asset.find(x => x.id === first[2].assetId);
  assert.ok(retired.isDeleted && retired.retiredDate, 'asset with results is soft-deleted');
  assert.ok(!state.productSpecs.some(sp => String(sp.id).startsWith(`${b.id}:spec:`)));
  assert.equal((await store.listDeviceTestResults(first[2].assetId)).length, 1);
});

test('catalog-store fallback: device results and learned maps round trip', async () => {
  const store = createCatalogStore({ invoke: null, storage: memStorage() });
  const [synced] = await store.syncDeviceProfiles([byId('pioneer-ddj-s8')], { createAssets: true });
  const r1 = await store.saveDeviceTestResult({ assetId: synced.assetId, profileId: 'pioneer-ddj-s8', testId: 'ddjs8-driver', status: 'pass', detail: { summary: 'ok' }, sessionId: 'nope', createdAt: '2026-10-01T00:00:00Z' });
  assert.equal(r1.sessionId, null);
  await store.saveRun({ id: 'run-1', test: 'Stereo balance', createdAt: 'x', measurements: [], findings: [] });
  const r2 = await store.saveDeviceTestResult({ assetId: synced.assetId, profileId: 'pioneer-ddj-s8', testId: 'ddjs8-phones', status: 'unknown', sessionId: 'run-1', createdAt: '2026-10-02T00:00:00Z' });
  assert.equal(r2.sessionId, 'run-1');
  await assert.rejects(() => store.saveDeviceTestResult({ assetId: 'a', profileId: 'p', testId: 't', status: 'meh' }));
  const list = await store.listDeviceTestResults(synced.assetId);
  assert.deepEqual(list.map(r => r.testId), ['ddjs8-phones', 'ddjs8-driver']);
  assert.equal((await store.listDeviceTestResults('other')).length, 0);
  assert.equal(await store.getMidiMap(synced.assetId), null);
  await store.saveMidiMap(synced.assetId, 'pioneer-ddj-s8', { mapSource: 'learned', controls: [{ id: 'play' }] });
  assert.equal((await store.getMidiMap(synced.assetId)).map.controls[0].id, 'play');
});

test('catalog-store native bridge calls the device commands', async () => {
  const calls = [];
  const store = createCatalogStore({ invoke: async (cmd, args) => { calls.push([cmd, args]); return []; }, storage: memStorage() });
  await store.syncDeviceProfiles([{ id: 'x' }]);
  await store.saveDeviceTestResult({ assetId: 'a' });
  await store.listDeviceTestResults('a');
  await store.saveMidiMap('a', 'p', {});
  await store.getMidiMap('a');
  assert.deepEqual(calls.map(c => c[0]), ['wizard_has_user_data', 'device_profiles_sync', 'device_test_result_save', 'device_test_results', 'device_midi_map_save', 'device_midi_map_get']);
  assert.deepEqual(calls[3][1], { assetId: 'a' });
  assert.equal(calls[1][1].createAssets, false, 'the setup wizard owns gear creation while it is enabled');
});
