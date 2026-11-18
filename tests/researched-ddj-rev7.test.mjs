import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioOutCapability, completePlan } from '../app/devices/test-plan.js';

const readProfile = () => JSON.parse(readFileSync(
  new URL('../app/devices/profiles/pioneer-dj-ddj-rev7.json', import.meta.url), 'utf8',
));

test('DDJ-REV7 records documented USB pairs, audio format and MIDI transport', () => {
  const profile = readProfile();
  assert.deepEqual(profile.connectivity.audio, {
    usbChannelsIn: 10, usbChannelsOut: 10, sampleRatesHz: [48000], bitDepth: 24,
  });
  assert.equal(profile.connectivity.midi.usbMidi, true);
  assert.match(profile.identityNotes, /Research seed/);
  assert.match(profile.identityNotes, /PC\/Mac/);
  assert.match(profile.identityNotes, /per host connection/);
  assert.ok(profile.documents.some(d => d.url.endsWith('DDJ-REV7_DRI1713D_manual.pdf')));
});

test('DDJ-REV7 documented host outputs select one confirmed audio quality test', () => {
  const profile = readProfile();
  assert.equal(audioOutCapability(profile), true);
  const tests = completePlan(profile).tests.filter(t => t.method === 'audio:quality');
  assert.equal(tests.length, 1);
  assert.equal(tests[0].auto, true);
  assert.equal(tests[0].severity, 'major');
  assert.equal(tests[0].params.condition, undefined);
  assert.ok(tests[0].params.levelDbfs <= -12);
});

test('DDJ-REV7 planning preserves handwritten checks, source data and qualification unknowns', () => {
  const profile = readProfile();
  const original = structuredClone(profile);
  const originalIds = new Set(original.tests.map(t => t.id));
  const plan = completePlan(profile);

  assert.equal(original.tests.length, 9);
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
  assert.ok(profile.software.every(s => s.minVersion === null));
});
