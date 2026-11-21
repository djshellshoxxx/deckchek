# Fleet gate fresh defensive acceptance — 20 November 2026

Reviewer: `/root/fleet_gate_fresh_security`. Dates use America/Los_Angeles.
This independent source review followed completion of all three initial workers.

## Disposition and identities

**ACCEPT_FOR_INTEGRATION for the diagnostic tooling and inert workflow proposal
in frozen combined source `f1172b87902aa05c93c452619c7ed1e359f939e6`, within the
reviewed defensive source scope.** No new blocking finding was identified.
Root can complete the separate fresh code/functional acceptance and activate
one exact-byte copy on the named diagnostic branch.

This decision does not establish native type/runtime/performance correctness.
PR #65's **201.565999 ms against 200 ms** remains an unresolved failure. The
compiler difference is a comparison variable, not an established cause.
Published #65/#67 heads and their ordinary gates remain unchanged.

| Item | Independently checked identity |
| --- | --- |
| Combined source | `f1172b87902aa05c93c452619c7ed1e359f939e6`; tree `41031b09d19dfd1ca90dd95173872aaeb280e3f6` |
| Initial tooling source | `9796f80b7b9ec7dfbff26b47a9935ce4b44441e5`; tree `73cba12d57c6c5ba256cdcd45b9bad9a9822a8f4` |
| [Generator](../../tools/fleet-gate-diagnostic.py) | SHA-256 `3faac5ab1c48b38363a6305d5f382dba23c8d51586a313a887e9ed9343e257c2` |
| [Inert proposal](proposals/fleet-gate-diagnostic.yml) | SHA-256 `c5c9aa39aee40eacd9fb5058237d5ff316e22120bb5b12535afa270e8e6dccef` |
| Failed merge | `5702a450d9a7faa3efb80c5b67de69386ae07540`; tree `a2e4f571ac3a9c7d976db911a5fed3f910c3ea26` |

The two tooling files are byte-identical between initial and combined source.
The failed merge has parents main `cfb1137d3d01ddd4a9fd0677113314dc7deb76ee`
and PR #65 head `562609b4acc8bc24704cc864ef27c0b11c56bc00`; its complete tree
has no difference from that head. Native, migration, vendor and nightly objects
match the failed merge, initial tooling, combined freeze and PR #67:

| Preserved input | Git object |
| --- | --- |
| Complete native tree | `10e575b294f2449efb166e359e4a07e1fcb687b3` |
| Migration tree | `875e0d614ee60c61e2db0d43ca364cf5473cfa09` |
| Vendor tree | `18047869da0b4dc46b274550b62c8ac931f994c4` |
| Ordinary nightly workflow | `64818e1109913d8dcdd244bdd62d31aca1029496` |

The [continuation](FLEET_GATE_CONTINUATION_2026-11-20.md) and initial
[functional](FLEET_GATE_FUNCTIONAL_AUDIT_2026-11-20.md),
[code](FLEET_GATE_CODE_AUDIT_2026-11-20.md) and
[defensive](FLEET_GATE_SECURITY_AUDIT_2026-11-20.md) reports preserve context.
Historical results remain attached to their original sources.

## Source, filesystem and result boundaries

The generator requires an explicit expected commit/tree, clean tracked source
and the exact original Fleet hash. The hosted proposal fixes those identities
to the failed merge. Original function/regression text must round-trip after
removing known instrumentation; the proof binds generator, original/overlay,
fixture, regression, manifest/lock, native/vendor/migration trees and all 25
migration hashes. Source identity checks have no revision/compiler fallback.

The production function remains unchanged. Temporary probes sit outside the
original timed interval; the appended module is Linux/test-only and ignored in
ordinary full-suite execution. The original 200 ms assertion, fixture, normal
test parallelism and sanitizer settings remain intact. Four alternating pairs
compare every returned row. No truncation, cache, coerced values, suppressed
database errors or row-dropping shortcut is introduced. Query plans use the
three inspected SQL constants with optional asset values still bound.

