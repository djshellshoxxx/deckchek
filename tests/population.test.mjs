import test from 'node:test';
import assert from 'node:assert/strict';
import { robustSummary, winsorize, percentileRank, populationComparison } from '../app/population.js';

test('summary uses type-7 quantiles without changing the source', () => {
  const values = [10, 1, 4, 2, 3];
  assert.deepEqual(robustSummary(values), { n: 5, median: 3, mad: 1, p10: 1.4, p25: 2, p75: 4, p90: 7.6000000000000005, iqr: 2 });
  assert.deepEqual(values, [10, 1, 4, 2, 3]);
  assert.deepEqual(robustSummary([4]), { n: 1, median: 4, mad: 0, p10: 4, p25: 4, p75: 4, p90: 4, iqr: 0 });
  assert.equal(robustSummary([]).median, null);
});

test('numeric boundaries are rejected rather than silently contaminating evidence', () => {
  for (const values of [[1, NaN], [Infinity], ['1'], new Array(2), null]) {
    assert.throws(() => robustSummary(values));
  }
  assert.throws(() => percentileRank([1], NaN, { higherIsBetter: true }));
  assert.throws(() => winsorize([1], 0));
});

test('winsorization uses scaled MAD, falls back to IQR and preserves raw data', () => {
  const values = [1, 2, 3, 4, 100];
  const bounded = winsorize(values);
  assert.ok(bounded[4] < 10);
  assert.deepEqual(values, [1, 2, 3, 4, 100]);
  assert.ok(winsorize([0, 0, 0, 1, 100])[4] < 10);
  assert.deepEqual(winsorize([2, 2, 2]), [2, 2, 2]);
});

test('percentile rank uses mid-rank ties, direction and deterministic seeded intervals', () => {
  const values = [1, 2, 2, 4];
  const options = { higherIsBetter: true, seed: 42 };
  const rank = percentileRank(values, 2, options);
  assert.equal(rank.rank0to100, 50);
  assert.deepEqual(percentileRank(values, 2, options), rank);
  assert.equal(percentileRank(values, 3, options).rank0to100, 75);
  assert.equal(percentileRank(values, 3, { ...options, higherIsBetter: false }).rank0to100, 25);
  assert.deepEqual(percentileRank([], 1, options), { rank0to100: null, lo: null, hi: null });
  assert.deepEqual(percentileRank(values, 2, {}), { rank0to100: null, lo: null, hi: null });
});

test('population comparison weights contributors once and enforces method/unit matching', () => {
  const measurement = { metric: 'noise', method: { key: 'noise', version: 2 }, value: -60, unit: 'dBFS' };
  const rows = [
    ...Array.from({ length: 100 }, (_, i) => ({ ...measurement, contributor: 'shop', value: -50 - i / 100 })),
    ...Array.from({ length: 19 }, (_, i) => ({ ...measurement, contributor: `person-${i}`, value: -40 - i })),
    { ...measurement, contributor: 'bad-version', method: { key: 'noise', version: 1 } },
    { ...measurement, contributor: 'bad-unit', unit: 'dB' },
  ];
  const comparison = populationComparison(rows, measurement, { higherIsBetter: false });
  assert.equal(comparison.contributors, 20);
  assert.equal(comparison.units, 119);
  assert.equal(comparison.excluded, 2);
  assert.equal(comparison.status, 'percentile');
  assert.ok(comparison.rank.rank0to100 > 90);
  const small = populationComparison(rows.filter(r => r.contributor === 'shop'), measurement, { higherIsBetter: false });
  assert.equal(small.status, 'insufficient');
  assert.equal(small.rank, null);
  assert.equal(small.message, 'Not enough data (1 of 20)');
});

test('unsupported direction never invents a favorable percentile', () => {
  const measurement = { metric: 'noise', method: { key: 'noise', version: 1 }, value: 1, unit: 'dBFS' };
  const rows = Array.from({ length: 20 }, (_, i) => ({ ...measurement, contributor: `unit-${i}` }));
  const comparison = populationComparison(rows, measurement);
  assert.equal(comparison.status, 'unsupported');
  assert.equal(comparison.rank, null);
  assert.equal(comparison.summary.median, 1);
});
