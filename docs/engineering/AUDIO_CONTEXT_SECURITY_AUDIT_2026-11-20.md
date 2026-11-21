# Audio retry context — fresh defensive source audit

Reviewer: `/root/audio_security_round2`. Review date: 20 November 2026,
America/Los_Angeles; execution records use UTC on 21 November. This fresh round
began after all three initial audio workers completed.

## Disposition

**No new security vulnerability or supported production correction is established.**
The first fresh diagnostic passed without emitting a failing numerical payload;
the distinct second diagnostic captured both original failures and the retry's
unexpected finite measurements. The original failure evidence and combined
reference/PDF qualification hold remain. Diagnostic source fidelity and numerical
correctness are separate questions; the observations below do not identify a cause.

## Scope and source

This lane performs static defensive source review and reads retained evidence.
It executes no application, test, browser, native component, extracted numerical
code, scanner, probe or vulnerability reproduction. Only this report is authored
here. Runtime observations belong to the functional worker and remain separately
identified. Root owns any production correction.

| Role | Immutable identity |
| --- | --- |
| Fresh review base | `8dbef3a91f4d88d01ec5a570265258443fd7f3cc` |
| Fresh review complete tree | `9f3376e0e936abb6df4c1bc73ce91aa1d7581224` |
| Diagnostic test source | `5b340667e21c2d7d5bf25ed7116ed1b21cc3acb3` |
| Diagnostic complete tree | `1e191df434541fbb7c36c84f739a26ac6b979626` |
| Aggregate diagnostic source | `f26c247a44a70dd1e19f08ee1bee6dad7fe2f864` |
| Aggregate diagnostic complete tree | `0c24c00e4e3748992371c8d90303859a22f5dd4e` |
| Isolated review branch | `review/deckchek-audio-security-context-20261120` |

The fresh base includes all initial reports and evidence. A Git comparison of
`app`, `src-tauri` and `tests` against initial base
`c67bd2a5d2bbe37ce0e97e0e8db4962a14c706ce` is empty. The new diagnostic commit
changes only the existing retry assertion's message in
[the runner lifecycle test](../../tests/audio-runner-lifecycle.test.mjs).

## Preserved evidence independently checked

I read the initial [code](AUDIO_NUMERICAL_CODE_AUDIT_2026-11-20.md),
[functional](AUDIO_NUMERICAL_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](AUDIO_NUMERICAL_SECURITY_AUDIT_2026-11-20.md) handoffs. All 19 entries
in the initial functional evidence's `SHA256SUMS` matched their retained bytes.
The following original artifacts were independently hashed again; they were
not executed or modified in this lane.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Original failed full TAP](evidence/redaction-acceptance-2026-11-20/full-suite.tap) | 530,581 | `39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197` |
| [Reference/PDF failed full TAP](evidence/player-reference-acceptance-2026-11-20/full-suite.tap) | 541,141 | `29ef19e0e0916e94e4c1ce0b27be3805f173375686cd522cf9aa8db11a77dec4` |
| [Initial unchanged two-file TAP](evidence/audio-numerical-functional-2026-11-20/unchanged-selection/run.tap) | 8,482 | `72372175dab192c8e851037de477f6084b11beeed8b4dda8a726f5c1040dfc69` |
| [Initial six-call diagnostic JSON](evidence/audio-numerical-functional-2026-11-20/diagnostic-1-default/output.json) | 139,002 | `50536744fd47b60e21fb173db9cc5a8f944d48bf55e8a79a03f5a35576b5ed62` |

The reference/PDF gate remains **2,357 total / 2,354 pass / 2 fail / 1 optional
Mixxx skip**. It retains the enormous cubic THD assertion and the retry verdict
failure. The initial unchanged selection remains **33 total / 32 pass / 1 fail**:
cubic passed and retry failed balance, response and polarity after one playback
and one saved result. The separate six-call diagnostic was internally consistent
for its three synthetic fixtures. It did not exercise the actual lifecycle or
preserve its predecessor options. None of these observations establishes a
shared cause, engine defect, environmental explanation or repair.

