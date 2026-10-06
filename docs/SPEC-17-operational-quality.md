# SPEC-17: Operational Quality, Privacy, and Release Readiness

## 1. Purpose

Define cross-cutting requirements needed to build, operate, support, and ship DeckChek safely. Diagnostic validity is covered by SPEC-08; this document covers application behavior around installation, failure, privacy, performance, and release quality.

## 2. Reliability and recovery

- A failure in one analysis module must not crash the session coordinator or corrupt unrelated results.
- Capture, database, and report writes use bounded queues and transactional persistence.
- Every long-running task exposes progress, cancellation behavior, and a recoverable state.
- On unexpected exit, startup checks for incomplete sessions and offers recovery, discard, or export of recoverable data.
- Never delete the only copy of user data as part of recovery or upgrade.
- Device loss, disk full, permission revocation, database lock, migration failure, and report failure have distinct errors and recovery guidance.
- Logs use correlation/session IDs, avoid audio payloads and secrets, and can be shared only by an explicit user action.

## 3. Performance and resource limits

Targets apply on supported baseline hardware and must be measured in SPEC-08 test runs:

- Main UI remains responsive during capture and analysis; long DSP runs execute off the UI thread.
- Live level and progress UI update at least 5 times per second without excessive CPU use.
- Capture uses bounded memory; long-side raw audio streams to disk.
- A live capture gap is detected and recorded; no algorithm may silently interpolate a gap for a result requiring continuous input.
- Database and UI can browse at least 10,000 sessions/measurements without blocking interaction; pagination/windowing is used where needed.
- Export and backup show progress and can be cancelled without leaving corrupt output.
- Exact CPU, memory, disk and startup budgets are release-gate decisions recorded with target hardware before performance acceptance.

## 4. Privacy and data protection

- Local-first behavior: no account, network connection, analytics, telemetry, upload, or cloud sync is required for local diagnostics.
- Network use, if later introduced, requires a separate reviewed spec, purpose, data inventory, consent, retention, and off switch.
- Serial numbers, venue notes, device IDs, raw audio, MIDI logs, and reports are treated as user data.
- Do not include sensitive user data in crash logs by default.
- Raw audio retention is opt-in where practical and disclosed before capture; deletion behavior is explained and does not erase derived results without user selection.
- Backups and exports remain under the user's chosen destination and are not sent to vendor services automatically.
- Any remote/community submission must preview fields and remove serials/coordinates by default.

## 5. Security

- Validate imported data, archive paths, and report templates; reject traversal, malformed lengths, unexpected embedded content, and resource-exhaustion payloads.
- Do not execute macros, plugins, scripts, or embedded project commands during import.
- Keep licensing/activation secrets out of logs and exports.
- Request the minimum OS permission needed. Do not require administrator rights for normal capture.
- Updates and installers must be authenticated and integrity-checked before release. Signing, update channel, and rollback strategy must be decided before public distribution.
- Third-party dependency versions and licenses are inventoried; known vulnerabilities are reviewed before release.

## 6. Installation, update, and uninstall

- First release must declare its supported OS versions, architectures, audio backends, and installation requirements.
- Installer must disclose required permissions and storage locations.
- Update must preserve database, calibration, setups, reports, and retained captures.
- Schema migration must be backward-recoverable through a verified backup or transactional migration.
- Uninstall must not silently remove user data. Offer a clear separate option to remove local data and show its location.
- Version and build identifier are visible in About and stored with every session.

## 7. Error taxonomy and support bundle

Every surfaced error has a stable code, short user-readable title, cause/context, affected capability/session, and safe next action. At minimum classify:
- PERMISSION_DENIED
- DEVICE_NOT_FOUND / DEVICE_BUSY
- UNSUPPORTED_FORMAT / UNSUPPORTED_RATE
- INPUT_TOO_LOW / INPUT_CLIPPING
- DEVICE_DISCONNECTED / CLOCK_OR_RATE_CHANGED
- STORAGE_LOW / STORAGE_FULL
- DATABASE_LOCKED / MIGRATION_FAILED / RECOVERY_NEEDED
- ANALYSIS_MODULE_FAILED
- EXPORT_FAILED
- ENTITLEMENT_UNAVAILABLE

A support bundle is opt-in, previews its contents, excludes raw audio/MIDI by default, redacts serials and venue details by default, and records the app version and error code.

## 8. Release gates

A release may claim a capability only when:
- user-facing instructions and route diagrams exist;
- invalid and unavailable states are handled;
- acceptance tests for that capability pass;
- measurement validation meets SPEC-08;
- migrations and recovery are tested;
- third-party notices and licenses are complete;
- privacy disclosure matches actual behavior;
- performance is measured on declared baseline hardware;
- installer/update/uninstall behavior is verified;
- reports reproduce from stored session data;
- no known critical data-loss, unsafe-routing, or false-certification defect remains.

## 9. Acceptance criteria

- Simulated device disconnect, disk full, app crash, and failed migration each produce recoverable, explicit user-visible outcomes.
- Local diagnostic workflows work with network access disabled.
- User data is preserved through update, failed migration, and uninstall unless the user explicitly selects removal.
- Logs and support bundles do not include raw audio, MIDI payloads, serials, or venue details by default.
- Imported files cannot trigger code execution.
- Every release gate maps to an automated test, documented manual check, or measurement report.
