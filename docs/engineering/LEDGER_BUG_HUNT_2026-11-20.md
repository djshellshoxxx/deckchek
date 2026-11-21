# Ledger functional audit and authored corrections — 20 November 2026

Worker: `/root/ledger_bug_hunt_round1`. Dates use America/Vancouver.

## Disposition and exact sources

The consolidated source had two reproducible screen-state faults and a separate
browser note-identity fault. This worker authored corrections and regressions;
**this report is not independent acceptance of those corrections**. Fresh
code/functional and defensive review, followed by root's combined qualification,
remain required before integration.

| Role | Commit / tree |
| --- | --- |
| Fixed comparison base: reviewed PR #48 plus merged #46 candidate | `3d1ee5bddb56db1290af0166874612ada3c0a566` |
| Initial consolidated PR #47 and Ledger #49–#56 source | `9c90091be33fa58085bff80b34121d8cf4053a3a` / `4efa2e323bd9cef9f95d548a31e892ae174551c4` |
| Screen note-ownership and reload correction | `31b2af83839c18ec5fb5123ce6743e3bcb22ece9` |
| Separate dictionary/recovery correction; final executed implementation | `a76746213a7fccf652c8f660029f7b1e51e7c7c3` / `5433decfa380eef46b1d51fceb4e38bfad307743` |

The initial fixed diff is `git diff 3d1ee5b...9c90091`; it has seven changed files.
This worker's implementation changes four files relative to `9c90091`: the Ledger
screen, browser API, existing API durability tests, and a new screen test file.
The report is a later documentation-only addition.

## Standards observations

