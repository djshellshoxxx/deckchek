# Backup settings: webview prerequisite candidate

## Scope and qualification

This candidate addresses webview defects identified by all three completed
round-twelve design audits. It is **authored but unexecuted** at this handoff.
Fresh round-thirteen workers must review the exact committed candidate before
root authorizes a bounded first functional gate.

[Issue #85](https://github.com/djshellshoxxx/deckchek/issues/85) remains open.
The application-lifetime native sync owner, cache protocol, startup barrier and
shutdown coordinator are separate remaining work. Nothing here changes native
cache behavior or makes scheduled/on-exit settings complete.

The code, functional and security design reports finished respectively at
`eb380bd949fe22a8989206f157013bcfa0a9a700`,
`ed4b501779646474096f90e1e97da38ee7518d82`, and
`a137867817e3873a4669406cb413993e0737ce49`. Each has sole parent
`754ccec53400fc0468d368110daaec2115aa69dc` and adds only its assigned report.
Root independently checked every original path's bytes, mode and Git identity,
each exact report, scope, tree, parent and clean worktree. The
[integration proof](evidence/backup-settings-design-integration-2026-11-21/root-source-proof.json)
retains those results. All three reports and the Player publication followup
were merged at `a5dc0c9ec6b1a4584eb1c00fc5950f00c936eda5`, complete tree
`cd84c28bb1ed9df5be13488e92032c0d7f4ef629`, before this candidate was authored.

## Product changes

`exportSettingsBlob` detaches current live UI recursively before a caller can
await a native request. It accepts bounded plain JSON, rejects non-finite or
unsupported values, sparse arrays and accessors, and does not invoke `toJSON`.
Nested device preferences and feature overrides cannot mutate an earlier
snapshot. Live UI remains the session authority; capture does not prove that
background UI autosave succeeded.

Calibration capture uses an explicit provider/read/parse path. Only an observed
missing key or valid empty object becomes an empty registry. Unavailable storage,
thrown reads, invalid profiles/registries and excessive size produce generic
classified errors. No bad profile is silently filtered from a complete export;
original accepted profile strings are retained.

Profile save/delete use strict reads and require an actual successful storage
write before normal calibration-change notification. Rejected reads/writes
preserve the prior map and throw generic errors. The actual Calibration controls
catch failures and show errors; save/delete success follows successful writes.
A missing delete target returns false without a write or notification.

The existing UI/profile caps are enforced as UTF-8 bytes: 256 KiB for UI and
1 MiB per serialized profile. Effective restored UI, including defaults, must
fit before writing. The whole calibration JSON has the existing native optional
entry ceiling of 64 MiB. Native archive and aggregate-cache constants are
unchanged; a later native envelope needs its own combined-size/overhead bound.

`importSettingsBlob` retains `settings`, `profiles` and `skipped`, adding
`settingsStatus`, `calibrationStatus` and `complete`. States distinguish absent,
applied, invalid and unavailable parts; a mixed accepted/rejected calibration
map is partial. Accepted profile count does not indicate write success.

After a successful UI write, the existing exported object is replaced **in
place** with defaults plus restored values, removing old overrides while keeping
the feature registry's binding. Storage and live UI agree. Both write attempts
finish before observers run. A successfully applied empty calibration map emits
a change. Entirely invalid maps stay untouched; mixed maps retain accepted
profiles and report incomplete application.

The two storage writes and the native database restore are not one transaction.
A failed local part does not undo a successful other part or the already-restored
database. Data shows that distinction and auto-reloads only when all supplied
local parts were applied. Incomplete outcomes remain visible with an explicit
reload control. Storage failures offer **Retry local settings**, which explicitly
reapplies the native result's local settings without repeating database restore.
Retry/reload controls are bound to their outcome and visibility generation.
A committed restore received while Data is hidden still applies locally, and
its incomplete outcome is presented when Data returns.

Absent optional parts retain current local values. Deliberate database-only
archive/API compatibility remains. Manual backup or restore safety capture now
fails before native dispatch if required webview capture is unavailable.

## Authored coverage — not executed results

There are 21 added named cases and a stronger existing restore round-trip:

- `tests/backup-ui.test.mjs`: actual exports/imports and feature binding, nested
  mutation, empty/unavailable/corrupt storage, strict JSON, UTF-8 boundaries,
  restore-before-observers, empty/partial maps, independent failed writes and
  successful/failed profile mutation notifications.
- `tests/backup-settings-screen.test.mjs`: actual Data controls, recorded native
  calls, unavailable capture before dispatch, success before reload, independent
  local failures, retry without duplicate DB restore, stale controls, hidden
  completion, partial calibration and database-only completion.
- `tests/calibration-storage-screen.test.mjs`: actual Calibration save/delete
  with denied and subsequently accepted writes using the existing dialog seam.
  These cases do not start capture, audio output or a native program.

The proposed first selection is the above three files plus
`tests/backup.test.mjs`, `tests/features.test.mjs`,
`tests/native-catalog-archive-ui.test.mjs`,
`tests/data-workspace-lifecycle.test.mjs`, `tests/support-isolation-ui.test.mjs`
and `tests/stylus-benchmark-evidence.test.mjs`. The final two retain actual
consumers of strict support calibration and invalid-verdict profile evidence.
This is a proposal, not command authorization. Root has run no project test,
import, syntax check or build. Preserve original first streams, full-source
inventories, runtime/control identities and every outcome for an authorized gate.

## Remaining work and fixed boundaries

The three design reports retain the complete native contract: native-owned
epochs/readiness, one bounded cache writer, a settled capture point distinct
from an intermediate ACK, atomic last-good replacement, OP_LOCK before DB,
explicit startup due triggering, restore retirement, retained generic health,
and asynchronous pre-destruction exit within one five-second total deadline
with late-publication handling. A receiver timeout is not worker cancellation.

Initial UI-load provenance, background setSetting/feature persistence health,
an application-lifetime owner, failure health across restart and native/platform
qualification remain outside this prerequisite. Generic storageSet keeps its
background contract; explicit operations here do not rely on its optional-write
success result. DOM/bridge fixtures do not qualify actual dialogs, filesystem
commits, WebView shutdown or power-loss durability.

No native command, permission, dependency, schema, Mobile file, archive/retention
constant, audio calculation, feature default or published head changes. The
Player checkpoint remains fixed at f262a715 and qualified main at e36ddc4. The
full-source audio HOLD stays 2,420 total / 2,418 pass / one failure / one optional
skip, including the retained −101 dB at −30 dBFS observation. No release,
deployment or qualification merge is implied.
