import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHealth, reminderStatus, fleetToCsv, filterFleet, summarizeFleet, bannerSummary, describeReminder, nextDueReminder, reminderWhen, BANNER_CAP } from '../app/fleet.js';

const now = '2026-10-22T12:00:00Z';
test('fleet health uses the latest result per test; no readings never means healthy', () => {
  assert.equal(computeHealth({ lastResults: [], now }), 'never');
  assert.equal(computeHealth({ lastResults: [], lastSessionAt: '2026-10-21', now }), 'never', 'AC-2: a generic session is not a device test result');
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

test('AC-3 staleDays boundary: exactly staleDays old is current, one day more is stale; the setting is tunable', () => {
  const at = createdAt => [{ testId: 'a', status: 'pass', createdAt }];
  // now = 2026-10-22; 90 days earlier is 2026-07-24
  assert.equal(computeHealth({ lastResults: at('2026-07-25T23:59:59Z'), now }), 'healthy', '89 days');
  assert.equal(computeHealth({ lastResults: at('2026-07-24T00:00:00Z'), now }), 'healthy', '90 days exactly');
  assert.equal(computeHealth({ lastResults: at('2026-07-23T23:59:59Z'), now }), 'review', '91 days');
  assert.equal(computeHealth({ lastResults: at('2026-07-24'), now, staleDays: 89 }), 'review');
  assert.equal(computeHealth({ lastResults: at('2026-10-22'), now, staleDays: 0 }), 'healthy', 'tested today with staleDays 0');
  assert.equal(computeHealth({ lastResults: at('2026-10-21'), now, staleDays: 0 }), 'review');
  assert.equal(computeHealth({ lastResults: at('2026-10-21'), now, staleDays: -1 }), 'review', 'a negative setting never yields healthy');
  assert.equal(computeHealth({ lastResults: at('2026-10-23T08:00:00Z'), now }), 'review', 'a result dated in the future is suspicious, not healthy');
  assert.equal(computeHealth({ lastResults: [{ testId: 'a', status: 'fail', createdAt: '2020-01-01' }], now }), 'attention', 'a failure outranks staleness');
});

test('AC-4 days windows: due-soon starts warnBefore days ahead, overdue on the due date; tunable per reminder', () => {
  const reminder = { basis: 'days', intervalValue: 90, warnBefore: 14, enabled: true, createdAt: '2026-01-01T00:00:00Z' }; // due 2026-04-01
  const at = d => reminderStatus(reminder, null, 0, d).state;
  assert.equal(at('2026-03-17'), 'ok', '15 days before');
  assert.equal(at('2026-03-18'), 'dueSoon', '14 days before');
  assert.equal(at('2026-03-31'), 'dueSoon', '1 day before');
  assert.equal(at('2026-04-01'), 'overdue', '90 days have passed');
  assert.equal(at('2026-04-02'), 'overdue');
  assert.equal(reminderStatus({ ...reminder, warnBefore: 0 }, null, 0, '2026-03-31').state, 'ok', 'warnBefore 0 means no early window');
  assert.equal(reminderStatus({ ...reminder, warnBefore: 30 }, null, 0, '2026-03-02').state, 'dueSoon', 'tunable window');
  assert.equal(reminderStatus({ ...reminder, intervalValue: 1 }, '2026-10-21', 0, '2026-10-22').state, 'overdue', 'a one-day interval');
});

test('date math is calendar-date only: leap day, year end and DST changes do not shift the due date', () => {
  const r = days => ({ basis: 'days', intervalValue: days, warnBefore: 0, enabled: true });
  assert.equal(reminderStatus(r(1), '2028-02-28T23:59:59Z', 0, '2028-02-28').dueAt, '2028-02-29', '2028 is a leap year');
  assert.equal(reminderStatus(r(2), '2028-02-28', 0, '2028-02-28').dueAt, '2028-03-01');
  assert.equal(reminderStatus(r(1), '2027-02-28', 0, '2027-02-28').dueAt, '2027-03-01', '2027 is not');
  assert.equal(reminderStatus(r(366), '2027-01-01', 0, '2027-01-01').dueAt, '2028-01-02', 'a year plus a leap day');
  assert.equal(reminderStatus(r(1), '2026-12-31', 0, '2026-12-31').dueAt, '2027-01-01');
  // US spring-forward (2026-03-08), fall-back (2026-11-01) and EU (2026-03-29, 2026-10-25): 7 days is always 7 calendar days
  for (const [from, to] of [['2026-03-05', '2026-03-12'], ['2026-10-28', '2026-11-04'], ['2026-03-26', '2026-04-02'], ['2026-10-22', '2026-10-29']]) {
    assert.equal(reminderStatus(r(7), from, 0, from).dueAt, to, from);
    assert.equal(reminderStatus(r(7), `${from}T23:30:00Z`, 0, `${to}T00:30:00Z`).state, 'overdue');
    assert.equal(reminderStatus(r(7), `${from}T00:30:00Z`, 0, `${from}T23:30:00Z`).state, 'ok', 'same calendar day never counts as elapsed');
  }
  assert.equal(reminderStatus(r(1), null, 0, '2026-10-22').state, 'unknown', 'no last-done, install or creation date');
});

test('AC-5 hours windows are inclusive at the boundaries and report the remaining tracked hours', () => {
  const reminder = { basis: 'hours', intervalValue: 500, warnBefore: 20, enabled: true };
  const at = h => reminderStatus(reminder, null, h, now);
  assert.equal(at(479.99).state, 'ok');
  assert.equal(at(480).state, 'dueSoon');
  assert.equal(at(499.99).state, 'dueSoon');
  assert.equal(at(500).state, 'overdue');
  assert.equal(at(0).dueInHours, 500);
  assert.equal(at(520).dueInHours, -20);
  assert.equal(reminderStatus({ ...reminder, warnBefore: 0 }, null, 499, now).state, 'ok');
  assert.equal(reminderStatus(reminder, null, -1, now).state, 'unknown', 'negative hours are rejected, not clamped to healthy');
  assert.equal(reminderStatus({ ...reminder, enabled: 0 }, null, 900, now).state, 'disabled');
});

test('AC-6 banner model: counts, snoozed and disabled excluded, capped at five with "and N more", overdue first', () => {
  const mk = (n, state, extra = {}) => ({ id: `r${n}`, title: `Task ${n}`, state, snoozed: false, ...extra });
  const rows = [
    { nickname: 'Deck A', reminders: [mk(1, 'dueSoon'), mk(2, 'overdue'), mk(3, 'ok'), mk(4, 'overdue', { snoozed: true })] },
    { nickname: 'Deck B', reminders: [mk(5, 'dueSoon'), mk(6, 'overdue'), mk(7, 'dueSoon'), mk(8, 'disabled'), mk(9, 'dueSoon')] },
  ];
  const summary = bannerSummary(rows);
  assert.equal(summary.total, 6);
  assert.deepEqual([summary.overdue, summary.dueSoon], [2, 4]);
  assert.equal(summary.items.length, BANNER_CAP);
  assert.equal(summary.more, 1);
  assert.deepEqual(summary.items.slice(0, 2).map(i => i.state), ['overdue', 'overdue']);
  assert.equal(summary.text, '6 maintenance items need attention: 2 overdue, 4 due soon.');
  assert.equal(summary.ids.length, 6, 'dismiss snoozes every listed reminder, not only the five shown');
  assert.equal(bannerSummary([{ nickname: 'x', reminders: [mk(1, 'overdue')] }]).text, '1 maintenance item needs attention: 1 overdue, 0 due soon.');
  assert.equal(bannerSummary([]).total, 0);
  assert.equal(bannerSummary([]).text, '');
  assert.equal(bannerSummary(rows, { cap: 2 }).more, 4);
});

test('reminder wording and the next-due pick: overdue first, then due soon, then the earliest date', () => {
  const list = [{ title: 'B', state: 'ok', dueAt: '2027-01-01' }, { title: 'C', state: 'dueSoon', dueAt: '2026-11-01' }, { title: 'D', state: 'overdue', dueAt: '2026-10-01' }, { title: 'E', state: 'overdue', dueAt: '2026-09-01' }, { title: 'F', state: 'disabled' }];
  assert.equal(nextDueReminder(list).title, 'E');
  assert.equal(nextDueReminder([]), null);
  assert.equal(describeReminder({ title: 'Clean', state: 'overdue', dueAt: '2026-10-22' }), 'Clean: Overdue 2026-10-22');
  assert.equal(describeReminder({ title: 'Stylus', basis: 'hours', state: 'dueSoon', dueInHours: 12 }), 'Stylus: Due soon (12.0 tracked h remaining)');
  assert.equal(describeReminder({ title: 'Stylus', basis: 'hours', state: 'overdue', dueInHours: -3 }), 'Stylus: Overdue (3.0 tracked h over)');
  assert.equal(describeReminder({ title: 'X', state: 'ok', dueAt: '2027-01-01', snoozed: true }), 'X: OK 2027-01-01 (snoozed)');
});

test('AC-8 CSV: BOM, CRLF, RFC 4180 quoting, every formula starter neutralised, filter + tile combinations', () => {
  const header = 'asset_id,nickname,model,category,serial,venue,booth,position,last_tested,health,failing_items,next_due,tracked_hours_estimate';
  const base = { productName: 'a "quoted", model', serialNumber: 'S1', health: 'healthy', failing: [{ name: 'Signal; level' }], reminders: [{ title: 'Clean', state: 'overdue', dueAt: '2026-10-22' }], hoursTotal: 1.5, category: 'mixer' };
  const csvOf = nickname => fleetToCsv([{ ...base, assetId: 'x', nickname }]);
  assert.ok(csvOf('Deck').startsWith(`﻿${header}\r\n`));
  for (const starter of ['=1+1', '+1', '-1', '@SUM(A1)', '=HYPERLINK("x")']) {
    const line = csvOf(starter).split('\r\n')[1];
    const cell = line.split(',')[1];
    assert.ok(cell.replace(/^"/, '').startsWith("'"), `${starter} -> ${cell}`);
  }
  for (const starter of ['\tx', '\rx', '\nx', '  =cmd']) assert.ok(csvOf(starter).includes(`'${starter}`), JSON.stringify(starter));
  assert.ok(csvOf('Deck').includes('"a ""quoted"", model"'));
  assert.ok(csvOf('Deck').includes('Clean: Overdue 2026-10-22'));
  assert.equal(fleetToCsv([]), `﻿${header}\r\n`);
  const mixed = [
    { assetId: '1', nickname: 'A', health: 'attention', category: 'mixer', reminders: [{ state: 'overdue', snoozed: false }] },
    { assetId: '2', nickname: 'B', health: 'healthy', category: 'mixer', reminders: [{ state: 'overdue', snoozed: true }] },
    { assetId: '3', nickname: 'C', health: 'never', category: 'turntable', reminders: [] },
  ];
  assert.deepEqual(filterFleet(mixed, { reminder: 'overdue' }).map(r => r.assetId), ['1'], 'snoozed reminders do not match a tile filter');
  assert.deepEqual(filterFleet(mixed, { category: 'mixer', status: 'healthy' }).map(r => r.assetId), ['2']);
  assert.deepEqual(filterFleet(mixed, { category: 'turntable', status: 'attention' }), []);
  assert.deepEqual(summarizeFleet(mixed), { attention: 1, overdue: 1, dueSoon: 0, never: 1 });
});

test('regression: a future-dated completion is flagged for review instead of silently resetting the reminder', () => {
  const days = { basis: 'days', intervalValue: 90, warnBefore: 14, enabled: true, createdAt: '2026-01-01T00:00:00Z', title: 'Clean faders' };
  const flagged = reminderStatus(days, '2027-10-28T12:00:00.000Z', null, '2026-10-28T12:00:00Z');
  assert.equal(flagged.state, 'unknown', 'not OK: the date is a typo or the clock was set back');
  assert.equal(flagged.dueAt, null);
  assert.equal(flagged.future, true);
  const shown = { ...days, lastDoneAt: '2027-10-28T12:00:00.000Z', ...flagged };
  assert.match(reminderWhen(shown), /future/);
  assert.equal(describeReminder(shown), 'Clean faders: Needs review (completion date is in the future)');
  // One calendar day ahead of UTC is someone's today (time zones east of UTC): still a normal completion.
  assert.deepEqual(reminderStatus(days, '2026-10-29T12:00:00.000Z', null, '2026-10-28T12:00:00Z'), { state: 'ok', dueAt: '2027-01-27', dueInHours: null, snoozed: false });
  // Clock set backwards: a creation date after "now" is flagged too, not clamped to healthy.
  assert.equal(reminderStatus({ ...days, createdAt: '2026-12-01T00:00:00Z' }, null, null, '2026-10-28T12:00:00Z').future, true);
  const hours = { basis: 'hours', intervalValue: 300, warnBefore: 20, enabled: true };
  const hoursFlagged = reminderStatus(hours, '2027-10-28T12:00:00.000Z', 0, '2026-10-28T12:00:00Z');
  assert.equal(hoursFlagged.state, 'unknown', 'zero hours "since" a future completion is not OK');
  assert.equal(hoursFlagged.future, true);
  assert.equal(hoursFlagged.dueInHours, null);
  assert.equal(reminderStatus(hours, '2026-10-20T12:00:00.000Z', 10, '2026-10-28T12:00:00Z').state, 'ok');
  assert.equal(bannerSummary([{ nickname: 'Deck', reminders: [{ ...days, ...flagged }] }]).total, 0);
});
