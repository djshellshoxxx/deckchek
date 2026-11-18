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
