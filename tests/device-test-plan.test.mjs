// SPEC-34 device test completeness (app/devices/test-plan.js). Ported from PR9 (a4d844b) and
// extended for the explicit/conditional audio-output capability.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capabilitiesOf, audioOutCapability, completePlan, auditProfile, coverageMatrix, METRICS_BY_METHOD, REQUIRED_METHOD } from '../app/devices/test-plan.js';
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
  assert.deepEqual({ ...a9 }, { physical: true, usbMidi: true, midiMap: true, audioOut: true, audioIn: false, driver: true, software: true, timecode: true, gmSource: false });
  const xone = capabilitiesOf(byId('allen-heath-xone-23'));
  assert.equal(xone.usbMidi, false); assert.equal(xone.audioOut, true); assert.equal(xone.audioIn, true);
  const tt = capabilitiesOf(byId('technics-sl-1200mk4'));
  assert.equal(tt.audioOut, false); assert.equal(tt.usbMidi, false);
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
    if (caps.usbMidi) assert.ok(methods(p).includes('midi:conformance'), p.id);
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
