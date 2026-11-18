# AlphaTheta XDJ-AZ — USB MIDI and scoped audio specification provenance

Checked **2026-11-18** for the exact XDJ-AZ model. The existing profile ID
`alphatheta-xdj-az` and all ten handwritten checks are retained.

## Sources

The manufacturer's [Instruction Manual DRI1936C](https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AZ/XDJ-AZ_DRI1936C_manual_EN.pdf)
has 159 pages. DRI1936C is the identifier in the official filename. The retrieved
PDF SHA-256 is
`09af14979adfc2197799c8071fd97e4307ef3c1149b8826724b161d8ac60d011`.
The decisive pages were rendered and visually inspected; printed and one-based
PDF page numbers agree.

The official HTML manual provides the corresponding
[DJ software chapter](https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AZ/html/en/000COV_en/Using_DJ_software/Using_DJ_software.htm?rhtocid=_28)
and [specifications](https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AZ/html/en/000COV_en/Specifications/Specifications.htm).
The manufacturer's [manual index](https://pioneer-support.zendesk.com/hc/en-us/articles/11949532807193-Manuals)
lists XDJ-AZ beside **5 November 2024**. That model-entry date is not assigned to
DRI1936C: the retrieved PDF has November 2025 creation/modification metadata.
Neither the index date nor file metadata is treated as an independently verified
revision publication date.

## Recorded decisions

| Evidence | Profile decision |
| --- | --- |
| p. 129: the unit controls MIDI-compatible DJ software on a PC/Mac through USB | `connectivity.midi.usbMidi: true`; add the sourced transport fact. |
| p. 151: the Audio Section specifies 44.1 kHz | Record a nominal audio-section sampling rate of 44100 Hz; leave host USB rates unknown. |
| p. 151: the MASTER D/A converter is 32-bit | Record `verified_master_da_converter_depth: 32`, scoped to that converter. |
| p. 151: other A/D and D/A converters are 24-bit | Record `verified_other_ad_da_converter_depth: 24`; do not flatten the two converter scopes into one resolution. |

The p. 129 workflow selects SOURCE, SOFTWARE CONTROL and the chosen deck's LOAD
button before launching DJ software. This context does not establish a complete
MIDI map, a receiving connection, or Identity support.

The supported-file table on p. 11 concerns audio-file decoding. It must not be
copied into the host USB rate/format fields. The ASIO buffer utility on p. 20 and
USB output attenuation on p. 136 also do not establish a complete USB channel or
PCM format enumeration. Both channel counts remain `null`, `sampleRatesHz`
remains empty, and `bitDepth` remains `null`. Audio planning remains conditional.

USB IDs, class compliance, DIN transport, receiving capability, Identity replies,
exact control maps, hardware/firmware revision, current driver/OS compatibility
and physical performance remain unqualified. Converter resolution adds no USB
sample-format or measurement-tolerance claim. MIDI Learn, software version
unknowns, the original six spec/document prefixes, certificate identity, all
original tests and the -12 dBFS output cap are retained.
