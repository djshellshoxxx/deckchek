# Player capture and usage-ledger code audit — 20 November 2026

Reviewer: `/root/player_code`. Dates use America/Los_Angeles. This is a static
code/spec lane; the separately assigned functional worker owns all execution.

## Disposition

**Accepted for the bounded static code/spec scope at combined source
`aabcd886667ed4116fecb725c532eabcc7d485d6`, tree
`ed86cf0d14508d4c9e42c84bf0c79e7f01e523fe`. No new production-code blocker was
identified.** This includes the default-off player capture consumer and the
unchanged usage-ledger candidate #70. It is not runtime, visual, native, physical
or release qualification. The functional lane owns the new UI assertions and
execution separately.

## Source identities

| Role | Commit | Tree |
| --- | --- | --- |
| Assigned consolidated base | `3d0667bbefae56701edf1e543b2a06876e8ac054` | `3ccdec9c3c7dce2827009ae5206603248122b63e` |
| Usage-ledger candidate | `b8dfc126c2480f303df105abd3759fedae49a192` | `a0660644f2e7d996817f0c76a004be95b37d3317` |
| Candidate's main base | `099c99c055322ef668be23e6ae50a2968614cc6d` | `f7e32678dd89880a7dce642424100e77c5e22374` |
| Combined production freeze | `aabcd886667ed4116fecb725c532eabcc7d485d6` | `ed86cf0d14508d4c9e42c84bf0c79e7f01e523fe` |
| New UI assertions inspected as source | `d785e706a354512e4cd9c8855c868f600de07a78` | `4ebca0206138fefa528a8da1db89edbc02076afd` |
| Root documentation follow-up | `dbb4f033fa88489df0d69739143004f015527711` | Documentation-only successor of the production freeze |

I inspected the candidate through immutable Git objects rather than treating
the older usage helper in the assigned checkout as the candidate. Its complete
main-base diff changes only `app/usage-hours.js` and
`tests/usage-hours.test.mjs`. No native command, migration, dependency,
permission, workflow, feature default, time limit or priority is changed by
that usage-ledger candidate. The combined freeze separately adds one default-off
player flag and its UI.

After receiving the root's freeze I fast-forwarded this isolated worktree to it.
The combined diff from the assigned base is exactly eight files: six UI/registry/
style/feature-test paths plus the two usage-ledger paths. I compared every working
file with its immutable frozen Git blob and independently calculated these hashes:

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

Both usage-ledger files are byte-identical to candidate `b8dfc126`. The assigned
base, qualified main `099c99c`, usage candidate and original trend #68 head
`d36517ff` are all ancestors of this freeze. No native, permission, workflow,
capture-controller or redaction implementation bytes changed in this slice.

## Usage-ledger findings

The shared helper now checks that a source is an own property of the fixed
`SOURCE_PRIORITY` object at all three relevant boundaries: row normalization,
session proposal source selection and bridge input validation. Ordinary allowed
source values retain priorities `manual > djlog > deckchek > import`. Unsupported
row sources are excluded, unsupported proposal sources receive the existing
`deckchek` fallback, and unsupported explicit add sources fail validation before
the supplied invocation function is called.

The same-batch proposal filter now adds a non-null session ID only after that
session passes the asset/time/duration conditions and contributes an output
proposal. A malformed or unrelated earlier copy therefore does not consume an
ID needed by a later valid copy. Existing-ledger IDs no longer pass through a
truthiness filter, preserving numeric zero in the pure helper's supported
identity comparison. Null/undefined IDs remain exempt from ID deduplication; the
existing case-sensitive/type-sensitive `Set` semantics are unchanged. The first
valid input for a repeated ID wins; sorting the completed output by start time
does not turn this into duration merging or a database uniqueness constraint.

The two new tests substantiate the narrow behavior: repeated string IDs,
invalid-before-valid copies, repeated numeric-zero IDs, camel/snake-case existing
IDs, and all three source-processing boundaries. Their bridge assertion checks
that rejected source names cause zero invocations. Existing assertions for
priority resolution, overlap trimming, ledger immutability, sub-minute filtering,
12/24-hour caps, confirmation policy and native command/argument names remain.
I read these assertions but did not run them or the scheduled author's adapted
V8 harness.

