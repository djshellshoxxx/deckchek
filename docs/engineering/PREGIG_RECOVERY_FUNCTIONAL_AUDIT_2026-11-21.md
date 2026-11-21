# Pre-gig recovery — round seventeen functional audit

Date: 2026-11-21. Lane: fresh functional / bug hunt. Disposition: **ACCEPT within the reviewed source and focused execution scope.**

The sole authorized FIRST passed **132 / 132 cases**, including all **49 cumulative additions**, with zero failures, skips, cancellations or todos. The project returned zero in **15.125495306994708 seconds**. Every original stream, result, runtime identity, reviewed control and complete before/after source record is retained unchanged. No further project command or rerun occurred. The original complete-source audio HOLD and real native/platform limits remain.

The preceding blockers are resolved in this frozen candidate: pending forms own detached submitted data and lock all draft controls; preset acknowledgement is independent of optional refresh; PDF preparation uses the retained result and its retained preset with a current-result guard; and fixtures use stable feedback hosts and explicit Pre-gig write accounting. Round sixteen remains a static HOLD on its earlier source, not a passing run.

## Scope and source identity

This review follows the complete [recovery implementation](PREGIG_RECOVERY_IMPLEMENTATION_2026-11-21.md), [recovery scope](PREGIG_RECOVERY_REVIEW_SCOPE_2026-11-21.md), original storage implementation/scope, [static HOLD continuation](PREGIG_STORAGE_STATIC_HOLD_CONTINUATION_2026-11-21.md) and relevant retained audits. It covers the cumulative browser adapter, controller and screen; all five complete selected tests, their assertions and fixtures; and actual shared consumers. Whole-tree byte custody and semantic coverage are separate claims.

