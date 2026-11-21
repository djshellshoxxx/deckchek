# CDJ-04 evidence envelope: defensive source audit — 20 November 2026

## Disposition

**Requires correction and fresh successor review.** The published PR #61 source has two gaps in its documented plain-data boundary and one uncertainty-traceability defect. These findings concern the provisional evidence API; they do not establish an application exploit or a way to obtain an eligible report. The reviewed source always reconstructs qualification as `unverified`, with `eligibleForReport: false` and `measurement: null`.

This is an independent, source-only review of the cumulative evidence-envelope additions in PRs #60/#61. It is not acceptance of subsequent corrections, a comprehensive security certification, or scientific/hardware qualification.

## Exact source and scope

- Reviewed commit: `20e0fd3202ca74f11404ca3e53735b5b5bc2364f`.
- Reviewed tree: `c869db493a53227309201f0807385622a9b3f12d`.
- Comparison base, PR #59: `3118321ee23393bfe37c3cc8e11aeb84490cbd40`.
- Review branch: `review/deckchek-evidence-security-20261120`.
- The cumulative diff adds the evidence module, its test file and the two evidence documents below. It changes no pre-existing application file.
- Only this report is authored by this reviewer. No application or test edits, application/test execution, exploit construction, vulnerability reproduction, adversarial input execution, scanner, fuzzing, probing or remote writes were performed.

The following identities were read from Git and the checked-out files, respectively. SHA-256 values identify file bytes; they are not claims about audio-reference authenticity.

| File | Git blob | SHA-256 |
| --- | --- | --- |
| `app/player/evidence-record.js` | `6abd1574db417fcdb7a0bcc5f19bde6b1d752944` | `579f81aa48b33ab0d9635bb77cee4d1a652ce3467ccecfcda4340798f7b8d719` |
| `tests/cdj-evidence-record.test.mjs` | `b014a18e289bc85f3790873abbf59b477b8666b3` | `7b2a4c3855b2ab0955d817e0c56ffb018432272ff79db0aaa2f8b822e8475942` |
| `docs/engineering/CDJ04_EVIDENCE_CONTRACT_2026-11-20.md` | `1df451d7d997336cc83b6bfb26f925f6bb591f54` | `943b41e0d97468baa194162664905f39b48b260d90eebe25af47c937ec9bb9c8` |
| `docs/engineering/CDJ04_EVIDENCE_PROVENANCE_REVIEW_2026-11-20.md` | `84a58c18f4203dd316ead725b7e30516b227cca1` | `86859d855e0e48f34d7ccf3dd29978eb62ba7c36c77953140d29815b8c3a8ebf` |
| `docs/SPEC-10-CDJ-media-player-diagnostics.md` | `d86153e94d383e7d54c6d54f295a4a4b0a3480a4` | `a03ea0c7be7731a718fef6a363446436ed108b8132aed97580f078c1b13f6904` |
| `docs/SPEC-19-scientific-measurement-and-validation.md` | `c3a2121308433c4fc23b0534d990093ecc0f5aad` | `ed2926388ab9c418d303dddaab42e1d80e54e7f7a382057813da085cc81a5c5b` |

The already accepted numerical helper, `app/player/pitch-display.js`, has the identical blob `1be6e8831813eec6cafe8a5b16f85bebafcc9938` at the comparison base and reviewed commit. It was not re-audited.

## Concrete findings

### EVID-SEC-01 — Reference arrays bypass the stated own-data snapshot boundary

**Priority: P2, provenance and transport correctness. Open at the reviewed source.**

`app/player/evidence-record.js:41–48` checks array identity and length, then calls `value.map(...)`. The object-normalization path at lines 10–24 instead verifies the prototype and reads own data-property descriptors. Reference arrays therefore do not receive equivalent own-index or descriptor validation, and the normalizer dispatches through a method obtained from the caller's array.

