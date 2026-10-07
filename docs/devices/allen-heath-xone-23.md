# Allen & Heath Xone:23C (profile id allen-heath-xone-23)

Owner-confirmed unit: the Xone:23C with the built-in USB soundcard. The id keeps the old "xone-23" name so existing databases stay linked.

Research limits: page fetch was blocked; facts come from search summaries.

## Sources
- Xone:23 manual: https://www.markertek.com/Attachments/Manuals/Allen%20&%20Heath/XONE23-Manual.pdf
- Xone:23C user guide (A&H): https://www.allen-heath.com/content/uploads/2023/06/AP9433_5_X23C_UG.pdf
- Xone:23C driver release notes v2.9.95.2: https://www.allen-heath.com/content/uploads/2023/06/X23C_DSRN_29952_2.pdf
- Xone:23C hidden detail and quirks: https://gehrcke.de/2014/07/allen-heath-xone23c-hidden-technical-detail-and-quirks/
- Xone:23C manual: https://www.adorama.com/col/productManuals/AHXONE23C.pdf
- 23C brochure: https://www.fullcompass.com/common/files/21614-AllenHeathXone23CBrochure.pdf
- Overview: https://djtechtools.com/2014/01/25/allen-heath-xone23-extended-overview
- 23C vs 23 thread: https://forum.djtechtools.com/t/xone-23c-vs-xone-23-soundcard/66647
- Retail summary: https://www.juno.co.uk/junodaily/2014/09/24/allen-heath-xone23

## Key specs
| Item | Value |
|---|---|
| Frequency response | 10 Hz-50 kHz +/-0 dB (brochure) |
| THD+N | 0.01 % |
| Main out noise | -85 dBu unweighted |
| Headroom / max out | 20 dB / +28 dBu balanced XLR |
| EQ | 3-band total kill; VCF filter 20 Hz-20 kHz HP/LP, resonance |
| Crossfader | two-curve switch |
| USB soundcard | 24-bit/96 kHz, 4 stereo channels (confirmed); X:LINK |
| Windows driver | "XONE:23C USB ASIO driver", v2.9.95.2 per A&H release notes (version from search, unverified for latest) |
| USB channels | 4 in / 4 out assumed (sends 1+2, 3+4); exact split and sample-rate list unverified |
| Class compliance | driver has a "Core Audio" class-compliant mode; plain Windows class-compliant behaviour unverified |

## Testable
Per-channel signal, gain, EQ kill, fader, crossfader and curve, VCF, cue, outputs, balance, hum, jack/pot crackle. USB soundcard: driver, ASIO, signal health both directions, noise, latency, Traktor install check, and Traktor Scratch Pro MK2 timecode format checks on the USB inputs.

## Not testable
EQ frequencies (not found), exact numeric limits.

## Ambiguities
Unit identity is settled (Xone:23C). Still unconfirmed: the latest Windows driver version, the exact ASIO entry name shown in Traktor, USB vendor/product IDs, the precise USB send/return channel split and supported sample rates. No MIDI DIN ports.
