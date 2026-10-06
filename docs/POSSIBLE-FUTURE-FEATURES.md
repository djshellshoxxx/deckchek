# Possible Future Features: Basic-Equipment Service Bench

Status: consideration backlog, not implemented support or a release commitment.
Research date: 2026-10-06 (UTC; 2026-10-05 in Vancouver).
Audience: DJs, repair technicians, development engineers and audio engineers.

This document retains the proposed basic-equipment features and additional ideas found while searching turntable, CDJ and controller service manuals. Existing diagnostics are extended rather than redefined. See [SPEC-01](SPEC-01-turntable-cartridge-diagnostics.md), [SPEC-05](SPEC-05-venue-surface-diagnostics.md), [SPEC-10](SPEC-10-CDJ-media-player-diagnostics.md), [SPEC-11](SPEC-11-product-editions-and-categories.md), [SPEC-14](SPEC-14-audio-routing-and-wiring.md), [SPEC-18](SPEC-18-open-source-reuse-and-validation.md) and [SPEC-19](SPEC-19-scientific-measurement-and-validation.md).

## 1. Equipment tiers and evidence labels

| Tier | Available equipment | Intended use |
|---|---|---|
| B0 | Computer, local files and supported USB/MIDI connection | Signal-file generation, controller event logging, guided observations and service-result imports |
| B1 | Stereo line input/output, suitable cables and an existing phono stage/mixer | Electrical loopback and audio-path measurements |
| B2 | Basic digital multimeter | Manual continuity, resistance and documented DC readings |
| B3 | Microphone and speaker | Relative acoustic observations and coupling comparisons |
| B4 | Phone camera and ruler | Observed transport timing, cueing and mechanism behaviour |
| B5 | Simple passive attenuator or termination adapters | Phono-stage stimulus tests and controlled noise comparisons |
| R | Documented physical test record or suitable supported control record | Groove-dependent reference measurements |
| X | Specialized instruments | Deferred engineering tests in section 8 |

A laptop microphone socket is not automatically a stereo line input. Every workflow must check channel count, input type and processing. A microphone alone cannot capture an electrical stereo path.

Evidence labels: direct electrical measurement; device-reported service result; manual observation; audio-derived estimate; acoustic comparison; synthetic algorithm validation. These labels must remain visible in reports. Source IDs below identify the basis for a proposal, not proof that DeckChek implements the manufacturer's diagnostic.

## 2. What the manual search established

Manufacturer-authored manuals were inspected through official hosting or public mirrors. Mirror OCR can corrupt symbols; actionable model profiles require checking the original page image, region, revision and applicable serial range.

| Source | Model/document and inspected location | Finding retained |
|---|---|---|
| S1 | Technics SL-1200MK2/SL-1210MK2 service manual supplement, measurements and adjustments | Pitch-gain resistance check with CN102 disconnected; zero-point frequency check; brake-angle check |
| S2 | Technics SL-1200MK2 manual, electrical adjustment p.13 | Tester and frequency counter procedures; reference voltages/waveforms; brake criterion differs from the supplement |
| S3 | Dual CS 1258 service manual, pp.2, 5–6 | Pickup wiring, automatic muting, cueing and return mechanisms; factory anti-skate work needs dedicated equipment |
| S4 | Pioneer PLX-1000, RRV4511, contents and section 8 p.22 | Wiring/diagnosis sections exist; setting/adjustment section contains no procedure. Do not invent calibration instructions |
| S5 | Numark TTX Variable Torque service information, schematic sheets | Phono/line routing and separate analog/digital circuit sections; no verified adjustment sequence in this short document |
| S6 | Pioneer CDJ-2000NXS, RRV4356, service mode p.34 | Built-in input/display checks, version/error information and drive diagnosis |
| S7 | Same CDJ-2000NXS manual, jog-load p.37 | Device exports jog-load results to JOGLOAD_2KNXS.CSV on USB storage |
| S8 | Pioneer CDJ-1000MK3 service manual, diagnosis p.79 | Version/error history, button/display, jog-load and mechanism/servo test modes |
| S9 | Pioneer DDJ-SX, RRV4382, service/measurement modes pp.17–22 | UI/LED checks, jog deceleration and stationary knob/fader fluctuation checks; ordinary service mode disables USB communication |
| S10 | Pioneer DDJ-SX2, RRV4568, measurement-mode material | Jog and knob/fader measurement-mode candidate. Full PDF retrieval exceeded the research tool limit; detailed procedure remains pending verification |
| S11 | Audio Precision, Equalized Sweeps for APx500 | Inverse-RIAA stepped waveform generation for phono-preamp measurement |
| S12 | Ortofon Quality Assurance | Physical test records used for cartridge sensitivity, separation, balance, tracking and response |

