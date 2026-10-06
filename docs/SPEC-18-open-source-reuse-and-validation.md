# SPEC-18: Open Source Reuse and Validation

## 1. Purpose and status

Convert [open source research](OPEN-SOURCE-RESEARCH.md) into implementable integration requirements. This supplements SPEC-00 through SPEC-17 without expanding beta scope. These are requirements, not claims that dependencies or features are implemented.

## 2. Component selection

Prefer native Rust components for the existing Tauri/Rust/TypeScript design. Evaluate CPAL for capture, hound for WAV and RustFFT for FFT. Keep each behind a DeckChek interface. Use pinned package versions and a committed dependency lockfile once code exists. Adopt alternatives only when a recorded benchmark or missing capability justifies them.

Optional imports may use Symphonia; optional resampling may use rubato. Neither may silently alter the canonical measurement stream. The free browser MIDI Tester remains separate; native Controller edition may evaluate midir.

Dependency evaluation must record supported operating systems, minimum toolchain, enabled features, backend, sample formats, stable identifiers available in the chosen version, disconnect behavior, maintenance status and measured CPU/memory behavior.

## 3. Audio and file boundaries

The capture callback sends sample-indexed PCM and discontinuity metadata to a bounded queue. It performs no disk writes, database operations or UI work. Queue exhaustion increments an explicit dropped-frame count; affected time ranges are invalid for continuity-sensitive measurements.

Preserve original channel order, sample rate and capture samples. Derived resampled streams carry original-to-derived index mapping, filter delay and resampler method/version. Clock-drift compensation is allowed for monitoring, but must not erase instability from speed/wow/flutter analysis.

Standard RIFF WAV has an approximately 4 GiB size boundary. At 96 kHz stereo 32-bit, payload is 768,000 bytes/second; 30 minutes is 1,382,400,000 bytes. At 192 kHz stereo 32-bit, approximately 47 minutes reaches 4 GiB. Preflight storage and segment before the limit or use a validated RF64-capable writer. Segments share capture ID and absolute starting sample; header finalization and crash recovery must be tested.

## 4. Runout-click RPM method

Identifier: speed.runout_interval.v1.
Input: independently timestamped impulse candidates, channel identity, sample rate/timebase provenance and nominal RPM.

Require at least three accepted clicks for a qualified result; two may show a provisional single interval. Validate finite values, increasing indices and plausible periods. Missing revolutions must be flagged rather than interpreted as sudden half-speed. Preserve rejected candidates and inferred missing revolutions separately.

Outputs:
- each accepted interval and per-revolution RPM = 60 / interval_seconds;
- arithmetic mean of per-revolution RPM;
- overall rate = 60 * accepted_revolution_count / elapsed_seconds, only when revolution counts are established;
- spread and estimated timing/clock uncertainty;
- interval count and quality flags.

Do not conflate mean inverse interval with inverse mean interval. Do not output flutter, instantaneous intra-revolution speed or standardized weighted wow from this method. UI label: "RPM from once-per-revolution clicks". Allow L and R separately; summed-channel analysis must record that choice.

If source logic is adapted from TurntableRPMAnalysis, identify the port, retain Scott McClements' MIT license and document corrections. No adaptation was imported by the research change.

## 5. Tone speed and wow/flutter

Record carrier nominal frequency, observed mean, demodulation method, valid samples, analysis bandwidth, weighting, detector type, integration/window duration and calibration floor. RMS, peak, quasi-peak and percentile values have different metric keys.

First beta method may be explicitly unweighted/experimental. A named standard requires the exact edition, weighting tolerance, detector/time constants, duration, test-medium uncertainty and validation results. Matching WFGUI alone is insufficient. Do not import zolt8's inherited WFGUI code until upstream permission is established.

## 6. Vinyl event detection

The first detector emits impulsive candidates using residuals and robust local thresholds. An independently written LPC detector may be added only if evaluation improves precision/recall or clearly documents a different tradeoff.

Each event contains raw sample range, channels, detector version, threshold/context, signal-quality flags and morphology. Overlapping windows must not double-count a click. State resets after discontinuity and new capture; frame-local offsets must map to capture-wide sample indices.

Require negative fixtures containing drums, rimshots, handclaps, hard trance, DnB, distorted music and deliberate glitches. A candidate is not automatically a scratch. Repeated morphology at revolution-period intervals supports a hypothesis; repeated scans and controlled chain swaps provide stronger evidence. No restoration is part of this integration spec.

## 7. Repeat-scan alignment

Identifier: alignment.landmark_local.v1 for an independently validated port or implementation.
Stages: coarse spectral landmarks, offset candidates, local fine correlation, drift-aware piecewise mapping.

Return matched spans, forward and inverse maps where valid, anchor confidence, residual timing error and unmatched/discontinuous spans. Reject unrelated sides and abstain on ambiguous musical loops. Do not interpolate through a detected skip as if it were ordinary drift.

Store the mapping and method version. Preserve original event timestamps; aligned display positions are derived. Mark before/after cleaning comparisons inconclusive when alignment uncertainty exceeds the event-matching tolerance.

An audfprint-derived port retains Dan Ellis' MIT attribution. Neither cloud song recognition nor FFmpeg/Python is required by this feature.

## 8. DVS capability contract

Every analyzer publishes:
- generic_scope;
- carrier_estimation;
- direction_estimation;
- relative_speed;
- absolute_position_decode;
- decoder_lock;
- supported_media_profiles.

Unavailable decoder outputs are null with reason, never zero or a generic signal score mislabeled as readable percentage. Pin media family, pressing/edition, side and decoder version. Synthetic quadrature tones validate generic scope only, not vendor absolute decoding.

No GPL/AGPL core import or language translation is approved by this spec. External comparison against xwax/Mixxx remains distinct from bundled integration. A separately licensed decoder can be added later with its own reviewed distribution design.

## 9. License and provenance record

Before copying or adding any dependency, record repository URL, exact upstream commit or released version, file paths, hashes, license expression, selected dual-license option, copyright/notice files, modifications and transitive components.

Permissive imports retain required notices. MPL-covered files remain identified with source availability instructions when distributed. EPL additions require a component-specific compliance plan. Public source with no verified grant is not approved for copying. A permissively labeled fork with unresolved inherited rights is also not approved.

Do not copy test audio, logos, manuals, screenshots or vendor control-signal files merely because code is open source. Generate reproducible synthetic fixtures or record separately licensed assets.

Release packages must include actual third-party notices and any applicable source availability materials. A candidate registry must not pretend unintegrated libraries ship with the app.

## 10. Acceptance gates

- Supported Windows capture devices run at 48 and 96 kHz stereo; device loss and queue overflow surface valid quality flags.
- FFT magnitude/window calibration is verified with known-amplitude tones and noise.
- Long capture segmentation preserves sample count and event coordinates without boundary duplication.
- Runout fixtures at 33 1/3 and 45 RPM reject missing/extra/negative-polarity click mistakes; no flutter result is emitted.
- Tone fixtures vary modulation rate/depth, amplitude, drift, noise and dropouts; report uncertainty and measured tolerance.
- Detector precision/recall and percussive false positives are reported on a labeled held-out corpus. Thresholds are versioned.
- Alignment tests cover offset, small speed mismatch, drift, cleaning changes, unrelated audio, intentional loops and skips; failures abstain.
- Generic DVS mode cannot display fictitious position or decoder-lock success.
- Every integrated/copied component has a pinned provenance entry, required notices and feature-specific license review.

These gates supplement SPEC-08 and SPEC-17. Existing synthetic tests remain necessary; agreement between two related implementations is not an independent oracle.
