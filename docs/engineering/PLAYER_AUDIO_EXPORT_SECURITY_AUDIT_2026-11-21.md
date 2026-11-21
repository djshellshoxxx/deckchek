# Player captured-audio export — static defensive security audit

Reviewer: `/root/player_audio_export_security_round11`. Date: 21 November 2026,
UTC. This fresh review began after all three round-ten final handoffs were
completed and consolidated. Root owns product fixes, integration and publication;
this lane owns only this report and executes no project code.

## Disposition

**ACCEPT the scoped source and retained FIRST evidence; no material security
blocker was found.** The change implements an explicitly selected local transport
for provisional, normalized captured samples. It does not establish authenticated capture,
scientific measurement eligibility, reference playback identity, secure memory
erasure or release qualification.

The source, original-output, stable-package and functional-report checks are
complete. The separately authorized FIRST focused gate passed **111/111** cases,
and the FIRST changed-smoke syntax check passed. The existing complete-source
audio assertion hold remains in force; focused acceptance does not clear it.

## Reviewed source and ownership

| Item | Independently checked value |
| --- | --- |
| Preparation HEAD | `445a66ef402cb88aa5a089adc3b717046728ba48` |
| Complete preparation tree | `280f18dc58d5786882792ddff8906dc4230d25bd` |
| First parent, authored audio export | `fb2a34a74a9e7b0ff4ba205269c8ee517f059cef` |
| Second parent, completed link integration | `33e077f3bf45dad96ba1c6de341a0d9fe8efa594` |
| Security branch | `review/deckchek-player-audio-export-security-20261121` |
| Security worktree | `/workspace/scratch/6f2247f2f463/deckchek-player-audio-export-security` |
| Frozen tracked paths | 2,392 |
| Distinct immutable Git blobs read | 2,182 |
| Top-level test inventory | 203 actual and 203 tracked, equal |
| Initial status | Clean |

I compared the bytes and SHA-256 of every frozen tracked path with its immutable
Git blob, with no mismatch. The complete difference from the completed link
integration contains exactly these seven paths:

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `app/player/audio-export.js` | 9,898 | `8cb015f9fa07222ed76eca8a6f3064de29004b990d0dc48cb391e66528e7f7b0` |
| `app/styles/player-capture.css` | 1,009 | `4fe01134c232e103be7ced710818d04ba55f9baa97d07c23a63a6cbb0f428de6` |
| `app/ui/screens/player-capture.js` | 22,033 | `6e1f3af5b5db9ff300b962eff4a90410b70cb66685de139697b7cddec2afd138` |
| `docs/engineering/PLAYER_AUDIO_EXPORT_IMPLEMENTATION_2026-11-21.md` | 6,156 | `e5f9aa6dc228afcdb292409e28e570e0c332a5442470659cd8cebe76f1119a04` |
| `tests/player-audio-export.test.mjs` | 12,255 | `8f30e6199625f4d37e2e015b7a72df13a654e27c7f101d5fdfb370ef53648744` |
| `tests/player-capture-screen.test.mjs` | 33,635 | `c45637a4c459ba1b1f89331ce364a4f7831d9d644c684307c06a7b6950946259` |
| `tools/smoke/player-capture.mjs` | 20,997 | `d04df702031d9180d8c6040b1e4c6a475b2d6ea76d77cab9f6258b82fe1d3369` |

No native command, capability, dependency, lockfile, archive limit, measurement
threshold, Fleet default or diagnostic source is changed by this seven-path
candidate. The qualified main `e36ddc41806b0f6639474f207e3b339e063a6e25` is a
separate source and qualification record.

## Trust model

The production caller is the Player screen. It receives a completed
`runCdjAcquisition` result whose acquisition and evidence metadata are frozen,
and whose mutable audio channels were created by `payloadToAudio` from the
existing native capture boundary. Operator fields, selected-file metadata,
device names and driver messages are data. They do not authorize a filesystem
path, network destination, command or report verdict.