The fixed `/proc/thread-self/schedstat` read accepts three unsigned fields;
missing, unparseable or decreasing counters become unavailable. The labels
agree with the kernel's [scheduler statistics documentation](https://docs.kernel.org/scheduler/sched-stats.html#proc-pid-schedstat).
Snapshots surround wall intervals, so their scopes are not exactly coincident.
Zero/unsupported counters cannot prove no wait. Phase rows exclude recorder
work and return cleanup; whole-call rows remain separate. Reused fixture pages
are warm. No allocation, leak, causal contention or optimization claim follows.

Output is resolved, must be outside the source repository, and must be empty
if it already exists. The generator neither deletes files nor overwrites source;
Git calls use fixed argument vectors without a shell. The workflow's temporary
Fleet overwrite is explicit and follows retention of the original baseline.
Empty-directory checking is not an atomic reservation or a filesystem sandbox:
this scope assumes the documented single-owner disposable checkout/output.

## Workflow authority and evidence

The proposal remains outside `.github/workflows`. Its push filter names only
`diagnostic/fleet-gate-context-20261121`; it also declares manual dispatch.
It has no privileged pull-request trigger, secret input, full environment dump,
application database access, release or repository-write operation. Checkouts
disable persisted credentials. Tooling uses the triggering commit, making
root's exact-byte publication/readback part of the activation boundary.

Only `contents: read` is declared. GitHub's [workflow syntax reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
confirms that unspecified token permissions are disabled when explicit ones
are supplied. It also defines the active workflow directory and branch filters.
Manual dispatch requires the file on the default branch; the proposed branch
push is the relevant activation route. Later pushes could start more runs:
**one experiment is an operating constraint, not a lifetime execution counter
implemented by this YAML**.

Context uses an explicit environment allowlist and fixed platform files.
The artifact directory contains synthetic observations, provenance, manifests,
feature output and build/test logs. Hosted action/SDK setup and runner state
remain external execution inputs; complete environment reproducibility is not
claimed by the source review.

Every invocation has fixed arguments and its own process session. Timeout
cleanup signals that group, handles an already-exited process and retains exit
124. Full-suite subprocesses are bounded to 1,200 seconds and phases to 180.
Explicit step maxima total 69 minutes inside a 75-minute job, including upload
and finalization. Existing product and ordinary CI limits are unchanged.

Completeness requires the expected test counts, one instrumented gate record,
four ordered complete phase pairs, full-row equality, four phases per pair,
25 migrations and six query plans. Binary hashes and original/overlay source,
manifest, lock, migration and allowed tracked-file state are checked. Missing,
malformed or incomplete records do not become successful evidence.

A wrapper step can succeed while recording a nonzero Cargo exit so later
collection can proceed; its step status alone is not a Cargo pass. The final
always-run check makes any failed, missing or incomplete invocation fail the
job. A later pass cannot erase a baseline failure. Upload uses `always()`,
rejects absent evidence and requests 14-day retention. Provider cancellation,
runner loss or upload failure can still prevent delivery. The original failure
log is retained separately.

## Review method and handoff

This lane performed source inspection, Git-object/byte comparisons, hashing,
review of the prior corrections and primary documentation lookups. It did not
run generation, parsers, tests, native builds, benchmarks, scanners, probes or
vulnerability reproduction. The fresh functional worker owns ordinary tooling
execution. Only this report is authored here.

The prior incomplete-evidence, unexpected-mutation, signal-race and aggregate
upload-deadline findings remain corrected in these bytes. No additional source
change is requested. Root should retain all fresh reports, verify an exact-byte
copy to `.github/workflows/fleet-gate-context.yml`, use the expected-head guard
on the named branch, and retain the single run's actual source/compiler/runner
context, complete logs and final outcome. Diagnostic acceptance or a diagnostic
pass cannot clear the Fleet gate. Any production optimization requires separate
source review and matched verification.
