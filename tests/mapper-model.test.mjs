// FS-32 neutral model, validation, learned-map conversion, reports and the browser-mode store.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createModel, sanitizeModel, normalizeModel, parseJsonFile, midiFromBytes, addLearnedControl, updateControl, removeControl,
  modelStats, controlIdFor, statusByte, cleanText, LIMITS, MODEL_VERSION,
} from '../app/mapper/model.js';
import { validateModel, checkExportSize, MAX_EXPORT_BYTES } from '../app/mapper/validate.js';
import { learnedToModel, midiFromMessage } from '../app/mapper/from-learned.js';
import { suggestFunction, deckFromWords, describeFunction, functionToken, parseFunctionToken, normalizeFunction, valueKind, defaultMode, TARGETS } from '../app/mapper/vocabulary.js';
import { traktorReport, mdCell } from '../app/mapper/traktor-report.js';
import { seratoReport, SERATO_STATUS } from '../app/mapper/serato.js';
import { createMapperStore, checkSavable, LOCAL_KEY } from '../app/mapper/store.js';

const fx = name => fs.readFileSync(new URL(`./fixtures/mapper/${name}`, import.meta.url), 'utf8');
const learned = () => JSON.parse(fx('learned-map.json'));
const btn = (number, fn, extra = {}) => ({ label: `B${number}`, midi: { type: 'note', channel: 1, number }, kind: 'button', layer: 'base', function: fn, ...extra });

// ------------------------------------------------------------------ model

test('sanitizeModel keeps valid controls, drops unusable ones and caps lists (untrusted JSON)', () => {
  const { model, warnings, readOnly } = sanitizeModel({ version: 1, name: '  My\u0000 map  ', decks: 9, controls: [
    btn(11, { id: 'play', deck: 1 }), { label: 'no midi' }, null, 'x', { midi: { type: 'sysex', channel: 1, number: 1 } },
    { label: 'cc14', midi: { type: 'cc14', channel: 2, number: 3 }, kind: 'absolute', function: { id: 'volume', deck: 2 } },
    { label: 'f', midi: { type: 'cc', channel: 1, number: 4 }, function: { id: 'nonsense' }, feedback: { led: { type: 'x' } }, custom: { target: 'evil' } },
  ] });
  assert.equal(readOnly, false);
  assert.equal(model.name, 'My map');
  assert.equal(model.decks, 2, 'out-of-range decks fall back');
  assert.equal(model.controls.length, 3);
  assert.equal(model.controls[1].midi.lsbNumber, 35, 'cc14 LSB defaults to MSB + 32');
  assert.equal(model.controls[2].function, null);
  assert.equal(model.controls[2].feedback, null);
  assert.equal(model.controls[2].custom, undefined);
  assert.ok(warnings.some(w => /4 controls have no usable MIDI/.test(w)));
  const many = sanitizeModel({ version: 1, controls: Array.from({ length: LIMITS.maxControls + 5 }, (_, i) => ({ midi: { type: 'cc', channel: 1 + (i % 16), number: i % 128 } })) });
  assert.equal(many.model.controls.length, LIMITS.maxControls);
  assert.ok(many.warnings.some(w => /first 2048/.test(w)));
  for (const bad of [null, [], 'x', { controls: [] }, { version: 0 }, { version: 'one' }]) assert.equal(sanitizeModel(bad).model, null);
});

test('a model from a newer DeckChek is read-only with a warning (FS-32 §5)', () => {
  const r = sanitizeModel({ version: MODEL_VERSION + 1, name: 'future', controls: [] });
  assert.equal(r.readOnly, true);
  assert.ok(/newer DeckChek/.test(r.warnings[0]));
});

