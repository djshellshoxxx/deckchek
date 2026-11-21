# History, Gear Ledger and Mobile — fresh functional audit

Reviewer: `/root/inventory_mobile_functional_round6`. Date: 21 November 2026,
UTC. All three round-five workers completed before this fresh trio began.
This lane was the sole local project executor for round six.

## Disposition

**Complete-source qualification is HELD.** The first actual complete Node gate
finished with **2,391 tests: 2,388 passed, two failed and one optional test was
skipped**. It selected all 198 actual, tracked, sorted top-level test files,
exited 1 without timing out, and preserved all 2,177 tracked file hashes,
HEAD, complete tree and clean source status. The first output is retained in
full. No test rerun or numerical repair occurred.

The failures concern the retry analysis result and a relative-gain assertion.
In the latter test, both preceding playback-level assertions passed: the
requested hot level was capped at -12 dBFS and the requested -30 dBFS level
was honored. The failure does not show that level selection or clamping
failed. Its retained TAP does not contain that session's numeric gain.

All 130 cases from the preceding focused History/Ledger gate and all seven new
empty-error and actual Mobile-parser cases passed in this complete run. The
ordinary Mobile build and the separately authorized PWA smoke syntax check
also passed once. These scoped results do not turn the failed complete gate
into an acceptance result. The authoritative counts and invocation are in
[result.json](evidence/inventory-mobile-functional-2026-11-21/result.json);
all ordered outcomes are in
[observed-summary.json](evidence/inventory-mobile-functional-2026-11-21/observed-summary.json).

## Exact sources and scope

| Item | Identity |
| --- | --- |
| Completed round-five integration | `24f6259f37fcc960e6e1d923b9ae708bb5b0059b` |
| Preparation source | `67fd2d664b8a4847fe2066c47f64682eef796c3b` |
| Preparation complete tree | `5c469cca519d4139dc47196ab6bf015c5247caf6` |
| Generated commit and final tested source | `09c9afc7cfb2857f354feccb65e46a54ca8cfe62` |
| Final tested complete tree | `b650eeac53af1395d6d0792f3639f02cf317490f` |
| Earlier focused candidate | `bdaf685b1ebc3889bf73474e5dc8c8e7f2d35df0` |
| Fixed PR #79 comparison head | `f76908766d53992e20382b9cbe73a668a28a6d1a` |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-inventory-mobile-functional` |
| Branch | `review/deckchek-inventory-mobile-functional-20261121` |

Root's preparation extracted the five existing Mobile routes into the pure
`mobile/lib/routes.js` registry/parser, restricted route recognition to its own
keys, and preserved result IDs and the existing first-segment behavior. It
added three parser cases and two authored PWA smoke checks. The fresh code
review also contributed the empty-error History/Ledger correction and four
regressions. History retains an incomplete-load state when a rejection has
an empty message; Ledger uses a nonempty fallback so an empty-message failure
cannot clear the reload guard.

This lane changed only the explicitly authorized generated `mobile/sw.js`,
then added this report and its evidence directory. Product changes, tests and
smoke assertions were already in the preparation source. The
[source comparison](evidence/inventory-mobile-functional-2026-11-21/source-comparison.json)
records all 15 changed code paths relative to the fixed PR #79 head, including
the preceding History/Ledger work. Root's subsequent Mobile results-export
cache work for #80 is outside this frozen source and receives no qualification
from this run.

## One ordinary Mobile build

