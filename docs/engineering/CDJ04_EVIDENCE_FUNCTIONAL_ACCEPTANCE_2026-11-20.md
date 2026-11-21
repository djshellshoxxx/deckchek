# CDJ-04 evidence envelope — fresh functional acceptance, 20 November 2026

## Decision

**Accepted for integration within the provisional evidence-record scope.** An independent worker ran the existing focused checks once on the exact combined source below. All **21 tests passed**, with no failures, skips, cancellations or todo cases. The two ordinary regressions now enforce rejection of incomplete reference lists and explicit reasons for unknown uncertainty. Existing transport cases preserve the unverified record boundary.

This is functional acceptance of the isolated JavaScript contract, not qualification of a production player diagnostic. The module remains unwired to capture, SQLite, history, UI and report export. This report does not grant report eligibility, authenticate evidence or establish scientific/hardware validity.

The report date uses America/Los_Angeles. The execution timestamps are retained in UTC.

## Frozen source and independence

| Item | Identity |
| --- | --- |
| Accepted source | `25b65d6821ec40766b8cae855699c70ea7672770` |
| Accepted tree | `0305261c09b33c6f29250a9c313484e3dea0f397` |
| Worktree branch | `review/deckchek-evidence-functional-acceptance-20261120` |
| Author's corrected code/test commit | `9e282b1fa8f031f2f53a7d346e00a4a12a11e884` |
| Author's subsequent report/evidence commit | `262a0e3c4b69e5995c93162d64e965aeb025f120` |
| Retained original PR #61 | `20e0fd3202ca74f11404ca3e53735b5b5bc2364f` |

The combined source includes the three completed first-round audit reports and merged Ledger main `8b4c7d235ba2ccf9212fa5b5b18d56e697e42fb8`. This reviewer did not author the correction or change any application/test file. The acceptance remains pinned to the source above regardless of later remote or documentation changes.

| File | Independently checked SHA-256 |
| --- | --- |
| `app/player/evidence-record.js` | `52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207` |
| `tests/cdj-evidence-record.test.mjs` | `34021a157c944f98abe8a706d1afdbf47fad0c2541e4b654b7133d29279638ab` |
| `app/player/pitch-display.js` | `040a0703f8d68cecedae43616b977378f11baf5f6ac8e18be487e1bd85262988` |
| `tests/cdj-pitch-display.test.mjs` | `acdea851530a2471f3e9823a9aebd587b3f24225a93674778409cf05a2a2141f` |

The evidence module/test hashes match the correction author's frozen files. The unchanged pitch helper and its eleven tests were included as the requested compatibility scope, not re-audited as new implementation.

## Execution and result

Runtime: **Node v22.23.4**. Command, run from the acceptance worktree:

```sh
/workspace/scratch/6f2247f2f463/toolchain/node_modules/node-linux-x64/bin/node --test tests/cdj-evidence-record.test.mjs tests/cdj-pitch-display.test.mjs
```

| Observation | Result |
| --- | --- |
| Execution started | `2026-11-21T02:42:37.743703+00:00` |
| Execution completed | `2026-11-21T02:42:37.935338+00:00` |
| Focused scope | Ten evidence cases plus eleven calculation cases |
| Result | 21 passed; zero failed/skipped/cancelled/todo; exit 0 |
| TAP duration | 107.835942 ms |
| Enclosing process duration | 0.191611824 seconds |
| Tracked-file integrity | All 1,590 SHA-256 hashes identical before and after |
| Git integrity | HEAD/tree unchanged; clean before and after execution |

The TAP duration is Node's reported test-run duration. The enclosing duration measures the launched process with a monotonic clock; it is not a performance gate. The environment's existing experimental warning is retained in the raw log. No test was rerun, weakened or skipped for this acceptance.

## Findings accepted within this scope

