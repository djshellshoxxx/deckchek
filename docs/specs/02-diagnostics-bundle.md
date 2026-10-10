# Spec 02 — Crash capture and diagnostics bundle

## 1. Summary, goals, non-goals
DeckChek records Rust panics and JS errors to a local rotating log, detects an unclean exit on next start and offers a user-controlled "Create diagnostics bundle" zip (no audio, optional PII redaction). Nothing is ever uploaded; the user may open a prefilled GitHub new-issue URL containing a text summary only.

**Goals:** actionable bug reports from non-technical users; privacy by construction; works offline. **Non-goals:** automatic telemetry or crash upload (Sentry etc.); minidump collection; remote log shipping; capturing audio or waveforms.

## 2. Users & user stories
- AC-1 Given a Rust panic on any thread, then a line with timestamp, thread, location, message and backtrace is appended to `deckchek.log` before the process exits and a `crash.marker` file exists.
- AC-2 Given an uncaught JS error or unhandled promise rejection, then the frontend invokes `log_client_error` and a `ERROR js` line is written (rate limited to 20/min).
- AC-3 Given a crash marker on startup, then a dialog "DeckChek closed unexpectedly" offers Create diagnostics bundle / Dismiss; the marker is cleared after either choice.
- AC-4 Given a normal quit, then `crash.marker` is removed on the `RunEvent::Exit` path; a marker is written at startup and removed at clean exit (so kills/power loss are also detected).
- AC-5 Given "Create diagnostics bundle", then a save dialog proposes `deckchek-diagnostics-YYYYMMDD-HHmm.zip` and the written zip contains only the files listed in section 5.
- AC-6 Given "Redact personal info" is on (default ON), then Windows username, user profile paths, machine name and device serials do not appear in any bundle file (verified by unit test against seeded values).
- AC-7 Given the user chooses "Report on GitHub", then the default browser opens `https://github.com/<owner>/deckchek/issues/new?title=...&body=...` with body < 6000 chars of summary text and no attachments; the user is told to drag the zip in manually.
- AC-8 Given logs exceed 5 files x 1 MiB, then the oldest is deleted.

## 3. UX
Entry points: Options > Support > "Create diagnostics bundle", "Open log folder", Help menu; startup crash prompt; footer link in error toasts ("Details"). Dialog flow: (1) Preview — shows what is included (checklist with sizes), toggle "Redact personal info (recommended)", toggle "Include last N runs summary" (N=10, off includes only the latest), collapsible "View summary text". (2) Create — progress ("Collecting logs… Zipping…"). (3) Success — "Saved to <path>" with Show in folder, Copy path, Report on GitHub. States: empty (no logs: bundle still created with a note), loading, success, partial (a section failed: listed under "Not included: System Health (scan unsupported)"), error (disk full / save cancelled -> silent, write failure -> message with Retry), offline (all features local; only the GitHub button needs network and falls back to Copy link), unsupported (browser mode: build the zip via JS Blob download, containing settings and workspace summary only; no logs). Copy: "DeckChek closed unexpectedly. A diagnostics bundle helps us fix it. It contains no audio and nothing is sent automatically." Shortcuts: Ctrl+Shift+D opens the dialog; Enter creates. A11y: progress is `role=progressbar` with text; dialog focus-trapped; success announced via `announce()`.

