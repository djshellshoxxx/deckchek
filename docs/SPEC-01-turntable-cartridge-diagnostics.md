# SPEC-01: Turntable and Cartridge Diagnostics

## 1. Purpose

This specification defines all physical turntable, tonearm, cartridge, stylus, phono-signal, speed, pitch, start/stop, noise, and A/B deck diagnostic features.

The implementation must support two use cases:

1. a DJ or buyer wants a fast health check with ordinary equipment;
2. a technician wants repeatable, quantified measurements using test records and a calibrated interface.

The same engine serves both. The difference is confidence and available metrics.

## 2. Test capability levels

### Level 0: observation-only

Requires:
- stereo audio input;
- ordinary record or DVS record.

Can estimate:
- channel presence;
- balance;
- clipping;
- intermittent contacts;
- broadband noise;
- mains hum;
- gross rumble;
- dropouts;
- speed from known DVS carrier if supported;
- repeated mechanical artifacts.

Must not claim:
- calibrated frequency response;
- absolute cartridge output voltage;
- standardized wow/flutter;
- calibrated crosstalk;
unless a suitable known signal is available.

### Level 1: known-tone test

Requires:
- test record or DVS medium containing a known stable tone.

Adds:
- precise platter speed;
- short- and long-term speed stability;
- wow/flutter;
- pitch mapping;
- channel balance at known frequency;
- relative phase;
- distortion;
- frequency-specific crosstalk where test tracks permit.

### Level 2: calibrated test suite

Requires:
- documented test record;
- known interface gain/path;
- suitable tracks for L-only, R-only, mono, sweep, tracking tests, speed test.

Adds:
- calibrated channel separation;
- frequency response;
- azimuth indicators;
- anti-skate indicators;
- tracking-distortion tests;
- cartridge comparison against manufacturer specifications;
- repeatable maintenance baselines.

## 3. Input routing verification

Before any diagnostic run, DeckChek performs an input sanity check.

Measure for each channel:
- RMS;
- peak;
- crest factor;
- DC offset;
- clipping count;
- spectral centroid;
- mains-frequency family;
- interchannel correlation.

Detect:
- no signal;
- only one channel;
- identical dual-mono signal;
- channel swap suspicion;
- extreme gain mismatch;
- phono signal accidentally connected to line input;
- line-level source accidentally routed through phono gain, when evidence is strong;
- clipping before analysis.

A test requiring stereo shall not silently continue with one missing channel.

## 4. Platter speed test

### 4.1 Goal

Measure actual rotational speed and speed error at:
- 33 1/3 RPM;
- 45 RPM;
- 78 RPM where applicable;
- user-defined speeds;
- altered pitch positions.

### 4.2 Preferred methods

Order of preference:

1. known test tone on vinyl;
2. supported DVS directional carrier;
3. optical/external sensor input in a future extension;
4. audio-content estimation only as a low-confidence fallback.

### 4.3 Tone-derived speed

If a reference track has nominal frequency f_ref and measured instantaneous frequency f_meas:

speed_ratio = f_meas / f_ref

actual_rpm = nominal_rpm * speed_ratio

speed_error_percent = (speed_ratio - 1) * 100

Frequency estimation should use a phase-aware estimator, not only a coarse FFT-bin maximum.

Recommended processing:
- band-pass around reference;
- analytic/phase estimator or high-resolution frequency estimator;
- 10-50 ms low-level windows for instantaneous trace;
- robust smoothing for display;
- preserve unsmoothed trace for wow/flutter.

### 4.4 Outputs

- mean RPM;
- median RPM;
- mean speed error %;
- peak positive/negative deviation;
- short-term standard deviation;
- long-term drift;
- warm-up trend;
- revolution-synchronous modulation;
- confidence.

### 4.5 Warm-up test

Optional 5-30 minute mode:
- measure at fixed intervals;
- calculate drift from cold start;
- identify stabilization time;
- compare with stored baseline.

## 5. Wow and flutter

### 5.1 Definitions

DeckChek stores both raw and weighted representations.

