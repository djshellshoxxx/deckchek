# SPEC-08: Measurement Methodology, Validation, QA, and Test Fixtures

## 1. Purpose

DeckChek is a measurement product. A polished UI is not sufficient. Every detector and score must be testable against known input.

This document defines:
- synthetic fixtures;
- recorded fixtures;
- hardware loopback tests;
- test-record procedures;
- algorithm tolerances;
- regression tests;
- cross-device validation;
- confidence validation.

## 2. Validation hierarchy

### Tier A: deterministic synthetic signals
Best for exact expected answers.

Examples:
- sine at known frequency;
- known FM wow;
- known fast flutter;
- known channel imbalance;
- known phase offset;
- known crosstalk;
- 50/60 Hz hum;
- deterministic dropouts;
- injected clicks;
- repeating once-per-revolution impulses;
- synthetic skips/repeats;
- DVS-like phase signals.

### Tier B: captured electrical loopback
Tests:
- audio driver;
- ADC/DAC;
- channel mismatch;
- latency;
- noise;
- sample-clock behavior.

### Tier C: reference/test-record captures
Tests physical playback chain.

### Tier D: repeated real-world datasets
Tests robustness and false-positive behavior.

A feature should not be marked production-ready solely from Tier D anecdotal testing.

## 3. Golden fixture format

Each fixture directory:

```text
fixtures/
  speed_33_exact/
    audio.wav
    expected.json
    README.md
```

expected.json:

```json
{
  "fixtureVersion": 1,
  "sampleRate": 96000,
  "expectations": [
    {
      "metricKey": "speed.rpm.mean",
      "value": 33.333333,
      "tolerance": 0.005
    }
  ]
}
```

Large WAV fixtures may use Git LFS or generation code where licensing allows.

## 4. Signal generator

A Rust test-fixture generator should create deterministic WAV files.

Parameters:
- sample rate;
- duration;
- channels;
- tone frequency;
- amplitude;
- noise;
- phase;
- FM modulation;
- AM modulation;
- transient list;
- dropouts;
- hum family;
- drift.

Use deterministic RNG seed for noise.

## 5. Speed estimator tests

Fixtures:
1. exact 3150 Hz;
2. +0.1%;
3. -0.1%;
4. slow linear drift;
5. 0.55 Hz modulation;
6. tone + noise;
7. tone + clicks;
8. clipped tone;
9. low-level tone.

Expected:
- mean frequency accuracy;
- mean RPM;
- trace stability;
- quality flags.

Initial target:
- mean speed ratio error <= 0.01% for clean synthetic tone;
- no silent success when clipping invalidates estimator.

## 6. Wow/flutter tests

Generate frequency-modulated reference tone with:
- single low-rate sinusoidal modulation;
- single higher-rate modulation;
- combined;
- drift + modulation.

Validate:
- modulation frequency;
- modulation depth;
- raw RMS;
- weighted implementation against independently calculated fixtures.

If IEC 60386 weighting is implemented, preserve the exact standard/method version and validate against known reference calculations.

## 7. Channel balance tests

Synthetic stereo:
- equal;
- 0.5 dB imbalance;
- 1 dB;
- 3 dB;
- 6 dB;
- swapped amplitude.

Target:
- <= 0.05 dB error on clean digital fixture.

## 8. Phase/polarity tests

Fixtures:
- 0 degrees;
- 30;
- 45;
- 90;
- 180;
- one channel inverted;
- different gains plus phase.

Test:
- phase estimator;
- polarity classifier;
- ellipse metrics.

## 9. Crosstalk tests

L-only fixture with known leakage:
- -20 dB;
- -30 dB;
- -40 dB;
- -60 dB.

Repeat R-only.

Target:
- <= 0.2 dB on clean digital fixture where numeric precision permits.

## 10. Hum tests

Generate:
- 50 Hz + 100/150;
- 60 Hz + 120/180;
- mixed hum;
- hum + music-like noise;
- one-channel hum.

Validate:
- mains family;
- harmonic levels;
- channel classification.

