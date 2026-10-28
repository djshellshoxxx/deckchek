// FS-32 code-review regressions (mapper engine). Each test reproduces a confirmed finding; fixtures are self-authored
// inline strings (no Mixxx or VirtualDJ file is copied).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportMixxx, importMixxx } from '../app/mapper/mixxx.js';
import { exportVdj, importVdj } from '../app/mapper/vdj.js';
import { sanitizeModel, normalizeModel, updateControl, cleanText, parseJsonFile, LIMITS } from '../app/mapper/model.js';
import { validateModel } from '../app/mapper/validate.js';
import { learnedToModel } from '../app/mapper/from-learned.js';
import { suggestFunction, deckFromWords } from '../app/mapper/vocabulary.js';
import { createMapperStore, checkSavable } from '../app/mapper/store.js';
import { parseXml, kids, kid, childText } from '../app/mapper/xml.js';

const fx = name => fs.readFileSync(new URL(`./fixtures/mapper/${name}`, import.meta.url), 'utf8');
const controlsOf = xml => kids(kid(kid(parseXml(xml).root, 'controller'), 'controls'), 'control').map(c => ({ group: childText(c, 'group'), key: childText(c, 'key'), status: childText(c, 'status'), midino: childText(c, 'midino'), options: kid(c, 'options').children.map(o => o.name) }));
const comparable = m => normalizeModel(m).controls.map(c => ({ ...c }));
const timed = fn => { const t0 = performance.now(); const v = fn(); return { v, ms: performance.now() - t0 }; };
const mixxxDoc = (controls, outputs = '') => `<?xml version="1.0"?><MixxxControllerPreset schemaVersion="1"><info><name>R</name></info><controller id="R"><controls>${controls}</controls><outputs>${outputs}</outputs></controller></MixxxControllerPreset>`;
const mxCtl = (group, key, status, midino, options) => `<control><group>${group}</group><key>${key}</key><status>${status}</status><midino>${midino}</midino><options>${options.map(o => `<${o}/>`).join('')}</options></control>`;
const model = controls => sanitizeModel({ version: 1, name: 'R', decks: 2, controls }).model;

// ------------------------------------------------------------------ ReDoS

test('regression: hostile legacy VirtualDJ action ("shift ?" + 200k spaces) imports in under 200 ms', () => {
  const xml = `<mapper><note note="1" chan="0" action="shift ?${' '.repeat(200_000)}x"/></mapper>`;
  const { v: r, ms } = timed(() => importVdj(xml));
  assert.ok(ms < 200, `took ${ms.toFixed(0)} ms`);
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.equal(r.model.controls.length, 0, 'over-long legacy action is not kept');
  assert.ok(r.warnings.some(w => /longer than 256 characters/.test(w)));
  // the split itself is linear even under the cap, and the shift form still reads
  const ok = importVdj('<mapper><note note="1" chan="0" action="shift ? sync : play_pause"/></mapper>');
  assert.deepEqual(ok.model.controls.map(c => `${c.layer}:${c.function.id}`).sort(), ['base:play', 'shift:sync']);
  const colon = timed(() => importVdj(`<mapper><note note="1" chan="0" action="shift ?${' :'.repeat(100_000)}"/></mapper>`));
  assert.ok(colon.ms < 200, `took ${colon.ms.toFixed(0)} ms`);
});

test('regression: learned-map label of 200k chars ("loop " x 40000) converts in under 200 ms', () => {
  const label = 'loop '.repeat(40_000);
  const text = JSON.stringify({ controls: [{ id: 'x', label, group: 'fx '.repeat(40_000), message: { kind: 'note', channel: 1, number: 1 } }] });
  const { v: m, ms } = timed(() => { const p = parseJsonFile(text); assert.ok(p.ok); return learnedToModel(p.value, null); });
  assert.ok(ms < 200, `took ${ms.toFixed(0)} ms`);
  assert.equal(m.controls.length, 1);
  assert.ok(m.controls[0].label.length <= LIMITS.maxText);
  for (const words of ['loop '.repeat(40_000), 'fx 1 '.repeat(40_000), 'browse '.repeat(40_000), 'jog '.repeat(40_000)]) {
    const t = timed(() => suggestFunction({ label: words }));
    assert.ok(t.ms < 200, `suggestFunction took ${t.ms.toFixed(0)} ms`);
    const d = timed(() => deckFromWords(words));
    assert.ok(d.ms < 200, `deckFromWords took ${d.ms.toFixed(0)} ms`);
  }
  assert.deepEqual(suggestFunction({ label: 'Loop In' }), { id: 'loop', args: { action: 'in' } }, 'short labels still match');
});

