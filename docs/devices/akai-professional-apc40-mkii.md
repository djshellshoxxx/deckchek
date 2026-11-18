# Akai Professional APC40 MKII — USB MIDI research

Checked **2026-11-18** for the exact APC40 mkII. The profile remains a research
seed; manufacturer documentation does not establish physical qualification.

## Sources and applicability

| Official source | Relevant sections | Document provenance |
| --- | --- | --- |
| [User Guide](https://cdn.inmusicbrands.com/akai/attachments/apc40II/APC40%20mkII%20-%20User%20Guide%20-%20v1.0.pdf) | Printed pp. 2, 4 and 27 | Manual **v1.0**; publication date not verified. |
| [Communications Protocol](https://cdn.inmusicbrands.com/akai/attachments/apc40II/APC40Mk2_Communications_Protocol_v1.2.pdf) | Printed pp. 3–4, USB port and MIDI SysEx format | **v1.2, 2015-01-19**; document revision, not firmware. |

## Profile decision

`connectivity.midi.usbMidi` is `true`: the guide explicitly describes MIDI
transmission and reception through the computer USB connection.

Protocol bytes `0x47` and `0x29` describe MIDI manufacturer/model identifiers;
they do not supply USB vendor/product IDs. The TS socket is identified as a
footswitch input. Neither that socket description nor the connector inventory
establishes the absence of a USB audio interface.

The complete audio object remains unresolved, so the actual planner retains its
conditional minor `audio:quality` case and existing MIDI checks. All handwritten
checks, earlier specs/documents, USB IDs, class compliance, DIN status, learned
maps, software minimum versions and hardware/firmware/OS qualification remain
unchanged.
