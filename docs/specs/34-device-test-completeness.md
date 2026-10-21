# SPEC-34 Device test completeness

Status: implemented. Packaging: inside DeckChek (`app/devices/test-plan.js`, `tools/check-device-coverage.mjs`). Size: M. No migration. No feature flag (additive tests inside the existing Devices screen).

## 1. Summary
Every shipped device profile must be *fully testable*: each capability the device has (USB MIDI, audio output, driver, DJ software, timecode, physical controls) is covered by at least one runnable test, every test dispatches to a runner, and every pass criterion names a metric that the test's method actually produces. Today most controller and mixer profiles carry only `midi:*`, one `quick:Signal health` and checklists; none test output audio quality or generic MIDI conformance (SPEC-35, SPEC-36).

## 2. Goals / Non-goals
Goals: (a) capability model derived from the profile; (b) a *baseline plan* of generic tests auto-added where a capability has no test; (c) a metric registry (method → metricIds) so pass criteria are checkable; (d) an audit that reports gaps, enforced by a unit test over all profiles and a CLI that prints a coverage matrix.
Non-goals: inventing manufacturer specs (auto tests use `source: "DeckChek test definition"` thresholds, confidence `unverified` for the device); editing the 47 profile JSON files; replacing hand-written tests (a profile test always wins over an auto test).

## 3. Capability model
`capabilitiesOf(profile) -> {usbMidi, midiMap, audioOut, audioIn, driver, software, timecode, physical, gmSource}`
- `usbMidi`: `connectivity.midi` present, or `midi` block present.
- `midiMap`: `midi` block present (learn mode counts).
- `audioOut`: `connectivity.audio.usbChannelsOut > 0`, or category in `controller|mixer|audio-interface` (they all output audio even when the profile has no `connectivity.audio` yet), or a turntable/other with `connectivity.analog` listing outputs *and* a timecode block is false (turntables are measured through speed/cartridge tests, not stimulus playback).
- `audioIn`: `connectivity.audio.usbChannelsIn > 0`.
- `driver`: `drivers.length>0`; `software`: `software.length>0`; `timecode`: `timecode` block; `physical`: always.
- `gmSource`: optional new schema field `midi.generalMidi === true` (device has a built-in General MIDI sound source).

## 4. Baseline plan (`completePlan(profile)`)
Adds a test only when no existing test has the same method (and, for `midi:*`, the same `controlId` set). Added tests carry `auto: true`, id `auto-<slug>`, `severity: "minor"` unless noted.

| Capability | Auto test | Method | Category |
|---|---|---|---|
| physical | Physical inspection (connectors, faders, knobs, jogs, display) | `manual:inspection` | mechanical |
| driver | Driver present and healthy | `driver:check` | driver |
| software | DJ software log scan | `software:check` | software |
| usbMidi | MIDI conformance (SPEC-36) | `midi:conformance` | midi |
| midiMap (not mixer-only without controls) | Control coverage | `midi:coverage` | midi |
| usbMidi | MIDI timing jitter | `midi:latency` | latency |
| audioOut | Output audio quality (SPEC-35) | `audio:quality` | audio |
| gmSource | General MIDI sound check (SPEC-36) | `midi:gm` | midi |

Plan application: `ensureLibrary()` (`app/ui/devices/library-state.js`) passes every loaded profile through `completePlan` (kept out of `loadProfiles` to avoid a module cycle), so every consumer (Devices screen, queue runner, progress, reports) sees the full plan. `profile.autoTests` = number added.

## 5. Metric registry and audit
`METRICS_BY_METHOD` maps method → metricIds the runner emits (e.g. `midi:fader` → `midi_fader_*`, `audio:quality` → `aq_*`). `auditProfile(profile) -> {gaps:[{code,message}], coverage}` checks:
- `no-runner`: a test does not dispatch to a runner.
- `unknown-metric`: a `pass.metricId` is not emitted by the test's method (workflow methods are exempt; their metric ids come from the engine and are listed in `WORKFLOW_METRICS`).
- `no-steps`: a test has no steps.
- `uncovered-capability`: a capability from §3 has no covering test after completion.
- `duplicate-id`.
AC-1 Given all shipped profiles, When audited after `completePlan`, Then there are zero gaps (unit test). AC-2 Given a profile with `midi` and no `midi:conformance`, Then `completePlan` adds exactly one. AC-3 Given a hand-written test with the same method, Then no auto test is added. AC-4 `node tools/check-device-coverage.mjs` exits 1 on any gap and `--markdown` writes `docs/testing/DEVICE-TEST-COVERAGE.md`.

## 6. Quality / failure
Auto tests never replace hand-written ones; pass thresholds on auto tests cite "DeckChek test definition" and the report already flags such thresholds as DeckChek's own. Old saved results for hand-written tests are unaffected (ids unchanged).