## 11. Click/impulse tests

Fixtures include:
- isolated Dirac-like impulses;
- shaped vinyl-like clicks;
- clusters;
- clicks over silence;
- clicks over synthetic percussion;
- clean percussion with no injected clicks.

Measure:
- precision;
- recall;
- timestamp tolerance;
- false-positive rate.

Do not optimize only for recall. A detector that marks every snare as damage is unusable.

## 12. Repeating scratch tests

Inject an event every revolution for:
- 3;
- 5;
- 10;
- 30 revolutions.

Jitter recurrence timing slightly.

Negative fixtures:
- kick drum every 1.8 s but changing morphology;
- metronome exactly at revolution period;
- sparse random clicks.

Classifier must use multiple features, not period alone.

## 13. Crackle tests

Generate high-rate low-amplitude impulses using deterministic distributions.

Expected:
- relative crackle density;
- segment ranking;
- stability across sample rates.

## 14. Skip/repeat tests

Construct source:
A B C D E

Forward skip:
A B D E

Backward repeat:
A B C B C D

Test optional fingerprint/alignment detector.

For unknown-content mode, require lower-confidence output.

## 15. Warp/off-center tests

Synthetic:
- low-frequency AM/subsonic modulation at revolution rate;
- pitch FM at revolution rate.

Test:
- separate warp-like LF movement from off-center-like pitch modulation;
- both remain hypotheses unless corroborated.

## 16. Full-side scalability test

Generate 60-minute stereo fixture at:
- 48 kHz;
- 96 kHz;
- optionally 192 kHz.

Acceptance:
- bounded RAM;
- no event loss;
- deterministic output;
- post-pass completes;
- cancellation cleans temp resources;
- crash recovery can identify incomplete session.

## 17. DVS generic-scope fixtures

Generate stereo quadrature sine:
L = sin(wt)
R = cos(wt)

Variants:
- gain mismatch;
- phase mismatch;
- clipping;
- noise;
- one channel lost;
- intermittent dropout.

Validate:
- circularity;
- ellipse ratio;
- clipping;
- dropout;
- carrier stability.

## 18. DVS vendor fixtures

Only include raw vendor signal fixtures if redistribution is allowed.

Alternative:
- user-generated local fixtures;
- tests that run only when fixture exists;
- open-compatible signals;
- synthetic generic signals.

Do not commit copyrighted/proprietary control audio without permission.

## 19. DVS dropout tests

Inject:
- 1 ms;
- 5 ms;
- 10 ms;
- 20 ms;
- 50 ms;
- 100 ms;
- 500 ms.

Record:
- detection threshold;
- timestamp error;
- recovery measurement.

## 20. Scratch-stress trace tests

A synthetic velocity trace contains:
- forward;
- reverse;
- zero crossings;
- rapid chirps;
- baby scratches;
- long backspin.

Expected:
- reversal count;
- max/min velocity;
- false-direction count.

## 21. Hardware loopback calibration

Procedure:
1. output known stereo tones from interface;
2. physically loop output to input at safe line level;
3. capture;
4. measure channel mismatch, phase, noise, frequency error.

Store as interface calibration.

This helps separate DeckChek/capture-path error from turntable error.

## 22. Audio-interface clock validation

Long tone capture:
- 10 min;
- 30 min optional.

Measure frequency drift.

Caution:
if source and capture use same device clock, common clock error cancels. Use independent source for absolute clock validation.

## 23. Test-record validation protocol

For each supported test record:
- verify catalog/version;
- document exact side/track;
- confirm published nominal signal;
- capture on at least two known-good systems where possible;
- record pressing variance observations;
- never treat vinyl test record as mathematically perfect.

## 24. Turntable cross-check

Where possible compare DeckChek speed/wow results with:
- calibrated hardware wow/flutter meter;
- trusted frequency counter;
- independent reference application.

Document device/model/calibration date.

## 25. Physical fault fixture library

