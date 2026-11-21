# Reference identity and PDF axes — fresh code/spec acceptance

Reviewer: `/root/reference_code_fresh`. Review date: 20 November 2026,
America/Los_Angeles. This review began after all three initial workers completed.
Only this report is authored by this lane.

## Disposition

**Accepted for the bounded reference/PDF code/spec scope at
`ded34d2dccfcf0ae51c78fa1492a57c161d32a1d`, tree
`9030b4d9eeb307f27c0d794dccf4a37895c2a602`. No new blocking finding was identified
in that scope. Complete-suite qualification remains on hold.** Root reported
that the separate fresh full run, still in progress at that communication,
contains the repeated cubic THD failure and an audio-runner retry measurement
assertion failure. This static acceptance neither resolves nor supersedes those
runtime outcomes. No shared cause or audio repair is inferred.

I read the [initial handoff](PLAYER_REFERENCE_INITIAL_HANDOFF_2026-11-20.md),
[contract](PLAYER_REFERENCE_IMPLEMENTATION_2026-11-20.md), and completed initial
[code](PLAYER_REFERENCE_CODE_AUDIT_2026-11-20.md),
[functional](PLAYER_REFERENCE_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](PLAYER_REFERENCE_SECURITY_AUDIT_2026-11-20.md) reports. I independently
inspected actual production, dependencies, maintained tests and both changed
smokes. Methods were source/Git inspection, arithmetic reasoning, JSON/TAP
reading and byte/hash comparison. No project runtime, browser, native build,
generator, benchmark, scanner or probe ran in this lane. The fresh functional
worker alone owns the current full-suite execution and its complete evidence.

## Exact source and evidence binding

| Role | Commit | Tree |
| --- | --- | --- |
| Reviewed freeze | `ded34d2dccfcf0ae51c78fa1492a57c161d32a1d` | `9030b4d9eeb307f27c0d794dccf4a37895c2a602` |
| Corrected production | `447019568d6a0cc0ce0fe16412e9ac99c204f604` | `81807e58e03c6dd51740ef469e2c2450b20d5784` |
| Maintained tests/smokes | `dd11f41dc41e102ddd8bf7f34e87153afa994f59` | `d6272a78da9791fc40cb0cdeff238cb68d979c5f` |
| Original PDF candidate | `5cc916eefbeb3e174edf9bdbcd6c731d6776e56d` | `f0c06c626acc477a2191f23653b7d42a37cbba8b` |

The worktree started clean at the assigned freeze. Its app/native/database/
workflow/package paths match corrected `4470195`; all tests/tools match
`dd11f41`. Compared with prior accepted player source `f081881`, runtime changes
are exactly four paths. Their working bytes match immutable corrected blobs:

| Path | Independently computed SHA-256 |
| --- | --- |
| `app/player/reference-file.js` | `d20d1f245e3c446d4e1641fee8503d1e50a3fa4620c238395ae4623e936e6889` |
| `app/ui/screens/player-capture.js` | `2bcec279d3099217570d66ee81006e30b414647e77b07651b21448e21ae7af3e` |
| `app/styles/player-capture.css` | `69c19c4e58fc5853d257c80a6ba2b6681b278ccdf339c305dba9fb8de496e2cc` |
| `app/report-pdf.js` | `84a269d9fc4e6dff067c25006fa4805ffb8ae30e434919d5d2010f1b21bc69a2` |

Original candidate `5cc916e` and published player consolidation `78403038` remain
ancestors. I also independently checked the locally fetched durable equivalent
`b8bf6ea10791b05a2188d176ae8b996528a10f08`: its entire tree equals this freeze and
its ordered parents are `78403038c530a981b732d5ac0210539edf37fc77` then
`5cc916eefbeb3e174edf9bdbcd6c731d6776e56d`. Remote branch readback belongs to root.
All three initial reports match their original commit blobs and reported hashes.

## Reference helper and actual consumer

The [helper](../../app/player/reference-file.js) snapshots name/size before
awaiting, accepts a nonempty safe byte length up to 32 MiB, requires a nonblank
filename bounded to 240 UTF-16 code units without C0/DEL controls, and verifies
the returned ArrayBuffer's exact length. It hashes those bytes through the
unchanged [SHA helper](../../app/sha256.js), returning frozen primitive metadata
only. No File or buffer enters that descriptor. The audio chooser filter is
convenience; it does not validate content, tone frequency or playback.

| Boundary in the real [screen](../../app/ui/screens/player-capture.js) | Independent conclusion |
| --- | --- |
| Picker delivery | Snapshot and input-value clearing precede the hidden/disposed/busy guard, resolving the initial refused-delivery FileList retention finding. |
| Ownership | One task/AbortController owns a read. Controls and handlers refuse another accepted read or capture while pending; logical cancellation retains busy ownership until settlement. |
| Obsolete result | Publication requires task identity, unaborted signal, visibility and an undisposed owner. Hide/show cannot reactivate a cancelled request; failed new selection cannot restore the former reference. |
| Capture/result lifetime | Selecting or clearing discards previous capture metadata. Capture blocks reference changes and snapshots the completed immutable descriptor before awaiting. |
| Provenance | The same selected digest enters the existing record field and exported descriptor. An operator label takes precedence over filename fallback, while the descriptor preserves the selected filename. |
| Export/meaning | JSON explicitly contains acquisition, record and selectedReference (null without a file), with no File, buffer or waveform. Text rendering and generated UUID download naming remain. Played identity stays Not verified. |

