# Research Notes and Sources

This document records the external references used to shape the DeckChek working specifications. It is not a substitute for the original standards/manuals. Implementation should preserve exact method/version references and verify licensing before redistributing vendor media or proprietary control signals.

## DVS / timecode

### Serato: calibration and NoiseMap

Serato documents two parts of its control vinyl:
- a directional 1 kHz tone used for speed/direction;
- NoiseMap used to determine precise position.

Source:
https://support.serato.com/hc/en-us/articles/202996934-How-to-calibrate-Serato-DJ

Design consequence:
- DeckChek can use a generic phase/scope and carrier-quality layer independently of absolute-position decoding.
- Vendor-specific analyzers should expose capabilities rather than force one universal decoder.

### Serato: scope diagnostics

Serato's support documentation describes a clean scope as a near-circular inner ring and identifies common malformed-scope conditions associated with no signal, grounding, worn control vinyl, dust, damaged stylus, and tracking-force problems.

Source:
https://support.serato.com/hc/en-us/articles/202552220-Diagnosing-the-DVS-Scope-Views

Serato also exposes control-signal identity, position, RPM, threshold, and readable-signal percentage in its own scope.

Source:
https://support.serato.com/hc/en-us/articles/227846367-The-Scopes

Design consequence:
- DeckChek needs its own explicitly named metrics rather than presenting its score as Serato's internal readability percentage.
- Media wear is a valid hypothesis, but must be separated from stylus, cable, grounding, and tracking problems.

### Native Instruments Traktor

Native Instruments documents use of Calibration Scope panels to visualize and calibrate a Timecode signal, with Relative and Absolute modes available during playback.

Source:
https://support.native-instruments.com/support/solutions/articles/69000879426-traktor-pro-3-timecode-setup-guide

Design consequence:
- Traktor-family support should include a diagnostic scope and mode/capability metadata even if exact proprietary decoding is not implemented initially.

### rekordbox

Pioneer/AlphaTheta's rekordbox DVS setup documentation exposes a calibration scope and L/R plus phase/amplitude balancing. rekordbox support also states that other manufacturers' control vinyl/CD/control-signal WAVs are not supported.

Sources:
https://cdn.rekordbox.com/files/20200312164543/rekordbox5.3.0_dvs_setup_guide_EN.pdf
https://rekordbox.com/en/support/faq/dvs-6/

Design consequence:
- timecode media/version compatibility belongs in the database.
- a generic analyzer must not imply that cross-vendor control media is natively compatible with a DJ application.

### xwax

xwax is an open-source Linux DVS implementation released under GPLv3 and supports specific control media families, including documented Scratch Live media support.

Sources:
https://github.com/xwax/xwax
https://github.com/xwax/xwax.github.io/blob/master/timecode_records_and_cds.md

Design consequence:
- xwax is useful reference material for an open DVS analyzer, but code reuse must respect GPL boundaries and project licensing decisions.

### Hardware-generated DVS signal

Rane documents that the Twelve MKII can emit a Serato control tone from RCA outputs in DVS mode.

Source:
https://support.rane.com/en/support/solutions/articles/69000828932-rane-twelve-mkii-setup-and-connectivity

Design consequence:
- DVS source type must include hardware-generated control signals, not only vinyl/CD files.

## Wow and flutter / speed

IEC 60386:1972 defines a method for measurement of speed fluctuations in sound recording/reproducing equipment using a weighted-peak technique and defines characteristics of the measuring equipment.

Source:
https://webstore.iec.ch/en/publication/2015

Design consequence:
- DeckChek must name the methodology used for wow/flutter.
- raw, unweighted speed-deviation traces should be retained separately.
- an IEC-compatible mode requires explicit validation rather than using the standard name loosely.

## Vinyl clicks, scratches, and degradation

Digital-audio restoration literature treats clicks and scratches as impulsive disturbances and commonly uses predictive/autoregressive residual techniques and high-pass methods to localize defects.

References:

Godsill & Rayner, *Digital Audio Restoration*, chapter "Removal of Clicks":
https://link.springer.com/book/10.1007/978-1-4471-1561-8

Stanciu & Stanciu, "Complete computer program for audio restoration", 2010:
https://www.researchgate.net/publication/261488241_Complete_computer_program_for_audio_restoration

Esquef, Karjalainen & Välimäki, "Detection of Clicks in Audio Signals Using Warped Linear Prediction", 2002:
https://research.aalto.fi/en/publications/detection-of-clicks-in-audio-signals-unsing-warped-linear-predict/

"Localization of impulsive disturbances in audio signals using template matching":
https://www.sciencedirect.com/science/article/abs/pii/S105120041500247X

