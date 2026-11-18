import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { certificatePlan } from '../app/certificate.js';
import { validateProfile } from '../app/devices/library.js';
import { audioOutCapability, auditProfile, completePlan } from '../app/devices/test-plan.js';

const cases = [
  {
    id: 'alphatheta-ddj-flx10', handwritten: 8,
    manual: 'https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-FLX10/DDJ-FLX10_DRI1822D_manual.pdf',
  },
  {
    id: 'pioneer-dj-xdj-rx3', handwritten: 10,
    manual: 'https://downloads.support.alphatheta.com/manuals/XDJ_RX3_DRI1702C_manual.pdf',
  },
];

for (const { id, handwritten, manual } of cases) {
  const read = () => JSON.parse(readFileSync(new URL(`../app/devices/profiles/${id}.json`, import.meta.url), 'utf8'));

  test(`${id}: sourced MIDI and converter facts do not invent USB topology or formats`, () => {
    const profile = read();
    assert.equal(validateProfile(profile).ok, true);
    assert.equal(profile.connectivity.midi.usbMidi, true);
    assert.ok(profile.documents.some(d => d.url === manual && d.type === 'user-manual'));
    for (const [key, value] of [
      ['verified_usb_midi_transport', true],
      ['verified_audio_section_sampling_rate', 44100],
      ['verified_ad_da_converter_depth', 24],
    ]) {
      const spec = profile.specs.find(s => s.key === key);
      assert.equal(spec?.value, value, key);
      assert.equal(spec?.confidence, 'confirmed', key);
      assert.equal(spec?.source, manual, key);
    }
    assert.deepEqual(profile.connectivity.audio, {
      usbChannelsIn: null, usbChannelsOut: null, sampleRatesHz: [], bitDepth: null,
    });
    assert.deepEqual(profile.connectivity.usb, {
      present: true, vendorId: null, productIds: [], classCompliant: null,
    });
    assert.equal(profile.connectivity.midi.din, null);
    assert.deepEqual(profile.midi, { mapSource: 'learn', complete: false, controls: [] });
    assert.ok(profile.software.every(s => s.minVersion === null));
  });

  test(`${id}: planning retains conditional audio, handwritten checks and certificate identity`, () => {
    const profile = read(), original = structuredClone(profile), plan = completePlan(profile);
    assert.equal(audioOutCapability(profile), 'conditional');
    const audio = plan.tests.filter(t => t.method === 'audio:quality');
    assert.equal(audio.length, 1);
    assert.equal(audio[0].auto, true);
    assert.equal(audio[0].severity, 'minor');
    assert.match(audio[0].params.condition, /Only when the unit has its own audio output/);
    assert.ok(audio[0].params.levelDbfs <= -12);
    for (const method of ['midi:conformance', 'midi:coverage', 'midi:latency']) {
      assert.ok(plan.tests.some(t => t.method === method), method);
    }
    assert.equal(original.tests.length, handwritten);
    assert.deepEqual(plan.tests.slice(0, handwritten), original.tests);
    assert.deepEqual(certificatePlan(plan), certificatePlan(original));
    assert.equal(new Set(plan.tests.map(t => t.id)).size, plan.tests.length);
    assert.deepEqual(auditProfile(plan).gaps, []);
    assert.deepEqual(profile, original);
  });
}
