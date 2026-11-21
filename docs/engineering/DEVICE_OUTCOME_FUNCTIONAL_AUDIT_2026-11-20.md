# Device outcome and trend functional audit

Audit set: 2026-11-20. Execution occurred on 2026-11-21 UTC.

## Outcome

Two bounded corrections are ready for fresh acceptance review. A device result with no profile criterion, engine verdict, usable current measurement, or explicit OK finding now remains `unknown`. A trend whose usable observations all have the same timestamp now has an unavailable fit, including fractional timestamps for which floating-point cancellation previously left a finite regression result.

The final regression run passed **16/16 tests**, with no skips or cancellations, on candidate `9de3f95cf0e79851dc01a27066c515c6691ef811`. The identical test files produced **11 passes and five semantic failures** on a frozen proof tree with the assigned base's unchanged application code. The screen failure explicitly read back `pass` from the browser catalog where `unknown` was expected. Another **142/142 existing related tests** passed at `8fbaa3e2ea95ec3ed4a47bdf30dfd04b0bb09aab`; the application and those six test files are byte-identical in the final candidate. These are focused author checks, not a full-suite or native acceptance claim. [Final regression evidence](evidence/device-outcome-functional-2026-11-20/schema-final-regressions.tap), [baseline evidence](evidence/device-outcome-functional-2026-11-20/schema-baseline.tap), [related checks](evidence/device-outcome-functional-2026-11-20/final-related.tap), and [committed-source comparison](evidence/device-outcome-functional-2026-11-20/source-comparison.json) retain the associations.

## Source and runtime identity

| Role | Commit | Tree |
| --- | --- | --- |
| Assigned consolidated base, including PR #68 | `9fc11d6e15cc97141c14b309c61a38393fcbafd8` | `dcc98491724a06c84023c3633ad04ae6ce80a674` |
| Initial regression freeze | `7c3e151d11aa9eb9298331b8f6cc93084672b466` | `f1b1d38e244d2051024af7e314043fab22bdbc70` |
| Corrected initial screen bootstrap | `9035fd46b861e020acb28c6f09fc998b028d117e` | `b621708485d72d0f379b858990610f1deccec130` |
| Both production corrections | `d2931c3390917faae31a634b2de663afa8ac50c8` | `90578126e72f4e8351c0f0fecae84679093356e6` |
| Existing REVIEW label asserted; related-suite source | `8fbaa3e2ea95ec3ed4a47bdf30dfd04b0bb09aab` | `a9b9b0734d2da1670bec798e7b5071deaf494e19` |
| Final validated fixture and candidate | `9de3f95cf0e79851dc01a27066c515c6691ef811` | `e3acafa37270ca4b182116153c3d16ac77b3d115` |
| Final tests on unchanged baseline application | `74f19b85e462b3602b12814a44226b6b9002b6d3` | `fb39930b3ddd2e0c4aadf80142773bff121917b8` |

The proof commit is retained on local branch `review/deckchek-device-outcome-proof-20261120`. Its detached worktree was frozen before execution; it is evidence, not a source correction to integrate. It differs from `9035fd4` only by the final screen-test file. The proof and final candidate differ only in `app/devices/dispatch.js` and `app/diagnostics.js`; all three regression-test Git blobs match. [Proof assembly](evidence/device-outcome-functional-2026-11-20/proof-assembly.json) and the source comparison record those checks.

All runs used `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`, **Node v24.22.3**, with serial test-file execution. No alternate runtime was installed. The earlier PR #68 author's isolated assertions are not substituted for these repository executions. Every recorded run started with a clean worktree and retained SHA-256 maps for all **1,749 tracked files** before and after the test process; each pair is identical. Evidence/report files were added after the final frozen execution.

## Issue #66: missing evidence must remain unknown

### Actual contract and correction

[`evaluateOutcome`](../../app/devices/dispatch.js) previously returned PASS after excluding error/review findings even if every measurement was unavailable. The new fallback collects the latest value for each nonempty string `metricId`, matching the latest-observation ownership rule already present in [`evaluatePass`](../../app/device-checks.js). A finite current value, including zero or a negative value, remains usable. A later unavailable value for the same metric replaces an earlier usable value; an available value for a different metric still counts.

The existing order remains: profile criterion, explicit engine verdict, error findings, review/warning findings, then fallback evidence. An explicit `severity: 'ok'` finding remains affirmative without numeric readings. Empty results, informational findings alone, null/undefined/nonfinite readings, numeric-looking strings, and readings without a meaningful metric identifier no longer imply PASS. The no-evidence result uses `status: 'unknown'` and `criterion: 'evidence'`. No threshold, manual-checklist behavior, stored-result schema, or historical-result rewriting was introduced. [Focused outcome assertions](../../tests/device-outcome-evidence.test.mjs) cover these distinctions.

### Production event handler and persistence boundary

The screen test mounts the actual [`createDevicesScreen`](../../app/ui/screens/devices.js), opens the modeled device, starts its `driver:check`, and dispatches the actual scan button handler. It uses the default [`createSystemBridge`](../../app/system-check.js), actual driver evaluation and [`scanRunner`](../../app/ui/devices/runners.js), the screen's real `ctx.finish`, [`saveResult`](../../app/ui/devices/library-state.js), and the real browser implementation of [`createCatalogStore`](../../app/catalog-store.js). Only the DOM implementation, native scan response, and backing storage are modeled. The store spy forwards writes into that browser catalog rather than replacing persistence with a result stub. [Screen regression source](../../tests/device-outcome-screen.test.mjs).

