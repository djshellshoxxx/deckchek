# Independent code review: ZIP consolidation and Ledger diagnostics

**20 November 2026 — America/Vancouver.** Reviewer session:
`/root/code_review_resume`. This reviewer did not implement the reviewed changes.

## Sources and verdict

| Scope | Frozen source |
| --- | --- |
| Starting main | `715f5ca7bd3c4f461adc8bdca944fbef3d599bac` |
| PR #45 candidate | `7e362e64ee00af6110f04511382af0c77296eb7e` |
| PR #45 tree | `328b31fa3770355a6acb4ab754d0d9f36da72fbc` |
| Separate PR #46 candidate | `800511850c8f311e2e8bd50c5cd2dffbd5ddb246` |

**ACCEPT_FOR_INTEGRATION within the reviewed source scope.** No production
correction or new regression test is required by this review. PR #46 also passes
this source review; its applicable hosted gates remain a separate requirement.
The candidates were not edited or published by this reviewer.

The fixed comparison for PR #45 was
`git diff 715f5ca7bd3c4f461adc8bdca944fbef3d599bac...7e362e64ee00af6110f04511382af0c77296eb7e`.
It changes only `app/zip-writer.js` and `tests/zip-writer.test.mjs`.
The separate comparison
`git diff 7e362e64ee00af6110f04511382af0c77296eb7e..800511850c8f311e2e8bd50c5cd2dffbd5ddb246`
changes only `tools/smoke/ledger.mjs`.

Candidate commits beyond the starting main are `705dfd3`, `b520d02`, `410283b`,
`f096d7b`, `c979056`, `a33d8bc` and `7e362e6`, in chronological order. PR #46
adds `8005118` on that head.

## Standards

Reviewed [development-plan sections 1.1, 1.2, 1.4 and 5.3](../DEVELOPMENT-PLAN.md),
the module's pure/browser-independent contract and the existing callers. No
applicable `AGENTS.md`, separate coding-standard document or issue-tracker
configuration was found in the checkout.

No hard source-standard violation was identified. The writer remains a small,
dependency-free module with synchronous errors. The UTF-8 preflight remains in
the single payload conversion function, entry snapshots have clear ownership,
and emitted-record accounting stays in the writer that owns those records.
The reviewed change does not introduce a shared-foundation duplicate, unused
export or unjustified abstraction. The naming, duplication, responsibility and
indirection smell baseline produced no actionable source finding.

One **nonblocking historical process deviation** remains: commit `705dfd3` uses
the subject `Consolidate ZIP UTF-8 size preflight and leap-day metadata fixes`
instead of the conventional subject form in development-plan section 1.4.
Preserve that published history under the current task's instructions; root can
record the independent review in its final integration merge. This is a commit
convention observation, not a functional defect or reason to rewrite history.

## Spec

The independent Spec/functional axis is assigned to the separate bug-review
worker; this report does not substitute for its acceptance. This code review
checked compatibility with the existing contracts in
[FS-02 section 6](../specs/02-diagnostics-bundle.md) (20 MiB total bundle limit)
and [FS-33 AC-3](../specs/33-gear-ledger.md) (complete offline rendering without
external requests). No contradictory behavior was found in this source diff.

The following properties were checked by source inspection:

- Text preflight counts ASCII, two-byte units, ordinary three-byte units,
  paired supplementary characters and lone-surrogate replacement consistently
  with the subsequent `TextEncoder` operation. The remaining budget already
  reserves the local record, central record and both encoded filenames.
- Caller-owned byte payloads are copied before CRC computation and retained
  record assembly. Later entry access cannot change those archived bytes.
- Each filename is observed once and that same string is used for validation,
  duplicate detection and encoding.
- End-directory counts use the records actually emitted. The writer rejects
  iteration beyond the ZIP32 count before emitting that additional record.
- Clamping a future leap day to the non-leap upper year produces February 28;
  legal leap days and the existing lower-year behavior remain intact.
- PR #46 retains the exact AC-3 predicate:
  `outside.length === 0 && a.imgs === 1 && a.imgsBroken === 0`.
  The added `evaluateAll` call is awaited and supplies only image readiness
  booleans and widths, alongside the already collected request/count evidence.

The new image-readiness values are sampled **after** `pageAudit` returns. They
can help distinguish a transient load from a persistent failure, but they are
not an atomic snapshot with `a.imgsBroken` and do not establish the cause of the
earlier hosted failure. No production image handling, retry or gate relaxation
is part of PR #46.

## Verification and limits

Executed both fixed-source `git diff --check` commands successfully and checked
the candidate commit/tree and exact file lists. The tracked checkout was clean
before adding this report. Read the complete ZIP writer, changed regression
cases, browser-bundle caller and relevant Ledger audit/flow code.

No application test, full suite, browser launch, native build, network probe,
dependency scanner or hardware test was performed by this reviewer. Root owns
the separately reported hosted outcomes and must bind them to the final
candidate. No passing result was inferred from an unchanged test predicate or
from another source's successful run.

## Handoff

Root should aggregate the independent code, Spec/bug and defensive-security
reviews, verify the applicable hosted checks against the current main/PR state,
and preserve the original Ledger failure together with its successful rerun.
Record this reviewer session in the merge body. Keep the optional PR #46
diagnostics separate until its own gates pass. A fresh successor should work
from the resulting live main and a concrete next accepted feature or observed
failure rather than repeating this unchanged ZIP inspection.

**Standards:** zero source findings; one nonblocking published-commit convention
observation. **Spec:** independent axis delegated; zero contradictions identified
in this code review's contract checks. **Merge-blocking source findings:** zero.
