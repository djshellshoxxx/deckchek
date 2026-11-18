# Ecler WARM2 — exact-manual provenance

Research checked **2026-11-18 UTC** for the existing profile.

## Manufacturer evidence

The [official English manual](https://assets.ecler.com/images/downloads/user-manuals/Ecler_WARM2_User_Manual_EN.pdf) identifies itself as **50-0421-0102 WARM2 EN**. Printed page 7 describes 2+1 mixing channels, and page 8 lists controls and connectors. The existing three-channel specification remains consistent with that description. The document identifier is not a firmware version or inferred publication date.

## Profile decision

A direct manual reference is added. No existing capability value changes. The connector list's omission of MIDI is insufficient to set either unknown MIDI transport field to `false`. The existing USB object and complete unknown audio object are preserved; analog connections do not supply USB stream counts, rates or word length.

All six existing specifications, six prior document entries and five handwritten checks remain intact. The major analog audio-quality plan and stimulus limit remain unchanged. The learned MIDI map remains incomplete, and generic USB-oriented MIDI planning remains a separate limitation. Manufacturer documentation does not constitute a passed physical test or host/firmware qualification.
