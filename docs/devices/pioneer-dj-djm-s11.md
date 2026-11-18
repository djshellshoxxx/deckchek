# Pioneer DJ DJM-S11 — MIDI transport provenance

Reviewed **2026-11-18** against the exact manufacturer sources below.

Profile: `pioneer-dj-djm-s11`. Exact DJM-S11 USB MIDI controller statement from the unversioned manufacturer product page.

### Documented transport

`connectivity.midi.usbMidi` is `true`. The exact DJM-S11 product page establishes USB MIDI assignability and controller operation. This fact supplies transport evidence only; no full message map, receiving behavior or platform qualification is added.

### Exact evidence

Page references identify one-based PDF pages in the pinned copy. Document versions identify the reviewed source, not a qualified hardware or firmware revision.

- [Pioneer DJ DJM-S11 product page](https://www.pioneerdj.com/en/product/dj-mixers/djm-s11/), **exact model product page**; relevant locations: USB MIDI. Retrieved 2026-11-18. SHA-256: `3f6303a9e69e7542263cf8cf3b29ed4807f4a9f1b3331731dad83d7df64479a0`.

### Remaining qualification

This update records manufacturer-documented transport, with the connection and mode conditions above. It adds no USB audio channel or stream-format facts and leaves `classCompliant`, USB identifiers, control maps, Identity replies, hardware revision, firmware and OS qualification at their prior scope. A transport flag does not establish a receiving connection or a complete map. No physical unit was tested. All earlier test, specification, document and software objects are retained; software `minVersion` values are unchanged.
