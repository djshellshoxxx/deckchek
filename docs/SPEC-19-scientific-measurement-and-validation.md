# SPEC-19: Scientific Measurement and Validation

## 1. Scope

This supplements SPEC-01, SPEC-03, SPEC-05, SPEC-06, SPEC-07 and SPEC-08. [SCIENTIFIC-RESEARCH](SCIENTIFIC-RESEARCH.md) records sources, actual access and limitations. Requirements below are DeckChek design decisions, not performance claims from the cited studies.

## 2. Measurement contract additions

Extend result metadata without changing existing metric meanings:
- quantity and precise measurand definition;
- estimator/version, sample interval and valid-data fraction;
- nominal and calibrated timebase, calibration date and source;
- uncertainty status: quantified, partial, unknown or not applicable;
- standard uncertainty, expanded uncertainty, coverage factor and units when justified;
- uncertainty components with distribution/assumptions and correlations;
- weighting, detector statistic, window duration and exact standard edition, if any;
- reference-medium uncertainty and signal-chain provenance.

Unknown uncertainty is null with reason, never zero. Diagnostic confidence must not be described as a calibrated probability without validation. Historical results retain original method metadata.

## 3. Spectral levels and noise

Define the dBFS reference explicitly: full-scale peak convention and resulting sine RMS relationship. Distinguish bin amplitude, integrated band RMS power, power spectral density, dBV, dBTP and SPL. Physical units require the corresponding calibration.

Every spectrum preserves sample rate, FFT length, periodic/symmetric window definition, coherent gain, noise normalization, hop/overlap and averaging count. Zero padding changes display interpolation, not observation duration or inherent resolution.

Use calibrated tone estimates for amplitude/harmonics. Use appropriately normalized averaged periodograms for stationary noise; preserve band boundaries and effective averaging. Do not average dB magnitudes and call the result mean power.

Acceptance: coherent and off-bin tones recover calibrated amplitudes within a declared method tolerance; integrated PSD agrees with time-domain variance within tolerance; DC/Nyquist handling and window changes do not silently shift units. THD requires defined included harmonics and fundamental extraction; unknown musical content cannot provide conventional THD.

## 4. Speed and wow/flutter

Reference-tone speed uses observed frequency/reference frequency, with uncertainty from clock, reference record/tone, estimator and repeatability. A software loopback sharing the same DAC/ADC clock can reveal residual processing artifacts but cannot independently calibrate absolute clock accuracy.

Preserve demodulation bandwidth, smoothing, filter delay and invalid intervals. Dropout, clipping or insufficient carrier amplitude invalidates estimates rather than inserting zero deviation. Never reconnect unwrapped phase across a missing-data gap without marking it.

Create distinct method/metric labels for unweighted RMS, weighted RMS, quasi-peak, two-sigma statistic and other percentiles. Do not equate a 95th percentile or twice the standard deviation with the AES6 statistical detector without checking the normative definition.

AES6-2008 standardized mode requires its exact weighting tolerances, time response, statistical meter and measurement duration. The official abstract identifies the two-sigma statistical meter as preferred and the older quasi-peak meter as deprecated. Until the complete requirements are verified, display experimental method labels and disable manufacturer pass/fail comparisons based on claimed compliance.

Runout-click RPM follows SPEC-18 and supplies no intra-revolution flutter. Its sample timing resolution is not its total measurement accuracy.

## 5. Numerical uncertainty and comparisons

Define a measurement model and sensitivities for each calibrated metric. Combine components with covariance when applicable. Repeated samples from overlapping frames are not independent repetitions. A common systematic clock or reference bias does not shrink merely because a capture is longer.

A/B comparisons preserve shared calibration covariance, setup changes and repeatability. If a measured difference is too small relative to uncertainty, report "difference unresolved at this measurement precision". If uncertainty is unknown, avoid a precision-based ranking. Document any equivalence margin before testing; lack of a significant difference is not proof of equivalence.

## 6. Three vinyl evidence layers

Keep separate:
1. objective transient candidates and morphology;
2. perceptual prominence estimate, model version and listening assumptions;
3. cause hypotheses based on recurrence, replays and isolation tests.

A perceptually masked click can remain available for technical review without automatically reducing the DJ readiness score. An audible transient can still be music. A repeatable defect can originate in a pressing/master or playback chain, so repeated occurrence alone does not prove surface wear.

Candidate detector experiments compare high-pass/difference/MAD baseline, independently written LPC residual and optional wavelet/perceptual methods. Report CPU/memory and held-out errors; adopt additional complexity only when justified.

## 7. Labeling and corpus

Use both reproducible synthetic faults and licensed real recordings. Synthetic clicks include polarity, duration, amplitude and channel variation; include bursts, crackle, clipped music and buffer gaps. Real material covers DnB, hard trance, percussion, classical, vocals and intentional glitches.

Label event ranges, audible/not-audible/uncertain judgments, suspected cause and provenance separately. Keep annotator disagreements. Record audition gain, equipment, listening conditions and expertise; blinding/randomization follow principles informed by BS.1116, with adaptations documented.

Split by record/source recording and preferably pressing/setup, keeping related excerpts and repeat scans in one partition. Freeze a held-out set before threshold tuning. No test leakage from nearby excerpts.

## 8. Evaluation and reporting

Publish:
- event precision/recall with explicit one-to-one matching and timestamp tolerance;
- false positives per minute or hour;
- event localization error;
- clip-level hit/false-alarm rates separately;
- per-genre and signal-level performance;
- uncertain/unlabeled intervals excluded with counts;
- confidence intervals that respect recording-level grouping;
- operating thresholds and CPU/memory on recorded benchmark hardware.

Choose release thresholds before evaluating the held-out corpus; no literature percentage is automatically our acceptance threshold. An algorithm failure must remain visible and cannot be masked by a high composite score.

## 9. Physical cause validation

Groove-wear, mistracking, warp, cartridge and venue hypotheses require controlled alternatives. Compare the same side after cleaning, a different disc on the same chain, and a chain/cartridge change with settings recorded. Repeat runs and counterbalance order where practical.

High-frequency loss or inner-side distortion may reflect geometry, recording/mastering, alignment, stylus or chain response. Audio-only outputs are proxies with alternative explanations. Do not compute exact physical groove radius from linear elapsed-time interpolation; normalized position is primary unless measured geometry supports more.

## 10. Venue and future transfer measurements

Optional sensors store axis, mounting, sensitivity, units, calibration, sample rate and synchronization uncertainty. Audio dBFS cannot become acceleration or SPL without calibration. Coherence/correlation supports association, not cause by itself.

Future swept-sine tests record excitation, loopback reference, duration, levels, inverse-filter method, latency, system state and usable bandwidth. Validate with known linear filters, nonlinear synthetic systems and clock mismatch. Passive playback data is not a calibrated transfer function. Keep this work outside beta requirements until validated.

## 11. Release evidence

A scientific-method claim requires a trace from source to implementation, deterministic fixtures, independent checks, measured tolerance and real-data limitations. Exact standards clauses must be obtained before conformity claims. External applications can be comparators but are not automatically ground truth.

Store benchmark summaries and corpus/license manifests without publishing copyrighted music or restricted documents. Provide source links and concise original notes. A feature awaiting validation is experimental or unavailable, never reported as passed.
