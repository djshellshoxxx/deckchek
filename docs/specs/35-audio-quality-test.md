# SPEC-35 Output audio-quality test

Status: PARTIAL — software only. Ported selectively from PR9 (`a4d844b22df478a141c06a6561c941d6461a8aea`) with the capture/playback ownership and cancellation fixes in §7. The pure analysis, the session orchestration and the runner lifecycle are covered by automated tests with synthetic devices and injected I/O (`tests/audio-quality.test.mjs`, `tests/audio-session.test.mjs`, `tests/audio-runner-lifecycle.test.mjs`). There is **no hardware or loopback qualification**: no run against a real output/input pair, no comparison with a reference analyser, and the thresholds in §4 are DeckChek test definitions, not validated against measured devices. Packaging: pure DSP `app/audio-quality.js`, session `app/devices/audio-session.js`, runner `app/ui/devices/audio-runner.js` (`runAudio(host, ctx)`), method `audio:quality`, registered in `app/devices/library.js`/`dispatch.js` and the Devices screen's runner map. FS-34 auto-adds it (`auto-audio-quality`); when the profile does not record whether a controller has its own audio output, the test carries `params.condition` and the runner offers **Skip: no audio output**, which saves a skipped result instead of leaving the test unrun. The core browser smoke opens the DJM-A9 auto test in desktop mode (setup view only; the mock does not play). Size: L. Depends on: FS-00 audio_out (−12 dBFS cap), capture lease and live sessions, calibration.js (marker alignment). No migration (results use `device_test_result`).

## 1. Summary
Plays one DeckChek stimulus program through the device's audio output and records it with an interface input (cable: device output → interface input; for an audio interface or all-in-one, its own out→in). Analyses the capture and produces objective output-quality measurements with pass/fail against thresholds.

## 2. Stimulus program (stereo, one buffer, one play call)
Fixed layout in seconds at sample rate `sr` (default 48 kHz); the buffer peak is exactly 1.0 and audio_out applies the play level (≤ −12 dBFS) as gain, so every segment is at or below the output cap. Segments in order, each with 5 ms raised-cosine edges:
1. lead silence 0.3 s; 2. alignment marker (`markerSignal`, 2–8 kHz chirp) then 0.15 s gap;
3. **silence 1.5 s** (noise floor, DC, hum);
4. **1 kHz both channels 2.0 s @ −20 dBFS** (gain, THD, THD+N, balance, polarity, dropouts);
5. **linearity**: 1 kHz 0.5 s @ −40 dBFS and 0.5 s @ −12 dBFS;
6. **frequency response**: stepped sines 0.4 s each @ −20 dBFS at 20, 50, 100, 200, 500, 1 k, 2 k, 5 k, 10 k, 15 k, 20 kHz. The time layout does not depend on the sample rate: steps at or above 0.45·sr stay in the layout but are silent and skipped, so a 44.1 kHz recording of the 48 kHz buffer analyses correctly;
7. **crosstalk**: 1 kHz 1.0 s left only, then 1.0 s right only (other channel digital zero) @ −20 dBFS;
8. tail silence 0.3 s.
Levels above are for the default −12 dBFS play level; a lower play level (down to −60 dBFS) shifts every step by the same amount.

The downloadable WAV (`exportStimulus`) carries the level in its samples: it peaks at −12 dBFS, never full scale, and recordings of it are analysed with that level as reference.

