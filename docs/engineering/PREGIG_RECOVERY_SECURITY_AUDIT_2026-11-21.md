# Pre-gig recovery — FINAL scoped security ACCEPT

**Round:** 17, 2026-11-21  
**Lane:** independent defensive security, static source and retained-data review  
**Candidate:** `2ac0cf4dc25cb17471149ba64c83b3855c319d45`  
**Branch:** `review/deckchek-pregig-recovery-security-20261121`

## Disposition

**FINAL SCOPED ACCEPT.** The corrected browser persistence, save/draft recovery and retained-result export changes have no remaining material blocker within this review. All four original round-sixteen findings are addressed in the reviewed candidate. The single root-authorized functional FIRST passed **132/132**, including **49/49 new cases**, with unchanged source and independently verified original/retained evidence.

This accepts the specified JavaScript source and its explicit test seams. It does not qualify native execution, real PDF rendering, platform behavior, a release or the complete application. A pre-existing native custom-preset deletion/retained-association gap remains explicitly carried below for root's separate correction. Existing full-source audio HOLD, native backup #85, fixed published heads and default-off Fleet remain unchanged. Security performed source and retained-data review only.

## Frozen input and independent custody

The reviewed candidate has tree `285b665343d91b6cabebc0f0210fa661865d7305` and sole ordered parent `f4d727cb9243b60594dc0df73da3d0808d698b81`. The security branch began exactly there with a clean index and worktree. Root owns implementation/tests; this lane owns only this report. Original source, tests and other lanes' evidence remain immutable.

I independently enumerated the entire Git tree, read every distinct immutable blob, recomputed each Git blob identity, compared every working file's bytes and regular-file mode with its immutable entry, checked the complete tracked-path inventory and counted original top-level tests. These are Git/Python standard-library data checks, not project execution. No tracked `AGENTS.md` was present.

| Measure | Independently verified value |
| --- | --- |
| Original tracked paths | 2,546 |
| Distinct immutable blobs | 2,288 |
| Sum of bytes over tracked paths | 88,465,624 |
| Original top-level tests | 207 |
| Ordered source-map SHA-256 | `e02518433215984d516ed73d2f104acc93ed1f80a428ebf6b07ad61b3af32c5d` |

The map is the complete ordered array of `{path,mode,oid,bytes,sha256}` records, serialized as compact UTF-8 JSON with sorted keys. Counts refer to the freeze before review additions; each repeated blob remains bound to its path/mode. Counts and summary flags never substitute for per-file verification.

### Cumulative production identities

| Frozen path | Mode | Bytes | Git blob | SHA-256 |
| --- | --- | ---: | --- | --- |
| `app/pre-gig.js` | `100644` | 56,837 | `7415077ef47cd6f57c8afaf8c6b357a7b571780b` | `0c2c6369bb06fa7e06e52da1d3b15f20f3f49d722d7af1ff2968f66c56370184` |
| `app/ui/workflows/pregig.js` | `100644` | 17,781 | `9defec364e0bbaa843bb4ec9ae194ca2b21e241b` | `49c9f921ea53ae9f9ed57f901c68b8b1198e80c4a87c3a0ad406333228070ad7` |
| `app/ui/screens/pregig.js` | `100644` | 56,158 | `166285e5ea8d37970988dc83fa3a140e1baf7167` | `23d52407552d5a68060bba6492a9a49fefb56908a993fc71dd6f2456a05740df` |

I read all three cumulative modules, all five selected test files, both DOM fixtures and the signal fixture; the original/recovery implementation and scope; all three original round-sixteen reports and the static HOLD continuation. I also read complete actual Pre-gig printable, persistence feedback, PDF, text-file, DOM/live/shell/state, device library/state and catalog consumers; `tests/contracts/pregig.json`; and `src-tauri/src/pregig.rs`. Native registration was checked at `src-tauri/src/lib.rs:243–249`. Reading unchanged consumers establishes the call chain without newly qualifying every existing behavior.

The native Pre-gig module, contract, printable module, persistence helper, PDF adapter and service DOM fixture remain byte-identical to pre-Pre-gig source `b71a81a849c0bad9f24b4ba7ea40366e86769501`. This correction introduces no native command, schema, dependency, permission, collector or network endpoint.

## Assets and trust boundaries

Assets are saved history, presets and imported drafts; truthful acknowledgement of a particular submitted value; ownership of a retained result across asynchronous work; and escaped, accurately attributed JSON/printable output. Storage and selected files are fallible data sources. Failed reads or malformed registries must not become confirmed emptiness before a write. Acknowledgement must correspond to the submitted snapshot, and later work must not substitute another result or rig.

The browser adapter is reviewed under ordinary storage semantics and JSON-shaped application data. This is not a hostile-renderer boundary, protection against arbitrary objects with side-effecting getters/overrides, an atomic multi-tab store, or defense against a provider that falsely acknowledges persistence. Native IPC is a separate compatibility reference. Native row bounds/transactions remain distinct from browser registry checks. DOM, storage, timing and renderer bridge seams do not qualify a real browser, WebView, operating system, dialog or physical renderer.

## Resolution of the original static HOLD

