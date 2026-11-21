# Fleet gate defensive source audit — 20 November 2026

Reviewer: `/root/fleet_gate_security_audit`. Report date uses America/Los_Angeles;
the retained job ran on 21 November UTC.

## Disposition

**ACCEPT_FOR_INTEGRATION for the frozen diagnostic source and inert workflow
proposal at `9796f80b7b9ec7dfbff26b47a9935ce4b44441e5`, within this source-only
defensive review.** The evidence-retention finding below is resolved in that
source. No remaining blocking issue was identified in the reviewed file handling,
query boundaries, diagnostic provenance, permission scope or failure handling.

This accepts diagnostic tooling, not a production optimization, compiled Rust,
an executed workflow or clearance of the Fleet performance gate. The cause of
PR65's **201.565999 ms** result remains unestablished. The **200 ms** assertion,
full fixture, ASan settings, existing workflows and Fleet default-off remain
unchanged. QR65 and the independently accepted acquisition work are unchanged.

## Exact identities and reviewed evidence

| Item | Identity |
| --- | --- |
| Review/application base | Commit `c81646dde87676973fe08e081c216f2fa58aeeee`; tree `a1ff97563b88da9c80f8a298fbc58a01345e6218` |
| Frozen diagnostic source | Commit `9796f80b7b9ec7dfbff26b47a9935ce4b44441e5`; tree `73cba12d57c6c5ba256cdcd45b9bad9a9822a8f4` |
| Generator | `tools/fleet-gate-diagnostic.py`; Git blob `974ef44ccbb78ef5e7a4946ef53bf17d7b653b58`; SHA-256 `3faac5ab1c48b38363a6305d5f382dba23c8d51586a313a887e9ed9343e257c2` |
| Inert workflow proposal | `docs/engineering/proposals/fleet-gate-diagnostic.yml`; Git blob `1e8d673b228f2a0f92c8694bce6eb15dd7e32c73`; SHA-256 `c5c9aa39aee40eacd9fb5058237d5ff316e22120bb5b12535afa270e8e6dccef` |
| PR65 head | `562609b4acc8bc24704cc864ef27c0b11c56bc00` |
| Actual failed checkout | Merge `5702a450d9a7faa3efb80c5b67de69386ae07540`; tree `a2e4f571ac3a9c7d976db911a5fed3f910c3ea26` |
| Failed hosted job | Nightly run `44862296853`, ASan job `136718158369` |
| Retained complete log | `docs/engineering/evidence/cdj04-acquisition-integration-2026-11-20/pr65-asan-failure.log`; 193,794 bytes, 2,076 lines; SHA-256 `e3e01b87903722839f0308c353537d7b3619736f423425263154dc0f5237820d` |

The fetched merge has parents `cfb1137d3d01ddd4a9fd0677113314dc7deb76ee`
and `562609b4acc8bc24704cc864ef27c0b11c56bc00`. Independent Git comparison
found no tree difference between that merge and PR65's head. The frozen proposal
adds only the two files listed above to the review base. It does not edit native
source, application modules, migrations, manifests, locks, vendor code or active
workflows.

The inspected Fleet blob is `734e405e653deade0115018a9faf7c53e8b5506c`,
SHA-256 `3555c7d515aa64c383098ded7954e2f65c4899ae4589018ffaf0d03f54cef186`.
Its bytes, database source, Rust manifest/lock, nightly workflow and feature
registry match historical source `f46abbea458ba2bb8c2f6d438eba4f5b0a58c948`,
PR65's head and the review base. All 25 migration files are unchanged.

The complete failed log records **766 passed, one failed and eight ignored** in
247.41 seconds, with the failure at the existing reminder budget assertion. It
records rustc `1.102.0-nightly (c7d5ba59d 2026-11-20)`, unoptimized test profile
with debug information, both Rust sanitizer flags set to `-Zsanitizer=address`
and `ASAN_OPTIONS=detect_leaks=0`. Neither `ERROR: AddressSanitizer` nor
`SUMMARY: AddressSanitizer` occurs in that retained log. This observation does
not establish general memory safety or a leak-test pass.

The earlier accepted isolated diagnostic used compiler `6905905bb` dated
19 November. The compiler difference and different execution conditions prevent
treating its timing as a controlled before-and-after comparison with PR65; they
do not identify the failure's cause.

