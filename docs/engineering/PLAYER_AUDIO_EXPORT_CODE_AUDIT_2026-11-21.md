# Player captured-audio export — code audit, 21 November 2026 UTC

## Decision and review boundary

Disposition: **ACCEPT the scoped provisional local export and retained first
evidence; no material source, regression-oracle or evidence-integrity blocker
found.** The initial source decision was static, while the source was still
unexecuted. After all three source lanes accepted and root separately authorized
the functional lane, the first seven-file focused gate passed 111/111 and the
separate first changed-smoke syntax check passed. Both original records and the
complete evidence package were independently verified below. This does not
clear complete-source qualification.

The assigned code lane used only source reads, Git reads and independent Python
byte/hash/data checks. It did not execute a project module, import, test, syntax
check, browser, native program, scanner, probe, extracted implementation,
recorded driver or packaged verifier. Its only write ownership is this report;
root owns fixes, integration, publication and CI. No nested reviewer was created.

The preceding complete-source **HOLD** remains. Round ten's original first gate
at `f1e0ca1fdcaf6c8276f5a92e883b84fc001bf425` retained 2,420 total / 2,418 pass /
one fail / one optional skip. Case 53 failed its final relative-gain assertion
with **-101 dB at -30 dBFS**, after the earlier cap and lower-level assertions
passed. All 14 new link cases and the separate first link-smoke syntax check
passed. No numerical cause, repair or rerun is established. The completed
[link-consent continuation](LINK_CONSENT_CONTINUATION_2026-11-21.md) preserves
that history. Qualified main `e36ddc41806b0f6639474f207e3b339e063a6e25` is a
different source and does not qualify this preparation.

## Frozen source and scope

| Identity | Value |
| --- | --- |
| Code branch | `review/deckchek-player-audio-export-code-20261121` |
| Fixed completed-link comparison | `33e077f3bf45dad96ba1c6de341a0d9fe8efa594` |
| Authored Player parent, first | `fb2a34a74a9e7b0ff4ba205269c8ee517f059cef` |
| Completed-link parent, second | `33e077f3bf45dad96ba1c6de341a0d9fe8efa594` |
| Reviewed preparation | `445a66ef402cb88aa5a089adc3b717046728ba48` |
| Complete preparation tree | `280f18dc58d5786882792ddff8906dc4230d25bd` |
| Tracked files / actual and tracked top-level tests | 2,392 / 203 |
| Distinct Git blobs / bytes summed across tracked paths | 2,182 / 76,818,229 |

Initial HEAD, tree, ordered parents, branch and empty working status matched the
assigned freeze. The comparison has exactly seven changed paths, 657 insertions
and 12 deletions. An independent byte check read all 2,392 working paths and
recomputed each Git blob identity; every path matched the frozen mode/blob
entry. Actual and tracked top-level `tests/*.test.mjs` inventories both contain
the same 203 paths.

| Reviewed changed file | Bytes | SHA-256 |
| --- | ---: | --- |
| `app/player/audio-export.js` | 9,898 | `8cb015f9fa07222ed76eca8a6f3064de29004b990d0dc48cb391e66528e7f7b0` |
| `app/styles/player-capture.css` | 1,009 | `4fe01134c232e103be7ced710818d04ba55f9baa97d07c23a63a6cbb0f428de6` |
| `app/ui/screens/player-capture.js` | 22,033 | `6e1f3af5b5db9ff300b962eff4a90410b70cb66685de139697b7cddec2afd138` |
| `docs/engineering/PLAYER_AUDIO_EXPORT_IMPLEMENTATION_2026-11-21.md` | 6,156 | `e5f9aa6dc228afcdb292409e28e570e0c332a5442470659cd8cebe76f1119a04` |
| `tests/player-audio-export.test.mjs` | 12,255 | `8f30e6199625f4d37e2e015b7a72df13a654e27c7f101d5fdfb370ef53648744` |
| `tests/player-capture-screen.test.mjs` | 33,635 | `c45637a4c459ba1b1f89331ce364a4f7831d9d644c684307c06a7b6950946259` |
| `tools/smoke/player-capture.mjs` | 20,997 | `d04df702031d9180d8c6040b1e4c6a475b2d6ea76d77cab9f6258b82fe1d3369` |