The new helper is not an archive importer, a renderer-to-native security boundary
or a sandbox for executable JavaScript objects. The application globals,
dependency injection points, `AbortSignal`, ordinary typed-array built-ins and
native adapter remain trusted code. Own-data checks reject ordinary metadata
accessors and non-JSON values; they do not establish that a hostile Proxy,
modified intrinsic or compromised renderer is harmless. `Object.keys` enumerates
the supplied object's keys before the recursive field budget can reject it.
The current production acquisition constructs a bounded shape; a future public
or arbitrary-object input surface would require a fresh boundary review.

The assets are captured audio, operator/device/reference metadata, correct
association of samples with their capture, and the user's control over local
retention/export. The reviewed threats are unintended retention or disclosure,
stale-result publication, cross-capture confusion, unsafe archive names,
unbounded packaging, metadata/sample mutation during hashing and unsupported
qualification claims.

## Source findings

### Consent and default behavior

`app/features.js:29–34` leaves Fleet and Player capture default-off. The Player
screen constructs `pc-keep-audio` without a checked attribute, describes retention
as off by default, and explains the local ZIP, 18 MiB sample bound, reference-byte
exclusion and discard actions (`app/ui/screens/player-capture.js:73–107`).

`begin()` snapshots `keepAudio`, device selection, operator assertions and the
selected reference before acquisition. It calls the audio helper only for that
snapshot's true value (`:202–250`). A default metadata-only completion does not
read `captured.audio` or invoke audio preparation. The explicit audio download is
a separate button action; capture completion does not automatically download.
`onExport` and Ctrl+E still select only the existing three-field metadata JSON
(`:265–286`).

The checkbox is a form choice for captures, not an immediate erasure switch.
Changing it during capture cannot alter the snapshotted decision. Like other
mounted form values it can remain selected after navigating away and returning;
retained results and selected reference metadata are discarded. Unchecking after
a completed capture affects the next capture; the existing archive is discarded
by Clear, a new capture, reference change, hide or disposal. This is consistent
with the screen's instruction to enable retention before starting.

### Sample and metadata ownership

`audio-export.js:74–108` snapshots own metadata fields, checks schema and distinct
UUID identities, requires the evidence run ID to match, then rebuilds the
evidence record. It requires nonempty, equally sized Float32 channels backed by
ordinary `ArrayBuffer`s. Shared sample buffers are rejected by that check.
Observed counts, nominal rate, sample duration, selected pair and completion time
must agree with the returned channels and normalized record.

The adapter's compatibility defaults cannot supply missing native observations:
`payloadToAudio` preserves native presence/validity (`app/ui/audio-io.js:75–106`),
and acquisition separately records usable channel counts, validated pair/rate and
unknown observations (`app/player/acquisition.js:73–169`). The helper requires
these observations rather than accepting only the adapter's fallback values.

The helper writes every finite channel value into private interleaved little-endian
Float32 bytes before its first await (`audio-export.js:109–132`). There is no
resampling, gain scaling or clipping. The explicit left/right write preserves
negative zero. Mono is identified as source mode while both returned channels are
retained; it is not silently collapsed to one encoded channel.

Metadata and optional reference fields also become private copies before the
first await. The acquisition's archive-relative `rawEvidenceRefs` and retention
label, and the record's corresponding refs, change only those copies. The
original acquisition remains ephemeral with empty refs. Hash inputs are private
payloads; no source array is reread after hashing begins. `createZip` makes its
own payload snapshots before CRC/output assembly.

The returned object is shallow-frozen, so its byte array itself remains mutable.
The production screen retains that private result and gives each download a new
`Uint8Array` (`player-capture.js:272–278`), avoiding later consumer mutation of
the archive retained for another download. After preparation, `last` retains
metadata and the optional archive rather than `captured.audio` or the full
acquisition return object.

### Resource bounds and error behavior

| Boundary | Source control |
| --- | --- |
| Capture duration | Existing acquisition permits 1–30 seconds; this change does not enlarge native capture limits. |
| PCM payload | `frames * 8` must be a safe integer and at most 18 MiB before interleaved allocation. |
| Metadata traversal | Depth at most 12, at most 2,048 visited values, individual strings at most 2,048 UTF-16 units, aggregate text/key budget 65,536 units per snapshot, and arrays at most 64 elements. |
| Metadata encoding | Encoded `capture.json` must be at most 128 KiB. |
| Final archive | Existing `app/zip-writer.js:5,94–163` includes local headers, filenames, payloads, central directory and footer in its unchanged 20 MiB cap. |
| New displayed errors | Preparation and audio-download error messages are limited to 300 characters and rendered as text. |

