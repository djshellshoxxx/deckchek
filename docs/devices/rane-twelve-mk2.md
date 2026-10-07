# Rane Twelve MK2

Egress limits blocked fetching every page in this session; facts come from web-search snippets only and are marked unverified in the profile.

## Sources
- User guide v1.1: https://cdn.inmusicbrands.com/rane/twelveMKII/Twelve_MKII-UserGuide-v1.1.pdf (not read)
- FAQ: https://support.rane.com/support/solutions/articles/69000814170-rane-dj-twelve-frequently-asked-questions (not read)
- Community mapping thread: https://community.algoriddim.com/t/rane-twelve-mk2-behavior-midi-mapping/13098
- Retailer spec snippets (Galaxus, Thomann) for torque, pitch ranges, USB-C.

## Key specs (all unverified)
| Item | Value |
|---|---|
| Pitch ranges | ±8 / ±16 / ±50 % |
| Speeds | 33 1/3, 45 rpm |
| Motor | 16-pole 3-phase quartz direct drive |
| Starting torque | 3.4 (low) / 5.0 (high) kg·cm |
| Constant torque | 1.2 / 3.4 kg·cm |
| USB | USB-C |

## Testable
MIDI coverage, fader sweep/resolution/jitter, platter ticks per revolution and direction, buttons, LEDs, speed/pitch map/start-brake via a reference signal, driver and software checks.

## Not testable / gaps
- No official MIDI message list found: mapSource "learn", all control messages null, complete=false.
- USB VID/PID, class compliance, Windows driver name and firmware updater name unconfirmed.
- Platter ticks/rev and fader bit depth unpublished. Motor speed via audio needs a reference record since the unit has no audio output.
- Image: no free photo could be downloaded (Wikimedia blocked); original SVG illustration used.
