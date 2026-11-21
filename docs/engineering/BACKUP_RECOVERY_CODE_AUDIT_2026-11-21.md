# Backup recovery — round 15 code audit

## Disposition

**FINAL scoped CODE ACCEPT.** Static review found no concrete blocker in the
cumulative webview settings prerequisite and reload-required recovery correction
at the frozen source below. Independent inspection of the separately authorized
FIRST evidence verifies 193/193 selected cases passed and all 24 retained
artifacts match their originals. The three earlier recovery findings are
addressed in this candidate. Acceptance covers this webview correction and its
selected regressions; native #85 and whole-application qualification remain open.

The original `d0b8992` candidate and its unexecuted round-13 static HOLD remain
preserved. Root's distinct correction is the subject of this review. The
completed Service 123/123 result is inherited evidence, not backup qualification.
Root retains implementation, command authorization, integration and publication.

## Frozen identity and review method

| Item | Independently verified value |
| --- | --- |
| Source HEAD | `f43b940f142ff54fdaf24c0d1feece4ca6dd957b` |
| Source tree | `d62283dfcc7d08e90d94d63e29afce77db67f566` |
| Sole ordered parent | `b4e5b65e7c87d68b9c21e1fb552b33ced1fae866` |
| Assigned branch | `review/deckchek-backup-recovery-code-20261121` |
| Tracked paths / distinct immutable blobs | 2,499 / 2,253 |
| Summed original file bytes | 84,670,899 |
| Tracked and actual top-level test inventory | 205 identical paths |
| Compact ordered source-map SHA-256 | `f74d42051dd3e2a2260ab9b132bfd2ca9a4016fcf50c2a33e46c7f466254b0ad` |

Independent Python standard-library/Git data checks read every immutable blob,
recomputed its Git object identity, compared every original working file's bytes
and executable mode, and checked the test inventories. The map contains
`path, mode, oid, bytes, sha256` entries in recursive Git tree order, encoded with
sorted JSON keys and compact separators. The starting worktree was clean.
Complete byte coverage does not imply semantic review of every repository file.

The semantic review read the complete seven changed backup production modules,
all eleven selected test files, original DOM and relevant data fixtures, actual
shell/Devices/profile consumers, storage/DOM/live-region helpers and library
ownership paths. It also read the complete recovery scope and implementation
notes, original webview implementation, all three round-13 HOLD reports and all
three round-12 native-design reports. No tracked `AGENTS.md` exists in the freeze.

This code lane invokes no Node, project module, test, syntax check, build,
browser/native program, scanner, probe, copied implementation or vulnerability
reproduction. Its permitted checks are source reads and independent
standard-library byte/JSON/TAP/Git data operations. It owns only this report,
changes no production or test source and spawns no additional worker.

## Standards and implementation structure

No concrete standards or maintainability blocker was found. The small
`restore-session.js` module owns the document-lifetime boundary without depending
on UI state, storage or feature modules, avoiding an import cycle. Its WeakSet
has no persisted flag or in-session reset. Normal operation with no pending
document keeps existing behavior; a real reload naturally creates a new
document and module lifetime. The helper is called from the real Data renderer,
where a document exists; it is not a general non-DOM API.

The Data outcome retains the existing busy ownership and pre-commit modal
mechanism while giving the committed result a distinct reachable dialog.
Outcome identity, current render identity and the reload-request flag make the
callback ownership explicit. Fixed error messages and existing DOM builders
avoid introducing a new presentation framework or dependency.

## Spec and recovery findings

### A committed restore owns the document before observers run

`Data.finishRestore` marks the current document before calling
`importSettingsBlob`. The central setting setter and feature set/reset return
false before mutation while that boundary is active; profile save/delete throw
a fixed reload-required error before registry reads or writes. Shell `go`
returns before selecting or creating a screen, changing visibility, persisting
the route or calling a screen lifecycle handler. Data cannot acquire another
operation lease during the boundary.