Confirmed values are model-specific: S1 gives 2.7 kΩ ±0.1 kΩ for the isolated pitch-gain procedure and 262.08 kHz ±0.05 kHz for the zero-point oscillator. S2 and S1 specify different brake-angle ranges. No generic SL-1200 brake threshold is approved by this research.

S7 reports a 170 ±20 ms jog-load criterion for its specified deceleration test. S9 defines a different jog procedure and criterion. These are device service measurements, not interchangeable torque measurements.

## 3. Turntable repair candidates

All rows are proposals. “Basis” separates manual evidence from DeckChek's proposed adaptation.

| ID / feature | Requirements and workflow | Output and interpretation limits | Basis |
|---|---|---|---|
| TB-01 Guided fault isolation | B1; capture baseline, swap one cartridge/headshell/cable/input at a time, tag each change | Evidence graph showing which component the fault follows; retain alternative explanations | Proposed extension of SPEC-01/06 |
| TB-02 Pitch resistance mapper | B2; model-specific isolated potentiometer connections; enter repeated readings through travel | Resistance curve, unstable positions and repeatability; no universal linearity limit | S1/S2; mapping is proposed |
| TB-03 Service calibration worksheet | B2; verified model/revision profile, point diagram, operating state and tolerance | Entered value, target, deviation and source; oscillator step unavailable unless meter bandwidth/accuracy qualifies | S1/S2 |
| TB-04 Tonearm-to-RCA wiring map | B2; disconnect cartridge and external electronics; check each conductor and intended shield/ground path | Opens, unintended shorts and intermittent results; account for intentional muting switches | S3/S4/S5; proposed workflow |
| TB-05 Arm-position continuity survey | B2; repeat isolated wiring readings at outer/middle/inner arm positions | Position-dependent fault evidence; ordinary meters may miss brief interruptions | Proposed extension of TB-04 |
| TB-06 Muting-switch checker | B2 or B1 with suitable test fixture; compare cycle/play states on supported automatic models | Channel mute/release observations and asymmetry; intentional shorting is not automatically a fault | S3 |
| TB-07 DC reading worksheet | B2; exact low-voltage service points, ground reference and stopped/running conditions | Manual voltage comparison; no ripple or waveform claim from DC readings | S2; S4/S5 only after page verification |
| TB-08 Intermittent fault recorder | B1; pre/post-event audio buffer, long capture and manipulation tags | Channel dropouts, crackle and pitch-event timeline; avoid equating every transient with a bad contact | Proposed extension of SPEC-01 |
| TB-09 Cold/warm comparison | B1 or B3; repeat identical runs and record elapsed time; optional external temperature reading | Drift, noise and event-rate change; elapsed time alone does not identify a thermal component failure | Proposed experiment |
| TB-10 Phone-video startup/brake test | B4; visible non-contact platter marker and original video timestamps | Speed-rise proxy, stopping angle, rebound and variability; rolling shutter/frame rate constrain accuracy | S1/S2; video adaptation proposed |
| TB-11 Cueing and automatic-cycle worksheet | B4; ruler, repeated cycles and timestamped observations | Descent duration, clearance, set-down/return failures; no calibrated bearing-friction measurement | S3; proposed video adaptation |
| TB-12 Acoustic mechanical-noise survey | B3; fixed mic positions, motor stopped/running and multiple speeds | Relative spectra and repeated clicks/rattles; airborne sound is not standardized stylus rumble | Proposed experiment |
| TB-13 Phone-video gross wobble observation | B4; fixed view, ruler/reference and platter/mat/record comparisons | Visible wobble evidence; millimetre runout only after geometric calibration and validation | Proposed inexpensive alternative |
| TB-14 Repair verification report | B0; serial number, before/after sessions, parts, settings and technician notes | Method-compatible deltas, evidence attachments and untested items | Proposed extension of reporting/history |

