# Fresh device outcome and trend code acceptance — 20 November 2026

Reviewer: `/root/device_outcome_code_fresh`. This is a new independent static
acceptance pass after all three initial workers finished. Dates use
America/Los_Angeles; retained execution timestamps remain UTC.

## Disposition

**Accepted for the assigned static code/spec and evidence-interpretation
scope. No blocking finding remains in the two production corrections.**

The accepted combined source is
`ce66a40ac9b306ff65a994d5adf00d1a696ba47b`, tree
`6de27897af9aea1f69084b1de6ef3c294247ac80`. This disposition is not full-suite,
native, hardware, scientific, release or merge qualification. The fresh
functional peer owns execution; root owns current CI, publication and any
expected-head-guarded merge.

## Source identity and review method

| Role | Commit | Tree |
| --- | --- | --- |
| Combined acceptance source | `ce66a40ac9b306ff65a994d5adf00d1a696ba47b` | `6de27897af9aea1f69084b1de6ef3c294247ac80` |
| Final author source/test freeze | `9de3f95cf0e79851dc01a27066c515c6691ef811` | `e3acafa37270ca4b182116153c3d16ac77b3d115` |
| Identical final tests on unchanged baseline application | `74f19b85e462b3602b12814a44226b6b9002b6d3` | `fb39930b3ddd2e0c4aadf80142773bff121917b8` |

The combined source differs from the final author freeze in 55 documentation
and evidence files only. All application, test, native, migration, workflow,
profile and dependency bytes are unchanged between those two trees. Git
ancestry includes input PR #68 head `d36517ff5bb9134288f7a8aedbc62066da874099`
and all three completed initial-report heads (`5b770bb`, `a6a18da`, `1a0cdd4`).
The baseline proof differs from its assigned base only in the three final
regression files. The proof and corrected author freeze differ only in
`app/devices/dispatch.js` and `app/diagnostics.js`.

| Reviewed file | SHA-256 |
| --- | --- |
| `app/devices/dispatch.js` | `a8cb0a842ecaa2b58a00fea995479123b66b492b5741f8c50892ac73d02d2907` |
| `app/diagnostics.js` | `49d23cbf7e7feea5aa6243d39cb38500a3cb082544378f92ddba5e3063813c6d` |
| `tests/device-outcome-evidence.test.mjs` | `06436b5f4d42ebaac3664e1c910ed6468988a01988f80c8e3c9a8c115385f11c` |
| `tests/device-outcome-screen.test.mjs` | `69130da091033046e9bf84631a039d08b909b633d54c9686bab00a8f7dc3ade1` |
| `tests/diagnostics-trend-degenerate.test.mjs` | `6a76bbb8f73a9bb29d34ae6af5d8c4b3c7a003379b1efa73c3419a60152919eb` |

This lane read the initial [code](DEVICE_OUTCOME_CODE_AUDIT_2026-11-20.md),
[functional](DEVICE_OUTCOME_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](DEVICE_OUTCOME_SECURITY_AUDIT_2026-11-20.md) reports, then checked
the actual source, callers, schema, profile JSON, test assertions, Git objects
and retained execution records. Static Python was used only to parse JSON,
compare bytes and compute hashes. No application code, test, generator,
benchmark, native command, scanner or probe was executed.

## Device outcome evidence boundary

The added fallback in [`evaluateOutcome`](../../app/devices/dispatch.js)
matches the missing-data distinction required by
[SPEC-13 §4.5](../SPEC-13-gui-ux.md) and
[SPEC-15 §6](../SPEC-15-input-output-and-data-flow.md). It requires a finite
latest observation for a nonblank string metric ID, or an explicit `ok`
finding, before reaching the existing finding-based PASS result.

The implementation retains the last supplied value for each exact metric ID.
That matches the observation-order rule already used by
[`evaluatePass`](../../app/device-checks.js); it does not introduce timestamp
sorting or normalize identifiers. A later unavailable reading replaces an
older finite reading of the same metric. A different metric with a usable
latest reading remains independent evidence. Strict `Number.isFinite`
preserves numeric zero and negative values without coercing null, strings or
nonfinite values into observations.

