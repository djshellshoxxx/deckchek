# Player capture and usage ledger defensive review — 20 November 2026

Reviewer: `/root/player_security`. This source-only lane began after all six
redaction workers completed. Dates use America/Los_Angeles.

## Disposition

**Accepted for the bounded defensive source scope at production freeze
`aabcd886667ed4116fecb725c532eabcc7d485d6`, tree
`ed86cf0d14508d4c9e42c84bf0c79e7f01e523fe`. No blocking finding identified.**
This covers the provisional player capture UI and incorporated usage-ledger
correction. It is not functional, native, physical or release qualification.

The lane runs no application, tests, generators, native build, benchmark,
scanner, probe or vulnerability reproduction. Review methods are source/Git
inspection, JSON reading and byte/hash comparison. The functional lane is the
sole project runtime executor. No remote repository read or write is performed
here.

## Source binding

| Role | Commit | Tree |
| --- | --- | --- |
| Assigned consolidation base | `3d0667bbefae56701edf1e543b2a06876e8ac054` | `3ccdec9c3c7dce2827009ae5206603248122b63e` |
| Reviewed production UI/usage freeze | `aabcd886667ed4116fecb725c532eabcc7d485d6` | `ed86cf0d14508d4c9e42c84bf0c79e7f01e523fe` |
| Subsequent documentation checkpoint | `dbb4f033fa88489df0d69739143004f015527711` | `bd01127e9a1a7662e59923461e42cb13579b36ef` |
| Independently inspected usage-ledger candidate | `b8dfc126c2480f303df105abd3759fedae49a192` | `a0660644f2e7d996817f0c76a004be95b37d3317` |
| Usage candidate's main base | `099c99c055322ef668be23e6ae50a2968614cc6d` | `f7e32678dd89880a7dce642424100e77c5e22374` |

The usage candidate changes exactly two paths against main. I read those Git
objects directly; the assigned worktree does not silently substitute the old
usage module for the candidate under review.

| Candidate path | SHA-256 |
| --- | --- |
| `app/usage-hours.js` | `cb190804c3a59399d473190abeb6fe4dfc90eaca053a82e909677db910b55e92` |
| `tests/usage-hours.test.mjs` | `55c7f2f08b5d1be7a7faf3f59ee2eda84d89893fb6e6f3961f79f3120b771ed6` |

The reviewed UI/usage freeze changes eight paths against the assigned base:
app entry, feature registry, HTML stylesheet registration, new CSS/new screen,
usage helper, feature tests and usage tests. Its two usage paths match candidate
`b8dfc126` exactly. The existing player acquisition/envelope, live-capture
adapter, native capture/usage and capability files remain byte-identical; the
native subtree, migrations, dependencies and workflows have no changes in this
slice. This comparison is against the assigned consolidation, which already
contains earlier unqualified redaction Rust changes.

| New UI path | SHA-256 |
| --- | --- |
| `app/ui/screens/player-capture.js` | `a549b3435a07eeaa4b829c6a71def9fb497fcec3407b2b285ec830235f03ccfe` |
| `app/features.js` | `7a6ca2b7f7e9830e3ed61c349eed481d5140cabee1cd247916b74e2e12002d34` |
| `app/app.js` | `9c82e0401edb03897526c190c45e9c884a21b7872aad8e788a880edcfe049808` |
| `app/index.html` | `b89889cb97609c77a03f0fac46d25400b032d2aea056e28323b9272980f8755d` |
| `app/styles/player-capture.css` | `94ca950a76c49d084637e8d29052264496fea1ae1cdfb82d9608a27f2dbaf946` |
| `tests/features.test.mjs` | `c77f5c36e4d2bbfb5c28c7b9f2ef850cf68fda35d563cccc0c97669e43c77b81` |

## Usage-ledger trust and correctness boundaries

The candidate checks own properties of the frozen priority map when normalizing
ledger rows, selecting a proposal source and validating a bridge input. This
excludes inherited property labels from the four-source allowlist. Existing
source priorities, interval overlap resolution, integer-millisecond arithmetic,
hour limits, unconfirmed policy, kind checks and native command names remain.

Session IDs from supplied existing rows now retain numeric zero. The proposer
adds an ID to its seen set only after constructing a valid proposal, so a
repeated session contributes at most one proposal in that batch and a malformed
earlier duration does not shadow a later valid copy. Null/undefined session IDs
remain untracked. ID comparison retains JavaScript Set identity/type semantics;
it does not normalize arbitrary IDs into a new canonical database key.