This contradicts the broadly stated rejection of accessor-backed and non-plain input nodes in `CDJ04_EVIDENCE_PROVENANCE_REVIEW_2026-11-20.md:11`. It affects capture input-pair identifiers, raw-evidence references, processing references, uncertainty references and quality references. These identifiers are part of the retained provenance even though they do not confer qualification.

There is also an ordinary transport defect visible from the source: array mapping skips absent slots. The resulting sparse array is returned as accepted normalized data, JSON transport represents those slots as null, and the reference validator rejects null entries when that JSON is read back. Thus the accepted record domain is not closed under its own advertised JSON round trip. This conclusion follows from source semantics; no input or reproduction was executed by this reviewer.

**Correction required:** explicitly define the supported array shape, require a dense set of own data-valued string entries, validate descriptors before reading values, and copy accepted references into a new ordinary array without dispatching through caller-provided methods. Preserve the existing bounds and blank-reference rejection. The functional worker owns the correction and ordinary sparse-array regression; this report does not accept that later patch.

### EVID-SEC-02 — Serialization reads schema before validating the record object

**Priority: P2, documented failure-boundary correctness. Open at the reviewed source.**

`serializeCdjEvidenceRecord` reads `record?.schemaVersion` at `app/player/evidence-record.js:176` before calling `createCdjEvidenceRecord` at line 177. That property read occurs before the own-data snapshot and accessor rejection in `ownObject`. Consequently, eventual rejection by the normalizer does not establish that the serializer avoided invoking a schema accessor first.

The current getter regression at `tests/cdj-evidence-record.test.mjs:107–113` covers a quality flag passed to record creation. It does not cover this earlier serialization step. This is a source-ordering discrepancy with the stated plain-data contract, not evidence of a production attack surface or report-eligibility bypass.

**Correction required:** snapshot and validate the top-level record before inspecting its schema, then normalize and serialize that validated snapshot. Keep unsupported-schema rejection and reconstruction of derived fields. Review the ordering statically; no executable accessor or custom-dispatch payload is needed for this audit.

### EVID-SEC-03 — Unknown uncertainty magnitude can lack its own reason

**Priority: P2, scientific traceability. Open at the reviewed source.**

The expanded uncertainty magnitude is nullable at `app/player/evidence-record.js:134–137`. The reason list at lines 150–163 includes an unknown uncertainty method but no unknown uncertainty magnitude. A record can therefore retain a method label while its uncertainty magnitude remains null, without a corresponding explicit unknown-uncertainty reason.

`SPEC-19-scientific-measurement-and-validation.md:19` requires unknown uncertainty to be null with a reason. The permanent general reason that capture, reference and method have not been independently validated does not identify the missing magnitude. The report-eligibility guard remains false, so this is a traceability defect rather than a confident-measurement escape.

**Correction required:** retain null and add an explicit unknown-uncertainty reason whenever the magnitude is absent, independently of whether a method label exists. Do not invent a zero value or treat a named method as quantified uncertainty. The functional worker owns the bounded correction and ordinary null-uncertainty regression.

## Source properties that remain intact

These observations apply only to the reviewed bytes and the stated provisional use:

