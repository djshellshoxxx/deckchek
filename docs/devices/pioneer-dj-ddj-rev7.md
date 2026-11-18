# Pioneer DJ DDJ-REV7 — audio capability research

Checked **2026-11-18** for the exact **DDJ-REV7**. This research seed records
documented PC/Mac routing per host connection; no physical unit, current OS,
driver version or firmware is qualified.

## Sources and applicability

| Source | Sections | Document provenance |
| --- | --- | --- |
| [Instruction Manual](https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-REV7/DDJ-REV7_DRI1713D_manual.pdf) | Printed pp. 21–24, 30, 105–106, 108–110 | **DRI1713-D**, copyright 2021; the document identifier is not firmware. |
| [Manufacturer controller comparison](https://www.pioneerdj.com/en/landing/comparison/dj-controller/) | **Audio Spec → Audio IF - Sampling Rate**, DDJ-REV7 column | Undated page, checked above; interface format is **48k/24bit**. |

## Profile decisions

| Field | Value | Evidence |
| --- | --- | --- |
| `connectivity.audio.usbChannelsIn` | `10` | P. 24 numbers device-to-computer pairs USB 1/2 through 9/10; p. 30 specifies selectable sources and fixed FX sends. |
| `connectivity.audio.usbChannelsOut` | `10` | P. 23 numbers computer-to-device pairs 1/2, 3/4, 5/6, 7/8 and 9/10 for CH1, CH2, sampler, FX RETURN1 and FX RETURN2. |
| `connectivity.audio.sampleRatesHz` | `[48000]` | P. 106 and the comparison page. |
| `connectivity.audio.bitDepth` | `24` | P. 106 converter specification and the comparison page's audio-interface format. |
| `connectivity.midi.usbMidi` | `true` | P. 105 explicitly describes MIDI control over USB. |

P. 21 distinguishes the Windows driver from the Mac Setting Utility. The
routing screenshots show the documented utility configuration, and p. 110
shows both host connections. Counts are not aggregated across ports. P. 108
specifies two physical USB Type-B ports; A/B labels identify host connections.

The positive output count selects a confirmed `audio:quality` diagnostic; it
does not certify hardware or its host setup. All handwritten checks and
existing specs remain intact, including earlier REV7-N source references.
USB IDs, class compliance, DIN MIDI, control maps, software minimum versions
and firmware/hardware qualification remain unchanged.
