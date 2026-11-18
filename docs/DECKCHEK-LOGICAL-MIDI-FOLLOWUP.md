# Logical MIDI identity and mixer provenance follow-up

## Source and publication scope

Source **`04bbc7146f09dc2d1ebd0a6b403d4549d4d6f26b`**, tree **`6ad69adfb09d7df98076fb7d8a204bf7710287fd`**, adds explicit logical MIDI endpoint selection, shared Runner/Mapper input ownership, exact-model DJM-450/DJM-900NXS2 provenance and three browser-smoke corrections. Its parent is published PR32 head `61e265f536f9e5c5a2b78175eff6d3fdac62dd47`. The corrected complete serial Node 22.23.5 suite passed **1,780/0/1**, and all local static gates passed, with every **1,434** frozen source file and the index tree unchanged. The original failed tree and its evidence are retained below.

[PR32](https://github.com/djshellshoxxx/deckchek/pull/32) is the existing open draft from `review/deckchek-midi-profile-20261118` into `integration/deckchek-consolidation-20261118` at `0acb612aa796f7f459172932868ff7e787d83399`. Publication of this corrected source is pending. The intended action is to fast-forward that PR to the documentation child after independent review, preserving its history. The **2026-11-18 18:17:57 UTC** inventory recorded **29 branches and 26 PRs (11 open, 14 merged, one closed unmerged)**; PR32 had no reviews or inline comments. PR30 remains at `72dd38c8bcc941ec33dbe567b8a74f858682ab82`; main remains `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`. PR27 metadata, workflow filters and the canonical integration-to-main path are unchanged. No merge, release, tag, deployment or Fleet enablement is claimed.

The [source37 MIDI/profile report](DECKCHEK-MIDI-PROFILE-FOLLOWUP.md), [source38 native-history report](DECKCHEK-NATIVE-HISTORY-FOLLOWUP.md), [checkpoint35](DECKCHEK-CONTINUATION-35.md) and [concurrent November 18 report](DECKCHEK-CONTINUATION-2026-11-18.md) remain byte-exact historical records. Their prepublication statements describe their original snapshots; PR32 now exists. Their successful gates do not automatically qualify this checkpoint.

## Logical endpoint selection and ownership

[FS-36 §7](specs/36-general-midi-test.md#7-explicit-logical-endpoint-selection) defines the software contract implemented in the [bridge](../app/midi.js), [native MIDI module](../src-tauri/src/midi.rs), [Devices runner](../app/ui/devices/midi-runner.js) and [Mapper](../app/ui/screens/mapper.js). Enumeration retains an opaque backend endpoint ID, human name and display-order index. Ownership keys include backend, direction and ID; matching raw IDs in the input and output lists do not establish a device pair. Index is not identity.

| Operation | Current contract |
|---|---|
| Explicit `open({id})` / `close({id})` | Select or close one logical input. A supplied display name or index cannot rescue an unavailable, malformed or colliding ID. Close remains input-only. |
| Legacy `open('name')` / `close('name')` | Exact, case-sensitive unique-name selection or the captured alias; missing or ambiguous names cannot silently select another endpoint. |
| `send({id}, bytes)` or legacy named send | Capture one logical output. Subsequent sends and cleanup retain that output's ownership; a failed/disappeared binding stays retired until explicit reset. |
| `closeAll()` | Explicitly reset bindings and retired outputs, while invalidating earlier pending work. |
| Events and status | Retain human `port` names and name arrays; add observed `portId` and open input/output ID arrays. ID-selected capture status requires ID membership. |

Native name-read failure remains distinct from a successfully read empty name. An ID does not override a failed native name read. Opaque string ID `"0"` is valid; missing/empty/malformed/colliding IDs are rejected. A legacy backend without IDs remains usable only through unique names. An optional backend selector must match the active backend.

Runner and Mapper retain an explicit ID through enumeration reorder. A disappearing selection remains unavailable; a replacement requires deliberate selection. Duplicate names are independently selectable only through distinct usable IDs and do not establish automatic output pairing. The stricter explicit-output policy for generated conformance without confirmed USB MIDI remains in force. Saved results/maps retain human names and may record observed ID/backend without asserting a portable physical binding.

The shared pending-input claim and close-barrier ledger prevents stale opens or disposal from closing a successor's same-ID claim, including transitions between Runner and Mapper. Mapper preserves a pre-existing input and does not infer ID ownership from name-only status. Callbacks, saved results and cleanup stay attached to the captured selection.

This establishes logical software routing. It does not establish physical device identity, equivalence across machines or OS re-enumeration, hot-plug continuity, DIN-attached equipment identity, real hardware behavior or the separate MIDItest consumer integration. Those contracts and qualification remain open.

### Retained review findings and proof

The independent review found concrete lifecycle defects before accepting the final source. Failed evidence remains available; overlapping focused counts are not added to the combined suite.

| Finding / scope | Retained failure and correction |
|---|---|
| Native R1: reuse generation | An older close could remove a successfully reused native input because reuse did not advance the binding generation. Root's exact-body probe failed **0 passed / 1 failed**, with 31 filtered. Advancing the generation monotonically preserves the existing callback/alias/connection while preventing that older close. |
| JavaScript R2: cached legacy-name replacement | A pending legacy-name open could survive its close when enumeration changed from the cached old ID to a replacement ID. The independent probe failed **0 passed / 1 failed**. Persistent cases went from **1 passed / 2 failed** to **3/3**; original legacy-name cancellation now remains separate from canonical-ID ownership. |
| Native R2 follow-through | Review2 still allowed the analogous native replacement after actual close forgot the cached alias. Root's probe failed **0 passed / 1 failed**, with 34 filtered. Review3 retains original legacy-name close intent independently of aliases and checks it before enumeration and after resolution. The exact probe passed **1/1**, with 37 filtered; two additional body probes changed from **1 passed / 1 failed** to **2/2**. Independently chosen explicit IDs remain unaffected. |
| Final native / wire harness | **38 passed / 0 failed**: 24 production tests, 13 bounded lifecycle probes and one actual-serde wire test. All 34 review2 cases/assertions remain. The added generation case passed **1/1** separately. Locked offline all-target strict Clippy and formatting passed. |
| JavaScript review2 scope, retained in review3 | **255 passed / 0 failed / 1 existing optional skip**, 256 total across 14 files. Review3 changed only the native module; this is retained evidence with unchanged JS/test hashes, not a new JavaScript run. |

Final acceptance is `midi-logical-identity-independent-review3.json`; independent review was read-only. The author executed the final harness commands. Its 11 non-root dependencies match application names, versions and checksums, including actual serde 1.0.229 and serde_json 1.0.151. The normal non-test harness build retains the existing manifest-level serde_json unused-dependency warning; all-target strict Clippy passed. This does not assert a warning-free full application.

The harness uses exact production bodies/core with controlled driver/Tauri/dispatch stubs. A post-resolution enumeration hook stages the actual close-generation prefix while open holds the connection lock; it is not a complete concurrently executing Tauri close. No full Tauri, browser, hardware, physical-identity or performance qualification is derived from these probes.

## Mixer provenance and unchanged unknowns

| Profile | Supported change | Preserved limits |
|---|---|---|
| [Pioneer DJ DJM-450](devices/pioneer-dj-djm-450.md) | Operating manual **DRI1406B**, p11, explicitly documents outgoing control MIDI/clock through USB, supporting `usbMidi: true`. Quick Start **DRH1395C**, p13, records nominal 48 kHz and converter resolutions separately. | USB audio input/output counts, USB rate list/word length, receiving/Identity behavior, DIN, IDs, class compliance, maps and firmware/OS qualification remain unknown. |
| [Pioneer DJ DJM-900NXS2](devices/pioneer-dj-djm-900nxs2.md) | Quick Start **DRH1330C**, pp9/14, supports the label **“USB Type-B computer connections”** for the existing count of two. Nominal 96 kHz, 32-bit master D/A and other 24-bit A/D/D/A observations have their own provenance. | USB MIDI remains unknown because separate MIDI and USB descriptions do not establish the route. USB stream counts/rate list/word length and DIN remain unknown. No unavailable manual/chart is treated as proof of absence. |

Root visually verified four decisive primary pages. The source documents and PDF hashes are recorded in the profile notes. Manual filename revisions are not firmware or publication-date qualification. Both existing mixer audio plans remain major, retain their −12 dBFS limit and were not conditional controller-audio plans. All 12 handwritten checks and unrelated profile fields are preserved. The DJM-900NXS2 existing spec key/value/source/confidence remain; its label and explanatory note are deliberately corrected. Nominal rates and converter resolution are not promoted into host USB formats.

The isolated profile baseline was **5 passed / 6 failed**; the unchanged focused tests then passed **11/11** in **95.24091 ms**. The combined run subsequently caught a separate classification regression: both new identity notes had removed the original research-group marker. Root added only the truthful prefix `Research seed. `, retaining every capability, unknown, source and handwritten check. Independent static comparison confirmed original group membership **37 → 35 → 37**, with every test/assertion unchanged and only those two IDs restored. The corrected affected scope passed **16/16** in **174.558445 ms**.

The actual generated matrix remains **45 profiles / 506 handwritten / 187 generated / 693 total / 0 gaps**, with **23 conditional audio rows**. DJM-450's three transport conditions are resolved, leaving **19 conditional MIDI profiles / 57 requirements**; DJM-900NXS2 remains conditional. Reviewed provenance now covers **23 existing profiles**, without hardware qualification. The generator succeeded once. Two root metadata postchecks refused their own incorrect assumptions about display-model row keys and warning-bearing stdout; their records remain and are not product/generator failures.

## Browser failures and smoke corrections

Published PR30 and PR32 main browser jobs reached **522/524** passing checks, then reported the incident workspace-scope assertion and a generic 30-second selector timeout. Both PR32 browser jobs have that outcome. The timeout's probable location is inferred from source control flow; the captured logs did not identify the selector or retain final failure DOM. The reviewed artifact contains 63 screenshots and no failure DOM. Later flows did not complete. The older runner's console tally covered only modules that returned, so it cannot establish a clean console for the failing module.

Three reviewed source changes address the concrete assertion/control-flow issues and improve evidence: the incident assertion matches the actual capitalized scope copy; closed-select option-presence waits in incident pagination and support isolation use `attached`; and the runner records the active module/full stack while labelling the console tally as completed modules only. `selectOption`, downstream assertions, timeouts and failure exit behavior remain intact. These corrections have no browser pass yet.

A different PR30 cross-platform browser job reached **365/366** and failed because `page.evaluate` lost its execution context during navigation. Its cause is unassigned. It is not the incident-scope/closed-select failure and is not represented as fixed by these changes.

## Combined source39 qualification

| Source / scope | Observed result | Boundary |
|---|---|---|
| Original tree `1bdaa0d50a1f68e9694cd1386303edb1f3a57426` | Complete serial Node 22.23.5: **1,779 passed / 1 failed / 1 optional Mixxx-corpus skip**, 1,781 total across 148 files; **252.92599699 TAP seconds**, **253.05484555200383 wall seconds**. Started 18:02:35.554719 and completed 18:06:48.654347 UTC on November 18. All 1,434 frozen files unchanged. | Existing research-seed assertion expected 37, received 35. The failed run/source remain immutable. |
| Corrected source `04bbc714`, tree `6ad69adfb09d7df98076fb7d8a204bf7710287fd` | Complete serial Node **22.23.5**: **1,780 passed / 0 failed / 1 optional Mixxx-corpus skip**, **1,781 total**, **148 files**; **249.818975973 TAP seconds**, **249.885184716004 wall seconds**. Started **18:10:33.027767**, completed **18:14:42.952188 UTC**. All **1,434** hashes/index unchanged. | The two note prefixes and historical FS-36 anchor are the only amendments to the failed candidate. Focused **16/16** remains a separate overlapping scope; no assertion/capability was weakened. |
| Corrected-source static gates, **18:15:19.781107 UTC** | All passed: **404** tracked JS/MJS syntax files, **24** migrations, device index, timecode facts, mobile copies, third-party notices, generated coverage, GLib provenance/Cargo metadata and application/GLib-harness formatting. | Exact corrected-source checks; no full local Tauri or Chromium retry. |
| Separate corrected-source monitor | **1/1**, **1,056.991961 ms TAP**, **2,400 hops**, mean **0.363 ms/hop**, worst **3.68 ms**, heap growth **0.06 MB**. | Unchanged budgets; not added to the complete-suite total. |

The compatibility anchor restores five legacy §6 links after the heading became historical; all spec prose remains unchanged. The corrected source still comprises 19 paths and 1,434 tracked files. Independent amendment records distinguish static acceptance from runtime proof. No project execution was performed by the documentation/review author.

## Published-head hosted observations

Root's initial log-backed snapshot was observed **2026-11-18 18:06:36 UTC**; the final job-state snapshot for this report is **18:18:49 UTC**, with changes recorded below. PR32 jobs checked out synthetic merge `f79469809addc809e4577c572bc4eeaff3f0294e`, whose tree equals published `61e265f` tree `0b3d19283dafd38f13ac875783c1726f9d99ed88`. PR30 jobs checked out merge `005256dbd2fa0af92fa0045842fb9cbf813558aa`, tree `d074ab4a983a30e5a783297042ab9cc47e583ca8`, matching `72dd38c`. None qualifies this checkpoint's changed source.

| Published head / job | Observed result |
|---|---|
| PR32 `61e265f`, Linux Rust 134980526751 | **723 passed / 0 failed / 8 ignored**, **71.16 s**; actual optimized GLib **6/6**, formatting, warning gate, locked check and strict Clippy passed. |
| PR32, cross-platform Linux Rust 134980526908 | **723/0/8**, **72.06 s**, actual GLib **6/6** and corresponding static/warning gates passed. |
| PR32, JavaScript 134980527036 | Node **22.23.4**, **1,747/0/1**, 1,748 total, **184.458310673 TAP seconds**. Separate monitor **1/1**, **1,620.077654 ms**, 2,400 hops, mean **0.579 ms**, worst **0.95 ms**, heap **0.06 MB**. |
| PR32, Windows 134980527886 | **717/0/9 ignored**, **145.82 s**. Separate actual WebView2 PDF case **1/1**, 725 filtered, **16.89 s**, five report pages. |
| PR32, persistence stress 134980527315 | **3/3**, 728 filtered, **28.51 s**: concurrent backup/readers, 5,000 runs × 30 measurements with backup/restore, and 10,000-run import. Limited persistence stress, not every extended gate. |
| PR32, main/cross browser 134980526279 / 134980527674 | Each **522/524 reached checks**; scope assertion plus timeout. Later flows incomplete; no new smoke qualification. |
| PR30 `72dd38c`, JavaScript 134939711708 | Node **22.23.4**, **1,722/0/1**, 1,723 total, **130.822418311 TAP seconds**; separate monitor **1/1**, **1,208.742216 ms**, mean **0.434 ms**, worst **1.39 ms**, heap **0.06 MB** over 2,400 hops. |
| PR30, Linux Rust 134939712067 | **720/0/8 ignored**, **46.79 s**, actual GLib **6/6**, formatting/check/strict Clippy passed. |
| PR30, earlier Windows / PDF | **714/0/9 ignored**, **140.68 s**; separate actual PDF **1/1**, 722 filtered, **4.15 s**, five report pages. |
| PR30, main browser 134939712441 | **522/524 reached checks**; same scope assertion and generic selector timeout. |
| PR30, cross browser 134939715450 | **365/366 reached checks**; execution context destroyed during navigation. Separate unresolved failure. |

At the **18:06:36 UTC** observation, PR32 ASan 134980527720, cargo-fuzz 134980527965 and cross-JavaScript 134980527780 were queued; JavaScript fuzz/stress 134980527996 was running. Tag-only release checks were skipped, not passed. Snyk's success means only “No manifest changes detected in 5 projects”; no broad Sonar check was present.

**Follow-up, 18:18:49 UTC:** PR32 has six completed non-tag successes: two Linux native jobs, two JavaScript jobs, Windows and persistence stress. Cross-JavaScript 134980527780 completed successfully at 18:17:35; this additional success is metadata-confirmed here, without an invented test count or log-derived checkout. Both browser failures remain. ASan and cargo-fuzz are queued; JavaScript fuzz/stress is running. Packaged smoke 135027154924, build 135027155591 and release 135027155635 are skipped. The [unchanged workflow](../.github/workflows/cross-platform-release-validation.yml) requires the reusable test gate before build and build before packaged smoke; release and release-checks are separately tag-only. A skipped job is not a platform/release pass. PR30 persistence stress 134939897232 now reports success in metadata; ASan, cargo-fuzz and JS fuzz/stress are running, while cross-JavaScript/native remain queued. Its two distinct browser failures are retained. These states are tied to published heads, not source39.

## Evidence and continuation

Evidence is under `/workspace/scratch/a884a1d6c4d8/verification`. Retain the original `continuation-39-source-freeze.json`, `continuation-39-report-facts.json` and full log alongside `continuation-39-corrected-source-freeze.json`, corrected results and static gates. The two amendment directories and independent review records preserve exact byte comparisons. The documentation freeze records their hashes and protected historical reports.

| Record | SHA256 / scope |
|---|---|
| Final source39 integration acceptance | `07d9423b810b4934083b5972f4e402435ae5d689589f297bf9c693a01added88`; accepted at **18:20:14.056302 UTC** |
| MIDI review3 manifest | `1d44a1ae89319be116ebc9b601e387c8a39cb40ce24608396daf977869b4bc0d` |
| `midi-logical-identity-independent-review3.json` | `e70598c542bbc88501de1c3f4eee73fcaf0b489f5b41015fd1c7c1f7852ce1f2` |
| Original DJM profile manifest | `4e2ebff8ae772c989934c672e19aae511d619f5c3f783308b8c992b39a70b42b` |
| Independent research-marker amendment | `d7587d886bc98b916b6813d91b462696abfedbd0f296fcb1344b0b82b3d13938` |
| Independent historical-anchor amendment | `389bd88dc2ab8c6980ae7fa2bd81968528a20499d713ed0432ad2f868f9de9bb` |
| Corrected combined-run facts | `b85b8e1ab5978442e0fa84ccf8c1a6d7cdb4f201ebe8dc63fde33e44bf38f181` |
| Corrected static-gate results | `a1c78c77ec883c247c789a896e974be70d5ad822c6a09971a7474e6815651647` |
| `continuation-38-hosted-current-evidence.json` | `549c87eb2d0395e09a8f79ac8d9ffbd8fe578177367de87449821353a02b2c8d`; seven verified raw logs plus separately retained main-browser evidence |

The source39 freeze includes the exact three accepted smoke hashes. Initial MIDI review, review2's unresolved native failure, corrected review3, isolated profile reds, metadata-postcheck refusals and the first combined failure remain available. The [release record](DECKCHEK-RELEASE-READINESS.md) retains older failed/killed/full-stress/fuzz attempts and source-specific successes. No threshold, assertion or warning policy was relaxed.

Root completed source39 execution and transferred the sole project test/build slot to `/root/native_catalog_portability_implementation` at **18:16:06.393681 UTC**; root retains Git/publication/metadata ownership. Verify live ownership before running work. The separate native setup/catalog slice is outside this checkpoint: its initial baseline was **2 passed / 1 failed**, and first candidate validation recorded **30 Node passes / 4 fixture failures** plus native test compilation **E0502**. Corrections are in progress; no integration or acceptance is claimed. The transfer record is `native-catalog-portability-execution-transfer.json`, SHA256 `ce3d55abf811cc6cf2026f0ded01343adb953d9eaa9acf0084df9d0f6109660b`. Remaining gates include this source's full native/platform/browser qualification, unresolved browser findings, extended jobs, broad Sonar and physical tests. Physical MIDI identity/continuity, MIDItest integration, receiving-direction/maps, surrounding isolation metrics and other declared product gaps remain open. Fleet stays OFF.
