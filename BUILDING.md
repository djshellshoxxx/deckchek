# DeckChek build status

DeckChek is no longer a static sample-only prototype. It now contains a local offline-analysis beta path backed by deterministic measurement modules and, in the Tauri desktop build, SQLite persistence.

## Current capabilities

The UI can analyze local audio files or native audio input for stereo signal health, reference-tone speed/pitch, pitch-map points, generic DVS integrity, cartridge/reference-tone distortion evidence, startup/brake envelope timing, signal dropouts and full-side vinyl transient candidates. Results are kept as evidence plus transparent findings rather than unconditional fault diagnoses.

Measured runs can be exported as HTML reports and CSV, entire browser workspaces can be exported/imported as versioned JSON, and compatible runs can be compared by identical metric ID and unit. The desktop bridge writes sessions, method-versioned measurements and finding evidence into the existing SQLite schema.

The desktop build captures live from native inputs with a lock-free ring buffer, ~20 Hz level-event updates, clip latching, capture-quality counters, and can calibrate the interface with a loopback profile that corrects readings and propagates ± uncertainty via GUM-style error propagation. The browser shell analyzes recorded files only. Real-hardware validation against known references is still required (SPEC-08/19).

## Run the browser shell

Serve the repository root or app/ through a local HTTP server and open app/index.html. ES modules normally require HTTP rather than file:// loading.

## Run tests

    npm test
    find app -name '*.js' -exec node --check {} \;

## UI smoke test (Playwright, local only)

`tools/ui-smoke.mjs` serves `app/` with a tiny Node HTTP server (sending the
same CSP as the Tauri build), drives it in headless Chromium and saves
screenshots of every screen (dark, plus light variants) to `/tmp/deckchek-shots`
(override with `SHOTS_DIR`). It covers browser mode (file analysis for Quick
Check, Speed & Pitch, DVS and two Vinyl scans, equipment CRUD, history A/B
compare, theme persistence, help, the 900 px drawer layout and keyboard
shortcuts) and a mocked desktop mode (`window.__TAURI__` stub) that exercises
live capture, meters, clip latch, capture-quality counters and native run
persistence. It fails on any console error.

It needs a globally installed Playwright with Chromium already present and is
not part of CI (the Linux CI runners have no browsers configured):

    NODE_PATH=$(npm root -g) node tools/ui-smoke.mjs

## Run the Tauri desktop shell

Install Rust and the Tauri 2 platform prerequisites, then from the repository root run:

    cargo install tauri-cli --version "^2"
    cargo tauri dev

For Rust-only verification:

    cargo test --manifest-path src-tauri/Cargo.toml
    cargo check --manifest-path src-tauri/Cargo.toml

CI contains both JavaScript and Rust jobs.

## Windows build

Automated CI builds produce a portable standalone executable and Windows installer packages (NSIS and MSI installers). These artifacts are available from the GitHub Actions workflow runs.

To build locally on Windows:

1. Install the Rust MSVC toolchain (if not already present)
2. Ensure WebView2 is available (built-in on Windows 10/11)
3. Install Tauri CLI: `cargo install tauri-cli --version "^2"`
4. Build the application: `cargo tauri build`

Outputs are generated in `src-tauri/target/release/`:
- `deckchek.exe` — Portable standalone executable
- `bundle/nsis/*.exe` — NSIS installer packages
- `bundle/msi/*.msi` — MSI installer packages

## Persistence behavior

Static browser mode stores the working equipment/run list in localStorage and supports JSON export/import.

Tauri mode additionally invokes the Rust persistence layer. It creates the application data SQLite database, applies database/migrations/0001_initial.sql, and stores completed diagnostic sessions, analysis methods, measurements and finding evidence.

## Backup and restore

The Data & backup screen (rail, flag `backup`) creates a single `.deckchek-backup` file: a consistent SQLite snapshot taken while the app runs, plus settings, calibration profiles and learned MIDI maps, with SHA-256 checksums. Restore verifies the file, shows a preview, requires confirmation, writes an `auto-pre-restore-*` safety backup, migrates older schemas and swaps the database atomically; a failure leaves your data unchanged. Automatic backups (daily, weekly, on exit) keep the newest 7 `auto-*` files. On Windows, backup and restore first check free disk space and report how much is needed; other platforms skip the check. A browser-mode `deckchek-workspace.json` can be imported into the database. Backups are not encrypted. Rust tests for this live in `src-tauri/src/backup.rs` (`cargo test`), the UI flow in `tools/smoke/backup.mjs`.

## Support and diagnostics

Ctrl+Shift+D, Options > Support, Help or an error toast's Details button opens the diagnostics dialog, which writes a redacted zip locally; nothing is uploaded. After an unclean exit the next start offers to create one.

## Measurement status

The deterministic algorithms are suitable for development and repeatable file analysis. Accuracy claims remain gated by SPEC-08 and SPEC-19. In particular, the current short-term speed metric is a proxy until validated against the exact target wow/flutter method; vibration and damage classifiers remain evidence signals rather than definitive diagnoses.

See [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md) for the full implemented/partial/missing list.
