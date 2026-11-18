# DeckChek consolidation report

Session date: 2026-11-17, America/Los_Angeles. Repository evidence timestamps are UTC.

## Result and current decision

The canonical candidate remains [PR #27](https://github.com/djshellshoxxx/deckchek/pull/27), `integration/deckchek-consolidation-20261118`. The refreshed audit accounts for **26 remote branches and 23 pull requests**, including PRs #28 and #29 created during the review. Reviewed source at **`5960099ed4094172025dad9129dc38b148dabedf`** preserves the existing consolidation, incorporates the useful concurrent lifecycle work, and adds independently checked diagnostic, ownership, backup and GLib corrections plus guided stylus benchmark capture.

**Main integration remains gated by current application/native/platform verification and a fresh broad Sonar result.** Local regressions and isolated native harnesses support the repairs; they do not substitute for those gates. Main remains `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`. Physical hardware qualification is tracked separately and is not, by itself, the reason main integration is held.

| Reference | Exact revision / disposition |
|---|---|
| Initial and last verified `main` | `ee5aa511fb49fc56e299d5b5c262e815ab420d0d` |
| Initial PR #27 head for this continuation | `1b1db168288389e755b598a47eb6bb82697f0cab` |
| Earlier reviewed source named in the request | `00f1f3cc8d96527f436ee28958ed23201b60a01b`; already contained in the initial head |
| Preserved PR #26 stack | `4466cc0bb9951a98528f576726e01dd9cecc388e` |
| Combined reviewed source | `5960099ed4094172025dad9129dc38b148dabedf`; later report-only commits do not establish new qualification |
| Concurrent lifecycle source | PR #29 lifecycle head `9475ac50d7ac9379c2a34d733f221f469df1397c`, followed by latest probe correction `fd39b14586d9abddf93557b6c5f2628304f2caec`; both retained by normal merges |
| Concurrent audit correction | Useful SQLite facts extracted from PR #28, `57bd96609aeaf03e97cc79cf3ab1b19115e0da74`; its obsolete GLib acceptance recommendation was not adopted |

No historical branch was deleted or rewritten. No release, release tag or deployment was performed. Superseded PRs targeting main remain open until their verified replacement actually reaches main. The exact final published report head, PR states and CI run links are recorded in the PR body and [continuation handoff](DECKCHEK-CONTINUATION-HANDOFF.md).

## Branch and PR reconciliation

The [complete branch audit](DECKCHEK-BRANCH-AUDIT.md) contains every branch name, frozen head, ahead/behind count, risk, contribution and disposition, plus all 23 PRs. The audit used full local ancestry, merge bases, nonmerge commit lists, `git cherry`, exact patch text, stable patch IDs and changed blobs. Commit-count divergence was not treated as missing functionality.

| Contribution | Current disposition |
|---|---|
| PR #14, #16 and merged development stack | Their tips are ancestors of the candidate; retained with subsequent repairs. No duplicate merge into main. |
| PR #26 | Complete stack retained by ancestry in PR #27. Close as superseded only after the qualified replacement reaches main. |
| PR #12 storage/offline population | Its two nonmerge changes have exact patch-equivalent ancestors; its Fleet merge is already contained. |
| PR #9 FS-34/35/36 | Corrected ports retain all 29 original paths; newer engine, plan and UI fixes remain in place. Historical code is not copied over the corrected implementation. |
| PR #10 documentation/wiki | Original topics retained through reconciled wiki work and current status corrections. |
| PR #2 catalog and PR #11 audio diagnostics | Exact cumulative squash equivalence established. Later deliberate catalog and workflow changes are preserved. |
| MIDI boundary checkpoint | Equivalent source fixes and original evidence retained with a provenance header. |
| Closed, unmerged PR #20 | All four useful requirements survive in the corrected MIDItest proposal. |
| PR #29 lifecycle/ZIP work | Clean normal merge preserves both its history and all four post-`3e85ab5` native MIDI/GLib commits. Certificate and Verify changes passed independent lifecycle review; monitor received an additional reviewed save-ownership repair. Its later `fd39b145` probe cleanup is also retained. |
| PR #28 SQLite facts and GLib plan | SQLite documentation correction extracted with attribution and checked against the locked crate archive. The GLib recommendation predates the source backport and is superseded by the current security disposition. |

The PR #29 merge required no textual conflict resolution. Semantic reconciliation consisted of preserving newer native ownership and GLib work, retaining the ZIP 9 refusal behavior, repairing the additional monitor race, and excluding the superseded advisory acceptance recommendation. No unique historical source contribution was silently dropped.

## Corrections made in this continuation

The following are separate behavioral scopes; test counts overlap and are not added together.

| Scope | Reproduced problem and resulting behavior | Review evidence |
|---|---|---|
| Native MIDI event delivery | A failed native event emission was counted as emitted. It now increments transport loss; incomplete captures require REVIEW. Acceptance by the event API is not represented as confirmed renderer receipt. | Exact production pump harness: failing regression before repair, 2/2 after; independently rerun. |
| General MIDI action ownership | An older pending step switch could resume notes after newer Play, Silence or Save actions. New action generations invalidate stale continuations and preserve captured-output cleanup. | Three regressions failed before; 78 focused checks and additional independent ownership probes passed. |
| Browser MIDI ownership | Name lookup and overlapping permission/listener registration could retarget callbacks or reopen after close. Actual port objects, single shared subscriptions, close generations and captured close barriers now own the operation. | 92 focused MIDI/bridge checks plus independent close/retry probes passed. |
| Native queued input opening | A blocking worker could open after a newer close. Generation tokens are acquired before queuing; stale workers cannot replace a fresh input. | Three before-fix failures; 22 independently executed exact-module checks passed. |
| Native output failure | A failed send could reconnect by display name and deliver old cleanup to a replacement physical port. Failed bindings remain unavailable until explicit connection reset; late cleanup cannot silently reconnect. | Two before-fix failures; 26 independent exact-module checks passed. Physical identity beyond observable handles remains unqualified. |
| MIDI timing evidence | Invalid, nonfinite, negative, reversing or zero-span timestamps could resemble ideal timing. Byte/count observations remain, but unavailable timing cannot establish PASS. | Focused timing and full MIDI regressions passed; tied timestamps remain valid when the overall span advances. |
| Numeric criteria and audio summaries | Coercible/missing/nonfinite measurements or bounds could pass, or an incomplete audio run could claim every check passed. Numeric comparisons now require finite numeric evidence and explicitly retain incomplete findings. | Four before-fix regression groups; 70 focused checks and 1,350 finite-value equivalence comparisons passed. |
| Device result chronology | Lexical timestamps and order-dependent reduction could let older PASS or input permutation hide newer/adverse/unorderable evidence. Valid observation instants and unresolved evidence are considered separately; raw stored records remain unchanged. | 73 device/plan/Fleet/certificate checks, including permutation coverage, passed. |
| Backup evidence integrity | SQLite page integrity alone accepted orphaned foreign-key evidence. Backup and restore now require both integrity and foreign-key checks, with errors failing closed. | Reproduced page-check bypass; independent exact-helper compatibility/adversarial checks passed, including historical fixtures. |
| ZIP 9 refusal and application byte bound | ZIP 9 refuses a forged oversized first block before returning bytes, so the old expected error code was wrong. Both settings/database regression paths preserve refusal and zero sink bytes. The unchanged streaming body is now independently testable using plain readers. | Six root exact-source/ZIP 9 checks passed, including overrun, short read, read error and exact hash/byte cases. Full application restore CI remains a gate. |
| Certificate screen and Verify | Superseded history/identity reads and delayed native drop registrations could affect a new request/screen owner. Request and registration generations now dispose or ignore obsolete completions. | Ten of 18 new lifecycle cases fail on the preceding source; 55 focused checks plus six independent probes pass on the corrected source. |
| Monitor settings | A delayed initial read or prune failure could misrepresent a persisted choice. Further review found overlapping Save/prune completions could restore an older choice. The combined repair owns the entire save/prune operation and preserves retry behavior. | Four regression groups failed before; 54/54 focused checks and 3/3 independent probes passed after (the independent probes had two failures before). |
| Audio probe Clippy cleanup | PR #29 later grouped each probe device, configuration and format to reduce eight function arguments to four. The run body, timing, silence output and JSON are unchanged. | Two independent source reviews confirmed exact body/value equivalence; formatting passed. Actual native/Windows compilation remains a gate. |
| CI ownership | The reusable test workflow shared concurrency identity with the standalone PR invocation. The corrected group separates callers; platform package validation now also runs on PRs into main. | Static independent review; earlier cancellation and subsequent CI states retained in the readiness report. |

The current monitor connection error tells users to restart DeckChek to reset a failed native output binding. The code does not imply that an unimplemented reconnect button exists. Input close alone does not reset captured output ownership.

## Completed feature: guided stylus benchmarks

FS-12 now has a guided acquisition workflow for stereo 1 kHz, isolated left/right tracks and optional control vinyl. Each completed analysis is saved in History before the next step. A final review saves the benchmark using the original asset, setup, operator conditions, actual input/channel pair/sample rate and calibration profile. Both channel measurements remain available; the aggregate keeps mean THD and the poorer measured separation.

Eligibility rejects missing or inconsistent capture counters, missing error arrays, errors/gaps/clipping/truncation, incompatible provenance, nonfinite or incomplete analysis, missing expected channel/reference tone and reversed or unverified control-vinyl direction. The existing reference floor and measurement thresholds are preserved. A delayed save from an old stylus cannot enter the replacement trend because selection uses acquisition spans. Undated guided baselines cannot be ordered to select a favorable context. Historical manually confirmed baselines stay explicitly labelled.

Cancellation/disposal owns its capture lease and suppresses obsolete completions. A dispatched persistence operation is not described as a reversible save; the UI prevents cancellation or duplicate saves at that stage. History retains analysis/provenance, not raw sample audio. Independent review passed **64 focused tests** (55 stylus tests and nine capture-session tests). At `ef49ed6`, hosted browser CI passed 1,293/1,293 checks with no console errors, including the guided-stylus checks. Browser/native execution for the later combined source and physical cartridge/reference-record repeatability remain required. Generated signals do not qualify real stylus wear accuracy.

## GLib source remediation and residual qualification

RUSTSEC-2024-0429 is an actual soundness issue in `VariantStrIter`; a lockfile-only upgrade is incompatible with the currently selected Tauri/GTK/WebKit dependency family. The candidate vendors the checksum-verified published GLib 0.18.5 archive with two separate, reviewed patches: the official two-line mutable-output-pointer security fix and 34 compiler-suggested syntax corrections across 12 other files. The latter removes three redundant parenthesis pairs and explicitly spells 31 existing lifetimes; it changes no runtime expressions. Version, license, original 121-file inventory and security-fix bytes remain intact. Applying both patches reproduces the complete vendored source, and reversing both reconstructs every original archive file byte-for-byte. Application, fuzz and regression roots select the same local source; an actual Windows line-ending checkout preserves all source files and both patch artifacts.

An optimized exact-module harness calling real system GLib reproduced a SIGSEGV on the original and passed four cases after the security patch. Ten JavaScript provenance/selection/tamper checks now pass, including rejection of altered compatibility artifacts and dependency declarations. The regression harness declares GLib as a test-only dependency. A separate six-case optimized **actual selected crate** test remains mandatory in CI. At `ef49ed6`, [native CI job 134668697815](https://github.com/djshellshoxxx/deckchek/actions/runs/44265442094/job/134668697815) passed that actual-crate step and 670 application Rust tests (zero failures, eight ignored), then failed the warning gate on the 34 vendored compiler diagnostics. The standalone [run 44265441929](https://github.com/djshellshoxxx/deckchek/actions/runs/44265441929) independently reached the same result. Check, strict Clippy and platform packaging did not complete. Source commits `d4151c7` and `5960099` address these diagnostics and the harness dependency warning without changing any CI workflow or warning gate. Their source/provenance review is accepted; their combined native/platform qualification still requires fresh CI.

The post-patch RustSec run reports zero vulnerability records and five maintenance notices. The GLib warning disappears because the dependency is a path source; that omission is **not** advisory clearance. The final combined native and applicable platform checks must establish the remaining qualification, including the configured actual-crate step on the published head. No advisory ignore, version spoofing or risk-acceptance waiver was added. See the [security audit](DECKCHEK-SECURITY-AUDIT.md) for advisory sources, hashes and notice IDs.

## Verification and integration boundary

The final local Node 22 serial run on `5960099` passed **1,428 tests, with zero failures and one optional skip (1,429 total)** in 125.033 seconds. The preceding `e43be06` source passed 1,424 tests with one optional skip in 132.083 seconds; four new provenance guards account for the additional cases. A four-worker repeat on that earlier source failed with eight SIGKILL workers and one unchanged certificate timing-limit failure. The termination cause remains unproven, and the failed result is retained in the readiness report. Serial execution changed no source, timing limit or assertion. The current evidence table and precise reproduction commands are in [release readiness](DECKCHEK-RELEASE-READINESS.md). The prior published `ef49ed6` source passed 1,391 JavaScript tests with one optional skip in hosted CI; that is historical evidence for the earlier source.

Current local Rust formatting, device index/coverage, migration naming, mobile-copy checks, syntax, third-party notices and GLib source selection are recorded with their actual outcomes. Full local native compilation remains blocked by unavailable GLib/GTK/WebKitGTK/ALSA development metadata, and local Chromium cannot launch under the host's socket restrictions. Supported hosted workflows provide these prerequisites. No workaround changed sandbox, sudo or package policy.

At the initial `1b1db16` head, native CI compiled the application and ran 662 passing tests, one ZIP assertion failure and eight ignored cases. That is useful evidence that the earlier `DriverScan` alias collision was fixed. It is not a pass for the later backup, MIDI or GLib source. The seven original dependency vulnerabilities, schema validation repair and all 57 Clippy source corrections remain preserved; complete current application check/Clippy verification is still required.

A broad current Sonar analysis is also unresolved. Historical annotations were retrieved; the public issue/dashboard route returns HTTP 403 and no authenticated Sonar capability is available in this session. Historical green or narrower checks cannot clear this requirement. Required approvals/protections are rechecked through available GitHub capabilities before any eventual main merge; an inaccessible administration endpoint is not permission to bypass a protection.

Separating a smaller source PR does not resolve the shared current native/security qualification requirements, and moving candidate-specific documentation alone to main would misstate the source it describes. The reviewed changes therefore remain on the existing canonical candidate. No new redundant consolidation stack was created.

## Retained earlier repairs and remaining scope

This continuation preserves the initial candidate's explicit MIDI pairing and capture-loss validation, Fleet/certificate chronology, cryptographic population identifiers, FS-35 worst-channel analysis and capture/calibration provenance, scoped keyboard/progress/focus behavior, typed trusted-schema/foreign-key validation before restore, 64 KiB SQL allocation bound, reviewed dependency updates, strict warning/Clippy gates, service navigation/request ownership, mapper save association and the native parser-alias repair. Earlier precise commits and tests remain in the security report and Git history.

All 24 feature entries remain in the [completion ledger](DECKCHEK-COMPLETION-LEDGER.md), with software behavior distinguished from hardware, platform and release qualification. Remaining code/product scope includes stable physical MIDI identity, the broader FS-15 isolation A/B and incident-log architecture, PDF-embedded certificate JSON (verification currently uses a sidecar), researched conditional hardware profiles, and the conditional MIDItest consumer integration. Real reference measurements, shared-driver behavior, supported OS packages, actual phones, VirtualDJ interoperability and signing/distribution acceptance remain separately labelled. No completion percentage was invented for unmeasured scope.

Fleet remains OFF by default. The -12 dBFS audio output cap, diagnostic thresholds, migration history, stored raw evidence, existing signed certificates and valid contributor identifiers are preserved.
