import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProfile } from '../app/devices/library.js';
import { buildIndex } from '../tools/build-device-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deviceDir = path.join(root, 'app/devices');
const index = JSON.parse(fs.readFileSync(path.join(deviceDir, 'index.json'), 'utf8'));
const profiles = index.profiles.map(id => JSON.parse(fs.readFileSync(path.join(deviceDir, 'profiles', id + '.json'), 'utf8')));

test('device library index matches files, is stable and unique', () => {
  assert.deepEqual(index, buildIndex(deviceDir));
  assert.equal(new Set(index.profiles).size, index.profiles.length);
  assert.equal(index.profiles.length, 45);
});

test('all indexed hardware profiles pass schema validation', () => {
  for (const profile of profiles) {
    const result = validateProfile(profile);
    assert.equal(result.ok, true, profile.id + ': ' + result.errors.join('; '));
    assert.ok(profile.tests.every(t => Array.isArray(t.steps) && t.steps.length), profile.id + ' has missing test instructions');
    assert.ok(profile.documents?.length, profile.id + ' missing documents');
  }
});

test('every research-seed profile has model-specific sourced capabilities and tests', () => {
  const researched = profiles.filter(p => p.identityNotes?.includes('Research seed') || p.identityNotes?.includes('Candidate hardware'));
  assert.equal(researched.length, 37);
  for (const p of researched) {
    assert.equal(p.midi?.mapSource, 'learn', p.id);
    assert.equal(p.midi?.complete, false, p.id);
    const confirmed = p.specs.filter(spec => spec.confidence === 'confirmed');
    const preliminary = p.specs.filter(spec => spec.confidence === 'unverified');
    assert.ok(confirmed.length > 0, p.id + ': no manufacturer-backed capability research');
    assert.ok(preliminary.length > 0, p.id + ': original assumptions must remain flagged');
    for (const spec of p.specs) assert.match(spec.source, /^https:\/\//, p.id + ': provenance URL missing');
    assert.ok(p.tests.every(t => t.pass == null), p.id + ': uncalibrated guided test has fixed pass threshold');
    assert.ok(p.tests.some(t => /verified-/.test(t.id)), p.id + ': no specific extended capability test');
    assert.ok(p.documents.some(d => d.type === 'service-manual'), p.id + ': service documentation status absent');
  }
});

test('standalone capabilities do not mix up model generations', () => {
  const xz = profiles.find(p => p.id === 'pioneer-dj-xdj-xz');
  assert.equal(xz.specs.find(s => s.key === 'verified_standalone_usb_playback_decks')?.value, 2);
  const go = profiles.find(p => p.id === 'denon-dj-prime-go');
  assert.equal(go.model, 'PRIME GO+');
  assert.equal(go.specs.find(s => s.key === 'verified_ethernet_port')?.value, false);
});
