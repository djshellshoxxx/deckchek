# Pioneer DJ PLX-CRSS12 (Cross 12)
## Sources
- https://www.pioneerdj.com/en/news/2023/plx-crss12-professional-direct-drive-turntable-with-dvs-control/ (snippet only)
- https://pioneernz.co.nz/pages/specifications-plx-crss12 (specs, via snippet)
- https://www.bhphotovideo.com/c/product/1779719-REG/pioneer_dj_plx_crss12_professional_direct_drive.html (retailer)
- https://wearecrossfader.co.uk/blog/pioneer-dj-plx-crss12-review/ and https://www.bonedo.de/artikel/pioneer-dj-plx-crss12-dvs-turntable-test (reviews, DVS behaviour)
- https://serato.com/dj/hardware/pioneer-plx-crss12 ; https://virtualdj.com/manuals/hardware/pioneer/plxcrss12/setup.html (not fetched)
- Service manual: none publicly found.
## Key specs (all unverified)
| Spec | Value |
|---|---|
| Wow and flutter | 0.15% WRMS or less (JIS WTD) |
| S/N | 65 dB (DIN-B) |
| Start time | 0.3 s at 33 1/3 rpm |
| Pitch ranges | +/-8, +/-16, +/-50 % |
| Speeds | 33 1/3, 45 rpm |
| USB | USB-C |
## DVS
Reviews say the deck generates its own timecode internally (clamp in the spindle) so no control vinyl is needed; rekordbox DVS works on connection, Serato may need certified hardware. The actual carrier/format is unconfirmed, so the Serato test assumes CV02.5 and the rekordbox test uses a placeholder format name.
## Testable
Speed/pitch/quartz/start via audio engines; timecode via USB audio return; MIDI (platter, pitch, pads) by learn; mechanicals by checklist. Not testable: wow/flutter vs spec without a 3 kHz test record and dedicated metric; MIDI map without the official list.
## Ambiguities
USB product ID, driver name, audio channel/sample-rate details, exact timecode format, whether quartz lock is a user toggle.

## Research limitations (important)
The research environment's network proxy blocked pioneerdj.com, serato.com, commons.wikimedia.org, virtualdj.com and third-party manual mirrors (HTTP 403 / EGRESS_BLOCKED). Only WebSearch result snippets were available. Consequently:
- No official MIDI message list, operating instructions, driver page or firmware page could be read. All MIDI maps are `learn` and `complete: false`.
- Every spec below is `unverified` (retailer/press-sourced). No pass thresholds are taken from specs; `pass` is null for spec-based tests.
- No Wikimedia Commons photo could be searched or downloaded; an original SVG illustration is used (`image.kind: illustration`).
- A follow-up session with open network access should fetch the official PDFs and fill in USB product IDs, driver names/versions and MIDI maps.
