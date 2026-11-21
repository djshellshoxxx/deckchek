# Pre-gig storage and save recovery — FINAL static security HOLD

Date: 2026-11-21

Lane: `/root/pregig_storage_security_round16`

Owned artifact: `docs/engineering/PREGIG_STORAGE_SECURITY_AUDIT_2026-11-21.md`

## Disposition

**FINAL STATIC HOLD.** The frozen round-sixteen candidate is not qualified for
integration or a FIRST execution. Two production integrity issues remain:
preset edits entered while Save is pending can be discarded, and a retained
result's PDF can acquire a later preset's device label. Two independent fixture
defects also prevent the proposed screen selection from supplying reliable
evidence. These are source-derived findings, not reproduced vulnerabilities or
observed runtime failures.

Root directed all lanes to finish a static HOLD on this unchanged freeze after
the code and functional findings. This lane independently assessed those
findings, found the retained-result PDF provenance gap, and independently
confirmed the later shared-host fixture finding. No source or test correction,
project execution, Node identity command, import, syntax check, build, browser
or native launch, scanner, probe, exploit, vulnerability reproduction, CI,
publication or rerun occurred in this lane. No execution proposal is made.
Only Git/source reads and independent Python standard-library byte, JSON and
retained-TAP checks were used.

The corrected work belongs to a distinct successor candidate after all three
current FINAL reports have been preserved. This report does not qualify those
future bytes or override any earlier HOLD.

## Frozen input and independent custody

| Item | Independently verified value |
| --- | --- |
| Branch | `review/deckchek-pregig-storage-security-20261121` |
| Source freeze / initial HEAD | `b7a979cfc24eca569713ff319c5838eaa13d1a34` |
| Source tree | `8fd5bb4744c3f9837728e54f8a046e193af23ea8` |
| Sole freeze parent | `5b2ff5c90cae4838c8beefe4b998a71ea93b4c94` |
| Tracked paths | 2,535 |
| Distinct immutable blobs | 2,277 |
| Sum of tracked source bytes | 87,672,414 |
| Top-level `tests/*.test.mjs` files | 207 |
| Ordered source-map SHA-256 | `fbb02a5e4de05f39edf6480229ec5d74ead7e48882e2d4f3e1ad1788725509a4` |
| Initial and immediately pre-report worktree | Clean; exact tracked inventory |

For every recursive Git-tree entry, the independent check retrieved the immutable
blob, recomputed its Git SHA-1 from the blob header and contents, and compared
every working file's bytes, regular-file type and executable mode. The tracked
inventory and actual top-level test inventory matched exactly. The map digest
above uses the recursive Git tree's ordered list of
`{path,mode,oid,bytes,sha256}` records, compact JSON separators and sorted record
keys. These custody checks establish the identity of all source bytes; semantic
review is limited to the scope described below.

Comparison with completed backup/Service consolidation
`b71a81a849c0bad9f24b4ba7ea40366e86769501` found exactly fourteen changed
paths: three production modules, five selected test files, two new scope/
implementation notes, and four status/handoff documents. No dependency,
permission, schema or native file is among those changes. Independent byte
comparison also established that the core prefix of `app/pre-gig.js` preceding
its storage section, its six-command native adapter block, and the complete
`src-tauri/src/pregig.rs` file are unchanged from that consolidation.

### Changed production file identities

| File | Bytes | Git blob | SHA-256 |
| --- | ---: | --- | --- |
| `app/pre-gig.js` | 56,837 | `7415077ef47cd6f57c8afaf8c6b357a7b571780b` | `0c2c6369bb06fa7e06e52da1d3b15f20f3f49d722d7af1ff2968f66c56370184` |
| `app/ui/screens/pregig.js` | 55,274 | `4edf349460fdc83db8b52eccffd56d6d867ff1f6` | `c2687890a263a74fad03b6e1f8529cd71149eb1be4895855c5afc9e0961dfa38` |
| `app/ui/workflows/pregig.js` | 17,781 | `9defec364e0bbaa843bb4ec9ae194ca2b21e241b` | `49c9f921ea53ae9f9ed57f901c68b8b1198e80c4a87c3a0ad406333228070ad7` |