// ------------------------------------------------------------------ custom controls

test('regression: assigning a function to an imported custom control exports the function (Mixxx and VirtualDJ) [HIGH]', () => {
  const imp = importMixxx(fx('third-party.midi.xml'));
  const custom = imp.model.controls.find(c => c.custom?.key === 'FixtureCtl.wheelTurn');
  const { model: edited, id } = updateControl(imp.model, custom.id, { function: { id: 'play', deck: 2, args: {} }, kind: 'button' });
  const c = edited.controls.find(x => x.id === id);
  assert.equal(c.function.id, 'play');
  assert.equal(c.custom, undefined, 'assigned function replaces the preserved custom entry');
  const r = exportMixxx(edited, { name: 'R' });
  assert.deepEqual(r.errors, []);
  const cs = controlsOf(r.files[0].content);
  assert.ok(cs.some(x => x.group === '[Channel2]' && x.key === 'play' && x.midino === '0x21'), 'play written on the custom control message');
  assert.ok(!cs.some(x => x.key === 'FixtureCtl.wheelTurn'), 'old custom key no longer written');

  const vimp = importVdj(fx('vdj-definition.xml'), fx('vdj-mapper.xml'));
  const weird = vimp.model.controls.find(x => x.custom);
  const v = updateControl(vimp.model, weird.id, { function: { id: 'play', deck: 2, args: {} } });
  const out = exportVdj(v.model, { name: 'R' });
  assert.deepEqual(out.errors, []);
  const map = kids(parseXml(out.files[1].content).root, 'map').find(mp => mp.attrs.value === 'WEIRD');
  assert.ok(/play_pause/.test(map.attrs.action), map.attrs.action);
  // a stored model that already holds both (saved before the fix) also exports the function
  const both = model([{ label: 'x', midi: { type: 'note', channel: 1, number: 5 }, kind: 'button', function: { id: 'play', deck: 1 }, custom: { target: 'mixxx', group: '[X]', key: 'Old.key', options: ['script-binding'] } }]);
  const r2 = exportMixxx(both, { name: 'R' });
  assert.ok(controlsOf(r2.files[0].content).some(x => x.key === 'play') && !r2.files[0].content.includes('Old.key'));
});

test('regression: imported Mixxx entries sharing one MIDI message (custom vs custom, press/release keys) export', () => {
  const groups = mixxxDoc(mxCtl('[Channel1]', 'X.a', '0x90', '0x0B', ['script-binding']) + mxCtl('[Channel3]', 'X.a', '0x90', '0x0B', ['script-binding']));
  const pr = mixxxDoc(mxCtl('[Channel1]', 'X.press', '0x90', '0x0B', ['script-binding']) + mxCtl('[Channel1]', 'X.release', '0x80', '0x0B', ['script-binding']));
  for (const xml of [groups, pr]) {
    const imp = importMixxx(xml);
    const v = validateModel(normalizeModel(imp.model), { target: 'mixxx' });
    assert.deepEqual(v.errors, [], JSON.stringify(v.errors));
    const r = exportMixxx(imp.model, { name: 'R' });
    assert.deepEqual(r.errors, []);
    const want = controlsOf(xml).map(c => `${c.group}|${c.key}|${c.status}|${c.midino}`).sort();
    assert.deepEqual(controlsOf(r.files[0].content).map(c => `${c.group}|${c.key}|${c.status}|${c.midino}`).sort(), want, 'written back unchanged');
  }
  assert.ok(validateModel(normalizeModel(importMixxx(groups).model)).warnings.some(w => w.code === 'DUPLICATE_CUSTOM'), 'custom vs custom warns');
  // custom vs a new function on the same message still blocks
  const mix = importMixxx(mixxxDoc(mxCtl('[Channel1]', 'X.a', '0x90', '0x0B', ['script-binding']) + mxCtl('[Channel1]', 'play', '0x90', '0x0B', ['normal'])));
  assert.ok(validateModel(normalizeModel(mix.model)).errors.some(e => e.code === 'DUPLICATE_BINDING'));
});

// ------------------------------------------------------------------ Mixxx options and scripts

