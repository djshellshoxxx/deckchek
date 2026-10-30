# DeckChek remote reconciliation — 2026-10-30

> Historical pre-merge snapshot. For completed merges, later validation, current blockers and the execution prompt, read [the post-consolidation review](POST-CONSOLIDATION-2026-10-30.md).

## Scope and exact source

This is a documentation-only continuation of the approved reconciliation task.
No application, tests, database migrations or workflows are changed by this patch.
The saved `/workspace/deckchek-current`, `/workspace/deckchek` and toolchain
were not accessible in this session, and the managed environment-status tool was
not exposed. No replacement environment or dependency-installation workaround was
used. Local dirty files, worktrees and active local workers could not be inspected.

Remote refs were read through the authorized GitHub connector:

| Ref | Reviewed SHA |
|---|---|
| main | `f3fbf1cc0ba2047e6e1929f3c6622f55a76865f1` |
| continuation / PR16 | `722c7fdaadedfb2fd4906a6bd12ecaf9438d66b6` |
| PR14 | `9f4928a00a44b62529429d1f14ad104b65db28c6` |
| PR9 | `a4d844b22df478a141c06a6561c941d6461a8aea` |
| PR10 | `4cfa38cf127881f07a7ab9e408f2fb701c4ff984` |
| PR17 | `6414eaa1c95123de8b6fd774d31696b803c5968f` |

The single commit from `6fb85e2` to `722c7fd` changes only CHECKPOINT, NOTES,
the continuation prompt and the merge-review Markdown. The current tree contains
no `AGENTS.md` or `.agents` instructions. PR14's discussion still records Claude's
stylus-hours race ownership; there is no observed release of that ownership.
Preserve the lane until resolved.

## Exact-head checks and merge hold

