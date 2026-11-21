# Audio numerical diagnosis — initial functional audit

Reviewer/executor: `/root/audio_functional_round1`. Review date: 20 November
2026, America/Los_Angeles. Host timestamps are 21 November UTC. This round began
after all six initial and fresh reference/PDF workers completed. It was the sole
local project runtime lane for the initial audio diagnosis trio.

## Disposition

**The unchanged focused run failed: 33 total / 32 pass / 1 fail. The retry
measurement verdict remains unresolved.** The cubic-distortion case passed in
that selection. A separate, bounded six-call numerical diagnostic returned
consistent results for its three synthetic fixtures, but did not reproduce the
session lifecycle or establish a repair. The complete reference/PDF gate remains
failed, and issue #72 remains unresolved.

There were exactly two project runtime invocations in this round: the unchanged
two-file selection and one six-call diagnostic. The conditional second diagnostic
was not executed because the first showed no numerical inconsistency warranting
an optimization-mode comparison. No production, original test, assertion,
threshold or skip was changed. No full-suite rerun or additional runtime
observation is queued in this lane.

## Source and runtime binding

| Execution | Commit | Tree |
| --- | --- | --- |
| Unchanged focused selection | `c67bd2a5d2bbe37ce0e97e0e8db4962a14c706ce` | `9e2b38e1dcf681834f5ad9e2f356fa34862204c3` |
| Six-call diagnostic | `c64d6b88c98f33a2ff42529f4e9235f005a047ee` | `b91803abd3677f95241a62a4de45213dd4ec4003` |

The diagnostic source differs only by the new diagnostic tool. Its first version
was committed at `b737144a3b2fdf00998c91ab0d5e810a872cf123`; `c64d6b88` adds an
explicit equality flag for the analyzed tone slices. The executed tool SHA-256
is `ce4fccd54e68baca6620701d81a26a504ab06d94b6f4252f498c54b161ab6bde`.
The [executed source copy](evidence/audio-numerical-functional-2026-11-20/diagnostic-1-default/tool-source.mjs)
and [maintained diagnostic tool](../../tools/diagnostics/audio-numerical-context.mjs)
contain the same bytes.

