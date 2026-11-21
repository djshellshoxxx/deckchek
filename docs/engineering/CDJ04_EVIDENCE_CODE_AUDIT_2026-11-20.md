# CDJ-04 evidence envelope — fresh code audit, 20 November 2026

## Decision and exact scope

**Changes requested for the provisional source/data contract.** This is a fresh, source-only review of the cumulative PR #60/#61 addition, not a re-review of the accepted pitch-display calculation. The unconditional `unverified` / `eligibleForReport: false` / `measurement: null` boundary is intact. The findings concern faithful provisional provenance and JSON transport; none establishes a report-eligibility bypass or a scientific measurement.

| Item | Exact identity |
|---|---|
| Fixed point, PR #59 | `3118321ee23393bfe37c3cc8e11aeb84490cbd40` |
| Reviewed PR #61 head | `20e0fd3202ca74f11404ca3e53735b5b5bc2364f` |
| Reviewed tree | `c869db493a53227309201f0807385622a9b3f12d` |
| Review branch | `review/deckchek-evidence-code-20261120` |
| Diff | `git diff 3118321ee23393bfe37c3cc8e11aeb84490cbd40...20e0fd3202ca74f11404ca3e53735b5b5bc2364f` |
| Changed scope | Four files; 361 added lines; no existing production consumer changed |

The orchestrator's separate merge of current main preserves this reviewed tree; this report does not substitute a moving branch for the pinned source. Published PR #58–#61 heads were not changed by this reviewer.

| Reviewed file | Git blob |
|---|---|
| `app/player/evidence-record.js` | `6abd1574db417fcdb7a0bcc5f19bde6b1d752944` |
| `tests/cdj-evidence-record.test.mjs` | `b014a18e289bc85f3790873abbf59b477b8666b3` |
| `docs/engineering/CDJ04_EVIDENCE_CONTRACT_2026-11-20.md` | `1df451d7d997336cc83b6bfb26f925f6bb591f54` |
| `docs/engineering/CDJ04_EVIDENCE_PROVENANCE_REVIEW_2026-11-20.md` | `84a58c18f4203dd316ead725b7e30516b227cca1` |
| `docs/SPEC-10-CDJ-media-player-diagnostics.md` | `d86153e94d383e7d54c6d54f295a4a4b0a3480a4` |
| `docs/SPEC-19-scientific-measurement-and-validation.md` | `c3a2121308433c4fc23b0534d990093ecc0f5aad` |
| `docs/DEVELOPMENT-PLAN.md` | `c13c324aea766048327003b3817090da55c6f426` |

Additional SHA-256 identities:

- Module: `579f81aa48b33ab0d9635bb77cee4d1a652ce3467ccecfcda4340798f7b8d719`.
- Existing test file: `7b2a4c3855b2ab0955d817e0c56ffb018432272ff79db0aaa2f8b822e8475942`.

## Standards

The Engineering Suite code-review approach is applied with separate Standards and Spec axes. Repository rules are `docs/DEVELOPMENT-PLAN.md` sections 5.3 and 5.8: correctness against acceptance criteria, shared-module consistency, naming, and documentation matching code. No dedicated contributing/coding-standards file or `docs/agents/issue-tracker.md` was present; the parent supplied the exact base and relevant specs. The smell baseline supplied no additional actionable finding. Independent functional and defensive reviewers own their separate evidence and verdicts.

### S1 — Medium: the documented own-data/no-accessor boundary is broader than the implementation

`CDJ04_EVIDENCE_PROVENANCE_REVIEW_2026-11-20.md`, “Bounded correction,” says the validator snapshots own data properties without invoking getters and rejects accessor-backed input nodes. Object nodes receive that treatment at `app/player/evidence-record.js:10–24`; reference arrays do not. `refs()` at lines 41–48 dispatches `value.map` and obtains entries through ordinary array property access. At line 176, serialization also reads `record.schemaVersion` before the snapshot at line 177. Both are outside the claimed ordering/descriptor guarantee.

