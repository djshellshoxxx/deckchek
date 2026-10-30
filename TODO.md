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

## M5 shipped (0.0.5)

- [x] First-run setup wizard (FS-01).
- [x] Crash log, diagnostics bundle and support dialog (FS-02).
- [x] PDF export (FS-03), Windows spike GO.
- [x] Test-media library (FS-06), external links (FS-07), backup/restore and Data screen (FS-08).
- [x] Feature flags, migration runner (0001-0005) and upgrade fixtures (v0.04, v0.0.5).
- [x] Timecode facts confirmed against xwax.
- [x] Windows CI including ui-smoke and the PDF spike.
- Flags: `setupWizard`, `pdfExport`, `backup` default on; `diagnosticsBundle`, `testMedia` and all M6+ flags default off until the owner's hardware run passes.
- Known limits: hardware runs pending (docs/testing/results/v0.0.5.md), unsigned installers, no auto-update, first PDF export slow (WebView2 warm-up).

## M7 wave 0 (foundations, done)

- [x] Canonical JSON, SHA-256, QR (`qrSvg`) and `metric-compat` with shared vectors (AC-7).
- [x] Photo store, migration 0013 and the `photos/` backup entries (AC-8); fixture `v0.0.7.sql`.
- [x] M7/M8 crates and tauri features added once (`ed25519-dalek`, `getrandom`, notification plugin, DPAPI feature, `tray-icon`, `image-png`).
- [ ] Follow-ups owned by the feature jobs: first screen that uses the photo store (FS-20/22/33), register the notification plugin and add its capability when FS-23 needs it, DPAPI wrapper (cfg(windows)) with a Windows CI test.

## M6 (implemented behind default-off flags)

- [x] Pre-gig check, latency/buffer tuner, stylus wear, control-vinyl wear map, scratch stress test, hum and feedback hunter, phone import and mobile companion (see docs/IMPLEMENTATION-STATUS.md).
- [ ] Flip each flag on only after its owner hardware script passes.

## Active beta validation gates

- [ ] Owner hardware runs H-00 to H-08 for v0.0.5; flip default-off flags after they pass.

- [ ] Real-hardware validation of thresholds and accuracy against known references (SPEC-08/19).
- [ ] Test on a physical Windows machine with real audio interfaces.
- [x] Loopback calibration output-device selector.
- [ ] Run every device test plan on the user's own gear; confirm unit identities (DDJ-S8, SL-1200MK4; Xone:23C and Traktor MK2 vinyl are owner-confirmed, MK2 carrier 2500 Hz still to be measured) and replace unverified specs/thresholds with confirmed values.
- [ ] Ship published MIDI maps where official MIDI message lists can be obtained (DJM-A9, PLX-CRSS12, TWELVE MK2).
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
- [ ] Code signing and auto-update.
