# Audio retry context — fresh code audit

Reviewer: `/root/audio_code_round2`. Review date: 20 November 2026,
America/Los_Angeles. This worker began after all three initial numerical
workers completed. This lane performed static source and retained-evidence
review only; it executed no application, test, extracted numerical code,
browser, probe or scanner.

**Disposition: held.** The second, distinct diagnostic reproduced both the
original cubic failure and the retry's unexpected verdict. It captured a
specific inconsistent-looking derived-measurement pattern in the actual retry
completion. That narrows the next trace to reads of the fundamental fit between helper calls;
it does not establish an object mutation, solver, intrinsic or runtime cause,
and no production repair is proposed by this round.

## Source and scope

The review base is `8dbef3a91f4d88d01ec5a570265258443fd7f3cc`, complete tree
`9f3376e0e936abb6df4c1bc73ce91aa1d7581224`. The isolated branch is
`review/deckchek-audio-code-context-20261120`. This report is the only file
owned or changed by this reviewer. Root owns any production correction; the
functional successor is the sole project runtime executor.

I read the initial [code](AUDIO_NUMERICAL_CODE_AUDIT_2026-11-20.md),
[functional](AUDIO_NUMERICAL_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](AUDIO_NUMERICAL_SECURITY_AUDIT_2026-11-20.md) reports, retained
evidence and the actual runner, session, analysis, fitting, measurement and
threshold sources. Prior conclusions are context, not a substitute for this
independent source review.

## Preserved evidence

I independently checked all 19 entries in the initial functional evidence's
`SHA256SUMS`, resolving each name relative to its evidence directory. These
complete raw artifacts were also read and hash-checked:

| Observation | Bytes | SHA-256 |
| --- | ---: | --- |
| Original complete cubic failure, 2,314 total / 2,312 pass / 1 fail / 1 skip | 530,581 | `39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197` |
| Reference/PDF complete failure, 2,357 total / 2,354 pass / 2 fail / 1 skip | 541,141 | `29ef19e0e0916e94e4c1ce0b27be3805f173375686cd522cf9aa8db11a77dec4` |
| Unchanged two-file selection, 33 total / 32 pass / 1 fail | 8,482 | `72372175dab192c8e851037de477f6084b11beeed8b4dda8a726f5c1040dfc69` |
| Separate six-call numerical diagnostic | 139,002 | `50536744fd47b60e21fb173db9cc5a8f944d48bf55e8a79a03f5a35576b5ed62` |

The last diagnostic produced consistent numerical outputs for its own sequence;
it did not exercise the failed lifecycle. Neither its successful exit nor a
later successful test invocation replaces either complete failure. The two-file
selection's retry reached one playback and one saved result before returning
the unexpected balance/response/polarity verdict. It did not demonstrate an
ownership failure.

## Independent lifecycle and numerical trace

The [runner fixture](../../tests/audio-runner-lifecycle.test.mjs) constructs a
fresh runner and I/O closure for the retry case. Its rejected first capture
start occurs before playback. The successful second attempt records the actual
played buffer, applies the supplied play level, delays it by 211 samples and
adds a two-second tail. This case does not intentionally modify channel
balance, phase or response.

The first setup test ends at **-12 dBFS**. The progress and retry defaults are
also **-12 dBFS**: `safePlayLevel(undefined)` uses `DEFAULT_PLAY_LEVEL_DBFS`,
which equals the output cap. Their lifecycle history differs, but the words
"setup" and "default" do not establish different numerical play levels. Static
source order places the retry after the third completed analyzer call in that
file; that ordinal is not evidence of a runtime or common cause.

`runQualitySession` builds new stimulus data, owns its capture/playback, obtains
the actual rate/device, checks calibration applicability, invokes the analyzer,
then evaluates its measurements. Continuity evidence is considered separately.
`qualityResult` retains the full analysis in the session result. The UI's
completion payload retains status, detail, criterion, measurements, findings
and extras, including response, thresholds, capture and calibration context.
It does **not** retain exact tone slices or internal per-channel fits.

The analyzer shares one lag-derived shift and one clock-adjusted frequency
across the two channel fits. Shared tone slices have identical intended input
samples in this fixture; the full stereo buffers intentionally differ in their
crosstalk segments. Balance uses fundamental gains, response uses each channel's
own fundamental as its reference, and polarity uses fitted phase. Unexpected
outputs identify data to inspect, but do not by themselves prove a fit, math
intrinsic, solver, engine or scheduling defect.

The normal-equation construction and local copied Gauss-Jordan matrix in
`fitTone`/`solve3` have no demonstrated indexing or aliasing defect from this
review. `normalizeMeasurement` preserves supplied values; `evaluatePass`
compares the latest metric against a finite criterion and rejects unavailable
numeric values as unknown. These observations distinguish stages without
certifying a finite numerical output against its samples.

## First diagnostic source review