[Run 41036582627](https://github.com/djshellshoxxx/deckchek/actions/runs/41036582627)
completed successfully at `722c7fdaadedfb2fd4906a6bd12ecaf9438d66b6`.
The job records and logs were retrieved:

| Job | ID | Actual result |
|---|---|---|
| javascript-tests | 123998785790 | 1,204 passed, one optional skip, zero failed; performance/consistency checks passed |
| rust-tests | 123998785473 | 654 passed, eight ignored, zero failed; compiler-warning gate passed |
| ui-smoke | 123998785966 | 1,266 / 1,266 checks passed |

These are the existing CI results, not tests run in this session's executor.
They establish software behavior only on those runners.

The complete check set is **not green**:

- PR14 Sonar check `123949755970`: failed, D reliability and D security ratings;
  summary reports 50 annotations.
- PR16 Sonar check `123999388751`: failed, C reliability rating;
  summary reports four annotations. This is an additional gate beyond the old handoff.
- CodeRabbit skipped PR16 because it is draft; that is not an independent approval.

PR comments and check summaries do not contain the individual Sonar findings.
The previously unsupported annotation endpoint was not retried. Available plugin
discovery did not identify a usable Sonar or saved-environment connection.
Detailed findings remain unavailable through the inspected supported routes;
an authorized finding export or newly supported access is required. No rules
were disabled, findings accepted, approval reviews submitted or merges attempted.

The existing PR16-to-PR14-to-main conditional authorization remains valid only
after the relevant gates and ownership checks pass. Recheck source and target
SHAs, workflow side effects and expected-head guards immediately before each
authorized merge. Preserve every branch and the existing README/TODO resolution.

## PR10 wiki reconciliation

The five wiki pages are retained in `docs/wiki/` and linked from the current
README. Historical PR10 failures remain explicitly tied to its old SHA; they are
not described as current failures. The developer guide now names the active
test/nightly/platform workflows and the retired Windows workflow correctly.
Relative links work as repository Markdown. Architecture distinguishes today's
JavaScript UI from the proposed TypeScript direction. No separate GitHub Wiki
publication or repository-settings change was attempted.

This is a content port onto the reviewed continuation, not a merge or closure
of PR10. Its original branch and review history remain intact.

## PR9 static review and next implementation slices

Independent source review compared PR9 with continuation. Its merge base is
`81c871bb3069d641cac8bea594cb393daa04a297`; PR9 has one distinct commit and is
244 commits behind continuation. These findings are static review results,
not newly executed reproductions or a complete DSP audit.

| Finding | Source and required repair |
|---|---|
| Duplicate workflow mapping key | PR9 `.github/workflows/test.yml` places coverage `run:` beneath the existing index `run:` in one step. Add a separate named step to the current workflow; retain every existing gate. |
| Stale MIDI panel ownership | PR9 `app/ui/devices/midi-runner.js` adds conformance/GM callbacks using mutable `st.outPort`. Capture the current connection/output, recheck after awaits, and pass the connection to result completion. Cleanup must never act on a replacement port. |
| Playback after capture failure/disposal | PR9 `app/devices/audio-session.js` suppresses early capture rejection during its lead wait; `app/ui/devices/audio-runner.js` lacks a disposed token and calls global `stopAll()`. Use owned cancellation and handle cleanup; prevent later playback/render/save after failure or disposal. |
| GM note durations | In `app/midi-conformance.js`, several steps attach the intended audible delay to note-off instead of note-on. Assert the event timeline so notes remain on for the intended duration. |
| Weak raw MIDI validation | Conformance/identity parsing lacks strict finite, integer, nonnegative byte validation. Cases such as negative, fractional and NaN data can escape current checks; the raw-panel path cannot rely on the existing parsed-message guard. |
| Large stream argument limit | Active Sensing uses `Math.max(...g)`. Compute the maximum iteratively without discarding samples; cover a large stream. |

Keep FS34's plan/coverage module, FS35's audio-quality/session work and FS36's
conformance/GM feature intent. Port narrow additions rather than replace shared
files with the old versions.

Once the original environment is accessible and ownership is checked:

1. Port FS34 plan/audit and narrow device dispatch/validation additions; regenerate
   coverage documentation from the selected baseline and add the independent CI step.
2. Port and fix the pure FS36 analyzer and GM schedule with malformed-packet,
   timeline and large-stream regressions.
3. Integrate MIDI/audio UI with explicit ownership/cancellation regressions.
   Run existing unit/native/browser checks, then independent review.

Preserve all current `tests/midi-runner-lifecycle.test.mjs` and
`tests/midi-tests.test.mjs` assertions, including neutral/unexercised evidence,
large arrays, open/dispose/replace races and late LED answers.
Preserve current device-library foreign-key/native/FUZZ-06 cases and core-smoke
wiring instructions, linked measurements, learned-map persistence, live output
enumeration and exported unit/report identity. Add PR9 assertions on top.
No stylus-hours work is included. Simulated audio/GM and plan coverage do not
establish physical-device or driver qualification.

## PR17 proposal correction

[Draft PR18](https://github.com/djshellshoxxx/deckchek/pull/18), commit
`a55b4c5e25f6450abbc0e7149d0d8bd271707666`, is based on PR17's exact head,
preserving its original branch. It fixes provisional migration allocation after 0022, TEXT/String session
IDs, native report validation/IPC registration, nested test coverage, obsolete
workflow references, bridge reuse and smoke discovery. It also removes unapproved
licensing/hosting/Electron defaults, retains the existing CSP, and corrects source
history and desktop/web packaging checks. These are proposal corrections, not
implementation approval or delivered MIDItest functionality.

## Blockers and handoff

| Action | Target | State and reason |
|---|---|---|
| Inspect local ownership and implement/test source changes | Original saved DeckChek environment | Unavailable in this session; worktrees/toolchain/status capability not exposed |
| Triage detailed Sonar findings | PR14 and PR16 checks above | Blocked by unavailable finding detail through supported access; known unsupported route not retried |
| Merge reviewed code stack | PR16 → PR14 → main | Held by failing Sonar gates and unresolved local/external ownership checks |
| Qualify hardware/platform behavior | Relevant spec acceptance gates | Unexecuted here; existing ignored/manual gates remain open |

Continue from fresh live refs, this report, CHECKPOINT and the original acceptance
criteria. Fleet stays default off. File-selection authorization, URL-confirmation
policy, historical signing-key provenance, production license issuance and
hosting remain scoped decisions. No release, tag, deployment, unsafe hardware
write, force push, branch deletion or worker-branch overwrite occurred.
