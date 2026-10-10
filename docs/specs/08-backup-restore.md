# Spec 08 — Backup and restore

## 1. Summary, goals, non-goals
Create and restore a single-file `.deckchek-backup` (a zip with manifest and checksums) containing a consistent SQLite snapshot, settings, learned MIDI maps and calibration profiles. Restore migrates older schemas, takes an automatic safety backup first, and can import the browser-mode JSON workspace. Scheduled automatic backups keep the last N.

**Goals:** no data loss on restore failure; consistent snapshot while the app runs; forward/backward compatibility rules; works offline. **Non-goals:** cloud sync; encryption (v1 plain, documented; optional password later); merging two databases; backing up audio recordings.

## 2. Users & user stories
- AC-1 Given Options > Backup > "Back up now", then a save dialog proposes `DeckChek-backup-YYYYMMDD-HHmm.deckchek-backup` and the file validates (manifest + sha256) after writing.
- AC-2 Given the app is running a capture or saving a run, then the backup still succeeds and contains a transactionally consistent database (online backup API).
- AC-3 Given "Restore…", the user picks a file; then the app validates manifest, checksums and schema version, shows a preview (created date, app version, run count, asset count), and requires confirmation "Replace current data".
- AC-4 Given confirmation, then a safety backup `auto-pre-restore-<ts>.deckchek-backup` is created in the backups folder before anything is replaced; if restore fails, the original database is intact (atomic swap) and the user sees the error.
- AC-5 Given a backup from an older schema (e.g. version 2) , then restore migrates it using `apply_migrations` and reports "Upgraded from schema v2 to vN".
- AC-6 Given a backup with a newer schema than the app supports, then restore is refused: "This backup was made by a newer DeckChek (schema v9). Update the app to restore it."
- AC-7 Given automatic backups enabled (daily/weekly/on exit), then at most N (default 7) `auto-*` files are kept; manual backups are never auto-deleted.
- AC-8 Given a browser-mode `deckchek-workspace.json` (`version:1`, `equipment`, `runs`), then "Import browser workspace" imports runs and equipment into the DB using the existing `parseWorkspaceJson`, skipping duplicates by id.
- AC-9 Given a corrupted file (bad zip, checksum mismatch), then restore refuses before touching live data.

## 3. UX
Entry points: Options > Data > Backup & restore panel (new screen section in `app/ui/screens/system.js` or a new `data.js`), first-run wizard summary tip, startup prompt if last backup older than 30 days and the database holds runs ("Back up now / Remind me later / Don't remind"). Panel shows: last backup date/size/location, "Back up now", "Restore from file…", "Import browser workspace…", toggle "Automatic backups" (Off/Daily/Weekly/On exit), "Keep last [7]", backups folder with "Open folder", list of auto backups with Restore buttons. States: empty ("No backups yet — create one before updating DeckChek."), loading (progress by page count: "Backing up… 42%"), success ("Backup saved — 3.2 MB, 128 runs"), partial (settings absent in browser; MIDI maps missing: listed), error (disk full, permission, locked file: "Not enough space on D:. Free 5 MB and retry."), offline (n/a), unsupported (browser mode: only JSON workspace export/import, existing behaviour). Restore requires typing nothing but an explicit checkbox "I understand this replaces my current data" plus Restart notice: app reloads after restore. Shortcuts: none global; Enter confirms focused default (Cancel). A11y: progress `role=progressbar`, results announced by `aria-live`, destructive button styled per design system with text label.

