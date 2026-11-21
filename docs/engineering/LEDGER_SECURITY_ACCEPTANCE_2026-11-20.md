# Fresh Ledger defensive acceptance — 20 November 2026

Reviewer: `/root/ledger_security_acceptance_fresh`. Dates use America/Vancouver.

## Disposition and fixed source

**ACCEPT_FOR_INTEGRATION within this defensive source-review scope.** LSA-01 and
LSA-02 from the [first-round security audit](LEDGER_SECURITY_AUDIT_2026-11-20.md)
are resolved in the corrected source below. The related reload correction and
non-destructive browser-storage recovery messages are accepted. No blocking
regression was identified in these corrections. This is independent review of
the implementation, not independent execution of its author's tests or a release
security clearance.

| Role | Exact identity |
| --- | --- |
| First-round source / comparison base | `9c90091be33fa58085bff80b34121d8cf4053a3a` |
| Accepted corrected source | `e04d6332185063b62c75f0e2cabdc1654a719079` |
| Accepted source tree | `88b3f2c43967ae3695d9974a8b69b7be5b6bd6c2` |
| Author's executed implementation | `a76746213a7fccf652c8f660029f7b1e51e7c7c3` |
| Author's report inspected with `git show` | `265a3156c84d16d2c20dde6ed609573d99e3650b:docs/engineering/LEDGER_BUG_HUNT_2026-11-20.md` |

The comparison was the exact two-ref diff `git diff 9c90091 e04d633` using the
full fixed hashes, followed by inspection of the complete relevant API, queue and
screen consumers. The corrected diff changes only two production files,
`app/ledger/api.js` and `app/ui/screens/ledger.js`; its other changes are tests and
documentation. The two production files, queue, API durability test and new
screen test are byte-identical to the author's executed implementation. The
different whole-tree IDs include integration documentation and reports.

## Finding dispositions

| Finding | Previous severity / concern | Fresh disposition |
| --- | --- | --- |
| LSA-01 | Medium: an earlier equal-text acknowledgement could erase a newer failed draft | Resolved: only the current save promise can retire its matching draft. |
| LSA-02 | Low: browser notes could treat a valid saved ID as an inherited object member | Resolved for note persistence: own-property reads and explicit data-property writes preserve saved IDs and JSON entries. |
| Related reload fault | A pending completion could update a retired gear row after the list reloaded | Resolved for this screen's submitted writes: reload waits before fetching replacement gear and retains a failed draft/error. |
| Storage recovery wording | Failure messages lacked a useful next action | Accepted: messages preserve edits, exported files and stored data while describing storage access or recovery steps. |

### LSA-01: acknowledgement identity owns draft retirement

In [`saveNote`](../../app/ui/screens/ledger.js), deletion now requires both the
currently registered promise identity and matching draft text. With ordinary
submitted edits A, B, A, the first acknowledgement cannot remove the final A
draft: `inflight` already refers to the final submission's promise. A failed
final save therefore retains its draft and sets the corresponding error.

The existing [`createKeyedWriteQueue`](../../app/ledger/write-queue.js) still
orders real writes by asset. Its later write waits for its predecessor to settle,
and an earlier rejection does not cancel a successor. The screen's finalizer also
deletes an in-flight entry only when that entry still belongs to its promise.
These separate identity checks preserve both queue ownership and UI ownership.

`commitEdits` waits until the current in-flight map is empty and returns a saved
failure when the associated draft remains. Both `ensureBuilt` and `doExport`
check that result before constructing their snapshot. The latest failed draft
thus blocks preview/export completion instead of silently publishing an
intermediate acknowledged value. A later successful retry may clear the draft
and prior failure. The author regression's assertions cover the intermediate
stored value, blocked preview, retained editable draft and successful retry;
those assertions were inspected, not executed here.

### Reload: reads follow submitted writes, with failures preserved

[`load`](../../app/ui/screens/ledger.js) now awaits `commitEdits` before requesting
gear, history or the next revision. This prevents an already submitted note
completion from updating only a row replaced by that same reload. Waiting for
the newest queued write also waits for its predecessors; no submitted operation
is cancelled by this change.

A note failure is returned as `noteError`, allowing the gear reload to finish.
The failure is then displayed with priority over the informational held-unit
message. The draft map is retained, and the Privacy form reads a draft before the
acknowledged row value. Reload therefore does not discard a failed note or label
its persistence successful. A promise that never settles can keep reload waiting;
this change supplies no timeout, cancellation or backend rollback guarantee.

### LSA-02: notes use saved IDs as data keys

[`listGear`](../../app/ledger/api.js) now checks `Object.hasOwn(notes, a.id)` before
reading the value. An inherited member cannot stand in for an absent note.
Browser `setPublicNote` defines the selected ID as an enumerable, configurable,
writable data property. That creates the intended own entry without invoking an
inherited setter. Existing parsed notes are retained, and clearing deletes only
the specified own entry; it does not rewrite the asset's ID or rename other notes.

The public-note copy remains an object spread, and JSON serialization retains
enumerable own entries. The storage key stays `deckchek.ledger.v1`, with the same
`exports` array and `notes` object. No new identifier prohibition, migration,
note-length rule or native argument shape was introduced. The ordinary saved-ID
regression checks absence, save, reload and clearing through the browser API.

