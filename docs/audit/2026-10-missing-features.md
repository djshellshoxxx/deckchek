# Missing code and features audit (2026-10-10)

Scope: M5 (FS-00 shared foundations, FS-01, FS-02, FS-03, FS-06, FS-07, FS-08), M6 (FS-10 to FS-15) and the older product baseline (device library, System Health, MIDI, timecode, calibration, capture). Audited on branch `job/audit-gaps` at `e2f51a3`.

Method: every acceptance criterion (AC-n) and every Definition of Done item was checked against the code and tests themselves, not against the status docs or job claims. I grepped and read the functions involved. I also cross-checked the commands registered in `src-tauri/src/lib.rs` against the `invoke(...)` call sites in `app/`, the feature flags against the code paths that reach them, the migration tables against Rust reads and writes, and the code for TODO, FIXME, `unimplemented!` and `todo!()` markers.

Verification run here: `npm test` passed (704 of 704). I did not run `cargo test` in this container: there is no `target/` directory, a full Tauri build did not fit the free disk space, and `/tmp` filled up during the audit. Where this audit cites a Rust test, it is citing CI evidence (the `test.yml` Linux and Windows jobs), not a local run.

Status key:
- **IMPL**: implemented, with a test or a direct code citation.
- **PARTIAL**: some of it is built; the entry says what is missing.
- **MISSING**: no code for it.
- **STUB**: code exists but does nothing real.
- **UNTESTABLE**: the code exists, but proving the AC needs real hardware, Windows or a human review.

## 1. Summary per spec

The counts cover the §2 ACs plus the §9 Definition-of-Done items.

| Spec | Items | IMPL | PARTIAL | MISSING | STUB | UNTESTABLE |
|---|---|---|---|---|---|---|
| FS-00 shared foundations (AC-1..9 + DoD + §4.7 consumers) | 11 | 5 | 3 | 3 | 0 | 0 |
| FS-01 first-run wizard | 14 | 12 | 0 | 0 | 0 | 2 |
| FS-02 diagnostics bundle | 11 | 10 | 1 | 0 | 0 | 0 |
| FS-03 PDF reports | 9 | 6 | 3 | 0 | 0 | 0 |
| FS-06 test-media library | 9 | 7 | 2 | 0 | 0 | 0 |
| FS-07 external links | 10 | 10 | 0 | 0 | 0 | 0 |
| FS-08 backup / restore | 11 | 11 | 0 | 0 | 0 | 0 |
| FS-10 pre-gig check | 12 | 8 | 2 | 0 | 0 | 2 |
| FS-11 latency / buffer tuner | 11 | 6 | 1 | 0 | 0 | 4 |
| FS-12 stylus wear | 11 | 11 | 0 | 0 | 0 | 0 |
| FS-13 control-vinyl wear map | 10 | 7 | 1 | 0 | 0 | 2 |
| FS-14 scratch stress test | 12 | 7 | 2 | 0 | 0 | 3 |
| FS-15 hum / feedback hunter | 11 | 6 | 2 | 0 | 0 | 3 |
| **Total** | **142** | **106** | **17** | **3** | **0** | **16** |

The per-spec table counts at the AC level. Separately, the most important finding in this audit is a cross-cutting reachability gap (GAP-01): seven of the nine M5/M6 features that sit behind a default-off flag cannot be switched on from the desktop UI at all. The code for those features is implemented, but a user cannot reach it.

No `TODO`, `FIXME`, `unimplemented!` or `todo!()` markers exist in `app/` or `src-tauri/src/`. No mock or fake-data path is reachable in the desktop app.

## 2. Per-spec AC detail

### FS-00 shared foundations
| AC | Status | Evidence |
|---|---|---|
| AC-1 migration discovery | IMPL | `src-tauri/build.rs:12-45`; tests `db.rs:1055`, `db.rs:1069`, `db.rs:1103`; CI `tools/check-migrations.mjs` |
| AC-2 version row inside the transaction | IMPL | tests `db.rs:1120` (`version_row_commits_atomically...`) and `db.rs:1149` |
| AC-3 v0.04 fixture upgrade | IMPL | `tests/fixtures/db/v0.04.sql`; tests `db.rs:1213` and `db.rs:1242`; integrity and FK checks at `db.rs:1185-1190` |
| AC-4 flag hides UI; toggle in Options > Advanced | PARTIAL | Rail gating works (`app/ui/shell.js:38`). The Experimental-features panel, `app/ui/screens/experimental.js:8`, is never imported anywhere, so no toggle exists in Options. "Reset to defaults" and the "Experimental" chip are also missing. See GAP-01. |
| AC-5 CAPTURE_BUSY and "Stop holder and continue" | PARTIAL | The backend lease is tested (`capture.rs:1857-1979`). The dialog is used by latency, pre-gig, wear map and hum (`app/ui/capture-busy.js`). The scratch test shows a plain error instead (`app/ui/workflows/scratch.js:113`). |
| AC-6 audio_out caps, ramp and stop < 50 ms | IMPL | `audio_out.rs:1346-1516`, including `property_no_sample_ever_exceeds_the_caps` and `stop_reaches_exact_silence_within_50_ms...` |
| AC-7 canonicalJson vectors | MISSING (M7 job) | No `tests/fixtures/canonical-vectors.json` and no `canonicalJson` anywhere. Spec §4.12 assigns this to M7-F2-canonical. |
| AC-8 photo store | MISSING (M7 job) | No photo code and no migration 0013 (§4.11, M7-F2-photo). |
| AC-9 userfiles path rules | IMPL | `userfiles.rs:335-461` |
| DoD | PARTIAL | The ACs above are not all green. `IMPLEMENTATION-STATUS.md` is stale in places (GAP-14). |
| §4.7 input pairs adopted by consumers | MISSING | The backend and bridge support pairs (`capture.rs:2210-2340`, `app/ui/audio-io.js:70-84`), but no screen ever passes `pairs`. See GAP-02. |