The complete changed source, tests, smoke and
[implementation contract](PLAYER_AUDIO_EXPORT_IMPLEMENTATION_2026-11-21.md)
were read. Relevant full modules read include acquisition, evidence record,
reference-file identity, SHA-256, ZIP writer, audio adapter/session ownership,
DOM/download helpers, shell lifecycle, feature registry and app wiring. The
review also read SPEC-10, SPEC-15, SPEC-16 and SPEC-19 in full. Their broader
diagnostic, persistence, recovery and scientific requirements remain unfinished;
the implementation note explicitly limits this addition to provisional local
transport. Historical statements about the earlier metadata-only preview do not
become qualification claims for this successor.

## Spec and contract review

### Explicit retention, ownership and lifecycle

The new checkbox has no checked default. `begin()` snapshots its value together
with the operator assertions, reference descriptor, input and pair selection
before acquisition awaits. A changed control cannot retroactively enable audio
retention for an already running capture. On the default path the screen never
reads `captured.audio` or calls the archive preparer; both the normal details
action and `onExport` used by Ctrl+E still serialize exactly `acquisition`,
`record` and `selectedReference`.

Optional preparation begins only after `runCdjAcquisition` resolves. The existing
controller awaits its own session's `stop()` and the live adapter releases its
listener, polling and lease registration in `finally`. The export helper opens
no new input and assumes no ownership of another capture. During preparation
the screen remains busy and retains the same cancellation identity. A failed
optional preparation is caught separately, records a bounded explanation and
leaves valid capture details available for metadata export.

The settled screen state stores the bounded archive, acquisition/record metadata
and the reference descriptor, not the mutable capture arrays. `discard()` is the
common invalidation point used by Clear, another capture and reference changes.
Hide, feature-driven navigation and disposal abort the pending request and
discard state. The `active(request)` check is repeated after acquisition,
preparation and errors; a late provider result cannot republish an obsolete
archive. The shell's existing feature handling invokes `onHide` when disabling
the active Player route. Disposal also removes the settings subscription and
pair-picker listener ownership.

Cancellation is logical publication suppression. Already running hashes and
synchronous conversion are not physically interrupted, and no immediate memory
zeroization or garbage-collection timing is promised. The local capture object
may remain referenced while preparation is pending. These are documented limits
of the bounded asynchronous flow, not an assertion that buffers disappear when
the user presses Cancel.

### Archive bytes and provenance

The helper requires the acquisition and evidence schema versions, distinct
UUID-shaped run/capture IDs and a matching record run ID. Evidence normalization
rebuilds qualification as unverified, report-ineligible and measurement-null.
Caller-supplied qualification fields cannot grant diagnostic eligibility.

Channels must be nonempty matching `Float32Array` instances backed by ordinary
`ArrayBuffer`s. The nominal rate, selected pair, source mono/stereo mode,
normalized evidence rate/pair, completed timestamp and every observed/returned
primary count must agree. Missing native sample/rate/pair observations remain
missing; adapter compatibility defaults cannot satisfy these guards. The
acquisition controller and adapter establish these observations before the
helper is called. This agreement check establishes internal consistency, not
proof that arbitrary replacement samples came from particular hardware.

Each output frame is written explicitly as little-endian left then right
float32, eight bytes per frame. The helper preserves the returned normalized
values, including negative zero, and rejects non-finite values. It does not
resample, scale or clip during export. Mono mode retains both returned channels
and labels its source mode; it does not pretend that two encoded channels imply
a two-channel hardware source. Nominal rate is separate from the null measured
rate and unknown source hardware format.

