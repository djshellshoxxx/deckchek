# Device outcome and degenerate trend defensive audit — 20 November 2026

Reviewer: `/root/device_outcome_security`. Dates use America/Los_Angeles;
execution records elsewhere retain UTC. This lane performs source review only.

## Review status

**Accepted for defensive source review** at the frozen corrected candidate
`9de3f95cf0e79851dc01a27066c515c6691ef811`, tree
`e3acafa37270ca4b182116153c3d16ac77b3d115`. No new blocking defensive-integrity
finding remains in these two changes. This disposition does not assert
independent functional acceptance, native execution or a deployed fix.

Assigned base: `9fc11d6e15cc97141c14b309c61a38393fcbafd8`, tree
`dcc98491724a06c84023c3633ad04ae6ce80a674`. It contains published inert Fleet
handoff `6ec1674806a05ca4e44d090b485e37ba35fdb590` and incoming trend PR #68
head `d36517ff5bb9134288f7a8aedbc62066da874099`. The latter changes only the
trend helper and its new regression test. Root owns consolidation and all
published heads; this lane owns only this report.

The corrected candidate changes two production files and three test files from
the assigned base. The production diff is limited to the evidence gate and a
zero-time-span trend guard. No native code, schema, store, bridge, report,
workflow, dependency, generated artifact or profile is changed. Source bytes
were read directly from the frozen Git object, not inferred from a moving
worktree. Production is identical to first candidate
`d2931c3390917faae31a634b2de663afa8ac50c8`. Intermediate candidate
`8fbaa3e2ea95ec3ed4a47bdf30dfd04b0bb09aab` corrected a test's expected label
to the existing REVIEW. The final candidate only strengthens that screen-test
fixture with required profile fields, explicit validation and direct persisted
status readback; its qualification is recorded below.

| Frozen candidate file | SHA-256 |
| --- | --- |
| `app/devices/dispatch.js` | `a8cb0a842ecaa2b58a00fea995479123b66b492b5741f8c50892ac73d02d2907` |
| `app/diagnostics.js` | `49d23cbf7e7feea5aa6243d39cb38500a3cb082544378f92ddba5e3063813c6d` |
| `tests/device-outcome-evidence.test.mjs` | `06436b5f4d42ebaac3664e1c910ed6468988a01988f80c8e3c9a8c115385f11c` |
| `tests/device-outcome-screen.test.mjs` | `69130da091033046e9bf84631a039d08b909b633d54c9686bab00a8f7dc3ade1` |
| `tests/diagnostics-trend-degenerate.test.mjs` | `6a76bbb8f73a9bb29d34ae6af5d8c4b3c7a003379b1efa73c3419a60152919eb` |

## Scope and evidence boundaries

The assets reviewed are the integrity of prospective device-test status,
measurement availability and trend conclusions. The relevant transitions are:

| Boundary | Reviewed behavior |
| --- | --- |
| System response to scan evaluator | The default bridge normalizes a missing/non-object response to an unsupported scan. Evaluators preserve unavailable readings as `null`. |
| Measurements/findings to outcome | Explicit profile criteria and engine verdicts take precedence. The issue is the fallback after neither is supplied. |
| Outcome to saved device result | The screen's `finish` callback passes the outcome status to `saveResult`, which forwards it to the catalog/native store. |
| Saved result to progress/report | Stored status remains separate from detail. Unknown rows stay review results and are not recomputed as passing observations. |
| Finite trend samples to fit | An undefined slope/intercept must not produce a perfect-fit score. Consumers gate on a finite slope. |

This is a prospective correctness and defensive-integrity review. It does not
establish an external exposure, a native hardware incident or comprehensive
security of the application. No new authentication, authorization, filesystem,
network, privilege or dependency boundary is introduced by the proposed scope.

## Issue #66: unavailable evidence and result status

At the assigned base, [`evaluateOutcome`](../../app/devices/dispatch.js) returns
PASS after finding no profile criterion, asserted verdict, error or review
finding. The fallback does not inspect observations. Consequently an empty
result or an info-only result containing only unavailable readings can be
described as passing. This conflicts with the missing-data distinctions in
[SPEC-13](../SPEC-13-gui-ux.md) and [SPEC-15](../SPEC-15-input-output-and-data-flow.md).