## Scope, assets and trust boundaries

I read both current implementation/scope notes completely, all three changed
production modules, all five proposed test files, the JSON command contract,
the complete native Pre-gig source, the actual DOM and strict-text fixtures,
and the relevant state, library, catalog, shell, live-feedback, DOM, report and
PDF-export consumers. I also read the completed backup and Service continuation
handoffs. Source references below identify the paths supporting the conclusions.

| Asset or boundary | Security question in this review |
| --- | --- |
| Browser run/preset collection bytes | Does an unknown read stay unknown, and can any dependent mutation replace unreadable data? |
| Persistence acknowledgement | Does the caller receive success only after the selected adapter reports successful persistence? |
| Unsaved in-memory result and preset draft | Does the operation still own the state it saves, replaces, closes or labels? |
| Imported text and stored data shown in the UI | Are byte/JSON boundaries explicit, raw storage failures kept private, and displayed strings treated as text? |
| Exported result provenance | Do the run and device label come from the same retained check snapshot? |
| Native adapter and higher-version presets | Are existing command shapes and the read-only compatibility boundary preserved? |
| Test seams | Do fixture storage, document lifetime and module lifetime represent the consumers whose behaviour is asserted? |

This is a local persistence and UI ownership review. It introduces no remote
service, authentication endpoint, network collector or permission expansion.
The browser adapter is not a security boundary against arbitrary JavaScript
objects or a compromised renderer. Existing native validation and transactions
were inspected as contracts; no native or physical-device qualification was
performed.

## Findings requiring a successor

### SEC-PG16-01 — Later draft edits can be lost after a pending Save

**Severity: Medium — user data preservation and acknowledgement integrity.**

Origin: code lane; independently confirmed in this security lane.

In `app/ui/screens/pregig.js:228`, the Save handler calls `f.check()` and captures
`out` before awaiting persistence. At line 230 it disables only the Save button.
The form's text fields, sample-rate selector, MIDI textarea, needle-up checkbox
and deck controls remain editable; their only general disabling rule is the
separate read-only path at line 201. The form reads name/device/software values
into the captured object at line 203. After the earlier save completes, line 234
closes the still-connected dialog and reports that captured name as saved.

The pending interval includes both the adapter acknowledgement at line 157 and
the subsequent `loadPresets()` wait at line 161. Text edited during either wait
is outside the earlier captured text values, but the success path does not check
for a newer draft revision before closing the form. The user's later entered
values can therefore be discarded while the operation truthfully acknowledged
only the earlier values. This is an ownership gap in the draft-preservation
promise, not evidence that browser storage secretly accepted a failed write.

The proposed pending-save case at
`tests/pregig-storage-screen.test.mjs:130` exercises repeated Save and attempted
Cancel, but makes no change to a draft field during a deferred write or deferred
refresh. It cannot establish preservation of newer edits.

**Bounded correction:** freeze every draft-changing control for the captured
attempt, or retain a draft revision and leave newer edits open after an earlier
revision is acknowledged. Treat acknowledged persistence and a follow-up list
refresh as distinct states. Cover both a delayed write acknowledgement and a
delayed refresh through the real form, including an edit entered during the
pending interval. Root owns that correction on later bytes.

### SEC-PG16-02 — PDF device provenance can diverge from the retained check

**Severity: Medium — report integrity.**

Origin: security lane; code and functional lanes were notified.

The completed/running screen deliberately renders `S.preset` at
`app/ui/screens/pregig.js:368`. Preset editing can replace the same saved ID in
`st.presets` at line 159, while selection is changed automatically only in idle
phase at line 160. The retained check still belongs to its original `S.preset`.

However, `exportRunPdf` at lines 607–610 first awaits printable registration and
then builds data from the mutable `S.run` and
`currentPreset()?.audioDevice`. `currentPreset` at line 92 resolves the current
saved-preset collection. An edit of that same saved preset's interface can
therefore supply a later device label for an earlier retained run.
`app/ui/workflows/pregig-report.js:14` accepts the supplied device directly;
line 17 carries it into report data and `pregigPrintable.device` at line 28
exposes it as the printable device header. The export is not merely carrying
unused metadata.

