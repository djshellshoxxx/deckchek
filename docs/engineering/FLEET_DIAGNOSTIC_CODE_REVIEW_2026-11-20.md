# Fleet diagnostic independent code review — 20 November 2026

Reviewer: `/root/fleet_diagnostic_code_fresh`. Dates use America/Vancouver.
This reviewer did not author the generator, its correction or the recorded native
run. The parent assigned this new scope after the Ledger acceptance set finished.

## Disposition and source

**ACCEPT_FOR_INTEGRATION within the assigned code and measurement-source review.**
The initial migration-source gap and phase-boundary documentation clarification
are closed at corrected source `69ea261`. The preserved observation is internally
consistent with its pinned source and logs. No remaining scoped code blocker was
identified. This is not native execution, hosted qualification or a claim that
the Fleet timing failure is resolved.

| Role | Exact identity |
| --- | --- |
| Fixed application base | `e49ea1bbafb5005fdf1dfcf60d885b82d0191471` |
| Initially reviewed diagnostic | `82016a79e363d687703c4e897d4ef2247fcb1028` |
| Initial diagnostic tree | `90a667533bbea1d77705d15274428011db3373b3` |
| Independently accepted correction | `69ea261aa8a89c3cb3d6d83e17427b442261cc92` |
| Accepted tree | `e52b5c4671c9a43388c838aed8e3d0cc2188efb2` |

Initial comparison: `git diff e49ea1bbafb5005fdf1dfcf60d885b82d0191471...82016a79e363d687703c4e897d4ef2247fcb1028`.
Correction review: `git diff 82016a79e363d687703c4e897d4ef2247fcb1028 69ea261aa8a89c3cb3d6d83e17427b442261cc92`.
Only the tool and its report change in the correction. Application Rust, SQL,
migrations, dependencies, workflows, tests and original evidence remain unchanged.

## Standards

Relevant repository standards are [DEVELOPMENT-PLAN §1](../DEVELOPMENT-PLAN.md),
§5.3's independent review checklist, §5.5's preserved database budget and §5.8's
documentation accuracy rules. The parent supplied the fixed investigation scope;
no new issue-tracker setup was needed. Parallel functional and defensive reviews
own their independent dispositions.

No hard coding-standard violation or actionable code-smell refactor was found.
The diagnostic stays within its owned tool/evidence files. Extracting the original
body alongside a separate instrumented copy supports the exact row comparison;
that deliberate duplication does not justify refactoring the application. The
single-purpose Python tool does not need added abstractions or dependencies.

### C2 — Low: unmeasured return cleanup — closed

The fourth phase ends immediately before `Ok(rows)` in the instrumented function.
Rust subsequently drops local state, including the usage map and query statement.
The initial report correctly distinguished separate calls but did not explicitly
identify this unmeasured return cleanup. The reviewer requested that clarification
under §5.8 so the four phases would not be read as an exhaustive whole-call account.

The corrected report now states that local-variable destruction and return cleanup
are excluded from the four phase rows, while the separate whole-function call
includes its complete return. **C2 is closed.** This source-visible boundary does
not identify the cause of a particular timing difference; cache order, randomized
map state and instrumentation overhead also matter. No additional timing run was
needed to describe the boundary accurately.

## Measurement/spec assessment

