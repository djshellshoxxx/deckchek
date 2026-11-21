# Pre-gig storage and recovery — completed round seventeen handoff

Date: 2026-11-21. Root consolidated all three completed review lanes. **Scoped
ACCEPT: the single authorized five-file FIRST passed 132/132, including all 49
cumulative additions.** This checkpoint remains held from whole-application
qualification by the original complete-source audio failure and the separate
native/platform boundaries. No additional project execution followed this FIRST.

## What is complete

The cumulative browser adapter distinguishes confirmed absence from unreadable
or malformed storage. Dependent writes preserve unknown original collections,
validate complete replacement data and acknowledge only after storage accepts
the write. Completed checks and imported or edited presets survive failed saves;
Retry persists the retained result without repeating measurements. History and
preset reads retain known data with explicit unavailable-state guidance.

The corrective source detaches submitted preset data, locks every draft control
while its write is pending and restores editing after failure. Acknowledged
Save finishes independently of optional refresh. PDF preparation captures the
retained run and its tested preset, checks ownership before export handoff and
keeps feedback and fallback actions attached to that result. Tests use stable
document-lifetime feedback hosts and count Pre-gig writes separately from actual
catalog initialization.

These fixes resolve the four earlier static blockers. Round sixteen's original
source and three reports remain preserved as an **unexecuted static HOLD**; the
passing result here does not retroactively qualify that earlier source.

## Exact reviewed source and final reports

| Item | Commit / tree |
| --- | --- |
| Frozen candidate | `2ac0cf4dc25cb17471149ba64c83b3855c319d45` / `285b665343d91b6cabebc0f0210fa661865d7305` |
| Sole frozen parent | `f4d727cb9243b60594dc0df73da3d0808d698b81` |
| Code FINAL | `e9ffdd526c590df6c2ebc5cf23f947e3ec5c9528` / `21e92e9baa90157ab3115c9a509e875a85178092` |
| Functional FINAL | `aafcc5ddb63cca87b3142d57155c6d2b96333daa` / `401d96f27204f2bf62ab3a1c5f3ad34be2ca7d36` |
| Security FINAL | `ef102e281e5ca3388dbfb9c6b66756f3eb2ced36` / `55f23911b71d8255177aecb65fff59376b2320b0` |

Each FINAL has the exact freeze as its sole parent. Code and security each add
only their report; functional adds its report and 28 evidence files. Root read
all three reports completely and independently recomputed immutable blob IDs,
then checked every original working byte and executable mode in all four
worktrees. All were clean. The freeze has **2,546 paths, 2,288 distinct blobs,
88,465,624 summed bytes and 207 top-level test files**, with ordered source-map
SHA-256 `e02518433215984d516ed73d2f104acc93ed1f80a428ebf6b07ad61b3af32c5d`.

The reports are [code](PREGIG_RECOVERY_CODE_AUDIT_2026-11-21.md),
[functional](PREGIG_RECOVERY_FUNCTIONAL_AUDIT_2026-11-21.md) and
[defensive security](PREGIG_RECOVERY_SECURITY_AUDIT_2026-11-21.md). Each contains
the complete case inventory, source reasoning, actual-consumer review and limits.

Root preserved the original sealed history through three no-fast-forward merges:
`b7c9fb5060ffe02c5f8e43ac985f2aa2f895b074` (freeze then code),
`556c4e084626e5459d8bc14bc46d647d40c496ce` (preceding merge then functional), and
`0a91fbcd80adc142d4bb680f75d2176965cc0eee` (preceding merge then security).
The combined report/evidence tree is `363f71471703cbb5623366e5c0633778b98cd555`.

## Original FIRST and evidence

All three lanes accepted source and then the complete exact controls. Root
separately reviewed the recorder, selection, launcher, source and runtime before
authorizing only the functional worker's single FIRST. Root, code and security
ran no project code. The selected files were the original core, actual-screen,
browser-storage, controller/UI and strict-text tests; no extracted implementation
or weakened assertion substituted for them.

