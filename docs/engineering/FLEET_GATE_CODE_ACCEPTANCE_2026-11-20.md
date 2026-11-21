# Fleet gate fresh code acceptance — 20 November 2026

Reviewer: `/root/fleet_gate_fresh_code`. The report date uses
America/Los_Angeles; retained execution records use UTC.

## Disposition

**ACCEPT_FOR_DIAGNOSTIC_ACTIVATION**, within this independent source-review
scope, after the other fresh workers finish and root verifies the exact
activation bytes. No new blocking code or specification finding was identified
in the frozen generator, inert workflow, retained emitted source or proposed
single-experiment handoff.

This accepts a bounded diagnostic design. It does not establish that the new
Rust compiles, that the hosted experiment succeeds, that an optimization exists,
or that PR #65 qualifies for merge. Its retained **201.565999 ms** result against
the unchanged **200 ms** gate remains a failure with no established cause.

## Exact review boundary

The assigned worktree was clean at the following combined source. All three
initial workers had completed before this fresh review began.

| Artifact | Identity |
| --- | --- |
| Combined reviewed commit | `f1172b87902aa05c93c452619c7ed1e359f939e6` |
| Combined reviewed tree | `41031b09d19dfd1ca90dd95173872aaeb280e3f6` |
| Initial tooling commit | `9796f80b7b9ec7dfbff26b47a9935ce4b44441e5` |
| Generator SHA-256 | `3faac5ab1c48b38363a6305d5f382dba23c8d51586a313a887e9ed9343e257c2` |
| Inert proposal SHA-256 | `c5c9aa39aee40eacd9fb5058237d5ff316e22120bb5b12535afa270e8e6dccef` |
| Original Fleet SHA-256 | `3555c7d515aa64c383098ded7954e2f65c4899ae4589018ffaf0d03f54cef186` |
| Retained generated overlay SHA-256 | `0ee2fcc60232cf25f554986ae43bc9a13dcd7ff2bbeafb92253e6ca9282e9dcf` |

The [generator](../../tools/fleet-gate-diagnostic.py) and
[inert proposal](proposals/fleet-gate-diagnostic.yml) have empty diffs from the
initial tooling freeze. The combined source has no changes relative to published
PR #67 head `157b0dbe1849d42e835cc365ba7292eb633c04d9` in `app`, `mobile`,
`src-tauri`, `database`, `vendor`, existing `.github/workflows`, or `tests`.

I independently inspected actual failed merge
`5702a450d9a7faa3efb80c5b67de69386ae07540`: its tree is
`a2e4f571ac3a9c7d976db911a5fed3f910c3ea26`, its parents are
`cfb1137d3d01ddd4a9fd0677113314dc7deb76ee` and
`562609b4acc8bc24704cc864ef27c0b11c56bc00`, and its full-tree diff from that
published PR #65 head is empty. The new proposal explicitly checks out that
failed merge; it does not silently substitute the combined review source.

The [continuation](FLEET_GATE_CONTINUATION_2026-11-20.md), initial
[code](FLEET_GATE_CODE_AUDIT_2026-11-20.md),
[functional](FLEET_GATE_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](FLEET_GATE_SECURITY_AUDIT_2026-11-20.md) reports supplied the handoff.
This review focused on the new diagnostic and its integration. It did not repeat
the unchanged QR, CDJ or older standalone-diagnostic audits.

## Source and measurement fidelity

The generator requires the explicit expected commit and tree, clean tracked
source, the exact Fleet hash, and an output outside the source checkout. It
preserves a nonempty output directory. Its source extraction uses the existing
production function, migration-backed database helper, complete original
pre-timer fixture and confirmed-usage SQL. Each instrumentation insertion has
an exact occurrence guard; reverse transformations must restore the function
and existing regression text before an overlay is emitted.

Independently inspecting the already retained
[generated Fleet file](evidence/fleet-gate-functional-2026-11-20/generated/fleet.rs),
I removed only its two documented outside-timer probes and appended diagnostic
module in memory. The complete remaining file equals the original bytes. The
retained overlay hash and all 25 migration hashes match its
[source proof](evidence/fleet-gate-functional-2026-11-20/generated/source-proof.json).
That retained proof is correctly bound to the initial tooling commit
`9796f80b`; it is not relabelled as a new execution on the failed merge. This was
static artifact comparison, without running the generator or emitted Rust.

| Measurement | Preserved boundary and interpretation |
| --- | --- |
| Untouched baseline | One complete native ASan suite on the fixed failed merge, with the original command shape, target, sanitizer settings and default test parallelism. The compiler identity is checked before execution. |
| Instrumented existing gate | The original timer still surrounds only `reminders(&conn, None)` and its return. Scheduler reads occur before the timer and after its elapsed sample. The strict `elapsed < 200 ms` assertion and fixture remain unchanged. |
| Four phase pairs | One ignored diagnostic test runs exactly four pairs with alternating call order. Each compares all 2,000 returned rows, including ordering and values. No row sampling or result truncation is introduced. |
| Phase versus whole call | The four phase intervals exclude recorder work between phases and callee cleanup after the final phase. Whole-call intervals include callee cleanup; the returned vectors remain held by the caller until the pair completes. These are distinct measurements. |
| Query context | The three original SQL reads are explained for both all-assets and `fleet-5` scopes after timing. The application connection supplies the SQLite version, compile options and migration count. |

