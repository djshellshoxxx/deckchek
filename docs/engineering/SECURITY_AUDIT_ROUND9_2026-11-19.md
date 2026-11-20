# Security review round 9 — dependency and release boundaries

Date: 19 November 2026 (America/Los_Angeles).

**Disposition: accepted within this source/configuration comparison.** No
unexplained dependency, permission-grant, feature-default or release-policy
expansion was found. The continuation deliberately adds one application IPC
command; unchanged capability files do not mean unchanged command surface.

## Reviewed source and method

- Starting main: `8c43cf17e3d5f5067ece5667f1aec1540f4b4091`.
- Candidate: `8217d38d439d758072b9eb7268d8f6d6682b9110`.
- Candidate tree: `4c57ee99ebaf0738695c69520a18b12f38236089`.
- Compared recursive Git tree entries, including object identity and mode, then
  inspected relevant source/configuration and the bounded continuation diff.
- This report is the only authored change. No application code was modified.

This is a repository-source review. It is not a new vulnerability-database scan,
a re-execution of the GLib proof, a dependency update recommendation or a hosted
branch-protection inspection. Root's concurrent announcement and later combined
source are outside this fixed candidate.

## Unchanged configuration and dependency inventory

| Compared group | Tracked files | Changed entries |
| --- | ---: | ---: |
| Cargo/package manifests and lockfiles, including existing tool/skill roots | 11 | 0 |
| Vendored GLib source, provenance, patches and dedicated verification files | 131 | 0 |
| Tauri capability, configuration, build and Windows manifest files | 4 | 0 |
| GitHub workflow definitions | 4 | 0 |
| Feature-default registry | 1 | 0 |
| Database migrations | 25 | 0 |
| Selected certificate/hash/signing engine files | 8 | 0 |
| Release-version and checksum helpers | 2 | 0 |

These groups overlap and are not a unique-file total. Equality includes each
compared path's Git blob/mode, rather than relying only on version labels.
The selected certificate group is `app/certificate.js`, `app/certificate-api.js`,
`app/canonical-json.js`, `app/sha256.js`, `app/report-kinds/certificate.js`,
`src-tauri/src/signing.rs`, `src-tauri/src/certificate.rs` and
`src-tauri/src/canonical.rs`.

The [application Cargo manifest](../../src-tauri/Cargo.toml) and lockfile retain
the existing dependency graph declarations. The new assignment module uses
already-declared serde/rusqlite facilities. Root `package.json` adds no package
requirement or install lifecycle script.

The existing [GLib backport record](../../vendor/glib-0.18.5.README.md), both
patch artifacts, source tree and digest manifest are unchanged. Application,
fuzz and isolated-regression manifests retain their local GLib patch selection.
The primary workflow still defines provenance/metadata validation and the
optimized actual-crate regression before its application tests. This review did
not execute those gates or independently re-fetch the upstream advisory/source.
The vendored package retains version 0.18.5; the existing source-backport
qualification and eventual upstream-removal criteria remain applicable.

## Native command and permission boundary

The only changed native production paths are the new
`src-tauri/src/device_profile_assignment.rs`, its wrapper in `devices.rs`, and
module/handler registration in `lib.rs`. The added `device_profile_assign`
command is a deliberate new application entry point for the requested feature.
It uses the existing off-main/database wrapper and carries the explicit
assignment request. It adds no process, network or arbitrary-file operation.
Its request IDs are bounded to 4,096 UTF-8 bytes; the prior
[round-5 source review](SECURITY_AUDIT_ROUND5_2026-11-19.md) separately records
transaction, parameter binding and provenance acceptance. That review and
root's bounded native execution are not rerun or enlarged here.

The unchanged [capability](../../src-tauri/capabilities/default.json) remains
scoped to the main window with `core:default`, `dialog:allow-save` and
`dialog:allow-open`. It does not add a webview opener permission. Tauri CSP,
window/configuration, build script and Windows application manifest remain
byte-identical to starting main. The unchanged feature registry explicitly
states that feature flags hide UI rather than authorizing Rust commands.
**Fleet remains default false**; all other registry defaults are unchanged.

## Import limits: retained numbers, stricter enforcement

| Import | Candidate bound | Comparison |
| --- | --- | --- |
| Workspace | 64 × 1,024 × 1,024 UTF-8 bytes | Numeric ceiling retained; old string-length-only enforcement is tightened |
| Pre-gig preset | 256 × 1,024 bytes | Existing parser constant retained |
| Media profile | 256 × 1,024 bytes | Existing parser constant retained |
| Phone export | 1,000,000 bytes | Decimal limit retained, not 1 MiB |
| Certificate JSON / HTML | 20 MiB / 48 MiB | Existing certificate limits retained |
| Browser workspace retention | 250 runs | Existing cap retained; import result now reports retained runs |

The workspace's prior `MAX_WORKSPACE_CHARS` limited JavaScript string length.
The candidate preserves that public constant name but additionally enforces
UTF-8 byte length. Thus some multibyte inputs previously under the character
limit are now rejected: describing enforcement as wholly unchanged would be
inaccurate. File readers also validate declared/actual sizes and decode strict
UTF-8 before parsing; they do not increase the listed bounds. The staged browser
workspace import preserves the existing one-retry evidence-retention policy.
See the [workspace contract](../specs/08-backup-restore.md) and
[reader follow-up](FILE_IMPORT_FOLLOWUP_2026-11-19.md).

## Release, signing and gate behavior

The unchanged [desktop workflow](../../.github/workflows/cross-platform-release-validation.yml)
builds/qualifies pull requests but restricts prerelease publication to `v` tag
refs. Its publication job still depends on tests, release checks, build and
smoke jobs. Default contents permission remains read-only; the tag release job
retains its existing write grant. Version/migration/notice/checksum steps remain.
These are inspected workflow conditions, not evidence that any current run passed.

The unchanged [mobile workflow](../../.github/workflows/pages-mobile.yml) remains
manual-only, with its deployment input defaulting false and deployment separately
conditional on that input. This continuation does not enable automatic hosting.

Certificate signing and verification engines are unchanged; browser file
encoding and job-sheet display corrections do not change signed certificate
payloads or cryptographic rules. Package signing/notarization and auto-update
are not added. The existing release notes continue to describe unsigned packages
and separate physical qualification.

All four workflow files retain their existing checks and trigger/permission
conditions. The primary workflow still has locked Rust commands, compiler-warning
validation and strict Clippy; the continuation does not weaken those gates.
No workflow, build, scanner, platform test or physical test was run in this review.

## Successor handoff

Carry the precise distinction between **unchanged dependency/configuration grants**
and the **new registered application command**. Keep the stricter workspace
UTF-8 rule explicit. Bind final hosted/native/browser conclusions to the final
combined source; do not transfer this configuration comparison into an execution
or all-dependency security-clearance claim. A future dependency maintenance task
should use current authoritative advisory data and the existing backport gates,
without reclassifying this unchanged-diff review as that work.