Do resistance/continuity tests on unpowered isolated circuits. Cartridge-coil resistance testing is excluded from the generic wiring wizard; it needs cartridge-specific approval and a meter test-current specification. Basic workflows must never route an internal motor, mains or oscillator test point into an ordinary sound-card input.

## 4. Signal generator and audio engineering candidates

Generated tones travel through electronics or speakers. They cannot substitute for a tone recorded in a physical groove.

| ID / feature | Requirements and workflow | Output and interpretation limits | Basis |
|---|---|---|---|
| SG-01 Configurable signal generator | B0 output; sine, stepped tones, sweep, two-tone, noise and windowed bursts; L/R/both selection, level, duration and fades | Live stimulus or WAV plus manifest; digital level in dBFS is not analog volts | Proposed infrastructure |
| SG-02 Loopback calibration | B1; capture output directly through documented line connections and fixed gains | Interface response, channel mismatch, noise/distortion floor and latency; cannot resolve faults below its own floor | SPEC-08/19 extension |
| SG-03 Channel/routing identification | B1; alternate L-only/R-only tones through mixer/interface | Missing/swapped channels, unintended mono routing and leakage | Proposed audio-path test |
| SG-04 Electronic response/gain sweep | B1; bypass EQ/FX, baseline loopback, repeat stepped frequencies | Relative transfer response and matching; absolute gain requires voltage calibration | Proposed audio-path test |
| SG-05 Headroom ramp | B1; fixed tone with controlled level steps and captured return | Distortion/clipping onset; isolate DAC, device and ADC limits with repeated gain configurations | Proposed audio-path test |
| SG-06 Two-tone distortion | B1; documented frequencies/amplitudes and baseline | IMD components above the measurement floor; no cartridge IMD without physical test tracks | Proposed extension |
| SG-07 Tone-assisted cable wiggle test | B1; test isolated cable/electronic path, tag movement | Dropouts and bursts; injecting tone bypasses cartridge mechanical behaviour | Proposed extension |
| SG-08 Inverse-RIAA sweep | B1+B5; turntable disconnected; verified passive attenuator, source/load model and output calibration | Relative RIAA error and channel match; absolute gain/headroom only with qualified calibration | S11 |
| SG-09 Controlled noise comparison | B1+B5; defined termination and gain, connected/disconnected cartridge, motor and cable-route states | Relative noise spectrum and hum changes; shorted input noise is not cartridge-loaded noise | Proposed extension |
| SG-10 Acoustic coupling sweep | B1+B3; speaker excitation, microphone and phono capture preferably synchronized; direct monitor/feedback routing documented | Frequencies coupling into playback and repeatable A/B isolation results; no absolute vibration without sensor | Proposed extension of SPEC-05 |
| SG-11 Resonance-decay comparison | B3 and preferably B1; repeated low-level windowed bursts with same speaker/mic placement | Relative decay under mats/feet/surfaces; room and loudspeaker ringing can dominate | Proposed experiment |
| SG-12 Mono compatibility | B1; mono electrical reference or R for cartridge path | Cancellation and phase mismatch; distinguish electrical path from cartridge/groove path | Proposed extension |
| SG-13 Subsonic-filter comparison | B1; stepped frequencies within usable DAC/ADC bandwidth; filter on/off | Relative attenuation, phase and overload changes; unsuitable low-frequency hardware blocks results | Proposed experiment |
| SG-14 Cartridge loading experiments | R+B1; repeat documented test tracks at known loading settings | Response/distortion comparison with setup preserved; generated electrical sweep alone does not measure cartridge response | SPEC-01 extension; S12 reference basis |
| SG-15 Distortion versus groove radius | R+B1; equivalent documented tracks at multiple radii | Radius-associated differences; record cutting/pressing remains a confounder | Proposed extension |
| SG-16 Archival capture qualification | B1; routing/gain checks followed by monitored full-side capture | Clipping, interruptions, polarity evidence and saved setup | Proposed extension |
| SG-17 Synthetic fault fixtures | B0; deterministic WAVs with known hum, FM, imbalance, dropouts and clicks | DSP regression evidence; simulation does not validate physical diagnostic specificity | SPEC-08/18/19 extension |