## 3. Analysis (all pure, deterministic)
Alignment by marker cross-correlation (`detectMarkerLag`), searched over the first 2 s of a live capture and the first 10 s of a recording made elsewhere (`maxLagSec`); segment windows are trimmed 50 ms at each end.
- **Gain** `aq_gain_db` = capture tone level − stimulus level, per channel (informational; reports the mean).
- **THD+N** `aq_thdn_percent` = residual RMS after least-squares sine fit ÷ fitted RMS ×100 (`fitTone`), worst channel; `aq_thdn_db` = 20·log10 of the same ratio. **THD** `aq_thd_percent` from harmonics 2–9 (least-squares fits at the harmonics of the fitted fundamental; harmonics ≥ 0.45·sr skipped).
- **Noise floor** `aq_noise_floor_dbfs` = A-weighted RMS of the silence segment (IEC 61672 analogue A-weighting magnitude applied in the frequency domain to a Hann-windowed FFT block, normalised to 0 dB at 1 kHz); `aq_noise_unweighted_dbfs` also reported. **SNR** `aq_snr_db` = tone RMS dBFS − A-weighted noise dBFS (worst channel; relative to the −20 dBFS test tone, so it scales with the play level). **DC** `aq_dc_offset_percent` of the silence segment; **hum** `aq_hum_db` via `humMetrics` relative to the tone.
- **Balance** `aq_balance_db` = L gain − R gain. **Polarity** `aq_polarity_inverted` = 1 when the fitted 1 kHz phase of either channel differs from the stimulus phase by more than 90°.
- **Separation** `aq_separation_db` = driven-channel level − leaked level in the silent channel, worst of the two directions (fit at 1 kHz, amplitude only; flagged `noise-limited` above 100 dB).
- **Frequency response**: each step's level relative to the 1 kHz level → `aq_response_flatness_db` = max |dev| over 100 Hz–10 kHz; `aq_response_low_db` and `aq_response_high_db` = deviation at the lowest/highest step; points kept in `extra.response`.
- **Linearity** `aq_linearity_db` = |gain(−12) − gain(−40)| (compression / limiter detection).
- **Clipping** `aq_clipping_samples` = capture samples ≥ 0.999 in every driven segment (tone, both linearity steps, response steps, crosstalk), both channels.
- **Dropouts** `aq_dropouts` = number of 1 ms windows in the 1 kHz segment whose RMS falls > 6 dB below the segment median, merged when adjacent, plus residual spikes > 8× residual RMS (glitches).
- Also reported (informational): clock offset `aq_clock_offset_ppm`, playback-to-capture delay `aq_latency_ms`.
- Measurement quality: flag `uncalibrated-chain` unless a loopback calibration is supplied; optional `chainFloor.thdnPercent` is subtracted in quadrature (never below 0) and flagged `chain-corrected`. Uncertainty not claimed beyond the stated chain flag.
- Failed analyses (`BAD_INPUT`, `NO_SIGNAL`, `NO_MARKER`, `CAPTURE_TOO_SHORT`) return no measurements: nothing is saved.

## 4. Default pass thresholds (auto test; DeckChek test definitions, not manufacturer specs)
`aq_thdn_percent <= 0.3` (major), `aq_snr_db >= 70` (major), `aq_separation_db >= 50` (major), `aq_balance_db abs<= 0.5` (minor), `aq_response_flatness_db <= 1.0` (minor), `aq_dropouts equals 0` (critical), `aq_polarity_inverted equals 0` (major), `aq_linearity_db <= 0.5` (minor), `aq_clipping_samples equals 0` (major). Unchanged from PR9. The dispatcher supports one `pass` per test, so `evaluateAudioQuality()` evaluates the whole list in the runner and returns the worst status (a clipped capture downgrades the verdict to REVIEW because the distortion figures are then invalid); `test.pass` stays null. Profile specs whose key matches `thd`, `snr`, `noise`, `freq_resp`, `crosstalk` or `dynamic` are quoted in findings when present for comparison, never silently used as thresholds.

## 5. UX (runner)
1) Setup — output device picker (`audioOut.listOutputs`), input device and input-pair picker, peak level (default −12 dBFS from `test.params.levelDbfs`, clamped to −60…−12; non-numeric values give −12), safety copy (`SAFETY_COPY`), calibration status, wiring steps from the test; 2) Measure — records first, then plays (status text per phase, safety copy, **Stop**); 3) Results — readouts, response plot (`linePlot`), findings with what/why/action; saved to the unit only when the analysis produced measurements. States: browser preview (play/record unavailable: *Save test signal (WAV)* and *Analyse a recording* via `decodeAudioFile` remain), no input/output, capture busy ("Stop <holder> and continue" through `runWithCapture`), capture preempted or lost, marker not found, too quiet, clipped; every failure says nothing was saved and offers Try again.

