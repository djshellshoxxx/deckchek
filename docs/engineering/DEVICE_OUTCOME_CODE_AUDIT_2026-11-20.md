# Device outcome and trend code audit — 20 November 2026

Reviewer: `/root/device_outcome_code`. Dates use America/Los_Angeles; execution
records retain UTC. This lane performs independent source review only.

## Disposition

**Accepted for this static code/spec lane.** Both findings are closed in final
candidate `9de3f95cf0e79851dc01a27066c515c6691ef811`, tree
`e3acafa37270ca4b182116153c3d16ac77b3d115`. No blocking code finding remains in
the assigned scope. This is independent static acceptance; execution evidence
below belongs to the functional author.

## Source and scope

The clean assigned checkout began at
`9fc11d6e15cc97141c14b309c61a38393fcbafd8`, tree
`dcc98491724a06c84023c3633ad04ae6ce80a674`. It combines the published inert Fleet
integration `6ec1674806a05ca4e44d090b485e37ba35fdb590`, automation PR #68 head
`d36517ff5bb9134288f7a8aedbc62066da874099`, and the guarded diagnostic-activation
record. The PR #68 input changes only `app/diagnostics.js` and its focused test.

This review covers issue #66's result-evidence boundary and the PR #68 trend
correction, their actual consumers, and the author's correction source/tests.
The prior QR, CDJ and Fleet work remains outside this new audit. No native,
workflow, dependency, feature-default, threshold or historical-record change
is requested.

The final candidate changes two production files and three focused test files
relative to the assigned base. Its production correction is byte-identical to
`d2931c3390917faae31a634b2de663afa8ac50c8`. The later amendments only correct a
test label and make the modeled profile explicitly valid, with direct catalog
readback before checking the submitted status.

| Reviewed candidate file | SHA-256 |
| --- | --- |
| `app/devices/dispatch.js` | `a8cb0a842ecaa2b58a00fea995479123b66b492b5741f8c50892ac73d02d2907` |
| `app/diagnostics.js` | `49d23cbf7e7feea5aa6243d39cb38500a3cb082544378f92ddba5e3063813c6d` |
| `tests/device-outcome-evidence.test.mjs` | `06436b5f4d42ebaac3664e1c910ed6468988a01988f80c8e3c9a8c115385f11c` |
| `tests/device-outcome-screen.test.mjs` | `69130da091033046e9bf84631a039d08b909b633d54c9686bab00a8f7dc3ade1` |
| `tests/diagnostics-trend-degenerate.test.mjs` | `6a76bbb8f73a9bb29d34ae6af5d8c4b3c7a003379b1efa73c3419a60152919eb` |

## Findings and review constraints

### DC-01 — PASS without an observation (existing issue #66)

The original `evaluateOutcome` gives a profile criterion first priority, then an
explicit engine verdict, then error/review findings. Its final branch returns
PASS even when the input has no measurements and no findings, or only unavailable
measurements and informational findings. `normalizeMeasurement` preserves null;
it does not supply a numeric observation. This violates the result-evidence
boundary in [SPEC-13 §4.5](../SPEC-13-gui-ux.md) and the distinct missing/unknown/
zero/failed states in [SPEC-15 §6](../SPEC-15-input-output-and-data-flow.md).

A correction belongs in the central evaluator so all existing callers share
its rule. Preserve profile-criterion and explicit-verdict precedence, existing
error and review outcomes, legitimate zero values, and explicit `ok` findings.
Any numeric fallback evidence must have a nonempty metric identity. As the
parallel defensive review noted, its latest observation must govern: an older
finite value cannot establish PASS after that same metric becomes unavailable.
A different metric with a usable latest observation remains a separate fact.

**Disposition: closed in reviewed production source.** The added `Map` records
the final value for each nonempty string metric identifier. `Number.isFinite`
accepts numeric zero and rejects null, undefined, nonfinite numbers and numeric
strings. An explicit `ok` finding remains affirmative evidence. The new check
follows the unchanged criterion, explicit verdict, error and review branches;
the fallback lacking affirmative evidence becomes `unknown` with
`criterion: 'evidence'`.

