# System Health coverage — round eighteen functional audit

Date: 2026-11-21.

## Disposition

**Functional FINAL ACCEPT for the bounded round-eighteen JavaScript scope.** The one separately authorized original-file FIRST passed **208/208 cases**, including all **35 new cases**, with no failures, skips, cancellations or TODOs. Functional, code and security reviewers accepted the frozen source, exact controls, original FIRST evidence and retained copies; root independently verified and accepted each gate. The one FIRST is consumed. Root separately authorized this report and the 49 accepted evidence files as the only 50 additions in one report/evidence-only commit with the reviewed freeze as its sole parent. All original full-source and native qualification limits remain in force.

## Immutable source custody

- Freeze: `2a807525c70712332e84cecbaf29dd876b5e03cd`.
- Tree: `00c536bad160a5f81fbbc8cea1b7fe62594e2c7a`.
- Sole parent: `b7f3031a185e14a502c7e7e86c6495ea3601d73a`.
- Merge parents, in order: source `148d1cfe7fbb5accbbfd7c265c8d63223b358f23`, completed Pre-gig root `674e3a5b68aef0e0c2a19a05a117bdef8a11c579`.
- Source sole parent: `2ac0cf4dc25cb17471149ba64c83b3855c319d45`.
- Independently checked all 2,586 paths, 2,317 distinct immutable blobs, 91,604,989 summed bytes, working executable modes, stage-zero index, full physical file inventory and all 209 top-level test files. The original FIRST snapshots have no extra ignored/untracked files or tracked AGENTS.md.
- Ordered compact sorted-key `{path,mode,oid,bytes,sha256}` map SHA-256: `11f639792299bf8b5aaf9035e94459138fd2d9ab02ce51f2c2c5f584e51765fa`.

Whole-tree byte custody is distinct from bounded semantic review. I read the complete implementation/scope/contract/current handoff; all seven changed production modules and all nine selected original test files; actual shared DOM/live/PDF adapter seams; setup sanitizer/persistence consumers; Pre-gig grading and Service export consumers; native scan typed responses and wrappers; and native diagnostics JSON context serialization. The interpreter knowledge-base and complete fault heuristics are byte-identical to the preceding source. Native collectors, Pre-gig grading, native wizard storage, Service consumer and shared fixture bytes remain unchanged.

## Functional findings

The canonical coverage model separates complete, partial, failed, unsupported, pending and unscanned collection state from finding severity. Only completed required areas can establish an overall pass; faults retain priority; wholly unsupported scans remain informational. Failed attempts remain exportable and explicit coverage reaches HTML, real printable composition and diagnostics. Actual area retries replace only their area and duplicate pending attempts coalesce. Scan revision/disposal and busy ownership suppress obsolete preparation and feedback while restoring controls against the current scan state. Setup explicitly requires only drivers, clears the old answer before another attempt and persists an optional completion boolean without changing legacy count-only answers.

### Source-backed behavior and compatibility review

| Boundary | Reviewed behavior | Selected evidence and practical limit |
| --- | --- | --- |
| Bridge and coverage (`app/system-check.js:35,67`) | A missing backend returns the explicit unsupported shape. An available backend that returns null, a primitive or an array rejects. Attempt state takes precedence over stale data; supported areas require their expected arrays and an empty errors array before collection is complete. | The new coverage file exercises all three areas, malformed top-level responses, reported collection errors, rejected commands, missing and pending coverage. Nested record validation and real Windows completeness are outside this scope. |
| Interpretation and verdict (`app/system-check.js:451,482`) | Partial collections retain real error/warning findings and remove area-wide OK findings. Per-area findings carry their scan state; the all-unsupported aggregate carries its scan-area list. Serialized findings can recover coverage. Error findings retain priority, followed by warnings, all-unsupported information, absent results, incomplete coverage and completed pass. | Retained system-check cases preserve the original fault knowledge base. The new file covers benign information, real faults beside missing coverage, wholly unsupported scans and JSON serialization. Completion means the requested collector returned the expected shape without reported collection errors. |
| Screen attempts (`app/ui/screens/system.js:31,58,78,89`) | An attempt owns its area object, clears that area's old result and advances the revision. Repeated pending requests coalesce. Only current attempts may present their outcome; all failed attempts receive a timestamp so an incomplete result remains exportable. Pending scans disable both report actions and event-period replacement. | The screen cases operate actual Retry/Rescan and export controls through the shared fake DOM. They cover each failed and partial area, browser preview, duplicate clicks, all rejected calls and disposal. They do not exercise real browser rendering or delayed live-region delivery. |
| HTML and printable report (`app/system-check.js:512`; `app/report-pdf.js:260,295`) | Report composition recalculates severity/coverage from current findings and explicit coverage, includes the coverage table, and retains the failed area instead of trusting a supplied stale headline. | The new coverage case calls the real printable composition. Existing report cases retain HTML escaping, print layout contracts, native-adapter fallback/timeout semantics and the checked-in print fixture. OS printing and WebView2 PDF output remain unqualified. |
| PDF preparation and retry (`app/ui/screens/system.js:293,309`; `app/ui/persistence.js:112`) | The screen captures the export revision and supplies an ownership predicate through asynchronous preparation. Busy state lives with the screen; the same callback and ownership predicate survive a toast Retry. The finally path updates controls against the current scan state. | Screen and Service lifecycle cases cover replacement/disposal before adapter handoff, retained retry callbacks and current-view feedback. A submitted native export is allowed to complete; these guards do not cancel native work. Shared callers without callbacks retain their prior defaults. |
| Setup quick scan (`app/ui/workflows/setup-wizard.js:601`; `app/setup-wizard-model.js:49,253`) | Setup explicitly requires only drivers. Each new attempt clears the prior health answer. The count fields remain compatible; a boolean completion value survives sanitization/serialization/resume, and false completion is visible in the summary. Legacy answers without the new boolean remain count-only. | The new model case checks the persisted completion state and clearing it for a new attempt. Source inspection follows actual wizard use and unchanged native JSON answer storage. A native Windows wizard session has not been exercised. |
| Diagnostics (`app/ui/screens/support-dialog.js:39`; `src-tauri/src/diagnostics.rs:909,1250`) | All three collection promises settle independently; explicit done/error states preserve failed coverage while successful areas remain available. The client context carries summary, coverage and reduced findings into the existing arbitrary JSON system-health part. | The actual dialog collection case inspects context at the fake native boundary. Unchanged Rust serialization supports that shape; native archive creation, collection permissions and operating-system behavior are not qualified. |
| Existing consumers | Pre-gig's independent measurement/gear grading, Service job export ownership, native collector schemas, native wizard answer storage and the shared fixture implementations are byte-identical to baseline. | The selected retained Pre-gig, Service, PDF and wizard cases provide scoped compatibility coverage through the single authorized FIRST. Their older TAP passes are retained as historical timing/name evidence. |

### Nonblocking, pre-existing follow-ups

1. **LOW (P3) — delayed completion announcement can outlive its result revision.** `app/ui/screens/system.js:84` calls `announce` without its optional `isCurrent`; `app/ui/live.js:23–36` performs delivery after 40 ms. A replacement scan begun in that interval, or direct disposal before delivery, does not invalidate the old message. Ordinary shell navigation cancels pending messages (`app/ui/shell.js:78`). The unowned announcement predates this candidate. Proposed later correction: capture the completed revision and supply an ownership predicate covering disposal, revision and pending state. The selected screen fixture disables timers, so its disposal assertion does not qualify this interval. No reproduction was performed.
2. **LOW (P3) — partial inventory wording still asserts absence too strongly.** Existing empty ASIO/log copy (`app/ui/screens/system.js:241,281`) can coexist with incomplete collection. The new overall verdict and scan notes remain incomplete, and no overall all-clear follows. These statements already exist in the baseline at lines 224 and 264. A later correction can state that no items were returned by the available scan. No native completeness claim is made.

## Independently derived selected inventory

