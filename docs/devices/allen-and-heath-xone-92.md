# Allen & Heath Xone:92 — legacy Mk1 DIN provenance

Research checked **2026-11-18 UTC** for the existing profile. The capability decision applies to the legacy Mk1.

## Manufacturer evidence

The [official Mk1 resources](https://www.allen-heath.com/hardware/legacy-products/xone92mk1/resources/) link the [AP5345 Issue 4 user guide](https://www.allen-heath.com/content/uploads/2023/06/Xone92-User-Guide-Issue-4.pdf). Printed page 17 identifies a five-pin DIN MIDI output; pages 28–30 describe outbound operation. The document issue and printed 2005 copyright identify the source, not a qualified firmware version.

## Profile decision

`connectivity.midi.din` is now `true`, with an additive specification explicitly naming the output direction. The generic model label and existing identity remain intact; Mk2 material supplies no additional values.

The USB object, unknown USB MIDI field, complete unknown audio object, learned-map status and all five handwritten checks are preserved. This change does not establish a MIDI input, universal Identity Reply support, USB stream formats, a complete control map or physical performance.

Both analog audio planning and the existing stimulus limit remain unchanged. The planner's generic USB-oriented MIDI instructions are a separate limitation: this DIN-output finding does not qualify those instructions for the legacy mixer.
