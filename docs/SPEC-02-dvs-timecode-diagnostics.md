# SPEC-02: DVS and Timecode Diagnostics

## 1. Purpose

This specification defines DeckChek's DVS/timecode diagnostic engine. The engine is a diagnostic tool, not a DJ playback engine.

It must evaluate the complete path:

control media → stylus/cartridge or control source → turntable → cabling → mixer/interface → audio capture → timecode signal quality.

The primary product value is not merely displaying a scope. It is explaining why DVS tracking is good or bad, locating bad regions on control media, quantifying scratch robustness, and comparing setups.

## 2. Supported analyzer architecture

DVS support is modular.

```text
DvsAnalyzer
  id
  display_name
  media_family
  detect(capture) -> DetectionResult
  calibrate(capture) -> CalibrationResult
  analyze(frame) -> DvsFrameResult
  decode_position(frame) -> optional PositionResult
  flush()
```

Initial families:
- Generic stereo control-signal analyzer
- Serato-family analyzer where implementable from documented/legally usable information
- xwax-compatible analyzer using compatible open implementation concepts/license boundaries
- Traktor-family diagnostic analyzer
- rekordbox-family diagnostic analyzer
- generic user-defined reference-tone analyzer

A vendor-specific module may provide signal-quality diagnostics even if absolute-position decoding is not implemented.

## 3. Legal/technical separation

DeckChek must separate:
1. generic observable signal analysis;
2. documented public characteristics;
3. open-source compatible decoders;
4. proprietary format-specific decoding.

The application remains useful without proprietary absolute-position decoding.

For example, generic DVS analysis can measure:
- L/R level;
- phase shape;
- circularity;
- carrier stability;
- speed;
- direction where derivable;
- dropout;
- SNR;
- crosstalk;
- hum;
- wear/noise;
- scratch survivability.

## 4. Auto-detection

When a DVS capture begins:
1. detect whether a stable control-like signal exists;
2. classify likely family/version if possible;
3. report confidence;
4. allow manual override.

Never silently claim an exact pressing/version below a confidence threshold.

Detection features may include:
- dominant carrier;
- stereo phase relationship;
- spectral distribution;
- known framing/signature;
- decoded metadata when available.

## 5. Calibration

### 5.1 Generic calibration

Capture a stable 5-10 second passage.

Estimate:
- L RMS;
- R RMS;
- peak;
- channel ratio;
- correlation;
- phase orbit;
- noise floor;
- hum;
- signal bandwidth;
- carrier frequency;
- carrier variance.

### 5.2 Vendor calibration alignment

Serato's published guidance uses a scope display in which a clean signal should form a clean circular inner ring and exposes a readable-signal percentage. DeckChek should provide comparable diagnostic concepts without pretending its percentage is identical to Serato's internal value.

Native Instruments similarly exposes a timecode scope used for calibration. rekordbox also uses a calibration scope with L/R and phase/amplitude balancing.

DeckChek's own metrics must therefore be named explicitly:
- DeckChek Scope Circularity;
- DeckChek Signal Integrity;
- DeckChek Tracking Confidence.

## 6. Scope renderer

Render:
- XY phase scope;
- persistence trail;
- selectable time window;
- L/R levels;
- correlation;
- fitted ellipse;
- circularity score;
- eccentricity;
- rotation direction if identifiable.

### 6.1 Ellipse metrics

Fit the XY point cloud.

Store:
- major axis;
- minor axis;
- axis ratio;
- rotation;
- center offset;
- residual error.

Possible evidence:
- level imbalance → ellipse scaling;
- phase error → ellipse deformation/rotation;
- clipping → flattened edges;
- channel loss → line-like scope;
- noise → fuzzy/thick scope.

## 7. DVS signal integrity score

Components:
- channel presence;
- level stability;
- clipping;
- SNR;
- carrier lock;
- phase geometry;
- dropout rate;
- decoded frame success if supported;
- position continuity if supported.

Score 0-100 with component breakdown.

No fixed universal pass threshold should be implied across all vendors. Vendor-specific notes may reference official guidance separately.

## 8. Readability / decode quality

Where a decoder exists:
- successful decode frames;
- invalid frames;
- corrected frames if algorithm supports it;
- position confidence;
- direction confidence;
- speed confidence.

Metrics:
- valid_frame_percent;
- longest invalid run;
- invalid runs/minute;
- mean confidence;
- p5 confidence;
- p95 confidence.

## 9. Absolute position continuity

