# DeckChek DJ controller, mixer and MIDI hardware research
Research pass: 2026-10-20

## Coverage and status

- 9 prior profiles, plus 37 new hardware profiles = **46 indexed models**.
- All 37 new profiles now include **at least one model-specific manufacturer reference**, manufacturer-backed `verified_*` specifications, and an added model-specific guided test.
- The first 37 profiles were created as cautious research seeds. Published feature claims are not equivalent to measured DeckChek validation. Profiles still retain `midi.mapSource="learn"`, `midi.complete=false`, null VID/PID, unknown exact MIDI/HID mappings and uncalibrated `pass:null` for guided tests.
- Most service-manual URLs remain blank because public availability was not established. Never replace them with unsupported guesses.
- Official support landing pages alone do not establish a driver name/version for a specific OS. Visit manufacturer model pages and compare signed package and current firmware revision.
- Tests still require actual units and reference fixtures; GitHub validation of JSON and software tests must precede merge.

## Manufacturer source register

The exact direct links and provenance are retained within each corresponding `app/devices/profiles/*.json`. Research highlights:

| Manufacturer / unit | Primary model-specific reference | Distinct confirmed feature and diagnostic focus |
|---|---|---|
| Pioneer DJ DDJ-FLX4 | https://www.pioneerdj.com/en/product/dj-controllers/ddj-flx4/ | Smart Fader, Smart CFX, class compliant USB, mic USB output |
| Pioneer DJ DDJ-REV1 | https://www.pioneerdj.com/en/product/dj-controllers/ | Scratch-style two-deck controller; verify individual MIDI mapping |
| Pioneer DJ DDJ-REV5 | https://www.pioneerdj.com/en/product/dj-controllers/ | Dual USB-C, on-jog display; separate manufacturer hardware diagram and MIDI map |
| Pioneer DJ DDJ-REV7 | https://www.pioneerdj.com/en/product/dj-controllers/ddj-rev7-n/ | Motorized jogs and MAGVEL fader |
| AlphaTheta DDJ-GRV6 | https://alphatheta.com/en/product/dj-controller/ddj-grv6/black/ | Four channels; Groove Circuit (rekordbox) vs Stems FX (Serato) |
| AlphaTheta DDJ-FLX10 | https://www.pioneerdj.com/en/product/dj-controllers/ddj-flx10/ | Four channels, Track Separation, DMX |
| Pioneer DJ DDJ-1000 | https://www.pioneerdj.com/en/product/dj-controllers/ddj-1000/ | Four-channel rekordbox controller with external source mixing |
| Pioneer DJ XDJ-RX3 | https://www.pioneerdj.com/en/product/all-in-one-dj-systems/xdj-rx3/ | Two standalone decks, 10.1-inch touchscreen, Touch Preview |
| Pioneer DJ XDJ-XZ | https://www.pioneerdj.com/en-gb/product/all-in-one-system/xdj-xz/black/specifications/ | Four-channel mixer **but only two standalone USB decks**, four software decks |
| AlphaTheta XDJ-AZ | https://alphatheta.com/en/product/all-in-one-dj-system/xdj-az/black/ | Four standalone decks and SonicLink monitoring |
| Denon DJ PRIME 4+ | https://support.denondj.com/en/support/solutions/articles/69000838474-denon-dj-prime-4-frequently-asked-questions | Four decks, independently assignable zone output, multiple media paths |
| Denon DJ PRIME GO+ | https://www.denondj.com/prime-go-plus | Battery-powered, Bluetooth, 7-inch screen, 26 Main FX; **no built-in Ethernet** unlike original PRIME GO |
| Denon DJ SC LIVE 4 | https://www.denondj.com/sclive4 | Four standalone decks, built-in speakers and three media slots |
| Numark Mixstream Pro | https://www.numark.com/product/mixstream-pro | Two decks, built-in speakers, USB/SD and onboard Engine Lighting |
| Numark Mixtrack Platinum FX | https://www.numark.com/product/mixtrack-platinum-fx | Four software deck layers, 16 pads, two FX paddles, jog displays |
| RANE ONE | https://support.rane.com/en/support/solutions/articles/69000871126-rane-one-x-rane-one-mkii-what-are-the-differences- | Seven-inch motorized platters and two USB soundcards; avoid ONE MKII-exclusive features |
| RANE PERFORMER | https://support.rane.com/en/support/solutions/articles/69000851441-rane-performer-frequently-asked-questions | Motor torque setting and Stem Split routing |
| RANE FOUR | https://support.rane.com/en/support/solutions/articles/69000828752-rane-four-frequently-asked-questions | Serato Stems Split to four channel strips |
| NI Traktor Kontrol S4 MK3 | https://www.native-instruments.com/products/traktor-kontrol-s4 | Four channels, Haptic Drive, analog external mixer mode |
| NI Traktor Kontrol F1 | https://www.native-instruments.com/en/support/downloads/ | Sixteen pads, four knobs and four faders; Controller Editor mapping |
| Hercules DJControl Inpulse 500 | https://www.hercules.com/en/product/djcontrol-inpulse-500/ | Hardware AUX filter, beatmatch indicators and independent microphone path |
| Hercules DJControl Inpulse T7 | https://www.hercules.com/en-us/product/djcontrol-inpulse-t7/ | Seven-inch motorized platters, 33⅓ RPM, software-dependent 45 RPM |
| Roland DJ-808 | https://www.roland.com/global/products/dj-808/support/ | Built-in TR-S drum sequencer, VT microphone transformer and AIRA Link |
| Pioneer DJ DJM-450 | https://www.pioneerdj.com/en/product/dj-mixers/djm-450/ | Two channels, eight Beat FX, four Sound Color FX, Magvel |
| Pioneer DJ DJM-900NXS2 | https://www.pioneerdj.com/en/product/dj-mixers/djm-900nxs2/ | Four phono inputs, dual USB, Sound Color/Beat FX, independent send/return |
| Pioneer DJ DJM-S11 | https://www.pioneerdj.com/en/product/dj-mixers/djm-s11/ | 4.3-inch touch MIDI, two mixer channels and four software decks |
| Pioneer DJ DJM-V10 | https://www.pioneerdj.com/en/product/features/mixer/djm-v10-6-channels/ | Six channels, four-band EQ, per-channel compressor, dual USB |
| RANE SEVENTY-TWO MKII | https://www.rane.com/downloads/?product=Seventy-Two+MKII | Multi-touch battle mixer, dual DVS, tension-adjustable fader; official firmware and drivers |
| Allen & Heath Xone:96 | https://www.allen-heath.com/hardware/xone-series/xone96/ | Dual 32-bit/96-kHz USB, dual VCF and published MIDI channel maps |
| Allen & Heath Xone:92 | https://www.allen-heath.com/hardware/xone-series/xone92/ | Analog routing, dual filters, four-band EQ; confirm 92 versus 92 Mk2 |
| Ecler WARM2 | https://www.ecler.com/products/warm2/ | Rotary 2+1 channel analog mixer and three-band master isolator |
| Korg nanoKONTROL2 | https://www.korg.com/us/products/computergear/nanokontrol2/page_1.php | Eight knobs, eight sliders and 24 buttons |
| Akai Professional APC40 MKII | https://www.akaipro.com/apc40-mk2/ | 5 × 8 RGB grid, nine faders, 16 knobs |
| Novation Launchpad Pro MK3 | https://userguides.novationmusic.com/hc/en-gb/articles/25494488223762-Introduction-to-the-Launchpad-Pro-MK3 | 64 pressure/velocity pads and four-track sequencer; published programmer guide |
| Novation Launch Control XL | https://novationmusic.com/products/launch-control-xl-mk2 | Eight faders, 24 knobs and 16 buttons; **MK2 model**, not Launch Control XL 3 |
| Ableton Push 3 | https://help.ableton.com/hc/en-us/articles/8483423483036-Push-3-Audio-Interface-Specifications | ADAT expansion, pedal CV, MPE; controller-only versus standalone edition must be recorded |
| NI MASCHINE MK3 | https://www.native-instruments.com/products/maschine | 16 pads, Smart Strip, eight touch knobs, two displays and audio interface |