I inspected the real [stylus adapters](../../app/stylus-wear.js),
[Stylus screen](../../app/ui/screens/stylus.js) and
[related health-card caller](../../app/ui/crosslinks.js). Capture proposals use
recorded live-session spans and supplied existing ledger rows. DJ-log proposals
use synthetic span IDs during proposal construction and clear those IDs before
the write, because they are not database sessions. The UI presents proposals
for confirmation and passes confirmed entries through the existing usage API.

The [Rust usage boundary](../../src-tauri/src/usage.rs) remains authoritative
for persistence. Deserialization requires string source/session identifiers;
validation enforces exact source and kind membership, finite 0–24 hours, a UTC
timestamp shape and the note limit. `add` checks that the named asset and any
session exist before inserting. Values are passed through SQL parameters.
The [table migration](../../database/migrations/0006_asset_usage.sql) also has
source/kind/hour constraints and foreign-key declarations. No SQL, migration,
native command, capability or dependency changes in this candidate.

The added assertions inspect duplicate batch IDs, zero IDs, an invalid earlier
copy, the counting/proposal source paths and refusal before the modeled bridge
invoke. I read the assertions but did not execute them. The scheduled author's
adapted-V8 result is not an actual Node/native qualification result attributed
to this lane. Actual Node execution belongs to the separate functional lane.

Limits: this is proposal-level deduplication using the supplied snapshot. The
table does not gain an asset/session unique constraint; cross-call concurrency
or database-wide idempotency is not established. Numeric-zero compatibility in
the pure helper does not mean the native String session-ID boundary accepts a
number. The helpers are not newly advertised as a complete schema normalizer
for every malformed JavaScript object. There is no demonstrated affected user
ledger, external disclosure or native permission bypass in this review.

## Existing player acquisition boundaries inspected

| Boundary | Source behavior to preserve |
| --- | --- |
| Operator input | The [evidence envelope](../../app/player/evidence-record.js) snapshots plain own data, rejects accessor-backed assertions, caps strings/reference arrays and preserves explicit unknowns. Processing uses `unknown`, `enabled` or `disabled`. |
| Capture start | The [acquisition controller](../../app/player/acquisition.js) accepts one pair and 1–30 seconds, snapshots operator declarations before awaiting, generates distinct UUIDs and uses the existing live-session provider. |
| Native observations | [Adapter nativeFields](../../app/ui/audio-io.js) preserve presence/validity before compatibility defaults. Acquisition derives observed rate/device/pairs/duration from those fields; requested defaults cannot become measured evidence. |
| Ownership | The controller handles abort, preemption, capture loss and late-start cleanup; a session can stop/cancel only its owned lease through the existing capture adapter. |
| Native allocation | [Native capture](../../src-tauri/src/capture.rs) retains its existing pair validation, capacity clamp, buffer budget and fallible accumulation. The player controller refuses insufficient reported capacity. This review does not execute that path. |
| Serialization | Frozen acquisition/record metadata are separate from the mutable `audio` result. The new UI selects those metadata fields explicitly, as detailed below. |
| Qualification | Every generated evidence record remains unverified, report-ineligible and without a measurement. Raw evidence references stay empty; the controller does not persist samples or references. |
| Sharing/privacy | Metadata includes operator declarations, device names and bounded native error text. Metadata-only does not mean redacted or free of personal information. The new UI keeps download local and user-triggered. |

The existing [shell feature routing](../../app/ui/shell.js) calls `onHide` when
the active feature is switched off and navigation selects another screen. The
new screen's guards cover phase callbacks, result assignment, export and late
completion after cancellation/hide/disposal, as inspected below.

The unchanged [default capability](../../src-tauri/capabilities/default.json)
grants the main window core APIs and save/open dialogs. This slice adds no
native command, permission, network destination, automatic preemption or
production persistence/report eligibility.

## Actual player UI review

I read the entire [new screen](../../app/ui/screens/player-capture.js), its
[entry-point wiring](../../app/app.js), [feature registry](../../app/features.js),
[stylesheet](../../app/styles/player-capture.css) and corresponding feature
assertions. The production defaults call the existing acquisition controller
and live-capture provider; dependency overrides are explicit test seams.

