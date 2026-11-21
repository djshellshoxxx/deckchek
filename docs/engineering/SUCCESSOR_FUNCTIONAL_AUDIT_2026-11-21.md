# Combined successor — fresh functional audit

Reviewer: `/root/successor_functional_round4`. Date: 21 November 2026,
America/Los_Angeles. All three fit round-three workers completed before this
fresh trio began. This lane was the sole local project executor.

## Disposition

The **first complete serial top-level Node test gate on this frozen successor
passed: 2,359 total / 2,358 pass / 0 fail / 1 optional skip**. It exercised all
193 actual `tests/*.test.mjs` files without changing source, assertions,
thresholds or skips. All **2,125 tracked hashes**, HEAD, complete tree and clean
working-tree state were unchanged. No timeout or stderr occurred.

This establishes a passing Node gate for the combined reference/PDF/UI/preset
source below. It does not establish a cause or repair for the earlier numerical
failures. Those original results remain intact. This lane performed no second
test selection, numeric diagnostic, engine-switch comparison, browser/native
attempt or rerun. Root retains responsibility for source-bound hosted rendering,
other applicable CI gates, integration and any merge decision.

## Exact source and invocation

| Item | Observed identity |
| --- | --- |
| Frozen commit | `fb81960b417ad16c155b7793814cbb4a7545d41e` |
| Complete tree | `724274fae453a867e4adf5009deef7b0cf4b190c` |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-successor-functional` |
| Branch | `review/deckchek-successor-functional-20261121` |
| Runtime | Node v24.22.3, Linux x64; complete component versions retained |
| Executable | `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` |
| Python recorder | Python 3.12.14; standard library only |
| Started, UTC | `2026-11-21T08:33:54.779435+00:00` |
| Completed record, UTC | `2026-11-21T08:39:58.547685+00:00` |
| Child execution elapsed | `363.4952177060004` seconds |
| Budget | 600 seconds; TERM at 595 seconds, KILL by 600 if necessary |
| Exit / timeout | 0 / false |

The test inventory is the sorted, actual top-level file set, matched against
tracked Git paths before execution. The invocation used the absolute executable
with `--test --test-concurrency=1 --test-reporter=tap`, followed by those 193
explicit paths. No shell wildcard was left for the child to expand. The complete
argv is retained in [result.json](evidence/successor-functional-2026-11-21/result.json)
and the file set in [test-files.json](evidence/successor-functional-2026-11-21/test-files.json).

`NODE_OPTIONS`, `DECKCHEK_AUDIO_CONTEXT_PATH` and every `DECKCHEK_AUDIO_FIT_*`
variable were required to be absent. The only environment adjustment was
prefixing PATH with the same absolute Node directory for any existing test
subprocesses. No diagnostic collector or additional engine/optimization switch
was enabled. The recorded parent argv is not a claim about unobserved child
argument expansion. Runtime version/component queries were metadata-only;
the one full test invocation was the only project execution launched by this
lane.

The external recorder and raw output directory were outside the checkout.
`running.json`, exact argv, test inventory and all before hashes were saved
before the test process started. The first stdout/stderr were written directly
to files. Complete after hashes, HEAD/tree and clean status were recorded before
any evidence or report was copied into this worktree. The recorder refuses to
reuse an existing output directory, preventing an accidental overwrite/rerun.

## Complete result and selected assertions

| Result | Count |
| --- | ---: |
| Test cases | 2,359 |
| Pass | 2,358 |
| Fail | 0 |
| Cancelled | 0 |
| Skipped | 1 |
| TODO | 0 |

The TAP contains all 2,359 sequential top-level outcomes, the plan `1..2359`
and the matching summary. The one skip is the existing optional Mixxx controller
corpus robustness case: `MIXXX_CONTROLLERS_DIR not set`. No skip was introduced
or changed for this observation.

The complete selection includes the new selected-file identity, player lifecycle,
PDF representability and preset-boundary files, plus the pre-existing regression
suite. Its passing assertions exercise bounded file size/name/read validation,
exact file hashing, cancellation before/during read/digest, stale picker and
capture ownership, metadata-only export, privacy defaults/overrides, and the
visible PDF fallback for an unrepresentable axis. Existing assertions continue
to distinguish unverified acquisition metadata from qualified measurements.

The retained [observed summary](evidence/successor-functional-2026-11-21/observed-summary.json)
identifies these representative outcomes directly from the complete TAP:

| TAP case | Original assertion name | Outcome |
| ---: | --- | --- |
| 22 | harmonic distortion is measured (cubic nonlinearity) and chain floor is subtracted | Pass |
| 68 | bug 6: a failed attempt releases its capture, so an immediate retry records and analyses | Pass |
| 805 | preset names accept declared strings and use complete Public defaults for other values | Pass |
| 806 | restored invalid preset rules stay editable and explicit Custom overrides keep their meaning | Pass |
| 1435 | a real selected File produces the exact known SHA-256 and only immutable metadata | Pass |
| 1570 | finite but unrepresentable chart axes fail closed with a visible PDF warning | Pass |

These are entries within the full total, not additional tests. The earlier
82-case focused selection and 33-case instrumented trace are separate,
overlapping evidence; their counts are not added to this gate. The current TAP
records the original numerical assertions passing but exposes no new raw fit
fields or measured numeric values from those passing cases.

## Static functional review and preserved failures

I inspected the current changed product/test paths against qualified main
`77c26f44710c6dfb1c986fb79266c233e2ae688c`, including the reference-file helper,
player ownership paths, preset normalization, PDF guard and authored browser
smoke. The source preserves the documented limits: the file hash identifies
bytes, not audio content or playback; cancellation suppresses publication and
does not physically abort/erase an in-flight read; the player export remains
provisional metadata; preset fallback retains valid explicit/Custom overrides;
and unrepresentable chart axes produce a visible fallback. No additional source
correction was made by this lane.

The read-only [source comparison](evidence/successor-functional-2026-11-21/source-comparison.json)
records 16 Git-blob-derived SHA-256 hashes across qualified main, the earlier
failed full reference source `ded34d2`, the failed aggregate source `f26c247`
and this freeze. Production `app/audio-quality.js`, `app/calibration.js` and
`tests/audio-quality.test.mjs` are byte-identical across all four. The current
runner test matches the failed `f26c247` source, including its earlier optional
collector and assertion-message additions; the collector is disabled here.
These static equalities do not establish a numerical cause.

The earlier [reference/PDF full gate](PLAYER_REFERENCE_CONTINUATION_2026-11-20.md)
remains 2,357 total / 2,354 pass / 2 fail / 1 optional skip at its own source.
The [aggregate observation](AUDIO_CONTEXT_FUNCTIONAL_AUDIT_2026-11-20.md) remains
33 total / 31 pass / 2 fail, with the original huge cubic value and retry
measurement verdict preserved. The later [fit trace](FIT_AND_UI_FUNCTIONAL_AUDIT_2026-11-20.md)
passed under instrumentation and did not capture a failing raw fit. This current
complete pass does not overwrite those results, establish what happened in
their unobserved intervals, or justify closing issue #72 as repaired.

## Remaining qualification boundaries

This run covers the complete **top-level Node selection**, not every CI action.
The separate `tests/perf/*.test.mjs` gate, build/check tooling, actual rendered
toolbar/player/PDF smoke, native Rust/platform validation and physical audio/MIDI
qualification were not executed here. The authored responsive browser checks
still need actual new-source rendering. Prior PR #74 screenshots and native
gates belong to their original source and do not qualify this later UI.

No local Chromium retry/workaround followed the earlier socket denial. No
physical capture, retained-waveform qualification, persistence/report completion,
feature-default change, native permission expansion, threshold weakening,
release or deployment is claimed. Issues #69/AC-6 and the fixed Fleet diagnostic
retain their existing limits. Root's separate inventory/history #76/#77 work is
outside this frozen source and cannot borrow this result.

I shared the stable first result, complete maps, argv and source comparison with
both fresh static reviewers before packaging. Each independently confirmed the
complete file/hash relationships and TAP outcome. Their independent reports
remain separate handoffs for root to integrate.

## Retained evidence and completed handoff

All current evidence is under
[evidence/successor-functional-2026-11-21](evidence/successor-functional-2026-11-21).
The [manifest](evidence/successor-functional-2026-11-21/manifest.json) binds
12 files. Its SHA-256 is
`cf20f0b6ef503a90f38a4a6e9187a3b50bb2bd59fa80dd5a3127a2af316cf47c`.
The retention proof binds nine artifacts/recorder files copied byte-for-byte
from their original external paths. No raw output was normalized or replaced.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Complete first TAP](evidence/successor-functional-2026-11-21/run.tap) | 540,148 | `102009e4ba4133f6d90dee363e928458595de332183fe7cf32b43cd8a221c962` |
| [Execution record](evidence/successor-functional-2026-11-21/result.json) | 10,517 | `7ad509925d87148b994a0d43581e999bd37d5ad783b9cd0621ed1f89807ae310` |
| [Empty stderr](evidence/successor-functional-2026-11-21/stderr.log) | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The retained verifier reads metadata and bytes only; it imports no project
module and runs no tests or numerical implementation. It passed all 12 manifest
entries, nine retained-file digests, 2,125 equal map entries, 193-file coverage,
source/argv identities and complete TAP summary consistency.

This lane changes only this report and its evidence directory. All runtime work
is complete. There is no further project invocation, diagnostic, production edit
or rerun pending. Root owns the source-specific publication/merge decision and
the next fresh handoff after all three current workers finish.
