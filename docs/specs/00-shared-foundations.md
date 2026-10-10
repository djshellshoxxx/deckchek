# FS-00 — Shared foundations

> Status: reconciled 2026-10-10. Owns every piece that two or more feature specs (FS-01 … FS-33) need. Feature specs point here instead of re-specifying. Index: [00-INDEX](00-INDEX.md). Plan: [`docs/DEVELOPMENT-PLAN.md`](../DEVELOPMENT-PLAN.md). Migrations: `0003_app_state.sql` (M5), `0006_asset_usage.sql` (M6), `0013_photo_store.sql` (M7). Notation: `SPEC-NN` = `docs/SPEC-NN-*.md` (architecture); `FS-NN` = `docs/specs/NN-*.md` (feature).

## 1. Summary, goals, non-goals

Twenty feature specs were written in parallel and each re-invented the same infrastructure: a key/value table (FS-01/02/08), a hum meter (FS-10/15), a photo pipeline (FS-20/22/33), canonical JSON + SHA-256 (FS-20/30/33), QR codes (FS-20/30), an hours ledger (FS-12/23), a capped audio output (FS-01/11/15), long/streaming capture (FS-13/14/31), process listing (FS-10/11/12), save-file helpers (FS-02/03/08/20/32/33) and feature flags (all). FS-00 defines each exactly once, and also the repo scaffolding that lets parallel jobs merge without conflicts.

**Goals:** one implementation per shared concern, each with tests and a stable API; parallel feature jobs never edit the same lines; forward-only, crash-safe migrations; one feature-flag mechanism.
**Non-goals:** new user-facing features; changing existing DSP engines; network services.

## 2. Users & stories (developers and, indirectly, end users)

- AC-1 Given a new file `database/migrations/00NN_x.sql`, when `cargo build` runs, then it is applied by `apply_migrations` without editing `db.rs`; a test fails if two files share a number or a number is not 4 digits.
- AC-2 Given the process is killed after a migration's SQL commits, when the app restarts, then that migration is not re-applied (version row is written inside the same transaction).
- AC-3 Given the committed v0.04 fixture `tests/fixtures/db/v0.04.sql` (schema 1+2 with representative rows), when all migrations are applied, then row counts of every pre-existing table are unchanged, `PRAGMA integrity_check` = `ok` and `PRAGMA foreign_key_check` returns no rows.
- AC-4 Given `features.<name>` is off, then the feature's nav entry, commands' UI entry points and startup hooks are absent, and toggling it in Options > Advanced > "Experimental features" takes effect after reload.
- AC-5 Given a capture is running (any feature), when another feature requests capture, then it gets error code `CAPTURE_BUSY` with `{holder:"<feature>", since}` and the UI offers "Stop <holder> and continue" — never two cpal input streams on one device from DeckChek.
- AC-6 Given any request to play audio through `audio_out`, then no output sample exceeds the absolute cap (-12 dBFS) or the per-call cap, level changes ramp over >= 10 ms, and `audio_stop` reaches silence within 50 ms (unit-tested on rendered buffers).
- AC-7 Given the same object in JS and Rust, then `canonicalJson` produces byte-identical output for every vector in `tests/fixtures/canonical-vectors.json`, and objects containing non-integer numbers, NaN, Infinity or lone surrogates are rejected.
- AC-8 Given a photo (png/jpg/webp, <= 8 MB), when attached, then the stored file is a re-encoded JPEG <= 1600 px long edge with no EXIF/APP1 segment, named by its SHA-256, deduplicated, and linked to its owner.
- AC-9 Given a save-path from a dialog, then `userfiles` refuses relative paths, directories, wrong extensions, Windows reserved names (`CON`, `NUL`, `COM1`…), trailing dots/spaces and, for folder writes, any `..`, absolute, drive-letter, UNC or symlinked entry.

## 3. UX

- Options > Advanced > **Experimental features**: list of `features.*` flags with name, one-line description, milestone, default, toggle; "Reset to defaults". Off-by-default features show "Experimental" chip in their screens.
- Shared **capture-busy** dialog: "Live monitor is using the audio input. Stop it and run this check?" [Stop and continue] [Cancel].
- Shared **output-safety** copy for any feature that plays sound: "Turn monitors and headphones down first. DeckChek never plays louder than -12 dBFS." STOP button always first in tab order while audio plays; Esc stops.
- Shared **save** flow: OS save dialog (dialog plugin) → toast "Saved" with [Open] [Show in folder] (FS-07 `open_path`/`reveal_path`).
- Browser mode: every shared service has a localStorage or Blob-download fallback with the same API shape (pattern of `app/catalog-store.js`; key `deckchek.<area>.v1`).