## 4. Architecture
Crates: `rusqlite` feature `backup` (existing dep 0.32 bundled; add `features=["bundled","backup"]`; MIT), `zip` 2.x (MIT; features `deflate`), `sha2` (MIT/Apache-2.0), optional `tauri-plugin-dialog` (save/open dialogs, shared with Specs 02/03). No network. New `src-tauri/src/backup.rs`:
- `backup_create(destPath: Option<String>, kind: "manual"|"auto"|"pre_restore", settings: Value) -> { path, bytes, createdAt, counts:{runs,assets,profiles}, schemaVersion }` — emits `backup://progress` `{pages_done, pages_total}`.
- `backup_inspect(path) -> { valid: bool, errors: [string], manifest: Manifest|null, counts, needsMigration: bool, tooNew: bool }`
- `backup_restore(path, confirm: bool) -> { restoredFrom, upgradedFrom: Option<i64>, safetyBackup: string, settings: Value, calibrationProfiles: Value }`
- `backup_list() -> [{name, path, kind, createdAt, bytes}]`
- `backup_settings_get() / backup_settings_set({mode:"off"|"daily"|"weekly"|"onExit", keep:u32})`
- `backup_import_workspace(json: Value) -> { runsImported, runsSkipped, equipmentImported }`
Scheduler: on startup `backup::run_scheduled_if_due(app)` in a background thread (no new plugin); on-exit variant runs in `RunEvent::ExitRequested` with 5 s cap. Frontend: `app/backup.js` (pure helpers: `validateManifestShape`, `describeBackup`, `suggestBackupName(now)`, `workspaceToImportPayload(parsed)`), `app/ui/screens/data.js`. Changes: `Cargo.toml`, `lib.rs` (handlers; managed `BackupState` mutex to serialise), `app/ui/state.js` (expose `exportSettingsBlob()` / `importSettingsBlob()` for `deckchek.ui.v1` and `deckchek.calibration.v1`, which live in WebView localStorage, so JS passes them to Rust at backup time and receives them back at restore), `app/export.js` reused.

## 5. Data model
Backup file `*.deckchek-backup` (zip, stored names fixed):
```
manifest.json
db/deckchek.sqlite3        (snapshot, VACUUMed copy)
settings/ui.json           deckchek.ui.v1
settings/calibration.json  deckchek.calibration.v1 (profiles)
data/midi-maps.json        asset_midi_map rows redundantly exported for forward readability
```
`manifest.json`:
```json
{ "format":"deckchek-backup","formatVersion":1,"createdAt":"ISO","kind":"manual",
  "appVersion":"0.0.4","schemaVersion":2,
  "counts":{"runs":128,"assets":12,"profiles":3,"midiMaps":4},
  "files":[{"name":"db/deckchek.sqlite3","bytes":3200000,"sha256":"hex"}] }
```
Migration `NNNN_backup_log.sql`:
```sql
CREATE TABLE IF NOT EXISTS backup_log (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, path TEXT NOT NULL, bytes INTEGER NOT NULL,
  schema_version INTEGER NOT NULL, created_at TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 1 );
```
Settings for scheduling in `app_state` (`key='backup'`, see Spec 01 for the table). Compatibility rules: `formatVersion` unknown/greater -> refuse; `schemaVersion` greater -> refuse; lower -> migrate; additive-only changes to manifest. Default folder: `<app_data_dir>/backups`.

## 6. Algorithms
Snapshot: open source connection read-only on the live DB path, destination in a temp file in the same directory; `rusqlite::backup::Backup::new(&src,&mut dst)` then `run_to_completion(pages_per_step=100, pause=Duration::from_millis(10), progress_cb)` (docs example uses 5 pages / 250 ms; we use larger steps, tunable). Then `PRAGMA integrity_check` on the copy must return `ok`, then `VACUUM`. Zip written to `<dest>.partial`, sha256 computed streaming, manifest last-written-first-in-archive via two-pass (compute hashes, then write manifest entry first). Rename `.partial` -> final only after re-inspect succeeds. Restore: inspect; extract DB to temp in app data dir; open and `apply_migrations` on the temp copy (so migration failure never touches live DB); `integrity_check`; close live connections (manage via `Mutex<Option<Connection>>`/pool gate that blocks commands during swap); safety backup; `std::fs::rename` live -> `.bak`, temp -> live (same volume, atomic on NTFS); on error rename back. Retention: sort `auto-*` by `createdAt`, delete beyond N. Schedule due = now - last_auto >= interval (daily 24 h, weekly 7 d). Workspace import: map `runs` through `toPersistRun`/`save_diagnostic_run` semantic (ids unique) inside one transaction.

