# DeckChek fresh code audit, round 2 — 19 November 2026

## Review baseline and disposition

This independent worker started at `580704a23f5cb0ed221170ed985a7669df872dd8`, the first round's MIDI channel-mode correction. It reviewed that change and then investigated the timestamp-handling hypothesis in the preceding handoff. The previously established branch-uniqueness inventory was not repeated.

The first-round correction is accepted within its stated scope. The [MIDI Association message summary](https://midi.org/summary-of-midi-1-0-messages) and [control-change table](https://midi.org/midi-1-0-control-change-messages), independently read on 19 November 2026, identify CC123 and CC124–127 as channel-mode note-release operations. The implementation preserves channel isolation, excludes All Sound Off/controller reset from key-release evidence, and limits late individual-release credits to captured notes. Its revised wording does not claim that it measures audible voices or physical switches.

## Confirmed finding and correction

**Medium: malformed or reversed transport timing produced false timing measurements.** Eight reverse-ordered Clock ticks yielded zero-percent jitter and negative 120 BPM. Numeric strings were coerced into Active Sensing intervals. BigInt and Symbol timestamps could throw during arithmetic. All-equal Clock timestamps produced a nominal timing metric with no finite value. Squaring very large finite intervals overflowed the variance.

The actual runner had an additional path: it substituted its receipt clock for missing transport timestamps and recorded a separate REVIEW integrity finding, but still displayed and saved timing measurements calculated from those substitutions. A REVIEW status alone did not make those numeric values valid transport evidence.

The correction:

- Validates finite, nonnegative timestamps in captured order before Active Sensing or Clock arithmetic. It does not sort backwards timing into a valid stream or coerce strings, booleans, objects or other invalid types.
- Requires a non-reversed, finite supplied Active Sensing end time. Absent end times still permit observed gaps between multiple valid messages.
- Retains equal timestamps inside an advancing Clock capture. Clock still requires at least eight ticks and a positive, representable span.
- Calculates Clock variation from normalized intervals, avoiding overflow from squaring large absolute durations. One nonzero interval among seven has a finite coefficient of variation of `sqrt(6)`, reported as 244.95%.
- Passes `timingObserved: false` when the runner's existing timestamp-integrity check fails. Active Sensing and Clock numeric fields become null; timing measurements, including 14-bit pair timing, are omitted. Burst numeric fields are null as well. Packet counts, channels, byte validation and note-release evidence remain available.
- Preserves the existing capture-integrity REVIEW result, metric IDs, minimum Clock count and warning/failure thresholds. Unavailable timing does not become a hardware failure.

## Standards review

The changes remain in the existing pure analyzer and one adjacent runner call. A private timeline predicate prevents numeric coercion before arithmetic. No dependency, native command, backend behavior, output transmission or policy gate changes. Regression cases exercise observable results and the actual injected runner, rather than checking source spelling.

## Specification review

SPEC-36 AC-2 requires exact crafted-stream timing values, and the existing capture-integrity contract distinguishes unobserved timing from measured evidence. The prior numeric output contradicted those requirements. The specification now documents unavailable timing, tied arrivals and the receipt-clock boundary. Valid transport timing remains host evidence; it is not physical-device timing qualification.

## Verification

Runtime: Node **22.23.4**, executable `/workspace/scratch/0a7bc3583588/toolchain/node_modules/node/bin/node`.

- Six new regression tests on the preceding implementation: **1 passed / 5 failed / 0 skipped**. Failures cover the pure analyzer and real runner path.
- Corrected focused scope: **89 passed / 0 failed / 0 skipped**, reported TAP duration **1.529278086 seconds**:

  ```text
  node --test tests/midi-conformance.test.mjs tests/midi-fs36-ui.test.mjs tests/midi-runner-lifecycle.test.mjs
  ```

- Coverage includes missing/non-numeric/non-finite/negative/reversed timestamps, zero spans, unavailable session ends, valid tied arrivals, very large finite values, subnormal spans, immutable input ordering, packet/note evidence retention and runner suppression after receipt-clock fallback.
- `git diff --check` passed. These are pure JavaScript and injected-DOM checks. No full-suite, real browser, native application, physical MIDI or release qualification is claimed by this report.

## Fresh-worker handoff

Root owns integration and exact-source hosted qualification. Review this delta after applying the first-round commit; it depends on that note-release correction. A successor can independently verify the normalized interval arithmetic and the capture-integrity propagation without rerunning the unchanged branch inventory. Preserve null/omitted timing as unavailable evidence in any future report renderer; do not replace it with zero.

Real MIDI identity, device substitution, hot-plug continuity, hardware clock accuracy and audible GM behavior remain separate unqualified work. No remote branch, pull request, gate, release or deployment was changed by this worker.