The functional worker prepared clean commit
`5b340667e21c2d7d5bf25ed7116ed1b21cc3acb3`, complete tree
`1e191df434541fbb7c36c84f739a26ac6b979626`.

Only `tests/audio-runner-lifecycle.test.mjs` differs from the review base:
12 added lines and one removed line augment the existing retry assertion's
third, message argument. Actual status and expected `pass` remain unchanged.
All 18 test declarations, their order, fixture arithmetic, predecessor cases,
timing hooks and production paths remain unchanged.

The message serializes the already returned completion payload, already used
playback options/device, sample rate, channel frame counts and call counters.
It executes after analysis and the one-playback/one-save assertions. It imports
no helper, adds no analysis call and reconstructs no numerical intermediate.
Nonfinite numbers use an explicit `nonFiniteNumber` object instead of silently
becoming JSON null. This is completed-result evidence, not raw internal-fit
evidence or an input-byte identity proof. The message is evaluated on a pass
as well; later cases see that serialization cost. Identical timing is not claimed.

The original test SHA-256 is
`27b2bae6bd871c55959dbbbebce798c7033aeb5505950ec307677263d4687708`.
The diagnostic test SHA-256 is
`23c927d59d803241b7be45f653a9dbbbf6ccfd7be8b1ffa54a4dfb0815b0dede`.
I independently verified both hashes, all 18 declarations and the single changed
path. I sent the finding of no evidence-fidelity blocker before execution.

## First source-bound runtime observation

The functional successor executed the complete 18-case runner file once on
Node **v24.22.3**, with no test-name filter. The retained TAP records **18 total /
18 pass / 0 fail / 0 skip**, exit 0, no timeout and empty stderr. The complete
TAP is **4,592 bytes**, SHA-256
`0f06673c12933ab9707110356c3d073cf895ce9adc73a8584a91c5c87ef2ebf7`.
I independently read its complete contents and recomputed that digest.
The functional worker retains the [TAP](evidence/audio-context-functional-2026-11-20/runner-message/run.tap),
[metadata](evidence/audio-context-functional-2026-11-20/runner-message/result.json)
and both full hash maps alongside the original and instrumented test sources.

Metadata binds the invocation to the reviewed `5b340667` source/tree, the
absolute Node executable, 1,994 unchanged tracked hashes and clean state before
and after. I also independently compared both complete 1,994-path hash maps;
they are equal. Elapsed time was 3.4984282569985226 seconds. The retry passed at its
original fourth case position, so the assertion emitted **no numerical context**.
This is a passing instrumented observation, not a reproduction, cause or repair.
The original failed full and two-file outcomes remain unresolved.

## Second diagnostic source review

Root authorized one distinct observation using the original two-file selection,
after source review. The frozen aggregate source is
`f26c247a44a70dd1e19f08ee1bee6dad7fe2f864`, complete tree
`0c24c00e4e3748992371c8d90303859a22f5dd4e`. I reviewed the initial aggregate
at `eb48e88868bfb2335c529c156adf334480cb587d` and its two metadata wording
corrections at the final source. No further runtime observation is authorized
by this review.

The opt-in is `DECKCHEK_AUDIO_CONTEXT_PATH`. The existing test finish callback
still first appends the result to `finished`; only when the variable is set
does it retain result, playback and actual live-fixture recording references.
It records per-mount identity, the actual capture attempt, used options and
small call-counter snapshots. No sample copy, hash, serialization or numerical
helper runs there. The final `after` hook dynamically imports a serializer that
has no application imports, hashes typed-array byte ranges, and writes a new
artifact with exclusive creation (`wx`). It does not overwrite an existing log.

All 18 runner test declarations and the 118 assertion-call sequence remain
unchanged. The original audio-quality test file and production/native sources
are unchanged. The runner test SHA-256 is
`fc243f8b4bd2eb312a6275664d7ddd737b2ce44d7524cf0423e49b10a0949c2d`.
The final serializer SHA-256 is
`357df630ce649aa3481b8b0094693ec942acb0493888c2a4ae1da670cf706584`.
These identities were independently verified before execution.

The serializer includes input hashes only when the completed result identifies
its source as `live`. File input stays null and explicitly unobserved, even if
an I/O closure had an earlier live value. In the fault fixture, the outer wrapper
changes capture-quality fields after the inner fixture returns; the retained
audio/options do not claim to be that final envelope. The completed result's
extras retain the actual final integrity state and quality fields separately.

The finish callback now returns undefined rather than `Array.push`'s length;
the inspected production runner ignores that return value. No dependent
contract was found. More materially, retaining results and buffers extends
their lifetimes into later analyses and adds small allocations. This changes
execution context even though heavy processing waits until all original runner
cases complete. Delayed hashes prove post-suite byte identity, not immutable
entry snapshots or before/after input preservation. Raw internal fits and
unrounded lag/clock fields remain absent; rounded latency/clock measurements
are retained. These limitations are explicit in the diagnostic output and
prevent a changed result from being assigned a memory or engine cause.

