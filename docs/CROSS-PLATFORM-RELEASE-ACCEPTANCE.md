# Cross-platform desktop build acceptance

This repository now contains `.github/workflows/cross-platform-release-validation.yml`, a **validation and artifact pipeline**, not an auto-publishing release pipeline.

- Windows x64: portable executable, NSIS, MSI.
- macOS arm64: application bundle and DMG on `macos-15`.
- macOS Intel x64: application bundle and DMG on `macos-15-intel`.
- Linux x64: DEB and AppImage on `ubuntu-22.04`.

Every build depends on JavaScript unit tests, device index checks, migration checks, timecode facts and JS syntax checks. Every platform then runs Rust unit tests and compile checks before packaging. Artifacts are retained 14 days if jobs succeed.

## Acceptance before creating a public GitHub Release

1. Each build and test job must be green for the **same integration commit**. Do not publish archives just because a workflow started.
2. Reconcile `feat/hardware-profile-catalog-20261020` with `claude/epic-thompson-tvwx9n` and main. Resolve migration files by ordered numeric IDs and test existing database upgrades, not just fresh installation.
3. Run browser + desktop UI smoke tests, system audio capture tests, and manual hardware verification on at least representative supported devices. Document test evidence and limitations.
4. Inspect Windows portable executable and NSIS/MSI installation/uninstallation, Linux runtime dynamic libraries, and macOS app entitlements, privacy permissions, signing and notarization. **Mac outputs are unsigned until a certificate is configured.**
5. Upload package checksums and release notes documenting OS/architecture, hardware-validation scope, open bugs and known driver/HID incompatibilities.
6. Run a second audit on the release-candidate commit to ensure no new regressions, unfinished profile mapping or stale import paths.

## Status

Workflow source is committed to the hardware research branch. **No successful run, uploaded package, or GitHub Release has yet been verified.** CI platform and Tauri version compatibility are subject to actual action results. The macOS runners are documented by GitHub as arm64 `macos-15` and Intel `macos-15-intel`.
