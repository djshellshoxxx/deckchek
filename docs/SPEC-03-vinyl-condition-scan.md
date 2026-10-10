# SPEC-03: Full-Side Vinyl Condition Scan

## 1. Purpose

The Full-Side Vinyl Condition Scan is a core DeckChek feature. The user plays an entire record side once, from lead-in to runout, and DeckChek produces a time-aligned condition map showing likely wear, scratches, repeating defects, skips, groove damage, contamination, mistracking, excessive crackle, hum, rumble, speed anomalies, and other significant playback events.

This feature serves:
- vinyl-only DJs checking records before gigs;
- collectors evaluating condition;
- record shops or sellers documenting playback condition;
- archivists triaging discs;
- repair technicians separating media faults from playback-system faults;
- DVS DJs checking control-vinyl wear (implemented separately as the control-vinyl wear map, [FS-13](specs/13-control-vinyl-wear-map.md), which scores timecode quality per bin instead of music-vinyl events).

The feature is diagnostic. It does not silently repair audio.

## 2. Principle: detect evidence first

The scanner must never equate "click" with "scratch."

The pipeline records objective events first:
- impulsive transient;
- repeating impulsive transient;
- broadband burst;
- channel-specific burst;
- drop in HF energy;
- sustained distortion;
- repeated distortion once per revolution;
- groove skip;
- locked-groove repetition;
- speed discontinuity;
- low-frequency warp cycle;
- noise-floor rise;
- crackle-density rise;
- channel imbalance;
- stereo-correlation change.

A later classifier proposes likely explanations with confidence.

## 3. Supported source modes

### 3.1 Ordinary stereo vinyl
Normal music record through cartridge/phono chain.

### 3.2 Mono record
User indicates true mono source where known. This enables stronger channel-comparison diagnostics.

### 3.3 DVS/control vinyl
Uses SPEC-02 signals in addition to ordinary defect detectors.

### 3.4 Test record
Known content can improve classification because expected tone/content is known.

### 3.5 Reference-master assisted mode
Optional future/advanced mode:
- user supplies a legitimate digital reference of the same recording;
- DeckChek aligns vinyl capture to reference;
- deviations are treated as candidate media/playback defects.

This mode is optional and must not be required.

## 4. Scan workflow

### 4.1 Setup
User selects:
- record;
- side;
- speed;
- turntable asset;
- cartridge/stylus asset;
- mixer/phono stage;
- interface;
- venue/location;
- surface/support setup.

Optional metadata:
- pressing;
- catalog number;
- Discogs/release ID entered manually;
- record grade before test;
- cleaning state;
- stylus hours;
- tracking force;
- anti-skate;
- notes.

### 4.2 Preflight
DeckChek validates:
- stereo channels present;
- input not clipping;
- adequate level;
- capture device stable;
- sample rate;
- available disk space;
- optional noise baseline.

### 4.3 Start detection
User starts capture before lowering stylus.

DeckChek identifies:
- stylus contact;
- lead-in;
- music start if detectable.

### 4.4 Continuous recording
Analysis runs in two layers:
- streaming real-time detectors;
- deferred full-side post-pass.

### 4.5 End detection
Possible triggers:
- user presses End Side;
- runout/locked groove detected;
- silence threshold after expected side duration.

User confirms side end before finalization.

## 5. Storage strategy

A 20-30 minute 96 kHz stereo capture must not require full RAM retention.

Use:
- streaming PCM to temporary file;
- chunk index;
- real-time event DB writes;
- post-pass reads chunks from disk;
- optional delete raw capture after report.

Each event keeps enough derived features to remain useful without raw audio.

## 6. Analysis windows

Use multiple window scales:

Micro:
- 0.1-5 ms for impulses.

Short:
- 10-100 ms for transient morphology and dropouts.

Medium:
- 250 ms-2 s for crackle, distortion, local noise, spectral shifts.

Revolution:
- dynamically derived from platter speed, approximately 1.8 s at 33 1/3 RPM.

Long:
- 10-60 s for wear trends and side-wide changes.

## 7. Impulsive event detector