| Binding | Exact value |
| --- | --- |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-pregig-recovery-functional` |
| Branch | `review/deckchek-pregig-recovery-functional-20261121` |
| Source freeze | `2ac0cf4dc25cb17471149ba64c83b3855c319d45` |
| Source tree | `285b665343d91b6cabebc0f0210fa661865d7305` |
| Sole source parent | `f4d727cb9243b60594dc0df73da3d0808d698b81` |
| Original paths / distinct blobs | 2,546 / 2,288 |
| Summed tracked bytes | 88,465,624 |
| Actual / tracked top-level tests | 207 / 207, identical inventories |
| Canonical source map SHA-256 | `e02518433215984d516ed73d2f104acc93ed1f80a428ebf6b07ad61b3af32c5d` |

The canonical identity is compact JSON in Git tree order, with sorted keys and records `{path,mode,oid,bytes,sha256}`. Independently before and after the FIRST, this lane read immutable Git objects, recomputed their blob IDs from complete bytes and Git headers, and compared every original working file's complete bytes and executable mode. These checks agree with both recorder source maps, immutable tree entries, working-index inventories, tracked hash maps and actual/tracked test inventories. The checkout was clean before the FIRST, after it and immediately before packaging. Only the owned report and evidence are added by this lane.

### Principal source identities

All entries have Git mode `100644`. The retained maps cover every original path.

| Original path | Bytes | SHA-256 | Git blob |
| --- | ---: | --- | --- |
| `app/pre-gig.js` | 56,837 | `0c2c6369bb06fa7e06e52da1d3b15f20f3f49d722d7af1ff2968f66c56370184` | `7415077ef47cd6f57c8afaf8c6b357a7b571780b` |
| `app/ui/workflows/pregig.js` | 17,781 | `49c9f921ea53ae9f9ed57f901c68b8b1198e80c4a87c3a0ad406333228070ad7` | `9defec364e0bbaa843bb4ec9ae194ca2b21e241b` |
| `app/ui/screens/pregig.js` | 56,158 | `23d52407552d5a68060bba6492a9a49fefb56908a993fc71dd6f2456a05740df` | `166285e5ea8d37970988dc83fa3a140e1baf7167` |
| `tests/pre-gig.test.mjs` | 50,840 | `f813fa152e82998fa67ea49a2d78a7fa2d0cf214f600ab92b86bc94384c76d12` | `123e554cbc7fd95ef1335cf11f77ff46c02e8d59` |
| `tests/pregig-storage-screen.test.mjs` | 23,899 | `2779ff267b814db961bd250612093cb4875cc51f1683fd7ec162f46e7ecad5ad` | `a3413004846069c96e7035e5f6c46abc7fbb30e1` |
| `tests/pregig-storage.test.mjs` | 9,582 | `0fc88abc7554c9785a9e0f5dae8cdfdcc8b46f0be84d0a9710ec6d30cc6d6b4f` | `610ca5c478224a590e0bb43a047dfc5d50a60451` |
| `tests/pregig-ui.test.mjs` | 14,311 | `c18d29747b125d940ce273ec9744954b74f913a8343b32d9c082d7c7d9b6be55` | `76f662a36fc557b74807d5864618f2fcd793ec2c` |
| `tests/text-file-boundary.test.mjs` | 7,893 | `7e63b3bc04fd1da8a66b15ef20d5956072bec7dca238dece64d7355f2a2f1b23` | `b8a00e3014d7c885da812a5d304f8c95c5df1d98` |

## Functional review and preceding finding closure

### Pending form ownership and acknowledgement

In [the actual screen](../../app/ui/screens/pregig.js), forms begin from a structured clone. `setBusy` records each input, select, textarea and button's prior disabled state, locks all of them during persistence and restores those states afterward. The save handler takes a separate `structuredClone(out)` before awaiting, coalesces repeated submissions, and prevents closure while pending. It submits that detached snapshot and uses the same submitted name in success feedback. Errors retain the dialog and entered values for editing and retry. This resolves the earlier aliasing and partially editable pending-form findings.

The actual `savePreset` path caches the acknowledged saved row and updates the idle selection where appropriate. It starts `void loadPresets()` and returns the acknowledged row. Optional refresh owns its own loading/error state: it cannot hold the successful Save dialog open indefinitely or turn the acknowledged write into a persistence failure. A refresh failure retains known data with the separate unavailable message.

The FIRST observed all-control pending assertions, repeated-click coalescing, failed pending save followed by restored editing and successful retry with entered name/interface/software/MIDI data, acknowledged success followed by failed refresh, and acknowledged success while optional refresh remains deferred. These are [TAP](evidence/pregig-recovery-functional-2026-11-21/focused/run.tap) cases 63–67, using the actual dialog and storage boundary.

### Retained result and PDF ownership

The completed/running presentation reads the controller's retained preset alongside its retained result. Saving a different preset does not relabel that result. The PDF handler captures `S.run` and `S.preset` before awaiting `ensurePregigPrintable()`. Its `isCurrent` callback requires an undisposed screen, done phase and the same run identity. It is checked after registration and passed to the shared feedback helper. Printable data uses the captured preset's interface; the JSON fallback exports the captured run.

The [shared helper](../../app/ui/persistence.js) checks current ownership before and after dynamic import and before late feedback, Retry or fallback. The complete [actual printable](../../app/ui/workflows/pregig-report.js) and [JavaScript PDF adapter](../../app/report-pdf.js), including composition and native handoff, were reviewed. The tests do not substitute a second report implementation.

FIRST cases 77 and 78 exercise the real screen/export path. After a same-ID preset edit, captured HTML and suggested filename retain the originally tested interface. Resetting the result before preparation resumes produces no dialog/render handoff and no late success/progress feedback. The fixture supplies real print CSS and captures the actual `pdf_render` payload at a fake native boundary. No OS dialog or native renderer ran; no PDF was produced or visually inspected.

These guards retire pending preparation and presentation. Once the actual PDF adapter has received the captured snapshot, its internal asynchronous work may finish that snapshot. The result does not establish cancellation of a native export or mutation already submitted.

### Stable document feedback and explicit write accounting

[The screen fixture](../../tests/pregig-storage-screen.test.mjs) installs one document and its actual polite/assertive/toast hosts for the module lifetime. Each case clears feedback, mounts a fresh screen, disposes it and removes per-case screen/dialog content. The real `app/ui/live.js` keeps references to attached hosts, matching the production shell lifetime. Later success assertions observe the actual destination; no replacement toast implementation is used.

The fixture retains every storage write. `pregigWrites` counts the preset, run and last-selection keys explicitly; complete raw-value assertions still verify collection preservation. Actual library initialization may write its separate catalog cache without being mistaken for a Pre-gig write. This repairs the fixture premise without suppressing library behavior or weakening data-preservation assertions. Actual state/library/catalog consumers and their shared lifetimes were inspected.

The DOM harness models synchronous dispatch, storage seams and deferred promises. Its dispatch can invoke a handler even when a control is disabled, making the handler coalescing guard useful independently. It does not qualify real modal inertness, layout, focus trapping, accessibility trees or browser scheduling. Presentation timers are controlled in the screen fixture; the original core DSP assertions and thresholds remain in the selected core file.

### Browser storage and native compatibility

[The browser adapter](../../app/pre-gig.js) resolves storage lazily after the native branch. Only an actual `null` read establishes absence. Missing providers/methods, thrown reads, non-string values, malformed/non-array JSON, invalid/partly valid rows, duplicate IDs and non-finite parsed values produce typed errors. The entire collection is validated; invalid rows are not silently filtered into a writable replacement. Dependent mutations preserve the unreadable/invalid stored bytes.

Writes validate candidate collections, serialize with finite checks, parse and validate the serialized result, and call the actual writer before acknowledging success. Denied writes return no successful ID, saved row or deletion. Absent deletion is a no-write false result. Creation timestamps, newest-100 run retention, complete details, accepted string-JSON rows and future-version preset bodies remain covered. Explicit retry succeeds after storage recovers; failures do not become empty History or success feedback.

All 26 adapter cases passed. The existing browser round-trip case preserves its name and now asserts typed rejection where its old behavior swallowed storage errors. Core synthetic DSP sections and thresholds are unchanged. The strict-text fixture now returns its acknowledged ID after spreading the input, disposes its screen and asserts Imported; it retains the earlier byte-limit, one-read, UTF-8 and failed-read checks.

The native adapter returns before touching browser storage and preserves all six command names and argument shapes. The complete [native module](../../src-tauri/src/pregig.rs) and [contracts](../../tests/contracts/pregig.json) were read as source. Both remain byte-identical to pre-author `b71a81a849c0bad9f24b4ba7ea40366e86769501`: native module 34,865 bytes / SHA-256 `7fbc39b70509468f32b0a5a2331fcaeb372c7fb25567d936b1746f0b9856e237`; contract 6,456 bytes / `d0c45025e7ad7dc67425425c88084be1161af20bcfcac0e09869419c1892b0a0`. Native transaction/acknowledgement and validation paths were not executed. Browser storage is not a cross-tab transaction system, a hostile JavaScript object sandbox or a claim of every native resource limit's equivalence.

### Controller, History and lifecycle

[The controller](../../app/ui/workflows/pregig.js) installs its shared save promise before emitting saving state. Overlapping Save/Retry joins that task; start, rerun and reset cannot replace an in-flight save. Completion retains run/preset, clears earlier saved/comparison state, and attempts previous-History lookup then persistence. Failure preserves the completed result with an error and no success marker. Retry does persistence work without repeating measurement. Unreadable History stays unknown rather than becoming an empty comparison baseline.

The actual screen distinguishes unavailable History from confirmed empty History, retains known rows with a stale-data message, and offers Retry. Read sequence/disposal checks retire older presentation. Preset read failure remains visible across tabs without silently selecting a different rig. Failed import retains its parsed draft for retry without repicking. Future preset versions stay read-only; start/edit/duplicate do not rewrite or run them.

Done, preset changes and reruns use actual unsaved-result confirmation and retained-result identity. Actual Retry and shell Save acknowledge only after persistence succeeds. All four added controller cases and actual-screen counterparts passed. Disposal removes the Save listener and presentation work; it does not cancel a native command already submitted.

### Existing native association follow-up

The code lane identified, and this lane confirmed by source comparison, a pre-existing native limitation. A custom preset associated with a running or retained result can still be deleted. `toRunInput` preserves its `presetId`, while native `save_run` refuses a reference to a missing preset. Retrying the same association cannot itself repair it. The delete handler, run-input mapping and native reference check are unchanged from the pre-author source above. This is a separate root-owned follow-up, not an R17 regression or a scenario reproduced here. The focused browser/fake-native gate does not close it.

## Independent selection and timing basis

Every complete test, helper and assertion was read. Independent Python standard-library data inspection extracted literal titles and expanded the reviewed collection/action loops in registration order without evaluating JavaScript. All 132 names are unique. The 49 additions are cumulative against pre-author source: the 45 cases already authored for the held round plus four new screen cases here.

| File in execution order | Literal | Expanded | Total | Older | Added |
| --- | ---: | ---: | ---: | ---: | ---: |
| `tests/pre-gig.test.mjs` | 59 | 0 | 59 | 59 | 0 |
| `tests/pregig-storage-screen.test.mjs` | 16 | 3 | 19 | 0 | 19 |
| `tests/pregig-storage.test.mjs` | 8 | 18 | 26 | 0 | 26 |
| `tests/pregig-ui.test.mjs` | 17 | 0 | 17 | 13 | 4 |
| `tests/text-file-boundary.test.mjs` | 11 | 0 | 11 | 11 | 0 |
| **Total** | **111** | **21** | **132** | **83** | **49** |

Ordered name-only compact UTF-8 JSON SHA-256 is `ccf2e633ca355f23b87b3e57c7eacf00a9ec31c5a3e42414f1847e5c21bb3dfb`; ordered `{file,name}` compact sorted-key JSON SHA-256 is `5d0e0990e498fcbf958a8ac086138a25d1895b48de20d28f89ab5f9a9e952344`. Root and both peers independently derived identical counts/order before execution.

All 83 older names match exactly one top-level `ok` in the [original round-ten TAP](evidence/link-consent-functional-2026-11-21/full/run.tap), 555,767 bytes / SHA-256 `e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`. Their historical durations sum to **14,628.461681 ms**. The [independent inventory](evidence/pregig-recovery-functional-2026-11-21/independent-case-inventory.json) preserves every current name/source line/addition flag and every matched historical case number/duration.

TERM at 55 seconds and a five-second KILL grace gave a 60-second project budget: about 40 seconds beyond the historical case sum for the 49 bounded additions, five-file startup and variability. The unchanged synthetic DSP workload remains in the actual core file. Two fixed identity calls each had separate ten-second limits; Python/Git source custody ran outside the project budget. Historical timing informed the budget, not current qualification or a future wall-time guarantee.

## Authorization and sole FIRST

All three lanes first returned source ACCEPT, then read every unexecuted recorder/config/launcher line and bound their bytes. Root independently read the controls, verified source/runtime/control identities, and confirmed a clean freeze and absent raw directory before explicitly authorizing the single unchanged launcher. The preceding recorder was fully read before adaptation and was not run. No Node version/import/syntax/test/build, browser or native command ran before this separate authorization.

The [retained launcher](evidence/pregig-recovery-functional-2026-11-21/authorized-launcher.txt) invokes the absolute Python 3.12.14 executable and reviewed external controls. It ran once with `login:false` in the frozen functional worktree. The recorder ran its two fixed Node identity calls, then this single ordinary project argv:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap tests/pre-gig.test.mjs tests/pregig-storage-screen.test.mjs tests/pregig-storage.test.mjs tests/pregig-ui.test.mjs tests/text-file-boundary.test.mjs
```