### FS-01 first-run wizard
| AC | Status | Evidence |
|---|---|---|
| AC-1 auto-open, Esc/Skip, status=skipped | IMPL | `app/ui/workflows/setup-wizard.js:721`, `:785-795`; `tests/setup-wizard-model.test.mjs`; `tools/smoke/wizard.mjs` |
| AC-2 resume banner | IMPL | `setup-wizard.js:755` |
| AC-3 deviceName saved | IMPL | `setup-wizard.js:372-374` |
| AC-4 -20 dBFS 1 kHz tone on the chosen output | UNTESTABLE | The code is in place: `setup-wizard.js:87-115` (WebAudio, `setSinkId`, capped by `toneLevelDbfs`). Whether `setSinkId` really routes to the chosen interface in WebView2 needs hardware. |
| AC-5 "Already calibrated" | IMPL | `setup-wizard.js:516` |
| AC-6 gear assets and retirement | IMPL | `wizard.rs:188`; tests `wizard.rs` (`apply_gear_retires_only_untouched...`); `devices.rs:166`, `:482`; `catalog-store.js:218` |
| AC-7 health step unsupported | IMPL | Browser builds drop the step (`setup-wizard-model.js:29`). Native non-Windows builds show `UNSUPPORTED_NOTE` (`setup-wizard.js:614`). |
| AC-8 Run setup again | IMPL | `setup-wizard.js:768-779` |
| AC-9 no-input error panel | IMPL | `setup-wizard.js:328-329` |
| AC-10 upgrade auto-complete | IMPL | `wizard.rs` test `user_data_detection_for_upgrade_installs`; `setup-wizard.js:789-791` |
| DoD: skippable, tone stops; migration; docs | IMPL | (3 items) |
| DoD: a11y audit | UNTESTABLE | No audit artifact exists; it needs a human screen-reader and zoom pass. |

### FS-02 diagnostics bundle
| AC | Status | Evidence |
|---|---|---|
| AC-1 panic logged and marker written | IMPL | `diagnostics.rs:636-650`; test `panic_on_any_thread_is_logged_and_marker_records_it`. The hooks are chained with `audio_out.rs:1203` and `latency.rs:1460`. |
| AC-2 JS errors, rate limit 20/min | IMPL | `app/diagnostics-bundle.js:261-306`; tests `rate_limiter_allows_20_per_minute...` and `client_errors_write_error_js_lines_rate_limited` |
| AC-3 crash prompt | IMPL | `app/ui/screens/support-dialog.js:237-277` |
| AC-4 marker lifecycle | IMPL | tests `marker_is_written_at_start...` and `only_run_event_exit_counts_as_a_clean_exit` |
| AC-5 bundle name and contents | IMPL | `support-dialog.js:19-20`; test `bundle_has_exactly_the_documented_parts...` |
| AC-6 redaction | IMPL | test `fuzz_no_seeded_secret_survives...`; `tests/fixtures/redaction-vectors.json` |
| AC-7 GitHub issue URL < 6000 chars | IMPL | `diagnostics-bundle.js:8`, `:343`; `support-dialog.js:213-217` |
| AC-8 log rotation | IMPL | tests `rotation_keeps_five_files...` and `rotation_boundary...` |
| DoD: fuzz; capabilities minimal | IMPL | `src-tauri/capabilities/default.json` (core, dialog save and open only) |
| DoD: manual crash path | PARTIAL | The test plan's `--debug-crash` hidden command does not exist (no match in `src-tauri/src` or `app`). The `diagnosticsBundle` flag (`app/features.js:13`) is never read: it is a dead flag, since the spec says "always on". |

