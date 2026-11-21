# Reference-file identity and PDF axes — fresh functional acceptance

Reviewer/executor: `/root/reference_functional_fresh`. Review date:
20 November 2026, America/Los_Angeles. This independent round began after all
three initial reference/PDF workers completed.

## Disposition

**The combined full-suite gate failed. Acceptance is held pending separate
audio diagnosis.** The first and only complete serial invocation recorded
**2,357 total / 2,354 pass / 2 fail / 1 optional skip**, Node exit 1. The original cubic THD failure recurred, and an existing audio-runner
retry case returned an unexpected measurement verdict. Both complete failures
are retained. No narrow rerun, source patch, relaxed assertion or extra skip
was performed in this acceptance turn.

All 132 case names from the initial focused reference/PDF selection are present
among this full run's passing cases. I found no additional blocker in the
inspected reference/PDF contracts, but that narrower observation does not turn
the failed complete run into an overall passing qualification.

## Exact source and execution

| Role | Commit | Tree |
| --- | --- | --- |
| Fresh combined freeze | `ded34d2dccfcf0ae51c78fa1492a57c161d32a1d` | `9030b4d9eeb307f27c0d794dccf4a37895c2a602` |
| Durable exact-tree equivalent | `b8bf6ea10791b05a2188d176ae8b996528a10f08` | Same complete tree |
| Corrected production | `447019568d6a0cc0ce0fe16412e9ac99c204f604` | `81807e58e03c6dd51740ef469e2c2450b20d5784` |
| Maintained tests and smokes | `dd11f41dc41e102ddd8bf7f34e87153afa994f59` | `d6272a78da9791fc40cb0cdeff238cb68d979c5f` |

I independently compared the durable object locally: its entire tree matches
the fresh freeze and its ordered parents are published #74 head `78403038` and
original PDF candidate `5cc916ee`. Root owns remote publication/readback.
Production paths match `4470195`; tests/tools match `dd11f41` byte-for-byte.

