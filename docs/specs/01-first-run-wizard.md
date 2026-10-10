# Spec 01 — First-run setup wizard

## 1. Summary, goals, non-goals
A guided, skippable, resumable wizard that runs on first launch and can be re-run from Options > "Run setup again". It selects the audio interface and I/O, checks levels, optionally runs loopback calibration (reusing `app/calibration.js` and the Calibration screen), records which gear the user owns, runs a System Health quick scan and ends with a summary.

**Goals:** a user with no DJ-software knowledge reaches a valid `settings.deviceName` + `sampleRate` and a first successful measurement path in under 5 minutes; every step skippable; state survives app restart mid-wizard; no step is a hard dependency of another screen.
**Non-goals:** driver installation; ASIO configuration; replacing the Calibration screen (the wizard embeds/links it); account creation; any network call.

## 2. Users & user stories
Users: first-time owner (Pioneer PLX-CRSS12 / Technics SL-1200MK4 / Traktor Audio 8 DJ), returning user re-checking after a driver or interface change.
- AC-1 Given a fresh install (no `wizard.state`), when the app starts, then the wizard opens modally before the Quick screen; Esc/"Skip setup" closes it and marks `status=skipped`.
- AC-2 Given the wizard is at step 3 and the app is closed, when reopened, then a "Resume setup (step 3 of 7)" banner offers Resume / Dismiss; Resume restores step and answers.
- AC-3 Given the user picks an input device, when "Next" is pressed, then `settings.deviceName` is saved via `setSetting` and the Calibration profile status for that device + sample rate is shown.
- AC-4 Given the user presses "Play test tone", when output is selected, then a -20 dBFS 1 kHz tone (via `loopbackStimulus`/`generateSine`) plays on the chosen output at a hard-capped ramped level and the stereo meter shows live input levels.
- AC-5 Given an applicable calibration profile exists (`isProfileApplicable`), then the calibration step shows "Already calibrated" and defaults to Skip.
- AC-6 Given the user ticks owned products, when finishing, then an `asset` row ("My <model>") exists per ticked product and none for unticked ones; existing assets are not duplicated.
- AC-7 Given a non-Windows or browser build, then System Health step shows `UNSUPPORTED_NOTE` and is auto-marked skipped.
- AC-8 Given Options > "Run setup again", then the wizard starts with current values prefilled and never deletes assets or profiles.
- AC-9 Given no input device is found, then the user sees a recoverable error panel with Refresh and "Continue without audio" actions.

## 3. UX
**Entry points:** auto on first run (`wizard.status` absent); Options > "Run setup again"; command palette "Setup wizard"; banner when resumable. Rendered as a full-height dialog (`<dialog>` modal, focus trapped) using existing `confirmDialog` styling from `app/ui/shell.js`; stepper at top ("Step 3 of 7", `role="list"`, current `aria-current="step"`).

Steps (each has Back / Skip step / Next; primary button right-aligned):
1. **Welcome** — what DeckChek checks, "takes about 5 minutes", privacy line: "Everything stays on this computer." Buttons: Start / Skip setup.
2. **Interface & I/O** — Input select (`listInputDevices()` native capture), Output select (`listOutputDevices()` when `outputSelectionSupported()`), Sample rate select (44.1/48/96 kHz; default 48 000), Refresh button. States: loading skeleton; empty ("No audio inputs found. Plug in your interface, install its driver, then Refresh."); permission-denied (`classifyCaptureError`); browser-only (note that native capture needs the desktop app, offer microphone via WebAudio).
3. **Test tone & levels** — "Lower monitors first" warning, Play/Stop tone, live `createStereoMeter` for input; verdicts: Clipping (>-1 dBFS peak) = error, Low (<-40 dBFS) = warning "Raise the interface gain or check the phono/line switch", OK. Copy: "Input peaks at −12 dBFS — good."
4. **Loopback calibration** — Explains cable patch (reuse the wiring diagram markup), "Run calibration" opens the Calibration flow inline by mounting `createCalibrationScreen` in the dialog body with a `wizardMode` option that hides the side panel, or "Open Calibration screen" (closes wizard, remembers step 4). Skip copy: "You can calibrate later; results will show wider uncertainty."
5. **Your gear** — grid of device-library products (`app/devices/index.json` profiles, with images from `app/devices/images`) grouped by category (turntable, mixer, interface, controller, timecode media); checkbox "I own this"; search box; "Add custom gear later in Equipment". Preticks products already having assets.
6. **System Health quick scan** — runs `system_scan_drivers` only (fast) and `interpretSystemScan`; shows `summarizeFindings` counts and top 3 findings; "Full scan" link. Partial: scan errors list from payload `errors`.
7. **Summary** — table of choices (input, output, rate, calibration status, owned gear count, health counts), "Finish" -> Quick screen; "Copy summary" button. Status set `completed`.

**Keyboard:** Enter = Next, Alt+Left = Back, Esc = Skip setup (confirm if past step 2), Space toggles checkboxes/tone. **A11y:** `aria-live=polite` region announces step changes ("Step 3 of 7: Test tone and levels") via `announce()` from `app/ui/live.js`; meter has text equivalent; all colour verdicts paired with icon + text; focus moves to step heading (`tabindex=-1`) per GUI-DESIGN-RESEARCH.md; respects reduced motion.

