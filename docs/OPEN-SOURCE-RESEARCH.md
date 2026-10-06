# DeckChek open source research and reuse decisions

Research date: 2026-10-06 UTC (2026-10-05 in Vancouver).
Scope: existing SPEC-00–17 catalog, README and research; detailed review of architecture, measurement, DVS, vinyl scan, venue, reporting, data model, validation, roadmap and CDJ specifications.
Status: research and design recommendations, not implemented or benchmarked integrations. The initial snapshot inspected (569bc319) was specification-only; subsequent desktop-framework work is preserved by this documentation update. No third-party implementation code or audio assets were imported in this change.

## Main finding

No single project found in this bounded search supplies DeckChek's full combination of turntable measurement, DVS quality diagnostics, whole-side condition mapping, causal isolation, venue testing and comparison history. This is a search result, not a claim that no such software exists.

The fastest defensible approach is to reuse audio/device/file/DSP infrastructure and implement DeckChek's evidence and diagnosis layer. Published detector methods and existing applications provide comparison points; an application's working decoder or restoration algorithm does not establish diagnostic accuracy.

The repository currently uses a proprietary license. A GPL/AGPL implementation cannot simply be copied or translated into the proprietary core. Permissive components are the first choices. MPL/EPL components need their own source and notice handling. All final selections require verification at the exact dependency version and feature set.

## Closest functional matches

