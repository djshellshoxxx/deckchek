import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioOutCapability, completePlan } from '../app/devices/test-plan.js';

const readProfile = id => JSON.parse(readFileSync(new URL(`../app/devices/profiles/${id}.json`, import.meta.url), 'utf8'));
const xoneManual = 'https://www.allen-heath.com/content/uploads/2023/06/Xone92-User-Guide-Issue-4.pdf';
const xoneLegacy = 'https://www.allen-heath.com/hardware/legacy-products/xone92mk1/resources/';
const warmManual = 'https://assets.ecler.com/images/downloads/user-manuals/Ecler_WARM2_User_Manual_EN.pdf';
const unknownAudio = { usbChannelsIn: null, usbChannelsOut: null, sampleRatesHz: [], bitDepth: null };

function preservedTransportUnknowns(profile) {
  assert.deepEqual(profile.connectivity.usb, { present: false, vendorId: null, productIds: [], classCompliant: null });
  assert.equal(profile.connectivity.midi.usbMidi, null);
  assert.deepEqual(profile.connectivity.audio, unknownAudio);
  assert.deepEqual(profile.midi, { mapSource: 'learn', complete: false, controls: [] });
}

test('legacy Xone:92 records the documented DIN output without inventing USB MIDI or an audio stream', () => {
  const profile = readProfile('allen-and-heath-xone-92');
  assert.equal(profile.connectivity.midi.din, true);
  assert.ok(profile.documents.some(row => row.url === xoneManual && /AP5345.*Issue 4/.test(row.title)));
  assert.ok(profile.documents.some(row => row.url === xoneLegacy));
  const output = profile.specs.find(row => row.key === 'verified_din_midi_output');
  assert.equal(output?.value, true); assert.equal(output?.source, xoneManual); assert.equal(output?.confidence, 'confirmed');
  assert.match(output.notes, /Mk1/); assert.match(output.notes, /output/i);
  preservedTransportUnknowns(profile);
});

test('WARM2 exact manual provenance preserves 2+1 channels and unresolved MIDI transport', () => {
  const profile = readProfile('ecler-warm2');
  const manual = profile.documents.find(row => row.url === warmManual);
  assert.ok(manual); assert.match(manual.title, /50-0421-0102/);
  assert.equal(profile.specs.find(row => row.key === 'verified_mixer_channels')?.value, 3);
  assert.equal(profile.connectivity.midi.din, null);
  preservedTransportUnknowns(profile);
});

for (const id of ['allen-and-heath-xone-92', 'ecler-warm2']) {
  test(`${id}: provenance retains analog audio planning, five handwritten checks and stimulus limits`, () => {
    const profile = readProfile(id), original = structuredClone(profile), plan = completePlan(profile);
    assert.equal(audioOutCapability(profile), true);
    const audio = plan.tests.filter(row => row.method === 'audio:quality');
    assert.equal(audio.length, 1); assert.equal(audio[0].severity, 'major');
    assert.ok(!Object.hasOwn(audio[0].params, 'condition')); assert.ok(audio[0].params.levelDbfs <= -12);
    assert.equal(profile.tests.length, 5); assert.deepEqual(plan.tests.slice(0, 5), original.tests);
    assert.deepEqual(profile, original);
  });
}
