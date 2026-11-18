# Pioneer DJ DJM-450 — USB MIDI and audio specification provenance

Research checked **2026-11-18 UTC** for the exact DJM-450 model. The profile ID
`pioneer-dj-djm-450` and all six handwritten checks are retained.

## Manufacturer sources

The [Operating Instructions DRI1406B](https://downloads.support.alphatheta.com/manuals/dj-mixers/DJM-450/DJM-450_DRI1406B_manual.pdf)
has 27 pages. Its SHA-256 is
`217738dd4ac30e2e79f1c38b185c625cb9ed2a3804d5248e3d0389b821916d7f`.
The [Quick Start Guide DRH1395C](https://downloads.support.alphatheta.com/manuals/dj-mixers/DJM-450/DJM-450_DRH1395C_quickstart-manual.pdf)
has 16 pages. Its SHA-256 is
`679193af157b3a275a91e08e33c3f6c574aa7378dce8b50304677685f340ad85`.
These identifiers come from the official filenames; they are not firmware
versions or independently verified publication dates. The decisive pages were
rendered and visually inspected. Printed and one-based PDF page numbers agree.

The manufacturer's [documentation article](https://pioneer-support.zendesk.com/hc/en-us/articles/4404659778969)
links the corresponding manual revisions. Its [public article response](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/articles/4404659778969.json)
was retained during research. Old document-viewer links were unavailable; the
direct manufacturer PDF downloads above supplied the inspected evidence.

## Recorded decisions

| Evidence | Profile decision |
| --- | --- |
| DRI1406B p. 11 describes control-operation information sent in MIDI format to software on a computer connected by USB | Set `connectivity.midi.usbMidi` to `true` and add the sourced transport fact. |
| DRI1406B p. 11 describes outgoing control messages and MIDI clock after connection | Keep receiving capability, Identity reply support and the exact control map unqualified. The transport statement establishes outgoing MIDI. |
| DRH1395C p. 13 specifies 48 kHz in the Audio Section | Record a nominal audio-section sampling rate of 48000 Hz. |
| DRH1395C p. 13 separately gives 24-bit MASTER D/A and 24-bit other A/D and D/A converters | Record the two converter scopes separately. |

The nominal sampling and converter specifications do not enumerate supported
USB stream rates, word length or channel counts. Both USB channel counts remain
`null`, `sampleRatesHz` remains empty, and `bitDepth` remains `null`. USB IDs and
class compliance, DIN transport, hardware and firmware revision, current driver
and OS compatibility, and physical performance also remain unqualified.

## Planning and preservation

Confirmed USB MIDI removes the transport condition from the generated MIDI
conformance, control coverage and timing checks. Those checks still require an
appropriate host input and documented or configured transmitting controls.
Receiving support and an Identity response are not inferred. The MIDI map stays
in Learn mode with `complete: false` and no imported control IDs. No General MIDI
sound test is added.

The mixer already had an audio output plan. Its major audio-quality check and
the -12 dBFS stimulus cap remain unchanged; they do not establish USB audio
formats or measured performance. No factory tolerance or new pass threshold is
introduced. The original five spec entries, six document entries, software
qualification, complete handwritten test objects and certificate identity are
preserved. The [focused regression](../../tests/researched-djm450-900-provenance.test.mjs)
checks these boundaries and fingerprints every otherwise unchanged profile field.
