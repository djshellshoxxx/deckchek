# Defensive security review, round 6 — 19 November 2026

## Decision and source

**Accept the reviewed Service callback/export delta within its documented scope.**
No production correction was identified in those changes by this source-only
review. This is not full-application or runtime security qualification.

- Reviewed combined commit: `1a42c3fabdbfef627b39218db20012cbda2cb7d1`.
- Reviewed combined tree: `fbc4509b7e9c36a82a063d018e4c7d449730bf22`.
- Service author commit: `8145e01c2704073072d3bddc13499fb9cc32816b`.
- Integrated Service commit: `04016496766c5e17b3ec3e0090cc2efa5a05361a`.
- Preceding security handoff: [round 5](SECURITY_AUDIT_ROUND5_2026-11-19.md).

The review inspected the Service screen/workflow, `exportPdfWithFeedback`,
job-sheet model/printable builder, PDF composition/export boundaries, the Service
API bridge, direct PDF-helper callers and relevant existing test definitions.
The concurrent workspace-import and phone/Verify work belongs to separate
reviewers and was not requalified here.

## Accepted privacy and export behavior

### Customer choices are captured before asynchronous preparation

In [the Service workflow](../../app/ui/workflows/service-job.js), both HTML and
PDF handlers call `jobSheetPrintData` before their first await. Its `options`
object copies customer/cost booleans and currency. Later checkbox changes apply
to a later request, while a background comparison replacement cannot change the
comparison reference already captured for an export.

The customer and cost checkboxes start unchecked. In
[the job-sheet model](../../app/service.js), structured customer name, phone and
email are included only when `includeCustomer` is true. Costs are likewise
conditional. The reviewed code does not serialize the entire detail object into
the exported HTML; the printable builder renders its selected fields. The title
uses the job number and the suggested PDF filename uses the unit name, not the
customer record. The native Service API remains the source of customer-bearing
job details; this delta adds no network operation or additional customer-data
consumer.

This is a structured-field privacy rule, not automatic detection of personal
information a user writes into fault descriptions, work notes, unit names or
photo captions. Those free-text fields remain document content under the
existing contract.

### Photo content and free text retain their existing treatment

The job sheet renders photo count and captions. It does not embed attached image
bytes, photo storage paths, GPS/EXIF data or a raw photo record. There is no new
photo-inclusion checkbox or image-export behavior in this delta.

The sheet's free-text values pass through the supplied escaping function before
HTML assembly; multiline formatting happens after escaping. The
[job-sheet printable](../../app/report-kinds/jobsheet.js) passes the shared
composer's `ctx.esc`. The unchanged native save/PDF boundary receives the composed
HTML rather than the original customer-bearing detail object.

### Retry and completion ownership are scoped to the original panel

HTML checks the original visible panel before opening a save dialog, and again
before completion/error feedback. An already started file save may complete.
A retry calls the same guarded handler; when the panel has been retired, it
cannot open another save dialog. A current explicit HTML retry or HTML fallback
reads the current choices as a new export request.

The PDF helper checks its optional `isCurrent` callback before preparation,
before dispatch and before feedback. A backend result already in progress is
preserved even after navigation. PDF Retry carries the same callback and data;
HTML fallback checks ownership before calling its handler. The captured button
and progress removal closure belong to the submitted operation. Cleanup does
not locate or enable a newer button by a shared element ID.

The underlying PDF backend is unchanged. Once called, it may complete its native
save/print workflow; the new callback controls UI feedback and retries rather
than cancelling that backend operation.

## Hidden Service state and caller compatibility

The Service detail context now separates `isCurrent` from `isVisible`.
`panelCurrent` checks connected element identity and the detail context;
`panelVisible` additionally requires visibility. This preserves an owned hidden
job's private refresh after a submitted mutation, while suppressing its immediate
toasts and announcements on another screen. A retired inline editor or detail
panel cannot replace the newer panel after its API request resolves.

Photo attachment and work-log paths check the refresh result before announcing
completion. The refresh path uses its load sequence and captured detail identity
to reject a superseded job/comparison. Already submitted photo batches continue
through their accepted files; this correction does not claim that navigation
undoes persistence.

The new PDF-helper option defaults to `() => true`. The inspected run-report
wrapper, Devices, Pre-gig, System Health, Fleet booth-sheet and M6 report-button
callers remain compatible with the existing options shape. Service supplies an
explicit callback. Existing callers that omit it retain their prior feedback
behavior; this review does not claim new lifecycle protection for those callers.
The helper's duplicate progress cleanup uses the existing idempotent toast
removal closure.

## Separate successor observations

These are source-level observations outside the accepted Service delta. They
were not executed as reproductions or fixed in this review.

1. **Shared PDF serial-redaction contract.** The helper reads the existing
   `pdf.redactSerials` setting and passes it to the PDF composer. The unchanged
   job-sheet printable does not inspect `ctx.options.redactSerials`, while the
   unchanged Service model and renderer retain and display the structured asset
   serial number. [FS-03](../specs/03-pdf-reports.md) describes a serial-redaction
   option. A fresh worker should qualify the intended behavior for registered
   report kinds with ordinary composition tests before choosing a scoped fix.
   Serial-like text in nicknames and free-text notes requires a separate explicit
   contract; do not claim comprehensive text redaction from a structured-field
   change.
2. **Announcement delivery timing.** The shared `announce` helper schedules its
   live-region write after 40 ms without an ownership callback. Visibility checks
   at the call site do not recheck ownership at delivery if navigation happens
   during that interval. This is an older cross-screen timing concern, separate
   from the late API-completion cases repaired by Service round 3. A successor
   can determine its user-visible effect with a bounded lifecycle test; no such
   execution is claimed here.

The already documented new-intake hidden completion, delayed intake photo-caption
capture and device-launcher candidates remain in the
[bug round-3 handoff](BUG_HUNT_ROUND3_2026-11-19.md). This review does not upgrade
those candidates into reproduced findings.

## Verification boundary and handoff

This worker changed only this report. It performed source inspection and a
staged whitespace check. No application tests, payload construction, browser
execution, native builds, external probes or production edits were performed.
Existing tests were read as text only.

The author reported **146 passed, zero failed, zero skipped** for its focused
Service/PDF/photo scope; that remains the author's separately recorded evidence
in the [round-3 report](BUG_HUNT_ROUND3_2026-11-19.md), not a rerun by this reviewer.
Root retains combined-source qualification, exact-source hosted gates and
publication ownership. Fresh workers should address the named bounded
follow-ups or inspect subsequent changes, rather than repeat this unchanged
static review.
