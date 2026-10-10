# SPEC-10-A: Pre-Gig Check ("Ready to Play")

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0008_pregig.sql`. Milestone: M6. Size: L. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

> **Implementation status (2026-10-10, audit fixes).** Built except deck B on inputs beyond 1-2, which is reported as "coming next" until a pair picker passes `pairs` to capture (follow-up). PDF export exists (kind `pregig`).

Status: draft. File: `docs/specs/10-pre-gig-check.md`. Reuses terms from SPEC-02, SPEC-05, SYSTEM-CHECK-CONTRACT.md.

## 1. Summary, Goals, Non-goals

One button runs a roughly 2-minute guided check of the whole DJ rig and returns a green / amber / red "ready to play" verdict with a fix-it action beside every problem. It composes existing engines (System Health scans, audio device list, `timecode.js`, `diagnostics.js`, `midi.js`, DJ log scan) and adds only orchestration, a setup preset model and a check history.

Goals: finish in <= 120 s for a 2-deck setup (budget table in section 6); work with no technician knowledge; every red/amber has an action (button or one sentence); presets for the owner's rigs; history with comparison to the last green check.
Non-goals: no new DSP; no automatic system changes (fix-it actions open settings or show a command, they never apply it silently); no cloud; no replacement of the deep workflows (DVS, Calibration); no controller-pad coverage test (that is Device Tests).

## 2. Users & user stories

Users: touring/club DJs arriving at a booth; mobile DJs at home before leaving.

- US-1: As a DJ at the booth I press one button and know in two minutes if my DVS rig will behave.
- US-2: As a DJ I pick a saved rig ("Technics+Audio8+Traktor MK2") so the check knows which decks, format and software to test.
- US-3: As a DJ I see exactly what to fix first.

Acceptance criteria:
- AC-1: Given a saved preset and all hardware ready, when I press "Run pre-gig check", then all automatic steps run in order, the manual headphone step prompts me, and a verdict banner appears within 120 s (+ the time I take on manual steps, which are excluded from the budget and shown separately).
- AC-2: Given any step has severity error, then the verdict is RED; else any warning gives AMBER; else GREEN. A skipped required step makes the verdict at most AMBER ("incomplete").
- AC-3: Given a deck's timecode SNR < 25 dB (existing `tc_snr_db` reference) when checked, then that deck is red/amber per section 6 with the action "Clean stylus and control vinyl, check phono/line switch" and a link to the DVS workflow.
- AC-4: Given the interface is missing from the audio device list, then the audio step is RED, remaining signal steps are `skipped (blocked)`, and the run completes in < 15 s.
- AC-5: Given non-Windows or browser preview, then System Health, DJ-software and driver steps show `unsupported` and are excluded from the verdict, with the banner noting "Partial check".
- AC-6: Given a finished run, then it is saved to history and Compare shows which steps changed vs the last run of the same preset.
- AC-7: Esc cancels a running check; partial results are kept as `cancelled`.
- AC-8: Presets can be created from the current Equipment selection, edited, duplicated, deleted, and exported/imported as JSON.

## 3. UX

Entry points: Quick Check screen primary button "Pre-gig check"; rail item under Quick Check; shortcut Ctrl+G; History row "Re-run".

Flow (Setup > Run > Result, as in GUI-DESIGN-RESEARCH section 2):
1. Setup: preset dropdown (last used preselected), summary chips (decks, mixer, software, input device). "Edit preset" link. Checkbox list of steps (all on). Start button 44 px high.
2. Run: vertical checklist, one row per step with state icon + word (pending / running / pass / warn / fail / skipped / unsupported). Timer and overall progress. Manual steps show an inline card (headphone cue: "Cue deck A in your headphones. Do you hear it clearly in both ears? [Yes] [No] [Skip]").
3. Result: verdict banner (chip + sentence + top action), then step cards sorted red, amber, green; each card expands to evidence and opens inspector. Buttons: Save/Export PDF (Ctrl+E), Re-run failed steps only (Ctrl+R), Open fix (deep link).

States: empty (no preset: "Create your first rig" wizard, 3 fields); loading (per-step spinner, reduced-motion: static dots); success; partial; error (step crashed: row shows "Check could not run: <cause>", verdict AMBER); offline (nothing needs network; no state); unsupported (as AC-5).

Key copy: GREEN "Ready to play. 9 of 9 checks passed." AMBER "Playable, with 2 things to look at." RED "Not ready: Deck B timecode is not reaching the software." Every fail: cause, consequence, next step (GUI rule).
Shortcuts: Ctrl+G run, Enter confirm manual, Y / N answer manual prompt, Esc cancel, I inspector.
Accessibility: verdict in `aria-live="polite"`, step state changes announced once, colour + icon + word, all targets >= 32 px, timer not live-announced.

## 4. Architecture

New JS:
- `app/pre-gig.js` (pure): `PREGIG_STEPS`, `buildPlan(preset) -> Step[]`, `evaluateStep(stepId, evidence, preset) -> StepResult`, `rollUp(results) -> {verdict:'green'|'amber'|'red'|'incomplete', top:StepResult[]}`, `validatePreset(p)`, `diffRuns(a,b)`.
- `app/hum.js` (pure, shared with FS-15; owned by FS-00 §4.6 — use the single signature defined there: `humMeasure(samples, sampleRate, {mains:'auto'|50|60, harmonics:8}) -> {mainsHz, fundamentalDbfs, harmonics:[{n,hz,dbfs}], totalDbfs, floorDbfs, humToFloorDb, oddEvenRatio}`).
- `app/ui/workflows/pregig.js` (orchestrator, uses `flow.js`), `app/ui/screens/pregig.js` (preset editor, history).
- Preset library `app/pregig-presets.json` (built-ins, see section 5).
Existing reused: `createSystemBridge`/`interpretSystemScan` (system-check.js), `list_native_audio_inputs`, `start_live_capture`/`stop_live_capture`, `analyzeTimecode`/`findFormat`/`mergeFormats` (timecode.js), `evaluateDriverCheck`/`evaluateSoftwareCheck` (device-checks.js), `midi_list_ports`, `normalizedLevelTrace`, `dvsIntegrityScore` (diagnostics.js).

New Rust (`src-tauri/src/pregig.rs`, registered in `lib.rs`):
- `pregig_processes() -> {supported, apps:[{app, running:bool, exe, pid:number|null, version:string|null}], scannedAt}`. Thin wrapper over the shared FS-00 `processes::dj_processes()` helper (`tasklist /FO CSV /NH` via `run_with_timeout`, `is_dj_program` match), which FS-11 also uses. No new crate.
- `pregig_save_run(run: PregigRunInput) -> {id}`, `pregig_list_runs(presetId?, limit?) -> RunSummary[]`, `pregig_get_run(id)`, `pregig_preset_upsert/list/delete`. All SQLite via `db.rs`.
Events: `pregig://step` payload `{runId, stepId, state, progress}` (JS may also drive directly; events only needed if work moves to Rust later).
Deps: none new.

