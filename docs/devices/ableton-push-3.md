# Ableton Push 3 — MIDI transport provenance

Reviewed **2026-11-18** against the exact manufacturer sources below.

Profile: `ableton-push-3`. Push 3 computer/device USB-C connection; USB-A host operation and TRS MIDI sockets are separate.

### Documented transport

`connectivity.midi.usbMidi` is `true`. Push 3 USB power FAQ, article 9109387410716: USB-C carries MIDI on the computer/device connection. The USB-A host role is separate; no DIN connector conclusion is drawn from TRS sockets.

### Exact evidence

Page references identify one-based PDF pages in the pinned copy. Document versions identify the reviewed source, not a qualified hardware or firmware revision.

- [Ableton Push 3 USB power FAQ](https://help.ableton.com/hc/en-us/articles/9109387410716-Push-3-USB-power-FAQ), **article 9109387410716**; relevant locations: article 9109387410716. Retrieved 2026-11-18. SHA-256: `53469e258fef542c795c0125591d6a3e4087980b1996dc06ed4aeeed94a07f90`.

### Remaining qualification

This update records manufacturer-documented transport, with the connection and mode conditions above. It adds no USB audio channel or stream-format facts and leaves `classCompliant`, USB identifiers, control maps, Identity replies, hardware revision, firmware and OS qualification at their prior scope. A transport flag does not establish a receiving connection or a complete map. No physical unit was tested. All earlier test, specification, document and software objects are retained; software `minVersion` values are unchanged.

## USB host audio addendum (2026-11-18)

This separate audio review records **16 input channels and 16 output channels** for the USB-C host device in the documented Live/CoreAudio configuration. The preceding MIDI review remains intact.

### Exact source and recorded fields

[Ableton Push 3 Reference Manual, 2025-09-17](https://cdn-resources.ableton.com/resources/pdfs/push-manual/3/2025-09-17/push3-manual-en.pdf), section **3.1**, printed/PDF **pp. 20–21**. Retrieved and visually reviewed 2026-11-18. Page 20 explains the USB-C host connection; page 21 shows the CoreAudio input/output selector with the 16-channel counts. PDF SHA-256: `ae68c982cfbe326768129b046937b16440521ee15516b5b6428adfb11781315a`.

| Profile field | Recorded value | Meaning |
| --- | ---: | --- |
| `connectivity.audio.usbChannelsIn` | 16 | Host-visible input channels in the documented configuration |
| `connectivity.audio.usbChannelsOut` | 16 | Host-visible output channels in the documented configuration |

These counts do not enumerate physical sockets or establish individual channel routes. The manual example does not specify exact firmware or macOS versions. Windows behavior and current OS compatibility remain unqualified. No physical unit was tested.

### Planning and preserved limits

The existing planner now selects Push 3's output audio-quality check as confirmed rather than conditional. Its **-12 dBFS** stimulus cap, test ID, measurement steps, handwritten checks and certificate requirements remain unchanged. A documented channel count does not establish successful measurements or qualify any particular routing setup.

The USB stream-format fields remain `sampleRatesHz: []` and `bitDepth: null`. Existing converter specifications are retained without promoting them to supported USB formats. `classCompliant`, USB identifiers, the accepted MIDI transport facts, the incomplete learned map and software minimum versions are unchanged. Every earlier specification, document, software and handwritten test object is retained in its original order.
