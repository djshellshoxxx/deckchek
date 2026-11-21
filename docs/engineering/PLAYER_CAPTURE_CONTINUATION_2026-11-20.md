# Player capture and usage correction — completed handoff

Review date: 20 November 2026, America/Los_Angeles.

## Completed scope

All three initial workers and all three fresh successors completed. The actual
app has a default-off Player capture preview for one input pair and 1–30 seconds.
It distinguishes requested/operator values from native observations, preserves
unknowns, owns cancellation on hide/feature disablement, rejects late results
and exports provisional metadata only. No waveform, History or report is saved.
Usage #70 adds valid same-batch deduplication and own-property source membership.
Native String validation is unchanged; this is not global/concurrent idempotency
or a complete arbitrary-object schema. Existing callers use literal sources.

| Lane | Initial | Fresh | Fresh report commit |
| --- | --- | --- | --- |
| Code | [Audit](PLAYER_CAPTURE_CODE_AUDIT_2026-11-20.md) | [Acceptance](PLAYER_CAPTURE_CODE_ACCEPTANCE_2026-11-20.md) | `58d1f4724aea038d786628cea9bf5c1b973c23ae` |
| Functional | [Audit](PLAYER_CAPTURE_FUNCTIONAL_AUDIT_2026-11-20.md) | [Acceptance](PLAYER_CAPTURE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md) | `9a6950bb0d4341a1ff6bd89a7f6e78dacdb8c205` |
| Defensive | [Audit](PLAYER_CAPTURE_SECURITY_AUDIT_2026-11-20.md) | [Acceptance](PLAYER_CAPTURE_SECURITY_ACCEPTANCE_2026-11-20.md) | `8743cb8bf1ad2b7c388967ef15a06ad33ed7f887` |

## Exact source and results

Reviewed source `f081881d4979e4385f255163660258784e27a264`, tree
`39d4351da05fc1fc65f555874824555d96df5cd3`, has durable exact-tree equivalent
`6295c3eb5b470b34f2a1010b040b1694780e0ee9`. The [publication proof](evidence/player-capture-integration-2026-11-20/source-publication.json)
records whole-tree, ordered-parent, input-ancestry and branch-readback checks.

The first and only fresh complete serial Node **24.22.3** run passed **2,331 /
0 failures / 1 optional skip**, **2,332 total across 191 files**, exit 0, no
timeout/cancellation/TODO. All **1,892 tracked hashes** and exact HEAD/tree stayed
unchanged; checkout was clean before and after. The [evidence](evidence/player-capture-acceptance-2026-11-20/README.md)
retains complete 534,094-byte TAP, SHA-256
`253caf6728565590e5f7ffab76287776a6cedcecbba3ffe8ecb88fcb9c423bc1`.
The skip is the existing optional Mixxx corpus with its directory unset.

Root verified 26 initial and nine fresh evidence digests, TAP bytes/counts/hash,
equal source maps, fresh report commits and 87 links. Runtime/tests are unchanged
from the freeze; see [integration proof](evidence/player-capture-integration-2026-11-20/local-integration-proof.json).
Original local commits are preserved in the [history bundle](evidence/player-capture-integration-2026-11-20/local-review-history.bundle)
with [metadata](evidence/player-capture-integration-2026-11-20/local-review-history.json).

Initial 77/77, separate candidate 22/22, and audio diagnostic 15/15 and 33/33
results remain separate and overlap. **Ordering correction:** the 33-test TAP
lists audio-quality first, then app-state and audio-out. Its argument order does
not establish matching full-suite predecessor execution. The earlier “prefix”
label means a three-file diagnostic selection only. Issue #72 remains unresolved;
later successes neither explain nor repair its preserved original failure.

## Gates and next handoff

Chromium's single local launch failed at host socket creation before any page
or smoke body ran. No screenshots, rendered success or retry occurred. The final
ordered-initializer smoke still needs actual hosted execution on this successor.
Native/platform and scientific/physical gates remain separate. Earlier #71's
standard jobs passed; at 06:50 UTC cargo-fuzz and Linux x86 build still ran.
Those earlier results do not qualify the later UI. Its [retained JS observation](evidence/player-capture-integration-2026-11-20/pr71-javascript-observation.json)
includes the actual Node22 log and tested merge/tree/parents.

Accepted #66/#68 and bounded #69 changes remain included from the
[previous consolidation](REDACTION_CONTINUATION_2026-11-20.md). #69 and original
AC-6 stay open. Main is last verified at `099c99c055322ef668be23e6ae50a2968614cc6d`.
Publish this successor before superseding #71; retain input branches and keep
the published head fixed for its own applicable gates. Close #66/#70 only through
a qualified implementing merge with current-base/tree proof and expected head.
#68 is already superseded/closed unmerged. No release or deployment is included.

A distinct new initial trio reviews optional reference-file hashing and PDF #73
on an isolated successor; neither change is qualified by this freeze. Finish
that set before fresh successors. Reference/raw retention, pitch integration,
History/reports and scientific/physical validation remain open. Operator values
and existing settings may remain; discarded results do not imply secure erasure
or deletion of downloads. Fleet stays off with its fixed diagnostic, original
unexplained failures and unchanged thresholds. No permissions changed.
