# Novation Launch Control XL — MIDI transport provenance

Reviewed **2026-11-18** against the exact manufacturer sources below.

Profile: `novation-launch-control-xl`. Original Launch Control XL, not XL3. The inspected page has no printed document revision; classCompliant remains unchanged.

### Documented transport

`connectivity.midi.usbMidi` is `true`. Launch Control XL Getting Started, p. 4 (revision not printed on the inspected page): the original Launch Control XL is a USB MIDI device. This evidence is not for XL3; the USB-wide classCompliant field is outside this transport-only change.

### Exact evidence

Page references identify one-based PDF pages in the pinned copy. Document versions identify the reviewed source, not a qualified hardware or firmware revision.

- [Novation Launch Control XL Getting Started](https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/novation/downloads/9926/launchcontrolxlgsg.pdf), **original Launch Control XL; revision not printed on inspected page**; relevant locations: Getting Started, p. 4. Retrieved 2026-11-18. SHA-256: `e4a83e478e791d14dd49486fb7e9399f6d37fe1d8f27c5559a5ac2b38e9bcf99`.

### Remaining qualification

This update records manufacturer-documented transport, with the connection and mode conditions above. It adds no USB audio channel or stream-format facts and leaves `classCompliant`, USB identifiers, control maps, Identity replies, hardware revision, firmware and OS qualification at their prior scope. A transport flag does not establish a receiving connection or a complete map. No physical unit was tested. All earlier test, specification, document and software objects are retained; software `minVersion` values are unchanged.