## 4. Architecture
New: `app/ui/workflows/setup-wizard.js` (`export function openSetupWizard({resume=false}={})`, `export function shouldAutoStartWizard(state)`), `app/setup-wizard-model.js` (pure: `initialWizardState()`, `reduceWizard(state, action)`, `stepsFor(env)`, `summarize(state)`, `migrateWizardState(raw)`), CSS block in `app/styles.css`. Change: `app/ui/shell.js` (call `shouldAutoStartWizard` after init; Options menu entry), `app/ui/state.js` (settings keys `wizard`), `app/ui/screens/calibration.js` (accept `{embedded:true}`).
Rust (new `src-tauri/src/wizard.rs`):
- `wizard_state_get() -> { status: "none"|"in_progress"|"skipped"|"completed", step: number, answers: object, updatedAt: string|null, version: 1 }`
- `wizard_state_save(state: {status, step, answers}) -> ()`
- `wizard_create_assets(productIds: string[]) -> { created: [{productId, assetId}], existing: [{productId, assetId}] }` (inserts into `asset` with nickname "My <model>", idempotent by product).
Browser fallback: same shape stored in `localStorage['deckchek.wizard.v1']` through `storageGet/storageSet`; gear creation goes through `store.upsert('asset', ...)` from `catalog-store.js`.
No new events. No new plugins/crates.

## 5. Data model
Migration `NNNN_wizard_state.sql`:
```sql
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```
(generic key/value; specs 02/08 reuse it — whichever lands first creates it; `IF NOT EXISTS` makes order irrelevant.) Row `key='wizard'`:
```json
{ "version":1, "status":"in_progress", "step":3,
  "answers":{ "inputDevice":"Traktor Audio 8 DJ", "outputDevice":"", "sampleRate":48000,
              "levelCheck":{"peakDbfs":-12.4,"verdict":"ok"}, "calibration":"skipped|done|existing",
              "ownedProductIds":["technics-sl-1200mk4"], "health":{"errors":0,"warnings":2} },
  "completedAt":null }
```
`migrateWizardState` upgrades unknown/older versions or resets to `none` when `version` is greater than supported (never throws). Settings stay in `deckchek.ui.v1`; the wizard only calls `setSetting('deviceName'|'sampleRate')`.

## 6. Algorithms
Level check from `startLiveSession` `onLevels`: collect 3 s of per-channel peak/RMS; verdict thresholds (tunable defaults): clip if peak >= -1 dBFS, low if peak < -40 dBFS (while tone looped back, expected ≈ -20 dBFS +/- 6 dB if loopback present), channel imbalance warning if |L-R| RMS > 3 dB. Tone: `generateSine` 1 kHz, 10 ms raised-cosine fade, default -20 dBFS, UI cannot exceed -12 dBFS. Calibration applicability: `isProfileApplicable(profile,{deviceName,sampleRate,maxAgeDays:365})`. Resume rule: restore if `updatedAt` < 30 days, else offer restart.

## 7. Errors, edge cases, privacy
Device unplugged mid-wizard: input select reverts to "(not found)", Next stays enabled but flagged. Selected output unsupported in WebView2: hide output select, note "Uses system default output". Tone must always stop on Back/Esc/dialog close/`visibilitychange`. Duplicate asset creation prevented by product-id check inside one transaction. Wizard state contains device names only; nothing leaves the machine; no serials requested. All SQL parameterized.

## 8. Test plan
Unit (`tests/setup-wizard-model.test.mjs`): reducer transitions, skip semantics, resume after step N, migrate unknown version, summarize with missing answers, step list omits health in browser. Level verdict table. Rust: `wizard_state_save/get` round-trip in-memory DB, `wizard_create_assets` idempotent, unknown product id rejected. UI smoke (`tools/ui-smoke.mjs`): fresh storage -> wizard visible; Skip -> Quick visible; reload -> no wizard; Options re-run opens at step 1 with values prefilled; reload at step 3 shows resume banner. Windows CI: `cargo test` on wizard commands. Manual: with Traktor Audio 8 DJ pick input/output, tone through Rane Twelve/Xone:23C line input, verify meter; patch loopback, calibrate; tick PLX-CRSS12, SL-1200MK4, DJM-A9; unplug interface at step 3 and confirm error panel.

## 9. Definition of done
- [ ] All AC pass; wizard skippable at every step; tone always stops
- [ ] a11y audit (focus order, announcements, 200% zoom)
- [ ] Migration applied and idempotent; browser fallback works
- [ ] Docs: README feature list, SPEC-13 flows, IMPLEMENTATION-STATUS
Rollout: setting `wizard.enabled` default true; kill switch constant in `setup-wizard.js`.

## 10. Dependencies, risks, open questions, effort
Depends on: Calibration screen refactor (embedded mode), device library sync (`device_profiles_sync`), System Health (SPEC-17 contract), spec 08 (shares `app_state`). Risks: embedding the Calibration screen couples layout; WebView2 output-device selection (`setSinkId`) availability — UNKNOWN, needs verification on target runtime. Open: should the wizard be shown on upgrade installs with existing data? (proposed: no, mark `completed` if runs exist). Effort: L (~24 agent-hours).

## 11. Research notes
Internal sources only: `app/calibration.js` (loopbackStimulus, analyzeLoopback, isProfileApplicable), `app/ui/screens/calibration.js`, `app/ui/audio-io.js`, `docs/SYSTEM-CHECK-CONTRACT.md`, `app/ui/state.js` settings keys. No external research required.
