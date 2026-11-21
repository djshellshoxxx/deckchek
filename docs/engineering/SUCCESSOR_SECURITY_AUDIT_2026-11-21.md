# Combined feature successor — fresh defensive source audit

Reviewer: `/root/successor_security_round4`. Review date: 21 November 2026,
America/Los_Angeles. This fresh trio began after all three fit round-three
workers completed. This report is the sole file authored by this lane.

## Disposition

**No new defensive source blocker was identified in the reviewed combined
reference-file, PDF-axis, toolbar/guide or ledger-preset changes.** The
corrections preserve their bounded data, ownership and qualification contracts.
This conclusion is about the inspected source; it does not qualify physical
capture, actual responsive rendering or numerical correctness outside the
observed tests.

The functional worker's first complete gate on this source passed: **2,359 total,
2,358 passed, zero failed and one optional Mixxx skip**. I independently checked
its retained output, exact selection and unchanged source maps below. This is a
passing Node observation for the stated freeze. Original numerical failures
remain preserved; neither this pass nor the earlier instrumented 33/33 pass
establishes their cause or a production audio repair.

## Immutable scope and method

| Source | Commit | Complete tree |
| --- | --- | --- |
| Qualified main used for the comparison | `77c26f44710c6dfb1c986fb79266c233e2ae688c` | `5986c675b123203ecaf46f352d99a25b539c9f9f` |
| Assigned combined successor | `fb81960b417ad16c155b7793814cbb4a7545d41e` | `724274fae453a867e4adf5009deef7b0cf4b190c` |

The isolated worktree is `deckchek-successor-security`, branch
`review/deckchek-successor-security-20261121`, initially clean at that exact
source. The product delta contains seven files. Native source, capabilities,
workflows, package manifests, feature defaults, acquisition/evidence machinery,
the audio analyzer and calibration solver are unchanged from the stated main.
Those unchanged dependencies were inspected where the new data flows reach them.

This lane uses source/Git inspection, static data-flow review, retained JSON/TAP
reading and byte/hash comparisons. It executes no project code, application,
test, browser, native component, extracted implementation, scanner, probe or
vulnerability reproduction. It makes no remote mutation. The functional worker
is the sole runtime executor; root owns product corrections and publication.

The seven working-file contents were independently matched to their immutable
`fb81960` Git blobs:

| File | SHA-256 |
| --- | --- |
| `app/index.html` | `c21d3c5437908cc454c44eae45a068691350cc2c9177de50e0cc82e761e3270b` |
| `app/ledger/privacy.js` | `35e023553c648be7a378c66c89072dda9cbc27adcdcbbbdcce24bd5b6fad610e` |
| `app/player/reference-file.js` | `d20d1f245e3c446d4e1641fee8503d1e50a3fa4620c238395ae4623e936e6889` |
| `app/report-pdf.js` | `84a269d9fc4e6dff067c25006fa4805ffb8ae30e434919d5d2010f1b21bc69a2` |
| `app/styles.css` | `7362aeb1d965769fb6734e706574aff5bd8b6c9e3ba60b3166c28d6727f52709` |
| `app/styles/player-capture.css` | `69c19c4e58fc5853d257c80a6ba2b6681b278ccdf339c305dba9fb8de496e2cc` |
| `app/ui/screens/player-capture.js` | `8c00f223f9a1e1685dc9dfb8625dac2c3ee5e0b3f60c06624c9c6ff4fb002192` |

I read the [current handoff](../DECKCHEK-CONTINUATION-HANDOFF.md),
[fresh review assignment](FIT_AND_UI_CONTINUATION_2026-11-21.md), preceding
[reference defensive audit](PLAYER_REFERENCE_SECURITY_AUDIT_2026-11-20.md),
[fit/UI defensive audit](FIT_AND_UI_SECURITY_AUDIT_2026-11-20.md) and
[audio-context defensive audit](AUDIO_CONTEXT_SECURITY_AUDIT_2026-11-20.md).
Earlier acceptances remain tied to their stated sources.

## Selected-file identity and lifetime

The [reference helper](../../app/player/reference-file.js) snapshots filename and
declared size before awaiting. It accepts a nonempty safe-integer byte length
up to 32 MiB, a nonblank name of at most 240 UTF-16 code units without C0/DEL
controls, and a byte-read method. The returned buffer must be an ArrayBuffer
whose actual length equals that snapshot and still satisfies the cap. It reads
the explicitly selected local File; it does not open a supplied pathname/URL,
decode selected contents, request a native file capability or upload data.

