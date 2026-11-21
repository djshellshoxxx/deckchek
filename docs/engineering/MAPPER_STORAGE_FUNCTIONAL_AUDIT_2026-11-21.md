# Mapper browser storage — fresh functional audit

Reviewer: `/root/mapper_storage_functional_round9`. Date: 21 November 2026,
UTC. All three round-eight workers completed their final handoffs before this
fresh round began. This lane was the sole project executor for round nine.

## Disposition

**The first focused Mapper gate passed.** The complete, actual and tracked
11-file Mapper selection produced **96 tests: 95 passed, zero failed and one
optional Mixxx corpus test was skipped**. The process exited 0 without a
timeout in 2.172575306001818 seconds. All 2,315 tracked files, the complete
inventory, HEAD, tree and clean checkout status remained unchanged across the
command. All eleven newly authored storage and actual-screen callback cases
passed. No project command was repeated.

Static review found no material functional blocker in the seven-file storage
implementation. The store refuses unreadable collections before a mutation can
persist them, and the screen keeps an unavailable saved list distinct from an
empty one. The current editor survives a failed save and list recovery.

**Complete-source qualification remains HELD.** The preceding complete gate
at `e5614ff1b8f7691e8193283a9b6ba01d5a7072ed` retained 2,395 tests: 2,393
passed, one failed and one was skipped. Its audio-session case 53 reached a
final relative-gain assertion of **−101 dB at −30 dBFS**. This focused Mapper
run does not exercise that assertion or establish an audio repair. The
qualified PR #79 merge at `e36ddc41806b0f6639474f207e3b339e063a6e25` remains
a separate source qualification.

The [first result](evidence/mapper-storage-functional-2026-11-21/focused/result.json),
[complete TAP](evidence/mapper-storage-functional-2026-11-21/focused/run.tap)
and [ordered outcomes](evidence/mapper-storage-functional-2026-11-21/observed-summary.json)
retain this run and its exact scope. The earlier full-gate result remains in
[the completed round-eight record](evidence/quick-layout-functional-2026-11-21/full/result.json).

## Source, ownership and authorization