| Prior finding | Acceptance evidence and limit |
| --- | --- |
| Functional F1 / code P1: incomplete references break JSON transport | The regression visits all five reference-list fields. Normal dense lists survive serialization/import and later edits to the original input do not change the normalized record. Missing slots throw during creation. The corrected loop visits every index and copies accepted descriptor values into a new array. |
| Functional F2 / code P2: a named method hides null uncertainty | Both an omitted magnitude and an explicitly null magnitude retain null and acquire `uncertainty_unknown`. JSON transport preserves the result. A supplied positive magnitude does not acquire the missing-magnitude reason. Eligibility remains false and measurement null. |
| Functional F3 / code S1: schema read occurs before snapshot | Source inspection confirms the serializer snapshots first, inspects that snapshot's schema, and passes it into normalization. Existing successful transport/schema cases pass. Detailed defensive source acceptance belongs to the separate fresh security reviewer; no new accessor, proxy or custom-dispatch probe was authored or run. |
| Unchanged provisional qualification | Existing empty records, populated records, records with unknown metadata, and transport cases retain caller-supplied provenance, fixed units, unverified status, false eligibility and null measurement. Supplied report/score claims are reconstructed away by import. |

The original [functional audit](CDJ04_EVIDENCE_FUNCTIONAL_AUDIT_2026-11-20.md), [code audit](CDJ04_EVIDENCE_CODE_AUDIT_2026-11-20.md) and [defensive audit](CDJ04_EVIDENCE_SECURITY_AUDIT_2026-11-20.md) remain historical reviews of the original source. Their changes-requested verdicts are not rewritten by this acceptance.

## Retained evidence and non-additive results

The original author records remain under `evidence/cdj04-evidence-functional-2026-11-20/`: the unchanged original tests passed 19/19, the original implementation with the two added regressions recorded **19 passed / 2 failed**, and the corrected author run passed 21/21. This independent 21/21 result is a separate execution of overlapping tests; these counts must not be added together.

Fresh artifacts are in [evidence/cdj04-evidence-acceptance-2026-11-20](evidence/cdj04-evidence-acceptance-2026-11-20/):

- [Raw TAP](evidence/cdj04-evidence-acceptance-2026-11-20/independent-focused.tap), SHA-256 `bd99a5b9dd939b214f2b9eaac540ea55090985797c45a38fc646060220c45a6f`.
- [Execution record](evidence/cdj04-evidence-acceptance-2026-11-20/independent-focused.json), containing command, runtime, exact source, timestamps, counts, durations and integrity checks.
- [Before manifest](evidence/cdj04-evidence-acceptance-2026-11-20/tracked-before.json) and [after manifest](evidence/cdj04-evidence-acceptance-2026-11-20/tracked-after.json), each containing all 1,590 tracked file hashes. Both have SHA-256 `97b626cd4f4e5a16664e9987b7829519370b4ced66919b8e8293656c1ec3c042`.
- [Artifact hash index](evidence/cdj04-evidence-acceptance-2026-11-20/artifact-sha256.json), recording byte counts and SHA-256 for the four artifacts above.

## Limits and handoff

No new application or test source was created. No full repository suite, native build, browser workflow, database/HTML round trip, remote probe or hardware test was performed. The existing focused tests were executed as supplied; no new adversarial cases or exploit reproduction was introduced. No dependency installation or remote write was made.

The source's reasons are still not a complete acquisition/readiness checklist. Run identity, reference hashes, capture metadata, processing settings, quality flags and uncertainty values remain supplied assertions. The lower-priority signed-zero normalization question in the author's report remains outside the declared provisional schema's physical semantics. Capture-owned provenance, actual evidence bytes, persistence/export adapters, comparison compatibility, full SPEC-19 uncertainty metadata, characterized references and two-player hardware validation remain open.

Root may integrate this report/evidence as a documentation-only child of the frozen source, alongside the separate fresh code and defensive acceptance reports. Applicable exact-source hosted checks still govern merge. Preserve old source/failure evidence, the accepted numerical-helper scope, Fleet default-off and all existing security, archive, permission and performance limits.
