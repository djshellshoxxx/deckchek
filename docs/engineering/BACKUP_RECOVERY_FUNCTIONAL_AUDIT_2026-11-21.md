# Backup recovery functional audit — 2026-11-21

## Disposition

**FINAL: ACCEPT for the scoped cumulative webview backup prerequisite and recovery correction.** Static review found no remaining concrete functional blocker in this scope. The separately authorized, single FIRST execution passed **193 of 193 cases**, including all **26 newly authored backup cases**, with exit code 0, no failures, cancellations, skips, todos, timeout, termination signal, recorder error or postflight error. Project execution took **82.82376848900094 seconds**. No project command was rerun.

This accepts the reviewed JavaScript behavior and the exact modeled DOM/native-IPC seams exercised by the selection. It does not complete native issue #85, qualify a real WebView or native filesystem transaction, clear the original full-source audio HOLD, qualify physical audio, change Fleet's default-off status, or move a publication head. The historical round-13 static HOLD reports remain unchanged records of their original candidate.

Primary evidence is the [original FIRST result retained verbatim](evidence/backup-recovery-functional-2026-11-21/focused/result.json), [complete TAP](evidence/backup-recovery-functional-2026-11-21/focused/run.tap), [manifest](evidence/backup-recovery-functional-2026-11-21/manifest.json), and [independent custody verification](evidence/backup-recovery-functional-2026-11-21/custody-check.json).

## Reviewed source and ownership

| Item | Exact identity |
|---|---|
| Functional worktree | `/workspace/scratch/6f2247f2f463/deckchek-backup-recovery-functional` |
| Branch | `review/deckchek-backup-recovery-functional-20261121` |
| Frozen commit | `f43b940f142ff54fdaf24c0d1feece4ca6dd957b` |
| Frozen tree | `d62283dfcc7d08e90d94d63e29afce77db67f566` |
| Frozen sole parent | `b4e5b65e7c87d68b9c21e1fb552b33ced1fae866` |
| Original strict prerequisite | `d0b8992ce326e88bfe46d6135859744f83223527` |
| Recovery correction | `89ae179517a1415e04dab8cd8d848eeb6c83d0de` |
| Canonical complete source-map SHA-256 | `f74d42051dd3e2a2260ab9b132bfd2ca9a4016fcf50c2a33e46c7f466254b0ad` |

The independently reconstructed frozen inventory contains **2,499 tracked regular paths, 2,253 distinct immutable blobs, 84,670,899 summed tracked bytes and 205 top-level test files**. Every distinct Git blob's SHA-1 object identity was recomputed; every tracked working file's bytes and executable mode matched its immutable entry. Actual and tracked top-level test inventories agreed exactly. The working checkout was clean before and after the FIRST command, and before evidence packaging.

The canonical source-map hash uses rows in `git ls-tree -r -z` order with `path`, `mode`, `oid`, `bytes` and `sha256`, serialized with Python `sort_keys=True` and separators `(',', ':')`. The retained, indented before and after map files are byte-identical, each 638,492 bytes with SHA-256 `0454925c1de9884bc5bb627dc99f3c03dca98f76458e93d742046dbaade37638`. The indented file hash and the canonical map hash identify different serializations of the same rows.

This lane owns only this report and `docs/engineering/evidence/backup-recovery-functional-2026-11-21/`. It changed no production module, test, fixture, CI configuration, feature default, publication ref or previous report. Its documentation/evidence commit is to have the frozen commit as its sole parent; the final handoff supplies that commit's identity separately to avoid a self-referential report hash.

Complete source custody establishes the identity of all frozen bytes. Semantic review was limited to the cumulative backup/recovery change, its selected consumers and the review contract below.

## Static review completed before execution

The review read the complete [round-15 scope](BACKUP_RECOVERY_REVIEW_SCOPE_2026-11-21.md), [recovery implementation report](BACKUP_RECOVERY_IMPLEMENTATION_2026-11-21.md), and [original webview prerequisite implementation report](BACKUP_SETTINGS_WEBVIEW_IMPLEMENTATION_2026-11-21.md). It also read all three round-13 `BACKUP_SETTINGS_WEBVIEW_*_AUDIT_2026-11-21.md` static HOLD reports and all three completed round-12 `BACKUP_SETTINGS_*_DESIGN_AUDIT_2026-11-21.md` native-design reports. Those earlier dispositions were treated as their original records, not revised by the new candidate.