The 18 MiB limit describes the PCM payload, not total process memory. Native
arrays, interleaved bytes, hashing internals, ZIP snapshots and download copies
can coexist. The JSON byte check follows bounded snapshotting and encoding; it
does not imply allocation-free refusal. An audio-preparation failure preserves
the existing capture metadata export and explains why audio is unavailable
(`player-capture.js:238–253`). No failure path falls back to a larger archive or
another output destination.

### Archive paths and integrity

The only entries are `manifest.json`, `capture.json`, `audio/primary.f32le` and
`README.txt`. Operator/reference filenames do not determine entry names.
The outer download name contains a validated capture run UUID. The shared writer
also refuses invalid and duplicate names, snapshots payloads, calculates CRC-32,
and emits matching stored local/central records with UTF-8 names
(`app/zip-writer.js:27–164`). No extraction operation is added.

The manifest binds run/capture identity, capture timestamp, frame count, sample
rate, pair mode and the three payloads' lengths/SHA-256 values
(`audio-export.js:130–147`). `app/sha256.js` contains only local digest paths.
These checks describe content identity and accidental corruption; the manifest
is not signed or independently authenticated. A party able to replace the whole
archive can also replace its hashes. The UI and README do not claim otherwise.

### Reference identity and qualification

The optional selected descriptor must have the expected schema, bounded name and
size, SHA-256 shape, selected-file hash basis, unverified playback identity and
`bytesRetained: false`. Its hash must match the normalized record's reference
hash (`audio-export.js:52–65`). Only the explicit descriptor fields are retained;
there is no file-byte field, file read or reference payload in the export helper.
The existing reference inspector reads a user-selected file locally, caps it at
32 MiB, checks its returned byte length and returns an immutable descriptor
(`app/player/reference-file.js:16–47`).

The helper normalizes the record through `createCdjEvidenceRecord`, whose derived
qualification is always unverified, report-ineligible and without a qualified
measurement (`app/player/evidence-record.js:87–177`). Caller-supplied eligibility
cannot survive normalization. The manifest independently fixes unverified,
report-ineligible and pitch-unmeasured fields. Incomplete capture counters,
driver messages, faults and unavailable values remain visible. Saving an
incomplete capture does not convert it into valid measurement evidence.

The source explicitly distinguishes normalized adapter samples from original
ADC/device bytes, nominal from measured rate, content hashes from hardware or
playback authentication, and a bounded transport from physical validation.
Reference playback, clock accuracy, continuity, calibration, pitch, retained
reference audio and report/History integration remain unqualified or unfinished.

### Privacy and output sinks

The screen explicitly states that local exports contain operator settings,
device names, driver messages and selected reference filename/hash. The new ZIP
includes those details and the captured samples only following the retention
choice and explicit download action. This is not a redacted diagnostic bundle
and does not close the separate issue #69 privacy requirement.

Display values and errors use `textContent`/the DOM helper's `text` path; no new
untrusted HTML sink is added (`player-capture.js:109,155–157,167–198,245–255` and
`app/ui/dom.js:11–27`). The output sink is the existing Blob/object-URL download,
which removes its temporary anchor and schedules URL revocation
(`app/ui/dom.js:83–90`). The external-link interceptor leaves explicit download
anchors alone (`app/external-links.js:160–169`). No upload, external navigation,
application storage write, History save, report registration or native command
is added by the new helper/screen flow.

A requested download is not proof of filesystem persistence. The audio status
reports a request rather than a confirmed save. User-created downloads are
outside the screen's in-memory Clear operation; clearing does not delete a
previously downloaded file.

### Cancellation and stale results

Acquisition owns and stops its lease before returning (`acquisition.js:215–268`
and `audio-io.js:417–490`). Audio preparation starts only after that return.
The screen's active-request predicate includes request identity, abort state,
visibility and disposal. It checks that predicate after acquisition, after
preparation errors and before publishing the retained result
(`player-capture.js:122–130,237–250`).

