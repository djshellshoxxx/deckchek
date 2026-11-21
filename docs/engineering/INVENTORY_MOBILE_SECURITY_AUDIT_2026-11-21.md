# Inventory and Mobile — fresh defensive source audit

Reviewer: `/root/inventory_mobile_security_round6`. Date: 21 November 2026,
America/Los_Angeles. All three round-five workers completed before this fresh
trio began. This report is the sole file owned by this lane.

## Review status

Source and generated-artifact review found no new defensive blocker in the
scoped History, Gear Ledger and Mobile routing changes. **Overall candidate
qualification is held:** the first complete Node gate has two audio-test
failures. Its full outcome, unchanged source and final retained package have
been independently checked. This lane executed no project, test, browser, native
component, scanner, probe, extracted implementation or vulnerability reproduction.
It made no product or remote changes.

## Exact source and method

| Source | Commit | Complete tree |
| --- | --- | --- |
| Fixed feature predecessor, PR #79 | `f76908766d53992e20382b9cbe73a668a28a6d1a` | `32ca272be2daeee6c4c1f47ccd5bd0ed0ac9909e` |
| Integrated round-five reports | `24f6259f37fcc960e6e1d923b9ae708bb5b0059b` | `38cd01373e7648420acdc4e3abbfee4b6b6db010` |
| Root preparation source | `67fd2d664b8a4847fe2066c47f64682eef796c3b` | `5c469cca519d4139dc47196ab6bf015c5247caf6` |
| Official generated Mobile stamp | `09c9afc7cfb2857f354feccb65e46a54ca8cfe62` | `b650eeac53af1395d6d0792f3639f02cf317490f` |

The isolated worktree is `deckchek-inventory-mobile-security`, branch
`review/deckchek-inventory-mobile-security-20261121`. It fast-forwarded only to
the exact commits supplied by root. Review uses source/Git reads, retained
JSON/TAP inspection and standard-library byte/hash calculations. Root owns
implementation and integration; the functional worker alone executes authorized
project commands. No uncommitted source is treated as a reviewed freeze.

The combined delta from PR #79 contains seven product files, six test files and
two smoke modules, plus documentation/evidence. No package manifest, lockfile,
native schema, command, capability or workflow definition changes in that delta.

## History and Ledger boundaries

The inherited [History feed](../../app/history-feed.js) attributes unavailable
or non-array sources and mapper-declined rows while preserving valid neighbors.
The [screen](../../app/ui/screens/history.js) requests enabled feature lists,
checks visibility again before publication, and discards stale generations.
Persistent notices use fixed source labels and omission counts through text
nodes. Loaded counts and Retry distinguish incomplete reads from confirmed empty
history. The additional explicit-null marker preserves failure even when the
diagnostic reader rejects with empty text; a generic toast fallback stays visible.

The [Ledger API](../../app/ledger/api.js) validates list containers for catalog,
public notes, customer-unit flags, maintenance, certificates and photos. Initial
enumeration failures reach the existing error view. Unknown photo inventory at
the final build stops before writing, so it cannot become an apparent empty set
for folder pruning. Confirmed empty arrays remain valid. Known individual read
failures retain attributed partial-result behavior; absent certificate contents
now receive an explicit unreadable-certificate entry.

The [Ledger screen](../../app/ui/screens/ledger.js) invalidates preview state on
reload, blocks step/build/export entry while loading or failed, and publishes
only the newest generation. Successful reloads prune vanished selected IDs while
preserving explicit privacy choices. Existing note queues retain failed drafts.
The new nonempty error fallback keeps an empty-string rejection from reopening
cached export state.

These changes do not provide complete native-record validation or a transaction
spanning all readers. Existing browser read fallbacks, older-command compatibility
and visible partial exports remain explicit limits. Feature visibility is a UI
scope control, not a new authorization mechanism. The actual revision requirement
and staged native folder writer are unchanged.

## Mobile dispatch and generated cache