## 5. Data model

Migration `0008_pregig.sql`:
```sql
CREATE TABLE IF NOT EXISTS pregig_preset (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, builtin INTEGER NOT NULL DEFAULT 0,
  setup_id TEXT REFERENCES setup(id) ON DELETE SET NULL,
  json TEXT NOT NULL,            -- PresetV1
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pregig_run (
  id TEXT PRIMARY KEY, preset_id TEXT REFERENCES pregig_preset(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL, finished_at TEXT,
  verdict TEXT NOT NULL CHECK (verdict IN ('green','amber','red','incomplete','cancelled')),
  duration_ms INTEGER, app_version TEXT NOT NULL, venue_id TEXT REFERENCES venue(id) ON DELETE SET NULL,
  notes TEXT);
CREATE TABLE IF NOT EXISTS pregig_step_result (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES pregig_run(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL, deck TEXT, state TEXT NOT NULL CHECK (state IN ('pass','warn','fail','skipped','unsupported','error')),
  summary TEXT NOT NULL, evidence_json TEXT NOT NULL DEFAULT '{}', fix_json TEXT NOT NULL DEFAULT '[]');
CREATE INDEX IF NOT EXISTS idx_pregig_run_preset ON pregig_run(preset_id, started_at);
```
PresetV1 JSON: `{"v":1,"name":"Technics+Audio8+Traktor MK2","software":"Traktor Pro","audioDevice":"Traktor Audio 8 DJ","sampleRate":48000,"decks":[{"id":"A","input":[0,1],"format":"Traktor Scratch MK2","mixerChannel":"1"}],"mixer":"Rane Twelve MK2","midi":["Allen&Heath Xone:23C"],"expectedCrashFree":true}`.
Built-ins: "Technics+Audio8+Traktor MK2", "CRSS12+DJM-A9+rekordbox" (format name "rekordbox RB-VS1" is unverified in `timecode.js`; step warns "format unverified"), "Twelve MK2+Serato" (Serato CV02.5). Versioning: `v` field; unknown higher `v` is read-only with a notice; migration functions in `pre-gig.js`.

## 6. Algorithms