The existing [SHA helper](../../app/sha256.js) prefers Web Crypto and retains its
local pure-JavaScript fallback. Both operate on the selected bytes. The per-file
cap is not a claim about total process memory or UI responsiveness: the fallback
also allocates a padded buffer. The helper is not a global concurrency limiter
or a validator of arbitrary executable JavaScript objects.

The result is frozen primitive metadata with schema, filename, byte length,
SHA-256, selected-file-byte hash basis, `playbackIdentity: 'unverified'` and
`bytesRetained: false`. Filename and MIME type do not validate audio. A hash does
not establish authentication, a particular reference frequency, actual player
playback or measurement-chain qualification.

The [screen](../../app/ui/screens/player-capture.js) clears a delivered input
value before an inactive/busy owner can return. This retains the earlier
late-picker cleanup correction. An accepted request holds only its local File
snapshot while reading. Request identity, aborted state, visibility and disposal
all gate publishing either a descriptor or a read error. Clear, Escape, hide
and disposal invalidate the active reference owner.

Cancellation suppresses publication; it does not physically interrupt an
already-started File read/digest or securely erase transient memory. The screen
keeps that request busy until settlement and blocks another selection or capture
start. Reopening cannot reactivate an aborted request. Selecting or clearing a
reference discards the previous capture result, so its metadata cannot silently
be relabeled with a different reference.

At capture start, the immutable descriptor is snapshotted before any await. Its
digest feeds the existing evidence field and the same descriptor accompanies
the completed capture. `last` retains acquisition, record and selected-reference
metadata; it does not retain `captured.audio` or the full capture return object.
Export serializes those three selected metadata fields and uses the existing
generated capture identifier for the download name. No History write, report
registration, raw-byte persistence, external request or telemetry is added.

The unchanged [evidence constructor](../../app/player/evidence-record.js) still
sets `status: 'unverified'`, `eligibleForReport: false` and `measurement: null`.
A supplied hash removes only a missing-field reason. The independent-validation
reason remains. Deserialization rebuilds qualification rather than trusting a
serialized claim.

Filename/hash/status/error text reaches `textContent` or the shared text-node
helper, not HTML or a command. Metadata may identify a chosen file or include
operator/device names and driver messages; the export explanation discloses
these fields. Metadata-only does not mean anonymous, redacted or securely erased.
No broader privacy acceptance is inferred from this feature.

## PDF representability and explicit unavailable state

The [PDF helper](../../app/report-pdf.js) rejects nonfinite/nonpositive raw scale,
tick step, rounded endpoints and rounded span before constructing chart
coordinates. In particular, finite endpoints do not suffice when their rounded
difference overflows. Ordinary, representable small and large ranges retain the
existing path. This is a bounded representability guard, not a general guarantee
of extreme-offset tick accuracy or a change to measurement values.

The unchanged `chartsHtml` boundary catches the calculation error, appends an
explicit chart warning and emits an unavailable-chart placeholder. Its title is
escaped, as are the existing SVG labels. The guard does not convert an unavailable
chart into a successful measurement or invent replacement points. No print-host
permission, sandbox, native command, persistence or external service changes.

The authored regressions inspect the complete printable warning/fallback as
well as the helper. The browser smoke adds actual print-layout and mixed
ordinary/unavailable-chart checks, but those assertions require their own
executed rendering evidence. This lane did not run them or attempt to reproduce
the original malformed-coordinate behavior.

## Toolbar, accessibility and guide content

The CSS permits the shared header row and device fields to wrap while preserving
button dimensions. Explicit input/rate names survive hidden short labels. The
new smoke examines presence, target size, bounds, pairwise overlap, center hit
testing, calibration-chip containment, content position and document overflow at
320, 420, 800 and 1,440 CSS pixels in browser and modeled-native contexts.
These are authored checks; source inspection does not establish their rendered
outcomes or exhaustive accessibility.

Player calls the existing [inspector API](../../app/ui/shell.js) with static DOM
nodes and `open: false`. The guide replaces the prior workflow's body without
opening a closed drawer. It contains no user-derived HTML. Its capture,
selected-file identity, export/reset and shortcut descriptions preserve the
provisional/unmeasured boundaries. Capture ownership, cancel behavior, native
availability and default-off activation remain unchanged.

The original PR #74 screenshots belong to its source. They cannot qualify this
new wrapping/guide behavior. The prior local Chromium socket denial is unchanged;
this lane made no browser attempt, retry or workaround.