Round-sixteen source `b7a979cfc24eca569713ff319c5838eaa13d1a34` remains an unexecuted static HOLD. Its security report is preserved in commit `201350e15c67d75b8e3caacd389e8d3c78a9a1ea`; code/functional reports remain in `3e863501f2dfa5f4fa029a761fd81d24f01a574c` and `6bc0db3ab13c18363e0d5b51c04057b0922b5e06`. A later result cannot qualify those earlier bytes.

| Original finding | Correction and verification | Disposition in current source |
| --- | --- | --- |
| SEC-PG16-01: later draft edits could be lost after earlier pending Save | Deeply detach validated submitted data; lock every form input/select/textarea/deck button during write; restore prior disabled states after failure; refresh owns a separate outcome. Screen cases inspect controls, retained draft/retry data and acknowledgement before deferred refresh. | Closed for draft/acknowledgement ownership. |
| SEC-PG16-02: PDF metadata could use a later edited preset | Capture retained run/preset before preparation; pass current-result predicate through feedback/retry/fallback; JSON fallback retains same run. Real screen/printable HTML and filename are checked through fake renderer acknowledgement. | Closed for provenance and retirement before helper handoff; no cancellation claim after PDF adapter submission. |
| SEC-PG16-03: fixture called catalog setup a Pre-gig mutation | Keep all-key write log; select runs/presets/last-preset keys for forbidden Pre-gig mutation assertions. Retain raw original collection assertions and real catalog initialization. | Validation blocker closed by correct namespace accounting. |
| SEC-PG16-04: per-case documents conflicted with cached feedback hosts | Keep one document/live/toast host set across the module; clear feedback and dispose/remove owned screens/dialogs per case. Production live caching and success assertions remain. | Validation blocker closed for the fixture's document lifetime. |

### Submitted draft and acknowledgement

The form begins with a detached preset (`app/ui/screens/pregig.js:166–225`). `collect()` includes mutable deck data, but Save further calls `structuredClone(out)` before setting saving/busy and before awaiting persistence (`228–249`). The busy map records every draft control's original disabled state, locks them all and restores those states in `finally`. Duplicate Save and dialog-close guards remain. This protects ordinary application interactions, not arbitrary script mutation of DOM properties.

After `upsertPreset` acknowledges, `savePreset` caches its returned row and starts refresh without awaiting it (`155–163`). Refresh owns independent persistent unknown/error feedback. Acknowledged Save closes with the submitted name even while refresh is pending. A failed write retains the draft and inline error for editing/Retry. The failure regression checks retained name, interface, software and MIDI and actual successful retry contents.

### Retained result and export provenance

`exportPDF` captures `S.run` and `S.preset` before its first await (`620–626`). Its predicate requires an undisposed screen, done phase and identical run object. Ownership is rechecked before calling the feedback helper; device metadata comes from the captured preset. JSON fallback uses the same captured run, and `exportRun(run)` derives data/filename from that argument. Form/cache replacements after editing do not mutate the retained controller preset.

The unchanged helper checks ownership before starting, after module preparation and after export acknowledgement, and scopes retry/fallback actions. Its contract explicitly does not cancel an already submitted export. The adapter has its own asynchronous version/CSS/dialog/renderer work after handoff. The retirement regression retires before handoff, appropriately expecting zero dialog/renderer calls. The provenance regression inspects actual HTML/filename, with only native acknowledgement stubbed.

## Cumulative defensive conclusions

### Strict browser collection reads and writes

The browser collection layer is `app/pre-gig.js:717–807`. Only `getItem` returning `null` confirms absence. Missing providers, getter/read failures, non-string data, malformed JSON, non-array registries, invalid members, duplicate identifiers and non-finite values produced while decoding the collection JSON reject the whole read. Invalid rows are not filtered away before overwriting their originals. Mutations read the original registry before constructing a replacement.

Run validation checks required identifiers/time/version fields, verdicts, nonnegative safe-integer duration, steps/status/summary and supported optional shapes. Preset validation checks its envelope and object or existing JSON-string body with the established parser. Before `setItem`, the complete replacement is validated, serialized with finite-number rejection and parsed/validated again. Invalid or unsupported serialization fails before writing. Fixed typed browser errors suppress provider text. Save/upsert/delete success follows successful `setItem`, not an attempted write.

Run retention still keeps the newest 100 only as part of a successful complete write. Missing-preset deletion returns false without writing. Tests retain original damaged strings and exercise denied reads/writes, confirmed absence, recovery, strict representations, unavailable providers, retention and native bypass. These are application storage properties, not certification of browser quota, OS durability or malicious-provider behavior.

No aggregate browser registry byte limit or multi-tab transaction is added. The existing 256 KiB selected-file limit is a separate boundary from parsing a registry already in local storage. No hostile-object, memory-pressure, scanner or exploitation experiment occurred, and normal fixtures establish no such protection.

### Controller save ownership and recovery

At `app/ui/workflows/pregig.js:188–289`, save ownership is installed before reentrant state notification. Concurrent requests share the in-flight task; start/reset/rerun reject while saving. Persistence uses captured run/preset values. Failed preceding-history reads remain errors instead of empty comparison baselines. Failed acknowledgements retain completed results as unsaved; Retry persists that result without rerunning measurements. Rerun clears the preceding saved/compare acknowledgement before its own save. Measurement algorithms and verdict thresholds are unchanged.

