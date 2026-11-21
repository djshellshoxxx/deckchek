# Service comparison: missing baseline correction

## Current scope

This is an **authored, unexecuted** correction for
[issue #86](https://github.com/djshellshoxxx/deckchek/issues/86). A scheduled
static audit reported that after-only measurements were excluded from the
comparison denominator. Root independently read the actual comparison,
stepper, screen and print paths before authoring this correction.

The old calculation could call an after-only comparison complete with zero
metrics, or call a mixed paired/after-only comparison complete. That could
mark the After step done and omit the printed incomplete-comparison warning.
No runtime incident or reproduction is claimed for the original finding.

All three preceding backup webview reviewers finished with a STATIC HOLD on
`d0b8992ce326e88bfe46d6135859744f83223527`. Root read their complete reports,
independently verified their sole-report commits and every original source
byte/mode, then merged them at `34d09f790bea68a6ce5555b60f97d20fd007dbb5`.
The [root custody proof](evidence/backup-webview-static-hold-2026-11-21/root-source-proof.json)
retains the exact identities. No project code ran in that cohort.

The fresh round-fourteen code, functional/bug-hunt and defensive-security
workers review this independent Service correction while root authors the
backup recovery correction in a separate worktree. This source still contains
the unexecuted backup candidate and its documented HOLD. A scoped Service
acceptance cannot clear it or qualify the full tree. Native #85 stays open.

## Product behavior

`comparisonCompleteness` now includes every comparison row in `total` and
counts `missingBefore` and `missingAfter` separately. Either missing phase
produces `partial`; no rows produces `empty`; all rows with both phases retain
the existing `complete` result. Existing `state`, `missing`, `total` and `message`
fields remain, with the two directional counts added.

The warning identifies the missing phase or both phases and uses the full
observed-row denominator. After-only observations remain in the table. Paired
and before-only wording is preserved. Method/unit comparability and uncertainty
verdicts remain separate from presence of both phases.

The actual comparison panel uses the directional counts for its guidance.
Missing baselines prompt linking existing pre-repair measurements where
available and remain explicitly unavailable otherwise. Missing after values
still prompt the relevant after tests. The guidance does not suggest creating
a historical baseline after the repair.

Existing consumers already propagate `partial` to the After step, screen-reader
summary and printed job-sheet warning. Those mechanisms remain unchanged.
Job status and final-sheet status remain independent: this correction neither
adds a transition restriction nor removes valid after-only observations.

No native command, schema, persistence, customer-data handling, dependency,
audio calculation, permission, feature default or Mobile asset changes.

## Authored coverage, not passing results

Eleven new named cases exercise original modules:

- Eight table-driven cases cover one/several after-only metrics, paired plus
  after-only, before-only, paired plus before-only, both missing directions,
  no observations and all paired metrics. They assert counts/messages and
  preserve input and comparison-row data.
- One integrated model/print case retains an after-only row, keeps After open,
  includes the warning in both job-sheet HTML and the actual printable report
  pipeline, and preserves independent finalization/status behavior.
- Two actual Service screen cases cover missing-baseline guidance and live
  announcements, plus a delayed mixed comparison that preserves the existing
  unsaved status-note control, value and focus without mutation commands.

The proposed first selection is `service.test.mjs`,
`service-screen-lifecycle.test.mjs`, `service-panel-lifecycle.test.mjs`,
`service-intake-lifecycle.test.mjs`, `service-pii-leak.test.mjs` and
`crosslinks.test.mjs`, all under `tests/`. This proposal grants no execution.
Workers must inspect all selected source, fixtures and relevant consumers.

Only the current functional worker may run an exact separately root-authorized
bounded FIRST command after static acceptance and complete recorder/configuration
and runtime review. Root never executes project code. Preserve original streams,
all pre/post tracked bytes/modes, HEAD/tree/ordered parents and inventories.
DOM/bridge seams do not qualify real browser/native/physical behavior.

## Preserved gates

Qualified main remains `e36ddc41806b0f6639474f207e3b339e063a6e25`; the durable
Player checkpoint remains `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`.
The full-source audio HOLD retains its first 2,420 total / 2,418 pass / one
failure / one optional skip, including the unexplained -101 dB observation.
Fleet stays default-off and its fixed diagnostic is not rerun. Issue #86 remains
open pending qualification/integration; no release or deployment is implied.