| Reviewed control | Bytes | SHA-256 |
| --- | ---: | --- |
| Recorder, 385 lines | 22,756 | `b3c3a4a65369d05c71d7be909a77976384bc55e42a30a4129e875da4032a6bd2` |
| Selection, 274 lines | 22,348 | `12ce92d9bd00c35365569dcecbad678c94b44ee20b48bcd5693f1e43a0a96df2` |
| Launcher, one line | 247 | `e2b39fe5397d304f225452f40022b43131fb8f95fc7623d22aa67562fc3ba21b` |

Node was `v24.22.3`, Linux x64, at the pinned absolute path. Its 126,951,512-byte binary SHA-256 was `acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa` before/after. Both identity calls returned zero with empty stderr. No forbidden diagnostic, external-corpus or Node-options variable names were present. The only environment change prefixed the pinned Node directory to PATH. No extracted tests, shell rewriting, weakened thresholds or extra project command were used.

The original [result](evidence/pregig-recovery-functional-2026-11-21/focused/result.json) records project start **14:30:51.210232 UTC**, completion **14:31:06.336304 UTC**, 2026-11-21. Both project and recorder exited zero. Project time was **15.125495306994708 s**; TAP's separate timer reports **15,014.516442 ms**. No timeout signal, recorder error or postflight error occurred.

