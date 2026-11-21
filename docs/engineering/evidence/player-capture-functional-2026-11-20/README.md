# Player continuation functional evidence

Evidence owner: `/root/player_functional`, the sole project runtime executor
for this initial worker set. Dates use America/Los_Angeles; timestamps use UTC.
Complete logs and maps stayed outside the checkout until execution/source checks
finished, then were copied byte-for-byte into this directory.

| Execution | Exact source/tree | Actual result |
| --- | --- | --- |
| Audio-quality diagnostic copy: original assertions, one numerical log, absolute import | `3d0667b` / `3ccdec9` | 15/15 pass, exit 0; 1,853 tracked hashes unchanged. |
| Previous full-suite prefix: app-state, audio-out, same audio diagnostic copy | `3d0667b` / `3ccdec9` | 33/33 pass, exit 0; 1,853 tracked hashes unchanged. |
| Actual Node usage-hours candidate file | `b8dfc12` / `a066064` | 22/22 pass, exit 0; 1,655 tracked hashes unchanged. |
| Five-file player UI/feature/acquisition/evidence/usage selection | `d785e70` / `4ebca02` | 77/77 pass, exit 0; 1,856 tracked hashes unchanged. |
| Isolated rendered player smoke launch | `09f6e5d` / `9402f8f` | Exit 1 before any page/module body; Chromium socket EPERM; 1,857 tracked hashes unchanged. No screenshots. |

All runs used Node v24.22.3. Node test runs were serial with no failures,
skips, cancellations or TODOs in these individual diagnostic/focused selections.
No execution timed out. Counts overlap and must not be summed. The usage row
is actual Node execution, independent of the author's earlier adapted V8 result.
The final row is an environmental browser-launch failure, not a UI assertion pass.

The first two rows did **not** explain or clear the earlier failed full suite.
Both recorded THD 4.3478%, amplitude about 0.115 and lag about 137 samples for
the cubic fixture. No production, original assertion, threshold or skip was
changed. No further audio retry followed. The original failed full and narrow
passing runs remain in `../redaction-acceptance-2026-11-20/`.

`audio-context/audio-quality-context.test.mjs` is the exact diagnostic copy as
executed. It is evidence, not a maintained test or a portable command; its
absolute import intentionally identifies the actual checkout. `run-command.py`
and `run-ui.py` are the executed recorders. The browser recorder reuses the
`tap_*` metadata field names for its complete plain-text log, but its TAP counts
and UI summary are empty because launch failed before the flow ran.

`source-binding.json` gives full IDs, production-byte equivalence, the actual
browser environment and execution limits. After the failed launch, a static
refinement put the dependent native mock initializers into one script. Final
smoke source `2cb1aec` / `816bf89` passed Node syntax checking only; it was not
re-launched. Production and maintained Node-test bytes are unchanged from their
executed freezes. Applicable exact-source hosted browser/full/native gates remain.

`SHA256SUMS` covers each retained evidence input/output except this index and
the ledger itself. The main [functional report](../../PLAYER_CAPTURE_FUNCTIONAL_AUDIT_2026-11-20.md)
explains scope, findings and the remaining qualification holds.
