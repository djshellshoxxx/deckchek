# Service comparison — round 14 code audit

## Disposition

**FINAL scoped CODE ACCEPT after static source and retained-FIRST-data review.**
No concrete blocker was found in the Service #86 missing-baseline correction.
The complete changed production modules and tests, the six proposed test files,
their original fixtures, and relevant screen/stepper/print consumers were read.
The separately authorized functional FIRST selection passed all 123 cases;
this lane independently verified its original data and every retained copy.

This independent correction does not clear the inherited backup webview static
HOLD, native #85, or the full-source audio HOLD, and does not qualify the whole
tree for release. Root's separately authored backup recovery correction is not
part of this source freeze or this acceptance.

## Frozen source and ownership

| Item | Independently checked identity |
| --- | --- |
| Assigned HEAD | `36e968821fdcd61e2f43de22a09b811384eea8e0` |
| Tree | `a5fc965e2f4151705d862e05b89e1cb06b0acdb2` |
| Sole ordered parent | `34d09f790bea68a6ce5555b60f97d20fd007dbb5` |
| Branch | `review/deckchek-service-comparison-code-20261121` |
| Tracked paths / distinct blobs | 2,464 / 2,229 |
| Summed tracked bytes | 81,828,656 |
| Tracked and actual top-level test inventory | 205 identical paths |
| Root compact full-map SHA-256 | `e16668214d8323f344c086b2eef5265a334d4a90851a78f7c40a8af4c22d5163` |

The assigned worktree was clean before this report. Every tracked working file
was compared with its immutable Git blob, including byte length, content hash
and executable mode; Git object identities were independently recomputed.
Byte verification of the whole tree is distinct from manual reading of the
changed code, selected tests and relevant dependency paths.

This lane owns only this report. It made no source, fixture, test, dependency,
permission or configuration change. It invoked no Node, project import, syntax
check, test, build, browser/native operation, scanner, probe or copied/extracted
implementation. Its checks use source reads, Git and independent Python
standard-library byte/JSON/TAP operations only.

The review followed
[the implementation note](SERVICE_COMPARISON_IMPLEMENTATION_2026-11-21.md)
and [the assigned scope](SERVICE_COMPARISON_REVIEW_SCOPE_2026-11-21.md).
All three preceding backup webview reports were read in full before the
preliminary disposition was sent to root.

## Code findings

### Row presence and compatibility

`app/service.js`, `comparisonCompleteness`, now uses `rows.length` as the
denominator. Its directional counts inspect the existing, mutually exclusive
`missingBefore` and `missingAfter` row statuses. Their sum is the existing
`missing` field. Empty rows remain `empty`; either directional gap makes the
comparison `partial`; rows with both phases remain `complete` by presence.

The existing `state`, `missing`, `total` and `message` keys remain available;
the two directional fields are additive. A repository-wide consumer search
found no production caller depending on the old after-only meaning of
`missing` or the old exclusion from `total`. Existing consumers use the state
and message, and the changed panel also reads the new directional counts.
Before-only and paired wording is preserved. The mixed warning uses the full
observed-row denominator for each missing direction.

The original `compareBeforeAfter` selection, scoping, ambiguity handling,
numeric deltas, units, method-version compatibility and uncertainty verdicts
are unchanged. Presence completeness does not turn a `notComparable` row into
a comparable measurement. The correction retains after-only rows and values;
it neither invents a baseline nor changes stored measurements.

The eight added source cases cover these exact presence combinations:

| Case | Total | Missing before | Missing after | State |
| --- | ---: | ---: | ---: | --- |
| One after-only metric | 1 | 1 | 0 | partial |
| Several after-only metrics | 3 | 3 | 0 | partial |
| Paired and after-only | 2 | 1 | 0 | partial |
| One before-only metric | 1 | 0 | 1 | partial |
| Paired and before-only | 2 | 0 | 1 | partial |
| Missing values in both phases | 3 | 1 | 1 | partial |
| No observations | 0 | 0 | 0 | empty |
| All paired metrics | 2 | 0 | 0 | complete |