The complete changed production modules were reviewed: [restore-session](../../app/restore-session.js), [UI state](../../app/ui/state.js), [features](../../app/features.js), [backup helpers](../../app/backup.js), [shell](../../app/ui/shell.js), [Data screen](../../app/ui/screens/data.js), and [Calibration screen](../../app/ui/screens/calibration.js). All eleven selected test files were read completely, including loop-expanded case registration and the complete Service and stylus consumers.

The review also read the shared native-catalog and Service DOM fixtures, the guided-stylus and learned-map profile fixtures, the actual Devices selection/cache/event/lifecycle paths, Devices library state, the calibration deserializer/applicability contract, and the UI DOM/live helpers. The Devices stale-writer finding was traced to the actual selector and bound settings object, rather than inferred solely from a replacement test implementation. Shell navigation and feature binding were inspected in the production module.

All three workers returned preliminary scoped source ACCEPTs before execution. The root then read every line of the proposed recorder and selection, independently verified their complete identities, the complete frozen source, runtime binary bytes, eleven selected file pins, ordered names and historical timing, and separately authorized the exact launcher. The security worker independently reviewed all controls before that authorization. The code worker also confirmed the complete controls and exact case expansion. Until the exact authorization, this functional lane performed only Git/source reads and independent Python standard-library data work; it invoked no Node identity command or project code.

## Functional findings and evidence

### Strict snapshots retain meaningful state and fail before native dispatch

The cumulative prerequisite detaches a bounded plain-JSON snapshot synchronously. It rejects values that JSON serialization would silently lose, unsupported values, accessors, sparse arrays, non-finite numbers, cycles, excessive depth and oversized UTF-8 representations. Accessors are not invoked while inspecting descriptors. The reviewed byte limits remain 256 KiB for UI settings, 1 MiB for one profile, and 64 MiB for the calibration map's optional backup entry.

Calibration export distinguishes an observed missing storage entry from unavailable storage, malformed stored text and an invalid profile map. Only the observed absent entry is an intentional empty registry. Unavailable or invalid storage is reported before the Data screen dispatches manual backup or a database restore that needs a safety snapshot. The capture cannot silently substitute an empty calibration map and present that as a complete backup.

Profile Save/Delete use a strict read and complete staged value, require the storage write to succeed, and only then notify observers. A missing profile deletion remains a false result without an event. Save/Delete failures do not overwrite an unreadable registry or display a success message. The actual Calibration screen catches the failure and permits a later successful operation.

Evidence: all 17 `backup-ui.test.mjs` cases, both actual Calibration screen cases, and Data cases 1–2 passed in the retained FIRST. The UTF-8 boundary checks are the authored exact-limit assertions; this audit did not lower limits or replace them with character counts.

### Restore updates live identity only after successful local persistence

Local restoration reports independent UI and calibration statuses: absent, applied, invalid, unavailable or partial. Absent optional entries leave the current value alone. A wholly invalid calibration entry does not erase the current registry. A mixed calibration map explicitly reports partial application while retaining valid profiles. An intentional empty map is applied and emits its notification.

A successful UI storage write precedes replacement of the contents of the existing bound root object. The root object's identity is preserved, obsolete keys are removed, and defaults plus the restored settings become the live state. A failed UI write leaves that live object unchanged. Both local storage attempts finish before the corresponding observers run, so an observer cannot see one write still pending. The implementation does not claim a transaction across the two local-storage keys or between local storage and the already committed native database.

Evidence: the strict restore cases in `backup-ui.test.mjs` passed, including live-object identity, observer ordering, empty/absent/invalid distinctions, partial calibration and each failed storage write. Actual Data success, partial UI failure, partial calibration failure and mixed calibration tests also passed.

### The document becomes reload-required before restore observers run

After a successful native restore, `finishRestore` marks the current document reload-required before attempting local settings restoration or emitting its observers. The marker is held in a WeakSet keyed by the actual document, has no reset operation, and does not persist into a fresh document.

The production central UI writer, feature writer/reset, profile Save/Delete, shell navigation and Data acquisition paths consult the marker. UI and feature mutations return false, profile mutations throw the generic reload-required error, shell navigation remains on the current view, and a new Data operation cannot acquire ownership. This prevents a cached settings consumer from persisting its older object over restored data while reload remains pending.