### 7.1 Goal
Detect clicks, pops, ticks, electrostatic discharges, and scratch-like impulses.

### 7.2 Candidate methods
Initial implementation should combine:
- high-pass residual;
- local median/MAD threshold;
- first-difference or prediction-error energy;
- optional autoregressive residual detector.

Research in audio restoration has long used prediction residuals and high-pass methods for click detection. DeckChek uses them only to detect candidate events.

### 7.3 Event features
For every impulse:
- timestamp;
- sample length;
- peak amplitude;
- RMS;
- crest factor;
- rise time;
- decay time;
- spectral centroid;
- HF energy ratio;
- L amplitude;
- R amplitude;
- interchannel timing offset;
- polarity pattern;
- surrounding program level;
- local spectral flux.

### 7.4 Severity
Severity is based on:
- amplitude relative to local program;
- duration;
- bandwidth;
- recurrence;
- perceptual prominence proxy.

## 8. Repeating scratch / groove-defect detector

### 8.1 Rationale
A physical scratch crossing adjacent grooves often creates an audible event once per revolution over multiple revolutions.

### 8.2 Algorithm
1. detect impulse candidates;
2. estimate current revolution duration from speed metadata or audio-derived speed where possible;
3. search event intervals near N × revolution period;
4. cluster morphology-similar events;
5. calculate recurrence confidence.

### 8.3 Strong scratch evidence
Confidence increases if:
- recurrence interval matches platter revolution;
- event waveform/spectrum is similar;
- event persists 3+ revolutions;
- left/right signature is consistent;
- defect repeats at same side position on a second scan.

### 8.4 Output
- start/end time;
- revolutions affected;
- mean recurrence interval;
- estimated radial region;
- severity;
- confidence;
- representative waveform thumbnails;
- status: tentative/repeated/confirmed.

## 9. Single scratch / isolated damage

A scratch may not repeat long enough to satisfy recurrence logic.

DeckChek can report:
"probable isolated surface defect"
when:
- strong impulse morphology;
- event greatly exceeds local transient statistics;
- event does not resemble surrounding music;
- optional second play confirms same location.

It must not overstate certainty.

## 10. Crackle density

Measure:
- micro-impulses per second;
- micro-impulse amplitude distribution;
- broadband residual energy;
- left/right distribution.

Create a crackle-density timeline.

Interpretation candidates:
- dust/debris;
- static;
- groove wear;
- dirty stylus;
- pressing noise;
- surface damage.

Repeat scan after cleaning can distinguish contamination from persistent damage.

## 11. Surface-noise floor

Estimate local noise during:
- lead-in;
- inter-track gaps;
- quiet passages identified probabilistically;
- runout.

Metrics:
- broadband noise;
- low-band;
- mid-band;
- high-band/hiss;
- impulsive density.

Do not measure "record noise" from loud music sections without confidence labeling.

## 12. Groove wear indicator

Groove wear is not one simple measurable quantity.

DeckChek builds a wear hypothesis from:
- increased HF distortion;
- elevated noise/crackle;
- loss of high-frequency detail relative to earlier portions or reference;
- channel asymmetry;
- increased sibilant roughness;
- repeated mistracking-like bursts;
- degradation confirmed on repeated play;
- normal results with another record.

Output:
- NONE/LOW/MODERATE/HIGH evidence;
- confidence;
- contributing metrics.

## 13. Inner-groove degradation

The inner part of a side can naturally be more difficult to track.

DeckChek tracks radial progression and compares:
- distortion;
- HF residual;
- channel separation proxy;
- crackle;
- sibilance;
- mistracking events.

It can report:
"inner-groove performance degrades substantially compared with outer/mid side."

Possible causes:
- cartridge alignment;
- stylus profile;
- groove wear;
- pressing/cut;
- excessive level.

It must not assume record damage.

## 14. Skip detector

### 14.1 Forward skip
Possible evidence:
- sudden discontinuity;
- pattern/content jumps ahead;
- revolution phase shifts;
- DVS position jump if control media;
- optional fingerprint discontinuity.

### 14.2 Backward skip
Possible evidence:
- repeated content section;
- decoded DVS position moves unexpectedly;
- waveform/fingerprint repeats.

