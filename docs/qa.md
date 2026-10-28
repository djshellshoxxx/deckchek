# DeckChek QA checklist and results

Manual and automated QA for each supported input format and platform. Automated evidence is
recorded with the run it came from; manual rows stay **NOT RUN** until a person runs them on
the named platform. Hardware-dependent measurement checks live in
[`docs/testing/HARDWARE-TEST-SCRIPTS.md`](testing/HARDWARE-TEST-SCRIPTS.md) (H-NN scripts).

## 1. Automated coverage (every push unless noted)

| Layer | What | Where |
|---|---|---|
| JS unit / property / regression | engines, parsers, UI view models | `npm test` (`tests/*.test.mjs`, JUnit in CI artifact `junit-javascript`) |
| JS fuzz smoke | 10 parser targets x 400 seeded mutations | `tests/fuzz-smoke.test.mjs` |
| JS fuzz long | 120 s per target | nightly `js-fuzz-and-stress` (`tools/fuzz-js.mjs`) |
| Rust unit / migrations / fixtures | every module, DB upgrade from every `tests/fixtures/db/v*.sql` | `cargo test` (Linux per push; Windows nightly and on release tags; macOS on release tags) |
| Rust fuzz smoke | 11 targets, committed seeds, seeded mutations and every committed crash input in `src-tauri/fuzz/regressions/<target>` | `cargo test --lib fuzz_api` |
| Rust fuzz long | cargo-fuzz/libFuzzer + ASan, 300 s per target | nightly `cargo-fuzz` |
| Rust ASan | full lib test suite under AddressSanitizer | nightly `rust-asan` |
| Stress / performance | long captures, large histories, backup/restore, import caps, concurrency | nightly `js-fuzz-and-stress`, `rust-stress` (budgets in §4) |
| UI smoke (Playwright) | every screen and feature flow, browser + mocked desktop | `node tools/ui-smoke.mjs` (`ui-smoke` job) |
| Packaged-app smoke | `deckchek --self-test=<report.json>` on the exact downloaded artifact | release workflow `smoke` job |

## 2. Input formats (manual checklist)

For each: open a valid file, a truncated copy, an empty file, a file with the wrong extension, a
file from a newer DeckChek version, a file with a unicode and a very long path, and a read-only
copy. Expected: valid opens; everything else shows a specific error and changes nothing.

| Format | Where it is read | Automated | Manual result |
|---|---|---|---|
| Audio files (WAV 16/24/32f, FLAC, MP3 via WebView decode) | Quick Check, Speed, DVS, Vinyl Scan file input | smoke flows | NOT RUN |
| `.deckchek-backup` (zip: manifest, SQLite, settings, photos) | Data > Restore | Rust tests incl. zip-slip, bombs, hostile DB; fuzz | NOT RUN |
| `deckchek-workspace.json` | Data > Import workspace; browser import | `tests/backup.test.mjs`, `tests/regressions.test.mjs`; fuzz | NOT RUN |
| Phone export `.deckchek-mobile.json` / QR frames | Import phone results | `tests/phone-*.test.mjs`; fuzz | NOT RUN |
| Test-media profile JSON | Test media > Import | `tests/media-library.test.mjs`; fuzz | NOT RUN |
| Population pack JSON (FS-21) | Compare > Import pack | `tests/pack.test.mjs`; fuzz | NOT RUN |
| Certificate `.deckchek-cert.json` / `.html` (FS-20) | Verify certificate | see FS-20 tests | NOT RUN |
| Mapper imports (Mixxx XML, VDJ, learned map) (FS-32) | MIDI mapper studio | see FS-32 tests | NOT RUN |
| DJ-software logs (Serato, Traktor, rekordbox, VirtualDJ) | System Health > DJ logs, stylus hours | Rust parser tests; fuzz | NOT RUN |

## 3. Platforms (manual checklist per release)

Per platform: install (or run portable), first-run wizard, Quick Check on a file, one live capture
on a real interface, export HTML/CSV/PDF, backup and restore, uninstall. Check high-DPI (150 %,
200 %), keyboard-only navigation (Tab, Ctrl+1..9, Esc), dark/light theme, an empty History, a
History with 5000 runs, a 120-character plugin/device name, and an error state (unplug the
interface mid-capture).

