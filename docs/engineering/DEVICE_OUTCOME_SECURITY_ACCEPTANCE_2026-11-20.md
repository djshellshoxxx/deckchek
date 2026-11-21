# Device outcome and trend defensive acceptance — 20 November 2026

Reviewer: `/root/device_outcome_security_fresh`, a fresh reviewer after all
three initial workers completed. This is static defensive acceptance. Dates
use America/Los_Angeles; retained execution records use UTC.

## Disposition and frozen source

**Accepted for this defensive source lane. No blocking finding remains in the
assigned changes or their evidence handoff.** This disposition binds to combined
commit `ce66a40ac9b306ff65a994d5adf00d1a696ba47b`, tree
`6de27897af9aea1f69084b1de6ef3c294247ac80`. It is not a functional execution,
native/hardware qualification, deployed-fix or comprehensive security claim.

I independently read the three initial reports, the corrected source and
actual consumers, the regression source, and the retained evidence. Git ancestry
includes input PR #68 at `d36517ff5bb9134288f7a8aedbc62066da874099`, the
functional handoff `5b770bb37ea284b2963334cd518f4817d479b6a8`, code audit
`a6a18da93d04c72cead1b42369706d31c7c5ea42`, and corrected security report
`1a0cdd44b13846089bfe8b24b1bda20ed9c97d26`.

All five correction-source/test files are byte-identical to the final author
candidate `9de3f95cf0e79851dc01a27066c515c6691ef811`. There is no difference
from that candidate in `app`, `tests`, `src-tauri`, `database`, `.github`, or
the root package manifests. The native tree remains
`10e575b294f2449efb166e359e4a07e1fcb687b3`.

| File | Independently computed SHA-256 |
| --- | --- |
| `app/devices/dispatch.js` | `a8cb0a842ecaa2b58a00fea995479123b66b492b5741f8c50892ac73d02d2907` |
| `app/diagnostics.js` | `49d23cbf7e7feea5aa6243d39cb38500a3cb082544378f92ddba5e3063813c6d` |
| `tests/device-outcome-evidence.test.mjs` | `06436b5f4d42ebaac3664e1c910ed6468988a01988f80c8e3c9a8c115385f11c` |
| `tests/device-outcome-screen.test.mjs` | `69130da091033046e9bf84631a039d08b909b633d54c9686bab00a8f7dc3ade1` |
| `tests/diagnostics-trend-degenerate.test.mjs` | `6a76bbb8f73a9bb29d34ae6af5d8c4b3c7a003379b1efa73c3419a60152919eb` |

## Result integrity across the actual boundaries

The protected property is the integrity of prospective test conclusions:
unavailable observations must not silently become a passing result. The
reviewed correction adds no authentication, authorization, network, privilege,
filesystem, dependency, telemetry or personal-data collection boundary.

| Boundary inspected | Acceptance reasoning |
| --- | --- |
| Native response → default system bridge | [`createSystemBridge`](../../app/system-check.js) already normalizes null, undefined and other non-object responses to `supported:false`. The correction does not change that behavior. |
| Scan/evaluator → result decision | [`scanRunner`](../../app/ui/devices/runners.js) does not finish/save an explicitly unsupported scan. A supported scan can reach the central evaluator with null readings and only informational findings. |
| Decision → saved record | The [Devices screen](../../app/ui/screens/devices.js) passes the supplied status through `ctx.finish` to [`saveResult`](../../app/ui/devices/library-state.js). No later positive-evidence inference is made there. |
| Saved record → browser/native storage | [`saveDeviceResultLocal`](../../app/catalog-store.js) retains `input.status`; [`save_result`](../../src-tauri/src/devices.rs) validates the existing status set and binds the status in parameterized SQL. The [schema](../../database/migrations/0002_device_library.sql) already permits `unknown`. |
| Saved record → display/progress/report | Existing [status and chronology helpers](../../app/devices/library.js) preserve unknown/adverse results; unknown is counted separately and displayed as REVIEW. The [HTML report](../../app/devices/dispatch.js) uses the same REVIEW mapping and escapes displayed text. |

