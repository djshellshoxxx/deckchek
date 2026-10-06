# DeckChek

DeckChek is a cross-platform turntable, cartridge, vinyl, DVS/timecode, mixer, audio-interface, and venue diagnostic workstation for DJs, technicians, collectors, repair shops, rental fleets, and vinyl-only performers.

The project is intentionally not a music player or DJ application. Its job is to measure, compare, diagnose, trend, and document the physical and electrical health of a vinyl playback/DVS chain.

## Product goals

DeckChek should answer questions such as:

- Is this turntable actually running at the correct speed?
- Is the pitch fader linear and calibrated across its range?
- Are the left and right channels balanced?
- Is azimuth or cartridge alignment probably wrong?
- Is a hum problem coming from grounding, cabling, the cartridge, the mixer, or the audio interface?
- Is the deck vulnerable to booth vibration or acoustic feedback?
- Does a DVS control record still track reliably?
- Where on a control record is the timecode worn or damaged?
- Where on a conventional record are probable scratches, repeating clicks, groove damage, mistracking, non-fill, surface contamination, or abnormal noise?
- Are two decks well matched?
- Has a specific deck, cartridge, or venue setup degraded since its last baseline?
- How does this cartridge/turntable/mixer/interface combination compare with other measured combinations?
- Which venue surface or booth arrangement has historically produced the best vinyl stability?

## Core modes

1. Turntable Diagnostic
2. Cartridge and Signal-Chain Diagnostic
3. DVS / Timecode Diagnostic
4. Full-Side Vinyl Condition Scan
5. Scratch and Tracking Stress Test
6. Pitch-Fader Mapping
7. A/B Deck Matching
8. Venue / Surface / Feedback Diagnostic
9. Hardware and Timecode Comparison Database
10. Preventive Maintenance / Baseline Trending
11. Report and Evidence Export

## Implementation direction

Preferred stack:

- Core DSP and measurement engine: Rust
- Desktop shell: Tauri
- UI: TypeScript + HTML/CSS
- Audio I/O: CPAL or equivalent native Rust abstraction
- FFT: rustfft
- Resampling: rubato or equivalent
- Database: SQLite
- Serialization: JSON
- Reports: HTML first, then PDF export
- Optional WebAssembly modules for reusable analysis components

No Python, PowerShell, or JUCE is required.

## Specification index

- [SPEC-00 Product Architecture](docs/SPEC-00-product-architecture.md)
- [SPEC-01 Turntable and Cartridge Diagnostics](docs/SPEC-01-turntable-cartridge-diagnostics.md)
- [SPEC-02 DVS and Timecode Diagnostics](docs/SPEC-02-dvs-timecode-diagnostics.md)
- [SPEC-03 Full-Side Vinyl Condition Scan](docs/SPEC-03-vinyl-condition-scan.md)
- [SPEC-04 Hardware, Timecode, and Setup Database](docs/SPEC-04-comparison-database.md)
- [SPEC-05 Venue, Surface, and Feedback Diagnostics](docs/SPEC-05-venue-surface-diagnostics.md)
- [SPEC-06 Scoring, Diagnostic Reasoning, and Reports](docs/SPEC-06-scoring-reasoning-reports.md)
- [SPEC-07 Data Model and Local API](docs/SPEC-07-data-model-api.md)
- [SPEC-08 Test Methodology and Validation](docs/SPEC-08-test-methodology.md)
- [SPEC-09 Implementation Roadmap](docs/SPEC-09-roadmap.md)
- [Feature Implementation Matrix](docs/FEATURE-MATRIX.md)
- [Research Notes and Sources](docs/RESEARCH.md)

## Design principles

DeckChek must preserve raw evidence separately from conclusions. A transient event is not automatically a scratch. A channel imbalance is not automatically a bad cartridge. A malformed DVS scope is not automatically a worn control record.

Every finding therefore has:

- measured evidence;
- analysis method;
- confidence;
- severity;
- possible causes;
- alternative explanations;
- suggested isolation tests;
- whether the result is direct measurement, inferred diagnosis, or user-entered metadata.

DeckChek should prefer repeatable measurements over opaque scores. Scores exist as summaries, but every score must be drillable into the underlying measurements.

## Status

Specification phase.
