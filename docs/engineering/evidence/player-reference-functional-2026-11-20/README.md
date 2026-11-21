# Reference-file and PDF-axis functional evidence

This directory preserves the complete first results produced by
`/root/reference_functional_round1`. All executions used Node **v24.22.3** on
Linux x64. The [recorder](run-command.py) ran outside each source checkout and
captured clean Git identity, tracked-file hashes, runtime metadata, exact argv,
timestamps, complete combined stdout/stderr and process outcome. Files were
copied here byte-for-byte only after execution and after-source snapshots.

## Recorded executions

| Directory | Exact source | Actual outcome |
| --- | --- | --- |
| [pdf-original](pdf-original/result.json) | `5cc916eefbeb3e174edf9bdbcd6c731d6776e56d`, tree `f0c06c626acc477a2191f23653b7d42a37cbba8b` | Original prepared issue #73 candidate: **28/28**, exit 0, 1,655 tracked hashes unchanged. |
| [combined-focused](combined-focused/result.json) | `dd11f41dc41e102ddd8bf7f34e87153afa994f59`, tree `d6272a78da9791fc40cb0cdeff238cb68d979c5f` | Eight related files: **132/132**, exit 0, 1,908 tracked hashes unchanged. |
| [player-smoke-syntax](player-smoke-syntax/result.json) | Same combined source | `node --check tools/smoke/player-capture.mjs`: exit 0, empty output, no test body or browser execution. |
| [pdf-smoke-syntax](pdf-smoke-syntax/result.json) | Same combined source | `node --check tools/smoke/pdf.mjs`: exit 0, empty output, no test body or browser execution. |

The two test selections overlap; their counts are not additive. The original
PDF candidate's old cases did not cover the subsequently corrected rounded-span
gap. The combined selection contains the expanded X/Y regression and reference
tests. No full-suite rerun was performed by this initial worker. The fresh
successor owns that separate acceptance.

## Complete output

- [Original PDF TAP](pdf-original/run.tap): 5,758 bytes, SHA-256
  `3d3fd808003cc8c31e28adf0049538e176a013f89ae06f7eacc6f14213b3b3c5`.
- [Combined TAP](combined-focused/run.tap): 29,628 bytes, SHA-256
  `95abf54baa565c395efb52d761339810e1f69f02eecd180a516190844d7325cc`.
- Both syntax outputs are empty: SHA-256
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Each execution subdirectory contains `running.json`, `result.json`, complete
`run.tap`, `tracked-before.json` and `tracked-after.json`. The filename `run.tap`
is the recorder's common stdout/stderr destination; the syntax records correctly
have no TAP counts and must not be called browser tests.

## Independent source verification

The [static verifier](verify-evidence.py) imports no app or test. It checks all
four source inventories against immutable Git blobs, all before/after equality,
log lengths/digests and parsed counts. The
[verification result](evidence-verification.json) accounts for **1,834 distinct
Git blobs**, verifies production equality to coordinated source `447019568d6a0cc0ce0fe16412e9ac99c204f604`,
and preserves original candidate path scope and Spec 10 bytes. The original
unexplained Node24 audio-failure TAP is also unchanged.

[SHA256SUMS](SHA256SUMS) covers this directory's files except itself. The
[functional audit](../../PLAYER_REFERENCE_FUNCTIONAL_AUDIT_2026-11-20.md) gives
the behavior, source correction and handoff context.

The known Chromium socket-EPERM launch restriction was **not retried**. No page,
browser download, screenshot, print PDF, native build, hardware observation,
probe or scan was produced by this lane. Authored hosted smokes can produce
those UI/render artifacts only when they actually run in the hosted environment.
