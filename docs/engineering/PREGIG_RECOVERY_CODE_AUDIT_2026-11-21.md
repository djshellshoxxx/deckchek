# Pre-gig recovery — ROUND SEVENTEEN code audit

Date: 2026-11-21. Reviewer: fresh code lane `/root/pregig_recovery_code_round17`.

## Final disposition

**ACCEPT for the reviewed cumulative Pre-gig browser persistence/recovery corrections and the exact five-file focused FIRST.** No material blocker remains in that scope after the complete source/control review and independent inspection of the original 132/132 passing result and retained evidence. The pre-existing native preset-deletion interaction is explicitly recorded below as a separate follow-up. This disposition does not qualify native operations, the whole application, physical audio, release or deployment.

The code lane performed only static source review, Git reads/report sealing and independent Python standard-library data/custody checks. It ran no Node command, JavaScript import, syntax check, test, build, extracted implementation, browser/native launch, scanner, probe or reproduction. The functional worker alone ran the single exact FIRST after root's express authorization; this report independently checks its original evidence.

## Frozen source and independent custody

| Item | Exact identity |
| --- | --- |
| Frozen commit | `2ac0cf4dc25cb17471149ba64c83b3855c319d45` |
| Frozen tree | `285b665343d91b6cabebc0f0210fa661865d7305` |
| Sole frozen parent | `f4d727cb9243b60594dc0df73da3d0808d698b81` |
| Code worktree | `/workspace/scratch/6f2247f2f463/deckchek-pregig-recovery-code` |
| Code branch | `review/deckchek-pregig-recovery-code-20261121` |
| Functional worktree | `/workspace/scratch/6f2247f2f463/deckchek-pregig-recovery-functional` |
| Functional branch | `review/deckchek-pregig-recovery-functional-20261121` |
| Reviewed recovery correction | `bd70f5ebaca28b92fdf8f46324fdcdff47e0acce` |
| Pre-storage comparison baseline | `b71a81a849c0bad9f24b4ba7ea40366e86769501` |
| Prior static-HOLD source | `b7a979cfc24eca569713ff319c5838eaa13d1a34` |

The freeze contains **2,546 tracked paths, 2,288 distinct immutable blobs, 88,465,624 summed tracked bytes and 207 top-level test files**. I independently recomputed each immutable Git blob ID and compared every original working file's regular-file type, bytes and executable-mode classification with its frozen entry. Index/tree inventories and actual/tracked top-level test inventories agree. The compact UTF-8 sorted-key ordered `{path,mode,oid,bytes,sha256}` map, in recursive Git-tree order and without a trailing newline, has SHA-256 `e02518433215984d516ed73d2f104acc93ed1f80a428ebf6b07ad61b3af32c5d`.

Full byte/mode custody covers every original path; semantic review has the bounded coverage described below. All original source is preserved. This lane's sole added repository artifact is this report.

### Principal reviewed source identities

| Path | Bytes | SHA-256 | Git blob |
| --- | ---: | --- | --- |
| `app/pre-gig.js` | 56837 | `0c2c6369bb06fa7e06e52da1d3b15f20f3f49d722d7af1ff2968f66c56370184` | `7415077ef47cd6f57c8afaf8c6b357a7b571780b` |
| `app/ui/workflows/pregig.js` | 17781 | `49c9f921ea53ae9f9ed57f901c68b8b1198e80c4a87c3a0ad406333228070ad7` | `9defec364e0bbaa843bb4ec9ae194ca2b21e241b` |
| `app/ui/screens/pregig.js` | 56158 | `23d52407552d5a68060bba6492a9a49fefb56908a993fc71dd6f2456a05740df` | `166285e5ea8d37970988dc83fa3a140e1baf7167` |
| `tests/pre-gig.test.mjs` | 50840 | `f813fa152e82998fa67ea49a2d78a7fa2d0cf214f600ab92b86bc94384c76d12` | `123e554cbc7fd95ef1335cf11f77ff46c02e8d59` |
| `tests/pregig-storage-screen.test.mjs` | 23899 | `2779ff267b814db961bd250612093cb4875cc51f1683fd7ec162f46e7ecad5ad` | `a3413004846069c96e7035e5f6c46abc7fbb30e1` |
| `tests/pregig-storage.test.mjs` | 9582 | `0fc88abc7554c9785a9e0f5dae8cdfdcc8b46f0be84d0a9710ec6d30cc6d6b4f` | `610ca5c478224a590e0bb43a047dfc5d50a60451` |
| `tests/pregig-ui.test.mjs` | 14311 | `c18d29747b125d940ce273ec9744954b74f913a8343b32d9c082d7c7d9b6be55` | `76f662a36fc557b74807d5864618f2fcd793ec2c` |
| `tests/text-file-boundary.test.mjs` | 7893 | `7e63b3bc04fd1da8a66b15ef20d5956072bec7dca238dece64d7355f2a2f1b23` | `b8a00e3014d7c885da812a5d304f8c95c5df1d98` |

## Cumulative source review

I read the complete recovery implementation/scope notes, preceding static-HOLD continuation, original storage implementation/scope notes, and all relevant complete ROUND SIXTEEN lane findings. Those prior findings were static HOLD findings, not executed failures.

