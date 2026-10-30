# Architecture and Design Rationale

Sources: README "Design principles" and "Implementation direction", `BUILDING.md`, `docs/IMPLEMENTATION-STATUS.md`.

- **Evidence before conclusions.** Raw evidence is kept apart from conclusions. A transient is not automatically a scratch, and a channel imbalance is not automatically a bad cartridge (README).
- **Every finding is structured.** It records the measured evidence, method, confidence, severity, possible causes, alternative explanations, suggested isolation tests, and whether the result is a direct measurement, an inferred diagnosis, or user-entered metadata (README).
- **Repeatable measurements over opaque scores.** Scores are summaries, and each one must be traceable to its measurements (README).
- **Planned stack.** Rust for the core DSP and measurement engine, Tauri for the desktop shell, TypeScript and HTML/CSS for the UI, and native audio I/O (README "Implementation direction").
- **Device profiles as data.** Device profiles live in `app/devices/` with an index and per-device JSON, validated by the device-library code.
- **Offline first.** Measurement runs locally; persistence uses SQLite in the Tauri build (`BUILDING.md`).
