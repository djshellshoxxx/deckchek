# SPEC-11: Product Editions and Diagnostic Category Scope

Status: proposed product specification for review; categories and tests are planned unless explicitly marked as already available.
Date: 2026-10-06
Related: SPEC-00 through SPEC-10, especially SPEC-01 turntables, SPEC-02 DVS, SPEC-03 vinyl condition, SPEC-04 database, SPEC-05 venue diagnostics, SPEC-06 reports, SPEC-09 roadmap.

## 1. Purpose

Define DeckChek's product editions, the hardware each category covers, the tests each edition is expected to support over time, and how overlapping or hybrid equipment is handled.

DeckChek is a local-first diagnostic workstation for DJ playback equipment and signal paths. It measures behavior, keeps evidence and test conditions, compares compatible sessions, and produces reports. It does not replace a DJ application or a dedicated hardware service instrument.

This is a scope specification. It does not claim that the listed tests are already implemented. The existing DeckChek repository is in the specification phase. The free MIDI Tester exists separately as a browser-based application; its current capabilities are listed in Section 4.

## 2. Product lineup

| Product | Price position | Unlocks |
|---|---|---|
| **MIDI Tester — Free** | Free | MIDI-specific monitoring and controller checks described in Section 4. |
| **DeckChek Vinyl** | Focused paid edition | Vinyl turntable, cartridge, record, vinyl DVS, and vinyl-oriented venue diagnostics. |
| **DeckChek CDJ / Media Player** | Focused paid edition, priced in the same general band as Vinyl and Controller | CDJ, optical-disc, USB/SD media-player, CD/file DVS, transport, pitch, and output diagnostics. |
| **DeckChek Controller** | Focused paid edition, priced in the same general band as Vinyl and CDJ / Media Player | DJ controller, all-in-one, motorized control surface, fader, jog, pad, control-message, and supported audio-path diagnostics. |
| **DeckChek Ultimate** | Higher-priced bundle | All three paid DeckChek editions: Vinyl, CDJ / Media Player, and Controller. Includes the Controller edition's MIDI diagnostics. |

MIDI Tester remains free and usable on its own. Its MIDI measurement functions can be shared with or extended by DeckChek Controller, but the free app is not a reduced trial of the paid physical, audio, or transport diagnostics.

"Edition" means a licensed capability set in one application, not a separate codebase or a separate hardware catalogue. The same session, asset, reporting, and comparison foundations should serve all editions.

## 3. Category and device classification

### 3.1 Classify capabilities, not only product marketing names

A device can have more than one capability profile. DeckChek should identify and store supported capabilities such as:

- analog vinyl playback;
- optical CD playback;
- USB/SD file playback;
- DVS control-signal output;
- MIDI control surface;
- HID or vendor control surface;
- motorized control platter;
- integrated audio interface;
- standalone/all-in-one operation;
- external mixer or audio I/O.

A hardware record may therefore be visible in more than one edition. A test is enabled only when that test's required capability and measurement path are present.

### 3.2 Default category assignment

| Device | Primary edition | Additional capability coverage |
|---|---|---|
| Conventional turntable and cartridge | Vinyl | DVS tests if used with timecode. |
| Hybrid analog/DVS turntable | Vinyl | Controller diagnostics for its control surface where applicable. |
| CDJ or USB/SD media player | CDJ / Media Player | Controller diagnostics only for supported control-surface functions. |
| Laptop DJ controller | Controller | CDJ/media-player tests only for any genuine onboard playback capability. |
| Motorized DJ controller | Controller | Motorized platter and controller I/O tests. |
| Motorized DVS control deck such as RANE TWELVE | Controller | DVS-output tests when connected through a supported interface; not treated as an analog record-playing turntable. |
| Standalone/all-in-one DJ system | Controller | CDJ/media-player tests for onboard media transport if supported. |
| Mixer without a controller surface | Not a controller by default | Signal-path diagnostics may be available through another edition or a future mixer module. |

Examples clarify the boundary: a PLX-CRSS12 belongs primarily to Vinyl because it plays analog records and supports tone-arm-free DVS. A RANE TWELVE belongs primarily to Controller because its motorized platter is a digital control surface and it depends on a supported mixer/controller for DVS use. A RANE PERFORMER is a motorized DJ controller and belongs to Controller. These are capability examples, not exhaustive compatibility declarations.

### 3.3 Edition access for overlapping devices

An edition provides the test modules in its scope. A user can record a multi-capability device in the local inventory even if they own only one edition. Tests outside the licensed edition remain visibly unavailable, and reports may show the hardware profile and which category module is needed.

Ultimate unlocks all covered test modules for multi-category devices. DeckChek must never label a device universally "healthy" when only one of its capability paths was tested.