## Preserved database and result contracts

Source inspection covered [Fleet persistence](../../src-tauri/src/fleet.rs),
[database connection handling](../../src-tauri/src/db.rs), the real
[usage schema](../../database/migrations/0006_asset_usage.sql),
[Fleet migration](../../database/migrations/0017_fleet_dashboard.sql), the
original timing fixture and the nearby reminder regression contracts.

| Boundary | Source conclusion and preservation requirement |
| --- | --- |
| Query parameters | Reminder, latest-completion and confirmed-usage reads bind the optional asset identifier. No user value is interpolated into these SQL strings. The diagnostic's formatted `EXPLAIN QUERY PLAN` receives only the three inspected SQL constants; the asset remains bound. |
| Scope and rows | The all-assets call includes the existing template and disabled-reminder behavior. It has no newly introduced row limit, truncation, sampled result or discarded-record shortcut. The diagnostic compares all 2,000 returned rows with the original function. |
| Ordering and completion selection | Reminder order remains `title,id`. Latest completion remains ordered by Julian event time descending and then event ID descending. The confirmed-usage traversal and floating-point addition order are unchanged. |
| Missing, unknown and zero | No completion leaves `hoursSinceCompletion` absent. Ambiguous spans and invalid times encountered while traversing usage yield an explicit null. Empty usage yields zero. In particular, the existing helper returns zero for an empty entry list even if its completion Julian value is absent; the diagnostic preserves that exact behavior. |
| Invalid stored values | Typed `Row::get` failures continue to propagate. The proposal does not silently coerce malformed columns, drop an offending reminder or convert an error into an empty successful result. |
| Input and schema bounds | Existing ID, title, reminder-policy and usage-hour validation is unchanged. No cap or threshold is weakened to obtain a timing result. |
| Fresh state | Every invocation rebuilds completion and usage maps from the connection. No authorization, completion, usage, result or feature-state cache is introduced. |

The production native IPC path enters `db::off_main`'s serialized lane, opens a
fresh migrated connection and holds the database restore gate's read guard for
that connection's lifetime. The reminder helper itself performs separate reads
without an explicit read transaction. This review therefore does not claim an
unconditional multi-query snapshot against arbitrary external database writers.
The proposed diagnostic changes neither boundary.

The fixture still creates 1,000 Fleet assets, 2,000 reminders, 10,000 maintenance
events and 3,000 confirmed usage entries, in addition to the helper's two seed
assets. It commits those writes before the timer. The original interval still
begins immediately before `reminders(&conn, None)` and ends immediately after
that function returns. Result assertions and the subsequent selected-asset call
remain outside that interval. The assertion remains strictly below 200 ms.

## Diagnostic provenance and local handling

The generator requires an explicit expected source commit and tree, a clean
tracked source checkout and the inspected Fleet SHA-256. It reads the original
Fleet bytes once, extracts the existing function and fixture, and verifies that
removing its instrumentation restores the exact original function and regression
text. Its emitted proof binds the original and overlay bytes, generator,
function, fixture, regression, native/migration/vendor trees, manifest, lock and
all 25 migration hashes.

The original production function is retained. The new measurement module is
Linux/test-only and ignored during ordinary full-suite execution. The existing
regression receives scheduler probes before its timer and after its elapsed
sample. The phase copy uses the same SQL and helper functions. No new dependency,
unsafe block, allocator override, external service or application command is
introduced. The new diagnostic accesses its synthetic in-memory fixture; it
does not open a user's application database.

