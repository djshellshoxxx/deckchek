import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, makeRules, normalizeRules, matchesPreset, applyPrivacy } from '../app/ledger/privacy.js';

test('preset names accept declared strings and use complete Public defaults for other values', () => {
  for (const name of ['public', 'insurance', 'private']) {
    const rules = makeRules(name);
    assert.equal(rules.preset, name);
    assert.equal(rules.serialMode, PRESETS[name].serialMode);
    assert.deepEqual(rules.fields, PRESETS[name].fields);
    assert.deepEqual(normalizeRules(rules), rules);
    assert.equal(matchesPreset(rules), true);
  }
  const publicRules = makeRules('public');
  const invalid = [...Object.getOwnPropertyNames(Object.prototype), 'missing-preset', null, 0, false, [], {}];
  for (const name of invalid) {
    assert.deepEqual(makeRules(name), publicRules);
    assert.deepEqual(normalizeRules(JSON.parse(JSON.stringify({ preset: name }))), publicRules);
    assert.equal(matchesPreset({ ...publicRules, preset: name }), false);
  }
  assert.deepEqual(makeRules('custom'), publicRules, 'Custom is a rules label, not a preset definition');
  assert.equal(matchesPreset(null), false);
  assert.equal(matchesPreset({ preset: 'public', serialMode: 'hidden' }), false);
});

test('restored invalid preset rules stay editable and explicit Custom overrides keep their meaning', () => {
  const restored = normalizeRules(JSON.parse('{"preset":"constructor"}'));
  assert.equal(matchesPreset(restored), true);
  restored.fields.nickname = true;
  assert.equal(matchesPreset(restored), false);
  const item = { assetId: 'unit-1', nickname: 'Bench unit', serialNumber: 'SERIAL-12345678', notes: 'Private note' };
  assert.deepEqual(applyPrivacy(item, restored), { serialMode: 'hidden', nickname: 'Bench unit' });

  const custom = normalizeRules({ ...restored, preset: 'custom', serialMode: 'masked',
    items: { 'unit-1': { fields: { nickname: false } } }, ownerName: 'Operator' });
  assert.equal(custom.preset, 'custom');
  assert.equal(custom.ownerName, 'Operator');
  assert.equal(matchesPreset(custom), false);
  assert.deepEqual(applyPrivacy(item, custom), { serialMode: 'masked', serial: '****5678' });
  assert.deepEqual(normalizeRules(custom), custom);
});
