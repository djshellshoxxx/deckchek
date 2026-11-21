# Mapper browser storage: static defensive security audit

Date: 21 November 2026. Review lane: round-nine static security.

## Decision and exact scope

The seven-file Mapper change has no material static security blocker, and its
retained first focused functional gate is independently verified. It closes
the identified collection-overwrite path: an unreadable or structurally invalid
saved collection cannot become the basis of a browser save or delete. This
finding is a source review, not a claim
that a real user lost data, a baseline reproduction, or broad release approval.

The source freeze reviewed is `6b8a2b29e7971a02c959e4da50bcad4363480a86`,
tree `2310fbe5335b7b3ae79acb7066f6a35891e1d9db`, with 2,315 tracked files,
201 top-level `tests/*.test.mjs` files and 11 Mapper test files. Its ordered
parents are `ea8d3df8194b5ad0bcaa583ea4ab5808c270eaa5` and
`d32ab0f1d302a2f271f6e850da27085d6df85370`. The worktree was clean at review.

The implementation is `e408a5c3cdb30afa8405360df595f5ea4e1db71e`, tree
`284f80b644b57c00df6cebf80f47eb0429e9a3a2`. Its seven changed files are
byte-identical in that implementation, the preparation commit and this review
worktree. The implementation contains two application files, four test/fixture
files and one explanation; it changes no permission, capability, dependency,
native command, export format or feature-default file.

| Reviewed file | SHA-256 |
| --- | --- |
| `app/mapper/store.js` | `a415dd3ad6a74780a6e09e9b3f210deab704bbad249c2522588117e122d6a0f4` |
| `app/ui/screens/mapper.js` | `2a47aff012014664fb226c45adf4701d567c22647242d5954f9feb585de1c9bf` |
| `docs/engineering/MAPPER_STORAGE_IMPLEMENTATION_2026-11-21.md` | `83ce432bc9ee85d4ed57e6dbaf65c38af95e99bb78bc96231cd71f2c791f3173` |
| `tests/fixtures/mapper-lifecycle-dom.mjs` | `af0b019c7ec068c1939c8a91cdc6de327115c75fa45580ac4417d4ac390218cf` |
| `tests/mapper-model.test.mjs` | `aa7a93616d54273389cfcad6d0cf5c3610af745f3fb2cf8bfaed0f319018a2fe` |
| `tests/mapper-storage-screen.test.mjs` | `1698acb670efba9892e132797031b05fa98ef314ac664322c9798808bfad2584` |
| `tests/mapper-storage.test.mjs` | `554174503c8965212549b8b4b8d7bac506f394911180f60bb426247591765595` |

The audit applied the Security and Hardening skill's input, output, data
preservation and least-privilege review guidance within the assigned static-only
boundary. No project code, tests, syntax checks, browser/native code, dependency
audit, scanner, probe, extracted implementation, vulnerability reproduction or
packaged verifier was executed by this lane. Git reads and independent Python
byte/hash inspection are data-only operations.

## Data-preservation boundary

`createMapperStore.load()` resolves browser storage only when a browser operation
needs it. Only `getItem(LOCAL_KEY) === null` means a genuinely absent collection.
A missing/throwing getter, missing `getItem`, a non-string result, malformed JSON
or a non-array value raises the dedicated `MapperStorageError` with code
`MAPPER_STORAGE_READ`. The catch returns a fixed plain-language message; it does
not echo the original storage exception or saved JSON.

Each parsed row must be a non-array object with a nonempty string identity,
string name, non-array model object and integer model version. A `Set` rejects
duplicate identities before any mutation. The validation walks the complete
collection and returns the original parsed rows, without filtering, rebuilding
or repairing them. A partially invalid collection therefore blocks as a whole.
Unknown properties and future model versions on untouched rows remain present.

Browser `save()` and `remove()` both invoke `load()` before constructing and
persisting their changes. A failed read cannot reach `setItem`. Every mutation
rereads the collection rather than trusting a successful earlier list. Missing
or blocked `setItem` also rejects instead of reporting successful persistence.
The existing refusal to overwrite a newer model and the refusal to insert a
51st model remain in the same mutation path; no eviction was introduced.

The guarantee is exact byte preservation when a mutation is refused for a read
failure. A successful intentional edit still serializes the collection using
the existing save path. The change does not provide cross-tab transactions,
automatic recovery, authentication or integrity protection for localStorage.
It does not claim that every semantically invalid model can be recovered;
existing `sanitizeModel()` warnings/read-only behavior still govern opening a
model. Explicit edits to the target row retain their existing reconstruction
semantics; preservation of unknown fields is established for untouched rows.

## Native and privacy boundaries

