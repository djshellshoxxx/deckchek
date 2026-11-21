# Fit-field trace and interface corrections — fresh code audit

Reviewer: `/root/fit_code_round3`. Review date: 20 November 2026,
America/Los_Angeles. This worker began after all six workers from the initial
and fresh audio-context rounds completed.

**Disposition: no material static blocker in the toolbar, player-guide or
ledger-preset corrections. Audio qualification remains held.** A passing
focused interface selection cannot settle the earlier numerical failures.
This lane reviews source and retained artifacts only; it runs no application,
test, browser, scanner or extracted numerical implementation.

## Source, scope and review axes

The frozen review source is `eafaa53ade2b626a1817792dbab36a2b95dedd58`,
complete tree `a7ba52d1208efa0818841b46a2c8dc5351e8e967`, on isolated branch
`review/deckchek-fit-code-20261120`. This report is the reviewer's sole changed
file. Root owns product changes and publication; `/root/fit_functional_round3`
is the sole project runtime executor for this round.

The source review covers toolbar/guide commit
`0d87fd3ae41f184d76b340048f2cd52fc8c0dc1d`, preset commit
`1df0d9f29f60eaf7d860b37cd227566b858f38b7`, their implementation notes and
authored regressions. The [toolbar note](NARROW_TOOLBAR_IMPLEMENTATION_2026-11-20.md)
and [preset note](LEDGER_PRESET_IMPLEMENTATION_2026-11-20.md) provide the
specific correction contracts. I also read the three
`AUDIO_NUMERICAL_*_AUDIT_2026-11-20.md` reports and three
`AUDIO_CONTEXT_*_AUDIT_2026-11-20.md` reports and inspected their relevant
source and evidence independently.

| Review axis | Result |
| --- | --- |
| Standards and integration | Changes reuse existing grid, inspector, DOM construction and privacy normalization. No new dependency, capture ownership change, export field expansion, feature default or numerical threshold change appears in the reviewed diff. |
| Specific behavior | Responsive rules address internal toolbar overlap; Player owns its guide on show; preset names must be primitive strings and declared own keys. Authored regressions cover these contracts without asserting hardware or scientific qualification. |

I sent the finding of no material static blocker directly to the functional
reviewer before its one focused patched-source selection. This approves the
bounded observation, not merge or release.

## Toolbar geometry and accessible controls

The retained [original UI observation](evidence/audio-numerical-integration-2026-11-20/pr74-ui-observation.json)
belongs to fixed PR #74. Its mobile screenshots show internal toolbar overlap
despite a passing document-overflow check. They are evidence of the original
layout, not a render of this correction.

In [the stylesheet](../../app/styles.css), the header row becomes content-sized
below 940 pixels. The header and, below 600 pixels, the device group can wrap;
device buttons cannot shrink. At the smaller breakpoint the first field
reserves space beside the refresh button, while rate/calibration and the
action group can occupy later rows. The main content follows the entire
header. These rules fit the existing narrow rail, hidden product name and
nonshrinking action group. Actual font/layout behavior still needs a browser
observation.

[Input and rate selects](../../app/index.html) have explicit accessible names
independent of the short visual labels hidden at the narrow breakpoint.
Necessary controls remain in the DOM. [UI assistance](../../app/ui-assistance.js)
appends Options to the existing action group; it is included in that group's
width and in the geometry checks.

The new [shell layout smoke](../../tools/smoke/shell-layout.mjs) checks all
eight controls in browser and modeled-native contexts at 320, 420, 800 and
1440 pixels. It tests minimum size, bounds, pairwise rectangle intersection,
center-point hit testing, calibration-chip containment, main-content position
and document overflow. It also checks the select names and a long native
input name. The shared resize helper waits for the shell's responsive
inspector transition before measurement. Native mock and dependent input
override are installed in one initialization script. Screenshots are retained
at 420 and 1440. These checks address the observed internal-overlap gap.

This is an authored regression, not evidence that a browser rendered the
patched source. It does not cover every font/zoom state or qualify native
platforms, devices or physical audio. This reviewer did not retry the
previously denied local Chromium launch.

## Player guide ownership and lifecycle

[Player capture](../../app/ui/screens/player-capture.js) replaces inspector
content in `onShow` and first rejects calls after disposal. It calls
`showInspector({ open: false })`; the existing
[shell implementation](../../app/ui/shell.js) updates title/body without
changing whether the panel is open. The screen receives its guide without
opening a closed drawer. Constructed nodes contain static text, not
user-controlled HTML.

