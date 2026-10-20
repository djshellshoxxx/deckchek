# Hardware-profile research expansion (2026-10-20)

This batch adds **37** preliminary DJ controller, mixer and MIDI surface profiles to the existing **9** profiles, for **46 indexed profiles**. They are directly readable by DeckChek's existing `app/devices/library.js` loader and the existing Devices UI. These are **test-plan research seeds**, not evidence of hardware validation or verified exhaustive technical inventories.

## Source and evidence policy

For each device, the URL under `documents` points to an official manufacturer's documentation, product, or support location. Only a few are direct model manuals; most are **support landing pages and require follow-up**. Blank service-manual and exact MIDI-map URLs mean **not verified**, not nonexistent. Fields `specs[].confidence=unverified` deliberately mark capability inventories as preliminary. Exact VID/PID, CC/note/SysEx/HID mapping, audio-channel counts, compatibility versions, driver names, service schematics, reference tolerances, and firmware build numbers are omitted instead of guessed. A physical unit and its correct revision-specific manual are needed to establish those facts.

### Particularly useful verified official documentation

- Pioneer DJ DDJ-FLX4 manual listing: https://www.pioneerdj.com/en/support/documents/ddj-flx4/
- Pioneer DJ DDJ-FLX4 software/firmware information: https://www.pioneerdj.com/en/support/software-information/controller/ddj-flx4/
- Denon DJ product manuals/drivers: https://www.denondj.com/downloads
- Traktor Kontrol S4 MK3 manual: https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/traktor/TRAKTOR_KONTROL_S4_MK3_Manual_English_0719.pdf
- Numark Mixstream Pro guide: https://cdn.inmusicbrands.com/Numark/products/Mixstream_Pro/Mixstream_Pro_User_Guide_v2.pdf
- Ableton Push manual entry: https://help.ableton.com/hc/en-us/articles/206328564-Push-User-Manual
- Ableton Push 3 hardware FAQ: https://help.ableton.com/hc/en-us/articles/8483166334748-Push-3-Technical-FAQ

## Test dispatch / instrumentation caveats

- **MIDI** jogs, pads, faders, buttons and encoders: DeckChek's existing MIDI runners work only if controls actually expose MIDI. Vendor HID, application-specific protocols, and analog-only controls require an observable host-application/manual check or a future transport-specific runner.
- **Audio** output checks require an appropriately routed external capture path; the USB port does not guarantee a USB audio interface. Record input gain, calibration and routing.
- **Standalone** file playback is only applicable where the actual product supports onboard transport.
- **Motor** checks are guided inspections; no claimed torque or speed calibration.
- **Analog mixer** fader/knob MIDI tests cannot pass without a MIDI signal. These should use guided audio/manual checks.
- **Display/LED** tests are guided inspections unless a model-specific feedback protocol has been documented.
- Until physical hardware and protocol mappings are validated, result states must be **not tested / unsupported / inconclusive**, not fabricated passing results.
- Avoid labeling these records as fully researched, certified, or complete. The fields purposely do not supply detailed port counts and schematics.

## Next research and engineering gates

1. Per-model official manual and regional revisions, with a direct deep link, document publication/revision date, and primary-source provenance for individual controls, I/O, and supported operating systems.
2. Confirm per-platform USB VID/PID, MIDI endpoint names and message mapping, HID availability, LED feedback, audio paths and driver packages with physical-device traces.
3. Add conditional test dispatch that detects MIDI vs HID vs analog faders and refuses impossible runners; do not count an absent MIDI response as a hardware defect without proving MIDI transport.
4. Verify all external URLs automatically at build time; external links remain non-executable and are subject to the app's allowlist/confirmation policy.
5. Build manufacturer/model matrix tests plus fixture-backed MIDI and audio regressions, then real-hardware acceptance runs and firmware compatibility recording.
6. Expand model coverage to legacy/discontinued devices, modular deck controllers, media players, rotary mixers, MIDI keyboards, trigger grids and unusual multichannel interfaces.

The existing provisional `pioneer-ddj-s8` identity remains an unresolved separate cleanup issue. Do not treat that profile's assumed hardware properties as verified.

## Manufacturer-confirmed detailed capability pass (2026-10-20)

Seven profiles have received specific manufacturer-confirmed numerical or categorical capability entries and feature-targeted guided tests:

| Profile | Primary sources and test scope |
|---|---|
| pioneer-dj-ddj-flx4 | https://www.pioneerdj.com/en/product/dj-controllers/ddj-flx4/ ; USB class compliance, 2 channels, Smart Fader / Smart CFX, microphone, pads |
| denon-dj-prime-4 | https://support.denondj.com/en/support/solutions/articles/69000838474-denon-dj-prime-4-frequently-asked-questions ; independent zone, input pairs, storage ports, simultaneous outputs. This file represents PRIME 4+; do not equate with PRIME 4 original. |
| native-instruments-traktor-kontrol-s4-mk3 | https://www.native-instruments.com/products/traktor-kontrol-s4 ; motorized Haptic Drive, mixer operation, pads and displays |
| allen-and-heath-xone-96 | https://www.allen-heath.com/hardware/xone-series/xone96/ and https://support.allen-heath.com/hc/en-gb/articles/43084536824849-Xone-96-MIDI-Implementation ; dual USB, filter, MIDI channel and mixer paths |
| ableton-push-3 | https://help.ableton.com/hc/en-us/articles/8483423483036-Push-3-Audio-Interface-Specifications ; balanced audio, ADAT, pedal CV. Standalone playback is restricted to the standalone variant, not controller-only hardware. |
| hercules-djcontrol-inpulse-t7 | https://www.hercules.com/en-us/product/djcontrol-inpulse-t7/ ; motorized 7-inch platter, audio, FX, cue, stem controls |
| novation-launchpad-pro-mk3 | https://userguides.novationmusic.com/hc/en-gb/articles/25494488223762-Introduction-to-the-Launchpad-Pro-MK3 and https://userguides.novationmusic.com/hc/en-gb/articles/25494530115346-Launchpad-Pro-MK3-interface ; pressure-sensitive pads, standalone sequencer, MIDI ports, custom modes, published CC ranges |

The *remaining 30 newly added research profiles* retain preliminary test planning only and require the same per-model deep-dive. Test procedures remain **unvalidated on physical hardware**, even for the seven manufacturer-sourced profiles. Any quoted factory specification is distinct from a measured pass/fail threshold.