All four native operations take their existing invocation branch before
consulting browser storage. In particular, merely creating a native store no
longer evaluates a potentially throwing `globalThis.localStorage` getter.
The `mapper_model_save`, `_list`, `_get` and `_delete` argument shapes are
unchanged, as is the existing native newer-version error translation.

There is no new network, telemetry, clipboard, browser-data export, storage
enumeration, key deletion or automatic reset path. Browser writes remain scoped
to `deckchek.mapper.v1`. The error notice's suggestion to export refers to the
existing user-invoked current-model file export; it neither reads arbitrary
browser keys nor sends the unreadable collection elsewhere. No feature flag,
permission, native capability or security-policy expansion is in this diff.

## Recovery UI and draft preservation

The saved-list failure is represented separately from an empty list. The
selector shows "Saved mappings unavailable", and Open/Delete remain disabled.
Their callbacks also check loading/error state before attempting an operation.
The persistent notice is separate from the general editor status, so creating
or editing a draft cannot hide the saved-list failure.

New error text passes through the existing 300-character `capMessage()` limit
and `textContent`; saved names use `h(..., { text: ... })`. Inspection of
`app/ui/dom.js` confirms that `text` uses `textContent`, and string children use
text nodes. The existing trusted trash icon is the only `html` attribute moved
by this change. The notice uses the existing `[hidden]` CSS behavior and
`role="status"`; no untrusted markup sink is added.

Retry performs a single read per activation, disables itself while the current
read is pending and remains available after failure. There is no retry timer,
automatic retry loop, repair or write. This is an interaction bound, not a new
timeout or global limit on user actions. A generation token prevents an older
native completion from replacing the newer list, error or loading state.
Refreshing the list does not replace the current model, typed name, undo state
or export state. Existing save failure handling retains the draft. Successful
user-directed recovery can repopulate the list without writing storage.

## Coverage assessment from source

The eight new store cases cover absent keys and first persistence; malformed
and non-array values; partial invalid rows and duplicate IDs; blocked or absent
readers; a throwing default getter with native bypass; untouched metadata and
future models; mutation rereads; and blocked or absent writers. The invalid
name/model examples use a distinct second ID, so the duplicate check does not
mask those row-validation assertions. Refused mutations check both zero writes
and original bytes.

The three screen cases call the real Mapper screen through the existing small
DOM fixture. They cover the persistent failure state, retained draft, failed
and successful user Retry, a genuine empty store/first save, and an old failed
native list arriving after a newer successful refresh. The fixture injects
synthetic storage and restores prior global descriptors; it does not launch a
browser or contact a native bridge. Existing Mapper cases retain the 50-model
cap, valid operations, native argument contract and newer-version refusal.

These checks support the bounded change. They do not establish real-browser
rendering/accessibility, OS storage behavior, native database behavior or
physical MIDI/audio behavior. Static inspection of the fixed storage-error
construction supplies the non-disclosure finding; the test that inspects a
fresh error's message alone would not establish that property for arbitrary
future changes to the catch path.

## Retained first-gate evidence

The functional worker's first authorized focused gate ran the exact sorted 11
Mapper files on the frozen source. Its retained TAP has 96 consecutive ordered
outcomes: 95 passes, zero failures and one optional Mixxx corpus skip at case 29
because `MIXXX_CONTROLLERS_DIR` was not set. New screen cases 63–65 and new store
cases 66–73 all passed. Exit was zero; there was no timeout. The recorded project
execution lasted 2.172575306001818 seconds within the 120-second budget, from
2026-11-21T10:39:06.738132+00:00; the result was recorded at
2026-11-21T10:39:08.995233+00:00. No repeat execution is part of this evidence.

The retained invocation is the pinned
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` with
`--test --test-concurrency=1 --test-reporter=tap`, followed by the exact 11-file
selection. Version stdout and runtime JSON independently agree with the
running/result records: Node v24.22.3, Linux x64, recorded Python 3.12.14. The
configuration, recorder original/copy hashes, source commit/tree, cwd, branch,
arguments, runtime metadata and start/result fields agree. The record declares
no Node options, diagnostic overrides or external Mixxx corpus; its only
environment change is the fixed Node directory at the start of PATH.

| Retained original | Bytes | SHA-256 |
| --- | ---: | --- |
| `result.json` | 3,780 | `aec949a3e07ecc3e215cbda1757e109a2f292ff90e16f7e78b08a93879070573` |
| `run.tap` | 22,683 | `a7ce4569e08502e72b076fd71ded003174543d507a6a2c4bf8a739907da14c41` |
| `stderr.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `run-focused-node.py` | 7,843 | `38081ab6149b268403e270c5745a01dc312b725f4affb70c56a15284549d3c6c` |
| `authorized-selection.json` | 887 | `e765b2bb3c299c1b40e2027fde86e8196437c0a29a279fd5bbf18234dd3a6556` |
| `tracked-before.json` and `tracked-after.json`, each | 288,810 | `d38a0d7cc7bb0ff494c72000834e133fd3be5566dfe19eccb204763097d8615e` |
| `tracked-inventory-before.json` and `tracked-inventory-after.json`, each | 131,390 | `6a65a4a6b4c62bcf5e370ae95680de65465654fdb475af45d3017ed1fc2ab8e0` |