The registration await also precedes capture of the clicked run, so the
exporter has no retained run/preset pair to carry across that wait. The common
PDF feedback helper accepts an ownership predicate at
`app/ui/persistence.js:111`; this caller does not supply one. These observations
support the same snapshot-ownership correction, without claiming a demonstrated
native export, numerical change, data leak or remote exploit.

**Bounded correction:** capture the retained run and its retained preset before
awaiting registration, and construct the exported data and fallback from that
same snapshot. Define what a replaced/disposed view may still export and what
feedback it owns. Add coverage of the actual export handler with an edited
same-ID preset and deferred registration. The current five-file selection does
not exercise that PDF path.

### SEC-PG16-03 — Screen fixture counts catalog setup as Pre-gig writes

**Severity: Medium — validation blocker, not a production vulnerability.**

Origin: functional lane; independently confirmed in this security lane.

`tests/pregig-storage-screen.test.mjs:22` creates one write recorder, line 25
records every key, line 27 installs that storage globally, and lines 29–32 then
import state/library consumers and call `ensureLibrary()`.
`app/ui/state.js:39` constructs the shared catalog store with that provider.
The library's sync call at `app/ui/devices/library-state.js:33` reaches
`app/catalog-store.js:463`; its browser branch at line 467 calls `mutate`.
The mutation helper at line 386 always calls `saveState`, whose line 43 writes
the catalog key declared as `deckchek.catalog.v1` at line 7. The supplied empty
profile list does not remove that write.

The first screen case nonetheless asserts zero total recorded writes at lines
80 and 83. Those assertions include the unrelated first-mount catalog write.
The selected source therefore contains an internally inconsistent fixture
expectation before its preservation claim can be evaluated as intended.
This does not show that the production Pre-gig adapter overwrote its data.

**Bounded correction:** establish shared setup outside the per-operation
accounting, or record its explicit baseline, and assert the relevant Pre-gig
namespace writes separately. Keep the setup evidence visible; do not suppress
production catalog behaviour or weaken the assertions that original Pre-gig
bytes remain unchanged. The same lifetime decision must be consistent with the
shared state module's captured storage.

### SEC-PG16-04 — Per-case documents conflict with cached feedback hosts

**Severity: Medium — validation blocker, not a production vulnerability.**

Origin: code lane; independently confirmed in this security lane.

Every `mount` in `tests/pregig-storage-screen.test.mjs:18` creates a fresh
document through `installServiceDom`, while lines 29–31 import the same module
URLs repeatedly. The fixture creates new `#toasts`, `#sr-polite` and
`#sr-assertive` nodes and later restores globals; it does not recreate the
already-imported production modules.

`app/ui/live.js:6` holds the three host references at module scope. Its
`ensure()` at lines 8–11 fills each only while it is null. The successful retry
case at screen-test line 127 expects a toast in its own document; later cases
create different documents. The acknowledged-refresh case at line 148 expects
a success toast in its new `#toasts`, whereas `toast` appends to its cached host
at `app/ui/live.js:55`. That mismatch is statically present regardless of the
separate zero-write defect. It can also make negative feedback assertions inspect
an unused host.

**Bounded correction:** give this fixture a stable document and shell hosts for
the lifetime of its shared production modules, with explicit per-case cleanup
of screen state and feedback. Alternatively isolate the entire relevant module
graph and globals together. Root has selected the stable-host approach for a
later candidate. Do not alter production live-region caching merely to satisfy
a fixture that models a different document lifetime.

## Positive source conclusions within the held scope

The following source properties support the direction of the change. They are
not passing test results or an acceptance of the frozen candidate.

- **Unknown storage remains unknown.** The lazy provider and strict read path in
  `app/pre-gig.js:761` treat only a returned `null` as absence. Non-string
  values, malformed JSON, non-arrays, invalid rows, duplicate IDs and non-finite
  numbers in the parsed collection reject. The collection is not filtered into
  a writable subset. All dependent browser mutations read the complete
  collection first; failed reads do not invoke its writer.