test('normalisation sorts by (layer, status, number) and derives stable ids from the MIDI triple', () => {
  const m = createModel({ name: 'n' });
  m.controls = [
    { label: 'z', midi: { type: 'cc', channel: 2, number: 5 }, layer: 'shift', function: { id: 'volume', deck: 1 } },
    { label: 'a', midi: { type: 'cc', channel: 1, number: 9 }, function: { id: 'volume', deck: 1 } },
    btn(3, { id: 'hotcue', deck: 1, args: { n: '4', action: 'set', junk: 1 } }),
  ];
  const n = normalizeModel(m);
  assert.deepEqual(n.controls.map(c => c.id), ['c-note-1-3', 'c-cc-1-9', 'c-cc-2-5-shift']);
  assert.deepEqual(n.controls[0].function, { id: 'hotcue', deck: 1, args: { action: 'set', n: 4 } });
  assert.equal(n.controls[0].mode, 'momentary');
  assert.equal(controlIdFor({ type: 'cc14', channel: 1, number: 0 }), 'c-cc-1-0');
  assert.equal(statusByte('note', 16), 0x9f);
  assert.equal(statusByte('cc', 1), 0xb0);
});

test('parseJsonFile tells models from learned maps and reports bad JSON with a position', () => {
  assert.equal(parseJsonFile(fx('learned-map.json')).kind, 'learned');
  assert.equal(parseJsonFile(fx('golden-model.json')).kind, 'model');
  assert.equal(parseJsonFile(JSON.stringify(learned().map)).kind, 'learned');
  const bad = parseJsonFile('{\n  "a": 1,\n  oops\n}');
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'JSON_SYNTAX');
  assert.equal(parseJsonFile('[1,2]').error.code, 'JSON_SHAPE');
  assert.equal(parseJsonFile('x'.repeat(LIMITS.maxImportBytes + 1)).error.code, 'TOO_LARGE');
  assert.equal(parseJsonFile(42).ok, false);
});

test('learning: raw MIDI bytes become controls; edits are immutable and keep ids unique', () => {
  assert.deepEqual(midiFromBytes([0x91, 11, 127]), { type: 'note', channel: 2, number: 11, status: 0x91 });
  assert.deepEqual(midiFromBytes([0x82, 11, 0]), { type: 'note', channel: 3, number: 11, status: 0x92 });
  assert.equal(midiFromBytes([0xb0, 7, 64]).type, 'cc');
  assert.equal(midiFromBytes([0xf8]), null);
  assert.equal(midiFromBytes([0xf0, 1, 0xf7]), null);
  let m = createModel();
  const a = addLearnedControl(m, midiFromBytes([0x90, 11, 127]));
  assert.ok(a.added);
  const again = addLearnedControl(a.model, midiFromBytes([0x90, 11, 0]));
  assert.equal(again.added, false, 'same message is not learned twice');
  assert.equal(m.controls.length, 0, 'original untouched');
  m = addLearnedControl(a.model, midiFromBytes([0x90, 12, 127])).model;
  const u = updateControl(m, 'c-note-1-12', { label: 'Cue', function: { id: 'cue', deck: 1 } });
  assert.equal(u.model.controls[1].label, 'Cue');
  assert.equal(u.model.controls[1].mode, 'momentary');
  const moved = updateControl(u.model, 'c-note-1-12', { midi: { type: 'note', channel: 1, number: 11 } });
  assert.deepEqual(moved.model.controls.map(c => c.id).sort(), ['c-note-1-11', 'c-note-1-11~2']);
  const cleared = updateControl(u.model, 'c-note-1-12', { function: null });
  assert.equal(cleared.model.controls[1].function, null);
  assert.equal(removeControl(u.model, 'c-note-1-12').controls.length, 1);
  assert.deepEqual(modelStats(u.model), { total: 2, assigned: 1, custom: 0, unassigned: 1 });
  assert.equal(cleanText('a\u2028b\nc'), 'a b c');
});

// ------------------------------------------------------------------ vocabulary

