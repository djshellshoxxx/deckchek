// SPEC-34 device test completeness (app/devices/test-plan.js). Ported from PR9 (a4d844b) and
// extended for the explicit/conditional audio-output capability.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capabilitiesOf, audioOutCapability, requiredCapabilities, completePlan, auditProfile, coverageMatrix, METRICS_BY_METHOD, REQUIRED_METHOD } from '../app/devices/test-plan.js';
import { dispatchFor, methodLabel } from '../app/devices/dispatch.js';
import { validateProfile } from '../app/devices/library.js';
import { renderMarkdown, loadAll } from '../tools/check-device-coverage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'app', 'devices', 'profiles');
const PROFILES = loadAll(DIR);
const byId = id => PROFILES.find(p => p.id === id);
const methods = p => p.tests.map(t => t.method);

test('capabilitiesOf derives capabilities from the profile', () => {
  const a9 = capabilitiesOf(byId('pioneer-djm-a9'));
  assert.deepEqual({ ...a9 }, { physical: true, midi: true, usbMidi: true, dinMidi: false, midiMap: true, audioOut: true, audioIn: false, driver: true, software: true, timecode: true, gmSource: false });
  const xone = capabilitiesOf(byId('allen-heath-xone-23'));
  assert.equal(xone.usbMidi, null); assert.equal(xone.midi, null); assert.equal(xone.audioOut, true); assert.equal(xone.audioIn, true);
  const tt = capabilitiesOf(byId('technics-sl-1200mk4'));
  assert.equal(tt.audioOut, false); assert.equal(tt.usbMidi, null); assert.equal(tt.midi, null);
  assert.equal(capabilitiesOf({ category: 'turntable', connectivity: { audio: { usbChannelsOut: 2 } } }).audioOut, true);
  assert.equal(capabilitiesOf({ category: 'controller', midi: { generalMidi: true, controls: [] } }).gmSource, true);
});

test('audio output: researched data wins over category; unknown controllers are conditional', () => {
  assert.equal(audioOutCapability(byId('rane-twelve-mk2')), false, 'connectivity.audio: null means no built-in interface');
  assert.equal(audioOutCapability(byId('korg-nanokontrol2')), 'conditional', 'unknown output count on a controller');
  assert.equal(audioOutCapability(byId('traktor-audio-8-dj')), true);
  assert.equal(audioOutCapability({ category: 'controller', connectivity: { audio: { usbChannelsOut: 0 } } }), false);
  assert.equal(audioOutCapability({ category: 'controller', connectivity: { audio: { usbChannelsOut: 4 } } }), true);
  assert.equal(audioOutCapability({ category: 'mixer', connectivity: { audio: { usbChannelsOut: 0 } } }), true, 'a mixer always has an analogue output');
  assert.equal(audioOutCapability({ category: 'timecode-media' }), false);

  const twelve = completePlan(byId('rane-twelve-mk2'));
  assert.equal(methods(twelve).includes('audio:quality'), false, 'no invented audio test for a MIDI-only surface');
  const nano = completePlan(byId('korg-nanokontrol2')).tests.find(t => t.method === 'audio:quality');
  assert.match(nano.params.condition, /Only when the unit has its own audio output/);
  assert.equal(nano.severity, 'minor');
  const a9 = completePlan(byId('pioneer-djm-a9')).tests.find(t => t.method === 'audio:quality');
  assert.equal(a9.params.condition, undefined); assert.equal(a9.severity, 'major');
  assert.ok(a9.params.levelDbfs <= -12, 'never above the -12 dBFS output cap');
});

