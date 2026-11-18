# DeckChek release readiness

**Reviewed foundation checkpoint — 2026-11-18 UTC:** source `25e91e97fa2311e2e786894344297ccdc19ca849`, tree `b2c36fc3774831859a9d2073e657ec7f013d66d1`, preserves both `fd39b14586d9abddf93557b6c5f2628304f2caec` and reviewed integration `ef49ed6cfd08e94651a1536b4e4509efdccdbedb`. It is carried by [PR #29](https://github.com/djshellshoxxx/deckchek/pull/29) into [PR #27](https://github.com/djshellshoxxx/deckchek/pull/27). Canonical `main` remains `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`. The exact combined source passed the complete Node 22 suite: **1,431 passed, zero failed and 1 optional skip (1,432 total; 123.913 seconds)**. Native, platform and extended CI must qualify this source. Guided-stylus corrections are still local and under independent review; the known measurement defects are not declared fixed in this checkpoint. Older results below apply only to their named revisions. See the [current handoff](DECKCHEK-CONTINUATION-HANDOFF.md).

Audit session: 2026-11-17, America/Los_Angeles. GitHub evidence timestamps are UTC. This report distinguishes the retrieved PR #26 baseline from subsequent local corrections.

## Decision

**Release readiness is not established.** Reviewed source `25e91e97fa2311e2e786894344297ccdc19ca849` preserves the lifecycle/ZIP/WASAPI corrections and the reviewed GLib/native-MIDI integration, adds the independently checked compiler-diagnostic gate and stress isolation, and passes 1,431 complete-suite JavaScript tests with one optional skip. Its own native, browser, extended and packaged-platform CI remains required. Guided-stylus measurement corrections are still unpublished and blocked on independent acceptance. Broad Sonar, physical qualification and distribution acceptance remain open. No release, release tag or deployment is authorized by this session.

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

## Earlier local verification and environment

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

These older successes must not be reused as proof that the consolidated head is qualified. The current cross-platform workflow triggers on PRs into main, main pushes, release tags, and manual dispatch. Its manual branch execution builds artifacts without publishing a release; release publication is conditional on a `v*` tag. The current nightly workflow adds Windows Rust/PDF tests, AddressSanitizer, longer fuzzing, and stress tests. No run of that complete workflow on this candidate was observed during this audit.

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

The GitHub connector can create commits/PRs and read checks but exposes no workflow-dispatch operation. Local `gh`/Git have no authenticated push/dispatch session. An attempted UI fallback reached the actual platform workflow page but showed a signed-out session with no Run workflow control. Manual platform validation was not dispatched. The later concurrent commit `2243af7` adds PR-triggered platform validation; its permissions and release conditions were independently reviewed, and the caller/direct concurrency collision is corrected in the reconciled candidate. No credentials or permission policy were changed.

### Dependency analysis before the source backport

The targeted dependency update removes all seven original vulnerability records from both application and fuzz lockfiles without ignoring advisory IDs. Both audits exit zero, with one GLib unsoundness warning and five maintenance notices remaining. SQLite/ZIP compatibility checks cover the actual 22 migrations, rollback, legacy data, online backup and archives in both old/new reader directions. The existing third-party notice generator and check pass. These focused checks do not replace the final native application, fuzz or platform gates; the unresolved GLib warning remains explicit in the security audit.

### Explicit Clippy gate

At `742c67a`, [native job 134624238498](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624238498) passed **654 Rust tests** (eight ignored), the compiler-warning check and `cargo check`. The new strict Clippy gate then failed with **57 diagnostics** across production and test targets. Commit `2243bbb34e21c198390ef32806f813329a5e3dc1` contains independently reviewed corrections, with no lint allowances or changed thresholds. Differential checks cover numeric boundaries, 512 UTF-16 decoder byte vectors and stable sorting. The gate remains open until the complete application passes current CI; a unit-test pass or isolated differential test does not override it.

### Browser verification at the audio correction

[Browser job 134624237913](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624237913) at `742c67a` passed **1,283/1,283 checks**, with no console errors. All seven new FS-35 checks passed: focus/progress, Escape ownership, Enter/Stop behavior, unsaved cancellation, clean evidence and output cap, fault evidence requiring REVIEW, and opposite response errors with file provenance. This resolves the new browser-test execution gap for that source. It does not establish native device or physical-loopback qualification.

### First reviewed native candidate

The first native code candidate was `2243bbb34e21c198390ef32806f813329a5e3dc1`, comprising dependency correction `1ad6a34`, restore-schema correction `c387ae9` and the strict Clippy cleanup. On its working-tree source, Node 22.23.5 again passed **1,325 tests, zero failures, one optional skip** (1,326 total), and Rust formatting passed. The schema fix passed an independently rerun seven-test exact-validator harness, including the 64 KiB allocation guard and historical database fixtures. The dependency fix passed a separate seven-test migration/backup/archive compatibility harness and an old ZIP reader/new archive check. These focused results do not count as a full native build.

### CI at `730d71d` and reviewed follow-ups

[Run 44256004004](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004) on report commit `730d71d83c911317abba2fa205962cdbd15aa8db` completed with:

- [JavaScript job 134637728702](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728702): **1,325 passed, zero failures, one optional skip**, plus a passing performance check, migration/profile/mobile checks and syntax checking.
- [Browser job 134637728622](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728622): **1,283/1,283 passed**, no console errors.
- [Native job 134637728404](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728404): formatting passed; compilation failed with **E0428**, because a new tuple alias reused the existing `DriverScan` struct name. No application Rust tests ran, and check/Clippy were not reached. Commit `8acaa7a` corrects only the alias and parser return annotation, preserving the IPC struct; independent review accepted it.

The next complete code candidate is **`00f1f3cc8d96527f436ee28958ed23201b60a01b`**. It also includes independently reviewed service request/navigation ownership, native duplicate-name selection and mapper save-association corrections. The complete local Node 22.23.5 suite passed **1,338 tests, zero failures, one optional skip** (1,339 total), and full Rust formatting passed. Independent focused evidence includes 48 service checks, 47 mapper checks and 19 actual-body native MIDI harness checks, with additional reviewer edge probes. Those overlapping counts are not added to the full-suite count. Fresh complete application CI is required before this candidate can be treated as passing.

### CI at `1b1db16` and next reviewed source

[Run 44258246462](https://github.com/djshellshoxxx/deckchek/actions/runs/44258246462) completed with:

| Check | Observed result |
|---|---|
| [JavaScript job 134645034742](https://github.com/djshellshoxxx/deckchek/actions/runs/44258246462/job/134645034742) | **1,338 passed, zero failures, one optional skip**; performance, migration/profile/mobile and syntax checks passed |
| [Browser job 134645035183](https://github.com/djshellshoxxx/deckchek/actions/runs/44258246462/job/134645035183) | **1,283/1,283 passed**, no console errors |
| [Native job 134645035196](https://github.com/djshellshoxxx/deckchek/actions/runs/44258246462/job/134645035196) | Formatting and compilation passed; **662 tests passed, one failed, eight ignored**. The lying-header ZIP test expected the application's overrun code, but ZIP 9 now refuses the chunk earlier as `corrupt`. Compiler-warning/check/Clippy steps were not reached. |

The next reviewed source is `eb45ab8fecf100ddf50ef4d4bd6e09fc2ad27a98`. Certificate/Verify and monitor lifecycle corrections add 29 behavioral cases. The full local Node 22.23.5 suite passed **1,367 tests, zero failures, one optional skip** (1,368 total); full Rust formatting passed. The ZIP streaming body is unchanged and has direct guard tests plus four independently killed mutations. The preserved full archive/restore checks require new native CI.

### Long local verification: incomplete, retained for investigation

The repository's long-fuzz command used seed `20261118`, 120 seconds per target and the unchanged 2,000 ms per-input limit. Phone-run failed a wall-time check after 189,189 executions (5,995 ms); backup-manifest failed after 1,585,164 executions (3,052 ms). Workspace, media-import, media-state and catalog-state each completed 120 seconds without a reported failure. The process then exited 137 before canonical reported a result; later targets were not reached. The saved files are 469 and 292 bytes, and repeated exact-input replays did not reproduce the 2-second failures. The backup case exits at invalid JSON parsing. No validator exception or confirmed root cause is established.

`DECKCHEK_STRESS=full` with the existing stress/performance suites passed the monitor performance case, then the stress child received SIGKILL after about 13.5 seconds. No full stress acceptance result was produced. Kernel OOM evidence is unavailable; memory pressure, scheduling, runtime behavior and other causes have not been established. The initially concurrent runs are retained as failed/incomplete evidence. No time or memory budget, assertion or production validator was relaxed.

Standalone canonical replay subsequently completed the unchanged 120-second budget and 2,000 ms input gate on Node 22.23.5: 501,593 executions, no error, exit 0, maximum RSS 152,500 KiB. Both saved slow inputs passed 30,003 exact replays each. These results do not establish why the original process was killed. The remaining and previously timed-out targets are being run sequentially in fresh processes with unchanged budgets; no full long-fuzz pass is claimed yet.

### Historical reconciled qualification at `8c1409e`

Code `8c1409ef390aeb7c0899a82becbaabe82d45c116` combines both corrective histories. A separate checkout excludes ongoing FS-12 edits; its complete Node 22.23.5 suite passed **1,377 tests, zero failures, one optional skip**, and Rust formatting passed. All ten concurrent JavaScript regression cases independently failed on the previous code. Eleven independent native compatibility/accounting checks and six ZIP stream checks also passed; these overlap other suites and are not added into an application-test total.

The PR platform trigger now provides an automatic validation route. Its first observed remote run, [44261217684](https://github.com/djshellshoxxx/deckchek/actions/runs/44261217684), was queued at `1d2b488`; the direct [test run 44261217633](https://github.com/djshellshoxxx/deckchek/actions/runs/44261217633) was cancelled. A discovered concurrency-key collision is corrected in the reconciled source, but no particular cancellation is attributed to it without run-specific evidence. New native tests/check/Clippy, browser and all configured platform build/smoke results remain required.

## Follow-up CI and resource evidence

| Source / check | Observed result | Scope |
|---|---|---|
| `9475ac5`, [native job 134666843341](https://github.com/djshellshoxxx/deckchek/actions/runs/44264888010/job/134666843341) | 670 tests passed, zero failed, eight ignored; formatting, compiler-warning and type checks passed; Clippy failed one example helper with eight arguments | Validates the lifecycle/ZIP native candidate. `fd39b14` corrects the example but requires new CI. |
| `ef49ed6`, [browser job 134668697340](https://github.com/djshellshoxxx/deckchek/actions/runs/44265442094/job/134668697340) | 1,293/1,293 checks passed; no console errors | Remote implementation before the corrective guided-screen/native-IPC smoke. It does not qualify the new follow-up. |
| `ef49ed6`, local GLib source/selection review | Exact 267,679-byte original archive hash verified; 121 files and 1,717,584 original bytes compared; only the official two-line source fix differs; six integrity tests and all three locked Cargo selections passed | The optimized actual-crate regression later passed in CI; package qualification still requires the corrected full gate. |
| `ef49ed6`, independent native MIDI harness | 22 tests passed using production bodies and fake driver boundaries; deleting the pending-open generation guard fails the queued-close regression | Covers software ownership, not physical MIDI identity or hot-plug qualification. |

### Long JavaScript fuzz budgets

All 13 targets have now completed an unchanged 120-second budget across retained attempts on Node 22.23.5, seed `20261118`, with the original 2,000 ms per-input gate. Target implementations/harnesses remain unchanged. This is **not a clean single all-target invocation**: the original timing failures, two exit-137 terminations and the later mapper slow-call failure remain part of the evidence.

| Target | Completed 120-second attempt / executions |
|---|---:|
| phone-run | 3,908,643 |
| workspace | 3,193,268 |
| backup-manifest | 5,811,003 |
| media-import | 3,866,537 |
| media-state | 4,283,214 |
| catalog-state | 3,656,407 |
| canonical | 501,593 |
| pack | 4,800,817 |
| midi-message | 4,976,551 |
| certificate | 4,488,055 |
| mapper-xml | 876,343 |
| mapper-vdj | 1,608,351 |
| device-profile | 1,636,561 |

The initial phone and backup slow inputs each passed 30,003 exact replays. A later 636-byte malformed mapper XML input exceeded the gate at 2,813 ms after 848,479 executions; the exact input then passed 30,003 replays (median 0.0523 ms, p99 0.1378 ms, maximum 2.375 ms), returning the expected XML syntax error. The full retry passed with maximum RSS 157,024 KiB; device-profile passed with 153,084 KiB. The observed mapper failure coincided with major faults, shrinking file-backed RSS and blocked-process samples, but these observations do not establish the specific cause of its slow call or the earlier kills. No parser fix or relaxed budget was justified by replay evidence.

### Full stress remains unqualified

The original concurrent full-stress attempt was killed after about 13.5 seconds; the cause was not observed. A subsequent **serial unchanged** attempt passed the performance case (mean 0.343 ms/hop, worst 1.39 ms, 0.06 MB growth) and then lost the stress child to SIGKILL after 9.364 seconds, before any stress-case result. The observed child peak was 870,596 KiB and process-tree peak 964,980 KiB. The host-wide `oom_kill` counter increased 89 to 90 immediately before the child disappeared, with rising major faults/system CPU. This strongly supports memory pressure for this retry. Kernel attribution is denied and no cgroup mount is exposed, so neither the exact victim/quota nor the original kill's cause is proved.

A separate source-level accounting defect uses the process-lifetime `maxRSS` for every later case, contaminating their independent budgets with earlier peaks; the sampling interval cannot observe synchronous JavaScript while the event loop is blocked. The correction under review isolates each unchanged workload in a fresh Node test process. It preserves every fixture, duration, assertion and budget. Full workloads must run on suitable CI infrastructure; no further local full-run retry is justified. An accidentally executing discovery probe was stopped and retained as non-qualification evidence. No successful full-stress claim is made.
## Reviewed foundation qualification

| Check | Exact evidence | Disposition |
|---|---|---|
| Complete Node 22.23.5 suite | Source `25e91e97fa2311e2e786894344297ccdc19ca849`, tree `b2c36fc3774831859a9d2073e657ec7f013d66d1`: 1,431 passed, zero failed and 1 optional skip (1,432 total; 123.913 seconds); serial test-file execution; source hashes unchanged after execution | Pass for this combined source |
| Warning/profile/planner regressions | 19 passed, zero failed; 0.229 seconds | Pass |
| Actual Cargo warning fixtures | Six states correctly distinguish app/dependency warnings, replay cached warnings, and reject compiler errors | Pass for gate behavior, not a native application build |
| Independent shell failure injection | Seven cases preserve exact failures; complete 90,112-byte stderr retained and displayed when available; root build-exit-23 case also passed | Pass |
| `ef49ed6` native CI | Both [platform-caller run](https://github.com/djshellshoxxx/deckchek/actions/runs/44265442094) and [standalone run](https://github.com/djshellshoxxx/deckchek/actions/runs/44265441929): six optimized GLib tests and 670 app tests passed, eight ignored; warning grep then failed on 34 dependency warnings | Historical source evidence; corrected gate needs current CI |
| `ef49ed6` JavaScript/browser CI | 1,391 JavaScript passes, zero failures, one skip; 1,293/1,293 browser checks | Historical source evidence; new source needs CI |
| Full stress | Serial unchanged run killed before first stress result; worker quick split run passed six cases, but an independent quick repeat failed three of six amid large timing/memory disturbance | Unqualified; preserve all logs and run full unchanged workloads on CI |
| Guided-stylus intermediate review | Earlier 12 reference/lifecycle probes and three targeted storage cases pass; coherent-offset follow-up has one control pass and three expected-eligibility failures | Blocked; intermediate source not published |

The initial complete combined-source run had 1,430 passes, one failure and one skip: rewriting two profile identity notes had accidentally removed their research-seed provenance marker, so the existing 37-profile research check counted 35. The truthful marker was restored in those two profiles without changing the assertion, and the complete suite was rerun on the corrected tree. The failed run is retained as `accepted-foundation-js-initial-profile-marker-failure.log`.

The host-wide OOM counter also increased during the successful quick run, so its increase beside the full-stress death cannot by itself identify the victim or establish a quota. The failed quick repeat recorded canonical JSON at 41,302 ms against 15,000, quick diagnostics at 13,580 ms against 10,000, and a SIGKILL in the vinyl case; performance, wear-map and workspace-import cases passed. No budget or fixture was relaxed. A prematurely started combined-suite run used an incompletely prepared checkout, was stopped, and is retained only as invalid setup evidence.

Automatic PR triggers now expose the existing platform and extended gates on the owned follow-up branch. A source commit, a queue entry or a completed build is not a packaged runtime pass. Broad Sonar, platform artifact/self-test, Windows/PDF, sanitizer, full stress, long combined fuzz, hardware and distribution qualifications retain their explicit limitations. No release, tag or deployment is authorized or performed.
