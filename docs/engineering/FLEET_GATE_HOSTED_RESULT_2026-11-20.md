# Fleet gate hosted diagnostic result — 20 November 2026

## Disposition

The single reviewed diagnostic experiment completed **with failure**. The
untouched native ASan suite passed; the separately compiled instrumented suite
failed the unchanged reminder-overview gate at **213.308243 ms / 200 ms**. The
bounded phase test passed and returned equal results for all 2,000 rows in each
of four alternating original/instrumented pairs. The finalizer retained the
instrumented stage's exit 101 and returned a failing job.

These observations do not establish the cause of PR #65's original
201.565999 ms failure. They do not qualify #65, #67 or a successor, and do not
justify changing the budget. No production Fleet implementation, threshold,
feature default, migration or dependency changes in this evidence handoff.

Dates in this report use America/Los_Angeles. The GitHub run occurred on
21 November UTC, still 20 November locally.

## Exact source and single activation

| Item | Identity |
| --- | --- |
| Diagnostic branch | `diagnostic/fleet-gate-context-20261121` |
| Activated tooling commit | `69fc06eb471dfb00de544bbe233c0f5dc95402e8` |
| Tooling tree | `09b6da880e5a19ea18cdea03e9511d760658bce4` |
| Reviewed inert parent | `6ec1674806a05ca4e44d090b485e37ba35fdb590` |
| Application commit, the actual failed PR #65 merge | `5702a450d9a7faa3efb80c5b67de69386ae07540` |
| Application tree | `a2e4f571ac3a9c7d976db911a5fed3f910c3ea26` |
| Hosted run | [44867671512](https://github.com/djshellshoxxx/deckchek/actions/runs/44867671512) |
| Job | `136734885941` (`native-context`), failure |
| Artifact | `14692768918` |
| Compiler commit | `c7d5ba59d8e11ee2e2204b173458eec4cb41c973` |

All six initial and fresh tooling reviewers finished before activation. The
only activation change was the previously reviewed YAML added at
`.github/workflows/fleet-gate-context.yml`. Root compared the entire tree and
the one-file diff, created the diagnostic branch at the inert parent, and made
one expected-head-guarded update to the activated commit. The
[activation record](evidence/device-outcome-integration-2026-11-20/fleet-diagnostic-activation.json)
retains those identities and the earlier workspace recovery. The existing
[six-worker tooling handoff](FLEET_GATE_CONTINUATION_2026-11-20.md) remains the
review record.

Keep this diagnostic branch and head fixed. The one-run bound is an operational
constraint, not a lifetime counter implemented by GitHub Actions. No extra push,
manual rerun or dispatch was used to obtain a passing result. New records and
any future implementation belong on successors.

## Complete stage results

| Stage | Native result | Exit | Native suite time | Enclosing stage time |
| --- | --- | ---: | ---: | ---: |
| Untouched baseline full suite | 767 passed, 0 failed, 8 ignored | 0 | 251.28 s | 425.459439487 s |
| Instrumented full suite | 766 passed, 1 failed, 9 ignored | 101 | 248.64 s | 277.378685862 s |
| Exact ignored diagnostic phase test | 1 passed, 0 failed, 0 ignored, 775 filtered | 0 | 1.78 s | 2.336781879 s |

Each stage reached tests and has `evidenceComplete:true`. The baseline and
instrumented runs used the full native library suite with the normal test
parallelism; the phase invocation selected one ignored diagnostic test. The
extra ignored test in the instrumented suite is intentional instrumentation,
not an ignored pre-existing failure. No original test was removed or skipped.

The original failure-producing assertion retained its 200 ms budget and timed
interval. Its instrumented wall result was **213,308,243 ns**. Scheduler
snapshots surrounding that interval reported **212,286,504 ns CPU runtime**,
**453,561 ns runqueue wait**, and 53 timeslices. The scheduler and wall intervals
are not exactly coincident. These numbers alone do not explain either this
result or the original PR #65 result.

The finalizer explicitly recorded
`failedOrIncomplete: ["instrumented: exit 101"]` with `diagnosticOnly:true`
and exited nonzero. Panic text from successful caught-panic tests is retained
in the raw logs; it is not counted as additional failed tests.

The untouched binary's SHA-256 is
`41f72ab5e567dee5e2c9f0a1d185e24e1ed5cf7dbdfa25b712d8ad3150622461`.
The instrumented suite and phase test used the same binary hash,
`557e3456c4b54281f9c6848e6b71dd7a92c6f748ee16418a933683f87b215295`.
Only those binary hashes were retained; native executable bytes are not part
of the uploaded artifact.

## Bounded phase observations

Every pair compared the complete 2,000-row result, including values and order.
The original-call and measured-copy order alternated. Times below are ms.

| Pair | First call | Original whole call | Measured copy whole call | Completion query/map | Usage query/map | Reminder query/JSON | Enrichment |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | Original | 109.641418 | 108.017522 | 22.556555 | 12.919606 | 47.005094 | 24.757256 |
| 1 | Measured copy | 107.254800 | 108.846146 | 22.306598 | 13.071089 | 47.460543 | 25.181496 |
| 2 | Original | 108.502616 | 109.860887 | 22.608742 | 13.320543 | 47.619399 | 25.462339 |
| 3 | Measured copy | 109.203061 | 110.020564 | 22.749835 | 13.270259 | 47.924277 | 25.206742 |

Reminder querying and JSON construction was the largest measured phase in
these four calls, followed by enrichment. That identifies an area to inspect
for a future measured change. It is not proof of a regression, a particular
allocation cost, or an explanation of the full-suite failure.

The four phase timers exclude recorder work and returned-value cleanup; the
whole-call timers include cleanup. The measured copy contains probes, the
fixture is warm after writes, and only four pairs were measured. The untouched
full suite and instrumented suite have different binary hashes. No allocation
counts or controlled causal experiment were captured. Do not substitute these
warm isolated observations for the existing whole-suite performance gate.

## Native and database context

The hosted environment reported four CPUs and affinity `[0,1,2,3]`; `cpuMax`
was null. The run pinned `nightly-2026-11-21`, resolving to rustc
1.102.0-nightly at the full compiler commit above, LLVM 23.1.6, on Ubuntu
22.04.5. Recorded SDK versions were GTK 3.24.33, WebKit 2.50.4, ALSA 1.2.6.1
and Ayatana 0.5.90. The full environment and allowed sanitizer variables are
in [context.json](evidence/fleet-gate-hosted-2026-11-20/artifact/context.json).

The actual database used SQLite 3.54.1 and all 25 migrations. The fixture had
1,000 Fleet assets plus two seed assets, 2,000 reminders, 10,000 maintenance
events and 3,000 confirmed usage rows. `EXPLAIN QUERY PLAN` reported:

| Query | Observed steps relevant to this investigation |
| --- | --- |
| Reminders, all assets and filtered asset | Scan `maintenance_reminder`; temporary B-tree for ordering |
| Latest completions, both scopes | Co-routines, scan `maintenance_event`, temporary B-tree for ordering |
| Confirmed usage, both scopes | Scan `asset_usage` |

These are plans captured from the actual fixture, not inferred index-use
claims. Full compile options and all plan steps are in
[phases.json](evidence/fleet-gate-hosted-2026-11-20/artifact/phases.json).

## Retained bytes and verification

The complete 144,758-byte uploaded ZIP has SHA-256
`420867c55efa1b7ecf182da724d9d99893af23debb0c0d886aaa062523797de9`.
Its 13 files were extracted with bounded paths, sizes and symlink checks.
Every extracted file was then compared byte-for-byte with its ZIP member.
The complete decoded 486,777-byte job log has SHA-256
`5aef76d0196409c98a1b54b5d889aad3d4c42c241e5f9d7742525342c54cf7cf`.
Raw log whitespace is preserved.

The hosted source proof is byte-identical to the prior fresh-worker proof,
SHA-256 `1940de1d300956e5fa24fe85d8ef71893063354a4d08ee2146a6ffa79f44738b`.
The transient overlay hash is
`0ee2fcc60232cf25f554986ae43bc9a13dcd7ff2bbeafb92253e6ca9282e9dcf`.
The verifier checks source/tooling tree IDs from Git, all stage log digests,
the original and overlaid Fleet file, generator, manifest, lockfile and 25
migrations, tracked changes, complete stage counts, binary identities and
four full-row equalities. It executes no application or native code. Its first
local attempt stopped because the restored clone lacked the historical merge
object; root fetched the two exact immutable commits and verification then
passed. That lookup failure is not a test failure.

- [Result summary](evidence/fleet-gate-hosted-2026-11-20/result-summary.json)
- [Byte inventory](evidence/fleet-gate-hosted-2026-11-20/artifact-index.json)
- [Verification script](evidence/fleet-gate-hosted-2026-11-20/verify-artifacts.py)
- [Complete uploaded ZIP](evidence/fleet-gate-hosted-2026-11-20/fleet-gate-context-44867671512.zip)
- [Complete job log](evidence/fleet-gate-hosted-2026-11-20/complete-job.log)
- [Baseline record](evidence/fleet-gate-hosted-2026-11-20/artifact/baseline.json)
- [Instrumented record](evidence/fleet-gate-hosted-2026-11-20/artifact/instrumented.json)

To run the verifier, the application and tooling commits in the table must be
available in the local Git object database. The script regenerates only the
derived JSON summary and byte inventory; it does not rerun the hosted
experiment. The archived native source is evidence and is not copied into
`src-tauri/src/fleet.rs`.

## Qualification and next work

PR #65's failed ASan result remains in its own qualification record. PR #67's
separate later ASan success, on the same compiler commit and unchanged native
tree, likewise remains bound to its actual tested source. Neither success
removes the observed failures or establishes their cause.

Any future Fleet optimization should name a concrete measured hypothesis,
preserve exact results and the existing query-count/budget assertions, and
obtain matched source-specific native validation. No such production change
is claimed here. The active successor combines the separately reviewed device
outcome and trend corrections; its fresh workers will review this report's
interpretation and execute its own applicable JavaScript acceptance.
