# DeckChek fresh code audit, round 5 — 19 November 2026

## Scope and baseline

This successor investigated the workspace-persistence candidate identified in
[round 4](CODE_AUDIT_ROUND4_2026-11-19.md). The isolated baseline was `4678b69`,
containing the integrated earlier code, bug and security corrections and the
strict Stylus checkbox expectation. Root's concurrent phone/certificate changes
and round 3 Service/PDF changes were outside this worker's checkout.

The investigation used ordinary storage write failures through the actual
browser Data import handler and the public workspace import functions. No
network probing, browser process, full application/native build, physical
hardware or full JavaScript suite was run here.

## Confirmed defect

The existing browser import replaced the active equipment and run arrays before
calling `saveWorkspace()`. That autosave helper deliberately tolerated write
failure, including a failed reduced-evidence retry, and returned no persistence
result. Import then mirrored runs to the catalog and reported success.

With every storage write throwing `QuotaExceededError`, the actual Data screen
reported **“Imported 22 run(s) and 1 equipment item(s)”**. Direct import also
resolved when browser storage was absent and after both workspace write attempts
failed. In the absent-storage case, the shared `storageSet()` optional call
returned true without any storage operation. This correction does not change
that shared helper's behavior for unrelated background saves.

A related count mismatch was corrected within the same import contract: a file
with 251 accepted runs used to report all 251 although the existing workspace
retains and mirrors only the first 250. The actual Data handler now reports 250.

## Correction

`replaceWorkspace()` in `app/ui/state.js` stages a browser import and requires a
real writable storage object. It preserves the existing maximum of **250 runs**
and the existing **one retry** after a failed write. The retry retains evidence
for the first **20 runs** and removes evidence from older retained runs in copied
run objects. It does not mutate the submitted snapshot.

Only a successful workspace write replaces the active arrays and emits the new
run set. If storage is missing or both writes fail, the existing saved workspace,
active workspace and catalog are unchanged; no imported-history notification or
catalog mirroring begins. The error reaches the existing Data/History import
error handling.

`importParsedWorkspace()` uses this stricter path in browser mode and returns the
committed retained run list in the existing result object shape. Its native path
continues to use the previous local working-set behavior. Normal autosave is
unchanged. Successful browser imports still perform the existing best-effort
catalog mirroring after the workspace commit; this is not a multi-key transaction.

## Standards and specification review

The fix separates an explicit replacement's success contract from background
autosave tolerance, without changing general storage helpers or native import.
State is committed only after the synchronous workspace write succeeds. Existing
run sanitization, file bounds, native backup commands, schemas, flags and
measurement thresholds remain unchanged.

[FS-08 §12](../specs/08-backup-restore.md#12-browser-venue-history-archive-2026-11-18)
now records browser workspace replacement, retention and failure semantics,
including the separate best-effort catalog writes. No native whole-import
transaction, cross-tab atomicity, platform or hardware qualification is claimed.

## Verification

Runtime: Node **22.23.4**, serial test execution.

| Check | Result |
| --- | --- |
| Initial five-case run | 0 passed / 5 failed: three real persistence failures and two test comparison errors |
| Corrected pre-fix reproduction | 2 passed / 3 failed / 0 skipped |
| First correction scope | 5 passed / 0 failed / 0 skipped |
| Final related scope, including actual Data retained-count check | **40 passed / 0 failed / 0 skipped** |
| `git diff --check` | Passed |

The two initial comparison errors expected `JSON.stringify()` to preserve
properties whose values were `undefined`. Those assertions were corrected to
compare serialized snapshots before changing production code. The corrected
pre-fix run retains the genuine failing scenarios and the two passing controls.

The six new tests cover actual Data failure feedback, no false success, prior
saved and active data preservation, absence of imported-history notifications,
no catalog mirroring after a failed replacement, absent storage, input snapshot
preservation, successful write-before-notification ordering, the exact existing
reduced-evidence retry, and the 250-run limit and visible count.

The final 40-test command was:

```sh
node --test --test-concurrency=1 \
  tests/workspace-persistence.test.mjs \
  tests/workspace-file-boundary.test.mjs \
  tests/workspace-render-boundary.test.mjs \
  tests/backup.test.mjs \
  tests/backup-ui.test.mjs
```

It completed in **2,573.858037 ms**. Local evidence is
`/tmp/deckchek-code-round5-red.log`,
`/tmp/deckchek-code-round5-red-corrected.log`,
`/tmp/deckchek-code-round5-green.log` and
`/tmp/deckchek-code-round5-final-focused.log`.

## Fresh-worker handoff

Integrate this bounded import correction with the Service/PDF worker's distinct
`exportPdfWithFeedback()` changes. This worker touches `persistence.js` only in its
state import and `importParsedWorkspace()` block. Root owns final combined-source
qualification and hosted results.

A successor should independently review the combined state/write/notification
ordering and caller-visible retained counts. Keep ordinary autosave, native
import and separate catalog mirroring explicitly scoped. Do not repeat the full
branch archaeology or earlier signal-heavy suites for this small storage fix.
No additional confirmed production defect remains open in this worker's scope.
