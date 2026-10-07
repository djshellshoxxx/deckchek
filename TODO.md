# DeckChek build queue

See [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md) for the detailed code/spec reconciliation.

## Completed foundation

- [x] Tauri 2 desktop shell and responsive local GUI.
- [x] Frontend-to-Rust invoke bridge.
- [x] SQLite migration runner and measured-run persistence.
- [x] Static-browser localStorage fallback.
- [x] Local audio-file decode and analysis.
- [x] Audio input enumeration.
- [x] Stereo Quick Check: RMS, clipping, balance, polarity/correlation and mains-hum evidence.
- [x] Reference-tone frequency/RPM/pitch analysis.
- [x] Speed trace, drift and short-term variation proxy.
- [x] Multi-run pitch mapping with nonlinearity/hysteresis/dead-spot candidates.
- [x] Generic DVS scope and signal-presence timeline.
- [x] Full-side vinyl transient/recurrence map foundation.
- [x] Signal dropout evidence and transparent diagnostic hypotheses.
- [x] Cartridge/reference-tone THD estimate.
- [x] Startup/brake signal-envelope proxy.
- [x] HTML report, CSV measurement export and JSON workspace portability.
- [x] Compatible-run A/B comparison.
- [x] Local reference WAV generator.
- [x] JavaScript regression tests plus Rust migration/persistence tests.
- [x] CI definition for JS and Rust checks.
- [x] Fully local UI assets/CSP.
- [x] Native continuous stereo capture with bounded buffering and capture-quality counters.
- [x] Interface loopback/gain calibration and uncertainty propagation.
- [x] Catalog CRUD for manufacturer/product/asset/setup/venue with starter seeding.
- [x] Evidence graph persistence (hypothesis/support/contradiction).
- [x] Repeat-scan alignment and confirmation for vinyl event candidates.
- [x] Guided L/R isolated-track crosstalk/channel-separation workflow.
- [x] Full GUI rebuild with nav rail, guided Setup→Capture→Results flows.
- [x] Calibration, Equipment and History screens.
- [x] Live meters with peak hold and clip latch.
- [x] Dark/light themes and keyboard shortcuts.
- [x] Windows standalone build with portable exe and installer packages.
- [x] Playwright UI smoke test (62 checks).
- [x] Device library (0.0.3, 0.0.4 removes the M-Audio profile and prunes retired profiles on sync): profiles synced to the catalog, "My <model>" units, Devices screen, per-device test plans and runners, device_test_result persistence, learned MIDI maps, device HTML reports.

## Active beta validation gates

- [ ] Real-hardware validation of thresholds and accuracy against known references (SPEC-08/19).
- [ ] Test on a physical Windows machine with real audio interfaces.
- [x] Loopback calibration output-device selector.
- [ ] Run every device test plan on the user's own gear; confirm unit identities (DDJ-S8, SL-1200MK4; Xone:23C and Traktor MK2 vinyl are owner-confirmed, MK2 carrier 2500 Hz still to be measured) and replace unverified specs/thresholds with confirmed values.
- [ ] Ship published MIDI maps where official MIDI message lists can be obtained (DJM-A9, PLX-CRSS12, TWELVE MK2).
- [ ] Verify the Tauri opener for document links (currently falls back to copying the URL in the desktop app).
- [x] History shows metric labels and asset names for native runs.

## Later spec work

- [ ] Vendor-specific DVS analyzers where technically and legally supportable.
- [ ] Scratch-stress/cue-wear workflows.
- [ ] Skip/locked-groove, warp/off-center, non-fill and mature vinyl classifiers.
- [ ] Venue hierarchy, level-step feedback tests, isolation A/B and incident logging.
- [ ] Fleet/maintenance trends and reminders.
- [ ] CDJ/media-player transport, media and digital-output diagnostics.
- [ ] Controller/MIDI/HID DeckChek workflows.
- [ ] Technician/Engineering service worksheets and model-specific workflows.
- [ ] PDF reports, code signing, auto-update and support bundles.
