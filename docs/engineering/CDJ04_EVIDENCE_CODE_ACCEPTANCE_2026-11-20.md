# CDJ-04 evidence envelope — independent code acceptance, 20 November 2026

## Decision and source boundary

**Accepted for integration within the provisional evidence contract.** The three correction requirements in the original code audit are resolved at the pinned combined source below. No additional blocking finding was identified in the changed module or regression definitions. This is a fresh source review; it is not an execution result, hosted qualification, production CDJ workflow acceptance, or scientific/hardware validation.

| Role | Exact identity |
| --- | --- |
| Original reviewed PR #61 | `20e0fd3202ca74f11404ca3e53735b5b5bc2364f`, tree `c869db493a53227309201f0807385622a9b3f12d` |
| Author's corrected implementation and tests | `9e282b1fa8f031f2f53a7d346e00a4a12a11e884`, tree `ea5a70d72ba204d9f399eb8c54b7dca3bc9d3d6f` |
| Independently reviewed combined source | `25b65d6821ec40766b8cae855699c70ea7672770`, tree `0305261c09b33c6f29250a9c313484e3dea0f397` |
| Included merged main | `8b4c7d235ba2ccf9212fa5b5b18d56e697e42fb8` |
| Review branch | `review/deckchek-evidence-code-acceptance-20261120` |

The original PR #61 and the included main commit are verified ancestors of the pinned source. The complete difference from the author's corrected commit consists of 12 documentation/evidence paths under `docs/engineering/`; application and test bytes are unchanged. The initial worktree was clean. This report is the only file authored by this reviewer and is a later documentation overlay.

| File | Git blob at reviewed source | Independently computed SHA-256 |
| --- | --- | --- |
| `app/player/evidence-record.js` | `50cefb649167902200c2a6b91565016420ab7b82` | `52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207` |
| `tests/cdj-evidence-record.test.mjs` | `70fc86f49c1e40c92c7f041326019b08f7485b13` | `34021a157c944f98abe8a706d1afdbf47fad0c2541e4b654b7133d29279638ab` |

Both files were compared byte for byte with the author's corrected commit. Review commands included `git diff 20e0fd3202ca74f11404ca3e53735b5b5bc2364f...HEAD` and the corresponding commit list, with the code/test hunks inspected separately from retained reports and raw logs.

## Standards

The review applies the Engineering Suite code-review skill's separate Standards and Spec axes. The supplied fixed point, findings and SPEC-10/SPEC-19 files establish the task; repository rules are the correctness, shared-module and naming checks in `docs/DEVELOPMENT-PLAN.md` section 5.3 and documentation accuracy in section 5.8. The parent allocated separate fresh functional and defensive workers; this report does not claim additional axis-specific workers or their results. No new actionable Fowler-baseline smell was identified in the bounded correction.

**S1 — resolved: own-data boundary and serialization ordering.** In `app/player/evidence-record.js:41–54`, every consumed reference position must have its own data-property descriptor. Its value is validated as a nonblank bounded string and copied into a new ordinary array. The implementation no longer retrieves a supplied `map` method or obtains a slot through ordinary property-value lookup. All five reference fields use that same helper, preserving one normalization rule.

At lines 181–184, serialization first calls the existing plain-object snapshot function, then reads `schemaVersion` on the null-prototype snapshot, and passes that same snapshot to normalization. The schema read therefore follows the declared object validation. Existing schema rejection and qualification reconstruction remain in place.

These findings close the concrete gaps identified in the original [code audit](CDJ04_EVIDENCE_CODE_AUDIT_2026-11-20.md) and corroborated in the [defensive audit](CDJ04_EVIDENCE_SECURITY_AUDIT_2026-11-20.md). The supported guarantee concerns the consumed fields of ordinary data records and array slots. It does not promise a sandbox for arbitrary JavaScript objects/proxies or validation of unused array decorations. Historical author reports remain evidence of their original sources; the later functional report describes the correction without claiming independent acceptance.