### FS-03 PDF reports
| AC | Status | Evidence |
|---|---|---|
| AC-1 file name and valid PDF | IMPL | `app/report-pdf.js:103-107`; `pdf.rs` `print_to_pdf_writes_real_pdf` (Windows CI, `test.yml:85-87`) |
| AC-2 header, footer, "Page 2 of" | IMPL | `pdf.rs:829` (custom `pdf_text.rs`, not `lopdf`) |
| AC-3 vector SVG charts | IMPL | `tests/report-pdf.test.mjs` |
| AC-4 light theme | IMPL | `app/report-print.css` |
| AC-5 System Health findings | IMPL | `report-pdf.js:335` |
| AC-6 iframe fallback | IMPL | `report-pdf.js:396-429` |
| AC-7 20 s cancel with Retry | PARTIAL | The timeout works (`pdf.rs:20`, `report-pdf.js:391`). The error toast offers "Export HTML instead", not Retry (`app/ui/persistence.js:118-123`). |
| DoD: all report types export | PARTIAL | The registered kinds are run, device, systemHealth and pregig (`report-pdf.js:305-335`, `app/ui/workflows/pregig-report.js:56`). Latency, stylus, wear-map, scratch and hum results have no PDF. |
| DoD: docs | PARTIAL | `docs/FEATURE-MATRIX.md:27` still says "In progress, print host and renderer pending". |

### FS-06 test-media library
| AC | Status | Evidence |
|---|---|---|
| AC-1 prefill 1000 Hz and store the label | IMPL | `app/ui/media-picker.js:205-217` |
| AC-2 unverified flag | IMPL | `media-picker.js:208` (`UNVERIFIED_WARNING`) |
| AC-3 CV02.5 selects the timecode format | PARTIAL | The picker only prefills `referenceHz` and `nominalRpm`. The DVS analysis reads `params.timecodeFormat` (`app/ui/analysis.js:227`), but nothing sets it, so the format is auto-detected and the chosen medium is ignored. `toTimecodeFormat` (`media-library.js:197`) is unused by the DVS form. |
| AC-4 custom CRUD, export, duplicate | IMPL | `app/ui/screens/media.js:183-219`; `media.rs` test `custom_crud_rules` |
| AC-5 invalid import rejected | IMPL | `validateMediaProfile` and `prepareImport`; `tests/media-library.test.mjs` |
| AC-6 media_id and track stored and shown | IMPL | `devices.rs:43-45`, `:313`; `history.js:229-231` |
| AC-7 built-in update leaves custom media untouched | IMPL | `media.rs` test `ac7_update_leaves_custom_media...` |
| DoD: pickers in 4 tests | PARTIAL | The picker appears in 3 workflow forms (Speed, Channel & cartridge, DVS signal; `app/ui/workflows/definitions.js:96`). `createMediaPicker` (`media-picker.js:137`) is exported but never used. The FS-10/11/12/13/14 forms take no medium, contrary to FS-00 §4.15. |
| DoD: docs | IMPL | `docs/MEDIA-PROFILE-SCHEMA.md` |

Rollout mismatch: the spec says "no flag", but `testMedia` defaults to off (`features.js:15`). With GAP-01, users therefore never see the picker.

### FS-07 external links
AC-1 to AC-8 are all IMPL: `app/external-links.js`, `src-tauri/src/links.rs:181-199` (`not_app_path`), `tests/external-links.test.mjs`, the raw-`window.open` grep at line 265, and `links.rs:448-452`. DoD: the grep test and minimal capabilities are IMPL. Remaining gap: the FS-00 §3 shared save toast with [Open] [Show in folder] is not used after a PDF export (`persistence.js:114` shows a plain success toast). "Show in folder" exists only in the diagnostics dialog and the Data screen.

### FS-08 backup / restore
AC-1 to AC-9 are all IMPL, with the following Rust tests in `backup.rs`:
- `backup_writes_verified_archive...`
- `backup_is_transactionally_consistent_during_concurrent_writes`
- `restore_upgrades_the_v004_fixture_and_takes_a_safety_backup`
- `failed_restores_leave_the_live_database_byte_identical`
- `inspect_refuses_damaged_or_foreign_files`
- `retention_keeps_the_newest_n...`
- `workspace_import_skips_duplicates...`
- the zip-slip and zip-bomb tests

The user-facing messages come from `backup.rs:495` and `app/backup.js:109`. DoD: CI runs `cargo test` on Windows (`test.yml:84`).

### FS-10 pre-gig check
| AC | Status | Evidence |
|---|---|---|
| AC-1 full run with verdict in 120 s | PARTIAL | `app/pre-gig.js:552-643`. Any deck on inputs other than 1-2 is always skipped as `input-pair` ("Coming next") at `pre-gig.js:567` and `:181-182`, and `createNativeDeps.captureDeck` (`pre-gig.js:655-662`) never passes `pairs`. A typical two-deck rig therefore can never reach GREEN. |
| AC-2 roll-up | IMPL | `rollUp`; `tests/pre-gig.test.mjs` (55 tests) |
| AC-3 SNR < 25 dB action | IMPL | `pre-gig.js:20-25`, `:58` |
| AC-4 interface missing blocks the rest | IMPL | `runStep` blocker logic, `pre-gig.js:623-631` (real unplug: H-10) |
| AC-5 unsupported excluded | IMPL | `pre-gig.js:127`; `ui/workflows/pregig.js:38` |
| AC-6 history and diff | IMPL | `diffRuns`; `pregig.rs` `run_save_list_get_round_trip`. Built-in presets are saved without a preset id and matched by note (`pre-gig.js:681`). |
| AC-7 Esc cancel | IMPL | abort signal, `pre-gig.js:556`, `:646` |
| AC-8 preset CRUD and JSON | IMPL | `pregig.rs` `preset_crud_and_builtin_protection`; `pre-gig.js:438` |
| DoD: AC pass | PARTIAL | AC-1 (see above) |
| DoD: tests green | IMPL | |
| DoD: manual on 2 rigs; 120 s budget measured | UNTESTABLE | H-10 |