## Diagnostic source fidelity

I reviewed the complete `5b340667` diff before its authorized execution. The
original test's SHA-256 is
`27b2bae6bd871c55959dbbbebce798c7033aeb5505950ec307677263d4687708`;
the instrumented test's SHA-256 is
`23c927d59d803241b7be45f653a9dbbbf6ccfd7be8b1ffa54a4dfb0815b0dede`.

All 18 test declarations and their source order remain identical. The retry
assertion still compares `m.finished[0].status` with the same expected `pass`.
Its preceding one-playback and one-finished-result assertions, lifecycle calls,
fixture generation, waits and subsequent checks are unchanged. No condition,
tolerance, threshold or skip is weakened.

The only added evaluation constructs a diagnostic message after the production
analysis and completed result already exist. It serializes that synthetic result,
already-used playback options, sample rate, frame counts, output descriptor and
call counters. It does not add imports, capture hooks, numerical reruns, filesystem
access or network activity. It omits waveform arrays. Existing fixture labels
are synthetic; this change adds no product telemetry or real-device logging.

Nonfinite numbers are represented explicitly as `nonFiniteNumber` strings instead
of silently becoming JSON null. This makes the diagnostic distinguish numerical
unavailability from a literal null. The serializer does not alter the result
object or the original actual/expected assertion values.

No newly inserted work executes before this retry's calculated verdict or its
predecessor analyses. Constructing the message still has a cost after the result,
so this report does not claim identical runtime timing for later cases. A changed
test with additional diagnostic text is not called an unchanged-source rerun.

### First source-bound result

The functional worker executed the complete 18-case runner file once at the
reviewed diagnostic commit on Node **v24.22.3**, with serial test execution and
`NODE_OPTIONS` absent. Its recorded command names only
`tests/audio-runner-lifecycle.test.mjs`. The run returned **18 total / 18 pass /
0 fail / 0 skip**, exit 0, no timeout and empty stderr, in 3.498428257 seconds.
The metadata records a clean checkout and all 1,994 tracked hashes unchanged.

I independently read and hashed the
[raw TAP](evidence/audio-context-functional-2026-11-20/runner-message/run.tap):
**4,592 bytes**, SHA-256
`0f06673c12933ab9707110356c3d073cf895ce9adc73a8584a91c5c87ef2ebf7`.
The retained before/after hash maps compare equal with 1,994 entries.
It emitted no failure message and therefore captured no failing numerical
payload. This is a passing, instrumented, single-file observation. It neither
replaces the actual failed two-file/full runs nor establishes that the assertion
message fixed anything. No production calculation changed.

### Distinct aggregate diagnostic source review

Root authorized one distinct followup after both static reviewers checked its
frozen diff. Initial candidate `eb48e888` was followed by two clarifying
limitation strings at final source `f26c247a`; the test body did not change.
Its runner test SHA-256 is
`fc243f8b4bd2eb312a6275664d7ddd737b2ce44d7524cf0423e49b10a0949c2d`.
The final [serializer](../../tools/diagnostics/audio-context-serialize.mjs) has
SHA-256 `357df630ce649aa3481b8b0094693ec942acb0493888c2a4ae1da670cf706584`.
The application, native source and audio-quality test remain unchanged. All
18 runner case declarations and their order remain equal to the base; all
118 assertion-call names remain in the original order. Source review confirms
the original tested conditions and expected values remain intact.

The test enables collection only when `DECKCHEK_AUDIO_CONTEXT_PATH` is supplied.
After the original finish callback stores a result, the harness keeps that
result, a per-mount identity, live fixture audio/options/attempt references and
small call-counter snapshots. It performs no audio analysis, copying of sample
arrays or hashing between analyses. A final after hook imports the serializer,
hashes the retained typed arrays and writes one JSON file at the explicit path.
The file is opened with `wx`, so an existing observation is not overwritten.
The finish callback now returns undefined instead of the array push length;
the inspected runner does not consume that return value.

