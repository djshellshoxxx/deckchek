# Backup recovery — round 15 defensive security audit

## Disposition and review boundary

**FINAL scoped security ACCEPT.** No concrete security blocker was found in the
cumulative webview settings prerequisite and restore-recovery correction. The
correction addresses the three preserved round-thirteen findings: misleading
confirmation, feature-dependent recovery reachability, and ordinary cached
settings writers during a partial restore. The functional lane's separately
authorized original FIRST passed all 193 selected cases; this lane independently
verified that result and its original/retained data bindings. This accepts the
reviewed source and scoped JavaScript evidence, not complete application
qualification.

This lane performed source review and independent Python standard-library
byte/JSON/TAP/Git checks only. It ran no Node identity command, project test,
import, syntax check, build, browser/native application, scanner, probe,
extracted implementation or vulnerability reproduction. It owns only this
report. Root owns implementation, execution authorization, integration and
publication; the current functional lane alone received the separate bounded
FIRST authorization. No subagents were spawned by this lane.

## Independently verified source custody

| Identity | Verified value |
| --- | --- |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-backup-recovery-security` |
| Branch | `review/deckchek-backup-recovery-security-20261121` |
| Source freeze | `f43b940f142ff54fdaf24c0d1feece4ca6dd957b` |
| Complete tree | `d62283dfcc7d08e90d94d63e29afce77db67f566` |
| Sole ordered parent | `b4e5b65e7c87d68b9c21e1fb552b33ced1fae866` |
| Tracked paths / distinct blobs | 2,499 / 2,253 |
| Summed tracked bytes | 84,670,899 |
| Tracked and actual top-level tests | 205; identical inventories |
| Initial worktree | Clean; no tracked `AGENTS.md` |
| Compact ordered source-map SHA-256 | `f74d42051dd3e2a2260ab9b132bfd2ca9a4016fcf50c2a33e46c7f466254b0ad` |

Every distinct immutable Git blob was read and its SHA-1 object identity
independently recomputed. Every original tracked working path was a regular
file whose bytes and executable mode matched its tree entry. The ordered map
contains `{path, mode, oid, bytes, sha256}` in recursive Git tree order, encoded
with sorted JSON keys and compact separators. Whole-tree byte verification is
distinct from semantic review of the changed source and relevant consumers.

The review read the complete recovery scope and implementation note, original
webview implementation, all three round-thirteen static HOLD reports, and all
three completed round-twelve native-design reports. It read all seven changed
backup production modules, all eleven selected test files, original DOM and
consumer fixtures, and the relevant real shell, Devices, Calibration,
native-catalog, support and stylus callers. The already accepted Service
comparison change is present in this freeze but does not qualify backup.

### Source references

| Ref | Reviewed boundary |
| --- | --- |
| S1 | `app/ui/state.js`: settings/profile writers, strict JSON capture, calibration registry, per-part import and observer order. |
| S2 | `app/restore-session.js`: document-lifetime reload requirement. `app/features.js`: bound settings and normal feature writers. |
| S3 | `app/ui/screens/data.js`: safety capture, confirmation, native result handling, application-owned outcome, local retry, reload and lifecycle. |
| S4 | `app/ui/shell.js`: navigation guard, modal-aware global shortcuts and existing settings consumers. `app/app.js`: live feature binding. |
| S5 | `app/ui/screens/devices.js`: retained unit map, actual selector and lifecycle. `app/ui/workflows/native-catalog-archive.js`: shared Data ownership. |
| S6 | `app/ui/screens/calibration.js`: actual save/delete feedback. `app/calibration.js`: existing structural profile validator. |
| S7 | `app/backup.js`: result descriptions and unchanged bridge contract. `app/ui/dom.js` / `app/ui/live.js`: text/escaping and feedback sinks. |
| S8 | The eleven original test files listed below; `tests/fixtures/{native-catalog-archive-dom,service-screen-dom,stylus-guided,learned-map-profile-identity}.mjs`. |
| S9 | `BACKUP_RECOVERY_REVIEW_SCOPE_2026-11-21.md`, recovery/webview implementation notes, and completed `BACKUP_SETTINGS_{CODE,FUNCTIONAL,SECURITY}_DESIGN_AUDIT_2026-11-21.md` / `BACKUP_SETTINGS_WEBVIEW_{CODE,FUNCTIONAL,SECURITY}_AUDIT_2026-11-21.md`. |
| S10 | Original external recorder/configuration and `deckchek-backup-recovery-round15-focused-raw/`; functional worktree's retained `docs/engineering/evidence/backup-recovery-functional-2026-11-21/{manifest.json,custody-check.json,focused/}`. All identities and verification boundaries are recorded below. |

## Source findings and acceptance reasoning

### Strict snapshots preserve the distinction between absence and failure

The current live UI object is detached synchronously before the caller awaits
a native request. The copier checks plain objects/arrays, dense ordered array
indices, own enumerable data properties, depth and encoded bytes. Unsupported
and non-finite values fail instead of being silently removed by JSON
serialization; accessors and `toJSON` are not invoked by this copier. The UI
limit is 256 KiB, serialized profile limit 1 MiB, and complete calibration map
limit 64 MiB. Restored UI plus defaults is checked against the UI limit before
writing. These are JSON/capture bounds, not a whole-process or IPC allocation
guarantee for hostile JavaScript objects or modified intrinsics. [S1]

Calibration capture checks provider and `getItem` availability explicitly. Only
an observed missing key or a validated empty map is empty. Failed access,
malformed/non-object registries, rejected entries and over-limit data produce
fixed classified errors. Export does not silently call a filtered registry
complete. Accepted profile strings are retained exactly. Profile save/delete
read a strict map, stage the intended mutation, require an actual successful
`setItem`, and only then publish the normal calibration event. Missing deletion
has no write/event. Existing structurally valid profiles with an invalid
measurement verdict remain storable; storage acceptance does not validate a
physical measurement. [S1, S6]

Restore retains the established unsafe-key sanitization for eligible UI values.
An applied UI status covers that sanitized representation, not a promise that
every incoming property was accepted. It preserves the bound root object's
identity, removes obsolete root overrides, installs defaults plus restored
values only after successful persistence, and finishes both local attempts
before observers run. Absent parts retain current values; entirely invalid
calibration maps remain untouched; a mixed map reports partial application;
an intentionally empty applied registry emits a change. The two local writes
and native database commit are not one transaction. [S1]

### A committed restore owns the rest of the current document

Data calls `requireRestoreReload` immediately after receiving committed native
success and before local import or observer notifications. A module-local
WeakSet holds the actual document identity. There is no persisted flag or
production reset/unlock API. A new document naturally starts outside the
boundary. Native failure never enters it. [S2, S3]

`setSetting`, feature set/reset and profile save/delete check the boundary
before mutating state, storage or listeners. Shell navigation checks before
changing the active screen or constructing another one. Data's shared lease
rejects new operations, including native-catalog import/export callers.
The actual Devices selector still owns its original cached map, but its central
writer cannot replace restored preferences while reload is required. An
already running device-list refresh also cannot persist a late fallback through
the ordinary settings setter. The new document rebuilds those normal screen
caches from its loaded state. [S1–S5]

The actual shell already declines normal keyboard shortcuts while a dialog is
open. The outcome uses a modal dialog to block ordinary UI interaction and keeps
the central writer guards as an additional application consistency boundary.
This does not cancel previously dispatched native operations, make all native
commands inaccessible, or defend against arbitrary code in a compromised
renderer. Native/cache epoch retirement and transaction/lifecycle work remain
outside this candidate. [S2–S5, S9]

### Recovery survives hidden/disposed Data and restored feature flags

The committed outcome dialog is appended to the document body and is not part
of the pre-commit `modals` set retired by Data hide/dispose. Successful completion
therefore presents the database/local result even when Data is already hidden
or removed, and even when restored settings disable the backup screen. Escape
cannot dismiss the outcome; an unexpected connected-dialog close reopens it.
The shell's reload guard does not depend on the feature flag or Data visibility.
This removes the prior screen-dependent recovery route. [S2–S4]

Unavailable local writes offer a retry using the original native result. It
calls only the local completion/application path, never another native database
restore. Outcome identity, view identity, connection and reload-request state
retire old controls. Re-rendering or a later retry cannot give an old button
authority over the replacement outcome. Successful local completion schedules
the existing 1.8-second reload and offers immediate reload; partial completion
requires the explicit reload decision. Manual/automatic requests coalesce.
A synchronous unavailable/throwing reload keeps the boundary and displays a
fixed error with retry/reopen guidance. [S3]

Real modal focus, inertness, native reload delivery and platform dialog behavior
remain unqualified here. The DOM fixture models element identity, text, events
and asynchronous close, and the cached-selector regression deliberately invokes
the retained real callback to check the writer guard independently of browser
inertness. Those seams must not be presented as actual WebView qualification.
[S4, S8]

### Confirmation and error messages match the local outcome

The pre-action text distinguishes database replacement from subsequent local
settings application, conditional automatic reload and explicit partial-result
review. Optional parts preserve current local values when absent. Post-action
text reports a restored database separately from an incomplete UI or calibration
part and does not imply rollback. The existing native confirmation, safety
snapshot and capture-running refusal remain in their original bridge flow.
[S3, S7]

New storage/profile/reload failures use fixed generic text without raw settings,
profile keys, parser details or local error paths. Actual Calibration controls
report save/delete success only after the explicit operation succeeds. New
outcome headings, messages, help and errors use `textContent` through `h` or
direct assignment; no new untrusted HTML sink is added. Existing native warnings
are rendered as text. This scoped privacy claim does not certify every older
native error or unrelated support message. No new diagnostic capture, network
transfer, permission, dependency, schema, feature default or native command is
introduced. [S3, S6, S7]

## Reviewed regression selection and FIRST outcome

The eleven original files contain **193 expanded named cases**. The initial
rough estimate of 181 used ten Devices cases; this freeze actually contains
22. This lane reported the correction and the functional lane independently
confirmed it before any execution authorization. The selection did not broaden.

| Original file under `tests/` | Cases | Relevant behavior |
| --- | ---: | --- |
| `backup.test.mjs` | 12 | Manifest/result descriptions, policy and native bridge compatibility |
| `backup-ui.test.mjs` | 17 | Detached strict capture, exact UTF-8 limits, per-part application and writer outcomes |
| `backup-settings-screen.test.mjs` | 13 | Actual Data/shell recovery, stale Devices writer, local retry and reload ownership |
| `calibration-storage-screen.test.mjs` | 2 | Actual Save/Delete failure feedback and later successful writes |
| `features.test.mjs` | 12 | Existing bound state, normal notifications and default-off Fleet |
| `native-catalog-archive-ui.test.mjs` | 36 | Actual shared Data operations, lifecycle ownership and compatible import/export controls |
| `data-workspace-lifecycle.test.mjs` | 9 | Browser workspace chooser, committed mirroring and retired presentation |
| `support-isolation-ui.test.mjs` | 11 | Original strict calibration consumer and retained support evidence |
| `stylus-benchmark-evidence.test.mjs` | 25 | Original invalid-verdict profile writer/resolver plus existing synthetic evidence cases |
| `devices-screen-lifecycle.test.mjs` | 22 | Existing shell/settings consumers and asynchronous cached-view ownership |
| `service-screen-lifecycle.test.mjs` | 34 | Existing shell/settings consumers, view ownership and accepted comparison behavior |
| **Total** | **193** | **All passed in the single authorized FIRST; no failures, cancellations, skips or todos** |

There are 26 added backup cases relative to the pre-webview source: eleven
state, thirteen Data and two Calibration cases, plus the strengthened original
restore round-trip. They use production modules and the real shell/Devices
controls with explicit storage/native seams. They do not execute Rust, real
audio devices, filesystem dialogs or a native application. Existing synthetic
DSP coverage remains distinct from the held full-source audio result. [S8]

This lane independently matched all 25 unchanged stylus case names against
passing records in the original round-ten TAP. Their historical duration sum
is 73,533.928589 ms; source SHA-256 is
`e2e7f8d22b271fec5790cf619901eb8f59f602eb2e679a8995f2446ff6dbe36c`.
The original full TAP is 555,767 bytes, SHA-256
`e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`.
This historic subset timing is not a new run, future wall-time guarantee, or
replacement for that full gate's failure. [S8, S9]

The source-derived list also matches 165 passing original cases with a total
of 75,049.493822 ms in that TAP. The two additional Service cases match the
original round-fourteen TAP (27,935 bytes, SHA-256
`4e745c2947a5d9a72f3913cd7ed02c7db3bfd07f7119d9a3f5c60b4b44b6ba97`)
and total 73.461991 ms. The remaining 26 names are exactly the new backup
cases. Each match and decimal sum was independently recomputed as retained
data, without JavaScript execution. [S10]

## Controls reviewed before execution

The complete 392-line recorder and 373-line selection were independently read
before authorization. No concrete control discrepancy was found. Exact control
identities are:

| External control | Bytes | SHA-256 |
| --- | ---: | --- |
| `deckchek-backup-recovery-round15-focused-recorder.py` | 23,602 | `696c38012b4960bbbf007759ccc752098494eea1aab82c384576bc7784e38e03` |
| `deckchek-backup-recovery-round15-focused-selection.json` | 27,855 | `2bcfdba95031ce419316a95ca260cd299a788e6e9ec6f8a39a2fbbbcdff92421` |

Both original controls are under `/workspace/scratch/6f2247f2f463/`. The review
verified all eleven test byte pins and independently derived every ordered case
name from literal source titles with explicit reviewed loop expansion. It also
read the pinned runtime as data: 126,951,512 bytes, SHA-256
`acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa`,
resolved at
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`.
It did not invoke that binary.

