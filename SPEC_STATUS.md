# DeckChek spec status (work list)

## Current consolidation and evidence continuation — 20 November 2026

PRs #54, #58 and #59 are merged. Current main at this checkpoint is
`cfb1137d3d01ddd4a9fd0677113314dc7deb76ee`. #58 and #59 passed all applicable standard,
nightly, six-build and five-packaged-smoke gates; both merged trees matched
their qualified candidates exactly.

The [current continuation](docs/engineering/CDJ04_EVIDENCE_CONTINUATION_2026-11-20.md) consolidates the provisional
CDJ evidence record from #60/#61 and corrects dense reference transport,
serialization validation ordering and unknown-uncertainty reasons. Three initial
workers completed, followed by three fresh acceptance workers. Independent
verification passed **21/21** at source `25b65d6821ec40766b8cae855699c70ea7672770`,
tree `0305261c09b33c6f29250a9c313484e3dea0f397`, with all 1,590 tracked hashes
unchanged. Durable equivalent source is `2be82734281c76bf55c867b814fc2b0bc96e7201`.

The evidence continuation requires its own hosted qualification. Its records
remain unverified and ineligible for reports; capture, SQLite/history, HTML
export, scientific metadata and physical validation remain unfinished. Native
and browser existing-unit profile assignment is already implemented; physical
device identity and continuity remain separate gates. Use the linked current
report and live refs for the next action. Dated snapshots below preserve history
and do not describe the current queue. Fleet stays off by default.

## Historical CDJ calculation checkpoint — 20 November 2026

The [current continuation](docs/engineering/CDJ04_CONTINUATION_2026-11-20.md) retains unchanged Ledger candidate #58 and
original CDJ-04 prototype #57, and fixes three numerical-contract defects in the
new isolated helper. Initial code/functional/defensive workers completed; three
fresh successors accepted corrected combined source
`abafd5565e00a2154b6b833e20ccd3a42a713ae7`, tree
`1126a31bfc95aabc71ca5532bc8bed57b49ef7fc`. Durable equivalent source is
`014b150b6c85a6795fb1ae015ea2eb6d97b3c029`.

Fresh focused verification passed 11/11 on Node 22.23.4, with all 1,568 tracked
hashes unchanged. Original 8/3 failure evidence and author 11/11 remain separate.
This is an unwired calculation prototype; capture, full provenance, reporting
and hardware remain open. Its own hosted gates are pending. Preserve #58's
published head and source-specific results while the separate successor qualifies.
Nine superseded input PRs are closed with branches retained; #54's final hosted
gates remain open. Read live refs and the current report before integration.

## Historical Ledger publication checkpoint — 20 November 2026

Main is `e49ea1bbafb5005fdf1dfcf60d885b82d0191471` after PR #46 merged.
The [current Ledger continuation](docs/engineering/LEDGER_CONSOLIDATION_2026-11-20.md) consolidates #47 and the #49–#56
publishing/persistence stack above #54's combined #48/current-main source.
Three initial workers found and corrected note acknowledgement ownership,
reload ordering, saved-note key handling, recovery copy and current guide docs.
Three fresh successors completed independent code, functional and defensive
acceptance at source `e04d6332185063b62c75f0e2cabdc1654a719079`, tree
`88b3f2c43967ae3695d9974a8b69b7be5b6bd6c2`.

The combined Node 22.23.4 suite passed **2,222 / zero failures / one optional
skip** across 184 files; all 1,550 tracked hashes stayed unchanged. Static checks,
434 module syntax checks and both performance proxy tests passed. The author's
80/80 and independent 28/28 focused scopes overlap this total. Durable source
`68d49cc0cb26ab8444d54cdaab50fabdf81bd46a` has the exact tested tree and retains
all original #47–#56 heads as ancestors. Current publication/hosted gates are in
the report; earlier source results do not qualify new bytes. Preserve branch ancestry,
original failures, owner/hardware gates, Fleet default-off and existing limits.
The dated sections below preserve history and do not describe the current queue.

## Historical first continuation — 20 November 2026

PRs #34, #38 and #45 are merged. Verified main at this checkpoint is
`f46abbea458ba2bb8c2f6d438eba4f5b0a58c948`, including ZIP corrections accepted
by three fresh reviewers and passing standard, nightly and desktop workflows.
Nine superseded stacked PRs are closed; their branches are preserved.
PR #46's isolated Ledger diagnostics now target main with separate gates.

The [current continuation report](docs/engineering/CONTINUATION_2026-11-20.md) records consolidation evidence,
source-specific successor work, review handoffs and remaining qualification.
Use it and live refs for the next action. The sections below preserve dated
history; their old queue states do not describe current publication.

