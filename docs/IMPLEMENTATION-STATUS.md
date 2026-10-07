# DeckChek implementation status

Updated: 2026-10-07

This file records implementation state separately from product specifications. A capability is not considered validated merely because a UI control exists.

## Implemented and test-covered

- Tauri 2 desktop shell with dark/light theme, nav rail navigation and responsive local UI.
- Offline local audio-file analysis through Web Audio decode.
- Native continuous stereo capture with lock-free ring buffer, ~20 Hz level events and capture-quality counters.
- Loopback interface calibration with gain, L/R mismatch, noise floor, THD+N, latency, clock ppm and coarse frequency-response correction; uncertainty propagation via GUM-style approach.
- Stereo RMS/peak/clipping, channel balance, correlation/polarity and 50/60 Hz hum-family evidence.
- Reference-tone frequency, RPM and pitch-error estimation.
- Windowed speed trace, mean RPM, drift and short-term speed-variation proxy.
- Multi-run pitch-map points with slope, maximum nonlinearity, hysteresis and dead-spot candidates.
- Signal dropout-region detection.
- Generic DVS stereo scope metrics and signal-presence timeline.
- Vinyl-side transient candidates, recurrence estimate, hum/rumble proxy, normalized event positions and condition/readiness summary.
- Reference-tone THD estimate for guided cartridge/signal checks.
- Startup/brake signal-envelope timing proxy.
- Evidence-first findings with confidence, alternative causes and isolation tests.
- Guided Setup→Capture→Results workflows for Quick Check, Speed & Pitch, Cartridge, DVS and Vinyl Scan.
- Calibration, Equipment and History screens with list/detail views.
- Live meters with peak hold and clip latch; run history A/B comparison.
- Keyboard shortcuts (Space, Esc, Ctrl+E, Ctrl+1..8) with focus management and aria-live regions.
- Catalog CRUD for manufacturer, product, asset, setup and venue; starter catalog seeding; evidence graph persistence (hypothesis/support/contradiction); repeat-scan alignment persistence; run history.
- HTML diagnostic reports with verdict-first layout and ±uncertainty badges.
- CSV measurement export and JSON workspace export/import (versioned).
- Windows standalone build: portable deckchek.exe plus NSIS and MSI installer packages from CI.
- SQLite desktop persistence using database/migrations/0001_initial.sql with session_type NOT NULL fix.
- Local 1 kHz stereo WAV fixture generator.
- JavaScript deterministic regression suite (61 tests) and Rust persistence tests (25 tests).
- CI definition for JavaScript tests/syntax checks and Rust cargo test/check; Playwright UI smoke test (56 checks).

## Implemented but still validation-gated

These functions run, but must not be marketed as standards-conformant or hardware-calibrated until SPEC-08/SPEC-19 validation is complete:

- RPM/pitch accuracy from ordinary consumer capture chains.
- short-term speed-variation proxy as a wow/flutter substitute;
- audio-derived vibration/rumble estimates;
- transient-to-damage interpretation;
- condition score thresholds;
- generic DVS circularity/integrity thresholds;
- THD estimate from arbitrary test records/interfaces;
- startup/brake signal-envelope proxy.

The UI and reports identify these as evidence/proxies where appropriate.

## Partial

- Loopback playback currently uses default output only; venue-specific calibration not yet supported.
- History display shows metric ids and asset ids for native-only runs (fix in progress).
- Generic DVS integrity works; vendor-specific Serato/Traktor/rekordbox/open decoders are not implemented.
- Full-side vinyl scanning produces event candidates and recurrence evidence; skip/locked-groove, non-fill, warp, off-center classifiers are not complete.
- Quartz repeatability/warm-up trends are exposed; drag/recovery and true torque workflows are not complete.
- Deeper pitch/speed/DVS/vinyl repeat-scan comparison is available; mature vinyl classifiers remain incomplete.

## Not yet complete

- Real-hardware validation of measurement accuracy against known reference fixtures (SPEC-08/19).
- Windows native build verification on target Windows machines with real audio interfaces.
- Quartz-lock acquisition, drag/recovery and true torque proxy workflows.
- Full DVS decoder capabilities, scratch-stress/cue-wear tests and DVS media history.
- Mature vinyl classifiers and held-out false-positive corpus validation.
- Venue hierarchy, controlled level-step feedback test, isolation A/B workflow and incident log.
- Maintenance/fleet trend dashboards and reminders.
- Controller MIDI/HID diagnostics inside DeckChek; MIDI Tester remains a separate project.
- CDJ transport/media/digital-output diagnostics beyond shared audio/pitch/DVS analysis.
- Technician/Engineering worksheets and model-specific service workflows.
- PDF reports, installer/update validation, support bundles, crash recovery UI and release signing.
- macOS native build (out of scope for current beta).

## Current release interpretation

The repository now contains an offline-analysis and live-capture beta with a full desktop GUI shell, catalog persistence, and deterministic diagnostic workflows. It is useful for file analysis and native audio-interface capture with evidence-first findings. It is not yet a complete implementation of every feature in SPEC-00 through SPEC-19.

The release gate remains: hardware-dependent measurements must be validated against known references before a production claim is made. Windows builds are available from CI; macOS is out of scope.
