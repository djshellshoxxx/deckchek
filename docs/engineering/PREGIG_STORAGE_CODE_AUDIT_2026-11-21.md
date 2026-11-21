# Pre-gig storage and save recovery — round 16 code audit

## Final disposition

**FINAL static CODE HOLD.** The frozen candidate has two concrete application
correctness gaps and two independent defects in the new screen fixture. All four
are P2 blockers for this candidate. Root received the findings and explicitly
withheld FIRST authorization. This lane has preserved the candidate and changed
only this report. Root owns the correction as a distinct successor candidate.

No project code, import, test, syntax check, build, browser, native process,
scanner, probe, extracted implementation or vulnerability reproduction was
executed. The findings below are derived from source and ordinary event/data
flow. No predicted assertion failure is represented as an observed test result.

The code-review skill's standards and specification checks were applied within
the assigned independent lane. The supplied review scope and implementation
note define the requested behavior. No additional worker was spawned. No
concrete separate style or standards violation is asserted; the blockers concern
data preservation, report provenance and the validity of authored coverage.

## Frozen source and independent custody

| Item | Independently verified value |
| --- | --- |
| Branch | `review/deckchek-pregig-storage-code-20261121` |
| Source HEAD | `b7a979cfc24eca569713ff319c5838eaa13d1a34` |
| Source tree | `8fd5bb4744c3f9837728e54f8a046e193af23ea8` |
| Ordered parents | Sole parent `5b2ff5c90cae4838c8beefe4b998a71ea93b4c94` |
| Frozen paths | 2,535 |
| Distinct immutable blobs | 2,277 |
| Sum of tracked file lengths | 87,672,414 bytes |
| Tracked and working top-level `tests/*.test.mjs` | 207; inventories equal |
| Compact ordered source-map SHA-256 | `fbb02a5e4de05f39edf6480229ec5d74ead7e48882e2d4f3e1ad1788725509a4` |
| Entry and pre-report state | Clean; no tracked `AGENTS.md` |

Independent Python standard-library inspection read every distinct frozen blob,
recomputed its Git blob identity from its header and bytes, and compared every
working path's bytes and Git mode against the immutable entry. The complete
verification was repeated before this report was written. The source-map digest
uses a path-sorted array of `{path, mode, oid, bytes, sha256}` records, compact
JSON with sorted object keys and UTF-8 text. It agrees with the assigned freeze.
Test inventories were derived separately from the tree and filesystem.

The candidate implementation is commit
`088af3e9bdbd1184065b48878afad682fa645137`, following completed round 15
consolidation `b71a81a849c0bad9f24b4ba7ea40366e86769501`. The two following
commits consolidate status and freeze the review. Comparing only HEAD with its
sole parent would therefore miss the production change; the review also
compared the candidate with the completed round 15 baseline.

| Changed production file | Bytes | Git blob |
| --- | ---: | --- |
| `app/pre-gig.js` | 56,837 | `7415077ef47cd6f57c8afaf8c6b357a7b571780b` |
| `app/ui/workflows/pregig.js` | 17,781 | `9defec364e0bbaa843bb4ec9ae194ca2b21e241b` |
| `app/ui/screens/pregig.js` | 55,274 | `4edf349460fdc83db8b52eccffd56d6d867ff1f6` |

All three complete production modules and all five complete proposed test files
were read. The review also read the complete contract JSON and native Pre-gig
module, including its source tests, the actual service/native-catalog DOM and
synthetic-signal fixtures, strict text-file reader, DOM builders, live feedback,
shared confirmation dialog, state/catalog/library initialization, Pre-gig
printable adapter and shared PDF-feedback consumer. The implementation/scope
notes and completed backup/Service continuation records were read in full.
Native code was inspected only as source.

## Blocking findings

### C1 — P2: pending preset Save can discard later edits

**Primary evidence:** `app/ui/screens/pregig.js:165–213, 216–242`, particularly
the snapshot at 228, single-button disable at 230 and successful close at 234.
`savePreset` at 155–162 awaits both the adapter acknowledgement and
`loadPresets`, whose builtin fetch and saved-preset read are at 129–152.