## 4. Architecture

### 4.1 Hotspot scaffolding (job M5-F0-scaffold, first job of M5)
Files every feature touches get **named anchor blocks** created up front, so each job edits only its own block and git merges cleanly:
- `src-tauri/src/lib.rs`: one `// [FS-NN] mods` line group and one `// [FS-NN] handlers` group per spec inside `generate_handler![…]`, plus `// [FS-NN] setup` inside `.setup(…)`.
- `app/app.js`: `// [FS-NN] screens` import + registration blocks.
- `app/index.html`: per-feature `<link rel="stylesheet" href="./styles/<feature>.css">` slots; feature CSS lives in `app/styles/<feature>.css` (new directory), not in `styles.css`.
- `app/ui/workflows/definitions.js`: per-feature anchor in the `WORKFLOWS` list.
- `app/ui/shell.js`: per-feature anchors in the Options/Help menus and in `initShell` start-up hooks (FS-01 auto-start, FS-07 link interceptor, FS-23 reminders banner, FS-31 tray state).
- `src-tauri/Cargo.toml`: dependencies are only added by a milestone's foundation job (wave 0), never by feature jobs, so `Cargo.lock` never conflicts inside a wave.
Rule: a feature job may add lines only inside its own anchors; anything else in a hotspot file is a foundation change.

### 4.2 Migrations and DB access (job M5-F0-db)
- `src-tauri/build.rs` scans `database/migrations/*.sql`, validates names `^\d{4}_[a-z0-9_]+\.sql$`, and generates `$OUT_DIR/migrations.rs` containing `pub const MIGRATIONS: &[(i64, &str)] = &[(1, include_str!(…)), …]`; `db.rs` does `include!(concat!(env!("OUT_DIR"), "/migrations.rs"))`. `cargo:rerun-if-changed=../database/migrations`.
- `apply_migrations` writes the `schema_migration` row **inside** the migration transaction (today it is written after `COMMIT`, so a crash in between would re-run a non-idempotent `ALTER TABLE ADD COLUMN`).
- Migration files must not contain `BEGIN`/`COMMIT` (the runner wraps them) — enforced by a test that greps each file.
- Connection gate: `db::gate()` returns a process-wide `RwLock<()>`; `open_database` takes a read guard held by the returned wrapper; FS-08 restore takes the write guard. No other behaviour changes.
- Fixture: `tests/fixtures/db/v0.04.sql` — a text dump (reviewable) made by applying 0001+0002 and inserting representative rows (2 manufacturers, 4 products, 3 assets incl. one auto-created, 1 venue/booth/position, 2 sessions with captures and measurements, 1 device_profile + 3 device_test_result, 1 asset_midi_map, 1 maintenance_event). Loaded by Rust tests via `execute_batch`.

### 4.3 Platform plugins and crates (job M5-F0-platform)
Added once, pinned to exact versions in `Cargo.lock` (licences: all MIT and/or Apache-2.0):
`tauri-plugin-dialog` 2.x, `tauri-plugin-opener` 2.x (FS-07 owns the policy), `zip` 2.x (`default-features=false, features=["deflate"]`), `sha2` 0.10, `rusqlite` features `["bundled","backup"]`, and for FS-03 `webview2-com` + `windows` at the versions already in wry's dependency tree (cfg(windows)). New `src-tauri/capabilities/default.json` (none exists today): `core:default`, `dialog:allow-save`, `dialog:allow-open`, opener permissions per FS-07 (no `opener:allow-open-url` wildcard). CSP unchanged.

### 4.4 `userfiles.rs` (job M5-F0-platform)
- `validate_save_path(path, allowed_exts: &[&str]) -> Result<PathBuf, UserFileError>`; `record_written(path)` (feeds FS-07 `WrittenPaths`); `sanitize_file_stem(s) -> String` (`[^A-Za-z0-9._ -]` → `_`, max 80, reserved names suffixed `_`).
- Commands: `userfiles_write_text(path, content, allowedExt) -> {path, bytes}`; `userfiles_write_folder(dir, files:[{relPath, text?|base64?}], allowedExts) -> {written, path}` (FS-33; any FS that exports folders).
- JS `app/userfiles.js`: `saveTextFile({suggestedName, content, ext})` (dialog + write, or Blob download in browser mode).

