# MIDI transport and AlphaTheta profile follow-up

## Scope and publication snapshot

**Prepublication source qualification — 2026-11-18 UTC.** Source **`2ec083c411c7f9353fb0926fdf6dd828e200c5a0`**, tree **`795cfa22f3eb4d4b7e7838100b60e158f3c0424d`**, passed the complete serial Node suite and applicable local static gates. It combines the MIDI prerequisite correction with exact-model DDJ-GRV6/XDJ-AZ provenance. It changes 13 source paths from published checkpoint35; its immediate profile update changes six paths from source36, including the generated matrix.

| Revision | Identity and scope |
| --- | --- |
| Published checkpoint35 | `72dd38c8bcc941ec33dbe567b8a74f858682ab82`, tree `d074ab4a983a30e5a783297042ab9cc47e583ca8`; stable PR30 head |
| Source36 | `4a0c8981afa8b587457ce13069876796fa06a190`, tree `68272c9bc4068efcd22d265b61efc8f66a341240`; parent `72dd38c`; MIDI prerequisite correction |
| Combined source37 | `2ec083c411c7f9353fb0926fdf6dd828e200c5a0`, tree `795cfa22f3eb4d4b7e7838100b60e158f3c0424d`; parent source36; two existing profiles, their notes/tests and two regenerated matrix rows |

