# Scheduled-backup settings completeness: code and correction-design audit

Date: 2026-11-21. Lane: fresh round 12 code audit. Issue: [#85](https://github.com/djshellshoxxx/deckchek/issues/85).

## Decision and evidence boundary

**The settings-completeness finding is established by source review and remains open.** Saving a schedule does not transfer current settings to native code. Automatic jobs use a cache populated as a side effect of an explicit backup, with no version or freshness contract. Several cache failures become deliberately empty settings. The ZIP can satisfy its checksum and optional-entry rules while omitting expected settings or carrying an earlier snapshot. This review does not establish observed data loss, reproduce the issue, or accept an implementation. [S1–S5]

The smallest complete correction requires a settings owner lasting for the application session, a narrow extension to the existing settings command, and native readiness and exit coordination. Adding a snapshot only to the Data screen's Save schedule action does not cover later edits, startup before the webview is ready, restore before reload, or exit with pending work. A cache timestamp cannot establish that its snapshot includes the webview's current state. [S1–S8]

### Frozen source and custody

| Item | Independently checked value |
| --- | --- |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-backup-settings-code` |
| Branch | `review/deckchek-backup-settings-code-design-20261121` |
| Source HEAD | `754ccec53400fc0468d368110daaec2115aa69dc` |
| Source tree | `82d7317ddb3403841b03d2ea4d46e8f512c21ffe` |
| Source HEAD's sole parent | `3dfbea81e98d9cbc89b145e9d6805e500e8f0408` |
| Tracked source paths | 2,447 |
| Distinct tracked blobs | 2,212 |
| Summed working-file bytes, including duplicate blobs | 81,084,931 |
| Top-level test files | 203 tracked and 203 present |
| Initial working state | Clean; every tracked working-file Git blob identity and executable mode matched the frozen tree |
| Lane-owned change | This report only |

The review read `BACKUP_SETTINGS_REVIEW_SCOPE_2026-11-21.md` and the completed `PLAYER_AUDIO_EXPORT_CONTINUATION_2026-11-21.md` handoff. All three preceding Player final reports were consolidated before this lane began. Their qualified results and the independent full-source audio HOLD remain historical evidence. In particular, the first full-source result with the −101 dB gain observation remains open and was not rerun or patched.

Only static source reads and standard-library byte/Git data checks were performed. No project tests, syntax checks, imports, builds, extracted implementation, browser or native programs, scanners, probes, numerical diagnostics, or packaged verifiers ran. No subagents were spawned. No source file, permission, dependency, runtime configuration, published head, or original failure artifact was changed by this lane. Root owns correction authorship and publication; a fresh acceptance trio must follow completion of all three round 12 reports.

## Source map

All positions below refer to the frozen HEAD above. References identify reviewed functions rather than implying every line of a large module was audited.

| Ref | Source and relevant positions |
| --- | --- |
| S1 | `app/backup.js:162–201`: schedule validation/native bridge; `app/ui/screens/data.js:197–216, 257–320`: manual backup, restore, schedule save, refresh |
| S2 | `src-tauri/src/backup.rs:181–187, 2051–2123`: permissive `SettingsBlob`, schedule persistence, cache reader/writer |
| S3 | `src-tauri/src/backup.rs:2278–2413`: archive execution, logging/retention, explicit backup, restore command |
| S4 | `src-tauri/src/backup.rs:2445–2547`: settings command, startup due job, synchronous exit wait, one-attempt exit flag |
| S5 | `src-tauri/src/backup.rs:1253–1398, 1470–1510, 1511–1681, 2881–2899`: optional archive settings, limits, restore result, deliberate database-only archive case |
| S6 | `app/ui/state.js:26–34, 84–106, 124–214`; `app/ui/dom.js:70–80`: live UI settings, calibration writers, strict support read precedent, permissive export, restore, storage helpers |
| S7 | `app/features.js:37–95`; `app/app.js:60, 109–126`: bound feature state, separate notifications, application initialization |
| S8 | `src-tauri/src/lib.rs:397, 410–430`; `src-tauri/src/tray.rs:189–201, 250–273`: setup/run-event ordering, tray Quit, close-to-tray behavior |
| S9 | `src-tauri/src/db.rs:188–227, 244–259, 335–354`; `src-tauri/src/backup.rs:2245–2275, 1626–1638`: DB gate, command lane, existing ID helper, operation lock, restore gate |
| S10 | `src-tauri/src/backup.rs:98–150, 708–732, 754–821, 1415–1455, 1839–1880`; `src-tauri/src/photo.rs:240–253`; `src-tauri/src/ledger.rs:262–280`: error mapping, cleanup/bounded-read patterns, file replacement, startup recovery |
| S11 | `src-tauri/src/backup.rs:220–265, 2029–2046, 2059–2092`; `src-tauri/src/app_state.rs:12–15, 46–82, 93–109`: result/list/log fields, preserved schedule siblings, bounded generic state store |
| S12 | `src-tauri/src/backup.rs:45–95, 1999–2029`; `src-tauri/Cargo.toml:14–33`; `src-tauri/capabilities/default.json`; `src-tauri/src/lib.rs:236`: archive/retention constants, dependencies, command registration/capability |
| S13 | `docs/specs/08-backup-restore.md`, especially §§3–5, 8, 10; `docs/engineering/BACKUP_SETTINGS_REVIEW_SCOPE_2026-11-21.md:38–62`: handoff, partial-result visibility, startup/exit, compatibility/review gates |

## Findings

### C12-1 — Active schedules have no current-settings handoff

**Priority: high; established.** `Data.saveSchedule` sends only `{mode, keep}`. `createBackupApi.setSettings` forwards only that object. Rust `backup_settings_set` persists the schedule through `db_lane` without updating the cache. `run_scheduled_if_due` and `run_on_exit` read that cache. Its only writer is the explicit `backup_create` path when either optional settings field is present. Thus a first automatic backup has no guaranteed settings seed, and later edits have no automatic cache update. [S1–S4]

The scheduler in the traced source is a startup due check plus on-exit behavior; no periodic in-session scheduler was found there. Preserve or separately specify that policy. Adding a timer is not necessary to close #85. [S4]

### C12-2 — Cache failure and deliberate absence are indistinguishable

**Priority: high; established.** `SettingsBlob` is defaulted, unversioned, and contains two optional JSON values. Missing cache, failed metadata/read, oversized metadata, invalid JSON, and some schema omissions become `SettingsBlob::default()`. The automatic caller cannot distinguish optional-entry absence from an unavailable expected snapshot. `write_settings_cache` returns no result and ignores serialization, write, and rename failures. A readable prior file therefore says nothing about the latest attempted edit reaching native storage. [S2]

The metadata check followed by unrestricted `fs::read` is not an application-owned bound on bytes read if the file changes. The writer imposes no whole-envelope bound. The reader's 64 MiB total-cache limit also differs from two independent 64 MiB UI/calibration archive-entry limits: individually acceptable entries can produce an unreadable aggregate cache. In `backup_create`, the cache write precedes archive settings-size validation, so a manually supplied payload can replace the cache and then fail archive creation. These are source-derived findings, not exercised failure cases. [S2, S3, S5]

### C12-3 — Startup and shutdown cannot infer renderer freshness

**Priority: high; established.** `backup::setup` recovers native files and immediately starts the due worker, without a current-webview snapshot handshake. Native code cannot read renderer localStorage. A valid cache from an earlier session does not establish successful current UI/calibration capture. [S4, S7, S8, S13]

At exit, `run_on_exit` spawns a worker and synchronously waits on `recv_timeout(ON_EXIT_CAP)` from the run-event callback. `on_run_event` claims the first `ExitRequested` or `Exit`. There is no settings flush barrier or `prevent_exit` in that path. Tray handling separately hides a monitoring window on close and waits for monitor cleanup before `app.exit` on Quit. Emitting a flush request and then blocking the event loop cannot establish that a renderer reply is deliverable. This review has not established that the webview remains available through a later process-exit callback after a window close; pre-destruction interception needs explicit ownership and native qualification. [S4, S8]

The existing timeout caps the receiver's wait, not cancellation of the worker: no deadline or cancellation token reaches `run_backup`. Do not infer a hard worker-stop or partial-file-only guarantee merely from `recv_timeout`. [S3, S4]

### C12-4 — Existing notifications and restore cannot simply feed the export helper

**Priority: high; established with functional-lane coordination.** `exportSettingsBlob` shallow-copies live UI settings and uses a fallback-to-empty calibration read. UI, calibration and feature writers can notify after storage failure; generic `storageSet` even returns true when optional `localStorage?.setItem` is absent. Reading an older calibration map successfully does not establish that the latest attempted save/delete succeeded. Feature changes have their own listener set. Subscribing only to `settings`/`calibration` misses that path and does not preserve failure provenance. [S6, S7]

`importSettingsBlob` writes restored UI to storage without updating the bound live object. A generic calibration-event subscriber calling `exportSettingsBlob` would publish old UI after restore. A successful calibration-only restore to an empty map has `profiles === 0` and emits no event. Native restore uses current supplied settings for the safety backup, returns restored settings to JS, and does not replace the cache. Before reload, that cache can still represent pre-restore settings. [S1, S3, S5–S7]

### C12-5 — An automatic-result warning alone is not visible

**Priority: high; established.** `run_backup` can log success, advance `lastAuto*`, and apply retention before returning. `backup_log` has no warning/detail column, `BackupEntry` has no warning state, and startup/exit discard results. Data refresh substitutes an earlier/default schedule on settings-get error. Appending only `CreateResult.warnings` would not make failed expected-settings capture visible in these background paths. [S1, S3, S4, S11]

Refuse an expected-settings automatic operation before archive creation when its current complete snapshot is unavailable. Preserve the prior archive/cache and do not advance successful-auto timestamps or perform success-driven retention for that refusal. Keep the separate manual/database-only archive contract. The refusal still needs a bounded visible background status. [S5, S11–S13]

### C12-6 — A naive setter correction can introduce lock inversion or self-deadlock

**Priority: high design constraint; not an existing-deadlock finding.** Backup/restore and scheduled work acquire `OP_LOCK` before DB access. Every `DbConn` owns the DB gate's read guard, and restore requires its write guard. A combined settings/cache command must not open a live connection and then wait for `OP_LOCK`, inverting this order. [S3, S4, S9]

Calling existing `run_scheduled_if_due` after acknowledgement while retaining `OP_LOCK` would reacquire the same non-reentrant mutex. Awaiting a renderer flush while holding `OP_LOCK`, a `DbConn`, or the serialized DB command lane can prevent the reply's setter from completing. Separate the phases and release guards before dispatching the due job or waiting for another actor. [S4, S9]

## Proposed correction contract

The following is a recommendation for root's isolated candidate, not an implemented or accepted API. A complete candidate can meet these requirements without a new permission or dependency.

### 1. Reuse the existing command for a small typed protocol

Extend `backup_settings_set` with one optional, tagged, versioned sync input. Permit the existing schedule input to be absent for sync-only calls. Preserve the `{mode, keep}` schedule argument shape and response fields. Sync-only calls must not rewrite mode, retention or successful-auto timestamps. Expose bounded sync/status information additively through existing settings get/set responses. [S1, S4, S11, S12]

| Sync phase | Required meaning |
| --- | --- |
| Begin owner/session | Native creates a new owner epoch and starts unavailable. Return its bounded opaque identity; retirement rejects replies from a previous owner. |
| Submit snapshot | Supply the supported version, current native epoch, monotonic bounded revision and explicit state for both UI/calibration components. Native validates and commits the candidate, then acknowledges that exact identity/revision. This acknowledgement alone does not certify it as the renderer's latest state. |
| Confirm capture point | After receiving the snapshot acknowledgement, the renderer verifies that no newer revision is pending and confirms that exact generation for the operation. Only then may an active schedule commit or the pending startup due decision consume it. A native-requested equivalent barrier is acceptable. |
| Invalidate/unavailable | Identify the current epoch/revision and a fixed reason such as pending, capture failed, restore in progress, or retired. Retain last complete bytes without promoting them as current. |

An exit response also carries the matching native flush token. Present components carry appropriately shaped JSON objects; intentionally absent components have explicit absence tags. Missing fields, invalid shape/version, failed read/write, and unreported state are not absence. Use tagged components or equivalent required-field checks instead of defaulted optional fields. Keep the existing low-level `SettingsBlob` as the archive adapter after validation; cache-envelope versioning is separate from archive format v1. [S2, S5]

The capture-point phase matters: with one in-flight request, native can acknowledge generation N while JS already has N+1 pending. A check of native's last-seen revision cannot observe an unsent N+1. The owner must not confirm N in that case; send the latest bounded pending snapshot instead. Changes after a valid capture point belong to subsequent revisions. This defines an honest point-in-time snapshot for the operation rather than continuous access to live webview data. Startup, active schedule save, and exit must not mistake a storage acknowledgement for this barrier.

Enabling or changing an active schedule requires that current-session handoff as part of the same user operation. A legacy schedule-only request cannot establish readiness; an active request missing the required handoff should return an actionable error. Saving `Off` must remain possible during capture failure. Disable/re-enable must not revive an old epoch, failed revision or expired exit token.

Epochs/revisions/tokens protect ordering and ownership; they are not renderer authentication. Native readiness lives in native memory and starts unavailable after process/owner replacement. Generic `app_state_set` can write `backup`, and restore replaces the database, so persisted status is never a current-session readiness grant. [S9, S11]

### 2. Own synchronization for the application's lifetime

Start one owner during application initialization, independent of the Data screen. Register relevant listeners before accepting changes. Keep at most one submitted snapshot and one latest pending revision. Detach the bounded snapshot so it cannot mutate during an outstanding command. Coalesce superseded pending revisions; do not build a retry queue or add a guessed freshness timer. A completion for N cannot declare N+1 synchronized. Reject old owner callbacks after retirement/reload. The native due job consumes an explicitly confirmed operation snapshot, not whatever cache happens to be last readable. [S1, S6, S7]

Cover UI changes, feature overrides/reset, profile save/delete, and restore application explicitly. Preserve read/write health from initialization and attempted mutations. Live UI state remains the UI authority, including its feature-bound object; a later storage read cannot replace newer session values. Calibration must not silently become `{}` because storage is absent, inaccessible or corrupt, or a requested edit failed. `readSupportCalibration` supplies an existing failure-aware read precedent, but its selected-profile scope is not a complete registry exporter. [S6, S7]

Treat restore application as an explicit handoff. Retire pre-restore submissions; update the bound live UI object in place after successful application, or give the owner a detached snapshot of actually applied and retained values. Distinguish a successfully applied empty calibration map from an unsuccessful write. Accepted-profile count is not a success flag. Partial/failed application stays visible and unavailable for a claim of complete restored settings until capture succeeds. [S1, S3, S5–S7]

### 3. Make the cache versioned, bounded, and failure-aware

Keep the fixed app-data location. Validate envelope version, component tags/shapes, ownership identities and revisions strictly. Unknown versions, legacy unversioned files, missing/corrupt/unreadable files and over-limit data return a classified unavailable result. Retain old bytes until a valid replacement commits. Regenerate from the current webview; wrapping a legacy file in a new version does not make it fresh. [S2, S12]

Preserve the 64 MiB whole-cache bound, including envelope overhead. Read at most that limit plus one detection byte and reject excess; metadata is only an early check. Bound serialized output as it is written, with a small capped writer if needed, so oversized serialization cannot create an unrestricted candidate file. These stored-byte bounds do not prove that Tauri's earlier IPC deserialization allocation is bounded; do not make that claim. [S2, S10, S12]

Document the aggregate-cache limit separately from archive entry limits. A valid manual archive with individually acceptable UI/calibration entries may exceed the cache envelope limit. Report that cache/synchronization outcome explicitly without shrinking the archive format's accepted limits or misreporting an actually saved manual archive as nonexistent. Automatic operations requiring that cache remain unavailable until a complete cache-sized snapshot commits. [S3, S5]

No new crate is necessary. `backup.rs` already imports the file/read/write primitives and has `TempFiles`, `io_err`, bounded archive streaming and `sync_all` usage. `photo::write_atomic` is private, uses nonexclusive `File::create` and raw OS errors; it is not a ready-made cache helper. The ledger writer has different ownership/error requirements. Reuse the applicable patterns rather than copying either unchanged. [S9, S10, S12]

The writer must return a typed `Result`. Create a uniquely owned same-directory temporary file with exclusive creation; validate/cap/write the envelope, flush as required, `sync_all`, close, then replace the destination. Retain the destination through every pre-commit failure; never delete the last complete cache first. Cleanup ownership must cover only the new candidate, with a narrow startup rule for abandoned cache candidates. Current recovery does not clean the cache `.tmp` file. Map errors to fixed operation/reason messages without settings or absolute paths. OS atomic replacement and durability remain native gates; sync plus rename alone is not a tested power-loss guarantee. [S2, S10]

### 4. Serialize commit and schedule changes in the established lock order

The existing off-main command lane can remain, provided `OP_LOCK` is acquired before any live `DbConn`. Keep short native readiness locks out of cross-actor waits. Validate owner/revision and commit the bounded candidate under the operation lock. At the capture-point phase, recheck the exact accepted revision before persisting the requested active schedule or granting the operation's snapshot. The preparatory acknowledgement must not launch startup work. Release operation/DB guards before dispatching the due worker, which reacquires `OP_LOCK` and rechecks its granted epoch/revision/token. A prior invalidation or superseding owner must prevent reuse. [S3, S4, S9]

This is ordered coordination across a file and SQLite, not an atomic transaction across both. Cache replacement failure must leave an active schedule unchanged and must not acknowledge the new revision. A later schedule DB failure must be reported with the prior schedule retained; the newly valid cache may remain as data but is not a successful schedule change. If the renderer misses an acknowledgement, it remains unsynchronized until an explicit subsequent acknowledgement resolves ownership. Never promote an older cache after failure of a newer required snapshot.

Keep the existing DB gate → photo-file gate → SQLite ordering. Do not change archive/restore/photo locks or call into the DB command lane from an operation waiting for it. The cache owner must not await renderer callbacks or the due worker while holding this lane, operation lock or a live DB guard. [S3, S5, S9]

### 5. Cover every lifecycle entry

| Entry | Required behavior |
| --- | --- |
| Native startup | Run recovery, start unavailable, and retain one pending startup due decision. Do not create an automatic archive before a successful current-webview capture-point handoff. |
| First confirmed handoff | Release command locks, then dispatch the pending due decision. Do not lose the only startup opportunity because the early cache was unavailable. Preserve existing daily/weekly due rules. |
| Later edits | Invalidate readiness for newer pending/failed revisions; acknowledge only complete candidates. A later confirmed capture may resolve a blocked startup decision without arbitrary polling/retry. |
| Save active schedule | Require capture and the latest-generation barrier for that user operation. Surface capture, replacement and DB-write failures distinctly. |
| Save Off | Persist Off even when capture fails; cancel new scheduling intent and require a current handoff on re-enable. |
| Manual backup | Use its explicit snapshot for the archive. Separate archive success from cache synchronization outcome. Remove the unvalidated legacy-cache side effect or route it through the same typed, bounded owner protocol. |
| Restore/safety backup | Keep the current pre-restore snapshot's safety-backup meaning. Invalidate readiness through restore, explicitly apply returned/retained settings in JS, and establish a new owner/revision before automatic work. |
| Deliberate database-only archive | Preserve optional-entry absence, checksum verification and restore compatibility. Enforce expected-settings completeness in the automatic coordinator, not as a blanket ban inside `create_backup`. |
| Exit | Obtain a token-matched final snapshot while the webview exists, or return an unavailable/timeout outcome. Last acknowledged cache alone is not proof of current settings. |

Restored database schedule/status siblings can be older. They may affect the next due decision under existing schedule semantics but cannot establish readiness; native/renderer ownership must be reconciled first. [S3–S5, S11]

Review the restore command's omitted-settings fallback explicitly when changing the cache reader to return a result. It must not convert an unavailable expected current snapshot back to `SettingsBlob::default()`. Refuse that expected-settings restore before the safety backup/database swap if the current snapshot cannot be established. Explicit deliberate absence remains distinct, and valid database-only archives remain restorable; the absence of settings in an incoming archive does not mean current pre-restore settings are unavailable. [S3, S5]

### 6. Use an asynchronous exit barrier within the existing five seconds

An application-lifetime owner reduces the pending window but cannot eliminate it. IPC may be queued, or a local write can fail immediately before exit. A complete correction needs a graceful-exit barrier, not a cache-age threshold or an assumption that the last acknowledged revision is latest. [S4, S6–S8]

Intercept actual exit intent before main-webview destruction. A close that means hide-to-tray must keep that behavior and must not become a quit. Coordinate main-window close, app/tray exit requests and final exit notification under one native exit owner. Return promptly from callbacks rather than waiting there for a renderer reply. Preserve one attempted on-exit backup across duplicate events, with a final-exit phase allowing the coordinator's completion exit without launching another job. The existing boolean claim is a deduplication precedent, not a sufficient implementation of these phases. [S4, S8]

Issue a bounded native flush token. The renderer retires superseded work, captures final coherent settings, prevents further accepted mutations from invalidating that closing capture, and returns the matching token and current owner/revision through the setter. Native uses only that confirmed snapshot. No operation lock, live DB connection or DB lane may be held while awaiting this response. Missing/invalid replies, retired owners, failed capture and newer pending revisions remain unavailable.

Use **one monotonic five-second deadline** for the on-exit flush-and-backup sequence, including waiting for existing operations, validation/replacement, archive work and completion. Every phase consumes the remaining budget; there must not be a five-second flush wait followed by another five-second archive wait. Coordinate existing tray monitor cleanup with this deadline explicitly, without accidentally extending it through a second blocking path. Do not expand the existing limit or alter tray hiding to simplify the implementation.

At expiration, revoke the token, reject late acknowledgements, and proceed to final exit without certifying a newly complete automatic archive or waiting beyond the cap to persist status. The deadline/exit owner must not need `OP_LOCK` to stop waiting. Define and review cancellation/publication fences before archive rename and success bookkeeping, so a late worker cannot publish success for an expired operation while the process is still alive. A timed receiver wait alone does not supply this fence. [S3, S4]

This lifecycle design does not assert that uninspected framework methods already provide it. The current synchronous callback must change. Native qualification must establish window-event ordering, tray behavior, renderer IPC delivery, final exit, elapsed time, replacement behavior and interruption cleanup. A termination without an opportunity for the webview to reply cannot supply a new current snapshot; its outcome remains unavailable. [S4, S8, S13]

### 7. Make failure visible without changing archive schema

Keep a small status with fixed reason/state identifiers and bounded ordering information. Existing `app_state['backup']` siblings can hold display status under the existing 256 KiB value cap; the full settings body remains in its cache. Preserve unknown schedule siblings as today. Expose status through existing settings responses and display failures in Data and the startup flow. Do not silently substitute Off/old state on a status-read failure. [S1, S11]

Persisted status is advisory, never a readiness credential. Native memory is authoritative for this process. If persistence also fails, retain an in-memory error and report that limitation through the live response; an exit deadline must not grow to force a DB write. Do not claim every shutdown error can be made durable when storage itself is unavailable.

A refused expected-settings automatic attempt must leave `lastAutoAt`, `lastAutoMs`, successful archive logs and success-driven retention unchanged. A separately successful manual archive can report synchronization failure while accurately reporting its saved archive. Keep existing photo warnings separate. No new settings-derived filenames, raw parser/OS messages, settings payloads, device/profile identities or absolute paths are needed in status. [S3, S10–S12]

## Compatibility and fixed constraints

Leave these current boundaries unchanged: archive format/version 1 and entry names; optional settings and explicit database-only archives; checksums and restore safety; 2 GiB DB, 64 MiB non-DB entry and 2.5 GiB total archive caps; ratio 1000 above the 256 MiB floor; 100,000-entry cap; backup step/retry/restart constants; default retention 7 and range 1–365; manual-backup retention protection; five-second on-exit cap; capability/configuration scope; and published source heads. [S5, S12]

Older FS-08 text includes historical limits different from qualified current source. It is not authority to change those current constants in this correction. Keep the cache's separate envelope version and aggregate limit explicit. No new filesystem permission, generic file command, plugin, crypto claim, authentication scheme, periodic timer, calibration age rule or physical-measurement claim is required. [S12, S13]

## Acceptance handoff: required evidence, not executed results

All three round 12 FINALs must finish before root gives the isolated correction to fresh round 13 workers. Review the full actual diff and frozen candidate identity first. Any first execution command needs root's separate acceptance/review gate; this lane authorizes no command and reports no runtime pass.

| Area | Meaningful evidence required for the candidate |
| --- | --- |
| Original JS sources | One application owner independent of Data mounting; desktop bridge and browser no-op behavior; UI, feature, calibration save/delete and restore writers reach that owner. Use actual modules, not extracted/reimplemented copies. |
| Capture/storage | Distinguish legitimate absence from missing storage APIs, throwing reads, invalid JSON, failed writes/initialization and oversized data. A failed edit cannot become healthy merely by rereading the older map. Successfully applied empty calibration is acknowledged as such. |
| Ordering/barriers | Old completion cannot clear a newer pending revision; one in-flight plus one latest pending bound; old owner/wrong or expired exit token rejected; N acknowledgement while N+1 is pending cannot start startup work or claim the schedule-save barrier completed; restore retires pre-restore requests. |
| Schedule/startup | No prerequisite manual backup; active schedule save requires a current capture point; Off works during capture failure; early setup creates no settings-incomplete automatic archive; the later confirmed handoff runs the pending startup decision once. |
| Native cache | Strict version/shape/presence; exact whole-envelope limit and one byte over including multibyte UTF-8; growth during read cannot exceed the application bound; failed serialization/create/write/sync/rename preserves the last complete file and returns a classified error; cleanup owns only its candidate. |
| Archive compatibility | Optional/database-only archives remain valid/restorable; unchanged per-entry/total/checksum limits; aggregate-cache refusal does not shrink manual archive coverage; safety backup uses current pre-restore values, followed by an explicit restored/retained handoff. |
| Locks/restore | Concurrent setter, backup, restore and due work have no `DbConn` → `OP_LOCK` inversion, nested operation lock, or renderer wait holding the DB lane/gate. Due work rechecks its granted epoch/revision after acquiring the operation lock. |
| Status/retention | Background refusal visible; last-good data remains; refused attempt neither advances successful-auto fields nor prunes; bounded fixed status exposes no payload/path; DB/status-write failure accurately represented. |
| Native shutdown | Real close, tray hide, tray Quit, explicit exit and duplicate final events; pending/failed capture; blocked operations/DB; renderer delivery before destruction; shared five-second deadline; expired token and late worker cannot publish success; one final exit/backup attempt. |
| Native filesystem | Supported Windows/macOS and other filesystem replacement behavior, open-file/permission/full-disk failures, interruption between write/sync/rename, abandoned-temp cleanup, unchanged old cache/archive and exact reported outcomes. |

The functional and defensive lanes independently supplied matching lifecycle, storage-failure, bound and ownership concerns. Their coordination is design input alongside this lane's independently read source anchors, not executed evidence. A separately reviewed webview-only prerequisite stage can address writer/capture health while #85 and the native lifecycle remain open; it must not be described as implementing the complete contract above. Native qualification, the separate audio HOLD and publication remain root-owned after the three-report handoff.
