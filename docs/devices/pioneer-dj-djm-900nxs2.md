# Pioneer DJ DJM-900NXS2 — scoped manual provenance

Research checked **2026-11-18 UTC** for the exact DJM-900NXS2 model. The profile
ID `pioneer-dj-djm-900nxs2` and all six handwritten checks are retained. This
update adds source precision while leaving MIDI transport unresolved.

## Manufacturer sources

The [Quick Start Guide DRH1330C](https://downloads.support.alphatheta.com/manuals/dj-mixers/DJM-900NXS2/DJM-900NXS2_DRH1330C_quickstart-manual.pdf)
has 16 pages. Its SHA-256 is
`21298b7a47214094afdfe194c8a8a86a69563e23a3ca53cd6f38f9baf28e798d`.
DRH1330C is the identifier in the official filename, not a firmware version or
independently verified publication date. Pages 9 and 14 were rendered and
visually inspected. Printed and one-based PDF page numbers agree.

The manufacturer's [documentation article](https://pioneer-support.zendesk.com/hc/en-us/articles/4404624192665)
and its [public article response](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/articles/4404624192665.json)
identify the quick-start revision and link a DRI1300A operating manual and a MIDI
message list. The quick-start PDF was retrieved from the direct manufacturer
download above.

## Recorded decisions

| Evidence | Profile decision |
| --- | --- |
| DRH1330C p. 9 identifies the USB terminal as the computer connection; p. 14 lists two USB Type-B terminals and one separate Type-A terminal | Correct the existing two-port label to `USB Type-B computer connections`. Retain `verified_usb_host_ports`, numeric value 2, unit, source and confidence for compatibility, and add a source-scoping note. |
| DRH1330C p. 14 specifies 96 kHz in the Audio Section | Add a nominal audio-section sampling rate of 96000 Hz. |
| DRH1330C p. 14 specifies 32-bit MASTER D/A and 24-bit other A/D and D/A converters | Add separate converter facts with those exact scopes. |
| DRH1330C p. 9 describes a MIDI ON/OFF button separately from the computer USB terminal | Keep `connectivity.midi.usbMidi: null`; these separate descriptions do not supply the direct USB MIDI transport statement sought for this update. |

The original product-derived interface sample-rate and bit-depth entries remain
unchanged. Nominal sampling, converter depth and a count of computer connectors
do not enumerate host USB stream formats or channel directions. Both USB audio
channel counts and word length remain `null`; the supported USB rate list stays
empty. The MASTER D/A depth is not applied to USB PCM.

## Research limits and preserved behavior

The old DRI1300A viewer and an attempted direct operating-manual PDF were
unavailable. A manufacturer staff link in the [official MIDI discussion](https://forums.pioneerdj.com/hc/en-us/community/posts/115009392266-DJM-900NXS2-Software-MIDI-INPUT-What-is-it-for)
identified the exact MIDI-message viewer, but its redirected resource could not
be fetched. A derived direct chart filename also returned HTTP 404. These
observations are retrieval limits; they establish neither absence of MIDI nor
unsupported hardware. Staff discussion supplied a discovery lead, not the
transport evidence used to qualify the profile.

USB MIDI and DIN remain unknown. Generated MIDI checks remain conditional, and
conformance retains explicit output selection. Receiving support, Identity
replies, USB IDs and class compliance, hardware and firmware revision, current
driver and OS compatibility, and the exact control map remain unqualified. The
MIDI map stays in Learn mode with `complete: false` and no imported controls.

The major mixer audio-quality check, -12 dBFS stimulus cap, software qualification,
all handwritten test objects and certificate identity are unchanged. No factory
tolerance or new pass threshold is introduced. All six original document entries
and all original spec fields are preserved except the explicitly justified
two-port label and notes. The [focused regression](../../tests/researched-djm450-900-provenance.test.mjs)
checks the unchanged unknowns, plan behavior and complete original objects.