test('completePlan adds each missing baseline test once and never replaces hand-written ones', () => {
  const raw = byId('pioneer-djm-a9');
  const done = completePlan(raw);
  const added = done.tests.filter(t => t.auto);
  assert.deepEqual(added.map(t => t.method).sort(), ['audio:quality', 'midi:conformance']);
  assert.equal(done.autoTests, 2);
  assert.equal(done.tests.length, raw.tests.length + 2);
  assert.equal(raw.tests.some(t => t.auto), false, 'input is not mutated');
  assert.equal(completePlan(done).tests.length, done.tests.length, 'idempotent');
  const custom = { ...raw, tests: [...raw.tests, { id: 'mine', category: 'midi', title: 'x', method: 'midi:conformance', steps: ['a'], severity: 'minor' }] };
  assert.equal(completePlan(custom).tests.filter(t => t.method === 'midi:conformance').length, 1);
  const tt = completePlan(byId('technics-sl-1200mk4'));
  assert.equal(tt.tests.some(t => t.method === 'midi:conformance' || t.method === 'audio:quality'), false);
  const gm = completePlan({ ...raw, midi: { ...raw.midi, generalMidi: true } });
  assert.ok(gm.tests.some(t => t.method === 'midi:gm' && t.auto));
  const clash = completePlan({ ...raw, tests: [...raw.tests, { id: 'auto-midi-conformance', category: 'midi', title: 'other', method: 'manual:inspection', steps: ['a'] }] });
  assert.equal(new Set(clash.tests.map(t => t.id)).size, clash.tests.length, 'auto ids never collide with hand-written ids');
  assert.equal(completePlan(null), null);
});

test('auto tests are valid, dispatchable and cite their thresholds', () => {
  for (const raw of PROFILES) {
    const done = completePlan(raw);
    const v = validateProfile(done);
    assert.equal(v.ok, true, `${raw.id}: ${v.errors.join('; ')}`);
    for (const t of done.tests.filter(x => x.auto)) {
      assert.ok(t.steps.length >= 2 && t.why && t.id.startsWith('auto-'), t.id);
      assert.notEqual(dispatchFor(t).runner, 'unsupported', t.id);
      assert.ok(methodLabel(t).length > 3);
      if (t.pass) assert.match(t.pass.source, /DeckChek test definition/);
    }
  }
});

test('every shipped profile is fully testable after completePlan (SPEC-34 AC-1)', () => {
  const rows = coverageMatrix(PROFILES);
  assert.equal(rows.length, PROFILES.length);
  for (const r of rows) assert.deepEqual(r.gaps, [], `${r.id}: ${JSON.stringify(r.gaps)}`);
  assert.ok(rows.some(r => r.auto > 0) && rows.some(r => r.gapsBefore > 0), 'the baseline plan closes real gaps');
  for (const p of PROFILES.map(completePlan)) {
    const caps = capabilitiesOf(p);
    if (caps.audioOut) assert.ok(methods(p).includes('audio:quality'), p.id);
    if (caps.midi) assert.ok(methods(p).includes('midi:conformance'), p.id);
    assert.ok(methods(p).includes('manual:inspection'), p.id);
  }
});

test('auditProfile reports each kind of gap', () => {
  const base = { id: 'x', manufacturer: 'A', model: 'B', category: 'controller', connectivity: { midi: { usbMidi: true } }, midi: { mapSource: 'learn', controls: [] }, drivers: [{ name: 'd' }], software: [{ name: 's' }], specs: [], tests: [
    { id: 't1', method: 'bogus:thing', steps: ['a'] }, { id: 't1', method: 'manual:inspection', steps: [] },
    { id: 't3', method: 'midi:fader', steps: ['a'], pass: { metricId: 'not_a_metric', op: '<=', value: 1 } }] };
  const codes = auditProfile(base).gaps.map(g => g.code);
  for (const c of ['duplicate-id', 'no-runner', 'no-steps', 'unknown-metric', 'uncovered-capability']) assert.ok(codes.includes(c), c);
  assert.deepEqual(auditProfile(completePlan({ ...base, tests: [base.tests[1], base.tests[2]] })).gaps.map(g => g.code).sort(), ['no-steps', 'unknown-metric']);
});

