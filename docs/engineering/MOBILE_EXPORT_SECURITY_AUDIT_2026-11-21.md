# Mobile export details — fresh defensive source audit

Reviewer: `/root/mobile_export_security_round7`. Date: 21 November 2026, UTC.
All three round-six workers completed before this fresh trio began. This report
is the sole file owned by this lane.

## Review status

The frozen source has no remaining new defensive blocker in the scoped Mobile
export-details change. The initial candidate's readable-old-storage/write-failure
path was found independently by code and security review and corrected before
the official build. The correction keeps the current editor's choices, including
redaction, authoritative for its preview and export actions.

The first focused gate passed **45/45 cases**; the ordinary build and separate
smoke syntax check also passed once. Their full first outputs, complete source
maps and final retained package have been independently verified.

**Complete-source qualification remains held.** The predecessor's first complete
Node gate failed two audio assertions. A focused Mobile outcome cannot clear
that hold, establish the cause or repair of those failures, or qualify a browser,
native platform or physical device. This lane executed no project, test, syntax
check, browser, native component, scanner, probe, extracted implementation or
vulnerability reproduction. It made no product or remote changes.

## Exact source and method

| Source | Commit | Complete tree |
| --- | --- | --- |
| Fixed feature predecessor, PR #79 | `f76908766d53992e20382b9cbe73a668a28a6d1a` | `32ca272be2daeee6c4c1f47ccd5bd0ed0ac9909e` |
| Held round-six complete gate | `09c9afc7cfb2857f354feccb65e46a54ca8cfe62` | `b650eeac53af1395d6d0792f3639f02cf317490f` |
| Initial round-seven preparation | `b43be56fced26cfb20703414e7ea1076b20b6712` | `61e446b75d845420dc625090df9ef61ef1b97d0f` |
| Corrected preparation | `58485ad53793733869af490c7e0da58a4090a1a1` | `766f08daed2b37635b9912352c71d1e48a4acfdf` |
| Official generated final freeze | `d3aa9ca25bd8fec352cbb628ddfcca90beabcdd4` | `c20d7b3f6bc36e8adf906d0eb2707902b66e3fc5` |

The isolated worktree is `deckchek-mobile-export-security`, branch
`review/deckchek-mobile-export-security-20261121`. It fast-forwarded to the exact
corrected and generated sources supplied by root. The final freeze contains
**2,235 tracked files**. Review used source/Git reads, retained data inspection
and independent standard-library byte/hash calculations. Recorders and evidence
verifiers were read as source, not executed by this lane.

I read the [implementation note](MOBILE_EXPORT_DETAILS_IMPLEMENTATION_2026-11-21.md),
the actual `70ba2821c74965f3ac215e4680e0e259456af7c5` delta to the Results screen,
new screen tests and PWA smoke, the exact `58485ad5` correction, and the generated
`d3aa9ca2` change. Root owns implementation, publication and integration; the
functional worker is the sole local project executor for this round.

## Field authority and the corrected storage boundary

The [Results screen](../../mobile/screens/results.js) no longer substitutes a
saved result's nickname or serial when the corresponding export field is blank.
The current export settings supply both fields explicitly. The unchanged shared
format builder normalizes an empty string to JSON `null`, so a cleared value does
not revive the saved hint. Export constructs a new run view and a fresh formatted
body; it does not rewrite the saved measurement, its original hints, device data,
notes or measurement values.

Static review of the first candidate found a concrete additional failure branch.
The [store](../../mobile/lib/store.js) updates its memory copy and catches a
failed `localStorage.setItem`, but its next read prefers any still-readable
persisted JSON. The initial edit handler persisted a field and then re-read that
store while rebuilding the panel. A denied write with a readable older record
could therefore leave the visible field changed or cleared while the export
still contained the older identifier. Redaction had the same persistence
dependency. This was a source-derived finding; the old behavior was not executed
or reproduced by this lane.