The review covered all three cumulative production modules and all five complete selected tests, not only the last diff. Actual contracts and consumers inspected include all of `src-tauri/src/pregig.rs`, `tests/contracts/pregig.json`, `app/ui/workflows/pregig-report.js`, `app/report-pdf.js`, the relevant persistence/export implementation through line 205 of `app/ui/persistence.js`, `app/text-file.js`, `app/ui/dom.js`, `app/ui/live.js`, `app/ui/shell.js`, `app/ui/state.js`, `app/catalog-store.js`, `app/ui/devices/library-state.js`, `app/devices/library.js`, and the complete service-screen DOM, native-catalog-archive DOM and signals fixtures. References are to the frozen source unless another commit is named. This is not a semantic review of every file in the repository.

The first 50,544 bytes of `app/pre-gig.js`, preceding the storage-key declaration, are byte-identical to pre-storage baseline `b71a81a849c0bad9f24b4ba7ea40366e86769501`: SHA-256 `7869ac53c62c32977681eb9828d91d48c11a402166e0325e34aedfff8183487a`. The native adapter's six command names and argument shapes are byte-identical. Full-byte equality to that baseline was independently checked for the Rust Pre-gig file, JSON contract, persistence helper, report adapter, printable composition, all three named fixtures and shared live-feedback module. This candidate changes browser state ownership and recovery without changing those native contracts or existing measurement thresholds.

### Resolution of the preceding static blockers

| Prior blocker | Reviewed correction and practical effect | Source and cases |
| --- | --- | --- |
| Pending preset save could lose subsequent edits and alias nested deck data; completion awaited a separate refresh. | The editor clones the submitted payload before awaiting persistence, disables every draft input/select/textarea/button, remembers prior disabled states and restores them on failure. The acknowledged row is retained immediately, while optional list refresh has separate read state. Success follows the write acknowledgement; a pending/unavailable refresh cannot turn it into a failed write. | Screen 155–165, 167–225, 228–258; cases 63–67. |
| Tests counted the real catalogue bootstrap write as a Pre-gig write. | Actual storage operations remain recorded. Pre-gig accounting filters exact runs/presets/last-selection keys. The actual catalogue initializer and its write remain in the module graph, and preservation assertions still inspect original bytes. | Screen test fixture, actual catalogue initializer and original storage assertions. |
| PDF preparation could use an edited/current preset or a result retired during an await. | The handler captures the completed run and retained preset before awaiting setup, composes from that pair, and passes an `isCurrent` guard. Retirement before helper handoff suppresses export; feedback, Retry and HTML fallback also follow retained-view ownership. | Screen 615–626, persistence 108–149; cases 77–78. |
| A new document per case did not match module-lifetime cached toast/live hosts. | One stable document spans the module. Each mount clears actual cached feedback hosts and each cleanup disposes its screen and removes its owned section/dialog. Assertions observe the production feedback hosts across repeated cases. | Complete screen fixture, actual live-feedback module; cases 60–78. |

The PDF guarantee retires before submission and scopes feedback/retry ownership. The existing helper explicitly does not cancel an export already handed to `report-pdf`; the adapter can already be awaiting version/CSS/native-save work. This review and the focused cases do not establish cancellation after handoff.

### Browser collection integrity

`createPregigApi` selects its native branch before touching browser storage. For browser use, only an actual absent key (`null`) establishes an empty collection. Missing providers/methods, denied reads, empty text, invalid JSON, non-array values, any invalid row, duplicate IDs and non-finite JSON numbers fail with a typed storage error. A partly readable collection stays unknown; dependent mutations preserve its original bytes.

Run/preset validation covers consumed shapes: IDs, result states, timestamps-as-strings, finite safe nonnegative durations, optional string associations, nested steps/fixes and preset parsing. A write validates the complete replacement, serializes with finite-number checks, parses/validates the resulting representation, and acknowledges only after `setItem` returns. Deleting an absent preset returns false without rewriting. Newest-100 run retention, preset creation timestamps, future preset versions and supported string-JSON records remain intact.

These checks assume ordinary trusted JavaScript objects and the synchronous Storage contract. They do not establish hostile-accessor isolation, cross-tab compare-and-swap, quota guarantees or complete native/database/resource-limit parity.

### Completed-result and asynchronous ownership

The controller establishes the shared save promise before emitting pending state, captures its run and preset, and coalesces overlapping Retry calls. Starting, rerunning and resetting cannot replace state during a save. Failure retains the completed result in `done`, without a saved marker. Retry persists that result without repeating the check. Unavailable history cannot fabricate an empty comparison baseline; a new/merged result clears the prior saved/compare markers before saving itself.

The screen preserves unavailable preset/history states and known rows after refresh failures. Request sequence/disposal guards reject obsolete presentation. Shell Save and actual Retry use the retained completed result. Done, rig changes and reruns have unsaved-result replacement ownership. Import retry retains parsed data without a second picker. Future-version presets stay read-only and are neither run nor rewritten. These are view/state guarantees, not cancellation of already submitted hardware/native operations.

### Test fidelity and limits

The selection imports actual production modules, strict text boundaries, controller/screen handlers, shared catalogue state and cached feedback hosts. PDF cases use actual printable composition and the JavaScript report adapter with a temporary fake native boundary; they record HTML/path and make no native PDF/file operation. Tests restore that bridge/backend state. They assert original tested-interface metadata after editing the same saved preset and no submission/announcement for a result retired before handoff.

DOM fixtures do not establish browser layout, real focus traversal, modal behavior, browser-engine compatibility or hardware behavior. Existing synthetic DSP cases use sampled synthetic data in the original core file, not physical audio. No copied/extracted production implementation or added application instrumentation is used.

## Pre-existing native follow-up: associated preset deletion

This source-derived interaction is a follow-up outside current browser recovery qualification, not an observed native failure or a new ROUND SEVENTEEN regression.

