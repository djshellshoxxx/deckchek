# Device outcome and trend continuation — 20 November 2026

## Result

All three initial workers and all three different fresh acceptance workers
completed. The corrected device-result fallback requires usable evidence before
recording PASS. It retains the latest observation for each nonblank metric ID
and accepts a finite value, including zero or a negative number, or an explicit
OK finding. Otherwise the result is `unknown`, using the existing REVIEW
presentation. Profile criteria, explicit verdicts, error/review precedence and
previously saved records retain their existing behavior.

The trend helper now rejects an actual zero time span before regression. This
completes incoming PR #68's correction for repeated fractional timestamps that
could leave a finite floating-point residual. The existing denominator
threshold, defined-span calculation and consumers remain unchanged.

Fresh full serial JavaScript acceptance passed **2,284 tests, zero failures and
one existing optional Mixxx-corpus skip (2,285 total)** on **Node v24.22.3**,
across **190 test files**. All **1,804 tracked hashes** remained unchanged. Both
fresh static reviewers accepted the assigned scope without a blocking finding.
Applicable hosted/native/platform qualification remains separate.

## Frozen source and preservation

| Role | Commit | Tree |
| --- | --- | --- |
| Initial assignment including PR #68 | `9fc11d6e15cc97141c14b309c61a38393fcbafd8` | `dcc98491724a06c84023c3633ad04ae6ce80a674` |
| Final author source/test candidate | `9de3f95cf0e79851dc01a27066c515c6691ef811` | `e3acafa37270ca4b182116153c3d16ac77b3d115` |
| Combined fresh acceptance source | `ce66a40ac9b306ff65a994d5adf00d1a696ba47b` | `6de27897af9aea1f69084b1de6ef3c294247ac80` |
| Durable exact-tree equivalent | `0561724b5bf8fdda92699c79ab6d539feee0479b` | `6de27897af9aea1f69084b1de6ef3c294247ac80` |

The durable checkpoint is on
`checkpoint/deckchek-device-outcome-source-20261120`. Root fetched and compared
the entire tree, checked its parents and read back its branch head. Its parents
are published inert Fleet handoff `6ec1674` and unchanged PR #68 head `d36517f`;
PR #65 and #67 ancestry is retained. Its commit identity differs from the local
combined source, while the entire tree is identical. The
[publication record](evidence/device-outcome-integration-2026-11-20/source-publication.json)
retains that distinction and the then-current review state.

Only `app/devices/dispatch.js` and `app/diagnostics.js` change production
behavior for this slice. The author adds two outcome regression files and
extends PR #68's trend regression. The combined source adds initial reports and
retained Fleet evidence without further application, native, migration,
workflow, profile or dependency changes. Final acceptance reports and this
handoff are later documentation/evidence additions.

## Completed worker handoff

All initial lanes finished before fresh acceptance began. Only the assigned
functional worker executed project tests at each stage. The code and security
lanes used static source, Git, JSON and byte/hash inspection.

| Lane | Report | Report/evidence commit |
| --- | --- | --- |
| Initial code | [Code audit](DEVICE_OUTCOME_CODE_AUDIT_2026-11-20.md) | `a6a18da93d04c72cead1b42369706d31c7c5ea42` |
| Initial functional | [Functional audit](DEVICE_OUTCOME_FUNCTIONAL_AUDIT_2026-11-20.md) | `5b770bb37ea284b2963334cd518f4817d479b6a8` |
| Initial defensive | [Security audit](DEVICE_OUTCOME_SECURITY_AUDIT_2026-11-20.md) | `1a0cdd44b13846089bfe8b24b1bda20ed9c97d26` |
| Fresh code | [Code acceptance](DEVICE_OUTCOME_CODE_ACCEPTANCE_2026-11-20.md) | `9f077533261e4f55d510a18cd9c6ecfffc6e5e06` |
| Fresh functional | [Functional acceptance](DEVICE_OUTCOME_FUNCTIONAL_ACCEPTANCE_2026-11-20.md) | `368dc5dc8874d3c6e8e23510228e84a4391bff46` |
| Fresh defensive | [Security acceptance](DEVICE_OUTCOME_SECURITY_ACCEPTANCE_2026-11-20.md) | `9f90955073fb7e9b6012dc6f29ea9b78d850278d` |

## Source-bound execution evidence

