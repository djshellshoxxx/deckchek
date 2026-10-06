# SPEC-06: Scoring, Diagnostic Reasoning, Confidence, and Reports

## 1. Purpose

DeckChek must turn measurements into useful conclusions without hiding the evidence or overstating certainty.

This specification defines:
- evidence records;
- diagnostic hypotheses;
- confidence;
- severity;
- scores;
- comparison scoring;
- recommendations;
- isolation tests;
- report generation.

## 2. Three information layers

Every UI/report separates:

### Layer 1: Measurement
Direct or derived numeric evidence.

Example:
"Right channel RMS is 1.8 dB below left."

### Layer 2: Interpretation
Meaning of evidence.

Example:
"Channel imbalance is larger than this setup's baseline."

### Layer 3: Hypothesis
Possible cause.

Example:
"Possible cartridge/azimuth/contact issue."

DeckChek must never render Layer 3 as though it were Layer 1.

## 3. Evidence record

Fields:
- evidence_id;
- session_id;
- type;
- metrics[];
- channel;
- start/end;
- severity;
- quality flags;
- detector ID/version;
- source capture;
- reproducibility metadata.

Examples:
- HUM_FAMILY_DETECTED;
- CHANNEL_LEVEL_MISMATCH;
- REPEATING_IMPULSE_CLUSTER;
- DVS_DECODE_DROPOUT;
- SPEED_PERIODIC_MODULATION;
- LOW_FREQUENCY_FEEDBACK_GROWTH.

## 4. Hypothesis record

Fields:
- hypothesis_id;
- hypothesis_key;
- label;
- confidence 0-1;
- severity;
- supporting evidence IDs;
- contradictory evidence IDs;
- alternatives[];
- isolation tests[];
- explanation template;
- status.

Status:
- POSSIBLE;
- LIKELY;
- HIGH_CONFIDENCE;
- CONFIRMED_BY_USER;
- DISPROVED;
- RESOLVED.

## 5. Confidence model

Initial release uses explicit weighted evidence rules.

Example:

```text
HYPOTHESIS: CONTROL_VINYL_LOCAL_WEAR

+0.30 same position degraded on repeat scan
+0.20 DVS decode quality locally drops
+0.15 broadband noise locally rises
+0.15 alternate control record tests clean
+0.10 both mixer channels behave normally
+0.10 defect persists after cleaning

-0.25 issue follows cartridge to another record
-0.25 issue follows mixer channel
-0.20 defect position changes on replay
```

Cap to 0-1.

Threshold labels:
- <0.35 weak;
- 0.35-0.59 possible;
- 0.60-0.79 likely;
- >=0.80 high confidence.

These thresholds are method-versioned.

## 6. Severity

Severity describes operational impact, not diagnostic confidence.

Levels:
- INFO;
- MINOR;
- MODERATE;
- MAJOR;
- CRITICAL.

Examples:
- high-confidence cosmetic click = MINOR;
- medium-confidence repeated skip = CRITICAL for live DJ;
- high-confidence 0.3 dB channel mismatch = MINOR.

## 7. Context profiles

Severity/score weights depend on intended use.

Profiles:
- VINYL_ONLY_LIVE;
- DVS_MIXING;
- SCRATCH_BATTLE;
- HOME_LISTENING;
- ARCHIVAL_TRANSFER;
- SERVICE_BENCH;
- USED_PURCHASE_CHECK.

Example:
A small speed offset may matter more for long vinyl blends than home listening.
A cue-region DVS defect matters more for scratch work than archival transfer.

## 8. Score philosophy

Scores summarize; they do not replace metrics.

Each score must provide:
- component list;
- weight;
- raw metric;
- normalization;
- quality/confidence.

If a component cannot be measured, weight is redistributed only if the score definition allows it. Otherwise score is marked incomplete.

## 9. Turntable Health Score

Suggested components:
- speed accuracy 20%;
- wow/flutter 20%;
- pitch behavior 15%;
- startup/recovery 10%;
- rumble 10%;
- channel/signal stability 10%;
- hum 5%;
- maintenance trend 10%.

Version as:
TURN_TABLE_HEALTH_V1.

## 10. Cartridge Health Score

Components:
- channel balance;
- separation;
- distortion;
- tracking;
- intermittent events;
- output stability;
- baseline degradation.

Do not compare raw cartridge output unless input gain/calibration is compatible.

## 11. DVS Health Score

Components:
- signal integrity;
- decode/readability;
- dropout;
- scratch continuity;
- noise;
- channel geometry;
- position continuity;
- cue-region condition.

## 12. Vinyl Condition Score

Components:
- confirmed scratches;
- skip/stick risk;
- crackle/noise;
- groove-wear evidence;
- distortion;
- persistent defects;
- warp/off-center behavior.

External environment evidence is excluded where confidently identified.

## 13. Vinyl Live Readiness

This score is operational.

Heaviest penalties:
- skips;
- locked groove;
- repeated scratch through cue/intro/outro;
- severe warp;
- mistracking;
- cue-region defects.

Less penalty:
- minor cosmetic crackle during loud passage.

Output:
- READY;
- READY_WITH_NOTES;
- RISKY;
- NOT_RECOMMENDED;
- INCOMPLETE_TEST.

