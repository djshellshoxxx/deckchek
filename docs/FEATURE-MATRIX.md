# DeckChek Feature Matrix

This matrix is the implementation checklist tying requested product features to the detailed working specifications. Edition packaging and category definitions are proposed in [SPEC-11](SPEC-11-product-editions-and-categories.md); product editions do not change the existing phase sequence in SPEC-09.

## Current implementation snapshot

The table below is intentionally conservative. “Implemented” means code exists and is exercised by deterministic tests; it does not override validation gates in SPEC-08/SPEC-19.

| Capability slice | Status | Notes |
| --- | --- | --- |
| Local audio-file analysis | Implemented | Browser/Tauri shell decodes local audio without upload. |
| Stereo signal Quick Check | Implemented | RMS, clipping, balance, correlation/polarity, hum and dropout evidence. |
| Reference-tone speed/pitch | Implemented, validation-gated | Frequency, RPM, pitch error, speed trace, drift and short-term variation proxy. |
| Pitch-map workflow | Implemented | Multi-run slope, nonlinearity, hysteresis and dead-spot candidates. |
| Startup/brake | Partial | Signal-envelope timing proxy implemented; validated platter-speed transition method remains outstanding. |
| Cartridge diagnostics | Partial | Balance/polarity and THD estimate implemented; guided crosstalk/separation and full alignment workflows remain. |
| Generic DVS | Implemented foundation | Scope geometry, levels, correlation and missing-signal timeline; no vendor-specific decoding yet. |
| Full-side vinyl scan | Implemented foundation | Transient candidates, recurrence, hum/rumble proxy, normalized positions and condition summary; mature classifiers/repeat alignment remain. |
| Diagnostic reasoning | Implemented foundation | Transparent hypotheses, alternatives and isolation tests; persisted weighted evidence graph remains. |
| SQLite history | Implemented foundation | Sessions, method-versioned measurements and finding evidence are written in Tauri mode. |
| Reports and portability | Implemented foundation | HTML report, CSV measurements, workspace JSON import/export and compatible-run A/B report. |
| Native continuous capture | Not implemented | Required for live beta workflows. |
| Hardware calibration/uncertainty | Not implemented | Required for calibrated claims. |
| Venue/CDJ/controller/Technician advanced workflows | Not implemented | Shared measurement primitives can be reused, but category-specific workflows remain. |

See [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) for the detailed reconciliation.