### 4.5 `app_state` (job M5-F0-db)
Rust commands `app_state_get(key) -> {value, updatedAt}|null`, `app_state_set(key, value) -> ()`, `app_state_delete(key)`; value JSON <= 256 KiB; keys `^[a-z][a-z0-9_.]{0,63}$`. JS `app/app-state.js` with localStorage fallback `deckchek.appstate.v1`. Known keys: `wizard` (FS-01), `backup` (FS-08), `monitor` (FS-31), `features` is NOT here (see 4.14). Rule: UI preferences stay in `deckchek.ui.v1` (localStorage); state Rust must read, or that must survive a WebView reset, goes to `app_state`.

### 4.6 `app/hum.js` (job M6-F1-dsp, M6 wave 0)
Single signature used by FS-10, FS-15 (and optionally FS-31):
`humMeasure(samples, sampleRate, {mains:'auto'|50|60='auto', harmonics=8, windowSec}) -> {mainsHz, fundamentalDbfs, harmonics:[{n,hz,dbfs}], totalDbfs, floorDbfs, humToFloorDb, oddEvenRatio, uncertaintyDb}`; `detectMains(samples, sampleRate) -> {mainsHz, confidence}`; `removeTone(samples, sampleRate, hz) -> Float32Array` (fitTone residual, used to measure hum under a timecode carrier). Built on `fitTone` (`app/calibration.js`) and consistent with `humMetrics` (`app/core.js`, whose output must not change).

### 4.7 Capture lease and streaming capture (jobs M6-F1-capture, M6-F1-capture)
- `capture::CaptureLease` in managed state: `capture_lease_acquire(holder, deviceName) -> {leaseId}|CAPTURE_BUSY`, `capture_lease_release(leaseId)`, `capture_lease_status()`. `start_live_capture` and every new capture path acquire it internally (existing callers unchanged).
- `start_stream_capture(deviceName?, sampleRate?, blockMs=1000, channel: tauri::ipc::Channel<Block>)` → stereo f32 blocks `{seq, sampleRate, left, right, quality}` over the Channel (not events: binary-friendly, ordered); `stop_stream_capture()`. Backpressure: if the webview lags > 5 blocks, oldest blocks are dropped and counted in `quality.droppedBlocks`. Used by FS-13 and FS-31.
- **Input pairs** (job M6-capture-pairs; for multichannel interfaces such as Traktor Audio 8 DJ, DJM-A9 USB sends, Xone:23C). Inputs are named stereo pairs `1-2`, `3-4`, ... (1-based); an odd channel count ends with a mono pair named after its last channel (`5`), analysed as L = R. Pair object: `{label, first, second, mono}`.
  - `list_native_audio_inputs()` → each device adds `maxChannels`, `defaultChannels` and `pairs` (over `maxChannels`). JS `listInputDevices()` passes them through (older backends: `maxChannels:null`, `pairs:[1-2]`).
  - Selection: optional `pairs` argument on `start_live_capture`, `start_stream_capture` and `capture_native_audio` — a list of `3`, `"3-4"` or `{first:3}` (pair objects from the device list work as-is), max 32, no duplicates. Absent/empty = the first pair, i.e. exactly the old behaviour and argument shape. The device is opened with enough channels (default config whenever it is wide enough). Malformed selections and out-of-range pairs fail with a plain-string error naming the device, its channel count and its pairs (e.g. `Input pair 9-10 is not available on Traktor Audio 8 DJ: it has 8 input channels (pairs 1-2, 3-4, 5-6, 7-8).`); the lease is released. JS mirrors the rules in `app/capture.js` (`inputPairs`, `parsePairSelection`, `resolvePairs` for UI preflight) and `classifyCaptureError` maps them to kind `pair`.
  - Results: `LiveCaptureInfo`/`StreamInfo` add `pairs` (selection order). Live/bounded payloads keep `left`/`right` = first pair and add `pairs` + `extraPairs:[{label, first, second, mono, left, right}]` (omitted for one pair); JS `payloadToAudio` returns `audio.pairs = [{pair, left, right}]`. `quality.pairs` = per-pair clip counts. `capture-levels` events keep the first pair at top level and add `pairs:[{label, first, peakL, peakR, rmsL, rmsR, clipL, clipR}]`.
  - Stream blocks: one pair = wire version 1 (unchanged bytes); several pairs = version 2 with the pair count (u32) at offset 28 and `left, right` per pair. JS `decodeStreamBlock` returns `pairs:[{left,right}]` (always), and `startStreamSession({pairs})` labels each `block.pairs[i].pair`. One stream can thus check deck A and deck B together.
  - `capture_native_audio(deviceName?, durationSec, pairs?, holder?)` now holds the capture lease (kind `bounded`, default holder `native-capture`); `capture_preempt` cancels it (error text "The capture was stopped because another DeckChek feature needed the audio input.", JS kind `preempted`). JS: `captureNative` (bridge) and `captureClip` (normalised result + `CaptureBusyError`).
  - Consumers (FS-10 pre-gig `inputPairUnsupported`, FS-13 wear map, FS-11 latency) adopt pairs in their own jobs.