| Execution | Exact source | Result |
| --- | --- | --- |
| Final validated regressions on unchanged baseline application | `74f19b85e462b3602b12814a44226b6b9002b6d3` | 11 pass / 5 expected semantic failures; final identical test files. |
| Corrected final regressions | `9de3f95cf0e79851dc01a27066c515c6691ef811` | 16/16 pass; zero skips. |
| Six existing related files | `8fbaa3e2ea95ec3ed4a47bdf30dfd04b0bb09aab` | 142/142 pass. Application and those files remain identical in the final candidate; retained coverage, not a later rerun. |
| Fresh full serial suite | `ce66a40ac9b306ff65a994d5adf00d1a696ba47b` | 2,284 pass / 0 fail / 1 optional skip; 2,285 total, 190 files, zero cancelled/TODO, exit 0. |

All these executions used Node v24.22.3. The fresh process elapsed time was
**404.314412211 seconds**; TAP reports **404142.551874 ms**. Its complete
523,769-byte log SHA-256 is
`a70bb2967017f6b5e200763ef946b1786ae24d1986b95e7663912f264fdbac4d`.
Root checked that digest and the unchanged application/test/native inputs after
integrating the reports. Exact commands, runtime, before/after maps and counts
are in the [execution metadata](evidence/device-outcome-acceptance-2026-11-20/full-suite.json)
and [complete TAP](evidence/device-outcome-acceptance-2026-11-20/full-suite.tap).
Focused and full counts overlap and must not be added together.

Earlier author attempts remain recorded: an initial fixture bootstrap error,
an incorrect expectation of UNKNOWN where the product displays REVIEW, and a
fixture initially missing required profile metadata. The final fixture supplies
those fields, explicitly validates without errors or warnings, and checks the
persisted status first. These fixture corrections are not presented as product
failures. The final five baseline semantic failures remain separate evidence.

## Reachability and interpretation

The default bridge already turns null/undefined/non-object native responses
into unsupported scans, which the screen does not save. The persisted-result
regression instead uses a supported scan and a schema-valid modeled profile
lacking a Windows-driver definition and pass criterion. It drives the actual
screen event handler, bridge, evaluator, finish/save wrapper and browser catalog
with modeled DOM/native inputs. It does not establish browser rendering, native
SQLite behavior or a physical-device incident.

Fresh inventories confirmed 45 bundled profiles and 14 handwritten driver
checks, all 14 with pass criteria and Windows-driver definitions. The generated
driver check also has a criterion. No shipped-profile incident is claimed.
The generic evaluator still needs to distinguish missing evidence from an
affirmative observation. A finite fallback reading is not compliance with an
absent threshold, and an explicit verdict retains its existing caller contract.

Trend regressions cover equal fractional times `1000.1` and `123456.7` and
ordinary defined spans. Existing warm-up and stylus consumers already reject
an unavailable slope. The helper correction is not described as a demonstrated
false-score incident in those interfaces or a general numerical-conditioning
rewrite.

## Fleet evidence remains separate

The [hosted Fleet result](FLEET_GATE_HOSTED_RESULT_2026-11-20.md) and complete
archive/logs are retained in this successor. Single run `44867671512` finished
**with failure**: untouched baseline 767/0/8 ignored, instrumented suite
766/1/9 ignored, and one passing phase test with 775 filtered. The instrumented
gate measured **213.308243 ms / 200 ms**; the finalizer retained exit 101. Four
phase pairs returned identical complete 2,000-row results.

Each fresh reviewer checked all 17 inventory entries and all 13 ZIP members.
PR #65's original **201.565999 ms / 200 ms** failure remains unexplained. Warm
isolated timings, surrounding scheduler counters and different full-suite
binary hashes do not establish a cause or qualify a PR. The activated diagnostic
head stays fixed at `69fc06e`. No repeat experiment, production Fleet change or
budget change is introduced. Fleet remains default-off.

## Publication and next scope

The next distinct worker set addresses issue #69's diagnostics path-redaction
gap in JavaScript and Rust. The next consolidated draft PR will include both
accepted slices so hosted qualification covers the combined source. PR #68's
original head/branch remains intact until its corrected replacement is
published. Issue #66 remains open until a qualified implementing merge; local
acceptance is not a deployed fix.

At the dated readback, main is `cfb1137d3d01ddd4a9fd0677113314dc7deb76ee`.
PR #67 has passing standard checks, all six desktop builds and all five packaged
smokes; nightly cargo-fuzz remains running. Its later ASan success is bound to
its own source and does not clear #65's failed run. Ordinary merges require all
applicable exact-source gates, current-base merge-tree proof and an expected-head
guard. Read live refs; these dated observations are not current queue commands.

CDJ production UI, retained raw/reference bytes, persistence/reporting and
scientific/physical qualification remain open. No release, deployment, tag,
permission expansion, hardware/scientific completion or threshold change is
implied by this handoff.
