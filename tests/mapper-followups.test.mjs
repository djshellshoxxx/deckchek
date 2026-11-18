// FS-32 integration follow-ups (mapper): capped status messages, version-safe saves, Mixxx option/LED/note-off
// handling. Fixtures are self-authored inline strings (no Mixxx file is copied).
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const { summariseWarnings, importTexts, capMessage, STATUS_MESSAGE_MAX } = await import('../app/ui/screens/mapper.js');
const { exportMixxx, importMixxx } = await import('../app/mapper/mixxx.js');
const { sanitizeModel, MODEL_VERSION } = await import('../app/mapper/model.js');
const { createMapperStore, MapperVersionError } = await import('../app/mapper/store.js');
const { parseXml, kids, kid, childText } = await import('../app/mapper/xml.js');

const controlsOf = xml => kids(kid(kid(parseXml(xml).root, 'controller'), 'controls'), 'control').map(c => ({ group: childText(c, 'group'), key: childText(c, 'key'), status: childText(c, 'status'), midino: childText(c, 'midino'), options: kid(c, 'options').children.map(o => o.name) }));
const mxCtl = (group, key, status, midino, options) => `<control><group>${group}</group><key>${key}</key><status>${status}</status><midino>${midino}</midino><options>${options.map(o => `<${o}/>`).join('')}</options></control>`;
const mxOut = (group, key, status, midino) => `<output><group>${group}</group><key>${key}</key><status>${status}</status><midino>${midino}</midino><on>0x7F</on><off>0x00</off><minimum>0.5</minimum></output>`;
const mixxxDoc = (controls, outputs = '', scripts = '') => `<?xml version="1.0"?><MixxxControllerPreset schemaVersion="1"><info><name>R</name></info><controller id="R"><scriptfiles>${scripts}</scriptfiles><controls>${controls}</controls><outputs>${outputs}</outputs></controller></MixxxControllerPreset>`;
const model = controls => sanitizeModel({ version: 1, name: 'R', decks: 2, controls }).model;

// ------------------------------------------------------------------ (1) live-region message length

test('regression: a crafted Mixxx file whose script list makes a megabyte warning stays short in the live status', () => {
  const files = Array.from({ length: 4000 }, (_, i) => `<file filename="${String(i).padStart(4, '0')}${'n'.repeat(250)}.js" functionprefix="P${i}"/>`).join('');
  const xml = mixxxDoc(mxCtl('[Channel1]', 'play', '0x90', '0x0B', ['normal']), '', files);
  assert.ok(xml.length > 1_000_000 && xml.length < 5 * 1024 * 1024);
  const imp = importMixxx(xml);
  assert.ok(imp.ok, JSON.stringify(imp.error));
  const longest = Math.max(...imp.warnings.map(w => w.length));
  assert.ok(longest < 1000, `script-file warning is ${longest} chars`);
  const scriptWarning = imp.warnings.find(w => /script file/.test(w));
  assert.ok(/and 3995 more/.test(scriptWarning), scriptWarning);
  assert.ok(!scriptWarning.includes('n'.repeat(81)), 'each file name is cut to 80 characters');
  const r = importTexts([{ name: 'big.midi.xml', text: xml }]);
  assert.ok(r.ok);
  assert.ok(summariseWarnings(r.warnings).length < 2000);
});

test('regression: each warning or error placed in the live status is capped at 300 characters with an ellipsis', () => {
  const mb = 'x'.repeat(1024 * 1024);
  assert.equal(STATUS_MESSAGE_MAX, 300);
  const one = capMessage(mb);
  assert.equal(one.length, STATUS_MESSAGE_MAX);
  assert.ok(one.endsWith('…'));
  assert.equal(capMessage('short'), 'short');
  assert.equal(capMessage(null), '');
  const s = summariseWarnings([mb, mb, mb, mb, mb, mb, mb]);
  assert.ok(s.length < 5 * STATUS_MESSAGE_MAX + 200, `${s.length} chars`);
  assert.ok(/and 2 more notes/.test(s));
  assert.ok(summariseWarnings([mb]).length <= STATUS_MESSAGE_MAX);
});

