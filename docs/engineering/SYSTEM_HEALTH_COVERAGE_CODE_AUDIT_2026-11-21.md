# System Health coverage — round eighteen code audit

Date: 2026-11-21. Lane: fresh code reviewer. Scope: issue #89; independent static review of the frozen System Health coverage correction and its actual consumers. This report does not qualify the full application.

## Disposition

**FINAL ACCEPT — scoped System Health coverage correction.** No blocking defect was established within the reported collection-coverage, screen Retry/export, setup completion and diagnostics correction. The authorized focused FIRST produced 208/208 passing original cases. Two low-severity, pre-existing presentation follow-ups are recorded below. They do not turn incomplete coverage into a canonical all-clear. The complete source review, exact control review, original FIRST evidence review and retained-copy review are accepted.

No project execution occurred in this lane. Root received all three SOURCE ACCEPT dispositions, authorized external unexecuted control authorship, received the separate control dispositions, and then separately authorized the functional worker's exact single FIRST. The code lane independently inspected the complete original TAP, result, runtime streams, command record and source/index custody as data. No rerun was performed. The original result and all retained copies have separately passed the code lane's independent data review. Root subsequently authorized the final report-only seal after all three retained-copy acceptances and its independent package review.

## Frozen source and independent custody

| Item | Independently verified value |
| --- | --- |
| Frozen commit | `2a807525c70712332e84cecbaf29dd876b5e03cd` |
| Frozen tree | `00c536bad160a5f81fbbc8cea1b7fe62594e2c7a` |
| Sole ordered parent | `b7f3031a185e14a502c7e7e86c6495ea3601d73a` |
| Implementation commit | `148d1cfe7fbb5accbbfd7c265c8d63223b358f23` |
| Implementation parent | `2ac0cf4dc25cb17471149ba64c83b3855c319d45` |
| Original tracked paths | 2,586 |
| Distinct original blobs | 2,317 |
| Summed original path bytes | 91,604,989 |
| Original top-level test files | 209 |
| Canonical source-map SHA-256 | `11f639792299bf8b5aaf9035e94459138fd2d9ab02ce51f2c2c5f584e51765fa` |

I independently enumerated the frozen Git tree, read every distinct immutable blob, recomputed each Git blob identity, and compared every original working path's bytes and executable/symlink mode. The ordered records contain `{path,mode,oid,bytes,sha256}` and use compact sorted-key JSON. There were no byte, mode, path or identity mismatches. I compared the independently built map with root's aid only afterward; all records matched. The worktree was clean. No tracked or ancestor `AGENTS.md` existed.

The review inputs were read in full: `docs/engineering/SYSTEM_HEALTH_COVERAGE_IMPLEMENTATION_2026-11-21.md`, `docs/engineering/SYSTEM_HEALTH_COVERAGE_REVIEW_SCOPE_2026-11-21.md`, `docs/SYSTEM-CHECK-CONTRACT.md`, and the frozen `docs/DECKCHEK-CONTINUATION-HANDOFF.md`.

This is whole-tree byte custody, not a claim to have semantically audited every original file. The semantic review covers every complete changed production module, all nine complete selected test files, and the relevant original downstream boundaries described below. No source, test, assertion, fixture, dependency, native contract or threshold was changed by this lane.

## Static reasoning and actual consumers

### Coverage model and original fault rules

`app/system-check.js:20–60` separates coverage from finding severity. Every required area has one of complete, partial, failed, unsupported, pending or unscanned. Loading/error/idle attempt states take precedence over retained data; only literal supported responses with the required collection arrays and an empty errors array establish completion. Driver-only setup must explicitly pass its required subset. With no explicit coverage, interpreter-produced scan metadata reconstructs all three required areas; raw ok/info severities alone cannot certify them.

`app/system-check.js:67–80` falls back to unsupported only without a command function. A present function returning null, an array or another non-object rejects with fixed invalid-response copy. Literal unsupported objects remain distinguishable from malformed object declarations. These are top-level shape checks and do not deeply validate arbitrary nested or hostile objects.

`app/system-check.js:451–478` preserves real error/warning findings, annotates available findings with their area's scan state, and removes ok findings from partial collection. Mixed unsupported results carry an informational per-area note. The all-supplied-unsupported compatibility finding retains the supplied area list so omitted areas are not counted as scanned. `app/system-check.js:482–504` gives real errors and warnings precedence, keeps entirely unsupported environments informational, and requires complete coverage before pass.

The 34,577-byte existing knowledge-base/helper/driver/event/log heuristic block is identical to the preceding source (SHA-256 `2bf7a6e4c12b5db0f3d5df6cfabe126890bf0d85d3ec98c485e06981af15d99d`). `app/pre-gig.js` is byte-identical (SHA-256 `0c2c6369bb06fa7e06e52da1d3b15f20f3f49d722d7af1ff2968f66c56370184`). Its `evalSystem` at lines 142–161 still performs its existing gear-filtered fault grading and does not adopt the three-area System Health verdict. This review does not expand that distinct policy into a coverage qualification. No audio threshold was weakened.

### Screen ownership, Retry and exports

I read all of `app/ui/screens/system.js`. Lines 50–85 derive findings only from settled current data while preserving rejected command attempts in explicit coverage. A per-area pending request coalesces; scan start increments the result revision, and disposed/stale settlements cannot replace current area state. Failed attempts establish an exportable scan-attempt timestamp. Lines 89–187 display incomplete totals, retain real-fault priority, disable event-period replacement while any area is pending, and present actual Retry/Rescan controls.

Lines 295–318 capture findings, summary, coverage, generation time and the settled driver payload together. HTML rejects pending, never-scanned, wholly unsupported or disposed state. PDF preparation/feedback binds to the captured revision and current pending state. The screen's persistent `pdfBusy` flag survives status refreshes; its callback restores controls against the current scan state after direct exports and toast retries. Disposal at lines 336–341 invalidates the revision, clears the interval, removes feature subscription and header callbacks; retained area callbacks reject disposed state.

I read all of `app/ui/persistence.js`, all of `app/report-pdf.js`, the complete shared `app/ui/live.js`, and the actual Pre-gig, Service, Devices, Fleet booth and M6 PDF call sites. `exportPdfWithFeedback` at persistence lines 112–148 retains default behavior for callers that omit the optional callback, propagates `onBusyChange` into the actual toast Retry closure, and checks current ownership before preparation and feedback. The existing adapter's asynchronous version/CSS/save/render boundary at report-pdf lines 449–479 remains unchanged. Ownership cannot cancel an export already handed to that adapter.

`buildSystemReportHtml` at system-check lines 512–526 recomputes the headline/counts and includes a row for every required area's coverage, including failed areas with no fault finding. The systemHealth printable registration at report-pdf lines 340–353 uses the same summary and the same HTML builder; the header adds the canonical coverage summary. It does not trust a supplied obsolete headline. Printable driver-row caps do not reinterpret collection coverage.