Correction `58485ad5` initializes one mount-local `exportSettings` object. Both
the visible controls and `exportText()` use it. Each input/change handler updates
the corresponding local string before attempting persistence; redaction updates
the local boolean before its write attempt. The deduplication check also uses
the local value. Neither a fresh store read nor the return from `setSettings()`
can overwrite those current choices. Initial nickname and serial values are
restricted to strings, and redaction is represented as a boolean.

The correction leaves shared storage behavior unchanged. It establishes authority
for the open editor; it does not establish durable preference persistence after
a rejected write. A later mount initializes its visible controls from the settings
then available. Original saved hints and previously exported copies are not
erased by clearing an export field.

## Preview, action closures and asynchronous boundaries

An effective nickname or serial edit synchronously rebuilds only `export-panel`.
The settings card and its inputs remain outside that replacement. Both `input`
and `change` are handled, while a redundant `change` after an already-processed
`input` returns before replacing the action button the person may be tapping.
Redaction also rebuilds the panel. The panel removes its old children before
attempting to build new export text; a format error therefore replaces the
previous content with text-only error feedback.

| Surface | Source-derived behavior at the final freeze |
| --- | --- |
| Preview and checksum | The current local settings feed a newly normalized export body and newly computed checksum. The read-only textarea receives that same serialized text. |
| Save file | The visible action closes over the current panel's text. `downloadText()` creates its Blob from that text, activates a temporary download link, removes the link and later revokes its object URL. The filename uses the existing kind/timestamp format. |
| Share | The new panel creates a new `File` from the same text. Where `canShare` allows the existing file path, the handler passes that File to `navigator.share()` before awaiting completion. |
| Copy | The handler passes the current panel's text directly to `navigator.clipboard.writeText()` before awaiting completion. Its later continuation only announces success or the existing manual-copy fallback. |
| QR | Replacing the panel removes the previous QR container and visible image. A new explicit Show QR action frames the current text, generates local images and resets the frame index before displaying the new first frame. |

There is no delayed export computation that can later publish an older result
over the refreshed preview. Replacing a panel retires its visible controls and
QR images. Already-initiated browser share or clipboard operations retain the
snapshot passed when the person invoked them; this change does not cancel those
operations or retract an earlier download, clipboard value or scanned QR. The
post-await paths do not rebuild the panel or transmit a second payload.

## Text, format limits and unchanged authority

The [DOM helper](../../mobile/lib/ui.js) assigns export text, titles, errors and
labels with text nodes or `textContent`; the changed handlers do not insert
user-controlled markup. Nickname and serial remain input values rather than
HTML. The [QR wrapper](../../mobile/lib/qr.js) displays a locally generated SVG
through an encoded image data URI. The shared generator turns payload text into
matrix geometry and escapes its label; this screen supplies fixed labels.

The [shared format](../../app/phone-run.js) is unchanged. Its builder cleans
ASCII control characters, trims strings and limits nickname to 120 characters,
serial to 80, user agent to 300, notes to 2,000 and measurements to 200. The inputs retain
their 120/80 limits. QR framing retains the 1 MB budget, the 2,000-byte single-frame
policy, default 1,100-byte chunks and 999-frame ceiling. User-agent redaction
still produces `null` for that field while leaving the existing sample-rate and
microphone-flag policy unchanged. The checksum is an integrity check, not a
signature or proof of source identity.

I independently compared **32 boundary paths** byte for byte with fixed PR #79
and the final frozen Git blobs. They include all seven shared engines and their
seven Mobile copies, vendor VERSION, the export/store/UI/QR helpers, Mobile HTML
and manifest, the build tool, feature defaults, native command registry and
capabilities, package manifest, Cargo manifest/lockfile, and all four workflows.
No new network export, permission, dependency, native command or capability is
introduced. Fleet's default-off state and the separate fixed diagnostic remain
outside this change. These scoped comparisons do not claim complete validation
of every possible malformed local-storage record or physical platform behavior.

## Authored coverage and its limits

