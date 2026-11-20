# Native Instruments TRAKTOR KONTROL S4 MK3 — audio and MIDI-mode research

Checked **2026-11-18** for the exact S4 MK3. This remains a research seed;
manufacturer documentation does not qualify a physical unit or host setup.

## Sources and applicability

| Source | Relevant sections | Revision |
| --- | --- | --- |
| [S4 MK3 manual](https://docs.native-instruments.com/pdf-guides/traktor/TRAKTOR_KONTROL_S4_MK3_Manual_English_0719.pdf) | Printed pp. 1–2; §4.1, p. 12; §10, p. 89 | Hardware S4 MK3; software **3.2 (07/2019)**. This identifies the document's software context, not qualified firmware. |
| [NI Windows 11 ASIO driver notice](https://support.native-instruments.com/support/solutions/articles/69000880969-kontrol-s2-s4-mk3-asio-driver-block-after-windows-11-update) | S2/S4 MK3 driver block and WASAPI Exclusive alternative | No article revision date identified; checked on the date above. |

The previously recorded product URL now redirects to the generic DJ-controller
collection. New audio evidence uses the exact-model manual; existing specs are
retained unchanged.

## Profile decisions

| Field | Recorded value | Reason |
| --- | --- | --- |
| `connectivity.audio.bitDepth` | `24` | Manual p. 2 explicitly describes the built-in audio interface. |
| `connectivity.audio.sampleRatesHz` | `[]` retained | The manual's 24-bit/96 kHz description does not enumerate supported operating rates. |
| `connectivity.audio.usbChannelsIn` / `usbChannelsOut` | `null` / `null` retained | USB computer audio is documented, but numeric USB channel counts are unresolved. |

Sections 5.4–5.5, pp. 30–31, describe RCA/XLR main outputs, balanced quarter-inch
booth outputs, and two headphone socket sizes. These physical connectors do not
determine USB channel counts.

The current support notice describes a Windows 11 ASIO block and a WASAPI
Exclusive alternative involving Traktor Pro 4.5. It does not establish current
compatibility for an arbitrary host, and no driver, software or firmware
qualification field is changed.

The actual planner retains a conditional `audio:quality` test because its output
count remains unknown. At this audio checkpoint, handwritten checks, USB IDs,
class compliance, MIDI transport fields and maps, and software/firmware unknowns
were unchanged.

## MIDI-mode addendum — 20 November 2026

The current [NI MIDI-mode support article](https://support.native-instruments.com/support/solutions/articles/69000880031-native-instruments-switching-your-controller-to-midi-mode)
explicitly excludes controllers absent from its table. It distinguishes S4 MK1
and MK2 but does not include MK3. Combined with the exact MK3 manual's USB computer
connection, this establishes the absence of a supported USB MIDI controller mode:
`connectivity.midi.usbMidi` is now `false`. No article revision date was exposed;
the retrieval date is 2026-11-20. The redirecting product URL and its cached
search excerpt were not used as current capability evidence.

`connectivity.midi.din` remains `null`. This bounded conclusion does not assert
the absence of every possible MIDI-related feature, software conversion or
future firmware mode. The three generated MIDI checks consequently remain
conditional, use unknown-transport guidance, and require explicit output
selection. All eleven handwritten checks and certificate identity remain exact;
maps, audio counts/rates, USB IDs, class compliance and physical qualification
remain unresolved. [The focused regression](../../tests/researched-s4-midi-mode.test.mjs)
also reconstructs and verifies the complete original profile bytes.
