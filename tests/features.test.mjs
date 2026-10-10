import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, isEnabled, setEnabled, featureNames, configureFeatures, bindSettings, onFeatureChange } from '../app/features.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), raw: () => m.get('deckchek.ui.v1') }; };
const fresh = () => { const storage = memStorage(); configureFeatures({ storage }); return storage; };

test('registry lists every FS-00 §4.14 flag with metadata', () => {
  const expected = ['setupWizard', 'diagnosticsBundle', 'pdfExport', 'testMedia', 'backup', 'pregig', 'latencyTuner', 'stylusWear', 'wearMap', 'scratchTest', 'humHunter', 'feedbackStep', 'certificates', 'population', 'packs', 'service', 'fleet', 'phoneImport', 'liveMonitor', 'mapperStudio', 'gearLedger'];
  assert.deepEqual(featureNames().sort(), [...expected].sort());
  for (const [name, meta] of Object.entries(FEATURES)) {
    assert.equal(typeof meta.default, 'boolean', name);
    assert.match(meta.milestone, /^M[5-9]$/, name);
    assert.match(meta.spec, /^FS-\d\d$/, name);
    assert.ok(meta.label && meta.description, name);
  }
});

test('every features.* flag mentioned in docs/specs exists in FEATURES', () => {
  const dir = path.join(root, 'docs', 'specs');
  const mentioned = new Set();
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    for (const m of fs.readFileSync(path.join(dir, file), 'utf8').matchAll(/features\.([A-Za-z]+)/g)) if (m[1] !== 'js') mentioned.add(m[1]);
  }
  assert.ok(mentioned.size >= 15);
  for (const name of mentioned) assert.ok(name in FEATURES, `missing flag ${name}`);
});

test('defaults follow the plan: wizard, pdf, backup, population, fleet on; new features off', () => {
  fresh();
  for (const n of ['setupWizard', 'pdfExport', 'backup', 'population', 'fleet']) assert.equal(isEnabled(n), true, n);
  for (const n of ['pregig', 'liveMonitor', 'packs', 'service', 'gearLedger']) assert.equal(isEnabled(n), false, n);
  assert.equal(isEnabled('doesNotExist'), false);
});

test('setEnabled persists in deckchek.ui.v1.features and keeps other settings', () => {
  const storage = fresh();
  storage.setItem('deckchek.ui.v1', JSON.stringify({ theme: 'light' }));
  setEnabled('pregig', true);
  setEnabled('backup', false);
  const saved = JSON.parse(storage.raw());
  assert.equal(saved.theme, 'light');
  assert.deepEqual(saved.features, { pregig: true, backup: false });
  assert.equal(isEnabled('pregig'), true);
  assert.equal(isEnabled('backup'), false);
  setEnabled('pregig', false); // back to default: override dropped
  assert.deepEqual(JSON.parse(storage.raw()).features, { backup: false });
  assert.throws(() => setEnabled('nope', true), /Unknown feature flag/);
});

test('corrupt or unavailable storage falls back to defaults', () => {
  configureFeatures({ storage: { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } } });
  assert.equal(isEnabled('setupWizard'), true);
  assert.doesNotThrow(() => setEnabled('pregig', true));
  configureFeatures({ storage: { getItem: () => JSON.stringify({ features: { pregig: 'yes', fleet: false } }), setItem() {} } });
  assert.equal(isEnabled('pregig'), false); // non-boolean ignored
  assert.equal(isEnabled('fleet'), false);
  configureFeatures({ storage: null });
  assert.equal(isEnabled('backup'), true);
});

test('bound settings object is kept in sync so later settings writes do not clobber flags', () => {
  const storage = fresh();
  const settings = { theme: 'dark' };
  bindSettings(settings);
  setEnabled('humHunter', true);
  assert.deepEqual(settings.features, { humHunter: true });
  storage.setItem('deckchek.ui.v1', JSON.stringify(settings)); // what state.js setSetting does
  assert.equal(JSON.parse(storage.raw()).features.humHunter, true);
  assert.equal(isEnabled('humHunter'), true);
});

test('change listeners fire and can be removed', () => {
  fresh();
  const seen = [];
  const off = onFeatureChange(e => seen.push(e));
  setEnabled('service', true);
  off();
  setEnabled('service', false);
  assert.deepEqual(seen, [{ name: 'service', enabled: true }]);
});
