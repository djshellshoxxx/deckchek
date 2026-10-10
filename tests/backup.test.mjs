import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  suggestBackupName, validateManifestShape, describeBackup, describeRestoreResult, progressPercent,
  workspaceToImportPayload, planRetention, validateSchedule, createBackupApi, formatBytes,
  BACKUP_EXT, ENTRY, MAX_KEEP, DEFAULT_KEEP,
} from '../app/backup.js';
import { parseWorkspaceJson, serializeWorkspaceJson } from '../app/export.js';

const contract = () => JSON.parse(readFileSync(new URL('./contracts/backup-manifest.json', import.meta.url), 'utf8'));

test('suggested name is DeckChek-backup-YYYYMMDD-HHmm in local time', () => {
  assert.equal(suggestBackupName(new Date(2026, 9, 10, 8, 5)), 'DeckChek-backup-20261010-0805.deckchek-backup');
  assert.equal(suggestBackupName(new Date(2027, 0, 1, 0, 0)), 'DeckChek-backup-20270101-0000.deckchek-backup');
  assert.equal(suggestBackupName(new Date(2026, 11, 31, 23, 59)), 'DeckChek-backup-20261231-2359.deckchek-backup');
  assert.ok(suggestBackupName().endsWith(`.${BACKUP_EXT}`));
  assert.throws(() => suggestBackupName(new Date('nope')), /invalid date/);
});

test('the shared manifest contract validates', () => {
  assert.deepEqual(validateManifestShape(contract()), { ok: true, errors: [] });
  assert.equal(contract().files[0].name, ENTRY.db);
});

test('manifest shape errors are reported', () => {
  const bad = (patch, re) => {
    const m = { ...contract(), ...patch };
    const r = validateManifestShape(m);
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.ok(r.errors.some(e => re.test(e)), `${JSON.stringify(patch)} -> ${r.errors}`);
  };
  bad({ format: 'zip' }, /format/);
  bad({ formatVersion: 99 }, /newer/);
  bad({ formatVersion: 0 }, /formatVersion/);
  bad({ formatVersion: 1.5 }, /formatVersion/);
  bad({ createdAt: 'yesterday' }, /createdAt/);
  bad({ kind: 'cloud' }, /kind/);
  bad({ appVersion: '' }, /appVersion/);
  bad({ schemaVersion: 0 }, /schemaVersion/);
  bad({ counts: { runs: -1 } }, /counts\.runs/);
  bad({ counts: [] }, /counts must/);
  bad({ files: 'x' }, /files must/);
  bad({ files: [{ name: 'settings/ui.json', bytes: 1, sha256: 'a'.repeat(64) }] }, /database/);
  bad({ files: [{ name: ENTRY.db, bytes: 1, sha256: 'xyz' }] }, /sha256/);
  bad({ files: [{ name: ENTRY.db, bytes: -1, sha256: 'a'.repeat(64) }] }, /bytes/);
  bad({ files: [{ name: ENTRY.db, bytes: 1, sha256: 'a'.repeat(64) }, { name: ENTRY.db, bytes: 1, sha256: 'a'.repeat(64) }] }, /duplicates/);
  for (const v of [null, undefined, [], 'x']) assert.equal(validateManifestShape(v).ok, false);
  // counts are optional (additive manifest rule)
  const { counts, ...noCounts } = contract();
  assert.equal(validateManifestShape(noCounts).ok, true);
});