## Ledger preset normalization

The [privacy module](../../app/ledger/privacy.js) uses one predicate requiring a
primitive string and an own key in the frozen declared preset table. `makeRules`,
`normalizeRules` and `matchesPreset` share it; preset comparison additionally
returns false for a missing/nonobject field map. This prevents inherited table
members or coerced values from being mistaken for declared presets.

Public, Insurance and Private definitions stay unchanged. Unknown names begin
with complete Public defaults, then normalization retains explicit valid serial,
field and item overrides. Custom remains an editable rules label, not a fourth
preset definition; `makeRules('custom')` continues to choose Public defaults.
The correction is not a forced reset of all stored choices.

I traced actual restoration in the [ledger screen](../../app/ui/screens/ledger.js)
and the [build boundary](../../app/ledger/build.js). Both normalize their inputs;
the latter first narrows item overrides to selected IDs before applying the
existing whitelist. No export field, certificate inclusion rule, serial masking,
path scrub, item cap or permission is expanded. Arbitrary proxies/accessors are
not claimed as a supported data schema.

The two new contract tests cover declared/invalid preset names, complete fallback,
malformed field maps, continued editing and Custom/item-mask round trips on the
corrected source. This lane read them without execution. Issue #75 remains a
source-derived correctness finding; this review establishes no data disclosure,
production incident or exploitation.

## Diagnostic paths remain outside product execution

No production `app` file imports the audio diagnostic tools or refers to their
opt-in environment names. The existing Tauri frontend directory remains `app`.
The standalone numerical diagnostic runs its synthetic analysis only when
explicitly invoked. The new preparer/recorder/driver are opt-in development
tools, not UI, network or capture routes.

The preparer extracts a specified clean committed tree, verifies regular-file
paths and Git blob content, and adds thirteen reversible lines only to an
external disposable analyzer copy. The recorder serializes selected scalar
representations, identity/range/hash metadata and existing output summaries;
it does not export waveform samples or invoke analysis. WeakMap identities add
no properties to original objects. Records are immediately immutable strings,
with explicit record/byte caps, truncation and error reporting. File output uses
a sanitized test-file/PID name, exclusive creation and restricted permissions.

The reviewed driver revalidates source/copy maps and reviewed hashes, requires
explicit local review records, and bounds one two-file invocation. Those records
document the coordinated observation; they are not a new product access-control
mechanism. It preserves first output and rejects unexpected source/copy changes.
None of these tools was invoked by this security lane or authorized for the
current full-source gate.

The runner test's optional aggregate is gated by
`DECKCHEK_AUDIO_CONTEXT_PATH` and imported in its final hook. With that variable
absent it does not collect references, import the serializer or write a file.
The retry assertion's richer message serializes already-returned synthetic
result/counter data after calculation, without waveform samples. Static comparison
confirmed the original 18 declarations and 118 assertion-call sequence remain;
the actual/expected assertions, numerical thresholds and skips are unchanged.
Additional diagnostic message work can affect later execution context and is
not described as timing-equivalent to the earlier test file.

## Prior evidence integrity

I independently checked all **68** entries of the retained
[fit/UI evidence manifest](evidence/fit-and-ui-functional-2026-11-20/manifest.json),
SHA-256 `3426f7067e8c2dfef98ef3ea683c6991615982a4d83e1c1f13efcead9097a1ca`.
Every stated byte length and digest matched. The 2,036-entry focused maps and
both 2,039-entry trace source/copy map pairs are equal.

The two retained trace files contain 346 and 181 records, without truncation,
drops or collector errors. Their 23/11 validated entries include 19/10 complete
returns. These are stable passing observations under instrumentation, not an
observation of the earlier failure. The prior 82/82 SPEC output remains distinct
from the 33/33 TAP trace; neither is a full-source gate.

The three archived status documents also match their recorded byte lengths,
hashes and original `d76f069` Git blobs exactly. Consolidating current instructions
did not discard their historical failures or source-specific qualifications.

## Current full-source outcome

The sole functional executor ran the first complete serial Node gate against
unchanged `fb81960` / tree `724274fa`. The exact arguments select all **193**
top-level `tests/*.test.mjs` files, with `--test`, `--test-concurrency=1` and
`--test-reporter=tap`. Runtime metadata records Node **v24.22.3**, Linux x64,
`NODE_OPTIONS` absent and an empty diagnostic-variable inventory. No aggregate
collector or disposable trace was enabled.

