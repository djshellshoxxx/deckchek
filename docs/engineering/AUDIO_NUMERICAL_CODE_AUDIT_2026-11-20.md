# Audio numerical pipeline — initial code audit

Reviewer: `/root/audio_code_round1`. Report date: 20 November 2026,
America/Los_Angeles. This is the initial audio diagnosis round after all six
reference/PDF workers completed.

## Scope and disposition

The review is focused on the preserved cubic-distortion failure and the
audio-runner retry's incorrect measurement verdict. It examines the actual
numerical helpers, their fixture inputs and the path from a fit to a saved
result. This lane executes no project, test, extracted application code or
numerical reproduction. The functional worker owns the separately authorized
runtime observations; this report distinguishes those observations from static
findings.

**Static inspection alone has not established the cause of either failure.**
The reviewed sine-fit implementation has local accumulators and a local copied
solver matrix; I found no explicit shared mutable numerical state or input
mutation in that path. An independently measured contradiction between its
returned fit and the supplied samples would be actionable evidence. Source
equality, a passing rerun, process timing or a runtime version alone would not
identify a cause.

The functional worker's new unchanged two-file run still fails the retry
verdict (**33 total / 32 pass / 1 fail**). Its separate six-call numerical
diagnostic produced consistent fits and expected fixture results. I inspected
both raw artifacts independently. **The failure remains open and no numerical
production repair is justified by this round's evidence.**

No production, fixture, threshold, unit, workflow or original evidence bytes
are changed by this lane. A numerical repair remains root-owned and must be
supported by the bounded diagnostic evidence below.

## Reviewed source and preserved outcomes

The isolated review branch is `review/deckchek-audio-code-20261120`, based on
commit `c67bd2a5d2bbe37ce0e97e0e8db4962a14c706ce`, complete tree
`9e2b38e1dcf681834f5ad9e2f356fa34862204c3`. The initial checkout was clean.

I read the [reference/PDF acceptance](PLAYER_REFERENCE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md),
its complete run metadata and failure blocks, the prior
[player acceptance](PLAYER_CAPTURE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md),
the [original issue-72 acceptance](REDACTION_FUNCTIONAL_ACCEPTANCE_2026-11-20.md)
and the retained diagnostic context. The principal outcomes remain separate:

| Source and observation | Retained outcome | Interpretation |
| --- | --- | --- |
| Original failed freeze `6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6` | 2,314 total / 2,312 pass / 1 fail / 1 optional skip; cubic value `16972224339301138` against `4.347826086956522` | Original issue-72 failure remains unresolved. |
| Prior passing freeze `f081881d4979e4385f255163660258784e27a264` | 2,332 total / 2,331 pass / 0 fail / 1 optional skip | A different complete invocation passed; this does not repair or explain the original failure. |
| Latest failed freeze `ded34d2dccfcf0ae51c78fa1492a57c161d32a1d`, tree `9030b4d9eeb307f27c0d794dccf4a37895c2a602` | 2,357 total / 2,354 pass / 2 fail / 1 optional skip | The same cubic value recurred; the retry fixture additionally failed its measurement verdict. |

