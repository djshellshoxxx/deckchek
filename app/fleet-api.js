// FS-23 bridge. Native SQLite supplies evidence; fleet.js applies one shared
// display policy for health, reminders and the filtered export.
import { computeHealth, latestResults, reminderStatus, filterFleet, summarizeFleet } from './fleet.js';

export function decorateFleet(snapshot, { now = new Date().toISOString(), staleDays = 90, filters = {} } = {}) {
  const rows = snapshot.rows.map(row => {
    const results = latestResults(row.lastResults);
    const reminders = (row.reminders ?? []).map(reminder => ({ ...reminder,
      ...reminderStatus({ ...reminder, installedDate: row.installedDate, createdAt: row.createdAt }, reminder.lastDoneAt,
        reminder.lastDoneAt ? reminder.hoursSinceCompletion : row.hoursTotal, now) }));
    return { ...row, health: computeHealth({ lastResults: results, lastSessionAt: row.lastSessionAt, now, staleDays }), reminders,
      failing: results.filter(result => result.status === 'fail').map(result => ({ testId: result.testId, name: result.name || result.testId })),
      lastTestedAt: [...results.map(result => result.createdAt), row.lastSessionAt].filter(date => typeof date === 'string' && Number.isFinite(Date.parse(date))).sort().at(-1) ?? null };
  });
  const selected = filterFleet(rows, filters);
  return { ...snapshot, rows: selected, tiles: summarizeFleet(selected) };
}

export function createFleetApi(invoke = globalThis.window?.__TAURI__?.core?.invoke) {
  const call = (command, args = {}) => {
    if (!invoke) return Promise.reject(new Error('Fleet persistence requires the desktop app.'));
    return invoke(command, args);
  };
  return {
    native: Boolean(invoke),
    overview: async options => decorateFleet(await call('fleet_snapshot'), options),
    place: (assetId, deckPositionId) => call('fleet_place_asset', { assetId, deckPositionId }),
    saveReminder: input => call('reminder_upsert', { input }),
    saveTemplate: input => call('reminder_template_upsert', { input }),
    applyTemplate: (templateId, assetId) => call('reminder_apply_template', { templateId, assetId }),
    snooze: (id, untilIso) => call('reminder_snooze', { id, untilIso }),
    log: input => call('maintenance_log', { input }),
    events: (assetId, filters = {}) => call('maintenance_list', { assetId, ...filters }),
    saveBooth: input => call('booth_upsert', { input }),
    savePosition: input => call('position_upsert', { input }),
    deleteLocation: (kind, id) => call('fleet_location_delete', { kind, id }),
  };
}
