# DeckChek front-end

Vanilla ES modules, no bundler, loaded by the Tauri shell (`src-tauri/`) and
usable in a plain browser for file analysis. Serve this folder over HTTP to
review it without compiling Tauri.

- `app.js` — entry point; registers screens with the shell.
- `ui/shell.js` — nav rail, top bar, inspector drawer, dialogs, shortcuts.
- `ui/workflows/` — guided Setup → Capture → Results flow and workflow definitions.
- `ui/screens/` — Calibration, Equipment, Devices, History, Test media (`media.js`, flag `testMedia`), Data & backup (`data.js`), Pre-gig check (`pregig.js`, flag `pregig`), Latency & buffer (`latency.js`, flag `latencyTuner`), Stylus wear (`stylus.js`, flag `stylusWear`), Control vinyl wear map (`vinylscan.js`, flag `wearMap`, with `workflows/wearmap.js` and `plots-groove.js`), Scratch stress test (`scratch.js`, flag `scratchTest`), the Experimental features dialog (`experimental.js`) and the support dialog (`support-dialog.js`).
- `ui/workflows/hum.js`, `feedback.js` — Hum and feedback hunter (flags `humHunter`, `feedbackStep`); `workflows/scratch.js` — scratch test runner; `workflows/pregig.js`, `pregig-report.js` — pre-gig controller and PDF kind; `workflows/m6-reports.js` — PDF kinds for latency, stylus, wear map, scratch, hum and venue plus the Export PDF button.
- `phone-run.js`, `ui/workflows/import-phone.js` — DeckChek Mobile result format (build, hash, QR frames, validate) and the "Import phone results" screen (flag `phoneImport`, `styles/phone-import.css`). `phone-run.js`, `core.js`, `advanced.js`, `calibration.js`, `canonical-json.js`, `sha256.js` and `vendor/qr.js` are copied unchanged into `../mobile/vendor/` by `tools/build-mobile.mjs`: run it after editing any of them (CI runs `--check`).
- `ui/menus.js` — Options and Help support entries (diagnostics, Experimental features, GitHub issues/releases, manufacturer support links via `external-links.js`).
- `ui/workflows/setup-wizard.js`, `setup-wizard-model.js` — first-run wizard (flag `setupWizard`).
- `ui/media-picker.js`, `media-library.js`, `media/` — test media catalog and the "Test medium" picker (flag `testMedia`, on by default; a timecode medium sets the format on the DVS, scratch and control-vinyl forms).
- `stylus-wear.js`, `usage-hours.js`, `devices/stylus-life.json` — stylus wear model, shared hours ledger helpers and the sourced rated-life catalogue.
- `backup.js`, `diagnostics-bundle.js`, `browser-bundle.js`, `external-links.js`, `features.js` — backup bridge, diagnostics helpers, link policy and the feature-flag registry.
- `styles/` — per-feature CSS (`diagnostics.css` also styles the Experimental features dialog, `media.css`, `data.css`, `wizard.css`, `pregig.css`, `latency.css`, `stylus.css`, `wearmap.css`, `scratch.css`, `hum.css`, `crosslinks.css`) using the tokens from `styles.css`.
- PDF export (FS-03) is implemented: `report-pdf.js` (printable kinds, composition, `exportPdf`), `report-print.css` and `print-host.*`; `ui/persistence.js` `exportPdfWithFeedback` adds progress, Retry and the Open / Show in folder toast.
- `ui/analysis.js` — runs the pure analysis modules and assembles run records.
- `ui/results.js`, `ui/plots.js`, `ui/meters.js`, `ui/metrics.js` — result rendering, SVG plots, canvas meters, guide bands.
- `ui/audio-io.js`, `ui/persistence.js`, `ui/state.js` — capture/file I/O, saving/exports, settings and calibration profiles.
- `core.js`, `advanced.js`, `diagnostics.js`, `calibration.js` — pure measurement code (unit tested).
- `capture.js`, `catalog-store.js` — bridges to the native capture and SQLite commands.
- `population.js` — FS-21 pure population statistics, contributor weighting, method/unit compatibility and deterministic bootstrap intervals. It never changes raw observations, converts units or decides pass/fail.
- `pack.js` — FS-21 whitelist pack builder, strict preview validation and an in-memory ownership-aware pack store (unit-test reference; the app persists packs natively). Callers must supply a product/metric registry (`population-metrics.json`) with exact units and plausible numeric bounds; unknown bounds are rejected. Native import, export and persistence are in `src-tauri/src/pack.rs` via `pack-api.js`.
- `fleet.js`, `fleet-api.js`, `ui/screens/fleet.js`, `ui/screens/fleet-venues.js`, `ui/booth-sheet.js`, `ui/fleet-banner.js` — FS-23 Fleet screen (flag `fleet`, on by default): fleet policy, native evidence/mutation bridge, grid, maintenance and venue/booth/position editor, printable booth sheet and the start-up reminder banner. SQLite reference validation lives in `src-tauri/src/fleet.rs`; browser mode states that native persistence is unavailable. Confirmed usage-ledger hours remain estimates and never imply measured runtime or hardware health.
- `ui/fleet-templates.js` — product-scoped reminder policy editor. Applying a template validates the exact product and retains one reminder identity per template/asset pair.
- `certificate.js`, `certificate-api.js`, `report-kinds/certificate.js`, `ui/screens/certificate.js`, `ui/screens/verify.js` — FS-20 Certificates and Verify certificate screens (flag `certificates`; Ctrl+Shift+V opens Verify). Signing and the strict verifier are native (`src-tauri/src/signing.rs`, `certificate.rs`); the engine builds the payload and the printable certificate. A PDF cannot be verified on its own: pick the `.deckchek-cert.json`.
- `pack-api.js`, `population-metrics.json`, `ui/screens/compare.js` — FS-21 Compare screen (flag `population`; tabs Spec and My units; flag `packs` adds the Population tab and the Data sharing card). `C` on a result row opens Compare. `population-metrics.json` is the metric whitelist shared with `pack.js` and the native pack code.
- `service.js`, `service-api.js`, `report-kinds/jobsheet.js`, `ui/screens/service.js`, `ui/workflows/service-job.js` — FS-22 Service screen and job workflow (flag `service`; Ctrl+J new job, Alt+Left/Right previous/next step, Ctrl+Enter saves a work note). Customer details are never written to settings or localStorage.
- `monitor.js`, `ui/screens/monitor.js`, `ui/live-monitor-log.js` — FS-31 Live monitor (flag `liveMonitor`; Ctrl+Shift+M starts and stops; tray actions on Windows and macOS). `monitor.js` is the pure streaming engine; session logs are stored by `src-tauri/src/monitor.rs`.
- `mapper/`, `ui/screens/mapper.js` — FS-32 MIDI mapper (flag `mapperStudio`): neutral model, vocabulary, safe XML reader/writer, Mixxx and VirtualDJ export/import, Serato and Traktor reports. On the screen L learns a control and Ctrl+Z undoes.
- `ledger/`, `ui/screens/ledger.js` — FS-33 Gear ledger wizard (flag `gearLedger`): privacy presets, whitelist builder, EXIF/path scrubbing and the static page template. Ctrl+E opens the export step and exports from it.
- `self-test.js` — runs the packaged-app check for `deckchek --self-test=<report.json>` (CI release smoke); it does nothing unless the native side reports self-test mode.

See [BUILDING.md](../BUILDING.md) for tests and the UI smoke test.

Feature flags live in `features.js`; a screen definition with `feature: '<flag>'` appears in the rail only while the flag is on and follows changes live. Toggle them in Options > Support > Experimental features… (only flags with code behind them are listed; a flag marked `wired: false` is hidden).
