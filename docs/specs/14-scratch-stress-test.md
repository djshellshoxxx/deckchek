# SPEC-14: Scratch Stress Test

## 1. Summary, Goals, Non-goals

A guided test in which the user performs standard scratch patterns (baby scratch, transform, chirp) in time with a metronome while DeckChek recovers the platter velocity and direction from the timecode quadrature phase, then measures tracking quality: lost-lock periods, direction errors, recovery time and needle skips. It scores each cartridge, control vinyl and setup. It deepens SPEC-02 section 13.

Goals: objective, repeatable scratch-tracking score; separate causes (cartridge/needle skip, vinyl, interface/software latency). Non-goals: not a measure of scratching skill; DeckChek does not read the DJ software's own position; no judgement of musical timing beyond metronome alignment for repeatability.

## 2. Users & user stories

- US-1: As a scratch DJ I want to compare two cartridges objectively.
- US-2: As a DJ I want to know if my vinyl or setup loses lock during fast scratches.
- US-3: As a technician I want a repeatable stress protocol.

- AC-1: Given a timecode format and 90 s protocol, when run, then three patterns (baby, transform, chirp) are presented at selected BPM (default 90) with metronome clicks to the headphone/monitor output, each 20 s performed plus 5 s rest.
- AC-2: Given the capture, velocity v(t) (in units of nominal speed, signed) is estimated every 5 ms from the quadrature phase, direction reversals are listed with time, peak velocity, and duration.
- AC-3: Lost-lock periods (carrier SNR or level below threshold for >= 10 ms) are counted with longest duration and recovery time (time to stable direction and SNR above threshold).
- AC-4: Direction errors are events where estimated direction contradicts the inferred direction by continuity (single-window flips lasting < 2 windows during fast motion).
- AC-5: Needle skips are detected as an abrupt carrier-phase/amplitude discontinuity with level drop then the groove position jump (see section 6) and are reported separately and drive a safety stop recommendation.
- AC-6: A score 0-100 with components is produced and stored against cartridge asset, control vinyl copy and setup; comparisons across entities available.
- AC-7: Esc aborts at any time and mutes the metronome output within 100 ms.
- AC-8: The test refuses to start if baseline SNR (3 s needle-down, platter running) is below 25 dB, showing the fix actions.

## 3. UX

Entry: DVS screen > "Scratch stress test"; Equipment cartridge > "Compare"; Pre-gig optional.
Flow: (1) Safety and setup: choose setup (cartridge, vinyl, mixer, software), BPM, pattern set, metronome output, headphone volume low reminder; "Use a spare control vinyl, not your best one. Heavy scratching wears the groove." (2) Baseline: 3 s steady playback, gate AC-8. (3) Guided pattern: big pattern diagram with scrolling beat grid, count-in (4 clicks), live velocity trace and lock indicator; Space pause/skip pattern. (4) Result: score card, per-pattern table, timeline of velocity with markers (reversal, loss, skip), compare tab. 
States: empty (no setup: wizard), loading, success, partial (aborted: scored from completed patterns, labelled), error (no signal), offline n/a, unsupported (no input: disabled).
Copy: "Lock lost 3 times (longest 42 ms). Recovery 18 ms median. Needle skipped once at 1:12 - check tracking force." Shortcuts: Space, Esc, Enter next, M mute metronome. A11y: metronome is audible plus visual flash (reduced-motion: static bar highlight); optional haptic not applicable; results as table.

## 4. Architecture

JS:
- `app/scratch.js` (pure): `instantVelocity({left,right,sampleRate}, {format, winMs:5, hopMs:2.5}) -> {t[],v[],snr[],level[]}`, `detectReversals(vel, {minPeak, minGapMs}) -> Reversal[]`, `detectLockLoss(trace, thr) -> Loss[]`, `detectDirectionErrors(...)`, `detectSkips(...)`, `scoreScratch(events, protocol) -> {score, components}`, `PROTOCOL_V1`, `metronomeSchedule(bpm, pattern) -> ClickEvent[]`.
- `app/ui/workflows/scratch.js`, `app/ui/screens/dvs.js` addition.
- Metronome via WebAudio `AudioContext` (scheduled clicks, lookahead 100 ms, `setSinkId` for output device where available).
Reuses `findFormat`, `analyzeTimecode` (baseline and SNR), `toneAmplitude`/`fitTone` for carrier phase, `dvsIntegrityTimeline`, `subsonicPeak`, `compareEventMaps`.
Rust: none required for DSP; `start_live_capture` with `max_seconds` 120. Commands `scratch_save(run)`, `scratch_list(filter)`, `scratch_get(id)`. Deps: none.

## 5. Data model

`NNNN_scratch_stress.sql`:
```sql
CREATE TABLE IF NOT EXISTS scratch_run (
  id TEXT PRIMARY KEY, session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  setup_id TEXT REFERENCES setup(id), cartridge_asset_id TEXT REFERENCES asset(id),
  record_side_id TEXT REFERENCES record_side(id), format TEXT NOT NULL,
  bpm REAL NOT NULL, protocol_version INTEGER NOT NULL, completed INTEGER NOT NULL DEFAULT 1,
  score REAL, components_json TEXT NOT NULL DEFAULT '{}',
  lock_losses INTEGER, longest_loss_ms REAL, median_recovery_ms REAL,
  direction_errors INTEGER, skips INTEGER, reversals INTEGER, peak_velocity REAL,
  tracking_force_g REAL, tonearm_note TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scratch_event (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES scratch_run(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('reversal','lock_loss','direction_error','skip','recovery')),
  t_ms REAL NOT NULL, duration_ms REAL, value REAL, detail_json TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS idx_scratch_run_entities ON scratch_run(cartridge_asset_id, record_side_id, setup_id, created_at);
```
Protocol JSON `PROTOCOL_V1`: `{"v":1,"patterns":[{"id":"baby","beats":"1 fwd + 1 back per quarter"},{"id":"transform","beats":"8th-note gate"},{"id":"chirp","beats":"half-note"}],"bpm":90}`; versioned so scores are comparable only within a version.

