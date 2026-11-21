# Player reference-file identity — initial defensive source audit

Reviewer: `/root/reference_security_round1`. Date: 20 November 2026,
America/Los_Angeles. This distinct round began after all three fresh player
capture workers completed. Only this report is authored by this lane.

## Disposition and method

**Accepted for the bounded defensive source scope at
`447019568d6a0cc0ce0fe16412e9ac99c204f604`, tree
`81807e58e03c6dd51740ef469e2c2450b20d5784`.** One concrete picker-retention
finding in the initial source was reported, corrected by root and independently
verified in source below. No further blocking defensive finding was identified.
PDF numerical completeness and actual runtime results remain assigned to the
coordinated code and functional lanes.

Methods were source/Git inspection, static data-flow review, JSON/TAP reading,
and byte/hash comparisons. No application, test, browser, native build, package
audit, generator, scanner, exploit, vulnerability reproduction, adversarial
probe or benchmark was executed. There were no remote mutations. The Security
and Hardening skill informed the boundary review without expanding this lane's
source-only assignment.

I read the [implementation contract](PLAYER_REFERENCE_IMPLEMENTATION_2026-11-20.md)
and completed prior [code](PLAYER_CAPTURE_CODE_ACCEPTANCE_2026-11-20.md),
[functional](PLAYER_CAPTURE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md), and
[defensive](PLAYER_CAPTURE_SECURITY_ACCEPTANCE_2026-11-20.md) handoffs.
Those earlier acceptances remain bound to their earlier source.

## Source binding

| Role | Commit | Tree |
| --- | --- | --- |
| Previous accepted player capture source | `f081881d4979e4385f255163660258784e27a264` | `39d4351da05fc1fc65f555874824555d96df5cd3` |
| Assigned initial reference/PDF combination | `e280dac39b435d2ce8175b558c71a69d1a3e5182` | `c6262fad09442916170c432211a671db7ec54aa7` |
| Prepared PDF candidate | `5cc916eefbeb3e174edf9bdbcd6c731d6776e56d` | `f0c06c626acc477a2191f23653b7d42a37cbba8b` |
| Reviewed picker fix plus rounded-span correction | `447019568d6a0cc0ce0fe16412e9ac99c204f604` | `81807e58e03c6dd51740ef469e2c2450b20d5784` |

The worktree began clean at the assigned source, then fast-forwarded cleanly
to the coordinated correction. Only the player screen and PDF helper changed
between those sources. Against `f081881`, runtime changes are the new reference
helper and modifications to the player screen/style and PDF helper; the
prepared candidate also adds a PDF regression.

The following working-file bytes independently match immutable corrected-source
blobs and these SHA-256 hashes:

| Path | SHA-256 |
| --- | --- |
| `app/player/reference-file.js` | `d20d1f245e3c446d4e1641fee8503d1e50a3fa4620c238395ae4623e936e6889` |
| `app/ui/screens/player-capture.js` | `2bcec279d3099217570d66ee81006e30b414647e77b07651b21448e21ae7af3e` |
| `app/styles/player-capture.css` | `69c19c4e58fc5853d257c80a6ba2b6681b278ccdf339c305dba9fb8de496e2cc` |
| `app/report-pdf.js` | `84a269d9fc4e6dff067c25006fa4805ffb8ae30e434919d5d2010f1b21bc69a2` |
| `tests/report-pdf.test.mjs` | `8f0bd4148fa5d13073163e274b85ed00468b44e5981d31c52b8eab55c18948f3` |

Native source/capabilities, database, workflows, package manifests, feature
registry, app registration, SHA helper, acquisition/evidence constructor, DOM
download helper and shell are unchanged from `f081881`. They are inspected
dependencies, not new hardening credited to this feature.

## Resolved finding: refused picker delivery retained a DOM File reference

At initial `e280dac`, the input change handler passed its selected File into
`chooseReference`. That function returned for a hidden, disposed, capture-busy
or reference-busy owner before clearing the input value. A picker delivery
arriving after earlier hide/disposal cleanup could therefore leave its newly
delivered File in the input's FileList even though the selection was refused.
The read/hash/export path was not entered. This is a bounded retention/lifecycle
contract defect, not an established external exposure, permission bypass or
physical-browser observation.

Root's `4470195` snapshots the event's File, clears `event.target.value`, then
calls `chooseReference`. I inspected that ordering and its surrounding guards.
Every delivered change clears the input before an inactive/busy owner can
return, while an accepted request retains its local snapshot for the read.
Normal selection, clear/hide/disposal and capture ownership retain their guards.
The functional worker separately owns the ordinary lifecycle regression; this
lane did not run it.

## Selected-file read and resource boundary

The [reference helper](../../app/player/reference-file.js) snapshots name and
size before awaiting. It requires a nonempty safe integer length no greater
than 32 MiB, a nonblank name of at most 240 UTF-16 code units without C0/DEL
controls, and a byte-read method. After reading, it requires an ArrayBuffer
with exactly the declared length and rechecks the upper bound. It does not
open a supplied path or URL, traverse directories, request a native file
capability, or decode or execute selected contents.

The cap bounds one accepted file read, not total process memory. The existing
[SHA-256 helper](../../app/sha256.js) uses Web Crypto when available and its
existing pure-JavaScript fallback otherwise; that fallback allocates a padded
buffer. No network or package dependency is added. This review does not measure
peak memory, throughput or UI responsiveness. One request is allowed per screen
owner; the standalone helper is not a global concurrency limiter or complete
arbitrary-object validator.

The chooser's audio filter is convenience, not content validation. Hashing
establishes neither audio format nor tone frequency. UI guidance and the
contract preserve this distinction. SHA-256 identifies selected bytes, without
authenticating the file, attesting playback or characterizing a measurement chain.