This ordering addresses the prior cached Devices writer: its actual unit
selector still holds and mutates an old `st.units` map, but the whole-map central
write cannot overwrite restored `deviceUnits`. Ordinary profile and feature
writers likewise preserve restored bytes. An export remains a read and explicit
local-settings retry remains permitted. This is an application interaction
boundary, not a native transaction, cancellation of already dispatched native
work or isolation from arbitrary code running in the renderer.

The real shell's existing keyboard dispatcher also returns when a dialog is
open. Native browser modality is not implemented by the test fixture, so the
Devices case directly dispatches the retained real callback and checks the
writer guard independently of presumed input blocking.

### Recovery is reachable independently of Data and restored flags

The committed outcome dialog is appended to `document.body` and is not in
Data's pre-commit `modals` set. Hidden or disposed Data can therefore apply a
successful native result and present recovery even when restored settings
disable the backup feature. Hide/dispose retire ordinary chooser and modal
presentation without removing this committed outcome.

Cancel is prevented, and a close event reopens a connected closed outcome.
Navigation stays paused. The dialog contains its own labeled heading, message,
help and reload action; partial application uses an alert. Returning to a
visible Data screen refreshes only the current outcome view and invalidates old
button closures. A detached old retry cannot reapply an earlier result.

An unavailable local write offers Retry local settings. It reuses the committed
native result and performs no second database restore. A complete result retains
the existing 1.8-second reload delay and a manual reload choice. Manual and
automatic attempts coalesce through `reloadRequested`; a thrown or absent reload
operation retains the boundary and exposes fixed retry/reopen-app text. Neither
the old source's inaccessible recovery nor its indefinitely usable stale
settings session is retained in this correction.

### Native failure and confirmation describe the actual stages

The reload boundary starts only after a successful native return. Failed native
restoration leaves the confirmation's existing retry/cancel behavior and the
current session usable. The actual confirmation distinguishes database
replacement from subsequent application of optional local parts. It describes
conditional reload and says absent optional parts retain their current values.

The result text distinguishes Database restored from Restore complete, including
UI/calibration unavailable or invalid parts and skipped profiles. Successful
parts are retained; neither the two storage keys nor the native database are
claimed to roll back as one transaction.

### The original strict settings prerequisite is preserved

The snapshot helper detaches ordinary plain JSON synchronously, rejects
unsupported/non-finite values, accessors, sparse arrays and excessive depth, and
budgets UTF-8 JSON bytes including keys and delimiters. It does not call
`toJSON`. UI is limited to 256 KiB, each profile string to 1 MiB and the complete
calibration registry to 64 MiB. Effective restored UI is checked again after
fresh-load defaults are included. These are data bounds, not a claim that all
earlier IPC allocations or hostile renderer behavior are bounded.

Whole-registry capture distinguishes observed absence or a valid empty object
from missing providers, thrown reads, malformed data and rejected entries.
Accepted original profile strings survive unchanged; a complete export refuses
to silently omit a bad entry. Save/delete stage the strict map and require an
actual successful storage call before notifying. Missing deletion performs no
write or notification. The real Calibration controls show generic failure
without false save/delete success, and the existing structurally valid
`valid:false` profile remains an eligible stored observation.

Successful UI import replaces the existing bound object in place with defaults
plus restored values, removing old overrides. Both local write attempts finish
before state observers run. Applied empty calibration notifies; absent parts
remain unchanged; wholly invalid registries remain untouched; mixed registries
retain accepted entries while reporting partial application. Initial UI-load
provenance and background persistence health remain expressly deferred native
owner prerequisites, not new guarantees of this patch.

## Selected regression source and timing basis

All selected source was read. Independent literal and loop expansion yields
193 named cases; the Devices file contains 22, including its later catalog
ownership cases. This corrects the earlier provisional count of ten without
adding a selected file.