Controller cases inspect shared writes, retained run identity, unknown history, no engine rerun on Retry and removal of the preceding success identifier when replacement persistence fails. Their engine/API are explicit seams. Production browser API shape/acknowledgement behavior is separately reviewed/tested; arbitrary injected API corruption is not part of its compatibility contract.

### Persistent unknown state, replacement and import lifecycle

Preset/history requests have sequence/disposal ownership guards. Failed reads preserve loaded rows with persistent unknown-state guidance instead of reporting emptiness. Users can explicitly choose a known built-in while custom storage is unavailable. A validated successful retry replaces that state. `presetView` rejects malformed envelopes, parser failures and duplicate identifiers rather than silently dropping individual rows.

Unsaved results remain visible with Retry. Replacement flows capture the result addressed by confirmation, then recheck identity, phase, disposal and saving after the asynchronous answer. Delayed confirmation cannot authorize discarding a different result. Imported drafts are parsed once, retained on failed persistence and reused on Retry without repicking or rereading. Duplicate retries and close while saving are guarded. These controls remain scoped to actual paths, without a promise to cancel dispatched native work or all operations after screen hiding.

### Future versions and native compatibility

The established parser preserves future-version presets and marks them read-only. Screen controls disable run/edit/duplicate while the existing export removes internal view flags and preserves ordinary JSON fields. Existing JSON-string records remain supported. Reading does not migrate or rewrite unknown future records. Browser API and actual-screen seams cover both representations.

Native dispatch returns before resolving browser storage. Six persistence command names/shapes remain unchanged: save run, list runs, get run, preset upsert, preset list and preset delete. The complete native module and contract were read as unchanged source references. Native run save returns its identifier after transaction commit and uses bound values. Native validation retains distinct step, evidence, fix, duration, notes/name and preset-JSON limits. This establishes source compatibility, not native execution or equivalence to browser bounds.

**Carried native follow-up — active preset deletion and retained association.** The code reviewer identified an existing native recoverability gap; I independently confirmed the source relationship and baseline. Custom Delete (`app/ui/screens/pregig.js:320–323,657`) lacks active-running/saving/unsaved-result ownership protection. `toRunInput` preserves a nonbuiltin preset association (`app/pre-gig.js:708–714`), while native `save_run` requires that associated preset to exist (`src-tauri/src/pregig.rs:306–317`). Removing that association can leave a later retained result unable to save through ordinary Retry. The database's behavior for already stored history does not repair a future in-memory payload.

The same Delete flow/button and serialization existed in baseline `b71a81a849c0bad9f24b4ba7ea40366e86769501`; the entire native file is unchanged. Root carries this as a separate ownership/valid-association correction with coverage. It was not reproduced, patched or added to this focused selection and is not closed by its pass. The current scoped ACCEPT must not be read as native workflow qualification or universal save recoverability.

### Text sinks and privacy

Reviewed draft, retained-import, status, failure and history flows use DOM text properties. Chip text is escaped at `app/ui/icons.js:70–72`. The printable module escapes data through `ctx.esc`; shared report composition escapes title, summary and device. Existing CSS string handling and filename normalization remain in the real PDF path. The correction introduces no new unsanitized dynamic HTML or string-to-code path.

Fixed-message protection applies to browser storage errors. Existing native/file/PDF friendly errors do not acquire that promise. Run serialization retains its prior user-path redaction, but this audit claims no comprehensive redaction/privacy for every name, measurement or evidence value. Explicit local JSON/PDF actions export retained result data. No remote collector, transport, authentication endpoint or permission is added.

## Selected tests and their seams

All five files were read completely. Names were independently derived from literal declarations and exact bounded source tables using Python standard-library data parsing. No JavaScript evaluation/import, extracted implementation or project execution was used. Three template declarations expand to three discard actions, two collections times seven invalid representations and four denied-write actions. All 132 names are unique; the complete ordered inventory is appended.

| Selected file | Cases | Older | Added |
| --- | ---: | ---: | ---: |
| `tests/pre-gig.test.mjs` | 59 | 59 | 0 |
| `tests/pregig-storage-screen.test.mjs` | 19 | 0 | 19 |
| `tests/pregig-storage.test.mjs` | 26 | 0 | 26 |
| `tests/pregig-ui.test.mjs` | 17 | 13 | 4 |
| `tests/text-file-boundary.test.mjs` | 11 | 11 | 0 |
| **Total** | **132** | **83** | **49** |

Ordered names-only compact JSON SHA-256 is `ccf2e633ca355f23b87b3e57c7eacf00a9ec31c5a3e42414f1847e5c21bb3dfb`. Ordered sorted-key `{file,name}` compact JSON SHA-256 is `5d0e0990e498fcbf958a8ac086138a25d1895b48de20d28f89ab5f9a9e952344`. Both independently agree with the exact configuration.

The 83 older names come from immutable pre-Pre-gig source, each matching exactly one top-level original `ok` in retained round-ten TAP. That TAP is 555,767 bytes, SHA-256 `e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`; matched durations sum to exactly 14,628.461681 ms. Historical passes do not qualify changed bytes, and that sum is not a future wall-time guarantee. Existing synthetic core signal work is bounded. New cases add small DOM/storage/controller operations and a 105-save retention loop without a new diagnostic workload.

