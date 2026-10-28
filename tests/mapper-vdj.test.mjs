// FS-32 VirtualDJ export/import: AC-2 (definition/mapper pair with VDJscript actions), AC-3 (import recognises or
// preserves), AC-5 (round trip). Fixtures are self-authored.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportVdj, importVdj, vdjName, VDJ_UNVERIFIED } from '../app/mapper/vdj.js';
import { normalizeModel, createModel } from '../app/mapper/model.js';
import { parseXml, kids } from '../app/mapper/xml.js';
import { FUNCTIONS, normalizeFunction, FUNCTION_TARGETS } from '../app/mapper/vocabulary.js';

const fx = name => fs.readFileSync(new URL(`./fixtures/mapper/${name}`, import.meta.url), 'utf8');
const golden = () => JSON.parse(fx('golden-model.json'));
const comparable = m => normalizeModel(m).controls;

test('AC-2: export gives a definition/mapper pair with VDJscript actions', () => {
  const r = exportVdj(golden(), { name: 'Golden Two-Deck' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.files.map(f => f.name), ['Devices/Golden Two-Deck.xml', 'Mappers/Golden Two-Deck.xml']);
  assert.ok(r.warnings.some(w => w.code === 'VDJ_UNVERIFIED' && w.message === VDJ_UNVERIFIED), 'unverified format is flagged');
  const def = parseXml(r.files[0].content).root, map = parseXml(r.files[1].content).root;
  assert.equal(def.name, 'device');
  assert.deepEqual({ ...def.attrs }, { name: 'Golden Two-Deck', author: 'DeckChek', type: 'MIDI', decks: '2', version: '800' });
  assert.equal(map.name, 'mapper');
  const actions = Object.fromEntries(kids(map, 'map').map(m => [m.attrs.value, m.attrs.action]));
  assert.equal(actions.Deck_1_Play, 'shift ? sync : play_pause', 'shift layer via VDJscript shift ?');
  assert.equal(actions.Deck_1_Cue, 'cue');
  assert.equal(actions.Deck_1_Pad_1, 'shift ? delete_cue 1 : hot_cue 1');
  assert.equal(actions.Deck_1_Loop_4, 'loop 4');
  assert.equal(actions.Shift, 'shift');
  assert.equal(actions.Crossfader, 'crossfader');
  const play = kids(def, 'button').find(b => b.attrs.name === 'Deck_1_Play');
  assert.deepEqual({ ...play.attrs }, { note: '0x0B', channel: '0', name: 'Deck_1_Play', deck: '1' });
  assert.ok(kids(def, 'encoder').some(e => e.attrs.name === 'Deck_1_Jog'));
  assert.ok(kids(def, 'led').some(e => e.attrs.name === 'LED_Deck_1_Play'));
  assert.ok(r.warnings.some(w => w.code === 'VDJ_14BIT'), '14-bit pitch degrades with a warning');
  assert.equal(exportVdj(golden(), { name: 'Golden Two-Deck', force: true }).files[0].name, 'Devices/force-Golden Two-Deck.xml');
});

test('every vocabulary function has a VirtualDJ action and reads back as itself', () => {
  for (const def of FUNCTIONS) {
    let combos = [{}];
    for (const a of def.args) combos = combos.flatMap(c => a.values.map(v => ({ ...c, [a.name]: v })));
    for (const raw of combos) {
      const fn = normalizeFunction({ id: def.id, deck: 2, args: raw }, 2);
      assert.ok(FUNCTION_TARGETS.vdj[def.id](fn), def.id);
      const m = createModel({ name: 'one', decks: 2 });
      const kind = ['jog', 'browse'].includes(def.id) && !['touch', 'press'].includes(fn.args.action) ? 'relative' : def.args.find(a => a.name === 'action')?.kindOf?.(fn.args.action) || def.kind;
      m.controls.push({ label: 'Control', midi: { type: kind === 'button' ? 'note' : 'cc', channel: 3, number: 40, encoding: kind === 'relative' ? 'relative-two-complement' : undefined }, kind, layer: 'base', function: fn });
      const r = exportVdj(m, { name: 'one' });
      const back = importVdj(r.files[0].content, r.files[1].content);
      assert.ok(back.ok);
      assert.deepEqual(comparable(back.model), comparable(m), JSON.stringify(fn));
    }
  }
});

test('AC-5: export then import gives the same model after normalisation (14-bit and labels normalised)', () => {
  const m = golden();
  for (const c of m.controls) if (c.midi.type === 'cc14') { c.midi = { type: 'cc', channel: c.midi.channel, number: c.midi.number }; }
  const r = exportVdj(m, { name: m.name });
  const back = importVdj(r.files[0].content, r.files[1].content);
  assert.ok(back.ok);
  assert.equal(back.model.name, m.name);
  assert.deepEqual(comparable(back.model), comparable(m));
  assert.deepEqual(exportVdj(back.model, { name: m.name }).files, r.files, 'deterministic');
});

test('a function on another deck than the definition entry is addressed with "deck N"', () => {
  const m = createModel({ name: 'x', decks: 4 });
  m.controls.push({ label: 'Play', midi: { type: 'note', channel: 1, number: 1 }, kind: 'button', layer: 'base', function: { id: 'play', deck: 1 } });
  m.controls.push({ label: 'Play', midi: { type: 'note', channel: 1, number: 1 }, kind: 'button', layer: 'shift', function: { id: 'play', deck: 3 } });
  m.controls.push({ label: 'Shift', midi: { type: 'note', channel: 1, number: 2 }, kind: 'button', layer: 'base', function: { id: 'shift' } });
  const r = exportVdj(m, { name: 'x' });
  assert.ok(r.files[1].content.includes('action="shift ? deck 3 play_pause : play_pause"'));
  assert.deepEqual(comparable(importVdj(r.files[0].content, r.files[1].content).model), comparable(m));
});

test('AC-3: a third-party VirtualDJ definition + mapper imports with unknown actions preserved', () => {
  const r = importVdj(fx('vdj-definition.xml'), fx('vdj-mapper.xml'));
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.equal(r.model.name, 'Fixture VDJ Controller');
  const got = r.model.controls.filter(c => c.function).map(c => `${c.layer}:${c.function.id}:${c.function.deck}:${c.midi.channel}:${c.midi.number}`).sort();
  assert.deepEqual(got, ['base:crossfader:null:7:31', 'base:cue:1:1:12', 'base:hotcue:1:8:0', 'base:jog:1:1:33', 'base:play:1:1:11', 'base:play:2:2:11', 'base:shift:null:1:63', 'base:volume:1:1:19', 'shift:sync:1:1:11']);
  assert.equal(r.model.controls.find(c => c.function?.id === 'jog').kind, 'relative');
  assert.deepEqual(r.model.controls.find(c => c.function?.id === 'play' && c.function.deck === 1 && c.layer === 'base').feedback.led, { type: 'note', channel: 1, number: 11, on: 127, off: 0 });
  const weird = r.model.controls.find(c => c.custom);
  assert.deepEqual(weird.custom, { target: 'vdj', element: 'button', name: 'WEIRD', action: "param_bigger 10% & browser_window 'songs'" });
  // preserved custom action is written back unchanged, escaped
  const out = exportVdj(r.model, { name: 'Fixture VDJ Controller' });
  assert.deepEqual(out.errors, []);
  assert.ok(out.files[1].content.includes('action="param_bigger 10% &amp; browser_window &apos;songs&apos;"'));
  assert.equal(kids(parseXml(out.files[1].content).root, 'map').find(m => m.attrs.value === 'WEIRD').attrs.action, "param_bigger 10% & browser_window 'songs'");
});

test('import reads the older single-file layout and the files in either order', () => {
  const r = importVdj(fx('vdj-legacy.xml'));
  assert.ok(r.ok);
  assert.deepEqual(r.model.controls.map(c => `${c.function?.id}:${c.function?.args?.n ?? ''}:${c.midi.number}`), ['loop:4:22', 'play::23']);
  const swapped = importVdj(fx('vdj-mapper.xml'), fx('vdj-definition.xml'));
  assert.deepEqual(comparable(swapped.model), comparable(importVdj(fx('vdj-definition.xml'), fx('vdj-mapper.xml')).model));
  const only = importVdj(fx('vdj-definition.xml'));
  assert.ok(only.ok && only.warnings.some(w => /add the mapper file/.test(w)));
});

test('import errors are typed and never thrown', () => {
  assert.equal(importVdj('<foo/>').error.code, 'NOT_VDJ');
  assert.equal(importVdj(fx('vdj-definition.xml'), '<foo/>').error.code, 'NOT_VDJ');
  assert.equal(importVdj(fx('xxe.midi.xml')).error.code, 'XML_DTD_FORBIDDEN');
  assert.equal(importVdj(fx('vdj-definition.xml'), fx('xxe.midi.xml')).error.code, 'XML_DTD_FORBIDDEN');
  assert.ok(/^Mapper: /.test(importVdj(fx('vdj-definition.xml'), '<mapper>').error.message));
  const junk = importVdj('<device><button note="zz" channel="99" name="X"/><button cc="0x10" channel="-1"/></device>', '<mapper/>');
  assert.ok(junk.ok && junk.model.controls.length === 0 && junk.warnings.filter(w => /skipped/.test(w)).length === 2);
});

test('definition names are reduced to letters, digits and underscores', () => {
  assert.equal(vdjName('Deck 1 <Play> & "Cue"'), 'Deck_1_Play_Cue');
  assert.equal(vdjName('🎧🎧'), 'CONTROL');
  assert.equal(vdjName('x'.repeat(100)).length, 40);
});
