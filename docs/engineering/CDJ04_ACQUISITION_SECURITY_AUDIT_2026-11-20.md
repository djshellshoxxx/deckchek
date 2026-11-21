# CDJ-04 acquisition — defensive source audit, 20 November 2026

Worker: `/root/cdj_acquisition_security_audit`. Dates use America/Los_Angeles.

## Disposition and review boundary

**The final author source satisfies the six scoped defensive requirements;
no additional actionable defensive blocker was identified.** The initial
source `ef443d49` was reviewed, then the exact seven-line successor delta was
reviewed at `3e7ae2d2` after root requested explicit scientific-metadata slots.
Fresh independent acceptance remains required.

This is the initial author-round defensive review of the next acquisition
slice. It does not replace fresh independent acceptance, runtime qualification,
native packaging or physical-player validation. No application, test,
generator, audio device, browser, native compiler, scanner or probe was run by
this worker. Review used source inspection and read-only Git/file hashing.

| Role | Commit / tree |
| --- | --- |
| Accepted integration base | `7ae15e17d0c8247efde1ba26c59df4e13f4e321c` / `2f2a99a1370f1863649aa2bd0552ddc92f6ad1e4` |
| Initial authored implementation | `ef443d49ac1c9042a712ac5a4996faaddb8110bb` / `d164994f83f428bc96315babd877a0ce88c8ce55` |
| Final reviewed author source | `3e7ae2d239686061a5056efb672be4ae135215e1` / `2ef190b0a9a4d94db0ab352ff784dd414c69f322` |

The baseline contains the independently reviewed provisional evidence record
and pitch-display calculation, but no player acquisition runner. Those existing
contracts cannot establish capture provenance from operator assertions. The
requirements below address the new slice; they are not claims of demonstrated
exploitation in the prior implementation.

## Sources and trust boundaries

The review followed [SPEC-10](../SPEC-10-CDJ-media-player-diagnostics.md),
[SPEC-00 scientific capture metadata](../SPEC-00-product-architecture.md), the
[prior evidence handoff](CDJ04_EVIDENCE_CONTINUATION_2026-11-20.md), the
[provisional record](../../app/player/evidence-record.js), the
[calculation helper](../../app/player/pitch-display.js), the
[native capture bridge](../../app/capture.js),
[`payloadToAudio` and `startLiveSession`](../../app/ui/audio-io.js), the
[existing quality-session owner](../../app/devices/audio-session.js), and the
[native capture implementation](../../src-tauri/src/capture.rs).

The protected properties are correct ownership of the input lease, faithful
attribution of capture observations, bounded local metadata, and preservation
of the provisional scientific qualification boundary. No new network,
authentication, filesystem write, database or HTML boundary is part of this
slice.

1. Requested input, duration and operator metadata cross into the runner before
   acquisition. They must remain requests/assertions, snapshotted independently
   of later caller edits.
2. The session returned by the existing start/stop/cancel dependency is the
   runner's owned resource. Cancellation and preemption must not stop another
   feature's lease or admit a late result from an abandoned run.
3. Capture results cross into versioned observation metadata. Native presence
   and validity markers must precede compatibility defaults; absence must not
   become a measured zero, default sample rate or confirmed routing.
4. The provisional record crosses into future analysis/storage consumers.
   Actual capture observations do not validate the reference, player, capture
   clock, processing state, uncertainty method or durable evidence retention.

The injected implementation dependency is trusted application code, not an
arbitrary JavaScript sandbox. Ordinary-data validation does not authenticate a
malicious replacement backend, hardware or caller.

## Initial defensive requirements and authored resolution

| ID | Source-derived requirement | Authored resolution |
| --- | --- | --- |
| ACQ-S1 — Observed provenance | `payloadToAudio` can substitute 48 kHz, two channels, a default pair and duplicated right samples. `startLiveSession` can fall back to the requested name or `input`. Check `nativeFields` presence/validity and source consistency before attributing observations. | Resolved in source. `observe` requires own `present`/`valid` markers plus bounded values, corroborates rate/channels with returned audio, and compares primary pair/counts. Missing metadata remains null with explicit reasons. Requests do not replace observations. |
| ACQ-S2 — Lease lifecycle | The current `startLiveSession` does not consume an AbortSignal. The runner must control cancellation, release a late-started owned session, discard late stop results and clean up on callbacks or normalization failures. Never use an unscoped global stop/preempt. | Resolved in source. The runner owns the cancellation race, attaches release to late starts, rejects abandoned stop results, and uses only the returned session's cancel/stop functions. `finally` detaches its listener, aborts the default duration timer and releases any still-owned session. |
| ACQ-S3 — Bounded snapshots | Snapshot requests before awaits and returned metadata before exposure. Validate safe numeric counts and bounded text/lists; preserve invalid/missing observations explicitly rather than filling zeros. Avoid serializing raw waveforms as metadata. | Resolved in source. Requests and normalized assertions are copied before acquisition. Descriptor fields are copied and frozen; each diagnostic list retains at most 20 strings of at most 1,000 characters with explicit omission/shortening counts. Counters must be safe nonnegative integers. Sample buffers remain separately ephemeral. |
| ACQ-S4 — Integrity semantics | Native counters include frames, overruns, clipping, callbacks, stream errors, truncation and callback gaps. Missing counters do not demonstrate continuity; native errors do not uniquely diagnose player dropout. Requested duration, recorded duration and wall time are different observations. | Resolved in source. Missing counters yield unavailable status; reported faults yield incomplete status. `observed` explicitly means native-counter observation, not proven hardware continuity. Nominal sample duration and host timing have separate bases; measured rate, first-sample time, dropped-buffer/discontinuity counts and timebase calibration remain unknown. No new callback-gap or scientific threshold is introduced. |
| ACQ-S5 — Channel scope | `nativeFields` preserves original channel provenance for the primary pair only. Normalized extra-pair right samples can also be compatibility copies. Restrict the supported slice or retain explicit unavailable provenance for additional pairs. | Resolved in source. Requests support one pair. Returned metadata retains the primary-only sample scope and marks unexpected multiple pairs unavailable. Pair descriptors are range checked; mono is valid only on the final odd channel. The successor derives primary mode only from one validated matching pair. |
| ACQ-S6 — Qualification and retention | A successful acquisition must remain unverified and ineligible for reports. Do not create resolvable raw-evidence references without a storage owner, or convert assertions into verified reference, processing, method, timebase or calibration facts. | Resolved in source. Only declared asset/source/processing/pitch fields enter the new record. Identity/time are generated by the runner; capture observations replace caller capture labels. Analysis and quality assertions are omitted. Record qualification stays unverified/false/null; both raw-reference lists are empty and retention is explicitly ephemeral. |

