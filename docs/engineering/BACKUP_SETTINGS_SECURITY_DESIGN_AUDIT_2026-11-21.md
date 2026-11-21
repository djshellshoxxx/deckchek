# Backup settings completeness — round 12 defensive design audit

## Disposition

**The frozen source confirms the settings-completeness gap recorded in issue #85.**
An automatic archive can be structurally valid while the expected webview UI or
calibration snapshot is missing or older than later edits. The cache does not
carry a version, availability state or ordering identity, and several failures
become an empty `SettingsBlob`. This is a source-derived integrity and recovery
finding; this review did not observe data loss, reproduce a vulnerability or
qualify any proposed implementation. [S1–S6]

The recommended correction is a bounded, versioned handoff owned by one
application-lifetime coordinator, with native session/generation checks,
fallible replacement of the fixed cache file, explicit automatic-backup
readiness, and small retained health messages. Automatic creation should refuse
an unavailable expected snapshot before creating/logging an archive or advancing
the automatic clock. Keep intentional database-only manual/pure creation and
the existing archive format. A cache acknowledgement establishes one accepted
snapshot, not physical freshness of the application or device. [S1–S8]

Root owns implementation and consolidation. This worker changed only this
report. The code and functional round-12 peers were consulted about source
findings and the proposed contract. All three final reports must be complete
before a fresh acceptance cohort reviews a correction candidate.

Root's staged implementation decision is to prepare strict detached webview
snapshots, truthful storage outcomes, in-place restored UI state and empty-map
notifications first. Those prerequisites do not fix the native cache, ownership,
startup or exit paths by themselves. Issue #85 remains open through that stage;
the complete native contract and qualification limits below still apply.

## Frozen identity and review method