If the format supports absolute position:
- decode position;
- calculate expected continuity;
- detect jumps;
- detect backward discontinuities not explained by direction;
- detect impossible leaps;
- correlate with audio defects.

Events:
- POSITION_DROPOUT;
- POSITION_JUMP;
- POSITION_AMBIGUITY;
- ABSOLUTE_TO_RELATIVE_FALLBACK_LIKELY.

## 10. Speed and direction

For compatible formats, derive:
- instantaneous velocity ratio;
- RPM;
- direction;
- zero-velocity region;
- reversal.

Check:
- false reversals;
- direction uncertainty;
- impossible spikes;
- speed jitter.

## 11. DVS dropout detector

A dropout event occurs when one or more of:
- carrier lock lost;
- channel drops below threshold;
- decoded validity collapses;
- position continuity fails;
- phase geometry collapses.

Store:
- start/end sample;
- duration;
- channel;
- pre-event quality;
- post-event quality;
- waveform fingerprint;
- suspected cause.

## 12. Fault signatures

### 12.1 Missing one channel

Evidence:
- one channel near noise floor;
- phase scope collapses toward line;
- decode quality poor or impossible.

Possible causes:
- headshell contact;
- cartridge lead;
- RCA cable;
- mixer input;
- interface channel;
- cartridge coil failure.

### 12.2 Channel imbalance

Evidence:
- stable L/R dB mismatch;
- ellipse axis imbalance.

Possible causes:
- cartridge balance;
- azimuth;
- unequal gain;
- cable/contact resistance;
- worn groove wall.

### 12.3 Grounding/hum

Evidence:
- 50/60 Hz family;
- broad phase-scope fuzz;
- quality degradation strongest near zero velocity.

### 12.4 Worn control vinyl

Evidence may include:
- localized sustained loss of decode/readability;
- repeated defect when same region replayed;
- elevated broadband noise;
- increasing error toward heavily used cue zones;
- normal hardware on another control record.

Serato's own scope guide explicitly identifies worn and badly worn control-vinyl conditions, so DeckChek should include a wear hypothesis, but only after component isolation.

### 12.5 Dirty stylus / contamination

Evidence:
- sudden degradation after previously clean capture;
- broadband noise/crackle;
- possible recovery after cleaning;
- defects not anchored to same control-record position on replay.

### 12.6 Damaged stylus

Evidence:
- persistent poor geometry/quality across multiple media;
- both ordinary and control vinyl affected;
- high distortion;
- replacement cartridge/stylus resolves issue.

### 12.7 Too-light tracking

Evidence:
- intermittent tracking loss;
- vibration sensitivity;
- scratch test failures;
- loss during high acceleration.

Never recommend tracking beyond cartridge manufacturer range.

## 13. Scratch stress test

### 13.1 Goal

Measure how well the entire setup preserves DVS control during aggressive manipulation.

### 13.2 Procedure

1. Acquire stable baseline.
2. User performs normal scratches for 30 s.
3. Optional "aggressive" run.
4. Detect every direction reversal.
5. Measure control validity around reversal.
6. Detect tracking loss.

### 13.3 Metrics

- total reversals;
- reversals/sec;
- maximum forward velocity;
- maximum reverse velocity;
- zero-crossing count;
- median reversal duration;
- tracking-loss events;
- longest loss;
- false direction events;
- position discontinuities;
- per-channel stability;
- recovery time.

### 13.4 Scratch score

Components:
- continuity;
- recovery;
- dropout;
- direction accuracy;
- signal stability.

Profiles:
- mixing;
- light scratching;
- battle/scratch.

## 14. Needle-drop test

Where absolute position is supported:
- user lifts and drops needle at random points;
- measure time to position lock;
- false lock count;
- position error where reference is known.

Metrics:
- acquisition median;
- p95 acquisition;
- failures/20 drops;
- wrong-position events.

## 15. Cue-point torture test

DVS DJs repeatedly cue the same groove region.

Mode:
- user selects a cue region;
- performs 100/500/1000 cue/back-cue cycles manually over time;
- DeckChek can compare baseline scans before/after.

Outputs:
- readability delta;
- noise delta;
- local wear score;
- tracking-loss delta.

This is useful for cartridge/control-vinyl comparisons.

## 16. Whole-side DVS media scan

Play entire control side once.

For each analysis window store:
- normalized position;
- absolute timecode position when available;
- L/R level;
- carrier lock;
- speed;
- circularity;
- SNR;
- decode rate;
- dropout count;
- noise;
- hum;
- click rate.

Generate a 0-100 condition timeline.

### 16.1 Region classification

