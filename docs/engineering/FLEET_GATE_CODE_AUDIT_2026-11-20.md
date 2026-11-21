# Fleet gate independent code and specification audit — 20 November 2026

Reviewer: `/root/fleet_gate_code_audit`. Dates in the title follow the existing
continuation records; the inspected failing job ran on 21 November UTC.
This worker owns source review only. The separate functional worker owns any new
execution and diagnostic implementation; the security worker owns its independent
defensive review.

## Disposition

**The PR #65 Fleet timing failure remains an unresolved merge blocker.** The
failure is a measured breach of the existing 200 ms requirement. Source comparison
does not identify a changed Fleet implementation, fixture, migration, dependency
lock or nightly command that explains it. No production optimization is justified
by this source audit alone.

**ACCEPT_FOR_FRESH_DIAGNOSTIC_REVIEW** for the frozen two-file proposal at
`9796f80b7b9ec7dfbff26b47a9935ce4b44441e5`, within this source-only lane. The
identified evidence-completeness findings are closed. This accepts a bounded
next measurement design, not a compiled overlay, performance improvement,
successful hosted run or clearance of the failed merge gate.

## Exact review boundary and sources

The assigned checkout began clean at
`c81646dde87676973fe08e081c216f2fa58aeeee`, tree
`a1ff97563b88da9c80f8a298fbc58a01345e6218`, on
`review/deckchek-fleet-gate-code-20261120`. It contains the accepted CDJ
acquisition source and earlier audit records. That broader feature work does not
change the Fleet inputs below.

| Compared source | Commit | Full repository tree |
| --- | --- | --- |
| Earlier Fleet timing review base | `f46abbea458ba2bb8c2f6d438eba4f5b0a58c948` | `328b31fa3770355a6acb4ab754d0d9f36da72fbc` |
| Passed PR #58 head | `eba46183fecd9d698515411865e710021dcba632` | `f0313256f4c9e20ede6d63b73d7c3a423ec63bb1` |
| Passed PR #59 head | `3118321ee23393bfe37c3cc8e11aeb84490cbd40` | `35e18617eb20902048cb0baf065a0d6e98c4bda6` |
| Merged main after #59 | `cfb1137d3d01ddd4a9fd0677113314dc7deb76ee` | `35e18617eb20902048cb0baf065a0d6e98c4bda6` |
| Failed PR #65 published head | `562609b4acc8bc24704cc864ef27c0b11c56bc00` | `a2e4f571ac3a9c7d976db911a5fed3f910c3ea26` |
| Actual failed PR #65 test merge | `5702a450d9a7faa3efb80c5b67de69386ae07540` | `a2e4f571ac3a9c7d976db911a5fed3f910c3ea26` |
| Assigned audit base | `c81646dde87676973fe08e081c216f2fa58aeeee` | `a1ff97563b88da9c80f8a298fbc58a01345e6218` |
| Preserved native diagnostic branch | `2c93d658f4703c863405064121c975f8679592eb` | `cb1fe753b0a9c649ec5f101c3f6f5f732acde926` |

All compared revisions have the following identical Git objects:

| Input | Exact Git identity |
| --- | --- |
| Entire `src-tauri` directory | tree `10e575b294f2449efb166e359e4a07e1fcb687b3` |
| All 25 `database/migrations` files | tree `875e0d614ee60c61e2db0d43ca364cf5473cfa09` |
| Vendored code | tree `18047869da0b4dc46b274550b62c8ac931f994c4` |
| `src-tauri/src/fleet.rs` | blob `734e405e653deade0115018a9faf7c53e8b5506c` |
| `src-tauri/src/db.rs` | blob `af6f0e874c81fb4df9e5e0e5c72c9449be1fd420` |
| `src-tauri/Cargo.toml` | blob `608680be10402606eb9277343c787e8a43d4fa82` |
| `src-tauri/Cargo.lock` | blob `a92f6f4418afc2dbd59f25464840010f112b7c8e` |
| `.github/workflows/nightly.yml` | blob `64818e1109913d8dcdd244bdd62d31aca1029496` |

