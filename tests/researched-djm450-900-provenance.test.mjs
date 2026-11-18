import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { certificatePlan } from '../app/certificate.js';
import { validateProfile } from '../app/devices/library.js';
import {
  audioOutCapability, auditProfile, capabilitiesOf, completePlan, midiPrerequisites,
} from '../app/devices/test-plan.js';

// Full original object fingerprints were captured before this research update
// from published source38 child 61e265f536f9e5c5a2b78175eff6d3fdac62dd47.
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const originalIdentityNotes = 'Candidate hardware and software capabilities only; verify manual, revision, HID/MIDI transport, audio I/O, OS support and firmware on a physical unit. No claimed factory tolerances or MIDI identifiers.';
const usbComputerLabel = 'USB Type-B computer connections';
const usbComputerNotes = 'DRH1330C pp. 9, 14 identify computer USB connections and two Type-B terminals. These are computer connections, not USB host ports; the original key and count are retained for compatibility. https://downloads.support.alphatheta.com/manuals/dj-mixers/DJM-900NXS2/DJM-900NXS2_DRH1330C_quickstart-manual.pdf';
const cases = [
  {
    id: 'pioneer-dj-djm-450', model: 'DJM-450', usbMidi: true,
    midiManual: 'https://downloads.support.alphatheta.com/manuals/dj-mixers/DJM-450/DJM-450_DRI1406B_manual.pdf',
    audioManual: 'https://downloads.support.alphatheta.com/manuals/dj-mixers/DJM-450/DJM-450_DRH1395C_quickstart-manual.pdf',
    audioEdition: 'DRH1395C', audioPage: 13, rate: 48000, masterDepth: 24,
    originalSpecCount: 5, documentCount: 8,
    baseline: {
      profile: '8252cd6f6b14cbbfab578563864ea6dc5db54e9d95048f1e2565aa70dd2c117d',
      specs: '1a91c7a121a9950689229fc03afb0447118b0f3217d3430781ebcc27099252f6',
      documents: '821972b97c16426ef47f47a4baba9ddbd805a5ccf2a4c6ac9cd0c239688c0860',
      tests: 'f39540ec04a0b4f67ee9a67dfe589ba4f910ca23e75616353a318a92a82b825a',
      software: 'cccb9b0c62920513d84d289ec3c5de07f36c97740d104eb7c3604ce0a167c1ba',
    },
  },
  {
    id: 'pioneer-dj-djm-900nxs2', model: 'DJM-900NXS2', usbMidi: null,
    midiManual: null,
    audioManual: 'https://downloads.support.alphatheta.com/manuals/dj-mixers/DJM-900NXS2/DJM-900NXS2_DRH1330C_quickstart-manual.pdf',
    audioEdition: 'DRH1330C', audioPage: 14, rate: 96000, masterDepth: 32,
    originalSpecCount: 8, documentCount: 7,
    baseline: {
      profile: 'cb4897b5e9f05d77dc82db0573ff761a1fbd9b4ff00f130b78b4ec1820f3334d',
      specs: '1208c882bcb0f5c6e0bfba76ccd9cd9d90a688ae6a334b98f61314a33c8c16d1',
      documents: '71776a5b40e0d3d8957e75a1e70d05b1f070eb547d75bd66d2b1011cde832d99',
      tests: '2bf7e9cc4130121a7938b5ac460e271ffb29514d0c899da48367fb84bda1d7cb',
      software: 'cccb9b0c62920513d84d289ec3c5de07f36c97740d104eb7c3604ce0a167c1ba',
    },
  },
];

const midiChecks = [
  ['midi:conformance', 'auto-midi-conformance'],
  ['midi:coverage', 'auto-midi-coverage'],
  ['midi:latency', 'auto-midi-timing'],
];