The control has one explicit eleven-file serial TAP command, a TERM
point at 115 seconds and KILL at 120 seconds, and two fixed ten-second runtime
identity calls. It creates a new external outcome directory, refuses reuse,
retains original streams and first failures, and checks whole-source working
bytes/modes, immutable objects, inventories, controls and runtime before/after.
The budget follows the retained timing above; it is not a real-time
guarantee. At this review point the functional checkout was clean at the exact
freeze and the raw outcome directory did not exist. This lane's control
acceptance is not execution authorization.

## Independently verified FIRST evidence

Root directly confirmed that it separately authorized exactly the reviewed
recorder/configuration hashes and launcher, from the scratch directory using
`bash` with `login:false`, after all three preliminary source ACCEPTs and root's
own complete control, source and runtime verification. The authorization was
sent before the functional launcher in session 44167. It covered only two
fixed ten-second Node identity calls and one sorted eleven-file serial TAP
command, TERM at 115 seconds/KILL at 120 seconds. Data custody before/after was
outside the project-command budget. No additional project command or rerun was
authorized. The exact command and file order remain in the retained result and
configuration. [S10]

| Original FIRST observation | Independently checked value |
| --- | --- |
| Project start UTC | `2026-11-21T13:21:05.508056+00:00` |
| Project completion UTC | `2026-11-21T13:22:28.332530+00:00` |
| Recorded process elapsed | 82.82376848900094 seconds |
| Recorded TAP duration | 82,737.714963 ms |
| Project exit / timeout / signals | 0 / false / none |
| TAP plan and counts | `1..193`; 193 tests, 193 pass; zero suites, fail, cancelled, skipped or todo |
| Ordered case binding | All 193 complete TAP blocks, titles and consecutive numbers equal the independently source-derived ordered inventory |
| Added backup coverage | All 26 new cases passed |
| Runtime identities | Both fixed calls exited 0 without timeout; original stdout records Node `v24.22.3`, Linux x64 and the pinned absolute executable |
| Project/runtime stderr | All three streams empty |
| Source state | Recorded clean before/after; every original path, mode, object and byte independently agrees with the freeze |