The regression uses the actual Devices selector with its cached device map. After restoration, dispatching that retained callback cannot overwrite restored device preferences. The same test checks feature writers, feature reset and profile Save/Delete against the stored restored bytes. This is a guard on the reviewed production pathways; it is not a claim that arbitrary hostile JavaScript is isolated or that all previously dispatched native operations are cancelled.

Evidence: Data case 12 passed using the actual Devices selector. The full 22-case Devices lifecycle selection, all 12 feature cases, the shared lifecycle selections and the affected strict state consumers also passed.

### Recovery survives Data retirement and a restored disabled feature

The committed restore result is presented in a document-body dialog owned independently of the Data screen's precommit dialog collection. Hiding or disposing Data can retire its original chooser/confirmation UI without removing the committed restore's recovery UI. A restored `backup: false` flag therefore cannot make the only recovery action unreachable.

The recovery dialog prevents cancellation, reopens after an unexpected close, and directs focus to an action. The reload-required marker blocks navigation and guarded writes for the remainder of that document. The dialog has a manual reload action; a completely applied restore also retains its delayed 1.8-second reload. Partial application stays visible and requires explicit recovery rather than automatically leaving the failure message.

Local Retry uses the retained original native restore result and attempts only its local optional settings again. It does not dispatch another native database restore. Result identity, view identity, connectivity and reload state retire old buttons and callbacks. The retry remains available even when Data has been hidden and its feature restored to disabled.

Evidence: both hidden and disposed partial-restore cases passed with the actual shell. They assert the recovery dialog remains connected outside Data, navigation stays blocked, cancellation is prevented, unexpected close reopens the dialog, and manual double clicks coalesce. The hidden local-retry case and stale-retry callback assertions also passed with a single native restore dispatch.

### Reload and failure feedback remain recoverable

Reload requests share one ownership flag. A manual action consumes a pending automatic attempt, and repeated activation does not reload twice. If the reload function is missing or throws, the result stays visible with a generic message and a later manual action can retry; the reload-required guard remains active.

The actual restore confirmation distinguishes a native/database failure from a committed database restore whose local optional settings are only partly applied. Native failure leaves the original session usable. Database-only restore keeps absent local parts unchanged and retains normal completion behavior. The existing native backup/workspace/archive busy-owner checks remain covered by the selected consumers.

Evidence: Data cases 9–11 and 13 passed, including mixed calibration, database-only restore, original-session usability after native failure, and failed reload recovery with manual/automatic coalescing. All 36 native catalog/archive cases and all nine browser workspace lifecycle cases passed.

## Exact selected cases and timing basis

The eleven filenames were passed in lexical order. Names were independently derived from complete source reads and explicit source-loop expansion without JavaScript evaluation or import. The earlier provisional total of 181 undercounted the existing Devices lifecycle file: it contains **22 expanded cases**, not ten. No file was added to increase the original eleven-file scope.

| Ordered file | Source-derived cases | FIRST passed |
|---|---:|---:|
| `tests/backup-settings-screen.test.mjs` | 13 | 13 |
| `tests/backup-ui.test.mjs` | 17 | 17 |
| `tests/backup.test.mjs` | 12 | 12 |
| `tests/calibration-storage-screen.test.mjs` | 2 | 2 |
| `tests/data-workspace-lifecycle.test.mjs` | 9 | 9 |
| `tests/devices-screen-lifecycle.test.mjs` | 22 | 22 |
| `tests/features.test.mjs` | 12 | 12 |
| `tests/native-catalog-archive-ui.test.mjs` | 36 | 36 |
| `tests/service-screen-lifecycle.test.mjs` | 34 | 34 |
| `tests/stylus-benchmark-evidence.test.mjs` | 25 | 25 |
| `tests/support-isolation-ui.test.mjs` | 11 | 11 |
| **Total** | **193** | **193** |

The [authorized selection](evidence/backup-recovery-functional-2026-11-21/focused/authorized-selection.json) retains every exact ordered name, per-file count and selected source hash. The [ordered outcomes](evidence/backup-recovery-functional-2026-11-21/focused/ordered-outcomes.json) retain each observed number, name and result. The original TAP contains exactly the same 193 subtest labels, numbers 1–193 and names, a single `1..193` plan and all passing outcomes.