function sourcedSpec(profile, key, value, unit, source, edition, page) {
  const matches = profile.specs.filter(s => s.key === key);
  assert.equal(matches.length, 1, `${key}: one sourced fact`);
  const spec = matches[0];
  assert.equal(spec.value, value, key);
  assert.equal(spec.unit, unit, key);
  assert.equal(spec.confidence, 'confirmed', key);
  assert.equal(spec.source, source, key);
  assert.ok(spec.notes.includes(edition), `${key}: manual edition`);
  assert.ok(spec.notes.includes(`p. ${page}`), `${key}: source page`);
}

for (const { id, model, usbMidi, midiManual, audioManual, audioEdition, audioPage, rate, masterDepth, originalSpecCount, documentCount, baseline } of cases) {
  const read = () => JSON.parse(readFileSync(new URL(`../app/devices/profiles/${id}.json`, import.meta.url), 'utf8'));

  test(`${id}: exact-model manuals support only the recorded transport conclusion`, () => {
    const profile = read();
    assert.equal(validateProfile(profile).ok, true);
    assert.equal(profile.connectivity.midi.usbMidi, usbMidi);
    for (const [url, edition] of [[audioManual, audioEdition], ...(midiManual ? [[midiManual, 'DRI1406B']] : [])]) {
      const documents = profile.documents.filter(d => d.url === url);
      assert.equal(documents.length, 1, `${edition}: one exact manual reference`);
      assert.equal(documents[0].type, 'user-manual');
      assert.equal(documents[0].language, 'en');
      assert.ok(documents[0].title.includes(model));
      assert.ok(documents[0].title.includes(edition));
    }
    assert.equal(profile.documents.length, documentCount);
    if (midiManual) {
      sourcedSpec(profile, 'verified_usb_midi_transport', true, 'bool', midiManual, 'DRI1406B', 11);
    } else {
      assert.equal(profile.specs.some(s => s.key === 'verified_usb_midi_transport'), false,
        'unavailable exact transport evidence does not become a confirmed fact');
    }
  });

  test(`${id}: nominal sampling and separately scoped converters do not become USB formats`, () => {
    const profile = read();
    sourcedSpec(profile, 'verified_audio_section_sampling_rate', rate, 'Hz', audioManual, audioEdition, audioPage);
    sourcedSpec(profile, 'verified_master_da_converter_depth', masterDepth, 'bit', audioManual, audioEdition, audioPage);
    sourcedSpec(profile, 'verified_other_ad_da_converter_depth', 24, 'bit', audioManual, audioEdition, audioPage);
    assert.equal(profile.specs.some(s => s.key === 'verified_ad_da_converter_depth'), false,
      'MASTER D/A and other converters keep the scopes used in the exact manual');
    assert.equal(profile.specs.length, originalSpecCount + 3 + (midiManual ? 1 : 0));
    assert.deepEqual(profile.connectivity.audio, {
      usbChannelsIn: null, usbChannelsOut: null, sampleRatesHz: [], bitDepth: null,
    });
  });

  test(`${id}: original objects and every unrelated profile field are preserved`, () => {
    const profile = read();
    const originalSpecs = structuredClone(profile.specs.slice(0, originalSpecCount));
    if (id === 'pioneer-dj-djm-900nxs2') {
      const usbPorts = originalSpecs.find(s => s.key === 'verified_usb_host_ports');
      // The separately asserted, source-backed label/notes correction is the only
      // exception within an original spec. Its key, value and other fields remain exact.
      usbPorts.label = 'usb host ports';
      usbPorts.notes = 'Published manufacturer capability';
    }
    assert.equal(fingerprint(originalSpecs), baseline.specs, 'all original spec fields except the explicit USB label/notes correction');
    assert.equal(fingerprint(profile.documents.slice(0, 6)), baseline.documents, 'all six original document objects');
    assert.equal(profile.tests.length, 6);
    assert.equal(fingerprint(profile.tests), baseline.tests, 'all six original handwritten test objects');
    assert.equal(fingerprint(profile.software), baseline.software, 'software qualification remains unchanged');
    assert.deepEqual(profile.connectivity.usb, {
      present: true, vendorId: null, productIds: [], classCompliant: null,
    });
    assert.equal(profile.connectivity.midi.din, null);
    assert.deepEqual(profile.connectivity.midi.portNamePatterns, [model]);
    assert.deepEqual(profile.midi, { mapSource: 'learn', complete: false, controls: [] });
    const original = structuredClone(profile);
    original.identityNotes = originalIdentityNotes;
    original.documents = original.documents.slice(0, 6);
    original.specs = originalSpecs;
    original.connectivity.midi.usbMidi = null;
    assert.equal(fingerprint(original), baseline.profile,
      'all fields outside the precisely scoped provenance changes remain identical');
  });

  test(`${id}: MIDI planning preserves the established transport and receiving boundary`, () => {
    const profile = read(), original = structuredClone(profile), plan = completePlan(profile);
    assert.equal(capabilitiesOf(profile).midi, usbMidi ? true : 'conditional');
    assert.equal(midiPrerequisites(profile).transport, usbMidi ? 'usb' : 'unknown');
    for (const [method, testId] of midiChecks) {
      const checks = plan.tests.filter(t => t.method === method);
      assert.equal(checks.length, 1, method);
      assert.equal(checks[0].id, testId, method);
      assert.equal(checks[0].auto, true, method);
      if (usbMidi) assert.equal(Object.hasOwn(checks[0].params, 'condition'), false, method);
      else assert.match(checks[0].params.condition, /documentation confirms MIDI output/, method);
    }
    const conformance = plan.tests.find(t => t.method === 'midi:conformance');
    if (usbMidi) assert.equal(Object.hasOwn(conformance.params, 'outputSelection'), false);
    else assert.equal(conformance.params.outputSelection, 'explicit', 'unknown transport still requires deliberate output selection');
    assert.ok(conformance.steps.some(s => /output only when.*documented receiving connection/i.test(s)));
    assert.ok(conformance.steps.some(s => /reply is not required/i.test(s)));
    assert.equal(plan.tests.some(t => t.method === 'midi:gm'), false);
    assert.deepEqual(profile, original, 'planning does not mutate the source');
  });

  test(`${id}: mixer audio planning, certificate identity and handwritten order remain intact`, () => {
    const profile = read(), original = structuredClone(profile), plan = completePlan(profile);
    assert.equal(audioOutCapability(profile), true);
    const audio = plan.tests.filter(t => t.method === 'audio:quality');
    assert.equal(audio.length, 1);
    assert.equal(audio[0].id, 'auto-audio-quality');
    assert.equal(audio[0].auto, true);
    assert.equal(audio[0].severity, 'major');
    assert.equal(Object.hasOwn(audio[0].params, 'condition'), false);
    assert.ok(Number.isFinite(audio[0].params.levelDbfs) && audio[0].params.levelDbfs <= -12);
    assert.deepEqual(plan.tests.slice(0, 6), original.tests);
    assert.deepEqual(certificatePlan(plan), {
      profileId: id, profileVersion: 1, model: `Pioneer DJ ${model}`, tests: original.tests,
    });
    assert.equal(new Set(plan.tests.map(t => t.id)).size, plan.tests.length);
    assert.deepEqual(auditProfile(plan).gaps, []);
    assert.deepEqual(profile, original, 'planning does not mutate the source');
  });
}

test('pioneer-dj-djm-900nxs2: the retained two-port key accurately labels computer connections', () => {
  const profile = JSON.parse(readFileSync(new URL('../app/devices/profiles/pioneer-dj-djm-900nxs2.json', import.meta.url), 'utf8'));
  const ports = profile.specs.filter(s => s.key === 'verified_usb_host_ports');
  assert.equal(ports.length, 1);
  assert.deepEqual(ports[0], {
    key: 'verified_usb_host_ports', label: usbComputerLabel, value: 2, unit: 'count',
    source: 'https://www.pioneerdj.com/en/product/dj-mixers/djm-900nxs2/',
    confidence: 'confirmed', notes: usbComputerNotes,
  });
});
