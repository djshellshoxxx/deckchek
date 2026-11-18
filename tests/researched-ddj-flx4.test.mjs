import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioOutCapability, completePlan } from '../app/devices/test-plan.js';

const readProfile = () => JSON.parse(readFileSync(
  new URL('../app/devices/profiles/pioneer-dj-ddj-flx4.json', import.meta.url), 'utf8',
));

test('DDJ-FLX4 records documented rates and USB MIDI while retaining unresolved audio fields', () => {
  const profile = readProfile();
  assert.deepEqual(profile.connectivity.audio, {
    usbChannelsIn: null, usbChannelsOut: null, sampleRatesHz: [44100, 48000], bitDepth: null,
  });
  assert.equal(profile.connectivity.midi.usbMidi, true);
  assert.match(profile.identityNotes, /Research seed/);
  assert.ok(profile.documents.some(d => d.url.endsWith('DDJ-FLX4_DRI1804A_manual.pdf')));
});

test('DDJ-FLX4 documented rates leave the actual output quality plan conditional', () => {
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

test('DDJ-FLX4 planning preserves handwritten checks, source data and qualification unknowns', () => {
  const profile = readProfile();
  const original = structuredClone(profile);
  const originalIds = new Set(original.tests.map(t => t.id));
  const plan = completePlan(profile);

  assert.equal(original.tests.length, 10);
  assert.deepEqual(profile, original);
  assert.deepEqual(plan.tests.filter(t => originalIds.has(t.id)), original.tests);
  assert.equal(new Set(plan.tests.map(t => t.id)).size, plan.tests.length);
  assert.equal(profile.connectivity.usb.vendorId, null);
  assert.deepEqual(profile.connectivity.usb.productIds, []);
  assert.equal(profile.connectivity.usb.classCompliant, true);
  assert.equal(profile.connectivity.midi.din, null);
  assert.equal(profile.midi.mapSource, 'learn');
  assert.equal(profile.midi.complete, false);
  assert.deepEqual(profile.midi.controls, []);
  assert.ok(profile.software.every(s => s.minVersion === null));
});