| Platform | Package | Self-test (CI) | Manual result |
|---|---|---|---|
| Windows 11 x64 | NSIS, MSI, portable exe | release `smoke` job | NOT RUN |
| Windows x86 | NSIS, MSI, portable exe | release `smoke` job | NOT RUN |
| macOS Apple silicon | .dmg / .app | release `smoke` job | NOT RUN |
| macOS Intel | .dmg / .app | release `smoke` job | NOT RUN |
| Linux x64 | .deb, AppImage | release `smoke` job (xvfb) | NOT RUN |
| Linux x86 | .deb (cross-built in a container) | not run: no i386 WebKitGTK on x64 runners | NOT RUN |

## 4. Stress budgets

| Case | Size (nightly full) | Budget |
|---|---|---|
| Vinyl side analysis | 20 min stereo 48 kHz (460 MB samples) | <= 240 s, <= 2.6 GB RSS |
| Quick Check | 10 min stereo | <= 60 s, deterministic output |
| Wear-map streaming scan | 15 min timecode in 30 s chunks | <= 180 s, bounded RSS |
| Workspace import shaping | 10 000 runs x 40 measurements | <= 20 s |
| Canonical JSON | 50 000 items | <= 15 s, idempotent |
| Persist / list / backup / restore | 5 000 runs x 30 measurements | persist <= 240 s; list 500 <= 2 s; backup <= 60 s; restore <= 120 s |
| Workspace import (Rust) | 10 000 runs (the cap); 10 001 refused | <= 240 s |
| Concurrent readers during backup | 4 readers x 50 list_runs, 3 backups | <= 120 s, all backups valid |

## 5. Recorded results

Results are appended per run with the commit, the command and the numbers it printed.

### 2026-10-28 long fuzz run (local, before v0.1.0-beta.1)

Machine: 4-core Linux container, shared with other builds (execution counts are lower than on an idle machine). Rust: `cargo +nightly fuzz run -O <target>` (libFuzzer + AddressSanitizer, cargo-fuzz 0.13.2) with `-max_total_time=600 -rss_limit_mb=2048 -timeout=10`, seeded from `src-tauri/fuzz/corpus/<target>`. JS: `node tools/fuzz-js.mjs 120`. "Seconds" includes the build or rebuild before the first input.

| Target | Run time | Executions | Coverage (cov) | Result |
|---|---|---|---|---|
| backup_inspect | 600 s | 597 894 | 1870 | no crash |
| backup_restore | 600 s | 5 684 | 3356 | first run crashed after ~2 500 inputs: restore panicked on TEXT that is not UTF-8 (FUZZ-05, fixed in 76e9d52); re-run after the fix: no crash |
| canonical | 600 s | 13 108 708 | 1275 | first run crashed: serde_json raw-value key parsed differently from JavaScript (FUZZ-04, fixed in 76e9d52); re-run after the fix: no crash |
| certificate | 600 s | 11 682 358 | 2864 | no crash |
| dj_logs | 600 s | 11 617 064 | 407 | no crash |
| jpeg | 600 s | 171 812 270 | 116 | no crash |
| links | 600 s | 5 609 558 | 4693 | no crash |
| pack | 600 s | 13 094 | 1718 | no crash (each input opens and migrates a database, hence the low count) |
| system_check | 600 s | 6 548 675 | 2326 | no crash |
| userfiles | 600 s | 28 796 324 | 419 | no crash |
| workspace_import | 600 s | 1 011 780 | 1351 | no crash |

Earlier 120 s pass (same day): jpeg harness invariant (FUZZ-01, harness only) and a system_check glob timeout (FUZZ-02, fixed). Every crash input is committed under `src-tauri/fuzz/regressions/` and replayed by `cargo test --lib fuzz_api` on every push.

JS, 120 s per target: the first pass crashed in `device-profile` (FUZZ-06: `validateProfile` threw on values that cannot become strings; fixed in 774b491). The full re-run after the fix (seed 39290673) had no crash: phone-run 1 910 327 executions, workspace 1 683 586, backup-manifest 3 467 870, media-import 1 999 052, media-state 2 517 708, catalog-state 2 292 208, canonical 236 918, pack 2 518 100, midi-message 2 941 712, certificate 2 593 240, mapper-xml 334 755, mapper-vdj 824 753, device-profile 887 345.

