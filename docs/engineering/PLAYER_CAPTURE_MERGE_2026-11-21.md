# Player capture consolidation — qualified merge

PR [#74](https://github.com/djshellshoxxx/deckchek/pull/74) merged at
2026-11-21 00:11:07 America/Los_Angeles, after all applicable source-bound gates
passed. The original head and branch are preserved.

## Source and merge proof

- Fixed source: `78403038c530a981b732d5ac0210539edf37fc77`.
- Current base at merge: `099c99c055322ef668be23e6ae50a2968614cc6d`.
- Actual tested merge: `62457f033c4b5d1bff3586959703f87e9e42835e`.
- Resulting merge and verified main: `77c26f44710c6dfb1c986fb79266c233e2ae688c`.
- Complete tree shared by source, tested merge and resulting merge:
  `5986c675b123203ecaf46f352d99a25b539c9f9f`.

Root fetched both merge objects and verified the complete trees and ordered
parents. A fresh PR and main read immediately preceded the merge, which used
the exact expected-head guard. The resulting merge has the same ordered base
and source parents as the tested merge. Input ancestry includes both the
preserved redaction consolidation and accepted usage candidate. No source
change or rerun was used to obtain the passing gates.

## Hosted qualification

| Workflow | Run | Applicable results |
| --- | --- | --- |
| DeckChek tests | [44877877101](https://github.com/djshellshoxxx/deckchek/actions/runs/44877877101) | JavaScript, rendered UI and Rust passed |
| DeckChek nightly | [44877877027](https://github.com/djshellshoxxx/deckchek/actions/runs/44877877027) | JS stress/fuzz, cargo-fuzz, Windows Rust, Rust stress and ASan passed |
| Desktop validation | [44877877090](https://github.com/djshellshoxxx/deckchek/actions/runs/44877877090) | Three embedded test jobs, all six builds and all five platform smoke jobs passed |

All three workflows completed successfully on attempt one for the fixed PR
head. Release checks and release publication were skipped for this PR; no
release or deployment occurred. The retained
[machine-readable qualification](evidence/audio-numerical-integration-2026-11-20/pr74-merge-qualification.json)
records job identities, statuses, source and merge proof.

The actual hosted JavaScript run recorded 2,332 total / 2,331 pass / 0 fail /
1 optional Mixxx skip. Hosted UI recorded 1,386 passing checks, including 19
Player checks. Its retained screenshots show real browser rendering with a
modeled native boundary; they do not establish physical capture quality.

## Result and remaining work

Issues #66 and #70 closed through this implementing merge. The provisional,
default-off Player capture UI, bounded diagnostic redaction, fractional trend
guard and same-batch usage correction are consolidated into main. PR #71
remains superseded and closed unmerged, with its original head preserved.

Issues #69, #72, #73 and #75 remain open. The original intermittent numerical
failures are preserved and unexplained. The independent reference/PDF
successor's full qualification remains held. Root's toolbar, Player guide and
ledger preset corrections are under the current fresh trio's review; their
new rendering checks have not run. The original local Chromium failure is
unchanged. No original failure, threshold, assertion, permission boundary,
physical qualification requirement or Fleet default was changed by this merge.

Root integrated the published audio context checkpoint and this qualified
merge into the held successor without changing its complete product/evidence
tree. The active workers retain their original `eafaa53` frozen source.
