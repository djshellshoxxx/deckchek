# Independent Ledger defensive source audit — 20 November 2026

Reviewer: `/root/ledger_security_audit_round1`. Dates use America/Vancouver.

## Disposition and exact source

**The direct fail-visible/fail-closed storage changes and the publishing-copy
changes are accepted within this static scope. Broader note-durability acceptance
is held for the two source-level integrity findings below.** Both findings concern
pre-existing behavior retained by the consolidated changes; this report does not
attribute them to a newly introduced remote vulnerability.

| Item | Fixed source |
| --- | --- |
| Comparison base | `3d1ee5bddb56db1290af0166874612ada3c0a566` |
| Reviewed combined source | `9c90091be33fa58085bff80b34121d8cf4053a3a` |
| Reviewed tree | `4efa2e323bd9cef9f95d548a31e892ae174551c4` |
| Diff command | `git diff 3d1ee5bddb56db1290af0166874612ada3c0a566...9c90091be33fa58085bff80b34121d8cf4053a3a` |

The seven-file diff contains the Ledger work from PRs #49–#53/#55/#56 and the
separately reviewed PR #47 ZIP test. This audit inspected the three changed Ledger
production files, their new/modified tests and immediate consumers. It did not
repeat the unchanged ZIP or Devices reviews.

The relevant assets are the user's public-note drafts, acknowledged note values,
saved export-history revisions, and the fields/files the user chooses to publish.
The boundaries are asynchronous UI completions, browser JSON persistence, the
existing native invocation contract, and manual publication to GitHub. No new
credential collection, network publishing, privilege or native command is added.

## Findings requiring follow-up

### LSA-01 — Value equality does not establish latest note-operation ownership

**Medium, note integrity; static source finding.** In
[`saveNote`](../../app/ui/screens/ledger.js) the completed write removes the draft
when its captured text equals the current draft text. The failure map is likewise
indexed by asset, while `commitEdits` only surfaces a saved failure if that asset
still has a draft.

For ordinary queued edits that return to an earlier value, the earliest write can
therefore retire a later draft with equal text. If an intervening value is saved
and the final write fails, the latest draft can already be absent; `commitEdits`
can then continue without reporting that final failure. The keyed queue orders
backend writes correctly but does not itself supply ownership for UI draft
retirement. These comparisons and failure conditions are retained pre-existing
screen behavior, now exposed alongside the serial-write guarantee.

Give each draft/write attempt a stable operation or revision identity, and allow
completion to retire only the draft it owns. Preserve the latest failed draft and
ensure it prevents a misleading preview/export success. Submitted writes should
still finish in order. The functional worker was notified to verify this with
the actual screen and implement a narrow correction; no application execution
was performed by this reviewer.

### LSA-02 — Browser note storage is not a dictionary for every valid saved ID

**Low, saved-identifier edge cases; static source finding.**
[`readLocal`, `setPublicNote`, and `listGear`](../../app/ledger/api.js) retain an
ordinary object for notes, direct bracket assignment and inherited-property
lookup. A saved ID that overlaps JavaScript object-prototype names can therefore
have property semantics instead of ordinary dictionary semantics. A write can
return an acknowledgement without creating the intended serialized own entry,
or a read can observe an inherited value when no note was saved.

This is not excluded by the existing data contract:
[`validateRecord`](../../app/catalog-archive.js) accepts nonempty saved string
IDs, and native [`check_asset_id`](../../src-tauri/src/ledger.rs) permits printable
IDs within its length cap. Browser catalog upserts also preserve supplied IDs.
The behavior predates this diff. No privilege escalation, code execution or
cross-user impact was established or claimed.

Use dictionary-safe construction and own-property reads, preserving valid saved
IDs and existing notes rather than banning identifiers after the fact. Keep the
JSON format and native invocation contract intact. Root and the implementation
worker were notified. No crafted-input execution or vulnerability reproduction
was performed as part of this finding.

## Protections supported by source inspection

- `readLocal(..., { forWrite: true })` rejects failed reads, invalid JSON, empty
  stored text and the checked top-level history/notes shape violations before
  either mutation reaches `setItem`. A missing key remains a legitimate empty
  initial state. Read-only callers retain their prior tolerant empty fallback.
