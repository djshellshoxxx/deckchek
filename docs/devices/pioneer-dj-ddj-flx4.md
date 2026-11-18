# Pioneer DJ DDJ-FLX4 — audio capability research

Checked **2026-11-18** for the exact **DDJ-FLX4**. This remains a research seed;
manufacturer specifications do not qualify a physical unit or current host.

## Source and applicability

The official [Instruction Manual](https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-FLX4/DDJ-FLX4_DRI1804A_manual.pdf)
is **DRI1804-A**, with a 2022 copyright footer. That identifies the document,
not a qualified firmware or hardware revision. Relevant printed sections are
pp. 34–35, 49, 157–161.

## Profile decisions

| Field | Recorded value | Evidence or unresolved scope |
| --- | --- | --- |
| `connectivity.audio.sampleRatesHz` | `[44100, 48000]` | P. 159 enumerates both rates. |
| `connectivity.midi.usbMidi` | `true` | P. 161 explicitly describes MIDI control over USB. |
| `connectivity.audio.usbChannelsIn` / `usbChannelsOut` | `null` / `null` retained | P. 49 names MASTER and PHONES software routes but does not enumerate individual USB channels. |
| `connectivity.audio.bitDepth` | `null` retained | P. 159 lists 16-bit/24-bit conversion; a single USB bit-depth value is not established. |

Pp. 34–35 distinguish the USB power port from the device connection. P. 160
lists RCA master and stereo mini-jack headphone outputs; physical sockets do
not establish USB channel counts. Pp. 157–158 distinguish USB audio output
from Bluetooth operation, where sound is routed through the mobile device.

The actual planner retains a conditional `audio:quality` test. All ten
handwritten checks, existing specifications and class-compliance claim,
USB IDs, DIN MIDI, control maps, software minimum versions and
firmware/hardware qualification remain unchanged.
