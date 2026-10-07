# Traktor Scratch timecode media (MK1, MK2, control CD)

Research limits: page fetch was blocked; facts come from search summaries.

## Sources
- https://djtechtools.com/2009/08/03/timecode-exlplained-basic (2 kHz Traktor carrier)
- https://forum.djtechtools.com/t/traktor-control-vinyl-mk1-and-mk2/68964 (MK1/MK2, side lengths)
- https://www.pssl.com/products/ni-traktor-scratch-pro-control-vinyl-mk2-white (MK2 marketing)
- NI timecode setup guide: https://support.native-instruments.com/support/solutions/articles/69000879426-traktor-pro-3-timecode-setup-guide
- NI log location: https://support.native-instruments.com/support/solutions/articles/69000882545-traktor-crashes (Documents\Native Instruments\Traktor <ver>\Logs)
- Mixxx DVS internals (not opened): https://mixxx.org/news/2025-08-27-dvs-internals-pt3/

## Key facts
| Item | MK1 | MK2 |
|---|---|---|
| Carrier | 2 kHz (confirmed) | 2 kHz per retailer vs ~2.5 kHz per other source: unverified, measure it |
| Quadrature | yes (stereo sine pair) | yes |
| Modes | Absolute / Relative / Internal | same |
| Side length | not found | A about 12 min, B about 17 min (unverified) |
| Lead-in | not found | not found |

Software: Traktor Pro > Preferences > Timecode Setup (calibration), Audio Setup; logs under Documents\Native Instruments.

## Testable
Carrier/speed, phase, balance, SNR, dropouts for each generation at 33 and 45 rpm; vinyl side scan; Traktor calibration (manual); log scan.

## Not testable
Absolute-position code integrity (needs Traktor); CD variant carrier unknown.

## Ambiguities
MK1 vs MK2 ownership unknown; carrier of MK2; control CD format.
