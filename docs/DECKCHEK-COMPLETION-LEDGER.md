# DeckChek feature completion ledger

## How to read this ledger

This ledger separates implementation, automated checks, physical hardware qualification, platform qualification and release readiness. They are different states. The baseline is PR #26 at `4466cc0bb9951a98528f576726e01dd9cecc388e`, incorporating `main` at `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`. The final reviewed code snapshot is [5960099ed4094172025dad9129dc38b148dabedf](https://github.com/djshellshoxxx/deckchek/commit/5960099ed4094172025dad9129dc38b148dabedf), tree `c31a65ee46ae3666fce4f8b833e63ff13690a57f`, prepared for PR #27 on 2026-11-18. It incorporates the reviewed PR #29 lifecycle/ZIP changes, the scoped PR #28 SQLite audit correction, the monitor save follow-up, the Windows WASAPI example adjustment and the separate GLib compiler-compatibility/provenance corrections. Documentation-only successors do not change this code snapshot. Publication and final hosted results are recorded in [DECKCHEK-CONTINUATION-HANDOFF.md](DECKCHEK-CONTINUATION-HANDOFF.md).

Percentages are reported only where an explicit acceptance denominator is available and freshly checked. They count criteria, not estimated hours. **Not freshly scored** means that a defensible feature percentage is unavailable; it does not mean 0% implemented. Passing the broad suite or finding a source file is insufficient to invent a percentage. Baseline implementation labels below retain the existing implementation report and do not close the new audit or physical gates.

