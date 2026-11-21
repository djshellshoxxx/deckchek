# Independent Gear Ledger code audit — 20 November 2026

Reviewer: `/root/ledger_code_audit_round1`. Date uses America/Vancouver.
This reviewer did not implement the reviewed changes.

## Fixed source and disposition

- Fixed point: `3d1ee5bddb56db1290af0166874612ada3c0a566` (the separate PR #54
  qualification candidate containing reviewed #48 and merged #46).
- Reviewed head: `9c90091be33fa58085bff80b34121d8cf4053a3a`.
- Reviewed tree: `4efa2e323bd9cef9f95d548a31e892ae174551c4`.
- Captured comparison:
  `git diff 3d1ee5bddb56db1290af0166874612ada3c0a566...9c90091be33fa58085bff80b34121d8cf4053a3a`.
- Commit inventory:
  `git log 3d1ee5bddb56db1290af0166874612ada3c0a566..9c90091be33fa58085bff80b34121d8cf4053a3a --oneline`.
- Seven files differ: three application files and four test files, 269 additions
  and 17 deletions. The integration carries the distinct #47 ZIP regression,
  #49–#51 publishing copy, #52 note queue and #53/#55/#56 storage corrections.

**Review complete; findings require disposition before final integration.**
There are two confirmed documented-standard gaps and one source-derived
functional ownership concern delegated for real-screen reproduction. This is
not an acceptance of a subsequent corrected tree or a hosted-qualification pass.
Unchanged PR #48 and ZIP internals were not broadly re-audited.

## Standards

**S1 — Documentation still describes the superseded publishing contract.**
[DEVELOPMENT-PLAN §1.1/§1.2](../DEVELOPMENT-PLAN.md) require documentation updates
with behavior/UI changes; §5.8 requires documentation to match the code.
[FS-33 §3](../specs/33-gear-ledger.md) still tells users to upload the exported
folder, while the reviewed short summaries correctly say to upload its contents
at the publishing root. FS-33 §11 still marks the current Pages settings wording
unverified; the FS-33 [feature matrix](../FEATURE-MATRIX.md) and M8
[implementation-status](../IMPLEMENTATION-STATUS.md) row repeat that gap.
Update those descriptions and cite the checked primary documentation while
retaining the separate H-33 deployment/owner qualification.

**S2 — New persistence errors omit the next action.** DEVELOPMENT-PLAN §5.7
requires error messages to give cause, consequence and next step.
`app/ledger/api.js` lines 44, 52 and 56 explain unreadable/unavailable/failed
storage and unsuccessful saving, but neither the API message nor the enclosing
note/export error tells the user how to protect the current draft and proceed.
Add a concise, non-destructive recovery instruction. Corrupt stored data must
remain preserved; the message must not recommend clearing it as an automatic
fix. This is a documented error-guidance gap, not evidence that the storage
guard overwrites data.

No additional actionable baseline smell was found. The small keyed queue has
one responsibility, retains each caller's rejection, clears only its current
tail and leaves different assets independent. The parser shares read/mutation
logic while explicitly selecting stricter mutation behavior. No broad refactor
is warranted. Historical commit/branch naming is not a request to rewrite or
delete preserved history; root controls the final integration record.

## Spec

**F1 — Verify latest-draft ownership for A → B → A edits.** The new queue orders
backend calls, but unchanged completion logic in `app/ui/screens/ledger.js:277`
still clears a draft by text equality alone. With three submitted values A, B,
A, the first A can remove the newest A draft while later writes remain queued.
If B then succeeds and the final A fails, `commitEdits` only returns failures
whose draft remains (`:299`). An already-waiting build could therefore continue
with B and no retained newest draft. This is a source-derived execution-order
concern, **not a test reproduction performed by this reviewer**, and it has been
sent to root for the independent functional worker to exercise in the real
screen. The vulnerable completion condition predates this queue; the review
does not claim the queue introduced it. Resolve ownership and preserve retryable
drafts if confirmed. Relevant contracts: FS-33 §3 error states and
DEVELOPMENT-PLAN §5.3 concurrency/error handling.

Otherwise the inspected delta matches the claimed scope. The guard rejects
unreadable/malformed existing storage before mutation, distinguishes absent
from empty stored values and retains native dispatch. Failed synchronous writes
reject instead of claiming successful persistence. Read-only empty fallbacks
remain unchanged. Publishing guidance satisfies AC-6's numbered manual guide
and no-credentials contract; it adds no upload operation or privacy preset.

This code worker's limited Spec observations do not replace the separately
assigned full functional/Spec review. No physical, cross-tab, native transaction
or browser-session durability guarantee is inferred.

## Primary documentation independently checked

The following GitHub pages were opened and checked on 20 November 2026:

- [Publishing-source configuration](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site):
  branch publishing, Settings/Pages labels and root-folder selection agree with
  the revised guide.
- [Creating a Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site):
  plan/repository visibility, public-site caveat and top-level entry-file
  placement support the revised copy.
- [Deleting repository files](https://docs.github.com/en/repositories/working-with-files/managing-files/deleting-files-in-a-repository):
  ordinary deletion retains earlier Git history, supporting the disclosure
  limitation.

These checks do not constitute an actual owner deployment or H-33 completion.

## Verification and handoff

Source and Git inspection covered the changed code/tests, complete queue,
browser API mutation/read paths, actual note-save/commit/build/export consumers,
FS-33 and applicable development-plan sections. The fixed head/tree and clean
working tree were confirmed. `git diff --check` for the fixed comparison passed.
No AGENTS, CONTRIBUTING, CODING_STANDARDS or issue-tracker file was found in the
bounded instruction inventory.

No application test, full suite, native build, browser launch, scanner, fuzz
run, external probe or hardware test was executed by this reviewer. Other
workers' results remain their source-bound evidence. Only this report is edited
and committed in the review branch; root owns source integration/publication.

Root should record the dispositions of S1/S2 and the functional outcome for F1,
then give any new implementation to a fresh reviewer. Keep published candidates
stable, retain all branches and the original performance failures, preserve
Fleet default-off and the existing security/physical/hosted gates.

Standards: **2 documented gaps; 0 actionable heuristic findings**. Spec:
**1 source-derived ownership concern awaiting reproduction; no other confirmed
missing or conflicting requirement in this limited inspection**.

Reviewed-by-agent: /root/ledger_code_audit_round1
