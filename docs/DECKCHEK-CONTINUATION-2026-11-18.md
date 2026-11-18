# DeckChek continuation — 18 November 2026

## Current source and consolidation decision

The reviewed continuation source is [057d42f56dbc754cca940da887812b01a1239cef](https://github.com/djshellshoxxx/deckchek/commit/057d42f56dbc754cca940da887812b01a1239cef), with tree `6f62b22488929f878e53d6e43d22b3a68710cc80`. It extends the actual [PR #30](https://github.com/djshellshoxxx/deckchek/pull/30) branch head `963054dc543af018d0f13734a9e2abc54ca83113` through a normal descendant commit. The publication adds this report as a documentation-only child. No separate cumulative integration PR is created.

| Ref or contribution | Verified disposition |
| --- | --- |
| `main` | `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`; unchanged by this continuation. |
| PR #27, `integration/deckchek-consolidation-20261118` | `0acb612aa796f7f459172932868ff7e787d83399`; remains the candidate targeting main. |
| Incoming PR #30, `review/deckchek-lifecycle-20261118` | `963054dc543af018d0f13734a9e2abc54ca83113`, 12 commits ahead of PR #27 and zero behind before these repairs. |
| PR #31, `61a7c6b74d75074cef5ec029e1c127184d869c86` | Already retained as a parent of `5ffa10befa4d1dd9a98ee07ae2eeb31998333c01` in PR #30; accurate documentation was reconciled there. No separate merge is needed. |
| Historical main-targeted PRs | Keep their contribution records and branches. Close superseded PRs only after their qualified replacement reaches main. |

A fresh Git comparison confirmed that PR #27 is an ancestor of the incoming PR #30 and that the merge tree equals PR #30's tree, without conflicts. At that check, both the PR connector and public PR metadata still returned older head `e6a64d7`, while Git refs identified `963054d`. The audit uses the observed Git refs; a stale mergeability field does not establish a conflict. A clean merge simulation is not a passing CI or security gate.

The reviewed PR #30 history retains passive support A/B observations and comparisons, immutable venue incident history and pagination, saved support/setup descriptions, guided stylus evidence corrections, exported-ledger verification facts, manufacturer research, and GLib/native lifecycle repairs. The source audit found no additional reproduced integrity defect in its support/incident controls, comparison derivation, transaction/ID checks, pagination or escaped reports. This is a bounded review, not blanket certification.

## Repairs completed in this continuation

### Canonical JSON: signed integer overflow

The native canonicalizer used `i.abs() <= MAX_SAFE`. Raw JSON `-9223372036854775808` reproduced an arithmetic-overflow panic in a debug build and an invalid successful canonicalization in an optimized build. JavaScript rejects that integer under the shared safe-integer contract.

The production predicate now uses the inclusive signed range directly. New root/nested rejection cases exercise canonical text, hashes, error paths and canonicality checks; the native fuzz corpus includes the raw minimum integer. All 29 existing valid/hash vectors, 18 rejected-JSON vectors, 3 rejected-number vectors and 13 noncanonical-text vectors remain unchanged. One valid boundary/hash vector and seven rejected-JSON vectors were added.

Valid canonical bytes, UTF-16 key order, escaping, SHA-256 implementation and signature format are unchanged. The finding establishes a canonicalizer panic/rejection failure; it does not establish certificate forgery or a signature bypass through callers' separate schema checks.

### CI: restore the complete warning gate

The newer Cargo JSON parser retained dependency warnings for display but allowed them to pass. It also omitted Cargo/build-script warnings written to stderr. This contradicted the earlier all-warning gate and the reports' assurance that no warning gate had been relaxed.

The corrected parser preserves separate package attribution while rejecting application warnings, dependency warnings and warning/error diagnostics on stderr. The command requires a readable stderr evidence file. Malformed, incomplete, contradictory or post-finish JSON remains a failure. The workflow preserves Cargo/tee exit status, then the parser exit status; no warning source is exempted.

The regression assertions produced five failures before the repair. A real Cargo 1.100.0 fixture independently exercised both output channels:

| Cargo scenario | Build exit | Previous parser exit | Corrected parser exit |
| --- | ---: | ---: | ---: |
| Clean build | 0 | 0 | 0 |
| Fresh build-script warning on stderr | 0 | 0 | 1 |
| Cached build-script warning on stderr | 0 | 0 | 1 |
| Path-dependency compiler warning in JSON | 0 | 0 | 1 |
| Manifest warning on stderr | 0 | 0 | 1 |

The fixture uses no downloaded dependencies. Cargo's [structured-message contract](https://doc.rust-lang.org/cargo/reference/external-tools.html#json-messages) and [build-script warning contract](https://doc.rust-lang.org/cargo/reference/build-scripts.html#cargowarningmessage) explain the two channels. Earlier report statements about an unchanged warning gate must be read with this correction.

### Certificate export: bounded path construction

The trailing-separator regex could perform quadratic work when a long slash/backslash run was followed by a directory name. A new isolated helper regression exceeded its five-second limit on the previous source. A backward scan now removes only the trailing separator run in linear time.

The directory coercion, separator selection, UNC/internal spelling, mixed paths, Unicode and filename interpolation are preserved. This correction affects path assembly, not signed payloads or cryptography. The reproduction is a helper-level long-input test; it is not evidence that native file dialogs accept an operating-system-invalid path or that a remote actor can stall certificate export.

### Two additional device profiles

The [DDJ-FLX10](devices/alphatheta-ddj-flx10.md) and [XDJ-RX3](devices/pioneer-dj-xdj-rx3.md) profiles now record manufacturer-supported USB MIDI capability and separately labeled nominal audio-section/converter specifications. Exact manual revisions, pages, URLs and retrieved PDF hashes are recorded in those files.

USB channel counts, exhaustive USB rate/format lists, USB IDs, class compliance and full control maps remain unknown. Converter depth is not substituted for USB PCM format. The two conditional audio tests remain conditional; no threshold or automatic certificate-plan rule changes. All 18 original handwritten tests, 9 original specification entries and 12 original document entries across these two profiles are preserved.

There are still 45 profiles, 506 handwritten checks, 187 generated checks and 23 conditional audio cases. The accumulated research now covers documented capability decisions for 17 existing profiles; this does not make those devices physically qualified or fully mapped.

## Verification of the combined source

The complete Node suite ran against the exact tree named above, with serial file execution on Node 22.23.5. All 1,407 tracked files matched their pre-run SHA-256 values after testing and static checks.

| Scope | Result | Limit |
| --- | --- | --- |
| Complete Node suite | **1,641 passed, 0 failed, 1 optional skip; 1,642 total; 255.600 seconds** | The optional external Mixxx corpus is absent. |
| Exact native canonical module, debug | **10 passed, 0 failed** | Production module referenced directly; not a full Tauri build. |
| Exact native canonical module, optimized release | **10 passed, 0 failed** | Same source/shared fixtures and locked serde, serde_json and sha2 as the app. |
| Canonical formatting and strict Clippy | Passed | Isolated module harness; initial unconfigured-toolchain attempt retained, then correct existing environment used. |
| Warning parser regressions | **11/11 passed** | Also included in the full Node total. |
| Actual Cargo warning-channel fixture | All five expected build/parser outcomes matched | Does not replace the application's current hosted build. |
| Certificate/path focused checks | **32/32 passed** | Overlaps the full Node total. |
| Two-profile, device-plan and certificate focused checks | **42/42 passed** | Overlaps the full Node total. |
| Device index, coverage, timecode facts | Passed | Profile plan coverage is not hardware qualification. |
| Migration naming/numbering | **24 migrations passed** | No migration was changed by this continuation. |
| Mobile copies/precache, third-party notices | Passed | Existing policy retained. |
| GLib source provenance and Cargo selection | Passed for all three Cargo roots | Does not replace optimized actual-crate/native CI. |
| Application and GLib-harness formatting | Passed | Full application compile remains a hosted gate. |
| Syntax checks | **372 tracked app/mobile/tool/test modules passed** | Matches the CI scope excluding vendored JavaScript. |
| Independent review | Accepted the canonical repair, path semantics, warning policy/shell behavior and profile evidence | Review results are not represented as fresh independent execution. |

No focused result is added to the complete-suite count. The native harness is explicitly narrower than the desktop application. No full current-source native, Chromium, packaged-platform, extended stress/fuzz or Sonar pass is claimed.

## Retained earlier CI evidence

The unchanged PR #27 source `0acb612` passed [standalone run 44273893598](https://github.com/djshellshoxxx/deckchek/actions/runs/44273893598): 674 application Rust tests with eight ignored, six optimized actual-GLib tests, warning/type-check/strict-Clippy gates, 1,428 JavaScript tests with one optional skip, and 1,293/1,293 browser checks.

At the reviewed [platform run 44273893490](https://github.com/djshellshoxxx/deckchek/actions/runs/44273893490), all six platform builds had passed and both macOS packaged self-tests had passed. Windows x64/x86 and Linux x64 packaged self-tests were still queued; Linux x86 retains its configured runtime-smoke limitation. These are earlier-source results and do not qualify the new continuation automatically.

For the incoming PR #30 head `963054d`, the queried workflow/check collections contained no current-head results. The older `e6a64d7` aggregate responses for runs 44303607797, 44303607800 and 44303607805 still reported queued. The retained readiness report records a three-test persistence-stress success in job 134799397553 on test merge `1350eb37793b188215dbd0133e10f17cd64b6ce2`, whose tree matched `e6a64d7`; that narrower success remains historical evidence and does not qualify this source. Fresh runs must be tied to the new published head or its documented tested merge tree. Broad Sonar clearance remains unavailable; Snyk's earlier no-manifest-change status is not a substitute. An administration-only branch-protection read returned 403, so no exemption is inferred.

## Next work and merge boundaries

1. Follow the new PR #30 application/native, browser, platform and extended checks. Diagnose any real failures; retain the restored complete warning gate and existing numerical/assertion budgets.
2. Obtain a current broad Sonar result through supported access, review its findings and recheck applicable repository protections/approvals. Only then merge the qualified PR #30 continuation into PR #27 and qualify the resulting candidate for main. No target-ref update is used to bypass these PR gates.
3. Preserve the separately authored browser incident/observation/comparison archive work. Current support/setup catalog portability, surrounding metrics and broader physical isolation outcomes remain separate unfinished work.
4. Continue stable native MIDI identity and carefully sourced profile work. PDF-embedded certificate JSON, advanced classifiers and consumer integration retain their existing format/data/owner dependencies.
5. Treat native support-history scaling as explicit remaining work: get/save/list currently materialize and validate every observation/comparison before applying response limits. A simple SQL LIMIT would break the tested global-corruption refusal. A future bounded-memory validation design must preserve that invariant; no runtime or OOM benchmark is claimed here.

Fleet remains OFF by default. The -12 dBFS output cap, existing thresholds, migration history, historical observations and valid signed certificates are preserved. No release, tag, deployment, branch deletion, force push or history rewrite is performed.
