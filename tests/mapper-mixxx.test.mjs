// FS-32 Mixxx export/import: AC-1 (controls fire the intended [ChannelN] keys), AC-3 (import recognises or preserves),
// AC-5 (round trip), §8 (comments/unknown elements/CRLF/BOM tolerated, XXE rejected, golden file diffs).
// Fixtures are self-authored; no Mixxx mapping or script is committed. Set MIXXX_CONTROLLERS_DIR to a local sparse
// clone of mixxx/res/controllers to also run the optional, non-blocking corpus robustness check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { exportMixxx, importMixxx, fileStem, scriptPrefix } from '../app/mapper/mixxx.js';
import { normalizeModel, createModel } from '../app/mapper/model.js';
import { parseXml, kids, kid, childText } from '../app/mapper/xml.js';
import { FUNCTIONS, normalizeFunction, argsFor } from '../app/mapper/vocabulary.js';

const fx = name => fs.readFileSync(new URL(`./fixtures/mapper/${name}`, import.meta.url), 'utf8');
const golden = () => JSON.parse(fx('golden-model.json'));
const controlsOf = xml => kids(kid(kid(parseXml(xml).root, 'controller'), 'controls'), 'control').map(c => ({ group: childText(c, 'group'), key: childText(c, 'key'), status: childText(c, 'status'), midino: childText(c, 'midino'), options: kid(c, 'options').children.map(o => o.name), description: childText(c, 'description') }));
const comparable = m => normalizeModel(m).controls.map(c => ({ ...c }));

