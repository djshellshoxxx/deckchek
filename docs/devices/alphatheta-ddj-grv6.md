# AlphaTheta DDJ-GRV6 — USB MIDI and audio specification provenance

Checked **2026-11-18** for the exact DDJ-GRV6 model. The existing profile ID
`alphatheta-ddj-grv6` and all eight handwritten checks are retained.

## Sources

The manufacturer's [Instruction Manual DRI1927A](https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-GRV6/DDJ-GRV6_DRI1927A_manual.pdf)
has 174 pages. DRI1927A is the identifier in the official filename. The retrieved
PDF SHA-256 is
`419ab2fa500164b9387cd6f77e75f415210e18e6c34c7607b16f83208ca46213`.
The decisive pages were rendered and visually inspected; printed and one-based
PDF page numbers agree.

The manufacturer's [manual index](https://pioneer-support.zendesk.com/hc/en-us/articles/11949532807193-Manuals)
lists DDJ-GRV6 beside **8 October 2024**. This is the model entry's date; it is not
used as an independently verified publication date for the retrieved revision.
The [MIDI-compatible-software article](https://pioneer-support.zendesk.com/hc/en-us/articles/37284057102489-DDJ-GRV6-MIDI-compatible-software)
also describes using the unit's controls with MIDI software.

## Recorded decisions

| Evidence | Profile decision |
| --- | --- |
| p. 170: operating data from buttons and knobs reaches MIDI-compatible DJ software through USB | `connectivity.midi.usbMidi: true`; add the sourced transport fact without importing control maps or receiving/Identity support. |
| p. 168: the Audio Section specifies 48 kHz | Record a nominal audio-section sampling rate of 48000 Hz. Keep the supported host USB rate list unknown. |
| p. 168: A/D and D/A converters are 24-bit | Record converter resolution separately. Keep USB PCM word length unknown. |

The software audio setup on p. 63 names master and headphone destinations. These
names and the p. 168 nominal specifications do not enumerate the complete USB
stream topology or formats. Both channel counts remain `null`, `sampleRatesHz`
remains empty, and `bitDepth` remains `null`. Audio planning remains conditional.

The [product page](https://alphatheta.com/en/product/dj-controller/ddj-grv6/black/)
describes its built-in audio interface as class compliant. That scoped statement
is not promoted into the profile's generic USB class-compliance field; the
complete USB object remains unchanged.

USB IDs, DIN transport, receiving capability, Identity replies, exact control
maps, hardware/firmware revision, current driver/OS compatibility and physical
performance remain unqualified. Nominal specifications add no pass tolerance.
MIDI Learn, software version unknowns, the original six spec/document prefixes,
certificate identity, all original tests and the -12 dBFS output cap are retained.