This lane read the complete original TAP as data and checked every full test
block against the configuration and retained ordered outcomes, including the
matching subtest title and duration field. The eight non-test diagnostic lines
are the unchanged synthetic FS-12 observations emitted by the selected stylus
tests; they remain in the original TAP. They are not new physical audio
evidence. The recorder's booleans were not used as substitutes for these
independent comparisons. [S8, S10]

It re-read all 2,253 distinct immutable source blobs and independently recomputed
their Git object identities. Every one of the original 2,499 source paths in
both security and functional worktrees was a regular file with the frozen
executable mode and bytes. The resulting 84,670,899-byte ordered map equals both
original full-source snapshots and the fixed canonical hash. Both tracked hash
maps, both complete inventories, tree entries, all four 205-test inventories,
the eleven source pins, runtime streams, runtime bytes, control copies and
original control files agree. The result/running metadata also agree with the
original stream bytes and the exact authorized command. No source or test
changed to obtain the pass. [S10]

### Original-to-retained custody

The original directory is
`/workspace/scratch/6f2247f2f463/deckchek-backup-recovery-round15-focused-raw`.
The retained package is under the functional worktree at
`docs/engineering/evidence/backup-recovery-functional-2026-11-21/`.
This lane read the entire manifest and custody record, then verified every
original-to-retained path, regular-file type, mode, byte sequence, size,
SHA-256 and Git blob identity. The `focused/` inventory contains exactly all
24 originals, totaling 2,850,501 bytes. The package contains those 24 files plus
the manifest and custody record, without an omitted or additional outcome.

