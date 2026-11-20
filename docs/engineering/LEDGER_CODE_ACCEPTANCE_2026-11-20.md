# Independent Ledger code acceptance — 20 November 2026

Reviewer: `/root/ledger_code_acceptance_fresh`. Dates use America/Vancouver.
This fresh successor did not author the implementation or its regressions.

## Disposition and fixed scope

**ACCEPT_FOR_INTEGRATION for this code/Standards review.** The two documented
Standards findings are closed in the reviewed scope. Independent source review
accepts the new acknowledgement-ownership, reload-ordering and saved-note
dictionary corrections. No additional actionable code finding was identified.
This is not a combined test, hosted-gate, physical qualification or release pass.

| Source role | Commit / tree |
| --- | --- |
| Consolidated comparison base | `9c90091be33fa58085bff80b34121d8cf4053a3a` / `4efa2e323bd9cef9f95d548a31e892ae174551c4` |
| Reviewed implementation and reconciled documentation | `e04d6332185063b62c75f0e2cabdc1654a719079` / `88b3f2c43967ae3695d9974a8b69b7be5b6bd6c2` |
| Author's final executed implementation | `a76746213a7fccf652c8f660029f7b1e51e7c7c3` / `5433decfa380eef46b1d51fceb4e38bfad307743` |
| Author's later report, read separately with `git show` | `265a3156c84d16d2c20dde6ed609573d99e3650b:docs/engineering/LEDGER_BUG_HUNT_2026-11-20.md` |

The fixed comparison is `git diff 9c90091be33fa58085bff80b34121d8cf4053a3a..e04d6332185063b62c75f0e2cabdc1654a719079`.
It changes 12 files: two application modules, two test files, six product/status
documents and two first-round audit reports. The reviewed head contains the
screen correction as `272ec2c` and the dictionary/recovery correction as
`e04d633`; `bb3483f` reconciles the publishing documentation.

The author commits were not pre-approved by the first-round reports. This review
traced the actual new implementation and its consumers, then compared it with
those reports. All four changed application/test files are byte-identical to
the author's final implementation. The wider `app`/`tests` comparison against
that author commit differs only in the reconciled `app/README.md`.

## Standards

### S1 — Publishing documentation: closed in the current scope

