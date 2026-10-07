# Device profile schema (binding contract)

One JSON file per device or medium: `app/devices/profiles/<id>.json` (UTF-8, 2-space indent).
Research notes with sources: `docs/devices/<id>.md`. Images: `app/devices/images/<id>.(jpg|png|svg)`.
Never copy manual text verbatim beyond short spec values; link manuals instead. Every spec and pass
threshold must cite its source (`source` = manual title + page/section, or URL). If a value could
not be confirmed, set `"confidence": "unverified"` and say why in `notes` — never invent numbers.

```jsonc
{
  "schemaVersion": 1,
  "id": "pioneer-plx-crss12",                 // kebab-case, unique
  "manufacturer": "Pioneer DJ",
  "model": "PLX-CRSS12",
  "aliases": ["Cross 12"],
  "category": "turntable|controller|mixer|audio-interface|timecode-media|software",
  "summary": "one or two sentences",
  "identityNotes": "ambiguities resolved (e.g. which MK/revision was assumed) or null",
  "image": { "file": "pioneer-plx-crss12.jpg", "kind": "photo|illustration",
             "source": "https://commons.wikimedia.org/...", "license": "CC BY-SA 4.0", "author": "..." } | null,
  "documents": [{ "title": "...", "type": "user-manual|service-manual|midi-message-list|driver|firmware|spec-sheet|support-article",
                  "url": "https://...", "language": "en", "notes": "..." }],
  "connectivity": {
    "usb": { "present": true, "vendorId": "0x2B73"|null, "productIds": ["0x..."], "classCompliant": false, "notes": "..." } | null,
    "midi": { "usbMidi": true, "din": false, "portNamePatterns": ["PLX-CRSS12"] } | null,
    "audio": { "usbChannelsIn": 2, "usbChannelsOut": 2, "sampleRatesHz": [44100,48000], "bitDepth": 24 } | null,
    "analog": ["PHONO/LINE out (RCA)", "..."]
  },
  "drivers": [{ "os": "windows", "name": "Pioneer PLX-CRSS12 driver", "asioName": "...|null",
                "deviceNamePatterns": ["regex-free substrings matched case-insensitively against Device Manager names"],
                "provider": "...", "latestKnownVersion": "...|null", "url": "...", "required": true, "notes": "..." }],
  "software": [{ "name": "Serato DJ Pro|Traktor Pro|rekordbox|...", "role": "dvs|controller|unlock|utility|firmware-updater",
                 "minVersion": "...|null", "notes": "..." }],
  "specs": [{ "key": "snake_case", "label": "...", "value": 0.1 | "text", "unit": "%|rpm|dB|Hz|ms|...",
              "tolerance": null | number, "source": "...", "confidence": "confirmed|unverified", "notes": null }],
  "timecode": { "formats": [{ "name": "Serato CV02.5", "vendor": "Serato", "carrierHz": 1000, "atRpm": 33.333,
                 "quadrature": true, "leadInSec": null, "notes": "...", "source": "...", "confidence": "..." }] } | null,
  "midi": {
    "mapSource": "URL of official MIDI message list | 'learn' when no public list exists",
    "complete": true,                         // false when only part of the map is published/known
    "controls": [{ "id": "deck1_play", "label": "PLAY/PAUSE", "group": "Deck 1",
                   "type": "button|fader|knob|encoder|jog|jog-touch|pad|switch|touch-strip|platter",
                   "message": { "kind": "note|cc|cc14|pitchbend|sysex", "channel": 1, "number": 11,
                                "msbNumber": null, "lsbNumber": null },
                   "range": [0, 127], "led": true, "notes": null }]
  } | null,
  "tests": [{
    "id": "crss12-pitch-range-8",              // unique within profile
    "category": "driver|usb|audio|timecode|dvs|midi|pitch|speed|mechanical|cartridge|mixer|software|latency|safety",
    "title": "Pitch range ±8 % accuracy",
    "why": "what failure this catches, plain English",
    "method": "<one of the methods below>",
    "params": { },                            // method-specific, e.g. {"nominalRpm": 33.333333, "pitchPositions": [-8,-4,0,4,8]}
    "steps": ["numbered, concrete user instructions incl. wiring"],
    "equipment": ["e.g. Serato CV02.5 control vinyl", "1 kHz test record"],
    "pass": { "metricId": "...", "op": "abs<=|<=|>=|between|equals|all-seen", "value": 0.1, "value2": null,
              "unit": "...", "source": "spec citation" } | null,   // null = informational/manual judgement
    "severity": "critical|major|minor",
    "software": "Serato DJ Pro|Traktor Pro|rekordbox|null"
  }]
}
```

## Methods (map onto DeckChek engines)
Existing audio workflows (`params` mirror their setup fields):
- `quick:Signal health`, `quick:Ground & hum`, `quick:Vibration`
- `speed:Speed & pitch` (referenceHz, nominalRpm), `speed:Pitch map` (pitchPositions[]), `speed:Quartz lock`,
  `speed:Warm-up speed`, `speed:Startup & brake`
- `cartridge:Channel & cartridge`, `cartridge:Channel separation`
- `dvs:DVS signal` (generic sine-pair integrity), `vinyl:Vinyl side scan`
New engines (being built in parallel):
- `timecode:format-check` — params {format: "<timecode format name>", nominalRpm}; measures carrier Hz (→ speed error), L/R quadrature phase (deg), L/R amplitude balance (dB), carrier SNR (dB), dropouts.
  metricIds: `tc_carrier_hz`, `tc_speed_error_percent`, `tc_phase_deg`, `tc_phase_error_deg`, `tc_balance_db`, `tc_snr_db`, `tc_dropouts`.
- `midi:coverage` — user exercises every control; params {groups?:[...]} ; metricIds `midi_controls_seen_percent`, `midi_unexpected_messages`.
- `midi:fader` — params {controlId}; full sweeps; metricIds `midi_fader_min`, `midi_fader_max`, `midi_fader_monotonic_percent`, `midi_fader_jitter_lsb`, `midi_fader_resolution_bits`.
- `midi:jog` — params {controlId}; one slow revolution each way; metricIds `midi_jog_ticks_per_rev`, `midi_jog_direction_errors`.
- `midi:button` — params {controlIds?}; metricIds `midi_button_bounce_count`, `midi_button_stuck`.
- `midi:led` — params {controlIds?}; app sends LED messages, user confirms; manual pass/fail.
- `midi:latency` — params {}; metricId `midi_jitter_ms` (inter-message timing jitter under constant motion).
- `driver:check` — params {}; uses System Health driver scan matched by `drivers[].deviceNamePatterns`; metricIds `driver_present`, `driver_signed`, `driver_status_ok`, `asio_registered`.
- `software:check` — params {software}; uses DJ-log scan; metricIds `software_installed`, `software_crashes_90d`, `software_log_errors`.
- `manual:inspection` — guided checklist the user ticks (mechanical/visual items); `steps` are the checklist.