These requirements were sent to the author before its implementation freeze
and coordinated with the code reviewer. No adverse runtime inputs were used to
derive them.

## Reviewed implementation

The new [acquisition controller](../../app/player/acquisition.js) has an explicit
`startLiveSession`-compatible dependency and no import-time acquisition. The
1..30-second requested window and one-pair request are checked before start;
the live buffer guard uses `ceil(duration) + 5` without changing native limits.
A reported native capacity shorter than the request ends the owned run.
Cancellation before start opens nothing; cancellation during start attaches
cleanup to any session that later arrives. During recording or a pending stop,
the controller discards the abandoned result and releases only its session.
Provider and callback errors use the same cleanup path. This reasoning assumes
the existing dependency's lease-scoped stop/cancel contract; it does not promise
that a malfunctioning driver or replacement dependency will respond promptly.

The return value separates frozen `acquisition` and `record` metadata from
mutable, ephemeral `audio`. The descriptor has its own version, generated run
and capture UUIDs, nullable native lease identity, request snapshot, host-time
basis, observed fields and bounded diagnostics. No waveform samples are copied
into these metadata objects, and no file, hash-addressed retained asset or
database row is invented. The descriptor and v1 evidence record are separate
objects; serializing the v1 record alone is not acquisition-metadata retention.

The code review's mono-interior finding was already corrected in `ef443d49`.
Root then identified missing explicit SPEC-00 section 5 slots. The seven-line
successor adds null source type, gain-staging notes, phono/line and external-RIAA
observations, plus primary mode derived only from a validated matching single
pair. The test additions describe unknown, stereo, final-mono and unexpected
multi-pair cases. No caller assertion is promoted by these additions.

The exact native device text is retained in `acquisition.observed`; the existing
evidence-record normalizer trims its display text. Neither device label is a
stable physical-device identifier. `overrunSamples` retains native sample units
and is not reinterpreted as frames or dropped buffers. Positive clipping/error
counters remain observations; their absence does not set any scientific quality
flag or call the pitch-display calculation helper.

The [new tests](../../tests/cdj-acquisition.test.mjs) were inspected as source.
They exercise the adapter with ordinary synthetic capture fixtures and
controlled lifecycle promises, including missing observations, unequal channel
lengths, bounded diagnostics, delayed start/stop, cancellation and cleanup.
This worker did not execute them or reproduce a vulnerability.

## Static verification and exact identities

Read-only Git comparison from the accepted base to the final author source
shows exactly two additions: the controller and its tests. Existing QR,
evidence, capture bridge, native capture, UI, database and generator files are
unchanged. Searching `runCdjAcquisition`/`CDJ_ACQUISITION_SCHEMA` under app/tests
finds the controller and its test caller only: production UI wiring remains
unfinished.

`git diff --check` from base `7ae15e1` to `3e7ae2d2` passed. Static SHA-256 hashes
were computed from file bytes with Python's `hashlib`; no project module was
imported. The source and test contents were reviewed directly with `sed`, `rg`
and `git diff`.

| Final reviewed file | SHA-256 |
| --- | --- |
| `app/player/acquisition.js` | `49e67475808248d9f920c9a69ea090786669c1faf54b6f4cf0ccea36a5961fe8` |
| `tests/cdj-acquisition.test.mjs` | `9f221f9fd5c94658cb27cac3568f95ca7d36c50d51c34cd01a7c437e89b8ebd2` |

The existing evidence module SHA-256 at the reviewed base is
`52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207`.
The capture adapter SHA-256 is
`0c9b78c970da7ff38386651c1778cd485b8edbcdfbfeedb6cbbeacb77f1569f6`;
the native capture source is
`35a491ac4f392935b1d31f589f647fea48d0fdebb2d952ffd02426f64e438bfc`.
Their original source contracts were reviewed rather than executed.

## Limits and next handoff

Fresh workers must independently inspect the frozen combined source and the
functional evidence after this initial set completes. Author test results are
reported by their owner and are not this worker's executed evidence.

Actual device identity/continuity, characterized reference bytes, retained raw
evidence, estimator/uncertainty validation, SQLite/history/HTML round trips and
physical player comparisons remain separate requirements. Default feature
flags, permissions, native limits and existing numerical/security thresholds
remain fixed. No remote publication, deployment, release, tag, branch deletion
or history rewrite was performed by this worker.
