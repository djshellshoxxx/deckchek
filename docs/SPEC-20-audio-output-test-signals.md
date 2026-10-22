# SPEC-20: Audio Output Test Signals and Format Fixtures

## Purpose

Provide repeatable generated signals for checking speaker, PA, interface and cable routing, plus downloadable PCM fixtures whose declared sample rate, channel count, bit depth and bitrate match their encoded data. These are signal sources and file-format fixtures; they do not replace calibrated measurement equipment or prove a sound card's internal converter performance.

## Interactive test signals

- The desktop app MUST offer sine checks at 20, 31.5, 40, 63, 100, 250, 1,000, 5,000 and 10,000 Hz, a 20–120 Hz bass sweep, a 20 Hz–20 kHz sweep, and left/right channel identification.
- Tones MUST have finite duration and stop automatically. Ambient beds MAY loop, but MUST stop when the user stops playback or leaves the Calibration screen.
- The UI MUST list available output devices when the native backend can enumerate them and MUST report when output playback or enumeration is unavailable.
- Interactive test level MUST default below the native output ceiling. Requests MUST be clamped to no more than -12 dBFS in both JavaScript and the native audio generator. The user MUST be told to start with hardware gain low; digital attenuation does not limit amplifier gain.
- Generated ambience MUST be original synthetic audio and MUST avoid embedded third-party recordings. Loops MUST have bounded duration, predictable memory use and a low level.
- Stereo routing tests MUST produce audio only in the selected channel and use a short fade to reduce start and stop clicks.

## PCM fixture export

- Stereo WAV exports MUST support 44.1, 48 and 96 kHz through the UI and 16-, 24- and 32-bit signed integer PCM.
- The WAV header's format tag, sample rate, byte rate, block alignment, bit depth and data size MUST agree with the PCM payload.
- For stereo PCM, uncompressed bitrate MUST be calculated as `sampleRate × bitsPerSample × 2`; it MUST be labeled bit/s, not treated as a compressed audio bitrate.
- Numeric conversion MUST clip finite samples to [-1, 1], map negative full scale to the signed minimum and map non-finite samples to silence.
- Files MUST identify the generated signal and format in their filename or visible export summary.

## Measurement and diagnostic limits

- Playing a tone checks the selected output path only by observation unless a separately documented capture or microphone measurement is performed.
- The output-device sample-rate/channel values are informational metadata from the native backend. They MUST NOT be described as proof of active driver bit depth or converter quality.
- Audio file inspection may report the file's sample rate, bit depth, channel count and encoded bitrate. It cannot establish a device driver's negotiated format without a supported loopback or native endpoint query.
- Driver inventory and OS health checks are platform dependent. The current system health driver/event-log scan is Windows-specific; unsupported platforms MUST be labeled unavailable rather than healthy.
- Generic DVS tests measure the captured carrier and stereo signal properties. They do not claim proprietary Serato, rekordbox or Traktor decoding or absolute-position lock unless a decoder is implemented and validated separately.

## Acceptance evidence

- Unit tests cover catalog membership, level limits, channel routing, deterministic/seamless ambient generation, WAV metadata and PCM endpoint mapping.
- Native output must be smoke-tested on representative Windows, macOS and Linux audio endpoints before a release claims cross-platform audio output support.
- Physical PA/speaker listening and calibrated response/THD measurement remain manual acceptance checks. A digital tone test alone is not a complete soundcard or speaker test.