The review requested a centralized evidence guard and preservation of these
existing decisions: profile criteria first; explicit engine verdict next;
errors remain failures; warning/review findings remain unknown; a legitimate
finite observation including numeric zero and an explicit `ok` finding remain
usable evidence. For repeated observations of one metric, a later unavailable
value must not silently borrow a stale finite value. The author acknowledged
the latest-observation requirement before freezing the implementation.

The frozen implementation satisfies that request. It builds a local `Map` from
nonblank string metric IDs, retaining the last supplied value for each exact
ID, then requires at least one strictly finite numeric value or an explicit
`ok` finding. It does not coerce or mutate readings. Numeric zero and negative
finite readings remain observations; an earlier finite reading followed by
unavailability cannot supply evidence for that same metric. Existing profile,
verdict, error and review branches remain byte-for-byte unchanged. The new
no-evidence result is `unknown` with `criterion:'evidence'`; it has a distinct
explanation rather than claiming a successful observation.

### Reachability distinction

[`createSystemBridge`](../../app/system-check.js) already returns a fallback
with `supported:false` when the native invocation supplies a missing or
non-object payload. The production scan runner checks that flag before saving.
A directly injected bridge that returns `null` exercises a real runner seam,
but does not prove that an unmodified default native bridge saves that input.

A supported scan with a profile accepted by the application's validator that
lacks a Windows-driver definition can instead yield only unavailable readings
and an informational finding. The frozen functional regression uses the real
screen/handler/save path with that modeled configuration. The review read all
**45** bundled profile JSON files: none contains an explicit `driver:check` without a pass
criterion, and the generated `auto-driver` test has a `driver_present` criterion.
Therefore this configuration must not be reported as a demonstrated incident
in a shipped profile or physical device session. Profile validation permits
the modeled shape; the generic evaluator contract still needs the correction.

### Correction to the earlier fixture qualification

The earlier report commit `6c5fe57e479dccc36d301a493f6ad06382721bc1` called
the exact modeled fixture schema-valid without checking its required metadata.
The author subsequently found that fixture omitted `schemaVersion` and
`summary`. The earlier fixture exercised an injected library state; its
execution did not establish acceptance by the normal profile validator. That
overstatement is corrected here, with the earlier source and report retained
in history.

At final candidate `9de3f95`, the fixture supplies those required fields plus
documents and a test step, then asserts the exact `validateProfile` result
`{ok:true,errors:[],warnings:[]}` before creating catalog records or mounting the
screen. The test reads the catalog rows and checks the persisted status before
checking the status submitted by the finish handler. Static comparison confirms
that all three final regression files are identical in baseline proof
`74f19b85e462b3602b12814a44226b6b9002b6d3`, tree
`fb39930b3ddd2e0c4aadf80142773bff121917b8`, whose application source is
unchanged from the assigned base. These assertions substantiate the corrected
fixture qualification; they do not turn the modeled session into hardware
evidence or a bundled-profile incident.

### Persistence and rendering

[`saveResult`](../../app/ui/devices/library-state.js) preserves the supplied
status, then updates the result cache after the store acknowledges the write.
The [browser store](../../app/catalog-store.js), [native store](../../src-tauri/src/devices.rs)
and [database schema](../../database/migrations/0002_device_library.sql) already
recognize `unknown`. Native result SQL uses bound parameters. The patch should
not require a schema migration, native command change or reclassification of
earlier results.

[`resultStatus`, `latestResults` and `progressFor`](../../app/devices/library.js)
retain their existing handling of chronology, adverse evidence and unknown
results. The [device HTML report](../../app/devices/dispatch.js) maps unknown
to REVIEW and escapes displayed profile/result values. The desired correction
therefore belongs before persistence; it does not need a report-only relabeling
or mutation of historical rows.

### Serialized and historical unknown values

The ordinary browser store writes JSON and reads the saved object without
rerunning `evaluateOutcome`. The detail builder retains `null` for absent
readings; nonfinite JavaScript numeric values become `null` when ordinary JSON
serialization occurs. Status is stored separately. A strict finite-number
evidence check therefore must not coerce those values, numeric-looking strings
or booleans to zero when a new outcome is evaluated. Reading an earlier saved
record must continue to preserve its recorded status rather than applying the
new policy retrospectively.