In [`evaluateOutcome`](../../app/devices/dispatch.js), profile criteria retain
first priority, followed by explicit engine verdicts, then error and review
findings. The new fallback executes only after those decisions. It records the
latest value for each exact nonblank string metric ID and requires a strictly
finite numeric value or an explicit `ok` finding. A later unavailable value
replaces an older finite value for that same metric; another metric's valid
latest value remains independent evidence. Zero and negative finite numbers
remain observations, while null, undefined, nonfinite numbers and numeric
strings do not become evidence through coercion.

Consequently, the reviewed no-criterion/no-verdict fallback with no affirmative
evidence returns `unknown` and retains that status through the inspected save
and rendering path. An explicit PASS verdict is still an assertion under the
existing caller contract; this review does not certify its physical provenance.
A finite fallback observation likewise does not establish calibration or
compliance with an absent numerical threshold. These qualifications prevent the
bounded correction from being described as a universal measurement-validity
or scientific-certification rule.

Status is stored separately from measurement detail. Ordinary JSON handling of
unavailable/nonfinite detail cannot rerun the decision as PASS. The correction
does not alter storage, supply historical row IDs, migrate earlier results, or
reclassify old records. Existing history semantics remain intact.

### Reachability and fixture qualification

The supported-scan regression models a profile without a Windows-driver
definition or pass criterion. [`evaluateDriverCheck`](../../app/device-checks.js)
then yields four null readings and informational `driver-no-profile` context;
the absence of a driver definition does not supply an OK finding unless the
profile explicitly declares class compliance. This is the concrete reviewed
fallback boundary.

The final [screen fixture](../../tests/device-outcome-screen.test.mjs) includes
the required schema metadata and asserts the exact successful `validateProfile`
result before mounting the screen. Its persisted-row assertion precedes its
submitted-status assertion. The default bridge, actual event handler/evaluator,
`saveResult`, and browser catalog are used, while the DOM, native response and
backing storage are modeled. The prior missing-metadata, bootstrap and incorrect
UNKNOWN-display assertions remain retained and are correctly qualified in the
[initial functional report](DEVICE_OUTCOME_FUNCTIONAL_AUDIT_2026-11-20.md).

My independent static JSON inspection found **45** bundled profile files and
**14** handwritten `driver:check` tests; all 14 have pass criteria and Windows
driver definitions. The generated `auto-driver` builder in the
[test planner](../../app/devices/test-plan.js) also supplies a `driver_present`
criterion. This is not a demonstrated bundled-profile incident or
physical-device session. The existing default bridge's unavailable-response
normalization must not be described as a newly fixed raw-null save defect.

## Undefined trend fits

[`trendMetrics`](../../app/diagnostics.js) now rejects a zero time span after
finite-point filtering and before regression. The existing finite-coefficient
guard, usable-point count, denominator threshold and valid-span arithmetic are
preserved. Equal represented timestamps therefore remain unavailable even when
floating-point cancellation in the uncentered sums could otherwise produce
finite coefficients. No alternative fit is fabricated.

The [warm-up consumer](../../app/ui/analysis.js) emits trend measurements only
with a finite slope; the [stylus wrapper](../../app/stylus-wear.js) returns
`enough:false` for an unavailable slope. The correction preserves these existing
unavailable-result paths. It does not establish that every distinct-time series
is numerically well-conditioned, and the actual-module failure evidence is not
recast as a separately observed rendered UI incident.

## Author evidence checked without executing it

Static Git comparison confirms that baseline proof
`74f19b85e462b3602b12814a44226b6b9002b6d3` differs from assigned base
`9fc11d6e15cc97141c14b309c61a38393fcbafd8` only in the three regression files.
That proof differs from the final author candidate only in the two production
files. The final tests are therefore identical on both sides of the recorded
red/green comparison.

I checked all **32** entries in the author's
[digest ledger](evidence/device-outcome-functional-2026-11-20/SHA256SUMS), read
the final TAP counts and metadata, and compared the three final before/after
tracked-file maps byte-for-byte. The recorded counts are:

