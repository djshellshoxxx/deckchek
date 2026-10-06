# SPEC-13: GUI and User Experience

## 1. Purpose

Specify the desktop user interface required to guide a user from equipment setup to a reproducible diagnostic report. The UI must make signal setup understandable, prevent accidental routing assumptions, and show the difference between observations and conclusions.

This document specifies user-visible behavior. DSP formulas remain in SPEC-01 through SPEC-06; shared session and evidence contracts remain in SPEC-00 and SPEC-07.

## 2. Users and primary jobs

| User | Primary job |
|---|---|
| DJ / performer | Quickly confirm that their setup is ready and spot obvious issues |
| Technician / repairer | Run repeatable tests, inspect raw evidence, isolate likely causes |
| Rental / fleet operator | Create asset baselines and compare later returns |
| Collector / buyer | Document condition without overstating a test result |
| Venue technician | Compare booth positions and environment conditions |

The app must support both a guided path for occasional users and a technical path for experienced operators.

## 3. Navigation model

The primary navigation contains:

1. **Home** — recent sessions, setup readiness, resume/recover actions, and start-test choices.
2. **Equipment** — product catalog, owned assets, connections, setup profiles, calibration, and maintenance history.
3. **Test** — choose a category and guided test plan; confirm media, hardware, route, and safety conditions.
4. **Live Test** — progress, levels, quality flags, user prompts, pause/stop, and optional raw monitor views.
5. **Results** — findings, evidence, hypotheses, confidence, limitations, and next isolation steps.
6. **Compare** — compatible sessions/setups side by side with incompatibilities explained.
7. **Reports & Data** — export, backup, restore, and privacy controls.
8. **Settings** — audio/MIDI devices, storage, privacy, accessibility, display, and diagnostics.

The free MIDI Tester may have a narrower standalone navigation; paid DeckChek editions share the same concepts and capability-gated categories.

## 4. Core screen requirements

### 4.1 Home

- Show the selected setup profile and whether its required components are known.
- Present **Quick Check**, **Guided Diagnostic**, **Full-Side Scan**, and **Compare** only when available for the selected edition and hardware.
- Show recent session state: complete, incomplete, recovered, or needs review.
- Never present a green “ready” indicator based solely on device enumeration. Show the checks that passed and still need user confirmation.

### 4.2 Equipment and signal chain

- Present a visual, editable chain of named components with input/output ports and cables/links.
- Let users record a physical connection even when the software cannot verify it.
- Distinguish actual device instances from catalog product models.
- Mark each edge as **user-declared**, **software-observed**, **externally measured**, or **unknown**.
- Show incompatible or incomplete connections; do not auto-correct the user's stored profile.
- Permit multiple capabilities on one asset (for example, controller + audio interface, or motorized control surface + DVS output).

### 4.3 Test setup wizard

Each wizard step includes:
- task title and why it matters;
- required and optional equipment;
- a text wiring diagram plus labeled ports;
- expected signal/media and test duration;
- current device, channel map, sample rate, and gain/mode selection;
- concrete instruction to perform;
- **Back**, **Continue**, **Cancel**, and, where safe, **Skip**;
- the consequence of skipping and which results become unavailable or lower confidence.

The wizard must not imply that a user-entered setup is verified. Require explicit confirmation before starting a test with unverified physical wiring.

### 4.4 Live test

- Show elapsed time and expected remaining time when known.
- Show input level by channel with clipping and too-low warnings.
- Show current step and required user action, using both text and visual indication.
- Provide pause/stop. Stopping finalizes an incomplete session where possible.
- Show detected device loss, sample-rate changes, buffer drops, and quality flags as they occur.
- Advanced traces (waveform, spectrum, scope) are opt-in and must not obscure the guided status.
- Do not show a diagnosis as final while a test is still collecting evidence.

### 4.5 Results

Use the following hierarchy:
1. session validity and quality;
2. measured results with values and units;
3. derived indicators;
4. diagnostic hypotheses with confidence and alternatives;
5. suggested isolation tests;
6. setup, calibration, media, and method provenance.

Every conclusion links to its supporting measurement/evidence IDs. Include untested, unsupported, skipped, invalid, and inconclusive tests in coverage details. A report must not convert missing data into a zero or a pass.

### 4.6 Compare

- Default to comparing compatible metrics only.
- For incompatible methods, show both measurements and the reason no direct difference/score is offered.
- Provide a link to the full source session and its quality flags.
- Keep **health** and **match to another device** as separate concepts, as specified in SPEC-06.

## 5. Interaction and visual behavior

- Use consistent labels for product, owned asset, setup, test plan, session, capture, evidence, and finding.
- Put units beside numeric values; provide a definition on hover/focus for specialized terms.
- Use color plus text/icon/pattern, never color alone, for pass/warning/fail/unavailable.
- Use confirmation for destructive data actions and for tests that can produce sound through an output route.
- Preserve wizard inputs when navigating backward; cancellation must clearly state whether capture was saved.
- Autosave profile edits and show save/error status. Do not auto-save in a way that mutates a completed session snapshot.
- Keyboard focus order follows the visible layout. Every action has a keyboard-accessible name.
- Provide scalable text, high-contrast support, reduced motion, and screen-reader labels for controls, plots, and status changes.
- Live level displays must have a non-flashing mode and an accessible numeric alternative.

## 6. Edition and capability gating

- A locked test explains which edition/capability is required, without hiding the user's data or existing reports.
- An unavailable hardware-dependent test explains the missing capability (for example, no stereo input or no calibration).
- The free MIDI Tester exposes MIDI monitoring and its SPEC-11 functions only; do not show audio analysis as a supported free feature.
- Ultimate reveals all licensed categories without duplicating assets, measurements, or session history.
- Do not use “certified,” “pass,” or “healthy” when the corresponding validation criteria have not been defined and met.

## 7. Error and empty states

Every screen must define:
- first-run / no device / no setup;
- permission denied;
- device busy or disappeared;
- unsupported format or test;
- no signal / too-low signal / clipping;
- database unavailable or storage full;
- incomplete or recovered session;
- no comparison-compatible measurements;
- failed export;
- edition unavailable.

Each state explains what happened, what data is safe, and the next action. Errors must not be represented only by a transient toast.

## 8. Acceptance criteria

- A first-time user can create a setup, understand the required physical wiring, select a capture device, and start a valid Quick Check without relying on hidden assumptions.
- A technician can open raw or advanced views without losing the guided test state.
- All screen conclusions trace to evidence and show quality flags and provenance.
- Every unavailable/unsupported/skipped/invalid state is visually distinct from pass/fail.
- All primary flows are operable by keyboard and communicate status without color-only cues.
- A user can stop a test, return to Home, and later identify whether its partial results are usable.
- Capability gating never blocks access to user-owned data or exported results.
