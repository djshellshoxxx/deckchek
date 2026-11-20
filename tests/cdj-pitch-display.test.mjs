import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCdjPitchDisplay } from '../app/player/pitch-display.js';

const verified = Object.freeze({
  referenceIdentityVerified: true,
  clippingExcluded: true,
  durationAdequate: true,
  toneStable: true,
  processingDisabled: true,
  capturePathVerified: true,
});
const baseline = Object.freeze({
  referenceFrequencyHz: 1000,
  measuredFrequencyHz: 1005,
  displayedPercent: 0.4,
  supportedRangePercent: { min: -10, max: 10 },
  quality: verified,
  expandedUncertaintyPercentagePoints: 0.05,
  uncertaintyMethod: 'synthetic-fixture-only',
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, String(a) + ' != ' + String(b));

test('CDJ-04 reports signed positive speed and percentage-point display error, without scoring', () => {
  const result = assessCdjPitchDisplay(baseline);
  assert.equal(result.eligibleForReport, true);
  close(result.measurement.measuredSpeedPercent, 0.5);
  close(result.measurement.displayErrorPercentagePoints, 0.1);
  assert.equal(result.measurement.method, 'reference_frequency_ratio_v1');
  assert.equal('score' in result.measurement, false);
});

test('CDJ-04 retains signed negative speed and display error', () => {
  const result = assessCdjPitchDisplay({ ...baseline, measuredFrequencyHz: 980, displayedPercent: -1.5 });
  assert.equal(result.eligibleForReport, true);
  close(result.measurement.measuredSpeedPercent, -2);
  close(result.measurement.displayErrorPercentagePoints, -0.5);
});

test('CDJ-04 zero offset is not silently converted into turntable RPM', () => {
  const result = assessCdjPitchDisplay({ ...baseline, measuredFrequencyHz: 1000, displayedPercent: 0 });
  close(result.measurement.measuredSpeedPercent, 0);
  close(result.measurement.displayErrorPercentagePoints, 0);
  assert.equal('rpm' in result.measurement, false);
});

test('CDJ-04 fails closed on each missing, false or unknown quality gate', () => {
  for (const flag of Object.keys(verified)) {
    for (const value of [undefined, false, null]) {
      const quality = { ...verified, [flag]: value };
      const result = assessCdjPitchDisplay({ ...baseline, quality });
      assert.equal(result.eligibleForReport, false, flag + '=' + String(value));
      assert.equal(result.measurement, null);
      assert.ok(result.exclusions.length);
    }
  }
});

test('CDJ-04 excludes invalid frequency and nonfinite inputs', () => {
  for (const change of [
    { measuredFrequencyHz: 0 }, { measuredFrequencyHz: NaN }, { measuredFrequencyHz: Infinity },
    { referenceFrequencyHz: -2 }, { referenceFrequencyHz: undefined },
    { displayedPercent: NaN }, { displayedPercent: Infinity },
    { measuredFrequencyHz: 1e308, referenceFrequencyHz: 1e-308 },
  ]) {
    const result = assessCdjPitchDisplay({ ...baseline, ...change });
    assert.equal(result.eligibleForReport, false);
    assert.equal(result.measurement, null);
  }
});

test('CDJ-04 requires explicitly verified model pitch range and in-range display', () => {
  for (const range of [undefined, { min: -10, max: NaN }, { min: 10, max: -10 }]) {
    const result = assessCdjPitchDisplay({ ...baseline, supportedRangePercent: range });
    assert.equal(result.eligibleForReport, false);
    assert.equal(result.measurement, null);
  }
  const outside = assessCdjPitchDisplay({ ...baseline, displayedPercent: 15 });
  assert.ok(outside.exclusions.includes('display_outside_supported_range'));
  assert.equal(outside.measurement, null);
});

test('CDJ-04 requires explicit nonzero uncertainty and provenance', () => {
  for (const change of [
    { expandedUncertaintyPercentagePoints: undefined },
    { expandedUncertaintyPercentagePoints: 0 },
    { expandedUncertaintyPercentagePoints: -1 },
    { uncertaintyMethod: '' }, { uncertaintyMethod: undefined },
  ]) {
    const result = assessCdjPitchDisplay({ ...baseline, ...change });
    assert.equal(result.eligibleForReport, false);
    assert.ok(result.exclusions.includes('measurement_uncertainty_unverified'));
    assert.equal(result.measurement, null);
  }
});

test('CDJ-04 is stateless and does not mutate the input record', () => {
  const input = structuredClone(baseline);
  const before = structuredClone(input);
  const one = assessCdjPitchDisplay(input);
  const two = assessCdjPitchDisplay(input);
  assert.deepEqual(one, two);
  assert.deepEqual(input, before);
});

test('CDJ-04 excludes a frequency ratio that underflows instead of reporting stopped playback', () => {
  const result = assessCdjPitchDisplay({
    ...baseline,
    measuredFrequencyHz: Number.MIN_VALUE,
    referenceFrequencyHz: Number.MAX_VALUE,
  });
  assert.equal(result.eligibleForReport, false);
  assert.ok(result.exclusions.includes('invalid_frequency_ratio'));
  assert.equal(result.measurement, null);
});

test('CDJ-04 excludes a display error that overflows from finite numeric inputs', () => {
  // Numerical boundary fixture only; this does not assert a physical model range.
  const result = assessCdjPitchDisplay({
    ...baseline,
    referenceFrequencyHz: 1,
    measuredFrequencyHz: 1e306,
    displayedPercent: -1e308,
    supportedRangePercent: { min: -1e308, max: 1e308 },
  });
  assert.equal(result.eligibleForReport, false);
  assert.ok(result.exclusions.includes('invalid_display_error'));
  assert.equal(result.measurement, null);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('CDJ-04 rejects unsupported numeric types before deriving metrics', () => {
  for (const change of [
    { measuredFrequencyHz: 1005n },
    { referenceFrequencyHz: 1000n },
    { displayedPercent: 0n },
  ]) {
    const result = assessCdjPitchDisplay({ ...baseline, ...change });
    assert.equal(result.eligibleForReport, false);
    assert.equal(result.measurement, null);
    assert.ok(result.exclusions.some(reason => reason === 'invalid_reference_or_measured_frequency'
      || reason === 'invalid_displayed_percent'));
  }
});
