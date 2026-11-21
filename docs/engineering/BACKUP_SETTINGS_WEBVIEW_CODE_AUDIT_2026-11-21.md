# Backup webview prerequisite — round 13 code audit

Date: 2026-11-21. Lane: fresh code acceptance review.

## Disposition

**FINAL: HOLD the frozen candidate for correction before a first functional gate.**
The strict capture, write-result and in-place restore changes address the intended
webview prerequisites, but the new indefinite partial-restore session is not
integrated with actual shell and cached settings consumers. Recovery can become
inaccessible when the restored backup feature is disabled, and an already mounted
Devices screen can subsequently replace restored preferences with its old copy.
The confirmation also promises stronger failure/reload behavior than implemented.
These are source-derived findings; no application behavior was executed. [S1–S5]

Native issue #85 remains deliberately open. Its deferred cache, startup and exit
protocol is **not** a blocker for this webview prerequisite review. No full-source,
native, browser, physical-audio, release or publication acceptance is implied.

## Frozen identity and method

| Item | Independently verified value |
| --- | --- |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-backup-webview-code` |
| Branch | `review/deckchek-backup-webview-code-20261121` |
| Source HEAD | `d0b8992ce326e88bfe46d6135859744f83223527` |
| Complete source tree | `8b14b4df9b84b2c6595e2d56c3a61f96448ab109` |
| Sole source parent | `a5dc0c9ec6b1a4584eb1c00fc5950f00c936eda5` |
| Tracked paths / distinct blobs | 2,458 / 2,223 |
| Summed tracked working bytes | 81,771,329 |
| Top-level test inventory | 205 tracked and 205 present; identical path sets |
| Initial state | Clean; all tracked bytes, executable modes and Git identities match |
| Lane-owned path | This report only |

An independent standard-library Python/Git data check read every tracked working
file and immutable blob, recomputed each Git blob identity and SHA-256, and checked
modes. The canonical `path, mode, oid, bytes, sha256` array, in Git tree order with
sorted JSON keys and compact separators, has SHA-256
`77ac0fbd7cd5440de56b8280b8626bb4f68b308b0d7b02dc1623b279451ad758`.
The array was retained in memory only. Byte coverage is not semantic review of
every repository file.

I read the review scope, implementation note and all three completed round-12
design audits; all four changed production files and three changed/new tests in
full; all nine selected test files; their original DOM fixtures; and the relevant
state, profile, feature, shell and Devices callers. The candidate changes four
production files, three tests and seven documentation/evidence paths. No native,
Mobile, dependency, permission, audio-algorithm, tool or CI path changed.
Only source reads and independent byte/Git data checks ran. No project tests,
syntax checks, imports, builds, browser/native programs, probes, scanners,
extracted implementations, packaged verifiers or reproductions ran. No subagents
were spawned and no source/test/default was edited by this lane.

## Reviewed source references

Positions below refer to the frozen source, not a future correction.

| Ref | Source and relevant positions |
| --- | --- |
| S1 | `app/ui/state.js:27–34,85–115,135–162,164–325`: live settings, actual profile writers, strict support consumer, bounded capture and per-part restore |
| S2 | `app/ui/screens/data.js:48–75,198–320,397–409`: busy ownership, safety capture, confirmation, partial outcome/retry, visibility and backup-gated registration |
| S3 | `app/features.js:37–95`; `app/app.js:60`; `app/ui/shell.js:36–87,273–289`: shared binding, separate feature notifications, rail and navigation gates |
| S4 | `app/ui/screens/devices.js:58–68,203–214,529–562`: cached unit preferences, actual unit-selection writer and lifecycle |
| S5 | `app/backup.js:108–121,187–210`; `app/ui/screens/calibration.js:275–318`; `app/ui/live.js:43–68`: outcome copy, unchanged native bridge, save/delete feedback and persistent error toasts |
| S6 | `app/calibration.js:104–152`; `app/ui/dom.js:71–80`: generated profile representation, existing profile validator and forgiving background storage helpers |
| S7 | `tests/backup-ui.test.mjs`; `tests/backup-settings-screen.test.mjs`; `tests/calibration-storage-screen.test.mjs`; existing selected tests and `tests/fixtures/{native-catalog-archive-dom,service-screen-dom}.mjs` |

## Concrete findings

### C13-1 — Partial-restore recovery is owned by a feature-gated screen

**Priority: P2; blocks this candidate.** A successful UI application immediately
changes the object bound to `features.isEnabled`. If the restored values disable
`backup` and calibration application is unavailable or invalid, Data deliberately
does not auto-reload. Its retry/reload controls and retained outcome are confined
to that Data instance. `data.screenDefs` gates the screen with `feature:'backup'`,
and `shell.go` rejects it once the restored value is false. A restore committed
while Data is hidden emits no toast, and the user cannot return through the
normal shell navigation to review the partial outcome. [S1–S3]

The code also emits only state `settings`/`calibration` events after replacement;
the rail's listener is exclusively `onFeatureChange`. It can therefore display
old feature entries even though their navigation gate reads the new values.
Simply adding that notification would immediately hide a now-disabled active
Data screen, so it is not a complete recovery fix. The partial outcome needs an
application-level reachable owner or an equivalent explicit interaction boundary
that survives feature and visibility changes. The functional lane independently
identified the inaccessible-recovery case; this lane verified its actual source.
The current Data fixture binds neither the feature registry nor actual shell. [S3,S7]

### C13-2 — A cached Devices writer can overwrite restored preferences

**Priority: P2; blocks this candidate.** Devices initializes `st.units` from
`settings.deviceUnits` once. Its selector mutates that copy and writes the entire
copy through `setSetting('deviceUnits', st.units)`. It has no settings subscription
to refresh that cache, and `onShow` does not refresh it. After UI application
succeeds but calibration application fails, the new no-auto-reload path permits
navigation to an already mounted Devices screen. Selecting one unit can replace
the other restored unit preferences with pre-restore values. In-place identity
preservation of the root `settings` object does not update this distinct cached
object. [S1,S2,S4]

The new regression follows restore with `setSetting('screen')`, which correctly
preserves current root state but does not exercise this actual nested writer.
Synchronize the relevant cached consumer or prevent unrelated application writes
until the required reload; verify that a later one-unit selection cannot restore
old values for unrelated devices. This finding is separate from the deferred
native synchronization owner and establishes no observed user data loss. [S7]

### C13-3 — Confirmation promises do not match partial local application

**Priority: P2; blocks this candidate.** `restore-safety` still says any failed
restore leaves current data untouched and that DeckChek reloads when done.
`finishRestore` now intentionally allows a committed database plus unsuccessful
local parts and requires explicit reload for that outcome. Narrow the promise to
the database replacement stage and explain that local application failures are
reported after database success. The security lane supplied this finding and this
lane independently checked the unchanged confirmation and new outcome flow. [S2,S5]

## Source-consistent parts of the prerequisite

The snapshot helper detaches nested plain JSON, rejects unsupported/non-finite
values, accessors, sparse arrays and excessive depth, and budgets encoded UTF-8
including delimiters/keys before returning a snapshot. It does not invoke
`toJSON`. UI and profile limits remain 256 KiB and 1 MiB; the registry limit is
64 MiB. Effective restored UI is capped again after defaults are included.
This is not a transport/allocation guarantee for arbitrary hostile JavaScript. [S1]

Calibration capture distinguishes an observed absent key or valid empty object
from absent providers, thrown reads, malformed registries and rejected entries.
Accepted original profile strings are retained. Save/delete stage a strict map,
require a successful storage API write and then notify. Missing deletion has no
write/event. The real controls catch failure without raw storage details. Existing
invalid-verdict profiles with valid structure remain eligible for storage. [S1,S5,S6]

Restore changes the bound root object only after a successful UI write, applies
defaults, removes prior root overrides and detaches restored nested values.
Both local attempts precede state notifications. Empty calibration application
notifies; wholly invalid maps preserve the existing registry; mixed maps report
partial application. Absent parts remain unchanged. Failure of one key does not
undo the other key or claim rollback of the committed native database. [S1,S5]

The retained retry re-applies the native result's local parts without dispatching
another database restore. Outcome identity and visibility generation reject old
controls after replacement or hide/show. Data and native-catalog controls retain
their busy owner. Those local ownership protections do not resolve C13-1/2's
application-wide interaction gap. Manual/safety capture fails before native
dispatch when required source capture is unavailable. [S2]

## Coverage and acceptance handoff

The 21 added named cases (11 state, eight Data, two Calibration) use original
modules and the existing DOM/dialog seams. They cover deep detachment, unavailable
storage, exact UTF-8 boundaries, defaults/root binding, per-part writes, empty and
mixed calibration, committed hidden restore and stale retry controls. The six
additional selected regressions cover bridge compatibility, features, native
catalog ownership, browser workspace lifecycle, strict support calibration and
the actual invalid-verdict profile writer. These are **authored assertions, not
executed results**. DOM fixtures cannot qualify genuine WebView or native behavior.

Before execution, root must provide a separate frozen correction addressing the
three findings and meaningful actual-shell/cached-writer coverage. Review that
source and any revised selection/recorder/runtime before a separately authorized
first command. Preserve this unexecuted candidate and every original failure;
this report grants no execution, rerun, widened selection or publication authority.

All three current FINAL reports must precede a successor cohort. Keep native
issue #85, the full-source audio HOLD (2,420 total / 2,418 pass / one failure / one
optional skip, including the retained −101 dB observation), Fleet default-off and
the fixed Fleet diagnostic unchanged. Qualified main `e36ddc4` and Player
checkpoint `f262a715` remain fixed. This report owns no correction or release.
