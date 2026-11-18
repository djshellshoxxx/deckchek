// FS-32 §7: the mapper's XML reader refuses DTDs/entities and oversized or over-deep input without throwing, and
// the writer always produces well-formed, escaped XML, including for hostile names.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseXml, writeXml, el, tx, escapeText, escapeAttr, stripInvalidXmlChars, utf8Length, XML_LIMITS, kids, childText } from '../app/mapper/xml.js';
import { exportMixxx, importMixxx } from '../app/mapper/mixxx.js';
import { exportVdj, importVdj } from '../app/mapper/vdj.js';
import { createModel, cleanText } from '../app/mapper/model.js';
import vm from 'node:vm';

const fixture = name => fs.readFileSync(new URL(`./fixtures/mapper/${name}`, import.meta.url), 'utf8');

test('parses elements, attributes, text, CDATA, comments, PIs, BOM and CRLF', () => {
  const r = parseXml('\uFEFF<?xml version="1.0"?>\r\n<!-- c --><a x="1" y=\'two\'>\r\n<b>t&amp;u &lt;&#65;&#x42;</b><![CDATA[<raw>&]]><?pi x?><c/></a>\r\n');
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.equal(r.root.name, 'a');
  assert.deepEqual({ ...r.root.attrs }, { x: '1', y: 'two' });
  assert.equal(childText(r.root, 'b'), 't&u <AB');
  assert.ok(r.root.text.includes('<raw>&'));
  assert.equal(kids(r.root, 'c').length, 1);
  assert.equal(r.root.children[0].line, 3);
});

test('XXE: DOCTYPE and ENTITY declarations are rejected outright (fixture with a SYSTEM entity)', () => {
  const r = parseXml(fixture('xxe.midi.xml'));
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'XML_DTD_FORBIDDEN');
  assert.equal(r.error.line, 2);
  const lol = '<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]><l>&b;</l>';
  assert.equal(parseXml(lol).error.code, 'XML_DTD_FORBIDDEN', 'billion laughs');
  assert.equal(parseXml('<a><!ENTITY x "y"></a>').error.code, 'XML_DTD_FORBIDDEN');
  assert.equal(parseXml('<a>&secret;</a>').error.code, 'XML_ENTITY', 'undeclared named entity is not expanded');
  assert.equal(parseXml('<a b="&ext;"/>').error.code, 'XML_ENTITY');
  assert.equal(importMixxx(fixture('xxe.midi.xml')).error.code, 'XML_DTD_FORBIDDEN');
});

test('size, element, attribute and depth caps reject input before it can grow', () => {
  assert.equal(parseXml('<a>' + 'x'.repeat(XML_LIMITS.maxBytes) + '</a>').error.code, 'XML_TOO_LARGE');
  assert.equal(parseXml('<a>é</a>', { maxBytes: 8 }).error.code, 'XML_TOO_LARGE', 'byte length, not character count');
  assert.equal(parseXml('<r>' + '<e/>'.repeat(20) + '</r>', { maxElements: 10 }).error.code, 'XML_LIMIT');
  assert.equal(parseXml(`<r ${Array.from({ length: 70 }, (_, i) => `a${i}="1"`).join(' ')}/>`).error.code, 'XML_LIMIT');
  assert.equal(parseXml('<a>'.repeat(100) + '</a>'.repeat(100)).error.code, 'XML_LIMIT');
  assert.equal(parseXml(`<${'n'.repeat(200)}/>`).error.code, 'XML_LIMIT');
});

test('malformed XML returns a typed error with line and column, never throws', () => {
  const cases = ['', '   ', 'text', '<a>', '<a></b>', '<a b=1/>', '<a b="1" b="2"/>', '<a>x & y</a>', '<a/><b/>', '<a>]]></a>', '<a b="<"/>', '<!-- open', '<a><![CDATA[x</a>', '<a>&#0;</a>', '<a>&#xD800;</a>', 42, null];
  for (const c of cases) {
    const r = parseXml(c);
    assert.equal(r.ok, false, JSON.stringify(c));
    assert.ok(r.error.code && r.error.message, JSON.stringify(c));
  }
  const r = parseXml('<a>\n  <b>\n</a>');
  assert.equal(r.error.line, 3);
  assert.ok(/line 3, column 1/.test(r.error.message));
});