test('vocabulary: tokens round-trip, descriptions and kinds are consistent', () => {
  const fn = normalizeFunction({ id: 'fx', deck: 2, args: { action: 'param', unit: 3, param: 2 } });
  assert.deepEqual(fn, { id: 'fx', deck: null, args: { action: 'param', unit: 3, param: 2 } }, 'fx param is not deck-scoped');
  assert.equal(functionToken(fn), 'fx_param_3_2');
  assert.deepEqual(parseFunctionToken('fx_param_3_2'), fn);
  assert.deepEqual(parseFunctionToken('hotcue_d1_set_3'), { id: 'hotcue', deck: 1, args: { action: 'set', n: 3 } });
  for (const t of ['nope', 'play', 'hotcue_d1_set_9', 'crossfader_d1', 'play_d1_extra', 'loop_d1_auto']) assert.equal(parseFunctionToken(t), null, t);
  assert.equal(describeFunction({ id: 'hotcue', deck: 2, args: { action: 'set', n: 3 } }), 'Deck 2 hot cue 3 (set)');
  assert.equal(describeFunction(null), 'Unassigned');
  assert.equal(valueKind({ id: 'jog', args: { action: 'touch' } }), 'button');
  assert.equal(defaultMode({ id: 'play', args: {} }), 'toggle');
  assert.deepEqual(TARGETS.map(t => `${t.label}:${t.status}`), ['Mixxx:Supported', 'VirtualDJ:Supported', 'Serato:Experimental', 'Traktor:Report only']);
});

test('suggestions come from words and profile types, not from a model name', () => {
  const s = (label, type, group = '') => suggestFunction({ label, type, group });
  assert.deepEqual(s('PLAY/PAUSE', 'button'), { id: 'play', args: {} });
  assert.deepEqual(s('Hot Cue 3', 'pad'), { id: 'hotcue', args: { action: 'activate', n: 3 } });
  assert.deepEqual(s('Headphone cue', 'button'), { id: 'pfl', args: {} });
  assert.deepEqual(s('Pitch fader', 'fader'), { id: 'pitch', args: {} });
  assert.equal(s('Pitch range button', 'button'), null);
  assert.deepEqual(s('Platter touch', 'jog-touch'), { id: 'jog', args: { action: 'touch' } });
  assert.deepEqual(s('', 'platter'), { id: 'jog', args: { action: 'rotate' } });
  assert.deepEqual(s('Hi EQ', 'knob'), { id: 'eq', args: { band: 'hi' } });
  assert.deepEqual(s('FX 2 Dry/Wet', 'knob'), { id: 'fx', args: { action: 'drywet', unit: 2 } });
  assert.deepEqual(s('Browse push', 'button'), { id: 'browse', args: { action: 'press' } });
  assert.equal(s('Mystery knob', 'knob'), null);
  assert.equal(deckFromWords('Deck 2 Play'), 2);
  assert.equal(deckFromWords('CH3 fader'), 3);
  assert.equal(deckFromWords('Left jog'), 1);
  assert.equal(deckFromWords('Deck B'), 2);
  assert.equal(deckFromWords('Master'), null);
});

// ------------------------------------------------------------------ learned map -> model

test('AC-7: a learned map with no official profile becomes an editable model', () => {
  const m = learnedToModel(learned(), null);
  assert.equal(m.provenance.source, 'learned');
  assert.equal(m.decks, 2);
  assert.equal(m.controls.length, 16, 'the sysex display is skipped');
  const by = label => m.controls.filter(c => c.label === label);
  assert.deepEqual(by('Deck 1 Play')[0].function, { id: 'play', deck: 1, args: {} });
  assert.deepEqual(by('Deck 1 Play')[0].feedback.led, { type: 'note', channel: 1, number: 11, on: 127, off: 0 });
  assert.deepEqual(by('Deck 2 Play')[0].function, { id: 'play', deck: 2, args: {} });
  assert.deepEqual(by('Deck 1 Tempo')[0].midi, { type: 'cc14', channel: 1, number: 0, status: 0xb0, lsbNumber: 32 });
  assert.equal(by('Deck 1 Tempo')[0].function.id, 'pitch');
  assert.equal(by('Deck 1 Jog')[0].kind, 'relative');
  assert.equal(by('Deck 1 Jog')[0].midi.encoding, 'relative-two-complement');
  assert.deepEqual(by('Deck 1 Jog touch')[0].function.args, { action: 'touch' });
  assert.deepEqual(by('Deck 1 Pad 2')[0].function, { id: 'hotcue', deck: 1, args: { action: 'activate', n: 2 } });
  assert.deepEqual(by('Deck 1 Loop in')[0].function.args, { action: 'in' });
  assert.equal(by('Deck 2 Channel fader')[0].function.id, 'volume');
  assert.equal(by('Shift')[0].function.id, 'shift');
  const shifted = by('Shift + Deck 1 Sync')[0];
  assert.equal(shifted.layer, 'shift');
  assert.deepEqual(shifted.function, { id: 'sync', deck: 1, args: {} });
  assert.equal(by('Crossfader')[0].function.id, 'crossfader');
  assert.equal(by('Mystery knob')[0].function, null, 'unrecognised controls stay unassigned');
  assert.deepEqual(validateModel(m).errors, [], 'a learned map validates');
  assert.deepEqual(modelStats(m), { total: 16, assigned: 15, custom: 0, unassigned: 1 });
});

