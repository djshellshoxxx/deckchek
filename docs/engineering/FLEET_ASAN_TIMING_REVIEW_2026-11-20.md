# Fleet reminder timing review — 20 November 2026

**Disposition:** the observed ASan job failed the existing wall-clock performance
assertion. This review found no reintroduced per-reminder SQL query and did not
establish a production optimization that could be meaningfully qualified in this
environment. Keep the **200 ms** gate and production implementation unchanged.
The failed result remains a failed qualification gate until the integration
owner obtains an applicable successful result or qualifies a correction.

## Exact sources and observed failure

| Item | Identifier |
| --- | --- |
| Inspected main | `f46abbea458ba2bb8c2f6d438eba4f5b0a58c948` |
| Inspected tree | `328b31fa3770355a6acb4ab754d0d9f36da72fbc` |
| PR #46 source | `800511850c8f311e2e8bd50c5cd2dffbd5ddb246` |
| Fleet source Git blob | `734e405e653deade0115018a9faf7c53e8b5506c` |
| Fleet source SHA-256 | `3555c7d515aa64c383098ded7954e2f65c4899ae4589018ffaf0d03f54cef186` |
| Application lock Git blob | `a92f6f4418afc2dbd59f25464840010f112b7c8e` |
| Nightly workflow Git blob | `64818e1109913d8dcdd244bdd62d31aca1029496` |

The complete direct diff from this main to PR #46 changes only
`tools/smoke/ledger.mjs`. Fleet, the application manifest/lock, all migrations and
the nightly workflow are identical. The Ledger diagnostic addition therefore
does not change the native implementation being timed.

