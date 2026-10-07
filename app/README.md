# DeckChek front-end

Vanilla ES modules, no bundler, loaded by the Tauri shell (`src-tauri/`) and
usable in a plain browser for file analysis. Serve this folder over HTTP to
review it without compiling Tauri.

- `app.js` — entry point; registers screens with the shell.
- `ui/shell.js` — nav rail, top bar, inspector drawer, dialogs, shortcuts.
- `ui/workflows/` — guided Setup → Capture → Results flow and workflow definitions.
- `ui/screens/` — Calibration, Equipment and History screens.
- `ui/analysis.js` — runs the pure analysis modules and assembles run records.
- `ui/results.js`, `ui/plots.js`, `ui/meters.js`, `ui/metrics.js` — result rendering, SVG plots, canvas meters, guide bands.
- `ui/audio-io.js`, `ui/persistence.js`, `ui/state.js` — capture/file I/O, saving/exports, settings and calibration profiles.
- `core.js`, `advanced.js`, `diagnostics.js`, `calibration.js` — pure measurement code (unit tested).
- `capture.js`, `catalog-store.js` — bridges to the native capture and SQLite commands.

See [BUILDING.md](../BUILDING.md) for tests and the UI smoke test.
