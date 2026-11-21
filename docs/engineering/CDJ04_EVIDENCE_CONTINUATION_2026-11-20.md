# CDJ-04 evidence continuation and consolidation — 20 November 2026

Dates in this report use America/Los_Angeles; machine execution and hosted-job records retain UTC. This checkpoint completes two sets of three workers and preserves the separately qualified Ledger and CDJ calculation merges. The evidence record remains a provisional offline contract. Capture, persistence, UI and scientific validation are still unfinished.

## Resulting behavior

The new evidence envelope introduced in PRs #60/#61 retains player identity, source and capture metadata, processing, entered pitch, analysis method/units, uncertainty and nullable quality assertions. Three corrections now make its existing contract consistent:

| Finding | Corrected behavior |
| --- | --- |
| A sparse reference list could be created but fail after JSON export/import | Every consumed position must contain an own data value; accepted strings are copied into an ordinary dense array. All five reference-list consumers share the correction. |
| Serialization read the schema before validating its input | The top-level record is validated and snapshotted before schema inspection, then that snapshot is normalized. |
| A named uncertainty method could accompany an unknown magnitude without an explanatory reason | Omitted/null magnitude stays null and independently adds `uncertainty_unknown`, including after transport. |

All normalized records retain `status: 'unverified'`, `eligibleForReport: false`, and `measurement: null`. Supplied flags, hashes, evidence IDs and timestamps remain assertions. No actual reference bytes are read or authenticated. Own-data normalization is an ordinary data contract, not a JavaScript sandbox.

Only `app/player/evidence-record.js` and its isolated test file change relative to PR #61. The accepted numerical helper, capture bridge, native code, database, UI, workflows, limits and feature defaults remain unchanged.

## Source identities and ancestry

| Role | Commit / tree |
| --- | --- |
| Original evidence/provenance candidate, PR #61 | `20e0fd3202ca74f11404ca3e53735b5b5bc2364f` / `c869db493a53227309201f0807385622a9b3f12d` |
| Correction author | `9e282b1fa8f031f2f53a7d346e00a4a12a11e884` / `ea5a70d72ba204d9f399eb8c54b7dca3bc9d3d6f` |
| Frozen combined source independently reviewed/executed | `25b65d6821ec40766b8cae855699c70ea7672770` / `0305261c09b33c6f29250a9c313484e3dea0f397` |
| Durable equivalent source | `2be82734281c76bf55c867b814fc2b0bc96e7201` / `0305261c09b33c6f29250a9c313484e3dea0f397` |