- The default `localStorage` property is resolved inside a guarded helper, so a
  throwing browser getter does not prevent construction of the API. Missing
  storage and rejected `setItem` calls produce explicit failure rather than a
  claimed save. Original exceptions are retained as causes; the UI displays the
  generic outer message through text rendering.
- The queue uses `Map` identities, serializes a key's real writes, permits other
  keys to proceed, and releases a failed slot while returning that write's
  rejection to its caller. Retirement checks the tail promise before deletion.
  This queue property does not resolve LSA-01's separate draft ownership issue.
- Native note/history mutation dispatch remains before the browser storage path.
  Native SQL uses its existing parameterized update and asset validation. No
  native implementation, capability, migration, dependency or workflow changed.
- Publishing remains manual. The new guide is rendered as text and adds no
  upload, credential request, automatic deletion or history rewrite. Existing
  privacy allowlists, preview sandboxing and export escaping are unchanged.

## Publishing guidance checked against primary documentation

On 20 November 2026 the reviewer opened these official GitHub pages:

1. [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
   supports the documented Pages settings flow, branch/folder source selection,
   plan-specific repository availability and the distinction between a private
   repository and public Pages output.
2. [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
   places the entry file at the selected source folder's top level. The chosen
   root-publishing instructions and separate single-file naming are consistent
   with that requirement. GitHub supports other entry filenames; this app
   deliberately instructs the user to publish its HTML as `index.html`.
3. [Deleting files in a repository](https://docs.github.com/en/repositories/working-with-files/managing-files/deleting-files-in-a-repository)
   confirms that ordinary deletion leaves previous file contents in Git history.
   The copy correctly avoids promising that local or repository cleanup reverses
   a previous disclosure.

The stale-file instructions address both folder publication and conversion to a
single-file ledger. Only obsolete export files are described. Actual owner H-33
publication and inspection remain separate; this review created no site.

## Verification and limits

Executed Git/source inspection, fixed-ref/tree checks, SHA-256 capture and
`git diff --check` on the reviewed diff. The starting worktree was clean. Only
this report was authored by the reviewer.

| Source file | SHA-256 |
| --- | --- |
| `app/ledger/api.js` | `fd3e19c081c3436d607522bf77d52f843cb2190f975d02dde192d2d70d969b7d` |
| `app/ledger/write-queue.js` | `362f81caa455117738a539fae46904b9e969996ea080207f380b362369ad9049` |
| `app/ui/screens/ledger.js` | `86df58082dc13f1c1548394eddd53535cfd1f60bf9adad846ed82c6219c8a51a` |
| `tests/ledger-api-durability.test.mjs` | `05017570cca56425d98679b771161daf1e33ebbd3ece77dd29414a3a7c7244bf` |
| `tests/ledger-note-write-queue.test.mjs` | `cd890dd684387846fe1cd65ae1faab31a99252d0d176b31ff8335ae2ac166eca` |
| `tests/ledger-ui.test.mjs` | `96c89023883e247c0b94fca55eaef999359820791a9758544c432133afd52f8c` |

No application tests, scanner, fuzzing, browser launch, native build, hardware
execution, external probe or remote write was performed. Existing author or
other-worker test results are not independent test execution by this reviewer.
The storage guard validates the documented structural subset, not every nested
historical row field; this report makes no complete schema-validation claim.

The queue is scoped to one screen instance. Cross-tab/process coordination,
power-loss durability and database transaction guarantees are outside this
change. An already completed file download can precede a failed history write;
the new error reports that failure but cannot retract the downloaded file.

## Successor handoff

Root retains integration and publication. The bug worker owns source corrections
for the noted paths. A fresh reviewer should inspect the eventual operation
ownership/dictionary correction and its actual-screen/API evidence, then accept
or block that new exact source. This audit does not pre-accept that future code.
Retain the original findings and any failing baseline evidence when resolving
them. Preserve the 20 MiB archive cap, timing/security gates, physical/owner
qualification, historical branches and Fleet default-off.

Reviewed-by-agent: /root/ledger_security_audit_round1
