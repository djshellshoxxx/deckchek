# Mapper browser storage — fresh code audit

Reviewer: `/root/mapper_storage_code_round9`. Date: 21 November 2026, UTC.
This lane began after all three round-eight final handoffs. Review is limited
to source and retained data; this reviewer has executed no project, test,
syntax, browser, native, scanner, probe or packaged-verifier code. Root owns
product fixes, execution authorization, publication and merging.

**No material source or retained-evidence blocker was found in the scoped
Mapper change.** The designated worker's first focused run produced 96 tests:
95 passed and one optional Mixxx corpus skip. I independently verified its final
package against the originals and immutable Git blobs. The preceding full-suite
failure remains a qualification hold; the separately qualified PR #79 does not
qualify later changes.

## Source identities and scope

| Item | Identity |
| --- | --- |
| Completed round-eight integration / fixed comparison | `d32ab0f1d302a2f271f6e850da27085d6df85370` |
| Mapper implementation | `e408a5c3cdb30afa8405360df595f5ea4e1db71e` |
| Reviewed preparation | `6b8a2b29e7971a02c959e4da50bcad4363480a86` |
| Complete preparation tree | `2310fbe5335b7b3ae79acb7066f6a35891e1d9db` |
| Tracked source / top-level test files | `2315` / `201` |

