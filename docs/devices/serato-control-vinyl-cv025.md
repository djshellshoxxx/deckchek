# Serato Control Vinyl CV02.5

Egress limits blocked fetching; information from search snippets.

## Sources
- https://mixxx.org/news/2025-08-27-dvs-internals-pt3/ (1 kHz carrier, AM-modulated LFSR code)
- https://m.thomann.de/cz/serato_7_control_vinyl_blue.htm (retailer: 4 min per side on 7 in, NoiseMap 6 dB louder)
- Serato official documentation not read.

## Specs
| Item | Value | Status |
|---|---|---|
| Carrier | 1000 Hz at 33 1/3 | confirmed by Mixxx article |
| Carrier at 45 | ~1350 Hz | derived |
| Quadrature | 90 deg | principle, unverified |
| 7 in side | 4 min | retailer |
| 12 in side, lead-in length | not found | |

## Tests
Format check (carrier, phase, balance, SNR, dropouts), 45 rpm, DVS signal, side scan, visual wear, Serato calibration and ABS/REL mode. Pass thresholds are null except presence checks as no published tolerances were found. Image is an original SVG.
