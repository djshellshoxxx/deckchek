# Native support-history follow-up

## Current source and publication snapshot

**Prepublication qualification — 2026-11-18 UTC.** The latest source is **`fe936f7d48db2633ba3c2e948c682fa49ab68490`**, tree **`f74910a66e7bf9da818185fc87d4ec22a8cf2b4c`**, parent **`2ec083c411c7f9353fb0926fdf6dd828e200c5a0`**. Source38 adds exactly two paths to source37: the [native support-isolation module](../src-tauri/src/support_isolation.rs) and its [working-memory contract](support-isolation-native-history.md). The complete Node suite and local static gates passed; the native-core/harness proof has separate, independently reviewed boundaries.

The candidate retains source37's MIDI prerequisites and DDJ-GRV6/XDJ-AZ provenance. The [source37 report](DECKCHEK-MIDI-PROFILE-FOLLOWUP.md) is byte-identical and remains its earlier prepublication snapshot. Its **1,747/0/1** combined result, source36 **1,737/0/1** result, profile-author **84 passed / 1 failed** record and subsequent root matrix correction remain source-scoped history. Native memory work was outside that earlier snapshot; it is included here. The [checkpoint35](DECKCHEK-CONTINUATION-35.md) and [057d42f](DECKCHEK-CONTINUATION-2026-11-18.md) reports also remain unchanged.