This resolves the browser-note dictionary finding. It is not an application-wide
guarantee for every identifier-indexed structure; existing per-item privacy
normalization and its identifier filtering are unchanged and outside this
correction's dictionary acceptance.

## Storage and acknowledgement boundaries remain intact

Both browser mutations, `setPublicNote` and `recordExport`, call
`readLocal(storage, { forWrite: true })` immediately before changing data. Neither
uses the tolerant read-only fallback or constructor snapshot as a replacement
record. Failed reads, invalid JSON and the checked invalid top-level/history/note
shapes throw before the storage write. A genuinely absent key remains an allowed
empty initial state. The read-only views keep their existing fallback behavior;
that behavior supplies no authority to overwrite unreadable saved bytes.

`writeLocal` rejects missing storage and rejected writes. Both mutation methods
return their acknowledgement only after it succeeds. In the screen, public-note
failure retains the draft, and export history failure occurs before the success
row, success toast or recorded-revision message is assigned. A file save precedes
history recording, so a file may already exist when history fails. The error
reports that failure; it cannot retract the file or make both operations atomic.

The three revised browser-storage messages identify the cause and failed save,
then tell the user to retain edits or exported output and either restore storage
access or preserve unreadable stored data for recovery. They recommend no reset,
deletion or clearing of storage. Original causes remain attached where already
provided. The screen uses the outer message through text rendering. This matches
the cause/consequence/next-step convention in
[DEVELOPMENT-PLAN §5.7](../DEVELOPMENT-PLAN.md#57-error-handling-review-m9-errors-mid).

## Unchanged contracts and qualification

- Native note/history calls still return through their existing invocation
  branches before browser mutation. No Rust source, SQL, command, capability or
  migration changed in the corrected diff.
- The privacy serializer, presets, preview sandbox, escaping, exported schema,
  extension allowlist and build limits are unchanged. Public-note edits do not
  bypass the existing export privacy controls. This is a change-boundary check,
  not fresh approval of every unchanged privacy path.
- `app/features.js` is unchanged: `gearLedger` and `fleet` remain default-off.
  Dependencies, workflows, timing gates and archive limits are unchanged.
- The manual publishing instructions add no network upload, remote deletion,
  credential request or history rewriting. The documentation correction keeps
  the real H-33 publishing/privacy walkthrough open. This reviewer inspected
  that distinction but did not repeat the first-round official-documentation
  lookup or perform a deployment.

## Evidence and limits

This reviewer performed Git/source inspection, exact commit/tree checks,
SHA-256 capture, author-byte comparison and `git diff --check`. The review began
with a clean worktree. Only this report was authored.

| Reviewed source file | Independently captured SHA-256 |
| --- | --- |
| `app/ledger/api.js` | `2235337d2788b502e0d3b23caac7bb9535202721b2b570de93b42783343e4910` |
| `app/ui/screens/ledger.js` | `3c7b43eef55b24c86b3cf34bd577348d5385c053b8c11a25541f3d0a5fa6004c` |
| `app/ledger/write-queue.js` | `362f81caa455117738a539fae46904b9e969996ea080207f380b362369ad9049` |
| `tests/ledger-note-persistence-screen.test.mjs` | `aa66b533df8cd8deae7032a8a6c8cae58e7443303b9c9011e408fe51efe79544` |
| `tests/ledger-api-durability.test.mjs` | `67cebd59bcc2270a77b643fea70cd348e967f5b708c5533603df814c1cd84e0d` |

The author reports **80 passed, zero failed/skipped/cancelled** in nine focused
Ledger files under Node 22.23.4 at `a767462`. That includes the corrected eight
screen cases and eight API durability cases. These overlapping counts are not
additive. The author also records clean failing baselines and discloses an early
fixture-cleanup timing issue that was corrected before the accepted baselines.
This report treats all those runs and their recorded log hashes as **author
evidence**, not independent execution. The exact reviewed application/test bytes
match the author's source.

No application tests, malicious payloads, vulnerability reproduction, scanner,
fuzzing, browser/native execution, hardware run, external probe or remote write
was performed by this reviewer. The source supports the specified ownership and
persistence boundaries; it does not establish cross-tab/process coordination,
power-loss durability, recovery of unreadable bytes or transactional file/history
commit. The structural storage guard does not validate every nested historical
field. These limits are unchanged by acceptance of LSA-01 and LSA-02.

## Successor handoff

Root owns integration and combined qualification. Preserve the original findings,
author failing-baseline evidence and this exact-source acceptance. The separate
fresh functional and code reviews remain independent evidence; this report does
not substitute for them or for hosted/native gates.

If implementation bytes change, a fresh successor should inspect the new diff,
especially current-promise draft retirement, reload ordering, strict mutation
reads, note dictionary semantics and acknowledgement placement. Keep any broader
saved-ID behavior review separate from this note-persistence closure. Preserve
the 20 MiB archive cap, timing/security gates, owner/hardware qualification,
historical branches and default-off feature settings. No release, deployment,
tag, branch deletion or remote publication is authorized by this report alone.

Reviewed-by-agent: /root/ledger_security_acceptance_fresh
