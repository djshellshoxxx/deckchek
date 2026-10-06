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

## Active beta blockers

- [ ] Confirm native Windows Tauri build and installer on a target Windows machine.
- [ ] Add native continuous stereo capture with bounded buffering and capture-quality counters.
- [ ] Add interface loopback/gain calibration and uncertainty propagation.
- [ ] Wire normalized product/asset/setup database editors.
- [ ] Add guided L/R isolated-track crosstalk/channel-separation workflow.
- [ ] Add repeat-scan alignment and confirmation for vinyl event candidates.
- [ ] Add persisted evidence/hypothesis support and contradiction graph.
- [ ] Add accessibility/runtime checks for dialogs, navigation, empty states and device failures.
- [ ] Validate thresholds and numeric accuracy against known hardware/reference fixtures.

## Later spec work

- [ ] Vendor-specific DVS analyzers where technically and legally supportable.
- [ ] Scratch-stress/cue-wear workflows.
- [ ] Skip/locked-groove, warp/off-center, non-fill and mature vinyl classifiers.
- [ ] Venue hierarchy, level-step feedback tests, isolation A/B and incident logging.
- [ ] Fleet/maintenance trends and reminders.
- [ ] CDJ/media-player transport, media and digital-output diagnostics.
- [ ] Controller/MIDI/HID DeckChek workflows.
- [ ] Technician/Engineering service worksheets and model-specific workflows.
- [ ] PDF reports, update/signing/release validation and support bundles.