The screen fixture installs one document and shared feedback hosts across the imported module graph. Each case gets fresh storage state and an all-key log; `pregigWrites` selects runs, presets and last-preset preference. The real memoized catalog store/library initialization can write to storage captured at first import, even for an empty library. That initialization remains enabled and is excluded only from Pre-gig-specific mutation claims. Raw damaged collection strings are separately checked.

Explicit fixture dispatch does not enforce disabled controls or await returned listener promises. Assertions therefore inspect control states and bounded settled outcomes. Disposal, removal of owned nodes and restored mocks clean each case while the document remains consistent with the production feedback-host cache. The small DOM seam does not qualify browser focus, layout, accessibility or modal/inert behavior.

New PDF regressions use actual `report-pdf`, real Pre-gig registration/composition and actual print CSS. A temporary bridge supplies platform/version and a save-dialog response, checks the renderer command and retains HTML. Its fake acknowledgement launches no native renderer and creates no PDF file. The cases verify original interface/filename after editing and result retirement before handoff. Physical rendering, native execution and real dialogs remain unqualified. Text-boundary tests use real import handlers with bounded byte reads and strict UTF-8; Preview uses no physical audio capture.

### Selected file identities

| Frozen file | Bytes | Git blob | SHA-256 |
| --- | ---: | --- | --- |
| `tests/pre-gig.test.mjs` | 50,840 | `123e554cbc7fd95ef1335cf11f77ff46c02e8d59` | `f813fa152e82998fa67ea49a2d78a7fa2d0cf214f600ab92b86bc94384c76d12` |
| `tests/pregig-storage-screen.test.mjs` | 23,899 | `a3413004846069c96e7035e5f6c46abc7fbb30e1` | `2779ff267b814db961bd250612093cb4875cc51f1683fd7ec162f46e7ecad5ad` |
| `tests/pregig-storage.test.mjs` | 9,582 | `610ca5c478224a590e0bb43a047dfc5d50a60451` | `0fc88abc7554c9785a9e0f5dae8cdfdcc8b46f0be84d0a9710ec6d30cc6d6b4f` |
| `tests/pregig-ui.test.mjs` | 14,311 | `76f662a36fc557b74807d5864618f2fcd793ec2c` | `c18d29747b125d940ce273ec9744954b74f913a8343b32d9c082d7c7d9b6be55` |
| `tests/text-file-boundary.test.mjs` | 7,893 | `b8a00e3014d7c885da812a5d304f8c95c5df1d98` | `7e63b3bc04fd1da8a66b15ef20d5956072bec7dca238dece64d7355f2a2f1b23` |

## Exact functional controls and original FIRST

All three reviewers supplied preliminary source ACCEPTs. I then read all 385 recorder lines, all 274 configuration lines and the exact one-line launcher before sending the byte-bound control ACCEPT. Configured case/file pairs and source pins match my independent inventory. Node was checked as file data, without invoking it. The raw directory was absent. Root separately reviewed source, controls, runtime and budgets and authorized only the current functional worker's single FIRST; security did not execute it.

Original controls are under `/workspace/scratch/6f2247f2f463/`:

| Control | Bytes | SHA-256 |
| --- | ---: | --- |
| `deckchek-pregig-recovery-round17-focused-recorder.py` | 22,756 | `b3c3a4a65369d05c71d7be909a77976384bc55e42a30a4129e875da4032a6bd2` |
| `deckchek-pregig-recovery-round17-focused-selection.json` | 22,348 | `12ce92d9bd00c35365569dcecbad678c94b44ee20b48bcd5693f1e43a0a96df2` |
| `deckchek-pregig-recovery-round17-focused-launcher.txt` | 247 | `e2b39fe5397d304f225452f40022b43131fb8f95fc7623d22aa67562fc3ba21b` |

The launcher uses the fixed Python runtime and exact configuration. The recorder refuses an existing raw directory. It requires clean frozen branch/tree/parent and complete immutable/working source, test inventory, selected source and runtime identities. It rejects `NODE_OPTIONS`, diagnostic audio variables and the optional external-controller corpus variable. Original five files run serially with ordinary TAP, without extracted implementations or altered assertions. TERM is fixed at 55 seconds and KILL at 60 seconds; two fixed identity calls each have a separate 10-second limit. Original streams, all outcomes and before/after custody survive failures. No result authorizes a rerun.

The actual project arguments were the pinned absolute Node path, `--test`, `--test-concurrency=1`, `--test-reporter=tap`, then the five files in their declared order. There was no extra selector/instrumentation. Runtime `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` is 126,951,512 bytes, SHA-256 `acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa`. Original streams report `v24.22.3`, Linux x64, the pinned path and exact identity arguments. Both calls exited 0 with empty stderr and no timeout. Security read those records and rehashed the binary as data without issuing an identity call.

The sole original FIRST passed. I read the entire original TAP/result and independently parsed TAP outcomes rather than accepting summary flags.

