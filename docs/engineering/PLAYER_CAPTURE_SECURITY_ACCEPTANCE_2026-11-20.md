# Player capture and usage ledger — fresh defensive acceptance

Reviewer: `/root/player_security_fresh`. Review date: 20 November 2026,
America/Los_Angeles. This independent lane began after all three initial player
workers completed. Only this report is authored by this lane.

## Disposition and scope

**Accepted for the bounded defensive source scope at
`f081881d4979e4385f255163660258784e27a264`, tree
`39d4351da05fc1fc65f555874824555d96df5cd3`. No new blocking finding was identified.**
The acceptance covers the default-off player capture consumer, its existing
ownership/provenance contracts, and the incorporated usage-ledger correction.
It does not qualify rendered behavior, native binaries, physical devices,
scientific measurements, a release or a deployment.

I read the [initial handoff](PLAYER_CAPTURE_INITIAL_HANDOFF_2026-11-20.md) and
the completed [code](PLAYER_CAPTURE_CODE_AUDIT_2026-11-20.md),
[functional](PLAYER_CAPTURE_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](PLAYER_CAPTURE_SECURITY_AUDIT_2026-11-20.md) reports, then inspected
the actual source and independently recomputed the evidence checks below.
Methods were source/Git inspection, JSON/TAP reading, byte comparison and hashing.
No application, test, native build, generator, scanner, probe, browser,
benchmark or vulnerability reproduction was executed by this lane. No remote
mutation or hosted workflow was performed. The fresh functional worker owns
current project execution separately; its results are not borrowed here.

## Immutable source binding

| Role | Commit | Tree |
| --- | --- | --- |
| Fresh combined source | `f081881d4979e4385f255163660258784e27a264` | `39d4351da05fc1fc65f555874824555d96df5cd3` |
| Initial production freeze | `aabcd886667ed4116fecb725c532eabcc7d485d6` | `ed86cf0d14508d4c9e42c84bf0c79e7f01e523fe` |
| Maintained tests and smoke | `2cb1aec7b1bdd4169b08aed57689eb7e937173c3` | `816bf89effa0b238d1620beec7aaf8c6ec51d27a` |
| Original usage candidate | `b8dfc126c2480f303df105abd3759fedae49a192` | `a0660644f2e7d996817f0c76a004be95b37d3317` |
| Earlier consolidation | `3d0667bbefae56701edf1e543b2a06876e8ac054` | `3ccdec9c3c7dce2827009ae5206603248122b63e` |

The fresh checkout started clean at the assigned commit/tree. Its `app`,
`src-tauri`, `database`, `.github` and package-manifest/lockfile paths match the
initial production freeze; its complete `tests` and `tools` paths match the
maintained test/smoke freeze. The production freeze changes exactly eight paths
against the earlier consolidation. I compared each current file with its
immutable production blob and calculated these SHA-256 digests:

| Path | SHA-256 |
| --- | --- |
| `app/app.js` | `9c82e0401edb03897526c190c45e9c884a21b7872aad8e788a880edcfe049808` |
| `app/features.js` | `7a6ca2b7f7e9830e3ed61c349eed481d5140cabee1cd247916b74e2e12002d34` |
| `app/index.html` | `b89889cb97609c77a03f0fac46d25400b032d2aea056e28323b9272980f8755d` |
| `app/styles/player-capture.css` | `94ca950a76c49d084637e8d29052264496fea1ae1cdfb82d9608a27f2dbaf946` |
| `app/ui/screens/player-capture.js` | `a549b3435a07eeaa4b829c6a71def9fb497fcec3407b2b285ec830235f03ccfe` |
| `app/usage-hours.js` | `cb190804c3a59399d473190abeb6fe4dfc90eaca053a82e909677db910b55e92` |
| `tests/features.test.mjs` | `c77f5c36e4d2bbfb5c28c7b9f2ef850cf68fda35d563cccc0c97669e43c77b81` |
| `tests/usage-hours.test.mjs` | `55c7f2f08b5d1be7a7faf3f59ee2eda84d89893fb6e6f3961f79f3120b771ed6` |