test('regression: Mixxx option modifiers (invert, switch, soft-takeover) survive import -> export', () => {
  const xml = mixxxDoc(mxCtl('[Channel1]', 'rate', '0xB0', '0x09', ['invert']) + mxCtl('[Channel1]', 'pfl', '0x90', '0x1B', ['switch'])
    + mxCtl('[Master]', 'crossfader', '0xB0', '0x1F', ['soft-takeover']) + mxCtl('[Library]', 'MoveVertical', '0xB0', '0x40', ['selectknob', 'invert']));
  const imp = importMixxx(xml);
  assert.deepEqual(imp.model.controls.filter(c => c.function).map(c => c.function.id).sort(), ['browse', 'crossfader', 'pfl', 'pitch']);
  const r = exportMixxx(imp.model, { name: 'R' });
  assert.deepEqual(r.errors, []);
  const opt = key => controlsOf(r.files[0].content).find(c => c.key === key).options;
  assert.deepEqual(opt('rate'), ['invert']);
  assert.deepEqual(opt('pfl'), ['switch']);
  assert.deepEqual(opt('crossfader'), ['soft-takeover']);
  assert.deepEqual(opt('MoveVertical'), ['selectknob', 'invert']);
  assert.deepEqual(comparable(importMixxx(r.files[0].content).model), comparable(imp.model), 'stable round trip');
  // the stored options belong to the function they were imported with
  const pitch = imp.model.controls.find(c => c.function?.id === 'pitch');
  const changed = updateControl(imp.model, pitch.id, { function: { id: 'volume', deck: 1, args: {} } });
  assert.equal(changed.model.controls.find(c => c.id === changed.id).mixxxOptions, undefined);
});

