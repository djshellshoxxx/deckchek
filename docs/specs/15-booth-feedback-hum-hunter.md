# SPEC-15: Booth Feedback and Hum Hunter

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0012_hum_feedback.sql`. Milestone: M6. Size: L. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

> **Implementation status (2026-10-10, audit fixes).** Built. AC-7: runs save with an optional venue; the venue report (printable kind `venue`) lists them from Equipment > Venues and the Runs tab, and each run exports as a PDF. The `booth` and `deck_position` tables are not written.

## 1. Summary, Goals, Non-goals

**Native incident snapshot extension (2026-11-18).** The Incidents tab offers an
optional, default-off attachment of one explicitly selected existing live-monitor
frame. The original incident and reading save atomically, with exact retry and
separate bounded history/report reads. It starts no capture or analysis window;
the selected venue/setup association is operator-provided. Hum startup
placeholders remain explicitly unavailable. See
[the selected snapshot contract](../incident-metric-evidence.md). This extension
does not qualify a surrounding recording interval or a feedback/shock cause.

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
Rust: output playback uses the shared FS-00 `audio_out.rs` engine (job M6-F1-audio-out): `audio_play_tone(device?, spec:{type:'pinkband'|'sine', freqHz?, levelDbfs, capDbfs, rampMs}) -> {handle}`; `audio_set_level(handle, levelDbfs)` (clamped in Rust to cap); `audio_stop(handle)` (fade 20 ms); `list_native_audio_outputs()`. The safety limiter and the hard-coded absolute max -12 dBFS live in Rust so a JS bug cannot exceed the cap. Verified: the repo has no Rust output path today (cpal 0.16 is used for input only; `app/ui/audio-io.js playStereo` is WebAudio), so M6-F1-audio-out builds it. Reuses `start_live_capture` under the capture lease. Deps: none new.

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

## 12. Manual venue incidents — SPEC-05 §20 acceptance slice (2026-11-18)

The **Incidents** tab in Hum and feedback implements operator reports for a selected venue, with an optional setup and note. It does not acquire audio or attach inferred measurements, diagnosis, scores, or calibrated levels. Support-isolation A/B comparisons and automatic surrounding-metric capture remain separate, unfinished SPEC-05 work.

The version-1 contract is implemented by `app/venue-incidents.js`, its production panel in `app/ui/workflows/venue-incidents.js`, and the native `venue_incident_save`, `venue_incident_list` and additive `venue_incident_page` commands in `src-tauri/src/venue_incidents.rs`. Migration `0023_venue_incidents.sql` adds the append-only `venue_incident` table; earlier migrations are unchanged and pagination adds no migration. The selected context is a snapshot supplied by the operator's selection at the press, not an independent verification of past catalog facts.

Acceptance criteria for this slice:

1. **Operator provenance and time.** Each of Skip, Feedback, Hum, Needle jump, Dropout, Booth shock, and Other records an event ID and canonical UTC occurrence time synchronously at the press. The persistence layer sets a separate `recordedAt` and always returns `origin: "operator"`. The two times are retained and displayed separately.
2. **Selected context.** A venue is required; the setup may be unassigned. New writes require the current venue to exist and any chosen setup to belong to it. Original venue/setup IDs and names, plus the setup's selected booth, deck-position, and support-configuration IDs, are copied before asynchronous work. Historical records survive catalog renames, setup moves, and deletion; native historical IDs deliberately have no cascading catalog foreign keys.
3. **Append-only retry.** An exact retry of an existing event ID returns the original record, including its save time, before consulting the current catalog. Native writes use an immediate transaction and reject a different immutable submission with that ID across database connections. Browser requests recheck the ID before writing a dedicated per-event key; conflicting overlapping submissions are rejected within one JavaScript event loop. Browser localStorage does not provide atomic compare-and-set across tabs that deliberately share the same new event ID. The production panel creates a UUID per press and retries its cached draft in that panel. Save/list results are copies. No incident-edit, overwrite, delete, or automatic retention-pruning flow is exposed.
4. **Strict boundary.** Both stores accept only the versioned manual-report fields and seven known types. Unknown provenance or measurement fields are rejected; context IDs must agree, timestamps must be real calendar dates with UTC milliseconds, and notes are limited to 500 Unicode characters. Invalid input cannot create a partial record.
5. **Storage honesty.** Malformed browser incident JSON, invalid saved provenance/context, and unavailable/quota-limited storage produce explicit failures without clearing or replacing retained incident data. Native malformed returned rows fail validation. A failed history read is never displayed as a successful empty history.
6. **Async ownership.** Late catalog/history success or failure cannot replace a newer venue selection or render after disposal. A pending save retains its original event, context, note, and time when the selection or tab changes. A failed/lost-response save offers retry of that same draft; double presses while it is pending do not enqueue another report.
7. **Readable, bounded history.** The UI shows at most 100 records per page for all venues or the selected venue, with **Older**, **Newer** and **Newest** controls. Exclusive `{ occurredAt, id }` cursors use descending canonical UTC time and Unicode scalar IDs, matching SQLite UTF-8 `BINARY` ordering. The additive page API accepts limits of 1–500 and reports context-wide total, page limit, `hasMore` and a next cursor only when older rows remain. The original list API retains its exact four-field response. Labels disclose the navigation page, rows on that page and current total; they do not claim stable absolute positions while new events arrive. Venue/setup selection changes and completed saves request the newest page. Failed navigation retains the last loaded page and retry boundary; retired responses/errors/retries cannot replace a newer request. Notes, recording selection and pending original saves survive navigation. Context and notes render as text, including markup-like input. See [the history contract](../venue-incident-history.md).
8. **Venue reports.** Equipment > Venues and the existing Runs venue-report button load operator history independently from measured hum/feedback runs. Reports include up to 300 newest incidents and disclose shown/total counts and retained older records. Incident-load errors prevent report preparation. Legacy callers that omit history say it was not loaded; a successful empty list says only that no incidents were recorded.
9. **Portability boundary.** Native history participates in the existing complete SQLite database backup. Browser history stays in per-incident browser storage; existing workspace JSON export/import does **not** include it. Venue-report export provides a readable, bounded copy. Structured browser incident export/import remains follow-up work. Pagination reads current data per request and provides no session-wide snapshot or new cross-tab atomicity guarantee.

Initial incident evidence: the seven-file serial Node 22 focused/regression run passed **99/99**, with no skips; native save/list tests passed **7/7**. The additive pagination batch passed **40/40** serial Node checks across `tests/venue-incidents.test.mjs`, `tests/venue-incidents-ui.test.mjs`, `tests/venue-incidents-pagination.test.mjs` and `tests/m6-reports.test.mjs` on its isolated baseline, including 305 actual saved events, equal-time non-BMP ordering, newer appends, retry ownership and actual panel lifecycle. Native storage tests now pass **13/13** in the lightweight harness containing exact production validation/save/list/page code, database migration/clock/ID helpers and all 23 migrations; strict Clippy passed. The harness excludes Tauri command adapters and the full desktop build. Integration additionally creates real support records in the new pagination fixture to satisfy the accepted catalog validation; it does not relax that validation. Browser record/reload/Equipment-report and Older/Newer/Newest smoke paths are authored in `tools/smoke/hum.mjs`; hosted browser and full native gates remain pending. These software checks do not qualify physical booth, feedback, or support-isolation accuracy.

## 13. Saved support descriptions — SPEC-05 §6/§16 prerequisite (2026-11-18)

Equipment exposes reusable **Support descriptions** and a setup's **Current support description** assignment. This is the catalog prerequisite for a future controlled support-isolation comparison. It does not acquire samples, compare A/B captures, estimate LF improvement, infer shock/DVS events, or establish feedback-onset margin. Existing audio paths, thresholds, migrations and Fleet defaults remain unchanged.

The existing `support_configuration` table and `setup.support_configuration_id` are accessed through the existing `catalog_list`, `catalog_upsert` and `catalog_delete` commands. No new migration or command is introduced. The five older native catalog entities retain their timestamp shape and creation-time behavior; support descriptions have no fabricated `createdAt` or `updatedAt`.

Acceptance criteria for this prerequisite:

1. **Descriptive fields only.** The editor saves a name, description, approximate mass in kg, free-text coupled state and notes. Name and coupled state allow up to 200 Unicode characters; description and notes allow up to 5,000. A name is required; mass is optional and must be finite and nonnegative. These are operator entries, not measured performance or a prescribed support taxonomy.
2. **Reusable defaults and legacy preservation.** New descriptions have no deck-position binding and use the existing `structure_json = '[]'` default. Descriptive edits preserve existing layer JSON text byte-for-byte, its unknown/legacy keys, and the existing position binding. Browser records also preserve unknown saved metadata. This editor cannot rewrite layer structure or relocate a position-bound description; full-record API round trips may carry unchanged read-only fields.
3. **Valid setup assignments and context transitions.** A newly chosen support must exist. A position-bound support may only be newly assigned to that position. An unchanged legacy support/position pair can be retained by ordinary metadata edits, including a previously inconsistent legacy pair. A changed incompatible pair is rejected. Ordinary setup edits retain the hidden booth/position context and each existing component's settings-snapshot ID. Explicitly replacing a component's asset clears only that component's old settings association; snapshot records remain intact. Native writes validate that every new/changed non-null snapshot association belongs to the selected asset, while preserving unchanged legacy component/asset/snapshot triples. Browser writes reject a known asset replacement carrying the same old snapshot ID; browser mode has no authoritative settings-snapshot catalog and does not claim to verify arbitrary new snapshot IDs. Changing a bound setup's venue—including clearing or filling it—is rejected visibly and leaves storage unchanged when its existing context includes a booth, deck position or position-bound support. Reusable unbound setups may still change venue. This editor does not relocate or clear hidden relationships to make a venue change succeed. The UI offers reusable supports, matching position-bound supports and the current legacy choice. No support-delete control is exposed; generic removal refuses a support referenced by a setup.
4. **Storage honesty and copies.** Browser support reads/writes/removal and setup writes that carry or already reference support, hidden location context or settings associations use strict storage handling. Malformed JSON, invalid catalog/support rows, duplicate IDs, unavailable storage and failed writes produce errors without clearing malformed bytes or claiming success. Unrelated catalog operations retain their previous fallback behavior. Drafts are copied before asynchronous native invocation and results are returned as copies. Browser catalog writes remain localStorage read/modify/write operations; this slice does not provide cross-tab atomic editing.
5. **Form ownership and recovery.** Entity, record/form generation and active-screen state own asynchronous save/load results and errors. Late results cannot replace a newer form. Support load failures remain visible, offer retry, and block affected saves. A persisted save followed by a reload failure explicitly says it was saved, retains its returned ID, and allows a subsequent edit to update that same description. New form submissions retain a stable draft ID before awaiting persistence, including when the screen is hidden and reopened.
6. **Current context in venue reports.** Reports show escaped support name, description, approximate mass, coupled state and notes under **Current support description**, with an explicit statement that this does not establish the support used for historical measurements. Missing assigned records and omitted/unloaded support data are identified separately. A support load error prevents report preparation.
7. **Measured-history integrity.** Venue reports include up to 50 saved hum/feedback runs, newest first, and state this bound and that older saved records remain stored. Failed or missing detail loads abort report preparation through the existing export-error path; they cannot silently become an empty or apparently complete history. The actual browser hum store now raises `HUMRUN_DB` on malformed/non-array/structurally invalid saved history, unavailable or throwing reads, and failed writes. These failures propagate from list/get/save/delete and cannot overwrite unreadable retained bytes or claim a successful empty history. An available storage object returning a missing key (`null`) still represents valid empty history. Valid legacy records and unknown metadata survive append and valid deletion. This deliberately corrects the predecessor test that expected malformed JSON to return an empty list. Native bridge calls/error mapping, measurement math and thresholds remain unchanged. No stored run is rewritten or removed by report preparation.
8. **Portability boundary.** Native support/setup rows participate in the existing complete SQLite database backup. In browser mode, catalog supports and setups remain in browser-local catalog storage and are **not** included in the existing workspace JSON export/import. The UI discloses this limitation. A venue report is a readable view of current descriptions, not structured catalog backup or historical measurement context.

Focused proof uses the real catalog store, Equipment production handlers, browser hum store, and venue report collector/builder in `tests/catalog-store.test.mjs`, `tests/support-configurations-ui.test.mjs`, `tests/hum-tree.test.mjs` and `tests/m6-reports.test.mjs`, with the shared fixture `tests/contracts/support-configurations.json`. Native tests live in `src-tauri/src/catalog.rs`; the lightweight verification harness compiles the actual catalog core/tests, production migration/clock/ID/value-conversion helpers, starter catalog and all 23 migrations. It excludes Tauri command adapters, application lifecycle, GTK and full desktop/browser qualification. Controlled paired capture, immutable measurement-context snapshots and method-defined comparison metrics remain follow-up work under SPEC-05 §16 and SPEC-19.

## 14. Passive support A/B observations — SPEC-05 §16 / SPEC-19 method v1 (2026-11-18)

This slice follows the prerequisites recorded in §12–13. The **Support A/B** tab now records two passive stereo observations under operator-declared matching conditions, saves both originals, derives a directional digital LF change, reloads history and includes it in venue reports. It introduces no audio output, automatic PA control, shock or DVS detection, feedback-onset measurement, physical isolation-efficiency estimate, ranking or pass/fail threshold. Existing hum/feedback methods and Fleet OFF remain unchanged.

### Procedure and immutable context

Select a saved venue, its setup, two distinct support descriptions, an explicit native input and one stereo pair. Record the physical route, gain/EQ/filter settings, stationary test procedure, medium/source, deck/monitor placement, and PA state and level marker. PA is either off or fixed under operator control. Confirm the stationary condition for A, record A, change the support, restore the declared test conditions, confirm readiness again and record B. After B, explicitly confirm whether the conditions matched and save the comparison. A false confirmation produces a retained **not comparable** result. No catalog assignment is changed by the capture workflow.

Each capture freezes its UUID, pair ID, stage, workflow start time, venue/setup/support snapshots and conditions before asynchronous work. It retains the setup's original booth/deck-position IDs, component asset/settings-snapshot IDs and selected catalog support assignment; the actual support used for this observation is a separate operator-selected snapshot. Support structure JSON text, legacy fields, mass, coupled state and notes survive unchanged. Native-observed endpoint name, opened channel count, selected pair, actual sample rate, lease/bound information and original field-presence flags are retained. An endpoint name is not a persistent physical device identifier; unsupported/fallback or missing observations cannot qualify through compatibility defaults.

The exact calibration lookup key and complete selected profile, state and rejection reasons are frozen against the actual observed endpoint/rate. Absence, unreadable storage and an invalid or mismatched profile are distinguished. Calibration is recorded with `applied:false`: this method never invents input sensitivity, an uncertainty value or a physical-unit conversion. A profile changed during acquisition retains both start/end snapshots and blocks comparability. Times distinguish workflow start/finish from database persistence; they do not claim hardware-synchronized timestamps.

For a new save, current catalog existence, venue membership, support position compatibility and relevant setup/support fields are checked. A deleted or physically changed context is retained as `catalog_context_changed`, with the original snapshot and numerical evidence preserved. Display-name changes alone do not redefine physical comparability. An exact retry is resolved before consulting today's catalog, so it still succeeds after a rename, move or deletion.

### Versioned numerical method

The method identifier is **`support-lf-welch-ms-v1`**. The following choices are software method definitions, not validated hardware performance limits.

| Item | Definition |
| --- | --- |
| Input | Native stereo samples in digital full-scale units; no resampling, audio output or channel-waveform averaging |
| Capture | At least 30 seconds of actual returned samples; native request bounded to 35 seconds |
| Candidate interval | First `M = 30 × fs` frames; all later captured frames remain part of integrity checks |
| FFT/window | `N = 2^ceil(log2(fs))`, bounded to `N ≤ 2^18`; periodic Hann; arithmetic segment mean removed before windowing |
| Segments | Hop `H = N/2`; `K = 1 + floor((M − N)/H)` complete windows; no partial-window padding |
| Analyzed span | `[0, C)`, where `C = N + (K − 1)H`; actual analyzed duration is `C/fs` |
| Spectrum | Mean one-sided power spectral density, retaining each contributing bin and its frequency overlap |
| Band | 20–200 Hz, integrated using each bin cell's overlap in Hz with `[20,200)` |
| Channel statistic | Independent L/R band powers; pair power `(P_L + P_R)/2` |
| Level | `10 log10(P)` dBFS RMS relative to digital amplitude 1; zero power remains zero with unavailable logarithmic level |
| Change | `10 log10(P_B) − 10 log10(P_A)`, separately for L/R/pair; negative means lower recorded power in B |
| Uncertainty | Explicitly unknown; standard/expanded uncertainty and coverage factor are null with a reason |

For an unnormalized FFT of the detrended/windowed segment, density is `c_k × mean(|X_k|²) / (fs × Σw²)`, with `c_k = 2` for interior one-sided bins and 1 at DC/Nyquist. For a periodic Hann, `Σw² = 3N/8`. Band power is **`Σ PSD[k] × overlapHz[k]`**, equivalently `Σ PSD[k] × df × fractionalOverlap[k]`. The frequency-bin cell is centered at `k × df`, with width `df = fs/N`. An exact boundary uses its fractional overlap; this is a recorded method choice, not a brick-wall filter claim. PSD units are full-scale squared per Hz; integrated power is full-scale squared.

This statistic is the window-weighted mean of complete Welch segments. It is not unweighted RMS over every captured sample, and overlapping windows do not provide independent uncertainty samples. At 4096 Hz, `N=4096`, `K=59` and all 122,880 candidate frames span 30 seconds. At 48 kHz, `N=65536`, `K=42` and `C=1,409,024`, or about 29.354667 seconds; 30,976 frames of an exactly 30-second capture lie beyond the analyzed span. If native stop returns more than 30 seconds, that additional suffix is also disclosed as omitted from analysis. The original captured/candidate/analyzed/omitted frame counts are saved, displayed and reported. “Signed A→B” refers only to the numerical direction **B minus A**, not a cryptographic signature.

The independent reference follows SciPy's documented [Welch density method](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html) and [spectral normalization](https://docs.scipy.org/doc/scipy/tutorial/signal.html#spectral-analysis). Fixture generation explicitly uses periodic Hann, segment-constant detrending, `nperseg=nfft=N`, `noverlap=N/2`, one-sided output, density scaling and mean averaging. Synthetic samples are first quantized to Float32 and explicitly promoted to Float64 before the reference call. `tests/fixtures/support-isolation-welch.json` records the generator hash, Python 3.12.14, NumPy 2.3.5 and SciPy 1.17.0, parameters, input hashes and tolerances before production evaluation. Cases include a coherent tone, the 20 Hz boundary, DC/out-of-band content, a 48 kHz absolute-power case with `df != 1`, and off-bin 44.1 kHz tones. The reference tolerance is `rtol=1e-9, atol=1e-14`; analytic Float32 power uses `rtol=2e-7`. The `1e-9 dB` delta tolerance applies only to an exact half-amplitude copy after Float32 quantization. These are numerical software checks, not physical accuracy or uncertainty claims.

Saved-evidence algebra uses a separate rule: if either compared power is exactly zero, both must be zero. Positive totals use a relative/ULP allowance; a zero PSD or segment total cannot be relabelled as a tiny positive power. Non-finite levels and zero/zero ratios are never hidden behind a floor or an unexplained null. Any zero channel power blocks a comparative delta with `zero_band_power`.

### Eligibility, retention and acceptance

1. **Complete-capture integrity.** Every returned L/R sample is scanned for non-finite values and clipping using the existing capture clipping boundary, including the unanalyzed final-window tail and any later suffix. Final native frame counts, overruns, per-pair/top-level clipped counts, stream-error count/messages, truncation, callback count and maximum callback gap are retained. Missing or inconsistent actual observations, a known error/drop/truncation/preemption, clipping, non-finite samples, insufficient duration or unsupported method geometry prevent a comparable result. Callback gap is an observation; this method adds no arbitrary callback-gap threshold. Failed-quality originals remain visible and saved where a valid bounded JSON record can be formed; unavailable analysis carries its explicit reason.
2. **Conservative comparability.** The ordered A/B references must belong to the same pair, venue and setup and use distinct support IDs. The saved setup/component projection, physical route, gain/filter settings, procedure/source, placement, PA declaration, actual endpoint/channel count, stereo pair, sample rate, calibration snapshot and method geometry must agree. All capture/context issues are included as reasons. Matching operator declarations produce `operator_reported_comparable`; they do not prove physical PA equivalence or a causal support effect. Otherwise the result is `not_comparable`, with unavailable deltas and retained originals/reasons.
3. **Append-only persistence.** Migration `0024_support_isolation.sql` adds separate observation and comparison tables. Four commands save/get an observation, save a comparison and list history. Native storage loads both original observations and derives/checks every comparison; it never trusts a supplied delta/verdict. Immediate transactions serialize conflicting IDs across connections, and late SQL failures roll back without changing prior records. Historical catalog IDs have no cascading catalog foreign keys. Both stores reject unsupported fields, invalid method/algebra, conflicting IDs, missing originals and corrupt stored results rather than silently repairing history. Native JSON parsing enables the existing `serde_json` `float_roundtrip` feature so a serialization/reload cannot change the retained floating-point values or turn an exact retry into a conflict. No approximate original matching or rounding is introduced. Exact retries retain original timestamps and return copies. No edit, overwrite, delete or retention-pruning UI is provided.
4. **Raw/derived separation and bounds.** Original band PSD ordinates, integration geometry, per-segment powers, linear/logarithmic measurements, full selected context and capture/calibration evidence are retained separately from the derived comparison. `rawAudioRetained:false` is explicit; no PCM archive is introduced. Complete observation JSON is bounded to 64 KiB with finite values and depth validation. Context/calibration preflight bounds reserve space before acquisition; oversized evidence fails visibly rather than being trimmed. Browser records use dedicated per-record storage; unavailable/corrupt/quota-limited storage cannot claim empty history or save success. Browser overlapping retry handling is guaranteed within one JavaScript event loop, not an atomic transaction across tabs deliberately sharing a new ID.
5. **Capture and asynchronous ownership.** The workflow acquires only its own input lease. Cancelling, leaving or a late open releases that lease and cannot dispatch a new save. Already-dispatched writes retain their original submission through hide/show; a lost response offers the same unchanged retry. Double presses do not create a second pending submission. Retired catalog/history responses and errors cannot replace a newer selection. Catalog snapshots refresh on reactivation, while completed A and pending original submissions remain owned. Stationary readiness resets after each acknowledged observation and on reactivation; matching-condition confirmation resets until B has been acquired.
6. **History, reports and portability.** UI and venue report each load up to 50 newest observations and 50 newest comparisons, disclose shown/total counts and retain older rows. Ordering uses canonical UTC time then descending Unicode scalar ID, matching SQLite BINARY. Reports separate current catalog descriptions from historical captured context, escape operator text and include original support/setup/settings and calibration provenance, analyzed coverage, quality/rejection reasons and B−A direction. Any history load or missing/corrupt original prevents a successful report; an omitted optional store is explicitly “not loaded.” Native tables participate in complete SQLite backup. Browser workspace JSON does not include support observations/comparisons; browser storage and a bounded readable venue report are the available persistence/export scope for this slice.

Focused proof lives in `tests/support-isolation.test.mjs`, `tests/support-isolation-ui.test.mjs`, `tests/m6-reports.test.mjs`, the shared `tests/contracts/support-isolation.json`, and the actual native module's in-memory/connection tests. The production-handler tests exercise capture A → support B → explicit comparison → reload → report, plus failed/lost saves, hidden ownership, stale reads, escaping and explicit report errors. The lightweight native harness includes the exact production core, its tests, production migration/clock helpers and all 24 migrations; it excludes Tauri adapters/macros and the full desktop build. Hosted Chromium smoke and full native application gates remain separate qualification; no software fixture establishes hardware or venue accuracy.

## 15. Browser venue-history archive — additive portability slice (2026-11-18)

This adds structured browser-history portability to the boundaries recorded in
§12 and §14. Data exposes a separate versioned archive for all retained manual
incidents, original support observations and base comparison records. Current
editable catalogs remain outside this slice. Workspace JSON v1, native commands,
migrations, database backup, measurement math and Fleet OFF are unchanged. The
complete format and recovery contract is in [Browser venue-history
archive](../venue-history-archive.md).

Acceptance criteria:

1. **Complete bounded export.** The exact six-field envelope uses
   `format: "deckchek-venue-history"`, `formatVersion: 1`, canonical UTC
   `exportedAt`, `incidents`, `supportObservations` and `supportComparisons`.
   Export bypasses display/report row limits and retains older records. Files
   over 32 MiB UTF-8 or 10,000 total records fail without truncation. Strict
   source readers apply early record/raw-byte bounds and abort on any corrupt
   record or unavailable/changing enumeration.
2. **Unchanged saved evidence.** Existing validators check complete saved forms;
   the archive cannot normalize away nullable fields, change numeric values or
   strip allowed legacy metadata. Original IDs, times, origin, context, raw JSON
   text, calibration, PSD, uncertainty, reasons and `contextIssues` are preserved.
   Restore never calls ordinary save or current catalog lookup.
3. **Complete graph and exact conflict policy.** Every comparison includes both
   valid originals in the archive and passes the existing method/algebra/result
   checks. Incident IDs have their own namespace; support observations and
   comparisons share one. An exact duplicate includes persistence metadata and
   the complete saved result, with object-key order irrelevant. Changed
   `recordedAt`, `contextIssues`, result or record kind conflicts. Malformed IDs,
   graphs, methods, algebra or envelope fields fail before writes.
4. **Preflight and resumable append.** File selection and preview do not write.
   Explicit Import revalidates the complete file and both target stores before
   any append. Conflicts or corrupt target history cause zero writes. Each ID is
   rechecked immediately before a synchronous write; observations precede their
   comparisons. A failed write stops the batch with confirmed-new, exact-match
   and remaining/unconfirmed counts. Earlier successful records stay stored.
   There is no overwrite, pruning or rollback-delete flow. Unchanged reimport
   resumes after reload or lost response without rewriting exact matches.
5. **Owned UI actions.** Selected-file generations own asynchronous reads and
   previews. New selection, hide/show and disposal retire old results/errors.
   A dispatched import retains its copied original submission; duplicate presses
   and pending selection changes cannot replace it. Retired retries cannot act
   on a newer file. File names, conflict IDs and outcomes render as text.
6. **Honest context and limits.** All-venue incident/support panels can display
   imported records without current catalog entries; reports require a matching
   current venue ID. The import does not manufacture catalogs or relabel old
   evidence. Browser storage provides no multi-key transaction or cross-tab
   compare-and-set guarantee. Structural validation is not authenticity or
   physical qualification; prior provenance, unknown uncertainty and audio
   retention contracts remain unchanged.

Proof uses `tests/venue-history-archive.test.mjs` and
`tests/venue-history-archive-ui.test.mjs` with actual stores and Data handlers,
including 302 incidents, 102 observations and 101 comparisons, oldest-reference
retention, exact reimport, corrupted source/target bytes, malformed input,
first/middle/last write failures and resumed import. Existing incident, support
and Data tests provide bounded regression coverage. Root owns the separate
hosted Chromium smoke; no full native or physical qualification is inferred.

## 16. Browser current-catalog archive — support/setup portability (2026-11-18)

This separate additive slice makes current Equipment catalog descriptions
portable without changing the immutable venue-history format in §15. Data
exports all six current catalog collections and embedded setup components,
including retained retired assets and valid legacy metadata. The complete
contract is in [Browser Equipment catalog archive](../catalog-archive.md).

Acceptance criteria:

1. **Exact saved context.** A distinct `deckchek-catalog` version-1 envelope
   preserves original record/component IDs, field absence versus null,
   timestamps, component order, literal support structure JSON, retirement
   state and unknown valid catalog metadata. Ordinary upsert/filter operations
   are not used to restore saved values. Finite plain-JSON, depth-24, 32 MiB
   UTF-8 and 10,000-known-record bounds reject entire operations rather than
   omit records; setup components count toward the record bound.
2. **Complete known graph.** Products reference included manufacturers, assets
   reference included products, setups reference included venues/supports, and
   every component references an included asset. Incoming, target and proposed
   merged catalogs are validated. Duplicate identities, missing parents and
   component IDs assigned to different setups fail before a write. Separate
   catalog entities retain separate ID namespaces.
3. **Honest unavailable authorities.** Saved booth, deck-position and
   asset-settings-snapshot IDs remain exact and appear in preview as references
   whose records cannot be verified or restored in browser mode. No native
   records, calibration association or Fleet authority is manufactured. Opaque
   catalog metadata is never promoted into an authoritative entity. Existing
   legacy support-position mismatches are retained and disclosed; normal bound
   venue and asset/settings transition guards remain unchanged.
4. **Additive one-write commit.** File selection/preview do not write. Explicit
   Import revalidates all data, treats complete equal records as exact matches,
   and blocks on any same-ID difference. Unknown catalog metadata is added only
   when absent or kept when exactly equal. The complete destination siblings
   outside the catalog are preserved. The original raw value is rechecked
   immediately before one storage write; changes abort without an archive write.
   There is no overwrite, name-based rekeying, deletion or partial-record commit.
   The guard does not claim a cross-tab transaction or compare-and-swap.
5. **Owned recovery and visibility.** Selected-file generations own asynchronous
   reads/previews; stale selections, hide/show and disposal cannot reclaim newer
   UI. A dispatched import retains its copied original file through lost
   acknowledgments. Explicit retry rechecks the unchanged file; after a full
   reload it must be selected again. IDs, names and reference/conflict details
   are escaped. Equipment displays imported current records; same-ID venue
   restoration enables existing reports while historical snapshots remain
   unchanged.
6. **Devices and backup boundaries.** Existing device-profile bindings, results,
   specification caches and MIDI maps stay in the destination. Imported assets
   can appear in Equipment before association with a Devices profile. Existing
   startup synchronization can update matching current products, after which an
   unchanged older file reports conflicts. Workspace JSON v1, venue-history
   keys, native database backup, calibration, feature defaults and Fleet OFF are
   unchanged. No immutable-current-catalog or physical-isolation claim is made.

Proof uses the actual catalog store, Data/Equipment handlers and startup profile
synchronization in `tests/catalog-archive.test.mjs` and
`tests/catalog-archive-ui.test.mjs`. The graph fixture includes retained hidden
assets, opaque references, literal support text and legacy metadata. Root owns
the separate hosted smoke and complete combined-source qualification; this
slice does not establish a full native, browser-layout or hardware result.
