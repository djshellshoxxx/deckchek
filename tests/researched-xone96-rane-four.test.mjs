import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioOutCapability, auditProfile, capabilitiesOf, completePlan } from '../app/devices/test-plan.js';

const readProfile = id => JSON.parse(readFileSync(new URL(`../app/devices/profiles/${id}.json`, import.meta.url), 'utf8'));
const xoneSource = 'https://www.allen-heath.com/content/uploads/2023/06/X96_SRN_4670_2.pdf';
const fourSource = 'https://cdn.inmusicbrands.com/rane/four/FOUR%20-%20User%20Guide%20-%20v1.0.pdf';

function preservedUnknowns(profile) {
  assert.deepEqual(profile.connectivity.usb, { present: true, vendorId: null, productIds: [], classCompliant: null });
  assert.equal(profile.connectivity.midi.din, null);
  assert.deepEqual(profile.midi, { mapSource: 'learn', complete: false, controls: [] });
}

test('Xone:96 records USB channels per host and enumerated rates without collapsing its two USB word lengths', () => {
  const profile = readProfile('allen-and-heath-xone-96');
  assert.deepEqual(profile.connectivity.audio, { usbChannelsIn: 12, usbChannelsOut: 12, sampleRatesHz: [44100, 48000, 88200, 96000], bitDepth: null });
  assert.equal(profile.connectivity.midi.usbMidi, true);
  assert.ok(profile.documents.some(d => d.url === xoneSource));
  const formats = profile.specs.find(s => s.key === 'verified_usb_audio_formats');
  assert.equal(formats?.value, '16 / 32');
  assert.equal(formats?.source, xoneSource);
  assert.equal(formats?.confidence, 'confirmed');
  preservedUnknowns(profile);
});

test('Xone:96 resolves the input capability and preserves its existing major audio plan and handwritten checks', () => {
  const profile = readProfile('allen-and-heath-xone-96'), original = structuredClone(profile), plan = completePlan(profile);
  assert.equal(capabilitiesOf(profile).audioIn, true);
  assert.equal(audioOutCapability(profile), true);
  const audio = plan.tests.filter(t => t.method === 'audio:quality');
  assert.equal(audio.length, 1);
  assert.equal(audio[0].severity, 'major');
  assert.ok(!Object.hasOwn(audio[0].params, 'condition'));
  assert.ok(audio[0].params.levelDbfs <= -12);
  assert.equal(original.tests.length, 8);
  assert.deepEqual(plan.tests.slice(0, 8), original.tests);
  assert.deepEqual(auditProfile(plan).gaps, []);
  assert.deepEqual(profile, original);
});

test('FOUR records USB MIDI while converter and DSP specifications do not become USB formats', () => {
  const profile = readProfile('rane-four');
  assert.equal(profile.connectivity.midi.usbMidi, true);
  assert.deepEqual(profile.connectivity.audio, { usbChannelsIn: null, usbChannelsOut: null, sampleRatesHz: [], bitDepth: null });
  assert.ok(profile.documents.some(d => d.url === fourSource));
  const midi = profile.specs.find(s => s.key === 'verified_usb_midi_transport');
  assert.equal(midi?.value, true);
  assert.equal(midi?.source, fourSource);
  assert.equal(midi?.confidence, 'confirmed');
  preservedUnknowns(profile);
});

test('FOUR retains conditional minor audio, existing MIDI coverage and its original eight checks', () => {
  const profile = readProfile('rane-four'), original = structuredClone(profile), plan = completePlan(profile);
  assert.equal(audioOutCapability(profile), 'conditional');
  const audio = plan.tests.filter(t => t.method === 'audio:quality');
  assert.equal(audio.length, 1);
  assert.equal(audio[0].severity, 'minor');
  assert.match(audio[0].params.condition, /Only when the unit has its own audio output/);
  assert.ok(audio[0].params.levelDbfs <= -12);
  for (const method of ['midi:conformance', 'midi:coverage', 'midi:latency']) assert.ok(plan.tests.some(t => t.method === method), method);
  assert.equal(original.tests.length, 8);
  assert.deepEqual(plan.tests.slice(0, 8), original.tests);
  assert.deepEqual(auditProfile(plan).gaps, []);
  assert.deepEqual(profile, original);
});
