# CDJ-04 acquisition — fresh defensive acceptance, 20 November 2026

Worker: `/root/cdj_acquisition_security_acceptance`. Dates use
America/Los_Angeles; source and execution records retain their original times.

## Disposition and exact source

**Accepted within this independent defensive source-review scope.** All six
requirements in the initial defensive report are satisfied by the frozen
combined source. No additional actionable defensive blocker was identified.
This is acceptance of the acquisition slice, not certification of hardware,
scientific accuracy, persistence, packaging or the complete player workflow.

| Role | Commit / tree |
| --- | --- |
| Frozen combined source reviewed here | `55f7ea2c8759c985bbbd463f374ca2c78d99a669` / `54a86922bfd8cca87c076b755edd0b3432034aee` |
| Final author implementation | `3e7ae2d239686061a5056efb672be4ae135215e1` / `2ef190b0a9a4d94db0ab352ff784dd414c69f322` |
| Preserved published QR predecessor | `562609b4acc8bc24704cc864ef27c0b11c56bc00` / `a2e4f571ac3a9c7d976db911a5fed3f910c3ea26` |

The checkout was clean at the frozen source. The acquisition module and tests
are byte-identical to the final author implementation. Read-only comparison
against the published predecessor shows only those two new runtime/test paths;
the capture bridge, native code, existing evidence/pitch modules, mobile code,
database and workflows are unchanged. The predecessor is a verified ancestor.

The Engineering Suite security-and-hardening guidance informed the boundary
review. The assigned source-only scope took precedence over generic runtime
audit/checklist suggestions. No application code, syntax check, tests,
generator, browser, audio device, native build, scanner or probe was executed.

## Independent review basis

Review read the actual [acquisition controller](../../app/player/acquisition.js)
and [test source](../../tests/cdj-acquisition.test.mjs), then followed its
dependencies through [pair selection](../../app/capture.js),
[`payloadToAudio` and `startLiveSession`](../../app/ui/audio-io.js), the
[native capture implementation](../../src-tauri/src/capture.rs), and the
[provisional evidence normalizer](../../app/player/evidence-record.js).
[SPEC-00 section 5](../SPEC-00-product-architecture.md) and the
[SPEC-10 implementation contract](../SPEC-10-CDJ-media-player-diagnostics.md)
provide the metadata and scientific qualification boundaries.

The [initial defensive report](CDJ04_ACQUISITION_SECURITY_AUDIT_2026-11-20.md),
[code audit](CDJ04_ACQUISITION_CODE_AUDIT_2026-11-20.md), and
[author evidence](CDJ04_ACQUISITION_FUNCTIONAL_AUDIT_2026-11-20.md) were read as
handoff material. Their conclusions and runtime results were not substituted
for this source review or reclassified as this worker's execution.

The protected properties are ownership of the capture lease, faithful
attribution of observations, bounded immutable metadata, and continued
provisional qualification. The injected capture provider is application code
implementing the existing session contract. Structural checks do not
authenticate a replacement JavaScript provider, a driver or a physical device.

## Requirement closure

| Initial requirement | Fresh source conclusion |
| --- | --- |
| **ACQ-S1 — observed provenance** | Closed. Own native-field presence/validity markers precede observed values. Rate and channel count agree with returned audio; primary counts and pair descriptors are checked. The adapter's default rate/channels, duplicated right channel and requested/fallback device label do not fill missing observations. |
| **ACQ-S2 — capture ownership** | Closed. One cancellation controller owns the run. Late starts receive lease-scoped cleanup; pending waits/stops race cancellation, preemption and unexpected loss. Normal stopping is distinguished from premature loss. The returned session is the only cleanup target. |
| **ACQ-S3 — bounded snapshots** | Closed. Requests and normalized assertions are copied before acquisition; returned descriptor/record metadata is copied and deeply frozen. Each diagnostic list copies at most 20 strings, each at most 1,000 UTF-16 code units, with received/omitted/shortened counts. Pair metadata is bounded by the existing maximum. Raw samples stay separate. |
| **ACQ-S4 — integrity meanings** | Closed. Safe nonnegative counters retain native names and units. Missing counters remain unavailable, positive faults remain incomplete, and frame-count disagreement is explicit. Native-counter observation is not labelled proven physical continuity. Requested duration, nominal sample duration and host time remain distinct. |
| **ACQ-S5 — primary-pair scope** | Closed. More than one requested pair is rejected before start. Observed pair indices are checked for range and uniqueness, and mono belongs only to the final odd channel. Unexpected returned multiple pairs remain explicit and unavailable; sample scope stays primary-only. Mode is derived only from one validated matching pair. |
| **ACQ-S6 — qualification and retention** | Closed. Generated run/capture identities and acquired observations populate the result; operator capture/analysis/quality claims do not. The existing normalizer unconditionally leaves the record unverified, report-ineligible and without a measurement. Both raw-reference lists are empty and retention is explicitly ephemeral. |