The form presents editable name, interface, software, rate, MIDI, needle-up and
deck controls. Save collects the current values into `out`, disables only the
Save button and waits. It prevents Cancel and Esc while `saving` is true, but
leaves the form inputs and deck buttons editable. If a user changes a scalar
field during that interval, the successful operation still acknowledges the
earlier captured value and closes the dialog. The later input is neither saved
nor retained. The interval includes the subsequent read refresh even when a
browser `setItem` has already succeeded; it is not confined to native latency.

The submitted object also retains the form's nested `decks` reference through
the shallow `collect`/spread operations. Deck event handlers mutate that backing
array and its entries. A deferred adapter can consequently observe nested edits
differently from already captured scalar values. This is an ordinary mutable
draft ownership problem, not a claim about a particular native serialization
schedule.

The added pending-save test at
`tests/pregig-storage-screen.test.mjs:130–138` covers repeated clicks, disabled
Save and attempted cancellation. It does not change a field while the operation
is pending, so it does not establish the draft-preservation claim under this
interleaving. The denied-write case does correctly assert preservation of the
same input elements and their values when no later edit is made.

**Bounded correction:** detach the submitted snapshot and give the pending
operation explicit ownership of its form revision. Either disable all editable
form controls for that revision, restoring their previous disabled states after
failure, or retain a newer dirty revision and leave it visible after the earlier
save acknowledges. Separate persistence acknowledgement from an optional read
refresh so an unrelated delayed read does not unnecessarily own a nondismissible
save dialog. Add actual-screen deferred-write and deferred-refresh cases that
exercise scalar and deck edits and assert exactly which revision was saved and
which input remains visible. Root owns the implementation choice.

This lane discovered the issue and security independently confirmed it. Root
accepted it as a blocker and withheld FIRST.

### C2 — P2: the first new screen case counts catalog setup as a Pre-gig write

**Primary evidence:** `tests/pregig-storage-screen.test.mjs:15–43, 71–85`;
`app/ui/state.js:39–42`; `app/ui/devices/library-state.js:23–42`;
`app/catalog-store.js:42–43, 385–386, 463–467`.

The fixture installs its write-recording `localStorage` before importing the
actual screen and shared state. The shared state module creates its catalog
store with that storage. `mount` then explicitly awaits `ensureLibrary`.
The fixture's profile fetch supplies an empty array, but the actual library
still calls `store.syncDeviceProfiles([])`. The browser catalog mutation helper
unconditionally calls `saveState`, which writes `deckchek.catalog.v1`.

The first screen case subsequently asserts `f.writes.length === 0` at lines 81
and 84. That array includes the completed catalog initialization write, so its
domain is broader than the Pre-gig behavior under review. This is a fixture
accounting error, not evidence that Pre-gig overwrites the damaged preset key.
The source shows the unavoidable setup path; no assertion was executed.

**Bounded correction:** give shared bootstrap its own explicit accounting, or
assert only the exact Pre-gig keys relevant to this contract. Preserve raw
collection equality and forbidden Pre-gig mutation assertions. Retain the actual
catalog/library modules and verify that setup did not accidentally hide a
Pre-gig write. A stable shared-shell fixture must also account for the singleton
catalog store's storage lifetime when resetting individual case data.

Functional first reported this issue; this lane independently followed the
complete fixture → state → library → catalog write path.

### C3 — P2: PDF metadata can relabel a retained result with an edited rig

**Primary evidence:** `app/ui/screens/pregig.js:95, 155–162, 366–370,
606–610, 634–641`; `app/ui/workflows/pregig-report.js:14–20, 25–28`;
`app/ui/persistence.js:111–140`.

The new check rendering correctly uses `S.preset` for a running or completed
result. Saving an edit replaces the matching row in `st.presets` while the
completed controller result remains retained. With the same preset ID,
`currentPreset()` therefore resolves to the edited rig, whereas `S.preset`
still identifies the rig used for the check.

`exportRunPdf` continues to obtain `device` from `currentPreset().audioDevice`.
The printable data adapter copies that value, and the printable kind uses it as
the report device. Editing a saved preset's interface after completing a check
can consequently produce a PDF whose device header describes the new interface
while its results came from the previous rig. This is a retained-result contract
gap at an unchanged export consumer, exposed by the newly explicit snapshot
semantics; it is not claimed to be a newly introduced PDF implementation.