The screen deletes a custom preset after ordinary confirmation at `app/ui/screens/pregig.js:320–323`. Its Presets-tab Delete button at line 657 lacks an ownership guard for a running, saving or retained-unsaved check. The retained run still serializes its non-built-in preset ID at `app/pre-gig.js:708–714` (line 711). Native `save_run`, `src-tauri/src/pregig.rs:306–317`, rejects a referenced preset that no longer exists. If deletion completes before the new associated result saves, Retry can keep submitting the invalid association. Existing deletion semantics preserve already stored runs by clearing their database association; they do not update a future in-memory payload.

At `b71a81a849c0bad9f24b4ba7ea40366e86769501`, the identical screen function is at 254–257 and Delete button at 543; `toRunInput` is unchanged at 708–714, and the entire Rust file is unchanged, including 306–317. I independently compared these bytes/paths. Root accepted this as a queued pre-existing follow-up. A later change should define ownership/confirmation for deletion associated with an active/retained run or preserve a valid association, with corresponding source/native-contract cases. No frozen-source change, native reproduction or gate expansion was authorized or performed.

## Exact control review and authorization

I read every line of the 385-line recorder, 274-line selection and one-line launcher before execution. All 132 ordered `{file,name}` pairs matched my independent source-derived inventory; all five source byte pins matched the frozen checkout. I read and hashed the absolute Node binary without running it. The raw output directory was absent. Source and controls ACCEPT were sent to root; only root subsequently authorized the current functional worker's single FIRST.

| Control | Original basename in `/workspace/scratch/6f2247f2f463` | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Recorder | `deckchek-pregig-recovery-round17-focused-recorder.py` | 22756 | `b3c3a4a65369d05c71d7be909a77976384bc55e42a30a4129e875da4032a6bd2` |
| Selection | `deckchek-pregig-recovery-round17-focused-selection.json` | 22348 | `12ce92d9bd00c35365569dcecbad678c94b44ee20b48bcd5693f1e43a0a96df2` |
| Launcher | `deckchek-pregig-recovery-round17-focused-launcher.txt` | 247 | `e2b39fe5397d304f225452f40022b43131fb8f95fc7623d22aa67562fc3ba21b` |
| Root preflight proof | `deckchek-pregig-recovery-round17-root-preflight-proof.json` | 1841 | `550329a244c41245a7ba36166a979c6c6bfe5f0e97d6281fd7ac69dfb8dd7f75` |

The exact reviewed launcher is:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3 /workspace/scratch/6f2247f2f463/deckchek-pregig-recovery-round17-focused-recorder.py /workspace/scratch/6f2247f2f463/deckchek-pregig-recovery-round17-focused-selection.json
```

Its only project command is:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap tests/pre-gig.test.mjs tests/pregig-storage-screen.test.mjs tests/pregig-storage.test.mjs tests/pregig-ui.test.mjs tests/text-file-boundary.test.mjs
```

The fixed Node executable is 126,951,512 bytes, SHA-256 `acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa`. It is pinned to `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`, v24.22.3. The only other Node calls are `--version` and the explicit `-p` expression `JSON.stringify({versions:process.versions,execPath:process.execPath,platform:process.platform,arch:process.arch,execArgv:process.execArgv})`, each with a separate 10-second limit. The Python launcher resolves to `python3.12`; its independently read bytes were 30,894,944, SHA-256 `fa67443527ed9647f760d807e2a38f26340757123e643c4639cf273ed15d5ea7`.

The project starts in its own process group. TERM is scheduled at 55 seconds, with KILL at the 60-second deadline if still required. The recorder retains first stdout/stderr, outcome, timestamps, termination events and recorder/postflight errors. It creates an exclusive external output directory and refuses an existing one. There is no filter, rerun branch, extra project command, build, browser/native launch, physical-audio collector or scanner/probe. Full immutable-object/working-byte/mode custody and tracked/test inventories are checked before and after, along with source/control/Node hashes. Present `NODE_OPTIONS`, `DECKCHEK_AUDIO_*` or `MIXXX_CONTROLLERS_DIR` names fail preflight; the environment change is the absolute Node directory added to PATH.

The earlier retained full TAP, `docs/engineering/evidence/link-consent-functional-2026-11-21/full/run.tap`, is 555,767 bytes, SHA-256 `e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`. I independently matched all 83 older selected names exactly once to passing top-level outcomes, summing 14,628.461681 ms. That supports the bounded budget rationale without guaranteeing future wall time or qualifying the 49 added cases/current source.

## Independent original FIRST inspection

I read the complete original `result.json`, `running.json`, both runtime-identity stdout/stderr pairs, project stderr and all 802 lines of the original TAP. A separate strict full-TAP data parser verified all 132 complete test blocks, matching each subtest name, result name, sequential number, duration field and final plan/counters. Names also matched my independently derived source inventory, not only the recorder's generated list.

| Observed item | Original value |
| --- | --- |
| Frozen source | `2ac0cf4dc25cb17471149ba64c83b3855c319d45` / `285b665343d91b6cabebc0f0210fa661865d7305` |
| Project start, UTC | `2026-11-21T14:30:51.210232+00:00` |
| Project completion, UTC | `2026-11-21T14:31:06.336304+00:00` |
| Recorded project wall seconds | `15.125495306994708` |
| TAP duration ms | `15014.516442` |
| Sum of individual case duration ms | `14496.055312` |
| Project exit / recorder success flag | `0` / `true` |
| Outcomes | `132/132 pass; 0 suites/fail/cancelled/skipped/todo` |
| Timeout / termination events | `false` / `[]` |
| Project stderr | `0 bytes` |
| Recorder/postflight error | None in original result or directory |
| Runtime identity | Node `v24.22.3`, Linux x64, absolute reviewed executable; both calls exit 0 |
| Raw directory | `/workspace/scratch/6f2247f2f463/deckchek-pregig-recovery-round17-focused-raw` |
| Raw inventory | `24 regular files, 2,870,756 bytes, all mode 100644` |