| Item | Identity |
| --- | --- |
| Seven-file implementation | `e408a5c3cdb30afa8405360df595f5ea4e1db71e` |
| Completed round-eight integration | `d32ab0f1d302a2f271f6e850da27085d6df85370` |
| Tested clean source | `6b8a2b29e7971a02c959e4da50bcad4363480a86` |
| Tested complete tree | `2310fbe5335b7b3ae79acb7066f6a35891e1d9db` |
| Tracked source files | 2,315 |
| Actual and tracked top-level test files | 201 |
| Selected actual and tracked Mapper test files | 11 |
| Branch | `review/deckchek-mapper-storage-functional-20261121` |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-mapper-storage-functional` |

Root owned the implementation and all potential product fixes. This lane
changed only this report and `evidence/mapper-storage-functional-2026-11-21/`,
after the recorded command had finished and saved its clean final source
snapshot. All seven implementation paths are unchanged between their original
implementation commit and the tested freeze. Relative to the preceding
complete-gate source, the non-documentation delta consists only of the Mapper
store, Mapper screen, lifecycle fixture, legacy model test and two new storage
test files. The [source proof](evidence/mapper-storage-functional-2026-11-21/source-proof.json)
retains these comparisons and their complete path lists.

The functional, code and security reviewers each confirmed the frozen source
before execution. Root fully read the external recorder and configuration,
independently checked their hashes and the clean source selection, and then
authorized the following exact invocation once:

```bash
python3 -u /workspace/scratch/6f2247f2f463/deckchek-mapper-storage-round9-gate.py /workspace/scratch/6f2247f2f463/deckchek-mapper-storage-round9-focused-config.json
```

It ran with Bash, `login:false`, in the worktree above. Both files and the
original output directory were outside the checkout. The recorder refused an
existing output path. Static Python parsing of the recorder and JSON selection
inspection preceded authorization; no project code ran during preparation.

## Functional source review

Issue #82 concerns the browser store's previous treatment of parse/read errors
as an empty collection, and its filtering of invalid rows before later writes.
This audit reviewed the replacement implementation and its tests. It did not
execute a baseline data-loss reproduction or establish an actual user-loss
incident.

The new `load()` treats only a missing key (`getItem` returning `null`) as an
empty collection. It requires a JSON array whose rows have distinct nonempty
string IDs, string names, record-shaped models and integer model versions.
Malformed data, non-array values, invalid rows, duplicate IDs, missing storage
and failed reads produce `MapperStorageError` with code
`MAPPER_STORAGE_READ`. It refuses the complete collection instead of filtering
rows. Save and delete each call `load()` before their write and reread the
current storage on every mutation.

Untouched valid rows retain their unknown metadata and future model fields
when another mapping changes. The existing newer-version overwrite guard and
50-mapping cap still apply. The new behavior does not claim to preserve unknown
fields when the user deliberately edits and resaves that same row through the
existing model editor. Missing or failing `setItem` rejects the operation
instead of reporting persistence.

Browser storage is resolved only when a browser operation needs it. A throwing
default `localStorage` getter therefore does not prevent native commands. The
save/list/get/delete command names, argument shapes and native version-error
mapping are unchanged, and existing tests exercise those contracts.

The screen now owns stable saved-list controls and a separate persistent
status/Retry notice. It disables Open/Delete and the selector while loading or
after a failed list read. A failed read shows “Saved mappings unavailable”; an
absent key shows “No saved mappings.” Save remains available for the current
draft, with the existing failed-save status retaining that draft. A successful
Retry refreshes the saved list without replacing the editor. The generation
guard prevents older list success or failure from taking ownership of a newer
refresh. The new screen regression directly exercises the older-failure case.

The fixture imports the actual Mapper screen and shell navigation, supplies
browser storage or a controlled native bridge, and drives the real callbacks.
It restores substituted globals after each test. Its minimal DOM intentionally
ignores callback promises like DOM events do, and its click helper respects
disabled controls. These tests establish callback behavior in that fixture;
they do not establish rendering, layout, real browser storage policy, physical
MIDI behavior or a launched native application's behavior.

## First focused gate and coverage

The recorder invoked the absolute Node executable with `--test`,
`--test-concurrency=1`, `--test-reporter=tap` and the exact sorted file array in
the [authorized selection](evidence/mapper-storage-functional-2026-11-21/focused/authorized-selection.json).
No shell wildcard selected the files. Before invoking Node, it required
equality between all actual and tracked top-level tests, verified that total
was 201, and required the explicit 11-file Mapper selection to match both the
actual and tracked `tests/mapper*.test.mjs` inventories.

| Selected test file | Ordered cases | Observed result |
| --- | --- | --- |
| `mapper-followups.test.mjs` | 1–6 | 6 pass |
| `mapper-lifecycle.test.mjs` | 7–17 | 11 pass |
| `mapper-mixxx.test.mjs` | 18–29 | 11 pass, 1 optional skip |
| `mapper-model.test.mjs` | 30–45 | 16 pass |
| `mapper-profile-identity.test.mjs` | 46–50 | 5 pass |
| `mapper-regressions.test.mjs` | 51–62 | 12 pass |
| `mapper-storage-screen.test.mjs` | 63–65 | 3 pass |
| `mapper-storage.test.mjs` | 66–73 | 8 pass |
| `mapper-ui.test.mjs` | 74–81 | 8 pass |
| `mapper-vdj.test.mjs` | 82–89 | 8 pass |
| `mapper-xml.test.mjs` | 90–96 | 7 pass |

The newly authored coverage passed as follows:

| Behavior | Passing cases |
| --- | --- |
| Persistent unavailable-list notice, disabled Open/Delete, retained draft on failed save, failed Retry, successful recovery and explicit Open | 63 |
| Genuine empty UI and visible first durable save | 64 |
| Older failed native list cannot replace a newer successful refresh | 65 |
| Absent key supports list/get, first save and delete | 66 |
| Malformed/non-array values reject list/get/save/delete with zero writes and unchanged bytes | 67 |
| Mixed invalid rows and duplicate identities refuse the entire collection with zero writes | 68 |
| Blocked reads and missing browser storage reject all operations | 69 |
| Throwing default storage getter is a typed browser failure and is bypassed by all four native operations | 70 |
| Valid sorting, future-version protection and preservation of untouched metadata/model fields | 71 |
| Mutations reread storage after an earlier valid list and recover after user-directed restoration | 72 |
| Blocked or absent `setItem` cannot report save/delete success | 73 |

Existing passing cases also cover the 50-mapping cap, native request shapes,
native version-error mapping, Mapper save ownership, learned-map profile
identity, import/export formats and the parser's existing defensive cases.
Case 29 was skipped because `MIXXX_CONTROLLERS_DIR` was absent. No external
controller corpus was read.

| Execution item | Recorded value |
| --- | --- |
| Runtime | Node v24.22.3, Linux x64; Python v3.12.14 |
| Absolute executable | `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` |
| Started, UTC | `2026-11-21T10:39:06.738132+00:00` |
| Completed record, UTC | `2026-11-21T10:39:08.995233+00:00` |
| Project process elapsed | 2.172575306001818 seconds |
| Budget | 120 seconds, TERM at 115 and KILL by 120 if needed |
| Exit / timeout | 0 / false |
| Total / pass / fail / skip | 96 / 95 / 0 / 1 |
| Cancelled / TODO | 0 / 0 |
| TAP | 22,683 bytes |
| Project stderr | Empty |
| Node metadata stderr | Empty for both retained metadata commands |
| Source integrity | All 2,315 hashes and inventory unchanged; same HEAD/tree; clean |

`NODE_OPTIONS`, `DECKCHEK_AUDIO_CONTEXT_PATH`, every `DECKCHEK_AUDIO_FIT_*`
variable and the optional corpus variable were absent. The recorder's only
environment change prepended the absolute Node directory to `PATH`. The full
runtime metadata and its original stdout/stderr bytes are retained alongside
the original recorder and configuration.

## Evidence integrity and handoff

The frozen [manifest](evidence/mapper-storage-functional-2026-11-21/manifest.json)
contains 19 file entries, excluding itself: 16 byte-exact original copies and
three derived data files. Its 18 original-path bindings include all raw output
files plus the original external recorder and configuration. Both complete
before/after maps and inventories are preserved, along with full first TAP,
stderr, runtime streams, command metadata and the selected file inventories.

The [Git object map](evidence/mapper-storage-functional-2026-11-21/source-git-object-map.json)
records every tested path's immutable Git blob, mode, byte length and SHA-256.
A data-only verification read all 2,315 blobs from the frozen commit with
`git cat-file --batch` and matched each one against both original source maps
and the still-clean checkout. The ordered summary preserves all 96 consecutive
outcome lines, including the skipped case and each line's position in the
original TAP. It does not replace or filter the original stream.

| Artifact | SHA-256 |
| --- | --- |
| Evidence manifest | `34dead9fbfed2f95ccbc846429dd2a70c73aecf91602daccbd291da906fd1403` |
| First result | `aec949a3e07ecc3e215cbda1757e109a2f292ff90e16f7e78b08a93879070573` |
| Complete first TAP | `a7ce4569e08502e72b076fd71ded003174543d507a6a2c4bf8a739907da14c41` |
| Before and after source maps, each | `d38a0d7cc7bb0ff494c72000834e133fd3be5566dfe19eccb204763097d8615e` |
| Immutable Git object map | `9ac935a6765d8e03c5afe58eeb2c7af584da3583a1aebcab4918b5f240f6b450` |
| Source proof | `181ea704e2ecabbc7cf0aa8dfd21cdc62ebbdbec5030bce125c654bd383f3cf3` |
| Ordered outcomes | `4c8bf69f027404d3da84907a709517a86a5e0b19ff8af9a30de81403f7044ac3` |
| Original recorder | `38081ab6149b268403e270c5745a01dc312b725f4affb70c56a15284549d3c6c` |
| Original configuration | `e765b2bb3c299c1b40e2027fde86e8196437c0a29a279fd5bbf18234dd3a6556` |

The code and security peers receive this stable package for their independent
retained-data checks and final reports. The package's raw copies, derived data
and manifest remain frozen during that review.

No full suite, separate syntax gate, build, browser/native launch, network
probe, installer or numerical diagnostic collector was run by this lane.
There is no baseline execution, retry, hidden replacement outcome, threshold
change, feature enablement, workflow change, release or deployment. Recovery
remains user-directed; automatic repair and cross-tab transaction isolation
are outside this implementation's claim. Further project execution requires
a distinct root authorization tied to a concrete remaining risk.