- **Browser write acknowledgements follow the storage call.** The write path at
  line 780 validates, serializes with finite-number checks and checks the parsed
  serialized shape before `setItem`. Save returns its ID only afterward,
  upsert returns its row only afterward, and deletion returns true only
  afterward. Missing deletion targets return false without a write. The
  newest-100 rule, existing row creation timestamps and public response shapes
  remain. These claims assume the browser Storage API's ordinary semantics,
  not a malicious replacement provider.
- **Storage messages avoid raw collection/provider details.** The adapter emits
  fixed typed `PregigStorageError` messages. Preset and History load failures
  have persistent generic screen copy. Raw saved JSON and caught provider
  messages do not enter those new error messages. The generic claim is limited
  to these storage paths; `friendly` still displays other existing native,
  file and operational errors.
- **A completed run has an explicit save lifecycle.**
  `app/ui/workflows/pregig.js:213` coalesces pending saves, retains the completed
  run/preset and clears the success marker on failure. A failed previous-History
  read is not converted into an empty comparison baseline. Retry reuses the
  retained completed result; it does not call the measurement engine again.
  Start, rerun and reset guard against a pending save.
- **Result replacement has an explicit decision.** The screen's
  `allowResultReplacement` at line 547 checks busy/disposed state and, after
  confirmation, checks that the same completed run still owns the decision.
  Done, preset changes and full/individual reruns use the guard. Failed preset
  reads and History refreshes retain known rows and display unavailable/stale
  state. The read sequence checks and `dispose` retire pending list
  presentation. These controls do not cure the independent form/PDF findings.
- **Higher-version data remains bounded by the existing read-only contract.**
  The browser row validator accepts existing string-JSON presets and the domain
  parser's future-version result. The screen disables run/edit/duplicate for
  those read-only views. Reads do not migrate or rewrite their stored bytes.
  This preserves compatibility without claiming that this version understands
  higher-version fields.
- **Displayed strings follow text/escaping paths.** The changed screen error,
  preset and History builders use `h(..., {text})`/textContent or the shared
  escape helper. The DOM helper distinguishes text from explicitly trusted
  markup; status chips escape their label. Printable dynamic strings use
  `ctx.esc`. Strict imported-text reads still enforce a declared byte bound,
  matching ArrayBuffer length and fatal UTF-8 decoding before JSON parsing.
  No new dynamic HTML sink was found in the changed paths.
- **The native contract stays separate and unchanged.** The native branch
  returns before browser-storage resolution, retains all six command names and
  argument shapes, and delegates acknowledgement to the existing native API.
  Native source uses bound data parameters; its run transaction returns an ID
  after commit. Existing native preset validation accepts higher integer
  versions for read-only JS presentation. Reading these paths does not qualify
  native execution or the separate application cache/backup protocol.

## Authored selection and retained historical evidence

The five complete original files were read. Independent data-only enumeration
decoded literal test names and expanded only their three reviewed, explicit
template-title loops, in source order. No JavaScript parser/runtime, module
import or extracted implementation was executed.

| File, in proposed order | Named cases | Older names | Added names |
| --- | ---: | ---: | ---: |
| `tests/pre-gig.test.mjs` | 59 | 59 | 0 |
| `tests/pregig-storage-screen.test.mjs` | 15 | 0 | 15 |
| `tests/pregig-storage.test.mjs` | 26 | 0 | 26 |
| `tests/pregig-ui.test.mjs` | 17 | 13 | 4 |
| `tests/text-file-boundary.test.mjs` | 11 | 11 | 0 |
| **Total** | **128** | **83** | **45** |

All 128 names are unique. The compact UTF-8 JSON array of those names, in the
file order above and source registration order within each file, has SHA-256
`3f152afde3a6eaf1ecdc5e6481bf17d5ddd12346c87448fb0e70e795231ef9d5`
(`ensure_ascii=False`, separators `(',', ':')`, no trailing newline). The full
ordered inventory appears in the appendix.

For the 83 older names, I independently read their source at consolidation
`b71a81a849c0bad9f24b4ba7ea40366e86769501`, matched every name exactly once
against the original retained
`docs/engineering/evidence/link-consent-functional-2026-11-21/full/run.tap`,
and confirmed all 83 matched entries say `ok`. The retained TAP is 555,767 bytes
with SHA-256
`e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`
and 2,420 top-level case outcomes. This is historical evidence for different
source bytes. It is not a current run, a prediction of a pass, or qualification
of the changed assertions/fixtures.

