# Fleet gate functional audit — 20 November 2026

Author: `/root/fleet_gate_bug_hunt`. This workstream retains its 20 November
filename; the recorded investigation and local tooling checks occurred on
21 November UTC. No production optimization or native runtime pass is claimed.

## Disposition

**The PR65 Fleet timing blocker remains open, with its cause unestablished.**
There is no measured basis for another production change. This worker completed
a source-bound investigation and a minimal, inert hosted diagnostic proposal.
The proposal passed initial parallel code/security review and frozen-source
generation/parser checks. It is ready for a fresh independent acceptance set
before root considers one bounded hosted experiment.

No Fleet/QR/CDJ implementation, manifest, dependency, migration, application
workflow, feature default, 200 ms assertion, ASan flag or production test
parallelism changed. No Cargo build, native test, SQL timing experiment, new
toolchain download, remote write, deployment or feature enablement occurred.

## Failure and exact source

The complete preserved [PR65 ASan log](evidence/fleet-gate-functional-2026-11-20/pr65-asan-failure.log)
is from [run 44862296853, job 136718158369](https://github.com/djshellshoxxx/deckchek/actions/runs/44862296853/job/136718158369).
It reports the reminder overview at **201.565999 ms** against the unchanged
**200 ms** assertion in `src/fleet.rs:1845`. The full suite ended with **766
passed, one failed, eight ignored**, in **247.41 seconds**, and Cargo exited
**101**. That original result remains a failure regardless of later diagnostics.

The job checked out merge **`5702a450d9a7faa3efb80c5b67de69386ae07540`**, tree
**`a2e4f571ac3a9c7d976db911a5fed3f910c3ea26`**, rather than only PR head
`562609b4acc8bc24704cc864ef27c0b11c56bc00`. Its parents are main
`cfb1137d3d01ddd4a9fd0677113314dc7deb76ee` and that PR head. Local Git-object
inspection confirmed these identities. The raw log's Git blob is
`e36208aa6bbc298052a132f662f9bf386d8f2cc7`; its SHA-256 is
`e3e01b87903722839f0308c353537d7b3619736f423425263154dc0f5237820d`.

This worker began at `c81646dde87676973fe08e081c216f2fa58aeeee`, tree
`a1ff97563b88da9c80f8a298fbc58a01345e6218`. The tooling was frozen before final
checks at **`9796f80b7b9ec7dfbff26b47a9935ce4b44441e5`**, tree
**`73cba12d57c6c5ba256cdcd45b9bad9a9822a8f4`**. That commit adds only the
[generator](../../tools/fleet-gate-diagnostic.py) and
[inert workflow proposal](proposals/fleet-gate-diagnostic.yml). This report and
its evidence are a subsequent documentation-only addition.

The [investigation record](evidence/fleet-gate-functional-2026-11-20/investigation.json)
binds the failed merge, failed head, worker base, tooling freeze and historical
diagnostic `2c93d658f4703c863405064121c975f8679592eb`. Their entire native tree is
identical at `10e575b294f2449efb166e359e4a07e1fcb687b3`; their migration/vendor
trees and native manifest, lock, Fleet and normal nightly blobs also match.
The final local comparison additionally checked the embedded contract/fixture
inputs and `app/population-metrics.json` against the failed merge.

## What the source and prior measurements establish

The timed interval in the failing regression contains one call to
`reminders(&conn, None)`. Database creation, all 25 migrations, fixture writes,
query-plan assertions, output assertions and the filtered `fleet-5` call are
outside it. The fixture contains two seed assets plus 1,000 Fleet assets,
2,000 reminders, 10,000 events and 3,000 confirmed usage records.

The existing implementation performs a completion query/map, a conditional
confirmed-usage query/map, a reminder query/JSON mapping, and in-memory
enrichment. There is no SQL call in the per-reminder enrichment loop. Source
inspection does not establish which of those phases caused the hosted overrun.
It also cannot convert a query-plan comment into proof of index selection.

The prior author's [isolated measurement record](evidence/fleet-gate-functional-2026-11-20/prior-author-measurement.json)
reported 2/2 tests and a 110.555698 ms separate unchanged-function call, using
SQLite 3.54.1 and `rustc 1.102.0-nightly (6905905bb 2026-11-19)`. Fleet, database
and application-lock input hashes match this investigation. Its single phase
observation made reminder query/JSON the largest wall-time phase, but this was
an extracted crate with allocator instrumentation, a separate invocation order,
and unverified full-application feature unification. It is not a hosted PR65
measurement or evidence of a new optimization's benefit.

The independent follow-up's [complete compile-failure log](evidence/fleet-gate-functional-2026-11-20/prior-independent-compile-failure.log)
and [result record](evidence/fleet-gate-functional-2026-11-20/prior-independent-native-result.json)
remain preserved. Bundled SQLite's `cc1` was killed before tests ran; Cargo
exited 101. The cause was not established. This worker did not repeat that build.

The failed PR65 log records the newer compiler
**`rustc 1.102.0-nightly (c7d5ba59d 2026-11-20)`**. The earlier #47
200.055967 ms failure and subsequent successful #58/#59 gates remain separate
historical observations. The parallel code audit and root's read-only job review
found the latter two successful runs used `6905905bb`. A compiler/context
difference is a variable to control, not proof that the compiler caused failure.
No scheduler, memory-pressure, compiler-regression or flakiness diagnosis is made.

## Why local native measurement was not repeated

The [bounded cache inventory](evidence/fleet-gate-functional-2026-11-20/environment-discovery.json)
found no reusable bundled SQLite library, rusqlite artifact or completed test
binary in either preserved diagnostic directory. The failed build's partial
target still exists. The retained compiler is the older `6905905bb`, not the
failed run's `c7d5ba59d`.

The recorded [filesystem readback](evidence/fleet-gate-functional-2026-11-20/filesystem.stdout)
showed 450 MB free on the workspace overlay and 1.7 GB on `/tmp` at the final
check. [Native SDK discovery](evidence/fleet-gate-functional-2026-11-20/native-sdk-presence.stderr)
did not find `gtk+-3.0`, `webkit2gtk-4.1`, `alsa` or
`ayatana-appindicator3-0.1`. These facts constrain a new local attempt; they do
not explain the earlier compiler kill or hosted timing failure. No broad SDK
installation, cache expansion or unmatched benchmark was undertaken.

## The reviewable next experiment

The YAML is under `docs/engineering/proposals`, so it currently triggers nothing.
It proposes two immutable checkouts: the exact failed merge for the application
and the selected diagnostic commit for tooling. It asserts the merge's tree,
clean tracked source, the known Fleet hash and the failed log's compiler prefix
before executing. The pinned toolchain date is `nightly-2026-11-21`; a different
resolved compiler fails the identity check.

The sequence is deliberately bounded:

1. Run **one untouched full native ASan baseline** with the normal `-j 4`,
   `--lib`, target and sanitizer settings. Retain its complete log, exit code,
   elapsed duration, test binary hash and source hashes. A build that does not
   reach the expected suite stops further diagnostic execution.
2. Generate the transient Fleet overlay outside the source checkout, recording
   its exact bytes and provenance. Install it only in that disposable checkout.
   Run the full suite again with default test parallelism and captured output.
   The only additions to the existing regression are scheduler-counter reads
   before its timer and a contextual record after its timer. The original
   timed call and 200 ms assertion are unchanged.
3. Run one explicitly selected ignored diagnostic test, using the full native
   dependency graph. It copies the exact fixture, compares the entire 2,000-row
   result of the original function with a phase-instrumented copy, and emits
   **four fixed pairs** with alternating call order. It then records all three
   actual query plans for both unfiltered and `fleet-5` reads, the bundled
   SQLite version/compile options and the migration count.

The original implementation is restored byte-for-byte by removing the two
outside-timer probe insertions and the appended module. The measured copy
restores to the exact production function by removing only its renamed
signature and five instrumentation insertions. The generator rejects an
unexpected source identity or nonempty output directory and never edits its
source checkout itself.

The workflow requires the expected full-suite counts, one instrumented gate
record, exactly four complete phase pairs, one SQL-context record with 25
migrations and six plans, and a real test binary hash. It checks original or
overlay source hashes, the exact permitted tracked-file status, and unchanged
manifest/lock/migration identities. A filter that executes no target test,
incomplete records, unexpected mutations or a nonzero baseline/diagnostic exit
keep the final job failed. A passing instrumented run cannot replace a failed
baseline.

Each full-suite subprocess has a 1,200-second bound; the phase invocation has
180 seconds. Timeout cleanup targets that subprocess's process group, records
124, and handles the process-exit race. Explicit step maxima total 69 minutes
inside a 75-minute job, leaving artifact/finalization margin. An always-run
upload preserves ordinary failure evidence for 14 days. Provider cancellation
or hard runner loss can still interrupt delivery. The original PR65 log is
already preserved separately and is never overwritten.

## Measurement limits that remain part of the artifact

`/proc/thread-self/schedstat` is a fixed, read-only contextual input. The Linux
kernel [documents](https://www.kernel.org/doc/html/latest/scheduler/sched-stats.html)
its CPU runtime, runqueue wait and timeslice fields. Missing/unparseable counters
or decreasing values produce null; zero or nonadvancing counters are
inconclusive. Counter snapshots surround the wall intervals and include
different read overhead. They must not be presented as exactly coincident CPU
timings or as a causal contention finding.

Whole-call observations include function-return cleanup. The four phase
intervals exclude that cleanup and recorder work between phases. The instrumented
whole call includes probe overhead. The fixture's pages are already warmed by
writes; later pairs reuse it, so no cold-cache claim is valid. This proposal
does not install a global allocator or measure allocation counts, SQLite C
allocations, peak memory or leaks. Leak detection remains explicitly disabled
as in the original gate.

The hosted runner image is recorded, not guaranteed identical to the historical
image. Exact compiler/source identity and effective feature output improve
comparability but cannot reproduce every scheduling condition. All native
execution and semantic/type correctness of the new diagnostic remain pending
until the hosted experiment; parser success below is narrower.

## Frozen-source tooling validation

The [validation record](evidence/fleet-gate-functional-2026-11-20/validation.json)
and [driver](evidence/fleet-gate-functional-2026-11-20/validation-driver.py)
preserve exact commands and results. The local run used Python 3.12.14, PyYAML
6.0.3, and the retained `6905905bb` Rust compiler **for AST parsing only**.
No dependency resolution, code generation, linking, Cargo invocation, test or
SQLite query executed. The prior unmatched compiler therefore supplies no
performance or native-qualification result here.

Generation and independent output checks confirmed the complete original file,
production function, diagnostic fixture and all 25 migration hashes. The
existing output was preserved when generation was repeated, and an incorrect
expected commit was rejected before an output directory was created. YAML,
all seven shell run bodies, all three embedded Python blocks, and the emitted
Rust syntax parsed successfully. All **1,654 tracked file hashes** stayed
unchanged and the checkout remained clean throughout; report/evidence additions
occurred afterward.

| Frozen artifact | SHA-256 |
| --- | --- |
| Generator | `3faac5ab1c48b38363a6305d5f382dba23c8d51586a313a887e9ed9343e257c2` |
| Inert proposal | `c5c9aa39aee40eacd9fb5058237d5ff316e22120bb5b12535afa270e8e6dccef` |
| Locally emitted overlay | `0ee2fcc60232cf25f554986ae43bc9a13dcd7ff2bbeafb92253e6ca9282e9dcf` |
| Local source proof | `e4437f508b5dbb6d16f05c8bccfeef1efa2e3bb1d40d31ff93d0abafe40ca287` |

The generated proof is explicitly bound to tooling commit `9796f80`, whose
native input bytes match the failed merge. A future hosted generation must
produce its own proof bound to `5702a450`; this local generation is not relabeled
as execution on that merge. The complete evidence hash inventory is retained
in [evidence-sha256.json](evidence/fleet-gate-functional-2026-11-20/evidence-sha256.json).

## Handoff

The initial [code audit](FLEET_GATE_CODE_AUDIT_2026-11-20.md) and
[defensive audit](FLEET_GATE_SECURITY_AUDIT_2026-11-20.md) reviewed frozen
`9796f80`. Their findings on incomplete invocation evidence, unchecked source
mutations, timeout retention and the termination race were addressed before
freezing. Neither lane claimed runtime validation.

Root should integrate the three reports and hand this exact tooling source to
fresh reviewers. Only after that acceptance should the reviewed proposal be
copied unchanged into the named diagnostic branch's workflow path for one
profiling experiment. The normal nightly gate remains untouched. Preserve all
results, including any new baseline failure, and use actual phase evidence to
decide whether a production change is justified. No repeated attempt-until-green
loop, threshold change or retrospective pass is supported by this audit.
