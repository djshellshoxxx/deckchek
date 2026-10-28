// FS-23 fleet policy. Pure calculations shared by the native adapter and UI.
// Tracked hours estimate observed/confirmed usage; they are never true runtime.
const DAY = 86400000;

function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(value)) return NaN;
  if (value.length > 10 && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)))) return NaN;
  const date = value.slice(0, 10), time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : NaN;
}

export function latestResults(results = []) {
  const latest = new Map();
  for (const result of results) {
    const key = result.testId ?? result.test_id;
    if (typeof key !== 'string' || !key) continue;
    const previous = latest.get(key);
    const date = result.createdAt ?? result.created_at;
    const oldDate = previous?.createdAt ?? previous?.created_at;
    // Keep malformed dates visible as review evidence; do not invent a pass.
    if (!previous || !Number.isFinite(day(date)) || (Number.isFinite(day(oldDate)) && String(date) > String(oldDate))) latest.set(key, result);
  }
  return [...latest.values()];
}

/**
 * Latest result per test: any fail -> attention; else any unknown/skipped/invalid or older than `staleDays` calendar
 * days -> review; else healthy. No device test results -> never (a generic session date does not make a unit healthy
 * or reviewable: AC-2). A result exactly `staleDays` old is still current; one day more is stale.
 * `lastSessionAt` is accepted for call compatibility and deliberately ignored.
 */
export function computeHealth({ lastResults = [], now = new Date().toISOString(), staleDays = 90 } = {}) {
  const results = latestResults(lastResults);
  if (!results.length) return 'never';
  if (results.some(result => result.status === 'fail')) return 'attention';
  const today = day(now);
  if (!Number.isFinite(today) || !Number.isFinite(staleDays) || staleDays < 0) return 'review';
  return results.some(result => {
    const tested = day(result.createdAt ?? result.created_at);
    return result.status !== 'pass' || !Number.isFinite(tested) || tested > today || today - tested > staleDays * DAY;
  }) ? 'review' : 'healthy';
}

/** Calendar-date day reminders; elapsed tracked-hours for hours reminders. */
export function reminderStatus(reminder, lastDoneAt, hoursSince, now = new Date().toISOString()) {
  const unknown = { state: 'unknown', dueAt: null, dueInHours: null, snoozed: false };
  if (!reminder || reminder.enabled === false || reminder.enabled === 0) return { ...unknown, state: 'disabled' };
  const interval = reminder.intervalValue, warning = reminder.warnBefore ?? 14;
  const today = day(now);
  if (!Number.isFinite(interval) || interval <= 0 || interval > 1000000 || !Number.isFinite(warning) || warning < 0 || warning > 1000000 || !Number.isFinite(today)) return unknown;
  const snoozed = Number.isFinite(Date.parse(reminder.snoozedUntil)) && Date.parse(reminder.snoozedUntil) > Date.parse(now.length === 10 ? `${now}T00:00:00Z` : now);
  if (reminder.basis === 'hours') {
    if (!Number.isFinite(hoursSince) || hoursSince < 0) return unknown;
    const remaining = interval - hoursSince;
    return { state: remaining <= 0 ? 'overdue' : remaining <= warning ? 'dueSoon' : 'ok', dueAt: null, dueInHours: remaining, snoozed };
  }
  if (reminder.basis !== 'days') return unknown;
  if (!Number.isInteger(interval)) return unknown;
  const start = day(lastDoneAt ?? reminder.installedDate ?? reminder.createdAt);
  if (!Number.isFinite(start)) return unknown;
  const due = start + interval * DAY;
  // The persisted date contract uses four-digit years. Stay inside that range
  // rather than throwing on TimeClip overflow or emitting a truncated year.
  if (!Number.isFinite(due) || due > Date.UTC(9999, 11, 31) || due < -62167219200000) return unknown;
  return { state: today >= due ? 'overdue' : today >= due - warning * DAY ? 'dueSoon' : 'ok', dueAt: new Date(due).toISOString().slice(0, 10), dueInHours: null, snoozed };
}

export const HEALTH_META = Object.freeze({
  never: { label: 'Never tested', status: 'info' },
  healthy: { label: 'Healthy', status: 'pass' },
  review: { label: 'Review', status: 'review' },
  attention: { label: 'Attention', status: 'fail' },
});
export const REMINDER_META = Object.freeze({
  overdue: { label: 'Overdue', status: 'fail' },
  dueSoon: { label: 'Due soon', status: 'warn' },
  ok: { label: 'OK', status: 'pass' },
  unknown: { label: 'Needs review', status: 'review' },
  disabled: { label: 'Disabled', status: 'info' },
});