// ------------------------------------------------------------------ (2) never overwrite a newer row (browser store)

test('regression: browser store save refuses to overwrite a row with a newer model version (typed error)', async () => {
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const store = createMapperStore({ api: null, storage });
  const v1 = model([]);
  const row = await store.save({ name: 'mine', model: v1 });
  // Another (newer) DeckChek wrote version MODEL_VERSION + 1 into the same row.
  const rows = JSON.parse(mem.get('deckchek.mapper.v1'));
  rows[0].model = { ...rows[0].model, version: MODEL_VERSION + 1, futureField: 'keep' };
  mem.set('deckchek.mapper.v1', JSON.stringify(rows));
  await assert.rejects(store.save({ id: row.id, name: 'mine', model: v1 }), e => e instanceof MapperVersionError && e.code === 'MAPPER_NEWER_VERSION' && /newer DeckChek/.test(e.message));
  const after = JSON.parse(mem.get('deckchek.mapper.v1'))[0];
  assert.equal(after.model.version, MODEL_VERSION + 1);
  assert.equal(after.model.futureField, 'keep');
  // A stored version greater than the incoming one is refused even when both are "known".
  rows[0].model = { ...rows[0].model, version: 3 };
  mem.set('deckchek.mapper.v1', JSON.stringify(rows));
  await assert.rejects(store.save({ id: row.id, name: 'mine', model: { ...v1, version: 2 } }), { code: 'MAPPER_NEWER_VERSION' });
  // Same version saves as before.
  rows[0].model = { ...rows[0].model, version: MODEL_VERSION };
  mem.set('deckchek.mapper.v1', JSON.stringify(rows));
  assert.equal((await store.save({ id: row.id, name: 'again', model: v1 })).name, 'again');
  // Desktop: the Rust refusal string becomes the same typed error; other errors pass through unchanged.
  const native = createMapperStore({ api: { core: { invoke: async () => { throw 'MAPPER_NEWER_VERSION: this mapping was saved by a newer DeckChek (model version 2) and is not overwritten'; } } } });
  await assert.rejects(native.save({ id: 'x', name: 'n', model: v1 }), e => e instanceof MapperVersionError && e.version === 2);
  const other = createMapperStore({ api: { core: { invoke: async () => { throw 'MAPPER_DB: locked'; } } } });
  await assert.rejects(other.save({ name: 'n', model: v1 }), e => e === 'MAPPER_DB: locked');
});

// ------------------------------------------------------------------ (4) Mixxx options, LEDs, note-off twins

test('regression: a derived selectknob/diff drops conflicting preserved transforms (rot64, spread64, …) with a warning', () => {
  const enc = (n, encoding, opts) => ({ label: `E${n}`, midi: { type: 'cc', channel: 1, number: n, encoding }, kind: 'relative', function: { id: 'browse', args: { action: 'rotate' } }, mixxxOptions: opts });
  const m = model([enc(0x40, 'relative-two-complement', ['rot64', 'invert']), enc(0x41, 'absolute-wrap', ['spread64', 'soft-takeover'])]);
  const r = exportMixxx(m, { name: 'R' });
  assert.deepEqual(r.errors, []);
  const cs = controlsOf(r.files[0].content);
  assert.deepEqual(cs.find(c => c.midino === '0x40').options, ['selectknob', 'invert'], 'rot64 dropped, invert kept');
  assert.deepEqual(cs.find(c => c.midino === '0x41').options, ['diff', 'soft-takeover'], 'spread64 dropped, soft-takeover kept');
  const w = r.warnings.filter(x => x.code === 'MIXXX_OPTIONS_DROPPED');
  assert.equal(w.length, 2);
  assert.ok(/rot64/.test(w[0].message) && /selectknob/.test(w[0].message), w[0].message);
  // Imported file with selectknob + rot64 on a recognised control: exported once, without rot64.
  const imp = importMixxx(mixxxDoc(mxCtl('[Library]', 'MoveVertical', '0xB0', '0x40', ['selectknob', 'rot64'])));
  const out = exportMixxx(imp.model, { name: 'R' });
  assert.deepEqual(controlsOf(out.files[0].content)[0].options, ['selectknob']);
  assert.ok(out.warnings.some(x => x.code === 'MIXXX_OPTIONS_DROPPED'));
  // An absolute control keeps a preserved transform (nothing derived to conflict with).
  const abs = importMixxx(mixxxDoc(mxCtl('[Channel1]', 'rate', '0xB0', '0x09', ['rot64'])));
  assert.deepEqual(controlsOf(exportMixxx(abs.model, { name: 'R' }).files[0].content)[0].options, ['rot64']);
});