### 14.3 Confidence
Highest when:
- reference/master alignment exists;
- DVS absolute position exists;
- repeated audio fingerprint is detected.

Ordinary unknown music should be labeled probable rather than definitive.

## 15. Locked-groove / repeating loop detector

Detect highly similar audio frames repeating at revolution-period intervals.

Differentiate:
- intentional locked groove;
- musical loop;
- stylus stuck in damaged groove.

Signals:
- no radial progression indicator if available;
- identical audio every revolution;
- repeated event beyond normal track context;
- user can mark intentional locked grooves as expected.

## 16. Warp detector

Warp evidence:
- subsonic oscillation near revolution rate;
- vertical/lateral cartridge motion inferred from low-frequency channel relationships;
- repeated low-frequency amplitude modulation;
- speed perturbation correlated with revolution.

Output:
- warp-cycle amplitude proxy;
- dominant period;
- channel coherence;
- severity;
- confidence.

## 17. Off-center pressing/hole indicator

A record pressed or centered off-axis can produce periodic pitch modulation at once per revolution.

Detect:
- frequency modulation at revolution rate;
- persists across tracks/side;
- low evidence of motor instability from reference/baseline.

Because the turntable itself can also create cyclic variation, DeckChek recommends testing another disc.

## 18. Non-fill / stitching-like defect indicator

Possible audio evidence:
- sustained tearing/buzzing texture;
- often one channel or groove wall dominant;
- high-frequency noise burst longer than ordinary click;
- may recur in a localized area.

Label:
"possible pressing/surface defect (non-fill-like)"
unless confirmed visually or by expert/user.

## 19. Static discharge indicator

Likely features:
- extremely short broadband spike;
- non-repeating;
- may appear strongly in both channels;
- no local recurrence;
- may be more common at start/end or dry conditions.

Never call static with high confidence from a single event alone.

## 20. Dust/debris hypothesis

Evidence:
- crackle/click cluster;
- possibly transient mistracking;
- event disappears after cleaning/replay;
- location not stable across repeated scans.

DeckChek should provide a "Re-scan after clean" workflow.

## 21. Stylus contamination hypothesis

Evidence:
- deterioration grows during side;
- both channels affected;
- HF roughness/noise increases;
- multiple records affected similarly;
- condition changes after stylus cleaning.

## 22. Channel-specific groove-wall damage

Because stereo groove walls encode different channel components, damage may affect channels differently.

Measure:
- event-rate L vs R;
- distortion L vs R;
- HF noise L vs R;
- click asymmetry.

Report:
"damage/noise is significantly biased to one groove wall/channel."

Alternative causes:
- cartridge/azimuth/cabling.

## 23. Sibilance / high-frequency mistracking detector

Use:
- sustained high-frequency energy;
- nonlinear residual;
- interchannel asymmetry;
- clipping exclusion;
- optional speech/sibilant detector.

Report as:
"possible sibilance/mistracking event"
with timestamps.

Do not classify artistic distortion as damage without corroboration.

## 24. Hum and electrical contamination timeline

Track 50/60 Hz family across entire side.

Useful for detecting:
- intermittent ground connection;
- cable movement;
- venue electrical interference;
- one-channel grounding/contact issue.

## 25. Rumble and acoustic feedback timeline

Track subsonic and low-frequency energy.

Detect:
- gradual feedback build-up;
- isolated footfall/vibration events;
- speaker-induced resonance;
- handling bumps.

If venue sensors exist, correlate them.

## 26. Footfall / shock event detector

Large low-frequency, short-duration events can be tagged:
- probable handling/impact;
- probable footfall;
- unknown mechanical shock.

These are not record defects and should be excluded from record condition scoring when confidence is high.

## 27. Side condition map

Primary visualization:
- x-axis: elapsed side time;
- optional radial ring visualization;
- stacked lanes.

Lanes:
1. condition score;
2. clicks/pops;
3. repeating defects;
4. crackle;
5. distortion/mistracking;
6. skips/repeats;
7. low-frequency mechanical events;
8. hum/electrical;
9. DVS quality when applicable.

