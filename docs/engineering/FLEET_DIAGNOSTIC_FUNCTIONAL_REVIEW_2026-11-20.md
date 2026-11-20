# Fleet diagnostic independent functional review — 20 November 2026

Reviewer: `/root/fleet_diagnostic_functional_fresh`. Dates use America/Vancouver.

## Disposition

**Accepted within the corrected generator's functional and source-integrity
scope.** Independent generation, exact byte comparisons, dependency checks and
ordinary output-preservation controls found no remaining blocker after the
migration-snapshot correction. The fresh code reviewer identified the original
live-migration reference gap; root corrected it, and this reviewer independently
validated the resulting files and relative paths.

**Independent native execution remains unqualified.** The one bounded ASan build
attempt failed while compiling bundled SQLite because the C compiler was killed.
No test ran and no independent timing measurement was obtained. The cause is
unconfirmed. This report does not turn the author's earlier 2/2 result into an
independent execution or resolve the hosted 200 ms failure.

## Fixed sources

| Role | Commit / tree |
| --- | --- |
| Original reviewed diagnostic | `82016a79e363d687703c4e897d4ef2247fcb1028` / `90a667533bbea1d77705d15274428011db3373b3` |
| Corrected generator and clarified report | `69ea261aa8a89c3cb3d6d83e17427b442261cc92` / `e52b5c4671c9a43388c838aed8e3d0cc2188efb2` |
| Unchanged application baseline | `e49ea1bbafb5005fdf1dfcf60d885b82d0191471` |

The original checkout was clean. Its application, tests, native source, database,
workflows and mobile files match the baseline. A separate Git comparison found
the Fleet source, database source, application lock and migrations identical to
PR #47's `b31bad64f09569ad2b378d1df2adc90e1ecb38cc`. The correction changes only
the diagnostic generator and its report; it does not change those inputs.

The [author measurement record](evidence/fleet-reminder-2026-11-20/measurement.json)
and preserved successful log agree exactly, including their recorded log and
generator hashes. That is an evidence consistency check. The recorded 2/2 ASan
result remains the author's execution on the original generated harness.

## Independent generation and contract checks

The original generator was executed from this review worktree into a new empty
directory outside the repository. Six extracted snippet hashes, production
Fleet/database/lock hashes and all 25 migration hashes matched the author record.
Its generated Rust matched the author's generated file after normalizing only
the differing checkout paths in migration `include_str!` expressions.

The complete production `reminders` body and the complete original reminder
budget regression each appear once, unchanged apart from module indentation for
the regression. The test still asserts 2,000 rows, representative completion and
usage values, filtered results and the original **200 ms** limit. The diagnostic
test retains full result equality for all 2,000 rows. Those assertions were
inspected; this review's build did not reach their execution.

An additional exact comparison removed the function rename and only the five
measurement insertions from `measured_reminders`. The resulting function equals
the complete production function byte-for-byte. This verifies that the probes
did not otherwise change its queries, mapping, enrichment or return expression.

Two ordinary command-line controls confirmed that the generator rejects both an
existing non-empty output directory and the repository itself. Rejection left
all existing generated file hashes unchanged. These were local functional checks,
not adversarial probes or an exhaustive filesystem security assessment.

### Migration snapshot correction

The original generator embedded absolute paths to live repository migrations.
A later repository edit could therefore change a subsequent compilation while
leaving the older generation record unchanged. This is the source-provenance gap
reported by the parallel code reviewer, not a claim that the retained author run
used different migrations.

After fast-forwarding to `69ea261`, a new independent generation confirmed:

- The generated Rust changed only the 25 migration include paths.
- All 25 copied SQL files equal their repository inputs byte-for-byte, and each
  copied file matches the hash recorded in the new generation record.
- Every include resolves to its copied file inside the generated crate, with the
  same numeric migration version and filename.
- Relocating the entire generated output preserves every relative include's
  resolution and leaves the generated Rust unchanged.
- Repeating generation against that existing output is rejected without changing
  any generated file.

