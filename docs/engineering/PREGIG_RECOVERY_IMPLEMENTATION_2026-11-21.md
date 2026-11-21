# Pre-gig recovery — correction of the static review findings

The original round-sixteen candidate `b7a979cfc24eca569713ff319c5838eaa13d1a34`
is held without execution. Code, functional and defensive reviewers identified
two production correctness gaps and two fixture accounting/lifetime gaps. This
separate candidate preserves that source and its reports, and corrects those
findings without reclassifying the original candidate as tested.

## Pending preset draft ownership

Save takes a validated snapshot before waiting for its acknowledgement. The
original candidate also waited for a follow-up read and left the form controls
editable during that wait, then closed the dialog after accepting the earlier
snapshot. The correction detaches the submitted snapshot and disables every draft
input, selection, text area and deck-management button synchronously while the
write is pending. An optional refresh has its own read/error state and does not
keep an acknowledged save dialog locked open. The form
remembers each control's previous disabled state and restores it on failure.
The same entered values and inline error remain available for editing and Retry.
The existing duplicate-Save and close guards remain in place.

The pending-success screen regression now checks every draft control. A new
pending-failure regression verifies that editing is restored, all entered values
survive and the actual retry persists those retained values. Another deferred-read
case requires the acknowledged save to finish before its refresh completes. The production
storage implementation, native signatures and measurement rules are unchanged
from the preceding candidate.

## Retained result export provenance

The original screen correctly rendered its retained preset snapshot, but PDF
export still read the current editable preset after an asynchronous preparation
step. Editing that saved preset could attach a different interface to an earlier
result. PDF export now captures the run and its preset together, builds device
metadata from that captured preset and passes an ownership predicate through the
existing PDF feedback helper. A disposed or replaced result cannot start a late
export or emit later feedback. Its JSON fallback also receives the same captured
result.

The new actual-screen regression finishes a check, edits the same saved preset's
interface, and inspects the HTML passed by the real PDF adapter to a bounded fake
native renderer. The expected interface and suggested filename remain those of
the original check. A second regression retires a result before its asynchronous
export handoff and requires zero renderer/dialog calls and zero success feedback.
These are adapter/HTML provenance checks, not native PDF rendering or a real file
dialog qualification.

## Fixture correctness

The new screen fixture now uses one document and the same shell toast/live hosts
for the entire test file, matching the production module's document-lifetime
cache. Each case removes its own screen and confirmation dialog, disposes its
listeners, clears feedback content and supplies a new storage seam. Production
`live.js` is unchanged; the success-feedback assertions remain intact.

The fixture separately counts writes to the two Pre-gig collections and last-
preset preference. It no longer calls an unrelated catalog initialization write
a Pre-gig mutation. Original raw collection preservation checks and the API's
whole-registry assertions remain intact. Real catalog initialization is retained.

## Verification scope

The proposed five original files now contain 132 expanded cases: 59 core,
19 actual-screen, 26 storage, 17 controller/view-model and 11 text-file boundary
cases. Forty-nine are new relative to the pre-Pre-gig source. All are authored
coverage until a fresh trio completes static review and root separately reviews
and authorizes an exact FIRST recorder, selection, runtime and budget.

The accepted backup/Service checkpoint and its exact publication proof are
included in this candidate's ancestry. The native backup work, original complete-
source audio HOLD, real platform qualification, default-off Fleet and queued
Population Compare/System Health findings remain separate. No new dependency,
permission, threshold, native command, release or deployment is introduced.