test('metric registry covers every shipped pass criterion', () => {
  for (const p of PROFILES) for (const t of p.tests) {
    if (!t.pass || dispatchFor(t).runner === 'workflow') continue;
    assert.ok(METRICS_BY_METHOD[t.method]?.includes(t.pass.metricId), `${p.id}/${t.id}: ${t.method} -> ${t.pass.metricId}`);
  }
  for (const method of Object.values(REQUIRED_METHOD)) assert.ok(method in METRICS_BY_METHOD, method);
});

test('the committed coverage matrix matches the shipped profiles (SPEC-34 AC-4)', () => {
  const committed = fs.readFileSync(path.join(ROOT, 'docs', 'testing', 'DEVICE-TEST-COVERAGE.md'), 'utf8');
  assert.equal(committed, renderMarkdown(PROFILES), 'run: node tools/check-device-coverage.mjs --markdown');
});

test('MIDI applicability: transport facts stay boolean or unknown independently of scaffolds and USB presence', () => {
  const scaffold = { mapSource: 'learn', controls: [] };
  for (const [profile, expected] of [
    [{}, { midi: null, usbMidi: null, dinMidi: null }],
    [{ midi: null, connectivity: { midi: null } }, { midi: null, usbMidi: null, dinMidi: null }],
    [{ midi: scaffold }, { midi: 'conditional', usbMidi: null, dinMidi: null }],
    [{ connectivity: { usb: { present: true }, midi: {} } }, { midi: 'conditional', usbMidi: null, dinMidi: null }],
    [{ midi: scaffold, connectivity: { usb: { present: false }, midi: { usbMidi: null, din: null } } }, { midi: 'conditional', usbMidi: null, dinMidi: null }],
    [{ midi: scaffold, connectivity: { midi: { usbMidi: false, din: null } } }, { midi: 'conditional', usbMidi: false, dinMidi: null }],
    [{ midi: scaffold, connectivity: { midi: { usbMidi: false, din: false } } }, { midi: false, usbMidi: false, dinMidi: false }],
    [{ connectivity: { midi: { usbMidi: false, din: true } } }, { midi: true, usbMidi: false, dinMidi: true }],
    [{ connectivity: { midi: { usbMidi: true, din: false } } }, { midi: true, usbMidi: true, dinMidi: false }],
  ]) {
    const caps = capabilitiesOf(profile);
    assert.deepEqual({ midi: caps.midi, usbMidi: caps.usbMidi, dinMidi: caps.dinMidi }, expected, JSON.stringify(profile));
  }
});

test('MIDI applicability: Audio 8 DJ keeps its explicit USB fact and handwritten DIN test', () => {
  const raw = byId('traktor-audio-8-dj'), snapshot = JSON.stringify(raw);
  const caps = capabilitiesOf(raw), done = completePlan(raw);
  assert.equal(caps.usbMidi, false);
  assert.equal(caps.dinMidi, true);
  assert.equal(caps.midi, true);
  assert.equal(done.tests.find(t => t.id === 'a8-midi-din'), raw.tests.find(t => t.id === 'a8-midi-din'));
  assert.deepEqual(done.tests.slice(0, raw.tests.length), raw.tests);
  assert.equal(done.tests.filter(t => t.method === 'midi:coverage').length, 1);
  const conformance = done.tests.find(t => t.id === 'auto-midi-conformance');
  assert.equal(conformance.params.outputSelection, 'explicit');
  assert.match(conformance.steps.join(' '), /DIN OUT.*interface.*IN/i);
  assert.doesNotMatch(conformance.steps.join(' '), /by USB|directly to a USB/);
  assert.equal(JSON.stringify(raw), snapshot, 'profile facts and handwritten tests remain untouched');
});