| Author source | Retained execution result | Qualification |
| --- | --- | --- |
| `74f19b85e462b3602b12814a44226b6b9002b6d3` | 16 tests; 11 pass, 5 expected semantic failures | Final schema-valid regression files on unchanged baseline application. |
| `9de3f95cf0e79851dc01a27066c515c6691ef811` | 16/16 pass | Final corrected source and validated fixture. |
| `8fbaa3e2ea95ec3ed4a47bdf30dfd04b0bb09aab` | 142/142 pass | Six related existing files; retained earlier-source coverage. |

All three records specify Node v24.22.3, zero skips/cancellations/TODOs, and
unchanged maps for 1,749 tracked files. These remain the author's executions.
This worker did not execute or independently reproduce them. The fresh
functional worker owns the combined-source full-suite acceptance.

## Fleet hosted evidence and disclosure boundary

I independently checked all **17** entries of the retained hosted
[byte inventory](evidence/fleet-gate-hosted-2026-11-20/artifact-index.json),
compared all **13** ZIP members with their extracted bytes, and matched the
derived summary to each stage record, phase timing, row-equality result and
SQLite-context record. The hosted source proof matches the prior accepted proof
byte-for-byte, SHA-256
`1940de1d300956e5fa24fe85d8ef71893063354a4d08ee2146a6ffa79f44738b`.
Source/tooling commit and tree IDs match available immutable Git objects.

| Retained stage | Result | Exit |
| --- | --- | ---: |
| Untouched ASan baseline | 767 pass, 0 fail, 8 ignored | 0 |
| Instrumented full suite | 766 pass, 1 fail, 9 ignored | 101 |
| Selected phase diagnostic | 1 pass, 0 fail, 0 ignored, 775 filtered | 0 |

The raw instrumented log records **213.308243 ms / 200 ms**. The complete job
log records `failedOrIncomplete: ["instrumented: exit 101"]` and final exit 1.
The baseline binary differs from the instrumented binary; the phase run uses
the instrumented binary. All four pairs record complete equality of 2,000 rows.
The [hosted result report](FLEET_GATE_HOSTED_RESULT_2026-11-20.md) accurately
preserves the failure, the small/warm sample, probe overhead, noncoincident
scheduler and wall intervals, absent allocation counts and unavailable binary
bytes. Its observations do not establish the original PR #65 failure's cause
or qualify any PR. The 200 ms limit and original failure remain unchanged.

The activated commit `69fc06eb471dfb00de544bbe233c0f5dc95402e8` has inert
parent `6ec1674806a05ca4e44d090b485e37ba35fdb590` and adds only the exact
reviewed workflow bytes. The assigned combined source does not contain an
active `.github/workflows/fleet-gate-context.yml`. The reviewed workflow uses
read-only contents permission, checkout without persisted credentials, fixed
application source, bounded steps and failure-preserving finalization. The
one-run restriction is operational; its YAML includes dispatch and a named
push trigger, so the report correctly avoids claiming a built-in lifetime
one-run counter. Root owns the live branch and further qualification.

The retained context captures only its explicit sanitizer/toolchain/runner
environment allowlist. Scoped literal inspection of the new complete job log
found masked checkout authorization headers and no matching GitHub credential
value, private-key marker or signed-download-URL pattern. This limited textual
inspection is not a general secret-detection guarantee or a history-wide audit.
The new application changes themselves add no logging or export fields.

## Limits and handoff

This lane performed source/spec reading, static Git comparison, JSON parsing,
archive-member comparison and hashing. It ran no application code, tests,
generators, native builds, benchmarks, scanners, adversarial probes or
vulnerability reproduction, and made no remote writes. Only this report is
changed in the worker branch.

No corrective application edit is requested. Root may combine this report
with the other fresh workers' results; rebind this acceptance if the reviewed
production files or evidence bytes change. Live exact-source CI, actual native
and hardware behavior, scientific qualification, release/deployment decisions,
and the separate issue #69 redaction work remain outside this disposition.
