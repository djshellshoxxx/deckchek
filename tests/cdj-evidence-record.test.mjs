import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CDJ_EVIDENCE_SCHEMA, CDJ_QUALITY_FLAGS, createCdjEvidenceRecord,
  serializeCdjEvidenceRecord, deserializeCdjEvidenceRecord,
} from '../app/player/evidence-record.js';

const complete = () => ({
  runId: 'run-cdj-fixture-1', observedAt: '2026-11-20T20:31:32.123Z',
  asset: { assetId: 'asset-17', manufacturer: 'Example', model: 'Model X', firmware: 'unknown' },
  source: { medium: 'WAV on USB', referenceId: 'reference-tone-01', referenceHashSha256: 'a'.repeat(64),
    referenceVersion: 'v1', referenceFrequencyHz: 1000 },
  capture: { sampleRateHz: 48000, deviceName: 'interface-1', backend: 'native', selectedPairs: ['1-2'],
    gainDb: 0, routing: 'L/R line inputs', elapsedSeconds: 12, rawEvidenceRefs: ['capture/run-1'] },
  processing: { keylock: 'disabled', fx: 'disabled', evidenceRefs: ['operator/checklist-1'] },
  pitch: { displayedPercent: 0.4, supportedRangePercent: { min: -10, max: 10 } },
  analysis: { measuredFrequencyHz: 1005, method: 'reference_frequency_ratio_v1', methodVersion: '1',
    uncertainty: { expandedPercentagePoints: 0.05, method: 'synthetic-only', evidenceRefs: ['uncertainty/test-1'] } },
  quality: { flags: Object.fromEntries(CDJ_QUALITY_FLAGS.map(k => [k, true])), evidenceRefs: ['operator/checklist-1'] },
});

test('empty provisional envelope explicitly retains unknowns and is not report-eligible', () => {
  const record = createCdjEvidenceRecord();
  assert.equal(record.schemaVersion, CDJ_EVIDENCE_SCHEMA);
  assert.equal(record.asset.firmware, null);
  assert.equal(record.source.referenceHashSha256, null);
  assert.equal(record.capture.backend, null);
  assert.equal(record.analysis.uncertainty.method, null);
  assert.equal(record.quality.origin, 'caller_supplied_not_verified');
  assert.equal(record.quality.flags.toneStable, null);
  assert.equal(record.qualification.status, 'unverified');
  assert.equal(record.qualification.eligibleForReport, false);
  assert.equal(record.qualification.measurement, null);
  assert.ok(record.qualification.reasons.includes('reference_identity_unknown'));
});

test('all caller assertions and evidence identifiers remain provisional rather than verified', () => {
  const record = createCdjEvidenceRecord(complete());
  assert.equal(record.quality.flags.referenceIdentityVerified, true);
  assert.equal(record.asset.firmware, 'unknown');
  assert.deepEqual(record.capture.rawEvidenceRefs, ['capture/run-1']);
  assert.equal(record.analysis.units.displayDifference, 'percentage_points');
  assert.equal(record.qualification.eligibleForReport, false);
  assert.deepEqual(record.qualification.reasons, ['capture_reference_and_method_not_independently_validated', 'firmware_unknown']);
});

test('JSON transport round trip retains full provenance, unknowns and units without mutation', () => {
  const source = complete();
  const before = structuredClone(source);
  const record = createCdjEvidenceRecord(source);
  const encoded = serializeCdjEvidenceRecord(record);
  assert.deepEqual(deserializeCdjEvidenceRecord(encoded), record);
  assert.deepEqual(source, before);
  const unknown = createCdjEvidenceRecord({ asset: { model: 'Known', firmware: null } });
  assert.deepEqual(deserializeCdjEvidenceRecord(serializeCdjEvidenceRecord(unknown)), unknown);
});

