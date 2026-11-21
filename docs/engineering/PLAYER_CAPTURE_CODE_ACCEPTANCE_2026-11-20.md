# Player capture and usage ledger — fresh code/spec acceptance

Reviewer: `/root/player_code_fresh`. Date: 20 November 2026,
America/Los_Angeles. This independent lane started after the three initial
player workers completed, using their [fixed handoff](PLAYER_CAPTURE_INITIAL_HANDOFF_2026-11-20.md).

## Disposition

**Accepted for the bounded static code/spec scope at
`f081881d4979e4385f255163660258784e27a264`, tree
`39d4351da05fc1fc65f555874824555d96df5cd3`. No new production-code blocker
identified.** The default-off capture preview preserves the owned capture and
provisional metadata contract. The usage-ledger correction remains the exact
two-file candidate reviewed below.

Two qualifications must accompany this acceptance. The retained 33-test audio
diagnostic is a three-file selection; its output does not establish the original
full-suite predecessor order. The usage source-membership repair does not add a
complete string/type schema. Neither qualification justifies a speculative
production patch. The earlier audio failure remains unresolved.

This lane performed source/Git inspection, JSON/TAP reading, and independent
byte/hash comparisons only. It ran no application, project tests, browser,
generator, native build, benchmark, scanner, probe or vulnerability reproduction.
Fresh functional execution belongs to the separately assigned functional worker.
There were no remote actions and no changes outside this report.

## Exact source binding

| Role | Commit | Tree |
| --- | --- | --- |
| Assigned combined freeze | `f081881d4979e4385f255163660258784e27a264` | `39d4351da05fc1fc65f555874824555d96df5cd3` |
| Durable equivalent supplied by root | `6295c3eb5b470b34f2a1010b040b1694780e0ee9` | `39d4351da05fc1fc65f555874824555d96df5cd3` |
| Production implementation | `aabcd886667ed4116fecb725c532eabcc7d485d6` | `ed86cf0d14508d4c9e42c84bf0c79e7f01e523fe` |
| Final maintained tests/tools | `2cb1aec7b1bdd4169b08aed57689eb7e937173c3` | `816bf89effa0b238d1620beec7aaf8c6ec51d27a` |
| Initial focused Node execution | `d785e706a354512e4cd9c8855c868f600de07a78` | `4ebca0206138fefa528a8da1db89edbc02076afd` |
| Usage-ledger candidate #70 | `b8dfc126c2480f303df105abd3759fedae49a192` | `a0660644f2e7d996817f0c76a004be95b37d3317` |

I compared complete Git entries, including mode, type and object ID. Against
the production implementation, the combined freeze differs outside `docs/`
only by the added `tests/player-capture-screen.test.mjs` and
`tools/smoke/player-capture.mjs`. All maintained `tests/` and `tools/` entries
match `2cb1aec`; all `tests/` entries also match executed `d785e706`.
The final smoke's only change after launch-attempt source `09f6e5db` combines
its dependent mock initializers into one ordered init script.

The runtime therefore still matches `aabcd886`, including native code,
permissions, migrations, dependencies, workflows and capture ownership. The
usage candidate changes exactly the helper and its test against main
`099c99c055322ef668be23e6ae50a2968614cc6d`; those two Git entries match the
combined freeze. I also inspected the locally available durable commit:
`6295c3eb` has the same complete tree as the assigned freeze and ordered parents
`0a5d485eb29b43f249a8764992931cbc15d84e9b` and
`b8dfc126c2480f303df105abd3759fedae49a192`. Publication/readback itself remains
root's action, not an action performed by this lane.

The working tree was clean on entry. These working-file hashes also match their
immutable assigned-source blobs:

| Path | SHA-256 |
| --- | --- |
| `app/ui/screens/player-capture.js` | `a549b3435a07eeaa4b829c6a71def9fb497fcec3407b2b285ec830235f03ccfe` |
| `app/usage-hours.js` | `cb190804c3a59399d473190abeb6fe4dfc90eaca053a82e909677db910b55e92` |
| `tests/usage-hours.test.mjs` | `55c7f2f08b5d1be7a7faf3f59ee2eda84d89893fb6e6f3961f79f3120b771ed6` |
| `tests/player-capture-screen.test.mjs` | `09081d4c7ba952dc12304db67e1dd684ce0b52f855256aec6e6dbccac956a886` |
| `tools/smoke/player-capture.mjs` | `b8c9ce2ec6941d819be0ba4d94d77d7d6ee9cdfe4d6222d3796e2dcfb3e25b9d` |

