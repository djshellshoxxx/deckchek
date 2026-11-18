# DeckChek branch and pull request audit

## Decision and scope

Audit snapshot: 2026-11-18 UTC. Canonical `main`: [ee5aa51](https://github.com/djshellshoxxx/deckchek/commit/ee5aa511fb49fc56e299d5b5c262e815ab420d0d) (`ee5aa511fb49fc56e299d5b5c262e815ab420d0d`). Consolidation candidate: [#26](https://github.com/djshellshoxxx/deckchek/pull/26), [4466cc0](https://github.com/djshellshoxxx/deckchek/commit/4466cc0bb9951a98528f576726e01dd9cecc388e) (`4466cc0bb9951a98528f576726e01dd9cecc388e`). This report freezes those refs; later integration commits and live GitHub status require separate verification.

Keep the consolidated candidate as the integration base. Its ancestry contains the active development stack; all seven divergent branches have identifiable equivalents, corrected ports, or superseded documentation. Do not merge the older branches independently. Historical coverage does not establish functional acceptance: PR9-derived FS35/FS36 defects were found during the parent review, so the port requires corrections and regression evidence before merging.

At the snapshot, PR26 was open and draft, with GitHub reporting clean mergeability; it was 261 commits ahead of main and zero behind, changing 328 paths. Clean mergeability only describes the merge graph. No merge, release, deployment, branch deletion, or remote mutation was performed by this audit.

## Continuation after the frozen audit

The integration engineer subsequently created [PR #27](https://github.com/djshellshoxxx/deckchek/pull/27), targeting `main` from `integration/deckchek-consolidation-20261118`. A refreshed inventory contained **24 branches**, including that new branch; canonical `main` remained `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`. The 23-row inventory below deliberately preserves the original comparison snapshot. Corrective commits, current checks and the merge decision belong in [DECKCHEK-CONTINUATION-HANDOFF.md](DECKCHEK-CONTINUATION-HANDOFF.md). No historical branch was deleted and no superseded PR was closed.

## Branch inventory

The 23 live remote branch tips below were inventoried through the native GitHub connector and verified against the complete local Git graph. Ahead/behind counts are commit counts. Changed paths are measured from each branch's merge base with main using native Git; they are not truncated to the GitHub compare API's 300-file limit. The path count links to the exact comparison. “Nonancestor” counts nonmerge commits absent by ancestry from PR26; it does not claim unique content.

| Branch | Head | Main merge base | Ahead / behind main | Ahead / behind PR26 | Changed paths | Nonancestor commits | Related PR | Disposition |
|---|---|---|---:|---:|---:|---:|---|---|
| `checkpoint/deckchek-midi-boundaries-20261025` | [7d44aae](https://github.com/djshellshoxxx/deckchek/commit/7d44aae2f56db8316c61c0f6cf1adaf75dcad988) | [9f74fc2](https://github.com/djshellshoxxx/deckchek/commit/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86) | 11 / 11 | 5 / 266 | [28](https://github.com/djshellshoxxx/deckchek/compare/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86...7d44aae2f56db8316c61c0f6cf1adaf75dcad988) | 5 | — | Equivalent source fixes; historical evidence retained; checkpoint superseded. |
| `claude/amazing-fermat-csql4g` | [a4d844b](https://github.com/djshellshoxxx/deckchek/commit/a4d844b22df478a141c06a6561c941d6461a8aea) | [81c871b](https://github.com/djshellshoxxx/deckchek/commit/81c871bb3069d641cac8bea594cb393daa04a297) | 1 / 12 | 1 / 273 | [29](https://github.com/djshellshoxxx/deckchek/compare/81c871bb3069d641cac8bea594cb393daa04a297...a4d844b22df478a141c06a6561c941d6461a8aea) | 1 | [#9](https://github.com/djshellshoxxx/deckchek/pull/9) | PR9 port exists; acceptance pending corrective regressions and review. |
| `claude/bold-hawking-jmyq4o` | [beaf3f8](https://github.com/djshellshoxxx/deckchek/commit/beaf3f8141f8b0f2c2969d0e0dd1a084dc04ca42) | [ee5aa51](https://github.com/djshellshoxxx/deckchek/commit/ee5aa511fb49fc56e299d5b5c262e815ab420d0d) | 255 / 0 | 0 / 6 | [308](https://github.com/djshellshoxxx/deckchek/compare/ee5aa511fb49fc56e299d5b5c262e815ab420d0d...beaf3f8141f8b0f2c2969d0e0dd1a084dc04ca42) | 0 | [#25](https://github.com/djshellshoxxx/deckchek/pull/25) | Tip contained in PR26; preserve through consolidation. |
| `claude/confident-goldberg-o06vg2` | [9f4928a](https://github.com/djshellshoxxx/deckchek/commit/9f4928a00a44b62529429d1f14ad104b65db28c6) | [9f74fc2](https://github.com/djshellshoxxx/deckchek/commit/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86) | 223 / 11 | 0 / 49 | [271](https://github.com/djshellshoxxx/deckchek/compare/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86...9f4928a00a44b62529429d1f14ad104b65db28c6) | 0 | [#14](https://github.com/djshellshoxxx/deckchek/pull/14) | Tip contained in PR26; preserve through consolidation. |
| `claude/docs-screenshots` | [551757f](https://github.com/djshellshoxxx/deckchek/commit/551757fad1ce4fa8318e996531e644de22927b19) | [551757f](https://github.com/djshellshoxxx/deckchek/commit/551757fad1ce4fa8318e996531e644de22927b19) | 0 / 10 | 0 / 271 | [0](https://github.com/djshellshoxxx/deckchek/compare/551757fad1ce4fa8318e996531e644de22927b19...551757fad1ce4fa8318e996531e644de22927b19) | 0 | [#15](https://github.com/djshellshoxxx/deckchek/pull/15) | Already contained in main and PR26. |
| `claude/epic-thompson-tvwx9n` | [3440a63](https://github.com/djshellshoxxx/deckchek/commit/3440a631e33eee832e73ae41d142d2d4af49e2fb) | [3440a63](https://github.com/djshellshoxxx/deckchek/commit/3440a631e33eee832e73ae41d142d2d4af49e2fb) | 0 / 20 | 0 / 281 | [0](https://github.com/djshellshoxxx/deckchek/compare/3440a631e33eee832e73ae41d142d2d4af49e2fb...3440a631e33eee832e73ae41d142d2d4af49e2fb) | 0 | [#1](https://github.com/djshellshoxxx/deckchek/pull/1) | Already contained in main and PR26. |
| `claude/tender-johnson-w8l6nn` | [152028a](https://github.com/djshellshoxxx/deckchek/commit/152028aac5f43b02ea87d1e30dfb07592f6a901f) | [152028a](https://github.com/djshellshoxxx/deckchek/commit/152028aac5f43b02ea87d1e30dfb07592f6a901f) | 0 / 5 | 0 / 266 | [0](https://github.com/djshellshoxxx/deckchek/compare/152028aac5f43b02ea87d1e30dfb07592f6a901f...152028aac5f43b02ea87d1e30dfb07592f6a901f) | 0 | [#17](https://github.com/djshellshoxxx/deckchek/pull/17) | Already contained in main and PR26. |
| `codex/correct-miditest-plan-20261030` | [819f381](https://github.com/djshellshoxxx/deckchek/commit/819f38186b9ee8f5b846b2eec0a4c3381a6bf043) | [819f381](https://github.com/djshellshoxxx/deckchek/commit/819f38186b9ee8f5b846b2eec0a4c3381a6bf043) | 0 / 6 | 0 / 267 | [0](https://github.com/djshellshoxxx/deckchek/compare/819f38186b9ee8f5b846b2eec0a4c3381a6bf043...819f38186b9ee8f5b846b2eec0a4c3381a6bf043) | 0 | [#18](https://github.com/djshellshoxxx/deckchek/pull/18) | Already contained in main and PR26. |
| `codex/fs36-midi-core-20261030` | [3ea13bd](https://github.com/djshellshoxxx/deckchek/commit/3ea13bdd1025247f546cffffe6c56914ad5f6c20) | [f3fbf1c](https://github.com/djshellshoxxx/deckchek/commit/f3fbf1cc0ba2047e6e1929f3c6622f55a76865f1) | 244 / 9 | 0 / 26 | [304](https://github.com/djshellshoxxx/deckchek/compare/f3fbf1cc0ba2047e6e1929f3c6622f55a76865f1...3ea13bdd1025247f546cffffe6c56914ad5f6c20) | 0 | [#21](https://github.com/djshellshoxxx/deckchek/pull/21) | Tip contained in PR26; preserve through consolidation. |
| `codex/fs36-stream-cleanup-20261030` | [84b687c](https://github.com/djshellshoxxx/deckchek/commit/84b687c8b0b5102420b2d3d82ced9aebcea05664) | [f3fbf1c](https://github.com/djshellshoxxx/deckchek/commit/f3fbf1cc0ba2047e6e1929f3c6622f55a76865f1) | 248 / 9 | 0 / 22 | [304](https://github.com/djshellshoxxx/deckchek/compare/f3fbf1cc0ba2047e6e1929f3c6622f55a76865f1...84b687c8b0b5102420b2d3d82ced9aebcea05664) | 0 | [#22](https://github.com/djshellshoxxx/deckchek/pull/22) | Tip contained in PR26; preserve through consolidation. |
| `codex/miditest-contracts-20261030` | [171a827](https://github.com/djshellshoxxx/deckchek/commit/171a827611750ba6a0fbf7098957ff6949283e3d) | [171a827](https://github.com/djshellshoxxx/deckchek/commit/171a827611750ba6a0fbf7098957ff6949283e3d) | 0 / 1 | 0 / 262 | [0](https://github.com/djshellshoxxx/deckchek/compare/171a827611750ba6a0fbf7098957ff6949283e3d...171a827611750ba6a0fbf7098957ff6949283e3d) | 0 | [#23](https://github.com/djshellshoxxx/deckchek/pull/23) | Already contained in main and PR26. |
| `codex/monitor-snr-20261031` | [3b5f464](https://github.com/djshellshoxxx/deckchek/commit/3b5f46441769f5b15bbf7d07e6ac4378801ce6ad) | [ee5aa51](https://github.com/djshellshoxxx/deckchek/commit/ee5aa511fb49fc56e299d5b5c262e815ab420d0d) | 254 / 0 | 0 / 7 | [308](https://github.com/djshellshoxxx/deckchek/compare/ee5aa511fb49fc56e299d5b5c262e815ab420d0d...3b5f46441769f5b15bbf7d07e6ac4378801ce6ad) | 0 | — | Tip contained in PR26; preserve through consolidation. |
| `codex/post-consolidation-20261030` | [a8918a3](https://github.com/djshellshoxxx/deckchek/commit/a8918a3b9f8b428b0d65ae1255e79a1045faf799) | [ee5aa51](https://github.com/djshellshoxxx/deckchek/commit/ee5aa511fb49fc56e299d5b5c262e815ab420d0d) | 250 / 0 | 0 / 11 | [305](https://github.com/djshellshoxxx/deckchek/compare/ee5aa511fb49fc56e299d5b5c262e815ab420d0d...a8918a3b9f8b428b0d65ae1255e79a1045faf799) | 0 | [#24](https://github.com/djshellshoxxx/deckchek/pull/24) | Tip contained in PR26; preserve through consolidation. |
| `codex/reconcile-wiki-20261030` | [34347b6](https://github.com/djshellshoxxx/deckchek/commit/34347b6ef859861ecdd0b70d1b1f5e1a9ee817cb) | [f3fbf1c](https://github.com/djshellshoxxx/deckchek/commit/f3fbf1cc0ba2047e6e1929f3c6622f55a76865f1) | 242 / 9 | 0 / 28 | [301](https://github.com/djshellshoxxx/deckchek/compare/f3fbf1cc0ba2047e6e1929f3c6622f55a76865f1...34347b6ef859861ecdd0b70d1b1f5e1a9ee817cb) | 0 | [#19](https://github.com/djshellshoxxx/deckchek/pull/19) | Tip contained in PR26; preserve through consolidation. |
| `continuation-deckchek-core-20261028` | [e30e018](https://github.com/djshellshoxxx/deckchek/commit/e30e018f068c086c1337df9ef211aff18f36a07b) | [ee5aa51](https://github.com/djshellshoxxx/deckchek/commit/ee5aa511fb49fc56e299d5b5c262e815ab420d0d) | 256 / 0 | 0 / 5 | [308](https://github.com/djshellshoxxx/deckchek/compare/ee5aa511fb49fc56e299d5b5c262e815ab420d0d...e30e018f068c086c1337df9ef211aff18f36a07b) | 0 | [#16](https://github.com/djshellshoxxx/deckchek/pull/16) | Tip contained in PR26; preserve through consolidation. |
| `docs/readme-and-wiki` | [4cfa38c](https://github.com/djshellshoxxx/deckchek/commit/4cfa38cf127881f07a7ab9e408f2fb701c4ff984) | [81c871b](https://github.com/djshellshoxxx/deckchek/commit/81c871bb3069d641cac8bea594cb393daa04a297) | 1 / 12 | 1 / 273 | [6](https://github.com/djshellshoxxx/deckchek/compare/81c871bb3069d641cac8bea594cb393daa04a297...4cfa38cf127881f07a7ab9e408f2fb701c4ff984) | 1 | [#10](https://github.com/djshellshoxxx/deckchek/pull/10) | Documentation reconciled by PR19 and subsequent status updates. |
| `feat/hardware-profile-catalog-20261020` | [46b86eb](https://github.com/djshellshoxxx/deckchek/commit/46b86ebbbd34738f2e5d0db66d39517e3dcbe688) | [fa71931](https://github.com/djshellshoxxx/deckchek/commit/fa71931dfb444c096f964f4a927decd51506851c) | 94 / 35 | 94 / 296 | [43](https://github.com/djshellshoxxx/deckchek/compare/fa71931dfb444c096f964f4a927decd51506851c...46b86ebbbd34738f2e5d0db66d39517e3dcbe688) | 94 | [#2](https://github.com/djshellshoxxx/deckchek/pull/2) | PR2 squash in main; later catalog corrections retained. |
| `fix/remediation-678de3d8-904afa` | [1694aa2](https://github.com/djshellshoxxx/deckchek/commit/1694aa2b828679d15cee959b7aa974c40d995b4c) | [2c6c265](https://github.com/djshellshoxxx/deckchek/commit/2c6c265c995694259596351a23726e4c7748082f) | 1 / 7 | 1 / 268 | [1](https://github.com/djshellshoxxx/deckchek/compare/2c6c265c995694259596351a23726e4c7748082f...1694aa2b828679d15cee959b7aa974c40d995b4c) | 1 | [#20](https://github.com/djshellshoxxx/deckchek/pull/20) | PR20 closed; requirements retained in corrected MIDItest plan. |
| `main` | [ee5aa51](https://github.com/djshellshoxxx/deckchek/commit/ee5aa511fb49fc56e299d5b5c262e815ab420d0d) | [ee5aa51](https://github.com/djshellshoxxx/deckchek/commit/ee5aa511fb49fc56e299d5b5c262e815ab420d0d) | 0 / 0 | 0 / 261 | [0](https://github.com/djshellshoxxx/deckchek/compare/ee5aa511fb49fc56e299d5b5c262e815ab420d0d...ee5aa511fb49fc56e299d5b5c262e815ab420d0d) | 0 | — | Canonical baseline. |
| `nodata/practical-ptolemy-wu3ekp` | [4466cc0](https://github.com/djshellshoxxx/deckchek/commit/4466cc0bb9951a98528f576726e01dd9cecc388e) | [ee5aa51](https://github.com/djshellshoxxx/deckchek/commit/ee5aa511fb49fc56e299d5b5c262e815ab420d0d) | 261 / 0 | 0 / 0 | [328](https://github.com/djshellshoxxx/deckchek/compare/ee5aa511fb49fc56e299d5b5c262e815ab420d0d...4466cc0bb9951a98528f576726e01dd9cecc388e) | 0 | [#26](https://github.com/djshellshoxxx/deckchek/pull/26) | Consolidation candidate; corrections and acceptance gates pending. |
| `task/deckchek-fleet` | [f0feebe](https://github.com/djshellshoxxx/deckchek/commit/f0feebeb657e76bc758f8e5328573abe36f11670) | [9f74fc2](https://github.com/djshellshoxxx/deckchek/commit/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86) | 13 / 11 | 0 / 259 | [53](https://github.com/djshellshoxxx/deckchek/compare/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86...f0feebeb657e76bc758f8e5328573abe36f11670) | 0 | [#13](https://github.com/djshellshoxxx/deckchek/pull/13) | Tip contained in PR26; preserve through consolidation. |
| `task/deckchek-spec-completion` | [1ca22be](https://github.com/djshellshoxxx/deckchek/commit/1ca22bef3f9571e7486054712028bf9c6d776552) | [9f74fc2](https://github.com/djshellshoxxx/deckchek/commit/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86) | 16 / 11 | 3 / 259 | [53](https://github.com/djshellshoxxx/deckchek/compare/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86...1ca22bef3f9571e7486054712028bf9c6d776552) | 2 | [#12](https://github.com/djshellshoxxx/deckchek/pull/12) | Two source patches equivalent; fleet merge already contained. |
| `work/deckchek-audio-diagnostics-release` | [34b809f](https://github.com/djshellshoxxx/deckchek/commit/34b809f771e2fb4ce903d5608788779e124a1ed7) | [81c871b](https://github.com/djshellshoxxx/deckchek/commit/81c871bb3069d641cac8bea594cb393daa04a297) | 26 / 12 | 26 / 273 | [20](https://github.com/djshellshoxxx/deckchek/compare/81c871bb3069d641cac8bea594cb393daa04a297...34b809f771e2fb4ce903d5608788779e124a1ed7) | 26 | [#11](https://github.com/djshellshoxxx/deckchek/pull/11) | PR11 squash in main; README subsequently refreshed. |

## Pull request inventory

The snapshot contains 20 pull requests: six open (five draft), 13 merged, and one closed without merge. PR head SHAs below are frozen links; base names describe the target recorded by GitHub.

| PR | State | Head | Base | Title |
|---|---|---|---|---|
| [#1](https://github.com/djshellshoxxx/deckchek/pull/1) | merged | [3440a63](https://github.com/djshellshoxxx/deckchek/commit/3440a631e33eee832e73ae41d142d2d4af49e2fb) | `main` | Complete M7/M8 features, audit and Windows build |
| [#2](https://github.com/djshellshoxxx/deckchek/pull/2) | merged | [46b86eb](https://github.com/djshellshoxxx/deckchek/commit/46b86ebbbd34738f2e5d0db66d39517e3dcbe688) | `main` | Research and expand 37 DJ controller, mixer and MIDI hardware diagnostic profiles |
| [#9](https://github.com/djshellshoxxx/deckchek/pull/9) | draft / open | [a4d844b](https://github.com/djshellshoxxx/deckchek/commit/a4d844b22df478a141c06a6561c941d6461a8aea) | `main` | Make every device fully testable; add audio-quality and General MIDI tests (FS-34/35/36) |
| [#10](https://github.com/djshellshoxxx/deckchek/pull/10) | draft / open | [4cfa38c](https://github.com/djshellshoxxx/deckchek/commit/4cfa38cf127881f07a7ab9e408f2fb701c4ff984) | `main` | Record test status honestly; add wiki pages |
| [#11](https://github.com/djshellshoxxx/deckchek/pull/11) | merged | [34b809f](https://github.com/djshellshoxxx/deckchek/commit/34b809f771e2fb4ce903d5608788779e124a1ed7) | `main` | Add audio test signals and cross-platform release matrix |
| [#12](https://github.com/djshellshoxxx/deckchek/pull/12) | open | [1ca22be](https://github.com/djshellshoxxx/deckchek/commit/1ca22bef3f9571e7486054712028bf9c6d776552) | `main` | Add M7 storage schemas and validated offline population foundations |
| [#13](https://github.com/djshellshoxxx/deckchek/pull/13) | merged | [f0feebe](https://github.com/djshellshoxxx/deckchek/commit/f0feebeb657e76bc758f8e5328573abe36f11670) | `task/deckchek-spec-completion` | Add experimental fleet placement and maintenance workflows |
| [#14](https://github.com/djshellshoxxx/deckchek/pull/14) | draft / open | [9f4928a](https://github.com/djshellshoxxx/deckchek/commit/9f4928a00a44b62529429d1f14ad104b65db28c6) | `main` | Complete M7/M8 specs, audit, fuzz/stress/QA and first-party CI (WIP) |
| [#15](https://github.com/djshellshoxxx/deckchek/pull/15) | merged | [551757f](https://github.com/djshellshoxxx/deckchek/commit/551757fad1ce4fa8318e996531e644de22927b19) | `main` | Docs: screenshots and README refresh |
| [#16](https://github.com/djshellshoxxx/deckchek/pull/16) | draft / open | [e30e018](https://github.com/djshellshoxxx/deckchek/commit/e30e018f068c086c1337df9ef211aff18f36a07b) | `claude/confident-goldberg-o06vg2` | Fix core diagnostic evidence, imported results and restore ownership |
| [#17](https://github.com/djshellshoxxx/deckchek/pull/17) | merged | [152028a](https://github.com/djshellshoxxx/deckchek/commit/152028aac5f43b02ea87d1e30dfb07592f6a901f) | `main` | Document conditional MIDItest integration with validated schema and CI plan |
| [#18](https://github.com/djshellshoxxx/deckchek/pull/18) | merged | [819f381](https://github.com/djshellshoxxx/deckchek/commit/819f38186b9ee8f5b846b2eec0a4c3381a6bf043) | `claude/tender-johnson-w8l6nn` | Correct MIDItest proposal schema, CI and unresolved decisions |
| [#19](https://github.com/djshellshoxxx/deckchek/pull/19) | merged | [34347b6](https://github.com/djshellshoxxx/deckchek/commit/34347b6ef859861ecdd0b70d1b1f5e1a9ee817cb) | `continuation-deckchek-core-20261028` | Reconcile PR10 wiki and record current consolidation blockers |
| [#20](https://github.com/djshellshoxxx/deckchek/pull/20) | closed | [1694aa2](https://github.com/djshellshoxxx/deckchek/commit/1694aa2b828679d15cee959b7aa974c40d995b4c) | `codex/correct-miditest-plan-20261030` | Fix: [for cherry-picking] Updated the MIDItest plan with explicit migra |
| [#21](https://github.com/djshellshoxxx/deckchek/pull/21) | merged | [3ea13bd](https://github.com/djshellshoxxx/deckchek/commit/3ea13bdd1025247f546cffffe6c56914ad5f6c20) | `continuation-deckchek-core-20261028` | Port FS36 MIDI core with strict evidence validation and audible timing |
| [#22](https://github.com/djshellshoxxx/deckchek/pull/22) | merged | [84b687c](https://github.com/djshellshoxxx/deckchek/commit/84b687c8b0b5102420b2d3d82ced9aebcea05664) | `continuation-deckchek-core-20261028` | Fix distinct MIDI pairing, single-message sensing gaps and GM abort cleanup |
| [#23](https://github.com/djshellshoxxx/deckchek/pull/23) | merged | [171a827](https://github.com/djshellshoxxx/deckchek/commit/171a827611750ba6a0fbf7098957ff6949283e3d) | `main` | Clarify MIDItest port, SysEx, scheduling and capture-evidence contracts |
| [#24](https://github.com/djshellshoxxx/deckchek/pull/24) | merged | [a8918a3](https://github.com/djshellshoxxx/deckchek/commit/a8918a3b9f8b428b0d65ae1255e79a1045faf799) | `continuation-deckchek-core-20261028` | Consolidate corrected main proposal and publish remaining-work handoff |
| [#25](https://github.com/djshellshoxxx/deckchek/pull/25) | merged | [beaf3f8](https://github.com/djshellshoxxx/deckchek/commit/beaf3f8141f8b0f2c2969d0e0dd1a084dc04ca42) | `continuation-deckchek-core-20261028` | Continue integration: FS31 negative-SNR monitor fix, Sonar reliability fixes, remaining PR9 and correctness slices |
| [#26](https://github.com/djshellshoxxx/deckchek/pull/26) | draft / open | [4466cc0](https://github.com/djshellshoxxx/deckchek/commit/4466cc0bb9951a98528f576726e01dd9cecc388e) | `main` | Consolidate all branches into one stack for main; fix CI warning gate; port PR9 FS-34/35/36 |

## Seven divergent branches: evidence and disposition

### 1. MIDI checkpoint

[`app/midi-tests.js`](https://github.com/djshellshoxxx/deckchek/blob/4466cc0bb9951a98528f576726e01dd9cecc388e/app/midi-tests.js) — checkpoint fix [9f97546](https://github.com/djshellshoxxx/deckchek/commit/9f97546c203329a1b53550fce295529fd845a4f9) has an identical diff and stable patch ID to candidate ancestor [2f1c497](https://github.com/djshellshoxxx/deckchek/commit/2f1c497d194a037eead8952cbff5fa772f9190cd). The two CI/latency patches are also equivalent, as recorded below.

[`docs/testing/results/continuation-2026-10-25-midi.md`](https://github.com/djshellshoxxx/deckchek/blob/4466cc0bb9951a98528f576726e01dd9cecc388e/docs/testing/results/continuation-2026-10-25-midi.md) — original validation evidence is retained verbatim apart from a two-line provenance header. The old `CHECKPOINT.md` has been superseded by a newer checkpoint. Preserve the history; no independent source merge is needed.

### 2. PR9 automatic device tests

[#9](https://github.com/djshellshoxxx/deckchek/pull/9) — its 29 changed paths are not byte-identical to PR26, so blob equality cannot establish acceptance. PR21/PR22 supplied the later FS36 engine. Candidate commits [131fa7d](https://github.com/djshellshoxxx/deckchek/commit/131fa7d), [61d4245](https://github.com/djshellshoxxx/deckchek/commit/61d4245), and [ec9b4ad](https://github.com/djshellshoxxx/deckchek/commit/ec9b4ad) supplied FS34/FS35/GM panel and plan integration work. The modules, plans, and tests are present; the old coverage workflow was replaced by `tests/device-test-plan.test.mjs` in the normal test suite. Main's removal of the unverifiable DDJ-S8 profile must remain.

Functional disposition: port present, not yet accepted. The parent review found FS36 capture-integrity false-PASS behavior and FS35 signed-stereo flatness cancellation and lost capture-quality/stream-error evidence. Corrections and independent regression review belong to the integration work. This archaeology report does not certify those fixes. The author of this report did not complete the requested independent FS36 source review.

### 3. PR10 README and wiki

[#10](https://github.com/djshellshoxxx/deckchek/pull/10) and merged [#19](https://github.com/djshellshoxxx/deckchek/pull/19) — full comparisons of all five wiki files showed the original concepts retained with substantive corrections. Architecture distinguishes the current vanilla JavaScript application from proposed TypeScript work; the code map includes native, database, and browser suites; the developer guide retains historical failures as dated evidence and distinguishes physical validation. Home/sidebar links were corrected to `.md` paths, and source wiki material is distinguished from the published GitHub Wiki.

README claims about PDF work, macOS scope, and old failure counts were replaced by newer status with verification caveats. PR19 commit `34347b6` is an ancestor of PR26. No uncovered current functionality was found in PR10; retain the reconciled documents rather than importing obsolete status.

### 4. Hardware catalog / PR2

[#2](https://github.com/djshellshoxxx/deckchek/pull/2) — the branch's complete cumulative diff is exactly the main squash [0962d65](https://github.com/djshellshoxxx/deckchek/commit/0962d654c9b9de36c527962a5257a8ff0efa8544), with matching stable patch ID. Of its 43 changed paths, 39 remain byte-identical to main and PR26. The four later changes concern the release workflow, device index, release acceptance document, and profile tests.

Main subsequently removed the unverifiable DDJ-S8 entry and updated counts and release configuration. That explains the residual tree differences; merging the historical branch could restore invalid catalog material. No missing source contribution was identified.

### 5. Closed remediation / PR20

[#20](https://github.com/djshellshoxxx/deckchek/pull/20) and [`docs/superpowers/plans/2026-10-30-miditest-integration.md`](https://github.com/djshellshoxxx/deckchek/blob/4466cc0bb9951a98528f576726e01dd9cecc388e/docs/superpowers/plans/2026-10-30-miditest-integration.md) — the closed PR's four requirements survive in the corrected plan: the agentic worker header, migration preservation, recovery/rollback, and Windows Rust gates with evidence preservation. The later PR23 plan expands the contracts, so it is not byte-identical. Retain the corrected plan; do not import the obsolete version.

### 6. Spec completion / PR12

[#12](https://github.com/djshellshoxxx/deckchek/pull/12) — its two source commits have exact diff and stable patch-ID equivalents in PR26: CI failure annotations and the deterministic latency-stall regression. Its remaining nonancestor commit is the merge of the fleet branch, whose tip is already contained in PR26. No unique source patch remains.

`git cherry` alone can label an equivalent patch as new when the equivalent commit is excluded by the common-ancestry traversal. Direct patch comparisons and explicit ancestor checks were used to resolve that ambiguity.

### 7. Audio diagnostics / PR11

[#11](https://github.com/djshellshoxxx/deckchek/pull/11) — the entire branch cumulative diff is exactly main squash [9f74fc2](https://github.com/djshellshoxxx/deckchek/commit/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86), with matching stable patch ID. Nineteen of its 20 changed paths remain byte-identical to main. The remaining README was updated by merged PR15. No unmerged audio source contribution remains.

## Exact patch-equivalence proof

All rows below were independently checked with exact patch-text equality and `git patch-id --stable`. Each replacement commit is an ancestor of PR26; both squash replacements are also ancestors of main.

| Original commit or cumulative branch diff | Retained commit | Stable patch ID |
|---|---|---|
| [a16838a](https://github.com/djshellshoxxx/deckchek/commit/a16838af49db28c7629a62b5ff9812587057f153) | [2dfa9b0](https://github.com/djshellshoxxx/deckchek/commit/2dfa9b089e3fec8d96e438f7dbf14a269a8a2e52) | `476a2e5bc65165f915c5f3a29f89e81f0772a5d9` |
| [2a8e528](https://github.com/djshellshoxxx/deckchek/commit/2a8e528f0d6e669ba57ab892a9aae0b0eeee6f24) | [f208d0f](https://github.com/djshellshoxxx/deckchek/commit/f208d0f2cf9140aa44fa2d191dd451183c0b43cd) | `9e065144b858d0558b4f486cde4ba768b8849a4d` |
| [9f97546](https://github.com/djshellshoxxx/deckchek/commit/9f97546c203329a1b53550fce295529fd845a4f9) | [2f1c497](https://github.com/djshellshoxxx/deckchek/commit/2f1c497d194a037eead8952cbff5fa772f9190cd) | `534d8c8cdbe3483afd7ec403ebc746ae2de036c8` |
| `feat/hardware-profile-catalog-20261020` since [fa71931](https://github.com/djshellshoxxx/deckchek/commit/fa71931dfb444c096f964f4a927decd51506851c) | [0962d65](https://github.com/djshellshoxxx/deckchek/commit/0962d654c9b9de36c527962a5257a8ff0efa8544) | `a81c51fff6e7ec891979709bf2f23804c1d13cab` |
| `work/deckchek-audio-diagnostics-release` since [81c871b](https://github.com/djshellshoxxx/deckchek/commit/81c871bb3069d641cac8bea594cb393daa04a297) | [9f74fc2](https://github.com/djshellshoxxx/deckchek/commit/9f74fc2ee7952378bf17698bb6d648a8a2fbbb86) | `de8480d9d6f2484a70d2dcd1d99ee8087579e68f` |

## Candidate-specific work and closure sequence

PR26 is five commits beyond the contained continuation tip [e30e018](https://github.com/djshellshoxxx/deckchek/commit/e30e018): dependency cleanup (`ad003f6`), FS34/FS36 panels (`131fa7d`), certificate plan exclusions (`61d4245`), FS35 ownership fixes (`ec9b4ad`), and checkpoint documentation (`4466cc0`). That is the candidate's additional content, not evidence of completed acceptance.

Finish the corrective integration and verify its final head. After a verified replacement is merged, PR9, PR10, PR12, PR14, and PR16 can be closed as superseded with links to the replacement and the preserved contributions above. Keep branches until any separately authorized archival or deletion decision. PR26 must receive its own disposition based on the actual replacement merge; this report does not direct premature closure.

Historical authored test totals were not rerun as part of this branch audit and are not presented as current verification. No physical MIDI/audio hardware validation was performed. The independent FS36 review remains uncompleted by this report author and must be supplied separately.

## Reproduction

Use the frozen full SHAs above with a complete clone. These read-only checks reproduce ancestry, divergence, changed paths, and patch identity:

```sh
git merge-base MAIN_SHA BRANCH_SHA
git rev-list --left-right --count MAIN_SHA...BRANCH_SHA
git merge-base --is-ancestor BRANCH_SHA CANDIDATE_SHA
git diff --name-status MERGE_BASE_SHA BRANCH_SHA
git log --no-merges --format="%H %s" CANDIDATE_SHA..BRANCH_SHA
git show --format= ORIGINAL_SHA | git patch-id --stable
git show --format= RETAINED_SHA | git patch-id --stable
git diff MERGE_BASE_SHA SQUASHED_BRANCH_SHA | git patch-id --stable
```

Patch identity answers whether a change was retained; it does not validate the resulting behavior. PR links provide review history, frozen commit links provide source evidence, and the integration review must supply current functional acceptance.