The guide describes provisional capture, local reference identity, metadata
export and clearing on screen departure. Escape, Ctrl+E and I correspond to
implemented handlers, subject to the shell's normal modal, overlay and
text-entry handling. Player does not advertise Quick Check's Space capture
or report workflow. The [player smoke](../../tools/smoke/player-capture.mjs)
checks the guide after navigating to the enabled route.

## Preset normalization and compatibility

[Privacy rules](../../app/ledger/privacy.js) use one predicate requiring
`typeof name === 'string'` and an own property of `PRESETS`. `makeRules`,
`normalizeRules` and `matchesPreset` share it. `matchesPreset` rejects a
missing/non-object field map before comparing fields. The primitive-string
check prevents property-key coercion from selecting a preset. This review
covers saved JSON and ordinary UI data; it does not claim arbitrary proxy or
accessor objects as a supported schema.

Public, Insurance and Private definitions remain unchanged. Unknown names
start with all Public fields, while explicit valid serial, field and item
overrides still apply during normalization. `custom` remains a rules label,
not a declared preset definition; `makeRules('custom')` still starts with
Public defaults. The correction neither resets all saved choices nor expands
the export whitelist.

The two new [preset boundary cases](../../tests/ledger-preset-boundary.test.mjs)
check declared and inherited names, invalid types, complete fallback,
missing field maps and continued editing. They preserve Custom and per-item
masking. Existing ledger snapshots cover broader export behavior. No original
exploit reproduction or disclosure claim is part of this review. Issue #75
stays open pending a qualified implementing merge.

## Preserved numerical observations

I independently verified all 29 entries in
[the context evidence manifest](evidence/audio-context-functional-2026-11-20/SHA256SUMS).
Its SHA-256 is
`5e1e952b4494f5ec50ecddc938698f036abf59d2c4c26d8f9edf475c3d027fa5`.
Both complete before/after tracked-file maps are equal: 1,994 paths for the
message-only observation and 2,007 for the aggregate observation.

| Prior invocation | Source identity | Retained result |
| --- | --- | --- |
| Runner file with a result-only assertion message | `5b340667e21c2d7d5bf25ed7116ed1b21cc3acb3`, tree `1e191df434541fbb7c36c84f739a26ac6b979626` | 18/18 pass; no failing assertion context emitted. |
| Original two-file selection with delayed aggregate collector | `f26c247a44a70dd1e19f08ee1bee6dad7fe2f864`, tree `0c24c00e4e3748992371c8d90303859a22f5dd4e` | 33 total / 31 pass / 2 fail; original cubic and retry verdict failed. |

The first [TAP](evidence/audio-context-functional-2026-11-20/runner-message/run.tap)
is 4,592 bytes, SHA-256
`0f06673c12933ab9707110356c3d073cf895ce9adc73a8584a91c5c87ef2ebf7`.
The second [TAP](evidence/audio-context-functional-2026-11-20/two-file-aggregate/run.tap)
is 17,250 bytes, SHA-256
`a0e332853ada66bfb42194b0a7aaabf552df5464c4023d538a9d0cd0787e3802`.
The [aggregate](evidence/audio-context-functional-2026-11-20/two-file-aggregate/contexts.json)
is 144,256 bytes, SHA-256
`872571803365a4bcfbd23ed31c921902d614c248ad34f1ec3ab07e2626521a6a`.

All eight live results among ten completions share post-suite 48 kHz input
identities, each channel containing 675,091 Float32 samples. Left hash:
`851d0bd53a969a6af4b6334256138ebf732496b67192b20919b09a6d7b26bd32`;
right hash:
`488bc6ae51a99511d62a7913aa0f98c49c122fb988e4facae75429614c714f05`.
Full stereo buffers intentionally differ during crosstalk sections. These
delayed hashes are not entry identity or before/after immutability proof.
The two imported-file inputs remain explicitly unobserved.

The reproduced cubic value is `16972224339301138`, versus expected
`4.347826086956522`. The retry records gain -110 dB, balance -220 dB,
left/right response +220/0 dB, polarity 1 and THD 6,935,867,070.3903%.
THD+N rounds to zero with a -151.12 dB companion value, while SNR is 217 dB.
Its immediate assertion result/counters equal the delayed aggregate; these
derived values existed at assertion time. No solver, mutation, engine or
scheduling cause is established.

## Fit-read boundary review