test('AC-1: play/cue/sync/pitch/hotcue/loop export to the intended [ChannelN] controls', () => {
  const m = createModel({ name: 'AC1', decks: 2 });
  const add = (num, fn, kind = 'button', type = 'note', ch = 1) => m.controls.push({ label: `c${num}`, midi: { type, channel: ch, number: num }, kind, layer: 'base', function: fn });
  add(11, { id: 'play', deck: 1 });
  add(12, { id: 'cue', deck: 1 });
  add(13, { id: 'sync', deck: 2 });
  add(14, { id: 'pitch', deck: 2 }, 'absolute', 'cc');
  for (let n = 1; n <= 8; n++) add(20 + n, { id: 'hotcue', deck: 1, args: { action: 'activate', n } });
  add(30, { id: 'loop', deck: 1, args: { action: 'in' } });
  add(31, { id: 'loop', deck: 1, args: { action: 'out' } });
  add(32, { id: 'loop', deck: 1, args: { action: 'toggle' } });
  add(33, { id: 'loop', deck: 2, args: { action: 'auto', n: 4 } });
  const r = exportMixxx(m, { name: 'AC1' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.files.length, 1, 'no script needed for plain controls');
  const doc = parseXml(r.files[0].content);
  assert.equal(doc.root.name, 'MixxxControllerPreset');
  assert.deepEqual({ ...doc.root.attrs }, { schemaVersion: '1', mixxxVersion: '2.4+' });
  const keys = new Set(controlsOf(r.files[0].content).map(c => `${c.group} ${c.key} ${c.status} ${c.midino} ${c.options.join()}`));
  for (const k of ['[Channel1] play 0x90 0x0B normal', '[Channel1] cue_default 0x90 0x0C normal', '[Channel1] cue_default 0x80 0x0C normal', '[Channel2] sync_enabled 0x90 0x0D normal',
    '[Channel2] rate 0xB0 0x0E normal', '[Channel1] hotcue_1_activate 0x90 0x15 normal', '[Channel1] hotcue_8_activate 0x90 0x1C normal', '[Channel1] loop_in 0x90 0x1E normal',
    '[Channel1] loop_out 0x90 0x1F normal', '[Channel1] reloop_toggle 0x90 0x20 normal', '[Channel2] beatloop_4_toggle 0x90 0x21 normal']) assert.ok(keys.has(k), k);
});

test('every vocabulary function serialises for Mixxx and reads back as itself', () => {
  for (const def of FUNCTIONS) {
    let combos = [{}];
    for (const a of def.args) combos = combos.flatMap(c => a.values.map(v => ({ ...c, [a.name]: v })));
    const seen = new Set();
    for (const raw of combos) {
      const fn = normalizeFunction({ id: def.id, deck: 2, args: raw }, 2);
      const sig = JSON.stringify(fn);
      if (seen.has(sig)) continue;
      seen.add(sig);
      const m = createModel({ name: 'one', decks: 2 });
      const kind = ['jog', 'browse'].includes(def.id) && !['touch', 'press'].includes(fn.args.action) ? 'relative' : def.args.find(a => a.name === 'action')?.kindOf?.(fn.args.action) || def.kind;
      m.controls.push({ label: 'x', midi: { type: kind === 'button' ? 'note' : 'cc', channel: 3, number: 40, encoding: kind === 'relative' ? 'relative-two-complement' : undefined }, kind, layer: 'base', function: fn });
      if (def.id !== 'shift') m.controls.push({ label: 'Shift', midi: { type: 'note', channel: 3, number: 99 }, kind: 'button', layer: 'base', function: { id: 'shift' } });
      const r = exportMixxx(m, { name: 'one' });
      assert.deepEqual(r.errors, [], sig);
      assert.ok(r.files[0].content.includes('<control>'), sig);
      if (r.files[1]) assert.doesNotThrow(() => new vm.Script(r.files[1].content), sig);
      const back = importMixxx(r.files[0].content, []);
      assert.ok(back.ok, sig);
      assert.deepEqual(comparable(back.model), comparable(m), `round trip ${sig}`);
    }
  }
  assert.ok(argsFor(FUNCTIONS.find(f => f.id === 'loop'), { action: 'auto' }).some(a => a.name === 'n'));
});

test('AC-5: golden model round-trips export -> import unchanged after normalisation', () => {
  const m = golden();
  const r = exportMixxx(m, { name: m.name, author: 'DeckChek tests' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.files.map(f => f.name), ['Golden Two-Deck.midi.xml', 'Golden Two-Deck-scripts.js']);
  const back = importMixxx(r.files[0].content, [r.files[1]]);
  assert.ok(back.ok);
  assert.deepEqual(back.warnings, []);
  assert.equal(back.model.name, m.name);
  assert.equal(back.model.decks, m.decks);
  assert.deepEqual(comparable(back.model), comparable(m));
  // and a second pass is byte-identical (deterministic export)
  assert.equal(exportMixxx(back.model, { name: m.name, author: 'DeckChek tests' }).files[0].content, r.files[0].content);
});

test('golden file diffs: Mixxx XML and script match the committed goldens', () => {
  const r = exportMixxx(golden(), { name: 'Golden Two-Deck', author: 'DeckChek tests', description: 'Golden fixture' });
  const xmlPath = new URL('./fixtures/mapper/golden.midi.xml', import.meta.url), jsPath = new URL('./fixtures/mapper/golden-scripts.js', import.meta.url);
  if (process.env.UPDATE_GOLDEN === '1') { fs.writeFileSync(xmlPath, r.files[0].content); fs.writeFileSync(jsPath, r.files[1].content); }
  assert.equal(r.files[0].content, fs.readFileSync(xmlPath, 'utf8'));
  assert.equal(r.files[1].content, fs.readFileSync(jsPath, 'utf8'));
});

test('shift layer, collisions, 14-bit and LEDs map to the documented Mixxx constructs', () => {
  const r = exportMixxx(golden(), { name: 'Golden Two-Deck' });
  const cs = controlsOf(r.files[0].content);
  const prefix = scriptPrefix('Golden Two-Deck');
  assert.ok(cs.some(c => c.key === `${prefix}.s_sync_d1` && c.options[0] === 'script-binding'), 'shift-layer sync is scripted');
  assert.ok(cs.some(c => c.key === `${prefix}.b_play_d1` && c.status === '0x90'), 'base play sharing the message with a shift entry is scripted');
  assert.deepEqual(cs.filter(c => c.key === 'rate').map(c => [c.midino, c.options[0]]), [['0x00', 'fourteen-bit-msb'], ['0x20', 'fourteen-bit-lsb']], '14-bit without script');
  assert.ok(cs.some(c => c.key === 'MoveVertical' && c.options[0] === 'selectknob'));
  const outs = kids(kid(kid(parseXml(r.files[0].content).root, 'controller'), 'outputs'), 'output').map(o => childText(o, 'key'));
  assert.deepEqual(outs.sort(), ['beatloop_4_enabled', 'cue_indicator', 'hotcue_1_enabled', 'play_indicator']);
  const files = kids(kid(kid(parseXml(r.files[0].content).root, 'controller'), 'scriptfiles'), 'file');
  assert.deepEqual({ ...files[0].attrs }, { functionprefix: prefix, filename: 'Golden Two-Deck-scripts.js' });
  assert.ok(/engine\.scratchEnable\(1,/.test(r.files[1].content) && /P\.shifted = value > 0;/.test(r.files[1].content));
});

test('AC-3: a third-party Mixxx file imports into recognised functions plus preserved custom controls', () => {
  const r = importMixxx(fx('third-party.midi.xml'), [{ name: 'Fixture-Controller-scripts.js', content: fx('Fixture-Controller-scripts.js') }]);
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.equal(r.model.name, 'Fixture Controller & Friends');
  const fns = r.model.controls.filter(c => c.function).map(c => `${c.function.id}:${c.function.deck}:${c.midi.type}:${c.midi.channel}:${c.midi.number}`).sort();
  assert.deepEqual(fns, ['browse:null:cc:7:64', 'crossfader:null:cc:7:31', 'cue:2:note:2:12', 'hotcue:1:note:8:1', 'pitch:1:cc14:1:0', 'play:1:note:1:11']);
  const play = r.model.controls.find(c => c.function?.id === 'play');
  assert.deepEqual(play.feedback.led, { type: 'note', channel: 1, number: 11, on: 127, off: 0 }, 'play_indicator output attached as LED');
  assert.equal(play.label, 'Play deck 1');
  const custom = r.model.controls.filter(c => c.custom);
  assert.deepEqual(custom.map(c => c.custom.key).sort(), ['FixtureCtl.beatFxSelect', 'FixtureCtl.wheelTurn']);
  assert.equal(custom.find(c => c.custom.key === 'FixtureCtl.beatFxSelect').custom.noteOff, true, 'note-off twin folded');
  assert.deepEqual(r.model.preserved.mixxx.scriptfiles, [{ filename: 'Fixture-Controller-scripts.js', functionprefix: 'FixtureCtl' }]);
  assert.deepEqual(r.model.preserved.mixxx.outputs.map(o => o.key), ['vu_meter']);
  assert.equal(r.model.preserved.mixxx.info.author, 'Fixture Author');
  assert.ok(r.warnings.some(w => /Line \d+: a control with an invalid status/.test(w)), 'broken entry reported by line');
  assert.ok(r.warnings.some(w => /custom \(preserved\)/.test(w)));
  assert.deepEqual(r.preservedRaw.map(p => [p.kind, p.name]), [['script', 'Fixture-Controller-scripts.js']]);
  assert.equal(r.preservedRaw[0].content, fx('Fixture-Controller-scripts.js'), 'script kept byte for byte (never executed)');
});

test('AC-3: preserved custom controls, outputs, script files and author are written back unchanged', () => {
  const imp = importMixxx(fx('third-party.midi.xml'), [{ name: 'Fixture-Controller-scripts.js', content: fx('Fixture-Controller-scripts.js') }]);
  const r = exportMixxx(imp.model, { name: 'Fixture Controller & Friends', author: 'Me', scripts: imp.preservedRaw });
  assert.deepEqual(r.errors, []);
  const xml = r.files[0].content;
  const cs = controlsOf(xml);
  assert.deepEqual(cs.filter(c => c.key === 'FixtureCtl.beatFxSelect').map(c => c.status), ['0x94', '0x84']);
  assert.deepEqual(cs.find(c => c.key === 'FixtureCtl.wheelTurn').options, ['script-binding']);
  assert.ok(xml.includes('<key>vu_meter</key>') && xml.includes('<maximum>1</maximum>'));
  assert.ok(xml.includes('<author>Fixture Author; edited by Me</author>'), 'third-party author kept');
  assert.ok(xml.includes('<wiki>https://example.invalid/wiki</wiki>'));
  assert.ok(xml.includes('filename="Fixture-Controller-scripts.js"'));
  const passed = r.files.find(f => f.name === 'Fixture-Controller-scripts.js');
  assert.equal(passed?.content, fx('Fixture-Controller-scripts.js'));
  const again = importMixxx(xml, r.files.filter(f => f.name.endsWith('.js')));
  assert.deepEqual(comparable(again.model), comparable(imp.model), 'import -> export -> import is stable');
});

test('import tolerates comments, unknown elements, CRLF line ends and a UTF-8 BOM', () => {
  const crlf = '\uFEFF' + fx('third-party.midi.xml').replace(/\n/g, '\r\n');
  const a = importMixxx(crlf), b = importMixxx(fx('third-party.midi.xml'));
  assert.ok(a.ok && b.ok);
  assert.deepEqual(comparable(a.model), comparable(b.model));
});

test('import errors are typed, located and never thrown', () => {
  assert.equal(importMixxx('<notmixxx/>').error.code, 'NOT_MIXXX');
  assert.equal(importMixxx('<MixxxControllerPreset><info/></MixxxControllerPreset>').error.code, 'NOT_MIXXX');
  const bad = importMixxx('<MixxxControllerPreset>\n<controller>\n<controls>\n</controller>');
  assert.equal(bad.error.code, 'XML_SYNTAX');
  assert.equal(bad.error.line, 4);
  assert.equal(importMixxx(undefined).ok, false);
  const huge = importMixxx('<MixxxControllerPreset>' + ' '.repeat(5 * 1024 * 1024) + '</MixxxControllerPreset>');
  assert.equal(huge.error.code, 'XML_TOO_LARGE');
  const big = importMixxx('<MixxxControllerPreset><controller><controls>' + '<control><group>[Channel1]</group><key>play</key><status>0x90</status><midino>0x01</midino><options><normal/></options></control>'.repeat(4500) + '</controls></controller></MixxxControllerPreset>');
  assert.ok(big.ok && big.warnings.some(w => /first 4096/.test(w)));
  const scripts = importMixxx(fx('third-party.midi.xml'), [{ name: '../../evil.js', content: 'x' }, { name: 'big.js', content: 'x'.repeat(1024 * 1024 + 1) }, null, 5]);
  assert.deepEqual(scripts.preservedRaw.map(p => p.name), ['_.._evil.js']);
  assert.ok(scripts.warnings.some(w => /larger than 1 MB/.test(w)));
});

test('AC-4: export is blocked while bindings conflict', () => {
  const m = golden();
  m.controls.push({ label: 'Dup play', midi: { type: 'note', channel: 1, number: 11 }, kind: 'button', layer: 'base', function: { id: 'cue', deck: 2 } });
  const r = exportMixxx(m, { name: 'x' });
  assert.equal(r.files.length, 0);
  assert.equal(r.errors[0].code, 'DUPLICATE_BINDING');
  assert.equal(r.errors[0].controlIds.length, 2);
});

test('file names and the script prefix are sanitised (FS-32 §7)', () => {
  assert.equal(fileStem('../..\\evil<>:"|?*name'), '_.._evil_______name');
  assert.equal(fileStem(''), 'DeckChek mapping');
  assert.equal(fileStem('x'.repeat(200)).length, 80);
  assert.equal(scriptPrefix('My DDJ-400!'), 'DeckChek_MyDDJ400');
  assert.equal(scriptPrefix('???'), 'DeckChek');
});

test('optional corpus robustness check over a local Mixxx controllers folder (MIXXX_CONTROLLERS_DIR)', { skip: !process.env.MIXXX_CONTROLLERS_DIR && 'MIXXX_CONTROLLERS_DIR not set' }, () => {
  const dir = process.env.MIXXX_CONTROLLERS_DIR;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.midi.xml'));
  let ok = 0;
  for (const f of files) {
    const r = importMixxx(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (r.ok) ok++;
    else assert.ok(r.error.code, f);
    if (r.ok) assert.deepEqual(exportMixxx(r.model, { name: r.model.name }).errors.filter(e => e.code !== 'DUPLICATE_BINDING' && e.code !== 'SHIFT_MISSING'), [], f);
  }
  assert.ok(ok > 0);
});