/** Date or hours part of a reminder line: "2026-10-22", "12.0 tracked h remaining", or "" when unknown. */
export function reminderWhen(reminder) {
  if (reminder.dueAt) return reminder.dueAt;
  if (Number.isFinite(reminder.dueInHours)) return reminder.dueInHours <= 0 ? `${Math.abs(reminder.dueInHours).toFixed(1)} tracked h over` : `${reminder.dueInHours.toFixed(1)} tracked h remaining`;
  return reminder.basis === 'hours' && reminder.state === 'unknown' ? 'review usage history at the maintenance boundary' : '';
}

/** "Clean faders: Overdue 2026-10-22" / "Stylus check: Due soon (12.0 tracked h remaining)". */
export function describeReminder(reminder) {
  const meta = REMINDER_META[reminder.state] ?? REMINDER_META.unknown;
  const when = reminderWhen(reminder);
  const shown = !when ? '' : reminder.dueAt ? ` ${when}` : ` (${when})`;
  return `${reminder.title ?? 'Reminder'}: ${meta.label}${shown}${reminder.snoozed ? ' (snoozed)' : ''}`;
}

/** The reminder that needs attention first: overdue before due soon before the rest, then the earliest date. */
export function nextDueReminder(reminders = []) {
  const rank = { overdue: 0, dueSoon: 1, ok: 2, unknown: 3, disabled: 4 };
  return [...reminders].filter(r => r.state !== 'disabled')
    .sort((a, b) => (rank[a.state] ?? 3) - (rank[b.state] ?? 3) || String(a.dueAt ?? '9999').localeCompare(String(b.dueAt ?? '9999')) || (a.dueInHours ?? Infinity) - (b.dueInHours ?? Infinity))[0] ?? null;
}

export const BANNER_CAP = 5;

/**
 * Startup banner model (AC-6). Snoozed and disabled reminders are left out. At most `cap` items are listed;
 * `more` is the remainder ("and N more"). Overdue items come first.
 */
export function bannerSummary(rows = [], { cap = BANNER_CAP } = {}) {
  const due = rows.flatMap(row => (row.reminders ?? []).map(reminder => ({ ...reminder, assetName: row.nickname })))
    .filter(r => !r.snoozed && (r.state === 'overdue' || r.state === 'dueSoon'))
    .sort((a, b) => (a.state === b.state ? 0 : a.state === 'overdue' ? -1 : 1));
  const overdue = due.filter(r => r.state === 'overdue').length, dueSoon = due.length - overdue;
  const count = due.length;
  return { total: count, overdue, dueSoon, items: due.slice(0, cap), more: Math.max(0, count - cap), ids: due.map(r => r.id),
    text: count ? `${count} maintenance ${count === 1 ? 'item needs' : 'items need'} attention: ${overdue} overdue, ${dueSoon} due soon.` : '' };
}

export function filterFleet(rows, { venueId, boothId, category, status, reminder, search = '' } = {}) {
  const query = String(search).trim().toLowerCase();
  return rows.filter(row => (!venueId || row.venueId === venueId) && (!boothId || row.boothId === boothId)
    && (!category || row.category === category) && (!status || row.health === status)
    && (!reminder || (row.reminders ?? []).some(r => !r.snoozed && r.state === reminder))
    && (!query || [row.nickname, row.productName, row.serialNumber, row.venue, row.booth, row.position].some(value => String(value ?? '').toLowerCase().includes(query))));
}

/** Tile counts are assets (so a tile and the filter it applies agree); snoozed reminders are not counted. */
export function summarizeFleet(rows) {
  const has = (row, state) => (row.reminders ?? []).some(reminder => !reminder.snoozed && reminder.state === state);
  return { attention: rows.filter(row => row.health === 'attention').length,
    overdue: rows.filter(row => has(row, 'overdue')).length,
    dueSoon: rows.filter(row => has(row, 'dueSoon')).length,
    never: rows.filter(row => row.health === 'never').length };
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function fleetToCsv(rows) {
  const header = ['asset_id', 'nickname', 'model', 'category', 'serial', 'venue', 'booth', 'position', 'last_tested', 'health', 'failing_items', 'next_due', 'tracked_hours_estimate'];
  const records = rows.map(row => [row.assetId, row.nickname, row.productName, row.category, row.serialNumber, row.venue, row.booth, row.position,
    row.lastTestedAt, row.health, (row.failing ?? []).map(failure => failure.name ?? failure.testId).join('; '),
    (() => { const next = nextDueReminder(row.reminders); return next ? describeReminder(next) : ''; })(), row.hoursTotal]);
  return '\ufeff' + [header, ...records].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