| Project | Overlap with DeckChek | Observed license | Decision |
| --- | --- | --- | --- |
| [xwax](https://github.com/xwax/xwax) | Stereo control-signal decoding, pitch/direction, absolute position, scope | GPL-3.0-only in inspected timecoder.c | Reference and external validation candidate; no core code import |
| [Mixxx](https://github.com/mixxxdj/mixxx) | Real-world DVS routing/calibration, vinyl-control UI, DJ hardware workflows | GPL-2.0-or-later in LICENSE; individual components differ | Workflow and independent playback comparison |
| [Needledropper's Declicker](https://github.com/keithhanlon/NeedledroppersDeclick) | AR residual click detection, stereo handling, waveform markers | AGPL-3.0-only in inspected detector header | Published-method reference; no import |
| [Audacity](https://github.com/audacity/audacity) | Capture, waveform inspection, click removal, manual labels | Distribution GPLv3; file-level licensing varies | External inspection and comparison |
| [TurntableRPMAnalysis](https://github.com/smcclem/TurntableRPMAnalysis) | Runout-click RPM calculation and statistics | MIT | Eligible algorithm port with notice; harden before reuse |
| [audfprint](https://github.com/dpwe/audfprint) | Landmark matching of noisy excerpts with timing offsets | MIT | Eligible matching port; adapt for drift and fine alignment |
| [WOW_Flutter_Meter](https://github.com/zolt8/WOW_Flutter_Meter) | Tone demodulation, weighted/unweighted RMS and quasi-peak | MIT in wrapper repository; upstream rights unresolved | Hold copied implementation pending provenance clarification |
| [WFGUI source](https://github.com/sibiryakov/wow-and-flutter-analyzer) | Windows wow/flutter measurement, logging and deviation traces | No root license observed | Study documented behavior; no copied code/assets |
| [AES6 W&F tool](https://github.com/alvaro-oliver/aes6-wow-and-flutter-meter) | Educational demodulation, weighting and synthetic comparisons | No root license observed | Method comparison only; no copied code, coefficients or fixtures |
| [Beat Link](https://github.com/Deep-Symmetry/beat-link) | Pro DJ Link beat/track/status metadata | EPL-2.0 | Future optional CDJ integration; not beta dependency |

### xwax and Mixxx: DVS

The inspected [xwax timecoder.c](https://github.com/xwax/xwax/blob/be863572137929f70aa3ff0cef3b6b76f4973005/timecoder.c) contains explicit media definitions for Serato 2nd Edition sides/CD, Traktor Scratch sides, MixVibes formats and Pioneer rekordbox sides. These are exact definitions, not blanket support for every current pressing. The file explicitly says proprietary incorporation requires a separate license.

Design consequence: separate generic scope/carrier diagnostics from actual decoding. A round scope can be healthy-looking without the position code being readable. Decoder lock needs format identity, confidence, validity windows and position continuity. Different formats also have different phase/polarity/channel conventions.

Mixxx's [license](https://github.com/mixxxdj/mixxx/blob/main/LICENSE) permits GPL redistribution, but does not authorize transplanting its code into the current proprietary core. It is useful for comparing capture routing and real hardware behavior. Its readout is another implementation, not measurement ground truth. A process boundary alone is not evidence that copied GPL functionality becomes compatible; any shipped decoder helper requires a concrete license/distribution review.

### Click detection: Needledropper, Essentia and Audacity

Needledropper's [README](https://github.com/keithhanlon/NeedledroppersDeclick/blob/main/README.md) describes autoregressive prediction errors and bidirectional repair. Its [ClickDetector.cpp](https://github.com/keithhanlon/NeedledroppersDeclick/blob/main/src/dsp/ClickDetector.cpp) identifies AGPL-3.0-only. The README also acknowledges percussive music false positives. Some detector comments sound more confident about drums than the README; DeckChek must validate behavior rather than inherit either claim.

[Essentia's official click-detection tutorial](https://essentia.upf.edu/tutorial_audioproblems_clickdetector.html) explains LPC prediction error and robust thresholds, with a published Vaseghi/Rayner reference. This is a useful algorithm description, not permission to copy the tutorial or library into DeckChek.

Audacity's [license statement](https://github.com/audacity/audacity/blob/master/LICENSE.txt) and [legacy click-removal UI source](https://github.com/audacity/audacity/blob/master/au3/src/effects/ClickRemoval.cpp) provide an external inspection path. Restoration success does not prove a click was physical damage.

Recommended independent implementation: high-pass/difference residual plus robust local thresholds first; evaluate an independently written LPC residual stage on a labeled corpus. Retain candidates and local context. Recurrence, replays and user adjudication decide whether an event supports a scratch hypothesis. Do not add silent repair or treat the number of repaired samples as a record-health score.

### TurntableRPMAnalysis: easy RPM addition, with corrections

The inspected [rpm.py](https://github.com/smcclem/TurntableRPMAnalysis/blob/main/rpm.py) selects positive peaks, sorts them chronologically, computes intervals, and converts each interval with RPM = 60 / interval. MIT reuse requires retaining [Scott McClements' notice](https://github.com/smcclem/TurntableRPMAnalysis/blob/main/LICENSE), including in a port.

Its README correctly notes that once-per-revolution measurement cannot measure flutter. Its sample-resolution examples are incorrect: one sample at 48 kHz is 20.833 microseconds, and at 192 kHz is 5.208 microseconds. These resolutions do not include interface-clock error or peak-localization uncertainty. At 33 1/3 RPM there are about 33 1/3 revolutions per minute, not 35.

Source-level issues to fix before porting:
- positive-only peaks can miss negative impulses;
- selecting the loudest N peaks can omit a revolution and double an interval;
- fewer than two peaks cannot produce RPM;
- plotting can reference an unset interval array after failed detection;
- stereo indexing assumes two channels;
- printed decimal places are not a statement of physical accuracy.

Recommended reuse: Rust implementation of interval statistics, documented as a port if adapted from the source. Keep candidate peak selection and robust missing-click logic separate. Expose per-revolution RPM and total elapsed-time RPM as distinct statistics. Do not publish weighted wow/flutter from this mode.

### audfprint: repeat-scan matching

The [README](https://github.com/dpwe/audfprint/blob/master/README.md), [matcher](https://github.com/dpwe/audfprint/blob/master/audfprint_match.py) and [MIT license](https://github.com/dpwe/audfprint/blob/master/LICENSE) support reuse of landmark-based matching. The implementation identifies noisy excerpts using consistent offsets among matching landmarks. It relies on Python and FFmpeg, so copying the complete tool would add an unwanted runtime stack.

Recommended port: sparse spectral landmarks and offset voting in Rust, then fine waveform/envelope correlation. Vinyl captures can differ in speed, drift and skips; a global offset alone is insufficient. Estimate a piecewise monotonic mapping, retain unmatched spans, and never force a match through a forward/backward skip. This extension is DeckChek work, not an existing audfprint guarantee. Fingerprint matches identify content regions; they do not confirm damage.

### Wow/flutter candidates: distinguish claims from proven rights and accuracy

[zolt8's README](https://github.com/zolt8/WOW_Flutter_Meter/blob/main/README.md) describes a C DLL adapted from Sibiryakov's code, itself originating in Alex Freed's WFGUI. Although the fork has an MIT license, no explicit root license was found in the inspected upstream repository. That creates unresolved provenance. Do not import the inherited implementation based only on the fork's MIT label.

The fork claims matching results with WFGUI. Matching an ancestor demonstrates consistency, not independent standards conformity. Mono 16-bit assumptions and tone/sample-rate limitations also need review.

The [AES6 tool README](https://github.com/alvaro-oliver/aes6-wow-and-flutter-meter/blob/main/README.md) provides educational steps and comparisons. No explicit root license was found. Do not copy its weighting CSVs, code or audio files. Independently generate frequency-modulated fixtures and obtain the exact measurement-method requirements before claiming IEC/DIN/AES/JIS conformity.

## Infrastructure that can save implementation time

| Component | Fit | License evidence | Recommendation and limitation |
| --- | --- | --- | --- |
| [CPAL](https://github.com/RustAudio/cpal) | Native device enumeration and capture in Rust | [Apache-2.0](https://github.com/RustAudio/cpal/blob/master/LICENSE) | First capture candidate; verify selected version/backend capabilities on actual Windows devices |
| [RustFFT](https://github.com/ejmahler/RustFFT) | Spectra, correlation and reusable DSP | [MIT](https://github.com/ejmahler/RustFFT/blob/master/LICENSE-MIT) or Apache-2.0 | First FFT candidate; FFT scaling and window calibration remain our responsibility |
| [hound](https://github.com/ruuda/hound) | PCM WAV reader/writer | [Apache-2.0](https://github.com/ruuda/hound/blob/release/license) | Simple WAV beta path; plan segmentation or RF64-capable replacement before 4 GiB RIFF limit |
| [rubato](https://github.com/HEnquist/rubato) | Sample-rate conversion in chunks | [MIT or Apache-2.0](https://github.com/HEnquist/rubato/blob/master/LICENSE.txt) | Derived analysis/audition streams only; do not correct away the speed error being measured |
| [Symphonia](https://github.com/pdeljanov/Symphonia) | Rust decoding of broader audio formats | [MPL-2.0](https://github.com/pdeljanov/Symphonia/blob/main/LICENSE) | Optional import extension; retain covered-source availability and notices |
| [miniaudio](https://github.com/mackron/miniaudio) | C capture/playback alternative | [Unlicense or MIT-0 choice](https://github.com/mackron/miniaudio/blob/master/LICENSE) | Fallback if CPAL evaluation fails; avoid maintaining two capture engines initially |
| [libebur128](https://github.com/jiixyj/libebur128) | Loudness and true peak | [MIT](https://github.com/jiixyj/libebur128/blob/master/COPYING) | Optional supporting metrics; loudness is not a physical vinyl condition grade |
| [midir](https://github.com/Boddlnagg/midir) | Native MIDI callbacks/SysEx for controller diagnostics | [MIT in inspected Cargo manifest](https://github.com/Boddlnagg/midir/blob/master/Cargo.toml) | Candidate for paid native Controller edition; browser free MIDI Tester keeps Web MIDI |
| [rusqlite](https://github.com/rusqlite/rusqlite) | Existing SQLite model in Rust | [README license section](https://github.com/rusqlite/rusqlite/blob/master/README.md) states MIT | Prefer if native backend uses Rust; review bundled feature dependencies |

Library names here are candidates, not locked dependencies. Exact versions, Cargo features, transitive licenses, notices, source availability and device behavior must be recorded when integration actually occurs.

## CDJ and venue scope

Beat Link can provide metadata and beat/status information for supported equipment. Its README reports incompatibilities, network-port contention with rekordbox and model-specific problems. Protocol status timestamps are not measured analog output latency or evidence of mechanical/CD drive health. Keep networking off by default and defer this to SPEC-10's later work.

For venue isolation and cartridge comparison, these projects provide DSP building blocks and measurement workflows, not a validated attribution engine. Preserve DeckChek's controlled A/B tests, chain metadata, uncertainty and evidence-linked hypotheses. Audio alone cannot establish exact stylus wear, exact groove radius or a universal cartridge ranking.

## Shortest implementation path

1. Evaluate one Rust capture/file/FFT stack: CPAL, hound and RustFFT. Keep the original PCM timebase.
2. Implement level, clipping, channel presence, balance/correlation and hum; persist the method and quality flags.
3. Add reference-tone speed and generic DVS scope. Add runout RPM as an explicitly limited alternate method.
4. Add robust impulse candidates, recurrence grouping, manual labels and full-side timeline. Measure false positives before adding a health score.
5. Add repeat-scan alignment using an MIT-compatible landmark port plus fine correlation and drift mapping.
6. Expand imports, resampling and loudness only where needed; keep actual position decoders and Pro DJ Link out of the beta's required path.

See [SPEC-18](SPEC-18-open-source-reuse-and-validation.md) for contracts and release gates. Existing spec amendments link the resulting requirements to their owning features.
