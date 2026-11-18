import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioOutCapability, completePlan } from '../app/devices/test-plan.js';

const readProfile = id => JSON.parse(readFileSync(
  new URL(`../app/devices/profiles/${id}.json`, import.meta.url), 'utf8',
));
const audioTests = plan => plan.tests.filter(t => t.method === 'audio:quality');

test('Inpulse 500 receives a confirmed output audio quality test', () => {
  const profile = readProfile('hercules-djcontrol-inpulse-500');
  assert.deepEqual(profile.connectivity.audio, {
    usbChannelsIn: 2, usbChannelsOut: 4, sampleRatesHz: [44100], bitDepth: 24,
  });
  assert.equal(profile.connectivity.midi.usbMidi, true);
  assert.equal(audioOutCapability(profile), true);

  const tests = audioTests(completePlan(profile));
  assert.equal(tests.length, 1);
  assert.equal(tests[0].auto, true);
  assert.equal(tests[0].severity, 'major');
  assert.equal(tests[0].params.condition, undefined);
  assert.ok(tests[0].params.levelDbfs <= -12);
});

test('Launchpad Pro MK3 keeps its MIDI plan without an audio test', () => {
  const profile = readProfile('novation-launchpad-pro-mk3');
  assert.equal(profile.connectivity.audio, null);
  assert.equal(profile.connectivity.midi.usbMidi, true);
  assert.equal(audioOutCapability(profile), false);

  const plan = completePlan(profile);
  assert.equal(audioTests(plan).length, 0);
  assert.equal(plan.tests.some(t => t.category === 'audio'), false);
  assert.ok(plan.tests.some(t => t.method === 'midi:conformance'));
  assert.ok(plan.tests.some(t => t.method === 'midi:coverage'));
});

test('an unrelated controller with unknown audio capability stays conditional', () => {
  const profile = readProfile('korg-nanokontrol2');
  assert.equal(profile.connectivity.audio.usbChannelsOut, null);
  assert.equal(audioOutCapability(profile), 'conditional');

  const tests = audioTests(completePlan(profile));
  assert.equal(tests.length, 1);
  assert.equal(tests[0].severity, 'minor');
  assert.match(tests[0].params.condition, /Only when the unit has its own audio output/);
});

test('researched capability selection preserves every handwritten test and the source profile', () => {
  for (const id of ['hercules-djcontrol-inpulse-500', 'novation-launchpad-pro-mk3']) {
    const profile = readProfile(id);
    const original = structuredClone(profile);
    const originalIds = new Set(original.tests.map(t => t.id));
    const plan = completePlan(profile);

    assert.deepEqual(profile, original, `${id}: source profile is unchanged`);
    assert.deepEqual(plan.tests.filter(t => originalIds.has(t.id)), original.tests,
      `${id}: all handwritten tests remain unchanged`);
    assert.equal(new Set(plan.tests.map(t => t.id)).size, plan.tests.length,
      `${id}: no duplicate tests`);
  }
});
