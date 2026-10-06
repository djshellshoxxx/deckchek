# SPEC-09: Implementation Roadmap

## 1. Goal

Build DeckChek in layers so useful diagnostic capability ships before advanced classification is complete.

## 2. Phase 0: Repository and engineering foundation

Deliverables:
- Rust workspace;
- Tauri desktop shell;
- TypeScript UI;
- SQLite migration runner;
- logging;
- config;
- CI on Windows/Linux/macOS where practical;
- unit test framework;
- synthetic fixture generator.

Suggested workspace:

```text
deckchek/
  crates/
    deckchek-core/
    deckchek-audio/
    deckchek-dsp/
    deckchek-dvs/
    deckchek-vinyl/
    deckchek-db/
    deckchek-report/
  app/
    src-tauri/
    src/
  database/
  fixtures/
  docs/
```

Exit:
- app opens;
- DB migrates;
- device list displayed;
- stereo capture works;
- WAV test file can be analyzed.

## 3. Phase 1: Signal-chain health

Features:
- meters;
- clipping;
- channel presence;
- RMS/peak;
- channel balance;
- polarity/correlation;
- 50/60 Hz hum;
- basic spectrum;
- capture quality.

Why first:
Every later test depends on trustworthy input.

Exit:
- Quick Check report works.

## 4. Phase 2: Speed and pitch

Features:
- reference-tone detector;
- RPM;
- speed error;
- drift;
- wow/flutter raw trace;
- pitch-fader mapper;
- quartz-lock test;
- startup;
- brake;
- recovery.

Exit:
- used-turntable diagnostic report is useful without DVS.

## 5. Phase 3: Cartridge diagnostics

Features:
- known mono balance;
- L/R crosstalk;
- phase;
- distortion;
- test-record catalog;
- azimuth evidence;
- tracking/mistracking;
- anti-skate evidence.

Exit:
- guided cartridge setup/health report.

## 6. Phase 4: Generic DVS

Features:
- XY scope;
- ellipse fit;
- signal integrity;
- carrier stability;
- channel loss;
- noise/hum;
- generic dropout;
- whole-side quality timeline.

Exit:
- useful with unsupported control formats.

## 7. Phase 5: Specific DVS analyzers

Order based on technically/licensably available formats.

Candidate:
- open/xwax-compatible;
- Serato diagnostic support;
- Traktor diagnostic support;
- rekordbox diagnostic support.

Each analyzer can have capability flags:
- DETECT;
- SPEED;
- DIRECTION;
- RELATIVE;
- ABSOLUTE_POSITION;
- MEDIA_ID;
- READABILITY.

Do not block generic support waiting for every proprietary decoder.

## 8. Phase 6: Scratch stress / cue wear

Features:
- reversal detector;
- scratch score;
- tracking-loss recovery;
- cue-point torture workflow;
- DVS media history.

Exit:
- cartridge/control-vinyl benchmarking.

## 9. Phase 7: Full-side ordinary vinyl scanner

Implement incrementally:
1. streaming capture;
2. click detector;
3. event timeline;
4. repeating scratch clusters;
5. crackle density;
6. repeat-scan alignment;
7. skip/repeat;
8. warp/off-center indicators;
9. wear hypotheses;
10. track aggregation;
11. live readiness.

Exit:
- vinyl-only DJ can scan a record and get useful side map.

## 10. Phase 8: Comparison database

Features:
- product catalog;
- assets;
- maintenance;
- setup;
- comparison UI;
- starter seed;
- test-record catalog;
- DVS media catalog.

Exit:
- compare two cartridges/decks/setups with provenance.

## 11. Phase 9: Venue/surface mode

Features:
- venue hierarchy;
- quiet baseline;
- level-step feedback test;
- isolation A/B;
- shock events;
- vinyl-only venue profile;
- session incident log.

Exit:
- vinyl DJ can document booth reliability.

## 12. Phase 10: Reasoning engine

Some simple rules can exist earlier, but this phase formalizes:
- evidence graph;
- hypothesis confidence;
- swap-test planner;
- alternative causes;
- explainability.

Exit:
- user gets actionable troubleshooting rather than raw graphs.

## 13. Phase 11: Reports and fleet/history

- technical HTML report;
- PDF;
- used-equipment report;
- vinyl condition report;
- venue report;
- trend dashboards;
- maintenance reminders.

## 14. Phase 12: Optional community layer

Not required for core product.

Possible:
- opt-in anonymous aggregates;
- product measurement distributions;
- venue/support knowledge sharing;
- user corrections;
- seed catalog update service.

Privacy:
- local-first;
- no raw audio upload by default;
- venue sharing opt-in.

## 15. MVP definition

MVP is not "all specs implemented."

DeckChek MVP:
- input selection;
- stereo Quick Check;
- speed from reference tone;
- wow/flutter raw metric;
- pitch map;
- hum/rumble;
- channel balance;
- generic DVS scope/integrity;
- whole-side event recording with click/repeating-event map;
- SQLite history;
- HTML report.

This is already a useful product.

## 16. V0.2 target

Add:
- startup/brake;
- crosstalk;
- test records;
- DVS whole-side wear scan;
- A/B deck compare;
- starter hardware DB.

