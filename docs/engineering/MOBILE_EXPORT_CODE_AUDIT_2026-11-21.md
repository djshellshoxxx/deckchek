# Mobile export details — fresh code audit

Reviewer: `/root/mobile_export_code_round7`. Date: 21 November 2026, UTC.
All three round-six final handoffs preceded this fresh review. This lane read
source, immutable Git objects and retained data only. It executed no project,
test, syntax-check, browser, native or extracted implementation code and made
no product, test or remote change. Its sole owned file is this report.

## Disposition and exact scope

The corrected Mobile export-details source has no remaining blocker identified
by this code review. A concrete write-failure path found in the first preparation
was corrected before the official build and final source freeze. The first
focused gate passed all **45 cases**, and the separate smoke syntax check passed.
Their final retained evidence package has been independently verified. **Complete-source
qualification remains HELD:** the preceding complete gate has two unresolved
audio-test failures. A scoped Mobile result cannot clear that hold or qualify
the separate fixed PR #79 source. Root owns publication, further qualification
and merge decisions.

| Source | Commit | Complete tree |
| --- | --- | --- |
| Fixed PR #79 comparison | `f76908766d53992e20382b9cbe73a668a28a6d1a` | `32ca272be2daeee6c4c1f47ccd5bd0ed0ac9909e` |
| Round-six failed complete-gate source | `09c9afc7cfb2857f354feccb65e46a54ca8cfe62` | `b650eeac53af1395d6d0792f3639f02cf317490f` |
| Initial round-seven preparation | `b43be56fced26cfb20703414e7ea1076b20b6712` | `61e446b75d845420dc625090df9ef61ef1b97d0f` |
| Corrected preparation | `58485ad53793733869af490c7e0da58a4090a1a1` | `766f08daed2b37635b9912352c71d1e48a4acfdf` |
| Final frozen source, including official generated stamp | `d3aa9ca25bd8fec352cbb628ddfcca90beabcdd4` | `c20d7b3f6bc36e8adf906d0eb2707902b66e3fc5` |

The isolated worktree is `deckchek-mobile-export-code`, branch
`review/deckchek-mobile-export-code-20261121`. Its final frozen source has
2,235 tracked files. Root supplied each fast-forward and the final freeze.

The later implementation for issue #80 changes the actual
[Results screen](../../mobile/screens/results.js), adds
[four real-screen regression cases](../../tests/mobile-results-details.test.mjs),
and corrects the [Mobile PWA smoke assertions](../../tools/smoke/mobile-pwa.mjs).
The only generated change is the service-worker build stamp. The
[implementation record](MOBILE_EXPORT_DETAILS_IMPLEMENTATION_2026-11-21.md)
describes the same boundary. Quick Check layout issue #81 remains separate and
was not changed or qualified by this lane.

## Source finding corrected before the freeze

The initial preparation refreshed the export after calling `setSettings()` but
then re-read settings from storage. The unchanged
[store](../../mobile/lib/store.js) writes its memory copy first and catches a
failed `localStorage.setItem()`. Its next read nevertheless prefers a readable
older persisted record. If writes fail while the old record remains readable,
an edited or cleared field could therefore still export its old identifier.
The initial no-op comparison had the same dependency. Both other reviewers
independently corroborated this source path; no failing-baseline execution or
reproduction was used to establish it.

Root corrected this with one screen-local `exportSettings` object, initialized
once from the stored nickname, serial and redaction preference. Current input
values update that object before persistence is attempted. Both panel generation
and the no-op comparison use it. The mounted editor therefore remains the
authority even when old persisted settings can still be read, and an unrelated
storage change cannot silently replace its visible choices.

The fourth regression deliberately retains the original readable record while
rejecting preference writes. It checks the current checksum, edited nickname,
cleared serial, user-agent redaction, every export action, removal of the old QR,
redundant-change button identity and saved-record immutability. It also asserts
that `getSettings()` really does return the stale old nickname, so the case
cannot pass by accidentally exercising a successful write or unreadable store.

This correction is bounded to the open editor. The shared store's broader
readable-old-record/write-failure behavior is unchanged, and this review does
not claim successful persistence across remount after a denied write.

## Actual source and fixture review

### Editor, panel and action ownership

Nickname and serial handlers process both `input` and `change`, trim the entered
value and refresh the open panel only when the editor's effective value changes.
Empty values remain authoritative and do not fall back to a saved result's
original hints. On a redundant change after input, the handler returns before
replacing the export buttons. That preserves the action target already involved
in the person's tap or click.

The editable fields live in `settingsCard`, outside the replaced panel. An edit
rebuilds the export card and removes any previously visible QR while preserving
the original fields. Source review identified that the existing DOM fixture does
not blur a detached active element; root therefore strengthened the regression
to require that the original editor is still connected and remains the live
screen's selected input, in addition to active-element equality. The button
identity assertion directly checks the no-op behavior.

Each successful panel render constructs one export string and one `File` from
that string. Save file, share, copy and QR closures all belong to that render.
Replacing the panel replaces those accessible actions together with the displayed
text. Generating a new QR starts at frame zero and uses the current string.
The screen does not leave a previously generated image visible after a detail
or redaction change.