### Actual caller and persistence boundaries

[`proposeFromCaptureSessions`](../../app/stylus-wear.js) selects live captures,
then feeds the shared proposer through `proposeFromDvsSessions`. Its native
`list_capture_sessions` rows have string IDs. The [Stylus screen](../../app/ui/screens/stylus.js)
passes the selected asset's existing entries into `captureProposals`, combines
those proposals with separate DJ-log proposals, and adds a proposal only after
the user confirms it. DJ-log proposals deliberately clear their synthetic
session IDs before persistence.

[`UsageAddInput`](../../src-tauri/src/usage.rs) already requires a string source
and `Option<String>` session ID. It separately validates the four source strings,
the asset and any referenced session. The existing [ledger migration](../../database/migrations/0006_asset_usage.sql)
also constrains the source column to those four strings. These native/database
boundaries were not added by this JavaScript patch. Numeric-zero fixture success
therefore describes the pure helper; it does not establish native persistence
of numeric session IDs. No affected stored-user dataset or native validation
bypass is demonstrated by this review. There is no database asset/session
uniqueness constraint, so this change does not promise global or concurrent
idempotency. It also does not establish a complete malformed-input schema.

## Player UI review

I read the complete [new screen](../../app/ui/screens/player-capture.js), the
entry-point and stylesheet wiring, and the feature registry/assertion changes.
The production contracts inspected alongside it are
[`runCdjAcquisition`](../../app/player/acquisition.js), the
[provisional record](../../app/player/evidence-record.js),
[`startLiveSession`](../../app/ui/audio-io.js), the [shared pair picker](../../app/ui/pair-picker.js),
the [feature registry](../../app/features.js), the [experimental panel](../../app/ui/screens/experimental.js)
and the [shell lifecycle](../../app/ui/shell.js). They establish the actual
interfaces actually used by the new screen; previous execution does not qualify
this new consumer.

| Boundary | Inspected implementation |
| --- | --- |
| Discoverability and opt-in | `app/app.js` registers the screen definition and the definition creates its hidden section. The rail is controlled by `features.playerCapture`, which is wired and defaults off. Its metadata says `SPEC-10 / CDJ-04`, `Proposed`; no roadmap milestone or release is invented. |
| Default registry behavior | Existing flags are unchanged. The metadata test adds one explicit player exception while retaining the original FS/M assertions for every older flag. The default-off assertion explicitly covers the new flag; Fleet remains default off. |
| Native availability | Both the button state and `begin()` enforce native availability. Browser mode shows the setup guidance without initiating capture. There is no automatic capture on mounting, navigation or flag activation. |
| Inputs | The screen uses the top-bar device and shared single-pair selection. Duration must be finite and within 1..30 seconds. Empty optional pitch stays null; a provided nonfinite pitch is rejected. Text assertions are still normalized by the existing evidence constructor. Processing selections use its exact `unknown`/`enabled`/`disabled` values. |
| Request identity | Device, operator fields and a copied pair array are supplied before awaiting acquisition. A unique request object and abort signal guard subsequent phase/error/result handling. Later form or global-selection changes cannot rewrite the controller's request snapshot. |
| Busy and cancellation | A current request prevents another start. Cancellation aborts that request and discards displayed details; controls remain busy until its acquisition promise settles. The code never calls global preemption or stops another feature's lease. |
| Late completion | A phase or result is accepted only while its request remains current, not aborted, visible and undisposed. Hide sets visibility false before abort; a later completion cannot restore metadata or enable export. |
| Disposal | Disposal aborts/discards, removes the settings subscription and dispatches the existing pair-picker disposal event. Later callbacks fail the same active-request guard. |
| Export and retention | Only `{ acquisition: captured.acquisition, record: captured.record }` is retained as a result. The full return object and `captured.audio` are not stored. Export explicitly serializes those two metadata objects and is guarded against hidden, disposed, busy or empty state. Clear/hide discard captured result metadata; entered form values may remain. No secure-memory-erasure claim is made. |
| User-provided text | Model/device/error/reason text uses `textContent` or `h` text nodes. The new HTML insertion is only the existing static plug icon. The export explanation explicitly includes entered values, device names and driver messages; it does not promise redaction. |
| Presentation | Requested versus reported device/pair/duration are separate. A requested pair is identified only by its first channel, without assuming stereo. Nominal versus measured rate, unknown backend/gain and unavailable counters remain distinct. Counter status is never labeled PASS or a verified pitch result. |