All sample conversion and plain metadata copying complete before the first
await. Asynchronous hashing sees private PCM and encoded metadata, so later
caller mutation cannot change the payload being hashed. Acquisition metadata
is copied; only the archive copy gains `export_archive_payload` retention and
`audio/primary.f32le` evidence references. The caller's frozen acquisition and
the metadata-only export retain `ephemeral_audio_only` with empty references.
Quality counters, incomplete state, reasons and driver messages remain in the
archive. Saving those observations cannot make an incomplete capture complete.

The four entry names are fixed: `manifest.json`, `capture.json`,
`audio/primary.f32le` and `README.txt`. The filename derives from the validated
run UUID. Operator and reference filenames cannot choose ZIP entry paths. The
manifest binds run/capture identity, captured time, frame count, nominal rate,
pair/mode, sample basis and exact length/SHA-256 for each of the other three
entries. The README explains the headerless PCM format; no self-playing WAV
claim is made. SHA-256 establishes content identity only, with explicit limits
for hardware, clock, continuity, calibration and playback authentication.

An optional reference descriptor is copied and checked against the normalized
record's SHA-256, accepted file-size/name contract and unverified playback/
nonretention fields. Reference bytes are never added. The screen receives this
descriptor from the existing immutable selected-file helper; its acquisition
snapshot is used consistently by both exports.

### Bounds, compatibility and user-facing behavior

The helper rejects more than 18 MiB of PCM before allocating the interleaved
buffer. The unchanged shared ZIP writer applies its existing 20 MiB total cap,
including record/name overhead and UTF-8 payload sizes. The returned archive
therefore remains bounded without widening the general archive limit. Large
captures can fail optional packaging and still preserve metadata; the message
offers a shorter capture.

Before JSON encoding, metadata traversal has depth, field-count, array-length,
string-length and total-text budgets. Own data descriptors are read without
calling ordinary accessors; non-plain objects and non-finite values are refused.
The resulting capture JSON is additionally limited to 128 KiB. These guards
bound ordinary production metadata, which originates from the acquisition's
bounded frozen records. They are not a sandbox for already executable malicious
JavaScript proxies, custom typed-array subclasses or a compromised runtime.

The new action remains disabled until a retained archive exists. Each download
receives a new byte array, so mutation by one consumer cannot affect another
download. The existing DOM helper constructs a local Blob/object URL, requests
the download and later revokes the URL. The new status correctly says that a
download was requested; it does not report confirmed filesystem persistence.
There is no new native command, upload, History/report write, application-storage
record, archive import or permission change.

Labels and help distinguish default-off retention, normalized samples, metadata
contents, selected-reference exclusion and the in-memory lifetime. Device names,
driver messages and operator assertions are disclosed as part of an explicit
local export. This does not close the separate diagnostic-export privacy work
in issue #69. Result and error strings use the shared text-node path, and the
checkbox is associated with its label/help and a 24px CSS target. Browser layout
and platform download behavior still require their own executed evidence.

Spec axis: zero material missing, incorrect or extraneous requirements found
for this bounded transport contract. The broader proposed Player diagnostic
and raw-reference retention remain incomplete as documented.

## Standards and regression-oracle review

The Code Review skill's standards and specification axes were considered within
the assigned single code lane. The fixed source/ownership instructions override
the skill's generic request for additional subagents or issue setup. No separate
tracked coding-standard, contributor or issue-tracker instruction was found.
The implementation retains the repository's dependency-injected screen actions,
plain ES modules, shared ZIP/hash helpers and text-node DOM builder. The helper
is isolated from UI, native ownership and storage. No dependency or speculative
framework is added, and no blocking maintainability concern was identified.

The nine new helper tests use the real `payloadToAudio` and acquisition pipeline.
Their independent ZIP reader inspects central/local records and fixed entry
order; it does not use an application archive reader. The exact PCM oracle is a
fixed hex sequence including negative zero and distinct signed left/right
samples. Node crypto independently checks every payload digest. Other cases
cover pre-await snapshots, reference identity without reference bytes, preserved
faults/unverified normalization, explicit mono mode, missing observations,
mismatched channels/rate/pair, wrong array type, distinct capture identity,
over-limit versus exact-limit PCM, oversized/accessor-backed metadata and
cancellation before/during hashing.

