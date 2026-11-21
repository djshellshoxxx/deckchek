# CDJ-04 acquisition: independent code acceptance — 20 November 2026

Worker: `/root/cdj_acquisition_code_acceptance`. The report date uses
America/Los_Angeles. This is a fresh source-only review after all three initial
acquisition workers completed.

## Disposition and exact boundary

**Accepted for the frozen single-pair acquisition slice. Standards: zero
actionable findings. Spec: zero unresolved findings within this slice.**
The original channel-map correction and explicit descriptor unknowns are
present in the combined source. This disposition does not complete the player
workflow or replace independent runtime and hosted qualification.

| Role | Commit / tree |
| --- | --- |
| Preserved published QR predecessor, PR #65 | `562609b4acc8bc24704cc864ef27c0b11c56bc00` / `a2e4f571ac3a9c7d976db911a5fed3f910c3ea26` |
| Final acquisition author implementation | `3e7ae2d239686061a5056efb672be4ae135215e1` / `2ef190b0a9a4d94db0ab352ff784dd414c69f322` |
| Frozen combined source reviewed here | `55f7ea2c8759c985bbbd463f374ca2c78d99a669` / `54a86922bfd8cca87c076b755edd0b3432034aee` |

The checkout began clean, with 1,643 tracked files. The fixed point resolves,
is an ancestor of the reviewed source, and has a nonempty diff:

```sh
git diff 562609b4acc8bc24704cc864ef27c0b11c56bc00...55f7ea2c8759c985bbbd463f374ca2c78d99a669
git log 562609b4acc8bc24704cc864ef27c0b11c56bc00..55f7ea2c8759c985bbbd463f374ca2c78d99a669 --oneline -- app/player/acquisition.js tests/cdj-acquisition.test.mjs
```

Only [the acquisition controller](../../app/player/acquisition.js) and
[its test file](../../tests/cdj-acquisition.test.mjs) differ across app, mobile,
tests, tools, native source, database, workflows and package configuration.
The other additions are the initial reviews/evidence and predecessor publication
record. The two relevant implementation commits are `ef443d4` (controller and
tests) and `3e7ae2d` (explicit unknowns and validated primary-pair mode).
Their final module/test bytes match the combined review source exactly.

## Review basis

