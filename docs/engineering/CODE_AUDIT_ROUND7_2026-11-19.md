# Code audit round 7 — Data workspace import ownership

Date: 19 November 2026 (America/Los_Angeles).

Reviewed base: `5c8d4ff4c96dc0d0418e6a3c7f0a27f504772f42`.

Base tree: `fd2a8c9c2254d1e5ad88df9ef3f97f05d7b6ae09`.

This fresh review follows [round 6](CODE_AUDIT_ROUND6_2026-11-19.md), which
accepted the staged browser workspace commit and identified an unqualified UI
ownership candidate. This worker inspected and exercised the actual Data
handlers; it did not change the accepted persistence implementation.

## Confirmed behavior

The browser workspace path used a no-op busy release, unlike the existing native
workspace path. Two import clicks could create two file choosers. Another import
chooser could also open after the first workspace was durably committed but
while its best-effort catalog mirror was still pending.

Success and error feedback checked current visibility without checking the
visibility generation captured by the import. A mirror completion or file-read
error from an earlier visit could therefore publish into the reopened Data
screen. The browser's generic file chooser was not owned by the screen, so it
remained connected after hiding or disposal.

The initial actual-handler reproduction recorded **2 passes and 7 failures**
across nine cases. Normal success and a retired successful read were passing
controls. Failures separately demonstrated duplicate choosers, overlapping
import entry, stale success/error feedback, and unretired hidden/disposed
choosers.

## Correction

Production changes are confined to `app/ui/screens/data.js`:

- Browser workspace imports acquire the existing Data busy owner, including the
  chooser, byte read, accepted commit and remaining catalog mirror. A repeated
  handler cannot open a competing workspace import.
- Browser and native workspace import use the same existing owned chooser.
  Cancel releases its owner; hiding or disposal removes an undispatched chooser.
  Late events from that retired input cannot start a commit.
- The browser workspace controls show their disabled state while the operation
  owns the lease. A stale export handler also respects the owner.
- Final workspace-import success/error feedback checks the captured visibility
  generation. Reopening Data does not revive the retired operation's right to
  update status, toast or immediate announcement calls. The existing native
  workspace final feedback now uses the same generation boundary.
- Browser busy updates change the existing buttons in place. Releasing an old
  operation does not rebuild the reopened browser cards or replace their
  controls. Native busy rendering and native catalog coordination are retained.

A submitted import still completes. Successful workspace replacement, remaining
best-effort catalog mirroring, storage errors, retained run counts and History
notifications keep the [accepted persistence contract](../specs/08-backup-restore.md#12-browser-venue-history-archive-2026-11-18)
from round 5. The change makes no rollback claim for a commit already made.

The archive panels remain distinct. This is workspace-import ownership within a
Data screen; it is not a cross-tab storage lock or a new global lock for every
browser archive operation. No file limits, format versions, retention policy,
feature flags, native database transactions or measurement thresholds change.

## Verification

Node: **22.23.4**. Commands used serial test execution.

| Scope | Result |
| --- | --- |
| New actual-handler reproduction before production edits | 2 passed / 7 failed / 0 skipped; 372.250862 ms |
| Initial corrected related scope | 71 passed / 0 failed / 0 skipped; 1,805.461646 ms |
| Final scope after preserving current browser-control identity | 71 passed / 0 failed / 0 skipped; 1,554.114968 ms |
| Whitespace validation | Passed |

The final command covered:

```text
node --test --test-concurrency=1
  tests/data-workspace-lifecycle.test.mjs
  tests/native-catalog-archive-ui.test.mjs
  tests/workspace-persistence.test.mjs
  tests/workspace-import-ordering.test.mjs
  tests/workspace-file-boundary.test.mjs
  tests/backup-ui.test.mjs
```

Nine new cases exercise production Data callbacks with normal file snapshots and
deferred reads/catalog writes. They verify normal committed counts, one chooser
and one import owner, completed persistence despite navigation, rejection of
retired read results, current live-region preservation, retired chooser cleanup
and stable reopened control identity. Existing native chooser, modal and busy
ownership tests remain unchanged.

Scratch logs:

- `/tmp/deckchek-data-round7-red.log`
- `/tmp/deckchek-data-round7-green.log`
- `/tmp/deckchek-data-round7-final.log`

These scopes overlap; their totals are not additive. DOM and native API doubles
exercise handlers and command ordering, not real browser file dialogs or native
platform execution. No browser launch, full repository suite, native build,
hardware run, remote write or release was performed by this worker.

## Independent review and successor handoff

The correction preserves the existing FS-08 split: browser workspace replacement
versus native add/skip import and separate catalog/history formats. It reuses the
existing ownership mechanism instead of adding a second persistence pathway.
Call-site review found no additional required change in this bounded scope.

Root should integrate this commit and qualify it with the current candidate.
The shared announcement helper's delayed delivery is separately owned by the
next bug worker; this report qualifies suppression before `announce()` is called,
not that helper's later timer. A fresh reviewer should inspect the combined
Data/announcement behavior and hosted browser result without reclassifying this
focused Node run as a platform pass.
