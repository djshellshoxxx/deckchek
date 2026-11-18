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

## MIDI transport addendum — 2026-11-18

This addendum updates only the earlier note's unresolved MIDI transport status for the field below. The complete preceding audio findings and their original source scope remain intact.

Profile: `native-instruments-maschine-mk3`. Exact MASCHINE MK3 DIN IN and OUT. The 2.7.7 document/software edition is not a firmware qualification. USB MIDI remains unresolved.

### Documented transport

`connectivity.midi.din` is `true`. MASCHINE MK3 Getting Started 2.7.7, section 2.3.5, p. 30 and p. 31: separate 5-pin DIN IN and OUT connect external MIDI equipment. Activate the ports in MIDI Preferences for standalone software, or configure the host for plug-in use. USB MIDI remains unresolved.

### Exact evidence

Page references identify one-based PDF pages in the pinned copy. Document versions identify the reviewed source, not a qualified hardware or firmware revision.

- [Native Instruments MASCHINE MK3 Getting Started](https://docs.native-instruments.com/pdf-guides/maschine_277/MASCHINE_MK3_Getting_Started_English_2_7_7.pdf), **2.7.7**; relevant locations: 2.7.7, p. 30, p. 31. Retrieved 2026-11-18. SHA-256: `8f5e90ee4bcaeb8d554eef708438aae9c1f2ea9fd70153f344bb2d5d500f9f48`.

### Remaining qualification

This update records manufacturer-documented transport, with the connection and mode conditions above. It adds no USB audio channel or stream-format facts and leaves `classCompliant`, USB identifiers, control maps, Identity replies, hardware revision, firmware and OS qualification at their prior scope. A transport flag does not establish a receiving connection or a complete map. No physical unit was tested. All earlier test, specification, document and software objects are retained; software `minVersion` values are unchanged.

`connectivity.midi.usbMidi` remains `null`. The separate DIN IN and OUT documentation is not used to infer USB MIDI.