The [durable source](https://github.com/djshellshoxxx/deckchek/commit/2be82734281c76bf55c867b814fc2b0bc96e7201) was fetched independently and compared against the whole frozen tree with no differences. Published PR #61 and merged Ledger main `8b4c7d2` are explicit parents; PR #60 and the earlier #59/#58 stack remain ancestors. The original branches and published source heads are preserved.

The later fresh acceptance reports, raw evidence copies and current status corrections form a documentation-only overlay. Merging the subsequently qualified #59 main into the local continuation changed no file. The successor branch is `integration/deckchek-evidence-continuation-20261120`, targeting `main`. Its final published head requires its own applicable hosted gates; neither this source object nor earlier CI is a substitute.

## Completed worker handoffs

The complete first worker set finished before three different workers received the frozen combined source.

| Stage | Result |
| --- | --- |
| Initial code audit | [Standards S1 and Spec P1/P2](CDJ04_EVIDENCE_CODE_AUDIT_2026-11-20.md) requested corrections to the original source. |
| Initial functional audit and correction | [Author report](CDJ04_EVIDENCE_FUNCTIONAL_AUDIT_2026-11-20.md) retains the original pass, new failing regressions and corrected pass separately. |
| Initial defensive source audit | [EVID-SEC-01/02/03](CDJ04_EVIDENCE_SECURITY_AUDIT_2026-11-20.md) records the original boundary and traceability defects without accepting later code. |
| Fresh code acceptance | [Accepted](CDJ04_EVIDENCE_CODE_ACCEPTANCE_2026-11-20.md); all three scoped requirements resolved, no remaining Standards/Spec blocker. |
| Fresh functional acceptance | [Accepted](CDJ04_EVIDENCE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md); independent 21/21 execution at the exact combined source. |
| Fresh defensive acceptance | [Accepted](CDJ04_EVIDENCE_SECURITY_ACCEPTANCE_2026-11-20.md); EVID-SEC-01/02/03 closed within the provisional contract, with scientific and integration limits retained. |

Security reviewers performed static defensive review only. The serializer ordering and supplied-array dispatch changes were reviewed in source; no new adversarial runtime probe was added. The ordinary sparse-list and missing-uncertainty regressions provide the functional red/green evidence.

## Verification and limits

All four focused executions below used Node **22.23.4**.

| Execution | Result |
| --- | --- |
| Original #61, unchanged eight evidence and eleven calculation tests | 19 passed / zero failed; all 1,578 tracked hashes unchanged. |
| Original implementation with the two new ordinary regressions | 19 passed / 2 failed, exit 1; original implementation and new test hashes pinned. |
| Corrected author source, same regression set | 21 passed / zero failed; all 1,578 tracked hashes unchanged. |
| Fresh independent combined source | 21 passed / zero failed / zero skipped or cancelled; all 1,590 tracked hashes unchanged and checkout clean. |

The counts overlap and must not be added. The independent scope is ten evidence cases plus eleven unchanged calculation cases. Its TAP duration was **107.835942 ms**, enclosing execution **0.191611824 s**. The author also passed both changed-file syntax checks.

Corrected module SHA-256: `52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207`.
Corrected test SHA-256: `34021a157c944f98abe8a706d1afdbf47fad0c2541e4b654b7133d29279638ab`.
Independent TAP SHA-256: `bd99a5b9dd939b214f2b9eaac540ea55090985797c45a38fc646060220c45a6f`.

The [author evidence directory](evidence/cdj04-evidence-functional-2026-11-20/) retains original, red and corrected TAP, execution records and complete hash manifests. The [fresh execution record](evidence/cdj04-evidence-acceptance-2026-11-20/independent-focused.json) and [raw TAP](evidence/cdj04-evidence-acceptance-2026-11-20/independent-focused.tap) remain separate. Two whitespace-only lines in the original failing assertion output are preserved as raw evidence; only raw TAP files are excluded from the documentation whitespace check.

No local full suite was repeated for this isolated, unconsumed module or the documentation overlay. Earlier Ledger 2,222/0/1 and calculation 11/11 results retain their own source identities. This candidate still needs standard, nightly and desktop checks at its own final head. JSON round trips do not establish database or HTML export round trips, physical capture correctness or measurement validity. The previously noted signed-zero normalization question remains documented; no physical sign-of-zero meaning has been declared by this provisional schema.

## Consolidation completed during this continuation

| PR | Tested head | Merge commit | Verified merged tree |
| --- | --- | --- | --- |
| [#58 — Ledger consolidation](https://github.com/djshellshoxxx/deckchek/pull/58) | `eba46183fecd9d698515411865e710021dcba632` | `8b4c7d235ba2ccf9212fa5b5b18d56e697e42fb8` | `f0313256f4c9e20ede6d63b73d7c3a423ec63bb1` |
| [#59 — CDJ calculation](https://github.com/djshellshoxxx/deckchek/pull/59) | `3118321ee23393bfe37c3cc8e11aeb84490cbd40` | `cfb1137d3d01ddd4a9fd0677113314dc7deb76ee` | `35e18617eb20902048cb0baf065a0d6e98c4bda6` |

Both PRs passed all applicable standard and nightly jobs, all six desktop builds and all five packaged smoke jobs before their guarded merges. Only tag-only release jobs were skipped. Each actual merged tree was read back and matched its qualified candidate exactly. #59 was retargeted to main after #58 merged; the main-plus-candidate merge tree remained identical. Main at this checkpoint is `cfb1137d3d01ddd4a9fd0677113314dc7deb76ee`; #54 had already merged before this foreground continuation.

The [machine-readable hosted/merge evidence](evidence/cdj04-evidence-integration-2026-11-20/hosted-merged-58-59.json) includes job IDs, workflow URLs, heads, conclusions and merge parents. Original PR #47's 200.055967 ms result against the unchanged 200 ms Fleet gate and its unknown cause remain historical evidence. The later #58/#59 nightly passes qualify their own sources; they do not establish a cause for that earlier failure. The separate Fleet diagnostic branch remains outside this candidate.

PRs #60/#61 are input candidates to this successor, not additional independent implementations. Close them as superseded only after the successor branch/PR is durably published and both original heads are verified ancestors. Preserve their branches and original reports. Publication and a merge are distinct steps.

## Corrected project status and next useful work

Existing-unit device-profile assignment is already implemented in both the browser catalog and native `device_profile_assign` command, registered by `src-tauri/src/lib.rs`. Its implementation and regressions were consolidated through PR #34; the [earlier consolidation report](CONSOLIDATION_ZIP_DEVICES_2026-11-19.md) records that scope. The current status documents now distinguish this explicit, confirmed association from still-unqualified physical device identity and hot-plug continuity. Historical source40/source41 snapshots remain historical.

Continue on a separately owned successor while the new published head qualifies:

1. Define capture-owned CDJ acquisition and its versioned scientific metadata. Bind run identity, actual input pairs, device/backend, sample rate, observed duration and interruptions to the capture result. Preserve genuinely unknown gain, firmware, processing and timebase details. The existing native payload has `sampleRate`, samples, pairs and stream errors; copying operator labels into `sampleRateHz` is not an acquisition proof.
2. Bind reference identity to actual retained bytes and establish a durable raw-evidence owner before creating resolvable evidence references. Keep failures, missing evidence and untested sections explicit. A caller-supplied true flag must never qualify a report.
3. Implement actual SQLite/history and HTML report round trips with stable identities and faithful uncertainty/exclusion metadata. Current `runId`/`observedAt` and History's type-prefixed ID/`startedAt` need an explicit adapter. Existing JSON transport is only the prerequisite.
4. Complete wrong-reference, clipping, unstable-tone and interruption fixtures, method compatibility and the full SPEC-19 uncertainty model. Independently characterize the reference/estimator and repeat physical runs on at least two player models before claiming CDJ calibration validation.

These are incomplete workflow requirements, not hidden acceptance of production wiring. The six fresh/initial workers in this continuation are complete; their findings and limits pass to a new worker set. Retain original failures, branches, Fleet default-off, owner/hardware gates, the archive cap, permissions and all performance/security thresholds. No release, deployment, tag or history rewrite is part of this checkpoint. The existing scheduled continuation remains the recurring owner between foreground sessions. Credit balance is unavailable; queue, compiler, disk or transport failures do not establish exhaustion.
