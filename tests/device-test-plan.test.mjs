import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capabilitiesOf, completePlan, auditProfile, coverageMatrix, METRICS_BY_METHOD, REQUIRED_METHOD } from '../app/devices/test-plan.js';
import { dispatchFor, methodLabel } from '../app/devices/dispatch.js';
import { validateProfile } from '../app/devices/library.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'devices', 'profiles');
const PROFILES = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const byId = id => PROFILES.find(p => p.id === id);

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

test('completePlan adds each missing baseline test once and never replaces hand-written ones', () => {
  const raw = byId('pioneer-djm-a9');
  const done = completePlan(raw);
  const added = done.tests.filter(t => t.auto);
  assert.deepEqual(added.map(t => t.method).sort(), ['audio:quality', 'midi:conformance']);
  assert.equal(done.autoTests, 2);
  assert.equal(done.tests.length, raw.tests.length + 2);
  assert.equal(raw.tests.some(t => t.auto), false, 'input is not mutated');
  const again = completePlan(done);
  assert.equal(again.tests.length, done.tests.length, 'idempotent');
  // a hand-written test with the same method suppresses the auto test
  const custom = { ...raw, tests: [...raw.tests, { id: 'mine', category: 'midi', title: 'x', method: 'midi:conformance', steps: ['a'], severity: 'minor' }] };
  assert.equal(completePlan(custom).tests.filter(t => t.method === 'midi:conformance').length, 1);
  // a profile without MIDI or audio gets only what applies
  const tt = completePlan(byId('technics-sl-1200mk4'));
  assert.equal(tt.tests.some(t => t.method === 'midi:conformance' || t.method === 'audio:quality'), false);
  // GM source adds the General MIDI sound check
  const gm = completePlan({ ...raw, midi: { ...raw.midi, generalMidi: true } });
  assert.ok(gm.tests.some(t => t.method === 'midi:gm' && t.auto));
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
  // every controller/mixer/audio-interface now has an audio-quality test and every MIDI device a conformance test
  for (const p of PROFILES.map(completePlan)) {
    const caps = capabilitiesOf(p);
    if (caps.audioOut) assert.ok(p.tests.some(t => t.method === 'audio:quality'), p.id);
    if (caps.usbMidi) assert.ok(p.tests.some(t => t.method === 'midi:conformance'), p.id);
    assert.ok(p.tests.some(t => t.method === 'manual:inspection'), p.id);
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
