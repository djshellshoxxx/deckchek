# Device outcome and trend fresh functional acceptance — 20 November 2026

Reviewer: `/root/device_outcome_functional_fresh`. This is the independent
functional acceptance pass after all three initial workers completed. Dates use
America/Los_Angeles; retained execution metadata uses UTC.

## Disposition

**Accepted for the local serial JavaScript lane:** **2,285 tests total, 2,284 passed, 0 failed, 1 pre-existing optional Mixxx corpus skip**, with zero cancellations and TODOs. The process exited 0.

The combined application and test bytes match the final author candidate. The
full-suite run is new execution on the combined source, not a reclassification
of the earlier focused results. This lane made no production or test changes.

## Exact source and execution

| Item | Observation |
| --- | --- |
| Frozen combined commit | `ce66a40ac9b306ff65a994d5adf00d1a696ba47b` |
| Frozen combined tree | `6de27897af9aea1f69084b1de6ef3c294247ac80` |
| Final author candidate | `9de3f95cf0e79851dc01a27066c515c6691ef811` |
| Runtime | Node `v24.22.3` |
| Selected files | All 190 sorted top-level `tests/*.test.mjs` files |
| Execution | Serial test files, `--test-concurrency=1`; one full-suite invocation |
| Start / completion UTC | `2026-11-21T05:19:44.785851+00:00` / `2026-11-21T05:26:29.100552+00:00` |
| Process elapsed time | 404.314412211 s |
| TAP duration | 404142.551874 ms |
| Source-integrity map | 1804 tracked files; identical before and after |
| Starting and ending worktree | Clean, including untracked files |
| Full TAP SHA-256 | `a70bb2967017f6b5e200763ef946b1786ae24d1986b95e7663912f264fdbac4d` |

The command was equivalent to:

```sh
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node \
  --test --test-concurrency=1 --test-reporter=tap tests/*.test.mjs
```

The actual invocation expanded the sorted file list in Python, recorded every
argument, and placed the same Node directory first in the subprocess PATH.
Logs and metadata stayed outside the checkout until the run and after-map
completed. The 1,800-second wrapper timeout was not reached. No runtime,
dependency or SDK was installed. The full suite already includes mobile
artifact-generation checks; this lane did not repeat them separately.

[Execution metadata](evidence/device-outcome-acceptance-2026-11-20/full-suite.json),
[complete TAP](evidence/device-outcome-acceptance-2026-11-20/full-suite.tap),
[before map](evidence/device-outcome-acceptance-2026-11-20/tracked-before.json),
[after map](evidence/device-outcome-acceptance-2026-11-20/tracked-after.json) and
[static evidence verification](evidence/device-outcome-acceptance-2026-11-20/static-evidence-verification.json)
retain the exact identities and results.

## Independent boundary inspection

### Device outcome evidence

The new regression files import the actual evaluator and mount the real Devices
screen with the existing service DOM fixture. I traced the scan event handler
through the default system bridge, `evaluateDriverCheck`, `evaluateOutcome`,
`ctx.finish`, `saveResult` and browser `createCatalogStore`. The write spy
forwards to the real browser catalog. The regression reads back the saved row
before asserting the submitted status, checks the existing REVIEW display, and
compares the earlier PASS row without reinterpreting it.

The profile fixture explicitly passes `validateProfile` with no errors or
warnings. It models a supported scan for a profile without a Windows driver
definition or pass criterion. Such a scan supplies null measurements and an
informational finding; the new result remains `unknown`. It does not establish
a bundled-profile or physical-device incident. Raw null/undefined native
responses already normalize to `supported:false` in the default bridge; the
runner returns without saving, and the controls retain that behavior.

The outcome coverage preserves finite zero and negative readings, an explicit
OK finding, latest-observation ownership per metric, independent usable
metrics, error/review precedence, explicit verdicts and profile criteria. The
new evidence guard supplies no threshold or scientific qualification of its
own. No persistence or historical-row migration is needed or included.

### Degenerate trend fit

The trend tests import the actual diagnostics module and cover both constant
and varying values at repeated fractional times `1000.1` and `123456.7`, as
well as repeated integer times. A zero time span now returns the existing
unknown-fit convention while retaining the filtered sample count. Defined
constant/linear trends and finite-input filtering remain covered. The
correction preserves the original regression algorithm and denominator limit.

I inspected the warm-up measurement consumer and stylus trend wrapper: both
check whether the slope is finite before presenting a usable fit. This pass
establishes the helper contract through repository execution and consumer
behavior through source inspection; it does not claim a reproduced historical
browser display or a general numerical-conditioning solution.

## Earlier evidence retained at its actual source

The initial code, functional and defensive reports were read before acceptance.
Git comparison independently confirms all three final regression files are
identical in the proof baseline, final author candidate and frozen combined
source. The proof application's bytes match the assigned base. Only the two
production files differ between the proof and final candidate. All application
and test files match between the final candidate and this combined source.

| Retained author run | Source | Recorded result |
| --- | --- | --- |
| Final schema-valid proof | `74f19b85e462b3602b12814a44226b6b9002b6d3` | 11 pass / 5 expected semantic failures |
| Final corrected regressions | `9de3f95cf0e79851dc01a27066c515c6691ef811` | 16/16 pass |
| Six existing related files | `8fbaa3e2ea95ec3ed4a47bdf30dfd04b0bb09aab` | 142/142 pass |

I verified those source/tree identities, TAP digests and counts, and the equal
1,749-file before/after maps. The related files and application remain
byte-identical at the final candidate. These are retained author observations;
I did not repeat or add them to the new suite's coverage count. The earlier
fixture-bootstrap, missing-metadata and incorrect UNKNOWN-label attempts remain
in the initial evidence with their corrected interpretation. The valid proof's
five failures concern empty evidence, stale evidence, persisted device status
and the two fractional-time cases.

## Hosted Fleet evidence boundary

I independently checked all 17 entries of the hosted artifact inventory and all
13 ZIP members against the extracted bytes. The source and tooling trees match
the retained Git objects, and the hosted source proof exactly matches the
accepted tooling proof. Native source, migrations and workflows are unchanged
from the inert Fleet parent `6ec1674806a05ca4e44d090b485e37ba35fdb590`.

The retained experiment has a passing untouched native baseline, an
instrumented full-suite failure at 213.308243 ms against 200 ms, and four equal
2,000-row phase pairs. The instrumented exit 101 and overall failure remain in
the records. Original PR #65's 201.565999 ms failure remains unexplained.
Scheduler snapshots surround wall timing, and measured-copy probes, warm
fixtures, returned-value cleanup and distinct binaries limit interpretation.
No causal claim, threshold relaxation or PR qualification follows from this
artifact inspection. This worker did not execute or retrigger the native
experiment.

## Limits and handoff

The result qualifies the frozen source for this local serial JavaScript lane.
The only skipped test is the existing optional local Mixxx controllers corpus (`MIXXX_CONTROLLERS_DIR` was not set). That external corpus was not installed or exercised; no new skip or exclusion was added. Browser rendering, native SQLite, native system scans, hardware,
scientific qualification, packaged desktop acceptance and exact-head hosted CI
remain separate gates. The fresh static code and defensive workers have their
own acceptance dispositions.

No application source, tests, thresholds, Fleet defaults, workflow permissions,
release state or remote refs changed in this lane. Report and evidence were
added only after the tested source was verified unchanged. Root owns integration,
publication and qualification of the resulting successor; issue #69 is outside
this pass. No additional unchanged-suite rerun is needed for these report-only
additions.
