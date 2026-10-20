import test from 'node:test';
import assert from 'node:assert/strict';
import { methodCompatible, combinedUncertainty, deltaVerdict } from '../app/metric-compat.js';

const row = (key, version, params) => ({ id: `method:${key}:${version}`, key, version, parameters_json: JSON.stringify(params) });
const registry = [
  row('wow_flutter', 1, { unit: '%', compat: [2] }),
  row('wow_flutter', 2, { unit: '%', compat: ['wow_flutter:1'] }),
  row('wow_flutter', 3, { unit: '%', compat: [1, 2] }),     // claims 1 and 2, but they do not list 3
  row('hum_level_db', 1, { unit: 'dB' }),
  row('hum_level_db', 2, { unit: 'dBFS' }),
  row('speed_rpm', 1, {}),
  row('speed_rpm', 2, 'not json'),
];

test('methodCompatible: equal key and version', () => {
  assert.equal(methodCompatible({ key: 'hum_level_db', version: 1 }, { key: 'hum_level_db', version: 1 }, registry), true);
  assert.equal(methodCompatible({ key: 'x', version: 1 }, { key: 'x', version: 1 }, null), true, 'same version needs no registry');
});
test('methodCompatible: different key is never compatible', () => {
  assert.equal(methodCompatible({ key: 'a', version: 1 }, { key: 'b', version: 1 }, registry), false);
  assert.equal(methodCompatible(null, { key: 'b', version: 1 }, registry), false);
});
test('methodCompatible: different versions need mutual listing', () => {
  assert.equal(methodCompatible({ key: 'wow_flutter', version: 1 }, { key: 'wow_flutter', version: 2 }, registry), true);
  assert.equal(methodCompatible({ key: 'wow_flutter', version: 2 }, { key: 'wow_flutter', version: 1 }, registry), true, 'symmetric');
  assert.equal(methodCompatible({ key: 'wow_flutter', version: 1 }, { key: 'wow_flutter', version: 3 }, registry), false, 'one-sided claim');
  assert.equal(methodCompatible({ key: 'wow_flutter', version: 1 }, { key: 'wow_flutter', version: 9 }, registry), false, 'unknown version');
  assert.equal(methodCompatible({ key: 'wow_flutter', version: 1 }, { key: 'wow_flutter', version: 2 }, []), false, 'empty registry');
});
test('methodCompatible: units must agree', () => {
  assert.equal(methodCompatible({ key: 'hum_level_db', version: 1 }, { key: 'hum_level_db', version: 2 }, registry), false);
  assert.equal(methodCompatible({ key: 'k', version: 1, unit: 'dB' }, { key: 'k', version: 1, unit: 'dBFS' }, null), false);
  assert.equal(methodCompatible({ key: 'k', version: 1, unit: 'dB' }, { key: 'k', version: 1 }, null), false, 'known vs unknown unit');
  assert.equal(methodCompatible({ key: 'speed_rpm', version: 1 }, { key: 'speed_rpm', version: 2 }, registry), false, 'unparsable parameters list nothing');
});
test('methodCompatible: registry as Map or object keyed by key:version', () => {
  const obj = { 'm:1': { parameters_json: { compat: [2] } }, 'method:m:2': { parameters_json: '{"compat":["m:1"]}' } };
  assert.equal(methodCompatible({ key: 'm', version: 1 }, { key: 'm', version: 2 }, obj), true);
  const map = new Map(Object.entries(obj));
  assert.equal(methodCompatible({ key: 'm', version: 2 }, { key: 'm', version: 1 }, map), true);
});

test('combinedUncertainty is the root sum of squares', () => {
  assert.equal(combinedUncertainty(3, 4), 5);
  assert.equal(combinedUncertainty(0, 0), 0);
  assert.equal(combinedUncertainty(0.1, 0), 0.1);
  for (const bad of [[-1, 1], [NaN, 1], [1, Infinity], ['1', 1], [undefined, 1]]) assert.ok(Number.isNaN(combinedUncertainty(...bad)));
});

test('deltaVerdict: k = 2 threshold and direction', () => {
  assert.deepEqual(deltaVerdict(0.19, 0.1, { higherIsBetter: true }), { verdict: 'unchanged', significant: false, direction: 'up', delta: 0.19, threshold: 0.2 });
  assert.equal(deltaVerdict(0.2, 0.1, { higherIsBetter: true }).verdict, 'unchanged', 'exactly k*u is not significant');
  assert.equal(deltaVerdict(0.21, 0.1, { higherIsBetter: true }).verdict, 'better');
  assert.equal(deltaVerdict(0.21, 0.1, { higherIsBetter: false }).verdict, 'worse');
  assert.equal(deltaVerdict(-0.21, 0.1, { higherIsBetter: false }).verdict, 'better');
  assert.equal(deltaVerdict(-0.21, 0.1, { higherIsBetter: true }).verdict, 'worse');
  assert.equal(deltaVerdict(-0.21, 0.1).verdict, 'changed', 'no preferred direction');
  assert.equal(deltaVerdict(0.5, 0.1, { k: 6 }).verdict, 'unchanged');
  assert.equal(deltaVerdict(0, 0).verdict, 'unchanged');
  assert.equal(deltaVerdict(0.001, 0, { higherIsBetter: true }).verdict, 'better', 'zero uncertainty');
  assert.equal(deltaVerdict(NaN, 0.1).verdict, 'unknown');
  assert.equal(deltaVerdict(1, -0.1).verdict, 'unknown');
});