The [four actual-screen DOM cases](../../tests/mobile-results-details.test.mjs)
mount the real Results screen and exercise edited values, explicit blanks,
change-only edits, current checksum, redaction, QR retirement/regeneration and
saved-record immutability. File download, share and clipboard boundaries use
in-memory doubles. The added write-denial case retains readable older storage,
confirms the store still returns that old preference, and compares every current
export action with the edited text. Focus coverage now checks both editor
identity and connection to the live tree, in addition to the fixture's active
element. The redundant-change check asserts action-button identity.

The [PWA smoke](../../tools/smoke/mobile-pwa.mjs) removes the former unconditional
true alternative from the nickname check. It adds serial editing, serial clearing
with QR retirement, and downloaded/displayed byte parity with a valid parsed
checksum. Browser execution is separate from these authored assertions. A syntax
check alone does not qualify rendering, native share sheets, browser clipboard
permissions, touch event ordering, offline update adoption or physical scanning.

## Official generated cache and build evidence

The functional worker's [one ordinary build](evidence/mobile-export-functional-2026-11-21/build/result.json)
ran on corrected preparation
`58485ad5` with absolute Node **24.22.3**, exited 0 without timing out and took
**0.11477186000047368 seconds** within its 30-second budget. Its complete stdout
was `updated: sw.js` followed by a newline; stderr was empty. I read the recorder
and root configuration, verified both original/retained pairs and their hashes,
and checked the exact argv, allowed change and source identities.

All **2,235** hashes in the build-before map match immutable preparation blobs,
and all **2,235** hashes in the build-after map match immutable generated-source
blobs. The only changed path is `mobile/sw.js`. Its exact byte delta changes
`eca0f2a661c9` to **`8f12f05a2c38`**; the precache and all other worker bytes are
unchanged. The generated commit's parent is exactly the corrected preparation,
and the recorded complete tree matches the final freeze.

I independently derived the new stamp from Mobile file hashes and matched all
**33 precache entries** against the eligible file inventory. All **seven shared
engine/vendor pairs** and the complete vendor VERSION match byte for byte. The
worker's same-origin GET handling, cache activation and user-accepted update flow
are unchanged. The normal build script was not executed by this lane.

The generated service-worker SHA-256 is
`07b2a1c77959bcc55f825f4d6db6ada92762ea494959a0938d749569978d77cd`.
The original build result SHA-256 is
`4f4ac9fce44d2199be6c9bf63503ffc14e4df9e7b04a315f0c02c6094261c5f0`.

## Retained focused gate evidence

The [first focused gate](evidence/mobile-export-functional-2026-11-21/focused/result.json)
ran once on the final freeze using absolute Node
**24.22.3**, serial concurrency and TAP output. Its exact six-file selection was
`mobile-build`, `mobile-export`, `mobile-results-details`, `mobile-router`,
`phone-run` and `qr`, each an actual top-level `tests/*.test.mjs` file. It started
at **2026-11-21T09:47:44.338602+00:00**, completed at
**2026-11-21T09:47:53.829405+00:00**, and ran for
**9.39870166000037 seconds** within its 120-second budget, without timing out.

I independently verified all **45 ordered passing outcomes**, the complete
`1..45` plan and every footer count: **45 pass; zero failures, skips or cancelled
cases; exit 0**. The four new actual-screen cases are cases **16–19**, and their
exact titles match the authored source. This is bounded functional evidence for
the corrected implementation using the stated doubles.

Both full **2,235-file** maps match the immutable final Git blobs. The six
selected test hashes, source/tree, clean status, exact argv, recorder/configuration
hashes and original copies also agree. No `NODE_OPTIONS` or numerical diagnostic
variables were present in the recorded invocation. The complete TAP is
**10,439 bytes**, SHA-256
`7f29e94be18c528ad18b620b875a9f74986bd6819cc39c452077f58cbff3e4db`;
stderr is empty. The original result SHA-256 is
`25d3610aa58844633dca0977eb92beb5c7ff73188e444b02245cae6a7bda0fdd`.