## Historical combined continuation — 19 November 2026

The candidate `integration/deckchek-consolidation-20261120` combines the latest
PR #34 repairs with the ZIP stack from PRs #35–#37 and the independently reviewed
Devices navigation correction. Application/test source is
`da9099b648bebdf4ee0f65a34de75cef5f20114f`, tree
`1de031ce74b121cdace67fa091d488b256c5da2e`.
The [durable executable source](https://github.com/djshellshoxxx/deckchek/commit/46845c761d0cf7d69451ed9343ee89aa649c2706)
has that exact tree at remote commit `46845c761d0cf7d69451ed9343ee89aa649c2706`;
Git object creation alone does not publish a branch or qualify hosted checks.
The [combined consolidation handoff](docs/engineering/CONSOLIDATION_ZIP_DEVICES_2026-11-19.md) records source ancestry, preserved
repairs, verification, hosted status and remaining limits.

The full serial Node 22.23.4 suite passed **2,171 tests / 0 failures / 1 optional
Mixxx-corpus skip** across 179 test files, with all 1,527 tracked source hashes
unchanged. The final ten Devices regressions and focused 29-test compatibility
scope also passed. Their overlapping counts must not be added together.
Device/timecode/migration/mobile checks, all 428 JavaScript syntax checks and
both unchanged performance budgets passed with source hashes unchanged.
Earlier PR results do not qualify the new combined source. The owned candidate
targets `main` so standard, nightly and platform checks apply. Inspect its current
PR and merge only after its applicable checks pass. Keep published PR #34–#37 heads stable
while their existing checks complete, and refresh live refs before any write.

The fresh audit found no missing implementation in the 29 historical branches;
all original branches remain preserved. Fleet stays disabled by default.
Physical, real-database, signing and release qualification remain open. The
sections below retain historical snapshots and their original evidence.

## Historical source41 prepublication snapshot — 18 November 2026

**18 November 2026 (America/Los_Angeles).** Code `a0c116cbdbfa1bfb940a53d24332453dbe3e02a9`, tree `751ba0df2acde7e05a37d25927ef013543ffdace`. The [source41 report](docs/DECKCHEK-CONTINUATION-41.md) records accepted learned-map profile identity, optional native incident latest-reading evidence, fifteen MIDI transport facts across fourteen profiles, and Push3's documented 16-in/16-out USB channels. Pack candidate checks passed 16/16, related 32/32 and unchanged independent 3/3; independent acceptance is **ACCEPT_FOR_INTEGRATION; all three findings resolved (review `7cf97921a5052faa32c669b154e5576682d50848ffe51c1596122876edb9f77f`)**.

Coverage is **45 profiles / 506 handwritten / 187 generated / zero gaps**, with **22 conditional audio profiles** and **3 conditional MIDI profiles / 9 requirements**. The complete serial Node 22.23.5 suite passed **1,975/0/1** (1,976 total; 162 top-level files; **257.854541805 TAP seconds**). All **11** local static/performance/syntax gates passed, including 426 syntax files and 25 migrations, with all **1,480** source hashes/tree unchanged before and after every gate. The report separately binds the prior bounded **45/45** native proof to this tree without claiming a new full Tauri run. Source39's three workflows and source40's primary workflow have completed successfully at their own exact trees; they do not qualify source41. No source41 hosted result or merge is asserted. Fleet stays OFF.

The dated source40 and earlier sections below preserve historical snapshots. Current feature/queue rows are updated separately; prior verification counts, failures and branch dispositions retain their original sources.

<a id="current-source40-native-catalog-and-controller-provenance"></a>

## Historical source40 prepublication snapshot — 18 November 2026

Source [`20a8c342`](https://github.com/djshellshoxxx/deckchek/commit/20a8c34261d2aa801335a812fbc3c5987cf28587) adds selected native setup-catalog transfer and exact DDJ-REV1/REV5 provenance. The complete serial Node 22.23.5 suite passed **1,835/0/1** (1,836 total; 151 files; **253.593508232 TAP seconds**), with all **1,447** frozen files unchanged; local static/proxy gates passed, including **411** syntax files. The [source40 report](docs/DECKCHEK-NATIVE-CATALOG-FOLLOWUP.md) records the accepted 18/18 bounded native core, 146/146 related Node scope, corrected chooser regression and all retained failures. Coverage remains **45 profiles / 506 handwritten / 187 generated / zero gaps**, with **23 conditional audio profiles** and **17 conditional MIDI profiles / 51 requirements**; reviewed provenance covers 25 existing profiles.

This is a **prepublication source40 snapshot**. Existing draft PR32 remains at published `cc15026a`; its verified primary browser **1,338/1,338**, cross-JavaScript **1,780/0/1** and ASan **730/0/8 ignored** results qualify that preceding tree, not the new catalog bytes. Root intends a distinct draft follow-up after documentation acceptance so PR32 can finish its current gates. No follow-up branch/PR number is assigned here. Native device-profile association, full new-source hosted/platform checks, broad Sonar and hardware remain open. Fleet stays OFF.

<a id="current-source39-correction"></a>

## Historical source39 prepublication correction

The [logical MIDI and mixer follow-up](docs/DECKCHEK-LOGICAL-MIDI-FOLLOWUP.md) records the accepted logical-ID/Runner/Mapper contract, DJM-450/DJM-900NXS2 provenance and browser-smoke repairs. Source `04bbc714` passed the complete serial Node 22.23.5 suite **1,780/0/1** (1,781 total, 148 files, **249.818975973 TAP seconds**) and all local static gates; all **1,434** frozen files remained unchanged. The initial full **1,779/1/1** failure and corrected **16/16** profile scope remain separate evidence. Existing draft PR32 is at `61e265f`; publication of the new source is pending. Published-head native/JavaScript successes and unresolved browser failures do not qualify the new bytes. Physical identity/continuity, MIDItest consumer integration, broad Sonar and hardware remain open; Fleet stays OFF.

## Historical source38 prepublication snapshot

Source `fe936f7d48db2633ba3c2e948c682fa49ab68490` (tree `f74910a66e7bf9da818185fc87d4ec22a8cf2b4c`) adds streaming native support-history validation to accepted source37. The complete serial Node 22.23.5 suite passed **1,747/0/1** (1,748 total; 147 files; **265.537171973 TAP seconds**), with all **1,429** frozen files unchanged; local static gates passed. The separate exact native-core/harness run passed **23/23**, with bounded allocator measurements and explicit full-application exclusions. See the [current report](docs/DECKCHEK-NATIVE-HISTORY-FOLLOWUP.md) for the increased cumulative-allocation/time tradeoff and qualification limits.

The intended draft branch remains `review/deckchek-midi-profile-20261118`, targeting `integration/deckchek-consolidation-20261118` at `0acb612`; no branch/PR is published in this snapshot. It preserves the contribution of stable PR30 head `72dd38c`. Source37’s report remains an unchanged earlier snapshot. Current-source hosted/native-platform/Chromium, broad Sonar and hardware gates remain open; Fleet stays OFF.

## Historical source37 MIDI/profile snapshot

Source `2ec083c411c7f9353fb0926fdf6dd828e200c5a0` (tree `795cfa22f3eb4d4b7e7838100b60e158f3c0424d`) adds explicit MIDI transport prerequisites and exact-model DDJ-GRV6/XDJ-AZ provenance. The complete serial Node 22.23.5 suite passed **1,747/0/1** (1,748 total; 147 files; 247.940381799 TAP seconds), with all **1,428** frozen files unchanged; static gates passed. Coverage remains **45 profiles / 506 handwritten / 187 generated / 0 gaps**, with **23 conditional audio cases** and **20 conditional MIDI profiles / 60 requirements**. Reviewed provenance now covers 21 existing profiles, without physical qualification. See the [follow-up report](docs/DECKCHEK-MIDI-PROFILE-FOLLOWUP.md).

This is a prepublication snapshot for the intended `review/deckchek-midi-profile-20261118` branch into `integration/deckchek-consolidation-20261118` at `0acb612`. The follow-up descends from published PR30 at `72dd38c` and preserves its contribution; PR30’s head stays stable. The integration base keeps existing nightly/platform gates applicable. The Windows pass at `72dd38c` is preceding-head evidence. Source37 hosted/browser/native/platform, broad Sonar and hardware gates remain open. The separate native support-history memory work is outside this source. Fleet stays OFF.

## Historical checkpoint 35 snapshot

The reviewed source is `3aa4d964bc4091a2c16aac042a9bce9b2f8aeec5` (tree `8f47b511c8de5cbdfd183f6fd7e119e708edc513`). It combines both browser archives, history navigation, Windows test corrections, Fleet result ownership and concurrent integrity/profile repairs. The complete serial Node 22.23.5 suite passed **1,722 tests, zero failures and one optional Mixxx-corpus skip (1,723 total; 246.284718878 TAP seconds)** across 146 files, with all 1,424 frozen files unchanged. Current coverage is **45 models, 506 handwritten checks, 187 generated checks and 23 conditional audio cases**; reviewed provenance covers **19 existing profiles**. See [checkpoint 35](docs/DECKCHEK-CONTINUATION-35.md) for exact evidence and limits.

At the **2026-11-18 15:33:18.863 UTC** inventory, the owned branch and draft [PR #30](https://github.com/djshellshoxxx/deckchek/pull/30) both reported `2c9abbc`; mergeability was true/unstable. Integration `0acb612` and main `ee5aa511` were unchanged. Source `3aa4d964` remained unpublished. The older ref discrepancy and earlier test outcomes are historical. Browser current-catalog and immutable-history transfer are implemented as separate files; native-only catalog authorities, MIDI transport inference, surrounding metrics, broader SPEC-05 work, current-source hosted qualification, broad Sonar and hardware gates remain open. Fleet stays OFF.

Updated: 2026-11-18 (checkpoint 35; final native/platform and hardware gates remain open). Source of truth: feature specs `docs/specs/FS-NN` (acceptance criteria `AC-n` in each spec's §2) and the architecture specs `docs/SPEC-NN`. Delivery plan: `docs/DEVELOPMENT-PLAN.md`. Detailed narrative: `docs/IMPLEMENTATION-STATUS.md`.

Legend: **DONE** = implemented with automated tests for every AC that can be automated; **PARTIAL** = implemented, some ACs or gates outstanding (named); **MISSING** = no code. "HW" = needs the owner's physical hardware run (`docs/testing/HARDWARE-TEST-SCRIPTS.md`) and cannot be closed in CI.

Note: the run brief described a "plugin dependency scanner". This repository is DeckChek (DJ hardware diagnostics); the work list below is derived from its own specs, as the brief instructs for that case.

## Feature specs

| Spec | Title | Status | Code | Acceptance check |
|---|---|---|---|---|
| FS-00 | Shared foundations (anchors, migrations, app_state, userfiles, lease, audio_out, photo, canonical, metric-compat, flags) | Implemented; DPAPI wrapper and FS22/FS33 photo-store first use complete; optional OS notification registration remains conditional | `src-tauri/src/{db,userfiles,capture,audio_out,photo,canonical,signing}.rs`, `app/{features,canonical-json,sha256,metric-compat,photo-store}.js` | Canonical/migration fixtures; source39 actual Windows DPAPI roundtrip passed; source41 combined gates remain separately scoped |
| FS-01 | First-run wizard | DONE (HW: H-01) | `app/ui/workflows/setup-wizard.js`, `src-tauri/src/wizard.rs` | `tests/setup-wizard-model.test.mjs`, smoke `wizard` |
| FS-02 | Crash capture and diagnostics bundle | DONE | `src-tauri/src/diagnostics.rs`, `app/diagnostics-bundle.js` | `tests/diagnostics-bundle.test.mjs`, Rust redaction tests |
| FS-03 | PDF reports | DONE (Windows PrintToPdf; print fallback elsewhere) | `src-tauri/src/pdf.rs`, `app/report-pdf.js` | `tests/report-pdf.test.mjs`, Windows spike test |
| FS-06 | Test-media library | DONE | `src-tauri/src/media.rs`, `app/media-library.js` | `tests/media-library.test.mjs` |
| FS-07 | External links / reveal | DONE | `src-tauri/src/links.rs`, `app/external-links.js` | `tests/external-links.test.mjs`, Rust URL-policy tests |
| FS-08 | Backup and restore | Existing native backup/browser archives and selected native setup transfer implemented; schema 25 incident evidence included in native backup | Native backup, catalog archives, `database/migrations/0025_incident_metric_evidence.sql` | Source40 primary 1,835/0/1 JS, 748/0/8 native and 1,347/1,347 browser; browser catalog cases use IPC fixtures. Source41 combined and actual restore/dialog/platform qualification remain separate |
| FS-10 | Pre-gig check | DONE (HW: H-10) | `app/pre-gig.js`, `src-tauri/src/pregig.rs` | `tests/pre-gig.test.mjs`, `tests/pregig-ui.test.mjs` |
| FS-11 | DVS latency and buffer tuner | DONE (HW: H-11, WASAPI spike) | `app/latency.js`, `src-tauri/src/latency.rs` | `tests/latency.test.mjs` |
| FS-12 | Stylus wear tracker | IMPLEMENTED: guided capture and replacement trend reset; browser/platform CI and physical repeatability pending | `app/stylus-wear.js`, `app/stylus-benchmark.js`, `app/ui/workflows/stylus-benchmark.js`, `src-tauri/src/stylus.rs` | `tests/stylus-{benchmark,ui,wear}.test.mjs`, `tests/capture-sessions.test.mjs`; smoke `stylus`, `stylus-benchmark` |
| FS-13 | Control-vinyl wear map | DONE (HW: H-13) | `app/wear-map.js`, `src-tauri/src/wearmap.rs` | `tests/wear-map*.test.mjs` |
| FS-14 | Scratch stress test | DONE (HW: skip thresholds need a sacrificial record) | `app/scratch.js`, `src-tauri/src/scratch.rs` | `tests/scratch*.test.mjs` |
| FS-15 | Booth feedback, hum hunter, incidents and passive support A/B | Bounded incidents/pagination/support/A/B, separate archives and optional native latest-reading evidence implemented; broader SPEC-05/H-15 open | Existing hum/support/catalog paths plus `app/incident-metric-evidence.js`, `src-tauri/src/incident_metric_evidence.rs`, migration 0025 | Accepted native 45/45, focused JS 200/200 and two performance proxies; earlier focused inventory limitation and final combined gate fields are in the source41 report. No surrounding-window or physical-cause claim |
| FS-20 | Used-gear test certificate | DONE (HW: H-20; known gap: no PDF-embedded JSON, verify the sidecar `.deckchek-cert.json`) | `src-tauri/src/{signing,certificate}.rs`, `database/migrations/0014_certificate.sql`, `app/{certificate,certificate-api}.js`, `app/ui/screens/{certificate,verify}.js` | `tests/certificate*.test.mjs`, `src-tauri/src/certificate_tests.rs`, smoke `certificate`, fuzz target `certificate` (AC-1..AC-8) |
| FS-21 | Unit vs population (phases 1-2) | Implemented; preview/save ownership and month/reset-copy candidate verified; independent acceptance ACCEPT_FOR_INTEGRATION; all three findings resolved (review `7cf97921a5052faa32c669b154e5576682d50848ffe51c1596122876edb9f77f`); H-21 remains open | `src-tauri/src/pack.rs`, `app/{population,pack,pack-api}.js`, Compare; existing migrations unchanged | Persistent 4/12 red to 16/16; related 32/32; unchanged independent probe 1/2 to 3/3 with complete inventories. Applicable hosted/native workflow qualification remains source-specific |
| FS-22 | Service worksheets | DONE (HW: H-22) | `src-tauri/src/service.rs`, `database/migrations/0016_service_worksheets.sql`, `app/{service,service-api}.js`, `app/ui/screens/service.js`, `app/ui/workflows/service-job.js`, `app/report-kinds/jobsheet.js` | `tests/service*.test.mjs` (incl. PII leak), smoke `service` (AC-1..AC-8) |
| FS-23 | Venue fleet dashboard | PARTIAL (implemented and wired for manual opt-in; flag `fleet` default off pending owner H-23 hardware and real-database qualification) | `src-tauri/src/fleet.rs`, `database/migrations/0017_fleet_dashboard.sql`, `app/{fleet,fleet-api}.js`, `app/ui/screens/{fleet,fleet-venues}.js`, `app/ui/booth-sheet.js` | `tests/fleet*.test.mjs`, smoke `fleet` (AC-1..AC-9); owner H-23 and real-database walkthrough remain unexecuted |
| FS-30 | Mobile companion + phone import | DONE (hosting deliberately not enabled: owner decision R12; HW: real phones) | `mobile/**`, `app/phone-run.js` | `tests/mobile-*.test.mjs`, `tests/phone-*.test.mjs` |
| FS-31 | Timecode doctor live monitor | Implemented with optional selected-generation latest-reading attachment to native incidents; no new acquisition or post-press window; HW/WASAPI gates open | `src-tauri/src/{monitor,tray}.rs`, `app/monitor.js`, Monitor screen and incident-evidence workflow | Existing monitor scope plus source41 incident evidence/ownership checks and both final performance gates; no physical-cause/freshness inference |
| FS-32 | MIDI mapper studio | Implemented; learned-map product-profile ownership corrected; HW H-32 and actual VirtualDJ format remain open; Serato/Traktor are reports | Existing mapper model/UI plus Devices/Runner profile association; [identity contract](docs/learned-midi-map-profile-identity.md) | Persistent 19/19, independent 11/11 and related 146/146; same/unknown legacy identity and explicit import retained; final combined gates separate |
| FS-33 | Gear ledger static export | DONE (HW: H-33; GitHub Pages guide wording to verify) | `src-tauri/src/ledger.rs`, `database/migrations/0021_gear_ledger.sql`, `app/ledger/**`, `app/ui/screens/ledger.js` | `tests/ledger*.test.mjs` (incl. leak test), smoke `ledger` (AC-1..AC-7) |

### Current logical MIDI endpoint selection

[FS-36 §7](docs/specs/36-general-midi-test.md#7-explicit-logical-endpoint-selection) supports backend/direction-scoped opaque IDs, legacy exact unique names, input-only close, captured outputs and shared pending Runner/Mapper input claims. The [source39 review](docs/DECKCHEK-LOGICAL-MIDI-FOLLOWUP.md#retained-review-findings-and-proof) retains three lifecycle findings and bounded proof. Source41 adds [learned-map profile ownership](docs/learned-midi-map-profile-identity.md) and exact transport provenance; **3 profiles / 9 MIDI requirements** remain conditional. Physical identity, hot-plug continuity, actual MIDItest consumer integration, receiving/Identity/maps and hardware remain unresolved.

### Native support-history working memory

Source38 implements bounded retained Rust history pages while preserving complete global validation, immutable originals, transaction/error ordering and the existing API. The [native contract](docs/support-isolation-native-history.md) retains the largest-row memory dependency, unchanged list limits and harmless raw-whitespace acceptance. [Measured proof](docs/DECKCHEK-NATIVE-HISTORY-FOLLOWUP.md#memory-measurement-and-tradeoff) excludes SQLite/C allocations and process RSS; full-application qualification remains open.

### Current MIDI transport prerequisites

The [source37 follow-up](docs/DECKCHEK-MIDI-PROFILE-FOLLOWUP.md#midi-planning-and-runner-behavior) corrects descriptor-object inference: USB and DIN facts stay Boolean-or-null; unresolved transports produce conditional plans and a direct prerequisite Skip action. Generated conformance without confirmed USB MIDI requires an explicitly selected output. Handwritten tests, known-USB pairing, explicit General MIDI opt-in and certificate exclusions remain unchanged. Physical port identity and real MIDI/GM qualification remain open.

### FS-36 selective consolidation

PARTIAL (software implemented, hardware unqualified; updated 2026-11-18): the pure analyzer, Identity Reply parser and GM sequences (PR21/22) plus the `midi:conformance` and `midi:gm` Devices panels, dispatch/validation and FS-34 auto-adding. Connection ownership, output selection and duplicate-name guards have regressions (`tests/midi-fs36-ui.test.mjs`, `tests/midi-runner-lifecycle.test.mjs`). Missing/reset loss counters, unavailable selected-input status or an input missing at either observation give REVIEW; before/after evidence records the shared all-input counter scope. Spec/analyzer discrepancies (identity severity, 14-bit threshold, burst rate) are reconciled without threshold changes. Browser CI at source `742c67a` passed **1,283/1,283 checks**, including all seven new FS-35 checks, with no console errors ([browser CI job 134624237913](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624237913)). Open: final integration native/platform qualification, real Identity Replies, an audible GM source and physical streams. Source follow-up: [f9075bd4b00f0d39680094afda235ff360b7febd](https://github.com/djshellshoxxx/deckchek/commit/f9075bd4b00f0d39680094afda235ff360b7febd).

Native FS-36 follow-up [b34f3c9](https://github.com/djshellshoxxx/deckchek/commit/b34f3c905ce60d64bfd15587a9c8906c3fd7a650) is independently accepted: new connections and explicit cached input reopens reject duplicate successfully read names, and ambiguous reconnects reject. Existing captured output sends/Note Off cleanup do not re-enumerate. Five new native regressions are included; the extracted-production-body harness passed 19/19 tests and six additional independent boundary checks passed. At that historical follow-up, full native CI remained pending. The later source39/source40 hosted native outcomes are recorded in the [source41 report](docs/DECKCHEK-CONTINUATION-41.md#completed-preceding-hosted-checks); source41 still requires its own hosted gates. Stable physical identity, hot-plug/same-name substitution, unreadable-name uncertainty and real MIDI hardware qualification remain open; exact semantics are in [FS-36 §6](docs/specs/36-general-midi-test.md#6-native-port-selection-and-remaining-identity-limits).

### FS-34 device test completeness and FS-35 output audio quality (PR9 consolidation, 2026-11-18)

FS-34 software coverage: `app/devices/test-plan.js`, `tools/check-device-coverage.mjs` and [the matrix](docs/testing/DEVICE-TEST-COVERAGE.md) retain **45 profiles, 506 handwritten checks, 187 generated checks and zero gaps**. Source41 leaves **22 conditional audio profiles** and **3 conditional MIDI profiles / 9 requirements** after the exact transport batch and Push3 audio successor. The final frozen coverage `--check` passed within the 11 local static/performance/syntax gates. FS-20 certificate plans retain their exclusions; plan coverage does not qualify hardware.

FS-35 PARTIAL, software only: `app/audio-quality.js`, `app/devices/audio-session.js`, `app/ui/devices/audio-runner.js`; ownership/cancellation regressions plus worst-channel response (`extra.analysisVersion: 2`), non-finite input rejection, actual-device/rate calibration matching and saved native capture provenance. Faulty or unavailable live capture evidence gives REVIEW while retaining measured values; imported-file continuity is unobserved. Phase progress, Enter/Esc and focus transitions are implemented and covered by the three focused audio suites. All seven `tools/smoke/audio-quality.mjs` checks passed within the **1,283/1,283** browser checks at source `742c67a`, with no console errors ([browser CI job 134624237913](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624237913)). Final integration native/platform qualification remains pending. No hardware/loopback run; thresholds remain unchanged DeckChek test definitions. Source follow-up: [742c67ab93ab52baafa278cc48c6ca7c6d0a8df7](https://github.com/djshellshoxxx/deckchek/commit/742c67ab93ab52baafa278cc48c6ca7c6d0a8df7).

### Reviewed lifecycle corrections and current CI scope

FS-22 correction [9192aa0](https://github.com/djshellshoxxx/deckchek/commit/9192aa0) handles Ctrl+J navigation failures visibly, removes deferred shortcut navigation and prevents stale job/comparison responses from replacing a new intake form. Independent review and 48 focused service/crosslinks/PII tests passed; this does not establish full current CI or owner H-22 qualification.

FS-32 correction [00f1f3c](https://github.com/djshellshoxxx/deckchek/commit/00f1f3cc8d96527f436ee28958ed23201b60a01b) keeps a pending save's ID/status with its originating mapping, preventing New/Open from causing the next save to overwrite the earlier mapping. Independent review accepted 47 focused tests and four additional notification/concurrency/error probes; normal edits and hide/show remain supported. Full current CI, H-32 and real VirtualDJ format qualification remain open.

At source `730d71d`, JavaScript CI passed 1,325 tests/one optional skip; [native CI failed compilation with E0428](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728404). The conflicting alias is corrected in [8acaa7a](https://github.com/djshellshoxxx/deckchek/commit/8acaa7a); fresh full native CI including later changes remains pending. The 1,283-check browser evidence above remains tied to `742c67a`. The same `730d71d` source also passed [1,283/1,283 browser checks with no console errors](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728622) and the JavaScript performance gate; its native compilation failure occurred before application tests ran. Service `9192aa0`, alias `8acaa7a`, native MIDI `b34f3c9` and mapper `00f1f3c` are later follow-ups and are not covered by that CI run.

The combined local follow-up source, including service/MIDI/mapper corrections, passed **1,338 Node 22 tests, zero failures, one optional skip** (1,339 total), and formatting passed. These local results do not establish a current full native CI pass or broad Sonar clearance.

## Architecture specs (SPEC-00..SPEC-20)

These describe the long-term product. Items that need physical hardware or vendor-licensed decoders cannot be closed by code alone.

| Area | Status | Blocker |
|---|---|---|
| SPEC-01 RPM/pitch/THD accuracy claims | PARTIAL (implemented, labelled as proxies) | HW validation against known references (SPEC-08/19) |
| SPEC-02 vendor DVS decoders (Serato/Traktor/rekordbox) | MISSING (generic decoder only) | Legal/licence feasibility; out of scope for this run |
| SPEC-03 skip/locked-groove/warp/non-fill classifiers | PARTIAL | Needs a labelled false-positive corpus |
| SPEC-05 venue hierarchy, feedback, support isolation and incidents | PARTIAL: incidents/pagination, saved supports, passive LF A/B, separate archives and native latest-reading evidence implemented | Explicit native/browser device-profile assignment is implemented; broader incident windows/shock/DVS/onset outcomes and physical qualification remain open |
| SPEC-10 CDJ transport/media/digital-output | PARTIAL: isolated pitch calculation and provisional evidence/JSON contract independently reviewed; complete player workflow remains unimplemented | No capture/database/report or physical qualification; not a release commitment |
| SPEC-17 code signing and auto-update | MISSING | Signing certificates (owner) |
| Controller HID diagnostics | MISSING | Not specified as a job |

## Release gates (from DEVELOPMENT-PLAN §1.7)

- [ ] Owner hardware runs H-00..H-33 (cannot run in CI).
- [ ] Full automated suite green on the release commit (npm test, cargo test Linux+Windows, ui-smoke, fuzz smoke).
- [ ] Owner checks left open by M7/M8: FS-31 WASAPI-shared spike (H-31 steps 1-6), FS-32 VirtualDJ format (H-32 step 7), FS-33 real GitHub Pages publishing/privacy walkthrough (H-33; wording source-reviewed 20 November 2026), FS-21 owner export/import walkthrough and source41 hosted qualification, FS-23 H-23 hardware and real-database qualification before enabling fleet by default (currently off; manual opt-in available).

## Historical source39 feature-row snapshot

The following rows are retained verbatim from published `cc15026a`, before source40 updated the current tables above. They preserve the earlier scope and pending states; they do not describe source40 completion.

| Spec | Title | Status | Code | Acceptance check |
|---|---|---|---|---|
| FS-08 | Backup and restore | DONE software; current-source hosted qualification pending | Native backup, workspace JSON, `app/{venue-history-archive,catalog-archive}.js` and Data panels | Original native regressions plus accepted browser archive/model/handler proof; separate file guarantees retained |
| FS-15 | Booth feedback, hum hunter, incidents and passive support A/B | Bounded incident/pagination/support/A/B and both browser archives implemented; hosted/hardware H-15 and broader SPEC-05 pending; no aggregate percentage | Hum, incident/support stores and UI, Equipment/Data archives, native incident/support cores | Actual store/UI/report tests, numerical references, exact native-core and differential proof; authored browser smoke |

| Area | Status | Blocker |
|---|---|---|
| SPEC-05 venue hierarchy, feedback, support isolation and incidents | PARTIAL: incidents/pagination, saved supports, passive LF A/B and separate history/current-catalog archives implemented | Native-only booth/position/settings authorities, surrounding metrics, broader isolation outcomes and physical qualification remain open |

## Historical source40 rows superseded by source41

These are the exact earlier rows, retained as the pre-source41 snapshot. Current rows and qualification above supersede their open-work/count wording.

| Spec | Title | Status | Code | Acceptance check |
|---|---|---|---|---|
| FS-00 | Shared foundations (anchors, migrations, app_state, userfiles, lease, audio_out, photo, canonical, metric-compat, flags) | DONE (DPAPI wrapper and notification plugin registration are owned by FS-20/FS-23) | `src-tauri/src/{db,userfiles,capture,audio_out,photo,canonical}.rs`, `app/{features,canonical-json,sha256,metric-compat,photo-store}.js` | `cargo test`, `npm test` (canonical vectors, migration fixtures v0.04/v0.0.5/v0.0.7) |
| FS-08 | Backup and restore | Selected native setup transfer and existing backup/browser archives implemented; new-source hosted qualification pending | Native backup, `src-tauri/src/catalog_archive.rs`, workspace JSON, `app/{venue-history-archive,catalog-archive,native-catalog-archive}.js` and Data panels | Source40 full 1,835/0/1; bounded exact native 18/18 and related Node 146/146; real Tauri/restore/dialog/platform gates remain open |
| FS-15 | Booth feedback, hum hunter, incidents and passive support A/B | Bounded incident/pagination/support/A/B, browser archives and native selected-setup transfer implemented; broader SPEC-05/H-15 pending; no aggregate percentage | Hum, incident/support stores and UI, Equipment/Data archives, native incident/support/catalog cores | Existing numerical/store/report proof and source40 catalog qualification; no surrounding-metric, physical-isolation or hardware claim |
| FS-21 | Unit vs population (phases 1-2) | DONE (HW: H-21; manual privacy review of an exported pack is the owner's) | `src-tauri/src/pack.rs`, `database/migrations/{0015_unit_population,0022_unit_population_ext}.sql`, `app/{population,pack,pack-api}.js`, `app/population-metrics.json`, `app/ui/screens/compare.js` | `tests/{pack,population}*.test.mjs`, `tests/compare-entrypoints.test.mjs`, Rust pack tests, smoke `compare` (real Results/History/Devices entry points), fuzz target `pack` (AC-1..AC-9) |
| FS-31 | Timecode doctor live monitor | DONE (HW: H-31; WASAPI-shared capture beside DJ software unverified; negative-SNR floor supported for an acquired coherent carrier; cold-start/changing-pitch noise remains limited) | `src-tauri/src/{monitor,tray}.rs`, `database/migrations/0019_monitor_log.sql`, `app/monitor.js`, `app/ui/screens/monitor.js` | `tests/monitor*.test.mjs`, smoke `monitor` (AC-1..AC-8) |
| FS-32 | MIDI mapper studio | DONE (HW: H-32; VirtualDJ format unverified; Serato and Traktor are reports only) | `src-tauri/src/mapper.rs`, `database/migrations/0020_mapper_models.sql`, `app/mapper/**`, `app/ui/screens/mapper.js` | `tests/mapper*.test.mjs`, smoke `mapper`, JS fuzz targets `mapper-xml`, `mapper-vdj` (AC-1..AC-7) |

| Area | Status | Blocker |
|---|---|---|
| SPEC-05 venue hierarchy, feedback, support isolation and incidents | PARTIAL: incidents/pagination, saved supports, passive LF A/B, browser archives and native selected-setup transfer implemented | Device-profile association, surrounding metrics, broader isolation outcomes and physical qualification remain open |
