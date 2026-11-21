# Reference-file identity and PDF axes — fresh defensive acceptance

Reviewer: `/root/reference_security_fresh`. Date: 20 November 2026,
America/Los_Angeles. This lane began after all three initial workers completed.
Only this report is authored by this lane.

## Disposition and scope

**Accepted for the bounded defensive source scope at
`ded34d2dccfcf0ae51c78fa1492a57c161d32a1d`, tree
`9030b4d9eeb307f27c0d794dccf4a37895c2a602`. No new blocking defensive finding
was identified.** The initial picker-retention correction is present and the
actual consumer preserves its stated data and ownership boundaries.

This does not clear complete functional qualification. Root reported audio
failures during the separate fresh full-suite invocation while this review was
being completed. Its final source-bound result and gate disposition belong to
the functional lane/root. No common cause, ownership/security defect or repair
is inferred from that report, and no audio code or test was changed here.

I read the [initial handoff](PLAYER_REFERENCE_INITIAL_HANDOFF_2026-11-20.md),
[contract](PLAYER_REFERENCE_IMPLEMENTATION_2026-11-20.md), and completed
[code](PLAYER_REFERENCE_CODE_AUDIT_2026-11-20.md),
[functional](PLAYER_REFERENCE_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](PLAYER_REFERENCE_SECURITY_AUDIT_2026-11-20.md) reports, then inspected
the source independently. The Security and Hardening skill informed this review.
Methods were Git/source reading, lifecycle/data-flow reasoning, retained JSON/
TAP inspection and byte/hash comparisons. No application, extracted project
code, test, browser, native build, dependency audit, scanner, exploit,
vulnerability reproduction, adversarial probe or benchmark ran in this lane.
No remote mutation was performed.

## Immutable source binding

The checkout began clean at the assigned commit/tree. Production paths match
corrected `447019568d6a0cc0ce0fe16412e9ac99c204f604`, tree
`81807e58e03c6dd51740ef469e2c2450b20d5784`. Tests/tools match
`dd11f41dc41e102ddd8bf7f34e87153afa994f59`, tree
`d6272a78da9791fc40cb0cdeff238cb68d979c5f`.

I also verified locally that durable equivalent
`b8bf6ea10791b05a2188d176ae8b996528a10f08` has the same complete `9030b4d9`
tree and ordered parents `78403038c530a981b732d5ac0210539edf37fc77` and
`5cc916eefbeb3e174edf9bdbcd6c731d6776e56d`. Root owns its publication/ref readback;
this lane made no remote mutation.

Against prior player freeze `f081881d4979e4385f255163660258784e27a264`, the
runtime diff is exactly the following four paths. Each current file matches
its immutable corrected-source blob and independently computed SHA-256:

| Path | SHA-256 |
| --- | --- |
| `app/player/reference-file.js` | `d20d1f245e3c446d4e1641fee8503d1e50a3fa4620c238395ae4623e936e6889` |
| `app/ui/screens/player-capture.js` | `2bcec279d3099217570d66ee81006e30b414647e77b07651b21448e21ae7af3e` |
| `app/styles/player-capture.css` | `69c19c4e58fc5853d257c80a6ba2b6681b278ccdf339c305dba9fb8de496e2cc` |
| `app/report-pdf.js` | `84a269d9fc4e6dff067c25006fa4805ffb8ae30e434919d5d2010f1b21bc69a2` |

Native source/capabilities, database, workflows and manifests are unchanged.
The existing hash helper, acquisition/evidence constructor, feature registry,
shell and DOM/download helper are inspected dependencies, not new hardening
credited to this feature. Their relevant immutable blobs also match.

## Selected-file boundary and ownership

The assets reviewed are selected-file contents/identity, capture ownership,
provisional metadata and operator control of export. The boundaries are the
browser File input, asynchronous read/hash, screen lifecycle, acquisition
normalization and JSON/DOM output.

The [helper](../../app/player/reference-file.js) snapshots filename and size
before awaiting. It requires a nonempty safe integer length up to 32 MiB, a
nonblank filename bounded to 240 UTF-16 code units without C0/DEL controls, and
a byte reader. The returned ArrayBuffer must match the captured size and bound.
It opens no supplied path or URL, requests no native file capability and does
not decode, execute or play contents. The audio chooser filter is convenience,
not content validation.

The existing [SHA-256 helper](../../app/sha256.js) uses Web Crypto or its
existing JavaScript fallback, with no network or new dependency. The cap bounds
one accepted selected file, not total process memory: File/buffer storage and
the fallback's padded buffer can coexist. The standalone helper is neither a
global concurrency limiter nor a sandbox for arbitrary JavaScript objects.
No resource peak or responsiveness measurement is claimed.

| Actual [screen](../../app/ui/screens/player-capture.js) boundary | Independent source conclusion |
| --- | --- |
| Delivery | The handler snapshots the File and clears the input before calling the lifecycle guard. Hidden/disposed/busy deliveries therefore relinquish the DOM selection even when refused. This verifies the initial correction in source; actual browser FileList behavior remains separate. |
| Single owner | Selection refuses another reference request or active capture. Capture refuses a pending reference request. Both handlers enforce this independently of disabled controls. |
| Cancellation | Clear, Escape, hide and disposal abort publication and clear selected metadata. Busy ownership persists until the original promise settles. The helper checks cancellation before read and after each await. |
| Stale completion | Descriptor/error publication requires task identity, no abort, visibility and an undisposed owner. Reopening cannot reactivate an aborted request; cleanup clears only the matching task. |
| Prior capture | Selecting or clearing a reference discards earlier capture details. A new file cannot relabel an old export. Active capture prevents reference changes. |
| Snapshot | The completed immutable descriptor is captured before acquisition. Its digest feeds the record hash field; operator label precedes filename fallback. The same descriptor accompanies the result. |
| Retention/export | State/JSON explicitly contain acquisition, record and selectedReference, null without a file. They retain no File, ArrayBuffer, waveform or full capture return object. The download name remains based on the generated run UUID. |

