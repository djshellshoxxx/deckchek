// FS-32 mapper screen controller helpers (pure; the DOM flow is covered by tools/smoke/mapper.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const { buildExport, rowFlags, classifyFiles, sniffXml, importTexts, savedMessage, createUndo, filterFunctions, targetById, EMPTY_TEXT, COPY_HINTS } = await import('../app/ui/screens/mapper.js');
const { FEATURES } = await import('../app/features.js');
const { validateModel } = await import('../app/mapper/validate.js');

const fx = name => fs.readFileSync(new URL(`./fixtures/mapper/${name}`, import.meta.url), 'utf8');
const golden = () => JSON.parse(fx('golden-model.json'));

test('flag mapperStudio is wired and off by default', () => {
  assert.equal(FEATURES.mapperStudio.wired, true);
  assert.equal(FEATURES.mapperStudio.default, false);
  assert.equal(FEATURES.mapperStudio.spec, 'FS-32');
});

test('AC-6: buildExport gives files for Mixxx/VirtualDJ and a labelled report for Traktor/Serato', () => {
  const mx = buildExport(golden(), 'mixxx', { name: 'G' });
  assert.deepEqual(mx.files.map(f => f.name), ['G.midi.xml', 'G-scripts.js']);
  assert.equal(mx.report, false);
  const vdj = buildExport(golden(), 'vdj', { name: 'G', force: true });
  assert.deepEqual(vdj.files.map(f => f.name), ['Devices/force-G.xml', 'Mappers/G.xml']);
  const tr = buildExport(golden(), 'traktor', { name: 'G' });
  assert.equal(tr.report, true);
  assert.deepEqual(tr.files.map(f => f.name), ['G Traktor report.md']);
  assert.ok(/Report only/.test(tr.files[0].content));
  const se = buildExport(golden(), 'serato', { name: 'G' });
  assert.ok(/experimental/i.test(se.files[0].content));
  assert.equal(targetById('serato').status, 'Experimental');
  assert.equal(targetById('traktor').status, 'Report only');
  assert.equal(targetById('nope').id, 'mixxx');
  assert.equal(buildExport(null, 'mixxx').errors[0].code, 'MODEL_INVALID');
});

test('AC-4: rowFlags marks both conflicting rows "Conflict" (words, not colour)', () => {
  const m = { version: 1, name: 'x', decks: 2, controls: [
    { id: 'a', label: 'A', midi: { type: 'note', channel: 1, number: 1, status: 0x90 }, kind: 'button', layer: 'base', function: { id: 'play', deck: 1, args: {} } },
    { id: 'b', label: 'B', midi: { type: 'note', channel: 1, number: 1, status: 0x90 }, kind: 'button', layer: 'base', function: { id: 'cue', deck: 1, args: {} } },
    { id: 'c', label: 'C', midi: { type: 'cc', channel: 1, number: 2, status: 0xb0 }, kind: 'absolute', layer: 'base', function: { id: 'play', deck: 1, args: {} } },
    { id: 'd', label: 'D', midi: { type: 'cc', channel: 1, number: 3, status: 0xb0 }, kind: 'absolute', layer: 'base', function: null },
  ] };
  assert.deepEqual(rowFlags(validateModel(m)), { a: 'Conflict', b: 'Conflict', c: 'Check' });
  assert.deepEqual(rowFlags(null), {});
});

test('classifyFiles checks size and type before anything is read', () => {
  const f = (name, size) => ({ name, size });
  const c = classifyFiles([f('a.json', 10), f('b.midi.xml', 10), f('c.js', 10), f('d.exe', 10), f('e.xml', 5 * 1024 * 1024 + 1)]);
  assert.deepEqual([c.json.length, c.xml.length, c.js.length], [1, 1, 1]);
  assert.equal(c.rejected.length, 2);
  assert.ok(c.rejected.some(r => /larger than 5 MB/.test(r)));
  assert.ok(/at most 18/.test(classifyFiles(Array.from({ length: 19 }, (_, i) => f(`${i}.xml`, 1))).rejected[0]));
  assert.equal(classifyFiles([{ name: 'x.xml' }]).rejected.length, 1, 'unknown size is refused');
  assert.ok(/larger than 20 MB/.test(classifyFiles(Array.from({ length: 5 }, (_, i) => f(`${i}.xml`, 4.5 * 1024 * 1024))).rejected[0]));
});

