# SPEC-00: Product Architecture

## 1. Purpose

This document defines the system-level architecture for DeckChek. It establishes module boundaries, analysis contracts, session workflow, timing model, confidence handling, storage, device abstraction, and the rules that all later feature specifications must follow.

## 2. Scope

DeckChek is a diagnostic workstation for analog and DVS DJ playback systems. It covers:

- turntable motor/platter performance;
- pitch control;
- cartridge/stylus/tonearm behavior;
- phono signal integrity;
- DVS/timecode signal quality;
- complete-side inspection of ordinary and control vinyl;
- mixer/phono-preamp/audio-interface contribution;
- venue and support-surface behavior;
- long-term health trending;
- comparison of hardware and configurations.

DeckChek does not attempt to replace a DAW, mastering suite, DJ application, or audio restoration editor.

## 3. Operating modes

### 3.1 Quick Check

A 30-120 second guided test intended to answer whether a deck is healthy enough to use.

Inputs:
- stereo capture;
- optional known test tone;
- optional DVS control media.

Outputs:
- input level;
- clipping;
- channel balance;
- hum;
- rumble;
- gross speed error;
- DVS readability when applicable;
- high-confidence faults.

### 3.2 Standard Diagnostic

A guided multi-test sequence. The wizard selects tests based on available equipment and media.

Typical sequence:
1. interface calibration;
2. silence/noise-floor capture;
3. stationary-platter capture where meaningful;
4. reference-tone playback;
5. speed/wow/flutter test;
6. channel/crosstalk test;
7. pitch-fader sweep;
8. start/brake test;
9. optional DVS test;
10. report.

### 3.3 Full-Side Scan

Records an entire vinyl side and produces a time/radial condition map. Defined in SPEC-03.

### 3.4 Service Mode

Exposes advanced controls and raw traces:
- FFT/spectrogram;
- correlation;
- phase;
- raw detector events;
- window length;
- thresholds;
- calibration constants;
- reference metadata;
- device routing.

### 3.5 Compare Mode

Compares:
- Deck A vs Deck B;
- current run vs historical baseline;
- cartridge A vs B;
- setup A vs B;
- venue/location A vs B;
- timecode pressing/side A vs B.

## 4. High-level architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                        DeckChek UI                          │
│ Tauri + TypeScript                                         │
├─────────────────────────────────────────────────────────────┤
│ Session Orchestrator                                       │
│ test plans • device routing • progress • user prompts       │
├─────────────────────────────────────────────────────────────┤
│ Analysis Coordinator                                       │
│ framing • timestamps • calibration • detector fan-out       │
├───────────────┬──────────────┬───────────────┬──────────────┤
│ Turntable DSP │ Cartridge   │ DVS/Timecode  │ Vinyl Defect │
│ speed/wow     │ balance     │ analyzers     │ detectors     │
│ flutter       │ crosstalk   │ scope         │ clicks        │
│ pitch         │ phase       │ tracking      │ crackle       │
│ start/brake   │ hum/rumble  │ wear map      │ skips         │
├───────────────┴──────────────┴───────────────┴──────────────┤
│ Diagnostic Reasoning Engine                                │
│ evidence → hypotheses → isolation tests → confidence        │
├─────────────────────────────────────────────────────────────┤
│ SQLite Repository / Comparison Database                    │
├─────────────────────────────────────────────────────────────┤
│ Audio I/O • File I/O • Report Export • Hardware Metadata   │
└─────────────────────────────────────────────────────────────┘
```

## 5. Audio capture contract

Every analysis session must create an immutable capture descriptor.

Required fields:
- session UUID;
- capture UUID;
- device name and stable OS identifier when available;
- driver/backend;
- channel map;
- nominal sample rate;
- actual sample rate if measured;
- sample format;
- bit depth where known;
- start timestamp;
- mono/stereo/multichannel mode;
- source type;
- gain staging notes;
- phono/line status;
- whether external RIAA equalization exists;
- clipping count;
- dropped-buffer count;
- discontinuity count.

Raw audio may be optionally retained. Measurements must remain useful even if raw capture is later deleted.

### 5.1 Preferred sample rates

For general diagnosis:
- 48 kHz minimum;
- 96 kHz preferred for detailed transient and time-domain analysis;
- 192 kHz supported where hardware provides it but not required.

Algorithms must not assume 44.1 kHz.

### 5.2 Timebase

All detector events use:
- sample index;
- seconds from capture start;
- monotonic host timestamp where available.

For full-side scans, events additionally map to:
- normalized side position 0.0-1.0;
- estimated radial zone;
- optional track and musical-time position.

## 6. Measurement result contract

Every quantitative result uses a shared envelope.

```text
MeasurementResult
  id
  session_id
  test_id
  metric_key
  value
  unit
  channel_scope
  time_range
  method_id
  method_version
  calibration_id?
  quality_flags[]
  uncertainty?
  confidence
  reference_range?
  source = measured | derived | user-entered
