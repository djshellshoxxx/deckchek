# DeckChek consolidation report

**Reviewed foundation checkpoint — 2026-11-18 UTC:** source `25e91e97fa2311e2e786894344297ccdc19ca849`, tree `b2c36fc3774831859a9d2073e657ec7f013d66d1`, preserves both `fd39b14586d9abddf93557b6c5f2628304f2caec` and reviewed integration `ef49ed6cfd08e94651a1536b4e4509efdccdbedb`. It is carried by [PR #29](https://github.com/djshellshoxxx/deckchek/pull/29) into [PR #27](https://github.com/djshellshoxxx/deckchek/pull/27). Canonical `main` remains `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`. The exact combined source passed the complete Node 22 suite: **1,431 passed, zero failed and 1 optional skip (1,432 total; 123.913 seconds)**. Native, platform and extended CI must qualify this source. Guided-stylus corrections are still local and under independent review; the known measurement defects are not declared fixed in this checkpoint. Older results below apply only to their named revisions. See the [current handoff](DECKCHEK-CONTINUATION-HANDOFF.md).

## Baseline and decision

The audit began from canonical `main` at `ee5aa511fb49fc56e299d5b5c262e815ab420d0d` and draft [PR #26](https://github.com/djshellshoxxx/deckchek/pull/26) at `4466cc0bb9951a98528f576726e01dd9cecc388e`. The live inventory contained 23 branches and 20 pull requests, six of them open. PR #26 had 261 commits and 328 changed files relative to `main` and contained `main` as an ancestor.

PR #26 is the appropriate source for consolidation. Its existing stack preserves the valuable development history. The older branches should not be merged independently into it. [PR #27](https://github.com/djshellshoxxx/deckchek/pull/27), from `integration/deckchek-consolidation-20261118` to `main`, preserves that stack and adds reviewed corrections. Creating this branch does not establish that the candidate is ready to merge. After its creation, a fresh inventory contained 24 branches; `main` remained at the SHA above.

## Historical contributions

The independent branch audit compared live branch heads, ancestry, cumulative patches, individual patch IDs, changed blobs and the rewritten wiki. Its full evidence belongs in [DECKCHEK-BRANCH-AUDIT.md](DECKCHEK-BRANCH-AUDIT.md).

| Contribution | Disposition |
|---|---|
| PR #14 / PR #16 and their merged development branches | Already ancestors of PR #26. Do not merge them again. |
| PR #12 storage/population foundations | Its two non-merge source commits have exact patch-equivalent ancestors in the stack. |
| PR #2 hardware catalog | Cumulative change is represented by its squash commit and subsequent corrections. |
| PR #11 audio diagnostics | Cumulative change is represented by its squash commit and subsequent corrections. |
| PR #10 documentation/wiki | Original subjects are retained in the corrected wiki; obsolete branch/status instructions were rewritten. |
| MIDI boundary checkpoint | Source patch is equivalent to an existing ancestor; the evidence document is retained with provenance. |
| PR #20 MIDItest proposal remediation | All four corrected requirements are represented in the current proposal. |
| PR #9 FS-34/35/36 | Functionality was selectively ported and corrected in PR #26. Further reproduced defects require the continuation fixes described below. |

No branch has been deleted. No PR has been closed as superseded during this work. Closure must wait until the verified replacement reaches `main`, with a comment accounting for the original contribution.

## Corrections after the audit

The integration does not blindly copy historical files. It preserves the corrected implementations and repairs reproduced defects:

1. MIDI input changes must not retain the preceding device's output. Output selection is explicit when pairing is ambiguous, and duplicate names are rejected at the runner boundary.
2. An unavailable or reset MIDI loss counter, or an absent/unobservable selected input, cannot establish a complete capture. Results retain the observations and require REVIEW.
3. Fleet and certificate result selection compares timestamps as instants. Optional milliseconds and timezone offsets must not allow an older PASS to hide a newer FAIL. Equal-time adverse evidence is preserved.
4. Certificate results with an unknown timestamp remain visible, cannot establish readiness, and cannot generate a PASS certificate.
5. Population identifiers use cryptographic randomness. The old timestamp/`Math.random` fallback is removed; failed resets preserve the previous identifier.
6. The compiler-warning step preserves a failed `cargo build` exit through `tee` with `pipefail`.
7. FS-35 flatness uses the worst absolute deviation across both channels, preventing opposite errors from cancelling into a PASS. Results retain signed/per-channel values and analysis revision 2.
8. FS-35 live capture preserves and validates native counters/errors. Incomplete or unavailable continuity evidence requires REVIEW. Calibration applies only when its identified input and rate match the actual capture. Nonfinite samples produce no measurements.
9. FS-35 now provides stage progress, scoped Enter/Escape controls, focus restoration and separate channel plots. Independent source review and 51 focused tests passed. Its seven new injected-I/O browser checks also passed in the 1,283-check CI suite at `742c67a`.
10. Rust sources were mechanically formatted, and CI now explicitly requires formatting, type checking and Clippy without warnings. Two source-string regression checks were corrected to accept line wrapping while retaining their security assertions.
11. A targeted dependency update removes the seven original vulnerability records from both lockfiles, with compatibility tests for migrations, backup and old/new ZIP readers. One GLib unsoundness warning and five maintenance notices remain explicit; no advisory was ignored.
12. Restore now compares typed SQL tokens and foreign-key metadata with the trusted schema for the backup's declared version before integrity checks and migrations. A crafted CHECK constraint can no longer pass the old structural fingerprint. SQL objects over 64 KiB are rejected before their text is collected or tokenized. Independent review passed seven focused compatibility/adversarial checks.
13. All 57 diagnostics from the first strict Clippy run have reviewed source corrections. Internal helper grouping and standard library idioms preserve ownership, numeric boundaries, UTF-16 decoding, sort stability and SQL parameter order; no lint suppression was added. Full application Clippy remains a fresh CI gate.
14. Native MIDI connection/reconnect selection now rejects duplicate successfully read names, including an explicit cached input reopen. It preserves existing captured input callbacks and output cleanup; same-name physical substitution remains unqualified.
15. Service shortcut/navigation errors are reported, and old job/comparison results cannot overwrite a new intake form. Real screen/shell regressions and independent lifecycle checks pass.
16. Mapper saves retain ownership of their original logical mapping. Completing a save after New/Open can no longer assign the previous mapping's ID to the new mapping and redirect its next database write.
17. Fresh CI caught a tuple alias colliding with the existing `DriverScan` IPC struct. Commit `8acaa7a` renames only the parser alias; the failed compile is retained as evidence, and the public command shape is unchanged.

The changes preserve measurement thresholds, the -12 dBFS output cap, raw evidence, migrations, existing signed certificates, valid stored pack identifiers and feature defaults. Fleet remains OFF by default.

## Verification and merge conditions

Baseline CI at `4466cc0` passed 654 Rust tests (eight ignored), 1,299 JavaScript tests (one optional skip) and 1,276 browser checks. Those results apply to that baseline. They do not qualify later edits automatically.

The first combined local correction run passed 1,316 JavaScript tests with one optional skip and no failures. Source through `2243bbb` passed 1,325 JavaScript tests locally and again in CI at report commit `730d71d`; its native CI exposed the alias collision described above. The complete follow-up source through `00f1f3cc8d96527f436ee28958ed23201b60a01b` passed **1,338 JavaScript tests with one optional skip and no failures** on Node 22.23.5. Formatting passes. Fresh application CI for the corrected native candidate and UI follow-ups is tracked in the handoff before a merge is considered.

Formatting now passes. Remaining required gates include final-source native check/Clippy verification, a current broad Sonar verdict and current platform acceptance. The first integration CI run compiled Rust and reported 653 passed, one whitespace-sensitive source-assertion failure and eight ignored; that assertion has been corrected. Local native compilation is blocked by missing GLib/GTK/WebKitGTK/ALSA development metadata. Local Chromium launch is blocked by the environment's socket permissions. These are documented limitations; they do not count as successful checks. A newly executed RustSec audit also identified dependency work, recorded with its final disposition in the security report and handoff.

See [DECKCHEK-RELEASE-READINESS.md](DECKCHEK-RELEASE-READINESS.md) and [DECKCHEK-SECURITY-AUDIT.md](DECKCHEK-SECURITY-AUDIT.md). No release, tag, deployment, force-push or remote history rewrite is part of this consolidation.

## Historical reviewed candidate and continuing work

The next complete reviewed code candidate is `eb45ab8fecf100ddf50ef4d4bd6e09fc2ad27a98`. It adds certificate history/identity request ownership (`b8fb70e`), Verify OS-drop listener ownership (`eba99f3`), saved monitor-setting ownership (`6127377`), and the ZIP 9 regression correction (`eb45ab8`). Dedicated implementation and independent review are recorded in the handoff. Its complete JavaScript source passed **1,367 tests, zero failures, one optional skip** on Node 22.23.5; full Rust formatting passed.

On the preceding published `1b1db16`, [CI 44258246462](https://github.com/djshellshoxxx/deckchek/actions/runs/44258246462) passed 1,338 JavaScript tests and 1,283 browser checks, with no console errors. Native compilation succeeded: 662 tests passed, one lying-ZIP error-code assertion failed, and eight tests were ignored. The corrected ZIP regression retains rejection, live-data preservation and cleanup coverage and adds directly mutation-tested application bounds. Native check/Clippy were not reached in that failed job and remain required for the next source.

The first long local JavaScript fuzz attempt is incomplete: two 2-second wall-time checks failed, four targets completed their 120-second runs, and the process was subsequently killed (exit 137) before a canonical result. Exact saved inputs do not reproduce the timeout in repeated replay; the termination cause is not established. Full stress also ended in SIGKILL after its separate performance check passed. Neither run is relabeled successful or dismissed as proven infrastructure failure.

A dedicated worker has started the missing FS-12 guided capture implementation. That work is not part of this frozen candidate or a completed feature claim. Main remains unmerged; historical PR closure and release/platform/hardware qualification remain subject to the existing gates.

Standalone canonical replay subsequently completed the unchanged 120-second budget and 2,000 ms input gate on Node 22.23.5: 501,593 executions, no error, exit 0, maximum RSS 152,500 KiB. Both saved slow inputs passed 30,003 exact replays each. These results do not establish why the original process was killed. The remaining and previously timed-out targets are being run sequentially in fresh processes with unchanged budgets; no full long-fuzz pass is claimed yet.

## Reconciliation of concurrent remote corrections

The attempted publication observed that the remote branch had advanced from `1b1db16` to `1d2b488`; it was not overwritten. Merge candidate `8c1409ef390aeb7c0899a82becbaabe82d45c116` has parents `1d2b48844105bbd5e60043c1989e0e92949aa188` and `fbf28395ccabfa6fc29a955c8b312e6961055408`, preserving both histories.

| Remote commit | Preserved contribution |
|---|---|
| `0cf8b32b427a9f6fbaa0b3f076bb25c2b3c77fc2` | Failed native MIDI event emission counts as transport loss |
| `2ba8125eed53633e58822f619cb6d3afa87ff29f` | Newer GM actions cancel a pending stale step switch |
| `934f9fd9410e8068068dc8c464ce60ebaf108bd9` | Valid latest evidence and explicit incomplete audio checks |
| `2243af7fd9325e1bb9c23b32f65a0bcfe437de69` | PR-triggered platform build validation |
| `96da8854ae68aeb64a5292f04fd89abee408d82d` | Invalid MIDI timing cannot establish a passing result |
| `1d2b48844105bbd5e60043c1989e0e92949aa188` | Foreign-key integrity for backup/restore and ZIP 9 early rejection |

The overlapping ZIP changes were reconciled with the stronger empty-sink assertion for both entries and direct tests of the unchanged application streaming guard. Review found one workflow collision: direct and reusable PR tests shared a concurrency key. The merge includes the independently reviewed caller-name correction while preserving tag cancellation behavior and release conditions.

All ten new JavaScript cases fail against the previous production code with assertion failures. The isolated combined source passes **1,377 tests, zero failures, one optional skip** (1,378 total) and full Rust formatting. Independent native/workflow review passes eleven compatibility/accounting checks and six exact-source ZIP checks. Full native check/Clippy, browser and platform jobs still need current-source execution. The preceding remote platform run is queued and its direct test run was cancelled; neither is a passing qualification result.

## Follow-up branch and newer integration source

Concurrent publication continued after the first reconciliation. Rather than overwrite that work, PR #29 targets the integration branch from `review/deckchek-lifecycle-20261118`. Code `9475ac5` preserves the remote guided-stylus model/workflow and all earlier reviewed lifecycle/ZIP changes. The separate local stylus draft was byte-verified and archived before adoption; its duplicate implementation was not published. Corrections now address reproduced defects in the adopted design.

Native CI for `9475ac5` passed 670 tests with eight ignored, formatting, compiler-warning checks and type checking. Strict Clippy then found one eight-argument helper in the WASAPI timing example. Independently reviewed `fd39b14` groups each device/configuration/sample-format tuple into `ProbeDevice`; stream construction, silence output, timing and JSON results are unchanged, and no lint allowance was added.

The integration branch independently advanced to `ef49ed6`, adding native queued-open cancellation, failed-output tombstones and a provenance-pinned GLib backport. Those changes have been reviewed for adoption without treating the source review as application qualification. The source backport matches the original 121-file package except for the official two-line iterator repair, retains version/license/copyright, and is selected by application, fuzz and optimized regression roots. No advisory is ignored.

Root has also extended only the PR trigger filters of the existing platform and nightly workflows to main and `integration/**`. Parsed comparisons confirm unchanged job bodies, workloads, budgets, permissions, concurrency and tag-only release conditions. The purpose is to obtain platform, sanitizer, Windows/PDF, long-fuzz and full-stress evidence before a substantial merge; local package dependencies and resource limits remain explicit.

Guided-stylus corrections and per-case stress-process isolation are still in independent review. Their completed source, counts and final CI must be recorded before integration. PR #28's SQLite audit contribution is accounted for; its older GLib acceptance plan must be reconciled with the newer backport rather than applied as a current clearance. No main merge, historical PR closure, release, tag or deployment has occurred.
## Reviewed foundation checkpoint

Source `25e91e97fa2311e2e786894344297ccdc19ca849` uses a history-preserving two-parent reconciliation of the isolated review branch and `ef49ed6`. The exact combined tree `b2c36fc3774831859a9d2073e657ec7f013d66d1` passed the complete Node 22 suite: **1,431 passed, zero failed and 1 optional skip (1,432 total; 123.913 seconds)**. The broader source review and earlier feature-specific tests remain documented above; neither the older green jobs nor this JavaScript pass qualify a changed native package.

| Scope | Decision and preserved behavior |
|---|---|
| GLib source backport | Retain the exact original 0.18.5 source, upstream two-line iterator fix, provenance manifest, optimized actual-crate regression, three Cargo root selections and existing copyright/license notices. |
| Native MIDI ownership | Retain queued-open cancellation generations and failed-output ownership tombstones; the independent production-body harness passed 22 cases and killed the removed-guard mutant. Physical identity remains separate. |
| Compiler-warning gate | Attribute rustc JSON by exact package ID and manifest. App warnings, compiler errors, incomplete/malformed evidence and producer/parser failures still fail. Dependency diagnostics remain visible and downloadable; no lint allow, cap or vendor-style modification was added. |
| Stress accounting | Run each unchanged workload in a fresh test process so its process-lifetime memory peak belongs to that workload. All fixtures, durations, assertions and budgets are preserved. Full stress remains a CI gate. |
| Qualification triggers | Platform and nightly workflows now include pull requests into `main` and `integration/**`. Existing jobs, budgets, read permissions and tag-only release publication remain intact. |
| Hardware research | Exact-model manufacturer evidence confirms Inpulse 500 USB audio routing and Launchpad Pro MK3's lack of an audio interface. Unknown identifiers, firmware/class-compliance fields, maps and handwritten tests remain unchanged. |

The local guided-stylus branch of work is deliberately absent from this source checkpoint. Independent review first reproduced prefix-only reference validation and then coherent-offset cancellation that corrupts THD and separation even inside the declared frequency criterion. A coupled measured-frequency correction is being implemented before another independent review. The existing guided source in the integration stack is therefore not marked complete or release-ready.
