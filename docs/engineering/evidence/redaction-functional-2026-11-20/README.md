# Redaction functional evidence — 20 November 2026

The [functional report](../../REDACTION_FUNCTIONAL_AUDIT_2026-11-20.md) records
the bounded implementation and residual scope. Its dates use America/Los_Angeles;
execution metadata retains UTC.

The only application execution was one serial Node v24.22.3 invocation of
`tests/browser-bundle.test.mjs` and `tests/diagnostics-bundle.test.mjs` at
`7743813078381bbff713bf4609d5bb403188f269`, tree
`0f695d9f92adca65edf9a7652770051b63dbd0af`. All **60 tests passed**, with zero
failures, skips, cancellations or TODOs. The 47 shared vectors include all 19
unchanged original vector values and 28 synthetic additions. Their idempotence
assertions are not separate test-count claims.

The driver and outputs stayed outside the checkout during execution. Both
tracked SHA-256 maps contain the same 1,817 entries, and the checkout was clean
at both boundaries. Raw TAP bytes were copied unchanged after the run. The
source freeze is separate from the later report/evidence commit.

| File | Purpose |
| --- | --- |
| `source-freeze.json` | Source/base/tree identities, four changed paths/hashes, vector preservation, compiler lookup and limits. |
| `focused.json` | Exact command, runtime, times, exit/counts, clean state and full log digest. |
| `focused.tap` | Complete 11,311-byte output; SHA-256 `0e65dd9c3872a08549404bb005d5d44633d0905792fc0b760008e57168d13d96`. |
| `tracked-before.json`, `tracked-after.json` | Complete identical frozen-input maps. |
| `execution-driver.py` | Exact author driver, including original working/output locations. |
| `SHA256SUMS` | Digest ledger for this directory, excluding itself. |

This is JavaScript evidence. Matching Rust source and its shared vector consumer
were inspected but not compiled, formatted with Rustfmt or executed locally.
No baseline privacy reproduction, diagnostic retrigger, external transmission
or hardware test was performed. Generic raw structured strings retain the bare
fallback. Wrappers are a syntactic heuristic, not proof that enclosed text is a
path; issue #69 retains material residual scope.
