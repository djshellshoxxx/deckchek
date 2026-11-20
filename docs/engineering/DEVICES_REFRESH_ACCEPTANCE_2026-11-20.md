# Independent Devices refresh acceptance — 20 November 2026

Reviewer: `/root/devices_fresh_acceptance`. Dates use America/Vancouver.

## Source and disposition

Reviewed author commit `6612dbaed32edf9638f65a020d400fe12944a24a`, tree
`0d7a65a171cead2230aaefb8f4d42eee52287752`, against baseline
`7e362e64ee00af6110f04511382af0c77296eb7e`. Production changes only
`app/ui/devices/library-state.js` and `app/ui/screens/devices.js`.

**ACCEPT_FOR_INTEGRATION for the documented refresh-read ordering and catalog
redraw scope.** No introduced blocker was found. This session did not implement
those reviewed production changes. The separate direct-write issue below is
pre-existing and is not covered by this acceptance.

## Standards

The change keeps ordering in the shared-cache owner and view ownership in the
Devices listener. Its Boolean publication result has a real consumer; existing
callers that ignore the result retain their call shape. No hard source-standard
violation, unjustified abstraction or actionable maintainability finding was
identified in the inspected diff. Shared Service, Certificate and Setup
consumers remain independent of a particular Devices visit.

## Spec and contract

The [author's bounded contract](DEVICES_REFRESH_SUCCESSOR_2026-11-20.md) matches
the inspected source. A newer published complete snapshot supersedes an older
read; merely starting a request that later retires does not invalidate another
current consumer. Catalog repaint requires the original visit, latest catalog
event, unchanged content, connected visible section, non-run view and no active
assignment form. The latest-event check also protects a still-pending later
event from an earlier repaint changing its captured DOM identity.

Submitted assignments and their expected-binding persistence checks remain
unchanged. No missing or incorrect requirement was identified within this scope.

## Independent execution

Added one actual-listener compatibility case: a catalog event begins and
completes while Devices stays connected but hidden. It verifies both shared
arrays, unchanged hidden DOM, another active control's focus, the inspector and
updated content when Devices returns.

| Node v24.22.3 execution | Result |
| --- | --- |
| New case selected alone | 1 passed, 0 failed; 268.288600 ms |
| Complete changed lifecycle file | 22 passed, 0 failed, 0 skipped; 384.616346 ms |
| Whitespace validation | Passed |

The selected case overlaps the 22-case run. The predecessor's 94/94 and final
baseline 16-pass/9-fail results remain its own separately recorded execution;
they were not rerun by this reviewer.

## Confirmed pre-existing successor issue

A normal actual-library-helper probe demonstrated this sequence at both
`6612dba` and untouched baseline `7e362e64`: a refresh waits for an older result
list; `saveResult` successfully persists and prepends a new row; the older read
then completes and replaces the cache with its earlier empty snapshot. The
store double retains the persisted row. This demonstrates stale shared UI cache,
not persisted-data loss or a newly introduced regression.

The baseline probe loaded its exact committed library module with relative
imports resolved to unchanged dependencies. This is a deferred ordinary store
read and successful save double, not a native scheduling/database test. Root was
notified before implementation and authorized a separate narrow direct-mutation
correction. Any such correction requires its own fresh independent acceptance;
this review cannot be carried forward to newly authored production bytes.

## Handoff and limits

No full suite, browser, native build, scanner, hardware or remote execution was
performed. Root owns combined qualification and publication. Preserve submitted
writes, default consumers, current failure behavior and the distinction between
read ordering and direct-write ownership.

**Standards:** zero source findings. **Spec:** zero findings within the reviewed
scope. **Separate confirmed pre-existing follow-up:** one result-cache write/read
ordering defect.