### Export content, checksum and saved records

The screen passes a copied run with a fresh `assetHint` to the unchanged
[export helper](../../mobile/lib/export.js). The actual shared
[phone format/parser](../../app/phone-run.js) normalizes empty hints to `null`,
applies the existing text limits and generates a new checksum over the resulting
export content. The browser/phone model is omitted through the existing
redaction path. Format version, measurement values, original stored hints,
measurement limits, QR framing and checksum policy are unchanged.

The checksum is an integrity check, not a signature or source-authentication
claim. The screen's existing explanation retains that distinction. The new
cases import the real Results module, store, export/QR helpers and desktop
parser; they do not copy the screen logic or substitute a test-only checksum.

`setSettings()` rewrites preferences in the stored state but does not edit the
saved run's measurement data or original hint fields. The screen's copied
export object and the parser's new normalized objects preserve that boundary.
The authored cases retain a deep copy of the saved record and compare it after
edits, clears, redaction and export actions, including denied preference writes.

### Asynchronous, download and fixture boundaries

The download helper receives the current string and creates its Blob/link
synchronously. Clipboard and share calls receive their string/File snapshot
when clicked, before awaiting completion. A later edit affects subsequent
actions; completion of an already started operation does not regenerate an old
panel or replace current export content. Clipboard completion only announces
status, and share cancellation is caught by the existing handler.

The tests replace clipboard, share and anchor-download boundaries with in-memory
observers, then compare the resulting strings and File/Blob contents to the
displayed export. They exercise real screen handlers, current checksums and
element ownership. QR coverage verifies removal and regeneration from the new
payload; it does not claim optical decoding. The DOM fixture does not reproduce
browser layout, real touch timing, native share-sheet behavior or browser
permission UI. Those remain separate qualification.

The PWA smoke removes the old nickname assertion's unconditional `|| true`.
Its added checks inspect edited serial text, clearing plus QR retirement, and
an actual downloaded file's equality to the display and validity under the
desktop parser. Authored smoke and a syntax result alone are not rendering or
download evidence from a browser run.

## Independent official-build review

The sole official build ran on corrected preparation `58485ad`, exited zero
in **0.11477186000047368 seconds** and did not time out. Its entire stdout is
`updated: sw.js` followed by a newline; stderr is empty. I read the complete
recorder and authorization, including the clean-source/identity guards,
30-second budget and prohibition on replacing first output.

Before seeing the generated result, I independently derived stamp
`8f12f05a2c38` from the Mobile file bytes. All **33** ordered precache entries
match the **32** eligible files plus the root entry, without duplicates. All
**seven** vendored engines are byte-identical to their app sources, and
`vendor/VERSION` matches their hashes. This used file/Git reads and data-only
hash calculations, without importing or executing the build tool.

Generated commit `d3aa9ca` has `58485ad` as its exact parent and changes only
`mobile/sw.js`: `eca0f2a661c9` becomes `8f12f05a2c38`. The precache and every
other worker byte are unchanged. The worker SHA-256 is
`07b2a1c77959bcc55f825f4d6db6ada92762ea494959a0938d749569978d77cd`.
Both saved worker snapshots and the complete generated patch match the
immutable Git objects exactly. Both complete **2,235-entry** build maps equal
their respective preparation/generated Git blob digests. Recorder, config and
raw stdout/stderr hashes also match the retained result.
The [build result](evidence/mobile-export-functional-2026-11-21/build/result.json)
and [generated patch](evidence/mobile-export-functional-2026-11-21/build/generated.patch)
retain that first outcome and exact source delta.

## First focused functional outcome

The sole functional worker ran one serial Node gate on the final frozen source.
Its [complete TAP](evidence/mobile-export-functional-2026-11-21/focused/run.tap)
and [result record](evidence/mobile-export-functional-2026-11-21/focused/result.json)
preserve the first output.
The explicit selection contains exactly these six tracked files:

- `tests/mobile-build.test.mjs`
- `tests/mobile-export.test.mjs`
- `tests/mobile-results-details.test.mjs`
- `tests/mobile-router.test.mjs`
- `tests/phone-run.test.mjs`
- `tests/qr.test.mjs`

| Measure | First outcome |
| --- | --- |
| Source / tree | `d3aa9ca25bd8fec352cbb628ddfcca90beabcdd4` / `c20d7b3f6bc36e8adf906d0eb2707902b66e3fc5` |
| Node / platform | `v24.22.3`, Linux x64 |
| Runner arguments | `--test --test-concurrency=1 --test-reporter=tap`, followed by the exact six files |
| Started / completed, UTC | `2026-11-21T09:47:44.338602+00:00` / `2026-11-21T09:47:53.829405+00:00` |
| Execution elapsed | `9.39870166000037` seconds |
| Exit / timeout | `0` / `false` |
| Tests / pass / fail / skip | `45` / `45` / `0` / `0` |
| Raw TAP size | `10,439` bytes |
| Raw TAP SHA-256 | `7f29e94be18c528ad18b620b875a9f74986bd6819cc39c452077f58cbff3e4db` |
| Stderr | Empty |
| Source integrity | All `2,235` tracked hashes, inventory, HEAD/tree and clean status unchanged |

