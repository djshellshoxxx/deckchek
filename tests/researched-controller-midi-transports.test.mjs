import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioOutCapability, auditProfile, completePlan } from '../app/devices/test-plan.js';

const cases = [
  {
    id: 'akai-professional-apc40-mkii', handwritten: 7,
    manual: 'https://cdn.inmusicbrands.com/akai/attachments/apc40II/APC40%20mkII%20-%20User%20Guide%20-%20v1.0.pdf',
  },
  {
    id: 'native-instruments-traktor-kontrol-f1', handwritten: 5,
    manual: 'https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/traktor/traktor_kontrol_f1_manual_english.pdf',
  },
  {
    id: 'korg-nanokontrol2', handwritten: 6,
    manual: 'https://cdn.korg.com/us/support/download/files/b61f4da2e9b32e7825edc729e7d71a0d.pdf?response-content-disposition=inline%3Bfilename%2A%3DUTF-8%27%27nanoKONTROL2_OM_EFGSCJ2.pdf&response-content-type=application%2Fpdf%3B',
  },
];
const readProfile = id => JSON.parse(readFileSync(
  new URL(`../app/devices/profiles/${id}.json`, import.meta.url), 'utf8',
));
const unknownAudio = { usbChannelsIn: null, usbChannelsOut: null, sampleRatesHz: [], bitDepth: null };

for (const { id, handwritten, manual } of cases) {
  test(`${id}: USB MIDI has exact-model provenance without resolving audio or qualification`, () => {
    const profile = readProfile(id);
    assert.equal(profile.connectivity.midi.usbMidi, true);
    assert.ok(profile.documents.some(d => d.url === manual));
    const transport = profile.specs.find(s => s.key === 'verified_usb_midi_transport');
    assert.equal(transport?.value, true);
    assert.equal(transport?.confidence, 'confirmed');
    assert.equal(transport?.source, manual);

    assert.deepEqual(profile.connectivity.audio, unknownAudio);
    assert.deepEqual(profile.connectivity.usb, {
      present: true, vendorId: null, productIds: [], classCompliant: null,
    });
    assert.equal(profile.connectivity.midi.din, null);
    assert.deepEqual(profile.midi, { mapSource: 'learn', complete: false, controls: [] });
    assert.ok(profile.software.every(s => s.minVersion === null));
    assert.match(profile.identityNotes, /Research seed|Candidate hardware/);
  });

  test(`${id}: the actual plan keeps conditional minor audio and MIDI checks without mutation`, () => {
    const profile = readProfile(id);
    const original = structuredClone(profile);
    const plan = completePlan(profile);

    assert.equal(audioOutCapability(profile), 'conditional');
    const audio = plan.tests.filter(t => t.method === 'audio:quality');
    assert.equal(audio.length, 1);
    assert.equal(audio[0].auto, true);
    assert.equal(audio[0].severity, 'minor');
    assert.match(audio[0].params.condition, /Only when the unit has its own audio output/);
    assert.ok(audio[0].params.levelDbfs <= -12);
    for (const method of ['midi:conformance', 'midi:coverage', 'midi:latency']) {
      assert.ok(plan.tests.some(t => t.method === method), `${id}: retains ${method}`);
    }

    assert.equal(original.tests.length, handwritten);
    assert.deepEqual(plan.tests.slice(0, handwritten), original.tests);
    assert.equal(new Set(plan.tests.map(t => t.id)).size, plan.tests.length);
    assert.deepEqual(auditProfile(plan).gaps, []);
    assert.deepEqual(profile, original, `${id}: planning does not mutate the source`);
    assert.deepEqual(plan.documents, original.documents);
    assert.deepEqual(plan.specs, original.specs);
  });
}