Cancellation is checked before reading, after reading and after hashing. The
screen separately gates publication by request identity, abort state, visibility
and disposal. The File read and an already running hash are not physically
interrupted. A cancelled request stays busy until its promise settles, preventing
another accepted selection or capture start. No timeout, secure erasure or
host-policy change is claimed.

## Ownership, provenance and export

I inspected the [actual screen](../../app/ui/screens/player-capture.js), its
unchanged [shell](../../app/ui/shell.js), [feature registry](../../app/features.js),
[acquisition controller](../../app/player/acquisition.js), and
[evidence constructor](../../app/player/evidence-record.js).

| Boundary | Source conclusion |
| --- | --- |
| Activation | Player capture remains default off. Route creation, navigation and opt-in read no file. An explicit input change starts selection. Browser mode may hash a selected file; capture independently requires native availability. |
| Mutual exclusion | `chooseReference` refuses another reference request or capture, hidden/disposed state. `begin` refuses an active reference request in addition to existing capture/native guards. Disabled controls supplement those handler checks. |
| Cancellation and late result | Clear, Escape, hide and disposal abort the reference owner. `referenceActive` requires matching identity, unaborted signal, visible screen and undisposed owner before publishing descriptor or error. Reopening cannot reactivate an aborted request. |
| Previous capture result | Selecting or clearing a reference discards previous capture details and disables export. A new selection cannot silently relabel an earlier capture's reference. |
| Capture snapshot | The completed immutable descriptor is snapshotted before acquisition. Its digest feeds the existing record hash field, with operator label or filename fallback. That same descriptor accompanies the capture metadata. |
| Export | Explicit JSON contains acquisition, record and `selectedReference`, which is null without selection. The generated run UUID still supplies the filename. No File, ArrayBuffer, waveform, native path or full capture return object is retained in export state. |
| Qualification | The existing constructor still yields `unverified`, `eligibleForReport: false`, `measurement: null`, unknown analysis and empty raw-evidence references. Filling a hash removes only a missing-field reason, not the independent-validation requirement. |

The frozen new descriptor contains only primitive metadata, selected-file hash
basis and explicitly unverified playback identity. Record source fields remain
declared provenance under the unchanged constructor. Export editing cannot turn
these fields into an independently validated scientific attestation.

File identity uses `textContent` or the shared text-node helper. The screen's
only HTML insertion remains a static icon. Filename/hash are not used as HTML,
a command, a database query or an export path. The unchanged
[download helper](../../app/ui/dom.js) creates a local Blob URL, uses the generated
download name, and schedules URL revocation. There is no new upload, History
save, report registration, database write or telemetry path.

Metadata can identify the chosen file and contain operator/device names or
driver messages. The export explanation includes filename and hash; metadata-only
is not redacted or PII-free. Hide/disposal clears result and reference state;
operator form values, existing feature/pair settings, previous downloads and
transient memory are separate. `bytesRetained: false` describes returned
metadata/state, not forensic memory erasure.

## PDF chart boundary

The prepared candidate changes exactly the PDF helper and its test against main
`099c99c`. Its checks reject invalid intermediate axis calculations before
rendering. The coordinated correction adds a finite positive check for rounded
span `hi - lo`; finite endpoints alone do not establish a finite span.

The unchanged `chartsHtml` catches chart calculation errors, records a chart
warning and emits a visible unavailable-chart placeholder. The placeholder
title is escaped. SVG title, axis and legend labels also use the existing escape
function; the warning array is returned as data. No new printing capability,
persistence or external service is introduced.

I asked the code lane to examine tick rounding and projection. Its static
response correctly notes that twelve-digit rounding of the largest finite
binary64 value is downward, so my speculative rounded-tick overflow route is
not a finding. No numerical code was executed by this lane. Rejection of
unrepresentable axes is not a claim of general extreme-axis plotting accuracy;
numerical/functional disposition belongs to those assigned lanes. The original
extracted-V8 author harness, actual Node regression, rendered print output and
native PDF output remain separate evidence categories.

## Evidence and remaining gates

The three completed prior reports match their unchanged initial blobs. The
retained prior full TAP matches its 534,094-byte length, SHA-256
`253caf6728565590e5f7ffab76287776a6cedcecbba3ffe8ecb88fcb9c423bc1`, counts and
source identity in its [metadata](evidence/player-capture-acceptance-2026-11-20/full-suite.json).
That **2,332 total / 2,331 pass / zero fail / one optional skip** run belongs to
`f081881`; it did not execute this reference feature or PDF correction.
Unrelated historical map inventories were not repeated to inflate this audit.

The original failed audio TAP retains 530,581 bytes and SHA-256
`39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197`.
Issue #72 remains unresolved. The three-file diagnostic did not establish the
original full-suite predecessor order, and later passes establish no cause or
audio repair. The local Chromium socket-EPERM attempt preceded page/module
execution; this lane made no retry or screenshot/rendered/download claim.

The complete [Spec 10](../SPEC-10-CDJ-media-player-diagnostics.md) and
[Spec 02 diagnostics requirement](../specs/02-diagnostics-bundle.md) files match
`f081881`. Issue #69 remains open and AC-6 is unchanged. Original Fleet timing
evidence, fixed diagnostic head and default-off state remain untouched.
Retained raw/reference bytes, pitch analysis, persistence/report wiring,
scientific characterization and physical validation remain unfinished.

This feature needs its own exact-source functional acceptance and hosted
rendered/native/platform gates. Syntax parsing or modeled DOM tests do not
qualify a browser or hardware. Root owns consolidation/publication and the
fresh-worker handoff. Rebind this report if relevant production bytes change.