| Area | Feature | Primary spec | Planned phase |
|---|---|---|---|
| Editions | Free MIDI Tester capability inventory | SPEC-11 | Existing separate app |
| Editions | Vinyl paid edition | SPEC-11, SPEC-01 to SPEC-06 | Package after required phases |
| Editions | CDJ / Media Player paid edition | SPEC-11, SPEC-10 | Package after required phases |
| Editions | Controller paid edition | SPEC-11 | After controller tests validated |
| Editions | Ultimate bundle | SPEC-11 | After all three paid modules |
| Editions | Capability-based hybrid device profiles | SPEC-11, SPEC-04, SPEC-07 | Shared database phase |
| MIDI Tester | Live decoded and raw MIDI monitor | SPEC-11 | Existing separate app |
| MIDI Tester | Input/output device selection and connection log | SPEC-11 | Existing separate app |
| MIDI Tester | CC inventory, range, distinct values, jitter and jumps | SPEC-11 | Existing separate app |
| MIDI Tester | Encoder behavior hints and direction changes | SPEC-11 | Existing separate app |
| MIDI Tester | Held notes, pitch bend and MIDI clock input | SPEC-11 | Existing separate app |
| MIDI Tester | MIDI Learn and labelled mapping worksheet | SPEC-11 | Existing separate app |
| MIDI Tester | Note On/Off output and all-channel panic | SPEC-11 | Existing separate app |
| MIDI Tester | Guided checks, local baseline and JSON export | SPEC-11 | Existing separate app |
| Controller | MIDI/HID/control-surface diagnostics | SPEC-11 | Future controller phase |
| Controller | Fader range, dead zone, monotonicity and repeatability | SPEC-11 | Future controller phase |
| Controller | Encoder, jog, pad and button behavior tests | SPEC-11 | Future controller phase |
| Controller | Controller audio I/O and loopback checks | SPEC-11 | Future controller phase |
| Controller | Motorized control-deck diagnostics | SPEC-11 | Future controller phase |
| Controller | Supported mapping/software behavior checks | SPEC-11 | Future controller phase |
| GUI | Navigation, screen states, accessible live monitoring and results | SPEC-13 | Shared foundation |
| Wiring | Physical route graph, safe input guidance, capture point declaration | SPEC-14 | Shared foundation |
| Audio routing | Device enumeration, channel map, calibration and disconnect behavior | SPEC-14 | 0-1 |
| Input/output | Audio, MIDI/HID, references, sensors, data persistence and export contracts | SPEC-15 | Shared foundation |
| Workflow | Session lifecycle, preflight, pause/stop, recovery and result finalization | SPEC-16 | Shared foundation |
| Functional behavior | Edition/capability planning, reports, comparisons and unavailable-state rules | SPEC-16 | Shared foundation |
| Operations | Crash recovery, storage failure, migration, privacy and support bundles | SPEC-17 | All phases |
| Release quality | Installer/update/uninstall, security checks and release gates | SPEC-17 | Release gates |
| Input | Audio device selection/routing | SPEC-00, SPEC-01, SPEC-14 | 0-1 |
| Input | L/R signal presence | SPEC-01 | 1 |
| Input | Clipping detection | SPEC-01 | 1 |
| Input | Capture dropout/discontinuity detection | SPEC-00 | 1 |
| Input | Interface calibration/loopback | SPEC-00, SPEC-08 | 1 |
| Turntable | Actual RPM | SPEC-01 | 2 |
| Turntable | Speed error | SPEC-01 | 2 |
| Turntable | Warm-up drift | SPEC-01 | 2 |
| Turntable | Wow | SPEC-01 | 2 |
| Turntable | Flutter | SPEC-01 | 2 |
| Turntable | Revolution-synchronous modulation | SPEC-01 | 2 |
| Turntable | Off-center indicator | SPEC-03 | 7 |
| Turntable | Pitch-fader mapping | SPEC-01 | 2 |
| Turntable | Pitch-fader dead spots | SPEC-01 | 2 |
| Turntable | Pitch nonlinearity | SPEC-01 | 2 |
| Turntable | Pitch hysteresis | SPEC-01 | 2 |
| Turntable | Quartz-lock accuracy | SPEC-01 | 2 |
| Turntable | Quartz lock acquisition | SPEC-01 | 2 |
| Turntable | Startup time | SPEC-01 | 2 |
| Turntable | Startup overshoot/settling | SPEC-01 | 2 |
| Turntable | Brake time | SPEC-01 | 2 |
| Turntable | Platter drag/recovery | SPEC-01 | 2 |
| Turntable | Torque/acceleration proxy | SPEC-01 | 2 |
| Cartridge | Channel balance | SPEC-01 | 3 |
| Cartridge | Channel separation/crosstalk | SPEC-01 | 3 |
| Cartridge | Relative phase | SPEC-01 | 3 |
| Cartridge | Polarity/wiring fault | SPEC-01 | 1-3 |
| Cartridge | Azimuth evidence | SPEC-01 | 3 |
| Cartridge | Anti-skate evidence | SPEC-01 | 3 |
| Cartridge | Frequency response | SPEC-01 | 3 |
| Cartridge | Harmonic distortion | SPEC-01 | 3 |
| Cartridge | Mistracking detection | SPEC-01 | 3 |
| Cartridge | Tonearm/cartridge resonance | SPEC-01 | 3 |
| Signal | 50/60 Hz hum | SPEC-01 | 1 |
| Signal | Harmonic hum family | SPEC-01 | 1 |
| Signal | Rumble/subsonic | SPEC-01 | 1-2 |
| Signal | Headshell intermittent contact | SPEC-01 | 3 |
| Signal | RCA intermittent contact | SPEC-01 | 3 |
| Diagnostic | Swap-test troubleshooting | SPEC-06 | 10 |
| Diagnostic | Evidence vs hypothesis | SPEC-00, SPEC-06 | all |
| Diagnostic | Cause confidence | SPEC-06 | 10 |
| Diagnostic | Isolation-test planner | SPEC-06 | 10 |
| Comparison | Deck A vs Deck B | SPEC-01, SPEC-06 | 2+ |
| Comparison | Health vs match score separation | SPEC-06 | 10 |
| History | Turntable health baseline | SPEC-01 | 11 |
| History | Maintenance trend | SPEC-01, SPEC-04 | 11 |
| DVS | Generic XY scope | SPEC-02 | 4 |
| DVS | Ellipse/circularity analysis | SPEC-02 | 4 |
| DVS | L/R timecode levels | SPEC-02 | 4 |
| DVS | Timecode channel balance | SPEC-02 | 4 |
| DVS | DVS phase/polarity | SPEC-02 | 4 |
| DVS | Timecode clipping | SPEC-02 | 4 |
| DVS | DVS SNR/noise | SPEC-02 | 4 |
| DVS | DVS hum/rumble | SPEC-02 | 4 |
| DVS | DVS crosstalk | SPEC-02 | 4 |
| DVS | Signal integrity/readability | SPEC-02 | 4-5 |
| DVS | Vendor format auto-detection | SPEC-02 | 5 |
| DVS | Serato analyzer | SPEC-02 | 5 |
| DVS | Traktor analyzer | SPEC-02 | 5 |
| DVS | rekordbox analyzer | SPEC-02 | 5 |
| DVS | Open/xwax-compatible analyzer | SPEC-02 | 5 |
| DVS | Unsupported/generic format mode | SPEC-02 | 4 |
| DVS | Absolute position where supported | SPEC-02 | 5 |
| DVS | Position continuity/jumps | SPEC-02 | 5 |
| DVS | Direction detection | SPEC-02 | 5 |
| DVS | Instantaneous timecode speed | SPEC-02 | 5 |
| DVS | Velocity discontinuity detection | SPEC-02 | 5 |
| DVS | DVS dropout detection | SPEC-02 | 4-5 |
| DVS | Needle-drop acquisition test | SPEC-02 | 5 |
| DVS | Scratch stress test | SPEC-02 | 6 |
| DVS | Direction reversal count | SPEC-02 | 6 |
| DVS | Scratch tracking-loss recovery | SPEC-02 | 6 |
| DVS | Cue-point torture/wear test | SPEC-02 | 6 |
| DVS | Full control-vinyl side scan | SPEC-02 | 5-6 |
| DVS | Control-vinyl wear map | SPEC-02 | 5-6 |
| DVS | Repeat-scan wear confirmation | SPEC-02 | 6 |
| DVS | Media vs cartridge/mixer isolation | SPEC-02 | 5-6 |
| DVS | Two-deck DVS matching | SPEC-02 | 6 |
| Vinyl scan | Entire side capture | SPEC-03 | 7 |
| Vinyl scan | Lead-in/runout handling | SPEC-03 | 7 |
| Vinyl scan | Click detection | SPEC-03 | 7 |
| Vinyl scan | Pop/tick detection | SPEC-03 | 7 |
| Vinyl scan | Repeating scratch detection | SPEC-03 | 7 |
| Vinyl scan | Scratch recurrence by revolution | SPEC-03 | 7 |
| Vinyl scan | Isolated surface damage | SPEC-03 | 7 |
| Vinyl scan | Crackle density | SPEC-03 | 7 |
| Vinyl scan | Surface-noise timeline | SPEC-03 | 7 |
| Vinyl scan | Groove-wear hypothesis | SPEC-03 | 7 |
| Vinyl scan | Inner-groove degradation | SPEC-03 | 7 |
| Vinyl scan | Forward skip | SPEC-03 | 7 |
| Vinyl scan | Backward skip | SPEC-03 | 7 |
| Vinyl scan | Locked/stuck groove | SPEC-03 | 7 |
| Vinyl scan | Warp indicator | SPEC-03 | 7 |
| Vinyl scan | Off-center pressing indicator | SPEC-03 | 7 |
| Vinyl scan | Non-fill/stitching-like defect | SPEC-03 | 7 |
| Vinyl scan | Static-like impulse | SPEC-03 | 7 |
| Vinyl scan | Dust/debris hypothesis | SPEC-03 | 7 |
| Vinyl scan | Stylus contamination hypothesis | SPEC-03 | 7 |
| Vinyl scan | Groove-wall/channel damage | SPEC-03 | 7 |
| Vinyl scan | Sibilance/mistracking event | SPEC-03 | 7 |
| Vinyl scan | Hum timeline | SPEC-03 | 7 |
| Vinyl scan | Rumble/feedback timeline | SPEC-03 | 7 |
| Vinyl scan | Footfall/shock exclusion | SPEC-03 | 7 |
| Vinyl scan | Time/radial damage map | SPEC-03 | 7 |
| Vinyl scan | Track boundary aggregation | SPEC-03 | 7 |
| Vinyl scan | Before/after cleaning compare | SPEC-03 | 7 |
| Vinyl scan | Repeat-play confirmation | SPEC-03 | 7 |
| Vinyl scan | Vinyl condition score | SPEC-03, SPEC-06 | 7-10 |
| Vinyl scan | Vinyl-only live readiness | SPEC-03, SPEC-06 | 7-10 |
| Database | Turntable catalog | SPEC-04, SPEC-07 | 8 |
| Database | Cartridge/stylus catalog | SPEC-04, SPEC-07 | 8 |
| Database | Mixer catalog | SPEC-04, SPEC-07 | 8 |
| Database | Audio interface/sound-card catalog | SPEC-04, SPEC-07 | 8 |
| Database | DVS/timecode catalog | SPEC-04, SPEC-07 | 8 |
| Database | Test-record catalog | SPEC-04, SPEC-07 | 3/8 |
| Database | Manufacturer spec provenance | SPEC-04, SPEC-07 | 8 |
| Database | User-owned physical assets | SPEC-04, SPEC-07 | 8 |
| Database | Stylus-hour/service history | SPEC-04, SPEC-07 | 8 |
| Database | Complete setup configurations | SPEC-04, SPEC-07 | 8 |
| Database | Method-compatible comparisons | SPEC-04, SPEC-07 | 8 |
| Database | Goal-specific rankings | SPEC-04 | 8 |
| Venue | Venue records | SPEC-05 | 9 |
| Venue | Booth records | SPEC-05 | 9 |
| Venue | Per-deck position | SPEC-05 | 9 |
| Venue | Surface/support stack | SPEC-05 | 9 |
| Venue | Quiet baseline | SPEC-05 | 9 |
| Venue | Feedback-onset testing | SPEC-05 | 9 |
| Venue | Low-frequency resonance map | SPEC-05 | 9 |
| Venue | Footfall/shock test | SPEC-05 | 9 |
| Venue | Isolation A/B test | SPEC-05 | 9 |
| Venue | Monitor/sub placement compare | SPEC-05 | 9 |
| Venue | Electrical/hum environment | SPEC-05 | 9 |
| Venue | Optional vibration sensor | SPEC-05 | post-9 |
| Venue | Vinyl-only venue suitability | SPEC-05, SPEC-06 | 9-10 |
| Venue | Gig/session incident log | SPEC-05 | 9 |
| Reports | Quick report | SPEC-06 | 1+ |
| Reports | Technical report | SPEC-06 | 11 |
| Reports | Used-turntable report | SPEC-06 | 2+ |
| Reports | Vinyl condition report | SPEC-06 | 7+ |
| Reports | Venue report | SPEC-06 | 9+ |
| Reports | Maintenance report | SPEC-06 | 11 |
| Export | JSON/CSV | SPEC-03, SPEC-04 | 7-8 |
| Export | HTML | SPEC-06 | 1+ |
| Export | PDF | SPEC-06 | 11 |
| QA | Synthetic signal generator | SPEC-08 | 0 |
| QA | Golden DSP fixtures | SPEC-08 | all |
| QA | False-positive vinyl corpus | SPEC-08 | 7 |
| QA | DVS synthetic scope fixtures | SPEC-08 | 4 |
| QA | SQLite migration tests | SPEC-08 | 0 |
| QA | Score regression tests | SPEC-08 | 10 |
| QA | Report snapshot tests | SPEC-08 | 11 |