| Original file, lexical order | Cases | Older | Added | Original older-duration sum (ms) | Current FIRST case-duration sum (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `tests/pre-gig.test.mjs` | 59 | 59 | 0 | 14590.668619 | 14403.634976 |
| `tests/pregig-storage-screen.test.mjs` | 19 | 19 | 0 | 139.283950 | 140.521128 |
| `tests/report-pdf.test.mjs` | 28 | 28 | 0 | 74.806864 | 79.301652 |
| `tests/service-panel-lifecycle.test.mjs` | 28 | 28 | 0 | 85.352739 | 85.197142 |
| `tests/setup-wizard-model.test.mjs` | 15 | 14 | 1 | 8.078872 | 9.260025 |
| `tests/support-dialog.test.mjs` | 3 | 3 | 0 | 2.426278 | 2.226918 |
| `tests/system-check.test.mjs` | 22 | 22 | 0 | 12.671265 | 18.693014 |
| `tests/system-health-coverage.test.mjs` | 15 | 0 | 15 | 0 | 10.027740 |
| `tests/system-health-screen.test.mjs` | 19 | 0 | 19 | 0 | 295.470656 |
| **Total** | **208** | **173** | **35** | **14913.288587** | **15044.333251** |

All 154 selected older names outside Pre-gig screen bind to the original round-ten full TAP. The 19 Pre-gig screen names bind to the original round-seventeen focused TAP. I also rechecked all 83 historical matches retained in round seventeen against the original round-ten TAP. Historical passes do not qualify this candidate. The two changed old System Health assertions strengthen coverage semantics and remain classified as retained cases; the setup completion case and both new files are additions.

Historical labels in the appendix refer to these untouched original evidence files:

- **R10:** `docs/engineering/evidence/link-consent-functional-2026-11-21/full/run.tap`, 555,767 bytes, SHA-256 `e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`. Its complete footer remains 2,420 cases, 2,418 passes, one failure and one optional skip.
- **R17:** `docs/engineering/evidence/pregig-recovery-functional-2026-11-21/focused/run.tap`, 31,900 bytes, SHA-256 `655d53c1ef68f1d62eefdb06834b840bb0b7bd8c60da22019ac82cd8b4e25cdc`. Its complete footer remains 132/132 passes.

- Ordered names SHA-256: `145174e3bed3c471c063bd7d9d92cd2caa141047ace531f7ac3a94b531eea5e4`.
- Ordered file/name pairs SHA-256: `9ceda94adb8e00b72d093870907a50393db9da779449e31f8c01bd6a8fac71bf`.
- Ordered source ordinal/file/line/name records SHA-256: `19da1355909acf22efd6e6e741bf284e6c6a06f4b82d3abc2e29e8485fe9ce79`.

## Exact reviewed controls and authorization

External controls were authored under root permission only after all three source ACCEPTs. Root, code, security and functional reviewers read the complete controls and independently accepted the exact bytes below. Root then issued a distinct exact-byte authorization for one launcher invocation. The consumed authorization is retained in `first-authorization.txt`; the controls retain their original authored text unchanged, including their initial unexecuted labels.

| External control/data file | Bytes | Lines | SHA-256 |
| --- | ---: | ---: | --- |
| `deckchek-system-health-round18-focused-recorder.py` | 27466 | 479 | `e1f06e547e65c992b09f2354777a9d816e52b02a925d9ad012d7e0941cd9718b` |
| `deckchek-system-health-round18-focused-selection.json` | 28712 | 480 | `ef68e00e9c9749d5cb294cbdc90b93326616ba62dc1e8fe8098da35f9bc0522a` |
| `deckchek-system-health-round18-authorized-launcher.py` | 4995 | 95 | `aceb51fb67f805280a8f5090cbd7fbc1b4895596463f02c44eddc52126985f58` |
| `deckchek-system-health-round18-authorized-command.txt` | 163 | 1 | `0649a232312480d98de0a73d601adcf5f98e67ace93c9e7f4113d943b532ec3c` |
| `system-health-functional-round18-source-identity.json` | 570148 | 1 | `94581a9ecc12e1d0eede372336b42368b9876693431283b196894ded92ffb3b2` |
| `system-health-functional-round18-case-inventory.json` | 95393 | 2794 | `c1baf00572ad94123b03a0d03a944dfa7da232ccdf05e5154e5e4958ce3268a1` |

Exact authorized launcher, executed once from the frozen worktree with a non-login shell:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3 -I /workspace/scratch/6f2247f2f463/deckchek-system-health-round18-authorized-launcher.py
```

The launcher verifies exact recorder, configuration, command, source-map, case-inventory and runtime file bytes/modes before executing the recorder. The recorder requires an absent external raw directory, retains those exact inputs, then verifies every immutable Git blob and working byte/mode; complete stage-zero index entries and ordinary cached flags; raw index bytes; and complete physical, tracked, ignored, untracked and top-level test inventories. The same checks run after the single project invocation. Read-only Git calls disable optional index locks and fsmonitor execution. No source or assertion is copied, rewritten or extracted.

The accepted budget rounded 14913.288587 ms of original historical case work to 15 s, then allocated 20 s for 35 new cases and changed assertions, plus 20 s for startup, module loading, filesystem and host variability. The recorder would send TERM at 55 s and KILL at 60 s if still active. Its separate maximum 5 s wait after KILL only reaps the already-signaled process; it permits no further work or retry. Each fixed identity call had its own 10 s deadline and immediate KILL on timeout, followed by the same bounded reap. Every assertion and original selected file remained intact.

The runtime is pinned to Node v24.22.3 at `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`, 126,951,512 bytes, SHA-256 `acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa`. The launcher uses isolated pinned Python; Python and Git file identities are also retained. Present `NODE_OPTIONS`, `UPDATE_FIXTURES`, `MIXXX_CONTROLLERS_DIR`, and any `DECKCHEK_AUDIO_*` key are rejected even if their values are empty.

The two authorized identity calls were `--version` and the fixed JSON identity expression recorded in the configuration review manifest. They were followed by exactly one `--test --test-concurrency=1 --test-reporter=tap` invocation of the nine lexical original files. The 39 retained original raw files preserve stdout, stderr, original running/result metadata, both full custody maps, raw index snapshots and exact controls. The recorder would retain errors in separate files; none were created. A pre-execution launcher denial leaves the raw directory absent and its original command stderr must be preserved; there is no automatic retry.

The original prior recorder (385 lines / 22,756 bytes), prior configuration and prior launcher were read completely before adaptation. This recorder added the present `UPDATE_FIXTURES` guard, exact pre-execution recorder pinning, complete physical/index flags and raw-index custody, and bounded post-KILL waits. The proposal manifest is `deckchek-system-health-round18-control-review-manifest.json`, 9,841 bytes / 257 lines, SHA-256 `f3f9d913a3a0fcd90260ed7ae7f81ad04bf08cbe8a6b3e88bc453624a2af2188`.

## Observed original FIRST and independent evidence disposition

| Observation | Original evidence |
| --- | --- |
| Scope | Nine original source files, lexical order, one serial invocation; 208 registered cases: 173 retained and 35 new. |
| Result | `1..208`; tests 208; suites 0; pass 208; fail 0; cancelled 0; skipped 0; TODO 0; launcher and Node project exit 0. |
| TAP time | 15821.975168 ms. This is the original TAP footer value. |
| Project wall time | 15.929411565994087 s; start `2026-11-21T15:27:03.822566+00:00`, finish `2026-11-21T15:27:19.752528+00:00`. |
| Timeout and errors | No timeout, termination signal, forced kill, reap timeout, recorder error, postflight error or TAP validation error. |
| Original streams | `focused/run.tap`: 46,741 bytes / 1,258 lines / SHA-256 `86183d4b10829868a892bb738171f711b560fa3eaeb79a87cdc10d200b02d1dc`; all three stderr files are empty. |
| Result and running records | `focused/result.json`: 16,273 bytes / SHA-256 `f6dc907791d3ea2c1c95a7df08e6c5f6ebc2ae69f1910b193427189906c9372a`; `focused/running.json`: 10,548 bytes / SHA-256 `5faca9f8e6b64700c232c0af7a7c91ee77dc413a45a751b9fa50584197268602`. |
| Raw evidence | Exactly 39 expected files, totaling 5,041,458 bytes, at the original external raw directory. Nothing in that directory was rewritten or replaced. |
| Source custody | All 2,586 original paths and 2,317 immutable blobs, 91,604,989 bytes, modes, stage-zero index entries/flags, raw index bytes, branch/head/tree/sole parent and 209-test inventory match before and after the run. |
| Environment and runtime | No forbidden variable was present. Both fixed identity calls succeeded; Node v24.22.3 and the pinned Node/Python/Git files, locations and modes match before and after. |

I independently parsed the full original TAP grammar: its header, all 208 exact six-line case blocks and all nine footer lines. Every case label, ordinal, outcome and duration matches the source-derived inventory; there is no unparsed diagnostic or hidden directive. I also checked all original raw file identities, original command chunks, running/result records, each runtime stream, each before/after snapshot and every live original source byte/mode against independently read immutable Git blobs. This was data inspection only, with no additional project execution.

The sum of individual current case durations is 15044.333251 ms; the full TAP footer includes runner overhead. Original historical case durations remain separately labeled and were used only to choose a bounded budget. `current-case-results.json` retains every current duration together with the original source line, addition status and historical binding. Root's independent preflight proof and post-FIRST proof are preserved as separate records; their original data-only labels are retained.

The completed review chain is three source ACCEPTs, three exact control ACCEPTs, the separate root FIRST authorization, one functional-lane execution, then three original-evidence ACCEPTs and root's independent evidence ACCEPT. Root, code and security did not execute project code. The successful scoped run does not replace the original full-source audio HOLD or extend qualification to native/physical behavior.

## Complete retained evidence manifest and custody

The original raw directory is `/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-focused-raw`. The retained repository evidence root is `docs/engineering/evidence/system-health-coverage-functional-2026-11-21/`. Under root's separate packaging authorization, all 39 original raw files were copied byte-for-byte under `focused/`, together with eight supplemental authorization/control/command/proof/case records and two derived manifest/custody records. The evidence set contains **49 files / 5,234,454 bytes**, all ordinary nonexecutable Git mode `100644`. Original external modes are separately recorded in custody; no original raw file or accepted external control was modified.

`retention-custody.json` records all 47 source-to-copy pairs, exact original modes and byte equality. `evidence-manifest.json` covers those payloads and the custody record while explicitly excluding its own bytes. The complete 49-file compact sorted-key `{path,bytes,sha256,mode,lines}` array SHA-256 is `926240ff713ee9fbbcbb5af922a3b9d2a55fda58e89630d0e74700ac6fecbc93`. Binary index snapshots have a null line count. The original 39-file compact sorted-key `{name,bytes,sha256,mode}` array SHA-256 is `4589e210609449652e0727b361adeb3866cd59b674ea1768ba0d705e4544fe72`. Digests from a differently shaped reviewer manifest must not be substituted for these explicit schemas.

The raw index pin applies to the original FIRST before/after snapshots. Later authorized documentation additions can change the staging index. They may add only these 49 evidence paths and this report; every original 2,586-path mode/blob identity remains invariant. The final report/evidence-only commit must have the reviewed freeze as its sole parent. Copy/seal permission does not authorize another run.

| Evidence path, relative to the retained root | Bytes | Lines | SHA-256 |
| --- | ---: | ---: | --- |
| `control-review-manifest.json` | 9841 | 257 | `f3f9d913a3a0fcd90260ed7ae7f81ad04bf08cbe8a6b3e88bc453624a2af2188` |
| `current-case-results.json` | 119163 | 3536 | `e77f15d386c6e9b82c951f704414b613d52b286d51b9cb3eacd76e98d27fbdd7` |
| `evidence-manifest.json` | 10526 | 350 | `85a701cd151123eeb3fba64eacd217f8634bd3e88ac1624aced7672439c98eab` |
| `first-authorization.txt` | 2211 | 6 | `03e30647fde8d3ba263932578f2cc1bfb81ff8dfb31048e36f7d0ea173b4fb8e` |
| `focused/authorized-command.txt` | 163 | 1 | `0649a232312480d98de0a73d601adcf5f98e67ace93c9e7f4113d943b532ec3c` |
| `focused/authorized-launcher.py` | 4995 | 95 | `aceb51fb67f805280a8f5090cbd7fbc1b4895596463f02c44eddc52126985f58` |
| `focused/authorized-selection.json` | 28712 | 480 | `ef68e00e9c9749d5cb294cbdc90b93326616ba62dc1e8fe8098da35f9bc0522a` |
| `focused/expected-case-names.json` | 17005 | 210 | `7e86a40b3089c8e5e2da3198b36bb75e950ae5477a2ca4ce632e135555dffa7f` |
| `focused/full-source-after.json` | 570148 | 1 | `94581a9ecc12e1d0eede372336b42368b9876693431283b196894ded92ffb3b2` |
| `focused/full-source-before.json` | 570148 | 1 | `94581a9ecc12e1d0eede372336b42368b9876693431283b196894ded92ffb3b2` |
| `focused/ignored-files-after.json` | 3 | 1 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `focused/ignored-files-before.json` | 3 | 1 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `focused/independent-case-inventory.json` | 95393 | 2794 | `c1baf00572ad94123b03a0d03a944dfa7da232ccdf05e5154e5e4958ce3268a1` |
| `focused/independent-source-identity.json` | 570148 | 1 | `94581a9ecc12e1d0eede372336b42368b9876693431283b196894ded92ffb3b2` |
| `focused/index-after.json` | 365237 | 1 | `9786ce6d68c119ac9dcf1d53999940197812bc43b3594ea3d90f7f9d46f78c96` |
| `focused/index-before.json` | 365237 | 1 | `9786ce6d68c119ac9dcf1d53999940197812bc43b3594ea3d90f7f9d46f78c96` |
| `focused/index-flags-after.json` | 160944 | 2588 | `b2548d56571cde2ba003c81b8aa6a5175a4c4ab879c85c17240c7d93bf2c3742` |
| `focused/index-flags-before.json` | 160944 | 2588 | `b2548d56571cde2ba003c81b8aa6a5175a4c4ab879c85c17240c7d93bf2c3742` |
| `focused/node-runtime.stderr` | 0 | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `focused/node-runtime.stdout` | 782 | 1 | `292ce6437aa16270ee5bdc058956ada71eb309cd3bdad80675b1277cee648604` |
| `focused/node-version.stderr` | 0 | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `focused/node-version.stdout` | 9 | 1 | `4409d3bfa08b82f385bd424eeda65fc63b756129f0e89e82df77f1fecafccc14` |
| `focused/ordered-outcomes.json` | 40193 | 1458 | `b997ea0e14fb313108777b40f02c6ac953ea6942f51ccea17cd8ea94e603780a` |
| `focused/physical-files-after.json` | 155772 | 2588 | `48eb24bbe794e3a059c41201a20c11127a932e843e88c538c568c4db9a1a3f37` |
| `focused/physical-files-before.json` | 155772 | 2588 | `48eb24bbe794e3a059c41201a20c11127a932e843e88c538c568c4db9a1a3f37` |
| `focused/raw-index-after.bin` | 325991 | binary | `ad1a0910ae3fe8cfa1aaccf7af7ed66819b3c1cebdb13d9f425fa741f1b4f724` |
| `focused/raw-index-before.bin` | 325991 | binary | `ad1a0910ae3fe8cfa1aaccf7af7ed66819b3c1cebdb13d9f425fa741f1b4f724` |
| `focused/result.json` | 16273 | 405 | `f6dc907791d3ea2c1c95a7df08e6c5f6ebc2ae69f1910b193427189906c9372a` |
| `focused/run-focused-node.py` | 27466 | 479 | `e1f06e547e65c992b09f2354777a9d816e52b02a925d9ad012d7e0941cd9718b` |
| `focused/run.tap` | 46741 | 1258 | `86183d4b10829868a892bb738171f711b560fa3eaeb79a87cdc10d200b02d1dc` |
| `focused/running.json` | 10548 | 269 | `5faca9f8e6b64700c232c0af7a7c91ee77dc413a45a751b9fa50584197268602` |
| `focused/selected-source-identities.json` | 2002 | 56 | `835c87214d17ef68ee00bcd4ba794b2790be610a4429621a242db595ffdfbdcd` |
| `focused/source-state-after.json` | 269 | 9 | `971455e3591e0326dbbcfd0a4d0d3b3faa21e59f22e9594d7dd01925d642069d` |
| `focused/source-state-before.json` | 269 | 9 | `971455e3591e0326dbbcfd0a4d0d3b3faa21e59f22e9594d7dd01925d642069d` |
| `focused/source-tree-after.json` | 339377 | 1 | `d9a91b35b80517e279cc146dcb439053bc2d4f9bf7b4374bf87da165e61f72aa` |
| `focused/source-tree-before.json` | 339377 | 1 | `d9a91b35b80517e279cc146dcb439053bc2d4f9bf7b4374bf87da165e61f72aa` |
| `focused/stderr.log` | 0 | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `focused/top-level-tests-after.json` | 16998 | 424 | `f5431ba070f578148e493c77d43412281ec3839cc7a392a8a04477570182d3af` |
| `focused/top-level-tests-before.json` | 16998 | 424 | `f5431ba070f578148e493c77d43412281ec3839cc7a392a8a04477570182d3af` |
| `focused/tracked-files-after.json` | 155772 | 2588 | `48eb24bbe794e3a059c41201a20c11127a932e843e88c538c568c4db9a1a3f37` |
| `focused/tracked-files-before.json` | 155772 | 2588 | `48eb24bbe794e3a059c41201a20c11127a932e843e88c538c568c4db9a1a3f37` |
| `focused/untracked-files-after.json` | 3 | 1 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `focused/untracked-files-before.json` | 3 | 1 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `independent-evidence-verification.json` | 2685 | 79 | `dcf82092ab04ce2b0e0b130ed6e0c8e36ed95631e5592de78f518038f8440c13` |
| `original-command-result.json` | 1540 | 32 | `1e506adcda63593eefaa069d4d31759ed0dbbd663692f194af4a436e8b5242c6` |
| `raw-evidence-manifest.json` | 7266 | 242 | `d52379471e642bcdd13f194489bc293d54a02900e06db7a12cbe91f1355aba76` |
| `retention-custody.json` | 21667 | 495 | `e32ffafc6af563235cc8c28d6b238f22e95e64060a85b381a63173031f9efb01` |
| `root-first-proof.json` | 10832 | 336 | `d73f6894e7cc04001e3e2f4b9c458c75fab95893658bc8ca346b9b70f5216836` |
| `root-preflight-proof.json` | 7265 | 193 | `3d16c0f8d6ee1d2a8bdc1cf1280673ef456e96ff677c811fc57b26d1f6bfe6fd` |

## Final sealing scope

The retained-copy set was independently accepted by all three review lanes and root before the report/commit seal window opened. Root's package proof is 11,335 bytes, SHA-256 `b6fe8532c74282fec72070d40f7ef37cd321132291472eaadf9100754547c473`; it binds exactly 49 files / 5,234,454 bytes and full evidence manifest `926240ff713ee9fbbcbb5af922a3b9d2a55fda58e89630d0e74700ac6fecbc93`. That proof is a data check and authorizes no project execution.

The seal permits only this audit report and the already accepted 49 evidence files. All 2,586 original source/test/evidence paths, executable modes and immutable blob identities must remain unchanged. The final commit's sole parent is `2a807525c70712332e84cecbaf29dd876b5e03cd`; its exact commit/tree/report identity is delivered separately after the ordinary commit to avoid a self-referential file hash. The original external raw directory and controls remain untouched. No other project invocation occurred after the consumed FIRST.

## Preserved limits

The selected JavaScript fixtures exercise real production modules through fake native and DOM boundaries. Windows collection, real browser layout, OS dialogs, native PDF rendering/archive creation, physical audio/MIDI and arbitrary hostile nested-object handling remain unqualified. PDF ownership ends at preparation before adapter handoff and feedback/retries; it does not cancel a submitted export. Pre-gig measurement/gear grading remains unchanged.

The original complete-source audio HOLD remains 2,420 total / 2,418 pass / one failure / one optional skip, exit 1: case 53 failed the final relative-gain assertion at −101 dB for playback at −30 dBFS after earlier playback-level assertions passed. No cause or repair is established. Qualified main remains `e36ddc41806b0f6639474f207e3b339e063a6e25`; Backup/Service remains `34afefa58ac5e8346006087587b113c2a82d5a39`; Fleet-off remains `69fc06eb471dfb00de544bbe233c0f5dc95402e8`. Native #85 SDK/owner/cache/startup/exit, Population Compare #88, and active/retained-unsaved preset deletion association remain separate unfinished work. No release, deployment, native workaround, threshold weakening, permission expansion, separately billed job, qualification merge or credit-exhaustion claim follows.

## All ordered source cases, original historical bindings and current FIRST outcomes

Every current case below passed in the one original FIRST. The earlier duration column binds each retained case to its original older TAP; additions have no historical timing. Current durations are copied as decimal strings from the original current TAP, without rounding.

| # | Source file | Source line | Status | Case name | Original case and duration (ms) | Current FIRST (ms) |
| ---: | --- | ---: | --- | --- | --- | ---: |
| 1 | `tests/pre-gig.test.mjs` | 26 | older | timecode: clean deck passes with no fix needed | R10 #1537 / 1.596144 | PASS / 1.865173 |
| 2 | `tests/pre-gig.test.mjs` | 32 | older | timecode SNR: 25 passes, 24.9 amber, 20 amber, 19.9 red (AC-3 action and DVS link) | R10 #1538 / 0.920295 | PASS / 1.082047 |
| 3 | `tests/pre-gig.test.mjs` | 43 | older | timecode balance: 1.5 passes, 1.6 amber, 3 amber, 3.1 red, sign does not matter | R10 #1539 / 0.419576 | PASS / 0.488774 |
| 4 | `tests/pre-gig.test.mjs` | 51 | older | timecode phase error: 10 passes, 10.1 amber, 20 amber, 20.1 red | R10 #1540 / 0.23446 | PASS / 0.376246 |
| 5 | `tests/pre-gig.test.mjs` | 59 | older | timecode dropouts: 0 passes, 1 amber, 2 red | R10 #1541 / 0.256043 | PASS / 0.31315 |
| 6 | `tests/pre-gig.test.mjs` | 67 | older | timecode speed: 1% passes, 1.1% amber (pitch), 5% amber, 5.1% red means wrong format | R10 #1542 / 0.287629 | PASS / 0.390898 |
| 7 | `tests/pre-gig.test.mjs` | 77 | older | timecode: worst metric wins, every issue gets one fix, unverified format warns | R10 #1543 / 0.249082 | PASS / 0.374543 |
| 8 | `tests/pre-gig.test.mjs` | 88 | older | timecode: no signal is red with needle, switch and cable advice; missing evidence is skipped, errors are amber-level error | R10 #1544 / 0.270904 | PASS / 0.355174 |
| 9 | `tests/pre-gig.test.mjs` | 101 | older | timecode: capture problems become actions, not crashes | R10 #1545 / 0.445846 | PASS / 0.489015 |
| 10 | `tests/pre-gig.test.mjs` | 121 | older | signal level: -50 dBFS passes, -50.1 on either channel is red and names the channel | R10 #1546 / 0.41517 | PASS / 0.565119 |
| 11 | `tests/pre-gig.test.mjs` | 132 | older | hum: 40 dB below the carrier is amber, 25 dB is red, above 40 passes; hum below the floor margin is ignored | R10 #1547 / 0.38173 | PASS / 0.427472 |
| 12 | `tests/pre-gig.test.mjs` | 142 | older | hum that could not be measured is amber with a retry, never a silent pass | R10 #1548 / 0.121552 | PASS / 0.177327 |
| 13 | `tests/pre-gig.test.mjs` | 151 | older | audio: missing interface is red with connection and Sound-settings actions; sample-rate mismatch is amber | R10 #1549 / 0.347679 | PASS / 0.492751 |
| 14 | `tests/pre-gig.test.mjs` | 166 | older | midi: present passes, optional missing is amber, required missing is red, no backend is unsupported | R10 #1550 / 0.325556 | PASS / 0.382295 |
| 15 | `tests/pre-gig.test.mjs` | 180 | older | headphones: yes passes, no is red with cue advice, skip or none is skipped | R10 #1551 / 0.137856 | PASS / 0.282886 |
| 16 | `tests/pre-gig.test.mjs` | 196 | older | software: crash within 1 h red, within 24 h amber, older passes; boundaries inclusive | R10 #1552 / 1.629173 | PASS / 2.313517 |
| 17 | `tests/pre-gig.test.mjs` | 212 | older | software: not installed and not running are amber with actions; no backend is unsupported | R10 #1553 / 0.228241 | PASS / 0.28568 |
| 18 | `tests/pre-gig.test.mjs` | 222 | older | system: driver and event findings filtered to the preset gear, warnings amber, errors red, unsupported excluded | R10 #1554 / 2.764589 | PASS / 3.634472 |
| 19 | `tests/pre-gig.test.mjs` | 242 | older | evidence errors become "Check could not run" with a retry for every kind | R10 #1555 / 0.471374 | PASS / 0.565851 |
| 20 | `tests/pre-gig.test.mjs` | 253 | older | every red or amber result carries a fix with a label and plain-English text | R10 #1556 / 0.306497 | PASS / 0.460733 |
| 21 | `tests/pre-gig.test.mjs` | 272 | older | rollUp matrix (AC-2): fail is red, warn or error is amber, skipped required is incomplete, else green | R10 #1557 / 0.519515 | PASS / 0.730919 |
| 22 | `tests/pre-gig.test.mjs` | 291 | older | rollUp: unsupported steps are excluded from the verdict and mark the check partial (AC-5) | R10 #1558 / 0.107651 | PASS / 0.177147 |
| 23 | `tests/pre-gig.test.mjs` | 301 | older | rollUp: top problems sorted red, amber, then skipped required; copy matches the spec wording | R10 #1559 / 0.171746 | PASS / 0.287031 |
| 24 | `tests/pre-gig.test.mjs` | 312 | older | buildPlan orders parallel steps first, then per-deck steps, then the headphone cue | R10 #1560 / 0.329573 | PASS / 0.373441 |
| 25 | `tests/pre-gig.test.mjs` | 323 | older | buildPlan honours skip and only, drops MIDI and software when the preset has none, and stays inside the 120 s budget | R10 #1561 / 0.246318 | PASS / 0.363416 |
| 26 | `tests/pre-gig.test.mjs` | 338 | older | built-in presets validate and reference the owner's real gear profile ids and known formats | R10 #1562 / 0.500999 | PASS / 0.698149 |
| 27 | `tests/pre-gig.test.mjs` | 353 | older | built-in presets load through loadBuiltinPresets and bad ones are reported | R10 #1563 / 0.578383 | PASS / 0.746833 |
| 28 | `tests/pre-gig.test.mjs` | 366 | older | validatePreset: bad deck ids, duplicates, inputs, formats, rates, MIDI and gear references | R10 #1564 / 0.565434 | PASS / 0.769587 |
| 29 | `tests/pre-gig.test.mjs` | 391 | older | presets: newer versions are read-only, import rejects >256 kB and junk, export/duplicate round-trip (AC-8) | R10 #1565 / 1.109507 | PASS / 2.928952 |
| 30 | `tests/pre-gig.test.mjs` | 419 | older | presetFromEquipment builds a valid preset from real profiles; deck B defaults to inputs 3-4 and the format comes from the media library | R10 #1566 / 0.579075 | PASS / 0.680593 |
| 31 | `tests/pre-gig.test.mjs` | 436 | older | formatForMedia resolves timecode media only, from the library, in any container shape | R10 #1567 / 0.170684 | PASS / 0.269845 |
| 32 | `tests/pre-gig.test.mjs` | 444 | older | the built-in rigs on a multi-pair interface put deck A on 1-2 and deck B on 3-4 (Traktor Audio 8 DJ) | R10 #1568 / 0.271465 | PASS / 0.329475 |
| 33 | `tests/pre-gig.test.mjs` | 450 | older | namesMatch is forgiving but refuses tiny fragments | R10 #1569 / 0.082393 | PASS / 0.13272 |
| 34 | `tests/pre-gig.test.mjs` | 459 | older | diffRuns lists which steps changed and whether they improved (AC-6) | R10 #1570 / 0.311736 | PASS / 0.526541 |
| 35 | `tests/pre-gig.test.mjs` | 480 | older | synthetic Traktor MK2 timecode from the generator passes both deck steps | R10 #1571 / 645.959926 | PASS / 696.048647 |
| 36 | `tests/pre-gig.test.mjs` | 487 | older | synthetic: noisy carrier is amber then red as the SNR falls (real analyzeTimecode) | R10 #1572 / 1245.642168 | PASS / 1255.829363 |
| 37 | `tests/pre-gig.test.mjs` | 495 | older | synthetic: one muted channel is red, naming the channel; silence is a no-signal red | R10 #1573 / 510.310811 | PASS / 515.502997 |
| 38 | `tests/pre-gig.test.mjs` | 508 | older | synthetic: dropouts and a wrong-format record are caught | R10 #1574 / 1128.430237 | PASS / 1122.21455 |
| 39 | `tests/pre-gig.test.mjs` | 517 | older | synthetic hum: 50 Hz and 60 Hz families are detected and graded against the carrier | R10 #1575 / 3108.456015 | PASS / 3081.279402 |
| 40 | `tests/pre-gig.test.mjs` | 535 | older | synthetic needle-up hum is measured on the lifted segment | R10 #1576 / 365.582738 | PASS / 373.916324 |
| 41 | `tests/pre-gig.test.mjs` | 542 | older | summarizeTimecode exposes plain numbers and handles failures | R10 #1577 / 269.962371 | PASS / 378.948117 |
| 42 | `tests/pre-gig.test.mjs` | 568 | older | runPregig: an all-ready rig produces a green verdict with every automatic step passing (AC-1) | R10 #1578 / 773.089053 | PASS / 590.825865 |
| 43 | `tests/pre-gig.test.mjs` | 583 | older | runPregig: deck B captures input pair 3-4 and deck A pair 1-2, so a two-deck rig can be green | R10 #1579 / 1192.396027 | PASS / 1182.483992 |
| 44 | `tests/pre-gig.test.mjs` | 593 | older | runPregig: a pair the interface does not offer is reported as no such input, not a failure | R10 #1580 / 1299.8799 | PASS / 1196.168447 |
| 45 | `tests/pre-gig.test.mjs` | 609 | older | deckPairFirst maps zero-based deck inputs to the 1-based first channel of a stereo pair | R10 #1581 / 0.174512 | PASS / 0.191467 |
| 46 | `tests/pre-gig.test.mjs` | 618 | older | runPregig: audio interface missing is red, signal steps are skipped (blocked) and nothing is captured (AC-4) | R10 #1582 / 0.725008 | PASS / 0.470427 |
| 47 | `tests/pre-gig.test.mjs` | 632 | older | runPregig: a thrown step is an error row, the verdict is amber and the other steps still run | R10 #1583 / 595.33317 | PASS / 588.245116 |
| 48 | `tests/pre-gig.test.mjs` | 642 | older | runPregig: Esc cancels, finished steps are kept and the rest are skipped (cancelled) (AC-7) | R10 #1584 / 662.471205 | PASS / 618.554198 |
| 49 | `tests/pre-gig.test.mjs` | 658 | older | runPregig: manual time is reported separately and excluded from the duration | R10 #1585 / 576.932094 | PASS / 575.529406 |
| 50 | `tests/pre-gig.test.mjs` | 668 | older | runPregig: orchestration overhead with instant mocked captures stays far below 5 s | R10 #1586 / 23.195493 | PASS / 24.286399 |
| 51 | `tests/pre-gig.test.mjs` | 675 | older | runPregig: CAPTURE_BUSY offers to stop the other capture, retries once and records the choice | R10 #1587 / 568.128377 | PASS / 590.005422 |
| 52 | `tests/pre-gig.test.mjs` | 690 | older | runPregig: one capture feeds both deck steps; only/skip re-run just the chosen steps | R10 #1588 / 563.063765 | PASS / 570.175049 |
| 53 | `tests/pre-gig.test.mjs` | 701 | older | runPregig: needle-up hum asks the user, captures the lifted segment and grades it | R10 #1589 / 474.465055 | PASS / 423.968871 |
| 54 | `tests/pre-gig.test.mjs` | 715 | older | runPregig: no desktop backend leaves required steps skipped and the verdict incomplete (AC-5) | R10 #1590 / 0.505519 | PASS / 0.294622 |
| 55 | `tests/pre-gig.test.mjs` | 724 | older | createNativeDeps drives the Tauri commands with the pre-gig capture holder and captures the deck input pair | R10 #1591 / 0.655555 | PASS / 0.504348 |
| 56 | `tests/pre-gig.test.mjs` | 745 | older | toRunInput maps a run to the pregig_save_run contract, redacting Windows user paths | R10 #1592 / 565.64826 | PASS / 590.653956 |
| 57 | `tests/pre-gig.test.mjs` | 762 | older | createPregigApi (native) sends exactly the contract argument names | R10 #1593 / 0.347311 | PASS / 0.438248 |
| 58 | `tests/pre-gig.test.mjs` | 780 | older | createPregigApi (browser) stores runs and presets locally with the same shapes | R10 #1594 / 1.857419 | PASS / 2.603322 |
| 59 | `tests/pre-gig.test.mjs` | 807 | older | contract examples are real step results shapes (states the database accepts) | R10 #1595 / 0.102755 | PASS / 0.158649 |
| 60 | `tests/pregig-storage-screen.test.mjs` | 77 | older | Pre-gig screen keeps unavailable preset storage visible across tabs and retries without silently choosing a rig | R17 #60 / 37.025002 | PASS / 37.819949 |
| 61 | `tests/pregig-storage-screen.test.mjs` | 92 | older | Pre-gig screen distinguishes unavailable History from confirmed empty History and recovers on Retry | R17 #61 / 2.982065 | PASS / 2.850915 |
| 62 | `tests/pregig-storage-screen.test.mjs` | 106 | older | Pre-gig screen retains previously loaded History with a persistent unavailable message after a failed refresh | R17 #62 / 4.310723 | PASS / 3.690927 |
| 63 | `tests/pregig-storage-screen.test.mjs` | 118 | older | Pre-gig preset Save keeps the same draft and inline error after denied persistence, then confirms one successful retry | R17 #63 / 5.768075 | PASS / 5.465454 |
| 64 | `tests/pregig-storage-screen.test.mjs` | 136 | older | Pre-gig preset Save coalesces repeated clicks and keeps the dialog open while persistence is pending | R17 #64 / 4.294488 | PASS / 3.562835 |
| 65 | `tests/pregig-storage-screen.test.mjs` | 148 | older | Pre-gig a failed pending preset save restores draft editing and preserves every entered value for retry | R17 #65 / 3.783981 | PASS / 3.831609 |
| 66 | `tests/pregig-storage-screen.test.mjs` | 168 | older | Pre-gig keeps an acknowledged preset and truthful success when the subsequent list refresh is unavailable | R17 #66 / 2.784768 | PASS / 2.768771 |
| 67 | `tests/pregig-storage-screen.test.mjs` | 180 | older | Pre-gig an acknowledged preset save finishes while an optional refresh is still pending | R17 #67 / 3.115947 | PASS / 3.099038 |
| 68 | `tests/pregig-storage-screen.test.mjs` | 191 | older | Pre-gig actual Retry and shell Save retain the completed result and never claim persistence before it succeeds | R17 #68 / 12.469212 | PASS / 12.496642 |
| 69 | `tests/pregig-storage-screen.test.mjs` | 211 | older | Pre-gig saving a different preset keeps an unsaved check attached to the rig it actually tested | R17 #69 / 5.754554 | PASS / 6.266358 |
| 70 | `tests/pregig-storage-screen.test.mjs` | 225 | older | Pre-gig Done preserves an unsaved result until the user confirms discarding it | R17 #70 / 9.459636 | PASS / 9.643593 |
| 71 | `tests/pregig-storage-screen.test.mjs` | 225 | older | Pre-gig choosing another preset preserves an unsaved result until the user confirms discarding it | R17 #71 / 12.225766 | PASS / 14.872231 |
| 72 | `tests/pregig-storage-screen.test.mjs` | 225 | older | Pre-gig running everything again preserves an unsaved result until the user confirms discarding it | R17 #72 / 10.457307 | PASS / 11.576838 |
| 73 | `tests/pregig-storage-screen.test.mjs` | 235 | older | Pre-gig a late failed History request cannot replace a newer successful read | R17 #73 / 1.862091 | PASS / 1.353064 |
| 74 | `tests/pregig-storage-screen.test.mjs` | 245 | older | Pre-gig disposal retires a pending History presentation and the Save callback | R17 #74 / 1.204712 | PASS / 0.853332 |
| 75 | `tests/pregig-storage-screen.test.mjs` | 254 | older | Pre-gig import retains the parsed draft after a failed save and retries without picking the file again | R17 #75 / 5.098938 | PASS / 3.511427 |
| 76 | `tests/pregig-storage-screen.test.mjs` | 271 | older | Pre-gig displays future-version presets read-only without running or rewriting their contents | R17 #76 / 1.714028 | PASS / 2.244863 |
| 77 | `tests/pregig-storage-screen.test.mjs` | 303 | older | Pre-gig PDF keeps the tested interface after the same saved preset is edited | R17 #77 / 11.47073 | PASS / 9.878896 |
| 78 | `tests/pregig-storage-screen.test.mjs` | 319 | older | Pre-gig PDF preparation cannot export or announce a result retired before its handoff | R17 #78 / 3.501927 | PASS / 4.734386 |
| 79 | `tests/report-pdf.test.mjs` | 33 | older | suggestPdfName: pattern, kinds, local timestamp | R10 #1624 / 1.507523 | PASS / 1.614587 |
| 80 | `tests/report-pdf.test.mjs` | 41 | older | deviceSlug: unicode, invalid Windows chars, reserved names, 40-char cap | R10 #1625 / 0.336746 | PASS / 0.300141 |
| 81 | `tests/report-pdf.test.mjs` | 54 | older | cssString: quotes, backslashes and markup cannot break out of the <style> block | R10 #1626 / 0.329585 | PASS / 0.403967 |
| 82 | `tests/report-pdf.test.mjs` | 63 | older | formatStamp is local YYYY-MM-DD HH:mm | R10 #1627 / 0.171377 | PASS / 0.205539 |
| 83 | `tests/report-pdf.test.mjs` | 70 | older | defaultPaper: Letter for US-style regions, A4 elsewhere | R10 #1628 / 2.574655 | PASS / 2.701089 |
| 84 | `tests/report-pdf.test.mjs` | 75 | older | normalizePdfOptions / readPdfSettings | R10 #1629 / 0.971689 | PASS / 1.060013 |
| 85 | `tests/report-pdf.test.mjs` | 90 | older | niceTicks: covers the range with 1/2/2.5/5 x 10^n steps | R10 #1630 / 0.718538 | PASS / 0.750228 |
| 86 | `tests/report-pdf.test.mjs` | 108 | older | finite but unrepresentable chart axes fail closed with a visible PDF warning | R10 #1631 / 4.471533 | PASS / 5.559986 |
| 87 | `tests/report-pdf.test.mjs` | 132 | older | decimate keeps endpoints and caps the count | R10 #1632 / 0.704988 | PASS / 0.790057 |
| 88 | `tests/report-pdf.test.mjs` | 141 | older | renderChartSvg: vector SVG, selectable text, escaped labels, strokes >= 0.75 pt on A4 | R10 #1633 / 0.530697 | PASS / 0.703067 |
| 89 | `tests/report-pdf.test.mjs` | 157 | older | severity icons differ by shape and keep the text label (AC-5) | R10 #1634 / 0.324216 | PASS / 0.310467 |
| 90 | `tests/report-pdf.test.mjs` | 167 | older | extractReportParts: styles from head, body only, scripts dropped | R10 #1635 / 0.413791 | PASS / 0.469696 |
| 91 | `tests/report-pdf.test.mjs` | 174 | older | buildPrintableReport(run): @page header/footer, counter, no script, escaped user strings, SVG charts | R10 #1636 / 1.180462 | PASS / 1.209167 |
| 92 | `tests/report-pdf.test.mjs` | 191 | older | print CSS: theme-independent light palette, rows unsplit, thead repeats (AC-2, AC-4) | R10 #1637 / 1.46528 | PASS / 1.62969 |
| 93 | `tests/report-pdf.test.mjs` | 205 | older | partial: a failing chart becomes a placeholder and a warning | R10 #1638 / 1.259821 | PASS / 1.299152 |
| 94 | `tests/report-pdf.test.mjs` | 212 | older | run: raw measurement table only when asked; row caps | R10 #1639 / 3.001937 | PASS / 3.364076 |
| 95 | `tests/report-pdf.test.mjs` | 223 | older | device: serial redaction option, title and file name | R10 #1640 / 2.26457 | PASS / 2.693918 |
| 96 | `tests/report-pdf.test.mjs` | 235 | older | systemHealth: every finding has icon + severity text + evidence (AC-5) | R10 #1641 / 1.498259 | PASS / 2.045324 |
| 97 | `tests/report-pdf.test.mjs` | 258 | older | registerPrintableKind: later features add kinds without editing report-pdf.js | R10 #1642 / 0.638599 | PASS / 0.839282 |
| 98 | `tests/report-pdf.test.mjs` | 303 | older | exportPdf: WebView2 path when pdf_render succeeds (AC-1), exact contract arguments | R10 #1643 / 1.153362 | PASS / 1.303539 |
| 99 | `tests/report-pdf.test.mjs` | 319 | older | exportPdf: browser mode / non-Windows go straight to the print fallback (AC-6) | R10 #1644 / 0.964307 | PASS / 1.047615 |
| 100 | `tests/report-pdf.test.mjs` | 335 | older | exportPdf: pdf_render "unsupported" falls back and is remembered for the session | R10 #1645 / 1.28575 | PASS / 1.525082 |
| 101 | `tests/report-pdf.test.mjs` | 348 | older | exportPdf: backend errors fall back to the print dialog and report the error | R10 #1646 / 1.262946 | PASS / 1.255236 |
| 102 | `tests/report-pdf.test.mjs` | 361 | older | exportPdf: timeout rejects with a retryable error (AC-7) | R10 #1647 / 41.501395 | PASS / 41.695364 |
| 103 | `tests/report-pdf.test.mjs` | 381 | older | exportPdf: path errors are not retried or printed; cancel is quiet; one export at a time | R10 #1648 / 3.093845 | PASS / 3.403715 |
| 104 | `tests/report-pdf.test.mjs` | 400 | older | normalizePdfError handles strings and objects | R10 #1649 / 0.264247 | PASS / 0.242023 |
| 105 | `tests/report-pdf.test.mjs` | 406 | older | loadPrintCss fetches once and tolerates failure | R10 #1650 / 0.335624 | PASS / 0.355945 |
| 106 | `tests/report-pdf.test.mjs` | 418 | older | report fixture for the Windows PrintToPdf test is up to date | R10 #1651 / 0.581122 | PASS / 0.523687 |
| 107 | `tests/service-panel-lifecycle.test.mjs` | 67 | older | late customer resolve leaves the replacement panel and feedback alone | R10 #1877 / 7.941544 | PASS / 8.704452 |
| 108 | `tests/service-panel-lifecycle.test.mjs` | 67 | older | late customer reject leaves the replacement panel and feedback alone | R10 #1878 / 1.361498 | PASS / 1.396799 |
| 109 | `tests/service-panel-lifecycle.test.mjs` | 81 | older | current customer submission reports failure and can be retried | R10 #1879 / 3.322282 | PASS / 3.345428 |
| 110 | `tests/service-panel-lifecycle.test.mjs` | 67 | older | late job details resolve leaves the replacement panel and feedback alone | R10 #1880 / 1.136648 | PASS / 1.229457 |
| 111 | `tests/service-panel-lifecycle.test.mjs` | 67 | older | late job details reject leaves the replacement panel and feedback alone | R10 #1881 / 1.185281 | PASS / 1.273003 |
| 112 | `tests/service-panel-lifecycle.test.mjs` | 81 | older | current job details submission reports failure and can be retried | R10 #1882 / 1.428309 | PASS / 1.340375 |
| 113 | `tests/service-panel-lifecycle.test.mjs` | 92 | older | a cancelled customer editor cannot reload or toast over the replacement editor | R10 #1883 / 2.377885 | PASS / 2.56833 |
| 114 | `tests/service-panel-lifecycle.test.mjs` | 110 | older | late saved-run link resolve preserves the current panel and feedback | R10 #1884 / 1.858289 | PASS / 1.640896 |
| 115 | `tests/service-panel-lifecycle.test.mjs` | 110 | older | late saved-run link reject preserves the current panel and feedback | R10 #1885 / 0.683773 | PASS / 0.690778 |
| 116 | `tests/service-panel-lifecycle.test.mjs` | 123 | older | current saved-run linking still refreshes and reports the linked phase | R10 #1886 / 0.834672 | PASS / 0.868455 |
| 117 | `tests/service-panel-lifecycle.test.mjs` | 131 | older | late photo unlink resolve does not reload or announce in another panel | R10 #1887 / 0.99896 | PASS / 1.174325 |
| 118 | `tests/service-panel-lifecycle.test.mjs` | 131 | older | late photo unlink reject does not reload or announce in another panel | R10 #1888 / 0.718817 | PASS / 0.680342 |
| 119 | `tests/service-panel-lifecycle.test.mjs` | 154 | older | late photo attach resolve preserves the submitted write and suppresses obsolete feedback | R10 #1889 / 7.350211 | PASS / 7.822727 |
| 120 | `tests/service-panel-lifecycle.test.mjs` | 154 | older | late photo attach reject preserves the submitted write and suppresses obsolete feedback | R10 #1890 / 2.927245 | PASS / 2.911445 |
| 121 | `tests/service-panel-lifecycle.test.mjs` | 171 | older | photo success is not announced when a refresh is superseded by navigation | R10 #1891 / 3.28154 | PASS / 3.481883 |
| 122 | `tests/service-panel-lifecycle.test.mjs` | 186 | older | a submitted photo batch finishes all its attachments after leaving the panel | R10 #1892 / 5.76857 | PASS / 4.658271 |
| 123 | `tests/service-panel-lifecycle.test.mjs` | 200 | older | current photo attachment success retains its visible feedback and releases the button | R10 #1893 / 3.271986 | PASS / 3.384557 |
| 124 | `tests/service-panel-lifecycle.test.mjs` | 200 | older | current photo attachment failure retains its visible feedback and releases the button | R10 #1894 / 2.311775 | PASS / 2.376222 |
| 125 | `tests/service-panel-lifecycle.test.mjs` | 211 | older | HTML export captures the clicked sheet options before asynchronous preparation | R10 #1895 / 5.441335 | PASS / 5.137742 |
| 126 | `tests/service-panel-lifecycle.test.mjs` | 225 | older | late HTML export resolve completes the submitted save without feedback in another panel | R10 #1896 / 2.34174 | PASS / 3.078296 |
| 127 | `tests/service-panel-lifecycle.test.mjs` | 225 | older | late HTML export reject completes the submitted save without feedback in another panel | R10 #1897 / 2.180586 | PASS / 2.290773 |
| 128 | `tests/service-panel-lifecycle.test.mjs` | 238 | older | HTML export preparation abandons a retired panel before opening a save dialog | R10 #1898 / 1.099983 | PASS / 1.055076 |
| 129 | `tests/service-panel-lifecycle.test.mjs` | 247 | older | current HTML export failure retains a working retry and cancellation stays quiet | R10 #1899 / 7.492455 | PASS / 5.993808 |
| 130 | `tests/service-panel-lifecycle.test.mjs` | 274 | older | PDF export captures the clicked sheet options and still reports current success | R10 #1900 / 4.859115 | PASS / 4.885052 |
| 131 | `tests/service-panel-lifecycle.test.mjs` | 286 | older | late PDF export resolve preserves the backend result and current-screen feedback | R10 #1901 / 4.263475 | PASS / 3.76627 |
| 132 | `tests/service-panel-lifecycle.test.mjs` | 286 | older | late PDF export reject preserves the backend result and current-screen feedback | R10 #1902 / 2.57388 | PASS / 2.379956 |
| 133 | `tests/service-panel-lifecycle.test.mjs` | 299 | older | a PDF retry offered on a previous panel cannot start another export after navigation | R10 #1903 / 3.204834 | PASS / 3.826871 |
| 134 | `tests/service-panel-lifecycle.test.mjs` | 309 | older | current PDF failure can retry and callers without ownership callbacks retain feedback | R10 #1904 / 3.136051 | PASS / 3.235553 |
| 135 | `tests/setup-wizard-model.test.mjs` | 14 | older | step list: seven steps on Windows, health dropped elsewhere (AC-7) | R10 #1966 / 1.416959 | PASS / 1.560926 |
| 136 | `tests/setup-wizard-model.test.mjs` | 22 | older | start, next, back and the bounds | R10 #1967 / 1.138702 | PASS / 1.11813 |
| 137 | `tests/setup-wizard-model.test.mjs` | 42 | older | skip semantics: skipping a step records it and advances; the summary cannot be skipped | R10 #1968 / 0.493572 | PASS / 0.307082 |
| 138 | `tests/setup-wizard-model.test.mjs` | 61 | older | answers are merged, sanitized and bounded | R10 #1969 / 0.627554 | PASS / 0.751088 |
| 139 | `tests/setup-wizard-model.test.mjs` | 80 | added | setup summary retains incomplete driver coverage through persistence and clears it for a new attempt | Added in R18; no prior timing | PASS / 1.454776 |
| 140 | `tests/setup-wizard-model.test.mjs` | 93 | older | resume after step N restores step and answers (AC-2) | R10 #1970 / 0.501093 | PASS / 0.287712 |
| 141 | `tests/setup-wizard-model.test.mjs` | 108 | older | re-run keeps prefilled answers, restarts at step 1 and clears the skip marks (AC-8) | R10 #1971 / 0.963608 | PASS / 0.569576 |
| 142 | `tests/setup-wizard-model.test.mjs` | 121 | older | finish completes only an active wizard | R10 #1972 / 0.167472 | PASS / 0.283426 |
| 143 | `tests/setup-wizard-model.test.mjs` | 130 | older | migrateWizardState never throws and resets what it cannot trust | R10 #1973 / 0.463266 | PASS / 0.606521 |
| 144 | `tests/setup-wizard-model.test.mjs` | 152 | older | summarize copes with missing answers and per-env rows | R10 #1974 / 0.448624 | PASS / 0.471048 |
| 145 | `tests/setup-wizard-model.test.mjs` | 172 | older | resume window is 30 days (AC-2) | R10 #1975 / 0.33931 | PASS / 0.247812 |
| 146 | `tests/setup-wizard-model.test.mjs` | 184 | older | startup decision: fresh, upgrade install, resumable, finished, flag off (AC-1, AC-2, AC-10) | R10 #1976 / 0.687503 | PASS / 0.723928 |
| 147 | `tests/setup-wizard-model.test.mjs` | 207 | older | level verdict table (spec §6) | R10 #1977 / 0.560312 | PASS / 0.526151 |
| 148 | `tests/setup-wizard-model.test.mjs` | 229 | older | test tone is capped at -12 dBFS and defaults to -20 (AC-4) | R10 #1978 / 0.134122 | PASS / 0.161052 |
| 149 | `tests/setup-wizard-model.test.mjs` | 240 | older | calibration default (AC-5) and announcements | R10 #1979 / 0.136775 | PASS / 0.190797 |
| 150 | `tests/support-dialog.test.mjs` | 5 | older | bundleFileName is deckchek-diagnostics-YYYYMMDD-HHmm.zip in local time | R10 #2098 / 1.506886 | PASS / 1.025091 |
| 151 | `tests/support-dialog.test.mjs` | 9 | older | buildClientContext picks WebView2 version, locale and settings; omits systemHealth when absent | R10 #2099 / 0.733262 | PASS / 0.999192 |
| 152 | `tests/support-dialog.test.mjs` | 17 | older | sizeText | R10 #2100 / 0.18613 | PASS / 0.202635 |
| 153 | `tests/system-check.test.mjs` | 16 | older | bridge: no backend gives supported:false payloads | R10 #2134 / 1.900588 | PASS / 1.854007 |
| 154 | `tests/system-check.test.mjs` | 23 | older | bridge: wraps the three commands | R10 #2135 / 0.287302 | PASS / 0.339671 |
| 155 | `tests/system-check.test.mjs` | 31 | older | unsupported scans yield a single info finding | R10 #2136 / 0.374563 | PASS / 0.542956 |
| 156 | `tests/system-check.test.mjs` | 41 | older | every required problem code has a meaning and action | R10 #2137 / 0.30576 | PASS / 0.367513 |
| 157 | `tests/system-check.test.mjs` | 52 | older | driver problem code 43 is an error with USB advice; 45 is info | R10 #2138 / 0.762517 | PASS / 1.188155 |
| 158 | `tests/system-check.test.mjs` | 61 | older | every known code produces a finding | R10 #2139 / 0.632311 | PASS / 2.30239 |
| 159 | `tests/system-check.test.mjs` | 70 | older | unsigned driver is a warning | R10 #2140 / 0.222835 | PASS / 0.370867 |
| 160 | `tests/system-check.test.mjs` | 77 | older | ASIO: missing DLL, bad signature, generic and multiple | R10 #2141 / 0.994145 | PASS / 0.546391 |
| 161 | `tests/system-check.test.mjs` | 91 | older | generic Microsoft USB audio driver for vendor hardware is info | R10 #2142 / 0.484418 | PASS / 0.779551 |
| 162 | `tests/system-check.test.mjs` | 98 | older | very old drivers (>3 years) are info | R10 #2143 / 0.357758 | PASS / 0.61888 |
| 163 | `tests/system-check.test.mjs` | 106 | older | healthy drivers produce an ok finding | R10 #2144 / 0.15965 | PASS / 0.298378 |
| 164 | `tests/system-check.test.mjs` | 111 | older | Application Error 1000: exception meanings and module heuristics | R10 #2145 / 1.728689 | PASS / 2.723002 |
| 165 | `tests/system-check.test.mjs` | 128 | older | repeated events are grouped with count and first/last time | R10 #2146 / 0.413642 | PASS / 0.59878 |
| 166 | `tests/system-check.test.mjs` | 138 | older | hang 1002 and WER 1001 | R10 #2147 / 0.443427 | PASS / 0.655065 |
| 167 | `tests/system-check.test.mjs` | 151 | older | audio service failures (SCM 7000..7034) | R10 #2148 / 0.416927 | PASS / 0.830498 |
| 168 | `tests/system-check.test.mjs` | 160 | older | Kernel-PnP, USB hub/xHCI and portcls/usbaudio events | R10 #2149 / 0.410828 | PASS / 0.778851 |
| 169 | `tests/system-check.test.mjs` | 171 | older | no events gives ok with period | R10 #2150 / 0.096465 | PASS / 0.186801 |
| 170 | `tests/system-check.test.mjs` | 182 | older | DJ crash dump/report: "X crashed on <date>" with module and exception | R10 #2151 / 0.749778 | PASS / 0.956087 |
| 171 | `tests/system-check.test.mjs` | 192 | older | DJ log lines: errors, crashes and dropouts | R10 #2152 / 1.071852 | PASS / 1.481416 |
| 172 | `tests/system-check.test.mjs` | 213 | older | installed app with no issues is ok; uninstalled apps omitted | R10 #2153 / 0.135794 | PASS / 0.256536 |
| 173 | `tests/system-check.test.mjs` | 224 | older; assertions strengthened | findings sorted error > warning > info > ok and summarized | R10 #2154 / 0.37226 | PASS / 0.526501 |
| 174 | `tests/system-check.test.mjs` | 239 | older; assertions strengthened | scan errors surface as an info finding; report HTML escapes content | R10 #2155 / 0.349756 | PASS / 0.490718 |
| 175 | `tests/system-health-coverage.test.mjs` | 15 | added | System Health native responses must be objects instead of silently becoming unsupported scans | Added in R18; no prior timing | PASS / 2.247648 |
| 176 | `tests/system-health-coverage.test.mjs` | 24 | added | System Health all-clear requires three completed scan areas and preserves benign information | Added in R18; no prior timing | PASS / 1.897171 |
| 177 | `tests/system-health-coverage.test.mjs` | 35 | added | System Health incomplete drivers collection cannot produce an area or system all-clear | Added in R18; no prior timing | PASS / 0.591429 |
| 178 | `tests/system-health-coverage.test.mjs` | 35 | added | System Health incomplete events collection cannot produce an area or system all-clear | Added in R18; no prior timing | PASS / 0.254502 |
| 179 | `tests/system-health-coverage.test.mjs` | 35 | added | System Health incomplete djLogs collection cannot produce an area or system all-clear | Added in R18; no prior timing | PASS / 0.203586 |
| 180 | `tests/system-health-coverage.test.mjs` | 46 | added | System Health retains a real fault and its severity when another area is incomplete | Added in R18; no prior timing | PASS / 0.757338 |
| 181 | `tests/system-health-coverage.test.mjs` | 57 | added | System Health mixed supported and unavailable areas remains incomplete | Added in R18; no prior timing | PASS / 0.234262 |
| 182 | `tests/system-health-coverage.test.mjs` | 65 | added | System Health all unsupported scans remain informational with no checked areas | Added in R18; no prior timing | PASS / 0.300692 |
| 183 | `tests/system-health-coverage.test.mjs` | 75 | added | System Health a rejected command stays failed even when the other two scans are clean | Added in R18; no prior timing | PASS / 0.284006 |
| 184 | `tests/system-health-coverage.test.mjs` | 84 | added | System Health three rejected commands cannot become an empty successful scan | Added in R18; no prior timing | PASS / 0.338689 |
| 185 | `tests/system-health-coverage.test.mjs` | 91 | added | System Health distinguishes missing coverage from a pending replacement scan | Added in R18; no prior timing | PASS / 0.271839 |
| 186 | `tests/system-health-coverage.test.mjs` | 100 | added | System Health incomplete response shape cannot certify collection completion | Added in R18; no prior timing | PASS / 0.241043 |
| 187 | `tests/system-health-coverage.test.mjs` | 113 | added | System Health driver-only setup explicitly declares its narrower scan coverage | Added in R18; no prior timing | PASS / 0.246661 |
| 188 | `tests/system-health-coverage.test.mjs` | 123 | added | System Health serialized findings preserve coverage instead of relying on ok and info counts | Added in R18; no prior timing | PASS / 0.320702 |
| 189 | `tests/system-health-coverage.test.mjs` | 132 | added | System Health HTML and real PDF composition retain the same missing area and recompute stale summaries | Added in R18; no prior timing | PASS / 1.838172 |
| 190 | `tests/system-health-screen.test.mjs` | 54 | added | System Health screen calls all three scans and shows HEALTHY only after complete clean coverage | Added in R18; no prior timing | PASS / 53.371401 |
| 191 | `tests/system-health-screen.test.mjs` | 63 | added | System Health screen retains failed drivers coverage and repairs it through the actual Retry control | Added in R18; no prior timing | PASS / 55.061972 |
| 192 | `tests/system-health-screen.test.mjs` | 63 | added | System Health screen retains failed events coverage and repairs it through the actual Retry control | Added in R18; no prior timing | PASS / 15.544 |
| 193 | `tests/system-health-screen.test.mjs` | 63 | added | System Health screen retains failed djLogs coverage and repairs it through the actual Retry control | Added in R18; no prior timing | PASS / 7.983288 |
| 194 | `tests/system-health-screen.test.mjs` | 78 | added | System Health screen keeps partial drivers collection visible without an all-clear finding | Added in R18; no prior timing | PASS / 10.023745 |
| 195 | `tests/system-health-screen.test.mjs` | 78 | added | System Health screen keeps partial events collection visible without an all-clear finding | Added in R18; no prior timing | PASS / 7.593752 |
| 196 | `tests/system-health-screen.test.mjs` | 78 | added | System Health screen keeps partial djLogs collection visible without an all-clear finding | Added in R18; no prior timing | PASS / 6.711746 |
| 197 | `tests/system-health-screen.test.mjs` | 90 | added | System Health screen shows mixed unsupported coverage while retaining successful areas | Added in R18; no prior timing | PASS / 12.32982 |
| 198 | `tests/system-health-screen.test.mjs` | 99 | added | System Health screen reports all unsupported scans as unavailable instead of healthy | Added in R18; no prior timing | PASS / 25.642929 |
| 199 | `tests/system-health-screen.test.mjs` | 107 | added | System Health browser preview performs no scan and remains informational | Added in R18; no prior timing | PASS / 2.236341 |
| 200 | `tests/system-health-screen.test.mjs` | 113 | added | System Health screen keeps a real driver problem above incomplete collection coverage | Added in R18; no prior timing | PASS / 17.737608 |
| 201 | `tests/system-health-screen.test.mjs` | 123 | added | System Health pending Retry coalesces clicks and blocks exports and event-period replacement | Added in R18; no prior timing | PASS / 11.408395 |
| 202 | `tests/system-health-screen.test.mjs` | 136 | added | System Health three failed scans retain an exportable incomplete result | Added in R18; no prior timing | PASS / 5.996882 |
| 203 | `tests/system-health-screen.test.mjs` | 148 | added | System Health actual HTML and PDF actions retain the same failed-area coverage | Added in R18; no prior timing | PASS / 12.021527 |
| 204 | `tests/system-health-screen.test.mjs` | 162 | added | System Health disposal retires a pending scan and export callbacks | Added in R18; no prior timing | PASS / 4.853013 |
| 205 | `tests/system-health-screen.test.mjs` | 174 | added | System Health a replacement scan retires pending PDF preparation and keeps exports disabled | Added in R18; no prior timing | PASS / 11.525792 |
| 206 | `tests/system-health-screen.test.mjs` | 186 | added | System Health an invalid native response remains a failed area with an actual Retry action | Added in R18; no prior timing | PASS / 8.135056 |
| 207 | `tests/system-health-screen.test.mjs` | 196 | added | diagnostics actual health collection retains failed coverage in the native context | Added in R18; no prior timing | PASS / 12.624333 |
| 208 | `tests/system-health-screen.test.mjs` | 216 | added | System Health toast PDF Retry retains busy ownership and restores controls for an intervening scan | Added in R18; no prior timing | PASS / 14.669056 |