The fallback only establishes the existence of usable observations or an
explicit positive finding. It is not a new calibration, hardware-certification
or scientific eligibility rule.

### DC-02 — Fractional repeated-time degeneracy in PR #68

The input PR rejects nonfinite regression coefficients before returning a fit
score. That addresses the simple repeated integer-time examples in its tests,
but depends on the existing denominator `n * sxx - sx * sx`. Uncentered floating
sums can leave a cancellation residual for identical larger fractional times.
A finite result then bypasses the new guard even though the actual time span is
zero. The functional author's retained baseline log confirms failures in the
actual imported module for repeated times 1000.1 and 123456.7; these are no longer
only hypothetical formula examples.

A direct actual-time-span check can close that boundary while preserving the
existing regression threshold and defined-span arithmetic. This review does
not propose a general regression rewrite or a new stability threshold.

**Disposition: closed in reviewed production source.** The candidate tests the
filtered input for identical `timeMin` values before regression. It returns the
same filtered count and unknown slope, intercept and R² for a zero time span.
The existing nonfinite-coefficient guard remains in place. The denominator
threshold, defined-span regression arithmetic and consumer code are unchanged.

The warm-up consumer in `app/ui/analysis.js` already requires a finite slope
before emitting drift and R² measurements. The stylus wrapper in
`app/stylus-wear.js` likewise rejects a nonfinite slope with `enough:false`.
Those guards limit simple NaN-coefficient cases; they cannot reject an erroneous
finite coefficient from cancellation. A helper result and an observed UI result
must remain separate claims unless the corresponding path was exercised.

## Actual caller and saved-result boundary

The source path is:

`runDriver` → `evaluateDriverCheck` → `evaluateOutcome` → the Devices screen's
`ctx.finish` → `saveResult` → `store.saveDeviceTestResult`.

`ctx.finish` accepts any truthy status and forwards it unchanged; the storage
wrapper does not independently establish positive evidence. The UI already
renders `unknown` as REVIEW, and progress counts unknown separately. Correcting
the evaluator therefore uses an existing saved and displayed status.

The default `createSystemBridge` normalizes null/non-object native responses to
an unsupported payload. `scanRunner` does not save such a payload. A directly
injected null bridge result is only a runner-seam case and does not establish
reachability through that default native bridge.

A supported scan with no Windows-driver definition, no class-compliant positive
finding and no profile criterion instead yields null readings plus informational
context; its existing caller can reach the problematic fallback. The reviewed
screen regression mounts that boundary through the actual screen, default
bridge, evaluator, `saveResult` and browser catalog. DOM, native response and
storage are modeled; this does not claim a physical-device session.
Static catalog inspection found 14 handwritten driver checks, all with a pass
criterion and at least one Windows-driver definition. A boundary fixture must
not be described as proof that one of those current shipped checks follows the
same fallback.

Existing profile data, explicit criterion evaluation, storage schemas and
historical saved rows must remain unchanged. The new behavior concerns newly
evaluated results; no backfill or reinterpretation of old records is included.

## Reviewed test contracts

`tests/device-outcome-evidence.test.mjs` imports the actual central evaluator.
Its seven cases cover absent/info-only/unavailable evidence, empty metric IDs,
finite zero and negative values, explicit OK, latest-value replacement,
independent metrics, all existing error/review aliases, explicit verdicts and
profile-criterion precedence. They assert the public result, not an internal
implementation shape.

`tests/device-outcome-screen.test.mjs` exercises the saved-result boundary,
REVIEW display, an explicit class-compliant OK result, and no save after null,
undefined or explicitly unsupported native responses. The final fixture asserts
`validateProfile(profile)` is exactly `{ok:true, errors:[], warnings:[]}` before
mounting. It reads the persisted result before checking the submitted status,
and compares a pre-existing result with its saved snapshot. This qualification
matters because the default bridge converts unavailable native responses into
unsupported results before the runner sees them.

