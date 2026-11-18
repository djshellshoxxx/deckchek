# Branch consolidation — 2026-11-18

Consolidation branch: `nodata/practical-ptolemy-wu3ekp`, draft PR #26 into `main`.
It fast-forwards `continuation-deckchek-core-20261028` (`e30e018`, which already contained
`main` at `ee5aa51`) and adds the CI fix and the remaining PR9 work. Every remote branch was
checked by ancestry, by `git cherry` patch equivalence and, where those disagree because of
squash merges or re-applied patches, by comparing file content. No branch was deleted,
reset or force-pushed.

## Result per branch

| Branch | Tip | PR | Disposition | Evidence |
|---|---|---|---|---|
| `continuation-deckchek-core-20261028` | `e30e018` | #16 (draft → #14) | Contained: this branch is a fast-forward of it | ancestor |
| `claude/confident-goldberg-o06vg2` | `9f4928a` | #14 (draft → main) | Contained | ancestor |
| `claude/bold-hawking-jmyq4o` | `beaf3f8` | #25 merged into continuation | Contained | ancestor |
| `codex/monitor-snr-20261031` | `3b5f464` | — | Contained | ancestor |
| `codex/post-consolidation-20261030` | `a8918a3` | #24 merged | Contained | ancestor |
| `codex/fs36-stream-cleanup-20261030` | `84b687c` | #22 merged | Contained | ancestor |
| `codex/fs36-midi-core-20261030` | `3ea13bd` | #21 merged | Contained | ancestor |
| `codex/reconcile-wiki-20261030` | `34347b6` | #19 merged | Contained | ancestor |
| `task/deckchek-fleet` | `f0feebe` | #13 merged into PR12 branch | Contained | ancestor |
| `task/deckchek-spec-completion` | `1ca22be` | #12 (open → main) | Contained in content | its only non-ancestor commits `a16838a`/`2a8e528` touch the same files with the same diffs as `2dfa9b0`/`f208d0f`, which are ancestors |
| `claude/docs-screenshots` | `551757f` | #15 merged | In main | ancestor of main |
| `claude/epic-thompson-tvwx9n` | `3440a63` | #1 merged | In main | ancestor of main |
| `claude/tender-johnson-w8l6nn` | `152028a` | #17 merged | In main | ancestor of main |
| `codex/correct-miditest-plan-20261030` | `819f381` | #18 merged | In main | ancestor of main |
| `codex/miditest-contracts-20261030` | `171a827` | #23 merged | In main | ancestor of main |
| `work/deckchek-audio-diagnostics-release` | `34b809f` | #11 squash-merged | Superseded | only `README.md` still differs, and main rewrote it after the squash (`551757f`, PR15) |
| `feat/hardware-profile-catalog-20261020` | `46b86eb` | #2 squash-merged | Superseded | the 4 files still differing were all changed on main after the PR2 merge (`3d7e055`/`81c871b` DDJ-S8 removal, `4a0408d` and `9f74fc2` release workflow and acceptance doc) |
| `fix/remediation-678de3d8-904afa` | `1694aa2` | #20 closed unmerged | Superseded | all four findings (agentic-workers header, migration compatibility/rollback, Windows gates, Windows artifact) are present in main's `docs/superpowers/plans/2026-10-30-miditest-integration.md` |
| `docs/readme-and-wiki` | `4cfa38c` | #10 (draft) | Contained | wiki ported and refreshed by PR19 (`docs/wiki/*`); its README lines were deliberately superseded by the current README |
| `checkpoint/deckchek-midi-boundaries-20261025` | `7d44aae` | — | Contained after this branch | source fix `9f97546` is patch-equivalent here; the unique evidence doc is ported to `docs/testing/results/continuation-2026-10-25-midi.md`; its `CHECKPOINT.md` is superseded by later checkpoints |
| `claude/amazing-fermat-csql4g` | `a4d844b` | #9 (draft) | Contained after this branch | FS-36 engine came via PR21/22; FS-34, FS-35 and the FS-36 panels are ported here with repairs; its workflow coverage step is replaced by `tests/device-test-plan.test.mjs` (same check inside `npm test`); its DDJ-S8 smoke/test repairs were already on main |

## What this branch adds on top of the continuation

1. `build(deps)`: removes the never-registered `tauri-plugin-notification`. The continuation
   head was red: run 43982983441's `rust-tests` passed 654 tests, then the compiler-warning
   gate failed on cargo's new `unused_dependencies` lint.
2. PR9 remainder: FS-34 device test completeness, FS-35 output audio quality, FS-36
   conformance and General MIDI panels, each with ownership/cancellation regressions.
3. This report, the ported 2026-10-25 evidence doc and refreshed status docs.

## After PR #26 merges

All 21 other remote branches then hold no unique content. They are listed above with their
tips, so any of them can be recreated from these SHAs. Deleting remote branches and closing
the superseded PRs (#9, #10, #12, #14, #16) needs explicit owner approval and was not done.
