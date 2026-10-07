# Native Instruments Traktor Audio 8 DJ

Research limits: only web search summaries were available (page fetch was blocked), so most numbers are marked `unverified` in the profile.

## Sources
- Operation manual (mirror): https://www.manualslib.com/manual/1300692/Native-Instruments-Audio-8-Dj.html (spec section pp. 21-23)
- Manual PDF (Juno): https://imagescdn.juno.co.uk/manual/354445-01U.pdf
- Driver 3.1.0 listing: https://drivers.softpedia.com/get/audio-dj-gear/Native-Instruments-Traktor-Audio-8-DJ-Driver-310.shtml
- Retail specs: https://www.zzounds.com/item--NINAUDIO8DJ , https://www.bhphotovideo.com/c/product/480075-REG/Native_Instruments_12872_Audio_8_DJ.html
- Launch article: https://rekkerd.org/native-instruments-shipping-audio-8-dj/

## Key specs
| Item | Value | Confidence |
|---|---|---|
| Channels | 8 in / 8 out USB 2.0, bus powered | unverified count |
| Sample rates | 44.1 / 48 / 96 kHz, 24-bit (Cirrus Logic converters) | confirmed |
| Phono preamps | two switchable phono/line input pairs | confirmed (qualitative) |
| Input impedance | line 47 kOhm; phono 47 kOhm / 1 MOhm | unverified |
| Max output | +9.7 dBu, THD+N 0.008-0.012 %, DR >100 dB | unverified |
| MIDI | DIN in/out | confirmed |
| Driver | NI Traktor Audio 8 DJ driver 3.1.0 (ASIO, control panel: phono gain, software lock, latency) | version via third party |

## Testable
Driver/ASIO presence, signal health per input/output pair (line and phono), hum, channel separation, timecode via phono/line, DIN MIDI loop, latency (manual read-out), Traktor log scan.

## Not testable
Preamp sensitivity/RIAA accuracy, converter specs (need lab gear); buffer-size list and exact control-panel layout (manual not opened).

## Ambiguities
Product is branded Audio 8 DJ; "Traktor Audio 8 DJ" assumed same. USB product ID and ASIO driver display name unconfirmed. Official Windows 10/11 support unconfirmed.