I independently checked every sequential top-level outcome, the single plan
and complete footer, the exact selection/argv, test-file hashes, source/runtime
metadata and recorder/config identities. Both complete source maps match the
frozen commit's immutable blob digests. Cases **16–19** are the four actual-screen
regressions, in the same order and with the same titles as the frozen source.
They all passed in this first result. No failing baseline or later retry was
substituted for it.

The recorder's SHA-256 is
`5e28829a3d57a5b14da7a249fbf74e82509a1e036b7cb34ed4c01ce54a1cb34e`;
its authorization/config SHA-256 is
`244a3e5e4718829ea57ccd1b3fb59ef8b6df51937efdf097266fee2c70a79bf1`.
I read the entire recorder, including first-output refusal, exact-source checks,
the 120-second budget and disallowed diagnostic-environment checks. This gate
provides focused Node evidence for Mobile export, format/QR, build and routing.
It is not a complete-source, rendered-browser or physical-device gate.

## Separate syntax and final package verification

The separately authorized command was the same absolute Node executable with
`--check tools/smoke/mobile-pwa.mjs`. It ran once on `d3aa9ca`, exited zero in
**0.11432855300154188 seconds**, did not time out and produced empty stdout and
stderr. It began at `2026-11-21T09:50:10.792128+00:00`; the completed record is
dated `2026-11-21T09:50:10.981323+00:00`. The full source identity, clean status
and all 2,235 tracked hashes remained unchanged.

I read the complete syntax recorder and independently matched its SHA-256,
`17dce012b3804fe19f25b893ad1d8c71fca285fe7660f1815010271c8e4f6056`.
The retained 14,849-byte smoke source equals its frozen Git blob and both recorded
source digests:
`ead9aadcad653e51c2ce908dabc4e6a45234cbf40f7ea9ff6efea97ee357de44`.
The [syntax result](evidence/mobile-export-functional-2026-11-21/syntax/result.json)
also correctly binds the first focused result's digest. This establishes syntax
only; neither the smoke module nor a browser was executed by that command.

The final [manifest](evidence/mobile-export-functional-2026-11-21/manifest.json)
has SHA-256
`eab397836489860b16f8fac58fd58d5b3c0f5259bb54a30f5511cc49f09c9f8e`.
I independently verified all **33** named files, exact membership, sizes and
digests. All **29** retained original files and **34** original-to-copy bindings
remain byte-identical to the available first-output files, recorders and configs.
All **six** complete 2,235-file maps match their preparation or frozen immutable
Git blobs, rather than merely matching one another.

The [ordered summary](evidence/mobile-export-functional-2026-11-21/observed-summary.json)
matches every one of the 45 TAP outcomes and all six per-file case ranges. The
[source comparison](evidence/mobile-export-functional-2026-11-21/source-comparison.json)
matches all four scoped changed code paths after round six and all 17 code paths
changed since fixed PR #79. The seven listed audio implementation/test paths
have identical bytes across PR #79, the failed round-six freeze and this freeze.
That equality provides source identity; it does not diagnose or resolve the
audio failures. I read the retained data-only verifier without executing it and
performed these independent checks using data reads and Git objects.

## Retained complete-source hold and separate work

The [round-six functional report](INVENTORY_MOBILE_FUNCTIONAL_AUDIT_2026-11-21.md)
retains the first full run on `09c9afc`: **2,391 tests, 2,388 passed, two failed
and one optional Mixxx case skipped**. I checked its result metadata and the
complete TAP/manifest digests against that report. The TAP SHA-256 remains
`bf5b091c0a20826a64cac1842d0d5b057a5dc91a46c5a68ebcca1b9e60f50eaa`.

The retry-lifecycle case reached its final result-status comparison with `fail`
where `pass` was expected. The other failure is the final relative-gain
assertion in the level-cap test. Its preceding -12 dBFS cap and requested
-30 dBFS level assertions passed; that output is not a cap-enforcement failure.
No causal diagnosis is established. Issue #72 remains unresolved, and this
Mobile work changes no audio implementation, fixture, threshold or assertion.

The [separate hosted record](FEATURE_SUCCESSOR_HOSTED_EVIDENCE_2026-11-21.md)
belongs to fixed PR #79, including its 1,411 passing UI checks and 2,359
JavaScript cases with 2,358 passes and one optional skip. It does not qualify
these later source changes, and its remaining hosted/platform gates are not
cleared by this local review. No browser retry, native or physical qualification,
deployment, additional permission, publication or merge is approved here.

**This code audit is complete. Complete-source qualification remains held.**
The [functional report](MOBILE_EXPORT_FUNCTIONAL_AUDIT_2026-11-21.md) records the
sole executor's observations and limits; this report supplies an independent
source and retained-data review. No additional run, numerical repair or broader
acceptance is implied by the completed scoped handoff.
