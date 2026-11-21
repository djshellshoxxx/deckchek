# Fit tracing and UI successors — fresh defensive source audit

Reviewer: `/root/fit_security_round3`. Review date: 20 November 2026,
America/Los_Angeles; retained execution records use UTC on 21 November. This
fresh trio began after all six workers in the preceding two audio rounds had
completed.

## Disposition

The ledger preset correction and toolbar/player-guide changes have no identified
defensive blocker in the reviewed source. The preset correction consistently
admits only declared, own primitive-string names while retaining explicit valid
privacy overrides. The guide is static DOM text and changes neither capture
ownership nor export scope. This is a source-review conclusion; responsive
rendering and numerical qualification require their own evidence.

The frozen disposable fit-trace plan also has no identified defensive blocker.
Its single source-bound run passed **33/33 test cases** and captured stable
passing fit/input observations. It did not capture either original failure.
The original numerical failures and qualification hold remain unresolved; no
audio cause, production numerical repair or security incident is established.

## Scope, ownership and immutable sources

This lane performs static defensive source review and reads/hashes retained
artifacts. It executes no application, project test, browser, native component,
extracted numerical implementation, scanner, probe or vulnerability reproduction.
The sole authored file is this report. `/root/fit_functional_round3` owns the
authorized local runtime observations; root owns any production correction.

| Reviewed source | Commit | Complete tree |
| --- | --- | --- |
| Fresh consolidated base | `eafaa53ade2b626a1817792dbab36a2b95dedd58` | `a7ba52d1208efa0818841b46a2c8dc5351e8e967` |
| Toolbar and player guide | `0d87fd3ae41f184d76b340048f2cd52fc8c0dc1d` | `fd57b1656b8fb5c1842043338b49a91be6b88f41` |
| Ledger preset correction | `1df0d9f29f60eaf7d860b37cd227566b858f38b7` | `e50f14a8ebaa0a826193f25d7b45254bf6e5e489` |

The isolated review branch is `review/deckchek-fit-security-20261120`. Its base
was clean before this report. Relative to the prior completed audio integration
`8dbef3a91f4d88d01ec5a570265258443fd7f3cc`, the only production files changed are
`app/index.html`, `app/styles.css`, `app/ui/screens/player-capture.js` and
`app/ledger/privacy.js`. The comparison contains no native-source or CI-workflow
change. The reviewed successors introduce no feature-flag, permission,
capture-retention or scientific-threshold changes.

## Ledger preset boundary — issue 75

The [privacy module](../../app/ledger/privacy.js) now centralizes preset membership
in `isPreset`: the input must be a primitive string and an own property of
`PRESETS`. This predicate is used by all three affected functions:

- `makeRules` selects only the declared Public, Insurance and Private preset
  definitions; an unrecognized name starts with Public defaults.
- `normalizeRules` admits a declared preset label or the literal Custom label.
  It retains the existing handling of valid serial modes, boolean field toggles,
  bounded per-item overrides and normalized owner text.
- `matchesPreset` rejects undeclared names and missing/nonobject field maps before
  accessing a preset definition.

The primitive-string check also avoids coercing an array or object into a preset
property key. Own-property membership prevents inherited property names from
being treated as declared preset definitions. The review did not execute the
previous implementation or construct an exploit.

Public, Insurance and Private definitions are unchanged. Custom remains an
editable rules label rather than an additional preset definition:
`makeRules('custom')` starts from Public, while `normalizeRules` preserves an
explicit Custom label and valid overrides. An invalid preset label also starts
from Public and then applies explicit valid choices. The correction therefore
does not silently discard a user's selected privacy fields or misrepresent
Public fallback as a forced reset of every override.

The actual consumers retain their normalization boundary. The
[ledger screen](../../app/ui/screens/ledger.js) normalizes stored privacy rules
when restoring the latest export. Its subsequent build/key paths normalize the
current rules. [Ledger construction](../../app/ledger/build.js) first narrows
per-item overrides to the selected item IDs, normalizes the rules, and passes
them through the existing field allowlist. The correction does not add a new
export field, change certificate inclusion, alter serial masking, weaken path
scrubbing or remove the existing override limits.

The authored [preset regressions](../../tests/ledger-preset-boundary.test.mjs)
cover declared presets, unknown and nonstring inputs, inherited names, missing
field maps, saved-rule normalization, subsequent field edits, Custom serial
masking and per-item privacy choices. They target the corrected contract. This
lane inspected those assertions without running them.

