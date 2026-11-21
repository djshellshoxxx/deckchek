import test from 'node:test';
import assert from 'node:assert/strict';
import { trendMetrics } from '../app/diagnostics.js';

test('trend regression does not describe a repeated-time baseline as a perfect fit', () => {
  for (const points of [
    [{ timeMin: 5, value: 3 }, { timeMin: 5, value: 3 }],
    [{ timeMin: 2, value: 1 }, { timeMin: 2, value: 2 }, { timeMin: 2, value: 3 }],
  ]) {
    const result = trendMetrics(points);
    assert.equal(result.count, points.length);
    for (const field of ['slopePerMin', 'intercept', 'rSquared']) {
      assert.ok(Number.isNaN(result[field]), `${field} must be unknown without a time span`);
    }
  }
});

for (const timeMin of [1000.1, 123456.7]) {
  test(`identical fractional time ${timeMin} has no identifiable fit`, () => {
    for (const values of [[1, 1, 1], [1, 2, 3]]) {
      const points = values.map(value => ({ timeMin, value }));
      const result = trendMetrics(points);
      assert.equal(result.count, points.length);
      for (const field of ['slopePerMin', 'intercept', 'rSquared']) {
        assert.ok(Number.isNaN(result[field]), `${field} must be unknown without a time span`);
      }
    }
  });
}

test('valid time span retains constant and linear trend behavior', () => {
  const flat = trendMetrics([
    { timeMin: 0, value: 4 }, { timeMin: 1, value: 4 }, { timeMin: 2, value: 4 },
  ]);
  assert.deepEqual(flat, { count: 3, slopePerMin: 0, intercept: 4, rSquared: 1 });

  const linear = trendMetrics([
    { timeMin: 0, value: 1 }, { timeMin: 2, value: 5 }, { timeMin: 4, value: 9 },
  ]);
  assert.deepEqual(linear, { count: 3, slopePerMin: 2, intercept: 1, rSquared: 1 });

  const filtered = trendMetrics([{ timeMin: 0, value: 1 }, { timeMin: NaN, value: 2 }]);
  assert.equal(filtered.count, 1);
  assert.ok(Number.isNaN(filtered.rSquared));
});