| Original outcome | Independently checked value |
| --- | --- |
| Cases / pass | 132 / 132 |
| Added cases passed | 49 / 49 |
| Suites / fail / cancelled / skipped / todo | 0 / 0 / 0 / 0 / 0 |
| Project exit / recorder success | 0 / true; functional reported recorder exit 0 |
| Project elapsed | 15.125495306994708 seconds |
| TAP duration | 15,014.516442 ms |
| Timeout / signals | false / none |
| Stderr | 0 bytes |
| Project interval UTC | 2026-11-21 14:30:51.210232 to 14:31:06.336304 |
| Original TAP | 31,900 bytes; SHA-256 `655d53c1ef68f1d62eefdb06834b840bb0b7bd8c60da22019ac82cd8b4e25cdc` |
| Original result | 9,411 bytes; SHA-256 `8c152852d3170fafbbc787174f1b96b067e269a95aa4787ba7d6e73b59a89a74` |

All 132 top-level subtest names/outcomes and numbers 1–132 match the independently derived inventory. One final `1..132` plan and all seven counters agree. No bailout, skip/todo directive, recorder error or postflight error appears. The ordered-outcomes file equals the independently parsed original TAP. The running record's pre-execution metadata agrees with the final result apart from the expected outcome fields.

Both full source maps equal my original 2,546-record independent map. Their serialized files are each 651,771 bytes, SHA-256 `1fe5add540691eb00185fa31a00d1812748f88899c2e969b383d7ddba7f17910`; canonical record SHA remains `e02518433215984d516ed73d2f104acc93ed1f80a428ebf6b07ad61b3af32c5d`. I also checked every original current functional working byte/mode, both hash maps/inventories, immutable tree entries, all four actual/tracked test inventories and every selected pin. Before/after source states remain exact and clean. Original controls/runtime retain the reviewed hashes. Raw output is exactly 24 regular mode-0644 files, 2,870,756 bytes.

## Independent retained-evidence custody

The functional package is `docs/engineering/evidence/pregig-recovery-functional-2026-11-21/`. I read its complete manifest and custody record, then independently checked every original-to-retained copy by exact bytes, length, SHA-256, computed Git blob identity and original/retained mode. `focused/` contains all 24 original raw files unchanged. The separately copied launcher is the exact reviewed 247-byte line, and the functional independent case inventory exactly agrees with my 132 file/name/line/new-status records. I independently matched all 83 of its historical case numbers and durations to original TAP and recomputed the duration sum.

There are exactly 26 original-to-copy bindings totaling 2,912,650 bytes. Adding manifest and custody produces exactly 28 regular mode-0644 files totaling 2,930,522 bytes. Directory enumeration equals that expected set; there are no missing or extra package files. Original raw streams and control copies remain unchanged. No package assertion substitutes for checking the originals.

| Package record | Bytes | SHA-256 | Computed Git blob |
| --- | ---: | --- | --- |
| `manifest.json` | 14,020 | `167af111fbea250eea848a8f2a7e7e64c24ad3ea6ad0c0d4e965b928d2f97896` | `a8f5db80257d80a688511aabfd252df896655ac0` |
| `custody-check.json` | 3,852 | `abccb1749054cc587569893f55cf1b15692c6494ee6cbb22d5ba23c9dcac50e1` | `0edcad3134235a3bdeb5379927cfe216b091be02` |
| `independent-case-inventory.json` | 41,647 | `5646a9a796a805af9d1653a48242047f5307794e4740a479f6d58d47d365b177` | `2fcef42dedd80f581d83dbe3134155fe13cb4a7b` |
| `authorized-launcher.txt` | 247 | `e2b39fe5397d304f225452f40022b43131fb8f95fc7623d22aa67562fc3ba21b` | `da2b693bbc5688a06d76798d384985209ad2632c` |
| `focused/run.tap` | 31,900 | `655d53c1ef68f1d62eefdb06834b840bb0b7bd8c60da22019ac82cd8b4e25cdc` | `0c85bce72aea8d55e860ac7c1fa4b6e33d9f127c` |
| `focused/result.json` | 9,411 | `8c152852d3170fafbbc787174f1b96b067e269a95aa4787ba7d6e73b59a89a74` | `9cefb802be843a123457e3fb070f0dd6cd1f1361` |

Security's independent scratch source, case, original-FIRST and retained-package proofs contain the full source/copy records; the owned repository artifact remains this report alone. The functional manifest is the durable per-artifact mapping. Its recorded limits accurately distinguish real JavaScript composition from the fake native acknowledgement and preserve full-source audio/native/Fleet holds.

## Limits and preserved work

This security lane invoked no Node identity command, project module, test, syntax checker, build, scanner, browser/native launch, diagnostic collector, vulnerability reproduction or exploit. It used source reading and independent Git/Python standard-library bytes/JSON/TAP inspection. It edited no implementation, tests or another lane's evidence and requested no permission, deployment, release, CI dispatch, remote update or history rewrite. The original functional run described above belongs only to the separately authorized functional lane.

The fixed held backup/Service checkpoint remains `34afefa58ac5e8346006087587b113c2a82d5a39`, tree `949f6c334a725b84084736f15e9b9efcf6807e14`, sole parent `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`. Its original history bundle and publication proof remain preserved. Earlier Service FIRST 123/123 and backup recovery FIRST 193/193 remain separate scoped outcomes. Native backup #85 is unfinished: application owner/cache protocol, epoch/generation handshake, retained persistence health, startup and asynchronous exit barrier. Service #86 still awaits qualified integration.

