# Spec 08 — Backup and restore

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0005_backup_log.sql`. Milestone: M5. Size: L. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

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
Entry points: Options > Data > Backup & restore panel (new screen section in `app/ui/screens/system.js` or a new `data.js`), first-run wizard summary tip, startup prompt if last backup older than 30 days and the database holds runs ("Back up now / Remind me later / Don't remind"). Panel shows: last backup date/size/location, "Back up now", "Restore from file…", "Import browser workspace…", toggle "Automatic backups" (Off/Daily/Weekly/On exit), "Keep last [7]", backups folder with "Open folder", list of auto backups with Restore buttons. States: empty ("No backups yet — create one before updating DeckChek."), loading (progress by page count: "Backing up… 42%"), success ("Backup saved — 3.2 MB, 128 runs"), partial (settings absent in browser; MIDI maps missing: listed), error (disk full, permission, locked file: "Not enough space on D:. Free 5 MB and retry."), offline (n/a), browser mode (existing workspace JSON and the separate venue-history archive described in §12; full database backup files require the desktop app). Restore requires typing nothing but an explicit checkbox "I understand this replaces my current data" plus Restart notice: app reloads after restore. Shortcuts: none global; Enter confirms focused default (Cancel). A11y: progress `role=progressbar`, results announced by `aria-live`, destructive button styled per design system with text label.

## 4. Architecture
Crates in the current manifest: `rusqlite` 0.41 with `backup` and `bundled` (MIT), `zip` 9.0.5 with default features disabled and `deflate` enabled (MIT), `sha2` 0.10 (MIT/Apache-2.0), `tauri-plugin-dialog` 2 (direct dependency for save/open dialogs, shared with Specs 02/03). No network. New `src-tauri/src/backup.rs`:
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
Migration `0005_backup_log.sql`:
```sql
CREATE TABLE IF NOT EXISTS backup_log (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, path TEXT NOT NULL, bytes INTEGER NOT NULL,
  schema_version INTEGER NOT NULL, created_at TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 1 );
