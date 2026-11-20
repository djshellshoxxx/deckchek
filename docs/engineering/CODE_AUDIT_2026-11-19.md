# DeckChek code and branch audit — 19 November 2026

## Scope and result

Reviewed `main` at `8c43cf17e3d5f5067ece5667f1aec1540f4b4091`, including the 29 other remote branch tips present in the initial inventory. Twenty-one tips are ancestors of this baseline. Eight have divergent commit histories; their implementation contributions are already present, have been repaired in later work, or were deliberately superseded. No useful missing implementation was found in these eight branches. A divergent commit count is not a count of unfinished features.

This worker separately audited pure device-dispatch, test-plan and MIDI-conformance code. It confirmed and fixed one MIDI note-pairing defect. This is a scoped review, not a claim that the entire application is defect-free. Browser lifecycle and native/import security have separate owners in this round.

## Divergent branches

| Branch and exact tip | Behind / ahead | Decision and independently checked evidence |
| --- | --- | --- |
| `checkpoint/deckchek-midi-boundaries-20261025` (`7d44aae2f56db8316c61c0f6cf1adaf75dcad988`) | 344 / 5 | Already represented. `git cherry` identifies the three code/test commits as patch-equivalent. `docs/testing/results/continuation-2026-10-25-midi.md` is preserved verbatim after a two-line historical provenance preface. Its old checkpoint is superseded by later checkpoints. |
| `claude/amazing-fermat-csql4g` (`a4d844b22df478a141c06a6561c941d6461a8aea`) | 351 / 1 | Selectively integrated and repaired. FS-36 core came through `3ea13bd`; FS-34 and FS-36 panels through `131fa7d`; FS-35 through `ec9b4ad`. Every exported JavaScript declaration added by this branch remains available. Its unit-test names remain, except the audio dispatch test has the suffix `(ported from PR9)` in `tests/audio-session.test.mjs`. Current tests include later ownership, cancellation, data-integrity and conditional-transport corrections. Reapplying the old branch would regress those repairs. |
| `docs/readme-and-wiki` (`4cfa38cf127881f07a7ab9e408f2fb701c4ff984`) | 351 / 1 | Wiki material is retained and corrected by main ancestor `34347b6`. The five pages now link to real repository files, correctly describe JavaScript instead of a completed TypeScript conversion, and distinguish historical test counts from current status. Old README snapshot lines were superseded. |
| `feat/hardware-profile-catalog-20261020` (`46b86ebbbd34738f2e5d0db66d39517e3dcbe688`) | 374 / 94 | Squash-represented. An endpoint comparison with main ancestor `0962d65` differs only because that ancestor adds two research documents; every file in this branch has identical content there. Main later corrects product identities, profiles, provenance and release gates. The 94 divergent commits do not represent 94 missing changes. |
| `fix/remediation-678de3d8-904afa` (`1694aa2b828679d15cee959b7aa974c40d995b4c`) | 346 / 1 | Already represented and expanded. Current MIDItest proposal retains all four substantive corrections: worker header, additive migration/recovery constraints, preservation of Windows gates, and separate artifact-only Windows output. Later source-specific bridge corrections are retained. This remains a proposal; it is not permission to select licensing or hosting policy. |
| `nodata/zealous-mayer-g8x5b0` (`57bd96609aeaf03e97cc79cf3ab1b19115e0da74`) | 49 / 1 | SQLite audit corrections were selectively retained through `c090c1d`. The branch's unique GLib acceptance-plan document is deliberately not imported: it recommends accepting the advisory, while current main already contains a maintained GLib backport and its verification. Its dated recommendations must not replace the newer security disposition. |
| `task/deckchek-spec-completion` (`1ca22bef3f9571e7486054712028bf9c6d776552`) | 337 / 3 | Already represented. Net three-dot diff against main is empty. Stable patch IDs for `a16838a`/`2a8e528` equal main ancestors `2dfa9b0`/`f208d0f` respectively. |
| `work/deckchek-audio-diagnostics-release` (`34b809f771e2fb4ce903d5608788779e124a1ed7`) | 351 / 26 | Entire tree is byte-identical to main ancestor `9f74fc2`. Later README, workflow and implementation improvements remain authoritative. |

All original branch tips are preserved. This audit does not delete branches, rewrite history, deploy or publish releases.

## Ancestor branches

Each of the following passed `git merge-base --is-ancestor <tip> 8c43cf17e3d5f5067ece5667f1aec1540f4b4091`:

| Branch | Exact tip |
| --- | --- |
| `claude/bold-hawking-jmyq4o` | `beaf3f8141f8b0f2c2969d0e0dd1a084dc04ca42` |
| `claude/confident-goldberg-o06vg2` | `9f4928a00a44b62529429d1f14ad104b65db28c6` |
| `claude/docs-screenshots` | `551757fad1ce4fa8318e996531e644de22927b19` |
| `claude/epic-thompson-tvwx9n` | `3440a631e33eee832e73ae41d142d2d4af49e2fb` |
| `claude/tender-johnson-w8l6nn` | `152028aac5f43b02ea87d1e30dfb07592f6a901f` |
| `codex/correct-miditest-plan-20261030` | `819f38186b9ee8f5b846b2eec0a4c3381a6bf043` |
| `codex/fs36-midi-core-20261030` | `3ea13bdd1025247f546cffffe6c56914ad5f6c20` |
| `codex/fs36-stream-cleanup-20261030` | `84b687c8b0b5102420b2d3d82ced9aebcea05664` |
| `codex/miditest-contracts-20261030` | `171a827611750ba6a0fbf7098957ff6949283e3d` |
| `codex/monitor-snr-20261031` | `3b5f46441769f5b15bbf7d07e6ac4378801ce6ad` |
| `codex/post-consolidation-20261030` | `a8918a3b9f8b428b0d65ae1255e79a1045faf799` |
| `codex/reconcile-wiki-20261030` | `34347b6ef859861ecdd0b70d1b1f5e1a9ee817cb` |
| `continuation-deckchek-core-20261028` | `e30e018f068c086c1337df9ef211aff18f36a07b` |
| `integration/deckchek-consolidation-20261118` | `291d876ea7a12eead020ead8032e76e592fb9d11` |
| `nodata/dazzling-meitner-m35twn` | `5bd6359ed5a013379dd1ca7aaee7cdd270931874` |
| `nodata/doc-sweep-20261118` | `61a7c6b74d75074cef5ec029e1c127184d869c86` |
| `nodata/practical-ptolemy-wu3ekp` | `4466cc0bb9951a98528f576726e01dd9cecc388e` |
| `review/deckchek-lifecycle-20261118` | `72dd38c8bcc941ec33dbe567b8a74f858682ab82` |
| `review/deckchek-midi-profile-20261118` | `cc15026a3594d65ab8fbc4d3e9d18f7113b73b10` |
| `review/deckchek-native-catalog-20261118` | `43dd58f7cb16b87fb58959a5d024951a52900f65` |
| `task/deckchek-fleet` | `f0feebeb657e76bc758f8e5328573abe36f11670` |

## Confirmed finding: false stuck-note failures after All Notes Off

**Severity: medium; corrected in this change.** `analyzeStream()` only paired individual Note Off messages and velocity-zero Note Ons. DeckChek's own General MIDI `all-notes-off` sequence ends with CC123 and no individual releases. Feeding that sequence to the conformance analyzer produced six false stuck notes, even though the intended release command was captured.

The [MIDI Association message summary](https://midi.org/summary-of-midi-1-0-messages) and [control-change table](https://midi.org/midi-1-0-control-change-messages), checked 19 November 2026, identify CC123 and mode changes CC124–127 as channel-level note-release commands. CC120 is All Sound Off; CC121 resets controllers. These are different operations.

The correction applies note-release commands to the addressed channel only. It retains one bounded pairing credit per previously observed note-on so a subsequent individual Note Off is not falsely reported as orphaned. Credits cannot excuse excess releases or another channel's messages. Later note-ons require a new release. CC120, controller reset, Local Control and pedal changes do not invent key-release evidence.

The metric ID `midi_stuck_notes` remains compatible, while its label and finding now say that a release was not captured. The analyzer does not measure audible voices, sustain-pedal behavior, envelope tails or physical switch faults. SPEC-36 states this boundary explicitly. The existing failure threshold is unchanged.

### Standards review

The change stays in the existing pure analyzer. It preserves metric IDs, byte validation, captured event order, channel isolation and the existing device runner interface. It adds no dependency, platform command or output transmission. No documented-standard violation was found in this patch. No general formatting cleanup or unrelated refactor is included.

### Specification review

SPEC-36 requires exact orphan and stuck-note counts for synthetic streams and includes All Notes Off in its own GM test sequence. The previous analyzer contradicted that sequence. The corrected implementation recognizes the specified mode releases and explicitly limits its claim to captured MIDI messages. Hardware sound and backend behavior remain separate qualification gates.

## Validation

Runtime: Node **22.23.4**.

- Before the fix, the four focused new regressions produced **1 pass / 3 failures**. The built-in GM sequence reproduced the six false stuck-note entries directly.
- After the fix, `node --test tests/midi-conformance.test.mjs tests/midi-fs36-ui.test.mjs tests/midi-runner-lifecycle.test.mjs` passed **83 tests / 0 failures / 0 skips** in 14.223 seconds of reported TAP duration.
- Coverage includes every built-in GM sequence, CC123–127, repeated note-ons, target-channel isolation, late individual releases, excess releases, subsequent note-ons, All Sound Off versus note release, sustain context, malformed bytes and the existing device-runner lifecycle tests.
- `git diff --check` passed. No native, hardware or full-application qualification is claimed by this worker.

## Fresh-worker handoff

Review this patch against baseline `8c43cf17e3d5f5067ece5667f1aec1540f4b4091` after integration. Check channel-mode release semantics, bounded late-release credits and absence of new false orphans. Keep the saved metric ID compatible. Run the affected MIDI scope only if review introduces changes or discovers a concrete risk; root owns combined qualification.

The branch inventory needs a fresh remote read before any future consolidation action. Preserve the unique historical GLib plan on its original branch, but do not import its obsolete acceptance recommendation. No branch deletion is necessary for feature completion.

Potential later audit scope: malformed or reversed timestamp handling in multi-message Active Sensing and MIDI Clock calculations. This was noticed during review but not yet reproduced or qualified; it is a follow-up hypothesis, not a confirmed finding. Real MIDI physical identity, same-name device substitution, backend hot-plug behavior and hardware accuracy remain unqualified and cannot be inferred from these unit tests.