## Player implementation and actual integration

I read the complete [screen](../../app/ui/screens/player-capture.js), its
[entry point](../../app/app.js), [feature registry](../../app/features.js),
[stylesheet](../../app/styles/player-capture.css), public
[experimental controls](../../app/ui/screens/experimental.js),
[shell lifecycle](../../app/ui/shell.js), and the production
[pair picker](../../app/ui/pair-picker.js),
[live adapter](../../app/ui/audio-io.js),
[acquisition controller](../../app/player/acquisition.js) and
[evidence constructor](../../app/player/evidence-record.js).

| Boundary | Independent source conclusion |
| --- | --- |
| Public route and default | The entry point registers a hidden player section. The feature is wired, defaults off, and is described as `SPEC-10 / CDJ-04`, `Proposed`. The existing public Experimental features panel exposes it. The shell omits its rail item and redirects attempts to navigate to a disabled feature. Registration and opt-in start no capture. |
| Native availability | Both button state and the actual start handler check native availability. A direct browser-mode handler invocation cannot acquire audio. The production detector checks the existing Tauri invocation function. |
| Input contract | Duration must be finite and within 1–30 seconds. Blank pitch remains null; supplied pitch must be finite. The shared top-bar device and single-pair picker feed the existing controller. Processing values are the evidence contract's `unknown`, `enabled`, and `disabled`. |
| Request snapshot | The screen snapshots device and operator strings before awaiting, copies the selected pair array, and creates a distinct request/AbortController. Acquisition independently normalizes operator assertions and freezes the requested descriptor before awaiting capture. |
| Ownership and cancellation | A current request prevents another start. Cancel aborts that request and discards result metadata while busy state remains until settlement. The unchanged acquisition/live adapter releases its own session and lease, including late startup, loss and preemption. The new screen invokes no global preemption. |
| Navigation and flag-off | Hide marks the screen invisible before abort/discard. The real shell calls hide when leaving the active screen, including feature disablement. Escape cancels the active request. |
| Late completion and disposal | Phase/result handling requires matching current identity, an unaborted signal, visibility and an undisposed screen. Hide/show cannot make an old request active again. Dispose aborts, discards, unsubscribes from settings, and sends the existing pair-picker disposal event. |
| Result and export | Screen result state selects only `{ acquisition, record }`; it never retains the full capture return object or its audio field. Export explicitly serializes those two objects and refuses hidden, disposed, busy or empty state. The generated run UUID supplies the filename. |
| Display and local text | Requested and reported device, pair and duration remain separate. Requested pair wording identifies its starting input without asserting stereo. Nominal rate is labeled nominal; measured rate says Not measured. Unknown backend/gain/counters stay unknown. Variable text uses text nodes; the HTML insertion is a static icon. |

The controller derives observations from the adapter's preserved native-field
presence/validity, not compatibility defaults or requested values. It freezes
the acquisition and record recursively while returning audio separately as
ephemeral data. Records remain `unverified`, `eligibleForReport: false`, with
`measurement: null` and empty raw-evidence references. Report eligibility cannot
be conferred by filled operator fields or successful input counters.

The screen performs no frequency/pitch analysis, PASS verdict, saved diagnostic
run, History write or report registration. It adds no native command or
permission. Its explanation accurately distinguishes observed input counters
from proven hardware continuity. The metadata download can include entered
names, device labels and driver text; metadata-only is not redacted or PII-free.
Clear/hide drops captured-result references, while operator form values can
remain in the registered DOM. No secure-memory-erasure claim follows.

The scoped CSS includes explicit hidden-section handling and wrapping/grid
rules. Source inspection cannot qualify actual layout, focus interaction,
accessibility, download behavior or hardware capture.

## Usage-ledger correction and residual contract

I inspected the exact [helper](../../app/usage-hours.js) and candidate diff,
the new [assertions](../../tests/usage-hours.test.mjs), actual
[stylus adapters](../../app/stylus-wear.js),
[Stylus screen](../../app/ui/screens/stylus.js),
[health-card reader](../../app/ui/crosslinks.js), native
[usage boundary](../../src-tauri/src/usage.rs), native
[capture-session rows](../../src-tauri/src/db.rs) and
[ledger migration](../../database/migrations/0006_asset_usage.sql).

Own-property membership is checked at row normalization, proposal source
selection and explicit bridge input validation. Inherited property names are
excluded from the four-source map. Valid source priorities, integer-millisecond
overlap handling, 12/24-hour limits, confirmation policy, kinds and native
command names remain unchanged.