**Standards result: S1 closed; zero remaining scoped findings.**

## Spec

**P1 — resolved: reference lists are closed under the intended ordinary JSON transport.** The array helper now visits every index before returning a dense output. A missing position is rejected during creation; an accepted reference list contains only copied strings, so serialization cannot introduce a null slot that import subsequently rejects. The previous list bound, text bound and blank-value rejection are unchanged. The regression at `tests/cdj-evidence-record.test.mjs:128–146` covers all five list consumers, normal round trips, isolation from a later input edit, and early rejection of an incomplete list. This reviewer inspected the test definition and did not execute it.

**P2 — resolved: unknown uncertainty has a separate reason.** At module line 167, the reasons table checks whether `analysis.uncertainty.expandedPercentagePoints` is present, independently of its method label. Omitted/null magnitude remains null and adds `uncertainty_unknown`; the method can remain visible and its own missing-method reason remains separate. Supplied magnitude still must be positive and finite. The regression at test lines 148–163 checks both omitted and explicit null values with a named method, preserves the null/reason through JSON, and checks that a supplied positive magnitude has no missing-value reason. This implements the bounded SPEC-19 section 2 requirement that unknown uncertainty be null with a reason.

Neither correction grants new scientific authority. Module lines 171–175 still reconstruct `unverified`, `eligibleForReport: false` and `measurement: null`, with the permanent independent-validation reason. The caller's six quality flags, reference/hash strings, method labels and uncertainty values remain assertions. The schema and units are unchanged, and the accepted pitch calculation helper is not modified or re-audited.

**Spec result: P1 and P2 closed; zero remaining scoped correction findings.** The complete SPEC-10 workflow and SPEC-19 measurement contract remain incomplete as described below.

## Remaining requirements and normalization limit

The source search finds no production import of the evidence API outside its defining module. This acceptance therefore does not qualify capture ownership, stable run identity allocation, actual reference hashing, backend interruption evidence, SQLite/history persistence, HTML/PDF report round trips, compatible-run comparisons, or any user-facing player workflow. A JSON serializer is not a durable evidence store.

The current reasons table is not an exhaustive readiness checklist for every SPEC-10 field. SPEC-19's timebase/calibration provenance, uncertainty status/components/coverage factor, valid-data fraction and full measurement model still need a defined representation and independent validation. Populated fields and short reason lists cannot be treated as proof that these requirements are satisfied. The characterized reference, wrong-reference/unstable-tone validation, independent estimator checks and physical runs on at least two player models remain separate gates.

The [functional author report](CDJ04_EVIDENCE_FUNCTIONAL_AUDIT_2026-11-20.md) also records the ordinary JSON normalization of JavaScript negative zero to zero. The provisional schema assigns no physical meaning to that sign and promises no bit-preserving numeric transport. This is a documented normalization-policy question, not an unresolved blocker for the three corrections above. Future consumers must define any stronger identity requirement before relying on it.

## Verification and handoff

This reviewer read the corrected module, changed regression definitions, original code/defensive findings, functional correction report, and applicable repository/spec rules. Read-only Git ancestry/tree/blob checks and file hashing confirmed the supplied identities. `git diff --check` passed for the module and test changes. No production or test file was edited, and no application test, syntax execution, build, adversarial probe, vulnerability reproduction, external CI inspection or hardware run was performed.

The author's 19/19 baseline, 19-pass/2-fail regression baseline and 21/21 corrected result remain attributed to that author and are not relabeled as this reviewer's execution. Fresh functional and defensive acceptance belongs to the separately assigned workers. Root retains integration, exact-source hosted qualification and publication ownership. Preserve original failures, published branches, Fleet default-off, existing limits and physical gates.

**Axis summary:** Standards — zero remaining findings, S1 resolved. Spec — zero remaining scoped correction findings, P1/P2 resolved; broader workflow and scientific qualification remain open.
