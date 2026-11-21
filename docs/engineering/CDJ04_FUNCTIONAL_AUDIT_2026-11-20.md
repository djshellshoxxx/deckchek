# CDJ-04 functional audit and arithmetic correction — 20 November 2026

Worker: `/root/cdj04_functional_fresh`. Dates use America/Vancouver.

## Outcome and handoff

The original isolated prototype passed its eight existing cases, but three new
numerical-contract cases exposed missing arithmetic boundaries. This worker
authored a narrow correction and three meaningful regressions. The corrected
scope passed **11/11** cases. Root must obtain fresh independent acceptance of
the corrected bytes; this report is author evidence, not self-approval.

| Role | Exact commit / tree |
| --- | --- |
| Original PR #57 source | `d2ccfdaa4bd1a8f6da9a7cc632e4967cb8463092` / `30ee0e04b49fdc4a7e81fe5cb17effb76fffdd73` |
| Original application base | `e49ea1bbafb5005fdf1dfcf60d885b82d0191471` |
| Corrected implementation and tests | `61e5a750928d391d0c3ba41f4a8274053a1b55be` / `c992ed617d7161d94ca695543fc0eef1140806a7` |

Work stayed on `review/deckchek-cdj04-functional-20261120` in
`/workspace/scratch/6f2247f2f463/deckchek-cdj04-functional`. Published #57 and #58
were not changed. Only the pure helper, its focused test file, and this later
report/evidence were authored.

## Reviewed contract