## Disposition and boundaries

### Second source-bound runtime outcome

The original two-file selection at the reviewed `f26c247a` source ran once on
Node **v24.22.3**: **33 total / 31 pass / 2 fail / 0 skip**, exit 1, no timeout
or stderr, in 8.723452965001343 seconds. Both complete 2,007-path tracked hash
maps match; I independently compared them. The recorded source/tree and clean
checkout remained unchanged. The failures are the original cubic value
`16972224339301138 vs 4.347826086956522` and the retry's balance/response/polarity
verdict. No third invocation followed.

| Retained artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Complete TAP](evidence/audio-context-functional-2026-11-20/two-file-aggregate/run.tap) | 17,250 | `a0e332853ada66bfb42194b0a7aaabf552df5464c4023d538a9d0cd0787e3802` |
| [Completed-result aggregate](evidence/audio-context-functional-2026-11-20/two-file-aggregate/contexts.json) | 144,256 | `872571803365a4bcfbd23ed31c921902d614c248ad34f1ec3ab07e2626521a6a` |

I independently read and hash-checked these files, parsed the retry JSON
embedded in the failing assertion message, and compared it with aggregate
result 3. The result and recorded call counters are exactly equal. Thus the
recorded derived values were already present at the assertion, rather than
appearing only in the delayed aggregate snapshot.

The aggregate contains ten completed results: eight live and two file results.
All eight live captures share the same post-suite 48 kHz input identities:
left `851d0bd53a969a6af4b6334256138ebf732496b67192b20919b09a6d7b26bd32`,
right `488bc6ae51a99511d62a7913aa0f98c49c122fb988e4facae75429614c714f05`.
Each channel has 675,091 Float32 samples. Their last playback identities,
options and output device also match, including -12 dBFS level. Both file
inputs remain explicitly unobserved. I verified these comparisons directly
from the aggregate; they retain the delayed-reference limitations above.

Only the retry has a different live metric-value map. The preceding clean
results have zero gain, balance and response deviation; retry result 3 records:

| Field | Retained retry value |
| --- | --- |
| Output gain, stereo mean | -110 dB |
| Channel balance, left minus right | -220 dB |
| Every response point | Left +220 dB; right 0 dB; mean +110 dB |
| Response flatness | 220 dB |
| Polarity inverted | 1 |
| THD | 6,935,867,070.3903% |
| THD+N | 0% after four-decimal rounding; its dB field is -151.12 dB |
| SNR | 217 dB |
| Rounded clock / latency | 0 ppm / 4.4 ms |
| Additional finding | Left channel below -70 dBFS during the tone |

The retry has no applied calibration, and its capture-quality and calibration
fields equal the preceding pass. Its integrity remains observed. The stored
threshold details correctly compare the recorded values: balance, response
and polarity fail; THD+N passes against its rounded zero. This is numerical
measurement evidence upstream of the threshold decision, rather than a
demonstrated comparator or capture-ownership defect. The deliberately faulted
live case separately remains unknown, and the deliberate stereo-response file
case correctly remains fail; these are expected fixture outcomes.

### Narrowed successor question

The source computes `toneRms` from `fit.amplitude` immediately after the
fundamental fit, then derives THD+N from that cached scalar. It next calls
`fitTone` repeatedly for harmonics and rereads `fit.amplitude` for THD. Gain,
the low-tone finding and response references also reread that object later,
whereas SNR uses the earlier `toneRms` scalar. The captured mixture of low
THD+N/high SNR and the left fundamental-floor pattern makes those boundaries
the next useful observation points. The exact 220 dB fingerprint is consistent
with existing 1e-12 amplitude floors relative to the intended -20 dBFS tone;
the underlying unrounded fit was not captured, so its value is not asserted.

A fresh successor should preserve the same fundamental fit's fields and
identity immediately after return, after the harmonic loop, and after the
low/high fits, together with the actual tone slice/rate/frequency and input
identity at entry. It should distinguish a changing result object, a changed
input, an inconsistent scalar calculation and later derivation before choosing
a correction. The retained code returns new fit objects; no explicit mutating
alias was found. The current artifact cannot prove that an object changed or
assign an engine cause. A speculative solver replacement, amplitude clamp,
threshold change or blanket conversion to review would not establish repair.

No production correction is justified by the present evidence. This worker's
review and source-bound analysis are complete; the functional report owns the
two runtime invocations. Root coordinates any new diagnostic in a fresh round.

Issue #72 and the complete reference/PDF qualification hold remain unresolved.
Original failures, prior passes and diagnostics retain their own source/runtime
identities. No threshold, tolerance, skip, permission or feature default is
weakened. Fixed PR #74 and the original Fleet diagnostic are untouched.
Browser layout, native/platform behavior, physical audio and scientific
qualification remain separate. Root coordinates the current trio's completion
before any further fresh-worker handoff.
