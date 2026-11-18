# DeckChek security and diagnostic-integrity audit

## Scope and limits

This audit uses the source of PR #26 at `4466cc0bb9951a98528f576726e01dd9cecc388e`, live GitHub branch/check evidence, deterministic reproductions and independent review of the continuation changes through `2243bbb34e21c198390ef32806f813329a5e3dc1`. It concentrates on device ownership, diagnostic truthfulness, certificate evidence, pack privacy, restore-schema integrity, dependency exposure and CI failure propagation. It is not a claim that every Tauri command, parser, dependency or hardware path has received a complete penetration test.

Severity below describes the impact on DeckChek's diagnostic decisions or privacy. A diagnostic integrity defect is not automatically a remote code-execution vulnerability.

## Reproduced findings

| ID | Severity / category | Reproduction and impact | Correction / verification |
|---|---|---|---|
| DC-01 | High, device ownership | Select input A, then B. The old code updates the input but retains A as the output; the Identity Request for B is sent to A. | Recompute unambiguous pairing, expose an output selector, reject duplicate names at the runner boundary. New routing tests failed before the correction. |
| DC-02 | Medium, evidence integrity | A rejected MIDI status query or a decreasing/invalid drop counter can accompany valid control messages and produce PASS. | Unknown/reset counters and missing/unobservable selected-input status require REVIEW; preserve `captureIntegrity` and the shared counter scope. Focused MIDI suites passed 75 tests before independent review. |
| DC-03 | High, measurement integrity | Boost the 10 kHz step by 3 dB on the left and reduce it by 3 dB on the right. Signed averaging reports approximately zero flatness deviation and PASS. | Corrected to use the worst absolute channel deviation while preserving per-channel data and analysis revision 2. Independently reviewed; 51 focused FS-35 tests passed on Node 22.23.5. |
| DC-04 | High, capture integrity | A synthetic clean waveform with `overrunSamples=10000` and a device-disconnect error is returned by the real capture API shape. The old session discards quality/error metadata and returns PASS. | Preserve loss, truncation and stream-error evidence; incomplete/unobserved live capture integrity requires REVIEW. Native field compatibility independently reviewed; focused malformed-counter and capture-fault regressions pass. |
| DC-05 | High, result/certificate integrity | `08:00:00Z` compares lexically after `08:00:00.500Z`. An older PASS hides a newer FAIL in fleet status and certificate evidence. | Compare validated instants and preserve adverse evidence at equal times. Tests cover both input orders, differing precision, offsets, and newer repaired results. Fleet and certificate corrections independently reviewed; 25 fleet and 37 certificate tests passed. |
| DC-06 | Medium, certificate provenance | A result without a valid timestamp can count toward readiness and a PASS payload. | Keep uncertain-time evidence visible, block readiness, produce unknown/REVIEW unless the observed result is FAIL, and preserve raw input. Calendar-invalid and timezone-ambiguous inputs are covered. |
| DC-07 | Low, export privacy | Without `crypto.randomUUID`, the contributor pseudonym contains a timestamp and uses `Math.random`. This is a privacy/entropy weakness, not an authentication bypass. | Generate UUIDs or 16 secure random bytes. Fail before state writes when secure randomness is unavailable. Preserve valid stored IDs and supplied/imported IDs. Independent review and 13 focused pack tests passed. |
| DC-08 | Medium, CI reliability | Run the old warning-gate script under `bash -e` with a compiler process that emits an error and exits 23. `cargo build \| tee` reports success because the pipeline lacks `pipefail`. | Add `set -o pipefail`. The corrected actual step preserves exit 23; the warning assertion is unchanged. |
| DC-09 | Medium, calibration provenance | A requested 48 kHz run receives 44.1 kHz samples but still applies a supplied 48 kHz calibration/chain correction. | Corrected and independently reviewed: validate the profile against actual input identity and sample rate. Missing/blank/malformed profile identity and absent captured identity cannot establish calibration. Anonymous caller booleans cannot bypass applicability. |
| DC-10 | High, restored-data integrity | An imported database with an added `CHECK(length(nickname)=0)` passes the old schema fingerprint and SQLite integrity check, then rejects ordinary asset creation. Existing fingerprints omitted CHECK expressions, foreign-key actions, collations and conflict policy. | Commit `c387ae9` compares typed SQL tokens and foreign-key metadata with a trusted schema at the declared version before integrity checking/migration, and verifies the current schema afterward. Four new native regressions and the independently rerun seven-test schema harness cover altered constraints, token boundaries and historical compatibility. Full application restore CI remains required. |
| DC-11 | Medium, resource exhaustion | During review, an 8,388,663-byte SQL comment passed normalization and expanded into a 33,554,652-byte character buffer, despite the archive's overall size bound. | Commit `c387ae9` rejects per-object SQL text above 64 KiB in a SQLite byte-length query before materializing SQL rows, and independently before tokenizer allocation. Tests accept exactly 64 KiB, reject 64 KiB + 1, and verify multibyte input is counted in bytes. Independent review accepted the guard. |

