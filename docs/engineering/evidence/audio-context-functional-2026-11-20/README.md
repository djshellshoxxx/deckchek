# Audio lifecycle context — fresh functional evidence

Owned by `/root/audio_functional_round2`. The [functional report](../../AUDIO_CONTEXT_FUNCTIONAL_AUDIT_2026-11-20.md)
contains interpretation and limits. Two project runtime invocations occurred;
both first outcomes are retained, and no third was performed or queued.

| Directory | Exact executed source | First outcome |
| --- | --- | --- |
| `runner-message/` | `5b340667e21c2d7d5bf25ed7116ed1b21cc3acb3`, tree `1e191df434541fbb7c36c84f739a26ac6b979626` | 18/18 pass; no failure payload emitted |
| `two-file-aggregate/` | `f26c247a44a70dd1e19f08ee1bee6dad7fe2f864`, tree `0c24c00e4e3748992371c8d90303859a22f5dd4e` | 33 total / 31 pass / 2 fail; original cubic and retry failures reproduced |

Each execution folder retains complete stdout TAP, separate stderr, running and
completed command/runtime metadata, whole tracked before/after maps and observed
TAP case order. Outputs were written outside the checkout until the command and
final snapshot completed, then copied without modification.

The aggregate adds `contexts.json`, the extracted retry error-message JSON and
an observed-field summary. Ten finish payloads contain eight live and two file
results. Live array identities were hashed after the whole runner file finished;
file input identities are explicitly unobserved. No waveform bytes are written
to the JSON. Immediate retry-message fields equal the final aggregate result.

This evidence root preserves the original runner source, both executed versions,
final serializer source, both exact Git patches, both Python recorders and the
first transformation description. The aggregate is opt-in through
`DECKCHEK_AUDIO_CONTEXT_PATH`; its exact path is in the second metadata file.
Both runs used absolute Node v24.22.3, serial TAP, absent `NODE_OPTIONS` and a
180-second timeout. The second names the original audio-quality and runner files
without filtering cases.

`verify-evidence.py` imports only Python standard-library modules and performs
Git reads. It binds complete inventories to immutable blobs and verifies copied
sources/patches/recorders, runtime metadata, raw output digests and reported
aggregate facts. It imports no application/test, runs no analyzer and performs
no numerical reconstruction. `evidence-verification.json` records the outcome;
`SHA256SUMS` covers all other evidence files.

Run the read-only verifier from the repository root:

```sh
python docs/engineering/evidence/audio-context-functional-2026-11-20/verify-evidence.py
```

Retained buffers have extended lifetimes and the diagnostic adds small
post-analysis harness allocations. These may affect allocation/timing; delayed
hashes are not entry-time copies or mutation proof. Raw fits and unrounded
lag/clock fields are absent from `ctx.finish`; surviving rounded measurements
do not replace them. No numerical/runtime/common cause or repair is established.
Original full failures and issue #72 remain unresolved. Raw failed TAP and exact
patches retain whitespace-only lines to preserve evidence bytes.
