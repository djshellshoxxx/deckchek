# Audio numerical boundary — initial defensive source audit

Reviewer: `/root/audio_security_round1`. Review date: 20 November 2026,
America/Los_Angeles. This initial audio round follows completion of the initial
and fresh reference/PDF workers.

## Disposition

**No new security vulnerability is established by this static review. Audio
qualification remains held by the recorded numerical failures.** Finite inputs,
completed analysis, a passing threshold comparison and a saved record establish
different facts. The actual result path distinguishes unavailable measurements
and incomplete live capture evidence, but it does not independently establish
the correctness of a finite tone-fit result. Neither recorded failure establishes
an exploit, capture-ownership defect, common cause or runtime-engine defect.

This lane authored only this report. It changed no application code, test,
threshold, permission, feature flag or scientific criterion. It executed no
application, test, browser, native component, package audit, scanner, probe or
vulnerability reproduction. Local Git inspection, text reads and evidence hashing
were the only verification performed here. Runtime observations below belong to
retained functional-worker evidence, not to this reviewer.

## Exact source and retained failure evidence

| Role | Immutable identity |
| --- | --- |
| Audited source | `c67bd2a5d2bbe37ce0e97e0e8db4962a14c706ce` |
| Audited complete tree | `9e2b38e1dcf681834f5ad9e2f356fa34862204c3` |
| Isolated review branch | `review/deckchek-audio-security-20261120` |
| Retained failed full-suite source | `ded34d2dccfcf0ae51c78fa1492a57c161d32a1d` |
| Retained failed full-suite tree | `9030b4d9eeb307f27c0d794dccf4a37895c2a602` |
| Durable exact-tree equivalent of that execution source | `b8bf6ea10791b05a2188d176ae8b996528a10f08` |

The audited numerical, session, runner, threshold, result-summary and persistence
files are unchanged from the retained execution source. Independently inspected
Git diffs also show that `app/audio-quality.js`, `app/calibration.js`,
`tests/audio-quality.test.mjs` and `tests/audio-runner-lifecycle.test.mjs` match
both original failed `6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6` and earlier
passing `f081881d4979e4385f255163660258784e27a264`. Source equality does not
identify a cause.

The [fresh functional acceptance report](PLAYER_REFERENCE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md)
and its [complete retained TAP](evidence/player-reference-acceptance-2026-11-20/full-suite.tap)
record **2,357 total / 2,354 pass / 2 fail / 1 optional Mixxx skip**, Node
v24.22.3, exit 1, all 192 top-level test files executed serially. The complete
TAP is **541,141 bytes**, independently rechecked here with SHA-256
`29ef19e0e0916e94e4c1ce0b27be3805f173375686cd522cf9aa8db11a77dec4`.
The [execution metadata](evidence/player-reference-acceptance-2026-11-20/full-suite.json)
and [evidence description](evidence/player-reference-acceptance-2026-11-20/README.md)
retain the source snapshots and execution details.

| Failed case | Retained observation | Limit of the observation |
| --- | --- | --- |
| Cubic nonlinearity, `tests/audio-quality.test.mjs:80` | `16972224339301138 vs 4.347826086956522` | Repeats the original issue #72 value. The TAP does not identify which numerical stage caused it. |
| Failed-start/retry, `tests/audio-runner-lifecycle.test.mjs:181` | Expected `pass`, got `fail`: `3 of 9 checks failed: balance, response, polarity.` | Preceding assertions reached one playback and one saved retry. This is an unexpected measurement verdict, not evidence that the first failed start played or saved anything. |

The original issue #72 failed TAP remains distinct: **530,581 bytes**, SHA-256
`39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197`.
Later passing observations do not replace either failed log. The earlier
33-test diagnostic did not establish the original predecessor execution order.

### Separately bounded observations from this initial audio round

The functional worker subsequently retained two distinct observations in
[its initial audit evidence](evidence/audio-numerical-functional-2026-11-20/).
This reviewer read the raw outputs and metadata and independently checked their
byte counts and hashes. Neither is a replacement full-suite qualification.

| Observation | Exact source / tree | Result and retained artifact |
| --- | --- | --- |
| Actual unchanged two-file selection | `c67bd2a5d2bbe37ce0e97e0e8db4962a14c706ce` / `9e2b38e1dcf681834f5ad9e2f356fa34862204c3` | Node v24.22.3: **33 total / 32 pass / 1 fail / 0 skip**, exit 1. Cubic case passed; the same retry verdict failure recurred after one playback/save. [Complete TAP](evidence/audio-numerical-functional-2026-11-20/unchanged-selection/run.tap), 8,482 bytes, SHA-256 `72372175dab192c8e851037de477f6084b11beeed8b4dda8a726f5c1040dfc69`. |
| Six-call numerical diagnostic | `c64d6b88c98f33a2ff42529f4e9235f005a047ee` / `b91803abd3677f95241a62a4de45213dd4ec4003` | Node v24.22.3, exit 0, six analyzer calls, with no application/test source change. [Complete output JSON](evidence/audio-numerical-functional-2026-11-20/diagnostic-1-default/output.json), 139,002 bytes, SHA-256 `50536744fd47b60e21fb173db9cc5a8f944d48bf55e8a79a03f5a35576b5ed62`. |