## 7. Errors, edge cases, privacy, security
Zip extraction only reads known fixed names — never uses archive entry names for paths (no zip-slip); entry size limits (DB <= 2 GiB, JSON <= 5 MiB, decompression ratio guard 100:1). Dest path from dialog: require `.deckchek-backup`, refuse directory, refuse paths inside the live DB file. Low disk space: check free space >= 2x DB size first. WAL: online backup includes WAL content; no need to copy `-wal`. Locked/in-use DB: backup API retries on `SQLITE_BUSY` up to 5 times. Restore while capture running: blocked ("Stop capture first"). Backups contain device serials and notes (PII) and no audio; the dialog states backups are unencrypted. Restored settings JSON validated and size-limited before being written to localStorage. Power loss mid-restore: temp+rename ordering leaves either old or new; startup detects leftover `.partial`/`.bak` and offers recovery.

## 8. Test plan
Unit (JS): manifest shape validation, name suggestion, workspace payload mapping (v1, invalid version, duplicate ids), retention sort helper. Rust: backup of a populated in-memory/temp DB yields valid zip with matching sha256; backup during concurrent writer thread is consistent (`integrity_check`); inspect rejects tampered file, bad zip, missing manifest, formatVersion 99, schema newer; restore of v1 DB migrates to current and preserves rows (extend `upgrades_a_version_1_database_without_losing_data`); failure injection (corrupt DB, forced migration error) leaves live DB byte-identical; zip-slip fixture with `../evil` entry ignored; retention keeps last N and never deletes manual. UI smoke: Data panel renders, browser-mode shows only JSON import, import dialog preview. Windows CI: run full backup/restore round trip on the Windows runner (path separators, rename-over-open-file behaviour, long paths). Manual: back up a profile containing PLX-CRSS12/SL-1200MK4 assets and Traktor Audio 8 DJ calibration, wipe `%APPDATA%\com.circuitdriftlabs.deckchek`, restore, verify runs, MIDI map for the DDJ, calibration status; restore on a second machine.

## 9. Definition of done
- [ ] AC-1..9 pass; round-trip CI on Windows; safety backup proven by failure test
- [ ] Docs: README data section, SPEC-07 data model update, privacy note
Rollout: automatic backups default Off for first release, backup/restore UI always on.

## 10. Dependencies, risks, open questions, effort
Depends on: Spec 01 (`app_state`), Spec 02 (zip crate, dialog plugin, log), existing `apply_migrations`. Risks: swapping a DB with open connections (design needs a connection gate; today each command opens its own connection via `open_database`, which simplifies it); localStorage-held settings cannot be read by Rust without JS handoff. Open: add password encryption? include run raw sample data (none stored today — verify)? Effort: L (~28 agent-hours).

## 11. Research notes
- rusqlite backup module: https://docs.rs/rusqlite/latest/rusqlite/backup/index.html and mirrored source https://searchfox.org/comm-central/source/third_party/rust/rusqlite/src (snippet only): `Backup::new(&src,&mut dst)`, `step`, `progress`, `run_to_completion(pages, sleep, progress)`; needs two distinct connections; `VACUUM INTO` is a simpler alternative (adopted as optional fast path, UNKNOWN whether available in bundled SQLite version — verify >= 3.27).
- SQLite online backup: https://www.sqlite.org/backup.html (general knowledge; not opened).
- Existing code: `src-tauri/src/db.rs` (`MIGRATIONS`, `apply_migrations`), `app/export.js` (`parseWorkspaceJson` v1), `app/ui/persistence.js` (`importWorkspace`).
