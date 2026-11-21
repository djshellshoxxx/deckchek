# Backup recovery correction — authored, unexecuted

All three round-thirteen reviewers held the original `d0b8992` candidate without
execution. Root read and independently verified their complete reports, exact
sole-report commits and every original source byte/mode. The static HOLD remains
preserved; this followup addresses its three concrete recovery findings.

After native restore succeeds, Data marks the current document as requiring
reload before applying local parts or notifying observers. A WeakSet holds that
document identity; there is no persisted flag or in-session unlock. Failed native
restore never enters the boundary. A real reload creates a fresh document.

The outcome dialog lives under the document body, independent of Data visibility,
disposal and restored feature flags. Escape cannot dismiss it; unexpected close
reopens it. The shell refuses navigation until reload. Ordinary UI/feature writers
return false before mutation; profile save/delete throw a generic reload-required
error. This protects the real Devices selector's retained old preferences.
The new document rebuilds navigation and screen caches from restored values.

Complete application retains the 1.8-second automatic reload and offers Reload
now. Partial application requires an explicit decision. Unavailable writes offer
local-settings retry without another database restore. Controls belong to their
outcome and current rendering; stale controls and actions after a reload request
do nothing. Failed reload requests retain a generic error and working retry.
Confirmation now distinguishes database failure from partial local application,
conditional reload and optional parts that preserve current settings.

The original strict detached/UTF-8/profile/per-part contracts remain. There are
26 added named cases relative to pre-webview source: eleven state, thirteen Data
and two Calibration cases. New/strengthened Data cases exercise the actual shell,
hidden/disposed completion with backup disabled, global retry, close/cancel,
the actual cached Devices writer, native failure and reload failure/coalescing.
Each case uses a fresh document/storage lifetime without a production reset hook.
These are authored assertions, not passing results or real WebView qualification.

Proposed FIRST files under tests/: backup.test.mjs, backup-ui.test.mjs,
backup-settings-screen.test.mjs, calibration-storage-screen.test.mjs,
features.test.mjs, native-catalog-archive-ui.test.mjs,
data-workspace-lifecycle.test.mjs, support-isolation-ui.test.mjs,
stylus-benchmark-evidence.test.mjs, devices-screen-lifecycle.test.mjs and
service-screen-lifecycle.test.mjs. The latter two check ordinary shared-guard
consumers. Fresh source/control/runtime review precedes separate authorization.

This application boundary does not cancel dispatched native work, create a native
transaction or defend a compromised renderer. Native #85's owner/epoch/cache,
startup/exit, initial UI provenance and persistence health remain unfinished.
No native command, schema, permission, dependency, Mobile file, archive/retention
constant, audio calculation or feature default changes. Audio/full-source HOLD,
all original evidence and fixed published/Fleet heads remain. No release/deploy.