The helper checks cancellation before reading input, before and after hashing,
and after archive assembly (`audio-export.js:19–25,74–75,131–146`). Cancel, hide,
dispose and feature-disable navigation invalidate the result. A pending request
keeps the screen busy until it settles; returning to the view cannot make an
already aborted request active again. Reference change/clear and a valid new
capture also discard prior export state. Export handlers enforce lifetime and
busy-state checks in addition to disabled buttons. Feature-disable routing calls
the existing `onHide` path through `app/ui/shell.js:56–87`.

Cancellation is logical publication control. Synchronous encoding/ZIP work and
an asynchronous digest already in progress are not physically cancelled, and
the code promises neither immediate reclamation nor sample zeroization. Browser
responsiveness and actual native cleanup behavior are not established by this
static review.

## Authored verification source

I read the new unit file, the complete changed screen-test file and the complete
changed smoke source. The unit oracle independently reads ZIP local/central
records and compares a fixed PCM byte sequence, Node crypto digests and metadata
identity. It covers source mutation after preparation begins, mono labeling,
reference matching, retained faults, rebuilt qualification, compatibility
refusals, metadata accessors, exact/over-limit PCM and cancellation.

The screen source includes a default-path audio getter that must remain unread,
the real optional archive path, metadata-only Ctrl+E, independent download
copies, prep failure, captured consent, replacement/discard and late completion
after Cancel, hide and disposal. The hosted smoke source models the native
boundary, downloads the actual screen's ZIP, and independently checks entries,
payload hashes and modeled sample values. The retained focused results below
establish the selected Node outcomes. The hosted smoke was parsed only; its
browser checks remain authored and unexecuted in this round.

## Retained FIRST evidence acceptance

### Authorization and command controls

All three source decisions preceded execution. Root fully read and independently
verified the external recorders and selections, then authorized the functional
worker once, sequentially, with Bash `login:false`:

```bash
python3 -u /workspace/scratch/6f2247f2f463/deckchek-player-audio-export-round11-syntax-recorder.py /workspace/scratch/6f2247f2f463/deckchek-player-audio-export-round11-syntax-selection.json
python3 -u /workspace/scratch/6f2247f2f463/deckchek-player-audio-export-round11-focused-recorder.py /workspace/scratch/6f2247f2f463/deckchek-player-audio-export-round11-focused-selection.json
```

The focused invocation was conditional on the original syntax recorder reporting
`recorder_success: true`, exit 0 and unchanged source. The retained syntax
postflight completed at `2026-11-21T11:28:15.347122+00:00`; the focused recorder
started at `2026-11-21T11:28:41.267548+00:00`. No project command was repeated.

I read both complete recorders and configurations as text and independently
checked their exact external bytes:

| Control | Bytes | SHA-256 |
| --- | ---: | --- |
| Syntax recorder | 17,261 | `96594744e8fb76cf6c40a19b899a805f855dba0809c5db8441aee0f724be498d` |
| Syntax selection | 709 | `cdc68a8f9d40c6f0fe08cd64054f572282b381d42ed071f726b580461cacdccb` |
| Focused recorder | 18,343 | `d41731c5be8fae1455cc2b57a741b3706f727c04001a9d3d7a91b5f64bbd3250` |
| Focused selection | 2,197 | `fe9908bef44f52677cca878beb5e0b9b652ec07913ca4b815546e0c986ca33db` |

The recorders pin the exact commit/tree/parents/branch, 2,392 tracked paths, 203
actual/tracked top-level tests, selected source sizes/hashes and absolute Node
v24.22.3 executable. They refuse existing outcome directories, keep controls and
outputs outside the functional checkout, retain source maps/inventories before
and after the command, and fail if the source changes. They reject `NODE_OPTIONS`,
`DECKCHEK_AUDIO_*` and an optional external Mixxx corpus variable, and retain
runtime identity stdout/stderr. The syntax budget is 30 seconds with process-group
TERM after 25; focused is 120 seconds with TERM after 115. Each has a five-second
grace before KILL. No timeout or termination signal occurred.