Within the generated Rust, the only new explicit file read is the fixed
`/proc/thread-self/schedstat` path.
It accepts exactly three unsigned counters, returns an unavailable value on read
or parsing failure, and uses checked subtraction so decreasing counters produce
null. The field names follow the Linux kernel's
[per-task scheduler statistics documentation](https://docs.kernel.org/scheduler/sched-stats.html).
Zero or unavailable values are explicitly inconclusive. Scheduler snapshots
surround the wall interval and include their own additional scope; the report
must not equate those intervals or infer scheduling causation from their
difference. Whole-call timing includes return cleanup; the four phase rows
exclude return cleanup and recorder work. No allocation measurement is claimed.

There are exactly four phase pairs, with alternating call order and a full-row
equality assertion. They reuse the same fixture, whose writes have already
warmed pages. The metadata identifies the pair containing the first reminder
call; it does not label both calls or later pairs as cold. A diagnostic pass is
not a production optimization result or replacement for an applicable gate.

The output path is resolved, must be outside the source repository, and must be
empty if it already exists. The generator contains no deletion or source-file
overwrite. Its Git subprocesses use fixed argument vectors without a shell.
The empty-directory check is not an atomic reservation or a filesystem sandbox;
this acceptance assumes the documented single-owner disposable checkout/output,
not hostile concurrent filesystem mutation. The workflow makes its later
transient Fleet overwrite explicit and preserves the original baseline first.

The previous accepted diagnostic at `2c93d658f4703c863405064121c975f8679592eb`
and its migration-copy correction at
`b3769f3ac9ad5638f2f152351e4c0c0fdc963cbf` were consulted for provenance and
limitations. Their corrected generator bytes are unchanged. This review does
not repeat their already accepted audit or attribute their historical execution
results to this new generator.

## Workflow authority, completeness and retained failures

The YAML remains inert under `docs/engineering/proposals/`. Its proposed triggers
are a manual dispatch and pushes to the single named
`diagnostic/fleet-gate-context-20261121` branch. It declares only
`contents: read`, uses separate exact-source and tooling checkouts with persisted
credentials disabled, and does not add a privileged pull-request trigger or
modify ordinary qualification workflows. The source checkout is pinned to the
actual failed merge; tooling is pinned to the triggering commit. Compiler and
source identities are checked before execution. There is no fallback to a
different revision or compiler when those checks fail.

The proposed record uses an explicit environment-field allowlist and fixed
platform/context files. It does not dump the complete environment or access
credentials. Artifact scope is the diagnostic output directory containing
synthetic measurements, source proof, manifests, feature output and build/test
logs. The token gains no write permission. Runner prerequisite installation is
confined to the proposed hosted job; it changes no application permissions.

The runner records each subprocess exit code, using 124 for its own timeout,
and requires the exact expected
test populations: 767 active tests with eight ignored for the original suite,
nine ignored after the additional diagnostic is introduced, and one selected
phase test with 775 filtered out. Completeness also requires four ordered phase
pairs, all-row equality, four phases per pair, 25 migrations and six query plans.
The final check verifies Fleet/manifest/lock/migration identities, the expected
tracked-source state and a recorded binary. A failed, incomplete or missing
stage fails the job; a later successful stage cannot erase an earlier failure.

### FG-S1 — Aggregate timeout could prevent the sole final evidence upload

The initial draft allowed 2,400 seconds per invocation within a 60-minute job.
Multiple slow stages could reach the outer deadline before the final upload,
leaving the intended evidence unavailable.

**Resolved in frozen source `9796f80b`.** Each full-suite subprocess is bounded
to 1,200 seconds and the phase subprocess to 180 seconds. Each starts a separate
process session; timeout cleanup signals that process group and tolerates an
already-exited process before writing the timeout result. Explicit step maxima
total 69 minutes inside a 75-minute job, including upload/finalization steps,
with additional job margin. The upload uses `always()`, rejects a missing
artifact directory and requests 14-day retention. Existing product limits and
the ordinary nightly workflow are untouched.

Provider cancellation, hard runner loss or an upload-service failure can still
interrupt delivery; the corrected source explicitly retains that limit. No
workflow can turn a missing artifact into observed evidence. The initial
signal-race concern identified by the code reviewer is also closed in this
frozen source by handling `ProcessLookupError` for both group signals.

## Review method and handoff

This worker performed source reads, exact Git-ref and byte comparisons, hashing,
retained-log inspection and a primary documentation lookup for counter labels.
It did not run the generator, syntax checks, tests, builds, native benchmarks,
scanners, probes or vulnerability reproduction. It authored only this report.
Source inspection cannot establish that the generated Rust compiles or that the
proposed workflow produces complete hosted evidence.

Root owns consolidation, fresh acceptance and any subsequent diagnostic
activation. Activation must use the reviewed proposal bytes while preserving
the ordinary gates. Applicable untouched-source qualification remains separate
from the instrumented full suite and isolated phases. Preserve the original
failed log, all later failures, exact source identities and Fleet default-off.
No environment-failure explanation, resource-credit explanation or production
performance correction is established by this audit.
