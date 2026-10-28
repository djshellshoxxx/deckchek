import test from 'node:test';
import assert from 'node:assert/strict';
import { createFleetApi, decorateFleet } from '../app/fleet-api.js';
import { renderBoothSheetHtml } from '../app/ui/booth-sheet.js';

test('fleet adapter keeps untested evidence neutral and resets hours after maintenance', () => {
  const view = decorateFleet({ rows: [{ assetId: 'a', createdAt: '2026-01-01', hoursTotal: 510, lastResults: [], reminders: [{ id: 'r', enabled: true, basis: 'hours', intervalValue: 500, lastDoneAt: '2026-10-21', hoursAtLastEvent: 500, hoursSinceCompletion: 10 }] }] }, { now: '2026-10-22T00:00:00Z' });
  assert.equal(view.rows[0].health, 'never');
  assert.equal(view.rows[0].reminders[0].dueInHours, 490);
  assert.equal(view.tiles.overdue, 0);
});

test('fleet adapter never infers elapsed runtime from a revised historical total', () => {
  const base = { assetId: 'a', createdAt: '2026-01-01', hoursTotal: 12, lastResults: [], reminders: [{ id: 'r', enabled: true, basis: 'hours', intervalValue: 10, lastDoneAt: '2026-10-21', hoursAtLastEvent: 2, hoursSinceCompletion: 0 }] };
  assert.equal(decorateFleet({ rows: [base] }).rows[0].reminders[0].dueInHours, 10);
  const uncertain = { ...base, reminders: [{ ...base.reminders[0], hoursSinceCompletion: null }] };
  assert.equal(decorateFleet({ rows: [uncertain] }).rows[0].reminders[0].state, 'unknown');
});

test('native fleet bridge sends exactly the registered command argument names', async () => {
  const calls = [];
  const api = createFleetApi(async (command, args) => { calls.push({ command, args }); return command === 'fleet_snapshot' ? { rows: [] } : null; });
  await api.overview(); await api.place('a', null); await api.snooze('r', '2026-10-23T00:00:00Z'); await api.log({ assetId: 'a' });
  assert.deepEqual(calls, [ { command: 'fleet_snapshot', args: {} }, { command: 'fleet_place_asset', args: { assetId: 'a', deckPositionId: null } }, { command: 'reminder_snooze', args: { id: 'r', untilIso: '2026-10-23T00:00:00Z' } }, { command: 'maintenance_log', args: { input: { assetId: 'a' } } } ]);
  await assert.rejects(createFleetApi(null).overview(), /desktop app/);
});

test('booth sheet escapes names and includes serial, health, due date and notes', () => {
  const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const html = renderBoothSheetHtml({ booth: { name: '<script>bad</script>' }, rows: [{ nickname: 'Deck', serialNumber: '123', health: 'never', reminders: [{ dueAt: '2026-10-23' }] }] }, { esc });
  assert.equal(html.includes('<script>'), false);
  for (const text of ['123', 'Never tested', 'never', '2026-10-23', 'Notes']) assert.ok(html.includes(text));
});

test('AC-9 booth sheet lists every position (empty ones too), never the venue city, and escapes every user string', () => {
  const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const rows = [{ nickname: '<b>Deck</b>', productName: 'TT "1"', serialNumber: 'S&N', health: 'attention', lastTestedAt: '2026-10-01T10:00:00Z', deckPositionId: 'p1', position: 'Left', city: 'Paris', reminders: [{ title: '<i>Clean</i>', state: 'overdue', dueAt: '2026-10-22' }] }];
  const html = renderBoothSheetHtml({ booth: { name: 'Booth & <co>' }, rows, positions: [{ id: 'p1', name: 'Left' }, { id: 'p2', name: 'Right' }] }, { esc });
  assert.ok(html.includes('Left') && html.includes('Right') && html.includes('Empty'));
  assert.ok(html.includes('2026-10-01') && html.includes('S&amp;N') && html.includes('Attention'));
  assert.ok(html.includes('&lt;i&gt;Clean&lt;/i&gt;: Overdue 2026-10-22'));
  assert.ok(html.includes('class="booth-notes"'));
  assert.equal(/<b>|<i>|<co>|Paris/.test(html), false);
});

test('the bridge lists maintenance events fleet-wide when no asset is named', async () => {
  const calls = [];
  const api = createFleetApi(async (command, args) => { calls.push({ command, args }); return []; });
  await api.events(null, { from: '2026-01-01', to: null, eventType: 'clean' });
  assert.deepEqual(calls, [{ command: 'maintenance_list', args: { assetId: null, from: '2026-01-01', to: null, eventType: 'clean' } }]);
});

test('regression: reminders and templates can be deleted through the reminder_delete command', async () => {
  const calls = [];
  const api = createFleetApi(async (command, args) => { calls.push({ command, args }); return null; });
  await api.deleteReminder('template-1');
  assert.deepEqual(calls, [{ command: 'reminder_delete', args: { id: 'template-1' } }]);
  await assert.rejects(createFleetApi(null).deleteReminder('x'), /desktop app/);
});

test('regression: decorateFleet passes a future completion through as a flagged reminder', () => {
  const view = decorateFleet({ rows: [{ assetId: 'a', createdAt: '2026-01-01', hoursTotal: 0, lastResults: [], reminders: [{ id: 'r', enabled: true, basis: 'days', intervalValue: 90, warnBefore: 14, lastDoneAt: '2027-10-28T12:00:00.000Z' }] }] }, { now: '2026-10-28T10:00:00Z' });
  assert.equal(view.rows[0].reminders[0].state, 'unknown');
  assert.equal(view.rows[0].reminders[0].future, true);
  assert.equal(view.tiles.overdue + view.tiles.dueSoon, 0);
});