Generator requirements: start muted, explicit output selection, conservative default level, visible routing, immediate stop, finite default duration and ramped start/stop. Block phono stimulus mode until the attenuator profile is selected. Calibrate at a frequency within the multimeter's specified AC bandwidth and adequate voltage range; do not assume a basic meter measures millivolt signals or a full audio sweep accurately.

Reference manifests should include sample rate, sample count, waveform version, frequencies, digital levels, channel layout, random seed, checksum and expected analyzer results.

## 5. CDJ / media-player service candidates

| ID / feature | Requirements and workflow | Output and interpretation limits | Basis |
|---|---|---|---|
| CJ-01 Built-in service-result notebook | B0; verified model profile, user enters screen results or attaches photographs | Preserve self-test evidence with model/firmware; no universal remote service API | S6/S8 |
| CJ-02 Jog-load CSV importer | B0+USB storage; import original device export | Validate fields/units, preserve original and show per-run results; criterion bound to model/procedure | S7 |
| CJ-03 Button/display inspection | B0; guided device self-test or supported normal MIDI/HID mode | Coverage map for keys, encoders, slider, touch/needle controls and display; separate observed from received events | S6/S8 |
| CJ-04 Firmware/error-history record | B0; manually capture built-in displays | Per-unit history and recurrence; firmware/reset operations excluded | S6/S8 |
| CJ-05 Generated reference-media pack | B0; export tones, channel IDs, markers, silence and known loops in model-supported formats; USB/SD or audio CD where applicable | Reproducible stimuli and file manifest; file export does not itself burn a CD or guarantee media compatibility | Proposed extension of SPEC-10 |
| CJ-06 Playback interruption/seek survey | B1 plus known media; repeated track starts/seeks, cold/warm runs, media/cable swaps | Load-time observations and audio discontinuities; playback success does not expose raw optical error rate | Proposed extension; service context S6/S8 |
| CJ-07 Tempo/zero/keylock comparison | B1 plus generated files; fixed pitch checkpoints and keylock state | Frequency ratio, reset repeatability and algorithm artifacts; clock error and keylock confound speed interpretation | Proposed extension of SPEC-10 |
| CJ-08 Cue/loop repeatability | B1 plus marker files; repeated cue/loop operations and reference alignment | Audio-position spread and seam discontinuities; physical-button latency needs synchronized trigger evidence | Proposed extension |
| CJ-09 Built-in drive-diagnosis capture | B0; exact supported service procedure and required reference medium | Record device-reported statuses only; no software laser-power or RF-eye claim | S6 |
| CJ-10 PC/network connection worksheet | B0; applicable user/service interface and connection observations | Model-specific connection evidence; no assumed proprietary control or packet API | S6 manual's PC connection section; adapter pending |

These extend, rather than replace, the 30-item consideration backlog in SPEC-10. The initial implementation should accept human-entered self-test results before attempting any automation.

## 6. Controller service candidates

| ID / feature | Requirements and workflow | Output and interpretation limits | Basis |
|---|---|---|---|
| CT-01 Control/LED coverage worksheet | B0; ordinary MIDI/HID mode or guided built-in service test | Tested/untested controls and observed indicators; automatic LED drive requires documented output messages | S9/S10; proposed integration |
| CT-02 Stationary fader/knob jitter monitor | B0+USB; leave controls untouched, capture messages at several positions | Spurious events and value spread; MIDI filtering/quantization may conceal raw ADC variation | S9/S10; normal-mode adaptation |
| CT-03 Built-in ADC fluctuation entry | B0; manually enter device measurement-mode results | Device-reported readings, reference and applicable criterion; keep distinct from MIDI-value jitter | S9; S10 detailed verification pending |
| CT-04 Jog deceleration worksheet | B0; repeated supported built-in measurements, manual entry or photographs | Device-reported time/distribution; no torque claim and no cross-model common limit | S9/S10 |
| CT-05 Button bounce/encoder survey | B0+USB; deliberate repeated presses and slow/fast turns | Duplicate/missing events and direction anomalies; physical action needs count/video evidence | Proposed extension of controller diagnostics |
| CT-06 Audio-route/output comparison | B1; tones through supported USB or line-input routes; capture master/booth/phones separately | Balance, mute leakage and distortion relative to interface floor; headphone load documented | Proposed extension; S9 troubleshooting context |
| CT-07 Crossfader cut-in/curve survey | B1; steady tone and manually entered or video-observed fader position | Audio attenuation curve, cut-in and discontinuities; travel in mm requires ruler/video calibration | Proposed experiment |
| CT-08 USB reconnect/endurance log | B0; host-device event logging plus optional audio capture; swap known-good cable/port | Disconnects, spurious messages and glitches; cannot establish electrical USB compliance | Proposed experiment |