The authored cases cover strict reads and writes, recovery, write denial,
future-version preservation, controller save retry, persistent unknown-state
feedback, draft/import retention, confirmation and deferred presentation. The
core file also contains existing synthetic signal/DSP cases, and the strict
text-file file includes unchanged Media import consumers. The screen tests use
a small DOM fixture, mocked browser storage and disabled presentation timers.
They do not establish browser layout, real focus/modality, screen-reader
delivery, native database persistence, native dialogs, PDF output or physical
audio behaviour. SEC-PG16-03 and SEC-PG16-04 prevent treating the selected screen
cases as a sound current gate.

No FIRST was authorized or run for this freeze. With the static HOLD in place,
this lane makes no recorder/configuration approval or current FIRST result
binding. Historical TAP inspection did not become a runtime proposal or
wall-time authorization.

### Selected test file identities

| File | Bytes | Git blob | SHA-256 |
| --- | ---: | --- | --- |
| `tests/pre-gig.test.mjs` | 50,840 | `123e554cbc7fd95ef1335cf11f77ff46c02e8d59` | `f813fa152e82998fa67ea49a2d78a7fa2d0cf214f600ab92b86bc94384c76d12` |
| `tests/pregig-storage-screen.test.mjs` | 17,599 | `a3ea0742c7cdbeaa656576dd79c67f78d4bbcea5` | `689f9926e3c4340d7198feb52dd5df38a0d1421892c099b2fb344565f91b84ba` |
| `tests/pregig-storage.test.mjs` | 9,582 | `610ca5c478224a590e0bb43a047dfc5d50a60451` | `0fc88abc7554c9785a9e0f5dae8cdfdcc8b46f0be84d0a9710ec6d30cc6d6b4f` |
| `tests/pregig-ui.test.mjs` | 14,311 | `76f662a36fc557b74807d5864618f2fcd793ec2c` | `c18d29747b125d940ce273ec9744954b74f913a8343b32d9c082d7c7d9b6be55` |
| `tests/text-file-boundary.test.mjs` | 7,893 | `b8a00e3014d7c885da812a5d304f8c95c5df1d98` | `7e63b3bc04fd1da8a66b15ef20d5956072bec7dca238dece64d7355f2a2f1b23` |

## Limits and preserved handoff

Storage shape checks are a data-consistency contract. They do not provide
cross-tab compare-and-swap, a durable cross-process transaction, or protection
from a renderer that replaces intrinsics/providers. The native and browser
validators have different established bounds; this change does not make their
resource limits identical. Whole stored run collections are parsed before
shape validation, while the strict preset file reader has its separate import
limit. No hostile-object/getter, memory-pressure or exploitation experiment was
performed or proposed.

The screen's disposal/read ownership controls cover reviewed UI presentation.
They do not cancel already submitted native work, implement the separate
native application owner/cache protocol, or establish recovery from app/OS
termination. In-memory unsaved results and drafts are not a crash-recovery
journal. General native/file/PDF error privacy is outside the fixed browser
storage-message claim.

Completed backup round fifteen and Service round fourteen remain separate,
preserved results. Their continuation records report 193/193 and 123/123 FIRST
passes, respectively; neither qualifies this Pre-gig freeze. The backup
consolidation remains
`b71a81a849c0bad9f24b4ba7ea40366e86769501`, including its original reports,
functional wording correction and independent root proofs.

The original full-source audio HOLD remains 2,420 total / 2,418 pass / one
failure / one optional skip, including the previously recorded relative-gain
failure at a played input level of −30 dBFS. No cause is assigned or audio rerun
requested here. Qualified main remains fixed at
`e36ddc41806b0f6639474f207e3b339e063a6e25`; durable Player remains
`f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`. Native #85 remains open,
Service #86 awaits qualified integration, Population Compare #88 remains
queued separately, and Fleet stays default off. No release, deployment,
permission expansion, published-head change or credit-exhaustion claim follows
from this report.

This lane's sole addition is this report. Its report-only commit must have
`b7a979cfc24eca569713ff319c5838eaa13d1a34` as sole parent. The final handoff
supplies the sealed commit/tree/parent, report byte count/SHA-256/Git blob, and
the independent post-seal unchanged-source and clean-worktree check.

