# CDJ-04 evidence-envelope continuation — 20 November 2026

**Scope:** a bounded, offline evidence-record schema and JSON round-trip checks for the proposed SPEC-10 CDJ-04 workflow. This is separate from unchanged published Ledger PR #58 and CDJ calculation PR #59. It is stacked on the existing #59 head, not committed to either published qualification candidate.

## Implemented boundary

The new pure `app/player/evidence-record.js` exports `createCdjEvidenceRecord`, `serializeCdjEvidenceRecord`, and `deserializeCdjEvidenceRecord`. The record contains schema/run identity and timestamp; physical asset/model/firmware; medium/reference identity, SHA-256-shaped fingerprint and version; nominal tone; capture backend/device, sample rate, input pairs, gain, routing, duration and raw-evidence references; keylock/FX settings; displayed pitch and supported range; method/version/frequency/units; named uncertainty and supporting references; and six individually nullable quality claims.

All unspecified fields are explicit `null`, `unknown` or empty reference arrays. Firmware supplied as the literal `unknown` stays visible and is treated as unknown. File-hash shape, evidence identifiers, operator flags and input values are **not** independently checked against physical sources. Report eligibility is always false, measurement is null and a `capture_reference_and_method_not_independently_validated` reason is always present. Derived fields, units and eligibility are reconstructed on JSON import; a forged `eligibleForReport` or score is discarded. Input numbers must be finite, text and arrays are bounded, and unsupported schema versions are rejected. This contract does not establish a trusted evidence store, verified measurements or a report.

## Local qualification and limits

On Node 22.16.0, the isolated evidence-record tests passed **6/6**, with no skips or failures, including unknown-state preservation, complete-but-unverified inputs, round-trip, forged-eligibility, numeric/type boundaries, malformed date/size/schema and prototype-pollution handling. JavaScript syntax checks passed. Repository-local full-suite and hosted CI have **not** been completed for this new source. The files have no production import or native/SQLite/HTML persistence integration; the exercised round trip is JSON serialization/deserialization only, not a database or exported-HTML round trip. This run did not spawn independent worker agents; dedicated fresh code/functional/defensive acceptance remains outstanding and must not be inferred from the author's tests.

## Distinct review checkpoints for successors

- **Code integration:** compare this envelope with `app/capture.js`, `app/history-feed.js`, `app/report-pdf.js`, `app/player/pitch-display.js`, SPEC-07 and SPEC-10. Establish an actual capture-owned record acquisition path, stable run IDs, database migration/round trips and HTML report serialization without changing accepted candidates in place.
- **Functional bug hunt:** add negative real-fixture cases for wrong-reference/unstable tone, capture interruptions, mismatched input pairs, failed persistence and stale-result ownership. Verify record/source identity on load and preserve unknown firmware and untested sections.
- **Defensive security:** treat reference hashes as unverified string metadata unless computed over real bytes; do not trust caller `true` flags or evidence IDs. Inspect limits, path traversal/reference use, malformed JSON, provenance spoofing, export escaping and any future signed/calibrated evidence boundary. No offensive probing.

Once author corrections are frozen, hand the exact source/tree and tests to separate fresh acceptance reviewers. The record may not become report-eligible solely because its fields are populated. The existing numerical helper's review is complete and should not be repeated without code changes. Independent estimator, characterized reference, physical two-player and full UI/report scientific qualification remain required.

## Current integration order

PR #54's exact head `3d1ee5bddb56db1290af0166874612ada3c0a566` passed its applicable standard/nightly/desktop jobs and was merged with an expected-head guard to main as `53530372e724a018d244d05900aef1dc05624a74` (same `c411b7a1d6004d7063e0ab73d7ded716260da62c` source tree). PR #58 at `eba46183fecd9d698515411865e710021dcba632` and PR #59 at `3118321ee23393bfe37c3cc8e11aeb84490cbd40` remain frozen while their own exact-source hosted checks run. Check their live jobs and merge-base/tree equivalence after upstream merges, not merely a workflow-level green label. This evidence-record branch is a further stacked draft, not a merged/qualified release.

Preserve old branches, Fleet default-off, the unchanged 200 ms ASan cap, archive limits, permissions, security gates, hardware evidence and failures. Do not deploy, tag, release or rewrite history. A queued job or resource failure is not evidence of exhausted credits.