## Remaining deep-verification gates

1. **Exact per-control lists and physical counts**: inspect each model-specific operating manual, revision/date and hardware diagrams. A product description or manufacturer marketing page confirms only listed attributes, not the complete front/back-panel enumeration.
2. **Transport visibility**: capture real MIDI, SysEx, HID and application-feedback protocols on connected units. Do not infer MIDI mapping for purely analog controls.
3. **Drivers and firmware**: record official direct downloads (Windows, macOS, Linux where supported), required/optional status, signed publisher, versions, hashes where applicable, release notes and tested OS.
4. **Service manuals**: search manufacturer service portals, licensed technician resources and publicly released schematics. Explicitly record restricted/unknown availability.
5. **Safety and measurement**: reference test signals, signal-chain diagrams, expected gain/impedance/routing, setup and uncertainty; do not create unsupported electrical pass/fail tolerances.
6. **Programmatic testing**: versioned test prerequisites, MIDI Learn fallback, analogue/HID skip states, reproducible fixtures and real-hardware regression.
7. **Release gates**: run `node tools/build-device-index.mjs --check` and `npm test`, validate user-interface rendering and attach test evidence. No real-hardware test is claimed by these research edits.

**Provenance states:** `confirmed` means manufacturer-published; `unverified` means preliminary research; it never means independently measured or certified.