## Source references

Paths below are repository-relative; cited line numbers refer to the frozen
source identity above.

| Reference area | Source read |
| --- | --- |
| Current task boundary | `docs/engineering/PREGIG_STORAGE_IMPLEMENTATION_2026-11-21.md`; `docs/engineering/PREGIG_STORAGE_REVIEW_SCOPE_2026-11-21.md` |
| Domain and browser/native adapter | Complete `app/pre-gig.js` |
| Completed-result state | Complete `app/ui/workflows/pregig.js` |
| Real screen and handlers | Complete `app/ui/screens/pregig.js` |
| Native contracts | Complete `tests/contracts/pregig.json`; complete `src-tauri/src/pregig.rs`; native command registrations in `src-tauri/src/lib.rs` |
| Proposed tests | All five files pinned above |
| Actual fixtures | Complete `tests/fixtures/service-screen-dom.mjs`, `tests/fixtures/native-catalog-archive-dom.mjs`, `tests/fixtures/signals.mjs` |
| Shared storage/library consumers | Provider capture in `app/ui/state.js`; complete `app/ui/devices/library-state.js`; catalog key/load/save/mutation/sync paths in `app/catalog-store.js` |
| UI and import sinks | Complete `app/ui/dom.js`, `app/ui/live.js`, `app/text-file.js`; chip renderer in `app/ui/icons.js`; navigation/confirmation in `app/ui/shell.js` |
| Export provenance | Complete `app/ui/workflows/pregig-report.js`; PDF feedback/export path in `app/ui/persistence.js` |
| Prior completed handoffs | `docs/engineering/BACKUP_RECOVERY_CONTINUATION_2026-11-21.md`; `docs/engineering/SERVICE_COMPARISON_CONTINUATION_2026-11-21.md` |
| Historical name match | Original retained `docs/engineering/evidence/link-consent-functional-2026-11-21/full/run.tap`, pinned above |

## Appendix — independently derived ordered case inventory

These are authored test names, not current pass results.

### tests/pre-gig.test.mjs

