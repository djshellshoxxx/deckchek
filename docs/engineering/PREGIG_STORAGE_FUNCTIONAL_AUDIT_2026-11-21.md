# Pre-gig storage — round 16 functional and bug audit

Reviewer: `/root/pregig_storage_functional_round16`. Date: 21 November 2026 UTC.
This fresh review follows the completed round-fifteen backup cohort and its
consolidation at `b71a81a849c0bad9f24b4ba7ea40366e86769501`.

## FINAL disposition: static HOLD

**The frozen candidate is HELD. Four source-backed blockers remain: two product
ownership defects and two fixture defects. No project execution was authorized
or performed in this round.** The preset form can discard later edits when an
earlier save completes; PDF export can use a different preset or result from the
retained check; screen-fixture write accounting includes catalog initialization;
and fresh per-case documents conflict with the production live-region module's
cached shell hosts.

The functional lane first reported the catalog-write discrepancy before any
execution proposal. Root then explicitly directed a static HOLD on this unchanged
freeze. The other three findings were raised by the code/security peers and
independently confirmed here from the production code and fixtures. No recorder,
configuration, launcher, runtime identity call or FIRST output was created. No
Node import, test, syntax check, build, native/browser launch, scanner, probe,
exploit, vulnerability reproduction, diagnostic collector or rerun occurred.
Only static source, Git objects, working bytes, JSON and retained TAP data were
inspected. No production, fixture, test or dependency file was changed.

This report implements the
[review scope](PREGIG_STORAGE_REVIEW_SCOPE_2026-11-21.md) and checks the claims in
the [implementation note](PREGIG_STORAGE_IMPLEMENTATION_2026-11-21.md).
The 128 authored cases below are an inventory, not a passing result.

## Frozen source and custody

