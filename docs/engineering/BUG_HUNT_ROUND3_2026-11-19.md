# Service workflow bug hunt, round 3

## Source and independent review

This fresh worker started at `3e94e27`, which includes the preceding two Service
rounds, the consolidated existing-unit profile work, and both MIDI review fixes.
The round-2 report and implementation were independently reviewed. Its complete
focused qualification passed again: **72 passed, 0 failed, 0 skipped**. No
regression in the preceding lookup, selector-preservation, or deletion changes
was established in that review.

## Verified defects and repairs

### Detached detail panels could still publish their write results

Customer edits, job-field edits, photo removal/attachment, and saved-run linking
could show success notifications or announce errors after the operator opened a
different panel. A cancelled customer editor could also reload over a newer
editor in the same panel. Photo attachment announced success even when its
subsequent refresh had been superseded by navigation.

Each handler now verifies ownership before initiating a new action and after its
awaited write. Inline customer/field editors also retain their own element
identity. Retired callbacks cannot reload the replacement panel or publish
feedback there. Already submitted writes still complete, including every file
in an accepted photo batch. Photo success announcements respect the refresh
result. Current failures and retries retain their feedback.

### Hidden Service feedback reached the active screen

Hiding Service leaves its DOM connected. Earlier ownership checks therefore
allowed status changes, work-log results, and comparison reads to announce on a
different active screen. Simply treating the hidden screen as detached would
leave completed changes absent when the operator returned.

The detail context now distinguishes ownership from visibility. A submitted
change may refresh the same hidden job's private view. Notifications and live
announcements require visibility. An owned hidden editor may retain its local
error for the operator's return without announcing it on another screen. Tests
verify successful status/work-log changes are visible upon return, while failed
work-log input remains available.

### Sheet exports used later options and reported into replacement views

HTML and PDF export read sheet choices after asynchronous preparation. Changing
the customer-details checkbox immediately after clicking could alter the
already requested output. Export completion also displayed success/failure
feedback on a replacement panel, and an old PDF Retry action could initiate a
new export from there.

Both export handlers now capture the requested print data synchronously at the
click. HTML preparation checks its current visible owner before opening the
save dialog; an already started save still completes. Completion feedback and
retry actions require the original visible owner.

`exportPdfWithFeedback` gains an optional `isCurrent` callback, defaulting to
true for existing callers. It preserves an already started backend's result,
releases progress/button UI, and suppresses stale completion feedback. Retry and
HTML fallback actions carry that same ownership check. Its native export and
file-write implementations are unchanged. The changes in `persistence.js` are
confined to this helper and its adjacent documentation; workspace import fixes
owned by another reviewer are independent.

## Evidence and qualification

Runtime: Node **22.23.4**. Tests dispatch production DOM event handlers, defer
actual API boundaries, and observe write calls, panel identity, current input,
focus, notifications, live regions, and generated HTML. Native save/PDF calls
use injected desktop API responses; JPEG preparation uses the real validator
with a browser decode/canvas fixture. The minimal DOM fixture adds only
`replaceWith` behavior needed by the production customer editor.

- Initial panel reproduction: **3 passed, 16 failed**.
- Expanded reproduction before production changes: **31 passed, 25 failed**.
- Independent hidden-screen reproduction: **0 passed, 5 failed**.
- Corrected panel/screen scope, including current-flow and batch controls:
  **60 passed, 0 failed**.
- Final focused Service/PDF/photo qualification: **146 passed, 0 failed,
  0 skipped**.
- `git diff --check` passed.

```sh
node --test --test-concurrency=1 \
  tests/service-panel-lifecycle.test.mjs \
  tests/service-intake-lifecycle.test.mjs \
  tests/service-screen-lifecycle.test.mjs \
  tests/service.test.mjs \
  tests/service-pii-leak.test.mjs \
  tests/devices-map-profile-identity.test.mjs \
  tests/photo-store.test.mjs \
  tests/report-pdf.test.mjs
```

The fixture uses a separate real timer when awaiting WebCrypto worker-thread
completion and drains previous shell announcements before isolating a test's
clock. These changes prevent timing noise from being mistaken for UI ownership
failures.

## Fresh-worker handoff

Root owns integration and qualification of the combined tree. Run the existing
hosted Service/browser and platform gates on that tree; this worker did not run
Chromium, native builds, full repository suites, remote writes, or releases.

Further inspection candidates, **not confirmed findings in this round**, are
the new-intake form's hidden-screen completion behavior, photo caption capture
during a delayed job creation, and delayed device-test launcher imports. The
PDF backend may continue its native save/print workflow once called; the new
ownership callback scopes UI feedback and retries, not backend cancellation.
Do not cancel already confirmed persistence while investigating those paths.

No database schema, service API contract, measurement threshold, feature
default, security policy, or CI gate was changed.