test('describeBackup previews valid, upgradeable and refused files', () => {
  const manifest = { ...contract(), schemaVersion: 2, createdAt: new Date(2026, 9, 10, 8, 0).toISOString() };
  const ok = describeBackup({ valid: true, errors: [], manifest, needsMigration: true, tooNew: false, currentSchemaVersion: 5 });
  assert.equal(ok.canRestore, true);
  assert.equal(ok.lines[0], 'Created 2026-10-10 08:00 by DeckChek 0.0.5');
  assert.equal(ok.lines[1], '128 runs, 12 assets, 3 calibration profiles, 4 MIDI maps');
  assert.equal(ok.lines[2], 'Will be upgraded from schema v2 to v5.');
  const one = describeBackup({ valid: true, manifest: { ...manifest, kind: 'pre_restore', counts: { runs: 1, assets: 1, profiles: 1, midiMaps: 1 } }, needsMigration: false });
  assert.equal(one.lines[1], '1 run, 1 asset, 1 calibration profile, 1 MIDI map');
  assert.match(one.lines.at(-1), /safety backup/);
  const msg = 'This backup was made by a newer DeckChek (schema v9). Update the app to restore it.';
  const newer = describeBackup({ valid: false, errors: [msg], manifest: null, tooNew: true });
  assert.deepEqual([newer.canRestore, newer.title, newer.error], [false, 'Backup from a newer DeckChek', msg]);
  assert.equal(describeBackup({ valid: false, errors: [] }).error, 'This file is not a valid DeckChek backup.');
  assert.equal(describeBackup(null).canRestore, false);
});

test('restore result message reports upgrades and the safety backup', () => {
  assert.equal(
    describeRestoreResult({ upgradedFrom: 2, schemaVersion: 5, safetyBackup: 'C:\\x\\auto-pre-restore.deckchek-backup', warnings: [] }),
    'Restore complete. Upgraded from schema v2 to v5. Your previous data was saved as a safety backup first. DeckChek will reload now.',
  );
  assert.equal(describeRestoreResult({ upgradedFrom: null, schemaVersion: 5, safetyBackup: null, warnings: ['settings/ui.json was skipped.'] }),
    'Restore complete. settings/ui.json was skipped. DeckChek will reload now.');
});

test('progress percent is clamped and safe on bad payloads', () => {
  assert.equal(progressPercent({ pages_done: 42, pages_total: 100 }), 42);
  assert.equal(progressPercent({ pages_done: 199, pages_total: 200 }), 99);
  assert.equal(progressPercent({ pages_done: 200, pages_total: 200 }), 100);
  assert.equal(progressPercent({ pages_done: 300, pages_total: 200 }), 100);
  assert.equal(progressPercent({ pages_done: 1, pages_total: 0 }), 0);
  assert.equal(progressPercent(null), 0);
});

test('formatBytes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(3.2 * 1024 * 1024), '3.2 MB');
  assert.equal(formatBytes(12 * 1024 * 1024), '12 MB');
  assert.equal(formatBytes(-1), '—');
});

test('workspace payload maps runs through toPersistRun and drops duplicates', () => {
  const text = serializeWorkspaceJson({
    equipment: [{ id: 'eq-1', name: 'SL-1200MK4' }, null, 'junk'],
    runs: [
      { id: 'r1', test: 'Stereo balance', createdAt: '2026-10-10T08:00:00Z', measurements: [{ metricId: 'balance', value: 0.4, unit: 'dB', uncertainty: { expanded: 0.1 } }, { metricId: 'nan', value: NaN }], findings: [] },
      { id: 'r1', test: 'dup', createdAt: 'x', measurements: [], findings: [] },
      { test: 'no id' },
      null,
    ],
  });
  const payload = workspaceToImportPayload(parseWorkspaceJson(text));
  assert.equal(payload.version, 1);
  assert.equal(payload.runs.length, 1);
  const r = payload.runs[0];
  assert.equal(r.id, 'r1');
  assert.equal(r.test, 'Stereo balance');
  assert.equal(r.sessionType, 'diagnostic');
  assert.deepEqual(r.measurements.map(m => [m.metricId, m.uncertainty]), [['balance', 0.1]]);
  assert.deepEqual(payload.equipment, [{ id: 'eq-1', name: 'SL-1200MK4' }]);
  for (const bad of [null, { version: 2, runs: [], equipment: [] }, { version: 1, runs: {}, equipment: [] }, { version: 1, runs: [] }]) {
    assert.throws(() => workspaceToImportPayload(bad), /invalid DeckChek workspace/);
  }
});

