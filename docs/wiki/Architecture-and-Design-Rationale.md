# Architecture and Design Rationale

Sources: [README](../../README.md), [BUILDING](../../BUILDING.md) and [Implementation Status](../IMPLEMENTATION-STATUS.md).

- **Evidence before conclusions.** Raw evidence is kept apart from conclusions. A transient is not automatically a scratch, and a channel imbalance is not automatically a bad cartridge (README).
- **Every finding is structured.** It records the measured evidence, method, confidence, severity, possible causes, alternative explanations, suggested isolation tests, and whether the result is a direct measurement, an inferred diagnosis, or user-entered metadata (README).
- **Repeatable measurements over opaque scores.** Scores are summaries, and each one must be traceable to its measurements (README).
- **Current stack and proposed direction.** The current browser UI is plain JavaScript ES modules with HTML/CSS; the desktop shell is Rust/Tauri with native audio I/O and SQLite. README's TypeScript preference describes a proposed direction, not a completed conversion.
- **Device profiles as data.** Device profiles live in `app/devices/` with an index and per-device JSON, validated by the device-library code.
- **Offline first.** Measurement runs locally; persistence uses SQLite in the Tauri build (`BUILDING.md`).
