# CDJ-04 reviewed calculation continuation — 20 November 2026

Dates use America/Vancouver. The corrected CDJ-04 calculation prototype has
completed independent code, functional and defensive acceptance. It remains
unwired to capture, screens, storage and reports. This checkpoint retains the
published Ledger candidate unchanged in its runtime paths and advances a
separate unfinished part of [SPEC-10](../SPEC-10-CDJ-media-player-diagnostics.md).

## Corrected behavior

The helper compares measured reference-tone speed with an operator-entered
display percentage and retains the signed difference in percentage points.
Three ordinary numerical-contract defects in the original prototype are fixed:

| Finding | Result after correction |
| --- | --- |
| Positive operands divide to a ratio rounded to zero | The ratio must remain positive and finite; an unrepresentable ratio yields an exclusion and null measurement. |
| Finite speed and displayed values subtract to a non-finite difference | The final difference is checked before eligibility; invalid arithmetic cannot enter an eligible numeric result. |
| Rejected numeric types still reach arithmetic | Accumulated input, range, quality and uncertainty exclusions return before division/subtraction. |

Valid positive, negative and zero values retain their existing sign, formula and
units. The supplied display range, six strict quality flags and positive named
uncertainty requirement remain intact. No physical range was inferred, measured
speed clamped, hardware threshold added or score invented.

## Source and preservation

| Role | Commit / tree |
| --- | --- |
| Retained Ledger #58 head | `eba46183fecd9d698515411865e710021dcba632` / `f0313256f4c9e20ede6d63b73d7c3a423ec63bb1` |
| Original prototype #57 | `d2ccfdaa4bd1a8f6da9a7cc632e4967cb8463092` / `30ee0e04b49fdc4a7e81fe5cb17effb76fffdd73` |
| Author's numerical correction | `61e5a750928d391d0c3ba41f4a8274053a1b55be` / `c992ed617d7161d94ca695543fc0eef1140806a7` |
| Frozen combined review/execution source | `abafd5565e00a2154b6b833e20ccd3a42a713ae7` / `1126a31bfc95aabc71ca5532bc8bed57b49ef7fc` |
| Durable equivalent source | `014b150b6c85a6795fb1ae015ea2eb6d97b3c029` / `1126a31bfc95aabc71ca5532bc8bed57b49ef7fc` |

