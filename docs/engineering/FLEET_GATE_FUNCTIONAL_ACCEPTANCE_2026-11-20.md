# Fleet gate functional acceptance — 20 November 2026

Reviewer: `/root/fleet_gate_fresh_functional`. Dates use America/Los_Angeles;
execution evidence retains UTC. This fresh worker began after all three initial
workers had completed.

## Disposition

**ACCEPT_FOR_BOUNDED_DIAGNOSTIC_ACTIVATION**, limited to the exact reviewed
tooling and inert workflow proposal. Independent generation, source restoration,
parser and evidence-logic checks passed. No additional actionable functional
finding was identified.

The PR #65 Fleet result remains **201.565999 ms against the unchanged 200 ms
gate**, with its cause unestablished. This acceptance does not clear that gate,
qualify an application source, establish native type/semantic correctness of
the new overlay, or authorize repeated attempts until a pass.

## Exact reviewed identities

| Item | Commit / tree |
| --- | --- |
| Frozen combined tooling checkout | `f1172b87902aa05c93c452619c7ed1e359f939e6` / `41031b09d19dfd1ca90dd95173872aaeb280e3f6` |
| Read-only failed-merge input checkout | `5702a450d9a7faa3efb80c5b67de69386ae07540` / `a2e4f571ac3a9c7d976db911a5fed3f910c3ea26` |
| Initial reviewed tooling source | `9796f80b7b9ec7dfbff26b47a9935ce4b44441e5` / `73cba12d57c6c5ba256cdcd45b9bad9a9822a8f4` |

The generator and proposal hashes match the initial freeze. Fresh generation
used the **actual failed merge** as input, in a separate detached clean checkout.
It did not relabel the author's generation against native-identical tooling
source as execution on that merge.

| Artifact | SHA-256 |
| --- | --- |
| Generator | `3faac5ab1c48b38363a6305d5f382dba23c8d51586a313a887e9ed9343e257c2` |
| Inert workflow proposal | `c5c9aa39aee40eacd9fb5058237d5ff316e22120bb5b12535afa270e8e6dccef` |
| Fresh emitted overlay | `0ee2fcc60232cf25f554986ae43bc9a13dcd7ff2bbeafb92253e6ca9282e9dcf` |
| Fresh failed-merge-bound source proof | `1940de1d300956e5fa24fe85d8ef71893063354a4d08ee2146a6ffa79f44738b` |

The emitted overlay is byte-identical to the initial reviewed overlay. The new
proof identifies the failed merge rather than the earlier tooling commit.

## Independent verification

The [complete validation record](evidence/fleet-gate-acceptance-2026-11-20/validation.json)
contains exact commands, versions, results and the 60 successful checks. The
[separate driver](evidence/fleet-gate-acceptance-2026-11-20/validation-driver.py)
was written for this fresh review. Its checks include independent whole-file
diff analysis, direct generation from the failed merge, and execution of the
workflow's extracted evidence-validation logic without invoking Cargo.

The enclosing validation took **1.4197399330005283 seconds**. This is tooling
validation duration, **not a native benchmark**. All **1,706 tooling files** and
**1,626 failed-merge input files** retained their tracked hashes; both checkouts
were clean before and after. Complete before/after manifests are retained in the
evidence directory and are byte-identical for each checkout.

Generation and restoration established:

- The original Fleet file differs only by two contextual insertions outside its
  existing timer and the appended diagnostic module. The original timed call
  and strict 200 ms assertion remain intact.
- Removing the renamed signature and five instrumentation lines from the phase
  copy restores the exact production function.
- The diagnostic fixture matches the original regression fixture. All 25
  migration hashes, native/migration/vendor tree identities, native manifest,
  lockfile and source proof hashes agree with the failed-merge input.
- The reviewed four-pair bound and gate remain unchanged. Existing generated
  output is preserved on a second invocation; an incorrect expected tree is
  rejected before a new output directory is created.

Parsing succeeded for the generator's Python AST, the YAML proposal, its seven
shell bodies, all three embedded Python blocks, and the emitted Rust AST.
Python was **3.12.14** and PyYAML **6.0.3**. The retained Rust compiler was
`1.102.0-nightly (6905905bb 2026-11-19)` and was used only with
`-Zunpretty=ast-tree`. There was no dependency resolution, application code
generation, linking or native test execution. The hosted experiment must still
resolve and verify the failed run's different `c7d5ba59d` compiler.

## Evidence-validation behavior

The [eight classifier cases](evidence/fleet-gate-acceptance-2026-11-20/log-classifier-cases.json)
execute the frozen workflow's extracted log-classification statements. The
retained real failure log is recognized as a complete baseline execution,
without treating that result as a pass. Ordinary controlled records check the
instrumented marker requirement, duplicate-marker rejection, exactly four
complete phase pairs, zero-match rejection, missing-pair rejection and rejection
of duplicate result summaries.

The [nine finalizer cases](evidence/fleet-gate-acceptance-2026-11-20/finalizer-cases.json)
execute the frozen finalizer against temporary, explicitly synthetic evidence
records. A baseline exit of 101 remains a failed final job even when later
records are complete. Incomplete phase evidence, unexpected tracked-file state,
changed lock identity, missing binary evidence, wrong overlay identity, changed
migration evidence and a missing stage record also produce failure. The fixture
records are validation inputs, not native measurements or qualification data.

These 17 cases are included within the 60 tooling checks; they are not an
additional project-test count. No author or overlapping run totals are added.

## Activation boundary and remaining limits

The proposal remains under `docs/engineering/proposals`, outside active
workflows. After all fresh reviewers finish, root may copy its **identical
reviewed bytes** to the dedicated diagnostic branch's active workflow path for
one bounded experiment. The proposal uses read-only repository permissions,
credential-free source/tooling checkouts, explicit identities, 69 minutes of
aggregate step maxima within a 75-minute job, retained failure records, and
final failure propagation. Provider cancellation or runner loss can still
interrupt artifact delivery.

The experiment remains one untouched full native baseline, a separate full-suite
invocation with contextual probes outside the original timer, and one selected
diagnostic containing four alternating phase comparisons. The original
production function, native dependencies, ordinary workflows, default test
parallelism, ASan settings and Fleet default-off remain unchanged.

The temporary overlay has **not** been natively compiled or run by this review.
Whole-call and phase intervals remain distinct; scheduler counters surround wall
intervals and can be unsupported or inconclusive. Reused fixture pages are warm.
There is no allocation measurement and no established cause or optimization.
A future implementation change would need its own matched verification and
source-specific qualification.

## Evidence and handoff

[The artifact inventory](evidence/fleet-gate-acceptance-2026-11-20/artifact-index.json)
records complete retained evidence hashes. The generated
[source proof](evidence/fleet-gate-acceptance-2026-11-20/generated/source-proof.json)
and [overlay](evidence/fleet-gate-acceptance-2026-11-20/generated/fleet.rs)
are preserved. To reproduce these checks, use clean checkouts of the frozen
identities in the table, not this subsequent report/evidence commit.

Only this report and its owned evidence directory were added. No production or
tooling edits, remote mutations, project tests, native builds, SQL measurements,
scanner/probe activity, dependency installation or timing-gate retry occurred.
The [continuation](FLEET_GATE_CONTINUATION_2026-11-20.md) and initial reports retain
the original failure and the next bounded action.