### FS-11 latency / buffer tuner
| AC | Status | Evidence |
|---|---|---|
| AC-1 chirp round trip, mean of 5, k=2 | UNTESTABLE | Code: `latency.rs` (44 tests); `app/latency.js`; the smoke test measures a synthetic 7.00 ms. Real loopback: H-11. |
| AC-2 reported vs measured buffers | UNTESTABLE | `audio_device_buffer_info`; WASAPI behaviour is unknown until H-11 step 8 |
| AC-3 stress ladder, host-chosen period | UNTESTABLE | `latency.rs:168-213`, `:645` |
| AC-4 recommendation | IMPL | `recommendBuffer` tests in `tests/latency.test.mjs` |
| AC-5 stress-only mode | IMPL | screen no-loopback state |
| AC-6 Windows checklist, nothing changed | IMPL | `latency.rs:1702-1715` (`powercfg`), `:2112`; fixtures in `tests/fixtures/latency` |
| AC-7 Esc stops load in < 1 s | IMPL | `latency_abort`; `latency.rs` guard tests |
| DoD: repeatability std < 0.1 ms | UNTESTABLE | hardware |
| DoD: hints reviewed | PARTIAL | The rekordbox and Traktor 4 wording is flagged "not verified" on screen |
| DoD: AC and tests | IMPL | (2 items) |

Also: `top_cpu` and `dj_processes` (`processes.rs:238`, `:254`) are registered but never called, so the tuner shows no CPU-hog list.

### FS-12 stylus wear
AC-1 to AC-8 are all IMPL:
- AC-2 (proposals from DeckChek capture sessions) is now wired: `app/ui/screens/stylus.js:476`, `app/stylus-wear.js:144`, `commands::list_capture_sessions`. `IMPLEMENTATION-STATUS.md:74` wrongly still lists it as a gap.
- AC-3: `dj_sessions.rs`, `stylus.js:477`.
- Snooze: `stylus-wear.js:13`.
- Rated life: `app/devices/stylus-life.json`, which carries a `confidence` per entry.

DoD (ledger, rail alert, catalogue confidence): IMPL. Not built, and not required by an AC: the guided benchmark capture and the Quick Check "Stylus health" card.

### FS-13 control-vinyl wear map
| AC | Status | Evidence |
|---|---|---|
| AC-1 2 s bins (median SNR, phase, dropouts, level) | IMPL | `app/wear-map.js:188` (`createScanner`). Captures stereo pair 1-2 only (GAP-02). |
| AC-2 spiral and linear map | IMPL | `wear-map.js:567-614`; `app/ui/plots-groove.js` |
| AC-3 delta with cross-correlation alignment | IMPL | `wear-map.js:491-566` |
| AC-4 verdict and worst 3 bins | IMPL | `wear-map.js:407`, `:425` |
| AC-5 interrupted bins | IMPL | `wear-map.js:17-34` |
| AC-6 partial coverage | IMPL | `wear-map.js:471` |
| AC-7 inspector and scope snippet | PARTIAL | Raw numbers are shown. No raw audio is retained, so there is no waveform snippet. |
| DoD: fixtures | IMPL | |
| DoD: 20+ min stable; repeatability | UNTESTABLE | `capture.rs:2584` (20 min throughput, ignored test); H-13 |

### FS-14 scratch stress test
| AC | Status | Evidence |
|---|---|---|
| AC-1 protocol and metronome | IMPL | `app/scratch.js`; `app/ui/workflows/scratch.js`; `tests/scratch-workflow.test.mjs` |
| AC-2 velocity every 5 ms | IMPL | `scratch.js:42-90`; `tests/scratch.property.test.mjs` |
| AC-3 lost lock | IMPL | `tests/scratch.test.mjs` |
| AC-4 direction errors | IMPL | same |
| AC-5 needle skips and safety stop | UNTESTABLE | Detector implemented; thresholds uncalibrated (sacrificial-record test) |
| AC-6 score stored per cartridge, control-vinyl copy and setup; cross-entity compare | PARTIAL | `setupId: null` is hardcoded (`app/ui/screens/scratch.js:236`) and `record_side_id` is never set, so the `scratch_run` columns (`0011_scratch_stress.sql:6-8`) stay null. Compare groups by cartridge only (`scratch.js:463`). |
| AC-7 Esc mutes in < 100 ms | IMPL | `workflows/scratch.js:175`; smoke test `tools/smoke/scratch.mjs` |
| AC-8 baseline SNR >= 25 dB gate | IMPL | |
| DoD: velocity tests | IMPL | |
| DoD: skip thresholds calibrated; safety copy reviewed | UNTESTABLE | (2 items) |
| DoD: AC-1..8 | PARTIAL | AC-6 |

