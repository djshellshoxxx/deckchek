import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { certificatePlan } from '../app/certificate.js';
import { validateProfile } from '../app/devices/library.js';
import { audioOutCapability, auditProfile, capabilitiesOf, completePlan } from '../app/devices/test-plan.js';

const SOURCE = 'https://cdn-resources.ableton.com/resources/pdfs/push-manual/3/2025-09-17/push3-manual-en.pdf';
const PDF_SHA256 = 'ae68c982cfbe326768129b046937b16440521ee15516b5b6428adfb11781315a';
const ORIGINAL_IDENTITY = 'Candidate hardware and software capabilities only; verify manual, revision, HID/MIDI transport, audio I/O, OS support and firmware on a physical unit. No claimed factory tolerances or MIDI identifiers. Transport addendum (2026-11-18): Push 3 USB power FAQ, article 9109387410716: USB-C carries MIDI on the computer/device connection. The USB-A host role is separate; no DIN connector conclusion is drawn from TRS sockets.';
// Captured from the sealed transport overlay before the audio-count update.
const BASELINE = {
  profile: 'f8c8f0a2d1ad62475a848770fb867ad9e2fc292a5eadf89936c0b85b4fdc86cb',
  tests: '86128b35d11b134c07ef0ac7f7f9d9cc3e11fef407d023ba10e3f295f1e6bdfb',
  specs: '54614a6938a04e745dc0f913fb34a3c8326c7f47ce4f4ab2b7fb8698e2d08340',
  documents: '2385e348bedda8e7104528b4aa02e8029dafbcfb4f249a1d8b700eaadbcac1b5',
  software: '3e111d49f053e3b825dca39837f06153768d0902e40570da166a60cec4a9d89a',
  noteBytes: 1521,
  noteSha256: 'f620937172bd1ee8cf681a7891ddb9522c446ebd0d6e3658b6a7889bbbde95e3',
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = value => digest(JSON.stringify(value));
const readProfile = () => JSON.parse(readFileSync(new URL('../app/devices/profiles/ableton-push-3.json', import.meta.url), 'utf8'));
const previousAudioProfile = profile => {
  const previous = structuredClone(profile);
  previous.connectivity.audio.usbChannelsIn = null;
  previous.connectivity.audio.usbChannelsOut = null;
  return previous;
};

test('Push 3 documents 16 host input and 16 host output channels in the CoreAudio configuration', () => {
  const profile = readProfile();
  assert.equal(validateProfile(profile).ok, true);
  assert.deepEqual(profile.connectivity.audio, {
    usbChannelsIn: 16, usbChannelsOut: 16, sampleRatesHz: [], bitDepth: null,
  });
  assert.equal(audioOutCapability(profile), true);
  assert.equal(capabilitiesOf(profile).audioIn, true);
});

test('Push 3 retains every prior profile object and the complete MIDI transport overlay', () => {
  const profile = readProfile();
  assert.equal(profile.tests.length, 10);
  assert.equal(fingerprint(profile.tests), BASELINE.tests);
  assert.equal(fingerprint(profile.specs.slice(0, 9)), BASELINE.specs);
  assert.equal(fingerprint(profile.documents.slice(0, 9)), BASELINE.documents);
  assert.equal(fingerprint(profile.software), BASELINE.software);
  assert.ok(profile.identityNotes.startsWith(ORIGINAL_IDENTITY));
  const original = previousAudioProfile(profile);
  original.identityNotes = ORIGINAL_IDENTITY;
  original.specs = original.specs.slice(0, 9);
  original.documents = original.documents.slice(0, 9);
  assert.equal(fingerprint(original), BASELINE.profile,
    'reversing exactly the two counts and appended provenance recovers the sealed transport profile');
});

test('Push 3 host counts do not infer stream formats, USB identity, compliance or MIDI mappings', () => {
  const profile = readProfile();
  assert.deepEqual(profile.connectivity.audio.sampleRatesHz, []);
  assert.equal(profile.connectivity.audio.bitDepth, null);
  assert.deepEqual(profile.connectivity.usb, {
    present: true, vendorId: null, productIds: [], classCompliant: null,
  });
  assert.deepEqual(profile.connectivity.midi, { usbMidi: true, din: null, portNamePatterns: ['Push 3'] });
  assert.deepEqual(profile.midi, { mapSource: 'learn', complete: false, controls: [] });
  assert.equal(profile.software[0].minVersion, null);
});

test('Push 3 channel counts have exactly two scoped facts and one dated manufacturer document', () => {
  const profile = readProfile();
  assert.equal(profile.specs.length, 11);
  assert.equal(profile.documents.length, 10);
  for (const key of ['verified_usb_audio_input_channels', 'verified_usb_audio_output_channels']) {
    const facts = profile.specs.filter(s => s.key === key);
    assert.equal(facts.length, 1, key);
    assert.equal(facts[0].value, 16);
    assert.equal(facts[0].unit, 'count');
    assert.equal(facts[0].confidence, 'confirmed');
    assert.equal(facts[0].source, SOURCE);
    for (const scope of ['2025-09-17', '3.1', '20–21', 'USB-C', 'CoreAudio', 'host', 'physical', 'firmware', 'macOS', 'Windows']) {
      assert.ok(facts[0].notes.includes(scope), `${key}: ${scope}`);
    }
  }
  const documents = profile.documents.filter(d => d.url === SOURCE);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].type, 'user-manual');
  assert.equal(documents[0].language, 'en');
  assert.match(documents[0].title, /2025-09-17/);
  for (const scope of ['3.1', '20–21', 'USB-C', 'CoreAudio', 'firmware', 'macOS', 'Windows']) {
    assert.ok(documents[0].notes.includes(scope), scope);
  }
  assert.match(profile.identityNotes, /USB audio addendum/);
  assert.match(profile.identityNotes, /CoreAudio/);
});

