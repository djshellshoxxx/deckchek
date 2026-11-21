# Mobile QR continuation and consolidation — 20 November 2026

Dates use America/Los_Angeles; execution records retain UTC. This continuation
preserves PR #62's CDJ evidence work, corrects the actual Mobile QR import path
from PR #63, and implements issue #64's bounded framing requirements.

## Resulting behavior

Framed input reaches `joinQrFrames` without whole-text trimming by
`parsePhoneRun`. A valid export with significant spaces at a chunk boundary
therefore survives reverse-order paste through the actual desktop importer.
Plain JSON, BOM and empty-input normalization remain supported.

The existing 1,000,000-byte transfer cap, 2,000-byte QR policy and 1,100-byte
default chunk remain fixed. Custom chunk sizes must be safe integers 1..1,977,
reserving the largest 23-byte header. Packing preserves codepoints, avoids
empty chunks and enforces 999 actual frames. Exact headers, CRLF separators and
one terminal CRLF fit the original import budget. Multi-frame raw CR/LF text
is rejected with file-export guidance. Direct joining validates and budgets
supported primitive strings before parsing an ordinary snapshot.

The generator updated the mobile module, VERSION and service-worker stamp.
Independent static review confirmed seven shared copies, 31 hashed mobile
files, 32 precache URLs (including `./`) and stamp `6d877785e1ef`.
The valid production export path remains within these bounds: an independently
checked conservative maximum of 796,534 framed bytes supports retaining the
existing Show QR UI. The [author report](MOBILE_QR_FUNCTIONAL_AUDIT_2026-11-20.md)
records the calculation and its limits. Integrity hashes do not authenticate
the exporter; phone-origin/calibration semantics are unchanged.

## Source and worker handoff

| Role | Commit / tree |
| --- | --- |
| Original #63 | `9f3da9edbdeab30c3078aaac25c0cbc254ac22bb` / `b0303506f44ff937554b621f94ba3ab4944bac9e` |
| Corrected author source | `61a4c0d7190e79239287d3ef1710ee83267d1897` / `5f19f23b67b4a7e04a2470c664d1c5582648a314` |
| Frozen independent-review source | `7ae15e17d0c8247efde1ba26c59df4e13f4e321c` / `2f2a99a1370f1863649aa2bd0552ddc92f6ad1e4` |
| Durable equivalent | `912ecefd88a34233998f327f76fa18452716d02a` / `2f2a99a1370f1863649aa2bd0552ddc92f6ad1e4` |

The durable source was independently fetched and matched the complete frozen
tree. Its parents preserve unchanged #62 `4b053e7` and #63 `9f3da9e`.
Only the five intended QR files differ from #62 across app/mobile/tests/tools
and native source; CDJ modules/tests remain unchanged. Final evidence and status
updates are a documentation-only overlay on the frozen implementation.

All three initial workers finished before three different successors began.

| Stage | Report and disposition |
| --- | --- |
| Initial code | [Original findings](MOBILE_QR_CODE_AUDIT_2026-11-20.md); corrections required. |
| Initial functional / author | [Red/green evidence](MOBILE_QR_FUNCTIONAL_AUDIT_2026-11-20.md); corrected 49/49 author verification. |
| Initial defensive | [Original findings](MOBILE_QR_SECURITY_AUDIT_2026-11-20.md); MQR-F1/S1/S2/F2 required correction. |
| Fresh code | [Accepted](MOBILE_QR_CODE_ACCEPTANCE_2026-11-20.md); no unresolved Standards/Spec blocker. |
| Fresh functional | [Accepted](MOBILE_QR_FUNCTIONAL_ACCEPTANCE_2026-11-20.md); full serial Node suite and unchanged-source verification. |
| Fresh defensive | [Accepted](MOBILE_QR_SECURITY_ACCEPTANCE_2026-11-20.md); original requirements resolved. |

Defensive review was source-only. The original regression used an ordinary
valid export; option/budget rejection checks ran only after correction.
No exploit, vulnerability reproduction, scanner or offensive workflow was used.

## Verification

Independent execution at frozen source `7ae15e1` passed **2,251 tests / zero
failures / one expected optional Mixxx-corpus skip**, 2,252 total, across 186
test files. There were no cancellations or TODO results. Node 22.23.4 ran the
complete `tests/*.test.mjs` set with `--test-concurrency=1 --test-reporter=tap`.
All 1,616 tracked SHA-256 values remained unchanged, with a clean checkout
before and after. Four changed-module syntax checks passed. Both generated
mobile checks were included in the full suite and were not repeated.

TAP duration was **379,593.158934 ms**; enclosing duration was
**379.670415946 s**. Full TAP SHA-256:
`234c1817b89ce8b0d8cb8bcc9218df275344d0ce9183d4ea737726b794654b17`.
The fresh functional report links the exact command, timing, raw TAP and
complete before/after manifests. The 49-case QR author scope and 21-case CDJ
scope overlap this full run; no duplicate focused total was added.

Overlapping original local results remain separate: #63 focused 40 passed /
2 failed; benign actual-import regression 10 passed / 1 failed; corrected author
49/49, all on Node 22.23.4. The original and corrected five-file runs each
preserved all 1,574 tracked hashes. The [author artifact index](evidence/mobile-qr-functional-2026-11-20/artifact-index.json)
pins exact logs, metadata, manifests and the red-regression test snapshot.

Original #63 hosted JavaScript had 2,232 passed / 2 failed / 1 optional skip:
the same stale mobile build checks. Its [source-bound record](evidence/mobile-qr-integration-2026-11-20/pr63-hosted-javascript-failure.json)
identifies run `44858411064` and job `136705908509`; the retained log is explicitly
the contiguous failure-summary-through-exit excerpt, not the full hosted log.

No physical phone/camera scan was performed. Local acceptance does not qualify
native packaging or hardware; the successor needs all applicable standard,
nightly and desktop checks at its own final head before a guarded merge.

## Consolidation and remaining work

PRs #54/#58/#59 are merged; last verified main before this successor is
`cfb1137d3d01ddd4a9fd0677113314dc7deb76ee`. #58/#59 passed their applicable
standard/nightly jobs, six builds and five packaged smokes, with merged-tree
equivalence. Their evidence remains in the
[CDJ continuation](CDJ04_EVIDENCE_CONTINUATION_2026-11-20.md).

Publish owned branch `integration/deckchek-mobile-qr-continuation-20261120`
against main. Verify the complete published tree and both input ancestors
before closing #62/#63 as superseded. If #62 qualifies first, its existing
guarded merge procedure remains applicable. Keep issue #64 open until a
qualified implementing PR merges. Preserve original branches and failures.

CDJ records remain unverified and ineligible for reports. Capture ownership,
reference-byte retention/hashing, scientific metadata, SQLite/history/HTML
round trips, independent characterization and physical players remain open.
Native/browser device-profile assignment already exists. Keep Fleet default-off,
the separate Fleet diagnostic, all owner/hardware gates, caps and thresholds.
The existing scheduled continuation receives the next handoff. Credit balance
is unavailable; environment failures do not establish exhaustion. No release,
deployment, tags, history rewriting or branch deletion is authorized here.
