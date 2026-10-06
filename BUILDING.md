# DeckChek build status

## Current build slice

The first implementation slice adds a Tauri 2 desktop shell and a static, interactive GUI prototype under app/. The prototype includes:

- overview dashboard with activity and equipment sample cards;
- test center with category filters and setup dialogs;
- equipment inventory table with live text search;
- results history with sample reports;
- audio setup and safe signal-path guidance;
- responsive layout, keyboard-dismissable dialogs, visible preview-mode notices.

All displayed records and results are sample UI data. The prototype does not enumerate audio devices, capture audio, run diagnostic measurements, persist records, or export reports. Do not use its scores as evidence about real hardware.

## Run

Install Rust and the platform prerequisites for Tauri 2, then from the repository root run:

    cargo install tauri-cli --version "^2"
    cargo tauri dev

The UI can also be previewed without the desktop shell by serving the app/ directory with any static HTTP server and opening app/index.html.

## Architecture direction

The existing product specification selects a Rust core, Tauri desktop shell, TypeScript/HTML/CSS interface, audio input abstraction, FFT/resampling libraries, and SQLite. This initial UI intentionally uses plain HTML/CSS/JavaScript so the navigation and interaction model can be reviewed before choosing a frontend toolchain. The next build slice should add a typed frontend build, domain models mapped to database/migrations/0001_initial.sql, and repository boundaries. Audio enumeration and analysis must follow SPEC-08 validation requirements and remain clearly separated from demo values.
