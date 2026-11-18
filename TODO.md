# DeckChek build queue

## Current continuation snapshot

The reviewed continuation source is `1943ef024bdc6abfe4ac32b4c368b764b75a0c86` in [PR #30](https://github.com/djshellshoxxx/deckchek/pull/30), targeting PR #27's existing integration branch. PR29 already merged its older fd39b145 head; main remains `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`. The combined Node 22 suite passed **1,500 passed, zero failed, 1 optional skip (1,501 total; 230.785 seconds)** with source unchanged. Guided stylus version 3 now couples complete-capture reference validation and Hann-normalized measurements with explicit uncertainty, provenance and History persistence; ledger verification reports the checked certificate facts with owned asynchronous results. Five researched profiles retain 45 models, 506 handwritten checks, 187 generated checks and 24 conditional audio cases. Monitor serialization, both GLib patches and their provenance, native MIDI/ZIP ownership, exact-package warning gates and unchanged stress workloads are retained. Current hosted/native/browser/platform/extended, broad Sonar, full stress, hardware and release gates remain separately tracked. See the six continuation reports for exact evidence and limitations.

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
- [x] Playwright UI smoke test: [1,283/1,283 checks passed at source `742c67a`](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624237913), including all seven new FS-35 checks, with no console errors.
- [x] Device library (0.0.3, 0.0.4 removes the M-Audio profile and prunes retired profiles on sync): profiles synced to the catalog, "My <model>" units, Devices screen, per-device test plans and runners, device_test_result persistence, learned MIDI maps, device HTML reports.

## M5 shipped (0.0.5)

- [x] First-run setup wizard (FS-01).
- [x] Crash log, diagnostics bundle and support dialog (FS-02).
- [x] PDF export (FS-03), Windows spike GO.
- [x] Test-media library (FS-06), external links (FS-07), backup/restore and Data screen (FS-08).
- [x] Feature flags, migration runner (0001-0005) and upgrade fixtures (v0.04, v0.0.5).
- [x] Timecode facts confirmed against xwax.
- [x] Windows Rust/PDF-spike checks are defined in `nightly.yml`; Playwright UI smoke runs in the Linux job of `test.yml`.
- Flags: `setupWizard`, `pdfExport`, `backup` and `testMedia` default on. `diagnosticsBundle` is always available; its registry flag has no effect. M6+ flags remain off by default while their qualification gates are open.
- Known limits: hardware runs pending (docs/testing/results/v0.0.5.md), unsigned installers, no auto-update, first PDF export slow (WebView2 warm-up).

## M7 wave 0 (foundations, done)

- [x] Canonical JSON, SHA-256, QR (`qrSvg`) and `metric-compat` with shared vectors (AC-7).
- [x] Photo store, migration 0013 and the `photos/` backup entries (AC-8); fixture `v0.0.7.sql`.
- [x] M7/M8 crates and tauri features added once (`ed25519-dalek`, `getrandom`, notification plugin, DPAPI feature, `tray-icon`, `image-png`).
- [ ] Follow-ups owned by the feature jobs: first screen that uses the photo store (FS-20/22/33), register the notification plugin and add its capability when FS-23 needs it, DPAPI wrapper (cfg(windows)) with a Windows CI test.

## M7 and M8 features (implemented behind flags, hardware gates open)

- [x] Follow-ups from wave 0: photo store used by FS-20/22/33; DPAPI wrapper with the certificate signing key (`signing.rs`).
- [x] FS-20 Used-gear certificate (`certificates`): signing, strict verifier, Certificates and Verify screens.
- [x] FS-21 Unit vs population (`population`, `packs`): Compare tabs, anonymous packs, migration 0022.
- [x] FS-22 Service worksheets (`service`): jobs, work log, job sheet, device-runner job mode.
- [x] FS-22 lifecycle correction [9192aa0](https://github.com/djshellshoxxx/deckchek/commit/9192aa0): Ctrl+J navigates synchronously and reports navigation failures; superseded job/comparison responses cannot replace a new intake form. Independently reviewed; 48 focused service/crosslinks/PII tests passed. Final-source CI remains required.
- [x] FS-23 Venue fleet dashboard (`fleet`, default off): grid, placement, reminders, booth sheet, banner.
- [x] FS-30 Mobile companion and phone import (`phoneImport`).
- [x] FS-31 Timecode doctor live monitor (`liveMonitor`): engine, session logs, tray (Windows/macOS).
- [x] FS-32 MIDI mapper studio (`mapperStudio`): Mixxx and VirtualDJ round trip, Serato/Traktor reports.
- [x] FS-32 save ownership correction [00f1f3c](https://github.com/djshellshoxxx/deckchek/commit/00f1f3cc8d96527f436ee28958ed23201b60a01b): a pending save for mapping A cannot assign A's saved ID/status to a newly opened or created mapping B. Independently accepted; 47 focused tests plus four independent notification/concurrency/error probes passed. Normal edits and hide/show retain their existing behavior; final-source CI remains required.
- [x] FS-33 Gear ledger (`gearLedger`): privacy presets, static page, atomic folder export.
- [x] October audit fixes (AUD-01..AUD-11), 11 cargo-fuzz and 13 JS fuzz targets, first-party CI, `--self-test`.
- [ ] Owner hardware runs H-20 to H-23 and H-31 to H-33; flip default-off flags only after they pass.
- [ ] FS-31: WASAPI-shared capture beside DJ software (H-31 steps 1-6); negative-SNR residual (noise louder than the carrier reads as cueing).
- [ ] FS-32: confirm the VirtualDJ file format against a real install (H-32 step 7).
- [ ] FS-33: verify the GitHub Pages guide wording (H-33).
- [ ] FS-21: manual privacy review of an exported pack. FS-23: real-database walkthrough before enabling fleet by default.
- [ ] FS-20: PDF-embedded JSON is not possible with WebView2 `PrintToPdf` (sidecar JSON only); revisit if a PDF library is adopted.
- [ ] If FS-23 reminders or FS-31 alerts should raise OS notifications (currently in-app only): re-add `tauri-plugin-notification` together with its registration and capability (the unregistered crate was removed 2026-11-18 because cargo's `unused_dependencies` lint failed the warning gate).

## M9: every device testable (FS-34/35/36, PR9 consolidation 2026-11-18)

- [x] FS-34 capability model, baseline plan and coverage audit; `npm test` checks `docs/testing/DEVICE-TEST-COVERAGE.md` (45/45 profiles, 0 gaps).
- [x] FS-36 `midi:conformance` and `midi:gm` panels with connection-ownership regressions; spec/analyzer discrepancies reconciled; burst rate. Output selection and duplicate-name guards are implemented; missing/reset loss counters or unavailable/disappeared input observations give REVIEW with saved provenance.
- [x] Native MIDI guard [b34f3c9](https://github.com/djshellshoxxx/deckchek/commit/b34f3c905ce60d64bfd15587a9c8906c3fd7a650): new connections and explicit cached input reopens reject duplicate successfully read names; ambiguous reconnects reject. Cached output sends, including Note Off cleanup, retain their captured connection without re-enumeration. Five new native regressions; 19/19 extracted-production-body harness tests plus six independent boundary checks passed. Full native CI for this change remains pending.
- [x] FS-35 output audio-quality test (`audio:quality`) with lease-scoped capture, owned-voice cancellation and simulated-device tests; Skip for conditional (no audio output) units. Analysis revision 2 uses worst-channel response; live capture provenance and actual-device/rate calibration matching are saved. Imported-file continuity is explicitly unobserved.
- [x] FS-35 phase progress, Enter/Esc shortcuts and focus transitions between Run, Stop, Try again and the result summary; lifecycle regressions cover the software behavior.
- [x] Browser CI at source `742c67a`: **1,283/1,283 checks passed**, including all seven new FS-35 `audio-quality` checks; no console errors. Evidence: [browser CI job 134624237913](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624237913).
- [x] Combined local follow-up source, including the service/MIDI/mapper corrections: Node 22 **1,338 passed, zero failed, one optional skip** (1,339 total); `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` passed. This local result does not replace fresh full CI.
- [ ] Qualify the completed integration revision with required native gates and platform builds/self-tests. At source `730d71d`, JavaScript CI passed 1,325 tests/one skip, but [native CI failed compilation with E0428](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728404). The alias collision is corrected in [8acaa7a](https://github.com/djshellshoxxx/deckchek/commit/8acaa7a); fresh CI including the subsequent fixes remains pending. The browser pass at `742c67a` does not qualify later native changes or close hardware gates. The same `730d71d` source also passed [1,283/1,283 browser checks with no console errors](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728622) and the JavaScript performance gate; its native compilation failure occurred before application tests ran. Service `9192aa0`, alias `8acaa7a`, native MIDI `b34f3c9` and mapper `00f1f3c` are later follow-ups and are not covered by that CI run.
- [ ] Native MIDI: add stable port identity and qualify hot-plug continuity/same-name device substitution. Unreadable names are unselectable, not proof that physical devices are distinct or absent; successfully read empty names still require uniqueness. The duplicate-name guard does not close these limits or real-hardware qualification.
- [ ] FS-35: run against real hardware (interface loopback calibrated first), compare with a reference analyser and validate the default thresholds before considering any tuning. Thresholds remain unchanged. Its live capture shows as "A live capture" in other features' busy dialogs.
- [ ] Record `connectivity.audio.usbChannelsOut` (or `audio: null`) for the 29 controller profiles whose audio test is still conditional, from manufacturer sources.
- [ ] Add `midi.generalMidi: true` to any profile whose device has a General MIDI sound source (none known yet) and verify manufacturer ids in real Identity Replies against the MIDI Association list.
- [ ] Hardware: run MIDI conformance against real controllers (Active Sensing, Clock, Identity Reply) and the GM check against a real GM sound source.

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
- [ ] Level-step feedback tests, isolation A/B and incident logging (venue/booth/position hierarchy is done in FS-23).
- [ ] Fleet/maintenance trend dashboards (reminders are done in FS-23).
- [ ] CDJ/media-player transport, media and digital-output diagnostics.
- [ ] Controller/MIDI/HID DeckChek workflows.
- [ ] Model-specific service workflows beyond the generic FS-22 job sheet.
- [ ] Code signing and auto-update.