Requirements came from [SPEC-00 section 5](../SPEC-00-product-architecture.md),
[SPEC-10's player contract](../SPEC-10-CDJ-media-player-diagnostics.md), and the
[capture-owned acquisition handoff](CDJ04_EVIDENCE_CONTINUATION_2026-11-20.md).
The initial [code](CDJ04_ACQUISITION_CODE_AUDIT_2026-11-20.md),
[functional](CDJ04_ACQUISITION_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](CDJ04_ACQUISITION_SECURITY_AUDIT_2026-11-20.md) reports were read as
handoff evidence, followed by independent inspection of the frozen code.

The [frontend guide](../../app/README.md) provides the ES-module/bridge structure.
No additional AGENTS.md, dedicated coding-standards document or issue-tracker
instructions were found in this checkout or its ancestors. The supplied local
specifications were sufficient. The Code Review skill's Standards and Spec
axes and judgement-based smell baseline were applied within this assigned
worker; no additional agents were spawned.

## Standards

**Zero actionable findings.** The module reuses the existing pair parser and
evidence normalizer. Capture I/O is supplied through an explicit provider;
importing the module does not acquire audio. Metadata adaptation belongs at
this boundary because it translates the existing native observations into the
new provisional player contract. It does not move DSP, native permissions or
UI concerns into that boundary.

The internal helpers separate own-data reads, bounded diagnostics, clocks,
IDs, freezing and observation assembly. The ownership variables have distinct
roles: the current session remains available for cleanup until a successful
stop resolves, while the stopping flag distinguishes expected stop status from
premature loss. The smell baseline did not identify a concrete additional
refactor worth changing this scope. Automated formatting was checked separately
and is not counted as a review finding.

The 17 new test cases were inspected as source. They use the real
`payloadToAudio` adapter with ordinary synthetic captures and controlled
session promises. They exercise observable lifecycle results and metadata
meaning rather than merely reproducing individual helper statements. This
review did not execute those tests.

## Spec

**Zero unresolved findings in the selected acquisition slice.**

| Requirement | Independent source conclusion |
| --- | --- |
| Own capture lifetime | Requests are validated before opening. Pre-abort opens nothing; busy/failed startup does not clean another session. Abandoned startup attaches cleanup to its later resolution. Recording cancellation, preemption, loss and provider/callback errors enter the owned-session cleanup path. |
| Pending stop and normal completion | The returned session's stop is raced against cancellation. An abandoned stop cannot later yield a completed record. Expected `running:false` status during normal stop is distinguished from earlier loss. Successful stop clears the owned-session reference before metadata normalization; final listener/timer cleanup runs on every path. |
| Actual observations | Present/valid native markers precede rate, channel, device and pair attribution. Returned rate/channels and primary array counts/pair metadata must agree with those markers. Missing markers, compatibility defaults and requested labels cannot fill observed fields. |
| Canonical pair scope | The request admits one pair. Observed indices are range/uniqueness checked; mono is restricted to the final odd channel. Primary mode requires one validated matching pair. Unexpected multiple pairs remain visible with primary-only sample scope and unavailable continuity. |
| Timing meaning | Requested duration, host request/ready/completion time and primary frames divided by nominal rate remain separate. Measured clock rate, calibration and first-sample hardware time are null. A backwards host clock yields a null host interval rather than changing sample-derived duration. |
| Immutable metadata | Requests and operator records are snapshotted before acquisition. Returned metadata is copied and deeply frozen. Mutable waveform buffers remain in a separate ephemeral audio object and cannot mutate the descriptor or evidence record. |
| Bounded diagnostics | Safe nonnegative counters retain their native meaning. Error lists retain at most 20 messages of 1,000 characters, with received/omitted/shortened counts. Missing counters stay unavailable; reported errors, clipping, capacity truncation and frame-count mismatches remain explicit. |
| Qualification and retention | Only normalized asset/source/processing/pitch assertions enter the produced record. Caller analysis and quality assertions are omitted. The record stays unverified, report-ineligible and without a measurement; both raw-reference lists stay empty. |

The actual [session adapter](../../app/ui/audio-io.js) does not consume an
AbortSignal, so the controller correctly owns its cancellation race rather
than assuming the dependency does. Cleanup calls only the returned session's
cancel/stop methods. The [capture bridge](../../app/capture.js) and native stop
contract use the session lease, with no new global stop/preempt operation.
Late cleanup depends on the provider eventually exposing its session; this
does not promise prompt interruption of an unresponsive OS/native open.

Native [capture counters](../../src-tauri/src/capture.rs) confirm the field
names and meanings: captured frames and primary-pair clipped samples are
separate counters; `overrunSamples` is not a dropped-buffer count. The native
diagnostic list limit is 20. `continuity.state = observed` is expressly based
on available native counters, not proven gap-free hardware operation. No new
callback-gap, dropout, calibration or scientific threshold is introduced.

Both original code findings are closed. P1's interior-mono case is rejected by
the final-channel condition. P2's source type, gain-staging, phono/line and
external-RIAA observations are explicit nulls; primary mode is derived only
from validated matching single-pair metadata. The corresponding test-source
assertions cover unknown, stereo, final-channel mono and unexpected multi-pair
states.

The v1 evidence record and versioned acquisition object remain separate JSON
objects. Serializing the evidence record alone does not retain the descriptor.
The run UUID is shared by those two objects; the capture UUID is separate.
The raw observed device text is retained in the descriptor, while the existing
record normalizer trims its display text. Neither label is a stable physical
device identifier.

## Static verification

Read-only Git comparisons confirmed the only two runtime additions and their
identity with the final author source. The existing evidence/pitch modules,
audio adapter, capture bridge and native capture source also match published
PR #65 byte for byte. The implementation diff passed `git diff --check`.
File hashes were calculated from bytes with Python's standard `hashlib`;
no project module was imported.

| File | SHA-256 |
| --- | --- |
| Acquisition controller | `49e67475808248d9f920c9a69ea090786669c1faf54b6f4cf0ccea36a5961fe8` |
| Acquisition tests | `9f221f9fd5c94658cb27cac3568f95ca7d36c50d51c34cd01a7c437e89b8ebd2` |
| Evidence module | `52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207` |
| Pitch helper | `040a0703f8d68cecedae43616b977378f11baf5f6ac8e18be487e1bd85262988` |
| Audio-I/O adapter | `0c9b78c970da7ff38386651c1778cd485b8edbcdfbfeedb6cbbeacb77f1569f6` |
| Capture bridge | `9204f3df759d883052941838364814865f58d5178d525d29e81ebde02df5473b` |
| Native capture source | `35a491ac4f392935b1d31f589f647fea48d0fdebb2d952ffd02426f64e438bfc` |

Only this report is added by the acceptance worker. Its local links and staged
formatting are checked before commit, and its final hash is delivered in the
handoff. No application tests, syntax execution, generator, native build,
browser/audio-device session, scanner or probe was run. Functional execution
and hosted qualification belong to their separate owners.

## Remaining workflow gates

A source search finds the new API only in its controller and tests: production
UI wiring remains unfinished. Durable raw/reference storage and hashing,
sample-rate/reference/estimator suitability, scientific uncertainty, faithful
SQLite/history/HTML persistence of both metadata objects and physical player
qualification remain separate work. Observed acquisition fields do not grant
scientific comparison eligibility or complete SPEC-00/SPEC-10 as a whole.

**Axes summary:** Standards — zero actionable findings; Spec — zero unresolved
findings within the bounded acquisition slice. No runtime or global
certification is implied by this independent source acceptance.
