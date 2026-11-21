# CDJ-04 evidence envelope: fresh defensive acceptance — 20 November 2026

## Decision

**Accepted for integration as the bounded, provisional evidence contract.** Independent source inspection closes EVID-SEC-01, EVID-SEC-02 and EVID-SEC-03 at the frozen source below. No remaining blocker was found within those corrected boundaries. The record remains unverified; none of this acceptance establishes an authenticated capture, a qualified measurement, a production player workflow or a comprehensive security certification.

This worker did not author the correction. The [initial security audit](CDJ04_EVIDENCE_SECURITY_AUDIT_2026-11-20.md), [code audit](CDJ04_EVIDENCE_CODE_AUDIT_2026-11-20.md) and [functional author report](CDJ04_EVIDENCE_FUNCTIONAL_AUDIT_2026-11-20.md) remain separate records. Their original source findings and failing evidence are preserved rather than relabeled as passing results.

## Exact reviewed identities

| Item | Identity |
| --- | --- |
| Frozen combined source | `25b65d6821ec40766b8cae855699c70ea7672770` |
| Frozen combined tree | `0305261c09b33c6f29250a9c313484e3dea0f397` |
| Original evidence source, PR #61 | `20e0fd3202ca74f11404ca3e53735b5b5bc2364f` |
| Correction and regression commit | `9e282b1fa8f031f2f53a7d346e00a4a12a11e884` |
| Correction tree | `ea5a70d72ba204d9f399eb8c54b7dca3bc9d3d6f` |
| Acceptance branch | `review/deckchek-evidence-security-acceptance-20261120` |

| Reviewed file | Git blob at frozen source | SHA-256 |
| --- | --- | --- |
| `app/player/evidence-record.js` | `50cefb649167902200c2a6b91565016420ab7b82` | `52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207` |
| `tests/cdj-evidence-record.test.mjs` | `70fc86f49c1e40c92c7f041326019b08f7485b13` | `34021a157c944f98abe8a706d1afdbf47fad0c2541e4b654b7133d29279638ab` |

The module and test identities were read independently from the checked-out files and Git. The diff from the correction commit to the frozen combined source adds only the three audit reports and retained functional evidence. It does not alter application or test bytes. The reviewed source includes main merge `8b4c7d235ba2ccf9212fa5b5b18d56e697e42fb8`; this review does not requalify that merge's unrelated Ledger changes or adopt its hosted results for the new evidence module.

## Finding dispositions

### EVID-SEC-01 — Closed: reference entries use dense own data snapshots

At `app/player/evidence-record.js:41–53`, the shared reference normalizer retains the existing array, length, text and blank-entry checks. It now visits each index, obtains its own property descriptor, requires a data value, validates that string and appends it to a newly allocated ordinary array. Missing indices and accessor indices are rejected before their values are retrieved. The implementation no longer obtains or calls the supplied array's `map` method, and it does not preserve its prototype or methods in the output.

All five reference-list fields use this normalizer: selected capture pairs, raw capture references, processing references, uncertainty references and quality references. The new ordinary regression covers every field, including a dense-list round trip, isolation from later input edits and early rejection of a missing slot (`tests/cdj-evidence-record.test.mjs:128–146`). The regression was inspected, not executed by this reviewer.

This closes the identified sparse-list transport inconsistency and own-index provenance gap. The accepted shape is a bounded array of dense own data-valued strings, normalized into an ordinary array. It is not a claim that arbitrary JavaScript object reflection is free of side effects or that the API is a sandbox.

### EVID-SEC-02 — Closed: serialization validates before reading schema

At `app/player/evidence-record.js:181–184`, `serializeCdjEvidenceRecord` first calls `ownObject(record, 'evidence record')`. Only after that validation and snapshot does it inspect `snapshot.schemaVersion`. The same snapshot then enters `createCdjEvidenceRecord` before JSON encoding.

For the supported ordinary object boundary, `ownObject` accepts only ordinary or null-prototype record objects, enumerates own fields, rejects enumerable accessor properties without retrieving their values, and builds a null-prototype data snapshot (`evidence-record.js:10–24`). A non-enumerable schema field is not copied and consequently cannot satisfy the snapshot's schema check. The serializer no longer performs the original direct schema access before that boundary.