The 26 newly authored backup cases are 13 actual Data recovery cases, eleven new strict snapshot/storage cases in `backup-ui.test.mjs`, and two actual Calibration storage cases. All passed. The remaining selection checks current shared consumers, including the two Service comparison cases previously observed in round 14 and the unchanged synthetic stylus evidence consumer.

The bound was derived before execution from retained data. The original round-10 full TAP is 555,767 bytes, SHA-256 `e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`. Its 165 matching passing names total **75,049.493822 ms**. The 25 selected stylus cases account for **73,533.928589 ms** of that sum; the stylus source SHA-256 `e2e7f8d22b271fec5790cf619901eb8f59f602eb2e679a8995f2446ff6dbe36c` matches the historical tracked source map. The two additional Service names total **73.461991 ms** in the retained round-14 TAP, SHA-256 `4e745c2947a5d9a72f3913cd7ed02c7db3bfd07f7119d9a3f5c60b4b44b6ba97`.

A TERM point at 115 seconds allowed about 40 seconds beyond the matching historical case sum for the 26 new backup cases, startup overhead and timing variation; KILL was fixed at 120 seconds. Each of the two fixed Node identity calls had its own ten-second limit. Git/source custody work was outside the project-command budget. Historical case durations were not treated as a future wall-time guarantee or a reason to reclassify the failed original full-source gate.

## Authorized FIRST execution and runtime

The root explicitly authorized this exact launcher only after reviewing the complete unexecuted controls and receiving all preliminary source dispositions. It ran once from `/workspace/scratch/6f2247f2f463` through Bash with `login:false`:

```text
python3 /workspace/scratch/6f2247f2f463/deckchek-backup-recovery-round15-focused-recorder.py /workspace/scratch/6f2247f2f463/deckchek-backup-recovery-round15-focused-selection.json
```

