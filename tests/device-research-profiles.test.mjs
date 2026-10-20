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

test('hardware library index is deterministic, complete and unique', () => {
  assert.deepEqual(index, buildIndex(deviceDir));
  assert.equal(new Set(index.profiles).size, index.profiles.length);
  assert.ok(index.profiles.length >= 46);
});

test('all indexed hardware profiles satisfy DeckChek validation', () => {
  for (const profile of profiles) {
    const result = validateProfile(profile);
    assert.equal(result.ok, true, profile.id + ': ' + result.errors.join('; '));
    assert.ok(profile.tests.every(t => t.steps?.length), profile.id + ' has test without steps');
    assert.ok(profile.documents?.length, profile.id + ' missing documents');
  }
});

test('research profiles have provenance and no invented MIDI mappings', () => {
  const added = profiles.filter(p => p.identityNotes?.includes('Candidate') || p.identityNotes?.includes('Research seed'));
  assert.ok(added.length >= 37, 'catalogue research batch absent');
  for (const p of added) {
    assert.equal(p.midi?.mapSource, 'learn', p.id);
    assert.equal(p.midi?.complete, false, p.id);
    assert.ok(p.specs.every(spec => spec.confidence === 'unverified' && /^https:\/\//.test(spec.source)), p.id);
    assert.ok(p.documents.some(d => d.type === 'service-manual' && !d.url), p.id);
    assert.ok(p.tests.every(t => t.pass == null), p.id + ': uncalibrated research test must not have hard-coded pass threshold');
  }
});
