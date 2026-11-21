# Reference/PDF fresh full-suite evidence

This directory preserves the **first and only** full serial execution by
`/root/reference_functional_fresh`. The complete combined gate **failed**:
**2,357 total / 2,354 pass / 2 fail / 1 optional Mixxx skip**, Node v24.22.3,
exit 1, no timeout/cancellation/TODO. No narrow rerun or source change followed.

## Source and execution

- Frozen local source: `ded34d2dccfcf0ae51c78fa1492a57c161d32a1d`.
- Complete tree: `9030b4d9eeb307f27c0d794dccf4a37895c2a602`.
- Locally verified durable exact-tree equivalent: `b8bf6ea10791b05a2188d176ae8b996528a10f08`.
- Selection: all **192** top-level regular `tests/*.test.mjs` files, discovered
  and sorted, serial with `--test-concurrency=1`.
- Actual start: `2026-11-21T07:02:22.919389+00:00`; end: `2026-11-21T07:08:38.507830+00:00`.
- Elapsed: **375.588414659 seconds**.
- All **1,943 tracked hashes**, exact HEAD/tree and clean checkout state stayed
  unchanged. The two saved maps resolve to **1,833 distinct immutable Git blobs**.

The [complete combined stdout/stderr TAP](full-suite.tap) is **541,141
bytes**, SHA-256 `29ef19e0e0916e94e4c1ce0b27be3805f173375686cd522cf9aa8db11a77dec4`. The [final metadata](full-suite.json)
retains the actual arguments, runtime versions, times, counts, failures and skip.
The [startup metadata](full-suite-running.json) is retained as emitted before run.
The [before map](tracked-before.json) and [after map](tracked-after.json) are equal.
The [execution recorder](execution-driver.py) ran outside the checkout; its guard
refuses to execute inside the recorded source tree or overwrite the first TAP.

## Failures and scope

The cubic-THD case repeats the original issue #72 value:
`16972224339301138 vs 4.347826086956522`. The existing audio-runner retry case
expects `pass` but receives `fail`, with `3 of 9 checks failed: balance, response,
polarity.` Its preceding assertions reached one playback and one saved retry.
This does not establish an ownership fault, a common cause or an environment
cause. Source files for both cases and their audio implementations match both
original failed `6f414a4` and earlier passing `f081881` freezes.

All **132** initially focused case names appear among the full run's passes.
The original candidate 28/28, initial corrected selection 132/132 and current
full result are separate, overlapping source-bound observations, not additive
counts. Existing optional Mixxx corpus input remains unset. No tolerance, skip,
threshold or scientific gate was changed.

## Static verification and remaining work

The [static verifier](verify-evidence.py) imports no app/test. It binds fresh
maps to the exact Git inventory/blobs, checks complete log bytes/counts/hash,
test selection, runtime recorder digest, production/test comparisons and durable
source tree/parents. It verifies the 24 initial evidence entries and separate
result logs, preserving the original failed audio TAP. It does not rerun the
project or repeat unrelated historical map inventories. The complete
[verification result](evidence-verification.json) records these checks.

[SHA256SUMS](SHA256SUMS) covers this directory except itself. Files were copied
byte-for-byte only after the Node process and after-source snapshot completed.
The [fresh functional report](../../PLAYER_REFERENCE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md)
records review, failure context, held acceptance and root's separate diagnosis
handoff. No browser retry, screenshot, print PDF, native build, probe or scanner
was performed. Authored browser/print assertions remain unexecuted here. Issues
#69/#72, AC-6, fixed Fleet evidence/default-off and native/platform/scientific/
physical requirements remain separate and unchanged.