### 4.8 Shared hours ledger (job M6-F1-usage)
`asset_usage` table (§5.3) + commands `usage_add`, `usage_list(assetId,{since?})`, `usage_delete`, `usage_confirm(id)`. JS `app/usage-hours.js`: `mergeIntervals(entries)` (priority manual > djlog > deckchek > import; overlapping lower-priority time removed), `totalHours(entries,{since})`, `proposeFromSessions(sessions, assetId, {capHours=12})`. Used by FS-12 (stylus life, baseline = last `stylus_replaced` event) and FS-23 (hours-based reminders).

### 4.9 `audio_out.rs` (job M6-F1-audio-out)
cpal output engine (first Rust output path — today output is WebAudio `playStereo`): `list_native_audio_outputs()`, `audio_play_buffer(device?, {sampleRate,left,right}, {levelDbfs, capDbfs, loop})`, `audio_play_tone(device?, {type:'sine'|'pinkband'|'chirp', freqHz?, levelDbfs, capDbfs, rampMs})`, `audio_set_level(handle, levelDbfs)`, `audio_stop(handle)`. Hard absolute cap `ABS_MAX_DBFS = -12.0` applied in the callback after a per-sample limiter; ramps >= 10 ms; 60 s inactivity auto-mute for tone mode; all streams stopped on window close/`RunEvent::Exit`. Used by FS-11 (duplex latency), FS-15 (feedback step); JS bridge `app/audio-out.js` (incl. `clampLevelDbfs`). FS-01 (M5, before this engine exists) keeps WebAudio `playStereo` for its tone and clamps to -12 dBFS locally.

### 4.10 `processes.rs` (job M6-F1-usage)
`dj_processes() -> {supported, apps:[{app, exe, pid, running}]}` and `top_cpu(n) -> [{exe, cpuPct}]` from `tasklist /FO CSV /NH` (and `Get-Counter` for CPU) via `system_check::run_with_timeout` and `is_dj_program`. Exe names only, never command lines. Used by FS-10, FS-11, FS-12.

### 4.11 Photo store (job M7-F2-photo, M7 wave 0)
- JS `app/photo-store.js`: `preparePhoto(file) -> {bytes(jpeg), width, height, sha256}` — decode via `createImageBitmap`, draw to canvas <= 1600 px long edge, `toBlob('image/jpeg', 0.82)` (re-encode strips EXIF/GPS), reject sources > 8 MB or failing magic-byte sniff.
- Rust `photo.rs`: `photo_attach({ownerKind:'asset'|'service_job'|'certificate', ownerId, bytesB64, caption?, stage?, isPrimary?}) -> {photoId, sha256}` (re-checks JPEG magic, scans for and rejects APP1/EXIF markers, size <= 2 MB after processing, writes `<app_data_dir>/photos/<sha256>.jpg` if absent), `photo_list(ownerKind, ownerId)`, `photo_unlink(linkId)` (file deleted when no links remain), `photo_read(photoId) -> bytesB64`.
- Extends FS-08 backup with the `photos/` prefix (see FS-08 §5).