### Setup and diagnostics

I read all of `app/ui/workflows/setup-wizard.js` and `app/setup-wizard-model.js`. The health step at workflow lines 601–638 clears the previous health answer before each attempt, declares driver-only coverage, and persists errors/warnings with the boolean completion result. Step lifecycle ownership suppresses late updates after moving away. A rejected/unsupported retry cannot leave a previous healthy answer. Sanitization at model lines 72–81 accepts only a literal optional completion boolean; serialization/migration retain it; the summary at lines 252–270 labels incomplete driver scans. Legacy count-only answers keep their shape. Native wizard answers are an opaque JSON object (`src-tauri/src/wizard.rs:54–61,115–147`), so the new field is not discarded at that boundary.

I read all of `app/ui/screens/support-dialog.js`. The actual health collector at lines 39–48 retains each `Promise.allSettled` result as done/error state, computes explicit coverage and includes area/scan-state metadata with reduced findings. The opt-in context path at lines 100–105 feeds native preview/create calls. `src-tauri/src/diagnostics.rs:904–910,1250–1256` accepts a JSON value and serializes it as `system-health.json`; no native schema change is needed.

I inspected the native scan types and collector/wrapper paths as source references. DriverScan, EventScan and DjLogScan have literal booleans, typed arrays and error arrays (`src-tauri/src/system_check.rs:60–138`). Collector errors become top-level error entries; unsupported platforms return explicit unsupported values. Native collection can omit data without reporting it: the unchanged event script uses silent error handling at lines 662–684, and bounded file discovery cannot establish arbitrary OS completeness. Accordingly, complete means the requested bounded contract finished without reported omissions; it does not certify the whole computer.

## Nonblocking, pre-existing follow-ups

### LOW — delayed completion speech lacks result ownership

Source: `app/ui/screens/system.js:84`, `app/ui/live.js:23–37`, and disposal at system lines 336–341. `announce` delivers after 40 ms; the System Health completion call does not provide an `isCurrent` predicate. Direct disposal after queueing, or an immediate replacement scan, can leave stale completion speech. Normal shell navigation cancels pending announcements at `app/ui/shell.js:78`; canonical coverage and export data remain correct. The unowned announcement predates this correction.

Bounded follow-up: capture the post-run result revision and provide an ownership predicate that checks disposal, revision and pending status; add a fake-clock case for queue-then-dispose/replacement. The new screen fixture replaces timeouts with no-ops and its disposal case covers a still-pending command, so it does not qualify this narrower delivery window.

### LOW — empty partial ASIO inventory uses definitive absence copy

Source: `app/ui/screens/system.js:239–241`. An empty driver/ASIO collection accompanied by collection errors can still show “No ASIO drivers are registered” and predict WASAPI use. The newly added overall verdict and collection note correctly remain incomplete; this wording is pre-existing.

Bounded follow-up: say no ASIO rows were returned when coverage is incomplete and reserve definitive absence language for a completed driver scan. This requires no fault-threshold or native permission change.

Root accepted both LOW findings as separate queued follow-ups; neither is silently treated as repaired by this frozen candidate.

## Selected assertions and fixture limits

| Original file, in lexical execution order | Authored cases | Added |
| --- | ---: | ---: |
| `tests/pre-gig.test.mjs` | 59 | 0 |
| `tests/pregig-storage-screen.test.mjs` | 19 | 0 |
| `tests/report-pdf.test.mjs` | 28 | 0 |
| `tests/service-panel-lifecycle.test.mjs` | 28 | 0 |
| `tests/setup-wizard-model.test.mjs` | 15 | 1 |
| `tests/support-dialog.test.mjs` | 3 | 0 |
| `tests/system-check.test.mjs` | 22 | 0 |
| `tests/system-health-coverage.test.mjs` | 15 | 15 |
| `tests/system-health-screen.test.mjs` | 19 | 19 |
| **Total** | **208** | **35** |

Every selected case body and assertion was read. The ordered inventory below was independently derived from source declarations and explicit loop domains, without importing or executing JavaScript. Service nested-loop ordering is customer resolve/reject/current, then job-details resolve/reject/current. The resulting 208 names are unique. The external compact sorted-key UTF-8 `{ordinal,file,line,name}` inventory has SHA-256 `19da1355909acf22efd6e6e741bf284e6c6a06f4b82d3abc2e29e8485fe9ce79`.

New coverage assertions exercise each partial area, failed and omitted/pending attempts, mixed/all unsupported responses, malformed present-command responses, retained real faults, explicit driver-only scope, serialized metadata and matching HTML/PDF canonical summaries. New actual-screen cases cover each failed area's Retry, partial notes, unsupported/preview behavior, coalescing, export blocking, three failed-area exports, HTML/PDF handoff, disposal, stale preparation, diagnostics opt-in and toast Retry busy ownership. The setup addition exercises completion persistence, incomplete summary text, clearing and literal-boolean sanitization.

I independently checked the retained historical TAPs as data: 154 older names bind to round ten’s original full TAP (555,767 bytes; SHA-256 `e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`), and 19 Pre-gig screen names bind to round seventeen’s original focused TAP (31,900 bytes; SHA-256 `655d53c1ef68f1d62eefdb06834b840bb0b7bd8c60da22019ac82cd8b4e25cdc`). Every selected original ordinal, exact name, outcome and duration agrees with the independent source inventory. The exact older-case duration sum is 14,913.288587 ms. These are historical timing observations, not results for later bytes.

The original 22 interpreter cases retain Device Manager/ASIO/event/DJ-log fault assertions. Only the old severity-only all-clear and partial-ok assumptions are corrected. The unchanged Pre-gig and Service suites cover actual shared feedback callers, retained result/draft ownership and their existing numeric/audio rules.

The complete shared DOM fixture (`tests/fixtures/service-screen-dom.mjs`) is a small synchronous event/tree implementation, not a browser. One document and its live-region/toast hosts remain stable across cases, matching the production cached host ownership. Per-case cleanup disposes screens and restores native/navigator seams. Synthetic signal fixtures, Pre-gig/PDF contract data, the printable HTML fixture and print CSS were inspected; original bytes were independently verified. Relevant profile identity/driver/software fields were read as fixture data, without treating their provenance notes as newly qualified vendor facts.

PDF tests invoke the real HTML composition and fake native acknowledgement. No rendered PDF, real save dialog, native Windows scan, diagnostic archive, real WebView layout or physical audio is qualified. The existing fixture assertion at `tests/report-pdf.test.mjs:418–422` writes if `UPDATE_FIXTURES` is present; the variable must be absent from any authorized execution environment. There is no authorization here to rerun, update fixtures, loosen timing/audio assertions or execute extracted implementations.

## Exact controls and FIRST evidence

### Static control disposition

