# Devices refresh ownership — independent defensive review

**20 November 2026 — America/Vancouver.**

## Disposition and fixed sources

**Accepted within the reviewed source scope. No merge-blocking security defect
was identified in the Devices refresh correction.** This is an independent static
source review. It does not establish full application, browser, native, physical
device or dependency vulnerability qualification.

| Source | Commit | Tree |
| --- | --- | --- |
| Baseline | `7e362e64ee00af6110f04511382af0c77296eb7e` | `328b31fa3770355a6acb4ab754d0d9f36da72fbc` |
| Reviewed correction | `6612dbaed32edf9638f65a020d400fe12944a24a` | `0d7a65a171cead2230aaefb8f4d42eee52287752` |

The direct comparison changes two production modules,
`app/ui/devices/library-state.js` and `app/ui/screens/devices.js`, two existing
regression files, and the author's handoff. The reviewed checkout was clean.
The four production/test SHA-256 values match the final executed values recorded
in [the author's report](DEVICES_REFRESH_SUCCESSOR_2026-11-20.md).

The earlier [ZIP and Ledger boundary review](SECURITY_REVIEW_RESUME_2026-11-20.md)
is the predecessor handoff, not evidence that these new application bytes passed
its checks. This review inspected the actual correction, its callers, and the
unchanged assignment boundaries independently.

## Read publication and view ownership

`refreshUnits` stages the asset and result reads before publishing either. At
reviewed lines 54–67, each request has a sequence number; a completed publication
advances the published sequence. The checks after each asynchronous read combine
the existing caller guard with that publication ordering. An older request can
no longer replace a complete snapshot already published by a newer request,
including by committing the existing empty-array fallback after an older error.

Starting a newer request alone does not suppress a still-current default caller.
A newer view-owned request that retires before publication leaves the default
caller eligible to finish. This matters because Certificate, Service, Setup
wizard, job initiation and session-library initialization also use the shared
function. Their existing successful-read and current-error fallback behavior is
retained. The new Boolean result lets the catalog listener avoid a redraw after
its own read was suppressed; callers that ignore it keep their existing call
shape.

At reviewed `devices.js` lines 532–538, the catalog listener checks section
attachment before starting a read. It captures the current show generation,
catalog-event generation and first rendered element. A redraw requires all of
those owners to remain current, a connected visible section, a non-run view,
and no open assignment form. The separate event generation prevents an earlier
event's repaint from displacing the still-pending latest event. A hidden but
connected screen can still refresh shared data without redrawing a subsequent
visit.

These changes govern publication of local UI caches and delayed rendering. They
do not introduce a new persistence operation, input acceptance path, permission
grant, background acquisition or external request.

## Assignment and persistence safeguards

The [existing-unit assignment contract](../device-profile-assignment.md), form,
browser store, assignment model, native core and registered command were inspected
at the baseline and compared against the reviewed commit. Those files are
unchanged.

- The form copies candidate records, requires an explicit unit and model/revision
  confirmation, and captures the unit, profile, target product and expected prior
  product in the submitted request. Catalog refreshes do not retarget that copied
  request or silently renew its confirmation.
- The browser and native assignment models independently check the selected
  unit and current profile/product association. An intervening different product
  binding still causes rejection; the UI cache is not the authority for that
  check. The required nullable expected-product field and bounded identity
  validation are retained.
- Native assignment still uses the immediate SQLite transaction, existing
  database/restore wrapper, and same-target no-write retry. The correction neither
  changes the SQL nor bypasses commit or failure handling.
- A catalog notification no longer retires an otherwise current assignment form.
  An already submitted assignment can finish and select its acknowledged unit.
  Leaving the view still retires the form's UI callbacks; it does not cancel or
  undo the submitted database write.
- Unit identifiers, serials, notes, setup links, original results, service history,
  certificates and learned-map provenance retain their existing persistence
  semantics. No migration or record-rewriting operation was added.

## Regression review and execution ownership

The changed tests were inspected, including the successful/rejected late reads,
the current default caller alongside a retired newer view, hide/return catalog
completion, an assignment opened on the same detail DOM, overlapping catalog
events, a removed section, and a notification during an actual catalog-store
assignment.

During review, the author strengthened the same-detail case so it exercises the
assignment-form guard independently of a changed header. The final pending-write
case also checks a single submitted call, the stored product association, current
cache, selected unit and rendered selection.

The author records **16 passed / 9 failed** for the final 25-case regression pair
on unchanged baseline production and **94 passed / 0 failed / 0 skipped** for
the corrected nine-file compatibility scope on Node v24.22.3. These are the
author's execution results, not a test rerun by this reviewer. They remain bound
to the production/test hashes in the author's report and do not replace combined
source or hosted qualification.

This reviewer performed Git/source inspection, file-hash comparison and
whitespace validation only. **No application tests, browser launch, native build,
dependency scanner, fuzzing, external probing or remote mutation was performed.**
Only this independent report was authored in the review branch.

## Preserved boundaries and successor handoff

The correction orders refresh reads against other refresh reads. Direct cache
updates after `saveResult`, `addUnit` and a successful assignment do not join the
new publication sequence. Their existing ordering remains outside this repair;
the change must not be described as ordering every cache mutation. The two store
queries also remain separate reads, not a transactional database snapshot.
Forced profile-library reload ownership and cross-tab synchronization are
unchanged. Browser assignment retains its documented localStorage cross-tab
atomicity limitation.

The changed-file comparison confirms no change to dependencies or locks, Tauri
capability/configuration files, native commands, CI gates, signing, migrations,
measurement thresholds or default feature flags. Fleet remains default off.

Root retains integration, publication and applicable hosted verification. Bind
any combined acceptance to the final source and preserve the distinction between
the author tests and this independent static review. A successor expanding into
direct cache writes or forced initialization should begin with a concrete normal
workflow and preserve submitted-write semantics. No additional confirmed
security correction remains open in this reviewed scope.

Reviewed-by-agent: `/root/security_devices_successor`
