# CDJ-04 defensive source audit — 20 November 2026

Reviewer: `/root/cdj04_security_fresh`. Dates use America/Vancouver.

## Disposition and fixed source

**Requires a numeric-integrity correction before scoped acceptance.** This
original-source report records CDJ-S1 and does not pre-accept later corrections.

Reviewed PR #57 head: `d2ccfdaa4bd1a8f6da9a7cc632e4967cb8463092`, tree
`30ee0e04b49fdc4a7e81fe5cb17effb76fffdd73`, against main
`e49ea1bbafb5005fdf1dfcf60d885b82d0191471`. The three additive files are the
helper, its focused test and the prototype report. Review also covered the local
[SPEC-10 contract](../SPEC-10-CDJ-media-player-diagnostics.md) and
[SPEC-19 requirements](../SPEC-19-scientific-measurement-and-validation.md).
Completed Ledger and Fleet audits were not repeated.

## CDJ-S1 — unchecked derived display error

**Low severity: bounded numeric data integrity. Open at the reviewed source.**
The helper is isolated from production capture and reports; no deployed incident,
exploit or application-wide availability failure is asserted.

[`assessCdjPitchDisplay`](../../app/player/pitch-display.js) validates numeric
inputs and computed `speedPercent` with `Number.isFinite`. Its final
`displayErrorPercentagePoints` is calculated afterward as
`speedPercent - displayedPercent`, without validating the result. Finite
opposite-signed operands can overflow their difference. The accepted numeric
domain permits this because finite supported-range endpoints are caller-supplied.
The helper can therefore return `eligibleForReport: true` with a non-finite
derived metric. Later JSON serialization would turn that value into `null`,
contradicting the eligibility claim and losing the returned numeric value.

This is source-derived arithmetic reasoning, not an execution by this reviewer.
The original test checks ratio overflow but not final-subtraction overflow.

**Required correction:** compute and validate the difference before returning an
eligible measurement; an invalid result must yield an exclusion and
`measurement: null`. Add a benign numeric-boundary regression, retain the failing
baseline and obtain fresh acceptance. Do not invent hardware ranges to conceal
the numerical validation gap. This finding was sent to root and the parallel
functional/code workers. Their executions and later fixes remain separate evidence.

## Existing boundaries supported by source

Positive finite frequencies, a finite display, ordered finite range endpoints,
an in-range display and positive finite uncertainty are required. The method
name must be a nonblank string. Numeric strings and booleans do not pass
`Number.isFinite`; each quality value must be exactly `true`. Unknown quality or
uncertainty is not replaced with favorable defaults or zero uncertainty.

The helper supplies a signed percentage-point result and method identifier,
without a score, RPM conversion, diagnosis or calibrated probability. It has no
import, storage, filesystem, IPC, network, credential or capture operation. No
input mutation appears in the implementation; the range is copied to a new
object and accepted other fields are scalars. Its output remains an ordinary
mutable record, not a frozen or authenticated certificate. This review does not
certify total exception handling for every possible JavaScript object/value.

## Integration limits

The [prototype report](CDJ04_DISPLAY_PROTOTYPE_2026-11-20.md) explicitly limits
this implementation to calculation. The helper cannot establish the truth of
caller-supplied clipping, duration, stability, reference, processing or capture
flags. A positive uncertainty and named method do not evaluate an uncertainty
budget or independently calibrate the clock.

Full SPEC-10 provenance, evidence/run IDs, capture/reference compatibility,
SPEC-19 uncertainty components/coverage factor and faithful data round trips
remain future integration work. These are declared scope boundaries, not hidden
implementation claims. `eligibleForReport` can only mean the helper's supplied
calculation gates passed; it must not become complete report/session
qualification. A supplied range does not prove a physical model supports it,
and a displayed difference does not establish a statistically resolved ranking.
The corrected helper must continue to be described as an isolated prototype.

## Evidence and handoff

The checkout began clean. Fixed-ref diff, helper/tests/report, local specs,
hashes and whitespace were inspected. The original `git diff --check` passed.

| Inspected file | SHA-256 |
| --- | --- |
| `app/player/pitch-display.js` | `6fbd3f1e8fc5c3810ba4b53fbddfbc13011d2bb6133353b41684e89c64b26cb5` |
| `tests/cdj-pitch-display.test.mjs` | `fd5f83e47c6d7fdd21a97688a81961224c7b87c1450864d886b28a1143dce905` |
| `docs/engineering/CDJ04_DISPLAY_PROTOTYPE_2026-11-20.md` | `d3328f3d88e64f26dc179c6acd7db381d12173e873270e6b6650e9b780b41f60` |
| `docs/SPEC-10-CDJ-media-player-diagnostics.md` | `282ec2b87c54c556b2c4e9a486a8ba2678383628eb240dfde7ca50bd02f8975f` |
| `docs/SPEC-19-scientific-measurement-and-validation.md` | `ed2926388ab9c418d303dddaab42e1d80e54e7f7a382057813da085cc81a5c5b` |

The original PR's **8/8** result is author evidence, not this reviewer's
execution. No application/native/browser test, runtime probe, fuzzing, scanner,
malicious payload, vulnerability reproduction, capture, hardware check or remote
mutation occurred. No production, test, dependency, migration, workflow or
feature-default change was authored. Only this report is committed.

Root should retain CDJ-S1 at this original source and combine it with the
functional worker's baseline/correction evidence. A fresh successor must inspect
the actual changed arithmetic guards before closing this finding. Preserve
published #57/#58, current gates, Fleet default-off, original branches and failure
evidence. Source acceptance does not establish physical or report qualification.