Qualified main stays `e36ddc41806b0f6639474f207e3b339e063a6e25`; published Player and other fixed held heads remain unchanged. Original complete-source audio HOLD remains 2,420 total / 2,418 pass / one failure / one optional skip. That original full-suite case 53 measured approximately −101 dB gain at played input −30 dBFS. This review assigns no cause, changes no threshold and performs no rerun. The selected original core cases in this separate gate do not clear that full-suite failure. Fleet remains default off with original failed timing evidence intact. Population Compare #88 and System Health #89 are separate queued work. No release readiness, native/platform qualification or credit-exhaustion conclusion follows.

## Report ownership and seal

The only repository addition owned by this lane is `docs/engineering/PREGIG_RECOVERY_SECURITY_AUDIT_2026-11-21.md`. The report-only commit must have reviewed freeze `2ac0cf4dc25cb17471149ba64c83b3855c319d45` as its sole parent. Final sealing independently rechecks all original immutable blob identities and working bytes/modes, original test inventory, exact one-file addition and clean state. The completed handoff supplies exact report bytes/SHA-256/Git blob, commit/tree/parent and that custody result; the report does not try to embed its own content hash. Root retains all three FINALs before any fresh worker rotation. No additional execution or source change is authorized by this report.

## Source references

References describe this exact freeze; historical reports/evidence stay at their original paths.

- `app/pre-gig.js:717–807`: strict collections, finite serialization, fixed browser errors, acknowledgements and native bypass.
- `app/ui/workflows/pregig.js:188–289`: save coalescing, failed acknowledgement retention and rerun/reset ownership.
- `app/ui/screens/pregig.js:120–163,166–255,286–318`: preset reads, acknowledged row cache, form snapshots/lock, retained imports and export.
- `app/ui/screens/pregig.js:381–465,538–570,612–626,661–672,720–776`: retained rendering, result replacement, run/preset PDF binding, history/disposal and actual Save.
- `app/ui/screens/pregig.js:320–323,657`; `app/pre-gig.js:708–714`; `src-tauri/src/pregig.rs:306–317`: carried existing native association follow-up.
- `app/ui/workflows/pregig-report.js`, `app/ui/persistence.js`, `app/report-pdf.js`: escaped production composition, feedback and explicit handoff limit.
- `app/ui/dom.js`, `app/ui/icons.js`, `app/ui/live.js`, `app/ui/shell.js`: text sinks, chips, cached feedback and confirmation/navigation consumers.
- `app/ui/state.js`, `app/ui/devices/library-state.js`, `app/devices/library.js`, `app/catalog-store.js:385–467`: captured storage and library/catalog initialization accounting.
- `app/text-file.js`, `tests/text-file-boundary.test.mjs`: bounded bytes, strict UTF-8 and actual import handlers.
- `src-tauri/src/pregig.rs`, `src-tauri/src/lib.rs:243–249`, `tests/contracts/pregig.json`: unchanged native contracts, transaction and validation.
- `tests/fixtures/service-screen-dom.mjs`, `tests/fixtures/native-catalog-archive-dom.mjs`, `tests/fixtures/signals.mjs`: explicit DOM and bounded synthetic-data seams.
- All three `PREGIG_STORAGE_*_AUDIT_2026-11-21.md` reports and `PREGIG_STORAGE_STATIC_HOLD_CONTINUATION_2026-11-21.md`: original unexecuted HOLD and four findings.
- `PREGIG_RECOVERY_IMPLEMENTATION_2026-11-21.md`, `PREGIG_RECOVERY_REVIEW_SCOPE_2026-11-21.md`: current ownership, cumulative scope and selection.
- `evidence/pregig-recovery-functional-2026-11-21/manifest.json`, `custody-check.json` and `focused/`: original-to-copy mapping, independent functional checks and raw source/control/runtime/TAP records.

## Appendix — independently derived ordered case inventory

All 132 names below come from the original selected frozen files in exact serial order. `[new]` means added relative to the pre-Pre-gig baseline; `[older]` independently matches a single original historical TAP pass. Static enumeration and this candidate's original FIRST remain separate evidence. Every listed case passed the current authorized original FIRST.

### tests/pre-gig.test.mjs

