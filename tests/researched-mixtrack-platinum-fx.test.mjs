import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioOutCapability, completePlan } from '../app/devices/test-plan.js';

const readProfile = () => JSON.parse(readFileSync(
  new URL('../app/devices/profiles/numark-mixtrack-platinum-fx.json', import.meta.url), 'utf8',
));

test('Mixtrack Platinum FX records its documented audio format and USB MIDI without channel counts', () => {
  const profile = readProfile();
  assert.deepEqual(profile.connectivity.audio, {
    usbChannelsIn: null, usbChannelsOut: null, sampleRatesHz: [44100], bitDepth: 24,
  });
  assert.equal(profile.connectivity.midi.usbMidi, true);
  assert.match(profile.identityNotes, /Research seed/);
});

test('Mixtrack Platinum FX audio format and USB MIDI leave the actual output quality plan conditional', () => {
  const profile = readProfile();
  assert.equal(audioOutCapability(profile), 'conditional');
  const tests = completePlan(profile).tests.filter(t => t.method === 'audio:quality');
  assert.equal(tests.length, 1);
  assert.equal(tests[0].auto, true);
  assert.equal(tests[0].severity, 'minor');
  assert.equal(typeof tests[0].params.condition, 'string');
  assert.ok(tests[0].params.condition.trim().length > 0);
  assert.ok(tests[0].params.levelDbfs <= -12);
});

test('Mixtrack Platinum FX planning preserves handwritten checks, source data and qualification unknowns', () => {
  const profile = readProfile();
  const original = structuredClone(profile);
  const originalIds = new Set(original.tests.map(t => t.id));
  const plan = completePlan(profile);

  assert.deepEqual(profile, original);
  assert.deepEqual(plan.tests.filter(t => originalIds.has(t.id)), original.tests);
  assert.equal(new Set(plan.tests.map(t => t.id)).size, plan.tests.length);
  assert.equal(profile.connectivity.usb.vendorId, null);
  assert.deepEqual(profile.connectivity.usb.productIds, []);
  assert.equal(profile.connectivity.usb.classCompliant, null);
  assert.equal(profile.connectivity.midi.din, null);
  assert.equal(profile.midi.mapSource, 'learn');
  assert.equal(profile.midi.complete, false);
  assert.deepEqual(profile.midi.controls, []);
  assert.equal(profile.software[0].minVersion, null);
});