`tests/diagnostics-trend-degenerate.test.mjs` imports the actual diagnostic
module. It includes integer and larger fractional repeated times, constant and
varying responses, finite-point filtering, and defined flat and linear fits.
The two fractional cases close the cancellation hole that the input PR's small
integer examples did not cover.

## Review method and author evidence

This lane inspected Git identities/diffs, source and consumer contracts,
existing regression coverage, relevant specifications and static profile JSON.
No application module, generator, test, build, benchmark, scanner or native
application command was executed. Source findings were communicated to root and the
sole functional author for ordinary functional verification.

The final author proof uses exactly the same regression files on baseline
`74f19b85e462b3602b12814a44226b6b9002b6d3`, tree
`fb39930b3ddd2e0c4aadf80142773bff121917b8`, and the corrected candidate. Static
Git comparison confirms the proof baseline's application matches the assigned
base, and the proof-to-candidate diff consists solely of the two production
corrections. The final fixture's profile-validity assertion precedes the failing
saved-status assertion.

| Author execution | Source | Observed record |
| --- | --- | --- |
| Final fixture on baseline | `74f19b85e462b3602b12814a44226b6b9002b6d3` | 16 tests: 11 pass, 5 semantic failures; zero skips. The screen case explicitly reads persisted `pass` where `unknown` is expected. |
| Final focused regressions | `9de3f95cf0e79851dc01a27066c515c6691ef811` | 16/16 pass; zero skips. |
| Six existing related files | `8fbaa3e2ea95ec3ed4a47bdf30dfd04b0bb09aab` | 142/142 pass; zero skips. Application and related-test bytes are unchanged at the final candidate. This is retained coverage, not a rerun at the final commit. |

The five semantic failures concern empty evidence, stale metric evidence, the
persisted driver boundary and the two fractional repeated-time examples. The
inspected author metadata records Node v24.22.3, clean worktrees and unchanged
hashes for all 1,749 tracked files during these runs. Related files cover device
library, profile pass evaluation, system checks, screen lifecycle, core
diagnostics and stylus wear. This reviewer inspected the metadata and relevant
TAP output; the runs remain author evidence, not independent execution.

Raw records at review time were under
`/tmp/deckchek-device-outcome-functional-evidence-20261120/`, including
`schema-baseline.*`, `schema-final-regressions.*` and `final-related.*`. The final
baseline TAP SHA-256 is
`fdb562da7e9a7ca51af6b570248a6518f5f9e34d826314c541612aebee4f34df`; final
regression TAP SHA-256 is
`1b6dac5849d4d2694220d25f1790abb463eb850564c5e899a4f265ac863235b2`.

### Earlier fixture and label records

The initial run at `7c3e151d11aa9eb9298331b8f6cc93084672b466` includes a screen
fixture failure (`querySelector` on null); it cannot establish the saved-result
defect. After that fixture repair, `9035fd46b861e020acb28c6f09fc998b028d117e`
recorded five semantic failures, but its profile lacked required metadata.
Those records are retained diagnostics and are superseded by the final valid
fixture proof above.

The first corrected source `d2931c3390917faae31a634b2de663afa8ac50c8` passed the
evaluator, persistence and trend assertions but failed the test's incorrect
`Saved: UNKNOWN` expectation. The one-line change to `Saved: REVIEW` at
`8fbaa3e2ea95ec3ed4a47bdf30dfd04b0bb09aab` matches the existing result-chip
contract. It is an assertion correction, not a production defect or product
behavior change. The final test-only amendment adds required profile metadata,
explicit profile validation and earlier persisted-row readback. No application
change occurred in either amendment.

## Handoff boundary

Root remains responsible for combining all initial reports, obtaining fresh
independent acceptance, and qualifying the resulting published source. The
separate Fleet diagnostic remains root-owned; its recorded failure and cause
are not resolved by this audit.