[The analyzer](../../app/audio-quality.js) immediately caches fundamental
amplitude in `toneRms`, used by THD+N and SNR. It later rereads the fit for
THD after harmonic fits, gain after low/high fits, the low-tone finding,
response reference and hum. This order makes intermediate observations
informative. [The fit implementation](../../app/calibration.js) constructs a
local normal-equation system, copies it into its solver and returns a new
object. No explicit mutating alias is established. The dropout helper reads
fit fields without assigning them.

A useful trace preserves original fixtures/assertions, hashes real entry
buffers/slices and snapshots immutable fit scalar representations at these
boundaries. Separate identity bookkeeping must not write properties to fit
objects. Retaining only references would repeat the prior limitation.
Instrumentation changes allocation, timing and execution context; a passing
instrumented observation would not demonstrate a product repair.

## Current-round focused result

The functional reviewer ran the six actual player-screen, reference-file,
preset-boundary, ledger, ledger-UI and feature files once at frozen `eafaa53`.
The result is **82 total / 82 pass / 0 fail / 0 skip**, exit 0, with empty
stderr. I independently read its metadata, checked all 2,036 before/after
hash-map entries for equality and derived the counts from retained stdout.
Its format is Node's **spec reporter**, although the existing driver named
the raw file `run.tap`; the original bytes were preserved. The
[raw output](evidence/fit-and-ui-functional-2026-11-20/focused/run.tap) is
8,257 bytes, SHA-256
`e3c49de363d42265d611ecb3f87007524f942829f397ceb8b58817979ad22f5b`.

Separate syntax checks for both smoke files exited 0, with empty streams and
unchanged 2,036-path maps. They parse authored browser checks; they do not
render the responsive layout. I also verified the later recorder and
instrumented-copy syntax records, each exit 0 with unchanged 2,039-path source
maps. This lane performed none of those executions.

## Exact disposable trace review

I approved the specific [one-run plan](evidence/fit-and-ui-functional-2026-11-20/trace-plan.md)
after reviewing the preparation tool, recorder, execution driver and generated
patch. The tool-only source commit is
`f3a8a5d551d35941d3258feb34f6b2dd1bba1e3f`, tree
`78c92aad0b1e26755d1e11e4ff1c2c0bd25bf9e8`. Its committed delta from `eafaa53`
contains only three diagnostic tools. Product/test files remain byte-identical.

Preparation materializes a separate committed-tree copy, checks committed
blob identities and adds 13 lines to that copy's analyzer. I independently
verified all 2,039 current source and prepared-copy hashes against the maps.
Only disposable `app/audio-quality.js` differs; reversing the 13 additions
reproduces the original bytes. Original fundamental/`fitAt` calls, harmonic
loop, arithmetic, relative order of original reads, assertions and thresholds
remain. No additional analysis or fitting call appears.

| Reviewed artifact | SHA-256 |
| --- | --- |
| Preparation tool | `85609f6778b1a38344ee20b0e6220f2bbd61bdfb70973f2c44f54a97749cac68` |
| Recorder | `2414c9d8692de394ef60e7390d14a79d1e6ee204e4ae80486c6c0028ca278adc` |
| Execution driver | `4daee499847e5b8c73971f5502076f1f5289ecc8e0741570bc1114fcc2c1c044` |
| Original analyzer | `4f4ed3df91d6b923f4fe7edaede0fbe2b4b3c300c0fc97d07dbfe7d510225db6` |
| Instrumented analyzer | `39e991b51ea11f3c63b3d7b4a4630f4900568703d8ca3b9cdb9069d404c51af8` |

The [patch](evidence/fit-and-ui-functional-2026-11-20/preparation/audio-quality.patch)
and [preparation metadata](evidence/fit-and-ui-functional-2026-11-20/preparation/preparation.json)
bind those identities. Input observation starts after the original
shape/rate/finite guards. Full capture hashes are taken there and at successful
return; actual tone-slice byte ranges/hashes are taken at channel stages.
Earlier rejected inputs have no records; later early returns can have an entry
record only. Low/high input slices are not claimed as observed.

Fit fields are copied as decimal strings and binary64 big-endian hex,
including signed zero and nonfinite representations. Every event is serialized
before its helper returns. WeakMap identities are local to a child/test file
and add no properties to fits. Retained event strings cannot change with the
original objects. Scalar reads precede slice hashing, so observations are
sequential, not atomic. Exclusive test-file/PID outputs are bounded to 8,192
records or 8 MiB of record strings per child, with drops, truncation and errors
explicit. No waveform samples are written.