test('MIDI applicability: Xone 92 uses DIN capture prerequisites without asserting a receiving port', () => {
  const raw = byId('allen-and-heath-xone-92'), done = completePlan(raw);
  const generated = done.tests.filter(t => t.auto && t.method.startsWith('midi:'));
  assert.deepEqual(generated.map(t => t.id), ['auto-midi-conformance', 'auto-midi-coverage', 'auto-midi-timing']);
  for (const t of generated) {
    assert.match(t.steps.join(' '), /documented.*DIN OUT.*interface.*IN/i, t.id);
    assert.doesNotMatch(t.steps.join(' '), /by USB|directly to a USB|every (?:control|knob)/i, t.id);
    assert.equal(t.params.condition, undefined, 'confirmed transport is distinct from unknown applicability');
  }
  const conformance = generated[0];
  assert.equal(conformance.params.outputSelection, 'explicit');
  assert.match(conformance.steps.join(' '), /output.*only.*documented.*receiv/i);
  assert.match(conformance.why, /optional.*Identity/i);
  assert.match(generated[1].why, /learn mode.*does not/i);
  assert.equal(capabilitiesOf(raw).usbMidi, null, 'DIN availability does not invent USB support or absence');
});

test('MIDI applicability: WARM2 keeps conformance, coverage and timing conditional in plans and matrix', () => {
  const raw = byId('ecler-warm2'), before = JSON.stringify(raw), caps = requiredCapabilities(raw);
  for (const name of ['midi', 'midiMap', 'midiTiming']) assert.equal(caps[name], 'conditional', name);
  const generated = completePlan(raw).tests.filter(t => t.auto && t.method.startsWith('midi:'));
  assert.equal(generated.length, 3);
  for (const t of generated) {
    assert.match(t.params.condition, /documentation.*MIDI.*Skip/i, t.id);
    assert.doesNotMatch(t.steps.join(' '), /by USB|directly to a USB/i, t.id);
  }
  assert.equal(generated[0].params.outputSelection, 'explicit');
  const row = coverageMatrix([raw])[0];
  assert.deepEqual(row.gaps, []);
  for (const name of ['midi', 'midiMap', 'midiTiming']) assert.equal(row.capabilities[name], 'conditional', name);
  const markdown = renderMarkdown([raw]);
  const deviceRow = markdown.split('\n').find(line => line.startsWith('| Ecler WARM2 |'));
  assert.equal((deviceRow.match(/✓\?/g) || []).length, 3);
  assert.match(markdown, /MIDI transport/i);
  assert.equal(JSON.stringify(raw), before);
});

test('MIDI applicability: explicit unsupported transports suppress only automatic MIDI tests', () => {
  const handwritten = { id: 'operator-check', method: 'midi:coverage', category: 'midi', title: 'Operator check', steps: ['Check the unit documentation.'] };
  const raw = { id: 'unsupported', manufacturer: 'Test', model: 'Surface', category: 'controller', connectivity: { midi: { usbMidi: false, din: false }, audio: null }, midi: { mapSource: 'learn', controls: [] }, tests: [handwritten] };
  const done = completePlan(raw), caps = requiredCapabilities(raw);
  assert.deepEqual([caps.midi, caps.midiMap, caps.midiTiming], [false, false, false]);
  assert.deepEqual(done.tests.filter(t => t.method.startsWith('midi:')), [handwritten]);
  assert.equal(done.tests[0], handwritten);
  assert.equal(completePlan(done).tests.length, done.tests.length);
  assert.deepEqual(raw.tests, [handwritten]);
});

test('MIDI applicability: known USB plans retain ordinary conformance and explicit GM opt-in', () => {
  const raw = byId('pioneer-djm-a9'), done = completePlan(raw), conformance = done.tests.find(t => t.id === 'auto-midi-conformance');
  assert.equal(capabilitiesOf(raw).midi, true);
  assert.equal(conformance.params.outputSelection, undefined);
  assert.equal(conformance.params.condition, undefined);
  assert.match(conformance.steps.join(' '), /directly.*USB/i);
  assert.equal(done.tests.some(t => t.method === 'midi:gm'), false);
  assert.deepEqual(done.tests.slice(0, raw.tests.length), raw.tests);
  assert.equal(completePlan(done).tests.length, done.tests.length);
  const audio = done.tests.find(t => t.method === 'audio:quality');
  assert.equal(audio.params.levelDbfs, -12);
});