test('learned map merges over published profile controls and works for any profile', () => {
  const profile = { id: 'acme-x1', manufacturer: 'Acme', model: 'X1', midi: { mapSource: 'https://example.invalid', controls: [
    { id: 'a_play', label: 'PLAY', group: 'Deck A', type: 'button', message: { kind: 'note', channel: 1, number: 1 } },
    { id: 'b_play', label: 'PLAY', group: 'Deck B', type: 'button', message: { kind: 'note', channel: 2, number: 1 } },
    { id: 'placeholder', label: 'Pitch', type: 'fader', message: null },
  ] } };
  const m = learnedToModel(null, profile);
  assert.equal(m.name, 'Acme X1');
  assert.equal(m.provenance.source, 'profile');
  assert.deepEqual(m.controls.map(c => [c.function?.id, c.function?.deck]), [['play', 1], ['play', 2]]);
  const relearn = learnedToModel({ map: { controls: [{ id: 'a_play', label: 'Deck A Play', message: { kind: 'note', channel: 1, number: 5 } }] } }, profile);
  assert.deepEqual(relearn.controls.map(c => c.midi.number).sort(), [1, 5], 'learned message replaces the published one for that id');
  assert.deepEqual(learnedToModel({}, null).controls, []);
  assert.deepEqual(learnedToModel({ map: { controls: 'junk' } }, { midi: { controls: [null, 1] } }).controls, []);
  assert.equal(midiFromMessage({ kind: 'sysex', channel: 1 }), null);
  assert.deepEqual(midiFromMessage({ kind: 'cc14', channel: 1, number: 3 }), { type: 'cc14', channel: 1, number: 3, lsbNumber: 35 });
});

// ------------------------------------------------------------------ validation

test('AC-4: the same status+data1 bound twice blocks export and names both controls', () => {
  const m = createModel({ name: 'dup' });
  m.controls = [btn(11, { id: 'play', deck: 1 }, { label: 'Play' }), btn(11, { id: 'cue', deck: 1 }, { label: 'Cue' }), btn(12, { id: 'sync', deck: 1 })];
  const s = sanitizeModel(m).model;
  const { errors } = validateModel(s);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'DUPLICATE_BINDING');
  assert.deepEqual(errors[0].controlIds, ['c-note-1-11', 'c-note-1-11~2']);
  assert.ok(/Play, Cue/.test(errors[0].message));
  // a 14-bit control's LSB also occupies its number
  s.controls = sanitizeModel({ version: 1, controls: [{ midi: { type: 'cc14', channel: 1, number: 0, lsbNumber: 32 }, function: { id: 'pitch', deck: 1 } }, { midi: { type: 'cc', channel: 1, number: 32 }, function: { id: 'volume', deck: 1 } }] }).model.controls;
  assert.equal(validateModel(s).errors[0].code, 'DUPLICATE_BINDING');
  // same message on base and shift layer is fine with a Shift control
  s.controls = sanitizeModel({ version: 1, controls: [btn(11, { id: 'play', deck: 1 }), { ...btn(11, { id: 'sync', deck: 1 }), layer: 'shift' }, btn(63, { id: 'shift' })] }).model.controls;
  assert.deepEqual(validateModel(s).errors, []);
});