The syntax project command is absolute Node with `--check` and only
`tools/smoke/player-capture.mjs`. The focused command is absolute Node with
`--test --test-concurrency=1 --test-reporter=tap` and the exact seven-file list
below. The already selected ZIP compatibility case contains its existing
`python3 -I -c` standard-library `zipfile` subprocess; that child was explicitly
included in root's authorization. No separate verifier, full suite, build,
browser, native application or numerical diagnostic was authorized or run.

### Original outcomes

| FIRST command | Outcome | Command elapsed time | Output |
| --- | --- | ---: | --- |
| Changed Player smoke syntax | Exit 0; recorder success; no timeout | 0.06412778599769808 s | Empty stdout and stderr |
| Seven-file focused serial Node gate | 111 total / 111 pass / zero fail, skip, cancelled or todo; exit 0; recorder success; no timeout | 3.273620218002179 s | 25,096-byte TAP; empty stderr |

The original TAP SHA-256 is
`9cbf80ee04a33ee38f1a2a454ba0831436b6d31c316e1e9b871e0b574cdb03fe`.
I read every original TAP block and independently checked contiguous ordered
indices, exact outcome names/lines, matching subtest labels, the complete plan
and all footer counts. Static literal reading and explicit expansion of the
five reviewed screen-test label loops also reproduce the full 111-case source
order without evaluating project code. There are no omitted failure blocks: the
original has zero failures and zero skips.

| Selected file | Ordered cases | Pass count |
| --- | --- | ---: |
| `tests/canonical.test.mjs` | 1–9 | 9 |
| `tests/cdj-acquisition.test.mjs` | 10–26 | 17 |
| `tests/cdj-evidence-record.test.mjs` | 27–36 | 10 |
| `tests/player-audio-export.test.mjs` | 37–45 | 9 |
| `tests/player-capture-screen.test.mjs` | 46–85 | 40 |
| `tests/player-reference-file.test.mjs` | 86–95 | 10 |
| `tests/zip-writer.test.mjs` | 96–111 | 16 |

The nine new audio-helper cases are 37–45. The ten new screen export/retention
cases are 76–85. All passed in this first focused observation, including the
exact 18 MiB PCM boundary. Existing ZIP compatibility case 106 passed without
skipping; it does not establish browser/native save behavior.

### Independent original-data verification

I independently read all 2,182 distinct frozen Git blobs, verified each blob's
Git object identity, and rebuilt the complete 2,392-path SHA-256 map. Both original
commands' four before/after hash maps and two tree-entry maps match that immutable
source exactly. All twelve retained inventory arrays match the complete Git
inventory or the correct 203-test subset; selected source identities match
immutable bytes. The security worktree's frozen tracked content also remains
identical; this report is the only added path.

The independent checks also verified both complete results, both pre-command
running records, empty error streams, exact argv selections, control copies and
external originals, runtime stdout/stderr hashes, the recorded Node binary's
126,951,512-byte identity, and source/driver/config/runtime equality before and
after each command. The Node executable SHA-256 is
`acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa`.
Both original directories contain 20 files, with no recorder or postflight error.

### Stable package

**Accepted.** I independently verified every one of the 45 listed manifest
entries, all 40 complete original copies and every one of the 45 original-path
bindings, using exact bytes, lengths and SHA-256. The package contains exactly
46 files and 3,495,929 bytes including its manifest, with no omitted or extra
file. Both original 20-file directories are completely represented. The four
external controls and the original checked smoke source also match their
declared bindings. Nothing was executed from the retained package.

The [manifest](evidence/player-audio-export-functional-2026-11-21/manifest.json)
is 15,993 bytes, SHA-256
`d96a61e1d6c96a71b8e6e007884e205e1ab44370554e8e537c4ddefe35eef7b7`.
Its 45 listed payloads total 3,479,936 bytes. The independently reconstructed
object map agrees with all 2,392 entries of
[source-git-object-map.json](evidence/player-audio-export-functional-2026-11-21/source-git-object-map.json),
including modes, Git object IDs, sizes and SHA-256. Summed source bytes are
76,818,229. All source-proof comparisons with the authored parent, completed link
integration and preceding complete-gate source match fresh Git reads. The
four maps, four tracked inventories and eight actual/tracked test inventories
are identical to the already checked original data.

