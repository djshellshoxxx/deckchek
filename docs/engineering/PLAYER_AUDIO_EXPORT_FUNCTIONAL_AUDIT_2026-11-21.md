# Player captured-audio export — functional and bug-hunt audit

Date: 2026-11-21. Round: 11. Lane: functional / bug hunt.

**Disposition: ACCEPT the scoped local audio transport change on the frozen
source below.** Static review found no material functional blocker, and the
first authorized focused invocation passed all 111 cases. This is acceptance of
the bounded provisional capture/export behavior covered here. **The preceding
full-source audio assertion HOLD remains open.** This audit does not qualify a
release, a native platform, physical capture, pitch analysis or a diagnostic
report.

## Frozen source and review scope

| Item | Identity |
| --- | --- |
| Reviewed and executed commit | `445a66ef402cb88aa5a089adc3b717046728ba48` |
| Reviewed and executed tree | `280f18dc58d5786882792ddff8906dc4230d25bd` |
| Functional branch | `review/deckchek-player-audio-export-functional-20261121` |
| Authored preparation parent | `fb2a34a74a9e7b0ff4ba205269c8ee517f059cef` |
| Completed link-consent integration parent | `33e077f3bf45dad96ba1c6de341a0d9fe8efa594` |
| Tracked source inventory | 2,392 paths, 2,182 distinct Git blobs, 76,818,229 summed source bytes |
| Top-level test inventory | 203 actual files, exactly matching the tracked inventory |

The checkout was clean before and after both project invocations. The seven
changed paths relative to the completed link-consent integration are
`app/player/audio-export.js`, `app/styles/player-capture.css`,
`app/ui/screens/player-capture.js`,
`docs/engineering/PLAYER_AUDIO_EXPORT_IMPLEMENTATION_2026-11-21.md`,
`tests/player-audio-export.test.mjs`, `tests/player-capture-screen.test.mjs` and
`tools/smoke/player-capture.mjs`. Every changed path is byte-identical to its
authored preparation parent. The complete immutable-source comparison is in
[source-proof.json](evidence/player-audio-export-functional-2026-11-21/source-proof.json)
and [source-git-object-map.json](evidence/player-audio-export-functional-2026-11-21/source-git-object-map.json).

Static review covered the full implementation note, all changed JavaScript,
styles and regression sources, the acquisition controller, native payload
adapter and live-session owner, evidence normalization, reference descriptor,
shared SHA-256 and ZIP writer, download helper, screen lifecycle callers and
the modeled DOM fixture. No product source or test assertion was edited in this
lane. The unchanged shared acquisition, output-cap, audio-session, ZIP-limit
and native capability/configuration paths are explicitly compared to the
completed link-consent integration in the source proof.

## Functional decisions and evidence

The new helper is a local transport for samples already returned by acquisition.
It preserves the normalized adapter values as headerless interleaved left/right
float32 little-endian PCM. It requires matching run identity, a distinct capture
identity, observed sample counts and rate, the primary pair, capture time and a
normalizable provisional record. Compatibility defaults for absent native
observations do not satisfy these checks. The archive keeps reported faults and
unknowns; normalization rebuilds report ineligibility. The original acquisition
and record retain their empty raw-evidence references.

The nine new helper cases passed at focused positions 37–45. They exercise the
real `payloadToAudio` and `runCdjAcquisition` path, independently walk ZIP local
and central records, compare the PCM against a fixed byte sequence containing
negative zero, and compare entry hashes against Node crypto. They also check
sample/metadata snapshots before asynchronous hashing, selected-reference hash
binding without reference bytes, incomplete counters, mono labeling with both
returned channels, compatibility and format refusals, oversized/accessor-backed
metadata, the exact 18 MiB PCM boundary, and cancellation before or during
preparation. The existing 20 MiB total ZIP cap remains unchanged.

The screen adds an initially unchecked retention choice and snapshots it before
acquisition. On the default path, the screen does not read `captured.audio` or
invoke the export helper. JSON export and `onExport` retain the existing three
metadata fields; the shell's Ctrl+E route remains metadata-only. An opted-in
capture closes its acquisition session before preparing an archive. The screen
holds the prepared archive instead of retaining mutable capture channels, and
each download action receives a new byte array. Its status describes a download
request without asserting that the filesystem persisted the file.

The ten added screen cases passed at positions 76–85, together with all 30
preceding screen cases. These cover the unread default audio property, actual
archive preparation, independent download bytes, a preparation failure that
leaves metadata exportable, the snapshotted retention choice, a new capture
discarding the previous archive, and late archive suppression after cancel,
hide/return and disposal. Existing real-shell tests cover navigation and feature
disable, and the source routes those transitions through the same cancellation
and discard functions. Reference changes also discard retained results through
the shared lifecycle path.

