# Diagnostics redaction fresh functional acceptance — 20 November 2026

Reviewer/executor: `/root/redaction_functional_fresh`. This independent lane
started after all three initial redaction workers and all six preceding
device-outcome workers had completed. Dates use America/Los_Angeles; retained
execution timestamps use UTC.

## Disposition

**The bounded redaction checks pass, but broad JavaScript acceptance remains
blocked by an unexplained full-suite failure.** One complete serial execution
produced **2,314 tests: 2,312 passed, one failed, one optional corpus check
skipped**. Every one of the 60 diagnostics/browser tests from the author's
focused run passed within that full execution, including all 47 shared vectors.

The failure was the existing cubic-distortion audio-quality test. Root
authorized one narrow serial rerun of its unchanged test file after the complete
failure was retained. That rerun passed **15/15**, but it does not erase or
explain the first failure. No source, assertion, threshold or skip was changed;
no further application execution followed the narrow rerun. Native compilation,
Rustfmt and native runtime parity remain unperformed locally and require their
own exact-source qualification.

Issue #69 remains open for bare/raw multiword profile values, unsupported
component syntax and ambiguity inside quoted prose. The extension uses wrapper
syntax as a heuristic; it does not establish a typed filesystem path or complete
Spec 02 AC-6 satisfaction. AC-6 itself is unchanged.

## Immutable source and prior evidence

| Role | Commit | Tree |
| --- | --- | --- |
| Assigned prior handoff | `6cd827b0204bc450b8fc6236a179c7383dd52911` | `629a834548412d6eb369466325342c3778839e49` |
| Author's final executed freeze | `7743813078381bbff713bf4609d5bb403188f269` | `0f695d9f92adca65edf9a7652770051b63dbd0af` |
| Fresh combined source, used for both executions here | `6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6` | `7dfe29d1e9378bbdfd98bbeff49aceed366c1c3a` |

I independently checked immutable Git objects, current bytes, retained JSON/TAP
records and SHA-256 inventories. The author changes exactly four source/test
paths from the prior handoff. Every difference from the author freeze to the
fresh combined freeze is documentation or evidence; application, native and
test bytes remain identical. The preliminary author checkpoint `7a5d137` differs
from final `7743813` only in one comment line per helper, clarifying the wrapper
heuristic before the author's execution.

| Changed path | SHA-256 at author and fresh freeze |
| --- | --- |
| [`app/diagnostics-bundle.js`](../../app/diagnostics-bundle.js) | `9235d3b7d2d3fcc8cf3a5900ebb5652bfb1bf864f3f9d2180754aaf600bb23cc` |
| [`src-tauri/src/diagnostics.rs`](../../src-tauri/src/diagnostics.rs) | `9bde6b142ff634398243d933456349d323962d52d89c4c7c756afe13aa60aace` |
| [`tests/diagnostics-bundle.test.mjs`](../../tests/diagnostics-bundle.test.mjs) | `ca84709cdbb0d86e9433e91285a18beb007d5695ffdbaaf9b71d58c84384cbe1` |
| [`tests/fixtures/redaction-vectors.json`](../../tests/fixtures/redaction-vectors.json) | `b69226de078aa89daff6b30e4d89bcddce4ad4fd087ee85ef2d490f8e2a8b121` |

The initial [code](REDACTION_CODE_AUDIT_2026-11-20.md),
[functional](REDACTION_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](REDACTION_SECURITY_AUDIT_2026-11-20.md) reports were read rather than
treated as substitutes for fresh inspection. Their source identities and
retained author evidence agree. The author's 60/60 result is independently
verified from its complete 11,311-byte TAP, digest
`0e65dd9c3872a08549404bb005d5d44633d0905792fc0b760008e57168d13d96`,
and metadata. Both author maps contain the same 1,817 entries; their keys match
the author's tracked tree and the four changed-path hashes agree. This is
verification of retained author records, not an extra execution by this lane.

The [static verification record](evidence/redaction-acceptance-2026-11-20/source-verification.json)
retains the comparisons, prior-report digests and all author inventory checks.

## Independent implementation and call-path inspection

