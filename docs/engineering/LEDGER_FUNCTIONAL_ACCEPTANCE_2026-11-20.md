# Ledger independent functional acceptance — 20 November 2026

Worker: `/root/ledger_functional_acceptance_fresh`. Dates use America/Vancouver.

## Disposition

**Accepted for the assigned functional scope.** Independent source inspection and
one focused execution found no remaining blocker in the corrected note-operation
ownership, save-before-reload behavior, browser note identity, or their storage
failure/retry paths. The selected **28 tests passed**, with no failures,
cancellations, skips or TODOs. No production or test changes were necessary.

This is fresh acceptance of the corrections, not the author's self-review. Root
still owns combined qualification, hosted gates and integration. The result does
not qualify a browser installation, native persistence or physical hardware.

## Exact reviewed and executed source

| Role | Identity |
| --- | --- |
| Comparison base | `9c90091be33fa58085bff80b34121d8cf4053a3a` |
| Frozen acceptance source | `e04d6332185063b62c75f0e2cabdc1654a719079` |
| Frozen source tree | `88b3f2c43967ae3695d9974a8b69b7be5b6bd6c2` |
| Branch | `review/deckchek-ledger-functional-acceptance-20261120` |
| Author screen correction | `31b2af83839c18ec5fb5123ce6743e3bcb22ece9` |
| Author final corrected application/test source | `a76746213a7fccf652c8f660029f7b1e51e7c7c3` |

The author report was read directly from
`265a3156c84d16d2c20dde6ed609573d99e3650b:docs/engineering/LEDGER_BUG_HUNT_2026-11-20.md`.
Its previously observed failing baselines and 80-case result are author evidence;
they were not reproduced or counted as executions by this worker.

An independent `git diff --exit-code` against `a767462` returned zero for all
eight application, test and fixture files in the hash table below. The accepted
implementation and the tests executed here therefore match those authored bytes.
The frozen acceptance tree includes separate review/documentation additions.

## Functional findings

Inspection covered the production Ledger screen's `saveNote`, `commitEdits`,
`load`, preview/export snapshots and navigation callbacks; the keyed write queue;
and the browser API's strict mutation reads, persistence errors and note lookup.
The existing actual-screen tests invoke production callbacks with the production
browser Ledger API, a small DOM fixture and controlled asynchronous writes.

| Acceptance risk | Independent evidence and conclusion |
| --- | --- |
| An earlier A acknowledgement removes a newer A draft after A → B → A | The screen regression leaves B persisted, rejects the final A, checks a visible build error and the retained A draft, then retries A successfully. The source checks promise ownership as well as text equality before clearing a draft. Accepted. |
| An earlier failed write prevents a newer save from completing | Screen and queue tests show the successor still runs, preview waits for its completion, and its persisted value becomes the effective note. The queue preserves each caller's rejection. Accepted. |
| Selection reload reads before a submitted save completes | The production Escape/reopen path is exercised while a save is pending. After completion, both storage and the reopened Privacy field contain the saved value. `load()` waits for `commitEdits()` before requesting the replacement gear list. Accepted. |
| Failed save loses its draft or leaves reload unusable | The storage-rejection and failed-reload cases preserve the editable draft and expose an error; restoring storage allows retry and then preview. `load()` retains the returned note error while still loading the selection. Accepted. |
| One unit's delayed save blocks other units or changes write order | Queue and actual-screen cases verify same-unit submission order and an independently persisted note for another unit before the held write completes. Accepted. |
| Missing, blocked or unreadable storage falsely reports successful persistence | API cases reject note/history writes; malformed or unreadable prior data receives zero writes. The screen cases block preview and download when notes cannot be saved. Accepted. |
| Export history claims success after file saving but failed history persistence | The actual screen displays an export error without a success state; history remains empty and the next revision stays available. Explicit retry saves again and records that revision once. Accepted. |
| Ordinary saved IDs accidentally resolve inherited object members | The API case checks initially absent notes, persistence through a fresh API instance, and clearing one exact note for ordinary object-property-name IDs. Own-property lookup and data-property writes preserve identity. Accepted. |
| Existing revision and native bridge contracts change | The existing UI/API cases retain monotonic browser revisions, rejection of stale revisions, history reload and native command/argument routing through injected test doubles. Accepted at the JavaScript contract level. |

These findings support the note-edit/error-state workflow and export-history
requirements in [FS-33](../specs/33-gear-ledger.md). The recovery guidance in the
three browser storage errors was also inspected: it retains edits or an exported
file and gives a storage-access or data-preservation next step. The separate code
and security workers own their respective acceptance decisions.

