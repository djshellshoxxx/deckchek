# CDJ-04 acquisition code and specification audit — 20 November 2026

Worker: `/root/cdj_acquisition_code_audit`. Report date uses
America/Los_Angeles; execution timestamps, if cited, retain UTC.

## Scope and fixed point

The baseline is `7ae15e17d0c8247efde1ba26c59df4e13f4e321c`, tree
`2f2a99a1370f1863649aa2bd0552ddc92f6ad1e4`. It already contains the accepted
QR correction and provisional CDJ calculation/evidence modules. This review
concerns the next acquisition slice, not a repeat review of those modules.

The originating requirements are [SPEC-10](../SPEC-10-CDJ-media-player-diagnostics.md),
[SPEC-00 section 5](../SPEC-00-product-architecture.md), and the
[previous continuation's capture-owned acquisition handoff](CDJ04_EVIDENCE_CONTINUATION_2026-11-20.md).
The [frontend guide](../../app/README.md) establishes the ES-module/bridge
structure. No additional AGENTS.md, dedicated coding standards or issue-tracker
instructions were found in this checkout. The supplied fixed point and local
specification were sufficient; no remote lookup was needed.

The Engineering Suite code-review guidance was applied along separate
Standards and Spec axes, with its code-smell baseline treated as judgement
calls. The assigned initial worker set already provided parallel independent
code, functional and defensive coverage; this worker did not spawn more workers.

## Baseline contract risks and author guidance

There was no acquisition runner at the baseline. The following requirements
were communicated before implementation; they are integration risks in the
new slice, not newly discovered defects in the unchanged bridge.

| Requirement | Source evidence and required treatment |
| --- | --- |
| Keep observed metadata distinct from requested/fallback values | `payloadToAudio` synthesizes compatibility values for rate, channels, pairs and a missing right channel; `startLiveSession` can also fall back to the requested device name. Consume preserved `nativeFields` presence/validity and consistency with sample arrays before labelling a field observed. |
| Own the complete capture lifetime | `startLiveSession` does not consume the supplied AbortSignal. The runner must handle pre-abort, mid-run cancellation, late startup, preemption, loss, stop errors and cleanup itself through its own session handle. |
| Make primary-pair scope explicit | `nativeFields` preserves primary-channel presence/counts. A one-selected-pair slice is appropriate; multi-pair requests must be rejected before opening, and unexpected returned pairs cannot silently claim broader sample coverage. |
| Preserve timing/clock meaning | Requested duration, host timing and sample-count/nominal-rate duration are different observations. CPAL nominal rate is not an independently measured clock. The bridge does not provide a hardware first-sample timestamp. |
| Preserve unknowns and qualification | Backend driver, measured clock, raw retention, reference identity, processing and scientific calibration cannot be inferred from successful capture. The v1 record stays unverified, ineligible and without a measurement. |
| Detach immutable metadata | SPEC-00 requires an immutable descriptor. IDs and host timestamps belong to the runner; operator assertions and native mutable objects must not remain aliases in returned metadata. Raw sample buffers, if exposed separately, are not durable storage references. |

Pair labels should be derived from validated indices; a native label string is
not itself the channel-map proof. Channel range, duplicate pairs and primary
array consistency need explicit handling. Missing native counters must not be
converted into measured zero-loss continuity. The versioned acquisition result
must retain counters and interruption reasons that the existing v1 evidence
serializer does not carry.

## Reviewed implementation

**Disposition: accepted within the initial source-review scope.** The author
resolved the concrete draft channel-map finding and the descriptor omissions
raised during root's independent review. No unresolved code/spec blocker
remains in the one-pair acquisition slice. Three fresh workers still need to
accept the combined candidate independently.

| Stage | Commit / tree |
| --- | --- |
| Initial implementation after the channel-map correction | `ef443d49ac1c9042a712ac5a4996faaddb8110bb` / `d164994f83f428bc96315babd877a0ce88c8ce55` |
| Final reviewed descriptor successor | `3e7ae2d239686061a5056efb672be4ae135215e1` / `2ef190b0a9a4d94db0ab352ff784dd414c69f322` |

The complete comparison is `git diff 7ae15e17d0c8247efde1ba26c59df4e13f4e321c...3e7ae2d239686061a5056efb672be4ae135215e1`.
It adds only [the acquisition module](../../app/player/acquisition.js) and
[its tests](../../tests/cdj-acquisition.test.mjs). The review checkout was
fast-forwarded to each frozen implementation; this worker did not edit either
file. The descriptor successor adds two implementation lines and five test
lines. Native/bridge code, the existing evidence schema, numerical helper,
mobile source, workflows and database remain unchanged.

The function owns one 1..30-second capture through an explicitly supplied
`startLiveSession`-compatible provider. It keeps requested settings, host
observations, nominal sample-derived duration and native metadata distinct.
It returns deeply frozen acquisition/record metadata with a separate mutable
ephemeral audio object. It does not acquire audio on import, add a UI, write
storage, analyse the signal or grant report eligibility.

## Standards

**Zero actionable findings.** The new module follows the existing ES-module
structure, reuses the pair parser and evidence normalizer, and keeps capture
I/O behind an injected dependency. It does not duplicate DSP or expand native
permissions. The internal helpers have concrete ownership, snapshot, timing
and bounded-diagnostic responsibilities; the code-smell baseline did not yield
an additional actionable refactor. Formatting checks are automated and were
not counted as review findings.

Tests use ordinary fake sessions plus the real `payloadToAudio` normalizer.
Their inspected assertions cover lifecycle outcomes, detached snapshots,
compatibility fallbacks, channel-map consistency and continued ineligibility.
This is a statement about test source, not a claim that this worker ran them.

## Spec

**Two review requirements corrected; zero unresolved findings in this slice.**

| ID | Finding and disposition |
| --- | --- |
| P1 — channel-map consistency, medium | The first draft's pair validator admitted mono on an interior channel even though the native resolver uses mono only on the final odd channel. Draft source SHA-256 was `0ed280de37cad8c8b782b388576bb2bf791a0c6ec283e12a9f8e1153778f650a`. The author added the final-channel condition before `ef443d4`; the final source preserves it and includes an ordinary map-consistency regression. No original-source runtime reproduction was performed. |
| P2 — explicit descriptor unknowns, low | Root's review of `ef443d4` identified absent SPEC-00 section 5 fields: source type, channel mode, gain-staging notes, phono/line status and external RIAA. `3e7ae2d` explicitly stores the unavailable observations as null and derives `primaryPairMode` only from exactly one validated matching pair. Tests cover the nulls, stereo, final-channel mono and unsupported multi-pair mode. |

The remaining contract guidance was implemented:

- The runner opens nothing for a pre-aborted request, owns the session handle,
  releases a late-resolving startup after cancellation, and rejects preempted
  results. Cleanup is lease-scoped and uses no global capture-stop operation.
- Waiting and stop completion race the runner's cancellation. Normal stop
  status is distinguished from premature loss. Errors in providers, timing,
  phases or capacity checks release only the owned session; listeners and the
  default duration timer are detached on exit.
- `nativeFields` presence, validity and consistency are checked before values
  become observations. Pair indices are canonicalized and checked for range
  and uniqueness. The sampled waveform scope remains the first selected pair;
  unsupported multi-pair requests fail before capture begins.
- Generated run/capture UUIDs are distinct and override no operator identity.
  Host timestamps are labelled as host observations. Measured clock rate and
  first-sample hardware time remain null. A backwards host clock does not
  create a negative sample duration.
- Backend/OS identity, sample format/bit depth, gain/routing, measured timebase,
  dropped-buffer/discontinuity counts and the added descriptor fields remain
  explicitly unknown. `overrunSamples` stays a sample counter. The continuity
  basis explicitly says that native counters do not prove hardware continuity.
- Diagnostic arrays and text are bounded with truncation/omission information.
  Missing counters remain unavailable; positive faults and count inconsistencies
  remain visible. No new dropout or scientific threshold is introduced.
- Operator data is restricted to asset/source/processing/pitch assertions in
  the produced record. Analysis and quality are not copied from the caller.
  The record always remains unverified, report-ineligible and without a
  measurement. Both raw-reference lists remain empty and audio retention is
  explicitly ephemeral.

The acquisition metadata has its own versioned JSON shape beside the v1
evidence record, whose serializer does not carry the new descriptor fields.
Keeping both together in future persistence remains an integration requirement;
the inspected JSON round-trip assertions do not establish SQLite or report
round trips.

## Static verification and limits

The final range contains exactly two new implementation/test paths. A read-only
comparison confirmed no changes to the existing evidence/pitch modules,
capture bridge, native source, database, mobile source or hosted workflows.
`git diff --check` passed for the complete implementation range. SHA-256 hashes
were read directly from the frozen files:

| File | SHA-256 |
| --- | --- |
| Acquisition module | `49e67475808248d9f920c9a69ea090786669c1faf54b6f4cf0ccea36a5961fe8` |
| Acquisition tests | `9f221f9fd5c94658cb27cac3568f95ca7d36c50d51c34cd01a7c437e89b8ebd2` |
| Unchanged evidence module | `52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207` |
| Unchanged pitch helper | `040a0703f8d68cecedae43616b977378f11baf5f6ac8e18be487e1bd85262988` |
| Unchanged audio-I/O bridge | `0c9b78c970da7ff38386651c1778cd485b8edbcdfbfeedb6cbbeacb77f1569f6` |
| Unchanged capture bridge | `9204f3df759d883052941838364814865f58d5178d525d29e81ebde02df5473b` |

The audit report alone is added after the reviewed source. Its relative links
and staged formatting are checked before committing. No runtime outcome from
another worker is reclassified as this worker's independent execution.

This worker performed source-only review. It did not execute application code,
tests, syntax checks, generators, native builds, browser/mobile sessions,
scanners or probes. The functional author owns its verification; fresh
independent acceptance and source-specific hosted qualification remain separate.

Acquisition ownership does not complete the player workflow. UI wiring,
durable raw/reference storage and hashing, scientific estimator/uncertainty
validation, SQLite/history/report round trips and physical player qualification
remain outside this slice. No capture/reference assertion can be promoted to a
validated player measurement by this review.

**Axes summary:** Standards — zero findings; Spec — two corrected requirements,
zero unresolved findings in the selected slice. The most consequential original
Spec finding was P1's inconsistent channel map; full workflow and physical
qualification remain explicitly outside this acceptance.
