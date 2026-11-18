# Pioneer DJ XDJ-XZ — MIDI transport provenance

Reviewed **2026-11-18** against the exact manufacturer sources below.

Profile: `pioneer-dj-xdj-xz`. Exact XDJ-XZ computer connection and BROWSE (SEARCH), then LINK/control mode sequence; standalone deck facts are unchanged.

### Documented transport

`connectivity.midi.usbMidi` is `true`. XDJ-XZ Operating Instructions DRI1625B, p. 128: connect the computer USB port and select BROWSE (SEARCH), then LINK/control mode, for MIDI-compatible software control.

### Exact evidence

Page references identify one-based PDF pages in the pinned copy. Document versions identify the reviewed source, not a qualified hardware or firmware revision.

- [Pioneer DJ XDJ-XZ Operating Instructions](https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-XZ/XDJ-XZ_DRI1625B_manual.pdf), **DRI1625B**; relevant locations: DRI1625B, p. 128. Retrieved 2026-11-18. SHA-256: `c36e71e6f907d7c49ce9e38764030535fff17038186523adab223410ca2109c5`.

### Remaining qualification

This update records manufacturer-documented transport, with the connection and mode conditions above. It adds no USB audio channel or stream-format facts and leaves `classCompliant`, USB identifiers, control maps, Identity replies, hardware revision, firmware and OS qualification at their prior scope. A transport flag does not establish a receiving connection or a complete map. No physical unit was tested. All earlier test, specification, document and software objects are retained; software `minVersion` values are unchanged.
