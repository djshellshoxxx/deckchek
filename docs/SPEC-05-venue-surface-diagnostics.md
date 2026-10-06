# SPEC-05: Venue, Surface, Vibration, and Feedback Diagnostics

## 1. Purpose

This specification defines DeckChek's venue and support-surface diagnostic system, with special emphasis on vinyl-only DJs.

A turntable that behaves perfectly at home can fail in a club because of:
- floor movement;
- stage bounce;
- subwoofer coupling;
- booth resonance;
- table flex;
- poor isolation;
- electrical hum;
- unstable power;
- people leaning on the booth;
- monitor placement;
- excessive acoustic feedback.

DeckChek must make those environmental factors measurable and comparable.

## 2. Goals

DeckChek should answer:
- Is this surface stable enough for vinyl?
- Is the problem the deck or the booth?
- At what playback level does feedback begin?
- Which frequencies excite the turntable/support system?
- Does adding isolation improve measurable stability?
- Which deck position is best?
- Which venue has historically been reliable for vinyl-only sets?
- Does a certain cartridge track better at this venue?
- Does the right deck behave worse because it is closer to a sub/monitor?
- Are footfalls or crowd motion producing stylus instability?

## 3. Venue hierarchy

```text
Venue
  └── Booth / Performance Area
        └── Deck Position
              └── Support Configuration
                    └── Session
```

Example:
- Venue: Club X
- Booth: Main booth
- Position: Left deck
- Support: booth shelf + concrete paver + isolation feet
- Session: 2026-10-05 soundcheck

This prevents one measurement from being generalized to the whole venue.

## 4. Venue metadata

Fields:
- name;
- venue type;
- city/region optional;
- indoor/outdoor;
- permanent/temporary booth;
- typical event type;
- notes.

Optional:
- normal SPL range;
- crowd size range;
- floor construction notes;
- subwoofer count/placement notes;
- monitor placement;
- known electrical issues.

No precise geolocation is required.

## 5. Deck-position metadata

Each position stores:
- left/right/center/custom label;
- deck orientation;
- approximate distance to monitor;
- approximate distance to nearest sub;
- height;
- edge/center of support;
- nearby mechanical sources;
- cable routing notes.

## 6. Support configuration

### 6.1 Components

A support chain can be modeled as layers:

```text
Turntable
  ↓
Turntable feet
  ↓
Isolation pad/platform
  ↓
Paver/slab/case
  ↓
Booth/table/shelf
  ↓
Stage/floor/building
```

Each layer:
- material;
- dimensions;
- mass if known;
- compliant/rigid;
- attachment;
- user notes.

### 6.2 Comparison

Support configurations are reusable entities so the same isolation system can be compared at multiple venues.

## 7. Quiet-room baseline

Before sound system playback:
- stylus in groove or test medium according to selected procedure;
- capture 30-60 s.

Measure:
- low-frequency energy;
- hum;
- impulse/shock events;
- DVS integrity;
- speed stability;
- rumble.

This becomes environment baseline.

## 8. Acoustic-feedback test

### 8.1 Goal

Determine when loudspeaker output begins to measurably contaminate the vinyl playback loop.

### 8.2 Safe guided procedure

DeckChek does not control the venue PA by default.

User:
1. starts approved test record or control signal;
2. begins at normal low level;
3. increases booth/master level in controlled steps;
4. presses "Mark Level" or enters SPL reading if available;
5. DeckChek measures each plateau.

### 8.3 Measurements

At each level:
- subsonic energy;
- low-frequency peaks;
- interchannel coherence;
- DVS integrity;
- stylus instability events;
- click/mistracking events;
- speed modulation;
- feedback growth rate.

If an SPL meter is available:
- dBA;
- dBC;
- optional dBZ;
- meter source/model.

If no SPL meter:
- level step is stored as ordinal: LOW/MEDIUM/HIGH or mixer-mark position.

### 8.4 Feedback onset

Definition:
first level where a monitored low-frequency resonance grows significantly beyond the quiet baseline and persists or increases with PA level.

Store:
- onset level;
- dominant frequency;
- growth slope;
- confidence.

Do not claim an absolute SPL threshold without calibrated SPL input.

## 9. Resonance sweep

If venue PA can play a test sweep or stepped tones:
- measure transfer into cartridge/stylus signal.

Recommended low-frequency sweep:
- 20-200 Hz;
- conservative level;
- user-controlled.

Output:
- resonance frequencies;
- relative amplification;
- deck A vs deck B;
- support A vs B.

This can reveal booth, table, tonearm, or acoustic resonances.

## 10. Music-based feedback observation

When test tones are not practical:
- record during normal soundcheck music;
- track low-frequency coherence;
- flag repeated buildup;
- compare quiet baseline.

Confidence is lower because source spectrum is unknown.

## 11. Footfall/shock test

### 11.1 Procedure

Optional controlled test:
1. record stable groove/control signal;
2. user walks near booth normally;
3. repeat at selected locations if practical;
4. do not intentionally strike the booth.

### 11.2 Measurements

- low-frequency impulse count;
- peak shock level;
- shock decay;
- DVS dropout;
- mistracking;
- needle skip;
- recovery time.

### 11.3 Result

Example:
- "3 of 10 nearby footfalls produced measurable stylus disturbance."
- "0 caused tracking loss."
- "right deck 2.8x more sensitive than left."

## 12. Touch/lean sensitivity

For booths where patrons or DJs may touch the support:
- user may gently place normal hand pressure on a safe part of the booth;
- DeckChek records mechanical disturbance.

