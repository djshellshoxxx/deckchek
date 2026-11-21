# Fresh device outcome and trend acceptance evidence

The frozen combined source is `ce66a40ac9b306ff65a994d5adf00d1a696ba47b`,
tree `6de27897af9aea1f69084b1de6ef3c294247ac80`. One independent serial
JavaScript suite ran on Node v24.22.3 after all three initial workers completed.

- `full-suite.json`: exact expanded command, all 190 selected files, actual
  runtime versions, source/tree, start/completion, exit, counts, duration,
  optional-skip line, tracked integrity and complete TAP digest.
- `full-suite.tap`: complete merged stdout/stderr from that one invocation,
  retained byte-for-byte.
- `tracked-before.json` and `tracked-after.json`: equal SHA-256 maps for all
  1,804 tracked files. Evidence was staged outside the repository during the
  run, then copied here after the clean ending state was recorded.
- `static-evidence-verification.json`: independent source comparisons and checks
  of the retained author evidence and hosted Fleet artifact bytes. Those older
  executions remain attributed to their authors and exact source.
- `execution-driver.py`: the exact local wrapper used for this frozen run,
  retained for inspection. Its constants refer to the original source and
  scratch paths; this is not an instruction to repeat an unchanged suite.
- `SHA256SUMS`: digests for the evidence files above.

Result: **2,285 total / 2,284 passed / 0 failed / 1 skipped**, zero cancellations
or TODOs, exit 0. The sole skip is the pre-existing optional Mixxx corpus when
`MIXXX_CONTROLLERS_DIR` is unset. No source or test edit, native run, hosted
rerun or threshold change was made by this lane.

See [the fresh functional report](../../DEVICE_OUTCOME_FUNCTIONAL_ACCEPTANCE_2026-11-20.md)
for inspected boundaries and qualification limits.
