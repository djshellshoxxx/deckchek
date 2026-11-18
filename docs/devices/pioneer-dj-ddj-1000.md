# Pioneer DJ DDJ-1000 — audio capability research

Checked **2026-11-18** for **DDJ-1000**, excluding DDJ-1000SRT. This research
seed records a manufacturer-documented Mac driver configuration. No current
platform, driver version, firmware or physical unit was qualified.

## Source and applicability

The official [DDJ-1000 Troubleshooting (Mac)](https://forums.pioneerdj.com/hc/en-us/articles/360022013031-DDJ-1000-Troubleshooting-Mac)
support article is dated **2022-08-06**. Its date identifies the support
document, not a driver or firmware revision. Sections 3–4 cover USB connection
and driver recognition; section 6 specifies the audio-device channel counts;
section 7 describes rekordbox Performance mode output selection. Earlier setup
steps mention High Sierra and Mojave, so this historical configuration does not
establish current macOS compatibility.

## Profile decisions

| Field | Recorded value | Evidence and scope |
| --- | --- | --- |
| `connectivity.audio.usbChannelsIn` | `12` | Section 6 requires 12 inputs in macOS Audio Devices for the documented DDJ-1000 Mac driver configuration. |
| `connectivity.audio.usbChannelsOut` | `6` | Section 6 requires 6 outputs in that same configuration. |
| `connectivity.audio.sampleRatesHz` | `[]` retained | This article does not enumerate hardware sample rates. |
| `connectivity.audio.bitDepth` | `null` retained | This article does not establish bit depth. |

Section 7 assigns rekordbox's Master Output to **DDJ-1000 : MASTER** and
Headphones Output to **DDJ-1000 : PHONES**. Those names establish software audio
routing. They do not supply a complete numbered map of all six output channels.
The existing four mixer channels and four external source inputs are separate
specifications and were not used to derive USB channel counts.

The confirmed output count makes the generated `audio:quality` test
unconditional. This selects an available diagnostic capability; it does not
certify a connected unit or its host configuration. All handwritten checks,
USB IDs, class compliance, MIDI transport fields and control maps, and
software/firmware qualification fields remain unchanged. Physical connector
details and additional audio formats are not added from this source.

## MIDI transport addendum — 2026-11-18

This addendum updates only the earlier note's unresolved MIDI transport status for the field below. The complete preceding audio findings and their original source scope remain intact.

Profile: `pioneer-dj-ddj-1000`. DDJ-1000, excluding DDJ-1000SRT. Observe the utility and software MIDI settings; the previously documented Mac audio configuration keeps its original scope.

### Documented transport

`connectivity.midi.usbMidi` is `true`. DDJ-1000 Operating Instructions DRI1516A, p. 31: USB carries control data to MIDI-compatible computer software. Set the utility for software other than rekordbox and configure the software MIDI settings. No message map or current platform qualification is imported.

### Exact evidence

Page references identify one-based PDF pages in the pinned copy. Document versions identify the reviewed source, not a qualified hardware or firmware revision.

- [Pioneer DJ DDJ-1000 Operating Instructions](https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-1000/DDJ-1000_DRI1516A_manual.pdf), **DRI1516A**; relevant locations: DRI1516A, p. 31. Retrieved 2026-11-18. SHA-256: `a392777fb3aa18dc1b8e169d02289d6a64601bc2d49c3dc02b2494779a540ce5`.

### Remaining qualification

This update records manufacturer-documented transport, with the connection and mode conditions above. It adds no USB audio channel or stream-format facts and leaves `classCompliant`, USB identifiers, control maps, Identity replies, hardware revision, firmware and OS qualification at their prior scope. A transport flag does not establish a receiving connection or a complete map. No physical unit was tested. All earlier test, specification, document and software objects are retained; software `minVersion` values are unchanged.