### FS-15 hum / feedback hunter
| AC | Status | Evidence |
|---|---|---|
| AC-1 live hum meter | IMPL | `app/hum.js:152`; `app/ui/workflows/hum.js:78`, `:218-226`; `tests/hum.test.mjs` |
| AC-2 5 s step, delta, >= 6 dB | IMPL | `app/hum-tree.js:71-73`; `tests/hum-tree.test.mjs` |
| AC-3 ranked causes | IMPL | `rankCauses`; `tests/hum-tree.test.mjs` |
| AC-4 -60 dBFS start, 3 dB steps, -30 cap | IMPL | `app/feedback.js:12-17`; `audio_out.rs` cap tests |
| AC-5 howl abort < 100 ms | UNTESTABLE | `feedback.js:63`; engine tests pass, but real-output latency needs H-15 |
| AC-6 Esc/STOP mutes | IMPL | `tests/feedback.test.mjs`; smoke test `tools/smoke/hum.mjs` |
| AC-7 save to venue session and appear in venue report | PARTIAL | Runs are saved with an optional `venueId` and listed on the Runs tab (`workflows/hum.js:7-8`, `:94-95`). No venue report exists. The `booth` and `deck_position` tables are never written (GAP-12). |
| DoD: hard cap in Rust | IMPL | |
| DoD: decision tree reviewed; 3 mixers | UNTESTABLE | |
| DoD: AC-1..7 | PARTIAL | AC-7 |

### Baseline features
| Feature | Status | Evidence / gap |
|---|---|---|
| Device library | IMPL / PARTIAL | All 232 profile tests dispatch to a real runner (88 workflow, 47 MIDI, 45 manual, 24 timecode, 16 driver, 12 software; none `unsupported`; checked with `dispatchFor`). MIDI maps: 8 of 9 profiles have empty `midi.controls`, and the Rane Twelve MK2's 15 controls all have `message: null`, so every MIDI test is learn-only. |
| System Health | UNTESTABLE | `system_check.rs` (driver, event-log and DJ-log scans with fixtures); needs Windows |
| MIDI | UNTESTABLE | `midi.rs` (midir); the learn flow works without hardware only in unit tests |
| Timecode facts | IMPL | `app/timecode.js:16-40`; CI `tools/check-timecode-facts.mjs`. The Traktor MK2 2500 Hz carrier is not yet measured (TODO.md). |
| Calibration | UNTESTABLE | `app/calibration.js`; loopback needs an interface |
| Capture | IMPL / PARTIAL | `capture.rs` has more than 40 tests. Input-pair selection is never exposed (GAP-02), and the `capture` table is never written (GAP-11). |

## 3. Findings, sorted by user impact

**GAP-01. Default-off features cannot be enabled. FS-00 AC-4 / §3. PARTIAL.**
- Evidence: `app/ui/screens/experimental.js:8` (`createExperimentalScreen`) is not imported anywhere. `app/ui/shell.js:216-238` has no menu entries. `app/ui/menus.js:28-37` only adds Diagnostics. The flags `testMedia`, `pregig`, `latencyTuner`, `stylusWear`, `wearMap`, `scratchTest`, `humHunter` and `feedbackStep` all default to false (`app/features.js:15-23`). The smoke tests flip flags through `page.evaluate` (`tools/smoke/integration.mjs:68`), so the missing panel was never caught. There is also no "Reset to defaults" and no "Experimental" chip.
- Impact: in the shipped desktop app, a user can only reach FS-06 and all of M6 by editing localStorage in devtools.
- Fix: S. Files: `app/ui/menus.js` (or the `// [FS-00] menu` anchor in `app/ui/shell.js`) to open the panel from Options; `app/ui/screens/experimental.js` to add reset and default columns; `tools/smoke/integration.mjs`.

**GAP-02. Input-pair selection is not exposed anywhere. FS-00 §4.7 consumers, FS-10 AC-1, FS-13 AC-1. MISSING.**
- Evidence: pairs are implemented in `capture.rs:2210-2340` and `app/ui/audio-io.js:70-84`. However, no screen or workflow passes `pairs`: the term occurs only in `audio-io.js`, `capture.js` and `wear-map.js`. Pre-gig still hard-skips deck B (`app/pre-gig.js:567`, `:181-182`; `app/ui/workflows/pregig.js:17` "Coming next"), and `createNativeDeps.captureDeck` (`pre-gig.js:655-662`) omits `pairs`.
- Impact: on a Traktor Audio 8 DJ, DJM-A9 or Xone:23C, deck B (inputs 3-4 and up) can never be checked, so the pre-gig verdict can never be GREEN. Per-endpoint WASAPI names may partly work around this; that needs H-10.
- Fix: M. Files: `app/pre-gig.js` (`captureDeck`, remove `inputPairUnsupported`), `app/ui/workflows/pregig.js`, `app/ui/screens/vinylscan.js`, `app/ui/workflows/wearmap.js`, `app/ui/screens/latency.js`, the device-picker UI in `app/ui/shell.js` or `app/ui/state.js`, and `tests/pre-gig.test.mjs`.

