import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { certificatePlan } from '../app/certificate.js';
import { validateProfile } from '../app/devices/library.js';
import {
  audioOutCapability, auditProfile, capabilitiesOf, completePlan, midiPrerequisites,
} from '../app/devices/test-plan.js';

// Captured before production edits from source39, 04bbc7146f09dc2d1ebd0a6b403d4549d4d6f26b.
// Full object fingerprints preserve the original fields, not just IDs or counts.
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const originalIdentityNotes = 'Research seed with conservative, capability-dependent tests. Exact MIDI IDs, USB IDs, revision, OS support, audio channel maps and tolerance limits are NOT verified; learn or confirm on real hardware before giving pass/fail based on fixed specifications.';
const cases = [
  {
    id: 'pioneer-dj-ddj-rev1', model: 'DDJ-REV1', edition: 'DRI1744B',
    manual: 'https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-REV1/DDJ-REV1_DRI1744B_manual.pdf',
    manualSha256: 'a69668e9c2f01dea8e749885d2d42477466b08568dc3f88ae2339e5be2d9f803',
    midiPage: 57, audioPage: 55, connectorPage: 56, originalSpecCount: 3,
    baseline: {
      profile: '609c554b88a17ad8fe6b67c14afb18fa87a78c57d336e034005ddf02c4b01b26',
      specs: '4fcba20b63611f88ec743d17c11fa32d8192bc93d2e67ea1e3a7db32726b66d5',
      documents: '830d039dd97df086b2c1dd1e0c0f59d977dbf5a6c9a42fad1fe3aeeb6401f2f2',
      tests: 'd73d36b4e16e27757f15109e6368c7cc4accb44425b9c0b8ee702ecd2744744b',
      software: 'dd46b2fd2314debe6f58834662d1cd1486d2bcf07eb00debe9e8ebbd5e112c5c',
    },
  },
  {
    id: 'pioneer-dj-ddj-rev5', model: 'DDJ-REV5', edition: 'DRI1872B',
    manual: 'https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-REV5/DDJ-REV5_DRI1872B_manual.pdf',
    manualSha256: 'f7068d560a6b56fba4714dbb415ae80c2205a1f5e0d728f981adc4356b4be7a5',
    midiPage: 132, audioPage: 133, connectorPage: 134, originalSpecCount: 4,
    baseline: {
      profile: 'ab2a78f0acad792c657f53d04a4569940a35e68532d5104707da0ca2177a1ae1',
      specs: 'ba95167b10f13ece00c8c1831db4bef53ae4815c01929e6c84686651ecbe6b98',
      documents: 'f9b08c9be0a40cac7735af101ae72d5565f15d1e0cf0ff85a6fbc664ef569554',
      tests: '8443ee9e388f7e628a4b20ba434d27d3ef2807d7481bf1cbe9c7765845bd84c4',
      software: '50bbf50b1c09de4be0277f8c1a13960ba524924c3a896930e58ff7b618ab6b9a',
    },
  },
];

const midiChecks = [
  ['midi:conformance', 'auto-midi-conformance'],
  ['midi:coverage', 'auto-midi-coverage'],
  ['midi:latency', 'auto-midi-timing'],
];

