# SPEC-35 Output audio-quality test

Status: implemented. Packaging: pure DSP `app/audio-quality.js`, runner `app/ui/devices/audio-runner.js`, method `audio:quality`. Size: L. Depends on: FS-00 audio_out (−12 dBFS cap), capture lease, calibration.js (marker alignment). No migration (results use `device_test_result`).

## 1. Summary
Plays one DeckChek stimulus program through the device's audio output and records it with an interface input (cable: device output → interface input; for an audio interface or all-in-one, its own out→in). Analyses the capture and produces objective output-quality measurements with pass/fail against thresholds.

## 2. Stimulus program (stereo, one buffer, one play call)
Fixed layout at sample rate `sr` (default 48 kHz); all segment levels ≤ −12 dBFS (the output cap). Segments in order, each with 5 ms raised-cosine edges:
1. lead silence 0.3 s; 2. alignment marker (`markerSignal`, 2–8 kHz chirp) then 0.15 s gap;
3. **silence 1.5 s** (noise floor, DC, hum);
4. **1 kHz both channels 2.0 s @ −20 dBFS** (gain, THD, THD+N, balance, polarity, dropouts);
5. **linearity**: 1 kHz 0.5 s @ −40 dBFS and 0.5 s @ −12 dBFS;
6. **frequency response**: stepped sines 0.4 s each @ −20 dBFS at 20, 50, 100, 200, 500, 1 k, 2 k, 5 k, 10 k, 15 k, 20 kHz (frequencies ≥ 0.45·sr dropped);
7. **crosstalk**: 1 kHz 1.0 s left only, then 1.0 s right only (other channel digital zero) @ −20 dBFS;
8. tail silence 0.3 s.

## 3. Analysis (all pure, deterministic)
Alignment by marker cross-correlation (`detectMarkerLag`); segment windows are trimmed 50 ms at each end.
- **Gain** `aq_gain_db` = capture tone level − stimulus level, per channel (informational; reports the mean).
- **THD+N** `aq_thdn_percent` = residual RMS after least-squares sine fit ÷ fitted RMS ×100 (`fitTone`), worst channel; `aq_thdn_db` = 20·log10 of the same ratio. **THD** `aq_thd_percent` from harmonics 2–9 (Goertzel on the fitted fundamental; harmonics ≥ 0.45·sr skipped).
- **Noise floor** `aq_noise_floor_dbfs` = A-weighted RMS of the silence segment (A-weighting by bilinear-transformed IEC 61672 poles, normalised to 0 dB at 1 kHz); `aq_noise_unweighted_dbfs` also reported. **SNR** `aq_snr_db` = tone RMS dBFS − A-weighted noise dBFS (worst channel). **DC** `aq_dc_offset_percent` of the silence segment; **hum** `aq_hum_db` via `humMetrics` relative to the tone.
- **Balance** `aq_balance_db` = L gain − R gain. **Polarity** `aq_polarity_inverted` (1 when correlation of captured vs stimulus < 0 on either channel).
- **Separation** `aq_separation_db` = driven-channel level − leaked level in the silent channel, worst of the two directions (fit at 1 kHz, amplitude only).
- **Frequency response**: each step's level relative to the 1 kHz level → `aq_response_flatness_db` = max |dev| over 100 Hz–10 kHz; `aq_response_low_db` and `aq_response_high_db` = deviation at the lowest/highest step; points kept in `extra.response`.
- **Linearity** `aq_linearity_db` = |gain(−12) − gain(−40)| (compression / limiter detection).
- **Clipping** `aq_clipping_samples` = capture samples ≥ 0.999 in the tone segments.
- **Dropouts** `aq_dropouts` = number of 1 ms windows in the 1 kHz segment whose RMS falls > 6 dB below the segment median, merged when adjacent, plus residual spikes > 8× residual RMS (glitches).
- Measurement quality: flag `uncalibrated-chain` unless a loopback calibration is supplied; optional `chainFloor.thdnPercent` is subtracted in quadrature (never below 0) and flagged `chain-corrected`. Uncertainty not claimed beyond the stated chain flag.

## 4. Default pass thresholds (auto test; DeckChek test definitions, not manufacturer specs)
`aq_thdn_percent <= 0.3` (major), `aq_snr_db >= 70`, `aq_separation_db >= 50`, `aq_balance_db abs<= 0.5`, `aq_response_flatness_db <= 1.0`, `aq_dropouts equals 0`, `aq_polarity_inverted equals 0`, `aq_linearity_db <= 0.5`, `aq_clipping_samples equals 0`. The dispatcher supports one `pass` per test, so `evaluateAudioQuality()` evaluates the whole list in the runner and returns the worst status (a clipped capture downgrades the verdict to REVIEW because the distortion figures are then invalid); `test.pass` stays null. Profile specs (`thd_n`, `snr*`, `freq_resp`, `crosstalk`) are quoted in findings when present for comparison, never silently used as thresholds.

## 5. UX (runner)
Cards: 0) *Time layout is independent of the sample rate*: the segment list is fixed in seconds; response steps at or above 0.45·sr stay in the layout but are silent and skipped, so a 44.1 kHz recording of the 48 kHz buffer analyses correctly. 1) Setup — output device picker (`audioOut.listOutputs`), input device/pair picker, level (default −20 dBFS, clamped to the cap), safety copy, wiring steps from the test; 2) Run — plays and records (`captureClip` with duration = stimulus length + 1 s, started first), progress bar, Stop; 3) Results — readouts, response plot (`linePlot`), findings with what/why/action, Save. States: unsupported (browser: "Audio quality test needs the desktop app"; offer *Analyse a recording* from a WAV via `decodeAudioFile` if the user already recorded it), no input/output, capture busy (lease message), marker not found, too quiet, clipped. Keyboard: Enter runs, Esc stops.

## 6. Acceptance criteria
- AC-1 Stimulus peak ≤ −12 dBFS and layout metadata is consistent (segments do not overlap, lie inside the buffer).
- AC-2 Given a synthetic device (known gain, harmonics, noise, low-pass, crosstalk, one dropout), the analyser recovers each metric within stated tolerance (gain ±0.05 dB, THD+N ±15 % relative, separation ±1.5 dB, flatness ±0.2 dB, dropout count exact).
- AC-3 A clean pass-through yields no findings and all thresholds pass.
- AC-4 An inverted-polarity, clipped or silent capture yields the matching finding, never a crash.
- AC-5 A-weighting matches IEC 61672 reference gains at 100 Hz (−19.1 dB), 1 kHz (0), 10 kHz (−2.5 dB) within 0.2 dB.