Reproducing tests are in `tests/midi-fs36-ui.test.mjs`, `tests/fleet*.test.mjs`, `tests/certificate.test.mjs`, `tests/pack-randomness.test.mjs`, the FS-35 test suites and `src-tauri/src/backup.rs`. The final handoff identifies exact code commits and completed verification.

### Restore review boundaries and compatibility

The schema comparison ignores layout and comments, folds only unquoted ASCII tokens, and preserves quoted identifiers, string/blob literals, escapes and token boundaries. It does not rewrite user data or migration SQL. Safety backups, capture leases, checksums and rollback policy remain intact. Unexpected columns now fail the pre-migration `unsafe_db` check; the separate migration-failure/rollback path remains tested.

The focused schema harness contains the exact production cap, tokenizer, fingerprint and version validators. It passed all seven checks independently, including the four release SQL fixtures before/after migration and actual SQLite 3.46 v4/v22 database files read and migrated with SQLite 3.54.1 while preserving Unicode JSON. Its migration helper is intentionally isolated; this result is not presented as a full application restore test. A bounded review of the adjacent IPC, user-file, link and diagnostics boundaries found no additional confirmed defect in the inspected paths. It does not certify every application path.

## Historical Sonar triage

Recovered all 50 annotations from the historical PR #14 check `123949755970` at `9f4928a00a44b62529429d1f14ad104b65db28c6`, and all four from the PR #16 check `124031174223` at `6bd93e2d1ceb2ff878521de58188cb39d5833c36`. These are historical findings, not current line numbers or a fresh pass.

The public Sonar issue-export endpoint returned HTTP 403. No credential or quality-policy changes were made. The three passing application checks on the frozen PR #26 baseline `4466cc0` do not contain a broad Sonar result.

Several annotations concern intentional behavior that must not be changed mechanically:

- `app/ledger/template.js` uses signed 32-bit operations for SHA-256 modular arithmetic. Replacing them with `Math.trunc` changes the hash algorithm.
- `app/ledger/hash.js` sorts canonical keys by UTF-16 code-unit order. Locale-sensitive sorting changes canonical output.
- The workspace-boundary smoke compares exact numbers preserved through JSON import. Replacing those comparisons with tolerances weakens the preservation assertion.
- Numeric formatting regexes operate on bounded strings derived from finite numbers. Their generic complexity warning is not by itself a reachable input-exhaustion finding.

The confirmed fleet ordering and pack randomness findings are addressed above. Async event handlers require individual failure/lifecycle review; adding `void` alone would not handle a rejected promise. Unresolved areas include service navigation import failures, rendering after async disposal, and the native MIDI adapter's name-based lookup. No blanket suppression or Sonar acceptance was applied.

## Residual requirements