test('regression: an imported LED output attaches to the control whose MIDI message matches it', () => {
  const xml = mixxxDoc(mxCtl('[Channel1]', 'hotcue_1_clear', '0x90', '0x10', ['normal']) + mxCtl('[Channel1]', 'hotcue_1_set', '0x90', '0x11', ['normal']),
    mxOut('[Channel1]', 'hotcue_1_enabled', '0x90', '0x11'));
  const imp = importMixxx(xml);
  assert.ok(imp.ok);
  const byNo = n => imp.model.controls.find(c => c.midi.number === n);
  assert.equal(byNo(0x10).feedback ?? null, null, 'the clear button (other message) gets no LED');
  assert.equal(byNo(0x11).feedback?.led?.number, 0x11, 'the set button (same message) gets the LED');
  // No matching message: the first candidate still takes it (unchanged behaviour).
  const other = importMixxx(mixxxDoc(mxCtl('[Channel1]', 'hotcue_1_clear', '0x90', '0x10', ['normal']) + mxCtl('[Channel1]', 'hotcue_1_set', '0x90', '0x11', ['normal']),
    mxOut('[Channel1]', 'hotcue_1_enabled', '0x90', '0x30')));
  assert.equal(other.model.controls.find(c => c.midi.number === 0x10).feedback?.led?.number, 0x30);
});

test('regression: a lone 0x8n custom entry on the message of a generated note-off twin warns DUPLICATE_NOTE_OFF', () => {
  const xml = mixxxDoc(mxCtl('[Channel1]', 'Other.release', '0x80', '0x0C', ['script-binding']) + mxCtl('[Channel1]', 'cue_default', '0x90', '0x0C', ['normal']));
  const imp = importMixxx(xml);
  assert.ok(imp.ok);
  const r = exportMixxx(imp.model, { name: 'R' });
  assert.deepEqual(r.errors, []);
  const offs = controlsOf(r.files[0].content).filter(c => c.status === '0x80' && c.midino === '0x0C');
  assert.equal(offs.length, 2, 'both entries are still written');
  const w = r.warnings.find(x => x.code === 'DUPLICATE_NOTE_OFF');
  assert.ok(w, JSON.stringify(r.warnings));
  assert.equal(w.controlIds.length, 2);
  assert.ok(/note-off/i.test(w.message));
  // No collision, no warning: the lone note-off on another number.
  const ok = exportMixxx(importMixxx(mixxxDoc(mxCtl('[Channel1]', 'Other.release', '0x80', '0x0D', ['script-binding']) + mxCtl('[Channel1]', 'cue_default', '0x90', '0x0C', ['normal']))).model, { name: 'R' });
  assert.ok(!ok.warnings.some(x => x.code === 'DUPLICATE_NOTE_OFF'));
  // The generated twin of a scripted (shift-layer) control collides the same way.
  const sh = model([{ label: 'Shift', midi: { type: 'note', channel: 1, number: 1 }, kind: 'button', function: { id: 'shift' } },
    { label: 'Cue S', midi: { type: 'note', channel: 1, number: 0x0C }, kind: 'button', layer: 'shift', function: { id: 'cue', deck: 1 } },
    { label: 'Rel', midi: { type: 'note', channel: 1, number: 0x0C }, kind: 'button', custom: { target: 'mixxx', group: '[X]', key: 'Y.z', options: ['script-binding'], status: 0x80 } }]);
  assert.ok(exportMixxx(sh, { name: 'R' }).warnings.some(x => x.code === 'DUPLICATE_NOTE_OFF'));
});
