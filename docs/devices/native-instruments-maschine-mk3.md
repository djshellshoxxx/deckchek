# Native Instruments MASCHINE MK3 — audio capability research

Checked **2026-11-18** for MASCHINE MK3. Manufacturer documentation establishes
the audio capability below; this research seed has no physical qualification.

## Sources and applicability

| Source | Relevant sections | Revision |
| --- | --- | --- |
| [MASCHINE MK3 Getting Started](https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/maschine_277/MASCHINE_MK3_Getting_Started_English_2_7_7.pdf) | §2.1, printed pp. 17–18; §2.2.1, p. 21; §2.3, pp. 23–29 | Identifies MASCHINE MK3 hardware and software **2.7.7 (07/2018)**. This software/document version is not a qualified firmware version. |
| [MASCHINE product specifications](https://www.native-instruments.com/products/maschine) | MK3 audio interface specifications and FAQ | Unversioned product page; use the explicit MK3 hardware statements. |
| [Notes on MASCHINE MK3's audio interface](https://support.native-instruments.com/support/solutions/articles/69000879608-notes-on-maschine-mk3-s-audio-interface) | Microphone/line input exclusivity and playback outputs | Exact MK3 support article; no revision date identified. |

## Profile decisions

| Field | Recorded value | Evidence |
| --- | --- | --- |
| `connectivity.audio.usbChannelsIn` | `2` | Getting Started p. 21 assigns left/right inputs to the first input pair. Microphone insertion disables the line inputs. |
| `connectivity.audio.usbChannelsOut` | `4` | Getting Started p. 21 assigns main left/right to 1/2 and headphone left/right to 3/4. |
| `connectivity.audio.bitDepth` | `24` | Product specification; the existing confirmed bit-depth spec is retained. |
| `connectivity.audio.sampleRatesHz` | `[]` retained | The documented 96 kHz maximum does not enumerate supported hardware rates. The existing maximum-rate spec remains separate. |

The guide connects MK3 to the computer over USB. The main outputs are balanced
6.35 mm TRS left/right connections, and headphones use a stereo 6.35 mm TRS
connection. The line and microphone paths share the documented input pair;
counting their physical sockets would overstate independent USB inputs. MASCHINE
software's virtual output buses do not add hardware output channels.

The confirmed output count makes the generated `audio:quality` test
unconditional. All handwritten checks remain unchanged. USB IDs, class
compliance, MIDI transport fields and control maps, hardware revision, and
OS/firmware compatibility retain their existing unknown status. Software 2.7.7
is provenance for the routing instructions, not a new compatibility baseline.
