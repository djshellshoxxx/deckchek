# Fresh player capture acceptance evidence — 20 November 2026

Worker: `/root/player_functional_fresh`. All three initial player workers had
completed before this independent acceptance. This worker alone executed local
project code during the fresh review.

## Exact first full run

- Commit: `f081881d4979e4385f255163660258784e27a264`.
- Complete tree: `39d4351da05fc1fc65f555874824555d96df5cd3`.
- Node: `v24.22.3`; Linux x64.
- Selection: all 191 lexically sorted top-level `tests/*.test.mjs` files,
  one invocation with `--test-concurrency=1` and TAP output.
- Outcome: **2,332 total / 2,331 pass / 0 fail / 1 optional Mixxx skip /
  0 cancelled / 0 TODO**; Node exit 0; no timeout.
- Start: `2026-11-21T06:36:00.862387+00:00`; finish:
  `2026-11-21T06:42:22.067000+00:00`; elapsed `381.20458830499956` seconds.
- All **1,892** tracked SHA-256 values stayed equal, with clean
  boundaries and unchanged exact HEAD/tree.
- Full TAP: **534,094 bytes**; SHA-256
  `253caf6728565590e5f7ffab76287776a6cedcecbba3ffe8ecb88fcb9c423bc1`.

The only skip is the existing optional local Mixxx-controller corpus check
because `MIXXX_CONTROLLERS_DIR` is unset. The cubic-THD case passed here; the
original unexplained Node 24 failure remains retained and issue #72 is not
cleared. No second or narrow run, browser retry, native invocation, installation
or source/test edit was performed by this worker.

## Retained files

| File | Meaning |
| --- | --- |
| [execution-driver.py](execution-driver.py) | Exact recorder that ran the one full suite; preserves the first log and refuses overwrite. |
| [full-suite-running.json](full-suite-running.json) | Source/runtime/command metadata recorded before execution. |
| [full-suite.json](full-suite.json) | Final status, runtime, arguments, dates, counts, source checks and TAP digest. |
| [full-suite.tap](full-suite.tap) | Complete unedited stdout/stderr TAP. |
| [tracked-before.json](tracked-before.json) | Every tracked path and SHA-256 immediately before execution. |
| [tracked-after.json](tracked-after.json) | Same complete inventory immediately after execution. |
| [verify-evidence.py](verify-evidence.py) | Independent static immutable-Git-blob/log/map verifier; runs no application code. |
| [evidence-verification.json](evidence-verification.json) | Six retained run maps checked, 1,817 distinct blobs, 26 initial ledger entries, source bindings and original failure preservation. |
| [SHA256SUMS](SHA256SUMS) | Digests of all other files in this evidence directory. |

Raw logs, recorder and metadata were created outside the checkout at
`/workspace/scratch/6f2247f2f463/player-fresh-runtime-20261120` and copied here only
after the full run and source snapshots finished. The exact recorder is bound
to the original clean source/worktree and intentionally is not a generic rerun
command. Its runtime metadata lists safe selected details; no complete process
environment was recorded.

## Scope and previous evidence

The [fresh report](../../PLAYER_CAPTURE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md)
explains independent source inspection, actual functional coverage and limits.
The [initial evidence](../player-capture-functional-2026-11-20/README.md)
contains separate overlapping 77/77, 22/22, 15/15 and 33/33 selections. Their
counts are not additive. All five initial source maps, raw log hashes/lengths
and counts were independently verified against their respective Git trees.

The [original failed full TAP](../redaction-acceptance-2026-11-20/full-suite.tap)
and [separate authorized narrow TAP](../redaction-acceptance-2026-11-20/audio-quality-rerun/audio-quality-rerun.tap)
remain unchanged, with their original complete digests independently verified.
The initial Chromium socket-EPERM failure occurred before page/module execution;
its empty screenshot/check inventories remain unchanged. The final smoke's
ordered initializer refinement remains unexecuted in a browser locally.

This evidence does not establish browser rendering, native/platform packaging,
real audio hardware, scientific measurement or release qualification. Those
exact-source gates remain separate. Fleet remains default off, issue #69 stays
open, and unfinished Spec 10 reference/raw retention, pitch integration and
History/report work is not qualified by this provisional capture UI.