**CODE CONTROL ACCEPT** was issued while all controls were unexecuted, for the exact proposal below. I read the complete 479-line recorder, 480-line selection, 95-line launcher, exact one-line command and 257-line review manifest. The source map and complete case inventory were independently parsed and compared as data. I did not import, compile, run or perform a syntax command on any authored control or project module.

Original controls are external to the worktree under `/workspace/scratch/6f2247f2f463/`:

| Exact control basename | Bytes | Mode | SHA-256 |
| --- | ---: | --- | --- |
| `deckchek-system-health-round18-focused-recorder.py` | 27,466 | 0600 | `e1f06e547e65c992b09f2354777a9d816e52b02a925d9ad012d7e0941cd9718b` |
| `deckchek-system-health-round18-focused-selection.json` | 28,712 | 0600 | `ef68e00e9c9749d5cb294cbdc90b93326616ba62dc1e8fe8098da35f9bc0522a` |
| `deckchek-system-health-round18-authorized-launcher.py` | 4,995 | 0600 | `aceb51fb67f805280a8f5090cbd7fbc1b4895596463f02c44eddc52126985f58` |
| `deckchek-system-health-round18-authorized-command.txt` | 163 | 0600 | `0649a232312480d98de0a73d601adcf5f98e67ace93c9e7f4113d943b532ec3c` |
| `system-health-functional-round18-source-identity.json` | 570,148 | 0644 | `94581a9ecc12e1d0eede372336b42368b9876693431283b196894ded92ffb3b2` |
| `system-health-functional-round18-case-inventory.json` | 95,393 | 0644 | `c1baf00572ad94123b03a0d03a944dfa7da232ccdf05e5154e5e4958ce3268a1` |
| `deckchek-system-health-round18-control-review-manifest.json` | 9,841 | 0600 | `f3f9d913a3a0fcd90260ed7ae7f81ad04bf08cbe8a6b3e88bc453624a2af2188` |

I independently recomputed every listed file identity and compared the functional worktree's complete physical file inventory, all 2,586 original working file bytes/modes, clean frozen HEAD/tree/parent/branch, all stage-zero index records, ordinary `H` index flags, absence of ignored/untracked files, and exact 209-test inventory to my independently verified source map. The raw worktree index is 325,991 bytes, mode 0644, SHA-256 `ad1a0910ae3fe8cfa1aaccf7af7ed66819b3c1cebdb13d9f425fa741f1b4f724`. It was unchanged across my read-only checks. The source-map raw file hash and canonical parsed-map hash are recorded separately.

Runtime files were verified solely as bytes and filesystem metadata in this lane:

| Runtime path | Bytes | Mode | SHA-256 |
| --- | ---: | --- | --- |
| `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` | 126,951,512 | 0755 | `acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa` |
| `/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3` | 30,894,944 | 0755 | `fa67443527ed9647f760d807e2a38f26340757123e643c4639cf273ed15d5ea7` |
| `/usr/bin/git` | 4,082,768 | 0755 | `356db14e102d68a1a37d8a1ac577dfd678d45d46e92f468bef8b7154e7bfdc60` |

The Python path is the explicitly pinned symlink to `python3.12`; the other two runtime paths and all controls are regular nonsymlink files. The expected Node `v24.22.3` identity agrees with retained prior identity data; no Node command was issued by this reviewer.

The launcher checks the exact recorder, selection, command, map, inventory and runtime bytes/modes/locations before replacing itself with the pinned isolated Python recorder. The recorder refuses an existing or symlink raw-output directory, uses exclusive output creation, and rejects any present `UPDATE_FIXTURES`, `NODE_OPTIONS`, `MIXXX_CONTROLLERS_DIR`, or `DECKCHEK_AUDIO_*` key, including empty values. It pins complete source/index custody before and after the project invocation and checks controls and runtime files again afterward. The original assertions and nine-file selection remain fixed; fixture updates are prohibited.

The only authorized Node calls were two runtime identities (`--version` and a fixed `-p` expression for runtime metadata), each bounded to 10 seconds, then one invocation of the original nine files with `--test --test-concurrency=1 --test-reporter=tap`. Project TERM is due at 55 seconds and KILL at 60 seconds. A maximum five-second post-KILL wait reaps an already-signaled process; it authorizes no retry or extra project work. The 55-second work budget comprises 15 seconds rounded historical case duration, 20 seconds for the 35 new cases/changed assertions, and 20 seconds for startup, loading, filesystem and host variability. Original assertions and timing thresholds remain intact.

The successful-output manifest enumerates 39 original files, including full TAP and stderr, two raw runtime stdout/stderr pairs, complete before/after source/tree/index/physical/test inventories, original controls and inputs, ordered outcomes and result metadata. Error branches retain original traceback files where applicable. Passing requires the exact 208 ordered unique original names and ordinals, all `ok` with no SKIP/TODO directives, exact 208/208 footer with zero failures/cancellations/skips/todos, plan 208, a duration, exit zero, no timeout/reap error, and unchanged source/index/control/runtime custody. There is one project launch site and no retry path. The raw directory was absent when this control disposition was issued.

### FIRST evidence

**Original FIRST evidence ACCEPT.** After root's separate exact-byte authorization, the functional worker completed one invocation through the accepted launcher. I independently read all 1,258 original TAP lines, the complete 405-line result, both runtime stdout/stderr pairs, project stderr, and the original launcher command chunks. I independently parsed each original outcome and duration and all complete source/index/inventory maps. This is inspection of recorded data; the code reviewer issued no Node or project command.

| Observed original FIRST property | Result |
| --- | --- |
| Selected original files | Nine, in the exact lexical order shown above |
| Original cases | 208: 173 older and 35 additions |
| Pass / failure / cancellation / skip / TODO | 208 / 0 / 0 / 0 / 0 |
| Suites and TAP plan | Zero suites; `1..208` |
| Exact names and ordinals | All 208 matched the independent source-derived inventory |
| TAP duration | 15,821.975168 ms |
| Recorded project elapsed time | 15.929411565994087 seconds |
| Project and launcher exit | Both zero |
| Timeout, sent signal or reap error | None |
| Runtime | Node v24.22.3; Linux x64 |
| Identity-call elapsed times | 0.008570441001211293 and 0.06395462300133659 seconds |
| Project and both identity stderr streams | All three empty |
| Original output inventory | Exactly 39 files, 5,041,458 total bytes |

Original output directory: `/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-focused-raw`. Important original byte identities are:

| Original file | Bytes | SHA-256 |
| --- | ---: | --- |
| `run.tap` | 46,741 | `86183d4b10829868a892bb738171f711b560fa3eaeb79a87cdc10d200b02d1dc` |
| `result.json` | 16,273 | `f6dc907791d3ea2c1c95a7df08e6c5f6ebc2ae69f1910b193427189906c9372a` |
| `running.json` | 10,548 | `5faca9f8e6b64700c232c0af7a7c91ee77dc413a45a751b9fa50584197268602` |
| `node-version.stdout` | 9 | `4409d3bfa08b82f385bd424eeda65fc63b756129f0e89e82df77f1fecafccc14` |
| `node-runtime.stdout` | 782 | `292ce6437aa16270ee5bdc058956ada71eb309cd3bdad80675b1277cee648604` |
| Each of the three empty stderr files | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