Baseline automated evidence: [CI 44228369554](https://github.com/djshellshoxxx/deckchek/actions/runs/44228369554), 654 Linux Rust passed/eight ignored, 1,299 JavaScript passed/one optional skip, and 1,276 browser checks. The first combined correction run passed 1,316 JavaScript tests/one optional skip. Those runs are distinct; later edits require final-head verification.

Current consolidation evidence is listed below. These scopes overlap and must not be added together; isolated native harness counts are not full application test counts.

| Verification scope | Observed result | Evidence boundary |
| --- | --- | --- |
| Final-source full JavaScript suite on supported Node 22.23.5 | 1,428 passed, zero failed, one optional skip; 1,429 total in 125.033 seconds | Root's completed serial run on reviewed source `5960099`, whose tree is byte-identical to local `e98d991a827f91e56b9a71ce9de551e71db2e015`. Four added GLib provenance guards account for the increase from the earlier 1,424-pass suite. This does not establish native, browser, platform or hardware qualification. |
| Earlier full JavaScript serial run at `e43be06` | 1,424 passed, zero failed, one optional skip; 1,425 total in 132.083 seconds | Exact-source rerun passed without changing source, timing limits or assertions. Before this, `d9a2add` also passed 1,424/0/1 in 40.074 seconds. These are distinct historical runs. |
| Failed parallel repeat at `e43be06` | Reported 1,340 passed, nine failed, one optional skip; 1,350 total in about 256 seconds | Eight test-file workers ended with SIGKILL, and the unchanged certificate timing assertion observed 1,707 ms against a 1,000 ms limit. The incomplete worker run has a different reported total. Low available host memory was observed, but OOM was not proven. The failed run is retained alongside the later serial pass. |
| Final-source focused static gates | All listed checks passed | Three modified JavaScript files pass syntax checks; all three Cargo metadata roots select the patched GLib; the 121-file/two-patch provenance check, 434 notices and unchanged application/harness formatting commands pass. These checks do not execute the final native application. |
| Earlier static and performance gates at `d9a2add` | All listed static checks passed; performance 1/1 passed | Syntax for 336 modules; 45 profiles; 22 migration names; index, timecode and mobile checks; application/regression-harness formatting; original GLib provenance/selection and 434 third-party notices. Final-source focused checks are listed separately. |
| Earlier-source hosted browser checks | 1,293/1,293 passed; no console errors | [Run 44265442094, job 134668697340](https://github.com/djshellshoxxx/deckchek/actions/runs/44265442094/job/134668697340) exercised `ef49ed6`, including guided stylus capture. It does not qualify later source changes in `5960099`; final-source hosted CI starts after publication. |
| Earlier-source hosted JavaScript gate | Job succeeded | [Run 44265442094, job 134668697803](https://github.com/djshellshoxxx/deckchek/actions/runs/44265442094/job/134668697803) exercised `ef49ed6`. This is separate from the local combined-source count above and does not qualify later source changes. |
| FS-12 focused independent review | 64/64 passed | 55 tests across `stylus-benchmark`, `stylus-ui` and `stylus-wear`, plus nine `capture-sessions` tests. Production analysis is used for the generated tone/timecode cases. |
| Device chronology and adjacent consumers | 73/73 passed | `tests/device-library.test.mjs`, `tests/device-test-plan.test.mjs`, `tests/fleet.test.mjs`, `tests/certificate.test.mjs`; includes unordered and invalid-time evidence permutations. |
| Numeric evidence and audio runner | 70/70 passed | `device-checks`, `device-test-plan`, `audio-quality`, `audio-session`, `audio-runner-lifecycle` test files; missing or nonfinite evidence cannot certify a pass. |
| MIDI renderer, bridge and diagnostics | 92/92 passed | `midi-fs36-ui`, `midi-runner-lifecycle`, `midi-conformance`, `midi-tests`, `midi-bridge` test files; independently reviewed with additional ownership probes. |
| Certificate and Verify lifecycle review | 55/55 focused checks and six additional independent probes passed | Four certificate/Verify test files use the production screens, models and shell. The same 18 lifecycle cases against earlier `ef49ed6` source yielded eight passes and ten failures. The six extra probes plus those 18 cases pass 24/24; that overlapping total must not be added again. |
| Monitor settings ownership review | 54/54 focused checks and three additional independent probes passed | Four monitor test files cover the production screen/controller with deferred native boundaries. The extra probes against unchanged PR #29 yielded one pass and two failures; the serialized save/prune follow-up passes all three. |
| Native queued-input ownership review | 22/22 passed | Exact production MIDI module with Tauri scheduling, MIDI I/O and serialization substituted at the harness boundary: 14 module tests and eight scheduling/ownership probes. |
| Native captured-output ownership review | 26/26 passed | Updated production-module harness: 16 module tests, four input-open probes and six output-ownership probes. Includes failure, disappearance, replug and explicit-reset boundaries. |
| GLib source patches, provenance and selection | 10/10 guard tests passed; all three Cargo roots select local GLib 0.18.5 | The official two-line out-pointer fix and a separate 34-line compiler syntax patch across 12 other files are independently anchored. Standard patch application/reversal reproduces all 121 final/pristine files. Actual CRLF-converting checkout preserves all 121 source files and both patch artifacts. Three locks, regression test source and CI workflows are unchanged; the isolated harness moves its exact GLib dependency to test-only `dev-dependencies`. |
| Earlier-source native tests and warning gate at `ef49ed6` | Optimized actual GLib 6/6 passed; application Rust 670 passed, zero failed, eight ignored; native jobs failed the warning gate | [Platform native job 134668697815](https://github.com/djshellshoxxx/deckchek/actions/runs/44265442094/job/134668697815) and [standalone native job 134668814299](https://github.com/djshellshoxxx/deckchek/actions/runs/44265441929/job/134668814299) confirm these results with real dependencies. The gate rejected 34 vendored-GLib warnings: three unnecessary-parentheses and 31 lifetime-syntax diagnostics. Later check/Clippy steps were skipped. The reviewed source corrections preserve the gate; final-source native execution remains pending. |

The complete vendor whitespace check still reports the two preserved original LICENSE/official-patch-context diagnostics. The new compatibility slice passes its diff check; the original bytes remain protected by provenance.

No physical device or loopback qualification was performed in this session. Final-source browser/native CI and cross-platform package validation remain pending. Both `ef49ed6` workflows failed their native warning gate despite passing JavaScript/browser jobs and the native tests listed above; their later check/Clippy steps did not run. Neither those partial results nor the final local JavaScript pass establish final native, strict-Clippy or platform qualification. Broad Sonar findings were unavailable for a current review and are not declared resolved. Numerical thresholds, the **-12 dBFS stimulus cap**, raw evidence/history and migration compatibility remain preserved; **Fleet remains OFF by default**. **No feature is declared release-ready by this ledger.**

## FS-00 — Shared foundations (anchors, migrations, app_state, userfiles, lease, audio_out, photo, canonical, metric-compat, flags)

**Specification:** [00-shared-foundations.md](specs/00-shared-foundations.md)
**Implementation:** `src-tauri/src/{db,userfiles,capture,audio_out,photo,canonical}.rs`, `app/{features,canonical-json,sha256,metric-compat,photo-store}.js`; GLib backport in `vendor/glib-0.18.5`, provenance gate in `tools/verify-glib-backport.mjs`, actual-crate regression in `tools/glib-backport-regression`
**Status:** Baseline foundations retained; the official GLib 0.18.5 repair and separate compiler-suggested syntax patch are implemented and independently reviewed with exact provenance. Actual optimized GLib tests and application Rust tests passed at `ef49ed6`, followed by a failed warning gate. The compiler corrections preserve that gate; final-source native/platform qualification remains pending. DPAPI wrapper and notification registration remain owned by FS-20/FS-23.
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Complete final-source native tests, the unchanged compiler-warning gate, check/strict Clippy, browser checks and platform packages, including the optimized actual-GLib regression. RUSTSEC-2024-0429 remains an explicit advisory disposition: the official repair has actual-crate evidence, while final combined native acceptance is open after the compiler-compatibility correction. A version-only scanner may still flag 0.18.5, while a scanner that omits path sources may miss it; neither scanner outcome proves remediation. Notification support was intentionally removed while unregistered; add it only with actual use/registration/capabilities.
**Tests and evidence:** Existing canonical vectors and migration fixtures remain. All 10 `tests/glib-backport.test.mjs` guards pass; application, standalone fuzz and isolated regression roots each resolve local GLib 0.18.5. The 121-file normalized registry source retains its version, manifests, MIT license and copyright. Its only approved source differences are the official two-line mutable out-pointer repair and 34 compiler-suggested one-line replacements in 12 other files: three redundant parentheses removals, 29 explicit inferred lifetime paths and two existing named-lifetime paths. Every API hunk was reviewed for lifetime/type equivalence. Separate patch/metadata hashes and the unchanged original-file inventory bound these changes; independent forward/reverse patch application reconstructs all 121 final/original files. The official patch and repaired iterator hashes remain unchanged. Actual Git checkout with CRLF conversion preserves every source file and both patches, and the full guard passes on that checkout. All three locks, the actual regression test and CI workflows remain unchanged; the isolated test harness's exact GLib dependency moves only to `dev-dependencies`. The earlier extracted-module experiment reproduced an optimized pristine crash and four patched passes. Actual-crate hosted execution subsequently passed six tests at `ef49ed6`, and application Rust passed 670 with eight ignored, before the warning gate rejected the 34 vendor diagnostics. The final source fixes those exact compiler suggestions without adding allows, suppression, version relabeling or gate relaxation; fresh native results remain required. See [backport provenance](../vendor/glib-0.18.5.README.md).
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; branch_audit GLib/provenance implementation; native_audit compiler syntax correction; diagnostics_audit independent review. **Verification commit:** original GLib `74f21b39d9d418366dd9d2d7a3410fd4c660f0e0`, byte preservation `ef49ed6cfd08e94651a1536b4e4509efdccdbedb`, compiler syntax `d4151c7b0858eff27c9270d4c45866799643317e`, provenance/tooling `5960099ed4094172025dad9129dc38b148dabedf`. Final hosted outcomes are recorded in the handoff.

## FS-01 — First-run wizard

**Specification:** [01-first-run-wizard.md](specs/01-first-run-wizard.md)
**Implementation:** `app/ui/workflows/setup-wizard.js`, `src-tauri/src/wizard.rs`
**Status:** Implemented in baseline (HW: H-01)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Run owner setup/calibration hardware script H-01 and current native platform workflows.
**Tests and evidence:** `tests/setup-wizard-model.test.mjs`, smoke `wizard`
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-02 — Crash capture and diagnostics bundle

**Specification:** [02-diagnostics-bundle.md](specs/02-diagnostics-bundle.md)
**Implementation:** `src-tauri/src/diagnostics.rs`, `app/diagnostics-bundle.js`
**Status:** Implemented in baseline
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Complete the broader IPC/filesystem/redaction audit and current native checks; baseline diagnostics tests alone do not prove absence of every disclosure.
**Tests and evidence:** `tests/diagnostics-bundle.test.mjs`, Rust redaction tests
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-03 — PDF reports

**Specification:** [03-pdf-reports.md](specs/03-pdf-reports.md)
**Implementation:** `src-tauri/src/pdf.rs`, `app/report-pdf.js`
**Status:** Implemented in baseline (Windows PrintToPdf; print fallback elsewhere)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Run the current Windows WebView2 PDF spike and native print/export checks. Other platforms retain their documented print fallback.
**Tests and evidence:** `tests/report-pdf.test.mjs`, Windows spike test
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-06 — Test-media library

**Specification:** [06-test-media-library.md](specs/06-test-media-library.md)
**Implementation:** `src-tauri/src/media.rs`, `app/media-library.js`
**Status:** Implemented in baseline
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Validate the test-media library with actual owner media; retain source/confidence labels and existing profile limits.
**Tests and evidence:** `tests/media-library.test.mjs`
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-07 — External links / reveal

**Specification:** [07-open-external-links.md](specs/07-open-external-links.md)
**Implementation:** `src-tauri/src/links.rs`, `app/external-links.js`
**Status:** Implemented in baseline
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Keep the native allowlist/confirmation policy and run current native URL/file tests.
**Tests and evidence:** `tests/external-links.test.mjs`, Rust URL-policy tests
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-08 — Backup and restore

**Specification:** [08-backup-restore.md](specs/08-backup-restore.md)
**Implementation:** `src-tauri/src/backup.rs`, `app/backup.js`
**Status:** Existing restore, schema-security and dependency corrections retained; orphaned-evidence rejection and ZIP 9 boundary proof added. Final native/platform qualification remains pending.
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Run the complete native backup/restore/migration and stress tests on the updated SQLite/ZIP dependencies, including corruption, interrupted restore and safety-backup cases. Validate restoration against a real owner database without treating focused harnesses as full restore qualification.
**Tests and evidence:** Existing zip-slip, ratio, rollback, safety-backup and schema regressions remain. `integrity_ok` now requires both SQLite page/constraint integrity and `PRAGMA foreign_key_check`; a correctly shaped database with orphaned service evidence is rejected before backup or restore, without silently repairing it. `orphaned_evidence_is_refused_before_backup_or_restore` checks rejected restore leaves the live database unchanged and rejected backup leaves the source unchanged. The ZIP 9 lying-header regression verifies rejection before inflated bytes reach the sink for both settings and database entries, while retaining unchanged-live-database assertions. PR #29 extracts the unchanged application stream boundary so four direct regressions can check overrun rejection before writing, exact bytes/hash, short reads and reader errors independently of ZIP 9's earlier rejection. Prior seven-test schema and seven-test dependency harnesses remain historical focused evidence, not current full application CI.
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root backup-integrity implementation/integration; independent native review; concurrent PR #29 stream-boundary contribution reviewed by root. **Verification commit:** existing dependency/schema work retained; orphaned-evidence and ZIP 9 correction `1d2b48844105bbd5e60043c1989e0e92949aa188`; reviewed stream-boundary regressions integrated by `07bcf10df784f17cb76473db3a9f420934df2870`, included in `d9a2add`. Final CI is identified in the handoff.

## FS-10 — Pre-gig check

**Specification:** [10-pre-gig-check.md](specs/10-pre-gig-check.md)
**Implementation:** `app/pre-gig.js`, `src-tauri/src/pregig.rs`
**Status:** Implemented in baseline (HW: H-10)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Owner H-10 and current hardware/driver qualification remain. Defaults must not be enabled based on simulated tests.
**Tests and evidence:** `tests/pre-gig.test.mjs`, `tests/pregig-ui.test.mjs`
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-11 — DVS latency and buffer tuner

**Specification:** [11-dvs-latency-buffer-tuner.md](specs/11-dvs-latency-buffer-tuner.md)
**Implementation:** `app/latency.js`, `src-tauri/src/latency.rs`
**Status:** Implemented in baseline (HW: H-11, WASAPI spike)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** WASAPI-shared validation beside real DJ software and loopback measurements remain; run current Windows checks.
**Tests and evidence:** `tests/latency.test.mjs`
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-12 — Stylus wear tracker

**Specification:** [12-stylus-wear-tracker.md](specs/12-stylus-wear-tracker.md)
**Implementation:** `app/{stylus-wear,stylus-benchmark}.js`, `app/ui/workflows/stylus-benchmark.js`, `app/ui/screens/stylus.js`, `src-tauri/src/stylus.rs`; setup provenance is retained through `app/ui/analysis.js`
**Status:** Guided benchmark capture, review/save flow and replacement provenance are implemented and independently reviewed. Physical repeatability, rated-life research and final platform qualification remain open.
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Qualify repeatability with real cartridges, reference records, tracking force, signal chains and calibration; research rated-life claims per model and operating conditions. Validate the guided flow on the current native/platform builds. The code reuses existing capture/analysis and does not establish physical wear accuracy from generated signals.
**Tests and evidence:** The guided workflow records stereo 1 kHz, isolated left/right tracks and optional control vinyl, preserving both THD channels, the poorer measured separation, run IDs, actual input/pair/rate, calibration, saved setup and operator conditions. Unavailable counters, clipped/incomplete captures, missing reference tone, reversed/unverified control vinyl and inconsistent provenance remain excluded evidence. Cancellation and late capture/analysis/persistence completions retain ownership; dispatched saves are not described as rolled back. Replacement filtering uses acquisition spans so an older-stylus capture saved later cannot enter the new trend; original historical records remain. Independent review passed 55 tests across `tests/stylus-benchmark.test.mjs`, `tests/stylus-ui.test.mjs` and `tests/stylus-wear.test.mjs`, plus nine `tests/capture-sessions.test.mjs` checks: 64/64 total. The delayed-save, undated-baseline and reverse-play regressions use their actual workflow/analysis paths.
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** branch_audit implementation; native_audit independent review; root integration. **Verification commit:** `3e85ab544bf04aba73ce0be84af915bfd02527a6`, included in `ef49ed6`; final CI is identified in the handoff.

## FS-13 — Control-vinyl wear map

**Specification:** [13-control-vinyl-wear-map.md](specs/13-control-vinyl-wear-map.md)
**Implementation:** `app/wear-map.js`, `src-tauri/src/wearmap.rs`
**Status:** Implemented in baseline (HW: H-13)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Owner H-13, real control-vinyl repeatability and reference recordings remain.
**Tests and evidence:** `tests/wear-map*.test.mjs`
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-14 — Scratch stress test

**Specification:** [14-scratch-stress-test.md](specs/14-scratch-stress-test.md)
**Implementation:** `app/scratch.js`, `src-tauri/src/scratch.rs`
**Status:** Implemented in baseline (HW: skip thresholds need a sacrificial record)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Physical skip/impulse thresholds require appropriate reference media; retain the distinction between measured signal events and diagnoses.
**Tests and evidence:** `tests/scratch*.test.mjs`
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-15 — Booth feedback and hum hunter

**Specification:** [15-booth-feedback-hum-hunter.md](specs/15-booth-feedback-hum-hunter.md)
**Implementation:** `app/hum*.js`, `app/feedback.js`, `src-tauri/src/humrun.rs`
**Status:** Implemented in baseline (HW: H-15)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Owner H-15 and real booth/feedback measurements remain. The broader architecture still lacks isolation A/B and incident logging.
**Tests and evidence:** `tests/hum*.test.mjs`, `tests/feedback.test.mjs`
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-20 — Used-gear test certificate

**Specification:** [20-used-gear-certificate.md](specs/20-used-gear-certificate.md)
**Implementation:** `src-tauri/src/{signing,certificate}.rs`, `database/migrations/0014_certificate.sql`, `app/{certificate,certificate-api}.js`, `app/ui/screens/{certificate,verify}.js`
**Status:** Baseline certificate/signature implementation retained; certificate history/identity and Verify listener ownership corrections independently reviewed and integrated. HW: H-20 remains; no PDF-embedded JSON, verify the sidecar `.deckchek-cert.json`.
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Certificate chronology and screen lifecycle corrections are implemented and independently reviewed. Reconcile undated stored results explicitly; perform combined-source browser/native signing/PDF and H-20 qualification. PDF JSON remains a sidecar.
**Tests and evidence:** Existing certificate model, native signature, smoke and fuzz checks (AC-1..AC-8) remain. Independent Node 22 review passed 55/55 across `tests/certificate-screen-lifecycle.test.mjs`, `tests/verify-screen-lifecycle.test.mjs`, `tests/certificate.test.mjs` and `tests/certificate-ui.test.mjs`, plus six additional production-screen probes. The 18 new lifecycle cases produced eight passes and ten failures against earlier `ef49ed6` source, then passed on PR #29. History and identity requests only update their owned current view; an active identity creation excludes stale reads and survives cached navigation. Verify listeners retain per-activation ownership through delayed registration, rejection and cleanup. An already selected file may intentionally finish verification while the cached screen is hidden. The six extra probes cover competing identity success/error, creation/retry, listener retry, throwing stale cleanup and delayed stored-original comparison after a new selection. Cryptographic verification/canonicalization is unchanged; this screen review does not establish native signing, PDF or hardware qualification.
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** existing certificate chronology work retained; concurrent PR #29 lifecycle implementation; diagnostics_audit independent review; root integration. **Verification commit:** PR #29 `9475ac50d7ac9379c2a34d733f221f469df1397c`, integrated by `07bcf10df784f17cb76473db3a9f420934df2870` and included in `d9a2add`; final CI is identified in the handoff.

## FS-21 — Unit vs population (phases 1-2)

**Specification:** [21-unit-population-comparison.md](specs/21-unit-population-comparison.md)
**Implementation:** `src-tauri/src/pack.rs`, `database/migrations/{0015_unit_population,0022_unit_population_ext}.sql`, `app/{population,pack,pack-api}.js`, `app/population-metrics.json`, `app/ui/screens/compare.js`
**Status:** Implemented in baseline (HW: H-21; manual privacy review of an exported pack is the owner's)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Cryptographic identifier correction is implemented and independently reviewed. Complete exported-pack privacy review and current native population/pack checks. Existing contributor IDs remain valid.
**Tests and evidence:** `tests/{pack,population}*.test.mjs`, `tests/compare-entrypoints.test.mjs`, Rust pack tests, smoke `compare` (real Results/History/Devices entry points), fuzz target `pack` (AC-1..AC-9)
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root implementation; ci_audit independent review. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-22 — Service worksheets

**Specification:** [22-service-worksheets.md](specs/22-service-worksheets.md)
**Implementation:** `src-tauri/src/service.rs`, `database/migrations/0016_service_worksheets.sql`, `app/{service,service-api}.js`, `app/ui/screens/service.js`, `app/ui/workflows/service-job.js`, `app/report-kinds/jobsheet.js`
**Status:** Implemented in baseline (HW: H-22)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** H-22 and final native/browser service qualification remain. The reproduced shortcut and stale-request ownership defects are corrected; this is not a blanket clearance of all asynchronous code.
**Tests and evidence:** `tests/service*.test.mjs` (incl. PII leak), smoke `service` (AC-1..AC-8). Eight new lifecycle cases exercise the real screen/shell; six failed before the correction. Independent review passed 48 focused checks and five additional request/navigation edge cases, preserving new form input and current-request Retry behavior.
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** service_lifecycle implementation; ci_audit independent review. **Verification commit:** `9192aa0863280300fef3799b09a981ef8c90496b`; final CI is identified in the handoff.

## FS-23 — Venue fleet dashboard

**Specification:** [23-venue-fleet-dashboard.md](specs/23-venue-fleet-dashboard.md)
**Implementation:** `src-tauri/src/fleet.rs`, `database/migrations/0017_fleet_dashboard.sql`, `app/{fleet,fleet-api}.js`, `app/ui/screens/{fleet,fleet-venues}.js`, `app/ui/booth-sheet.js`
**Status:** PARTIAL (implemented and wired for manual opt-in; flag `fleet` default off pending owner H-23 hardware and real-database qualification)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Chronology correction is independently reviewed. H-23 and a real-database walkthrough remain; fleet stays OFF by default.
**Tests and evidence:** `tests/fleet*.test.mjs`, smoke `fleet` (AC-1..AC-9); owner H-23 and real-database walkthrough remain unexecuted
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** ci_audit implementation; root independent review. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-30 — Mobile companion + phone import

**Specification:** [30-mobile-companion.md](specs/30-mobile-companion.md)
**Implementation:** `mobile/**`, `app/phone-run.js`
**Status:** Implemented in baseline (hosting deliberately not enabled: owner decision R12; HW: real phones)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Real-phone/PWA qualification and approved hosting decisions remain. No deployment is performed.
**Tests and evidence:** `tests/mobile-*.test.mjs`, `tests/phone-*.test.mjs`
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-31 — Timecode doctor live monitor

**Specification:** [31-timecode-doctor-live-monitor.md](specs/31-timecode-doctor-live-monitor.md)
**Implementation:** `src-tauri/src/{monitor,tray}.rs`, `database/migrations/0019_monitor_log.sql`, `app/monitor.js`, `app/ui/screens/monitor.js`
**Status:** Baseline monitor retained; stale settings reads and competing save/prune ownership corrected and independently reviewed. HW: H-31 and WASAPI-shared capture beside DJ software remain unverified; negative-SNR floor is supported for an acquired coherent carrier, while cold-start/changing-pitch noise remains limited.
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Complete combined-source browser/native checks, shared capture alongside real DJ software and H-31. Cold-start/changing-pitch negative-SNR limitations remain. The monitor performance gate passed locally at `d9a2add`; it does not establish hardware repeatability or shared-driver behavior.
**Tests and evidence:** Existing `tests/monitor*.test.mjs` and smoke `monitor` checks (AC-1..AC-8) remain. Independent review passed 54/54 across `monitor-settings-lifecycle`, `monitor`, `monitor-ui` and `monitor-regressions`, plus three additional real-screen probes. A successful save advances the initial-read revision, preventing older values or errors from resetting saved preferences. One operation owns both the native settings write and subsequent prune: form controls are disabled, programmatic re-entry is refused, and controls are released on success or failure. A failed write does not prune; a failed prune reports that the settings were already saved. Cached navigation preserves operation ownership and intentional background monitoring. The three extra probes cover failure after an earlier success, hidden delayed commit/prune failure and retention validation/retry: unchanged PR #29 had one pass/two failures; the follow-up passed all three. These checks establish screen/native-call ordering with deferred boundaries, not an atomic database transaction or ordering against external writers.
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** concurrent PR #29 initial-read correction; native_audit serialized-save implementation; diagnostics_audit independent review; root integration. **Verification commit:** PR #29 integration `07bcf10df784f17cb76473db3a9f420934df2870`; independently reviewed follow-up `71f840ad9b830ec943631ca8c937c4670b15e691` integrated as `d9a2add7b09ecb21a63e964f7fcd1b78fc54b47a`. Final CI is identified in the handoff.

## FS-32 — MIDI mapper studio

**Specification:** [32-midi-mapper-studio.md](specs/32-midi-mapper-studio.md)
**Implementation:** `src-tauri/src/mapper.rs`, `database/migrations/0020_mapper_models.sql`, `app/mapper/**`, `app/ui/screens/mapper.js`
**Status:** Implemented in baseline (HW: H-32; VirtualDJ format unverified; Serato and Traktor are reports only)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Verify VirtualDJ import/export against an actual installation; Serato/Traktor outputs remain reports. Stable physical MIDI identity and H-32 remain. Final browser/native CI must qualify the reviewed save-association correction.
**Tests and evidence:** `tests/mapper*.test.mjs`, smoke `mapper`, JS fuzz targets `mapper-xml`, `mapper-vdj` (AC-1..AC-7). Five new lifecycle cases exercise the real screen/store/shell; three failed before the correction. Independent review passed 47 focused checks and four additional concurrency/notification/error probes. A save for one mapping can no longer assign its stored ID to a newly opened mapping and redirect that mapping's next write.
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** mapper_async_review implementation; service_lifecycle independent review. **Verification commit:** `00f1f3cc8d96527f436ee28958ed23201b60a01b`; final CI is identified in the handoff.

## FS-33 — Gear ledger static export

**Specification:** [33-gear-ledger.md](specs/33-gear-ledger.md)
**Implementation:** `src-tauri/src/ledger.rs`, `database/migrations/0021_gear_ledger.sql`, `app/ledger/**`, `app/ui/screens/ledger.js`
**Status:** Implemented in baseline (HW: H-33; GitHub Pages guide wording to verify)
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Physical/product acceptance H-33 and published guide review remain. No publishing is performed; hashing/canonical ordering must not be changed to silence inappropriate lint suggestions.
**Tests and evidence:** `tests/ledger*.test.mjs` (incl. leak test), smoke `ledger` (AC-1..AC-7)
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** root integration; existing feature implementation retained. **Verification commit:** baseline `4466cc0`; continuation source and CI are identified in the handoff.

## FS-34 — Device test completeness

**Specification:** [34-device-test-completeness.md](specs/34-device-test-completeness.md)
**Implementation:** `app/devices/{test-plan,library,dispatch}.js`, `app/device-checks.js`, `tools/check-device-coverage.mjs`, `app/ui/devices/library-state.js`, `app/ui/screens/devices.js`
**Status:** Software plan coverage retained; finite-evidence evaluation and result chronology corrections implemented and independently reviewed. Hardware-qualified tests remain separate.
**Completion percentage:** The prior continuation recorded 5/5 enumerated software ACs (100%). This consolidation does not rescore the full AC set or convert that historical software score into hardware or release qualification.
**Remaining work / blocking dependencies:** Research the 29 conditional controller audio-output profiles from manufacturer sources. Existing no-audio profiles must not receive stimulus tests. Certificates continue to use versioned researched plans. Reconcile unverified result timestamps through explicit evidence review rather than silently selecting a favorable record.
**Tests and evidence:** Device selection compares validated observation instants, including fractional seconds/timezone offsets, and retains adverse equal-time or unorderable evidence. Latest valid chronology is selected separately from unresolved rows, making verdicts independent of input order; an ordinary later valid pass can still supersede an older valid failure. Device progress, inspector/history chips and reports derive review status without modifying stored observations. Numeric criteria require finite numbers and bounds, preserve categorical equality/default all-seen semantics, and cannot reuse an older pass when the newest measurement is unavailable. The device-library/test-plan/Fleet/certificate scope passes 73/73; the numeric/audio scope passes 70/70. Existing profile coverage checks remain applicable.
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** diagnostics_audit implementation; root and native_audit independent review; root integration. **Verification commit:** numeric `934f9fd`, chronology `10d6057` plus order-independent follow-up `a8038a0`, included in `ef49ed6`; final CI is identified in the handoff.

## FS-35 — Output audio quality

**Specification:** [35-audio-quality-test.md](specs/35-audio-quality-test.md)
**Implementation:** `app/audio-quality.js`, `app/devices/audio-session.js`, `app/ui/devices/audio-runner.js`
**Status:** Existing integrity/UX corrections and additional finite-evidence/incomplete-result corrections independently reviewed; current native/browser/platform qualification pending.
**Completion percentage:** The prior continuation recorded AC-1 through AC-6, 6/7 listed criteria (86%). This consolidation does not rescore the full AC set. AC-7 physical loopback/reference qualification remains open; the historical criterion score does not establish release readiness.
**Remaining work / blocking dependencies:** Complete current-head browser/native/platform CI and physical AC-7 loopback/reference measurements. Investigate the inherited intermittent Node 24 numerical anomaly separately; numerical tolerances and stimulus limits remain unchanged.
**Tests and evidence:** `tests/audio-quality.test.mjs`, `tests/audio-session.test.mjs` and `tests/audio-runner-lifecycle.test.mjs` remain in the focused suite. Nonfinite, coercible or missing measurements/bounds cannot satisfy numeric criteria; an unavailable newest observation cannot reuse an older passing value. Incomplete audio-quality evaluation now retains an explicit review finding and unavailable detail instead of saying every check passed. The combined device-check/test-plan/audio scope passes 70/70. Independent finite-value comparisons preserved 1,350 existing verdict/detail outcomes and unchanged default thresholds. The seven browser checks at [CI 44251830325](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624237913) are historical `742c67a` evidence, not current-head platform qualification.
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** prior audio_quality_completion work retained; diagnostics_audit finite-evidence implementation; native_audit independent review; root integration. **Verification commit:** prior `742c67ab93ab52baafa278cc48c6ca7c6d0a8df7`, new `934f9fd`, included in `ef49ed6`; final CI is identified in the handoff.

## FS-36 — MIDI conformance and General MIDI

**Specification:** [36-general-midi-test.md](specs/36-general-midi-test.md)
**Implementation:** `app/{midi-conformance,midi-tests,midi}.js`, `app/ui/devices/midi-runner.js`, `src-tauri/src/midi.rs`
**Status:** Timing-evidence, GM action cancellation, browser/native connection ownership and transport-loss corrections implemented and independently reviewed. Stable physical identity and hardware work remain.
**Completion percentage:** Not freshly scored; acceptance-by-acceptance audit is still required.
**Remaining work / blocking dependencies:** Run final native/browser/platform CI. Stable native logical/physical port identity, same-name replacement without an observed disappearance/error, unreadable-name ambiguity, hot-plug continuity and real Identity Reply/GM hardware qualification remain. A captured output that fails or disappears stays retired until explicit connection reset; restarting DeckChek is the currently exposed recovery. New unique selection and preserved captured ownership do not establish physical-device identity across OS re-enumeration.
**Tests and evidence:** The five JavaScript MIDI suites, including new `tests/midi-bridge.test.mjs`, pass 92/92. Invalid, missing, reversed or zero-span timing cannot fabricate a latency pass; conformance retains packet evidence with unverified timing marked for review. GM generation ownership prevents stale step switches from restarting after newer Play, Silence or Save actions. Browser permission/listener setup is coalesced; per-input/global closes invalidate pending work and wait for owned cleanup. Duplicate names cannot acquire a new binding, captured callbacks/outputs are retained, and cleanup cannot silently use a replacement object. Native failed event delivery increments transport loss; queued blocking opens are invalidated before driver access; failed/pruned outputs retain tombstones so subsequent cleanup never reconnects by display name. Native input review passed 22/22 and output review passed 26/26 in exact production-module harnesses with controlled environment stubs. Those overlapping harness scopes do not replace full Cargo or hardware qualification.
**Hardware qualification:** Pending / not executed here. **Cross-platform qualification:** Pending on the continuation. **Release-ready:** No.
**Assigned agent:** diagnostics_audit renderer/bridge implementation; native_audit native implementation; reciprocal independent review; root integration. **Verification commit:** transport loss `0cf8b32`, GM `2ba8125`, timing `96da885`, bridge `2a00493` plus `2eabf38`, native opens `24adde0597fe0c56de61c3f14759d3b52cedf82e`, native output ownership `951457ab4d7336f4283e42176a1f53f6e8d597ba`; all included in `ef49ed6`. Final CI is identified in the handoff.

## Additional architecture and integration work

| Area | Current status | Acceptance / dependency / next work |
|---|---|---|
| MIDItest integration | Proposal and contracts; consumer not imported | Stable logical ports, SysEx policy, scheduling, capture diagnostics, events and migration compatibility require the actual pinned consumer/license review. Licensing/access model, hosting, issuer design and Electron retirement remain owner decisions. Do not infer these decisions from authorization to consolidate DeckChek. |
| SPEC-01 pitch/speed/THD/wow-flutter | Implemented deterministic metrics/proxies | SPEC-08/19 reference measurements and repeatability are not complete. Preserve thresholds and proxy labels. |
| SPEC-02 vendor DVS decoders | Generic analysis only | Vendor-specific format/licensing feasibility is unresolved. |
| SPEC-03 advanced vinyl classifiers | Partial | Skip, locked-groove, warp/off-center and non-fill classifiers need labelled reference data and false-positive acceptance. |
| SPEC-05 booth isolation and incident logging | Partial | Hierarchy and feedback step test exist; isolation A/B and incident history remain to be implemented and specified precisely. |
| SPEC-10 CDJ/media-player transport/digital diagnostics | Not committed as a release feature | Define scope and hardware protocol acceptance before implementing speculative tests. |
| Controller HID diagnostics | Missing specified workflow | Authoritative device protocol mappings and a testable specification are required. |
| Hardware profile expansion | 45 profiles; 29 conditional controller audio tests | Research capabilities per exact model/revision/firmware using manufacturer documentation; do not invent mappings. |
| SPEC-17 signing and automatic updates | Not qualified | Owner certificates, release policy and actual distribution testing; no release/deployment authorized here. |

No numerical percentage is assigned to these broad items until their acceptance criteria and required decisions are explicit.

## Prioritized remaining work: code versus external qualification

| Priority | Work type | Remaining area | Required next evidence or implementation |
| --- | --- | --- | --- |
| P0 | Publication and review evidence | Reviewed combined source and any subsequent findings | Tie publication and hosted gates to `5960099`. PR #29 lifecycle/ZIP work, the scoped PR #28 SQLite correction, monitor ownership and GLib compiler/provenance corrections are incorporated; later contributions still require their own review and affected gates. Broad Sonar findings remain unavailable, not cleared. |
| P0 | Native/browser/platform qualification | Current code snapshot, including both GLib patches and backup/MIDI changes | Complete final-source native tests, the unchanged warning gate, check/strict Clippy, browser checks, packaged platform smoke and the optimized actual-GLib regression. Earlier native tests passed before the warning gate failed; the reviewed compiler correction still requires a fresh native result. Use normal native prerequisites without bypassing development-metadata checks. |
| P1 | Remaining code and interface design | Stable MIDI logical/physical identity and broader MIDItest consumer integration | Define and implement identity across same-name re-enumeration, unresolved name reads and hot-plug continuity without redirecting old cleanup. The reviewed connection/tombstone fixes are bounded ownership corrections, not the entire proposed transport architecture. |
| P1 | Remaining code | FS-15 / SPEC-05 isolation A/B and incident history | Implement the still-missing comparison workflow and incident log with explicit acceptance criteria. Existing hierarchy, hum measurements and feedback step tests remain separate implemented capabilities. |
| P1 | Research-dependent development | Conditional controller audio capabilities and expanded device protocols | Obtain model/revision/firmware-specific manufacturer evidence for the 29 conditional profiles; preserve no-audio exclusions and unavailable states. HID, vendor DVS and CDJ/media-player diagnostics still need authoritative protocols and scope. |
| P1 | Physical qualification | FS-35 loopback, FS-12 stylus benchmarks, MIDI/GM/Identity Reply, DVS/monitor and Fleet | Run reference/loopback and owner hardware scripts with the actual device, driver, calibration and signal chain. Establish repeatability/false-positive limits; Fleet stays OFF until H-23 and real-database qualification. Generated signals and stubs do not satisfy these requirements. |
| P2 | Remaining code or explicitly retained format limitation | PDF-embedded certificate payload and advanced vinyl classifiers | Certificates currently verify the `.deckchek-cert.json` sidecar; embedded PDF JSON is not implemented. Advanced vinyl classifiers require labelled reference data and defined acceptance before expansion. |
| P2 | Owner/external qualification | Real databases, phones, software interoperability and distribution decisions | Complete backup/service/Fleet walkthroughs, phone/PWA checks, VirtualDJ verification, exported-pack privacy review, signing/update certificates and distribution acceptance. Hosting, licensing/access, issuer design and Electron retirement remain recorded owner decisions. |

## Next development order

1. Publish and verify the reviewed combined code snapshot, keeping report-only successors distinct from source changes. Reconcile any later compatible contribution before crediting earlier gates to it.
2. Complete strengthened current-head CI, including optimized actual-GLib, application Rust, the unchanged warning gate, check/strict Clippy and packaged platform gates; resolve real failures without suppressing them.
3. Review broad Sonar findings when available and implement the remaining defined code gaps, especially stable MIDI identity and FS-15 isolation A/B/incident history.
4. Research conditional audio profiles, physical reference requirements and the remaining specified reporting/device capabilities. Guided FS-12 capture is now implemented; its remaining work is qualification and evidence quality, not a missing capture screen.
5. Perform hardware, real-database, software-interoperability and owner/distribution qualification separately. Retain raw observations, original history, thresholds, the -12 dBFS cap and default-OFF Fleet behavior throughout.

## Refreshed hardware research issues

Issues [#3](https://github.com/djshellshoxxx/deckchek/issues/3), [#4](https://github.com/djshellshoxxx/deckchek/issues/4), [#5](https://github.com/djshellshoxxx/deckchek/issues/5), [#6](https://github.com/djshellshoxxx/deckchek/issues/6) and [#7](https://github.com/djshellshoxxx/deckchek/issues/7) remain open. They require model/revision-specific manufacturer evidence, dated manuals and firmware/driver applicability; explicit MIDI/HID/audio/analog/manual transport and unavailable states; additive compatibility; and small researched profile batches. The latest profile/index checks pass for 45 devices. That automated coverage count does not establish hardware qualification or completion of all issue requirements. No new model mapping was invented during this consolidation.
