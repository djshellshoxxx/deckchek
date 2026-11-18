# Novation Launchpad Pro MK3 — audio capability research

Checked **2026-11-18** for Launchpad Pro MK3. These are manufacturer-documented
capabilities, not results from a physical unit.

## Sources and applicability

| Source | Relevant content | Revision |
| --- | --- | --- |
| [User-guide introduction](https://userguides.novationmusic.com/hc/en-gb/articles/25494488223762-Introduction-to-the-Launchpad-Pro-MK3) | Exact model, MIDI ports and supplied adapters | User-guide version 6.0; page updated 2026-07-17. This is a document version, not firmware qualification. |
| [Hardware overview](https://userguides.novationmusic.com/hc/en-gb/articles/25494505681042-Launchpad-Pro-MK3-hardware-overview) | Rear-panel USB-C and MIDI connector list | Page updated 2025-04-23. |
| [No-sound support article](https://support.novationmusic.com/hc/en-gb/articles/360001341549-I-m-not-hearing-sound-from-my-Launchpad) | Applies to all Launchpads; MIDI control and host audio output | Page updated 2024-03-15. |
| [Programmer's reference manual](https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/downloads/LPP3_prog_ref_guide_200415.pdf) | Printed pp. 3 and 6: USB MIDI and MIDI interfaces | Filename identifier `200415`; no publication date or firmware version inferred. Linked by the [official downloads page](https://downloads.novationmusic.com/novation/launchpad-mk3/launchpad-pro-mk3-0). |

## Profile decisions

| Field | Recorded value | Evidence |
| --- | --- | --- |
| `connectivity.audio` | `null` | The support article directs audio through the host's selected sound card or speakers; the exact-model hardware overview lists USB-C and MIDI ports, with no audio output. |
| `connectivity.midi.usbMidi` | `true` | The programmer's manual explicitly documents MIDI over USB. Its MIDI, DIN and DAW interfaces are MIDI interfaces, not USB audio channels. |
| `connectivity.analog` | `[]` | The physical TRS minijacks carry MIDI, not analog audio. |
| `connectivity.midi.din` | `null` retained | The schema does not distinguish native five-pin sockets from adapter-based MIDI connectivity. |

Physical connections are USB-C and TRS MIDI In, Out 1, and Out 2/Thru, with
supplied TRS-to-DIN adapters. The explicit lack of a built-in audio interface
removes the generated `audio:quality` test while preserving the MIDI plan and
existing handwritten tests.

USB IDs, class compliance, the incomplete control map, OS/firmware compatibility,
and physical qualification remain unchanged. The reference manual is a source
for transport evidence; its control messages have not been imported into the map.
