// FS-21 code-review regressions: spec compatibility (same quantity only), numeric-string spec values, the median-only
// band below the percentile minimum, the method registry on the Population path, the capped import preview and the
// truncated-population notice.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareMetricToSpec, compareToSpec, populationComparison, stripPlot, N_MIN_PERCENTILE } from '../app/population.js';

globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const { comparePopulation, capPreview, truncationNotice } = await import('../app/ui/screens/compare.js');

const table = JSON.parse(fs.readFileSync(new URL('../app/population-metrics.json', import.meta.url), 'utf8'));
const profile = name => JSON.parse(fs.readFileSync(new URL(`../app/devices/profiles/${name}.json`, import.meta.url), 'utf8'));
const specOf = (p, key) => p.specs.find(s => s.key === key);
const measurement = { metric: 'wow_flutter_rms_percent', method: { key: 'wow', version: 1 }, value: 0.12, unit: '%' };
const rowsOf = (values, extra = {}) => values.map((value, i) => ({ contributor: `c${String(i).padStart(3, '0')}`, metric: measurement.metric, method: measurement.method, unit: '%', value, ...extra }));

test('regression: AC-1 an unweighted wow/flutter proxy is never judged against a weighted (WRMS) spec', () => {
  const plx = profile('pioneer-plx-crss12');
  const def = table.metrics.wow_flutter_rms_percent;
  const r = compareMetricToSpec({ value: 0.12, unit: '%' }, specOf(plx, 'wow_flutter'), def);
  assert.equal(r.status, 'different-quantity');
  assert.match(r.reason, /weighted/i);
  assert.match(r.reason, /0\.15 % WRMS/, 'the published figure is still shown for reference');
  assert.ok(!('within' in r), 'no INSIDE/OUTSIDE verdict');
});

test('regression: AC-1 time to 90% of the envelope is never judged against a time-to-full-speed spec', () => {
  for (const name of ['pioneer-plx-crss12', 'technics-sl-1200mk4']) {
    const r = compareMetricToSpec({ value: 0.2, unit: 's' }, specOf(profile(name), 'start_time'), table.metrics.startup_envelope_90_sec);
    assert.equal(r.status, 'different-quantity', name);
    assert.match(r.reason, /rated speed/);
  }
});

test('regression: AC-1 a THD estimate is not judged against a THD+N spec, but is against a THD spec in the same unit', () => {
  const def = table.metrics.left_thd_percent;
  assert.equal(compareMetricToSpec({ value: 0.02, unit: '%' }, { key: 'thd_n', value: 0.01, unit: '%' }, def).status, 'different-quantity');
  const thd = compareMetricToSpec({ value: 0.02, unit: '%' }, { key: 'thd', value: 0.05, unit: '%' }, def);
  assert.deepEqual([thd.status, thd.within], ['ok', true]);
  assert.equal(compareMetricToSpec({ value: 0.02, unit: '%' }, { key: 'thd', value: 0.05, unit: '% (1 kHz, A-weighted)' }, def).status, 'different-quantity', 'a qualified unit is not silently stripped');
  const sep = compareMetricToSpec({ value: 31.5, unit: 'dB' }, { key: 'separation', value: 30, unit: 'dB' }, table.metrics.channel_separation_db);
  assert.deepEqual([sep.status, sep.within, sep.margin], ['ok', true, 1.5]);
  assert.equal(compareMetricToSpec({ value: 1, unit: '%' }, null, def).status, 'no-spec');
  assert.equal(compareMetricToSpec({ value: 1, unit: 'dBFS' }, null, table.metrics.left_hum_dbfs).status, 'no-spec');
});

test('regression: every metric declares which of its spec keys measure the same quantity', () => {
  for (const [metric, def] of Object.entries(table.metrics)) {
    assert.ok(def.specComparable && typeof def.specComparable === 'object' && !Array.isArray(def.specComparable), metric);
    for (const [key, units] of Object.entries(def.specComparable)) {
      assert.ok(def.specKeys.includes(key), `${metric}: ${key} must be one of its specKeys`);
      assert.ok(Array.isArray(units) && units.length && units.every(u => typeof u === 'string' && u.trim()), `${metric}: ${key} units`);
    }
    if (def.specKeys.some(k => !Object.hasOwn(def.specComparable, k))) assert.ok(typeof def.specNote === 'string' && def.specNote.length > 20, `${metric} explains why a spec is not comparable`);
  }
});

test('regression: AC-1 a spec value stored as a plain-number string is compared; ranges stay not-numeric', () => {
  const r = compareToSpec({ value: 0.02, unit: '%' }, { value: '0.025', unit: '%' }, { limit: 'max' });
  assert.equal(r.status, 'ok');
  assert.equal(r.specValue, 0.025);
  assert.ok(Math.abs(r.margin - 0.005) < 1e-12);
  assert.equal(compareToSpec({ value: 1, unit: 's' }, { value: ' 0.7 ', unit: 's' }, { limit: 'max' }).specValue, 0.7);
  assert.equal(compareToSpec({ value: 1, unit: 'dB' }, { value: '-85', unit: 'dB' }, { limit: 'max' }).specValue, -85);
  for (const bad of ['0.008 - 0.012', '±8', '', '1e999', 'NaN', '0x10', '1,5', '12 %']) {
    assert.equal(compareToSpec({ value: 1, unit: '%' }, { value: bad, unit: '%' }, { limit: 'max' }).status, 'not-numeric', JSON.stringify(bad));
  }
});

