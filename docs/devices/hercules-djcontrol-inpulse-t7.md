# Hercules DJControl Inpulse T7 — audio capability research

Checked **2026-11-18** for the standard DJControl Inpulse T7. This remains a
research seed with manufacturer-documented capabilities, not physical qualification.

## Sources and applicability

| Source | Relevant sections | Revision |
| --- | --- | --- |
| [English user manual](https://ts.hercules.com/download/sound/manuals/DJC_Inpulse_T7/HERCULES_DJC_INPULSE_T7_-_USER_MANUAL_EN.pdf) | §2, printed p. 8; §3, pp. 41–42; §4, pp. 48–49; §7, p. 75 | Exact standard T7. No document revision or publication date identified. Firmware versions pictured in screenshots are not qualification baselines. |
| [Product specifications](https://www.hercules.com/en-us/product/djcontrol-inpulse-t7/) | Built-in Audio and audio connectors | Unversioned exact-model product page. |

## Profile decisions

| Field | Recorded value | Evidence |
| --- | --- | --- |
| `connectivity.audio.usbChannelsOut` | `4` | Manual §4 routes the selected T7 audio device's Master to 1–2 and headphones to 3–4 on Windows and macOS. |
| `sampleRatesHz` / `bitDepth` | `[44100]` / `24` | Product specifications; already present in the profile's confirmed specs. |
| `connectivity.midi.usbMidi` | `true` | Manual §7 identifies USB Audio and USB MIDI; §3 identifies the USB-B 2.0 computer connection. |
| `connectivity.audio.usbChannelsIn` | `null` retained | The microphone connector and setup screenshots do not establish a qualified USB input-channel count for this update. |

Master connections are balanced XLR L/R and unbalanced RCA L/R, carrying the
same stereo pair. Headphones use 6.35 mm or 3.5 mm stereo jacks; the microphone
input is a balanced 6.35 mm jack. Physical connector alternatives do not add USB
output channels.

The output count makes the generated `audio:quality` test unconditional.
Existing handwritten checks, including platter and effects checks, are preserved.
USB IDs, class compliance, `midi.din`, MIDI port-name patterns and control maps,
OS/firmware compatibility, and physical performance remain unchanged or unverified.
No new pass tolerances or hardware qualification are asserted.
