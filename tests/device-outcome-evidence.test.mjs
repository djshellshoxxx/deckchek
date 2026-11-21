import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOutcome } from '../app/devices/dispatch.js';

test('an outcome without a criterion, verdict or usable observation remains unknown', () => {
  for (const result of [
    {},
    { findings: [{ severity: 'info', title: 'No driver information' }] },
    { findings: [{ severity: 'informational' }], measurements: [{ metricId: 'driver_present', value: null }] },
    ...[undefined, NaN, Infinity, -Infinity, '0'].map(value => ({ measurements: [{ metricId: 'reading', value }] })),
    { measurements: [{ value: 0 }] }, { measurements: [{ metricId: ' ', value: 0 }] },
  ]) {
    const outcome = evaluateOutcome({}, result);
    assert.equal(outcome.status, 'unknown');
    assert.equal(outcome.criterion, 'evidence');
    assert.match(outcome.detail, /no .*observation|no .*measurement/i);
  }
});

test('finite observations, including zero and negative values, retain their finding-based result', () => {
  for (const value of [0, -1, 0.25, 3]) {
    const outcome = evaluateOutcome({}, { measurements: [{ metricId: 'reading', value }], findings: [{ severity: 'info' }] });
    assert.equal(outcome.status, 'pass');
    assert.equal(outcome.criterion, 'findings');
  }
});

test('an explicit OK finding remains affirmative evidence without numeric readings', () => {
  const outcome = evaluateOutcome({}, { measurements: [{ metricId: 'driver_present', value: null }], findings: [{ severity: 'ok', title: 'No driver needed' }] });
  assert.equal(outcome.status, 'pass');
  assert.equal(outcome.criterion, 'findings');
});

test('the latest observation of a metric controls whether that metric supplies evidence', () => {
  for (const latest of [null, undefined, NaN, Infinity, '0']) {
    assert.equal(evaluateOutcome({}, { measurements: [{ metricId: 'reading', value: 0 }, { metricId: 'reading', value: latest }] }).status, 'unknown');
  }
  assert.equal(evaluateOutcome({}, { measurements: [{ metricId: 'reading', value: null }, { metricId: 'reading', value: 0 }] }).status, 'pass');
  assert.equal(evaluateOutcome({}, { measurements: [{ metricId: 'available', value: 0 }, { metricId: 'unavailable', value: null }] }).status, 'pass');
});

test('errors and review findings retain precedence over positive evidence', () => {
  const measurements = [{ metricId: 'reading', value: 1 }];
  for (const severity of ['error', 'critical', 'fail']) assert.equal(evaluateOutcome({}, { measurements, findings: [{ severity: 'ok' }, { severity }] }).status, 'fail');
  for (const severity of ['warning', 'warn', 'review']) assert.equal(evaluateOutcome({}, { measurements, findings: [{ severity: 'ok' }, { severity }] }).status, 'unknown');
});

test('explicit engine verdicts still own no-criterion results', () => {
  for (const [verdictStatus, expected] of [['pass', 'pass'], ['fail', 'fail'], ['warn', 'unknown']]) {
    const outcome = evaluateOutcome({}, { verdictStatus, findings: [{ severity: 'error' }] });
    assert.equal(outcome.status, expected);
    assert.equal(outcome.criterion, 'verdict');
  }
});

test('a profile criterion still owns the result and its latest-observation rule', () => {
  const spec = { pass: { metricId: 'reading', op: 'equals', value: 0 } };
  const outcome = evaluateOutcome(spec, { verdictStatus: 'pass', measurements: [{ metricId: 'reading', value: 0 }, { metricId: 'reading', value: null }], findings: [{ severity: 'ok' }] });
  assert.equal(outcome.status, 'unknown');
  assert.equal(outcome.criterion, 'profile');
  assert.equal(evaluateOutcome(spec, { measurements: [{ metricId: 'reading', value: 0 }], verdictStatus: 'fail' }).status, 'pass');
  assert.equal(evaluateOutcome(spec, { measurements: [{ metricId: 'reading', value: 1 }], verdictStatus: 'pass' }).status, 'fail');
});