test('validation rules: ranges, decks, hot cues, shift modifier, kinds and target support', () => {
  const codes = controls => validateModel(sanitizeModel({ version: 1, name: 'v', decks: 2, controls }).model, { target: 'mixxx' });
  const e = controls => codes(controls).errors.map(x => x.code);
  const w = controls => codes(controls).warnings.map(x => x.code);
  assert.deepEqual(e([{ midi: { type: 'note', channel: 17, number: 1 } }]), ['CHANNEL_RANGE']);
  assert.deepEqual(e([{ midi: { type: 'note', channel: 0, number: 1 } }]), ['CHANNEL_RANGE']);
  assert.deepEqual(e([{ midi: { type: 'cc', channel: 1, number: 128 } }]), ['NUMBER_RANGE']);
  assert.deepEqual(e([{ midi: { type: 'cc14', channel: 1, number: 1, lsbNumber: 1 } }]), ['NUMBER_RANGE', 'DUPLICATE_BINDING']);
  assert.deepEqual(e([btn(1, { id: 'play', deck: 3 })]), ['DECK_RANGE']);
  assert.deepEqual(e([btn(1, { id: 'hotcue', deck: 1, args: { action: 'activate', n: 9 } })]), ['HOTCUE_RANGE']);
  assert.deepEqual(e([btn(1, { id: 'fx', deck: 1, args: { action: 'enable', unit: 7 } })]), ['ARG_RANGE']);
  assert.deepEqual(e([{ ...btn(1, { id: 'play', deck: 1 }), layer: 'shift' }]), ['SHIFT_MISSING']);
  assert.ok(e([{ ...btn(1, { id: 'shift' }), layer: 'shift' }]).includes('SHIFT_ON_SHIFT_LAYER'));
  assert.ok(e([btn(2, { id: 'shift' }), { label: 'p', midi: { type: 'cc14', channel: 1, number: 3 }, kind: 'absolute', layer: 'shift', function: { id: 'pitch', deck: 1 } }]).includes('SHIFT_14BIT'));
  assert.deepEqual(w([{ label: 'k', midi: { type: 'cc', channel: 1, number: 3 }, kind: 'absolute', function: { id: 'play', deck: 1 } }]), ['KIND_MISMATCH']);
  assert.deepEqual(w([btn(1, { id: 'volume', deck: 1 })]), ['KIND_MISMATCH']);
  assert.deepEqual(w([{ label: 'j', midi: { type: 'cc', channel: 1, number: 3 }, kind: 'relative', function: { id: 'jog', deck: 1, args: { action: 'rotate' } } }]), ['ENCODING_MISSING']);
  assert.deepEqual(w([{ label: 'pb', midi: { type: 'pitchbend', channel: 1, number: 0 }, kind: 'absolute', function: { id: 'pitch', deck: 1 } }]), ['NO_EQUIVALENT']);
  assert.deepEqual(w([{ midi: { type: 'cc', channel: 1, number: 3 } }]), ['UNASSIGNED']);
  assert.deepEqual(validateModel(null).errors[0].code, 'MODEL_INVALID');
  assert.deepEqual(validateModel({ ...createModel(), name: ' ' }).errors.map(x => x.code), ['NAME_EMPTY']);
});

test('preserved custom controls: custom vs custom duplicates warn, custom vs a new function blocks', () => {
  const custom = n => ({ label: 'c', midi: { type: 'note', channel: 1, number: n }, custom: { target: 'mixxx', group: '[Channel1]', key: 'X.y', options: ['script-binding'] } });
  const v = controls => validateModel(sanitizeModel({ version: 1, name: 'c', controls }).model, { target: 'vdj' });
  assert.ok(v([custom(1), btn(1, { id: 'play', deck: 1 })]).errors.some(x => x.code === 'DUPLICATE_BINDING'));
  assert.ok(v([custom(1)]).warnings.some(x => x.code === 'CUSTOM_OTHER_TARGET'));
});

test('export size gate is 512 KB (FS-32 §6)', () => {
  assert.equal(checkExportSize([{ name: 'a', content: 'x'.repeat(MAX_EXPORT_BYTES) }]), null);
  assert.equal(checkExportSize([{ name: 'a', content: 'x'.repeat(MAX_EXPORT_BYTES + 1) }]).code, 'FILE_TOO_LARGE');
});

// ------------------------------------------------------------------ reports

