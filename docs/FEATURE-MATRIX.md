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
| First-run setup wizard (FS-01) | Implemented | Six resumable steps; re-run from Options. |
| Diagnostics bundle and crash prompt (FS-02) | Implemented | Local zip, redaction, crash marker on exit; nothing uploaded. |
| Open external links (FS-07) | Implemented | Allowlist plus confirm dialog; desktop command is authoritative. |
| Test media library (FS-06) | Implemented | On by default (no flag in the spec; `testMedia` defaults on and Experimental features can switch it off). Picker prefill, result and History record of the medium used. Choosing a timecode medium sets the decoder format explicitly: the DVS form has a Timecode format field (Auto-detect is only the fallback), and the scratch test and control-vinyl forms take a medium to set their format. The M6 forms for pre-gig, stylus and latency do not take a medium. |
| Backup and restore (FS-08) | Implemented | Verified `.deckchek-backup`, safety backup, schedule, free-space check on Windows. |
| Stylus wear tracker (FS-12) | Implemented, flag `stylusWear`, hardware-unvalidated | Hours ledger (manual, DeckChek capture sessions and DJ-log proposals), life gauge, benchmark entry, trend charts with regression, degradation alerts, snooze, replacement reset, PDF report. Benchmarks are entered or filled from saved runs; the one-click guided benchmark capture is not built. |
| Booth feedback and hum hunter (FS-15) | Implemented, flags `humHunter` and `feedbackStep`, hardware-unvalidated | Hum hunter: live 50/60 Hz meter with harmonics, guided isolation steps A-G with a 5 s measurement and delta each, ranked causes with next actions, saved runs. Feedback test: -60 dBFS start, 3 dB steps only on confirmation, cap -30 dBFS (hard -12 dBFS in Rust), big STOP with Esc and Space, automatic abort on howl, clipping, lost input, 60 s inactivity, and on leaving the screen or closing the window. Runs list on the Hum screen's Runs tab grouped by venue and in History; each run exports as a PDF, and Equipment > Venues (or the venue group on the Runs tab) exports a venue report with the venue's setups and hum/feedback history. There is no separate venue detail screen. |
| Scratch stress test (FS-14) | Implemented, hardware-validation pending | Guided baby/transform/chirp protocol with metronome, results, history and compare; flag `scratchTest`. Each run stores the cartridge, setup and control-vinyl side, and Compare groups by all three plus format and tempo. PDF report. Skip thresholds are uncalibrated and labelled so. If another feature holds the input the test shows a plain error, not the "Stop and continue" dialog (follow-up). |
| DVS latency and buffer tuner (FS-11) | Implemented, flag `latencyTuner`, hardware-unvalidated | Four steps: Measure (patch-cable guide, WASAPI round trip with k=2 uncertainty and reported-vs-measured), Buffer test (idle and CPU-load sweep, detects at run time whether Windows honours the buffer size: A honoured, B partly, C ignored, D streams fail), Recommendation (per Serato / Traktor / rekordbox with their own setting names, typed ASIO buffer labelled as typed), Windows tuning checklist (pass / review / unknown with check command, manual path and Win+R shortcut; nothing is changed) plus the busiest programs and running DJ software after a scan. Every value is labelled WASAPI, not ASIO. Latest runs are saved; export is JSON (Ctrl+E) or PDF. Entry points: Quick Check, Calibration and pre-gig fixes link here (M6 cross-links). rekordbox and Traktor Pro 4 setting names are unverified. |
| Pre-gig check (FS-10) | Implemented, flag `pregig`, hardware-unvalidated | One Start button, live checklist with a status word per step, green / amber / red verdict with fix-it buttons, single-step and problem-only re-run, comparison with the previous run, history with compare, presets (three built-in rigs, create, from gear, edit, duplicate, delete, import/export). Each deck captures on its own input pair (deck B on 3-4 for the Traktor Audio 8 DJ rig); per-deck Inputs boxes on the start card are remembered per interface, and a pair the interface lacks shows "No such input" (not a failure, verdict "Not fully checked"). Control-vinyl formats come from the test-media library. Hum thresholds are unmeasured defaults; Result exports as JSON or PDF (FS-03 kind `pregig`); Quick Check links to it. Fix actions link to Hum hunter, Stylus and Latency, and "Open ... settings" opens Windows Settings through a fixed three-page allowlist (sound, power, microphone privacy), copying the Win+R shortcut if that fails. |
| Experimental features panel (FS-00) | Implemented | Options > Support > "Experimental features…" opens a dialog with one switch per flag that has code behind it, an "Experimental" chip on those that ship off, and "Reset to defaults". Flags with no code yet (M7 and M8, and `diagnosticsBundle`, which is always on) are not listed. |
| M6 cross-links | Implemented (follows each feature's flag), hardware-unvalidated | Quick Check suggests Pre-gig, Latency and Hum hunter and shows the active cartridge's wear % and next alert; DVS links to the Scratch test and Wear map; Calibration links to Latency; an Equipment cartridge opens its Stylus page (that cartridge) and the Wear map, a DVS-media asset the Wear map, an interface the Latency tuner. History lists hum, latency, scratch, wear-map and pre-gig runs beside diagnostic runs with a type filter; selecting one shows a summary and opens the feature screen. Feature runs are desktop only. |
| Control-vinyl wear map (FS-13) | Implemented, flag `wearMap`, hardware-unvalidated | Streaming side scan (live input or a recording) into 1-5 s bins with SNR, phase error, dropouts and level; needle drop/lift, speed change and needle-skip detection mark bins interrupted. Circular groove heat-map and linear timeline (keyboard-navigable bins, details panel with a waveform snippet for scans made this session, data table, hatch/texture so colour is never the only signal), previous-scan comparison aligned by needle drop or level envelope, keep / watch / use other side / replace verdict with the three worst bins, PDF report. Scans opened from History show numbers only (raw audio is never stored). Captures input pair 1-2 only. The DVS screen links to it and Equipment cartridges and DVS media open it. Thresholds are uncalibrated against real lock loss. |
| PDF reports (FS-03) | Implemented | WebView2 `PrintToPdf` through a hidden print host on Windows, print-dialog fallback elsewhere. Kinds: run, device, systemHealth, pregig, latency, stylus, wearMap, scratch, hum and venue. A timeout offers Retry; the saved toast offers Open and Show in folder. |
| Startup/brake | Partial | Signal-envelope timing proxy implemented; validated platter-speed transition method remains outstanding. |
| Cartridge diagnostics | Partial | Balance/polarity and THD estimate implemented; guided L/R isolated-track channel-separation (crosstalk) workflow implemented; full alignment workflows remain. |
| Generic DVS | Implemented foundation | Scope geometry, levels, correlation and missing-signal timeline; no vendor-specific decoding yet. |
| Full-side vinyl scan | Implemented foundation | Transient candidates, recurrence, hum/rumble proxy, normalized positions and condition summary; mature classifiers/repeat alignment remain. |
| Diagnostic reasoning | Implemented foundation | Transparent hypotheses, alternatives and isolation tests; the evidence graph (hypothesis, support, contradiction) is persisted in Tauri mode. |
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
| Export | PDF | SPEC-06 | 11 (FS-03 in progress) |
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