Not implemented from the original plan: a progress bar (phase text instead) and the Enter/Esc shortcuts (the Run and Stop buttons are keyboard-operable).

## 6. Acceptance criteria
- AC-1 Stimulus peak ≤ −12 dBFS as played (and in the exported WAV) and layout metadata is consistent (segments do not overlap, lie inside the buffer).
- AC-2 Given a synthetic device (known gain, harmonics, noise, low-pass, crosstalk, one dropout), the analyser recovers each metric within stated tolerance (gain ±0.05 dB, THD+N ±15 % relative, separation ±1.5 dB, flatness ±0.2 dB, dropout count exact). The tests check THD (harmonics 2–9) within ±10 % of the analytic value and THD+N ≥ 0.95 × THD.
- AC-3 A clean pass-through yields no findings and all thresholds pass.
- AC-4 An inverted-polarity, clipped or silent capture yields the matching finding, never a crash.
- AC-5 A-weighting matches IEC 61672 reference gains at 100 Hz (−19.1 dB), 1 kHz (0), 10 kHz (−2.5 dB) within 0.2 dB.
- AC-6 Ownership (§7) holds under the regressions listed there.
- AC-7 (open) Hardware/loopback qualification: run on at least one real output → input chain, compare against the loopback calibration and a reference measurement, and confirm the thresholds. Not done.

## 7. Capture and playback ownership
- The capture is a live session (`startLiveSession`), whose stop/cancel name its own lease and can never stop or return another feature's capture. PR9 used the bounded `captureClip`, which cannot be cancelled by its owner (only a global preempt ends it); it was replaced so that Stop, dispose and failures release the input at once.
- Recording must be running before anything plays. A capture that cannot start (busy, no device, permission, preempted) rejects before playback; a preempt (`onPreempted`) or loss (`onStatus` running = false) during the lead-in or playback ends the run, stops this run's voice and analyses nothing.
- Cancelling (Stop, leaving the screen, a newer action) aborts the run's `AbortSignal`: it stops only the playback handle this run started and cancels only the capture session it started; `audioOut.stopAll()` is never called. A `playBuffer` or capture start that resolves after cancellation is stopped/cancelled as soon as it arrives; a playback result without a handle is left to end on its own (one-shot buffer) and never triggers a stop-all.
- Every action takes a runner generation; every await re-checks it, so late capture, analysis or file-decode completions from a disposed runner or a superseded action never render, toast or call `ctx.finish`.
- A failed attempt saves nothing and leaves no capture behind, so Try again works immediately.

## 8. Changes from PR9 and open items
- Measurement definitions and thresholds are PR9's, with one definition change: clipping is counted in every driven segment, not only the −20 dBFS tone (PR9 missed an input that overloads only on the −12 dBFS linearity step and then failed the device for "compression"; the spec text already said "tone segments").
- New: `safePlayLevel` (non-numeric levels → −12; PR9 sent NaN), explicit `capDbfs: -12` on the play call, `exportStimulus` (the PR9 WAV was full scale, 0 dBFS), `maxLagSec` for recordings made elsewhere, `qualityResult` shared by the live and file paths.
- Spec text corrected to match the PR9 code: A-weighting is applied in the frequency domain (not bilinear-transformed poles), THD harmonics use least-squares fits (not Goertzel), polarity uses the fitted phase, and the default play level is −12 dBFS (the earlier text said −20).
- Open: hardware/loopback qualification (AC-7); the PR9 `audio:quality` dispatch/validation test belongs with the library/dispatch wiring.
