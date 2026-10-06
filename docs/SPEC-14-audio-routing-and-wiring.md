# SPEC-14: Audio Routing and Physical Wiring

## 1. Purpose

Define how a user's physical DJ signal chain connects to DeckChek's capture devices, how software routing is selected, and what can or cannot be claimed from each path.

SPEC-00 defines capture metadata and calibration domains. Feature-specific tests and limits remain in their existing specifications. This document owns safe setup guidance and the route-verification contract.

## 2. Core safety and truth rules

1. DeckChek is initially an analyzer and recorder. It does not silently generate, route, monitor, or send audio to speakers.
2. Opening a capture stream must not change OS default devices, mixer routing, device gain, phantom power, phono/line mode, or DJ software settings.
3. DeckChek can observe only the signal at its selected capture point. It must describe the tested path, not claim that an unobserved downstream device works.
4. A software loopback measurement is not proof of acoustic output from a speaker or headphone.
5. A cartridge/phono-level signal must not be connected to a line input unless an appropriate phono preamp is in the path. The UI must call this out before recording if the user declares that routing.
6. Do not use a powered speaker/amplifier output as an interface line input. Do not instruct the user to connect speaker-level outputs to the capture interface.
7. If a proposed test requires audible stimulus or a loopback cable, explain the route, level, monitoring state, and stop procedure before enabling it.

## 3. Route model

Represent a route as a directed graph:

- **Node:** physical or software component with named ports (turntable, cartridge, mixer, phono preamp, CDJ/controller, audio interface, host loopback, recorder).
- **Edge:** cable, wireless/software route, or user-declared connection.
- **Port:** typed source/sink with channel count and signal class (phono, line, headphone, speaker-level, digital PCM, MIDI/HID, unknown).
- **Observation point:** the exact selected input where samples/events are captured.
- **Provenance:** user-declared, OS-enumerated, device-reported, or externally verified.

Persist a route snapshot with every test session. Later profile edits must not rewrite the historical route.

## 4. Common vinyl capture wiring

### 4.1 Preferred diagnostic path

For turntable/cartridge/phono diagnosis:
- Turntable cartridge output → phono preamp or mixer PHONO input (with correct ground lead) → line-level REC/BOOTH/MASTER output at a safe level → stereo line input on audio interface → DeckChek.
- When isolating turntable/cartridge from a mixer, use a known external phono preamp and document it.
- Select **PHONO** only for a device input explicitly designed for phono-level input and RIAA equalization; select **LINE** for a preamplified line-level signal.

The app cannot infer from voltage alone that the correct RIAA stage or grounding is present. It records declared input mode and can flag contradictory evidence.

### 4.2 Avoid hidden processing

If the mixer, controller, operating system, or driver applies EQ, compression, normalization, noise reduction, effects, or automatic gain, record that state. Where possible, guide the user to a flat/neutral capture route. Do not silently remove processing or assert calibrated response when it is unknown.

## 5. CDJ/controller capture wiring

- For analog output checks, connect the selected player/controller MASTER/BOOTH/REC line output to the interface line input. Keep headphone and speaker outputs out of line-level inputs unless their level can be controlled and the UI gives an explicit, validated procedure.
- For digital output checks, capture the supported digital PCM output with a compatible receiver/interface and preserve sample-rate and clock-lock status. Do not label an analog capture as a digital-output measurement.
- Controller-integrated interfaces may expose separate master, booth, cue, and input channels. Require explicit channel mapping before a multichannel test.
- A controller's MIDI/HID control data is a separate route from audio. The selected control endpoint, protocol, port, and event permissions are recorded separately.
- The app must not attempt to control transport, cue, jog, motor, lighting, or performance controls unless a separately specified, user-confirmed integration explicitly supports it.

## 6. Device discovery and selection

- Enumerate capture devices through the platform backend and display stable identifier, friendly name, backend, input/output capability, channel count, and supported sample rates/formats when available.
- Distinguish a physical interface from OS loopback/monitor sources.
- Never select a device only by a non-unique friendly name. Persist both stable ID (if available) and display name.
- On disconnect/reconnect, do not silently switch to another device. Pause/stop capture, mark the gap/discontinuity, and ask the user to select/reconfirm.
- On shared/exclusive access failure, report that another application may be holding the device and offer a retry path.
- Device enumeration is not proof of working analog input or correct cable routing.

## 7. Channel mapping

Before a stereo test:
- show source channels and the assigned Left/Right inputs;
- offer a short level-only preview only after explicit user start;
- warn if mono, duplicated, swapped, or unknown channel mapping is detected;
- allow labeling of multichannel input channels but preserve the raw hardware indices;
- do not auto-swap channels based on content without showing the inferred mapping and retaining the original map.

If only mono is available, stereo balance, separation, phase, and crosstalk tests are unavailable; unrelated mono-safe tests may proceed.

## 8. Calibration and level setup

- Calibration is specific to interface, physical port, gain setting, sample rate, and route.
- Store calibration identity and validity range. Changing a material route or gain invalidates or suspends its use.
- A loopback calibration may characterize interface/channel gain and phase; it does not calibrate the turntable, mixer, or physical speaker chain.
- Display peak and RMS input level with units/scales; detect clipping and too-low signal before starting tests that require clean capture.
- Recommend gain changes as user actions. DeckChek must not change hardware gain unless a future, explicitly supported control API and confirmation are specified.
- Any test with an output stimulus is disabled by default, uses a stated safe level, and provides a visible stop action. Avoid acoustic feedback loops: do not route the captured output back to an amplified speaker during a calibration loop unless the specific test requires it and explains safeguards.

## 9. Routing quality flags

At minimum, map the following to session quality:
- wrong/unknown input mode suspected;
- phono RIAA unknown;
- mono for stereo-required test;
- channel assignment unknown/swapped/duplicated;
- clipping / too low;
- device changed or disconnected;
- sample-rate mismatch/change;
- loopback route not calibrated;
- hidden processing suspected or declared;
- external speaker/acoustic path not observed;
- physical wiring user-declared only.

Flags reduce confidence only for tests they affect; do not invalidate unrelated results automatically.

## 10. Acceptance criteria

- A user can inspect the complete declared route and exact observation point before capture.
- Every capture persists selected device identity, backend, channel map, input mode, signal class, calibration, and route provenance.
- Disconnects never silently reroute or stitch non-contiguous samples into a continuous capture.
- The UI warns against cartridge-to-line, speaker-output-to-line-input, and unsafe feedback routes.
- A route report states what was measured and names downstream components that were not observed.
- Stereo-only tests are unavailable when only one independent channel is captured.
- Output stimulus and audio monitoring remain off until explicitly requested.
- Loopback calibration results cannot be presented as acoustic speaker/headphone measurements.