test('AC-6: Traktor and Serato get a labelled Markdown report, escaped', () => {
  const m = JSON.parse(fx('golden-model.json'));
  m.controls[1].label = 'Play | <b>bold</b> `x`';
  const t = traktorReport(m);
  assert.ok(t.startsWith('# Golden Two-Deck: Traktor mapping report'));
  assert.ok(/\*\*Report only: DeckChek does not write Traktor \.tsi files\.\*\*/.test(t));
  assert.ok(t.includes('Deck Common &gt; Play/Pause'));
  assert.ok(t.includes('Play \\| &lt;b&gt;bold&lt;/b&gt; \\`x\\`'), 'pipes, markup and backticks escaped');
  assert.ok(t.includes('| Deck 1 Play | Note 11, ch 1 | Shift | Deck 1 sync | Deck Common &gt; Sync On | Deck A (1) | — |'));
  const s = seratoReport(m);
  assert.equal(SERATO_STATUS, 'Experimental');
  assert.ok(s.includes('Serato mapping report (experimental)') && s.includes('**Experimental: report only, no Serato file is written.**'));
  assert.ok(s.includes('Cue point 1'));
  const imported = { version: 1, name: 'i', controls: [{ label: 'x', midi: { type: 'note', channel: 1, number: 1 }, custom: { target: 'vdj', name: 'X', action: 'a|b' } }] };
  assert.ok(traktorReport(imported).includes('## Preserved custom controls') && traktorReport(imported).includes('X: a\\|b'));
  assert.ok(traktorReport({ version: 1, controls: [] }).includes('No control has a function yet'));
  assert.equal(mdCell(''), '—');
});

// ------------------------------------------------------------------ store (browser mode)

function memStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; }

test('store: browser mode saves, lists, reads and deletes models in localStorage', async () => {
  const storage = memStorage();
  const st = createMapperStore({ api: null, storage });
  assert.equal(st.native, false);
  const model = learnedToModel(learned(), null);
  const a = await st.save({ name: 'First', model, assetId: 'asset-generic-ctl' });
  const b = await st.save({ name: 'Second', model });
  const again = await st.save({ id: a.id, name: 'First (edited)', model, assetId: 'asset-generic-ctl' });
  assert.equal(again.id, a.id);
  assert.equal(again.createdAt, a.createdAt);
  const rows = await st.list();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].controlCount, 16);
  assert.equal(rows[0].model, undefined, 'list rows carry no model');
  assert.deepEqual((await st.list({ assetId: 'asset-generic-ctl' })).map(r => r.name), ['First (edited)']);
  const got = await st.get(a.id);
  assert.deepEqual(got.model, sanitizeModel(model).model);
  assert.equal(got.readOnly, false);
  assert.equal(await st.remove(b.id), true);
  assert.equal(await st.remove(b.id), false);
  storage.setItem(LOCAL_KEY, '{corrupt');
  assert.deepEqual(await st.list(), [], 'corrupt storage reads as empty');
  await assert.rejects(st.save({ name: ' ', model }), /name/);
  assert.throws(() => checkSavable({ name: 'x', model: { version: 1, controls: [], pad: 'x'.repeat(LIMITS.maxModelBytes) } }), /too large/);
});

test('store: desktop mode calls the mapper_model_* commands with their argument shapes', async () => {
  const calls = [];
  const api = { core: { invoke: async (cmd, args) => { calls.push([cmd, args]); return cmd === 'mapper_model_get' ? { id: 'x', model: { version: 1, controls: [] } } : cmd === 'mapper_model_list' ? [] : true; } } };
  const st = createMapperStore({ api, storage: null });
  await st.save({ name: 'N', model: { version: 1, controls: [] }, assetId: 'a1' });
  await st.list({ assetId: 'a1' });
  const g = await st.get('x');
  await st.remove('x');
  assert.deepEqual(calls.map(c => c[0]), ['mapper_model_save', 'mapper_model_list', 'mapper_model_get', 'mapper_model_delete']);
  assert.deepEqual(calls[0][1], { input: { id: null, assetId: 'a1', profileId: null, name: 'N', model: { version: 1, controls: [] } } });
  assert.deepEqual(calls[1][1], { assetId: 'a1' });
  assert.equal(g.model.version, 1);
  const contract = JSON.parse(fs.readFileSync(new URL('./contracts/mapper.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(calls[0][1]), Object.keys(contract.mapper_model_save.request));
  assert.deepEqual(Object.keys(calls[0][1].input).sort(), Object.keys(contract.mapper_model_save.request.input).sort());
});