All earlier decision branches remain unchanged: profile criteria first,
explicit engine verdicts next, then error and review findings. Positive
observations therefore cannot hide a higher-precedence adverse finding.
An explicit OK finding remains meaningful for the class-compliant case with
no numeric driver reading. The no-evidence branch returns `unknown` with a
distinct `criterion:'evidence'` explanation.

This is a fallback evidence correction. A finite observation does not prove
compliance with an absent threshold, and an explicit engine verdict retains
its existing caller contract. Neither establishes new calibration, physical
provenance or scientific eligibility.

### Caller, saved result and reachability

The actual source path is the driver scan handler in
[`scanRunner`](../../app/ui/devices/runners.js), driver evaluation,
`evaluateOutcome`, the Devices screen's
[`ctx.finish`](../../app/ui/screens/devices.js),
[`saveResult`](../../app/ui/devices/library-state.js), and the catalog store.
`finish` and `saveResult` forward the chosen status; they do not independently
establish positive evidence. Centralizing the correction before saving is
therefore appropriate.

The [browser catalog](../../app/catalog-store.js),
[native store](../../src-tauri/src/devices.rs), and
[existing migration](../../database/migrations/0002_device_library.sql)
already permit `unknown`. The screen maps that status to REVIEW, and progress
counts it separately. The correction changes neither storage nor historical
readback, and introduces no migration or retrospective reclassification.

The default [`createSystemBridge`](../../app/system-check.js) already replaces
null, undefined and other non-object native responses with an unsupported
payload. The scan handler does not save that payload. The final regression
therefore correctly uses a **supported** scan and a modeled profile without a
Windows-driver definition, class-compliant OK finding or pass criterion.
That configuration yields four null readings and an informational finding;
the previous fallback could save PASS.

The final fixture supplies required profile metadata and asserts the real
`validateProfile` result before mounting the screen. Its persistence spy
forwards into the actual browser catalog. It reads the newly persisted row
before checking the handler input and compares the existing PASS row with its
saved snapshot. The modeled DOM, native response and storage remain explicit
limits; this is not browser rendering or native SQLite/hardware evidence.

Independent static inventory found 45 bundled profile JSON files and 14
handwritten `driver:check` entries. Every one has a pass criterion and at least
one Windows-driver definition. The generated `auto-driver` check in
[`test-plan.js`](../../app/devices/test-plan.js) also has a `driver_present`
criterion. The regression must not be described as a demonstrated incident in
a current bundled profile.

## Trend correction and consumers

[`trendMetrics`](../../app/diagnostics.js) now rejects an actual zero time span
after its existing finite-point filter and before regression. All equal finite
times produce the established unavailable slope/intercept/R² convention while
retaining the usable observation count. The short-circuit length check keeps
the first-point comparison safe for empty input.

This closes the specific repeated-fractional-time case identified in PR #68's
finite-fit guard: uncentered sums can leave a nonzero cancellation residual
despite equal represented times. The direct equality check does not depend on
the fitted coefficient being nonfinite. The existing coefficient guard,
`1e-12` denominator threshold and defined-span arithmetic remain unchanged.
It does not claim a general solution for poorly conditioned distinct times.

The [warm-up consumer](../../app/ui/analysis.js) emits trend measurements only
with a finite slope. The [stylus wrapper](../../app/stylus-wear.js) likewise
returns `enough:false` for an unavailable slope. No consumer changes are
required for the corrected unavailable result. A helper regression and a
demonstrated rendered UI incident remain different evidence claims.

The three focused test files exercise public evaluator results, the actual
saved-result path and actual diagnostic-module imports. They cover criterion/
verdict/finding precedence, absent and stale evidence, finite zero and negative
controls, explicit OK, history preservation, unsupported no-save behavior,
integer and fractional equal times, finite-point filtering, and defined flat
and linear fits. They do not assert internal `Map` structure or replace the
module under test with a formula copy.