Root authorized one invocation of:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node tools/build-mobile.mjs
```

It ran on the preparation source, exited 0 in `0.11486558899923693` seconds,
and did not time out. The budget was 30 seconds, with TERM at 25 and KILL by
30 if required. Its entire stdout was `updated: sw.js` followed by a newline;
stderr was empty. Before/after maps cover all 2,177 tracked files. Only
`mobile/sw.js` changed, with no staged or untracked paths introduced.

The generated patch changes the build stamp from `6d877785e1ef` to
`eca0f2a661c9` and adds `./lib/routes.js` to the precache. It has two insertions
and one deletion in that single file. The resulting service worker has 33
precache entries and SHA-256
`ede63eb2bd8f63332017bf87c70d454a3b4812903d2385de8c242c982545041c`.
The generated-only commit is `09c9afc7cfb2857f354feccb65e46a54ca8cfe62`,
with the preparation commit as its parent. Root and both static peers verified
the generated delta and cache content before the final freeze.

The complete build output, before/after service-worker bytes, source maps,
authorization and commit identity are retained in
[build/result.json](evidence/inventory-mobile-functional-2026-11-21/build/result.json),
[build/generated.patch](evidence/inventory-mobile-functional-2026-11-21/build/generated.patch)
and
[build/generated-commit.json](evidence/inventory-mobile-functional-2026-11-21/build/generated-commit.json).

## Recorder preflight and first actual test execution

The original Python full-gate recorder stopped at its filename guard before
creating the raw-output directory, querying the Node runtime or launching a
project process. Its inherited character class rejected the legitimate
top-level files `tests/monitor.property.test.mjs` and
`tests/scratch.property.test.mjs`. **That preflight attempt executed zero Node
or project processes.** The ordinary build described above had already run
earlier in the round.

The original traceback and recorder bytes are retained separately. Root
reviewed and authorized one correction to the filename regex: the character
class `[a-z0-9-]+` became `[^/]+`. Exact equality between the 198 actual files,
198 tracked files and 198 explicitly authorized sorted paths remained
required. No source, test selection, budget or other recorder control changed.
The corrected recorder then launched the first actual full gate once on the
same frozen source. This was a preflight correction, not a test rerun. See
[preflight/result.json](evidence/inventory-mobile-functional-2026-11-21/preflight/result.json),
[original tool output](evidence/inventory-mobile-functional-2026-11-21/preflight/tool-output.txt),
[original recorder](evidence/inventory-mobile-functional-2026-11-21/preflight/original-recorder.py)
and [corrected recorder](evidence/inventory-mobile-functional-2026-11-21/run-full-node.py).

## Complete gate execution

| Item | Recorded result |
| --- | --- |
| Runtime | Node v24.22.3, Linux x64; Python recorder v3.12.14 |
| Absolute Node executable | `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` |
| Test selection | All 198 actual/tracked top-level `tests/*.test.mjs`, explicitly sorted |
| Runner arguments | `--test --test-concurrency=1 --test-reporter=tap` followed by the exact file list |
| Started, UTC | `2026-11-21T09:17:22.742754+00:00` |
| Completed record, UTC | `2026-11-21T09:23:31.930004+00:00` |
| Child execution elapsed | `368.9246341549988` seconds |
| Execution budget | 600 seconds; TERM at 595, KILL by 600 if required |
| Exit / timeout | 1 / false |
| TAP counts | 2,391 tests; 2,388 pass; 2 fail; 1 skipped; 0 cancelled; 0 TODO |
| Stderr | Empty |
| Tracked source hashes | All 2,177 unchanged; identical inventory, HEAD/tree and clean status |

The [authorized selection](evidence/inventory-mobile-functional-2026-11-21/authorized-selection.json)
and [test-file inventory](evidence/inventory-mobile-functional-2026-11-21/test-files.json)
are preserved with the full argv. No shell wildcard expanded the selection.
`NODE_OPTIONS`, `DECKCHEK_AUDIO_CONTEXT_PATH` and all
`DECKCHEK_AUDIO_FIT_*` variables were absent. PATH was prefixed with the same
absolute Node directory for existing test subprocesses. No numerical
collector or added engine switch was enabled. The recorded parent invocation
does not claim to describe unobserved child argument expansion. Node version
and component queries were metadata-only.

The recorder and raw outputs were outside the checkout. Source maps,
authorization, explicit selection and the running record were saved before
execution; stdout and stderr were written directly to new files. The result
and after maps were captured before adding this audit package. The recorders
refuse to reuse their first-outcome paths.

## The two retained failures

### Retry analysis result — case 37

`tests/audio-runner-lifecycle.test.mjs` declares the test at line 182. The
failing assertion is at line 197, comparing the returned analysis status with
`pass`. The test is named “bug 1: a capture that cannot start plays nothing,
saves nothing, and Try again then records and saves once.” Its retained error
states: **“3 of 9 checks failed: balance, response, polarity.”**

The existing `[AQ-RETRY-CONTEXT]` payload preserves the returned synthetic
fixture result, including gain -110 dB, channel balance -220 dB, response
flatness 220 dB, polarity value 1, THD 6935867070.3903%, THD+N -151.12 dB
and SNR 217 dB. It also retains playback and call records. These are fixture
observations from the first output, not physical measurements or a causal
diagnosis. The complete payload remains in
[run.tap](evidence/inventory-mobile-functional-2026-11-21/run.tap).

### Relative-gain assertion — case 53

`tests/audio-session.test.mjs` declares “session clamps the level to the
-12 dBFS cap and honours a lower level” at line 89. Its assertions that a
requested -3 dBFS becomes -12 dBFS and that a requested -30 dBFS is honored
both preceded the failure and completed successfully. The failure is the
final assertion at line 94, requiring the absolute returned `aq_gain_db` to
be below 0.1, with the message **“gain is relative to the played level.”**

The TAP records expected `true` and actual `false` for that assertion. It
does not retain the numeric gain for this session. The retry case's numeric
gain is not attributed to this different test. This result establishes a
failed relative-gain assertion while preserving the successful level-setting
assertions.

The cubic-nonlinearity case 22, “harmonic distortion is measured (cubic
nonlinearity) and chain floor is subtracted,” passed in this run. The only skip
was case 950, the optional local Mixxx corpus because `MIXXX_CONTROLLERS_DIR`
was not set. These outcomes and both failures are retained in the full TAP
and ordered summary; no later pass replaces an earlier failure.

## Passing scoped coverage

All 130 case names from the prior focused History/Ledger gate matched passing
outcomes here. This includes its incomplete enumeration, persistent error and
retry, stale-load ordering, export guards, privacy and durability contracts.
The prior gate itself belongs to `bdaf685b1ebc3889bf73474e5dc8c8e7f2d35df0`;
the current passing matches are independently present in this first complete
run. The summary retains every matched name.

The seven additional cases also passed:

| Case | Passing contract |
| --- | --- |
| 667 | History keeps an empty object rejection distinct from confirmed empty history |
| 668 | History keeps an empty string rejection distinct from confirmed empty history |
| 820 | Ledger blocks stale export after an empty object reload rejection |
| 821 | Ledger blocks stale export after an empty string reload rejection |
| 1226 | Mobile recognizes all five declared routes and supported prefixes |
| 1227 | Mobile falls back to Speed for empty, unsupported and inherited names |
| 1228 | Mobile preserves result IDs and existing first-segment routing |

The parser tests import the actual pure router module. History/Ledger screen
tests exercise real modules through DOM fixtures and modeled readers. These
results establish those contracts in the Node environment. They do not
establish browser rendering, actual keyboard behavior, native database
behavior or physical hardware performance.

The source comparison establishes byte equality for `app/audio-quality.js`,
`app/calibration.js`, `app/devices/audio-session.js`, `app/audio-out.js`,
`tests/audio-quality.test.mjs`, `tests/audio-runner-lifecycle.test.mjs` and
`tests/audio-session.test.mjs` across the fixed PR #79 head, the prior focused
candidate and the current frozen source. This is source-identity evidence;
it does not identify or rule out a runtime cause, establish a solver defect,
or demonstrate a repair for issue #72.

## Separate PWA smoke syntax check

After the complete gate, the one separately authorized additional project
command was:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --check tools/smoke/mobile-pwa.mjs
```

It started at `2026-11-21T09:23:51.737560+00:00`, exited 0 in
`0.06390793699756614` seconds and did not time out. Its budget was 30 seconds,
with TERM at 25 and KILL by 30 if required. Stdout and stderr were empty.
The 13,796-byte source had the same SHA-256 before and after:
`d128208810f21f31ff508fc70c54bec620736cce6f21a7ccba3390e3ccf6d07c`.
All 2,177 tracked hashes, HEAD, tree and clean status remained unchanged.

This parsed the module only. It did not execute either new smoke scenario or
launch a browser. The earlier local Chromium startup limitation was not
retried or worked around. See
[smoke-syntax-result.json](evidence/inventory-mobile-functional-2026-11-21/smoke-syntax-result.json).

## Evidence integrity and independent handoff

The complete first TAP is **556,814 bytes**, SHA-256:

`bf5b091c0a20826a64cac1842d0d5b057a5dc91a46c5a68ebcca1b9e60f50eaa`

The [manifest](evidence/inventory-mobile-functional-2026-11-21/manifest.json)
binds **35 evidence files**; the manifest itself is excluded from that count.
Its SHA-256 is:

`15e24ffa794a4da0d49d46358ce78f6f0b41945a3ddd0ee0da5afcfc311c9d9d`

The [retention proof](evidence/inventory-mobile-functional-2026-11-21/retention-proof.json)
records **31 byte-identical original artifact and recorder copies**, including
the original failed Python preflight, both gate recorder versions, build
records and the final syntax check. Derived observations do not replace the
original raw output.

| Recorder or configuration | SHA-256 |
| --- | --- |
| Ordinary build recorder | `0a5e3806f25760e38162b9fea33d2003b15286c4b17c61d0db51747dc9cd8c93` |
| Root build configuration | `3e2963b0767208f1e80013270d60da6248f0d6a331279832498fb0376d627ea2` |
| Original preflight recorder | `054d3588475db9a68b4e5030ff5c8db232373e0c4763e51527bfac1a446126fd` |
| Corrected full-gate recorder | `1589eddd88d1c99c209edf96d92855293880326b6ca15c0eae810768c9409775` |
| Root full-gate configuration | `f9c7e643311908610e9cf1a62afb4b9796247dd895675e80da8ab13db7395c1d` |
| PWA syntax recorder | `dd4a469ac88a5c0ef480035000e50da3568b2779972d8ee8b7ac4f47d35f3e12` |

The retained [data-only verifier](evidence/inventory-mobile-functional-2026-11-21/verify-evidence.py)
passed. It checked the exact manifest contents and every original copy; all
2,177 immutable Git blob hashes against the three full-run/syntax maps; both
build maps and the sole generated delta; source/tree, authorization, runtime
and argv identities; all 198 selected files; the complete TAP hash, plan,
footer and 2,391 sequential outcomes; the 130 prior and seven new passing
cases; the sole preflight regex correction; and the changed-source and audio
source comparisons. This verifier reads data and Git objects only and does
not execute project modules or replay tests.

Both fresh static reviewers received the stable original results and final
package manifest and independently verified them. Their code and security
dispositions belong to their own reports. This functional report does not
substitute for either review.

Staged whitespace review identified three whitespace-only lines in retained
originals: the context line at `build/generated.patch:7` and the TAP error
spacing at `run.tap:228` and `run.tap:230`. Those bytes are preserved so the
retained originals remain identical. No evidence bytes were normalized.

## Remaining qualification and lane completion

Issue #72 remains unresolved. The complete-source gate is held on its two
retained failures even though the scoped feature cases passed. No cause,
numerical fix or exclusion is established. The fixed PR #79 source and its
hosted checks are separate from this later candidate; neither source inherits
the other's results. Applicable hosted browser, native/platform, performance
and physical qualification remains separate.

This lane's project execution was limited to the one ordinary build, one
actual complete test gate and one syntax check described above. Following the
final source freeze, this lane made no source/test repair or assertion/threshold
change. It performed no numerical diagnostic, browser retry, native launch,
remote mutation or qualification bypass. Evidence was packaged after the
final unchanged-source capture.

The functional lane is complete. Root owns consolidation, publication, any
later authorization and the next fresh rotation after all three current
workers have delivered their final handoffs.