### 4.12 Canonical JSON, SHA-256, QR (job M7-F2-canonical)
- `app/canonical-json.js` `canonicalJson(value) -> string` and `src-tauri/src/canonical.rs` `canonical_json(&Value) -> Result<String>`; rules §6.1.
- `app/sha256.js`: `sha256Hex(bytesOrString)` using `crypto.subtle` when available, pure-JS fallback (~3 KB) for `file://` pages and old WebViews. Rust uses `sha2`.
- `app/vendor/qr.js`: one vendored MIT QR generator (candidate `qrcode-generator` by Kazuhiko Arase, MIT; exact version and licence text pinned at vendoring, header comment kept). Wrapper `qrSvg(text, {ecc:'L'|'M'}) -> svg string`. Used by FS-20 (desktop) and FS-30 (copied to `mobile/vendor/`).
- Shared vectors `tests/fixtures/canonical-vectors.json` (input, canonical string, sha256) consumed by JS and Rust tests.

### 4.13 `app/metric-compat.js` (job M7-F2-canonical)
`methodCompatible(a:{key,version}, b:{key,version}, registry) -> boolean` (equal key and unit, equal version or mutually listed in `analysis_method.parameters_json.compat`), `combinedUncertainty(uA,uB)` (RSS), `deltaVerdict(delta, u, {k:2, higherIsBetter})`. Used by FS-21 and FS-22.

### 4.14 Feature registry (job M5-F0-scaffold)
`app/features.js`: `FEATURES = {setupWizard:{default:true, milestone:'M5', spec:'FS-01'}, …}`, `isEnabled(name)`, `setEnabled(name, on)` persisted in `deckchek.ui.v1.features`. Rust never gates on flags (commands always exist; flags only hide UI). Flags: `setupWizard`, `diagnosticsBundle`, `pdfExport`, `testMedia`, `backup`, `pregig`, `latencyTuner`, `stylusWear`, `wearMap`, `scratchTest`, `humHunter`, `feedbackStep`, `certificates`, `population`, `packs`, `service`, `fleet`, `phoneImport`, `liveMonitor`, `mapperStudio`, `gearLedger`. A test asserts every `features.*` mentioned in `docs/specs/*.md` exists in `FEATURES`.

### 4.15 Conventions for ids, profiles and catalogs
- **Stable product key** across installs = device profile id (`device_profile.id`, e.g. `pioneer-plx-crss12`); `product.id` and `asset.id` are local UUIDs (`db::new_id`/`catalog-store.newId`). Packs (FS-21), certificates (FS-20), wizard (FS-01) and ledgers (FS-33) store the profile id as `productKey`.
- **Catalog JSON pattern**: shipped JSON in `app/<area>/profiles/*.json` + generated `index.json` via `tools/build-<area>-index.mjs --check` in CI; Rust `<area>_sync` upserts by id with a `version` column, retires removed built-ins, never touches user rows (FS-06 media follows `devices.rs`).
- **Timecode facts** single source: `app/timecode.js` `TIMECODE_FORMATS` (after job `M5-tc-facts`), each entry with `carrierHz`, `atRpm`, `phaseSign` (+1, or -1 for xwax `SWITCH_PHASE`), `primary` (`right`, or `left` for xwax `SWITCH_PRIMARY`), `sides:[{label, lengthCycles, durationSec}]`, `xwaxId`, `source`, `confidence`. Device profiles' `timecode.formats` reference these names and must not contradict them (CI check). Direction: xwax reads forward play when the primary channel leads the secondary by a quarter cycle, inverted by `SWITCH_PHASE`; with `tc_phase_deg` = right minus left, forward <=> `tc_phase_deg * directionSign(format) > 0`, `directionSign = (primary==='left' ? -1 : 1) * phaseSign` (Traktor MK1: both switches, they cancel, so the right channel leads as on Serato). Use `directionSign` / `directionFromPhase` from `app/timecode.js`, never `phaseSign` alone (M6-datafixes; `scratch.js` and `wear-map.js` still use `phaseSign` alone and read MK1 reversed).
- **Test media** (FS-06) feed expected values for FS-10/11/12/13/14 test forms through `createMediaPicker`; none of those specs hard-codes reference frequencies.
- **Printable reports**: FS-03 `registerPrintableKind`. **External links / file reveal**: FS-07 only.

## 5. Data model