Independent data-only inspection compared both complete 2,315-path maps against
the bytes of every immutable Git blob at the source freeze and the review
worktree, not merely against each other. Both inventories contain the complete
sorted Git path set. All 201 top-level tests and the exact 11-file Mapper subset
match Git. All 96 TAP outcome indices, ordered names, statuses, summary counts,
the plan and the sole optional skip were inspected. The retained runtime probes
and the project run all have empty stderr. The functional worktree's before and
after status, HEAD and tree were unchanged in the retained first record.

The final [evidence manifest](evidence/mapper-storage-functional-2026-11-21/manifest.json)
has SHA-256
`34dead9fbfed2f95ccbc846429dd2a70c73aecf91602daccbd291da906fd1403`.
Independent Python/Git data inspection verified every one of its 19 entries,
all 16 original copies and all 18 original-path bindings. Its path set exactly
matches the package files other than the self-excluded manifest. Every retained
size, SHA-256 and original/copy byte comparison matched; no original raw file
was omitted.

The complete [Git object map](evidence/mapper-storage-functional-2026-11-21/source-git-object-map.json)
also matches every frozen path's mode, blob identity, byte count and SHA-256:
2,315 paths, 2,130 distinct blobs and 70,345,323 source bytes. The independent
review used `git ls-tree -rz --full-tree` and `git cat-file --batch` to read
immutable source bytes, then hashed those bytes without loading any project
module. Both maps and inventories match that complete map, and both the
functional and security worktrees' frozen paths match the same bytes.

The [source proof](evidence/mapper-storage-functional-2026-11-21/source-proof.json)
correctly identifies all seven unchanged implementation paths and all 43
changed paths since the preceding full gate. Its six non-documentation paths
are exactly the Mapper store/screen and four test/fixture files. The
[observed summary](evidence/mapper-storage-functional-2026-11-21/observed-summary.json)
matches every original outcome line, title, status, index, TAP line position
and skip reason, not just aggregate counts. Its first-command, no-rerun,
source, elapsed-time and earlier-hold records agree with the retained data.

| Derived evidence | SHA-256 |
| --- | --- |
| Complete Git object map | `9ac935a6765d8e03c5afe58eeb2c7af584da3583a1aebcab4918b5f240f6b450` |
| Source proof | `181ea704e2ecabbc7cf0aa8dfd21cdc62ebbdbec5030bce125c654bd383f3cf3` |
| Ordered observed summary | `4c8bf69f027404d3da84907a709517a86a5e0b19ff8af9a30de81403f7044ac3` |

The evidence and functional report were committed as exactly 21 owned paths in
`f2c8ff048fc17a99e2c7e8d0bc33fc5aaf5c2525`, tree
`6fa5ff927765ceb150e0853fd7eb9cdae6a5516d`, parent
`6b8a2b29e7971a02c959e4da50bcad4363480a86`. All 21 committed blobs were
independently compared with the reviewed package after that commit and matched.
The stable 13,314-byte functional report has SHA-256
`26c14f4fe228fff9f62326e7453b1f9e37d49a4a1c7ab8909e85317a9c907f51`
and states the same bounded result and complete-source hold. No project or
packaged-verifier execution was performed by this lane. The final package has
no integrity or qualification-scope blocker.

## Earlier qualifications and holds

Qualified PR #79 merged as `e36ddc41806b0f6639474f207e3b339e063a6e25`.
That separately qualified tree does not qualify this later source. The earlier
frozen `e5614ff1b8f7691e8193283a9b6ba01d5a7072ed` full-source gate remains
HELD: first observation 2,395 total / 2,393 pass / one failure / one optional
skip. Case 53 retained final relative gain of -101 dB at -30 dBFS, after its
earlier playback-level assertions passed. No numerical cause or repair is
established here, and a Mapper-only pass cannot clear that hold.

This report does not change Fleet's default-off state, privacy planning,
retention policy, feature gates, permissions or release status. Root owns any
fixes, broader CI, publication, guarded merges and the distinct later privacy
work. All three round-nine FINALs must complete before a fresh rotation.