The exporter also reads `S.run` only after awaiting printable registration. A
reset or replacement during that await can change which run is exported or
remove it. The shared PDF wrapper already accepts an `isCurrent` callback, but
the Pre-gig caller supplies neither an explicit captured run/preset pair nor an
ownership predicate. Its file-fallback closure also consults current state.

**Bounded correction:** capture the completed run and its associated preset
before asynchronous registration, and bind export data, feedback and fallback
to that explicit ownership. Either retire an obsolete request or deliberately
finish exporting its captured snapshot consistently. Add a production-screen
regression that edits the same saved preset before exporting and checks the
tested interface in print data, plus a deferred-registration replacement case.
The five-file proposal currently has no such export ownership assertion.

Security first reported the concrete PDF provenance issue. This lane
independently verified the screen, print-data and shared export call chain.

### C4 — P2: fresh per-case documents conflict with cached toast/live hosts

**Primary evidence:** `tests/pregig-storage-screen.test.mjs:15–32,
112–150`; `tests/fixtures/service-screen-dom.mjs:104–132`;
`app/ui/live.js:6–11, 23–36, 43–55`.

Each `mount` installs a new document with new `#toasts`, `#sr-polite` and
`#sr-assertive` elements. The production modules are imported through the same
URLs and retain their module state within the test file. The actual live module
caches those three element references using `??=`; replacing the global
document does not rebind them.

In source order, the denied-save/retry case emits a success toast and expects it
in its document at line 127. A following case creates another document, and the
acknowledged-save/failed-refresh case then expects its success toast in that new
document at line 148. Production `toast` still appends to the earlier cached
host. The current case's freshly created host therefore cannot serve as valid
evidence for the expected success feedback. Conversely, checking that an empty
new host contains no stale toast can miss feedback written into an older host.
The same lifetime mismatch affects cached live-region elements.

**Bounded correction:** keep one real fixture shell document and stable host
identities for the lifetime of the file's production module graph. Reset
case-owned sections, dialogs, feedback content, controller state and storage
seams between cases, and dispose owned listeners. Maintain the actual live
module and the positive/negative feedback assertions. Do not suppress the toast
assertion or substitute a passing production-module mock.

This lane found and reported this separate blocker after reading the actual
shared live consumer. Root acknowledged it and selected a stable-shell fixture
approach for the successor. The held fixture remains unchanged.

## Supported source behavior and practical limits

The browser API returns from its native branch before resolving browser
storage, preserving the six command names and argument shapes in
`tests/contracts/pregig.json` and the Rust command boundary. Browser reads treat
only an actual `null` value as absence; invalid collections are rejected as a
whole, including duplicate IDs and non-finite parsed numbers. Failed reads do
not enter a replacement write. Serialization and row validation precede
`setItem`, and an operation reports success only after that call returns.
The existing newest-100 run policy, response construction and preset creation
timestamps remain recognizable. Future-version and existing string-JSON preset
data remain accepted according to the existing domain contract.

The controller installs its shared save task before notifying listeners,
retains the completed result after a persistence failure, prevents replacement
while saving and retries without executing measurements again. Failed saves
clear previous success markers. Previous-History lookup errors are not silently
converted to a confirmed empty comparison baseline. The screen's persistent
read-error state, retained known rows, explicit retry and request sequence checks
substantially address the original unknown-versus-empty confusion.

These observations are static support for the intended design, not a runtime
acceptance. Browser collection consistency is not a sandbox for arbitrary
JavaScript objects. The new DOM cases model element identity and synchronous
event delivery with deferred adapter responses and suppressed presentation
timers. They cannot qualify real browser layout, focus, modal behavior, native
storage, physical audio, platform file dialogs or native owner/exit barriers.
The preserved synthetic DSP cases exercise authored numerical fixtures if a
future gate is separately authorized; they were only read here.

## Independently derived proposed case inventory

The inventory below was derived from complete test-source declarations and
explicit table expansion, not copied from the implementation estimate. The
storage file contains eight literal cases, fourteen cases from the two
collections × seven invalid-state labels, and four denied-write operations.
The screen file contains twelve literal cases and three discard-action cases.
The other three files use literal names.

