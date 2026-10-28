// FS-21 phase 1 and the statistical properties: spec margin, sibling ranking, history delta, strip-plot geometry,
// deterministic ordering, monotonic percentiles, small-population guards and method compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  robustSummary, percentileRank, populationComparison, compareToSpec, compareToSiblings, latestPerAsset, historyDelta, describeComparison,
  stripPlot, ordinal, N_MIN_PERCENTILE, N_MIN_MEDIAN,
} from '../app/population.js';

// deterministic PRNG (mulberry32) so property tests are reproducible
const prng = seed => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = (list, rnd) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const measurement = { metric: 'wow_flutter_rms_percent', method: { key: 'wow', version: 1 }, value: 0.12, unit: '%' };
const rowsOf = (values, extra = {}) => values.map((value, i) => ({ contributor: `c${String(i).padStart(3, '0')}`, metric: measurement.metric, method: measurement.method, unit: '%', value, ...extra }));

test('AC-1 spec comparison gives value, limit and margin without any population', () => {
  const max = compareToSpec({ value: 0.12, unit: '%' }, { value: 0.15, unit: '% WRMS', confidence: 'confirmed', source: 'https://example.test/s' }, { limit: 'max' });
  assert.equal(max.status, 'ok');
  assert.ok(Math.abs(max.margin - 0.03) < 1e-12);
  assert.equal(max.within, true);
  assert.equal(max.confidence, 'confirmed');
  const over = compareToSpec({ value: 0.2, unit: '%' }, { value: 0.15, unit: '%' }, { limit: 'max' });
  assert.equal(over.within, false);
  assert.ok(over.margin < 0);
  const min = compareToSpec({ value: 31.5, unit: 'dB' }, { value: 30, unit: 'dB' }, { limit: 'min' });
  assert.deepEqual([min.within, min.margin], [true, 1.5]);
  assert.equal(compareToSpec({ value: 20, unit: 'dB' }, { value: 30, unit: 'dB' }, { limit: 'min' }).within, false);
  assert.equal(compareToSpec({ value: 0.15, unit: '%' }, { value: 0.15, unit: '%' }, { limit: 'max' }).within, true, 'exactly on the limit is inside');
});

test('AC-1 spec comparison refuses what it cannot compare honestly', () => {
  const m = { value: -62, unit: 'dBFS' };
  assert.equal(compareToSpec(m, null, { limit: 'max' }).status, 'no-spec');
  assert.equal(compareToSpec(m, { value: -85, unit: 'dBu' }, { limit: 'max' }).status, 'unit-mismatch', 'dBu is not dBFS and nothing converts');
  assert.equal(compareToSpec(m, { value: -85, unit: '' }, { limit: 'max' }).status, 'unit-mismatch');
  assert.equal(compareToSpec(m, { value: '10 Hz - 50 kHz', unit: 'Hz' }, { limit: 'max' }).status, 'not-numeric');
  assert.equal(compareToSpec(m, { value: -85, unit: 'dBFS' }, {}).status, 'no-limit');
  assert.equal(compareToSpec({ value: NaN, unit: 'dBFS' }, { value: 1, unit: 'dBFS' }, { limit: 'max' }).status, 'no-measurement');
  assert.equal(compareToSpec(null, null).status, 'no-measurement');
});

test('AC-2 sibling units are ranked deterministically with shared ranks for ties', () => {
  const units = [{ assetId: 'b', nickname: 'B', value: 0.2 }, { assetId: 'a', nickname: 'A', value: 0.12 }, { assetId: 'c', nickname: 'C', value: 0.2 }, { assetId: 'd', nickname: 'D', value: 0.3 }];
  const lower = compareToSiblings(units, 'a', { higherIsBetter: false });
  assert.deepEqual([lower.status, lower.rank, lower.of], ['ranked', 1, 4]);
  assert.deepEqual(lower.rows.map(r => r.assetId), ['a', 'b', 'c', 'd']);
  assert.equal(compareToSiblings(units, 'b', { higherIsBetter: false }).rank, 2);
  assert.equal(compareToSiblings(units, 'c', { higherIsBetter: false }).rank, 2, 'ties share the better rank');
  assert.equal(compareToSiblings(units, 'd', { higherIsBetter: false }).rank, 4);
  assert.equal(compareToSiblings(units, 'd', { higherIsBetter: true }).rank, 1, 'direction inverts the ranking');
  const unranked = compareToSiblings(units, 'a', {});
  assert.deepEqual([unranked.status, unranked.rank], ['unranked', null]);
  assert.equal(compareToSiblings([units[0]], 'b', { higherIsBetter: false }).status, 'single');
  assert.equal(compareToSiblings(units, 'missing', { higherIsBetter: false }).status, 'none');
  assert.equal(compareToSiblings(units, 'a', { higherIsBetter: false }).rows.filter(r => r.self).length, 1);
  const rnd = prng(7);
  for (let i = 0; i < 25; i++) assert.deepEqual(compareToSiblings(shuffle(units, rnd), 'c', { higherIsBetter: false }), compareToSiblings(units, 'c', { higherIsBetter: false }), 'input order does not matter');
});