| Artifact | Bytes | SHA-256 | Git blob identity |
| --- | ---: | --- | --- |
| `focused/run.tap` | 46,855 | `3c9dda8710b814ba9f7d9686f868512d6d2f2acadeef534477167043e9d4b9fa` | `1ee13838c32921d61f1f051c45d978cbaec80d99` |
| `focused/result.json` | 11,652 | `89fe06be75db8e0254041010f8f833b7dac3f2b70b81620b003db86547c7160f` | `05860197e225384dfddec0a1e13cd706eaa1bf26` |
| `manifest.json` | 11,383 | `cda804217e24e2461e2247ff6e4e826b28bee422b2f2c1c41c09050cf691503f` | `2708fb03ce9cb51be92ebefba725afe22ab8a4b3` |
| `custody-check.json` | 3,294 | `2d82adb74dcc4a9ac5e968a6398dcf356eb54b09282bb9e184b3734ef0b46d84` | `f9afc44be8b9d63229af8643d9963a4d93dafbd2` |

The manifest's custody-record binding and all 24 artifact bindings match actual
bytes. Custody claims concerning names, outcomes, sources, controls, runtime and
inventories agree with the separate security-lane checks above. The original
failure/timeout-preservation path did not activate; its absence does not create
an authorization to repeat the gate. [S10]