Raw:
- instantaneous fractional frequency deviation;
- RMS deviation;
- peak deviation;
- modulation spectrum.

Weighted:
- standards-compatible result when an implemented weighting method is selected and validated.

IEC 60386 defines a weighted-peak method for speed fluctuation measurement. DeckChek must name the method used rather than displaying an unexplained "wow/flutter" number.

### 5.2 Frequency bands

Internally separate:
- long drift;
- wow;
- flutter;
- high-frequency jitter.

Exact filter bands must be versioned as part of method_id. UI shall show the selected methodology.

### 5.3 Revolution-synchronous analysis

For a 33 1/3 RPM record, one platter revolution is about 1.8 seconds.

DeckChek must inspect modulation at:
- 1x revolution;
- 2x;
- 3x;
- subharmonics where relevant.

This can expose:
- eccentric spindle/record behavior;
- belt periodicity;
- motor cogging-like signatures;
- bearing-related modulation;
- record-hole eccentricity.

The report shall distinguish "platter/deck likely" from "test record may be eccentric" when only one disc has been tested.

### 5.4 Acceptance

A synthetic FM test signal with known modulation depth/frequency must produce the expected measurement within the validation tolerance documented in SPEC-08.

## 6. Pitch-fader mapper

### 6.1 Goal

Map physical pitch-fader position to actual speed change.

### 6.2 Guided procedure

1. User selects turntable model or "unknown."
2. App loads expected pitch range if known.
3. User places fader at minimum.
4. App acquires stable measurement.
5. App prompts user to move through checkpoints.
6. Checkpoints can be automatic if continuous movement is detected.
7. App records physical position entered by user or inferred from commanded checkpoints.
8. App builds measured curve.

Default checkpoints:
- min;
- -75%;
- -50%;
- -25%;
- center;
- +25%;
- +50%;
- +75%;
- max.

For a nominal +/-8% range these become expected speed points according to model behavior.

### 6.3 Detected conditions

- zero point offset;
- center quartz-lock mismatch;
- asymmetry;
- dead zone;
- jump/discontinuity;
- nonlinearity;
- range too narrow;
- range too wide;
- unstable segment;
- intermittent fader;
- double-zero behavior on models known for it, where relevant.

### 6.4 Metrics

- max absolute mapping error;
- RMS mapping error;
- monotonicity failures;
- zero offset;
- positive-side gain;
- negative-side gain;
- local slope;
- hysteresis when swept both directions.

### 6.5 Hysteresis test

Optional:
- sweep bottom→top;
- sweep top→bottom;
- compare speed at equivalent positions.

Large disagreement suggests fader/contact/mechanical issues.

## 7. Quartz lock / zero-point test

For models with quartz lock or reset:
- record free fader-centered speed;
- record quartz/reset speed;
- compare;
- measure lock acquisition time;
- measure residual error after lock;
- repeat 10 times.

Output:
- mean lock error;
- worst lock error;
- acquisition-time distribution;
- failed-lock count.

## 8. Startup performance

### 8.1 Goal

Estimate time from command/start to stable target speed.

### 8.2 Procedure

User starts platter from rest while reference tone is cued.

Detect:
- first motion;
- speed rise curve;
- overshoot;
- settling.

Metrics:
- time to 90%;
- time to 95%;
- time to 99%;
- time to stable band;
- overshoot %;
- settling time.

### 8.3 Torque proxy

DeckChek may report a "startup acceleration proxy" derived from the speed curve.

It must not label this as kg-cm torque without a physical torque model and calibrated load.

## 9. Brake/stop test

Measure:
- stop command to 50%;
- stop command to 10%;
- stop command to near-zero;
- reverse movement or rebound;
- repeated-run variability.

For decks with adjustable brake:
- save setting label;
- compare across settings.

## 10. Drag/recovery test

### 10.1 Goal

Quantify platter recovery after a DJ applies drag.

### 10.2 Procedure

1. Stable reference playback.
2. App prompts user to lightly slow platter for 0.5-1 s.
3. User releases.
4. App detects release from frequency derivative.
5. Measure return.

