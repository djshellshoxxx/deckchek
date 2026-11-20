import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { certificatePlan } from '../app/certificate.js';
import { validateProfile } from '../app/devices/library.js';
import { capabilitiesOf, completePlan, midiPrerequisites } from '../app/devices/test-plan.js';

const id = 'native-instruments-traktor-kontrol-s4-mk3';
const source = 'https://support.native-instruments.com/support/solutions/articles/69000880031-native-instruments-switching-your-controller-to-midi-mode';
const addendum = ' MIDI-mode addendum (2026-11-20): NI states that controllers absent from its supported MIDI-mode table cannot switch to MIDI mode. The table lists S4 MK1/MK2 but not S4 MK3, so supported USB MIDI controller mode is false. DIN remains unresolved; no receiving port, identity response, complete map or current hardware/firmware qualification is inferred.';
const originalHash = '3285dec869fe71fa3c0d72d23ab7dd02b5bb867c6c5c64e4c9dcc7acc4157f7b';
const read = () => JSON.parse(readFileSync(new URL(`../app/devices/profiles/${id}.json`, import.meta.url), 'utf8'));

test('S4 MK3 records the manufacturer MIDI-mode exclusion without inventing DIN support or absence', () => {
  const profile = read();
  assert.equal(validateProfile(profile).ok, true);
  assert.equal(profile.connectivity.midi.usbMidi, false);
  assert.equal(profile.connectivity.midi.din, null);
  const documents = profile.documents.filter(d => d.url === source);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].type, 'support-article');
  assert.match(documents[0].notes, /MK1\/MK2.*not.*MK3/);
  assert.match(documents[0].notes, /2026-11-20/);
  const facts = profile.specs.filter(s => s.key === 'verified_usb_midi_controller_mode');
  assert.equal(facts.length, 1);
  assert.equal(facts[0].value, false);
  assert.equal(facts[0].source, source);
  assert.equal(facts[0].confidence, 'confirmed');
  assert.match(facts[0].notes, /DIN.*unresolved/);
});

test('S4 MK3 keeps unresolved MIDI planning conditional and preserves handwritten certificate checks', () => {
  const profile = read(), original = structuredClone(profile), plan = completePlan(profile);
  assert.equal(capabilitiesOf(profile).midi, 'conditional');
  assert.equal(midiPrerequisites(profile).transport, 'unknown');
  const generated = plan.tests.filter(t => t.auto && t.method.startsWith('midi:'));
  assert.deepEqual(generated.map(t => t.method), ['midi:conformance', 'midi:coverage', 'midi:latency']);
  for (const check of generated) {
    assert.match(check.params.condition, /documentation confirms MIDI output.*Skip/);
    assert.doesNotMatch(check.steps.join(' '), /directly to a USB port/);
  }
  assert.equal(generated[0].params.outputSelection, 'explicit');
  assert.deepEqual(plan.tests.slice(0, 11), original.tests);
  assert.deepEqual(certificatePlan(plan), {
    profileId: id, profileVersion: 1, model: 'Native Instruments TRAKTOR KONTROL S4 MK3', tests: original.tests,
  });
  assert.deepEqual(profile, original);
});

test('S4 MK3 MIDI-mode addendum preserves every original profile field and object', () => {
  const profile = read();
  assert.ok(profile.identityNotes.endsWith(addendum));
  assert.equal(profile.documents.length, 7);
  assert.equal(profile.specs.length, 9);
  assert.equal(profile.documents.at(-1).url, source);
  assert.equal(profile.specs.at(-1).key, 'verified_usb_midi_controller_mode');
  profile.identityNotes = profile.identityNotes.slice(0, -addendum.length)
    .replace('DIN MIDI and exact control maps, USB IDs', 'MIDI transport/maps, USB IDs');
  profile.documents.pop();
  profile.specs.pop();
  profile.connectivity.midi.usbMidi = null;
  assert.equal(createHash('sha256').update(`${JSON.stringify(profile, null, 2)}\n`).digest('hex'), originalHash,
    'all eleven handwritten checks, audio unknowns, maps, IDs, software and original provenance remain exact');
});