Design consequence:
- use prediction/high-pass/transient methods as candidate detectors;
- do not equate every impulsive event with a physical scratch;
- recurrence, morphology, repeat-play location, and hardware isolation should raise diagnostic confidence.

### Existing scratch mapping concept

Spinstack documents an experimental feature that maps suspected surface scratches while a record plays and upgrades a location from tentative to confirmed when it recurs across plays.

Source:
https://www.spinstackios.app/scratch-detection/

Design consequence:
- repeat-play confirmation is an important product behavior.
- DeckChek differentiates itself by using direct audio-interface capture, multiple detector types, physical-turntable diagnostics, DVS analysis, and hardware/venue comparison.

## Cartridge measurements

Audio-Technica documentation identifies frequency response, channel separation, channel balance, and output level as important cartridge specifications. It also notes that alignment/anti-skate issues can influence channel balance and distortion.

Sources:
https://distribution.audio-technica.eu/en/wp-content/uploads/sites/8/A-T-Phono_Cartridges_19_ENG_L00092_V1.0-240x317mm-WEB-1.pdf
https://distribution.audio-technica.eu/app/uploads/sites/8/A-T-Phono_Cartridges_19_ENG_L00092_V1.0-240x317mm-WEB-2.pdf

Design consequence:
- manufacturer specifications and DeckChek measurements must be stored separately.
- channel imbalance does not identify a cartridge fault by itself.
- azimuth/anti-skate conclusions require corroborating evidence.

## Example hardware sources used for starter catalog

### Technics SL-1200GR2
Official specifications include direct drive, 33-1/3/45/78 RPM, +/-8% and +/-16% pitch ranges, 2.2 kg-cm starting torque, 0.7 s startup to 33-1/3 RPM, and 0.025% WRMS wow/flutter.

Source:
https://us.technics.com/products/direct-drive-turntable-system-ii-sl-1200gr2

### Pioneer PLX-1000
Official Pioneer DJ published specifications include 33-1/3 and 45 RPM, +/-8/16/50% pitch, <=0.1% WRMS (JIS weighted) wow/flutter, >=4.5 kg/cm starting torque, and 0.3 s start time.

Source:
https://www.pioneerdj.com/en/news/2014/plx-1000/

### Audio-Technica AT-XP3
Published specs include 20-18,000 Hz response, 20 dB channel separation at 1 kHz, 2.0 dB output-channel balance, 5.5 mV output, and 2-4 g tracking-force range with 3 g standard.

Source:
https://sea.audio-technica.com/Dual-Moving-Magnet-Stereo-DJ-Cartridge-AT-XP3

### Ortofon DigiTrack
Ortofon describes DigiTrack as designed for coded vinyl and publishes 8 mV output, 1.5 dB channel balance at 1 kHz, 22 dB channel separation at 1 kHz, and 2-4 g tracking force with 3 g recommended.

Source:
https://ortofon.com/pages/digitrack

### Pioneer DJ DJM-S11
Pioneer DJ publishes two PHONO RCA inputs, PHONO S/N of 90 dB, USB audio, and Serato DJ Pro/rekordbox integration including DVS.

Source:
https://www.pioneerdj.com/en/news/2020/djm-s11-scratch-style-2-channel-dj-mixer/

### Focusrite Scarlett 4i4 4th Generation
Focusrite publishes 24-bit/192 kHz conversion, supported rates through 192 kHz, line-input dynamic range 115.5 dB(A), and maximum line-input level 22 dBu.

Source:
https://focusrite.com/products/scarlett-4i4

## Venue and vibration

Technics installation guidance tells users to install the turntable on a horizontal surface protected from vibration and to keep it as far as possible from speakers.

Source:
https://www.technics.com/support/downloads/data/operating-instructions/SL-1200GR_TQBM0054_PP_eng_cfr.pdf

Pioneer describes vibration-damping construction on the PLX-1000. Rane notes that a motorized controller without a stylus avoids common feedback and needle-jumping problems from heavy bass/noise in club environments.

Sources:
https://www.pioneerdj.com/en/news/2014/plx-1000/
https://support.rane.com/en/support/solutions/articles/69000814170-rane-dj-twelve-frequently-asked-questions

Design consequence:
- venue/surface behavior is a legitimate diagnostic domain, especially for vinyl-only DJs.
- audio-derived low-frequency vibration should be labeled a proxy unless a calibrated vibration sensor is available.

## Research rules for future contributors

When adding catalog/specification data:
1. prefer manufacturer or official manual;
2. store the exact source;
3. store measurement method/unit;
4. do not silently normalize incompatible standards;
5. do not copy proprietary control audio into the repository unless redistribution rights are clear;
6. distinguish public documentation from DeckChek-derived measurements.
