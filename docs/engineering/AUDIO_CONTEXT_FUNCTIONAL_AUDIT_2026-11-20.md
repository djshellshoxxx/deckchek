# Audio lifecycle context — fresh functional audit

Reviewer/executor: `/root/audio_functional_round2`. Review date: 20 November
2026, America/Los_Angeles. Host timestamps are 21 November UTC. All three initial
audio workers completed before this fresh trio began. This lane was the sole
local project runtime executor for the round.

## Disposition

**Both original failures were reproduced in the second bounded observation:
33 total / 31 pass / 2 fail.** The actual retry now has retained measurements,
response data, findings, capture metadata and post-suite input identities.
The first message-only observation passed 18/18 and emitted no failure payload.
Both first outcomes are preserved; neither is a production repair or a cause
finding. Reference/PDF full qualification remains held, and issue #72 remains
unresolved.

Exactly **two project runtime invocations** occurred. Root approved the distinct
second observation after the first produced no numerical payload, and both fresh
static reviewers accepted each frozen diagnostic before execution. No third
invocation, full suite, browser/native run, numerical reconstruction, optimization
comparison or production correction occurred.

## Source and scope

Branch `review/deckchek-audio-functional-context-20261120` began at
`8dbef3a91f4d88d01ec5a570265258443fd7f3cc`, tree
`9f3376e0e936abb6df4c1bc73ce91aa1d7581224`.

| Observation | Executed commit | Complete tree |
| --- | --- | --- |
| Assertion message | `5b340667e21c2d7d5bf25ed7116ed1b21cc3acb3` | `1e191df434541fbb7c36c84f739a26ac6b979626` |
| Two-file aggregate | `f26c247a44a70dd1e19f08ee1bee6dad7fe2f864` | `0c24c00e4e3748992371c8d90303859a22f5dd4e` |

The first source changes only the existing retry assertion's message. It
serializes the already-returned finish payload and existing playback options
and counters after the original one-playback and one-save assertions. Its
actual status and expected `pass` operands remain unchanged. Nonfinite numeric
values are explicitly encoded instead of becoming JSON null.

The second source adds opt-in test-harness aggregation and the standalone
`tools/diagnostics/audio-context-serialize.mjs`. The finish callback first performs
its original `finished.push(result)`, then retains shallow references to the
result, playback entries and actual live fixture recording/options. An observation
closure reads the fixture's `recorded` variable only at that point. Hashing,
dynamic helper import and JSON serialization occur in the final runner `after`
hook. The writer exclusively creates the explicitly supplied scratch output.

All **18 original runner case declarations and their order**, and **118 original
assertion calls**, remain. Both static lanes reviewed actual assertion conditions.
The audio-quality test and five inspected production modules are byte-identical
across the base and both sources. No fixture arithmetic, solver, timing hook,
threshold, tolerance, skip, permission or feature flag changed. The diagnostic
finish callback returns undefined instead of the push's length; its production
caller ignores that return value.

Original source, exact transformations, executed source copies, recorders and
complete maps are in the [evidence directory](evidence/audio-context-functional-2026-11-20/README.md).
The [fresh code](AUDIO_CONTEXT_CODE_AUDIT_2026-11-20.md) and
[defensive](AUDIO_CONTEXT_SECURITY_AUDIT_2026-11-20.md) reports are separate lanes.

## Runtime contract and first outcomes

