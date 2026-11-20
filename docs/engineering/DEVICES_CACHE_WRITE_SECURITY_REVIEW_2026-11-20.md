# Acknowledged Devices cache writes — independent defensive review

**20 November 2026 — America/Vancouver.** Reviewer:
`/root/cache_write_security_successor`.

## Disposition and exact source

**Accepted within the reviewed source scope. No merge-blocking security defect
was identified.** This is a static review of the direct-cache publication
correction, not a full application or dependency security clearance.

| Source | Commit | Tree |
| --- | --- | --- |
| Accepted read-order predecessor | `147f1da3b394b9ef63358acc713b43569fff5246` | `16cb114c2790c550173c06b19b91c742e3976302` |
| Reviewed direct-write correction | `f598418da60bf727b58509fd584cf10fd8a967d9` | `ead8ee8c3224a8c067ffe6cab806679dd54d87a1` |

The direct diff changes two production modules, two test files and the author
report. The complete changed source and relevant unchanged assignment boundaries
were inspected. The four changed application/test file hashes match the executed
hashes recorded in [the author report](DEVICES_CACHE_WRITE_SUCCESSOR_2026-11-20.md).
The predecessor's [security review](DEVICES_REFRESH_SECURITY_REVIEW_2026-11-20.md)
explicitly excluded direct cache writes; its acceptance is not used as acceptance
of this new correction.

## Successful-write publication

`app/ui/devices/library-state.js` now uses the same monotonic publication sequence
for complete refresh snapshots and the three acknowledged cache-update paths.
After a successful result save or unit creation, it changes the existing cache,
advances publication ownership, and only then emits the existing notification.
There is no asynchronous boundary between the cache change and ownership update.
An already pending read therefore cannot later publish its older staged arrays.

The publication point stays after the store promise succeeds. A rejected result
save or unit creation neither changes the cache nor advances ownership. Its
error still reaches the caller, and an otherwise current read remains eligible
to finish. No operation is marked successful before persistence acknowledges it.

The existing read checks remain after both asynchronous queries and still apply
the requesting view's `isCurrent` guard. A suppressed read returns `false`; it
does not clear the newer data. A read started after the acknowledged write has a
newer sequence and can publish a complete fresh snapshot. The correction does
not permanently pin local rows or prevent later authoritative refreshes.

For `addUnit`, advancing ownership before the existing catalog event also means
that event subscribers start subsequent reads after the new publication point.
The asset creation request, returned asset identity and event remain unchanged.
For `saveResult`, the original replacement-by-result-ID behavior, unrelated rows,
return value and device-result notification remain intact.

## Profile assignment and authority

The Devices screen delegates its original acknowledged asset-field mapping to
`cacheAssignedUnit`. It still updates only the matching asset's `productId` and
`updatedAt`, preserving the remaining asset fields. The new helper adds the same
publication barrier; it performs no persistence call, accepts no new user input
path, and creates no missing asset.

The helper remains behind the existing `onAssigned` callback. The form still
copies candidates, captures the explicit selection and expected prior product,
and invokes the callback only after the assignment promise succeeds while that
form remains current. Retirement still suppresses obsolete UI callbacks without
cancelling or rolling back the submitted database operation.

The browser request/model, catalog store, assignment form, native command and
native transaction are unchanged. Their target profile/product checks, selected
asset checks, required nullable expected-product field, strict request shape,
bounded identifiers, immediate transaction and same-target retry semantics stay
in place. The UI cache does not become authority for the persisted association.
No unit ID, original result, serial, note, setup relationship, history or learned
map is rewritten by this cache-ordering correction.

## Inspected regression evidence

The tests cover an older result response after a successful save, both pending
asset/result stages after unit creation, rejected result/unit writes, a later
fresh authoritative refresh, and the actual Devices assignment handler while an
older read is pending. The assignment case uses the real browser catalog store
and checks persisted association, cache, selection and a single submitted call.

The author records **7 passed / 4 failed** against the unchanged predecessor and
**102 passed / 0 failed / 0 skipped** for the corrected compatibility scope on
Node **24.22.3**. Those are author execution results. This reviewer did not rerun
them or infer full combined-source qualification from them.

Production/test diff whitespace checks passed. The committed author report had
one extra EOF blank line; this nonblocking documentation issue was reported to
root for trimming in its documentation overlay. It does not affect the reviewed
application/test bytes. The independent report's staged whitespace check is
separate from that author-report observation.

This reviewer performed source/Git inspection, hash comparison and whitespace
validation only. **No application tests, browser/native execution, dependency
scanner, fuzzing, exploit reproduction, external probing or remote mutation was
performed.** Only this independent report is authored in this review branch.

## Limits and fresh handoff

The sequence orders in-process publications through these helpers. It does not
create a transactional database snapshot, cross-tab synchronization, backend
revision protocol or new forced-library-load ordering. The asset and result
queries remain separate reads. An assignment whose UI callback retires keeps
the existing callback behavior; the helper does not invent a replacement cache
record or independently reload it. Unrelated direct cache writers are not newly
covered by a general synchronization mechanism.

The changed-path comparison confirms no changes to dependencies/locks, native
commands, capabilities, migrations, signing, CI gates, thresholds or default
flags. Fleet remains off. No hardware or whole-application security conclusion
follows from this review.

Root should integrate the reviewed bytes and retain independent source IDs,
author tests and combined/hosted results separately. Further cache or forced-load
work should start from a concrete ordinary workflow and preserve submitted-write
semantics. No additional confirmed security correction remains open in this
reviewed scope.

Reviewed-by-agent: `/root/cache_write_security_successor`