test('regression: AC-6 between 8 and 19 contributors the strip plot draws a median only, no P10/P90 band', () => {
  for (const n of [8, 19]) {
    const c = populationComparison(rowsOf(Array.from({ length: n }, (_, i) => 0.05 + i * 0.01)), measurement, { higherIsBetter: false });
    const g = stripPlot(c, 0.12);
    assert.equal(g.band, null, `no percentile band at n=${n}`);
    assert.ok(Number.isFinite(g.median), `a median line at n=${n}`);
  }
  const c20 = populationComparison(rowsOf(Array.from({ length: N_MIN_PERCENTILE }, (_, i) => 0.05 + i * 0.01)), measurement, { higherIsBetter: false });
  const g20 = stripPlot(c20, 0.12);
  assert.ok(g20.band && g20.band.p50 === g20.median);
  const c7 = populationComparison(rowsOf(Array.from({ length: 7 }, (_, i) => i)), measurement, { higherIsBetter: false });
  assert.deepEqual([stripPlot(c7, 1).band, stripPlot(c7, 1).median], [null, null], 'below 8 only dots');
});

test('regression: AC-7 the Population path applies the method registry returned with the population query', () => {
  const v2 = { ...measurement, method: { key: 'wow', version: 2 } };
  const rows = rowsOf(Array.from({ length: 20 }, (_, i) => 0.05 + i * 0.01));
  const mk = (version, compat) => ({ key: 'wow', version, parametersJson: JSON.stringify({ unit: '%', compat }) });
  const def = table.metrics.wow_flutter_rms_percent;
  assert.equal(comparePopulation({ rows, methods: [mk(1, [2]), mk(2, [1])] }, v2, def, 's').contributors, 20, 'mutual compat lets v1 rows in');
  assert.equal(comparePopulation({ rows, methods: [mk(1, []), mk(2, [1])] }, v2, def, 's').contributors, 0, 'one-sided compat is not enough');
  assert.equal(comparePopulation({ rows }, v2, def, 's').contributors, 0, 'no registry: other versions stay excluded');
  assert.equal(comparePopulation({ rows, methods: 'junk' }, v2, def, 's').contributors, 0, 'a malformed registry is ignored');
  assert.equal(comparePopulation({ rows }, measurement, def, 's').status, 'percentile');
});

test('regression: AC-5 the import preview renders at most 50 model/metric rows and says how many more there are', () => {
  const counts = Array.from({ length: 50000 }, (_, i) => ({ product: `p${i}`, metric: 'dropout_count', rows: 1 }));
  const capped = capPreview(counts);
  assert.equal(capped.shown.length, 50);
  assert.equal(capped.more, 49950);
  assert.deepEqual(capPreview(counts.slice(0, 3)), { shown: counts.slice(0, 3), more: 0 });
  assert.deepEqual(capPreview(null), { shown: [], more: 0 });
});

test('regression: a truncated population query gets a visible notice', () => {
  assert.match(truncationNotice({ rows: [], truncated: true }), /Only the first 100,000 reference rows were read/);
  assert.equal(truncationNotice({ rows: [], truncated: false }), null);
  assert.equal(truncationNotice(null), null);
});

test('regression: AC-7 a population_query result as Rust serialises it: two mutually compatible versions compared, an incompatible one excluded', () => {
  // Shape of pack.rs PopulationQuery: rows[].method {key, version}; methods[] {key, version, parametersJson} for every
  // local version of the method key.
  const key = 'wow_flutter_rms_percent';
  const row = (i, version) => ({ contributor: `t${String(i).padStart(3, '0')}`, product: 'plx', metric: key, method: { key, version }, value: 0.05 + i * 0.005, unit: '%' });
  const rows = [...Array.from({ length: 12 }, (_, i) => row(i, 1)), ...Array.from({ length: 10 }, (_, i) => row(100 + i, 2)), ...Array.from({ length: 7 }, (_, i) => row(200 + i, 3))];
  const methods = [{ key, version: 1, parametersJson: '{"compat":[2]}' }, { key, version: 2, parametersJson: '{"compat":[1]}' }, { key, version: 3, parametersJson: '{"compat":[]}' }];
  const result = { rows, contributors: 29, truncated: false, methods };
  const mine = { metric: key, method: { key, version: 2 }, value: 0.1, unit: '%' };
  const c = comparePopulation(result, mine, table.metrics[key], 's');
  assert.equal(c.contributors, 22, 'v1 and v2 rows are compared');
  assert.equal(c.excluded, 7, 'v3 lists no compat, so its rows are left out');
  assert.equal(c.status, 'percentile');
  const v3 = comparePopulation(result, { ...mine, method: { key, version: 3 } }, table.metrics[key], 's');
  assert.deepEqual([v3.contributors, v3.excluded], [7, 22], 'from v3 only v3 rows count');
});