| Original selected file | Expanded cases |
| --- | ---: |
| `tests/backup.test.mjs` | 12 |
| `tests/backup-ui.test.mjs` | 17 |
| `tests/backup-settings-screen.test.mjs` | 13 |
| `tests/calibration-storage-screen.test.mjs` | 2 |
| `tests/features.test.mjs` | 12 |
| `tests/native-catalog-archive-ui.test.mjs` | 36 |
| `tests/data-workspace-lifecycle.test.mjs` | 9 |
| `tests/support-isolation-ui.test.mjs` | 11 |
| `tests/stylus-benchmark-evidence.test.mjs` | 25 |
| `tests/devices-screen-lifecycle.test.mjs` | 22 |
| `tests/service-screen-lifecycle.test.mjs` | 34 |
| Total | 193 |

The 26 additions relative to pre-webview source are eleven state cases,
thirteen real Data-screen cases and two real Calibration-control cases. New
Data coverage uses a distinct document lifetime per case without a production
reset hook, actual feature binding and shell navigation, hidden/disposed
completion with backup disabled, current global retry, stale callback rejection,
the actual cached Devices selector, native failure and reload failure/coalescing.

Existing cases cover bridge compatibility, feature defaults, Data/native-catalog
busy ownership, browser workspace lifecycle, strict support calibration,
invalid-verdict profile storage and ordinary Devices/Service navigation. The
fixtures model element identity, events, focus, storage, async dialog close and
recorded native bridge calls. They do not qualify actual WebView modality,
operating-system dialogs, native database/filesystem replacement, physical audio
or shutdown delivery. The unchanged stylus file performs synthetic analysis;
this selection is not a rerun or qualification of the held full audio suite.

Independent source-name and retained-data parsing matched 165 selected passing
cases to the original round-ten full TAP, totaling 75,049.493822 ms. All 25
stylus cases are included and account for 73,533.928589 ms. The current stylus
file is 35,004 bytes, SHA-256
`e2e7f8d22b271fec5790cf619901eb8f59f602eb2e679a8995f2446ff6dbe36c`.
The two additional Service cases match their original round-14 passing TAP and
sum to 73.461991 ms. The other 26 names are exactly the new backup cases.
These original timings support the 115-second TERM / 120-second KILL bound;
they are not a future wall-time guarantee. The original full gate remains
failed and unchanged.

## Independently verified FIRST evidence

After all three preliminary source ACCEPTs, root separately authorized only the
functional lane's exact external recorder, configuration and sole serial
eleven-file project command, with TERM at 115 seconds, KILL at 120 seconds and
two fixed Node identity calls limited to ten seconds each. This code lane read
every recorder and configuration line and independently checked their bytes,
all selected source pins and the runtime file without invoking it. All 193
ordered case names and every per-file list match this lane's separate static
source expansion. The compact UTF-8 ordered-name-list SHA-256 is
`c0298d2bea4772030e4f11ffc0ccd272d19a0b38dd6259a422d61ab5dc338698`.

The sole FIRST outcome has completed. This lane read the complete original TAP
and result and independently parsed the names, consecutive numbers, subtest
labels, plan and counts as data. Every selected case passes: 193 tests, 193
passes, zero failures, cancellations, skips or todo entries, and no suites.
The project exited zero after 82.82376848900094 seconds; TAP reports
82,737.714963 ms. No timeout, termination signal, recorder error or postflight
error occurred, and stderr is empty. This lane issued no project command or
rerun.

| Original control or outcome | Bytes | SHA-256 |
| --- | ---: | --- |
| Reviewed recorder | 23,602 | `696c38012b4960bbbf007759ccc752098494eea1aab82c384576bc7784e38e03` |
| Reviewed selection | 27,855 | `2bcfdba95031ce419316a95ca260cd299a788e6e9ec6f8a39a2fbbbcdff92421` |
| Pinned Node executable | 126,951,512 | `acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa` |
| Original `run.tap` | 46,855 | `3c9dda8710b814ba9f7d9686f868512d6d2f2acadeef534477167043e9d4b9fa` |
| Original `result.json` | 11,652 | `89fe06be75db8e0254041010f8f833b7dac3f2b70b81620b003db86547c7160f` |

