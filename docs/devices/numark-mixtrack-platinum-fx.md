# Numark Mixtrack Platinum FX — audio capability research

Checked **2026-11-18** for Mixtrack Platinum FX. This research seed has no
physical qualification.

## Sources and applicability

| Source | Relevant sections | Revision |
| --- | --- | --- |
| [Official User Guide](https://cdn.inmusicbrands.com/Numark/vAC9uYWEnT/mtplfx/MixTrackPlatinumFX-UserGuide-v1.2.pdf) | Rear Panel, printed p. 5; Appendix, p. 31 | Back page identifies **Manual Version 1.2**; no publication date identified. Document version is not firmware. |
| [Exact-model product page](https://www.numark.com/product/mixtrack-platinum-fx) | Technical specifications and User Guide link | Unversioned page; currently links to v1.2 and agrees on the audio format. |

## Profile decisions

| Field | Recorded value | Evidence |
| --- | --- | --- |
| `connectivity.audio.sampleRatesHz` | `[44100]` | Appendix lists 44.1 kHz audio. |
| `connectivity.audio.bitDepth` | `24` | Appendix and product specification; the existing confirmed bit-depth spec remains unchanged. |
| `connectivity.midi.usbMidi` | `true` | Rear Panel explicitly describes USB MIDI control data. |
| `connectivity.audio.usbChannelsIn` / `usbChannelsOut` | `null` / `null` retained | No manufacturer USB endpoint count was established. |

The guide connects the unit to a computer over USB. It identifies an RCA stereo
master output, 6.35 mm and 3.5 mm headphone sockets, and a 6.35 mm microphone
input. Their physical count does not establish independent USB channels. The
microphone summing description is insufficient to establish microphone-to-USB
routing; no input count of zero is inferred. Third-party software routing is not
promoted to a manufacturer specification.

The planner still generates a conditional `audio:quality` test. USB MIDI support
does not establish a message map: the learn-mode map remains incomplete. All
handwritten checks, IDs, class compliance, the DIN field, software minimum
version, hardware revision and firmware qualification remain unchanged.