Both usage paths also match original candidate `b8dfc126` byte-for-byte. The
reviewed slice adds no native command, capability, dependency, migration or
workflow. The existing capture/controller/native implementations are unchanged
against the earlier consolidation; they are inspected contracts, not new native
hardening credited to the UI or usage patch.

## Player capture boundaries

The assets in this bounded review are capture ownership, truthful provenance,
transient waveform/result data, and the operator's control over local export.
The inspected boundaries are UI input, shared device/pair settings, asynchronous
capture callbacks, native observations and local JSON serialization.

### Real route and request lifecycle

The [app entry](../../app/app.js) registers the
[actual player screen](../../app/ui/screens/player-capture.js).
Its definition creates a hidden section and carries `feature: 'playerCapture'`.
The [registry](../../app/features.js) sets this wired flag to false and labels it
`SPEC-10 / CDJ-04`, `Proposed`. The existing
[shell](../../app/ui/shell.js) filters the rail, refuses disabled navigation and
calls the active screen's `onHide` when the flag is disabled. Registration,
navigation and opting in do not start a recording.

| Boundary | Independently inspected behavior |
| --- | --- |
| Start handler | `begin()` rejects a disposed/hidden/busy screen and checks native availability itself. Disabled button state is not the only guard. Duration must be finite and within 1–30 seconds; blank displayed pitch becomes null, while entered zero remains zero. |
| Snapshot | Device and operator fields are captured before awaiting. The selected pair array is copied before acquisition. The controller separately normalizes the operator envelope and parses the single-pair selection before its first await. |
| Ownership | Each start gets a distinct request object and AbortController. The active predicate requires identity with `current`, a non-aborted signal, visibility and an undisposed owner. Phase, error and completed-result handling respect that predicate. |
| Cancel and navigation | Cancel aborts that request and clears exportable result metadata. Hide first sets visibility false, then aborts/discards. A current promise prevents a second start until it settles. Feature disablement reaches the same hide path through the actual shell. |
| Late delivery | A result or phase delivered after cancel/hide/disposal cannot become active again when the screen is shown. `finally` clears only its matching request and avoids visible updates after disposal. |
| Disposal | Disposal aborts/discards, detaches the settings subscription and dispatches the existing pair-picker disposal event. Later start/export handlers refuse the disposed screen. |

The [acquisition controller](../../app/player/acquisition.js) races its own
work against cancellation/preemption/loss, schedules release of a late-started
session, and releases an owned session in `finally`. It requests only one pair
and bounded capacity and refuses insufficient reported capacity. The
[live adapter](../../app/ui/audio-io.js) closes over its returned lease;
[capture bridge](../../app/capture.js) forwards that lease to `stop_live_capture`.
The [native implementation](../../src-tauri/src/capture.rs) passes it through
`stop_blocking` to `take_session`, which refuses a missing or different lease
before removing the session. The new UI does not call global preemption.
Existing native pair validation, duration clamp, memory budget and fallible
buffer growth remain unchanged. These source observations do not establish
driver behavior or physical capture reliability.

### Result data, text and qualification

The UI stores only `{ acquisition, record }` in `last`; it does not store the
full returned capture object or `captured.audio`. Export checks lifecycle and
busy/result state and explicitly serializes those two metadata objects. The
filename contains the controller-generated UUID, not operator text. The
[existing download helper](../../app/ui/dom.js) creates a Blob URL, triggers a
local download and schedules URL revocation. No result upload, History save,
report registration, SQLite write or automatic audio-file retention is added.

This is not a claim that the screen has no persistent settings: feature opt-in
uses the existing settings store and the
[shared pair picker](../../app/ui/pair-picker.js) remembers input selections
through its existing mechanism. Captured result metadata is discarded on clear,
hide and disposal; operator form values can remain in the registered DOM.
Dropping these references is not secure memory erasure. A file explicitly
downloaded by the operator is also outside that transient clearing behavior.

Variable device/operator/error/reason values are inserted with `textContent`
or the `h` helper's text attribute. The HTML insertion in the new screen is a
fixed plug icon. Operator values are normalized through the existing
[evidence constructor](../../app/player/evidence-record.js), which snapshots
plain own data, rejects accessor-backed assertions, bounds strings/reference
lists and validates finite values and processing enums. Exported metadata can
include entered values, device names and bounded driver text; the UI discloses
that scope and does not claim redaction or absence of personal information.

