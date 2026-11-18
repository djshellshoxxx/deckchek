# Korg nanoKONTROL2 — USB MIDI research

Checked **2026-11-18** for the exact nanoKONTROL2. The profile remains a research
seed without physical qualification.

## Sources and applicability

| Official source | Relevant sections | Document provenance |
| --- | --- | --- |
| [Owner's Manual](https://cdn.korg.com/us/support/download/files/b61f4da2e9b32e7825edc729e7d71a0d.pdf?response-content-disposition=inline%3Bfilename%2A%3DUTF-8%27%27nanoKONTROL2_OM_EFGSCJ2.pdf&response-content-type=application%2Fpdf%3B) | English sheet, PDF p. 3: connections, driver ports and specifications | Filename **nanoKONTROL2_OM_EFGSCJ2**; publication date not verified. |
| [Manual download entry](https://www.korg.com/us/support/download/manual/0/159/1912/) | Exact-model download link | Listed **2015-06-01**; this is a download-entry date, not a firmware or hardware revision. |

## Profile decision

`connectivity.midi.usbMidi` is `true`: the manual documents USB mini-B transport
and MIDI IN/OUT ports. Its Windows XP **USB audio device** label appears under
the MIDI-port headings; it does not establish audio channels or formats.

The complete audio object remains unresolved. The actual planner therefore
retains conditional minor audio testing, alongside MIDI checks. Existing Korg
fixtures continue to exercise unknown audio capability. All original checks,
specs/documents, IDs, class compliance, DIN status, maps, software minimums and
firmware/OS qualification remain unchanged.