The final fixture has the required profile metadata and explicitly asserts `validateProfile(profile)` returns `{ ok: true, errors: [], warnings: [] }`. It intentionally has no pass criterion and no Windows driver definition. A supported scan consequently yields four null readings and an informational `driver-no-profile` finding. On the unchanged baseline, the newly saved catalog row is PASS; after the correction, it is `unknown`, and the existing UI displays **Saved: REVIEW**. The test also compares the pre-existing PASS fixture row byte for byte after the save. This is a schema-valid modeled configuration, not evidence that a bundled profile or a hardware session encountered the condition.

The initial null-scan lead was narrowed by inspecting the real bridge. Raw null and undefined native responses already become an unsupported scan, which the runner does not save. Tests confirm that behavior for null, undefined, and explicit `supported: false`; no caller change was needed. A class-compliant profile without driver definitions has an explicit OK finding and still saves PASS.

## PR #68: actual repository validation and fractional-time correction

Integrated PR #68 (`d36517ff5bb9134288f7a8aedbc62066da874099`) added a finite-fit guard to [`trendMetrics`](../../app/diagnostics.js). Its existing two repository tests pass on the assigned base. Static code review identified a remaining ordinary numerical case: the regression denominator `n * sxx - sx * sx` uses uncentered sums, so identical noninteger timestamps can leave a cancellation residual larger than the existing `1e-12` threshold.

The actual repository function failed the added repeated-time cases at `1000.1` and `123456.7`. Each uses three observations; the test covers constant values `[1, 1, 1]` and varying values `[1, 2, 3]`. The baseline stopped at the first non-NaN slope assertion in each case. The direct no-time-span guard now returns the established NaN convention for slope, intercept, and R-squared before regression when all usable times are equal. It retains the usable count, existing finite-fit guard, numerical threshold, and defined-span algorithm. The valid constant and linear trend controls remain unchanged. [Trend test source](../../tests/diagnostics-trend-degenerate.test.mjs) and [red/green logs](evidence/device-outcome-functional-2026-11-20/README.md).

Caller inspection found finite-slope checks in [`app/ui/analysis.js`](../../app/ui/analysis.js) and [`app/stylus-wear.js`](../../app/stylus-wear.js). Existing core and stylus-wear tests passed in the related run. This lane does not claim to have reproduced a previously rendered false-perfect UI result; the new failure evidence is the actual diagnostics function's undefined-fit contract.

## Retained execution history

| Evidence prefix | Source | Result | Interpretation |
| --- | --- | --- | --- |
| `initial-fixture` | `7c3e151` | 11 pass / 5 fail | Two evaluator and two fractional-time failures; the first screen test failed during fixture bootstrap. This is not the screen application proof. |
| `baseline` | `9035fd4` | 11 pass / 5 fail | The screen reached the real save wrapper and supplied PASS. Required fixture metadata had not yet been completed, so this run is not cited as the schema-valid profile proof. |
| `candidate-regressions` | `d2931c3` | 15 pass / 1 fail | Stored unknown/history assertions passed; the remaining assertion incorrectly expected UNKNOWN rather than the existing REVIEW display label. |
| `final-regressions` | `8fbaa3e` | 16 pass / 0 fail | Earlier passing run, before the fixture metadata and direct persisted-status assertion refinement. |
| `final-related` | `8fbaa3e` | 142 pass / 0 fail | Six existing related files; application and those files are identical in the final candidate. |
| `schema-baseline` | `74f19b8` | 11 pass / 5 fail | Final identical tests on unchanged base application; validated profile and explicit persisted-PASS failure. |
| `schema-final-regressions` | `9de3f95` | 16 pass / 0 fail | Final candidate, validated profile, all assertions green. |

Every run has zero skips, cancellations, and TODOs. Repeated runs are not added together as distinct coverage. All earlier failures remain in the evidence directory. The `started_at_utc` field in the first `initial-fixture.json` was mistakenly recorded after the process completed; it is a completion observation, not a reliable start time. Subsequent records contain separate start and completion observations. Durations and raw output are preserved without rewriting the original metadata.

The regression command was:

```sh
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap tests/device-outcome-evidence.test.mjs tests/device-outcome-screen.test.mjs tests/diagnostics-trend-degenerate.test.mjs
```

The related command was:

```sh
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap tests/device-library.test.mjs tests/device-checks.test.mjs tests/system-check.test.mjs tests/devices-screen-lifecycle.test.mjs tests/core.test.mjs tests/stylus-wear.test.mjs
```

Metadata supplies the exact working directory, commit, tree, process exit code, runtime, durations, and TAP SHA-256 for each command. [Evidence index](evidence/device-outcome-functional-2026-11-20/run-index.json).

## Fresh-worker handoff

The source correction is limited to two production files; three focused test files cover the regressions. The code and security siblings reviewed the production candidate independently without running tests, and were sent the final fixture refinement for exact-source report updates. No native build, installed-package change, remote mutation, scanner, or existing gate change was performed by this lane. Existing shared DOM fixtures were reused without modification.

Fresh acceptance should review the final candidate and run the coordinated full suite once after consolidation. Browser rendering, native bridge execution, native SQLite persistence, Windows hardware, and the hosted Fleet diagnostic remain separate evidence boundaries; none is inferred from this modeled DOM/browser-catalog test. The Fleet run remains owned by root, and issue #69 remains outside this correction.