`payloadToAudio` records native-field presence and validity before compatibility
defaults. Acquisition observes those descriptors and verifies their consistency
with returned audio. Requested values do not substitute for native evidence.
The screen separately labels requested/reported input and pair, requested
duration and frame-derived audio length, nominal rate and unmeasured rate.
Unknown backend/gain/counters remain unknown; entered pitch and processing
remain operator assertions. A requested first channel does not assert stereo.

Every record still has `qualification.status = 'unverified'`,
`eligibleForReport = false` and `measurement = null`; raw references are empty.
Counter wording describes recorded/unavailable/incomplete evidence, with an
explicit statement that it does not verify hardware continuity or qualify a
pitch measurement. No estimator integration or PASS verdict is introduced.

## Usage-ledger correction and persistence boundary

The [shared helper](../../app/usage-hours.js) now uses own-property checks for
the fixed priority map at normalization, proposal-source selection and bridge
validation. This removes inherited source names from those lookups. It is not
a complete malformed-object schema: property-key coercion and other preexisting
JavaScript input behaviors are not replaced by a strict string-type validator.

Existing-ledger session IDs preserve numeric zero in the helper's seen set.
The proposer adds a non-null session ID only after a valid proposal is emitted,
so an invalid/irrelevant first copy does not suppress a later valid copy. The
first valid copy wins within the supplied batch. Null/undefined IDs are not
deduplicated, and Set identity/type semantics remain. Priorities
`manual > djlog > deckchek > import`, overlap handling, hour caps and the
unconfirmed policy are unchanged.

I traced [stylus adapters](../../app/stylus-wear.js), the
[Stylus UI](../../app/ui/screens/stylus.js) and related
[crosslinks](../../app/ui/crosslinks.js). Actual capture proposals originate
from recorded live sessions and the selected asset's supplied ledger entries.
The UI presents proposals for confirmation. DJ-log spans use synthetic IDs in
proposal calculation but clear them before writing because they are not stored
capture sessions.

The [native usage boundary](../../src-tauri/src/usage.rs) already requires a
String source and optional String session ID. It separately checks exact source
and kind membership, finite 0–24 hours, UTC timestamp shape, note length and
referenced asset/session existence, then uses SQL parameters. The
[table migration](../../database/migrations/0006_asset_usage.sql) already has
source/kind/hour constraints and foreign keys. No new asset/session unique
constraint is introduced. Numeric-zero compatibility is therefore a pure-helper
fact, not native numeric-ID persistence. The JavaScript repair is not a newly
added native security boundary or global/concurrent idempotency. No affected
stored-user ledger or native validation bypass was established by this review.

## Independent evidence integrity check

I recomputed all 26 entries in the retained functional
[digest ledger](evidence/player-capture-functional-2026-11-20/SHA256SUMS).
For all five execution records, I independently compared the before/after maps,
exact Git inventories, source/tree identities, log lengths and log digests.
I hashed the underlying 1,786 distinct immutable Git blobs and checked every
mapped entry, rather than accepting the earlier verification JSON as proof.
Recorded boundaries are clean and unchanged for each execution. A read-only
parser also checked each TAP summary against its result JSON. No project code
was loaded or executed by this verification.

| Retained execution, attributed to the initial functional worker | Recorded result | Verified tracked entries |
| --- | --- | --- |
| Instrumented external audio-quality copy at `3d0667bb` | 15/15 pass; exit 0 | 1,853 |
| Two original prefix files plus that audio copy at `3d0667bb` | 33/33 pass; exit 0 | 1,853 |
| Exact original usage candidate `b8dfc126` | 22/22 pass; exit 0 | 1,655 |
| Five-file player selection at `d785e706` | 77/77 pass; exit 0 | 1,856 |
| Browser launch at `09f6e5db` | Exit 1 before page/module execution | 1,857 |

All five records identify Node v24.22.3 and no timeout. These selections overlap
and are not additive. In particular, the 22-case usage result is separately
attributed to its exact candidate, while the 77-case selection includes usage
and acquisition cases. They are retained runtime evidence from another worker,
not executions or independent runtime successes of this source-review lane.