This reviewer independently retrieved the decoded log for
[ASan job 136366325979](https://github.com/djshellshoxxx/deckchek/actions/runs/44759032908/job/136366325979)
in nightly run `44759032908`. It records:

- `rustc 1.102.0-nightly (6905905bb 2026-11-19)`.
- The `test` build profile as **unoptimized + debuginfo**.
- `RUSTFLAGS` and `RUSTDOCFLAGS` set to `-Zsanitizer=address`.
- `ASAN_OPTIONS=detect_leaks=0`; this run does not establish leak checking.
- `fleet::tests::regression_reminder_overview_has_no_per_reminder_scans_and_meets_budget`
  failing at `src/fleet.rs:1845` with **237.092791 ms**.
- **766 passed, 1 failed, 8 ignored**, with 259.07 seconds reported test duration.
- No `ERROR: AddressSanitizer` or `SUMMARY: AddressSanitizer` diagnostic in the
  retrieved log. The recorded failure is the performance assertion; that does
  not make the failed run a pass or establish general memory safety.

The integration owner reported an earlier-source failure at 224.106189 ms and a
subsequent unchanged-source pass. That historical comparison is owner evidence,
not a second execution by this reviewer. The owner also reported that GitHub
rejected the targeted PR #46 retry while its workflow still had a running job.
This reviewer performed no rerun, cancellation or other remote mutation.

## Timed production path

The contract is [FS-23 section 8](../specs/23-venue-fleet-dashboard.md): reminders
for 1,000 assets in less than 200 ms. The
[regression in `fleet.rs`](../../src-tauri/src/fleet.rs) populates 1,000 new
assets, 2,000 reminders, 10,000 maintenance events and 3,000 confirmed usage rows.
The database helper additionally supplies two unrelated assets.

The timer starts **after** the fixture transaction commits and stops immediately
after `reminders(&conn, None)` returns. Fixture construction, expected-value
assertions and the subsequent single-asset query are outside that interval.
The timed call includes:

1. One window query for the latest completion per reminder and population of its
   lookup map. Tie-breaking remains Julian event time then descending event ID.
2. One confirmed-usage query, grouped into Rust vectors per asset, when any
   completion exists.
3. One ordered reminder query and construction of the JSON rows.
4. A pass enriching each reminder with its completion and hours since completion.

There is no SQL call inside the per-reminder enrichment loop. The current source
already moves `Row::get`-owned strings into JSON and removes completion records
from their lookup instead of cloning their timestamps. The fixture's enrichment
examines three usage entries for each of 2,000 completed reminders: 6,000
entry visits. For a different dataset, work still depends on the number of
usage records per asset and completed reminders attached to it; this fixture
does not establish performance for arbitrary history sizes.

Output and error semantics constrain a future optimization. The existing tests
distinguish absent `hoursSinceCompletion`, explicit unknown/null and zero;
preserve completion tie-breaking and `ORDER BY title,id`; reject invalid stored
column types with the original errors; and retain uncertainty for usage spans
that straddle a completion. A faster path must preserve those cases.

## Bounded SQL-only diagnostic

One diagnostic run used **Python 3.12.14 / SQLite 3.53.1**, applying all **25**
unmodified repository migrations to an in-memory database with foreign keys on.
It reproduced the helper seed and benchmark row counts, extracted all three SQL
strings from the inspected production source, and fetched each phase once for
all assets and once for `fleet-5`. It checked result cardinalities and the two
fixture completion dates. This is not execution of `reminders`, rusqlite, the
bundled SQLite build, Rust JSON assembly or ASan.

| Selection | Query | Rows | Wall ms | Process CPU ms |
| --- | --- | ---: | ---: | ---: |
| All assets | Latest completions | 2,000 | 25.600143 | 6.085055 |
| All assets | Confirmed usage | 3,000 | 4.950960 | 2.749303 |
| All assets | Reminders | 2,000 | 21.874445 | 4.384476 |
| `fleet-5` | Latest completions | 2 | 0.931527 | 0.926072 |
| `fleet-5` | Confirmed usage | 3 | 0.268365 | 0.266204 |
| `fleet-5` | Reminders | 2 | 0.154603 | 0.153647 |

All six `EXPLAIN QUERY PLAN` results had **no correlated subquery**. Latest
completions scanned `maintenance_event` and used a temporary B-tree for ordering;
usage scanned `asset_usage`; reminders scanned `maintenance_reminder` and used
a temporary B-tree for ordering. In this diagnostic build, the optional
`(?1 IS NULL OR asset_id=?1)` form also produced scans for the selected asset.

The selected-asset plan is a concrete future measurement target, but changing
that path would not explain or directly repair the failing **all-assets**
benchmark. Confirm its plan in the actual bundled SQLite before considering
separate filtered SQL. No index or migration was added on this evidence.

These one-pass timings are diagnostic observations, not an average, a benchmark
distribution or a passed 200 ms Rust gate. The observed difference between local
wall and process time shows that those clocks are not interchangeable in this
session. It does **not** identify the cause of the hosted delay or prove that
scheduling alone explains it.

## Next specific measurement and handoff

The existing ASan command passes `-j 4` to Cargo and no explicit libtest thread
count. Cargo's [test documentation](https://doc.rust-lang.org/cargo/commands/cargo-test.html)
distinguishes build options from test-binary options; the
[Rust test guide](https://doc.rust-lang.org/book/ch11-02-running-tests.html)
describes parallel test execution and the separate `--test-threads` control.
The retrieved job does not establish how much contention the timed call
actually experienced.

After the currently running workflow permits an owner-controlled retry, retain
its original failed result and inspect the unchanged gate outcome. If the
failure recurs, use a separate diagnostic branch or harness containing the exact
production body and locked native dependencies to record **completion-query,
usage-query, reminder-row construction and enrichment** wall/CPU/allocation
measurements. Record toolchain, SQLite build and harness concurrency. One
filtered invocation can help localize the operation; it does not replace the
unchanged full ASan qualification gate. Keep the 200 ms assertion, fixture,
sanitizer options, supported output/error cases and Fleet's default-off flag.

Only optimize the measured dominating phase, add a functional regression if
behavior changes, and obtain fresh exact-source native and ASan qualification.
Do not attribute the failure to the runner or rewrite JSON/SQL speculatively
from the aggregate wall time alone.

## Scope and verification

This review performed Git/source inspection, a read-only hosted log retrieval,
the single bounded SQL diagnostic and report whitespace validation. No Rust
compiler/test, native application, browser, full test suite, hardware test or
production performance optimization was run or changed. Cargo is not available
in this review environment. No dependency, workflow, threshold, feature default,
database migration or application source changed; only this handoff was written.
