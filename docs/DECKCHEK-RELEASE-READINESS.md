# DeckChek release readiness

Session date: 2026-11-17, America/Los_Angeles. GitHub event/run timestamps are UTC. Every result below names its source or explicitly bounded scope.

## Decision

**The consolidated source is prepared for continued qualification, but main integration and release readiness are not established.** The current reviewed source is `5960099ed4094172025dad9129dc38b148dabedf`, preserved in [PR #27](https://github.com/djshellshoxxx/deckchek/pull/27). Main remains `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`. Final-source application/native/platform checks and a fresh broad Sonar result remain gates. Physical hardware acceptance is separate; no hardware result is inferred from generated data or mock ports.

No release, release tag, deployment, branch deletion, force-push, approval bypass or remote history rewrite was performed. Release-only signing and publication requirements do not authorize a release in this session.

## Current software verification

| Scope / command | Observed result | Source and practical limit |
|---|---|---|
| `node --test --test-concurrency=1 tests/*.test.mjs` on Node 22.23.5 | **1,428 passed, zero failed, one optional skip (1,429 total)** | Combined source `5960099ed4094172025dad9129dc38b148dabedf`. Serial execution changes neither assertions nor test discovery. This run completed in 125.033 seconds. |
| `node --expose-gc --test tests/perf/*.test.mjs` | 1/1 passed; 2,400 generated hops, mean 0.349 ms/hop, 0.06 MB heap growth | Live-monitor performance budget on this host; not a real-time OS guarantee. |
| Device index and coverage | Passed: current index and coverage for all 45 profiles | Includes 45 checked hardware profiles; conditional hardware capabilities still require primary-source research. |
| Timecode facts, migration names and mobile copies | Passed: consistent timecode facts, all 22 migration names, mobile vendor copies and precache list | Migration numbering/history preserved; no schema renumbering or device-data fabrication. |
| Syntax of app/mobile/tools/tests modules, excluding vendor copies | 336 modules checked; zero failures | Parse checking, not execution or type qualification. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` | Passed | Full application source formatting. |
| GLib regression harness formatting and provenance/metadata selection | Passed: harness formatting, 121 source files, two separately verified patches and all three Cargo metadata roots | All three Cargo roots select the vendored source; source integrity does not prove the actual crate/platform tests passed. |
| `node tools/third-party-notices.mjs --check` | Passed | 434 resolved crates, including identified vendored GLib provenance. |
| App and fuzz lockfile RustSec audit | Zero vulnerability records; five maintenance notices | Both rerun against the available 1,527-advisory database. The GLib path-source omission is not clearance; see below. |
| Full native app tests/check/strict Clippy locally | Blocked before application execution | Missing `glib-2.0.pc` and required GTK/WebKitGTK/ALSA development metadata. Existing runtime shared libraries do not supply build prerequisites. |
| Local Playwright Chromium | Blocked at launch | Host socket permission failure. Browser CI supplies a supported environment; local failure is not a passing check. |

The project uses Node's built-in test runner; `package.json` contains no npm dependency set and has no lockfile requiring `npm ci`. CI retains its full test discovery and JUnit/spec reporters. The current local run uses supported Node 22. The last source additions are the exact 34 compiler suggestions and separately reviewed GLib provenance/guard updates, including four new guard tests. All 1,428 tests passed on that final source. Application/harness formatting, Cargo metadata selection, provenance, notices and the three changed JavaScript modules' syntax were checked again after integration. The earlier index, coverage, mobile, migration, timecode, performance and unchanged-module syntax inputs remain byte-identical to their verified versions.

A prior unrestricted-concurrency baseline attempt terminated a monitor worker with SIGKILL; its focused rerun passed. On preceding source `e43be06`, a four-worker repeat reported 1,340 passed, nine failed and one skip (1,350 total): eight test-file workers received SIGKILL and the existing certificate hostile-payload timing assertion took 1,707 ms against its unchanged one-second limit. The cause of the terminations was not proven; available host memory was observed at roughly 1.5–1.9 GB. A complete serial run on `e43be06` then passed 1,424 tests with one optional skip in 132.083 seconds. The final serial result above includes the four added guard tests and preserves all original assertions and timing limits. The failed attempt remains evidence and is not counted as a pass. An inherited intermittent numerical anomaly on Node 24 was not labelled a proven V8 defect and did not justify changing measurement tolerances.

Rust tooling in the task environment is `rustc 1.100.0` / `cargo 1.100.0`, with rustfmt and Clippy installed. The runtime-prescribed system-package helper is unavailable. No sandbox, sudo, repository package sources or permission policy was altered to fabricate a native build environment.

## Current hosted CI

At the report checkpoint before the combined-source publication, [platform run 44265442094](https://github.com/djshellshoxxx/deckchek/actions/runs/44265442094) on `ef49ed6cfd08e94651a1536b4e4509efdccdbedb` had a completed browser job: **1,293/1,293 checks passed, no console errors**, including eight new guided-stylus browser checks and the updated existing stylus coverage. The reusable JavaScript job subsequently completed successfully: **1,391 passed, zero failed, one optional skip** (1,392 total), plus its performance and metadata gates. [Native job 134668697815](https://github.com/djshellshoxxx/deckchek/actions/runs/44265442094/job/134668697815) passed all **six optimized GLib tests** with real prerequisites and **670 application Rust tests**, with zero failures and eight ignored. The compiler-warning step then failed on **34 warnings from the locally vendored GLib** (three unnecessary parentheses and 31 lifetime-path spellings); check and strict Clippy were skipped, and package/self-test jobs did not run. The regression-only Cargo manifest also emitted an unused normal-dependency warning. These are reproduced compiler-compatibility findings. The final source applies all 34 exact compiler suggestions with separate provenance, and moves the regression harness dependency into `[dev-dependencies]`; independent review accepted both changes. No warning suppression or gate weakening was introduced. [Standalone run 44265441929](https://github.com/djshellshoxxx/deckchek/actions/runs/44265441929) also completed: JavaScript and browser jobs passed; native job 134668814299 passed six actual-GLib tests and 670 application Rust tests (zero failures, eight ignored), then failed the same 34-warning gate, skipping check/Clippy.

Those results precede PR #29, the monitor follow-up and the GLib compatibility corrections. The guarded combined-source/report publication starts fresh PR runs. Their exact IDs and latest observed states belong in the [live PR body](https://github.com/djshellshoxxx/deckchek/pull/27); no final-source native/platform/Sonar success is claimed here. The stable source anchor is `5960099ed4094172025dad9129dc38b148dabedf`, whose tree was locally verified before report-only commits.

Pending, queued, cancelled and skipped jobs are not passes. A new source head supersedes older qualification. Reports identify the source SHA separately from later documentation commits; before any main merge, use the live PR head and applicable exact-head check results, not an earlier badge.

The platform workflow now triggers on pull requests into main as well as its existing main/tag/manual paths. It runs the reusable full test gate, then builds Windows x64/x86, macOS Intel/ARM64 and Linux x64/x86 packages. Five supported packaged-runtime self-tests download and execute the built artifacts; the configured Linux x86 runtime-smoke limitation remains explicit. A successful build is not automatically a successful installed application, and a package self-test is not hardware qualification.

The tag-only `release-checks` and publication jobs remain conditional on release tags. Their being skipped on a PR is expected and does not mean their release checks passed. No tag was created. Applicable Windows/PDF, sanitizer, long-fuzz and stress checks remain in `nightly.yml`; current invocation/evidence is still required where applicable. The connector has no workflow-dispatch capability and native `gh` has no login. The observed GitHub browser session was signed out. The platform PR trigger removes the earlier dispatch limitation for that workflow, but does not create nightly evidence.

The reusable test concurrency group was corrected to distinguish `github.workflow`, event and ref from standalone PR tests and the platform caller's outer group. The earlier standalone run at `1d2b488` was cancelled before steps because of the prior collision. Superseded runs after subsequent source pushes were cancelled by the configured policy; none is recorded as passing.

## Focused implementation and independent review

These checks isolate meaningful boundaries. They overlap with the full suite and must not be summed into a larger test total.

| Scope | Evidence | Limit |
|---|---|---|
| Guided stylus acquisition/trend eligibility | 64/64 independently rerun: 55 stylus workflow/UI/wear tests plus nine capture-session tests | Generated captures and injected dependencies; physical repeatability unverified. |
| Numeric/audio criteria | 70/70 focused checks, plus 1,350 finite-value comparison cases retaining prior outcomes | Native loopback/reference measurements remain required. |
| Device chronology / plans / Fleet / certificates | 73/73 focused checks, including unresolved-record permutation cases | Historical records are retained; no automatic reconciliation of unknown dates. |
| MIDI/bridge/action ownership | 92/92 focused checks plus independent late close/listener/retry probes | Mock APIs do not prove physical identity through all OS substitutions. |
| Native MIDI emission | Exact production body, 2/2 after a before-fix failure | Event API acceptance is not end-to-end renderer acknowledgment. |
| Native queued opens | 22/22 independent exact-module cases, including mutex contention | Hardware drivers were not exercised. |
| Native failed-output ownership | 26/26 independent exact-module cases, including duplicate/replacement/reset cases | Observed handle ownership, not a new stable physical identifier system. |
| Backup foreign keys | Exact-helper before/after reproduction and independent historical-fixture checks | Application backup/restore tests still require the native runner. |
| PR #29 ZIP/application streaming bound | Six root exact-source tests with actual ZIP 9; unchanged streaming body checked byte-for-byte | The production archive tests also cover database and settings refusal and live-state preservation; their full app execution remains CI work. |
| Certificate/Verify lifecycle | Ten of 18 new cases fail before; 55 focused tests plus six extra independent probes pass after | Native signing/PDF and operating-system drag/drop qualification remain separate. |
| Monitor settings save/prune operation ownership | Four regression groups failed before; 54/54 focused checks and 3/3 independent probes passed after (the independent probes had two failures before). | Persisted-setting/controller/status ownership is tested; hardware monitoring remains separate. |
| Latest PR #29 audio probe grouping | Two independent source reviews confirm identical device/config/format values and unchanged run body; application formatting passes | Structural Clippy repair only; actual native/Windows compilation remains required. |
| GLib optimized exact-module FFI probe | Original process SIGSEGV; patched module 4/4 passed against real system GLib | This is not the actual compiled GLib crate. |
| GLib source selection and checkout integrity | Ten JS guards pass; independently applying/reversing both patches reproduces all 121 final/original files; all source files and both patch artifacts survive an actual `core.autocrlf=true` checkout | The actual-crate step passed in CI at `ef49ed6`; final combined native and package execution remain gates. |

A `git diff --check` over the whole vendor import reports two preserved upstream/patch whitespace diagnostics: the original LICENSE's terminal blank line and a standard blank context line in the patch artifact. No whitespace waiver was added. Authored source formatting passes; exact upstream source provenance was not modified to make this unrelated checker quiet.

## GLib and supply-chain disposition

The earlier lockfile update corrected the seven original vulnerability records using compatible dependency changes and reviewed ZIP API adaptations. Historical migration/backup compatibility checks and old-reader/new-archive checks remain recorded in [the security audit](DECKCHEK-SECURITY-AUDIT.md). PR #28's useful audit correction verifies the current `rusqlite 0.41.1` / `libsqlite3-sys 0.39.1` archive bundles SQLite 3.54.1. It does not claim all current native tests passed.

[RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) concerns the GLib string-variant iterator's mutable C output pointer. Upstream fixed it in the GLib 0.20 family; the selected GTK/Tauri/WebKit family still requires 0.18. The candidate includes the exact official two-line source backport, plus a separate compatibility patch containing 34 compiler-suggested syntax changes across 12 other files. The verifier requires the approved patch hashes and exact reconstruction of the full original source/license and all archive/file hashes. The version remains 0.18.5. Both application and fuzz roots use the patched source; the isolated optimized actual-crate harness uses the same selection.

The required CI step runs six actual-crate release-profile tests after installing real development dependencies. The step completed successfully in the `ef49ed6` native job after installation of real development prerequisites; the final combined native/platform gates still need completed evidence. The official iterator fix and Cargo source selection remain unchanged. The final combined source adds the independently reviewed compiler-compatibility patch and test-only dependency declaration; its actual-crate/native/Clippy gates require fresh execution. A source scan with no observed caller is not reachability proof, and a path dependency disappearing from the RustSec report is not a security verdict. No advisory suppression or acceptance waiver is used.

The five retained maintenance notices are `chrono` RUSTSEC-2026-0543, `proc-macro-error` RUSTSEC-2024-0370, `zbus_names` RUSTSEC-2026-0371, `zvariant` RUSTSEC-2026-0370 and `zvariant_derive` RUSTSEC-2026-0372. Their actual statuses are recorded without reclassifying them as fixed vulnerabilities.

The workflows retain their current first-party Actions configuration and least-privilege job permissions. This session did not silently add an advisory ignore, broaden a Tauri command, lower diagnostics thresholds, remove negative tests or bypass warning gates.

## Sonar and required approvals

Historical Sonar checks were retrieved: PR #14 had D reliability/D security with 50 annotations; PR #16 had C reliability with four annotations. Those findings were triaged against current source. Narrower or older successful checks do not establish a fresh consolidated quality-gate result.

The public Sonar issue API/dashboard route returns HTTP 403, and this session has no authenticated Sonar capability. No finding was accepted, hidden or suppressed in Sonar. Current broad analysis and any real blocking findings remain outstanding. Intentional SHA-256 modular arithmetic and canonical UTF-16 ordering must not be altered mechanically to silence a stylistic finding.

Branch inventory reports `protected: false` and the accessible ruleset collection is empty. The integration connection receives HTTP 403 for the administration-only branch-protection endpoint. These are access observations, not proof that every possible policy or approval requirement is absent. Refresh repository/PR checks and approvals before merging; never bypass a requirement because its detailed endpoint is inaccessible.

## Historical CI evidence retained

| Source / run | Observed result | Later disposition |
|---|---|---|
| PR #26 `4466cc0`, [44228369554](https://github.com/djshellshoxxx/deckchek/actions/runs/44228369554) | 1,299 JS passed/one optional skip; 654 Rust passed/eight ignored; 1,276 browser checks passed; performance passed | Baseline only. Snyk's “No manifest changes detected in 5 projects” status was not a fresh comprehensive audit. |
| `ed512a1`, [44250832064](https://github.com/djshellshoxxx/deckchek/actions/runs/44250832064) | Native compiled; 653 Rust passed, one source-whitespace assertion failed, eight ignored | Assertion repaired without removing its security check. |
| `742c67a`, [44251830325](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325) | 654 Rust passed/eight ignored; build warning and type checks passed; strict Clippy found 57 diagnostics; browser 1,283/1,283 with no console errors | All 57 diagnostics received reviewed source repairs. Current full Clippy remains a gate. Seven new FS-35 browser cases passed at this source. |
| `730d71d`, [44256004004](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004) | 1,325 JS passed/one optional skip; browser 1,283/1,283; native E0428 before tests | `DriverScan` parser alias collision corrected in `8acaa7a`, public IPC structure retained. |
| Initial PR #27 `1b1db16`, [44258246462](https://github.com/djshellshoxxx/deckchek/actions/runs/44258246462) | JS job passed; browser 1,283/1,283 with no console errors; native 662 passed, one ZIP assertion failure, eight ignored | Confirms alias repair compiled. ZIP 9 assertion corrected and stronger independent application-bound coverage added; later native changes need new CI. |
| `3e85ab5`, [44263620351](https://github.com/djshellshoxxx/deckchek/actions/runs/44263620351) and [44263620354](https://github.com/djshellshoxxx/deckchek/actions/runs/44263620354) | Superseded/cancelled | No qualification claim. |
| `ef49ed6` local supported runtime | 1,391 passed, zero failures, one optional skip, 1,392 total | Superseded by current combined local result above; later lifecycle source requires its own checks. |

Ignored tests and optional skips are never counted as passes. Isolated native harness counts are never added to full application totals.

## Remaining acceptance by category

| Category | Required next evidence |
|---|---|
| Software merge gates | Current application JS/browser/Rust, compiler-warning gate, check, strict Clippy, selected GLib actual-crate regression, relevant platform packages and broad Sonar. |
| Platform behavior | Windows x64/x86, macOS Intel/ARM64 and Linux x64/x86 artifacts; applicable packaged self-tests; current Windows/PDF, sanitizers, fuzz/stress evidence. Diagnose actual failures rather than extending timeouts blindly. |
| Diagnostic hardware | Audio loopback/reference levels and calibration; MIDI timing/drop/disconnect/duplicate-device handling on real drivers; actual stylus/control-vinyl repeatability; monitor capture alongside DJ software. |
| Device research | Manufacturer evidence per exact model/revision/firmware for 29 conditional audio profiles and remaining issues #3–#7. No guessed MIDI/HID mappings or unsupported device claims. |
| Product/manual workflows | Real Fleet database walkthrough with default OFF, actual phones/PWA, VirtualDJ import/export, exported-pack privacy review and physical certificate use. |
| Remaining code/product scope | Stable physical MIDI identity; broader booth isolation A/B and incident history; PDF-embedded certificate JSON; conditional MIDItest consumer integration and explicitly unresolved design/licensing choices. |
| Release only | Owner signing certificates, installers/distribution acceptance, version/tag/license gates and separately authorized publication. |

See [the completion ledger](DECKCHEK-COMPLETION-LEDGER.md) for all 24 feature scopes. Existing thresholds, the -12 dBFS output cap, migration history, stored evidence and Fleet OFF default remain intact.
