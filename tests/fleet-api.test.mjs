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
