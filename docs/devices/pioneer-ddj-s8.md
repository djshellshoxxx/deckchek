# Pioneer DJ DDJ-S8
## Identity problem
No source found for a "DDJ-S8". Searches returned the DDJ-800, DDJ-SZ, DDJ-SR and others only. The profile is a provisional Serato controller template (2 jogs, mixer, USB audio, DVS-capable line inputs). Verify the model label; the user may mean DDJ-SZ2, DDJ-SX3 or similar, or a newer model not indexed.
## Sources
- https://www.pioneerdj.com/en/news/2014/ddj-sz/ (comparable DDJ-SZ: 44.1 kHz, 20-20k Hz, S/N 111 dB USB, 24-bit)
- https://support.serato.com/hc/en-us/articles/203401184-Does-my-mixer-controller-interface-support-DVS-in-Serato-DJ-Pro
- Service manual and MIDI list: not found.
## Testable
USB audio quality, ASIO latency, DVS line inputs/timecode (assumed CV02.5), MIDI by learn, mechanical checklists. Specs are not asserted for this model.

## Research limitations (important)
The research environment's network proxy blocked pioneerdj.com, serato.com, commons.wikimedia.org, virtualdj.com and third-party manual mirrors (HTTP 403 / EGRESS_BLOCKED). Only WebSearch result snippets were available. Consequently:
- No official MIDI message list, operating instructions, driver page or firmware page could be read. All MIDI maps are `learn` and `complete: false`.
- Every spec below is `unverified` (retailer/press-sourced). No pass thresholds are taken from specs; `pass` is null for spec-based tests.
- No Wikimedia Commons photo could be searched or downloaded; an original SVG illustration is used (`image.kind: illustration`).
- A follow-up session with open network access should fetch the official PDFs and fill in USB product IDs, driver names/versions and MIDI maps.
