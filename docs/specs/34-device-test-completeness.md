# SPEC-34 Device test completeness

Status: implemented in software (ported 2026-11-18 from PR9 `a4d844b`, with explicit audio and MIDI applicability rules in §3). Packaging: inside DeckChek (`app/devices/test-plan.js`, `tools/check-device-coverage.mjs`). Size: M. No migration. No feature flag (additive tests inside the existing Devices screen). Auto tests are only as runnable as their runners: `audio:quality` needs FS-35 and `midi:conformance`/`midi:gm` need the FS-36 panels; none of the three is hardware-qualified.

## 1. Summary
Every shipped device profile must have complete *plan coverage*: each declared or conditional capability (MIDI, audio output, driver, DJ software, timecode, physical controls) has a test, every test dispatches to a runner, and every pass criterion names a metric that the test's method actually produces. Unresolved prerequisites stay visible; zero plan gaps do not establish transport support, physical testability or hardware qualification. Generic output audio quality and MIDI conformance tests complement the handwritten profile tests (SPEC-35, SPEC-36).

## 2. Goals / Non-goals
Goals: (a) capability model derived from the profile; (b) a *baseline plan* of generic tests auto-added where a capability has no test; (c) a metric registry (method → metricIds) so pass criteria are checkable; (d) an audit that reports gaps, enforced by a unit test over all profiles and a CLI that prints a coverage matrix.
Non-goals: inventing manufacturer specs (auto tests use `source: "DeckChek test definition"` thresholds, confidence `unverified` for the device); editing the profile JSON files; replacing hand-written tests (a profile test always wins over an auto test).

## 3. Capability model
`capabilitiesOf(profile) -> {midi, usbMidi, dinMidi, midiMap, audioOut, audioIn, driver, software, timecode, physical, gmSource}`
- `usbMidi` and `dinMidi`: the explicit Boolean values of `connectivity.midi.usbMidi` and `connectivity.midi.din`; missing, null or otherwise unasserted values remain `null`. These are transport facts, not method-requirement keys. USB connector presence does not prove USB MIDI, and USB absence does not prove the absence of DIN MIDI.
- `midi`: generic MIDI planning applicability. `true` when either transport is explicitly true; `false` only when both are explicitly false; `'conditional'` when a MIDI map/learn scaffold or connectivity block exists but neither transport is established; `null` when there is no MIDI evidence or scaffold. The last two states must not be presented as a factual negative. A DIN fact establishes no port direction.
- `midiMap`: raw `midi` block presence (learn mode counts). `requiredCapabilities()` combines it explicitly with `midi` applicability for both coverage and timing. Thus an unknown-transport learn scaffold yields `'conditional'` for conformance, coverage and timing; explicit false/false yields no automatic conformance, coverage or timing requirement. The existing explicit General MIDI opt-in remains separate. Conditional values must not be collapsed to `true` by a truthy Boolean expression.
- `audioOut` (`audioOutCapability`): `false` when `connectivity.audio` is explicitly `null` (researched: no built-in audio interface, e.g. Rane Twelve MK2); otherwise a numeric `connectivity.audio.usbChannelsOut` decides (`> 0`, or any mixer/audio interface, which always has an output); with no researched count, `true` for `mixer|audio-interface`, **`'conditional'` for `controller`** and `false` for everything else (turntables are measured through speed/cartridge tests, not stimulus playback). PR9 treated every controller as having an audio output; most profiles record `usbChannelsOut: null`, so pure MIDI surfaces (nanoKONTROL2, APC40 MKII, Launch Control XL, Launchpad Pro, Kontrol F1) would have received an audio test they cannot run. A conditional auto test carries `params.condition` ("Only when the unit has its own audio output … Skip it for a MIDI-only controller") and severity `minor`, and the coverage matrix marks it `✓?`. Recording the real output count in a profile removes the condition.
- `audioIn`: `connectivity.audio.usbChannelsIn > 0`.
- `driver`: `drivers.length>0`; `software`: `software.length>0`; `timecode`: `timecode` block; `physical`: always.
- `gmSource`: optional new schema field `midi.generalMidi === true` (device has a built-in General MIDI sound source).

## 4. Baseline plan (`completePlan(profile)`)
Adds a test only when no existing test has the same method. Added tests carry `auto: true` and a fixed id `auto-<capability>` (suffixed with `-x` on a clash with a hand-written id); severity is per row below.

| Capability | Auto test | Method | Category |
|---|---|---|---|
| physical | Physical inspection (connectors, faders, knobs, jogs, display) | `manual:inspection` | mechanical |
| driver | Driver present and healthy | `driver:check` | driver |
| software | DJ software log scan | `software:check` | software |
| midi | MIDI conformance (SPEC-36) | `midi:conformance` | midi |
| midi and midiMap | Control coverage | `midi:coverage` | midi |
| midi and midiMap | MIDI timing jitter | `midi:latency` | latency |
| audioOut (`true`: major; `'conditional'`: minor with `params.condition`) | Output audio quality (SPEC-35) | `audio:quality` | audio |
| gmSource | General MIDI sound check (SPEC-36) | `midi:gm` | midi |