Additional #58/#59-to-#65 comparisons were empty for the whole `database`
directory, `tests/contracts`, `tests/fixtures` and
`app/population-metrics.json`, covering the inspected externally embedded native
inputs and test fixtures. These comparisons establish source identity, not
identical binaries, dependency features, compiler, scheduling or runtime behavior.

### Actual failing checkout

The complete log records a checkout of `refs/remotes/pull/65/merge` at
`5702a450d9a7faa3efb80c5b67de69386ae07540`, described as merging
`562609b4acc8bc24704cc864ef27c0b11c56bc00` into
`cfb1137d3d01ddd4a9fd0677113314dc7deb76ee`. The temporary merge object was initially
absent locally. After root fetched it, this worker independently confirmed both
parents, full tree `a2e4f571ac3a9c7d976db911a5fed3f910c3ea26`, and an empty full-tree
diff from the published #65 head. The comparison above therefore covers the actual
failed checkout, not only its branch head.

The raw log inspected read-only is
`docs/engineering/evidence/cdj04-acquisition-integration-2026-11-20/pr65-asan-failure.log`
in the parent's integration checkout. Its Git blob is
`e36208aa6bbc298052a132f662f9bf386d8f2cc7`; independently calculated SHA-256 is
`e3e01b87903722839f0308c353537d7b3619736f423425263154dc0f5237820d`.
The hosted source is [ASan job 136718158369](https://github.com/djshellshoxxx/deckchek/actions/runs/44862296853/job/136718158369).

## Standards assessment

The governing repository rules are [DEVELOPMENT-PLAN §1](../DEVELOPMENT-PLAN.md#1-principles-and-quality-bar),
its [independent review checklist](../DEVELOPMENT-PLAN.md#53-code-review-sweep-m9-review-sweep--top--also-the-per-merge-review-checklist),
§5.5's database budget, §5.6's query-plan and migration requirements, and §5.8's
documentation accuracy rules. The parent's fixed source-only assignment and
preservation instructions apply to this worker; no new tracker setup or branch
cleanup is needed.

No new hard coding-standard violation or evidence-supported refactor was found in
the unchanged reminder path. SQL values are bound; row conversion errors are
propagated; the measured function has no per-reminder SQL; strings already owned
by `Row::get` move into JSON; and completed timestamps are removed from the
lookup map rather than cloned. Existing query-plan and typed-row checks remain
relevant guards. Their existence does not constitute a fresh test run.

The stored migrations are immutable inputs to this review. An index experiment,
if later supported by native measurements, must respect forward-only migration
rules and preserve both correctness and the budget. A speculative index, cache,
new serializer, alternate clock threshold, or changed test scheduling is not
accepted by this audit as a remedy.

## Specification assessment

[FS-23 §8](../specs/23-venue-fleet-dashboard.md#8-test-plan) and
DEVELOPMENT-PLAN §5.5 require the reminder path for 1,000 assets to complete in
less than 200 ms. The actual regression is
`fleet::tests::regression_reminder_overview_has_no_per_reminder_scans_and_meets_budget`.
Its fixture has 1,000 measured assets, 2,000 reminders, 10,000 maintenance events
and 3,000 confirmed usage rows, plus two unrelated seed assets.

The test creates its own `Connection::open_in_memory`, enables foreign keys,
applies all real migrations, and commits the fixture before the timer starts.
Only `reminders(&conn, None)` and its return are inside the measured interval.
Query-plan assertions, seeding, result assertions and the subsequent selected
`fleet-5` query are outside it. There is no application database file or shared
restore lock in this timed call.

The failing job recorded **201.565999 ms**, with the assertion at
`src/fleet.rs:1845`. It finished **766 passed / one failed / eight ignored** in
**247.41 seconds** and exited 101. The complete inspected log contains no
`ERROR: AddressSanitizer` or `SUMMARY: AddressSanitizer` diagnostic. This is a
timing failure, not a positive memory-safety or leak-test conclusion.

The requirement remains unmet on that recorded run. Later successes on other
sources or invocations cannot rewrite this result. Fleet stays default-off under
[FS-23 §9](../specs/23-venue-fleet-dashboard.md#9-definition-of-done); this review
does not supply real-database, physical-device or owner qualification.

### Semantic constraints on any future change

The source and adjacent regressions require the following observable behavior:

- Latest completion is selected by Julian event time, then descending event ID
  for ties, including equal instants written with different offsets.
- Reminders remain ordered by `title,id`, including templates and disabled rows.
- `hoursSinceCompletion` is absent where no applicable completion exists, null
  when usage or completion timing is unknown, and numeric zero for known empty
  usage. Those three states are distinct.
- Only confirmed usage contributes. Backfilled usage before completion does not
  advance the reminder; a usage interval straddling completion remains unknown.
- Invalid stored column types return the existing conversion error rather than
  being coerced, omitted or replaced with a plausible value.
- Each call reads current rows. This is not a claim of an atomic multi-query
  snapshot against arbitrary external database writers.

## What source and existing measurements establish

The implementation has a fixed number of SQL passes: latest completions and their
map; confirmed usage grouped by asset when any completion exists; ordered reminder
rows and JSON; then in-memory enrichment. Enrichment performs no SQL. Its usage
work still scales with the number of usage entries associated with each reminder's
asset; the fixed fixture visits 6,000 such entries. A fixed query count alone is
not a bound on all possible real-history sizes.

The [earlier timing review](FLEET_ASAN_TIMING_REVIEW_2026-11-20.md) records Python
SQLite 3.53.1 plans with table scans and temporary ordering trees, but no correlated
subquery. The source and indexes are unchanged. Those plans are historical
non-native observations, not a new plan from the failing bundled SQLite build.
The optional-asset predicate also scanned in that observation. Optimizing only
the selected-asset path would not directly address the all-assets call that failed.
The source comment about an available asset index is not proof that the optimizer
chooses it for the optional predicate.

The [preserved native measurement](https://github.com/djshellshoxxx/deckchek/blob/2c93d658f4703c863405064121c975f8679592eb/docs/engineering/FLEET_NATIVE_PHASE_MEASUREMENT_2026-11-20.md)
records one isolated ASan run of the same Fleet/database/lock/migration inputs.
Its unchanged-function call took **110.555698 ms**. In the separate instrumented
call, reminder query/JSON construction was the largest measured phase at
**45.515702 ms**, and enrichment requested the most Rust allocation bytes.
Those observations suggest useful measurement targets; they do not show a
production optimization or explain the hosted failure. The four phases exclude
instrumentation work between phases and local-variable destruction after the
last phase. The separate whole-call observation includes return cleanup. Phase
times therefore must not be treated as an exhaustive decomposition of that
separate call.

That standalone crate's full-application feature-unification equivalence remains
unverified. Its serial test invocation, warm-call order and allocation-counter
overhead are also different from the required hosted invocation. Source identity
of the extracted function is therefore insufficient to treat the 110.555698 ms
observation as a matched baseline for the failed 201.565999 ms call.

The accepted generator has identical blob
`690ac922247291686cb8c76d5a6246e275e55801` and SHA-256
`2df2d1a9d72073d25863d80fef92b4d4ac56a9b42a0f36f2025de8a64dcdeeb1`
at original accepted correction `69ea261aa8a89c3cb3d6d83e17427b442261cc92`,
corrected branch source `b3769f3ac9ad5638f2f152351e4c0c0fdc963cbf`, and preserved
head `2c93d658f4703c863405064121c975f8679592eb`. There is no new generator
difference to re-audit. Its copied-migration correction and earlier independent
reviews remain preserved with their original scope. The later `cc1`-killed
compile ran no tests and is not a successful independent reproduction.

## Known context differences and unresolved hypotheses

The failing job used Ubuntu 22.04.5, runner image `20261116.365.1`, and
**rustc 1.102.0-nightly (`c7d5ba59d`, 2026-11-20)** from the 2026-11-21 channel
update. The earlier isolated measurement used **`6905905bb`, 2026-11-19**.
The workflow installs floating nightly, so the unchanged workflow file does not
pin an identical compiler across time.

The exact failing command was:

```sh
cargo +nightly test --locked --manifest-path src-tauri/Cargo.toml -j 4 --lib --target x86_64-unknown-linux-gnu
```

Its environment included `CARGO_INCREMENTAL=0`,
`RUSTFLAGS=-Zsanitizer=address`, `RUSTDOCFLAGS=-Zsanitizer=address`, and
`ASAN_OPTIONS=detect_leaks=0`. The log reports an unoptimized test profile with
debug information. `-j 4` is the Cargo build-job setting; the command does not set
libtest's thread count. The source review found no `RUST_TEST_THREADS` override.
The actual thread count, instantaneous CPU competition and scheduling delay are
not established by this log. Neighboring test-completion timestamps cannot prove
which work overlapped the 201.565999 ms interval.

| Candidate explanation or target | Evidence boundary | Useful next observation |
| --- | --- | --- |
| Completion query and sorting | Bulk window query and existing scan/order plan; no changed SQL or native phase result from the failed run | Bundled SQLite version and plans, plus completion-phase wall/thread CPU in the full application |
| Reminder row construction and allocation | Largest phase in one older isolated instrumented call; JSON result and errors are required | Same-source full-application phase observation before proposing a representation change |
| Usage enrichment and return cleanup | In-memory usage loops and local map destruction are source-visible; cleanup is outside historical phase rows | Whole-call wall/thread CPU and correctly bounded phase records, with cleanup scope stated |
| Test execution context or compiler | Full suite and newer nightly differ from the older isolated run | Exact compiler/target/features, actual test environment, and source-bound records; no scheduling-cause claim without evidence |
| Filter predicate/index choice | Historical selected-asset plans scan, but failing call is all-assets | Investigate only if measurement ties it to the target workload; do not claim a filtered-query improvement clears the all-assets gate |

The retained [#58/#59 hosted record](evidence/cdj04-evidence-integration-2026-11-20/hosted-merged-58-59.json)
records successful ASan jobs `136644300575` and `136649806620`, respectively.
Root also obtained their complete logs, which this worker independently read and
hashed in the root-owned Fleet integration evidence directory:

| Evidence file | SHA-256 | Recorded result |
| --- | --- | --- |
| `pr58-asan-success.log` | `e8e3f6ead6ff91e20904d839e2994987f60ffa1bbce3d383c89a17ca16b31024` | 767 passed, zero failed, eight ignored; 211.38 s |
| `pr59-asan-success.log` | `237bf69e9b7566ce6c99ec189b59d211b2c27dd08bab984c6981d3d14d82dd8f` | 767 passed, zero failed, eight ignored; 199.62 s |

Both logs record `6905905bb` from the 2026-11-20 nightly update, the same ASan
flags and Cargo command above, the same runner image `20261116.365.1`, and an
explicit pass for the Fleet reminder regression. The #58 log checked out
`b009ab43679c9528794fe160b73343cb0bcad964` and the #59 log checked out
`df73b12550926504f7532bf7e9177a7685524f3d`; these test-merge identities are log
evidence, distinct from the published heads and eventual merge commits. Their
passing test output does not expose the precise reminder-call duration.

The compiler difference between these successful jobs and #65 is a concrete
comparison variable. It does not establish a compiler-caused regression; the
runs are not a controlled compiler comparison. Likewise, suite durations are
not reminder phase measurements. The earlier #47 result of 200.055967 ms and
#46 result of 237.092791 ms remain failures under their own source/environment
records.

## Proposed full-application diagnostic: source review

The functional worker authored `tools/fleet-gate-diagnostic.py` and
`docs/engineering/proposals/fleet-gate-diagnostic.yml`. The latter is an inert
proposal outside `.github/workflows`; it does not change the existing nightly
job. This worker reviewed the draft and its correction without running either
artifact. The frozen tooling commit is
`9796f80b7b9ec7dfbff26b47a9935ce4b44441e5`, tree
`73cba12d57c6c5ba256cdcd45b9bad9a9822a8f4`. Its parent is the assigned
`c81646d` base; the complete diff contains only those two new files.

| Reviewed artifact | SHA-256 |
| --- | --- |
| `tools/fleet-gate-diagnostic.py` | `3faac5ab1c48b38363a6305d5f382dba23c8d51586a313a887e9ed9343e257c2` |
| `docs/engineering/proposals/fleet-gate-diagnostic.yml` | `c5c9aa39aee40eacd9fb5058237d5ff316e22120bb5b12535afa270e8e6dccef` |

The proposal addresses a concrete measurement gap: it uses the exact failed
merge tree and asserts compiler `c7d5ba59d`, while collecting context from the full
native crate and its actual bundled SQLite. It preserves one untouched full-suite
ASan invocation before installing a temporary test-only overlay in that disposable
checkout. The overlay leaves the production `reminders` function unchanged,
adds scheduler observations outside the original test's wall interval, and keeps
the same 200 ms assertion. A second full-suite invocation retains default test
parallelism. A separate ignored diagnostic test executes four bounded alternating
pairs of original and instrumented calls and compares all 2,000 returned rows.
It does not substitute that isolated test for either full-suite result.

The generator pins the original Fleet hash, expected commit/tree and clean
tracked source; hashes the manifest, lock, migrations, extracted function,
regression and fixture; and round-trips both the instrumented function and gate
probe back to their original text. Query plans come from the full application's
bundled SQLite after the phase timings. Original whole-call measurements include
return cleanup; the four instrumented phases exclude recorder work and cleanup.
No global allocation counter or dependency change is introduced.

The Linux scheduler observations are optional kernel counters read from a fixed
procfs path. Their sampling intervals surround the wall intervals, and zero or
missing counters cannot prove an absence of scheduling delay. Their overhead,
the held result from the first call of each pair, repeated-fixture warmth and
the overlay itself prevent interpretation as an optimization comparison or a
bit-identical rerun of the original failed executable. No compiler comparison is
performed by this proposal.

### C1 — Medium: incomplete diagnostic execution could look complete — closed

The first draft treated any `test result:` text as proof that tests ran and
accepted zero exit status without requiring the intended phase test or its
records. A changed test filter or incomplete record set could therefore leave a
misleading successful diagnostic job. This worker requested exact counts and
measurement-record validation before acceptance.

The correction requires 767 executed tests and eight ignored in the untouched
baseline, 767 executed tests and nine ignored in the overlay suite, and exactly
one passed phase test with 775 filtered tests. It also requires zero measured
tests, one gate record with the unchanged budget, four ordered pairs numbered
0–3, 2,000 equal rows per pair, four phases per pair, one SQLite record with 25
migrations and six plans, and an observed test-binary hash. A nonzero invocation,
missing stage or incomplete record makes the final diagnostic job fail. Failed
baseline and instrumented runs retain their own records rather than being
relabelled by a later phase pass. **C1 is closed by source inspection.**

### C2 — Medium: unexpected source state was recorded but not rejected — closed

The first draft recorded tracked changes and the Fleet hash without making the
final result depend on their expected values. This worker requested fail-closed
source validation, so a successful process exit could not bless measurements
from an unreviewed mutation.

The correction requires a clean baseline and the original Fleet hash, then only
the intended `src-tauri/src/fleet.rs` tracked change with the generated overlay
hash. Manifest and lock hashes must match their preserved originals; migration
hashes must match the generated proof. These checks supplement the generator's
clean-source refusal and exact tree/input guards. **C2 is closed by source
inspection.**

### C3 — Low: timeout exit race could lose the structured record — closed

The first corrected runner caught a wait timeout but did not catch
`ProcessLookupError` when sending the initial process-group `SIGTERM`. A process
that exited between those operations could abort record creation. The raw log
and final missing-record failure already prevented a false successful job, but
the intended structured timeout record could be lost. This worker reported that
remaining evidence gap before freeze. The frozen proposal catches the exit race,
waits for cleanup and retains code 124. **C3 is closed by source inspection; no
timeout experiment was executed by this worker.**

The author also clarified that the first-call flag describes a pair containing
the first reminder call on its freshly seeded fixture. This resolves the draft's
ambiguous flag on a record containing two calls. Aggregate timeout and
evidence-retention bounds received the separate security review. The frozen
proposal allows 75 job minutes for 69 minutes of step maxima, bounds each full
suite to 1,200 seconds and the phase invocation to 180 seconds, and does not
claim that provider cancellation or runner loss guarantees artifact delivery.
No timeout or delivery behavior is asserted as executed by this source-only lane.

The remaining handoff is fresh independent acceptance of the source and any
functional generation record, followed by one bounded hosted diagnostic when
root activates the reviewed proposal. Interpret its untouched baseline, overlay
suite and phase invocation separately and retain every failure. A production
optimization, if later proposed, still needs measured benefit under matched
conditions, the semantic checks above, independent review and the unchanged
mandatory gate on its exact candidate source.

## Review commands and limits

This worker used `git log`, `git status`, `git rev-parse`, `git show`, scoped
`git diff --exit-code`, `rg`, bounded source reads, and Python standard-library
hashing/JSON parsing of existing artifacts. Relevant comparison commands were:

```sh
git diff --exit-code eba46183fecd9d698515411865e710021dcba632 562609b4acc8bc24704cc864ef27c0b11c56bc00 -- src-tauri database vendor tests/contracts tests/fixtures app/population-metrics.json .github/workflows/nightly.yml
git diff --exit-code 3118321ee23393bfe37c3cc8e11aeb84490cbd40 562609b4acc8bc24704cc864ef27c0b11c56bc00 -- src-tauri database vendor tests/contracts tests/fixtures app/population-metrics.json .github/workflows/nightly.yml
git diff --exit-code 2c93d658f4703c863405064121c975f8679592eb c81646dde87676973fe08e081c216f2fa58aeeee -- src-tauri database/migrations vendor .github/workflows/nightly.yml
git diff --exit-code 562609b4acc8bc24704cc864ef27c0b11c56bc00 5702a450d9a7faa3efb80c5b67de69386ae07540
git diff --name-status c81646dde87676973fe08e081c216f2fa58aeeee 9796f80b7b9ec7dfbff26b47a9935ce4b44441e5
git diff --check c81646dde87676973fe08e081c216f2fa58aeeee 9796f80b7b9ec7dfbff26b47a9935ce4b44441e5
git diff --exit-code c81646dde87676973fe08e081c216f2fa58aeeee 9796f80b7b9ec7dfbff26b47a9935ce4b44441e5 -- src-tauri database vendor .github app
```

All `--exit-code` comparisons were empty and exited zero. The frozen proposal
has only its two owned additions, and its whitespace check passed. Initial
exploratory reads of
nonexistent `src-tauri/migrations` and `.cargo/config.toml` were corrected to the
actual `database/migrations` path and the absence of a repository config at that
path; those failed path lookups are not successful checks.

No project test, build, benchmark, generator, browser, audio path or external
probe was executed by this worker. It made no dependency, application, migration,
workflow, feature-default or threshold change, and no remote write. New runtime
observations, if produced, must be attributed to their actual worker and frozen
source rather than to this source-only audit.