Steps, severity rules (all thresholds tunable defaults in `PREGIG_THRESHOLDS`):
1. System Health (budget 15 s): `interpretSystemScan({drivers, events: 3 days, logs})` filtered to preset devices. Any `error` finding in drivers = fail; `warning` = warn.
2. Audio device and sample rate (3 s): device present in `list_native_audio_inputs`; fail if absent; warn if default rate != preset rate (action: open Sound settings / driver panel).
3. Per-deck timecode (10 s per deck, run sequentially, user told "Put the needle on the control vinyl and let it play"): 5 s `start_live_capture`, `analyzeTimecode(.., {format})`. Pass: SNR >= 25 dB, |balance| <= 1.5 dB, phaseErr <= 10 deg, dropouts = 0, speed error |e| <= 1 % (reference ranges already in `analyzeTimecode`). Warn: SNR 20-25, balance 1.5-3 dB, phaseErr 10-20 deg, dropouts <= 1. Fail otherwise or no signal. Also catches wrong format by `speedErr` > 5 %.
4. Mixer channel signal and hum (8 s): reuses the step-3 capture. Signal present on both channels (>= -50 dBFS) is required. Hum is measured with `humMeasure` after removing the fitted carrier (`fitTone` residual); if the preset sets `requireNeedleUpHum`, ask "Lift the needle for 3 s" and measure that segment instead. Hum thresholds are UNKNOWN - needs verification on real rigs; tunable defaults: warn when 50/60 Hz family is within 40 dB of the carrier level, fail within 25 dB.
5. Headphone cue (manual, <= 20 s): user confirms; stored as `pass`/`fail`/`skipped`.
6. MIDI presence (2 s): `midi_list_ports`; each preset MIDI name must be present (case-insensitive substring).
7. DJ software (3 s): `pregig_processes` running? plus `evaluateSoftwareCheck` latest crash age: crash within 24 h = warn, within 1 h = fail, unrelated older = pass.
Total typical: 15+3+20+8+20+2+3 = about 70 s plus manual. Parallelise steps 1, 2, 6, 7. Verdict: `rollUp` per AC-2. Confidence: steps with missing evidence are `skipped`, never pass.

## 7. Error handling, edge cases, privacy

- Capture arbitration: every capture step acquires the FS-00 capture lease; if FS-31 Live monitor holds it, the step offers "Stop live monitor and continue" instead of failing.
- Capture device busy (software holds ASIO exclusively): step fails with "Close <software> or use its output; DeckChek cannot share an exclusive ASIO device." Warn rather than fail if the software is running and audio device present.
- Needle not down/silence: `NO_SIGNAL` -> action text, offer retry.
- Two decks share one stereo input (Audio 8 has 2 inputs per pair): preset `input` indexes select pairs; capture is per pair.
- All data local. Run JSON contains device names and process names only; PDF export redacts Windows user name in paths (`%USERPROFILE%`). No path from the UI is used to open files except preset import (validate JSON schema; reject > 256 kB).
- Process list: never send command lines, only exe name matches.

## 8. Test plan

Unit (`tests/pre-gig.test.mjs`): rollUp matrix (all combos), skipped required step, unsupported excluded, preset validation (bad deck id, unknown format), diffRuns, threshold boundaries (SNR 24.9/25/20), synthetic timecode from generator -> pass, one channel muted -> fail, hum synthetic 50 Hz + harmonics detection vs 60.
Rust: tasklist CSV parser, `is_dj_program` matches, run save/list round-trip with migration.
UI smoke: preset create, run with mocked invoke, verdict banner text, Esc cancel, history list.
Windows CI: migration applies; `pregig_processes` returns supported:true.
Manual: (1) Traktor Audio 8 + SL-1200MK4 + MK2 vinyl: expect green. (2) Pull one RCA on deck B: expect red with channel-missing action. (3) Switch phono/line wrong: expect red. (4) Unplug Audio 8 mid-run: AC-4. (5) Run Twelve MK2 + CV02.5; DJM-A9 + CRSS12 preset. (6) Unplug Xone:23C: MIDI amber/red per preset.

## 9. Definition of done

- [ ] AC-1..AC-8 pass; [ ] unit/Rust/smoke/CI green; [ ] manual script run on at least two rigs; [ ] 120 s budget measured on owner's PC (manual script H-10) and, in CI, orchestration overhead with mocked captures (each mocked step resolving instantly) completes in < 5 s in the UI smoke run.
Rollout: flag `features.pregig` default off for one release. Docs: update FEATURE-MATRIX.md, IMPLEMENTATION-STATUS.md, app/README.md, SYSTEM-CHECK-CONTRACT.md (add `pregig_processes`).

## 10. Dependencies, risks, open questions, effort

Depends on: System Health (existing), SPEC-02 timecode engine, FS-11 (optional "latency known-good" step), FS-00 (`app/hum.js`, process list, capture arbiter). Risks: exclusive ASIO capture conflicts; hum measurement during playback is weak; rekordbox format unverified. Open: should a green check be valid for N hours (suggest 12 h badge)? Threshold calibration on real rigs. Effort: L (about 40 agent-hours).

## 11. Research notes

- docs/SYSTEM-CHECK-CONTRACT.md, app/timecode.js, app/device-checks.js (repo): shapes and thresholds reused.
- Serato USB buffer guidance: https://support.serato.com/hc/en-us/articles/202536960-What-settings-should-I-use-for-buffer-size-in-both-applications (snippet only).
- DPC/latency general guidance (snippet only): https://support.focusrite.com/hc/en-gb/articles/208360865