The JavaScript and Rust helpers preserve the original profile token endpoint
unless a widening candidate meets the same conditions in both implementations.
An immediately adjacent opener must have one of five matching closers: double
quote, single quote, parentheses, square brackets or braces. Only actual interior
ASCII spaces authorize the wider component. Leading/trailing spaces, controls,
nonaccepted whitespace, hard punctuation, missing/mismatched closes and nested
delimiters retain conservative behavior. A closer must be found even after a
child-path separator.

Both helpers recognize only established placeholder atoms while considering
widening. This accommodates earlier literal/email replacements without treating
arbitrary angle-bracket text as a marker. Requiring a real space preserves the
kind of an existing no-space `<host>` or `<email>` marker. Email, literal, second
email, path and serial processing order remains unchanged. Rust's guarded
indexing and explicit end-of-input check correspond to JavaScript's fallback
when the boundary is absent. The new-only whitespace/control/BOM checks align
the reviewed cases; this is static parity, not proof over all Unicode versions.

The actual export paths retain a material distinction between already quoted
text and raw structured values:

| Inspected boundary | Consequence |
| --- | --- |
| [`buildBrowserBundleParts`](../../app/browser-bundle.js) | `redactValue` runs before `JSON.stringify`; the production dialog supplies no exact profile/user context to the browser builder. |
| Native `json_part` and `redact_value` | Raw strings are recursively redacted before pretty serialization. Serialization-added quotes do not provide wrapper evidence. |
| [`buildClientContext`](../../app/ui/screens/support-dialog.js) and native `ClientContext` | Settings are copied as generic values; native settings and system-health fields are arbitrary JSON values. No typed profile-path contract is introduced. |
| Native `run_parts` / `RedactCtx::from_env` | Existing exact local username/profile/host context and stored serial values remain available. A complete exact profile literal can provide stronger context than fallback recognition. |
| Support dialog and export | Redaction starts on, the user controls it, native output uses the chosen ZIP destination and browser output downloads locally. Reporting remains a separate user action with summary text. |

The paired JS/Rust raw-value assertions explicitly retain conservative bare
behavior and demonstrate exact-profile context separately. They do not transform
generic keys into typed path fields. A quoted natural-language message beginning
with a profile prefix can still be semantically ambiguous. Local raw logging and
crash markers are not globally PII-redacted at write time by this change.

All **19 original vector objects remain unchanged and in order**. The **28
additions** bring the shared fixture to **47 uniquely named vectors**. Inspection
confirmed paired expected-output and second-pass idempotence assertions in the
JavaScript and Rust consumers, plus the raw-value boundary assertion. The new
cases exercise supported wrappers, child/no-child paths, ASCII spaces with
Unicode name characters, intermediate placeholders and conservative fallback
boundaries. Native assertions were inspected but not executed.

The exact AC-6 requirement in [Spec 02](../specs/02-diagnostics-bundle.md) is
byte-identical to the prior handoff. The added status paragraph accurately
retains the raw-value and semantic limits; the narrower passing examples do not
weaken or fully establish the acceptance requirement.

## Full serial JavaScript execution