**GAP-03. The test-media picker is hidden and its rollout contradicts the spec. FS-06 rollout and DoD. PARTIAL.**
- Evidence: the spec says "no flag; pickers default Auto", but `testMedia` defaults to false (`features.js:15`). `refreshParam` empties the form field's modes while the flag is off (`app/ui/media-picker.js:161`).
- Impact: the FS-06 feature is invisible by default, and GAP-01 means it cannot be enabled.
- Fix: S. Files: `app/features.js`, `docs/specs/06-test-media-library.md` or `TODO.md` (record the decision).

**GAP-04. Choosing a timecode medium does not select the decoder format. FS-06 AC-3. PARTIAL.**
- Evidence: `applyPrefill` sets only `referenceHz` and `nominalRpm` (`media-picker.js:205-217`). `timecodeRunResult` reads `params.timecodeFormat` (`app/ui/analysis.js:227`), which nothing sets, so the format is auto-detected.
- Impact: if a user picks Serato CV02.5 and detection guesses wrong, the DVS run is analysed as the wrong format.
- Fix: S. Files: `app/ui/media-picker.js`, `app/ui/analysis.js`, `tests/media-library.test.mjs`.

**GAP-05. Scratch scores are never linked to the setup or the control-vinyl copy. FS-14 AC-6. PARTIAL.**
- Evidence: `app/ui/screens/scratch.js:236` hardcodes `setupId: null`. There is no record-side picker, so `record_side_id` is never written (`database/migrations/0011_scratch_stress.sql:6-8`). Compare groups only by cartridge, format and BPM (`scratch.js:463`).
- Impact: users cannot compare control-vinyl copies or setups, which is a stated use case (US-2).
- Fix: M. Files: `app/ui/screens/scratch.js`, `app/scratch.js` (`compareScores`); reuse `createRecordsApi` from `app/ui/workflows/wearmap.js:68`.

**GAP-06. No PDF for M6 results. FS-03 DoD "all report types". PARTIAL.**
- Evidence: only the `run`, `device`, `systemHealth` and `pregig` printable kinds exist (`app/report-pdf.js:305-335`; `pregig-report.js:56`).
- Impact: latency, stylus, wear-map, scratch and hum results cannot be handed to a technician or venue as a PDF.
- Fix: M. Files: one `registerPrintableKind` plus an Export button per screen (`app/ui/screens/latency.js`, `stylus.js`, `vinylscan.js`, `scratch.js`, `app/ui/workflows/hum.js`).

**GAP-07. Hum runs do not appear in any venue report. FS-15 AC-7. PARTIAL.**
- Evidence: `app/ui/workflows/hum.js:7-8` says there is no venue detail screen. There is no venue report kind, and the `booth` and `deck_position` tables are never written.
- Impact: venue technicians cannot get a per-venue record of isolation steps.
- Fix: M/L. Files: a new venue report kind in `app/report-pdf.js`, an Equipment > Venue detail view in `app/ui/screens/equipment.js`, and `humrun.rs` (list by venue).

**GAP-08. The capture-busy dialog is missing from the scratch test. FS-00 AC-5. PARTIAL.**
- Evidence: `app/ui/workflows/scratch.js:74`, `:113` call `startLiveSession`, and a `CaptureBusyError` falls into the generic `fail()`. The workflow does not use `runWithCapture` or `confirmCaptureBusy`.
- Impact: if the wear map or hum hunter holds the input, the scratch test just errors, with no "Stop and continue" option.
- Fix: S. Files: `app/ui/workflows/scratch.js`, `tools/smoke/capture-busy.mjs`.

**GAP-09. A PDF timeout offers no Retry. FS-03 AC-7. PARTIAL.**
- Evidence: `app/ui/persistence.js:118-123` shows the text "You can try again", and the only action is "Export HTML instead".
- Impact: after the first slow WebView2 export, the user has to find the button again.
- Fix: S. Files: `app/ui/persistence.js`.

**GAP-10. The wear-map inspector has no audio snippet. FS-13 AC-7. PARTIAL.**
- Evidence: raw audio is not retained; the inspector shows numbers only (`app/ui/screens/vinylscan.js:508`).
- Impact: users cannot hear or see the bad stretch.
- Fix: M. Files: `app/wear-map.js` (keep short per-bin snippets in a ring buffer), `app/ui/screens/vinylscan.js`.

**GAP-11. The `capture` table is never written. Baseline data model. STUB (schema only).**
- Evidence: `database/migrations/0001_initial.sql:188`. There is no `INSERT INTO capture` in `src-tauri/src`, so `measurement.capture_id` is always null (`db.rs:329`).
- Impact: per-run device, backend and quality provenance is lost. This hurts reproducibility in reports.
- Fix: M. Files: `src-tauri/src/db.rs` (`save_diagnostic_run`), `app/ui/persistence.js`.