1. [older] timecode: clean deck passes with no fix needed
2. [older] timecode SNR: 25 passes, 24.9 amber, 20 amber, 19.9 red (AC-3 action and DVS link)
3. [older] timecode balance: 1.5 passes, 1.6 amber, 3 amber, 3.1 red, sign does not matter
4. [older] timecode phase error: 10 passes, 10.1 amber, 20 amber, 20.1 red
5. [older] timecode dropouts: 0 passes, 1 amber, 2 red
6. [older] timecode speed: 1% passes, 1.1% amber (pitch), 5% amber, 5.1% red means wrong format
7. [older] timecode: worst metric wins, every issue gets one fix, unverified format warns
8. [older] timecode: no signal is red with needle, switch and cable advice; missing evidence is skipped, errors are amber-level error
9. [older] timecode: capture problems become actions, not crashes
10. [older] signal level: -50 dBFS passes, -50.1 on either channel is red and names the channel
11. [older] hum: 40 dB below the carrier is amber, 25 dB is red, above 40 passes; hum below the floor margin is ignored
12. [older] hum that could not be measured is amber with a retry, never a silent pass
13. [older] audio: missing interface is red with connection and Sound-settings actions; sample-rate mismatch is amber
14. [older] midi: present passes, optional missing is amber, required missing is red, no backend is unsupported
15. [older] headphones: yes passes, no is red with cue advice, skip or none is skipped
16. [older] software: crash within 1 h red, within 24 h amber, older passes; boundaries inclusive
17. [older] software: not installed and not running are amber with actions; no backend is unsupported
18. [older] system: driver and event findings filtered to the preset gear, warnings amber, errors red, unsupported excluded
19. [older] evidence errors become "Check could not run" with a retry for every kind
20. [older] every red or amber result carries a fix with a label and plain-English text
21. [older] rollUp matrix (AC-2): fail is red, warn or error is amber, skipped required is incomplete, else green
22. [older] rollUp: unsupported steps are excluded from the verdict and mark the check partial (AC-5)
23. [older] rollUp: top problems sorted red, amber, then skipped required; copy matches the spec wording
24. [older] buildPlan orders parallel steps first, then per-deck steps, then the headphone cue
25. [older] buildPlan honours skip and only, drops MIDI and software when the preset has none, and stays inside the 120 s budget
26. [older] built-in presets validate and reference the owner's real gear profile ids and known formats
27. [older] built-in presets load through loadBuiltinPresets and bad ones are reported
28. [older] validatePreset: bad deck ids, duplicates, inputs, formats, rates, MIDI and gear references
29. [older] presets: newer versions are read-only, import rejects >256 kB and junk, export/duplicate round-trip (AC-8)
30. [older] presetFromEquipment builds a valid preset from real profiles; deck B defaults to inputs 3-4 and the format comes from the media library
31. [older] formatForMedia resolves timecode media only, from the library, in any container shape
32. [older] the built-in rigs on a multi-pair interface put deck A on 1-2 and deck B on 3-4 (Traktor Audio 8 DJ)
33. [older] namesMatch is forgiving but refuses tiny fragments
34. [older] diffRuns lists which steps changed and whether they improved (AC-6)
35. [older] synthetic Traktor MK2 timecode from the generator passes both deck steps
36. [older] synthetic: noisy carrier is amber then red as the SNR falls (real analyzeTimecode)
37. [older] synthetic: one muted channel is red, naming the channel; silence is a no-signal red
38. [older] synthetic: dropouts and a wrong-format record are caught
39. [older] synthetic hum: 50 Hz and 60 Hz families are detected and graded against the carrier
40. [older] synthetic needle-up hum is measured on the lifted segment
41. [older] summarizeTimecode exposes plain numbers and handles failures
42. [older] runPregig: an all-ready rig produces a green verdict with every automatic step passing (AC-1)
43. [older] runPregig: deck B captures input pair 3-4 and deck A pair 1-2, so a two-deck rig can be green
44. [older] runPregig: a pair the interface does not offer is reported as no such input, not a failure
45. [older] deckPairFirst maps zero-based deck inputs to the 1-based first channel of a stereo pair
46. [older] runPregig: audio interface missing is red, signal steps are skipped (blocked) and nothing is captured (AC-4)
47. [older] runPregig: a thrown step is an error row, the verdict is amber and the other steps still run
48. [older] runPregig: Esc cancels, finished steps are kept and the rest are skipped (cancelled) (AC-7)
49. [older] runPregig: manual time is reported separately and excluded from the duration
50. [older] runPregig: orchestration overhead with instant mocked captures stays far below 5 s
51. [older] runPregig: CAPTURE_BUSY offers to stop the other capture, retries once and records the choice
52. [older] runPregig: one capture feeds both deck steps; only/skip re-run just the chosen steps
53. [older] runPregig: needle-up hum asks the user, captures the lifted segment and grades it
54. [older] runPregig: no desktop backend leaves required steps skipped and the verdict incomplete (AC-5)
55. [older] createNativeDeps drives the Tauri commands with the pre-gig capture holder and captures the deck input pair
56. [older] toRunInput maps a run to the pregig_save_run contract, redacting Windows user paths
57. [older] createPregigApi (native) sends exactly the contract argument names
58. [older] createPregigApi (browser) stores runs and presets locally with the same shapes
59. [older] contract examples are real step results shapes (states the database accepts)

### tests/pregig-storage-screen.test.mjs

1. [new] Pre-gig screen keeps unavailable preset storage visible across tabs and retries without silently choosing a rig
2. [new] Pre-gig screen distinguishes unavailable History from confirmed empty History and recovers on Retry
3. [new] Pre-gig screen retains previously loaded History with a persistent unavailable message after a failed refresh
4. [new] Pre-gig preset Save keeps the same draft and inline error after denied persistence, then confirms one successful retry
5. [new] Pre-gig preset Save coalesces repeated clicks and keeps the dialog open while persistence is pending
6. [new] Pre-gig a failed pending preset save restores draft editing and preserves every entered value for retry
7. [new] Pre-gig keeps an acknowledged preset and truthful success when the subsequent list refresh is unavailable
8. [new] Pre-gig an acknowledged preset save finishes while an optional refresh is still pending
9. [new] Pre-gig actual Retry and shell Save retain the completed result and never claim persistence before it succeeds
10. [new] Pre-gig saving a different preset keeps an unsaved check attached to the rig it actually tested
11. [new] Pre-gig Done preserves an unsaved result until the user confirms discarding it
12. [new] Pre-gig choosing another preset preserves an unsaved result until the user confirms discarding it
13. [new] Pre-gig running everything again preserves an unsaved result until the user confirms discarding it
14. [new] Pre-gig a late failed History request cannot replace a newer successful read
15. [new] Pre-gig disposal retires a pending History presentation and the Save callback
16. [new] Pre-gig import retains the parsed draft after a failed save and retries without picking the file again
17. [new] Pre-gig displays future-version presets read-only without running or rewriting their contents
18. [new] Pre-gig PDF keeps the tested interface after the same saved preset is edited
19. [new] Pre-gig PDF preparation cannot export or announce a result retired before its handoff