Those cases compare the full returned completeness object and preserve both
the input values and comparison rows. They call the original comparison
implementation rather than a duplicated helper.

### Actual screen, stepper and print paths

The actual Service screen loads native comparison inputs through
`app/service-api.js` and `buildComparison`, then passes the resulting object
to the actual `app/ui/workflows/service-job.js` panel. The native payload
shape and bridge arguments are unchanged.

The panel's new fixed guidance requests existing pre-repair measurements when
a baseline is missing and explicitly leaves an unavailable baseline
unavailable. It requests missing after tests when appropriate. The warning
and guidance pass through the existing escaping helper; measurement rows are
still rendered by the original table path.

The existing `stepperState` consumer keeps After at `todo` when comparison
presence is partial. The real screen summary feeds the live announcement
path with the same message. The existing job-sheet HTML consumer prints the
incomplete warning, and the registered job-sheet report kind carries it into
the original `composePrintable` pipeline.

Job status remains an independent policy. Ready/collected sheets remain
final, and this change invents no restriction on `testing` to `ready`.
The added integrated model/print case explicitly checks that distinction,
keeps the after-only row, and confirms that inputs are unchanged.

The two added actual-screen cases exercise the missing-baseline warning,
After badge, retained row and live summary, and a deferred mixed comparison
with an existing unsaved status-note element. The latter checks element
identity, value and focus, alongside both warning directions. The actual
late-comparison branch updates comparison evidence without replacing the
edited form. Both new screen cases check that the read path dispatches no
status or result-link mutation command.

### Selected coverage and limits

The six selected files were read completely. Independent expansion of their
literal test declarations and table/loop definitions yields 123 named cases.
Every case in each row passed in the sole authorized FIRST result:

| Selected original file | Source-derived cases |
| --- | ---: |
| `tests/service.test.mjs` | 34 |
| `tests/service-screen-lifecycle.test.mjs` | 34 |
| `tests/service-panel-lifecycle.test.mjs` | 28 |
| `tests/service-intake-lifecycle.test.mjs` | 12 |
| `tests/service-pii-leak.test.mjs` | 4 |
| `tests/crosslinks.test.mjs` | 11 |

Eleven cases are new: eight presence cases, one original model/print-pipeline
case and two actual-screen cases. Existing selected coverage includes
method/scoping regressions, asynchronous ownership, customer privacy and
export options. The screen fixture models DOM trees, focus and events; bridge
calls use controlled native seams. These boundaries cannot establish actual
browser layout, assistive-technology behavior, native database/filesystem
behavior, physical audio behavior or release-wide correctness.

The existing `crosslinks` selection contains a synthetic capture-span case.
Its limited inclusion does not repeat or qualify the held full audio suite.
The privacy source assertion is a static Rust/JavaScript boundary scan, not
execution of the native customer-storage implementation.

## FIRST evidence

Root separately authorized the exact functional command after all three
preliminary source dispositions and complete control/runtime review. This
lane also read all 361 recorder lines and the complete selection JSON as
source, and independently checked their bytes, selected source pins and the
runtime executable bytes without invoking Node.

The functional worker ran the six original files once, serially, using the
fixed absolute Node executable with `--test --test-concurrency=1
--test-reporter=tap`. The reviewed bound was SIGTERM at 55 seconds and a
60-second cap, with two separately specified 10-second runtime identity calls.
The project command exited 0 after **6.1885116869998456 seconds**, with no
timeout, termination event, recorder error or postflight error. The original
TAP plan is `1..123`: **123 pass, zero fail/cancel/skip/todo and zero suites**.
Project stderr and both identity-call stderr streams are empty. No project
command was rerun or added by this lane.

Independent standard-library data parsing matched every ordered case number,
name, subtest heading and outcome to the reviewed source-derived selection;
the eleven additions passed at cases 70, 71, 99 through 106, and 111. The
original TAP, derived ordered-outcome JSON and expected-name JSON agree.
No hidden failure, skip directive, bailout or additional TAP case was found.

