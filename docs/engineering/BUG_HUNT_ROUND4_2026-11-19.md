# Bug hunt round 4 — picker and phone-save lifecycle

Date: 19 November 2026 (America/Los_Angeles).

Base source: `04016496766c5e17b3ec3e0090cc2efa5a05361a`. This includes the
round-3 Service correction and root's `8d93c61` bounded phone/certificate file
reads. This worker changed no Service or persistence implementation.

## Confirmed defects and repairs

### File picker cleanup

The shared `pickFile()` promise previously settled and removed its temporary
input only on `change`. A `cancel` event left both pending. An exception from
opening the picker rejected the Promise through the executor, but left the
input attached.

Both `change` and `cancel` now remove both listeners and the temporary input.
Selection returns the same chosen File object; cancellation resolves `null`.
Opening errors clean up before rejecting. Subsequent events on the detached
input cannot change the settled result. This covers actual event-handler
behavior; browser platforms that do not emit `cancel` are not newly qualified.

### Native certificate picker ownership

Verify previously assigned its result token only after a native chooser
resolved. Consequently, an older chooser selection or error could replace a
newer result. Hiding and returning to Verify also left that pending chooser
able to start an obsolete result.

The request token is now captured before opening the chooser and is carried
through native extraction. Chooser errors retain that same token. A separate
picker generation retires an unresolved chooser on hide without cancelling a
file extraction or verification that had already started. Current errors and
cancellation retain their normal behavior.

The selected verification still completes into its cached hidden result, as
required by the existing screen contract. Hidden/detached screens do not focus
the result or publish its global announcement. Browser file read limits,
strict decoding, PDF sidecar behavior and verification rules are unchanged.

### Phone save completion ownership

An already submitted phone save previously assigned its completion panel and
published feedback after Clear or a new Read replaced the preview. Its final
rerender also replaced the newer form. Hidden saves published global feedback,
and failed database writes were announced as successful History saves.

A save now captures the parsed result it belongs to. Persistence still finishes
exactly once. Only that same current result receives its completion/error
state. A hidden current result retains its private completion for the return
visit, while global feedback requires a visible connected screen. If a newer
preview is present, releasing the shared busy lock enables its button in place
without replacing its asset selection or focus. A failed database write is
announced as remaining in the window, matching the existing failure panel.

## Verification

All execution used Node 22.23.4 and serial file concurrency.

| Scope | Result |
| --- | --- |
| Complete pre-fix reproduction: three picker cases, eight phone-save cases, existing Verify lifecycle and nine new Verify cases | 31 total: 14 passed, 17 failed, zero skipped/cancelled |
| Corrected phone, picker and Verify scope, including all root file-read cases | 59 passed, zero failed/skipped/cancelled; 948.616821 ms |
| Final related scope: preceding cases plus certificate UI, text/workspace file boundaries and native-catalog picker UI | 124 passed, zero failed/skipped/cancelled; 7475.323339 ms |
| Whitespace validation | Passed |

The tests invoke production event handlers using the existing DOM fixtures,
real phone parsing/persistence control flow, and deferred chooser/store results.
They assert selected object identity, exactly one submitted persistence call,
retained local History, replacement-form identity/focus/asset choice, current
success/failure feedback, and cached hidden completion. The current-flow
controls prevent fixing a stale result by suppressing every result.

The first red attempt produced oversized DOM-object assertion diagnostics and
reported only 25 cases. Equivalent Boolean identity assertions made the failure
report bounded without weakening the checks; the complete 31-case red run above
is the reproduction used for qualification. Local logs are
`/tmp/deckchek-bug-round4-red-complete.log`,
`/tmp/deckchek-bug-round4-green.log`, and
`/tmp/deckchek-bug-round4-qualified.log`.

These focused scopes overlap and must not be added into a unique test count.
There was no full-repository suite, browser launch, native build, hardware run,
remote write, release or deployment from this worker. Root must qualify the
combined source after integration.

## Contract and change boundaries

The correction follows FS-20's local Verify behavior and FS-30's explicit phone
import. It preserves exact file limits, strict text-reader behavior, actual
persistence results, the selected hidden Verify result, and all feature flags.
No measurement threshold, migration, certificate cryptography or native command
changed. Production edits are confined to `app/ui/dom.js`,
`app/ui/screens/verify.js`, and `app/ui/workflows/import-phone.js`.

## Fresh-worker handoff

Independently inspect the integrated source and its hosted browser outcome.
The inherited real-dialog/browser qualification remains open; mocked chooser
completion and dispatched `cancel` are not physical platform evidence.

Separate inspection candidates, not confirmed or repaired in this round:

- Phone asset-list refreshes have no sequence token; inspect overlapping initial
  and on-show lookups before changing their contract.
- The global announcement helper schedules a short timer. Feedback already
  scheduled while visible may have a different ownership window from the
  delayed completion cases repaired here.

Do not repeat unchanged full suites for this report alone, relax gates, or infer
hardware qualification from these deterministic lifecycle tests.