The actual five-screen registry and parser now share the pure
[routes module](../../mobile/lib/routes.js). Own-key membership selects declared
records and preserves the Speed fallback, supported prefixes, first result-ID
segment and existing undecoded-ID behavior. The shell preserves its `parseHash`
export; tests import the actual module rather than a copied parser.

I independently resolved all five relocated lazy imports to the same existing
screen files and titles. The shell's complete render/worker-registration suffix
is byte-identical. User input selects a fixed loader and never constructs its
module path. The result ID remains exact lookup data in the unchanged local
Results store. No capture, upload, permission or native interface is added.

Generated commit `09c9afc7` changes only `mobile/sw.js`: the build stamp becomes
`eca0f2a661c9`, and `./lib/routes.js` is the sole added precache entry. I checked
all **33** entries against the Mobile file inventory and independently derived
the stamp from file hashes. Both portions outside the generated block are
byte-identical; same-origin request handling and update activation are unchanged.
The service-worker SHA-256 is
`ede63eb2bd8f63332017bf87c70d454a3b4812903d2385de8c242c982545041c`.
The normal build tool is unchanged. This analysis did not execute it.

## Unchanged boundaries and authored coverage

I independently compared **27** selected dependencies against fixed PR #79 and
their immutable Git blobs. They include Ledger privacy/build/template/write
queue, catalog/photo stores, feature defaults, DOM/live helpers, native registry
and Ledger/certificate/photo/Fleet maintenance modules, default capabilities, numerical
analyzer/calibration/cubic test, Mobile build tool/Results/store/UI/manifest, and
all four workflow definitions. No broadened privilege or export path was found.

Real parser tests cover declared/unsupported/inherited names, prefixes and IDs.
Four additional real-screen cases cover empty Error/empty-string rejection.
Existing History/Ledger privacy, persistence and no-write assertions remain.
Two Mobile route checks and eight inventory/history smoke checks are authored
browser coverage until run at their exact source. DOM fixtures and syntax checks
are not rendered-browser, native-database or physical qualification.

The previous package remains bound to `bdaf685`: I independently verified all
**19** manifest entries and the complete **130/130** first TAP. That focused
result does not qualify the newer source's full suite. The current complete TAP
also contains all **130** matching earlier case titles and the **seven** new
empty-error/router cases as passes. This is bounded feature evidence within an
overall failing full run.

## Separate adjacent finding

The unchanged [Mobile Results screen](../../mobile/screens/results.js) captures
export text, File content and save/share/copy/QR closures in `renderPanel()`, but
nickname/serial change handlers update settings without rebuilding the open
panel. Edited details can remain stale until another action re-renders it;
serial edits/clears affect operator privacy expectations. The existing
[PWA smoke](../../tools/smoke/mobile-pwa.mjs) masks its nickname assertion with
an unconditional true alternative.

This is a source-derived adjacent defect, not an executed reproduction or
incident claim. Root acknowledged it for a separate issue and successor and
kept this round's source fixed. This lane made no product or remote mutation.

## Final retained evidence and disposition

The functional worker's first complete gate uses the exact generated source
`09c9afc7cfb2857f354feccb65e46a54ca8cfe62`, tree
`b650eeac53af1395d6d0792f3639f02cf317490f`. The explicit **198-file** selection
equals both the tracked and actual top-level test inventory. The retained command
uses absolute Node **24.22.3**, serial test concurrency and TAP output, with no
`NODE_OPTIONS` or numerical diagnostic variables. The recorded run started at
**2026-11-21T09:17:22.742754+00:00**, ended at
**2026-11-21T09:23:31.930004+00:00**, and executed for **368.924634155 seconds**
within its 600-second budget, without timeout.