**Finding classification:** issue 75 remains a source-derived correctness and
fail-closed-validation finding. The inspected correction addresses the stated
membership defect; the evidence does not establish a disclosure, prototype
pollution, exploitation or an incident. Issue closure and functional acceptance
belong to root after the relevant source-bound checks.

The [implementation note](LEDGER_PRESET_IMPLEMENTATION_2026-11-20.md) correctly
distinguishes unchanged preset defaults from retained explicit overrides. No
defensive correction is requested in this scoped review.

## Toolbar and player guide

The [toolbar changes](../../app/styles.css) permit the top row and device fields
to wrap at the documented width thresholds; the first grid row can grow with its
contents. Buttons do not shrink, and the narrowest layout gives the input-device
field a full row beside its refresh button. The
[HTML labels](../../app/index.html) explicitly name the input-device and sample-rate
controls. These changes do not introduce data access, an external request, a new
native command or a product permission.

The authored [shell smoke](../../tools/smoke/shell-layout.mjs) inspects all eight
header controls at 320, 420, 800 and 1,440 CSS pixels in browser and modeled-native
contexts. Its assertions check presence, control size, header bounds, overlaps,
center hit targets, input-chip containment, main-content placement and document
overflow. The native path uses the existing command mock and a synthetic long
device label. Its native mock and override are deliberately installed together,
avoiding an initialization-order assumption. These assertions describe intended
coverage; syntax checks alone cannot establish their rendering result or qualify
real hardware.

The [player screen](../../app/ui/screens/player-capture.js) now replaces the old
workflow's inspector content with a Player capture guide when the screen becomes
visible. It passes a constructed DOM node to `showInspector` with `open: false`.
All guide content uses the DOM helper's `text` properties, which assign
`textContent`. No user data or HTML string enters this new content. The
[shell implementation](../../app/ui/shell.js) appends the supplied node; the guide
does not select the string-to-HTML branch. `open: false` preserves the inspector's
existing open state and does not open a closed panel.

The guide accurately keeps the current boundaries visible: capture details are
provisional, and a selected-file hash identifies bytes without verifying content
or playback. The JSON export contains acquisition, result and selected-reference
metadata, including potentially identifying file/device names and messages. The
export still consists of the existing
`acquisition`, `record` and `selectedReference` metadata selection. The change
does not add waveform bytes, automatic history storage, a PDF report or
telemetry. Its shortcut instructions match the screen's existing Escape,
Control-E and inspector behavior.

Capture ownership, active-request and visibility checks, reference-read
cancellation, hide/dispose behavior and file-picker cleanup are unchanged.
Reference cancellation invalidates a selection; an already-started local file
read can still settle later under the existing guard. The static guide is not a
new promise of physical erasure. The changes also leave default-off state and
capture/retention controls untouched.

The [implementation note](NARROW_TOOLBAR_IMPLEMENTATION_2026-11-20.md) and authored
player smoke correctly separate the new guide/layout checks from prior UI
evidence. No source-level defensive blocker was found. This review does not
claim that a new responsive browser run occurred.

## Focused patched-source observations

The sole functional executor retained three checks at the reviewed `eafaa53a`
commit/tree, on Node v24.22.3 with `NODE_OPTIONS` absent:

| Functional observation | Recorded outcome | Elapsed seconds |
| --- | --- | ---: |
| Player screen/reference, ledger preset/core/UI and feature defaults; six files | 82 total / 82 pass / 0 fail / 0 skip, exit 0 | 1.589108920 |
| `node --check tools/smoke/shell-layout.mjs` | Exit 0, empty stdout and stderr | 0.129285832 |
| `node --check tools/smoke/player-capture.mjs` | Exit 0, empty stdout and stderr | 0.128844932 |

I independently read the complete focused output and the three metadata records,
hashed their retained bytes, and compared every before/after inventory. All
three pairs of **2,036** tracked-file hashes match. The retained metadata records
clean state and unchanged exact HEAD/tree for each check; no timeout occurred.

The [focused stdout](evidence/fit-and-ui-functional-2026-11-20/focused/run.tap)
is **8,257 bytes**, SHA-256
`e3c49de363d42265d611ecb3f87007524f942829f397ceb8b58817979ad22f5b`.
Although the recorder names it `run.tap`, its bytes are Node's spec-reporter
format. Its final summary explicitly states 82 tests and 82 passes. The recorder's
TAP-only parser left `tap_counts` empty; that does not erase the preserved
summary or justify a rerun. I sent this labeling clarification to the functional
worker. The original bytes are the evidence.

