# Pioneer DJ DDJ-REV5 — USB MIDI and audio specification provenance

Research checked **2026-11-18 UTC** for the exact DDJ-REV5 model. The profile ID
`pioneer-dj-ddj-rev5`, its research-seed classification and all eight handwritten
checks are retained.

## Manufacturer sources

The [Operating Instructions DRI1872B](https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-REV5/DDJ-REV5_DRI1872B_manual.pdf)
has 144 pages. Its SHA-256 is
`f7068d560a6b56fba4714dbb415ae80c2205a1f5e0d728f981adc4356b4be7a5`.
DRI1872B identifies the official filename revision; it is not a firmware version
or an independently verified publication date. Pages 132, 133 and 134 were rendered
and visually inspected. Their printed and one-based PDF page numbers agree.

The manufacturer's [manual article](https://pioneer-support.zendesk.com/hc/en-us/articles/21326568940057)
identifies the DRI1872B manual separately from its quick-start guide and addendum.
The [public article response](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/articles/21326568940057.json)
was retained during research. Unavailable older viewer links were not used as
evidence; the direct manufacturer PDF above supplies the inspected pages.

## Recorded decisions

| Evidence | Profile decision |
| --- | --- |
| DRI1872B p. 132 describes connecting the unit by USB to a PC/Mac with MIDI software to control other DJ software | Set `connectivity.midi.usbMidi` to `true` and add `verified_usb_midi_transport`. |
| DRI1872B p. 132 requires audio/MIDI setup, refers to a separate MIDI-message resource and says some buttons depend on the DJ software | Keep the exact control map, receiving capability and Identity reply support unqualified. |
| DRI1872B p. 133 lists 48 kHz in the Audio Section | Add `verified_audio_section_sampling_rate` with the nominal value 48000 Hz. |
| DRI1872B p. 133 lists 24-bit A/D and D/A conversion together | Add `verified_ad_da_converter_depth` with value 24 bit and the same converter scope. |
| DRI1872B p. 134 lists two USB Type-C terminals | Corroborates the retained `verified_usb_type_c_ports: 2` specification. Its original object remains unchanged. |

The [exact-model product page](https://www.pioneerdj.com/en/product/dj-controllers/ddj-rev5/)
also describes two USB Type-C ports for connecting computers, although a detail
caption on that page says Type-B. The connector evidence used here is the explicit
terminal specification in DRI1872B p. 134. The same product page describes a
playhead-position display on each jog wheel, corroborating the retained
`verified_on_jog_display: true`. This does not establish a screen technology,
resolution, color capability or display-control protocol. All original
specification objects and their existing values are preserved.

The nominal sampling rate and converter resolution do not enumerate USB audio
stream formats or channel counts. `usbChannelsIn` and `usbChannelsOut` remain
`null`, `sampleRatesHz` remains `[]`, and `bitDepth` remains `null`. The original
two-channel specification is not a USB audio channel map.

This research slice leaves `classCompliant`, USB vendor/product IDs, DIN MIDI,
hardware and firmware revision applicability, current driver/OS compatibility
and measured performance unresolved. DRI1872B p. 132 directs Windows users to a
dedicated audio driver for playback, which is not a current OS-support matrix.
The existing Serato DJ Pro software entry, its role and its `minVersion: null`
are unchanged. No supported-version claim is inferred from the manual's mention
of Serato DJ Pro or rekordbox.

## Planning and preservation

Confirmed USB MIDI removes the transport condition from the generated MIDI
conformance, control coverage and timing checks. The existing USB connection and
output-pairing policy applies. Instructions still require a host input receiving
the unit's messages, documented or configured transmitting controls, and a
documented receiving connection before selecting an output. An Identity reply is
optional; this profile does not assert that the unit receives or answers it.
The MIDI map remains in Learn mode with `complete: false` and no control entries.
No General MIDI sound test is added.

The generated audio-quality check remains conditional and minor because the USB
output channel count is unresolved. Its -12 dBFS stimulus level is unchanged.
No factory tolerance or new pass threshold is introduced. All four original
specifications, six original document entries, eight complete handwritten test
objects, software qualification, MIDI map and certificate identity are retained.
The [focused regression](../../tests/researched-rev1-rev5-provenance.test.mjs)
checks these boundaries and fingerprints every otherwise unchanged profile field.
These are manufacturer documentation findings, not physical-device or platform
qualification results.