`playerCapture` is wired but default-off, associated with proposed SPEC-10/CDJ-04
rather than an invented release milestone. The real app adds its screen
definition to the shell. The definition creates the hidden section and carries
the feature key, so the existing shell filters its rail entry and refuses
navigation while disabled. Startup registration itself starts no capture.
Existing flag assertions remain strict; a separate exact branch checks this
new proposed flag. Fleet remains default-off.

| Inspected path | Defensive conclusion |
| --- | --- |
| Start action | A direct start handler checks native availability, visible/disposed state and whether a request is already active, independently of disabled button styling. Duration is finite and within 1–30 seconds; blank pitch remains null and entered zero remains zero. |
| Snapshot | Operator text, exact processing enum values and requested device are collected before awaiting. The input-pair selection is copied. The acquisition envelope then performs its own bounded normalization; later top-bar/form changes cannot replace the captured record's assertions. |
| Active ownership | Each request has its own AbortController. The active predicate requires matching request identity, a live signal, visible screen and undisposed owner. Both phase callbacks and post-await result assignment use that predicate. |
| Cancel/hide/disable | Cancellation aborts the owned request and discards result metadata. `onHide` first marks the screen invisible, then aborts and clears it; shell feature-off navigation reaches this same path. The start button stays unavailable while the current promise is settling. |
| Disposal/late completion | Disposal makes the screen invisible, aborts/clears, detaches the settings listener and disposes pair-picker listeners. Late results cannot populate `last`; late status callbacks are ignored. Finally clears only its matching current request and avoids visible updates after disposal. |
| Stored result | `last` holds only `{acquisition, record}`. The full return object and `captured.audio` are not retained in screen state. This is dropping references, not proof of secure memory erasure or a new native audio-retention guarantee. |
| Clear/export actions | Both handlers enforce lifecycle state beyond button disablement. Export refuses a hidden/disposed/busy screen or missing result and serializes explicitly selected metadata fields. Filename uses the controller-generated run UUID; no operator text becomes a path or URL. |
| Display | Variable operator/device/driver error text is inserted through `h(...text)` or `textContent`. The single HTML insertion is a fixed plug icon. Result lists and messages do not interpret input as markup. |
| Observations | Requested input/pair/duration have separate rows from native reported values. Nominal rate is labelled nominal; measured rate is not invented. Missing device/pair/backend/counters remain Unknown. Entered pitch and processing settings are explicitly labelled as entered. |
| Qualification | The visible result is provisional. Continuity wording describes recorded counters, incompleteness or unavailable evidence and explicitly does not verify hardware continuity. No pitch measurement, PASS verdict, report registration or History save is produced. |
| Local download | The existing Blob/download helper is reached only by the explicit export action. The screen states that device names and driver messages are included. No automatic upload, external destination, file import, database write or new permission is added. |

The source has explicit hidden-section styling, and the shared stylesheet keeps
the `[hidden]` rule effective. This static inspection is not a browser rendering
or accessibility execution claim. `onShow` refreshes the existing pair selector;
that input-list operation is distinct from starting an audio capture.

The statement about clearing details on leaving refers to the captured result
and exportable metadata. Operator form values can remain in the registered
screen's DOM; they are not newly persisted to disk by this feature. The source
does not claim redacted metadata, complete PII removal or secure zeroization.
I found no new bounded defensive blocker in these paths.

I also inspected the subsequent [Spec 10 implementation note](../SPEC-10-CDJ-media-player-diagnostics.md)
at documentation checkpoint `dbb4f033`. Its only changes from the reviewed
production freeze are that note and a publication record. Runtime/test bytes
are unchanged. The note explicitly retains the default-off/provisional status,
distinguishes cleared result metadata from retained operator form values, and
keeps pitch measurement, raw/reference retention, persistence/reports and
scientific/physical acceptance unfinished.

## Retained qualification limits

The [redaction continuation](REDACTION_CONTINUATION_2026-11-20.md) preserves its
first full-suite audio failure and separate passing narrow rerun. This source
review neither explains nor clears it. Issue #69 stays open with raw/bare and
ambiguous-text limits; Spec 02 AC-6 remains unchanged. Earlier Fleet timing
failures, the fixed diagnostic head and Fleet default-off remain intact.

Exact-source functional, hosted/native and eventual physical qualification are
separate. This lane executed none of them and does not borrow a green result
from a different source. Root retains integration/publication ownership.
Rebind this review if runtime bytes or the provisional contract change. Only
this report is changed by the lane.