No functional blocker was identified in those contracts. The optional feature
remains provisional and default-off. Device names, driver messages, operator
assertions and selected reference metadata are intentionally part of the
explicit local export, as described by the screen. This change does not close
the separate diagnostic-export privacy requirement in issue #69.

## First authorized execution outcomes

All three initial source-review lanes accepted the frozen source before root
authorized execution. Root reviewed the complete external recorders and configs
and bound authorization to their exact bytes. Only this lane ran project code.
The syntax invocation ran first; its original successful result and unchanged
source/control identities were read before starting the conditional focused
invocation. Each project invocation ran once, sequentially, with no rerun.

| Invocation | Exact scope | First result | Project elapsed time |
| --- | --- | --- | --- |
| Syntax | Absolute Node `--check tools/smoke/player-capture.mjs` | Exit 0; no timeout; stdout and stderr both empty | 0.06412778599769808 s |
| Focused | Absolute Node `--test --test-concurrency=1 --test-reporter=tap` with the seven explicit files below | Exit 0; 111 tests, 111 pass, 0 fail, 0 skipped, 0 cancelled, 0 todo | 3.273620218002179 s |

| Selected test file | Focused outcome positions | Passed |
| --- | --- | ---: |
| `tests/canonical.test.mjs` | 1–9 | 9 |
| `tests/cdj-acquisition.test.mjs` | 10–26 | 17 |
| `tests/cdj-evidence-record.test.mjs` | 27–36 | 10 |
| `tests/player-audio-export.test.mjs` | 37–45 | 9 |
| `tests/player-capture-screen.test.mjs` | 46–85 | 40 |
| `tests/player-reference-file.test.mjs` | 86–95 | 10 |
| `tests/zip-writer.test.mjs` | 96–111 | 16 |

`canonical.test.mjs` is the actual shared SHA-256 regression file. The selected
ZIP regression includes its existing Python `-I` standard-library `zipfile`
compatibility subprocess; that behavior was disclosed before authorization and
its case passed at position 106. It was part of the one focused invocation.

The syntax budget was TERM at 25 seconds and KILL at 30 seconds. The focused
budget was TERM at 115 seconds and KILL at 120 seconds. Neither timer fired.
There were no recorder, source-guard, runtime-identity or postflight errors.
The original focused TAP is 25,096 bytes, SHA-256
`9cbf80ee04a33ee38f1a2a454ba0831436b6d31c316e1e9b871e0b574cdb03fe`;
its stderr is empty. The complete streams are retained as
[focused/run.tap](evidence/player-audio-export-functional-2026-11-21/focused/run.tap),
[focused/stderr.log](evidence/player-audio-export-functional-2026-11-21/focused/stderr.log),
[syntax/syntax.stdout](evidence/player-audio-export-functional-2026-11-21/syntax/syntax.stdout)
and [syntax/syntax.stderr](evidence/player-audio-export-functional-2026-11-21/syntax/syntax.stderr).

The [observed summary](evidence/player-audio-export-functional-2026-11-21/observed-summary.json)
preserves all 111 ordered names and outcomes, the exact outcome lines, their
one-based line positions and zero-based byte ranges, complete block ranges,
source-file grouping and the empty current failure list. The complete original
TAP remains the authority for every block, including durations and diagnostics.

## Runtime, source and control provenance

