# DeckChek post-consolidation review — 2026-10-30

This is the current review after the authorized branch repairs and selective
merges. Earlier dated reports remain historical evidence. Start the next session
with [the continuation prompt](CONTINUATION-PROMPT-2026-10-30.md), then verify live
refs and ownership; this snapshot does not freeze remote state.

## What was consolidated

| Work | Result | Verified commit |
|---|---|---|
| PR10 wiki content | Refreshed and ported via PR19 into continuation; retained current README/screenshots and fleet default OFF | `d76e618ad9c2f826ff6cc3d60d9f81a66fdc29fa` |
| PR9 pure FS36 engine | Repaired and ported via PR21 into continuation; all seven original tests plus seven regressions retained | `569ed0e80e102be2c76ce8446a4cc9f28463fc4f` |
| PR22 MIDI edge cases | Follow-up pairing, timing-metadata and all-channel cleanup repairs merged into continuation; 21 module tests | `6bd93e2d1ceb2ff878521de58188cb39d5833c36` |
| PR17 MIDItest proposal | PR18 corrections merged into PR17; conditional documentation only | `152028aac5f43b02ea87d1e30dfb07592f6a901f` |
| Corrected proposal to main | PR17 merged into main; only the reviewed Markdown proposal changed | `2c4d898d594465c8bd8cf596107711f39d0241e2` |

Current reviewed refs before this handoff: continuation `6bd93e2d1ceb2ff878521de58188cb39d5833c36`; main `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`.

The first FS36 repair validates numeric MIDI bytes before coercion, handles very large
Active Sensing streams without spread-argument limits, corrects all ten GM
step timelines, rejects invalid answers as unanswered, and labels subjective
answer summaries as manual evidence. PR22 follow-up adds distinct one-to-one
controller pairing, single-message sensing gaps with finite/non-reversed timing,
and sustain/All Notes Off/All Sound Off cleanup on every channel. Seven more
regressions bring the pure module to 21 tests. It merged at `6bd93e2d1ceb2ff878521de58188cb39d5833c36` after exact-head validation.
It does not wire new MIDI panels, profiles
or dispatch. FS36 is explicitly PARTIAL; FS34/35 remain separate work.

The proposal now uses TEXT/String session IDs, provisional NNNN migration names,
native validation/IPC registration, preservation/retry/forward-repair gates,
baseline-specific CI/CSP requirements and unchanged DeckChek artifacts. Pricing,
issuer design, hosting, file authorization and Electron retirement are unresolved.
No MIDItest implementation, deployment or licensing policy was approved by merging
this document. PR23 subsequently clarified the actual port, SysEx, scheduled-send and capture-diagnostics contracts, including native name ambiguity and consumer payload/wiring requirements. It merged into main at `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`; this handoff brings that proposal and its ancestry into continuation. Bot PR20 is closed, unmerged; useful findings were independently
incorporated, but its destructive downgrade suggestion was not adopted.

All PR merges used expected-head guards and ordinary merge commits. Source branches
and histories remain preserved. No approval review, tag, release, deployment,
manual workflow dispatch, force push, reset or branch deletion was performed.

## Validation and merge holds