All 2,586 records in each original full-source map equal my independently immutable-blob-verified source map. Both complete stage-zero index inventories, all ordinary `H` flags, both raw index snapshots, physical/tracked path lists, 209-test lists, and empty ignored/untracked lists agree. The expected cases, retained controls, approved original control paths/modes, and runtime bytes/modes/locations match their accepted pins. The recorded environment excludes every required forbidden variable and prohibits fixture updates.

After inspecting the originals, I independently reread every functional working source file's bytes/mode and the raw worktree index. They still matched the frozen originals and the worktree remained clean. Source, assertion, fixture and threshold bytes were unchanged. The raw `running.json` snapshot binds the two completed runtime identities and prelaunch source/control state to the final result, and the original launcher record reports the same exact command and successful exit.

My external independent original-evidence proof is 68,546 bytes, SHA-256 `8a2520512816799330dd63076d30467f4a7bb8e7074368d593927bf7403bdd85`. It records all 39 original file identities and all 208 source-bound observed names/outcomes/durations. The compact sorted-key original `{file,bytes,sha256,mode}` identity-list digest is `4f064c8ab7001d13e5532b3ed34bb55a272eab393c6642a381c9e5888692428d`. Retained-copy comparison was subsequently completed in the root-authorized packaging window, as recorded below.

This result qualifies the selected JavaScript contracts and fixture-based UI interactions at the frozen bytes. It does not change the native, physical, rendered-PDF, full-application or audio qualification limits below.

### Retained-copy custody

**CODE RETAINED-COPY ACCEPT.** I inspected the retained package in the functional worktree at `docs/engineering/evidence/system-health-coverage-functional-2026-11-21/`. I read the complete 495-line retention-custody record, 350-line evidence manifest, external full-copy proof and supplemental authorization/proof records. All 47 original/supplemental source-to-copy pairs were independently compared byte for byte. The 39 raw originals remain unchanged, including their filesystem modes; the 39 `focused/` copies retain exactly 5,041,458 original bytes.

The complete package has 49 regular nonexecutable files (0644, Git mode 100644), totaling 5,234,454 bytes. I recomputed the full lexically ordered compact sorted-key `{path,bytes,sha256,mode,lines}` identity map, including both generated manifests: SHA-256 `926240ff713ee9fbbcbb5af922a3b9d2a55fda58e89630d0e74700ac6fecbc93`.

| Retained custody artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `evidence-manifest.json` | 10,526 | `85a701cd151123eeb3fba64eacd217f8634bd3e88ac1624aced7672439c98eab` |
| `retention-custody.json` | 21,667 | `e32ffafc6af563235cc8c28d6b238f22e95e64060a85b381a63173031f9efb01` |
| `original-command-result.json` | 1,540 | `1e506adcda63593eefaa069d4d31759ed0dbbd663692f194af4a436e8b5242c6` |
| `root-preflight-proof.json` | 7,265 | `3d16c0f8d6ee1d2a8bdc1cf1280673ef456e96ff677c811fc57b26d1f6bfe6fd` |
| `root-first-proof.json` | 10,832 | `d73f6894e7cc04001e3e2f4b9c458c75fab95893658bc8ca346b9b70f5216836` |

The evidence manifest explicitly excludes its own bytes and binds the other 48 files; the full 49-file digest above independently binds the manifest as well. The custody record covers the 47 original/supplemental pairs. The retained authorization is explicitly a record of the one authorization already consumed, not a permit to rerun anything.

I separately parsed the retained TAP/result, all complete source maps and all 208 entries in `current-case-results.json`; exact names, source lines, ordinals, observed outcome lines and every original duration match the independently verified originals. Historical timing fields remain distinct from current observations. The retained raw index pin concerns the FIRST before/after snapshots; authorized later report/evidence additions can change the staging index while every original path's blob/mode entry remains invariant.

After packaging I independently checked all 2,586 original functional working paths and stage-zero index entries again. Every original byte and mode remained unchanged; only the 49 authorized evidence paths were added and tracked/index diffs were empty. This code-review worktree remained clean at the frozen commit during the complete source, control, original-output and retained-copy review. The separately authorized final code-audit seal adds only this report, with the frozen commit as its sole parent.

The external independent code-lane retained-copy proof is 11,236 bytes, SHA-256 `0eae5951342d022f9df2e23a56013f5cec599e7f5d542b50e96ea74b4edf713c`. No project execution or rerun occurred in this lane.

## Preserved qualification boundaries

The original full-source audio HOLD remains 2,420 total / 2,418 pass / one failure / one optional skip. Its final relative-gain assertion failed at −101 dB for a played −30 dBFS level; earlier playback-level assertions passed. No cause or repair is established here, and a focused System Health result cannot supersede it.

Qualified main stays fixed at `e36ddc41806b0f6639474f207e3b339e063a6e25`; the durable completed Backup/Service checkpoint remains `34afefa58ac5e8346006087587b113c2a82d5a39`. Fleet stays default-off with fixed head `69fc06eb471dfb00de544bbe233c0f5dc95402e8` and its timing hold. Native backup #85 SDK/owner/cache/startup/exit qualification is unfinished. The pre-existing active/retained-unsaved Pre-gig preset-deletion association and Population Compare #88 remain separate queued work. The preceding Pre-gig round-seventeen 132/132 FIRST and three FINAL reports remain intact.

No native SDK workaround, physical-audio claim, remote target, release, deployment, CI result, permission expansion, threshold weakening, history rewrite or credit-exhaustion claim is made. Any later root publication leaves this frozen source immutable.

## Final report seal

The code lane's sole owned addition is `docs/engineering/SYSTEM_HEALTH_COVERAGE_CODE_AUDIT_2026-11-21.md`. Its ordinary report-only commit has sole parent `2a807525c70712332e84cecbaf29dd876b5e03cd`. The final independent seal check verifies the complete original immutable blob inventory and every original working byte/mode, the exact one-report addition, matching staged/committed report bytes, and a clean worktree. The accompanying final seal metadata identifies the report's exact byte count, line count, SHA-256 and Git blob, together with the final commit/tree/parent.

The 2,586 original paths, 2,317 original distinct blobs, 91,604,989 summed original bytes and original map SHA-256 `11f639792299bf8b5aaf9035e94459138fd2d9ab02ce51f2c2c5f584e51765fa` remain unchanged. The focused FIRST authorization is consumed. There was no project execution, rerun, source edit or test/fixture change in this code-review lane.

## Complete ordered original case inventory

