# Audio investigation — initial trio complete

Review date: 20 November 2026, America/Los_Angeles.

All three initial workers completed. **The actual retry verdict failure remains
unresolved; no production correction or cause is established.** Reports and
complete observations are integrated at
`8dbef3a91f4d88d01ec5a570265258443fd7f3cc`, tree
`9f3376e0e936abb6df4c1bc73ce91aa1d7581224`.

| Lane | Completed commit | Report |
| --- | --- | --- |
| Code | `4d4650cb231653068a7058e7bd22ddb390c45bd5` | [Code audit](AUDIO_NUMERICAL_CODE_AUDIT_2026-11-20.md) |
| Functional | `231396c662c90fa8e5c757c76bb4be14cc242762` | [Functional audit](AUDIO_NUMERICAL_FUNCTIONAL_AUDIT_2026-11-20.md) |
| Defensive | `8c033c88007127aea779d378685e57fff45ee8a7` | [Defensive audit](AUDIO_NUMERICAL_SECURITY_AUDIT_2026-11-20.md) |

The sole functional executor completed exactly two Node24.22.3 invocations:
the unchanged two-file selection **33 total / 32 pass / 1 fail**, and a separate
consistent six-call diagnostic. Root verified all 19 functional manifest
entries. The reports retain exact source/tree, runtime, commands, original
TAP/JSON, equal before/after inventories and independently checked hashes.
Conditional optimization comparison was not executed because its prerequisite
was absent. No production, original assertion, threshold or skip changed.

The successful pure diagnostic did not exercise the actual lifecycle or its
predecessors. Both failing assertions follow their file's third completed
analysis; this does not establish a common mechanism or engine defect. The
runner setup ends at -12 dBFS and default progress/retry level is also -12 dBFS.
Matching analyzed tone slices do not mean complete stereo buffers match:
crosstalk segments intentionally differ.

Fresh `audio_code_round2`, `audio_functional_round2` and
`audio_security_round2` begin from the integration above in isolated worktrees.
Only the functional worker executes project code. It preserves all original
cases/order/assertion conditions and production while adding post-analysis
context. Static review precedes each bounded observation; no blind reruns,
broad suite or speculative solver patch. Root owns production and integration.
All three workers finish before the next fresh trio begins.

The [reference/PDF handoff](PLAYER_REFERENCE_CONTINUATION_2026-11-20.md) remains
held by its first complete **2,357 total / 2,354 pass / 2 fail / 1 optional skip**.
Durable outcome `2022c97d8fb1f941de13e151be9627bbdfcc278e` has verified
[publication proof](evidence/audio-numerical-integration-2026-11-20/reference-outcome-publication.json).
Issue #72 includes that new failure and its durable evidence links.

Fixed draft #74 remains `78403038c530a981b732d5ac0210539edf37fc77`, without
reference/PDF changes. All three standard hosted jobs passed. Its UI job passed
**1,386/1,386** checks, including 19 player checks. The
[complete log, original PNGs and source-bound observation](evidence/audio-numerical-integration-2026-11-20/pr74-ui-observation.json)
are real hosted Chromium evidence with a modeled native boundary, not physical
capture. Root's screenshot inspection found shared mobile toolbar overlap and
a stale Quick Check guide on Player. Root addresses these on isolated branch
`implementation/deckchek-narrow-toolbar-20261120`; #74 remains fixed.

The earlier local Chromium socket denial remains a pre-page failure without
retry. Hosted #74 does not qualify newer reference/PDF smokes. #69/AC-6, #72,
fixed Fleet evidence/default-off, thresholds, permissions and physical gates
remain unchanged. No credit exhaustion, release or deployment is claimed.