The intended draft head is **`review/deckchek-midi-profile-20261118`**, targeting **`integration/deckchek-consolidation-20261118`** at **`0acb612aa796f7f459172932868ff7e787d83399`**. It descends from published [PR30](https://github.com/djshellshoxxx/deckchek/pull/30) head `72dd38c8bcc941ec33dbe567b8a74f858682ab82`, preserving its contribution while keeping that head/checks and PR27 metadata stable. The [nightly](../.github/workflows/nightly.yml) and [platform](../.github/workflows/cross-platform-release-validation.yml) pull-request filters cover main and `integration/**`; no workflow changes are needed. The established integration → PR27 → main path remains subject to qualification. No follow-up branch or PR number exists in this snapshot, and no supersession or future merge order is committed.

## Native behavior and preserved contract

The previous native implementation parsed and retained the complete history for every operation, including a missing-ID lookup, exact retry or one-row page. Source38 streams validation and retains bounded result rows. It uses indexed lookups for original observations inside the existing transaction.

Global validation remains complete and ordered: all observation JSON/columns, all comparison JSON/columns, cross-table ID collisions, then every comparison's original references and derived result. Descending canonical timestamp/Unicode-scalar ID ordering remains unchanged. An off-page or unrelated-venue corruption still rejects reads, missing-ID lookups, exact retries and new saves. Filtering limits the response, not integrity checks.

Reads retain deferred transactions and writes retain immediate transactions. Exact retries still precede current-catalog reads and return the original saved record; changed submissions conflict. Returned comparisons retain both complete original observations even when those observations fall outside the requested page. Existing stored bytes, legacy metadata, numeric derivation and refusal order are preserved.

There is no new migration, record cap, pruning, threshold, API field or list limit. The public list still accepts 1–100 rows of each kind with complete totals; UI/report limits remain unchanged. The 64 KiB rule applies to validated evidence, not raw SQLite JSON text: harmless whitespace larger than that remains accepted and unchanged.

## Memory measurement and tradeoff

The exact-source allocator experiment constructs valid history before measurement, then measures five operations twice at **16, 128 and 512 retained pairs**: **30 samples**. Each pair has two observations and one comparison. Full returned values are checked outside the measurement.

For a list with limit 1, both repetitions produced these incremental Rust peaks:

| Retained pairs | Previous peak Rust bytes | Candidate peak Rust bytes |
| --- | ---: | ---: |
| 16 | 1,896,655 | 310,560 |
| 128 | 13,369,263 | 310,560 |
| 512 | 52,703,919 | 310,560 |

Candidate peaks were identical across those sizes and repetitions for each measured operation:

| Operation | Incremental peak Rust bytes |
| --- | ---: |
| Existing observation lookup | 232,468 |
| Missing observation lookup | 232,468 |
| List limit 1 | 310,560 |
| Exact observation retry | 282,026 |
| Exact comparison retry | 233,241 |

This is a retained-memory improvement for fixed record/result sizes. The current raw/parsed rows and bounded returned rows still contribute. SQLite/C allocations, SQLite caches/sorting storage, process RSS, fixture construction and the full application are excluded. A large raw row can require more memory than these fixture measurements.

The extra scan and original-record lookups also require more work. At 512 pairs, cumulative requested Rust bytes for list limit 1 increased from **596,962,874 to 716,731,390**. The two debug elapsed samples increased from **1.655759 to 2.203790 seconds** and **1.695546 to 2.094101 seconds**. These sampled timings establish no production latency guarantee or speedup. Global validation still visits the entire retained history.

## Native proof and preserved failures

The author worked from source36; root verified that the original module was still unchanged in source37 before integrating the accepted two-path slice. All **19 original native test bodies** and **1,424 non-owned author-worktree files** remain unchanged. Three added production tests protect bounded pages/full originals/retries, global corruption/refusal ordering, and large raw-whitespace acceptance.

| Recorded stage | Outcome and scope |
| --- | --- |
| Initial harness setup | Cargo refused an ancestor template manifest with no targets; **no tests ran**. Renaming template storage corrected setup without changing production. The refusal log is retained. |
| Unchanged production, contract checks | **21 passed / 0 failed**, one filtered, **2.74 seconds**: 19 original tests plus the first two new preservation cases. |
| Unchanged production, separate raw-padding case | **1/1**, 22 filtered, **0.04 seconds**. |
| Unchanged production, memory regression | **0 passed / 1 failed**, 21 filtered, **24.10 seconds**, after recording all 30 samples. Peak Rust memory grew with retained history. |
| First corrected candidate, contracts | **22/22**, one filtered, **3.09 seconds**. |
| Final exact-source candidate | **23 passed / 0 failed**, none filtered, **34.16 seconds**: **22 production native contracts plus one harness-only allocator probe**. Strict harness Clippy (`-D warnings`) and Rustfmt passed. |
| Separate serialized parity probes | Baseline **1/1** and candidate **1/1** each covered **23 response/error cases**. Complete **1,121,756-byte** artifacts were byte-identical, SHA256 `444aa1d11d15dccd7930ab807607d215215bec6b8773a422b6c7b1484edf4d70`. |

Parity covers defaults/limits/filtering, existing/missing/oldest records, exact retries, conflicting/cross-kind IDs and corrupt/missing-reference errors, with original/corrupted storage rows retained. These probes and the Node suite overlap in purpose but are not added into a combined test count.

The independent reviewer accepted the slice without findings, verifying **66 artifacts**, **five exact harness reconstructions**, **27 production inputs**, all **24 migrations**, original tests and preservation. That was read-only source/proof review; no additional project execution is attributed to the reviewer.

## Harness dependency and application boundary

The harness copies the actual production core/tests, migration helpers, SQLite clock and all migrations. Tauri imports/path/IPC adapters and the full application are excluded. Baseline and candidate use identical harness lockfiles, `rusqlite 0.41.1` and `serde_json 1.0.151` with `float_roundtrip`. The application uses those same direct versions, but five transitive package selections differ:

| Package | Harness lock | Application lock |
| --- | --- | --- |
| `cc` | 1.11.2 | 1.6.0 |
| `find-msvc-tools` | 0.1.15 | 0.1.14 |
| `smallvec` | 1.16.5 | 1.16.2 |
| `syn` | 3.0.10 | 1.0.109 / 2.0.119 / 3.0.6 |
| `unicode-ident` | 1.0.27 | 1.0.26 |

This controlled baseline/candidate comparison supports the reported core behavior and allocator result. It does not replace full-application execution with the application lock, IPC, packaging or supported-platform qualification. No dependency or lockfile is changed by source38.

## Combined source38 qualification

| Root gate | Exact result |
| --- | --- |
| Complete serial Node 22.23.5 suite | **1,747 passed / 0 failed / 1 optional Mixxx-corpus skip**, **1,748 total**, **147 files**; **265.537171973 seconds TAP**, **265.62577949000115 seconds wall**. Started **16:44:05.590354 UTC**, completed **16:48:31.481213 UTC**. |
| Static gates, completed **16:49:39.609815 UTC** | Device index, timecode, **24 migrations**, mobile copies, notices, coverage, GLib provenance/metadata, application/GLib-harness Rustfmt and **403 JS/MJS syntax checks** passed. All **1,429 frozen file hashes** and index tree matched. |
| Separate monitor | **1/1**, **1,027.375774 ms TAP**, **2,400 hops**, mean **0.348 ms/hop**, worst **0.92 ms**, heap growth **0.07 MB**; unchanged budgets. |

The checked coverage matrix is byte-identical to source37: **45 profiles / 506 handwritten / 187 generated / 693 total / zero gaps**, with **23 conditional audio cases** and **20 conditional MIDI profiles / 60 requirements**. Reviewed profile provenance remains 21 existing models. No device research, measurement threshold, certificate policy, feature default or browser behavior changes in source38.

The full Node suite checks the combined JavaScript source; it does not execute the native application. Current-source hosted/native/platform/Chromium, broad Sonar, hardware and packaged distribution gates remain open. Unchanged local Tauri system-metadata and Chromium socket-launch limitations were not retried.

The last imported PR30 hosted observation remains scoped to published checkpoint35: actual Windows **714 passed / 0 failed / 9 ignored in 140.68 seconds**, plus separate PDF **1/1**, 722 filtered, 4.15 seconds and five report pages. The source37 report retains the **16:26:45.220 UTC** queue snapshot and **16:28:36.307 UTC** security/status observation; they are not fresh source38 results. Snyk's no-manifest-change status is not broad Sonar clearance. Earlier failures and cancellations remain recorded.

## Evidence and continuation

Evidence is under `/workspace/scratch/a884a1d6c4d8/verification`. The code checkout is `continuation-38-checkout`; the publication documentation overlay is `continuation-38-docs-worktree`.

| Acceptance record | SHA256 |
| --- | --- |
| `continuation-38-final-integration-acceptance.json` | `52bad69c315c1d319050a7aba19ce4b612e11e19e65163aaa85b6389670f0fd1` |
| `continuation-38-native-independent-acceptance.json` | `1e1152e31b6c8ff4c2d0fdf54c0b813ab05903ce05c87e2055bf7c3a0f921656` |
| `native-support-memory-freeze-20261118/manifest.json` | `6b2e106399a641c8d74715ab3ad5f86a53ee98303938305d5e83bf3e2e7afd44` |

The native freeze preserves raw setup/red/green/parity logs, exact harness inputs, `memory-comparison.json` and `serialized-parity-acceptance.json`. The combined acceptance identifies `continuation-38-source-freeze.json`, `continuation-38-report-facts.json`, `continuation-38-post-suite-source-check.json`, `continuation-38-static/results.json` and the independent source37 documentation acceptance. The earlier documentation seed is `continuation-38-documentation-seed.json`.

Protected native source SHA256 is `83e67ecf4dedd4b7325210d34c00765a99b02701015cca97ca70fad165d5061a`; its contract note is `6a6947852f5423e49bfbfa8683b21946867af2805051f359ae8b150c388ba581`. The unchanged source37 report is `2cb5512217caeedc0b39ac1b7f36ed694317dc71b8f3abbe6657ff2d53895f98`.

The native author released execution to root after its **16:41 UTC** freeze. At the **16:50:51.825651 UTC** combined acceptance, all root source38 processes were finished and no further execution transfer had occurred. Check current ownership before any new run. Next steps are independent documentation review, separate draft publication and exact-source external qualification. Main merge, release, tag and deployment remain unclaimed; Fleet stays OFF.