The serializer imports only Node's hash primitive. Its output contains buffer
types, lengths, byte counts and hashes, selected capture/playback options,
synthetic results and counters. It does not export waveform bytes, invoke a
shell, make a network request or add production telemetry. Capture callback
functions and abort signals are not selected for serialization. Imported-file
input identities and attempt numbers are explicitly null/unobserved; they
cannot inherit a prior live capture identity. The original result's final
capture-integrity extras remain distinct from the inner fixture audio/options,
including the deliberately wrapped fault case.

This diagnostic introduces harness allocations and retains references longer
than the original tests. That changes memory lifetime and execution context
even though expensive serialization is deferred. Post-suite hashes describe
those references at serialization time; they are not immutable snapshots at
analyzer entry or proof of unchanged inputs. The finish payload omits raw
internal fits and unrounded lag/clock fields, while rounded latency/clock
measurements remain available. The helper does not reconstruct missing fields.
A difference in outcomes cannot by itself establish a memory, timing or
runtime-engine cause. No defensive blocker was found in this bounded diagnostic
source. No third runtime observation is authorized in this round.

### Second source-bound result: original failures captured

The sole functional executor ran the original two-file selection once at
`f26c247a`: audio-quality followed by the runner lifecycle cases, on Node
**v24.22.3**, serial execution and `NODE_OPTIONS` absent. It recorded **33 total /
31 pass / 2 fail / 0 skip**, exit 1, no timeout, empty stderr and 8.723452965 seconds.
The exact source/tree and clean checkout stayed unchanged. I compared the retained
before/after maps directly: all **2,007** entries are equal.

| New artifact independently read and hashed | Bytes | SHA-256 |
| --- | ---: | --- |
| [Complete failed TAP](evidence/audio-context-functional-2026-11-20/two-file-aggregate/run.tap) | 17,250 | `a0e332853ada66bfb42194b0a7aaabf552df5464c4023d538a9d0cd0787e3802` |
| [Complete aggregate context](evidence/audio-context-functional-2026-11-20/two-file-aggregate/contexts.json) | 144,256 | `872571803365a4bcfbd23ed31c921902d614c248ad34f1ec3ab07e2626521a6a` |
| [Extracted immediate retry message](evidence/audio-context-functional-2026-11-20/two-file-aggregate/extracted-retry-message.json) | 12,612 | `6d88c78271a87246d2bc67e59349ef0d7c15cdb1f91e91217b33e85c309b53bc` |

The cubic case repeats `16972224339301138 vs 4.347826086956522`. The retry again
fails balance, response and polarity. I parsed the retry JSON directly from the
raw TAP and checked both its extracted copy and the final aggregate: its result
is structurally identical in all three. This rules out a difference between
those retained representations, without proving anything about earlier
intermediate fit values or input bytes.

There are ten completed result payloads: eight live synthetic cases and two
imported-file cases. The first two live results pass; the third is the failed
retry. Its captured counters show two capture-start attempts, one playback, one
test save callback, one owned stop of handle 7, one capture stop, no global stop
and no cancellation. Its live continuity is observed, with no reasons, and
calibration state is none, as in the preceding passing cases. These tests model
audio I/O and DOM operations; they did not operate real devices or a database.

| Stored measurement | First two live results | Retry result |
| --- | ---: | ---: |
| Gain, dB | 0 | -110 |
| Left-minus-right balance, dB | 0 | -220 |
| Response flatness, dB | 0 | 220 |
| Inverted-polarity flag | 0 | 1 |
| THD, percent | 0 after rounding | 6,935,867,070.3903 |
| THD+N, percent | 0 after rounding | 0 after rounding |
| THD+N, dB | -151.12 | -151.12 |
| SNR, dB | 217 | 217 |
| Latency, ms | 4.4 | 4.4 |
| Clock offset, ppm | 0 after rounding | 0 after rounding |