- GOOD
- FAIR
- DEGRADED
- POOR
- UNUSABLE
- INCONCLUSIVE

Thresholds are analyzer-specific and versioned.

### 16.2 Wear map

The UI displays radial/time bands.

Example:

```text
00:00 ┃████████████████████┃ 99
02:00 ┃███████████████████░┃ 96
04:00 ┃█████████████████░░░┃ 88
06:00 ┃██████████████░░░░░░┃ 73
08:00 ┃████████████░░░░░░░░┃ 61  probable wear
10:00 ┃████████████████░░░░┃ 84
```

## 17. Repeat-scan confirmation

A defect gains confidence if:
- same media identifier;
- same side;
- same position within tolerance;
- same degradation signature;
- appears on multiple plays.

Status:
- tentative;
- repeated;
- confirmed;
- resolved/not reproduced.

## 18. Distinguishing media vs hardware fault

DeckChek should propose a swap matrix:

Test A: current control record + current cartridge
Test B: alternate control record + current cartridge
Test C: current record + alternate cartridge/deck
Test D: direct/reference control source if available

Inference examples:
- follows record → media likely;
- follows cartridge/headshell → cartridge path likely;
- follows mixer channel → mixer/input likely;
- follows interface channel → capture path likely.

## 19. Two-deck DVS matching

Compare:
- input level;
- scope geometry;
- SNR;
- hum;
- decode quality;
- scratch score;
- dropout rate;
- speed stability.

Provide:
- raw deltas;
- match score;
- dominant mismatch;
- isolation suggestion.

## 20. DVS media database

For each family/version:
- vendor;
- product name;
- medium type;
- pressing/version;
- side identifiers;
- nominal RPM;
- supported modes;
- analyzer support;
- absolute-position support;
- known duration;
- public documentation;
- notes;
- user condition history.

Do not copy proprietary signal payloads into the repository unless licensing permits it.

## 21. DVS source types

Support metadata for:
- traditional control vinyl;
- control CD/WAV;
- motorized controller emitting control tone;
- wireless systems that integrate with supported DJ software, represented as hardware metadata even if no raw timecode audio is available.

Rane documents that the Twelve MKII can emit a Serato control tone from RCA outputs, so DeckChek should permit "hardware-generated control signal" as a source class.

## 22. Generic unknown-timecode mode

For an unsupported format, DeckChek still analyzes:
- stereo scope;
- carrier peaks;
- level;
- phase;
- stability;
- clipping;
- dropout;
- hum;
- noise;
- speed ratio if user provides nominal carrier.

It labels:
"Generic DVS signal; format decoding unavailable."

## 23. Timecode reference capture

User can create a local reference:
- select media;
- select pristine region;
- capture 10-30 s;
- store spectral/phase fingerprint;
- optionally store raw WAV.

Later scans compare against that reference even when exact format is unknown.

## 24. Timecode comparison database

Compare by measured field:
- tracking integrity;
- cue-wear rate;
- scratch score;
- output level;
- noise susceptibility;
- cartridge compatibility;
- minimum clean signal level;
- venue vibration tolerance.

Distinguish:
- manufacturer fact;
- DeckChek lab/user measurement;
- community aggregate.

## 25. Reporting

DVS report must include:
- analyzer;
- media identity;
- side;
- hardware chain;
- capture validity;
- scope image;
- quality score;
- region map;
- dropout timeline;
- scratch test;
- likely faults;
- isolation steps;
- baseline delta.

## 26. Acceptance criteria

Implementation is complete when:
- generic stereo DVS scope works in real time;
- level/phase/circularity metrics persist;
- a stable synthetic control-like signal receives high integrity;
- a missing channel is detected;
- clipping is detected;
- injected dropouts appear at exact timeline positions;
- whole-side windows produce a condition map;
- repeated defects can be confirmed across two scans;
- scratch reversals can be counted from a synthetic velocity trace or supported control signal;
- unsupported formats degrade gracefully to generic analysis;
- vendor-specific scores are never misrepresented as the vendor's own internal score.

## Open implementation capability and licensing requirements

Apply [SPEC-18 section 8](SPEC-18-open-source-reuse-and-validation.md). Generic scope/carrier quality and actual format decoding are separate capabilities. Absolute position and decoder lock are unavailable until a compatible decoder is implemented and validated for the exact media profile.

The inspected xwax decoder is GPL-3.0-only and expressly requires separate licensing for proprietary incorporation. Reference study does not approve source translation or copying into this core. Synthetic quadrature validates generic scope, not vendor decoding.
