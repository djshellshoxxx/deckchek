# Code audit, round 6 — 19 November 2026

Date: 19 November 2026 (America/Los_Angeles).
Reviewer: a fresh code-audit worker following round 5.

## Decision and reviewed source

**Accept the browser workspace-import durability correction within its stated
contract. No additional production defect was confirmed in that correction.**

Reviewed commit: `1a42c3fabdbfef627b39218db20012cbda2cb7d1`.
Reviewed tree: `fbc4509b7e9c36a82a063d018e4c7d449730bf22`.
The source combines round 5's workspace correction with the separate Service
PDF feedback changes integrated at `0401649`.

Only this report and `tests/workspace-import-ordering.test.mjs` are added by this
review. Production files are unchanged.

## Standards and specification review

The review checked the project's [FS-08 browser workspace contract](../specs/08-backup-restore.md#12-browser-venue-history-archive-2026-11-18)
and the original round-5 fix, rather than treating the browser working set as a
native full-database restore. The native import path and ordinary autosave keep
their previous behavior.

| Concern | Independent assessment |
| --- | --- |
| Write before live replacement | `replaceWorkspace` performs its synchronous storage write before assigning either live array or emitting `runs`. Missing/denied storage and exhausted writes fail before replacement or catalog mirroring. |
| Failure preserves prior data | The failed storage attempt relies on the normal localStorage write contract. The helper does not overwrite active arrays or mutate submitted data while preparing either attempt. |
| Retention and input ownership | The first attempt retains the existing first-250-run working set. The one retry removes older evidence using copied run objects after the first 20, preserving the submitted snapshot. |
| Retained counts | Browser `importParsedWorkspace` returns the saved run list in the existing result shape, so Data displays the retained count. Existing native counts are separate. |
| Notification and catalog ordering | `runs` follows the workspace commit. Catalog mirroring follows it and remains best effort. `history` follows the mirror loop. A failed mirror does not roll back or erase the committed workspace. |
| PDF integration | The diff from the Service integration changes only the state import and workspace-import block in `persistence.js`. `exportPdfWithFeedback`, its default callback, retry ownership and submitted-export behavior are unchanged by round 5. |
| Scope control | No format/version, limit, measurement threshold, feature flag, security gate, native command or release behavior changes in this review. |

The saved workspace and the catalog mirror are separate values. This acceptance
does not claim an atomic multi-key browser transaction or guaranteed mirror
success. Cross-tab arbitration and crash/restart qualification are outside this
bounded review.

## Independent execution

The new ordering tests drive the actual `importParsedWorkspace` function with
ordinary parsed records and controlled browser-storage/catalog dependencies.
They add three checks:

1. A throwing `localStorage` getter leaves the prior saved and active workspace
   intact, emits neither run nor history events, and never starts mirroring.
2. A deferred catalog save begins only after the new saved workspace and active
   arrays agree. Rejecting that save preserves the workspace, continues the next
   mirror attempt, and publishes history after the loop. The input stays intact.
3. At 19, 20 and 21 runs, the existing retry policy succeeds without modifying a
   frozen submitted snapshot. The first 20 keep evidence and only the next run
   loses evidence in the staged retry.

The focused command was:

```sh
node --test --test-concurrency=1 \
  tests/workspace-import-ordering.test.mjs \
  tests/workspace-persistence.test.mjs
```

Actual runtime: Node **22.23.4**. Result: **9 passed, zero failed, zero skipped**,
**357.954552 ms**. This combines three new independent checks with the six
existing durability cases, including the actual Data failure/success handlers,
missing storage, failed writes, reduced-evidence retry and 251-to-250 retained
count. Log: `/tmp/deckchek-code-round6-ordering.log` in the review execution environment.

Round 5's separate 40/40 result is not added to this overlapping count. The
review did not run the complete JavaScript suite, PDF/browser smoke, native
build, native chooser, platform workflow or physical hardware. Whitespace
validation passed.

## Fresh-worker handoff

Integrate this test/report commit, then qualify the final combined source with
its applicable gates. Repeating this unchanged nine-case scope solely for a
report edit adds no evidence.

One separate source-level inspection candidate remains in the existing Data
controller: browser imports do not acquire the native operation-busy lease, and
completion feedback after awaiting catalog mirroring checks visibility through
`setStatus`, but not the captured visibility generation or a distinct import
request. A fresh bug worker may inspect overlapping imports or a hide/show cycle
before mirror completion. This observation is not a reproduced defect in this
round and does not change the accepted durable-write ordering. Preserve completed
workspace writes if a later UI callback loses ownership.
