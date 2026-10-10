# SPEC-15: Booth Feedback and Hum Hunter

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0012_hum_feedback.sql`. Milestone: M6. Size: L. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

## 1. Summary, Goals, Non-goals

A guided finder for ground-loop hum and low-frequency/booth feedback. For hum it walks through step-by-step disconnect / ground-lift isolation, measures the 50/60 Hz family and harmonics at each step and follows a decision tree to the likely source. For feedback it runs a controlled, very-low-level step test with a safety limiter and abort. It extends SPEC-05 (venue diagnostics, s8 and s23) with a hum workflow.

Goals: locate the stage at which hum appears or vanishes; distinguish ground loop vs. induced hum vs. turntable ground vs. device; safely find the level and frequency at which feedback starts; give booth monitor guidance.
Non-goals: no instructions to defeat safety earths or modify mains wiring (ground-lift on the mains plug is never advised; "ground lift" means the audio-equipment ground-lift switches/DI); no control of venue PA; no SPL claims without a calibrated meter (SPEC-05 s8.4).

## 2. Users & user stories

- US-1: As a DJ I get hum when I plug the turntable into the mixer and want to find why.
- US-2: As a DJ I get rumble/howl in the booth monitors at high volume and want a safe test.
- US-3: As a technician I want a record of each isolation step.

- AC-1: Given a live input, DeckChek shows live hum level: mains fundamental (50 or 60 Hz, auto detected), 2nd-6th harmonics, and total hum relative to the noise floor.
- AC-2: Given the isolation procedure, for each step the app records a 5 s measurement and shows delta vs the previous step; a drop >= 6 dB after a step is marked "hum source is downstream of this connection".
- AC-3: Given the final analysis, the decision tree returns a ranked cause list (e.g. ground loop between turntable and mixer; phono ground wire missing; unbalanced cable pickup; USB/laptop charger ground; lighting/dimmer interference), each with confidence and the next action.
- AC-4: Given the feedback test is started, then the output level begins at the lowest start (-60 dBFS) and rises in 3 dB steps only on user confirmation, never above the configured cap (default -30 dBFS), and a software limiter prevents peaks above the cap.
- AC-5: Given a narrowband peak grows > 6 dB across two consecutive 1 s windows or the howl detector fires, then output ramps to silence in < 100 ms and the step is marked "feedback onset" with frequency and level step.
- AC-6: Esc or the on-screen STOP always mutes immediately.
- AC-7: Results save to the venue session (SPEC-05 s19) and appear in the venue report.

## 3. UX

Entry: Venue screen > "Hum and feedback"; Quick Check card "Hum?"; FS-10 hum warning "Find the cause".
Flow Hum: (1) Setup: input channel, expected mains (auto, user may override), safety text. (2) Baseline 1: "Disconnect everything from the mixer input except the cable under test; set the channel fader up, gain at normal". (3) Guided steps (each Next after a 5 s measurement): A. mixer alone (nothing plugged in, gain up) - tests mixer/interface; B. add deck cables without turntable ground; C. connect turntable ground wire to the mixer GND terminal; D. add laptop USB (on battery); E. add laptop charger; F. add other gear; G. ground-lift/DI step where present. Each step has an illustration/ text and a Skip. (4) Result: hum-level timeline (bar per step), cause list, "what to try".
Flow Feedback: (1) Setup: pick output route (computer to a mixer channel) and input (booth mic or mixer record out; noted), cap, step size; checklist "Master and booth volume low; stay near the controls; the app will not exceed the cap but the mixer gain will" (2) Run: slow steps, live spectrogram, STOP always visible. (3) Result: onset step, frequency (e.g. 63 Hz), growth rate, guidance.
States: empty (no input), loading, success, partial (steps skipped), error (clipping/no signal), offline n/a, unsupported (no output device: feedback test disabled, hum works with input only).
Copy: "Hum dropped 18 dB when the turntable ground was connected. The turntable ground wire was open." Shortcuts: Space next, S skip, Esc stop, I inspector. A11y: live hum bar plus numeric dB; STOP button 44 px and always the first tab stop in run view; no autoplay audio; text alternatives for spectrogram.

## 4. Architecture

JS:
- `app/hum.js` (pure, shared with FS-10; owned by FS-00 §4.6, single signature): `humMeasure(samples, fs, {mains, harmonics:8}) -> {mainsHz, fundamentalDbfs, harmonics:[{n,hz,dbfs}], totalDbfs, floorDbfs, humToFloorDb, oddEvenRatio}` using `fitTone`/`toneAmplitude` at k * f_mains for k = 1..8 and a local-median floor; `detectMains(samples, fs)` compares 50 vs 60 Hz (+100/120).
- `app/hum-tree.js`: `HUM_STEPS`, `rankCauses(stepResults) -> Cause[]`, `deltaDb(prev, cur)`.
- `app/feedback.js`: `stepPlan({startDbfs:-60, stepDb:3, capDbfs:-30})`, `detectHowl(spectraHistory) -> {onset:boolean, freqHz, growthDbPerS}`, `limiter(buffer, capDbfs)`, `rampToSilence()`.
- `app/ui/workflows/hum.js`, `app/ui/workflows/feedback.js`.
Rust: output playback uses the shared FS-00 `audio_out.rs` engine (job F1-audio-out): `audio_play_tone(device?, spec:{type:'pinkband'|'sine', freqHz?, levelDbfs, capDbfs, rampMs}) -> {handle}`; `audio_set_level(handle, levelDbfs)` (clamped in Rust to cap); `audio_stop(handle)` (fade 20 ms); `list_native_audio_outputs()`. The safety limiter and the hard-coded absolute max -12 dBFS live in Rust so a JS bug cannot exceed the cap. Verified: the repo has no Rust output path today (cpal 0.16 is used for input only; `app/ui/audio-io.js playStereo` is WebAudio), so F1-audio-out builds it. Reuses `start_live_capture` under the capture lease. Deps: none new.

## 5. Data model

`0012_hum_feedback.sql`:
```sql
CREATE TABLE IF NOT EXISTS hum_run (
  id TEXT PRIMARY KEY, session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  venue_id TEXT REFERENCES venue(id) ON DELETE SET NULL, setup_id TEXT REFERENCES setup(id),
  kind TEXT NOT NULL CHECK (kind IN ('hum','feedback')), mains_hz INTEGER,
  verdict TEXT, causes_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hum_step (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES hum_run(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, step_id TEXT NOT NULL, label TEXT NOT NULL,
  fundamental_dbfs REAL, harmonics_json TEXT NOT NULL DEFAULT '[]', total_dbfs REAL,
  floor_dbfs REAL, delta_db REAL, level_dbfs REAL, peak_hz REAL, growth_db_per_s REAL,
  onset INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0, note TEXT);
```
`HUM_STEPS` JSON in code, versioned `v1`.

## 6. Algorithms

Hum: for mains f in {50, 60}, fit sinusoids at f, 2f..8f over a 5 s window via least squares (`fitTone`; DC removed; window an integer number of cycles to avoid leakage); fundamental and harmonic amplitudes in dBFS; floor = median of FFT/Goertzel bins 20 Hz away excluding multiples; humToFloor = total hum - floor. Mains auto-detect: larger of the 50 and 100 Hz vs 60 and 120 Hz amplitudes; mains frequency is regional (50 Hz in Europe/much of world, 60 Hz North America) - search snippets only.
Interpretation (heuristic, snippet-level support): ground-loop hum is dominated by fundamental and low harmonics; rectifier/power-supply buzz (switch-mode, dimmer) is rich in higher harmonics (odd/even ratio and harmonics above 5th); a consumer article claims ground loop appears at 120 Hz vs 60 Hz - treated as simplified, not used as sole discriminator. Step delta: delta = total(step) - total(previous); drop >= 6 dB is "source isolated"; rise >= 6 dB is "this connection introduces hum". Unchanged under gain=0 means hum is after the gain stage; changes with fader/gain means upstream (decision tree nodes).
Turntable ground wire checks: step "Lift the turntable ground wire from the mixer GND terminal": hum rises >= 10 dB with needle on the record or shorted input -> ground was working; no change -> wire not making contact (check terminal, shell contact, turntable cable ground pin). Wiring of RCA shield ground is not modified by the user; ground-lift switch on DJ mixer only if the device has one, per its manual.
Feedback: output reference = sine or 1/3-octave pink band centered 40-200 Hz sweep (user choice) at start level -60 dBFS; every 4 s measure the spectrum of the input (Welch, 8192 pt at 48 kHz, 5.9 Hz bin). Howl detector: peak-to-median ratio > 15 dB narrowband (< 3 bins) AND growth >= 6 dB over 2 s while output constant, or total level exceeds the previous step by > step + 6 dB. On detect: ramp silence 20-100 ms, mark onset. Feedback loop gain ~ 0 dB criterion: report "loop gain margin" = (onset step - last stable step) in dB (3 dB resolution). Level stored ordinal plus dBFS of output; no SPL.
Room/booth monitor guidance generated from the onset frequency: under 120 Hz -> decouple turntable (isolation feet, heavier base, SPEC-05 s16), move monitor off the surface, lower bass, high-pass the booth monitor around 80-100 Hz; mid frequency -> aim monitors away from the cartridge, increase distance, use cardioid placement. Treated as advice, not measurements.
Uncertainty: amplitude std for 5 s windows from `frequencyEstimatorStdHz`/`levelUncertaintyDb`; deltas below 1 dB are "no change".

## 7. Error handling, edge cases, privacy

Safety: hard absolute output cap -12 dBFS; default -30; step 3 dB; ramps; fault in capture (no input data > 1 s) => mute; app focus loss does not stop (user may be at mixer) but a 60 s inactivity timeout mutes. Never auto-raise mixer/PA levels; DeckChek controls only its own digital level. Warn about hearing and speaker damage; recommend headphones off the ears during any step. Mains frequency indeterminate (battery laptop near generator): show both. Laptop charger noise: guide the user to repeat on battery. No wiring modification instructions beyond reading manuals; never advise cutting/lifting the safety earth plug. Data local.

## 8. Test plan

Unit: `humMeasure` on synthetic 50 Hz + 3 harmonics at known levels within 0.3 dB; 60 Hz auto-detect; leakage immunity with non-integer window; rankCauses on fixtures (drop at ground-wire step -> turntable ground cause); delta classification; limiter never exceeds cap for adversarial buffers; detectHowl on synthetic exponential growth vs steady tone vs music; plan never exceeds cap.
Rust: `audio_set_level` clamps; `audio_stop` idempotent; mute timeout.
UI smoke: hum flow with mocked measurements; STOP first tab stop; Esc.
Windows CI: cap clamp test.
Manual: SL-1200MK4 with and without ground wire into Twelve MK2 and DJM-A9 (phono input) and Xone:23C; record steps; compare with expectation; remove USB charger; feedback test with Pioneer monitors at low master, confirm abort < 100 ms using a loop recording; verify onset for deck on a flexible table vs isolated.

## 9. Definition of done

- [ ] AC-1..AC-7; [ ] hard cap verified in Rust; [ ] decision tree reviewed; [ ] manual run on three mixers.
Rollout: flag `features.humHunter` (feedback part behind separate flag `features.feedbackStep`). Docs: SPEC-05 s8/s23 cross-reference.

## 10. Dependencies, risks, open questions, effort

Depends on SPEC-05 (venue/session records), FS-00 (`hum.js`, `audio_out.rs`), SPEC-02 fault signatures s12.3. Risks: speaker/hearing damage from software bug (mitigated in Rust); heuristics weakly sourced; output route to booth varies. Open: input for feedback (booth mic vs record out); whether to add SPL meter entry. Effort: L (about 38 agent-hours).

## 11. Research notes

- Turntable hum advice (forum level, simplified): https://forums.steinberg.net/t/ot-problem-60hz-hum-from-turntable/598444 ; https://gearspace.com/threads/ground-loop-hum.453363/ ; https://toprecordplayers.com/ground-turntable-record-player/ (snippet only).
- Unbalanced shield single-point connection and chassis same-potential claims: forum posts via same search (snippet only).
- DPC/RF/power-related noise not covered; no authoritative source for hum thresholds found - tunable.
- SPEC-05 s8/s23 (repo): feedback procedure and electrical environment.