The three-dot comparison from the completed integration contains exactly seven
paths, with 319 insertions and 10 deletions: the browser Mapper store, Mapper
screen, implementation note, existing DOM fixture, one changed legacy assertion
and two new regression files. The source worktree was clean at initial review.
I read the changed production paths, relevant consumers and sanitization/version
guards, both new test files, the fixture, prior Mapper regressions, implementation
note, current handoff and FS-32. Supplied
[issue #82](https://github.com/djshellshoxxx/deckchek/issues/82) is the acceptance
contract for this correction. No user-data-loss incident or executed baseline
reproduction is claimed.

## Specification review

**Read failure is distinct from empty storage.** In
[`app/mapper/store.js`](../../app/mapper/store.js), only a `null` result from
browser `getItem` represents an absent key. Missing access, a throwing storage
getter/read, non-string data, invalid JSON, a non-array container or an
invalid/ambiguous row produces `MapperStorageError` with code
`MAPPER_STORAGE_READ`. Validation covers the row record, nonempty string
identity, duplicate identities, string name, model record and integer version.
The collection is neither filtered nor repaired during loading.

**Failed reads cannot become write inputs.** Browser `save` and `remove` call
`load` before constructing a replacement collection or invoking `persist`.
There is no asynchronous gap inside either browser read/write path. A read
failure exits before `setItem`; a missing/blocked writer raises an error instead
of returning success. Every mutation reads again, so an earlier valid list does
not authorize writing over subsequently unreadable storage. Unknown fields on
untouched rows survive ordinary saves and deletes. Successful serialization can
change formatting; exact-byte preservation applies to refused mutations.

**Compatibility and limits remain in place.** Lazy browser-storage resolution
occurs only in the browser branch. Native save/list/get/delete retain their
commands and argument shapes, newer-version error translation and other-error
passthrough. Untouched future-version fields survive another mapping's changes.
The existing overwrite refusal still checks the incoming and supported versions.
The 50-row cap still rejects a new mapping without evicting one and permits
editing an existing row at the cap. Row-container checks do not replace the
existing model sanitizer or claim exhaustive future-schema validation.

**Unavailable lists remain visible without clearing the draft.** In
[`app/ui/screens/mapper.js`](../../app/ui/screens/mapper.js), the saved selector
distinguishes loading, confirmed empty and unavailable states. Open and Delete
are disabled while loading or after a failed list read, with matching callback
guards. A separate text notice and Retry action survive editor-status changes.
Failed saves retain the draft; successfully restoring access/data and retrying
refreshes the list without replacing the editor. Export retains its independent
file-export path.

**Refresh ownership covers success, failure and completion.** Each saved-list
request captures a generation. An older rejection cannot replace a later
successful list, and an older success cannot clear a later error. The matching
generation owns loading completion and Retry re-enablement. Initialization
precedes the screen's initial requests. Existing model-save generation handling
remains separate, preventing a delayed native save from assigning its identity
to a different editor model.

## Standards and test-design review

The implementation stays within the existing store/screen structure and adds
no package, command, permission, feature flag or export-format change. Error
publication uses text content. No audio implementation, threshold or numerical
test changes. No new maintainability or scope violation is blocking.

The eight new API tests import the real store. Refusal checks assert both zero
write calls and unchanged original bytes. Invalid model/name rows use identities
distinct from their valid neighbour, so duplicate detection cannot mask the
field under test. Existing tests retain the cap and native command/version
contracts. The legacy corrupt-as-empty assertion is deliberately replaced by
the typed rejection required by issue #82.

The three new screen cases import the production Mapper screen and cached shell
navigation. The fixture injects storage and browser/native mode before screen
creation, then restores global descriptors. It does not reimplement the store.
Cases cover visible failure, failed/successful Retry, draft retention, zero
recovery writes, first save and an older failed list after a newer success.
The DOM fixture models callbacks and disabled controls; it does not establish
layout, accessibility-tree, browser-storage permission or native-app behavior.

## Functional evidence

The designated functional worker recorded one serial Node run on the unchanged
preparation. The exact argv selects all **11** actual and tracked
`tests/mapper*.test.mjs` files; the complete top-level inventory contains 201
files. It includes the existing Mapper lifecycle, model, cap, native contract,
version, import/export and parser regressions as well as the new storage cases.
Every ordered TAP header, outcome, plan and footer agrees with the retained
result. New screen cases **63–65** and service cases **66–73** all passed.
Case 29 alone was skipped because `MIXXX_CONTROLLERS_DIR` was not set.

| Measure | First focused outcome |
| --- | --- |
| Runtime | Node `v24.22.3`, Linux x64 |
| Started / completed record, UTC | `2026-11-21T10:39:06.738132+00:00` / `2026-11-21T10:39:08.995233+00:00` |
| Project process elapsed | `2.172575306001818` seconds |
| Budget / exit / timeout | `120` seconds / `0` / `false` |
| Tests / pass / fail / skip | `96` / `95` / `0` / `1` |
| Cancelled / TODO | `0` / `0` |
| Complete TAP | `22683` bytes |
| Project and Node metadata stderr | Empty |
| Before/after source | Same HEAD/tree, clean; all `2315` paths unchanged |

I read the complete original recorder and configuration, and checked the
retained copies against their original bytes. The recorder refuses an existing
output directory, selects the explicit sorted array without a shell wildcard,
captures complete maps/inventories and caps execution at 120 seconds. Its
recorded guards reject `NODE_OPTIONS`, audio diagnostic variables and the
external Mixxx corpus; its only environment change prepends the absolute Node
directory to `PATH`. The runtime stdout agrees with the result's complete runtime
object. The initial `running.json` fields agree with the completed result.
No full-suite, separate syntax, build, browser/native launch or diagnostic result
is credited to this round.

### Independent final-package verification

The frozen [manifest](evidence/mapper-storage-functional-2026-11-21/manifest.json)
contains exactly **19** file entries, excluding itself. I checked every entry's
size and SHA-256, all **16** byte-exact original copies and all **18** original-path
bindings. No additional file is omitted from the manifest. The complete
[first TAP](evidence/mapper-storage-functional-2026-11-21/focused/run.tap) and
[result](evidence/mapper-storage-functional-2026-11-21/focused/result.json)
remain the original observations.

Using independent, data-only checks, I read the frozen tree with `git ls-tree`
and every immutable blob with `git cat-file --batch`. Both complete 2,315-file
before/after hash maps equal those blob digests, not only each other. Every
entry of `source-git-object-map.json` also matches its path, mode, blob identity,
byte length and SHA-256. Both saved inventories equal the complete immutable
path list, and the original source paths still contain those bytes. The exact
11-file Mapper selection and 201-file top-level selection agree with the tree.

All seven implementation paths are byte-identical between implementation
commit `e408a5c` and tested freeze `6b8a2b2`. I independently checked the source
proof's complete comparison to the preceding full gate: its non-documentation
delta is exactly the six Mapper production/fixture/test paths. The ordered
summary preserves all 96 original outcome lines and their exact TAP line
positions. Each summary field agrees with the raw result; its complete-source
disposition remains held. The separate functional report's retained SHA-256 is
`26c14f4fe228fff9f62326e7453b1f9e37d49a4a1c7ab8909e85317a9c907f51`.

The functional handoff is immutable commit
`f2c8ff048fc17a99e2c7e8d0bc33fc5aaf5c2525`, tree
`6fa5ff927765ceb150e0853fd7eb9cdae6a5516d`, with the tested freeze as its exact
parent. I checked that its 21 changed paths are only the functional report and
owned evidence directory, and that every committed byte matches the package
verified above.

| Artifact | Independently checked SHA-256 |
| --- | --- |
| Final manifest | `34dead9fbfed2f95ccbc846429dd2a70c73aecf91602daccbd291da906fd1403` |
| First result | `aec949a3e07ecc3e215cbda1757e109a2f292ff90e16f7e78b08a93879070573` |
| Complete first TAP | `a7ce4569e08502e72b076fd71ded003174543d507a6a2c4bf8a739907da14c41` |
| Before/after source maps, each | `d38a0d7cc7bb0ff494c72000834e133fd3be5566dfe19eccb204763097d8615e` |
| Complete Git object map | `9ac935a6765d8e03c5afe58eeb2c7af584da3583a1aebcab4918b5f240f6b450` |
| Original recorder | `38081ab6149b268403e270c5745a01dc312b725f4affb70c56a15284549d3c6c` |
| Original configuration | `e765b2bb3c299c1b40e2027fde86e8196437c0a29a279fd5bbf18234dd3a6556` |

The current package contains the retained execution recorder and derived JSON
proof, rather than a separate verifier program. I read that recorder and the
inherited round-eight `verify-evidence.py` as source; neither was executed by
this reviewer. The independent checks above process retained files and Git
objects only.

## Preserved qualification boundary

The previous first full run belongs to
`e5614ff1b8f7691e8193283a9b6ba01d5a7072ed`, tree
`b650f03ed07bbce442b3616357e0d04086f7f1d4`: **2,395 tests, 2,393 passed,
one failed and one optional Mixxx skip**, exit 1 without timeout. The sole
retained failure is the final relative-gain assertion, reporting **−101 dB at
−30 dBFS**. Earlier −12 dBFS cap and selected −30 dBFS level assertions passed.
No numerical cause or repair is established. This lane performs no rerun or
diagnostic. The complete raw TAP remains 549,295 bytes, SHA-256
`f90ff51c2829b6eb9c172d0d1cda81e4e845f3d95706063764d2c56dbdbeec9a`.

PR #79 separately merged at `e36ddc41806b0f6639474f207e3b339e063a6e25`
after its applicable first-attempt gates. That acceptance belongs to its fixed
source/tree and does not transfer to this Mapper successor. Hosted/platform,
browser rendering and physical qualification remain separate. This change
supplies no automatic repair, data restoration or cross-tab transaction
isolation. Target-row model sanitization/reconstruction retains its previous
behavior. Later privacy planning and publication remain root-owned.
