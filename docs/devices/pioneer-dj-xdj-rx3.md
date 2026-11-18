# Pioneer DJ XDJ-RX3 — USB MIDI and audio specification provenance

Checked **2026-11-18** for the exact XDJ-RX3 model. The existing profile ID and
all handwritten checks are retained.

## Sources

The manufacturer's [Instruction Manual DRI1702C](https://downloads.support.alphatheta.com/manuals/XDJ_RX3_DRI1702C_manual.pdf)
has 127 pages. Its [support listing](https://www.pioneerdj.com/hi-in/support/documents/xdj-rx3/)
dates the English manual to **27 August 2024**. The retrieved PDF SHA-256 is
`590b00660f1f1b79b7f5573ec2096f0976c23fb8b140620badddcfa9d42d2d5c`.

## Recorded decisions

| Evidence | Profile decision |
| --- | --- |
| pp. 110–111: USB control of MIDI software; software-control and mixer modes | `connectivity.midi.usbMidi: true`; not every control is asserted to produce MIDI. |
| p. 122: audio section sampling rate is 44.1 kHz | Record a sourced nominal audio-section specification. Keep the USB supported-rate list unknown. |
| p. 122: A/D and D/A converters are 24-bit | Record converter resolution separately from the unknown USB PCM word length. |

The file-playback formats on p. 10 are media-decoding capabilities, not a USB
audio-format list. The two mixer strips and physical output connectors do not
establish USB channel counts. Both counts remain `null`; the existing minor,
conditional output-quality test remains conditional.

The driver instructions on pp. 13–18 do not qualify a current installation.
USB IDs, class compliance, MIDI control maps, firmware/hardware revision and
physical performance remain unknown. No measurement tolerance, automatic test,
certificate plan, output cap or software-version requirement is changed.