Build a lab matrix from controlled, reversible conditions:
- L/R gain offset;
- extra cable attenuation;
- one RCA disconnected;
- swapped polarity;
- ground disconnected in a controlled bench setup;
- dirty control vinyl;
- known worn control vinyl;
- alternate stylus;
- intentional mild tracking-force differences within manufacturer range.

Never damage equipment merely to create a fixture.

## 26. Vinyl defect corpus

Use records with user-confirmed:
- scratch;
- click;
- crackle;
- warp;
- off-center hole;
- non-fill;
- skip;
- locked groove;
- clean control.

For each:
- capture multiple plays;
- hand annotate;
- preserve hardware chain.

This becomes classifier validation set.

## 27. Cross-play confirmation test

A physical scratch should recur at aligned groove position.

Test scanner:
- same record twice;
- clean then dirty;
- clean after cleaning;
- different cartridge;
- different deck.

Evaluate whether confidence changes sensibly.

## 28. False-positive corpus

Include music genres likely to challenge detector:
- sparse techno;
- breakbeats;
- drum and bass;
- hard transient percussion;
- distorted/noise music;
- quiet classical;
- spoken word.

The scanner must not be tuned only on gentle material.

## 29. Venue test validation

Simulated/controlled:
- table with vibration source;
- isolation added;
- speaker low-frequency sweep.

Measure whether DeckChek correctly ranks:
baseline vs higher vibration,
unisolated vs isolated.

Do not require absolute acceleration without calibrated sensor.

## 30. Database tests

- migration from empty DB;
- foreign-key enforcement;
- seed import;
- duplicate prevention;
- product/asset distinction;
- soft delete;
- export/import round trip;
- method-compatible query;
- method-incompatible exclusion.

## 31. Reasoning-engine tests

Each hypothesis rule gets:
- positive fixture;
- negative fixture;
- ambiguous fixture;
- contradictory evidence fixture.

Example:
CONTROL_VINYL_WEAR
- positive: defect follows same record position;
- negative: fault follows mixer channel;
- ambiguous: one bad scan only.

## 32. Score regression

For each score version, store input metric fixture and exact expected score.

Changing weights requires a new score version.

## 33. Report snapshot tests

Generate reports from frozen session fixture.

Check:
- required sections;
- units;
- no missing evidence links;
- correct confidence language;
- no NaN/Infinity;
- method names.

## 34. Performance targets

Initial targets on ordinary modern desktop hardware:
- live meters <50 ms display latency;
- real-time detectors keep up at 96 kHz stereo;
- audio callback performs no blocking database/file work;
- no allocations in time-critical path where practical;
- 30-minute post-scan analysis completes without unbounded memory.

Exact benchmark hardware should be recorded in CI/dev docs.

## 35. Fuzz/property tests

Useful properties:
- no detector panics on arbitrary finite PCM;
- no NaN/Infinity stored;
- confidence always 0..1;
- normalized vinyl position 0..1;
- end_sample >= start_sample;
- measurement units match metric definition.

## 36. Release gates

A feature cannot leave experimental status until:
- algorithm has deterministic fixture;
- error tolerance documented;
- at least one negative fixture;
- quality flags implemented;
- report interpretation reviewed;
- method version assigned.

## 37. Acceptance criteria

This methodology is implemented when CI can:
- generate synthetic fixtures;
- run core DSP measurements;
- run SQLite migrations;
- import seeds;
- run reasoning fixtures;
- run score regression;
- fail build on numeric regressions outside tolerance.

## 38. Research-derived independent validation

[SPEC-18 section 10](SPEC-18-open-source-reuse-and-validation.md) and [SPEC-19](SPEC-19-scientific-measurement-and-validation.md) add calibrated FFT/PSD checks, clock/reference uncertainty, long-file continuity, runout-click limitations, false-positive benchmarks and alignment abstention tests.

Use recording-level held-out splits, one-to-one event matching, explicit timestamp tolerance, genre breakdowns and false positives per minute/hour. Keep clip-classification measures separate from event precision/recall. Record listener disagreement and audition conditions. A detector's agreement with its ancestor or another app is not independent ground truth. Standards claims require the full exact method.