This conflicts with the documentation-accuracy rule in DEVELOPMENT-PLAN section 5.8. The consequence is inaccurate provenance-boundary assurance, even though qualification remains false. Apply the bounded data-property treatment to every accepted reference slot and validate the top-level snapshot before inspecting its schema. Keep the guarantee scoped to ordinary in-process data objects; do not imply arbitrary JavaScript objects form a sandbox. The defensive worker independently identified both locations and owns detailed security acceptance. No accessor or other boundary probe was executed by this reviewer.

**Standards total: one finding, medium; worst within this axis is S1.**

## Spec

### P1 — Medium: an accepted reference array is not necessarily JSON-round-trip safe

The evidence-contract report promises an offline JSON contract and round-trip preservation. `refs()` at `app/player/evidence-record.js:41–48` maps over the supplied array without requiring a present own value at each position. An ordinary sparse array can therefore survive normalization with an empty slot. JSON serialization writes that slot as null; deserialization then reaches the blank-reference rejection at line 46. A record accepted by creation cannot be read back from its own serialization.

All five reference-list uses share the gap: selected capture pairs, raw captures, processing evidence, uncertainty evidence, and quality evidence. Reject missing slots during creation and build a dense ordinary output array. A focused benign transport regression should prove creation rejects sparse input and valid dense records preserve their values. Existing tests cover oversized/blank arrays but not this case (`tests/cdj-evidence-record.test.mjs:84–95`). No runtime reproduction was performed by this code reviewer.

### P2 — Medium: unknown uncertainty lacks a corresponding reason when a method is named

SPEC-19 section 2, line 19 requires: “Unknown uncertainty is null with reason, never zero.” The envelope allows `analysis.uncertainty.expandedPercentagePoints` to remain null at line 135, but its missing-field table checks only `uncertainty.method` at line 162. With a named method and null magnitude, neither the uncertainty object nor `qualification.reasons` identifies that unknown magnitude. The universal “not independently validated” reason describes verification status, not whether an uncertainty value exists.

Add an explicit unknown-magnitude reason that is reconstructed across JSON transport. Preserve the caller-supplied method, avoid inventing an uncertainty value or coverage factor, and retain false eligibility. Existing tests assert a missing method and a positive magnitude; they do not cover this combination. The repository already distinguishes unknown uncertainty from method identity in `app/support-isolation.js:12–13`.

**Spec total: two findings, both medium; P1 breaks the advertised transport closure, and P2 omits required uncertainty explanation.**

## Coverage and preserved behavior

| Contract area | Source conclusion and limit |
|---|---|
| Qualification | Lines 165–170 always reconstruct unverified, false eligibility and null measurement. Caller qualification, quality origin, metric units and extra score fields cannot become trusted output through the normal factory/import path. |
| Plain-object provenance | Lines 10–24 snapshot own enumerable data properties to a null-prototype object, reject non-plain object nodes, and do not retrieve accessor values while snapshotting those nodes. Array and serializer exceptions are S1. |
| Unknown values | Known schema fields receive null, `unknown`, or empty arrays. Literal firmware `unknown` remains visible and receives an unknown-firmware reason. Unrecognized input keys are discarded; the comment about preserving unknown fields refers to unknown values in known fields, not arbitrary extension keys. |
| Numerical shape | Provided numbers must be finite. Sample rates must be positive safe integers; reference/measured frequencies and supplied expanded uncertainty must be positive. This is shape validation, not physical plausibility or independent estimator validation. |
| Timestamps | Lines 68–74 accept a bounded UTC ISO form and compare the parsed calendar timestamp to the supplied components. Missing dates remain null. This does not prove capture time, source clock, or freshness. |
| Identity and normalization | Run/asset IDs are bounded trimmed text, not allocated or uniqueness-checked identities. SHA-256 text is shape-checked and lowercased without reading source bytes. Text and reference limits are normalization rules, not evidence verification. |
| Pitch and processing | Entered display, supported range, keylock/FX and nullable flags are retained as assertions. The envelope does not resolve contradictions, establish supported model ranges, or verify disabled processing. No arithmetic helper changes were reviewed. |
| JSON and schema | Import limits input length, checks schema, and rebuilds derived fields. Valid dense fixtures have author coverage; P1 prevents accepting a general round-trip guarantee. The factory is a current-schema constructor, while the transport entry points explicitly check versions. |
| Production integration | The only application references to the new symbols are in this module. No capture, native, SQLite, history, UI or report consumer imports it. A JSON round trip is not a database or exported-report round trip. |