Exact source `84b687c8b0b5102420b2d3d82ced9aebcea05664` passed [CI 41044618304](https://github.com/djshellshoxxx/deckchek/actions/runs/41044618304): **1,225 JavaScript passed**, one optional skip; **654 Linux Rust passed**, eight ignored; **1,266/1,266 browser checks**, no console errors; zero failures. Performance and compiler-warning gates passed. Sonar child check 124026196929 passed. All 21 FS36 module tests passed. Merge `6bd93e2d1ceb2ff878521de58188cb39d5833c36` has the identical tested tree `f78f93eac7aef92103c1bb56af847f16c99e47e1`; these results do not clear the broad PR14/16 Sonar holds.

PR22 job IDs: JavaScript 124025563386; Rust 124025563188; browser 124025563437. Independent source review and late-review reconciliation passed. The following PR21 results are retained as earlier exact-head evidence.

The exact PR21 source `3ea13bdd1025247f546cffffe6c56914ad5f6c20` passed
[CI 41041300727](https://github.com/djshellshoxxx/deckchek/actions/runs/41041300727):

| Check | Actual result |
|---|---|
| JavaScript, job 124014482086 | 1,218 passed, zero failed, one optional skip; separate performance check passed |
| Linux Rust, job 124014482141 | 654 passed, zero failed, eight ignored; compiler-warning gate passed |
| Browser, job 124014481667 | 1,266 / 1,266; no console errors |
| Sonar, check 124014925013 | Passed for the PR21 delta |

Merge `569ed0e` has the same tree as tested PR21: `002cc9f420a72f3827f6e38524fcad6fafb29508`.
These are existing GitHub CI executions, not local tests or physical hardware
acceptance. Independent source review passed. The original 1,204-pass JS result
at `722c7fd` remains valid historical evidence, not the new suite count.

For the document-only proposal, completed CI run 41039745656 at `2c6c265` passed
JavaScript, Linux Rust, Windows Rust and browser jobs. GitHub comparison proves
the sole subsequent change at `819f381` is the Markdown plan. PR18 Sonar
124017953411 and PR17 Sonar 124019100909 passed. The PR17 merge head `152028a`
has the same tree as independently reviewed `819f381`:
`7a9dbf217198722b600b7d485bb3d2a8fd2898d9`. Fresh ordinary checks were pending
when the source-identical result was reused under explicit owner authorization;
pending jobs are not recorded as passes. Recheck their eventual outcomes.

PR23 source `171a827611750ba6a0fbf7098957ff6949283e3d` changes only the same Markdown plan against main `2c4d898`; exact-head Sonar 124028886778 passed. Independent source/consumer review passed. Ordinary fresh checks and automated review were pending when the owner-authorized unchanged-source validation was reused. Its main merge `ee5aa511` preserves tree `f7ac64fd2c4486b7c5bc05977ee130ac0978b7ad`.

Later PR17 Windows job 124018903070 failed with 424 passed, one failed and five
ignored: `processes::tests::live_tasklist_parses` hit the existing 20-second
scan timeout in its final `top_cpu_blocking(5)` PowerShell call. A retry request was rejected because that workflow was
still running; no retry executed. The source-identical main merge `2c4d898`
subsequently passed Windows job 124022733311. Preserve both results; the timeout
needs reproducibility investigation before claiming reliable Windows behavior.
No timeout, assertion or test was weakened.

**The broad code stack remains blocked.** PR14 at `9f4928a` fails Sonar
security/reliability (check 123949755970; D/D; 50 reported annotations).
PR16 still fails reliability after both FS36 merges: check 124031174223 at
`6bd93e2` reports C, required A (the prior check 124018889271 at `569ed0e` failed too). Passing child deltas do not waive either gate.
Do not merge PR16 into PR14 or PR14 into main until the applicable broad gates
and ownership checks pass. Detailed findings remain unavailable through the
inspected supported routes. Obtain an authorized export/new supported access;
do not retry the rejected annotations endpoint, disable rules, or accept findings
just to produce green checks.

Main at `f3fbf1c` also has a pre-existing macOS ARM packaging failure, job
123985120862: `taiki-e/install-action` failed before compilation while replacing
a missing cached `cargo-binstall` executable. Other five packaging matrix jobs
passed, as did its ordinary JS/Linux Rust/Windows Rust/browser checks. This is
an installer-action failure, not evidence of an application compile failure or
successful ARM package. The same installer-action failure recurred on main
`2c4d898` in job 124026834945. The continuation already replaces third-party install
actions; verify its actual matrix before adding a duplicate workflow fix.

## Remaining branch reconciliation

| Branch / PR | Disposition and next action |
|---|---|
| continuation / PR16 | Integration baseline is `6bd93e2` plus this handoff; still targets PR14. Fix broad Sonar issues, preserve README/TODO conflict resolution, then merge PR16 → PR14 → main. |
| PR14 | Do not merge alone: preserve continuation's later README/TODO and default-OFF resolution. Its description now records implemented FS20/21/22/23/31/32/33 and the broad Sonar hold; recheck the combined scope before final integration. |
| PR9 | Keep original `a4d844b`. FS36 pure engine is now represented by repaired PR21. Port FS34 plan/coverage and FS35 audio/session work, then FS36 UI/profile/dispatch with current ownership rules. Do not merge old shared files wholesale. |
| PR10 | Wiki content is represented in continuation through PR19, not yet main. Preserve original `4cfa38c`; do not reintroduce its stale README/workflows or duplicate the port. |
| PR12 / PR13 | PR12's two non-ancestor follow-ups are patch-equivalent in continuation; PR13 is an ancestor. Integrate through the code stack, not duplicate merges. Keep branches until final main reconciliation. |
| Old MIDI checkpoint | `7d44aae` has equivalent source patches and distinct historical handoffs. Preserve its 846 JS / 186 browser results as history. |
| Old audio branch | `34b809f` was squash-merged via PR11 as `9f74fc2`; different hashes do not prove missing functionality. |
| Old catalog branch | `46b86eb` needs content-level comparison; wholesale restoration would resurrect unsupported `pioneer-ddj-s8.json` and overwrite newer device behavior. |
| `claude/epic-thompson-tvwx9n` | `3440a63` is an ancestor of continuation; no unique unmerged commits on the reviewed ref. |
| PR15 / `claude/docs-screenshots` | Already merged into main and incorporated into continuation. Preserve the source branch. |

PR9 repairs still needed before its remaining code can merge:

1. Split the duplicate `run:` key in its old coverage workflow into a separate
   step on the current workflow. Preserve existing test/index/generation gates.
2. New conformance/GM panels must capture their connection/output and recheck
   ownership after awaits. Cleanup must not affect replacement ports; completion
   must use the captured connection. Retain claim/release, generation, late LED,
   neutral/unexercised and reconnect assertions.
3. Audio capture rejection/disposal must prevent later playback, render and save.
   Use owned cancellation and handle cleanup, not global `stopAll()` affecting
   another session. Preserve current managed-tuner fixes.
4. Resolve FS36 spec/source disagreements explicitly: pairing percentage,
   identity severity and absent burst-rate metric. Do not silently change current
   thresholds to make tests or prose agree. Simulated/manual results remain labeled.

## Project work beyond consolidation

| Priority / area | Remaining work and evidence boundary |
|---|---|
| Correctness: live monitor | Investigate AUDIT R2-02 / FS31 AC3 in `app/monitor.js`: negative/falling SNR can become cueing before the play/at-speed floor guard. Reproduce alongside cue/scratch/idle counterexamples; retain 12 dB floor, hysteresis and cooldown semantics. |
| Storage: bundled SQLite | AUD04 requires a current primary-source dependency/security review of rusqlite 0.32.1 / libsqlite3-sys 0.30.1. Preserve hostile-schema rejection, trusted_schema OFF, defensive mode, upgrade fixtures, byte-identical failed restore and photo consistency. |
| Native lifecycle | General stream-pump release and late-driver-open ownership remain beyond the completed managed tuner cancellation fix. Reproduce cancellation/join/delayed-open paths before modifying shared audio ownership. |
| Stylus benchmark | FS12 guided benchmark is not implemented; manual entry and Fill from latest exist. External Claude stylus-hours UI race ownership remains unresolved: do not touch that lane before coordination. |
| Smaller UX gaps | Latency runs already save; a dedicated history list is a UX enhancement, not an unmet FS11 acceptance criterion. Consider service part/labour amendment UI using existing `amends_id`; FS22 is append-only, so destructive deletion is not an accepted requirement. |
| Security/product decisions | Native file-picker/path authorization, external-URL confirmation, restored signing-key provenance and custom command ACL/hidden PDF window (AUD10) need scoped resolution. R4-21 is a low-severity disputed display-consistency item: verify displayed ledger facts against verified certificate facts without changing trust semantics; an ordinary bounded correctness fix does not inherently require a new policy decision. |
| Optional export enhancement | FS20 AC3 specifies v1 PDF plus sidecar. Embedded certificate JSON is explicitly optional phase 2, not a missing v1 release or security gate. |
| Packaging/product policy | Installer signing/updater policy, fleet OS notifications, and MIDItest licensing/issuer/hosting/Electron decisions remain separate from completed core features. |
| Physical/platform validation | H00–H33 reference measurements; FS11 WASAPI buffer; FS31 shared capture and two-hour resource run; FS32 real VirtualDJ round trip; FS23 real database/H23 before default ON; phone/MIDI driver/vendor maps; install/launch/uninstall and actual audio on exact architecture packages. Linux x86 packaged execution remains unrun. |
| End-to-end qualification | FS21 privacy export needs software/data/manual end-to-end validation, not inherently physical hardware. Verify FS33's offline-guide AC6 separately from the published-help/manual Pages leak check; the latter requires a separately authorized deployment. |
| Later backlog | Vendor DVS decoders, crop/ML vinyl classifiers, venue isolation A/B and incident logging, CDJ transport/HID. Do not present these as accepted unfinished release gates without checking specs. |

Do not redo already implemented FS20/21/22/23/31/32/33, Compare entry points,
venue CRUD/photo consumers, DPAPI protection, scratch capture-busy handling or
input-pair selectors because old TODO/PR bodies imply they are absent. Reconcile
stale TODO/IMPLEMENTATION_STATUS/QA counts against source, not vice versa.

## Environment and ownership boundary

The original saved `/workspace/deckchek-current`, `/workspace/deckchek` and
`/workspace/deckchek-toolchain` were unavailable; the environment-status capability
was not exposed. Local dirty files/worktrees and external workers could not be
inspected. No replacement checkout/environment or package-access workaround was
created. Bounded remote edits used the authorized GitHub connector, temporary
staging files, independent review and existing PR CI. This does not resolve local
ownership of shared modules.

Fleet remains default OFF. Preserve all assertions, migration/data guarantees,
thresholds and measured/manual/simulated provenance. Continue independent allowed
work when one lane is blocked; do not claim unexecuted hardware/platform gates.
