import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHealth, reminderStatus, fleetToCsv, filterFleet, summarizeFleet } from '../app/fleet.js';

const now = '2026-10-22T12:00:00Z';
test('fleet health uses the latest result per test; no readings never means healthy', () => {
  assert.equal(computeHealth({ lastResults: [], now }), 'never');
  assert.equal(computeHealth({ lastResults: [], lastSessionAt: '2026-10-21', now }), 'review', 'a generic session supplies evidence but no device-level pass');
  const lastResults = [{ testId: 'a', status: 'fail', createdAt: '2026-10-20' }, { testId: 'a', status: 'pass', createdAt: '2026-10-21' }];
  assert.equal(computeHealth({ lastResults, now }), 'healthy');
  assert.equal(computeHealth({ lastResults: [...lastResults, { testId: 'b', status: 'fail', createdAt: '2026-10-21' }], now }), 'attention');
  for (const status of ['unknown', 'skipped']) assert.equal(computeHealth({ lastResults: [{ testId: 'a', status, createdAt: '2026-10-21' }], now }), 'review');
  assert.equal(computeHealth({ lastResults: [{ testId: 'a', status: 'pass', createdAt: '2026-01-01' }], now }), 'review');
  assert.equal(computeHealth({ lastResults: [{ testId: 'a', status: 'pass', createdAt: 'bad-date' }], now }), 'review');
});

test('days reminders use UTC calendar dates across DST and reset after completion', () => {
  const reminder = { basis: 'days', intervalValue: 90, warnBefore: 14, enabled: true, createdAt: '2026-07-24T23:00:00Z' };
  assert.deepEqual(reminderStatus(reminder, null, 0, now), { state: 'overdue', dueAt: '2026-10-22', dueInHours: null, snoozed: false });
  assert.equal(reminderStatus(reminder, null, 0, '2026-10-08').state, 'dueSoon');
  assert.equal(reminderStatus(reminder, null, 0, '2026-10-07').state, 'ok');
  assert.equal(reminderStatus(reminder, '2026-10-21', 0, now).dueAt, '2027-01-19');
  assert.equal(reminderStatus({ ...reminder, snoozedUntil: '2026-10-23T00:00:00Z' }, null, 0, now).snoozed, true);
  assert.equal(reminderStatus({ ...reminder, enabled: false }, null, 0, now).state, 'disabled');
  for (const intervalValue of [1e308, Infinity, 1.5]) assert.equal(reminderStatus({ ...reminder, intervalValue }, null, 0, now).state, 'unknown');
  assert.equal(reminderStatus({ ...reminder, createdAt: '9999-12-31' }, null, 0, now).state, 'unknown');
  assert.equal(reminderStatus({ ...reminder, warnBefore: 1e308 }, null, 0, now).state, 'unknown');
});

test('hours reminders use tracked hours since completion, with explicit unknown input', () => {
  const reminder = { basis: 'hours', intervalValue: 500, warnBefore: 14, enabled: true };
  assert.equal(reminderStatus(reminder, null, 485, now).state, 'ok');
  assert.equal(reminderStatus(reminder, null, 486, now).state, 'dueSoon');
  assert.equal(reminderStatus(reminder, null, 500, now).state, 'overdue');
  assert.equal(reminderStatus(reminder, null, 501, now).dueInHours, -1);
  assert.equal(reminderStatus(reminder, null, NaN, now).state, 'unknown');
  assert.equal(reminderStatus({ ...reminder, intervalValue: 0 }, null, 0, now).state, 'unknown');
});

test('fleet filtering, counts and CSV use the exact selected rows and neutralize formulas', () => {
  const rows = [
    { assetId: '1', nickname: '=HYPERLINK("bad")', productName: 'Model, one', venueId: 'v1', venue: 'Club', boothId: 'b1', booth: 'Booth', position: 'Left', category: 'turntable', health: 'attention', failing: [{ name: 'Signal' }], reminders: [{ state: 'overdue', snoozed: false }], hoursTotal: 12.5 },
    { assetId: '2', nickname: 'Mixer', category: 'mixer', health: 'never', reminders: [] },
  ];
  const selected = filterFleet(rows, { venueId: 'v1', category: 'turntable', search: 'model' });
  assert.deepEqual(selected, [rows[0]]);
  assert.deepEqual(summarizeFleet(rows), { attention: 1, overdue: 1, dueSoon: 0, never: 1 });
  const csv = fleetToCsv(selected);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"Model, one"'));
  assert.equal(csv.includes('Mixer'), false);
  assert.equal(csv.split('\r\n').length, 3);
});
