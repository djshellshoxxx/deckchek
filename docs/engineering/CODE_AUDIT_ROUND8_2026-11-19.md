# Code audit round 8 — independent Data import ownership review

Date: 19 November 2026 (America/Los_Angeles).

Reviewed source: `8217d38d439d758072b9eb7268d8f6d6682b9110`.

Reviewed tree: `4c57ee99ebaf0738695c69520a18b12f38236089`.

**Accepted within the documented scope. No production correction required.**
This fresh review follows [round 7](CODE_AUDIT_ROUND7_2026-11-19.md). It examines
`git diff 5c8d4ff...8217d38 -- app/ui/screens/data.js`, the actual handlers and
related tests. Concurrent job-sheet changes are outside this review.

## Standards

No repository-specific AGENTS, CONTRIBUTING or coding-standards file was found.
The review used nearby module conventions and the code-review smell baseline as
judgment aids, not new mandatory requirements. No documented-standard violation
or actionable smell was identified in this bounded change.

The correction reuses the existing Data busy owner, owned workspace chooser and
visibility generation. `renderBusyState` keeps the native rendering path intact
while changing the existing browser buttons in place. It does not introduce a
second persistence mechanism or a new generic lock abstraction.

## Spec and behavior

The applicable contract is [FS-08](../specs/08-backup-restore.md), particularly
its browser workspace replacement and separate native add/skip behavior, plus
the reproduced ownership requirements in the round-7 report.

| Concern | Independent assessment |
| --- | --- |
| Browser import entry | Busy ownership is acquired before opening the chooser. Repeated handlers cannot begin a second workspace import while selection, reading or catalog mirroring remains pending. |
| Chooser retirement | The existing chooser settles and cleans up once. Hide/dispose retires it; later change/cancel events cannot submit an import or release a newer owner. |
| Pre-commit reads | Both successful reads and failures check the captured visibility generation. A later Data visit cannot revive an older read's authority. |
| Submitted writes | Browser persistence and best-effort catalog mirroring still finish once submitted. The UI lease remains held until that work settles; navigation is not described as rollback. |
| Feedback | Browser and native workspace completion/error paths check the captured generation before status/toast calls. This does not qualify the shared announcement helper's later timer. |
| Current controls | Browser lease updates disable/re-enable existing workspace buttons without rebuilding archive cards or replacing the reopened controls. |
| Native compatibility | The native busy render path and native catalog coordination remain. Native payload mapping, confirmation and command invocation are unchanged. |
| Persistence boundaries | `importParsedWorkspace`, `replaceWorkspace`, History emission, the 250-run limit, evidence retry, file limits and native transactions are unchanged by the reviewed Data correction. |

The workspace owner remains local to this Data screen. This review does not
establish cross-tab locking or a common transaction across separate browser
archive formats.

## Evidence checked and independent verification

The predecessor's retained TAP logs match its report:

- `/tmp/deckchek-data-round7-red.log`: **2 passed / 7 failed / 0 skipped**,
  372.250862 ms.
- `/tmp/deckchek-data-round7-final.log`: **71 passed / 0 failed / 0 skipped**,
  1,554.114968 ms.

Those remain the predecessor's execution results; this worker did not rerun the
71-case scope. Its nine new browser tests cover the reported chooser, busy,
read/mirror retirement and reopened-control behavior. Existing native tests
already covered exactly-once dispatch and retained busy ownership through
hide/show, but did not explicitly assert the newly guarded final status/toast.

This reviewer strengthened those two existing native-handler cases in
`tests/native-catalog-archive-ui.test.mjs` with preservation assertions for the
current Data status and global toast content, after both successful and failed
submitted imports finish in a later visit. No production file changed.

The selected pair passed on **Node 22.23.4: 2 passed, zero failed, zero skipped**,
175.160961 ms. Command:

```text
node --test --test-concurrency=1
  --test-name-pattern='a dispatched workspace import keeps Data ownership through hide/show'
  tests/native-catalog-archive-ui.test.mjs
```

Log: `/tmp/deckchek-data-round8-native-feedback.log`. Whitespace validation passed.
The two cases overlap the predecessor's suite and must not be added to its total
as distinct tests. These are actual frontend handlers with native API/DOM doubles,
not a Tauri runtime or platform pass. No browser launch, native build, full
repository suite, physical hardware test or remote write was performed here.

## Successor handoff

The Data correction and the two strengthened assertions are ready for combined
qualification. Root retains that execution and publication ownership. A fresh
successor should examine the resulting Data/announcement integration and hosted
browser result at the final source. The separately owned announcement timer and
phone asset-list changes were not present in this fixed-source review, so no
acceptance of those changes is implied. No additional confirmed defect remains
in the bounded Data ownership correction.