The [browser catalog archive](../../app/catalog-archive.js) transfers its
catalog envelope, not device-result history. Its additive merge retains
sibling state including `deviceResults`; its finite-JSON guard rejects values
that cannot round-trip exactly. These existing paths do not introduce a second
outcome decision or authorize the patch to rewrite imported/historical results.
This review does not certify every other archive or import format.

An explicit PASS verdict remains an assertion governed by the existing caller
contract. Preserving that precedence does not certify its physical provenance,
calibration or scientific qualification. A finite reading likewise establishes
an observation for this fallback, not compliance with an absent threshold.

## PR #68: undefined trend fit

The incoming change to [`trendMetrics`](../../app/diagnostics.js) returns
unknown (`NaN`) slope, intercept and R² when the existing regression produces
a nonfinite slope or intercept. Its usable-point count is retained. When the
fit is nonfinite, this prevents a constant, identical-time series from reaching
the old constant-value shortcut and presenting R² = 1 despite an undefined fit.

The frozen correction also rejects a series whose finite time values are all
exactly equal, before invoking the regression helper. This makes the
no-time-span rule independent of floating-point cancellation in that helper:
a finite calculated coefficient cannot establish a time trend when every
represented time is identical. The code peer identified the fractional-time
case; the author added source assertions for `1000.1` and `123456.7` with both
constant and varying values. This lane inspected those assertions without
executing them.

The combined correction preserves the existing finite-input filter and
regression threshold. It does not replace the regression algorithm or claim to
solve every floating-point conditioning problem for distinct times. The
original PR author recorded isolated formula assertions; those are not
independently executed repository tests.

Two actual consumers were inspected. The [warm-up analysis](../../app/ui/analysis.js)
adds drift/R² measurements only with a finite slope. The [stylus trend wrapper](../../app/stylus-wear.js)
returns `enough:false` before constructing a trend result when the slope is
unavailable. The incoming guard therefore keeps undefined fits on the existing
unavailable path. No new serialization route, exported field, permission or
data collection is added.

## Limits and handoff

This lane inspected source, Git diffs, static profile JSON and existing schema/
consumer contracts. It did not execute application code, tests, generators,
native builds, benchmarks, scanners, probes or vulnerability reproduction, and
made no remote writes. Functional results belong to the author and subsequent
fresh validation, with their exact source/runtime recorded separately.

Issue #69's profile-path redaction work is reserved for a separate set. The
Fleet diagnostic and published #65/#67/#68 heads remain under root ownership.
The recorded Fleet timing failure and later source-specific successes are not
reinterpreted by this review.

The test source covers the empty/info-only/unavailable fallback, stale readings,
zero and explicit-OK controls, criterion/verdict/finding precedence, real-screen
save propagation, default-bridge no-save cases, preservation of an existing
saved row, and degenerate/ordinary trends. Source coverage is not an execution
claim. The author separately reported these results on Node v24.22.3:

| Source | Author execution evidence | Qualification |
| --- | --- | --- |
| Baseline proof `74f19b85e462b3602b12814a44226b6b9002b6d3` | 11/16 pass; five expected semantic failures | Final validated fixture and regression files on unchanged base application source; the screen assertion directly reads persisted PASS. |
| Corrected candidate `9de3f95cf0e79851dc01a27066c515c6691ef811` | 16/16 regressions pass | Same final regression files, including validation and persisted UNKNOWN readback; no skips. |
| Earlier corrected candidate `8fbaa3e2ea95ec3ed4a47bdf30dfd04b0bb09aab` | 142/142 disjoint existing checks pass | Retained source-bound evidence with no skips; the later change touches only the new screen test, not these checks or production source. |

Those results belong to the author's report and retained evidence. This lane
inspected the exact test-only diff and source identities, but neither executed
nor independently reproduced the runs. The follow-up does not broaden the
original production audit.

Root should combine this report with the completed code and functional reports,
then hand the combined source to different fresh workers. Rebind this
disposition if either production file changes. Existing hardware/scientific and
applicable hosted qualification gates remain separate.
