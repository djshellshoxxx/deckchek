# Backup webview prerequisite — round 13 functional static HOLD

## Disposition and execution boundary

**HOLD on the original, unexecuted `d0b8992` candidate.** Static review found
two blocking restore-presentation/session problems. The strict capture and
write-result changes have useful authored coverage, but this candidate should
not proceed to its first functional gate before the findings below are addressed.
These are source-derived findings, not reproduced runtime incidents.

Review execution was limited to Git inspection and independent Python
standard-library byte/JSON/TAP checks, apart from writing and committing this
report. This lane ran no Node command, syntax check, import, test, build,
browser, native application, scanner, probe, extracted implementation or alternate
harness. No first gate was authorized or attempted. The prior round-eleven
recorder was read as source only; no new recorder/configuration was created.
Root subsequently instructed this lane to preserve the original static HOLD
and finalize only this report before a fresh correction cohort.

The review followed
[the round 13 scope](BACKUP_SETTINGS_WEBVIEW_REVIEW_SCOPE_2026-11-21.md),
[the implementation note](BACKUP_SETTINGS_WEBVIEW_IMPLEMENTATION_2026-11-21.md),
and all three completed round-twelve code, functional and security design
reports. Native issue #85 remains open; this report does not assess a completed
native synchronization or shutdown implementation.

## Independently verified source custody