Cancellation suppresses publication; it does not physically abort or zeroize an
already running File read/hash. Its local File/buffer can survive until the
pending operation settles. No timeout or process-wide memory guarantee follows.
Operator form values and existing feature/pair settings may remain, and clearing
does not remove earlier downloads. Those limits are distinct from new capture/
reference persistence, which this slice does not add.

The unchanged [acquisition controller](../../app/player/acquisition.js)
normalizes the declared source before awaiting and freezes the record. The
[evidence constructor](../../app/player/evidence-record.js) still yields
`unverified`, `eligibleForReport: false`, and `measurement: null`. A known hash
removes a missing-field reason only. It does not validate audio format, playback,
tone content, scientific reference identity or calibration. Reference version/
frequency, analysis and uncertainty remain unknown; raw references remain empty.
Deserialization rebuilds qualification rather than accepting serialized claims.

## Output and report boundary

Filename, digest, entered fields and errors use text rendering; the screen's
HTML insertion is a static icon. Filename/hash do not become commands, queries,
HTML fragments or download paths. The existing [download helper](../../app/ui/dom.js)
creates a local Blob URL, triggers explicit download and schedules revocation.
No new upload, telemetry, History save, report registration or SQLite write is
added. File identity and operator/device/driver metadata may identify local
context; the export disclosure includes them and makes no PII-free claim.

The [registry](../../app/features.js) keeps Player capture and Fleet off by
default. Browser mode may hash an explicitly selected file, while capture still
checks native availability. The [shell](../../app/ui/shell.js) calls hide on
navigation/disablement. Existing capture leases and one-pair, 1–30-second limits
remain unchanged. No permission or native capability is expanded.

The [PDF source](../../app/report-pdf.js) now checks raw/chosen steps, rounded
bounds and their final difference for representability, with positive step/span.
The initial candidate's missing rounded-span guard is present. Unavailable
charts reach the existing visible fallback with an escaped title; SVG title,
axis and legend labels also use the existing escape function. Warnings are
returned data. No printing capability or external service is added. This source
review does not establish general extreme-axis precision or printed layout;
pre-existing high-offset tick coalescence remains a separate qualification.

## Relevant evidence independently verified

All three initial reports match their exact report commits and digests. The
actual maintained helper/screen/PDF tests and both smokes match `dd11f41` and
preserve metadata-only and unverified/report-ineligible assertions. They add
known-digest, bounded-read, cancellation and rounded X/Y-span cases.

All **24** [evidence ledger](evidence/player-reference-functional-2026-11-20/SHA256SUMS)
entries match their files. For all four invocations I compared before/after maps,
matched complete tracked inventories to their Git trees and checked relevant
source/test hashes against immutable blobs. This is not a new full historical
blob sweep. Recorded counts, bytes/digests, runtime/exit/timeout metadata and
clean source identities agree.

| Retained initial functional execution | Verified observation |
| --- | --- |
| Original PDF candidate `5cc916e` | Node24.22.3, 28/28, exit 0; 1,655 unchanged entries. TAP 5,758 bytes; SHA-256 `3d3fd808003cc8c31e28adf0049538e176a013f89ae06f7eacc6f14213b3b3c5`. |
| Corrected maintained source `dd11f41` | Node24.22.3, 132/132, exit 0; 1,908 unchanged entries. TAP 29,628 bytes; SHA-256 `95abf54baa565c395efb52d761339810e1f69f02eecd180a516190844d7325cc`. |
| Player/PDF smoke syntax, two invocations | Each node --check exit 0, empty output and unchanged source. No TAP counts, page, screenshot or print PDF result. |

These overlapping selections are not additive or substitutes for fresh full
acceptance. They are retained observations by another lane, not executions by
this reviewer. The [evidence README](evidence/player-reference-functional-2026-11-20/README.md)
preserves exact commands and limits. Authored browser FileList/download/print
checks require actual hosted execution; modeled DOM and syntax checks cannot
establish those outcomes.

Original [Spec 10](../SPEC-10-CDJ-media-player-diagnostics.md) requirements from
its dated section are unchanged; the implementation note describes the newer
stage. [Spec 02 AC-6](../specs/02-diagnostics-bundle.md), bounded redaction source/
vectors, original failed-audio evidence and fixed Fleet diagnostic evidence are
byte-unchanged against the prior capture freeze. Issues #69/#72 remain open in
the handoff. Passing observations do not explain or repair the earlier audio
failure. Fleet stays off with its original failure and unchanged threshold.

The separate fresh full-suite outcome remains a qualification gate, as do
hosted UI/print, native/platform and physical/scientific checks. Raw/reference
retention, pitch analysis and History/report integration remain unfinished.
The known local Chromium restriction was not retried or bypassed. No release,
deployment, threshold or permission change is qualified here. Root owns further
integration; rebind this report if relevant production/test bytes change.
