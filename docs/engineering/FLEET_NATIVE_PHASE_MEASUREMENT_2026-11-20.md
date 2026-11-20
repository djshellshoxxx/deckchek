# Fleet native phase measurement — 20 November 2026

Dates use America/Vancouver. This is an isolated Linux diagnostic of the existing
Fleet reminder implementation, not a production optimization or clearance of the
failed hosted timing gate. No application source, SQL, migration, application
dependency, feature default or test threshold was changed.

## Why this measurement was needed

PR #47's second nightly attempt failed its ASan reminder budget at **200.055967 ms**
against the unchanged **200 ms** assertion. Job
[136543911776](https://github.com/djshellshoxxx/deckchek/actions/runs/44773669498/job/136543911776)
reported **766 passed, one failed and eight ignored** in 245.61 seconds. The
inspected log contained no ASan memory diagnostic. The earlier #46 result of
237.092791 ms remains historical evidence; its later successful qualification
and merge do not erase that failure. The scheduling cause is unconfirmed.

The prior [source/SQL investigation](FLEET_ASAN_TIMING_REVIEW_2026-11-20.md) found
bulk queries already in use. This follow-up measures the Rust path, including
mapping, JSON construction and enrichment, without relaxing the assertion.

## Exact source and method

Source is main commit `e49ea1bbafb5005fdf1dfcf60d885b82d0191471`, tree
`ada0c02e0ccd4c70f29d64a086f593ea3524915f`. The Fleet source, database source,
application lock and migrations match PR #47. The
[generator](../../tools/fleet-reminder-diagnostic.py) extracts the exact reminder
body, its usage/completion helpers, the existing 2,000-row regression fixture and
database migration helpers. It includes all **25 real migrations**. It preserves
the original budget regression and adds a separate instrumented function whose
full 2,000-row result is compared with the unchanged function result. Fresh
review found that the initial generator's migration includes pointed at live
repository files. The corrected generator copies exact migration bytes into its
output and uses relative includes, so later repository edits cannot alter the
generated crate behind its recorded hashes. The retained original observation
used the verified original migration bytes; its original hashes are preserved.

Four phase boundaries measure wall time, Linux thread CPU time, and counts of
Rust allocation requests and requested bytes. The allocator delegates to Rust's
`System` allocator. These counters do not measure SQLite C allocations, live or
peak memory, or per-object ownership; `realloc` contributes the newly requested
size. The global counters are interpreted only with the serial test execution
shown below. Counter operations add overhead. The phase recorder's own output
construction occurs between measured phases. The last phase ends before the
function returns; local-variable destruction and other return cleanup are not
included in those four phase rows. The separate whole-function observation
includes the call's complete return.

The standalone crate pins direct dependencies to application-lock versions:
rusqlite 0.41.1 with `backup`/`bundled`, serde_json 1.0.151 with
`float_roundtrip`, and libc 0.2.190. The copied lock initially required pruning
of unused application packages; the first `--locked` invocation therefore
failed before compilation. `cargo update --offline --workspace` updated **zero
package versions** and normalized only the standalone lock. A subsequent check
matched every resolved registry version/checksum against the application lock;
the resulting standalone lock contains **31 packages**. The application lock
remained unchanged.

Runtime: **rustc 1.102.0-nightly (6905905bb 2026-11-19)**, target
`x86_64-unknown-linux-gnu`, unoptimized test profile with debug information.
The official rustup installer checksum was verified before user-local setup.
No system package installation or privilege escalation was used.

Reproduction requires that nightly toolchain and ordinary Cargo registry access:

```sh
python tools/fleet-reminder-diagnostic.py /absolute/path/to/empty-diagnostic
cargo update --offline --workspace --manifest-path /absolute/path/to/empty-diagnostic/Cargo.toml
python tools/fleet-reminder-diagnostic.py /absolute/path/to/empty-diagnostic --verify-lock
RUSTFLAGS=-Zsanitizer=address RUSTDOCFLAGS=-Zsanitizer=address \
  ASAN_OPTIONS=detect_leaks=0 CARGO_INCREMENTAL=0 \
  cargo test --locked --manifest-path /absolute/path/to/empty-diagnostic/Cargo.toml \
  -j4 --lib --target x86_64-unknown-linux-gnu -- --nocapture --test-threads=1
```

The offline normalization needs the relevant registry metadata already cached;
its failure is not permission to silently update package versions. Verify the
resolved lock before interpreting any run. The generator requires an empty
output directory outside the repository and preserves existing diagnostic output.

## Observed result

Both tests passed: **2 passed / zero failed / zero ignored** in 1.47 test seconds.
Compilation plus execution took 15.890162506 seconds. SQLite reported **3.54.1**,
with all 25 migrations recorded and all 2,000 result rows equal. The untouched
200 ms regression also passed in this isolated run.

| Measured phase | Wall ms | Thread CPU ms | Rust allocation requests | Requested bytes |
| --- | ---: | ---: | ---: | ---: |
| Completion query and map | 20.942838 | 20.944550 | 4,011 | 728,184 |
| Usage query and map | 10.988582 | 10.990903 | 4,010 | 323,338 |
| Reminder query and JSON | 45.515702 | 45.509185 | 32,010 | 1,654,504 |
| Enrichment | 27.931386 | 27.933314 | 10,000 | 2,812,000 |
| Separate unchanged-function call | 110.555698 | 110.543836 | 50,031 | 5,518,026 |

The four phase rows describe the instrumented invocation; the last row is a
separate call and is not their sum. Within this single observation, reminder
query/JSON construction took the largest phase time, and enrichment requested
the most bytes. Those observations identify useful measurement targets; they do
not establish an optimization, a general distribution, or the cause of the
hosted failure. Warm-cache order and instrumentation overhead remain relevant.

## Preserved evidence and limits

The [measurement record](evidence/fleet-reminder-2026-11-20/measurement.json)
contains source/snippet/migration hashes, toolchain, flags, result, generator
hash and full log hash. Its source harness SHA-256 is
`d18621004ba3b3deff68b7a9456edd0c9ef6b5eead1e23480f24a928c07bcb63`;
the [successful log](evidence/fleet-reminder-2026-11-20/asan.log) hash is
`1f9fe7a1613916682bfc04e81f409094db1f3dfddb0dda24e684e0fbb1f7eb13`.
The initial lock failure, normalization log, resolved diagnostic lock and failed
full-application metadata attempt are retained beside it.

Full application feature-unification equivalence remains **unverified**. The
attempt to resolve the full application metadata stopped with `ENOSPC` while
fetching a dependency; no successful full-graph result is claimed. Disk space was
then recovered from completed clean checkouts and disposable build output while
preserving branches and evidence. Native application SDKs (`gtk+-3.0`,
`webkit2gtk-4.1`, `alsa`, `ayatana-appindicator3-0.1`) were not found by
`pkg-config`. This is consequently not a full Tauri application build or native
platform qualification. Leak detection was disabled explicitly, so no leak-test
result is asserted.

PR #54's full ASan job subsequently passed on its own source. That is separate
hosted evidence; neither it nor this isolated measurement retroactively turns
PR #47's failed run into a pass. The next combined candidate still requires its
own applicable hosted gates. Preserve the 200 ms assertion, all failures and
Fleet default-off. Any proposed production optimization needs source-bound
semantic equivalence, independent review and unchanged-gate qualification.

## Completed fresh reviews

Root authored the diagnostic and the migration-copy correction. Three fresh
workers completed independent [code](FLEET_DIAGNOSTIC_CODE_REVIEW_2026-11-20.md),
[functional](FLEET_DIAGNOSTIC_FUNCTIONAL_REVIEW_2026-11-20.md) and
[defensive](FLEET_DIAGNOSTIC_SECURITY_REVIEW_2026-11-20.md) reviews. They accept
corrected tooling source `69ea261aa8a89c3cb3d6d83e17427b442261cc92`, tree
`e52b5c4671c9a43388c838aed8e3d0cc2188efb2`, within their documented source and
generation scopes. The corrected generator hash is
`2df2d1a9d72073d25863d80fef92b4d4ac56a9b42a0f36f2025de8a64dcdeeb1`.

Independent generation confirmed exact extracted functions and the unchanged
regression, 25 copied migration/hash matches, relative-path resolution after
moving the generated crate, output preservation, and all 30 registry identities
plus the root package. Source hashes stayed unchanged. The live-migration input
gap and the omitted-return-cleanup wording were closed by the correction above.

The functional worker attempted one offline ASan build on the original generated
crate. Bundled SQLite compilation was killed in `cc1` before tests ran; Cargo
exited 101 after 15.237512457 seconds. The cause remains unconfirmed. Its full
log and source-bound records are retained beside the original evidence. No
second Cargo run occurred. The corrected generated Rust differs only in its
migration include paths, and copied SQL bytes were independently verified.
That validates generation; it does not supply an independent runtime pass.
The author's original 2/2 observation retains its original source and limits.

This tooling checkpoint remains separate from the Ledger qualification candidate.
A successor should use it for a concrete native performance question or complete
the outstanding runtime environment check; unchanged passing generation checks
do not need repetition. Preserve both the author's successful observation and
the independent pre-test compile failure.
