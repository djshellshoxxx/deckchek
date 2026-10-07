# Pioneer DJ DJM-A9
## Sources
- https://www.idjnow.com/pioneer-dj-djm-a9-mixer.html and https://www.bhphotovideo.com/c/product/1754526-REG/pioneer_dj_djm_a9_4_channel_digital_pro_dj.html (retailer specs)
- Manual mirrors (not fetched): https://www.rent.djcenter.ee/images/kasutusjuhendid/Pioneer-DJM-A9.pdf , https://cdn01.4wall.com/cms/rentals/files/f6835eb526b3d2.pdf
- Service manual and MIDI list: not found.
## Key specs (unverified, retailer)
| Spec | Value |
|---|---|
| Frequency response (LINE) | 20 Hz - 40 kHz |
| S/N | USB/digital 114 dB, LINE 105 dB, PHONO 88 dB, MIC 79 dB |
| Converters | 32-bit A/D and D/A |
| Sample rate | up to 96 kHz |
| USB | B and C ports; 4 stereo channels (retailer) |
## Testable
Per-channel USB and analog signal health, timecode per channel, ASIO latency, MIDI via learn (faders, trims, EQ, FX, crossfader), mechanical checklists. Not: spec-based pass criteria (specs unverified).
## Ambiguities
Driver name/version, USB IDs, exact channel layout of the USB sound card, official MIDI map.

## Research limitations (important)
The research environment's network proxy blocked pioneerdj.com, serato.com, commons.wikimedia.org, virtualdj.com and third-party manual mirrors (HTTP 403 / EGRESS_BLOCKED). Only WebSearch result snippets were available. Consequently:
- No official MIDI message list, operating instructions, driver page or firmware page could be read. All MIDI maps are `learn` and `complete: false`.
- Every spec below is `unverified` (retailer/press-sourced). No pass thresholds are taken from specs; `pass` is null for spec-based tests.
- No Wikimedia Commons photo could be searched or downloaded; an original SVG illustration is used (`image.kind: illustration`).
- A follow-up session with open network access should fetch the official PDFs and fill in USB product IDs, driver names/versions and MIDI maps.
