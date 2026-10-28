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

export function computeHealth({ lastResults = [], lastSessionAt = null, now = new Date().toISOString(), staleDays = 90 } = {}) {
  const results = latestResults(lastResults);
  if (!results.length) return Number.isFinite(day(lastSessionAt)) ? 'review' : 'never';
  if (results.some(result => result.status === 'fail')) return 'attention';
  const today = day(now);
  if (!Number.isFinite(today) || !Number.isFinite(staleDays) || staleDays < 0) return 'review';
  return results.some(result => {
    const tested = day(result.createdAt ?? result.created_at);
    return result.status !== 'pass' || !Number.isFinite(tested) || tested > today || today - tested >= staleDays * DAY;
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

export function filterFleet(rows, { venueId, boothId, category, status, search = '' } = {}) {
  const query = String(search).trim().toLowerCase();
  return rows.filter(row => (!venueId || row.venueId === venueId) && (!boothId || row.boothId === boothId)
    && (!category || row.category === category) && (!status || row.health === status)
    && (!query || [row.nickname, row.productName, row.serialNumber, row.venue, row.booth, row.position].some(value => String(value ?? '').toLowerCase().includes(query))));
}

export function summarizeFleet(rows) {
  const reminders = rows.flatMap(row => row.reminders ?? []).filter(reminder => !reminder.snoozed);
  return { attention: rows.filter(row => row.health === 'attention').length,
    overdue: reminders.filter(reminder => reminder.state === 'overdue').length,
    dueSoon: reminders.filter(reminder => reminder.state === 'dueSoon').length,
    never: rows.filter(row => row.health === 'never').length };
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function fleetToCsv(rows) {
  const header = ['asset_id', 'nickname', 'model', 'serial', 'venue', 'booth', 'position', 'last_tested', 'health', 'failing_items', 'tracked_hours_estimate'];
  const records = rows.map(row => [row.assetId, row.nickname, row.productName, row.serialNumber, row.venue, row.booth, row.position,
    row.lastTestedAt, row.health, (row.failing ?? []).map(failure => failure.name ?? failure.testId).join('; '), row.hoursTotal]);
  return '\ufeff' + [header, ...records].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