The ten new screen cases exercise the real screen handlers and, where useful,
real acquisition and archive preparation. The default-path oracle uses an audio
getter that would throw if inspected. Other cases inspect archive MIME/bytes,
metadata-only Ctrl+E, independent repeat-download bytes, preparation failure,
snapshotted consent, stale archive suppression after Cancel/hide/disposal, native
stop before preparation, and invalidation by a new capture or leaving. Existing
screen cases retain native detection, selected-pair wiring, metadata, reference,
shell navigation/feature disable, capture loss/preemption and ownership checks.
Their bounded DOM/native fixtures do not establish real browser layout or
hardware behavior.

The authored smoke retains its earlier default capture and ownership flows,
then opts in and reads the actual browser-delivered ZIP. Its independent ZIP
parser, Node crypto digests and modeled native sample comparison check the
delivered bytes, identity and provisional format. The new flow checks readiness
before download, no diagnostic History writes and Clear disabling both exports.
It remains authored browser coverage unless separately executed; a changed-file
syntax result can establish parsing only.

Standards axis: zero material documented-standard violations or blocking
regression-oracle/maintainability findings in the scoped source.

## Retained first execution evidence

### Reviewed external controls

Both complete external recorders and their configurations were read as source,
without execution. Independent byte checks matched their supplied identities
and every selected-source size/hash against frozen Git. Both first-output
directories were absent when this control review was made. The controls live
outside the project checkout and refuse an existing output directory; an error
or timeout cannot silently create authorization for a replacement run.

| Original external control | Bytes | SHA-256 |
| --- | ---: | --- |
| Syntax recorder | 17,261 | `96594744e8fb76cf6c40a19b899a805f855dba0809c5db8441aee0f724be498d` |
| Syntax selection | 709 | `cdc68a8f9d40c6f0fe08cd64054f572282b381d42ed071f726b580461cacdccb` |
| Focused recorder | 18,343 | `d41731c5be8fae1455cc2b57a741b3706f727c04001a9d3d7a91b5f64bbd3250` |
| Focused selection | 2,197 | `fe9908bef44f52677cca878beb5e0b9b652ec07913ca4b815546e0c986ca33db` |

The recorder names are
`deckchek-player-audio-export-round11-{syntax,focused}-recorder.py` and the
configuration names end in `-{syntax,focused}-selection.json`, under
`/workspace/scratch/6f2247f2f463/`. Their functional checkout is pinned to the
reviewed clean branch, HEAD/tree and ordered parents. Each records all 2,392
source hashes and immutable tree entries, actual/tracked 203-test inventories,
runtime identity streams and complete process outputs. They reject
`NODE_OPTIONS`, `DECKCHEK_AUDIO_*` and `MIXXX_CONTROLLERS_DIR`; their only
environment change prepends the absolute pinned Node directory to `PATH`.

Syntax is only the absolute Node v24.22.3 command with
`--check tools/smoke/player-capture.mjs`, a 30-second ceiling, TERM at 25 and
KILL by 30 if needed. It does not import or run the smoke. The separate focused
command uses `--test --test-concurrency=1 --test-reporter=tap` with this ordered
seven-file selection: canonical, CDJ acquisition, CDJ evidence record, Player
audio export, Player capture screen, Player reference file and ZIP writer.
Its ceiling is 120 seconds, TERM at 115 and KILL by 120. The selected unchanged
ZIP writer test includes its existing bounded Python `-I` zipfile compatibility
subprocess; the recorder explicitly discloses it. All seven focused test files
and the shared DOM fixture were read in full.

### Original outcomes

The functional lane ran exactly the two separately authorized first project
invocations, sequentially. Its original syntax success and final unchanged
source record precede the focused recorder's start. The retained controls,
runtime identity calls and selected-source byte pins are the ones reviewed
above. No replacement outcome or full-suite invocation is part of this round.