The driver permits one original two-file Node v24.22.3 invocation in the
disposable copy, within 180 seconds. `NODE_OPTIONS` is absent. The driver adds
no diagnostic optimization/engine switches; actual child `execArgv` contains
expanded Node settings and is retained in each header. No cause is assigned
to those settings. Imports, extra reads, object escape, WeakMap bookkeeping,
synchronous hashes, retained strings and the delayed aggregate collector
change execution context. This approves observation, not equivalence to an
uninstrumented run.

## Single trace outcome

After code/security review and root concurrence, the functional worker ran
the reviewed two-file selection once: **33 total / 33 pass / 0 fail / 0 skip**,
exit 0, in 9.777194443999178 seconds, without timeout or stderr. Both full source
and copy before/after maps contain 2,039 entries and compare equal; the copy
inventory is unchanged. I independently compared the maps and recomputed the
following artifact hashes.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Complete TAP](evidence/fit-and-ui-functional-2026-11-20/trace/run.tap) | 7,833 | `a2350ad1206ed2e12ae676d74db0257714db5bea563d8f2896e0005c99ce355a` |
| [Completed-result aggregate](evidence/fit-and-ui-functional-2026-11-20/trace/contexts.json) | 142,590 | `a4367b57c241becb4e582be0b8d8f09562170010c41c655d3bbebf9c73d798da` |
| [Audio-quality trace](evidence/fit-and-ui-functional-2026-11-20/trace/traces/audio-quality.test.mjs.26.json) | 711,610 | `42f9abfad5942a9e3a61bf2437fd4f0fbb4db9a7c5a423eef918cde8120b84ac` |
| [Runner trace](evidence/fit-and-ui-functional-2026-11-20/trace/traces/audio-runner-lifecycle.test.mjs.34.json) | 375,730 | `4d85b6c29dc9a62e6a9d3c0804bf2ac116054d2b4b4cb2dcde24037e36ace47f` |

The audio-quality child has 346 records from 23 validated entries, including
19 complete analyses. The runner has 181 records from 11 entries, including
10 complete analyses. Neither reports truncation, dropped records or collector
errors. Five entry-only analyses are compatible with the original early-return
guards and are not labeled complete.

Across both files, I compared all **580 fundamental-fit snapshots**: 58
channel/analysis groups, ten observations each. Each group's four fit fields
and object ID stay identical. Fundamental IDs are distinct between groups
within a process; observed low/high fit IDs also differ from their fundamental
and each other. All **348 tone-slice observations** retain their group's hash,
byte range, view identity and backing-buffer identity. Each slice's backing ID
matches its corresponding entry buffer. All 29 complete analyses have matching
full input records at entry and return. These are observations at particular
times in this passing instrumented run, not continuous immutability proof for
an earlier failure.

The third analysis in the audio-quality file is the original positive-cubic
fixture: both amplitudes are `0.11499999804310879` and raw THD is
`4.347825755868567%`, with the expected rounded measurement `4.3478%`.
The third runner analysis aligns with the original retry's ordered fixture
calls and aggregate sequence 3. It has distinct left/right fit IDs 36/40,
both amplitudes `0.09999999824731663`, cached tone RMS
`0.07071067687932045`, zero balance/response deviation and polarity 0.
Both tone slices contain 91,200 samples / 364,800 bytes and share SHA-256
`fb55a6e818eae817a75fc6f186b2edefe7528947b7c1ffab8bb4c7a5d74497c1`.
The aggregate preserves two capture starts, one playback, one save and a
passing retry. The collector does not itself label entries with test-case
titles; this association uses preserved source order and separate lifecycle
evidence. Intentionally bad fixtures retain expected failures/unknown outcomes;
33 passing test cases do not mean all fixture measurements describe clean audio.

## Disposition and successor handoff

Code review of the interface/preset corrections and exact diagnostic is
complete. No material static correction is requested. The focused result
supports the patched contracts; actual hosted responsive rendering remains
a separate gate.

Neither numerical failure reproduced in this trace. Stable fields and
identities in a passing instrumented execution do not refute the original
failure, identify its cause or establish a repaired product. No numerical
product patch follows from this observation. A successor still needs evidence
distinguishing bad inputs, an incorrect fundamental result and a later
inconsistent read in an execution that actually fails. This report authorizes
no additional full suite, identical numerical rerun, engine-flag comparison or
speculative solver change. The functional reviewer owns the one execution and
its retained evidence; this reviewer changed only this report.

Issue #72 and the complete reference/PDF qualification hold remain unresolved.
Issue #69/AC-6, fixed PR #74 and Fleet identities, default-off features,
permissions, capture ownership, privacy limits and thresholds retain their
existing boundaries. Root coordinates this trio's completion and any further
fresh review.