The [durable equivalent source](https://github.com/djshellshoxxx/deckchek/commit/014b150b6c85a6795fb1ae015ea2eb6d97b3c029)
was fetched independently and compared with the entire frozen tree. Both #57
and #58 are verified ancestors, preserving the earlier #47–#56 ancestry too.
Only the new helper and its new test file are added to the application/test
paths; no existing application, native, database, workflow or mobile file changes.
The later acceptance reports, evidence copies and continuation headers are a
documentation-only overlay.

The successor branch is `integration/deckchek-cdj04-continuation-20261120`,
stacked above the stable #58 branch. Inspect the live associated PR and checks
before integration; a durable source object alone is not hosted qualification.
Original branches and failed baselines are preserved.

## Completed worker handoffs

All three original reviewers completed their work before root assigned the
corrected combined source to three fresh acceptance workers.

| Stage | Disposition |
| --- | --- |
| Initial code audit | [CDJ-C1/C2](CDJ04_CODE_AUDIT_2026-11-20.md): incomplete derived-number checks and arithmetic after rejected inputs; original source requires correction. |
| Functional author | [Three defects and correction](CDJ04_FUNCTIONAL_AUDIT_2026-11-20.md): retained original, failing-baseline and corrected executions. |
| Initial defensive audit | [CDJ-S1](CDJ04_SECURITY_AUDIT_2026-11-20.md): final-difference overflow; no pre-acceptance of the later fix. |
| Fresh code acceptance | [Accepted](CDJ04_CODE_ACCEPTANCE_2026-11-20.md): CDJ-C1/C2 closed, no remaining scoped code blocker. |
| Fresh functional acceptance | [Accepted](CDJ04_FUNCTIONAL_ACCEPTANCE_2026-11-20.md): independent 11/11 execution at the exact combined source. |
| Fresh defensive acceptance | [Accepted](CDJ04_SECURITY_ACCEPTANCE_2026-11-20.md): CDJ-S1 resolved within the pure calculation's source boundaries. |

## Verification and its limits

| Execution | Result and source boundary |
| --- | --- |
| Original prototype's existing tests | 8 passed / zero failed on Node 22.23.4; all 1,531 tracked hashes unchanged. |
| New regressions against the unchanged original helper | 8 passed / 3 failed; implementation and test hashes retained. |
| Author's corrected helper | 11 passed / zero failed, no skips/cancellations; 85.799500 ms TAP. |
| Fresh independent combined-source check | 11 passed / zero failed, no skips/cancellations; 108.801208 ms TAP, 0.259776915 s enclosing; all 1,568 tracked hashes unchanged and checkout clean. |

The eleven-case scopes overlap and are not additive. Two changed JavaScript
syntax checks and scoped whitespace checks passed. The fresh workers independently
matched helper/test bytes to the author. The independent log SHA-256 is
`eecb0cc5ea3b5d0c06aaf1d81ed94d6cb5c996815867d543e552085839c14c72`.
The [independent record](evidence/cdj04-numeric-2026-11-20/independent-acceptance.json)
and [log](evidence/cdj04-numeric-2026-11-20/independent-acceptance.log) are retained
beside the original and author red/green evidence.

The preceding [Ledger qualification](LEDGER_CONSOLIDATION_2026-11-20.md) passed
2,222 tests / zero failures / one optional skip, static gates and two performance
proxies at its own frozen source. That result is preserved, not relabeled as a
full-suite run of this CDJ candidate. The new isolated helper has no production
consumer; existing runtime bytes were compared and unchanged. No unchanged full
local suite was repeated merely for this additive module. The new candidate
still requires its own applicable hosted standard, nightly and desktop gates.

## Current consolidation and next work

Main was last verified as `e49ea1bbafb5005fdf1dfcf60d885b82d0191471` after #46
merged. PRs #47, #48, #49, #50, #51, #52, #53, #55 and #56 are closed as
superseded by #58, with every original head/branch retained. #54 remains open:
standard tests and six platform builds passed; packaged smokes and nightly
cargo fuzzing remained pending at the latest read. #58's exact-source workflows
were queued. Use live checks before any guarded merge and preserve candidate
heads while qualification runs.

The separately published [Fleet diagnostic checkpoint](https://github.com/djshellshoxxx/deckchek/blob/2c93d658f4703c863405064121c975f8679592eb/docs/engineering/FLEET_NATIVE_PHASE_MEASUREMENT_2026-11-20.md)
retains its three completed reviews, migration-copy correction, original isolated
2/2 observation and independent compile killed before tests. It is not part of
this candidate and does not resolve #47's recorded 200.055967 ms / 200 ms failure.

The next useful fresh-worker scope is the existing capture/history/report
interfaces and the smallest CDJ evidence record required by SPEC-10. Establish
and retain asset/model, reference identity, capture/routing, processing, quality,
method/units and uncertainty provenance before exposing a qualified player
report. A supplied `true` flag is not proof of those facts. `eligibleForReport`
here denotes only the helper's supplied calculation gates. Keep missing and
untested evidence explicit; add actual record round-trip tests when that record
exists. Preserve the remaining wrong-reference/unstable-tone, estimator, physical
two-player, full UI/report and scientific-validation gates.

The existing continuation stays enabled with completed findings handed to fresh
successors. Do useful new work on owned branches while published checks run;
do not repeat unchanged accepted audits. Preserve Fleet default-off, limits,
permissions, security/performance gates and branches. No release, deployment,
tag or history rewrite is included. Credit balance is unavailable; disk,
transport, compiler or CI failures do not establish exhaustion.