## 4. MIDI Tester — Free category

### 4.1 Product boundary

MIDI Tester is the free, standalone entry product for inspecting MIDI input/output and basic controller behavior. The current application is browser-based and uses Web MIDI where supported. The current README states that event/device data remains in the browser and that no account or remote diagnostic service is used.

The current listed capabilities are:

- live decoded and raw MIDI monitor;
- MIDI input and output device selection;
- message counts and messages-per-second;
- MIDI channel activity;
- automatic Control Change (CC) inventory;
- CC range, distinct-value, jitter, jump, and direction-change measurements;
- basic relative/absolute encoder behavior hints;
- held-note/keybed display;
- pitch-bend range and near-center measurements;
- incoming MIDI-clock BPM measurement;
- MIDI Learn and a user-labelled mapping worksheet;
- outgoing Note On/Off tests;
- MIDI panic across channels;
- connection/disconnection log;
- guided controller-test mode;
- local baseline save and comparison;
- JSON diagnostic report export;
- unsupported-browser detection, with documentation/interface access retained.

Reference: [MIDI Tester repository README](https://github.com/djshellshoxxx/Miditest/blob/main/README.md).

### 4.2 Free category's intended limits

MIDI Tester reports observed MIDI behavior. It is not intended to claim that a physical control is defective from a single session. The report must preserve device/browser context and distinguish observed values from conclusions.

The free category does not include, unless separately implemented later:

- analog audio output, input, headphone or microphone diagnosis;
- audio loopback, noise, channel balance or clipping measurements;
- calibrated physical fader travel, crossfader curve, force or wear;
- direct HID or proprietary protocol diagnostics beyond browser-supported MIDI;
- motorized platter mechanics, torque or physical latency measurement;
- DVS carrier-quality or absolute-position analysis;
- CD/USB/SD media transport checks;
- DJ software compatibility certification or automatic remapping;
- standardized device health scores.

### 4.3 DeckChek Controller relationship

DeckChek Controller may reuse MIDI Tester concepts and compatible measurement code, while adding a native/hardware-aware diagnostic workflow. It must remain useful for controller paths that expose HID or other supported protocols, while clearly labeling unsupported/vendor-specific controls. The free browser application remains available as an independent tool.

A JSON report from MIDI Tester may be attachable to a DeckChek controller session as external evidence. Import must retain source app/version and must not silently treat unlike browser and native measurements as directly comparable.

## 5. DeckChek Vinyl edition

### 5.1 Intended user and hardware

For vinyl-only and DVS DJs, repair technicians, collectors, rental fleets, and buyers checking used equipment. Covers direct-drive and belt-drive turntables, cartridges, styli, tonearms, headshells, phono wiring, test records, control vinyl, DVS interfaces, and relevant mixer/interface paths.

Hybrid turntables remain in Vinyl as their primary category because analog record playback and turntable mechanics are core capabilities. Their electronic control features can be tested through additional Controller capabilities where those tests are supported.

### 5.2 Ultimate test coverage

The Vinyl edition is expected ultimately to cover:

**Turntable transport and speed**
- actual RPM and speed error at supported nominal speeds;
- cold-start warm-up and long-term speed drift;
- wow, flutter, modulation trace and revolution-synchronous behavior;
- pitch-fader range, mapping, zero point, nonlinearity, dead zones, resolution and hysteresis;
- quartz-lock accuracy and acquisition;
- startup time, overshoot, settling, brake time, platter recovery and torque/acceleration proxies.

**Cartridge, tonearm and phono path**
- channel presence, balance, polarity, phase and crosstalk;
- frequency response and distortion when a suitable test record and calibrated path are available;
- azimuth and anti-skate evidence;
- mistracking, sibilance and tonearm/cartridge resonance indicators;
- rumble, subsonic energy, mains hum and harmonics;
- headshell, cartridge pin and RCA intermittent-contact evidence.

**DVS / control vinyl**
- generic XY scope, ellipse/circularity, channel balance, phase and polarity;
- clipping, noise, hum, rumble, carrier stability and dropout observations;
- format detection and validated format-specific analysis where permitted and technically supported;
- speed, direction, position continuity, acquisition and recovery where a validated decoder supports them;
- scratch/reversal stress and cue-point repeatability workflows;
- full-side control-vinyl quality timeline and wear comparison.

**Ordinary vinyl condition**
- full-side capture and time/radial event map;
- click, pop, repeating scratch and crackle observations;
- skip, repeat, locked-groove, warp and off-center indicators;
- inner-groove degradation, non-fill-like events, mistracking and groove-wall/channel damage hypotheses;
- dust/debris and stylus contamination hypotheses;
- repeat-play and before/after-cleaning comparisons;
- condition and vinyl-only live-readiness summaries whose evidence and limitations are visible.

**Venue and setup**
- quiet baseline, level-stepped feedback onset, low-frequency resonance and shock/footfall observations;
- support/isolation A/B comparison;
- deck-position, monitor/sub and electrical-hum comparisons;
- per-booth history, session events and vinyl-oriented setup report.

### 5.3 Quality levels and dependencies

Results shall carry observation/calibration level. For example, known-tone speed measurement is stronger than speed inferred from music; calibrated crosstalk requires known test material; vinyl damage remains an audio-based hypothesis rather than visual inspection. Detailed methods remain in SPEC-01 through SPEC-06 and SPEC-08.

## 6. DeckChek CDJ / Media Player edition

### 6.1 Intended user and hardware

For technicians, DJs, rental companies and buyers diagnosing CDJs and media players using optical discs, USB, SD or other supported media. This category covers the player transport, its outputs, playback/pitch behavior, and timecode signals that pass through it. It does not automatically diagnose the host DJ application's internal decoder.

### 6.2 Ultimate test coverage

The CDJ / Media Player edition is expected ultimately to cover:

**Playback, pitch and transport**
- pitch-fader map, measured speed versus displayed value, zero accuracy/repeatability and long-term stability;
- fine pitch step distribution where estimator precision permits;
- play/pause/resume, seek, cue, loop, track load/change and recovery workflows;
- cue-point repeatability and loop duration/boundary accuracy using known markers;
- jog direction, reversal and output response; physical input-to-output latency only with a synchronized trigger;
- used-player inspection checklist and comparable player-to-player reports.

**Disc/media reading**
- deterministic reference-media scan for observable mute, repeated segment, skip, discontinuity and load/read failure;
- playback-time/track event map, repeat scans and cross-player isolation;
- CD-R/CD-RW compatibility records including media/burn metadata;
- same-content comparisons across audio CD, CD-R and supported USB/SD file playback.

These are observable output tests. DeckChek must not claim internal optical error counters or infer a damaged disc, dirty lens or failing pickup from a single anomaly.

**Audio and digital outputs**
- basic analog output level in dBFS, channel presence/balance, clipping, hum and relative noise;
- calibrated Vrms, response, THD/THD+N, crosstalk and DC tests only with a characterized capture path suitable for each measurement;
- analog-versus-digital reference-aligned comparisons where compatible hardware is available;
- digital PCM sample rate, discontinuities and reference comparisons;
- lower-level S/PDIF frame/status/clock diagnostics only when the selected capture hardware exposes these measurements.

**CD/file timecode and DVS**
- generic scope, carrier/signal stability, balance, phase, clipping, noise and dropout timeline;
- generic integrity checks that do not rely on a proprietary decoder;
- validated vendor/open decoder functions for position, direction, readability, ABS/REL and seek acquisition when support exists;
- explicit player processing checklist and controlled Master Tempo/Key Lock or FX quality comparisons using a reference corpus;
- guided transport stress workflow and compared used-player report.

### 6.3 Detailed backlog and release staging

SPEC-10 contains the complete 30-item CDJ idea inventory and proposed v1.0/v2.0/v3.0 staging. It remains part of this category's eventual scope; this section summarizes the category boundary. Build sequencing is governed by SPEC-09 and validation by SPEC-08.

## 7. DeckChek Controller edition

### 7.1 Intended user and hardware

For DJs and technicians diagnosing laptop controllers, battle controllers, all-in-one systems, motorized DJ controllers, and motorized control decks. It covers the physical/control surface, supported MIDI/HID messages, integrated audio interfaces, and DJ software interaction only to the degree that the interaction can be observed and tested reproducibly.

A RANE TWELVE-style motorized control deck belongs here. It is a controller surface, even when it provides DVS control output; it is not classed as an analog turntable unless it also supports analog record playback.

### 7.2 Control-surface tests

The edition is expected ultimately to cover:

- protocol/device enumeration and connection stability;
- MIDI, and supported HID/vendor protocol capture;
- button press/release, held state, missed/double messages and repeatability;
- CC fader range, endpoints, dead zones, monotonicity, step distribution, jitter/noise and repeatability;
- crossfader/volume/tempo fader response and curve when a known audio or position reference is present;
- absolute/relative encoder behavior, steps per detent, direction, acceleration and missed/jump observations;
- jog wheel direction, touch/scratch state, message rate, step consistency, reversal response and release behavior where exposed;
- motorized platter startup, steady motion and commanded-response tests where a safe repeatable protocol exists;
- performance pad, velocity, aftertouch and note behavior when the device exposes those messages;
- pitch-bend controls and near-center behavior;
- MIDI clock output timing/stability and clock input measurement;
- saved mappings, MIDI Learn worksheets, profile comparison and JSON report interoperability with MIDI Tester.

A MIDI stream by itself does not reveal the physical location or force of a control. Claims about physical fader travel, motor torque, platter speed, tactile wear or response latency require an external position/speed/force reference or a validated device telemetry source.

### 7.3 Audio-interface and signal-path tests

For controllers with audio I/O, the edition is expected to provide guided capture/loopback tests, capability permitting:

- master and booth output channel presence, balance, clipping, noise and hum;
- headphone output and cue-channel routing;
- input routing and channel mapping for supported mic/line/phono inputs;
- sample-rate/device enumeration, buffer/dropout and disconnection observations;
- output latency and round-trip latency only with a characterized loopback path;
- relative output comparisons across channels, gains and supported modes.

Calibrated voltage, frequency response, distortion or crosstalk requires known references and an interface calibration. Output measured after a user's cable/mixer/interface is evidence about the complete path until those components are isolated.

### 7.4 Software and mapping compatibility

A guided compatibility check may capture device messages and compare them with user-selected expected functions or a user-provided mapping. It may report missing/changed messages and connection instability. DeckChek must not claim certification for an entire DJ application or automatically modify mappings unless a separately specified, supported integration is added.

## 8. DeckChek Ultimate

Ultimate combines the complete Vinyl, CDJ / Media Player and Controller capability sets. It is intended for users with mixed equipment, technicians, rental operations and buyers evaluating complete DJ rigs.

Ultimate shall provide:

- shared inventory for multi-capability devices and setups;
- cross-category session history;
- comparable A/B reports when methods and capture conditions match;
- holistic chain reports that identify which device/path was tested;
- access to category-specific workflows without duplicating measurements or stored assets;
- Controller edition's MIDI diagnostic functions in addition to the separate free MIDI Tester.

An Ultimate report must retain per-category coverage. It must never calculate one unsupported aggregate hardware-health score from unrelated metrics.

## 9. Shared rules across categories

### 9.1 Evidence and conclusions

Every report separates raw observations, derived measurements, diagnostic hypotheses and user-entered notes. A suspected fault is not a confirmed defective component. Alternative causes and next isolation steps should be shown when the evidence supports them.

### 9.2 Test requirements and quality gates

Every test declares:

- required hardware capability and routing;
- reference medium/signal and calibration, if required;
- method and version;
- measurement units;
- uncertainty or known limits;
- quality flags and conditions that invalidate a result;
- whether it is measured, derived, user-entered or externally imported.

Unavailable tests are shown as unavailable, not failed. Untested tests are shown as untested, not passed.

### 9.3 Comparison compatibility

Comparisons require compatible methods, references, capture routes, firmware/software context where relevant, and calibration. Incompatible measurements may be shown side-by-side with the reason they cannot support a direct score.

### 9.4 Reports and score policy

Early releases prioritize metrics and test coverage. Health or match scores may be added only after validation establishes thresholds, weighting and false-positive behavior. Every score must expand to its contributing measurements and quality flags.

### 9.5 Data and licensing boundary

The catalog and test engine are shared. Edition access gates workflows and analysis features, not the user's ability to record basic asset metadata. Licensing details and offline activation are outside this specification and require a separate licensing design.

## 10. Implementation and validation sequence

The existing DeckChek v0.x engineering roadmap remains authoritative for implementation order. Major-release names in the edition plan are packaging targets, not permission to skip foundational phases.

Recommended sequencing:

1. Build shared capture, calibration, test-session, report and local database foundations.
2. Complete reusable signal-chain and reference-tone tests.
3. Deliver Vinyl workflows as turntable/DVS/vinyl capabilities mature.
4. Deliver CDJ workflows by reusing signal-chain and generic DVS services, then add media-reference alignment.
5. Deliver Controller diagnostics after MIDI/HID input, external control references and integrated audio loopback are validated.
6. Package focused paid editions and Ultimate only after every included test meets its acceptance criteria.

Each test needs synthetic or known-reference regression fixtures, negative cases, hardware validation appropriate to the claim, persisted provenance, report support and user-facing setup instructions.

## 11. Acceptance criteria for this category model

The edition and category model is ready for implementation when:

- each test in SPEC-01 through SPEC-10 maps to one or more capability categories;
- no existing test is accidentally dropped by the edition structure;
- Free MIDI Tester is documented as a standalone MIDI-only product with its current capabilities and clear limits;
- hybrid/multi-capability devices can appear across categories without duplicating their identity;
- focused editions and Ultimate can unlock shared modules from a single application build;
- controller-only motorized platters are distinguishable from analog record-playing turntables;
- all editions distinguish unsupported, unavailable, untested, passed and failed states;
- future pricing/entitlement implementation has a separately reviewed license and billing specification.