## 17. V0.3 target

Add:
- scratch stress;
- repeat-scan vinyl confirmation;
- skip/locked groove;
- venue mode;
- diagnostic rule engine.

## 18. V0.4 target

Add:
- mature vinyl wear classifier;
- hardware-specific baselines;
- fleet/maintenance trends;
- PDF reports.

## 19. Risk register

### Risk: false scratch detection
Mitigation:
- evidence-first;
- recurrence;
- repeat-play confirmation;
- music false-positive corpus.

### Risk: proprietary DVS formats
Mitigation:
- generic analyzer is valuable alone;
- capability-based modules;
- use documented/open information;
- do not make absolute decoding a prerequisite.

### Risk: comparing unlike methods
Mitigation:
- method/version stored with every metric;
- comparable-only query.

### Risk: test-record imperfections
Mitigation:
- test record ID/pressing stored;
- multiple-reference validation;
- baseline comparisons.

### Risk: venue measurement without accelerometer
Mitigation:
- call audio-derived vibration a proxy;
- optional external sensor later.

### Risk: overconfident diagnoses
Mitigation:
- evidence vs hypothesis separation;
- confidence;
- swap-test planner.

## 20. First implementation issue list

1. Rust workspace/bootstrap.
2. SQLite migration runner.
3. Catalog seed loader.
4. CPAL input enumeration.
5. Lock-free/ring-buffer capture.
6. WAV capture writer.
7. RMS/peak/clipping detector.
8. FFT service.
9. hum detector.
10. phase/correlation.
11. reference-tone estimator.
12. speed metrics.
13. synthetic fixture generator.
14. pitch-map session wizard.
15. generic DVS scope.
16. ellipse fitting.
17. event stream schema.
18. click detector prototype.
19. report HTML renderer.
20. CI numeric regression tests.

## 21. Definition of done per feature

A feature is done only when:
- spec requirements implemented;
- deterministic test exists;
- negative test exists;
- method version assigned;
- data persisted;
- UI surfaces quality flags;
- report supports it;
- docs explain required setup.

## 22. Initial non-goals

- DJ music playback;
- beatmatching;
- audio restoration/export of repaired masters;
- automatic online marketplace grading;
- claiming visual vinyl condition from audio alone;
- universal ranking of all cartridges;
- cloud account requirement.

## 23. Acceptance criteria

Roadmap is complete when every required capability from SPEC-00 through SPEC-08 maps to a phase and MVP has no dependency on a future cloud service or proprietary DVS decoder.

## 24. Proposed CDJ major-release scope

See [SPEC-10: CDJ and Media-Player Diagnostics](SPEC-10-CDJ-media-player-diagnostics.md) for all 30 consideration items and split delivery recommendations. The v0.x phases above remain the engineering sequence; v1.0/v2.0 labels in SPEC-10 describe eventual CDJ scope and are proposals, not commitments.

Recommended v1.0: guided pitch calibration/display checks, tempo stability, zero-reset repeatability, basic analog signal health, generic CD/file DVS integrity, guided isolation, local player/firmware records, basic pair matching and inspection reports. Reuse phases 1, 2, 4, 8 and reporting infrastructure.

Recommended v2.0: fine pitch resolution, reference-aligned cue/loop/transport tests, disc-read timelines, burned-media compatibility, calibrated output tests, PCM comparisons, keylock/FX comparisons, supported decoder extensions and guided stress tests.

Recommended v3.0+: synchronized physical trigger/jog latency, low-level S/PDIF inspection, automated model-specific control and community benchmarks. Each requires its own hardware/backend and validation gates.

## 25. Proposed product editions and category coverage

[SPEC-11](SPEC-11-product-editions-and-categories.md) defines a free MIDI Tester category, paid Vinyl, CDJ / Media Player and Controller editions, and an Ultimate edition containing the three paid modules. These are product packaging targets; the v0.x phases above remain the implementation order. MIDI Tester remains a separate free browser app. Controller edition work builds on its MIDI diagnostics and adds controller, motorized surface and supported audio-path testing.

Hybrid equipment is represented by capability profiles and one shared hardware record. A hybrid analog/DVS turntable is primarily Vinyl, a motorized control deck is primarily Controller, and an all-in-one player/controller may use both Controller and CDJ / Media Player modules. No edition model permits untested capabilities to be reported as passed.

See SPEC-11 for the complete intended test catalog and classification rules.

## 26. Component reuse and scientific validation sequence

Use [OPEN-SOURCE-RESEARCH](OPEN-SOURCE-RESEARCH.md) to accelerate existing phases: evaluate CPAL/hound/RustFFT first, then basic evidence detectors, tone speed/generic scope, runout RPM, full-side candidates and repeat-scan alignment.

[SPEC-18](SPEC-18-open-source-reuse-and-validation.md) and [SPEC-19](SPEC-19-scientific-measurement-and-validation.md) add release gates without making optional decoders, Pro DJ Link, perceptual models, broad codecs or swept-sine measurements beta dependencies. Library candidates are not adopted dependencies. Validate precision and real-music false positives before releasing damage/standards claims.