S9's ordinary service mode does not communicate with the computer over USB. DeckChek must support manual observations in that state, not present a failed MIDI connection as a failed controller. Measurement-mode communication must be verified independently. Never apply raw ADC thresholds to MIDI CC values.

## 7. Common implementation requirements and release gates

Every candidate needs an equipment checklist, explicit wiring/state instructions, model/revision provenance, clear start/stop controls, raw evidence retention, quality flags and an inconclusive result.

Store feature ID; asset/serial; model/region/revision; firmware; source ID/page; service state; channel routing; stimulus manifest; interface/driver/sample rate; gains; calibration date; meter model/range/bandwidth; microphone position/processing; video timestamps; result origin; units; repeated readings; confidence and limitations.

The workflow must distinguish B0 software tests, closed-device audio tests, unpowered continuity checks and internal service procedures. Internal live measurements require a separately verified procedure and appropriate instruments; generic beginner mode should not direct users into mains circuitry. Factory resets, firmware writes and mechanical/laser adjustments are outside automatic test execution.

Before promotion to implemented support:

1. Validate generated files and analyzers against deterministic fixtures.
2. Verify each model procedure against readable original page images, not OCR alone.
3. Test CSV import against real supported exports, malformed files and model mismatches.
4. Validate audio tests with loopback and known defects; record detection floor.
5. Validate camera methods against a known timing/rotation reference and reject inadequate video.
6. Repeat microphone tests with fixed placement and processing; report relative results.
7. Verify controller modes, USB availability and documented MIDI/HID mappings on actual hardware.
8. Complete a real-device negative/ambiguous test before enabling a diagnostic cause claim.

Suggested implementation order: generator + manifests; loopback qualification; manual worksheets; intermittent capture; service-result import; controller normal-mode logging; reference-media pack; inverse-RIAA adapter workflow; camera/acoustic experiments. Optional bench research does not become a beta blocker.

## 8. Deferred features requiring specialized equipment

These retain the earlier engineering ideas for future consideration.

| Candidate | Additional requirement | Intended output / boundary |
|---|---|---|
| Synchronized independent rotation/audio | Optical encoder/tachometer and synchronization | Separate groove-reference effects from platter speed |
| Rotation-order analysis | Rotation reference and validated analysis | Order spectra; correlated mechanical hypotheses |
| Servo load-step experiments | Repeatable calibrated load plus rotation sensor | Overshoot/settling under controlled conditions |
| Actual torque measurement | Calibrated force/torque fixture | Starting/running/braking torque |
| Motor-current/ripple correlation | Scope/DAQ and appropriate probes | Correlate electrical waveforms with speed/noise |
| Vibration transfer function | Calibrated accelerometers and excitation | Mechanical transfer and damping |
| Precision runout | Dial indicator/displacement sensor | Vertical/radial runout against angle |
| Bearing/coast-down characterization | Rotation sensor and documented brake/motor state | Deceleration comparisons; friction inference needs model |
| Stylus condition evidence | Suitable microscopy and validated inspection method | Images and assessment; audio alone does not prove wear |
| Laboratory design experiments | Above fixtures as needed, replicated trials | Parameter effects, repeatability and uncertainty |

Research basis for this appendix is the earlier proposed engineering scope and SPEC-19. No newly discovered service-manual procedure is implied.

## 9. Sources and retrieval notes

All sources accessed/searched 2026-10-06 UTC. Keep links and concise paraphrased notes; public availability does not grant redistribution rights. No service PDFs, schematics or manufacturer code are copied into the repository.