Both invocations used **Node v24.22.3**, Linux x64, at
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`, with
`NODE_OPTIONS` absent and no optimization-mode override. Python 3.12.14 recorded
commands, clean checkout state, exact HEAD/tree and every tracked file's SHA-256
before and after execution. The complete runtime/version records are retained
with each result. Shell invocations used Bash with login startup disabled.

## Prior failures remain separate evidence

The [fresh reference acceptance](PLAYER_REFERENCE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md)
recorded **2,357 total / 2,354 pass / 2 fail / 1 optional skip** on
`ded34d2dccfcf0ae51c78fa1492a57c161d32a1d`, tree
`9030b4d9eeb307f27c0d794dccf4a37895c2a602`. Its
[complete TAP](evidence/player-reference-acceptance-2026-11-20/full-suite.tap)
is 541,141 bytes with SHA-256
`29ef19e0e0916e94e4c1ce0b27be3805f173375686cd522cf9aa8db11a77dec4`.
The cubic assertion reported `16972224339301138 vs 4.347826086956522`.
The retry asserted expected `pass`, actual `fail`, with the detail
`3 of 9 checks failed: balance, response, polarity.`

The original [failed full run](evidence/redaction-acceptance-2026-11-20/full-suite.tap)
remains 530,581 bytes, SHA-256
`39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197`,
with 2,314 total / 2,312 pass / 1 fail / 1 optional skip and the same unexpected
cubic value. The prior passing freeze `f081881` and later passing narrow or
instrumented selections do not supersede either failed full run.

The four files `app/audio-quality.js`, `app/calibration.js`,
`tests/audio-quality.test.mjs` and `tests/audio-runner-lifecycle.test.mjs` are
byte-identical across the original failing `6f414a4`, prior passing `f081881`,
fresh failing `ded34d2`, this selection's `c67bd2a`, and diagnostic `c64d6b88`.
This equality does not identify a source, engine or environment cause.

The earlier instrumented 15/15 and 33/33 observations remain separate. I checked
the earlier [33-case TAP](evidence/player-capture-functional-2026-11-20/audio-prefix-context/run.tap):
its first 15 case names match the audio-quality cases. An argv list naming
app-state and audio-out first did not establish their execution before the audio
file or reproduce the original full-suite predecessor context. Counts from
these overlapping selections must not be added.

## Unchanged focused selection

The exact project command was:

```sh
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap tests/audio-quality.test.mjs tests/audio-runner-lifecycle.test.mjs
```

The [complete TAP](evidence/audio-numerical-functional-2026-11-20/unchanged-selection/run.tap),
[metadata](evidence/audio-numerical-functional-2026-11-20/unchanged-selection/result.json)
and [observed case order](evidence/audio-numerical-functional-2026-11-20/unchanged-selection/actual-execution-order.json)
are preserved without edits. TAP lists all 15 audio-quality cases, then the 18
runner cases; this is observed output order, not an inferred cross-file runtime
state. The cubic case, ordinal 4, passed. The retry case, ordinal 19, failed at
`tests/audio-runner-lifecycle.test.mjs:181` with the same three failed checks as
the fresh full run. Its preceding assertions reached exactly one playback and
one saved result after retry. This establishes a numerical verdict mismatch;
it does not establish an ownership failure or a shared cause with the cubic
failure.

| Observation | Value |
| --- | --- |
| Counts | 33 total / 32 pass / 1 fail / 0 skip / 0 cancelled / 0 TODO |
| Node exit / timeout | 1 / false |
| Elapsed | 9.113808141000845 seconds |
| Tracked files | 1,956; every hash unchanged and bound to Git blobs |
| Checkout | Clean before and after; exact HEAD/tree unchanged |
| Raw TAP | 8,482 bytes |
| SHA-256 | `72372175dab192c8e851037de477f6084b11beeed8b4dda8a726f5c1040dfc69` |

The selection was not repeated after either its passing cubic case or its
failing retry case.

## Bounded six-call numerical diagnostic

The exact command was:

```sh
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node tools/diagnostics/audio-numerical-context.mjs
```

The tool copies the existing synthetic `simulate` fixture declarations and the
runner's `recording` function. It creates three captures once: a clean +3 dB
capture, cubic coefficient 20, and the runner's default-level recording delayed
by 211 samples. The fixed sequence is `clean, cubic, runner, clean, cubic,
runner`. Each production `analyzeAudioQuality`/`evaluateAudioQuality` result is
retained with its snapshot digest. All six pipeline outputs are collected
before independent fit calculations or console output. Full input buffers are
hashed before and after the six-call batch. Nonfinite values would be preserved
explicitly instead of becoming JSON null.

Full left/right buffers are intentionally unequal because crosstalk segments
drive one channel at a time. Their equality flags are observations. The actual
analyzed shared tone slices are byte-equal for both channels in every call. They
contain 91,200 samples after the normal 50 ms trim and use the returned lag and
shared clock correction.

After collecting all outputs, independent arithmetic forms the sine/cosine/DC
Gram matrix and right-hand side, reconstructs coefficients from the returned
amplitude/phase/DC, and computes normal-equation residuals. A separate symmetric
3-by-3 cofactor calculation gives comparison coefficients. Direct residual
correlations and RMS values are also recorded. This diagnostic calculation calls
no production fitting helper. The code worker statically reviewed the window,
frequency, coefficient and matrix contracts before execution.

The [complete JSON](evidence/audio-numerical-functional-2026-11-20/diagnostic-1-default/output.json)
retains every returned analysis, measurement and verdict, both channel fits,
input/output digests, expected values, window identities, matrices and residuals.
It is **139,002 bytes**, SHA-256
`50536744fd47b60e21fb173db9cc5a8f944d48bf55e8a79a03f5a35576b5ed62`.
The [runtime metadata](evidence/audio-numerical-functional-2026-11-20/diagnostic-1-default/result.json)
records exit 0, 1.6996714810011326 seconds, no timeout and empty stderr. All 1,957
tracked hashes and the clean checkout remained unchanged.

| Fixture, two identical snapshots each | Returned lag, samples | Fundamental amplitude, either channel | Unrounded THD, % | Returned verdict |
| --- | --- | --- | --- | --- |
| Clean +3 dB | 137.0000000002201 | 0.1412537515151868 | 0.0000017893830381091873 | Pass |
| Cubic coefficient 20 | 137.0000579604457 | 0.11499999804310879 | 4.347825755868567 | Expected distortion/linearity fail |
| Runner numerical recording | 210.99999999855936 | 0.09999999824731663 | 0.0000017058720939289583 | Pass |

The analytical cubic fixture uses `x = 0.1 sin(t)` and `y = x + 20 x³`.
The identity `sin³(t) = (3 sin(t) - sin(3t))/4` gives fundamental amplitude
0.115 and third-harmonic amplitude magnitude 0.005, hence expected THD
`100 × 0.005 / 0.115 = 4.347826086956522%`. The returned aggregate THD is close
to that expectation. Production does not retain individual harmonic-fit
amplitudes in its result; no such internal trace is claimed here.

The clean and runner amplitudes are close to their respective analytical
values `0.1 × 10^(3/20)` and `0.1`. All returned clock estimates are approximately
`1.01e-10` ppm, producing 1,000 Hz for the compared tone window. All returned
balance, response-flatness and polarity measurements are zero in these six
outputs. The cubic result appropriately fails THD+N and linearity; diagnostic
exit 0 is not a claim that every fixture passed the device thresholds.

Every repeated snapshot is structurally identical and carries the same stored
digest. Both channel fits agree exactly within each call. The largest difference
between returned and independent coefficients is `1.3877787807814457e-17`;
the largest normal-equation residual is `4.1359030627651384e-25`. Directly
accumulated residual correlations have maximum magnitude
`1.313337821550001e-9` across 91,200 samples. Full input hashes are unchanged
across the batch. No material numerical inconsistency was observed in this
bounded sequence.

## Limits and next worker handoff

The runner diagnostic models its capture numerically. It does not execute the
runner's DOM, capture session, retry callbacks, persistence or predecessor tests.
It cannot explain or clear the failed unchanged lifecycle assertion. The
standalone tool also changes the call context from the original test file.

Static source ordering provides a specific question for successors: the cubic
failure is the third analyzer call in its file, after clean and calibrated-clean
calls. The retry is the third completed analysis in its file, after a setup run
at -12 dBFS and the default-level progress case. The intervening keyboard case
cancels before analysis, and failed-start rejects before analysis. This call
ordering is an observation, not a cause. The approved six-call sequence did not
reproduce those predecessor calls/options.

Root's next fresh workers will capture intermediate numerical evidence in the
actual failing lifecycle context while retaining unchanged production and
assertions. This initial trio proposes no speculative numerical patch. Existing
full-suite failures, hardware/scientific qualification, browser rendering,
native/platform and release gates remain separate. No browser/native retry,
package installation, remote mutation, security probe or vulnerability
reproduction occurred in this functional lane.

## Evidence integrity

The [verifier](evidence/audio-numerical-functional-2026-11-20/verify-evidence.py)
imports no application or test. It verified both complete tracked inventories
against immutable Git blobs: 1,956 paths/1,845 distinct blobs for the selection
and 1,957 paths/1,846 distinct blobs for the diagnostic. It also checked raw
output sizes/digests, counts, clean source metadata, copied tool/driver bytes,
repeated snapshot equality, historical full TAP digests and the four unchanged
source files across five freezes. See the
[verification record](evidence/audio-numerical-functional-2026-11-20/evidence-verification.json)
and [evidence README](evidence/audio-numerical-functional-2026-11-20/README.md).

Runtime files were written outside the checkout until the process and final
source snapshot completed, then copied byte-for-byte into this evidence folder.
Only the owned diagnostic tool, this report and its evidence are part of the
handoff. Root coordinates integration and the fresh successor set.
