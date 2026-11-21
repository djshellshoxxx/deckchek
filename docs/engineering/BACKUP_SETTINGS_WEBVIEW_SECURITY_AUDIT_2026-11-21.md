# Backup webview prerequisite — round 13 defensive security audit

## Disposition

**STATIC HOLD on the original, unexecuted candidate `d0b8992`.** Three concrete
restore-recovery findings require a separate correction: misleading confirmation
copy, recovery controls that can become unreachable under restored feature
settings, and a retained Devices writer that can overwrite restored preferences
during an interactive partial-restore session. These are source-derived integrity
and recovery findings; no incident, vulnerability reproduction or runtime result
is asserted. Root accepted the handoff and directed this report to close on the
unchanged original freeze before a fresh correction cohort. [S1–S4]

This lane owns only this report. Root owns implementation, consolidation and any
later execution authorization. All three round-13 FINALs must complete before
fresh workers review a separately frozen correction. The webview prerequisite
does not close native scheduled-backup issue #85. [S6]

## Independently verified source identity

| Item | Value |
| --- | --- |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-backup-webview-security` |
| Branch | `review/deckchek-backup-webview-security-20261121` |
| Frozen source HEAD | `d0b8992ce326e88bfe46d6135859744f83223527` |
| Frozen tree | `8b14b4df9b84b2c6595e2d56c3a61f96448ab109` |
| Sole source parent | `a5dc0c9ec6b1a4584eb1c00fc5950f00c936eda5` |
| Tracked paths / distinct blobs | 2,458 / 2,223 |
| Summed tracked bytes | 81,771,329 |
| Top-level tracked and actual `tests/*.test.mjs` | 205; identical path sets |
| Starting and pre-report worktree | Clean; all tracked bytes and modes matched |

Standard-library Python/Git data checks read every immutable source blob and
every working file, verified Git blob SHA-1 and SHA-256 identities and executable
modes, and compared test inventories. All source paths were regular files. The
canonical array of `path`, `mode`, `oid`, `bytes` and `sha256` records in Git tree
order, encoded as JSON with sorted keys and compact separators, has SHA-256
`77ac0fbd7cd5440de56b8280b8626bb4f68b308b0d7b02dc1623b279451ad758`.
The full working-byte/mode check was repeated immediately before writing this
report with the same identity. No separate verifier or evidence file was created.
Identity coverage does not imply semantic review of every repository file.

The semantic review covered the full production diff, all four changed production
files, the full nine-file proposed test selection, original DOM fixtures, related
feature/storage/calibration/navigation consumers, implementation/scope notes and
all three round-12 design reports. Peer findings below were independently checked
against actual source. No project tests, syntax checks, imports, builds,
browser/native programs, scanners, probes, extracted implementations, packaged
verifiers or exploit/vulnerability reproductions ran in this lane.

### Source references at the frozen candidate

| Ref | Source and relevant boundary |
| --- | --- |
| S1 | `app/ui/screens/data.js`: safety capture/confirmation at 249–285; application and outcome controls at 289–323; lifecycle at 398–402; feature-gated definition at 406–409. |
| S2 | `app/ui/state.js`: live settings and background writer at 27–34; profile mutation at 94–115; strict JSON/capture/write/import paths at 165–325. |
| S3 | `app/features.js`: shared binding and overrides at 38–67; feature-specific notifications at 71–95. `app/app.js:60` binds the actual live settings. `app/ui/shell.js:39–85` filters feature screens and routes navigation. |
| S4 | `app/ui/screens/devices.js`: retained preference copy at 58, selection at 63–68, listeners and show lifecycle at 530–562. |
| S5 | `app/backup.js`: `describeRestoreResult`; `app/ui/screens/calibration.js:274–312`; `app/ui/dom.js:71–80`; `app/ui/live.js:42–66`; `app/calibration.js:143–157`. |
| S6 | `BACKUP_SETTINGS_WEBVIEW_REVIEW_SCOPE_2026-11-21.md`, `BACKUP_SETTINGS_WEBVIEW_IMPLEMENTATION_2026-11-21.md` and all three `BACKUP_SETTINGS_*_DESIGN_AUDIT_2026-11-21.md` reports in this directory. |
| S7 | `tests/backup-ui.test.mjs`, `tests/backup-settings-screen.test.mjs`, `tests/calibration-storage-screen.test.mjs` and the six existing regression files named below. |

## Findings requiring root correction

### S13-1 — Confirmation copy overstates the partial-failure guarantee

The confirmation says a failed restore leaves current data untouched and that
DeckChek reloads when restore is done. The new completion path intentionally
allows a committed native database restore followed by failed UI or calibration
application; it retains successful parts and suppresses automatic reload. The
pre-commit explanation therefore does not describe the outcome the user can
receive. The post-commit result text correctly distinguishes database restoration
from local application failure. Scope the confirmation to the actual native and
local stages, and describe conditional reload and partial recovery. Root agreed
with this finding before any first execution. [S1, S2, S5]

### S13-2 — Restored feature settings can hide the only recovery route

A successfully applied UI part immediately changes the feature registry's bound
object. If its backup override is false while calibration application remains
incomplete, Data's feature gate rejects subsequent navigation to that screen.
The partial outcome, retry and explicit reload controls exist only within Data;
hidden completion also suppresses the global toast. Thus the stored partial
outcome can become inaccessible when Data was hidden or the user later leaves.
The database has already committed, and automatic reload is deliberately absent.
The functional lane identified this seam; this lane independently confirmed the
binding, route gate, screen definition and outcome ownership. [S1–S3]

Provide reachable recovery owned by the committed outcome independently of a
restored feature flag. Preserve local-only retry and prevent retired callbacks
from reapplying an older result. The new Data tests directly mount the screen
without the real shell registration and feature binding, so their hide/show case
does not establish that the user can navigate back in the actual application.
Fresh acceptance should include that real integration boundary. [S1, S3, S7]

### S13-3 — A retained Devices preference writer can undo restored assignments

Devices copies `settings.deviceUnits` into `st.units` when its screen is created.
Later unit selection writes that entire retained map through `setSetting`.
The screen's show path refreshes catalog units but never refreshes this preference
copy, and its listeners do not consume restored settings. An applied UI restore
can therefore leave the authoritative object containing restored assignments
while an existing Devices screen retains older ones. A later selection can
reintroduce the old map and discard unrelated restored assignments. The new
indefinitely interactive partial-restore session makes reload insufficient as an
implicit repair. The code lane identified this writer; this lane independently
confirmed its initialization, write path and lifecycle. [S1, S2, S4]

Reconcile dependent writers with the restored authoritative state, or enforce a
reviewed reload-before-further-session-work boundary. The current later-write
test changes `screen` through the central setter; it does not exercise the real
Devices writer's retained map. Acceptance should verify preserved unrelated
restored assignments through that actual consumer. [S4, S7]

## Source-consistent improvements and limits

The new strict capture distinguishes an observed missing/empty calibration key
from missing storage APIs, thrown reads, invalid registries and invalid profiles.
Export rejects a registry with skipped entries instead of silently calling a
filtered snapshot complete. UI JSON capture detaches nested values, rejects
unsupported/non-finite values and accessors, and handles unsafe keys explicitly.
The UTF-8 caps are 256 KiB UI, 1 MiB per profile and 64 MiB calibration map; restored
UI including defaults is checked before writing. These bounds do not establish a
whole-process allocation or IPC bound, or the deferred native envelope cap. [S2]

Explicit writes require an actual `setItem` call. Failed profile reads/writes
produce generic errors before success notification; Calibration controls catch
those outcomes. Successful UI application preserves the shared object's identity,
removes old overrides and completes both local write attempts before observers
run. Applied empty calibration emits a change; absent parts remain untouched;
mixed maps are partial and wholly invalid maps remain untouched. Storage errors
do not add raw payloads, profile keys or OS details to the new messages. [S2, S5]

The two local writes and native database restore are separate commits. Existing
unsafe-key sanitization on restore is preserved; applied status covers eligible
sanitized UI values. Initial UI-load provenance and background setting/feature
persistence health remain deferred. Ordinary local/native JSON is the reviewed
boundary; arbitrary hostile JavaScript objects, modified intrinsics and a
compromised renderer are outside this claim. [S2, S3, S6]

## Execution, preserved gates and handoff

No first functional result exists for this original candidate. The full proposed
selection was read as source: the three new/extended files in S7, plus
`tests/backup.test.mjs`, `tests/features.test.mjs`,
`tests/native-catalog-archive-ui.test.mjs`,
`tests/data-workspace-lifecycle.test.mjs`, `tests/support-isolation-ui.test.mjs`
and `tests/stylus-benchmark-evidence.test.mjs`. This report supplies no execution
authorization or passing-test claim. Retain this unexecuted HOLD and every
earlier first-result failure when preparing the separate correction.

Native/cache/startup/exit code, archive policy, capabilities/CSP, dependencies,
Mobile and audio calculations are unchanged by this candidate. Issue #85 still
requires the native owner/epoch and bounded cache contract, settled handoff,
last-good replacement, lock ordering, startup readiness, restore retirement,
retained generic health and a real pre-destruction exit barrier within one total
five-second budget. A receiver timeout does not cancel file I/O. [S6]

Qualified main stays `e36ddc41806b0f6639474f207e3b339e063a6e25`; the fixed published
Player checkpoint stays `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`. Fleet remains
default off and its fixed diagnostic is not rerun. The separate full-source
audio HOLD remains 2,420 total / 2,418 passes / one failure / one optional skip,
including the retained −101 dB at −30 dBFS observation. This static review neither
reproduces nor clears that result and qualifies no native/browser/platform or
physical behavior. [S3, S6]