1. Obtain a current broad Sonar analysis and document each remaining disposition.
2. Run current-head native checks, dependency analysis and platform workflows with the actual Tauri prerequisites.
3. Strengthen native MIDI logical-port identity and duplicate-name rejection across all consumers. The Devices runner's guard is not a claim that the backend now supports stable physical identities.
4. Validate real MIDI disconnections, renderer delivery loss, loopback capture and calibrated measurements. Synthetic tests do not establish hardware accuracy.
5. Complete the remaining broader IPC/filesystem/import/backup/restore audit. Existing regression/fuzz tests are evidence for their tested cases, not universal security certification.
6. An undated result cannot be ordered against a later retest. Certificate readiness therefore requires explicit reconciliation of that stored evidence; retesting alone does not discard it. No automatic history deletion or timestamp invention is performed.

Fleet remains opt-in and OFF by default. No signed output is described as authentic without the existing signature verification path, and no old certificate is rewritten by the chronology correction.

## Dependency audit and targeted remediation

Audit date: 2026-11-18 UTC. This is a dependency review, not a claim that the complete application or every transitive code path is free of vulnerabilities.

### Result

The application lock and separate fuzz lock originally each matched **7 RustSec vulnerability records**, **3 unsoundness warnings**, **5 unmaintained notices**, and **1 yanked-package warning**. After targeted changes, both audits exit **0** and report **0 vulnerability records**, **1 unsoundness warning**, **5 unmaintained notices**, and **0 yanked packages**. The remaining GLib unsoundness is a substantive unresolved dependency risk; the successful exit code does not erase it.

The audit used task-local `cargo-audit 0.23.0`, installed with `cargo install cargo-audit --locked`, and the RustSec database at commit `233155b4025b854c68a4b199c0e32d7fd53291a2`, updated `2026-11-17T11:14:35+01:00` (1,527 advisories). No advisory IDs were ignored. The second final audit used the same freshly fetched local database with `--no-fetch`; that mode omits database commit metadata in its JSON. Current primary advisory pages were also inspected.

### Dependency changes

| Package | Before | After | Reason |
|---|---:|---:|---|
| rusqlite | 0.32.1 | 0.41.1 | Select the maintained line that includes patched bundled SQLite |
| libsqlite3-sys | 0.30.1 | 0.39.1 | Bundled SQLite 3.46.0 becomes 3.54.1 |
| zip | 2.4.2 | 9.0.5 | Smallest combined patch floor for all six current ZIP records |
| rustix | 1.1.5 | 1.1.6 | Patched extended-attribute buffer unsoundness |
| tokio | 1.53.2 | 1.53.3 | Patched/deprecated unsafe AsyncFd constructors in the existing release line |
| async-executor | 1.14.0 | 1.14.1 | Replace the yanked release with its available patch release |

`src-tauri/Cargo.toml` changes only the rusqlite constraint to `0.41` and ZIP constraint to `9.0.5`, retaining existing features. Both lockfiles were synchronized without a blanket update. The application lock contains 524 package entries; the fuzz lock contains 528 and still pins `libfuzzer-sys =0.4.10`. Necessary transitive changes include `hashlink`, removal of the old `ahash`/`hashbrown`/`zerocopy` chain, ZIP's `nix`/`typed-path` dependencies, and SQLite's non-desktop VFS/WASM dependencies.

ZIP 9 makes file names fallible decoded values. `backup.rs::open_archive` now maps decoding errors to the existing `bad_zip` refusal before applying the existing unsafe-path check. Three existing trusted-fixture assertions/helpers in backup.rs and diagnostics.rs unwrap the new result explicitly. No migration SQL, schema versions, stored data, or rusqlite call sites changed as part of this remediation. The separate schema-security review may make subsequent backup.rs changes.

### Confirmed records and reachability

#### Bundled SQLite