Do not prompt impacts or actions that could damage equipment.

## 13. Surface vibration proxy from audio

Even without accelerometers, cartridge output carries mechanical vibration.

Metrics:
- subsonic RMS;
- low-frequency spectral peaks;
- common-mode L/R energy;
- event rate;
- correlation with PA level.

This is a proxy, not calibrated acceleration.

## 14. Optional external vibration sensor

Future sensor input:
- USB accelerometer;
- phone companion;
- audio-interface accelerometer pickup;
- contact microphone.

Required metadata:
- sensor model;
- axis;
- sample rate;
- mounting method;
- calibration.

Then DeckChek can calculate:
- acceleration RMS;
- peak;
- spectral density;
- transfer function relative to audio channel.

## 15. Monitor/sub placement comparison

A venue test can compare positions:
- monitor off/on;
- booth monitor angle A/B;
- sub configuration A/B;
- deck moved left/right where possible.

Store each change as a configuration delta.

DeckChek displays:
- feedback onset change;
- dominant resonance change;
- DVS integrity delta;
- low-frequency RMS delta.

## 16. Isolation A/B test

Workflow:
1. baseline without isolation;
2. add pad/platform/paver;
3. repeat exact test;
4. compare.

Metrics:
- low-frequency reduction dB;
- shock reduction;
- feedback onset improvement;
- DVS dropout reduction;
- mistracking reduction.

Result must preserve whether PA level/test procedure was comparable.

## 17. Vinyl-only venue profile

Special summary fields:
- clean grounding/electrical;
- low vibration;
- high feedback margin;
- low footfall sensitivity;
- rigid booth;
- usable cueing areas;
- proven set history;
- known problem frequencies.

Vinyl-only suitability score components:
- 30% acoustic feedback margin;
- 25% mechanical shock/footfall stability;
- 15% electrical cleanliness;
- 15% actual skip/mistracking history;
- 10% deck-to-deck consistency;
- 5% setup repeatability.

Weights are configurable and versioned.

## 18. Venue condition categories

- EXCELLENT: no material issue in tested operating range.
- GOOD: minor measurable issues, no practical tracking failures.
- CONDITIONAL: workable with isolation/level/position constraints.
- DIFFICULT: recurring instability in expected operating conditions.
- UNSUITABLE: repeated tracking/feedback failure under required conditions.
- UNKNOWN: insufficient comparable evidence.

This classification is always tied to:
- a booth;
- deck position;
- setup;
- date;
- test level.

## 19. Gig/session log

For vinyl-only DJs, a real-world session can be logged:
- start/end;
- setup;
- approximate SPL;
- crowd/foot traffic;
- records played count optional;
- skips;
- feedback incidents;
- stylus cleanings;
- hum incidents;
- deck issues;
- notes.

This complements lab-style tests.

## 20. Incident capture

During a session, user can press:
- Skip
- Feedback
- Hum
- Needle jump
- Dropout
- Booth shock
- Other

DeckChek timestamps the incident and can retain surrounding diagnostic metrics.

## 21. Venue trend

Track venue over time:
- booth changed;
- subs moved;
- new isolation;
- new mixer;
- flooring changed;
- stage rebuilt.

Trend chart avoids attributing old results to new configurations.

## 22. Surface material comparisons

Database can aggregate user measurements by:
- concrete;
- wood;
- folding table;
- flight case;
- wall shelf;
- booth furniture;
- stage riser;
- custom platform.

Results must remain context-sensitive. DeckChek should never claim "material X is best" without sample count and configuration.

## 23. Electrical environment

Capture:
- 50/60 Hz hum;
- harmonics;
- broadband RF-like noise proxy;
- channel asymmetry;
- motor on/off change;
- lighting/dimmer state notes.

User may annotate:
- dimmer on/off;
- neon/signage on/off;
- laptop charger connected;
- ground lift state only as existing setup metadata.

DeckChek should compare states without prescribing unsafe electrical modifications.

## 24. Venue report

Report sections:
- venue/booth/position;
- support chain;
- hardware chain;
- quiet baseline;
- feedback test;
- dominant resonances;
- footfall/shock test;
- electrical noise;
- A/B isolation comparison;
- DVS quality if applicable;
- vinyl-only suitability;
- recommended operational constraints.

Examples:
- "Left deck remains stable through tested level 5; right deck begins 43 Hz buildup at level 4."
- "Isolation platform reduces 38-52 Hz cartridge-coupled energy by 7.1 dB."
- "Avoid placing right deck directly on booth edge."

## 25. Acceptance criteria

Implemented when:
- venue/booth/position/support hierarchy persists;
- quiet baseline can be captured;
- low-frequency feedback growth can be compared across user-marked level steps;
- isolation A/B test computes deltas;
- shock events can be timestamped;
- venue score references exact setup/test session;
- reports never imply calibrated SPL unless an SPL source is supplied;
- two venues can be compared under compatible measurement methods.

## Scientific calibration and transfer-test requirements

Apply [SPEC-19 sections 9–10](SPEC-19-scientific-measurement-and-validation.md). Record sensor mounting, axis, calibration, bandwidth and synchronization. Audio dBFS remains a vibration proxy and does not become acceleration or SPL without calibration. Controlled A/B setup changes support attribution; correlation alone does not identify cause.

Swept-sine transfer testing is a later calibrated feature with reference, latency and stationarity validation. It is not a prerequisite for the beta's passive/guided venue workflow.