The intended branch is **`review/deckchek-midi-profile-20261118`**, targeting **`integration/deckchek-consolidation-20261118`** at `0acb612aa796f7f459172932868ff7e787d83399`. The follow-up descends from published [PR30](https://github.com/djshellshoxxx/deckchek/pull/30) head `72dd38c` and preserves its contribution, while keeping PR30’s head and checks stable. Both [nightly](../.github/workflows/nightly.yml) and [cross-platform validation](../.github/workflows/cross-platform-release-validation.yml) accept pull requests only into main or `integration/**`; this base keeps those gates applicable without altering workflows. The established integration → PR27 → main path remains subject to applicable qualification. PR30 remains open; no supersession or future merge order is decided.

That follow-up branch and PR have not been created in this snapshot; no PR number is assigned. The 16:24 readback retained main `ee5aa511fb49fc56e299d5b5c262e815ab420d0d` and the integration base above.

The [checkpoint35 report](DECKCHEK-CONTINUATION-35.md) and [concurrent 057d42f report](DECKCHEK-CONTINUATION-2026-11-18.md) remain byte-identical. Their original results, failures, timestamps and prepublication statements remain historical evidence.

## MIDI planning and runner behavior

The earlier planner treated a MIDI descriptor/map object as proof of USB MIDI. This produced confirmed requirements for unknown transports and inappropriate USB instructions for DIN cases. In actual generated Xone:92 and WARM2 panels, a sole unrelated output could receive the optional Identity Request without explicit output selection.

The accepted [planner](../app/devices/test-plan.js) separates generic applicability from explicit Boolean-or-null USB/DIN facts:

- Either transport explicitly true establishes generic MIDI applicability. Both explicitly false suppress automatic conformance, coverage and timing. An unresolved MIDI block remains conditional; an unasserted capability stays null.
- A USB connector or Learn scaffold does not establish USB MIDI. Map-dependent coverage/timing inherit the transport condition. Learn mode does not establish a complete hardware map.
- DIN guidance requires a documented device OUT connected to an interface IN. A DIN Boolean establishes neither port direction nor receiving support. Any output requires a documented receiving connection; Identity evidence remains optional.
- The existing explicit General MIDI sound-source opt-in is separate and unchanged.

Generated conformance without confirmed USB MIDI carries an explicit-output policy. The [runner](../app/ui/devices/midi-runner.js) leaves output unselected on mount, input change and refresh, including sole/name-matched outputs. Manual selection enables the existing connection-owned Identity Request. Handwritten tests and known-USB automatic conformance retain their pairing behavior; this is not a new physical-identity guarantee.

Conditional instructions expose **Skip: MIDI prerequisite not established**, including when no MIDI backend/input is available. Skip uses existing disposal, preserves replacement connection ownership and cannot replace an already saved capture. It records an unestablished prerequisite without declaring that the hardware lacks MIDI.

The author preserved all 506 handwritten test object references, 110 generated MIDI IDs and 77 generated non-MIDI test objects in a separate production-plan comparison. Planning remains idempotent and does not mutate raw profiles. Existing native transport, audio/GM engines, measurement thresholds, certificate exclusion of automatic tests and feature defaults are unchanged. Input-name fallback, same-name replacement and real device identity remain unqualified. [FS-34](specs/34-device-test-completeness.md) and [FS-36](specs/36-general-midi-test.md) define the bounded contract.

## Two exact-model profile decisions

| Existing profile | Primary evidence and additive facts | Fields deliberately left unresolved |
| --- | --- | --- |
| [AlphaTheta DDJ-GRV6](devices/alphatheta-ddj-grv6.md) | [Instruction Manual DRI1927A](https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-GRV6/DDJ-GRV6_DRI1927A_manual.pdf), p.170: USB MIDI. P.168: nominal Audio Section 48 kHz and 24-bit A/D/D/A converters. | Complete audio object remains input/output counts null, supported-rate list empty and scalar bit depth null. Scoped interface class-compliance wording is not promoted into generic USB class compliance. |
| [AlphaTheta XDJ-AZ](devices/alphatheta-xdj-az.md) | [Instruction Manual DRI1936C](https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AZ/XDJ-AZ_DRI1936C_manual_EN.pdf), p.129: USB MIDI in the documented software-control workflow. P.151: nominal Audio Section 44.1 kHz, MASTER D/A 32-bit, other A/D/D/A converters 24-bit. | Complete audio object remains unchanged and unknown. File-decoding formats, converter resolution, ASIO buffer and output-attenuation controls do not enumerate host USB streams or formats. |

Only `connectivity.midi.usbMidi` changes from null to true in each capability block. Both original USB objects, DIN uncertainty, IDs, maps, software/firmware/physical qualification, all 18 handwritten checks and the original six spec/document entries per profile are preserved. Notes/spec/document provenance is additive. The original research-seed classifications remain.

The PDF hashes are `419ab2fa500164b9387cd6f77e75f415210e18e6c34c7607b16f83208ca46213` (GRV6) and `09af14979adfc2197799c8071fd97e4307ef3c1149b8826724b161d8ac60d011` (AZ). Root and the independent reviewer checked the four decisive rendered pages and preservation evidence. Model-index dates are not treated as revision publication dates; AZ's November 2025 PDF metadata is distinguished from the November 2024 index entry.

Both real plans now have confirmed USB MIDI prerequisites while retaining their conditional, minor audio-quality test and −12 dBFS output cap. No receiving connection, Identity reply or complete map is invented. Reviewed provenance covers **21 existing profiles**: the preceding 19 plus these two. This is source-level evidence coverage, not 21 hardware-qualified models.

## Regression record and preservation

| Evidence scope | Recorded outcome |
| --- | --- |
| MIDI author, before production edits | **1 passed / 12 failed** across 13 new cases. One visibility assertion was corrected to inspect actual escaped markup; that case alone then failed **0 passed / 1 failed** before production edits. Both records remain. |
| MIDI author, corrected implementation | First candidate **13/13**; bounded seven-file regressions **104/104**, zero failures/skips. These use actual planner/runner callbacks with an injected MIDI bridge/minimal DOM, not Chromium or hardware. |
| Two-profile author, unchanged profiles | **4 passed / 6 failed**, 10 cases. |
| Two-profile author, accepted five-path source | **84 passed / 1 failed**, 85 total; all **10 new cases passed**. The sole failure was the root-reserved stale coverage matrix. This result is retained, not relabeled as a green author run. |
| Root matrix correction | Only DDJ-GRV6/XDJ-AZ's two rows changed. Their three MIDI requirements each become confirmed. Subsequent combined proof is recorded below. |

Independent source reviews were read-only; they are distinct from author execution and root's complete suite. The five-profile-path review preserved all **1,423 non-owned files** in that author worktree and complete original profile values. Current coverage is **45 profiles / 506 handwritten / 187 generated / 693 total / zero plan gaps**. Conditional audio remains **23**. Conditional MIDI changes from source36's **22 profiles / 66 requirements** to source37's **20 / 60**. Zero gaps means complete plans, not physical testability.

## Qualification by source

| Source and gate | Exact result |
| --- | --- |
| Source36 complete serial Node 22.23.5 suite | **1,737 passed / 0 failed / 1 optional Mixxx-corpus skip**, **1,738 total**, 146 files; **261.690867222 seconds TAP**, **261.80094952900254 seconds wall**. All 1,425 frozen files/index unchanged. |
| Source36 local static and separate monitor | Static gates and **402 JS/MJS syntax checks** passed. Monitor **1/1**, **973.155803 ms TAP**, 2,400 hops, mean **0.332 ms**, worst **1.36 ms**, heap growth **0.06 MB**. |
| Combined source37 complete serial Node 22.23.5 suite | **1,747 passed / 0 failed / 1 optional Mixxx-corpus skip**, **1,748 total**, 147 files; **247.940381799 seconds TAP**, **248.0136835730009 seconds wall**. Started **16:25:47.043415 UTC**, completed **16:29:55.209290 UTC**. |
| Source37 static, completed **16:30:37.441201 UTC** | Device index, timecode, **24 migrations**, mobile copies, notices, coverage, GLib provenance/metadata, application and GLib-harness Rustfmt, and all **403 JS/MJS syntax checks** passed. All **1,428 frozen file hashes** and index tree matched. |
| Source37 separate monitor | **1/1**, **1,010.042297 ms TAP**, 2,400 hops, mean **0.347 ms/hop**, worst **2.35 ms**, heap growth **0.06 MB**; existing budgets unchanged. |

Source36, source37, focused tests and separate monitor runs overlap; their counts are not added. No source37 full local Tauri build or Chromium execution is claimed: the unchanged system-metadata and socket-launch limitations were not retried. Hosted native/browser/platform/extended gates, broad Sonar, physical MIDI/audio and packaged distribution remain open.

## Published checkpoint 35 hosted observation

At **16:26:45.220 UTC**, [Windows job 134939896679](https://github.com/djshellshoxxx/deckchek/actions/runs/44343545794/job/134939896679) had passed on published `72dd38c`. Its actual synthetic checkout `005256dbd2fa0af92fa0045842fb9cbf813558aa` has tree `d074ab4a983a30e5a783297042ab9cc47e583ca8`, matching checkpoint35.

The native suite passed **714 / 0 failed / 9 ignored in 140.68 seconds**. All four prior Windows failures and all three added CRLF regression cases passed. The separate actual Windows PDF test passed **1/1**, with **722 filtered**, **4.15 seconds** and **five report pages**. Hosted action Node deprecation notices remain in the raw log.

The ten other non-tag jobs remained queued; tag-only release-checks was skipped as intended. No queue cause is established. The **16:28:36.307 UTC** status/check read contained no broad Sonar result; Snyk reported only no manifest changes in five projects. These observations qualify the preceding published tree only. They do not establish current37 hosted or security clearance, and do not erase earlier e6/2c9 failures or cancellations in the protected report.

## Evidence and next work

Evidence is under `/workspace/scratch/a884a1d6c4d8/verification`. The source checkout is `continuation-37-checkout`; documentation is prepared separately in `continuation-37-docs-worktree`.

| Record | SHA256 |
| --- | --- |
| `continuation-37-final-integration-acceptance.json` | `2428be48940f6a04dfe3d888b998211a757692fdf81f72b57f9fcbc8883f1e6f` |
| `continuation-36-final-integration-acceptance.json` | `304cd8e725192ce0af698c5bfa26070fd150d50934fbff72f7735b4fe3f615ec` |
| `profile-grv6-az-freeze/manifest.json` | `d94fb32fbf93634c884d29acf8ddc89beb3975b0cc7927b077b642b1e46d51a7` |

The acceptance records identify exact source-freeze, full TAP, post-suite preservation, static and review artifacts. Retain `midi-prerequisites-freeze-20261118/`, `continuation-36-midi-root-review.json`, `continuation-37-profile-final-review.json`, `continuation-37-matrix-regeneration.json`, `profile-grv6-az-freeze/evidence/focused-qualification.tap`, `continuation-35-current-windows-classification.json`, `continuation-35-hosted-20261118T1627.json` and `continuation-35-security-and-queue-20261118T1628.json`.

After every source37 process stopped, root transferred the sole execution slot to `native_support_memory` at approximately **16:31 UTC**. That separate bounded-memory work is outside this snapshot. Verify current execution ownership before any run. Next steps are independent documentation review, separate follow-up publication and exact-source hosted qualification, followed by remaining manufacturer/hardware work. No main merge, release, tag or deployment is claimed or authorized by this record; Fleet remains OFF.