- Object nodes used by record creation are limited to ordinary or null-prototype records. Enumerable own accessor properties are rejected before their values are read; accepted own data properties are snapshotted onto null-prototype objects. This finding does not extend that guarantee to arbitrary JavaScript proxies or claim that all JavaScript reflection is side-effect-free.
- Normalization builds an explicit output field set. Caller-supplied qualification, score, units and quality-origin claims do not become authoritative output fields. Qualification is always reconstructed as unverified, false and null, with the permanent independent-validation reason (`evidence-record.js:93–170`).
- Quality flags are individually boolean or null, and their origin is explicitly `caller_supplied_not_verified`. The code does not turn a supplied true flag into a verified capture observation (`evidence-record.js:140–147`).
- Numeric fields reject non-numbers and nonfinite values. Sample rates require positive safe integers; uncertainty magnitude and reference/measured frequency, when supplied, must be positive. Pitch range bounds are ordered and finite. These are shape checks, not physical plausibility or measurement validation.
- Known text fields are trimmed and bounded; retained control characters are rejected. SHA-256 metadata is checked only for hexadecimal shape and normalized case. Timestamps are checked against the accepted UTC form and calendar value. JSON input has a 131,072-character limit and an explicit schema check (`evidence-record.js:26–75, 181–185`).
- No capture, database, filesystem, network or HTML operation appears in the reviewed module. The source search across application code and tests found the API's application definitions and its isolated test import, without a production consumer. Reference strings are retained identifiers; the module does not open or resolve them.
- Implemented validation failures throw during normalization, and JSON parsing failures propagate. Neither path returns a qualified record. A future caller still needs a defined error-handling path before UI or persistence integration; no such caller was part of this addition.

## Explicitly deferred work, separate from these defects

The envelope is useful as provisional metadata only. Neither field population nor correction of the findings above establishes the following requirements:

| Requirement | Present boundary and remaining work |
| --- | --- |
| Reference and raw-evidence identity | Hash strings, reference versions and evidence IDs are supplied assertions. A future acquisition path must establish ownership and actual content identity over retained bytes. No hash verification or reference-media validation is implemented here. |
| Capture quality and processing | The six flags, device/backend labels, routing, gain, selected pairs, duration and processing settings do not prove what occurred during capture. Capture-owned observations, interruptions and negative real fixtures remain outside this module. |
| Quantified uncertainty | A positive magnitude, method name and supporting IDs do not supply a measurement model, coverage factor, components, correlations or characterized timebase. SPEC-19 sections 2, 4 and 5 remain applicable before scientific claims or comparisons. |
| Durable storage and export | Serialization is JSON transport only. Database transactions, migrations, SQLite round trips, access control and HTML/PDF export are absent. Future path/reference consumers must establish their own resource permissions and output encoding; no traversal or rendering vulnerability is inferred from unused strings. |
| Comparable reports and physical validation | SPEC-10 lines 74–86 require reference/quality checks, provenance-preserving database/export behavior, compatible comparisons, independent reference validation and repeated hardware work on at least two player models. These gates remain open. Unknown firmware and untested sections must remain visible. |

The nullable record is not a complete calibrated-measurement schema. In particular, resolving EVID-SEC-03 is a bounded compliance improvement to unknown-state traceability, not completion of SPEC-19's uncertainty model.

## Review evidence and limits

The reviewer read all 186 lines of the evidence module, all 126 lines of its eight test definitions, both author documents, SPEC-10 and SPEC-19. The review traced field normalization, reference handling, qualification reconstruction, JSON entry points and exception boundaries. Git source/tree/blob checks, SHA-256 file hashing and read-only source searches were performed.

The tests were inspected statically and not run by this reviewer. The six-test result in the original contract document is the author's earlier result, not a fresh result for this audit. No local full suite, hosted CI, native build, dependency scan, production integration or hardware validation is asserted here. The three findings were communicated to the integration owner and functional worker while the source remained frozen.

## Handoff to fresh workers

The functional worker owns all three bounded corrections in a separate successor branch. Preserve published PR #61 at the exact source above and retain the original failures and source review. This reviewer has not reviewed or accepted the successor patch.

After the correction head is frozen, a fresh defensive reviewer should record that exact commit, tree and module/test hashes, inspect the three changed boundaries, and distinguish source acceptance from future capture or scientific qualification. Fresh code and functional workers should check ordinary reference-array round trips, schema handling, explicit null-uncertainty reasons and the unchanged unverified gate using their separately authorized scope. Integration and hosted gates belong to the root owner. None of these findings requires changing the accepted numerical helper, inventing physical evidence, enabling Fleet, or weakening existing release/security gates.