**GAP-12. Venue hierarchy and several baseline tables are never used. Baseline schema. STUB (schema only).**
- Evidence: `booth`, `deck_position`, `support_configuration` and `vinyl_event` have no reads or writes anywhere. `asset_settings_snapshot` is read (`devices.rs:275`) but never written.
- Impact: venue features (FS-05, FS-15 AC-7) and the vinyl-event history have nowhere to land.
- Fix: L. Files: `src-tauri/src/catalog.rs` and new commands; or document the tables as reserved.

**GAP-13. The test-media picker is not used by the M6 forms. FS-06 DoD and FS-00 §4.15. PARTIAL.**
- Evidence: `createMediaPicker` (`app/ui/media-picker.js:137`) is never imported. Pre-gig maps media by a hardcoded table (`FORMAT_BY_MEDIA_ID`, `app/pre-gig.js:453`).
- Impact: the scratch, wear-map and stylus benchmark forms re-ask for the format and carrier instead of offering the chosen disc.
- Fix: M. Files: `app/ui/screens/scratch.js`, `app/ui/screens/vinylscan.js`, `app/ui/screens/stylus.js`, `app/pre-gig.js`.

**GAP-14. Docs claim things the code does not match. PARTIAL (doc drift).**
- Evidence:
  - `docs/FEATURE-MATRIX.md:27` says PDF is "In progress / renderer pending", but it is implemented.
  - `docs/IMPLEMENTATION-STATUS.md:74` says FS-12 AC-2 is not built, but it is wired (`stylus.js:476`).
  - `IMPLEMENTATION-STATUS.md:83` says "capture is stereo only", but pairs exist in the backend and only the UI is missing.
  - `IMPLEMENTATION-STATUS.md:85` says the DVS to wear-map entry point is unwired, but `app/crosslinks.js:18` wires it.
  - FS-00 §4.15 (`docs/specs/00-shared-foundations.md:107`) says `scratch.js` and `wear-map.js` use `phaseSign` alone; both now use `directionSign` (`app/scratch.js:56`, `app/wear-map.js:258`).
  - `FEATURE-MATRIX.md` (Diagnostic reasoning, "evidence graph remains"; Cartridge, "crosstalk remains") contradicts `TODO.md` (both ticked).
  - FS-00 AC-4 promises an Options > Advanced toggle, which does not exist (GAP-01).
- Impact: owners and testers plan hardware runs against the wrong picture.
- Fix: S. Files: `docs/FEATURE-MATRIX.md`, `docs/IMPLEMENTATION-STATUS.md`, `docs/specs/00-shared-foundations.md`.

**GAP-15. Dead or never-called surface. INFO / PARTIAL.**
- Evidence:
  - Registered commands that are never invoked from `app/`: `runtime_status` (`commands.rs:16`), `dj_processes` (`processes.rs:238`), `top_cpu` (`processes.rs:254`) and `userfiles_write_folder` (`userfiles.rs:315`, which is meant for M8 FS-33).
  - Flags that gate nothing: `diagnosticsBundle` (`features.js:13`).
  - M7 flags that default ON with no code behind them: `population` and `fleet` (`features.js:25`, `:27`).
  - No JS call targets an unregistered command (all 96 `invoke` names resolve in `lib.rs`).
- Impact: low. Once GAP-01 is fixed, the panel would show "Unit vs population" and "Venue fleet" as on, with nothing behind them.
- Fix: S. Files: `app/features.js` (set the M7 flags to false and drop or hide `diagnosticsBundle`); wire `top_cpu` into the FS-11 Windows tuning tab, or remove it.

**GAP-16. The PDF export does not use the shared save toast. FS-00 §3 / FS-07 AC-8. PARTIAL.**
- Evidence: `app/ui/persistence.js:114` shows a success toast with no [Open] or [Show in folder]. `openAppPath` and `revealAppPath` are used only by the diagnostics dialog and the Data screen.
- Impact: after saving a PDF, the user has to go and find the file themselves.
- Fix: S. Files: `app/ui/persistence.js`.

**GAP-17. MIDI maps are learn-only for every device. Baseline MIDI / device library. PARTIAL.**
- Evidence: 8 of 9 profiles have `midi.controls: []`. All 15 Rane Twelve MK2 controls have `message: null`. `TODO.md` "Ship published MIDI maps" is unticked.
- Impact: every MIDI coverage, fader or jog test needs a manual learn pass first.
- Fix: M (depends on the vendor docs). Files: `app/devices/profiles/*.json`, then regenerate `app/devices/index.json`.

**GAP-18. The FS-02 manual crash helper is missing. FS-02 test plan. MISSING.**
- Evidence: there is no `--debug-crash` handling in `src-tauri/src/main.rs`, `lib.rs` or `diagnostics.rs`.
- Impact: the owner cannot exercise the crash prompt on hardware (H-02) without killing the process.
- Fix: S. Files: `src-tauri/src/main.rs` and `src-tauri/src/diagnostics.rs` (debug builds only).

