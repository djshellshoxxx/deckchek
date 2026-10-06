# SPEC-10: CDJ and Media-Player Diagnostics — Consideration Backlog

Status: proposed scope for consideration, not implemented or a release commitment.
Date: 2026-10-06
Related: SPEC-02 (DVS), SPEC-04 (database), SPEC-06 (reports), SPEC-08 (validation), SPEC-09 (roadmap).

## Purpose and recommended release boundary

Add a CDJ / Media Player Diagnostic mode and a CD / File-Based DVS submode. Include optical players and USB/SD players only where their capabilities apply. Keep player measurements separate from DVS decoder and host-software behavior.

Recommendation: v1.0 provides a useful player Quick Check by reusing stereo capture, reference-tone analysis, generic DVS, history and reports. v2.0 introduces reference-aligned transport/media diagnostics and deeper output measurements. v3.0+ adds synchronized trigger hardware, low-level digital inspection and automated fleet testing.

The existing v0.x roadmap remains the development sequence. These version labels describe the proposed CDJ scope of eventual major releases; they do not accelerate or replace the existing foundation work.

## Complete idea inventory

Every idea below is retained for consideration. Split entries distinguish a basic release from a later extension.

| ID | Diagnostic / comparison | Proposed release | Scope and dependency |
|---|---|---|---|
| CDJ-01 | Pitch-fader calibration | v1.0 | Guided known-tone pitch map; zero and selected positive/negative points within the model's supported ranges; actual speed error, linearity and directional approach differences. |
| CDJ-02 | Long-term tempo stability | v1.0 | Mean speed, drift, variation and discontinuity timeline over selectable durations; annotate warm-up and capture-clock uncertainty. |
| CDJ-03 | Pitch resolution | v2.0 | Guided fine sweep and observed step distribution; requires estimator precision below the proposed step size. Do not infer a complete count of fader steps from a sparse sweep. |
| CDJ-04 | Pitch-display accuracy | v1.0 | User enters displayed percentage; compare with measured reference-tone speed and show percentage-point error. |
| CDJ-05 | Tempo-zero / reset accuracy | v1.0 basic; v2.0 timing | Repeated return-to-zero offsets and repeatability first; settling-time measurement later with a defined event reference. |
| CDJ-06 | Jog-wheel response | v2.0 output behavior; v3.0+ physical latency | Guided movement-to-audio displacement and forward/backward behavior. Physical movement latency/sensitivity requires a synchronized movement sensor or supported controller event. |
| CDJ-07 | Jog direction / reversal | v2.0 | Supported signal direction transitions, corruption, tracking loss and recovery; unsupported decoders show unavailable. |
| CDJ-08 | Cue-point repeatability | v2.0 | Repeated waveform/marker alignment gives start-position dispersion. Separate this from trigger-to-output latency. |
| CDJ-09 | Cue-response latency | v3.0+ | Cold/hot cue, pause/play, load/play and loop-exit response using a measured, synchronized trigger and calibrated capture latency. |
| CDJ-10 | Loop accuracy | v2.0 | Known marker track; loop duration, boundary jitter, entry/exit artifacts and accumulated phase error relative to the expected reference. |
| CDJ-11 | Transport stability | v2.0 | Guided play/pause/resume/seek/load/disc-ready workflow and output recovery. Manual timings are approximate observations; instrumented request-to-ready timings deferred. |
| CDJ-12 | Optical-disc read reliability | v2.0 | Generated deterministic reference CD; aligned output comparisons identify observable mute/repeat/skip/discontinuity and reference mismatch. No internal C1/C2 claims. |
| CDJ-13 | Damaged-CD mapping | v2.0 | Track/time event map, repeated scans and cross-player tests. Audio alone cannot certify physical damage, corrected sectors or a clean optical pickup. |
| CDJ-14 | Burned-CD compatibility | v2.0 | CD-R/CD-RW brand, burn speed/burner, format, sessions, finalization and age; successful loads, scan results and observed failures. |
| CDJ-15 | Analog-output diagnostics | v1.0 basic; v2.0 calibrated | First: peak/RMS dBFS, channel presence/balance, correlation, clipping, hum and relative noise. Later: calibrated Vrms, response, THD/THD+N, crosstalk and bandwidth; DC only with a verified DC-coupled measurement path. |
| CDJ-16 | Analog versus digital outputs | v2.0 | Reference-aligned level/response/noise/distortion/latency comparison with compatible capture. ADC, gain and clock differences remain part of uncertainty; does not automatically isolate the player's DAC. |
| CDJ-17 | Digital-output integrity | v2.0 PCM; v3.0+ low-level | Captured PCM sample rate, discontinuity and reference comparison first. S/PDIF channel status, invalid frames and electrical clock/jitter need a backend/hardware exposing them; nominal bit depth does not establish effective resolution. |
| CDJ-18 | Master Tempo / Key Lock quality | v2.0 | Controlled music/reference corpus at supported speeds, aligned pitch preservation, stereo changes and artifact metrics plus listening excerpts. No universal quality score until perceptual validation. |
| CDJ-19 | Player FX contamination / bypass | v1.0 setup; v2.0 comparison | First: explicit keylock/FX-off checklist and generic anomalous-signal observations. Later: controlled bypass/zero-wet/filter-neutral comparisons. Never uniquely diagnose an enabled effect from an altered scope. |
| CDJ-20 | CD/file timecode quality | v1.0 generic; v2.0 decoder extensions | XY scope, channel balance/phase, clipping, noise, carrier variation and dropout timeline. Proprietary readability, position and direction require individually validated capabilities. |
| CDJ-21 | Timecode-media integrity | v1.0 guided; v2.0 alignment | First: source/CD/player/cable/interface swap checklist and retained captures. Later: known-file alignment and repeated scans to separate hypotheses; carrier anomalies alone cannot identify disc damage. |
| CDJ-22 | Absolute-position accuracy | v2.0+ capability gated | Compare known encoded location with supported decoder output; host DVS position needs a separate observation/integration. Unsupported formats are not guessed. |
| CDJ-23 | ABS versus REL benchmark | v2.0+ integration gated | Controlled host software/version/mode tests for cues, loops, tracking and recovery; input tone alone cannot reveal host behavior. |
| CDJ-24 | Timecode seek / acquisition | v2.0 | Output discontinuity to validated decoder reacquisition at selected locations. Physical seek-command latency needs synchronized triggering later. |
| CDJ-25 | Two-player matching | v1.0 basic; v2.0 expanded | Comparable pitch, drift, channel levels, hum/noise and generic DVS results first; cue/jog/loop/disc metrics as they become validated. |
| CDJ-26 | Cross-model comparison database | v1.0 local; v3.0+ community | Local product/asset/firmware/media/output/pitch capability records, measurements and maintenance. Community distributions later, with method and sample-size controls. |
| CDJ-27 | Same-player CD versus USB | v2.0 | Same reference content via audio CD/CD-R/WAV/AIFF with documented format conversion; compare output, pitch, processing, errors and cue behavior. |
| CDJ-28 | Direct CD versus CD-controlled DVS | v2.0 | Controlled music reference via player and via DVS software; record the full interface/software/buffer chain and its latency. Control tone and music waveforms are not directly comparable. |
| CDJ-29 | Device stress testing | v2.0 guided; v3.0+ automated | Repeatable load/play/pause/cue/seek/pitch/jog/loop routines, cycle counts and anomaly logs; unattended control requires model-specific integration. |
| CDJ-30 | Used-player inspection | v1.0 checklist/report; v2.0 full | First: identity, firmware, visual/operator checklist and measured Quick Check. Later: transport/disc/jog/cue/loop assessment; untested sections stay untested, without invented health scores. |