1. timecode: clean deck passes with no fix needed
2. timecode SNR: 25 passes, 24.9 amber, 20 amber, 19.9 red (AC-3 action and DVS link)
3. timecode balance: 1.5 passes, 1.6 amber, 3 amber, 3.1 red, sign does not matter
4. timecode phase error: 10 passes, 10.1 amber, 20 amber, 20.1 red
5. timecode dropouts: 0 passes, 1 amber, 2 red
6. timecode speed: 1% passes, 1.1% amber (pitch), 5% amber, 5.1% red means wrong format
7. timecode: worst metric wins, every issue gets one fix, unverified format warns
8. timecode: no signal is red with needle, switch and cable advice; missing evidence is skipped, errors are amber-level error
9. timecode: capture problems become actions, not crashes
10. signal level: -50 dBFS passes, -50.1 on either channel is red and names the channel
11. hum: 40 dB below the carrier is amber, 25 dB is red, above 40 passes; hum below the floor margin is ignored
12. hum that could not be measured is amber with a retry, never a silent pass
13. audio: missing interface is red with connection and Sound-settings actions; sample-rate mismatch is amber
14. midi: present passes, optional missing is amber, required missing is red, no backend is unsupported
15. headphones: yes passes, no is red with cue advice, skip or none is skipped
16. software: crash within 1 h red, within 24 h amber, older passes; boundaries inclusive
17. software: not installed and not running are amber with actions; no backend is unsupported
18. system: driver and event findings filtered to the preset gear, warnings amber, errors red, unsupported excluded
19. evidence errors become "Check could not run" with a retry for every kind
20. every red or amber result carries a fix with a label and plain-English text
21. rollUp matrix (AC-2): fail is red, warn or error is amber, skipped required is incomplete, else green
22. rollUp: unsupported steps are excluded from the verdict and mark the check partial (AC-5)
23. rollUp: top problems sorted red, amber, then skipped required; copy matches the spec wording
24. buildPlan orders parallel steps first, then per-deck steps, then the headphone cue
25. buildPlan honours skip and only, drops MIDI and software when the preset has none, and stays inside the 120 s budget
26. built-in presets validate and reference the owner's real gear profile ids and known formats
27. built-in presets load through loadBuiltinPresets and bad ones are reported
28. validatePreset: bad deck ids, duplicates, inputs, formats, rates, MIDI and gear references
29. presets: newer versions are read-only, import rejects >256 kB and junk, export/duplicate round-trip (AC-8)
30. presetFromEquipment builds a valid preset from real profiles; deck B defaults to inputs 3-4 and the format comes from the media library
31. formatForMedia resolves timecode media only, from the library, in any container shape
32. the built-in rigs on a multi-pair interface put deck A on 1-2 and deck B on 3-4 (Traktor Audio 8 DJ)
33. namesMatch is forgiving but refuses tiny fragments
34. diffRuns lists which steps changed and whether they improved (AC-6)
35. synthetic Traktor MK2 timecode from the generator passes both deck steps
36. synthetic: noisy carrier is amber then red as the SNR falls (real analyzeTimecode)
37. synthetic: one muted channel is red, naming the channel; silence is a no-signal red
38. synthetic: dropouts and a wrong-format record are caught
39. synthetic hum: 50 Hz and 60 Hz families are detected and graded against the carrier
40. synthetic needle-up hum is measured on the lifted segment
41. summarizeTimecode exposes plain numbers and handles failures
42. runPregig: an all-ready rig produces a green verdict with every automatic step passing (AC-1)
43. runPregig: deck B captures input pair 3-4 and deck A pair 1-2, so a two-deck rig can be green
44. runPregig: a pair the interface does not offer is reported as no such input, not a failure
45. deckPairFirst maps zero-based deck inputs to the 1-based first channel of a stereo pair
46. runPregig: audio interface missing is red, signal steps are skipped (blocked) and nothing is captured (AC-4)
47. runPregig: a thrown step is an error row, the verdict is amber and the other steps still run
48. runPregig: Esc cancels, finished steps are kept and the rest are skipped (cancelled) (AC-7)
49. runPregig: manual time is reported separately and excluded from the duration
50. runPregig: orchestration overhead with instant mocked captures stays far below 5 s
51. runPregig: CAPTURE_BUSY offers to stop the other capture, retries once and records the choice
52. runPregig: one capture feeds both deck steps; only/skip re-run just the chosen steps
53. runPregig: needle-up hum asks the user, captures the lifted segment and grades it
54. runPregig: no desktop backend leaves required steps skipped and the verdict incomplete (AC-5)
55. createNativeDeps drives the Tauri commands with the pre-gig capture holder and captures the deck input pair
56. toRunInput maps a run to the pregig_save_run contract, redacting Windows user paths
57. createPregigApi (native) sends exactly the contract argument names
58. createPregigApi (browser) stores runs and presets locally with the same shapes
59. contract examples are real step results shapes (states the database accepts)

### tests/pregig-storage-screen.test.mjs

1. Pre-gig screen keeps unavailable preset storage visible across tabs and retries without silently choosing a rig
2. Pre-gig screen distinguishes unavailable History from confirmed empty History and recovers on Retry
3. Pre-gig screen retains previously loaded History with a persistent unavailable message after a failed refresh
4. Pre-gig preset Save keeps the same draft and inline error after denied persistence, then confirms one successful retry
5. Pre-gig preset Save coalesces repeated clicks and keeps the dialog open while persistence is pending
6. Pre-gig keeps an acknowledged preset and truthful success when the subsequent list refresh is unavailable
7. Pre-gig actual Retry and shell Save retain the completed result and never claim persistence before it succeeds
8. Pre-gig saving a different preset keeps an unsaved check attached to the rig it actually tested
9. Pre-gig Done preserves an unsaved result until the user confirms discarding it
10. Pre-gig choosing another preset preserves an unsaved result until the user confirms discarding it
11. Pre-gig running everything again preserves an unsaved result until the user confirms discarding it
12. Pre-gig a late failed History request cannot replace a newer successful read
13. Pre-gig disposal retires a pending History presentation and the Save callback
14. Pre-gig import retains the parsed draft after a failed save and retries without picking the file again
15. Pre-gig displays future-version presets read-only without running or rewriting their contents