## 4. Ready for real-hardware testing?

| Feature | Verdict |
|---|---|
| FS-01 wizard | **Yes.** Confirm tone routing through `setSinkId` on the Audio 8 DJ. |
| FS-02 diagnostics | **Yes.** Run with `--debug-crash` (debug build, or `DECKCHEK_ALLOW_DEBUG_CRASH=1`) to test the crash prompt. |
| FS-03 PDF | **Yes** for run, device, System Health and pre-gig. |
| FS-06 test media | **No, until GAP-01 and GAP-03 are fixed** (unreachable). After that, yes, but AC-3 is weak (GAP-04). |
| FS-07 links | **Yes.** |
| FS-08 backup / restore | **Yes.** Run the second-machine restore. |
| FS-10 pre-gig | **Not for two-deck rigs** until GAP-02 is fixed; single-deck or pair 1-2 rigs are ready. GAP-01 must be fixed first in all cases. |
| FS-11 latency tuner | **Yes, after GAP-01.** H-11 is the next step; no code blocker. |
| FS-12 stylus wear | **Yes, after GAP-01.** |
| FS-13 wear map | **Yes for deck A (pair 1-2), after GAP-01.** Deck B needs GAP-02. |
| FS-14 scratch | **Yes for single-cartridge runs, after GAP-01.** Cross-vinyl and cross-setup compare needs GAP-05. |
| FS-15 hum / feedback | **Yes, after GAP-01** (start with the feedback step at the lowest cap). The venue report is missing. |
| Device library / MIDI | **Yes.** Expect learn-only MIDI (GAP-17). |
| System Health, calibration, capture | **Yes.** These are Windows- and hardware-only paths, and code-complete. |

## 5. Resolution (job fix-ui, 2026-10-10)

| Gap | Status | What changed |
|---|---|---|
| GAP-01 | Fixed | Options > Support > "Experimental features…" dialog (`app/ui/screens/experimental.js`, `app/ui/menus.js`) with chips and "Reset to defaults"; the smoke test toggles every M6 flag and test media and opens each screen. |
| GAP-02 | Fixed | `app/input-pairs.js` + `app/ui/pair-picker.js`: a pair box in every capture setup (Quick Check/flows, timecode runner, calibration, wear map, scratch, latency, hum, feedback; pre-gig has one per deck), default 1-2, remembered per input. Pre-gig captures deck B on its preset pair (3-4 on the Traktor Audio 8 DJ rig). `latency_play_and_capture` takes `pairs`. |
| GAP-03 | Fixed | `testMedia` defaults on; spec rollout note records it. |
| GAP-04 | Fixed | The DVS form has a Timecode format field that a timecode medium sets; Auto-detect is the fallback. The scratch and control-vinyl forms also take a medium. |
| GAP-05 | Fixed | Scratch runs save `setupId` and `recordSideId`; Compare groups by cartridge, setup, side, format and tempo (`groupScratchRuns`). |
| GAP-06 | Fixed | Printable kinds latency, stylus, wearMap, scratch, hum (`app/ui/workflows/m6-reports.js`) with Export PDF buttons. |
| GAP-07 | Fixed | Printable kind `venue` (setups plus hum and feedback history) from Equipment > Venues and the Runs tab. The `booth` and `deck_position` tables remain unwritten (GAP-12). |
| GAP-08 | Fixed | The scratch runner starts through `runWithCapture`; Cancel returns to setup/ready, and a preempt mid-run ends the test with a message. |
| GAP-09 | Fixed | A PDF timeout shows Retry beside "Export HTML instead". |
| GAP-10 | Fixed | Waveform snippet in the wear-map bin inspector from a bounded peak-envelope ring buffer (session only). |
| GAP-11, GAP-12 | Deferred | Schema-only tables, reserved. |
| GAP-13 | Fixed | The scratch and control-vinyl forms take a medium; `app/pre-gig.js` resolves formats through `formatForMedia` (media library) and the gear dialog lists library timecode discs. |
| GAP-14 | Fixed | FEATURE-MATRIX, IMPLEMENTATION-STATUS, `app/README.md` and the spec status notes now match the code. |
| GAP-15 | Partly fixed | M7 and M8 flags default off and are hidden; `diagnosticsBundle` is marked always on; `top_cpu` and `dj_processes` feed the Windows tuning tab. `runtime_status` removed; `userfiles_write_folder` is reached through `saveFolder` in `app/userfiles.js` (first screen: FS-33). `tests/command-surface.test.mjs` keeps lib.rs and app/ in step. |
| GAP-16 | Fixed | The PDF saved toast offers Open and Show in folder. |
| GAP-17 | Open | Published MIDI maps need vendor documents. |
| GAP-18 | Fixed | `--debug-crash` (diagnostics.rs, called last in setup): debug builds, or `DECKCHEK_ALLOW_DEBUG_CRASH=1` in release; tested. |
| AC-7 / AC-8 canonical JSON, photo store | M7 | Unchanged. |
