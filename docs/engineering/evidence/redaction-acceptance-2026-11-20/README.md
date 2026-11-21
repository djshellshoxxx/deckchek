# Fresh diagnostics redaction acceptance evidence — 20 November 2026

This independent functional lane executed frozen source
`6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6`, tree
`7dfe29d1e9378bbdfd98bbeff49aceed366c1c3a`, on Node **v24.22.3**.
The [acceptance report](../../REDACTION_FUNCTIONAL_ACCEPTANCE_2026-11-20.md)
explains the bounded result and remaining qualification requirements.

## Retained executions

| Record | Result | Scope |
| --- | --- | --- |
| [Full suite metadata](full-suite.json), [raw TAP](full-suite.tap), [driver](execution-driver.py) | 2,314 total; 2,312 passed; one failed; one optional Mixxx skip; Node exit 1. | All 190 sorted top-level `tests/*.test.mjs` files, serial. |
| [Authorized narrow rerun metadata](audio-quality-rerun/audio-quality-rerun.json), [raw TAP](audio-quality-rerun/audio-quality-rerun.tap), [driver](audio-quality-rerun/execution-driver.py) | 15/15 passed; Node exit 0. | `tests/audio-quality.test.mjs` only, serial, unchanged source. |

Both runs had no timeout, cancellation or TODO. The full-suite failure in the
harmonic-distortion test remains unresolved and is not replaced or cleared by
the narrower success. No source, assertion, skip or threshold was changed.
No additional application execution followed the narrow rerun.

The metadata records the exact expanded argument arrays, runtime versions and
executable, source/tree identities, UTC start/end times, process duration,
counts, raw-log byte lengths and SHA-256 digests. The Node exit code is retained
explicitly; successful completion of the recording driver does not mean that
the Node test process passed.

## Integrity and static review

- [Full before map](tracked-before.json) and [after map](tracked-after.json).
- [Narrow before map](audio-quality-rerun/tracked-before.json) and [after map](audio-quality-rerun/tracked-after.json).
- [Source and prior-evidence verification](source-verification.json), with its [static verification script](source-evidence-verification.py).
- [Redaction subset matching](redaction-subset.json): all 60 author focused test names, including all 47 shared vectors, passed within the retained full run. This is TAP matching, not a separate execution.

All four tracked-file maps have the same 1,831 path/digest entries and identical
bytes (SHA-256
`41267719c53427b83b55cb5c13bbd170193821ba4f25fb88edb9a56fcff475f2`).
Both run boundaries were clean and retained the same frozen head/tree. Logs and
maps remained outside the checkout throughout execution and integrity checks,
then were copied here byte-for-byte in a separate documentation commit.
Temporary running-state metadata is intentionally excluded; complete records
are retained.

[SHA256SUMS](SHA256SUMS) covers every file under this evidence directory except
itself. It does not include the separately stored acceptance report.

Native compilation, Rustfmt and native tests were not executed. Source/vector
parity does not establish native runtime parity. Wrapped profile recognition
remains a syntactic heuristic; issue #69 retains bare/raw-value and ambiguous
prose scope, and Spec 02 AC-6 remains unchanged and not fully established by
this slice. Existing acquisition qualification and prior Fleet failures remain
source-specific records, not qualification of this changed native source.