| Item | Exact reviewed value |
| --- | --- |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-backup-webview-functional` |
| Branch | `review/deckchek-backup-webview-functional-20261121` |
| Frozen commit | `d0b8992ce326e88bfe46d6135859744f83223527` |
| Frozen tree | `8b14b4df9b84b2c6595e2d56c3a61f96448ab109` |
| Sole parent | `a5dc0c9ec6b1a4584eb1c00fc5950f00c936eda5` |
| Tracked paths | 2,458 |
| Distinct immutable blobs | 2,223 |
| Summed tracked file bytes | 81,771,329 |
| Actual and tracked top-level test files | 205, identical inventories |
| State before this report | Clean, including untracked-file inventory |

Every distinct immutable Git blob was read and its Git object ID independently
recomputed. Every tracked working file was compared byte-for-byte with its blob,
with its executable mode checked against the tree. The complete ordered entry
array has SHA-256
`77ac0fbd7cd5440de56b8280b8626bb4f68b308b0d7b02dc1623b279451ad758`.
Its records are `{path, mode, oid, bytes, sha256}` in recursive `git ls-tree`
order, serialized with Python JSON sorted object keys and compact separators.
The entire check was repeated successfully immediately before this report was
written. This is a source-custody check, not an application test.

The review read all four changed production modules in full, all nine proposed
test files in full, the changed documentation/proof, and relevant original
callers and dependencies. Those included both DOM fixtures, feature binding,
the real shell navigation and confirmation dialog, live-region/toast helpers,
profile validation and the unchanged strict-support/stylus consumers. Tests use
original production imports, memory storage, synthetic signals and explicit
bridge/capture seams; those seams do not establish real WebView/native behavior.

## Blocking findings

### F1 — Restore confirmation promises more than the new result contract

**Anchor:** `app/ui/screens/data.js:281–282`; compare
`app/ui/screens/data.js:289–299`, `app/ui/state.js:289–325` and
`app/backup.js:107–121`.

The confirmation still says that a failed restore leaves current data untouched
and that DeckChek reloads when restoration finishes. The new flow deliberately
handles a different outcome: the native database restore has succeeded, one
local-settings part can then fail, the successful other part remains applied,
and automatic reload is withheld. The pre-action text and actual post-action
contract therefore disagree at the exact boundary this change introduces.

Narrow the confirmation to distinguish native database restoration failure from
subsequent local-settings application failure. Describe conditional reload and
the partial-result recovery path truthfully. Preserve the safety-backup meaning
without implying a transaction across the database and two storage keys. The
security lane identified this mismatch; this lane independently checked the
actual confirmation and result handlers.

**Acceptance needed after correction:** assertions against the actual
confirmation and partial-result controls must show that the text no longer
promises an untouched database after a committed native restore, or automatic
reload for an incomplete local application. Existing tests cover partial
outcome messages but do not inspect this retained confirmation copy.

### F2 — Partial restoration leaves recovery dependent on a now-stale session

**Primary anchors:** `app/app.js:60`; `app/ui/state.js:299–324`;
`app/features.js:44–68`; `app/ui/shell.js:39–40,64–84`;
`app/ui/screens/data.js:289–319,400–409`.

A valid restored UI can contain `features.backup = false`. Successful UI
application immediately changes the object bound to the feature registry,
even if calibration application is unavailable or invalid. Data is registered
under that feature, and the real shell rejects navigation to a disabled Data
screen. The incomplete result and its retry/reload buttons exist only inside
Data. If native completion arrives after Data was hidden, the handler publishes
no toast and retains the incomplete result off-screen; returning through the
shell cannot reach it. A visible incomplete result likewise becomes unreachable
after the user leaves Data. Explicit reload is required, but the newly added
reload/retry path can be inaccessible.

This follows directly from the actual feature binding and shell guards. The new
Data test mounts the real screen with an IPC seam, but does not bind features or
register/navigate the real shell. Its hidden-result case at
`tests/backup-settings-screen.test.mjs:119–129` calls the screen's `onShow`
directly and therefore bypasses the feature gate. The separate binding test at
`tests/backup-ui.test.mjs:150–169` correctly checks the live object but does not
exercise the shell/recovery interaction. Code and security reviewers independently
corroborated this finding.

There is a wider functional reason to make the boundary coherent. The new
incomplete flow leaves the rest of the application interactive for an unbounded
period after state replacement. Devices retains its own `st.units` copy when
constructed (`app/ui/screens/devices.js:58`), reads selections from that copy
(`:66`) and writes the entire copy back on a later unit selection (`:68`). An
already-mounted Devices screen can consequently replace newly restored
`deviceUnits` with old values during this partial session. The code lane raised
this example and this lane independently inspected those exact statements.
Feature listeners also differ from state settings events: the restored object
changes immediately while the old rail can remain drawn until another feature
notification. Repairing only the rail would not address stale cached writers.

**Required correction:** establish one reachable, coherent reload-required
outcome boundary after database replacement, independent of Data visibility or
its restored feature flag. Prevent normal stale-session actions from overwriting
the newly applied state until the explicit recovery/reload decision completes,
or provide an equivalent reviewed state-transition design. Preserve the
persisted restored flag and existing feature defaults. Local retry must retain
the original native result and must never repeat the committed database restore.
This recommendation does not prescribe a native lifecycle or cache protocol.

**Acceptance needed after correction:** a faithful feature-bound shell case
must cover hidden completion with backup disabled and a failed local part;
recovery must remain reachable. Cover leaving/returning, stale actions, repeated
retry, and a cached settings consumer or the application boundary that prevents
such writes. Existing visibility-generation and result-identity protections are
useful and should remain.

## Source review of the proposed functional selection

The exact original proposal contains **132 named cases**, derived from complete
source inspection, including loop-generated names. None was executed here.

| Original proposed file | Source-derived cases | Relevant scope |
| --- | ---: | --- |
| `tests/backup.test.mjs` | 12 | Manifest/result descriptions, schedule/retention, workspace mapping, bridge names and optional settings compatibility |
| `tests/backup-ui.test.mjs` | 17 | Capture, sanitization, UTF-8 caps, live identity/defaults, observers, per-part results, save/delete writes |
| `tests/backup-settings-screen.test.mjs` | 8 | Real Data handlers, capture before dispatch, partial application, hidden completion, retry/reload and busy ownership |
| `tests/calibration-storage-screen.test.mjs` | 2 | Real Calibration save/delete, failed writes, subsequent success and existing confirmation seam |
| `tests/features.test.mjs` | 12 | Bound overrides, notification behavior and unchanged default-off Fleet contract |
| `tests/native-catalog-archive-ui.test.mjs` | 36 | Real Data/native-catalog controls, ownership, stale callbacks, workspace/backup/restore coexistence |
| `tests/data-workspace-lifecycle.test.mjs` | 9 | Browser workspace chooser, read/mirror ownership, hide/show and disposal |
| `tests/support-isolation-ui.test.mjs` | 11 | Actual strict calibration consumer, retained invalid source and support workflow seams |
| `tests/stylus-benchmark-evidence.test.mjs` | 25 | Actual `saveProfile`/resolver consumer retaining an invalid-verdict profile, alongside existing synthetic DSP/evidence coverage |
| **Total** | **132** | **Proposal only; no runtime result** |

The candidate adds 21 named cases: eleven in backup-ui, eight Data cases and two
Calibration cases. The older restore round-trip is strengthened. Known-empty
calibration differs from unavailable/corrupt storage; mixed maps are explicitly
partial; UI and calibration writes are independently denied; observer snapshots
occur after both attempts; and a successful empty registry is acknowledged.
The real Calibration failure paths use generic errors and do not publish success
before a successful write. The unchanged stylus fixture's invalid-verdict
profile contains finite JSON and remains a meaningful compatibility consumer.
No additional blocker was found in those inspected local contracts.

The small DOM fixture supplies element identity, listeners, text and asynchronous
dialog close. Calibration deletion explicitly supplies the successful browser
form-close result. It does not test real modal focus, browser layout, keyboard
navigation or native input/output. The new Calibration cases do not start audio.
The native bridge is a recorded in-memory dispatch seam, not native execution.
These limits matter particularly for F2: direct screen lifecycle calls are
insufficient evidence that shell-mediated recovery is reachable.

## Existing timing evidence for a future first gate

The unchanged stylus evidence file is 35,004 bytes, SHA-256
`e2e7f8d22b271fec5790cf619901eb8f59f602eb2e679a8995f2446ff6dbe36c`.
That hash equals its entry in the retained round-ten `tracked-before.json`.
All 25 current literal case names match the original full TAP stream. Their
recorded durations sum, using decimal arithmetic, to **73,533.928589 ms
(73.533928589 seconds)**. This is historical case-duration evidence from the
older full gate, not a new measurement or a guaranteed future wall time.

Evidence resides in
`docs/engineering/evidence/link-consent-functional-2026-11-21/full/`:

| Retained item | Identity |
| --- | --- |
| Original source | `f1e0ca1fdcaf6c8276f5a92e883b84fc001bf425` |
| Original tree | `6e74b72253d94f10b03504ef8e0946d458da8e8f` |
| `run.tap` | 555,767 bytes; SHA-256 `e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953` |
| `result.json` | 11,532 bytes; SHA-256 `9073e3008c0840fd1534a21599d6ea6fc485242a49ab88a69326b633c40a82be` |
| Original full result | 2,420 tests; 2,418 pass; 1 fail; 1 optional skip; exit 1; 370.04819690099976 s |

A future bounded selection must account for this existing consumer's cost;
the much shorter prior Player seven-file gate is not a suitable timing basis.
After correction and fresh static acceptance, root must separately review every
recorder/configuration line, the exact new freeze, source selection/counts,
runtime identity, execution bound and process-group termination. Retain full
pre/post immutable-source/control/runtime/inventory/clean custody and original
streams. This report proposes no executable command, no retry and no wider gate.

## Fresh-cohort handoff and preserved limits

Root should retain all three round-thirteen FINAL reports before starting fresh
workers on the correction. Preserve this unexecuted source and its static HOLD;
later findings or passes must not overwrite it. The next functional lane must
review the new complete source and actual shell/recovery fixtures before an
exact first command can be authorized. No source or test correction belongs to
this reporting commit.

Issue #85's application owner, native readiness/epoch/cache protocol, startup
handoff, restore retirement, native replacement and asynchronous exit barrier
remain unfinished. A webview-focused pass cannot qualify those, physical audio,
real WebView modal behavior, operating-system replacement or shutdown timing.
Initial UI provenance and background settings/feature persistence health remain
explicitly deferred by the candidate scope.

The full-source audio HOLD remains, including the original case-53 final
relative-gain observation of -101 dB at -30 dBFS; its cause and repair are not
established here. Qualified main `e36ddc41806b0f6639474f207e3b339e063a6e25`,
Player checkpoint `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`, fixed Fleet
diagnostic head and default-off Fleet status remain unchanged. No release,
qualification merge, deployment, native/browser workaround or credit-exhaustion
claim follows from this report.

The final sole-report commit/tree/parent, report bytes/SHA-256/Git blob and clean
working-state identities are supplied in this worker's FINAL handoff; they are
not embedded recursively in the report.