Generated MIDI IDs remain `auto-midi-conformance`, `auto-midi-coverage` and `auto-midi-timing`, with the existing collision suffix behavior. Unknown applicability adds `params.condition` to each generated MIDI test. The runner displays that condition and offers a direct Skip action even when the backend or input is unavailable. Skip records that the prerequisite was not established; it does not assert that the hardware lacks MIDI. It retires only the current run's owned connection and cannot replace a saved capture.

`midiPrerequisites()` supplies the planner and runner with shared connection guidance. Confirmed USB MIDI gets direct USB instructions. DIN guidance requires a **documented device DIN OUT → MIDI interface IN**; the DIN Boolean alone does not establish that output. Unknown transport first requires the unit's documented MIDI capability and a supported connection. Output selection is optional and requires a documented receiving connection. Identity replies are optional evidence. Coverage concerns documented/configured MIDI controls; learn mode discovers messages and does not establish a full physical control map. Timing requires an available continuous MIDI control, not a jog wheel on every device.

Generated conformance tests without confirmed USB MIDI carry `params.outputSelection: 'explicit'`. For these generated tests only, the runner starts with no output and clears the choice on input change or refresh, so an automatic name match or sole input/output pair cannot initiate a probe. An explicit output selection enables the existing connection-owned probe. Confirmed-USB generated tests and handwritten tests retain their existing pairing behavior. Input name matching still does not establish physical device identity; see [SPEC-36 §6](36-general-midi-test.md#6-native-port-selection-and-remaining-identity-limits).

Plan application: `ensureLibrary()` (`app/ui/devices/library-state.js`) passes every loaded profile through `completePlan` (kept out of `loadProfiles` to avoid a module cycle), so every consumer (Devices screen, queue runner, progress, reports) sees the full plan, while `store.syncDeviceProfiles` still receives the researched profiles unchanged. Saved results key on the test id as free text (`device_test_result.test_id`), so auto-test results need no schema change. `profile.autoTests` = number added. The original port reported 188 auto tests across 45 profiles; the [generated matrix](../testing/DEVICE-TEST-COVERAGE.md) records current counts and conditional prerequisites. One deliberate exception: the FS-20 certificate plan (`certificatePlan` in `app/certificate.js`) excludes `auto` tests, because a signed certificate binds to the researched profile's id and version and must not gain required tests without a profile version change.

## 5. Metric registry and audit
`METRICS_BY_METHOD` maps method → metricIds the runner emits (e.g. `midi:fader` → `midi_fader_*`, `audio:quality` → `aq_*`). `auditProfile(profile) -> {gaps:[{code,message,testId}], covered, capabilities}` checks:
- `no-runner`: a test does not dispatch to a runner.
- `unknown-metric`: a `pass.metricId` is not emitted by the test's method (workflow methods are exempt; their metric ids come from the workflow engines).
- `no-steps`: a test has no steps.
- `uncovered-capability`: a capability from §3 has no covering test after completion.
- `duplicate-id`.
AC-1 Given all shipped profiles, When audited after `completePlan`, Then there are zero plan gaps (unit test). AC-2 Given explicit MIDI transport and no `midi:conformance`, Then `completePlan` adds exactly one; a scaffold with unknown transport adds a conditional test; explicit USB=false and DIN=false suppress automatic conformance, coverage and timing tests; absent/null data remains unasserted. AC-3 Given a hand-written test with the same method, Then no auto test is added and the original object remains unchanged. AC-4 `node tools/check-device-coverage.mjs` exits 1 on any gap, `--markdown` writes `docs/testing/DEVICE-TEST-COVERAGE.md` and `--check` fails when that file is stale; `tests/device-test-plan.test.mjs` asserts the committed file equals the rendered matrix, so `npm test` (the CI `javascript-tests` job) enforces AC-1 and AC-4 without a separate workflow step. AC-5 Given `connectivity.audio: null`, Then no `audio:quality` test is added; given an unknown output count on a controller, Then the added test is conditional. AC-6 Unknown MIDI applicability propagates through conformance, coverage and timing and their matrix marks. AC-7 Generated DIN/unknown conformance sends nothing until explicit output selection, including when only one host input/output pair exists. AC-8 A conditional direct run displays its prerequisite and can record Skip without a backend/input; skipping preserves a replacement run's input ownership.

## 6. Quality / failure
Auto tests never replace hand-written ones; pass thresholds on auto tests cite "DeckChek test definition" and the report already flags such thresholds as DeckChek's own. Old saved results for hand-written tests are unaffected (ids unchanged).
