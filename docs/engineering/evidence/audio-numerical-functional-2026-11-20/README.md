# Initial audio numerical functional evidence — 20 November 2026

This folder retains two distinct project runtime observations by
`/root/audio_functional_round1`. Neither replaces the failed complete run in
`../player-reference-acceptance-2026-11-20/`. See the
[functional report](../../AUDIO_NUMERICAL_FUNCTIONAL_AUDIT_2026-11-20.md).

| Artifact | Meaning |
| --- | --- |
| `unchanged-selection/run.tap` | Complete unchanged two-file output: 33 total / 32 pass / 1 fail. Cubic passed; retry returned `3 of 9 checks failed: balance, response, polarity.` |
| `unchanged-selection/result.json` | Exact source `c67bd2a5`, tree, command, runtime, counts, raw digest and source stability. |
| `unchanged-selection/actual-execution-order.json` | Case order extracted from the retained TAP. All 15 audio-quality cases precede the 18 runner cases in that output. |
| `diagnostic-1-default/output.json` | Complete outputs from six analyzer calls: clean/cubic/runner twice, followed by independent matrix/residual comparisons. This is diagnostic data, not a six-test pass total. |
| `diagnostic-1-default/result.json` | Exact source `c64d6b88`, command, runtime, raw digest and source stability. Exit 0, no timeout, empty stderr. |
| `diagnostic-1-default/tool-source.mjs` | Exact executed tool bytes, matching `tools/diagnostics/audio-numerical-context.mjs` at the recorded source. |
| Each `tracked-before.json` / `tracked-after.json` | Full tracked-path SHA-256 maps, captured while the checkout was clean and before runtime logs were copied into it. |
| Each `running.json` | Pre-execution metadata retained alongside the completed result. |
| `run-command.py`, `run-diagnostic.py` | Exact execution recorders. They write logs outside the checkout and record final source state before copying. |
| `fixture-provenance.json` | Static equality of the copied fixture declarations to their existing source, with exact digests and scope. |
| `verify-evidence.py`, `evidence-verification.json` | Static byte/Git verification and its result; no project imports or analyzer execution. |
| `SHA256SUMS` | Digests for every other file in this folder. It does not hash itself. |

## Exact runtime and limits

Node executable:
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`.
Actual version: **v24.22.3**, Linux x64, `NODE_OPTIONS` absent. Python 3.12.14
recorded both runs. The unchanged selection had a 120-second deadline; the
six-call diagnostic had a 180-second deadline. Neither timed out.

The selection source is `c67bd2a5d2bbe37ce0e97e0e8db4962a14c706ce`, tree
`9e2b38e1dcf681834f5ad9e2f356fa34862204c3`, with 1,956 unchanged tracked paths.
The diagnostic source is `c64d6b88c98f33a2ff42529f4e9235f005a047ee`, tree
`b91803abd3677f95241a62a4de45213dd4ec4003`, with 1,957 unchanged tracked paths.
Only the new diagnostic tool differs between those source inventories.

The six-call diagnostic retained all pipeline outputs before independent
arithmetic or console output. Full capture digests bracket the six-call batch;
they are not per-call mutation snapshots. Full left/right buffers intentionally
differ in crosstalk segments. The compared shared tone slices match byte-for-byte.
The runner numerical capture does not model the actual retry lifecycle or its
predecessor tests. No individual production harmonic-fit trace was inserted.

All three repeated snapshots match, both channel fits agree, and the cubic THD
agrees closely with its analytical value. This did not reproduce or explain the
failed lifecycle assertion. Conditional diagnostic 2 was **not executed**; the
condition for an optimization-mode comparison was unmet. No production fix or
engine/environment cause is established.

The verifier resolves the recorded source commits through local Git objects.
It checks both complete inventories against immutable blobs, both new raw output
hashes and selected historical raw artifacts, source equality across five
freezes, and the recorded numerical consistency facts. It does not rerun either
project command. The original full failures, passing narrow observations and
this new failing selection remain distinct.

The raw TAP retains Node's two whitespace-only YAML separator lines. A general
`git diff --check` reports those lines; they are intentionally preserved to keep
the original output hash. Authored tool, report, recorder and verifier text has
no whitespace-check findings.
