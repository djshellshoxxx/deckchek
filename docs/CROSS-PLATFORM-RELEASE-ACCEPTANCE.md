# Cross-platform release acceptance

The GitHub Actions workflow `.github/workflows/cross-platform-release-validation.yml` runs the JavaScript, device-catalog, timecode-fact, migration and Rust checks, builds the desktop packages, uploads target-specific artifacts, and publishes a prerelease for `v*` tags only after every build job succeeds.

## Configured targets

| Target | Runner | Packages attempted |
|---|---|---|
| Windows x64 | `windows-latest` | portable executable, NSIS, MSI |
| Windows x86 | `windows-latest` | x86 NSIS and MSI |
| macOS Apple silicon | `macos-15` | app bundle and DMG |
| macOS Intel x64 | `macos-15-intel` | app bundle and DMG |
| Linux x64 | `ubuntu-22.04` | DEB and AppImage |
| Linux x86 | `ubuntu-22.04` runner building inside a Debian Bookworm i386 container | DEB |

These are configured build targets, not verified downloadable products until CI succeeds for the same commit. The release job adds SHA-256 checksums. Windows installers and macOS packages are currently unsigned; macOS is not notarized.

## Release gate

1. All verification and platform build jobs must pass for the exact tagged commit. Resolve any cross-branch or migration conflict before tagging; test both fresh setup and upgrades.
2. Verify that every expected package exists, has the intended architecture, installs and launches, and is covered by the generated checksum manifest.
3. Run desktop UI smoke tests and audio input/output smoke tests on each supported OS. Automated compile success does not establish that a host audio driver or endpoint works.
4. Perform manual verification on representative DJ hardware: generic DVS signal capture, supported MIDI controls, audio routing and at least one representative driver configuration per OS. Report unsupported hardware and methods clearly.
5. Inspect installer/uninstaller behavior, Linux runtime dependencies, and macOS privacy permissions, signing and notarization requirements. Do not imply signed or notarized distribution.
6. Run the regression suite and repository audits on the release candidate. Record known bugs, hardware coverage, measurement limits and open work in release notes.

## Current validation limits

- Generic DVS tests measure signal presence and properties; they do not decode proprietary Serato, rekordbox or Traktor position unless a validated decoder is implemented.
- The Rane Twelve MKII profile tests its documented Serato Control Tone output as a signal path; the unit is a motorized DJ controller, not a conventional analog turntable or audio interface.
- Device profiles describe available test workflows, not proof that every device model has been physically exercised.
- Windows driver inventory and event-log diagnostics are OS-specific. macOS and Linux must show unavailable for unsupported driver-health checks.
- Generated tones, sweeps, ambient beds and PCM WAV fixtures test a source or observed path. They do not alone measure soundcard converter quality, PA frequency response, distortion, maximum SPL or sound pressure exposure.

## Status

The cross-platform workflow and targets are configured in the current working branch. No cross-platform CI run or package from this branch has yet been verified. Do not tag a release until all gates above pass or the release notes state the remaining limitations accurately.