All three were recorded on Node v24.22.3. The runtime executable is
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`.
The latest run's
[complete metadata](evidence/player-reference-acceptance-2026-11-20/full-suite.json)
records the exact executable, arguments, host and 1,943 unchanged tracked
hashes. Its [raw TAP](evidence/player-reference-acceptance-2026-11-20/full-suite.tap)
has SHA-256 `29ef19e0e0916e94e4c1ce0b27be3805f173375686cd522cf9aa8db11a77dec4`.
The original
[failed TAP](evidence/redaction-acceptance-2026-11-20/full-suite.tap)
retains SHA-256 `39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197`.
No failed artifact is replaced by a subsequent successful observation.

I independently compared these seven current files to the immutable blobs at
all three historical commits. Each is byte-identical across those sources:

| Path | SHA-256 at the review base and all three compared sources |
| --- | --- |
| `app/audio-quality.js` | `4f4ed3df91d6b923f4fe7edaede0fbe2b4b3c300c0fc97d07dbfe7d510225db6` |
| `app/calibration.js` | `ebab986c71064ee6aadcecc2659a97f0b403310daf027749c41702ce03df5d72` |
| `app/core.js` | `f048beb943d8a6bec1c37332543e4c3a6f55edd7d45d8a16ed86b965a598c247` |
| `app/devices/audio-session.js` | `bc6f0b0c5b401b8549462c65bfcccaa88358cd941871e82c5c8b48dbc652c2bb` |
| `app/ui/devices/audio-runner.js` | `29048fb5c1c7c622d254a01cff712ad6695247b7246da08fcc08eb56d705c909` |
| `tests/audio-quality.test.mjs` | `a7e4c1cd56e4543aed83cd9b3a7746c55f84bece6b09894f742a7ef7c5014a78` |
| `tests/audio-runner-lifecycle.test.mjs` | `27b2bae6bd871c55959dbbbebce798c7033aeb5505950ec307677263d4687708` |

That comparison narrows source-change hypotheses for these paths. It does not
establish an environmental or shared cause, or assert equality of unrelated
files/process state across complete invocations.

## Exact fixture contracts

### Cubic nonlinearity

The [quality fixture](../../tests/audio-quality.test.mjs) builds the real default
48 kHz stimulus. `simulate({ cubic: 20 })` uses playback scaling followed by
`x + 20*x**3`, a 137-sample delay and Float32 capture conversion. Its noise,
clock-warp, crosstalk-addition, inversion and dropout branches are disabled.
The initial failing analysis has no chain-floor correction. The failure occurs
before that test's later floor-subtraction and linearity checks.

In the unfaded 1 kHz tone region the intended sine amplitude is 0.1. Using
`sin³(t) = (3 sin(t) - sin(3t))/4`, the synthetic fundamental amplitude is
`0.1 + 3*20*0.1³/4 = 0.115`, the third-harmonic magnitude is `0.005`, and the
expected ratio is `100*0.005/0.115 = 4.347826086956522%`, subject to the fixture's
Float32 quantization. This is the fixture's mathematical contract, not a
physical-audio qualification.

### Failed capture start followed by retry

The [runner fixture](../../tests/audio-runner-lifecycle.test.mjs) records the
buffer actually played, applies its supplied playback level, delays it by
211 samples and adds a two-second tail. Its first capture-start call rejects;
the second supplies complete synthetic capture counters. Before the failing
status assertion, the test verifies no playback/save for the rejected start,
then exactly one playback and one saved result after retry.

The retained failure is `3 of 9 checks failed: balance, response, polarity.`
It is an incorrect synthetic measurement verdict at the reached assertion.
This does not establish an ownership failure or show that both preserved
failures have the same mechanism.

The source ordering has a useful, limited commonality: each failing assertion
follows the third completed `analyzeAudioQuality` call within its own test file.
The cubic case follows the clean and calibrated-clean analyses. The runner
retry follows analyses in the setup and progress cases; its keyboard-cancel
case and rejected capture-start attempt exit before analysis. This is a static
call-order observation, not proof of an optimization, runtime or common cause.

For both fixtures, **the shared tone regions are identical across left and
right; the complete channel buffers are not expected to be identical**.
The stimulus intentionally drives only one channel in each crosstalk segment.
This corrects my early working shorthand that called the whole inputs
identical. Relevant tone-slice bytes must be compared separately from full
input hashes.

## Independent numerical source review

| Component | Source contract and finding | Remaining evidence requirement |
| --- | --- | --- |
| [`detectMarkerLag`](../../app/calibration.js) | Normalized template correlation uses local energy/score arrays. At the quality analyzer's default two-second bound, the search is exhaustive; wider searches use coarse stride and local refinement. The final parabolic lag is converted to a shared integer slice shift. | Record the returned lag, exact slice boundaries and input preservation; no misalignment is established by source reading. |
| [`refineToneFrequency`](../../app/calibration.js) | Ten lock-in segments, phase unwrapping and phase-slope regression use local state. The analyzer averages finite left/right estimates into one shared `clockPpm`. No clock, scheduler or random input participates. | Record the returned frequency/clock and compare exactly the samples used at that frequency. |
| [`fitTone`](../../app/calibration.js) | Accumulates the Gram matrix and right-hand side for sine, cosine and DC; calls `solve3`; computes amplitude/phase and an explicit sample residual. It reads the input without mutation and returns a new object. | Compare returned coefficients against independently accumulated normal equations and direct residuals on the same slice. |
| `solve3` in [`calibration.js`](../../app/calibration.js) | Copies each matrix row and RHS into a local augmented array, uses partial row pivoting and Gauss-Jordan elimination, then divides each augmented result by its diagonal. I found no demonstrated indexing, aliasing or elimination defect from the static trace. | Preserve an actual inconsistent fit before considering a solver change. Lack of an explicit residual/conditioning certificate is a limitation, not the proved cause. |
| [`core.js`](../../app/core.js) dependencies | `rms`, `dbfs`, `clippingCount`, `humMetrics` and its Goertzel helper have local accumulation. `normalizeMeasurement` preserves supplied fields without independently verifying the numerical calculation. | Finite but incorrect data require a fit-validity check or corrected numerical calculation; a nonfinite guard alone cannot identify them. |

The default quality tone is two seconds, trimmed by 50 ms at each end. At
48 kHz, the diagnostic comparison therefore uses 91,200 samples. Production
computes one frequency `1000*(1 + clockPpm*1e-6)` and fits each channel
separately. A material difference between returned fits on byte-identical
tone slices at this same frequency would not be explained by the intentional
crosstalk sections or by a different per-channel clock adjustment.

For a returned fit, the sine coefficient is `amplitude*cos(phase)` and the
cosine coefficient is `amplitude*sin(phase)`. The least-squares normal equation
is `G*beta = rhs`, where `beta` contains these coefficients and DC. An
independent accumulation of `G`, `rhs` and residual correlations can distinguish
an inconsistent returned fit from a genuinely weak or wrong input. No new
measurement acceptance threshold is proposed by this diagnostic check.

## Fit-to-verdict trace

The [analyzer](../../app/audio-quality.js) divides harmonic RMS amplitude by
the fitted fundamental for THD, uses fitted residual RMS for THD+N, derives
gain and balance from fundamental amplitudes, and uses those fundamentals as
the frequency-response references. Polarity follows fitted phase after the
known slice-start correction. A wrong fundamental or phase can consequently
affect several measurements; this dependency explains what to inspect, but
does not establish that it occurred in either retained failure.

Input samples and options are checked before analysis. Missing markers or
short captures leave the analysis invalid. A channel below the existing tone
floor receives a warning; the analyzer still reaches `valid = true` after
constructing measurements. There is no separate normal-equation or residual
consistency certificate for a finite returned fit.

[`evaluatePass`](../../app/device-checks.js) returns `unknown` for unavailable
or nonfinite numeric measurements. Existing finite values are compared against
the unchanged threshold definitions. [`qualityResult`](../../app/devices/audio-session.js)
emits no measurements for an invalid analysis; otherwise it evaluates those
measurements. Incomplete/unobserved capture continuity separately forces an
unknown live verdict. These safeguards do not detect a finite numerical
calculation that is internally inconsistent with the supplied samples.

The [runner](../../app/ui/devices/audio-runner.js) passes the result status,
measurements, findings and extras into `ctx.finish`, without retaining the full
per-channel fit objects there. The retry assertion's detail therefore does not
contain enough intermediate data to identify the faulty numerical step.

## Diagnostic source review

I statically reviewed the functional worker's diagnostic source at commit
`b737144a3b2fdf00998c91ab0d5e810a872cf123`, tree
`89a753fc2cde21ef83fb7e4bcad101f2ff418a9c`, path
`tools/diagnostics/audio-numerical-context.mjs`, SHA-256
`be837d073d362149a5a28860608a766b305c020146a1c5a2132b87871c2eb5c7`.
I also inspected its metadata-only follow-up at
`c64d6b88c98f33a2ff42529f4e9235f005a047ee`, tree
`b91803abd3677f95241a62a4de45213dd4ec4003`, tool SHA-256
`ce4fccd54e68baca6620701d81a26a504ab06d94b6f4252f498c54b161ab6bde`.
That change names the two reconstructed slices and explicitly records their
byte equality; it changes no pipeline call, sampling rule or fit arithmetic.
The six-call sequence uses the unchanged production analyzer on the copied
clean +3 dB, cubic-20 and runner-delay-211 fixtures, then repeats that sequence.

The script snapshots all normal pipeline outputs before its independent
consistency arithmetic. It hashes full inputs before/after, reconstructs
production's lag/trim/frequency, and records the relevant tone-slice hashes.
Its coefficient reconstruction, symmetric cofactor calculation and residual
sign conventions match the inspected contracts. I found no material
diagnostic-contract error. The runner fixture models its numerical recording;
it does not reproduce the DOM/session lifecycle or the original test ordering.

## Independently inspected runtime evidence

These executions were performed by `/root/audio_functional_round1`, not this
code-review lane. I independently read their completed metadata and raw output,
recomputed the raw-output digests, and inspected the stored numerical fields.
The [functional report](AUDIO_NUMERICAL_FUNCTIONAL_AUDIT_2026-11-20.md) owns the
complete source-bound evidence and execution accounting.

### Actual unchanged two-file selection

On the exact review base `c67bd2a5d2bbe37ce0e97e0e8db4962a14c706ce`, the serial
selection of `tests/audio-quality.test.mjs` and
`tests/audio-runner-lifecycle.test.mjs` recorded **33 total / 32 pass / 1 fail**,
exit 1, no skip/cancellation/TODO or timeout. The cubic case passed; the retry
case again returned `3 of 9 checks failed: balance, response, polarity.`

The [execution metadata](evidence/audio-numerical-functional-2026-11-20/unchanged-selection/result.json)
records Node v24.22.3 from the exact runtime executable recorded above, without
`NODE_OPTIONS`, from `2026-11-21T07:15:26.523039+00:00` to
`2026-11-21T07:15:35.636848+00:00`. Its 1,956 tracked hashes and clean source
state remained unchanged. The
[raw TAP](evidence/audio-numerical-functional-2026-11-20/unchanged-selection/run.tap)
is **8,482 bytes**, SHA-256
`72372175dab192c8e851037de477f6084b11beeed8b4dda8a726f5c1040dfc69`.

This new failure demonstrates that the retry verdict problem is still present
in the actual selected lifecycle tests. It provides no intermediate fit data,
and cannot identify which numerical step produced that verdict.

### Six unchanged-analyzer calls

The reviewed final tool at `c64d6b88c98f33a2ff42529f4e9235f005a047ee` ran once
on Node v24.22.3 with no runtime flags or `NODE_OPTIONS`. Its
[execution metadata](evidence/audio-numerical-functional-2026-11-20/diagnostic-1-default/result.json)
records exit 0 in 1.699671481 seconds, empty stderr, no timeout and 1,957
unchanged tracked hashes. The tool's addition is the only source change from
the reviewed base; its recorded production and fixture digests match the
table above.

The [complete JSON](evidence/audio-numerical-functional-2026-11-20/diagnostic-1-default/output.json)
is **139,002 bytes**, SHA-256
`50536744fd47b60e21fb173db9cc5a8f944d48bf55e8a79a03f5a35576b5ed62`.
Both repetitions of each fixture produced identical serialized output hashes.
All full input hashes stayed unchanged; all reconstructed tone slices were
91,200 samples and byte-identical across channels. The full buffers correctly
reported unequal L/R content because of the separate crosstalk sections.

| Fixture, twice each | Returned fundamental amplitude, both channels | Returned lag, samples | Unrounded THD, % | Verdict |
| --- | --- | --- | --- | --- |
| Clean +3 dB | `0.1412537515151868` | `137.0000000002201` | `0.0000017893830381091873` | Pass |
| Cubic 20 | `0.11499999804310879` | `137.0000579604457` | `4.347825755868567` | Expected distortion/linearity fail |
| Runner recording | `0.09999999824731663` | `210.99999999855936` | `0.0000017058720939289583` | Pass |

The cubic verdict failed only `thdn` and `linearity`, as expected for the
deliberately nonlinear fixture; it is not the unexpectedly enormous THD
failure. Clock estimates were approximately `1.01e-10` ppm and the resulting
numeric fit frequency was exactly 1,000 Hz in each recorded comparison.
Per-channel fitted phase, DC and residual RMS also matched between channels.

The independently accumulated Gram matrices were nearly diagonal, with
diagonal entries approximately `(45600, 45600, 91200)`. The independently solved
amplitudes agreed with the returned amplitudes within approximately `1.39e-17`.
The largest recorded normal-equation residual magnitude was approximately
`4.14e-25`. Separately accumulated sample-residual correlations reached
approximately `1.31e-9`, against fundamental RHS values approximately
4,560–6,441; their difference from the algebraic residual is consistent with
the distinct floating-point accumulation order. Direct residual RMS computations agreed
with the returned values for these observations. These results show no
materially inconsistent returned fit in this bounded diagnostic.

### Resulting disposition and successor question

The six-call diagnostic **does not reproduce or explain the actual lifecycle
failure**, and does not provide evidence for a numerical production correction.
The conditional comparison under a no-optimization runtime mode is not
justified by the consistent result. A different process, fixture sequence and
call context passed; the earlier failures remain failed.

The next useful evidence is the actual failing lifecycle invocation's recorded
input identity, level/rate/metadata, marker lag, tone slice, clock estimate,
returned per-channel fit and resulting measurements. It must preserve the
original assertions and separately identify any diagnostic instrumentation.
That evidence can distinguish bad inputs/alignment from an inconsistent fit
or later measurement derivation before a root-owned repair is selected. This
is a handoff question, not an additional execution performed by this lane.

The static third-call observation remains a clue only: the tool's third call
used the runner numerical fixture and passed, but its preceding inputs and
lifecycle context differ from the failing test. No common, scheduler, hardware,
JIT or runtime-engine cause is established.

## Handoff boundaries

Root owns any narrow production correction, the combined acceptance run and
the next fresh worker rotation. The preserved failures, issue #72, #69/AC-6,
original Spec 10 requirements, fixed Fleet failure/default-off posture and
unchanged thresholds remain. This review establishes no physical, scientific,
browser, native/platform or release qualification. It makes no runtime-engine
defect claim.
