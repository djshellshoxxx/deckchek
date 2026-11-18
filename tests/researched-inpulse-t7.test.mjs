import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioOutCapability, completePlan } from '../app/devices/test-plan.js';

const readProfile = () => JSON.parse(readFileSync(
  new URL('../app/devices/profiles/hercules-djcontrol-inpulse-t7.json', import.meta.url), 'utf8',
));

test('Inpulse T7 receives a confirmed output audio quality test', () => {
  const profile = readProfile();
  assert.deepEqual(profile.connectivity.audio, {
    usbChannelsIn: null, usbChannelsOut: 4, sampleRatesHz: [44100], bitDepth: 24,
  });
  assert.equal(profile.connectivity.midi.usbMidi, true);
  assert.equal(audioOutCapability(profile), true);

  const tests = completePlan(profile).tests.filter(t => t.method === 'audio:quality');
  assert.equal(tests.length, 1);
  assert.equal(tests[0].auto, true);
  assert.equal(tests[0].severity, 'major');
  assert.equal(tests[0].params.condition, undefined);
  assert.ok(tests[0].params.levelDbfs <= -12);
});

test('Inpulse T7 retains research-seed status and unverified identity and transport details', () => {
  const profile = readProfile();
  assert.match(profile.identityNotes, /Research seed/);
  assert.equal(profile.connectivity.audio.usbChannelsIn, null);
  assert.equal(profile.connectivity.usb.vendorId, null);
  assert.deepEqual(profile.connectivity.usb.productIds, []);
  assert.equal(profile.connectivity.usb.classCompliant, null);
  assert.equal(profile.connectivity.midi.din, null);
  assert.equal(profile.midi.mapSource, 'learn');
  assert.equal(profile.midi.complete, false);
  assert.deepEqual(profile.midi.controls, []);
});

test('Inpulse T7 plan selection preserves all handwritten checks and the source profile', () => {
  const profile = readProfile();
  const original = structuredClone(profile);
  const originalIds = new Set(original.tests.map(t => t.id));
  const plan = completePlan(profile);

  assert.deepEqual(profile, original, 'source profile is unchanged');
  assert.deepEqual(plan.tests.filter(t => originalIds.has(t.id)), original.tests,
    'all handwritten checks remain unchanged');
  assert.equal(new Set(plan.tests.map(t => t.id)).size, plan.tests.length,
    'no duplicate tests');
});
