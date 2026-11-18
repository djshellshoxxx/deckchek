# RANE FOUR — researched USB MIDI transport

Research checked **2026-11-18 UTC** for FOUR.

The [FOUR User Guide v1.0](https://cdn.inmusicbrands.com/rane/four/FOUR%20-%20User%20Guide%20-%20v1.0.pdf), pp. 12 and 15, documents USB audio/MIDI exchange and channel/deck source selection. USB A/B and USB/Line settings determine the associated control path. This supports `connectivity.midi.usbMidi: true`.

Page 35 identifies 24-bit/48 kHz converters separately from 32-bit floating-point DSP. Those labels do not establish an enumerated USB stream-format contract. USB channel counts, supported-rate list and scalar bit depth therefore retain their unknown values. The document version is not firmware qualification.

All existing checks, specifications, documents, IDs, maps and software-version limits remain intact. The actual plan retains its conditional minor audio-quality case, MIDI coverage and existing output-level limit. Physical and host qualification remain pending.