Both commands used absolute Node
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`,
**v24.22.3**, Linux x64, with `NODE_OPTIONS` absent. Python 3.12.14 retained argv,
timestamps, runtime versions, driver hash, clean checkout, HEAD/tree and every
tracked file's SHA-256 before/after. Timeout was 180 seconds; neither timed out.
Both stderr files are empty; both have zero cancelled/TODO cases.

| Observation | Total / pass / fail / skip | Exit | Seconds | Unchanged hashes |
| --- | --- | ---: | ---: | ---: |
| Message-only runner file | 18 / 18 / 0 / 0 | 0 | 3.498428257 | 1,994 |
| Two-file aggregate | 33 / 31 / 2 / 0 | 1 | 8.723452965 | 2,007 |

The first passing retry caused no enriched assertion message to be emitted.
No numerical payload from that invocation is claimed. Both checkouts remained
clean with unchanged HEAD/tree and complete maps.

The second command was:

```sh
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap tests/audio-quality.test.mjs tests/audio-runner-lifecycle.test.mjs
```

Its recorder set `DECKCHEK_AUDIO_CONTEXT_PATH` to the scratch path in the
[runtime metadata](evidence/audio-context-functional-2026-11-20/two-file-aggregate/result.json).
TAP lists the original 15 quality cases followed by 18 runner cases. Observed
TAP order does not establish shared runtime state between files. No case was
filtered or moved in its source.

The failures were cubic nonlinearity, ordinal 4, repeating
`16972224339301138 vs 4.347826086956522`, and failed-start/retry, ordinal 19,
again reporting `3 of 9 checks failed: balance, response, polarity.` Its reached
assertions establish one playback and one saved retry; no ownership defect is
inferred from the measurement verdict.

## Captured lifecycle evidence

The [aggregate JSON](evidence/audio-context-functional-2026-11-20/two-file-aggregate/contexts.json)
contains **10** completed finish payloads: **eight live fixtures** and **two file
fixtures**. Result verdicts are distinct from test counts: some existing tests
deliberately expect a failed or reviewable result. File input identities are
explicitly null/unobserved and never assigned a live recording reference.

The first three completed live results correspond to setup, progress and retry.
Their playback options are all **−12 dBFS**, cap −12 dBFS, no loop, 48 kHz.
Setup and default therefore have the same numeric level; earlier wording that
distinguishes setup from a default must not be read as different values.

| Retained field | Setup | Progress | Retry |
| --- | ---: | ---: | ---: |
| Fixture attempt at finish | 1 | 1 | 2 |
| Result status | pass | pass | fail |
| Gain, dB | 0 | 0 | −110 |
| Balance L−R, dB | 0 | 0 | −220 |
| Worst response deviation, dB | 0 | 0 | 220 |
| Inverted polarity flag | 0 | 0 | 1 |
| Stored THD, % | 0 | 0 | 6935867070.3903 |
| Stored THD+N, % (rounded) | 0 | 0 | 0 |
| Stored THD+N, dB | −151.12 | −151.12 | −151.12 |
| Stored SNR, dB | 217 | 217 | 217 |
| Clock offset, ppm (rounded) | 0 | 0 | 0 |
| Latency, ms (rounded) | 4.4 | 4.4 | 4.4 |

All eleven retry response rows report left deviation 220 dB and right deviation
0 dB. Saved findings include the three failed criteria and a warning that the
left tone channel is below −70 dBFS. These are returned synthetic-analysis
values, not measurements of physical hardware.

All eight live input identities match at final serialization: 675,091 Float32
samples per channel, 48 kHz. Their last playback identities/options also match:
578,880 Float32 samples per channel with the options above. Recorded live hashes:

- Left: `851d0bd53a969a6af4b6334256138ebf732496b67192b20919b09a6d7b26bd32`.
- Right: `488bc6ae51a99511d62a7913aa0f98c49c122fb988e4facae75429614c714f05`.

Left/right hashes intentionally differ because the full stimulus contains
channel-specific crosstalk sections. This round captures no tone-slice hash.
The retry has two capture-start attempts, one playback, one capture stop and one
save. Its final capture-integrity state is observed and calibration state is
none. The separate fault fixture retains final overridden quality/errors in
`result.extra` and a review verdict. Its inner fixture audio reference is not
presented as final integrity evidence.

The retry assertion serialized its result after the returned analysis. The
[extracted message](evidence/audio-context-functional-2026-11-20/two-file-aggregate/extracted-retry-message.json)
equals the final aggregate's retry result and counters exactly. This checks
agreement of saved result fields at those two serialization points; it does not
establish input-buffer identity before analysis.

## Limits and successor handoff

The unexpected saved outputs give the next workers a concrete target. They do
not identify a faulty instruction or establish a solver, shared-cause, engine,
scheduler or environment diagnosis. No production patch is justified by this
report alone.

The retained buffers are references, not immutable entry-time copies. Post-suite
hashes cannot prove their bytes at analyzer entry or provide a before/after
mutation check. Retaining objects extends lifetimes during later analyses and
can affect allocation or timing. This observer effect is recorded without
attributing the failure to it.

`ctx.finish` omits raw fit objects and unrounded lag/clock fields. Rounded
latency/clock measurements survive as shown above. No absent field was inferred
or reconstructed. The fresh code worker's source trace recommends capturing
fundamental fit fields immediately after `fitTone` and after harmonic/intervening
fits, with actual slice identity and scalar snapshots. That is a question for
the next fresh trio. No such third invocation occurred here, and no object
mutation is established by the present evidence.

The original full **2,314 / 2,312 pass / 1 fail / 1 skip**, reference full
**2,357 / 2,354 pass / 2 fail / 1 skip**, earlier unchanged **33 / 32 pass /
1 fail**, first diagnostic **18/18**, and aggregate **33 / 31 pass / 2 fail**
remain separate evidence. The prior consistent pure six-call diagnostic is also
separate. None replaces a failed full gate. Physical/scientific, native/platform,
rendering and release qualification remain outside this lane.

## Artifact integrity

| Complete raw artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Message-only TAP | 4,592 | `0f06673c12933ab9707110356c3d073cf895ce9adc73a8584a91c5c87ef2ebf7` |
| Two-file aggregate TAP | 17,250 | `a0e332853ada66bfb42194b0a7aaabf552df5464c4023d538a9d0cd0787e3802` |
| Aggregate JSON | 144,256 | `872571803365a4bcfbd23ed31c921902d614c248ad34f1ec3ab07e2626521a6a` |

The [read-only verifier](evidence/audio-context-functional-2026-11-20/verify-evidence.py)
bound both complete inventories to immutable Git blobs: 1,994 paths/1,879
distinct blobs and 2,007 paths/1,890 distinct blobs. It checked copied source,
patch and driver identities, raw bytes/counts, historical failure digests,
production equality and stated aggregate facts. Its
[record](evidence/audio-context-functional-2026-11-20/evidence-verification.json)
is not another project execution. The evidence
[manifest](evidence/audio-context-functional-2026-11-20/SHA256SUMS) covers retained
artifacts. Raw TAP and exact patch whitespace are preserved.

Only this lane's test diagnostics, diagnostic helper, report and evidence changed.
Root integrates this handoff after all three fresh workers finish. No new
runtime remains queued.
