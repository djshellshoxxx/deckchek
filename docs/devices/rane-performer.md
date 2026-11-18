# RANE PERFORMER — MIDI transport provenance

Reviewed **2026-11-18** against the exact manufacturer sources below.

Profile: `rane-performer`. PERFORMER with USB A/B deck-source selection; preserve the LINE exception. Reviewed v1.4 only, not v1.5.

### Documented transport

`connectivity.midi.usbMidi` is `true`. RANE PERFORMER User Guide v1.4, p. 19: USB source mode routes MIDI to the connected computer. Deck controls send MIDI only with USB A/B selected; LINE mode does not establish those deck messages. Version 1.4 is the reviewed edition, not 1.5.

### Exact evidence

Page references identify one-based PDF pages in the pinned copy. Document versions identify the reviewed source, not a qualified hardware or firmware revision.

- [RANE PERFORMER User Guide](https://cdn.inmusicbrands.com/rane/performer/PERFORMER%20-%20User%20Guide%20-%20v1.4.pdf), **v1.4**; relevant locations: v1.4, p. 19. Retrieved 2026-11-18. SHA-256: `da79a7f40470a1d09fe6e5acb6baea8d1f7e21cb3ac79d9db85c358da63675e2`.

### Remaining qualification

This update records manufacturer-documented transport, with the connection and mode conditions above. It adds no USB audio channel or stream-format facts and leaves `classCompliant`, USB identifiers, control maps, Identity replies, hardware revision, firmware and OS qualification at their prior scope. A transport flag does not establish a receiving connection or a complete map. No physical unit was tested. All earlier test, specification, document and software objects are retained; software `minVersion` values are unchanged.
