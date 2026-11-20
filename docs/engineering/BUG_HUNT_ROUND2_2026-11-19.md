# Service workflow bug hunt, round 2

## Source and independent review

This fresh-worker round starts from `879942dde6a1b0ab7d775c0d0d4d6ec15b34968d`,
the preceding Service lifecycle repair on main baseline
`8c43cf17e3d5f5067ece5667f1aec1540f4b4091`.

The preceding status, work-log, creation and comparison ownership changes were
independently inspected. Their existing 21 lifecycle regression cases remained
green while the nine new cases below failed. No defect in those preceding
changes was established within this scope.

## Verified defects and repairs

### Customer searches could display obsolete results and errors

An older customer query could complete after the latest query and replace its
options. It could also publish errors after switching to New customer or after
opening a replacement form. A query still completing during the debounce delay
was not invalidated until the newer request eventually began.

The form now invalidates the previous request when the input or customer mode
changes. Each dispatch captures its query and request identity. Only the current
form, mode and request may update the result or error. The customer selector is
unavailable while loading or after failure; recovered results still require an
explicit selection. A retired form cannot initiate a new lookup or submission.

### Deferred unit loading reset operator selections

The initial asynchronous library/asset refresh rebuilt both selectors from the
original preset. A unit chosen after the form appeared was replaced by the
preset; choosing New unit also lost the selected device model. This could change
the unit or model used by a subsequent submission.

The refresh now retains the current unit and model selections and preserves
typed nickname, serial and fault fields. The original preset remains the default
for a form the operator has not changed. A cleared choice stays clear; a selected
unit that disappeared becomes unselected instead of falling back to the preset.
The preserved model is verified in the actual `job_create` payload.

### Completed deletion could discard a replacement form

Deletion success always returned to the list, even after the operator opened a
different job or a new intake form. Deletion failure and optional customer
cleanup failure could also display unrelated feedback on the replacement view.

The confirmation and completion retain the original job/view ownership.
Already confirmed persistence and optional customer cleanup can finish, while
obsolete completion cannot replace a newer form or publish feedback there.
Cancellation remains a no-write action. If the same Service detail is merely
hidden when its deletion finishes, its private state returns to the list without
switching the active screen or showing feedback. Returning to Service therefore
does not reopen the deleted record.

## Verification

Runtime: Node `22.23.4`.

- Initial focused reproduction: **21 passed, 9 failed**. The nine failures are
  the new search, selection and deletion regressions.
- Initial correction: **30 passed, 0 failed** in that same scope.
- A follow-up hidden-Service deletion test exposed stale deleted-job state in
  the first candidate. Its isolated reproduction failed, then the candidate was
  corrected before final qualification.
- Final focused qualification: **72 passed, 0 failed, 0 skipped**.
- `git diff --check` passed.

```sh
node --test --test-concurrency=1 \
  tests/service-intake-lifecycle.test.mjs \
  tests/service-screen-lifecycle.test.mjs \
  tests/service.test.mjs \
  tests/service-pii-leak.test.mjs \
  tests/devices-map-profile-identity.test.mjs
```

The small DOM fixture now models selector replacement and dialog opening/closing
for these paths. Real browser layout, focus and keyboard behavior remain within
the existing hosted Service smoke gate. This worker did not run Chromium or
native builds. No measurement thresholds, persistence schema, feature defaults,
security policies, branches on the remote, or releases changed in this round.

## Fresh-worker handoff

Root owns integration and combined-source qualification. Run the Service browser
smoke with the final combined tree. Further inspection candidates, not confirmed
findings from this round, include late customer/field/photo/result-link feedback
from detached detail panels and file-export completion after navigation. Preserve
already confirmed writes while suppressing obsolete UI updates. Do not rerun the
completed branch inventory without new remote evidence.