All **1,536 tracked source hashes** stayed unchanged during the original checks
and the bounded compile attempt. All 1,536 hashes likewise stayed unchanged
during the corrected-generation checks; both fixed-source checkouts remained
clean. Report/evidence additions occurred afterward. No actual repository
migration was edited for these controls.

## Dependency and bounded execution evidence

Runtime was **rustc 1.102.0-nightly (6905905bb 2026-11-19)**, using the existing
user-local toolchain. The run set `CARGO_NET_OFFLINE=true`; no package download,
system installation or broad application metadata resolution was attempted.

The generated standalone lock was normalized with `cargo update --offline
--workspace`. Both the generator's `--verify-lock` and an independent comparison
of **name, version, registry source and checksum** passed for all **30 registry
packages**. The complete 31-package lock matched the author's preserved
diagnostic lock byte-for-byte. This establishes those resolved identities, not
full application feature-unification equivalence.

Exactly one bounded command was attempted against the original generated crate:

```sh
RUSTFLAGS=-Zsanitizer=address RUSTDOCFLAGS=-Zsanitizer=address \
  ASAN_OPTIONS=detect_leaks=0 CARGO_INCREMENTAL=0 CARGO_NET_OFFLINE=true \
  cargo test --locked --manifest-path /absolute/path/to/harness/Cargo.toml \
  -j4 --lib --target x86_64-unknown-linux-gnu -- --nocapture --test-threads=1
```

Cargo exited **101** after **15.237512457 seconds**. `libsqlite3-sys`'s C build
reported `cc: fatal error: Killed signal terminated program cc1`. The log contains
no executed-test result or `FLEET_DIAGNOSTIC` measurement. Disk readback still
showed approximately 3.1 GB available, but the reason for the kill was not
established; no out-of-memory or scheduler diagnosis is asserted.

The [complete failed-build log](evidence/fleet-reminder-2026-11-20/functional-compile-failure.log)
is preserved byte-for-byte, SHA-256
`679e1b97af068acd3f3d7ce8073281d765a1f9bbcdbaa6a8c177d8671ca7a94e`.
The [execution record](evidence/fleet-reminder-2026-11-20/functional-native-result.json)
retains the exact command, flags, runtime, source, elapsed time and unchanged-file
result. No second Cargo execution was performed. The corrected generator was
accepted through the exact emitted-Rust/SQL and path-resolution checks above,
as directed by root, rather than by claiming a new compiled result.

## Corrected tooling hashes and measurement boundaries

| Artifact | SHA-256 |
| --- | --- |
| Corrected generator | `2df2d1a9d72073d25863d80fef92b4d4ac56a9b42a0f36f2025de8a64dcdeeb1` |
| Corrected emitted Rust | `061852fed4188f8a2f0f2a74546de8088e6da834a8c3505553540e83284563ca` |
| Corrected generation metadata | `1ad9d7a0a799a30fc851073b58d7bddd5216198756601fa44b8a2b87e7b3fd34` |

The [initial generation proof](evidence/fleet-reminder-2026-11-20/functional-initial-generation.json)
and [corrected generation proof](evidence/fleet-reminder-2026-11-20/functional-frozen-generation.json)
record the checks and their separate sources. The different emitted-Rust hash
from the author's original observation reflects the corrected include paths;
the original observation is not relabeled as a new-source run.

The four phase intervals end before function-return destruction of local values
and statement cleanup. They therefore do not form an exhaustive partition of
the separate whole-function call. The corrected report now states this. Global
Rust allocation counters also do not measure SQLite C allocations, live/peak
memory or leak freedom. The serial run flag, probe overhead, separate invocation
order and unknown full-application feature unification remain material limits.

## Handoff

Root may integrate this functional review and the preserved failed-build evidence
with the separate code and defensive reviews. No production source, generator,
test, threshold, dependency or feature default was authored by this reviewer.
The only additions are this report and its evidence copies.

The hosted timing failure remains open at its own recorded source. Preserve the
200 ms gate, the author's original result, this independent compile failure and
the generation correction's exact scope. Full native application/platform,
browser, physical and release qualification remain separate. No remote write,
deployment, branch deletion or history rewrite occurred.