The proposer records a non-null/non-undefined session ID only after creating a
valid proposal. A malformed earlier duration does not consume the ID for a
later valid row; the first valid repeated ID wins within that invocation.
The existing-entry filter drops null, undefined and empty-string identifiers
while preserving numeric zero. The change preserves JavaScript Set identity
semantics; it does not merge repeated spans or normalize arbitrary identifiers.
No database asset/session unique constraint or cross-call/concurrent
idempotency was introduced.

### Qualification: membership is not a complete string schema

`Object.hasOwn(SOURCE_PRIORITY, source)` still performs JavaScript property-key
coercion. The old indexed lookup did so as well. The patch neither adds a
`typeof source === 'string'` requirement nor normalizes the accepted value to a
string. Consequently, the initial code report's wording about unsupported
sources must be read as excluding unrecognized/inherited source-name keys,
not as rejecting every malformed non-string object. No arbitrary-object probe
was executed and no speculative guard was added.

The inspected production callers supply the narrower contract: capture
proposals overwrite source with literal `deckchek`; log proposals construct
literal `djlog` and clear synthetic session IDs before writing; manual entry
uses literal `manual`. Ledger reads deserialize `UsageEntry.source` as Rust
`String`. Native `UsageAddInput` separately requires `String` source and
`Option<String>` session ID, checks exact source membership and referenced
asset/session existence, and uses parameterized SQL. Native capture-session
IDs are also `String`. These paths do not demonstrate reachability of a
coercible non-string source or a native validation bypass.

Numeric-zero coverage therefore establishes pure-helper behavior; it does not
qualify numeric IDs for native persistence. No affected stored-user ledger is
demonstrated by the review. The two new tests substantiate the intended
same-batch duplicate/zero/invalid-earlier cases and inherited-name checks,
including refusal before a modeled invocation. They do not establish a
complete malformed-input schema.

## Maintained tests and smoke inspected as source

The 16 new [screen cases](../../tests/player-capture-screen.test.mjs) call the
actual screen handlers and usually the actual acquisition controller and
`payloadToAudio`, with modeled DOM/native data and controlled timing/identity.
They cover provenance, provisional metadata export, missing observations,
faults, snapshots, cancellation, late startup/result delivery, real shell
navigation/feature-off, loss/preemption, busy input, clear and disposal. One
case uses real native detection and the real shared picker with a seeded cache.
The feature assertions retain the previous exact flag inventory/metadata rules
and add an explicit proposed-player exception/default-off assertion.

The [browser smoke](../../tools/smoke/player-capture.mjs) uses public Options
controls, real screen/controller/live adapter, a modeled Tauri boundary and a
real Blob download when executable. It authors default-off/native-unavailable,
names/target sizes, mobile overflow, screenshots, capture provenance,
cancellation/navigation/disable, no-History and Fleet-off checks. The unchanged
runner discovers modules, then launches Chromium before importing/running
their bodies. These source assertions are not execution results from this lane.

## Independent retained-evidence verification

I read all three initial reports and matched each to its recorded author commit
and SHA-256: [code](PLAYER_CAPTURE_CODE_AUDIT_2026-11-20.md),
[security](PLAYER_CAPTURE_SECURITY_AUDIT_2026-11-20.md), and
[functional](PLAYER_CAPTURE_FUNCTIONAL_AUDIT_2026-11-20.md).
I independently verified every one of the 26 entries in the functional
[digest ledger](evidence/player-capture-functional-2026-11-20/SHA256SUMS),
all ten before/after maps against exact Git inventories and blob hashes, all
five source/tree identities, clean boundary records, complete log lengths and
digests, recorded external-input hashes, and actual TAP summaries. This hashed
1,786 distinct Git blobs. No project code ran during those comparisons.

The following remain executions attributed to the initial functional worker:

| Selection/source | Retained result | Equal tracked-map entries |
| --- | --- | --- |
| Audio diagnostic copy, `3d0667bb` | 15/15 pass, exit 0; 3,956-byte TAP | 1,853 |
| Three-file audio diagnostic selection, `3d0667bb` | 33/33 pass, exit 0; 7,228-byte TAP | 1,853 |
| Exact usage candidate, `b8dfc126` | 22/22 pass, exit 0; 4,072-byte TAP | 1,655 |
| Focused player/features/acquisition/envelope/usage, `d785e706` | 77/77 pass, exit 0; 16,678-byte TAP | 1,856 |
| Chromium launch attempt, `09f6e5db` | Exit 1; 7,515-byte log; no flow summary or screenshots | 1,857 |