The assigned task measures existing reminder execution while preserving source,
migrations and the 200 ms gate. The budget is retained from
[FS-23 §8](../specs/23-venue-fleet-dashboard.md#8-test-plan) and
DEVELOPMENT-PLAN §5.5. This review does not requalify all Fleet criteria.

### C1 — Medium: live migration inputs after generation — closed

The initial [`generator`](../../tools/fleet-reminder-diagnostic.py) emitted absolute
`include_str!` paths to live repository migrations and hashed those files at
generation time. An ordinary later migration edit could therefore change compiled
SQL without changing the generated proof. Copying the crate elsewhere also left
its includes tied to the original checkout. The reviewer reported this before
editing any report; root authored the correction independently.

At `69ea261`, each migration is read once into bytes, written into the generated
crate's `migrations` directory and hashed from those same bytes. The generated Rust
includes `../migrations/<filename>` relative to `src/lib.rs`. Subsequent edits in
the source checkout no longer change those generated inputs. Ordering, migration
names and application SQL remain unchanged. **C1 is closed by source inspection.**

This finding never asserted that a migration changed during the author's existing
run. All 25 source hashes matched that historical record. Root preserved the
original generator hash, harness hash, measurement and logs; the corrected tool
does not retroactively replace the original observation's provenance. The later
functional worker's generation/execution evidence remains separate.

### Accepted source and measurement properties

- All six extracted fragments match the initial record: error helper, usage
  helpers, reminder SQL/body, database test setup, original budget regression and
  migration helpers. The regression retains its query-plan assertion, expected
  values, filtered lookup and `from_millis(200)` cap.
- The separate diagnostic copies the same 1,000-asset/2,000-reminder fixture and
  compares every returned row with the unmodified function's result. It records
  the actual SQLite version and applied-migration count.
- The four insertion points cover completion query/map, usage query/map, reminder
  query/JSON construction and enrichment. Recorder JSON construction and phase
  storage occur between measurements; return cleanup is excluded as clarified.
- The allocator delegates allocation, zeroed allocation, deallocation and resize
  to `System`. Counters cover allocation requests and requested sizes, including
  full new resize requests. The report correctly excludes SQLite C allocations,
  live/peak memory and inferred object ownership, and requires serial tests.
- The original and instrumented functions run in different invocations. One
  warm-order observation is not a distribution, an optimization proof or an
  explanation of the hosted timing failure. Full application feature-unification
  equivalence remains explicitly unverified.
- The preserved standalone lock's 30 registry packages independently match the
  application lock by **source, name, version and checksum**. Its 31st package is
  the diagnostic root. This is verification of the preserved lock, stronger than
  the command's name/version/checksum-only lookup; it is not a full graph or
  feature-equivalence guarantee.

## Independent evidence checks

The checkout began clean. This reviewer inspected both fixed diffs, original
source/regression, generator and all six evidence files. Small Python checks
calculated hashes and parsed committed JSON/TOML only. No generator invocation,
Cargo build, native test, browser test or application suite was run by this worker.

| Independently hashed file | SHA-256 |
| --- | --- |
| Initial generator | `25078d29cf3b0fc7a9ee8baa5e04b8bf5a1ae6b341f7c66d129aa101a588a409` |
| Accepted corrected generator | `2df2d1a9d72073d25863d80fef92b4d4ac56a9b42a0f36f2025de8a64dcdeeb1` |
| Fleet Rust source | `3555c7d515aa64c383098ded7954e2f65c4899ae4589018ffaf0d03f54cef186` |
| Database Rust source | `68ce838bc71de162beb7df1d987c5e533d4d845a249d37ba4c7e87d32930c0f1` |
| Application Cargo lock | `2e959fe81ccb6492f89b3cd10647a81d094506b0f72806c097ef523259d55a74` |
| Preserved successful ASan log | `1f9fe7a1613916682bfc04e81f409094db1f3dfddb0dda24e684e0fbb1f7eb13` |

The initial generator and four recorded input/log hashes match `measurement.json`.
All 25 migration and six snippet hashes match. The measurement object equals the
`FLEET_DIAGNOSTIC` JSON in the successful log exactly. The author's **2/2** native
result and SQLite/migration/row counts agree with the log; this is independent
consistency review of author evidence, not a new native run.

An independent Git comparison confirmed that the named Fleet/database/lock/
migration inputs at main `e49ea1b` match PR #47's `b31bad6`. Hosted job outcomes
remain attributed to root's readback. This worker did not independently fetch
remote job logs or attest the enclosing-process duration or environment setup.

The initial lock rejection and normalization log agree with the report; the latter
records zero updated package versions. Full-application metadata failed with
`ENOSPC` and is not presented as graph qualification. Raw logs remain byte-for-byte
unchanged, including their original trailing newline. Whitespace checks passed
for authored source/docs while excluding verbatim evidence logs. The correction's
complete two-file whitespace check also passed.

## Handoff and limits

The generator and documentation corrections are accepted by this independent code
review. Integrate this report with the separate functional and defensive reports;
do not represent their results as executions by this reviewer. Root reported a
separate functional compile attempt killed in `cc1` before tests; this report does
not turn that failure into a native pass. A later completed run needs its own
source, commands and result.

Keep the historical observation and generator hash intact. Preserve the unchanged
200 ms assertion, Fleet default-off and the Ledger candidate's separate exact-source
qualification. No production/test edit, external probe, installation, remote
write, threshold change, release or deployment was performed by this worker.

Standards: **zero hard violations; C2 documentation clarification closed.**
Measurement/spec: **C1 source-freeze gap closed at `69ea261`; historical evidence
internally consistent; no remaining scoped code blocker.**