test('transport cannot promote forged qualified reports, alter units or introduce metrics', () => {
  const record = createCdjEvidenceRecord(complete());
  const forged = JSON.stringify({ ...record, quality: { ...record.quality, origin: 'independently_verified' },
    analysis: { ...record.analysis, units: { frequency: 'Vrms', speed: 'RPM' } },
    qualification: { status: 'validated', eligibleForReport: true, measurement: { score: 100 }, reasons: [] },
    score: 100 });
  const parsed = deserializeCdjEvidenceRecord(forged);
  assert.equal(parsed.quality.origin, 'caller_supplied_not_verified');
  assert.deepEqual(parsed.analysis.units, { frequency: 'Hz', speed: 'percent', displayDifference: 'percentage_points' });
  assert.equal(parsed.qualification.eligibleForReport, false);
  assert.equal(parsed.qualification.measurement, null);
  assert.equal('score' in parsed, false);
});

test('invalid numeric and type inputs cannot be silently stringified to null', () => {
  for (const bad of [NaN, Infinity, '48000', 0, -1, 48000.5]) {
    assert.throws(() => createCdjEvidenceRecord({ capture: { sampleRateHz: bad } }));
  }
  for (const bad of [NaN, Infinity, 0, -100, '1000']) {
    assert.throws(() => createCdjEvidenceRecord({ source: { referenceFrequencyHz: bad } }));
  }
  assert.throws(() => createCdjEvidenceRecord({ quality: { flags: { toneStable: 'true' } } }));
  assert.throws(() => createCdjEvidenceRecord({ pitch: { supportedRangePercent: { min: 10, max: -10 } } }));
  assert.throws(() => createCdjEvidenceRecord({ source: { referenceHashSha256: 'wrong' } }));
});

test('schema, malformed timestamps, oversized arrays/strings and hostile JSON are rejected', () => {
  assert.throws(() => deserializeCdjEvidenceRecord('{'));
  assert.throws(() => deserializeCdjEvidenceRecord(JSON.stringify({ schemaVersion: 'unknown' })));
  assert.throws(() => deserializeCdjEvidenceRecord('x'.repeat(131073)));
  assert.throws(() => createCdjEvidenceRecord({ observedAt: '2026-02-30T00:00:00Z' }));
  assert.throws(() => createCdjEvidenceRecord({ runId: 'x'.repeat(129) }));
  assert.throws(() => createCdjEvidenceRecord({ capture: { rawEvidenceRefs: Array(33).fill('ref') } }));
  assert.throws(() => createCdjEvidenceRecord({ capture: { selectedPairs: [''] } }));
  const decoded = deserializeCdjEvidenceRecord(`{"schemaVersion":"${CDJ_EVIDENCE_SCHEMA}","__proto__":{"polluted":true},"qualification":{"eligibleForReport":true}}`);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(decoded.qualification.eligibleForReport, false);
});

test('inherited fields and exotic objects cannot spoof record provenance', () => {
  const inheritedFlags = Object.create({ toneStable: true });
  assert.throws(() => createCdjEvidenceRecord({ quality: { flags: inheritedFlags } }), TypeError);
  const inheritedCapture = Object.create({ sampleRateHz: 48000 });
  assert.throws(() => createCdjEvidenceRecord({ capture: inheritedCapture }), TypeError);
  assert.throws(() => createCdjEvidenceRecord({ asset: new Date() }), TypeError);
  const record = createCdjEvidenceRecord({ quality: { flags: {} }, capture: {} });
  assert.equal(record.quality.flags.toneStable, null);
  assert.equal(record.capture.sampleRateHz, null);
  assert.equal(record.qualification.eligibleForReport, false);
  const plain = Object.create(null);
  plain.model = 'Model X';
  assert.equal(createCdjEvidenceRecord({ asset: plain }).asset.model, 'Model X');
});

test('capture sample-rate must be a safe integer before JSON transport', () => {
  for (const bad of [Number.MAX_SAFE_INTEGER + 1, 1e30]) {
    assert.equal(Number.isInteger(bad), true);
    assert.throws(() => createCdjEvidenceRecord({ capture: { sampleRateHz: bad } }), RangeError);
  }
  const record = createCdjEvidenceRecord({ capture: { sampleRateHz: 48000 } });
  assert.equal(deserializeCdjEvidenceRecord(serializeCdjEvidenceRecord(record)).capture.sampleRateHz, 48000);
});