## 4. Architecture
**Plugin research (Tauri 2):** `tauri-plugin-dialog` (MIT/Apache-2.0) — use for the save dialog (`save()`); needs `dialog:allow-save` capability. `tauri-plugin-opener` — use for GitHub URL (see Spec 07). `tauri-plugin-fs` — NOT needed: Rust writes the zip directly to the path returned by the dialog, keeping a minimal JS fs scope. `tauri-plugin-log` (wraps `log`+`fern`/`tauri-plugin-log` with rotation options) — acceptable but adds JS bridge and a capability; chosen decision: hand-roll a tiny logger (~150 lines) using the `log` crate facade only if already transitive, otherwise plain std: gives exact control of redaction, marker and rotation and avoids a second logging model (UNKNOWN whether plugin-log's `RotationStrategy::KeepSome(n)` size limits suit; needs verification). Crate `zip` 2.x (MIT) with `default-features=false, features=["deflate"]`. `chrono` is avoided: use `std::time` + existing `now_iso`.

New Rust: `src-tauri/src/diagnostics.rs`:
- `init(app)` called from `lib.rs` `setup`: create `logs` dir (`app.path().app_log_dir()` which on Windows resolves under `%APPDATA%\com.circuitdriftlabs.deckchek\logs`), install `std::panic::set_hook` (chain previous), write marker.
- `#[tauri::command] log_client_error(entry: {kind:"error"|"unhandledrejection", message, source, line, col, stack?, screen?}) -> ()`
- `diagnostics_status() -> { crashedLastRun: bool, markerAt: string|null, logDir: string, logFiles: [{name,sizeBytes,modifiedAt}] }`
- `diagnostics_ack_crash() -> ()`
- `diagnostics_preview(opts:{redact:bool,runCount:u32}) -> { summaryText: string, parts: [{name,sizeBytes,status:"ok"|"skipped"|"error",note?}] }`
- `diagnostics_create_bundle(destPath: string, opts:{redact,runCount}) -> { path, sizeBytes, parts:[...] }`
- `diagnostics_open_log_dir()` (via opener `reveal_item_in_dir`).
New JS: `app/diagnostics-bundle.js` (pure: `redactText(text, ctx)`, `buildSummaryText(info)`, `buildIssueUrl(summary, repo)`, `installClientErrorHooks(invoke)`), `app/ui/screens/support-dialog.js` (`openDiagnosticsDialog()`); hooks installed in `app/app.js` before UI init. Changes: `Cargo.toml` (`zip`, `tauri-plugin-dialog`, `tauri-plugin-opener`), `lib.rs` (plugins, handlers, `setup`), `src-tauri/capabilities/default.json` (`dialog:allow-save`, opener perms), CSP unchanged. Name clash note: existing `app/diagnostics.js` is the measurement engine; the new module is intentionally `diagnostics-bundle.js`.

## 5. Data model
Log line format (UTF-8, LF): `2026-10-10T12:34:56.789Z LEVEL target [thread] message`. Files `deckchek.log`, `deckchek.1.log`…`deckchek.4.log` (rotate at 1 MiB, keep 5). `crash.marker` JSON: `{"startedAt":ISO,"pid":n,"appVersion":"0.0.4","lastPanic":null|"..."}`.
Bundle zip layout (`manifest.json` first):
```
manifest.json      {bundleVersion:1, createdAt, appVersion, redacted:bool, parts:[{name,sha256,bytes}]}
summary.txt        human-readable summary (same text used for GitHub body)
system.json       {os:{name,version,arch}, webview2Version, locale, cpuCount, memoryMb}
settings.json      UI settings + feature flags (device names kept, paths redacted)
schema.json        {schemaVersion: max(schema_migration.version<1000), applied:[…]}
runs-summary.json  last N runs: id,test,startedAt,score,status,findings titles (no raw samples)
system-health.json summarizeFindings output + finding titles/ids
logs/…             last 5 log files
```
Migration `NNNN_diagnostics_events.sql` optional: none required. Version rules: unknown `bundleVersion` is only relevant to future readers; additive fields only.

## 6. Algorithms
Redaction: build a context of literals (username from `%USERNAME%`, `%USERPROFILE%`, computer name, serial numbers from `asset.serial_number`, product serial patterns) and apply: (1) replace exact literals case-insensitively with `<user>`, `<profile>`, `<host>`, `<serial>`; (2) regex `[A-Za-z]:\\Users\\[^\\\s"']+` -> `C:\Users\<user>`; (3) serial-looking tokens `\b[A-Z0-9]{8,}\b` adjacent to "serial"/"S/N" -> `<serial>`; (4) email regex -> `<email>`. Redaction is applied to every text part before zipping, including panic backtraces. Redaction is best effort; the dialog says so. Size caps: bundle <= 20 MiB, logs capped to 2 MiB total.

## 7. Errors, edge cases, privacy, security
Panic hook must not panic or allocate unbounded memory; writes via pre-opened file handle behind `Mutex` using `try_lock`. Hook recursion guard. Log writes failing are ignored. Save path comes from the OS dialog and is used only for create-new `.zip` (reject existing directories, require `.zip` extension, canonicalize parent). Zip entry names are fixed constants (no user-supplied names -> no zip-slip). The JS error payload is length-capped (4 KiB) and sanitized for control chars (log injection). GitHub URL: URL-encode, cap body, only text summary, host fixed to `github.com`. No audio samples ever included; test asserts bundle contains no `.wav`/`.f32`. Data leaves the machine only if the user manually attaches the file.

## 8. Test plan
Unit (JS): redaction cases (username in path, case differences, serials, emails, unicode usernames), `buildIssueUrl` length cap and encoding, rate limiter. Rust: panic hook writes line (use `std::panic::catch_unwind` + thread), rotation at size boundary keeps 5, marker lifecycle (create, stale detect, clear), bundle contains exactly the manifest parts and sha256 matches, zip opens with `zip::ZipArchive`, no `..` entries, bundle with missing DB still builds. UI smoke: open dialog, toggle redact, summary preview visible, browser mode downloads a file. Windows CI: run the bundle command against a temp dir and verify zip with the `zip` crate; check log dir under `%APPDATA%`. Manual: force a panic via a hidden debug command (`--debug-crash`) on the DJM-A9 session, restart, confirm prompt; attach zip to test issue; verify no username present (`findstr`).

## 9. Definition of done
- [ ] AC-1..8 verified; fuzz test on redaction
- [ ] Capability file minimal; CSP unchanged
- [ ] Docs: README support section, SPEC-17 operational quality update, privacy statement
Rollout: always on; `diagnostics.verboseLog` setting default off.

## 10. Dependencies, risks, open questions, effort
Depends on: Spec 07 (opener allowlist), Spec 08 (shares zip crate and `app_state`), System Health. Risks: Windows aborts on panic=abort builds (do not set `panic="abort"`); WebView2 crashes are not visible to the Rust hook (only marker catches them). Open: GitHub repo owner/name placeholder — UNKNOWN, needs confirming; should bundles include `get_run` raw JSON? (default no). Effort: L (~20 agent-hours).

## 11. Research notes
- Tauri dialog plugin: https://v2.tauri.app/plugin/dialog/ (known from docs; not re-opened this session).
- Tauri opener plugin: https://v2.tauri.app/plugin/opener/ (search snippet: default permission set allows mailto/tel/http/https opening; scopes in capabilities).
- Tauri logging plugin: https://v2.tauri.app/plugin/logging/ (not opened; rotation behaviour UNKNOWN — needs verification).
- `zip` crate: https://crates.io/crates/zip (MIT; version to pin: UNKNOWN — verify latest 2.x at implementation).
- Existing: `src-tauri/src/db.rs` `database_path` uses `app_data_dir()`.