There is no separate Ledger lifecycle test file in the repository. The relevant
pending-save, navigation, reopen and failed-reload lifecycle cases are in
`ledger-note-persistence-screen.test.mjs`; unrelated screen lifecycle suites were
not rerun. The existing cases resolved the assigned acceptance risks, so no new
test or production correction was justified.

## Executed verification

Worktree:
`/workspace/scratch/6f2247f2f463/deckchek-ledger-functional-acceptance`

Runtime: **Node v22.23.4**, using the explicit managed executable below. No new
dependencies were installed.

```sh
/workspace/scratch/6f2247f2f463/toolchain/node_modules/node-linux-x64/bin/node \
  --test --test-concurrency=1 \
  tests/ledger-note-write-queue.test.mjs \
  tests/ledger-api-durability.test.mjs \
  tests/ledger-note-persistence-screen.test.mjs \
  tests/ledger-ui.test.mjs
```

The four-file run exited **0**: **28 passed / 0 failed / 0 cancelled / 0 skipped /
0 TODO**, TAP duration **5,645.274816 ms**. Its enclosing subprocess took
**5.829390160 seconds**. This was one execution; these cases overlap the author's
80-case scope and must not be added to that count or other workers' results.
The full JavaScript suite and unrelated unchanged audits were not repeated.

The checkout was clean before and after execution. All **1,550 tracked files**
were SHA-256 hashed before and after; every hash matched. This tracked-file count
belongs to the frozen acceptance tree and is distinct from the author's 1,548-file
tree. `git diff --check 9c90091be33fa58085bff80b34121d8cf4053a3a HEAD` also passed.
The later addition of this report does not change the executed application/test
bytes.

| Executed or inspected file | SHA-256 |
| --- | --- |
| `app/ledger/api.js` | `2235337d2788b502e0d3b23caac7bb9535202721b2b570de93b42783343e4910` |
| `app/ui/screens/ledger.js` | `3c7b43eef55b24c86b3cf34bd577348d5385c053b8c11a25541f3d0a5fa6004c` |
| `app/ledger/write-queue.js` | `362f81caa455117738a539fae46904b9e969996ea080207f380b362369ad9049` |
| `tests/ledger-note-write-queue.test.mjs` | `cd890dd684387846fe1cd65ae1faab31a99252d0d176b31ff8335ae2ac166eca` |
| `tests/ledger-api-durability.test.mjs` | `67cebd59bcc2270a77b643fea70cd348e967f5b708c5533603df814c1cd84e0d` |
| `tests/ledger-note-persistence-screen.test.mjs` | `aa66b533df8cd8deae7032a8a6c8cae58e7443303b9c9011e408fe51efe79544` |
| `tests/ledger-ui.test.mjs` | `96c89023883e247c0b94fca55eaef999359820791a9758544c432133afd52f8c` |
| `tests/fixtures/service-screen-dom.mjs` | `bc15944a7bdf82b080d6de181c46442921557411f49f8faa737168cce61a425c` |

Local execution artifacts use the prefix
`/workspace/scratch/6f2247f2f463/ledger-functional-acceptance-focused`:

- `.tap`: test output; SHA-256
  `6e602594ea8cb15d94fdcc92008e486f402e51e507cf9db633731e23298d16b3`.
- `.sha256`: tracked-file manifest; SHA-256
  `2ec342a60673b50067ea736689dc4eb7497ae91e86adeaed50734804e36d6b14`.
- `.json`: source/runtime/command/result metadata from the execution wrapper.

## Limits and root handoff

The screen fixture does not launch a browser. Storage is in memory, API writes
are controlled with deferred promises, and file saving is injected. The native
checks exercise JavaScript dispatch with a test double, not Rust or a database.
No actual download, site publication, external probe, scanner or hardware run
occurred. These results do not establish cross-tab coordination, crash/tab-close
durability, recovery of corrupt bytes or database snapshot isolation.

The reload wait deliberately preserves submitted writes and has no new timeout;
a write that never settles can keep that reload waiting. Read-only fallback for
unreadable browser data remains unchanged. Owner H-33 publishing/privacy
qualification and the outstanding hosted/native gates remain outside this
acceptance.

Root may integrate this report-only commit after the independent code and
security acceptances complete. Qualify the combined tree once at the required
gates; do not infer whole-application or release acceptance from this focused
result. No remote write, deployment, feature-flag change, limit relaxation,
history rewrite or branch deletion was performed by this worker.