### tests/pregig-storage.test.mjs

1. browser Pre-gig treats only a confirmed absent key as an empty collection
2. browser Pre-gig runs preserves malformed JSON through reads and attempted writes
3. browser Pre-gig runs preserves empty text through reads and attempted writes
4. browser Pre-gig runs preserves non-array JSON through reads and attempted writes
5. browser Pre-gig runs preserves partly invalid rows through reads and attempted writes
6. browser Pre-gig runs preserves duplicate ids through reads and attempted writes
7. browser Pre-gig runs preserves invalid nested data through reads and attempted writes
8. browser Pre-gig runs preserves unrepresentable JSON numbers through reads and attempted writes
9. browser Pre-gig presets preserves malformed JSON through reads and attempted writes
10. browser Pre-gig presets preserves empty text through reads and attempted writes
11. browser Pre-gig presets preserves non-array JSON through reads and attempted writes
12. browser Pre-gig presets preserves partly invalid rows through reads and attempted writes
13. browser Pre-gig presets preserves duplicate ids through reads and attempted writes
14. browser Pre-gig presets preserves invalid nested data through reads and attempted writes
15. browser Pre-gig presets preserves unrepresentable JSON numbers through reads and attempted writes
16. browser Pre-gig read denial refuses every dependent mutation and recovers without replacing data
17. browser Pre-gig save run reports a denied write and succeeds only after storage accepts retry
18. browser Pre-gig create preset reports a denied write and succeeds only after storage accepts retry
19. browser Pre-gig edit preset reports a denied write and succeeds only after storage accepts retry
20. browser Pre-gig delete preset reports a denied write and succeeds only after storage accepts retry
21. browser Pre-gig refuses missing providers and missing writer methods
22. browser Pre-gig does not treat a non-string undefined storage read as confirmed absence
23. native Pre-gig bypasses a throwing browser storage getter while browser errors remain typed
24. browser Pre-gig preserves the newest-one-hundred retention rule and complete result details
25. browser Pre-gig retains future preset versions and existing string-JSON records without writes
26. browser Pre-gig refuses unserializable or non-finite new data before replacing prior bytes

### tests/pregig-ui.test.mjs

1. describeStep: an input pair the interface lacks reads as "no such input", not a failure
2. describeStep: every engine state has a word and a tone; live states are not chips
3. verdictView: only deck B unmeasured gives an amber "Not fully checked" that says why
4. verdictView: red stays red and still notes deck B; green copy is the engine copy
5. fixButtons: keeps actions, dedupes, info entries have no action
6. evidenceRows: labels, units, nesting, empties dropped
7. rerunTargets and mergeRerun: only the chosen steps change and the verdict is recomputed
8. compareView: trends and headline
9. profilesForPreset: judges only the rig, not every profile in the library
10. runMatchesPreset: built-ins match by notes, saved presets by id
11. time text
12. controller: full run keeps deck input-pair skip honest, saves once, compares on the second run
13. controller: cancel keeps partial results as cancelled; rerun merges and saves a new run
14. controller: failed browser persistence retains the completed result and retry never repeats the check
15. controller: overlapping save retries share one write and cannot be replaced by a new run or reset
16. controller: unavailable history does not become an empty baseline or a successful save
17. controller: a failed save after rerun cannot retain the previous result success marker

### tests/text-file-boundary.test.mjs

1. pre-gig refuses an oversized selected preset before reading or saving
2. pre-gig catches file read errors and preserves the existing preset collection
3. pre-gig rejects mismatched read lengths before parsing or saving
4. pre-gig consumes one strict UTF-8 snapshot while retaining valid Unicode presets
5. pre-gig rejects malformed UTF-8 without saving a replacement-decoded preset
6. media import rejects malformed UTF-8 instead of storing replacement text
7. media import rejects invalid declared sizes before reading
8. media import rejects mismatched read lengths and preserves normal one-read imports
9. media import reports byte-read failures without storing a profile
10. bounded text reads preserve UTF-8 BOM compatibility and measure the byte boundary
11. bounded text reads reject incomplete reads and non-buffer results before decoding
