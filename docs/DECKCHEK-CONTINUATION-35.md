# DeckChek continuation — checkpoint 35

## Current source and consolidation

Reviewed source [3aa4d964bc4091a2c16aac042a9bce9b2f8aeec5](https://github.com/djshellshoxxx/deckchek/commit/3aa4d964bc4091a2c16aac042a9bce9b2f8aeec5), tree `8f47b511c8de5cbdfd183f6fd7e119e708edc513`, combines both preserved parent histories:

| Parent | Preserved contribution |
| --- | --- |
| `2c9abbc2fbe7bc2108376d8c2d1c259180ffcb69` | Published concurrent source `057d42f` and its documentation child: canonical integer rejection, complete Cargo warning enforcement, certificate path construction and two profile updates. The [concurrent report](DECKCHEK-CONTINUATION-2026-11-18.md) remains byte-for-byte unchanged. |
| `3a7170f04dd38f46f03d67de02fcea2476212a3e` | Reviewed source `32419404` and checkpoint 34 documentation: the separate browser venue-history archive, with all earlier incident, A/B, lifecycle, profile and qualification evidence. |

The combined source adds the accepted Equipment catalog archive, active-screen history navigation correction, two analog-profile provenance updates, Windows test portability corrections, root smoke/spec integration and Fleet result-ownership optimization. It has **46 changed paths relative to the first parent and 1,424 frozen tracked files**. Its first complete serial Node run passed **1,722 tests, zero failures and one optional Mixxx-corpus skip**. Focused results below overlap that suite.

The inventory was recorded at **2026-11-18 15:33:18.863 UTC**, from API observations made between **15:30:01.721 and 15:30:55.087 UTC**. During those observations, the owned branch and draft [PR30](https://github.com/djshellshoxxx/deckchek/pull/30) both reported `2c9abbc`; GitHub reported mergeable `true`, state `unstable`, with zero submitted reviews and zero inline review threads. Integration [PR27](https://github.com/djshellshoxxx/deckchek/pull/27) remained `0acb612aa796f7f459172932868ff7e787d83399`; main remained `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`. The earlier `963`/`e6` discrepancy is historical, with no cause assigned.

The inventory contains **28 branches and 25 PRs: 10 open, 14 merged and one closed without merge**. Source 35 is **326 ahead / 0 behind main** and three commits ahead of `2c9abbc`; ancestry alone does not establish semantic equivalence. Source 35 exists but remains unpublished at this snapshot. A documentation child has no assigned SHA here. Main/integration updates, release, tag and deployment are not claimed.

## Browser Equipment catalog transfer

Data now offers a separate **Browser Equipment catalog file**, alongside workspace JSON, the immutable venue-history archive and native complete-database backup. The version-1 `deckchek-catalog` file carries manufacturer, product, asset, setup, venue and support-configuration collections, embedded setup components and opaque catalog metadata. Export includes retained retired/deleted assets and reads complete saved state rather than filtered Equipment views. See [the full contract](catalog-archive.md) and [FS-08 §13](specs/08-backup-restore.md#13-browser-equipment-catalog-archive-2026-11-18).

Original IDs/timestamps, absent versus null fields, component order, literal support structure text, retirement values and valid unknown metadata are preserved. Known relationships must resolve inside the incoming file itself; the target and staged graph are also validated. Entity namespaces stay distinct, component identities cannot move between setup owners, and different same-ID or metadata values block the entire import. Exact matches ignore object-key order and cause no write. Invalid JSON-shaped values are rejected rather than normalized.

The file, complete raw catalog state and proposed merged state are each bounded to **32 MiB UTF-8**; the six collections and components to **10,000 records**; JSON depth to **24**. These limits do not promise browser quota. After complete preflight, import rereads the original raw value immediately before **one `setItem()`**, preserving all destination siblings outside `state.catalog` and all other keys. Changed data, conflicts, corruption and exceeded bounds prevent that archive write. A real Storage quota failure retains the previous value. This is not cross-tab compare-and-swap or a per-record partial-import loop. A lost acknowledgment is resolved by retrying the unchanged file; after reload, the operator reselects it.

Native-only booth, deck-position and asset-settings-snapshot authorities are not invented. Their original IDs and legacy support-position mismatches are retained and disclosed. Unknown catalog buckets remain opaque even if named like those authorities. Importing a current venue with the original ID enables existing report lookup while captured incident/support snapshots remain untouched.

The file does not transfer device-profile bindings, specification caches, device results or learned MIDI maps. Existing startup synchronization can update matching product descriptions/timestamps. An imported asset retains its source product ID even when Devices uses a different destination binding for the same displayed model; a later reimport can correctly conflict after an editable record changes. Exact transfer is not a promise that other workflows never modify the catalog.

The accepted catalog freeze passed **196/196** focused checks, including **43 new cases—27 model and 16 actual-handler tests**. Root's exact smoke seeder passed **1/1 in 91.430988 ms TAP**, using actual startup/store/report code: **12 records, 2,924 UTF-8 bytes, one source seed write, one target import write, zero retry/conflict writes**. Only two document-relative imports were relocated. This is Node proof, not Chromium controls, downloads, viewport or persistent-browser qualification.

## History navigation and platform-test corrections

Repeated `onShow()` while Data is already active no longer retires a live history-file request. Real inactive-to-active transitions and disposal retain their ownership boundaries. The two-path follow-up preserved **0 passed / 2 failed** baseline evidence and passed **67/67** focused checks. Catalog/history file names and diagnostics continue to render as text; genuine navigation still retires stale results.

The five-path Windows correction changes tests only: audio/MIDI source-body lookup and the bare-tool scanner accept LF/CRLF without weakening original assertions; the certificate saved-path fixture uses its existing temporary directory; the Unix-only `UserFileError` import follows its test's scope. Original LF guards passed **3/3**, CRLF **0/3**; new regressions were **3 pass / 3 fail** before correction, then **6/6** under each newline. Saved-path checks passed **2/2 on Linux**. This does not qualify Windows or the complete certificate signing/storage roundtrip.

The Hum smoke now waits for the option to be attached before `selectOption`, retaining the selection, downstream assertions and timeout. Independent source review accepted the root smoke/FS-08 integration. There was no local Chromium run; the predecessor failures and required successor execution remain below.

## Fleet reminder result ownership

Reminder SQL already returns owned strings. Direct owned JSON-value conversion now avoids copying those strings again; each unique reminder consumes its completion lookup entry so the timestamp can move into the result. SQL constants, usage helpers, floating-point addition order, null/omission semantics, migrations, adapters and feature defaults are unchanged. The original complete timed fixture and strict **200 ms** assertion are byte-identical.

The exact-core harness includes all **24 migrations** and 29 resolved package records matching the application lock. It passed **8/8**, with differential comparisons of complete results, serialized bytes and errors. Three new repository contract tests had already passed against the original implementation. A separate allocation-probe feature passed **1/1**; strict harness Clippy passed. Root independently reviewed the frozen diff/tests and evidence hashes without independently executing that harness.

Two scratch allocator measurements agreed:

| Measured Rust test thread | Original | Candidate | Reduction |
| --- | ---: | ---: | ---: |
| Allocation/reallocation calls | 62,031 | 50,031 | 12,000 |
| Requested bytes | 5,659,586 | 5,518,026 | 141,560 |

These totals exclude SQLite/C allocations and are not peak/retained-memory or ASan measurements. The initial candidate's non-improving pairs—19.550→28.239, 17.950→18.688 and 18.720→19.233 ms—and the final original 38.080 ms outlier remain in the evidence. The short ordinary-debug samples do not establish a reliable hosted speedup. Early lock/toolchain setup refusals are retained; no local failing timing was manufactured.

The harness excludes Tauri adapters and unrelated native modules. Earlier `e6` ASan failed at **234.014893 ms > 200 ms**, while the later `2c9` ASan run passed with the **original, pre-optimization Fleet code**. Neither establishes a cause or shows that this allocation change was required to pass ASan. Current-source hosted qualification remains necessary, and Fleet remains OFF.

## Concurrent integrity and warning repairs

The [unchanged concurrent report](DECKCHEK-CONTINUATION-2026-11-18.md) documents source `057d42f`, retained exactly in this integration. Native canonical JSON now safely rejects the signed minimum integer, preserving valid canonical bytes, hashes and signature format. Its reproduction establishes a panic/rejection defect, not certificate forgery or bypass of callers' separate schema validation.

The corrected warning parser rejects application, dependency and Cargo stderr warnings, retaining package attribution, transcript validation and build/parser exit failures. Earlier narrative assurances that the warning gate was unchanged did not account for the reproduced dependency/stderr gap. Original successful jobs and failures remain historical; they are not relabeled as exercising the corrected complete policy. Five actual Cargo scenarios and the preserved pre-repair failures support that correction.

Certificate path assembly now scans trailing separators linearly while retaining coercion, separator choice, UNC/internal spelling, mixed paths and Unicode. The earlier five-second helper timeout remains recorded. It is not evidence that native file dialogs accept an operating-system-invalid path or that a remote actor can stall export.

The concurrent author's source-specific proof was **1,641/0/1 Node**, exact canonical **10/10 debug and 10/10 optimized**, warning regressions **11/11**, and certificate/path **32/32**. Independent read-only review did not repeat those executions. The new combined proof below is distinct.

## Profile provenance

| Existing model | Accepted evidence decision |
| --- | --- |
| [Xone:92 legacy Mk1](devices/allen-and-heath-xone-92.md) | AP5345 Issue 4 supports five-pin DIN MIDI **output**. Only DIN capability and additive provenance change; Mk2 material, USB/audio unknowns, IDs/maps and original checks are not substituted. |
| [Ecler WARM2](devices/ecler-warm2.md) | Exact manual 50-0421-0102 adds provenance; no capability changes. The 2+1-channel description agrees with the prior specification. An omitted MIDI connector is not proof of absence. |
| [DDJ-FLX10](devices/alphatheta-ddj-flx10.md) and [XDJ-RX3](devices/pioneer-dj-xdj-rx3.md) | Concurrent manufacturer-supported USB MIDI and separately labeled nominal audio/converter facts remain. Unknown USB channel counts and exhaustive stream-format lists stay unknown. |

Analog baseline evidence was **2 passed / 2 failed**, followed by **17/17** green. Root's source inventory confirms **19 unique existing profile IDs** covered by researched-profile contracts, including WARM2's provenance-only decision. Current coverage remains **45 devices / 506 handwritten / 187 generated / 693 total / 23 conditional audio cases / 0 gaps**. This is plan/provenance coverage, not physical, firmware, driver or host qualification.

The confirmed MIDI planning gap—inferring transport capability from the presence of a descriptor object—has a separate complete, frozen correction with independent read-only source review; combined qualification is pending. It is **not fixed in source 35**. Generic USB-oriented instructions also do not qualify the Xone:92 DIN route.

## Verification of the combined source

| Scope | Exact result | Limit |
| --- | --- | --- |
| First complete Node 22.23.5 serial run | **1,722 passed / 0 failed / 1 optional Mixxx-corpus skip; 1,723 total**, **146 test files**, **246.284718878 TAP seconds**, 246.36419718600519 wall seconds. Started **15:28:47.146354 UTC**, completed **15:32:53.567291 UTC**, 2026-11-18 | Exact source/tree named above; no focused counts added. |
| Source preservation | All **1,424 tracked hashes** and index tree matched after full/static proof | Documentation-only publication does not create new executable qualification. |
| Static gates, recorded **15:33:44.774519 UTC** | Device index, timecode, **24 migrations**, mobile copies, notices, generated coverage, GLib provenance/Cargo metadata, application and GLib-harness Rustfmt passed | No full local Tauri or packaged-platform build. |
| Syntax | All **402 tracked JS/MJS files** passed | Broader file inventory than the concurrent report's separately scoped 372-module check. |
| Separate monitor gate | **1/1**, **947.185655 ms TAP**, **2,400 hops**, mean **0.332 ms/hop**, worst **2.36 ms**, heap growth **0.06 MB** | Existing workload/budgets; not included in the ordinary-suite total. |
| Catalog/history/analog focused scopes | **196/196**, **67/67**, **17/17** respectively; root catalog seeder **1/1** | Overlap the complete suite; seeder is not Chromium. |
| Windows/Fleet focused scopes | Exact newline **6/6 each**, Linux path **2/2**; Fleet core **8/8** plus separate allocation **1/1** | Harness boundaries above; no current-source Windows, ASan or full-native pass inferred. |
| Independent acceptance | Source/diff/provenance and freeze hashes accepted; concurrent report and incoming source preserved | Read-only review is distinct from execution. |

The preceding source `32419404` retains its initial **1,657/1/1** process-SIGKILL run, unchanged isolated **6/6**, and later complete **1,663/0/1** rerun. Its exact durations, six unreported cases and unassigned cause remain in [checkpoint 34 qualification](DECKCHEK-RELEASE-READINESS.md#qualification-of-this-continuation). Earlier foundation, native, fuzz/stress and setup failures are also retained; no historical failed run is converted into a pass.

Unchanged local Chromium launch and full-Tauri prerequisite blockers were not retried. Broad Sonar, applicable successor hosted checks, hardware/driver and distribution qualification remain separate.

## Predecessor hosted outcomes

The decoded `2c9abbc` job logs check out synthetic merge `b13cceaab76132b0a40e4ed28c5018b447cae383`. Verified parents are integration `0acb612` and head `2c9abbc`; tree `a30d98ebc660686b165e7a7e652d63fdbedc90f3` equals that published predecessor. These are actual hosted outcomes for that tree, not source `3aa4d964`.

| Job | Observed result | Scope |
| --- | --- | --- |
| [Main Rust 134873705392](https://github.com/djshellshoxxx/deckchek/actions/runs/44324971600/job/134873705392) | **714/0/8 ignored**, **66.21 s**; optimized GLib **6/6**, complete warning gate, Cargo check and strict Clippy passed | Classified at **15:09:20.186 UTC**. |
| [JavaScript 134873706466](https://github.com/djshellshoxxx/deckchek/actions/runs/44324971600/job/134873706466) | **1,641/0/1 skip**, 1,642 total, **182.817433605 s**. Separate monitor **1/1**, **1.661895954 s TAP**, 2,400 hops, mean **0.586 ms**, worst **1.09 ms**, heap **0.06 MB** | Predecessor only; distinct from its author's local and the new combined runs. |
| [UI 134873705111](https://github.com/djshellshoxxx/deckchek/actions/runs/44324971600/job/134873705111) | **505/506 attempted checks passed**, then the **30,000 ms** option wait after Hum's empty-state check failed | Later flows did not complete. The source-35 attached-option change still needs successor Chromium execution. |
| [ASan 134873883429](https://github.com/djshellshoxxx/deckchek/actions/runs/44324971700/job/134873883429) | **714 passed / 0 failed / 8 ignored**, **189.81 s**; classified **15:36:57.783 UTC** | Verified pre-optimization `fleet.rs` hash `be5d0244ce2b9d1b15822f99f6f54a08e61eb2384871d8533e49dd0564992307`. Original timed regression passed. |
| [Windows 134873882840](https://github.com/djshellshoxxx/deckchek/actions/runs/44324971700/job/134873882840) | **704 passed / 4 failed / 9 ignored**, **142.51 s**; classified **15:42:23.447 UTC**. Same three CRLF-sensitive guards and Unix-only certificate fixture failed | Separate actual Windows PDF **1/1**, 716 filtered, **5.30 s**, five report pages. Unused `UserFileError` and default-icon resource diagnostics remain recorded. These results do not qualify the source-35 test fixes. |

The **15:09** snapshot had five queued nightly jobs; **15:33/15:36** showed ASan success, Windows running and three jobs queued. The later Windows classification supersedes that running state without erasing it. At the **15:33** release-workflow snapshot, Rust succeeded, JavaScript/UI were queued and tag-only `release-checks` was skipped. Queued/skipped stages are not passes; Snyk success is not broad Sonar evidence.

Older `e6a64d7` outcomes remain separately recorded: JS/Linux Rust and limited persistence success; UI, Windows and ASan failures; both old nightly fuzz jobs later cancelled. Earlier running snapshots remain historical, with no cancellation cause or completed combined fuzz/stress pass inferred. The `2c9` original-code ASan success establishes neither the cause of the older failure nor a reliable successor resolution.

## Evidence and continuation

Root's exact combined record is `continuation-35-final-integration-acceptance.json`, with `continuation-35-source-freeze.json`, `continuation-35-report-facts.json`, `continuation-35-full-js.log`, `continuation-35-post-suite-source-check.json` and `continuation-35-static/` under `/workspace/scratch/a884a1d6c4d8/verification`. Incoming preservation, slice, Windows and Fleet acceptance records identify the source hashes. Accepted freezes are `catalog-archive-freeze-20261118/`, `catalog-archive-integration-freeze-20261118/`, `history-active-navigation-freeze-20261118/`, `analog-mixer-provenance-freeze-20261118/`, `windows-ci-freeze-20261118/` and `fleet-allocation-freeze-20261118/`.

Remote facts are in `continuation-35-remote-inventory/`; exact predecessor classifications/logs, including late ASan and Windows results, retain their checkout identities. `continuation-35-researched-profile-count.json` records the nineteen actual IDs. The unchanged concurrent report's SHA256 is `063103f16f0537c59759dff7fe407db99aad169598f233eecf54648b8c256d63`.

Root owns publication after independent documentation review. At **15:50:31 UTC**, `midi_prerequisites` released the sole local test/build slot to root. Its separate MIDI transport slice is complete and frozen, with independent read-only review of its executable source, with combined qualification pending; it remains outside this checkpoint. Other remaining work includes native-only catalog authorities, stable MIDI identity, native support-history bounded-memory validation without weakening global-corruption refusal, surrounding metrics, broader physical isolation outcomes, PDF-embedded certificate JSON and advanced classifiers.

Keep PR30 draft until applicable successor gates and required reviews pass, then qualify the resulting PR27 candidate for main. Close superseded PRs only after their contribution-preserving replacement reaches main; PR31 remains preserved through the earlier `5ffa10b` parent. No release, tag, deployment, branch deletion, force push or history rewrite is included. Fleet stays OFF; output caps, migration history, original observations, warning policy and valid signed certificates are preserved.