| Proposed file, in review order | Declarations | Expanded cases | Older names | Additions |
| --- | ---: | ---: | ---: | ---: |
| `tests/pre-gig.test.mjs` | 59 | 59 | 59 | 0 |
| `tests/pregig-storage-screen.test.mjs` | 13 | 15 | 0 | 15 |
| `tests/pregig-storage.test.mjs` | 10 | 26 | 0 | 26 |
| `tests/pregig-ui.test.mjs` | 17 | 17 | 13 | 4 |
| `tests/text-file-boundary.test.mjs` | 11 | 11 | 11 | 0 |
| **Total** | **110** | **128** | **83** | **45** |

Ordered-name digest:
`f3774cb427a52d3694976c36c80e2af4b32bc90a53edeea2d87158c0f7ebb676`.
Its encoding is a UTF-8 compact JSON array of `{file, name}` objects, sorted
object keys, files in the displayed order and names in source/loop order.
The complete expanded list is retained in the appendix of this owned report.

The 83 older names were independently compared with the preceding baseline
source and matched one-to-one to passing named records in retained original
`docs/engineering/evidence/link-consent-functional-2026-11-21/full/run.tap`.
That TAP is 555,767 bytes, SHA-256
`e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`.
Their recorded case durations sum to **14,628.461681 ms**. This is a historical
per-case sum, not an observed wall time for the proposed five-file selection.

For planning only, a 120-second wall ceiling would allow about 8.2 times that
historical sum for startup, the 45 additional cases and ordinary variability.
It is not a launcher or an approved budget, and it does not justify executing
this held candidate. A corrected successor must rederive its own selection and
have any exact launcher, controls, runtime and bound reviewed separately.
The two changed core assertions and the updated text-import fixture retain
older case names; their historical passes do not qualify the changed bytes.
No FIRST was authorized, so there is no new recorder, runtime result or retained
FIRST binding for this lane to accept.

## Handoff and preserved boundaries

Root will prepare a distinct successor after all three round 16 FINAL reports.
The four bounded corrections above are returned to root; no production or test
repair has been made by this lane. The final report commit has the assigned
freeze as its sole parent and adds only this file. Its exact commit/tree,
report byte length, SHA-256 and blob identity are supplied in the external
FINAL handoff, with a clean-state check and verification that every original
tree entry and working byte/mode remains unchanged.

The completed round 15 backup 193/193 FIRST and round 14 Service 123/123 FIRST
remain separate preserved qualifications. The original complete-source audio
HOLD remains 2,420 total / 2,418 pass / one failure / one optional skip; this
review neither repairs nor reruns it. Native #85 remains open. Population
Compare #88 is outside this review. Fleet remains default off and its separate
timing hold remains in force.

Qualified main remains `e36ddc41806b0f6639474f207e3b339e063a6e25`; durable
Player remains `f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`. Earlier published
heads, native permissions, dependencies, schemas and diagnostic thresholds
are unaffected. No release, deployment, CI, browser/native qualification,
permission expansion, history rewrite, separately billed model job or claim
of exhausted credits follows from this report.

## Appendix — complete ordered authored case names

The following list records source-derived coverage only. It is not a test run.

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

60. Pre-gig screen keeps unavailable preset storage visible across tabs and retries without silently choosing a rig
61. Pre-gig screen distinguishes unavailable History from confirmed empty History and recovers on Retry
62. Pre-gig screen retains previously loaded History with a persistent unavailable message after a failed refresh
63. Pre-gig preset Save keeps the same draft and inline error after denied persistence, then confirms one successful retry
64. Pre-gig preset Save coalesces repeated clicks and keeps the dialog open while persistence is pending
65. Pre-gig keeps an acknowledged preset and truthful success when the subsequent list refresh is unavailable
66. Pre-gig actual Retry and shell Save retain the completed result and never claim persistence before it succeeds
67. Pre-gig saving a different preset keeps an unsaved check attached to the rig it actually tested
68. Pre-gig Done preserves an unsaved result until the user confirms discarding it
69. Pre-gig choosing another preset preserves an unsaved result until the user confirms discarding it
70. Pre-gig running everything again preserves an unsaved result until the user confirms discarding it
71. Pre-gig a late failed History request cannot replace a newer successful read
72. Pre-gig disposal retires a pending History presentation and the Save callback
73. Pre-gig import retains the parsed draft after a failed save and retries without picking the file again
74. Pre-gig displays future-version presets read-only without running or rewriting their contents