| First invocation | Original result | Project elapsed time |
| --- | --- | ---: |
| Changed Player smoke syntax | Exit 0; no timeout; stdout/stderr empty | 0.06412778599769808 s |
| Seven-file focused serial TAP | 111 tests / 111 pass / 0 fail / 0 skipped / 0 cancelled / 0 todo; exit 0; no timeout; stderr empty | 3.273620218002179 s |

| Selected file | Ordered outcomes | Pass |
| --- | --- | ---: |
| `tests/canonical.test.mjs` | 1–9 | 9 |
| `tests/cdj-acquisition.test.mjs` | 10–26 | 17 |
| `tests/cdj-evidence-record.test.mjs` | 27–36 | 10 |
| `tests/player-audio-export.test.mjs` | 37–45 | 9 |
| `tests/player-capture-screen.test.mjs` | 46–85 | 40 |
| `tests/player-reference-file.test.mjs` | 86–95 | 10 |
| `tests/zip-writer.test.mjs` | 96–111 | 16 |

All 19 new feature cases passed: nine helper cases at 37–45 and ten screen cases
at 76–85. The existing Python zipfile compatibility case is present and passed
at 106. The original focused TAP is 25,096 bytes, SHA-256
`9cbf80ee04a33ee38f1a2a454ba0831436b6d31c316e1e9b871e0b574cdb03fe`.
Both complete final result records and every original TAP block were read. An
independent data parser checked consecutive indices, every subtest header and
outcome name/status, complete block boundaries, durations, plan and footer. The
111 names were also matched, in order, to the seven static test sources,
including their explicitly expanded parameterized screen cases. The passing
focused case numbered 53 is a route-hide lifecycle case; it is unrelated to the
preceding full gate's failed audio case numbered 53.

Both original executions retained the frozen clean branch/HEAD/tree/ordered
parents and unchanged source maps/inventories. Initial running records, complete
argument arrays, budgets, selected test order, environment checks, timestamps,
runtime streams and final records agree. There were no recorder, runtime,
source-guard or postflight failures. Node v24.22.3's 126,951,512-byte executable
has SHA-256 `acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa`,
matching both before/after records and a separate byte read. Runtime stdout is
identical between the two invocations. This audit did not execute Node to
confirm those identities; it checked the retained streams and executable bytes.

### Independent complete-package verification

The stable directory is
`docs/engineering/evidence/player-audio-export-functional-2026-11-21/`. Complete
independent package verification finished at
`2026-11-21T11:37:26.749963+00:00`, after original-record verification at
`2026-11-21T11:31:09.478270+00:00`. It used independently written Python byte,
JSON and TAP checks with immutable Git reads. No packaged verification script
or recorder was run.

The manifest lists 45 entries and excludes itself. The directory contains
exactly those entries and the manifest: 46 files and 3,495,929 bytes. Every
declared relative path, size and SHA-256 matches actual bytes; no undeclared or
missing file was found. All 40 original copies and all 45 original-path bindings
match byte-for-byte. This covers every file in both external first-output
directories, all four original external controls and the unchanged smoke source.
The retention proof's entire binding list matches the independently checked
manifest/original inventory.

Every one of the frozen tree's 2,182 distinct Git blobs was read and its Git
object digest and content SHA-256 recomputed. The resulting complete 2,392-path
mode/blob/length/hash map exactly matches `source-git-object-map.json`, including
76,818,229 bytes summed across paths. All four original before/after SHA-256
maps, four full source inventories, eight actual/tracked 203-test inventories
and both complete tree-entry maps match that immutable source. Current source
bytes in both code and functional worktrees match as well. This is complete
source verification, not a sample of the seven changed paths.

All 111 packaged outcome records were independently compared to the original
TAP: index, name, status, skip reason, exact outcome line, one-based line numbers,
zero-based byte ranges, complete diagnostic-block boundaries and source-file
membership. The seven group totals and first/last cases agree. The current
failure list is correctly empty. The previous full summary's source identity,
2,420/2,418/one/one counts, TAP identity and exact case-53 failure block match
the preceding evidence embedded in immutable frozen source. A passing subset
has not replaced that failure.