## 14. Venue Vinyl Suitability Score

Defined in SPEC-05 and calculated here.

Includes:
- feedback margin;
- shock sensitivity;
- actual incident history;
- electrical cleanliness;
- setup consistency.

## 15. Match Score

For Deck A vs B, compare normalized deltas.

A match score answers:
"How similar are they?"
not:
"How good are they?"

Two equally bad decks can match well.

Therefore report both:
- health score;
- match score.

## 16. Baseline Delta Score

Compare current physical asset to its own historical baseline.

Use robust normalization:
- percentage change;
- z-score where enough history;
- absolute engineering threshold.

Flag:
- IMPROVED;
- STABLE;
- DEGRADING;
- SIGNIFICANT_CHANGE.

## 17. Diagnostic rule engine

Rules stored as data where practical.

Example structure:

```json
{
  "key": "ONE_CHANNEL_CONTACT_FAULT",
  "requires": ["CHANNEL_DROPOUT"],
  "supports": [
    {"evidence":"DROPOUT_SINGLE_CHANNEL","weight":0.35},
    {"evidence":"WIGGLE_CORRELATED_EVENT","weight":0.35},
    {"evidence":"FAULT_FOLLOWS_HEADSHELL","weight":0.30}
  ],
  "contradicts": [
    {"evidence":"FAULT_FOLLOWS_MIXER_INPUT","weight":0.40}
  ]
}
```

Rule sets are versioned and testable.

## 18. Isolation-test planner

When multiple causes fit, DeckChek proposes the test that best separates them.

Example:
Hypotheses:
- cartridge/headshell;
- RCA cable;
- mixer input.

Best next test:
"Swap left/right mixer inputs without changing the headshell."

Expected inference:
- fault changes mixer channel → upstream;
- fault remains mixer channel → mixer path.

The planner stores the user's action and next capture as linked sessions.

## 19. Swap-test graph

Represent components as path:

```text
Record
→ Stylus
→ Cartridge
→ Headshell contacts
→ Tonearm wiring
→ RCA
→ Mixer phono preamp
→ Mixer USB/line output
→ Audio interface
→ DeckChek
```

A swap test moves one boundary at a time.

DeckChek tracks which component the fault follows.

## 20. Explainability UI

Every diagnosis panel shows:

```text
Likely RCA/headshell path issue — 78%

Why:
+ Right channel dropped 22 dB three times
+ Left channel remained stable
+ Motor speed remained stable
+ Fault followed turntable when mixer channels were swapped

Against:
- No event reproduced during connector wiggle test

Next best test:
Swap headshells between decks.
```

## 21. Recommendation classes

Recommendations must be categorized:
- CLEAN/INSPECT;
- RETEST;
- SWAP_COMPONENT;
- ALIGN;
- CALIBRATE;
- SERVICE;
- REPLACE_CONSUMABLE;
- VENUE_MITIGATION;
- INFORMATIONAL.

Recommendations are not automatically destructive actions.

## 22. Report types

### 22.1 Quick report
One page/screen:
- overall status;
- major findings;
- key metrics;
- next steps.

### 22.2 Technical report
Includes:
- all tests;
- methods;
- plots;
- confidence;
- raw metric tables.

### 22.3 Used-equipment report
Optimized for evaluating a turntable before purchase:
- speed;
- pitch;
- start/brake;
- noise;
- channel;
- DVS;
- observed faults.

### 22.4 Vinyl condition report
- side map;
- track-by-track condition;
- confirmed/tentative defects;
- live readiness.

### 22.5 Venue report
- feedback;
- shock;
- electrical;
- setup;
- constraints.

### 22.6 Maintenance report
- baseline;
- trend;
- changes;
- service events.

## 23. Report evidence retention

A report references:
- session ID;
- method versions;
- metric IDs;
- database product/asset IDs;
- source/provenance.

Static exports should include enough text to remain interpretable outside DeckChek.

## 24. Report plots

Standard:
- speed trace;
- wow/flutter modulation;
- pitch map;
- L/R levels;
- hum spectrum;
- rumble spectrum;
- DVS scope;
- DVS quality timeline;
- vinyl condition timeline;
- venue low-frequency growth plot;
- historical trend.

Plots must label units and analysis method.

## 25. Comparison reports

Comparison table rules:
- manufacturer published values in one section;
- DeckChek measured values in another;
- incompatible methods show "not directly comparable."

## 26. Confidence language

UI language:
- "Measured"
- "Detected"
- "Possible"
- "Likely"
- "High-confidence indication"
- "Confirmed by repeat test"

Avoid:
- "definitely broken"
unless user/test directly confirms.

## 27. Missing-data handling

Never substitute zero for missing measurement.

States:
- NOT_TESTED;
- NOT_SUPPORTED;
- INVALID;
- INCONCLUSIVE;
- MEASURED.

Scores show coverage:
"Health score 84/100, 72% test coverage."

## 28. Acceptance criteria

Implemented when:
- evidence and hypothesis are stored separately;
- a diagnosis cites supporting evidence IDs;
- severity and confidence can differ;
- swap-test workflow can update confidence;
- scores show components and coverage;
- incompatible methods are blocked from direct comparison;
- every exported conclusion is traceable to stored measurements.
