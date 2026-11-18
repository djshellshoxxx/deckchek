# DeckChek release readiness

Audit session: 2026-11-17, America/Los_Angeles. GitHub evidence timestamps are UTC. This report distinguishes the retrieved PR #26 baseline from subsequent local corrections.

## Decision

**Release readiness is not established.** The continuation has independently reviewed corrections, 1,325 passing local JavaScript tests, passing formatting and 1,283 passing browser checks at the audio-correction commit. The final native/dependency/schema/style candidate still requires current CI. Broad Sonar analysis, the remaining GLib warning, current cross-platform qualification and physical hardware acceptance remain open. No release, release tag, or deployment is authorized by this session.

| Revision | Role |
|---|---|
| `ee5aa511fb49fc56e299d5b5c262e815ab420d0d` | Retrieved canonical `main` |
| `4466cc0bb9951a98528f576726e01dd9cecc388e` | Retrieved PR #26 head, `nodata/practical-ptolemy-wu3ekp` |
| `integration/deckchek-consolidation-20261118` | Remote integration branch in [PR #27](https://github.com/djshellshoxxx/deckchek/pull/27), initially at the PR #26 head; subsequent corrections require their own verification |

## Verified baseline evidence

These results were retrieved from GitHub job logs, not inferred from a green PR badge. They apply to `4466cc0bb9951a98528f576726e01dd9cecc388e`.

| Check | Observed result | Evidence |
|---|---|---|
| JavaScript unit/property/regression/fuzz-smoke | 1,300 total; 1,299 passed; one optional skip; zero failures | [Job 134547155889](https://github.com/djshellshoxxx/deckchek/actions/runs/44228369554/job/134547155889) |
| JavaScript performance budget | One test passed, zero failures | Same JavaScript job |
| Linux Rust unit/migration/fuzz-smoke | 654 passed; eight ignored; zero failures | [Job 134547155655](https://github.com/djshellshoxxx/deckchek/actions/runs/44228369554/job/134547155655) |
| Compiler-warning gate | Passed | Same Rust job |
| Browser smoke | 1,276/1,276 checks passed; no console errors | [Job 134547155903](https://github.com/djshellshoxxx/deckchek/actions/runs/44228369554/job/134547155903) |
| Snyk status | Success with the description “No manifest changes detected in 5 projects” | [Commit status](https://api.github.com/repos/djshellshoxxx/deckchek/commits/4466cc0bb9951a98528f576726e01dd9cecc388e/status) |

The Snyk status does not establish a fresh comprehensive dependency audit. Ignored Rust cases and the optional JavaScript skip remain visible; they are not counted as passes.

## Current local verification and environment

A task-local Rust toolchain was installed without changing system permissions: `rustc 1.100.0 (0ef1bc386 2026-11-09)` and `cargo 1.100.0 (3acc79c0c 2026-11-05)`, including rustfmt and Clippy.

| Command or scope | Observed result |
|---|---|
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` | Passed after dedicated mechanical formatting of 47 Rust files. The original baseline had 2,318 formatting diff blocks. CI at `ed512a1` also passed formatting. |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml -j 2` | Blocked, exit 101, while building `glib-sys 0.18.1`: `glib-2.0.pc` was not found. No application Rust tests ran locally. |
| `cargo check --locked` and `cargo clippy --locked --all-targets -- -D warnings` | Not retried locally after the concrete native dependency blocker. CI results and the final candidate's remaining gates are distinguished below. |
| Fleet timestamp regression, before correction | 21 passed, four failed. An earlier PASS could hide a later FAIL when UTC timestamps used different fractional-second precision. |
| Fleet timestamp regression, after correction | 25/25 tests passed with `node --test tests/fleet.test.mjs tests/fleet-api.test.mjs`. Independent integration review accepted the change pending the full suite. |
| Population pack privacy, independent review | 13/13 focused tests passed with `node --test tests/pack-randomness.test.mjs tests/pack-population.test.mjs`. Additional direct assertions confirmed native UUID generation, preservation of supplied IDs without crypto, and rejection when secure randomness is unavailable. |
| Compiler-build pipeline correction | An isolated shell reproduction showed the previous `cargo build` pipeline converted exit 23 to exit 0. Adding `set -o pipefail` preserves exit 23; the warning check remains intact. This proves error propagation, not successful native compilation. |

The host also lacks the WebKitGTK, GTK, and ALSA development metadata required by the Tauri build. The runtime-prescribed system package helper is unavailable. The task user did not alter sudo, sandbox policy, repository package sources, or system package configuration. Installing Rust alone does not satisfy these native prerequisites.

The repository's JavaScript tests use Node's built-in runner and `package.json` declares no npm dependencies. No `package-lock.json` exists at the baseline, so `npm ci` is not an applicable dependency installation gate there. Run the actual `npm test` script.

The local population-pack correction generates new identifiers with `crypto.randomUUID()` or 16 bytes from `crypto.getRandomValues()`. It removes timestamp/`Math.random` fallback generation. Existing valid contributor identifiers and supplied pack IDs remain unchanged. Missing secure randomness rejects fresh generation before contributor state is written; a failed reset retains the previous identifier. The correction passed independent source review and the focused tests above; complete final-head verification remains a separate gate.

## Security and analysis gates

The retrieved PR #26 head has only the three application check runs above. No current Sonar result was attached to it.

| Historical Sonar scope | Observed result | Disposition |
|---|---|---|
| PR #14, `9f4928a00a44b62529429d1f14ad104b65db28c6`, check `123949755970` | Failed: D reliability and D security; 50 annotations | Findings retrieved and triaged against current source; the broad hold is not waived. |
| PR #16, `6bd93e2d1ceb2ff878521de58188cb39d5833c36`, check `124031174223` | Failed: C reliability; four annotations | Findings retrieved; later child checks do not clear the consolidated scope. |

The public GitHub annotations were readable. The public Sonar issues API returned HTTP 403, so no complete current Sonar issue export was available through that route. No authenticated analysis result was fabricated, no finding was accepted in Sonar, and no quality-gate rule was disabled.

Some historical annotations describe intentional behavior: SHA-256 uses modular 32-bit arithmetic, canonical JSON needs locale-independent UTF-16 ordering, and JSON round-trip fixtures test exact preservation. Replacing those operations mechanically would introduce defects. Genuine findings require a reproducing test and a correction; each false-positive disposition needs its rationale. See `DECKCHEK-SECURITY-AUDIT.md` for the integration findings and remaining work.

## Cross-platform status

| Target | Older `main` evidence | PR #26 and later corrections |
|---|---|---|
| Windows x64 | Packaging succeeded in [run 41046292289](https://github.com/djshellshoxxx/deckchek/actions/runs/41046292289) | Current package and packaged-app smoke not established |
| Windows x86 | Same older run succeeded | Current package and packaged-app smoke not established |
| macOS Apple silicon | Same older run succeeded | Current package and packaged-app smoke not established |
| macOS Intel | Same older run succeeded | Current package and packaged-app smoke not established |
| Linux x64 | Same older run succeeded | Current package and packaged-app smoke not established |
| Linux x86 | Same older run succeeded | Current package not established; configured workflow explicitly lacks runtime smoke on an i386 WebKitGTK stack |

These older successes must not be reused as proof that the consolidated head is qualified. The current cross-platform workflow triggers on main pushes, release tags, and manual dispatch. Its manual branch execution builds artifacts without publishing a release; release publication is conditional on a `v*` tag. The current nightly workflow adds Windows Rust/PDF tests, AddressSanitizer, longer fuzzing, and stress tests. No run of that complete workflow on this candidate was observed during this audit.

### Historical failures distinguished from application regressions

- **Windows:** [job 124018903070](https://github.com/djshellshoxxx/deckchek/actions/runs/41042631169/job/124018903070) failed `processes::tests::live_tasklist_parses` with `scan timed out after 20 seconds`; 424 tests passed, one failed, five were ignored. The failing command was process enumeration through `tasklist.exe`, while `system_check::windows_tests::real_scans_run_within_timeout` passed. Runner contention is a hypothesis, not a proven root cause. The failure cannot be cleared by weakening the timeout or deleting the test.
- **macOS ARM:** [job 123985120862](https://github.com/djshellshoxxx/deckchek/actions/runs/41032319845/job/123985120862) failed in `taiki-e/install-action` before application compilation. Its fallback attempted to remove a nonexistent `cargo-binstall` binary. The candidate workflow already replaces that installation route with pinned `@tauri-apps/cli@2.12.1`; a current successful platform run is still required.

## Hardware and distribution acceptance

No physical MIDI Identity Reply, audible General MIDI source, FS-35 loopback, native input/output device, controller mapping, driver, or reference-media measurement was exercised in this environment. Deterministic fixtures and mocked browser IPC do not satisfy hardware qualification. Follow `docs/testing/HARDWARE-TEST-SCRIPTS.md` and retain measured provenance.

Windows installers and macOS packages remain unsigned; macOS notarization is not established. Auto-update, installation/upgrade/uninstallation checks, real-database restore rehearsals, and platform privacy prompts require their documented acceptance evidence. Fleet remains opt-in and default OFF (`app/features.js`).

## Required next gates

1. Complete focused integration fixes and rerun the JavaScript/browser suites on the final source commit.
2. Resolve and recheck the broad Sonar findings for the consolidated scope.
3. Formatting is corrected; pass the explicit native test, check and Clippy gates on the final source using supported Tauri prerequisites. Resolve current dependency findings without suppressing the audit.
4. Obtain cross-platform packages and packaged-app smoke results for that same candidate, plus the applicable Windows/native reliability, fuzz, and stress checks.
5. Complete the physical hardware and distribution acceptance tasks separately. Record anything still unqualified instead of converting it to a pass.

This report does not authorize a tag, release, deployment, branch deletion, force-push, or gate bypass.

## Continuation verification

The reviewed source through `742c67ab93ab52baafa278cc48c6ca7c6d0a8df7` includes FS-35/36, fleet, certificate and population-identifier corrections. FS-35 focused tests passed **51/51 on Node 22.23.5**, and the independent reviewer also passed 51/51 on Node 24.22.1. MIDI focused suites passed **75/75**, fleet **25/25**, certificate **37/37**, and pack **13/13**. These overlapping focused counts are not added into a new total.

[Initial integration CI 44250832064](https://github.com/djshellshoxxx/deckchek/actions/runs/44250832064), at `ed512a17b24c3d678a405e728660ad64e75aa225`, compiled the native app and ran **653 Rust tests successfully, with one failure and eight ignored**. The failure was an existing source-string check that assumed the guarded window-builder call occupied one line. The correction retains that security relationship and ignores whitespace; a mutation check rejects guard removal. A subsequent full Node 22 run found a second whitespace-sensitive source assertion for registered link commands: **1,324 passed, one failed, one skipped**. Its regex was corrected to allow Rustfmt line breaks while retaining all three required commands and the navigation guard. These failed runs are retained as evidence, not relabeled as passes.

The new FS-35 browser smoke uses injected I/O to exercise actual browser focus, keyboard cancellation, capture-integrity verdicts and separate channel plots. It does not establish physical audio accuracy. See the handoff for the latest source SHA and completed CI results.

### Runtime and workflow-access limits

An intermittent cubic-distortion failure reproduces on the untouched `4466cc0` baseline under Node 24.22.1. Immediate reanalysis of identical samples produces the expected result. Its root cause is unconfirmed; it must not be reported as a proven JIT defect. The unchanged tolerances pass the focused Node 22.23.5 run, matching CI's major runtime version. Broader runtime qualification remains open.

The GitHub connector can create commits/PRs and read checks but exposes no workflow-dispatch operation. Local `gh`/Git have no authenticated push/dispatch session. An attempted UI fallback reached the actual platform workflow page but showed a signed-out session with no Run workflow control. Platform validation was not dispatched. No credentials, permissions or workflow triggers were changed to bypass this boundary.

### Current dependency analysis

The targeted dependency update removes all seven original vulnerability records from both application and fuzz lockfiles without ignoring advisory IDs. Both audits exit zero, with one GLib unsoundness warning and five maintenance notices remaining. SQLite/ZIP compatibility checks cover the actual 22 migrations, rollback, legacy data, online backup and archives in both old/new reader directions. The existing third-party notice generator and check pass. These focused checks do not replace the final native application, fuzz or platform gates; the unresolved GLib warning remains explicit in the security audit.

### Explicit Clippy gate

At `742c67a`, [native job 134624238498](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624238498) passed **654 Rust tests** (eight ignored), the compiler-warning check and `cargo check`. The new strict Clippy gate then failed with **57 diagnostics** across production and test targets. Commit `2243bbb34e21c198390ef32806f813329a5e3dc1` contains independently reviewed corrections, with no lint allowances or changed thresholds. Differential checks cover numeric boundaries, 512 UTF-16 decoder byte vectors and stable sorting. The gate remains open until the complete application passes current CI; a unit-test pass or isolated differential test does not override it.

### Browser verification at the audio correction

[Browser job 134624237913](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624237913) at `742c67a` passed **1,283/1,283 checks**, with no console errors. All seven new FS-35 checks passed: focus/progress, Escape ownership, Enter/Stop behavior, unsaved cancellation, clean evidence and output cap, fault evidence requiring REVIEW, and opposite response errors with file provenance. This resolves the new browser-test execution gap for that source. It does not establish native device or physical-loopback qualification.

### Reviewed native candidate

The complete code candidate is `2243bbb34e21c198390ef32806f813329a5e3dc1`, comprising dependency correction `1ad6a34`, restore-schema correction `c387ae9` and the strict Clippy cleanup. On its working-tree source, Node 22.23.5 again passed **1,325 tests, zero failures, one optional skip** (1,326 total), and Rust formatting passed. The schema fix passed an independently rerun seven-test exact-validator harness, including the 64 KiB allocation guard and historical database fixtures. The dependency fix passed a separate seven-test migration/backup/archive compatibility harness and an old ZIP reader/new archive check. These focused results do not count as a full native build. The handoff records the candidate's fresh CI when available.