The original function remains present and unchanged. The temporary measured
copy preserves SQL parameters, row conversions, errors, ordering and enrichment.
The full result equality assertion supplements those source checks. No cache,
schema/index experiment, new dependency, allocator override, reduced fixture,
row-dropping optimization or performance-threshold change is introduced.

The fixed scheduler input is contextual. Its snapshots surround the wall
intervals and include different read overhead. Missing, malformed, decreasing
or nonadvancing counters cannot establish an absence of scheduling delay.
Repeated calls reuse a fixture warmed by writes. Instrumentation changes the
test binary and adds work outside the measured intervals; its results cannot
retroactively qualify the untouched source or establish a compiler cause.

The specification remains [FS-23 §8](../specs/23-venue-fleet-dashboard.md#8-test-plan)
and the [development-plan database budget](../DEVELOPMENT-PLAN.md#55-performance--cpu-budget-m9-perf-top).
Fleet's physical/real-database gates and default-off state remain open.

## Completeness and failure propagation

The initial evidence-validation findings are closed in the frozen source.
The runner requires one complete test-result summary and the expected
populations below; a summary alone does not count as complete measurement
evidence.

| Invocation | Required native result population | Additional required evidence |
| --- | --- | --- |
| Baseline | 767 executed (passed + failed); eight ignored; zero measured or filtered | No generated gate marker; a real test-binary path and hash |
| Instrumented suite | 767 executed (passed + failed); nine ignored; zero measured or filtered | Exactly one gate marker retaining the 200 ms budget; binary hash |
| Isolated phase test | One passed; zero failed, ignored or measured; 775 filtered | Pairs 0–3 in order, 2,000 equal rows and four phases per pair, one SQL record with 25 migrations and six plans; binary hash |

`tests_ran` permits further diagnostic collection after a completed but failing
baseline; it is not a pass signal. The final step separately requires every
invocation to have exit zero and complete evidence. A failed baseline therefore
cannot be erased by a later passing phase test. Missing stages, zero matches,
incomplete records or exceptions retain a failed job.

Final validation also requires the original clean source state and Fleet hash
for the baseline, then exactly the intended tracked Fleet modification and
emitted overlay hash for later stages. Manifest and lock hashes must match
preserved originals; migration hashes must match the generated proof. The
compiler check has no fallback to a different revision. The raw log's recorded
Cargo binary-path form is compatible with the proposed binary locator.

Each full-suite subprocess is bounded to 1,200 seconds; the phase subprocess is
bounded to 180 seconds. Timeout cleanup targets its process group, handles an
already-exited process, and records code 124. The source has 69 minutes of
explicit step maxima inside a 75-minute job, including upload/finalization.
The always-run artifact upload does not guarantee delivery after provider
cancellation, runner loss or upload-service failure; that limitation is retained.

## Activation and remaining handoff

The reviewed YAML is currently inert under `docs/engineering/proposals`.
Its push trigger names only `diagnostic/fleet-gate-context-20261121`; its other
trigger is explicit manual dispatch. It declares `contents: read`, uses
credential-free source/tooling checkouts and contains no deployment or release
step. Current standard, nightly and desktop workflow push filters select main
or release tags, so the planned dedicated-branch push does not select them.

Root's stated activation is consistent with this review: retain accepted inert
tooling, copy these exact YAML bytes to
`.github/workflows/fleet-gate-context.yml` on the named diagnostic branch, prove
the expected content and head, then perform one guarded push. Do not move #65
or #67, modify an existing gate, merge the transient native overlay, or repeat
the experiment until green. A later push or manual dispatch could start another
run; the single-experiment limit is an orchestration requirement, not a claim
that the YAML globally prevents additional authorized triggers.

The fresh functional worker owns new generation/parser/classifier validation
and its separate evidence. Hosted native compilation, execution, complete
artifact retrieval and interpretation remain subsequent work. Any eventual
production optimization needs measured benefit, independent review and its
own unchanged qualification gates on the exact candidate source.

## Review method

I used source/report reads, `rg`, Git identity and scoped-diff comparisons, and
standard-library hashing/JSON/text inspection of existing artifacts. No local
`AGENTS.md` was found in the worktree or inspected workspace ancestry; the
assigned ownership and standing preservation rules controlled this review.

This worker did not run the generator, syntax checks, project tests, builds,
benchmarks, native measurements, scanners, probes or remote writes. Only this
report was authored. Report link and whitespace checks are documentation
verification, not application qualification.