| Observation | Original result |
| --- | --- |
| Tests / pass / fail / cancel / skip / todo | **132 / 132 / 0 / 0 / 0 / 0** |
| Added cases | **49/49 passed**; 83 older cases remain individually accounted for |
| Project / recorder exit | **0 / 0** |
| Project wall time | **15.125495306994708 seconds** |
| TAP duration | **15014.516442 ms** |
| Timeout, signals, recorder/postflight error, stderr | None |
| Runtime | Absolute pinned Node v24.22.3, Linux x64 |
| Original raw records | **24 files / 2,870,756 bytes** |
| Retained package | **28 files / 2,930,522 bytes**, all regular mode 0644 |

Root independently read every TAP/result line, checked all 132 ordered outcomes,
the before/after source records and runtime/control bindings. Every one of the
26 original-to-copy bindings matches byte-for-byte and in mode; the manifest and
custody record describe the exact 28-file package. The independent source
inventory also binds all 83 historical names, numbers and durations to the older
original TAP without carrying qualification to later bytes.

The [manifest](evidence/pregig-recovery-functional-2026-11-21/manifest.json)
and [custody check](evidence/pregig-recovery-functional-2026-11-21/custody-check.json)
bind all retained records. Original [TAP](evidence/pregig-recovery-functional-2026-11-21/focused/run.tap)
is 31,900 bytes, SHA-256 `655d53c1ef68f1d62eefdb06834b840bb0b7bd8c60da22019ac82cd8b4e25cdc`;
original [result](evidence/pregig-recovery-functional-2026-11-21/focused/result.json)
is 9,411 bytes, SHA-256 `8c152852d3170fafbbc787174f1b96b067e269a95aa4787ba7d6e73b59a89a74`.

Root's independent [preflight](evidence/pregig-recovery-integration-2026-11-21/root-preflight-proof.json),
[FIRST](evidence/pregig-recovery-integration-2026-11-21/root-first-proof.json),
[package](evidence/pregig-recovery-integration-2026-11-21/root-package-proof.json) and
[final source/report](evidence/pregig-recovery-integration-2026-11-21/root-final-proof.json)
checks are retained separately. Their SHA-256 values, in that order, are
`550329a244c41245a7ba36166a979c6c6bfe5f0e97d6281fd7ac69dfb8dd7f75`,
`306cffc6f05c94ebd9361027e50a0b08b050760d417c6059c3852343bc7f479d`,
`a15b85da84a0eb51b2c96e45dc10e9f0ffe89d04b80e7d83cf15477663e7789e`, and
`1d5ca6482d8e6bf74d25f15d28c38f482d3afc02a125ec8b035895781bb33953`.

## Carried native association correction

Deleting a custom preset associated with a running or retained-unsaved check can
leave the future save carrying a preset ID that no longer exists. Native
`save_run` requires that association to exist. The current Delete flow lacks
active-result/save ownership protection; native deletion's handling of already
stored history does not repair a future in-memory run payload. All three lanes
confirmed this source relationship, and comparison with pre-Pre-gig baseline
`b71a81a849c0bad9f24b4ba7ea40366e86769501` establishes that it predates this change.

Root queues a separate correction: guard associated preset deletion throughout
active measurement, save and retained-unsaved result ownership, or explicitly
preserve a valid association. Review the delayed-confirmation and already-pending
deletion ordering and provide actual-handler/contract coverage. This report
contains no native reproduction and this focused pass does not close the item.

## Scope and continuation

PDF cases use the real JavaScript printable/export path and actual CSS with a
fake native acknowledgement. They qualify neither native rendering nor
cancellation after submission. DOM fixtures do not establish real browser layout,
focus, accessibility or operating-system dialogs. Native persistence, physical
audio and native backup #85 owner/cache/startup/exit work remain unqualified.

The original full-source audio HOLD is unchanged: **2,420 total / 2,418 pass /
one failure / one optional skip**, including the original gain result of −101 dB
at played −30 dBFS. No cause, repair or rerun is claimed. Qualified main, durable
Backup/Service `34afefa58ac5e8346006087587b113c2a82d5a39`, all other fixed heads
and default-off Fleet remain intact. Issue #87 stays open for qualified integration
and the associated-preset follow-up.

All three current workers are complete. Root's next candidate addresses System
Health #89 coverage, in a separate worktree; fresh code, functional and security
workers must review its frozen source before any separately authorized bounded
FIRST. Population Compare #88 remains queued. Root owns implementation, integration,
CI and publication. The same hourly continuation stays enabled. Credit balance
is unavailable; no credit-exhaustion result is inferred.
