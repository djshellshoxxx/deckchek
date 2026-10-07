# DeckChek build status

DeckChek is no longer a static sample-only prototype. It now contains a local offline-analysis beta path backed by deterministic measurement modules and, in the Tauri desktop build, SQLite persistence.

## Current capabilities

The UI can analyze local audio files for stereo signal health, reference-tone speed/pitch, pitch-map points, generic DVS integrity, cartridge/reference-tone distortion evidence, startup/brake envelope timing, signal dropouts and full-side vinyl transient candidates. Results are kept as evidence plus transparent findings rather than unconditional fault diagnoses.

Measured runs can be exported as HTML reports and CSV, entire browser workspaces can be exported/imported as versioned JSON, and compatible runs can be compared by identical metric ID and unit. The desktop bridge writes sessions, method-versioned measurements and finding evidence into the existing SQLite schema.

The application can enumerate browser-visible audio inputs, but continuous native capture is not yet implemented. Hardware calibration and standards-level validation are also still required.

## Run the browser shell

Serve the repository root or app/ through a local HTTP server and open app/index.html. ES modules normally require HTTP rather than file:// loading.

## Run tests

    npm test
    node --check app/app.js
    node --check app/core.js
    node --check app/advanced.js
    node --check app/diagnostics.js
    node --check app/export.js

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

## Measurement status

The deterministic algorithms are suitable for development and repeatable file analysis. Accuracy claims remain gated by SPEC-08 and SPEC-19. In particular, the current short-term speed metric is a proxy until validated against the exact target wow/flutter method; vibration and damage classifiers remain evidence signals rather than definitive diagnoses.

See [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md) for the full implemented/partial/missing list.