I independently rebuilt all 111 outcome objects in
[observed-summary.json](evidence/player-audio-export-functional-2026-11-21/observed-summary.json):
status, name, source grouping, original line, one-based line position, zero-based
outcome byte range and complete block range. Every field agrees with the raw
TAP. The seven source groups, both new-case index lists, runtime and syntax
summary, zero current failures and verbatim preceding failure block also agree.
The complete [retention proof](evidence/player-audio-export-functional-2026-11-21/retention-proof.json)
matches every manifest binding and both raw directory inventories.

The package discloses an initial data-only provenance-query error naming
nonexistent `app/audio-session.js` in the completed link integration. The
797-byte [original tool error](evidence/player-audio-export-functional-2026-11-21/data-processing-error.txt)
has SHA-256
`1b59abbdb33c9578c5652a08c26d8765a3f8898d3fdeaa0de6a32403e9a5df32`.
Static inventory located `app/devices/audio-session.js`; the final proof's
comparison of that tracked path is correct. The error is retained and separate
from the two successful FIRST command results. Root authorized continuation of
owned data/Git proof only; no original, source or assertion was modified and no
project invocation was repeated.

I fully read the final
[functional report](PLAYER_AUDIO_EXPORT_FUNCTIONAL_AUDIT_2026-11-21.md) and checked
its 14,840 bytes against SHA-256
`01442d30a7b04885e16037c682e700cbc5a4262b095e4c08fd5a3ca49bf76724`.
Its scoped acceptance, exact first outcomes, source/runtime identity, complete
retention details, disclosed data-query error and qualification limits agree
with the evidence independently checked here. I sent explicit package/report
ACCEPT to the functional worker and root before this report's commit.

The accepted functional handoff was then committed as
`c95f235630c45ac824005ba6096fcf272ec54065`, tree
`8d247f74f35fa7fe9fa6c0a9b76384a16b5bdbc4`, with the preparation freeze as its
sole parent. Fresh Git reads confirm exactly 47 added owned report/evidence
paths, every committed byte equal to the accepted files, and a clean functional
worktree. This security report remains a separate child of the same freeze.

## Preserved qualification history

The completed round-ten link review remains source-specific. Frozen
`f1e0ca1fdcaf6c8276f5a92e883b84fc001bf425` first selected all 202 top-level tests
and retained **2,420 total / 2,418 pass / one failure / one optional Mixxx skip**.
All 14 new link cases passed, and its separate changed-smoke syntax parse passed.
The sole failure was case 53's final relative-gain assertion at
`tests/audio-session.test.mjs:95`, retaining **-101 dB at -30 dBFS** after the
earlier cap and lower-level assertions had passed. It was not an observed failure
of the output cap. No numerical cause or repair is known and this round does not
authorize a full rerun.

I read the retained failure block and consolidation report. The unchanged
555,767-byte original TAP has SHA-256
`e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`; its 12,121-byte
manifest has SHA-256
`b3b15e1783419b1ffb10c3dd66692366acf0f172583d6630b3506ec5837a4b1c`.
See [round-ten continuation](LINK_CONSENT_CONTINUATION_2026-11-21.md) and
[original TAP](evidence/link-consent-functional-2026-11-21/full/run.tap).
Earlier source-specific failures and qualified main are not replaced by this
focused feature review. Historical queue text is not a new execution grant.

## Method and limits

The security-and-hardening skill informed trust-boundary, ownership, privacy,
resource and output-sink review. The assigned static-only scope governs: this
lane used source/retained-data reads, Git reads and independent standard-library
Python byte/hash/JSON/Git-data checks. It did not import, evaluate, parse as
project code or execute the candidate, tests, smoke, extracted implementation,
packaged verifier, browser, native program, scanner, probe or vulnerability
reproduction. Generic release/dependency-audit instructions did not authorize
execution here.

No production, test, fixture, configuration, evidence or other report was edited
by this lane. No release, deployment, tag, branch deletion or history rewrite is
part of this audit. Fleet stays default-off, its fixed diagnostic head and all
existing thresholds, permissions and archive limits remain unchanged.