The CSS is scoped to the player section and `pc-` classes, reuses shared theme
variables, wraps actions/metadata and explicitly restores `display:none` when
the grid section is hidden. Source inspection does not establish rendered
layout, keyboard usability or screen-reader behavior; those require execution.

The shell sends active-screen feature disablement through `onHide`. The owned
acquisition controller already snapshots operator requests, keeps requested and
native-observed fields distinct, handles its own cancellation/preemption/loss,
and returns frozen metadata separately from mutable ephemeral audio. Its record
is always unverified, report-ineligible and without a measurement. The new UI
does not replace those fields, manufacture raw-evidence references, save a run,
call SQLite/history/report adapters, infer a frequency or calculate a verdict.
A native counter observation does not establish physical continuity or CDJ
accuracy. The screen's banner, result explanation and export text preserve that
scope rather than presenting the existing calculation helper as a measured
production result.

### New lifecycle assertions inspected

I also read `tests/player-capture-screen.test.mjs` at the functional lane's
checkpoint `d785e706a354512e4cd9c8855c868f600de07a78`. That commit adds only this
test file; the production bytes remain those of `aabcd886`. Its fixtures call
the actual screen handlers, acquisition controller and `payloadToAudio` adapter,
with modeled DOM/native boundaries, a controlled wait and deterministic
clock/UUID providers. This exercises the integration rather than merely
reimplementing a separate UI state machine.

The assertions cover a direct browser-mode start handler, duration refusal,
requested/observed provenance, metadata-only export and unqualified records,
missing native fields, fault counters, request snapshots, cancellation and late
startup/results. Actual shell navigation and feature disablement drive `onHide`;
the expected abort and unavailable export are checked. Additional assertions
cover preemption, loss, busy startup, clear/dispose, and the production native
detector plus shared pair picker with a seeded input cache. The captures still
come from synthetic native fixtures: these are not physical sessions or rendered
browser evidence. This lane inspected the tests as source and did not execute
them or adopt another worker's pass count.

### Documentation follow-up resolved by root

At the production freeze, the dated implementation note in
[SPEC-10](../SPEC-10-CDJ-media-player-diagnostics.md) still said no production
player UI consumed the acquisition API. I flagged that stale status. Root
corrected it in `dbb4f033fa88489df0d69739143004f015527711`, a documentation-only
successor which I then inspected. It describes the default-off capture preview,
pending source/runtime acceptance, result-metadata clearing versus retained
operator form values, and the unfinished measurement, raw/reference retention,
persistence, reporting and scientific/physical gates. It invents no new roadmap
milestone. I independently compared the rest of the specification from its
original Date line onward: the proposed workflow and acceptance requirements
are byte-for-byte unchanged. The documentation follow-up is resolved without
changing the reviewed production source.

## Methods and limits

Methods were source/Git reads, byte/hash comparison and assertion inspection. No application,
test, generator, benchmark, native build, scanner, probe or vulnerability
reproduction was executed. No external mutation was performed. Source-only reads
of the 22 usage tests and changed feature assertions are not passing test runs.
The functional worker's new UI cases, actual Node execution and full-source
qualification are separate evidence and are not borrowed into this report.
The previously retained audio-quality full-suite failure is not cleared by this
static review or by its successful narrow rerun. The fixed Fleet diagnostic,
redaction #69 residual scope, thresholds, physical qualification and release
restrictions remain unchanged. Only this audit report is authored here. Rebind
the source acceptance if runtime/contract bytes change after this freeze.