## Rule

A row is not complete merely because a UI element exists. Each implemented feature must meet the "definition of done" in SPEC-09: measurement method, tests, persistence, quality flags, report support, and user-facing setup instructions.

## Research-derived implementation gates

| Requirement | Owning specification | Implementation status |
| --- | --- | --- |
| Dependency selection and exact license provenance | SPEC-18 | Specified; integration pending |
| Canonical PCM timebase and derived-stream mapping | SPEC-18, SPEC-19 | Specified; integration pending |
| Long WAV segmentation and boundary continuity | SPEC-18 | Specified; validation pending |
| Runout-click RPM with no flutter claim | SPEC-01, SPEC-18 | Specified; implementation pending |
| Generic scope vs decoder capability separation | SPEC-02, SPEC-18 | Specified; validation pending |
| Drift/skip-aware repeat-scan alignment | SPEC-03, SPEC-18 | Specified; validation pending |
| Measurement uncertainty and calibrated units | SPEC-07, SPEC-19 | Specified; implementation pending |
| Separate transient, audibility and cause evidence | SPEC-03, SPEC-06, SPEC-19 | Specified; validation pending |
| Held-out DJ-genre detector benchmarks | SPEC-08, SPEC-19 | Specified; corpus/benchmarks pending |
| Exact AES6 statistic and method verification | SPEC-01, SPEC-08, SPEC-19 | Experimental until validated |