test('retention plan keeps the newest N automatic backups and every manual one', () => {
  const autos = Array.from({ length: 9 }, (_, i) => ({ name: `auto-${i}.deckchek-backup`, kind: 'auto', createdAt: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }));
  const pre = { name: 'auto-pre-restore-1.deckchek-backup', kind: 'pre_restore', createdAt: '2026-10-10T00:00:00.000Z' };
  const manual = { name: 'DeckChek-backup-1.deckchek-backup', kind: 'manual', createdAt: '2020-01-01T00:00:00.000Z' };
  const manualNamedAuto = { name: 'auto-mine.deckchek-backup', kind: 'manual', createdAt: '2019-01-01T00:00:00.000Z' };
  const all = [...autos, pre, manual, manualNamedAuto];
  const { keep, remove } = planRetention(all, 7);
  assert.deepEqual(remove.map(e => e.name).sort(), ['auto-0.deckchek-backup', 'auto-1.deckchek-backup', 'auto-2.deckchek-backup']);
  assert.ok(keep.includes(pre) && keep.includes(manual) && keep.includes(manualNamedAuto));
  assert.equal(keep.length, all.length - 3);
  assert.equal(planRetention(all, 0).remove.length, 9, 'keep is clamped to at least 1');
  assert.equal(planRetention(all).remove.length, 10 - DEFAULT_KEEP);
  assert.deepEqual(planRetention([], 7), { keep: [], remove: [] });
});

test('schedule validation matches the Rust limits', () => {
  assert.deepEqual(validateSchedule({ mode: 'onExit', keep: 7 }), { mode: 'onExit', keep: 7 });
  assert.deepEqual(validateSchedule({ mode: 'daily', keep: 1 }), { mode: 'daily', keep: 1 });
  assert.deepEqual(validateSchedule({ mode: 'weekly', keep: MAX_KEEP }), { mode: 'weekly', keep: MAX_KEEP });
  for (const bad of [{ mode: 'hourly', keep: 7 }, { mode: 'daily', keep: 0 }, { mode: 'daily', keep: MAX_KEEP + 1 }, { mode: 'daily', keep: 2.5 }, {}]) {
    assert.throws(() => validateSchedule(bad), /mode|keep/);
  }
});

test('native bridge passes exactly the Rust command and argument names', async () => {
  const calls = [];
  const api = createBackupApi({ invoke: async (cmd, args) => { calls.push([cmd, args]); return { ok: cmd }; } });
  assert.equal(api.supported, true);
  const settings = { ui: { theme: 'dark' }, calibration: {} };
  await api.create({ destPath: 'C:\\Users\\dj\\b.deckchek-backup', settings });
  await api.create({ kind: 'auto' });
  await api.inspect('/x/b.deckchek-backup');
  await api.restore('/x/b.deckchek-backup', { confirm: true, settings });
  await api.restore('/x/b.deckchek-backup', { confirm: 'yes' });
  await api.list();
  await api.getSettings();
  await api.setSettings({ mode: 'daily', keep: 5 });
  await api.importWorkspace({ version: 1, runs: [], equipment: [] });
  assert.deepEqual(calls, [
    ['backup_create', { destPath: 'C:\\Users\\dj\\b.deckchek-backup', kind: 'manual', settings }],
    ['backup_create', { destPath: null, kind: 'auto', settings: null }],
    ['backup_inspect', { path: '/x/b.deckchek-backup' }],
    ['backup_restore', { path: '/x/b.deckchek-backup', confirm: true, settings }],
    ['backup_restore', { path: '/x/b.deckchek-backup', confirm: false, settings: null }],
    ['backup_list', {}],
    ['backup_settings_get', {}],
    ['backup_settings_set', { settings: { mode: 'daily', keep: 5 } }],
    ['backup_import_workspace', { json: { version: 1, runs: [], equipment: [] } }],
  ]);
  await assert.rejects(api.create({ kind: 'pre_restore' }), /manual or auto/);
  await assert.rejects(api.setSettings({ mode: 'often', keep: 5 }), /mode/);
  assert.equal(calls.length, 9, 'invalid input never reaches Rust');
});

test('browser mode reports unsupported', async () => {
  const api = createBackupApi({ invoke: null });
  assert.equal(api.supported, false);
  await assert.rejects(api.list(), e => e.code === 'unsupported' && /desktop app/.test(e.message));
  await assert.rejects(api.restore('x', { confirm: true }), e => e.code === 'unsupported');
});
