# Scheduled-backup settings — functional and lifecycle design audit

## Disposition and scope

**Source confirms the settings-completeness gap in [issue #85](https://github.com/djshellshoxxx/deckchek/issues/85). A correction and fresh acceptance remain required.** Saving an automatic schedule does not seed the native settings cache, subsequent UI/calibration/feature changes do not update it, and automatic jobs can consume an empty or old cache without presenting its completeness state. This is a source-derived finding, not a runtime reproduction or an observed data-loss incident.

This is the fresh round-twelve functional/bug-hunt/correction-design lane under [the review scope](BACKUP_SETTINGS_REVIEW_SCOPE_2026-11-21.md). Root owns implementation. This worker owns only this report. No project test, syntax check, import, build, browser/WebView/native program, scanner, probe, extracted implementation, collector or packaged verifier was run. Source reads and independent standard-library Python byte/Git checks were used. Proposed acceptance cases below are **unexecuted and are not execution authorization**.

### Immutable review identity

| Item | Verified value |
| --- | --- |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-backup-settings-functional` |
| Branch | `review/deckchek-backup-settings-functional-design-20261121` |
| Frozen HEAD | `754ccec53400fc0468d368110daaec2115aa69dc` |
| Complete tree | `82d7317ddb3403841b03d2ea4d46e8f512c21ffe` |
| Sole parent | `3dfbea81e98d9cbc89b145e9d6805e500e8f0408` |
| Tracked paths / distinct blobs | 2,447 / 2,212 |
| Summed tracked source bytes | 81,084,931 |
| Top-level tracked and actual `tests/*.test.mjs` | 203, with identical path sets |
| Initial worktree | Clean |
| Independent complete-source check | Every tracked working file matched its immutable Git blob and executable mode; zero mismatches |

Complete byte verification establishes the reviewed identity; it does not imply that every file received semantic review. The source references below are against this frozen HEAD. The completed [Player handoff](PLAYER_AUDIO_EXPORT_CONTINUATION_2026-11-21.md) was read before this review. All three Player round-eleven FINALs preceded this round.

## Actual writers and end-to-end flow

| Source at the freeze | Observed responsibility | Implication for the correction |
| --- | --- | --- |
| `app/ui/state.js:27–34` | Initializes one live `settings` object through forgiving storage; `setSetting` mutates it, writes storage, emits `settings`, and emits `calibration` again for device/rate changes. | A settings event describes a state change, not proof of a successful storage write. Deduplicate a device/rate change rather than start parallel cache writes. |
| `app/ui/shell.js:31,83,115,189,281–284` | Theme, route, inspector, device and rate all use `setSetting`. | Synchronization must operate outside the Data screen, including during navigation. |
| `app/ui/workflows/setup-wizard.js:373–375`; `app/ui/screens/devices.js:58–68` | Wizard device/rate changes use the same writer. Device selection stores a mutable `st.units` object through `setSetting('deviceUnits', st.units)`. | A shallow export retained by a deferred queue is insufficient; snapshot nested values before the first await. |
| `app/ui/screens/fleet.js:352`; `app/ui/screens/service.js:134`; `app/ui/workflows/service-job.js:571`; `app/ui/screens/certificate.js:261` | Fleet preferences, service filters/currency and tester name also use `setSetting`. | Coverage cannot be limited to calibration controls or currently visible Data inputs. Preserve Fleet's existing default. |
| `app/ui/state.js:88–107`; `app/ui/screens/calibration.js:275–280,299–301` | Profiles are saved/deleted and followed by a `calibration` event. The screen shows save/delete success without checking persistence. | Observing the event cannot establish that the requested profile change exists. |
| `app/features.js:71–95`; `app/app.js:60` | Feature writers keep the bound live settings object updated, persist separately and notify `onFeatureChange`, not the state event bus. Reset also has its own notifications. | Observe feature changes as well as state changes. Preserve the shared settings object's identity if restore updates it. |
| `app/ui/screens/data.js:197–217`; `app/backup.js:189–191` | Manual backup passes `exportSettingsBlob()` and presents returned archive warnings. | Manual backup is the only current source of cache seeding; its success is not a continuing freshness guarantee. |
| `app/ui/screens/data.js:298–309`; `app/backup.js:162–165,197–199`; `src-tauri/src/backup.rs:2445–2455` | Schedule save carries only `mode` and `keep`; native writes the schedule to SQLite. | The first automatic schedule can be enabled without any UI/calibration cache ever being written. |
| `src-tauri/src/backup.rs:2105–2123,2330–2366` | Cache read falls back to an empty default; cache write ignores errors. Manual creation writes the cache before archive creation. | An unavailable cache is indistinguishable from deliberate optional absence, and failed writes can leave stale state without acknowledgement. |
| `src-tauri/src/backup.rs:2470–2521`; `src-tauri/src/lib.rs:397` | Startup checks due state on a native thread; on-exit reads the cache separately. | Startup runs independently of frontend readiness and needs an explicit later due check after a successful handshake. |
| `app/ui/screens/data.js:247–295`; `app/ui/state.js:204–214` | Native restore commits, then returned settings are written in the webview, followed by delayed reload. | The pre-reload interval and old queued snapshots need explicit ownership and invalidation. |

Searches for the two storage keys found the actual writer definitions in `state.js` and `features.js`; other key references are consumers or comments. This does not promise capture of arbitrary external modification of a WebView's storage, which would require a separately defined cross-context contract.

## Findings

### F1 — Schedule success currently proves no settings handoff

`saveSchedule` calls the mode/keep-only bridge and immediately reports success (`data.js:304–306`). `backup_settings_set` only calls `set_schedule` (`backup.rs:2446–2453`). The latter preserves other backup preferences and last-run fields (`2059–2092`) but cannot obtain WebView localStorage. Native startup/on-exit instead use `read_settings_cache` (`2478–2486,2498–2505`). A first schedule with no preceding manual backup has no settings cache seed. Editing UI preferences or calibration after a manual backup leaves its seed old.

The automatic archive can still be structurally valid because `create_backup` omits missing/null UI/calibration entries (`backup.rs:1337–1349`). Its warnings cover missing/damaged photos (`1325–1335`), not settings completeness. The existing database-only case is intentional: `backup_without_settings_lists_only_db_and_midi_maps` (`2881–2897`) expressly accepts `SettingsBlob::default()` for an automatic-kind archive. The correction must distinguish that explicit API use from an automatic schedule that expects a captured settings snapshot; it must not invalidate legitimate database-only archives.

Manual creation writes the supplied cache before archive entry-size validation (`backup.rs:2355–2366,1355–1359`). A rejected manual request can therefore still replace a useful cache. Cache writing has no aggregate pre-write bound, while its later read has a 64 MiB whole-file bound (`2105–2123`); two individually accepted entries plus envelope overhead can exceed that read bound. A cache acknowledgement needs its own complete validation and successful replacement, independently of later archive success.

### F2 — Current export and event APIs lose the information needed to claim completeness

`exportSettingsBlob` shallow-copies live UI and reads the calibration registry through `storageGet(...,{})` (`state.js:195–198`). `storageGet` turns unavailable storage, thrown reads and invalid JSON into the same fallback (`dom.js:71–75`). A missing registry, an intentionally empty registry, and an unreadable registry must not all become an apparently successful empty snapshot. The UI object's initial load also uses a forgiving fallback (`state.js:28`); its origin cannot later be recovered merely by cloning the live object.

UI and feature setters retain session state even when persistence fails (`state.js:29–33`, `features.js:76–81`). The correction must explicitly choose and describe UI authority: the existing live object represents the current session, including bound feature overrides. It should not silently substitute an older persisted record. At the same time, failed initial reads and failed persistence must remain observable rather than being described as durable settings success. Calibration has no corresponding authoritative live registry: a failed save/delete followed by a successful read can return the previous registry, not the intended change.

`saveProfile` and `deleteProfile` discard `storageSet`'s result and emit anyway (`state.js:94–107`). The actual calibration buttons then show success (`calibration.js:278–279,301`). An additional edge is that `storageSet` returns true if `globalThis.localStorage` is absent, because the optional `setItem` call is skipped (`dom.js:78–79`). `importSettingsBlob` can consequently report application success with no provider. These are source-established failure paths; this audit did not induce them in a running app.

Use a strict whole-registry observation separating present/empty, deliberately absent, malformed, unavailable and oversized states. `readSupportCalibration` (`state.js:124–153`) demonstrates the existing strict read distinction, but it selects one profile and is not a complete backup snapshot. Do not call a best-effort sanitizer that drops records and label the result complete. Preserve original valid profile strings and all eligible UI data, or return a bounded, explicit failure.

A detached snapshot is necessary. For example, `devices.js:68` reuses `st.units`; after its first assignment, `exportSettingsBlob().ui.deviceUnits` aliases that mutable object. A queue capturing only the shallow result and serializing after another await can send a later value under an earlier revision. Serialize/clone and bound the complete snapshot synchronously before queue admission.

### F3 — A Data-screen-only listener or state-only listener misses real changes

Settings writers operate across the shell, wizard, Devices, service and other screens. Feature setters use a separate observer set (`features.js:81,92,95`). A listener added only to `state.on('settings')` misses feature-only changes; a listener scoped to Data stops being useful when Data is hidden or disposed. Feature reset must be covered even when multiple per-flag notifications arrive. Turning the backup UI flag off must not end the service maintaining an already saved automatic schedule.

There should be one native application-lifetime owner. It observes both state settings/calibration and feature changes, starts after shared settings binding exists, and detaches once at application disposal. Screen show/hide must neither duplicate subscriptions nor cancel a committed global schedule update. Each listener should enqueue a bounded current snapshot, not perform overlapping native calls. Browser mode should remain inert.

### F4 — Restore requires its own state transition before reload

`importSettingsBlob` writes restored UI to localStorage but never updates the exported live `settings` object (`state.js:204–214`). If a newly added generic calibration listener calls `exportSettingsBlob` from its emitted event, it combines **old UI with newly restored calibration**. A later ordinary `setSetting` can also persist the old UI object again before reload. Simply assigning a new object is insufficient because `features.bindSettings` holds the current object by reference (`app.js:60`, `features.js:38–45`).

The restore result's `profiles` is an accepted-profile count, not an applied-write boolean. A successful calibration-only restore of `{}` yields zero profiles and emits no calibration event (`state.js:211–213`). A rejected calibration write can also leave `profiles:0`; the caller cannot distinguish these outcomes. UI write failure leaves `settings:false`, also used for an absent UI entry. `finishRestore` looks only at `skipped` and otherwise displays success and schedules reload after 1.8 seconds (`data.js:288–294`).

The correction must retire the old synchronization epoch, distinguish success/absence/failure per restored part, and publish the actually applied result, including an intentionally empty registry. Updating the shared live UI object in place before observers run is one viable approach; it should match fresh-load defaults plus restored values and remove obsolete previous overrides, rather than merely merging onto the old object. An explicit detached applied snapshot is another approach, provided subsequent normal writes cannot overwrite it. A partially failed webview application after a successful native database restore is a partial restore outcome. It must not reuse the generic “Nothing was changed” fallback (`data.js:34`) or imply database rollback.

Restore cancellation is bounded by commitment. An old chooser or undispatched confirmation may be retired. Once `backup_restore` has been dispatched, Data preserves its busy ownership and handles a successful result even if the modal has retired (`data.js:247–285`). Synchronization retirement must not discard that committed result. Native must reject an old-session/revision cache write arriving after restore; ignoring its frontend acknowledgement alone does not prevent it from overwriting the cache.

### F5 — Startup readiness and background error presentation are currently absent

Native setup starts its due check before the frontend has performed a settings handshake (`lib.rs:397`, `backup.rs:2516–2521`). `app.js:109–120` initializes the database through an asynchronous chain and catches initialization failure into a toast; completion of the chain is not evidence that a snapshot was committed. If automatic work is initially refused as not ready, a later successful handshake must explicitly trigger the missed due check. The current implementation has no recurring scheduler to rescue that skipped startup attempt.

The first native cache acknowledgement is not by itself a readiness barrier: a newer local revision may already be queued. The application owner must confirm its current desired revision is acknowledged at a defined capture/barrier point before requesting the due operation against that revision. Later edits are newer pending work. This is proposed-protocol reasoning from the source's asynchronous boundaries, not an executed race. Define the snapshot point instead of claiming instantaneous freshness across independent renderer/native event loops.

Startup and on-exit discard `run_backup` results (`backup.rs:2520,2499–2505`). A warning added only to `CreateResult` would not become visible. `BackupEntry` has name/path/kind/time/bytes, without warnings (`259–265`), and Data displays only kind/time/size (`data.js:363–367`). Data refresh converts list failure to an empty list and schedule-read failure to previous/default-Off values (`318–322`). An unknown status can look like “No backups yet” or Off.

Expose bounded, sanitized cache/automatic-backup health independently of archive rows: pending, acknowledged, unavailable/stale and last failed automatic attempt as appropriate. Retain enough background failure state to survive restart, without settings contents, device labels, absolute paths or raw errors. A failed refresh should remain visibly unknown. Preserve the last complete cache on failed updates, but do not use its existence as proof of current-session readiness. Persisted health is display information; restored/generic app-state values cannot be the authority for a native-owned current session or acknowledgement.

### F6 — Existing shutdown code cannot guarantee a pending edit reaches the cache

The native on-exit callback spawns backup work and then synchronously waits on `recv_timeout(ON_EXIT_CAP)` (`backup.rs:2489–2511`). The first `ExitRequested` or `Exit` claims the single attempt (`2524–2545`); `lib.rs:423–430` installs no asynchronous settings handshake. A new synchronous wait for JavaScript inside this callback would depend on event delivery that the callback can block. An exit event alone does not establish that a usable webview still exists.

The actual close-to-tray handler only prevents main-window closure to hide an active monitor on Windows/macOS (`tray.rs:249–272`). Tray Quit emits `monitor://tray` action `quit`, waits at most 1.5 seconds for monitor `ACTIVE`, then calls `app.exit(0)` (`189–201`). The webview handler stops the monitor (`app/ui/screens/monitor.js:115–122`); it does not flush settings. Existing workflow `pagehide`/`beforeunload` handlers stop audio, not backup synchronization. The `prevent_exit` use in `pdf.rs:983–985` is a native test/spike, not the application's shutdown path.

**No complete pending-edit barrier exists in these interfaces.** A strict guarantee needs native coordination before genuine window destruction: preserve close-to-tray behavior, intercept genuine close/exit, request a tokened flush while the renderer remains alive, return promptly from the event callback, wait off the event loop, then allow one terminal exit. Neither `OP_LOCK` nor the DB gate may be held while waiting for a renderer command needing them. One deadline must cover both flush and archive within the existing five-second total budget; it is not five seconds for each stage. Timeout/unavailable needs a specific outcome. A renderer that never receives the request cannot be assumed fresh.

If that asynchronous barrier is deferred, the bounded correction can only promise the last acknowledged snapshot. That limitation and a pending/unavailable outcome must remain explicit; subscriptions, a microtask, `beforeunload`, or the monitor's quit delay are not proof. This design observation is not native lifecycle qualification.

### F7 — Data lifecycle feedback must remain separate from global operation ownership

Data tracks refresh/visibility generations and retires choosers/modals on hide/dispose (`data.js:51–55,375–377`). `saveSchedule` has no captured visibility generation; its status writer only checks whether the screen is currently visible (`93–100,298–309`). An added snapshot await creates another opportunity for an old invocation to finish after hide/show. Its committed global schedule remains valid, but operation-specific feedback should not attach to a new presentation without checking ownership. Refreshing acknowledged global state when Data becomes visible is appropriate.

Existing native UI tests deliberately retain busy ownership through hide/show and display a pending manual-backup failure after reopening (`tests/native-catalog-archive-ui.test.mjs:291–299`). This is established behavior, not a blanket instruction to suppress every completion. New schedule tests must specify the intended outcome, keep busy release tied to its owner, avoid double dispatch, and prevent a retired owner from releasing a later operation. The synchronization service outlives the screen; only its screen subscription and transient presentation are disposed there.

## Small complete synchronization contract for root's correction

The following contract agrees with the code and defensive peers. It describes necessary behavior rather than accepting any unreviewed implementation.

1. **One authority and a strict capture.** Preserve the shared live UI object and feature binding; track initial-load and write failures explicitly. Observe the complete calibration registry through a strict provider/read/parse path. Detach and bound UI/calibration before awaiting. Empty `{}` is an observed value, not failure. Intentional optional absence requires an explicit representation; unavailable capture must not become an empty successful blob.
2. **One application owner and bounded queue.** Keep one in-flight sync and one replaceable latest desired snapshot. Use monotonically ordered revisions within a native-owned session/epoch. Deduplicate identical notifications without an arbitrary delay/retry loop. An acknowledgement clears pending only if it covers the current desired revision. A disposed or restored owner cannot regain ownership through a late response. Declare the snapshot point at which a backup operation consumes that revision.
3. **Native acknowledgement means durable replacement.** Reuse an existing command boundary with an additive, explicitly versioned/tagged sync payload if that is the chosen interface; preserve defined compatibility for mode/keep callers and direct database-only backup calls. Validate shape, aggregate encoded bytes and revision before writing a fixed-path cache. Atomically replace only after a complete valid write and return a specific Result. Failure preserves the last complete file and does not acknowledge the new revision. Native epochs must reject late writes after restore/reload rather than relying on JavaScript callback suppression.
4. **Enabling/changing an active schedule requires the corresponding snapshot.** Capture and synchronize the current state, then commit/acknowledge desired mode/keep through a defined native ordering and owner-confirmed revision barrier. A change while this work is pending must leave a newer pending revision or be included before freshness is reported. **Off remains savable when capture/storage fails.** Preserve keep bounds, last-run fields and unknown schedule preferences. Failed required capture must not silently enable a schedule or label it synchronized.
5. **Startup has a readiness transition.** Treat a new renderer session as not ready. Native cannot directly read its localStorage. Once the owner confirms its current desired revision is acknowledged, explicitly trigger the startup due check against that revision, with real due evaluation and existing serialization. An intermediate acknowledgement while a newer edit is queued is insufficient. An unavailable attempt produces health feedback and does not advance successful last-run time or run success retention. Avoid a guessed cache-age threshold or polling loop.
6. **Restore owns a new epoch.** Retire old queued work before restore application; native ordering rejects old epochs after restore commit. Report absent, successfully applied (including empty), sanitized/skipped and failed parts separately. Update authoritative shared state before ordinary observers can read it. Synchronize the actually applied snapshot and retain partial-failure health through reload. Preserve safety-backup and committed-restore behavior.
7. **Shutdown has either the real barrier or an explicit limitation.** If implemented, use F6's asynchronous request/acknowledgement lifecycle with one total five-second deadline and no lock held awaiting the renderer. Confirm the owner has flushed its latest desired revision for the current exit token. Keep monitor close-to-tray and exit-once semantics. A timeout must not be described as a fully current backup. Without the barrier, qualify on-exit freshness as last acknowledged only and keep the remaining work open.
8. **Health belongs to the operation, presentation to the screen.** Return sanitized actionable capture/cache errors to manual/schedule callers and retain background status for later display. Display records never authorize native readiness. Preserve committed data on partial failure. Screen hide/dispose retires presentation without stopping the application owner or undoing a native commit. Browser-only flows and current permissions remain unchanged.

The backend cache is separate from the archive format. This change needs no implied relaxation of schema/checksums, fixed entry names, path policy, permissions or retention. Current source constants are DB 2 GiB, individual non-DB entry/cache-read bound 64 MiB, total archive 2.5 GiB, compression ratio 1,000 applied above the 256 MiB floor, keep 1–365 and five seconds on exit (`backup.rs:54–95`). Older prose in spec 08 §7 names different JSON/ratio numbers; preserve the actual frozen implementation limits rather than silently changing policy during this correction. New cache-envelope overhead must fit a deliberately reviewed aggregate bound; per-entry checks alone do not provide that bound.

## Meaningful acceptance cases and actual test seams

All cases here are proposed source-preserving acceptance work for a later frozen correction. None was executed in this round.

| Case | Necessary assertion | Real seam to exercise |
| --- | --- | --- |
| First daily/weekly/onExit schedule, no manual backup | Exact UI and calibration are acknowledged before active schedule success; no empty default substitution. | Actual `createDataScreen` Save schedule handler, real bridge arguments, native settings/cache implementation. |
| Later shell/device/wizard change | New value is synchronized when Data is absent; duplicate device/rate notifications do not produce overlapping writes. | Actual `setSetting`, shell/wizard entrypoints and application owner. |
| Feature set/reset and backup UI flag off | Feature-only changes and reset are captured; an existing schedule retains its owner. Fleet remains default off. | Real `features.js` writers, bound settings and subscriptions. |
| Mutable nested settings | Mutating the caller's `deviceUnits` after enqueue cannot change bytes of the earlier revision. | Real state/capture module plus deferred native bridge. |
| Revisions A, B, C during a pending request | One request is in flight; latest revision survives coalescing; A's acknowledgement never clears C or prematurely releases startup/schedule/exit readiness. Old native epochs cannot replace C. | Actual owner with controllable deferred bridge; native revision checks separately. |
| Storage state distinctions | Missing key, valid empty map, absent provider, thrown read, malformed JSON, invalid/oversized registry and failed write have correct distinct outcomes. Failed profile save is not shown as saved. | Real storage access and state/feature/profile writers, not a copied parser. |
| Required snapshot fails / schedule Off | Complete old cache remains; enable/update fails or explicitly remains unsynchronized; Off still commits. | Actual schedule handler and native command. |
| Failed native replacement | No successful ack; prior complete file is retained under its stated freshness; temporary data is safely handled; status is sanitized. | Original Rust cache-write path with bounded failure injection in native tests. |
| Startup before UI readiness | No comprehensive default-empty archive; first owner-confirmed readiness explicitly checks due; failed handshake remains visible. | Original native setup/scheduler and handshake boundary. |
| Restore full UI and calibration | Immediate export equals restored UI/calibration before reload; feature binding sees restored overrides; old pending write cannot restore old bytes. | Real `importSettingsBlob`, owner and native restore boundary. |
| Empty / absent / partially failed restore | `{}` registry is applied/synchronized; absent parts stay untouched; denied writes are separate; committed DB restore is not described as rolled back. | Real import/apply result and Data `finishRestore`. |
| Restore cancellation and hide/dispose | Undispatched work is retired; dispatched native success is applied; old callbacks cannot release a later busy owner. | Existing Data modal/chooser and native-screen fixture. |
| Schedule pending across hide/show/dispose | Global commit survives; current global state refreshes appropriately; retired view feedback/subscriptions do not leak. | Actual Data handler with deferred bridge, lifecycle methods and busy ownership. |
| Background failure and reopen | Recorded cache/automatic-backup problem appears without paths/settings text; failed reads do not become invented Off/no-backup success. | Native health serialization and actual Data rendering. |
| Pending edit at each real close path | Request/ack ordering while webview lives; one total deadline; single exit; no lock/event-loop deadlock; monitor hide remains hide. | Genuine native main close, tray Quit and application exit, including timeout/destroyed-renderer outcomes. |
| Archive compatibility and timing | Exact expected UI/calibration entries restore; intentional DB-only case stays valid; policy is unchanged; failed required capture does not advance success time/retention. | Original Rust archive, schedule and restore implementations and compatibility cases. |

### Bounded later selection

The existing JavaScript tests provide useful seams but do not currently prove this feature:

- `tests/backup.test.mjs` has 12 literal cases for helpers, schedule validation and exact bridge arguments. Its bridge case expects the current mode/keep-only setter and preserves `create({kind:'auto'})` with `settings:null`. Extend the real bridge assertions for an additive contract and retain the compatibility case.
- `tests/backup-ui.test.mjs` has six cases. Its named restore round-trip checks persisted theme, but after export asserts only `typeof blob.ui === 'object'` (`53–67`); it does not compare restored live UI. It lacks empty-map and denied-write distinctions. Strengthen those behavioral assertions.
- `tests/features.test.mjs` already exercises binding, independent listeners, reset, unavailable storage and Fleet defaults. Include it when shared binding/subscriptions change.
- `tests/native-catalog-archive-ui.test.mjs` mounts the **actual** `createDataScreen` through `tests/fixtures/native-catalog-archive-dom.mjs` and stubs the native bridge (`1–24`). Existing deferred chooser, backup and restore ownership cases (`291–353`) support native schedule/restore tests without copying implementation into a toy component.
- `tests/data-workspace-lifecycle.test.mjs` covers actual browser Data workspace ownership. Include it if Data lifecycle/shared busy handling changes; it is not a native settings-sync test.
- Add narrowly scoped original-module tests for the synchronization owner and actual native Data save/restore handlers. Review new source and complete selected tests before their first execution. Inject storage/bridge/deferred responses to check behavior; do not extract production snippets or weaken assertions to obtain a pass.

A reasonable first JavaScript gate is the directly changed modules' tests plus the listed bridge/state/feature/Data lifecycle regressions, with exact filenames and counts settled only after root freezes the correction. It should be one explicitly reviewed first selection, preserve complete original outcome streams, and stop on a concrete failure for source review. This report supplies no command approval, fallback runner or instruction to retry. A passing JavaScript stub suite cannot qualify Rust commands or OS shutdown behavior.

Native acceptance must exercise original `src-tauri/src/backup.rs` paths, including existing `schedule_due_rules_at_their_boundaries`, `schedule_settings_round_trip_through_app_state`, the database-only archive case, restore/safety behavior and newly reviewed cache/session cases. Genuine supported-platform Tauri/WebView verification is needed for event delivery before destruction, IPC acknowledgement, startup scheduling, five-second exit budgeting, atomic replacement failures and Windows rename behavior. Local SDK/browser limitations remain; no extracted Rust harness or substitute headless qualification is proposed.

## Preserved gates and handoff

This report changes no product/test/tool/native/Mobile/CI file, archive limit, native permission, retention rule or audio behavior. The owned report is the only addition. Root retains implementation, consolidation, publication and later command authorization. All three round-twelve FINALs must precede fresh round-thirteen acceptance workers.

The completed Player handoff records its scoped 111/111 first focused pass. The separate round-ten full-source gate at `f1e0ca1` remains **2,420 total / 2,418 pass / one failure / one optional skip**, with case 53 retaining **−101 dB at −30 dBFS** after earlier cap/lower-level checks passed. This static review neither reproduces nor clears it and proposes no audio correction. Qualified main, fixed published heads, original evidence and Fleet's default-off qualification gate remain separate and unchanged.

The next worker should evaluate the actual isolated correction against the capture, epoch, restore, startup and exit contracts above. A settings handoff alone does not establish complete shutdown freshness; a design document alone does not establish native behavior. Remaining limitations must appear in the acceptance disposition and user-facing product status.
