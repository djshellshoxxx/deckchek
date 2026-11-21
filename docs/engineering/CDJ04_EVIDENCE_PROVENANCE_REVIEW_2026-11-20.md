# CDJ-04 evidence-record review and correction — 20 November 2026

Parent: draft PR #60 at `2cc6624a766df155d5d7cc7e5455d09e869a6af9`, stacked on frozen PR #59. Correction lives on a distinct branch, not in #60/#59/#58.

## Code/functional/defensive review finding

The initial `ownObject` returned caller objects verbatim. A custom-prototype object such as `Object.create({toneStable:true})` could therefore supply an inherited quality claim, and inherited capture metadata could be read as if actually supplied. Even though `eligibleForReport` was always false, the provisional record could misstate evidence provenance. It also accepted exotic objects (e.g. Date). The sample-rate validator used `Number.isInteger`, which accepts non-safe large integers such as `1e30`, losing exact integer semantics.

## Bounded correction

The record validator now accepts ordinary or null-prototype JSON-like objects, snapshots only own enumerable properties onto a null-prototype object, rejects non-plain input nodes and uses `Number.isSafeInteger` for sample rates. Values remain provisional: no report eligibility, no measurement, no proof of waveform or capture provenance. The API does not attempt independent validation of source hashes, quality flags, capture clocks or reference identity.

## Regression and qualification plan

Two focused tests cover inherited quality/capture claims, exotic objects, null-prototype valid input, safe capture sample-rate integers and JSON round-trip. Prior six original tests are unchanged. Review all eight cases at exact resulting head and run the applicable hosted standard/nightly/desktop gates before integration.

Separate successor acceptances required:
1. **Code review:** validate null-prototype snapshot does not change legitimate plain-object callers, serialization compatibility or missing-field semantics; inspect the exact patch, not the already-reviewed numeric helper.
2. **Bug hunt:** execute all eight tests and adversarial JSON transports, malformed/oversized inputs, and verify failed inputs never become report-eligible; retain failure logs.
3. **Defensive review:** check inherited/accessor/prototype boundaries and future evidence-path consumer escaping; distinguish operator assertions from verified physical evidence.

This is a single-author combined review/fix; no independent agents have accepted the result. No code in Ledger, Fleet, capture, persistence, exports, hardware logic or existing hosted candidate branches was changed. Never infer external CI qualification or credit state from queued jobs. Preserve the original branch/head for comparison, physical gates, 200 ms ASan threshold, security gates and Fleet default off. No release/deploy/tag/history rewrite.