Both invocations used Node `v24.22.3` at
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`.
The executable is 126,951,512 bytes, SHA-256
`acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa`.
Its bytes matched before and after both gates and during the data-only package
comparison. Full version/runtime stdout and stderr are retained in each gate's
directory; the runtime JSON includes all component versions, executable path,
platform, architecture and identity-command arguments. The complete runtime
stdout is identical between gates.

The recorders rejected any presence of `NODE_OPTIONS`, `DECKCHEK_AUDIO_*` or
`MIXXX_CONTROLLERS_DIR`; none was present. The only recorded environment change
was prefixing PATH with the fixed Node directory. The recorders refused an
existing output directory and retained their full reviewed source/config bytes,
argv, timeout policy, timestamps, exit information and runtime streams. The
control identities are:

| Control | Bytes | SHA-256 |
| --- | ---: | --- |
| Syntax recorder | 17,261 | `96594744e8fb76cf6c40a19b899a805f855dba0809c5db8441aee0f724be498d` |
| Syntax selection | 709 | `cdc68a8f9d40c6f0fe08cd64054f572282b381d42ed071f726b580461cacdccb` |
| Focused recorder | 18,343 | `d41731c5be8fae1455cc2b57a741b3706f727c04001a9d3d7a91b5f64bbd3250` |
| Focused selection | 2,197 | `fe9908bef44f52677cca878beb5e0b9b652ec07913ca4b815546e0c986ca33db` |

All four before/after SHA-256 maps contain every one of the 2,392 tracked paths
and are identical, with file SHA-256
`efe723cd5709c8d28c3619941a08b97612176f22503e416abd5569e36e6e9ef7`.
All four tracked-file inventories match immutable Git paths, and all eight
actual/tracked test inventories match the 203 immutable top-level test paths.
Both recorder Git-tree maps agree with the independent object proof. The
independent data pass read all 2,182 distinct immutable blobs, checked their Git
blob IDs and SHA-256 hashes, and compared the resulting complete map against the
four originals and current source bytes. Report/evidence writes began only after
both execution recorders completed their final source snapshots.

## Complete package and failure preservation

The [manifest](evidence/player-audio-export-functional-2026-11-21/manifest.json)
lists 45 files and excludes only itself. There are 46 package files totaling
3,495,929 bytes including the manifest. Forty files are complete original
copies, with 45 original-path bindings: all files from both raw output
directories, the four external controls and the checked smoke source. Every
binding is compared byte-for-byte. The other files hold the immutable object
map, source proof, ordered outcome summary, retention proof and the data-read
error described below. The manifest is 15,993 bytes, SHA-256
`d96a61e1d6c96a71b8e6e007884e205e1ab44370554e8e537c4ddefe35eef7b7`.

Original directories are
`/workspace/scratch/6f2247f2f463/deckchek-player-audio-export-round11-syntax-raw/`
and
`/workspace/scratch/6f2247f2f463/deckchek-player-audio-export-round11-focused-raw/`.
The [retention proof](evidence/player-audio-export-functional-2026-11-21/retention-proof.json)
records every original path, retained path, byte length and hash. The original
streams and controls have not been replaced or modified.

One initial **data-only packaging** attempt stopped before any package write
because an optional Git provenance comparison named nonexistent
`app/audio-session.js`. Its complete tool error and traceback are retained in
[data-processing-error.txt](evidence/player-audio-export-functional-2026-11-21/data-processing-error.txt).
Static file inventory identified the tracked module as
`app/devices/audio-session.js`. Root acknowledged the data-query error and
continuation of owned data/Git proof. The completed proof uses the tracked path.
No product file, assertion, recorder or first result was changed, and no project
command was repeated. This packaging read error is separate from the successful
first gate results.

The preceding complete gate on
`f1e0ca1fdcaf6c8276f5a92e883b84fc001bf425` remains **2420 tests, 2418 pass,
one failure and one optional skip**. Its case 53,
`session clamps the level to the -12 dBFS cap and honours a lower level`, failed
the final relative-gain assertion with `measured -101 dB at -30 dBFS`; the
preceding cap/lower-level playback assertions passed. The exact prior failure
block, source identity, TAP identity and counts are carried into the observed
summary from immutable preceding evidence. No numerical cause or repair has
been established here. A passing focused lifecycle case that happens to have
index 53 is a different test in a different selection and does not clear that
hold.

## Limits and handoff

This round ran one syntax parse and one seven-file focused gate. It did not run
the complete 203-file suite, a separate build, browser/native application,
network/scanner/probe, audio collector or numerical diagnostic. The smoke file
was parsed without module evaluation or browser launch. Therefore no layout,
accessibility target, actual browser download or WebView/platform claim is
established by that syntax result. The modeled DOM/native boundaries in the
focused tests are explicit limits, not hardware observations.

The previously unavailable local Rust/native SDK and the preceding single
Chromium attempt that stopped on socket EPERM before a page or screenshot are
inherited limitations. They were not re-probed, retried, worked around or
escalated in this round. No physical input capture, ADC format, measured clock,
reference playback identity, pitch accuracy or scientific qualification was
validated. Cancellation suppresses publication; it does not promise immediate
memory zeroization or physical cancellation of an already-running hash.

Raw reference-file retention, qualified pitch analysis, report/History
integration and physical capture/reference validation remain incomplete.
Qualified main `e36ddc41806b0f6639474f207e3b339e063a6e25` remains separate.
Fleet remains off. No release/deployment, permission, measurement threshold,
output cap or archive limit change was made by this audit. Root retains product
fix, integration, publication and CI ownership; this lane's commit contains
only this report and its evidence directory.