The actual runtime was **Node v24.22.3**, Linux x64, executable
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`.
The [complete metadata](evidence/player-reference-acceptance-2026-11-20/full-suite.json)
records all arguments, versions and host information. The selection was all
**192** regular top-level `tests/*.test.mjs` files, discovered and lexically
sorted, with `--test-concurrency=1 --test-reporter=tap`.

| Runtime observation | Recorded value |
| --- | --- |
| Result | 2,357 total / 2,354 pass / 2 fail / 1 optional skip |
| Node exit / timeout | 1 / false |
| Cancellation / TODO | 0 / 0 |
| Start UTC | `2026-11-21T07:02:22.919389+00:00` |
| End UTC | `2026-11-21T07:08:38.507830+00:00` |
| Elapsed seconds | 375.588414659 |
| Tracked files | 1,943, equal before/after and bound to immutable Git blobs |
| Checkout | Clean before/after; exact HEAD/tree unchanged |
| Complete TAP bytes | 541,141 |
| Complete TAP SHA-256 | `29ef19e0e0916e94e4c1ce0b27be3805f173375686cd522cf9aa8db11a77dec4` |

The sole optional skip is the existing Mixxx controller corpus because its
directory is unset. No browser, native build, package installation, scanner,
probe or exploit was executed. The functional lane was the sole project runtime
executor; source checks, hashing and retained-output reading were separate.

## Preserved failures

| Existing case | Actual failure | What this establishes |
| --- | --- | --- |
| `tests/audio-quality.test.mjs`, cubic nonlinearity | `16972224339301138 vs 4.347826086956522`, assertion at line 80 | The same unexpected THD value as original issue #72 recurred on this frozen source. Cause remains unestablished. |
| `tests/audio-runner-lifecycle.test.mjs`, failed-start then retry | Expected `pass`, received `fail`; `3 of 9 checks failed: balance, response, polarity.`, assertion at line 181 | The preceding case assertions reached one playback and one saved retry. The failure is the returned measurement verdict; it does not by itself establish an ownership failure or a common cause with the cubic case. |

The two audio implementation paths and two test files are byte-identical to
both the original failing `6f414a4` freeze and prior passing `f081881` freeze.
This source equality does not identify the fault or prove an environment cause.
The original 530,581-byte failed TAP retains SHA-256
`39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197`.
Later successes and this recurrence remain separate observations. The earlier
33-test diagnostic did not establish original predecessor execution order.

## Independent contract and test review

I read the [initial handoff](PLAYER_REFERENCE_INITIAL_HANDOFF_2026-11-20.md),
the initial [code](PLAYER_REFERENCE_CODE_AUDIT_2026-11-20.md),
[functional](PLAYER_REFERENCE_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](PLAYER_REFERENCE_SECURITY_AUDIT_2026-11-20.md) reports, then inspected
the actual helper, screen, relevant acquisition/record boundaries, PDF routines
and maintained Node/browser assertions.

The [reference helper](../../app/player/reference-file.js) hashes exact selected
bytes with the existing SHA implementation, checks a nonempty safe size up to
32 MiB and actual read length, snapshots name/size, checks cancellation around
asynchronous work and returns frozen primitive metadata only. Ten maintained
cases cover known/independent digests, changed bytes, the exact bound, read
failures, cancellation and snapshots. Their ordinary identity fixtures do not
establish audio content or playback validity.

The [actual screen](../../app/ui/screens/player-capture.js) clears every picker
delivery before refusing inactive/busy work. A single request owner prevents
another accepted read or capture until settlement. Identity/abort/visibility
guards reject late results, and reference changes discard prior capture details.
Capture snapshots the selected descriptor and passes the same digest into the
record; local JSON contains metadata and explicit null without a file. Records
remain unverified, report-ineligible and measurement-free. Thirty maintained
screen cases include default File/helper behavior plus deterministic delayed
providers, real shell navigation/feature disablement and modeled DOM/native I/O.
The modeled input-value reset is not real browser FileList or layout evidence.

The [PDF helper](../../app/report-pdf.js) now rejects nonfinite/nonpositive rounded
span before projection, in addition to the prepared candidate's earlier checks.
Both rounded X/Y overflow cases reach the existing visible escaped unavailable
placeholder, while normal, representable tiny and large ranges keep finite SVG
in the maintained cases. Pre-existing high-offset tick coalescence is a distinct
limitation, not a numerical-accuracy guarantee established by this correction.

The [player smoke](../../tools/smoke/player-capture.mjs) authors real browser File
selection and metadata download assertions. The [PDF smoke](../../tools/smoke/pdf.mjs)
authors visible/readable print placeholders beside an ordinary chart and future
PNG/PDF artifacts. Its composer uses the print CSS already loaded in the same
page/module context. Neither smoke was executed here. Their initial `node
--check` outputs are syntax-only evidence; no screenshot or print artifact exists
from this lane, and the known pre-page Chromium socket restriction was not retried.

## Evidence integrity and handoff

The [static verifier](evidence/player-reference-acceptance-2026-11-20/verify-evidence.py)
imports no app/test. It checks the fresh before/after maps against the exact Git
inventory and immutable blob bytes, complete TAP size/hash/counts, source/tree,
test discovery and driver digest. The **1,943** paths resolve to **1,833** distinct verified Git blobs.
It also verifies all **24** initial artifact digests and their separately bound
28/28, 132/132 and two empty syntax outputs, without reexecuting them or repeating
unrelated historical map inventories. The initial selections overlap and are
not added to the fresh total. See the [verification record](evidence/player-reference-acceptance-2026-11-20/evidence-verification.json)
and [evidence README](evidence/player-reference-acceptance-2026-11-20/README.md).

All runtime output remained outside the checkout until process completion and
after-source snapshots. Final files were copied byte-for-byte afterward. Only
this owned report/evidence directory changes in the handoff; no production,
test or smoke bytes change after the run.

Root will hand the completed fresh trio to a distinct audio-diagnosis set with
both failures intact. Issue #72 remains unresolved. #69/AC-6, original Spec 10
requirements, fixed Fleet diagnostic evidence/default-off and unchanged gates
remain. Stored reference/raw evidence, pitch analysis, persistence/report wiring,
scientific and physical qualification remain unfinished. Hosted rendered UI,
native/platform and release gates are separate; no release/deployment follows
from these results. No rerun remains queued in this acceptance lane.