Metrics:
- minimum speed deviation;
- recovery to 95%;
- recovery to 99%;
- overshoot;
- stabilization;
- run-to-run variation.

This is a performance proxy, not a direct torque measurement.

## 11. Channel balance

### 11.1 With mono test tone

For a mono tone cut equally into both channels:

balance_db = 20 log10(RMS_L / RMS_R)

Store signed result so direction is known.

### 11.2 Without test record

Ordinary music can only produce a weak estimate. DeckChek should aggregate:
- long-duration channel energy;
- mono-correlated segments;
- repeated passages if available.

Label this:
"program-dependent balance estimate."

### 11.3 Causes presented

A measured imbalance may result from:
- cartridge specification/tolerance;
- azimuth;
- headshell contact;
- lead wire;
- RCA cable;
- mixer input;
- interface channel gain;
- unequal groove content.

The reasoning engine shall not blame a cartridge before isolation.

## 12. Channel separation / crosstalk

### 12.1 Test requirement

Requires L-only and R-only reference tracks for calibrated crosstalk.

For L-only:
L_to_R_crosstalk_db = 20 log10(R_unwanted / L_wanted)

For R-only:
R_to_L_crosstalk_db = 20 log10(L_unwanted / R_wanted)

### 12.2 Outputs

- L→R;
- R→L;
- asymmetry;
- frequency;
- test record;
- comparison to cartridge published spec if known;
- trend over time.

### 12.3 Azimuth indicator

Unequal crosstalk and phase behavior can indicate azimuth error.

DeckChek reports:
- "azimuth-related asymmetry suspected";
not:
- "azimuth is X degrees"
unless a validated calibration model exists.

## 13. Relative phase and polarity

Tests:
- interchannel phase at known mono tone;
- broadband correlation;
- polarity inversion;
- L/R wiring anomaly.

Detect likely:
- one channel polarity reversed;
- headshell lead wiring mistake;
- capture channel inversion;
- severe azimuth/phase asymmetry.

## 14. Hum diagnosis

### 14.1 Detection

Detect configurable mains families:
- 50 Hz;
- 60 Hz;
- harmonics up to a defined band.

Metrics:
- fundamental level;
- each harmonic;
- total hum-family energy;
- hum-to-program ratio;
- channel asymmetry;
- time variation.

### 14.2 Evidence patterns

Both channels, stable mains family:
- grounding issue;
- ground loop;
- nearby electromagnetic source.

One channel significantly stronger:
- RCA/headshell/contact path;
- channel-specific preamp issue.

Motor-state dependent:
- turntable motor/power coupling;
- transformer proximity;
- grounding change.

### 14.3 Isolation wizard

Prompt sequence:
1. capture stylus lifted;
2. capture platter stopped;
3. capture platter running;
4. disconnect/reconnect ground if user chooses;
5. swap RCA channels;
6. swap mixer/input channel;
7. compare.

Each manipulation is tagged so the reasoning engine can see which fault follows which component.

## 15. Rumble / subsonic analysis

### 15.1 Metrics

- 2-10 Hz energy;
- 10-20 Hz;
- 20-50 Hz;
- 50-100 Hz;
- dominant subsonic peaks;
- channel coherence;
- modulation over revolution.

### 15.2 Possible causes

- bearing;
- warped record;
- off-center record;
- acoustic feedback;
- floor vibration;
- tonearm/cartridge resonance;
- handling;
- record pressing.

DeckChek should distinguish:
- mechanically coherent low-frequency oscillation;
- acoustic feedback rising with room SPL;
- record-specific warp that repeats once per revolution.

## 16. Tonearm/cartridge resonance estimate

When suitable excitation exists, estimate resonance from low-frequency spectral peak/coherence.

Output:
- estimated resonance frequency;
- Q/bandwidth;
- confidence;
- left/right agreement.

Do not infer cartridge compliance from this alone unless arm effective mass is known.

## 17. Tracking and mistracking detector

Detect:
- bursts of high-frequency distortion;
- asymmetric distortion;
- abrupt waveform roughness;
- loss of groove continuity;
- repeated mistracking on high-level test tracks.