### 5.1 `0003_app_state.sql`
```sql
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```
### 5.2 Migration register (forward-only; reserved numbers)
| # | File | Spec | Milestone | Depends on |
|---|---|---|---|---|
| 0001 | initial | existing | v0.0.2 | — |
| 0002 | device_library | existing | v0.0.3 | 0001 |
| 0003 | app_state | FS-00 | M5 | — |
| 0004 | test_media | FS-06 | M5 | 0002 |
| 0005 | backup_log | FS-08 | M5 | — |
| 0006 | asset_usage | FS-00 | M6 | 0001 |
| 0007 | latency_tuner | FS-11 | M6 | — |
| 0008 | pregig | FS-10 | M6 | — |
| 0009 | stylus_wear | FS-12 | M6 | 0006 |
| 0010 | wear_map | FS-13 | M6 | — |
| 0011 | scratch_stress | FS-14 | M6 | — |
| 0012 | hum_feedback | FS-15 | M6 | — |
| 0013 | photo_store | FS-00 | M7 | — |
| 0014 | certificate | FS-20 | M7 | 0002 |
| 0015 | unit_population | FS-21 | M7 | — |
| 0016 | service_worksheets | FS-22 | M7 | 0002 |
| 0017 | fleet_dashboard | FS-23 | M7 | — |
| 0018 | session_origin | FS-30 | M8 | — |
| 0019 | monitor_log | FS-31 | M8 | — |
| 0020 | mapper_models | FS-32 | M8 | 0002 |
| 0021 | gear_ledger | FS-33 | M8 | 0013, 0014 |

The runner applies any unrecorded version in ascending order, so a migration merged slightly out of order still applies on dev databases; a release tag must contain a gap-free prefix (CI check on tag builds). Numbers are never reused or renumbered after merge.

### 5.3 `0006_asset_usage.sql`
```sql
CREATE TABLE IF NOT EXISTS asset_usage (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  kind TEXT NOT NULL DEFAULT 'play' CHECK (kind IN ('play','bench')),
  started_at TEXT NOT NULL,
  hours REAL NOT NULL CHECK (hours >= 0 AND hours <= 24),
  source TEXT NOT NULL CHECK (source IN ('manual','djlog','deckchek','import')),
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  note TEXT,
  confirmed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asset_usage_asset ON asset_usage(asset_id, started_at);
```
### 5.4 `0013_photo_store.sql`
```sql
CREATE TABLE IF NOT EXISTS photo (
  id TEXT PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE, mime TEXT NOT NULL CHECK (mime = 'image/jpeg'),
  width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS photo_link (
  id TEXT PRIMARY KEY, photo_id TEXT NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('asset','service_job','certificate')),
  owner_id TEXT NOT NULL, caption TEXT, alt_text TEXT, stage TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  UNIQUE(photo_id, owner_kind, owner_id));
CREATE INDEX IF NOT EXISTS idx_photo_link_owner ON photo_link(owner_kind, owner_id, sort);
```
(`owner_id` is polymorphic, so no FK; owners delete their links in the same transaction.)

## 6. Algorithms / rules