### tests/pregig-storage.test.mjs

75. browser Pre-gig treats only a confirmed absent key as an empty collection
76. browser Pre-gig runs preserves malformed JSON through reads and attempted writes
77. browser Pre-gig runs preserves empty text through reads and attempted writes
78. browser Pre-gig runs preserves non-array JSON through reads and attempted writes
79. browser Pre-gig runs preserves partly invalid rows through reads and attempted writes
80. browser Pre-gig runs preserves duplicate ids through reads and attempted writes
81. browser Pre-gig runs preserves invalid nested data through reads and attempted writes
82. browser Pre-gig runs preserves unrepresentable JSON numbers through reads and attempted writes
83. browser Pre-gig presets preserves malformed JSON through reads and attempted writes
84. browser Pre-gig presets preserves empty text through reads and attempted writes
85. browser Pre-gig presets preserves non-array JSON through reads and attempted writes
86. browser Pre-gig presets preserves partly invalid rows through reads and attempted writes
87. browser Pre-gig presets preserves duplicate ids through reads and attempted writes
88. browser Pre-gig presets preserves invalid nested data through reads and attempted writes
89. browser Pre-gig presets preserves unrepresentable JSON numbers through reads and attempted writes
90. browser Pre-gig read denial refuses every dependent mutation and recovers without replacing data
91. browser Pre-gig save run reports a denied write and succeeds only after storage accepts retry
92. browser Pre-gig create preset reports a denied write and succeeds only after storage accepts retry
93. browser Pre-gig edit preset reports a denied write and succeeds only after storage accepts retry
94. browser Pre-gig delete preset reports a denied write and succeeds only after storage accepts retry
95. browser Pre-gig refuses missing providers and missing writer methods
96. browser Pre-gig does not treat a non-string undefined storage read as confirmed absence
97. native Pre-gig bypasses a throwing browser storage getter while browser errors remain typed
98. browser Pre-gig preserves the newest-one-hundred retention rule and complete result details
99. browser Pre-gig retains future preset versions and existing string-JSON records without writes
100. browser Pre-gig refuses unserializable or non-finite new data before replacing prior bytes

### tests/pregig-ui.test.mjs

101. describeStep: an input pair the interface lacks reads as "no such input", not a failure
102. describeStep: every engine state has a word and a tone; live states are not chips
103. verdictView: only deck B unmeasured gives an amber "Not fully checked" that says why
104. verdictView: red stays red and still notes deck B; green copy is the engine copy
105. fixButtons: keeps actions, dedupes, info entries have no action
106. evidenceRows: labels, units, nesting, empties dropped
107. rerunTargets and mergeRerun: only the chosen steps change and the verdict is recomputed
108. compareView: trends and headline
109. profilesForPreset: judges only the rig, not every profile in the library
110. runMatchesPreset: built-ins match by notes, saved presets by id
111. time text
112. controller: full run keeps deck input-pair skip honest, saves once, compares on the second run
113. controller: cancel keeps partial results as cancelled; rerun merges and saves a new run
114. controller: failed browser persistence retains the completed result and retry never repeats the check
115. controller: overlapping save retries share one write and cannot be replaced by a new run or reset
116. controller: unavailable history does not become an empty baseline or a successful save
117. controller: a failed save after rerun cannot retain the previous result success marker

### tests/text-file-boundary.test.mjs

118. pre-gig refuses an oversized selected preset before reading or saving
119. pre-gig catches file read errors and preserves the existing preset collection
120. pre-gig rejects mismatched read lengths before parsing or saving
121. pre-gig consumes one strict UTF-8 snapshot while retaining valid Unicode presets
122. pre-gig rejects malformed UTF-8 without saving a replacement-decoded preset
123. media import rejects malformed UTF-8 instead of storing replacement text
124. media import rejects invalid declared sizes before reading
125. media import rejects mismatched read lengths and preserves normal one-read imports
126. media import reports byte-read failures without storing a profile
127. bounded text reads preserve UTF-8 BOM compatibility and measure the byte boundary
128. bounded text reads reject incomplete reads and non-buffer results before decoding