The retry also retains a warning that the left channel is below −70 dBFS. Its
threshold results correctly compare the supplied finite values: absolute balance 220
exceeds 0.5 dB, response 220 exceeds 1 dB, and polarity 1 differs from expected
0. The source trace and matching threshold details direct further review to
the numerical values before thresholding; they do not demonstrate a threshold
mapping error. The differing distortion and level observations motivate a trace
of the raw fundamental-fit fields across their uses. Those fields are absent
here, so this review assigns no solver, aliasing, mutation, timing or engine cause.

All eight live records have equal post-suite input identities and equal final
playback records/options, including 48 kHz, -12 dBFS playback and a -12 dBFS cap.
The left and right channel hashes differ from each other, as expected for the
intentional crosstalk sections. Each capture channel has 675,091 samples. This
comparison identifies the retained buffers at final serialization, not immutable
analyzer-entry inputs. Both imported-file input identities and attempt numbers
remain null/unobserved.

The deliberately faulted live case still has status unknown, incomplete capture
integrity and the original 1,024 overrun samples/device-error reasons. The
deliberate stereo-response file case fails, and the clean file case passes with
unobserved original continuity, matching their existing contracts. These
separate outputs do not clear the failed retry or establish physical validity.

## Defensive interpretation of the actual result path

I independently reread the relevant producer and consumer boundaries:

- [Numerical analysis](../../app/audio-quality.js) rejects nonfinite input samples
  and invalid capture/rate/options before producing measurements. Its finite fit
  fields are used to derive gain, distortion, balance, response and polarity.
  [Tone fitting](../../app/calibration.js) does not supply an independent
  conditioning or correctness decision for a finite returned fit.
- [Threshold evaluation](../../app/device-checks.js) marks unavailable/nonfinite
  measurements unknown. `evaluateAudioQuality` preserves failed and unavailable
  checks separately and does not turn unavailable evidence alone into PASS.
- [The session](../../app/devices/audio-session.js) suppresses saved measurements
  for invalid analysis. Faulted or unavailable live continuity forces a nonempty
  result to unknown with an explanatory finding and session evidence.
- [The runner](../../app/ui/devices/audio-runner.js) checks generation ownership
  after asynchronous completion. A completed failed measurement may be saved;
  one save is not itself a passing result or proof of physical correctness.
  `ctx.finish` receives status, detail, measurements, findings and extras, while
  the internal analysis object is not part of this completion payload.
- [The compact result builder](../../app/devices/dispatch.js) retains compact
  measurement values, explanatory findings and session extras. The surrounding
  finish/save path separately retains the final status. Its omission of optional
  per-measurement flags/origin/confidence
  remains the previously traced schema limitation; no new audio enforcement
  consumer failure is established by this diagnostic-only change.

No new command, native permission, SQL construction or HTML execution boundary
is introduced by the assertion message. The unresolved measurement failure is
not evidence of malicious input, an authorization bypass or a capture-ownership
defect. Finite-value validation alone cannot establish a fit's consistency with
its samples; that remains a numerical qualification question requiring the
separately captured evidence.

## Continued qualification boundaries

The first complete failure and every narrower observation remain preserved.
Issue #72 and the reference/PDF hold remain open. The initial defensive review's
distinction between live continuity and an imported waveform threshold result
is unchanged. No arbitrary clamp, threshold adjustment, blanket conversion of a
real failure to review or speculative numerical patch is proposed here.

This lane supplies no physical, scientific, browser, native/platform or release
qualification. #69/AC-6, original Spec 10 requirements, fixed Fleet evidence,
Fleet's default-off state, permissions and thresholds are unchanged. Fixed
PR #74 is outside this diagnostic modification. Root coordinates any successor
fix and the next worker rotation after all three current workers complete.