The original code-review mono-map correction and the later explicit unknown
source-type, gain-staging, phono/line and external-RIAA slots are present in the
reviewed combined bytes. These corrections introduce no scientific threshold
or claim that the absent facts have been measured.

## Ownership and provenance reasoning

The current `startLiveSession` does not consume an AbortSignal, so the runner's
own race and cleanup are necessary. The new code validates the request before
opening, checks pre-abort, tracks the returned session, and releases a session
that resolves after abandonment. Provider, phase, clock and capacity errors
share the same cleanup path. `finally` removes the external listener, aborts
the default duration timer and releases any session still owned by the run.
Late results cannot produce a completed record after cancellation.

The existing bridge closes over its lease ID. Native `stop_live_capture`
passes that ID to `take_session`; a different or absent current session is
rejected rather than stopped. The acquisition controller introduces no global
stop or preempt call. This conclusion relies on the existing provider's
lease-scoped contract; it does not promise prompt termination by a stalled
driver or arbitrary replacement provider.

The actual adapter records native presence/validity before applying
compatibility defaults. The controller consumes those markers and copied
primitive fields, not the convenience fallback labels. The retained native
device text and the evidence normalizer's trimmed display text remain device
labels, not stable OS or physical identity. OS ID and backend stay unknown.

The descriptor's nominal rate is native configuration, not measured clock
accuracy. Sample duration is primary sample count divided by that nominal
rate. Host request/ready/completion times are explicitly separate from a
hardware first-sample timestamp, and a backwards host clock does not create a
negative duration. Measured rate, timebase calibration, native format/bit depth,
gain/routing and unsupported physical observations remain null.

The live capture result supplies frame, overrun-sample, clipping, stream-error
and callback observations. It does not supply dropped-buffer or discontinuity
counts; those remain null instead of being inferred from another counter.
An `observed` continuity state retains the explicit
`native_counter_observation_not_proven_hardware_continuity` basis. It does not
set the evidence record's scientific quality flags or invoke pitch analysis.

The returned audio object is deliberately separate and mutable. Mutating it
cannot alter copied descriptor/record metadata, but no retained-byte identity
or waveform hash is established. The new descriptor and old v1 evidence record
must both be carried by future persistence: serializing only the v1 record does
not retain acquisition metadata, and serializing the entire return object is
not an implemented raw-evidence storage policy.

## Static verification

Read-only checks used `git rev-parse`, `git status --porcelain`,
`git merge-base --is-ancestor`, scoped `git diff --name-only`, file comparisons,
`git diff --check`, `rg`, `sed`, and Python `hashlib` over file bytes. No project
module was imported. There were 1,643 tracked files at the reviewed source.
The implementation range's whitespace check passed. Source search finds only
the new controller and its test caller under app/tests, confirming production
UI wiring remains unfinished.

| File | Independently read SHA-256 |
| --- | --- |
| `app/player/acquisition.js` | `49e67475808248d9f920c9a69ea090786669c1faf54b6f4cf0ccea36a5961fe8` |
| `tests/cdj-acquisition.test.mjs` | `9f221f9fd5c94658cb27cac3568f95ca7d36c50d51c34cd01a7c437e89b8ebd2` |
| Unchanged evidence normalizer | `52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207` |
| Unchanged audio-I/O bridge | `0c9b78c970da7ff38386651c1778cd485b8edbcdfbfeedb6cbbeacb77f1569f6` |
| Unchanged capture bridge | `9204f3df759d883052941838364814865f58d5178d525d29e81ebde02df5473b` |
| Unchanged native capture source | `35a491ac4f392935b1d31f589f647fea48d0fdebb2d952ffd02426f64e438bfc` |

Only this report is added by this worker. Report links, staged formatting and
post-commit clean status are checked for the handoff; the report's SHA-256 and
commit identity are supplied separately to root.

## Remaining boundaries

The independent functional worker owns runtime acceptance. Exact-source hosted
qualification remains a separate integration gate. Production UI, retained
reference/raw-byte ownership and hashing, complete scientific validation,
SQLite/history/HTML round trips and physical player qualification remain open.
Known source metadata and successful cleanup cannot grant those qualifications.

No native limit, permission, feature default, performance/security threshold,
dependency, network sink or storage writer changed in this reviewed slice.
No remote writes, deployment, release, tags, branch deletion or history rewrite
were performed by this worker.
