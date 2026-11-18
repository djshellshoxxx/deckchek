# Hercules DJControl Inpulse 500 — audio capability research

Checked **2026-11-18** for the exact DJControl Inpulse 500 model. These are
manufacturer-documented capabilities, not results from a physical unit.

## Sources and applicability

| Source | Relevant sections | Revision |
| --- | --- | --- |
| [English user manual](https://ts.hercules.com/download/sound/manuals/DJC_Inpulse500/DJControl_Inpulse_500_User_Manual_EN.pdf) | §3.2, PDF p. 6; §4.3, pp. 10–11; §5.5, pp. 22–23; §6, p. 24 | No document revision or firmware baseline identified. Page references count from the PDF cover. |
| [Product specifications](https://www.hercules.com/en/product/djcontrol-inpulse-500/) | Technical specifications and connections | Unversioned product page; exact Inpulse 500. |

## Profile decisions

| Field | Recorded value | Evidence |
| --- | --- | --- |
| `connectivity.audio.usbChannelsIn` | `2` | Manual §4.3 exposes the hardware-mixed Aux/Mic signal to software on input channels 1–2. |
| `connectivity.audio.usbChannelsOut` | `4` | Manual §§3.2 and 4.3 assign Master to 1–2 and headphones to 3–4. |
| `sampleRatesHz` / `bitDepth` | `[44100]` / `24` | Product specifications; these values already existed in the profile's confirmed specs. |
| `connectivity.midi.usbMidi` | `true` | Manual §6 identifies USB Audio and USB MIDI transport. |

The product specifications list RCA L/R and 6.35 mm master connectors, 3.5 mm
and 6.35 mm headphone jacks, RCA/3.5 mm AUX input, and a balanced 6.35 mm
microphone input. The master connector alternatives carry the same stereo
channels; they do not create additional USB outputs.

The researched output count makes the generated `audio:quality` test
unconditional. Existing handwritten tests remain in the plan.

USB IDs, class compliance, exact MIDI control mappings, OS/firmware compatibility,
and physical performance remain unverified. No firmware version, pass tolerance,
or hardware qualification is inferred from these documents.