- **S1 — Technics SL-1200MK2 supplement:** [Measurements and adjustments](https://manualzz.com/doc/en/62041945/technics-sl-1200mk2-service-manual-supplement). Resistance procedure, oscillator reference and brake criterion; region/revision must be checked before profile activation.
- **S2 — Technics SL-1200MK2 service manual:** [Electrical adjustment p.13](https://www.manualslib.com/manual/376633/Technics-Sl-1200mk2.html?page=13); [manufacturer-authored PDF mirror](https://warehousesound.com/r/technicsSL1200MK2service.pdf). Different brake criterion demonstrates revision sensitivity.
- **S3 — Dual CS 1258:** [Official-hosted service manual](https://dual.de/wp-content/uploads/ServiceManual_1258.pdf). Wiring p.2; tonearm/cueing/muting p.5; muting/return p.6. Non-DJ mechanism example supporting automatic-deck workflows.
- **S4 — Pioneer PLX-1000 RRV4511:** [Service manual](https://www.manualslib.com/manual/2556125/Pioneer-Plx-1000.html). Contents, wiring/diagnosis headings and p.22 empty adjustment section inspected. Individual diagnosis pages were inaccessible; exact test points/limits remain unverified.
- **S5 — Numark TTX Variable Torque:** [Service information PDF](https://audiocircuit.dk/downloads/numark/Numark-TTX-tt-si.pdf). Three-page schematic document; variant matching required. No motor calibration recipe inferred.
- **S6 — Pioneer CDJ-2000NXS RRV4356:** [Service mode p.34](https://www.manualslib.com/manual/959075/Pioneer-Cdj-2000nxs.html?page=34); [manual index](https://www.manualslib.com/manual/959075/Pioneer-Cdj-2000nxs.html). Input/display tests; drive diagnosis, error information and PC confirmation sections.
- **S7 — CDJ-2000NXS jog measurement:** [p.37](https://www.manualslib.com/manual/959075/Pioneer-Cdj-2000nxs.html?page=37). Built-in deceleration result and CSV export; real sample needed for parser development.
- **S8 — Pioneer CDJ-1000MK3:** [Diagnosis/service overview p.79](https://www.manualslib.com/manual/900348/Pioneer-Cdj-1000mk3.html?page=79). Up to 16 error logs and separate diagnostic modes. Do not substitute MK2 values.
- **S9 — Pioneer DDJ-SX RRV4382:** [Service-manual transcription](https://pdfcoffee.com/pioneer-ddj-sx-2-pdf-free.html); [manual mirror](https://www.manualslib.com/manual/2944856/Pioneer-Ddj-Sx.html). Printed pp.17–22 cover firmware/UI, USB limitation and measurement modes. A model profile still requires image verification.
- **S10 — Pioneer DDJ-SX2 RRV4568:** [Service-manual index](https://www.manualslib.com/manual/1242425/Pioneer-Ddj-Sx2.html); [PDF mirror](https://audiocircuit.dk/downloads/pioneer/Pioneer-DDJSX2-djc-sm.pdf). Search-indexed measurement content supports a candidate; full PDF exceeded retrieval size limit and detailed page access failed. No executable procedure or tolerance adopted.
- **S11 — Audio Precision:** [Equalized Sweeps for APx500](https://www.audioprecision.com/news/equalized-sweeps-for-apx500). Independent generator methodology, not a turntable service manual.
- **S12 — Ortofon:** [Quality Assurance](https://ortofon.com/pages/quality-assurance). Manufacturer reference for physical test-record measurement scope.

## 10. Scope boundaries

Software-generated FM validates a wow/flutter algorithm, not a physical deck. Speaker tones do not measure stylus tracking or cartridge frequency response. A phone-video average-speed check does not establish standardized wow/flutter. An ordinary microphone comparison does not establish calibrated SPL, acceleration or rumble. DMM DC readings cannot establish capacitor ESR, fast ripple or servo waveforms. Successful CDJ playback does not prove optical health. General MIDI/HID support does not imply access to proprietary raw sensors or automatic service-mode control.

All proposed features must remain visibly marked planned/experimental until the release gates are met.
