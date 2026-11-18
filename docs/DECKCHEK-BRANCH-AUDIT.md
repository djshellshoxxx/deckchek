# DeckChek branch and pull request audit

> Current continuation: [Checkpoint 35](DECKCHEK-CONTINUATION-35.md). Source [3aa4d964](https://github.com/djshellshoxxx/deckchek/commit/3aa4d964bc4091a2c16aac042a9bce9b2f8aeec5) combines catalog transfer, history navigation, platform-test corrections, Fleet result ownership and the concurrent integrity/profile repairs. The serial Node suite passed **1,722/0/1**. Current qualification and limits are in that report; the sections below and the unchanged [057d42f report](DECKCHEK-CONTINUATION-2026-11-18.md) retain source-scoped history.

## Historical checkpoint 34 — source 32419404

**Source checkpoint — 2026-11-18 UTC:** executable source `32419404fefdbbe95b91987c8bd606aa598e763b`, tree `cf87a10c3cb15cd041a6dfd806426c98c7487a29`, parent `963054dc543af018d0f13734a9e2abc54ca83113`. This 15-path update implements the separate browser venue-history archive through Data and the existing stores. The complete serial Node 22.23.5 rerun passed **1,663 tests, zero failures and one optional Mixxx-corpus skip (1,664 total; 259.849819454 TAP seconds)** across **141 test files**, with all **1,408 frozen files** unchanged. The initial full-run SIGKILL and isolated six-test pass remain recorded below; no termination cause is established. Research remains **15 existing profiles**, with **45 models, 506 handwritten checks, 187 generated checks and 23 conditional audio cases**.

At the **2026-11-18 14:19:57.475 UTC** pre-publication inventory, the owned remote branch was `963054d`, while [PR #30](https://github.com/djshellshoxxx/deckchek/pull/30) and its pull-head ref still reported `e6a64d7`; PR30 remained an open draft with mergeability **null/unknown**. A separately observed merge candidate names `963054d` and unchanged integration `0acb612` as parents. The discrepancy has no established cause. Source `32419404` exists but no branch has moved to it; the future documentation child has no assigned SHA. Main remains `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`, and PR27 metadata is untouched. Earlier successes/failures remain tied to their sources. Hosted native/browser/platform/extended checks, broad Sonar, hardware and release qualification remain open. No release, tag or deployment is authorized.

The refreshed inventory contains **28 branches and 25 pull requests**: 10 open, 14 merged, and 1 closed without merge. PR29 was merged by the repository owner at 2026-11-18 09:13:18 UTC with frozen head `fd39b145` and merge `e43be06`. Its closed head is not the later branch head `0985e9e`; PR30 is the active continuation. The six report conflicts between `0985e9e` and `0acb612` were reconciled using their source and evidence, preserving the monitor save/prune repair, separate GLib syntax/provenance work and PR28 SQLite facts. The obsolete PR28 advisory-acceptance recommendation remains excluded.

## Complete branch inventory

API inventory was recorded at **2026-11-18 15:33:18.863 UTC**. The following **28** branch rows compare each observed head with main and source `3aa4d964bc4091a2c16aac042a9bce9b2f8aeec5`. The owned `2c9abbc` head is **323 ahead / 0 behind main**, **0 ahead / 3 behind this source**, with **589 changed paths** since main's merge base. Source 35 is **326 ahead / 0 behind main**; 20 observed heads are ancestors, which is not a new semantic-equivalence determination. The future documentation child is excluded. Evidence: `continuation-35-remote-inventory/inventory.json` and `source35-divergence.json`. The 14:19 snapshot above remains historical.

| Branch | Observed head | Ahead / behind main | Ahead / behind this source | Changed paths since main merge base | PRs |
|---|---|---:|---:|---:|---|
| `checkpoint/deckchek-midi-boundaries-20261025` | `7d44aae2f56db8316c61c0f6cf1adaf75dcad988` | 11 / 11 | 5 / 331 | 28 | — |
| `claude/amazing-fermat-csql4g` | `a4d844b22df478a141c06a6561c941d6461a8aea` | 1 / 12 | 1 / 338 | 29 | [#9](https://github.com/djshellshoxxx/deckchek/pull/9) |
| `claude/bold-hawking-jmyq4o` | `beaf3f8141f8b0f2c2969d0e0dd1a084dc04ca42` | 255 / 0 | 0 / 71 | 308 | [#25](https://github.com/djshellshoxxx/deckchek/pull/25) |
| `claude/confident-goldberg-o06vg2` | `9f4928a00a44b62529429d1f14ad104b65db28c6` | 223 / 11 | 0 / 114 | 271 | [#14](https://github.com/djshellshoxxx/deckchek/pull/14) |
| `claude/docs-screenshots` | `551757fad1ce4fa8318e996531e644de22927b19` | 0 / 10 | 0 / 336 | 0 | [#15](https://github.com/djshellshoxxx/deckchek/pull/15) |
| `claude/epic-thompson-tvwx9n` | `3440a631e33eee832e73ae41d142d2d4af49e2fb` | 0 / 20 | 0 / 346 | 0 | [#1](https://github.com/djshellshoxxx/deckchek/pull/1) |
| `claude/tender-johnson-w8l6nn` | `152028aac5f43b02ea87d1e30dfb07592f6a901f` | 0 / 5 | 0 / 331 | 0 | [#17](https://github.com/djshellshoxxx/deckchek/pull/17) |
| `codex/correct-miditest-plan-20261030` | `819f38186b9ee8f5b846b2eec0a4c3381a6bf043` | 0 / 6 | 0 / 332 | 0 | [#18](https://github.com/djshellshoxxx/deckchek/pull/18) |
| `codex/fs36-midi-core-20261030` | `3ea13bdd1025247f546cffffe6c56914ad5f6c20` | 244 / 9 | 0 / 91 | 304 | [#21](https://github.com/djshellshoxxx/deckchek/pull/21) |
| `codex/fs36-stream-cleanup-20261030` | `84b687c8b0b5102420b2d3d82ced9aebcea05664` | 248 / 9 | 0 / 87 | 304 | [#22](https://github.com/djshellshoxxx/deckchek/pull/22) |
| `codex/miditest-contracts-20261030` | `171a827611750ba6a0fbf7098957ff6949283e3d` | 0 / 1 | 0 / 327 | 0 | [#23](https://github.com/djshellshoxxx/deckchek/pull/23) |
| `codex/monitor-snr-20261031` | `3b5f46441769f5b15bbf7d07e6ac4378801ce6ad` | 254 / 0 | 0 / 72 | 308 | — |
| `codex/post-consolidation-20261030` | `a8918a3b9f8b428b0d65ae1255e79a1045faf799` | 250 / 0 | 0 / 76 | 305 | [#24](https://github.com/djshellshoxxx/deckchek/pull/24) |
| `codex/reconcile-wiki-20261030` | `34347b6ef859861ecdd0b70d1b1f5e1a9ee817cb` | 242 / 9 | 0 / 93 | 301 | [#19](https://github.com/djshellshoxxx/deckchek/pull/19) |
| `continuation-deckchek-core-20261028` | `e30e018f068c086c1337df9ef211aff18f36a07b` | 256 / 0 | 0 / 70 | 308 | [#16](https://github.com/djshellshoxxx/deckchek/pull/16) |
| `docs/readme-and-wiki` | `4cfa38cf127881f07a7ab9e408f2fb701c4ff984` | 1 / 12 | 1 / 338 | 6 | [#10](https://github.com/djshellshoxxx/deckchek/pull/10) |
| `feat/hardware-profile-catalog-20261020` | `46b86ebbbd34738f2e5d0db66d39517e3dcbe688` | 94 / 35 | 94 / 361 | 43 | [#2](https://github.com/djshellshoxxx/deckchek/pull/2) |
| `fix/remediation-678de3d8-904afa` | `1694aa2b828679d15cee959b7aa974c40d995b4c` | 1 / 7 | 1 / 333 | 1 | [#20](https://github.com/djshellshoxxx/deckchek/pull/20) |
| `integration/deckchek-consolidation-20261118` | `0acb612aa796f7f459172932868ff7e787d83399` | 309 / 0 | 0 / 17 | 495 | [#27](https://github.com/djshellshoxxx/deckchek/pull/27) |
| `main` | `ee5aa511fb49fc56e299d5b5c262e815ab420d0d` | 0 / 0 | 0 / 326 | 0 | — |
| `nodata/dazzling-meitner-m35twn` | `5bd6359ed5a013379dd1ca7aaee7cdd270931874` | 1 / 0 | 0 / 325 | 1 | — |
| `nodata/doc-sweep-20261118` | `61a7c6b74d75074cef5ec029e1c127184d869c86` | 1 / 0 | 0 / 325 | 5 | [#31](https://github.com/djshellshoxxx/deckchek/pull/31) |
| `nodata/practical-ptolemy-wu3ekp` | `4466cc0bb9951a98528f576726e01dd9cecc388e` | 261 / 0 | 0 / 65 | 328 | [#26](https://github.com/djshellshoxxx/deckchek/pull/26) |
| `nodata/zealous-mayer-g8x5b0` | `57bd96609aeaf03e97cc79cf3ab1b19115e0da74` | 291 / 0 | 1 / 36 | 359 | [#28](https://github.com/djshellshoxxx/deckchek/pull/28) |
| `review/deckchek-lifecycle-20261118` | `2c9abbc2fbe7bc2108376d8c2d1c259180ffcb69` | 323 / 0 | 0 / 3 | 589 | [#30](https://github.com/djshellshoxxx/deckchek/pull/30), [#29](https://github.com/djshellshoxxx/deckchek/pull/29) |
| `task/deckchek-fleet` | `f0feebeb657e76bc758f8e5328573abe36f11670` | 13 / 11 | 0 / 324 | 53 | [#13](https://github.com/djshellshoxxx/deckchek/pull/13) |
| `task/deckchek-spec-completion` | `1ca22bef3f9571e7486054712028bf9c6d776552` | 16 / 11 | 3 / 324 | 53 | [#12](https://github.com/djshellshoxxx/deckchek/pull/12) |
| `work/deckchek-audio-diagnostics-release` | `34b809f771e2fb4ce903d5608788779e124a1ed7` | 26 / 12 | 26 / 338 | 20 | [#11](https://github.com/djshellshoxxx/deckchek/pull/11) |

## Complete branch disposition

Risk describes integrating the affected subsystem; it is not a new vulnerability rating. All branch histories remain preserved.

| Branch | Contribution | Integration risk | Decision | Verification / evidence |
| --- | --- | --- | --- | --- |
| `checkpoint/deckchek-midi-boundaries-20261025` | MIDI packet validation; observed-stall test; CI annotations; historical evidence | Medium | Superseded; retain equivalent patches and original evidence | Three exact patch equivalents; checkpoint evidence byte-equal after two-line provenance header. |
| `claude/amazing-fermat-csql4g` | FS-34 device plans; FS-35 audio quality; FS-36 MIDI/GM | High | Superseded by corrected port; qualify PR27 | All 29 changed paths retained through corrected ports; current diagnostic/native ownership regressions supply separate behavioral evidence. |
| `claude/bold-hawking-jmyq4o` | FS-31 negative-SNR, Sonar and correctness fixes | High | Keep through PR27 | Exact tip is an ancestor. |
| `claude/confident-goldberg-o06vg2` | M7/M8 implementation, fuzz/stress/QA/CI | High | Supersede PR14 after PR27 merge | Exact tip is an ancestor. |
| `claude/docs-screenshots` | README/screenshots | Low | Already in main | Exact tip is an ancestor of main. |
| `claude/epic-thompson-tvwx9n` | Shared M7 foundations | Medium | Already in main | Exact tip is an ancestor of main. |
| `claude/tender-johnson-w8l6nn` | Conditional MIDItest integration proposal | Low | Already in main | Exact tip is an ancestor of main; proposal does not authorize unmade product decisions. |
| `codex/correct-miditest-plan-20261030` | MIDItest proposal schema, CI and decision corrections | Low | Already in main | Exact tip is an ancestor of main. |
| `codex/fs36-midi-core-20261030` | FS-36 analyzer, Identity Reply and GM sequences | High | Keep through PR27 | Exact tip is an ancestor. |
| `codex/fs36-stream-cleanup-20261030` | 14-bit pairing, Active Sensing gaps, GM abort cleanup | High | Keep through PR27 | Exact tip is an ancestor. |
| `codex/miditest-contracts-20261030` | Logical-port, SysEx, scheduling and evidence contracts | Low | Already in main | Exact tip is an ancestor of main. |
| `codex/monitor-snr-20261031` | Acquired-carrier negative-SNR monitoring | High | Keep through PR27 | Exact tip is an ancestor; cold-start/changing-pitch limitations remain explicit. |
| `codex/post-consolidation-20261030` | Corrected main proposal integration and handoff | Low | Keep through PR27 | Exact tip is an ancestor. |
| `codex/reconcile-wiki-20261030` | Reconciled five wiki documents | Low | Keep through PR27 | Exact tip is an ancestor; supersedes PR10 status and paths. |
| `continuation-deckchek-core-20261028` | Core diagnostic evidence, restored data and ownership | High | Supersede PR16 after PR27 merge | Exact tip is an ancestor; do not merge stale stack separately. |
| `docs/readme-and-wiki` | README test record and five wiki documents | Low | Superseded by PR19; close PR10 after PR27 merge | All five wiki files exist with corrected architecture, code map, dated evidence and navigation; obsolete README claims superseded. |
| `feat/hardware-profile-catalog-20261020` | 37 researched hardware profiles | Medium | Already squash-merged; preserve corrected catalog | Exact cumulative diff equals main commit 0962d654. The original audit recorded 39 of 43 paths unchanged; subsequent reviewed model research changes additional paths. The unverifiable DDJ-S8 remains removed. |
| `fix/remediation-678de3d8-904afa` | MIDItest migration/recovery and Windows CI requirements | Low | Closed PR20; superseded by corrected contracts | Four required concepts retained with baseline-aware CI and stronger migration recovery wording. |
| `integration/deckchek-consolidation-20261118` | Canonical preserved consolidation | High | Continue through PR30 then qualify PR27 | `0acb612` native/JavaScript/browser CI passed; source `90ee44350ae5f88c8fc49d9cddcff86a5c570a84` contains additional reviewed changes and needs its own hosted gates. |
| `main` | Canonical public baseline | Medium | Preserve until the final integration satisfies its merge gates | Canonical main remained ee5aa511 at the refreshed API snapshot. |
| `nodata/practical-ptolemy-wu3ekp` | Historical PR26 consolidation and FS-34/35/36 ports | High | Supersede PR26 after PR27 merge | Exact tip is an ancestor of the final source; PR26 is the historical consolidation, replaced by PR27. |
| `nodata/zealous-mayer-g8x5b0` | SQLite/AUD-04 audit correction and GLib/GTK advisory plan | Medium | Preserve the verified AUDIT.md correction; supersede the obsolete GLib acceptance recommendation | PR28 has one docs commit. AUDIT-only extraction is retained as [c090c1d](https://github.com/djshellshoxxx/deckchek/commit/c090c1d615c03d6838948fdac74dca941e8d3981); archive verification confirms SQLite 3.54.1. The separate plan is not adopted. |
| `review/deckchek-lifecycle-20261118` | Published `2c9abbc` preserves concurrent integrity/profile repairs; source `3aa4d964` merges the accepted archive checkpoint and adds catalog, navigation, Windows-test, analog-provenance and Fleet work | High | PR29 merged at `fd39b145`; PR30 remains open draft at `2c9abbc`, targeting unchanged PR27. Review and publish the source/documentation child through an expected-head update | Source 35 passed 1,722/0/1 plus static gates. Applicable hosted successor gates remain open. Both parent histories, original failures and PR31 preservation remain intact. |
| `task/deckchek-fleet` | Experimental fleet placement, hours, maintenance, reminders | High | Keep through PR27 with Fleet OFF | Exact tip is an ancestor; PR13 was merged into PR12 source, not main. |
| `task/deckchek-spec-completion` | M7 storage and population foundations, fleet merge | High | Superseded by ancestry plus exact patches | Two nonancestor source commits have exact equivalents 2dfa9b0/f208d0f; remaining nonancestor merge joins fleet, already an ancestor. |
| `work/deckchek-audio-diagnostics-release` | Signal tools and platform build matrix | High | Already squash-merged; retain later workflow ownership | Exact cumulative diff equals main commit 9f74fc2; later differences preserve updated workflow ownership/dependencies. No missing original source patch. |
| `nodata/dazzling-meitner-m35twn` | Four additive Python bytecode ignore lines | Low | Retained by ancestry and reconciled without dropping existing worktree ignore rules | Exact one-commit branch `5bd6359ed5a013379dd1ca7aaee7cdd270931874` adds no executable behavior; no extra test suite is warranted. |
| `nodata/doc-sweep-20261118` | Five-file documentation sweep on older main, independently reviewed | Low | Accurate corrections retained in preceding documentation merge `5ffa10b`; retain PR31 until replacement reaches main | `61a7c6b74d75074cef5ec029e1c127184d869c86` is a parent of preceding documentation merge `5ffa10befa4d1dd9a98ee07ae2eeb31998333c01`, alongside `1943ef024bdc6abfe4ac32b4c368b764b75a0c86`. The current source preserves that ancestry. Accurate feature/default/platform corrections are retained; existing build instructions and source-scoped counts supersede stale hunks. Media-index CI and repeat-alignment wording are corrected against source. No executable change. |

## Complete pull request inventory

API states are from the same snapshot. “Merged” identifies the PR target, which may be a development branch rather than main.

| PR | State | Frozen head | Target branch |
|---|---|---|---|
| [#31](https://github.com/djshellshoxxx/deckchek/pull/31) | open draft | `61a7c6b74d75074cef5ec029e1c127184d869c86` | `main` |
| [#30](https://github.com/djshellshoxxx/deckchek/pull/30) | open draft | `2c9abbc2fbe7bc2108376d8c2d1c259180ffcb69` | `integration/deckchek-consolidation-20261118` |
| [#29](https://github.com/djshellshoxxx/deckchek/pull/29) | merged | `fd39b14586d9abddf93557b6c5f2628304f2caec` | `integration/deckchek-consolidation-20261118` |
| [#28](https://github.com/djshellshoxxx/deckchek/pull/28) | open draft | `57bd96609aeaf03e97cc79cf3ab1b19115e0da74` | `integration/deckchek-consolidation-20261118` |
| [#27](https://github.com/djshellshoxxx/deckchek/pull/27) | open | `0acb612aa796f7f459172932868ff7e787d83399` | `main` |
| [#26](https://github.com/djshellshoxxx/deckchek/pull/26) | open draft | `4466cc0bb9951a98528f576726e01dd9cecc388e` | `main` |
| [#25](https://github.com/djshellshoxxx/deckchek/pull/25) | merged | `beaf3f8141f8b0f2c2969d0e0dd1a084dc04ca42` | `continuation-deckchek-core-20261028` |
| [#24](https://github.com/djshellshoxxx/deckchek/pull/24) | merged | `a8918a3b9f8b428b0d65ae1255e79a1045faf799` | `continuation-deckchek-core-20261028` |
| [#23](https://github.com/djshellshoxxx/deckchek/pull/23) | merged | `171a827611750ba6a0fbf7098957ff6949283e3d` | `main` |
| [#22](https://github.com/djshellshoxxx/deckchek/pull/22) | merged | `84b687c8b0b5102420b2d3d82ced9aebcea05664` | `continuation-deckchek-core-20261028` |
| [#21](https://github.com/djshellshoxxx/deckchek/pull/21) | merged | `3ea13bdd1025247f546cffffe6c56914ad5f6c20` | `continuation-deckchek-core-20261028` |
| [#20](https://github.com/djshellshoxxx/deckchek/pull/20) | closed | `1694aa2b828679d15cee959b7aa974c40d995b4c` | `codex/correct-miditest-plan-20261030` |
| [#19](https://github.com/djshellshoxxx/deckchek/pull/19) | merged | `34347b6ef859861ecdd0b70d1b1f5e1a9ee817cb` | `continuation-deckchek-core-20261028` |
| [#18](https://github.com/djshellshoxxx/deckchek/pull/18) | merged | `819f38186b9ee8f5b846b2eec0a4c3381a6bf043` | `claude/tender-johnson-w8l6nn` |
| [#17](https://github.com/djshellshoxxx/deckchek/pull/17) | merged | `152028aac5f43b02ea87d1e30dfb07592f6a901f` | `main` |
| [#16](https://github.com/djshellshoxxx/deckchek/pull/16) | open draft | `e30e018f068c086c1337df9ef211aff18f36a07b` | `claude/confident-goldberg-o06vg2` |
| [#15](https://github.com/djshellshoxxx/deckchek/pull/15) | merged | `551757fad1ce4fa8318e996531e644de22927b19` | `main` |
| [#14](https://github.com/djshellshoxxx/deckchek/pull/14) | open draft | `9f4928a00a44b62529429d1f14ad104b65db28c6` | `main` |
| [#13](https://github.com/djshellshoxxx/deckchek/pull/13) | merged | `f0feebeb657e76bc758f8e5328573abe36f11670` | `task/deckchek-spec-completion` |
| [#12](https://github.com/djshellshoxxx/deckchek/pull/12) | open | `1ca22bef3f9571e7486054712028bf9c6d776552` | `main` |
| [#11](https://github.com/djshellshoxxx/deckchek/pull/11) | merged | `34b809f771e2fb4ce903d5608788779e124a1ed7` | `main` |
| [#10](https://github.com/djshellshoxxx/deckchek/pull/10) | open draft | `4cfa38cf127881f07a7ab9e408f2fb701c4ff984` | `main` |
| [#9](https://github.com/djshellshoxxx/deckchek/pull/9) | open draft | `a4d844b22df478a141c06a6561c941d6461a8aea` | `main` |
| [#2](https://github.com/djshellshoxxx/deckchek/pull/2) | merged | `46b86ebbbd34738f2e5d0db66d39517e3dcbe688` | `main` |
| [#1](https://github.com/djshellshoxxx/deckchek/pull/1) | merged | `3440a631e33eee832e73ae41d142d2d4af49e2fb` | `main` |

At **15:33:18.863 UTC**, PR30 and the owned branch agree on `2c9abbc`; PR30 is open draft with **mergeable: true / unstable**, zero submitted reviews and zero inline review threads. Verified synthetic merge `b13cceaab76132b0a40e4ed28c5018b447cae383` has parents `0acb612` and `2c9abbc` and the same tree as that predecessor. The older disagreement remains timestamped history with no cause inferred. The [current report](DECKCHEK-CONTINUATION-35.md#predecessor-hosted-outcomes) records source-scoped job outcomes; none qualifies unpublished `3aa4d964`.

## Exact patch and squash equivalence

The retained original audit recomputed all five rows using both **exact diff-text equality** and `git patch-id --stable`. Every retained commit is an ancestor of the frozen source; both squash replacements are also main ancestors. The archive/main comparison and branch source are preserved even where later repairs change the current file contents.

| Original commit or cumulative branch diff | Retained commit | Stable patch ID |
| --- | --- | --- |
| [a16838af49db28c7629a62b5ff9812587057f153](https://github.com/djshellshoxxx/deckchek/commit/a16838af49db28c7629a62b5ff9812587057f153) | [2dfa9b089e3fec8d96e438f7dbf14a269a8a2e52](https://github.com/djshellshoxxx/deckchek/commit/2dfa9b089e3fec8d96e438f7dbf14a269a8a2e52) | `476a2e5bc65165f915c5f3a29f89e81f0772a5d9` |
| [2a8e528f0d6e669ba57ab892a9aae0b0eeee6f24](https://github.com/djshellshoxxx/deckchek/commit/2a8e528f0d6e669ba57ab892a9aae0b0eeee6f24) | [f208d0f2cf9140aa44fa2d191dd451183c0b43cd](https://github.com/djshellshoxxx/deckchek/commit/f208d0f2cf9140aa44fa2d191dd451183c0b43cd) | `9e065144b858d0558b4f486cde4ba768b8849a4d` |
| [9f97546c203329a1b53550fce295529fd845a4f9](https://github.com/djshellshoxxx/deckchek/commit/9f97546c203329a1b53550fce295529fd845a4f9) | [2f1c497d194a037eead8952cbff5fa772f9190cd](https://github.com/djshellshoxxx/deckchek/commit/2f1c497d194a037eead8952cbff5fa772f9190cd) | `534d8c8cdbe3483afd7ec403ebc746ae2de036c8` |
| `feat/hardware-profile-catalog-20261020` at [46b86ebbbd34738f2e5d0db66d39517e3dcbe688](https://github.com/djshellshoxxx/deckchek/commit/46b86ebbbd34738f2e5d0db66d39517e3dcbe688), since [fa71931dfb444c096f964f4a927decd51506851c](https://github.com/djshellshoxxx/deckchek/commit/fa71931dfb444c096f964f4a927decd51506851c) | [0962d654c9b9de36c527962a5257a8ff0efa8544](https://github.com/djshellshoxxx/deckchek/commit/0962d654c9b9de36c527962a5257a8ff0efa8544) | `a81c51fff6e7ec891979709bf2f23804c1d13cab` |
| `work/deckchek-audio-diagnostics-release` at [34b809f771e2fb4ce903d5608788779e124a1ed7](https://github.com/djshellshoxxx/deckchek/commit/34b809f771e2fb4ce903d5608788779e124a1ed7), since [81c871bb3069d641cac8bea594cb393daa04a297](https://github.com/djshellshoxxx/deckchek/commit/81c871bb3069d641cac8bea594cb393daa04a297) | [9f74fc2ee7952378bf17698bb6d648a8a2fbbb86](https://github.com/djshellshoxxx/deckchek/commit/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86) | `de8480d9d6f2484a70d2dcd1d99ee8087579e68f` |

`git cherry` alone can label an equivalent patch as new when the retained equivalent lies outside its common-ancestry traversal. Direct diff comparison and explicit ancestry checks resolve that ambiguity for PR12 and the MIDI checkpoint. Patch equality establishes preserved content; it does not establish current runtime acceptance.

### Seven divergent historical branches

1. **MIDI checkpoint.** Its three source fixes have exact equivalents in the table above. [docs/testing/results/continuation-2026-10-25-midi.md](https://github.com/djshellshoxxx/deckchek/blob/5960099ed4094172025dad9129dc38b148dabedf/docs/testing/results/continuation-2026-10-25-midi.md) is byte-identical to the checkpoint evidence after removing the candidate's two-line provenance header. The older checkpoint/handoff prose is historical evidence, not a source omission.
2. **PR9 automatic device tests.** All 29 originally changed paths exist in the corrected candidate. Later PR21/22 work and commits `131fa7d`, `61d4245`, and `ec9b4ad` retain the device plans, audio-quality analyzer/session/runner, MIDI-conformance and GM UI, dispatch/validation, tests and specs. The paths are intentionally not byte-identical: subsequent work repairs capture-quality/calibration provenance, finite evidence, timing, transport-loss reporting and owned cleanup. Reimporting PR9 would risk undoing those repairs. Relevant current tests include [tests/device-test-plan.test.mjs](https://github.com/djshellshoxxx/deckchek/blob/5960099ed4094172025dad9129dc38b148dabedf/tests/device-test-plan.test.mjs), [tests/audio-quality.test.mjs](https://github.com/djshellshoxxx/deckchek/blob/5960099ed4094172025dad9129dc38b148dabedf/tests/audio-quality.test.mjs) and the MIDI/UI regression suites.
3. **PR10 README/wiki.** PR19's [34347b6](https://github.com/djshellshoxxx/deckchek/commit/34347b6ef859861ecdd0b70d1b1f5e1a9ee817cb) reconciliation is a candidate ancestor. All five wiki documents retain the original useful concepts with corrected current architecture, code maps, dated test evidence and navigation. Obsolete README claims are superseded. No independent source merge is needed.
4. **PR2 hardware catalog.** The complete original branch diff equals main squash [0962d65](https://github.com/djshellshoxxx/deckchek/commit/0962d654c9b9de36c527962a5257a8ff0efa8544). The original audit recorded 39 of its 43 paths byte-identical; that count predates subsequent model research and is not a current file-equality claim. Later changes include researched capabilities, device-index/test/release corrections and removal of the unverifiable DDJ-S8 profile. Preserve the corrected catalogue; do not restore unsupported capability claims.
5. **Closed PR20.** The source of [#20](https://github.com/djshellshoxxx/deckchek/pull/20) is closed without merge, but its four requirements survive in [docs/superpowers/plans/2026-10-30-miditest-integration.md](https://github.com/djshellshoxxx/deckchek/blob/5960099ed4094172025dad9129dc38b148dabedf/docs/superpowers/plans/2026-10-30-miditest-integration.md): the agentic-worker header, migration preservation, recovery/rollback, and Windows Rust gates with preserved evidence. The retained plan uses corrected baseline-aware CI and expanded contracts. The old patch is not a missing implementation.
6. **PR12 spec completion.** Its two nonancestor source patches are exactly retained as `2dfa9b0` and `f208d0f`. The remaining nonancestor merge brings in Fleet, whose tip is already a candidate ancestor. PR13 merged into PR12's branch, not main; the full chain is retained. Fleet remains default **OFF**.
7. **PR11 audio diagnostics.** Its entire cumulative patch equals main squash [9f74fc2](https://github.com/djshellshoxxx/deckchek/commit/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86). Current differences are later ownership/dependency corrections. The only originally changed path absent at the candidate is `.github/workflows/windows-build.yml`, intentionally replaced by [.github/workflows/cross-platform-release-validation.yml](https://github.com/djshellshoxxx/deckchek/blob/5960099ed4094172025dad9129dc38b148dabedf/.github/workflows/cross-platform-release-validation.yml) and [.github/workflows/nightly.yml](https://github.com/djshellshoxxx/deckchek/blob/5960099ed4094172025dad9129dc38b148dabedf/.github/workflows/nightly.yml). Current CI must qualify that replacement; a retired workflow file is not an uncovered audio-source contribution.


## Current disposition and closure sequence

Keep PR30 and PR27 subject to current-source gates and required repository approvals. Merge into main only when applicable gates pass. Close superseded PRs, including the selectively reconciled PR31, only after their contribution-preserving replacement reaches main, with explicit replacement evidence. No historical PR was closed as superseded, no branch deleted, and no remote history rewritten. The ignore-only branch is retained through the 1943ef0 source merge. PR31 had two documentation conflicts against those accepted histories; its reviewed corrections were reconciled in preceding documentation merge `5ffa10befa4d1dd9a98ee07ae2eeb31998333c01`, with its exact head retained as a parent there.

Historical source-by-source audit records remain in [0985e9e](https://github.com/djshellshoxxx/deckchek/blob/0985e9e64b6dd5e92e2f046ebf30a336bf15c735/docs/DECKCHEK-BRANCH-AUDIT.md) and [0acb612](https://github.com/djshellshoxxx/deckchek/blob/0acb612aa796f7f459172932868ff7e787d83399/docs/DECKCHEK-BRANCH-AUDIT.md). Reproduce the current counts with `git rev-list --left-right --count <branch>...3aa4d964bc4091a2c16aac042a9bce9b2f8aeec5` and compare merge-base changes; commit divergence alone is not missing functionality.