### tests/pregig-storage.test.mjs

1. [new] browser Pre-gig treats only a confirmed absent key as an empty collection
2. [new] browser Pre-gig runs preserves malformed JSON through reads and attempted writes
3. [new] browser Pre-gig runs preserves empty text through reads and attempted writes
4. [new] browser Pre-gig runs preserves non-array JSON through reads and attempted writes
5. [new] browser Pre-gig runs preserves partly invalid rows through reads and attempted writes
6. [new] browser Pre-gig runs preserves duplicate ids through reads and attempted writes
7. [new] browser Pre-gig runs preserves invalid nested data through reads and attempted writes
8. [new] browser Pre-gig runs preserves unrepresentable JSON numbers through reads and attempted writes
9. [new] browser Pre-gig presets preserves malformed JSON through reads and attempted writes
10. [new] browser Pre-gig presets preserves empty text through reads and attempted writes
11. [new] browser Pre-gig presets preserves non-array JSON through reads and attempted writes
12. [new] browser Pre-gig presets preserves partly invalid rows through reads and attempted writes
13. [new] browser Pre-gig presets preserves duplicate ids through reads and attempted writes
14. [new] browser Pre-gig presets preserves invalid nested data through reads and attempted writes
15. [new] browser Pre-gig presets preserves unrepresentable JSON numbers through reads and attempted writes
16. [new] browser Pre-gig read denial refuses every dependent mutation and recovers without replacing data
17. [new] browser Pre-gig save run reports a denied write and succeeds only after storage accepts retry
18. [new] browser Pre-gig create preset reports a denied write and succeeds only after storage accepts retry
19. [new] browser Pre-gig edit preset reports a denied write and succeeds only after storage accepts retry
20. [new] browser Pre-gig delete preset reports a denied write and succeeds only after storage accepts retry
21. [new] browser Pre-gig refuses missing providers and missing writer methods
22. [new] browser Pre-gig does not treat a non-string undefined storage read as confirmed absence
23. [new] native Pre-gig bypasses a throwing browser storage getter while browser errors remain typed
24. [new] browser Pre-gig preserves the newest-one-hundred retention rule and complete result details
25. [new] browser Pre-gig retains future preset versions and existing string-JSON records without writes
26. [new] browser Pre-gig refuses unserializable or non-finite new data before replacing prior bytes

### tests/pregig-ui.test.mjs

1. [older] describeStep: an input pair the interface lacks reads as "no such input", not a failure
2. [older] describeStep: every engine state has a word and a tone; live states are not chips
3. [older] verdictView: only deck B unmeasured gives an amber "Not fully checked" that says why
4. [older] verdictView: red stays red and still notes deck B; green copy is the engine copy
5. [older] fixButtons: keeps actions, dedupes, info entries have no action
6. [older] evidenceRows: labels, units, nesting, empties dropped
7. [older] rerunTargets and mergeRerun: only the chosen steps change and the verdict is recomputed
8. [older] compareView: trends and headline
9. [older] profilesForPreset: judges only the rig, not every profile in the library
10. [older] runMatchesPreset: built-ins match by notes, saved presets by id
11. [older] time text
12. [older] controller: full run keeps deck input-pair skip honest, saves once, compares on the second run
13. [older] controller: cancel keeps partial results as cancelled; rerun merges and saves a new run
14. [new] controller: failed browser persistence retains the completed result and retry never repeats the check
15. [new] controller: overlapping save retries share one write and cannot be replaced by a new run or reset
16. [new] controller: unavailable history does not become an empty baseline or a successful save
17. [new] controller: a failed save after rerun cannot retain the previous result success marker

### tests/text-file-boundary.test.mjs

1. [older] pre-gig refuses an oversized selected preset before reading or saving
2. [older] pre-gig catches file read errors and preserves the existing preset collection
3. [older] pre-gig rejects mismatched read lengths before parsing or saving
4. [older] pre-gig consumes one strict UTF-8 snapshot while retaining valid Unicode presets
5. [older] pre-gig rejects malformed UTF-8 without saving a replacement-decoded preset
6. [older] media import rejects malformed UTF-8 instead of storing replacement text
7. [older] media import rejects invalid declared sizes before reading
8. [older] media import rejects mismatched read lengths and preserves normal one-read imports
9. [older] media import reports byte-read failures without storing a profile
10. [older] bounded text reads preserve UTF-8 BOM compatibility and measure the byte boundary
11. [older] bounded text reads reject incomplete reads and non-buffer results before decoding