Before/after full-source maps were rebuilt independently from immutable Git
objects and this lane's unchanged source working bytes/modes, then compared
with the original recorder data. Both equal the frozen compact-map identity
above. Tracked hashes, path inventories, all four top-level test inventories,
selected-file identities and the recorded clean HEAD/tree/ordered parents
agree. Runtime binary bytes and original version/runtime streams match the
reviewed Node `v24.22.3` identity; both external controls remained unchanged.
The binary is 126,951,512 bytes with SHA-256
`acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa`.

The original output directory is
`/workspace/scratch/6f2247f2f463/deckchek-service-comparison-round14-focused-raw`.
The functional worker retains all 24 original artifacts, totaling 2,751,321
bytes, under
[`evidence/service-comparison-functional-2026-11-21/focused`](evidence/service-comparison-functional-2026-11-21/focused).
This lane directly compared every original/retained byte pair and independently
recomputed every recorded size, SHA-256 and Git blob identity. Directory
inventories are exact, with no missing or additional retained artifact.

| Evidence | Bytes | Independently verified SHA-256 |
| --- | ---: | --- |
| Recorder `run-focused-node.py` | 22,063 | `d47b9cac247932c7fa16007ad18a0a6600b282549930b83d3733d5103670c7e7` |
| `authorized-selection.json` | 15,722 | `4b01ea66c0ca2cd86e989ae670bc0a7474b0f4d9b3eb84e852c70d3691a96bc9` |
| `run.tap` | 27,935 | `4e745c2947a5d9a72f3913cd7ed02c7db3bfd07f7119d9a3f5c60b4b44b6ba97` |
| `result.json` | 9,659 | `545c940c77ae4a55a6b3da82f6e0b1fd1f328f84e45e104e7e1a4f1a5aacb781` |
| `ordered-outcomes.json` | 17,236 | `ee97ff973f1a283202817ed70fb0777142d835b2353d7b58f1bd633e23d73830` |
| Each full-source before/after JSON | 628,360 | `7624fd5697970b4af41e4b65409cdc7c2776d529b2bd1f28a295d54df53d3df1` |
| [Manifest](evidence/service-comparison-functional-2026-11-21/manifest.json) | 11,366 | `47e9a9dd2f8504e07722c9b8d6be1d6dca42b8215f36f99c3389a9afc7c994e5` |
| [Custody record](evidence/service-comparison-functional-2026-11-21/custody-check.json) | 2,877 | `d8929bac60cee31c1960e1c30f3815878e7c8876fb42eeffd62d4edc2adcac16` |

The manifest's Git blob identity is
`bcd21e264a490f678620c1ae04a513afaca0118c`; the custody record's is
`7908692f2ca714e051ccfd4067ed984c33d8468a`. Their assertions were checked against
the original data, not adopted as a substitute for independent verification.

## Preserved holds and publication limits

The preceding backup candidate remains a static HOLD at
`d0b8992ce326e88bfe46d6135859744f83223527`. Its three final reports and root
[custody proof](evidence/backup-webview-static-hold-2026-11-21/root-source-proof.json)
are retained in this source. Their unresolved findings concern misleading
restore/reload promises, recovery access after restoring disabled backup
features, and the cached Devices unit writer in a partial restore session.
None is repaired or reclassified by Service #86. Native #85 remains open.

Qualified main stays `e36ddc41806b0f6639474f207e3b339e063a6e25` and the durable
Player checkpoint stays `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`.
The held full-source audio FIRST remains 2,420 total / 2,418 pass / one failure
/ one optional skip, including the unexplained -101 dB relative-gain result
at -30 dBFS; this review establishes no cause or repair. Fleet stays default-off
with no diagnostic rerun. No CI, publication, deployment, release, tag,
permission expansion, threshold weakening or separately billed model job
is authorized or performed by this lane.