test('sniffXml and importTexts route each file to the right importer', () => {
  assert.equal(sniffXml(fx('third-party.midi.xml')).kind, 'mixxx');
  assert.equal(sniffXml(fx('vdj-definition.xml')).kind, 'vdj-definition');
  assert.equal(sniffXml(fx('vdj-mapper.xml')).kind, 'vdj-mapper');
  assert.equal(sniffXml(fx('vdj-legacy.xml')).kind, 'vdj-legacy');
  assert.equal(sniffXml('<x/>').kind, 'unknown');
  assert.equal(sniffXml(fx('xxe.midi.xml')).error.code, 'XML_DTD_FORBIDDEN');
  const mixxx = importTexts([{ name: 'third-party.midi.xml', text: fx('third-party.midi.xml') }, { name: 'Fixture-Controller-scripts.js', text: fx('Fixture-Controller-scripts.js') }]);
  assert.ok(mixxx.ok && mixxx.source === 'Mixxx mapping' && mixxx.scripts.length === 1);
  const vdj = importTexts([{ name: 'm.xml', text: fx('vdj-mapper.xml') }, { name: 'd.xml', text: fx('vdj-definition.xml') }]);
  assert.ok(vdj.ok && vdj.source === 'VirtualDJ mapping');
  assert.ok(/together with its device definition/.test(importTexts([{ name: 'm.xml', text: fx('vdj-mapper.xml') }]).error.message));
  const learned = importTexts([{ name: 'learned-map.json', text: fx('learned-map.json') }]);
  assert.ok(learned.ok && learned.model.controls.length === 16 && learned.source === 'Learned map');
  const model = importTexts([{ name: 'golden.json', text: fx('golden-model.json') }]);
  assert.ok(model.ok && model.source === 'DeckChek mapping' && !model.readOnly);
  const newer = importTexts([{ name: 'n.json', text: JSON.stringify({ version: 9, name: 'n', controls: [] }) }]);
  assert.ok(newer.ok && newer.readOnly && /newer DeckChek/.test(newer.warnings[0]));
  const bad = importTexts([{ name: 'bad.json', text: '{\n"x": }' }]);
  assert.ok(!bad.ok && /^bad\.json: The file is not valid JSON \(line 2, column \d+\)/.test(bad.error.message));
  const broken = importTexts([{ name: 'b.xml', text: '<MixxxControllerPreset>\n<controller>\n</MixxxControllerPreset>' }]);
  assert.ok(!broken.ok && /line 3, column 1/.test(broken.error.message) && broken.error.line === 3);
  assert.ok(!importTexts([{ name: 'a.js', text: 'x' }]).ok);
});

test('savedMessage starts with "Saved." and says where to copy the files', () => {
  assert.ok(/^Saved\. Saved to \/x\. Copy both files to your Mixxx controllers folder/.test(savedMessage('mixxx', { path: '/x' })));
  assert.ok(/^Saved\. Copy the Devices file to Documents\/VirtualDJ\/Devices/.test(savedMessage('vdj', { path: null })));
  assert.ok(COPY_HINTS.traktor && COPY_HINTS.serato);
  assert.equal(EMPTY_TEXT, 'No MIDI map for this device. Learn controls or pick an official profile');
});

test('undo keeps independent snapshots and a bounded history', () => {
  const u = createUndo(3);
  const m = { a: 1 };
  u.push(m); m.a = 2; u.push(m); u.push(m); u.push(m);
  assert.equal(u.size, 3);
  assert.deepEqual(u.pop(), { a: 2 });
  u.clear();
  assert.equal(u.pop(), null);
});

test('function search matches labels, ids and categories', () => {
  assert.deepEqual(filterFunctions('hot').map(f => f.id), ['hotcue']);
  assert.ok(filterFunctions('mixer').some(f => f.id === 'eq'));
  assert.equal(filterFunctions('').length, 18);
  assert.equal(filterFunctions('zzz').length, 0);
});
