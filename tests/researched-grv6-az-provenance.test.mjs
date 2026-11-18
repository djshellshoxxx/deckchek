import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { certificatePlan } from '../app/certificate.js';
import { validateProfile } from '../app/devices/library.js';
import {
  audioOutCapability, auditProfile, capabilitiesOf, completePlan, midiPrerequisites,
} from '../app/devices/test-plan.js';

// Fingerprints preserve the full original objects, not just their IDs or counts.
// Captured before this research update from source36 (4a0c8981afa8b587457ce13069876796fa06a190).
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cases = [
  {
    id: 'alphatheta-ddj-grv6', model: 'DDJ-GRV6', handwritten: 8,
    manual: 'https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-GRV6/DDJ-GRV6_DRI1927A_manual.pdf',
    edition: 'DRI1927A', midiPage: 170, audioPage: 168, rate: 48000,
    converters: [['verified_ad_da_converter_depth', 24]],
    baseline: {
      specs: '4333f86a734747b62ccb32078794adf2511c2bcb1944d90f07b4a17fd43f86c0',
      documents: '5ab413b1219b269392b6d29994f413dba641b2f2c9813d2b69da655c19a3cbcd',
      tests: '891fe9c2fa30cc21fccd907cba6c5154cb92be123bd39c4c7f45c78efca65be5',
      software: '907fbbdf667f123db5f577b386a671ea0f304f6ba51c87f6aad809818e591b4a',
    },
  },
  {
    id: 'alphatheta-xdj-az', model: 'XDJ-AZ', handwritten: 10,
    manual: 'https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AZ/XDJ-AZ_DRI1936C_manual_EN.pdf',
    edition: 'DRI1936C', midiPage: 129, audioPage: 151, rate: 44100,
    converters: [['verified_master_da_converter_depth', 32], ['verified_other_ad_da_converter_depth', 24]],
    baseline: {
      specs: '3f206af63b9d05f2419d7e330a4149b6e7e2084cd2e62b2a31b452eca30bfa90',
      documents: 'b0d0359a631382e82d65ebd115d15652e7df0d31a82fa63d4ef5bfbafd61fa0e',
      tests: 'ae1ee17bf0626f5997058db9df15c7716109ad4b8e0ad05684c46f634f58fc9b',
      software: 'db01f2ede241639fae98045e9e40a707ee9d65d463963c7be5d8158ce12f2e93',
    },
  },
];

const midiChecks = [
  ['midi:conformance', 'auto-midi-conformance'],
  ['midi:coverage', 'auto-midi-coverage'],
  ['midi:latency', 'auto-midi-timing'],
];

for (const { id, model, handwritten, manual, edition, midiPage, audioPage, rate, converters, baseline } of cases) {
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

  test(`${id}: USB MIDI has exact-model manual provenance`, () => {
    const profile = read();
    assert.equal(validateProfile(profile).ok, true);
    assert.equal(profile.connectivity.midi.usbMidi, true);
    const documents = profile.documents.filter(d => d.url === manual);
    assert.equal(documents.length, 1);
    assert.equal(documents[0].type, 'user-manual');
    assert.equal(documents[0].language, 'en');
    assert.ok(documents[0].title.includes(model));
    assert.ok(documents[0].title.includes(edition));
    assert.equal(profile.documents.length, 7);
    sourcedSpec(profile, 'verified_usb_midi_transport', true, 'bool', midiPage);
  });

  test(`${id}: nominal audio and scoped converter facts do not become USB formats`, () => {
    const profile = read();
    sourcedSpec(profile, 'verified_audio_section_sampling_rate', rate, 'Hz', audioPage);
    for (const [key, depth] of converters) sourcedSpec(profile, key, depth, 'bit', audioPage);
    if (id === 'alphatheta-xdj-az') {
      assert.equal(profile.specs.some(s => s.key === 'verified_ad_da_converter_depth'), false,
        'the master D/A and other converters have distinct resolutions');
    }
    assert.equal(profile.specs.length, 8 + converters.length);
    assert.deepEqual(profile.connectivity.audio, {
      usbChannelsIn: null, usbChannelsOut: null, sampleRatesHz: [], bitDepth: null,
    });
  });

  test(`${id}: source prefixes, handwritten checks and qualification unknowns are preserved`, () => {
    const profile = read();
    for (const key of ['specs', 'documents']) {
      assert.equal(fingerprint(profile[key].slice(0, 6)), baseline[key], `${key}: original six entries`);
    }
    assert.equal(profile.tests.length, handwritten);
    assert.equal(fingerprint(profile.tests), baseline.tests, 'all original handwritten test objects');
    assert.equal(fingerprint(profile.software), baseline.software, 'software qualification remains unchanged');
    assert.deepEqual(profile.connectivity.usb, {
      present: true, vendorId: null, productIds: [], classCompliant: null,
    });
    assert.equal(profile.connectivity.midi.din, null);
    assert.deepEqual(profile.connectivity.midi.portNamePatterns, [model]);
    assert.deepEqual(profile.midi, { mapSource: 'learn', complete: false, controls: [] });
  });

  test(`${id}: confirmed USB MIDI removes conditional planning without inventing receiving support`, () => {
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
    assert.ok(conformance.steps.some(s => /output only when.*documented receiving connection/i.test(s)));
    assert.ok(conformance.steps.some(s => /reply is not required/i.test(s)));
    assert.equal(plan.tests.some(t => t.method === 'midi:gm'), false);
    assert.deepEqual(profile, original, 'planning does not mutate the source');
  });

  test(`${id}: conditional audio, certificate identity and handwritten order survive planning`, () => {
    const profile = read(), original = structuredClone(profile), plan = completePlan(profile);
    assert.equal(audioOutCapability(profile), 'conditional');
    const audio = plan.tests.filter(t => t.method === 'audio:quality');
    assert.equal(audio.length, 1);
    assert.equal(audio[0].id, 'auto-audio-quality');
    assert.equal(audio[0].auto, true);
    assert.equal(audio[0].severity, 'minor');
    assert.match(audio[0].params.condition, /Only when the unit has its own audio output/);
    assert.ok(Number.isFinite(audio[0].params.levelDbfs) && audio[0].params.levelDbfs <= -12);
    assert.deepEqual(plan.tests.slice(0, handwritten), original.tests);
    assert.deepEqual(certificatePlan(plan), {
      profileId: id, profileVersion: 1, model: `AlphaTheta ${model}`, tests: original.tests,
    });
    assert.equal(new Set(plan.tests.map(t => t.id)).size, plan.tests.length);
    assert.deepEqual(auditProfile(plan).gaps, []);
    assert.deepEqual(profile, original, 'planning does not mutate the source');
  });
}