These tests include the two new preset cases, the existing preset/privacy
snapshots, player cancellation/visibility/metadata contracts, selected-reference
boundaries and default-off feature checks. They do not replace the new guide's
browser assertion or responsive layout observation. The smoke invocations only
parse the two files; they launch no browser and report no rendering result.

## Earlier numerical evidence preserved

I read the preceding [context code](AUDIO_CONTEXT_CODE_AUDIT_2026-11-20.md),
[functional](AUDIO_CONTEXT_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](AUDIO_CONTEXT_SECURITY_AUDIT_2026-11-20.md) handoffs. I independently
checked all **19** entries of the first audio functional `SHA256SUMS` and all
**29** entries of the subsequent context functional `SHA256SUMS`; all matched
their retained bytes. These checks read artifacts and did not execute project
code.

The context observation at commit
`f26c247a44a70dd1e19f08ee1bee6dad7fe2f864`, complete tree
`0c24c00e4e3748992371c8d90303859a22f5dd4e`, remains **33 total / 31 pass / 2 fail**.
It captured both the original cubic THD failure and the retry's balance,
response and polarity failures. Its raw TAP has SHA-256
`a0e332853ada66bfb42194b0a7aaabf552df5464c4023d538a9d0cd0787e3802`;
its aggregate JSON has SHA-256
`872571803365a4bcfbd23ed31c921902d614c248ad34f1ec3ab07e2626521a6a`.

The retained retry reports gain −110 dB, balance −220 dB, response L +220 dB/R
0 dB at every response point, polarity 1 and THD about 6.94 billion percent,
while THD+N is near zero and SNR is 217 dB. Its finish payload, immediate failure
message and retained aggregate agree. This identifies what the failing result
contained; it does not recover the earlier raw fits or identify why they differed
from the passing cases.

Equal hashes from final serialization describe the retained buffers at that
later observation point. They do not establish equality at analyzer entry or
exclude mutation between unobserved points. The preceding harness also retained
references longer and changed allocation/timing context. Neither these facts nor
the varying run outcomes establish an engine, aliasing, mutation, solver or
environmental cause. The next trace must preserve these distinctions.

## Disposable fit-trace source review

I reviewed the complete preparation, recorder and execution-driver sources, the
frozen plan, generated patch, source copies and all preparation maps before the
audio invocation. The tool-only descendant is
`f3a8a5d551d35941d3258feb34f6b2dd1bba1e3f`, complete tree
`78c92aad0b1e26755d1e11e4ff1c2c0bd25bf9e8`. Its only changes from the fresh base
are the three tools under `tools/diagnostics`; committed production, tests and
smoke files remain unchanged.

| Reviewed bytes | SHA-256 |
| --- | --- |
| Original analyzer | `4f4ed3df91d6b923f4fe7edaede0fbe2b4b3c300c0fc97d07dbfe7d510225db6` |
| Instrumented disposable analyzer | `39e991b51ea11f3c63b3d7b4a4630f4900568703d8ca3b9cdb9069d404c51af8` |
| Exact additive patch | `efa78b2a673b33a3c194a035461f7af43cd5738e6de4c7a1adbeb1730853d7e8` |
| Preparation tool | `85609f6778b1a38344ee20b0e6220f2bbd61bdfb70973f2c44f54a97749cac68` |
| Recorder | `2414c9d8692de394ef60e7390d14a79d1e6ee204e4ae80486c6c0028ca278adc` |
| Execution driver | `4daee499847e5b8c73971f5502076f1f5289ecc8e0741570bc1114fcc2c1c044` |

The [preparation tool](../../tools/diagnostics/audio-fit-prepare.py) materializes
the committed tree in an external disposable directory, validates archive paths
and regular-file types, and compares extracted content with Git blob identities.
It then adds one import and twelve observation calls to that copy's
`app/audio-quality.js`. I independently checked the source/copy bytes against
all **2,039** mapped paths, compared the recorded tree entries with the frozen
Git tree, verified the clean source state and confirmed that only the copied
analyzer differs. Removing the thirteen exact additions reconstructs the
original analyzer bytes. Existing expressions, arithmetic, helper-call order,
assertions, thresholds and skips remain in place.

The [recorder](../../tools/diagnostics/audio-fit-recorder.mjs) observes the actual
validated capture after the original shape/rate/finite-value guards. It hashes
the exact typed-array view using its backing buffer, byte offset and byte length.
For each channel, it also observes the actual tone slice before the fundamental
fit, immediately after return, after cached tone RMS/initial THD+N, after the
harmonic loop, after low/high fits and after channel metrics. Later observations
reread the fundamental fits after both channels, the response reference,
response/crosstalk, the hum calculation and successful return. The return also
records existing output values and full input hashes again.

