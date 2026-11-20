# Bug hunt round 5 — delayed feedback and phone asset refresh

Date: 19 November 2026 (America/Los_Angeles).

Reviewed and changed from integrated source
`5c8d4ff4c96dc0d0418e6a3c7f0a27f504772f42`
(`fix(import): retire stale picker and phone save callbacks`).
The worker used an isolated `fix/deckchek-bug-round5-20261119` worktree.

## Confirmed announcement defects

The shared `announce()` function cleared a live region and wrote the requested
message 40 ms later. It did not retain ownership of that scheduled write.
Consequently, an older message could briefly appear during a newer message's
delay; an assertive message from an old screen could arrive after navigation,
because the shell's new screen message used the separate polite region.

Ordinary actual-handler tests also reproduced queued certificate-result feedback
after Verify's Escape action and queued phone read/save feedback after Clear.
The save was already complete in that last case; only its delayed feedback had
lost ownership.

The initial twelve-case reproduction recorded **2 passes / 10 failures**, with
no skipped or cancelled cases. The two passing controls covered normal independent
polite/assertive channels and same-screen navigation.

## Correction and preserved behavior

`app/ui/live.js` now tracks the pending write separately for each live-region
element. A newer message retires only the older pending message in that channel.
The existing 40 ms delay remains, and identical messages can still be announced
again. Delivered messages and toast behavior are not rewritten by cancellation.

An optional `isCurrent` predicate defaults to the existing unguarded behavior.
It is checked before clearing the region and again when the timer fires. An
already retired caller therefore cannot clear current feedback. Pending callbacks
also check their request identity, so retired scheduled work cannot write later.

The shell cancels pending announcements in both channels only when moving to a
different registered screen. Reselecting the current screen and its `onShow`
callback preserve valid pending feedback. Polite and assertive channels otherwise
remain independent.

Verify passes its selected-result token and visibility generation to the delayed
announcement. Escape, a replacement result or hiding retires that announcement;
the established cached hidden verification result remains intact. Phone read,
file-error and save feedback use their existing request/result ownership through
delivery. Clearing a form does not undo an already submitted or completed save.

## Separate confirmed phone asset-list defect

`loadAssets()` was called during construction and on return to the cached Phone
screen without a request generation. A slower earlier response or failure could
replace a newer asset list and recreate the selector after the user had selected
and focused it. The separate two-case reproduction recorded **0 passes / 2
failures** using normal deferred catalog responses.

A separate asset-read generation now accepts only the current response. A retired
success or failure neither assigns assets nor triggers its caller's preview
render. Hiding the screen retires pending read-only loads; returning requests a
fresh list. Existing current-load failure behavior is preserved. This correction
stays within `app/ui/workflows/import-phone.js` and does not alter persistence.

## Verification

All runs used Node **22.23.4** with `--test --test-concurrency=1`.

| Scope | Result | TAP duration |
| --- | --- | ---: |
| Announcement reproduction before production changes | 2 passed / 10 failed / 0 skipped | 173.922556 ms |
| Corrected new announcement cases | 12 passed / 0 failed / 0 skipped | 179.077982 ms |
| Announcement plus existing Service panel/screen, Verify, phone and navigation/feature scope | 142 passed / 0 failed / 0 skipped | 7,122.854628 ms |
| Separate asset-list reproduction before that correction | 0 passed / 2 failed / 0 skipped | 317.702833 ms |
| Final affected phone/asset/announcement scope | 41 passed / 0 failed / 0 skipped | 970.371697 ms |

The 41-test final affected scope includes the two new asset cases, twelve
announcement cases and existing phone file/save/UI cases. These scopes overlap;
the counts must not be added as a unique total. The 142-test result precedes the
small asset-generation addition, which was then qualified through its affected
phone scope.

Logs retained in scratch:

- `/tmp/deckchek-bug-round5-red.log`
- `/tmp/deckchek-bug-round5-green.log`
- `/tmp/deckchek-bug-round5-qualified.log`
- `/tmp/deckchek-bug-round5-assets-red.log`
- `/tmp/deckchek-bug-round5-assets-green.log`

The tests use the production announcement helper, real cached shell navigation,
real phone/Verify event handlers and deterministic timers. Assertions cover the
interval before the newer timer fires, independent channels, immediate return,
current controls, retained completed History writes, selector identity, selection
and focus. No shared DOM fixture was changed.

## Changed source and limits

Production changes are limited to `app/ui/live.js`, `app/ui/shell.js`,
`app/ui/screens/verify.js` and `app/ui/workflows/import-phone.js`. The new tests are
`tests/live-announcement-lifecycle.test.mjs` and
`tests/phone-import-assets-lifecycle.test.mjs`.

No Data screen, job-sheet renderer, Service, native command, file limit, feature
flag, measurement threshold, gate, release or deployment was changed. No browser,
full-repository test suite, native build or physical screen-reader execution was
performed. These tests prove DOM update ownership, not spoken-delivery behavior
on assistive technology. Root owns final combined-source and hosted qualification.

## Fresh-worker handoff

Independently review the four-file combined correction and retain the distinction
between cancelling feedback and cancelling backend work. No additional confirmed
defect remains open within this round's changed scope.

The optional predicate does not automatically add component ownership to every
legacy `announce()` call. A bounded future inspection can examine same-screen
component retirement where an assertive validation message has already been
queued but the component is dismissed before delivery. Cross-screen navigation
and newer same-channel messages are handled here; no unexecuted same-screen
legacy-caller scenario is claimed as a confirmed defect.