```

Examples of metric keys:
- speed.rpm.mean
- speed.error.percent
- wow.weighted.percent
- flutter.weighted.percent
- channel.balance.db
- crosstalk.l_to_r.db
- hum.60hz.dbfs
- dvs.readability.percent
- vinyl.click_rate.per_minute
- vinyl.repeating_defect.confidence
- venue.feedback_onset.spl_db

Metric keys are stable public contracts. UI labels may change without changing stored metric keys.

## 7. Evidence vs diagnosis

A detector creates evidence. The reasoning engine creates diagnoses.

Example:

Evidence:
- narrow high-energy transient at 184.211 s;
- event repeats every 1.801 s for six revolutions;
- both channels affected with near-identical timing;
- local spectral energy extends above 10 kHz.

Derived hypothesis:
- probable physical scratch or groove defect.

Alternative hypotheses:
- repeated musical transient;
- pressing defect;
- debris fixed in groove.

Confidence increases when:
- event period matches current platter revolution period;
- recurrence persists across adjacent grooves;
- same location is observed on a second play;
- event morphology is stable.

Confidence decreases when:
- transient aligns with percussion;
- recurrence period does not match rotational period;
- event occurs only once;
- audio source itself contains similar transients.

## 8. Detector pipeline

Each detector implements:

```text
Detector
  detector_id()
  version()
  supported_sample_rates()
  required_channels()
  required_calibration()
  process(frame)
  flush()
  results()
```

Detectors may be real-time or post-pass.

### 8.1 Real-time detectors

Examples:
- clipping;
- signal loss;
- channel level;
- gross hum;
- DVS readability;
- dropout;
- speed;
- scope shape;
- buffer discontinuity.

### 8.2 Post-pass detectors

Examples:
- full-side scratch recurrence;
- cross-play defect confirmation;
- long-term drift;
- defect clustering;
- side wear gradient;
- comparative spectral degradation;
- wow/flutter standardized weighting;
- venue feedback transfer analysis.

## 9. Calibration model

DeckChek has separate calibration domains.

### 9.1 Audio-interface calibration

Captures:
- input path;
- gain setting;
- input mode;
- loopback gain/phase;
- channel mismatch;
- noise floor;
- latency where measurable.

### 9.2 Test-record calibration

Stores:
- record identifier;
- pressing/version;
- side;
- track;
- nominal frequency;
- nominal level if documented;
- mono/L/R assignment;
- expected duration.

### 9.3 DVS-media calibration

Stores:
- vendor/family;
- pressing/version;
- side;
- supported analyzer;
- nominal control characteristics where legally/documentedly available;
- reference quality capture hash;
- expected speed.

### 9.4 Venue baseline

Stores:
- location;
- booth;
- support surface;
- deck position;
- speaker/sub location metadata;
- quiet baseline;
- playback baseline;
- SPL if supplied;
- accelerometer/vibration input if available.

## 10. Diagnostic reasoning engine

The reasoning engine must not be a black box. Initial versions use explicit weighted rules.

A hypothesis contains:
- hypothesis key;
- supporting evidence rules;
- contradictory evidence rules;
- minimum evidence;
- confidence calculation;
- severity;
- next isolation tests;
- explanatory text.

Example hypothesis:

```text
GROUND_LOOP_OR_GROUNDING_FAULT