## 6. Algorithms

Velocity from quadrature: form complex signal z[n] = L[n] + j R[n] (carrier with 90 deg phase between channels; sign of L/R phase = direction, existing `tc_phase_deg` sign convention in `analyzeTimecode`). Unwrap phase phi[n] = angle(z[n]) with analytic bandpass about expected carrier f_c; instantaneous frequency f_i = (1/2pi) dphi/dt (positive or negative); velocity v = f_i / f_c in units of nominal speed (so +1 = normal forward, -1 = normal reverse, 0 = stopped). Estimate with 5 ms window, 2.5 ms hop (about 12 carrier cycles at 2.5 kHz, 5 at 1 kHz), noting a lower cycle count lowers resolution at 1 kHz; tunable. Resolution: v std approx sqrt(6)/(pi*N_cycles*SNRlin) (Cramer-Rao style, same family as `frequencyEstimatorStdHz`). Amplitude envelope also gives speed since carrier amplitude varies with groove velocity (magnetic/ velocity transducer): use as secondary check.
Reversal: sign change of v through |v| < v0 (default 0.1) with preceding and following magnitude > 0.3; reversal duration = time between crossing 0.3 on each side. Direction error: continuity model - at a reversal the velocity must pass through zero; a sign flip with |v| > 0.5 on both sides within two hops is an error. Lost lock: min channel RMS or carrier SNR below baseline - 12 dB (same default as `dropoutDb`) or SNR < 10 dB for >= 10 ms; recovery = lock loss end to first window with SNR >= 20 dB and consistent v for 20 ms.
Needle skip: simultaneous (a) amplitude drop to < -20 dB for 2-50 ms followed by (b) carrier phase jump not explained by smooth velocity (|dphi| > pi/2 beyond expected), and (c) subsequent "ringing" - low-frequency 8-20 Hz burst (`subsonicPeak`-style). UNKNOWN thresholds - needs calibration with deliberate skips on a sacrificial record.
Score (tunable; mirrors SPEC-02 s13.4): continuity 30 (1 - loss_time/total_active), recovery 20 (median recovery <= 20 ms full, >= 200 ms zero), direction accuracy 25 (errors per reversal), signal stability 15 (median SNR 25 dB full, 15 zero), skips 10 (any skip = 0, and caps total at 60). Metronome adherence is reported but not scored. Latency compensation: the user's performed beat vs click is only informational.
Repeatability: three repeat runs per entity recommended; compare with `repeatabilityMetrics` (mean, std) and show "difference is within run-to-run noise" if |delta| < 2 std.

## 7. Error handling, edge cases, privacy

Safety: spare control vinyl; keep monitor and headphone low (metronome at -24 dBFS default, hard max -6 dBFS); warn on possible record/stylus damage and skipping into a groove; stop test if 3 skips occur ("Stop - check tracking force and cartridge alignment"). Sudden loud noise from lock loss in software is not DeckChek output. Capture while platter stopped: baseline fails. DJ software may need to be closed to free the input; documented. Audio timing jitter of WebAudio does not affect score. Data local; no raw audio retained unless opted-in. Imported runs validated.

## 8. Test plan

Unit: synthetic quadrature with programmed velocity profile (sinusoidal baby scratch +/-2x) recovers v with error < 3 % at SNR 30 dB; reversal count exact; injected 30 ms dropout detected with duration +/- 5 ms; injected phase jump flagged as skip, a smooth fast reversal not flagged; score monotonic; metronome schedule timing exact for 90 and 120 BPM; 1 kHz vs 2.5 kHz formats.
Rust: migration, CRUD, cascade delete.
UI smoke: wizard, abort mutes metronome, results table.
Windows CI: migration.
Manual: SL-1200MK4 + CV02.5 + Twelve MK2 in Serato; Audio 8 + MK2 vinyl in Traktor; run three repeats on each of two cartridges; verify DeckChek lock-loss events correlate with audible dropouts / software deck stutter; sacrificial record skip test; compare vs Serato's scope display.

## 9. Definition of done

- [ ] AC-1..AC-8; [ ] velocity accuracy tests; [ ] skip thresholds calibrated on real gear; [ ] safety copy reviewed.
Rollout: flag `features.scratchTest`. Docs: SPEC-02 s13 updated to reference this spec; FEATURE-MATRIX.

## 10. Dependencies, risks, open questions, effort

Depends on SPEC-02 timecode engine, SPEC-12 (cartridge assets), SPEC-13 (vinyl copies), SPEC-11 (latency for context). Risks: DJ software contending for the audio device; 5 ms window limits velocity accuracy at 1 kHz; skip detection unvalidated. Open: should a skip-stress also modify the default sampling window. Effort: L (about 40 agent-hours).

## 11. Research notes

- Quadrature direction/phase approach and formats: repo `app/timecode.js`; xwax https://github.com/xwax/xwax and Mixxx DVS internals https://mixxx.org/news/2021-12-22-dvs-internals-pt2/ (cited by repo; not re-opened this session).
- No external source on scratch-pattern tracking benchmarks found; thresholds are tunable defaults.