The [driver](evidence/redaction-acceptance-2026-11-20/execution-driver.py)
enumerated all 190 sorted top-level `tests/*.test.mjs` paths and passed them
individually after these exact Node arguments:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap
```

The complete expanded argument array, executable identity and runtime component
versions are in [full-suite.json](evidence/redaction-acceptance-2026-11-20/full-suite.json).
The Node directory was first in the child process PATH. Actual runtime was Node
**v24.22.3**, V8 **13.6.233.17-node.63**, Linux x64; the recording driver used
Python **3.12.14**. Only this lane executed project code during these runs.

| Observation | Full-suite result |
| --- | --- |
| Test counts | 2,314 total / 2,312 passed / one failed / one skipped / zero cancelled / zero TODO; zero suites reported. |
| Test process outcome | Exit 1, no timeout. The recording driver completed normally and retained that failing child exit. |
| UTC window | `2026-11-21T05:52:56.179677+00:00` to `2026-11-21T05:59:19.789970+00:00`. |
| Duration | 383.610259321 seconds process elapsed; 383522.621037 ms reported by TAP. |
| Complete TAP | 530,581 bytes; SHA-256 `39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197`. |
| Tracked inputs | All 1,831 SHA-256 entries identical before/after; same head/tree; clean checkout at both boundaries. |
| Skip | Existing optional local Mixxx controller corpus check: `MIXXX_CONTROLLERS_DIR not set`. No new skip was introduced. |

[Matching the completed TAP](evidence/redaction-acceptance-2026-11-20/redaction-subset.json)
against all 60 author focused test names finds exactly one passing occurrence
of each: 47 vector tests, nine other diagnostics checks and four browser-bundle
checks. Assertions inside one test are not counted as separate tests. No
standalone repeat of the old focused run was needed.

### Retained failure and the one authorized follow-up

Full-suite test 22, **“harmonic distortion is measured (cubic nonlinearity) and
chain floor is subtracted”**, failed at the existing THD comparison in
[`tests/audio-quality.test.mjs`](../../tests/audio-quality.test.mjs). Its
reported comparison was `16972224339301138 vs 4.347826086956522`; the assertion
requires relative error below 0.1. The test duration was 235.984116 ms. The
[complete raw TAP](evidence/redaction-acceptance-2026-11-20/full-suite.tap)
retains the assertion, stack and every other result.

The audio-quality code and this test are unchanged from the earlier accepted
device-outcome source; its retained earlier full-suite log records this same
test passing. The inspected cubic fixture uses deterministic buffers with the
noise branch disabled. Neither that observation nor a prior success establishes
the current failure's cause. No relationship to the redaction change, scheduler,
JIT, hardware or earlier Fleet timing failures has been established.

After the complete first run and stable maps were retained, root authorized
exactly this separate invocation on unchanged source:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap tests/audio-quality.test.mjs
```

| Observation | Narrow rerun result |
| --- | --- |
| Test counts / process | 15 total / 15 passed / zero failed, skipped, cancelled or TODO; exit 0, no timeout. |
| UTC window | `2026-11-21T05:59:31.012360+00:00` to `2026-11-21T05:59:36.716106+00:00`. |
| Duration | 5.703717603 seconds process elapsed; 5625.163149 ms reported by TAP. |
| Complete TAP | 3,356 bytes; SHA-256 `c8ee666590df3f24c0bb0eff784e71e0305b1247b4d1dac90d233c213847b06e`. |
| Inputs | Same frozen head/tree, clean boundaries and 1,831 identical tracked hashes. |

Its [metadata](evidence/redaction-acceptance-2026-11-20/audio-quality-rerun/audio-quality-rerun.json)
and [raw TAP](evidence/redaction-acceptance-2026-11-20/audio-quality-rerun/audio-quality-rerun.tap)
are separate evidence. This narrower success does not qualify the failed full
execution as passing. There was no assertion relaxation, test omission, source
patch or further rerun.

## Evidence integrity and handoff

All four before/after maps from the two runs are byte-identical, with SHA-256
`41267719c53427b83b55cb5c13bbd170193821ba4f25fb88edb9a56fcff475f2`.
Logs, maps and metadata stayed outside the checkout until both executions and
integrity checks completed. All 1,831 current file hashes were checked again
before evidence was copied byte-for-byte into the
[evidence directory](evidence/redaction-acceptance-2026-11-20/README.md).
Its inventory covers 14 evidence files; this report/evidence is a separate
documentation commit after the tested source.

Local PATH lookup found no `rustc`, `cargo` or `rustfmt`. No native compiler,
formatter, test, SDK installation, browser rendering, hardware measurement,
external upload, scanner, exploit/adversarial probe, vulnerability reproduction
or hosted diagnostic retrigger was performed. Source assertions and JavaScript
results do not establish native compilation or native runtime parity.

The [qualified acquisition merge](ACQUISITION_QUALIFIED_MERGE_2026-11-20.md)
belongs to its recorded main source `099c99c`; it does not qualify the changed
diagnostics Rust bytes. Prior Fleet failures and the 200 ms threshold remain
preserved. The scheduled next feature slice is outside this frozen review.

Root should retain this broad-suite failure in integration and obtain applicable
exact-source native/hosted qualification. The bounded redaction behavior has
fresh passing JavaScript coverage, but this lane does not recommend describing
the full local suite as passing, closing issue #69, declaring complete AC-6
coverage or claiming general release/hardware/privacy qualification.