The source proof's comparison claims were recomputed separately. All seven
changed blobs equal the authored Player parent. Its 16 identified shared,
threshold and native-boundary paths are unchanged from completed-link integration.
The full comparison with the preceding complete-gate commit has 57 changed
paths, including exactly six non-documentation paths, all in the scoped Player
change. These source identities preserve attribution; they do not establish a
repair of the preceding audio assertion or transfer qualification between trees.
The proof's self-reported booleans were not used as substitutes for these checks.

The package also retains a disclosed data-only packaging query error: an
optional Git provenance lookup initially named nonexistent
`app/audio-session.js`, then static inventory identified
`app/devices/audio-session.js`. The error text and corrected comparison are
consistent with the tracked source. This is a failed data lookup, not a failed
project invocation or a replacement test outcome. The original first streams,
controls and source remain unchanged.

The complete functional report was read after the package stabilized. Its
14,840 bytes and SHA-256
`01442d30a7b04885e16037c682e700cbc5a4262b095e4c08fd5a3ca49bf76724`
agree with its announced identity. Its scoped acceptance, original results,
source/runtime provenance, disclosed data-query error and qualification limits
match the independent checks. The code lane explicitly accepted that report
and package before the functional evidence commit.

| Retained artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Package manifest | 15,993 | `d96a61e1d6c96a71b8e6e007884e205e1ab44370554e8e537c4ddefe35eef7b7` |
| Focused result | 9,563 | `f529736bf10e80c5cfb0c6b6c6dbaf4a466f2fab1b8a71220c8c5b4dede07417` |
| Original focused TAP | 25,096 | `9cbf80ee04a33ee38f1a2a454ba0831436b6d31c316e1e9b871e0b574cdb03fe` |
| Syntax result | 7,047 | `c325f87575a7dca64699bf85ddaa6a3b664fb1e83eef866358dac344841542e5` |
| Each of four complete source maps | 300,738 | `efe723cd5709c8d28c3619941a08b97612176f22503e416abd5569e36e6e9ef7` |
| Immutable source object map | 600,307 | `ad5ab09ad980b1bf0c4cf2926f36b34f78e5c2bf3101159d7b5d16bfffa86b25` |
| Source proof | 14,246 | `90e5589e252a2d334c135ebd5863ecc2aa424fa5ef7f908055b96378764830fc` |
| Retention proof | 16,027 | `42644bc9477f507a94efe4bd2f7dc923307407fde9b841e3a1fcccbefbc6b753` |
| Complete ordered summary | 70,273 | `3b85a96911defd6361267232781c2a0cd09a05ea3cd2038b9263ef4423b2acb9` |

### Immutable functional handoff

After package/report acceptance, the functional lane committed
`c95f235630c45ac824005ba6096fcf272ec54065`, tree
`8d247f74f35fa7fe9fa6c0a9b76384a16b5bdbc4`, with sole parent
`445a66ef402cb88aa5a089adc3b717046728ba48`. I independently verified that its
branch `review/deckchek-player-audio-export-functional-20261121` is clean and
points at this commit. Its only 47 changes are added owned files: the functional
report and 46-file evidence directory. Every committed file equals the accepted
bytes, including the report and manifest identities above. All 2,392 original
source entries retain their exact mode/blob identity; the handoff has 2,439
tracked paths. The handoff introduces no source mutation or new execution.

## Preserved limits and next authority

Source acceptance does not clear the complete-source numerical HOLD, grant a
scientific/hardware qualification, transfer qualified-main evidence or finish
Player pitch/report/History integration. Fleet remains default-off with its
fixed diagnostic head preserved. Original failed heads and results, thresholds,
permissions and archive limits remain unchanged. Root retains publication,
integration and CI authority. No release, deployment, tag, branch deletion or
history rewrite belongs to this lane.
