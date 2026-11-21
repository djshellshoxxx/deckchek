# DeckChek Feature Matrix

Current state: 21 November 2026, America/Los_Angeles. Use the
[continuation handoff](DECKCHEK-CONTINUATION-HANDOFF.md) for current source,
worker ownership and gates. The [dated history](FEATURE-MATRIX-HISTORY-2026-11-21.md)
preserves the previous complete document; its older resume instructions and
source-specific results are historical.

PR [#74](https://github.com/djshellshoxxx/deckchek/pull/74) is qualified and merged
as `77c26f44710c6dfb1c986fb79266c233e2ae688c`. The default-off Player preview,
corrected outcome/usage behavior and bounded redaction are on main. Reference
identity, PDF-axis, toolbar/guide and ledger preset corrections are on the held
successor. Its 82 focused cases passed; the earlier complete numerical gate
failed, and the 33-case instrumented pass does not clear that hold. See the
[merge proof](engineering/PLAYER_CAPTURE_MERGE_2026-11-21.md) and
[audio context](engineering/AUDIO_CONTEXT_CONTINUATION_2026-11-20.md).

## Current implementation snapshot

The table below is intentionally conservative. “Implemented” means code exists and is exercised by deterministic tests; it does not override validation gates in SPEC-08/SPEC-19.

| Capability slice | Status | Notes |
| --- | --- | --- |
| Local audio-file analysis | Implemented | Browser/Tauri shell decodes local audio without upload. |
| Stereo signal Quick Check | Implemented | RMS, clipping, balance, correlation/polarity, hum and dropout evidence. |
| Reference-tone speed/pitch | Implemented, validation-gated | Frequency, RPM, pitch error, speed trace, drift and short-term variation proxy. |
| Pitch-map workflow | Implemented | Multi-run slope, nonlinearity, hysteresis and dead-spot candidates. |
| First-run setup wizard (FS-01) | Implemented | Six resumable steps; re-run from Options. |
| Diagnostics bundle and crash prompt (FS-02) | Implemented | Local zip, redaction, crash marker on exit; nothing uploaded. |
| Open external links (FS-07) | Implemented | Allowlist plus confirm dialog; desktop command is authoritative. |
| Test media library (FS-06) | Implemented | On by default (no flag in the spec; `testMedia` defaults on and Experimental features can switch it off). Picker prefill, result and History record of the medium used. Choosing a timecode medium sets the decoder format explicitly: the DVS form has a Timecode format field (Auto-detect is only the fallback), and the scratch test and control-vinyl forms take a medium to set their format. The M6 forms for pre-gig, stylus and latency do not take a medium. |
| Backup and restore (FS-08) | Implemented software; final source41 qualification separate | Existing native backup/safety/schedule/free-space behavior and separate browser/native catalog/history formats remain. Native schema 25 backup retains incident evidence. Source40 primary native/browser checks completed at their own tree; catalog browser checks use deterministic IPC fixtures. Actual restore/dialog/platform qualification remains scoped. |
| Stylus wear tracker (FS-12) | Implemented, flag `stylusWear`, hardware-unvalidated | Hours ledger (manual, DeckChek capture sessions and DJ-log proposals), life gauge, benchmark entry, trend charts with regression, degradation alerts, snooze, replacement reset, PDF report. Benchmarks can be entered, filled from saved runs, or acquired through the guided stereo/isolated-channel/optional-timecode workflow. Evidence and lifecycle corrections, including the version-3 Hann measurement basis, have passed independent review; browser/platform and physical repeatability acceptance remain pending. |
| Booth feedback and hum hunter (FS-15) | Implemented bounded software; flags and physical gates retained | Existing hum/feedback, seven manual incident categories, immutable context, pagination, saved supports and passive LF A/B remain. Native incidents can optionally attach one selected already-running monitor generation’s latest reading frozen at press, with an atomic immutable pair and bounded report/history detail. Default OFF; no new capture, PCM or post-press window. Broader windows/shock/DVS/onset outcomes and H-15 remain open. [Contract](incident-metric-evidence.md). |
| Saved support descriptions (FS-15 prerequisite) | Implemented; current descriptions remain distinct from captured A/B context | Equipment saves descriptive fields and setup assignments while preserving legacy structure and hidden context. Asset replacement clears its former settings link; bound venue changes reject. Reports label current support context and propagate failed/missing measured-history reads. Browser workspace JSON excludes supports/setups; the separate catalog file transfers them with unresolved native-only references disclosed. No isolation-performance or hardware claim. |
| Passive support A/B (FS-15 §14) | Implemented software; hosted/hardware qualification open | Two passive native stereo observations retain original context, capture quality, calibration and numerical evidence. The versioned 20–200 Hz statistic reports B−A only for operator-reported comparable conditions; uncertainty remains unknown and no audio is emitted. UI/report show up to 50 observations and 50 comparisons each, with totals. The separate browser archive now transfers all retained originals and comparisons; current editable catalog travels in its separate bounded file. [Method and proof](DECKCHEK-CONSOLIDATION-REPORT.md#passive-support-ab-observations-and-comparisons). |
| Native support-history working memory | Implemented; full-application qualification open | Streaming global validation retains bounded pages and full comparison originals without changing list limits, transactions, errors or stored values. The measured Rust peak excludes SQLite/C and process RSS; additional parsing increases cumulative allocation and sampled debug time. [Source38 proof and limits](DECKCHEK-NATIVE-HISTORY-FOLLOWUP.md). |
| Scratch stress test (FS-14) | Implemented, hardware-validation pending | Guided baby/transform/chirp protocol with metronome, results, history and compare; flag `scratchTest`. Each run stores the cartridge, setup and control-vinyl side, and Compare groups by all three plus format and tempo. PDF report. Skip thresholds are uncalibrated and labelled so. If another feature holds the input the test shows a plain error, not the "Stop and continue" dialog (follow-up). |
| DVS latency and buffer tuner (FS-11) | Implemented, flag `latencyTuner`, hardware-unvalidated | Four steps: Measure (patch-cable guide, WASAPI round trip with k=2 uncertainty and reported-vs-measured), Buffer test (idle and CPU-load sweep, detects at run time whether Windows honours the buffer size: A honoured, B partly, C ignored, D streams fail), Recommendation (per Serato / Traktor / rekordbox with their own setting names, typed ASIO buffer labelled as typed), Windows tuning checklist (pass / review / unknown with check command, manual path and Win+R shortcut; nothing is changed) plus the busiest programs and running DJ software after a scan. Every value is labelled WASAPI, not ASIO. Latest runs are saved; export is JSON (Ctrl+E) or PDF. Entry points: Quick Check, Calibration and pre-gig fixes link here (M6 cross-links). rekordbox and Traktor Pro 4 setting names are unverified. |
| Pre-gig check (FS-10) | Implemented, flag `pregig`, hardware-unvalidated | One Start button, live checklist with a status word per step, green / amber / red verdict with fix-it buttons, single-step and problem-only re-run, comparison with the previous run, history with compare, presets (three built-in rigs, create, from gear, edit, duplicate, delete, import/export). Each deck captures on its own input pair (deck B on 3-4 for the Traktor Audio 8 DJ rig); per-deck Inputs boxes on the start card are remembered per interface, and a pair the interface lacks shows "No such input" (not a failure, verdict "Not fully checked"). Control-vinyl formats come from the test-media library. Hum thresholds are unmeasured defaults; Result exports as JSON or PDF (FS-03 kind `pregig`); Quick Check links to it. Fix actions link to Hum hunter, Stylus and Latency, and "Open ... settings" opens Windows Settings through a fixed three-page allowlist (sound, power, microphone privacy), copying the Win+R shortcut if that fails. |
| Mobile companion (FS-30) | Implemented, desktop import behind flag `phoneImport`, PWA not hosted, hardware-unvalidated | `mobile/` PWA: speed by reference tone with uncertainty, mains strobe helper (dot rows, on-screen strobe with photosensitivity confirmation), plinth vibration (0.5-30 Hz, relative), indicative SPL (uncalibrated banner, A/C), offline, export as `.deckchek-mobile.json` / share sheet / QR (hash, not a signature). Desktop: Import phone results (paste, file or QR text) adds a run with origin `phone` to History and an asset (`0018_session_origin`). QR import preserves significant chunk whitespace through the actual parser; bounded codepoint framing and generated-mobile parity are covered by the [current continuation](engineering/MOBILE_QR_CONTINUATION_2026-11-20.md). Deploy is manual-dispatch only until the hosting decision (R12). |
| Used-gear certificate (FS-20) | Implemented, flag `certificates`, hardware-unvalidated | Ed25519-signed certificate per unit (key per install, DPAPI on Windows), strict verifier (VALID, MODIFIED, UNVERIFIABLE, plus EXPIRED), `.deckchek-cert.json` plus PDF with fingerprint and QR `deckchek:cert:v1:<sha256>`. Certificates and Verify certificate screens (Ctrl+Shift+V). No JSON is embedded in the PDF, so a PDF cannot be verified on its own. |
| Unit vs population (FS-21) | Implemented; pack candidate verified, independent acceptance ACCEPT_FOR_INTEGRATION; all three findings resolved (review `7cf97921a5052faa32c669b154e5576682d50848ffe51c1596122876edb9f77f`); hardware-unvalidated | Existing Spec/My units/Population behavior and contributor thresholds remain. Candidate Save uses only the current completed preview’s private rows/metadata snapshot and rejects stale/duplicate ownership. Copy discloses month metadata and avoids guaranteed unlinkability after token reset. Persistent 16/16, related 32/32 and unchanged independent 3/3 passed; hosted execution remains source-specific. |
| Service worksheets (FS-22) | Implemented, flag `service`, hardware-unvalidated | Repair jobs `J-<year>-<seq>` with intake, before/after measurements from the device runner, append-only work log, up to 10 photos and a printable job sheet (Ctrl+J for a new job). Customer details stay local and are kept out of workspace export, packs, ledgers and the diagnostics bundle. |
| Venue fleet dashboard (FS-23) | Implemented, flag `fleet` (default off; manual opt-in), hardware-unvalidated | Fleet grid with filters and CSV export, venue/booth/position editor, placement, maintenance log, reminders in days or confirmed hours with templates and snooze, start-up banner, printable booth sheet. Hours are estimates from the usage ledger, not measured runtime. |
| Timecode doctor live monitor (FS-31) | Implemented, flag `liveMonitor`, hardware-unvalidated | Existing up-to-two-deck monitor, retention, tray and acquired-carrier negative-SNR behavior remain. Optional native incident evidence selects an already-running generation and freezes its latest frame; separate clocks and operator context are disclosed. No lease/start/stop/preemption or new DSP window. WASAPI/shared-software, cold-start and changing-pitch noise limits remain. |
| MIDI mapper studio (FS-32) | Implemented, flag `mapperStudio`, hardware-unvalidated | Existing Mixxx/VirtualDJ round trips, Serato/Traktor reports and strict XML remain. A learned map stays associated with its originating product profile when an asset changes product; explicit import and same/unknown legacy identity retain their contract. Actual VirtualDJ format and physical MIDI qualification remain open. |
| Logical MIDI routing (FS-32/36) | Implemented software; physical identity/continuity and current-source hosted qualification open | [Explicit backend/direction-scoped IDs](specs/36-general-midi-test.md#7-explicit-logical-endpoint-selection), legacy unique names, input-only close, captured outputs and shared pending Runner/Mapper ownership. Duplicate names need distinct usable IDs; output pairing stays explicit. The separate MIDItest consumer is not integrated. |
| Gear ledger (FS-33) | Implemented, flag `gearLedger`, hardware-unvalidated | Static shareable page of selected gear with Public, Insurance and Private presets, EXIF strip, path scrub, offline verify script for certificates, atomic folder export. Manual Pages root, visibility, stale-file and Git-history guidance checked against current GitHub docs on 20 November 2026; real publishing/privacy walkthrough remains H-33. DeckChek never uploads. |
| Device test completeness (FS-34) | Implemented software; remaining prerequisites explicit | [The matrix](testing/DEVICE-TEST-COVERAGE.md) retains **45 profiles, 506 handwritten and 187 generated checks, zero gaps; 22 conditional audio profiles and 3 conditional MIDI profiles / 9 requirements**. Source41 adds fifteen exact MIDI flags in fourteen profiles and Push3 16-in/16-out USB audio. Original/manual/mode/direction limitations remain; class compliance, receiving/Identity/maps, rates/bit depths and physical qualification are not inferred. |
| Output audio-quality test (FS-35) | Implemented; numerical investigation [#72](https://github.com/djshellshoxxx/deckchek/issues/72) remains open; hardware-unvalidated; [browser CI passed at `742c67a`](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624237913) | `audio:quality`: stimulus capped at −12 dBFS; THD+N/THD, noise/SNR, separation, balance, polarity, flatness, linearity, dropouts and clipping. Analysis revision 2 judges the worst response channel and retains both channels. Lease-scoped capture, owned cancellation, native capture provenance and actual-device/rate calibration matching; faulty or unavailable capture evidence gives REVIEW. Progress, Enter/Esc and focus transitions are implemented. Imported recordings retain explicitly unobserved continuity. All seven FS-35 browser checks passed in the 1,283/1,283-check run, with no console errors; I/O remains simulated. Source-specific standard/native/platform gates passed through #74; physical qualification and the independent successor numerical hold remain. Thresholds are unchanged. |
| General MIDI testing (FS-36) | Implemented in software, hardware-unvalidated; [browser CI passed at `742c67a`](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624237913) | `midi:conformance` validates Identity Reply, message/SysEx/note/14-bit/Active Sensing/Clock evidence and burst rate. Host drops, unavailable/reset counters or missing/unavailable input observations give REVIEW with shared-counter provenance. Explicit output selection and duplicate-name guards preserve connection ownership. `midi:gm` offers ten audible GM Level 1 checks with owned abort cleanup; auto-added only for profiles with `midi.generalMidi`. The source-specific browser run passed 1,283/1,283 checks with no console errors. Final native/platform qualification and physical MIDI/audible GM qualification remain pending. |
| Audit, fuzzing and CI (2026-10) | Implemented | Database commands off the UI thread, write allowlist, untrusted restored databases, tighter CSP; 11 cargo-fuzz and 13 JS fuzz targets; first-party CI (per-push, nightly with ASan, stress and long fuzzing, per-platform release builds); packaged-app `--self-test`. |
| Canonical JSON, SHA-256, QR and metric-compat (FS-00 §4.12-4.13) | Implemented (library) | `canonical.rs` and `app/canonical-json.js` produce identical bytes for the shared vectors and reject non-integer numbers, NaN, infinities, lone surrogates and nesting over 64; `app/vendor/qr.js` (qrcode-generator 1.4.4) with `qrSvg`; `app/metric-compat.js`. Consumed by FS-20, FS-21, FS-22, FS-30 and FS-33. |
| Photo store (FS-00 §4.11) | Implemented (used by FS-20, FS-22 and FS-33) | Content-addressed JPEG store (`0013_photo_store.sql`, `photo_*` commands, `app/photo-store.js`): EXIF/APP1 rejected, 1600 px and 2 MB caps, SHA-256 file names, deduplicated, included in backups. Browser mode keeps photos in memory for the session only. |
| Experimental features panel (FS-00) | Implemented | Options > Support > "Experimental features…" opens a dialog with one switch per flag that has code behind it, an "Experimental" chip on those that ship off, and "Reset to defaults". Only `diagnosticsBundle`, which is always on, is not listed. |
| M6 cross-links | Implemented (follows each feature's flag), hardware-unvalidated | Quick Check suggests Pre-gig, Latency and Hum hunter and shows the active cartridge's wear % and next alert; DVS links to the Scratch test and Wear map; Calibration links to Latency; an Equipment cartridge opens its Stylus page (that cartridge) and the Wear map, a DVS-media asset the Wear map, an interface the Latency tuner. History lists hum, latency, scratch, wear-map and pre-gig runs beside diagnostic runs with a type filter; selecting one shows a summary and opens the feature screen. Feature runs are desktop only. |
| Control-vinyl wear map (FS-13) | Implemented, flag `wearMap`, hardware-unvalidated | Streaming side scan (live input or a recording) into 1-5 s bins with SNR, phase error, dropouts and level; needle drop/lift, speed change and needle-skip detection mark bins interrupted. Circular groove heat-map and linear timeline (keyboard-navigable bins, details panel with a waveform snippet for scans made this session, data table, hatch/texture so colour is never the only signal), previous-scan comparison aligned by needle drop or level envelope, keep / watch / use other side / replace verdict with the three worst bins, PDF report. Scans opened from History show numbers only (raw audio is never stored). Captures input pair 1-2 only. The DVS screen links to it and Equipment cartridges and DVS media open it. Thresholds are uncalibrated against real lock loss. |
| PDF reports (FS-03) | Implemented | WebView2 `PrintToPdf` through a hidden print host on Windows, print-dialog fallback elsewhere. Kinds: run, device, systemHealth, pregig, latency, stylus, wearMap, scratch, hum and venue. A timeout offers Retry; the saved toast offers Open and Show in folder. |
| Startup/brake | Partial | Signal-envelope timing proxy implemented; validated platter-speed transition method remains outstanding. |
| Cartridge diagnostics | Partial | Balance/polarity and THD estimate implemented; guided L/R isolated-track channel-separation (crosstalk) workflow implemented; full alignment workflows remain. |
| Generic DVS | Implemented foundation | Scope geometry, levels, correlation and missing-signal timeline; no vendor-specific decoding yet. |
| Full-side vinyl scan | Implemented foundation | Transient candidates, recurrence, hum/rumble proxy, normalized positions, repeat-event comparison/persistence and condition summary; mature classifiers and offset/drift alignment remain. |
| Diagnostic reasoning | Implemented foundation | Transparent hypotheses, alternatives and isolation tests; the evidence graph (hypothesis, support, contradiction) is persisted in Tauri mode. |
| SQLite history | Implemented foundation | Sessions, method-versioned measurements and finding evidence are written in Tauri mode. |
| Reports and portability | Implemented foundation, separate archives and bounded incident evidence | Existing HTML/PDF/CSV/workspace/report formats and browser/native catalog/history contracts remain. Native incident schema 25 pairs support saved-detail download and bounded report summaries, with absent/unloaded/failed states distinct. No historical remapping or inferred device-profile association; no physical-cause claim. |
| Native continuous capture | Implemented in software; hardware qualification pending | Continuous stereo capture uses an SPSC ring buffer (`rtrb`) and capture-quality counters in `src-tauri/src/capture.rs`. Supported real-device and driver combinations remain unqualified. |
| Hardware calibration/uncertainty | Implemented in software; reference qualification pending | Interface loopback calibration and uncertainty propagation are implemented. Gain, channel matching, noise, distortion, latency, clock and coarse frequency-response estimates require known-reference validation before calibrated accuracy claims. |
| Venue/CDJ/controller/Technician advanced workflows | Not implemented | Shared measurement primitives can be reused, but category-specific workflows remain. |
| CDJ-04 Player capture preview | Partial production workflow; default-off UI merged through #74 | Single-pair, 1–30 second lease-scoped capture with native-observation metadata, owned cancellation and local metadata-only export. Records remain provisional, unverified, unmeasured and report-ineligible; raw/reference retention, pitch integration, persistence/reporting and scientific/physical qualification remain open. [Qualified merge](engineering/PLAYER_CAPTURE_MERGE_2026-11-21.md). |
| Optional reference-file identity | Implemented on held successor; complete qualification pending | Exact bounded file-byte SHA-256 plus filename/length metadata, stale-operation guards and late-picker cleanup. Bytes are not retained, decoded, uploaded or proven to be playing. [Reference contract and failed full gate](engineering/PLAYER_REFERENCE_CONTINUATION_2026-11-20.md). |

See [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) for the detailed reconciliation.

### Reviewed continuation and remaining gates

The following contribution narratives retain their earlier source-specific qualification snapshots, including the open-gate wording at those checkpoints. The current source41 table above and [completed preceding hosted checks](DECKCHEK-CONTINUATION-41.md#completed-preceding-hosted-checks) identify the later state; earlier counts are not transferred to new bytes.

Native MIDI guard [b34f3c9](https://github.com/djshellshoxxx/deckchek/commit/b34f3c905ce60d64bfd15587a9c8906c3fd7a650) rejects duplicate successfully read names on new connections and explicit cached input reopens, while preserving an existing input on ambiguous reopen. Captured output sends/Note Off cleanup do not re-enumerate; ambiguous reconnects reject. Five new native regressions, 19/19 extracted-production-body harness tests and six independent boundary checks support this correction. Stable physical identity, hot-plug/same-name substitution, unreadable-name uncertainty and real hardware remain unqualified; [FS-36 §6](specs/36-general-midi-test.md#6-native-port-selection-and-remaining-identity-limits) defines these limits.

Service lifecycle correction [9192aa0](https://github.com/djshellshoxxx/deckchek/commit/9192aa0) handles shortcut navigation errors visibly and preserves a new intake form against stale job/comparison responses. Independent review and 48 focused service/crosslinks/PII tests passed; owner H-22 and full current CI remain open.

Mapper save correction [00f1f3c](https://github.com/djshellshoxxx/deckchek/commit/00f1f3cc8d96527f436ee28958ed23201b60a01b) keeps a pending save's ID/status with its originating mapping when New/Open selects another model; normal edits and hide/show remain supported. Independent review accepted 47 focused tests plus four notification/concurrency/error probes. This does not qualify real mapper hardware, VirtualDJ interoperability or full current CI.

Verification is source-specific: browser **1,283/1,283** with all seven FS-35 checks/no console errors applies to `742c67a`. JavaScript CI at `730d71d` passed **1,325 tests/one skip**, but [native compilation failed with E0428](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728404). The alias fix [8acaa7a](https://github.com/djshellshoxxx/deckchek/commit/8acaa7a) and later native changes still need fresh full CI; focused harnesses do not qualify native/platform or hardware behavior. The same `730d71d` source also passed [1,283/1,283 browser checks with no console errors](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728622) and the JavaScript performance gate; its native compilation failure occurred before application tests ran. Service `9192aa0`, alias `8acaa7a`, native MIDI `b34f3c9` and mapper `00f1f3c` are later follow-ups and are not covered by that CI run.

The combined local follow-up source, including service/MIDI/mapper corrections, passed **1,338 Node 22 tests, zero failures, one optional skip** (1,339 total), and formatting passed. Full native/platform and broad Sonar gates remain open.


| Area | Feature | Primary spec | Planned phase |
|---|---|---|---|
| Editions | Free MIDI Tester capability inventory | SPEC-11 | Existing separate app |
| Editions | Vinyl paid edition | SPEC-11, SPEC-01 to SPEC-06 | Package after required phases |
| Editions | CDJ / Media Player paid edition | SPEC-11, SPEC-10 | Package after required phases |
| Editions | Controller paid edition | SPEC-11 | After controller tests validated |
| Editions | Ultimate bundle | SPEC-11 | After all three paid modules |
| Editions | Capability-based hybrid device profiles | SPEC-11, SPEC-04, SPEC-07 | Shared database phase |
| MIDI Tester | Live decoded and raw MIDI monitor | SPEC-11 | Existing separate app |
| MIDI Tester | Input/output device selection and connection log | SPEC-11 | Existing separate app |
| MIDI Tester | CC inventory, range, distinct values, jitter and jumps | SPEC-11 | Existing separate app |
| MIDI Tester | Encoder behavior hints and direction changes | SPEC-11 | Existing separate app |
| MIDI Tester | Held notes, pitch bend and MIDI clock input | SPEC-11 | Existing separate app |
| MIDI Tester | MIDI Learn and labelled mapping worksheet | SPEC-11 | Existing separate app |
| MIDI Tester | Note On/Off output and all-channel panic | SPEC-11 | Existing separate app |
| MIDI Tester | Guided checks, local baseline and JSON export | SPEC-11 | Existing separate app |
| Controller | MIDI/HID/control-surface diagnostics | SPEC-11 | Future controller phase |
| Controller | Fader range, dead zone, monotonicity and repeatability | SPEC-11 | Future controller phase |
| Controller | Encoder, jog, pad and button behavior tests | SPEC-11 | Future controller phase |
| Controller | Controller audio I/O and loopback checks | SPEC-11 | Future controller phase |
| Controller | Motorized control-deck diagnostics | SPEC-11 | Future controller phase |
| Controller | Supported mapping/software behavior checks | SPEC-11 | Future controller phase |
| GUI | Navigation, screen states, accessible live monitoring and results | SPEC-13 | Shared foundation |
| Wiring | Physical route graph, safe input guidance, capture point declaration | SPEC-14 | Shared foundation |
| Audio routing | Device enumeration, channel map, calibration and disconnect behavior | SPEC-14 | 0-1 |
| Input/output | Audio, MIDI/HID, references, sensors, data persistence and export contracts | SPEC-15 | Shared foundation |
| Workflow | Session lifecycle, preflight, pause/stop, recovery and result finalization | SPEC-16 | Shared foundation |
| Functional behavior | Edition/capability planning, reports, comparisons and unavailable-state rules | SPEC-16 | Shared foundation |
| Operations | Crash recovery, storage failure, migration, privacy and support bundles | SPEC-17 | All phases |
| Release quality | Installer/update/uninstall, security checks and release gates | SPEC-17 | Release gates |
| Input | Audio device selection/routing | SPEC-00, SPEC-01, SPEC-14 | 0-1 |
| Input | L/R signal presence | SPEC-01 | 1 |
| Input | Clipping detection | SPEC-01 | 1 |
| Input | Capture dropout/discontinuity detection | SPEC-00 | 1 |
| Input | Interface calibration/loopback | SPEC-00, SPEC-08 | 1 |
| Turntable | Actual RPM | SPEC-01 | 2 |
| Turntable | Speed error | SPEC-01 | 2 |
| Turntable | Warm-up drift | SPEC-01 | 2 |
| Turntable | Wow | SPEC-01 | 2 |
| Turntable | Flutter | SPEC-01 | 2 |
| Turntable | Revolution-synchronous modulation | SPEC-01 | 2 |
| Turntable | Off-center indicator | SPEC-03 | 7 |
| Turntable | Pitch-fader mapping | SPEC-01 | 2 |
| Turntable | Pitch-fader dead spots | SPEC-01 | 2 |
| Turntable | Pitch nonlinearity | SPEC-01 | 2 |
| Turntable | Pitch hysteresis | SPEC-01 | 2 |
| Turntable | Quartz-lock accuracy | SPEC-01 | 2 |
| Turntable | Quartz lock acquisition | SPEC-01 | 2 |
| Turntable | Startup time | SPEC-01 | 2 |
| Turntable | Startup overshoot/settling | SPEC-01 | 2 |
| Turntable | Brake time | SPEC-01 | 2 |
| Turntable | Platter drag/recovery | SPEC-01 | 2 |
| Turntable | Torque/acceleration proxy | SPEC-01 | 2 |
| Cartridge | Channel balance | SPEC-01 | 3 |
| Cartridge | Channel separation/crosstalk | SPEC-01 | 3 |
| Cartridge | Relative phase | SPEC-01 | 3 |
| Cartridge | Polarity/wiring fault | SPEC-01 | 1-3 |
| Cartridge | Azimuth evidence | SPEC-01 | 3 |
| Cartridge | Anti-skate evidence | SPEC-01 | 3 |
| Cartridge | Frequency response | SPEC-01 | 3 |
| Cartridge | Harmonic distortion | SPEC-01 | 3 |
| Cartridge | Mistracking detection | SPEC-01 | 3 |
| Cartridge | Tonearm/cartridge resonance | SPEC-01 | 3 |
| Signal | 50/60 Hz hum | SPEC-01 | 1 |
| Signal | Harmonic hum family | SPEC-01 | 1 |
| Signal | Rumble/subsonic | SPEC-01 | 1-2 |
| Signal | Headshell intermittent contact | SPEC-01 | 3 |
| Signal | RCA intermittent contact | SPEC-01 | 3 |
| Diagnostic | Swap-test troubleshooting | SPEC-06 | 10 |
| Diagnostic | Evidence vs hypothesis | SPEC-00, SPEC-06 | all |
| Diagnostic | Cause confidence | SPEC-06 | 10 |
| Diagnostic | Isolation-test planner | SPEC-06 | 10 |
| Comparison | Deck A vs Deck B | SPEC-01, SPEC-06 | 2+ |
| Comparison | Health vs match score separation | SPEC-06 | 10 |
| History | Turntable health baseline | SPEC-01 | 11 |
| History | Maintenance trend | SPEC-01, SPEC-04 | 11 |
| DVS | Generic XY scope | SPEC-02 | 4 |
| DVS | Ellipse/circularity analysis | SPEC-02 | 4 |
| DVS | L/R timecode levels | SPEC-02 | 4 |
| DVS | Timecode channel balance | SPEC-02 | 4 |
| DVS | DVS phase/polarity | SPEC-02 | 4 |
| DVS | Timecode clipping | SPEC-02 | 4 |
| DVS | DVS SNR/noise | SPEC-02 | 4 |
| DVS | DVS hum/rumble | SPEC-02 | 4 |
| DVS | DVS crosstalk | SPEC-02 | 4 |
| DVS | Signal integrity/readability | SPEC-02 | 4-5 |
| DVS | Vendor format auto-detection | SPEC-02 | 5 |
| DVS | Serato analyzer | SPEC-02 | 5 |
| DVS | Traktor analyzer | SPEC-02 | 5 |
| DVS | rekordbox analyzer | SPEC-02 | 5 |
| DVS | Open/xwax-compatible analyzer | SPEC-02 | 5 |
| DVS | Unsupported/generic format mode | SPEC-02 | 4 |
| DVS | Absolute position where supported | SPEC-02 | 5 |
| DVS | Position continuity/jumps | SPEC-02 | 5 |
| DVS | Direction detection | SPEC-02 | 5 |
| DVS | Instantaneous timecode speed | SPEC-02 | 5 |
| DVS | Velocity discontinuity detection | SPEC-02 | 5 |
| DVS | DVS dropout detection | SPEC-02 | 4-5 |
| DVS | Needle-drop acquisition test | SPEC-02 | 5 |
| DVS | Scratch stress test | SPEC-02 | 6 |
| DVS | Direction reversal count | SPEC-02 | 6 |
| DVS | Scratch tracking-loss recovery | SPEC-02 | 6 |
| DVS | Cue-point torture/wear test | SPEC-02 | 6 |
| DVS | Full control-vinyl side scan | SPEC-02 | 5-6 |
| DVS | Control-vinyl wear map | SPEC-02 | 5-6 |
| DVS | Repeat-scan wear confirmation | SPEC-02 | 6 |
| DVS | Media vs cartridge/mixer isolation | SPEC-02 | 5-6 |
| DVS | Two-deck DVS matching | SPEC-02 | 6 |
| Vinyl scan | Entire side capture | SPEC-03 | 7 |
| Vinyl scan | Lead-in/runout handling | SPEC-03 | 7 |
| Vinyl scan | Click detection | SPEC-03 | 7 |
| Vinyl scan | Pop/tick detection | SPEC-03 | 7 |
| Vinyl scan | Repeating scratch detection | SPEC-03 | 7 |
| Vinyl scan | Scratch recurrence by revolution | SPEC-03 | 7 |
| Vinyl scan | Isolated surface damage | SPEC-03 | 7 |
| Vinyl scan | Crackle density | SPEC-03 | 7 |
| Vinyl scan | Surface-noise timeline | SPEC-03 | 7 |
| Vinyl scan | Groove-wear hypothesis | SPEC-03 | 7 |
| Vinyl scan | Inner-groove degradation | SPEC-03 | 7 |
| Vinyl scan | Forward skip | SPEC-03 | 7 |
| Vinyl scan | Backward skip | SPEC-03 | 7 |
| Vinyl scan | Locked/stuck groove | SPEC-03 | 7 |
| Vinyl scan | Warp indicator | SPEC-03 | 7 |
| Vinyl scan | Off-center pressing indicator | SPEC-03 | 7 |
| Vinyl scan | Non-fill/stitching-like defect | SPEC-03 | 7 |
| Vinyl scan | Static-like impulse | SPEC-03 | 7 |
| Vinyl scan | Dust/debris hypothesis | SPEC-03 | 7 |
| Vinyl scan | Stylus contamination hypothesis | SPEC-03 | 7 |
| Vinyl scan | Groove-wall/channel damage | SPEC-03 | 7 |
| Vinyl scan | Sibilance/mistracking event | SPEC-03 | 7 |
| Vinyl scan | Hum timeline | SPEC-03 | 7 |
| Vinyl scan | Rumble/feedback timeline | SPEC-03 | 7 |
| Vinyl scan | Footfall/shock exclusion | SPEC-03 | 7 |
| Vinyl scan | Time/radial damage map | SPEC-03 | 7 |
| Vinyl scan | Track boundary aggregation | SPEC-03 | 7 |
| Vinyl scan | Before/after cleaning compare | SPEC-03 | 7 |
| Vinyl scan | Repeat-play confirmation | SPEC-03 | 7 |
| Vinyl scan | Vinyl condition score | SPEC-03, SPEC-06 | 7-10 |
| Vinyl scan | Vinyl-only live readiness | SPEC-03, SPEC-06 | 7-10 |
| Database | Turntable catalog | SPEC-04, SPEC-07 | 8 |
| Database | Cartridge/stylus catalog | SPEC-04, SPEC-07 | 8 |
| Database | Mixer catalog | SPEC-04, SPEC-07 | 8 |
| Database | Audio interface/sound-card catalog | SPEC-04, SPEC-07 | 8 |
| Database | DVS/timecode catalog | SPEC-04, SPEC-07 | 8 |
| Database | Test-record catalog | SPEC-04, SPEC-07 | 3/8 |
| Database | Manufacturer spec provenance | SPEC-04, SPEC-07 | 8 |
| Database | User-owned physical assets | SPEC-04, SPEC-07 | 8 |
| Database | Stylus-hour/service history | SPEC-04, SPEC-07 | 8 |
| Database | Complete setup configurations | SPEC-04, SPEC-07 | 8 |
| Database | Method-compatible comparisons | SPEC-04, SPEC-07 | 8 |
| Database | Goal-specific rankings | SPEC-04 | 8 |
| Venue | Venue records | SPEC-05 | 9 |
| Venue | Booth records | SPEC-05 | 9 |
| Venue | Per-deck position | SPEC-05 | 9 |
| Venue | Surface/support stack | SPEC-05 | 9 |
| Venue | Quiet baseline | SPEC-05 | 9 |
| Venue | Feedback-onset testing | SPEC-05 | 9 |
| Venue | Low-frequency resonance map | SPEC-05 | 9 |
| Venue | Footfall/shock test | SPEC-05 | 9 |
| Venue | Isolation A/B test | SPEC-05 | 9 |
| Venue | Monitor/sub placement compare | SPEC-05 | 9 |
| Venue | Electrical/hum environment | SPEC-05 | 9 |
| Venue | Optional vibration sensor | SPEC-05 | post-9 |
| Venue | Vinyl-only venue suitability | SPEC-05, SPEC-06 | 9-10 |
| Venue | Gig/session incident log | SPEC-05 | 9 |
| Reports | Quick report | SPEC-06 | 1+ |
| Reports | Technical report | SPEC-06 | 11 |
| Reports | Used-turntable report | SPEC-06 | 2+ |
| Reports | Vinyl condition report | SPEC-06 | 7+ |
| Reports | Venue report | SPEC-06 | 9+ |
| Reports | Maintenance report | SPEC-06 | 11 |
| Export | JSON/CSV | SPEC-03, SPEC-04 | 7-8 |
| Export | HTML | SPEC-06 | 1+ |
| Export | PDF | SPEC-06 | 11 (FS-03 in progress) |
| QA | Synthetic signal generator | SPEC-08 | 0 |
| QA | Golden DSP fixtures | SPEC-08 | all |
| QA | False-positive vinyl corpus | SPEC-08 | 7 |
| QA | DVS synthetic scope fixtures | SPEC-08 | 4 |
| QA | SQLite migration tests | SPEC-08 | 0 |
| QA | Score regression tests | SPEC-08 | 10 |
| QA | Report snapshot tests | SPEC-08 | 11 |

## Rule

A row is not complete merely because a UI element exists. Each implemented feature must meet the "definition of done" in SPEC-09: measurement method, tests, persistence, quality flags, report support, and user-facing setup instructions.

## Research-derived implementation gates

| Requirement | Owning specification | Implementation status |
| --- | --- | --- |
| Dependency selection and exact license provenance | SPEC-18 | Specified; integration pending |
| Canonical PCM timebase and derived-stream mapping | SPEC-18, SPEC-19 | Specified; integration pending |
| Long WAV segmentation and boundary continuity | SPEC-18 | Specified; validation pending |
| Runout-click RPM with no flutter claim | SPEC-01, SPEC-18 | Specified; implementation pending |
| Generic scope vs decoder capability separation | SPEC-02, SPEC-18 | Specified; validation pending |
| Drift/skip-aware repeat-scan alignment | SPEC-03, SPEC-18 | Specified; validation pending |
| Measurement uncertainty and calibrated units | SPEC-07, SPEC-19 | Specified; implementation pending |
| Separate transient, audibility and cause evidence | SPEC-03, SPEC-06, SPEC-19 | Specified; validation pending |
| Held-out DJ-genre detector benchmarks | SPEC-08, SPEC-19 | Specified; corpus/benchmarks pending |
| Exact AES6 statistic and method verification | SPEC-01, SPEC-08, SPEC-19 | Experimental until validated |

## Historical source39 feature-row snapshot

The following rows are retained verbatim from published `cc15026a`, before source40 updated the current tables above. They preserve the earlier scope and pending states; they do not describe source40 completion.

| Capability slice | Status | Notes |
| --- | --- | --- |
| Backup and restore (FS-08) | Implemented software; current-source hosted qualification open | Verified native `.deckchek-backup`, safety backup, schedule and Windows free-space check. Data has separate [history](venue-history-archive.md) and [Equipment catalog](catalog-archive.md) files; workspace JSON stays unchanged. History resumes per-record appends; catalog stages one key write. |
| Device test completeness (FS-34) | Implemented in software; conditional prerequisites explicit | Capability model and baseline plan on the Devices screen (`app/devices/test-plan.js`), metric registry and audit cover all 45 shipped profiles with zero plan gaps. The checked [matrix](testing/DEVICE-TEST-COVERAGE.md) retains 23 conditional audio cases and 19 conditional MIDI profiles / 57 requirements. Plan coverage does not establish physical testability; [transport and output-selection rules](DECKCHEK-MIDI-PROFILE-FOLLOWUP.md#midi-planning-and-runner-behavior) preserve unknowns and explicit General MIDI opt-in. |
| Reports and portability | Implemented foundation and separate browser history/catalog archives | HTML reports, CSV measurements, existing workspace JSON and compatible-run A/B reports remain. Data transfers complete retained history and six editable catalog collections in distinct formats with their own recovery guarantees. Native-only booth/position/settings authorities and destination device-profile bindings are not invented or remapped. |

## Historical source40 rows superseded by source41

These are the exact earlier rows, retained as the pre-source41 snapshot. Current rows and qualification above supersede their open-work/count wording.

| Capability slice | Status | Notes |
| --- | --- | --- |
| Backup and restore (FS-08) | Implemented software; new-source hosted qualification open | Native `.deckchek-backup`, safety backup, schedule and Windows free-space checks are retained. Data has separate [browser history](venue-history-archive.md), [browser Equipment catalog](catalog-archive.md) and [native selected-setup](native-catalog-archive.md) files. Native transfer preserves the complete ten-table selected graph, previews conflicts and inserts missing rows atomically; workspace JSON is unchanged. |
| Booth feedback and hum hunter (FS-15) | Implemented, flags `humHunter` and `feedbackStep`, hardware-unvalidated | Hum hunter: live 50/60 Hz meter with harmonics, guided isolation steps A-G with a 5 s measurement and delta each, ranked causes with next actions, saved runs. Feedback test: -60 dBFS start, 3 dB steps only on confirmation, cap -30 dBFS (hard -12 dBFS in Rust), big STOP with Esc and Space, automatic abort on howl, clipping, lost input, 60 s inactivity, and on leaving the screen or closing the window. Runs list on the Hum screen's Runs tab grouped by venue and in History; each run exports as a PDF, and Equipment > Venues (or the venue group on the Runs tab) exports a venue report with the venue's setups and hum/feedback history. There is no separate venue detail screen. The Incidents tab records seven operator categories with original context and separate occurrence/save times. The panel browses 100 records per page with Older/Newer/Newest; venue reports retain the newest 300 with total counts. Browser workspace JSON excludes incident keys; the separate Data archive transfers retained incident/support history. The passive support A/B slice is implemented below; surrounding metrics and broader physical isolation outcomes remain open. |
| Unit vs population (FS-21) | Implemented, flags `population` and `packs`, hardware-unvalidated | Compare screen with Spec, My units and Population tabs; percentile only from 20 contributors, median band from 8, one voice per contributor; anonymous `.deckchek-pack` export and import with preview, idempotent import and removal. Selection-bias caveat always shown. |
| Timecode doctor live monitor (FS-31) | Implemented, flag `liveMonitor`, hardware-unvalidated | Streaming SNR, lock, drift, hum and dropout monitor for up to two decks with hysteresis and cooldowns, session logs with retention, tray status on Windows and macOS (Ctrl+Shift+M). WASAPI-shared capture beside DJ software is unverified; negative-SNR floor detection now covers an acquired coherent carrier; cold starts and changing pitch under noise remain limited. |
| MIDI mapper studio (FS-32) | Implemented, flag `mapperStudio`, hardware-unvalidated | Neutral mapping model built from learned messages, Mixxx 2.4+ export and import, VirtualDJ export and import (format unverified), Serato and Traktor reports only. XML reader refuses DOCTYPE/ENTITY. |
| Device test completeness (FS-34) | Implemented in software; conditional prerequisites explicit | Capability-aware plans cover all 45 profiles with zero plan gaps. The checked [matrix](testing/DEVICE-TEST-COVERAGE.md) retains 23 conditional audio profiles and 17 conditional MIDI profiles / 51 requirements after the [REV1/REV5 provenance update](DECKCHEK-NATIVE-CATALOG-FOLLOWUP.md#rev1-and-rev5-manufacturer-provenance). All 506 handwritten and 187 generated checks remain; plan coverage is separate from physical qualification and receiving/Identity/map support. |
| Reports and portability | Implemented foundation, separate browser archives and native selected-setup transfer | Existing HTML/PDF/CSV/workspace and compatible-run reports remain. Browser history and six-collection catalog files keep their existing recovery contracts. The distinct [native catalog](native-catalog-archive.md) includes selected setups, complete components, booth/position/settings and referenced parents with exact conflict rules and one atomic import. Destination device-profile bindings and measured history are excluded; no IDs or historical context are remapped. |