## Remaining workflow work, distinct from the findings

The prototype's intentional boundary must remain visible. These are incomplete workflow contracts, not claims that this patch regressed an existing production CDJ feature:

- SPEC-10 lines 76–85 require preserving full provenance, exclusions and untested sections through database and HTML report round trips. The envelope has the named top-level field groups, but no storage/export adapter or comparison path. `app/history-feed.js:9–17,83–90` has no CDJ run type/source. Its rows use a type-prefixed identity and `startedAt`; the envelope uses `runId`/`observedAt`. An explicit adapter must establish ownership and identity rather than relying on structural similarity.
- `app/capture.js:108–114` returns a capture payload with `sampleRate`, channel data, stream errors and selected pairs. The envelope uses `sampleRateHz` and textual references. A future capture-owned builder must bind those fields to the actual capture and interruptions, not merely copy operator claims.
- The missing-field reason table at lines 150–163 is not an exhaustive readiness or comparison checklist. Besides P2, it does not explain absent sample rate, gain, duration, method version, pitch values, raw references, timestamp, or unknown/failed quality flags. Any UI must retain these explicit values and must not equate a short reason list with complete provenance or satisfied quality gates.
- SPEC-19 section 2 and SPEC-07's scientific-metadata additions require measurand, sample interval/valid fraction, timebase and calibration provenance, uncertainty status/components/coverage, and relevant method parameters. This envelope does not represent that full metadata and would discard unrecognized additions. Version/design those fields before using the transport for scientific records or historical comparison.
- Compatible reference/method/routing/gain conditions and explicit unknown firmware still need comparison logic. Characterized independent reference, physical runs on at least two player models, and full capture/UI/report validation remain open under SPEC-10 lines 78–86. No fixture or populated envelope satisfies those gates.

## Verification and handoff

This reviewer inspected the pinned four-file diff, all 186 module lines, all 126 existing test lines, both author reports, applicable SPEC-10/SPEC-19 requirements, and relevant capture/history/report/uncertainty interfaces. `git diff --check` against the pinned base was clean. The worktree was clean before this report. No application test, build, hardware run, boundary probe or external CI job was executed by this worker. The original author-reported 8/8 result is not adopted as an independent execution result.

The source findings were sent to the orchestrator and functional worker; the defensive worker independently confirmed the array and schema-read locations. The orchestrator assigned the functional worker the bounded reference snapshot, serializer ordering and unknown-uncertainty corrections. This reviewer made no production or test changes and performed no remote write.

Successor acceptance must pin the corrected head/tree, inspect the changed input boundary and unknown-uncertainty reason, run the benign regression set on that exact source, and obtain a fresh defensive source review. Preserve the original failing/limited source in this report rather than rewriting its verdict after corrections. Broaden qualification only to satisfy a concrete remaining integration gate. Keep PR #58–#61 published heads, accepted numerical helper evidence, Fleet default-off, existing security gates and physical validation requirements unchanged.

**Axis summary:** Standards: one medium documentation/boundary finding. Spec: two medium transport/uncertainty findings. These axes remain separate; this report provides no production or scientific acceptance.
