# Denon DJ PRIME GO+ — MIDI transport provenance

Reviewed **2026-11-18** against the exact manufacturer sources below.

Profile: `denon-dj-prime-go`. The existing denon-dj-prime-go ID denotes PRIME GO+. Computer mode is required. The VirtualDJ setup condition is Engine DJ 4.1.0 or later; it does not qualify current platforms.

### Documented transport

`connectivity.midi.usbMidi` is `true`. Engine OS User Guide v5.0.0, p. 18, p. 22 and p. 63: PRIME GO+ uses USB-B in computer mode. The separate VirtualDJ setup article 69000823507 specifies Engine DJ 4.1.0 or later for GO+; existing software minimum-version fields are unchanged.

### Exact evidence

Page references identify one-based PDF pages in the pinned copy. Document versions identify the reviewed source, not a qualified hardware or firmware revision.

- [Denon DJ combined Engine OS User Guide](https://cdn.inmusicbrands.com/Software/ENDJ5/PRIME%204%2C%20PRIME%204%2B%2C%20PRIME%202%2C%20PRIME%20GO%2C%20PRIME%20GO%2B%2C%20SC%20LIVE%204%2C%20SC%20LIVE%202%20-%20User%20Guide%20-%20v5.0.0.pdf), **v5.0.0**; relevant locations: v5.0.0, p. 18, p. 22, p. 63. Retrieved 2026-11-18. SHA-256: `aab8d29d22cd4e286a85009ee47d93fc67485793f35226bc19288592553bd74f`.
- [Engine DJ PRIME GO and PRIME GO+ Setup with Virtual DJ](https://support.enginedj.com/support/solutions/articles/69000823507-denon-dj-prime-go-and-prime-go-setup-with-virtual-dj), **article 69000823507**; relevant locations: article 69000823507, 4.1.0. Retrieved 2026-11-18. SHA-256: `81246cc78a05c8cb8db6db35a43d7e261ffbc25ba821f68e33e07d074ff9616e`.

### Remaining qualification

This update records manufacturer-documented transport, with the connection and mode conditions above. It adds no USB audio channel or stream-format facts and leaves `classCompliant`, USB identifiers, control maps, Identity replies, hardware revision, firmware and OS qualification at their prior scope. A transport flag does not establish a receiving connection or a complete map. No physical unit was tested. All earlier test, specification, document and software objects are retained; software `minVersion` values are unchanged.

The inspected combined guide is v5.0.0. No claim is made from the unreviewed v5.3.0 guide.