[DEVELOPMENT-PLAN §1.1, §1.2 and §5.8](../DEVELOPMENT-PLAN.md) require related
documentation to follow the implemented behavior. The corrected
[FS-33 §3](../specs/33-gear-ledger.md#3-ux) matches `PUBLISH_COPY` and the numbered
guide: upload the folder's contents at the selected publishing root, or publish
the single HTML file there as `index.html`. It also records the repository/site
visibility distinction, obsolete-file cleanup, mode-switch remnants and retained
Git history. [FS-33 §11](../specs/33-gear-ledger.md#11-research-notes) now records
the primary-documentation review and keeps actual owner publishing separate.

The [application README](../../app/README.md), [feature matrix](../FEATURE-MATRIX.md)
and [implementation status](../IMPLEMENTATION-STATUS.md) agree with that scope.
The updated [TODO](../../TODO.md) and [spec-status owner gate](../../SPEC_STATUS.md)
retain the real H-33 publishing/privacy walkthrough. The old FS-33 table entry
in `SPEC_STATUS.md` still says wording needs verification, but the document
explicitly identifies its lower sections as preserved historical snapshots;
the updated owner gate and current specification provide the later disposition.
That historical statement is not treated as evidence of an unresolved current
wording gap.

This reviewer independently reopened the three official GitHub sources on
20 November 2026:

- [Publishing-source configuration](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
  supports branch publishing, the Pages settings labels and selecting the source
  root. It also explains that private repository visibility alone does not make
  the resulting site private.
- [Creating a Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
  supports the stated plan/repository distinction and placing the entry file at
  the top level of the chosen source. The app deliberately uses `index.html` for
  its HTML export; the documentation does not claim GitHub forbids other entry
  formats.
- [Deleting repository files](https://docs.github.com/en/repositories/working-with-files/managing-files/deleting-files-in-a-repository)
  confirms that ordinary deletion retains earlier contents in Git history.

This verifies the guide's statements, not a deployed site. The
[H-33 script](../testing/HARDWARE-TEST-SCRIPTS.md#h-33-gear-ledger-fs-33), including
the actual publishing and privacy inspection, remains open.

### S2 — Recovery instructions: closed

[DEVELOPMENT-PLAN §5.7](../DEVELOPMENT-PLAN.md#57-error-handling-review-m9-errors-mid)
requires cause, consequence and next step. The three changed browser storage
errors in [`app/ledger/api.js`](../../app/ledger/api.js) now satisfy that rule:

| Failure | Preserved consequence and next action |
| --- | --- |
| Unreadable existing Ledger data | Changes were not saved; retain edits or the exported file and preserve the stored data for recovery before retrying. |
| Unavailable browser storage | Changes were not saved; retain edits or the exported file, allow browser storage and retry. |
| Rejected write | The save failed; retain edits or the exported file, check space and permissions, then retry. |

The copy does not suggest clearing or resetting stored data. Existing causes
remain attached where supplied. Note, preview and export consumers show the
friendly outer message through text rendering. The copy is guidance for recovery;
it does not promise automatic repair, durable unsaved drafts or rollback of a file
already saved before a history-write failure.

### Heuristic review

No additional actionable finding arose from the inherited code-smell baseline.
The correction uses the existing promise identity and per-asset queue instead of
adding a second scheduling abstraction. The comments explain the non-obvious
ordering requirement. Own-property lookup and data-property writes stay within
the browser note dictionary contract. No broad refactor, dependency or schema
change is required for these fixes.

## Spec and functional source assessment

### Latest draft belongs to its own acknowledgement

[`saveNote`](../../app/ui/screens/ledger.js) now deletes a matching draft only
when `inflight.get(assetId)?.promise` is the acknowledging promise. An older A
therefore cannot discard the newest A in an A → B → A sequence. The promise is
registered synchronously before its awaited queue result resumes, so this
comparison is not made before initialization. The `finally` guard likewise
retires only the current tracked save.

The unchanged [keyed queue](../../app/ledger/write-queue.js) preserves write order
for one asset while permitting other assets to proceed. A rejected earlier slot
does not cancel its successor. Because `commitEdits` waits for the current
per-asset saves, it also waits through their earlier queued writes; its failure
check can now see the retained newest draft. Preview and export already stop on
that returned error. This resolves the first-round F1 ownership concern and the
corresponding source aspect of LSA-01.

### Reload waits before replacing the rows used by submitted saves

`load` now awaits `commitEdits` before calling `listGear`. The captured gear row
used by an outstanding note callback is therefore settled before the replacement
list is read. Existing `setStep` logic captures visible fields synchronously
before removing them, and input handlers retain typed notes in `drafts`.

A failed note save returns a message from `commitEdits` rather than rejecting
the gear-list load. The reload proceeds, retains the failed draft and restores
its message after rendering; the generic service-job announcement cannot replace
that error. Revisiting Privacy restores the draft and can retry it. The change
does not cancel submitted writes or add a timeout: a backend acknowledgement
that never settles can continue to hold this reload open.

### Saved note keys retain their exact identity

`listGear` now accepts only own note entries. `setPublicNote` writes an enumerable,
writable, configurable data property before the existing JSON save. Valid saved
IDs that overlap ordinary object-member names remain exact keys, and clearing a
note deletes that key. No identifier ban, renaming or storage-format migration
was introduced. The existing 2,000-character browser normalization remains.

Native note/history mutations still dispatch before browser persistence, with
the same command names and arguments. Storage key, export-history shape,
revision checks, limits, native implementations and feature defaults are
unchanged. The dictionary assessment is limited to the corrected note paths;
it is not an application-wide saved-ID or security certification. The separate
fresh defensive reviewer owns the security disposition of LSA-02.

### Regression relevance

The new screen tests exercise production screen handlers and the browser API,
using deferred acknowledgements and a small DOM fixture. Their assertions cover
the repeated-text failure, same-asset ordering, unrelated-asset independence,
recovery after an earlier failure, reload during a pending save, failed-reload
draft retention, blocked/corrupt persistence and history failure after saving.
They check visible error/draft/preview outcomes and stored values rather than
only matching implementation text. The API regression separately checks absent,
saved, reloaded and cleared notes for ordinary object-property-name IDs.

This static acceptance is consistent with FS-33 §3's error-state contract and
AC-7's faithful history/revision behavior. It does not establish every FS-33
acceptance criterion or substitute for the fresh functional worker's execution.

## Verification and source evidence

This reviewer executed Git/source inspection, fixed-ref/tree checks, the
four-file comparison with the author commit, SHA-256 capture and whitespace
validation. The worktree started clean. No application test, full suite, native
build, browser launch, scanner, external probe or physical test was run here.

| Reviewed file | SHA-256 |
| --- | --- |
| `app/ledger/api.js` | `2235337d2788b502e0d3b23caac7bb9535202721b2b570de93b42783343e4910` |
| `app/ui/screens/ledger.js` | `3c7b43eef55b24c86b3cf34bd577348d5385c053b8c11a25541f3d0a5fa6004c` |
| `app/ledger/write-queue.js` | `362f81caa455117738a539fae46904b9e969996ea080207f380b362369ad9049` |
| `tests/ledger-note-persistence-screen.test.mjs` | `aa66b533df8cd8deae7032a8a6c8cae58e7443303b9c9011e408fe51efe79544` |
| `tests/ledger-api-durability.test.mjs` | `67cebd59bcc2270a77b643fea70cd348e967f5b708c5533603df814c1cd84e0d` |

The author report at `265a3156c84d16d2c20dde6ed609573d99e3650b` records **80 passed,
0 failed, 0 skipped, 0 cancelled** across nine focused files under Node 22.23.4
at `a767462`, with all 1,548 tracked-file hashes unchanged. Its final test-log
SHA-256 is `d714d4aaa82754ca1147cb33f74207e1ebcbbde25b00c094b785af74bedb3bbb`.
Those are the author's source-bound executions, not tests rerun or independently
attested by this code reviewer. The independently checked byte match connects
that implementation to the source assessed here; overlapping test counts must
not be summed.

## Limits and next handoff

Root should combine this acceptance with the fresh functional and defensive
reports, disposition any findings from those workers, and qualify the exact
combined source under the applicable repository/hosted gates. A subsequent
application change requires review of its delta; a report-only addition does
not change the implementation hashes above.

Actual browser persistence across sessions, cross-tab coordination, native
execution, physical download behavior, recovery of corrupt saved bytes and
owner H-33 publishing/privacy checks remain outside this acceptance. Read-only
fallback behavior for unreadable browser data remains unchanged. Preserve Fleet
default-off, physical qualification, existing performance/security gates and
the 20 MiB ZIP cap. No release, deployment, remote publication, branch deletion
or history rewrite was performed by this reviewer.

Only this report is authored in the review branch. Standards: **S1 closed,
S2 closed; 0 new actionable heuristic findings**. Spec/source: **ownership,
reload recovery and note dictionary corrections accepted; no remaining scoped
code blocker identified**.

Reviewed-by-agent: /root/ledger_code_acceptance_fresh