test('AC-2 only each unit\'s latest value counts', () => {
  const rows = [
    { assetId: 'a', value: 1, at: '2026-10-01' }, { assetId: 'a', value: 2, at: '2026-10-09' }, { assetId: 'b', value: 5, at: '2026-10-05' },
    { assetId: 'a', value: 3, at: '2026-10-03' }, { assetId: 'x', value: NaN, at: '2026-10-05' }, null,
  ];
  assert.deepEqual(latestPerAsset(rows).map(r => [r.assetId, r.value]), [['a', 2], ['b', 5]]);
});

test('AC-3 history delta compares the latest run with the median of the earlier ones', () => {
  const h = [{ value: 0.2 }, { value: 0.16 }, { value: 0.12 }];
  const better = historyDelta(h, { higherIsBetter: false });
  assert.equal(better.status, 'ok');
  assert.equal(better.n, 3);
  assert.ok(Math.abs(better.median - 0.18) < 1e-12 && Math.abs(better.delta + 0.06) < 1e-12);
  assert.equal(better.verdict, 'better');
  assert.equal(historyDelta(h, { higherIsBetter: true }).verdict, 'worse');
  assert.equal(historyDelta(h, {}).verdict, 'changed');
  assert.equal(historyDelta([{ value: 1 }, { value: 1 }], { higherIsBetter: true }).verdict, 'same');
  assert.deepEqual(historyDelta([{ value: 1 }], {}), { status: 'insufficient', n: 1 });
  assert.deepEqual(historyDelta([], {}), { status: 'insufficient', n: 0 });
});

test('AC-6 small populations: no percentile below 20 contributors, no band below 8, boundaries exact', () => {
  const compare = n => populationComparison(rowsOf(Array.from({ length: n }, (_, i) => 0.05 + i * 0.01)), measurement, { higherIsBetter: false });
  for (const [n, status, band, message] of [[0, 'insufficient', false, 'Not enough data (0 of 20)'], [7, 'insufficient', false, 'Not enough data (7 of 20)'],
    [8, 'insufficient', true, 'Not enough data (8 of 20)'], [19, 'insufficient', true, 'Not enough data (19 of 20)'], [20, 'percentile', true, null]]) {
    const c = compare(n);
    assert.equal(c.status, status, `n=${n}`);
    assert.equal(c.summary !== null, band, `band at n=${n}`);
    assert.equal(c.message, message);
    assert.equal(c.rank === null, status !== 'percentile', `rank at n=${n}`);
  }
  assert.equal(N_MIN_PERCENTILE, 20);
  assert.equal(N_MIN_MEDIAN, 8);
  assert.throws(() => populationComparison(rowsOf([1]), measurement, { higherIsBetter: false, minimum: 5 }), RangeError, 'the floor cannot be lowered');
});

test('AC-7 rows from another method version are not compared unless both versions list each other', () => {
  const v2 = { ...measurement, method: { key: 'wow', version: 2 } };
  const rows = [...rowsOf(Array.from({ length: 20 }, (_, i) => 0.05 + i * 0.01)), ...rowsOf([0.3], { method: { key: 'wow', version: 1 }, contributor: 'old' })];
  const plain = populationComparison(rows, v2, { higherIsBetter: false });
  assert.equal(plain.contributors, 0);
  assert.equal(plain.excluded, 21, 'counted, never silently merged');
  const mk = (version, compat) => ({ key: 'wow', version, parameters_json: JSON.stringify({ unit: '%', compat }) });
  assert.equal(populationComparison(rows, v2, { higherIsBetter: false, registry: [mk(1, [2]), mk(2, [1])] }).contributors, 21);
  assert.equal(populationComparison(rows, v2, { higherIsBetter: false, registry: [mk(1, []), mk(2, [1])] }).contributors, 0, 'one-sided compat is not enough');
  const unitMismatch = populationComparison(rowsOf([0.1], { unit: 'dB' }), measurement, { higherIsBetter: false });
  assert.deepEqual([unitMismatch.contributors, unitMismatch.excluded], [0, 1], 'units are never converted');
});

test('property: summary quantiles are monotonic and bounded for any sample', () => {
  const rnd = prng(42);
  for (let t = 0; t < 300; t++) {
    const values = Array.from({ length: 1 + Math.floor(rnd() * 60) }, () => Math.round((rnd() * 200 - 100) * 100) / 100);
    const s = robustSummary(values);
    assert.ok(s.p10 <= s.p25 && s.p25 <= s.median && s.median <= s.p75 && s.p75 <= s.p90, JSON.stringify(s));
    assert.ok(s.p10 >= Math.min(...values) && s.p90 <= Math.max(...values));
    assert.ok(s.iqr >= 0 && s.mad >= 0 && s.n === values.length);
    assert.deepEqual(robustSummary(shuffle(values, rnd)), s, 'order of the sample does not matter');
  }
});

