# DeckChek release readiness

## Current continuation — 20 November 2026

Read the [current continuation handoff](DECKCHEK-CONTINUATION-HANDOFF.md) and
[device outcome/trend report](engineering/DEVICE_OUTCOME_CONTINUATION_2026-11-20.md)
for completed six-worker acceptance, current source identities and remaining
qualification. The [hosted Fleet result](engineering/FLEET_GATE_HOSTED_RESULT_2026-11-20.md)
retains the failed diagnostic and unchanged 200 ms gate. The source41 material
below is a historical snapshot, not the current branch or merge queue.

<a id="current-source41-incident-evidence-profile-provenance-and-preview-integrity"></a>

## Historical source41 — incident evidence, profile provenance and preview integrity

**18 November 2026 (America/Los_Angeles).** Code `a0c116cbdbfa1bfb940a53d24332453dbe3e02a9`, tree `751ba0df2acde7e05a37d25927ef013543ffdace`. The [source41 report](DECKCHEK-CONTINUATION-41.md) records accepted learned-map profile identity, optional native incident latest-reading evidence, fifteen MIDI transport facts across fourteen profiles, and Push3's documented 16-in/16-out USB channels. Pack candidate checks passed 16/16, related 32/32 and unchanged independent 3/3; independent acceptance is **ACCEPT_FOR_INTEGRATION; all three findings resolved (review `7cf97921a5052faa32c669b154e5576682d50848ffe51c1596122876edb9f77f`)**.

Coverage is **45 profiles / 506 handwritten / 187 generated / zero gaps**, with **22 conditional audio profiles** and **3 conditional MIDI profiles / 9 requirements**. The complete serial Node 22.23.5 suite passed **1,975/0/1** (1,976 total; 162 top-level files; **257.854541805 TAP seconds**). All **11** local static/performance/syntax gates passed, including 426 syntax files and 25 migrations, with all **1,480** source hashes/tree unchanged before and after every gate. The report separately binds the prior bounded **45/45** native proof to this tree without claiming a new full Tauri run. Source39's three workflows and source40's primary workflow have completed successfully at their own exact trees; they do not qualify source41. No source41 hosted result or merge is asserted. Fleet stays OFF.

The dated source40 and earlier sections below preserve historical snapshots. Current feature/queue rows are updated separately; prior verification counts, failures and branch dispositions retain their original sources.

## Source41 qualification and release boundary

| Scope | Source41 state | Boundary |
| --- | --- | --- |
| Exact code/tree | `a0c116cbdbfa1bfb940a53d24332453dbe3e02a9` / `751ba0df2acde7e05a37d25927ef013543ffdace` | Documentation publication is a separate later head. |
| Complete serial JavaScript and inventories | 1,975 passed / 0 failed / 1 optional skip; 1,976 total across 162 top-level files on Node 22.23.5, 257.854541805 TAP seconds; all 1,480 source hashes and tree unchanged (record `13c24e29722dab5b487fc862ba34018ad232b2ba8d39c1c70c9b30407e704631`) | Focused component counts overlap and are not summed. |
| Static, coverage and authored browser-smoke syntax | All 11 static/performance/syntax gates passed, including 426 syntax files, 25 migrations and the 45-profile coverage check; all 1,480 source hashes and the tree matched before/after every gate | Syntax does not establish Chromium execution. |
| Both performance gates and inventories | 2/2 passed with all 1,480 source hashes/tree unchanged: controller 2,400 hops, 0.339 ms mean / 1.04 ms worst / 0.07 MB heap; monitor 2,400 hops, 0.329 ms mean / 1.29 ms worst / 0.06 MB heap (record `91ae72485525171783e1061ba945e3dc959d91bae25040f234baab9285ec673a`) | Proxy performance does not establish platform or hardware behavior. |
| Accepted native input/dependency carry | Verified 38 production inputs, 39 generated files, 52 application-lock identities and five direct dependency feature sets; carries bounded 45/45 and strict Clippy, not full Tauri/platform execution (record `736e13fc6bd413265948ac110c697c4b95bf9876914e1b71872836b5c181e69f`) | Incident 45/45 proof is a bounded harness, not local full Tauri execution. |
| Pack independent acceptance | ACCEPT_FOR_INTEGRATION; all three findings resolved (review `7cf97921a5052faa32c669b154e5576682d50848ffe51c1596122876edb9f77f`) | Persistent 16/16, related 32/32 and unchanged independent probe 3/3 passed with complete inventories. |
| Publication and applicable hosted checks | Prepublication snapshot at 2026-11-18 20:50:35 UTC: main/integration/PR32/PR33 unchanged; PR33 still draft against PR32; retargeting, successor publication, source41 hosted gates and merges pending | No source41 hosted result or merge is asserted. |