Selecting a marker opens:
- timestamp;
- type;
- severity;
- confidence;
- channels;
- recurrence;
- evidence metrics;
- likely causes;
- optional 1-3 second local audition if raw audio retained.

## 28. Radial mapping

If exact groove radius is unknown, DeckChek uses normalized side position.

Optional estimate:
- outer radius;
- inner radius;
- elapsed time;
- assumed approximately monotonic radial travel.

Display must label this as estimated.

For DVS media with absolute position mapping, use stronger mapping.

## 29. Track boundary detection

Methods:
- silence/inter-track gap;
- user markers;
- optional metadata/reference alignment.

Confidence score per boundary.

User can correct boundaries after scan.

Condition results aggregate per track:
- clean;
- minor;
- moderate;
- severe;
- needs review.

## 30. Repeat-play confirmation

Second scan is extremely important.

Align scans using:
- audio fingerprint;
- side timing;
- DVS absolute position;
- user markers.

For each event:
- same location + same morphology = confidence increase;
- absent after cleaning = contamination hypothesis increase;
- shifts with time but not groove location = hardware/environment hypothesis;
- appears on many records = playback-chain hypothesis.

## 31. Compare before/after cleaning

Special workflow:
1. scan;
2. mark cleaning method;
3. rescan;
4. align;
5. show removed/persistent/new events.

Outputs:
- click-rate reduction;
- crackle reduction;
- noise reduction;
- persistent-defect list.

This can help determine whether a record is dirty or physically damaged.

## 32. Record health score

Score is secondary to evidence.

Suggested components:
- severe repeated defects;
- skips/sticks;
- persistent crackle;
- persistent wear evidence;
- distortion;
- noise;
- channel issues.

Never penalize:
- intentional audio transients;
- venue vibration confidently classified external;
- electrical hum confidently traced outside the record.

Profiles:
- DJ playback;
- critical listening;
- archival transfer.

## 33. Vinyl-only DJ readiness score

A separate practical score answers:
"Would I trust this record during a live vinyl-only set?"

Weighted heavily toward:
- skips;
- repeating scratches;
- tracking instability;
- severe warp;
- cue-region damage;
- high crackle during intros/outros;
- low-frequency feedback susceptibility.

Track-level notes:
- safe for set;
- avoid intro;
- avoid first 30 s;
- risky cue point;
- risky inner groove;
- do not use live until inspected.

## 34. Marker export

Export:
- JSON;
- CSV;
- HTML report;
- optional cue sheet.

Fields:
- side;
- time;
- normalized position;
- track;
- event type;
- severity;
- confidence;
- note.

## 35. False-positive management

User can mark events:
- confirmed defect;
- music/transient;
- dust;
- static;
- handling;
- unknown.

These labels are stored locally for future threshold tuning.

## 36. Acceptance criteria

The scanner is implemented when:
- a full 30-minute side can be captured without excessive RAM growth;
- injected impulse events are timestamped accurately;
- a synthetic once-per-revolution event is grouped as repeating;
- a non-repeating music transient is not automatically called a scratch;
- crackle density is calculated over time;
- repeated scans can align and confirm persistent events;
- a deliberate audio loop can be surfaced as a repeat candidate;
- low-frequency shock events are separated from record-surface impulses;
- condition map remains usable after raw audio is deleted;
- report exposes evidence and confidence for every classified defect.

## 37. Scientific detector and alignment validation

Apply [SPEC-19 sections 6–9](SPEC-19-scientific-measurement-and-validation.md): store impulse evidence, perceived prominence and causal hypotheses separately. Neither audible clicks nor high-frequency degradation alone establish physical groove wear. Real-record evaluation must include percussive DJ genres, held-out recording-level splits, annotator uncertainty and false positives per unit time.

Apply [SPEC-18 section 7](SPEC-18-open-source-reuse-and-validation.md) to repeat-scan alignment. Offset-only alignment is insufficient under drift or skips. Retain original timestamps, piecewise mappings, unmatched spans and alignment uncertainty. Normalized side time remains primary; inferred radial geometry is not measured radius.