When using documented tracking-ability tracks, store the highest successfully tracked level.

Potential causes:
- too-light tracking force;
- excessive tracking force;
- stylus wear/damage;
- contamination;
- incorrect anti-skate;
- poor alignment;
- damaged groove.

## 18. Anti-skate assessment

### 18.1 Primary method

Use test tracks designed for tracking/anti-skate assessment where available.

Observe:
- distortion onset L vs R;
- mistracking asymmetry;
- channel-specific high-frequency distortion.

### 18.2 Output

- neutral;
- likely too low;
- likely too high;
- inconclusive.

Audio-Technica documentation notes that incorrect anti-skate can produce channel-specific distortion; DeckChek uses such behavior as evidence, not sole proof.

## 19. Stylus/headshell/RCA intermittent fault detector

Track short dropouts and crackle events.

Features:
- event duration;
- affected channel;
- spectral shape;
- simultaneous phase jump;
- DC step;
- recovery shape.

Optional guided wiggle test:
- user gently manipulates headshell/RCA connector;
- event rate is correlated to manipulation period.

Never prompt unsafe manipulation while stylus is in a valuable record groove.

## 20. Frequency response

Requires a documented sweep or stepped-tone test record.

Pipeline:
- identify tone/sweep position;
- compensate nominal track response if documented;
- calculate L/R response;
- smooth using a defined method;
- compare channels;
- store raw bins.

Output:
- response curve;
- deviations;
- channel mismatch;
- high-frequency roll-off;
- resonance peaks.

System response includes cartridge + loading + phono preamp + interface. UI must state this.

## 21. Harmonic distortion

For known single-tone tracks:
- fundamental;
- H2;
- H3;
- H4/H5 optional;
- THD;
- channel-specific result.

Use to support:
- mistracking;
- overload;
- cartridge alignment problems;
- preamp clipping.

## 22. A/B deck matching

### 22.1 Goal

Assess whether two turntables behave similarly enough for DJ work.

Compare:
- speed error;
- wow;
- flutter;
- startup;
- brake;
- recovery;
- pitch mapping;
- channel balance;
- hum;
- rumble;
- DVS tracking if applicable.

### 22.2 Match score

Score is a weighted summary. Raw deltas remain primary.

Example output:
- speed match: 98;
- pitch map match: 91;
- mechanical stability match: 86;
- signal-chain match: 82;
- overall: 89.

User can alter weights by profile:
- club;
- scratch;
- vinyl-only;
- archival;
- service.

## 23. Maintenance baseline

For each physical asset instance:
- initial baseline;
- subsequent sessions;
- delta;
- trend slope;
- anomaly alert.

Examples:
- wow increased 35% over six months;
- right-channel level fell 1.2 dB;
- hum floor worsened 8 dB;
- startup time increased 0.2 s.

## 24. Manufacturer-spec comparison

Database may contain manufacturer published:
- wow/flutter;
- startup;
- torque;
- S/N;
- pitch ranges;
- cartridge output;
- channel separation;
- channel balance;
- tracking force.

Rules:
- preserve source URL/document and retrieval date;
- never silently treat different measurement standards as equivalent;
- show "manufacturer method" where known;
- actual DeckChek measurement method shown alongside.

## 25. User interface requirements

Each test screen shows:
- what to connect;
- what to play;
- live L/R meters;
- validity indicator;
- start/stop;
- live core metric;
- quality flags;
- expandable technical trace.

No test should require reading a manual merely to know which test-record track to play when that record exists in the DeckChek test-record database.

## 26. Acceptance criteria

A completed implementation must:
- detect disconnected channel;
- measure known frequency-derived speed accurately;
- create a time-resolved speed trace;
- calculate speed error;
- identify deterministic pitch-map nonlinearity from synthetic data;
- detect polarity inversion;
- calculate crosstalk from synthetic L-only/R-only captures;
- identify 50/60 Hz hum families;
- persist A/B comparisons;
- preserve method version on all measurements;
- refuse high-confidence azimuth/anti-skate conclusions without required evidence.