[`RUSTSEC-2026-0459`](https://rustsec.org/advisories/RUSTSEC-2026-0459.html), CVE-2026-119375, affects the original path `deckchek → rusqlite 0.32.1 → libsqlite3-sys 0.30.1`. Cargo metadata confirms `bundled` is enabled, and the original crate's SQLite C source declares 3.46.0. A less trusted database/WAL pair with differing page sizes can expose process memory. Restore removes its temporary WAL sidecars before opening the extracted database, limiting that route, but regular app-data opens can still read sibling WAL files. Therefore the finding was retained and fixed rather than dismissed on reachability grounds. The updated crate embeds SQLite 3.54.1. See the [rusqlite release](https://github.com/rusqlite/rusqlite/releases/tag/v0.41.0) and [SQLite release](https://sqlite.org/releaselog/3_54_1.html).

#### ZIP

ZIP is a direct application dependency, with no other resolved caller package. The six original records are:

| Advisory | Disclosed operation | Patch floor |
|---|---|---|
| [RUSTSEC-2026-0367](https://rustsec.org/advisories/RUSTSEC-2026-0367.html) | Extraction preserves privileged Unix permission bits | 9.0.0 |
| [RUSTSEC-2026-0368](https://rustsec.org/advisories/RUSTSEC-2026-0368.html) | Extraction creates symlinks targeting outside the destination | 9.0.0 |
| [RUSTSEC-2026-0369](https://rustsec.org/advisories/RUSTSEC-2026-0369.html) | Extraction applies permissions through unconfined symlinks | 9.0.0 |
| [RUSTSEC-2026-0429](https://rustsec.org/advisories/RUSTSEC-2026-0429.html) | Extraction allocates an unbounded symlink target | 9.0.0 |
| [RUSTSEC-2026-0545](https://rustsec.org/advisories/RUSTSEC-2026-0545.html) | AES authentication omitted for empty/truncated encrypted entries | 9.0.0 |
| [RUSTSEC-2026-0548](https://rustsec.org/advisories/RUSTSEC-2026-0548.html) | Central-directory validation followed by inconsistent local-header streaming extraction | 9.0.5 |

Static application review found no `ZipArchive::extract`, `ZipStreamReader`, or streaming extraction calls. Backup restore uses bounded `ZipArchive::by_name` reads, writes only selected entries to application-chosen destinations, and separately checks declared sizes and hashes. Cargo metadata confirms only deflate features, with `aes-crypto` disabled. Thus the six disclosed paths were not observed in application usage; the locked version was still upgraded. The header-consistency mitigation for the stream-reader advisory is opt-in upstream; should streaming extraction be introduced later, a version update alone is insufficient.

#### Patched unsoundness and yanked package

[`RUSTSEC-2026-0486`](https://rustsec.org/advisories/RUSTSEC-2026-0486.html) concerns zero-length buffers in rustix xattr functions. A shortest dependency path is `deckchek → tauri-plugin-opener → zbus → rustix`. [`RUSTSEC-2026-0386`](https://rustsec.org/advisories/RUSTSEC-2026-0386.html) concerns Tokio's Unix AsyncFd ownership/lifetime requirements; a shortest path is `deckchek → tauri → tokio`. Neither affected API is called directly in application source. Supported patch updates removed both records. The yanked async-executor path is `deckchek → tauri-plugin-opener → zbus → async-executor`; its registry-listed, non-yanked 1.14.1 release was selected. Yank status alone was not described as a security vulnerability.

### Remaining warnings

| Kind | Package and record | Dependency context / follow-up |
|---|---|---|
| Unsoundness | glib 0.18.5, [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) | `tauri → gtk 0.18.2 → glib`; VariantStrIter can invoke undefined behavior. Patched upstream at 0.20, but gtk explicitly requires `^0.18`; forcing 0.20 is not a compatible lock fix. No direct application use was found, but transitive reachability was not proven absent. Requires an upstream-supported GTK/Tauri resolution or separately reviewed backport. |
| Unmaintained | chrono 0.4.45, [RUSTSEC-2026-0543](https://rustsec.org/advisories/RUSTSEC-2026-0543.html) | `tauri-utils → serde_with → chrono`; follow upstream's replacement. |
| Unmaintained | proc-macro-error 1.0.4, [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html) | GTK/GLib procedural macro dependency; requires an upstream compatible change. |
| Unmaintained | zbus_names 4.3.4, [RUSTSEC-2026-0371](https://rustsec.org/advisories/RUSTSEC-2026-0371.html) | Through zbus 5.19.0; standalone APIs moved into zbus 6. |
| Unmaintained | zvariant 5.15.0, [RUSTSEC-2026-0370](https://rustsec.org/advisories/RUSTSEC-2026-0370.html) | Through zbus 5.19.0; opener currently requires zbus `^5.9`. |
| Unmaintained | zvariant_derive 5.15.0, [RUSTSEC-2026-0372](https://rustsec.org/advisories/RUSTSEC-2026-0372.html) | Through zvariant/zbus; requires the same upstream migration. |

Maintenance notices were not counted as confirmed vulnerabilities. No incompatible GLib/zbus overrides or blanket suppressions were added.

#### GLib follow-up: current upstream path

The official GLib 0.18 branch remains at [`42b9caf98e03ded086362d9653ca58fe94dc8658`](https://github.com/gtk-rs/gtk-rs-core/blob/42b9caf98e03ded086362d9653ca58fe94dc8658/glib/src/variant_iter.rs), with the affected immutable out-pointer reference in `VariantStrIter::impl_get`. The proposed [0.18 backport #2009](https://github.com/gtk-rs/gtk-rs-core/pull/2009) is closed and unmerged; it is not an available upstream patch release.

GTK3 bindings are maintained again: the official [0.19.0 manifest](https://github.com/gtk-rs/gtk3-rs/blob/0.19.0/Cargo.toml) uses GLib/gtk-rs-core 0.22 and requires Rust 1.92. The present blocker is adoption by the application stack. DeckChek resolves Tauri 2.12.1; the checked [Tauri 2.12.6 manifest](https://github.com/tauri-apps/tauri/blob/tauri-v2.12.6/crates/tauri/Cargo.toml) still requires GTK 0.18, and [WebKit 2.0.2](https://github.com/tauri-apps/webkit2gtk-rs/blob/crate/Cargo.toml) independently requires GLib and GTK 0.18. Adding a newer direct GLib dependency would leave the old series in the graph.

A locked offline Linux metadata/source examination searched all 367 resolved packages for `VariantStrIter`, `array_iter_str` and `variant_iter::`. All 17 matches were inside GLib itself; no explicit production caller outside GLib was found. This narrows observed exposure but does not prove absence of generated-code/binary reachability or clear the advisory. The supported path is a coordinated Tauri/WebKit/GTK update. An interim source backport would require separately maintained immutable provenance, independent review and optimized native regression tests; this continuation does not silently substitute or claim an upstream-supported backport.

### Verification and licensing

A separate scratch Rust harness used the actual repository's 22 migration SQL files and verbatim migration functions. A baseline executable with rusqlite 0.32.1 and ZIP 2.4.2 created databases and archives. The patched versions passed seven focused checks: fixed SQLite engine version; all 22 migrations and idempotence; failed-migration transaction rollback; v4-to-current migration preserving Unicode JSON data; SQLite online backup preserving existing rows; reading legacy ZIP fixtures and the repository's real-backup fuzz corpus; and a ZIP writer payload round trip. The baseline ZIP 2 reader then successfully read ZIP 9 output with identical database bytes. This tests compatibility risks without claiming a full native application build.

Both final Cargo audits passed. Fuzz `cargo metadata --locked --format-version 1` passed against its own manifest. `node tools/third-party-notices.mjs` regenerated the existing notice file for 434 normal/build crates on the repository's Windows, macOS and Linux target set; `--check` passed with no newly unreviewed license expressions. Project LICENSE was not changed. Rusqlite 0.41 requires Rust 1.89; the available toolchain is 1.100 and CI installs stable.

The dependency snapshot was formatted separately before integration; the concurrent backup-security review owns subsequent schema-validation changes.

Native GTK/WebKit application compilation remains blocked in this local environment by missing GLib/GTK development metadata. This audit did not bypass that restriction; full application tests, Clippy, fuzz, and cross-platform build validation remain CI gates. Cargo installation, registry downloads and RustSec database access succeeded. Root npm/skill-helper package manifests declare no npm dependencies. Optional skill Python requirement files were inventoried but are not application runtime dependencies and were not installed or security-audited here.