```
Settings for scheduling in `app_state` (`key='backup'`, table from `0003_app_state.sql`, FS-00 §5.1). From M7 the archive also carries the FS-00 photo store as additional fixed-prefix entries `photos/<sha256>.<ext>` listed in `manifest.files` (additive; `formatVersion` stays 1; restore copies them into `<app_data_dir>/photos/` and ignores any other prefix). The photo-store job (M7-F2-photo) owns that extension; implemented as `photos/<64 hex>.jpg` entries (only that exact shape is read, checksummed and restored; restore copies them after the database swap and reports failures as warnings). Compatibility rules: `formatVersion` unknown/greater -> refuse; `schemaVersion` greater -> refuse; lower -> migrate; additive-only changes to manifest. Default folder: `<app_data_dir>/backups`.

## 6. Algorithms
Snapshot: open source connection read-only on the live DB path, destination in a temp file in the same directory; `rusqlite::backup::Backup::new(&src,&mut dst)` then `run_to_completion(pages_per_step=100, pause=Duration::from_millis(10), progress_cb)` (docs example uses 5 pages / 250 ms; we use larger steps, tunable). Then `PRAGMA integrity_check` on the copy must return `ok`, then `VACUUM`. Zip written to `<dest>.partial`, sha256 computed streaming, manifest last-written-first-in-archive via two-pass (compute hashes, then write manifest entry first). Rename `.partial` -> final only after re-inspect succeeds. Restore: inspect; extract DB to temp in app data dir; open and `apply_migrations` on the temp copy (so migration failure never touches live DB); `integrity_check`; close live connections (manage via `Mutex<Option<Connection>>`/pool gate that blocks commands during swap); safety backup; `std::fs::rename` live -> `.bak`, temp -> live (same volume, atomic on NTFS); on error rename back. Retention: sort `auto-*` by `createdAt`, delete beyond N. Schedule due = now - last_auto >= interval (daily 24 h, weekly 7 d). Workspace import: the native `import_workspace` validates the envelope and item cap, then persists each accepted run atomically and imports equipment with individual `INSERT OR IGNORE` operations. Existing run IDs are skipped and invalid runs are counted. The whole workspace import is not one transaction. Browser workspace import retains its separate replacement/sanitization and working-set behavior; see §12.

## 7. Errors, edge cases, privacy, security
Zip extraction only reads known fixed names — never uses archive entry names for paths (no zip-slip); entry size limits (DB <= 2 GiB, JSON <= 5 MiB, decompression ratio guard 100:1). Dest path from dialog: require `.deckchek-backup`, refuse directory, refuse paths inside the live DB file. Low disk space: check free space >= 2x DB size first. WAL: online backup includes WAL content; no need to copy `-wal`. Locked/in-use DB: backup API retries on `SQLITE_BUSY` up to 5 times. Restore while capture running: blocked ("Stop capture first"). Backups contain device serials and notes (PII) and no audio; the dialog states backups are unencrypted. Restored settings JSON validated and size-limited before being written to localStorage. Power loss mid-restore: temp+rename ordering leaves either old or new; startup detects leftover `.partial`/`.bak` and offers recovery.

## 8. Test plan
Unit (JS): manifest shape validation, name suggestion, workspace payload mapping (v1, invalid version, duplicate ids), retention sort helper. Rust: restore of the committed v0.04 fixture (`tests/fixtures/db/v0.04.sql`, FS-00) upgrades to current schema with all rows intact; backup of a populated in-memory/temp DB yields valid zip with matching sha256; backup during concurrent writer thread is consistent (`integrity_check`); inspect rejects tampered file, bad zip, missing manifest, formatVersion 99, schema newer; restore of v1 DB migrates to current and preserves rows (extend `upgrades_a_version_1_database_without_losing_data`); failure injection (corrupt DB, forced migration error) leaves live DB byte-identical; zip-slip fixture with `../evil` entry ignored; retention keeps last N and never deletes manual. UI smoke: Data renders existing workspace actions and a separate browser venue-history card; archive export, preview, explicit import, reload and re-export retain complete saved records. Native workspace import keeps its existing dialog preview. Windows CI: run full backup/restore round trip on the Windows runner (path separators, rename-over-open-file behaviour, long paths). Manual: back up a profile containing PLX-CRSS12/SL-1200MK4 assets and Traktor Audio 8 DJ calibration, wipe `%APPDATA%\com.circuitdriftlabs.deckchek`, restore, verify runs, MIDI map for the DDJ, calibration status; restore on a second machine.

## 9. Definition of done
- [ ] AC-1..9 pass; round-trip CI on Windows; safety backup proven by failure test
- [ ] Docs: README data section, SPEC-07 data model update, privacy note
Rollout: automatic backups default Off for first release, backup/restore UI always on.

## 10. Dependencies, risks, open questions, effort
Depends on: FS-00 (`app_state`, zip/sha2 crates, dialog plugin, `userfiles.rs`, the DB connection gate `db::gate()` and the v0.04 fixture DB), FS-02 (log), existing `apply_migrations`. Risks: swapping a DB with open connections — mitigated by the FS-00 connection gate (`db::gate()`: an `RwLock` every command takes for read via `open_database`, restore takes for write; capture/monitor sessions are also refused during restore); localStorage-held settings cannot be read by Rust without JS handoff. Open: add password encryption (deferred). Resolved: raw sample data is not stored in the DB today (`capture.raw_audio_retained` defaults 0, audio files are never included). Effort: L (~28 agent-hours).

## 11. Research notes
- rusqlite backup module: https://docs.rs/rusqlite/latest/rusqlite/backup/index.html and mirrored source https://searchfox.org/comm-central/source/third_party/rust/rusqlite/src (snippet only): `Backup::new(&src,&mut dst)`, `step`, `progress`, `run_to_completion(pages, sleep, progress)`; needs two distinct connections; `VACUUM INTO` is a simpler alternative (adopted as optional fast path, UNKNOWN whether available in bundled SQLite version — verify >= 3.27).
- SQLite online backup: https://www.sqlite.org/backup.html (general knowledge; not opened).
- Existing code: `src-tauri/src/db.rs` (`MIGRATIONS`, `apply_migrations`), `app/export.js` (`parseWorkspaceJson` v1), `app/ui/persistence.js` (`importWorkspace`).


## 12. Browser venue-history archive (2026-11-18)

The Data screen offers three distinct persistence mechanisms. Their formats and
import behavior remain separate:

| Mechanism | Included content | Import behavior |
| --- | --- | --- |
| Existing workspace JSON, `version:1` | Equipment and diagnostic runs from the existing workspace | Browser import sanitizes runs and replaces the workspace arrays; its existing bounded working set and best-effort catalog mirroring remain unchanged. Desktop import adds accepted runs/equipment with the per-record behavior in §6. |
| Browser venue-history JSON, `format:"deckchek-venue-history"`, `formatVersion:1` | Every retained manual incident, original support observation and base comparison record; no duplicated expanded A/B observations inside comparisons | Validate and preview, then explicitly add missing immutable records. Exact saved duplicates cause no writes; the same ID with different saved values or persistence metadata blocks import. |
| Native `.deckchek-backup` | The existing complete SQLite snapshot, including current catalogs and incident/support history, plus the existing settings and other archive entries | Existing native inspect, confirmation, safety backup and restore workflow. This slice changes no native command, migration or backup format. |

The browser archive contains exactly `format`, `formatVersion`, `exportedAt`,
`incidents`, `supportObservations` and `supportComparisons`. Its UTF-8 file bound
is **32 MiB** and its combined record bound is **10,000**. Export reads complete
history stores, independent of the incident page/report limits and support
history limits. Exceeding a bound or encountering invalid stored evidence fails
the export; it does not return a shortened archive.

Validation reuses the existing saved-record and comparison rules while requiring
complete saved-value preservation. It retains IDs, recorded/occurrence/capture
times, original names and context, raw JSON text fields, calibration, numerical
evidence, uncertainty and reasons. It neither invokes ordinary save operations
nor reads current catalogs to reconstruct historical context. Every comparison
must carry its valid original observations in the archive. Incident IDs have
their own namespace; observations and comparisons share the support namespace.

Import preflights the complete archive and both target history stores before
writing. Invalid files, inconsistent graphs, conflicting IDs and corrupt targets
produce zero writes. Each subsequent synchronous append rechecks its ID; source
observations precede their comparisons. A storage write can fail after earlier
records have committed, so the UI reports completed, already-present and
remaining records. It keeps successful additions. Retry uses the retained file
while the panel remains alive; after a full reload, the operator reselects the
unchanged file to check and resume. There is no multi-key rollback or cross-tab
atomicity claim, and no saved evidence is pruned or overwritten.

File reads, previews and exports belong to their selected file and screen
lifecycle. A dispatched import retains its original submission across hide/show
and retry. The production UI renders selected filenames, conflicts and historical
names as text. Validation establishes structural/comparison consistency, not
recorder authenticity or physical qualification.

Editable venues, setups and support descriptions are outside this archive.
Imported history can be viewed with all venues selected even if its original
catalog entries no longer exist. A venue report still needs a matching current
venue ID; import does not create one. Current catalog portability remains a
separate implementation task.

Implementation: [archive model](../../app/venue-history-archive.js),
[Data panel](../../app/ui/workflows/venue-history-archive.js) and the narrow archive
operations in the existing incident/support stores. Acceptance cases are in
[model tests](../../tests/venue-history-archive.test.mjs),
[production UI tests](../../tests/venue-history-archive-ui.test.mjs) and
[browser smoke](../../tools/smoke/venue-history-archive.mjs). See
[the archive contract](../venue-history-archive.md) for detailed bounds and
recovery semantics, and the continuation reports for source-specific results.