The [selection metadata](evidence/audio-numerical-functional-2026-11-20/unchanged-selection/result.json)
records a clean checkout and identical 1,956-file maps before/after. The
[diagnostic metadata](evidence/audio-numerical-functional-2026-11-20/diagnostic-1-default/result.json)
records a clean checkout and identical 1,957-file maps before/after. Both retain
their exact source trees, no timeout and no extra runtime flags.

In the diagnostic JSON, each clean/cubic/runner pair has identical snapshot
hashes. Each shared tone slice is equal between left and right; the full stereo
program intentionally differs in its crosstalk segments. Returned and separately
calculated fit coefficients agree to at most `1.3877787807814457e-17` absolute
difference in the retained comparisons. Clean and numerical runner fixtures
pass; cubic has expected THD+N/linearity failures and a stored THD value of
`4.3478` percent. No internally inconsistent fit was exposed by these six calls.

The numerical runner fixture does **not** execute the DOM/capture lifecycle
which still failed in the actual two-file selection. These observations do not
establish a shared cause, a runtime/compiler cause or a repair. No production
correction was proposed in this initial round for this reviewer to assess;
the numerical and actual retry failures remain separate open evidence.

## Actual producer-to-storage path

| Boundary | Source and observed behavior |
| --- | --- |
| Capture or imported waveform | [Audio runner](../../app/ui/devices/audio-runner.js) obtains live audio through `runQualitySession`, or decodes the explicitly selected recording. Stimulus metadata is constructed internally; the inspected UI does not accept arbitrary segment metadata. |
| Numerical analysis | [Audio quality](../../app/audio-quality.js) checks compatible nonempty buffers, equal lengths, matching supported sample rate, finite options and finite samples. It rejects silence, absent/weak alignment and insufficient required segments before measurements. [Calibration helpers](../../app/calibration.js) provide alignment, frequency refinement and tone fitting. |
| Measurement envelope | `normalizeMeasurement` in [core](../../app/core.js) preserves supplied values and metadata. It is not an independent numerical-validity check. |
| Threshold verdict | `evaluateAudioQuality` calls `evaluatePass` in [device checks](../../app/device-checks.js). Missing, null, undefined and nonfinite numeric values are `unknown`; the latest observation owns the comparison. Invalid numeric bounds are also `unknown`. |
| Session result | [Audio session](../../app/devices/audio-session.js) suppresses all measurements for an invalid analysis. For completed analysis it retains threshold findings, analysis issues, version, response and session evidence. Faulted/unavailable native continuity forces a nonempty live result to `unknown`. |
| UI completion | The runner checks action generation after asynchronous capture/decode and calls `ctx.finish` only for nonempty measurements. Failed or reviewable completed measurements may be saved. Saving is not limited to passing results. |
| Stored record | The [device screen](../../app/ui/screens/devices.js) calls `buildResultDetail` in [dispatch](../../app/devices/dispatch.js), then [library state](../../app/ui/devices/library-state.js) calls [catalog storage](../../app/catalog-store.js). Native [device storage](../../src-tauri/src/devices.rs) validates status and binds SQL parameters for detail JSON and identifiers. |
| Saved-result readers | Device last-result display and HTML report consume stored status, summary, values and findings. The device printable in [report PDF](../../app/report-pdf.js) delegates to the same HTML builder. The [certificate screen](../../app/ui/screens/certificate.js) and [certificate builder](../../app/certificate.js) apply their own recorded calibration, representability and verdict rules. |

Variable result text is escaped in the inspected UI/report path. The numerical
failure path introduces no new command, query or HTML execution boundary. The
native insert binds values rather than embedding measurement/device text in SQL.
This is a narrow source observation, not a complete native security audit.

`buildResultDetail` is not itself a numeric sanitizer: its value expression can
retain a nonfinite number in memory. The preview save path uses JSON
serialization, which represents nonfinite numeric values as null; the native
boundary likewise accepts a JSON value. No native transport was exercised here.
Threshold evaluation occurs before this storage boundary, and the inspected
compact report renders a missing value as unavailable rather than as a numeric
zero. A large finite number remains a large finite number through the summary.

## Findings and qualification limits

### ANS-01 — finite fit output has no independent validity contract

**Classification: unresolved numerical/data-quality boundary; no demonstrated
security vulnerability and no root-cause claim.**

`fitTone` returns amplitude, phase, DC and residual RMS. If its linear solver
returns no solution, the function supplies zero amplitude/phase/DC and the
input RMS as residual. Neither result form carries an explicit conditioning or
fit-validity decision. The audio analyzer derives distortion, gain, balance,
response and polarity from these fields, records a low-tone `CHANNEL_DEAD`
warning when applicable, and eventually sets `valid = true`. That flag means
this analysis path reached its end; it does not independently certify the
physical interpretation of every number.

The analyzer keeps only finite frequency-refinement results and uses zero ppm
if none survive. That fallback is not evidence that a zero clock offset was
measured. No claim is made that it explains either failure.

