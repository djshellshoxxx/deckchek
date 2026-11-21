# Acquisition and QR qualified merge — 20 November 2026

## Completed consolidation

Root merged [PR #67](https://github.com/djshellshoxxx/deckchek/pull/67) after
every applicable existing check completed successfully on its fixed source.
The expected-head-guarded merge is
`099c99c055322ef668be23e6ae50a2968614cc6d`, tree
`f7e32678dd89880a7dce642424100e77c5e22374`. Root fetched that commit and
verified its complete tree and ordered parents. The resulting tree is exactly
the one qualified by the PR's runs; no new application bytes were introduced
by the merge.

This brings the reviewed Mobile QR bounds/whitespace correction, provisional
CDJ evidence records and owned acquisition API into main. The
[acquisition implementation handoff](CDJ04_ACQUISITION_CONTINUATION_2026-11-20.md)
retains its six-worker acceptance and scope. Later device-outcome/trend changes
and the active diagnostics-redaction work remain on the next successor.

## Exact source proof

| Role | Commit |
| --- | --- |
| Main immediately before merge | `cfb1137d3d01ddd4a9fd0677113314dc7deb76ee` |
| Fixed PR #67 head | `157b0dbe1849d42e835cc365ba7292eb633c04d9` |
| Actual tested merge | `cc8e18c8b28f1aaef40e9b8b1e1e51853730216f` |
| Guarded main merge | `099c99c055322ef668be23e6ae50a2968614cc6d` |
| Included fixed QR PR #65 head | `562609b4acc8bc24704cc864ef27c0b11c56bc00` |

The current-base `git merge-tree --write-tree` result, tested-merge tree, PR
head tree and actual merged tree all equal
`f7e32678dd89880a7dce642424100e77c5e22374`. The tested merge and main merge
both have ordered parents `cfb1137d` and `157b0dbe`. The API merge used the
complete expected PR head, after a final live read confirmed the same base,
head and clean merge state. There were no reviews or review/conversation
comments on #67 at the qualification readback.

## Completed applicable gates

All three runs were pull-request events for #67, with exact head `157b0dbe`,
base `cfb1137d`, and **attempt 1**. No manual rerun was used.

| Run | Applicable results |
| --- | --- |
| [Standard 44865459691](https://github.com/djshellshoxxx/deckchek/actions/runs/44865459691) | Rust tests, JavaScript tests and UI smoke all succeeded. |
| [Nightly 44865459717](https://github.com/djshellshoxxx/deckchek/actions/runs/44865459717) | Cargo fuzz, Rust ASan, JS fuzz/stress, Rust stress and Windows Rust tests all succeeded. |
| [Desktop 44865459630](https://github.com/djshellshoxxx/deckchek/actions/runs/44865459630) | Three embedded test jobs, six platform builds and five packaged smoke jobs all succeeded. |

The six builds cover Windows x64/x86, Linux x64/x86 and macOS x64/arm64.
Packaged smokes cover five targets; Linux x86 remains build-only under the
existing workflow. `release-checks` and `release` were intentionally skipped
for this PR event. They are not counted as passing release stages, and no
release, tag, deployment or distribution action was performed.

The ASan job `136728004015` passed **767 tests, zero failures and eight
ignored** on compiler `c7d5ba59d8e11ee2e2204b173458eec4cb41c973`. Its complete
source-bound log was already retained in the
[Fleet diagnostic evidence](evidence/fleet-gate-diagnostic-2026-11-20/pr67-asan-success.json).
The other job successes above are taken from their completed GitHub job
records; no additional corpus size, runtime-test count or physical coverage
is inferred from a successful job status.

## Preserved failures and original inputs

PR #65's own ASan run remains a recorded failure at
**201.565999 ms against 200 ms**. The separate single hosted Fleet diagnostic
also remains failed at **213.308243 ms against 200 ms** in its instrumented
suite. The later successful #67 run is source-specific and does not erase,
clear or establish the cause of either timing failure. The
[complete diagnostic report](FLEET_GATE_HOSTED_RESULT_2026-11-20.md) retains
the raw archive, log, measured context and interpretation limits.

After #67 merged, GitHub reported #65 as closed/merged and issue #64 as closed.
Root did not issue a separate merge/closure request for those two objects.
The #65 inclusion is through #67's qualified ancestry; it must not be described
as a passing #65 ASan run. Live branch-ref readback confirmed the original
QR branch still at `562609b4`, acquisition branch still at `157b0dbe`, and
diagnostic branch still at `69fc06eb`. No branch was deleted or rewritten.

## Successor and limits

Root carried the new main ancestry into the redaction integration branch with
commit `97ce02e4fce0b503f4fa6cfe7dac960aa08b6731`. That merge changed no file:
its tree remains `629a834548412d6eb369466325342c3778839e49`, identical to the
published six-worker device-outcome handoff `6cd827b`. Active redaction workers
retain their fixed `6cd827b` source; later fresh acceptance will bind to the
combined successor.

CDJ observations and metadata remain provisional, unverified and report-ineligible.
Production player UI, retained raw/reference bytes, persistence/reporting and
scientific/physical qualification remain open. No hardware capture,
calibration, scientific certification or general release readiness is implied.
Fleet remains off and its 200 ms gate is unchanged.

- [Complete pre-merge qualification and job records](evidence/redaction-integration-2026-11-20/pr67-qualification-before-merge.json)
- [Guarded result and post-merge verification](evidence/redaction-integration-2026-11-20/pr67-qualified-merge.json)
- [Accepted device outcome/trend successor](DEVICE_OUTCOME_CONTINUATION_2026-11-20.md)