test('property: percentile rank is monotonic in the value and mirrored by direction', () => {
  const rnd = prng(99);
  for (let t = 0; t < 60; t++) {
    const values = Array.from({ length: 5 + Math.floor(rnd() * 40) }, () => Math.round(rnd() * 100));
    const grid = Array.from({ length: 25 }, (_, i) => i * 4.5 - 5);
    const up = grid.map(x => percentileRank(values, x, { higherIsBetter: true, seed: 1 }).rank0to100);
    const down = grid.map(x => percentileRank(values, x, { higherIsBetter: false, seed: 1 }).rank0to100);
    for (let i = 1; i < grid.length; i++) { assert.ok(up[i] >= up[i - 1], 'non-decreasing when higher is better'); assert.ok(down[i] <= down[i - 1], 'non-increasing when lower is better'); }
    up.forEach((r, i) => assert.ok(Math.abs(r + down[i] - 100) < 1e-9, 'ranks of the two directions mirror each other'));
    assert.ok(up.every(r => r >= 0 && r <= 100) && down.every(r => r >= 0 && r <= 100));
    const r = percentileRank(values, values[0], { higherIsBetter: true, seed: 3 });
    assert.ok(r.lo <= r.hi && r.lo >= 0 && r.hi <= 100, 'the bootstrap interval is ordered and inside 0..100');
  }
});

test('property: the same input twice, or in any order, gives an identical comparison', () => {
  const rnd = prng(5);
  const base = Array.from({ length: 45 }, (_, i) => ({ ...rowsOf([0])[0], contributor: `person-${i % 30}`, value: Math.round((0.05 + rnd() * 0.3) * 1000) / 1000 }));
  const first = populationComparison(base, measurement, { higherIsBetter: false });
  assert.deepEqual(populationComparison(base, measurement, { higherIsBetter: false }), first);
  for (let i = 0; i < 20; i++) assert.deepEqual(populationComparison(shuffle(base, rnd), measurement, { higherIsBetter: false }), first, 'row order must not change any output');
  assert.equal(first.contributors, 30);
  assert.equal(first.units, 45);
  const before = JSON.stringify(base);
  populationComparison(base, measurement, { higherIsBetter: false });
  assert.equal(JSON.stringify(base), before, 'the input rows are never modified');
});

test('a poisoned contributor counts once however many rows it sends', () => {
  const honest = rowsOf(Array.from({ length: 20 }, (_, i) => 0.1 + i * 0.01));
  const poison = Array.from({ length: 5000 }, () => ({ ...honest[0], contributor: 'attacker', value: 9 }));
  const c = populationComparison([...honest, ...poison], { ...measurement, value: 0.15 }, { higherIsBetter: false });
  assert.equal(c.contributors, 21);
  assert.equal(c.units, 5020);
  assert.ok(c.dots.find(d => d.value === 9).outlier, 'the extreme voice is plotted hollow and kept out of the band');
  assert.ok(c.summary.p90 < 1);
});

test('describeComparison writes the text equivalent from the spec', () => {
  const values = Array.from({ length: 41 }, (_, i) => -80 + i);
  const m = { metric: 'x', method: { key: 'k', version: 1 }, value: -52.1, unit: 'dB' };
  const c = populationComparison(rowsOf(values, { metric: 'x', method: m.method, unit: 'dB' }), m, { higherIsBetter: true });
  const text = describeComparison(c, m);
  assert.match(text, /^Your value -52\.1 dB is at the \d+(st|nd|rd|th) percentile of 41 contributors \(41 units\), about \d+(st|nd|rd|th) to \d+(st|nd|rd|th)\. Higher percentile is better\.$/);
  const small = populationComparison(rowsOf([1, 2, 3, 4, 5, 6, 7], { metric: 'x', method: m.method, unit: 'dB' }), m, { higherIsBetter: true });
  assert.equal(describeComparison(small, m), 'Not enough data (7 of 20). Your value is -52.1 dB.');
  const flat = populationComparison(rowsOf(values, { metric: 'x', method: m.method, unit: 'dB' }), m, {});
  assert.match(describeComparison(flat, m), /no ranking direction/);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 73, 100, 101, 111].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '73rd', '100th', '101st', '111th']);
});

test('strip plot geometry keeps every dot and the marker on the axis', () => {
  const c = populationComparison(rowsOf(Array.from({ length: 25 }, (_, i) => 0.05 + i * 0.01)), { ...measurement, value: 0.9 }, { higherIsBetter: false });
  const g = stripPlot(c, 0.9, { width: 500 });
  assert.equal(g.dots.length, 25);
  for (const x of [...g.dots.map(d => d.x), g.marker, g.band.p10, g.band.p50, g.band.p90]) assert.ok(x >= 0 && x <= 500, `x=${x}`);
  assert.ok(g.band.p10 <= g.band.p50 && g.band.p50 <= g.band.p90);
  assert.ok(g.marker > Math.max(...g.dots.map(d => d.x)), 'a value beyond the population is still plotted');
  assert.equal(stripPlot({ dots: [] }, NaN), null);
  const single = stripPlot({ dots: [{ value: 1, outlier: false }], summary: null }, 1);
  assert.ok(Number.isFinite(single.marker) && single.band === null, 'a single value still has a finite axis');
  assert.deepEqual(stripPlot(c, 0.9, { width: 500 }), g, 'deterministic');
});