Schema rejection and normalization of derived fields remain in place. The import entry point first obtains data from `JSON.parse`, checks the supported schema and reconstructs the record (`evidence-record.js:188–192`). This ordering was accepted by static inspection; no accessor, proxy, inherited-schema or custom-dispatch input was executed for this review.

### EVID-SEC-03 — Closed: unknown uncertainty has its own reason

The uncertainty magnitude remains nullable and, when supplied, must be positive and finite (`evidence-record.js:139–142`). The missing-value table now independently tests `expandedPercentagePoints != null` and adds `uncertainty_unknown` when the magnitude is absent (`evidence-record.js:167`). The unknown-method reason remains a separate entry.

Thus a method label does not hide a missing magnitude. Null remains explicit, and a value or zero is not invented. Both serialization and import reconstruct this reason through the factory. The new ordinary regression covers omitted and explicitly null magnitudes with a named method, retained false/null qualification, transport preservation and the absence of the missing-magnitude reason for a supplied positive value (`tests/cdj-evidence-record.test.mjs:148–163`).

This satisfies the bounded null-with-reason correction required by [SPEC-19 section 2](../SPEC-19-scientific-measurement-and-validation.md#2-measurement-contract-additions). A supplied positive number still does not establish a calibrated uncertainty budget, coverage factor or measurement model.

## Qualification and trust boundaries retained

The factory still constructs `status: 'unverified'`, `eligibleForReport: false`, `measurement: null` and the permanent independent-validation reason (`evidence-record.js:171–175`). Both transport entry points rebuild this output. Caller-supplied qualification, units and quality-origin fields are not promoted into authority. These are guarantees of the normalization/transport paths, not immutable properties of an object that an in-process caller subsequently edits.

Quality flags remain individually nullable caller assertions with origin `caller_supplied_not_verified`. Reference hashes are checked for hexadecimal shape; they are not computed over audio bytes. Run IDs, timestamps, firmware, device/backend names, routing, gain, processing settings and evidence references remain supplied metadata. Neither a populated record nor a short reasons list establishes complete provenance or a satisfied quality gate.

The implementation operates on ordinary data in its JavaScript realm. It is not a security boundary against arbitrary in-process code, proxies, modified built-ins or global prototype mutation. Reference strings are retained identifiers; this module does not open paths, fetch resources or render HTML. Any later consumer must establish its own resource authority, ownership, output encoding and failure behavior.

The source search for the module and its exported APIs found definitions and isolated test references, with no production capture, native database, history, screen or report consumer. The module does not authenticate a reference, allocate a durable run identity, retain raw capture bytes, establish clock provenance, or implement database/HTML round trips. Those are remaining implementation requirements under [SPEC-10](../SPEC-10-CDJ-media-player-diagnostics.md#v10-implementation-contract), alongside compatible comparisons, independent estimator/reference checks and physical validation on at least two player models. Full scientific metadata from SPEC-19 remains open.

## Evidence, limits and handoff

This worker inspected all 193 module lines, the exact two-file correction diff, the new regression definitions, the three initial reports, and the relevant SPEC-10/SPEC-19 contracts. Git source/tree/blob checks, file hashing and read-only source searches were used to bind the review to the frozen bytes. The accepted numerical helper was outside this review and was not re-audited.

No application/test execution, build, dependency scan, fuzzing, exploit construction, vulnerability reproduction, adversarial runtime probe, remote write or hardware test was performed. The author's earlier focused results remain author evidence. Independent functional execution and hosted qualification belong to their separately assigned owners; this report makes no new runtime pass claim.

Only this acceptance report is authored on the worker branch. Root may integrate it as a documentation overlay after the complete fresh worker set finishes. Preserve the frozen source, original reports and failure logs, then qualify the actual published candidate through its applicable gates. Keep future work focused on capture-owned provenance and explicit storage/report contracts. This acceptance does not enable Fleet, change limits or permissions, waive scientific/hardware requirements, or authorize release/deployment.