The ordinal is the observed original FIRST registration/outcome order for the nine selected files. Repeated source lines reflect explicit test-generating loops. Every row below independently matched an original `ok` outcome with no directive; the original TAP retains its exact duration.

| # | Source | Exact case name |
| ---: | --- | --- |
| 1 | `tests/pre-gig.test.mjs:26` | timecode: clean deck passes with no fix needed |
| 2 | `tests/pre-gig.test.mjs:32` | timecode SNR: 25 passes, 24.9 amber, 20 amber, 19.9 red (AC-3 action and DVS link) |
| 3 | `tests/pre-gig.test.mjs:43` | timecode balance: 1.5 passes, 1.6 amber, 3 amber, 3.1 red, sign does not matter |
| 4 | `tests/pre-gig.test.mjs:51` | timecode phase error: 10 passes, 10.1 amber, 20 amber, 20.1 red |
| 5 | `tests/pre-gig.test.mjs:59` | timecode dropouts: 0 passes, 1 amber, 2 red |
| 6 | `tests/pre-gig.test.mjs:67` | timecode speed: 1% passes, 1.1% amber (pitch), 5% amber, 5.1% red means wrong format |
| 7 | `tests/pre-gig.test.mjs:77` | timecode: worst metric wins, every issue gets one fix, unverified format warns |
| 8 | `tests/pre-gig.test.mjs:88` | timecode: no signal is red with needle, switch and cable advice; missing evidence is skipped, errors are amber-level error |
| 9 | `tests/pre-gig.test.mjs:101` | timecode: capture problems become actions, not crashes |
| 10 | `tests/pre-gig.test.mjs:121` | signal level: -50 dBFS passes, -50.1 on either channel is red and names the channel |
| 11 | `tests/pre-gig.test.mjs:132` | hum: 40 dB below the carrier is amber, 25 dB is red, above 40 passes; hum below the floor margin is ignored |
| 12 | `tests/pre-gig.test.mjs:142` | hum that could not be measured is amber with a retry, never a silent pass |
| 13 | `tests/pre-gig.test.mjs:151` | audio: missing interface is red with connection and Sound-settings actions; sample-rate mismatch is amber |
| 14 | `tests/pre-gig.test.mjs:166` | midi: present passes, optional missing is amber, required missing is red, no backend is unsupported |
| 15 | `tests/pre-gig.test.mjs:180` | headphones: yes passes, no is red with cue advice, skip or none is skipped |
| 16 | `tests/pre-gig.test.mjs:196` | software: crash within 1 h red, within 24 h amber, older passes; boundaries inclusive |
| 17 | `tests/pre-gig.test.mjs:212` | software: not installed and not running are amber with actions; no backend is unsupported |
| 18 | `tests/pre-gig.test.mjs:222` | system: driver and event findings filtered to the preset gear, warnings amber, errors red, unsupported excluded |
| 19 | `tests/pre-gig.test.mjs:242` | evidence errors become "Check could not run" with a retry for every kind |
| 20 | `tests/pre-gig.test.mjs:253` | every red or amber result carries a fix with a label and plain-English text |
| 21 | `tests/pre-gig.test.mjs:272` | rollUp matrix (AC-2): fail is red, warn or error is amber, skipped required is incomplete, else green |
| 22 | `tests/pre-gig.test.mjs:291` | rollUp: unsupported steps are excluded from the verdict and mark the check partial (AC-5) |
| 23 | `tests/pre-gig.test.mjs:301` | rollUp: top problems sorted red, amber, then skipped required; copy matches the spec wording |
| 24 | `tests/pre-gig.test.mjs:312` | buildPlan orders parallel steps first, then per-deck steps, then the headphone cue |
| 25 | `tests/pre-gig.test.mjs:323` | buildPlan honours skip and only, drops MIDI and software when the preset has none, and stays inside the 120 s budget |
| 26 | `tests/pre-gig.test.mjs:338` | built-in presets validate and reference the owner's real gear profile ids and known formats |
| 27 | `tests/pre-gig.test.mjs:353` | built-in presets load through loadBuiltinPresets and bad ones are reported |
| 28 | `tests/pre-gig.test.mjs:366` | validatePreset: bad deck ids, duplicates, inputs, formats, rates, MIDI and gear references |
| 29 | `tests/pre-gig.test.mjs:391` | presets: newer versions are read-only, import rejects &gt;256 kB and junk, export/duplicate round-trip (AC-8) |
| 30 | `tests/pre-gig.test.mjs:419` | presetFromEquipment builds a valid preset from real profiles; deck B defaults to inputs 3-4 and the format comes from the media library |
| 31 | `tests/pre-gig.test.mjs:436` | formatForMedia resolves timecode media only, from the library, in any container shape |
| 32 | `tests/pre-gig.test.mjs:444` | the built-in rigs on a multi-pair interface put deck A on 1-2 and deck B on 3-4 (Traktor Audio 8 DJ) |
| 33 | `tests/pre-gig.test.mjs:450` | namesMatch is forgiving but refuses tiny fragments |
| 34 | `tests/pre-gig.test.mjs:459` | diffRuns lists which steps changed and whether they improved (AC-6) |
| 35 | `tests/pre-gig.test.mjs:480` | synthetic Traktor MK2 timecode from the generator passes both deck steps |
| 36 | `tests/pre-gig.test.mjs:487` | synthetic: noisy carrier is amber then red as the SNR falls (real analyzeTimecode) |
| 37 | `tests/pre-gig.test.mjs:495` | synthetic: one muted channel is red, naming the channel; silence is a no-signal red |
| 38 | `tests/pre-gig.test.mjs:508` | synthetic: dropouts and a wrong-format record are caught |
| 39 | `tests/pre-gig.test.mjs:517` | synthetic hum: 50 Hz and 60 Hz families are detected and graded against the carrier |
| 40 | `tests/pre-gig.test.mjs:535` | synthetic needle-up hum is measured on the lifted segment |
| 41 | `tests/pre-gig.test.mjs:542` | summarizeTimecode exposes plain numbers and handles failures |
| 42 | `tests/pre-gig.test.mjs:568` | runPregig: an all-ready rig produces a green verdict with every automatic step passing (AC-1) |
| 43 | `tests/pre-gig.test.mjs:583` | runPregig: deck B captures input pair 3-4 and deck A pair 1-2, so a two-deck rig can be green |
| 44 | `tests/pre-gig.test.mjs:593` | runPregig: a pair the interface does not offer is reported as no such input, not a failure |
| 45 | `tests/pre-gig.test.mjs:609` | deckPairFirst maps zero-based deck inputs to the 1-based first channel of a stereo pair |
| 46 | `tests/pre-gig.test.mjs:618` | runPregig: audio interface missing is red, signal steps are skipped (blocked) and nothing is captured (AC-4) |
| 47 | `tests/pre-gig.test.mjs:632` | runPregig: a thrown step is an error row, the verdict is amber and the other steps still run |
| 48 | `tests/pre-gig.test.mjs:642` | runPregig: Esc cancels, finished steps are kept and the rest are skipped (cancelled) (AC-7) |
| 49 | `tests/pre-gig.test.mjs:658` | runPregig: manual time is reported separately and excluded from the duration |
| 50 | `tests/pre-gig.test.mjs:668` | runPregig: orchestration overhead with instant mocked captures stays far below 5 s |
| 51 | `tests/pre-gig.test.mjs:675` | runPregig: CAPTURE_BUSY offers to stop the other capture, retries once and records the choice |
| 52 | `tests/pre-gig.test.mjs:690` | runPregig: one capture feeds both deck steps; only/skip re-run just the chosen steps |
| 53 | `tests/pre-gig.test.mjs:701` | runPregig: needle-up hum asks the user, captures the lifted segment and grades it |
| 54 | `tests/pre-gig.test.mjs:715` | runPregig: no desktop backend leaves required steps skipped and the verdict incomplete (AC-5) |
| 55 | `tests/pre-gig.test.mjs:724` | createNativeDeps drives the Tauri commands with the pre-gig capture holder and captures the deck input pair |
| 56 | `tests/pre-gig.test.mjs:745` | toRunInput maps a run to the pregig_save_run contract, redacting Windows user paths |
| 57 | `tests/pre-gig.test.mjs:762` | createPregigApi (native) sends exactly the contract argument names |
| 58 | `tests/pre-gig.test.mjs:780` | createPregigApi (browser) stores runs and presets locally with the same shapes |
| 59 | `tests/pre-gig.test.mjs:807` | contract examples are real step results shapes (states the database accepts) |
| 60 | `tests/pregig-storage-screen.test.mjs:77` | Pre-gig screen keeps unavailable preset storage visible across tabs and retries without silently choosing a rig |
| 61 | `tests/pregig-storage-screen.test.mjs:92` | Pre-gig screen distinguishes unavailable History from confirmed empty History and recovers on Retry |
| 62 | `tests/pregig-storage-screen.test.mjs:106` | Pre-gig screen retains previously loaded History with a persistent unavailable message after a failed refresh |
| 63 | `tests/pregig-storage-screen.test.mjs:118` | Pre-gig preset Save keeps the same draft and inline error after denied persistence, then confirms one successful retry |
| 64 | `tests/pregig-storage-screen.test.mjs:136` | Pre-gig preset Save coalesces repeated clicks and keeps the dialog open while persistence is pending |
| 65 | `tests/pregig-storage-screen.test.mjs:148` | Pre-gig a failed pending preset save restores draft editing and preserves every entered value for retry |
| 66 | `tests/pregig-storage-screen.test.mjs:168` | Pre-gig keeps an acknowledged preset and truthful success when the subsequent list refresh is unavailable |
| 67 | `tests/pregig-storage-screen.test.mjs:180` | Pre-gig an acknowledged preset save finishes while an optional refresh is still pending |
| 68 | `tests/pregig-storage-screen.test.mjs:191` | Pre-gig actual Retry and shell Save retain the completed result and never claim persistence before it succeeds |
| 69 | `tests/pregig-storage-screen.test.mjs:211` | Pre-gig saving a different preset keeps an unsaved check attached to the rig it actually tested |
| 70 | `tests/pregig-storage-screen.test.mjs:225` | Pre-gig Done preserves an unsaved result until the user confirms discarding it |
| 71 | `tests/pregig-storage-screen.test.mjs:225` | Pre-gig choosing another preset preserves an unsaved result until the user confirms discarding it |
| 72 | `tests/pregig-storage-screen.test.mjs:225` | Pre-gig running everything again preserves an unsaved result until the user confirms discarding it |
| 73 | `tests/pregig-storage-screen.test.mjs:235` | Pre-gig a late failed History request cannot replace a newer successful read |
| 74 | `tests/pregig-storage-screen.test.mjs:245` | Pre-gig disposal retires a pending History presentation and the Save callback |
| 75 | `tests/pregig-storage-screen.test.mjs:254` | Pre-gig import retains the parsed draft after a failed save and retries without picking the file again |
| 76 | `tests/pregig-storage-screen.test.mjs:271` | Pre-gig displays future-version presets read-only without running or rewriting their contents |
| 77 | `tests/pregig-storage-screen.test.mjs:303` | Pre-gig PDF keeps the tested interface after the same saved preset is edited |
| 78 | `tests/pregig-storage-screen.test.mjs:319` | Pre-gig PDF preparation cannot export or announce a result retired before its handoff |
| 79 | `tests/report-pdf.test.mjs:33` | suggestPdfName: pattern, kinds, local timestamp |
| 80 | `tests/report-pdf.test.mjs:41` | deviceSlug: unicode, invalid Windows chars, reserved names, 40-char cap |
| 81 | `tests/report-pdf.test.mjs:54` | cssString: quotes, backslashes and markup cannot break out of the &lt;style&gt; block |
| 82 | `tests/report-pdf.test.mjs:63` | formatStamp is local YYYY-MM-DD HH:mm |
| 83 | `tests/report-pdf.test.mjs:70` | defaultPaper: Letter for US-style regions, A4 elsewhere |
| 84 | `tests/report-pdf.test.mjs:75` | normalizePdfOptions / readPdfSettings |
| 85 | `tests/report-pdf.test.mjs:90` | niceTicks: covers the range with 1/2/2.5/5 x 10^n steps |
| 86 | `tests/report-pdf.test.mjs:108` | finite but unrepresentable chart axes fail closed with a visible PDF warning |
| 87 | `tests/report-pdf.test.mjs:132` | decimate keeps endpoints and caps the count |
| 88 | `tests/report-pdf.test.mjs:141` | renderChartSvg: vector SVG, selectable text, escaped labels, strokes &gt;= 0.75 pt on A4 |
| 89 | `tests/report-pdf.test.mjs:157` | severity icons differ by shape and keep the text label (AC-5) |
| 90 | `tests/report-pdf.test.mjs:167` | extractReportParts: styles from head, body only, scripts dropped |
| 91 | `tests/report-pdf.test.mjs:174` | buildPrintableReport(run): @page header/footer, counter, no script, escaped user strings, SVG charts |
| 92 | `tests/report-pdf.test.mjs:191` | print CSS: theme-independent light palette, rows unsplit, thead repeats (AC-2, AC-4) |
| 93 | `tests/report-pdf.test.mjs:205` | partial: a failing chart becomes a placeholder and a warning |
| 94 | `tests/report-pdf.test.mjs:212` | run: raw measurement table only when asked; row caps |
| 95 | `tests/report-pdf.test.mjs:223` | device: serial redaction option, title and file name |
| 96 | `tests/report-pdf.test.mjs:235` | systemHealth: every finding has icon + severity text + evidence (AC-5) |
| 97 | `tests/report-pdf.test.mjs:258` | registerPrintableKind: later features add kinds without editing report-pdf.js |
| 98 | `tests/report-pdf.test.mjs:303` | exportPdf: WebView2 path when pdf_render succeeds (AC-1), exact contract arguments |
| 99 | `tests/report-pdf.test.mjs:319` | exportPdf: browser mode / non-Windows go straight to the print fallback (AC-6) |
| 100 | `tests/report-pdf.test.mjs:335` | exportPdf: pdf_render "unsupported" falls back and is remembered for the session |
| 101 | `tests/report-pdf.test.mjs:348` | exportPdf: backend errors fall back to the print dialog and report the error |
| 102 | `tests/report-pdf.test.mjs:361` | exportPdf: timeout rejects with a retryable error (AC-7) |
| 103 | `tests/report-pdf.test.mjs:381` | exportPdf: path errors are not retried or printed; cancel is quiet; one export at a time |
| 104 | `tests/report-pdf.test.mjs:400` | normalizePdfError handles strings and objects |
| 105 | `tests/report-pdf.test.mjs:406` | loadPrintCss fetches once and tolerates failure |
| 106 | `tests/report-pdf.test.mjs:418` | report fixture for the Windows PrintToPdf test is up to date |
| 107 | `tests/service-panel-lifecycle.test.mjs:67` | late customer resolve leaves the replacement panel and feedback alone |
| 108 | `tests/service-panel-lifecycle.test.mjs:67` | late customer reject leaves the replacement panel and feedback alone |
| 109 | `tests/service-panel-lifecycle.test.mjs:81` | current customer submission reports failure and can be retried |
| 110 | `tests/service-panel-lifecycle.test.mjs:67` | late job details resolve leaves the replacement panel and feedback alone |
| 111 | `tests/service-panel-lifecycle.test.mjs:67` | late job details reject leaves the replacement panel and feedback alone |
| 112 | `tests/service-panel-lifecycle.test.mjs:81` | current job details submission reports failure and can be retried |
| 113 | `tests/service-panel-lifecycle.test.mjs:92` | a cancelled customer editor cannot reload or toast over the replacement editor |
| 114 | `tests/service-panel-lifecycle.test.mjs:110` | late saved-run link resolve preserves the current panel and feedback |
| 115 | `tests/service-panel-lifecycle.test.mjs:110` | late saved-run link reject preserves the current panel and feedback |
| 116 | `tests/service-panel-lifecycle.test.mjs:123` | current saved-run linking still refreshes and reports the linked phase |
| 117 | `tests/service-panel-lifecycle.test.mjs:131` | late photo unlink resolve does not reload or announce in another panel |
| 118 | `tests/service-panel-lifecycle.test.mjs:131` | late photo unlink reject does not reload or announce in another panel |
| 119 | `tests/service-panel-lifecycle.test.mjs:154` | late photo attach resolve preserves the submitted write and suppresses obsolete feedback |
| 120 | `tests/service-panel-lifecycle.test.mjs:154` | late photo attach reject preserves the submitted write and suppresses obsolete feedback |
| 121 | `tests/service-panel-lifecycle.test.mjs:171` | photo success is not announced when a refresh is superseded by navigation |
| 122 | `tests/service-panel-lifecycle.test.mjs:186` | a submitted photo batch finishes all its attachments after leaving the panel |
| 123 | `tests/service-panel-lifecycle.test.mjs:200` | current photo attachment success retains its visible feedback and releases the button |
| 124 | `tests/service-panel-lifecycle.test.mjs:200` | current photo attachment failure retains its visible feedback and releases the button |
| 125 | `tests/service-panel-lifecycle.test.mjs:211` | HTML export captures the clicked sheet options before asynchronous preparation |
| 126 | `tests/service-panel-lifecycle.test.mjs:225` | late HTML export resolve completes the submitted save without feedback in another panel |
| 127 | `tests/service-panel-lifecycle.test.mjs:225` | late HTML export reject completes the submitted save without feedback in another panel |
| 128 | `tests/service-panel-lifecycle.test.mjs:238` | HTML export preparation abandons a retired panel before opening a save dialog |
| 129 | `tests/service-panel-lifecycle.test.mjs:247` | current HTML export failure retains a working retry and cancellation stays quiet |
| 130 | `tests/service-panel-lifecycle.test.mjs:274` | PDF export captures the clicked sheet options and still reports current success |
| 131 | `tests/service-panel-lifecycle.test.mjs:286` | late PDF export resolve preserves the backend result and current-screen feedback |
| 132 | `tests/service-panel-lifecycle.test.mjs:286` | late PDF export reject preserves the backend result and current-screen feedback |
| 133 | `tests/service-panel-lifecycle.test.mjs:299` | a PDF retry offered on a previous panel cannot start another export after navigation |
| 134 | `tests/service-panel-lifecycle.test.mjs:309` | current PDF failure can retry and callers without ownership callbacks retain feedback |
| 135 | `tests/setup-wizard-model.test.mjs:14` | step list: seven steps on Windows, health dropped elsewhere (AC-7) |
| 136 | `tests/setup-wizard-model.test.mjs:22` | start, next, back and the bounds |
| 137 | `tests/setup-wizard-model.test.mjs:42` | skip semantics: skipping a step records it and advances; the summary cannot be skipped |
| 138 | `tests/setup-wizard-model.test.mjs:61` | answers are merged, sanitized and bounded |
| 139 | `tests/setup-wizard-model.test.mjs:80` | setup summary retains incomplete driver coverage through persistence and clears it for a new attempt |
| 140 | `tests/setup-wizard-model.test.mjs:93` | resume after step N restores step and answers (AC-2) |
| 141 | `tests/setup-wizard-model.test.mjs:108` | re-run keeps prefilled answers, restarts at step 1 and clears the skip marks (AC-8) |
| 142 | `tests/setup-wizard-model.test.mjs:121` | finish completes only an active wizard |
| 143 | `tests/setup-wizard-model.test.mjs:130` | migrateWizardState never throws and resets what it cannot trust |
| 144 | `tests/setup-wizard-model.test.mjs:152` | summarize copes with missing answers and per-env rows |
| 145 | `tests/setup-wizard-model.test.mjs:172` | resume window is 30 days (AC-2) |
| 146 | `tests/setup-wizard-model.test.mjs:184` | startup decision: fresh, upgrade install, resumable, finished, flag off (AC-1, AC-2, AC-10) |
| 147 | `tests/setup-wizard-model.test.mjs:207` | level verdict table (spec §6) |
| 148 | `tests/setup-wizard-model.test.mjs:229` | test tone is capped at -12 dBFS and defaults to -20 (AC-4) |
| 149 | `tests/setup-wizard-model.test.mjs:240` | calibration default (AC-5) and announcements |
| 150 | `tests/support-dialog.test.mjs:5` | bundleFileName is deckchek-diagnostics-YYYYMMDD-HHmm.zip in local time |
| 151 | `tests/support-dialog.test.mjs:9` | buildClientContext picks WebView2 version, locale and settings; omits systemHealth when absent |
| 152 | `tests/support-dialog.test.mjs:17` | sizeText |
| 153 | `tests/system-check.test.mjs:16` | bridge: no backend gives supported:false payloads |
| 154 | `tests/system-check.test.mjs:23` | bridge: wraps the three commands |
| 155 | `tests/system-check.test.mjs:31` | unsupported scans yield a single info finding |
| 156 | `tests/system-check.test.mjs:41` | every required problem code has a meaning and action |
| 157 | `tests/system-check.test.mjs:52` | driver problem code 43 is an error with USB advice; 45 is info |
| 158 | `tests/system-check.test.mjs:61` | every known code produces a finding |
| 159 | `tests/system-check.test.mjs:70` | unsigned driver is a warning |
| 160 | `tests/system-check.test.mjs:77` | ASIO: missing DLL, bad signature, generic and multiple |
| 161 | `tests/system-check.test.mjs:91` | generic Microsoft USB audio driver for vendor hardware is info |
| 162 | `tests/system-check.test.mjs:98` | very old drivers (&gt;3 years) are info |
| 163 | `tests/system-check.test.mjs:106` | healthy drivers produce an ok finding |
| 164 | `tests/system-check.test.mjs:111` | Application Error 1000: exception meanings and module heuristics |
| 165 | `tests/system-check.test.mjs:128` | repeated events are grouped with count and first/last time |
| 166 | `tests/system-check.test.mjs:138` | hang 1002 and WER 1001 |
| 167 | `tests/system-check.test.mjs:151` | audio service failures (SCM 7000..7034) |
| 168 | `tests/system-check.test.mjs:160` | Kernel-PnP, USB hub/xHCI and portcls/usbaudio events |
| 169 | `tests/system-check.test.mjs:171` | no events gives ok with period |
| 170 | `tests/system-check.test.mjs:182` | DJ crash dump/report: "X crashed on &lt;date&gt;" with module and exception |
| 171 | `tests/system-check.test.mjs:192` | DJ log lines: errors, crashes and dropouts |
| 172 | `tests/system-check.test.mjs:213` | installed app with no issues is ok; uninstalled apps omitted |
| 173 | `tests/system-check.test.mjs:224` | findings sorted error &gt; warning &gt; info &gt; ok and summarized |
| 174 | `tests/system-check.test.mjs:239` | scan errors surface as an info finding; report HTML escapes content |
| 175 | `tests/system-health-coverage.test.mjs:15` | System Health native responses must be objects instead of silently becoming unsupported scans |
| 176 | `tests/system-health-coverage.test.mjs:24` | System Health all-clear requires three completed scan areas and preserves benign information |
| 177 | `tests/system-health-coverage.test.mjs:35` | System Health incomplete drivers collection cannot produce an area or system all-clear |
| 178 | `tests/system-health-coverage.test.mjs:35` | System Health incomplete events collection cannot produce an area or system all-clear |
| 179 | `tests/system-health-coverage.test.mjs:35` | System Health incomplete djLogs collection cannot produce an area or system all-clear |
| 180 | `tests/system-health-coverage.test.mjs:46` | System Health retains a real fault and its severity when another area is incomplete |
| 181 | `tests/system-health-coverage.test.mjs:57` | System Health mixed supported and unavailable areas remains incomplete |
| 182 | `tests/system-health-coverage.test.mjs:65` | System Health all unsupported scans remain informational with no checked areas |
| 183 | `tests/system-health-coverage.test.mjs:75` | System Health a rejected command stays failed even when the other two scans are clean |
| 184 | `tests/system-health-coverage.test.mjs:84` | System Health three rejected commands cannot become an empty successful scan |
| 185 | `tests/system-health-coverage.test.mjs:91` | System Health distinguishes missing coverage from a pending replacement scan |
| 186 | `tests/system-health-coverage.test.mjs:100` | System Health incomplete response shape cannot certify collection completion |
| 187 | `tests/system-health-coverage.test.mjs:113` | System Health driver-only setup explicitly declares its narrower scan coverage |
| 188 | `tests/system-health-coverage.test.mjs:123` | System Health serialized findings preserve coverage instead of relying on ok and info counts |
| 189 | `tests/system-health-coverage.test.mjs:132` | System Health HTML and real PDF composition retain the same missing area and recompute stale summaries |
| 190 | `tests/system-health-screen.test.mjs:54` | System Health screen calls all three scans and shows HEALTHY only after complete clean coverage |
| 191 | `tests/system-health-screen.test.mjs:63` | System Health screen retains failed drivers coverage and repairs it through the actual Retry control |
| 192 | `tests/system-health-screen.test.mjs:63` | System Health screen retains failed events coverage and repairs it through the actual Retry control |
| 193 | `tests/system-health-screen.test.mjs:63` | System Health screen retains failed djLogs coverage and repairs it through the actual Retry control |
| 194 | `tests/system-health-screen.test.mjs:78` | System Health screen keeps partial drivers collection visible without an all-clear finding |
| 195 | `tests/system-health-screen.test.mjs:78` | System Health screen keeps partial events collection visible without an all-clear finding |
| 196 | `tests/system-health-screen.test.mjs:78` | System Health screen keeps partial djLogs collection visible without an all-clear finding |
| 197 | `tests/system-health-screen.test.mjs:90` | System Health screen shows mixed unsupported coverage while retaining successful areas |
| 198 | `tests/system-health-screen.test.mjs:99` | System Health screen reports all unsupported scans as unavailable instead of healthy |
| 199 | `tests/system-health-screen.test.mjs:107` | System Health browser preview performs no scan and remains informational |
| 200 | `tests/system-health-screen.test.mjs:113` | System Health screen keeps a real driver problem above incomplete collection coverage |
| 201 | `tests/system-health-screen.test.mjs:123` | System Health pending Retry coalesces clicks and blocks exports and event-period replacement |
| 202 | `tests/system-health-screen.test.mjs:136` | System Health three failed scans retain an exportable incomplete result |
| 203 | `tests/system-health-screen.test.mjs:148` | System Health actual HTML and PDF actions retain the same failed-area coverage |
| 204 | `tests/system-health-screen.test.mjs:162` | System Health disposal retires a pending scan and export callbacks |
| 205 | `tests/system-health-screen.test.mjs:174` | System Health a replacement scan retires pending PDF preparation and keeps exports disabled |
| 206 | `tests/system-health-screen.test.mjs:186` | System Health an invalid native response remains a failed area with an actual Retry action |
| 207 | `tests/system-health-screen.test.mjs:196` | diagnostics actual health collection retains failed coverage in the native context |
| 208 | `tests/system-health-screen.test.mjs:216` | System Health toast PDF Retry retains busy ownership and restores controls for an intervening scan |
