# Bug hunt round 6 — independent feedback and phone-refresh review

Date: 19 November 2026 (America/Los_Angeles).

## Source and disposition

Reviewed integrated source `c9a7f18069d1c92d18e2674e6175b65f0ec8b8a1`,
tree `95623d6fd28a6a12e3f358f0594b5f000250a815`, containing the round-5
correction originally authored as `2527824929aeb28960da66468af6276f587c81d7`.

**Accepted within the documented ownership contract. No additional production
correction was identified.** This review changes only the existing phone asset
lifecycle test file and this report.

## Independent source findings

| Concern | Assessment |
| --- | --- |
| Delayed message ownership | Each live-region element owns its pending timer. A replacement clears only that region's earlier timer; the callback also verifies its identity before delivery. |
| Separate announcement channels | Polite and assertive pending work are independent. The 40 ms delay and clearing needed to repeat identical messages remain. |
| Optional caller guard | The predicate runs before clearing current feedback and again before the delayed write. A retired guarded call cannot erase current feedback. |
| Actual navigation | Moving between registered screen entries retires pending work in both regions. Reselecting the same entry does not cancel its pending announcement. |
| Verify result ownership | The delayed callback checks result token, picker generation, current visibility and result visibility. Escape and actual navigation retire feedback while the existing cached hidden verification result remains available. |
| Phone feedback | Read/file-error feedback keeps the read token; save feedback keeps the parsed result's ownership. Clear or replacement results retire the corresponding feedback without cancelling a submitted or completed write. Actual navigation also retires already queued announcements. |
| Asset-list ordering | Each read has its own generation; a superseded success or error returns without assigning a list or requesting a preview render. Hiding invalidates pending reads and returning starts a fresh read. |

I also inspected the existing actual-handler save tests: they distinguish retiring
completion feedback from preserving the submitted History write, and retain
newer form identity, selection and focus. No backend persistence, limits, feature
flags, thresholds or native commands changed in this round.

## Independent execution

The predecessor's two asset-list cases establish out-of-order response behavior.
They did not directly exercise a pending read that finishes while the Phone
screen is hidden, followed by a fresh read on return. Two additional normal
actual-handler controls now cover success and failure in that sequence.

The new cases verify that:

- The hidden read does not recreate the cached selector or replace its options.
- Focus remains on the other active control.
- Returning starts a fresh catalog request.
- The current response adds its new option while retaining the explicit asset
  selection.

Command:

```sh
node --test --test-concurrency=1 tests/phone-import-assets-lifecycle.test.mjs
```

Executed with Node **22.23.4**: **4 passed, zero failed, zero skipped, zero
cancelled**, in **157.233075 ms**. This includes the two original ordering cases
and the two new hide/return cases. Log:
`/tmp/deckchek-bug-round6-assets-review.log`.

The round-5 retained TAP summaries were inspected and match its **142/142**
announcement/compatibility scope and later **41/41** affected phone scope. Those
are the predecessor's execution evidence, not new runs by this reviewer, and
these overlapping counts must not be added together.

## Execution limits and environment

Initial worktree creation stopped at a shared-disk capacity error before any
application test ran. Root removed completed clean temporary checkouts while
preserving their commits, branches and reports. The existing review branch was
then checked out successfully. No unrelated workspace cleanup was performed by
this reviewer.

No production changes, full-repository suite, browser launch, native build,
physical screen-reader test, remote publication or release was performed. Source
and DOM assertions do not establish the timing of spoken assistive-technology
output. Root owns final combined-source and hosted qualification.

## Fresh-worker handoff

Integrate this test/report commit and qualify the combined candidate. No confirmed
issue remains open within the reviewed four-file correction. The next scheduled
review should start from the latest published source and its actual CI results.

The optional announcement predicate does not automatically supply ownership to
all legacy callers. Any later same-screen component review should identify an
actual retired caller before proposing a change, retain independent live-region
behavior, and preserve already submitted backend work. Do not repeat unchanged
passed scopes merely to generate another audit round.