| Item | Independently verified identity |
| --- | --- |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-pregig-storage-functional` |
| Branch | `review/deckchek-pregig-storage-functional-20261121` |
| Frozen HEAD | `b7a979cfc24eca569713ff319c5838eaa13d1a34` |
| Frozen tree | `8fd5bb4744c3f9837728e54f8a046e193af23ea8` |
| Sole frozen parent | `5b2ff5c90cae4838c8beefe4b998a71ea93b4c94` |
| Tracked source paths | 2,535 |
| Distinct immutable blobs | 2,277 |
| Summed tracked bytes | 87,672,414 |
| Tracked and actual top-level `tests/*.test.mjs` | 207, with identical inventories |
| Ordered source-map SHA-256 | `fbb02a5e4de05f39edf6480229ec5d74ead7e48882e2d4f3e1ad1788725509a4` |
| Initial working/index status | Clean |

The byte verification reads the recursive NUL-delimited Git tree, obtains every
distinct original blob with `git cat-file --batch`, recomputes its Git blob SHA-1
from its header and bytes, and compares every original working path's regular-file
type, executable mode and complete bytes against that blob. The map has one row
per source path in recursive Git tree order, with `path`, `mode`, `oid`, `bytes`
and `sha256`; its digest uses compact JSON with sorted object keys. Branch,
HEAD, tree, ordered parents, path inventories and clean initial status were
checked separately. This verifies the entire frozen source identity; it does
not claim semantic review of every file in the repository.

The three changed production modules, five proposed test files and both scope
documents were read completely. Supporting review covered the complete
`service-screen-dom.mjs` and `native-catalog-archive-dom.mjs` fixtures, strict
text-file reader, Pre-gig contract JSON, DOM/live helpers, device-library state
and printable adapter; the relevant shared state, catalog, library-loading and
shell confirmation paths; and native Pre-gig production types, validation,
persistence and command wrappers as source. Native execution remains unqualified.

| Changed module or proposed test | Bytes | SHA-256 |
| --- | ---: | --- |
| `app/pre-gig.js` | 56,837 | `0c2c6369bb06fa7e06e52da1d3b15f20f3f49d722d7af1ff2968f66c56370184` |
| `app/ui/screens/pregig.js` | 55,274 | `c2687890a263a74fad03b6e1f8529cd71149eb1be4895855c5afc9e0961dfa38` |
| `app/ui/workflows/pregig.js` | 17,781 | `49c9f921ea53ae9f9ed57f901c68b8b1198e80c4a87c3a0ad406333228070ad7` |
| `tests/pre-gig.test.mjs` | 50,840 | `f813fa152e82998fa67ea49a2d78a7fa2d0cf214f600ab92b86bc94384c76d12` |
| `tests/pregig-storage-screen.test.mjs` | 17,599 | `689f9926e3c4340d7198feb52dd5df38a0d1421892c099b2fb344565f91b84ba` |
| `tests/pregig-storage.test.mjs` | 9,582 | `0fc88abc7554c9785a9e0f5dae8cdfdcc8b46f0be84d0a9710ec6d30cc6d6b4f` |
| `tests/pregig-ui.test.mjs` | 14,311 | `c18d29747b125d940ce273ec9744954b74f913a8343b32d9c082d7c7d9b6be55` |
| `tests/text-file-boundary.test.mjs` | 7,893 | `7e63b3bc04fd1da8a66b15ef20d5956072bec7dca238dece64d7355f2a2f1b23` |

## Blockers and bounded corrections

### F1 — P2: pending preset Save can discard newer form edits

In [`app/ui/screens/pregig.js`](../../app/ui/screens/pregig.js), `presetForm`
creates editable name, interface and software inputs, sample-rate and deck
selects, MIDI text, needle checkbox and deck add/remove controls (lines 165–213).
Its full-control disabling branch runs only for `readOnly: true`; `editPreset`
calls it without that option at line 219. The Save callback captures
`out = f.check()` at line 228 and disables only the Save button at line 230.
Cancel and dialog dismissal are blocked by `canClose`, but draft inputs remain
editable.

The callback awaits `savePreset` before closing the dialog and announcing the
captured name (lines 232–236). `savePreset` awaits the adapter acknowledgement,
caches that row, then awaits `loadPresets` (lines 155–162). The refresh itself
awaits the built-in fetch before the saved-preset read (lines 130–152). Thus a
normal delayed write or refresh leaves a visible form that still accepts edits.
A user can change the name or interface after the captured values have been
submitted; completion then removes the dialog without checking the newer draft.
The acknowledged earlier values remain stored and the later edits are lost.
The refresh delay makes this relevant even to the synchronous browser store.

The authored pending-save case in
[`tests/pregig-storage-screen.test.mjs`](../../tests/pregig-storage-screen.test.mjs)
(lines 130–139) checks duplicate Save and Cancel handling but never edits a field
or asserts that every draft-changing control is disabled. Its successful outcome
would not establish draft ownership.

**Successor correction:** freeze every draft-changing control for the owned save
attempt, restoring appropriate prior control states on failure, or retain and
reconcile a later draft revision before closing. Add actual-form coverage for
editing while the write is pending and while the post-write refresh is pending.
Keep the existing same-form, denied-write, retry and one-write assertions. This
is a source-derived defect; no runtime reproduction was performed.

### F2 — P2: the first screen case counts catalog initialization as a Pre-gig write

The first new screen case asserts zero **total** writes at lines 80 and 83 of
[`tests/pregig-storage-screen.test.mjs`](../../tests/pregig-storage-screen.test.mjs).
Its mount records every `setItem` call, installs that recorder before importing
the real shared modules, and awaits real library initialization. The following
ordinary source path necessarily reaches an unrelated catalog write:

| Step | Frozen source and effect |
| --- | --- |
| Install recorder | `tests/pregig-storage-screen.test.mjs:22–30`: `setItem` pushes every key/value, then the fixture becomes global storage before dynamic imports. |
| Capture storage | `app/ui/state.js:39–42`: `createCatalogStore({ storage: safeStorage() })` captures that fixture; `safeStorage` succeeds on its `getItem('x')`. |
| Initialize library | `tests/pregig-storage-screen.test.mjs:32` awaits `ensureLibrary`; fixture fetch at line 28 supplies `{ profiles: [] }`. |
| Complete empty load | `app/devices/library.js:77–93` accepts the empty profile index and resolves with an empty profile array. |
| Sync catalog | `app/ui/devices/library-state.js:33` calls `store.syncDeviceProfiles(profiles)`. |
| Take browser mutation | `app/catalog-store.js:463–467` awaits the user-data read and calls `mutate` even for the empty profile array. |
| Persist catalog | `app/catalog-store.js:386` unconditionally calls `saveState`; lines 42–43 invoke `setItem('deckchek.catalog.v1', ...)`. |

Consequently the recorder already contains a catalog write before the first
Pre-gig preservation assertion. Preserving the damaged
`deckchek.pregig.presets.v1` bytes and performing zero Pre-gig mutations is
compatible with this initialization, while the total-write assertion is not.
This is an independently derived fixture contradiction, **not an observed test
failure**. Module-level library initialization is memoized, so this finding does
not imply that all 15 screen cases repeat the catalog write.

**Successor correction:** account explicitly for the initialization boundary or
assert the relevant Pre-gig-key writes while retaining the original all-key log.
Keep exact byte equality for the damaged preset collection before repair, the
explicit repair/retry behavior, no unintended Pre-gig write, unavailable-state
feedback, and the refusal to silently select an unread rig. Do not bypass the
real store/library modules or drop the preservation assertions to get a pass.

### F3 — P2: PDF export can lose retained-run provenance

The on-screen completed/running check deliberately uses `S.preset` in
`renderCheck` at `app/ui/screens/pregig.js:368`. Editing a saved preset with the
same ID is still available from the Presets tab (line 638); its acknowledged
replacement updates `st.presets` at line 159 without replacing the retained
controller preset. This preserves the tested rig on screen.

However, `exportRunPdf` at lines 607–610 waits for `ensurePregigPrintable()` and
then calls `pregigPrintData(S.run, { device: currentPreset()?.audioDevice || '' })`.
`currentPreset` at line 92 resolves the mutable preset list. A completed check
against an earlier interface can therefore be exported with a later interface
label after the same saved preset is edited. The
[`pregig-report.js`](../../app/ui/workflows/pregig-report.js) adapter carries this
supplied device directly into print data (lines 14–20), and the printable device
field displays it (line 28).

There is a second ownership gap in the same operation: both the run and device
are read after the asynchronous registration. A reset or replacement during that
wait can change which run the original click exports, or leave no run for
`pregigPrintData`. No ownership check binds completion to the initiating view.
These observations concern the actual export path when PDF export is enabled;
they do not claim that a native PDF was produced or inspected in this review.

**Successor correction:** capture the retained run and its retained preset before
the registration await, build the report from that consistent snapshot, and
define how replacement or disposal retires the operation. Its fallback must keep
the same ownership. Add an actual export-path regression covering a same-ID
preset edit and a deferred registration with view/result replacement. The current
128-case selection has no such regression.

### F4 — P2: per-case document replacement conflicts with cached toast hosts

Every screen-fixture mount calls `installServiceDom(t)` at line 18, creating a
new document and a new `#toasts` host. The dynamic imports at lines 29–30 use
unchanged module URLs, so production module state persists across cases.
[`app/ui/live.js`](../../app/ui/live.js), lines 6–11, holds `politeEl`,
`assertiveEl` and `toastHost` at module scope and initializes each with `??=`.
Once resolved, those references remain attached to the earlier fixture document.
Per-case restoration of global `document` does not replace the cached references.

The successful retry case at screen-test lines 112–128 contains an actual success
toast and asserts it in that case's document. Later, the acknowledged-refresh
case at lines 141–151 inspects its own newly created `#toasts`, including the
Saved assertion at line 148. Production `toast` still appends to its cached
earlier host, so that later assertion does not observe the real toast destination.
Other later toast expectations share this lifetime mismatch. This is a second
static fixture blocker, independently confirmed after the code lane reported it;
it is not a claimed runtime failure or a reason to change production toast logic.

**Successor correction:** model the real application's stable shell document and
host lifetime, with explicit per-case screen/content cleanup and globals
restoration at the correct scope. Retain the real live module, actual success
toast assertions, storage recorder and disposal checks. Do not weaken the
assertions or substitute a toast implementation.

## Other reviewed behavior and its limits

The browser adapter in [`app/pre-gig.js`](../../app/pre-gig.js) distinguishes a
confirmed absent `null` key from missing providers/methods, thrown reads,
non-string values, malformed or non-array JSON, invalid rows and duplicate IDs.
It validates the complete collection and rejects non-finite JSON values instead
of filtering bad rows into a writable replacement. Candidate rows are validated
and serialization is checked before `setItem`; a denied write cannot return a
run ID, preset row or deletion success. Deleting an absent preset is a no-write
false result. Newest-100 run retention and preset creation timestamps remain.
Native adapter construction returns before accessing browser storage, and its
six command names and argument shapes match the retained contract and native
production wrappers. These are source conclusions, not native qualification or
a general sandbox guarantee for hostile JavaScript objects.

The controller in [`app/ui/workflows/pregig.js`](../../app/ui/workflows/pregig.js)
installs one shared save promise before emitting saving state. Repeated Save or
Retry joins it; start, rerun and reset cannot replace an in-flight save. Failed
persistence retains the completed result and clears the saved marker; retry
does previous-History lookup and persistence without repeating measurement.
Unreadable previous History does not silently become an empty comparison
baseline. A newly completed rerun clears the earlier saved/compare state before
its own attempt.

The screen has persistent preset and History error state, distinguishes unknown
History from confirmed empty History, retains cached rows with a stale-data
message, and provides actual Retry controls. Read request sequences and disposal
retire late presentation. A successful preset write is cached before refresh,
so a later list failure can retain its acknowledged row. Failed import retains
the parsed draft for retry without repicking the file. Future-version presets
are displayed read-only and refused for start/edit/duplicate without rewriting
their original stored JSON. Unsaved-result replacement is guarded by the shared
confirmation dialog and retained run identity for Done, preset changes and
reruns. These improvements do not resolve F1–F4.

The DOM fixture provides synchronous event dispatch, explicit storage seams and
deferred promises. It does not establish real browser modal inertness, layout,
accessibility-tree behavior, focus trapping, OS dialogs, physical audio or native
database behavior. The original synthetic DSP and threshold assertions remain
in the core selection; none was executed here. Whole-tree byte verification is
separate from semantic coverage, and authored assertions are separate from an
observed passing outcome.

## Independently derived selection and historical matching

| Proposed file, in selection order | Literal cases | Expanded table cases | Total | Added |
| --- | ---: | ---: | ---: | ---: |
| `tests/pre-gig.test.mjs` | 59 | 0 | 59 | 0 |
| `tests/pregig-storage-screen.test.mjs` | 12 | 3 | 15 | 15 |
| `tests/pregig-storage.test.mjs` | 8 | 18 | 26 | 26 |
| `tests/pregig-ui.test.mjs` | 17 | 0 | 17 | 4 |
| `tests/text-file-boundary.test.mjs` | 11 | 0 | 11 | 0 |
| **Total** | **107** | **21** | **128** | **45** |

Each complete test was read, including its helper seams and assertions. Static
name extraction preserves file/declaration order and independently expands the
two collection names by seven invalid representations, four denied-write actions,
and three discard actions. There are 128 unique names. Comparing the older three
files with pre-author source `f43b940f142ff54fdaf24c0d1feece4ca6dd957b`
establishes 83 retained names and 45 additions. This uses source data, without
evaluating JavaScript or importing the project.

All 83 older names also match exactly one top-level `ok` outcome in the retained
[round-ten original TAP](evidence/link-consent-functional-2026-11-21/full/run.tap):
555,767 bytes, SHA-256
`e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`.
Their recorded historical durations sum to 14,628.461681 ms. That is historical
case time, not a prediction of this candidate's process time. Because the source
is HELD and root withheld FIRST authorization, no timing budget or launcher is
proposed. Those older outcomes do not qualify the changed source or new cases.

The appendix's ordered `{file,name}` array has compact sorted-key JSON SHA-256
`f3774cb427a52d3694976c36c80e2af4b32bc90a53edeea2d87158c0f7ebb676`.
The table's “Added” classification describes authored coverage only.

## Handoff and preserved boundaries

Root owns a distinct corrected candidate after all three R16 FINAL reports have
been preserved. Correct F1 and F3 in the actual user/export flows, correct F2 and
F4 in the fixture lifecycle/accounting, add the missing ownership assertions and
freeze the successor before fresh independent review. Any future FIRST requires
separate review and authorization of that exact source and its complete controls.
This static HOLD is not permission to execute this freeze or rerun old failures.

The prior backup 193/193 FIRST and Service 123/123 qualification remain ancestor
evidence. The original complete-source audio HOLD remains **2,420 total / 2,418
pass / one failure / one optional skip**, retaining case 53's **−101 dB at a
played −30 dBFS**; no cause or repair is established here. The
[round-ten functional report](LINK_CONSENT_FUNCTIONAL_AUDIT_2026-11-21.md)
and original TAP remain unchanged. Native backup #85, Population Compare #88,
real platform qualification and release decisions remain separate. Fleet stays
default-off. Qualified main `e36ddc41806b0f6639474f207e3b339e063a6e25`, durable
Player `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b` and fixed published heads are
unmodified by this lane.

Only this report is added by the functional lane. The final handoff supplies its
commit/tree/sole-parent and exact file byte/hash/blob identities after independent
verification that every frozen source byte/mode is unchanged and the worktree is
clean. There is no new functional evidence directory or execution artifact.

## Appendix — all 128 ordered source-derived names


The compact ordered name-only JSON array has SHA-256 `3f152afde3a6eaf1ecdc5e6481bf17d5ddd12346c87448fb0e70e795231ef9d5`.

### `tests/pre-gig.test.mjs`

| Order | Source line | Added | Exact case name |
| ---: | ---: | --- | --- |
| 1 | 26 | No | timecode: clean deck passes with no fix needed |
| 2 | 32 | No | timecode SNR: 25 passes, 24.9 amber, 20 amber, 19.9 red (AC-3 action and DVS link) |
| 3 | 43 | No | timecode balance: 1.5 passes, 1.6 amber, 3 amber, 3.1 red, sign does not matter |
| 4 | 51 | No | timecode phase error: 10 passes, 10.1 amber, 20 amber, 20.1 red |
| 5 | 59 | No | timecode dropouts: 0 passes, 1 amber, 2 red |
| 6 | 67 | No | timecode speed: 1% passes, 1.1% amber (pitch), 5% amber, 5.1% red means wrong format |
| 7 | 77 | No | timecode: worst metric wins, every issue gets one fix, unverified format warns |
| 8 | 88 | No | timecode: no signal is red with needle, switch and cable advice; missing evidence is skipped, errors are amber-level error |
| 9 | 101 | No | timecode: capture problems become actions, not crashes |
| 10 | 121 | No | signal level: -50 dBFS passes, -50.1 on either channel is red and names the channel |
| 11 | 132 | No | hum: 40 dB below the carrier is amber, 25 dB is red, above 40 passes; hum below the floor margin is ignored |
| 12 | 142 | No | hum that could not be measured is amber with a retry, never a silent pass |
| 13 | 151 | No | audio: missing interface is red with connection and Sound-settings actions; sample-rate mismatch is amber |
| 14 | 166 | No | midi: present passes, optional missing is amber, required missing is red, no backend is unsupported |
| 15 | 180 | No | headphones: yes passes, no is red with cue advice, skip or none is skipped |
| 16 | 196 | No | software: crash within 1 h red, within 24 h amber, older passes; boundaries inclusive |
| 17 | 212 | No | software: not installed and not running are amber with actions; no backend is unsupported |
| 18 | 222 | No | system: driver and event findings filtered to the preset gear, warnings amber, errors red, unsupported excluded |
| 19 | 242 | No | evidence errors become "Check could not run" with a retry for every kind |
| 20 | 253 | No | every red or amber result carries a fix with a label and plain-English text |
| 21 | 272 | No | rollUp matrix (AC-2): fail is red, warn or error is amber, skipped required is incomplete, else green |
| 22 | 291 | No | rollUp: unsupported steps are excluded from the verdict and mark the check partial (AC-5) |
| 23 | 301 | No | rollUp: top problems sorted red, amber, then skipped required; copy matches the spec wording |
| 24 | 312 | No | buildPlan orders parallel steps first, then per-deck steps, then the headphone cue |
| 25 | 323 | No | buildPlan honours skip and only, drops MIDI and software when the preset has none, and stays inside the 120 s budget |
| 26 | 338 | No | built-in presets validate and reference the owner's real gear profile ids and known formats |
| 27 | 353 | No | built-in presets load through loadBuiltinPresets and bad ones are reported |
| 28 | 366 | No | validatePreset: bad deck ids, duplicates, inputs, formats, rates, MIDI and gear references |
| 29 | 391 | No | presets: newer versions are read-only, import rejects >256 kB and junk, export/duplicate round-trip (AC-8) |
| 30 | 419 | No | presetFromEquipment builds a valid preset from real profiles; deck B defaults to inputs 3-4 and the format comes from the media library |
| 31 | 436 | No | formatForMedia resolves timecode media only, from the library, in any container shape |
| 32 | 444 | No | the built-in rigs on a multi-pair interface put deck A on 1-2 and deck B on 3-4 (Traktor Audio 8 DJ) |
| 33 | 450 | No | namesMatch is forgiving but refuses tiny fragments |
| 34 | 459 | No | diffRuns lists which steps changed and whether they improved (AC-6) |
| 35 | 480 | No | synthetic Traktor MK2 timecode from the generator passes both deck steps |
| 36 | 487 | No | synthetic: noisy carrier is amber then red as the SNR falls (real analyzeTimecode) |
| 37 | 495 | No | synthetic: one muted channel is red, naming the channel; silence is a no-signal red |
| 38 | 508 | No | synthetic: dropouts and a wrong-format record are caught |
| 39 | 517 | No | synthetic hum: 50 Hz and 60 Hz families are detected and graded against the carrier |
| 40 | 535 | No | synthetic needle-up hum is measured on the lifted segment |
| 41 | 542 | No | summarizeTimecode exposes plain numbers and handles failures |
| 42 | 568 | No | runPregig: an all-ready rig produces a green verdict with every automatic step passing (AC-1) |
| 43 | 583 | No | runPregig: deck B captures input pair 3-4 and deck A pair 1-2, so a two-deck rig can be green |
| 44 | 593 | No | runPregig: a pair the interface does not offer is reported as no such input, not a failure |
| 45 | 609 | No | deckPairFirst maps zero-based deck inputs to the 1-based first channel of a stereo pair |
| 46 | 618 | No | runPregig: audio interface missing is red, signal steps are skipped (blocked) and nothing is captured (AC-4) |
| 47 | 632 | No | runPregig: a thrown step is an error row, the verdict is amber and the other steps still run |
| 48 | 642 | No | runPregig: Esc cancels, finished steps are kept and the rest are skipped (cancelled) (AC-7) |
| 49 | 658 | No | runPregig: manual time is reported separately and excluded from the duration |
| 50 | 668 | No | runPregig: orchestration overhead with instant mocked captures stays far below 5 s |
| 51 | 675 | No | runPregig: CAPTURE_BUSY offers to stop the other capture, retries once and records the choice |
| 52 | 690 | No | runPregig: one capture feeds both deck steps; only/skip re-run just the chosen steps |
| 53 | 701 | No | runPregig: needle-up hum asks the user, captures the lifted segment and grades it |
| 54 | 715 | No | runPregig: no desktop backend leaves required steps skipped and the verdict incomplete (AC-5) |
| 55 | 724 | No | createNativeDeps drives the Tauri commands with the pre-gig capture holder and captures the deck input pair |
| 56 | 745 | No | toRunInput maps a run to the pregig_save_run contract, redacting Windows user paths |
| 57 | 762 | No | createPregigApi (native) sends exactly the contract argument names |
| 58 | 780 | No | createPregigApi (browser) stores runs and presets locally with the same shapes |
| 59 | 807 | No | contract examples are real step results shapes (states the database accepts) |

### `tests/pregig-storage-screen.test.mjs`

| Order | Source line | Added | Exact case name |
| ---: | ---: | --- | --- |
| 60 | 71 | Yes | Pre-gig screen keeps unavailable preset storage visible across tabs and retries without silently choosing a rig |
| 61 | 86 | Yes | Pre-gig screen distinguishes unavailable History from confirmed empty History and recovers on Retry |
| 62 | 100 | Yes | Pre-gig screen retains previously loaded History with a persistent unavailable message after a failed refresh |
| 63 | 112 | Yes | Pre-gig preset Save keeps the same draft and inline error after denied persistence, then confirms one successful retry |
| 64 | 130 | Yes | Pre-gig preset Save coalesces repeated clicks and keeps the dialog open while persistence is pending |
| 65 | 141 | Yes | Pre-gig keeps an acknowledged preset and truthful success when the subsequent list refresh is unavailable |
| 66 | 153 | Yes | Pre-gig actual Retry and shell Save retain the completed result and never claim persistence before it succeeds |
| 67 | 173 | Yes | Pre-gig saving a different preset keeps an unsaved check attached to the rig it actually tested |
| 68 | 187 | Yes | Pre-gig Done preserves an unsaved result until the user confirms discarding it |
| 69 | 187 | Yes | Pre-gig choosing another preset preserves an unsaved result until the user confirms discarding it |
| 70 | 187 | Yes | Pre-gig running everything again preserves an unsaved result until the user confirms discarding it |
| 71 | 197 | Yes | Pre-gig a late failed History request cannot replace a newer successful read |
| 72 | 207 | Yes | Pre-gig disposal retires a pending History presentation and the Save callback |
| 73 | 216 | Yes | Pre-gig import retains the parsed draft after a failed save and retries without picking the file again |
| 74 | 233 | Yes | Pre-gig displays future-version presets read-only without running or rewriting their contents |

### `tests/pregig-storage.test.mjs`

| Order | Source line | Added | Exact case name |
| ---: | ---: | --- | --- |
| 75 | 29 | Yes | browser Pre-gig treats only a confirmed absent key as an empty collection |
| 76 | 45 | Yes | browser Pre-gig runs preserves malformed JSON through reads and attempted writes |
| 77 | 45 | Yes | browser Pre-gig runs preserves empty text through reads and attempted writes |
| 78 | 45 | Yes | browser Pre-gig runs preserves non-array JSON through reads and attempted writes |
| 79 | 45 | Yes | browser Pre-gig runs preserves partly invalid rows through reads and attempted writes |
| 80 | 45 | Yes | browser Pre-gig runs preserves duplicate ids through reads and attempted writes |
| 81 | 45 | Yes | browser Pre-gig runs preserves invalid nested data through reads and attempted writes |
| 82 | 45 | Yes | browser Pre-gig runs preserves unrepresentable JSON numbers through reads and attempted writes |
| 83 | 45 | Yes | browser Pre-gig presets preserves malformed JSON through reads and attempted writes |
| 84 | 45 | Yes | browser Pre-gig presets preserves empty text through reads and attempted writes |
| 85 | 45 | Yes | browser Pre-gig presets preserves non-array JSON through reads and attempted writes |
| 86 | 45 | Yes | browser Pre-gig presets preserves partly invalid rows through reads and attempted writes |
| 87 | 45 | Yes | browser Pre-gig presets preserves duplicate ids through reads and attempted writes |
| 88 | 45 | Yes | browser Pre-gig presets preserves invalid nested data through reads and attempted writes |
| 89 | 45 | Yes | browser Pre-gig presets preserves unrepresentable JSON numbers through reads and attempted writes |
| 90 | 55 | Yes | browser Pre-gig read denial refuses every dependent mutation and recovers without replacing data |
| 91 | 72 | Yes | browser Pre-gig save run reports a denied write and succeeds only after storage accepts retry |
| 92 | 72 | Yes | browser Pre-gig create preset reports a denied write and succeeds only after storage accepts retry |
| 93 | 72 | Yes | browser Pre-gig edit preset reports a denied write and succeeds only after storage accepts retry |
| 94 | 72 | Yes | browser Pre-gig delete preset reports a denied write and succeeds only after storage accepts retry |
| 95 | 82 | Yes | browser Pre-gig refuses missing providers and missing writer methods |
| 96 | 96 | Yes | browser Pre-gig does not treat a non-string undefined storage read as confirmed absence |
| 97 | 102 | Yes | native Pre-gig bypasses a throwing browser storage getter while browser errors remain typed |
| 98 | 116 | Yes | browser Pre-gig preserves the newest-one-hundred retention rule and complete result details |
| 99 | 127 | Yes | browser Pre-gig retains future preset versions and existing string-JSON records without writes |
| 100 | 137 | Yes | browser Pre-gig refuses unserializable or non-finite new data before replacing prior bytes |

### `tests/pregig-ui.test.mjs`

| Order | Source line | Added | Exact case name |
| ---: | ---: | --- | --- |
| 101 | 15 | No | describeStep: an input pair the interface lacks reads as "no such input", not a failure |
| 102 | 24 | No | describeStep: every engine state has a word and a tone; live states are not chips |
| 103 | 34 | No | verdictView: only deck B unmeasured gives an amber "Not fully checked" that says why |
| 104 | 44 | No | verdictView: red stays red and still notes deck B; green copy is the engine copy |
| 105 | 52 | No | fixButtons: keeps actions, dedupes, info entries have no action |
| 106 | 59 | No | evidenceRows: labels, units, nesting, empties dropped |
| 107 | 67 | No | rerunTargets and mergeRerun: only the chosen steps change and the verdict is recomputed |
| 108 | 78 | No | compareView: trends and headline |
| 109 | 85 | No | profilesForPreset: judges only the rig, not every profile in the library |
| 110 | 91 | No | runMatchesPreset: built-ins match by notes, saved presets by id |
| 111 | 98 | No | time text |
| 112 | 112 | No | controller: full run keeps deck input-pair skip honest, saves once, compares on the second run |
| 113 | 132 | No | controller: cancel keeps partial results as cancelled; rerun merges and saves a new run |
| 114 | 151 | Yes | controller: failed browser persistence retains the completed result and retry never repeats the check |
| 115 | 170 | Yes | controller: overlapping save retries share one write and cannot be replaced by a new run or reset |
| 116 | 185 | Yes | controller: unavailable history does not become an empty baseline or a successful save |
| 117 | 196 | Yes | controller: a failed save after rerun cannot retain the previous result success marker |

### `tests/text-file-boundary.test.mjs`

| Order | Source line | Added | Exact case name |
| ---: | ---: | --- | --- |
| 118 | 50 | No | pre-gig refuses an oversized selected preset before reading or saving |
| 119 | 58 | No | pre-gig catches file read errors and preserves the existing preset collection |
| 120 | 65 | No | pre-gig rejects mismatched read lengths before parsing or saving |
| 121 | 72 | No | pre-gig consumes one strict UTF-8 snapshot while retaining valid Unicode presets |
| 122 | 81 | No | pre-gig rejects malformed UTF-8 without saving a replacement-decoded preset |
| 123 | 106 | No | media import rejects malformed UTF-8 instead of storing replacement text |
| 124 | 114 | No | media import rejects invalid declared sizes before reading |
| 125 | 124 | No | media import rejects mismatched read lengths and preserves normal one-read imports |
| 126 | 133 | No | media import reports byte-read failures without storing a profile |
| 127 | 140 | No | bounded text reads preserve UTF-8 BOM compatibility and measure the byte boundary |
| 128 | 148 | No | bounded text reads reject incomplete reads and non-buffer results before decoding |