The downstream threshold guard is narrower: a very large **finite** distortion
value remains a numeric measurement and can produce an ordinary failure. The
retry case likewise shows a completed result whose verdict differs from the
fixture's expectation. Neither original failure output contains the fit trace
needed to assign a stage or shared cause.

Unknown threshold checks generate an explicit incomplete finding. The overall
verdict is `fail` when a known threshold fails, otherwise `unknown` when a check
is unavailable, otherwise `pass`; detected clipping overrides the result to
`unknown`. A failed threshold can therefore coexist with unavailable evidence,
but unavailable threshold evidence alone is not converted to PASS.

If coordinated diagnosis establishes an unusable or internally inconsistent
fit, a bounded correction should express that state where it is detected and
preserve unavailable evidence versus measured device failure. This report
proposes no arbitrary amplitude/THD clamp, new threshold, tolerance change or
blanket conversion of real failures to review. A later passing observation
alone cannot establish a repair.

### ANS-02 — live continuity uncertainty survives into the saved verdict

**Classification: existing defensive control, verified statically.**

`captureEvidence` requires nonnegative safe integer counters, a valid truncation
flag, finite nonnegative callback-gap evidence, string message lists, matching
frame count and at least one callback before continuity is observed. Overruns,
stream errors, reported messages or truncation make it incomplete. Missing or
invalid counters remain unavailable rather than becoming measured zeros.

`runQualitySession` adds a review finding and measurement flag for incomplete or
unavailable continuity, and changes a nonempty result to `unknown`. The save
path retains this status, explanatory finding, counters, stream errors and
`captureIntegrity`. The compact measurement schema below does not erase that
session-level qualification or turn this live result into a pass.

Calibration applicability is checked against the actual captured device and
sample rate. A profile or unrelated boolean alone is insufficient; inapplicable
profiles produce a reasoned finding. Chain-floor subtraction is selected only
from an applicable profile with a finite positive THD+N floor. These controls
concern provenance/applicability, not traceable calibration or physical accuracy.

### ANS-03 — compact saved measurements omit optional analysis metadata

**Classification: documented schema limitation; no current audio consumer
failure substantiated.**

The producer emits measured `origin`, `confidence` and `qualityFlags`, including
`uncalibrated-chain`, `chain-corrected`, `noise-limited`, and continuity flags.
`buildResultDetail` creates a compact value/label/unit summary with finite
uncertainty and a boolean `calibrated` field when supplied. It omits those three
optional fields. Session extras still retain analysis version, thresholds,
capture integrity and calibration state/reasons; findings and final status survive.

Actual downstream readers were inspected before assigning significance:

- Device last-result display and HTML/PDF report use the compact schema; they
  do not enforce an audio decision using the omitted fields.
- The certificate reader can consult generic calibration flags, but no `aq_*`
  metric belongs to current calibration `METRIC_RULES`. No current audio
  calibration enforcement was found to depend on the omitted flag names.
- General history/workspace rendering can use richer metadata, but it consumes
  a separate saved-run path. This audio runner finishes into device-test results;
  that unrelated renderer does not substantiate a broken audio consumer.

This is not raised as a new security or acceptance blocker. A future richer
result viewer may need selected metadata retained; that work should start from
a concrete consumer requirement and a bounded schema change. The omission does
not explain the retained numerical failures.

### ANS-04 — imported recording verdicts remain threshold-only

**Classification: existing behavior and presentation limitation; separate from
live continuity and numerical diagnosis.**

The recording-file path explicitly stores `captureIntegrity` with source
`file`, state `unobserved` and an explanation that original continuity is not
observable from an imported waveform. It calls `qualityResult` directly and
does not apply the live-capture continuity downgrade. The maintained lifecycle
test explicitly expects a clean imported fixture's `pass` and `unobserved`
together. This distinction is present in both source and test contract; it is
not a newly established capture-integrity bypass.

The result headline and compact report expose threshold outcomes, without
independently displaying that extra continuity explanation. A bounded future
presentation improvement could explain that imported-file PASS covers available
waveform checks and does not prove original continuity or device provenance.
This report changes no verdict contract and infers neither malicious input nor
defeat of a security control.

## Verification limits and handoff requirements

All application/test inspection in this lane was static. Reading a test
assertion establishes intended behavior, not that the test passed in this turn.
Actual numerical diagnosis and executable regression validation belong to the
code/functional lanes and root. A coordinated production correction must be
reviewed against its exact source and execution evidence before claiming its
effect.

This review does not qualify real devices, analog chains, sample-clock accuracy,
calibration traceability, native permissions or platform behavior. It provides
no browser/layout/print evidence. The previous blocked Chromium launch remains
blocked evidence; no retry occurred here.

Original issues #69/#72 and unfinished AC-6 work remain separate. Fixed Fleet
evidence, including its original unexplained failure, is preserved; Fleet stays
default-off. No release, enablement, permission change or remote mutation is
authorized by this report. Combined reference/PDF acceptance remains held for
the separately recorded audio qualification work. Root coordinates completion
of all initial workers before the fresh successor round.