for (const { id, model, edition, manual, manualSha256, midiPage, audioPage, connectorPage, originalSpecCount, baseline } of cases) {
  const read = () => JSON.parse(readFileSync(new URL(`../app/devices/profiles/${id}.json`, import.meta.url), 'utf8'));

  function sourcedSpec(profile, key, value, unit, page) {
    const matches = profile.specs.filter(s => s.key === key);
    assert.equal(matches.length, 1, `${key}: one sourced fact`);
    const spec = matches[0];
    assert.equal(spec.value, value, key);
    assert.equal(spec.unit, unit, key);
    assert.equal(spec.confidence, 'confirmed', key);
    assert.equal(spec.source, manual, key);
    assert.ok(spec.notes.includes(edition), `${key}: manual edition`);
    assert.ok(spec.notes.includes(`p. ${page}`), `${key}: source page`);
  }

  test(`${id}: USB MIDI has exact-model manual provenance and retains research-seed membership`, () => {
    const profile = read();
    assert.equal(validateProfile(profile).ok, true);
    assert.equal(profile.connectivity.midi.usbMidi, true);
    assert.match(profile.identityNotes, /^Research seed\. /);
    assert.ok(profile.identityNotes.includes(edition));
    const documents = profile.documents.filter(d => d.url === manual);
    assert.equal(documents.length, 1, 'one exact manual reference');
    assert.equal(documents[0].type, 'user-manual');
    assert.equal(documents[0].language, 'en');
    assert.ok(documents[0].title.includes(model));
    assert.ok(documents[0].title.includes(edition));
    assert.equal(profile.documents.length, 7);
    sourcedSpec(profile, 'verified_usb_midi_transport', true, 'bool', midiPage);
  });

  test(`${id}: nominal Audio Section and converter facts do not become USB stream formats`, () => {
    const profile = read();
    sourcedSpec(profile, 'verified_audio_section_sampling_rate', 48000, 'Hz', audioPage);
    sourcedSpec(profile, 'verified_ad_da_converter_depth', 24, 'bit', audioPage);
    assert.equal(profile.specs.length, originalSpecCount + 3);
    assert.deepEqual(profile.connectivity.audio, {
      usbChannelsIn: null, usbChannelsOut: null, sampleRatesHz: [], bitDepth: null,
    });
  });

  test(`${id}: original objects and every unrelated profile field are preserved`, () => {
    const profile = read();
    assert.equal(fingerprint(profile.specs.slice(0, originalSpecCount)), baseline.specs, 'all original specification objects');
    assert.equal(fingerprint(profile.documents.slice(0, 6)), baseline.documents, 'all six original document objects');
    assert.equal(profile.tests.length, 8);
    assert.equal(fingerprint(profile.tests), baseline.tests, 'all eight original handwritten test objects');
    assert.equal(fingerprint(profile.software), baseline.software, 'original software names, roles and minimum versions');
    assert.deepEqual(profile.connectivity.usb, {
      present: true, vendorId: null, productIds: [], classCompliant: null,
    });
    assert.equal(profile.connectivity.midi.din, null);
    assert.deepEqual(profile.connectivity.midi.portNamePatterns, [model]);
    assert.deepEqual(profile.midi, { mapSource: 'learn', complete: false, controls: [] });
    const original = structuredClone(profile);
    original.identityNotes = originalIdentityNotes;
    original.documents = original.documents.slice(0, 6);
    original.specs = original.specs.slice(0, originalSpecCount);
    original.connectivity.midi.usbMidi = null;
    assert.equal(fingerprint(original), baseline.profile,
      'all fields outside the four scoped provenance changes remain identical');
  });

  test(`${id}: USB MIDI planning retains the receiving and optional Identity boundaries`, () => {
    const profile = read(), original = structuredClone(profile), plan = completePlan(profile);
    assert.equal(capabilitiesOf(profile).midi, true);
    assert.equal(midiPrerequisites(profile).transport, 'usb');
    for (const [method, testId] of midiChecks) {
      const checks = plan.tests.filter(t => t.method === method);
      assert.equal(checks.length, 1, method);
      assert.equal(checks[0].id, testId, method);
      assert.equal(checks[0].auto, true, method);
      assert.equal(Object.hasOwn(checks[0].params, 'condition'), false, method);
    }
    const conformance = plan.tests.find(t => t.method === 'midi:conformance');
    assert.equal(Object.hasOwn(conformance.params, 'outputSelection'), false,
      'confirmed USB transport uses the existing USB output-pairing policy');
    assert.ok(conformance.steps.some(s => /output only when.*documented receiving connection/i.test(s)));
    assert.ok(conformance.steps.some(s => /reply is not required/i.test(s)));
    assert.equal(plan.tests.some(t => t.method === 'midi:gm'), false);
    assert.deepEqual(profile, original, 'planning does not mutate the source');
  });

  test(`${id}: conditional audio, certificate identity and handwritten order remain intact`, () => {
    const profile = read(), original = structuredClone(profile), plan = completePlan(profile);
    assert.equal(audioOutCapability(profile), 'conditional');
    const audio = plan.tests.filter(t => t.method === 'audio:quality');
    assert.equal(audio.length, 1);
    assert.equal(audio[0].id, 'auto-audio-quality');
    assert.equal(audio[0].auto, true);
    assert.equal(audio[0].severity, 'minor');
    assert.match(audio[0].params.condition, /Only when the unit has its own audio output/);
    assert.equal(audio[0].params.levelDbfs, -12);
    assert.deepEqual(plan.tests.slice(0, 8), original.tests);
    assert.deepEqual(certificatePlan(plan), {
      profileId: id, profileVersion: 1, model: `Pioneer DJ ${model}`, tests: original.tests,
    });
    assert.equal(new Set(plan.tests.map(t => t.id)).size, plan.tests.length);
    assert.deepEqual(auditProfile(plan).gaps, []);
    assert.deepEqual(profile, original, 'planning does not mutate the source');
  });

  test(`${id}: the provenance note identifies the exact manual, pages and unresolved USB audio scope`, () => {
    const note = readFileSync(new URL(`../docs/devices/${id}.md`, import.meta.url), 'utf8');
    for (const text of [model, edition, manual, manualSha256, `p. ${midiPage}`, `p. ${audioPage}`, `p. ${connectorPage}`]) {
      assert.ok(note.includes(text), `provenance includes ${text}`);
    }
    for (const field of ['usbChannelsIn', 'usbChannelsOut', 'sampleRatesHz', 'bitDepth', 'classCompliant']) {
      assert.ok(note.includes(field), `${field}: unresolved qualification scope remains explicit`);
    }
  });
}