test('random byte soup never throws from the parser or the importers', () => {
  let seed = 12345;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const alphabet = '<>/="\'&;!?[]-abcXYZ \n\t#x0123456789CDATA DOCTYPE ENTITY';
  for (let i = 0; i < 400; i++) {
    let s = '';
    const len = rnd(200);
    for (let k = 0; k < len; k++) s += alphabet[rnd(alphabet.length)];
    assert.doesNotThrow(() => parseXml(s));
    assert.doesNotThrow(() => importMixxx(s));
    assert.doesNotThrow(() => importVdj(s, s));
  }
});

test('writer escapes text and attributes and drops characters XML cannot carry', () => {
  assert.equal(escapeText('a<b>&]]>'), 'a&lt;b&gt;&amp;]]&gt;');
  assert.equal(escapeAttr('"\'<&>\n'), '&quot;&apos;&lt;&amp;&gt;&#10;');
  assert.equal(stripInvalidXmlChars('a\u0000b\u0007c￾d\uD800e\u{1F3A7}'), 'abcde\u{1F3A7}');
  assert.equal(utf8Length('é\u{1F3A7}'), 6);
  assert.throws(() => writeXml(el('bad name')), /Invalid XML name/);
  const doc = writeXml(el('r', { a: 'x"y', skip: null }, tx('t', 'a<b'), el('e'), { comment: 'no -- dashes' }));
  assert.ok(parseXml(doc).ok);
  assert.ok(doc.includes('a="x&quot;y"') && !doc.includes('skip'));
});

const HOSTILE = [
  'Deck <1> & "Play"', "it's ]]> here", '</control><control><key>evil</key>', '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>',
  'Ünïcødé 🎧 デッキ', 'tab\tnew\nline\r', 'nul\u0000bell\u0007', '\uD800lone surrogate', 'x'.repeat(5000), '*/ alert(1) /*', '${x}`; process.exit()',
];

test('round trip: hostile names and labels give well-formed Mixxx and VirtualDJ files that read back (FS-32 §7)', () => {
  for (const name of HOSTILE) {
    const m = createModel({ name, decks: 2 });
    m.controls = [
      { label: name, midi: { type: 'note', channel: 1, number: 11 }, kind: 'button', layer: 'base', function: { id: 'play', deck: 1, args: {} } },
      { label: name + ' shift', midi: { type: 'note', channel: 1, number: 63 }, kind: 'button', layer: 'base', function: { id: 'shift', deck: null, args: {} } },
      { label: name, midi: { type: 'note', channel: 1, number: 12 }, kind: 'button', layer: 'shift', function: { id: 'cue', deck: 1, args: {} } },
    ];
    const mx = exportMixxx(m, { name, author: name, description: name });
    assert.deepEqual(mx.errors, [], name.slice(0, 30));
    for (const f of mx.files) assert.ok(/^[A-Za-z0-9 ._-]+$/.test(f.name), `safe file name: ${f.name}`);
    const xml = mx.files[0].content;
    const parsed = parseXml(xml);
    assert.ok(parsed.ok, `well-formed for ${JSON.stringify(name.slice(0, 30))}: ${parsed.error?.message}`);
    assert.equal(kids(kids(parsed.root, 'controller')[0], 'controls')[0].children.filter(c => c.name === 'control').length, 5 + 0, 'no injected <control>');
    assert.equal(childText(kids(parsed.root, 'info')[0], 'name'), stripInvalidXmlChars(cleanText(name)), 'name survives, escaped');
    const js = mx.files[1].content;
    const [header, ...code] = js.split('\n');
    assert.ok(header.startsWith('// ') && /^\/\/ [A-Za-z0-9 ._-]*: Mixxx/.test(header), 'the name only reaches a one-line comment, reduced to safe characters');
    const prefix = /^var ([^ ]+) = \{\};$/m.exec(js)[1];
    assert.match(prefix, /^DeckChek(_[A-Za-z0-9]{1,32})?$/, 'function prefix is a plain identifier');
    assert.ok(!/alert|process|ENTITY|<\/control>|\$\{/.test(code.join('\n').split(prefix).join('')), 'name never reaches script code');
    assert.doesNotThrow(() => new vm.Script(js), 'generated script compiles (not run)');
    const back = importMixxx(xml, []);
    assert.ok(back.ok);
    assert.equal(back.model.controls.filter(c => c.function).length, 3);
    const vdj = exportVdj(m, { name, author: name });
    assert.deepEqual(vdj.errors, []);
    for (const f of vdj.files) assert.ok(parseXml(f.content).ok, `VDJ well-formed: ${f.name}`);
    const vb = importVdj(vdj.files[0].content, vdj.files[1].content);
    assert.ok(vb.ok);
    assert.equal(vb.model.controls.filter(c => c.function).length, 3);
  }
});