The [Chromium log](evidence/player-capture-functional-2026-11-20/player-smoke/ui-smoke.log)
matches its recorded 7,515 bytes and SHA-256
`0a7d0bc6851356cf08fa1d44fea918b671749022cb7de09ce50ca327d3b0887f`.
It shows `socket() failed: Operation not permitted (1)` during browser launch.
The unchanged runner launches the browser before importing/running a smoke
module; discovery of the filename alone did not execute its body. The recorded
screenshot inventory and check-summary list are empty. No rendered or download
success is established, and this lane made no retry or permission workaround.

The final [smoke source](../../tools/smoke/player-capture.mjs) differs from the
blocked-attempt source only by combining dependent native mock initialization
into one ordered script. Its retained Node `--check` outcome establishes syntax
parsing only. Its public opt-in, local Blob download, cancellation and layout
checks remain authored modeled-native flows awaiting actual browser execution.
I inspected the maintained [screen assertions](../../tests/player-capture-screen.test.mjs)
as source; modeled DOM/native fixtures do not establish visual or physical facts.

The three initial report digests independently match:

| Initial report | SHA-256 |
| --- | --- |
| Code audit | `2a6e33d47d1ff69d6bc914a7be82dd7664194166f653ed65f9484ae173f106a4` |
| Defensive audit | `c952dbd270e1e8c22d3267856c3fa432ba6792cb561caa50e31217e6d4e940a0` |
| Functional audit | `9079f6cf1a2d7fa627372df0cfc00958e3bcd52555fa2058b91e79f08acc1c9e` |

## Preserved failures and qualification gates

I independently verified the original
[failed full TAP](evidence/redaction-acceptance-2026-11-20/full-suite.tap):
530,581 bytes, SHA-256
`39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197`.
Its summary remains 2,314 total / 2,312 pass / one failure / one optional skip,
including the cubic THD assertion `16972224339301138 vs 4.347826086956522`.
Issue #72 retains that Node24 failure. The separate narrow pass and the later
15/33-case diagnostics establish no cause and do not clear the failure. This
review introduces no audio patch, weakened assertion, skip or causal explanation.

I also verified the retained earlier PR71
[compressed log](evidence/player-capture-integration-2026-11-20/pr71-javascript-complete.log.gz)
and [observation record](evidence/player-capture-integration-2026-11-20/pr71-javascript-observation.json):
97,311 compressed bytes, 314,422 decoded bytes, both recorded SHA-256 digests,
and the actual tested merge's tree and ordered parents. The decoded log shows
Node v22.23.5 and 2,314 total / 2,313 pass / zero failures / one skip, with the
cubic case passing in that hosted run. Tested merge
`cef7ef6961816ef796ced5450d781c5d37b923ba` has tree
`3ccdec9c3c7dce2827009ae5206603248122b63e`, with parents main `099c99c0` then
published PR71 head `0a5d485e`. Earlier standard CI for that source does not
qualify the later player UI or explain a different Node24 observation.
No live CI status was independently queried by this lane.

The [Spec 10 note](../SPEC-10-CDJ-media-player-diagnostics.md) accurately describes
the default-off, capture-only preview and its retention boundaries. I read the
original requirements and compared the entire content from `Date: 2026-10-06`
onward with the earlier consolidation: it is byte-identical. Raw/reference
retention, pitch-measurement integration, persistence/report wiring, reference
characterization and two-model physical validation remain unfinished. The
proposed flag creates no release milestone or calibrated diagnostic claim.

The [redaction continuation](REDACTION_CONTINUATION_2026-11-20.md) still retains
issue #69's open scope and its raw/bare/ambiguous-text limits; Spec 02 AC-6 is
unchanged. The [Fleet hosted record](FLEET_GATE_HOSTED_RESULT_2026-11-20.md)
retains the original and diagnostic timing failures; diagnostic head
`69fc06eb471dfb00de544bbe233c0f5dc95402e8` stays fixed, with no retrigger or
threshold change here. Fleet remains default off. The unchanged
[native capability](../../src-tauri/capabilities/default.json) receives no
permission expansion.

Exact-source functional/rendered, native/platform, physical/scientific and
release gates remain separate. Root owns consolidation and publication. Rebind
this acceptance if production bytes or the provisional contract change; this
report does not authorize promoting the feature's qualification.
