# Roland DJ-808 — audio capability research

Checked **2026-11-18** for the exact DJ-808. This remains a research seed with
manufacturer-sourced capabilities and no physical qualification.

## Sources and applicability

| Source | Relevant sections | Revision |
| --- | --- | --- |
| [Official Owner's Manual](https://static.roland.com/assets/media/pdf/DJ-808_eng03_W.pdf) | Printed p. 3; standalone mode, p. 21; System Settings, p. 22; Main Specifications, p. 32 | Copyright **2016**, filename/footer code **03**; no exact release date identified. These are document identifiers, not firmware. |
| [Sampling Rate support article](https://support.roland.com/hc/en-us/articles/115002781883-DJ-808-Sampling-Rate-System-Setting-PAD-1) | System Setting, pad 1 | Updated **2024-03-29**; exact DJ-808 rate setting. |

## Profile decisions

| Field | Recorded value | Evidence |
| --- | --- | --- |
| `connectivity.audio.sampleRatesHz` | `[44100, 48000, 96000]` | The rate setting explicitly enumerates all three values. |
| `connectivity.midi.usbMidi` | `true` | The manual's standalone-mode section sends controller MIDI through the USB PC port. |
| `connectivity.audio.usbChannelsIn` / `usbChannelsOut` | `null` / `null` retained | Computer audio playback is documented, but numeric USB channel counts are unresolved. |
| `connectivity.audio.bitDepth` | `null` retained | Main Specifications distinguish 24-bit A/D and 32-bit D/A conversion; a generic USB stream word length is not established. |

The existing 24-bit spec remains unchanged. Its value must not collapse the
manual's distinct converter depths into a claimed USB format. The previously
recorded 96 kHz spec also remains; the new list records the other documented
selectable rates.

The PC connection uses USB type B. The AIRA USB-host ports are separate inputs
for attached devices; their count and the four mixer channels do not determine
computer audio channel counts. MIDI OUT is described for synchronization, while
the documented standalone controller messages use the PC port. Exact MIDI maps
and the existing DIN field remain unchanged.

The actual planner retains a conditional `audio:quality` test. All handwritten
checks, USB IDs, class compliance, software minimum version, hardware revision
and firmware/platform qualification remain unchanged or unverified.