## v1.0 implementation contract

Reuse the planned input/capture, tone estimator, generic DVS, SQLite and HTML report services. Add a player-specific guided workflow rather than a separate DSP engine.

Minimum workflow:
1. Identify physical asset, model, firmware, media path and output connection; enter supported pitch range and displayed setting.
2. Confirm line-level capture, adequate headroom, fixed gains, disabled processing and reference identity.
3. Run known-tone pitch points, zero/reset repetitions and a steady-speed capture.
4. Run stereo Quick Check and, optionally, generic CD/file timecode scope/integrity.
5. Compare compatible runs from another player or the same player's baseline.
6. Save evidence and export a player report with explicit unavailable/untested sections.

Reference playback speed: speed_percent = 100 × (measured_frequency / reference_frequency − 1).
Display error: measured speed_percent − displayed speed_percent, expressed in percentage points.
Do not translate a CDJ's speed into platter RPM.

Tone reference checks must reject clipping, insufficient duration, unstable/noisy detection and reference ambiguity. A wrong carrier/reference frequency must not produce a confident calibration result. Time-stretch/keylock must be off when frequency is used as a speed proxy.

Required record fields: asset/model, firmware or explicitly unknown, source medium, reference file hash/version, sample rate, capture device/backend, gain/routing, pitch range and entered display value, processing settings, elapsed duration, method/version, metric units, quality flags and uncertainty. Preserve run IDs, raw evidence references and comparison eligibility reasons.