## Author evidence qualification

The following records were inspected, including their exact metadata, TAP
digests and before/after maps. All three pairs of maps contain 1,749 tracked
files and are equal. These are the author's runs on Node v24.22.3, not fresh
execution by this reviewer.

| Record | Exact source | Result and limit |
| --- | --- | --- |
| Final schema-valid baseline | `74f19b85e462b3602b12814a44226b6b9002b6d3` | 11 pass / 5 semantic failures; persisted PASS is directly read back. |
| Final focused regressions | `9de3f95cf0e79851dc01a27066c515c6691ef811` | 16/16 pass; identical final regression files. |
| Six existing related files | `8fbaa3e2ea95ec3ed4a47bdf30dfd04b0bb09aab` | 142/142 pass; source-bound retained coverage, not a rerun at the final commit. |

All three have zero skips/cancellations/TODOs. The
[evidence directory](evidence/device-outcome-functional-2026-11-20/README.md)
also retains the earlier fixture/bootstrap and display-label failures. Those
are not reclassified as product defects. The earlier missing profile metadata
is expressly corrected in the initial reports; the final validated fixture
and identical baseline proof substantiate the current claim.

## Fleet hosted result and interpretation

The [hosted diagnostic report](FLEET_GATE_HOSTED_RESULT_2026-11-20.md) accurately
preserves the failed experiment and its source boundaries. Independent static
checks matched all 17 entries in its byte inventory and all 13 extracted ZIP
members. The ZIP hash is
`420867c55efa1b7ecf182da724d9d99893af23debb0c0d886aaa062523797de9`;
the complete decoded job-log hash is
`5aef76d0196409c98a1b54b5d889aad3d4c42c241e5f9d7742525342c54cf7cf`.

The tooling commit `69fc06eb471dfb00de544bbe233c0f5dc95402e8` and actual
application merge `5702a450d9a7faa3efb80c5b67de69386ae07540` resolve to their
recorded trees. The hosted source proof is byte-identical to the earlier
fresh-worker proof, SHA-256
`1940de1d300956e5fa24fe85d8ef71893063354a4d08ee2146a6ffa79f44738b`.
The acceptance source's native and migration trees equal the recorded
unchanged trees. Removing only the two recorded gate instrumentation insertions
and appended diagnostic module restores the original 90,419-byte `fleet.rs`
exactly. The production reminder function, fixture and 200 ms assertion are
preserved.

Stage JSON and raw logs agree: the untouched suite passed 767/0 with eight
ignored tests; the instrumented suite passed 766 and failed one with nine
ignored tests; the isolated diagnostic test passed with 775 other tests
filtered. The extra ignored test is the appended diagnostic. The finalizer
records `instrumented: exit 101` and the job remains failed. The isolated
test compares complete ordered 2,000-row results in four alternating pairs.

The reported 213.308243 ms gate result and phase timings match the artifacts.
The unchanged original PR #65 failure remains 201.565999 ms against 200 ms;
its complete log hash also matches. PR #67's later successful log matches its
separate record and the same compiler identity. That later pass does not
explain or erase either failure.

The report properly distinguishes full-suite and warm isolated timings,
different compiled binaries, scheduler snapshots that surround the wall
interval, measured-copy probe work, and cleanup omitted by the four phase
timers. It makes no allocation, scheduler-cause, index-use or qualification
claim beyond the captured data. The largest measured phase is an observation
for a possible future hypothesis, not proof of the original failure's cause.
Binary hashes are retained; binary executable bytes are not claimed present.

## Handoff

No application amendment is requested by this acceptance lane. Only this
report is added. Fresh functional acceptance and applicable exact-source hosted
gates remain separate. Keep original PR/diagnostic heads and failed evidence
fixed; no diagnostic retry, budget relaxation or production Fleet change is
authorized by this report. Issue #69 and broader feature work remain outside
this review.
