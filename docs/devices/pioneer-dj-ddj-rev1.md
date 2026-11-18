# Pioneer DJ DDJ-REV1 — USB MIDI and audio specification provenance

Research checked **2026-11-18 UTC** for the exact DDJ-REV1 model. The profile ID
`pioneer-dj-ddj-rev1`, its research-seed classification and all eight handwritten
checks are retained.

## Manufacturer sources

The [Operating Instructions DRI1744B](https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-REV1/DDJ-REV1_DRI1744B_manual.pdf)
has 61 pages. Its SHA-256 is
`a69668e9c2f01dea8e749885d2d42477466b08568dc3f88ae2339e5be2d9f803`.
DRI1744B identifies the official filename revision; it is not a firmware version
or an independently verified publication date. Pages 55, 56 and 57 were rendered
and visually inspected. Their printed and one-based PDF page numbers agree.

The manufacturer's [manual article](https://pioneer-support.zendesk.com/hc/en-us/articles/4414649176217)
identifies the DRI1744B manual separately from its quick-start guide and addendum.
The [public article response](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/articles/4414649176217.json)
was retained during research. Unavailable older viewer links were not used as
evidence; the direct manufacturer PDF above supplies the inspected pages.

## Recorded decisions

| Evidence | Profile decision |
| --- | --- |
| DRI1744B p. 57 describes buttons and knobs sending operating data in MIDI format to a PC/Mac DJ application through the supplied USB cable | Set `connectivity.midi.usbMidi` to `true` and add `verified_usb_midi_transport`. |
| DRI1744B p. 57 refers to a separate MIDI-message list and application-specific MIDI setup | Keep the exact control map, receiving capability and Identity reply support unqualified. |
| DRI1744B p. 55 lists 48 kHz in the Audio Section | Add `verified_audio_section_sampling_rate` with the nominal value 48000 Hz. |
| DRI1744B p. 55 lists 24-bit A/D and D/A converters together | Add `verified_ad_da_converter_depth` with value 24 bit and the same converter scope. |
| DRI1744B p. 56 lists one USB Type-B port | Corroborates the retained `verified_usb_type_b_ports: 1` specification. Its original object remains unchanged. |

The nominal sampling rate and converter resolution do not enumerate USB audio
stream formats or channel counts. `usbChannelsIn` and `usbChannelsOut` remain
`null`, `sampleRatesHz` remains `[]`, and `bitDepth` remains `null`. The original
two-channel specification is not a USB audio channel map.

This research slice leaves `classCompliant`, USB vendor/product IDs, DIN MIDI,
hardware and firmware revision applicability, current driver/OS compatibility
and measured performance unresolved. The existing Serato DJ Lite software entry,
its role and its `minVersion: null` are unchanged. The manual's description of DJ
application control does not qualify a particular host or software version.

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
No factory tolerance or new pass threshold is introduced. All three original
specifications, six original document entries, eight complete handwritten test
objects, software qualification, MIDI map and certificate identity are retained.
The [focused regression](../../tests/researched-rev1-rev5-provenance.test.mjs)
checks these boundaries and fingerprints every otherwise unchanged profile field.
These are manufacturer documentation findings, not physical-device or platform
qualification results.
