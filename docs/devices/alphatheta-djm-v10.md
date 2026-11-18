# AlphaTheta DJM-V10 — MIDI transport provenance

Reviewed **2026-11-18** against the exact manufacturer sources below.

Profile: `alphatheta-djm-v10`. DJM-V10, retaining the existing AlphaTheta manufacturer and ID. DIN output only; no DIN input claim.

### Documented transport

`connectivity.midi.usbMidi` is `true`. DRI1643C, p. 66 and p. 67: USB A/B connects the computer; MIDI ON enables control messages. MIDI clock and start/stop have separate behavior and may transmit with MIDI ON off.

`connectivity.midi.din` is `true`. DJM-V10 feature page, DIN MIDI out: physical DIN output only is established. No DIN input is established; the transport flag does not encode direction.

### Exact evidence

Page references identify one-based PDF pages in the pinned copy. Document versions identify the reviewed source, not a qualified hardware or firmware revision.

- [Pioneer DJ DJM-V10 Instruction Manual](https://downloads.support.alphatheta.com/manuals/dj-mixers/DJM-V10/DJM-V10_DRI1643C_manual.pdf), **DRI1643C**; relevant locations: DRI1643C, p. 66, p. 67. Retrieved 2026-11-18. SHA-256: `0bc9d24e446e72a42006131fc269722ddcf745a8ec0ef267ffb27b1e04ba3f88`.
- [Pioneer DJ DJM-V10 features](https://www.pioneerdj.com/en/product/features/mixer/djm-v10-6-channels/), **exact DJM-V10 product feature page**; relevant locations: DIN MIDI out. Retrieved 2026-11-18. SHA-256: `20653a6ae335df08e6b03921d6c6a10af072356cc499ea0cefe39dbe7c1fe9aa`.

### Remaining qualification

This update records manufacturer-documented transport, with the connection and mode conditions above. It adds no USB audio channel or stream-format facts and leaves `classCompliant`, USB identifiers, control maps, Identity replies, hardware revision, firmware and OS qualification at their prior scope. A transport flag does not establish a receiving connection or a complete map. No physical unit was tested. All earlier test, specification, document and software objects are retained; software `minVersion` values are unchanged.

The DIN fact is output only. `din: true` does not assert a DIN input; select a host output only when a receiving path is independently documented.