| Retained observation | Independent verification and meaning |
| --- | --- |
| First full Node outcome | **2,391 total; 2,388 pass; 2 fail; 1 skip; exit 1.** Every numbered top-level outcome, the single complete plan and all footer counts agree. The skip is the optional Mixxx corpus whose directory was not set. |
| Full TAP | **556,814 bytes**, SHA-256 `bf5b091c0a20826a64cac1842d0d5b057a5dc91a46c5a68ebcca1b9e60f50eaa`. Stderr is empty. The complete failing output remains preserved. |
| Source integrity | All **2,177** file hashes in each of the before, after and post-syntax maps equal the immutable Git source blobs. Recorded HEAD/tree and clean status remain unchanged. |
| Mobile build | One normal official build on preparation source `67fd2d6`, exit 0; only the generated worker changed. The complete before/after maps equal the immutable preparation/generated source blobs. |
| Mobile smoke syntax | One `--check` of `tools/smoke/mobile-pwa.mjs`, exit 0, **0.063907937 seconds**, empty stdout/stderr. Source SHA-256 remains `d128208810f21f31ff508fc70c54bec620736cce6f21a7ccba3390e3ccf6d07c`. This parses the authored smoke module; it does not execute browser checks. |

The two failing assertions require distinct descriptions:

| TAP case | Exact observed failure |
| --- | --- |
| 37, capture failure followed by Try again | `tests/audio-runner-lifecycle.test.mjs` reaches its final retry-result status comparison with `fail` instead of `pass`; the retained result attributes balance, response and polarity failures. Earlier lifecycle assertions, including one playback and one saved retry result, completed. |
| 53, playback level cap and lower level | `tests/audio-session.test.mjs` fails the final assertion that measured `aq_gain_db` is within the expected tolerance relative to playback. The preceding `-12` and `-30` playback-level assertions completed. This result does not demonstrate a failure to enforce the playback cap. |

The cubic-distortion case passed in this first full outcome. I independently
compared eight relevant audio implementation/test paths with fixed PR #79:
the session, runner, analyzer, output and capture helpers, and the session,
runner-lifecycle and cubic tests are byte-identical. Neither byte identity nor a
later pass establishes the cause or repair of the unresolved #72 numerical
failures. The separate session gain assertion also remains unexplained. No
diagnostic rerun, fixture change, tolerance change or solver adjustment is part
of this review.

Before this first full Node invocation, the original Python recorder rejected
`tests/monitor.property.test.mjs` and `tests/scratch.property.test.mjs` at its
filename guard. Its preserved traceback and source place that rejection before
output-directory creation, runtime queries and any Node/project process. The
only recorder correction admits dots inside a top-level filename while retaining
exact equality with all **198** authorized, actual and tracked test files. I
verified the original recorder, corrected recorder and configuration hashes,
their preserved copies, and this sole line change. The corrected recorder's
SHA-256 is
`1589eddd88d1c99c209edf96d92855293880326b6ca15c0eae810768c9409775`.
This preflight failure and the first complete failing gate are separate records;
there is no passing rerun substituted for the first result.

I independently verified all **35** entries in the retained
[manifest](evidence/inventory-mobile-functional-2026-11-21/manifest.json), whose
SHA-256 is
`15e24ffa794a4da0d49d46358ce78f6f0b41945a3ddd0ee0da5afcfc311c9d9d`.
All **31** original artifacts and recorders still existed and matched their
retained copies byte for byte. The
[complete TAP](evidence/inventory-mobile-functional-2026-11-21/run.tap) and
[observed summary](evidence/inventory-mobile-functional-2026-11-21/observed-summary.json)
agree on every one of the 2,391 outcomes. I independently matched the 130 earlier
case titles, seven additional cases, all 15 changed code-path hashes and the
package's seven unchanged audio-path hashes across its three recorded commits.
The package verifier was read as source; this lane did not execute it.

**This defensive audit is complete; complete-source qualification remains held.**
The scoped source conclusion does not resolve #72 or the session gain assertion.
PR #79's hosted gates belong to its fixed predecessor source and are not borrowed
for this candidate. Hosted and physical qualification remain separate. Fleet
stays default-off; its fixed diagnostic is not rerun. No new privileges, release
or deployment is approved by this report.
