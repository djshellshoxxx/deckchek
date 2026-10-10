# DeckChek front-end

Vanilla ES modules, no bundler, loaded by the Tauri shell (`src-tauri/`) and
usable in a plain browser for file analysis. Serve this folder over HTTP to
review it without compiling Tauri.

- `app.js` — entry point; registers screens with the shell.
- `ui/shell.js` — nav rail, top bar, inspector drawer, dialogs, shortcuts.
- `ui/workflows/` — guided Setup → Capture → Results flow and workflow definitions.
- `ui/screens/` — Calibration, Equipment, Devices, History, Test media (`media.js`), Data & backup (`data.js`), Stylus wear (`stylus.js`, flag `stylusWear`), Latency & buffer (`latency.js`, flag `latencyTuner`) and the support dialog (`support-dialog.js`).
- `ui/menus.js` — Options and Help support entries (diagnostics, GitHub issues/releases, manufacturer support links via `external-links.js`).
- `ui/workflows/setup-wizard.js`, `setup-wizard-model.js` — first-run wizard (flag `setupWizard`).
- `ui/media-picker.js`, `media-library.js`, `media/` — test media catalog and the "Test medium" picker (flag `testMedia`).
- `stylus-wear.js`, `usage-hours.js`, `devices/stylus-life.json` — stylus wear model, shared hours ledger helpers and the sourced rated-life catalogue.
- `backup.js`, `diagnostics-bundle.js`, `browser-bundle.js`, `external-links.js`, `features.js` — backup bridge, diagnostics helpers, link policy and the feature-flag registry.
- `styles/` — per-feature CSS (`diagnostics.css`, `media.css`, `data.css`, `wizard.css`, `stylus.css`, `latency.css`) using the tokens from `styles.css`.
- PDF export (FS-03) is pending; `print-host.*` and `report-pdf.js` belong to that work.
- `ui/analysis.js` — runs the pure analysis modules and assembles run records.
- `ui/results.js`, `ui/plots.js`, `ui/meters.js`, `ui/metrics.js` — result rendering, SVG plots, canvas meters, guide bands.
- `ui/audio-io.js`, `ui/persistence.js`, `ui/state.js` — capture/file I/O, saving/exports, settings and calibration profiles.
- `core.js`, `advanced.js`, `diagnostics.js`, `calibration.js` — pure measurement code (unit tested).
- `capture.js`, `catalog-store.js` — bridges to the native capture and SQLite commands.

See [BUILDING.md](../BUILDING.md) for tests and the UI smoke test.

Feature flags live in `features.js`; a screen definition with `feature: '<flag>'` appears in the rail only while the flag is on and follows changes live.
