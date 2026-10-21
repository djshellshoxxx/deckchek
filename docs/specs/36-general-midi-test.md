# SPEC-36 General MIDI testing (MIDI conformance + General MIDI sound check)

Status: implemented. Packaging: pure `app/midi-conformance.js`, UI panels added to `app/ui/devices/midi-runner.js`, methods `midi:conformance` and `midi:gm`. Size: M. Depends on: `midi.js` (ports, send, onMessage), `midi-tests.js` (`parseMessage`).

## 1. Summary
Two generic MIDI tests usable on any MIDI device: **MIDI conformance** (does the device speak valid MIDI 1.0, answer a universal Identity Request, and behave while its controls are exercised) and **General MIDI sound check** (for devices with a General MIDI sound source: GM System On, program, drum map, volume/pan, pitch bend, polyphony, All Notes Off).

## 2. MIDI conformance (`midi:conformance`)
### 2.1 Active probe
Send Universal Device Inquiry `F0 7E 7F 06 01 F7` (device id 7F = all). A valid reply is `F0 7E <id> 06 02 <mfr 1|3 bytes> <family 2> <member 2> <version 4> F7`. Parse manufacturer id (1 byte, or `00 xx yy`), family, member, version. The manufacturer *name* is not looked up (no verified registry bundled): hex is shown with a pointer to the MIDI Association SysEx ID list. No reply within 1.5 s is a **warning**, not a failure (many DJ controllers ignore it): `midi_identity_reply` = 0/1.
### 2.2 Passive stream validation (user exercises controls for ~15 s)
Each received message (`bytes`) is checked:
- status byte valid (≥ 0x80, not undefined 0xF4/0xF5/0xF9/0xFD); data bytes < 0x80; length matches the status (note/CC/pitch bend = 3; program/channel pressure = 2; poly pressure = 3; song position 3; song select/time code 2; real-time 1) → `midi_invalid_messages`.
- SysEx: starts `F0`, ends `F7`, all inner bytes < 0x80 → `midi_sysex_malformed`.
- Note pairing: note-off (or note-on velocity 0) without a sounding note-on → `midi_orphan_note_offs`; notes still sounding at session end → `midi_stuck_notes`.
- 14-bit CC pairs (CC n and n+32 on one channel, n 0–31) where one half is seen without its partner within 20 ms for ≥ 80 % of events → `midi_unpaired_14bit` count of such controllers (informational flag, not failure).
- Active Sensing (`FE`): if seen, maximum gap must be ≤ 330 ms (spec 300 ms + tolerance) → `midi_active_sensing_gap_ms`.
- MIDI Clock (`F8`): if seen, coefficient of variation of intervals → `midi_clock_jitter_percent`.
- Channels used, message-kind histogram, burst rate (informational in `extra`).
Pass: `midi_invalid_messages equals 0`, `midi_sysex_malformed equals 0`, `midi_stuck_notes equals 0`; orphans are a warning.

## 3. General MIDI sound check (`midi:gm`)
Requires an output port. Only auto-added when `profile.midi.generalMidi === true`; runnable on any device via manual start. GM Level 1 facts used (sources: General MIDI, Wikipedia; MIDI Association specification): GM System On `F0 7E 7F 09 01 F7`; 16 channels, channel 10 is percussion, percussion key map notes 35–81; 128 melodic programs; minimum 24 simultaneous voices (or 16 melodic + 8 percussive); required controllers CC1, 7, 10, 11, 64, 121, 123; default pitch-bend range ±2 semitones; Master Volume `F0 7F 7F 04 01 ll mm F7`.
Step list (each plays audible notes; user answers Yes/No; DeckChek builds exact bytes via `gmSteps()`): 1 System On + reset (CC121) → middle C on program 0 (Acoustic Grand Piano); 2 program sweep (0, 24, 40, 56, 73, 80 on ch1); 3 percussion ch10 notes 35, 38, 42, 46, 49, 51; 4 CC7 volume fade 127→20; 5 CC10 pan hard left→right; 6 pitch-bend up then down; 7 sustain CC64 on/off with a chord; 8 polyphony burst: 24 simultaneous notes across ch1 and ch10 (spec voice count); 9 All Notes Off (CC123) while 6 notes hold → silence expected; 10 Master Volume SysEx half level.
Result: `midi_gm_ok_percent` = Yes ÷ answered ×100; each No becomes a finding naming the feature; pass default `>= 100` (a GM device must support all), steps may be marked N/A.

## 4. Acceptance criteria
- AC-1 `validateMessage` flags every malformed class above and accepts all valid channel/system messages.
- AC-2 `analyzeStream` over a clean synthetic session reports zeros; over crafted sessions reports exact orphan, stuck, malformed-SysEx, active-sensing-gap and clock-jitter values.
- AC-3 `parseIdentityReply` decodes 1-byte and 3-byte manufacturer ids and rejects short/wrong frames.
- AC-4 `gmSteps()` bytes match the GM facts in §3 (System On bytes, ch10 = status 0x99, notes within 35–81, 24-note polyphony, CC121/123/7/10/64 numbers).
- AC-5 No MIDI backend / no ports / no output port → clear empty state, test can be skipped, no crash.