The [completed preceding checks](DECKCHEK-CONTINUATION-41.md#completed-preceding-hosted-checks) are exact-source evidence: source39 has all three workflows, Linux 730/0/8 ignored, Windows 724/0/9 ignored, browser 1,338/1,338 twice, six builds and five packaged self-tests; source40 has primary JavaScript 1,835/0/1, native 748/0/8 ignored and browser 1,347/1,347. Source40's review-branch base did not trigger platform/nightly. Linux x86 is build-only, ASan leak detection was disabled, native-fuzz actual counts/durations are unknown, and Actions artifact digest comparison is not an independent binary rehash.

The native-catalog browser cases use deterministic IPC fixtures. Separately executed full native tests do not convert that browser path into live Tauri/SQLite; inspected screenshots did not show the native archive controls. Broad Sonar, actual devices/reference measurements, owner workflows, interoperability, signing/distribution and final integration platform qualification remain open. Source41 is not declared release-ready. Fleet stays OFF; no release/tag/deployment is authorized.

<a id="current-source40-native-catalog-and-controller-provenance"></a>

## Historical source40 prepublication snapshot — 18 November 2026

Source [`20a8c342`](https://github.com/djshellshoxxx/deckchek/commit/20a8c34261d2aa801335a812fbc3c5987cf28587) adds selected native setup-catalog transfer and exact DDJ-REV1/REV5 provenance. The complete serial Node 22.23.5 suite passed **1,835/0/1** (1,836 total; 151 files; **253.593508232 TAP seconds**), with all **1,447** frozen files unchanged; local static/proxy gates passed, including **411** syntax files. The [source40 report](DECKCHEK-NATIVE-CATALOG-FOLLOWUP.md) records the accepted 18/18 bounded native core, 146/146 related Node scope, corrected chooser regression and all retained failures. Coverage remains **45 profiles / 506 handwritten / 187 generated / zero gaps**, with **23 conditional audio profiles** and **17 conditional MIDI profiles / 51 requirements**; reviewed provenance covers 25 existing profiles.

This is a **prepublication source40 snapshot**. Existing draft PR32 remains at published `cc15026a`; its verified primary browser **1,338/1,338**, cross-JavaScript **1,780/0/1** and ASan **730/0/8 ignored** results qualify that preceding tree, not the new catalog bytes. Root intends a distinct draft follow-up after documentation acceptance so PR32 can finish its current gates. No follow-up branch/PR number is assigned here. Native device-profile association, full new-source hosted/platform checks, broad Sonar and hardware remain open. Fleet stays OFF.

<a id="source40-qualification-and-release-boundary"></a>

## Historical source40 qualification and release boundary

Source `20a8c342` passed the complete 151-file Node suite **1,835/0/1**, 253,593.508232 ms TAP, with all 1,447 source files unchanged. Local static/proxy gates passed: device index, timecode, 24 migrations, mobile output, notices, coverage, GLib provenance metadata, application/GLib formatting and 411 syntax checks. The separate monitor passed 1/1 over 2,400 hops at 0.351 ms mean / 1.96 ms worst and 0.06 MB heap growth; unchanged budgets apply. [Exact native/profile scope and preserved failures](DECKCHEK-NATIVE-CATALOG-FOLLOWUP.md#combined-source40-qualification) remain distinct from full application and hardware qualification.

The published preceding `cc15026a` tree now has a full primary browser **1,338/1,338** pass, cross-JavaScript **1,780/0/1** and ASan **730/0/8 ignored** with leak detection disabled. The browser's deterministic native mocks and uninspected screenshot artifacts are not real desktop or hardware evidence. Those passes resolve the applicable source39 primary browser failure, while old raw failures remain intact. They do not qualify new source40 native catalog/chooser bytes, the queued second browser/native/Windows scopes, packaged-platform or broader security gates. Source40 is not release-ready; no release, tag or deployment is authorized.

> Historical source39 prepublication correction: [Logical MIDI identity and mixer provenance](DECKCHEK-LOGICAL-MIDI-FOLLOWUP.md). Source `04bbc714` passed the complete Node suite **1,780/0/1** and all local static gates, with **1,434** frozen files unchanged. The original **1,779/1/1** failure and corrected **16/16** profile scope remain separate evidence. PR32 already exists at `61e265f`; its hosted results and browser failures are preceding-source evidence. Publication of the correction remains pending.

<a id="source39-release-boundary"></a>

## Historical source39 prepublication release boundary

The [current qualification record](DECKCHEK-LOGICAL-MIDI-FOLLOWUP.md#combined-source39-qualification) retains the initial complete 1,779/1/1 failure and accepted note/anchor corrections; corrected source `04bbc714` passed 1,780/0/1 across 148 files in 249.818975973 TAP seconds, with all 1,434 files unchanged. Static gates passed, including 404 JS/MJS syntax files and 24 migrations. The separate monitor passed 1/1 in 1,056.991961 ms, with mean 0.363 ms/hop, worst 3.68 ms and heap growth 0.06 MB over 2,400 hops; unchanged budgets apply. The bounded native MIDI harness and retained JS scope are not full Tauri or physical qualification. Published PR32 has real Linux/Windows/JavaScript and limited persistence-stress passes, but both browser jobs failed 522/524 reached checks. The different PR30 cross-browser navigation failure reached 365/366 and remains separately unresolved. New smoke repairs have no browser pass. Source39 hosted/native-platform/browser, extended/security and hardware gates remain open; no release, tag or deployment is authorized.

> Historical source38 prepublication candidate: [Native support-history follow-up](DECKCHEK-NATIVE-HISTORY-FOLLOWUP.md). Source `fe936f7d` includes the accepted MIDI/profile source37 plus the native retained-memory correction. The complete Node suite passed **1,747/0/1** and local static gates passed; exact native-core/harness proof is separately scoped. Publication and current-source external gates remain pending; PR30 stays at `72dd38c`.

> Historical source37 follow-up: [MIDI transports and two AlphaTheta profiles](DECKCHEK-MIDI-PROFILE-FOLLOWUP.md). Source `2ec083c4` passed **1,747/0/1** plus local static gates. This prepublication source snapshot follows published checkpoint 35 at `72dd38c`; PR30 keeps that head. Source36, combined37 and preceding-head hosted results have separate evidence scopes.

> Published checkpoint 35 history: [Checkpoint 35](DECKCHEK-CONTINUATION-35.md). Source [3aa4d964](https://github.com/djshellshoxxx/deckchek/commit/3aa4d964bc4091a2c16aac042a9bce9b2f8aeec5) combines catalog transfer, history navigation, platform-test corrections, Fleet result ownership and the concurrent integrity/profile repairs. The serial Node suite passed **1,722/0/1**. Qualification and limits for that source are in that report; the sections below and the unchanged [057d42f report](DECKCHEK-CONTINUATION-2026-11-18.md) retain source-scoped history.

The [checkpoint 35 integrity account](DECKCHEK-CONTINUATION-35.md#concurrent-integrity-and-warning-repairs) supersedes earlier narrative assurances that the Cargo warning policy was unchanged: source `057d42f` reproduced and corrected the dependency/stderr-warning gap. Original job outcomes and failure rows below remain historical observations, not evidence that the earlier gate enforced the corrected policy.

<a id="current-source38-qualification-boundary"></a>

## Historical source38 qualification boundary

Source `fe936f7d` passed the complete serial Node suite **1,747/0/1**, applicable local static gates and the separately reviewed exact native-core/harness proof. The [current report](DECKCHEK-NATIVE-HISTORY-FOLLOWUP.md#combined-source38-qualification) records timings, unchanged source hashes, the allocator tradeoff and five harness/application transitive-lock differences. Full native application, current-source hosted/platform/Chromium, broad Sonar, hardware and packaging qualification remain open. The previous Windows pass remains scoped to published checkpoint35.

## Historical source37 qualification boundary

Source37 passed the combined Node and local static gates described in the [follow-up report](DECKCHEK-MIDI-PROFILE-FOLLOWUP.md#qualification-by-source). At the **16:26:45.220 UTC** hosted snapshot, published checkpoint35 `72dd38c` had a real Windows pass: **714/0/9 ignored**, plus a separate actual PDF **1/1**. The ten other non-tag jobs remained queued; tag-only release-checks was skipped. These outcomes apply to the published checkpoint35 tree, not source37. No current-source full native, Chromium, packaging, broad Sonar or hardware pass is claimed; all historical outcomes below remain intact.

## Historical checkpoint 34 — source 32419404

**Source checkpoint — 2026-11-18 UTC:** executable source `32419404fefdbbe95b91987c8bd606aa598e763b`, tree `cf87a10c3cb15cd041a6dfd806426c98c7487a29`, parent `963054dc543af018d0f13734a9e2abc54ca83113`. This 15-path update implements the separate browser venue-history archive through Data and the existing stores. The complete serial Node 22.23.5 rerun passed **1,663 tests, zero failures and one optional Mixxx-corpus skip (1,664 total; 259.849819454 TAP seconds)** across **141 test files**, with all **1,408 frozen files** unchanged. The initial full-run SIGKILL and isolated six-test pass remain recorded below; no termination cause is established. Research remains **15 existing profiles**, with **45 models, 506 handwritten checks, 187 generated checks and 23 conditional audio cases**.

At the **2026-11-18 14:19:57.475 UTC** pre-publication inventory, the owned remote branch was `963054d`, while [PR #30](https://github.com/djshellshoxxx/deckchek/pull/30) and its pull-head ref still reported `e6a64d7`; PR30 remained an open draft with mergeability **null/unknown**. A separately observed merge candidate names `963054d` and unchanged integration `0acb612` as parents. The discrepancy has no established cause. Source `32419404` exists but no branch has moved to it; the future documentation child has no assigned SHA. Main remains `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`, and PR27 metadata is untouched. Earlier successes/failures remain tied to their sources. Hosted native/browser/platform/extended checks, broad Sonar, hardware and release qualification remain open. No release, tag or deployment is authorized.

<a id="qualification-of-this-continuation"></a>

## Qualification of checkpoint 34

| Source and scope | Observed result | Boundary |
| --- | --- | --- |
| `32419404fefdbbe95b91987c8bd606aa598e763b` / tree `cf87a10c3cb15cd041a6dfd806426c98c7487a29` | Complete Node 22.23.5 serial rerun across **141 test files**: **1,663 passed, zero failed, one optional Mixxx-corpus skip; 1,664 total in 259.849819454 TAP seconds** (259.891702779 wall seconds). Started **2026-11-18 14:16:26.090577 UTC**, completed **14:20:46.247279 UTC**. All **1,408** frozen hashes and index tree matched | Complete current-source JavaScript proof; no executable bytes or assertions changed between the runs |
| Initial complete run on the same tree | **1,657 passed, 1 failed process, 1 optional skip; 1,659 total in 254.345283265 TAP seconds**. Existing `stylus-benchmark-windowing.test.mjs` received **SIGKILL at 33.52374439 seconds**, before reporting its **six** top-level tests; no assertion failure was reported | Failed evidence retained. Six unreported cases replaced by one process result explain the total-count difference. No termination/OOM cause is established |
| Isolated unchanged windowing file | **6/6 passed in 53.303801457 TAP seconds** | Separate bounded investigation before the complete rerun; does not erase or explain the initial termination |
| Current-source static gates, **14:14:36.100173 UTC** | Device index, timecode facts, **24 migrations**, mobile copies, notices, coverage, GLib provenance with Cargo metadata, application/GLib-harness Rustfmt and all **394 tracked JS/MJS syntax checks** passed | All 1,408 frozen hashes and index tree matched; coverage remains **45 profiles / 506 handwritten / 187 generated / 23 conditional / 0 gaps** |
| Separate monitor performance gate | **1/1 passed**, **1.425823241 TAP seconds**, **2,400 hops**, mean **0.534 ms/hop**, worst **65.28 ms**, heap growth **0.07 MB** | Existing workload and gates unchanged; the slower worst hop is retained, with no hardware/scheduling qualification inferred |
| Browser archive focused scope | **136/136 Node**, including **32** new archive/model/actual-Data tests; nine syntax checks. Root verified 12 worker and three integration paths; independent source review accepted the exact hashes | No native changes or new native proof. Focused scopes overlap the complete suite |
| Exact hosted-smoke fixture through production browser stores | **1/1 passed in 2.285489296 seconds**: **302/102/101 records**, 505 total, **1,739,901 UTF-8 bytes**; exact evidence after service recreation, zero duplicate/conflict writes, no fabricated catalog | Only three page-relative module imports relocated. This is Node fixture proof; real Data downloads, viewport and browser reload await hosted Chromium |
| Prior-head jobs, observed **14:09:47.139 UTC** | On `e6a64d7`, persistence stress succeeded; JavaScript job **134799347502** and Windows Rust job **134799397986** were running, eight other actual jobs queued, and `release-checks` skipped | This timestamped prior-head state does not qualify `32419404`; the earlier stress workload and exact checkout scope remain below |
| Current publication/external gates | At **14:19:57.475 UTC**, owned ref `963054d` differs from PR30/pull-head `e6a64d7`; PR30 is open draft, mergeability null/unknown, with empty reviews/comments. No branch yet points to `32419404` | Cause unestablished; no conflict or successful current-source hosted gate inferred. Full native, Chromium, packaged platforms, extended checks, broad Sonar, hardware and distribution qualification remain open |

The [archive implementation and retained behavior reds](DECKCHEK-CONSOLIDATION-REPORT.md#browser-venue-history-archive) are distinct from the complete-suite SIGKILL investigation. Evidence is retained in `continuation-34-{initial-report-facts,report-facts,windowing-isolated-facts,independent-smoke-facts,final-integration-acceptance}.json`, the corresponding logs and `continuation-34-static/results.json`. A documentation-only child does not create new executable qualification.

### Preceding-head hosted outcomes observed 14:30:20.694 UTC

The five decoded job logs explicitly check out synthetic merge `1350eb37793b188215dbd0133e10f17cd64b6ce2`; its verified tree `fd3d8a7c2d178465d8399d83371a61479023d4c2` equals published head `e6a64d73b47a1de2bf8886af06ab9ddbae047d79`. These results qualify only that preceding checkpoint. They do not qualify `90ee4435`, documentation child `963054dc`, or current source `32419404`. The earlier running/queued snapshots remain historical observations.

| Job and scope | Observed outcome | Remaining boundary |
| --- | --- | --- |
| Main JavaScript, [134799347502](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607797/job/134799347502) | **1,592 passed / 0 failed / 1 optional skip**, 1,593 total, **111.322297182 seconds**; separate monitor **1/1**, **1.006996013 TAP seconds** | Preceding executable tree only |
| Main Linux Rust, [134799347185](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607797/job/134799347185) | **694 passed / 0 failed / 8 ignored**, **59.46 seconds**; separate optimized GLib **6/6**. Warning, check and strict Clippy steps succeeded | No native qualification transfers to the later parser feature or support A/B code |
| Main browser smoke, [134799347217](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607797/job/134799347217) | **505/506 attempted checks passed**, then `page.waitForSelector` timed out after **30,000 ms** following the browser Hum empty-state check | The next explicit source wait targets `#incident-venue option[value="incident-smoke-venue"]`. Its default visible wait on a collapsed option is under investigation; later flows did not complete. Failure remains open |
| Windows Rust, [134799397986](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607805/job/134799397986) | **684 passed / 4 failed / 9 ignored**, **142.15 seconds**. Failures were the audio/MIDI off-main source scanners, the Windows bare-tool scanner and the certificate roundtrip fixture | Source review found three LF-only scanner delimiters and `/tmp/x.pdf`, which is not a Windows absolute path. Corrections remain pending verification. The separate actual Windows PDF spike passed **1/1 in 5.43 seconds**, generating five-page reports; the unused `UserFileError` warning and default-icon resource diagnostic remain recorded |
| Linux ASan, [134799398054](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607805/job/134799398054) | **693 passed / 1 failed / 8 ignored**, **187.44 seconds**. Fleet's **1,000-asset / 2,000-reminder** read took **234.014893 ms**, exceeding the unchanged **200 ms** gate | No sanitizer memory diagnostic appeared in the retrieved failure section; this does not clear the failed performance gate or establish its cause |
| Persistence stress, [134799397553](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607805/job/134799397553) | Previously recorded **3/3** pass, completed **13:17:47 UTC** | Limited persistence workloads only; exact workload/checkout evidence is retained in the preceding checkpoint below |
| Nightly fuzz jobs, [134799398056](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607805/job/134799398056) and [134799398380](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607805/job/134799398380) | Cargo fuzz and JavaScript fuzz/stress were still running at this snapshot | No completed combined extended result |
| [Release validation 44303607800](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607800) | JavaScript and Rust jobs succeeded; UI failed. `release-checks`, build, smoke and release were skipped | Skipped stages are not passes; no release, tag or deployment followed |

Evidence is `continuation-34-hosted-results.json` and the five `continuation-34-hosted-job-<id>.json` decoded logs. Root is investigating the concrete failures outside source `32419404`; no threshold, assertion, warning, skip or allowlist has been relaxed. Current-source hosted qualification and the publication/PR metadata discrepancy remain open.

## Qualification of the preceding 90ee4435 / 963054dc checkpoint

| Source and scope | Observed result | Boundary |
| --- | --- | --- |
| `90ee44350ae5f88c8fc49d9cddcff86a5c570a84` / tree `842c0606537b689c6ccef8687f2b456bc11e4487` | Node 22.23.5, serial across **139 test files**: **1,631 passed, zero failed, one optional Mixxx-corpus skip; 1,632 total in 245.990287222 TAP seconds** (246.056040696 wall seconds). Started **13:02:29.819778 UTC**, completed **13:06:35.993025 UTC** on 2026-11-18; all **1,402** frozen files and the index tree remained unchanged | Complete then-current JavaScript proof; the skip is the unavailable optional local corpus |
| Then-current source static gates | Device index, timecode facts, **24 migrations**, mobile copies, third-party notices, generated coverage, GLib provenance with Cargo metadata, application/GLib-harness Rustfmt and all **389 tracked JS/MJS syntax checks** passed | All 1,402 source hashes and the index tree still matched; no full native application or Chromium execution |
| Separate monitor performance gate | **1/1 passed**, **1.008011845 TAP seconds** (1.071 seconds tool wall), **2,400 hops**, mean **0.352 ms/hop**, worst **4.66 ms**, heap growth **0.06 MB** | Unchanged workload/budgets; no physical scheduling or hardware claim |
| Passive support A/B focused proof | **112/112 Node**, **19/19 exact production native**, separate **1/1 transport** and **1/1 exact-bit serialization** checks; strict harness Clippy passed. Root verified **29 native inputs** | Harness includes all **24 migrations**, excludes Tauri adapters and full desktop; focused scopes overlap the complete suite |
| Independent A/B and canonical checks | **1/1 differential test covering 42 JS/Rust vectors** and **9/9 unchanged production canonical/hash tests** passed; **1/1 exact hosted-mock/actual capture-model-store-report check** passed | The generated-input/mock check is not Chromium or hardware qualification |
| Xone:96/RANE FOUR research | Prior focused **32/32** actual library/plan checks passed after **1 pass / 3 fail** baseline red; independent source/preservation review accepted five paths, 16 original checks, 13 prior specs and 13 prior documents | **15 researched profiles**; catalog stays **45/506/187**, with **23 conditional audio cases**. No physical/firmware/host qualification |
| Preceding published head `e6a64d7`, observed **2026-11-18 13:16:40.198 UTC** | [Tests 44303607797](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607797), [nightly 44303607805](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607805), [release 44303607800](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607800): nightly `rust-stress` job [134799397553](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607805/job/134799397553) is **in progress**, on runner **1000061721** since **13:11:14 UTC**. Setup, checkout, stable Rust, cache and Tauri prerequisites succeeded; persistence stress has no result yet. **Ten other actual jobs remain queued**, runner 0/no steps; `release-checks` is skipped | Aggregate run responses still say queued; job detail establishes the running job. No queue cause or completed stress outcome is inferred. These runs do not qualify `90ee4435` |
| Persistence-stress follow-up, observed **2026-11-18 13:29:03.616 UTC** | The preceding `e6a64d7` [nightly job 134799397553](https://github.com/djshellshoxxx/deckchek/actions/runs/44303607805/job/134799397553) **succeeded**, completed **13:17:47 UTC** on runner **1000061721**. Decoded logs show `cargo test --locked --release --manifest-path src-tauri/Cargo.toml -j 4 --lib stress_tests -- --ignored --nocapture --test-threads=1`: **3 passed, 0 failed, 699 filtered out, 26.38 seconds**. Workloads covered concurrent backup/readers, **5,000 runs × 30 measurements** with backup/restore, and **10,000-run workspace import** | Checkout `1350eb37793b188215dbd0133e10f17cd64b6ce2` merges `0acb612` and `e6a64d7`; GitHub commit metadata verifies tree `fd3d8a7c2d178465d8399d83371a61479023d4c2` equals published `e6a64d7`. This is limited persistence stress, not a full native or broader extended pass, and does not qualify `90ee4435` or its new parser feature. Evidence: `continuation-33-prior-stress-success.json`. The earlier 13:16 running snapshot remains historical evidence |
| Prior Snyk commit status | `e6a64d7` reports success only for **“No manifest changes detected in 5 projects”**, updated **12:24:40 UTC** | `90ee4435` changes Cargo.toml's parser feature; that older status is neither qualification of the new manifest nor broad Sonar clearance |
| Then-current external gates | Hosted full native, browser, packaged-platform and extended fuzz/stress pending; broad Sonar, physical and distribution qualification open | No warning rule, timing budget, assertion, feature default or qualification requirement relaxed |

Implementation and preserved development failures are detailed in the [A/B report](DECKCHEK-CONSOLIDATION-REPORT.md#passive-support-ab-observations-and-comparisons) and [profile provenance](DECKCHEK-CONSOLIDATION-REPORT.md#xone96-and-rane-four-provenance). The following evidence remains tied to its preceding source, rather than qualifying this new tree.

## Qualification of the preceding 524d5357 / e6a64d7 checkpoint

| Source and scope | Observed result | Boundary |
|---|---|---|
| `524d5357a20faac03378fc9d267e85da13c8df52` / tree `a91b5cd67528dbb3439395996f36ce36332d26b3` | Node 22.23.5, serial across **136 test files**: **1,592 passed, zero failed, one optional skip; 1,593 total in 244.078776606 seconds**. All **1,390** frozen files remained unchanged | Optional unavailable local Mixxx controller corpus only; then-current combined JavaScript proof |
| Then-current source static gates | Device index, timecode facts, **23 migrations**, mobile copies, notices, coverage, GLib provenance with Cargo metadata and application/harness formatting passed; all **383 tracked JS/MJS files**, including mobile and repository helpers, passed syntax checks | No full native application or Chromium execution |
| Separate monitor performance gate | **1/1 passed**, **986.23624 ms TAP**; mean **0.345 ms/hop**, worst **5.06 ms**, heap growth **0.06 MB** | Unchanged budgets and workload; no physical scheduling or hardware claim |
| Corrected support/catalog scope | Worker **117/117 Node**, **14/14 native**; root's two actual Equipment reproductions pass after failing before the correction, and **17/17 exact native checks** pass (14 production plus 3 probes); strict Clippy passed; **27 native inputs** verified | Overlapping scopes are not added together; native harness excludes Tauri adapters and the desktop build |
| USB-MIDI provenance | Worker and root independently passed **23/23**; all 18 handwritten checks, 15 original specs, 18 original documents and complete audio objects preserved | 13 researched profiles; catalog stays 45/506/187 with **23 conditional audio cases**; no hardware qualification |
| Incident pagination and report integration | Isolated **40/40 Node**, **13/13 native** with strict Clippy; corrected combined incident/pagination/report scope **51/51** in **1.978781211 seconds**, with **26 native inputs** verified | Fixture correction creates two real supports; no assertion weakened. Exact smoke-mock/model bridge **1/1** is not Chromium |
| Preceding remote head `740fb78` | At **2026-11-18 11:56:42 UTC**, runs [44294062948](https://github.com/djshellshoxxx/deckchek/actions/runs/44294062948), [44294062998](https://github.com/djshellshoxxx/deckchek/actions/runs/44294062998) and [44294063010](https://github.com/djshellshoxxx/deckchek/actions/runs/44294063010) were queued: **11 jobs**, no assigned runner or steps. `release-checks` was skipped | No queue cause evidenced and no successful completed gate; run creation 11:22:12 / last update 11:22:13 UTC. These runs do not qualify changed source `524d5357` |
| Then-current external gates | Hosted full native, browser, packaged-platform and extended fuzz/stress remain pending; broad Sonar, physical and distribution qualification remain open | No warning, assertion, timing budget or qualification requirement relaxed |

The preceding implementation and bounded proof remain in the [consolidation report](DECKCHEK-CONSOLIDATION-REPORT.md). Historical failures and results below retain their original source attribution.

## Qualification of the preceding f0106e79 / 740fb78 checkpoint

| Source and scope | Observed result | Boundary |
|---|---|---|
| `f0106e79ffb8e7a97ca34787b559c12bafdab3cd` / tree `c96b17aee38f0f773c0b174dcfe5e42aaea1b811` | Complete Node 22.23.5 suite: **1,536 passed, zero failed, 1 optional skip (1,537 total; 229.581 seconds)**, across 133 test files with serial file execution; all 1,382 frozen files matched afterward | Then-current combined JavaScript source pass; the optional skip is the unavailable local Mixxx controller corpus |
| Then-current source static gates | Device index, timecode facts, **23** migration names, mobile copies, third-party notices, generated coverage, GLib provenance/Cargo selection, application and GLib-harness formatting all passed; syntax checks passed for all **380 tracked .js/.mjs files** | No full native application was built locally |
| Separate monitor performance gate | **1/1 passed** in 0.972 seconds; mean 0.334 ms/hop, worst 2.54 ms, heap growth 0.06 MB | Unchanged fixtures and budgets; a performance proxy, not physical hardware qualification |
| Manual incident independent review | **103 Node** and **10 native storage** checks passed with zero failures/skips; the sole review clarification was applied to browser concurrency wording | Exact production storage core and real migrations; Tauri adapters and real Chromium execution remain outside the local proof |
| Five additional manufacturer-researched profiles | Independent scopes **14/14** and **11/11** passed; all **45** profiles retain **506** handwritten checks, **187** generated checks and zero plan gaps | **23** conditional audio cases remain; software planning is separate from device qualification |
| Previous published head `5ffa10b` | Before the 740fb78 publication, runs [44284164319](https://github.com/djshellshoxxx/deckchek/actions/runs/44284164319), [44284164266](https://github.com/djshellshoxxx/deckchek/actions/runs/44284164266) and [44284164421](https://github.com/djshellshoxxx/deckchek/actions/runs/44284164421) remained queued | Those queued workflows supplied no then-current-source native, browser, platform or extended result |
| Then-current hosted and external gates | Native, browser, packaged-platform, extended fuzz/stress and broad Sonar remain open at publication | No gate, warning rule, timing budget, assertion or qualification requirement was relaxed |

The prior `1943ef0` source passed 1,500/0/1 in 230.785 seconds. The `0acb612` ancestor separately passed 674 application Rust tests with eight ignored, six optimized actual-GLib tests, warning/check/strict-Clippy gates, 1,428/0/1 JavaScript tests and 1,293/1,293 browser checks. These remain source-scoped historical evidence. Earlier failed/killed parallel, stress and fuzz attempts are retained below and in release readiness; no clean full stress or combined long-fuzz pass is claimed. Broad Sonar evidence remains unavailable. Snyk's prior no-manifest-change status is not a comprehensive security analysis.

## Qualification of the preceding 1943ef0 continuation

| Source and scope | Observed result | Boundary |
|---|---|---|
| `1943ef024bdc6abfe4ac32b4c368b764b75a0c86` / tree `c0b6a7033318eeb646cfb2c49e7f05029ece653d` | Complete Node 22.23.5 suite: 1,500 passed, zero failed, 1 optional skip (1,501 total; 230.785 seconds); serial file execution; source hashes unchanged | Then-current combined JavaScript source pass |
| Then-current focused/static checks | Device index, timecode facts, migration numbering, mobile vendor copies, third-party notices, generated device coverage and all 352 JavaScript module syntax checks passed. Application and GLib regression-harness formatting passed; the GLib source/provenance check with Cargo metadata passed. The separate monitor performance test passed 1/1 in 0.956 seconds, observing mean 0.328 ms per hop, worst 1.04 ms and heap growth 0.06 MB under its unchanged budgets. | These checks do not substitute for current hosted native or browser execution |
| Integration `0acb612`, standalone run [44273893598](https://github.com/djshellshoxxx/deckchek/actions/runs/44273893598) | **674** application Rust tests passed, zero failed/eight ignored; **6** optimized actual-GLib tests passed; fmt, warning check, cargo check and strict Clippy passed. JavaScript **1,428 passed, zero failed, one skipped**, 91.216 seconds; separate performance case passed. Browser **1,293/1,293**, no console errors | Root retrieved job logs; CI merge `c03501c` and `0acb612` have identical tree `536fda86a7b14d348b4855c893e87e368ed85c00`. This does not qualify later source automatically |
| Integration platform caller [44273893490](https://github.com/djshellshoxxx/deckchek/actions/runs/44273893490) | Browser **1,293/1,293**, no console errors; later platform/native/package outcomes are tracked separately | The successful browser job alone is not packaged-platform acceptance |
| Foundation `25e91e9` / tree `b2c36fc` | **1,431 passed, zero failed, one skipped**, 123.913 seconds | Historical reviewed foundation, before the newer GLib/monitor and guided corrections |
| Integration report at `5960099` | Its author recorded **1,428/0/1** in 125.033 seconds after a prior serial **1,424/0/1** run at `e43be06` | Attributed historical local evidence, independently followed by the `0acb612` hosted results above |
| Earlier parallel integration repeat | **1,340 passed, nine failed, one skipped**: eight SIGKILL workers and certificate timing 1,707 ms against its unchanged 1,000 ms limit | Failed evidence retained; termination cause was not proven |
| Full stress and combined long fuzz | Unqualified on the current source | Preserve the completed individual target budgets and every failed/killed attempt; no budget or assertion was relaxed |

Current broad Sonar evidence remains unavailable. The latest checked integration external status is Snyk's “No manifest changes detected in 5 projects”; it is not a fresh comprehensive security or Sonar analysis. Local full native compilation still lacks required development metadata, and local Chromium launch remains blocked by the observed socket restriction. Supported hosted workflows provide these prerequisites. No unchanged blocked launch/build was retried.


## Historical qualification record

The following retained record describes its named earlier revisions. Current source evidence is above; intermediate guided failures and older pending gates remain dated historical observations.


Audit session: 2026-11-17, America/Los_Angeles. GitHub evidence timestamps are UTC. This report distinguishes the retrieved PR #26 baseline from subsequent local corrections.

## Foundation decision at 25e91e9 (historical)

**Release readiness is not established.** Reviewed source `25e91e97fa2311e2e786894344297ccdc19ca849` preserves the lifecycle/ZIP/WASAPI corrections and the reviewed GLib/native-MIDI integration, adds the independently checked compiler-diagnostic gate and stress isolation, and passes 1,431 complete-suite JavaScript tests with one optional skip. Its own native, browser, extended and packaged-platform CI remains required. Guided-stylus measurement corrections are still unpublished and blocked on independent acceptance. Broad Sonar, physical qualification and distribution acceptance remain open. No release, release tag or deployment is authorized by this session.

| Revision | Role |
|---|---|
| `ee5aa511fb49fc56e299d5b5c262e815ab420d0d` | Retrieved canonical `main` |
| `4466cc0bb9951a98528f576726e01dd9cecc388e` | Retrieved PR #26 head, `nodata/practical-ptolemy-wu3ekp` |
| `integration/deckchek-consolidation-20261118` | Remote integration branch in [PR #27](https://github.com/djshellshoxxx/deckchek/pull/27), initially at the PR #26 head; subsequent corrections require their own verification |

## Verified baseline evidence

These results were retrieved from GitHub job logs, not inferred from a green PR badge. They apply to `4466cc0bb9951a98528f576726e01dd9cecc388e`.

| Check | Observed result | Evidence |
|---|---|---|
| JavaScript unit/property/regression/fuzz-smoke | 1,300 total; 1,299 passed; one optional skip; zero failures | [Job 134547155889](https://github.com/djshellshoxxx/deckchek/actions/runs/44228369554/job/134547155889) |
| JavaScript performance budget | One test passed, zero failures | Same JavaScript job |
| Linux Rust unit/migration/fuzz-smoke | 654 passed; eight ignored; zero failures | [Job 134547155655](https://github.com/djshellshoxxx/deckchek/actions/runs/44228369554/job/134547155655) |
| Compiler-warning gate | Passed | Same Rust job |
| Browser smoke | 1,276/1,276 checks passed; no console errors | [Job 134547155903](https://github.com/djshellshoxxx/deckchek/actions/runs/44228369554/job/134547155903) |
| Snyk status | Success with the description “No manifest changes detected in 5 projects” | [Commit status](https://api.github.com/repos/djshellshoxxx/deckchek/commits/4466cc0bb9951a98528f576726e01dd9cecc388e/status) |

The Snyk status does not establish a fresh comprehensive dependency audit. Ignored Rust cases and the optional JavaScript skip remain visible; they are not counted as passes.

## Earlier local verification and environment

A task-local Rust toolchain was installed without changing system permissions: `rustc 1.100.0 (0ef1bc386 2026-11-09)` and `cargo 1.100.0 (3acc79c0c 2026-11-05)`, including rustfmt and Clippy.

| Command or scope | Observed result |
|---|---|
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` | Passed after dedicated mechanical formatting of 47 Rust files. The original baseline had 2,318 formatting diff blocks. CI at `ed512a1` also passed formatting. |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml -j 2` | Blocked, exit 101, while building `glib-sys 0.18.1`: `glib-2.0.pc` was not found. No application Rust tests ran locally. |
| `cargo check --locked` and `cargo clippy --locked --all-targets -- -D warnings` | Not retried locally after the concrete native dependency blocker. CI results and the final candidate's remaining gates are distinguished below. |
| Fleet timestamp regression, before correction | 21 passed, four failed. An earlier PASS could hide a later FAIL when UTC timestamps used different fractional-second precision. |
| Fleet timestamp regression, after correction | 25/25 tests passed with `node --test tests/fleet.test.mjs tests/fleet-api.test.mjs`. Independent integration review accepted the change pending the full suite. |
| Population pack privacy, independent review | 13/13 focused tests passed with `node --test tests/pack-randomness.test.mjs tests/pack-population.test.mjs`. Additional direct assertions confirmed native UUID generation, preservation of supplied IDs without crypto, and rejection when secure randomness is unavailable. |
| Compiler-build pipeline correction | An isolated shell reproduction showed the previous `cargo build` pipeline converted exit 23 to exit 0. Adding `set -o pipefail` preserves exit 23; the warning check remains intact. This proves error propagation, not successful native compilation. |

The host also lacks the WebKitGTK, GTK, and ALSA development metadata required by the Tauri build. The runtime-prescribed system package helper is unavailable. The task user did not alter sudo, sandbox policy, repository package sources, or system package configuration. Installing Rust alone does not satisfy these native prerequisites.

The repository's JavaScript tests use Node's built-in runner and `package.json` declares no npm dependencies. No `package-lock.json` exists at the baseline, so `npm ci` is not an applicable dependency installation gate there. Run the actual `npm test` script.

The local population-pack correction generates new identifiers with `crypto.randomUUID()` or 16 bytes from `crypto.getRandomValues()`. It removes timestamp/`Math.random` fallback generation. Existing valid contributor identifiers and supplied pack IDs remain unchanged. Missing secure randomness rejects fresh generation before contributor state is written; a failed reset retains the previous identifier. The correction passed independent source review and the focused tests above; complete final-head verification remains a separate gate.

## Security and analysis gates

The retrieved PR #26 head has only the three application check runs above. No current Sonar result was attached to it.

| Historical Sonar scope | Observed result | Disposition |
|---|---|---|
| PR #14, `9f4928a00a44b62529429d1f14ad104b65db28c6`, check `123949755970` | Failed: D reliability and D security; 50 annotations | Findings retrieved and triaged against current source; the broad hold is not waived. |
| PR #16, `6bd93e2d1ceb2ff878521de58188cb39d5833c36`, check `124031174223` | Failed: C reliability; four annotations | Findings retrieved; later child checks do not clear the consolidated scope. |

The public GitHub annotations were readable. The public Sonar issues API returned HTTP 403, so no complete current Sonar issue export was available through that route. No authenticated analysis result was fabricated, no finding was accepted in Sonar, and no quality-gate rule was disabled.

Some historical annotations describe intentional behavior: SHA-256 uses modular 32-bit arithmetic, canonical JSON needs locale-independent UTF-16 ordering, and JSON round-trip fixtures test exact preservation. Replacing those operations mechanically would introduce defects. Genuine findings require a reproducing test and a correction; each false-positive disposition needs its rationale. See `DECKCHEK-SECURITY-AUDIT.md` for the integration findings and remaining work.

## Cross-platform status

| Target | Older `main` evidence | PR #26 and later corrections |
|---|---|---|
| Windows x64 | Packaging succeeded in [run 41046292289](https://github.com/djshellshoxxx/deckchek/actions/runs/41046292289) | Current package and packaged-app smoke not established |
| Windows x86 | Same older run succeeded | Current package and packaged-app smoke not established |
| macOS Apple silicon | Same older run succeeded | Current package and packaged-app smoke not established |
| macOS Intel | Same older run succeeded | Current package and packaged-app smoke not established |
| Linux x64 | Same older run succeeded | Current package and packaged-app smoke not established |
| Linux x86 | Same older run succeeded | Current package not established; configured workflow explicitly lacks runtime smoke on an i386 WebKitGTK stack |

These older successes must not be reused as proof that the consolidated head is qualified. The current cross-platform workflow triggers on PRs into main, main pushes, release tags, and manual dispatch. Its manual branch execution builds artifacts without publishing a release; release publication is conditional on a `v*` tag. The current nightly workflow adds Windows Rust/PDF tests, AddressSanitizer, longer fuzzing, and stress tests. No run of that complete workflow on this candidate was observed during this audit.

### Historical failures distinguished from application regressions

- **Windows:** [job 124018903070](https://github.com/djshellshoxxx/deckchek/actions/runs/41042631169/job/124018903070) failed `processes::tests::live_tasklist_parses` with `scan timed out after 20 seconds`; 424 tests passed, one failed, five were ignored. The failing command was process enumeration through `tasklist.exe`, while `system_check::windows_tests::real_scans_run_within_timeout` passed. Runner contention is a hypothesis, not a proven root cause. The failure cannot be cleared by weakening the timeout or deleting the test.
- **macOS ARM:** [job 123985120862](https://github.com/djshellshoxxx/deckchek/actions/runs/41032319845/job/123985120862) failed in `taiki-e/install-action` before application compilation. Its fallback attempted to remove a nonexistent `cargo-binstall` binary. The candidate workflow already replaces that installation route with pinned `@tauri-apps/cli@2.12.1`; a current successful platform run is still required.

## Hardware and distribution acceptance

No physical MIDI Identity Reply, audible General MIDI source, FS-35 loopback, native input/output device, controller mapping, driver, or reference-media measurement was exercised in this environment. Deterministic fixtures and mocked browser IPC do not satisfy hardware qualification. Follow `docs/testing/HARDWARE-TEST-SCRIPTS.md` and retain measured provenance.

Windows installers and macOS packages remain unsigned; macOS notarization is not established. Auto-update, installation/upgrade/uninstallation checks, real-database restore rehearsals, and platform privacy prompts require their documented acceptance evidence. Fleet remains opt-in and default OFF (`app/features.js`).

## Required next gates

1. Complete focused integration fixes and rerun the JavaScript/browser suites on the final source commit.
2. Resolve and recheck the broad Sonar findings for the consolidated scope.
3. Formatting is corrected; pass the explicit native test, check and Clippy gates on the final source using supported Tauri prerequisites. Resolve current dependency findings without suppressing the audit.
4. Obtain cross-platform packages and packaged-app smoke results for that same candidate, plus the applicable Windows/native reliability, fuzz, and stress checks.
5. Complete the physical hardware and distribution acceptance tasks separately. Record anything still unqualified instead of converting it to a pass.

This report does not authorize a tag, release, deployment, branch deletion, force-push, or gate bypass.

## Continuation verification

The reviewed source through `742c67ab93ab52baafa278cc48c6ca7c6d0a8df7` includes FS-35/36, fleet, certificate and population-identifier corrections. FS-35 focused tests passed **51/51 on Node 22.23.5**, and the independent reviewer also passed 51/51 on Node 24.22.1. MIDI focused suites passed **75/75**, fleet **25/25**, certificate **37/37**, and pack **13/13**. These overlapping focused counts are not added into a new total.

[Initial integration CI 44250832064](https://github.com/djshellshoxxx/deckchek/actions/runs/44250832064), at `ed512a17b24c3d678a405e728660ad64e75aa225`, compiled the native app and ran **653 Rust tests successfully, with one failure and eight ignored**. The failure was an existing source-string check that assumed the guarded window-builder call occupied one line. The correction retains that security relationship and ignores whitespace; a mutation check rejects guard removal. A subsequent full Node 22 run found a second whitespace-sensitive source assertion for registered link commands: **1,324 passed, one failed, one skipped**. Its regex was corrected to allow Rustfmt line breaks while retaining all three required commands and the navigation guard. These failed runs are retained as evidence, not relabeled as passes.

The new FS-35 browser smoke uses injected I/O to exercise actual browser focus, keyboard cancellation, capture-integrity verdicts and separate channel plots. It does not establish physical audio accuracy. See the handoff for the latest source SHA and completed CI results.

### Runtime and workflow-access limits

An intermittent cubic-distortion failure reproduces on the untouched `4466cc0` baseline under Node 24.22.1. Immediate reanalysis of identical samples produces the expected result. Its root cause is unconfirmed; it must not be reported as a proven JIT defect. The unchanged tolerances pass the focused Node 22.23.5 run, matching CI's major runtime version. Broader runtime qualification remains open.

The GitHub connector can create commits/PRs and read checks but exposes no workflow-dispatch operation. Local `gh`/Git have no authenticated push/dispatch session. An attempted UI fallback reached the actual platform workflow page but showed a signed-out session with no Run workflow control. Manual platform validation was not dispatched. The later concurrent commit `2243af7` adds PR-triggered platform validation; its permissions and release conditions were independently reviewed, and the caller/direct concurrency collision is corrected in the reconciled candidate. No credentials or permission policy were changed.

### Dependency analysis before the source backport

The targeted dependency update removes all seven original vulnerability records from both application and fuzz lockfiles without ignoring advisory IDs. Both audits exit zero, with one GLib unsoundness warning and five maintenance notices remaining. SQLite/ZIP compatibility checks cover the actual 22 migrations, rollback, legacy data, online backup and archives in both old/new reader directions. The existing third-party notice generator and check pass. These focused checks do not replace the final native application, fuzz or platform gates; the unresolved GLib warning remains explicit in the security audit.

### Explicit Clippy gate

At `742c67a`, [native job 134624238498](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624238498) passed **654 Rust tests** (eight ignored), the compiler-warning check and `cargo check`. The new strict Clippy gate then failed with **57 diagnostics** across production and test targets. Commit `2243bbb34e21c198390ef32806f813329a5e3dc1` contains independently reviewed corrections, with no lint allowances or changed thresholds. Differential checks cover numeric boundaries, 512 UTF-16 decoder byte vectors and stable sorting. The gate remains open until the complete application passes current CI; a unit-test pass or isolated differential test does not override it.

### Browser verification at the audio correction

[Browser job 134624237913](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624237913) at `742c67a` passed **1,283/1,283 checks**, with no console errors. All seven new FS-35 checks passed: focus/progress, Escape ownership, Enter/Stop behavior, unsaved cancellation, clean evidence and output cap, fault evidence requiring REVIEW, and opposite response errors with file provenance. This resolves the new browser-test execution gap for that source. It does not establish native device or physical-loopback qualification.

### First reviewed native candidate

The first native code candidate was `2243bbb34e21c198390ef32806f813329a5e3dc1`, comprising dependency correction `1ad6a34`, restore-schema correction `c387ae9` and the strict Clippy cleanup. On its working-tree source, Node 22.23.5 again passed **1,325 tests, zero failures, one optional skip** (1,326 total), and Rust formatting passed. The schema fix passed an independently rerun seven-test exact-validator harness, including the 64 KiB allocation guard and historical database fixtures. The dependency fix passed a separate seven-test migration/backup/archive compatibility harness and an old ZIP reader/new archive check. These focused results do not count as a full native build.

### CI at `730d71d` and reviewed follow-ups

[Run 44256004004](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004) on report commit `730d71d83c911317abba2fa205962cdbd15aa8db` completed with:

- [JavaScript job 134637728702](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728702): **1,325 passed, zero failures, one optional skip**, plus a passing performance check, migration/profile/mobile checks and syntax checking.
- [Browser job 134637728622](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728622): **1,283/1,283 passed**, no console errors.
- [Native job 134637728404](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004/job/134637728404): formatting passed; compilation failed with **E0428**, because a new tuple alias reused the existing `DriverScan` struct name. No application Rust tests ran, and check/Clippy were not reached. Commit `8acaa7a` corrects only the alias and parser return annotation, preserving the IPC struct; independent review accepted it.

The next complete code candidate is **`00f1f3cc8d96527f436ee28958ed23201b60a01b`**. It also includes independently reviewed service request/navigation ownership, native duplicate-name selection and mapper save-association corrections. The complete local Node 22.23.5 suite passed **1,338 tests, zero failures, one optional skip** (1,339 total), and full Rust formatting passed. Independent focused evidence includes 48 service checks, 47 mapper checks and 19 actual-body native MIDI harness checks, with additional reviewer edge probes. Those overlapping counts are not added to the full-suite count. Fresh complete application CI is required before this candidate can be treated as passing.

### CI at `1b1db16` and next reviewed source

[Run 44258246462](https://github.com/djshellshoxxx/deckchek/actions/runs/44258246462) completed with:

| Check | Observed result |
|---|---|
| [JavaScript job 134645034742](https://github.com/djshellshoxxx/deckchek/actions/runs/44258246462/job/134645034742) | **1,338 passed, zero failures, one optional skip**; performance, migration/profile/mobile and syntax checks passed |
| [Browser job 134645035183](https://github.com/djshellshoxxx/deckchek/actions/runs/44258246462/job/134645035183) | **1,283/1,283 passed**, no console errors |
| [Native job 134645035196](https://github.com/djshellshoxxx/deckchek/actions/runs/44258246462/job/134645035196) | Formatting and compilation passed; **662 tests passed, one failed, eight ignored**. The lying-header ZIP test expected the application's overrun code, but ZIP 9 now refuses the chunk earlier as `corrupt`. Compiler-warning/check/Clippy steps were not reached. |

The next reviewed source is `eb45ab8fecf100ddf50ef4d4bd6e09fc2ad27a98`. Certificate/Verify and monitor lifecycle corrections add 29 behavioral cases. The full local Node 22.23.5 suite passed **1,367 tests, zero failures, one optional skip** (1,368 total); full Rust formatting passed. The ZIP streaming body is unchanged and has direct guard tests plus four independently killed mutations. The preserved full archive/restore checks require new native CI.

### Long local verification: incomplete, retained for investigation

The repository's long-fuzz command used seed `20261118`, 120 seconds per target and the unchanged 2,000 ms per-input limit. Phone-run failed a wall-time check after 189,189 executions (5,995 ms); backup-manifest failed after 1,585,164 executions (3,052 ms). Workspace, media-import, media-state and catalog-state each completed 120 seconds without a reported failure. The process then exited 137 before canonical reported a result; later targets were not reached. The saved files are 469 and 292 bytes, and repeated exact-input replays did not reproduce the 2-second failures. The backup case exits at invalid JSON parsing. No validator exception or confirmed root cause is established.

`DECKCHEK_STRESS=full` with the existing stress/performance suites passed the monitor performance case, then the stress child received SIGKILL after about 13.5 seconds. No full stress acceptance result was produced. Kernel OOM evidence is unavailable; memory pressure, scheduling, runtime behavior and other causes have not been established. The initially concurrent runs are retained as failed/incomplete evidence. No time or memory budget, assertion or production validator was relaxed.

Standalone canonical replay subsequently completed the unchanged 120-second budget and 2,000 ms input gate on Node 22.23.5: 501,593 executions, no error, exit 0, maximum RSS 152,500 KiB. Both saved slow inputs passed 30,003 exact replays each. These results do not establish why the original process was killed. The remaining and previously timed-out targets are being run sequentially in fresh processes with unchanged budgets; no full long-fuzz pass is claimed yet.

### Historical reconciled qualification at `8c1409e`

Code `8c1409ef390aeb7c0899a82becbaabe82d45c116` combines both corrective histories. A separate checkout excludes ongoing FS-12 edits; its complete Node 22.23.5 suite passed **1,377 tests, zero failures, one optional skip**, and Rust formatting passed. All ten concurrent JavaScript regression cases independently failed on the previous code. Eleven independent native compatibility/accounting checks and six ZIP stream checks also passed; these overlap other suites and are not added into an application-test total.

The PR platform trigger now provides an automatic validation route. Its first observed remote run, [44261217684](https://github.com/djshellshoxxx/deckchek/actions/runs/44261217684), was queued at `1d2b488`; the direct [test run 44261217633](https://github.com/djshellshoxxx/deckchek/actions/runs/44261217633) was cancelled. A discovered concurrency-key collision is corrected in the reconciled source, but no particular cancellation is attributed to it without run-specific evidence. New native tests/check/Clippy, browser and all configured platform build/smoke results remain required.

## Follow-up CI and resource evidence

| Source / check | Observed result | Scope |
|---|---|---|
| `9475ac5`, [native job 134666843341](https://github.com/djshellshoxxx/deckchek/actions/runs/44264888010/job/134666843341) | 670 tests passed, zero failed, eight ignored; formatting, compiler-warning and type checks passed; Clippy failed one example helper with eight arguments | Validates the lifecycle/ZIP native candidate. `fd39b14` corrects the example but requires new CI. |
| `ef49ed6`, [browser job 134668697340](https://github.com/djshellshoxxx/deckchek/actions/runs/44265442094/job/134668697340) | 1,293/1,293 checks passed; no console errors | Remote implementation before the corrective guided-screen/native-IPC smoke. It does not qualify the new follow-up. |
| `ef49ed6`, local GLib source/selection review | Exact 267,679-byte original archive hash verified; 121 files and 1,717,584 original bytes compared; only the official two-line source fix differs; six integrity tests and all three locked Cargo selections passed | The optimized actual-crate regression later passed in CI; package qualification still requires the corrected full gate. |
| `ef49ed6`, independent native MIDI harness | 22 tests passed using production bodies and fake driver boundaries; deleting the pending-open generation guard fails the queued-close regression | Covers software ownership, not physical MIDI identity or hot-plug qualification. |

### Long JavaScript fuzz budgets

All 13 targets have now completed an unchanged 120-second budget across retained attempts on Node 22.23.5, seed `20261118`, with the original 2,000 ms per-input gate. Target implementations/harnesses remain unchanged. This is **not a clean single all-target invocation**: the original timing failures, two exit-137 terminations and the later mapper slow-call failure remain part of the evidence.

| Target | Completed 120-second attempt / executions |
|---|---:|
| phone-run | 3,908,643 |
| workspace | 3,193,268 |
| backup-manifest | 5,811,003 |
| media-import | 3,866,537 |
| media-state | 4,283,214 |
| catalog-state | 3,656,407 |
| canonical | 501,593 |
| pack | 4,800,817 |
| midi-message | 4,976,551 |
| certificate | 4,488,055 |
| mapper-xml | 876,343 |
| mapper-vdj | 1,608,351 |
| device-profile | 1,636,561 |

The initial phone and backup slow inputs each passed 30,003 exact replays. A later 636-byte malformed mapper XML input exceeded the gate at 2,813 ms after 848,479 executions; the exact input then passed 30,003 replays (median 0.0523 ms, p99 0.1378 ms, maximum 2.375 ms), returning the expected XML syntax error. The full retry passed with maximum RSS 157,024 KiB; device-profile passed with 153,084 KiB. The observed mapper failure coincided with major faults, shrinking file-backed RSS and blocked-process samples, but these observations do not establish the specific cause of its slow call or the earlier kills. No parser fix or relaxed budget was justified by replay evidence.

### Full stress remains unqualified

The original concurrent full-stress attempt was killed after about 13.5 seconds; the cause was not observed. A subsequent **serial unchanged** attempt passed the performance case (mean 0.343 ms/hop, worst 1.39 ms, 0.06 MB growth) and then lost the stress child to SIGKILL after 9.364 seconds, before any stress-case result. The observed child peak was 870,596 KiB and process-tree peak 964,980 KiB. The host-wide `oom_kill` counter increased 89 to 90 immediately before the child disappeared, with rising major faults/system CPU. This strongly supports memory pressure for this retry. Kernel attribution is denied and no cgroup mount is exposed, so neither the exact victim/quota nor the original kill's cause is proved.

A separate source-level accounting defect uses the process-lifetime `maxRSS` for every later case, contaminating their independent budgets with earlier peaks; the sampling interval cannot observe synchronous JavaScript while the event loop is blocked. The correction under review isolates each unchanged workload in a fresh Node test process. It preserves every fixture, duration, assertion and budget. Full workloads must run on suitable CI infrastructure; no further local full-run retry is justified. An accidentally executing discovery probe was stopped and retained as non-qualification evidence. No successful full-stress claim is made.
## Reviewed foundation qualification

| Check | Exact evidence | Disposition |
|---|---|---|
| Complete Node 22.23.5 suite | Source `25e91e97fa2311e2e786894344297ccdc19ca849`, tree `b2c36fc3774831859a9d2073e657ec7f013d66d1`: 1,431 passed, zero failed and 1 optional skip (1,432 total; 123.913 seconds); serial test-file execution; source hashes unchanged after execution | Pass for this combined source |
| Warning/profile/planner regressions | 19 passed, zero failed; 0.229 seconds | Pass |
| Actual Cargo warning fixtures | Six states correctly distinguish app/dependency warnings, replay cached warnings, and reject compiler errors | Pass for gate behavior, not a native application build |
| Independent shell failure injection | Seven cases preserve exact failures; complete 90,112-byte stderr retained and displayed when available; root build-exit-23 case also passed | Pass |
| `ef49ed6` native CI | Both [platform-caller run](https://github.com/djshellshoxxx/deckchek/actions/runs/44265442094) and [standalone run](https://github.com/djshellshoxxx/deckchek/actions/runs/44265441929): six optimized GLib tests and 670 app tests passed, eight ignored; warning grep then failed on 34 dependency warnings | Historical source evidence; corrected gate needs current CI |
| `ef49ed6` JavaScript/browser CI | 1,391 JavaScript passes, zero failures, one skip; 1,293/1,293 browser checks | Historical source evidence; new source needs CI |
| Full stress | Serial unchanged run killed before first stress result; worker quick split run passed six cases, but an independent quick repeat failed three of six amid large timing/memory disturbance | Unqualified; preserve all logs and run full unchanged workloads on CI |
| Guided-stylus intermediate review | Earlier 12 reference/lifecycle probes and three targeted storage cases pass; coherent-offset follow-up has one control pass and three expected-eligibility failures | Blocked; intermediate source not published |

The initial complete combined-source run had 1,430 passes, one failure and one skip: rewriting two profile identity notes had accidentally removed their research-seed provenance marker, so the existing 37-profile research check counted 35. The truthful marker was restored in those two profiles without changing the assertion, and the complete suite was rerun on the corrected tree. The failed run is retained as `accepted-foundation-js-initial-profile-marker-failure.log`.

The host-wide OOM counter also increased during the successful quick run, so its increase beside the full-stress death cannot by itself identify the victim or establish a quota. The failed quick repeat recorded canonical JSON at 41,302 ms against 15,000, quick diagnostics at 13,580 ms against 10,000, and a SIGKILL in the vinyl case; performance, wear-map and workspace-import cases passed. No budget or fixture was relaxed. A prematurely started combined-suite run used an incompletely prepared checkout, was stopped, and is retained only as invalid setup evidence.

Automatic PR triggers now expose the existing platform and extended gates on the owned follow-up branch. A source commit, a queue entry or a completed build is not a packaged runtime pass. Broad Sonar, platform artifact/self-test, Windows/PDF, sanitizer, full stress, long combined fuzz, hardware and distribution qualifications retain their explicit limitations. No release, tag or deployment is authorized or performed.


## Manual venue incidents — implemented software slice

The Incidents tab in Hum and feedback implements the seven operator categories in SPEC-05 §20: Skip, Feedback, Hum, Needle jump, Dropout, Booth shock and Other. The event ID, occurrence time, selected venue/setup context and note are copied at the press. Persistence assigns a separate save time and operator provenance. New submissions require an existing venue and any selected setup to belong to it. The historical snapshot survives catalog renaming, setup movement and deletion; an exact retry returns the original event before consulting the current catalog.

The browser model and production panel are `app/venue-incidents.js` and `app/ui/workflows/venue-incidents.js`; native append/list/page storage is `src-tauri/src/venue_incidents.rs`, registered through the existing application entrypoint. Additive migration `0023_venue_incidents.sql` retains historical context without cascading catalog deletion. Native writes serialize conflicting IDs in an immediate SQLite transaction. Browser requests use one key per event and recheck overlapping requests within one JavaScript event loop; localStorage does **not** provide atomic compare-and-set across tabs deliberately sharing a new ID. Production panels generate a UUID for each press and retain the same draft for retry.

Unknown schema fields/provenance, invalid calendar times, incompatible context, invalid limits and oversized notes are rejected. Corrupt or unavailable incident storage produces an explicit error without replacing retained records. Pending saves keep their original context across selection/tab changes; late loads and disposed panels cannot take ownership of newer UI. The panel shows at most **100 incidents per page** with Older/Newer/Newest; the API accepts limits up to **500**, and venue reports include the newest **300**. Each surface reports counts and retained older records. Equipment and Runs venue-report entrypoints load this history, escape context/notes and propagate incident-read failures. A successful empty list states only that no incidents were recorded.

The nine explicit acceptance criteria are recorded in [FS-15 §12](specs/15-booth-feedback-hum-hunter.md#12-manual-venue-incidents--spec-05-20-acceptance-slice-2026-11-18). For the initial incident slice, worker final model/UI/report checks passed **27/27** after an earlier bounded **99/99** hum/feedback regression scope. Independent review passed **103 Node checks**: 27 focused, 72 existing hum/feedback regressions and four additional production-flow probes. It separately passed **10 native storage checks**: seven production tests plus three independent probes. These overlapping scopes are not added to the full-suite total. The native harness copies the exact production validation/save/list core, actual migration transaction/clock/ID helpers and all **23** migrations. It caught and fixed the SQLite COUNT decoding compilation error; its strict Clippy check passed. Independent probes covered simultaneous conflicting IDs through separate database connections, retry after catalog deletion, Unicode ordering, malformed storage and actual 301-row UI/report truncation.

This native proof excludes Tauri command adapters and the full desktop build. The authored browser smoke exercises a real record/reload/Equipment-report path, but current-source hosted execution remains pending. Native incidents participate in the existing complete SQLite database backup. Browser incident keys are **excluded from workspace JSON export/import**; the panel discloses that limitation and the readable venue-report limit. Pagination, passive support A/B and the [separate browser venue-history archive](DECKCHEK-CONSOLIDATION-REPORT.md#browser-venue-history-archive) are implemented. Current browser catalog portability was added in [checkpoint 35](DECKCHEK-CONTINUATION-35.md#browser-equipment-catalog-transfer). Native-only catalog authorities, surrounding-metric capture and broader SPEC-05 isolation outcomes remain open. No physical booth accuracy or automatic incident-detection claim is made.

## Accepted support, MIDI and pagination follow-up

Equipment now saves reusable support descriptions and setup assignments while preserving legacy structure, hidden booth/position context and valid component settings associations. Explicit asset replacement clears its former settings link; bound setups cannot change venue. Reports label support descriptions as current context and stop on failed/missing hum-run detail reads. The actual browser hum store rejects unreadable history and failed writes instead of fabricating an empty history or overwriting corrupt bytes. The corrected worker scope passed **117/117 Node**; root's two UI reproductions and **17/17 native checks** passed with **27 inputs** verified. See [the support correction and limits](DECKCHEK-CONSOLIDATION-REPORT.md#saved-support-descriptions-and-setup-integrity).

Incident pagination retains the original save/list contracts and report cap. Exclusive timestamp/Unicode-scalar ID cursors, request-owned page stacks and recoverable retries preserve records, selections, notes and pending saves. The isolated **40/40 Node + 13/13 native** proof and root's **51/51** combined incident/report proof are separate overlapping scopes. Integration first reproduced **0/4** because the new fixture had not created its referenced supports; adding two real support records preserved every assertion. Browser navigation smoke is authored, not executed Chromium evidence. See [pagination evidence](DECKCHEK-CONSOLIDATION-REPORT.md#browsing-retained-venue-incidents).

APC40 MKII, TRAKTOR KONTROL F1 and nanoKONTROL2 now record documented USB MIDI only. All complete audio objects and the shipped Korg unknown-audio fixtures remain intact; conditional audio stays **23**. Root independently passed **23/23**, preserving all 18 original checks, 15 specs and 18 documents. The unverified Korg copyright-year assertion was removed; F1 MIDI/NHL and Akai protocol-ID/USB-ID distinctions remain explicit. See [manufacturer provenance](DECKCHEK-CONSOLIDATION-REPORT.md#three-additional-usb-midi-provenance-decisions). Browser history portability is implemented through the [separate archive](DECKCHEK-CONSOLIDATION-REPORT.md#browser-venue-history-archive); a separate current-catalog file was added in [checkpoint 35](DECKCHEK-CONTINUATION-35.md#browser-equipment-catalog-transfer). The [passive A/B slice](DECKCHEK-CONSOLIDATION-REPORT.md#passive-support-ab-observations-and-comparisons) makes no physical support-performance claim.

## Guided stylus measurements and provenance

The original guided workflow in `3e85ab5` is retained with reviewed corrections to capture ownership, setup membership, native field observations before compatibility defaults, calibration applicability and structured History persistence. Missing counters remain unobserved rather than zero. Starting a new request or selecting another stylus prevents stale success/error completions from taking ownership. A dispatched History or benchmark save is not described as a reversible operation. Explicit Save writes once; an all-null benchmark cannot be saved.

Independent review reproduced three successive numerical defects: prefix-only frequency validation accepted a correct introduction followed by an out-of-tolerance remainder; nominal-frequency projection cancelled coherent 999/1001/1002 Hz references and corrupted THD/separation; then rectangular leakage from a pure 2001 Hz harmonic produced an apparent absent fundamental at about −69.422 dBFS, passing the unchanged −70 dBFS floor. The final guided method is **`hann-measured-reference-power-v3`**, analysis version **3**. It keeps the nominal 1000 Hz declaration separate from measured frequency, covers every sample with complete windows of at most 0.5 seconds, and applies the same coherent-gain-normalized periodic Hann weights to presence, THD and active/leakage amplitudes. Sample-weighted powers are pooled before one calibration pass. Rectangular and nominal projections remain diagnostic observations; none are pruned.

Per-window coefficient sums, coherent gain, equivalent noise bandwidth and effective sample count are retained. The existing THD noise formula uses effective samples, and the existing separation leak-noise term widens with bandwidth. Chain/gain terms, untapered Level-0 uncertainty and ordinary analysis retain their previous behavior. There is no uncertainty reduction for window count. In the tested 10.1-second 48 kHz uncalibrated fixture, expanded THD uncertainty widened from 0.118433 to 0.119887 percentage points, and separation from 2.240042 to 2.554737 dB. These are fixture results under the existing assumed-noise model, not measured hardware accuracy.

The pure 2001 Hz-only reproduction now retains its rectangular observation but measures approximately −179.650 dBFS on the qualified amplitude basis, leaving separation unavailable and the benchmark excluded. Genuine strong harmonics, poor or negative separation, and measurable fundamentals just above the floor remain evidence, rather than being filtered into favorable outcomes. The ±0.3% frequency criterion, −70 dBFS presence floor, harmonic observability policy, safe-output cap and native storage bounds remain unchanged. Version-2 guided baselines are distinguished from the new method; original rows and explicit operator-confirmed legacy behavior are retained.

Worker verification passed **154/154** focused cases with no failures/skips, including **57** generated production workflows and **12** full ordinary-analysis comparisons. Independent serial Node 22.23.5 probes passed 2/2 prior reproductions in 11.710 seconds and 10/10 additional controls in 27.296 seconds, covering 33 complete production workflows and 102 structured History writes. These checked every retained field through JSON roundtrips, weak and absent fundamentals, adverse valid measurements, analytic power pooling, calibration, uncertainty and version compatibility. The reviewer matched the twelve frozen source hashes before execution; its later transport disconnect prevented its own post-test read, which root independently completed with all twelve hashes matching. These overlapping scopes are not added into a larger test count. The complete combined-suite result for this source is recorded above.

Local run evidence retains complete window objects; benchmark detail uses a named, lossless column encoding. Exact JSON roundtrip checks compare every retained field and value. Independent calibrated optional-timecode fixtures used **58,046**, **59,271** and **58,664** bytes at 10, 10.1 and 10.5 seconds respectively, below the unchanged **65,536-byte** limit. Oversized metadata blocks saving without discarding observations. Structured History and local analysis metadata do **not** imply archival of full PCM. New browser smoke is included but its current-source execution remains a hosted gate at publication. Physical cartridge/reference-record repeatability remains unqualified.

## Exported ledger verification facts

The retained low-severity R4-21 finding was reproduced through the actual script extracted from an exported `renderLedgerHtml` page: a valid signature/hash result omitted the certificate facts it had checked. The page now snapshots integrity primitives and canonical payload bytes before awaiting cryptography. Bounded verdict, tester, serial and issue-time text comes from that same canonical snapshot. The result labels these as hash-checked content; the key fingerprint is separately identified as coming from the certificate's signature block. Existing signature-success, unavailable and invalid wording remains explicit. Hash mismatch/invalid content does not display checked facts. Rendering uses text content and preserves the export's privacy choices.

Three additional actual-page regressions reproduced an older paste verification overwriting a newer verification or validation error. A request generation now owns the paste result; the listed-certificate comparison uses the recomputed checked hash. Canonical JSON ordering, SHA-256 arithmetic, seven cryptographic/canonical helper bodies, existing signed bytes and offline/CSP behavior remain unchanged. Worker verification passed **56/56** focused ledger/hash/privacy checks with no failures/skips, including **nine** actual exported-page scenarios. Root independently reviewed the production handler and all nine actual-page scenarios, confirmed the seven canonical/cryptographic helper bodies were unchanged, and executed the new scenarios as part of the complete combined suite. Three new browser smoke assertions remain pending hosted execution at publication. This clarification does not authenticate a tester's real-world identity or make an editable exported page tamper-proof.