This lane read every original TAP/result/runtime line and independently parsed all 132 sequential outcomes, subtest names, the sole `1..132` plan and all counters against the pre-execution inventory. All 49 additions passed; stderr was empty. Root and both peers separately inspected original streams and full source custody as data, with no additional project execution.

| Original evidence | Bytes | SHA-256 |
| --- | ---: | --- |
| `run.tap` | 31,900 | `655d53c1ef68f1d62eefdb06834b840bb0b7bd8c60da22019ac82cd8b4e25cdc` |
| `stderr.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `result.json` | 9,411 | `8c152852d3170fafbbc787174f1b96b067e269a95aa4787ba7d6e73b59a89a74` |
| `full-source-before.json` | 651,771 | `1fe5add540691eb00185fa31a00d1812748f88899c2e969b383d7ddba7f17910` |
| `full-source-after.json` | 651,771 | `1fe5add540691eb00185fa31a00d1812748f88899c2e969b383d7ddba7f17910` |

## Original evidence custody and sealed handoff

The original `/workspace/scratch/6f2247f2f463/deckchek-pregig-recovery-round17-focused-raw` directory contains **24 regular mode-0644 artifacts / 2,870,756 bytes**. All are preserved byte-for-byte in [the owned focused directory](evidence/pregig-recovery-functional-2026-11-21/focused/): recorder, selection, runtime streams, TAP/stderr, result/running records, expected names/outcomes, immutable source maps/tree entries, working hashes and source/test inventories. Originals were never trimmed, normalized, rewritten or replaced by summaries.

The complete package has **28 files / 2,930,522 bytes**: 24 raw copies, exact launcher, independent case inventory, custody check and manifest. The 26 original-to-copy bindings total **2,912,650 bytes**. Both peers independently verified every original/copy byte, mode and computed Git blob and all 132 source records plus 83 historical number/duration bindings against their own derivations before accepting this package.

The [manifest](evidence/pregig-recovery-functional-2026-11-21/manifest.json) binds original/copy paths, sizes, SHA-256 values, Git blobs and modes plus the independent check. It is **14,020 bytes**, SHA-256 `167af111fbea250eea848a8f2a7e7e64c24ad3ea6ad0c0d4e965b928d2f97896`, blob `a8f5db80257d80a688511aabfd252df896655ac0`. The [custody check](evidence/pregig-recovery-functional-2026-11-21/custody-check.json) is **3,852 bytes**, SHA-256 `abccb1749054cc587569893f55cf1b15692c6494ee6cbb22d5ba23c9dcac50e1`, blob `0edcad3134235a3bdeb5379927cfe216b091be02`.

Only `docs/engineering/PREGIG_RECOVERY_FUNCTIONAL_AUDIT_2026-11-21.md` and `docs/engineering/evidence/pregig-recovery-functional-2026-11-21/` belong to this worker. The final handoff separately supplies the owned-only commit, tree, sole frozen parent, report/evidence IDs and original-byte/mode proof, avoiding a self-referential report hash. Root owns integration, its additional proof records, later implementation, CI and publication. All three current FINAL handoffs must be preserved before a fresh cohort continues.

## Preserved limits and prior holds

This scoped ACCEPT does not qualify real browser rendering/focus/accessibility, OS dialogs, rendered native PDFs, native database concurrency, physical capture, device owner/cache/startup/exit behavior or a complete-source build/release. The native preset association follow-up remains. Native backup/restore #85, Population Compare #88 and System Health #89 are separate root-owned work. Fleet stays default-off.

The preceding backup FIRST is 193/193 and Service FIRST is 123/123; those remain ancestor evidence. The held publication checkpoint remains `34afefa58ac5e8346006087587b113c2a82d5a39` on `checkpoint/deckchek-backup-service-held-20261121`. This lane did not change published heads, qualified main `e36ddc41806b0f6639474f207e3b339e063a6e25`, or durable Player `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`.

The original complete-source audio result remains **2,420 total / 2,418 pass / one failure / one optional skip**, exit one. Original case 53 measured **−101 dB at a played −30 dBFS**. This review establishes no cause or repair and performed no full gate, failing-case reproduction, new instrumentation, threshold relaxation or speculative audio rerun. This selected gate's locally numbered case 53 is a different Pre-gig orchestration case; its pass does not replace the prior failure. Original audio evidence remains unchanged in the [round-ten report](LINK_CONSENT_FUNCTIONAL_AUDIT_2026-11-21.md) and full TAP. No scanner, probe or exploit workflow ran. Credit balance is not observable, so no credit-exhaustion claim is made.

## Appendix — all ordered current cases

The following exact names, order, source locations and addition flags were independently derived before execution. Each has one matching `ok` in the FIRST. “Added” is cumulative against the pre-author source, not necessarily first authored in round seventeen. Locations refer to frozen source.

### `tests/pre-gig.test.mjs`

| Order | Source line | Added | Exact case name |
| ---: | ---: | --- | --- |
| 1 | 26 | No | timecode: clean deck passes with no fix needed |
| 2 | 32 | No | timecode SNR: 25 passes, 24.9 amber, 20 amber, 19.9 red (AC-3 action and DVS link) |
| 3 | 43 | No | timecode balance: 1.5 passes, 1.6 amber, 3 amber, 3.1 red, sign does not matter |
| 4 | 51 | No | timecode phase error: 10 passes, 10.1 amber, 20 amber, 20.1 red |
| 5 | 59 | No | timecode dropouts: 0 passes, 1 amber, 2 red |
| 6 | 67 | No | timecode speed: 1% passes, 1.1% amber (pitch), 5% amber, 5.1% red means wrong format |
| 7 | 77 | No | timecode: worst metric wins, every issue gets one fix, unverified format warns |
| 8 | 88 | No | timecode: no signal is red with needle, switch and cable advice; missing evidence is skipped, errors are amber-level error |
| 9 | 101 | No | timecode: capture problems become actions, not crashes |
| 10 | 121 | No | signal level: -50 dBFS passes, -50.1 on either channel is red and names the channel |
| 11 | 132 | No | hum: 40 dB below the carrier is amber, 25 dB is red, above 40 passes; hum below the floor margin is ignored |
| 12 | 142 | No | hum that could not be measured is amber with a retry, never a silent pass |
| 13 | 151 | No | audio: missing interface is red with connection and Sound-settings actions; sample-rate mismatch is amber |
| 14 | 166 | No | midi: present passes, optional missing is amber, required missing is red, no backend is unsupported |
| 15 | 180 | No | headphones: yes passes, no is red with cue advice, skip or none is skipped |
| 16 | 196 | No | software: crash within 1 h red, within 24 h amber, older passes; boundaries inclusive |
| 17 | 212 | No | software: not installed and not running are amber with actions; no backend is unsupported |
| 18 | 222 | No | system: driver and event findings filtered to the preset gear, warnings amber, errors red, unsupported excluded |
| 19 | 242 | No | evidence errors become "Check could not run" with a retry for every kind |
| 20 | 253 | No | every red or amber result carries a fix with a label and plain-English text |
| 21 | 272 | No | rollUp matrix (AC-2): fail is red, warn or error is amber, skipped required is incomplete, else green |
| 22 | 291 | No | rollUp: unsupported steps are excluded from the verdict and mark the check partial (AC-5) |
| 23 | 301 | No | rollUp: top problems sorted red, amber, then skipped required; copy matches the spec wording |
| 24 | 312 | No | buildPlan orders parallel steps first, then per-deck steps, then the headphone cue |
| 25 | 323 | No | buildPlan honours skip and only, drops MIDI and software when the preset has none, and stays inside the 120 s budget |
| 26 | 338 | No | built-in presets validate and reference the owner's real gear profile ids and known formats |
| 27 | 353 | No | built-in presets load through loadBuiltinPresets and bad ones are reported |
| 28 | 366 | No | validatePreset: bad deck ids, duplicates, inputs, formats, rates, MIDI and gear references |
| 29 | 391 | No | presets: newer versions are read-only, import rejects >256 kB and junk, export/duplicate round-trip (AC-8) |
| 30 | 419 | No | presetFromEquipment builds a valid preset from real profiles; deck B defaults to inputs 3-4 and the format comes from the media library |
| 31 | 436 | No | formatForMedia resolves timecode media only, from the library, in any container shape |
| 32 | 444 | No | the built-in rigs on a multi-pair interface put deck A on 1-2 and deck B on 3-4 (Traktor Audio 8 DJ) |
| 33 | 450 | No | namesMatch is forgiving but refuses tiny fragments |
| 34 | 459 | No | diffRuns lists which steps changed and whether they improved (AC-6) |
| 35 | 480 | No | synthetic Traktor MK2 timecode from the generator passes both deck steps |
| 36 | 487 | No | synthetic: noisy carrier is amber then red as the SNR falls (real analyzeTimecode) |
| 37 | 495 | No | synthetic: one muted channel is red, naming the channel; silence is a no-signal red |
| 38 | 508 | No | synthetic: dropouts and a wrong-format record are caught |
| 39 | 517 | No | synthetic hum: 50 Hz and 60 Hz families are detected and graded against the carrier |
| 40 | 535 | No | synthetic needle-up hum is measured on the lifted segment |
| 41 | 542 | No | summarizeTimecode exposes plain numbers and handles failures |
| 42 | 568 | No | runPregig: an all-ready rig produces a green verdict with every automatic step passing (AC-1) |
| 43 | 583 | No | runPregig: deck B captures input pair 3-4 and deck A pair 1-2, so a two-deck rig can be green |
| 44 | 593 | No | runPregig: a pair the interface does not offer is reported as no such input, not a failure |
| 45 | 609 | No | deckPairFirst maps zero-based deck inputs to the 1-based first channel of a stereo pair |
| 46 | 618 | No | runPregig: audio interface missing is red, signal steps are skipped (blocked) and nothing is captured (AC-4) |
| 47 | 632 | No | runPregig: a thrown step is an error row, the verdict is amber and the other steps still run |
| 48 | 642 | No | runPregig: Esc cancels, finished steps are kept and the rest are skipped (cancelled) (AC-7) |
| 49 | 658 | No | runPregig: manual time is reported separately and excluded from the duration |
| 50 | 668 | No | runPregig: orchestration overhead with instant mocked captures stays far below 5 s |
| 51 | 675 | No | runPregig: CAPTURE_BUSY offers to stop the other capture, retries once and records the choice |
| 52 | 690 | No | runPregig: one capture feeds both deck steps; only/skip re-run just the chosen steps |
| 53 | 701 | No | runPregig: needle-up hum asks the user, captures the lifted segment and grades it |
| 54 | 715 | No | runPregig: no desktop backend leaves required steps skipped and the verdict incomplete (AC-5) |
| 55 | 724 | No | createNativeDeps drives the Tauri commands with the pre-gig capture holder and captures the deck input pair |
| 56 | 745 | No | toRunInput maps a run to the pregig_save_run contract, redacting Windows user paths |
| 57 | 762 | No | createPregigApi (native) sends exactly the contract argument names |
| 58 | 780 | No | createPregigApi (browser) stores runs and presets locally with the same shapes |
| 59 | 807 | No | contract examples are real step results shapes (states the database accepts) |

### `tests/pregig-storage-screen.test.mjs`

| Order | Source line | Added | Exact case name |
| ---: | ---: | --- | --- |
| 60 | 77 | Yes | Pre-gig screen keeps unavailable preset storage visible across tabs and retries without silently choosing a rig |
| 61 | 92 | Yes | Pre-gig screen distinguishes unavailable History from confirmed empty History and recovers on Retry |
| 62 | 106 | Yes | Pre-gig screen retains previously loaded History with a persistent unavailable message after a failed refresh |
| 63 | 118 | Yes | Pre-gig preset Save keeps the same draft and inline error after denied persistence, then confirms one successful retry |
| 64 | 136 | Yes | Pre-gig preset Save coalesces repeated clicks and keeps the dialog open while persistence is pending |
| 65 | 148 | Yes | Pre-gig a failed pending preset save restores draft editing and preserves every entered value for retry |
| 66 | 168 | Yes | Pre-gig keeps an acknowledged preset and truthful success when the subsequent list refresh is unavailable |
| 67 | 180 | Yes | Pre-gig an acknowledged preset save finishes while an optional refresh is still pending |
| 68 | 191 | Yes | Pre-gig actual Retry and shell Save retain the completed result and never claim persistence before it succeeds |
| 69 | 211 | Yes | Pre-gig saving a different preset keeps an unsaved check attached to the rig it actually tested |
| 70 | 225 | Yes | Pre-gig Done preserves an unsaved result until the user confirms discarding it |
| 71 | 225 | Yes | Pre-gig choosing another preset preserves an unsaved result until the user confirms discarding it |
| 72 | 225 | Yes | Pre-gig running everything again preserves an unsaved result until the user confirms discarding it |
| 73 | 235 | Yes | Pre-gig a late failed History request cannot replace a newer successful read |
| 74 | 245 | Yes | Pre-gig disposal retires a pending History presentation and the Save callback |
| 75 | 254 | Yes | Pre-gig import retains the parsed draft after a failed save and retries without picking the file again |
| 76 | 271 | Yes | Pre-gig displays future-version presets read-only without running or rewriting their contents |
| 77 | 303 | Yes | Pre-gig PDF keeps the tested interface after the same saved preset is edited |
| 78 | 319 | Yes | Pre-gig PDF preparation cannot export or announce a result retired before its handoff |

### `tests/pregig-storage.test.mjs`

| Order | Source line | Added | Exact case name |
| ---: | ---: | --- | --- |
| 79 | 29 | Yes | browser Pre-gig treats only a confirmed absent key as an empty collection |
| 80 | 45 | Yes | browser Pre-gig runs preserves malformed JSON through reads and attempted writes |
| 81 | 45 | Yes | browser Pre-gig runs preserves empty text through reads and attempted writes |
| 82 | 45 | Yes | browser Pre-gig runs preserves non-array JSON through reads and attempted writes |
| 83 | 45 | Yes | browser Pre-gig runs preserves partly invalid rows through reads and attempted writes |
| 84 | 45 | Yes | browser Pre-gig runs preserves duplicate ids through reads and attempted writes |
| 85 | 45 | Yes | browser Pre-gig runs preserves invalid nested data through reads and attempted writes |
| 86 | 45 | Yes | browser Pre-gig runs preserves unrepresentable JSON numbers through reads and attempted writes |
| 87 | 45 | Yes | browser Pre-gig presets preserves malformed JSON through reads and attempted writes |
| 88 | 45 | Yes | browser Pre-gig presets preserves empty text through reads and attempted writes |
| 89 | 45 | Yes | browser Pre-gig presets preserves non-array JSON through reads and attempted writes |
| 90 | 45 | Yes | browser Pre-gig presets preserves partly invalid rows through reads and attempted writes |
| 91 | 45 | Yes | browser Pre-gig presets preserves duplicate ids through reads and attempted writes |
| 92 | 45 | Yes | browser Pre-gig presets preserves invalid nested data through reads and attempted writes |
| 93 | 45 | Yes | browser Pre-gig presets preserves unrepresentable JSON numbers through reads and attempted writes |
| 94 | 55 | Yes | browser Pre-gig read denial refuses every dependent mutation and recovers without replacing data |
| 95 | 72 | Yes | browser Pre-gig save run reports a denied write and succeeds only after storage accepts retry |
| 96 | 72 | Yes | browser Pre-gig create preset reports a denied write and succeeds only after storage accepts retry |
| 97 | 72 | Yes | browser Pre-gig edit preset reports a denied write and succeeds only after storage accepts retry |
| 98 | 72 | Yes | browser Pre-gig delete preset reports a denied write and succeeds only after storage accepts retry |
| 99 | 82 | Yes | browser Pre-gig refuses missing providers and missing writer methods |
| 100 | 96 | Yes | browser Pre-gig does not treat a non-string undefined storage read as confirmed absence |
| 101 | 102 | Yes | native Pre-gig bypasses a throwing browser storage getter while browser errors remain typed |
| 102 | 116 | Yes | browser Pre-gig preserves the newest-one-hundred retention rule and complete result details |
| 103 | 127 | Yes | browser Pre-gig retains future preset versions and existing string-JSON records without writes |
| 104 | 137 | Yes | browser Pre-gig refuses unserializable or non-finite new data before replacing prior bytes |

### `tests/pregig-ui.test.mjs`

| Order | Source line | Added | Exact case name |
| ---: | ---: | --- | --- |
| 105 | 15 | No | describeStep: an input pair the interface lacks reads as "no such input", not a failure |
| 106 | 24 | No | describeStep: every engine state has a word and a tone; live states are not chips |
| 107 | 34 | No | verdictView: only deck B unmeasured gives an amber "Not fully checked" that says why |
| 108 | 44 | No | verdictView: red stays red and still notes deck B; green copy is the engine copy |
| 109 | 52 | No | fixButtons: keeps actions, dedupes, info entries have no action |
| 110 | 59 | No | evidenceRows: labels, units, nesting, empties dropped |
| 111 | 67 | No | rerunTargets and mergeRerun: only the chosen steps change and the verdict is recomputed |
| 112 | 78 | No | compareView: trends and headline |
| 113 | 85 | No | profilesForPreset: judges only the rig, not every profile in the library |
| 114 | 91 | No | runMatchesPreset: built-ins match by notes, saved presets by id |
| 115 | 98 | No | time text |
| 116 | 112 | No | controller: full run keeps deck input-pair skip honest, saves once, compares on the second run |
| 117 | 132 | No | controller: cancel keeps partial results as cancelled; rerun merges and saves a new run |
| 118 | 151 | Yes | controller: failed browser persistence retains the completed result and retry never repeats the check |
| 119 | 170 | Yes | controller: overlapping save retries share one write and cannot be replaced by a new run or reset |
| 120 | 185 | Yes | controller: unavailable history does not become an empty baseline or a successful save |
| 121 | 196 | Yes | controller: a failed save after rerun cannot retain the previous result success marker |

### `tests/text-file-boundary.test.mjs`

| Order | Source line | Added | Exact case name |
| ---: | ---: | --- | --- |
| 122 | 50 | No | pre-gig refuses an oversized selected preset before reading or saving |
| 123 | 58 | No | pre-gig catches file read errors and preserves the existing preset collection |
| 124 | 65 | No | pre-gig rejects mismatched read lengths before parsing or saving |
| 125 | 72 | No | pre-gig consumes one strict UTF-8 snapshot while retaining valid Unicode presets |
| 126 | 81 | No | pre-gig rejects malformed UTF-8 without saving a replacement-decoded preset |
| 127 | 106 | No | media import rejects malformed UTF-8 instead of storing replacement text |
| 128 | 114 | No | media import rejects invalid declared sizes before reading |
| 129 | 124 | No | media import rejects mismatched read lengths and preserves normal one-read imports |
| 130 | 133 | No | media import reports byte-read failures without storing a profile |
| 131 | 140 | No | bounded text reads preserve UTF-8 BOM compatibility and measure the byte boundary |
| 132 | 148 | No | bounded text reads reject incomplete reads and non-buffer results before decoding |
