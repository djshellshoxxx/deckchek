# Service comparison — round 14 defensive security audit

## Disposition and boundary

**FINAL — scoped source and retained FIRST evidence ACCEPT.** No new
security blocker was found in the missing-baseline correction for Service #86.
This report does not accept the complete source tree, clear the inherited
backup or audio holds, or establish browser/native/hardware qualification.
The preliminary source disposition was sent to root before any authorized
functional FIRST result was supplied to this reviewer.

This security lane performed static source review and independent standard-library
Python byte/JSON/TAP/Git checks only. It did not invoke Node, import project code,
run tests or syntax/build commands, launch a browser/native application, run a
scanner/probe, execute an extracted implementation or reproduce a vulnerability.
The reviewer owns this report only; implementation, execution authorization,
integration and publication remain with root and the assigned functional lane.

## Immutable source custody

| Identity | Independently verified value |
| --- | --- |
| Freeze | `36e968821fdcd61e2f43de22a09b811384eea8e0` |
| Tree | `a5fc965e2f4151705d862e05b89e1cb06b0acdb2` |
| Ordered parents | Sole parent `34d09f790bea68a6ce5555b60f97d20fd007dbb5` |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-service-comparison-security` |
| Branch | `review/deckchek-service-comparison-security-20261121` |
| Original inventory | 2,464 tracked paths; 2,229 distinct blobs; 81,828,656 summed bytes |
| Top-level tests | 205 tracked files, exactly matching the actual directory inventory |
| Compact ordered source-map SHA-256 | `e16668214d8323f344c086b2eef5265a334d4a90851a78f7c40a8af4c22d5163` |

The initial and pre-report worktrees were clean. Each distinct immutable blob's
Git SHA-1 was independently recomputed, then every original working path's
bytes and Git-relevant file mode were compared with that blob. The identity
map contains path, mode, object ID, byte count and SHA-256 in `git ls-tree -rz`
order, encoded with sorted JSON keys and compact separators. No tracked source
or test was modified. There is no tracked `AGENTS.md` in this freeze.

The parent-to-freeze diff contains two production modules, two test files, four
current status documents, the implementation/scope notes and the preserved
backup custody proof. It changes no native code, IPC command, schema,
dependency, permission, feature default, audio calculation, Mobile asset or CI
definition.

## Source reviewed and findings

The complete changed production modules `app/service.js` and
`app/ui/workflows/service-job.js`, both changed test files, all six proposed
test files and the original `tests/fixtures/service-screen-dom.mjs` fixture were
read. Consumer review covered the actual Service screen, stepper, live
announcement helper, Service API, DOM escaping, job-sheet printable kind,
print composition and the applicable workspace/browser diagnostics export
paths. Implementation/scope notes and all three preceding backup audit reports
were read in full.

### Missing observations remain missing

`comparisonCompleteness` includes every comparison row in the denominator and
counts `missingBefore` and `missingAfter` separately. The aggregate `missing`
count and partial state now represent either absent phase. This helper reads
rows without mutating observations or synthesizing a before value. Its new
message consists of counts and fixed vocabulary, with no added customer or
measurement free text.

The actual comparison engine still retains an after-only row with no before
value. Method/unit comparability, uncertainty and measurement verdicts remain
separate from the presence of both phases. A `complete` presence result does
not certify compatible methods, a calibrated measurement or a successful
repair. Existing empty, paired and before-only behavior is preserved by the
scoped correction.

The panel's baseline guidance asks for existing pre-repair records where
available and says missing baselines remain unavailable. It does not instruct
the user to collect a new measurement and call it historical. The mixed case
adds the existing request for missing after tests. These strings are fixed
application text selected by directional counts.

### Screen, announcement and print sinks preserve escaping

`comparisonBlock` applies the existing `esc` helper to both the completeness
message and guidance before inserting its fixed warning markup. That helper
escapes ampersands, angle brackets and both quote characters. Other comparison
labels and units continue through text nodes or their existing escaped paths.

The real screen's comparison summary passes through `announce`, whose live
region uses `textContent`. The After step continues to derive its todo state
and reason from the existing partial-comparison branch. The asynchronous
comparison response retains current-view/sequence ownership guards and the
existing comparison-only refresh when edits or actions are pending.

`renderJobSheetHtml` escapes the completeness warning. The actual job-sheet
printable kind passes the report composer's `esc` function to this renderer;
`composePrintable` also escapes its own title, device and summary fields.
The warning therefore reaches the existing HTML and printable report paths
without adding a new untrusted-markup sink. Script removal in the unchanged
print composer is not treated as a general sanitizer or a substitute for
these source-level escaping obligations.

### Privacy and authority are unchanged

The correction adds no persistence, network call or native command. Customer
name/phone/email remain an explicit job-sheet opt-in. `jobSheetModel` omits
the customer by default, the actual sheet checkbox starts unchecked, and the
print path captures its options before asynchronous export preparation. File
names continue to derive from the unit/job representation, not a newly added
customer field.

Service search/customer state remains in memory; `listPrefsForSettings`
persists only the status filter. The existing workspace serializer carries
equipment and runs, while browser diagnostics receive the existing minimized
Service preferences. Those functions are unchanged: this review does not
claim they universally remove arbitrary personal data supplied in unrelated
free-text fields or qualify the native backend's privacy behavior.

Job transitions and the ready/collected final-sheet policy remain independent
of completeness. The correction neither creates a finalization guarantee nor
weakens or adds a transition check. The existing indicative-measurements
disclaimer remains in the sheet. No new native/default/permission surface was
introduced.

## Regression selection and evidence limits

The exact reviewed and authorized selection, in invocation order, was:

| Original test file | Ordered cases |
| --- | ---: |
| `tests/crosslinks.test.mjs` | 11 |
| `tests/service-intake-lifecycle.test.mjs` | 12 |
| `tests/service-panel-lifecycle.test.mjs` | 28 |
| `tests/service-pii-leak.test.mjs` | 4 |
| `tests/service-screen-lifecycle.test.mjs` | 34 |
| `tests/service.test.mjs` | 34 |
| Total | 123 |

The eleven new cases comprise eight observation-presence combinations, an
actual model/stepper/HTML/print-composition case, and two real Service screen
cases. Source assertions preserve after-only rows and input data, distinguish
directional gaps, preserve independent finalization, check announcements and
guidance, and retain an unsaved status-note element/value/focus across a delayed
mixed comparison without issuing mutation commands.

The unchanged privacy cases cover seeded customer data, workspace/browser
bundle composition and explicit job-sheet inclusion. Their in-memory native
bridge is an observation seam, not a native database or platform test. The
original minimal DOM fixture exercises production screen ownership and element
identity but is not a real HTML parser, browser layout/accessibility engine or
native dialog. The selected synthetic crosslink measurements do not qualify
physical audio behavior.

Root separately authorized the functional worker's one FIRST serial six-file
TAP command after the preliminary reviews. Before that outcome, this reviewer
read all 361 lines of the external recorder and the complete selection JSON,
then independently matched their bytes, the six selected source pins and the
runtime binary. The recorder rejected an existing output directory, pinned the
source/selection, retained original streams and bounded the selected test
process with TERM after 55 seconds and a 60-second cap. Its two runtime identity
calls each had a 10-second limit. No rerun or broader gate was authorized.

| FIRST retained observation | Independently checked result |
| --- | --- |
| Outcome | 123 total / 123 pass / 0 failures, cancellations, skips or todos |
| Process | Exit 0; no timeout or termination event |
| Elapsed test command | 6.1885116869998456 seconds |
| TAP duration | 6,073.208288 ms |
| Runtime | Node `v24.22.3`, Linux x64, absolute runtime path |
| Original stdout | 27,935 bytes; SHA-256 `4e745c2947a5d9a72f3913cd7ed02c7db3bfd07f7119d9a3f5c60b4b44b6ba97` |
| Original stderr | 0 bytes; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Recorder | 22,063 bytes; SHA-256 `d47b9cac247932c7fa16007ad18a0a6600b282549930b83d3733d5103670c7e7` |
| Selection | 15,722 bytes; SHA-256 `4b01ea66c0ca2cd86e989ae670bc0a7474b0f4d9b3eb84e852c70d3691a96bc9` |
| Runtime executable | 126,951,512 bytes; SHA-256 `acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa` |

The originals remain in
`/workspace/scratch/6f2247f2f463/deckchek-service-comparison-round14-focused-raw/`.
This reviewer read the full original TAP and result, independently parsed all
123 case names/numbers/outcomes and subtest labels, checked the `1..123` plan,
all count fields, durations and absence of skip/todo/bailout records, and
compared the ordered data with the reviewed selection and retained JSON.
The eleven new cases passed, including the two actual-screen cases at positions
70/71, eight presence cases at 99–106 and integrated print case at 111.

Both full source maps were independently reconstructed from immutable Git
blobs and compared with every retained entry, the before/after hash maps,
ordered inventories, Git modes and actual original files in both reviewer and
functional worktrees. All 2,464 original paths and 205 test files matched; the
recorded pre/post HEAD/tree/parents were exact and both statuses empty. The
retained runtime identity streams matched their byte hashes and declared
Node version/path, while the executable and external recorder/configuration
copies matched their original bytes before and after. The recorded execution
environment had no prohibited Node options or audio/corpus variables, no
recorder/postflight error and no changed source path.

The functional lane retained all 24 originals under
`docs/engineering/evidence/service-comparison-functional-2026-11-21/focused/`.
This reviewer independently checked every original-to-retained path binding,
byte equality, byte count, SHA-256 and Git blob identity; the copies sum to
2,751,321 bytes and have no omitted or extra original file. The retained
`manifest.json` is 11,366 bytes, SHA-256
`47e9a9dd2f8504e07722c9b8d6be1d6dca42b8215f36f99c3389a9afc7c994e5`,
Git blob `bcd21e264a490f678620c1ae04a513afaca0118c`.
Its separately bound `custody-check.json` is 2,877 bytes, SHA-256
`d8929bac60cee31c1960e1c30f3815878e7c8876fb42eeffd62d4edc2adcac16`,
Git blob `7908692f2ca714e051ccfd4067ed984c33d8468a`.
Those functional-owned files are read as evidence, not copied into or executed
by this report-only security branch.

## Inherited holds and final handoff limits

All three preceding backup FINAL reports were independently byte-checked
against their original sole-report commits and the root custody proof:

| Lane | Original FINAL commit | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Code | `f0d1801ad8be6d4b8c91da0fd4f584dac282e812` | 11,101 | `0a4650f545d239d3717f4cdfc722b0a35ccfc06c526fee69c942feaf57fdcf45` |
| Functional | `02a5c8992907d84269813dbdac9cccd3246b20e1` | 14,492 | `c2232a728e6997830e803b8b03128f08a041d591f2b5aa64cd1ea7ecb7631106` |
| Security | `68cb875dc4486925a572ab35a4d9b1849fdfcdf7` | 10,865 | `ce75442d5e5c734f0e4eec3824a2c9209da845eaff1ccfc32ce4780608773136` |

Each has sole parent `d0b8992ce326e88bfe46d6135859744f83223527`; its
working-tree copy matches its original committed bytes. Their static HOLD
remains: backup partial recovery can be unreachable when restored flags hide
Data, retained Devices preferences can overwrite restored assignments, and
confirmation copy overstates failure/reload behavior. Root's separate recovery
correction is outside this Service freeze. Native #85 owner/cache/startup/exit
work remains open.

Complete-source qualification remains HELD by the retained first audio result:
2,420 total, 2,418 pass, one failure and one optional skip, including the
unexplained -101 dB observation for -30 dBFS. This lane did not rerun or alter it.
Fleet remains default-off and its fixed diagnostic is not rerun. Qualified
main remains `e36ddc41806b0f6639474f207e3b339e063a6e25`; the held durable
Player checkpoint remains `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`.
Service #86 remains open pending qualified integration.

No release/deployment, CI, publication, permission expansion, threshold change,
history rewrite, native/browser workaround or credit-exhaustion result is
claimed. This lane's FINAL handoff is restricted to this one report, with the
assigned freeze as its sole commit parent. The final commit/tree/report
identities and clean-worktree check are supplied separately to root.