The separate code-audit worker owns the full Standards review. This functional
work inspected the relevant conventions and applied
[DEVELOPMENT-PLAN §5.7](../DEVELOPMENT-PLAN.md#57-error-handling-review-m9-errors-mid):
errors should communicate cause, consequence and a next step. The three browser
storage errors now tell the user to retain edits or an exported file and restore
storage access, or preserve unreadable data for recovery. They do not recommend
deleting or resetting stored data. Existing error causes are retained where the
API already supplies them.

No dependency, schema, native command, limit, capability or default feature flag
was changed. No separate architecture refactor was introduced. The investigation
found no scoped `CONTEXT.md` or ADR relevant to this module.

## Spec observations

[FS-33 §3](../specs/33-gear-ledger.md#3-ux) requires the public-notes workflow and
explicit error states. Its [data model](../specs/33-gear-ledger.md#5-data-model)
associates public notes with assets. These requirements were incomplete when a
newer failed note draft could disappear, a completed save could remain absent
from a reloaded form, or an absent note could resolve to an inherited object
member. Those observed faults are corrected in the authored source below.

The new actual-screen cases also establish that storage rejection retains the
draft and blocks the build, unreadable saved data is not overwritten, and a
history-write failure after file saving is visibly reported without a false
recorded revision. An explicit retry can record the still-available revision,
consistent with [AC-7](../specs/33-gear-ledger.md#2-users--stories).

The existing AC-6 guide/helper regressions passed in the combined focused scope.
This worker did not independently verify GitHub's current documentation or
publish a test site; owner H-33 and the separate publishing-guidance review remain
distinct. No additional feature or physical qualification is claimed.

## Confirmed faults and narrow corrections

### 1. A repeated note value lost the newest failed draft

For one asset, submit A, then B, then A while the first save remains pending.
The original callback removed a draft whenever its text equalled the completed
save's text. The first A could therefore delete the latest A draft. If B then
persisted and the last A failed, `commitEdits` found no remaining draft and the
preview built from B instead of reporting the unsaved latest edit.

The regression drives the production screen's input/change/navigation callbacks
and real browser Ledger API, with deferred acknowledgements. It checks the
persisted intermediate value, visible build error, retained editable latest
draft, and successful retry. The correction requires the acknowledging promise
to still own the asset's current save before it can remove the matching draft.
The queue itself retains per-asset ordering and independent writes for other
assets.

### 2. A reload could retire the row awaiting a note acknowledgement

Start a note save, return to Select gear, and show the cached screen again while
the save is pending. The list reload could replace `st.gear`; the later save
callback then updated the old captured row and removed its draft. The next
Privacy form showed an empty note even though persistence contained the saved
text.

Selection reload now waits for this screen's submitted note commits before
reading gear. A failed note does not prevent the list from loading: its draft
and visible error survive for correction or retry. No submitted write is
cancelled. A pending write can keep this reload waiting until that write settles;
the change does not introduce a timeout or backend rollback.

### 3. Browser notes were not isolated from inherited object members

The existing note lookup used ordinary property access on a plain object. Valid
catalog IDs sharing names with ordinary object members could produce inherited
function values as purported saved notes. This dictionary issue predates the
reviewed stack. The regression uses ordinary saved IDs, checks an initially
absent note, persistence/reload identity, and clearing one exact note.

The browser API now reads only own properties and defines saved note IDs as
enumerable writable data properties. JSON format, saved IDs and clearing
behavior are preserved. No prototype-mutation input, external target or
offensive probe was used.

## Executed verification

All reported executions used **Node 22.23.4**.

| Source / scope | Result |
| --- | --- |
| Original eight-file Ledger compatibility scope at `9c90091` | **71 passed / 0 failed**, 2,741.761017 ms |
| Clean initial two-case screen reproduction | **1 passed / 1 failed**, 230.886674 ms |
| Expanded seven-case screen baseline at `9c90091` | **5 passed / 2 failed**, 5,335.673499 ms |
| Corrected screen scope, with an additional failed-reload compatibility case | **8 passed / 0 failed**, 5,295.964914 ms |
| Dictionary API baseline, before its separate correction | **7 passed / 1 failed**, 95.96691 ms |
| Corrected dictionary/API scope | **8 passed / 0 failed**, 95.702703 ms |
| Final nine-file Ledger scope at `a767462` | **80 passed / 0 failed / 0 skipped / 0 cancelled**, 7,872.855089 ms |

Counts overlap and must not be added. The very first screen harness used a short
settle wait and produced an after-test cleanup error while a legitimate build
was still finishing. A condition-based visible-completion wait replaced it
before accepting the clean reproduction and seven-case baseline above. The
accepted baseline and final execution contain no such cleanup error.

Final command:

```sh
node --test --test-concurrency=1 \
  tests/ledger-note-write-queue.test.mjs \
  tests/ledger-api-durability.test.mjs \
  tests/ledger-note-persistence-screen.test.mjs \
  tests/ledger-ui.test.mjs tests/ledger-review.test.mjs \
  tests/ledger-review-bridge.test.mjs tests/ledger-verified-facts.test.mjs \
  tests/ledger.test.mjs tests/ledger-leak.test.mjs
```

The final enclosing execution took 7.979016418 seconds and exited **0**.
All **1,548 tracked files** were hashed before and after; every hash matched,
and the checkout remained clean. Syntax checks passed for all four changed
application/test files, and whitespace checks passed.

| Executed file | SHA-256 |
| --- | --- |
| `app/ledger/api.js` | `2235337d2788b502e0d3b23caac7bb9535202721b2b570de93b42783343e4910` |
| `app/ui/screens/ledger.js` | `3c7b43eef55b24c86b3cf34bd577348d5385c053b8c11a25541f3d0a5fa6004c` |
| `tests/ledger-api-durability.test.mjs` | `67cebd59bcc2270a77b643fea70cd348e967f5b708c5533603df814c1cd84e0d` |
| `tests/ledger-note-persistence-screen.test.mjs` | `aa66b533df8cd8deae7032a8a6c8cae58e7443303b9c9011e408fe51efe79544` |

Final test-log SHA-256:
`d714d4aaa82754ca1147cb33f74207e1ebcbbde25b00c094b785af74bedb3bbb`.
Seven-case failing screen-baseline log:
`e00481d063e9a0816231aa25914a507ddb7c4e2bdae8f23598973c85513b7450`.
Failing dictionary-baseline log:
`d4c4da6dd1d4660a3cefc58da1b4493cd65edbf25c4ed7ee6ad9e0afdd50fcaa`.

## Limits and successor handoff

The screen tests use production callbacks and the production browser Ledger API
with a small DOM fixture, in-memory storage, deferred acknowledgements and an
injected file-save result. No browser was launched and no physical file download,
native/Rust backend, hardware, scanner or external probe was executed. These
tests do not establish cross-tab coordination, database snapshot isolation,
recovery of corrupt stored bytes, or long-term browser storage durability.
Read-only fallback behavior for unreadable browser data remains unchanged.

Root should integrate the two implementation commits in order, then this report,
and obtain fresh independent acceptance of `a767462` (or identical application
and test bytes). Review the acknowledgement ownership guard, reload wait/error
recovery, dictionary-safe note identity, and unchanged native dispatch. This
author must not self-approve those new corrections.

Root retains full combined qualification and hosted gates. Keep all published
candidates stable; preserve previous branches, the 20 MiB ZIP cap, timing/security
gates, physical qualification and Fleet default-off. No remote publication,
release, deployment, tag, history rewrite or branch deletion occurred here.