The [separate first PWA smoke syntax check](evidence/mobile-export-functional-2026-11-21/syntax/result.json)
ran once on the same freeze, exited 0
without timeout in **0.11432855300154188 seconds** within its 30-second budget,
and produced empty stdout/stderr. Its exact command used the same absolute Node
path with `--check tools/smoke/mobile-pwa.mjs`; it did not evaluate the module or
launch a browser. I matched the preserved **14,849-byte** checked source with
the frozen Git blob and working source, SHA-256
`ead9aadcad653e51c2ce908dabc4e6a45234cbf40f7ea9ff6efea97ee357de44`.
Both additional **2,235-file** maps match the immutable freeze and the focused
after-map. Its original recorder, complete result, source identity, clean status,
empty-stream hashes and binding to the focused result also match. The syntax
result SHA-256 is
`77942bbdf1fafcc2e1e3fb9420983db9b74ab671c2cdd5393ed214dc5be8fce8`.

I independently verified all **33 entries** in the final retained
[manifest](evidence/mobile-export-functional-2026-11-21/manifest.json), excluding
the manifest itself. Its SHA-256 is
`eab397836489860b16f8fac58fd58d5b3c0f5259bb54a30f5511cc49f09c9f8e`.
All **34 original-source bindings** for **29 unique retained copies** existed
and matched byte for byte. Each complete raw build, focused and syntax directory
matches its retained counterpart; no first output was substituted by a summary.
All **six complete 2,235-file maps** match the appropriate immutable preparation
or final source. I matched the
[observed summary](evidence/mobile-export-functional-2026-11-21/observed-summary.json)
to every original TAP outcome and its coverage ranges, and independently checked
the [source comparison](evidence/mobile-export-functional-2026-11-21/source-comparison.json).
Its four changed code-path hashes and seven unchanged audio-path hashes across
the fixed PR #79, held predecessor and frozen successor are correct. The retained
data-only verifier was read as source; this lane did not execute it.

## Preserved complete-source hold

I independently rechecked the predecessor's retained
[manifest](evidence/inventory-mobile-functional-2026-11-21/manifest.json), all
**35 evidence entries**, all **31 original artifact/recorder copies**, all
**2,177 immutable source hashes** against its before/after/post-syntax maps, and
every one of the **2,391 ordered outcomes** in its complete TAP and observed
summary. Its single complete plan and all footer counts agree: **2,388 pass,
two fail, one optional Mixxx skip; exit 1**. The TAP SHA-256 remains
`bf5b091c0a20826a64cac1842d0d5b057a5dc91a46c5a68ebcca1b9e60f50eaa`.

| Predecessor failure | Preserved meaning |
| --- | --- |
| Case 37, capture failure then Try again | The final retry-result status is `fail` rather than `pass`, with balance, response and polarity failures in its retained result. Earlier lifecycle assertions, including one playback and one saved retry result, completed. |
| Case 53, playback level cap and lower level | The final relative-gain assertion fails. The earlier requested-hot-level cap of -12 dBFS and requested lower level of -30 dBFS assertions completed. The retained TAP does not contain this session's numeric gain; it does not demonstrate a playback-cap failure. |

The cubic-distortion case passed in that first complete outcome. No numerical
cause, solver repair or resolution of issue #72 is established here. No failure
is removed, weakened, rerun away or replaced by the focused Mobile result.

The [separate fixed-PR hosted record](FEATURE_SUCCESSOR_HOSTED_EVIDENCE_2026-11-21.md)
belongs to PR #79's `f7690876` source: standard Node **22.23.5** recorded
**2,359 cases, 2,358 pass, zero failures, one skip**, and **1,411 UI checks passed**.
That record expressly leaves nightly/platform completion and merge qualification
separate. Those results do not qualify this later source. Root's separate #81
Quick Check layout work is outside this audit.

**This defensive audit is complete; complete-source qualification remains held.**
The source correction and focused first pass address the scoped Mobile export
behavior with the stated evidence limits. They do not resolve the two complete
gate failures or issue #72. No release, deployment or merge is approved by this
report.