supports:
  hum fundamental at local mains frequency
  harmonics at 2x/3x
  similar magnitude in both channels
  hum changes when ground path changes

contradicts:
  one-channel-only dropout
  broadband cable crackle
  no mains-family peaks

next tests:
  capture with turntable motor off
  inspect ground lead
  compare alternate phono input
  swap RCA cable
```

The user must be able to open a diagnosis and see why DeckChek produced it.

## 11. Hardware abstraction

Hardware records are not hardcoded into DSP.

Categories:
- turntable;
- cartridge;
- stylus;
- headshell;
- mixer;
- phono preamp;
- audio interface;
- DVS interface;
- isolation platform;
- support/furniture;
- test record;
- DVS media.

A session references actual user-owned instances where possible, not merely product models. This enables maintenance history.

## 12. Local-first database

SQLite is the canonical store.

Requirements:
- works completely offline;
- schema migrations are versioned;
- user can export all data;
- no account required;
- raw captures can be external files referenced by hash/path;
- deleting an audio file does not delete measurements;
- comparison records retain method version.

Optional cloud/community sync can be designed later as a separate service.

## 13. Reproducibility

Every result must preserve:
- DeckChek app version;
- detector/method versions;
- sample rate;
- calibration used;
- hardware chain;
- media/test source;
- test parameters.

This is essential so historical results remain interpretable after algorithms improve.

## 14. Session quality flags

A session can be technically invalid even if measurements were produced.

Flags include:
- INPUT_CLIPPING;
- INPUT_TOO_LOW;
- SAMPLE_DROPOUT;
- DEVICE_CLOCK_UNSTABLE;
- WRONG_INPUT_MODE_SUSPECTED;
- PHONO_RIAA_UNKNOWN;
- MONO_CAPTURE_FOR_STEREO_TEST;
- TEST_TONE_NOT_IDENTIFIED;
- DVS_FORMAT_UNCERTAIN;
- EXTERNAL_VIBRATION_HIGH;
- USER_INTERRUPTED;
- INSUFFICIENT_DURATION.

Any score derived from a flagged session must visibly show degraded confidence.

## 15. Privacy

Venue entries may describe public or private locations. Default database stores venue names and user-entered notes only. Precise coordinates are not required.

Audio captures remain local by default.

## 16. Non-functional requirements

- Windows 10/11 initially; macOS and Linux architecturally supported.
- No administrator privileges for routine use.
- Analysis must survive device disconnect cleanly.
- Long full-side captures must stream to disk rather than stay in RAM.
- UI must remain responsive during analysis.
- All test sessions must be resumable where practical.
- Session database writes use transactions.
- Detector failure must not corrupt the rest of a session.
- A crash must leave recoverable capture metadata.

## 17. Acceptance criteria

Architecture is considered implemented when:
- a stereo capture can be created and persisted;
- detectors can subscribe independently;
- metrics use stable keys;
- a session stores reproducibility metadata;
- diagnostics reference evidence IDs;
- compare mode can query two sessions;
- full-side analysis can store time-coded events without retaining audio;
- database migrations can upgrade a previous schema;
- reports can reconstruct findings entirely from stored results.

## 18. Research-derived integration and metrology requirements

Apply [SPEC-18](SPEC-18-open-source-reuse-and-validation.md) to component selection, timebase preservation, long-file segmentation and dependency provenance. Apply [SPEC-19](SPEC-19-scientific-measurement-and-validation.md) to spectral units, uncertainty metadata and evidence validation.

Raw capture indices remain canonical across resampled analysis and alignment. Measurement uncertainty, perceived prominence and diagnostic confidence are separate fields/concepts. Capability discovery must represent missing decoding or calibration as unavailable.