Fit fields and selected scalar values are copied to fresh records and immediately
serialized into strings. Number representations include decimal strings and
binary64 big-endian bytes, including signed zero and nonfinite values. Later
changes to a fit or result object cannot rewrite an already-retained string.
Object/backing-buffer identities use a WeakMap; no property is added to an
original object, and no input or fit is frozen, mutated or replaced. The helper
imports no audio module and adds no fit or analyzer call.

Only selected scalar fields, identifiers, input lengths/ranges/types and hashes
are exported. The recorder retains no waveform samples or strong fit references
in its event list. It writes one sanitized test-file/PID name per process to the
explicit absolute diagnostic directory, with exclusive creation and mode 0600.
The driver creates that directory with mode 0700. Retained record strings are
capped at 8,192 records and 8 MiB per child, with explicit dropped/truncated/error
fields; the small header is additional. There is no network operation, product
telemetry, real-device capture, or new product export path.

The [execution driver](../../tools/diagnostics/audio-fit-run.py) checks positive
code/security review records against the exact transformed analyzer and tool
hashes, revalidates source/copy identities and inventory, then invokes only the
original two audio test files on the absolute Node v24.22.3 executable. It uses
serial test execution and TAP output; `NODE_OPTIONS` and inherited diagnostic
variables must be absent. The reviewed budget is one invocation with termination
at 175 seconds and a 180-second total termination budget. The first outcome is
preserved alongside source/copy maps, raw streams, traces and the existing
finish aggregate. There is no browser attempt, full-suite run, engine-flag
experiment or automatic rerun in this plan.

**Limits are explicit.** Entry observations begin after validation; earlier
rejections have no record, and later early returns can leave entry-only records.
Fit reads precede slice hashing and are sequential, not an atomic snapshot.
Hashes identify observed bytes, not continuous immutability between observations.
Low/high fit fields are observed after their calls; their input slices are not
hashed. IDs are process-local and cannot be compared across the two test-file
children. Imports, extra reads, synchronous hashing, object escape, allocations
and retained strings change execution context. The separate finish aggregate
still retains references and keeps its delayed-hash limitations. A pass or
different failure under this instrumentation cannot qualify untouched production
or establish an engine, solver, mutation or aliasing cause.

I sent an exact-hash **source-plan GO** to the functional executor and root before
the audio invocation. That approval covered the bounded observation design;
it did not qualify a numerical result or a production release.

The functional worker also retained separate `node --check` results for the
recorder and disposable analyzer. I read both records: exit 0, empty streams,
no timeout, clean frozen source and equal **2,039**-entry before/after maps.
Those parser checks neither import the modules nor constitute an audio run.

## Source-bound fit-trace observation

The functional worker executed the reviewed selection once after both static
reviews and root's coordination. The instrumented disposable copy returned
**33 total / 33 pass / 0 fail / 0 skip**, exit 0, in **9.777194444 seconds**, with
no timeout and empty stderr. I read the complete TAP and metadata and independently
hashed the retained artifacts below. The execution record binds the observation
to frozen source `f3a8a5d5`, its complete tree and the exact transformed analyzer
hash above; this is not an unchanged-production rerun.

| Independently read and hashed artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Complete first TAP](evidence/fit-and-ui-functional-2026-11-20/trace/run.tap) | 7,833 | `a2350ad1206ed2e12ae676d74db0257714db5bea563d8f2896e0005c99ce355a` |
| [Execution record](evidence/fit-and-ui-functional-2026-11-20/trace/result.json) | 4,548 | `e79929dfe8a532880af4e8b7178245ddbf97d7107bf29490311a5572c24fbe6b` |
| [Quality-file trace](evidence/fit-and-ui-functional-2026-11-20/trace/traces/audio-quality.test.mjs.26.json) | 711,610 | `42f9abfad5942a9e3a61bf2437fd4f0fbb4db9a7c5a423eef918cde8120b84ac` |
| [Runner-file trace](evidence/fit-and-ui-functional-2026-11-20/trace/traces/audio-runner-lifecycle.test.mjs.34.json) | 375,730 | `4d85b6c29dc9a62e6a9d3c0804bf2ac116054d2b4b4cb2dcde24037e36ace47f` |
| [Separate finish aggregate](evidence/fit-and-ui-functional-2026-11-20/trace/contexts.json) | 142,590 | `a4367b57c241becb4e582be0b8d8f09562170010c41c655d3bbebf9c73d798da` |