| Item | Independently checked value |
| --- | --- |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-backup-settings-security` |
| Branch | `review/deckchek-backup-settings-security-design-20261121` |
| Source HEAD | `754ccec53400fc0468d368110daaec2115aa69dc` |
| Source tree | `82d7317ddb3403841b03d2ea4d46e8f512c21ffe` |
| Sole source parent | `3dfbea81e98d9cbc89b145e9d6805e500e8f0408` |
| Tracked paths / distinct blobs | 2,447 / 2,212 |
| Sum of tracked source bytes | 81,084,931 |
| Top-level `tests/*.test.mjs` | 203; tracked and working inventories agree |
| Starting working state | Clean; each tracked path's bytes and Git mode matched |

The permitted standard-library Python/Git data check read every immutable blob,
recomputed its Git blob SHA-1 and SHA-256, and compared every working path and
mode. The check's JSON array contains `path`, `mode`, `oid`, `bytes`, and `sha256`
records in `git ls-tree -r` order, serialized with sorted keys and compact comma
and colon separators. Its SHA-256 is
`c9b262ccf28586622ebb08cbe07b7d073c529ad8dd7cba571af0609adc17cc5f`.
The array was used as data in memory; no additional report or verifier file was
written. Identity coverage is not a claim of semantic review of every file.

Semantic review followed the actual backup, settings, storage, feature, restore,
database-lock and shutdown source. The review also read the assigned scope and
Player handoff. No project module was imported or evaluated. No tests, syntax
checks, builds, app/browser/native runs, scanner, probe, extracted implementation,
packaged verifier, exploit or vulnerability reproduction ran in this lane.

### Selected source identities

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `src-tauri/src/backup.rs` | 189,646 | `2eefbbd97f6e12c3058b01cc605c1fe260e67bdef2ec3d9684ab44fc575bdea6` |
| `src-tauri/src/db.rs` | 90,632 | `68ce838bc71de162beb7df1d987c5e533d4d845a249d37ba4c7e87d32930c0f1` |
| `src-tauri/src/app_state.rs` | 7,509 | `9e252be486d71226ee63265240115eda467beb166b1d10e6a25dba9ff44d8287` |
| `app/backup.js` | 10,352 | `9e65bd79d5f1dfc4926e3724526b3ad28332caeb70593ec4c442c99f9f0bcceb` |
| `app/ui/state.js` | 10,801 | `8b2aec30abe2c498f8619d4773b857d2eab07ffcefc9a080fae204086952fffd` |
| `app/ui/dom.js` | 5,851 | `da4329c836baddf7b32fbb9af1410e7abdacfb011a7d1dbe6c8b9b90be90cb7a` |
| `app/features.js` | 6,139 | `7a6ca2b7f7e9830e3ed61c349eed481d5140cabee1cd247916b74e2e12002d34` |
| `app/ui/screens/data.js` | 24,469 | `d3c812f9c7b1d6c2b82e3cca6abad33c376fe64c0b199c940b2fc2e25cb6e434` |
| `src-tauri/capabilities/default.json` | 373 | `d2331ddd74ae7fb3e46e9d3b94316baa0856b67fb413e5e0b5b31fca2a28d497` |
| `src-tauri/tauri.conf.json` | 1,064 | `fbec3dfe8c6786053276051864d35f8ab14ba86e20e3a1d92b1c2b3a6b71b95e` |

### Source references

References below identify the frozen source, not a future patch. Line numbers
are navigation aids for that source only.

| Ref | Evidence |
| --- | --- |
| S1 | `src-tauri/src/backup.rs`: constants at 45–95; `BackupError`/`io_err` at 101–153; `SettingsBlob` at 181–187; result, listing and schedule types at 221–307. |
| S2 | `src-tauri/src/backup.rs`: `create_backup_with` at 1269 onward, optional JSON and per-entry guards at 1337–1361, archive publication at 1397; `read_settings_entry` at 1470 onward; restore and recovery at 1525–1880. |
| S3 | `src-tauri/src/backup.rs`: `log_backup` at 2028; `get_schedule`/`set_schedule` at 2051–2093; `is_due` at 2096; cache reader/writer at 2105–2123. |
| S4 | `src-tauri/src/backup.rs`: `OP_LOCK`, `app_ctx`, `run_backup` at 2245–2302; `backup_create` at 2324–2368; `backup_restore` at 2379–2414; settings commands at 2437–2457; scheduling/exit/setup at 2472–2548. |
| S5 | `app/backup.js`: `validateSchedule` and `createBackupApi`; `app/ui/screens/data.js`: `onBackup`, restore confirmation/`finishRestore`, `saveSchedule`, `refresh`; `app/app.js`: `bindSettings`, `start`. |
| S6 | `app/ui/state.js`: `setSetting`, `saveProfile`, `deleteProfile`, `readSupportCalibration`, backup sanitizers, `exportSettingsBlob`, `importSettingsBlob`; `app/ui/dom.js`: `storageGet`/`storageSet` at 71–80; `app/features.js`: `setEnabled`, `resetFeatures`, `onFeatureChange`. |
| S7 | `src-tauri/src/db.rs`: `gate`, `DbConn`, `open_database`, `off_main`; `src-tauri/src/app_state.rs`: 256 KiB value limit, generic `get`/`set` and command wrappers. |
| S8 | `src-tauri/capabilities/default.json`; `src-tauri/tauri.conf.json`; `src-tauri/src/lib.rs`: registered backup/app-state commands and backup setup/run callback; private writers `photo::write_atomic` and `signing::write_seed`. |
| S9 | `docs/engineering/BACKUP_SETTINGS_REVIEW_SCOPE_2026-11-21.md`; `docs/engineering/PLAYER_AUDIO_EXPORT_CONTINUATION_2026-11-21.md`; `docs/specs/08-backup-restore.md`; existing `tests/backup.test.mjs`, `tests/backup-ui.test.mjs`, and native backup test source. |

## Confirmed source findings

### 1. Expected settings become indistinguishable from intentional absence

Data schedule saving passes only mode and retention count. The JavaScript
bridge validates and forwards those fields; the native setter changes only
`app_state['backup']`. The existing native cache is seeded by the `backup_create`
command path, not by saving a schedule or subsequent webview mutations. [S3–S6]

`read_settings_cache` returns a default blob for missing, unreadable, malformed
or oversized cache data. Its unversioned `SettingsBlob` permits optional fields
and arbitrary JSON values. The outer deserializer defaults absent fields and
does not deny unknown fields. The caller cannot tell a deliberately empty
snapshot from a failed capture or an unrecognized object. `create_backup_with`
omits `None`/null optional entries without treating that omission as an error.
These choices permit legitimate database-only archives, but do not establish
completeness for an automatic job that expects UI and calibration data. [S1–S4]

**Correction priority:** separate expected automatic completeness from the
low-level optional archive contract. Missing/unavailable/stale state must not
be converted into a successful complete snapshot. A known empty calibration
map is valid data; it is not a failed read.

### 2. Cache size and replacement failures have no enforceable result

The writer serializes the whole blob, writes a fixed `.tmp` path, and ignores
serialization, write and rename failure. It has no encoded whole-cache size
check. Manual creation performs this side effect before the archive code's
per-entry checks. The reader applies its 64 MiB test to the whole cache, while
the archive applies 64 MiB separately to each non-database entry. Therefore,
individually accepted settings entries need not fit the cache reader's combined
budget. This is a source contract mismatch; no large input was constructed. [S1–S4]

The metadata length check also precedes an unrestricted `fs::read`; it does not
itself bound bytes read if the file changes between operations. The fixed temp
name is not exclusively claimed by its writer. The existing process mutex
serializes current backup operations but is not an inter-process file-ownership
guarantee. No concrete cross-process interference was tested or asserted. [S3–S4]

**Correction priority:** one explicit whole-cache byte cap, enforced on reads
and before any write; a `Result`-returning owned replacement; preserve the last
complete file on failure. Keep the archive's separate limits unchanged.

### 3. Local events do not prove complete persisted settings

`exportSettingsBlob` shallow-copies live UI state and uses forgiving storage
reads for calibration. An unreadable registry can become `{}`. Nested UI values
are not detached by the shallow copy. Settings/profile mutations emit events
despite ignored storage-write results; feature changes use a separate listener
set. `storageSet` can return true when its optional storage call is skipped
because the provider is absent. An event, an empty fallback, or that helper's
boolean alone cannot certify the intended state was read or committed. [S6]

Restore is a specific ordering seam: `importSettingsBlob` writes the restored
UI record but leaves the exported live `settings` object unchanged before it
emits calibration. A new listener that immediately exports would therefore
observe old live UI. A successful empty calibration-only restore emits no event
because `profiles` counts accepted entries rather than successful replacement.
The Data screen later reloads, leaving an interval in which this matters. [S5–S6]

**Correction priority:** strict capture and explicit mutation/restore outcomes,
detached before asynchronous work. Preserve the shared live-object binding used
by features. Do not silently filter part of a snapshot and label it complete.

### 4. A returned warning alone cannot make automatic failure visible

The manual Data action displays `CreateResult.warnings`. Automatic startup and
exit callers discard their results. `BackupEntry` contains no warnings, and
`backup_log` stores kind/path/size/schema/time/success rather than warning text.
`run_backup` attempts success logging, last-auto update and retention before
returning to its caller. Merely adding a warning to `CreateResult` would leave
the unattended paths without a durable, visible completeness result. [S1, S3–S5]

Data `refresh` also catches a settings-read failure and substitutes previous
schedule state or an Off default. That fallback cannot convey that current
backup health is unknown. [S5]

**Correction priority:** refuse unavailable expected settings before calling
`run_backup`, preserve last-auto/retention on refusal, and surface a bounded
generic health result through settings retrieval and the Data/startup UI.

### 5. Startup and exit do not establish a current webview handoff

Native setup starts the due check independently of webview initialization. A
valid prior-process cache cannot establish that the current webview has handed
over its state. The scheduler shown in this source performs a startup due check;
daily/weekly intervals are not an independently running periodic timer. [S3–S5]

Exit starts a worker and waits at most five seconds for its channel. The worker
has no supplied cancellation/deadline argument. A receiver timeout bounds that
wait; it is not evidence that file I/O stopped or that no later publication,
logging or retention can occur before process termination. The atomic flag
claims one exit attempt across `ExitRequested` and `Exit`, but establishes no
renderer flush. No shutdown was run in this review. [S4]

**Correction priority:** explicitly defer the startup due decision until an
eligible current handoff, and define a pre-destruction exit barrier within one
five-second total coordinator budget. Do not infer freshness from a timestamp,
same-process cache, or the fact that a previous request returned successfully.

### 6. Retained status and session identity have distinct trust roles

`set_schedule` preserves sibling keys in the backup app-state object, making
that object a suitable place for small health metadata. However, generic
`app_state_set` can replace that key and a restore replaces database state.
Stored status cannot be the authority for current native session readiness.
The app-state value also has a 256 KiB serialized limit. [S3, S7–S8]

The cache path is derived from app data and a fixed basename; the renderer does
not supply a cache destination. Existing capabilities expose core APIs and native
save/open dialogs to the main window, with the current CSP unchanged. This is a
local application trust boundary. A native-issued session identifier can reject
obsolete messages; it does not authenticate a compromised renderer or protect
against all activity by another process with the same filesystem access. [S4, S8]

**Correction priority:** native in-memory ownership governs eligibility. Retained
status is validated display data. No new filesystem scope, webview permission,
network access or security-policy exception is needed by the proposed design.

## Recommended bounded correction contract

The following is a proposed contract for root's candidate, not existing behavior
or implementation acceptance.

### One command surface, one authoritative cache writer

Reusing `backup_settings_set` is reasonable with a typed, optional, versioned
sync argument and optional schedule argument. Reject an empty or ambiguous
request. A sync-only request preserves mode, retention and last-auto fields.
Legacy schedule-only requests must not imply a fresh snapshot. Saving Off stays
possible when snapshot capture is unavailable; an active-mode save requires an
eligible current snapshot and must report failure if it cannot obtain one.

Use the sync path as the sole authoritative cache writer. Remove the implicit
unversioned cache side effect from manual creation, or require that side effect
to use the same validated current epoch/generation protocol. Preserve manual
`SettingsBlob` as archive content input and deliberate database-only creation.
An old manual snapshot must not replace a newer acknowledged automatic cache.

Native validation remains authoritative even when the JavaScript bridge checks
the same contract. Validate before filesystem or schedule mutation. The new
protocol should not copy schedule values from a stale JS closure on every edit.

### Explicit states and bounded envelope

| State | Meaning | Automatic eligibility |
| --- | --- | --- |
| Not ready | New native/application owner; no accepted current handoff | Refuse/defer the pending startup decision |
| Pending/invalidated | A newer intended generation is known, or restore/owner replacement revoked the prior one | Refuse until the matching complete handoff |
| Unavailable | Capture, validation, storage or replacement failed | Refuse and retain a fixed generic reason |
| Ready for a generation | Native accepted the complete detached snapshot for the active owner | Eligible only for a matching settled trigger/barrier |
| Legacy/unverified | A valid old cache remains recoverable but has no current ownership proof | Never promote merely by loading it |

Require an exact supported cache/sync version, recognized message kind, bounded
session identifier, and a monotonic integer generation with identical JS/native
range rules. A complete snapshot requires explicit UI and calibration members;
objects contain the intended JSON representation, and an explicitly allowed
null denotes deliberate absence only. Unavailable/invalidated variants carry
no substitute settings. Missing fields, unexpected outer shape, unrecognized
versions and malformed data produce generic errors rather than defaults.

Retain a whole-cache encoded-byte cap no larger than the current 64 MiB cache
read budget. Include envelope overhead; do not add the two archive entry limits
together to enlarge it. Check the actual UTF-8 representation, and bound
serialization/read work before publishing a new file. Native command arguments
already undergo IPC parsing, so a later serialization cap alone must not be
described as a transport-level memory guarantee. Keep the archive's format,
entry names, per-entry/total limits and existing restore compatibility unchanged.
JSON validity does not qualify calibration measurements or physical accuracy.

### Fallible replacement with explicit ownership

Derive the cache destination and temp directory from the existing native app-data
path. Use an exclusively created, uniquely owned temp in that same directory;
write the complete validated bounded bytes, finish/flush/sync as required, and
check replacement success before returning the cache acknowledgement. Do not
unlink the current good cache as a prerequisite to replacement. On failure,
retain it and clean up only the temp this operation created. Do not add broad
cleanup patterns or delete old/unrecognized files opportunistically.

Read through one opened handle with an enforced byte ceiling and check the
actual bytes and expected regular-file/shape conditions; a prior path metadata
length alone is insufficient. Fixed paths and exclusive temp creation address
the intended ownership contract, but do not establish complete protection from
directory substitution or concurrent writers outside this process. The existing
app-data access model is unchanged.

The private photo writer uses a generated temp plus `File::create`/sync/rename;
the private signing writer has different key-specific permission and cleanup
behavior. Neither is a verified general cache replacement API to copy unchanged.
Existing supported-platform rename behavior, open-file failures and crash
durability need native qualification. Do not promise power-loss durability or
hard cancellation solely from the presence of a rename or sync call. [S8]

### Ownership, ordering and source state

Install one app-lifetime coordinator after the live settings/feature binding is
available, subscribing before the initial capture. Include UI settings,
calibration save/delete, feature set/reset and restore completion. A strict
capture verifies source availability and intended mutation outcomes; it must not
re-read an older persisted calibration map after a failed save and call that
new intended state complete. Preserve explicit known-empty calibration.

Assign a generation to a detached JSON snapshot before awaiting IPC. Coalesce
newer edits with at most one owned snapshot operation in flight. Native-issued
active owner/session identity and monotonic generations reject obsolete page,
manual and pre-restore messages. A new owner/restore invalidates readiness;
timestamps or restored app-state metadata cannot recreate it. Bound the queue;
do not introduce an arbitrary poll/retry timer or retain all historical blobs.

Distinguish **cache accepted** from **current trigger settled**. Native may accept
generation `g` while JS already has a newer generation queued. Do not consume
the pending startup due decision, report an active Save as fully synchronized,
or complete an exit flush solely on that earlier acknowledgement. Require the
owner to confirm its latest generation for the matching trigger/barrier, or an
equivalent explicitly reviewed invalidation protocol. State the snapshot's
capture point. A later edit belongs to a new generation; no protocol proves
unseen or never-delivered edits were captured.

Acquire the backup operation lock consistently before opening/retaining a DB
gate or connection for cache/schedule mutations. Do not wait for a renderer,
another command or a DB-lane operation while holding a lock that operation
needs. `db::off_main` already serializes ordinary DB commands; extending the
setter must avoid lock inversion and an unnecessary long stall of that lane.
The file replacement and DB schedule update are not one atomic transaction:
if the cache commits and the schedule update fails, preserve the old schedule,
return failure and describe that result without claiming no state changed.

### Startup, exit and restore barriers

Retain the startup due decision while native readiness is unknown. Trigger it
once an owner-confirmed current handoff is eligible, then use the existing due
calculation. Rejecting the original early check without an explicit later
trigger would lose that startup opportunity. This correction does not add a
continuous daily/weekly timer or a guessed cache-age threshold.

For exit, require a real pre-destruction asynchronous intercept, a bounded
native flush token, a matching latest-generation acknowledgement and one total
five-second deadline covering renderer handoff, lock wait and archive work.
Do not hold `OP_LOCK` or a DB gate while awaiting the reply. Posting an event
then blocking the existing run callback does not prove the webview can answer;
the actual lifecycle/API delivery path needs native acceptance. The existing
once-only claim must still prevent duplicate exit jobs.

Expire the flush token at the deadline; late replies must not resurrect an
expired attempt. An unavailable or unsettled expected snapshot must not fall
back silently to last-good bytes. Preserve a generic failure/timeout outcome
where persistence is possible, and define publication/status/last-auto behavior
for work completing after expiry. Receiver timeout is not hard filesystem
cancellation. Forced termination, process crashes, another app process and
machine power loss remain outside a physical-freshness guarantee.

Restore must suspend/revoke old pending work before committing replacement
state. Apply validated restored UI into the authoritative live object without
breaking the feature binding; distinguish successful empty calibration
replacement from zero profiles accepted or failed storage. Capture/commit the
intended restored state under a new owner/generation before claiming readiness.
If storage application fails, retain explicit unavailable status rather than
letting a calibration event export old UI. The native pre-restore safety-backup
fallback must also distinguish unavailable current settings from intentional
optional absence; a stale fallback cannot substantiate a complete safety copy.

### Error privacy and retained health

Keep current readiness authoritative in native memory. Persist only a small
validated health record under the existing backup app-state siblings: fixed
state/reason enum, bounded attempt/generation metadata and optional time. Preserve
unrelated sibling fields and the existing app-state size cap. Never derive live
readiness from this record after launch or restore.

Use fixed generic cache error messages and the existing `io_err` style of I/O
classification. Do not echo cache JSON, UI/device/profile keys or values, raw
parser errors, arbitrary field names, full OS errors, absolute paths or a debug
dump of the snapshot into status, console, logs or diagnostic bundles. A
generation counter is sufficient for ordering; no settings-content hash is
needed in user diagnostics. Existing SQL error formatting is not a precedent
for adding sensitive cache errors. [S1, S7]

Settings retrieval should expose sanitized retained health plus current native
readiness. Data/startup presentation must distinguish unavailable status from a
known Off schedule. A successful archive still may have existing photo warnings;
the settings gate must not erase those. If persisting a health result itself
fails, return the generic failure and retain only bounded in-memory state;
do not claim a durable warning was recorded.

## Required acceptance after a concrete correction exists

These are review gates, not executed tests or a reproduction recipe. The current
test source includes schedule/bridge, optional-settings and restore coverage;
it does not establish the proposed cache/epoch/shutdown contract. [S9]

| Area | Evidence required from a separately authorized acceptance lane |
| --- | --- |
| First enable and compatibility | Schedule-first operation without manual seeding, known-empty calibration, later edits after a manual backup, and deliberate manual/pure database-only manifests/restores retain their declared behavior. |
| Strict capture | Missing provider, failed reads/writes, invalid registry, feature set/reset, deep UI changes and partial sanitization never become a falsely complete snapshot. |
| Cache bounds/version | Whole-envelope UTF-8 limit, read-time ceiling, invalid/missing/unknown version/shape, and legacy cache are handled explicitly without enlarging archive limits. |
| Replacement | Serialization/write/flush/rename failure preserves the prior complete cache, cleans only owned temp files and returns a sanitized failure; supported-platform replacement is exercised natively. |
| Ordering | Pending edits, stale/out-of-order acknowledgements, obsolete owners, manual operations and restore cannot overwrite or promote an older generation. Startup consumes only a settled eligible trigger once. |
| Schedule status | Off can be saved during capture failure; re-enable requires current state; failed expected-settings backup does not create/log a success, advance last-auto or apply retention. Sync-only calls preserve schedule/siblings. |
| Restore | Successful empty calibration restore is distinct from failure; bound live UI agrees with storage; old queued work is revoked; safety-backup completeness is explicit. |
| Shutdown and locks | Actual pre-destruction event delivery, no lock inversion, one total five-second budget, duplicate exit suppression, expired-token rejection and late worker publication/status behavior are qualified. |
| Privacy and UI | Data/startup show generic health including retrieval failure; diagnostics/logs contain no raw settings or new paths; status persistence failure is not reported as durable success. |

JavaScript bridge fakes or pure helper tests can qualify their own boundaries;
they cannot establish native filesystem replacement, real IPC event delivery,
shutdown timing or Windows behavior. No existing retained Player result proves
those properties. Local native/browser restrictions remain in effect; this
report authorizes no execution or workaround.

## Preserved qualification and final handoff

Keep archive format version 1, entry/checksum rules, the 2 GiB database limit,
64 MiB non-database entry limit and 2.5 GiB aggregate limit in the actual source.
Keep retention count bounds/default and automatic/manual retention distinctions,
the five-second exit budget, capabilities/CSP, and explicit database-only
support. The older prose size examples in FS-08 are not authority to alter the
current source limits. No database migration or new diagnostic settings capture
is required by this proposal. [S1–S4, S8–S9]

This round does not reopen the qualified Player result or publish its checkpoint.
The retained full-source audio HOLD remains: the prior full gate recorded 2,420
tests, 2,418 passes, one failure and one optional skip; case 53 retains the
reported final relative-gain failure, with no cause or repair established.
Fleet remains default-off with the fixed diagnostic source intact. None of the
backup design recommendations clears audio, native or browser qualification.
The retained Player handoff is the source of those prior results; none was
rerun here. [S9]

Root can now combine this report with the separate code and functional finals,
author the bounded correction, and freeze a candidate for a fresh acceptance
cohort. This report's commit identity, tree, sole parent, byte count, SHA-256 and
clean working-state check are supplied in the worker FINAL after the sole-file
commit; they are not embedded recursively in the report itself.