The unchanged [controller](../../app/player/acquisition.js) normalizes source
before its first await and deep-freezes the record. The [constructor](../../app/player/evidence-record.js)
still yields unverified, report-ineligible, measurement-null records. A known
hash removes a missing-field reason only; independent reference/method validation,
version/frequency, analysis and uncertainty remain unresolved.

Cancellation is checked before read and after both awaits. It suppresses
publication without physically aborting or erasing an ongoing read/hash; local
bytes can survive until settlement. The existing synchronous hash fallback also
means the input cap is not a responsiveness or whole-process memory guarantee.
The documented scope makes no such claims. Existing form/settings persistence
and previous downloads remain separate from cleared result references.

The actual [shell](../../app/ui/shell.js) calls hide on navigation and feature
disablement. Player capture/Fleet stay default-off in the unchanged
[registry](../../app/features.js). Native availability, pair/duration bounds and
owned capture leases remain. No native command, permission, dependency, migration
or workflow changes are present.

## PDF correction

I independently traced `niceTicks`, both projections and `chartsHtml` in the
[PDF source](../../app/report-pdf.js). Finite input endpoints near -8e307/+8e307
can round to -1e308/+1e308 with an infinite difference. The corrected source
checks a finite positive final span before generating ticks/SVG. Both axes use
that guard; finite point filtering and fixed finite drawing dimensions remain.
Calculation errors reach the existing escaped visible Chart unavailable
placeholder and warning. Stored measurements, chart data, normal tick selection,
thresholds and print CSS are unchanged.

The initial gap is resolved in the reviewed source. This is not general
extreme-axis accuracy or readability acceptance: pre-existing twelve-digit tick
cleanup can coalesce nearby ticks at large offsets. That separate limitation is
retained without an unsupported repair or universal-precision claim.

## Maintained tests and retained results

I inspected all five maintained test/smoke changes. Ten [helper cases](../../tests/player-reference-file.test.mjs)
use actual Node File objects, known/independent digests, exact byte-limit
acceptance, validation/read failures, cancellation before/during read/digest,
immutable output and pre-await snapshots. Thirty [screen cases](../../tests/player-capture-screen.test.mjs)
retain the original sixteen assertions and add label/null export behavior, busy
guards, capture snapshots, clear/hide/real-shell feature disable/disposal,
obsolete completion, input-value clearing and prior-result removal. DOM/native
boundaries are modeled; they do not prove real FileList clearing or layout.

[PDF cases](../../tests/report-pdf.test.mjs) preserve original overflow/underflow
checks and add rounded X/Y span rejection, visible fallback and finite output
for representable normal/tiny/large charts. The [player smoke](../../tools/smoke/player-capture.mjs)
authors real File selection/FileList cleanup, exact digest, local download and
layout checks; its abc fixture is explicitly identity-only. The [PDF smoke](../../tools/smoke/pdf.mjs)
authors visible print placeholders beside a normal SVG, geometry/font checks
and future PNG/PDF artifacts using cached print CSS. These are inspected
assertions, not browser/print results from this lane.

I verified all **24 evidence-ledger entries**, complete TAP counts/lengths/hashes,
recorded source/tree identities and all four before/after map pairs. Unrelated
historical blob inventories were not repeated merely to add activity.

| Initial functional execution | Verified retained result | Bound source |
| --- | --- | --- |
| Original PDF test file | 28/28, exit 0; 5,758 bytes; 1,655 equal-map entries | `5cc916e` |
| Eight-file corrected selection | 132/132, exit 0; 29,628 bytes; 1,908 equal-map entries | `dd11f41` |
| Both smoke syntax checks | Each exit 0, empty output; 1,908 equal-map entries | `dd11f41`; parsing only |

All used Node v24.22.3. These overlapping selections are not additive. Combined
TAP SHA-256 is `95abf54baa565c395efb52d761339810e1f69f02eecd180a516190844d7325cc`;
original PDF TAP SHA-256 is `3d3fd808003cc8c31e28adf0049538e176a013f89ae06f7eacc6f14213b3b3c5`.
The complete [evidence folder](evidence/player-reference-functional-2026-11-20/README.md)
retains commands and limits. These focused passes cannot override a failing
fresh full-suite outcome; root must preserve the complete current result.

## Remaining qualification

The original audio-failure TAP still has 530,581 bytes and SHA-256
`39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197`.
Issue #72 remains unexplained; later passes establish no cause or repair. The
earlier three-file diagnostic does not establish original predecessor order.
The current full-run failures are a separate qualification hold, not evidence
that this source review repaired or qualified audio behavior.

Spec 10's implementation note now describes this successor, while its original
requirements from the date marker onward are unchanged. The complete Spec 02
diagnostics requirement is unchanged; #69/AC-6 remain open. The retained
[PR74 proof](evidence/player-reference-integration-2026-11-20/pr74-publication.json)
matches local immutable objects for head `78403038`, tested merge `62457f03`, tree `5986c675`
and ordered parents. This is earlier publication identity, not current CI status
or qualification of this newer source. No remote mutation occurred.

The local Chromium restriction was not retried. No page, screenshot, download,
print PDF or native build was produced here. Actual hosted UI/native/platform,
scientific and physical gates remain separate. Reference/raw retention, pitch
integration and History/report persistence remain unfinished. Fleet's fixed
diagnostic/default-off state, original failures and thresholds remain. Rebind
this acceptance if relevant production or maintained tests/smokes change.