Compare only compatible methods, references, routing and gain/calibration conditions. Unknown firmware remains visible. dBFS is not Vrms; arbitrary program material does not establish channel imbalance or SNR. Use defined mono, silence and quadrature segments for their respective metrics.

v1.0 acceptance gates:
- Deterministic tone fixtures verify known positive/negative speed offsets and entered-display errors; clipping, wrong-reference and unstable-tone negative cases suppress confident results.
- Stereo fixtures verify channel swap/loss, level imbalance, hum and clipping observations. Quadrature signal polarity/phase is interpreted in its DVS context, not against a mono-music correlation expectation.
- Capture interruption is distinguished from suspected player dropout where backend evidence permits; ambiguous cases retain both alternatives.
- Short/manual tests cannot claim physical trigger latency or statistically supported disc reliability.
- Database round trips and HTML exports preserve provenance, units, uncertainty, exclusions and untested sections.
- Hardware validation compares the estimator against a characterized independent reference and repeats runs on at least two player models before CDJ calibration is called validated. Set published tolerances from measured uncertainty, not the illustrative numbers in discussion.

## Why defer the advanced tests

Transport and disc analysis require robust reference alignment despite resampling, analog coloration and variable playback speed. Without it, ordinary differences can look like reading defects. Cue, jog and command latency need an independently observed trigger. Analog benchmarking needs a characterized measurement chain. Digital electrical integrity requires capabilities ordinary stereo capture may not expose. Decoder-dependent features must ship format by format.

v2.0 acceptance includes planted mute/repeat/skip fixtures, clean-reference false-positive tests, cue/loop marker regression, cross-player repeat scans, analog-path controls and decoder capability tests. v3.0+ latency work must calibrate trigger/capture synchronization and report uncertainty; automated tests must log which commands were actually acknowledged.

## Interpretation rules that correct the initial brainstorming

- Stable playback output does not prove optical health: correction or buffering may hide defects. Report observable failures only.
- Audio-derived speed variation is playback-plus-reference-plus-capture behavior, not a direct measurement of the player's clock or a diagnosis of digital resampling failure.
- CD defects are mapped to playback time/track, not physical sectors or disc radius unless separate metadata establishes that mapping.
- A same-position failure across players supports a source-medium hypothesis, but source-file errors, burn errors and common processing remain alternatives.
- Reference mismatch over an analog path is not a PCM checksum failure. Bit-exact claims require verified unchanged digital PCM and documented supported settings.
- Noise floor, distortion and output level are measurement-chain results until capture-path contributions are characterized.
- Numerical examples from brainstorming are illustrative, not product performance targets or measured facts.
- No overall 0–100 health, fine-control or keylock-quality score until thresholds and weighting are validated. v1.0 reports measurements and explicit test coverage.

## Sources and follow-up research

Verified 2026-10-06:
- [Serato: Using CD/media players with DVS](https://support.serato.com/hc/en-us/articles/115002460194-Using-Serato-DJ-CD-Media-Players-with-DVS): line-level setup, player keylock/FX disabled, and differing ABS/REL cue/loop behavior.
- [xwax: CDJ behaviours](https://wiki.xwax.org/cdj_behaviors): historical, model-specific limitations in control-CD reverse/transport behavior. Do not generalize its example to every current player.

Before model-specific implementation, obtain the relevant manufacturer's manual, supported media/output formats and firmware behavior. Before vendor decoder claims, establish availability and validation of each capability. This backlog makes no promise of universal player automation, internal optical-error counters or universal timecode decoding.