The original evidence directory is
`/workspace/scratch/6f2247f2f463/deckchek-backup-recovery-round15-focused-raw`.
All 24 original artifact byte lengths, SHA-256 values and Git blob identities
were computed independently. Both full source maps were compared with a new
2,499-path reconstruction against the frozen Git entries and original working
bytes/modes. Both maps equal the source identity recorded above; tracked hash
maps, immutable entries and all 205-path actual/tracked test inventories agree.
The original runtime outputs match the result metadata, both runtime calls
exited zero within their bound, and the Node binary, controls and eleven
selected source byte identities remain unchanged. The running record and final
record identify the same source, command and controls.

The retained package under
`docs/engineering/evidence/backup-recovery-functional-2026-11-21/` contains
exactly 26 files: all 24 originals under `focused/`, the manifest and the
custody record. The originals total 2,850,501 bytes. Each retained copy was
independently compared with its original bytes and mode; every manifest path,
length, SHA-256 and Git blob binding matches this lane's previously computed
original identity. No extra or missing focused artifact was found. The
custody record's counts, source, command, runtime, controls and result agree
with the underlying data; neither recorder copy was executed by this lane.

The [manifest](evidence/backup-recovery-functional-2026-11-21/manifest.json)
is 11,383 bytes, SHA-256
`cda804217e24e2461e2247ff6e4e826b28bee422b2f2c1c41c09050cf691503f`, Git blob
`2708fb03ce9cb51be92ebefba725afe22ab8a4b3`. The
[custody record](evidence/backup-recovery-functional-2026-11-21/custody-check.json)
is 3,294 bytes, SHA-256
`2d82adb74dcc4a9ac5e968a6398dcf356eb54b09282bb9e184b3734ef0b46d84`, Git blob
`f9afc44be8b9d63229af8643d9963a4d93dafbd2`. These retained files belong to the
functional worker's separate evidence commit; this code commit owns only its
audit report. Root integrates the independently verified deliverables.

## Preserved boundaries and references

Native #85 remains open: application owner, failure provenance, epoch/cache
protocol, owner-confirmed latest-generation capture point, startup handoff and
pre-destruction asynchronous exit are still unfinished. No native command,
schema, permission, dependency, Mobile asset, archive/retention constant, audio
calculation or feature default is changed by this backup correction.

The original full-source audio HOLD remains 2,420 total / 2,418 pass / one failure
/ one optional skip, including the unexplained -101 dB result at -30 dBFS.
Qualified main remains `e36ddc41806b0f6639474f207e3b339e063a6e25`; the durable
Player checkpoint remains `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`. Fleet stays
default off, its diagnostic head is fixed, and this lane authorizes no rerun,
release, deployment, publication, permission expansion or threshold change.

Primary references are the [recovery scope](BACKUP_RECOVERY_REVIEW_SCOPE_2026-11-21.md),
[recovery implementation](BACKUP_RECOVERY_IMPLEMENTATION_2026-11-21.md),
[original webview implementation](BACKUP_SETTINGS_WEBVIEW_IMPLEMENTATION_2026-11-21.md),
all three `BACKUP_SETTINGS_WEBVIEW_*_AUDIT_2026-11-21.md` reports and all three
`BACKUP_SETTINGS_*_DESIGN_AUDIT_2026-11-21.md` reports. Source anchors are
`app/restore-session.js`, `app/features.js` set/reset, `app/ui/state.js`
snapshot/registry/import and writers, `app/ui/screens/data.js` confirmation and
committed-outcome flow, `app/ui/shell.js` navigation/shortcuts,
`app/ui/screens/devices.js` unit selection, and original Calibration controls.
Historical timing uses the unchanged round-ten `full/run.tap` under
`evidence/link-consent-functional-2026-11-21/`.
