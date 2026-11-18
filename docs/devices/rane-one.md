# RANE ONE — MIDI transport provenance

Reviewed **2026-11-18** against the exact manufacturer sources below.

Profile: `rane-one`. Original ONE, excluding ONE MKII. The deck source must be USB A/B for deck-control MIDI.

### Documented transport

`connectivity.midi.usbMidi` is `true`. RANE ONE User Guide v1.5, p. 5 and p. 9: original ONE rear USB-B ports carry MIDI. Deck controls send MIDI only with the deck source at USB A/B. ONE MKII behavior is not imported.

### Exact evidence

Page references identify one-based PDF pages in the pinned copy. Document versions identify the reviewed source, not a qualified hardware or firmware revision.

- [RANE ONE User Guide](https://cdn.inmusicbrands.com/rane/one/RANE-ONE-User-Guide-v1_5.pdf), **v1.5**; relevant locations: v1.5, p. 5, p. 9. Retrieved 2026-11-18. SHA-256: `3211b156eb826c07da8e89380de9296fc734ea76c5e43db577d2a9964c45a622`.

### Remaining qualification

This update records manufacturer-documented transport, with the connection and mode conditions above. It adds no USB audio channel or stream-format facts and leaves `classCompliant`, USB identifiers, control maps, Identity replies, hardware revision, firmware and OS qualification at their prior scope. A transport flag does not establish a receiving connection or a complete map. No physical unit was tested. All earlier test, specification, document and software objects are retained; software `minVersion` values are unchanged.