test('Push 3 output applicability becomes confirmed while the audio stimulus and remaining test contract stay intact', () => {
  const profile = readProfile(), previous = previousAudioProfile(profile);
  assert.equal(audioOutCapability(previous), 'conditional');
  assert.equal(audioOutCapability(profile), true);
  const oldAudio = completePlan(previous).tests.filter(t => t.method === 'audio:quality');
  const newAudio = completePlan(profile).tests.filter(t => t.method === 'audio:quality');
  assert.equal(oldAudio.length, 1);
  assert.equal(newAudio.length, 1);
  assert.equal(oldAudio[0].auto, true);
  assert.equal(newAudio[0].auto, true);
  assert.equal(oldAudio[0].severity, 'minor');
  assert.equal(typeof oldAudio[0].params.condition, 'string');
  assert.equal(newAudio[0].severity, 'major');
  assert.equal(Object.hasOwn(newAudio[0].params, 'condition'), false);
  assert.equal(oldAudio[0].params.levelDbfs, -12);
  assert.equal(newAudio[0].params.levelDbfs, -12);
  const expected = structuredClone(oldAudio[0]);
  delete expected.params.condition;
  expected.severity = 'major';
  assert.deepEqual(newAudio[0], expected, 'only applicability condition and its severity change');
});

test('Push 3 plan IDs, handwritten order, MIDI checks and certificate requirements remain stable', () => {
  const profile = readProfile(), unchanged = structuredClone(profile);
  const previous = previousAudioProfile(profile), plan = completePlan(profile), oldPlan = completePlan(previous);
  assert.equal(plan.tests.length, oldPlan.tests.length);
  assert.equal(plan.autoTests, oldPlan.autoTests);
  assert.deepEqual(plan.tests.map(t => t.id), oldPlan.tests.map(t => t.id));
  assert.deepEqual(plan.tests.slice(0, 10), profile.tests);
  assert.deepEqual(plan.tests.filter(t => t.method !== 'audio:quality'), oldPlan.tests.filter(t => t.method !== 'audio:quality'));
  assert.equal(new Set(plan.tests.map(t => t.id)).size, plan.tests.length);
  assert.deepEqual(certificatePlan(plan), certificatePlan(oldPlan));
  assert.deepEqual(certificatePlan(plan), certificatePlan(profile));
  assert.deepEqual(auditProfile(plan).gaps, []);
  assert.deepEqual(completePlan(plan).tests, plan.tests);
  assert.deepEqual(profile, unchanged, 'planning does not mutate its source profile');
});

test('Push 3 readable audio provenance preserves the full MIDI note and explains the host-count limits', () => {
  const raw = readFileSync(new URL('../docs/devices/ableton-push-3.md', import.meta.url));
  assert.equal(digest(raw.subarray(0, BASELINE.noteBytes)), BASELINE.noteSha256,
    'the complete prior MIDI note remains byte-identical as the prefix');
  const addendum = raw.subarray(BASELINE.noteBytes).toString('utf8');
  for (const token of [SOURCE, PDF_SHA256, '2025-09-17', 'pp. 20–21', 'USB-C', 'CoreAudio', 'physical sockets',
    'individual', 'firmware', 'macOS', 'Windows', 'current OS', 'sampleRatesHz', 'bitDepth', 'classCompliant', '-12 dBFS']) {
    assert.ok(addendum.includes(token), token);
  }
  assert.match(addendum, /16 input.*16 output/);
});
