# DeckChek spec status (work list)

Updated: 2026-10-28 (M7/M8 features, audit fixes, fuzzing and CI merged). Source of truth: feature specs `docs/specs/FS-NN` (acceptance criteria `AC-n` in each spec's §2) and the architecture specs `docs/SPEC-NN`. Delivery plan: `docs/DEVELOPMENT-PLAN.md`. Detailed narrative: `docs/IMPLEMENTATION-STATUS.md`.

Legend: **DONE** = implemented with automated tests for every AC that can be automated; **PARTIAL** = implemented, some ACs or gates outstanding (named); **MISSING** = no code. "HW" = needs the owner's physical hardware run (`docs/testing/HARDWARE-TEST-SCRIPTS.md`) and cannot be closed in CI.

Note: the run brief described a "plugin dependency scanner". This repository is DeckChek (DJ hardware diagnostics); the work list below is derived from its own specs, as the brief instructs for that case.

## Feature specs

| Spec | Title | Status | Code | Acceptance check |
|---|---|---|---|---|
| FS-00 | Shared foundations (anchors, migrations, app_state, userfiles, lease, audio_out, photo, canonical, metric-compat, flags) | DONE (DPAPI wrapper and notification plugin registration are owned by FS-20/FS-23) | `src-tauri/src/{db,userfiles,capture,audio_out,photo,canonical}.rs`, `app/{features,canonical-json,sha256,metric-compat,photo-store}.js` | `cargo test`, `npm test` (canonical vectors, migration fixtures v0.04/v0.0.5/v0.0.7) |
| FS-01 | First-run wizard | DONE (HW: H-01) | `app/ui/workflows/setup-wizard.js`, `src-tauri/src/wizard.rs` | `tests/setup-wizard-model.test.mjs`, smoke `wizard` |
| FS-02 | Crash capture and diagnostics bundle | DONE | `src-tauri/src/diagnostics.rs`, `app/diagnostics-bundle.js` | `tests/diagnostics-bundle.test.mjs`, Rust redaction tests |
| FS-03 | PDF reports | DONE (Windows PrintToPdf; print fallback elsewhere) | `src-tauri/src/pdf.rs`, `app/report-pdf.js` | `tests/report-pdf.test.mjs`, Windows spike test |
| FS-06 | Test-media library | DONE | `src-tauri/src/media.rs`, `app/media-library.js` | `tests/media-library.test.mjs` |
| FS-07 | External links / reveal | DONE | `src-tauri/src/links.rs`, `app/external-links.js` | `tests/external-links.test.mjs`, Rust URL-policy tests |
| FS-08 | Backup and restore | DONE | `src-tauri/src/backup.rs`, `app/backup.js` | Rust backup/restore tests incl. zip-slip and ratio limits |
| FS-10 | Pre-gig check | DONE (HW: H-10) | `app/pre-gig.js`, `src-tauri/src/pregig.rs` | `tests/pre-gig.test.mjs`, `tests/pregig-ui.test.mjs` |
| FS-11 | DVS latency and buffer tuner | DONE (HW: H-11, WASAPI spike) | `app/latency.js`, `src-tauri/src/latency.rs` | `tests/latency.test.mjs` |
| FS-12 | Stylus wear tracker | PARTIAL: guided benchmark capture not built (spec gap noted in IMPLEMENTATION-STATUS) | `app/stylus-wear.js`, `src-tauri/src/stylus.rs` | `tests/stylus-wear.test.mjs` |
| FS-13 | Control-vinyl wear map | DONE (HW: H-13) | `app/wear-map.js`, `src-tauri/src/wearmap.rs` | `tests/wear-map*.test.mjs` |
| FS-14 | Scratch stress test | DONE (HW: skip thresholds need a sacrificial record) | `app/scratch.js`, `src-tauri/src/scratch.rs` | `tests/scratch*.test.mjs` |
| FS-15 | Booth feedback and hum hunter | DONE (HW: H-15) | `app/hum*.js`, `app/feedback.js`, `src-tauri/src/humrun.rs` | `tests/hum*.test.mjs`, `tests/feedback.test.mjs` |
| FS-20 | Used-gear test certificate | DONE (HW: H-20; known gap: no PDF-embedded JSON, verify the sidecar `.deckchek-cert.json`) | `src-tauri/src/{signing,certificate}.rs`, `database/migrations/0014_certificate.sql`, `app/{certificate,certificate-api}.js`, `app/ui/screens/{certificate,verify}.js` | `tests/certificate*.test.mjs`, `src-tauri/src/certificate_tests.rs`, smoke `certificate`, fuzz target `certificate` (AC-1..AC-8) |
| FS-21 | Unit vs population (phases 1-2) | DONE (HW: H-21; manual privacy review of an exported pack is the owner's) | `src-tauri/src/pack.rs`, `database/migrations/{0015_unit_population,0022_unit_population_ext}.sql`, `app/{population,pack,pack-api}.js`, `app/population-metrics.json`, `app/ui/screens/compare.js` | `tests/{pack,population}*.test.mjs`, `tests/compare-entrypoints.test.mjs`, Rust pack tests, smoke `compare` (real Results/History/Devices entry points), fuzz target `pack` (AC-1..AC-9) |
| FS-22 | Service worksheets | DONE (HW: H-22) | `src-tauri/src/service.rs`, `database/migrations/0016_service_worksheets.sql`, `app/{service,service-api}.js`, `app/ui/screens/service.js`, `app/ui/workflows/service-job.js`, `app/report-kinds/jobsheet.js` | `tests/service*.test.mjs` (incl. PII leak), smoke `service` (AC-1..AC-8) |
| FS-23 | Venue fleet dashboard | PARTIAL (implemented and wired for manual opt-in; flag `fleet` default off pending owner H-23 hardware and real-database qualification) | `src-tauri/src/fleet.rs`, `database/migrations/0017_fleet_dashboard.sql`, `app/{fleet,fleet-api}.js`, `app/ui/screens/{fleet,fleet-venues}.js`, `app/ui/booth-sheet.js` | `tests/fleet*.test.mjs`, smoke `fleet` (AC-1..AC-9); owner H-23 and real-database walkthrough remain unexecuted |
| FS-30 | Mobile companion + phone import | DONE (hosting deliberately not enabled: owner decision R12; HW: real phones) | `mobile/**`, `app/phone-run.js` | `tests/mobile-*.test.mjs`, `tests/phone-*.test.mjs` |
| FS-31 | Timecode doctor live monitor | DONE (HW: H-31; WASAPI-shared capture beside DJ software unverified; known residual: noise louder than the carrier reads as cueing, not an alarm) | `src-tauri/src/{monitor,tray}.rs`, `database/migrations/0019_monitor_log.sql`, `app/monitor.js`, `app/ui/screens/monitor.js` | `tests/monitor*.test.mjs`, smoke `monitor` (AC-1..AC-8) |
| FS-32 | MIDI mapper studio | DONE (HW: H-32; VirtualDJ format unverified; Serato and Traktor are reports only) | `src-tauri/src/mapper.rs`, `database/migrations/0020_mapper_models.sql`, `app/mapper/**`, `app/ui/screens/mapper.js` | `tests/mapper*.test.mjs`, smoke `mapper`, JS fuzz targets `mapper-xml`, `mapper-vdj` (AC-1..AC-7) |
| FS-33 | Gear ledger static export | DONE (HW: H-33; GitHub Pages guide wording to verify) | `src-tauri/src/ledger.rs`, `database/migrations/0021_gear_ledger.sql`, `app/ledger/**`, `app/ui/screens/ledger.js` | `tests/ledger*.test.mjs` (incl. leak test), smoke `ledger` (AC-1..AC-7) |

### FS-36 selective consolidation

PARTIAL: the pure MIDI conformance analyzer, Identity Reply parser, General MIDI sequence builder and their tests are ported from PR9 with strict byte validation, corrected audible timing and large-stream handling, invalid-answer rejection and manual provenance for subjective GM results. `app/midi-conformance.js` and `tests/midi-conformance.test.mjs` cover the pure portion of AC-1–AC-4. UI panels, profile/dispatch wiring, ownership/cancellation integration, AC-5 and hardware qualification remain open. See `docs/specs/36-general-midi-test.md` for the original full-feature acceptance criteria and retained spec/source discrepancies. This does not include FS-34 or FS-35.

## Architecture specs (SPEC-00..SPEC-20)

These describe the long-term product. Items that need physical hardware or vendor-licensed decoders cannot be closed by code alone.

| Area | Status | Blocker |
|---|---|---|
| SPEC-01 RPM/pitch/THD accuracy claims | PARTIAL (implemented, labelled as proxies) | HW validation against known references (SPEC-08/19) |
| SPEC-02 vendor DVS decoders (Serato/Traktor/rekordbox) | MISSING (generic decoder only) | Legal/licence feasibility; out of scope for this run |
| SPEC-03 skip/locked-groove/warp/non-fill classifiers | PARTIAL | Needs a labelled false-positive corpus |
| SPEC-05 venue hierarchy, level-step feedback, isolation A/B, incident log | PARTIAL (feedback step test done; venue/booth/position hierarchy built with FS-23; isolation A/B and incident log not built) | — |
| SPEC-10 CDJ transport/media/digital-output | MISSING (consideration backlog, not committed) | Not a release commitment |
| SPEC-17 code signing and auto-update | MISSING | Signing certificates (owner) |
| Controller HID diagnostics | MISSING | Not specified as a job |

## Release gates (from DEVELOPMENT-PLAN §1.7)

- [ ] Owner hardware runs H-00..H-33 (cannot run in CI).
- [ ] Full automated suite green on the release commit (npm test, cargo test Linux+Windows, ui-smoke, fuzz smoke).
- [ ] Owner checks left open by M7/M8: FS-31 WASAPI-shared spike (H-31 steps 1-6), FS-32 VirtualDJ format (H-32 step 7), FS-33 GitHub Pages wording (H-33), FS-21 pack privacy review, FS-23 H-23 hardware and real-database qualification before enabling fleet by default (currently off; manual opt-in available).