The recorded start/completion timestamps are 08:33:54.779435 and 08:39:58.547685
UTC on 21 November 2026. Retained execution elapsed time is
**363.495217706 seconds**; the TAP duration is **363,383.61948 ms**.
It exited **0**, without timeout, and stderr
is empty. TAP records **2,359 total / 2,358 passed / 0 failed / 0 cancelled /
1 skipped / 0 TODO**. Its one skip is the existing optional local Mixxx
controllers corpus, with `MIXXX_CONTROLLERS_DIR` unset.

I independently verified all 2,359 numbered outcomes are sequential and agree
with the terminal TAP plan/counts, with no failing outcome. The retained 193-file
inventory exactly equals the immutable Git tree's top-level test selection and
the complete argv. Both 2,125-entry tracked maps are equal, have exactly the
frozen Git tree's paths, and match every corresponding byte hash in this
security worktree. Pre/post metadata records clean status and the same commit
and complete tree. The initial and final metadata agree on all shared fields.

The bounded reference identity, stale-picker ownership, PDF unavailable-chart
and ledger-preset regressions all appear as passing outcomes. The earlier cubic
distortion case is outcome 22 and the immediate-retry case is outcome 68; both
pass in this invocation. This review read the artifacts; it ran no test or
diagnostic and requested no repeat.

Retained artifacts were initially inspected at
`/workspace/scratch/6f2247f2f463/deckchek-successor-round4-raw` and are preserved
in the [functional evidence package](evidence/successor-functional-2026-11-21/manifest.json).
I independently checked all **12** manifest entries and all **nine** original
artifact/driver copies byte for byte. Its manifest SHA-256 is
`cf20f0b6ef503a90f38a4a6e9187a3b50bb2bd59fa80dd5a3127a2af316cf47c`.
The retained driver was read statically; its single invocation, first-directory
guard and diagnostic-environment checks agree with the execution metadata.

Key retained artifact identities:

| Artifact | Bytes | Independently verified SHA-256 |
| --- | ---: | --- |
| `result.json` | 10,517 | `7ad509925d87148b994a0d43581e999bd37d5ad783b9cd0621ed1f89807ae310` |
| `run.tap` | 540,148 | `102009e4ba4133f6d90dee363e928458595de332183fe7cf32b43cd8a221c962` |
| `running.json` | 9,802 | `f13a79715109ba97394835ecee8b25152efebd7b430518ff2ef841b66872dc50` |
| `test-files.json` | 7,407 | `ad3294eb9c80c832f8dba90996a2a3ad13b20bace05934c7fecf1a869533df2b` |
| `tracked-before.json` and `tracked-after.json` (each) | 259,974 | `dcc086aef2fea3dcac56a373746805d931f96149f1dccce059fd3d9c95f64b69` |
| `source-comparison.json` | 2,828 | `9393fa3ad448212ea0fc50c2f517b08ffdd0aec31e2985053b59d2db85b32194` |
| `stderr.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

I also independently recomputed all sixteen immutable Git-blob hashes in the
four-file, four-source comparison. The production analyzer, calibration solver
and `audio-quality` test are byte-identical across qualified main `77c26f4`,
failed full gate `ded34d2`, failed aggregate selection `f26c247` and this
`fb81960` gate. The current runner test is byte-identical to the failed aggregate
selection; compared with the earlier full gate its only changes are the
previously reviewed diagnostic/message additions. Source changes elsewhere,
selection and execution context differ across those observations.

The original failed full run and failed focused selection remain evidence of
unresolved behavior in their own contexts. This passing first full gate supplies
no failing raw-fit observation, demonstrated numerical mechanism, production
numerical correction or physical calibration evidence. It cannot retroactively
change their results or close issue #72. It establishes the stated current
source's Node outcome; hosted rendering and applicable platform/physical gates
retain their separate scope.

## Remaining gates and handoff boundary

Issues #69/AC-6 and the original #72 numerical evidence remain open within their
existing scopes. The current candidate still needs its own actual hosted
reference/PDF/toolbar rendering and applicable native/platform gates. Physical
audio/MIDI/reference performance, retained raw/reference evidence, pitch
integration and reporting remain separate work. No threshold, qualification
requirement or Fleet default is relaxed by this review.

Root's separately owned inventory/history findings #76/#77 are outside this
frozen source. This lane neither edits those paths nor borrows any future
correction's results. Root owns issue disposition, publication, exact-source
merge proof and any new bounded investigation. All three current workers must
finish before another fresh rotation.
