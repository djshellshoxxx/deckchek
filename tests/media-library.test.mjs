import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, serializeIndex } from '../tools/build-media-index.mjs';
import { TIMECODE_FORMATS, analyzeTimecode } from '../app/timecode.js';
import {
  validateMediaProfile, loadBuiltInMedia, listMedia, mergeCustom, expectedValuesFor, toTimecodeFormat, migrateProfile,
  prepareImport, prefillReferenceHz, suggestNominal, cmPerSToDb, profilesForSync, createMediaStore, syncBuiltInsLocal,
  emptyMediaState, listLocal, LIMITS, UNVERIFIED_WARNING, newCustomId,
} from '../app/media-library.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = path.join(ROOT, 'app', 'media');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const IDS = readJson(path.join(MEDIA, 'index.json')).profiles;
const PROFILES = IDS.map(id => readJson(path.join(MEDIA, 'profiles', `${id}.json`)));
const byId = id => PROFILES.find(p => p.id === id);
const fetchJson = async url => {
  const f = path.join(ROOT, 'app', url.replace(/^\.\//, ''));
  if (!fs.existsSync(f)) throw new Error('404');
  return readJson(f);
};
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const custom = (o = {}) => ({ schemaVersion: 1, version: 1, kind: 'test_record', name: 'My disc', confidence: 'unverified', tracks: [{ key: 'a', purpose: 'speed_tone', frequencyHz: 3150 }], timecode: null, ...o });

test('index.json is current and every built-in validates', () => {
  assert.equal(fs.readFileSync(path.join(MEDIA, 'index.json'), 'utf8'), serializeIndex(buildIndex(MEDIA)));
  assert.equal(PROFILES.length, fs.readdirSync(path.join(MEDIA, 'profiles')).length);
  for (const p of PROFILES) {
    const v = validateMediaProfile(p, { mode: 'builtin' });
    assert.deepEqual(v.errors, [], p.id);
    assert.ok(Array.isArray(p.sources) && p.sources.length, `${p.id} needs provenance`);
  }
});

test('loadBuiltInMedia loads the index and reports bad files without throwing', async () => {
  const res = await loadBuiltInMedia(fetchJson);
  assert.deepEqual(res.problems, []);
  assert.equal(res.media.length, IDS.length);
  assert.ok(res.media.every(m => m.source === 'builtin' && m.profile));
  const files = { './media/index.json': { profiles: ['serato-cv025', 'broken', 'missing'] }, './media/profiles/serato-cv025.json': byId('serato-cv025'), './media/profiles/broken.json': { id: 'broken' } };
  const bad = await loadBuiltInMedia(async u => { if (!(u in files)) throw new Error('404'); return files[u]; });
  assert.deepEqual(bad.media.map(m => m.id), ['serato-cv025']);
  assert.deepEqual(bad.problems.map(p => p.id).sort(), ['broken', 'missing']);
});

test('only facts with a source are marked confirmed; test records never claim more than unverified', () => {
  for (const p of PROFILES.filter(p => p.kind === 'test_record')) {
    assert.equal(p.confidence, 'unverified', p.id);
    for (const t of p.tracks) assert.equal(t.confidence, 'unverified', `${p.id}/${t.key}`);
  }
  assert.equal(byId('final-scratch').confidence, 'unverified');
  for (const id of ['hifi-news-test-lp', 'clearaudio-stroboscope']) assert.deepEqual(byId(id).tracks, [], `${id} has unknown track data: none invented`);
  assert.ok(!PROFILES.some(p => /technics|pioneer test/i.test(p.name)), 'Technics/Pioneer test records ship none');
});

test('validateMediaProfile rejects bad input with field paths', () => {
  const codes = (p, o) => validateMediaProfile(p, o).errors.map(e => `${e.field}:${e.code}`);
  assert.deepEqual(validateMediaProfile(custom()).errors, []);
  assert.ok(codes(custom({ name: '' })).includes('name:required'));
  assert.ok(codes(custom({ kind: 'cd' })).includes('kind:enum'));
  assert.ok(codes(custom({ confidence: 'maybe' })).includes('confidence:enum'));
  assert.ok(codes(custom({ tracks: [{ key: 'a', purpose: 'speed_tone', frequencyHz: -5 }] })).includes('tracks[0].frequencyHz:range'));
  assert.ok(codes(custom({ tracks: [{ key: 'a', purpose: 'nope' }] })).includes('tracks[0].purpose:enum'));
  assert.ok(codes(custom({ tracks: [{ key: 'a', purpose: 'other' }, { key: 'a', purpose: 'other' }] })).includes('tracks[1].key:duplicate'));
  assert.ok(codes(custom({ tracks: [{ key: 'a', purpose: 'other', level: { value: 1, unit: 'furlong' } }] })).includes('tracks[0].level.unit:enum'));
  assert.ok(codes(custom({ sources: [{ title: 'x', url: 'http://insecure.example', verified: false }] })).includes('sources[0].url:url'));
  assert.ok(codes(custom({ tracks: [{ key: 'a', purpose: 'other', source: 'javascript:alert(1)' }] })).includes('tracks[0].source:url'));
  assert.ok(codes(custom({ tracks: Array.from({ length: 101 }, (_, i) => ({ key: `k${i}`, purpose: 'other' })) })).includes('tracks:too-many'));
  assert.ok(codes(custom({ name: 'x'.repeat(501) })).includes('name:too-long'));
  assert.ok(codes(custom({ kind: 'timecode' })).includes('timecode.formatName:required'));
  assert.ok(codes(custom({ timecode: { formatName: 'x' } })).includes('timecode:not-timecode'));
  assert.ok(codes(null).includes(':type'));
  assert.ok(codes(custom({ id: '../../etc/passwd' })).includes('id:id'));
  assert.ok(codes(custom({ id: 'serato-cv025' }), { builtinIds: ['serato-cv025'] }).includes('id:id-collision'));
});

test('built-in rules: confirmed needs provenance, timecode facts are not duplicated', () => {
  const b = o => ({ ...custom({ id: 'x-1' }), ...o });
  assert.ok(validateMediaProfile(b({ confidence: 'confirmed' }), { mode: 'builtin' }).errors.some(e => e.code === 'provenance'));
  const tcp = { ...byId('serato-cv025'), timecode: { formatName: 'Serato CV02.5', carrierHz: 1000 } };
  assert.ok(validateMediaProfile(tcp, { mode: 'builtin' }).errors.some(e => e.code === 'duplicated-format-fact'));
  const unk = { ...byId('serato-cv025'), timecode: { formatName: 'Nope' } };
  assert.ok(validateMediaProfile(unk, { mode: 'builtin' }).errors.some(e => e.code === 'unknown-format'));
});

// AC-5
test('AC-5: invalid import fails with a field-error list and returns no profile', () => {
  const r = prepareImport(JSON.stringify({ schemaVersion: 1, version: 1, kind: 'zzz', name: '', confidence: 'unverified', tracks: [{ key: 'a', purpose: 'bad', frequencyHz: -1 }] }));
  assert.equal(r.ok, false);
  assert.equal(r.profile, undefined);
  const fields = r.errors.map(e => e.field);
  for (const f of ['kind', 'name', 'tracks[0].purpose', 'tracks[0].frequencyHz']) assert.ok(fields.includes(f), f);
  assert.equal(prepareImport('{nope').errors[0].code, 'json');
  assert.equal(prepareImport('x'.repeat(LIMITS.maxJsonBytes + 1)).errors[0].code, 'too-large');
  assert.equal(prepareImport(JSON.stringify({ ...custom(), schemaVersion: 9 })).errors[0].code, 'schema-version');
});

test('import never keeps a user-supplied id, and built-in ids are rejected as id-collision', () => {
  const ok = prepareImport(JSON.stringify(custom({ id: 'somewhere/../evil' })), { makeId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  assert.equal(ok.ok, true);
  assert.equal(ok.profile.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const col = prepareImport(JSON.stringify(custom({ id: 'serato-cv025' })), { builtinIds: ['serato-cv025'] });
  assert.equal(col.ok, false);
  assert.ok(col.errors.some(e => e.code === 'id-collision'));
  const edit = '11111111-1111-4111-8111-111111111111';
  assert.equal(prepareImport(JSON.stringify(custom({ id: edit })), { existingCustomIds: [edit] }).profile.id, edit);
  assert.match(newCustomId(), /^[0-9a-f-]{36}$/);
});

test('migrateProfile: current is a no-op, newer is refused, a stub chain upgrades', () => {
  const p = custom();
  assert.deepEqual(migrateProfile(p), { ok: true, profile: p });
  assert.equal(migrateProfile({ ...p, schemaVersion: 2 }).ok, false);
  const r = migrateProfile(p, { target: 3, migrations: { 1: x => ({ ...x, a: 1 }), 2: x => ({ ...x, b: 2 }) } });
  assert.equal(r.profile.schemaVersion, 3);
  assert.equal(r.profile.a + r.profile.b, 3);
  assert.equal(migrateProfile(p, { target: 2, migrations: {} }).ok, false);
});

// AC-2
test('AC-2: unverified media prefill but carry the "confirm on your disc" flag', () => {
  const ev = expectedValuesFor({ profile: byId('ortofon-test-record') }, 't5', 'speed');
  assert.equal(ev.referenceHz, 1000);
  assert.equal(ev.levelCmPerS, 5);
  assert.equal(ev.unverified, true);
  assert.equal(ev.warning, UNVERIFIED_WARNING);
  assert.equal(ev.label, 'From Ortofon Stereo Test Record · track 5 · 1000 Hz · 5 cm/s');
  // a sweep track supplies no reference frequency: nothing invented
  const sweep = expectedValuesFor({ profile: byId('ortofon-test-record') }, 't1', 'speed');
  assert.equal(sweep.referenceHz, undefined);
  assert.equal(sweep.unverified, true);
  assert.equal(expectedValuesFor({ profile: byId('ortofon-test-record') }, 'nope', 'speed'), null);
  const t9 = expectedValuesFor({ profile: byId('ortofon-test-record') }, 't9', 'cartridge');
  assert.equal(t9.referenceHz, 315);
  assert.equal(t9.levelCmPerS, undefined);
  assert.match(t9.label, /50 µm peak/);
  // verified custom data is not flagged
  const c = expectedValuesFor(custom({ confidence: 'confirmed', tracks: [{ key: 'a', purpose: 'speed_tone', frequencyHz: 3150, confidence: 'confirmed' }] }), 'a', 'speed');
  assert.equal(c.unverified, false);
  assert.equal(c.warning, null);
});

test('medium kind must fit the test', () => {
  assert.equal(expectedValuesFor({ profile: byId('ortofon-test-record') }, 't5', 'dvs'), null);
  assert.equal(expectedValuesFor({ profile: byId('serato-cv025') }, null, 'cartridge'), null);
  assert.ok(expectedValuesFor({ profile: byId('serato-cv025') }, null, 'dvs'));
});

// AC-3
test('AC-3: Serato CV02.5 selects format "Serato CV02.5" with a 1000 Hz carrier and feeds analyzeTimecode', () => {
  const m = { profile: byId('serato-cv025') };
  const ev = expectedValuesFor(m, null, 'dvs');
  assert.equal(ev.formatName, 'Serato CV02.5');
  assert.equal(ev.carrierHz, 1000);
  assert.equal(ev.nominalRpm, 33.333333);
  assert.equal(ev.confidence, 'confirmed');
  assert.equal(ev.unverified, false);
  const fmt = toTimecodeFormat(m);
  assert.deepEqual(fmt, TIMECODE_FORMATS.find(f => f.name === 'Serato CV02.5'));
  const sr = 48000, n = sr * 0.5, left = new Float32Array(n), right = new Float32Array(n);
  for (let i = 0; i < n; i++) { const ph = 2 * Math.PI * 1000 * i / sr; left[i] = 0.5 * Math.sin(ph); right[i] = 0.5 * Math.cos(ph); }
  const res = analyzeTimecode({ left, right, sampleRate: sr }, { format: fmt });
  assert.equal(res.format.name, 'Serato CV02.5');
  assert.ok(Math.abs(res.expectedCarrierHz - 1000) < 1e-9);
});

test('timecode media agree with TIMECODE_FORMATS (carrier, rpm, confidence, sides); MK1 equals its entry', () => {
  const tcMedia = PROFILES.filter(p => p.kind === 'timecode');
  assert.equal(tcMedia.length, 10);
  for (const p of tcMedia) {
    const ref = TIMECODE_FORMATS.find(f => f.name === p.timecode.formatName);
    assert.ok(ref, p.id);
    assert.deepEqual(toTimecodeFormat(p), ref, p.id);
    const ev = expectedValuesFor({ profile: p }, null, 'timecode');
    assert.equal(ev.carrierHz, ref.carrierHz);
    assert.equal(ev.unverified, ref.confidence !== 'confirmed' || p.confidence !== 'confirmed', p.id);
  }
  assert.deepEqual(toTimecodeFormat(byId('traktor-scratch-mk1')), TIMECODE_FORMATS.find(f => f.name === 'Traktor Scratch MK1'));
  // xwax-confirmed carriers (docs/specs/06 section 6 table)
  const carriers = Object.fromEntries(tcMedia.map(p => [p.id, expectedValuesFor({ profile: p }, null, 'dvs').carrierHz]));
  assert.deepEqual(carriers, { 'algoriddim-djay': 1000, 'final-scratch': 1200, 'mixvibes-7inch': 1300, 'mixvibes-dvs-v2': 1300, 'rekordbox-rb-vs1': 1000, 'serato-cd': 1000, 'serato-cv025': 1000, 'traktor-scratch-mk1': 2000, 'traktor-scratch-mk2': 2500, 'traktor-scratch-mk2-cd': 3000 });
  assert.equal(expectedValuesFor({ profile: byId('final-scratch') }, null, 'dvs').unverified, true);
  assert.equal(expectedValuesFor({ profile: byId('final-scratch') }, null, 'speed').referenceHz, 1200);
});

test('custom timecode media may bring their own carrier; unknown format gives no invented values', () => {
  const m = custom({ kind: 'timecode', tracks: [], timecode: { formatName: 'My DVS', carrierHz: 1500 } });
  const fmt = toTimecodeFormat(m);
  assert.equal(fmt.carrierHz, 1500);
  assert.equal(fmt.confidence, 'unverified');
  assert.equal(expectedValuesFor(m, null, 'dvs').unverified, true);
  const unk = custom({ kind: 'timecode', tracks: [], timecode: { formatName: 'Nonexistent' } });
  assert.equal(toTimecodeFormat(unk), null);
  const ev = expectedValuesFor(unk, null, 'dvs');
  assert.equal(ev.carrierHz, undefined);
  assert.equal(ev.unverified, true);
});

test('prefill precedence: user > medium > device > default', () => {
  const expected = { referenceHz: 3150 };
  assert.deepEqual(prefillReferenceHz({ override: 3000, expected, deviceReferenceHz: 1000 }), { hz: 3000, source: 'user' });
  assert.deepEqual(prefillReferenceHz({ expected, deviceReferenceHz: 1000 }), { hz: 3150, source: 'medium' });
  assert.deepEqual(prefillReferenceHz({ expected: { }, deviceReferenceHz: 3000 }), { hz: 3000, source: 'device' });
  assert.deepEqual(prefillReferenceHz({}), { hz: 1000, source: 'default' });
  assert.deepEqual(prefillReferenceHz({ override: -1, expected: { referenceHz: NaN } }), { hz: 1000, source: 'default' });
});

test('suggestNominal: 1% window, never suggests the selected nominal', () => {
  assert.equal(suggestNominal(3148, { currentHz: 3000 }).hz, 3150);
  assert.match(suggestNominal(3148, { currentHz: 3000 }).message, /Looks like a 3150 Hz record/);
  assert.equal(suggestNominal(3003, { currentHz: 3150 }).hz, 3000);
  assert.equal(suggestNominal(3150, { currentHz: 3150 }), null);
  assert.equal(suggestNominal(3100, { currentHz: 3000 }), null);
  assert.equal(suggestNominal(1004, { currentHz: 3150 }).hz, 1000);
  assert.equal(suggestNominal(3180, { currentHz: 3000, tolerance: 0.02 }).hz, 3150);
  assert.equal(suggestNominal(NaN), null);
});

test('level conversion re 5 cm/s', () => {
  assert.equal(cmPerSToDb(5), 0);
  assert.ok(Math.abs(cmPerSToDb(10) - 6.0206) < 1e-3);
});

test('listMedia filters, searches and floats owned entries to the top', () => {
  const entries = PROFILES.map(p => ({ id: p.id, source: 'builtin', kind: p.kind, name: p.name, owned: p.id === 'serato-cd', retired: false, profile: p }));
  entries.push({ id: 'c1', source: 'custom', kind: 'test_record', name: 'Zed', owned: false, retired: false, profile: custom() });
  entries.push({ id: 'old', source: 'builtin', kind: 'test_record', name: 'Old', retired: true, profile: custom() });
  assert.equal(listMedia(entries)[0].id, 'serato-cd');
  assert.ok(!listMedia(entries).some(m => m.id === 'old'));
  assert.ok(listMedia(entries, { includeRetired: true }).some(m => m.id === 'old'));
  assert.ok(listMedia(entries, { kind: 'timecode' }).every(m => m.kind === 'timecode'));
  assert.deepEqual(listMedia(entries, { kind: 'custom' }).map(m => m.id), ['c1']);
  assert.deepEqual(listMedia(entries, { owned: true }).map(m => m.id), ['serato-cd']);
  assert.deepEqual(listMedia(entries, { query: 'ortofon' }).map(m => m.id), ['ortofon-test-record']);
  assert.ok(listMedia(entries, { query: 'traktor' }).length >= 3);
});

test('mergeCustom: a custom entry cannot shadow a built-in', () => {
  const b = [{ id: 'serato-cv025', source: 'builtin' }];
  const merged = mergeCustom(b, [{ id: 'serato-cv025', source: 'custom' }, { id: 'u1', source: 'custom' }]);
  assert.deepEqual(merged.map(m => `${m.id}:${m.source}`), ['serato-cv025:builtin', 'u1:custom']);
});

test('profilesForSync attaches resolved timecode sides (xwax lengths / resolution)', () => {
  const out = profilesForSync([{ profile: byId('serato-cv025') }, { profile: byId('ortofon-test-record') }, { profile: byId('final-scratch') }]);
  const sides = out[0].timecodeFacts.sides;
  assert.deepEqual(sides.map(s => s.label), ['A', 'B']);
  assert.ok(Math.abs(sides[0].durationSec / 60 - 11.87) < 0.01);
  assert.ok(Math.abs(sides[1].durationSec / 60 - 15.37) < 0.01);
  assert.equal(out[0].timecodeFacts.carrierHz, 1000);
  assert.equal(out[1].timecodeFacts, undefined);
  assert.deepEqual(out[2].timecodeFacts.sides, []);
});

// AC-7 (browser store parity with Rust)
test('AC-7: a newer built-in updates, custom media/ownership untouched, removed built-ins retire', async () => {
  const storage = mem();
  const store = createMediaStore({ storage });
  const { media } = await loadBuiltInMedia(fetchJson);
  let r = await store.syncBuiltIns(media);
  assert.equal(r.inserted, media.length);
  const saved = await store.saveCustom(custom({ name: 'Mine' }));
  assert.equal(saved.ok, true);
  await store.setOwned(saved.id, true);
  await store.setOwned('ortofon-test-record', true);
  r = await store.syncBuiltIns(media);
  assert.deepEqual([r.inserted, r.updated, r.unchanged], [0, 0, media.length]);
  const bumped = media.map(m => m.id === 'ortofon-test-record' ? { ...m, profile: { ...m.profile, version: 2, name: 'Ortofon v2' } } : m).filter(m => m.id !== 'hifi-news-test-lp');
  r = await store.syncBuiltIns(bumped);
  assert.equal(r.updated, 1);
  assert.equal(r.retired, 1);
  const list = await store.list();
  assert.equal(list.find(m => m.id === 'ortofon-test-record').profile.version, 2);
  assert.ok(list.find(m => m.id === 'ortofon-test-record').owned);
  assert.ok(!list.some(m => m.id === 'hifi-news-test-lp'));
  assert.ok((await store.list({ includeRetired: true })).some(m => m.id === 'hifi-news-test-lp' && m.retired));
  const mine = list.find(m => m.id === saved.id);
  assert.equal(mine.profile.name, 'Mine');
  assert.ok(mine.owned);
  // empty shipped list (library failed to load) retires nothing
  const state = emptyMediaState();
  syncBuiltInsLocal(state, [byId('serato-cd')]);
  assert.equal(syncBuiltInsLocal(state, []).retired, 0);
  assert.equal(listLocal(state).length, 1);
  // persisted: a new store over the same storage sees everything
  assert.ok((await createMediaStore({ storage }).list()).some(m => m.id === saved.id));
});

test('store: custom CRUD, export round trip, built-in ids rejected', async () => {
  const store = createMediaStore({ storage: mem() });
  await store.syncBuiltIns((await loadBuiltInMedia(fetchJson)).media);
  const bad = await store.saveCustom(custom({ id: 'ortofon-test-record' }));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => e.code === 'id-collision'));
  const invalid = await store.saveCustom(custom({ tracks: [{ key: 'a', purpose: 'x' }] }));
  assert.equal(invalid.ok, false);
  const a = await store.saveCustom(custom({ name: 'A' }));
  const edit = await store.saveCustom(custom({ id: a.id, name: 'A2' }));
  assert.equal(edit.id, a.id);
  const listed = (await store.list()).filter(m => m.source === 'custom');
  assert.equal(listed.length, 1);
  const text = store.exportCustom(listed[0].profile);
  assert.ok(!text.includes('updatedAt'));
  const re = prepareImport(text, { builtinIds: ['ortofon-test-record'], existingCustomIds: [] });
  assert.equal(re.ok, true);
  assert.notEqual(re.profile.id, a.id, 'import creates a new custom medium');
  await store.deleteCustom(a.id);
  assert.equal((await store.list()).filter(m => m.source === 'custom').length, 0);
});

test('native mode calls the Rust commands with camelCase args', async () => {
  const calls = [];
  const store = createMediaStore({ invoke: async (cmd, args) => { calls.push([cmd, args]); return cmd === 'media_list' ? [] : { inserted: 0, updated: 0, unchanged: 0 }; } });
  await store.syncBuiltIns([{ profile: byId('serato-cv025') }]);
  await store.setOwned('x', true);
  await store.deleteCustom('y');
  assert.equal(calls[0][0], 'media_profiles_sync');
  assert.equal(calls[0][1].profiles[0].timecodeFacts.carrierHz, 1000);
  assert.deepEqual(calls[1], ['media_owned_set', { mediaId: 'x', owned: true }]);
  assert.deepEqual(calls[2], ['media_custom_delete', { id: 'y' }]);
});

test('GAP-04: every built-in timecode medium maps onto a format the DVS form offers (medium sets the decoder format)', async () => {
  const { PARAMS } = await import('../app/ui/workflows/definitions.js');
  const { timecodeFormatChoice } = await import('../app/ui/media-picker.js');
  const param = PARAMS.find(p => p.id === 'timecodeFormat');
  assert.ok(param && param.modes.includes('DVS signal'));
  assert.deepEqual(param.options[0], ['', 'Auto-detect']);
  const field = { options: param.options.map(([value]) => ({ value })) };
  for (const p of PROFILES.filter(x => x.kind === 'timecode')) {
    const expected = expectedValuesFor(p, null, 'dvs');
    assert.equal(timecodeFormatChoice(field, expected), toTimecodeFormat(p).name, p.id);
  }
  assert.equal(timecodeFormatChoice(field, { formatName: 'Unknown DVS' }), null);
  assert.equal(timecodeFormatChoice(null, { formatName: 'Serato CV02.5' }), null);
});
