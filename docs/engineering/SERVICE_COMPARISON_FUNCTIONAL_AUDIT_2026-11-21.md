# Service comparison #86 — round 14 functional audit

## Disposition

**ACCEPT for the scoped Service comparison correction.** Source review found no
blocking functional defect in the correction. The separately authorized FIRST
focused gate passed **123 of 123 cases**, with no failure, cancellation, skip or
todo, project exit 0 and recorder exit 0. Its single project command took
**6.1885116869998456 seconds** and required no termination signal. This accepts
the reviewed JavaScript behavior and recorded seams; it does not qualify the
whole application or close native issue #85. [E1–E5]

The inherited backup webview static HOLD and original full-source audio HOLD
remain. This independent Service correction does not address either. Root owns
the separate backup correction, integration, future gates and publication.
This worker changed no production source or test. [S1, S7]

## Source and execution custody

| Item | Independently verified reviewed value |
| --- | --- |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-service-comparison-functional` |
| Branch | `review/deckchek-service-comparison-functional-20261121` |
| Frozen source commit | `36e968821fdcd61e2f43de22a09b811384eea8e0` |
| Frozen tree | `a5fc965e2f4151705d862e05b89e1cb06b0acdb2` |
| Sole source parent | `34d09f790bea68a6ce5555b60f97d20fd007dbb5` |
| Tracked paths / distinct immutable blobs | 2,464 / 2,229 |
| Summed tracked file bytes | 81,828,656 |
| Actual and tracked top-level test files | 205; identical inventories |
| State before and after the gate | Exact freeze, branch and parent; clean |

Every distinct immutable Git blob was read and its Git object ID independently
recomputed. Every tracked working file was compared byte-for-byte with that
blob, and its regular-file type and executable mode were checked against the
tree. The ordered array of `{path, mode, oid, bytes, sha256}` records in recursive
Git tree order, encoded with sorted JSON object keys and compact separators, has
SHA-256 `e16668214d8323f344c086b2eef5265a334d4a90851a78f7c40a8af4c22d5163`.
The complete check passed at review, in the recorder before and after the gate,
and independently again before evidence packaging. Identity coverage does not
claim semantic review of every repository file. [E3, E5]

The semantic review covered both changed production modules in full, both
changed test files in full, all six selected test files, the complete original
Service DOM fixture and actual screen, stepper, announcement and print callers.
The implementation/scope notes and all three completed backup webview audit
reports were read. Code, functional and security each supplied preliminary
source ACCEPT before root authorized the first command. [S1–S7]

Until that authorization, this lane ran only Git inspection and independent
Python standard-library data checks, and authored external unexecuted control
source. No Node identity invocation, project import, syntax check, test, build,
browser/native application, probe or extracted implementation ran beforehand.
Root read every control/configuration line and independently checked the exact
freeze, selection, source-derived names, runtime bytes and absent output path.
The subsequent authorization covered only two fixed Node identity calls and
one fixed six-file project command. There was no rerun or expanded gate. [E2, E3]

## Functional findings and acceptance reasoning

### Complete row denominator and directional gaps

The previous helper discarded `missingBefore` rows when calculating completeness.
Consequently, after-only observations could produce a complete comparison with
zero counted metrics, and a mixed paired/after-only set could also be called
complete. The corrected helper counts every comparison row, reports missing
before and missing after values separately, and makes either gap partial. The
existing empty and fully paired cases remain explicit. The original `missing`
field now totals both directions; no production consumer independently reads
that scalar. [S2]

The original row builder still chooses finite values by phase and test/metric
scope. It retains after-only observations and its existing unit/method
comparability rules. The correction does not fill in missing baselines, change
measurements or uncertainty, or reinterpret paired but incomparable evidence as
scientifically comparable. Completeness here describes phase presence. The
eight new presence cases check expected counts, states and text while also
checking that the input observations and derived rows remain unchanged. [S2, S4]

| New presence case | Expected result |
| --- | --- |
| One after-only metric | Partial; one missing before value; denominator one |
| Several after-only metrics | Partial; three missing before values; denominator three |
| Paired plus after-only | Partial; one missing before value across two rows |
| One before-only metric | Partial; one missing after value; denominator one |
| Paired plus before-only | Partial; one missing after value across two rows |
| Gaps in both phases | Partial; both directional gaps stated across three rows |
| No observations | Empty; zero rows and zero gaps |
| All paired metrics | Complete; two rows and no gaps |

### Actual screen, delayed updates and job-sheet behavior

The real comparison block now asks for existing pre-repair measurements when a
baseline is missing. It continues to ask for missing after tests when those are
also absent. This avoids suggesting that another after measurement can create
a pre-repair baseline. Guidance and the existing comparison message remain
escaped before insertion. [S3]

The real Service screen consumes the same completeness message in its After
summary and announcement. Its existing late-comparison path refreshes evidence
and the After badge without replacing unsaved controls. The two new screen
tests mount that original screen, retain exact input identity/value/focus during
a delayed mixed-phase update, and check the actual warning, guidance and open
After step. They check for unintended mutation commands and preserve the
comparison payload. They therefore exercise the user-facing consumer and
ownership boundary, beyond only asserting the helper's return shape. [S3, S4]

The new integrated model/print case checks that after-only observations remain
visible on the actual job sheet, the comparison stays partial and the After
step remains open. The existing printable kind composes that sheet through the
normal print-data path. Completed job status can still produce a final sheet
while its comparison warning remains visible; comparison completeness does not
change the existing job-status transition policy. That separation is intentional
and tested. Existing customer opt-in, escaping and suggested filename behavior
remain covered. [S2, S4, S6]

## Complete selected regression scope

The selected original sources contain **123 named cases**, derived before
execution, including exact loop order. All 123 original TAP names, sequential
numbers, subtest labels and outcomes match that inventory. The eleven additions
are the eight presence cases, the integrated model/print case and two actual
screen cases above. Their retained TAP case numbers are 70, 71, 99–106 and 111.
[E1, E2, E4]

| Exact selected file | Cases | Functional scope |
| --- | ---: | --- |
| `tests/crosslinks.test.mjs` | 11 | Feature-controlled routes, handoff, history and existing report/capture-span consumers |
| `tests/service-intake-lifecycle.test.mjs` | 12 | Customer lookup ownership, unit selection and retained input/create payload |
| `tests/service-panel-lifecycle.test.mjs` | 28 | Customer/job editors, links/photos, HTML/PDF ownership and current retry behavior |
| `tests/service-pii-leak.test.mjs` | 4 | Equipment/diagnostic export boundaries, customer opt-in and existing source boundary checks |
| `tests/service-screen-lifecycle.test.mjs` | 34 | Real Service load/delete/create/status/log/comparison navigation and unsaved-control preservation |
| `tests/service.test.mjs` | 34 | Comparison engine, stepper, statuses, totals, bridge contract and actual print composition |
| **Total** | **123** | **123 pass; zero fail/cancel/skip/todo** |

The original DOM fixture implements element identity, events, text, focus state,
memory storage and deterministic settling. It does not provide a real browser's
layout, accessibility tree or modal keyboard behavior. Native methods are
recorded in-memory dispatch seams; export callbacks do not establish actual
filesystem/dialog or PDF service operation. Photo decoding/canvas output is
stubbed. The PII source-boundary case reads repository source rather than
executing Rust. The existing final crosslinks case uses its original small
synthetic DSP input to check capture spans; this is not a live-audio or full
audio qualification. These limits remain part of the acceptance. [S4–S6]

## FIRST gate, bound and original evidence

The external recorder was adapted as readable source from the retained round-11
focused recorder. It pins the exact configuration bytes, six source identities,
Node binary and frozen source map. It refuses an existing original-output
directory, retains original stdout/stderr and identity-call streams, records
termination events and verifies full source bytes/modes and control/runtime
custody afterward. It also retains the complete ordered case outcomes. [E2, E3]

The fixed project budget was 60 seconds, with process-group SIGTERM scheduled
at 55 seconds and SIGKILL at 60 if necessary. Each Node identity call had its own
10-second bound. Source/control data checks were outside that project budget.
No signal was needed. The selection was justified from original source and
retained timing evidence before execution: all 112 pre-existing names match
passing cases in the original round-10 TAP, with a combined recorded case
duration of 1,168.534473 ms. That historic sum excludes process overhead and is
not a future wall-time guarantee; the 11 new cases had no prior measurement.
The earlier full gate remains failed. [E2, S7]

The exact authorized launcher was:

```text
python3 /workspace/scratch/6f2247f2f463/deckchek-service-comparison-round14-focused-recorder.py /workspace/scratch/6f2247f2f463/deckchek-service-comparison-round14-focused-selection.json
```

It ran from `/workspace/scratch/6f2247f2f463` with Bash `login:false`. The project
argv was the absolute Node path below, followed by `--test`,
`--test-concurrency=1`, `--test-reporter=tap` and the six files in the table's
order. No additional engine flags or diagnostic variables were introduced.
[E1–E3]

| Retained identity or result | Value |
| --- | --- |
| Project start / completion UTC | `2026-11-21T12:54:59.231355+00:00` / `2026-11-21T12:55:05.420245+00:00` |
| Project elapsed / TAP duration | 6.1885116869998456 s / 6073.208288 ms |
| Recorder / project exit | 0 / 0 |
| Original TAP | 27,935 bytes; SHA-256 `4e745c2947a5d9a72f3913cd7ed02c7db3bfd07f7119d9a3f5c60b4b44b6ba97` |
| Original stderr | 0 bytes; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Original result JSON | 9,659 bytes; SHA-256 `545c940c77ae4a55a6b3da82f6e0b1fd1f328f84e45e104e7e1a4f1a5aacb781` |
| Recorder | 22,063 bytes; SHA-256 `d47b9cac247932c7fa16007ad18a0a6600b282549930b83d3733d5103670c7e7` |
| Configuration and source case inventory | 15,722 bytes; SHA-256 `4b01ea66c0ca2cd86e989ae670bc0a7474b0f4d9b3eb84e852c70d3691a96bc9` |
| Ordered outcomes JSON | 17,236 bytes; SHA-256 `ee97ff973f1a283202817ed70fb0777142d835b2353d7b58f1bd633e23d73830` |
| Full source map, each retained formatted file | 628,360 bytes; SHA-256 `7624fd5697970b4af41e4b65409cdc7c2776d529b2bd1f28a295d54df53d3df1` |
| Node executable | `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`; v24.22.3; 126,951,512 bytes; SHA-256 `acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa` |
| Manifest | 11,366 bytes; SHA-256 `47e9a9dd2f8504e07722c9b8d6be1d6dca42b8215f36f99c3389a9afc7c994e5` |
| Independent custody check | 2,877 bytes; SHA-256 `d8929bac60cee31c1960e1c30f3815878e7c8876fb42eeffd62d4edc2adcac16` |

All **24 original artifacts**, totaling **2,751,321 bytes**, were copied unchanged
from `/workspace/scratch/6f2247f2f463/deckchek-service-comparison-round14-focused-raw`
to the retained `focused/` directory. The manifest binds each exact original
path to its retained path, byte length, SHA-256 and Git blob identity. The
independent custody check additionally binds the source, runtime, ordered case
inventory and original exits. Both control originals and the raw output remain
available. No first failure was discarded or replaced. [E3–E5]

## Preserved limits and final handoff

The original round-13 backup candidate remains an unexecuted static HOLD for
misleading restore confirmation, feature-dependent recovery reachability and
stale settings writers during a partial session. Native #85's application owner,
epoch/cache protocol, startup handoff and asynchronous shutdown barrier remain
unfinished. Neither those paths nor real browser/native behavior were qualified
by this Service run. [S1, S7]

The original full-source audio result remains 2,420 total / 2,418 passes / one
failure / one optional skip, including the retained case-53 final relative-gain
observation of -101 dB at -30 dBFS. Its cause and repair are not established by
this review. Qualified main stays `e36ddc41806b0f6639474f207e3b339e063a6e25`, and
the published Player checkpoint stays
`f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`. Fleet remains default off and its fixed
diagnostic was not rerun. No release, deployment, qualification merge, native
workaround, changed scientific threshold or credit-exhaustion claim follows.
[S1, S7]

This worker owns only this report and its separately authorized evidence folder.
The final commit must have the reviewed freeze as its sole parent, contain only
those additions and leave a clean worktree. Full final commit/tree/parent and
report byte/SHA-256/Git blob identities are supplied in the worker's FINAL
handoff rather than embedded recursively here. Root must finish consolidating
all three FINAL reports before a successor cohort starts. [S1]

## Source and evidence references

| Ref | Reviewed source or retained evidence |
| --- | --- |
| S1 | [Review scope](SERVICE_COMPARISON_REVIEW_SCOPE_2026-11-21.md) and [implementation note](SERVICE_COMPARISON_IMPLEMENTATION_2026-11-21.md). |
| S2 | `app/service.js`: original row construction at 174–266, completeness at 268–277, comparison assembly at 280–290, stepper at 319 onward, sheet model/render at 392 onward. |
| S3 | `app/ui/workflows/service-job.js`: comparison block at 430 onward and sheet consumer at 574. `app/ui/screens/service.js`: summary at 52, comparison loading at 221–255 and step announcement at 392. |
| S4 | `tests/service.test.mjs`: presence cases at 138–154 and integrated sheet case at 217–234. `tests/service-screen-lifecycle.test.mjs`: new actual-screen cases at 209–248. All six selected test files were read in full. |
| S5 | Complete `tests/fixtures/service-screen-dom.mjs`, `app/service-api.js`, `app/ui/live.js` and relevant original crosslinks callers. |
| S6 | `app/report-kinds/jobsheet.js`, original print-data/composition callers and selected panel/PII/crosslinks fixtures. |
| S7 | [Backup code audit](BACKUP_SETTINGS_WEBVIEW_CODE_AUDIT_2026-11-21.md), [functional audit](BACKUP_SETTINGS_WEBVIEW_FUNCTIONAL_AUDIT_2026-11-21.md), [security audit](BACKUP_SETTINGS_WEBVIEW_SECURITY_AUDIT_2026-11-21.md), and original `evidence/link-consent-functional-2026-11-21/full/run.tap` / `result.json`. |
| E1 | [Original TAP copy](evidence/service-comparison-functional-2026-11-21/focused/run.tap), [original result copy](evidence/service-comparison-functional-2026-11-21/focused/result.json) and [stderr copy](evidence/service-comparison-functional-2026-11-21/focused/stderr.log). |
| E2 | [Exact configuration and ordered source names](evidence/service-comparison-functional-2026-11-21/focused/authorized-selection.json) and [reviewed recorder copy](evidence/service-comparison-functional-2026-11-21/focused/run-focused-node.py). |
| E3 | [Independent custody check](evidence/service-comparison-functional-2026-11-21/custody-check.json), [before source map](evidence/service-comparison-functional-2026-11-21/focused/full-source-before.json), [after source map](evidence/service-comparison-functional-2026-11-21/focused/full-source-after.json), retained inventories and runtime streams. |
| E4 | [Expected case names](evidence/service-comparison-functional-2026-11-21/focused/expected-case-names.json) and [original ordered outcomes](evidence/service-comparison-functional-2026-11-21/focused/ordered-outcomes.json). |
| E5 | [Evidence manifest with every original-path binding](evidence/service-comparison-functional-2026-11-21/manifest.json). |