### Immutable functional handoff

The security lane independently bound the original functional FINAL commit
`75e8647fcb76e6ae233801e92bea21fd2a5f4b72`, tree
`3165378b101205dd85ccf76aedd938318d2bb63a`, to its sole parent
`f43b940f142ff54fdaf24c0d1feece4ca6dd957b`. It adds exactly the functional report
and 26 evidence files. Every original frozen tree entry is unchanged, and every
retained artifact's actual Git blob equals the previously checked original
bytes. The checkout was clean.

The complete functional report was then read. One wording error called the
held audio test's -30 dB value a criterion; the original case-53 TAP identifies
it as the played input level of -30 dBFS. Root directed the same worker to
correct that phrase in a new documentation-only follow-up, preserving the
original FINAL. This lane independently verified follow-up commit
`b84aa853dc2ac4f6ceac45dfd85eb90d94812ea9`, tree
`721d3b3b4c4de2f3a12df87428772cf099e40ba2`, with sole parent
`75e8647fcb76e6ae233801e92bea21fd2a5f4b72`. Its sole change is that exact phrase
in the functional report; all 2,525 other tree entries, including source and
every evidence file, remain identical. The corrected checkout was clean.

The corrected functional report is 23,886 bytes, SHA-256
`8ec5be3700fc3f9770cab5fd4b19e104280357bc28a3d00a65ba5d11457147bd`, Git blob
`85c259da9a42e1e7f8345b292ef915408dcf5e62`. This report-only correction changes
neither the original outcome nor the scoped security disposition and required
no project execution. [S9, S10]

## Preserved holds and final handoff

The original `d0b8992` static HOLD and all three original reports remain intact;
this correction does not retroactively qualify that unexecuted candidate.
Native issue #85 still requires its application owner, epoch/cache protocol,
settled startup handoff, restore retirement, retained health and asynchronous
exit barrier. Initial UI provenance and background persistence health also
remain open. A receiver timeout is not cancellation of native file I/O. [S9]

Qualified main stays `e36ddc41806b0f6639474f207e3b339e063a6e25`; the durable
Player checkpoint stays `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`. The original
full-source audio HOLD remains 2,420 total / 2,418 pass / one failure / one
optional skip, including case 53's unexplained measured gain of -101 dB at the
played level of -30 dBFS.
Fleet stays default off and its fixed diagnostic is not rerun. No release,
deployment, CI, publication, permission expansion, threshold weakening or
credit-exhaustion claim follows from this scoped review. [S9]

This lane's sealed handoff changes only this report, with the assigned freeze
as sole parent and a clean worktree. Its final commit/tree/report identities are
supplied separately rather than embedded recursively here. All three current
FINALs must precede a fresh successor cohort.