test('regression: controls sharing a function get their own script function (shift guard, encoder state)', () => {
  const base = [
    { label: 'Shift', midi: { type: 'note', channel: 1, number: 1 }, kind: 'button', function: { id: 'shift' } },
    { label: 'Jog top', midi: { type: 'cc', channel: 1, number: 0x21, encoding: 'relative-offset64' }, kind: 'relative', function: { id: 'jog', deck: 1, args: { action: 'rotate' } } },
    { label: 'Jog ring', midi: { type: 'cc', channel: 1, number: 0x22, encoding: 'relative-offset64' }, kind: 'relative', function: { id: 'jog', deck: 1, args: { action: 'rotate' } } },
    { label: 'Jog ring shift', midi: { type: 'cc', channel: 1, number: 0x22, encoding: 'relative-offset64' }, kind: 'relative', layer: 'shift', function: { id: 'jog', deck: 1, args: { action: 'search' } } },
  ];
  const r = exportMixxx(model(base), { name: 'R' });
  assert.deepEqual(r.errors, []);
  const cs = controlsOf(r.files[0].content);
  const fnOf = midino => cs.find(c => c.midino === midino && /\.b_/.test(c.key)).key.split('.')[1];
  assert.notEqual(fnOf('0x21'), fnOf('0x22'), 'base controls on different messages do not share a guarded body');
  const body = name => r.files[1].content.split(`P.${name} = function`)[1].split('};')[0];
  assert.ok(!/P\.shifted/.test(body(fnOf('0x21'))), 'top jog is unguarded');
  assert.ok(/if \(P\.shifted\) \{ return; \}/.test(body(fnOf('0x22'))), 'ring jog is guarded while Shift is held');
  assert.deepEqual(comparable(importMixxx(r.files[0].content, [r.files[1]]).model), comparable(model(base)), 'disambiguated names read back');

  const wrap = n => ({ label: `W${n}`, midi: { type: 'cc', channel: 1, number: n, encoding: 'absolute-wrap' }, kind: 'relative', function: { id: 'jog', deck: 1, args: { action: 'rotate' } } });
  const w = exportMixxx(model([wrap(0x30), wrap(0x31)]), { name: 'R' });
  assert.deepEqual(w.errors, []);
  const lastKeys = [...w.files[1].content.matchAll(/P\.last\[("[^"]+")\] = value/g)].map(m => m[1]);
  assert.equal(new Set(lastKeys).size, 2, `each wrap encoder keeps its own state: ${lastKeys}`);
  assert.deepEqual(comparable(importMixxx(w.files[0].content, [w.files[1]]).model), comparable(model([wrap(0x30), wrap(0x31)])));
  // identical controls without shared state still share one function
  const plain = exportMixxx(model([base[0], base[1], { ...base[1], label: 'J2', midi: { ...base[1].midi, number: 0x23 } }]), { name: 'R' });
  assert.equal((plain.files[1].content.match(/P\.b_jog_d1_rotate_e64/g) || []).length, 1);
});

test('regression: a relative function on an absolute control warns KIND_MISMATCH', () => {
  const m = model([{ label: 'Browse', midi: { type: 'cc', channel: 7, number: 0x40 }, kind: 'absolute', function: { id: 'browse', args: { action: 'rotate' } } }]);
  const v = validateModel(m, { target: 'mixxx' });
  assert.deepEqual(v.warnings.map(w => w.code), ['KIND_MISMATCH']);
  assert.match(v.warnings[0].message, /rotary encoder/);
});

test('regression: LED on a hot cue set/clear control survives the Mixxx round trip (AC-5)', () => {
  const m = model([
    { label: 'Set 1', midi: { type: 'note', channel: 1, number: 10 }, kind: 'button', function: { id: 'hotcue', deck: 1, args: { action: 'set', n: 1 } }, feedback: { led: { type: 'note', channel: 1, number: 10 } } },
    { label: 'Clear 2', midi: { type: 'note', channel: 1, number: 11 }, kind: 'button', function: { id: 'hotcue', deck: 1, args: { action: 'clear', n: 2 } }, feedback: { led: { type: 'note', channel: 1, number: 11 } } },
  ]);
  const r = exportMixxx(m, { name: 'R' });
  const back = importMixxx(r.files[0].content);
  assert.equal(back.model.preserved?.mixxx?.outputs?.length ?? 0, 0, 'no stray preserved outputs');
  assert.deepEqual(comparable(back.model), comparable(m));
});

test('regression: preserved scripts between 512 KB and 1 MB do not block the Mixxx export', () => {
  const xml = `<MixxxControllerPreset schemaVersion="1"><info><name>R</name></info><controller id="R"><scriptfiles><file filename="Big.js" functionprefix="Big"/></scriptfiles><controls>${mxCtl('[Channel1]', 'play', '0x90', '0x0B', ['normal'])}</controls></controller></MixxxControllerPreset>`;
  const content = '// x\n'.repeat(120_000); // 600 KB
  const imp = importMixxx(xml, [{ name: 'Big.js', content }]);
  assert.equal(imp.preservedRaw.length, 1);
  const r = exportMixxx(imp.model, { name: 'R', scripts: imp.preservedRaw });
  assert.deepEqual(r.errors, []);
  assert.equal(r.files.find(f => f.name === 'Big.js')?.content, content);
});

// ------------------------------------------------------------------ save path

test('regression: names with C1 control characters are cleaned like Rust validates them', () => {
  assert.equal(cleanText('My\u0086Deck\u0085One\u009fX'), 'My Deck One X');
  const imp = importMixxx('<MixxxControllerPreset><info><name>My&#134;Deck</name></info><controller id="x"><controls/></controller></MixxxControllerPreset>');
  assert.ok(imp.ok);
  assert.ok(![...imp.model.name].some(ch => ch.charCodeAt(0) >= 0x80 && ch.charCodeAt(0) <= 0x9f), JSON.stringify(imp.model.name));
  assert.equal(checkSavable({ name: 'A\u0086B', model: imp.model }).name, 'A B');
});

test('regression: browser-mode save refuses a 51st mapping instead of deleting the oldest', async () => {
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const store = createMapperStore({ api: null, storage });
  const m = model([]);
  const first = await store.save({ name: 'first', model: m });
  for (let i = 1; i < 50; i++) await store.save({ name: `m${i}`, model: m });
  await assert.rejects(store.save({ name: 'one too many', model: m }), /Delete a saved mapping/);
  const rows = await store.list();
  assert.equal(rows.length, 50);
  assert.ok(rows.some(r => r.id === first.id), 'oldest mapping still there');
  await store.save({ id: first.id, name: 'first edited', model: m });
  assert.equal((await store.list()).length, 50, 'editing an existing mapping at the cap still works');
});

// ------------------------------------------------------------------ control caps

test('regression: importers cap controls at LIMITS.maxControls with one summary warning', () => {
  const n = LIMITS.maxControls * 2;
  const defs = Array.from({ length: n }, (_, i) => `<button note="0x${(i % 128).toString(16)}" channel="${Math.floor(i / 128) % 16}" name="B${i}" deck="1"/>`).join('');
  const maps = Array.from({ length: n }, (_, i) => `<map value="B${i}" action="shift ? sync : play_pause"/>`).join('');
  const v = importVdj(`<device name="Big" type="MIDI">${defs}</device>`, `<mapper device="Big">${maps}</mapper>`);
  assert.ok(v.ok, JSON.stringify(v.error));
  assert.equal(v.model.controls.length, LIMITS.maxControls);
  assert.equal(v.warnings.filter(w => /Only the first 2048 controls/.test(w)).length, 1);
  const xml = mixxxDoc(Array.from({ length: n }, (_, i) => mxCtl('[X]', `Y.k${i}`, `0x${(0x90 + Math.floor(i / 128) % 16).toString(16)}`, `0x${(i % 128).toString(16)}`, ['script-binding'])).join(''));
  const mx = importMixxx(xml);
  assert.ok(mx.ok);
  assert.equal(mx.model.controls.length, LIMITS.maxControls);
  assert.equal(mx.warnings.filter(w => /Only the first 2048 controls/.test(w)).length, 1);
});
