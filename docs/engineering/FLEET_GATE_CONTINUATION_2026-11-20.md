# Fleet gate diagnostic continuation — 20 November 2026

Dates use America/Los_Angeles; execution evidence retains UTC.

## Current decision

The Fleet reminder gate remains unresolved. PR #65 is fixed at
`562609b4acc8bc24704cc864ef27c0b11c56bc00`; the independently accepted CDJ
acquisition successor is draft [#67](https://github.com/djshellshoxxx/deckchek/pull/67),
fixed at `157b0dbe1849d42e835cc365ba7292eb633c04d9`. Main last verified here is
`cfb1137d3d01ddd4a9fd0677113314dc7deb76ee`. Neither draft is qualified for merge.
Read live source-specific jobs before acting; these are dated checkpoints.

This continuation prepares a bounded diagnostic, without changing production
Fleet behavior, its 200 ms gate, native dependencies, existing workflows or
Fleet default-off. A diagnostic result is evidence for investigation and cannot
replace qualification of an implementing source.

## Observed failure and comparisons

The [PR #65 ASan job](https://github.com/djshellshoxxx/deckchek/actions/runs/44862296853/job/136718158369)
failed `fleet::tests::regression_reminder_overview_has_no_per_reminder_scans_and_meets_budget`:
**201.565999 ms against 200 ms**, 766 passed / one failed / eight ignored,
exit 101. The complete decoded log and exact record are retained in
[the preceding integration evidence](evidence/cdj04-acquisition-integration-2026-11-20/pr65-asan-failure.json).
Its SHA-256 is `e3e01b87903722839f0308c353537d7b3619736f423425263154dc0f5237820d`.

The actual executed merge `5702a450d9a7faa3efb80c5b67de69386ae07540` was fetched
and independently inspected. Its whole tree
`a2e4f571ac3a9c7d976db911a5fed3f910c3ea26` equals the published PR #65 tree;
its parents are main `cfb1137d` and PR head `562609b4`.

The failed run used rustc `1.102.0-nightly (c7d5ba59d 2026-11-20)`. Historical
successful #58/#59 ASan runs used `6905905bb` from the preceding day, each with
767 passed / zero failed / eight ignored. Complete success logs and selected
context are preserved in [this comparison record](evidence/fleet-gate-diagnostic-2026-11-20/historical-success-context.json).
The compiler difference is a comparison variable. It does not establish cause.

The entire native source, migrations, vendored code and nightly workflow are
unchanged across these sources. The code audit found bulk queries followed by
in-memory enrichment, with no new per-reminder SQL. Source review alone cannot
identify which cost or execution condition explains the timing failure.

## Bounded proposal

Author tooling source `9796f80b7b9ec7dfbff26b47a9935ce4b44441e5`, tree
`73cba12d57c6c5ba256cdcd45b9bad9a9822a8f4`, adds a generator and an inert workflow
proposal. [The proposal](proposals/fleet-gate-diagnostic.yml) is outside the
active Actions workflow directory. It must receive fresh independent acceptance
before an exact-byte copy is activated on its named diagnostic branch.

The experiment uses separate immutable tooling and source checkouts, the exact
failed merge, a verified compiler, the complete native manifest/feature graph,
and one untouched full-suite ASan baseline. Only after preserving that result
may it install the reviewed transient test overlay. That overlay records
context outside the original timed interval, runs the full suite with default
test parallelism, then collects four alternating original/instrumented call
pairs on the exact fixture. Every returned row must agree. Bundled SQLite
plans and compile options are collected after the phase measurements.

Phase intervals exclude recording work and return cleanup; whole-call records
retain their separate meaning. Scheduler snapshots surround wall intervals.
Unsupported, zero or unavailable counters cannot prove an absence of wait.
The repeated fixture is warm after writes. There is no allocation measurement,
no established optimization and no proof of the failure's cause.

The workflow keeps read-only repository permissions and credential-free
checkouts, fixed identities and bounded invocations. It validates exact native
test and marker counts, binary and source hashes, original/overlay source state,
manifest/lockfile/migrations and expected records. All failures remain failures
in the final job. Aggregate step limits leave upload/finalization time inside
the job limit; provider cancellation or runner loss can still prevent delivery.

## Reviews and local validation

All three initial workers completed before the fresh set begins. The code and
defensive reviews accepted the frozen tooling for independent review. The
author completed generation, exact source-restoration and parser checks with
all 1,654 tracked hashes unchanged. No native build, benchmark or project test
is implied by these local tooling checks. Fresh acceptance remains pending.

| Initial role | Report |
| --- | --- |
| Code and specification | [Source audit](FLEET_GATE_CODE_AUDIT_2026-11-20.md) |
| Functional author | [Investigation and tooling evidence](FLEET_GATE_FUNCTIONAL_AUDIT_2026-11-20.md) |
| Defensive source review | [Security audit](FLEET_GATE_SECURITY_AUDIT_2026-11-20.md) |

Closed draft findings concerned incomplete/zero-match evidence, unexpected
source changes, a timeout signal race and insufficient artifact-upload margin.
The frozen proposal preserves the corrections and the remaining limitations.

## Preserved work and next action

[The acquisition publication record](evidence/fleet-gate-diagnostic-2026-11-20/acquisition-publication.json)
binds #67 to its exact accepted source, complete local/remote tree proof, all six
completed workers and the fresh 56/56 result. It also retains the initial hosted
queue snapshot. The accepted acquisition API remains unconsumed by production
UI; raw/reference retention, persistence/reporting, scientific characterization
and physical qualification remain open.

The older Fleet diagnostic branch `diagnostic/deckchek-fleet-phases-20261120`
remains at `2c93d658f4703c863405064121c975f8679592eb`. Its author-only isolated
result and later compiler failure remain distinct evidence. The failed local
compile is not being repeated. Existing matching native SDK/binary resources
are unavailable locally.

After initial and fresh acceptance, activate at most one bounded hosted
experiment on `diagnostic/fleet-gate-context-20261121` and retain its complete
outcome. Do not retry until green, weaken the gate, or infer a native fix from
a diagnostic pass. A subsequent production change would require its own review,
matched verification and qualification.

[Issue #66](https://github.com/djshellshoxxx/deckchek/issues/66), concerning a
PASS without meaningful device observations, remains queued for a distinct
feature/bug worker set. Preserve the existing recurring continuation, its
recorded credit-exhaustion condition, original branches and all source-bound
failures. No release, deployment, tag or branch deletion is included.