I independently reread all 2,288 immutable blobs, recomputed Git object IDs, and checked the bytes/modes of all 2,546 original paths in both the code and functional worktrees: 5,092 working-file checks. Every retained full-source, immutable-entry, tracked-hash, tracked-inventory and 207-test inventory record matches that independently derived freeze. Before/after source maps are identical. All selected-source/control/runtime hashes and original stream lengths/hashes match the result, and every runtime identity stream matches its recorded command. The pre-execution `running.json` fields match the corresponding result values apart from their expected not-yet-started/exit-null fields.

The raw inventory table below binds every original file. Its compact sorted-key ordered `{name,bytes,sha256,mode}` JSON (lexical name order, no trailing newline) SHA-256 is `e425d9dfc8d1b1905d9e567f2da3f8cf833e02c2d82b6d4025bae60bd95c34c8`. These observations independently support the focused FIRST; they do not qualify unrelated/native/audio work.

### Complete original raw artifact inventory

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `all-top-level-test-files-after.json` | 7980 | `1b33bccda423b6ad29ff438079fa8e0e0297dabc37b9f9fa9f29023953ca7d7e` |
| `all-top-level-test-files.json` | 7980 | `1b33bccda423b6ad29ff438079fa8e0e0297dabc37b9f9fa9f29023953ca7d7e` |
| `authorized-selection.json` | 22348 | `12ce92d9bd00c35365569dcecbad678c94b44ee20b48bcd5693f1e43a0a96df2` |
| `expected-case-names.json` | 11908 | `3b16636da8e9c3e7b63bc78e8692579504c0e39fe3e27b39b7942c11f2872f35` |
| `full-source-after.json` | 651771 | `1fe5add540691eb00185fa31a00d1812748f88899c2e969b383d7ddba7f17910` |
| `full-source-before.json` | 651771 | `1fe5add540691eb00185fa31a00d1812748f88899c2e969b383d7ddba7f17910` |
| `node-runtime.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `node-runtime.stdout` | 782 | `292ce6437aa16270ee5bdc058956ada71eb309cd3bdad80675b1277cee648604` |
| `node-version.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `node-version.stdout` | 9 | `4409d3bfa08b82f385bd424eeda65fc63b756129f0e89e82df77f1fecafccc14` |
| `ordered-outcomes.json` | 19456 | `832b2a10d2f315431a5910708444d7dab2436c128524be2e5eb57bd30e2814a1` |
| `result.json` | 9411 | `8c152852d3170fafbbc787174f1b96b067e269a95aa4787ba7d6e73b59a89a74` |
| `run-focused-node.py` | 22756 | `b3c3a4a65369d05c71d7be909a77976384bc55e42a30a4129e875da4032a6bd2` |
| `run.tap` | 31900 | `655d53c1ef68f1d62eefdb06834b840bb0b7bd8c60da22019ac82cd8b4e25cdc` |
| `running.json` | 6577 | `81b18594b4db3e0b90cd1b312b5abbe63fe002e29dc316bd6fa9600fe247a883` |
| `source-tree-entries.json` | 455122 | `7925f7ef09df022d94cc624c7c1eb25ab17567211a1791ee849005b9786c9250` |
| `stderr.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `test-files.json` | 177 | `0b56b88db635d41a1f9701717942349249dd3218f62ac96e653fd1b582b0fc47` |
| `tracked-after.json` | 325276 | `2752d5dcc47b21fb714086f5c7e5f6404c7a991ea52ce3a57cb0d64ea1a57306` |
| `tracked-before.json` | 325276 | `2752d5dcc47b21fb714086f5c7e5f6404c7a991ea52ce3a57cb0d64ea1a57306` |
| `tracked-inventory-after.json` | 152148 | `5cbdb863511ed113bd052918bee722079bd8ffd39f04b96991dd023e2c93f7e7` |
| `tracked-inventory-before.json` | 152148 | `5cbdb863511ed113bd052918bee722079bd8ffd39f04b96991dd023e2c93f7e7` |
| `tracked-top-level-test-files-after.json` | 7980 | `1b33bccda423b6ad29ff438079fa8e0e0297dabc37b9f9fa9f29023953ca7d7e` |
| `tracked-top-level-test-files.json` | 7980 | `1b33bccda423b6ad29ff438079fa8e0e0297dabc37b9f9fa9f29023953ca7d7e` |

## Retained evidence and copy binding

The functional package is `/workspace/scratch/6f2247f2f463/deckchek-pregig-recovery-functional/docs/engineering/evidence/pregig-recovery-functional-2026-11-21/`. Its `focused/` directory retains all 24 original files above with unchanged bytes and mode. The exact reviewed launcher and independently derived source/historical inventory are retained separately, together with a custody record and manifest.

I read the complete manifest/custody record and independently checked all 26 original-to-retained byte/mode comparisons, every manifest byte count/SHA-256/Git blob ID/path, and the complete actual file inventory. There are exactly **28 retained regular files totaling 2,930,522 bytes**, all mode 100644. The retained file map in lexical relative-path order, compact sorted-key `{path,bytes,sha256,git_blob_oid,mode}` JSON without a trailing newline, has SHA-256 `d6e9fb06437e9bf8fac9065cd89b99b103b3c9f0e48d866d08cbd2a5645e4993`.

| Additional retained file | Bytes | SHA-256 | Git blob |
| --- | ---: | --- | --- |
| `authorized-launcher.txt` | 247 | `e2b39fe5397d304f225452f40022b43131fb8f95fc7623d22aa67562fc3ba21b` | `da2b693bbc5688a06d76798d384985209ad2632c` |
| `custody-check.json` | 3852 | `abccb1749054cc587569893f55cf1b15692c6494ee6cbb22d5ba23c9dcac50e1` | `0edcad3134235a3bdeb5379927cfe216b091be02` |
| `independent-case-inventory.json` | 41647 | `5646a9a796a805af9d1653a48242047f5307794e4740a479f6d58d47d365b177` | `2fcef42dedd80f581d83dbe3134155fe13cb4a7b` |
| `manifest.json` | 14020 | `167af111fbea250eea848a8f2a7e7e64c24ad3ea6ad0c0d4e965b928d2f97896` | `a8f5db80257d80a688511aabfd252df896655ac0` |

The functional inventory's complete 132 `{file,name,line,added}` records equal my independently derived records. I also independently matched its 83 historical names, original case numbers, durations and passing outcomes against the original retained full TAP; the duration sum remains 14,628.461681 ms. Thus the retained inventory is not accepted merely because its digest matches the recorder configuration. There is no missing/additional package artifact or original-to-copy mismatch.

## Complete independently derived ordered case inventory

These 132 unique names were derived from full original source reads, Python literal-title extraction and explicit expansion of the reviewed source loops in registration order, without JavaScript evaluation/import. Ordering is lexical file order followed by source registration order. Counts are 59 core, 19 screen, 26 storage, 17 controller/UI and 11 strict-text cases. There are 83 older cases and 49 additions: 19 screen, 26 storage, 4 controller.

Compact UTF-8 JSON of the ordered name array hashes to `ccf2e633ca355f23b87b3e57c7eacf00a9ec31c5a3e42414f1847e5c21bb3dfb`. The compact sorted-key ordered `{file,name}` array hashes to `5d0e0990e498fcbf958a8ac086138a25d1895b48de20d28f89ab5f9a9e952344`. Both exclude a trailing newline. Each line reference identifies a literal registration or reviewed loop-expansion site; repeated source lines are intentional. Each `ok` and duration below was independently matched to the original FIRST TAP.

### `tests/pre-gig.test.mjs` — 59 cases

| # | Source line | Origin | FIRST | Duration ms | Complete case name |
| ---: | ---: | --- | --- | ---: | --- |
| 1 | 26 | Older | ok | 1.927105 | timecode: clean deck passes with no fix needed |
| 2 | 32 | Older | ok | 1.116238 | timecode SNR: 25 passes, 24.9 amber, 20 amber, 19.9 red (AC-3 action and DVS link) |
| 3 | 43 | Older | ok | 0.512846 | timecode balance: 1.5 passes, 1.6 amber, 3 amber, 3.1 red, sign does not matter |
| 4 | 51 | Older | ok | 0.363269 | timecode phase error: 10 passes, 10.1 amber, 20 amber, 20.1 red |
| 5 | 59 | Older | ok | 0.311481 | timecode dropouts: 0 passes, 1 amber, 2 red |
| 6 | 67 | Older | ok | 0.385834 | timecode speed: 1% passes, 1.1% amber (pitch), 5% amber, 5.1% red means wrong format |
| 7 | 77 | Older | ok | 0.351451 | timecode: worst metric wins, every issue gets one fix, unverified format warns |
| 8 | 88 | Older | ok | 0.356559 | timecode: no signal is red with needle, switch and cable advice; missing evidence is skipped, errors are amber-level error |
| 9 | 101 | Older | ok | 0.593408 | timecode: capture problems become actions, not crashes |
| 10 | 121 | Older | ok | 0.595781 | signal level: -50 dBFS passes, -50.1 on either channel is red and names the channel |
| 11 | 132 | Older | ok | 0.439795 | hum: 40 dB below the carrier is amber, 25 dB is red, above 40 passes; hum below the floor margin is ignored |
| 12 | 142 | Older | ok | 0.193623 | hum that could not be measured is amber with a retry, never a silent pass |
| 13 | 151 | Older | ok | 0.498674 | audio: missing interface is red with connection and Sound-settings actions; sample-rate mismatch is amber |
| 14 | 166 | Older | ok | 0.3972 | midi: present passes, optional missing is amber, required missing is red, no backend is unsupported |
| 15 | 180 | Older | ok | 0.221104 | headphones: yes passes, no is red with cue advice, skip or none is skipped |
| 16 | 196 | Older | ok | 1.584957 | software: crash within 1 h red, within 24 h amber, older passes; boundaries inclusive |
| 17 | 212 | Older | ok | 0.342018 | software: not installed and not running are amber with actions; no backend is unsupported |
| 18 | 222 | Older | ok | 3.392071 | system: driver and event findings filtered to the preset gear, warnings amber, errors red, unsupported excluded |
| 19 | 242 | Older | ok | 0.572586 | evidence errors become "Check could not run" with a retry for every kind |
| 20 | 253 | Older | ok | 0.45001 | every red or amber result carries a fix with a label and plain-English text |
| 21 | 272 | Older | ok | 0.717134 | rollUp matrix (AC-2): fail is red, warn or error is amber, skipped required is incomplete, else green |
| 22 | 291 | Older | ok | 0.176787 | rollUp: unsupported steps are excluded from the verdict and mark the check partial (AC-5) |
| 23 | 301 | Older | ok | 0.307626 | rollUp: top problems sorted red, amber, then skipped required; copy matches the spec wording |
| 24 | 312 | Older | ok | 0.404231 | buildPlan orders parallel steps first, then per-deck steps, then the headphone cue |
| 25 | 323 | Older | ok | 0.338663 | buildPlan honours skip and only, drops MIDI and software when the preset has none, and stays inside the 120 s budget |
| 26 | 338 | Older | ok | 0.808653 | built-in presets validate and reference the owner's real gear profile ids and known formats |
| 27 | 353 | Older | ok | 0.744857 | built-in presets load through loadBuiltinPresets and bad ones are reported |
| 28 | 366 | Older | ok | 0.771156 | validatePreset: bad deck ids, duplicates, inputs, formats, rates, MIDI and gear references |
| 29 | 391 | Older | ok | 2.975912 | presets: newer versions are read-only, import rejects >256 kB and junk, export/duplicate round-trip (AC-8) |
| 30 | 419 | Older | ok | 0.930598 | presetFromEquipment builds a valid preset from real profiles; deck B defaults to inputs 3-4 and the format comes from the media library |
| 31 | 436 | Older | ok | 0.195626 | formatForMedia resolves timecode media only, from the library, in any container shape |
| 32 | 444 | Older | ok | 0.33692 | the built-in rigs on a multi-pair interface put deck A on 1-2 and deck B on 3-4 (Traktor Audio 8 DJ) |
| 33 | 450 | Older | ok | 0.134754 | namesMatch is forgiving but refuses tiny fragments |
| 34 | 459 | Older | ok | 0.404652 | diffRuns lists which steps changed and whether they improved (AC-6) |
| 35 | 480 | Older | ok | 708.085709 | synthetic Traktor MK2 timecode from the generator passes both deck steps |
| 36 | 487 | Older | ok | 1217.654018 | synthetic: noisy carrier is amber then red as the SNR falls (real analyzeTimecode) |
| 37 | 495 | Older | ok | 520.617387 | synthetic: one muted channel is red, naming the channel; silence is a no-signal red |
| 38 | 508 | Older | ok | 1069.322033 | synthetic: dropouts and a wrong-format record are caught |
| 39 | 517 | Older | ok | 3000.81844 | synthetic hum: 50 Hz and 60 Hz families are detected and graded against the carrier |
| 40 | 535 | Older | ok | 366.534245 | synthetic needle-up hum is measured on the lifted segment |
| 41 | 542 | Older | ok | 289.009166 | summarizeTimecode exposes plain numbers and handles failures |
| 42 | 568 | Older | ok | 589.332902 | runPregig: an all-ready rig produces a green verdict with every automatic step passing (AC-1) |
| 43 | 583 | Older | ok | 1174.196624 | runPregig: deck B captures input pair 3-4 and deck A pair 1-2, so a two-deck rig can be green |
| 44 | 593 | Older | ok | 1194.769707 | runPregig: a pair the interface does not offer is reported as no such input, not a failure |
| 45 | 609 | Older | ok | 0.194153 | deckPairFirst maps zero-based deck inputs to the 1-based first channel of a stereo pair |
| 46 | 618 | Older | ok | 0.588026 | runPregig: audio interface missing is red, signal steps are skipped (blocked) and nothing is captured (AC-4) |
| 47 | 632 | Older | ok | 587.428292 | runPregig: a thrown step is an error row, the verdict is amber and the other steps still run |
| 48 | 642 | Older | ok | 620.830928 | runPregig: Esc cancels, finished steps are kept and the rest are skipped (cancelled) (AC-7) |
| 49 | 658 | Older | ok | 600.007153 | runPregig: manual time is reported separately and excluded from the duration |
| 50 | 668 | Older | ok | 24.724573 | runPregig: orchestration overhead with instant mocked captures stays far below 5 s |
| 51 | 675 | Older | ok | 602.303042 | runPregig: CAPTURE_BUSY offers to stop the other capture, retries once and records the choice |
| 52 | 690 | Older | ok | 578.340806 | runPregig: one capture feeds both deck steps; only/skip re-run just the chosen steps |
| 53 | 701 | Older | ok | 393.695503 | runPregig: needle-up hum asks the user, captures the lifted segment and grades it |
| 54 | 715 | Older | ok | 0.349926 | runPregig: no desktop backend leaves required steps skipped and the verdict incomplete (AC-5) |
| 55 | 724 | Older | ok | 0.505891 | createNativeDeps drives the Tauri commands with the pre-gig capture holder and captures the deck input pair |
| 56 | 745 | Older | ok | 584.148078 | toRunInput maps a run to the pregig_save_run contract, redacting Windows user paths |
| 57 | 762 | Older | ok | 0.4255 | createPregigApi (native) sends exactly the contract argument names |
| 58 | 780 | Older | ok | 2.776726 | createPregigApi (browser) stores runs and presets locally with the same shapes |
| 59 | 807 | Older | ok | 0.095463 | contract examples are real step results shapes (states the database accepts) |

### `tests/pregig-storage-screen.test.mjs` — 19 cases

| # | Source line | Origin | FIRST | Duration ms | Complete case name |
| ---: | ---: | --- | --- | ---: | --- |
| 60 | 77 | Added | ok | 37.025002 | Pre-gig screen keeps unavailable preset storage visible across tabs and retries without silently choosing a rig |
| 61 | 92 | Added | ok | 2.982065 | Pre-gig screen distinguishes unavailable History from confirmed empty History and recovers on Retry |
| 62 | 106 | Added | ok | 4.310723 | Pre-gig screen retains previously loaded History with a persistent unavailable message after a failed refresh |
| 63 | 118 | Added | ok | 5.768075 | Pre-gig preset Save keeps the same draft and inline error after denied persistence, then confirms one successful retry |
| 64 | 136 | Added | ok | 4.294488 | Pre-gig preset Save coalesces repeated clicks and keeps the dialog open while persistence is pending |
| 65 | 148 | Added | ok | 3.783981 | Pre-gig a failed pending preset save restores draft editing and preserves every entered value for retry |
| 66 | 168 | Added | ok | 2.784768 | Pre-gig keeps an acknowledged preset and truthful success when the subsequent list refresh is unavailable |
| 67 | 180 | Added | ok | 3.115947 | Pre-gig an acknowledged preset save finishes while an optional refresh is still pending |
| 68 | 191 | Added | ok | 12.469212 | Pre-gig actual Retry and shell Save retain the completed result and never claim persistence before it succeeds |
| 69 | 211 | Added | ok | 5.754554 | Pre-gig saving a different preset keeps an unsaved check attached to the rig it actually tested |
| 70 | 225 | Added | ok | 9.459636 | Pre-gig Done preserves an unsaved result until the user confirms discarding it |
| 71 | 225 | Added | ok | 12.225766 | Pre-gig choosing another preset preserves an unsaved result until the user confirms discarding it |
| 72 | 225 | Added | ok | 10.457307 | Pre-gig running everything again preserves an unsaved result until the user confirms discarding it |
| 73 | 235 | Added | ok | 1.862091 | Pre-gig a late failed History request cannot replace a newer successful read |
| 74 | 245 | Added | ok | 1.204712 | Pre-gig disposal retires a pending History presentation and the Save callback |
| 75 | 254 | Added | ok | 5.098938 | Pre-gig import retains the parsed draft after a failed save and retries without picking the file again |
| 76 | 271 | Added | ok | 1.714028 | Pre-gig displays future-version presets read-only without running or rewriting their contents |
| 77 | 303 | Added | ok | 11.47073 | Pre-gig PDF keeps the tested interface after the same saved preset is edited |
| 78 | 319 | Added | ok | 3.501927 | Pre-gig PDF preparation cannot export or announce a result retired before its handoff |

### `tests/pregig-storage.test.mjs` — 26 cases

| # | Source line | Origin | FIRST | Duration ms | Complete case name |
| ---: | ---: | --- | --- | ---: | --- |
| 79 | 29 | Added | ok | 1.62244 | browser Pre-gig treats only a confirmed absent key as an empty collection |
| 80 | 45 | Added | ok | 0.606252 | browser Pre-gig runs preserves malformed JSON through reads and attempted writes |
| 81 | 45 | Added | ok | 0.364949 | browser Pre-gig runs preserves empty text through reads and attempted writes |
| 82 | 45 | Added | ok | 0.309916 | browser Pre-gig runs preserves non-array JSON through reads and attempted writes |
| 83 | 45 | Added | ok | 0.627264 | browser Pre-gig runs preserves partly invalid rows through reads and attempted writes |
| 84 | 45 | Added | ok | 0.42569 | browser Pre-gig runs preserves duplicate ids through reads and attempted writes |
| 85 | 45 | Added | ok | 0.297036 | browser Pre-gig runs preserves invalid nested data through reads and attempted writes |
| 86 | 45 | Added | ok | 0.387052 | browser Pre-gig runs preserves unrepresentable JSON numbers through reads and attempted writes |
| 87 | 45 | Added | ok | 0.343085 | browser Pre-gig presets preserves malformed JSON through reads and attempted writes |
| 88 | 45 | Added | ok | 0.457338 | browser Pre-gig presets preserves empty text through reads and attempted writes |
| 89 | 45 | Added | ok | 0.181563 | browser Pre-gig presets preserves non-array JSON through reads and attempted writes |
| 90 | 45 | Added | ok | 1.82828 | browser Pre-gig presets preserves partly invalid rows through reads and attempted writes |
| 91 | 45 | Added | ok | 0.360813 | browser Pre-gig presets preserves duplicate ids through reads and attempted writes |
| 92 | 45 | Added | ok | 0.213682 | browser Pre-gig presets preserves invalid nested data through reads and attempted writes |
| 93 | 45 | Added | ok | 0.153812 | browser Pre-gig presets preserves unrepresentable JSON numbers through reads and attempted writes |
| 94 | 55 | Added | ok | 0.672762 | browser Pre-gig read denial refuses every dependent mutation and recovers without replacing data |
| 95 | 72 | Added | ok | 0.509777 | browser Pre-gig save run reports a denied write and succeeds only after storage accepts retry |
| 96 | 72 | Added | ok | 0.354844 | browser Pre-gig create preset reports a denied write and succeeds only after storage accepts retry |
| 97 | 72 | Added | ok | 0.321624 | browser Pre-gig edit preset reports a denied write and succeeds only after storage accepts retry |
| 98 | 72 | Added | ok | 0.256726 | browser Pre-gig delete preset reports a denied write and succeeds only after storage accepts retry |
| 99 | 82 | Added | ok | 1.700417 | browser Pre-gig refuses missing providers and missing writer methods |
| 100 | 96 | Added | ok | 0.173381 | browser Pre-gig does not treat a non-string undefined storage read as confirmed absence |
| 101 | 102 | Added | ok | 0.789868 | native Pre-gig bypasses a throwing browser storage getter while browser errors remain typed |
| 102 | 116 | Added | ok | 135.699468 | browser Pre-gig preserves the newest-one-hundred retention rule and complete result details |
| 103 | 127 | Added | ok | 6.447526 | browser Pre-gig retains future preset versions and existing string-JSON records without writes |
| 104 | 137 | Added | ok | 0.457088 | browser Pre-gig refuses unserializable or non-finite new data before replacing prior bytes |

### `tests/pregig-ui.test.mjs` — 17 cases

| # | Source line | Origin | FIRST | Duration ms | Complete case name |
| ---: | ---: | --- | --- | ---: | --- |
| 105 | 15 | Older | ok | 1.238824 | describeStep: an input pair the interface lacks reads as "no such input", not a failure |
| 106 | 24 | Older | ok | 0.1663 | describeStep: every engine state has a word and a tone; live states are not chips |
| 107 | 34 | Older | ok | 1.010089 | verdictView: only deck B unmeasured gives an amber "Not fully checked" that says why |
| 108 | 44 | Older | ok | 0.273671 | verdictView: red stays red and still notes deck B; green copy is the engine copy |
| 109 | 52 | Older | ok | 0.260793 | fixButtons: keeps actions, dedupes, info entries have no action |
| 110 | 59 | Older | ok | 0.441093 | evidenceRows: labels, units, nesting, empties dropped |
| 111 | 67 | Older | ok | 0.509116 | rerunTargets and mergeRerun: only the chosen steps change and the verdict is recomputed |
| 112 | 78 | Older | ok | 0.313721 | compareView: trends and headline |
| 113 | 85 | Older | ok | 0.390097 | profilesForPreset: judges only the rig, not every profile in the library |
| 114 | 91 | Older | ok | 0.23292 | runMatchesPreset: built-ins match by notes, saved presets by id |
| 115 | 98 | Older | ok | 0.331509 | time text |
| 116 | 112 | Older | ok | 4.338665 | controller: full run keeps deck input-pair skip honest, saves once, compares on the second run |
| 117 | 132 | Older | ok | 1.122087 | controller: cancel keeps partial results as cancelled; rerun merges and saves a new run |
| 118 | 151 | Added | ok | 2.429604 | controller: failed browser persistence retains the completed result and retry never repeats the check |
| 119 | 170 | Added | ok | 5.597378 | controller: overlapping save retries share one write and cannot be replaced by a new run or reset |
| 120 | 185 | Added | ok | 0.53903 | controller: unavailable history does not become an empty baseline or a successful save |
| 121 | 196 | Added | ok | 0.661605 | controller: a failed save after rerun cannot retain the previous result success marker |

### `tests/text-file-boundary.test.mjs` — 11 cases

| # | Source line | Origin | FIRST | Duration ms | Complete case name |
| ---: | ---: | --- | --- | ---: | --- |
| 122 | 50 | Older | ok | 9.466206 | pre-gig refuses an oversized selected preset before reading or saving |
| 123 | 58 | Older | ok | 2.835024 | pre-gig catches file read errors and preserves the existing preset collection |
| 124 | 65 | Older | ok | 1.605564 | pre-gig rejects mismatched read lengths before parsing or saving |
| 125 | 72 | Older | ok | 2.345348 | pre-gig consumes one strict UTF-8 snapshot while retaining valid Unicode presets |
| 126 | 81 | Older | ok | 1.428038 | pre-gig rejects malformed UTF-8 without saving a replacement-decoded preset |
| 127 | 106 | Older | ok | 3.634366 | media import rejects malformed UTF-8 instead of storing replacement text |
| 128 | 114 | Older | ok | 2.479299 | media import rejects invalid declared sizes before reading |
| 129 | 124 | Older | ok | 4.18284 | media import rejects mismatched read lengths and preserves normal one-read imports |
| 130 | 133 | Older | ok | 1.289669 | media import reports byte-read failures without storing a profile |
| 131 | 140 | Older | ok | 1.097391 | bounded text reads preserve UTF-8 BOM compatibility and measure the byte boundary |
| 132 | 148 | Older | ok | 0.380592 | bounded text reads reject incomplete reads and non-buffer results before decoding |

## Preserved boundaries and sealed handoff

The qualified main head remains `e36ddc41806b0f6639474f207e3b339e063a6e25`. The durable held Backup + Service checkpoint remains `34afefa58ac5e8346006087587b113c2a82d5a39`, tree `949f6c334a725b84084736f15e9b9efcf6807e14`, sole parent Player `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`, on `checkpoint/deckchek-backup-service-held-20261121`. Earlier focused Backup 193/193 and Service 123/123 records remain separate evidence.

The original complete-suite audio HOLD remains **2,420 cases / 2,418 passing / 1 failure / 1 optional skip**, including its original case 53 measured gain of −101 dB at played −30 dBFS. That old suite numbering is distinct from the focused inventory above. No cause, repair, rerun or later-pass substitution is claimed. Native #85 ownership/cache/startup/exit work remains unqualified; Service #86 qualified integration, Population #88 and System #89 remain separate queued work. Fleet remains off under its existing timing hold. No whole-suite pass, native launch, physical-audio result, release, deployment, publication or credit-exhaustion claim follows from this audit.

This report is sealed as a report-only commit with sole parent `2ac0cf4dc25cb17471149ba64c83b3855c319d45`. The exact commit/tree/report-byte/hash/blob identities are delivered in the post-seal handoff so the report does not attempt to self-hash. Post-seal verification checks the sole added path, clean checkout, immutable parent/tree bindings and every original frozen file's bytes/mode again. No other file is changed by this lane. Root receives the complete report and retains responsibility for integration and any next rotation after all three final lane handoffs.
