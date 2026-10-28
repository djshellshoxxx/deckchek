import test from 'node:test';
import assert from 'node:assert/strict';
import { maxEventDate } from '../app/ui/fleet-events.js';

test("regression: the maintenance date picker allows dates up to tomorrow's local date", () => {
  // Local-time constructors, so the expectations hold in every TZ the suite runs in.
  assert.equal(maxEventDate(new Date(2026, 9, 28, 9, 0)), '2026-10-29');
  assert.equal(maxEventDate(new Date(2026, 11, 31, 23, 30)), '2027-01-01', 'year end, late evening local time');
  assert.equal(maxEventDate(new Date(2026, 1, 28, 0, 5)), '2026-03-01', 'month end, just after local midnight');
  assert.equal(maxEventDate(new Date(2028, 1, 28, 12, 0)), '2028-02-29', 'leap day');
  assert.equal(maxEventDate(new Date(2026, 2, 28, 23, 0)), '2026-03-29', 'across a DST change');
  assert.match(maxEventDate(), /^\d{4}-\d{2}-\d{2}$/);
});