The recorder invoked precisely the two fixed runtime identity calls and this one project argv:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node
--test
--test-concurrency=1
--test-reporter=tap
tests/backup-settings-screen.test.mjs
tests/backup-ui.test.mjs
tests/backup.test.mjs
tests/calibration-storage-screen.test.mjs
tests/data-workspace-lifecycle.test.mjs
tests/devices-screen-lifecycle.test.mjs
tests/features.test.mjs
tests/native-catalog-archive-ui.test.mjs
tests/service-screen-lifecycle.test.mjs
tests/stylus-benchmark-evidence.test.mjs
tests/support-isolation-ui.test.mjs
```

The multiline display lists the exact arguments of one serial command. The identity calls were absolute Node `--version` and the pinned `-p` expression recording `process.versions`, `execPath`, platform, architecture and `execArgv`; their exact arrays and all original streams are retained in `result.json` and `node-*.stdout`/`node-*.stderr`.

| Item | Observed identity or outcome |
|---|---|
| Recorder | 23,602 bytes; 392 lines; SHA-256 `696c38012b4960bbbf007759ccc752098494eea1aab82c384576bc7784e38e03` |
| Selection | 27,855 bytes; 373 lines; SHA-256 `2bcfdba95031ce419316a95ca260cd299a788e6e9ec6f8a39a2fbbbcdff92421` |
| Node | `v24.22.3`, Linux x64, absolute path shown above |
| Node binary | 126,951,512 bytes; SHA-256 `acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa` |
| Recorder runtime | Python `3.12.14`, `/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3` |
| Project start | `2026-11-21T13:21:05.508056+00:00` |
| Project completion | `2026-11-21T13:22:28.332530+00:00` |
| Project elapsed | `82.82376848900094` seconds |
| Exit / timeout / signals | `0` / `false` / none |
| Counts | 193 tests, 193 pass, 0 suites/fail/cancelled/skipped/todo |
| Project stderr | 0 bytes |
| Original TAP | 46,855 bytes; SHA-256 `3c9dda8710b814ba9f7d9686f868512d6d2f2acadeef534477167043e9d4b9fa` |
| Original result | 11,652 bytes; SHA-256 `89fe06be75db8e0254041010f8f833b7dac3f2b70b81620b003db86547c7160f` |

The recorder rejected `NODE_OPTIONS`, every `DECKCHEK_AUDIO_*` variable and `MIXXX_CONTROLLERS_DIR`; none was present. Its sole environment adjustment prepended the pinned Node directory to PATH. There was no alternate engine flag, diagnostic variable, optional external corpus, threshold change, extra project command, collector, syntax/import check, build, full suite, browser/native launch, scanner/probe or rerun. A passing synthetic stylus consumer is not a physical-audio result.

## Evidence custody and peer handoff

The untouched original output directory is `/workspace/scratch/6f2247f2f463/deckchek-backup-recovery-round15-focused-raw`. The original external recorder and selection also remain available at the launcher paths above. All **24 original files, totaling 2,850,501 bytes**, were copied verbatim with equal file modes into the retained `focused/` directory. The 24 files include both control sources, both full source maps, both tracked hash maps and inventories, actual and tracked test inventories, immutable tree entries, the exact selection and names, original runtime streams, running/result metadata, complete TAP/stderr and ordered outcomes.

Independent data-only verification rebuilt the complete immutable source map rather than trusting the recorder's success booleans. It checked immutable Git object IDs, working bytes and modes, the frozen branch/commit/tree/sole parent, exact before/after maps and inventories, control byte identity, runtime binary and identity streams, exact project argv and budget, every TAP subtest/name/number/outcome, the plan and totals, empty stderr and the absence of timeout/error signals. It then verified every retained copy against its original and computed its Git blob ID.

| Retained binding | Bytes | SHA-256 | Git blob ID |
|---|---:|---|---|
| `manifest.json` | 11,383 | `cda804217e24e2461e2247ff6e4e826b28bee422b2f2c1c41c09050cf691503f` | `2708fb03ce9cb51be92ebefba725afe22ab8a4b3` |
| `custody-check.json` | 3,294 | `2d82adb74dcc4a9ac5e968a6398dcf356eb54b09282bb9e184b3734ef0b46d84` | `f9afc44be8b9d63229af8643d9963a4d93dafbd2` |
| `focused/result.json` | 11,652 | `89fe06be75db8e0254041010f8f833b7dac3f2b70b81620b003db86547c7160f` | `05860197e225384dfddec0a1e13cd706eaa1bf26` |
| `focused/run.tap` | 46,855 | `3c9dda8710b814ba9f7d9686f868512d6d2f2acadeef534477167043e9d4b9fa` | `1ee13838c32921d61f1f051c45d978cbaec80d99` |

The manifest binds every original absolute path to its retained path, byte count, SHA-256 and Git blob identity, and separately binds the custody verification. The code and security workers received the original directory, exact execution authorization, original stream/result identities and complete retained manifest/custody identities before this lane's FINAL handoff. Both independently verified the original FIRST data and complete frozen source before the retained package was sent. Their own final reports record their separate package verification and scoped disposition.

## Remaining scope limits and continuation

The DOM harness exercises actual production handlers and lifecycle paths with modeled elements, storage and recorded native bridge responses. It does not establish real browser focus trapping, background inertness, WebView reload behavior, native IPC delivery, native database atomicity, filesystem publication or physical audio behavior. The source guard and tests cover the named state writers and stale callback paths; no broader cancellation or arbitrary-JavaScript isolation claim is made.

Native issue #85 remains open. The reviewed native-design requirements still require implementation and later exact qualification: application-owned cache/epochs, issued revision ownership, one in-flight plus latest pending request, settled capture semantics distinct from acknowledgment, bounded atomic cache replacement with last-good retention, operation locking before database ownership, no held lock while awaiting the renderer, deferred startup handoff, and bounded asynchronous exit/publication fencing. This webview correction does not implement those native owners. Initial UI-load provenance and general background persistence-health reporting remain separate deferred concerns.

The original full-source audio gate remains **2,420 cases / 2,418 pass / one fail / one optional skip, exit 1**. Its case-53 observation of approximately −101 dB at a played input level of −30 dBFS remains a HOLD with no established cause or repair claimed here. The 25 selected synthetic stylus cases passing in this focused gate do not replace that original full-source evidence. Fleet remains default off pending owner qualification.

Qualified main stays `e36ddc41806b0f6639474f207e3b339e063a6e25`; the durable Player branch stays `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`. This lane authorizes no deployment, release, tag, publication, native launch or broader test gate. Root owns integration and the next unfinished feature. No claim is made that the user's credits were exhausted.