[SPEC-10's v1.0 implementation contract](../SPEC-10-CDJ-media-player-diagnostics.md#v10-implementation-contract)
defines speed as `100 × (measured frequency / reference frequency − 1)` and
display error as measured speed minus displayed percentage, in percentage points.
It excludes platter RPM conversion and requires qualified reference/capture and
disabled processing before interpreting the ratio as speed.

The [prototype report](CDJ04_DISPLAY_PROTOTYPE_2026-11-20.md) deliberately limits
this helper to calculation on caller-supplied evidence. This review checked that
scope, the eight existing tests, input validation, quality flags, uncertainty,
range semantics and ordinary arithmetic edge cases. It also inspected the
existing finite-value persistence boundary and
[scientific-method requirements](../SPEC-19-scientific-measurement-and-validation.md).
Neither document makes the prototype a validated capture or player workflow.

The signs and units in the ordinary positive, negative and zero cases match the
formula. A valid supplied range constrains the entered display value; the helper
does not clamp measured speed to that range or invent model capabilities. Six
quality flags require literal `true`. Expanded uncertainty must be finite and
positive, with a nonblank method. These guards depend on callers providing
truthful, separately established evidence; the helper does not verify it.

## Confirmed findings

| Finding | Original behavior | Corrected behavior |
| --- | --- | --- |
| F1 — Final error could be non-finite | The helper checked speed but not the subsequent subtraction. Accepted finite speed/display operands could produce an infinite error while `eligibleForReport` remained true; JSON would replace that value with null. | The final difference must be finite before a measurement is returned; otherwise `invalid_display_error` excludes it. |
| F2 — Positive ratio could underflow | Two positive finite frequency inputs could divide to zero in floating-point arithmetic. The derived `-100` speed remained finite and was returned as eligible. | The derived ratio must remain positive and finite, and the derived speed must be finite; otherwise `invalid_frequency_ratio` excludes it. |
| F3 — Rejected numeric types still reached arithmetic | A direct caller's unsupported BigInt frequency was correctly rejected by `Number.isFinite`, but division still ran before returning exclusions and threw. | Accumulated input/quality exclusions return before any metric arithmetic. No numeric coercion was added. |

The parallel code and defensive reviewers independently identified F1; the code
reviewer also called out arithmetic on rejected numeric types. This worker
reported the findings to root before editing and retained a failing baseline.
The boundary fixtures are synthetic numeric controls. In particular, the large
finite range used to exercise subtraction overflow does not assert a physical
player's supported range. No model-specific limit, diagnosis or threshold was
inferred from these fixtures.

The patch preserves the existing calculation and returned field names for valid
inputs. It adds one exclusion reason for an unrepresentable final difference.
Input errors now return their existing validation reasons before any derived
ratio error is considered. There are no consumers of this prototype in the
production screen or report pipeline; no persistence schema was changed.

## Executed verification

Runtime: **Node v22.23.4**, explicit executable:
`/workspace/scratch/6f2247f2f463/toolchain/node_modules/node-linux-x64/bin/node`.

Every run used this bounded command from the owned worktree:

```sh
node --test --test-concurrency=1 tests/cdj-pitch-display.test.mjs
```

| Execution | Result | TAP duration | Integrity evidence |
| --- | --- | ---: | --- |
| Original published helper and eight tests | **8 passed / 0 failed / 0 skipped / 0 cancelled** | 83.535081 ms | All **1,531 tracked hashes** unchanged; clean before/after. |
| New three regression cases on unchanged original helper | **8 passed / 3 failed / 0 skipped / 0 cancelled** | 146.784527 ms | Original helper hash unchanged; both helper/test hashes matched before/after execution. |
| Corrected helper and all eleven cases | **11 passed / 0 failed / 0 skipped / 0 cancelled** | 85.799500 ms | Both executed helper/test hashes unchanged; exact blobs match committed `61e5a75`. |

The failing cases were two assertion failures for incorrectly eligible results
and the unsupported-type arithmetic exception. They were not fixture failures.
The green run's enclosing subprocess took **0.134293963 seconds**. Both changed
JavaScript files passed `node --check`; `git diff --check` passed for the code and
test change. No dependency installation was needed.

The scopes overlap and must not be summed. The corrected run's integrity check
covered its two executed source/test files; the all-1,531-file claim belongs to
the original eight-case run. The subsequent Git comparison confirms that only
the helper and focused tests changed before the implementation commit.

### Preserved exact evidence

All three logs and metadata records are committed under
[`evidence/cdj04-numeric-2026-11-20/`](evidence/cdj04-numeric-2026-11-20/).

| Evidence | SHA-256 |
| --- | --- |
| Original helper | `6fbd3f1e8fc5c3810ba4b53fbddfbc13011d2bb6133353b41684e89c64b26cb5` |
| Corrected helper | `040a0703f8d68cecedae43616b977378f11baf5f6ac8e18be487e1bd85262988` |
| Corrected eleven-case test | `acdea851530a2471f3e9823a9aebd587b3f24225a93674778409cf05a2a2141f` |
| Original eight-case log | `fae587cd1be0dc50e1622e7e684ae0c0f5090f15a5044771497734112da603ba` |
| Failing eleven-case baseline log | `753458a548623c2a4fc411cf369673e7a295d1e4ecdbd5435e94f5d5b91d3d79` |
| Corrected eleven-case log | `375d16a9c1ae9ed254c686883d7a74e6ae44c48db4ac9b632351caaab731a3df` |

The evidence records the expanded argv, source IDs, elapsed time, counts and
hashes. Original logs are retained byte-for-byte, including normal trailing
blank lines; those raw evidence files are excluded from prose whitespace checks.

## Limits and next implementation boundary

These are pure-function checks. No audio estimator, capture backend, actual
reference tone, browser, native application, physical player, external probe or
hardware test ran. Wrong-reference, clipping and instability suppression are
tested only through supplied flags, not measured PCM. The helper still lacks
the full asset/media/capture/provenance record and persistence/UI integration
explicitly deferred by the prototype report.

The next implementation boundary should be a separately specified caller that
obtains and retains verified reference identity, supported range, processing
state, quality observations, capture calibration and uncertainty provenance.
Its saved result must preserve exclusions, units, method, raw evidence references
and comparison compatibility through round trips. Those prerequisites must be
resolved before labelling a production report or player calibration qualified.

Root should hand `61e5a75` and this original/red/green evidence to fresh code,
functional and defensive successors, then qualify the actual integrated source.
Keep the original published candidates stable. Preserve all gates, dependencies,
feature defaults, model unknowns and physical qualification. No release,
deployment, remote write, branch deletion or history rewrite occurred here.