Both complete source before/after maps and both complete disposable-copy maps
contain **2,039** equal entries. The recorded copy inventory stayed unchanged,
with no extra files; source HEAD/tree and clean state stayed unchanged. The
parent invocation is exactly the reviewed command and `NODE_OPTIONS` is absent.
Both child trace headers retain expanded Node runtime `execArgv` settings in
addition to the parent invocation record. An empty or universally flag-free child
argument list is not claimed. Their presence does not establish a diagnostic
engine-flag change or a runtime cause.

The two children contain **527** sequential records in total. I parsed every
record and independently checked exact phase order, record counts and all
fundamental-fit/input comparisons:

| Trace population | Quality-file child | Runner-file child |
| --- | ---: | ---: |
| Validated-entry observations | 23 | 11 |
| Completed analyses with return observations | 19 | 10 |
| Entry-only observations | 4 | 1 |
| Total records | 346 | 181 |
| Truncation, dropped records or observer errors | None | None |

For all **29** completed analyses, the full input identity/range/hash records at
validated entry equal those at return. All **348** per-channel tone-slice
observations match within their own analysis/channel and reference the observed
entry backing buffer. The **580** fundamental-fit snapshots across **58**
analysis/channel groups retain the same object identity and all four scalar
representations across five channel stages and five later readouts. These are
equalities at observed points, not continuous-immutability or atomicity claims.
The five entry-only records are consistent with original early-return paths;
they are not missing completed outputs caused by trace truncation.

Source call order identifies quality analysis 3 as the first cubic call and
runner analysis 3 as the failed-start/retry case. Both L/R fits in each of those
analyses remain equal in their scalar fields across the inspected stages:

| Observed field | First cubic call | Retry call |
| --- | ---: | ---: |
| Fundamental amplitude | 0.11499999804310879 | 0.09999999824731663 |
| Residual RMS | 0.0035355335765397977 | 1.964967478271577e-9 |
| Cached tone RMS | 0.08131727845272191 | 0.07071067687932045 |
| Initial unrounded THD+N, percent | 4.347825755869789 | 0.0000027788837060987574 |
| Final rounded THD, percent | 4.3478 | 0 |

The retry's aggregate now passes, with zero gain, balance, response flatness and
inverted-polarity flag; THD and THD+N round to zero, THD+N dB is −151.12, and SNR
is 217 dB. Its tone slice is 91,200 Float32 samples, 364,800 bytes, SHA-256
`fb55a6e818eae817a75fc6f186b2edefe7528947b7c1ffab8bb4c7a5d74497c1`
for both channels at each observed stage. Its full input hashes at this run's
validated entry and return equal the earlier aggregate's delayed hashes. That
comparison does not retroactively establish input identity at the earlier failed
run's analyzer entry.

The separate finish aggregate has ten payloads: eight passes, one deliberate
incomplete live capture with status unknown, and one deliberate stereo-response
file failure. The live fault retains its overrun/device-error integrity reasons.
Both file results retain unobserved original continuity, and the old live-fixture
hook still correctly records their input identity as unavailable. New analyzer
input observations do not convert an imported file into observed capture
continuity or qualify physical hardware.

**Result:** this observation adds stable passing snapshots at the requested
boundaries. Neither a changing fit nor a failing raw fit was observed. Added
instrumentation changes execution context, so the pass does not identify the
cause of the original enormous THD or retry verdict, establish a production
repair, or clear the full-suite qualification hold. No additional audio
invocation is part of this review.

## Qualification boundaries

Issues **69, 72 and 75** remain open at this review checkpoint. The original
failed full suites and all first diagnostic outcomes remain part of the record;
a smaller passing selection cannot clear them. No numerical threshold,
assertion, physical acceptance criterion or AC-6 requirement is relaxed.

The fixed Fleet diagnostic and PR-74 heads remain unchanged. Previously retained
PR-74 browser/modeled-native evidence belongs to its original source and does not
qualify the new toolbar CSS or physical hardware. This review issues no CI
dispatch, remote push, merge, release or production approval. Default-off
behavior, unverified acquisition semantics and scientific/physical limits remain.

## Completed handoff

The scoped UI/preset review, frozen trace-plan review and independent retained-data
review are complete. No additional defensive production correction is supported
by these observations. Root owns integration, issue decisions, current CI proof
and any further bounded investigation. All current workers must complete before
the next fresh handoff. This audit changes only this report and executes no
project code.
