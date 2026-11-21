# Fresh CDJ-04 defensive acceptance — 20 November 2026

Reviewer: `/root/cdj04_security_acceptance_fresh`. Dates use America/Vancouver.

## Disposition and exact source

**ACCEPT_FOR_INTEGRATION within this defensive source-review scope.** CDJ-S1
from the [original audit](CDJ04_SECURITY_AUDIT_2026-11-20.md) is resolved by the
checked final-difference path. The related early-exclusion and positive-ratio
guards are accepted. No remaining scoped numeric-integrity blocker was found.
This is independent source acceptance, not runtime or complete-report validation.

| Role | Source identity |
| --- | --- |
| Original PR #57 | `d2ccfdaa4bd1a8f6da9a7cc632e4967cb8463092` |
| Reviewed combined source | `abafd5565e00a2154b6b833e20ccd3a42a713ae7` |
| Reviewed tree | `1126a31bfc95aabc71ca5532bc8bed57b49ef7fc` |
| Author correction | `61e5a750928d391d0c3ba41f4a8274053a1b55be` |
| Preserved Ledger candidate | `eba46183fecd9d698515411865e710021dcba632` |

Git comparison independently confirmed that the corrected helper and regression
file exactly match the author's correction. Compared with the preserved Ledger
candidate, those are the only added application/test files. No other application,
native, database, workflow, dependency, tool or mobile file changes in this
follow-up. Completed Ledger and Fleet reviews were not repeated.

## CDJ-S1 and related guard acceptance

The [helper](../../app/player/pitch-display.js) now computes
`displayErrorPercentagePoints`, checks it with `Number.isFinite`, and only then
places that same value in an eligible measurement. An unrepresentable difference
returns `eligibleForReport: false`, an `invalid_display_error` exclusion and
`measurement: null`. The original unchecked-subtraction path is removed. This
closes CDJ-S1 without inventing a physical range or clamping a measured mismatch.

Input, quality and uncertainty exclusions now return before division. A rejected
numeric type therefore does not proceed to the corrected metric arithmetic.
For accepted primitive numeric inputs, the derived frequency ratio must remain
positive and finite, and the computed speed must be finite. A ratio that rounds
to zero or another invalid derived ratio returns an exclusion and null
measurement. The final difference has its separate check described above.

Within ordinary data-record inputs, an eligible result consequently contains
finite numeric fields: the input frequencies, display, range endpoints and
uncertainty are validated before arithmetic, and both returned derived metrics
are validated afterward. This removes the identified non-finite-number-to-null
serialization loss. It does not certify every possible JavaScript object's
exception behavior, exact real-number precision or every future serializer.

The new regression assertions cover final-difference overflow, ratio underflow
and rejected numeric types. The difference case checks the excluded result's
JSON round trip. These are source inspections of retained tests, not executions
by this reviewer. The existing signed formula and percentage-point units remain
unchanged; the helper introduces no score, RPM conversion or diagnostic verdict.

## Preserved evidence and authority boundaries

Each of the six quality flags must still equal `true`; missing, false or unknown
values remain exclusions. Positive finite expanded uncertainty and a nonblank
method string are still required. The supplied range must have finite ordered
endpoints and contain the entered display. No favorable default, numeric
coercion, tolerance change or claim about a model's physical range was added.

The helper remains a pure calculation with local result objects and no input
mutation. It has no import, network, storage, filesystem, IPC, credential,
capture or privileged operation. Source references in the application/mobile/
native/tool/test scope occur only in its definition and focused test. The
output is still a mutable data record, not an authenticated or immutable proof.

Caller-supplied flags and uncertainty do not establish their underlying truth.
The [prototype's limits](CDJ04_DISPLAY_PROTOTYPE_2026-11-20.md),
[SPEC-10](../SPEC-10-CDJ-media-player-diagnostics.md) and
[SPEC-19](../SPEC-19-scientific-measurement-and-validation.md) continue to require
capture/reference provenance, run/evidence identity, compatible conditions,
uncertainty components and coverage factor, faithful persistence/reporting and
physical validation before full integration. `eligibleForReport` denotes only
this helper's supplied calculation gates; it is not complete session or report
qualification. No feature, threshold or security gate is relaxed by this review.

## Verification and handoff

The worktree began clean. This reviewer inspected fixed refs, the corrected diff,
complete helper, test assertions, prototype limitations, local specifications,
consumer references and file hashes. The focused source/test whitespace check
passed. All five inspected hashes remained unchanged during review.

| Inspected file | SHA-256 |
| --- | --- |
| `app/player/pitch-display.js` | `040a0703f8d68cecedae43616b977378f11baf5f6ac8e18be487e1bd85262988` |
| `tests/cdj-pitch-display.test.mjs` | `acdea851530a2471f3e9823a9aebd587b3f24225a93674778409cf05a2a2141f` |
| `docs/engineering/CDJ04_DISPLAY_PROTOTYPE_2026-11-20.md` | `d3328f3d88e64f26dc179c6acd7db381d12173e873270e6b6650e9b780b41f60` |
| `docs/SPEC-10-CDJ-media-player-diagnostics.md` | `282ec2b87c54c556b2c4e9a486a8ba2678383628eb240dfde7ca50bd02f8975f` |
| `docs/SPEC-19-scientific-measurement-and-validation.md` | `ed2926388ab9c418d303dddaab42e1d80e54e7f7a382057813da085cc81a5c5b` |

The retained functional author evidence records **8 passed / 3 failed** on the
original helper and **11/11** after correction under Node 22.23.4. These are
author executions, not independent test results from this report. The fresh
functional worker's execution remains separate; overlapping counts are not added.

No application/native/browser/security tests, runtime probes, scanners, fuzzing,
vulnerability reproduction, capture, hardware or remote action occurred here.
Only this report is authored. Root should retain the original finding and failed
baseline, combine the fresh code and functional dispositions, and qualify the
exact publication source at its applicable hosted gates. Preserve #57/#58,
original branches, Fleet default-off and physical/owner qualification.