6.1 **Canonical JSON** (RFC 8785-inspired, deliberately stricter): objects with keys sorted by UTF-16 code units; arrays in order; strings JSON-escaped per RFC 8785 (only `"`, `\`, control chars escaped; `\u00XX` lowercase hex); `true/false/null`; numbers **only** safe integers (|n| <= 2^53-1) — any other number is an error, so producers emit measured values as decimal strings with fixed significant digits (e.g. `"0.123"`). No whitespace. UTF-8 output. This removes the JS/Rust float-formatting risk flagged in FS-20.
6.2 **Capture lease**: one lease per process; acquire is non-blocking; lease auto-released when its stream ends or errors; status exposes holder for UI.
6.3 **Output safety**: per-sample `y = clamp(x * gain, ±10^(cap/20))` with `cap = min(callCap, ABS_MAX_DBFS)`; gain changes interpolated linearly per sample over the ramp.
6.4 **Usage merge**: sort by start; for overlaps keep the higher-priority source's span, trim others; totals sum merged spans.
6.5 **Photo**: as §4.11; sha256 over the final JPEG bytes.

## 7. Errors, edge cases, privacy, security
All SQL parameterised. `userfiles` rejects traversal and reserved names (§2 AC-9). Photo store never trusts file names or extensions. Canonical/sha code has no network. `app_state` values size-capped. Audio output hard cap in Rust. Process listing returns exe names only. Logs (FS-02) must not record full paths of user files (host-only for URLs, file names only for paths). No telemetry anywhere.

## 8. Test plan
- Rust: build-script migration discovery (dup/invalid names fail), transaction-scoped version row (simulate failure after SQL), no BEGIN/COMMIT in files, v0.04 fixture upgrade (AC-3), `app_state` round-trip and caps, lease busy/release, `audio_out` limiter on rendered buffers (adversarial input never > cap; stop reaches 0 within 50 ms of samples), `userfiles` path matrix (`..\`, `C:\`, `\\server\share`, `CON`, `nul.txt`, trailing dot, symlink), photo APP1 rejection, canonical vectors, usage merge.
- JS: canonical vectors (same file), sha256 vectors (empty, "abc", 1 MB), `humMeasure` synthetic 50/60 Hz + harmonics within 0.3 dB, `usage-hours` merge/priority, `metric-compat` matrix, features registry vs specs grep test.
- Contract tests: `tests/contracts/*.json` — for each shared command a request/response example validated by both a Rust test (serde round-trip of the example) and a JS bridge test (bridge passes exactly those field names) so camelCase/snake_case drift is caught.
- Synthetic signals: `tests/fixtures/signals.mjs` — `quadratureTimecode({carrierHz, phaseSign, seconds, velocityProfile, snrDb, dropouts})` (its `phaseSign` is the sign of right-minus-left phase on forward play, i.e. pass `directionSign(format)`), `humMix({mainsHz, harmonics})`, `chirpLoop({delayMs})`, deterministic seeded noise; reused by FS-10/11/13/14/15/31 tests.
- UI smoke: Experimental-features panel toggles a flag and the nav entry appears after reload; capture-busy dialog with mocked invoke.

## 9. Definition of done
All §2 ACs green in CI (Linux + Windows); fixtures committed; anchors present; `docs/specs/00-INDEX.md` and `IMPLEMENTATION-STATUS.md` updated; every feature spec referencing FS-00 compiles against the delivered API names (grep check in review).

## 10. Dependencies, risks, open questions, effort
Jobs: M5 wave 0 — `M5-F0-scaffold` (anchors, feature registry), `M5-F0-db` (build.rs migrations, runner fix, gate, `app_state`, v0.04 fixture), `M5-F0-platform` (plugins, crates, capability file, `userfiles`). M6 wave 0 — `M6-F1-dsp` (hum.js, signals fixture), `M6-F1-capture` (lease + streaming), `M6-F1-audio-out`, `M6-F1-usage` (ledger + processes). M7 wave 0 — `M7-F2-photo`, `M7-F2-canonical` (canonical/sha/QR/metric-compat). Risks: build.rs `include_str!` path handling on Windows (test on windows-rust-tests); `ipc::Channel` throughput for 48 kHz stereo f32 (≈ 384 KB/s; spike first); WebView canvas JPEG encoder availability (WebView2 supports it). Open: QR library final pick. Effort: XL in total (~60 agent-hours) split as above.

## 11. Research notes
- Repo facts verified 2026-10-10: `src-tauri/src/db.rs` (`MIGRATIONS` hand-listed; version row inserted after `COMMIT`), `src-tauri/src/devices.rs` (sync auto-creates "My <model>" assets), no `src-tauri/capabilities/` directory, CSP in `tauri.conf.json`, no Rust audio output (`audio.rs`/`capture.rs` are input-only), `app/ui/audio-io.js` `playStereo` (WebAudio), `app/core.js` `humMetrics`, `src-tauri/src/system_check.rs` `run_with_timeout`/`is_dj_program`, CI `.github/workflows/test.yml` does not run `tools/ui-smoke.mjs`.
- Timecode facts: Mixxx `lib/xwax/timecoder.c` / `timecoder.h` (commit b02e84aa, 2026-10-08), see FS-06 §6 table. Mixxx mapping format: `res/controllers/*.midi.xml`, see FS-32 §5. Both GPL-2.0-or-later: facts only, no code or files copied into this proprietary repo.
- RFC 8785 (JCS) and RFC 8032 (Ed25519) from knowledge, not re-opened.