The four TAP selections record Node v24.22.3, no timeout, and zero failures,
cancellations, skips or TODOs. Their overlapping counts must not be added.
The 77/77 selection includes the usage tests; the independent 22/22 run is
candidate-specific evidence rather than additional combined-source cases.

### Qualification: the 33-test selection did not establish predecessor order

The [33-test TAP](evidence/player-capture-functional-2026-11-20/audio-prefix-context/run.tap)
lists the 15 audio-quality subtests first, followed by six app-state and twelve
audio-out subtests. Its recorded argv lists app-state and audio-out before the
external diagnostic file, but argument listing alone does not establish that
execution occurred in that order. The initial functional report's “original
full-suite prefix” label therefore must not imply a reproduced predecessor
context. Treat it as one bounded three-file diagnostic selection. Root was
notified and accepted this clarification for subsequent handoff/issue wording.

The retained diagnostic copy differs from the original audio test only by its
absolute import of the same production module and one context log before the
original assertion. No assertion or production audio byte was weakened. The
two passing diagnostic selections establish no cause or repair of the earlier
full-suite failure.

The complete [browser log](evidence/player-capture-functional-2026-11-20/player-smoke/ui-smoke.log)
shows Chromium's socket EPERM at launch, before a page or smoke body executed.
Its metadata records zero screenshots. This is neither a rendered pass nor an
application-failure diagnosis. At final `2cb1aec`, the author records a Node
syntax check only in [source binding](evidence/player-capture-functional-2026-11-20/source-binding.json).
The final smoke was not browser-executed. This review made no launch retry,
workaround or new syntax execution.

## Prior qualification and requirements remain intact

I independently verified the retained original Node v24.22.3
[full failure](evidence/redaction-acceptance-2026-11-20/full-suite.tap):
530,581 bytes, SHA-256
`39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197`,
2,314 total / 2,312 pass / one fail / one skip, with the cubic THD assertion
`16972224339301138 vs 4.347826086956522`. The separate original 15/15
[narrow rerun](evidence/redaction-acceptance-2026-11-20/audio-quality-rerun/audio-quality-rerun.tap)
also retains its original 3,356-byte length and SHA-256
`c8ee666590df3f24c0bb0eff784e71e0305b1247b4d1dac90d233c213847b06e`.
Issue #72 remains unresolved. No JIT, scheduler, hardware, redaction or Fleet
cause is inferred.

The earlier PR #71 hosted result is separate. I verified the compressed and
decoded [complete JS log](evidence/player-capture-integration-2026-11-20/pr71-javascript-complete.log.gz)
against both digests/lengths in its
[observation](evidence/player-capture-integration-2026-11-20/pr71-javascript-observation.json),
including Node v22.23.5, 2,314 total / 2,313 pass / zero fail / one skip and its
passing cubic assertion. Local immutable Git objects confirm tested merge
`cef7ef6961816ef796ced5450d781c5d37b923ba` has ordered parents main `099c99c`
and published `0a5d485e`, with tree `3ccdec9c3c7dce2827009ae5206603248122b63e`.
Root separately reported the standard CI green at that earlier PR source.
Those gates do not qualify the later player UI or explain the Node 24 failure.

[SPEC-10](../SPEC-10-CDJ-media-player-diagnostics.md) accurately records the
default-off capture preview and still-open raw/reference retention,
pitch-measurement integration, persistence/reporting and scientific/physical
gates. I compared its original Date line and all subsequent requirements with
the assigned consolidation base: they are byte-identical. The prior Spec 02
status note is retained, and the original
[AC-6 requirement](../specs/02-diagnostics-bundle.md) is unchanged. Issue #69
remains open for its raw/bare/ambiguous-text residual scope.

The [Fleet diagnostic](FLEET_GATE_HOSTED_RESULT_2026-11-20.md) retains its fixed
head `69fc06eb471dfb00de544bbe233c0f5dc95402e8`, the original 201.565999 ms
failure and later 213.308243 ms failure against the unchanged 200 ms gate.
Fleet remains default-off. This lane neither changes nor reruns that diagnostic.

This source acceptance does not authorize release qualification by implication.
Fresh functional results, exact-source hosted/rendered/native gates, hardware
and scientific evidence remain separately attributed. Rebind the acceptance
if runtime bytes or the provisional contract change. Only this report is
authored by this lane.
